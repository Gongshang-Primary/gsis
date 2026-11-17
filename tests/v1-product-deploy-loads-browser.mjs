import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { encodeWorkbook, decodeWorkbook } from "../v1/web/shared/workbooks.mjs";
import { fixture, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { loadVersion } from "../v1/services/deploy/service.mjs";

const f = await fixture();
let page;
const errors = [], dialogs = [];
try {
  const { versionId } = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-loads-create", name: "Synthetic subject loads", year: 2026,
  });
  const db = await f.db("deploy");
  const stored = async () => (await loadVersion(db, schoolId, versionId)).doc;
  // Historical fixture values enter the same real owning D1 that the browser
  // subsequently reads and changes; no synthetic save transport is substituted.
  const initial = await stored();
  const one = { ...initial.loads["1"], Assembly: "1", FTGP: 1, FTT: 2,
    EL: "0", Science: "n/a", PAL: "(n/a)", FORM: 9.5 };
  delete one.LSP;
  const two = { ...initial.loads["2"], LSP: 2.5, E2K: 0, "CCE EL": 0,
    SS: 0, SDR: 0, RRP: 0, "Synthetic support": 0 };
  const three = { ...initial.loads["3"], PAL: "n/a" };
  for (const [level, value] of [["1", one], ["2", two], ["3", three]])
    await db.prepare("UPDATE deploy_rows SET value=? WHERE school_id=? AND version_id=? AND scope='loads' AND row_id=?")
      .bind(JSON.stringify(value), schoolId, versionId, level).run();
  await db.prepare("INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,'_settings','subjectTypes',1,?)")
    .bind(schoolId, versionId, JSON.stringify({ LSP: "tg" })).run();
  const hiddenSplit = { enabled: true, wt: 1, remarks: "Synthetic retained legacy split" };
  await db.prepare("INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,'fortnight',?,1,?)")
    .bind(schoolId, versionId, JSON.stringify(["1", "FORM"]), JSON.stringify(hiddenSplit)).run();
  const fixtureBefore = structuredClone(await stored());
  page = await f.pageFor();
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
  await page.goto(origin + "/deploy/");
  const openLoads = async () => {
    await page.getByRole("button", { name: "Program Settings", exact: true }).click();
    await page.getByRole("button", { name: "Subject Load", exact: true }).click();
    await page.locator('[data-load-total-level="1"]').waitFor();
  };
  const cell = (level, subject) => page.locator('.load-cell input[data-level="' + level + '"][data-key="' + subject + '"]');
  const save = async () => {
    await page.locator("#saveQueue").getByRole("button", { name: "Save to online", exact: true }).click();
    await page.waitForFunction(() => !queuedEdits().length && !queueFlight);
  };
  await openLoads();
  assert.equal(await cell("1", "LSP").inputValue(), "n/a");
  assert.equal(await cell("1", "Science").inputValue(), "n/a");
  assert.equal(await cell("3", "PAL").inputValue(), "n/a");
  assert.equal(await cell("1", "Synthetic support").inputValue(), "n/a");
  assert.equal(await page.locator('[data-load-total-level="1"]').innerText(), "4");
  assert.equal(await page.locator('.load-cell input[data-key="FT"],.load-cell input[data-key="FORM"],.load-cell input[data-key="PD"],.load-cell input[data-key="TTT"]').count(), 0);
  assert.equal(await page.locator('[data-load-reference="PD"]').first().innerText(), "2");
  const subjectHeadings = async () => (await page.locator(".load-table thead tr").first().locator("th").allTextContents())
    .map(text => text.replace(/[↕↑↓▾▴]/g, "").trim());
  const expectedHeadings = [
    "Level", "Assembly", "FTGP", "FTT", "FORM",
    "EL", "LSP", "FEL", "RRP", "SDR", "Math", "LSM", "FMA", "CL", "ML", "TL",
    "CCE", "HCL", "HML", "HTL", "MTSP", "FCL", "FML", "FTL", "Science", "FSC",
    "SS", "PHE", "Art", "Music", "PAL", "CCE EL", "E2K", "Synthetic support", "PD",
  ];
  assert.deepEqual(await subjectHeadings(), expectedHeadings);
  const dialogField = await page.evaluate(async () => {
    const dialog = document.createElement("dialog");
    dialog.innerHTML = table(["FT"], ['<tr><td>2</td></tr>']);
    document.getElementById("content").append(dialog); dialog.showModal();
    await new Promise(resolve => setTimeout(resolve, 0));
    const field = dialog.querySelector("thead th").textContent;
    dialog.close(); dialog.remove(); return field.replace(/[↕↑↓▾▴]/g, "").trim();
  });
  assert.equal(dialogField, "FT", "an unrelated dialog field is not a FORM subject header");
  assert.match(await page.locator("[data-legacy-form-notice]").innerText(), /retained unchanged/);
  assert.deepEqual(await stored(), fixtureBefore, "opening a derived view does not migrate raw records");
  for (const [level, value] of [["1", { ...one, FORM: 0 }], ["2", { ...two, FORM: null }]])
    await db.prepare("UPDATE deploy_rows SET value=? WHERE school_id=? AND version_id=? AND scope='loads' AND row_id=?")
      .bind(JSON.stringify(value), schoolId, versionId, level).run();
  await page.reload(); await openLoads();
  assert.equal(await page.locator("[data-legacy-form-notice]").count(), 0,
    "unused zero/null FORM remnants do not create an actionable warning");
  for (const [level, value] of [["1", one], ["2", two]])
    await db.prepare("UPDATE deploy_rows SET value=? WHERE school_id=? AND version_id=? AND scope='loads' AND row_id=?")
      .bind(JSON.stringify(value), schoolId, versionId, level).run();
  await page.reload(); await openLoads();

  await cell("1", "LSP").fill("3.5");
  await cell("1", "LSP").press("Tab");
  await cell("1", "Science").fill("0");
  await cell("1", "EL").fill("1.5");
  await cell("1", "Synthetic support").fill("2.25");
  assert.equal(await page.evaluate(() => unsavedDraft), true);
  const changesBeforeInvalidSave = f.requests.filter(request => request.url.endsWith("/change")).length;
  await page.locator("#saveQueue").getByRole("button", { name: "Save to online", exact: true }).click();
  assert.equal(f.requests.filter(request => request.url.endsWith("/change")).length, changesBeforeInvalidSave,
    "invalid text retains the whole unsent draft rather than sending a guessed rate");
  assert.equal(await cell("1", "Synthetic support").inputValue(), "2.25");
  await cell("1", "Synthetic support").fill("2.5");
  await save();
  const saved = await stored();
  assert.equal(saved.loads["1"].LSP, 3.5);
  assert.equal(saved.loads["1"].Science, 0);
  assert.equal(saved.loads["1"].EL, 1.5);
  assert.equal(saved.loads["1"]["Synthetic support"], 2.5);
  assert.equal(saved.loads["1"].FORM, 9.5);
  assert.equal(saved.loads["1"].Assembly, "1", "an untouched legacy string is not migrated by another cell save");
  assert.equal(saved.loads["3"].PAL, "n/a");
  assert.deepEqual(saved.fortnight[JSON.stringify(["1", "FORM"])], hiddenSplit);
  assert.deepEqual(saved.assignments, fixtureBefore.assignments);
  const actualSave = f.requests.filter(request => request.url.endsWith("/change")).at(-1);
  assert.equal(actualSave.status, 200, actualSave.body);
  assert(actualSave.input.edits.some(edit => edit.operation === "setLoad" && edit.subject === "LSP" && edit.expected === null));
  await page.reload(); await openLoads();
  assert.equal(await cell("1", "LSP").inputValue(), "3.5");
  assert.equal(await cell("1", "Science").inputValue(), "0");

  const downloadWorkbook = async () => {
    const tools = page.locator("#content .gsis-core-tools").first();
    await tools.getByRole("combobox", { name: "Excel export scope", exact: true }).selectOption("all");
    const downloading = page.waitForEvent("download");
    await tools.getByRole("button", { name: "Export Excel", exact: true }).click();
    const xml = new JSDOM("");
    try { return await decodeWorkbook(await readFile(await (await downloading).path()), { Zip: JSZip, XMLParser: xml.window.DOMParser }); }
    finally { xml.window.close(); }
  };
  const workbook = await downloadWorkbook();
  assert(workbook.sheets.Loads.rows.every(row => !["FT", "FORM", "PD", "TTT"].includes(row[1])));
  workbook.sheets.Loads.rows.find(row => row[0] === "1" && row[1] === "LSP")[2] = "4.5";
  workbook.sheets.Loads.rows.find(row => row[0] === "1" && row[1] === "Science")[2] = null;
  await page.locator("#content .gsis-core-tools").first().getByRole("button", { name: "Import Excel", exact: true }).click();
  const importer = page.getByRole("dialog", { name: "Import Load Settings", exact: true });
  await importer.getByLabel("Import settings workbook", { exact: true }).setInputFiles({
    name: "synthetic-loads.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await encodeWorkbook(workbook, { Zip: JSZip })),
  });
  await importer.getByRole("button", { name: "Confirm atomic import", exact: true }).click();
  await importer.getByRole("status").filter({ hasText: "Draft changes committed atomically" }).waitFor();
  await importer.getByRole("button", { name: "Close", exact: true }).click();
  assert.equal((await stored()).loads["1"].LSP, 4.5);
  assert.equal((await stored()).loads["1"].Science, null, "blank Excel cell means not offered, not zero");
  assert.equal((await stored()).loads["1"].FORM, 9.5);

  await page.getByRole("button", { name: "Fortnight Split", exact: true }).click();
  const fortnightField = await page.evaluate(async () => {
    const field = document.createElement("div");
    field.innerHTML = table(["FT"], ['<tr><td>1</td></tr>']);
    document.getElementById("content").append(field);
    await new Promise(resolve => setTimeout(resolve, 0));
    const text = field.querySelector("thead th").textContent;
    field.remove(); return text.replace(/[↕↑↓▾▴]/g, "").trim();
  });
  assert.equal(fortnightField, "FT", "the fortnight FT block field keeps its original identity and label");
  const visibleKeys = await page.locator("[data-fortnight-toggle]").evaluateAll(buttons => buttons.map(button => button.dataset.fortnightToggle));
  assert(visibleKeys.includes(JSON.stringify(["1", "LSP"])), "TG-only subjects retain the original fortnight editor policy");
  assert(!visibleKeys.includes(JSON.stringify(["1", "FORM"])));
  assert(!visibleKeys.includes(JSON.stringify(["1", "Science"])));
  const fortnightBook = await downloadWorkbook();
  assert.deepEqual(fortnightBook.sheets.Fortnight.rows.map(row => JSON.stringify([row[0], row[1]])).sort(),
    [...visibleKeys].sort(), "Excel and the visible editor contain the same teaching rows");
  assert.deepEqual((await stored()).fortnight[JSON.stringify(["1", "FORM"])], hiddenSplit,
    "filtering a historical split from the derived view does not delete it");
  const xmlProjection = await page.evaluate(() => {
    const snapshot = { ...v(), loads: { 1: { Sci: 2, PE: 2, FORM: 9.5 } },
      teachers: [], groups: [], assignments: [], venues: [], duties: [],
      classes: [{ ref: "synthetic-xml-class", level: "1", shortName: "A", name: "Synthetic class" }],
      organisations: { plt: [] }, workload: { categories: {} } };
    const before = JSON.stringify(snapshot);
    const settings = GSISAscExport.defaults(snapshot); settings.includeUnassigned = true;
    const preview = GSISAscExport.preview(snapshot, settings);
    return { unchanged: before === JSON.stringify(snapshot), blockers: preview.blockers,
      subjects: preview.model?.subjects.map(subject => subject.short) || [] };
  });
  assert(xmlProjection.unchanged, "derived XML preview does not rewrite the input snapshot");
  assert(!xmlProjection.subjects.includes("FORM"), "unused standalone FORM is not a second XML subject");
  assert(!xmlProjection.blockers.some(issue => /conflicting definitions/.test(issue.message)),
    "sparse legacy Sci/PE spellings do not acquire contradictory standard counterparts");
  const legacyGroup = { id: "synthetic-legacy-form-tg", name: "Synthetic retained FORM group",
    subject: "FORM", level: "1", levels: ["1"], weeklyPeriods: 5,
    classRefs: [], levelWide: true, venue: "" };
  await db.prepare("INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,'groups',?,1,?)")
    .bind(schoolId, versionId, legacyGroup.id, JSON.stringify(legacyGroup)).run();
  await db.prepare("UPDATE deploy_versions SET revision=revision+1 WHERE school_id=? AND id=?")
    .bind(schoolId, versionId).run();
  await page.reload(); await openLoads();
  assert.deepEqual(await subjectHeadings(), [...expectedHeadings, "Legacy FORM"]);
  assert.equal(await page.locator('[data-load-reference="FORM"]').first().innerText(), "9.5");
  await cell("1", "EL").fill("2"); await save();
  assert.deepEqual((await stored()).groups.find(group => group.id === legacyGroup.id), legacyGroup,
    "an unrelated cell save preserves legacy FORM TG identity and its explicit workload");
  assert.equal((await stored()).loads["1"].FORM, 9.5);
  assert.deepEqual(errors, []);
  assert(f.external.every(url => url === "https://accounts.google.com/gsi/client"), "provider requests remain intercepted");
  console.log("PASS real built browser/Worker/D1 subject loads: sparse LSP/global cells, legacy n/a/raw expected values, zero/half periods, invalid-draft retention, computed FORM/read-only PD, unchanged legacy data, actual XLSX import and matching fortnight rows");
} catch (error) {
  console.error(JSON.stringify({ errors, dialogs,
    queue: page && await page.evaluate(() => ({ edits: queuedEdits(), flight: !!queueFlight, error: queueError })).catch(() => null),
    failures: f.requests.filter(request => request.status >= 400).map(request => ({ url: request.url, input: request.input, body: request.body.slice(0, 1500) })),
  }));
  throw error;
} finally { await f.close(); }
