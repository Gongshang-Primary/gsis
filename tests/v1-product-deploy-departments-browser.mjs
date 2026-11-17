import assert from "node:assert/strict";
import { fixture, schoolId, seedScenario } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

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

  // Moving departments is an explicit draft action; Cancel also retains an
  // unrelated edit that was already waiting in the normal save queue.
  await page.evaluate(id => queueCell({ operation: "setTeacherNote", teacher: id,
    expected: v().teacherNotes?.[id] || "", value: "Synthetic retained department draft" }), staff[1]);
  const pendingBeforeMove = await page.evaluate(() => structuredClone(queuedEdits()));
  const beforeMove = structuredClone(await stored());
  const chooseBeta = () => page.locator(`select[data-group="${beta.id}"][data-slot="0"]`)
    .selectOption(staff[0], { force: true });
  await chooseBeta();
  const moveDialog = page.locator("dialog[data-department-move]");
  assert.equal(await moveDialog.count(), 1, "Selecting a second department must offer a confirmed move");
  assert.match(await moveDialog.innerText(), /Synthetic renamed department/);
  assert.match(await moveDialog.innerText(), /Synthetic Department Beta/);
  assert.match(await moveDialog.innerText(), /Deputy/);
  await moveDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => structuredClone(queuedEdits())), pendingBeforeMove);
  assert.deepEqual(await stored(), beforeMove, "Cancel does not write or clear existing membership");

  await chooseBeta();
  const writesBeforeConfirm = f.requests.filter(r => r.url.endsWith("/api/deploy/change")).length;
  await page.locator("dialog[data-department-move]")
    .getByRole("button", { name: "Move to this department", exact: true }).click();
  assert.equal(f.requests.filter(r => r.url.endsWith("/api/deploy/change")).length, writesBeforeConfirm,
    "Confirmation stages the existing draft; explicit Save still owns the write");
  assert.deepEqual(await stored(), beforeMove);
  // A later ordinary Dept edit coalesces into the same intent without dropping
  // the move's original full-graph comparison or its newly chosen destination.
  await settings();
  await page.locator(`[data-group-name="${alpha}"]`).fill("Synthetic moved source department");
  await page.locator(`[data-group-name="${alpha}"]`).blur();
  await save();
  const moved = await stored();
  assert.equal(moved.organisations.dept[0].name, "Synthetic moved source department");
  assert.equal(moved.organisations.dept[1].slots[0], staff[0]);
  assert(!moved.organisations.dept[0].slots.includes(staff[0]));
  assert(!moved.organisations.dept[0].additionalDeputies.includes(staff[0]));
  assert.equal(moved.organisations.dept[0].slots[1], staff[1]);
  assert.equal(moved.teacherNotes[staff[1]], "Synthetic retained department draft");
  const moveWire = f.requests.filter(r => r.url.endsWith("/api/deploy/change") &&
    r.input?.edits?.some(edit => edit.operation === "setOrganisation" && edit.kind === "dept")).at(-1);
  assert(moveWire, "A confirmed move carries the full expected Dept graph through the native owner");
  assert.deepEqual(moveWire.input.edits.find(edit => edit.kind === "dept").expected,
    beforeMove.organisations.dept);

  // An ordinary in-department role change was already exercised above. Moving
  // back remains explicit and preserves the other deputy and fixed role holes.
  await page.getByRole("button", { name: "Dept", exact: true }).first().click();
  await openDeputies();
  const beforeReturn = await page.evaluate(() => structuredClone(queuedEdits()));
  await page.locator(`input[data-group="${alpha}"][data-group-role-choice="deputy"][value="${staff[0]}"]`).click();
  assert.deepEqual(await page.evaluate(() => structuredClone(queuedEdits())), beforeReturn,
    "The checkbox remains a proposal until the move is confirmed");
  await page.locator("dialog[data-department-move]")
    .getByRole("button", { name: "Move to this department", exact: true }).click();
  await save();
  assert.deepEqual((await stored()).organisations.dept[0].additionalDeputies, [staff[0]]);
  assert.deepEqual((await stored()).organisations.dept[1], beta);
  const returnWire = f.requests.filter(r => r.url.endsWith("/api/deploy/change") &&
    r.input?.edits?.some(edit => edit.operation === "setOrganisation" && edit.kind === "dept")).at(-1);
  assert.deepEqual(returnWire.input.edits.find(edit => edit.kind === "dept").expected,
    moved.organisations.dept, "Each subsequent confirmed move captures its own saved full-graph baseline");

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

  // Synthetic pre-existing multi-Dept history can be repaired without turning
  // an inactive teacher back into a new selectable assignment. The retained
  // destination is a Member, so this does not rely on the old TL exception.
  const historical = await loadVersion(db, schoolId, versionId), legacy = structuredClone(historical.doc);
  legacy.teacherDrafts[staff[0]] = { Active: "N" };
  legacy.organisations.dept = [beta,
    { id: "synthetic-legacy-dept-a", name: "Synthetic legacy A", slots: [staff[0], ""] },
    { id: "synthetic-legacy-dept-b", name: "Synthetic legacy B", slots: ["", "", staff[0]] },
  ];
  const seeded = changesFor(schoolId, versionId, historical.rows, legacy);
  await db.batch(seeded.writes.map(change => statement(db, change.sql, change.args)));
  const historyBeforeOpen = structuredClone(await stored());
  const requestsBeforeOpen = f.requests.filter(r => r.url.endsWith("/api/deploy/change")).length;
  await page.reload();
  await page.getByRole("button", { name: "Dept", exact: true }).first().click();
  assert.equal(f.requests.filter(r => r.url.endsWith("/api/deploy/change")).length, requestsBeforeOpen);
  assert.deepEqual(await stored(), historyBeforeOpen, "Opening retained multi-Dept history cannot repair it implicitly");
  const review = page.locator("[data-department-review]");
  assert.match(await review.innerText(), /several departments/);
  assert.equal(await page.locator(`select[data-group="${beta.id}"][data-slot="0"] option[value="${staff[0]}"]`).count(), 0,
    "Inactive historical teachers remain excluded from new assignment choices");
  await review.getByRole("button", { name: "Move to Synthetic legacy B", exact: true }).click();
  await page.locator("dialog[data-department-move]")
    .getByRole("button", { name: "Move to this department", exact: true }).click();
  assert.deepEqual(await stored(), historyBeforeOpen, "Historical repair also waits for explicit Save");
  await save();
  const repaired = await stored();
  assert.deepEqual(repaired.organisations.dept[1].slots, ["", ""]);
  assert.deepEqual(repaired.organisations.dept[2].slots, ["", "", staff[0]]);
  assert.equal(repaired.teacherDrafts[staff[0]].Active, "N");
  assert.equal(await page.locator("[data-department-review]").count(), 0);
  assert.equal(repaired.organisations.comm.length, 1);
  assert.deepEqual(errors, []);
  assert(f.external.every(url => url === "https://accounts.google.com/gsi/client"), "All external requests are intercepted and aborted by the fixture");
  console.log("PASS built browser/Worker/D1: department add/cancel/save/reload, explicit moves/CAS/coalescing, retained inactive repair, stable rename, Head/multiple Deputies, delete/unassigned and no phantom committee defaults");
} catch (error) {
  console.error(JSON.stringify({ dialogs, errors,
    queue: page && await page.evaluate(() => ({ edits: queuedEdits(), flight: !!queueFlight, error: queueError, form: document.querySelector('#formerror')?.textContent })).catch(() => null),
    failures: f.requests.filter(r => r.status >= 400).map(r => ({ url: r.url, status: r.status, body: r.body.slice(0, 1500) })),
  }));
  throw error;
} finally { await f.close(); }
