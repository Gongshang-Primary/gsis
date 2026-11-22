import assert from "node:assert/strict";
import { chromium } from "playwright";
import { productSuite } from "./v1-product/suite.mjs";

const executablePath = process.env.GSIS_BROWSER_EXECUTABLE || "/usr/bin/chromium";
const suite = await productSuite("v1-calendar-venue-picker-focus", {
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-calendar-venue-focus.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});

let browser;
try {
  const admin = await suite.seedAccount("synthetic-cal-venue-focus-admin");
  const venuesDb = await suite.db("venues");
  const calDb = await suite.db("calendar");
  const schoolId = "synthetic-school";

  await suite.call(admin, "calendar", "/action", {
    operationId: "venue-focus-year-2027",
    action: "saveYear",
    payload: {
      Year: 2027,
      Status: "ACTIVE",
      ReleasedToTeachers: "No",
      expectedMetadataRevision: "missing",
    },
  });

  for (const [vid, unit, name] of [
    ["v-hall-a", "01-01", "Main Hall"],
    ["v-hall-b", "01-02", "Dance Studio"],
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
    await page.goto(`${origin}/calendar/`, { waitUntil: "domcontentloaded" });
    await page.locator("#yearSelect").selectOption("2027");
    await page.locator("[data-page=events]").click();
    await page.locator("[data-add-date]").first().click();
    await page.locator("#eventForm").waitFor({ state: "visible" });

    const input = page.locator("#calendarVenueInput");
    const suggestions = page.locator("#calendarVenueSuggestions");

    // 1. Type "Hall", blur, and immediately refocus within <10ms; wait 220ms (>100ms blur timer).
    await input.focus();
    await input.fill("Hall");
    await suggestions.waitFor({ state: "visible" });

    await page.evaluate(() => {
      const el = document.getElementById("calendarVenueInput");
      el.blur();
      el.focus();
    });
    await page.waitForTimeout(220);

    assert.equal(
      await suggestions.isVisible(),
      true,
      "suggestions must stay open after blur + immediate refocus past 100ms timer",
    );
    assert.equal(await input.getAttribute("aria-expanded"), "true");

    // 2. Select first suggestion (Main Hall).
    await suggestions.locator('[data-calendar-venue="v-hall-a"]').click();
    assert.equal(
      await page.locator("#calendarVenueChips .calendar-venue-chip").count(),
      1,
      "first venue chip added",
    );

    // 3. Open suggestions again and press Escape to cancel cleanly without losing chip.
    await input.focus();
    await input.fill("Studio");
    await suggestions.waitFor({ state: "visible" });
    await input.press("Escape");
    assert.equal(
      await suggestions.isVisible(),
      false,
      "Escape must close suggestions",
    );
    assert.equal(
      await page.locator("#calendarVenueChips .calendar-venue-chip").count(),
      1,
      "Escape preserves existing selected chip",
    );

    // 4. Add second room and save multi-room event.
    await input.focus();
    await input.fill("Dance");
    await suggestions.waitFor({ state: "visible" });
    await suggestions.locator('[data-calendar-venue="v-hall-b"]').click();
    assert.equal(
      await page.locator("#calendarVenueChips .calendar-venue-chip").count(),
      2,
      "second venue chip added",
    );

    await page.locator("#eventForm [name=StaffTitle]").fill("Multi-room Focus Event");
    await page.locator("#eventForm [name=OwnerTag]").selectOption("IP");
    await page.locator("#eventForm [name=Status]").selectOption("HIDDEN");
    await page.locator("#eventSaveBtn").click();
    await page.locator("#eventForm").waitFor({ state: "detached" });

    const rows = (
      await calDb
        .prepare("SELECT data_json FROM calendar_events WHERE school_id=? AND year=2027")
        .bind(schoolId)
        .all()
    ).results.map((r) => JSON.parse(r.data_json));
    const saved = rows.find((r) => r.StaffTitle === "Multi-room Focus Event");
    assert.ok(saved, "event saved to D1");
    assert.equal(saved.VenueID, "v-hall-a,v-hall-b", "multi-room VenueID persisted");

    console.log(
      "PASS Calendar venue picker focus: blur + immediate refocus keeps suggestions open past 100ms, Escape cancels cleanly, and multi-room selection saves to D1.",
    );
  } finally {
    await browser?.close();
  }
} finally {
  await suite.close();
}
