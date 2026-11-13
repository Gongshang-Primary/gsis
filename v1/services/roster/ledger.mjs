import {
  canonical,
  query,
  one,
  prepareOperation,
  commitOperation,
} from "../../runtime/store.mjs";
import { requireValue } from "../../runtime/errors.mjs";
import {
  dateOnly,
  localDate,
  weekOf,
  scopeRevision,
  scopeChange,
} from "./repository.mjs";
const id = (x) =>
  typeof x === "string" && /^[A-Za-z0-9][A-Za-z0-9:_.\/-]{0,127}$/.test(x);
export function dutySnapshot(assignment, date, periods, publicationId) {
  const timing = periods.find((p) => p.period === assignment.period);
  requireValue(
    timing && Number.isInteger(timing.endMinutes),
    "DUTY_TIMING_MISSING",
    409,
  );
  const endAt =
    Date.parse(date + "T00:00:00+08:00") + timing.endMinutes * 60000;
  return {
    dutyId: assignment.serviceDutyId || assignment.id,
    assignmentId: assignment.id,
    staffId: assignment.staffId,
    date,
    period: assignment.period,
    startMinutes: timing.startMinutes,
    endMinutes: timing.endMinutes,
    endAt,
    subject: assignment.subject || "",
    className: assignment.className || "",
    groupName: assignment.groupName || "",
    origin: assignment.origin,
    additionalOccupied:
      assignment.combination || assignment.repurposedDuty ? 0 : 1,
    publicationId,
    sourceId: assignment.timetableId || null,
    charge: assignment.rCost ?? assignment.charge ?? 1,
    instructions: assignment.instructions || "",
    customInstructions: assignment.customInstructions || "",
    status: assignment.status,
  };
}
export async function completePublishedDuties(
  env,
  schoolId,
  now,
  { limit = 200 } = {},
) {
  requireValue(
    Number.isSafeInteger(now) && limit > 0 && limit <= 500,
    "INVALID_INPUT",
  );
  const pending = await query(
    env.DB,
    "SELECT * FROM roster_duties WHERE school_id=? AND completed=0 AND end_at<=? ORDER BY end_at,duty_id LIMIT ?",
    [schoolId, now, limit],
  );
  let completed = 0;
  for (const source of pending) {
    const duty = JSON.parse(source.payload_json);
    requireValue(
      id(duty.dutyId) &&
        id(duty.staffId) &&
        Number.isFinite(duty.charge) &&
        duty.charge >= 0 &&
        duty.charge <= 1,
      "DUTY_CORRUPT",
      503,
    );
    const existing = await one(
      env.DB,
      "SELECT 1 AS present FROM roster_ledger WHERE school_id=? AND duty_id=? LIMIT 1",
      [schoolId, duty.dutyId],
    );
    if (existing) {
      await env.DB.prepare(
        "UPDATE roster_duties SET completed=1 WHERE school_id=? AND duty_id=?",
      )
        .bind(schoolId, duty.dutyId)
        .run();
      continue;
    }
    const opening = await one(
      env.DB,
      "SELECT cutoff FROM roster_openings WHERE school_id=? AND staff_id=? AND year=?",
      [schoolId, duty.staffId, duty.date.slice(0, 4)],
    );
    if (opening && duty.date <= opening.cutoff) {
      await env.DB.prepare(
        "UPDATE roster_duties SET completed=1 WHERE school_id=? AND duty_id=?",
      )
        .bind(schoolId, duty.dutyId)
        .run();
      continue;
    }
    const weekScope = "week:" + weekOf(duty.date),
      weekRevision = await scopeRevision(env.DB, schoolId, weekScope),
      sc = scopeChange(schoolId, weekScope, weekRevision);
    let op = await prepareOperation(env.DB, {
      schoolId,
      actorId: "roster-scheduler",
      operationId: "complete:" + duty.dutyId,
      action: "internal.roster.complete",
      intent: { duty },
      now,
      validUntil: now + 60000,
    });
    if (op.state === "committed") continue;
    if (op.validUntil <= now) {
      await env.DB.prepare(
        "UPDATE product_operations SET valid_until=?,updated_at=? WHERE school_id=? AND operation_id=? AND action='internal.roster.complete' AND state='prepared' AND fence=?",
      )
        .bind(now + 60000, now, schoolId, op.operationId, op.fence)
        .run();
      op = { ...op, validUntil: now + 60000 };
    }
    try {
      await commitOperation(env.DB, op, {
        now,
        result: { dutyId: duty.dutyId, completionBasis: "assumed-after-end" },
        admission: {
          kind: "system",
          reason: "A previously authorised immutable published duty has ended.",
        },
        guards: [
          sc.guard,
          {
            sql: "SELECT completed=0 AND publication_sequence=? AS ok FROM roster_duties WHERE school_id=? AND duty_id=?",
            args: [source.publication_sequence, schoolId, duty.dutyId],
          },
          {
            sql: "SELECT NOT EXISTS(SELECT 1 FROM roster_ledger WHERE school_id=? AND duty_id=?) AS ok",
            args: [schoolId, duty.dutyId],
          },
          {
            sql: "SELECT NOT EXISTS(SELECT 1 FROM roster_openings WHERE school_id=? AND staff_id=? AND year=? AND cutoff>=?) AS ok",
            args: [schoolId, duty.staffId, duty.date.slice(0, 4), duty.date],
          },
        ],
        writes: [
          sc.write,
          {
            sql: "UPDATE roster_duties SET completed=1 WHERE school_id=? AND duty_id=?",
            args: [schoolId, duty.dutyId],
          },
          {
            sql: "INSERT INTO roster_ledger(school_id,duty_id,correction_revision,staff_id,service_date,period,period_count,charge,completion_basis,assignment_json,actor_id,reason,operation_id,recorded_at) VALUES(?,?,0,?,?,?,?,?,?,?,?,?,?,?)",
            args: [
              schoolId,
              duty.dutyId,
              duty.staffId,
              duty.date,
              duty.period,
              1,
              duty.charge,
              "assumed-after-end",
              canonical(duty),
              "roster-scheduler",
              "Published duty passed its frozen end time.",
              op.operationId,
              now,
            ],
          },
        ],
        audit: { dutyId: duty.dutyId, sourcePublicationId: duty.publicationId },
      });
      completed++;
    } catch (e) {
      if (e.code !== "REVISION_CONFLICT") throw e;
    }
  }
  return {
    completed,
    checked: pending.length,
    bounded: pending.length === limit,
  };
}
export async function correctionPlan(db, schoolId, body, principal, now) {
  requireValue(
    id(body.dutyId) &&
      Number.isSafeInteger(body.correctionRevision) &&
      body.correctionRevision >= 0 &&
      typeof body.reason === "string" &&
      body.reason.trim().length > 0 &&
      body.reason.length <= 1000,
    "CORRECTION_INPUT_INVALID",
  );
  const source = await one(
    db,
    "SELECT service_date FROM roster_ledger WHERE school_id=? AND duty_id=? LIMIT 1",
    [schoolId, body.dutyId],
  );
  requireValue(source, "DUTY_NOT_FOUND", 404);
  const weekScope = "week:" + weekOf(source.service_date),
    weekRevision = await scopeRevision(db, schoolId, weekScope),
    sc = scopeChange(schoolId, weekScope, weekRevision);
  const rows = await query(
    db,
    "SELECT * FROM roster_ledger WHERE school_id=? AND duty_id=? ORDER BY correction_revision",
    [schoolId, body.dutyId],
  );
  requireValue(rows.length, "DUTY_NOT_FOUND", 404);
  const latest = rows.at(-1);
  requireValue(
    latest.correction_revision === body.correctionRevision,
    "REVISION_CONFLICT",
    409,
  );
  const duty = JSON.parse(latest.assignment_json);
  const newStaffId = body.staffId || duty.staffId,
    newPeriodCount = body.completed === false ? 0 : 1,
    newCharge = body.completed === false ? 0 : (body.charge ?? duty.charge);
  requireValue(
    id(newStaffId) &&
      Number.isFinite(newCharge) &&
      newCharge >= 0 &&
      newCharge <= 1,
    "CORRECTION_INPUT_INVALID",
  );
  const balances = new Map();
  for (const row of rows) {
    const old = balances.get(row.staff_id) || { periods: 0, charge: 0 };
    old.periods += row.period_count;
    old.charge += row.charge;
    balances.set(row.staff_id, old);
  }
  let revision = latest.correction_revision;
  const writes = [];
  for (const [staff, amount] of balances)
    if (amount.periods || amount.charge) {
      revision++;
      writes.push({
        sql: "INSERT INTO roster_ledger(school_id,duty_id,correction_revision,staff_id,service_date,period,period_count,charge,completion_basis,assignment_json,actor_id,reason,operation_id,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        args: [
          schoolId,
          body.dutyId,
          revision,
          staff,
          duty.date,
          duty.period,
          -amount.periods,
          -amount.charge,
          "explicit-reversal",
          canonical(duty),
          principal.actorId,
          body.reason.trim(),
          body.operationId,
          now,
        ],
      });
    }
  revision++;
  const corrected = {
    ...duty,
    staffId: newStaffId,
    charge: newCharge,
    completed: body.completed !== false,
  };
  writes.push({
    sql: "INSERT INTO roster_ledger(school_id,duty_id,correction_revision,staff_id,service_date,period,period_count,charge,completion_basis,assignment_json,actor_id,reason,operation_id,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    args: [
      schoolId,
      body.dutyId,
      revision,
      newStaffId,
      duty.date,
      duty.period,
      newPeriodCount,
      newCharge,
      "explicit-correction",
      canonical(corrected),
      principal.actorId,
      body.reason.trim(),
      body.operationId,
      now,
    ],
  });
  writes.push(sc.write);
  return {
    guards: [
      sc.guard,
      {
        sql: "SELECT MAX(correction_revision)=? AS ok FROM roster_ledger WHERE school_id=? AND duty_id=?",
        args: [body.correctionRevision, schoolId, body.dutyId],
      },
    ],
    writes,
    result: {
      dutyId: body.dutyId,
      correctionRevision: revision,
      staffId: newStaffId,
      completed: body.completed !== false,
      charge: newCharge,
    },
  };
}
export async function dutiesReport(
  db,
  schoolId,
  { from, to, staffId },
  principal,
  now,
) {
  from = dateOnly(from || localDate(now).slice(0, 4) + "-01-01");
  to = dateOnly(to || localDate(now));
  requireValue(
    to >= from && Date.parse(to) - Date.parse(from) <= 3660 * 86400000,
    "DATE_RANGE_BOUNDS",
  );
  const privileged =
    principal.capabilities.includes("admin") ||
    principal.capabilities.includes("roster.read");
  if (!privileged) {
    requireValue(
      principal.staffId && (!staffId || staffId === principal.staffId),
      "CAPABILITY_DENIED",
      403,
    );
    staffId = principal.staffId;
  }
  const args = [schoolId, from, to];
  let staffSql = "";
  if (staffId) {
    staffSql = " AND staff_id=?";
    args.push(staffId);
  }
  const rows = await query(
    db,
    "SELECT * FROM roster_ledger WHERE school_id=? AND service_date BETWEEN ? AND ?" +
      staffSql +
      " ORDER BY service_date,duty_id,correction_revision LIMIT 10001",
    args,
  );
  requireValue(rows.length <= 10000, "REPORT_BOUNDS", 413);
  const openingArgs = [schoolId, from.slice(0, 4), to.slice(0, 4)];
  if (staffId) openingArgs.push(staffId);
  const openings = await query(
    db,
    "SELECT * FROM roster_openings WHERE school_id=? AND year BETWEEN ? AND ?" +
      staffSql,
    openingArgs,
  );
  const byOpening = new Map(
    openings.map((o) => [o.staff_id + "|" + o.year, o]),
  );
  const totals = new Map();
  for (const r of rows) {
    const opening = byOpening.get(
      r.staff_id + "|" + r.service_date.slice(0, 4),
    );
    if (opening && r.service_date <= opening.cutoff) continue;
    const t = totals.get(r.staff_id) || {
      staffId: r.staff_id,
      periods: 0,
      charge: 0,
    };
    t.periods += r.period_count;
    t.charge += r.charge;
    totals.set(r.staff_id, t);
  }
  const openingInformation = openings.map((o) => {
    const included = from <= o.year + "-01-01" && to >= o.cutoff;
    if (included) {
      const t = totals.get(o.staff_id) || {
        staffId: o.staff_id,
        periods: 0,
        charge: 0,
      };
      t.periods =
        o.period_count === null || t.periods === null
          ? null
          : t.periods + o.period_count;
      t.charge += o.charge;
      totals.set(o.staff_id, t);
    }
    if (!included && from <= o.cutoff && to >= o.year + "-01-01") {
      const t = totals.get(o.staff_id) || {
        staffId: o.staff_id,
        periods: 0,
        charge: 0,
      };
      t.knownPeriods = t.periods;
      t.knownCharge = t.charge;
      t.periods = null;
      t.charge = null;
      t.incomplete = true;
      totals.set(o.staff_id, t);
    }
    return {
      staffId: o.staff_id,
      year: o.year,
      cutoff: o.cutoff,
      periods: o.period_count,
      charge: o.charge,
      included,
      granularity: "opening-total",
      reason: included
        ? "Whole opening interval included."
        : "The selected range does not contain the entire opening interval; no period-level history is invented.",
    };
  });
  return {
    schemaVersion: 1,
    schoolId,
    from,
    to,
    totals: [...totals.values()].sort((a, b) =>
      a.staffId.localeCompare(b.staffId),
    ),
    duties: rows.map((r) => ({
      dutyId: r.duty_id,
      revision: r.correction_revision,
      staffId: r.staff_id,
      date: r.service_date,
      period: r.period,
      periods: r.period_count,
      charge: r.charge,
      basis: r.completion_basis,
      coveredByOpening:
        !!byOpening.get(r.staff_id + "|" + r.service_date.slice(0, 4)) &&
        r.service_date <=
          byOpening.get(r.staff_id + "|" + r.service_date.slice(0, 4)).cutoff,
      reason: r.reason,
      assignment: JSON.parse(r.assignment_json),
    })),
    openingBalances: openingInformation,
  };
}
export function ledgerCSV(report) {
  const escape = (x) =>
    '"' +
    String(
      typeof x === "string" && /^[=+@\-\t\r\n]/.test(x) ? "'" + x : (x ?? ""),
    ).replaceAll('"', '""') +
    '"';
  return [
    "Staff ID,Service Date,Duty ID,Revision,Period,Periods Done,R Charge,Completion Basis,Included",
    ...report.duties.map((r) =>
      [
        r.staffId,
        r.date,
        r.dutyId,
        r.revision,
        r.period,
        r.periods,
        r.charge,
        r.basis,
        !r.coveredByOpening,
      ]
        .map(escape)
        .join(","),
    ),
    ...report.openingBalances.map((o) =>
      [
        o.staffId,
        o.cutoff,
        "opening:" + o.year,
        "",
        "",
        o.periods,
        o.charge,
        "opening-total",
        o.included,
      ]
        .map(escape)
        .join(","),
    ),
  ].join("\r\n");
}
