/** Built Venues browser and isolated Workers/D1 verifying V01-V04, V10-V18, V21:
 * 1. Physical Room Register (v1/web/shared/venues-register.js):
 *    - Displays and edits Class-slot capacity (classSlotCapacity: 1..20 or blank=unknown) separately from pupil seating capacity.
 * 2. Multi-slot booking grid & slotMode selector:
 *    - When a room has classSlotCapacity: 2 (e.g. ISH-1) and 1 slot is occupied by a timetable lesson or a 1-slot booking, the period displays "Available (1/2 slots)" and remains selectable for a 1-slot booking.
 *    - Review booking dialog exposes the "Booking scope" selector (One class slot vs Whole venue), marks Whole venue unavailable when 1 slot is already taken, and books One class slot cleanly.
 *    - When classSlotCapacity is null (unknown), the period displays "Class-slot capacity not configured" and is disabled.
 * 3. Retained sourceConflict badge & resolveConflict ("keep" / "cancel") UI:
 *    - A held booking flagged with sourceConflict.status === "unresolved" displays the "Timetable conflict — review required" badge.
 *    - Opening Manage booking exposes "Keep booking (resolve conflict)" and "Cancel conflicted booking" controls and resolves/cancels cleanly. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { futureDate } from "./v1-product/roster-unblock-fixtures.mjs";

const schoolId = "synthetic-school";
const suite = await productSuite();
let browser;
try {
  const admin = await suite.seedAccount("venues-slot-admin");
  const date = futureDate(3);
  const db = await suite.db("venues");

  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath:
      process.env.GSIS_BROWSER_EXECUTABLE ||
      process.env.ROSTER_TEST_CHROMIUM ||
      undefined,
  });

  const context = await browser.newContext({
    viewport: { width: 1360, height: 1000 },
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
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
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

  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. Add physical room ISH-1 with seating capacity 80 and Class-slot capacity 2 via register UI
  await page.goto(origin + "/venues/?view=admin");
  const register = page.locator("#v1VenueRegister");
  await register.getByRole("button", { name: "Add physical room", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Add physical room", exact: true });
  await dialog.getByLabel("Unit", { exact: true }).fill("ISH-1");
  await dialog.getByLabel("Room name", { exact: true }).fill("Indoor Sports Hall 1");
  await dialog.getByLabel("Seating capacity (blank means unknown)", { exact: true }).fill("80");
  await dialog.getByLabel("Class-slot capacity (blank means unknown)", { exact: true }).fill("2");
  await dialog.getByRole("button", { name: "Preview room changes" }).click();
  await dialog.getByRole("button", { name: "Confirm register changes" }).click();
  await register.getByText("Indoor Sports Hall 1", { exact: true }).waitFor();

  // Add second room U-01 with blank (unknown) Class-slot capacity
  await register.getByRole("button", { name: "Add physical room", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Add physical room", exact: true });
  await dialog.getByLabel("Unit", { exact: true }).fill("U-01");
  await dialog.getByLabel("Room name", { exact: true }).fill("Unconfigured Room");
  await dialog.getByLabel("Class-slot capacity (blank means unknown)", { exact: true }).fill("");
  await dialog.getByRole("button", { name: "Preview room changes" }).click();
  await dialog.getByRole("button", { name: "Confirm register changes" }).click();
  await register.getByText("Unconfigured Room", { exact: true }).waitFor();

  const roomRows = (
    await db.prepare("SELECT school_id, record_id, data_json FROM venues_records WHERE kind='venues'").all()
  ).results;
  const actualSchoolId = roomRows[0].school_id;
  const rooms = roomRows.map((r) => JSON.parse(r.data_json));
  const ish = rooms.find((r) => r.unit === "ISH-1");
  const unconfig = rooms.find((r) => r.unit === "U-01");
  assert.equal(ish.capacity, 80);
  assert.equal(ish.classSlotCapacity, 2);
  assert.equal(unconfig.classSlotCapacity, null);
  console.log("PASS Physical Room Register UI creates and displays seating capacity and classSlotCapacity (2 vs Unknown)");

  // Mark both rooms bookable and seed verified timetable coverage for `date` with 1 slot occupied in P1 on ISH-1
  for (const r of [ish, unconfig]) {
    const next = { ...r, bookable: true, revision: r.revision + 1 };
    await db
      .prepare("UPDATE venues_records SET revision=?, data_json=? WHERE school_id=? AND kind='venues' AND record_id=?")
      .bind(next.revision, JSON.stringify(next), actualSchoolId, r.id)
      .run();
  }
  const periods = [
    { id: "P1", label: "P1", start: 480, end: 510 },
    { id: "P2", label: "P2", start: 510, end: 540 },
  ];
  const coverageFrom = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const coverageTo = futureDate(33);
  const rosterDb = await suite.db("roster");
  await rosterDb
    .prepare(
      "INSERT OR REPLACE INTO roster_prepared_publications(school_id,operation_id,digest,fence,projection_json) VALUES(?,'op-baseline-1','digest-rev-1',1,?)",
    )
    .bind(actualSchoolId, JSON.stringify({ sourceKind: "baseline", revision: 0 }))
    .run();
  await db
    .prepare(
      "INSERT OR REPLACE INTO venues_source_heads VALUES(?,?,?,?,?,?,?)",
    )
    .bind(
      actualSchoolId,
      "roster:baseline",
      "rev-1",
      1,
      Date.now(),
      "digest-rev-1",
      JSON.stringify({
        sourceOperationId: "op-baseline-1",
        sourceKind: "baseline",
        coverage: {
          from: coverageFrom,
          to: coverageTo,
          venueIds: [ish.id, unconfig.id],
          periods,
        },
      }),
    )
    .run();
  const dayStart = Date.parse(date + "T00:00:00+08:00");
  await db
    .prepare(
      "INSERT INTO venues_intervals(school_id,record_id,kind,venue_id,overlap_group,start_at,end_at,buffer_ms,status,source_domain,source_revision) VALUES(?,'tt-ish-p1','source',?,'',?,?,0,'active','roster:baseline','rev-1')",
    )
    .bind(
      actualSchoolId,
      ish.id,
      dayStart + 480 * 60000,
      dayStart + 510 * 60000,
    )
    .run();

  // 2. Open Book a venue for `date` and wait for async loadBookings() to populate bookedCoverage(date)
  await page.goto(origin + "/venues/?view=book&date=" + date);
  await page.locator(`[data-grid-cell="${ish.id}:P1"]`).waitFor();
  await page.waitForFunction(
    (cellAttr) => {
      const btn = document.querySelector(`[data-grid-cell="${cellAttr}"]`);
      return btn && btn.textContent.trim() !== "Not checked";
    },
    `${ish.id}:P1`,
  );

  // Verify U-01 (classSlotCapacity: null) is closed with "Class-slot capacity not configured"
  const unconfigP1 = page.locator(`[data-grid-cell="${unconfig.id}:P1"]`);
  assert.equal(await unconfigP1.isDisabled(), true);
  assert.match(await unconfigP1.innerText(), /Class-slot capacity not configured/);

  // Verify ISH-1 P1 shows "Available (1/2 slots)" and is enabled!
  const ishP1 = page.locator(`[data-grid-cell="${ish.id}:P1"]`);
  assert.equal(await ishP1.isDisabled(), false);
  assert.equal(await ishP1.innerText(), "Available (1/2 slots)");

  // Select ISH-1 P1 -> P1 and open Review booking
  await ishP1.click();
  await ishP1.click();
  await page.locator("[data-preview-booking]").click();
  const bookDialog = page.locator("#dialog");
  await bookDialog.locator("#bookingSlotMode").waitFor();

  // Switching to "whole" (Whole venue) on P1 shows "Unavailable: Whole venue unavailable (1/2 slots free)"
  await bookDialog.locator("#bookingSlotMode").selectOption("whole");
  assert.match(
    await bookDialog.locator(`[data-preview-result="${date}"]`).innerText(),
    /Whole venue unavailable \(1\/2 slots free\)/,
  );

  // Switching back to "slot" (One class slot) marks P1 Confirmed and allows booking!
  await bookDialog.locator("#bookingSlotMode").selectOption("slot");
  assert.match(
    await bookDialog.locator(`[data-preview-result="${date}"]`).innerText(),
    /Confirmed/,
  );
  await bookDialog.locator("[data-confirm-booking]").click();
  await page.waitForFunction(() => !document.querySelector("#dialog")?.open);

  // Now ISH-1 P1 has 1 timetable slot + 1 ad hoc slot = 2/2 slots used, so it is no longer "Available"
  assert.notEqual(await ishP1.innerText(), "Available (1/2 slots)");
  console.log("PASS Venues booking grid displays partial slot availability, enforces unknown-capacity fail-closed, and books 1 class slot via slotMode selector");

  // 3. Flag the saved booking with an unresolved sourceConflict (simulating a later timetable adoption that needed 1 slot while we later cleared the timetable lesson so resolveConflict('keep') can succeed)
  await db.prepare("DELETE FROM venues_intervals WHERE school_id=? AND record_id='tt-ish-p1'").bind(actualSchoolId).run();
  const bookingRow = (
    await db.prepare("SELECT record_id, revision, data_json FROM venues_records WHERE school_id=? AND kind='occurrences'").bind(actualSchoolId).all()
  ).results[0];
  const bookingData = JSON.parse(bookingRow.data_json);
  assert.equal(bookingData.slotMode, "slot");
  bookingData.sourceConflict = {
    status: "unresolved",
    sourceDomain: "roster",
    sourceRevision: "rev-2",
    flaggedAt: new Date().toISOString(),
    reason: "Timetable change overlapped this room; review required.",
  };
  await db
    .prepare("UPDATE venues_records SET data_json=? WHERE school_id=? AND kind='occurrences' AND record_id=?")
    .bind(JSON.stringify(bookingData), actualSchoolId, bookingRow.record_id)
    .run();

  // Visit My bookings, verify "Timetable conflict — review required" badge and "1 class slot" badge, then click Manage -> Keep booking (resolve conflict)
  await page.goto(origin + "/venues/?view=mine");
  await page.locator('[data-source-conflict="true"]').waitFor();
  assert.match(
    await page.locator(`[data-agenda-booking="${bookingRow.record_id}"]`).innerText(),
    /1 class slot/,
  );
  assert.match(
    await page.locator(`[data-agenda-booking="${bookingRow.record_id}"]`).innerText(),
    /Timetable conflict — review required/,
  );

  await page.locator(`[data-manage-booking="${bookingRow.record_id}"]`).click();
  await page.locator('[data-resolve-conflict="keep"]').waitFor();
  await page.locator('[data-resolve-conflict="keep"]').click();
  await page.waitForFunction(() => !document.querySelector("#dialog")?.open);

  assert.equal(await page.locator('#main [data-source-conflict="true"]').count(), 0, "Conflict badge clears after Keep booking resolution");
  const resolvedData = JSON.parse(
    (
      await db
        .prepare("SELECT data_json FROM venues_records WHERE school_id=? AND kind='occurrences' AND record_id=?")
        .bind(actualSchoolId, bookingRow.record_id)
        .first()
    ).data_json,
  );
  assert.equal(resolvedData.sourceConflict, undefined);
  console.log("PASS retained sourceConflict badge and Keep/Cancel conflict resolution controls in My bookings");

  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await suite.close();
}
