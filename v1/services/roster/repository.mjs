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
    "SELECT * FROM roster_records WHERE school_id=? AND (collection='types' OR service_date IS NULL OR service_date BETWEEN ? AND ?)";
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
  const seen = new Set(),
    typeOrder = [];
  for (const row of records) {
    let payload;
    try {
      payload = JSON.parse(row.payload_json);
    } catch (error) {
      if (row.collection === "types")
        throw new ApiError("TYPE_ORDER_INTEGRITY", 503);
      throw error;
    }
    if (row.collection === "types")
      requireValue(
        payload && typeof payload === "object" && !Array.isArray(payload),
        "TYPE_ORDER_INTEGRITY",
        503,
      );
    const { kind, data } = payload;
    if (row.collection === "types") {
      requireValue(
        kind === "array" &&
          data?.id === row.record_id &&
          typeof data.id === "string" &&
          /^[a-zA-Z0-9_-]{1,60}$/.test(data.id) &&
          row.service_date == null &&
          row.staff_id == null &&
          row.year == null,
        "TYPE_ORDER_INTEGRITY",
        503,
      );
      typeOrder.push({
        data,
        positioned: Object.hasOwn(payload, "position"),
        position: payload.position,
      });
    }
    if (!seen.has(row.collection)) {
      state[row.collection] =
        kind === "array" ? [] : kind === "map" ? {} : data;
      seen.add(row.collection);
    }
    if (kind === "array") state[row.collection].push(data);
    else if (kind === "map") state[row.collection][row.record_id] = data;
    else state[row.collection] = data;
  }
  requireValue(typeOrder.length <= 80, "TYPE_ORDER_INTEGRITY", 503);
  if (typeOrder.some((row) => row.positioned)) {
    requireValue(
      typeOrder.every(
        (row) =>
          row.positioned &&
          Number.isSafeInteger(row.position) &&
          row.position >= 0 &&
          row.position < typeOrder.length,
      ) &&
        new Set(typeOrder.map((row) => row.position)).size === typeOrder.length,
      "TYPE_ORDER_INTEGRITY",
      503,
    );
    state.types = typeOrder
      .sort((a, b) => a.position - b.position)
      .map((row) => row.data);
  }
  // Entirely unmarked legacy types retain the query's stable record-ID order.
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
const administrativeSaves = new Set(["saveSystemConfig", "saveTypes"]);
const recordPresent =
  "SELECT EXISTS(SELECT 1 FROM roster_records WHERE school_id=? AND collection=? AND record_id=? AND revision=?) AS ok";
const recordAbsent =
  "SELECT NOT EXISTS(SELECT 1 FROM roster_records WHERE school_id=? AND collection=? AND record_id=?) AS ok";
const recordDeleteRevision =
  "SELECT revision=? AS ok FROM roster_records WHERE school_id=? AND collection=? AND record_id=?";
const recordInsert =
  "INSERT INTO roster_records(school_id,collection,record_id,service_date,staff_id,year,revision,payload_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(school_id,collection,record_id) DO UPDATE SET service_date=excluded.service_date,staff_id=excluded.staff_id,year=excluded.year,revision=excluded.revision,payload_json=excluded.payload_json";
const recordDelete =
  "DELETE FROM roster_records WHERE school_id=? AND collection=? AND record_id=?";
