import { ApiError } from "../../runtime/errors.mjs";
import { canonical, digest, one } from "../../runtime/store.mjs";
import { secureEqual, serviceCall } from "../../runtime/admission.mjs";

export const MAX_BULK_IMPORT_ROWS = 500;
const MAX_BULK_IMPORT_BYTES = 512 * 1024;
const MAX_SCHOOL_EVENTS = 5000;

const need = (condition, code, message, status = 400) => {
  if (!condition) throw new ApiError(code, status, message);
};

async function validateBulkRows(ctx, p, { validateEvent }) {
  const schoolId = ctx.principal.schoolId;
  if (p.schoolId !== undefined) {
    need(
      p.schoolId === schoolId,
      "SCHOOL_MISMATCH",
      "Bulk import must target the current school.",
      403,
    );
  }
  const targetYear = Number(p.year);
  need(
    Number.isInteger(targetYear) && targetYear >= 2000 && targetYear <= 2200,
    "INVALID_YEAR",
    "Choose a supported school year.",
    400,
  );
  need(
    Array.isArray(p.events) && p.events.length > 0,
    "BULK_IMPORT_EMPTY",
    "Provide at least one event row to import.",
    400,
  );
  need(
    p.events.length <= MAX_BULK_IMPORT_ROWS,
    "BULK_IMPORT_BOUNDS",
    `Import at most ${MAX_BULK_IMPORT_ROWS} events per batch.`,
    413,
  );
  need(
    new TextEncoder().encode(canonical(p.events)).byteLength <=
      MAX_BULK_IMPORT_BYTES,
    "BULK_IMPORT_BOUNDS",
    "Bulk import payload exceeds the 512 KiB limit.",
    413,
  );

  const yearRow = await one(
    ctx.env.DB,
    "SELECT * FROM calendar_years WHERE school_id=? AND year=?",
    [schoolId, targetYear],
  );
  need(
    yearRow && yearRow.status !== "ARCHIVED",
    "YEAR_UNAVAILABLE",
    "Create an active school year first.",
    409,
  );

  const existingCountRow = await one(
    ctx.env.DB,
    "SELECT COUNT(*) AS count FROM calendar_events WHERE school_id=?",
    [schoolId],
  );
  need(
    Number(existingCountRow?.count || 0) + p.events.length <= MAX_SCHOOL_EVENTS,
    "BULK_IMPORT_BOUNDS",
    "Importing these events would exceed the school event limit.",
    413,
  );

  const needsVenues = p.events.some(
    (row) => row && typeof row === "object" && typeof row.VenueID === "string" && row.VenueID.trim(),
  );
  let venueSet = null;
  if (needsVenues) {
    const catalogue = await serviceCall(ctx.env, "venues", "/internal/catalogue", {
      schoolId,
      decisionId: ctx.principal.decisionId,
      purpose: "calendar",
    });
    venueSet = new Set((catalogue.venues || []).map((v) => v.id));
  }

  const errors = [];
  const normalized = [];
  for (let i = 0; i < p.events.length; i++) {
    const row = p.events[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push({ row: i, code: "INVALID_ROW", message: "Event row must be an object." });
      continue;
    }
    if (row.Year !== undefined && Number(row.Year) !== targetYear) {
      errors.push({
        row: i,
        code: "YEAR_MISMATCH",
        message: `Row year ${row.Year} does not match target year ${targetYear}.`,
      });
      continue;
    }
    try {
      const validated = validateEvent(
        { ...row, Year: targetYear },
        {},
        ctx.now,
        ctx.principal.actorId,
      );
      if (validated.VenueID) {
        const venueIds = validated.VenueID.split(",").map((v) => v.trim());
        if (
          venueIds.length > 6 ||
          !venueIds.every(Boolean) ||
          new Set(venueIds).size !== venueIds.length ||
          !venueIds.every((vid) => venueSet?.has(vid))
        ) {
          errors.push({
            row: i,
            code: "INVALID_VENUE",
            message: "Select up to six distinct current venues from the room directory.",
          });
          continue;
        }
        validated.VenueID = venueIds.join(",");
      }
      // Exclude ephemeral timestamps from the deterministic digest payload.
      const digestShape = { ...validated };
      delete digestShape.UpdatedAt;
      delete digestShape.UpdatedBy;
      normalized.push({ row: i, event: validated, digestShape });
    } catch (error) {
      errors.push({
        row: i,
        code: error?.code || "INVALID_EVENT",
        message: error?.message || "Invalid event row.",
      });
    }
  }

  const valid = errors.length === 0;
  const previewDigest = valid
    ? await digest({
        schemaVersion: 1,
        schoolId,
        year: targetYear,
        yearRevision: yearRow.revision,
        events: normalized.map((n) => n.digestShape),
      })
    : null;

  return {
    schoolId,
    year: targetYear,
    yearRevision: yearRow.revision,
    totalRows: p.events.length,
    valid,
    errors,
    normalized,
    previewDigest,
  };
}

