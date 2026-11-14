/** Compact only the existing opening-balance mutation plan, preserving every CAS.
 * All statements still commit in one owner-local D1 transaction. */
import { canonical } from "../../runtime/store.mjs";
import { requireValue } from "../../runtime/errors.mjs";
const MAX_VALUE_BYTES = 1536 * 1024;
const recordRevision =
  "SELECT COALESCE((SELECT revision FROM roster_records WHERE school_id=? AND collection=? AND record_id=?),0)=? AS ok";
const recordDeleteRevision =
  "SELECT revision=? AS ok FROM roster_records WHERE school_id=? AND collection=? AND record_id=?";
const openingRevision =
  "SELECT COALESCE((SELECT revision FROM roster_openings WHERE school_id=? AND staff_id=? AND year=?),0)=? AS ok";
const recordInsert =
  "INSERT INTO roster_records(school_id,collection,record_id,service_date,staff_id,year,revision,payload_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(school_id,collection,record_id) DO UPDATE SET service_date=excluded.service_date,staff_id=excluded.staff_id,year=excluded.year,revision=excluded.revision,payload_json=excluded.payload_json";
const openingInsert =
  "INSERT INTO roster_openings(school_id,staff_id,year,revision,cutoff,period_count,charge,source_digest,operation_id) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(school_id,staff_id,year) DO UPDATE SET revision=excluded.revision,cutoff=excluded.cutoff,period_count=excluded.period_count,charge=excluded.charge,source_digest=excluded.source_digest,operation_id=excluded.operation_id";
const recordDelete =
  "DELETE FROM roster_records WHERE school_id=? AND collection=? AND record_id=?";
function chunks(rows) {
  const out = [];
  let items = [],
    bytes = 2;
  for (const row of rows) {
    const encoded = canonical(row),
      size = new TextEncoder().encode(encoded).length + 1;
    requireValue(size < MAX_VALUE_BYTES, "OPENING_SAVE_BOUNDS", 413);
    if (bytes + size > MAX_VALUE_BYTES) {
      out.push("[" + items.join(",") + "]");
      items = [];
      bytes = 2;
    }
    items.push(encoded);
    bytes += size;
  }
  if (items.length) out.push("[" + items.join(",") + "]");
  return out;
}
export function compactOpeningSave(schoolId, plan) {
  const records = [],
    openings = [],
    recordWrites = [],
    openingWrites = [],
    deletes = [],
    guards = [],
    writes = [];
  const scope = (args, index = 0) =>
    requireValue(args[index] === schoolId, "SCHOOL_MISMATCH", 403);
  for (const g of plan.guards) {
    if (g.sql === recordRevision) {
      scope(g.args);
      records.push(g.args.slice(1));
    } else if (g.sql === recordDeleteRevision) {
      scope(g.args, 1);
      records.push([g.args[2], g.args[3], g.args[0]]);
    } else if (g.sql === openingRevision) {
      scope(g.args);
      openings.push(g.args.slice(1));
    } else guards.push(g);
  }
  for (const w of plan.writes) {
    if (w.sql === recordInsert) {
      scope(w.args);
      recordWrites.push(w.args.slice(1));
    } else if (w.sql === openingInsert) {
      scope(w.args);
      openingWrites.push(w.args.slice(1));
    } else if (w.sql === recordDelete) {
      scope(w.args);
      deletes.push(w.args.slice(1));
    } else writes.push(w);
  }
  for (const rows of chunks(records))
    guards.push({
      sql: "SELECT NOT EXISTS(SELECT 1 FROM json_each(?) x LEFT JOIN roster_records r ON r.school_id=? AND r.collection=json_extract(x.value,'$[0]') AND r.record_id=json_extract(x.value,'$[1]') WHERE COALESCE(r.revision,0)<>json_extract(x.value,'$[2]')) AS ok",
      args: [rows, schoolId],
    });
  for (const rows of chunks(openings))
    guards.push({
      sql: "SELECT NOT EXISTS(SELECT 1 FROM json_each(?) x LEFT JOIN roster_openings r ON r.school_id=? AND r.staff_id=json_extract(x.value,'$[0]') AND r.year=json_extract(x.value,'$[1]') WHERE COALESCE(r.revision,0)<>json_extract(x.value,'$[2]')) AS ok",
      args: [rows, schoolId],
    });
  for (const rows of chunks(recordWrites))
    writes.push({
      sql: "INSERT INTO roster_records(school_id,collection,record_id,service_date,staff_id,year,revision,payload_json) SELECT ?,json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]'),json_extract(value,'$[4]'),json_extract(value,'$[5]'),json_extract(value,'$[6]') FROM json_each(?) WHERE 1 ON CONFLICT(school_id,collection,record_id) DO UPDATE SET service_date=excluded.service_date,staff_id=excluded.staff_id,year=excluded.year,revision=excluded.revision,payload_json=excluded.payload_json",
      args: [schoolId, rows],
    });
  for (const rows of chunks(openingWrites))
    writes.push({
      sql: "INSERT INTO roster_openings(school_id,staff_id,year,revision,cutoff,period_count,charge,source_digest,operation_id) SELECT ?,json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]'),json_extract(value,'$[4]'),json_extract(value,'$[5]'),json_extract(value,'$[6]'),json_extract(value,'$[7]') FROM json_each(?) WHERE 1 ON CONFLICT(school_id,staff_id,year) DO UPDATE SET revision=excluded.revision,cutoff=excluded.cutoff,period_count=excluded.period_count,charge=excluded.charge,source_digest=excluded.source_digest,operation_id=excluded.operation_id",
      args: [schoolId, rows],
    });
  for (const rows of chunks(deletes))
    writes.push({
      sql: "DELETE FROM roster_records WHERE school_id=? AND EXISTS(SELECT 1 FROM json_each(?) x WHERE json_extract(x.value,'$[0]')=roster_records.collection AND json_extract(x.value,'$[1]')=roster_records.record_id)",
      args: [schoolId, rows],
    });
  // Duplicate predicates do not add protection; retain each distinct predicate.
  const unique = [...new Map(guards.map((g) => [canonical(g), g])).values()];
  const ordinary = unique.filter((g) => g.deadlineAt === undefined),
    timed = unique.filter((g) => g.deadlineAt !== undefined);
  const args = ordinary.flatMap((g) => g.args || []);
  requireValue(args.length <= 90, "OPENING_SAVE_BOUNDS", 413);
  const combined = ordinary.length
    ? [
        {
          sql:
            "SELECT " +
            ordinary
              .map(
                (g) => "COALESCE((SELECT ok FROM (" + g.sql + ") LIMIT 1),0)",
              )
              .join(" AND ") +
            " AS ok",
          args,
        },
      ]
    : [];
  const finalGuards = [...combined, ...timed];
  requireValue(
    finalGuards.length * 2 + writes.length <= 20 &&
      (plan.outbox || []).length === 0,
    "OPENING_SAVE_BOUNDS",
    413,
  );
  return { ...plan, guards: finalGuards, writes };
}
