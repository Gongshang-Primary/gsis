/** Built browser + isolated Core/Contacts/Deploy Workers and D1.
 * Synthetic version fixtures only; no hosted data or provider requests. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { fixture, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";
import { decodeWorkbook, encodeWorkbook } from "../v1/web/shared/workbooks.mjs";

const started = Date.now();
const f = await fixture();
try {
  const people = await f.call(f.admin, "contacts", "/save-data", {
    operationId: "workload-settings-staff",
    changes: [],
    additions: [
      {
        id: "synthetic-teacher",
        values: {
          "Basic Name": "Synthetic Activity Teacher",
          "Statutory Name": "Synthetic Activity Teacher",
          Active: "Y",
          Role: "Teacher",
        },
      },
      {
        id: "synthetic-reader",
        values: {
          "Basic Name": "Synthetic Read Only Staff",
          "Statutory Name": "Synthetic Read Only Staff",
          Active: "Y",
        },
      },
    ],
  });
  const staffId = people.mapping["synthetic-teacher"];
  const readerStaffId = people.mapping["synthetic-reader"];
  for (const [field, value] of [
    ["smc", true],
    ["eo", false],
    ["schoolLeader", false],
  ]) {
    await f.call(f.admin, "contacts", "/staff/" + readerStaffId + "/accept", {
      operationId: "workload-settings-reader-" + field,
      field,
      value,
      revision: 0,
      ownerReviewReference: "Synthetic owner review",
    });
  }
  const reader = await f.seedAccount("workload-settings-reader", {
    staffId: readerStaffId,
    capabilities: [],
  });
  const withActivity = (
    await f.call(f.admin, "deploy", "/versions/create", {
      operationId: "workload-settings-with-activity",
      name: "Synthetic with IMP",
      year: 2026,
    })
  ).versionId;
  const withoutActivity = (
    await f.call(f.admin, "deploy", "/versions/create", {
      operationId: "workload-settings-without-activity",
      name: "Synthetic no activity",
      year: 2026,
    })
  ).versionId;
  const activity = {
    id: "synthetic-imp",
    code: "IMP",
    name: "Instructional Mentoring Programme",
    weeklyPeriods: 2,
    teachers: [staffId],
  };
  const db = await f.db("deploy");
  const loaded = await loadVersion(db, schoolId, withActivity);
  const doc = structuredClone(loaded.doc);
  doc.workload.nonTeachingActivities = [activity];
  doc.workload.noFTT = [staffId];
  const delta = changesFor(schoolId, withActivity, loaded.rows, doc);
  await db.batch(delta.writes.map((w) => statement(db, w.sql, w.args)));
  const saved = async (id) => (await loadVersion(db, schoolId, id)).doc;
  const before = await saved(withActivity);
  const page = await f.pageFor();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/deploy/");
  await page.waitForFunction(
    () => document.querySelector("#version")?.options.length === 2,
  );
  await page.locator("#version").selectOption(withActivity);
  await page.waitForFunction(
    (id) => current === id && !refreshing,
    withActivity,
  );
  await page
    .getByRole("button", { name: "Workload Settings", exact: true })
    .click();
  assert.equal(
    await page.locator("[data-workload-settings-view]").count(),
    1,
    "Workload Settings must arrive in view mode, without opening its editor",
  );
  assert.equal(
    await page.locator(".workload-settings.inline-editor").count(),
    0,
  );
  const view = () => page.locator("[data-workload-settings-view]");
  const mutationCount = () =>
    f.requests.filter((request) =>
      /\/api\/deploy\/(?:change|lease|versions\/create)(?:\?|$)/.test(
        request.url,
      ),
    ).length;
  const queueState = () =>
    page.evaluate(() => ({
      open: !!inlineDraftEditor?.open,
      dirty: unsavedDraft,
      queued: queuedEdits().length,
    }));
  async function selectVersion(id) {
    await page.locator("#version").selectOption(id);
    await page.waitForFunction((id) => current === id && !refreshing, id);
    await page
      .getByRole("button", { name: "Workload Settings", exact: true })
      .click();
    await view().waitFor();
  }
  function tableTools(table) {
    return table.locator(
      "xpath=ancestor::*[contains(concat(' ',normalize-space(@class),' '),' gsis-core-scroll ') or contains(concat(' ',normalize-space(@class),' '),' table-window ')][1]/preceding-sibling::*[contains(concat(' ',normalize-space(@class),' '),' gsis-core-tools ')][1]",
    );
  }
  const subjects = () => view().locator("[data-workload-settings-subjects]");
  await subjects().waitFor();
  assert.ok(
    (await subjects().getAttribute("class"))
      .split(/\s+/)
      .includes("gsis-compact"),
  );
  assert.match(await view().innerText(), /Instructional Mentoring Programme/);
  assert.match(await view().innerText(), /Synthetic Activity Teacher/);
  assert.equal(
    await subjects().locator('[data-workload-subject="EL"]').count(),
    0,
    "view subject rows are not editable controls",
  );
  assert.equal(
    await subjects()
      .locator("tbody tr")
      .filter({ hasText: /^IMP\b/ })
      .count(),
    0,
    "IMP is a countable activity, not an invented subject row",
  );
  assert.deepEqual(await queueState(), {
    open: false,
    dirty: false,
    queued: 0,
  });
  assert.equal(mutationCount(), 0);
  assert.equal(
    await tableTools(subjects())
      .getByRole("button", { name: "Import Excel", exact: true })
      .isDisabled(),
    true,
  );
  assert.deepEqual(await saved(withActivity), before);
  console.log(
    "PASS arrival is a clean compact view with version-owned IMP and disabled view import",
  );

  const downloadPromise = page.waitForEvent("download");
  await tableTools(subjects())
    .getByRole("button", { name: "Export Excel", exact: true })
    .click();
  const download = await downloadPromise;
  const xml = new JSDOM("");
  let exported;
  try {
    exported = await decodeWorkbook(await readFile(await download.path()), {
      Zip: JSZip,
      XMLParser: xml.window.DOMParser,
    });
  } finally {
    xml.window.close();
  }
  assert.match(exported.metadata["Export Kind"], /Visible report/);
  assert.ok(exported.sheets.Report.rows.some((row) => row[0] === "EL"));
  assert.ok(exported.sheets.Report.rows.every((row) => row[0] !== "IMP"));
  assert.equal(mutationCount(), 0);
  console.log(
    "PASS real visible-report Excel export remains available without a mutation",
  );

  await view().getByRole("button", { name: "Edit", exact: true }).click();
  let editor = page.locator(".workload-settings.inline-editor");
  await editor.waitFor();
  const importButton = editor
    .getByRole("button", { name: "Import Excel", exact: true })
    .last();
  assert.equal(await importButton.isEnabled(), true);
  const importBook = await page.evaluate(
    (school) =>
      GSISDeploySettingTables.workbook(v(), "Workload Settings", school),
    schoolId,
  );
  importBook.sheets.Workload.rows.find((row) => row[0] === "EL")[1] =
    "Non-teaching";
  const importBytes = await encodeWorkbook(importBook, { Zip: JSZip });
  await importButton.click();
  const dialog = page.getByRole("dialog", {
    name: "Import Workload Settings",
    exact: true,
  });
  await dialog
    .getByLabel("Import settings workbook", { exact: true })
    .setInputFiles({
      name: "synthetic-workload.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(importBytes),
    });
  await dialog
    .getByRole("button", { name: "Confirm atomic import", exact: true })
    .waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("dialog button")].some(
      (button) =>
        button.textContent === "Confirm atomic import" && !button.disabled,
    ),
  );
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  const chooseCategory = async (value) => {
    const cell = page
      .locator('.workload-settings.inline-editor [data-workload-subject="EL"]')
      .locator("..");
    await cell.locator("summary").click();
    await cell.getByRole("option", { name: value, exact: true }).click();
  };
  await chooseCategory("Non-teaching");
  assert.deepEqual(await queueState(), { open: true, dirty: true, queued: 0 });
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await view().waitFor();
  assert.deepEqual(await queueState(), {
    open: false,
    dirty: false,
    queued: 0,
  });
  assert.deepEqual(await saved(withActivity), before);
  assert.equal(mutationCount(), 0, "import preview and Cancel never commit");
  console.log(
    "PASS explicit Edit retains real workbook preview; Cancel returns to unchanged view",
  );

  await view().getByRole("button", { name: "Edit", exact: true }).click();
  editor = page.locator(".workload-settings.inline-editor");
  await chooseCategory("Non-teaching");
  await editor
    .getByRole("button", { name: "Apply to draft", exact: true })
    .click();
  await view().waitFor();
  assert.deepEqual(await queueState(), {
    open: false,
    dirty: false,
    queued: 1,
  });
  assert.deepEqual(
    await saved(withActivity),
    before,
    "Apply changes the local draft only",
  );
  assert.equal(mutationCount(), 0);
  assert.deepEqual(
    await page.evaluate(() => queuedEdits()[0].value.nonTeachingActivities),
    [activity],
  );
  const save = page
    .locator("#saveQueue")
    .getByRole("button", { name: "Save to online", exact: true });
  assert.equal(await save.isEnabled(), true);
  await save.click();
  await page.waitForFunction(
    () => !queuedEdits().length && !queueFlight && !refreshing,
  );
  const after = await saved(withActivity);
  assert.equal(after.workload.categories.EL, "Non-teaching");
  assert.deepEqual(after.workload.nonTeachingActivities, [activity]);
  assert.deepEqual(after.workload.noFTT, [staffId]);
  assert.deepEqual(after.loads, before.loads);
  assert.equal(
    f.requests.filter((request) => /\/api\/deploy\/change$/.test(request.url))
      .length,
    1,
  );
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#version")?.options.length === 2,
  );
  await page.locator("#version").selectOption(withActivity);
  await page.waitForFunction(
    (id) => current === id && !refreshing,
    withActivity,
  );
  await page
    .getByRole("button", { name: "Workload Settings", exact: true })
    .click();
  await view().waitFor();
  const elRow = subjects()
    .locator("tbody tr")
    .filter({ has: page.locator("td:first-child", { hasText: /^EL$/ }) });
  assert.match(await elRow.innerText(), /Non-teaching/);
  assert.deepEqual(await queueState(), {
    open: false,
    dirty: false,
    queued: 0,
  });
  console.log(
    "PASS Apply queues and native Save/reload persists the category with IMP and No FTT intact",
  );

  await selectVersion(withoutActivity);
  assert.doesNotMatch(
    await view().innerText(),
    /Instructional Mentoring Programme/,
  );
  assert.match(await view().innerText(), /No .*activit/i);
  assert.equal(
    (await saved(withoutActivity)).workload.nonTeachingActivities,
    undefined,
  );
  await selectVersion(withActivity);
  assert.match(await view().innerText(), /Instructional Mentoring Programme/);
  assert.equal(
    await page.locator(".workload-settings.inline-editor").count(),
    0,
  );
  await page
    .getByRole("button", { name: "Workload", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Workload Settings", exact: true })
    .click();
  await view().waitFor();
  assert.deepEqual(await queueState(), {
    open: false,
    dirty: false,
    queued: 0,
  });
  const denied = await f.request(reader, "deploy", "/change", {
    method: "POST",
    body: {
      operationId: "workload-settings-denied",
      versionId: withActivity,
      edits: [],
    },
  });
  assert.equal(denied.status, 403);
  assert.deepEqual((await saved(withActivity)).workload, after.workload);
  console.log(
    "PASS version switching scopes IMP/empty states; re-entry is view-only and denied user cannot save",
  );
  assert.deepEqual(errors, []);
  assert.ok(
    f.external.every((url) => url.startsWith("https://accounts.google.com/")),
    "no external provider requests",
  );
  console.log(
    `5/5 Workload Settings browser groups passed in ${Date.now() - started}ms`,
  );
} finally {
  await f.close();
}
