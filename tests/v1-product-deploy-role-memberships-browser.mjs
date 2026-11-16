import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { loadVersion } from "../v1/services/deploy/service.mjs";
import { encodeWorkbook, decodeWorkbook } from "../v1/web/shared/workbooks.mjs";

// The real legacy exporter is used with synthetic rows, not a reimplementation
// of its file shape. All browser requests reach the built local Workers and D1.
const legacy = { window: {}, TextEncoder, Blob, Uint8Array, DataView };
vm.runInNewContext(await readFile(new URL("../public/excel-export.js", import.meta.url), "utf8"), legacy);
const legacyColumns = ["Role Shortform", "Formal Role Name", "SL", "SC", "SMC", "KP", "TL", "SDT", "CMT", "SAT", "Support", "MK", "EO Appt Level"];
const legacyBytes = async rows => Buffer.from(await legacy.window.GSISExcel.workbook([legacyColumns, ...rows], "Membership").arrayBuffer());
const xml = new JSDOM("");
const started = Date.now();
const f = await fixture();
let operation = 0;
try {
  const db = await f.db("deploy");
  const { versionId } = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-role-matrix-create", name: "Synthetic role planning", year: 2026,
  });
  const stored = async () => (await loadVersion(db, schoolId, versionId)).doc;
  assert.equal((await stored()).teachers.length, 0);
  const page = await f.pageFor(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const open = async () => {
    await page.goto(origin + "/deploy/");
    await page.getByRole("button", { name: "HR Settings", exact: true }).click();
    await page.getByRole("button", { name: "Membership", exact: true }).click();
    await page.locator("table[data-role-membership]").waitFor();
  };
  await open();
  const matrix = page.locator("table[data-role-membership]");
  assert.match(await matrix.innerText(), /No role mappings yet/);
  await page.getByRole("button", { name: "Add role", exact: true }).click();
  const cell = (row, col) => matrix.locator('[data-member-row="' + row + '"][data-member-col="' + col + '"]');
  await cell(0, 0).fill("Unit Lead"); await cell(0, 0).blur();
  await cell(0, 1).fill("Synthetic Unit Leader"); await cell(0, 1).blur();
  await cell(0, 4).check();
  await cell(0, 12).fill("Synthetic grade"); await cell(0, 12).blur();
  assert.equal(await cell(0, 13).inputValue(), "", "grade cannot infer EO");
  await cell(0, 13).selectOption("true");
  await page.getByRole("button", { name: "Add role", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await matrix.getByRole("button", { name: "Delete role New role 1", exact: true }).click();
  const save = async () => {
    await page.locator("#saveQueue").getByRole("button", { name: "Save to online", exact: true }).click();
    await page.waitForFunction(() => !queuedEdits().length && !queueFlight);
  };
  await save();
  assert.equal((await stored()).membership.length, 1);
  assert.equal((await stored()).membership[0][4], "1");
  assert.equal((await stored()).membership[0][13], true);
  assert.equal((await stored()).teachers.length, 0, "roles can be configured before any teachers exist");
  await open();
  assert.equal(await cell(0, 0).inputValue(), "Unit Lead");
  assert.equal(await cell(0, 13).inputValue(), "true");
  await page.screenshot({ path: "/tmp/gsis-role-matrix-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/gsis-role-matrix-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await matrix.getByRole("searchbox", { name: "Filter Role Shortform", exact: true }).fill("unit");
  assert.equal(await matrix.locator("tbody tr:visible").count(), 1);
  await matrix.getByRole("searchbox", { name: "Filter Role Shortform", exact: true }).fill("absent-label");
  assert.equal(await matrix.locator("tbody tr:visible").count(), 0);
  await matrix.getByRole("searchbox", { name: "Filter Role Shortform", exact: true }).fill("");
  await matrix.getByRole("button", { name: "Sort Role Shortform", exact: true }).click();
  assert.equal(await matrix.locator("thead tr").first().locator("th").first().getAttribute("aria-sort"), "ascending");

  const toolbar = page.locator("#content .gsis-core-tools").first();
  assert.equal(await page.locator("#viewActions .column-picker").count(), 0, "no orphan legacy column picker above the matrix");
  await toolbar.locator("details > summary").click();
  await toolbar.getByRole("checkbox", { name: "Formal Role Name", exact: true }).uncheck();
  assert.equal(await matrix.locator("thead tr").first().locator("th").nth(1).isHidden(), true);
  await toolbar.getByRole("checkbox", { name: "Formal Role Name", exact: true }).check();
  assert.equal(await matrix.locator("thead tr").first().locator("th").nth(1).isVisible(), true);
  await toolbar.locator("details > summary").click();
  await toolbar.getByRole("combobox", { name: "Excel export scope", exact: true }).selectOption("all");
  const download = page.waitForEvent("download");
  await toolbar.getByRole("button", { name: "Export Excel", exact: true }).click();
  const exported = await decodeWorkbook(await readFile(await (await download).path()), { Zip: JSZip, XMLParser: xml.window.DOMParser });
  assert.equal(exported.metadata["Table Scope"], "Role Membership");
  assert.equal(exported.sheets["Role Membership"].rows[0][13], true);
  exported.sheets["Role Membership"].rows[0][1] = "Imported Unit Leader";
  exported.sheets["Role Membership"].rows[0][13] = false;
  const upload = async bytes => {
    const choose = page.waitForEvent("filechooser");
    await toolbar.getByRole("button", { name: "Import Excel", exact: true }).click();
    await (await choose).setFiles({ name: "synthetic-role-matrix-" + (++operation) + ".xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(bytes) });
    return page.getByRole("dialog", { name: "Import Deploy workbook", exact: true });
  };
  let dialog = await upload(await encodeWorkbook(exported, { Zip: JSZip }));
  await dialog.getByRole("button", { name: "Confirm atomic replacement", exact: true }).waitFor();
  assert.equal((await stored()).membership[0][1], "Synthetic Unit Leader", "preview is read-only");
  await dialog.getByRole("button", { name: "Confirm atomic replacement", exact: true }).click();
  await dialog.getByRole("status").filter({ hasText: "Draft replacement committed" }).waitFor();
  assert.equal((await stored()).membership[0][1], "Imported Unit Leader");
  assert.equal((await stored()).membership[0][13], false);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  const legacyRows = [["", "Ordinary teachers", ...Array(10).fill("No"), "Synthetic base grade"],
    ["Unit Lead", "Legacy Unit Leader", "Yes", "No", "Yes", "Yes", "No", "No", "No", "No", "No", "No", "Synthetic senior grade"]];
  const legacyFile = await legacyBytes(legacyRows);
  await assert.rejects(decodeWorkbook(legacyFile, { Zip: JSZip, XMLParser: xml.window.DOMParser }), /Metadata/,
    "legacy support is opt-in for the role scope only");
  dialog = await upload(legacyFile);
  await dialog.getByRole("button", { name: "Confirm atomic replacement", exact: true }).waitFor();
  assert.match(await dialog.innerText(), /EO is Not set/);
  assert.equal((await stored()).membership.length, 1);
  await dialog.getByRole("button", { name: "Confirm atomic replacement", exact: true }).click();
  await dialog.getByRole("status").filter({ hasText: "Draft replacement committed" }).waitFor();
  const imported = (await stored()).membership;
  assert.equal(imported.length, 2); assert.equal(imported[0][0], "");
  assert.equal(imported[1][4], "1");
  assert.equal(imported[1][13], null, "legacy grade is not an EO authority instruction");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  // Canonical Metadata is never rebound by the opt-in legacy path.
  const foreign = await f.call(f.admin, "deploy", "/export", { versionId, scope: "Role Membership" });
  foreign.metadata["School ID"] = "synthetic-other-school";
  dialog = await upload(await encodeWorkbook(foreign, { Zip: JSZip }));
  await dialog.getByRole("status").filter({ hasText: /school/i }).waitFor();
  assert.equal(await dialog.getByRole("button", { name: "Confirm atomic replacement", exact: true }).count(), 0);
  assert.deepEqual((await stored()).membership, imported);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  const formula = await JSZip.loadAsync(legacyFile);
  const name = "xl/worksheets/sheet1.xml";
  formula.file(name, (await formula.file(name).async("string")).replace('<is><t xml:space="preserve">Ordinary teachers', '<f>1+1</f><is><t xml:space="preserve">Ordinary teachers'));
  dialog = await upload(await formula.generateAsync({ type: "uint8array" }));
  await dialog.getByRole("status").filter({ hasText: /Formulas are not accepted/ }).waitFor();
  assert.deepEqual((await stored()).membership, imported);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  const scenario = await seedScenario(f);
  for (const [index, role] of [[0, "SH Synthetic"], [1, "ST"]]) {
    const contact = (await f.request(f.admin, "contacts", "/staff/" + scenario.staff[index])).body.data;
    await f.call(f.admin, "contacts", "/staff/" + scenario.staff[index] + "/update", {
      operationId: "synthetic-role-grade-" + index, changes: { role, memberships: ["Synthetic custom group"] },
      fieldRevisions: { role: contact.fields.role?.revision || 0, memberships: contact.fields.memberships?.revision || 0 },
    });
  }
  await open();
  const explicit = await f.call(f.admin, "deploy", "/export", { versionId, scope: "Role Membership" });
  explicit.sheets["Role Membership"].rows = [
    ["SH Synthetic", "Synthetic Subject Head", ...Array(10).fill(""), "Jnr KP", true],
    ["ST", "Synthetic Senior Teacher", ...Array(10).fill(""), "ST", true],
  ];
  dialog = await upload(await encodeWorkbook(explicit, { Zip: JSZip }));
  await dialog.getByRole("button", { name: "Confirm atomic replacement", exact: true }).click();
  await dialog.getByRole("status").filter({ hasText: "Draft replacement committed" }).waitFor();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await open();
  const currentGroups = await page.evaluate(() => v().teachers.map(t => ({ role: t.profile.Role, groups: plannerTeacher(t).groups })));
  for (const teacher of currentGroups) assert.deepEqual(teacher.groups, ["Synthetic custom group"],
    teacher.role + " must not infer SMC or TL from its appointment grade");
  await page.locator("[data-staff-memberships] > summary").click();
  const member = page.locator('[data-memberships-teacher="' + scenario.staff[0] + '"]');
  assert.match(await member.locator("[data-managed-memberships]").innerText(), /From role mapping: None/);
  await member.locator("textarea").fill("Synthetic custom replacement"); await member.locator("textarea").blur();
  await save();
  assert.deepEqual((await stored()).teachers.find(t => t.id === scenario.staff[0]).groups, ["Synthetic custom replacement"]);
  await open();
  assert.deepEqual(await page.evaluate(id => plannerTeacher(v().teachers.find(t => t.id === id)).groups, scenario.staff[0]), ["Synthetic custom replacement"]);
  for (const [field, value] of [["smc", true], ["eo", false]]) {
    const contact = (await f.request(f.admin, "contacts", "/staff/" + scenario.staff[0])).body.data;
    await f.call(f.admin, "contacts", "/staff/" + scenario.staff[0] + "/accept", {
      operationId: "synthetic-role-reader-" + field, field, value, revision: contact.fields[field].revision,
      ownerReviewReference: "Synthetic owner review",
    });
  }
  const reader = await f.seedAccount("synthetic-role-matrix-reader", { staffId: scenario.staff[0], capabilities: [] });
  const readPage = await f.pageFor();
  await readPage.context().addCookies([{ name: "__Host-gsis_session", value: reader.token,
    domain: new URL(origin).hostname, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  await readPage.goto(origin + "/deploy/");
  await readPage.locator("#content table").waitFor();
  assert.equal(await readPage.getByRole("button", { name: "HR Settings", exact: true }).count(), 0,
    "a read-only account cannot enter the role editor");
  const beforeDenied = (await stored()).membership;
  const denied = await f.request(reader, "deploy", "/change", { method: "POST", body: {
    operationId: "synthetic-role-denied", versionId, edits: [{ operation: "setRoleMemberships", expected: beforeDenied, value: [] }],
  } });
  assert.equal(denied.status, 403);
  assert.deepEqual((await stored()).membership, beforeDenied);
  // A real publisher may explicitly change their own authority. Contacts can
  // commit that change before Deploy's bookkeeping revalidation loses access.
  const beforePromotion = (await f.request(f.admin, "contacts", "/staff/" + scenario.staff[0])).body.data;
  await f.call(f.admin, "contacts", "/staff/" + scenario.staff[0] + "/accept", {
    operationId: "synthetic-role-publisher-eo", field: "eo", value: true,
    revision: beforePromotion.fields.eo.revision, ownerReviewReference: "Synthetic owner review",
  });
  await readPage.reload();
  await readPage.getByRole("button", { name: "Versions", exact: true }).click();
  await readPage.locator('[data-version-row="' + versionId + '"] [data-version-action="publish"]').click();
  const publish = readPage.locator("dialog[data-publication-dialog]");
  assert.match(await publish.innerText(), /including your own/);
  await publish.getByRole("button", { name: "Publish saved revision", exact: true }).click();
  const recoveryNotice = readPage.locator("[data-publication-recovery]");
  try { await recoveryNotice.waitFor(); }
  catch (error) { throw Error(error.message + "\nPublish UI: " + await readPage.locator("body").innerText() + "\nBatches: " + JSON.stringify(f.requests.filter(request => /memberships\/sync|publish/.test(request.url)))); }
  assert.match(await recoveryNotice.innerText(), /another authorised publisher/);
  assert.doesNotMatch(await recoveryNotice.innerText(), /Synthetic Teacher|Synthetic custom/);
  assert.equal(await readPage.locator("#content table").count(), 0, "permission loss clears protected planning data");
  assert.equal(await readPage.getByRole("button", { name: "Continue Memberships update", exact: true }).count(), 0);
  const batches = f.requests.filter(request => request.url.endsWith("/memberships/sync"));
  assert.equal(batches.length, 1, "self-demotion stops the automatic sync loop");
  const response = JSON.parse(batches[0].body).data;
  assert.equal(response.saved, false); assert.equal(response.publicationCommitted, true);
  assert.equal(response.receiptRecorded, false); assert.equal(response.terminalReceipt.state, "terminal-not-committed");
  const demoted = (await f.request(f.admin, "contacts", "/staff/" + scenario.staff[0])).body.data;
  assert.equal(demoted.fields.smc.value, false);
  assert.equal(demoted.fields.eo.value, true);
  assert.equal(await readPage.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith("gsis-memberships-sync:")).length), 0,
    "only the proved terminal batch retires its stored request");
  const recovered = await f.call(f.admin, "deploy", "/memberships/sync", {
    ...batches[0].input, operationId: "synthetic-role-admin-recovery",
  });
  assert.equal(recovered.currentProgress.state, "applied");
  assert.equal((await f.request(f.admin, "contacts", "/staff/" + scenario.staff[0])).body.data.fields.smc.revision,
    demoted.fields.smc.revision, "another authorised operator recovers without repeating authority writes");
  assert.deepEqual(errors, []);
  console.log("PASS built role matrix on empty school, edit/delete/checkbox/EO save and reload, Core filter/sort, canonical download/import and real v0.9 Excel preview/apply, foreign/formula rejection, explicit groups without grade inference, custom memberships, read-only authority, self-demotion Publish with protected-state clearing and Admin recovery; real Workers/D1, synthetic data only (" + (Date.now() - started) + "ms)");
} finally { await f.close(); xml.window.close(); }
