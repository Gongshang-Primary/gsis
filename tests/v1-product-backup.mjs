import assert from "node:assert/strict";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import { backupOwner, restoreOwner } from "../v1/runtime/backup.mjs";
import {
  prepareOperation,
  commitOperation,
  operationStatus,
  one,
} from "../v1/runtime/store.mjs";
const schema =
  "CREATE TABLE evidence(school_id TEXT,id TEXT,payload TEXT,PRIMARY KEY(school_id,id));CREATE UNIQUE INDEX evidence_unique ON evidence(school_id,payload);";
const source = await createDatabase("backup", { extraSchema: schema }),
  target = await createDatabase("backup", { extraSchema: schema });
try {
  const now = Date.now(),
    op = await prepareOperation(source.db, {
      schoolId: "s",
      actorId: "a",
      operationId: "save",
      action: "core.edit",
      intent: { v: 1 },
      now,
      validUntil: now + 60000,
    });
  await syntheticAdmission(source.db, op);
  await commitOperation(source.db, op, {
    now,
    writes: [
      {
        sql: "INSERT INTO evidence VALUES(?,?,?)",
        args: [
          "s",
          "historical",
          JSON.stringify({
            snapshotId: "one",
            observationId: "read-one",
            asOf: now,
          }),
        ],
      },
    ],
    result: { saved: true },
    outbox: [{ id: "potential-send", type: "notice", payload: {}, dueAt: now }],
  });
  const pending = await prepareOperation(source.db, {
    schoolId: "s",
    actorId: "a",
    operationId: "unfinished",
    action: "core.edit",
    intent: { v: 2 },
    now,
    validUntil: now + 60000,
  });
  await syntheticAdmission(source.db, pending);
  await source.bucket.put(
    "s/immutable/snapshot.json",
    "synthetic immutable content",
  );
  const { manifestKey, manifest } = await backupOwner({
    db: source.db,
    bucket: source.bucket,
    owner: "core",
    schoolId: "s",
    backupId: "backup-one",
    now,
    sourceCommit: "synthetic",
  });
  await source.db
    .prepare(
      "UPDATE evidence SET payload=? WHERE school_id='s' AND id='historical'",
    )
    .bind(
      JSON.stringify({
        snapshotId: "later",
        observationId: "later-read",
        asOf: now + 1,
      }),
    )
    .run();
  const repeated = await backupOwner({
    db: source.db,
    bucket: source.bucket,
    owner: "core",
    schoolId: "s",
    backupId: "backup-one",
    now: now + 1,
    sourceCommit: "later",
  });
  assert.deepEqual(
    repeated.manifest,
    manifest,
    "backup identity is immutable even when source changes before a retry",
  );
  await source.restart();
  const result = await restoreOwner({
    db: target.db,
    bucket: target.bucket,
    sourceBucket: source.bucket,
    manifestKey,
    expectedSchoolId: "s",
    expectedOwner: "core",
  });
  assert.equal(result.state, "verified-owner-restore");
  assert.equal(result.activationReady, false);
  assert.equal(result.recovery.fencedPreparations, 1);
  assert.equal(result.recovery.uncertainJobs, 1);
  await target.restart();
  assert.equal(
    (await operationStatus(target.db, "s", "unfinished")).state,
    "aborted",
  );
  assert.equal(
    (
      await one(
        target.db,
        "SELECT state FROM product_admissions WHERE operation_id='unfinished'",
      )
    ).state,
    "aborted",
  );
  assert.equal(
    (
      await one(
        target.db,
        "SELECT state FROM product_outbox WHERE job_id='potential-send'",
      )
    ).state,
    "uncertain",
  );
  assert.deepEqual(
    (await operationStatus(target.db, "s", "save")).receipt.result,
    { saved: true },
  );
  assert.equal(
    JSON.parse((await one(target.db, "SELECT payload FROM evidence")).payload)
      .observationId,
    "read-one",
  );
  assert.equal(
    await (await target.bucket.get("s/immutable/snapshot.json")).text(),
    "synthetic immutable content",
  );
  await assert.rejects(
    restoreOwner({
      db: target.db,
      bucket: target.bucket,
      sourceBucket: source.bucket,
      manifestKey,
      expectedSchoolId: "s",
      expectedOwner: "core",
    }),
    (e) => e.code === "RESTORE_TARGET_NOT_EMPTY",
  );
  await assert.rejects(
    restoreOwner({
      db: target.db,
      bucket: target.bucket,
      sourceBucket: source.bucket,
      manifestKey,
      expectedSchoolId: "other",
      expectedOwner: "core",
    }),
    (e) => e.code === "BACKUP_SCOPE_MISMATCH",
  );
  const wrongSchema = await createDatabase("backup", { extraSchema: schema });
  try {
    await wrongSchema.db.prepare("DROP INDEX evidence_unique").run();
    await assert.rejects(
      restoreOwner({
        db: wrongSchema.db,
        bucket: wrongSchema.bucket,
        sourceBucket: source.bucket,
        manifestKey,
        expectedSchoolId: "s",
        expectedOwner: "core",
      }),
      (e) => e.code === "RESTORE_SCHEMA_MISMATCH",
    );
  } finally {
    await wrongSchema.close();
  }
  await source.bucket.put("foreign-school/private", "foreign");
  await assert.rejects(
    backupOwner({
      db: source.db,
      bucket: source.bucket,
      owner: "core",
      schoolId: "s",
      backupId: "scope-denied",
    }),
    (e) => e.code === "BACKUP_SCOPE_MISMATCH",
  );
  await source.bucket.delete("foreign-school/private");
  const corruptTarget = await createDatabase("backup", { extraSchema: schema });
  try {
    await corruptTarget.bucket.put("unexpected", "nonempty");
    await assert.rejects(
      restoreOwner({
        db: corruptTarget.db,
        bucket: corruptTarget.bucket,
        sourceBucket: source.bucket,
        manifestKey,
        expectedSchoolId: "s",
        expectedOwner: "core",
      }),
      (e) => e.code === "RESTORE_TARGET_NOT_EMPTY",
    );
    await corruptTarget.bucket.delete("unexpected");
    const badBucket = {
      list: (...args) => corruptTarget.bucket.list(...args),
      get: (...args) => corruptTarget.bucket.get(...args),
      put: (key, body, options) =>
        corruptTarget.bucket.put(key, "corrupted after transfer", options),
    };
    await assert.rejects(
      restoreOwner({
        db: corruptTarget.db,
        bucket: badBucket,
        sourceBucket: source.bucket,
        manifestKey,
        expectedSchoolId: "s",
        expectedOwner: "core",
      }),
      (e) => e.code === "RESTORE_VERIFICATION_FAILED",
    );
    assert.equal(
      (await one(corruptTarget.db, "SELECT COUNT(*) n FROM evidence")).n,
      0,
      "failed R2 verification precedes D1 restore",
    );
  } finally {
    await corruptTarget.close();
  }
  await source.bucket.put(manifest.data.key, "corrupt");
  await assert.rejects(
    restoreOwner({
      db: target.db,
      bucket: target.bucket,
      sourceBucket: source.bucket,
      manifestKey,
      expectedSchoolId: "s",
      expectedOwner: "core",
    }),
    (e) => e.code === "BACKUP_INTEGRITY_FAILED",
  );
  console.log(
    "PASS actual D1/R2 complete owner snapshot, independent empty-store restore, restart/receipt/evidence, scope/nonempty/corruption rejection",
  );
} finally {
  await source.close();
  await target.close();
}
