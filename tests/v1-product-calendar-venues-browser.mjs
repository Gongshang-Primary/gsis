import assert from "node:assert/strict";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";

const suite = await productSuite({ bindings: { HOSTED_DOMAIN: "example.invalid" } });
let browser;
try {
  const admin = await suite.seedAccount("calendar-venues-browser");
  const venues = [
    { id: "synthetic-music", unit: "R2", name: "Music, Dance and Drama", capacity: 20 },
    { id: "synthetic-hall", unit: "R1", name: "Synthetic Hall", capacity: 40 },
  ];
  await suite.call(admin, "venues", "/command", { operation: "importVenues", operationId: "browser-rooms", venues });
  // Foreign-school directory content must not satisfy a selection for this school.
  const venueDb = await suite.db("venues");
  await venueDb.prepare("INSERT INTO venues_records(school_id,kind,record_id,revision,data_json) VALUES('other-school','venues','foreign-room',1,?)")
    .bind(JSON.stringify({ id: "foreign-room", name: "Foreign synthetic room", unit: "F1", capacity: 10 })).run();
  await suite.call(admin, "calendar", "/action", { action: "saveYear", operationId: "browser-year", payload: { Year: 2026, Status: "ACTIVE", ReleasedToTeachers: "No", expectedMetadataRevision: "missing" } });
  const seed = await suite.call(admin, "calendar", "/action", { action: "saveEvent", operationId: "browser-event", payload: { event: { Year: 2026, StaffTitle: "Synthetic room picker", StartDate: "2026-11-20", EndDate: "2026-11-20", EventType: "ALL_DAY", Status: "HIDDEN", LaneID: "day" } } });
  const foreign = await suite.request(admin, "calendar", "/action", { method: "POST", body: { action: "saveEvent", operationId: "foreign-room-denial", payload: { event: { EventID: seed.eventId, VenueID: "synthetic-music,foreign-room" }, expectedRevision: 1 } } });
  assert.equal(foreign.status, 409, JSON.stringify(foreign.body));
  assert.equal(foreign.body.error.code, "INVALID_VENUE");
  const venueBefore = await venueDb.prepare("SELECT * FROM venues_records ORDER BY school_id,kind,record_id").all();
  const occupancyBefore = await venueDb.prepare("SELECT * FROM venues_occupancy ORDER BY school_id,record_id").all();
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"], executablePath: process.env.GSIS_BROWSER_EXECUTABLE || process.env.ROSTER_TEST_CHROMIUM || undefined });
  const context = await browser.newContext();
  context.setDefaultTimeout(10000);
  await context.addCookies([{ name: "__Host-gsis_session", value: admin.token, domain: "gsis.example.invalid", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  const external = [], errors = [];
  await context.route("**/*", async route => {
    const request = route.request();
    if (request.url() === "https://accounts.google.com/gsi/client") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    if (!request.url().startsWith(origin + "/")) { external.push(request.url()); return route.abort(); }
    const response = await suite.mf.dispatchFetch(request.url(), { method: request.method(), headers: await request.allHeaders(), body: ["GET", "HEAD"].includes(request.method()) ? undefined : request.postDataBuffer() });
    const headers = Object.fromEntries(response.headers); delete headers["transfer-encoding"];
    await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + "/calendar/");
  await page.locator(`[data-event-id="${seed.eventId}"]`).first().click();
  const form = page.locator("#eventForm");
  await form.waitFor();
  // Use native chips and keyboard selection; do not replace the frontend or API.
  const picker = page.locator("#calendarVenueInput");
  for (const venue of venues) {
    await picker.fill(venue.name);
    await picker.press("ArrowDown");
    await picker.press("Enter");
  }
  const custom = "Unlisted assembly point, north gate";
  await picker.fill(custom); await picker.press("Enter");
  assert.equal(await page.locator("#calendarVenueChips .calendar-venue-chip").count(), 3);
  assert.equal(await form.locator('[name="VenueID"]').inputValue(), "synthetic-music,synthetic-hall");
  const expectedLocation = "R2 Music, Dance and Drama, R1 Synthetic Hall, " + custom;
  assert.equal(await form.locator('[name="Location"]').inputValue(), expectedLocation);
  // Existing native form requires a glossary tag; select its first actual option.
  await form.locator('[name="OwnerTag"]').selectOption({ index: 0 });
  await page.locator("#eventSaveBtn").click();
  await form.waitFor({ state: "hidden" });
  const calendarDb = await suite.db("calendar");
  const saved = await calendarDb.prepare("SELECT data_json,revision FROM calendar_events WHERE event_id=?").bind(seed.eventId).first();
  const data = JSON.parse(saved.data_json);
  assert.equal(saved.revision, 2, "one real atomic Calendar edit committed");
  assert.equal(data.VenueID, "synthetic-music,synthetic-hall");
  assert.equal(data.Location, expectedLocation);
  await page.reload();
  await page.locator(`[data-event-id="${seed.eventId}"]`).first().click();
  await form.waitFor();
  const chipLabels = await page.locator("#calendarVenueChips .calendar-venue-chip span:last-child").allTextContents();
  assert.deepEqual(chipLabels, ["R2 Music, Dance and Drama", "R1 Synthetic Hall", custom], "reload reconstitutes labels containing commas and one custom location");
  assert.equal(await form.locator('[name="VenueID"]').inputValue(), "synthetic-music,synthetic-hall");
  assert.deepEqual((await venueDb.prepare("SELECT * FROM venues_records ORDER BY school_id,kind,record_id").all()).results, venueBefore.results);
  assert.deepEqual((await venueDb.prepare("SELECT * FROM venues_occupancy ORDER BY school_id,record_id").all()).results, occupancyBefore.results, "Calendar selection does not create a reservation");
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  console.log("PASS native Calendar multi-room picker → actual Core/Calendar/Venues → D1 save/reload, comma-bearing labels/custom text, foreign-school room denial and no reservation side effect; synthetic browser only");
} finally { await browser?.close(); await suite.close(); }
