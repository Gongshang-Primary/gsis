import { requireValue } from "./errors.mjs";
import { googleAccessToken } from "./providers.mjs";
import { query, one, statement } from "./store.mjs";
import {
  driveBackupConfig,
  allocateDriveFileId,
  verifyDriveFolder,
  verifyDriveFile,
  putVerifiedDriveFile,
  sha256Bytes,
  singaporeDay,
  dailyFileName,
} from "./drive-backup.mjs";
import {
  listBackupDatasets,
  buildBackupDataset,
  encodeBackupWorkbook,
} from "./drive-backup-data.mjs";
const MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// Two bounded datasets per minute. Pending work is persisted before Google writes.
// Lease > bounded request sequence; expired workers cannot publish local receipts.
const LEASE_MS = 300000;
export function lastDailyCheck(now) {
  const day = Math.floor(now / 86400000) * 86400000;
  const check = day + 15 * 3600000 + 50 * 60000;
  return check <= now ? check : check - 86400000;
}
async function run(db, sql, args = []) {
  const r = await statement(db, sql, args).run();
  requireValue(r.success, "STORAGE_UNAVAILABLE", 503);
  return r;
}
async function assertLease(env, token, now) {
  const row = await one(
    env.DB,
    "SELECT lease_token,lease_until FROM drive_backup_control WHERE school_id=?",
    [env.SCHOOL_ID],
  );
  requireValue(
    row?.lease_token === token && row.lease_until > now,
    "DRIVE_BACKUP_LEASE_LOST",
    409,
  );
}
async function fencedRun(env, token, sql, args = []) {
  const assertion = crypto.randomUUID();
  const out = await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO drive_backup_assertions(id,ok) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM drive_backup_control WHERE school_id=? AND lease_token=? AND lease_until>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) THEN 1 ELSE 0 END)",
      [assertion, env.SCHOOL_ID, token],
    ),
    statement(env.DB, sql, args),
    statement(env.DB, "DELETE FROM drive_backup_assertions WHERE id=?", [
      assertion,
    ]),
  ]);
  requireValue(
    out.every((r) => r.success),
    "DRIVE_BACKUP_LEASE_LOST",
    409,
  );
  return out[1];
}
async function saveStatus(env, dataset, input, token) {
  await fencedRun(
    env,
    token,
    `INSERT INTO drive_backup_status(school_id,dataset,name,source_digest,verified_digest,status,checked_at,source_observed_at,last_error,importable) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(school_id,dataset) DO UPDATE SET name=excluded.name,source_digest=excluded.source_digest,verified_digest=excluded.verified_digest,status=excluded.status,checked_at=excluded.checked_at,source_observed_at=excluded.source_observed_at,last_error=excluded.last_error,importable=excluded.importable`,
    [
      env.SCHOOL_ID,
      dataset.id,
      dataset.name,
      input.sourceDigest ?? null,
      input.verifiedDigest ?? null,
      input.status,
      input.checkedAt ?? null,
      input.observedAt ?? null,
      input.error ?? null,
      dataset.importable ? 1 : 0,
    ],
  );
}
async function uploadPending(env, config, file, dataset, token, now) {
  requireValue(
    file.folder_id === config.folderId,
    "DRIVE_BACKUP_FOLDER_CHANGED",
    409,
  );
  const object = await env.ARTIFACTS.get(file.artifact_key);
  requireValue(object, "DRIVE_BACKUP_ARTIFACT_MISSING", 409);
  requireValue(
    object.size === file.bytes && object.size <= 8 * 1024 * 1024,
    "DRIVE_BACKUP_ARTIFACT_INTEGRITY",
    409,
  );
  const bytes = new Uint8Array(await object.arrayBuffer());
  requireValue(
    bytes.length === file.bytes && (await sha256Bytes(bytes)) === file.sha256,
    "DRIVE_BACKUP_ARTIFACT_INTEGRITY",
    409,
  );
  await assertLease(env, token, Date.now());
  // Older-day attempts are reconciliation-only. Deliberate historical deletion is
  // never undone; a new source revision is exported on its own current day.
  let receipt;
  if (file.day !== singaporeDay(now))
    receipt = await verifyDriveFile(env, {
      fileId: file.file_id,
      folderId: file.folder_id,
      sha256: file.sha256,
      size: file.bytes,
    });
  else
    receipt = await putVerifiedDriveFile(env, {
      fileId: file.file_id,
      folderId: file.folder_id,
      name: dailyFileName(
        file.day,
        env.SERVICE_NAME,
        dataset.name,
        dataset.extension || "xlsx",
      ),
      mimeType: dataset.mimeType || MIME,
      bytes,
      replaceSha256: file.prior_sha256,
      replaceSize: file.prior_bytes,
    });
  await assertLease(env, token, Date.now());
  await fencedRun(
    env,
    token,
    "UPDATE drive_backup_files SET state='verified',verified_at=?,updated_at=? WHERE school_id=? AND dataset=? AND day=? AND state='pending' AND sha256=?",
    [now, now, env.SCHOOL_ID, dataset.id, file.day, file.sha256],
  );
  return receipt;
}
async function processDataset(env, config, dataset, token, now) {
  const school = env.SCHOOL_ID;
  let previous = await one(
    env.DB,
    "SELECT * FROM drive_backup_status WHERE school_id=? AND dataset=?",
    [school, dataset.id],
  );
  let sourceDigest = previous?.source_digest,
    verifiedDigest = previous?.verified_digest,
    checkedAt = previous?.checked_at;
  try {
    const source = await buildBackupDataset(env, dataset, now);
    sourceDigest = source.sourceDigest;
    let pending = await one(
      env.DB,
      "SELECT * FROM drive_backup_files WHERE school_id=? AND dataset=? AND state='pending' ORDER BY day LIMIT 1",
      [school, dataset.id],
    );
    if (pending) {
      try {
        await uploadPending(env, config, pending, dataset, token, now);
        verifiedDigest = pending.source_digest;
        checkedAt = now;
      } catch (error) {
        if (
          pending.day !== singaporeDay(now) &&
          error.code === "DRIVE_BACKUP_MISSING"
        ) {
          await assertLease(env, token, Date.now());
          await fencedRun(
            env,
            token,
            "UPDATE drive_backup_files SET state='abandoned',updated_at=? WHERE school_id=? AND dataset=? AND day=? AND state='pending'",
            [now, school, dataset.id, pending.day],
          );
        } else throw error;
      }
    }
    const latest = await one(
      env.DB,
      "SELECT * FROM drive_backup_files WHERE school_id=? AND dataset=? AND state='verified' ORDER BY day DESC LIMIT 1",
      [school, dataset.id],
    );
    if (latest?.source_digest === sourceDigest) {
      requireValue(
        latest.folder_id === config.folderId,
        "DRIVE_BACKUP_FOLDER_CHANGED",
        409,
      );
      verifiedDigest = latest.source_digest;
      if (
        !checkedAt ||
        checkedAt < lastDailyCheck(now) ||
        previous?.last_error
      ) {
        await verifyDriveFile(env, {
          fileId: latest.file_id,
          folderId: latest.folder_id,
          sha256: latest.sha256,
          size: latest.bytes,
        });
        checkedAt = now;
      }
      await assertLease(env, token, Date.now());
      await saveStatus(
        env,
        dataset,
        {
          sourceDigest,
          verifiedDigest,
          status: "current",
          checkedAt,
          observedAt: now,
        },
        token,
      );
      return;
    }
    // A deliberately deleted historical receipt with unchanged facts stays missing.
    const missing = await one(
      env.DB,
      "SELECT * FROM drive_backup_files WHERE school_id=? AND dataset=? AND source_digest=? AND state='abandoned' LIMIT 1",
      [school, dataset.id, sourceDigest],
    );
    if (missing) {
      await saveStatus(
        env,
        dataset,
        {
          sourceDigest,
          verifiedDigest,
          status: "missing",
          checkedAt,
          observedAt: now,
          error: "DRIVE_BACKUP_MISSING",
        },
        token,
      );
      return;
    }
    const day = singaporeDay(now),
      today = await one(
        env.DB,
        "SELECT * FROM drive_backup_files WHERE school_id=? AND dataset=? AND day=?",
        [school, dataset.id, day],
      );
    requireValue(
      !today || today.folder_id === config.folderId,
      "DRIVE_BACKUP_FOLDER_CHANGED",
      409,
    );
    const bytes = source.bytes || (await encodeBackupWorkbook(source.book)),
      hash = await sha256Bytes(bytes),
      fileId = today?.file_id || (await allocateDriveFileId(env));
    const artifactKey = `drive-backups/${school}/${env.SERVICE_NAME}/${encodeURIComponent(dataset.id)}/${day}/${hash}.${dataset.extension || "xlsx"}`;
    await env.ARTIFACTS.put(artifactKey, bytes, {
      httpMetadata: { contentType: dataset.mimeType || MIME },
    });
    await assertLease(env, token, Date.now());
    await fencedRun(
      env,
      token,
      `INSERT INTO drive_backup_files(school_id,dataset,day,file_id,folder_id,source_digest,artifact_key,sha256,bytes,prior_sha256,prior_bytes,state,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',?) ON CONFLICT(school_id,dataset,day) DO UPDATE SET source_digest=excluded.source_digest,artifact_key=excluded.artifact_key,prior_sha256=drive_backup_files.sha256,prior_bytes=drive_backup_files.bytes,sha256=excluded.sha256,bytes=excluded.bytes,state='pending',updated_at=excluded.updated_at`,
      [
        school,
        dataset.id,
        day,
        fileId,
        config.folderId,
        sourceDigest,
        artifactKey,
        hash,
        bytes.length,
        today?.sha256 ?? null,
        today?.bytes ?? null,
        now,
      ],
    );
    pending = await one(
      env.DB,
      "SELECT * FROM drive_backup_files WHERE school_id=? AND dataset=? AND day=?",
      [school, dataset.id, day],
    );
    await saveStatus(
      env,
      dataset,
      {
        sourceDigest,
        verifiedDigest,
        status: "pending",
        checkedAt,
        observedAt: now,
      },
      token,
    );
    await uploadPending(env, config, pending, dataset, token, now);
    await saveStatus(
      env,
      dataset,
      {
        sourceDigest,
        verifiedDigest: sourceDigest,
        status: "current",
        checkedAt: now,
        observedAt: now,
      },
      token,
    );
  } catch (error) {
    await assertLease(env, token, Date.now());
    await saveStatus(
      env,
      dataset,
      {
        sourceDigest,
        verifiedDigest,
        status: error.code === "DRIVE_BACKUP_MISSING" ? "missing" : "failed",
        checkedAt,
        observedAt: now,
        error: error.code || "DRIVE_BACKUP_FAILED",
      },
      token,
    );
  }
}
export async function runDriveBackups(env, now = Date.now()) {
  const config = driveBackupConfig(env);
  if (!config.enabled || !config.configured)
    return {
      state:
        config.reason === "NO_VIEWPORT"
          ? "not-applicable"
          : config.enabled
            ? "not-configured"
            : "disabled",
      reason: config.reason,
    };
  const token = crypto.randomUUID(),
    school = env.SCHOOL_ID;
  await run(
    env.DB,
    "INSERT OR IGNORE INTO drive_backup_control(school_id) VALUES(?)",
    [school],
  );
  const locked = await run(
    env.DB,
    "UPDATE drive_backup_control SET lease_token=?,lease_until=? WHERE school_id=? AND lease_until<=?",
    [token, now + LEASE_MS, school, now],
  );
  if (!locked.meta?.changes) return { state: "busy" };
  try {
    // One short-lived access token per bounded run; never written to receipts.
    env = {
      ...env,
      GOOGLE_ACCESS_TOKEN: await googleAccessToken(env, [
        "https://www.googleapis.com/auth/drive.file",
      ]),
    };
    await verifyDriveFolder(env, {
      folderId: config.folderId,
      parentId: config.rootId,
    });
    const datasets = await listBackupDatasets(env),
      control = await one(
        env.DB,
        "SELECT cursor FROM drive_backup_control WHERE school_id=?",
        [school],
      );
    const start = datasets.length ? control.cursor % datasets.length : 0,
      count = Math.min(2, datasets.length);
    for (let n = 0; n < count; n++)
      await processDataset(
        env,
        config,
        datasets[(start + n) % datasets.length],
        token,
        now,
      );
    await assertLease(env, token, Date.now());
    await run(
      env.DB,
      "UPDATE drive_backup_control SET cursor=?,last_run_at=?,updated_at=?,last_error=NULL WHERE school_id=? AND lease_token=?",
      [(start + count) % Math.max(1, datasets.length), now, now, school, token],
    );
    return { state: "checked", processed: count, total: datasets.length };
  } catch (error) {
    await run(
      env.DB,
      "UPDATE drive_backup_control SET last_error=?,last_run_at=? WHERE school_id=? AND lease_token=?",
      [error.code || "DRIVE_BACKUP_FAILED", now, school, token],
    );
    return { state: "failed", reason: error.code || "DRIVE_BACKUP_FAILED" };
  } finally {
    await run(
      env.DB,
      "UPDATE drive_backup_control SET lease_token=NULL,lease_until=0 WHERE school_id=? AND lease_token=?",
      [school, token],
    );
  }
}
export async function driveBackupHealth(env, now = Date.now()) {
  const config = driveBackupConfig(env),
    base = {
      enabled: config.enabled,
      configured: config.configured,
      reason: config.reason,
      folder: config.folderName || null,
      dailyCheck: "23:50 Asia/Singapore",
      automaticDeletion: false,
      importPolicy:
        "Use each owner import preview and acceptance policy. Recovery exports do not accept authority records.",
      crossOwnerAtomic: false,
    };
  if (!config.enabled || !config.configured)
    return {
      ...base,
      state:
        config.reason === "NO_VIEWPORT"
          ? "not-applicable"
          : config.enabled
            ? "not-configured"
            : "disabled",
      datasets: [],
    };
  try {
    const control = await one(
      env.DB,
      "SELECT last_run_at,last_error FROM drive_backup_control WHERE school_id=?",
      [env.SCHOOL_ID],
    );
    const records = await query(
      env.DB,
      "SELECT * FROM drive_backup_status WHERE school_id=? ORDER BY dataset LIMIT 1501",
      [env.SCHOOL_ID],
    );
    requireValue(records.length <= 1500, "DRIVE_BACKUP_DATASET_BOUNDS", 413);
    const definitions = await listBackupDatasets(env),
      saved = new Map(records.map((r) => [r.dataset, r]));
    const datasets = definitions.map((d) => {
      const r = saved.get(d.id);
      return {
        dataset: d.id,
        name: d.name,
        status: r?.status || "never-backed-up",
        importable: d.importable,
        sourceDigest: r?.source_digest || null,
        verifiedDigest: r?.verified_digest || null,
        sourceObservedAt: r?.source_observed_at || null,
        checkedAt: r?.checked_at || null,
        checkDue: !r?.checked_at || r.checked_at < lastDailyCheck(now),
        lastError: r?.last_error || null,
      };
    });
    return {
      ...base,
      state: control?.last_error
        ? "failed"
        : !datasets.length
          ? "empty"
          : datasets.some((d) => d.status !== "current" || d.checkDue)
            ? "attention"
            : "current",
      lastRunAt: control?.last_run_at || null,
      lastError: control?.last_error || null,
      datasets,
    };
  } catch (error) {
    return {
      ...base,
      state: "unavailable",
      lastError: error.code || "BACKUP_SCHEMA_UNAVAILABLE",
      datasets: [],
    };
  }
}
