/* Authoritative v1 Roster read-only /edge/archive projections and archiveColdOutput (F10). */
import Statistics from "../../../shared/roster-statistics.js";
import { ApiError, requireValue } from "../../runtime/errors.mjs";
import { digest, one, query } from "../../runtime/store.mjs";
import {
  dateOnly,
  loadState,
  localDate,
  requestedDates,
  scopeChange,
  scopeRevision,
  writeArtifact,
} from "./repository.mjs";

const ALLOWED_VIEWS = new Set([
  "history",
  "statistics",
  "calculations",
  "openingBalances",
]);

function parseRecordData(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed.data ?? parsed : {};
  } catch {
    return {};
  }
}

async function archiveMetadata(db, schoolId, now) {
  const row = await one(
    db,
    "SELECT payload_json FROM roster_records WHERE school_id=? AND collection='coldArchive' AND record_id='index'",
    [schoolId],
  );
  const index = row ? parseRecordData(row.payload_json) : null;
  const throughDate =
    index?.lastRun?.throughDate &&
    /^20\d\d-\d\d-\d\d$/.test(index.lastRun.throughDate)
      ? index.lastRun.throughDate
      : localDate(now);
  return {
    readOnly: true,
    throughDate,
    id: index?.lastRun?.id || `roster-archive:${schoolId}:${throughDate}`,
    months: Array.isArray(index?.months) ? index.months : [],
    lastRun: index?.lastRun || null,
  };
}

function hasCap(principal, cap) {
  const caps = Array.isArray(principal?.capabilities)
    ? principal.capabilities
    : [];
  return caps.includes("admin") || caps.includes(cap);
}

