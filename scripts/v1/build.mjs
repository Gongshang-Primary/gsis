import { build } from "esbuild";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { buildWeb } from "./build-web.mjs";
export const root = resolve(import.meta.dirname, "../..");
export const domains = [
  "core",
  "contacts",
  "deploy",
  "roster",
  "calendar",
  "lord",
  "venues",
  "layout",
];
export const compatibilityDate = "2026-08-06"; // Latest supported by the repository's locked workerd. Upgrade only with runtime evidence.
export async function buildProduct({
  configPath = join(root, "v1/config/school.example.json"),
  output = join(root, "deliverables/v1/product"),
} = {}) {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (
    config.schemaVersion !== 1 ||
    !/^[-a-z0-9]+$/.test(config.resourcePrefix) ||
    !config.schoolId
  )
    throw Error("Invalid school configuration");
  const prefix = config.resourcePrefix;
  await mkdir(output, { recursive: true });
  await buildWeb(join(output, "web/assets"));
  const bindings = Object.fromEntries(
    domains.map((d) => [d.toUpperCase(), `${prefix}-${d}`]),
  );
  const manifest = {
    schemaVersion: 1,
    workingTreeDirty: !!execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    compatibilityDate,
    schoolId: config.schoolId,
    services: [],
    artifacts: [],
    productionDeployed: false,
  };
  const allowedSettings = [
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_ENABLED",
    "WHATSAPP_TEMPLATES_JSON",
    "GOOGLE_STAFF_CALENDAR_ID",
    "GOOGLE_PARENT_CALENDAR_ID",
    "GOOGLE_DRIVE_FOLDER_ID",
    "DEPLOY_DRIVE_FOLDER_ID",
    "EMAIL_PROVIDER",
    "EMAIL_FROM",
    "LORD_SCHOOL_WHATSAPP_AGREEMENT",
    "LORD_MONITOR_TELEGRAM_CHAT_ID",
    "VENUES_WHATSAPP_TEMPLATE",
    "PHONE_COUNTRY_CODE",
  ];
  for (const key of Object.keys(config.settings ?? {}))
    if (!allowedSettings.includes(key))
      throw Error("Unrecognised or secret setting: " + key);
  const vars = {
    GSIS_BUILD_COMMIT: manifest.sourceCommit,
    ...(config.settings ?? {}),
    SCHOOL_ID: config.schoolId,
    SCHOOL_NAME: config.schoolName,
    PUBLIC_ORIGIN: config.publicOrigin,
    HOSTED_DOMAIN: config.hostedDomain,
    GOOGLE_CLIENT_ID: config.googleClientId,
    BOOTSTRAP_SUBJECT: config.bootstrapSubject,
    BOOTSTRAP_EMAIL: config.bootstrapEmail,
    SEND_OWNER: config.senderOwner ?? "v0.9",
    SCHEDULER_OWNER: config.schedulerOwner ?? "disabled",
    WEBHOOK_OWNER: config.webhookOwner ?? "v0.9",
    RETENTION_DELETE_ENABLED: "false",
  };
  for (const domain of [...domains, "web"]) {
    const folder = join(output, domain);
    await mkdir(folder, { recursive: true });
    const opts = {
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      outfile: join(folder, "worker.mjs"),
      legalComments: "eof",
      logLevel: "silent",
      external: ["cloudflare:workers"],
    };
    const extras = {
      lord: `import {WorkerEntrypoint} from 'cloudflare:workers'; import {recordProviderReceipt} from './v1/runtime/receipts.mjs'; export class ProviderReceipts extends WorkerEntrypoint {async record(input){return recordProviderReceipt({...this.env,SERVICE_NAME:'lord'},input,Date.now());}}`,
      venues: `import {WorkerEntrypoint} from 'cloudflare:workers'; export class ProviderReceipts extends WorkerEntrypoint {async record(input){return service.recordProviderReceipt({...this.env,SERVICE_NAME:'venues'},input,Date.now());}}`,
      deploy: `import {WorkerEntrypoint} from 'cloudflare:workers'; export class ContactsDeploymentProjection extends WorkerEntrypoint {async read(input){return service.readContactsDeployment({...this.env,SERVICE_NAME:'deploy'},input,Date.now());}}`,
      core: `import {WorkerEntrypoint} from 'cloudflare:workers'; import {authorizeRosterSchedule} from './v1/services/core/scheduler.mjs'; import {authorizeRosterExternal,authorizeRosterWebhook} from './v1/services/core/roster-capabilities.mjs';
    export class RosterScheduler extends WorkerEntrypoint {async authorizeScheduled(input){return authorizeRosterSchedule({...this.env,SERVICE_NAME:'core'},input,Date.now());}}
    export class CoreRosterExternal extends WorkerEntrypoint {async authorizeCapability(input){return authorizeRosterExternal({...this.env,SERVICE_NAME:'core'},input,Date.now());}}
    export class CoreRosterWebhook extends WorkerEntrypoint {async authorizeEvent(input){return authorizeRosterWebhook({...this.env,SERVICE_NAME:'core'},input,Date.now());}}`,
      contacts: `import {WorkerEntrypoint} from 'cloudflare:workers'; export class ContactsAuthorityProjection extends WorkerEntrypoint {async read(input){return service.readAuthorityProjection({...this.env,SERVICE_NAME:'contacts'},input,Date.now());}} export class ContactsCalendarProjection extends WorkerEntrypoint {async readBirthdays(){return service.readCalendarBirthdays({...this.env,SERVICE_NAME:'contacts'});}}
    export class ContactsRecipientProjection extends WorkerEntrypoint {async staff(input){return service.recipientStaff({...this.env,SERVICE_NAME:'contacts'},input,Date.now());}async lookupMobile(input){return service.recipientMobile({...this.env,SERVICE_NAME:'contacts'},input,Date.now());}}`,
      calendar: `import {WorkerEntrypoint} from 'cloudflare:workers'; export class ContactsBirthdays extends WorkerEntrypoint {async reconcileBirthdays(input){return service.reconcileContactsBirthdays({...this.env,SERVICE_NAME:'calendar'},input,Date.now());}}`,
    };
    if (domain === "web")
      await build({
        ...opts,
        entryPoints: [join(root, "v1/runtime/gateway.mjs")],
      });
    else
      await build({
        ...opts,
        stdin: {
          contents: `import {domainWorker} from './v1/runtime/worker.mjs'; import * as service from './v1/services/${domain}/service.mjs'; export default domainWorker('${domain}',service);${extras[domain] ?? ""}`,
          resolveDir: root,
          sourcefile: `${domain}-entry.mjs`,
        },
      });
    const wrangler = {
      name: `${prefix}-${domain}`,
      main: "worker.mjs",
      compatibility_date: compatibilityDate,
      workers_dev: false,
      preview_urls: false,
      observability: {
        enabled: true,
        logs: { enabled: true, invocation_logs: false },
        traces: { enabled: true, head_sampling_rate: 0.1 },
      },
      vars,
      services: Object.entries(bindings).map(([binding, service]) => ({
        binding,
        service,
      })),
    };
    if (domain === "core")
      wrangler.services.push(
        {
          binding: "CONTACTS_AUTHORITY",
          service: prefix + "-contacts",
          entrypoint: "ContactsAuthorityProjection",
        },
        {
          binding: "CONTACTS_RECIPIENTS",
          service: prefix + "-contacts",
          entrypoint: "ContactsRecipientProjection",
        },
      );
    if (domain === "roster")
      wrangler.services.push(
        {
          binding: "LORD_RECEIPTS",
          service: prefix + "-lord",
          entrypoint: "ProviderReceipts",
        },
        {
          binding: "VENUES_RECEIPTS",
          service: prefix + "-venues",
          entrypoint: "ProviderReceipts",
        },
      );
    if (domain === "roster")
      wrangler.services.push(
        {
          binding: "CORE_EXTERNAL",
          service: prefix + "-core",
          entrypoint: "CoreRosterExternal",
        },
        {
          binding: "CORE_WEBHOOK",
          service: prefix + "-core",
          entrypoint: "CoreRosterWebhook",
        },
      );
    if (domain === "roster")
      wrangler.services.push({
        binding: "CORE_SCHEDULER",
        service: prefix + "-core",
        entrypoint: "RosterScheduler",
      });
    if (domain === "contacts")
      wrangler.services.push(
        {
          binding: "DEPLOY_CONTACTS",
          service: prefix + "-deploy",
          entrypoint: "ContactsDeploymentProjection",
        },
        {
          binding: "CALENDAR_CONTACTS",
          service: prefix + "-calendar",
          entrypoint: "ContactsBirthdays",
        },
      );
    if (domain === "calendar")
      wrangler.services.push({
        binding: "CONTACTS_CALENDAR",
        service: prefix + "-contacts",
        entrypoint: "ContactsCalendarProjection",
      });
    if (domain === "web")
      wrangler.assets = {
        directory: "./assets",
        binding: "ASSETS",
        run_worker_first: true,
      };
    else {
      wrangler.d1_databases = [
        {
          binding: "DB",
          database_name: `${prefix}-${domain}`,
          database_id: config.databases?.[domain] ?? "UNCONFIGURED",
          migrations_dir: "./migrations",
        },
      ];
      wrangler.r2_buckets = [
        {
          binding: "ARTIFACTS",
          bucket_name:
            config.buckets?.[domain] ?? `${prefix}-${domain}-artifacts`,
        },
      ];
      wrangler.triggers = { crons: ["* * * * *"] };
      await mkdir(join(folder, "migrations"), { recursive: true });
      let sql = await readFile(join(root, "v1/migrations/common.sql"), "utf8");
      for (const f of (
        await readdir(join(root, "v1/migrations", domain))
      ).sort())
        if (f.endsWith(".sql"))
          sql +=
            "\n" +
            (await readFile(join(root, "v1/migrations", domain, f), "utf8"));
      await writeFile(join(folder, "migrations/0001_owner.sql"), sql);
    }
    await writeFile(
      join(folder, "wrangler.json"),
      JSON.stringify(wrangler, null, 2) + "\n",
    );
    manifest.services.push({
      domain,
      name: wrangler.name,
      database:
        domain === "web" ? null : wrangler.d1_databases[0].database_name,
    });
  }
  async function inventory(dir, rel = "") {
    for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const name = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) await inventory(join(dir, e.name), name);
      else if (e.name !== "manifest.json") {
        const bytes = await readFile(join(dir, e.name));
        manifest.artifacts.push({
          path: name,
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
    }
  }
  await inventory(output);
  await writeFile(
    join(output, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return {
    output,
    services: manifest.services.length,
    artifacts: manifest.artifacts.length,
    sourceCommit: manifest.sourceCommit,
  };
}
if (process.argv[1] === new URL(import.meta.url).pathname)
  console.log(
    JSON.stringify(
      await buildProduct({
        configPath: process.argv[2] ? resolve(process.argv[2]) : undefined,
      }),
    ),
  );
