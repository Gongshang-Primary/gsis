import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
const read = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");
const [script, css, deploy] = await Promise.all(
  [
    "v1/web/shared/core-table.js",
    "v1/web/shared/core-table.css",
    "v1/web/shared/deploy-ui.js",
  ].map(read),
);
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
  executablePath: process.env.GSIS_BROWSER_EXECUTABLE || undefined,
});
try {
  const page = await browser.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setContent(
    `<style>${css}</style><div id="dataGrid"><table><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody><tr><td>Alice</td><td>Teacher</td></tr><tr><td>Bob</td><td>Teacher</td></tr><tr><td>ALICIA</td><td>Support</td></tr></tbody></table></div><table class="weekly-grid"><thead><tr><th>Monday</th></tr></thead><tbody><tr><td>Event</td></tr></tbody></table>`,
  );
  await page.evaluate(() => {
    window.GSISV1 = { module: "contacts" };
    window.exports = 0;
    window.imports = 0;
  });
  await page.addScriptTag({ content: script });
  await page.getByRole("searchbox", { name: "Filter Name" }).fill("ali");
  assert.deepEqual(
    await page
      .locator("#dataGrid tbody tr:visible td:first-child")
      .allTextContents(),
    ["Alice", "ALICIA"],
  );
  await page.getByRole("searchbox", { name: "Filter Role" }).fill("teach");
  assert.equal(await page.locator("#dataGrid tbody tr:visible").count(), 1);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button", { name: "Sort Name", exact: true }).click();
  assert.deepEqual(
    await page.locator("#dataGrid tbody tr td:first-child").allTextContents(),
    ["Alice", "ALICIA", "Bob"],
  );
  await page.getByRole("button", { name: "Sort Name", exact: true }).click();
  assert.equal(
    await page
      .locator("#dataGrid tbody tr td:first-child")
      .first()
      .textContent(),
    "Bob",
  );
  await page.getByRole("searchbox", { name: "Filter Name" }).fill("bo");
  await page.evaluate(
    () =>
      (document.querySelector("#dataGrid tbody").innerHTML =
        "<tr><td>Carol</td><td>Teacher</td></tr><tr><td>Bobby</td><td>Teacher</td></tr>"),
  );
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("#dataGrid tbody tr")].filter(
        (r) => !r.hidden,
      ).length === 1,
  );
  assert.equal(
    await page.locator("#dataGrid tbody tr:visible td").first().textContent(),
    "Bobby",
    "current filter applies after owner replaces rows",
  );
  await page.getByRole("button", { name: "Clear filters" }).click();
  assert.equal(
    await page.getByRole("button", { name: "Import Excel" }).isDisabled(),
    true,
  );
  await page.evaluate(() =>
    window.GSISCoreTables.register("#dataGrid table", {
      exportAll: () => {
        window.exports++;
      },
      importAll: () => {
        window.imports++;
      },
    }),
  );
  await page
    .getByRole("combobox", { name: "Excel export scope" })
    .selectOption("all");
  await page.getByRole("button", { name: "Export Excel" }).click();
  await page.getByRole("button", { name: "Import Excel" }).click();
  assert.deepEqual(
    await page.evaluate(() => [window.exports, window.imports]),
    [1, 1],
  );
  await page.getByRole("separator", { name: "Resize Name" }).focus();
  await page.keyboard.press("ArrowRight");
  const width = await page
    .locator("#dataGrid thead th")
    .first()
    .evaluate((e) => e.style.width);
  await page.evaluate(() => {
    const host = document.getElementById("dataGrid");
    host.innerHTML =
      "<table><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody><tr><td>New</td><td>Teacher</td></tr></tbody></table>";
  });
  await page.waitForFunction(() =>
    document.querySelector("#dataGrid .gsis-core-tools"),
  );
  assert.equal(
    await page
      .locator("#dataGrid thead th")
      .first()
      .evaluate((e) => e.style.width),
    width,
    "manual widths survive owner refresh",
  );
  assert.equal(
    await page.locator(".weekly-grid .gsis-core-sort").count(),
    0,
    "calendar chronology is untouched",
  );
  await page.evaluate(() => {
    const d = document.createElement("dialog");
    d.innerHTML =
      "<table data-core-table><thead><tr><th>Device</th></tr></thead><tbody><tr><td>Cart 1</td></tr></tbody></table>";
    document.body.append(d);
    d.showModal();
  });
  await page.waitForFunction(() =>
    document.querySelector("dialog .gsis-core-filter"),
  );
  await page.evaluate(() => document.querySelector("dialog").close());
  // Owner-hidden fields and descendants never become visible or enter report exports.
  await page.evaluate(() => {
    const host = document.createElement("section");
    host.id = "restricted";
    host.innerHTML =
      '<table><thead><tr><th>Name</th><th hidden>Owner-hidden</th><th style="display:none">CSS-hidden</th></tr></thead><tbody><tr><td>Public<span hidden>HIDDEN NODE</span><span style="display:none">CSS NODE</span><input type="hidden" value="SECRET INPUT"><details><summary>Visible</summary><div>HIDDEN CLOSED DETAILS</div></details></td><td hidden>SYNTHETIC RESTRICTED</td><td style="display:none">CSS RESTRICTED</td></tr></tbody></table>';
    document.body.append(host);
  });
  await page.waitForFunction(() =>
    document.querySelector("#restricted .gsis-core-tools"),
  );
  assert.equal(
    await page.locator("#restricted th").nth(1).getAttribute("hidden"),
    "",
  );
  assert.equal(
    await page.locator("#restricted tbody td").nth(1).getAttribute("hidden"),
    "",
  );
  assert.equal(
    await page
      .locator("#restricted .gsis-core-tools")
      .getByText("Owner-hidden", { exact: true })
      .count(),
    0,
  );
  assert.deepEqual(
    await page.evaluate(() =>
      GSISCoreTables.report(document.querySelector("#restricted table")),
    ),
    { headers: ["Name"], rows: [["Public Visible"]] },
  );
  // Native column controls retain their nodes/listeners when the owner rebuilds the header.
  await page.evaluate(() => {
    const host = document.createElement("section");
    host.id = "native";
    host.innerHTML =
      '<div class="gsis-table-tools"><div class="column-picker"><button id="nativeColumns">Native columns</button></div></div><table><thead><tr><th>Person</th></tr></thead><tbody><tr><td>Example</td></tr></tbody></table>';
    document.body.append(host);
    document.getElementById("nativeColumns").onclick = () =>
      (window.nativeClicked = true);
  });
  await page.waitForFunction(() =>
    document.querySelector("#native .gsis-core-tools #nativeColumns"),
  );
  await page.evaluate(
    () =>
      (document.querySelector("#native thead").innerHTML =
        "<tr><th>Person</th><th>Team</th></tr>"),
  );
  await page.waitForFunction(() =>
    document.querySelector("#native .gsis-core-tools #nativeColumns"),
  );
  await page
    .getByRole("button", { name: "Native columns", exact: true })
    .click();
  assert.equal(await page.evaluate(() => window.nativeClicked), true);
  // Empty Deploy still exposes the full reviewed v0.9 taxonomy; creation remains Versions-owned.
  await page.setContent(
    '<select id="version"><option value="">No version</option></select><nav id="nav" hidden></nav><main id="content">No deployment version is available.<button onclick="window.created=true">Create initial baseline</button></main>',
  );
  await page.addScriptTag({ content: deploy });
  await page.waitForFunction(
    () => document.querySelectorAll("#nav button").length === 20,
  );
  assert.equal(
    await page.locator("#content").getAttribute("data-view"),
    "Versions",
  );
  await page
    .locator("#nav")
    .getByRole("button", { name: "IP Deploy", exact: true })
    .click();
  assert.match(
    await page.locator("#content").textContent(),
    /becomes available/,
  );
  await page.getByRole("button", { name: "Open Versions" }).click();
  await page.getByRole("button", { name: "Create initial baseline" }).click();
  assert.equal(await page.evaluate(() => window.created), true);
  assert.deepEqual(errors, []);
  console.log(
    "PASS shared partial filters, sorting, adapter boundaries, resized-column refresh, calendar exclusion, dialog opt-in and empty Deploy navigation",
  );
} finally {
  await browser.close();
}
