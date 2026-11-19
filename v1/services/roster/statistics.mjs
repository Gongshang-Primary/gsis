/** Native Statistics wire compatibility over Roster-owned history. No authority,
 * allocation, publication, quota capture or correction is performed here. */
import Statistics from "../../../shared/roster-statistics.js";
import { canonical, digest, query } from "../../runtime/store.mjs";
import { requireValue } from "../../runtime/errors.mjs";
import { loadState, localDate, requestedDates } from "./repository.mjs";
import { context } from "./context.mjs";

async function ownerScopes(db, schoolId) {
  const rows = await query(db,
    "SELECT scope,revision FROM roster_scopes WHERE school_id=? ORDER BY scope LIMIT 10001", [schoolId]);
  requireValue(rows.length <= 10000, "REPORT_BOUNDS", 413);
  return canonical(rows);
}

function rankingQuota(c, today) {
  const published = c.workloadEvidence?.sourceKind === "publication" &&
    c.publication?.publicationId && c.workloadEvidence.sourceId === c.publication.publicationId
      ? c.publication.publicationId : null;
  const teachers = new Map((c.days[today]?.teachers || []).map(row => [row.staffId, row]));
  return {
    // This adapter is the source's projection for this requested date only.
    from: today, to: today,
    source: published ? { versionId: published } : null,
    teachingEvidenceVersion: published ? 1 : null,
    rows: (c.publication?.rows || []).map(row => ({
      ...row, id: row.staffId,
      R: teachers.get(row.staffId)?.R ?? null,
      teachingPeriods: row.teaching,
      teachingVerified: row.quality === "verified" && Number.isFinite(row.teaching) && row.teaching >= 0,
    })),
  };
}

export async function statisticsReport(ctx, operation, recordContext) {
  const { env, principal, body, now } = ctx, schoolId = principal.schoolId;
  requireValue(principal.capabilities.some(c => ["admin", "roster.admin", "roster.read"].includes(c)),
    "CAPABILITY_DENIED", 403);
  const today = localDate(now), annual = operation === "statisticsRPercent";
  const range = requestedDates(annual
    ? { from: today.slice(0, 4) + "-01-01", to: today.slice(0, 4) + "-12-31" }
    : { from: body.from || today.slice(0, 4) + "-01-01", to: body.to || today }, now);
  requireValue(annual || range.dates.length <= 366, "DATE_RANGE_BOUNDS", 400);
  requireValue(body.knownKey == null || typeof body.knownKey === "string" && body.knownKey.length <= 128,
    "INVALID_INPUT", 400);
  const before = await ownerScopes(env.DB, schoolId);
  const loaded = await loadState(env.DB, schoolId, range);
  // Historic accounting needs the entire owner range, but current eligibility
  // and workload require only today's projection, not a year of baseline reads.
  const c = annual
    ? await context(ctx, loaded, requestedDates({ date: today }, now), { needsQuota: true })
    : await recordContext(ctx, loaded, range);
  c.user = { ...c.user, smc: true }; // the current roster.read capability was enforced above
  const revision = await digest({ scopes: before, contacts: c.projection?.revision ?? null,
    ...(annual ? { workload: c.workloadSnapshot } : {}) });
  loaded.state.revision = revision;
  const report = annual
    ? Statistics.fairness(loaded.state, c, rankingQuota(c, today))
    : Statistics.project(loaded.state, c, range);
  requireValue(await ownerScopes(env.DB, schoolId) === before, "REPORT_CHANGED", 409,
    "Roster changed while this report was loading. Retry loading the report.");
  if (annual) {
    report.workloadEvidence = c.workloadEvidence;
    if (c.workloadEvidence?.quality === "estimated")
      report.warnings.push("Estimated current workload. Captured historical quotas and completed work are unchanged.");
    return report;
  }
  const { checkedAt, ...content } = report, key = await digest(content);
  if (body.knownKey === key)
    return { schema: 1, unchanged: true, key, checkedAt, revision, today };
  const data = canonical(report), bytes = new TextEncoder().encode(data).length;
  requireValue(bytes <= 12000000, "REPORT_BOUNDS", 413);
  return { schema: 1, encoding: "json-v1", data, bytes, key, checkedAt, revision, today };
}
