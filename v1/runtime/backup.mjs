import { ApiError, requireValue, identifier } from "./errors.mjs";
import {
  canonical,
  digest,
  query,
  statement,
  operationStatus,
  abortOperation,
} from "./store.mjs";
const MAX_TABLE_ROWS = 50000,
  MAX_SQL_BYTES = 16 * 1024 * 1024,
  MAX_OBJECT_BYTES = 16 * 1024 * 1024,
  MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const schemaSQL =
  "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY type,name";
const inScope = (key, school, owner) =>
  typeof key === "string" &&
  (key.startsWith(school + "/") || key.startsWith(owner + "/" + school + "/"));
const tableName = (name) => {
  requireValue(/^[a-z][a-z0-9_]*$/.test(name), "BACKUP_SCHEMA_INVALID", 503);
  return '"' + name + '"';
};
async function verifiedPut(bucket, key, content) {
  const expected = await digest(content);
  await bucket.put(key, content);
  const read = await bucket.get(key);
  requireValue(
    read && (await digest(await read.text())) === expected,
    "BACKUP_INTEGRITY_FAILED",
    503,
  );
  return expected;
}
/** One owner snapshot uses a single D1 batch. Suite coordination must separately stop admission at cutover. */
export async function backupOwner({
  db,
  bucket,
  owner,
  schoolId,
  backupId,
  now = Date.now(),
  sourceCommit,
}) {
  identifier(owner);
  identifier(schoolId);
  identifier(backupId);
  requireValue(bucket, "BACKUP_STORE_UNAVAILABLE", 503);
  const schemaObjects = await query(db, schemaSQL);
  const schema = await query(
    db,
    "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name",
  );
  requireValue(schema.length > 0 && schema.length <= 64, "BACKUP_BOUNDS", 413);
  // Each SELECT's limit is a checked bound, never silent truncation.
  const result = await db.batch(
    schema.map((t) =>
      statement(
        db,
        `SELECT * FROM ${tableName(t.name)} LIMIT ${MAX_TABLE_ROWS + 1}`,
      ),
    ),
  );
  const tables = schema.map((t, i) => {
    requireValue(
      result[i].results.length <= MAX_TABLE_ROWS,
      "BACKUP_BOUNDS",
      413,
    );
    requireValue(
      result[i].results.every(
        (row) => !Object.hasOwn(row, "school_id") || row.school_id === schoolId,
      ),
      "BACKUP_SCOPE_MISMATCH",
      403,
    );
    return { name: t.name, sql: t.sql, rows: result[i].results };
  });
  const data = canonical({
    schemaVersion: 1,
    owner,
    schoolId,
    schemaObjects,
    tables,
  });
  requireValue(
    new TextEncoder().encode(data).length <= MAX_SQL_BYTES,
    "BACKUP_BOUNDS",
    413,
  );
  const prefix = `backups/${schoolId}/${backupId}/`,
    objects = [];
  let cursor,
    total = data.length;
  do {
    const list = await bucket.list({ limit: 100, cursor });
    for (const item of list.objects) {
      if (item.key.startsWith("backups/")) continue;
      requireValue(
        inScope(item.key, schoolId, owner),
        "BACKUP_SCOPE_MISMATCH",
        403,
      );
      requireValue(item.size <= MAX_OBJECT_BYTES, "BACKUP_BOUNDS", 413);
      const source = await bucket.get(item.key);
      requireValue(source, "BACKUP_OBJECT_MISSING", 503);
      requireValue(
        !source.customMetadata?.schoolId ||
          source.customMetadata.schoolId === schoolId,
        "BACKUP_SCOPE_MISMATCH",
        403,
      );
      const bytes = new Uint8Array(await source.arrayBuffer());
      total += bytes.length;
      requireValue(total <= MAX_TOTAL_BYTES, "BACKUP_BOUNDS", 413);
      const hash = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      const copyKey =
        prefix + "objects/" + hash + "/" + encodeURIComponent(item.key);
      await bucket.put(copyKey, bytes, {
        httpMetadata: source.httpMetadata,
        customMetadata: source.customMetadata,
      });
      const copy = await bucket.get(copyKey);
      requireValue(copy, "BACKUP_OBJECT_MISSING", 503);
      const copyHash = [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", await copy.arrayBuffer()),
        ),
      ]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      requireValue(copyHash === hash, "BACKUP_INTEGRITY_FAILED", 503);
      objects.push({
        key: item.key,
        backupKey: copyKey,
        sha256: hash,
        bytes: bytes.length,
        httpMetadata: source.httpMetadata ?? {},
        customMetadata: source.customMetadata ?? {},
      });
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  const dataKey = prefix + "database-" + (await digest(data)) + ".json",
    dataDigest = await verifiedPut(bucket, dataKey, data);
  const manifest = {
    schemaVersion: 1,
    owner,
    schoolId,
    backupId,
    createdAt: now,
    sourceCommit: sourceCommit ?? null,
    state: "verified-owner-snapshot",
    crossOwnerAtomic: false,
    data: {
      key: dataKey,
      sha256: dataDigest,
      bytes: new TextEncoder().encode(data).length,
    },
    tables: tables.map((t) => ({ name: t.name, count: t.rows.length })),
    objects,
  };
  const manifestKey = prefix + "manifest.json";
  await bucket.put(manifestKey, canonical(manifest), {
    onlyIf: { etagDoesNotMatch: "*" },
  });
  const winnerObject = await bucket.get(manifestKey);
  requireValue(winnerObject, "BACKUP_MANIFEST_MISSING", 503);
  const winner = JSON.parse(await winnerObject.text());
  requireValue(
    winner.schoolId === schoolId &&
      winner.owner === owner &&
      winner.backupId === backupId,
    "BACKUP_SCOPE_MISMATCH",
    403,
  );
  const storedData = await bucket.get(winner.data.key);
  requireValue(
    storedData &&
      (await digest(await storedData.text())) === winner.data.sha256,
    "BACKUP_INTEGRITY_FAILED",
    503,
  );
  for (const part of winner.objects) {
    const read = await bucket.get(part.backupKey);
    requireValue(read, "BACKUP_PART_MISSING", 503);
    const hash = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", await read.arrayBuffer()),
      ),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    requireValue(hash === part.sha256, "BACKUP_INTEGRITY_FAILED", 503);
  }
  return { manifestKey, manifest: winner };
}
/** Offline-only: restore into an empty isolated owner store. Never exposed as a live write endpoint. */
export async function restoreOwner({
  db,
  bucket,
  sourceBucket,
  manifestKey,
  expectedSchoolId,
  expectedOwner,
}) {
  const object = await sourceBucket.get(manifestKey);
  requireValue(object, "BACKUP_MANIFEST_MISSING", 404);
  const manifest = JSON.parse(await object.text());
  requireValue(
    manifest.schemaVersion === 1 &&
      manifest.state === "verified-owner-snapshot" &&
      manifest.schoolId === expectedSchoolId &&
      manifest.owner === expectedOwner,
    "BACKUP_SCOPE_MISMATCH",
    403,
  );
  const dataObject = await sourceBucket.get(manifest.data.key);
  requireValue(dataObject, "BACKUP_PART_MISSING", 503);
  const text = await dataObject.text();
  requireValue(
    (await digest(text)) === manifest.data.sha256,
    "BACKUP_INTEGRITY_FAILED",
    409,
  );
  const data = JSON.parse(text);
  requireValue(
    data.schoolId === expectedSchoolId &&
      data.owner === expectedOwner &&
      data.tables.length <= 64,
    "BACKUP_SCOPE_MISMATCH",
    403,
  );
  requireValue(
    data.tables.every(
      (t) =>
        Array.isArray(t.rows) &&
        t.rows.length <= MAX_TABLE_ROWS &&
        t.rows.every(
          (row) =>
            !Object.hasOwn(row, "school_id") ||
            row.school_id === expectedSchoolId,
        ),
    ),
    "BACKUP_SCOPE_MISMATCH",
    403,
  );
  const targetObjects = await bucket.list({ limit: 1 });
  requireValue(
    targetObjects.objects.length === 0,
    "RESTORE_TARGET_NOT_EMPTY",
    409,
  );
  const targetSchemaObjects = await query(db, schemaSQL);
  requireValue(
    Array.isArray(data.schemaObjects) &&
      canonical(targetSchemaObjects) === canonical(data.schemaObjects),
    "RESTORE_SCHEMA_MISMATCH",
    409,
  );
  const current = await query(
    db,
    "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name",
  );
  requireValue(
    canonical(current) ===
      canonical(data.tables.map((t) => ({ name: t.name, sql: t.sql }))),
    "RESTORE_SCHEMA_MISMATCH",
    409,
  );
  for (const table of data.tables) {
    const count = await db
      .prepare(`SELECT COUNT(*) AS n FROM ${tableName(table.name)}`)
      .first();
    requireValue(count.n === 0, "RESTORE_TARGET_NOT_EMPTY", 409);
  }
  // All parts verified before the first write; a failed restore remains an isolated unusable target.
  const objects = [];
  let bytes = 0;
  for (const part of manifest.objects) {
    requireValue(
      inScope(part.key, expectedSchoolId, expectedOwner) &&
        part.backupKey.startsWith(
          `backups/${expectedSchoolId}/${manifest.backupId}/`,
        ),
      "BACKUP_SCOPE_MISMATCH",
      403,
    );
    const read = await sourceBucket.get(part.backupKey);
    requireValue(read && read.size === part.bytes, "BACKUP_PART_MISSING", 503);
    const body = new Uint8Array(await read.arrayBuffer());
    bytes += body.length;
    requireValue(bytes <= MAX_TOTAL_BYTES, "BACKUP_BOUNDS", 413);
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", body)),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    requireValue(hash === part.sha256, "BACKUP_INTEGRITY_FAILED", 409);
    objects.push({ part, body });
  }
  for (const { part, body } of objects) {
    await bucket.put(part.key, body, {
      httpMetadata: part.httpMetadata,
      customMetadata: part.customMetadata,
    });
    const readback = await bucket.get(part.key);
    requireValue(
      readback && readback.size === part.bytes,
      "RESTORE_VERIFICATION_FAILED",
      503,
    );
    const verifiedHash = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", await readback.arrayBuffer()),
      ),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    requireValue(
      verifiedHash === part.sha256 &&
        canonical(readback.customMetadata ?? {}) ===
          canonical(part.customMetadata ?? {}),
      "RESTORE_VERIFICATION_FAILED",
      503,
    );
  }
  const writes = [];
  for (const table of data.tables)
    for (const row of table.rows) {
      const keys = Object.keys(row);
      requireValue(
        keys.every((k) => /^[a-z][a-z0-9_]*$/.test(k)),
        "BACKUP_SCHEMA_INVALID",
        409,
      );
      writes.push(
        statement(
          db,
          `INSERT INTO ${tableName(table.name)}(${keys.map(tableName).join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
          Object.values(row),
        ),
      );
    }
  for (let i = 0; i < writes.length; i += 50)
    await db.batch(writes.slice(i, i + 50));
  for (const table of data.tables) {
    const restored = await query(db, `SELECT * FROM ${tableName(table.name)}`);
    const sorted = (v) => v.map(canonical).sort();
    requireValue(
      canonical(sorted(restored)) === canonical(sorted(table.rows)),
      "RESTORE_VERIFICATION_FAILED",
      503,
    );
  }
  const pending = await query(
    db,
    "SELECT school_id,operation_id FROM product_operations WHERE state='prepared'",
  );
  for (const row of pending) {
    const op = await operationStatus(db, row.school_id, row.operation_id);
    await abortOperation(db, op, "RESTORE_FENCED_PREPARATION", Date.now());
  }
  await statement(
    db,
    "UPDATE product_admissions SET state='aborted' WHERE school_id=? AND EXISTS(SELECT 1 FROM product_operations o WHERE o.school_id=product_admissions.school_id AND o.operation_id=product_admissions.operation_id AND o.state='aborted')",
    [expectedSchoolId],
  ).run();
  // A formerly queued job could have been sent after the snapshot. Never blindly replay it.
  await statement(
    db,
    "UPDATE product_outbox SET state='uncertain',last_code='RESTORE_REQUIRES_RECONCILIATION',lease_until=NULL WHERE school_id=? AND state IN('queued','leased')",
    [expectedSchoolId],
  ).run();
  const uncertainty = (
    await query(
      db,
      "SELECT COUNT(*) n FROM product_outbox WHERE school_id=? AND state='uncertain'",
      [expectedSchoolId],
    )
  )[0].n;
  const heldPins = (
    await query(
      db,
      "SELECT COUNT(*) n FROM source_pins WHERE school_id=? AND state='held'",
      [expectedSchoolId],
    )
  )[0].n;
  return {
    activationReady: false,
    recovery: {
      fencedPreparations: pending.length,
      uncertainJobs: uncertainty,
      unresolvedSourcePins: heldPins,
      required: "Reconcile the complete suite before activation",
    },
    state: "verified-owner-restore",
    schoolId: expectedSchoolId,
    owner: expectedOwner,
    tables: data.tables.length,
    objects: objects.length,
    sourceBackupId: manifest.backupId,
    crossOwnerAtomic: false,
  };
}
