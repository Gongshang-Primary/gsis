import {
  canonical,
  query,
  one,
  prepareOperation,
  commitOperation,
} from "../../runtime/store.mjs";
import { drainOutbox } from "../../runtime/jobs.mjs";
import { serviceCall } from "../../runtime/security.mjs";
import { dispatchProvider } from "../../runtime/providers.mjs";
import { notificationIntent } from "./service.mjs";
import { sgDay, nextReferenceRefresh, notificationJobs, reminderPhase, reminderEligibility, remindersEnabled } from "./model.mjs";

const write = (sql, args = []) => ({ sql, args });
async function systemCommit(
  env,
  { operationId, intent, guards = [], writes = [], outbox = [], result },
  now,
) {
  const op = await prepareOperation(env.DB, {
    schoolId: env.SCHOOL_ID,
    actorId: "system-lord",
    operationId,
    action: "internal.lord.scheduled",
    intent,
    now,
    validUntil: now + 30000,
  });
  if (op.state === "committed") return op.receipt;
  return commitOperation(env.DB, op, {
    now,
    guards,
    writes,
    outbox: notificationJobs(outbox),
    result,
    audit: { domain: "lord", system: true },
    admission: { kind: "system", reason: "LORD owner scheduled obligations" },
  });
}
/** Administrative closure deliberately leaves physical custody and returned counts unchanged. */
export async function closeOverdueSessions(env, now) {
  const date = sgDay(now),
    hour = new Date(now + 8 * 3600000).getUTCHours();
  if (hour < 18) return { state: "not-due" };
  const rows = await query(
      env.DB,
      "SELECT * FROM lord_bookings WHERE school_id=? AND status='COLLECTED' AND service_date<=? ORDER BY service_date,booking_id LIMIT 100",
      [env.SCHOOL_ID, date],
    ),
    results = [];
  for (const b of rows) {
    const operationId = `close:${b.booking_id}:${b.revision}`,
      details = {
        ...JSON.parse(b.details_json),
        administrativeClose: {
          at: now,
          basis: "daily-18:00",
          physicalReturnConfirmed: false,
        },
      };
    try {
      results.push(
        await systemCommit(
          env,
          {
            operationId,
            intent: { bookingId: b.booking_id, revision: b.revision, date },
            guards: [
              write(
                "SELECT status='COLLECTED' AND revision=? AS ok FROM lord_bookings WHERE school_id=? AND booking_id=?",
                [b.revision, b.school_id, b.booking_id],
              ),
            ],
            writes: [
              write(
                "UPDATE lord_bookings SET status='CLOSED',revision=revision+1,details_json=?,updated_at=? WHERE school_id=? AND booking_id=?",
                [canonical(details), now, b.school_id, b.booking_id],
              ),
              write(
                "INSERT INTO lord_incidents(school_id,incident_id,booking_id,staff_id,status,revision,details_json,created_at) VALUES(?,?,?,?,'open',1,?,?)",
                [
                  b.school_id,
                  "custody:" + b.booking_id,
                  b.booking_id,
                  b.staff_id,
                  canonical({
                    kind: "unconfirmed-custody",
                    physicalReturnConfirmed: false,
                  }),
                  now,
                ],
              ),
            ],
            outbox: [
              {
                id: `lord:${b.booking_id}:force-close`,
                type: "lord.booking-notification",
                dueAt: now,
                payload: {
                  schoolId: b.school_id,
                  bookingId: b.booking_id,
                  staffId: b.staff_id,
                  revision: b.revision + 1,
                  kind: "administrative-close",
                },
              },
            ],
            result: {
              bookingId: b.booking_id,
              status: "CLOSED",
              physicalReturnConfirmed: false,
            },
          },
          now,
        ),
      );
    } catch (e) {
      results.push({
        bookingId: b.booking_id,
        state: "pending",
        code: e.code || "COMMIT_UNCONFIRMED",
      });
    }
  }
  return { state: "complete", bounded: true, results };
}
export async function enqueueReminders(env, now) {
  const dates = [...new Set([sgDay(now), sgDay(now + 5 * 60000)])];
  const [timings, setting] = await Promise.all([
    one(env.DB, "SELECT revision,value_json FROM lord_settings WHERE school_id=? AND setting_key='periodTimings'", [env.SCHOOL_ID]),
    one(env.DB, "SELECT revision,value_json FROM lord_settings WHERE school_id=? AND setting_key='reminders'", [env.SCHOOL_ID]),
  ]);
  if (!timings) return { state: "blocked", code: "PERIOD_TIMINGS_REQUIRED" };
  const settings = setting ? JSON.parse(setting.value_json) : {};
  if (!remindersEnabled(settings)) return { state: "disabled", results: [] };
  const periods = JSON.parse(timings.value_json).periods, windows = [];
  for (const date of dates) for (const p of periods) for (const phase of ["collection", "return"]) {
    const candidate = { service_date: date, start_period: Number(p.code),
      end_period: Number(p.code) + 1, status: phase === "collection" ? "BOOKED" : "COLLECTED" };
    const rule = reminderEligibility(candidate, phase, periods, settings, now, 1);
    if (rule.state === "ready") windows.push({ date, phase, code: Number(p.code), window: rule.window.key });
  }
  if (!windows.length) return { state: "complete", results: [] };
  const phaseSql = `CASE WHEN json_extract(o.payload_json,'$.kind')='collection-reminder' THEN 'collection'
    WHEN o.type='lord.return-reminder' OR json_extract(o.payload_json,'$.kind') IN('reminder','overdue') OR json_extract(o.payload_json,'$.reminderPhase')='return' THEN 'return' END`;
  const rootSql = "'lord:'||b.booking_id||':'||json_extract(w.value,'$.phase')||'-reminder:'||b.revision||':settings:'||?||':timings:'||?";
  const remainingSql = `COALESCE((SELECT SUM(i.collected_quantity-i.returned_quantity) FROM lord_booking_items i WHERE i.school_id=b.school_id AND i.booking_id=b.booking_id),0)
    +COALESCE((SELECT SUM(a.collected_quantity-a.returned_quantity) FROM lord_accessories a WHERE a.school_id=b.school_id AND a.booking_id=b.booking_id),0)`;
  // Filter due windows and existing work before LIMIT, so non-due bookings or
  // already-notified prefixes cannot starve another eligible booking.
  const rows = await query(env.DB, `SELECT b.*,json_extract(w.value,'$.phase') AS reminder_phase,
      json_extract(w.value,'$.window') AS reminder_window,(${remainingSql}) AS reminder_remaining
    FROM lord_bookings b JOIN json_each(?) w ON
      (json_extract(w.value,'$.phase')='collection' AND b.status='BOOKED' AND b.start_period=json_extract(w.value,'$.code')) OR
      (json_extract(w.value,'$.phase')='return' AND b.status='COLLECTED' AND b.end_period-1=json_extract(w.value,'$.code'))
    WHERE b.school_id=? AND b.service_date=json_extract(w.value,'$.date') AND (b.status='BOOKED' OR (${remainingSql})>0)
      AND NOT EXISTS(SELECT 1 FROM product_outbox o WHERE o.school_id=b.school_id
        AND json_extract(o.payload_json,'$.bookingId')=b.booking_id AND (${phaseSql})=json_extract(w.value,'$.phase')
        AND (o.job_id=(${rootSql})||':email' OR o.job_id=(${rootSql})||':whatsapp'
          OR (o.state IN('queued','leased','accepted','delivered','uncertain') AND
            (json_extract(o.payload_json,'$.reminderWindow')=json_extract(w.value,'$.window') OR
              (json_extract(o.payload_json,'$.reminderWindow') IS NULL AND (o.state<>'queued' OR o.due_at<=?))))))
    ORDER BY b.booking_id LIMIT 100`,
    [canonical(windows), env.SCHOOL_ID, setting?.revision || 0, timings.revision, setting?.revision || 0, timings.revision, now]);
  const results = [];
  for (const b of rows) {
    const phase = b.reminder_phase, kind = phase === "collection" ? "collection-reminder" : "reminder";
    const rule = reminderEligibility(b, phase, periods, settings, now, b.reminder_remaining);
    if (rule.state !== "ready") continue;
    const jobId = `lord:${b.booking_id}:${phase}-reminder:${b.revision}:settings:${setting?.revision || 0}:timings:${timings.revision}`;
    try {
      results.push(
        await systemCommit(
          env,
          {
            operationId:
              "schedule:" + jobId,
            intent: { bookingId: b.booking_id, kind, revision: b.revision,
              reminderWindow: rule.window.key, settingRevision: setting?.revision || 0 },
            guards: [
              write(
                "SELECT status=? AND revision=? AS ok FROM lord_bookings WHERE school_id=? AND booking_id=?",
                [b.status, b.revision, b.school_id, b.booking_id],
              ),
              write("SELECT revision=? AS ok FROM lord_settings WHERE school_id=? AND setting_key='periodTimings'", [timings.revision, env.SCHOOL_ID]),
              write("SELECT COALESCE((SELECT revision FROM lord_settings WHERE school_id=? AND setting_key='reminders'),0)=? AS ok", [env.SCHOOL_ID, setting?.revision || 0]),
            ],
            outbox: [
              {
                id: jobId,
                type: phase === "return" ? "lord.return-reminder" : "lord.booking-notification",
                dueAt: now,
                payload: {
                  schoolId: b.school_id,
                  bookingId: b.booking_id,
                  staffId: b.staff_id,
                  revision: b.revision,
                  kind,
                  reminderPhase: phase,
                  reminderWindow: rule.window.key,
                },
              },
            ],
            result: { jobId },
          },
          now,
        ),
      );
    } catch (e) {
      results.push({
        jobId,
        state: "pending",
        code: e.code || "COMMIT_UNCONFIRMED",
      });
    }
  }
  return { state: "complete", results };
}
async function dispatchNotification(job, env) {
  const now = Date.now();
  const payload = { ...job.payload,
    ...(reminderPhase(job.payload, job.type) ? { reminderPhase: reminderPhase(job.payload, job.type) } : {}) };
  let intent = await notificationIntent(env, payload, now);
  if (intent.reason === "REFERENCE_REFRESH_REQUIRED") {
    const refresh = await one(
      env.DB,
      "SELECT * FROM product_outbox WHERE school_id=? AND type='lord.reference-refresh' ORDER BY due_at DESC LIMIT 1",
      [job.school_id],
    );
    if (refresh) {
      try {
        await refreshReferenceJob(
          { ...refresh, payload: JSON.parse(refresh.payload_json) },
          env,
        );
        intent = await notificationIntent(env, payload, Date.now());
      } catch {}
    }
  }
  if (intent.state === "suppressed")
    return { state: "cancelled", code: intent.reason };
  if (intent.state !== "ready")
    return { state: "failed", code: intent.reason, retryable: true };
  const audit = await one(
    env.DB,
    "SELECT decision_id FROM product_audit WHERE school_id=? AND operation_id=?",
    [job.school_id, job.operation_id],
  );
  // Scheduled jobs inherit the last actual user-authorized booking decision; never manufacture an actor.
  let decisionId = audit?.decision_id;
  if (!decisionId) {
    const original = await one(
      env.DB,
      "SELECT a.decision_id FROM product_outbox o JOIN product_audit a USING(school_id,operation_id) WHERE o.school_id=? AND json_extract(o.payload_json,'$.bookingId')=? AND a.decision_id IS NOT NULL ORDER BY a.recorded_at DESC LIMIT 1",
      [job.school_id, intent.bookingId],
    );
    decisionId = original?.decision_id;
  }
  if (!decisionId)
    return {
      state: "failed",
      code: "AUTHORITY_EVIDENCE_MISSING",
      retryable: false,
    };
  let current;
  try {
    current = await serviceCall(env, "core", "/internal/dispatch-check", {
      schoolId: job.school_id,
      decisionId,
      staffId: intent.staffId,
      purpose: "lord.notification",
    });
  } catch {
    return {
      state: "failed",
      code: "CURRENT_AUTHORITY_UNAVAILABLE",
      retryable: true,
    };
  }
  if (current.allowed !== true)
    return { state: "cancelled", code: "AUTHORITY_REVOKED" };
  let recipient;
  try {
    const projection = await serviceCall(
      env,
      "contacts",
      "/internal/projection",
      {
        schoolId: job.school_id,
        decisionId: current.decisionId,
        purpose: "lord.notification",
        staffIds: [intent.staffId],
      },
    );
    recipient = projection.staff?.find((p) => p.staffId === intent.staffId);
    if (
      projection.schoolId !== job.school_id ||
      !recipient ||
      recipient.active !== true
    )
      return { state: "cancelled", code: "RECIPIENT_NOT_ACTIVE" };
  } catch {
    return {
      state: "failed",
      code: "RECIPIENT_CURRENT_UNAVAILABLE",
      retryable: true,
    };
  }
  const preferences = await one(
    env.DB,
    "SELECT * FROM lord_preferences WHERE school_id=? AND staff_id=?",
    [job.school_id, intent.staffId],
  );
  const schoolAgreement = env.LORD_SCHOOL_WHATSAPP_AGREEMENT === "true";
  if (!preferences && !schoolAgreement)
    return { state: "cancelled", code: "CONSENT_REVOKED" };
  intent.recipient = {
    email: preferences?.email !== 0 ? recipient.email : null,
    mobile: schoolAgreement || preferences?.whatsapp ? recipient.mobile : null,
  };
  const latest = await notificationIntent(env, payload, Date.now());
  if (latest.state !== "ready")
    return {
      state: latest.state === "suppressed" ? "cancelled" : "failed",
      code: latest.reason,
      retryable: latest.state !== "suppressed",
    };
  const settings = await one(
      env.DB,
      "SELECT value_json FROM lord_settings WHERE school_id=? AND setting_key='notificationTemplates'",
      [job.school_id],
    ),
    templates = settings ? JSON.parse(settings.value_json) : {};
  // Channel-specific outbox identity is retained; do not send two providers under one receipt.
  const channel = job.payload.channel || "email";
  if (channel === "email") {
    if (!intent.recipient.email)
      return { state: "cancelled", code: "EMAIL_NOT_PERMITTED" };
    return dispatchProvider(env, {
      provider: "email",
      to: intent.recipient.email,
      subject: "LORD " + intent.kind,
      text: `Booking ${intent.bookingId}: ${intent.kind}. Open GSiS LORD to review the current booking.`,
      idempotencyKey: job.job_id,
    });
  }
  if (channel === "whatsapp") {
    if (!intent.recipient.mobile)
      return { state: "cancelled", code: "WHATSAPP_NOT_PERMITTED" };
    const configured = templates[intent.kind];
    if (!configured?.name)
      return {
        state: "failed",
        code: "APPROVED_TEMPLATE_REQUIRED",
        retryable: false,
      };
    const booking = await one(
        env.DB,
        "SELECT * FROM lord_bookings WHERE school_id=? AND booking_id=?",
        [job.school_id, intent.bookingId],
      ),
      details = JSON.parse(booking.details_json),
      resources = await query(
        env.DB,
        "SELECT r.name,i.quantity FROM lord_booking_items i JOIN lord_resources r USING(school_id,resource_id) WHERE i.school_id=? AND i.booking_id=?",
        [job.school_id, intent.bookingId],
      ),
      values = {
        teacher: recipient.name || "",
        resource: resources.map((r) => r.name).join(", "),
        quantity: resources.reduce((n, r) => n + r.quantity, 0),
        date: booking.service_date,
        startPeriod: booking.start_period,
        endPeriod: booking.end_period - 1,
        classOrActivity: details.classOrActivity,
        subject: details.subject,
        bookingId: intent.bookingId,
      };
    const { parameters, ...template } = configured;
    if (parameters?.length)
      template.components = [
        {
          type: "body",
          parameters: parameters.map((key) => ({
            type: "text",
            text: String(values[key] ?? ""),
          })),
        },
      ];
    return dispatchProvider(env, {
      provider: "whatsapp",
      to: intent.recipient.mobile,
      template,
    });
  }
  return { state: "failed", code: "CHANNEL_UNSUPPORTED", retryable: false };
}
export async function scheduled({ env, now = Date.now() }) {
  if (env.SCHEDULER_OWNER !== "v1")
    return { state: "inactive", reason: "V0_9_RETAINS_SCHEDULER_OWNERSHIP" };
  const closure = await closeOverdueSessions(env, now),
    reminders = await enqueueReminders(env, now),
    monitor = await enqueueMonitor(env, now);
  const notifications = await drainOutbox(env.DB, env, {
    schoolId: env.SCHOOL_ID,
    now,
    limit: 10,
    handlers: {
      "lord.booking-notification": dispatchNotification,
      "lord.return-reminder": dispatchNotification,
      "lord.reference-refresh": refreshReferenceJob,
      "lord.monitor": dispatchMonitor,
    },
  });
  const reference = await one(
    env.DB,
    "SELECT observed_at,next_refresh_at FROM lord_reference_state WHERE school_id=?",
    [env.SCHOOL_ID],
  );
  return {
    closure,
    reminders,
    monitor,
    notifications,
    referenceRefresh: {
      due: !reference || reference.next_refresh_at <= now,
      needsVerifiedOwnerRefresh: !reference || reference.next_refresh_at <= now,
    },
  };
}

