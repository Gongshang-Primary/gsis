import { verifyResources } from "./verify-resources.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { root, domains } from "./build.mjs";
if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.GITHUB_EVENT_NAME !== "workflow_dispatch"
)
  throw Error(
    "Deployment runs only through the explicit owner-triggered GitHub workflow.",
  );
if (!process.env.GSIS_SECRET || !process.env.CLOUDFLARE_API_TOKEN)
  throw Error(
    "Configure GSIS_SECRET and Cloudflare credentials in the approved GitHub environment.",
  );
const cli = join(root, "v1/node_modules/wrangler/bin/wrangler.js"),
  base = join(root, "deliverables/v1/product");
function run(args, options = {}) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: process.env,
    stdio: ["pipe", "inherit", "inherit"],
    ...options,
  });
  if (r.status !== 0)
    throw Error(
      "Deployment command failed; inspect the owner workflow logs and preserve already completed steps.",
    );
}
const ownerConfigs = await Promise.all(
  domains.map(async (d) =>
    JSON.parse(await readFile(join(base, d, "wrangler.json"), "utf8")),
  ),
);
await verifyResources(ownerConfigs, process.env);
for (const d of domains) {
  const config = join(base, d, "wrangler.json"),
    c = JSON.parse(await readFile(config, "utf8"));
  if (c.d1_databases[0].database_id === "UNCONFIGURED")
    throw Error("Missing isolated database.");
  run([
    "d1",
    "migrations",
    "apply",
    c.d1_databases[0].database_name,
    "--remote",
    "--config",
    config,
  ]);
}
// First install every named entrypoint without cross-service bindings or schedules.
// Workers have no public workers.dev route. The complete graph is attached only
// after all targets exist, so a fresh installation does not depend on deploy order.
for (const d of domains) {
  const folder = join(base, d),
    config = JSON.parse(await readFile(join(folder, "wrangler.json"), "utf8"));
  const staging = { ...config, services: [], triggers: { crons: [] } };
  const path = join(folder, "wrangler-stage.json");
  await writeFile(path, JSON.stringify(staging, null, 2));
  run(["deploy", "--config", path]);
}
for (const d of [...domains, "web"]) {
  const config = join(base, d, "wrangler.json");
  run(["deploy", "--config", config]);
  const secrets = { GSIS_SECRET: process.env.GSIS_SECRET };
  const names =
    d === "core"
      ? ["GOOGLE_SERVICE_ACCOUNT"]
      : ["roster", "calendar", "lord", "venues", "deploy"].includes(d)
        ? [
            "WHATSAPP_ACCESS_TOKEN",
            "WHATSAPP_APP_SECRET",
            "WHATSAPP_VERIFY_TOKEN",
            "TELEGRAM_BOT_TOKEN",
            "TELEGRAM_WEBHOOK_SECRET",
            "GOOGLE_SERVICE_ACCOUNT",
            "EMAIL_API_TOKEN",
          ]
        : [];
  for (const name of names)
    if (process.env[name]) secrets[name] = process.env[name];
  run(["secret", "bulk", "--config", config], {
    input: JSON.stringify(secrets),
  });
}
console.log(
  "Isolated deployment completed; verify runtime acceptance before any route or sender cutover.",
);
