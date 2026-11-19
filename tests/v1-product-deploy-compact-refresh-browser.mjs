import assert from "node:assert/strict";
import { fixture, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { loadVersion } from "../v1/services/deploy/service.mjs";

const f = await fixture();
try {
  const versions = [];
  for (const tree of ["Birch", "Amber"]) {
    versions.push(await f.call(f.admin, "deploy", "/versions/create", {
      operationId: "compact-refresh-" + tree, name: "Synthetic " + tree, year: 2026,
    }));
  }
  const db = await f.db("deploy");
  const saved = async () => Promise.all(versions.map(async ({ versionId }) =>
    (await loadVersion(db, schoolId, versionId)).doc));
  const before = await saved();
  const page = await f.pageFor();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + "/deploy/");
  const settle = () => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const open = label => page.locator("#nav").getByRole("button", { name: label, exact: true }).click();
  const refresh = () => page.locator("#refresh").click();
  const tableState = () => page.evaluate(() => lastRefreshedAt?.getTime());
  const width = async header => (await header.boundingBox()).width;
  const resize = async header => {
    const grip = header.locator(".resize-grip");
    await grip.scrollIntoViewIfNeeded();
    const { x, y, width: w, height: h } = await grip.boundingBox();
    await page.mouse.move(x + w / 2, y + h / 2);
    await page.mouse.down();
    await page.mouse.move(x + w / 2 + 140, y + h / 2, { steps: 4 });
    await page.mouse.up();
    await settle();
    return width(header);
  };
  const writes = () => f.requests.filter(request => request.url.endsWith("/api/deploy/change")).length;
  const initialWrites = writes();

  await open("Versions");
  const versionsTable = page.locator("#content table:has([data-version-row])");
  await versionsTable.locator(".gsis-core-filter").waitFor();
  await settle();
  const versionSort = versionsTable.locator('button.sort-button[title="Sort by Version"]');
  const versionHeader = versionSort.locator("..");
  const compactVersionWidth = await width(versionHeader);
  assert(await resize(versionHeader) > compactVersionWidth + 70, "the native drag must visibly widen the column");
  const expandedVersionWidth = await width(versionHeader);
  const order = () => versionsTable.locator("[data-version-row]").evaluateAll(rows => rows.map(row => row.dataset.versionRow));
  const priorOrder = await order();
  await versionSort.click();
  await settle();
  if ((await order()).every((id, index) => id === priorOrder[index])) {
    await versionSort.click();
    await settle();
  }
  assert.notDeepEqual(await order(), priorOrder, "a real local sort redraw reorders the two versions");
  assert(Math.abs(await width(versionHeader) - expandedVersionWidth) < 2,
    "local Sort must preserve the native manual width");

  let failedReads = 0;
  await page.route("**/api/deploy/sync", async route => {
    failedReads++;
    await route.fulfill({ status: 422, json: { ok: false, error: "Synthetic read rejected" } });
  }, { times: 1 });
  const lastSuccessfulRefresh = await tableState();
  await refresh();
  await page.waitForFunction(() => !refreshing && document.querySelector("#status").textContent.includes("Refresh failed"));
  await settle();
  assert.equal(failedReads, 1);
  assert.equal(await tableState(), lastSuccessfulRefresh);
  assert(Math.abs(await width(versionHeader) - expandedVersionWidth) < 2,
    "a failed read must leave the last loaded table and manual width intact");

  const note = versionsTable.locator("[data-note-input]").first();
  await note.fill("Synthetic unsaved note during refresh");
  const previousTable = await versionsTable.elementHandle();
  const completed = page.waitForResponse(response => response.url().endsWith("/api/deploy/sync") && response.ok());
  await refresh();
  await completed;
  await page.waitForFunction(previous => !refreshing && lastRefreshedAt?.getTime() > previous, lastSuccessfulRefresh);
  await settle();
  assert.equal(await previousTable.evaluate(table => table.isConnected), true,
    "the accepted identical response did not replace the current table");
  assert(Math.abs(await width(versionHeader) - compactVersionWidth) < 2,
    "a successful read must compact the surviving table despite identical loaded values");
  assert.equal(await note.inputValue(), "Synthetic unsaved note during refresh");
  assert.equal(writes(), initialWrites);
  await note.fill("");
  console.log("PASS local redraw and failed Refresh keep actual manual width, while successful identical Refresh restores Compact and retains the Versions note draft");

  assert(await resize(versionHeader) > compactVersionWidth + 70);
  await open("Audit");
  const audit = page.locator('#content[data-view="Audit"] table');
  const auditHeader = audit.locator("thead tr:first-child th").first();
  const auditRefresh = page.getByRole("button", { name: "Refresh audit", exact: true });
  await page.waitForFunction(() => tab === "Audit" && auditState?.loaded && !auditState.loading && !auditState.error);
  await settle();
  const compactAuditWidth = await width(auditHeader);
  assert(await resize(auditHeader) > compactAuditWidth + 40, "the Audit column must visibly widen");
  const originalAudit = await page.evaluateHandle(() => auditState);
  await auditRefresh.click();
  await page.waitForFunction(prior => auditState !== prior && auditState?.loaded && !auditState.loading && !auditState.error, originalAudit);
  await settle();
  assert(Math.abs(await width(auditHeader) - compactAuditWidth) < 2,
    "an accepted Audit refresh restores Compact through its separate read path");

  await open("Duty");
  const duty = page.locator(".duty-entry-roster");
  await duty.waitFor();
  await settle();
  const schedule = () => duty.evaluate(table => ({
    width: table.getBoundingClientRect().width,
    spans: [...table.rows].map(row => [...row.cells].map(cell => [cell.colSpan, cell.rowSpan])),
  }));
  const originalSchedule = await schedule();
  assert(originalSchedule.spans.some(row => row.some(([columns, rows]) => columns > 1 || rows > 1)),
    "the native schedule has merged time or weekday cells");
  const previousRefresh = await tableState();
  await refresh();
  await page.waitForFunction(previous => !refreshing && lastRefreshedAt?.getTime() > previous, previousRefresh);
  await settle();
  assert.deepEqual(await schedule(), originalSchedule, "Compact preserves the Duty schedule width and spans");
  await open("Versions");
  await versionsTable.locator(".gsis-core-filter").waitFor();
  await settle();
  assert(Math.abs(await width(versionHeader) - compactVersionWidth) < 2,
    "reopening a view starts compact after a previous visit expanded the table");
  assert(await resize(versionHeader) > compactVersionWidth + 70);
  const previousVersion = await page.locator("#version").inputValue();
  const nextVersion = versions.find(entry => entry.versionId !== previousVersion).versionId;
  await page.locator("#version").selectOption(nextVersion);
  await page.waitForFunction(id => current === id && !versionLoad, nextVersion);
  await settle();
  assert(Math.abs(await width(versionHeader) - compactVersionWidth) < 2,
    "loading a different saved version starts compact");

  const measuredViews = new Map();
  async function measureView(label, nav = "#nav") {
    await page.locator(nav).getByRole("button", { name: label, exact: true }).click();
    await settle();
    if (label === "Audit") {
      await page.waitForFunction(() => auditState?.loaded && !auditState.loading && !auditState.error);
      await settle();
    }
    if (label === "ASC Export") {
      await page.locator("#content .asc-export summary").filter({
        hasText: /School days, cycle and bells|Subject crosswalk/,
      }).evaluateAll(summaries => summaries.forEach(summary => { summary.parentElement.open = true; }));
      await settle();
    }
    const tables = await page.locator("#content table:visible").evaluateAll(visibleTables =>
      visibleTables.map(table => ({
        title: table.tHead?.textContent.trim().slice(0, 45) || table.className,
        plain: table.hasAttribute("data-plain-table"),
        fitted: table.matches(".gsis-compact:not(.gsis-compact-manual),.gsis-fit-content"),
        padding: Math.max(0, ...[...table.rows].flatMap(row =>
          [...row.cells].filter(cell => cell.getClientRects().length).map(cell => {
            const style = getComputedStyle(cell);
            return Math.max(parseFloat(style.paddingBlockStart), parseFloat(style.paddingBlockEnd));
          }))),
      })));
    for (const table of tables) {
      assert(table.plain || table.fitted, label + " loads fitted table " + table.title);
      assert(table.padding <= 3, label + " has compact row spacing in " + table.title + " (" + table.padding + "px)");
    }
    measuredViews.set(await page.locator("#content").getAttribute("data-view"), tables.length);
    const cancel = page.locator("#content .inline-editor [data-cancel]");
    if (await cancel.count()) await cancel.click();
  }
  const mainViews = (await page.locator("#nav [data-tab]").allTextContents())
    .filter(label => label !== "Program Settings" && label !== "HR Settings");
  for (const label of mainViews) await measureView(label);
  for (const settings of ["Program Settings", "HR Settings"]) {
    await open(settings);
    const labels = await page.locator("#settingsSubnav [data-tab]").allTextContents();
    for (const label of labels) await measureView(label, "#settingsSubnav");
  }
  for (const view of ["IP Deploy", "Dept", "Committees", "CCAs", "PLT", "Events",
    "Duty", "Workload", "Stats", "Ledger", "Versions", "Classes & TGs", "Audit",
    "Classes", "Load Settings", "Subject Type", "Fortnight Split", "Teachers",
    "Level Exclusions", "Membership", "Offload", "HR Terms"]) {
    assert(measuredViews.get(view) > 0, view + " must exercise at least one actual table");
  }
  console.log("PASS initial compact state across " + measuredViews.size +
    " Deploy views and " + [...measuredViews.values()].reduce((sum, count) => sum + count, 0) + " visible tables");
  assert.equal(writes(), initialWrites);
  assert.deepEqual(await saved(), before, "table loading and fitting do not change saved Deploy data");
  assert.deepEqual(errors, []);
  console.log("PASS Audit refresh, reopened view and version load restore Compact, while Duty retains native schedule geometry with no data writes");
} finally {
  await f.close();
}
