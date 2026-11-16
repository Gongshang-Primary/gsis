import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { RELEASE_LABEL } from "../v1/release.mjs";
import { productSuite, origin } from "./v1-product/suite.mjs";

const suite = await productSuite({ bindings: {
  GOOGLE_CLIENT_ID: "synthetic-release.apps.googleusercontent.com", HOSTED_DOMAIN: "example.invalid",
} });
let browser, context;
try {
  const admin = await suite.seedAccount("synthetic-release-admin");
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath: process.env.GSIS_BROWSER_EXECUTABLE || process.env.ROSTER_TEST_CHROMIUM || undefined });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "__Host-gsis_session", value: admin.token, domain: "gsis.example.invalid",
    path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  await context.route("**/*", async route => {
    const request = route.request();
    if (!request.url().startsWith(origin + "/")) return route.abort();
    const result = await suite.mf.dispatchFetch(request.url(), { method: request.method(),
      headers: await request.allHeaders(), body: ["GET", "HEAD"].includes(request.method()) ? undefined : request.postDataBuffer() });
    const headers = Object.fromEntries(result.headers); delete headers["transfer-encoding"];
    await route.fulfill({ status: result.status, headers, body: Buffer.from(await result.arrayBuffer()) });
  });
  const screens = [
    ["", "header [data-gsis-release]", "Choose an application"],
    ["admin", "h1 [data-gsis-release]", "Accounts and access"],
    ["roster", "header > span", "Baseline Timetable"],
    ["contacts", ".suite-release", "Contacts are ready"],
    ["deploy", ".release-version", "Create initial baseline"],
    ["calendar", ".release-label", "Year Setup"],
    ["layout", ".suite-release", "3D Campus"],
    ["venues", ".app-footer span", "Book a venue"],
    ["lord", "header [data-gsis-release]", "Book Devices"],
    ["overlord", "header [data-gsis-release]", "Open loans"],
    ["starlord", "header [data-gsis-release]", "No active or upcoming bookings"],
  ];
  for (const [module, selector, ready] of screens) {
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const loaded = await page.goto(origin + "/" + (module ? module + "/" : ""), { waitUntil: "domcontentloaded" });
    const title = (await loaded.text()).match(/<title>([\s\S]*?)<\/title>/i)?.[1];
    assert(title?.includes(RELEASE_LABEL), (module || "home") + " initial document title identifies the release");
    await page.waitForFunction(text => document.body.innerText.includes(text), ready, { timeout: 12000 });
    const label = page.locator(selector + ":visible").filter({ hasText: RELEASE_LABEL }).first();
    assert.equal(await label.isVisible(), true, (module || "home") + " has a visible current release label");
    // Existing view-specific runtime titles (for example Venues) remain unchanged.
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await label.isVisible(), true, (module || "home") + " release remains visible on a narrow screen");
    assert.deepEqual(errors, [], (module || "home") + " has no runtime errors");
    await page.close();
  }
  const manifest = JSON.parse(await readFile(join(suite.path, "product", "manifest.json"), "utf8"));
  assert.equal(manifest.releaseLabel, RELEASE_LABEL);
  assert.match(manifest.sourceCommit, /^[a-f0-9]{40}$/);
  for (const service of ["core", "contacts", "deploy", "roster", "calendar", "lord", "venues", "layout", "web"]) {
    const config = JSON.parse(await readFile(join(suite.path, "product", service, "wrangler.json"), "utf8"));
    assert.equal(config.vars.GSIS_RELEASE_LABEL, RELEASE_LABEL);
    assert.equal(config.vars.GSIS_BUILD_COMMIT, manifest.sourceCommit);
  }
  console.log(`PASS ${RELEASE_LABEL}: built home, Toolbox and nine application labels/titles; desktop/narrow browser; exact build SHA and all Worker labels; real local Workers/D1`);
} finally { await context?.unrouteAll({ behavior: "wait" }); await browser?.close(); await suite.close(); }
