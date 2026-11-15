import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";
const suite = await productSuite();
try {
  const admin = await suite.seedAccount("system-admin"),
    reader = await suite.seedAccount("system-reader", { capabilities: [] });
  assert.equal(
    (await suite.request(reader, "contacts", "/system/health")).status,
    403,
  );
  const health = await suite.request(admin, "contacts", "/system/health");
  assert.equal(health.status, 200, JSON.stringify(health.body));
  assert.equal(health.body.data.owner, "contacts");
  assert.equal(health.body.data.automaticEvidenceDeletion, false);
  assert(!JSON.stringify(health.body).includes(suite.secret));
  const backup = await suite.call(admin, "contacts", "/system/backup", {
    operationId: "system-backup",
  });
  assert.equal(backup.state, "committed");
  assert.equal(backup.result.crossOwnerAtomic, false);
  assert.deepEqual(
    await suite.call(admin, "contacts", "/system/backup", {
      operationId: "system-backup",
    }),
    backup,
  );
  const manifest = await suite.request(
    admin,
    "contacts",
    "/system/backup/manifest?backupId=system-backup",
  );
  assert.equal(manifest.status, 200, JSON.stringify(manifest.body));
  assert.equal(manifest.body.owner, "contacts");
  assert.equal(manifest.body.schoolId, "synthetic-school");
  const data = await suite.request(
    admin,
    "contacts",
    "/system/backup/part?backupId=system-backup&key=" +
      encodeURIComponent(manifest.body.data.key),
  );
  assert.equal(data.status, 200);
  assert(Array.isArray(data.body.tables));
  assert.equal(
    (
      await suite.request(
        admin,
        "contacts",
        "/system/backup/part?backupId=system-backup&key=" +
          encodeURIComponent("backups/other-school/secret"),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await suite.request(
        reader,
        "contacts",
        "/system/backup/manifest?backupId=system-backup",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await suite.request(admin, "contacts", "/system/restore", {
        method: "POST",
        body: { operationId: "no-live-restore" },
      })
    ).status,
    404,
  );
  console.log(
    "PASS actual gateway/Core-authorized owner health, durable backup receipt, private manifest/part recovery, reader/foreign-prefix/live-restore denial",
  );
} finally {
  await suite.close();
}
