import { one, query } from "../../runtime/store.mjs";
import { requireValue } from "../../runtime/errors.mjs";
import { calculate } from "./model.mjs";

/** Saved planning projections are estimates, never immutable publications.
 * Roster independently revalidates current Contacts authority and employment.
 * No extra access to Contacts' Deploy-only projection is granted here.
 */
export async function rosterWorkload(ctx, { loadVersion, currentPublication }) {
  const schoolId = ctx.principal.schoolId;
  const pointer = await one(ctx.env.DB, "SELECT publication_id FROM deploy_pointer WHERE school_id=?", [schoolId]);
  if (pointer) return currentPublication(); // Missing/corrupt publication is still an error.
  const date = ctx.body.date;
  requireValue(/^20\d\d-\d\d-\d\d$/.test(date || ""), "INVALID_DATE");
  const candidates = await query(ctx.env.DB,
    "SELECT id FROM deploy_versions WHERE school_id=? AND deleted=0 AND (COALESCE(json_extract(metadata,'$.from'),'')='' OR json_extract(metadata,'$.from')<=?) AND (COALESCE(json_extract(metadata,'$.to'),'')='' OR json_extract(metadata,'$.to')>=?) ORDER BY created_at DESC,id DESC LIMIT 1",
    [schoolId, date, date]);
  const dependencies = [{ owner: "deploy", scope: "publication", revision: "absent", validUntil: ctx.principal.validUntil }];
  if (!candidates.length) return { schoolId, rows: [], calculationVersion: "deploy-workload/1",
    workloadEvidence: { quality: "estimated", sourceKind: "unavailable", sourceId: null, sourceRevision: null,
      reason: "No saved Deploy planning version covers this date. Unknown R is not zero." }, dependencies };
  const { doc, version } = await loadVersion(ctx.env.DB, schoolId, candidates[0].id);
  // These are the accepted projections already retained by this saved version.
  // Current Roster authority is separate; cached names/tags never grant access.
  // Zero is the calculator's legacy projected-row sentinel here, not a
  // Contacts read observation. This adapter never emits Contacts as-of proof.
  const calculation = calculate(doc, { schoolId, asOf: 0, revision: "planning:" + version.id + ":" + version.revision,
    staff: doc.teachers.map(t => ({ ...t, staffId: t.id, revision: t.contactsRevision })) });
  dependencies.push({ owner: "deploy", scope: "planning:" + version.id,
    revision: String(version.revision), validUntil: ctx.principal.validUntil });
  return { schoolId, schemaVersion: 1, calculationVersion: calculation.calculationVersion,
    settingsRevision: calculation.settingsRevision, subjectCategories: calculation.subjectCategories,
    rows: calculation.rows.map(row => ({ ...row,
      contactsRevision: doc.teachers.find(t => t.id === row.staffId)?.contactsRevision || null,
      quality: row.quality === "unavailable" ? "unavailable" : "estimated",
      budget: row.weeklyBudget, weightedWi: row.Wi, periodCap: row.cap,
      actualWorkload: row.actualCapCountedWorkload })),
    workloadEvidence: { quality: "estimated", sourceKind: "saved-planning", sourceId: version.id,
      sourceName: version.name, sourceRevision: version.revision,
      reason: "Unpublished saved Deploy workload. Current authority is checked separately; automatic publication is blocked." },
    dependencies };
}
