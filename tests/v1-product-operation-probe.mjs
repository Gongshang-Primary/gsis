/** Built-browser dispatch inventory; synthetic local Workers/D1 only.
 * This detects missing dispatch, not correctness of every business operation.
 * Finite string branches are expanded; runtime IDs are synthetic placeholders.
 * Data-dependent names with no finite source value are reported, never certified.
 */
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "acorn";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";

const domains = [
  "core",
  "contacts",
  "deploy",
  "roster",
  "calendar",
  "lord",
  "venues",
  "layout",
];
const placeholder = "synthetic-probe";
const key = (r) =>
  JSON.stringify([r.domain, r.path, r.selector || "", r.name || ""]);
const methodName = (n) => n?.name || n?.property?.name || n?.property?.value;
function walk(n, fn, parent = null) {
  if (!n || typeof n !== "object") return;
  if (n.type) fn(n, parent);
  for (const [k, v] of Object.entries(n))
    if (k !== "loc") {
      if (Array.isArray(v)) for (const x of v) walk(x, fn, n);
      else if (v && typeof v === "object") walk(v, fn, n);
    }
}
function scripts(file, text) {
  if (!file.endsWith(".html")) return [{ text, line: 0 }];
  return [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(
      (m) =>
        !/(?:src\s*=|application\/(?:json|ld\+json)|importmap)/i.test(m[1]),
    )
    .map((m) => ({
      text: m[2],
      line:
        text.slice(0, m.index + m[0].indexOf(">") + 1).split("\n").length - 1,
    }));
}
function fileDomain(file) {
  const first = file.split("/")[0];
  if (domains.includes(first)) return first;
  if (["overlord", "starlord"].includes(first)) return "lord";
  const name = file.split("/").at(-1).split(/[.-]/)[0];
  return domains.includes(name)
    ? name
    : ["admin", "storage", "signage", "reign"].includes(name)
      ? "core"
      : null;
}

// A deliberately bounded, conservative finite-string evaluator. It follows
// constants, object members, ternaries and named wrapper arguments, not execution.
function analyse(file, source, lineOffset = 0) {
  const ast = parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true,
  });
  const nodes = [],
    parents = new Map(),
    scopes = new Map(),
    bindings = new Map(),
    functions = new Map();
  function bind(scope, name, node) {
    if (name && node) {
      const map = bindings.get(scope) || new Map(),
        b = map.get(name) || [];
      b.push(node);
      map.set(name, b);
      bindings.set(scope, map);
    }
  }
  function lookup(n, name) {
    let scope = scopes.get(n);
    while (scope) {
      if (bindings.get(scope)?.has(name)) return bindings.get(scope).get(name);
      scope = scopes.get(parents.get(scope));
    }
    return [];
  }
  walk(ast, (n, p) => {
    nodes.push(n);
    parents.set(n, p);
    const isFunction =
      /Function/.test(n.type) || n.type === "ArrowFunctionExpression";
    const scope = n.type === "Program" || isFunction ? n : scopes.get(p);
    scopes.set(n, scope);
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier")
      bind(scope, n.id.name, n.init);
    if (n.type === "AssignmentExpression" && n.left.type === "Identifier")
      bind(scope, n.left.name, n.right);
    if (isFunction) {
      const name =
        n.id?.name || (p?.type === "VariableDeclarator" ? p.id.name : null);
      if (name) functions.set(name, n);
    }
  });
  for (const n of nodes)
    if (n.type === "CallExpression") {
      const f = functions.get(methodName(n.callee));
      if (f)
        f.params.forEach((p, i) =>
          bind(f, p.name || p.left?.name, n.arguments[i]),
        );
    }
  const unique = (a) => {
    const out = [...new Set(a)];
    assert.ok(out.length <= 256, `Too many static alternatives in ${file}`);
    return out;
  };

  function values(n, seen = new Set()) {
    if (!n || seen.has(n)) return [];
    assert.ok(
      seen.size < 80,
      `Static resolution exceeded its bound in ${file}; teach the probe this shape.`,
    );
    seen = new Set(seen).add(n);
    const get = (x) => values(x, seen);
    if (n.type === "Literal")
      return typeof n.value === "string" ? [n.value] : [];
    if (n.type === "Identifier") {
      // Finite UI selectors are sometimes narrowed at the call site, e.g.
      // ['diy'].includes(page) before loadAux(page). Keep that positive guard.
      let child = n,
        parent = parents.get(child);
      while (parent) {
        if (parent.type === "IfStatement" && parent.consequent === child) {
          const t = parent.test;
          if (
            t.type === "CallExpression" &&
            methodName(t.callee) === "includes" &&
            t.callee.object?.type === "ArrayExpression" &&
            t.arguments[0]?.name === n.name
          )
            return unique(t.callee.object.elements.flatMap(get));
        }
        child = parent;
        parent = parents.get(parent);
      }
      return unique(lookup(n, n.name).flatMap(get));
    }
    if (n.type === "ConditionalExpression")
      return unique([...get(n.consequent), ...get(n.alternate)]);
    if (n.type === "LogicalExpression")
      return unique([...get(n.left), ...get(n.right)]);
    if (n.type === "BinaryExpression" && n.operator === "+")
      return combine(get(n.left), get(n.right));
    if (n.type === "TemplateLiteral") {
      let out = [n.quasis[0].value.cooked];
      n.expressions.forEach(
        (e, i) =>
          (out = combine(out, combine(get(e), [n.quasis[i + 1].value.cooked]))),
      );
      return out;
    }
    if (n.type === "MemberExpression" && n.object.type === "Identifier") {
      const property = n.property.name || n.property.value;
      return unique(
        lookup(n, n.object.name).flatMap((x) => {
          if (
            x.type === "CallExpression" &&
            ["freeze", "seal"].includes(methodName(x.callee))
          )
            x = x.arguments[0];
          return x?.type === "ObjectExpression"
            ? x.properties
                .filter((p) => (p.key?.name || p.key?.value) === property)
                .flatMap((p) => get(p.value))
            : [];
        }),
      );
    }
    if (
      n.type === "CallExpression" &&
      ["encodeURIComponent", "String"].includes(methodName(n.callee))
    )
      return get(n.arguments[0]);
    return [];
  }
  function combine(a, b) {
    return unique(
      (a.length ? a : [placeholder]).flatMap((x) =>
        (b.length ? b : [placeholder]).map((y) => x + y),
      ),
    );
  }
  const result = [],
    dynamic = [];
  const domain = fileDomain(file);
  const where = (n, kind) => ({
    file,
    line: n.loc.start.line + lineOffset,
    kind,
  });
  function add(d, path, n, selector = "", name = "") {
    if (!domains.includes(d) || !path.startsWith("/")) return;
    const u = new URL(path, origin);
    for (const field of ["operation", "action", "command"])
      if (u.searchParams.has(field)) {
        selector = field;
        name = u.searchParams.get(field);
      }
    result.push({
      domain: d,
      path: u.pathname.replace(/\/$/, ""),
      selector,
      name,
      source: where(n, "call/constant"),
    });
  }
  function route(raw, n) {
    if (!raw.startsWith("/api")) return;
    const u = new URL(raw, origin);
    // The built client intercepts these aliases before applying module routing.
    if (
      ["/api/config", "/api/client-config", "/api/auth/config"].includes(
        u.pathname,
      )
    )
      return add("core", "/config", n);
    if (
      ["/api/session", "/api/auth/session", "/api/auth/identity"].includes(
        u.pathname,
      )
    )
      return add("core", "/session", n);
    if (["/api/logout", "/api/auth/logout"].includes(u.pathname))
      return add("core", "/logout", n);
    if (u.pathname === "/api/auth/google") return; // browser sign-in rejection, not a Worker dispatch
    if (u.pathname === "/api" && domain === "calendar")
      return add("calendar", "/action", n);
    const parts = u.pathname.split("/");
    const explicit = domains.includes(parts[2]);
    const d = explicit ? parts[2] : domain;
    const path =
      (explicit ? "/" + parts.slice(3).join("/") : u.pathname.slice(4)) +
      u.search;
    if (parts[2] === placeholder) {
      for (const owner of domains)
        add(owner, "/" + parts.slice(3).join("/") + u.search, n);
      return;
    }
    if (path === "/" || !d || path === `/${placeholder}`) return;
    add(d, path, n);
  }
  for (const n of nodes) {
    if (
      n.type === "Literal" &&
      typeof n.value === "string" &&
      n.value.includes("/api/")
    ) {
      // Follow string concatenation/template up to the complete URL expression.
      let top = n,
        p = parents.get(top);
      while (
        p &&
        ((p.type === "BinaryExpression" && p.operator === "+") ||
          p.type === "TemplateLiteral")
      ) {
        top = p;
        p = parents.get(top);
      }
      let scope = scopes.get(n);
      if (
        file === "v1/shared/client.js" &&
        scope?.id?.name === "requestUnshared"
      )
        continue; // paired domain/path forwarded; collected at its callers
      for (const raw of values(top)) {
        if (raw.startsWith("/api/")) route(raw, n);
        else if (raw.includes("src=") || raw.includes("href="))
          for (const m of raw.matchAll(/(?:src|href)=["'](\/api\/[^"'<> ]+)/g))
            route(m[1], n);
      }
    }
    if (
      n.type === "TemplateLiteral" &&
      (n.quasis.some((q) => q.value.cooked?.includes("/api/")) ||
        n.expressions[0]?.object?.name === "API")
    )
      for (const raw of values(n)) if (raw.startsWith("/api/")) route(raw, n);
    if (n.type === "CallExpression") {
      const name = methodName(n.callee),
        args = n.arguments;
      if (name === "request" || name === "requestUnshared") {
        const owners = values(args[0]).filter((x) => domains.includes(x));
        const paths = values(args[1]).filter((x) => x.startsWith("/"));
        // The owner selector in Admin health/storage is constrained by all eight
        // deployed modules. Expand it, rather than only checking the default.
        const dynamicOwner =
          file.startsWith("v1/shared/") &&
          ["admin.js", "storage-toolbox.js"].includes(file.split("/").at(-1));
        if (paths.length && (args[0]?.type === "Literal" || dynamicOwner))
          for (const d of owners.length ? owners : dynamicOwner ? domains : [])
            for (const p of paths) add(d, p, n);
      }
      if (name === "api" || name === "rawApi") {
        const names = values(args[0]);
        if (
          !names.length &&
          args[0]?.type !== "ObjectExpression" &&
          file !== "roster/external.js"
        )
          dynamic.push(where(n, "runtime api argument"));
        if (domain === "calendar") {
          for (const value of names)
            if (/^[A-Za-z]\w*$/.test(value))
              add(domain, "/action", n, "action", value);
        } else if (["contacts", "deploy", "roster"].includes(domain)) {
          for (const path of names)
            if (/^[A-Za-z][\w/-]*$/.test(path)) route("/api/" + path, n);
        }
      }
    }
    if (n.type === "Property" && !n.computed) {
      const field = n.key.name || n.key.value;
      if (
        field === "route" &&
        domain === "roster" &&
        parents
          .get(n)
          ?.properties?.some((p) => (p.key?.name || p.key?.value) === "payload")
      )
        for (const path of values(n.value))
          if (/^[A-Za-z][\w/-]*$/.test(path)) add(domain, "/" + path, n);
      const selected =
        (field === "operation" &&
          ["deploy", "roster", "venues"].includes(domain)) ||
        (field === "action" && ["lord", "calendar"].includes(domain));
      if (!selected) continue;
      const names = values(n.value).filter((x) => /^[A-Za-z]\w*$/.test(x));
      if (!names.length) dynamic.push(where(n, `runtime ${field}`));
      for (const name of names) {
        if (file === "roster/external.js")
          add(domain, "/external", n, field, name);
        else if (file === "roster/backup-ledger.js")
          add(domain, "/backup-ledger", n, field, name);
        else {
          let path = {
            deploy: "/change",
            roster: "/operations",
            venues: "/command",
            lord: "/transaction",
            calendar: "/action",
          }[domain];
          if (domain === "venues") {
            let parent = parents.get(n);
            while (parent && parent.type !== "CallExpression")
              parent = parents.get(parent);
            if (methodName(parent?.callee) === "read") path = "/read";
          }
          add(domain, path, n, field, name);
          if (
            parents
              .get(n)
              ?.properties?.some(
                (p) => (p.key?.name || p.key?.value) === "edits",
              )
          )
            result.at(-1).editsEnvelope = true;
        }
      }
    }
  }
  return { result, dynamic };
}
async function files(root) {
  return (
    await Promise.all(
      (await readdir(root, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? files(join(root, e.name)) : join(root, e.name),
      ),
    )
  ).flat();
}
async function inventory(root) {
  const found = new Map(),
    dynamic = [];
  let parsed = 0;
  for (const path of (await files(root)).sort())
    if (/\.(?:m?js|html)$/.test(path)) {
      const file = path.slice(root.length + 1),
        text = await readFile(path, "utf8");
      for (const script of scripts(file, text)) {
        parsed++;
        if (process.env.GSIS_PROBE_TRACE) console.error("parse", file);
        const scan = analyse(file, script.text, script.line);
        dynamic.push(...scan.dynamic);
        for (const r of scan.result) {
          const k = key(r),
            old = found.get(k);
          if (old) {
            old.sources.push(r.source);
            old.editsEnvelope ||= r.editsEnvelope;
          } else found.set(k, { ...r, sources: [r.source] });
        }
      }
    }
  // Dispatch envelopes need their extracted selector, not an empty envelope.
  for (const [k, r] of found)
    if (
      !r.selector &&
      [
        ["calendar", "/action"],
        ["venues", "/command"],
        ["venues", "/read"],
        ["lord", "/transaction"],
      ].some(([d, p]) => d === r.domain && p === r.path)
    )
      found.delete(k);
  return {
    rows: [...found.values()].sort((a, b) => key(a).localeCompare(key(b))),
    dynamic,
    parsed,
  };
}
function missing(r) {
  const b = r.body || {},
    code = String(b.code || b.error?.code || ""),
    message = String(b.message || b.error?.message || b.error || "");
  return (
    /^UNKNOWN_(?:OPERATION|ROUTE|ACTION|COMMAND)$/.test(code) ||
    /^(?:unknown|unsupported) (?:\w+ )?(?:operation|route|action|command)\b/i.test(
      message,
    )
  );
}
function verify(results, allowances) {
  const exceptions = new Map();
  for (const e of allowances) {
    assert.ok(
      domains.includes(e.domain) && /^\/[A-Za-z0-9/_-]+$/.test(e.path),
      "Exceptions must bind one known domain and concrete path.",
    );
    assert.match(e.ledger, /^(?:F(?:0[1-9]|1[0-6])|S2\/replaced)$/);
    assert.ok(
      e.reason?.trim().length > 20,
      "Every exception needs a concrete reason.",
    );
    assert.ok(!exceptions.has(key(e)), `Duplicate allowance ${key(e)}`);
    exceptions.set(key(e), e);
  }
  const failures = [];
  for (const r of results) {
    const k = key(r),
      e = exceptions.get(k);
    if (r.missing && !e)
      failures.push(
        `Unallowed missing handler ${k} at ${JSON.stringify(r.sources?.[0])}`,
      );
    if (e) {
      exceptions.delete(k);
      if (!r.missing) failures.push(`Stale allowance ${k}`);
    }
  }
  for (const k of exceptions.keys())
    failures.push(`Undiscovered allowance ${k}`);
  assert.equal(failures.length, 0, failures.join("\n"));
}

const suite = await productSuite({
  bindings: {
    SEND_OWNER: "disabled",
    SCHEDULER_OWNER: "disabled",
    WEBHOOK_OWNER: "disabled",
    GOOGLE_CLIENT_ID: "synthetic-probe.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});
let browser;
try {
  const actor = await suite.seedAccount("operation-probe-admin");
  const assets = join(suite.path, "product/web/assets");
  const discovered = await inventory(assets);
  const version = await suite.call(actor, "deploy", "/versions/create", {
    operationId: crypto.randomUUID(),
    name: "Synthetic probe",
    year: 2026,
  });
  async function probe(r, user = actor) {
    const responses = [];
    for (const method of ["POST", "GET"]) {
      const body = {
        operationId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        schoolId: "synthetic-school",
        date: "2026-11-16",
        year: 2026,
        from: "2026-11-16",
        to: "2026-11-17",
        versionId: version.versionId,
        ...(r.editsEnvelope ? { edits: [] } : {}),
        ...(r.selector ? { [r.selector]: r.name } : {}),
      };
      // A query/body operation must reach the same dispatcher on either method.
      const path =
        r.path +
        (method === "GET"
          ? "?" +
            new URLSearchParams(
              Object.entries(body).map(([k, v]) => [
                k,
                typeof v === "object" ? JSON.stringify(v) : v,
              ]),
            )
          : "");
      const res = await suite.request(user, r.domain, path, {
        method,
        ...(method === "POST" ? { body } : {}),
      });
      assert.ok(
        r.path === "/logout" || res.body?.error?.code !== "SESSION_REVOKED",
        "Probe session was unexpectedly revoked",
      );
      responses.push({ method, status: res.status, body: res.body });
    }
    const reached = responses.filter((r) => !missing(r) && r.status !== 405);
    const absent = !reached.length && responses.some(missing);
    return {
      ...r,
      missing: absent,
      classification: absent
        ? "missing"
        : reached.some((x) => x.status >= 500)
          ? "prerequisite/server-error"
          : reached.some((x) => x.status >= 400)
            ? "validation/resource/guard"
            : "returned",
      responses,
    };
  }
  // A new caller is discovered and fails against real dispatch. Other modules'
  // exceptions cannot hide it; removing a handler cannot be masked by a generic
  // validation response or by keeping an obsolete allowance.
  for (const [domain, path, selector] of [
    ["roster", "/operations", "operation"],
    ["calendar", "/action", "action"],
    ["lord", "/transaction", "action"],
    ["venues", "/command", "operation"],
    ["deploy", "/change", "operation"],
  ]) {
    const fake = analyse(
      `${domain}/probe.js`,
      domain === "calendar"
        ? `api('syntheticMissingCommand')`
        : `const command={${selector}:'syntheticMissingCommand'}`,
    );
    const candidate = fake.result.find((r) => r.path === path);
    assert.ok(candidate, `New ${domain} call was not extracted`);
    const response = await probe(candidate);
    assert.equal(
      response.missing,
      true,
      `${domain} dispatch control was masked`,
    );
    assert.throws(() => verify([response], []), /Unallowed missing/);
    assert.throws(
      () =>
        verify(
          [response],
          [
            {
              ...candidate,
              domain: domain === "roster" ? "calendar" : "roster",
              ledger: "F01",
              reason:
                "Synthetic unrelated-domain exception must not hide the control.",
            },
          ],
        ),
      /Unallowed missing/,
    );
  }
  for (const domain of domains) {
    const scan = analyse(
      `${domain}/synthetic-new.js`,
      "fetch('/api/syntheticMissingRoute')",
    );
    assert.equal(scan.result.length, 1);
    const response = await probe(scan.result[0]);
    assert.equal(response.missing, true, `${domain} unknown route was masked`);
    assert.throws(() => verify([response], []), /Unallowed missing/);
  }
  const resourceMissing = await probe({
    domain: "calendar",
    path: "/action",
    selector: "action",
    name: "calendarWipeBatch",
  });
  assert.equal(
    resourceMissing.missing,
    false,
    "A missing saved wipe operation is a resource failure, not missing dispatch",
  );
  assert.ok(
    resourceMissing.responses.some(
      (r) => r.body?.error?.code === "WIPE_NOT_FOUND",
    ),
  );
  const known = await probe({
    domain: "core",
    path: "/session",
    selector: "",
    name: "",
  });
  assert.throws(
    () =>
      verify(
        [known],
        [
          {
            ...known,
            ledger: "F01",
            reason:
              "Synthetic obsolete exception must be removed after dispatch exists.",
          },
        ],
      ),
    /Stale allowance/,
  );
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath:
      process.env.GSIS_BROWSER_EXECUTABLE ||
      process.env.ROSTER_TEST_CHROMIUM ||
      undefined,
  });
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "__Host-gsis_session",
      value: actor.token,
      domain: "gsis.example.invalid",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const outside = [],
    browserRequests = [];
  await context.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.origin !== origin) {
      outside.push(url.origin);
      return route.abort();
    }
    const headers = { ...req.headers() };
    delete headers.host;
    delete headers["content-length"];
    const response = await suite.mf.dispatchFetch(req.url(), {
      method: req.method(),
      headers,
      ...(req.postDataBuffer() ? { body: req.postDataBuffer() } : {}),
    });
    if (url.pathname.startsWith("/api/")) browserRequests.push(url.pathname);
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  const page = await context.newPage();
  await page.goto(origin + "/roster/", { waitUntil: "load" });
  await page.waitForFunction(() => window.GSISV1?.fetch, null, {
    timeout: 5000,
  });
  await page.evaluate(() => window.GSISV1.getSession());
  const transport = await page.evaluate(async () => {
    const session = await window.GSISV1.fetch("/api/session");
    const missing = await window.GSISV1.fetch("/api/operations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "syntheticMissingCommand",
        operationId: crypto.randomUUID(),
      }),
    });
    const staff = await window.GSISV1.request("contacts", "/staff");
    return {
      sessionStatus: session.status,
      missingStatus: missing.status,
      missing: await missing.json(),
      staff,
    };
  });
  assert.equal(transport.sessionStatus, 200);
  assert.equal(transport.missingStatus, 404);
  assert.ok(JSON.stringify(transport.missing).includes("UNKNOWN_OPERATION"));
  assert.ok(
    browserRequests.includes("/api/core/session") &&
      browserRequests.includes("/api/roster/operations") &&
      browserRequests.includes("/api/contacts/staff"),
  );
  // Unload first, so polling and in-flight page work settle before route disposal.
  await page.goto("about:blank");
  await context.close();
  await browser.close();
  browser = null;
  const results = new Array(discovered.rows.length),
    users = [];
  for (let i = 0; i < 4; i++)
    users.push(await suite.seedAccount("operation-probe-lane-" + i));
  let next = 0;
  discovered.rows.sort(
    (a, b) => Number(a.path === "/logout") - Number(b.path === "/logout"),
  );
  // Each lane has its own session and serial requests. This bounds time without
  // making same-binding Core ordering conflicts look like dispatch evidence.
  await Promise.all(
    users.map(async (user) => {
      while (next < discovered.rows.length) {
        const i = next++,
          row = discovered.rows[i];
        if (process.env.GSIS_PROBE_TRACE) console.error("probe", key(row));
        results[i] = await probe(row, user);
      }
    }),
  );
  const report = {
    browserTransport: true,
    blockedExternalOrigins: [...new Set(outside)],
    parsed: discovered.parsed,
    discovered: discovered.rows.length,
    dynamic: discovered.dynamic,
    results,
  };
  if (process.env.GSIS_PROBE_REPORT)
    await writeFile(
      process.env.GSIS_PROBE_REPORT,
      JSON.stringify(report, null, 2),
    );
  const allowlist = JSON.parse(
    await readFile(
      new URL("./v1-product/operation-probe-allowlist.json", import.meta.url),
      "utf8",
    ),
  );
  verify(results, allowlist.entries);
  console.log(
    JSON.stringify({
      probe: results.length,
      knownMissing: results.filter((r) => r.missing).length,
      parsedScripts: discovered.parsed,
      unresolvedDynamic: discovered.dynamic,
    }),
  );
} finally {
  await browser?.close();
  await suite.close();
}
