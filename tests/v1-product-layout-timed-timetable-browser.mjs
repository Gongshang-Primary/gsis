/** Built Layout browser + isolated Workers/D1/R2 verifying V08, V09, V19, V20:
 * 1. Timed timetable occupancy (aSc baseline) panel in v1/web/shared/layout-editor.js
 *    loads for any signed-in user with layout.read (even without layout.edit) and works
 *    with zero Deploy planning snapshot (V20).
 * 2. Each physical venue appears once per row (V08, V19), showing concurrent multi-slot
 *    classes (4A PE + 4B PE -> "2 concurrent classes (2 slots)") and raw aSc provenance
 *    labels (ISH-1A, ISH-1B; V09).
 * 3. Date filter narrows to the selected date and flags uncovered dates clearly.
 * 4. gsis:clear-protected-state clears the timed timetable DOM and hides the panel. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { canonical, digest } from "../v1/runtime/store.mjs";

const schoolId = "synthetic-school";
const suite = await productSuite();
let browser;
const heldReplies = [];
try {
  const reader = await suite.seedAccount("layout-timed-reader", {
    capabilities: ["layout.read"],
  });
  const layoutDb = await suite.db("layout");
  const layoutBucket = await suite.mf.getR2Bucket("ARTIFACTS", "gsis-layout");

  const year = 2026;
  const date = "2026-11-23";
  const start = Date.parse(`${date}T08:00:00+08:00`);
  const end = start + 30 * 60000;
  const nextDate = "2026-11-24";
  const nextStart = Date.parse(`${nextDate}T08:00:00+08:00`);
  const edition = {
    schemaVersion: 1,
    year,
    sourceDomain: "roster",
    sourceKind: "baseline",
    sourceOperationId: "roster-base-1",
    sequence: 1,
    coverage: {
      from: "2026-11-23",
      to: "2026-11-27",
      venueIds: ["ish-1"],
      periods: [{ id: "P1", start: 480, end: 510 }],
    },
    lessons: [
      {
        venueId: "ish-1",
        sourceId: "lesson-ish-1a",
        date,
        start,
        end,
        sourceLabel: "ISH-1A",
        subject: "PE",
        className: "4A",
        groupName: "",
        slotDemand: 1,
      },
      {
        venueId: "ish-1",
        sourceId: "lesson-ish-1b",
        date,
        start,
        end,
        sourceLabel: "ISH-1B",
        subject: "PE",
        className: "4B",
        groupName: "",
        slotDemand: 1,
      },
      {
        venueId: "ish-1",
        sourceId: "lesson-next-day",
        date: nextDate,
        start: nextStart,
        end: nextStart + 30 * 60000,
        sourceLabel: "ISH-1A",
        subject: "Music",
        className: "5C",
        groupName: "",
        slotDemand: 1,
      },
    ],
  };
  const body = canonical(edition);
  const sha = await digest(body);
  const objectKey = `layout/${schoolId}/timed/${year}/1-${sha.slice(0, 16)}.json`;
  await layoutBucket.put(objectKey, body);
  await layoutDb
    .prepare(
      "INSERT INTO layout_rows(school_id,year,table_name,row_id,revision,value_json) VALUES(?,?,'timed_source','head',1,?)",
    )
    .bind(
      schoolId,
      year,
      canonical({
        objectKey,
        digest: sha,
        sourceDomain: "roster",
        sourceKind: "baseline",
        sourceOperationId: "roster-base-1",
        sourceDigest: "digest-base-1",
        sequence: 1,
        coverage: edition.coverage,
        adoptedAt: Date.now(),
      }),
    )
    .run();

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
      value: reader.token,
      domain: new URL(origin).hostname,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  const errors = [];
  function holdReply(date, year = 2026) {
    let release, ready;
    const gate = new Promise((resolve) => { release = resolve; });
    const reply = {
      date, year, release, gate, claimed: false,
      ready: new Promise((resolve) => { ready = resolve; }),
      received: ready,
    };
    heldReplies.push(reply);
    return reply;
  }
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
    const body = Buffer.from(await response.arrayBuffer());
    const held = url.pathname === "/api/layout/timetable" && heldReplies.find(
      (reply) => !reply.claimed && reply.date === url.searchParams.get("date") &&
        String(reply.year) === url.searchParams.get("year"),
    );
    if (held) {
      held.claimed = true;
      // The actual local owner has already produced this response. Only browser
      // delivery is delayed; status/body/authentication are never fabricated.
      held.received({ status: response.status, body: JSON.parse(body.toString()) });
      await held.gate;
    }
    await route.fulfill({
      status: response.status,
      headers,
      body,
    });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${origin}/layout/?year=${year}&date=${date}`);
  await page.waitForFunction(() => !document.querySelector("body > details.gsis-panel"));
  await page.locator("#tgTab").click();
  const timedPanel = page.locator("#v1LayoutTimetablePanel");
  if (!(await timedPanel.evaluate((el) => el.open))) {
    await timedPanel.locator("> summary").click();
  }
  await timedPanel.locator("[data-layout-timed-table]").waitFor();

  // Verify layout.read user sees Timed timetable panel while Layout-owned edit panel stays hidden
  assert.equal(await timedPanel.isVisible(), true);
  assert.equal(await page.locator("#tgView details.gsis-panel").first().isHidden(), true);

  // Verify provenance shows zero Deploy planning copy independence (V20)
  const provenance = await timedPanel.locator("[data-timed-provenance]").innerText();
  assert.match(provenance, /roster \(baseline\)/);
  assert.match(provenance, /No Deploy planning copy loaded \(independent\)/);

  // Verify physical venue ish-1 appears ONCE (V08, V19) with raw ISH-1A, ISH-1B provenance (V09)
  assert.equal(await timedPanel.locator('[data-timed-venue-row="ish-1"]').count(), 1);
  assert.equal(
    await timedPanel.locator('[data-timed-raw-labels="ish-1"]').innerText(),
    "ISH-1A, ISH-1B",
  );

  // Verify concurrent multi-slot cell shows both 4A PE [ISH-1A] and 4B PE [ISH-1B]
  const cell = timedPanel.locator(`[data-timed-cell="ish-1|${date}|${start}|${end}"]`);
  const cellText = await cell.innerText();
  assert.match(cellText, /2 concurrent classes \(2 slots\)/);
  assert.match(cellText, /4A PE \[ISH-1A\]/);
  assert.match(cellText, /4B PE \[ISH-1B\]/);
  console.log("PASS Layout timed timetable UI renders single physical venue row with concurrent classes and raw ISH-1A/ISH-1B provenance independently of Deploy");

  // Observe completion after the real transport and caller's promise reactions.
  // A task boundary avoids a sleep-based assertion while preserving every
  // request, returned value and error from GSISV1.request.
  await page.evaluate(() => {
    const request = GSISV1.request;
    window.layoutTimedCompletions = [];
    GSISV1.request = function (...args) {
      const pending = request.apply(this, args);
      if (args[0] !== "layout" || !args[1].startsWith("/timetable?")) return pending;
      const complete = () => setTimeout(() => window.layoutTimedCompletions.push(args[1]), 0);
      return pending.then(
        (value) => { complete(); return value; },
        (error) => { complete(); throw error; },
      );
    };
  });
  async function submitHeld(reply) {
    await timedPanel.locator("[data-timed-year]").fill(String(reply.year));
    await timedPanel.locator("[data-timed-date]").fill(reply.date);
    await timedPanel.locator("[data-timed-load]").click();
    return reply.ready;
  }
  async function releaseReply(reply) {
    const path = `/timetable?year=${reply.year}&date=${reply.date}`;
    const before = await page.evaluate((path) => window.layoutTimedCompletions.filter((x) => x === path).length, path);
    reply.release();
    await page.waitForFunction(({ path, before }) => window.layoutTimedCompletions.filter((x) => x === path).length > before, { path, before });
  }
  async function assertNextDate() {
    assert.equal(await timedPanel.locator("[data-timed-date]").inputValue(), nextDate);
    assert.equal(await timedPanel.locator('[data-timed-lesson="lesson-next-day"]').count(), 1,
      "latest selected date keeps its own lesson after older response completes");
    assert.equal(await timedPanel.locator('[data-timed-lesson="lesson-ish-1a"]').count(), 0);
    assert.match(await timedPanel.locator("[data-layout-timed-table]").innerText(), /5C Music/);
  }

  const olderSuccess = holdReply(date), newerSuccess = holdReply(nextDate);
  assert.equal((await submitHeld(olderSuccess)).status, 200);
  assert.equal((await submitHeld(newerSuccess)).status, 200);
  await releaseReply(newerSuccess);
  await assertNextDate();
  await releaseReply(olderSuccess);
  await assertNextDate();
  console.log("PASS reversed real owner successes retain the latest submitted date");

  // An out-of-range year produces a genuine owner validation failure, held
  // until a subsequent valid date has already rendered successfully.
  const olderFailure = holdReply(date, 1999), afterFailure = holdReply(nextDate);
  assert.equal((await submitHeld(olderFailure)).status, 400);
  assert.equal((await submitHeld(afterFailure)).status, 200);
  await releaseReply(afterFailure);
  await assertNextDate();
  const latestStatus = await timedPanel.locator("[data-timed-status]").innerText();
  await releaseReply(olderFailure);
  await assertNextDate();
  assert.equal(await timedPanel.locator("[data-timed-status]").innerText(), latestStatus,
    "an older failure cannot replace the current successful status");
  assert.equal(await timedPanel.locator("[data-timed-status]").evaluate((el) => el.classList.contains("gsis-error")), false);
  console.log("PASS stale real owner failure cannot replace a newer successful result or status");

  const latestFailure = holdReply(date, 1999);
  const failedResponse = await submitHeld(latestFailure);
  assert.equal(failedResponse.status, 400);
  await releaseReply(latestFailure);
  assert.equal(await timedPanel.locator("[data-timed-status]").evaluate((el) => el.classList.contains("gsis-error")), true,
    "the latest failure remains visible rather than being swallowed");
  assert.equal(await timedPanel.locator("[data-timed-status]").innerText(), failedResponse.body.error.message);
  await timedPanel.locator("[data-timed-year]").fill(String(year));

  // Verify uncovered date filter displays explicit uncovered message
  await timedPanel.locator("[data-timed-date]").fill("2026-12-01");
  await timedPanel.locator("[data-timed-load]").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#v1LayoutTimetablePanel [data-timed-status]")
      ?.textContent.includes("outside adopted aSc coverage"),
  );
  assert.equal(await timedPanel.locator("[data-layout-timed-table]").count(), 0);
  console.log("PASS Layout timed timetable UI filters by date and flags uncovered dates");

  const clearSuccess = holdReply(date), clearFailure = holdReply(nextDate, 1999);
  assert.equal((await submitHeld(clearSuccess)).status, 200);
  assert.equal((await submitHeld(clearFailure)).status, 400);
  // Verify gsis:clear-protected-state clears DOM and hides panel
  await page.evaluate(() => {
    window.retainedTimedPanel = document.querySelector("#v1LayoutTimetablePanel");
    dispatchEvent(new Event("gsis:clear-protected-state"));
  });
  assert.equal(await timedPanel.isHidden(), true);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector("#v1LayoutTimetablePanel [data-timed-rows]")
          ?.textContent || "",
    ),
    "",
  );
  const clearedText = (selector) => page.evaluate(
    (selector) => window.retainedTimedPanel.querySelector(selector).textContent,
    selector,
  );
  assert.equal(await clearedText("[data-timed-status]"), "");
  await releaseReply(clearSuccess);
  await releaseReply(clearFailure);
  assert.equal(await timedPanel.isHidden(), true);
  for (const selector of ["[data-timed-rows]", "[data-timed-meta]", "[data-timed-disagreements]", "[data-timed-status]"]) {
    assert.equal(await clearedText(selector), "",
      "late success or failure cannot restore cleared protected state: " + selector);
  }
  assert.deepEqual(errors, []);
  console.log("PASS Layout timed timetable UI clears protected state on session change");

  await context.close();
} finally {
  for (const reply of heldReplies) reply.release();
  await browser?.close();
  await suite.close();
}