export async function handleEdgeArchive(ctx, { recordContext }) {
  const schoolId = ctx.principal.schoolId;
  const body = ctx.body || {};
  const view = String(body.view || "").trim();
  requireValue(
    ALLOWED_VIEWS.has(view),
    "INVALID_ARCHIVE_VIEW",
    400,
    "Choose an available archive view.",
  );

  const archive = await archiveMetadata(ctx.env.DB, schoolId, ctx.now);
  const archiveHeader = {
    readOnly: true,
    throughDate: archive.throughDate,
    id: archive.id,
  };

  if (view === "history") {
    const staffId = ctx.principal.staffId || "";
    const offset = Number.isInteger(body.offset) && body.offset >= 0 ? body.offset : 0;
    const limit = Math.min(
      100,
      Math.max(1, Number.isInteger(body.limit) ? body.limit : 30),
    );
    const ledgerRows = await query(
      ctx.env.DB,
      `SELECT duty_id, correction_revision, staff_id, service_date, period, period_count, charge, assignment_json, recorded_at
       FROM roster_ledger
       WHERE school_id=? AND staff_id=?
       ORDER BY service_date DESC, period DESC, duty_id DESC
       LIMIT ? OFFSET ?`,
      [schoolId, staffId, limit + 1, offset],
    );
    const hasMore = ledgerRows.length > limit;
    const pageRows = ledgerRows.slice(0, limit).map((row) => {
      let assignment = {};
      try {
        assignment = JSON.parse(row.assignment_json || "{}");
      } catch {}
      return {
        id: `${row.duty_id}:${row.correction_revision}`,
        date: row.service_date,
        period: row.period,
        kind: "published",
        assignment: {
          className: assignment.className || "",
          groupName: assignment.groupName || "",
          subject: assignment.subject || "",
          venue: assignment.venue || "",
          absentName: assignment.absentName || assignment.absentTeacher || "",
          instructions: assignment.instructions || "",
        },
        instructions: assignment.instructions || "",
        customInstructions: assignment.customInstruction || "",
        publishedAt: row.recorded_at
          ? new Date(Number(row.recorded_at)).toISOString()
          : null,
      };
    });
    return {
      archive: archiveHeader,
      history: pageRows,
      nextOffset: hasMore ? offset + limit : null,
    };
  }

  if (view === "calculations") {
    const staffId = ctx.principal.staffId || "";
    const year = archive.throughDate.slice(0, 4);
    const [ledgerRows, weeklyRows, openingRow] = await Promise.all([
      query(
        ctx.env.DB,
        "SELECT service_date, charge FROM roster_ledger WHERE school_id=? AND staff_id=? AND service_date LIKE ? ORDER BY service_date ASC",
        [schoolId, staffId, `${year}-%`],
      ),
      query(
        ctx.env.DB,
        "SELECT week, quota, excluded FROM roster_weekly WHERE school_id=? AND staff_id=? AND week LIKE ? ORDER BY week ASC",
        [schoolId, staffId, `${year}-%`],
      ),
      one(
        ctx.env.DB,
        "SELECT cutoff, charge FROM roster_openings WHERE school_id=? AND staff_id=? AND year=?",
        [schoolId, staffId, year],
      ),
    ]);
    const completed =
      Number(openingRow?.charge || 0) +
      ledgerRows.reduce((sum, r) => sum + Number(r.charge || 0), 0);
    const entitlement = weeklyRows
      .filter((r) => !r.excluded)
      .reduce((sum, r) => sum + Number(r.quota || 0), 0);
    const percentage =
      entitlement > 0 ? Math.round((completed / entitlement) * 10000) / 100 : null;
    const throughWeek = weeklyRows.length ? weeklyRows.at(-1).week : null;
    return {
      archive: archiveHeader,
      completion: {
        from: `${year}-01-01`,
        to: archive.throughDate,
        completed,
        entitlement,
        percentage,
        throughWeek,
        historyVerified: weeklyRows.length > 0 || !!openingRow,
        reason:
          entitlement > 0
            ? ""
            : "No recorded weekly quota is available for this period.",
      },
    };
  }

  if (view === "statistics") {
    requireValue(
      hasCap(ctx.principal, "roster.read"),
      "CAPABILITY_DENIED",
      403,
      "Your account does not have access to archive statistics.",
    );
    const from = dateOnly(body.from || `${archive.throughDate.slice(0, 4)}-01-01`);
    const to = dateOnly(body.to || archive.throughDate);
    requireValue(
      from <= to && (Date.parse(to) - Date.parse(from)) / 86400000 < 366,
      "DATE_RANGE_BOUNDS",
      400,
      "Choose a valid date range of up to 366 days.",
    );
    const range = requestedDates({ from, to }, ctx.now);
    const loaded = await loadState(ctx.env.DB, schoolId, range);
    const c = await recordContext(ctx, loaded, range);
    c.user = { ...c.user, smc: true };
    const report = Statistics.project(loaded.state, c, range);
    return {
      archive: archiveHeader,
      schema: 1,
      from,
      to,
      absenceRows: Array.isArray(report.absenceRows) ? report.absenceRows : [],
      activityRows: Array.isArray(report.activityRows) ? report.activityRows : [],
      importedWeekly: Array.isArray(report.importedWeekly)
        ? report.importedWeekly
        : [],
      coverage: Array.isArray(report.coverage) ? report.coverage : [],
      warnings: Array.isArray(report.warnings) ? report.warnings : [],
    };
  }

  // view === "openingBalances"
  requireValue(
    hasCap(ctx.principal, "roster.admin"),
    "CAPABILITY_DENIED",
    403,
    "Admin access is required to view archive opening balances.",
  );
  const asOfDate = body.asOfDate ? dateOnly(body.asOfDate) : archive.throughDate;
  const year = asOfDate.slice(0, 4);
  const [openings, ledgerTotals] = await Promise.all([
    query(
      ctx.env.DB,
      "SELECT staff_id, year, revision, cutoff, period_count, charge FROM roster_openings WHERE school_id=? AND year=? ORDER BY staff_id ASC",
      [schoolId, year],
    ),
    query(
      ctx.env.DB,
      "SELECT staff_id, COUNT(*) AS duty_count, SUM(period_count) AS periods, SUM(charge) AS charge FROM roster_ledger WHERE school_id=? AND service_date<=? GROUP BY staff_id ORDER BY staff_id ASC",
      [schoolId, asOfDate],
    ),
  ]);
  const byStaff = new Map();
  for (const row of openings) {
    byStaff.set(row.staff_id, {
      staffId: row.staff_id,
      openingPeriods: Number(row.period_count || 0),
      openingCharge: Number(row.charge || 0),
      cutoff: row.cutoff,
      recordedPeriods: 0,
      recordedCharge: 0,
    });
  }
  for (const row of ledgerTotals) {
    const entry = byStaff.get(row.staff_id) || {
      staffId: row.staff_id,
      openingPeriods: 0,
      openingCharge: 0,
      cutoff: asOfDate,
      recordedPeriods: 0,
      recordedCharge: 0,
    };
    entry.recordedPeriods = Number(row.periods || 0);
    entry.recordedCharge = Number(row.charge || 0);
    byStaff.set(row.staff_id, entry);
  }
  return {
    archive: archiveHeader,
    asOfDate,
    year,
    rows: [...byStaff.values()].sort((a, b) =>
      a.staffId.localeCompare(b.staffId),
    ),
  };
}

