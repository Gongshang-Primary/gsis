import assert from "node:assert/strict";
import { chromium } from "playwright";
import { productSuite } from "./v1-product/suite.mjs";

const executablePath = process.env.GSIS_BROWSER_EXECUTABLE || "/usr/bin/chromium";
const suite = await productSuite("v1-calendar-bulk-import-browser", {
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-calendar-bulk-import.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});

let browser;
try {
  const admin = await suite.seedAccount("synthetic-cal-bulk-admin");
  const calDb = await suite.db("calendar");
  const venuesDb = await suite.db("venues");
  const schoolId = "synthetic-school";

  // Seed active year 2026 and two physical venues for multi-room validation.
  await calDb
    .prepare(
      "INSERT OR REPLACE INTO calendar_years(school_id,year,revision,released,status,data_json) VALUES(?,?,?,?,?,?)",
    )
    .bind(
      schoolId,
      2026,
      1,
      1,
      "ACTIVE",
      JSON.stringify({ Year: 2026, Status: "ACTIVE", Released: true }),
    )
    .run();

  for (const [vid, unit, name] of [
    ["v-room-1", "01-01", "Hall A"],
    ["v-room-2", "01-02", "Hall B"],
  ]) {
    await venuesDb
      .prepare(
        "INSERT OR REPLACE INTO venues_records(school_id,kind,record_id,revision,service_date,venue_id,status,data_json) VALUES(?,'venues',?,1,NULL,?,'active',?)",
      )
      .bind(
        schoolId,
        vid,
        vid,
        JSON.stringify({ id: vid, unit, name, category: "Hall", active: true }),
      )
      .run();
  }

  const countEvents = async () =>
    Number(
      (
        await calDb
          .prepare("SELECT COUNT(*) AS count FROM calendar_events WHERE school_id=? AND year=2026")
          .bind(schoolId)
          .first()
      )?.count || 0,
    );

  const origin = "https://gsis.example.invalid";
  browser = await chromium.launch({ executablePath, headless: true });
  async function contextFor(user) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    if (user) {
      await context.addCookies([
        {
          name: "__Host-gsis_session",
          value: user.token,
          domain: "gsis.example.invalid",
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    }
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
    return context;
  }

  try {
    // 1. Authorized Calendar Admin flow in Chromium.
    const adminCtx = await contextFor(admin);
    const page = await adminCtx.newPage();
    await page.goto(`${origin}/calendar/`, { waitUntil: "domcontentloaded" });
    await page.locator("#bulkImportEventsBtn").waitFor({ state: "visible", timeout: 15000 });
    await page.locator("#bulkImportEventsBtn").click();
    await page.locator("#calendarBulkImportDialog").waitFor({ state: "visible" });

    await page.locator("#bulkImportYear").fill("2026");

    // 1a. Invalid row surfaces validation error and keeps Confirm disabled.
    const invalidRows = [
      {
        StaffTitle: "Valid Assembly",
        LaneID: "day",
        EventType: "TIMED",
        Status: "PUBLISHED",
        StartDate: "2026-03-10",
        EndDate: "2026-03-10",
        StartTime: "07:30",
        EndTime: "08:30",
        VenueID: "v-room-1,v-room-2",
        ParentEnabled: "No",
      },
      {
        StaffTitle: "Broken Venue Row",
        LaneID: "day",
        EventType: "ALL_DAY",
        Status: "PUBLISHED",
        StartDate: "2026-03-11",
        EndDate: "2026-03-11",
        VenueID: "v-nonexistent",
        ParentEnabled: "No",
      },
    ];
    await page.locator("#bulkImportInput").fill(JSON.stringify(invalidRows, null, 2));
    await page.locator("#bulkImportPreviewBtn").click();
    await page.locator("[data-bulk-import-error]").first().waitFor({ state: "visible", timeout: 10000 });
    assert.equal(
      await page.locator("#bulkImportConfirmBtn").isDisabled(),
      true,
      "confirm must remain disabled while invalid rows exist",
    );
    assert.equal(await countEvents(), 0, "zero events saved on invalid preview");

    // 1b. Correct invalid row -> preview becomes valid and shows multi-room venues.
    const validRows = [
      invalidRows[0],
      {
        StaffTitle: "Fixed Science Fair",
        LaneID: "day",
        EventType: "ALL_DAY",
        Status: "PUBLISHED",
        StartDate: "2026-03-12",
        EndDate: "2026-03-12",
        VenueID: "v-room-2",
        ParentEnabled: "No",
      },
    ];
    await page.locator("#bulkImportInput").fill(JSON.stringify(validRows, null, 2));
    await page.locator("#bulkImportPreviewBtn").click();
    await page.waitForFunction(
      () => !document.getElementById("bulkImportConfirmBtn")?.disabled,
      { timeout: 10000 },
    );
    const previewText = await page.locator("#bulkImportPreviewHost").innerText();
    assert.match(previewText, /Valid Assembly/);
    assert.match(previewText, /v-room-1,v-room-2/);
    assert.match(previewText, /Fixed Science Fair/);

    // 1c. Stale preview after year revision bump is refused (409) with zero writes.
    await calDb
      .prepare("UPDATE calendar_years SET revision=revision+1 WHERE school_id=? AND year=2026")
      .bind(schoolId)
      .run();
    await page.locator("#bulkImportConfirmBtn").click();
    await page.waitForFunction(
      () => /Preview again/i.test(document.getElementById("bulkImportStatus")?.textContent || ""),
      { timeout: 10000 },
    );
    assert.equal(await countEvents(), 0, "stale preview must not mutate events");

    // 1d. Re-preview against fresh revision and commit atomically.
    await page.locator("#bulkImportPreviewBtn").click();
    await page.waitForFunction(
      () => !document.getElementById("bulkImportConfirmBtn")?.disabled,
      { timeout: 10000 },
    );
    await page.locator("#bulkImportConfirmBtn").click();
    await page.waitForFunction(
      () => /Imported 2 event\(s\) for 2026/i.test(document.getElementById("bulkImportStatus")?.textContent || ""),
      { timeout: 10000 },
    );
    assert.equal(await countEvents(), 2, "both events committed atomically");
    const savedRows = (
      await calDb
        .prepare("SELECT data_json FROM calendar_events WHERE school_id=? AND year=2026")
        .bind(schoolId)
        .all()
    ).results.map((r) => JSON.parse(r.data_json));
    const multiRoom = savedRows.find((r) => r.StaffTitle === "Valid Assembly");
    assert.ok(multiRoom, "multi-room event saved");
    assert.equal(multiRoom.VenueID, "v-room-1,v-room-2");

    // 2. Exact operationId retry is idempotent (no duplicate events).
    const retryEvents = [
      {
        StaffTitle: "Idempotent Retry Event",
        LaneID: "day",
        EventType: "ALL_DAY",
        Status: "PUBLISHED",
        StartDate: "2026-04-01",
        EndDate: "2026-04-01",
        VenueID: "v-room-1",
        ParentEnabled: "No",
      },
    ];
    const retryPreview = await suite.call(admin, "calendar", "/action", {
      action: "importEventsPreview",
      payload: { year: 2026, events: retryEvents },
    });
    assert.equal(retryPreview.valid, true);
    const retryPayload = {
      operationId: "bulk-import-idempotent-retry-1",
      year: 2026,
      events: retryEvents,
      previewDigest: retryPreview.previewDigest,
      expectedYearRevision: retryPreview.yearRevision,
    };
    const firstApply = await suite.call(admin, "calendar", "/action", {
      action: "importEventsApply",
      payload: retryPayload,
    });
    const secondApply = await suite.call(admin, "calendar", "/action", {
      action: "importEventsApply",
      payload: retryPayload,
    });
    assert.deepEqual(secondApply.eventIds, firstApply.eventIds);
    assert.equal(await countEvents(), 3, "exact retry creates no duplicate event");

    // 3. Unauthorized viewer does not see Bulk import events button.
    const viewer = await suite.seedAccount("synthetic-cal-bulk-viewer", {
      capabilities: ["calendar.read"],
    });
    const viewerCtx = await contextFor(viewer);
    const viewerPage = await viewerCtx.newPage();
    await viewerPage.goto(`${origin}/calendar/`, { waitUntil: "domcontentloaded" });
    await viewerPage.waitForTimeout(800);
    assert.equal(
      await viewerPage.locator("#bulkImportEventsBtn").count(),
      0,
      "unauthorized user must not see bulk import trigger",
    );

    console.log(
      "PASS Calendar bulk import UI (A16/T03): invalid-row correction, multi-room preview/commit, stale preview 409 refusal, exact operationId retry idempotency, and admin-only visibility.",
    );
  } finally {
    await browser?.close();
  }
} finally {
  await suite.close();
}
