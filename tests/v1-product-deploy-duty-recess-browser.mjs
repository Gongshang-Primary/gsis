/** Actual built Deploy and isolated Workers/D1: weekday Recess columns are a
 * display projection; every original duty ID/day remains separately editable.
 * Synthetic local evidence only; hosted/runtime UAT and physical PDF printing
 * are not performed. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

const started = Date.now();
const schoolId = "synthetic-school";
const days = [0, 1, 2, 3, 4];
const suite = await productSuite({
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-duty-recess.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});
let browser;
try {
  const editor = await suite.seedAccount("duty-recess-editor");
  const created = await suite.call(editor, "contacts", "/save-data", {
    operationId: "duty-recess-contacts",
    changes: [],
    additions: [
      {
        id: "temp-teacher",
        values: {
          "Basic Name": "Synthetic Duty Teacher",
          "Statutory Name": "Synthetic Duty Teacher",
          Role: "Teacher",
          Active: "Y",
        },
      },
      {
        id: "temp-reader",
        values: {
          "Basic Name": "Synthetic Duty Reader",
          "Statutory Name": "Synthetic Duty Reader",
          Role: "Teacher",
          Active: "Y",
        },
      },
    ],
  });
  const teacherId = created.mapping["temp-teacher"];
  const readerStaffId = created.mapping["temp-reader"];
  for (const [field, value] of [
    ["smc", true],
    ["eo", false],
    ["schoolLeader", false],
  ]) {
    await suite.call(
      editor,
      "contacts",
      "/staff/" + readerStaffId + "/accept",
      {
        operationId: "duty-reader-" + field,
        field,
        value,
        revision: 0,
        ownerReviewReference: "Synthetic owner review",
      },
    );
  }
  const reader = await suite.seedAccount("duty-recess-reader", {
    staffId: readerStaffId,
    capabilities: [],
  });
  const { versionId } = await suite.call(editor, "deploy", "/versions/create", {
    operationId: "duty-recess-version",
    name: "Synthetic duty columns",
    year: 2026,
  });
  const db = await suite.db("deploy");
  const duty = (id, name, scheduledDays, category = "Recess") => ({
    id,
    name,
    category,
    start: "09:00",
    end: "09:30",
    days: scheduledDays,
    adhoc: scheduledDays.length === 1,
    description: "Synthetic duty description",
    teachers: {},
  });
  const daily = days.flatMap((day) =>
    Array.from({ length: 6 }, (_, index) =>
      duty("daily-" + day + "-" + (index + 1), "P" + (index + 1), [day]),
    ),
  );
  daily[0].teachers[0] = teacherId;
  const extras = [
    duty("before", "Gate", days, "Before School"),
    duty("dismiss", "Dismissal", days, "Dismissal"),
    duty("after", "Lunch", days, "After School"),
  ];
  async function seedDuties(duties) {
    const loaded = await loadVersion(db, schoolId, versionId);
    const doc = structuredClone(loaded.doc);
    doc.duties = duties;
    const delta = changesFor(schoolId, versionId, loaded.rows, doc);
    await db.batch(delta.writes.map((w) => statement(db, w.sql, w.args)));
  }
  const savedDuties = async () =>
    (await loadVersion(db, schoolId, versionId)).doc.duties;
  await seedDuties([...daily, ...extras]);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.GSIS_BROWSER_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const errors = [];
  const mutationBodies = [];
  async function openPage(user) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.addCookies([
      {
        name: "__Host-gsis_session",
        value: user.token,
        domain: new URL(origin).hostname,
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await context.addInitScript(() => {
      window.print = () => {
        window.__printed = true;
      };
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/api/deploy/change")
        mutationBodies.push(request.postDataJSON());
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
    page.setDefaultTimeout(5000);
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.error("Browser page error:", error.message);
    });
    await page.goto(origin + "/deploy/");
    await page.waitForFunction(
      (id) => document.getElementById("version")?.value === id,
      versionId,
    );
    await page.getByRole("button", { name: "Duty", exact: true }).click();
    try {
      await page.waitForSelector(".duty-entry-roster");
    } catch (error) {
      console.error("Duty render diagnostics:", {
        errors,
        content: (await page.locator("#content").textContent()).slice(0, 1000),
      });
      throw error;
    }
    return page;
  }
  const page = await openPage(editor);
  const recessColumns = (page) =>
    page
      .locator(".duty-entry-roster thead tr")
      .first()
      .locator("th")
      .filter({ hasText: /^RECESS$/ });
  const occurrenceKeys = (duties) =>
    duties.flatMap((d) => d.days.map((day) => d.id + ":" + day)).sort();
  const screenKeys = (page) =>
    page
      .locator(".duty-entry-roster [data-duty-cell]")
      .evaluateAll((cells) =>
        cells.map((c) => c.dataset.dutyCell + ":" + c.dataset.day).sort(),
      );
  async function checkPeriods(page) {
    const periods = await page
      .locator(".duty-entry-roster thead tr")
      .last()
      .locator("th")
      .allTextContents();
    assert.deepEqual(
      periods.filter((t) => /^pd [3-8]$/.test(t)),
      ["pd 3", "pd 4", "pd 5", "pd 6", "pd 7", "pd 8"],
    );
  }
  async function refresh() {
    await page.reload();
    await page.waitForFunction(
      (id) => document.getElementById("version")?.value === id,
      versionId,
    );
    await page.getByRole("button", { name: "Duty", exact: true }).click();
    await page.waitForSelector(".duty-entry-roster");
  }
  const counts = (page) =>
    page.evaluate(
      (id) => ({
        workload: GSISPlanning.count(v(), id),
        cards: dutyCardData(v()).byTeacher.get(id) || 0,
        occurrences: v().duties.reduce((n, d) => n + d.days.length, 0),
        queued: queuedEdits().length,
      }),
      teacherId,
    );
  async function checkPrint(page, expectedColumns, expectedDuties) {
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Export PDF", exact: true }).click();
    const popup = await popupPromise;
    try {
      await popup.waitForSelector("main.page table");
      assert.equal(
        await popup
          .locator("thead tr")
          .first()
          .locator("th")
          .filter({ hasText: /^RECESS$/ })
          .count(),
        expectedColumns,
      );
      assert.deepEqual(
        await popup
          .locator("[data-duty-cell]")
          .evaluateAll((cells) =>
            cells.map((c) => c.dataset.dutyCell + ":" + c.dataset.day).sort(),
          ),
        occurrenceKeys(expectedDuties),
      );
      assert.deepEqual(
        await popup.locator("thead").allTextContents(),
        await page.locator(".duty-entry-roster thead").allTextContents(),
      );
      assert.equal(
        await popup.locator("select").count(),
        0,
        "PDF has display cells, not edit controls",
      );
      await popup.waitForFunction(() => window.__printed === true);
      const pdf = await popup.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
      });
      assert.equal(
        pdf.subarray(0, 5).toString(),
        "%PDF-",
        "Chromium produces a real PDF from the Export PDF popup",
      );
      return await popup.locator("main").textContent();
    } finally {
      await popup.close();
    }
  }

  assert.equal(
    await recessColumns(page).count(),
    6,
    "30 weekday-specific P1–P6 records must produce six aligned Recess columns, not thirty",
  );
  await checkPeriods(page);
  assert.deepEqual(
    await screenKeys(page),
    occurrenceKeys([...daily, ...extras]),
  );
  assert.equal(
    await page
      .locator('.duty-entry-roster select[data-duty-teacher^="daily-"]')
      .count(),
    30,
  );
  assert.deepEqual(await savedDuties(), [...daily, ...extras]);
  assert.deepEqual(await counts(page), {
    workload: 1,
    cards: 1,
    occurrences: 45,
    queued: 0,
  });
  console.log(
    "PASS 30 weekday records share six columns, pd3–pd8, retaining all original IDs/days and workload/card totals",
  );

  await checkPrint(page, 6, [...daily, ...extras]);
  assert.deepEqual(await savedDuties(), [...daily, ...extras]);
  assert.deepEqual(await counts(page), {
    workload: 1,
    cards: 1,
    occurrences: 45,
    queued: 0,
  });
  assert.equal(
    mutationBodies.length,
    0,
    "rendering and PDF export do not submit mutations",
  );
  console.log(
    "PASS actual Export PDF popup has the same headers and original occurrences without writes",
  );

  const edited = structuredClone([...daily, ...extras]);
  edited.find((d) => d.id === "daily-1-3").teachers[1] = teacherId;
  const chosenCell = page.locator('[data-duty-cell="daily-1-3"][data-day="1"]');
  const optionLabel = await chosenCell
    .locator('select option[value="' + teacherId + '"]')
    .textContent();
  await chosenCell.locator(".search-select summary").click();
  await chosenCell
    .getByRole("option", { name: optionLabel, exact: true })
    .click();
  const save = page
    .locator("#saveQueue")
    .getByRole("button", { name: "Save to online", exact: true });
  assert.equal(await save.isEnabled(), true);
  await save.click();
  await page.waitForFunction(
    () => !queuedEdits().length && !queueFlight && !refreshing,
  );
  assert.deepEqual(
    await savedDuties(),
    edited,
    "save changes only the selected original duty/day",
  );
  assert.equal(mutationBodies.length, 1);
  await refresh();
  assert.equal(
    await page
      .locator('select[data-duty-teacher="daily-1-3"][data-day="1"]')
      .inputValue(),
    teacherId,
  );
  assert.equal(
    await page
      .locator('select[data-duty-teacher="daily-2-3"][data-day="2"]')
      .inputValue(),
    "",
  );
  assert.deepEqual(await counts(page), {
    workload: 2,
    cards: 2,
    occurrences: 45,
    queued: 0,
  });
  console.log(
    "PASS real selector/save/reload changes only the intended original ID/day and counts each assignment once",
  );

  const weekly = Array.from({ length: 6 }, (_, i) =>
    duty("weekly-" + (i + 1), "P" + (i + 1), days),
  );
  weekly[0].teachers[0] = teacherId;
  await seedDuties([...weekly, ...extras]);
  await refresh();
  assert.equal(await recessColumns(page).count(), 6);
  await checkPeriods(page);
  assert.deepEqual(
    await screenKeys(page),
    occurrenceKeys([...weekly, ...extras]),
  );
  assert.deepEqual(await savedDuties(), [...weekly, ...extras]);
  console.log(
    "PASS six weekly records retain the same six-column shape and all 30 editable Recess occurrences",
  );

  const fallback = await page.evaluate(async () => {
    const { projectDutyPrintHTML } =
      await import("/v1/shared/deploy-duty-ui.js");
    // Start with the actual six-column native print document. Change only its
    // synthetic occurrence schedule to exercise disjoint/overlapping day sets.
    const original = new DOMParser().parseFromString(
      dutyPrintHTML(),
      "text/html",
    );
    const proof = structuredClone(v().duties);
    const recess = proof.filter((d) => d.category === "Recess");
    for (let i = 0; i < 3; i++) recess[i].name = "Overlap";
    recess[0].days = [0, 1];
    recess[1].days = [1, 2];
    recess[2].days = [3, 4];
    recess.forEach((d, index) => {
      original.querySelectorAll("thead tr")[1].cells[index + 2].textContent =
        d.name;
      for (const cell of original.querySelectorAll(
        '[data-duty-cell="' + d.id + '"]',
      )) {
        if (!d.days.includes(Number(cell.dataset.day))) {
          cell.removeAttribute("data-duty-cell");
          cell.removeAttribute("data-day");
          cell.className = "not-scheduled";
          cell.textContent = "";
        }
      }
    });
    const html = original.documentElement.outerHTML;
    const projected = new DOMParser().parseFromString(
      projectDutyPrintHTML(html, proof),
      "text/html",
    );
    const malformed = original.cloneNode(true);
    malformed.querySelector("thead tr").remove();
    const malformedHTML = malformed.documentElement.outerHTML;
    const wrongBinding = original.cloneNode(true);
    wrongBinding.querySelector(
      '[data-duty-cell="weekly-1"][data-day="1"]',
    ).dataset.dutyCell = "unexpected-id";
    const wrongHTML = wrongBinding.documentElement.outerHTML;
    return {
      columns: [
        ...projected.querySelectorAll("thead tr:first-child th"),
      ].filter((c) => c.textContent === "RECESS").length,
      keys: [...projected.querySelectorAll("[data-duty-cell]")]
        .map((c) => c.dataset.dutyCell + ":" + c.dataset.day)
        .sort(),
      expected: proof
        .flatMap((d) => d.days.map((day) => d.id + ":" + day))
        .sort(),
      tuesday: [...projected.querySelectorAll('[data-day="1"]')].filter((c) =>
        ["weekly-1", "weekly-2"].includes(c.dataset.dutyCell),
      ).length,
      malformedUnchanged:
        projectDutyPrintHTML(malformedHTML, proof) === malformedHTML,
      wrongBindingUnchanged:
        projectDutyPrintHTML(wrongHTML, proof) === wrongHTML,
    };
  });
  assert.equal(fallback.columns, 5);
  assert.deepEqual(fallback.keys, fallback.expected);
  assert.equal(fallback.tuesday, 2);
  assert.equal(fallback.malformedUnchanged, true);
  assert.equal(fallback.wrongBindingUnchanged, true);
  console.log(
    "PASS partial weekday overlap preserves both Tuesday occurrences; malformed structure/binding falls back byte-for-byte",
  );

  const exception = structuredClone(daily).filter((d) => d.id !== "daily-4-6");
  Object.assign(
    exception.find((d) => d.id === "daily-2-2"),
    { start: "09:10", end: "09:40" },
  );
  const escapedName = '<img src=x onerror="window.unexpectedDutyMarkup=true">';
  for (const d of exception.filter((d) => d.name === "P4"))
    d.name = escapedName;
  exception.push(duty("duplicate-monday-p1", "P1", [0]));
  const exceptionalDuties = [...exception, ...extras];
  await seedDuties(exceptionalDuties);
  await refresh();
  assert.equal(
    await recessColumns(page).count(),
    7,
    "same-day same-name duty has a separate lane",
  );
  assert.deepEqual(await screenKeys(page), occurrenceKeys(exceptionalDuties));
  assert.equal(
    await page
      .locator(".duty-entry-roster thead")
      .getByText("Varies by day", { exact: true })
      .count(),
    1,
  );
  const timing = page.locator(
    '[data-duty-cell="daily-2-2"][data-day="2"] .duty-occurrence-time',
  );
  assert.match(await timing.textContent(), /09:?10.*09:?40/);
  const cellPositions = await page.evaluate(() => ({
    first: document.querySelector('[data-duty-cell="daily-0-1"][data-day="0"]')
      .cellIndex,
    second: document.querySelector(
      '[data-duty-cell="duplicate-monday-p1"][data-day="0"]',
    ).cellIndex,
    absent: (() => {
      const index = document.querySelector(
        '[data-duty-cell="daily-0-6"][data-day="0"]',
      ).cellIndex;
      const cell = document.querySelectorAll(".duty-entry-roster .day-start")[4]
        .cells[index];
      return {
        gray: cell.classList.contains("not-scheduled"),
        controls: cell.querySelectorAll("select").length,
        id: cell.dataset.dutyCell || null,
      };
    })(),
  }));
  assert.notEqual(cellPositions.first, cellPositions.second);
  assert.deepEqual(cellPositions.absent, { gray: true, controls: 0, id: null });
  for (const id of ["before", "dismiss", "after"])
    assert.equal(
      await page
        .locator('.duty-entry-roster select[data-duty-teacher="' + id + '"]')
        .count(),
      5,
    );
  assert.equal(await page.locator(".duty-entry-roster img").count(), 0);
  assert.equal(
    await page.evaluate(() => window.unexpectedDutyMarkup),
    undefined,
  );
  assert.ok(
    (await page.locator(".duty-entry-roster thead").textContent()).includes(
      escapedName,
    ),
  );
  const printText = await checkPrint(page, 7, exceptionalDuties);
  assert.ok(printText.includes(escapedName));
  assert.match(printText, /09:?10.*09:?40/s);
  assert.deepEqual(await savedDuties(), exceptionalDuties);
  assert.equal(mutationBodies.length, 1);
  console.log(
    "PASS timing exceptions, same-day duplicates, truly unscheduled days, other categories and escaped labels survive screen/PDF projection",
  );

  const readerPage = await openPage(reader);
  assert.equal(await recessColumns(readerPage).count(), 7);
  assert.deepEqual(
    await screenKeys(readerPage),
    occurrenceKeys(exceptionalDuties),
  );
  assert.equal(
    await readerPage.locator(".duty-entry-roster select:enabled").count(),
    0,
  );
  assert.equal(await readerPage.locator("#saveQueue").isHidden(), true);
  await checkPrint(readerPage, 7, exceptionalDuties);
  assert.deepEqual(await savedDuties(), exceptionalDuties);
  assert.equal(mutationBodies.length, 1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS read-only viewer keeps all occurrences and PDF access, with editing disabled and no effects",
  );
  console.log(
    `7/7 Duty Recess browser groups passed in ${Date.now() - started}ms`,
  );
} finally {
  await browser?.close();
  await suite.close();
}
