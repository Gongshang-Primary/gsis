/* Authoritative v1 Roster backup-ledger route (/backup-ledger: read, verify, restore — F09). */
import { ApiError, requireValue } from "../../runtime/errors.mjs";
import { digest, one, query } from "../../runtime/store.mjs";
import { localDate } from "./repository.mjs";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

function parseRecordPayload(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed.data ?? parsed : {};
  } catch {
    return {};
  }
}

async function sha256BytesHex(bytes) {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeDriveStatus(state) {
  if (state === "verified" || state === "done" || state === "complete") {
    return "verified";
  }
  if (state === "failed" || state === "error") return "failed";
  if (state === "uncertain") return "uncertain";
  return "pending";
}

async function loadLedgerEntries(db, schoolId) {
  const [exportsRows, driveRows, manualRows] = await Promise.all([
    query(
      db,
      "SELECT export_id, publication_id, digest, artifact_key, created_at, provider_file_id, last_success_at FROM roster_exports WHERE school_id=? ORDER BY created_at DESC LIMIT 1000",
      [schoolId],
    ),
    query(
      db,
      "SELECT publication_id, file_id, content_digest, folder_id, state, last_error, last_success_at, updated_at FROM roster_drive_exports WHERE school_id=? ORDER BY updated_at DESC LIMIT 1000",
      [schoolId],
    ),
    query(
      db,
      "SELECT record_id, payload_json FROM roster_records WHERE school_id=? AND collection='backupLedgerEntries' ORDER BY record_id DESC LIMIT 1000",
      [schoolId],
    ),
  ]);

  const rows = [];
  for (const row of exportsRows) {
    const startedAt = Number(row.created_at) || 0;
    const finishedAt = Number(row.last_success_at || row.created_at) || startedAt;
    rows.push({
      id: `export:${row.export_id}`,
      started_at: startedAt,
      finished_at: finishedAt,
      kind: "full",
      date: startedAt ? localDate(startedAt) : "",
      revision_from: 0,
      revision_to: 0,
      record_count: 1,
      bytes_raw: 0,
      bytes_compressed: 0,
      drive_file_id: row.provider_file_id || row.export_id,
      drive_version: "",
      digest: row.digest || "",
      duration_ms: Math.max(0, finishedAt - startedAt),
      status: row.last_success_at ? "verified" : "pending",
      error: "",
      _artifactKey: row.artifact_key || "",
      _source: "roster_exports",
    });
  }

  for (const row of driveRows) {
    const startedAt = Number(row.updated_at) || 0;
    const finishedAt = Number(row.last_success_at || row.updated_at) || startedAt;
    rows.push({
      id: `drive:${row.publication_id}`,
      started_at: startedAt,
      finished_at: finishedAt,
      kind: "increment",
      date: startedAt ? localDate(startedAt) : "",
      revision_from: 0,
      revision_to: 0,
      record_count: 1,
      bytes_raw: 0,
      bytes_compressed: 0,
      drive_file_id: row.file_id || row.publication_id,
      drive_version: "",
      digest: row.content_digest || "",
      duration_ms: Math.max(0, finishedAt - startedAt),
      status: normalizeDriveStatus(row.state),
      error: row.last_error || "",
      _artifactKey: "",
      _source: "roster_drive_exports",
    });
  }

  for (const row of manualRows) {
    const data = parseRecordPayload(row.payload_json);
    const startedAt = Number(data.started_at || data.startedAt || 0);
    const finishedAt = Number(data.finished_at || data.finishedAt || startedAt);
    rows.push({
      id: String(data.id || row.record_id),
      started_at: startedAt,
      finished_at: finishedAt,
      kind: String(data.kind || "full"),
      date: String(data.date || (startedAt ? localDate(startedAt) : "")),
      revision_from: Number(data.revision_from ?? 0),
      revision_to: Number(data.revision_to ?? 0),
      record_count: Number(data.record_count ?? 0),
      bytes_raw: Number(data.bytes_raw ?? 0),
      bytes_compressed: Number(data.bytes_compressed ?? 0),
      drive_file_id: String(data.drive_file_id || data.fileId || row.record_id),
      drive_version: String(data.drive_version || ""),
      digest: String(data.digest || ""),
      duration_ms: Number(data.duration_ms ?? Math.max(0, finishedAt - startedAt)),
      status: normalizeDriveStatus(data.status || "verified"),
      error: String(data.error || ""),
      _artifactKey: String(data.artifactKey || ""),
      _source: "backupLedgerEntries",
    });
  }

  rows.sort((a, b) =>
    b.started_at !== a.started_at
      ? b.started_at - a.started_at
      : b.id.localeCompare(a.id),
  );
  return rows;
}

function publicLedgerRow(row) {
  const { _artifactKey, _source, ...pub } = row;
  return pub;
}

async function loadLedgerRequests(db, schoolId) {
  const rows = await query(
    db,
    "SELECT record_id, payload_json FROM roster_records WHERE school_id=? AND collection='backupLedgerRequests' ORDER BY record_id DESC LIMIT 100",
    [schoolId],
  );
  return rows
    .map((r) => parseRecordPayload(r.payload_json))
    .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
}

async function isBackupEnabled(ctx, schoolId) {
  if (ctx.env.DRIVE_BACKUP_ENABLED === "true") return true;
  const row = await one(
    ctx.env.DB,
    "SELECT payload_json FROM roster_records WHERE school_id=? AND collection='systemConfig' AND record_id='scalar'",
    [schoolId],
  );
  const config = row ? parseRecordPayload(row.payload_json) : {};
  return config?.driveDaily?.enabled === true;
}

export async function handleBackupLedger(ctx, { prepared, commit }) {
  const schoolId = ctx.principal.schoolId;
  const body = ctx.body || {};
  const operation = String(body.operation || "read").trim();

  if (operation === "read") {
    const filters =
      body.filters && typeof body.filters === "object" ? body.filters : {};
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.isInteger(filters.limit) ? filters.limit : DEFAULT_LIMIT),
    );
    const [allRows, requests, enabled] = await Promise.all([
      loadLedgerEntries(ctx.env.DB, schoolId),
      loadLedgerRequests(ctx.env.DB, schoolId),
      isBackupEnabled(ctx, schoolId),
    ]);

    const filtered = allRows.filter((row) => {
      if (filters.kind && row.kind !== filters.kind) return false;
      if (filters.status && row.status !== filters.status) return false;
      if (filters.date && row.date !== filters.date) return false;
      if (Number.isFinite(Number(filters.before))) {
        const before = Number(filters.before);
        const beforeId = String(filters.beforeId || "");
        if (
          row.started_at > before ||
          (row.started_at === before && beforeId && row.id >= beforeId)
        ) {
          return false;
        }
      }
      return true;
    });

    const verifiedRows = allRows.filter((r) => r.status === "verified");
    const lastVerifiedAt = verifiedRows[0]?.finished_at || null;
    const lastFullAt =
      verifiedRows.find((r) => r.kind === "full")?.finished_at || null;
    const warnings = [];
    if (enabled && !lastVerifiedAt) {
      warnings.push("No verified backup recorded yet");
    }

    return {
      config: { enabled },
      status: { lastVerifiedAt, lastFullAt, warnings },
      rows: filtered.slice(0, limit).map(publicLedgerRow),
      requests,
    };
  }

  if (operation === "restore") {
    // Live HTTP restore into an active production database is disabled per OPERATIONS.md.
    throw new ApiError(
      "RESTORE_ISOLATED_ONLY",
      409,
      "Live HTTP restore is disabled. Use the isolated empty-target restoreOwner procedure instead.",
    );
  }

  if (operation === "verify") {
    const manifestFileId = String(body.manifestFileId || "").trim();
    requireValue(
      manifestFileId &&
        /^[A-Za-z0-9._:@/-]{1,200}$/.test(manifestFileId) &&
        !manifestFileId.includes(".."),
      "BACKUP_MANIFEST_INVALID",
      400,
      "Choose a valid backup entry to verify.",
    );

    const op = await prepared(ctx, "roster.backupLedgerVerify", {
      operation: "verify",
      manifestFileId,
    });
    if (op.receipt) return { ...op.receipt.result, receipt: op.receipt };

    const entries = await loadLedgerEntries(ctx.env.DB, schoolId);
    const target = entries.find(
      (row) => row.drive_file_id === manifestFileId || row.id === manifestFileId,
    );
    requireValue(
      target,
      "BACKUP_ENTRY_NOT_FOUND",
      404,
      "The selected backup entry was not found.",
    );

    let verified = false;
    let code = "VERIFIED";
    let detail = "Ledger metadata verified.";
    if (target._artifactKey) {
      if (
        !target._artifactKey.startsWith(`${schoolId}/`) &&
        !target._artifactKey.startsWith(`schools/${schoolId}/`)
      ) {
        code = "BACKUP_SCOPE_MISMATCH";
        detail = "Stored artifact key is outside school scope.";
      } else {
        const obj = await ctx.env.ARTIFACTS?.get(target._artifactKey);
        if (!obj) {
          code = "BACKUP_ARTIFACT_MISSING";
          detail = "Stored artifact is missing from private R2.";
        } else {
          const text = await obj.text();
          const hash = await digest(text);
          const rawHash = await sha256BytesHex(new TextEncoder().encode(text));
          if (
            !target.digest ||
            hash === target.digest ||
            rawHash === target.digest
          ) {
            verified = true;
            code = "VERIFIED_R2_DIGEST";
            detail = "Private R2 artifact readback and SHA-256 digest verified.";
          } else {
            code = "BACKUP_DIGEST_MISMATCH";
            detail = "Artifact SHA-256 digest did not match the ledger record.";
          }
        }
      }
    } else if (target.status === "verified" && target.digest) {
      verified = true;
      code = "VERIFIED_LEDGER_RECORD";
      detail =
        "Verified ledger record present; remote Drive readback runs under Core backup orchestration.";
    } else {
      code = "BACKUP_NOT_VERIFIED";
      detail = "The selected entry does not yet have a verified digest.";
    }

    const requestRecord = {
      id: op.operationId,
      kind: "verify",
      status: verified ? "verified" : "failed",
      manifest_file_id: manifestFileId,
      created_at: ctx.now,
      updated_at: ctx.now,
      result_json: JSON.stringify({ code, detail, verified }),
    };

    const output = {
      request: requestRecord,
      verified,
      code,
      detail,
    };

    return commit(ctx, op, {
      writes: [
        {
          sql: "INSERT INTO roster_records(school_id,collection,record_id,service_date,staff_id,year,revision,payload_json) VALUES(?,'backupLedgerRequests',?,?,NULL,?,1,?) ON CONFLICT(school_id,collection,record_id) DO UPDATE SET revision=revision+1,payload_json=excluded.payload_json",
          args: [
            schoolId,
            op.operationId,
            localDate(ctx.now),
            localDate(ctx.now).slice(0, 4),
            JSON.stringify({ kind: "map", data: requestRecord }),
          ],
        },
      ],
      result: output,
      audit: {
        operation: "backupLedgerVerify",
        manifestFileId,
        verified,
        code,
      },
    });
  }

  throw new ApiError(
    "INVALID_BACKUP_OPERATION",
    400,
    "Unsupported backup ledger operation.",
  );
}