async function refreshReferenceJob(job, env) {
  const now = Date.now(),
    originalDecisionId = job.payload.originalDecisionId;
  const current = await serviceCall(env, "core", "/internal/dispatch-check", {
    schoolId: job.school_id,
    decisionId: originalDecisionId,
    purpose: "lord.references",
  });
  if (current.allowed !== true)
    return {
      state: "failed",
      code: "REFERENCE_REFRESH_AUTHORITY_REVOKED",
      retryable: false,
    };
  const data = await serviceCall(env, "contacts", "/internal/projection", {
    schoolId: job.school_id,
    decisionId: current.decisionId,
    purpose: "lord",
  });
  if (
    data.schoolId !== job.school_id ||
    !Array.isArray(data.staff) ||
    data.staff.length > 512 ||
    !Number.isSafeInteger(data.asOf) ||
    data.asOf > now + 10000 ||
    typeof data.revision !== "string"
  )
    return { state: "failed", code: "REFERENCE_INVALID", retryable: false };
  const old = await one(
      env.DB,
      "SELECT * FROM lord_reference_state WHERE school_id=?",
      [job.school_id],
    ),
    revision = old?.revision || 0;
  if (old && old.revision > job.payload.referenceRevision)
    return { state: "delivered", providerId: old.contacts_revision };
  const staff = data.staff.filter((p) => p.active === true);
  if (new Set(staff.map((p) => p.staffId)).size !== staff.length)
    return { state: "failed", code: "REFERENCE_DUPLICATE", retryable: false };
  const writes = [
    write("DELETE FROM lord_references WHERE school_id=?", [job.school_id]),
    write(
      "INSERT INTO lord_references(school_id,staff_id,name,email,mobile,source_revision,observed_at) SELECT ?,json_extract(value,'$.staffId'),json_extract(value,'$.name'),json_extract(value,'$.email'),json_extract(value,'$.mobile'),?,? FROM json_each(?)",
      [job.school_id, data.revision, data.asOf, canonical(staff)],
    ),
    write(
      "INSERT INTO lord_reference_state(school_id,revision,observed_at,contacts_revision,deploy_revision,next_refresh_at) VALUES(?,?,?,?,NULL,?) ON CONFLICT(school_id) DO UPDATE SET revision=excluded.revision,observed_at=excluded.observed_at,contacts_revision=excluded.contacts_revision,next_refresh_at=excluded.next_refresh_at",
      [
        job.school_id,
        revision + 1,
        data.asOf,
        data.revision,
        nextReferenceRefresh(now),
      ],
    ),
  ];
  const result = await systemCommit(
    env,
    {
      operationId: "refresh:" + job.job_id,
      intent: { jobId: job.job_id, originalDecisionId },
      guards: [
        write(
          "SELECT COALESCE((SELECT revision FROM lord_reference_state WHERE school_id=?),0)=? AS ok",
          [job.school_id, revision],
        ),
      ],
      writes,
      outbox: [
        {
          id: `lord:reference-refresh:${revision + 1}`,
          type: "lord.reference-refresh",
          dueAt: nextReferenceRefresh(now),
          payload: {
            schoolId: job.school_id,
            originalDecisionId,
            referenceRevision: revision + 1,
          },
        },
      ],
      result: {
        referenceRevision: revision + 1,
        sourceRevision: data.revision,
        asOf: data.asOf,
      },
    },
    now,
  );
  return { state: "delivered", providerId: result.result.sourceRevision };
}

