import { ApiError, requireValue } from "../../runtime/errors.mjs";
import { googleAccessToken } from "../../runtime/providers.mjs";
import {
  one,
  query,
  statement,
  prepareOperation,
  commitOperation,
} from "../../runtime/store.mjs";
import {
  admit,
  resolveAdmission,
  serviceCall,
} from "../../runtime/admission.mjs";
import {
  allocateDriveFileId,
  verifyDriveRoot,
  verifyDriveFolder,
  verifyDriveFile,
  putVerifiedDriveFile,
  sha256Bytes,
  singaporeDay,
} from "../../runtime/drive-backup.mjs";
import { lastDailyCheck } from "../../runtime/drive-backup-jobs.mjs";
import {
  listBackupDatasets,
  buildBackupDataset,
  encodeBackupWorkbook,
} from "../../runtime/drive-backup-data.mjs";

export const BACKUP_OWNERS = [
  "contacts",
  "deploy",
  "roster",
  "calendar",
  "lord",
  "venues",
  "layout",
  "core",
];
const LEASE_MS = 300000;
const MAX_ACTIONS_PER_CYCLE = 2;
const MAX_ATTEMPTS = 8;
const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
const BACKOFF_MS = [60000, 300000, 900000, 3600000];
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const VALID_ID = /^[A-Za-z0-9._:@-]{1,128}$/;
const VALID_DRIVE_ID = /^[A-Za-z0-9_-]{1,200}$/;

const OWNER_LABELS = {
  contacts: "Contacts",
  deploy: "Deploy",
  roster: "Roster",
  calendar: "Calendar",
  lord: "LORD",
  venues: "Venues",
  layout: "Layout",
  core: "Core",
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
// Singapore date first, e.g. "2026 11Nov 16 — Contacts — Staff.xlsx" (plan section "Folder and file organization").
export function centralFileName(day, owner, name, extension = "xlsx") {
  requireValue(
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
      OWNER_LABELS[owner] &&
      typeof name === "string" &&
      name.length > 0 &&
      name.length <= 180 &&
      !/[\x00-\x1f\x7f/\\]/.test(name) &&
      /^[a-z0-9]{1,12}$/.test(extension),
    "DRIVE_BACKUP_NAME",
    400,
  );
  const [y, m, d] = day.split("-");
  return `${y} ${m}${MONTHS[Number(m) - 1]} ${d} — ${OWNER_LABELS[owner]} — ${name}.${extension}`;
}

export function centralBackupEnabled(env) {
  // Two explicit switches: the shared backup switch and the central-writer cutover switch.
  // Owner schedulers and the central writer must never both write the same dataset.
  return (
    env.DRIVE_BACKUP_ENABLED === "true" &&
    env.CENTRAL_DRIVE_BACKUP_ENABLED === "true"
  );
}

function retryDelay(attempts) {
  const index = Math.max(0, Math.min(BACKOFF_MS.length - 1, attempts - 1));
  return BACKOFF_MS[index];
}

function classifyError(error) {
  const code = error?.code || "DRIVE_BACKUP_FAILED";
  if (code === "DRIVE_BACKUP_TIMEOUT" || code === "DRIVE_BACKUP_WRITE_UNCERTAIN") return { jobState: "unknown", datasetStatus: "unknown", code };
  if (
    code.startsWith("GOOGLE_HELPER_") ||
    code.startsWith("GOOGLE_AUTH") ||
    code === "GOOGLE_NOT_CONFIGURED" ||
    code === "GOOGLE_TOKEN_FAILED" ||
    code === "GOOGLE_TOKEN_REVOKED" ||
    error?.status === 401
  ) {
    return { jobState: "blocked", datasetStatus: "blocked", code };
  }
  if (code === "DRIVE_BACKUP_MISSING") {
    return { jobState: "missing", datasetStatus: "missing", code };
  }
  if (
    code === "DRIVE_BACKUP_INTEGRITY" ||
    code === "DRIVE_BACKUP_SCOPE" ||
    code === "DRIVE_FOLDER_SCOPE" ||
    code === "DRIVE_BACKUP_CONFLICT"
  ) {
    return { jobState: "conflict", datasetStatus: "conflict", code };
  }
  return { jobState: "retryable", datasetStatus: "failed", code };
}

async function run(db, sql, args = []) {
  const result = await statement(db, sql, args).run();
  requireValue(result.success, "STORAGE_UNAVAILABLE", 503);
  return result;
}

async function assertLease(env, token, now) {
  const row = await one(
    env.DB,
    "SELECT lease_token,lease_until FROM core_backup_cursor WHERE school_id=?",
    [env.SCHOOL_ID],
  );
  requireValue(
    row?.lease_token === token && row.lease_until > now,
    "CORE_BACKUP_LEASE_LOST",
    409,
  );
}

async function fencedRun(env, token, now, sql, args = []) {
  const assertion = crypto.randomUUID();
  const out = await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO core_backup_assertions(id,ok) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM core_backup_cursor WHERE school_id=? AND lease_token=? AND lease_until>?) THEN 1 ELSE 0 END)",
      [assertion, env.SCHOOL_ID, token, now],
    ),
    statement(env.DB, sql, args),
    statement(env.DB, "DELETE FROM core_backup_assertions WHERE id=?", [assertion]),
  ]);
  requireValue(
    out.every((r) => r.success),
    "CORE_BACKUP_LEASE_LOST",
    409,
  );
  return out[1];
}

