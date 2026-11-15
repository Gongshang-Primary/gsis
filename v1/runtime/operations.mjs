import {storageInventory,storagePreview,confirmStoragePrune,finishStoragePrune} from "./storage.mjs";
import { ApiError, identifier } from "./errors.mjs";
import { query, one, prepareOperation, commitOperation } from "./store.mjs";
import { admit, resolveAdmission } from "./security.mjs";
import { backupOwner } from "./backup.mjs";
import { outboxHealth } from "./jobs.mjs";
import { driveBackupHealth } from "./drive-backup-jobs.mjs";
export function systemPolicy(method, path) {
  if (method === "GET" && path === "/system/storage") return {action:"core.admin",write:false,resourceId:"storage"};
  if (method === "POST" && ["/system/storage/preview","/system/storage/confirm","/system/storage/finish"].includes(path))
    return {action:"core.admin",write:path!=="/system/storage/preview",resourceId:"storage"};
  if (
    method === "GET" &&
    [
      "/system/health",
      "/system/backup/manifest",
      "/system/backup/part",
    ].includes(path)
  )
    return { action: "core.admin", write: false, resourceId: "system" };
  if (method === "POST" && path === "/system/backup")
    return { action: "core.admin", write: true, resourceId: "backup" };
  throw new ApiError("NOT_FOUND", 404);
}
export async function systemHandle(ctx) {
  const { env, body, principal, now, path } = ctx,
    schoolId = principal.schoolId;
  if (path === "/system/storage") return storageInventory(ctx);
  if (path === "/system/storage/preview") return storagePreview(ctx);
  if (path === "/system/storage/confirm") return confirmStoragePrune(ctx);
  if (path === "/system/storage/finish") return finishStoragePrune(ctx);
  if (path === "/system/health") {
    const pending = await query(
      env.DB,
      "SELECT state,COUNT(*) count,MIN(created_at) oldest FROM product_operations WHERE school_id=? GROUP BY state",
      [schoolId],
    );
    const pins = await query(
      env.DB,
      "SELECT scope,destination,operation_id AS operationId,created_at AS createdAt,valid_until AS validUntil FROM source_pins WHERE school_id=? AND state='held' ORDER BY created_at LIMIT 100",
      [schoolId],
    );
    const backups = await query(
      env.DB,
      "SELECT operation_id AS operationId,receipt_json FROM product_operations WHERE school_id=? AND action='system.backup' AND state='committed' ORDER BY updated_at DESC LIMIT 3",
      [schoolId],
    );
    return {
      owner: env.SERVICE_NAME,
      build: env.GSIS_BUILD_COMMIT ?? "development",
      schemaVersion: 1,
      schoolId,
      observedAt: now,
      operations: pending,
      outbox: await outboxHealth(env.DB, schoolId, now),
      pins: pins.map((p) => ({ ...p, ageMs: Math.max(0, now - p.createdAt) })),
      backups: backups.map((b) => ({
        operationId: b.operationId,
        ...JSON.parse(b.receipt_json).result,
      })),
      ownership: {
        scheduler: env.SCHEDULER_OWNER,
        sender: env.SEND_OWNER,
        webhook: env.WEBHOOK_OWNER,
      },
      configured: {
        googleIdentity: !!env.GOOGLE_CLIENT_ID,
        googleProvider: !!(
          env.GOOGLE_SERVICE_ACCOUNT || env.GOOGLE_ACCESS_TOKEN
        ),
        whatsapp: !!(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
        telegram: !!env.TELEGRAM_BOT_TOKEN,
        email: !!(env.EMAIL_API_TOKEN && env.EMAIL_FROM),
      },
      driveBackup: await driveBackupHealth(env, now),
      automaticEvidenceDeletion: false,
    };
  }
  if (path === "/system/backup") {
    identifier(body.operationId);
    const op = await prepareOperation(env.DB, {
      schoolId,
      actorId: principal.actorId,
      operationId: body.operationId,
      action: "system.backup",
      intent: body,
      now,
      validUntil: principal.validUntil,
      authorization: principal,
    });
    if (op.receipt) return op.receipt;
    const admission = await admit(env, env.DB, op, principal, [], now);
    const backupId = body.operationId;
    const { manifestKey, manifest } = await backupOwner({
      db: env.DB,
      bucket: env.ARTIFACTS,
      owner: env.SERVICE_NAME,
      schoolId,
      backupId,
      now,
      sourceCommit: env.GSIS_BUILD_COMMIT,
    });
    const receipt = await commitOperation(env.DB, op, {
      now: Date.now(),
      validUntil: principal.validUntil,
      guards: [],
      writes: [],
      result: {
        backupId,
        manifestKey,
        tables: manifest.tables.length,
        objects: manifest.objects.length,
        state: "verified-owner-snapshot",
        crossOwnerAtomic: false,
      },
      audit: { kind: "backup", backupId },
      admission,
    });
    await resolveAdmission(env, env.DB, op, admission, receipt, Date.now());
    return receipt;
  }
  const backupId = identifier(body.backupId, "backupId"),
    prefix = `backups/${schoolId}/${backupId}/`;
  const key =
    path === "/system/backup/manifest" ? prefix + "manifest.json" : body.key;
  if (typeof key !== "string" || !key.startsWith(prefix))
    throw new ApiError("BACKUP_SCOPE_MISMATCH", 403);
  const receipt = await one(
    env.DB,
    "SELECT 1 ok FROM product_operations WHERE school_id=? AND operation_id=? AND action='system.backup' AND state='committed'",
    [schoolId, backupId],
  );
  if (!receipt) throw new ApiError("BACKUP_NOT_CONFIRMED", 409);
  const object = await env.ARTIFACTS.get(key);
  if (!object) throw new ApiError("BACKUP_PART_MISSING", 404);
  return new Response(object.body, {
    headers: {
      "content-type": key.endsWith(".json")
        ? "application/json"
        : "application/octet-stream",
      "content-disposition": 'attachment; filename="GSiS-private-backup-part"',
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
