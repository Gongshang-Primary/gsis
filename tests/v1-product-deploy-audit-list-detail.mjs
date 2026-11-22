// v1 Deploy Audit list/detail contract and non-destructive archive label (Repair 2a).
// Real built Workers/D1 + Chromium browser.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";

const suite = await productSuite({
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-audit.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});
let browser;
try {
  const admin = await suite.seedAccount("audit-admin");
  const staffRecord = await suite.call(admin, "contacts", "/staff/create", {
    operationId: "audit-staff-create",
    basicName: "Audit Reader Staff",
    employmentActive: true,
    schoolSection: "Primary",
  });
  const staff = await suite.seedAccount("audit-staff", {
    staffId: staffRecord.result?.staffId || staffRecord.staffId,
    capabilities: ["deploy.read"],
  });

  // 1. Create two separate versions.
  const v1 = await suite.call(admin, "deploy", "/versions/create", {
    operationId: "audit-v1-create",
    name: "Audit Version One",
    year: 2026,
  });
  const v2 = await suite.call(admin, "deploy", "/versions/create", {
    operationId: "audit-v2-create",
    name: "Audit Version Two",
    year: 2026,
  });

  // Save a Subject Load edit on V1.
  const boot1 = await suite.call(admin, "deploy", "/bootstrap", {
    versionId: v1.versionId,
  });
  const lease1 = await suite.call(admin, "deploy", "/lease", {
    operationId: "audit-v1-lease",
    versionId: v1.versionId,
    scope: "meta",
    clientId: "audit-client",
  });
  await suite.call(admin, "deploy", "/change", {
    operationId: "audit-v1-load",
    versionId: v1.versionId,
    revision: boot1.current.revision,
    scope: "meta",
    clientId: "audit-client",
    leaseFence: lease1.fence,
    operation: "saveDraft",
    edits: [{ operation: "setLoad", level: "1", subject: "EL", value: 12, expected: 0 }],
  });

  // Seed 4 extra historical audit rows on V1 with EQUAL timestamps (to test stable pagination)
  // and 1 historical row on V2.
  const deployDb = await suite.db("deploy");
  const sameTs = Date.now() - 10000;
  for (const suffix of ["a", "b", "c", "d"]) {
    await deployDb
      .prepare(
        "INSERT INTO product_audit(school_id,event_id,operation_id,actor_id,action,recorded_at,decision_id,details_json) VALUES(?,?,?,?,?,?,NULL,?)",
      )
      .bind(
        "synthetic-school",
        `hist-v1-${suffix}`,
        `op-v1-${suffix}`,
        admin.id,
        "deploy.edit",
        sameTs,
        JSON.stringify({ version: v1.versionId, scope: "meta", changedRows: 1 }),
      )
      .run();
  }
  await deployDb
    .prepare(
      "INSERT INTO product_audit(school_id,event_id,operation_id,actor_id,action,recorded_at,decision_id,details_json) VALUES(?,?,?,?,?,?,NULL,?)",
    )
    .bind(
      "synthetic-school",
      "hist-v2-only",
      "op-v2-only",
      admin.id,
      "deploy.edit",
      sameTs,
      JSON.stringify({ version: v2.versionId, scope: "meta", changedRows: 2 }),
    )
    .run();

  // 2. Non-admin denied (403).
  const denied = await suite.request(staff, "deploy", "/auditPage", {
    method: "POST",
    body: { versionId: v1.versionId },
  });
  assert.equal(denied.status, 403, JSON.stringify(denied.body));

  // 3. Version isolation + numeric total + multi-page stable pagination across equal timestamps.
  const p1 = await suite.call(admin, "deploy", "/auditPage", {
    versionId: v1.versionId,
    limit: 2,
  });
  assert.equal(p1.versionId, v1.versionId);
  assert.equal(typeof p1.total, "number");
  assert(p1.total >= 5, "V1 has create + load + 4 historical rows: " + p1.total);
  assert.equal(p1.events.length, 2);
  assert(p1.cursor, "first page returns cursor");
  assert.equal(p1.archiveScope, "school-admin");

  const seenIds = new Set(p1.events.map((e) => e.id));
  let cursor = p1.cursor;
  let pages = 1;
  while (cursor) {
    const next = await suite.call(admin, "deploy", "/auditPage", {
      versionId: v1.versionId,
      limit: 2,
      cursor,
    });
    assert.equal(next.total, p1.total);
    for (const ev of next.events) {
      assert(!seenIds.has(ev.id), "no duplicate event across pages: " + ev.id);
      seenIds.add(ev.id);
    }
    cursor = next.cursor;
    pages++;
    assert(pages <= 20, "pagination terminates");
  }
  assert.equal(seenIds.size, p1.total, "all V1 events visited with equal timestamps");
  assert(!seenIds.has("hist-v2-only"), "V2 events never leak into V1 audit list");

  // V2 list only shows V2 events.
  const v2List = await suite.call(admin, "deploy", "/auditPage", {
    versionId: v2.versionId,
  });
  assert(v2List.events.some((e) => e.id === "hist-v2-only"));
  assert(v2List.events.every((e) => !e.id.startsWith("hist-v1-")));
  assert.equal(v2List.total, v2List.events.length);

  // 4. Detail lookup: valid event, unknown event (404), foreign-version event (404).
  const detail = await suite.call(admin, "deploy", "/auditPage", {
    versionId: v1.versionId,
    detailId: "hist-v1-a",
  });
  assert.equal(detail.versionId, v1.versionId);
  assert.equal(detail.event.id, "hist-v1-a");
  assert.equal(detail.event.before.recorded, false);
  assert.match(detail.event.before.note, /not recorded/i);
  assert.equal(detail.event.before.metadata.version, v1.versionId);

  const missingDetail = await suite.request(admin, "deploy", "/auditPage", {
    method: "POST",
    body: { versionId: v1.versionId, detailId: "does-not-exist" },
  });
  assert.equal(missingDetail.status, 404);

  const foreignDetail = await suite.request(admin, "deploy", "/auditPage", {
    method: "POST",
    body: { versionId: v1.versionId, detailId: "hist-v2-only" },
  });
  assert.equal(foreignDetail.status, 404, "foreign-version event must return 404");

  const badCursor = await suite.request(admin, "deploy", "/auditPage", {
    method: "POST",
    body: { versionId: v1.versionId, cursor: "malformed-cursor" },
  });
  assert.equal(badCursor.status, 400);

  // 5. Real Chromium browser check: numeric total, Before/after detail, version switch, accurate archive label.
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath:
      process.env.GSIS_BROWSER_EXECUTABLE ||
      process.env.ROSTER_TEST_CHROMIUM ||
      undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    timezoneId: "Asia/Singapore",
  });
  await context.addCookies([
    {
      name: "__Host-gsis_session",
      value: admin.token,
      domain: new URL(origin).hostname,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const errors = [];
  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== origin) return route.abort();
    const res = await suite.mf.dispatchFetch(req.url(), {
      method: req.method(),
      headers: await req.allHeaders(),
      body: ["GET", "HEAD"].includes(req.method()) ? undefined : req.postDataBuffer(),
    });
    const headers = Object.fromEntries(res.headers);
    delete headers["transfer-encoding"];
    const body = Buffer.from(await res.arrayBuffer());
    await route.fulfill({
      status: res.status,
      headers,
      body,
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(origin + "/deploy/");
  await page.waitForFunction(() => !!current && !!v());
  await page.locator("#version").selectOption(v1.versionId);
  await page.waitForFunction((vid) => current === vid, v1.versionId);
  await page.getByRole("button", { name: "Audit", exact: true }).click();
  await page
    .locator('#content [role="status"]')
    .filter({ hasText: `Showing ${p1.total} of ${p1.total} events` })
    .waitFor();

  // Accurate non-destructive archive button label.
  await page
    .getByRole("button", {
      name: "Archive displayed audit (this Admin · school view)",
      exact: true,
    })
    .waitFor();

  // Open Before / after on a row -> loads detail cleanly without undefined/error.
  const firstDetail = page.locator('#content details[data-audit-id="hist-v1-a"]');
  await firstDetail.locator("summary").click();
  await page.waitForFunction(() => {
    const pre = document.querySelector('#content details[data-audit-id="hist-v1-a"] pre');
    return pre && pre.textContent.includes("not recorded");
  });

  // Switch to V2 -> shows V2's count and does not show V1 events.
  await page.locator("#version").selectOption(v2.versionId);
  await page
    .locator('#content [role="status"]')
    .filter({ hasText: `Showing ${v2List.total} of ${v2List.total} events` })
    .waitFor();
  assert.equal(
    await page.locator('#content details[data-audit-id="hist-v1-a"]').count(),
    0,
  );

  // 6. Non-destructive archive hides displayed rows without deleting D1 product_audit evidence.
  const purgeLease = await suite.call(admin, "deploy", "/lease", {
    operationId: "audit-purge-lease",
    versionId: v1.versionId,
    scope: "meta",
    clientId: "audit-client",
  });
  await suite.call(admin, "deploy", "/change", {
    operationId: "audit-purge-op",
    versionId: v1.versionId,
    scope: "meta",
    clientId: "audit-client",
    leaseFence: purgeLease.fence,
    operation: "purge",
  });
  const afterArchive = await suite.call(admin, "deploy", "/auditPage", {
    versionId: v1.versionId,
  });
  assert.equal(afterArchive.total, 0, "older events hidden from this Admin display");
  const withArchived = await suite.call(admin, "deploy", "/auditPage", {
    versionId: v1.versionId,
    includeArchived: true,
  });
  assert.equal(
    withArchived.total,
    p1.total,
    "underlying product_audit evidence preserved non-destructively",
  );

  assert.deepEqual(errors, []);
  console.log(
    "PASS Deploy Audit list/detail contract: version isolation, numeric total, equal-timestamp cursor pagination, detail lookup (404 on unknown/foreign), non-destructive archive, and Chromium UI.",
  );
} finally {
  await browser?.close();
  await suite.close();
}
