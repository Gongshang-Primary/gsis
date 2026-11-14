import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { root, domains } from "./build.mjs";
const cli = join(root, "v1/node_modules/wrangler/bin/wrangler.js");
for (const domain of [...domains, "web"]) {
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "deploy",
      "--dry-run",
      "--config",
      join(root, "deliverables/v1/product", domain, "wrangler.json"),
      "--outdir",
      join(root, "deliverables/v1/dry-run", domain),
    ],
    {
      cwd: root,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: "inherit",
      timeout: 60000,
    },
  );
  console.log(
    JSON.stringify({ domain, dryRun: true, exitCode: result.status }),
  );
  if (result.status !== 0) process.exit(result.status || 1);
}

// Verify an upgrade of an existing database using local D1 only.
const { verifyMigrationUpgrade } = await import(
  "./verify-migration-upgrade.mjs"
);
await verifyMigrationUpgrade();
