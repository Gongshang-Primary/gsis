import assert from "node:assert/strict";
import { chromium } from "playwright";
import layoutData from "../shared/layout-data.js";
import { productSuite } from "./v1-product/suite.mjs";

const executablePath = process.env.GSIS_BROWSER_EXECUTABLE || "/usr/bin/chromium";
const suite = await productSuite("v1-layout-first-import-g04", {
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-layout-g04.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});

let browser;
try {
  const admin = await suite.seedAccount("synthetic-layout-g04-admin", {
    capabilities: ["admin", "layout.admin", "layout.edit", "layout.read"],
  });
  const schoolId = "synthetic-school";

  // 1. Uninitialized year returns 404 SNAPSHOT_NOT_INITIALIZED (retryable: false), distinct from 503 SNAPSHOT_UNAVAILABLE.
  const emptyOwned = await suite.request(admin, "layout", "/owned-data?year=2027");
  assert.equal(emptyOwned.status, 404, "uninitialized year returns 404");
  assert.equal(emptyOwned.body.error?.code, "SNAPSHOT_NOT_INITIALIZED");
  assert.equal(emptyOwned.body.error?.retryable, false);

  const emptySnap = await suite.request(admin, "layout", "/snapshot?year=2027");
  assert.equal(emptySnap.status, 404);
  assert.equal(emptySnap.body.error?.code, "SNAPSHOT_NOT_INITIALIZED");

  // 2. Built browser UI shows first-import guidance and opens Initial source setup.
  const origin = "https://gsis.example.invalid";
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([
    {
      name: "__Host-gsis_session",
      value: admin.token,
      domain: "gsis.example.invalid",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (!request.url().startsWith(origin + "/")) return route.abort();
    const response = await suite.mf.dispatchFetch(request.url(), {
      method: request.method(),
      headers: await request.allHeaders(),
      body: ["GET", "HEAD"].includes(request.method())
        ? undefined
        : request.postDataBuffer(),
    });
    const headers = Object.fromEntries(response.headers);
    delete headers["transfer-encoding"];
    await route.fulfill({
      status: response.status,
      headers,
      body: Buffer.from(await response.arrayBuffer()),
    });
  });

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(`${origin}/layout/`, { waitUntil: "domcontentloaded" });
    await page.locator("#tgTab").click();
    const ownedPanel = page.locator("details.gsis-panel").filter({
      has: page.locator("summary", { hasText: "Layout-owned data" }),
    }).first();
    await ownedPanel.waitFor({ state: "visible" });
    if (!(await ownedPanel.evaluate((el) => el.open))) {
      await ownedPanel.locator("> summary").click();
    }
    await ownedPanel.locator("[data-year]").waitFor({ state: "visible" });
    await ownedPanel.locator("[data-year]").fill("2027");
    await ownedPanel.locator("[data-load]").click();

    await page.waitForFunction(
      () =>
        /No Layout snapshot exists for 2027 yet/i.test(
          document.querySelector("[data-status]")?.textContent || "",
        ),
      { timeout: 10000 },
    );
    const detailsOpen = await page.evaluate(() => {
      const el = document.querySelector("[data-initial-source]")?.closest("details");
      return Boolean(el?.open);
    });
    assert.equal(
      detailsOpen,
      true,
      "Initial source setup details should open automatically on uninitialized year",
    );
  } finally {
    await browser?.close();
  }

  // 3. Import initial snapshot for 2027 -> succeeds and reads cleanly.
  const initialSnapshot = layoutData.empty(2027);
  const imported = await suite.call(admin, "layout", "/snapshot/import", {
    operationId: "layout-g04-initial-import-2027",
    year: 2027,
    revision: 0,
    snapshot: initialSnapshot,
  });
  assert.equal(imported.revision, 1, "initial snapshot committed at revision 1");

  const loadedOk = await suite.request(admin, "layout", "/owned-data?year=2027");
  assert.equal(loadedOk.status, 200, "initialized year loads cleanly");

  // 4. Missing R2 storage after a head exists remains 503 SNAPSHOT_UNAVAILABLE.
  const layoutDb = await suite.db("layout");
  const snapRow = await layoutDb
    .prepare(
      "SELECT object_key, bytes FROM layout_snapshots WHERE school_id=? AND year=2027 AND revision=1",
    )
    .bind(schoolId)
    .first();
  assert.ok(snapRow?.object_key, "snapshot row exists in D1");

  const r2 = await suite.mf.getR2Bucket("ARTIFACTS", "gsis-layout");
  await r2.delete(snapRow.object_key);
  const missingStorage = await suite.request(admin, "layout", "/owned-data?year=2027");
  assert.equal(
    missingStorage.status,
    503,
    "missing R2 object after head exists must remain 503 error",
  );
  assert.equal(missingStorage.body.error?.code, "SNAPSHOT_UNAVAILABLE");

  // 5. Corrupt R2 storage with matching byte length remains 503 INTEGRITY_FAILED.
  await r2.put(snapRow.object_key, "X".repeat(Number(snapRow.bytes)));
  const corruptStorage = await suite.request(admin, "layout", "/owned-data?year=2027");
  assert.equal(
    corruptStorage.status,
    503,
    "corrupt R2 object after head exists must remain 503 error",
  );
  assert.equal(corruptStorage.body.error?.code, "INTEGRITY_FAILED");

  console.log(
    "PASS Layout first-import prerequisite (G04): 404 SNAPSHOT_NOT_INITIALIZED + browser first-import guidance, distinct from 503 SNAPSHOT_UNAVAILABLE and 503 INTEGRITY_FAILED after head exists.",
  );
} finally {
  await suite.close();
}
