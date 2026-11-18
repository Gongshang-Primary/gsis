import assert from "node:assert/strict";
import { fixture, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { loadVersion } from "../v1/services/deploy/service.mjs";

const f = await fixture();
try {
  async function create(label) {
    return (await f.call(f.admin, "deploy", "/versions/create", {
      operationId: "synthetic-note-version-" + label,
      name: "Synthetic note version " + label,
      year: new Date().getFullYear(),
    })).versionId;
  }
  const a = await create("A"), b = await create("B"), db = await f.db("deploy");
  const read = (id) => loadVersion(db, schoolId, id);
  const originalA = await read(a);
  const page = await f.pageFor(), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/deploy/");
  const selector = page.locator("#version");
  await page.waitForFunction(() => document.querySelector("#version")?.options.length === 2 && !busy && !refreshing);
  if (await selector.inputValue() !== a) await selector.selectOption(a);
  await page.waitForFunction((id) => current === id && !busy && !refreshing, a);
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  const row = page.locator(`[data-version-row="${b}"]`);
  const note = row.locator("[data-note-input]");
  const save = row.locator("[data-note-save]");
  async function clickSave(value) {
    await page.waitForFunction(() => !refreshing && !busy);
    const [response] = await Promise.all([
      page.waitForResponse((response) => {
        if (!response.url().endsWith("/api/deploy/change")) return false;
        const input = response.request().postDataJSON();
        return input?.operation === "saveVersionNote" && input.versionId === b && input.notes === value;
      }),
      save.click(),
    ]);
    await page.waitForFunction((id) => !versionNoteDrafts.get(id)?.saving, b);
    const input = response.request().postDataJSON();
    const body = JSON.parse(f.requests.findLast(r => r.input?.operationId === input.operationId).body);
    return { status: response.status(), input, body };
  }
  async function refreshA() {
    const [response] = await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith("/api/deploy/sync") &&
        response.request().postDataJSON()?.versionId === a),
      page.locator("#refresh").click(),
    ]);
    assert.equal(response.status(), 200);
    await page.waitForFunction((id) => current === id && !refreshing, a);
    assert.equal(await selector.inputValue(), a);
    return JSON.parse(f.requests.findLast(r =>
      r.url.endsWith("/api/deploy/sync") && r.input?.versionId === a).body).data;
  }
  const verifySave = (result, revision, expected) => {
    assert.equal(result.status, 200,
      `Version B save sent revision ${result.input.revision}, expected ${revision}. ${JSON.stringify(result.body)}`);
    assert.equal(result.input.revision, revision);
    assert.equal(result.input.expected, expected);
  };
  const first = "Synthetic first note", second = "Synthetic second note",
    third = "Synthetic third note", draft = "Synthetic unsaved local note",
    competing = "Synthetic newer note from a second editor";
  const before = await read(b);
  await note.fill(first);
  const savedFirst = await clickSave(first);
  verifySave(savedFirst, before.version.revision, before.doc.notes || "");
  const savedB = await read(b);
  assert.equal(savedB.doc.notes, first);
  const refreshed = (await refreshA()).versions.find(version => version.id === b);
  assert.equal(refreshed.revision, savedB.version.revision);
  await note.fill(second);
  const savedSecond = await clickSave(second);
  verifySave(savedSecond, savedB.version.revision, first);
  assert.notEqual(savedSecond.input.operationId, savedFirst.input.operationId);
  assert.equal(refreshed.notes, first, "Refresh returns B's saved note and revision together");
  assert.equal((await read(b)).doc.notes, second);
  console.log("PASS Version B saves twice around Refresh while A remains loaded");

  const afterSecond = await read(b);
  const confirmedNote = f.requests.findLast(r =>
    r.url.endsWith("/api/deploy/versionNote") && r.input?.versionId === b);
  assert.deepEqual(JSON.parse(confirmedNote.body).data, {
    versionId: b, notes: second, revision: afterSecond.version.revision,
  });
  await note.fill(third);
  verifySave(await clickSave(third), afterSecond.version.revision, second);
  const afterThird = await read(b);
  assert.equal(afterThird.doc.notes, third);
  assert.equal(await selector.inputValue(), a);
  console.log("PASS the confirmed note read supplies B's revision for the next save without Refresh");

  await note.fill(draft);
  const lease = await f.call(f.other, "deploy", "/lease", {
    operationId: "synthetic-competing-note-lease", versionId: b,
    scope: "meta", clientId: "synthetic-other-editor",
  });
  await f.call(f.other, "deploy", "/change", {
    operationId: "synthetic-competing-note-save", versionId: b, operation: "saveVersionNote",
    scope: "meta", clientId: "synthetic-other-editor", leaseFence: lease.fence,
    revision: afterThird.version.revision, expected: third, notes: competing,
  });
  const newer = (await refreshA()).versions.find(version => version.id === b);
  assert.equal(newer.notes, competing);
  assert.equal(await note.inputValue(), draft);
  const conflict = await clickSave(draft);
  assert.equal(conflict.input.revision, newer.revision);
  assert.equal(conflict.input.expected, third);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, "REVISION_CONFLICT");
  assert.equal((await read(b)).doc.notes, competing);
  assert.equal(await note.inputValue(), draft);
  assert.equal(await row.getByRole("button", { name: "Check original note" }).isVisible(), true);
  assert.deepEqual((await read(a)).doc, originalA.doc);
  assert.deepEqual(errors, []);
  console.log("PASS a genuinely changed note still conflicts and retains the local draft");
} finally {
  await f.close();
}
