import assert from "node:assert/strict";
import { chromium } from "playwright";
import { productSuite } from "./v1-product/suite.mjs";

const executablePath = process.env.GSIS_BROWSER_EXECUTABLE || "/usr/bin/chromium";
const suite = await productSuite({
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-venues-b-v01.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});

let browser;
try {
  const admin = await suite.seedAccount("synthetic-b-v01-admin");
  const schoolId = "synthetic-school";

  // Seed 1 active teacher in Contacts so Roster mapping can resolve staff cleanly.
  const created = await suite.call(admin, "contacts", "/save-data", {
    operationId: "b-v01-seed-staff-1",
    changes: [],
    additions: [
      {
        id: "b-v01-t1",
        values: {
          "Basic Name": "Tan Guidance",
          "Statutory Name": "Tan Guidance",
          Active: "Y",
        },
      },
    ],
  });
  const staffId = created.mapping["b-v01-t1"];

  // Create a Deploy planning version with zero venues (Venues register is empty).
  const { versionId } = await suite.call(admin, "deploy", "/versions/create", {
    operationId: "b-v01-create-version-1",
    name: "Synthetic Empty Venues 2026",
  });

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

  const sampleModel = {
    single: {
      blocks: [
        {
          name: "Tan Guidance",
          cells: [["P1", "Math", "Hall A"]],
        },
      ],
    },
  };

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(12000);

    // 1. Deploy with empty Venues register shows setup guidance on Layout tab.
    await page.goto(`${origin}/deploy/`, { waitUntil: "domcontentloaded" });
    await page.locator('#nav button[data-tab="Layout"]').waitFor({ state: "visible" });
    await page.locator('#nav button[data-tab="Layout"]').click();
    const deployNotice = page.locator("[data-venues-empty-guidance]");
    await deployNotice.waitFor({ state: "visible" });
    assert.match(await deployNotice.innerText(), /Venues Administration/i);
    assert.equal(await deployNotice.locator('a[href="/venues/"]').count(), 1);

    // 2. Roster with empty Venues register shows setup guidance in timetable identity mapping.
    await page.goto(`${origin}/roster/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.GSISV1RosterMapping === "function");
    const mappingPromiseEmpty = page.evaluate((model) => {
      return window.GSISV1RosterMapping(model).catch((e) => ({ cancelled: e.message }));
    }, sampleModel);
    const rosterNotice = page.locator("dialog.v1-panel [data-venues-empty-guidance]");
    await rosterNotice.waitFor({ state: "visible" });
    assert.match(await rosterNotice.innerText(), /Venues Administration/i);
    assert.equal(await rosterNotice.locator('a[href="/venues/"]').count(), 1);
    assert.equal(
      await page.locator('dialog.v1-panel select[aria-label="Venues: Hall A"] option').count(),
      0,
      "empty register has 0 venue options",
    );
    await page.locator("dialog.v1-panel button", { hasText: "Cancel" }).click();
    await mappingPromiseEmpty;

    // 3. Seed a room in Venues physical register and refresh Deploy venues.
    const venuesDb = await suite.db("venues");
    await venuesDb
      .prepare(
        "INSERT OR REPLACE INTO venues_records(school_id,kind,record_id,revision,service_date,venue_id,status,data_json) VALUES(?,'venues',?,1,NULL,?,'active',?)",
      )
      .bind(
        schoolId,
        "v-hall-a",
        "v-hall-a",
        JSON.stringify({ id: "v-hall-a", unit: "01-01", name: "Hall A", category: "Hall", active: true }),
      )
      .run();

    const lease = await suite.call(admin, "deploy", "/lease", {
      operationId: "b-v01-deploy-lease-venues",
      versionId,
      scope: "venues",
      clientId: "b-v01-client",
    });
    await suite.call(admin, "deploy", "/change", {
      operationId: "b-v01-deploy-venues-refresh",
      versionId,
      scope: "venues",
      operation: "refreshVenueRegistry",
      clientId: "b-v01-client",
      leaseFence: lease.fence,
    });

    // 4. Deploy guidance disappears after seeding + refreshing.
    await page.goto(`${origin}/deploy/`, { waitUntil: "domcontentloaded" });
    await page.locator('#nav button[data-tab="Layout"]').waitFor({ state: "visible" });
    await page.locator('#nav button[data-tab="Layout"]').click();
    await page.waitForTimeout(500);
    assert.equal(
      await page.locator("[data-venues-empty-guidance]").count(),
      0,
      "Deploy empty-register guidance must disappear after rooms are seeded and refreshed",
    );

    // 5. Roster guidance disappears and normal room selection resumes after seeding.
    await page.goto(`${origin}/roster/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.GSISV1RosterMapping === "function");
    const mappingPromiseSeeded = page.evaluate((model) => window.GSISV1RosterMapping(model), sampleModel);
    await page.locator("dialog.v1-panel").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("dialog.v1-panel [data-venues-empty-guidance]").count(),
      0,
      "Roster empty-register guidance must disappear after rooms are seeded",
    );
    assert.equal(
      await page.locator('dialog.v1-panel select[aria-label="Venues: Hall A"] option').count(),
      1,
      "seeded register exposes Hall A option",
    );
    await page
      .locator('dialog.v1-panel select[aria-label="Venues: Hall A"]')
      .selectOption("v-hall-a");
    await page.locator("dialog.v1-panel button", { hasText: "Confirm identity mapping" }).click();
    const mapped = await mappingPromiseSeeded;
    assert.equal(mapped.staffMapping["Tan Guidance"], staffId);
    assert.deepEqual(mapped.venueMapping["Hall A"], ["v-hall-a"]);

  } finally {
    try {
      // Finish dispatchFetch calls before closing Chromium and the Worker fixture.
      await context.unrouteAll({ behavior: "wait" });
    } finally {
      await browser?.close();
    }
  }
} finally {
  await suite.close();
}
console.log(
  "PASS Venues empty-register guidance (B-V01): Deploy and Roster show setup guidance linking to /venues/ when empty, and resume normal selection with guidance cleared after seeding.",
);
