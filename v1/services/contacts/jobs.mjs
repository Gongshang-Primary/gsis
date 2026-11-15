import { processContribution } from "./contributions.mjs";
import { ApiError } from "../../runtime/errors.mjs";
import {
  query,
  one,
  statement,
  prepareOperation,
  commitOperation,
} from "../../runtime/store.mjs";
import { drainOutbox } from "../../runtime/jobs.mjs";
import { record, effectiveField, sectionCode } from "./store.mjs";
const BIRTHDAY_FIELDS = new Set([
  "birthday",
  "employmentActive",
  "schoolSection",
  "basicName",
  "ttbName",
]);
export function birthdayIntents(
  schoolId,
  operationId,
  fields,
  now,
  validFrom = now,
  validUntil = null,
) {
  if (!fields.some((f) => BIRTHDAY_FIELDS.has(f))) return [];
  const moments = [
    Math.max(now, validFrom),
    ...(validUntil !== null && validUntil > now ? [validUntil] : []),
  ];
  return moments.map((dueAt, i) => ({
    id: `${operationId}.birthdays.${i}`,
    type: "contacts.birthdays",
    dueAt,
    payload: {
      schemaVersion: 1,
      schoolId,
      sourceOperationId: operationId,
      eventId: `${operationId}.birthdays.${i}`,
    },
  }));
}
/** Named ContactsCalendarProjection binding; not an HTTP/user capability endpoint. */
export async function readCalendarBirthdays(env, now = Date.now()) {
  const rows = await query(
    env.DB,
    "SELECT p.staff_id,p.basic_name,p.revision,f.field,f.revision field_revision,f.state,f.value_json,f.timeline_json,f.valid_from,f.valid_until,f.revoked,(SELECT revision FROM contacts_epoch WHERE school_id=p.school_id) epoch FROM contacts_staff p LEFT JOIN contacts_fields f ON f.school_id=p.school_id AND f.staff_id=p.staff_id AND f.field IN('birthday','employmentActive','schoolSection') WHERE p.school_id=? ORDER BY p.staff_id LIMIT 2053",
    [env.SCHOOL_ID],
  );
  const people = new Map();
  for (const r of rows) {
    if (!people.has(r.staff_id))
      people.set(r.staff_id, {
        staffId: r.staff_id,
        name: r.basic_name,
        revision: r.revision,
        fields: {},
      });
    if (r.field)
      people.get(r.staff_id).fields[r.field] = {
        ...r,
        revision: r.field_revision,
      };
  }
  if (people.size > 512)
    throw new ApiError(
      "PROJECTION_BOUNDS",
      413,
      "Birthday projection exceeds its bound.",
    );
  const staff = [];
  let complete = true;
  for (const p of people.values()) {
    const active = effectiveField(p.fields.employmentActive, now),
      section = sectionCode(effectiveField(p.fields.schoolSection, now));
    if (active === null) {
      complete = false;
      continue;
    }
    if (!active || ["MK", "MKE"].includes(section)) continue;
    if (section === null) {
      complete = false;
      continue;
    }
    const birthday = effectiveField(p.fields.birthday, now);
    staff.push({
      staffId: p.staffId,
      name: p.name,
      active: true,
      birthday: typeof birthday === "string" ? birthday.slice(-5) : null,
      revision: p.revision,
    });
  }
  return {
    schemaVersion: 1,
    source: "contacts",
    schoolId: env.SCHOOL_ID,
    revision: `contacts-${rows[0]?.epoch ?? 0}`,
    asOf: now,
    complete,
    staff,
  };
}
async function dispatchBirthday(job, env) {
  if (!env.CALENDAR_CONTACTS?.reconcileBirthdays)
    return {
      state: "failed",
      code: "CALENDAR_BINDING_REQUIRED",
      retryable: true,
    };
  try {
    const result = await env.CALENDAR_CONTACTS.reconcileBirthdays(job.payload);
    if (result?.state === "committed" || result?.receipt?.state === "committed")
      return {
        state: "accepted",
        providerId: result.operationId ?? result.receipt.operationId,
      };
    return {
      state: "failed",
      code: result?.reason ?? "BIRTHDAY_RECONCILIATION_PENDING",
      retryable: true,
    };
  } catch {
    return { state: "uncertain", code: "BIRTHDAY_RECONCILIATION_UNCONFIRMED" };
  }
}
export async function dispatchContactsJobs({ env, now = Date.now() }) {
  const day = new Date(now).toISOString().slice(0, 10),
    operationId = `birthdays-periodic-${day}`,
    op = await prepareOperation(env.DB, {
      schoolId: env.SCHOOL_ID,
      actorId: "service-contacts",
      operationId,
      action: "internal.birthdays-recovery",
      intent: { day },
      now,
      validUntil: now + 60000,
    });
  if (!op.receipt)
    await commitOperation(env.DB, op, {
      now,
      admission: {
        kind: "system",
        reason: "bounded daily Contacts birthday reconciliation signal",
      },
      writes: [],
      result: { day },
      outbox: birthdayIntents(env.SCHOOL_ID, operationId, ["birthday"], now),
    });
  // The receiver is idempotent on the original event ID, so recovery verifies that identity.
  const uncertain = await query(
    env.DB,
    "SELECT * FROM product_outbox WHERE school_id=? AND type='contacts.birthdays' AND state='uncertain' LIMIT 8",
    [env.SCHOOL_ID],
  );
  for (const job of uncertain) {
    const result = await dispatchBirthday(
      { ...job, payload: JSON.parse(job.payload_json) },
      env,
    );
    if (result.state === "accepted")
      await statement(
        env.DB,
        "UPDATE product_outbox SET state='accepted',provider_id=?,last_code=NULL,updated_at=? WHERE school_id=? AND job_id=? AND state='uncertain' AND fence=?",
        [result.providerId, now, env.SCHOOL_ID, job.job_id, job.fence],
      ).run();
  }
  return drainOutbox(env.DB, env, {
    schoolId: env.SCHOOL_ID,
    now,
    limit: 8,
    handlers: {
      "contacts.birthdays": dispatchBirthday,
      "contacts.contribution": processContribution,
    },
  });
}
