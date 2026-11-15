import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { readFile, mkdir, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { buildProduct, domains, root, compatibilityDate } from "./build.mjs";
import { migrate } from "../../tests/v1-product/helpers.mjs";
export async function startProduct({
  configPath,
  output = join(root, "deliverables/v1/product"),
  persistPath,
  port = 0,
  bindings = {},
  migrateSchemas = true,
} = {}) {
  const progress = (step) => {
    if (process.env.GSIS_LOCAL_TRACE === "1") console.log("local: " + step);
  };
  await buildProduct({ configPath, output });
  progress("build complete");
  const store = persistPath ?? join(root, "deliverables/v1/local-state");
  await mkdir(store, { recursive: true });
  const config = JSON.parse(
    await readFile(join(output, "core/wrangler.json"), "utf8"),
  );
  const secret =
    bindings.GSIS_SECRET ?? crypto.randomUUID() + crypto.randomUUID();
  const common = { ...config.vars, ...bindings, GSIS_SECRET: secret };
  const services = Object.fromEntries(
    domains.map((d) => [d.toUpperCase(), "gsis-" + d]),
  );
  const assets = async (request) => {
    let path = decodeURIComponent(new URL(request.url).pathname);
    if (path.includes("..")) return new Response("", { status: 404 });
    if (path.endsWith("/")) path += "index.html";
    try {
      const body = await readFile(join(output, "web/assets", path));
      const ext = path.split(".").pop(),
        types = {
          html: "text/html",
          js: "text/javascript",
          mjs: "text/javascript",
          css: "text/css",
          json: "application/json",
          svg: "image/svg+xml",
          png: "image/png",
          woff2: "font/woff2",
        };
      return new Response(body, {
        headers: { "content-type": types[ext] ?? "application/octet-stream" },
      });
    } catch {
      return new Response("", { status: 404 });
    }
  };
  const localToken = crypto.randomUUID() + crypto.randomUUID();
  common.LOCAL_TEST_TOKEN = localToken;
  async function localScript(domain) {
    const filename = join(output, domain, "worker.mjs");
    const prelude =
      domain === "web"
        ? `const m=new URL(request.url).pathname.match(/^\\/__local\\/(sql|scheduled)\\/([a-z]+)$/);if(m&&request.headers.get('x-local-test-token')===env.LOCAL_TEST_TOKEN){const binding=env[m[2].toUpperCase()];if(!binding)return new Response('',{status:404});return binding.fetch(new Request('https://local.test/__local/'+m[1],request));}`
        : `if(new URL(request.url).pathname==='/__local/scheduled'&&request.headers.get('x-local-test-token')===env.LOCAL_TEST_TOKEN){if(product.scheduled)await product.scheduled({scheduledTime:Date.now(),cron:'* * * * *'},env,ctx);return Response.json({ok:true});}if(new URL(request.url).pathname==='/__local/sql'&&request.headers.get('x-local-test-token')===env.LOCAL_TEST_TOKEN){const input=await request.json();try{const prepared=input.statements.map(s=>env.DB.prepare(s.sql).bind(...(s.args??[])));let result;if(input.mode==='batch')result=await env.DB.batch(prepared);else result=await prepared[0][input.mode]();return Response.json({ok:true,result});}catch(error){return Response.json({ok:false,message:String(error)},{status:500});}}`;
    const code = `import product from ${JSON.stringify(filename)};${["lord", "venues"].includes(domain) ? `export {ProviderReceipts} from ${JSON.stringify(filename)};` : domain === "core" ? `export {RosterScheduler,CoreRosterExternal,CoreRosterWebhook} from ${JSON.stringify(filename)};` : domain === "deploy" ? `export {ContactsDeploymentProjection} from ${JSON.stringify(filename)};` : domain === "contacts" ? `export {ContactsCalendarProjection,ContactsRecipientProjection,ContactsAuthorityProjection} from ${JSON.stringify(filename)};` : domain === "calendar" ? `export {ContactsBirthdays} from ${JSON.stringify(filename)};` : ""}export default {...product,async fetch(request,env,ctx){${prelude}return product.fetch(request,env,ctx);}};`;
    const result = await build({
      stdin: { contents: code, resolveDir: root },
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      external: ["cloudflare:workers"],
      write: false,
      logLevel: "silent",
    });
    return result.outputFiles[0].text;
  }
  const workers = [
    {
      name: "gsis-web",
      modules: true,
      script: await localScript("web"),
      compatibilityDate,
      bindings: common,
      serviceBindings: { ...services, ASSETS: assets },
    },
    ...(await Promise.all(
      domains.map(async (d) => ({
        name: "gsis-" + d,
        modules: true,
        script: await localScript(d),
        compatibilityDate,
        bindings: common,
        serviceBindings:
          d === "roster"
            ? {
                ...services,
                LORD_RECEIPTS: {
                  name: "gsis-lord",
                  entrypoint: "ProviderReceipts",
                },
                VENUES_RECEIPTS: {
                  name: "gsis-venues",
                  entrypoint: "ProviderReceipts",
                },
                CORE_SCHEDULER: {
                  name: "gsis-core",
                  entrypoint: "RosterScheduler",
                },
                CORE_EXTERNAL: {
                  name: "gsis-core",
                  entrypoint: "CoreRosterExternal",
                },
                CORE_WEBHOOK: {
                  name: "gsis-core",
                  entrypoint: "CoreRosterWebhook",
                },
              }
            : d === "core"
              ? {
                  ...services,
                  CONTACTS_AUTHORITY: {
                    name: "gsis-contacts",
                    entrypoint: "ContactsAuthorityProjection",
                  },
                  CONTACTS_RECIPIENTS: {
                    name: "gsis-contacts",
                    entrypoint: "ContactsRecipientProjection",
                  },
                }
              : d === "contacts"
                ? {
                    ...services,
                    DEPLOY_CONTACTS: {
                      name: "gsis-deploy",
                      entrypoint: "ContactsDeploymentProjection",
                    },
                    CALENDAR_CONTACTS: {
                      name: "gsis-calendar",
                      entrypoint: "ContactsBirthdays",
                    },
                  }
                : d === "calendar"
                  ? {
                      ...services,
                      CONTACTS_CALENDAR: {
                        name: "gsis-contacts",
                        entrypoint: "ContactsCalendarProjection",
                      },
                    }
                  : services,
        d1Databases: { DB: "gsis-" + d },
        r2Buckets: { ARTIFACTS: "gsis-" + d + "-artifacts" },
      })),
    )),
  ];
  const mf = new Miniflare({
    port,
    workers,
    d1Persist: join(store, "d1"),
    r2Persist: join(store, "r2"),
  });
  progress("runtime starting");
  await mf.ready;
  progress("runtime ready");
  const database = (domain) => {
    const execute = async (mode, statements) => {
      const response = await mf.dispatchFetch(
        "http://local.test/__local/sql/" + domain,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-local-test-token": localToken,
          },
          body: JSON.stringify({ mode, statements }),
        },
      );
      const data = await response.json();
      if (!data.ok) throw Error(data.message ?? "Local D1 command failed");
      return data.result;
    };
    const make = (sql, args = []) => ({
      sql,
      args,
      bind(...values) {
        return make(sql, values);
      },
      async first(column) {
        const result = await execute("first", [{ sql, args }]);
        return column ? result?.[column] : result;
      },
      all() {
        return execute("all", [{ sql, args }]);
      },
      run() {
        return execute("run", [{ sql, args }]);
      },
    });
    return {
      prepare: (sql) => make(sql),
      batch: (statements) =>
        execute(
          "batch",
          statements.map(({ sql, args }) => ({ sql, args })),
        ),
    };
  };
  if (migrateSchemas)
    for (const d of domains) {
      progress(d + " database opening");
      const db = database(d);
      const folder = join(output, d, "migrations");
      const files = (await readdir(folder)).filter(name => name.endsWith(".sql")).sort();
      await migrate(db, files.map(name => join(folder, name)));
      progress(d + " schema ready");
    }
  return {
    mf,
    secret,
    async trigger(domain) {
      const r = await mf.dispatchFetch(
        "http://local.test/__local/scheduled/" + domain,
        { method: "POST", headers: { "x-local-test-token": localToken } },
      );
      return r.json();
    },
    url: (await mf.ready).toString(),
    async db(domain) {
      return database(domain);
    },
    async close() {
      await mf.dispose();
    },
  };
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const suite = await startProduct({
    configPath: process.argv[2] ? resolve(process.argv[2]) : undefined,
    port: Number(process.env.PORT ?? 8787),
  });
  console.log("Isolated v1 local runtime: " + suite.url);
  process.once("SIGINT", async () => {
    await suite.close();
    process.exit(0);
  });
}