async function enqueueMonitor(env, now) {
  if (!env.LORD_MONITOR_TELEGRAM_CHAT_ID) return { state: "not-configured" };
  const reference = await one(
    env.DB,
    "SELECT payload_json FROM product_outbox WHERE school_id=? AND type='lord.reference-refresh' ORDER BY due_at DESC LIMIT 1",
    [env.SCHOOL_ID],
  );
  if (!reference)
    return { state: "blocked", code: "REFERENCE_REFRESH_AUTHORITY_REQUIRED" };
  const originalDecisionId = JSON.parse(
      reference.payload_json,
    ).originalDecisionId,
    bucket = Math.floor((now + 8 * 3600000) / 3600000),
    jobId = "lord:monitor:" + bucket;
  if (
    await one(
      env.DB,
      "SELECT job_id FROM product_outbox WHERE school_id=? AND job_id=?",
      [env.SCHOOL_ID, jobId],
    )
  )
    return { state: "already-scheduled" };
  await systemCommit(
    env,
    {
      operationId: "monitor:" + bucket,
      intent: { bucket },
      outbox: [
        {
          id: jobId,
          type: "lord.monitor",
          dueAt: now,
          payload: { schoolId: env.SCHOOL_ID, originalDecisionId },
        },
      ],
      result: { jobId },
    },
    now,
  );
  return { state: "scheduled" };
}
async function dispatchMonitor(job, env) {
  let current;
  try {
    current = await serviceCall(env, "core", "/internal/dispatch-check", {
      schoolId: job.school_id,
      decisionId: job.payload.originalDecisionId,
      purpose: "lord.references",
    });
  } catch {
    return {
      state: "failed",
      code: "CURRENT_AUTHORITY_UNAVAILABLE",
      retryable: true,
    };
  }
  if (current.allowed !== true)
    return { state: "cancelled", code: "ADMIN_AUTHORITY_REVOKED" };
  if (!env.LORD_MONITOR_TELEGRAM_CHAT_ID)
    return { state: "cancelled", code: "MONITOR_DISABLED" };
  const rows = await query(
      env.DB,
      "SELECT status,COUNT(*) AS total FROM lord_bookings WHERE school_id=? AND service_date=? GROUP BY status",
      [job.school_id, sgDay(Date.now())],
    ),
    incidents = await one(
      env.DB,
      "SELECT COUNT(*) AS total FROM lord_incidents WHERE school_id=? AND status<>'resolved'",
      [job.school_id],
    );
  return dispatchProvider(env, {
    provider: "telegram",
    chatId: env.LORD_MONITOR_TELEGRAM_CHAT_ID,
    text:
      "LORD " +
      sgDay(Date.now()) +
      "\n" +
      rows.map((r) => r.status + ": " + r.total).join("\n") +
      "\nUnresolved incidents: " +
      incidents.total +
      "\nOpen OVERLORD for the current records.",
  });
}
