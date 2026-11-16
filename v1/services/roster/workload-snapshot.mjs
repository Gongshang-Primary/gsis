import { canonical, digest, one, statement } from "../../runtime/store.mjs";
import { serviceCall } from "../../runtime/security.mjs";
import { requireValue } from "../../runtime/errors.mjs";

/** A fresh source read updates only Roster's copy. Reading the local revision
 * before calling Deploy prevents an older response overwriting a newer one.
 * Current authority is checked independently; this copy grants no capability.
 */
export async function workloadSnapshot(ctx, date) {
  const { env, principal } = ctx, schoolId = principal.schoolId;
  const current = () => one(env.DB,
    "SELECT revision,digest,payload_json FROM roster_workload_snapshots WHERE school_id=? AND service_date=?", [schoolId, date]);
  const before = await current();
  const source = await serviceCall(env, "deploy", "/internal/roster-workload", {
    schoolId, decisionId: principal.decisionId, date,
  });
  requireValue(source?.schoolId === schoolId && Array.isArray(source.rows), "WORKLOAD_UNVERIFIED", 503);
  requireValue(source.rows.length <= 10000, "WORKLOAD_BOUNDS", 413);
  // Keep only the workload contract, not the entire planning document. Source
  // identity is immutable content; observed_at is this refresh's observation.
  const envelope = source.envelope || source;
  const payload = { schoolId, rows: source.rows };
  for (const key of ["schemaVersion", "calculationVersion", "settingsRevision", "contactsRevision",
    "subjectCategories", "publicationId", "publicationSequence", "formClasses", "teachingGroups", "venues",
    "contacts", "sharedInputs", "settingsDigest", "workingRevision", "payloadDigest", "publishedAt"])
    if (envelope[key] !== undefined) payload[key] = envelope[key];
  payload.workloadEvidence = source.workloadEvidence || {
    quality: source.rows.every(row => row.quality === "verified") ? "verified" : "unavailable",
    sourceKind: "publication", sourceId: payload.publicationId || null,
    sourceRevision: payload.publicationSequence || null,
  };
  const json = canonical(payload), hash = await digest(json);
  requireValue(new TextEncoder().encode(json).length <= 1048576, "WORKLOAD_BOUNDS", 413);
  if (before?.digest !== hash) {
    await statement(env.DB,
      "INSERT INTO roster_workload_snapshots(school_id,service_date,revision,digest,payload_json,observed_at) VALUES(?,?,1,?,?,?) ON CONFLICT(school_id,service_date) DO UPDATE SET revision=revision+1,digest=excluded.digest,payload_json=excluded.payload_json,observed_at=excluded.observed_at WHERE revision=?",
      [schoolId, date, hash, json, ctx.now, before?.revision || 0]).run();
  }
  const saved = await current();
  requireValue(saved?.digest === hash && saved.payload_json === json, "ROSTER_WORKLOAD_CHANGED", 409);
  return {
    payload,
    identity: { date, revision: saved.revision, digest: hash },
    guard: {
      sql: "SELECT EXISTS(SELECT 1 FROM roster_workload_snapshots WHERE school_id=? AND service_date=? AND revision=? AND digest=?) AS ok",
      args: [schoolId, date, saved.revision, hash],
    },
  };
}