export async function recordChanges(
  schoolId,
  before,
  state,
  records,
  { maxWrites = 1500, administrativeSave } = {},
) {
  if (administrativeSave !== undefined)
    requireValue(
      administrativeSaves.has(administrativeSave),
      "ADMIN_SAVE_OPERATION",
      500,
    );
  const orderedTypes = administrativeSave === "saveTypes";
  if (orderedTypes)
    requireValue(
      Array.isArray(state.types) &&
        state.types.length > 0 &&
        state.types.length <= 80 &&
        state.types.every(
          (row) =>
            typeof row.id === "string" && /^[a-zA-Z0-9_-]{1,60}$/.test(row.id),
        ) &&
        new Set(state.types.map((row) => row.id)).size === state.types.length,
      "TYPE_BOUNDS",
      400,
    );
  if (administrativeSave)
    requireValue(
      records.every((row) => row.school_id === schoolId),
      "SCHOOL_MISMATCH",
      403,
    );
  const positions = orderedTypes
      ? new Map(state.types.map((row, i) => [row.id, i]))
      : null,
    next = flatten(state),
    known = new Map(records.map((r) => [r.collection + "|" + r.record_id, r])),
    guards = [],
    writes = [];
  for (const [key, row] of next) {
    const old = before.get(key),
      stored = known.get(key),
      storedPayload =
        row.collection === "types" && administrativeSave && stored
          ? JSON.parse(stored.payload_json)
          : null,
      position =
        orderedTypes && row.collection === "types"
          ? positions.get(row.id)
          : storedPayload?.position,
      positionChanged =
        orderedTypes &&
        row.collection === "types" &&
        (!storedPayload ||
          !Object.hasOwn(storedPayload, "position") ||
          storedPayload.position !== position),
      missingConfig =
        administrativeSave === "saveSystemConfig" &&
        row.collection === "systemConfig" &&
        !stored;
    // An explicit settings save must establish the complete validated map;
    // loading a partially stored map does not retain its in-memory defaults.
    if (
      old &&
      canonical(old.data) === canonical(row.data) &&
      !positionChanged &&
      !missingConfig
    )
      continue;
    const version = stored?.revision || 0;
    if (administrativeSave) {
      requireValue(
        !stored ||
          (Number.isSafeInteger(stored.revision) &&
            stored.revision >= 0 &&
            stored.revision < Number.MAX_SAFE_INTEGER),
        "RECORD_INTEGRITY",
        503,
      );
      guards.push(
        stored
          ? {
              sql: recordPresent,
              args: [schoolId, row.collection, row.id, stored.revision],
            }
          : { sql: recordAbsent, args: [schoolId, row.collection, row.id] },
      );
    } else
      guards.push({
        sql: "SELECT COALESCE((SELECT revision FROM roster_records WHERE school_id=? AND collection=? AND record_id=?),0)=? AS ok",
        args: [schoolId, row.collection, row.id, version],
      });
    writes.push({
      sql: recordInsert,
      args: [
        schoolId,
        row.collection,
        row.id,
        row.date,
        row.staffId,
        row.year,
        version + 1,
        canonical({
          kind: row.kind,
          data: row.data,
          ...(row.collection === "types" &&
          administrativeSave &&
          position !== undefined
            ? { position }
            : {}),
        }),
      ],
    });
  }
  for (const [key, row] of before)
    if (!next.has(key) && known.has(key)) {
      const stored = known.get(key);
      guards.push({
        sql: recordDeleteRevision,
        args: [stored.revision, schoolId, row.collection, row.id],
      });
      writes.push({
        sql: recordDelete,
        args: [schoolId, row.collection, row.id],
      });
    }
  if (orderedTypes) {
    const prior = records.filter((row) => row.collection === "types");
    // Guard unchanged members too: positions describe the complete collection.
    for (const row of prior) {
      requireValue(
        Number.isSafeInteger(row.revision) && row.revision >= 0,
        "RECORD_INTEGRITY",
        503,
      );
      guards.push({
        sql: recordPresent,
        args: [schoolId, "types", row.record_id, row.revision],
      });
    }
    guards.push({
      sql: "SELECT NOT EXISTS(SELECT 1 FROM roster_records WHERE school_id=? AND collection='types' AND record_id NOT IN(SELECT value FROM json_each(?))) AS ok",
      args: [schoolId, canonical(prior.map((row) => row.record_id))],
    });
  }
  requireValue(writes.length <= maxWrites, "WRITE_BOUNDS", 413);
  return { guards, writes };
}
/** Only these two admin saves compact records, after accounting derived its guards. */
export function compactAdministrativeSave(schoolId, operation, plan) {
  requireValue(administrativeSaves.has(operation), "ADMIN_SAVE_OPERATION", 500);
  const expected = [],
    upserts = [],
    deletes = [],
    guards = [],
    writes = [];
  const scoped = (args, index = 0) =>
    requireValue(args[index] === schoolId, "SCHOOL_MISMATCH", 403);
  for (const guard of plan.guards) {
    if (guard.sql === recordPresent) {
      scoped(guard.args);
      expected.push([...guard.args.slice(1), true]);
    } else if (guard.sql === recordAbsent) {
      scoped(guard.args);
      expected.push([...guard.args.slice(1), null, false]);
    } else if (guard.sql === recordDeleteRevision) {
      scoped(guard.args, 1);
      expected.push([guard.args[2], guard.args[3], guard.args[0], true]);
    } else guards.push(guard);
  }
  for (const write of plan.writes) {
    if (write.sql === recordInsert) {
      scoped(write.args);
      upserts.push(write.args.slice(1));
    } else if (write.sql === recordDelete) {
      scoped(write.args);
      deletes.push(write.args.slice(1));
    } else writes.push(write);
  }
  if (expected.length)
    guards.push({
      sql: "SELECT NOT EXISTS(SELECT 1 FROM json_each(?) x LEFT JOIN roster_records r ON r.school_id=? AND r.collection=json_extract(x.value,'$[0]') AND r.record_id=json_extract(x.value,'$[1]') WHERE (json_extract(x.value,'$[3]')=1 AND (r.record_id IS NULL OR r.revision<>json_extract(x.value,'$[2]'))) OR (json_extract(x.value,'$[3]')=0 AND r.record_id IS NOT NULL)) AS ok",
      args: [
        canonical([
          ...new Map(expected.map((row) => [canonical(row), row])).values(),
        ]),
        schoolId,
      ],
    });
  if (upserts.length)
    writes.push({
      sql: "INSERT INTO roster_records(school_id,collection,record_id,service_date,staff_id,year,revision,payload_json) SELECT ?,json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]'),json_extract(value,'$[4]'),json_extract(value,'$[5]'),json_extract(value,'$[6]') FROM json_each(?) WHERE 1 ON CONFLICT(school_id,collection,record_id) DO UPDATE SET service_date=excluded.service_date,staff_id=excluded.staff_id,year=excluded.year,revision=excluded.revision,payload_json=excluded.payload_json",
      args: [schoolId, canonical(upserts)],
    });
  if (deletes.length)
    writes.push({
      sql: "DELETE FROM roster_records WHERE school_id=? AND EXISTS(SELECT 1 FROM json_each(?) x WHERE json_extract(x.value,'$[0]')=roster_records.collection AND json_extract(x.value,'$[1]')=roster_records.record_id)",
      args: [schoolId, canonical(deletes)],
    });
  const unique = [
      ...new Map(guards.map((guard) => [canonical(guard), guard])).values(),
    ],
    ordinary = unique.filter((guard) => guard.deadlineAt === undefined),
    timed = unique.filter((guard) => guard.deadlineAt !== undefined),
    args = ordinary.flatMap((guard) => guard.args || []),
    combined = ordinary.length
      ? [
          {
            sql:
              "SELECT " +
              ordinary
                .map(
                  (guard) =>
                    "COALESCE((SELECT ok FROM (" + guard.sql + ") LIMIT 1),0)",
                )
                .join(" AND ") +
              " AS ok",
            args,
          },
        ]
      : [],
    finalGuards = [...combined, ...timed],
    outbox = plan.outbox || [],
    encoder = new TextEncoder(),
    byteLength = (value) => encoder.encode(value).length;
  // Reserve space for fixed operation/admission guards and receipt metadata. Count
  // every repeated bound value, not just distinct JSON or JavaScript characters.
  const boundBytes =
    [...finalGuards, ...writes].reduce(
      (total, item) =>
        total +
        (item.args || []).reduce(
          (sum, value) =>
            sum + (typeof value === "string" ? byteLength(value) : 8),
          0,
        ),
      0,
    ) +
    byteLength(canonical(plan.result)) +
    byteLength(canonical(plan.audit || {})) +
    outbox.reduce((sum, job) => sum + byteLength(canonical(job.payload)), 0);
  requireValue(
    args.length <= 98 &&
      writes.every((write) => (write.args || []).length <= 99) &&
      [...finalGuards, ...writes].every(
        (item) => item.sql === undefined || byteLength(item.sql) < 100000,
      ) &&
      finalGuards.length * 2 + writes.length + outbox.length <= 20 &&
      boundBytes <= 1024 * 1024 - 8192,
    "ADMIN_SAVE_BOUNDS",
    413,
  );
  return { ...plan, guards: finalGuards, writes };
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
