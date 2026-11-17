import assert from "node:assert/strict";
import { fixture, futureDate } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";

const f = await fixture();
const errors = [];
try {
  const page = await f.pageFor();
  page.on("pageerror", error => errors.push(error.message));

  // Admin's native table has neither the core nor the legacy table toolbar.
  await page.goto(origin + "/admin/#accounts");
  const accountRows = page.locator("#accountRows tr");
  await accountRows.filter({ hasText: "roster-unblock-admin@example.invalid" }).waitFor();
  const accounts = page.locator("#accounts table");
  const accountSize = () => accounts.evaluate(table => ({
    width: table.getBoundingClientRect().width,
    frame: table.parentElement.getBoundingClientRect().width,
    padding: getComputedStyle(table.tHead.rows[0].cells[0]).paddingTop,
  }));
  await page.waitForFunction(() => {
    const table = document.querySelector("#accounts table");
    return table.getBoundingClientRect().width < table.parentElement.getBoundingClientRect().width;
  });
  assert.equal((await accountSize()).padding, "3px");
  await f.seedAccount("late-compact-fixture");
  await page.getByRole("button", { name: "Refresh accounts" }).click();
  await accountRows.filter({ hasText: "late-compact-fixture@example.invalid" }).waitFor();
  const reloaded = await accountSize();
  assert(reloaded.width < reloaded.frame, "reloaded accounts fit their content");
  assert.equal(reloaded.padding, "3px");
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await accounts.evaluate(table =>
    table.parentElement.getBoundingClientRect().right <= innerWidth &&
    ["auto", "scroll"].includes(getComputedStyle(table.parentElement).overflowX)),
  "a narrow screen keeps horizontal scrolling with the table");
  await page.setViewportSize({ width: 1440, height: 1000 });

  const year = Number(futureDate().slice(0, 4));
  await f.call(f.admin, "calendar", "/action", {
    action: "saveYear", operationId: "compact-fixture-calendar-year",
    payload: { Year: year, Status: "ACTIVE", ReleasedToTeachers: "No", expectedMetadataRevision: "missing" },
  });
  await page.goto(origin + "/calendar/");
  await page.locator("#nav [data-page=weekly]").click();
  await page.locator(".weekly-grid tbody tr").first().waitFor();
  const weekly = await page.locator(".weekly-grid").evaluate(table => ({
    layout: getComputedStyle(table).tableLayout,
    dayWidths: [...table.tHead.rows[0].cells].slice(-7).map(cell => cell.getBoundingClientRect().width),
    sortControls: table.querySelectorAll(".gsis-core-sort").length,
  }));
  assert.equal(weekly.layout, "fixed");
  assert.equal(weekly.dayWidths.length, 7);
  assert(Math.max(...weekly.dayWidths) - Math.min(...weekly.dayWidths) <= 1,
    "compact spacing preserves the equal day columns");
  assert.equal(weekly.sortControls, 0);

  await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "compact-fixture-deploy-version", name: "Synthetic compact planning", year,
  });
  await page.goto(origin + "/deploy/");
  await page.getByRole("button", { name: "Program Settings", exact: true }).click();
  await page.getByRole("button", { name: "Subject Load", exact: true }).click();
  const filter = page.locator(".load-table .gsis-core-filter input").first();
  await filter.waitFor();
  await page.waitForFunction(() => document.querySelector(".load-table .gsis-core-filter input")
    ?.style.getPropertyValue("--compact-control-width"));
  const changed = page.locator('.load-table input[data-level="1"][data-key="Assembly"]');
  await changed.fill("7");
  const draftBefore = await page.evaluate(() => structuredClone(queuedEdits()));
  assert(draftBefore.length, "fixture added an unsaved draft");
  const writesBefore = f.requests.filter(request => request.url.endsWith("/api/deploy/change")).length;

  // The owner can retain a table and add a control after rendering, for example
  // when the common filter row is mounted. An active editor keeps its geometry.
  const lateFitted = () => document.querySelector("#late-compact-control")
    .style.getPropertyValue("--compact-control-width");
  await page.evaluate(() => {
    const late = document.createElement("input");
    late.id = "late-compact-control";
    late.placeholder = "A longer synthetic filter";
    document.querySelector(".load-table .gsis-core-filter th:last-child").append(late);
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(lateFitted), "", "the in-progress edit prevents a refit");
  await changed.blur();
  await page.waitForFunction(lateFitted);
  assert.equal(await changed.inputValue(), "7");
  assert.deepEqual(await page.evaluate(() => structuredClone(queuedEdits())), draftBefore);
  assert.equal(f.requests.filter(request => request.url.endsWith("/api/deploy/change")).length, writesBefore);
  assert.deepEqual(errors, []);
  console.log("PASS initial and refreshed Admin compaction, narrow scroll containment, Calendar day geometry, and legacy Deploy late-control fitting with its draft intact.");
} finally {
  await f.close();
}
