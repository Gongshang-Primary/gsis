import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";

// Actual built frontend, gateway, Core and Venues; all accounts and records are
// synthetic. An unavailable timetable is retained throughout, never made ready
// merely to exercise navigation. No provider, live data or booking writes.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidence = join(root, "deliverables/v1/evidence/venues-navigation");
await mkdir(evidence, { recursive: true });
const sourcePath = join(root, "venues-viewport/public/app.js");
const legacySource = await readFile(sourcePath, "utf8");
const originalRewrite = "history.replaceState(null,'','/?'+p);";
const adaptedRewrite = "history.replaceState(null,'','/venues/?'+p);";
assert.equal(legacySource.split(originalRewrite).length - 1, 1);
const started = performance.now();
const observations = [],
  external = [],
  pageErrors = [],
  failedAssets = [],
  requests = [];
const suite = await productSuite();
let browser;
const contexts = [];
let passed = 0;
async function test(name, run) {
  const before = performance.now();
  try {
    const details = await run();
    observations.push({
      name,
      passed: true,
      ms: Math.round(performance.now() - before),
      details,
    });
    passed++;
    console.log("PASS " + name);
  } catch (error) {
    observations.push({ name, passed: false, error: error.stack });
    throw error;
  }
}
async function makePage(actor) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Singapore",
  });
  contexts.push(context);
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
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) {
      external.push(url.origin + url.pathname);
      await route.abort();
      return;
    }
    const result = await suite.mf.dispatchFetch(request.url(), {
      method: request.method(),
      headers: await request.allHeaders(),
      body: ["GET", "HEAD"].includes(request.method())
        ? undefined
        : request.postDataBuffer(),
    });
    if (request.method() !== "GET")
      requests.push({
        method: request.method(),
        path: url.pathname,
        operation: request.postDataJSON()?.operation,
        status: result.status,
      });
    if (result.status >= 400 && !url.pathname.startsWith("/api/"))
      failedAssets.push({ path: url.pathname, status: result.status });
    const headers = Object.fromEntries(result.headers);
    delete headers["transfer-encoding"];
    await route.fulfill({
      status: result.status,
      headers,
      body: Buffer.from(await result.arrayBuffer()),
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return page;
}
async function ready(page, url = "/venues/") {
  await page.goto(origin + url);
  await settled(page);
}
async function settled(page) {
  await page.waitForFunction(
    () =>
      document.querySelector('.main-nav [data-view="book"]')?.disabled ===
      false,
  );
  await page.waitForFunction(() => {
    const status = document.querySelector("[data-status]")?.textContent;
    return status && status !== "Loading your venues and timetable.";
  });
}
async function selected(page, view) {
  await page.waitForFunction(
    (view) =>
      document.querySelector('.main-nav [aria-current="page"]')?.dataset
        .view === view,
    view,
  );
  if (view === "admin")
    await page
      .getByRole("heading", { name: "Facilities administration", exact: true })
      .waitFor();
}
async function snapshot(page) {
  return page.evaluate(() => ({
    url: location.href,
    title: document.title,
    selected: document.querySelector('.main-nav [aria-current="page"]')?.dataset
      .view,
    source: document.querySelector("#sourceStatus")?.textContent,
    status: document.querySelector("[data-status]")?.textContent,
    reviewDisabled: document.querySelector("[data-preview-booking]")?.disabled,
    historyLength: history.length,
    width: {
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    },
  }));
}
function assertQuery(page, expected) {
  const url = new URL(page.url());
  assert.equal(
    url.pathname,
    "/venues/",
    "native Venues navigation must retain its module subpath",
  );
  assert.deepEqual(Object.fromEntries(url.searchParams), expected);
  assert.equal(url.hash, "");
}
try {
  const admin = await suite.seedAccount("venues-navigation-admin");
  const reader = await suite.seedAccount("venues-navigation-reader", {
    capabilities: ["venues.read"],
  });
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath:
      process.env.GSIS_BROWSER_EXECUTABLE ||
      process.env.ROSTER_TEST_CHROMIUM ||
      undefined,
  });
  const page = await makePage(admin);
  await test("native Administration retains /venues/ and reloads the same view", async () => {
    await ready(page);
    assert.equal(
      await page.locator("[data-preview-booking]").isDisabled(),
      true,
    );
    await page.locator('.main-nav [data-view="admin"]').click();
    await selected(page, "admin");
    const clicked = await snapshot(page);
    await page.screenshot({ path: join(evidence, "admin-desktop.png") });
    await page.reload();
    // Capture the real broken destination before asserting: the pre-fix red
    // must demonstrate launcher-on-reload, not compensate in the test router.
    await page.waitForFunction(
      () =>
        document.querySelector("#status")?.textContent ===
          "Choose an application." ||
        document.querySelector('.main-nav [data-view="book"]')?.disabled ===
          false,
    );
    const reload = {
      url: page.url(),
      launcher: await page.locator("#modules").count(),
      venuesNavigation: await page.locator(".main-nav").count(),
    };
    await writeFile(
      join(evidence, "admin-reload.json"),
      JSON.stringify({ clicked, reload }, null, 2),
    );
    assert.equal(
      new URL(clicked.url).pathname,
      "/venues/",
      JSON.stringify({ clicked, reload }),
    );
    assert.equal(reload.launcher, 0);
    await selected(page, "admin");
    assertQuery(page, { view: "admin" });
    assert.equal(await page.title(), "Manage venues | Venues · GSiS");
    return { clicked, reload };
  });
  await test("all native views preserve selection, title and supported query on reload", async () => {
    const results = [];
    for (const [view, title] of [
      ["book", "Book a venue"],
      ["mine", "My bookings"],
      ["dashboard", "Room dashboard"],
      ["admin", "Manage venues"],
    ]) {
      const length = await page.evaluate(() => history.length);
      await page.locator(`.main-nav [data-view="${view}"]`).click();
      await selected(page, view);
      assert.equal(await page.evaluate(() => history.length), length);
      let query = { view };
      if (view === "book")
        query.date = await page.locator("[name=bookingDate]").inputValue();
      if (view === "dashboard")
        Object.assign(query, {
          from: await page.locator("[name=dashboardFrom]").inputValue(),
          to: await page.locator("[name=dashboardTo]").inputValue(),
        });
      assertQuery(page, query);
      await page.reload();
      await settled(page);
      await selected(page, view);
      assertQuery(page, query);
      assert.equal(await page.title(), title + " | Venues · GSiS");
      results.push(await snapshot(page));
    }
    return results;
  });
  await test("native date, room and clipboard controls preserve supported query only", async () => {
    const db = await suite.db("venues");
    for (const [id, unit] of [
      ["room-one", "A-01"],
      ["room-two", "A-02"],
    ]) {
      await db
        .prepare(
          "INSERT INTO venues_records(school_id,kind,record_id,revision,data_json) VALUES(?,'venues',?,1,?)",
        )
        .bind(
          "synthetic-school",
          id,
          JSON.stringify({ id, unit, name: "Synthetic " + id, shortName: id }),
        )
        .run();
    }
    await ready(page, "/venues/?view=book&obsolete=discard-me#unused");
    await page.locator("[name=bookingDate]").fill("2026-11-16");
    await page.locator("[name=bookingDate]").dispatchEvent("change");
    assertQuery(page, { view: "book", date: "2026-11-16" });
    await page.reload();
    await settled(page);
    assert.equal(
      await page.locator("[name=bookingDate]").inputValue(),
      "2026-11-16",
    );
    await page.locator('.main-nav [data-view="dashboard"]').click();
    await page.locator('[data-dashboard-room="room-two"]').check();
    await page.locator('[data-dashboard-room="room-one"]').check();
    for (const [name, date] of [
      ["dashboardFrom", "2026-11-18"],
      ["dashboardTo", "2026-11-19"],
    ]) {
      await page.locator(`[name=${name}]`).fill(date);
      await page.locator(`[name=${name}]`).dispatchEvent("change");
    }
    await page.locator("[data-load-dashboard]").click();
    const query = {
      view: "dashboard",
      from: "2026-11-18",
      to: "2026-11-19",
      rooms: "room-two,room-one",
    };
    assertQuery(page, query);
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"], { origin });
    await page.locator("[data-copy-dashboard]").click();
    await page.waitForFunction(() =>
      document
        .querySelector("[data-status]")
        ?.textContent.includes("Dashboard link copied"),
    );
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(clipboard, page.url());
    await page.reload();
    await settled(page);
    assertQuery(page, query);
    assert.equal(
      await page.locator("[name=dashboardFrom]").inputValue(),
      query.from,
    );
    assert.equal(
      await page.locator("[name=dashboardTo]").inputValue(),
      query.to,
    );
    assert.deepEqual(
      await page
        .locator("[data-dashboard-room]:checked")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.dataset.dashboardRoom).sort(),
        ),
      ["room-one", "room-two"],
    );
    await page.locator("[data-clear-rooms]").click();
    delete query.rooms;
    assertQuery(page, query);
    await page.locator('.main-nav [data-view="mine"]').click();
    assertQuery(page, { view: "mine" });
    return { clipboard, cleared: query };
  });
  await test("native replaceState keeps real-document Back and Forward history", async () => {
    await page.goto(origin + "/");
    await page.locator('#modules a[href="/venues/"]').waitFor();
    await page.locator('#modules a[href="/venues/"]').click();
    await settled(page);
    const length = await page.evaluate(() => history.length);
    await page.locator('.main-nav [data-view="mine"]').click();
    await page.locator('.main-nav [data-view="dashboard"]').click();
    await page.locator('[data-dashboard-room="room-one"]').check();
    const finalUrl = page.url();
    assert.equal(await page.evaluate(() => history.length), length);
    await page.goBack();
    await page.locator("#modules").waitFor({ state: "visible" });
    assert.equal(new URL(page.url()).pathname, "/");
    await page.goForward();
    await settled(page);
    assert.equal(page.url(), finalUrl);
    await selected(page, "dashboard");
    assert.equal(
      await page.locator('[data-dashboard-room="room-one"]').isChecked(),
      true,
    );
    return { length, finalUrl };
  });
  await test("unavailable source remains blocked and native navigation fits 390px", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page, "/venues/?view=book");
    assert.match(
      await page.locator("#sourceStatus").innerText(),
      /unavailable/,
    );
    assert.match(
      await page.locator("[data-status]").innerText(),
      /bookings remain disabled/,
    );
    assert.equal(
      await page.locator("[data-preview-booking]").isDisabled(),
      true,
    );
    const before = await snapshot(page);
    assert.equal(before.width.document, 390);
    assert.equal(before.width.body, 390);
    await page.screenshot({ path: join(evidence, "book-narrow.png") });
    for (const view of ["mine", "dashboard", "admin"]) {
      await page.locator(`.main-nav [data-view="${view}"]`).click();
      await selected(page, view);
      assert.equal(new URL(page.url()).pathname, "/venues/");
      const box = await page
        .locator(`.main-nav [data-view="${view}"]`)
        .boundingBox();
      assert.ok(
        box.x >= 0 && box.x + box.width <= 391,
        "selected native navigation scrolls into the viewport",
      );
    }
    await page.reload();
    await settled(page);
    await selected(page, "admin");
    const after = await snapshot(page);
    assert.equal(after.width.document, 390);
    assert.equal(after.width.body, 390);
    await page.screenshot({ path: join(evidence, "admin-narrow.png") });
    await page.locator('.main-nav [data-view="book"]').click();
    assert.equal(
      await page.locator("[data-preview-booking]").isDisabled(),
      true,
    );
    return { before, after };
  });
  await test("query cannot grant Admin; native logout invalidates the actual Core session", async () => {
    const readPage = await makePage(reader);
    await ready(readPage, "/venues/?view=admin");
    assert.equal(
      await readPage.locator('.main-nav [data-view="admin"]').isHidden(),
      true,
    );
    assert.ok(
      await readPage
        .getByRole("heading", {
          name: /Room management (access required|could not load)/,
        })
        .count(),
    );
    const denied = await suite.request(reader, "venues", "/read", {
      method: "POST",
      body: { operation: "admin" },
    });
    assert.equal(denied.status, 403);
    await readPage.locator('.main-nav [data-view="book"]').click();
    assertQuery(readPage, {
      view: "book",
      date: await readPage.locator("[name=bookingDate]").inputValue(),
    });
    await page.locator("#signout").click();
    // Native and shared sign-out both navigate; assert the final user-visible
    // state and owner session, rather than waiting for the first navigation.
    await page.locator("#login").waitFor({ state: "visible" });
    assert.equal(new URL(page.url()).pathname, "/");
    assert.equal((await suite.request(admin, "core", "/session")).status, 401);
    await page.goto(origin + "/venues/?view=admin", { waitUntil: "commit" });
    await page.locator("#login").waitFor({ state: "visible" });
    assert.equal(await page.locator(".main-nav").count(), 0);
    assert.equal(await page.locator("#workspace").isHidden(), true);
    assert.deepEqual(
      await page.evaluate(() =>
        Object.keys(sessionStorage).filter((key) => key.startsWith("gsis")),
      ),
      [],
    );
    return { readerStatus: denied.status, logoutUrl: page.url() };
  });
  await test("gateway redirect, other module paths and original legacy source are unchanged", async () => {
    const redirect = await suite.mf.dispatchFetch(
      origin + "/venues?view=admin",
      { redirect: "manual" },
    );
    assert.equal(redirect.status, 308);
    assert.equal(
      redirect.headers.get("location"),
      origin + "/venues/?view=admin",
    );
    for (const [path, module] of [
      ["/", "home"],
      ["/contacts/?view=admin", "contacts"],
      ["/deploy/?view=dashboard", "deploy"],
      ["/roster/?view=mine", "roster"],
    ]) {
      const response = await suite.mf.dispatchFetch(origin + path);
      assert.equal(response.status, 200);
      assert.match(
        await response.text(),
        new RegExp('name="gsis-module" content="' + module + '"'),
      );
    }
    const response = await suite.mf.dispatchFetch(
      origin + "/venues/app.js?v=0.9.9x",
    );
    assert.equal(response.status, 200);
    const asset = await response.text();
    assert.equal(asset.split(originalRewrite).length - 1, 0);
    assert.equal(asset.split(adaptedRewrite).length - 1, 1);
    assert.equal(await readFile(sourcePath, "utf8"), legacySource);
    return {
      legacySha256: createHash("sha256").update(legacySource).digest("hex"),
      assetSha256: createHash("sha256").update(asset).digest("hex"),
    };
  });
  await test("no external egress, page errors, failed assets or unintended commands", async () => {
    assert.deepEqual(external, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failedAssets, []);
    // POST /read is read-only. Signed-out home normally initializes its local
    // sign-in challenge; no provider sign-in or role grant is performed.
    const allowed = new Set([
      "/api/venues/read",
      "/api/core/logout",
      "/api/core/login/start",
    ]);
    assert.ok(
      requests.every(
        (request) => request.method === "POST" && allowed.has(request.path),
      ),
      JSON.stringify(requests),
    );
    assert.equal(
      requests.filter((request) => request.path === "/api/core/logout").length,
      1,
    );
    return { requests };
  });
} finally {
  for (const context of contexts)
    await context.unrouteAll({ behavior: "wait" });
  await browser?.close();
  await suite.close();
  const elapsedMs = Math.round(performance.now() - started);
  await writeFile(
    join(evidence, "results.json"),
    JSON.stringify(
      {
        passed,
        elapsedMs,
        observations,
        external,
        pageErrors,
        failedAssets,
        requests,
      },
      null,
      2,
    ),
  );
  console.log(`${passed} Venues navigation groups passed in ${elapsedMs}ms`);
}
