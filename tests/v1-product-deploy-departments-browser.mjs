import assert from "node:assert/strict";
import { fixture, schoolId, seedScenario } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { loadVersion } from "../v1/services/deploy/service.mjs";

const f = await fixture();
let page;
const dialogs = [], errors = [];
try {
  const { staff } = await seedScenario(f);
  const { versionId } = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-departments-create", name: "Synthetic departments", year: 2026,
  });
  page = await f.pageFor();
  page.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + "/deploy/");
  const settings = async () => {
    await page.getByRole("button", { name: "Program Settings", exact: true }).click();
    await page.getByRole("button", { name: "Dept", exact: true }).last().click();
  };
  const save = async () => {
    await page.locator("#saveQueue").getByRole("button", { name: "Save to online", exact: true }).click();
    await page.waitForFunction(() => !queuedEdits().length && !queueFlight);
  };
  const add = async (name, apply = true) => {
    await page.getByRole("button", { name: "Add department", exact: true }).click();
    await page.locator("#groupName").fill(name);
    await page.getByRole("button", { name: apply ? "Apply to draft" : "Cancel", exact: true }).click();
  };
  await settings();
  await add("Synthetic Department Alpha");
  await add("Synthetic Department Beta");
  await add("Synthetic cancelled department", false);
  await page.waitForFunction(() => queuedEdits().length === 1 && !inlineDraftEditor?.open);
  await save();
  const db = await f.db("deploy");
  const stored = async () => (await loadVersion(db, schoolId, versionId)).doc;
  const saved = (await stored()).organisations.dept;
  assert.equal(saved.length, 2);
  assert.equal(saved[0].name, "Synthetic Department Alpha");
  await page.reload();
  await settings();
  assert.deepEqual(await page.locator("[data-group-name]").evaluateAll(inputs => inputs.map(i => i.value)),
    ["Synthetic Department Alpha", "Synthetic Department Beta"]);
  const alpha = saved[0].id, beta = structuredClone(saved[1]);
  const openDeputies = async () => {
    const picker = page.locator(`details[data-group="${alpha}"][data-group-role="deputy"]`);
    if (!(await picker.evaluate(element => element.open))) await picker.locator("summary").click();
  };
  await page.getByRole("button", { name: "Dept", exact: true }).first().click();
  await page.locator(`select[data-group="${alpha}"][data-slot="0"]`).selectOption(staff[0], { force: true });
  await openDeputies();
  await page.locator(`input[data-group="${alpha}"][data-group-role-choice="deputy"][value="${staff[1]}"]`).check();
  await save();
  assert.deepEqual((await stored()).organisations.dept[0].slots, staff);

  await settings();
  const name = page.locator(`[data-group-name="${alpha}"]`);
  await name.fill("Synthetic renamed department"); await name.blur();
  await save();
  const renamed = (await stored()).organisations.dept[0];
  assert.equal(renamed.id, alpha); assert.equal(renamed.name, "Synthetic renamed department");
  assert.deepEqual(renamed.slots, staff);
  await page.getByRole("button", { name: "Dept", exact: true }).first().click();
  await page.locator(`select[data-group="${alpha}"][data-slot="0"]`).selectOption("", { force: true });
  await openDeputies();
  await page.locator(`input[data-group="${alpha}"][data-group-role-choice="deputy"][value="${staff[0]}"]`).check();
  await save();
  assert.deepEqual((await stored()).organisations.dept[0].additionalDeputies, [staff[0]]);

  await settings();
  await page.locator(`[data-group-delete="${alpha}"]`).click();
  await save();
  assert.deepEqual((await stored()).organisations.dept, [beta]);
  assert.equal((await stored()).teachers.length, 2, "Removing a department keeps its teachers");
  await page.getByRole("button", { name: "Dept", exact: true }).first().click();
  assert.match(await page.locator(".unassigned-pane").innerText(), /Unassigned\s+2/);

  // The copied v0.9 initializer must not add unsaved committees to v1 lists.
  await page.getByRole("button", { name: "Program Settings", exact: true }).click();
  await page.getByRole("button", { name: "Committee", exact: true }).click();
  assert.equal(await page.locator("[data-group-name]").count(), 0);
  await page.getByRole("button", { name: "Add committee", exact: true }).click();
  await page.locator("#groupName").fill("Synthetic committee");
  await page.getByRole("button", { name: "Apply to draft", exact: true }).click();
  await save();
  await page.reload();
  await page.getByRole("button", { name: "Program Settings", exact: true }).click();
  await page.getByRole("button", { name: "Committee", exact: true }).click();
  assert.deepEqual(await page.locator("[data-group-name]").evaluateAll(inputs => inputs.map(i => i.value)), ["Synthetic committee"]);
  assert.equal((await stored()).organisations.comm.length, 1);
  assert.deepEqual(errors, []);
  assert(f.external.every(url => url === "https://accounts.google.com/gsi/client"), "All external requests are intercepted and aborted by the fixture");
  console.log("PASS built browser/Worker/D1: department add/cancel/save/reload, stable rename, Head/multiple Deputies, delete/unassigned and no phantom committee defaults");
} catch (error) {
  console.error(JSON.stringify({ dialogs, errors,
    queue: page && await page.evaluate(() => ({ edits: queuedEdits(), flight: !!queueFlight, error: queueError, form: document.querySelector('#formerror')?.textContent })).catch(() => null),
    failures: f.requests.filter(r => r.status >= 400).map(r => ({ url: r.url, status: r.status, body: r.body.slice(0, 1500) })),
  }));
  throw error;
} finally { await f.close(); }
