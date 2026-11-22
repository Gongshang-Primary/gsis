// v1 Calendar year archive previewDigest, YearStructure/DayNotes counts, and built-browser confirm flow (Repair 3).
// Real built Workers/D1/R2 + Chromium browser.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";

const suite = await productSuite({
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-cal-archive.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});

let browser;
try {
  const admin = await suite.seedAccount("cal-archive-admin");
  const calDb = await suite.db("calendar");
  const school = "synthetic-school";
  const now = Date.now();

  // 1. Seed two synthetic years (2026 ACTIVE, 2027 PLANNING) with events, yearStructure, and dayNotes.
  await calDb
    .prepare(
      "INSERT OR REPLACE INTO calendar_years(school_id,year,revision,released,status,data_json) VALUES(?,2026,1,1,'ACTIVE',?)",
    )
    .bind(school, JSON.stringify({ Year: 2026, Status: "ACTIVE" }))
    .run();
  await calDb
    .prepare(
      "INSERT OR REPLACE INTO calendar_years(school_id,year,revision,released,status,data_json) VALUES(?,2027,1,0,'PLANNING',?)",
    )
    .bind(school, JSON.stringify({ Year: 2027, Status: "PLANNING" }))
    .run();

  await calDb
    .prepare(
      "INSERT INTO calendar_events(school_id,event_id,year,revision,status,start_date,end_date,deleted_at,data_json) VALUES(?,'ev-2026-1',2026,1,'ACTIVE','2026-02-02','2026-02-02',NULL,?)",
    )
    .bind(
      school,
      JSON.stringify({
        EventID: "ev-2026-1",
        Year: 2026,
        Title: "2026 Assembly",
        StartDate: "2026-02-02",
        EndDate: "2026-02-02",
        AllDay: "Yes",
        Status: "ACTIVE",
        _revision: 1,
      }),
    )
    .run();
  await calDb
    .prepare(
      "INSERT INTO calendar_events(school_id,event_id,year,revision,status,start_date,end_date,deleted_at,data_json) VALUES(?,'ev-2027-1',2027,1,'ACTIVE','2027-01-04','2027-01-04',NULL,?)",
    )
    .bind(
      school,
      JSON.stringify({
        EventID: "ev-2027-1",
        Year: 2027,
        Title: "2027 Orientation",
        StartDate: "2027-01-04",
        EndDate: "2027-01-04",
        AllDay: "Yes",
        Status: "ACTIVE",
        _revision: 1,
      }),
    )
    .run();

  for (const [id, label] of [
    ["ys-2026-1", "T1W1"],
    ["ys-2026-2", "T1W2"],
  ]) {
    await calDb
      .prepare(
        "INSERT INTO calendar_metadata(school_id,kind,record_id,year,revision,data_json) VALUES(?,'yearStructure',?,2026,1,?)",
      )
      .bind(
        school,
        id,
        JSON.stringify({
          ID: id,
          Year: 2026,
          RecordType: "TERM_WEEK",
          Term: 1,
          Week: label === "T1W1" ? 1 : 2,
          Label: label,
          StartDate: label === "T1W1" ? "2026-01-05" : "2026-01-12",
          EndDate: label === "T1W1" ? "2026-01-09" : "2026-01-16",
        }),
      )
      .run();
  }
  await calDb
    .prepare(
      "INSERT INTO calendar_metadata(school_id,kind,record_id,year,revision,data_json) VALUES(?,'dayNotes','dn-2026-1',2026,1,?)",
    )
    .bind(
      school,
      JSON.stringify({
        ID: "dn-2026-1",
        Year: 2026,
        Date: "2026-02-02",
        Note: "Synthetic 2026 day note",
      }),
    )
    .run();

  // 2. Preview returns matching digest & previewDigest and accurate YearStructure & DayNotes counts.
  const preview = await suite.call(admin, "calendar", "/archiveYearsPreview", {
    selections: [{ year: 2026, status: "ACTIVE" }],
  });
  assert(preview.digest && preview.previewDigest === preview.digest);
  assert.equal(preview.counts.Events, 1);
  assert.equal(preview.counts.YearStructure, 2);
  assert.equal(preview.counts.DayNotes, 1);
  assert.equal(preview.confirmationPhrase, "ARCHIVE 2026");

  // 3. Mismatched previewDigest is rejected (409 PREVIEW_CHANGED) and non-mutating.
  const mismatched = await suite.request(admin, "calendar", "/archiveYearsCommit", {
    method: "POST",
    body: {
      operationId: "archive-mismatch-1",
      selections: [{ year: 2026, status: "ACTIVE" }],
      previewDigest: "0".repeat(64),
      confirm: true,
      confirmationPhrase: "ARCHIVE 2026",
    },
  });
  assert.equal(mismatched.status, 409, JSON.stringify(mismatched.body));
  assert.equal(mismatched.body.error?.code, "PREVIEW_CHANGED");
  const stillActive = await calDb
    .prepare("SELECT status FROM calendar_years WHERE school_id=? AND year=2026")
    .bind(school)
    .first();
  assert.equal(stillActive.status, "ACTIVE");

  // 4. Built Chromium browser: preview -> verify counts -> confirm archive -> 2026 ARCHIVED, 2027 untouched.
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath:
      process.env.GSIS_BROWSER_EXECUTABLE ||
      process.env.ROSTER_TEST_CHROMIUM ||
      undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1360, height: 950 },
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
  let commitOpId = null;
  let commitBodySent = null;
  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== origin) return route.abort();
    const rawBody = ["GET", "HEAD"].includes(req.method())
      ? undefined
      : req.postDataBuffer();
    if (url.pathname.startsWith("/api/calendar/") && rawBody) {
      try {
        const parsed = JSON.parse(rawBody.toString("utf8"));
        if (
          url.pathname.endsWith("/archiveYearsCommit") ||
          parsed.action === "archiveYearsCommit" ||
          parsed.operation === "archiveYearsCommit"
        ) {
          commitOpId = parsed.operationId || parsed.payload?.operationId || null;
          commitBodySent = parsed.payload || parsed;
        }
      } catch {}
    }
    const res = await suite.mf.dispatchFetch(req.url(), {
      method: req.method(),
      headers: await req.allHeaders(),
      body: rawBody,
    });
    const headers = Object.fromEntries(res.headers);
    delete headers["transfer-encoding"];
    const body = Buffer.from(await res.arrayBuffer());
    await route.fulfill({ status: res.status, headers, body });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(origin + "/calendar/");
  await page.locator('#nav [data-page="urls"]').waitFor({ state: "visible" });
  await page.locator('#nav [data-page="urls"]').click();
  await page.locator("#urlsHost details.calendar-setup-group > summary").last().click();
  await page
    .locator("details.danger-zone-card summary")
    .filter({ hasText: "Danger zone · Archive Years" })
    .click();
  await page.locator('#archiveSelectionHost input[data-archive-year="2026"]').check();
  await page.locator("#archivePreviewBtn").click();
  await page
    .locator("#archivePreviewHost")
    .getByText("Events 1 · YearStructure 2 · DayNotes 1", { exact: false })
    .waitFor();

  await page.locator("#archiveAcknowledge").check();
  await page.locator("#archivePhraseInput").fill("ARCHIVE 2026");
  await page.locator("#archiveCommitBtn").click();
  await page.waitForFunction(() => Boolean(document.querySelector('a[href*="/api/calendar/archive-download"]')));

  assert(commitOpId, "browser submitted stable operationId on archiveYearsCommit");
  assert.equal(commitBodySent.previewDigest, preview.previewDigest);

  // Verify 2026 is ARCHIVED and 2027 remains PLANNING untouched.
  const y2026 = await calDb
    .prepare("SELECT status FROM calendar_years WHERE school_id=? AND year=2026")
    .bind(school)
    .first();
  const y2027 = await calDb
    .prepare("SELECT status FROM calendar_years WHERE school_id=? AND year=2027")
    .bind(school)
    .first();
  assert.equal(y2026.status, "ARCHIVED");
  assert.equal(y2027.status, "PLANNING");

  // 5. Idempotent replay with the same operationId recovers the original committed archive receipt.
  const replay = await suite.call(admin, "calendar", "/archiveYearsCommit", commitBodySent);
  assert.equal(replay.fileName, preview.fileName);

  assert.deepEqual(errors, []);
  console.log(
    "PASS Calendar year archive: previewDigest binding, accurate Events/YearStructure/DayNotes counts, stale-preview 409 rejection, Chromium browser confirm, and idempotent replay.",
  );
} finally {
  await browser?.close();
  await suite.close();
}