async function streamOwnerArtifact(env, owner, { artifactKey, sha256, bytes, mimeType }) {
  if (owner === "core") {
    requireValue(env.ARTIFACTS?.get, "STORAGE_UNAVAILABLE", 503);
    const obj = await env.ARTIFACTS.get(artifactKey);
    requireValue(obj, "DRIVE_BACKUP_ARTIFACT_MISSING", 404);
    const raw = new Uint8Array(await obj.arrayBuffer());
    requireValue(raw.length <= MAX_ARTIFACT_BYTES, "DRIVE_BACKUP_BOUNDS", 413);
    requireValue(
      raw.length === bytes && (await sha256Bytes(raw)) === sha256,
      "DRIVE_BACKUP_ARTIFACT_INTEGRITY",
      409,
    );
    return raw;
  }
  const binding = env[owner.toUpperCase()];
  requireValue(binding?.fetch && env.GSIS_SECRET, "DEPENDENCY_UNAVAILABLE", 503);
  let response;
  try {
    response = await binding.fetch(
      new Request("https://gsis.internal/internal/backup-artifact", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gsis-secret": env.GSIS_SECRET,
        },
        body: JSON.stringify({
          schoolId: env.SCHOOL_ID,
          artifactKey,
          sha256,
          mimeType,
        }),
        signal: AbortSignal.timeout(15000),
      }),
    );
  } catch {
    throw new ApiError("OWNER_EXPORT_UNAVAILABLE", 503);
  }
  requireValue(response.ok, "DRIVE_BACKUP_ARTIFACT_MISSING", response.status === 404 ? 404 : 503);
  const reader = response.body?.getReader();
  requireValue(reader, "DRIVE_BACKUP_ARTIFACT_MISSING", 503);
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      requireValue(total <= MAX_ARTIFACT_BYTES, "DRIVE_BACKUP_BOUNDS", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const raw = new Uint8Array(total);
  let offset = 0;
  for (const part of chunks) {
    raw.set(part, offset);
    offset += part.byteLength;
  }
  requireValue(
    raw.length === bytes && (await sha256Bytes(raw)) === sha256,
    "DRIVE_BACKUP_ARTIFACT_INTEGRITY",
    409,
  );
  return raw;
}

