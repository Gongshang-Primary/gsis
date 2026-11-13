import Operations from "../../../shared/roster-operations.js";
import { canonical, digest, query, one } from "../../runtime/store.mjs";
import { ApiError, requireValue } from "../../runtime/errors.mjs";
const omit = new Set(["revision", "outbox", "receipts"]);
export const dateOnly = (d) => {
  requireValue(
    typeof d === "string" &&
      /^20\d\d-\d\d-\d\d$/.test(d) &&
      new Date(d).toISOString().slice(0, 10) === d,
    "INVALID_DATE",
  );
  return d;
};
export const localDate = (now) =>
  new Date(now + 28800000).toISOString().slice(0, 10);
export function requestedDates(body, now) {
  const from = dateOnly(body.from || body.date || localDate(now)),
    to = dateOnly(body.to || from);
  requireValue(
    to >= from && Date.parse(to) - Date.parse(from) <= 366 * 86400000,
    "DATE_RANGE_BOUNDS",
  );
  const set = new Set([
    from,
    to,
    ...(body.dates || []),
    ...(body.newDate ? [body.newDate] : []),
  ]);
  for (let t = Date.parse(from); t <= Date.parse(to); t += 86400000)
    set.add(new Date(t).toISOString().slice(0, 10));
  for (const d of set) dateOnly(d);
  requireValue(set.size <= 366, "DATE_RANGE_BOUNDS");
  return {
    from: [...set].sort()[0],
    to: [...set].sort().at(-1),
    dates: [...set].sort(),
  };
}
function rowId(row, index) {
  if (row && typeof row === "object")
    return String(
      row.id ??
        row.key ??
        (row.date && row.staffId
          ? row.date + ":" + row.staffId
          : (row.date ??
            (row.staffId && row.year
              ? row.staffId + ":" + row.year
              : (row.staffId ?? row.year ?? index)))),
    );
  return String(index);
}
export function flatten(state) {
  const rows = new Map();
  for (const [collection, value] of Object.entries(
    JSON.parse(JSON.stringify(state)),
  )) {
    if (omit.has(collection)) continue;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const data = value[i];
        if (
          data?.mode === "v1-ledger-projection" ||
          (collection === "entitlements" && data?.mode === "frozen-v1")
        )
          continue;
        const id = rowId(data, i),
          key = collection + "|" + id;
        requireValue(!rows.has(key), "DUPLICATE_RECORD", 503);
        rows.set(key, {
          collection,
          id,
          kind: "array",
          date: data?.date || null,
          staffId: data?.staffId || null,
          year: data?.year || null,
          data,
        });
      }
    } else if (value && typeof value === "object") {
      for (const [id, data] of Object.entries(value))
        rows.set(collection + "|" + id, {
          collection,
          id,
          kind: "map",
          date: /^20\d\d-\d\d-\d\d/.test(id)
            ? id.slice(0, 10)
            : data?.date || null,
          staffId: data?.staffId || null,
          year: data?.year || null,
          data,
        });
    } else
      rows.set(collection + "|scalar", {
        collection,
        id: "scalar",
        kind: "scalar",
        date: null,
        staffId: null,
        year: null,
        data: value,
      });
  }
  return rows;
}
export async function loadState(
  db,
  schoolId,
  range,
  { recordIds = [], allDates = false } = {},
) {
  requireValue(recordIds.length <= 100, "RECORD_BOUNDS");
  const sourceConfigRevision = await scopeRevision(db, schoolId, "config"),
    accountingRevisions = {};
  for (
    let t = Date.parse(weekOf(range.from));
    t <= Date.parse(weekOf(range.to));
    t += 7 * 86400000
  ) {
    const week = new Date(t).toISOString().slice(0, 10);
    accountingRevisions[week] = await scopeRevision(
      db,
      schoolId,
      "week:" + week,
    );
  }
  let sql =
    "SELECT * FROM roster_records WHERE school_id=? AND (service_date IS NULL OR service_date BETWEEN ? AND ?)";
  const args = [schoolId, range.from, range.to];
  if (recordIds.length) {
    sql =
      sql.slice(0, -1) +
      ` OR record_id IN (${recordIds.map(() => "?").join(",")}))`;
    args.push(...recordIds);
  }
  if (allDates) {
    sql = "SELECT * FROM roster_records WHERE school_id=?";
    args.splice(1);
  }
  const records = await query(
    db,
    sql + " ORDER BY collection,record_id LIMIT 10001",
    args,
  );
  requireValue(records.length <= 10000, "ROSTER_RECORD_BOUNDS", 413);
  requireValue(
    records.reduce((n, r) => n + r.payload_json.length, 0) <= 8388608,
    "ROSTER_PAYLOAD_BOUNDS",
    413,
  );
  const state = Operations.initial();
  state.systemConfig.consecutiveCountExclusions = [
    { type: "exact", value: "BLK" },
  ];
  const seen = new Set();
  for (const row of records) {
    const { kind, data } = JSON.parse(row.payload_json);
    if (!seen.has(row.collection)) {
      state[row.collection] =
        kind === "array" ? [] : kind === "map" ? {} : data;
      seen.add(row.collection);
    }
    if (kind === "array") state[row.collection].push(data);
    else if (kind === "map") state[row.collection][row.record_id] = data;
    else state[row.collection] = data;
  }
  const jobs = await query(
    db,
    `SELECT * FROM product_outbox WHERE school_id=? AND type='roster-notification' AND json_extract(payload_json,'$.date') BETWEEN ? AND ? ORDER BY due_at LIMIT 1001`,
    [schoolId, range.from, range.to],
  );
  requireValue(jobs.length <= 1000, "OUTBOX_BOUNDS", 413);
  state.outbox = jobs.map((j) => ({
    ...JSON.parse(j.payload_json),
    status: {
      queued: "queued",
      leased: "sending",
      accepted: "sent",
      delivered: "delivered",
      uncertain: "uncertain",
      failed: "failed",
      cancelled: "cancelled",
    }[j.state],
    attempts: j.attempts,
    providerId: j.provider_id,
  }));
  const captured = await query(
    db,
    "SELECT * FROM roster_weekly WHERE school_id=? AND week BETWEEN ? AND ? ORDER BY week,staff_id LIMIT 60001",
    [
      schoolId,
      range.from.slice(0, 4) + "-01-01",
      range.to.slice(0, 4) + "-12-31",
    ],
  );
  requireValue(captured.length <= 60000, "QUOTA_HISTORY_BOUNDS", 413);
  const keys = new Set(captured.map((r) => r.staff_id + "|" + r.week));
  state.entitlements = state.entitlements
    .filter((r) => !keys.has(r.staffId + "|" + r.week))
    .concat(
      captured.map((r) => ({
        id: "weekly:" + r.staff_id + ":" + r.week,
        staffId: r.staff_id,
        week: r.week,
        year: r.week.slice(0, 4),
        quota: r.quota,
        excluded: !!r.excluded,
        exclusion: r.exclusion_reason,
        source: {
          publicationId: r.publication_id,
          publicationSequence: r.publication_sequence,
          calculationVersion: r.calculation_version,
        },
        capturedAt: new Date(r.captured_at).toISOString(),
        mode: "frozen-v1",
      })),
    );
  const accounting = await accountingProjection(db, schoolId, range, state);
  state.importedRelief.push(...accounting.imports);
  state.reliefCorrections.push(...accounting.corrections);
  if (state.systemConfig.consecutiveCountExclusions === undefined)
    state.systemConfig.consecutiveCountExclusions = [
      { type: "exact", value: "BLK" },
    ];
  Operations.validateState(state);
  return {
    state,
    records,
    sourceConfigRevision,
    accountingRevisions,
    before: flatten(state),
  };
}
export async function recordChanges(schoolId, before, state, records) {
  const next = flatten(state),
    known = new Map(records.map((r) => [r.collection + "|" + r.record_id, r])),
    guards = [],
    writes = [];
  for (const [key, row] of next) {
    const old = before.get(key);
    if (old && canonical(old.data) === canonical(row.data)) continue;
    const stored = known.get(key),
      version = stored?.revision || 0;
    guards.push({
      sql: "SELECT COALESCE((SELECT revision FROM roster_records WHERE school_id=? AND collection=? AND record_id=?),0)=? AS ok",
      args: [schoolId, row.collection, row.id, version],
    });
    writes.push({
      sql: "INSERT INTO roster_records(school_id,collection,record_id,service_date,staff_id,year,revision,payload_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(school_id,collection,record_id) DO UPDATE SET service_date=excluded.service_date,staff_id=excluded.staff_id,year=excluded.year,revision=excluded.revision,payload_json=excluded.payload_json",
      args: [
        schoolId,
        row.collection,
        row.id,
        row.date,
        row.staffId,
        row.year,
        version + 1,
        canonical({ kind: row.kind, data: row.data }),
      ],
    });
  }
  for (const [key, row] of before)
    if (!next.has(key) && known.has(key)) {
      const stored = known.get(key);
      guards.push({
        sql: "SELECT revision=? AS ok FROM roster_records WHERE school_id=? AND collection=? AND record_id=?",
        args: [stored.revision, schoolId, row.collection, row.id],
      });
      writes.push({
        sql: "DELETE FROM roster_records WHERE school_id=? AND collection=? AND record_id=?",
        args: [schoolId, row.collection, row.id],
      });
    }
  requireValue(writes.length <= 1500, "WRITE_BOUNDS", 413);
  return { guards, writes };
}
export async function scopeRevision(db, schoolId, scope) {
  return (
    (
      await one(
        db,
        "SELECT revision FROM roster_scopes WHERE school_id=? AND scope=?",
        [schoolId, scope],
      )
    )?.revision || 0
  );
}
export function scopeChange(schoolId, scope, revision) {
  return {
    guard: {
      sql: "SELECT COALESCE((SELECT revision FROM roster_scopes WHERE school_id=? AND scope=?),0)=? AS ok",
      args: [schoolId, scope, revision],
    },
    write: {
      sql: "INSERT INTO roster_scopes(school_id,scope,revision) VALUES(?,?,1) ON CONFLICT(school_id,scope) DO UPDATE SET revision=revision+1",
      args: [schoolId, scope],
    },
  };
}
export async function writeArtifact(bucket, schoolId, kind, value) {
  requireValue(bucket, "ARTIFACT_STORAGE_UNAVAILABLE", 503);
  const bytes = canonical(value),
    hash = await digest(bytes),
    key = `${schoolId}/${kind}/${hash}.json`;
  requireValue(bytes.length <= 8388608, "ARTIFACT_BOUNDS", 413);
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { sha256: hash },
  });
  const read = await bucket.get(key);
  if (!read || (await digest(await read.text())) !== hash)
    throw new ApiError("ARTIFACT_INTEGRITY", 503);
  return { key, digest: hash };
}
export async function readArtifact(bucket, key, hash) {
  requireValue(bucket, "ARTIFACT_STORAGE_UNAVAILABLE", 503);
  const object = await bucket.get(key);
  requireValue(object && object.size <= 8388608, "ARTIFACT_UNAVAILABLE", 503);
  const text = await object.text();
  requireValue((await digest(text)) === hash, "ARTIFACT_INTEGRITY", 503);
  return JSON.parse(text);
}
export function weekOf(date) {
  return new Date(
    Date.parse(date) -
      ((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7) * 86400000,
  )
    .toISOString()
    .slice(0, 10);
}
/** Read-only compatibility projection; these derived rows are never written back as authority. */
export async function accountingProjection(db, schoolId, range, state) {
  const from = weekOf(range.from),
    to = new Date(Date.parse(weekOf(range.to)) + 6 * 86400000)
      .toISOString()
      .slice(0, 10),
    revisions = {};
  for (let t = Date.parse(from); t <= Date.parse(to); t += 7 * 86400000) {
    const week = new Date(t).toISOString().slice(0, 10);
    revisions[week] = await scopeRevision(db, schoolId, "week:" + week);
  }
  const ledger = await query(
    db,
    "SELECT duty_id,staff_id,service_date,period,SUM(charge) AS charge,SUM(period_count) AS periods,MAX(correction_revision) AS revision,assignment_json FROM roster_ledger WHERE school_id=? AND service_date BETWEEN ? AND ? GROUP BY duty_id,staff_id ORDER BY service_date,duty_id LIMIT 20001",
    [schoolId, from, to],
  );
  requireValue(ledger.length <= 20000, "ACCOUNTING_BOUNDS", 413);
  const covered = new Set(),
    byDuty = new Map();
  for (const r of ledger) {
    const list = byDuty.get(r.duty_id) || [];
    list.push(r);
    byDuty.set(r.duty_id, list);
  }
  const imports = [],
    corrections = [];
  for (const [dutyId, rows] of byDuty) {
    const effective =
        rows.find((r) => r.periods > 0 || r.charge > 0) || rows.at(-1),
      source = JSON.parse(effective.assignment_json),
      originalId = source.assignmentId,
      exists = originalId && state.assignments.some((a) => a.id === originalId);
    if (originalId) covered.add(originalId);
    const completed = rows.some((r) => r.periods > 0 || r.charge > 0),
      value = {
        staffId: effective.staff_id,
        date: effective.service_date,
        period: effective.period,
        rCost: completed ? effective.charge : 0,
        occupiedPeriods: completed
          ? Math.max(0, effective.periods) *
            (source.additionalOccupied ??
              (source.combination || source.repurposedDuty ? 0 : 1))
          : 0,
        completionStatus: completed ? "completed" : "not-completed",
      };
    if (exists)
      corrections.push({
        id: "ledger-correction:" + dutyId,
        assignmentId: originalId,
        sequence: 1000000000 + Math.max(...rows.map((r) => r.revision)),
        actual: value,
        mode: "v1-ledger-projection",
      });
    else if (completed)
      imports.push({
        ...source,
        ...value,
        id: "ledger:" + dutyId,
        status: "completed",
        origin: "ledger-projection",
        mode: "v1-ledger-projection",
      });
  }
  const commitments = await query(
    db,
    "SELECT payload_json FROM roster_records WHERE school_id=? AND collection IN ('assignments','importedRelief') AND service_date BETWEEN ? AND ? AND service_date NOT BETWEEN ? AND ? ORDER BY service_date,record_id LIMIT 20001",
    [schoolId, from, to, range.from, range.to],
  );
  requireValue(commitments.length <= 20000, "ACCOUNTING_BOUNDS", 413);
  for (const r of commitments) {
    const a = JSON.parse(r.payload_json).data;
    if (
      !covered.has(a.id) &&
      ["draft", "published", "completed"].includes(a.status) &&
      !a.remove &&
      !a.noRelief
    )
      imports.push({ ...a, mode: "v1-ledger-projection" });
  }
  return { imports, corrections, revisions, from, to };
}
export function accountingChanges(
  schoolId,
  loaded,
  change,
  { forceWeeks = [] } = {},
) {
  const weeks = new Set(forceWeeks);
  for (const write of change.writes) {
    if (write.sql.startsWith("INSERT INTO roster_records")) {
      const collection = write.args[1],
        date = write.args[3];
      if (
        [
          "assignments",
          "importedRelief",
          "reliefCorrections",
          "absences",
          "staplerPlans",
          "adhoc",
          "entitlements",
          "openingBalances",
        ].includes(collection) &&
        date
      )
        weeks.add(weekOf(date));
    }
  }
  for (const week of weeks) {
    const revision = loaded.accountingRevisions?.[week];
    requireValue(
      Number.isSafeInteger(revision),
      "ACCOUNTING_SCOPE_MISSING",
      409,
    );
    const sc = scopeChange(schoolId, "week:" + week, revision);
    change.guards.push(sc.guard);
    change.writes.push(sc.write);
  }
  return change;
}
