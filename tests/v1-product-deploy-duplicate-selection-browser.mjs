import assert from "node:assert/strict";
import {
  fixture,
  seedScenario,
  schoolId,
} from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

const f = await fixture();
try {
  const s = await seedScenario(f),
    db = await f.db("deploy");
  const sources = [];
  for (const letter of ["A", "B"]) {
    const made = await f.call(f.admin, "deploy", "/versions/create", {
      operationId: "synthetic-radio-source-" + letter,
      name: "Synthetic source " + letter,
      year: Number(s.date.slice(0, 4)),
    });
    const loaded = await loadVersion(db, schoolId, made.versionId);
    const doc = structuredClone(loaded.doc);
    doc.classes = [
      {
        ref: "synthetic-class-" + letter,
        name: "Synthetic " + letter,
        shortName: "1" + letter,
        level: "1",
      },
    ];
    doc.assignments = [
      {
        id: "synthetic-assignment-" + letter,
        target: "1" + letter,
        targetRef: "synthetic-class-" + letter,
        subject: "EL",
        teacher: s.staff[0],
      },
    ];
    doc.teacherNotes[s.staff[0]] = "Synthetic notes from " + letter;
    const delta = changesFor(schoolId, made.versionId, loaded.rows, doc);
    await db.batch(delta.writes.map((w) => statement(db, w.sql, w.args)));
    sources.push({
      id: made.versionId,
      doc: (await loadVersion(db, schoolId, made.versionId)).doc,
    });
  }
  const [a, b] = sources;
  const page = await f.pageFor();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const prompts = [],
    alerts = [];
  let answer = null;
  page.on("dialog", async (d) => {
    if (d.type() === "prompt") {
      prompts.push({ message: d.message(), value: d.defaultValue() });
      if (answer === null) await d.dismiss();
      else await d.accept(answer);
    } else {
      alerts.push(d.message());
      await d.dismiss();
    }
  });
  await page.goto(origin + "/deploy/");
  await page.waitForFunction(
    () => document.querySelector("#version")?.options.length === 2,
  );
  if ((await page.locator("#version").inputValue()) !== a.id) {
    await page.locator("#version").selectOption(a.id);
    await page.waitForFunction((id) => current === id && !busy, a.id);
  }
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  const radios = () =>
    page.locator('input[type="radio"][name="gsis-duplicate-source"]');
  const choice = (id) =>
    page.locator(`input[name="gsis-duplicate-source"][value="${id}"]`);
  const selected = () =>
    page.locator('input[name="gsis-duplicate-source"]:checked').inputValue();
  const duplicate = () =>
    page.getByRole("button", { name: "Duplicate", exact: true });
  assert.equal(
    await radios().count(),
    2,
    "Versions must offer a stable-ID source radio for each version",
  );
  assert.equal(await selected(), a.id, "first default is the loaded version");
  const writesBeforeChoice = f.requests.filter(
    (r) => r.input?.operation === "create",
  ).length;
  await choice(b.id).check();
  assert.equal(await selected(), b.id);
  assert.equal(
    await page.locator("#version").inputValue(),
    a.id,
    "selection never loads its source",
  );
  assert.equal(
    f.requests.filter((r) => r.input?.operation === "create").length,
    writesBeforeChoice,
  );
  assert.match(
    await page.locator("[data-duplicate-source-hint]").innerText(),
    /Synthetic source B/,
  );
  assert.match(await duplicate().getAttribute("title"), /Synthetic source B/);
  await page.evaluate(
    ({ a, b }) => {
      state.versions.find((x) => x.id === a).name = state.versions.find(
        (x) => x.id === b,
      ).name;
      render();
    },
    { a: a.id, b: b.id },
  );
  await choice(a.id).check();
  assert.equal(
    await selected(),
    a.id,
    "equal names remain distinct source identities",
  );
  await choice(b.id).check();
  await page.evaluate((id) => {
    state.versions.find((x) => x.id === id).name = "Synthetic source A";
    render();
  }, a.id);
  assert.equal(await selected(), b.id);
  console.log(
    "PASS independent accessible stable-ID selection and unchanged loaded version",
  );

  const versionHeader = page
    .locator('#content button[title="Sort by Version"]')
    .first();
  await versionHeader.click();
  assert.equal(await selected(), b.id);
  const filter = page.locator('#content input[placeholder="Filter…"]').nth(1);
  await filter.fill("Synthetic source A");
  await page.waitForFunction(
    (id) => document.querySelector(`[data-version-row="${id}"]`)?.hidden,
    b.id,
  );
  assert.equal(
    await selected(),
    b.id,
    "hiding a selected row is not deleting the source",
  );
  await duplicate().click();
  assert.match(prompts.at(-1).message, /Synthetic source B/);
  assert.equal(prompts.at(-1).value, "Synthetic source B (copy)");
  assert.equal(
    f.requests.filter((r) => r.input?.operation === "create").length,
    writesBeforeChoice,
    "cancel sends no creation",
  );
  await page.evaluate(() => render());
  assert.equal(await selected(), b.id, "redraw preserves explicit selection");
  await page.evaluate(() => render(true));
  assert.equal(
    await selected(),
    b.id,
    "incremental refresh preserves selection and live handlers",
  );
  await choice(a.id).check();
  assert.match(
    await page.locator("[data-duplicate-source-hint]").innerText(),
    /Synthetic source A/,
  );
  await choice(b.id).check();
  await page
    .getByRole("button", { name: "IP Deploy", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  assert.equal(await selected(), b.id);
  assert.equal(await page.locator("#version").inputValue(), a.id);
  console.log(
    "PASS sort/filter/redraw/navigation preserve selection; prompt cancel is read-only",
  );

  // Removing a source from the current authorised catalogue must never choose A.
  await page.evaluate((id) => {
    window.syntheticRemovedSource = state.versions.find((x) => x.id === id);
    state.versions = state.versions.filter((x) => x.id !== id);
    render();
  }, b.id);
  assert.equal(
    await page.locator('input[name="gsis-duplicate-source"]:checked').count(),
    0,
  );
  assert.equal(await duplicate().isDisabled(), true);
  await page.evaluate(() => {
    state.versions.push(window.syntheticRemovedSource);
    delete window.syntheticRemovedSource;
    render();
  });
  assert.equal(
    await duplicate().isDisabled(),
    true,
    "restoring the row is not consent to select it",
  );
  await choice(b.id).check();
  await page.evaluate(() => {
    unsavedDraft = true;
  });
  const promptCount = prompts.length;
  await duplicate().click();
  assert.equal(
    prompts.length,
    promptCount,
    "native unsaved-input guard runs before prompting",
  );
  await page.evaluate(() => {
    unsavedDraft = false;
  });
  console.log(
    "PASS removed choice has no fallback; native unsaved-input guard remains",
  );

  answer = "Synthetic selected B copy";
  let lostBody, committedId;
  await page.route("**/api/deploy/change", async (route) => {
    const body = route.request().postDataJSON();
    if (body.operation !== "create" || lostBody) return route.fallback();
    lostBody = body;
    const response = await f.mf.dispatchFetch(route.request().url(), {
      method: "POST",
      headers: await route.request().allHeaders(),
      body: route.request().postDataBuffer(),
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    committedId = result.data.versionId;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: "Synthetic response lost after commit",
      }),
    });
  });
  await duplicate().click();
  await page.waitForFunction(() => !!versionCreateAttempt && !busy);
  assert.equal(lostBody.sourceVersionId, b.id);
  assert.equal(lostBody.duplicate, true);
  const retained = await page.evaluate(() =>
    structuredClone(versionCreateAttempt),
  );
  assert.equal(retained.requestId, lostBody.requestId);
  assert.equal(
    await radios().evaluateAll((nodes) => nodes.every((node) => node.disabled)),
    true,
  );
  await choice(a.id).evaluate((node) => {
    node.checked = true;
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assert.equal(
    await selected(),
    b.id,
    "even a late selection event cannot alter a pending source",
  );
  assert.deepEqual(
    await page.evaluate(() => structuredClone(versionCreateAttempt)),
    retained,
  );
  await page.evaluate(() => render());
  assert.equal(await selected(), b.id);
  assert.equal(
    await radios().evaluateAll((nodes) => nodes.every((node) => node.disabled)),
    true,
  );
  assert.equal(await page.locator("#version").inputValue(), a.id);
  await duplicate().click();
  await page.waitForFunction(
    (id) => document.querySelector("#version")?.value === id && !busy,
    committedId,
  );
  assert.equal(
    prompts.length,
    promptCount + 1,
    "retry never asks for a new name/source",
  );
  const retry = f.requests.find(
    (r) => r.input?.requestId === retained.requestId && r.status === 200,
  );
  assert(retry, "the exact original request reaches the real owner on retry");
  assert.deepEqual(retry.input, lostBody);
  const copied = (await loadVersion(db, schoolId, committedId)).doc;
  assert.deepEqual(copied.assignments, b.doc.assignments);
  assert.deepEqual(copied.teacherNotes, b.doc.teacherNotes);
  assert.notDeepEqual(copied.assignments, a.doc.assignments);
  for (const source of sources)
    assert.deepEqual(
      (await loadVersion(db, schoolId, source.id)).doc,
      source.doc,
    );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM deploy_versions WHERE school_id=?")
        .bind(schoolId)
        .first()
    ).n,
    3,
  );
  assert.deepEqual(pageErrors, []);
  assert.equal(
    await selected(),
    b.id,
    "loading the newly created copy does not change explicit source",
  );
  console.log(
    "PASS lost committed response locks source/request; exact retry creates one B copy and preserves both sources",
  );

  answer = "Synthetic new planning version";
  await page
    .getByRole("button", { name: "New planning version", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("#version")
        ?.selectedOptions[0]?.textContent.includes(
          "Synthetic new planning version",
        ) && !busy,
  );
  assert.equal(prompts.at(-1).message, "New planning version name");
  assert.equal(prompts.at(-1).value, "");
  const newPlanning = f.requests.find(
    (r) => r.input?.name === answer && r.status === 200,
  );
  assert.equal(newPlanning.input.duplicate, false);
  assert.equal(
    newPlanning.input.sourceVersionId,
    committedId,
    "native new-version request still uses the loaded version",
  );
  assert.equal(await selected(), b.id);
  console.log(
    "PASS native New planning version prompt/request remains unchanged",
  );

  // Hold a real background read. Note Save must communicate the existing
  // native guard instead of accepting a click which silently does nothing.
  const noteRow = page.locator('[data-version-row="' + committedId + '"]');
  let releaseRead, signalRead;
  const readReached = new Promise((resolve) => {
    signalRead = resolve;
  });
  const readRelease = new Promise((resolve) => {
    releaseRead = resolve;
  });
  let heldRead = false;
  await page.route("**/api/deploy/sync", async (route) => {
    if (heldRead) return route.fallback();
    heldRead = true;
    const response = await f.mf.dispatchFetch(route.request().url(), {
      method: "POST",
      headers: await route.request().allHeaders(),
      body: route.request().postDataBuffer(),
    });
    const body = Buffer.from(await response.arrayBuffer());
    signalRead();
    await readRelease;
    const headers = Object.fromEntries(response.headers);
    delete headers["transfer-encoding"];
    await route.fulfill({ status: response.status, headers, body });
  });
  await page.waitForFunction(() => !refreshing);
  await page.evaluate(() => {
    snapshotCache = null;
    void refresh(false);
  });
  await readReached;
  await noteRow
    .locator("[data-note-input]")
    .fill("Synthetic retained note after read");
  try {
    assert.equal(
      await noteRow.locator("[data-note-save]").isDisabled(),
      true,
      "Save note must be disabled while the native refresh guard refuses it",
    );
    const state = await page.evaluate(
      (id) => ({
        value: versionNoteDrafts.get(id).value,
        attempt: versionNoteDrafts.get(id).attempt,
      }),
      committedId,
    );
    assert.deepEqual(state, {
      value: "Synthetic retained note after read",
      attempt: null,
    });
    assert.equal(
      f.requests.filter((r) => r.input?.operation === "saveVersionNote").length,
      0,
    );
  } finally {
    releaseRead();
  }
  await page.waitForFunction(() => !refreshing);
  await noteRow.locator("[data-note-save]").click();
  await page.waitForFunction(
    (id) =>
      !versionNoteDrafts.get(id)?.saving &&
      !versionNoteDrafts.get(id)?.attempt &&
      versionNoteDrafts.get(id)?.expected ===
        "Synthetic retained note after read",
    committedId,
  );
  const noteWrites = f.requests.filter(
    (r) => r.input?.operation === "saveVersionNote",
  );
  assert.equal(
    noteWrites.length,
    1,
    "the released original note action sends one owner save",
  );
  assert.equal(noteWrites[0].input.versionId, committedId);
  assert.equal(
    (await loadVersion(db, schoolId, committedId)).doc.notes,
    "Synthetic retained note after read",
  );
  assert.equal(
    await selected(),
    b.id,
    "read/note readiness does not alter Duplicate selection",
  );
  console.log(
    "PASS held refresh disables note Save without losing text; release enables one native save",
  );

  // Automatic refresh must not disable Save halfway through a real pointer
  // click on an unresolved note. An explicit foreground refresh still works.
  const pointerVersionId = await page.evaluate(() => current);
  const pointerNoteRow = page.locator(
    '[data-version-row="' + pointerVersionId + '"]',
  );
  await pointerNoteRow
    .locator("[data-note-input]")
    .fill("Synthetic pointer-safe note");
  await page.evaluate(() => refresh(true));
  assert.equal(
    await pointerNoteRow.locator("[data-note-input]").inputValue(),
    "Synthetic pointer-safe note",
  );
  assert.equal(
    f.requests.filter((r) => r.input?.operation === "saveVersionNote").length,
    1,
    "explicit refresh does not save the draft",
  );
  let releasePointerRead;
  const pointerReadRelease = new Promise((resolve) => {
    releasePointerRead = resolve;
  });
  let pointerReads = 0;
  await page.route("**/api/deploy/{sync,delta}", async (route) => {
    pointerReads++;
    await pointerReadRelease;
    await route.fallback();
  });
  await page.evaluate(() => {
    window.__syntheticNotePointer = null;
    window.__syntheticNoteClick = false;
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!event.target.matches("[data-note-save]")) return;
        window.__syntheticNotePointer = {
          refreshing,
          busy,
          editing: !!editing,
          acquiring,
          queue: !!queueFlight,
          direct: !!v1DirectSave,
          otherSaving: noteSaving(),
          unresolved: notesUnresolved(),
        };
        window.__syntheticNoteRead = refresh(false);
      },
      { once: true, capture: true },
    );
    document.addEventListener(
      "click",
      (event) => {
        if (event.target.matches("[data-note-save]"))
          window.__syntheticNoteClick = true;
      },
      { once: true, capture: true },
    );
  });
  try {
    await pointerNoteRow.locator("[data-note-save]").click();
    const state = await page.evaluate(() => ({
      pointer: window.__syntheticNotePointer,
      clicked: window.__syntheticNoteClick,
    }));
    assert.deepEqual(state.pointer, {
      refreshing: false,
      busy: false,
      editing: false,
      acquiring: false,
      queue: false,
      direct: false,
      otherSaving: false,
      unresolved: true,
    });
    assert.equal(
      state.clicked,
      true,
      "an automatic read must not swallow the original Save click",
    );
    assert.equal(pointerReads, 0, "an unresolved note defers automatic reads");
  } finally {
    releasePointerRead();
  }
  await page.evaluate(() => window.__syntheticNoteRead);
  await page.waitForFunction(
    (id) =>
      !versionNoteDrafts.get(id)?.saving &&
      !versionNoteDrafts.get(id)?.attempt &&
      versionNoteDrafts.get(id)?.expected === "Synthetic pointer-safe note",
    pointerVersionId,
  );
  assert.equal(
    f.requests.filter((r) => r.input?.operation === "saveVersionNote").length,
    2,
    "one original note click adds one owner save",
  );
  assert.equal(
    (await loadVersion(db, schoolId, pointerVersionId)).doc.notes,
    "Synthetic pointer-safe note",
  );
  assert.equal(await selected(), b.id);
  console.log(
    "PASS dirty note defers pointer-time automatic refresh; explicit refresh and one native save remain available",
  );

  // A protected-state boundary removes the old account's choice. The real
  // session/owner permission denial remains independently enforced by Core.
  await page.evaluate(() =>
    window.dispatchEvent(new Event("gsis:clear-protected-state")),
  );
  assert.equal(
    await radios().evaluateAll((nodes) =>
      nodes.every((node) => node.disabled && !node.checked),
    ),
    true,
  );
  assert.equal(await duplicate().isDisabled(), true);
  const reader = await f.seedAccount("synthetic-radio-reader", {
    staffId: s.staff[1],
    capabilities: [],
  });
  const denied = await f.request(reader, "deploy", "/versions/create", {
    method: "POST",
    body: {
      operationId: "synthetic-denied-radio-copy",
      sourceVersionId: b.id,
      duplicate: true,
      name: "Not permitted",
    },
  });
  assert.equal(denied.status, 403);
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM deploy_versions WHERE school_id=?")
        .bind(schoolId)
        .first()
    ).n,
    4,
  );
  console.log(
    "PASS protected-state reset and actual Core denial; no unauthorised copy",
  );
} finally {
  await f.close();
}
