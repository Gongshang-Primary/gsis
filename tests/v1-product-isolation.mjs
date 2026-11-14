import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { buildProduct, domains } from "../scripts/v1/build.mjs";
const output = await mkdtemp(join(tmpdir(), "gsis-v1-isolation-"));
try {
  await buildProduct({ output });
  const manifest = JSON.parse(
    await readFile(join(output, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.services.length, 9);
  assert.equal(manifest.productionDeployed, false);
  const databases = new Set(),
    buckets = new Set();
  for (const domain of [...domains, "web"]) {
    const config = JSON.parse(
        await readFile(join(output, domain, "wrangler.json"), "utf8"),
      ),
      worker = await readFile(join(output, domain, "worker.mjs"), "utf8");
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    assert.equal(config.vars.SEND_OWNER, "v0.9");
    assert.equal(config.vars.SCHEDULER_OWNER, "disabled");
    assert.equal(config.vars.WEBHOOK_OWNER, "v0.9");
    assert(!Object.hasOwn(config.vars, "GSIS_SECRET"));
    assert(
      !/LOCAL_TEST_TOKEN|\/__local\//.test(worker),
      "local database test transport must not enter production artifact",
    );
    assert(!/https?:\/\/script\.google(?:usercontent)?\.com/.test(worker));
    assert(!/SpreadsheetApp\.|UrlFetchApp\.|DriveApp\./.test(worker));
    if (domain === "web") {
      assert.equal(config.d1_databases, undefined);
      assert.equal(config.r2_buckets, undefined);
    } else {
      assert.equal(config.d1_databases.length, 1);
      assert.equal(config.d1_databases[0].binding, "DB");
      assert.equal(config.d1_databases[0].database_id, "UNCONFIGURED");
      databases.add(config.d1_databases[0].database_name);
      assert.equal(config.r2_buckets.length, 1);
      buckets.add(config.r2_buckets[0].bucket_name);
    }
    for (const service of config.services) {
      assert(service.service.startsWith("gsis-v1-"));
      if (
        service.entrypoint === "ContactsAuthorityProjection" ||
        service.entrypoint === "ContactsRecipientProjection"
      )
        assert.equal(domain, "core");
      if (service.entrypoint === "ProviderReceipts")
        assert.equal(domain, "roster");
      if (
        service.entrypoint?.startsWith("CoreRoster") ||
        service.entrypoint === "RosterScheduler"
      )
        assert.equal(domain, "roster");
    }
  }
  assert.equal(databases.size, 8);
  assert.equal(buckets.size, 8);
  for (const artifact of manifest.artifacts) {
    const bytes = await readFile(join(output, artifact.path));
    assert.equal(bytes.length, artifact.bytes);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      artifact.sha256,
    );
  }
  console.log(
    "PASS real nine-Worker build: isolated DB/buckets, restricted named capability bindings, disabled coexistence owners, no secret/local-test/GAS artifacts, complete SHA256 manifest",
  );
} finally {
  await rm(output, { recursive: true, force: true });
}