export async function previewBulkImport(ctx, p, helpers) {
  const result = await validateBulkRows(ctx, p, helpers);
  return {
    year: result.year,
    yearRevision: result.yearRevision,
    totalRows: result.totalRows,
    valid: result.valid,
    validCount: result.normalized.length,
    errorCount: result.errors.length,
    errors: result.errors,
    previewDigest: result.previewDigest,
    rows: result.normalized.map((n) => ({
      row: n.row,
      StaffTitle: n.event.StaffTitle,
      StartDate: n.event.StartDate,
      EndDate: n.event.EndDate,
      EventType: n.event.EventType,
      Status: n.event.Status,
      LaneID: n.event.LaneID,
      VenueID: n.event.VenueID,
    })),
  };
}

export async function applyBulkImport(ctx, op, p, helpers) {
  need(
    typeof p.previewDigest === "string" && /^[a-f0-9]{64}$/.test(p.previewDigest),
    "PREVIEW_REQUIRED",
    "Run a bulk import preview before applying.",
    400,
  );
  const result = await validateBulkRows(ctx, p, helpers);
  need(
    result.valid,
    result.errors[0]?.code === "INVALID_VENUE"
      ? "INVALID_VENUE"
      : "BULK_IMPORT_INVALID",
    result.errors[0]?.message || "Fix bulk import validation errors before applying.",
    result.errors[0]?.code === "INVALID_VENUE" ? 409 : 400,
  );
  if (
    p.expectedYearRevision !== undefined &&
    Number(p.expectedYearRevision) !== result.yearRevision
  ) {
    throw new ApiError(
      "REVISION_CONFLICT",
      409,
      "Calendar year changed after preview. Preview again before importing.",
    );
  }
  const digestMatches = await secureEqual(p.previewDigest, result.previewDigest);
  need(
    digestMatches,
    "REVISION_CONFLICT",
    "Bulk import preview no longer matches the current year revision or payload.",
    409,
  );

  const nowIso = new Date(ctx.now).toISOString();
  const guards = [
    {
      sql: "SELECT EXISTS(SELECT 1 FROM calendar_years WHERE school_id=? AND year=? AND status<>'ARCHIVED' AND revision=?) AS ok",
      args: [result.schoolId, result.year, result.yearRevision],
    },
  ];
  const writes = [];
  const outbox = [];
  const createdIds = [];

  for (let i = 0; i < result.normalized.length; i++) {
    const base = result.normalized[i].event;
    const eventId = `bulk-${(await digest(`${op.operationId}:${i}`)).slice(0, 24)}`;
    const ev = {
      ...base,
      EventID: eventId,
      CreatedAt: nowIso,
      CreatedBy: ctx.principal.actorId,
      UpdatedAt: nowIso,
      UpdatedBy: ctx.principal.actorId,
      DeletedAt: "",
    };
    writes.push(helpers.eventWrite(result.schoolId, ev, 1));
    const intents = await helpers.syncIntents(ctx, ev, 1, writes);
    if (intents?.length) outbox.push(...intents);
    createdIds.push(eventId);
  }
  writes.push({
    sql: "UPDATE calendar_years SET revision=revision+1 WHERE school_id=? AND year=?",
    args: [result.schoolId, result.year],
  });

  return helpers.finish(
    ctx,
    op,
    guards,
    writes,
    {
      year: result.year,
      yearRevision: result.yearRevision + 1,
      importedCount: createdIds.length,
      eventIds: createdIds,
      previewDigest: result.previewDigest,
    },
    outbox,
    true,
  );
}