async function exportOwnerDataset(env, dataset, now) {
  if (dataset.owner === "core") {
    const coreEnv = { ...env, SERVICE_NAME: "core" };
    const datasets = await listBackupDatasets(coreEnv);
    const def = datasets.find((d) => d.id === dataset.dataset);
    requireValue(def, "BACKUP_DATASET_NOT_FOUND", 404);
    const source = await buildBackupDataset(coreEnv, def, now);
    const bytes = source.bytes || (await encodeBackupWorkbook(source.book));
    requireValue(
      bytes instanceof Uint8Array && bytes.length <= MAX_ARTIFACT_BYTES,
      "DRIVE_BACKUP_BOUNDS",
      413,
    );
    const sha256 = await sha256Bytes(bytes);
    const ext = /^[a-z0-9]{1,12}$/.test(def.extension || "xlsx")
      ? def.extension || "xlsx"
      : "xlsx";
    const safeDataset = String(def.id).replace(/[^A-Za-z0-9._-]/g, "_");
    const artifactKey = `schools/${env.SCHOOL_ID}/central-backup/${safeDataset}/${sha256}.${ext}`;
    requireValue(env.ARTIFACTS?.put, "STORAGE_UNAVAILABLE", 503);
    await env.ARTIFACTS.put(artifactKey, bytes);
    return {
      owner: "core",
      schoolId: env.SCHOOL_ID,
      dataset: def.id,
      name: def.name,
      sourceDigest: source.sourceDigest,
      sha256,
      bytes: bytes.length,
      artifactKey,
      mimeType: def.mimeType || XLSX_MIME,
      extension: ext,
      importable: !!def.importable,
      observedAt: now,
    };
  }
  try {
    return await serviceCall(env, dataset.owner, "/internal/backup-export", {
      schoolId: env.SCHOOL_ID,
      dataset: dataset.dataset,
      now,
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("OWNER_EXPORT_UNAVAILABLE", 503);
  }
}

async function updateDatasetStatus(env, token, now, dataset, patch) {
  await fencedRun(
    env,
    token,
    now,
    `UPDATE core_backup_datasets
      SET status=?,
          source_digest=COALESCE(?,source_digest),
          verified_digest=COALESCE(?,verified_digest),
          source_observed_at=COALESCE(?,source_observed_at),
          remote_verified_at=COALESCE(?,remote_verified_at),
          last_checked_at=COALESCE(?,last_checked_at),
          last_changed_at=COALESCE(?,last_changed_at),
          last_error=?,
          updated_at=?
      WHERE school_id=? AND owner=? AND dataset=?`,
    [
      patch.status,
      patch.sourceDigest ?? null,
      patch.verifiedDigest ?? null,
      patch.sourceObservedAt ?? null,
      patch.remoteVerifiedAt ?? null,
      patch.lastCheckedAt ?? null,
      patch.lastChangedAt ?? null,
      patch.lastError ?? null,
      now,
      env.SCHOOL_ID,
      dataset.owner,
      dataset.dataset,
    ],
  );
}

async function reconcileAndCompleteJob(env, driveEnv, token, dataset, job, now) {
  const today = singaporeDay(now);
  requireValue(
    job.folder_id === dataset.folder_id &&
      job.drive_id === dataset.drive_id &&
      job.root_id === dataset.root_id,
    "DRIVE_FOLDER_SCOPE",
    409,
  );
  if (job.attempts >= MAX_ATTEMPTS) {
    await updateDatasetStatus(env, token, now, dataset, {
      status: "failed",
      lastError: "DRIVE_BACKUP_MAX_ATTEMPTS",
    });
    return { owner: dataset.owner, dataset: dataset.dataset, action: "deferred-max-attempts", state: job.state };
  }

  // Always reconcile the persisted file_id first before attempting any write.
  if (job.file_id) {
    try {
      await verifyDriveFile(driveEnv, {
        fileId: job.file_id,
        folderId: job.folder_id,
        sha256: job.target_sha256,
        size: job.target_bytes,
      });
      // Remote already holds exact expected bytes and scope -> recover without re-uploading!
      await fencedRun(
        env,
        token,
        now,
        "UPDATE core_backup_jobs SET state='verifying',updated_at=? WHERE school_id=? AND operation_id=? AND generation=?",
        [now, env.SCHOOL_ID, job.operation_id, job.generation],
      );
      await fencedRun(
        env,
        token,
        now,
        "UPDATE core_backup_jobs SET state='verified',remote_verified_at=?,last_error=NULL,updated_at=? WHERE school_id=? AND operation_id=? AND generation=?",
        [now, now, env.SCHOOL_ID, job.operation_id, job.generation],
      );
      await updateDatasetStatus(env, token, now, dataset, {
        status: "current",
        sourceDigest: job.source_digest,
        verifiedDigest: job.source_digest,
        sourceObservedAt: now,
        remoteVerifiedAt: now,
        lastCheckedAt: now,
        lastError: null,
      });
      return {
        owner: dataset.owner,
        dataset: dataset.dataset,
        action: "reconciled-verified",
        fileId: job.file_id,
        state: "verified",
      };
    } catch (error) {
      if (error.code === "DRIVE_BACKUP_MISSING") {
        if (job.day !== today) {
          // Historical days are reconciliation-only; never recreate a deleted historical file.
          await fencedRun(
            env,
            token,
            now,
            "UPDATE core_backup_jobs SET state='missing',last_error='DRIVE_BACKUP_MISSING',updated_at=? WHERE school_id=? AND operation_id=? AND generation=?",
            [now, env.SCHOOL_ID, job.operation_id, job.generation],
          );
          await updateDatasetStatus(env, token, now, dataset, {
            status: "missing",
            sourceObservedAt: now,
            lastError: "DRIVE_BACKUP_MISSING",
          });
          return {
            owner: dataset.owner,
            dataset: dataset.dataset,
            action: "historical-missing",
            fileId: job.file_id,
            state: "missing",
          };
        }
        // Today's file not yet written remotely; fall through to upload using the SAME persisted file_id.
      } else if (
        error.code === "DRIVE_BACKUP_INTEGRITY" &&
        job.day === today &&
        job.prior_sha256 &&
        Number.isSafeInteger(job.prior_bytes)
      ) {
        // Check whether remote still holds the exact prior same-day version (safe conditional replace).
        try {
          await verifyDriveFile(driveEnv, {
            fileId: job.file_id,
            folderId: job.folder_id,
            sha256: job.prior_sha256,
            size: job.prior_bytes,
          });
          // Remote still matches expected prior version -> proceed with conditional replace.
        } catch {
          await fencedRun(
            env,
            token,
            now,
            "UPDATE core_backup_jobs SET state='conflict',last_error='DRIVE_BACKUP_CONFLICT',updated_at=? WHERE school_id=? AND operation_id=? AND generation=?",
            [now, env.SCHOOL_ID, job.operation_id, job.generation],
          );
          await updateDatasetStatus(env, token, now, dataset, {
            status: "conflict",
            sourceObservedAt: now,
            lastError: "DRIVE_BACKUP_CONFLICT",
          });
          return {
            owner: dataset.owner,
            dataset: dataset.dataset,
            action: "conflict",
            fileId: job.file_id,
            state: "conflict",
          };
        }
      } else {
        throw error;
      }
    }
  }

  // Upload using the persisted single file_id.
  const bytes = await streamOwnerArtifact(env, dataset.owner, {
    artifactKey: job.artifact_key,
    sha256: job.target_sha256,
    bytes: job.target_bytes,
    mimeType: job.mime_type,
  });
  await assertLease(env, token, now);
  const nextAttempts = job.attempts + 1;
  await fencedRun(
    env,
    token,
    now,
    "UPDATE core_backup_jobs SET state='writing',attempts=?,updated_at=? WHERE school_id=? AND operation_id=? AND generation=?",
    [nextAttempts, now, env.SCHOOL_ID, job.operation_id, job.generation],
  );
  await putVerifiedDriveFile(driveEnv, {
    fileId: job.file_id,
    folderId: job.folder_id,
    name: job.file_name,
    mimeType: job.mime_type,
    bytes,
    replaceSha256: job.prior_sha256 || null,
    replaceSize: Number.isSafeInteger(job.prior_bytes) ? job.prior_bytes : null,
  });
  await assertLease(env, token, now);
  await fencedRun(
    env,
    token,
    now,
    "UPDATE core_backup_jobs SET state='verifying',updated_at=? WHERE school_id=? AND operation_id=? AND generation=?",
    [now, env.SCHOOL_ID, job.operation_id, job.generation],
  );
  await fencedRun(
    env,
    token,
    now,
    "UPDATE core_backup_jobs SET state='verified',remote_verified_at=?,last_error=NULL,next_retry_at=0,updated_at=? WHERE school_id=? AND operation_id=? AND generation=?",
    [now, now, env.SCHOOL_ID, job.operation_id, job.generation],
  );
  await updateDatasetStatus(env, token, now, dataset, {
    status: "current",
    sourceDigest: job.source_digest,
    verifiedDigest: job.source_digest,
    sourceObservedAt: now,
    remoteVerifiedAt: now,
    lastCheckedAt: now,
    lastChangedAt: now,
    lastError: null,
  });
  return {
    owner: dataset.owner,
    dataset: dataset.dataset,
    action: job.prior_sha256 ? "replaced-verified" : "uploaded-verified",
    fileId: job.file_id,
    state: "verified",
  };
}

async function processRegisteredDataset(env, driveEnv, token, dataset, now) {
  const school = env.SCHOOL_ID;
  const today = singaporeDay(now);
  const dailyDue = lastDailyCheck(now);

  // 1. Reconcile any existing unresolved job for this dataset before starting new work.
  const activeJob = await one(
    env.DB,
    `SELECT * FROM core_backup_jobs
      WHERE school_id=? AND owner=? AND dataset=? AND state IN ('queued','exporting','prepared','writing','verifying','retryable','unknown','blocked')
      ORDER BY day ASC LIMIT 1`,
    [school, dataset.owner, dataset.dataset],
  );
  if (activeJob) {
    if (activeJob.next_retry_at && activeJob.next_retry_at > now) {
      return {
        owner: dataset.owner,
        dataset: dataset.dataset,
        action: "backoff-deferred",
        state: activeJob.state,
        nextRetryAt: activeJob.next_retry_at,
      };
    }
    try {
      await verifyDriveFolder(driveEnv, {
        folderId: dataset.folder_id,
        parentId: dataset.root_id,
      });
      return await reconcileAndCompleteJob(env, driveEnv, token, dataset, activeJob, now);
    } catch (error) {
      const classified = classifyError(error);
      const nextAttempts = activeJob.attempts + 1;
      const nextRetry =
        classified.jobState === "retryable" || classified.jobState === "unknown"
          ? now + retryDelay(nextAttempts)
          : 0;
      await fencedRun(
        env,
        token,
        now,
        "UPDATE core_backup_jobs SET state=?,attempts=?,next_retry_at=?,last_error=?,updated_at=? WHERE school_id=? AND operation_id=? AND generation=?",
        [
          classified.jobState,
          nextAttempts,
          nextRetry,
          classified.code,
          now,
          school,
          activeJob.operation_id,
          activeJob.generation,
        ],
      );
      await updateDatasetStatus(env, token, now, dataset, {
        status: classified.datasetStatus,
        sourceObservedAt: now,
        lastError: classified.code,
      });
      return {
        owner: dataset.owner,
        dataset: dataset.dataset,
        action: "reconcile-error",
        fileId: activeJob.file_id,
        state: classified.jobState,
        error: classified.code,
      };
    }
  }

  // 2. Observe owner source snapshot. If owner cannot be read, report unknown (never unchanged!).
  let exported;
  try {
    exported = await exportOwnerDataset(env, dataset, now);
  } catch (error) {
    await updateDatasetStatus(env, token, now, dataset, {
      status: "unknown",
      lastError: error.code || "OWNER_EXPORT_UNAVAILABLE",
    });
    return {
      owner: dataset.owner,
      dataset: dataset.dataset,
      action: "owner-unavailable",
      state: "unknown",
      error: error.code || "OWNER_EXPORT_UNAVAILABLE",
    };
  }

  // 3. Compare against latest verified backup. A months-old file stays current when source & remote agree!
  const latestVerified = await one(
    env.DB,
    `SELECT * FROM core_backup_jobs
      WHERE school_id=? AND owner=? AND dataset=? AND state='verified'
      ORDER BY day DESC LIMIT 1`,
    [school, dataset.owner, dataset.dataset],
  );
  if (latestVerified && latestVerified.source_digest === exported.sourceDigest) {
    const needsRemoteCheck =
      !dataset.last_checked_at ||
      dataset.last_checked_at < dailyDue ||
      dataset.status !== "current" ||
      !!dataset.last_error;
    if (needsRemoteCheck) {
      try {
        await verifyDriveFile(driveEnv, {
          fileId: latestVerified.file_id,
          folderId: latestVerified.folder_id,
          sha256: latestVerified.target_sha256,
          size: latestVerified.target_bytes,
        });
        await updateDatasetStatus(env, token, now, dataset, {
          status: "current",
          sourceDigest: exported.sourceDigest,
          verifiedDigest: latestVerified.source_digest,
          sourceObservedAt: now,
          remoteVerifiedAt: now,
          lastCheckedAt: now,
          lastError: null,
        });
        return {
          owner: dataset.owner,
          dataset: dataset.dataset,
          action: "verified-unchanged",
          fileId: latestVerified.file_id,
          state: "current",
        };
      } catch (error) {
        const classified = classifyError(error);
        await updateDatasetStatus(env, token, now, dataset, {
          status: classified.datasetStatus,
          sourceDigest: exported.sourceDigest,
          sourceObservedAt: now,
          lastError: classified.code,
        });
        return {
          owner: dataset.owner,
          dataset: dataset.dataset,
          action: "remote-check-failed",
          fileId: latestVerified.file_id,
          state: classified.datasetStatus,
          error: classified.code,
        };
      }
    }
    await updateDatasetStatus(env, token, now, dataset, {
      status: "current",
      sourceDigest: exported.sourceDigest,
      verifiedDigest: latestVerified.source_digest,
      sourceObservedAt: now,
      lastError: null,
    });
    return {
      owner: dataset.owner,
      dataset: dataset.dataset,
      action: "unchanged-current",
      fileId: latestVerified.file_id,
      state: "current",
    };
  }

  // 4. Unchanged source whose historical backup was explicitly marked missing stays missing.
  const missingHistorical = await one(
    env.DB,
    `SELECT * FROM core_backup_jobs
      WHERE school_id=? AND owner=? AND dataset=? AND source_digest=? AND state='missing'
      LIMIT 1`,
    [school, dataset.owner, dataset.dataset, exported.sourceDigest],
  );
  if (missingHistorical) {
    await updateDatasetStatus(env, token, now, dataset, {
      status: "missing",
      sourceDigest: exported.sourceDigest,
      sourceObservedAt: now,
      lastError: "DRIVE_BACKUP_MISSING",
    });
    return {
      owner: dataset.owner,
      dataset: dataset.dataset,
      action: "historical-missing",
      fileId: missingHistorical.file_id,
      state: "missing",
    };
  }

  // 5. New or same-day changed backup: verify folder, reserve/reuse ONE file_id, persist BEFORE upload.
  try {
    await verifyDriveFolder(driveEnv, {
      folderId: dataset.folder_id,
      parentId: dataset.root_id,
    });
    const existingToday = await one(
      env.DB,
      "SELECT * FROM core_backup_jobs WHERE school_id=? AND owner=? AND dataset=? AND day=?",
      [school, dataset.owner, dataset.dataset, today],
    );
    const fileId = existingToday?.file_id || (await allocateDriveFileId(driveEnv));
    const generation = (existingToday?.generation || 0) + 1;
    const priorSha256 =
      existingToday?.state === "verified" ? existingToday.target_sha256 : null;
    const priorBytes =
      existingToday?.state === "verified" ? existingToday.target_bytes : null;
    const operationId = `core-backup:${dataset.owner}:${dataset.dataset}:${today}:g${generation}:${crypto.randomUUID()}`;
    const fileName = centralFileName(
      today,
      dataset.owner,
      dataset.name,
      dataset.extension || exported.extension || "xlsx",
    );
    await assertLease(env, token, now);
    await fencedRun(
      env,
      token,
      now,
      `INSERT INTO core_backup_jobs(
        school_id,owner,dataset,day,operation_id,generation,state,file_id,folder_id,drive_id,root_id,
        file_name,mime_type,artifact_key,source_digest,target_sha256,target_bytes,prior_sha256,prior_bytes,
        attempts,next_retry_at,last_error,remote_verified_at,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,'prepared',?,?,?,?,?,?,?,?,?,?,?,?,0,0,NULL,NULL,?,?)
      ON CONFLICT(school_id,owner,dataset,day) DO UPDATE SET
        operation_id=excluded.operation_id,
        generation=excluded.generation,
        state='prepared',
        file_id=excluded.file_id,
        folder_id=excluded.folder_id,
        drive_id=excluded.drive_id,
        root_id=excluded.root_id,
        file_name=excluded.file_name,
        mime_type=excluded.mime_type,
        artifact_key=excluded.artifact_key,
        source_digest=excluded.source_digest,
        target_sha256=excluded.target_sha256,
        target_bytes=excluded.target_bytes,
        prior_sha256=excluded.prior_sha256,
        prior_bytes=excluded.prior_bytes,
        attempts=0,
        next_retry_at=0,
        last_error=NULL,
        updated_at=excluded.updated_at`,
      [
        school,
        dataset.owner,
        dataset.dataset,
        today,
        operationId,
        generation,
        fileId,
        dataset.folder_id,
        dataset.drive_id,
        dataset.root_id,
        fileName,
        exported.mimeType || dataset.mime_type || XLSX_MIME,
        exported.artifactKey,
        exported.sourceDigest,
        exported.sha256,
        exported.bytes,
        priorSha256,
        priorBytes,
        now,
        now,
      ],
    );
    await updateDatasetStatus(env, token, now, dataset, {
      status: "pending",
      sourceDigest: exported.sourceDigest,
      sourceObservedAt: now,
      lastChangedAt: now,
      lastError: null,
    });
    const preparedJob = await one(
      env.DB,
      "SELECT * FROM core_backup_jobs WHERE school_id=? AND operation_id=?",
      [school, operationId],
    );
    return await reconcileAndCompleteJob(env, driveEnv, token, dataset, preparedJob, now);
  } catch (error) {
    const classified = classifyError(error);
    const jobRow = await one(
      env.DB,
      "SELECT * FROM core_backup_jobs WHERE school_id=? AND owner=? AND dataset=? AND day=?",
      [school, dataset.owner, dataset.dataset, today],
    );
    if (jobRow && jobRow.state !== "verified") {
      const nextAttempts = jobRow.attempts + 1;
      const nextRetry =
        classified.jobState === "retryable" || classified.jobState === "unknown"
          ? now + retryDelay(nextAttempts)
          : 0;
      await fencedRun(
        env,
        token,
        now,
        "UPDATE core_backup_jobs SET state=?,attempts=?,next_retry_at=?,last_error=?,updated_at=? WHERE school_id=? AND operation_id=? AND generation=?",
        [
          classified.jobState,
          nextAttempts,
          nextRetry,
          classified.code,
          now,
          school,
          jobRow.operation_id,
          jobRow.generation,
        ],
      );
    }
    await updateDatasetStatus(env, token, now, dataset, {
      status: classified.datasetStatus,
      sourceDigest: exported.sourceDigest,
      sourceObservedAt: now,
      lastError: classified.code,
    });
    return {
      owner: dataset.owner,
      dataset: dataset.dataset,
      action: "write-error",
      fileId: jobRow?.file_id || null,
      state: classified.jobState,
      error: classified.code,
    };
  }
}

export async function runCentralBackupCycle(env, now = Date.now(), options = {}) {
  if (!centralBackupEnabled(env)) {
    return {
      enabled: false,
      state: "disabled",
      processed: 0,
      results: [],
    };
  }
  const school = env.SCHOOL_ID;
  const maxActions =
    Number.isSafeInteger(options.maxActions) &&
    options.maxActions >= 1 &&
    options.maxActions <= MAX_ACTIONS_PER_CYCLE
      ? options.maxActions
      : MAX_ACTIONS_PER_CYCLE;

  const token = crypto.randomUUID();
  await run(
    env.DB,
    `INSERT INTO core_backup_cursor(school_id,owner_cursor,lease_token,lease_until,updated_at)
      VALUES(?,0,?,?,?)
      ON CONFLICT(school_id) DO UPDATE SET
        lease_token=excluded.lease_token,
        lease_until=excluded.lease_until,
        updated_at=excluded.updated_at
      WHERE core_backup_cursor.lease_until<=?`,
    [school, token, now + LEASE_MS, now, now],
  );
  const cursorRow = await one(
    env.DB,
    "SELECT * FROM core_backup_cursor WHERE school_id=?",
    [school],
  );
  if (cursorRow?.lease_token !== token) {
    return { enabled: true, state: "busy", processed: 0, results: [] };
  }

  try {
    const datasets = await query(
      env.DB,
      "SELECT * FROM core_backup_datasets WHERE school_id=? ORDER BY owner, dataset LIMIT 250",
      [school],
    );
    if (!datasets.length) {
      await run(
        env.DB,
        "UPDATE core_backup_cursor SET last_run_at=?,last_cycle_check=?,last_error=NULL,updated_at=? WHERE school_id=? AND lease_token=?",
        [now, lastDailyCheck(now), now, school, token],
      );
      return { enabled: true, state: "empty", processed: 0, results: [] };
    }

    // Acquire one short-lived Drive access token for this bounded cycle; never stored in D1.
    let accessToken;
    try {
      accessToken = await googleAccessToken(env, [
        "https://www.googleapis.com/auth/drive.file",
      ]);
    } catch (error) {
      const classified = classifyError(error);
      for (const ds of datasets) {
        await updateDatasetStatus(env, token, now, ds, {
          status: classified.datasetStatus,
          lastError: classified.code,
        });
      }
      await run(
        env.DB,
        "UPDATE core_backup_cursor SET last_run_at=?,last_error=?,updated_at=? WHERE school_id=? AND lease_token=?",
        [now, classified.code, now, school, token],
      );
      return {
        enabled: true,
        state: classified.datasetStatus,
        reason: classified.code,
        processed: 0,
        results: [],
      };
    }

    const driveEnv = {
      ...env,
      GOOGLE_HELPER_ENABLED: "false",
      GOOGLE_ACCESS_TOKEN: accessToken,
    };

    // Verify each distinct registered (rootId, driveId) before any dataset write.
    const verifiedRoots = new Set();
    for (const ds of datasets) {
      const key = `${ds.root_id}:${ds.drive_id}`;
      if (verifiedRoots.has(key)) continue;
      await verifyDriveRoot(driveEnv, { rootId: ds.root_id, driveId: ds.drive_id });
      verifiedRoots.add(key);
    }

    // Fair persisted cursor: datasets are interleaved by owner (one per owner per round),
    // then a bounded window of at most two actions advances around that ring.
    const ownersPresent = BACKUP_OWNERS.filter((o) =>
      datasets.some((d) => d.owner === o),
    );
    const byOwner = new Map(
      ownersPresent.map((o) => [o, datasets.filter((d) => d.owner === o)]),
    );
    const ordered = [];
    const maxPerOwner = Math.max(
      ...ownersPresent.map((o) => byOwner.get(o).length),
      0,
    );
    for (let slot = 0; slot < maxPerOwner; slot++)
      for (const owner of ownersPresent) {
        const item = byOwner.get(owner)[slot];
        if (item) ordered.push(item);
      }
    const startAt = cursorRow.owner_cursor % ordered.length;
    const count = Math.min(maxActions, ordered.length);
    const selected = [];
    for (let n = 0; n < count; n++)
      selected.push(ordered[(startAt + n) % ordered.length]);
    const results = [];
    for (const ds of selected) {
      results.push(await processRegisteredDataset(env, driveEnv, token, ds, now));
    }
    const nextOwnerCursor = (startAt + count) % ordered.length;
    await assertLease(env, token, now);
    await run(
      env.DB,
      "UPDATE core_backup_cursor SET owner_cursor=?,last_run_at=?,last_cycle_check=?,last_error=NULL,updated_at=? WHERE school_id=? AND lease_token=?",
      [nextOwnerCursor, now, lastDailyCheck(now), now, school, token],
    );
    return {
      enabled: true,
      state: "checked",
      processed: results.length,
      totalDatasets: datasets.length,
      ownerCursor: nextOwnerCursor,
      dailyCheckBoundary: lastDailyCheck(now),
      results,
    };
  } catch (error) {
    const code = error?.code || "DRIVE_BACKUP_FAILED";
    await run(
      env.DB,
      "UPDATE core_backup_cursor SET last_run_at=?,last_error=?,updated_at=? WHERE school_id=? AND lease_token=?",
      [now, code, now, school, token],
    ).catch(() => undefined);
    return {
      enabled: true,
      state: classifyError(error).datasetStatus,
      reason: code,
      processed: 0,
      results: [],
    };
  } finally {
    await run(
      env.DB,
      "UPDATE core_backup_cursor SET lease_token=NULL,lease_until=0 WHERE school_id=? AND lease_token=?",
      [school, token],
    ).catch(() => undefined);
  }
}

export async function centralBackupHealth(env, now = Date.now()) {
  const enabled = centralBackupEnabled(env);
  const dailyDue = lastDailyCheck(now);
  const cursor = await one(
    env.DB,
    "SELECT owner_cursor,last_cycle_check,last_run_at,last_error FROM core_backup_cursor WHERE school_id=?",
    [env.SCHOOL_ID],
  );
  const rows = await query(
    env.DB,
    "SELECT * FROM core_backup_datasets WHERE school_id=? ORDER BY owner, dataset LIMIT 250",
    [env.SCHOOL_ID],
  );
  const jobs = await query(
    env.DB,
    `SELECT owner,dataset,day,operation_id,generation,state,file_id,attempts,next_retry_at,last_error,remote_verified_at,updated_at
      FROM core_backup_jobs WHERE school_id=? ORDER BY updated_at DESC LIMIT 500`,
    [env.SCHOOL_ID],
  );
  const latestJobByKey = new Map();
  for (const job of jobs) {
    const key = `${job.owner}:${job.dataset}`;
    if (!latestJobByKey.has(key)) latestJobByKey.set(key, job);
  }

  const counts = {
    current: 0,
    pending: 0,
    stale: 0,
    unknown: 0,
    missing: 0,
    failed: 0,
    blocked: 0,
    conflict: 0,
    neverBackedUp: 0,
  };

  const datasets = rows.map((r) => {
    const checkDue = !r.last_checked_at || r.last_checked_at < dailyDue;
    let effectiveStatus = r.status;
    if (effectiveStatus === "current" && checkDue) effectiveStatus = "stale";
    if (effectiveStatus === "never-backed-up") counts.neverBackedUp++;
    else if (counts[effectiveStatus] !== undefined) counts[effectiveStatus]++;
    const latestJob = latestJobByKey.get(`${r.owner}:${r.dataset}`) || null;
    return {
      owner: r.owner,
      dataset: r.dataset,
      name: r.name,
      folderId: r.folder_id,
      driveId: r.drive_id,
      rootId: r.root_id,
      importable: !!r.importable,
      writerEpoch: r.writer_epoch,
      status: effectiveStatus,
      storedStatus: r.status,
      sourceDigest: r.source_digest || null,
      verifiedDigest: r.verified_digest || null,
      sourceObservedAt: r.source_observed_at || null,
      remoteVerifiedAt: r.remote_verified_at || null,
      lastCheckedAt: r.last_checked_at || null,
      lastChangedAt: r.last_changed_at || null,
      checkDue,
      lastError: r.last_error || null,
      latestJob: latestJob
        ? {
            day: latestJob.day,
            operationId: latestJob.operation_id,
            generation: latestJob.generation,
            state: latestJob.state,
            fileId: latestJob.file_id || null,
            attempts: latestJob.attempts,
            nextRetryAt: latestJob.next_retry_at || null,
            lastError: latestJob.last_error || null,
            remoteVerifiedAt: latestJob.remote_verified_at || null,
          }
        : null,
    };
  });

  let state;
  if (!enabled) state = "disabled";
  else if (!datasets.length) state = "empty";
  else if (counts.blocked > 0) state = "blocked";
  else if (counts.conflict > 0 || counts.failed > 0 || cursor?.last_error) state = "failed";
  else if (counts.missing > 0) state = "missing";
  else if (counts.unknown > 0) state = "unknown";
  else if (counts.pending > 0) state = "pending";
  else if (counts.stale > 0 || counts.neverBackedUp > 0) state = "stale";
  else state = "current";

  return {
    enabled,
    state,
    dailyCheck: "23:50 Asia/Singapore",
    dailyCheckBoundary: dailyDue,
    automaticDeletion: false,
    crossOwnerAtomic: false,
    lastRunAt: cursor?.last_run_at || null,
    lastCycleCheck: cursor?.last_cycle_check || null,
    lastError: cursor?.last_error || null,
    counts,
    datasets,
  };
}

export async function handleCentralBackups(ctx) {
  const { env, principal, method, path, body = {}, now } = ctx;
  requireValue(
    principal?.capabilities.includes("admin") && !principal.impersonating,
    "CAPABILITY_DENIED",
    403,
  );
  if (method === "GET" && path === "/admin/backups/health") {
    const queryNow =
      body.now !== undefined && /^\d+$/.test(String(body.now))
        ? Number(body.now)
        : now;
    return centralBackupHealth(env, queryNow);
  }
  requireValue(method === "POST", "METHOD_NOT_ALLOWED", 405);

  if (path === "/admin/backups/datasets") {
    const owner = String(body.owner || "");
    const dataset = String(body.dataset || "");
    const name = String(body.name || "").trim();
    const folderId = String(body.folderId || "");
    const driveId = String(body.driveId || "");
    const rootId = String(body.rootId || "");
    const mimeType = String(body.mimeType || XLSX_MIME);
    const extension = String(body.extension || "xlsx");
    requireValue(BACKUP_OWNERS.includes(owner), "INVALID_INPUT", 400);
    requireValue(VALID_ID.test(dataset), "INVALID_INPUT", 400);
    requireValue(name.length >= 1 && name.length <= 120, "INVALID_INPUT", 400);
    requireValue(
      VALID_DRIVE_ID.test(folderId) &&
        VALID_DRIVE_ID.test(driveId) &&
        VALID_DRIVE_ID.test(rootId),
      "DRIVE_BACKUP_ID",
      400,
    );
    requireValue(/^[a-z0-9]{1,12}$/.test(extension), "INVALID_INPUT", 400);
    const op = await prepareOperation(env.DB, {
      schoolId: env.SCHOOL_ID,
      actorId: principal.actorId,
      operationId: body.operationId,
      action: "core.backups.register",
      intent: { owner, dataset, name, folderId, driveId, rootId, mimeType, extension, importable: !!body.importable },
      now,
      validUntil: principal.validUntil,
      authorization: principal,
    });
    if (op.receipt) return { ...op.receipt.result, receipt: op.receipt };
    const admission = await admit(env, env.DB, op, principal, [], now);
    const receipt = await commitOperation(env.DB, op, {
      now,
      admission,
      writes: [
        {
          sql: `INSERT INTO core_backup_datasets(
            school_id,owner,dataset,name,folder_id,drive_id,root_id,mime_type,extension,importable,updated_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(school_id,owner,dataset) DO UPDATE SET
            name=excluded.name,
            folder_id=excluded.folder_id,
            drive_id=excluded.drive_id,
            root_id=excluded.root_id,
            mime_type=excluded.mime_type,
            extension=excluded.extension,
            importable=excluded.importable,
            writer_epoch=core_backup_datasets.writer_epoch+1,
            updated_at=excluded.updated_at`,
          args: [
            env.SCHOOL_ID,
            owner,
            dataset,
            name,
            folderId,
            driveId,
            rootId,
            mimeType,
            extension,
            body.importable ? 1 : 0,
            now,
          ],
        },
      ],
      result: { owner, dataset, name, folderId, driveId, rootId, registered: true },
      audit: { kind: "core-backup-dataset-register", owner, dataset },
    });
    await resolveAdmission(env, env.DB, op, admission, receipt, now);
    return { ...receipt.result, receipt };
  }

  if (path === "/admin/backups/discover") {
    const requestedOwners = Array.isArray(body.owners) && body.owners.length
      ? body.owners.filter((o) => BACKUP_OWNERS.includes(o))
      : BACKUP_OWNERS;
    const register = body.register === true;
    const driveId = register ? String(body.driveId || "") : "";
    const rootId = register ? String(body.rootId || "") : "";
    const folderByOwner =
      body.folderByOwner && typeof body.folderByOwner === "object"
        ? body.folderByOwner
        : {};
    if (register) {
      requireValue(
        VALID_DRIVE_ID.test(driveId) && VALID_DRIVE_ID.test(rootId),
        "DRIVE_BACKUP_ID",
        400,
      );
    }
    const discovered = [];
    const errors = [];
    for (const owner of requestedOwners) {
      try {
        const res =
          owner === "core"
            ? {
                datasets: (
                  await listBackupDatasets({ ...env, SERVICE_NAME: "core" })
                ).map((d) => ({
                  id: d.id,
                  name: d.name,
                  mimeType: d.mimeType || XLSX_MIME,
                  extension: d.extension || "xlsx",
                  importable: !!d.importable,
                })),
              }
            : await serviceCall(env, owner, "/internal/backup-datasets", {
                schoolId: env.SCHOOL_ID,
              });
        for (const ds of res?.datasets || []) {
          const entry = {
            owner,
            dataset: ds.id,
            name: ds.name,
            mimeType: ds.mimeType || XLSX_MIME,
            extension: ds.extension || "xlsx",
            importable: !!ds.importable,
            adoptedFileId: ds.adoptedFileId || null,
            adoptedDay: ds.adoptedDay || null,
            adoptedSourceDigest: ds.adoptedSourceDigest || null,
            adoptedSha256: ds.adoptedSha256 || null,
            adoptedBytes: ds.adoptedBytes ?? null,
            adoptedVerifiedAt: ds.adoptedVerifiedAt ?? null,
            registered: false,
            adopted: false,
          };
          if (register) {
            const folderId = String(
              folderByOwner[owner] || ds.adoptedFolderId || rootId,
            );
            if (VALID_DRIVE_ID.test(folderId) && VALID_ID.test(entry.dataset)) {
              const hasAdoption =
                entry.adoptedFileId &&
                VALID_DRIVE_ID.test(entry.adoptedFileId) &&
                entry.adoptedDay &&
                /^\d{4}-\d{2}-\d{2}$/.test(entry.adoptedDay) &&
                entry.adoptedSha256;
              const adoptedDigest =
                entry.adoptedSourceDigest || entry.adoptedSha256 || null;
              const adoptedVerifiedAt =
                Number.isSafeInteger(entry.adoptedVerifiedAt) &&
                entry.adoptedVerifiedAt > 0
                  ? entry.adoptedVerifiedAt
                  : now;
              await run(
                env.DB,
                `INSERT INTO core_backup_datasets(
                  school_id,owner,dataset,name,folder_id,drive_id,root_id,mime_type,extension,importable,
                  status,source_digest,verified_digest,remote_verified_at,updated_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(school_id,owner,dataset) DO UPDATE SET
                  name=excluded.name,
                  folder_id=excluded.folder_id,
                  drive_id=excluded.drive_id,
                  root_id=excluded.root_id,
                  mime_type=excluded.mime_type,
                  extension=excluded.extension,
                  importable=excluded.importable,
                  source_digest=COALESCE(core_backup_datasets.source_digest,excluded.source_digest),
                  verified_digest=COALESCE(core_backup_datasets.verified_digest,excluded.verified_digest),
                  remote_verified_at=COALESCE(core_backup_datasets.remote_verified_at,excluded.remote_verified_at),
                  updated_at=excluded.updated_at`,
                [
                  env.SCHOOL_ID,
                  owner,
                  entry.dataset,
                  entry.name,
                  folderId,
                  driveId,
                  rootId,
                  entry.mimeType,
                  entry.extension,
                  entry.importable ? 1 : 0,
                  hasAdoption ? "current" : "never-backed-up",
                  hasAdoption ? adoptedDigest : null,
                  hasAdoption ? adoptedDigest : null,
                  hasAdoption ? adoptedVerifiedAt : null,
                  now,
                ],
              );
              if (hasAdoption) {
                await run(
                  env.DB,
                  `INSERT OR IGNORE INTO core_backup_jobs(
                    school_id,owner,dataset,day,operation_id,generation,state,
                    file_id,folder_id,drive_id,root_id,file_name,mime_type,
                    source_digest,target_sha256,target_bytes,remote_verified_at,created_at,updated_at
                  ) VALUES(?,?,?,?,?,1,'verified',?,?,?,?,?,?,?,?,?,?,?,?)`,
                  [
                    env.SCHOOL_ID,
                    owner,
                    entry.dataset,
                    entry.adoptedDay,
                    `adopted:${owner}:${entry.dataset}:${entry.adoptedDay}`,
                    entry.adoptedFileId,
                    folderId,
                    driveId,
                    rootId,
                    centralFileName(
                      entry.adoptedDay,
                      owner,
                      entry.name,
                      entry.extension,
                    ),
                    entry.mimeType,
                    adoptedDigest,
                    entry.adoptedSha256,
                    entry.adoptedBytes ?? null,
                    adoptedVerifiedAt,
                    now,
                    now,
                  ],
                );
              }
              entry.registered = true;
              entry.adopted = !!hasAdoption;
            }
          }
          discovered.push(entry);
        }
      } catch (err) {
        errors.push({ owner, code: err?.code || "DISCOVERY_FAILED", message: err?.message || "Discovery failed." });
      }
    }
    return {
      owners: requestedOwners,
      discovered,
      errors,
    };
  }

  if (path === "/admin/backups/run-cycle") {
    const cycleNow =
      Number.isSafeInteger(body.now) && body.now > 0 ? body.now : now;
    const maxActions =
      Number.isSafeInteger(body.maxActions) ? body.maxActions : undefined;
    return runCentralBackupCycle(env, cycleNow, { maxActions });
  }

  throw new ApiError("NOT_FOUND", 404, "Unknown Core backup operation.");
}
