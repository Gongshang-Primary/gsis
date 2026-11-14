import assert from "node:assert/strict";
import { mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { buildProduct, root } from "./build.mjs";

// Run in the isolated v1 verification stage, which installs its locked Wrangler.
// The root regression runner intentionally needs only root dependencies.
export async function verifyMigrationUpgrade() {
  const out = await mkdtemp(join(tmpdir(), "gsis-migration-upgrade-"));
  try {
    await buildProduct({ output: out });
    // Exercise the actual deployment CLI locally: simulate an already-installed
    // LORD database, then apply both additive migrations with the same 0002 prefix.
    const config = join(out, "lord/wrangler.json"),
      folder = join(out, "lord/migrations");
    const additions = (await readdir(folder)).filter(
      (f) => f !== "0001_owner.sql",
    );
    for (const file of additions)
      await rename(join(folder, file), join(out, file));
    const cliEnv = {
      ...process.env,
      CI: "true",
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_LOG_PATH: join(out, "wrangler.log"),
    };
    for (const key of [
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_API_KEY",
      "CLOUDFLARE_EMAIL",
      "CF_API_TOKEN",
      "CF_API_KEY",
      "CF_EMAIL",
    ])
      delete cliEnv[key];
    const local = (args) =>
      execFileSync(
        process.execPath,
        [
          join(root, "v1/node_modules/wrangler/bin/wrangler.js"),
          "d1",
          ...args,
          "--local",
          "--config",
          config,
          "--persist-to",
          join(out, "local-state"),
        ],
        { cwd: root, encoding: "utf8", timeout: 10000, env: cliEnv },
      );
    local(["migrations", "apply", "gsis-v1-lord"]);
    for (const file of additions)
      await rename(join(out, file), join(folder, file));
    local(["migrations", "apply", "gsis-v1-lord"]);
    const migrations = JSON.parse(
      local([
        "execute",
        "gsis-v1-lord",
        "--command",
        "SELECT name FROM d1_migrations ORDER BY id",
        "--json",
      ]),
    )[0].results;
    assert.deepEqual(
      migrations.map((r) => r.name),
      ["0001_owner.sql", ...additions],
      "upgrade preserves initial migration and applies each new filename exactly once",
    );
    const tables = JSON.parse(
      local([
        "execute",
        "gsis-v1-lord",
        "--command",
        "SELECT name FROM sqlite_master WHERE name IN ('drive_backup_control','drive_backup_files','drive_backup_status','drive_backup_assertions','lord_reign_archives') ORDER BY name",
        "--json",
      ]),
    )[0].results;
    assert.equal(
      tables.length,
      5,
      "all upgrade tables exist on the existing local installation",
    );
    console.log(
      "PASS real Wrangler LOCAL upgrade from deployed 0001: additive migrations applied once, all five upgrade tables present; no cloud credentials or operations",
    );
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await verifyMigrationUpgrade();