export async function handleArchiveColdOutput(ctx, { prepared, commit }) {
  const schoolId = ctx.principal.schoolId;
  const throughDate = ctx.body?.throughDate
    ? dateOnly(ctx.body.throughDate)
    : localDate(ctx.now);

  const op = await prepared(ctx, "roster.archiveColdOutput", {
    operation: "archiveColdOutput",
    throughDate,
  });
  if (op.receipt) return { ...op.receipt.result, receipt: op.receipt };

  const configRevision = await scopeRevision(ctx.env.DB, schoolId, "config");
  const [ledgerRows, publicationRows, openingRows] = await Promise.all([
    query(
      ctx.env.DB,
      "SELECT duty_id, correction_revision, staff_id, service_date, period, period_count, charge, completion_basis, recorded_at FROM roster_ledger WHERE school_id=? AND service_date<=? ORDER BY service_date ASC, duty_id ASC LIMIT 10000",
      [schoolId, throughDate],
    ),
    query(
      ctx.env.DB,
      "SELECT publication_id, service_date, sequence, source_digest, created_at FROM roster_publications WHERE school_id=? AND service_date<=? ORDER BY service_date ASC, sequence ASC LIMIT 5000",
      [schoolId, throughDate],
    ),
    query(
      ctx.env.DB,
      "SELECT staff_id, year, cutoff, period_count, charge FROM roster_openings WHERE school_id=? ORDER BY year ASC, staff_id ASC LIMIT 5000",
      [schoolId],
    ),
  ]);

  const monthsMap = new Map();
  for (const row of ledgerRows) {
    const month = String(row.service_date || "").slice(0, 7);
    if (!month) continue;
    const entry = monthsMap.get(month) || {
      month,
      duties: 0,
      publications: 0,
    };
    entry.duties++;
    monthsMap.set(month, entry);
  }
  for (const row of publicationRows) {
    const month = String(row.service_date || "").slice(0, 7);
    if (!month) continue;
    const entry = monthsMap.get(month) || {
      month,
      duties: 0,
      publications: 0,
    };
    entry.publications++;
    monthsMap.set(month, entry);
  }
  const months = [...monthsMap.values()].sort((a, b) =>
    a.month.localeCompare(b.month),
  );

  const snapshot = {
    schemaVersion: 1,
    schoolId,
    operationId: op.operationId,
    throughDate,
    capturedAt: new Date(ctx.now).toISOString(),
    deletionEnabled: false,
    months,
    counts: {
      ledger: ledgerRows.length,
      publications: publicationRows.length,
      openings: openingRows.length,
    },
    ledger: ledgerRows,
    publications: publicationRows,
    openings: openingRows,
  };

  // Write immutable verified cold-output archive artifact to private R2; NEVER delete D1/R2 records.
  const artifact = await writeArtifact(
    ctx.env.ARTIFACTS,
    schoolId,
    "cold-archive",
    snapshot,
  );
  const readBack = await ctx.env.ARTIFACTS?.get(artifact.key);
  if (!readBack || (await digest(await readBack.text())) !== artifact.digest) {
    throw new ApiError(
      "ARCHIVE_VERIFICATION_FAILED",
      503,
      "Archive artifact could not be verified after write.",
    );
  }

  const lastRun = {
    id: op.operationId,
    at: new Date(ctx.now).toISOString(),
    throughDate,
    artifactKey: artifact.key,
    digest: artifact.digest,
    recordCount:
      ledgerRows.length + publicationRows.length + openingRows.length,
    deletionEnabled: false,
  };
  const archivePayload = { months, lastRun };
  const sc = scopeChange(schoolId, "config", configRevision);
  const output = {
    revision: configRevision + 1,
    archive: archivePayload,
    deletionEnabled: false,
    retained: true,
  };

  return commit(ctx, op, {
    guards: [sc.guard],
    writes: [
      sc.write,
      {
        sql: "INSERT INTO roster_records(school_id,collection,record_id,service_date,staff_id,year,revision,payload_json) VALUES(?,'coldArchive','index',?,NULL,?,1,?) ON CONFLICT(school_id,collection,record_id) DO UPDATE SET revision=revision+1,service_date=excluded.service_date,year=excluded.year,payload_json=excluded.payload_json",
        args: [
          schoolId,
          throughDate,
          throughDate.slice(0, 4),
          JSON.stringify({ kind: "scalar", data: archivePayload }),
        ],
      },
    ],
    result: output,
    audit: {
      operation: "archiveColdOutput",
      throughDate,
      artifactKey: artifact.key,
      digest: artifact.digest,
      deletionEnabled: false,
    },
  });
}
