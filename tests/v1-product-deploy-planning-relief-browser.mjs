import assert from "node:assert/strict";
import { fixture, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

const started = Date.now();
const f = await fixture();
try {
  const people = await f.call(f.admin, "contacts", "/save-data", {
    operationId: "planning-relief-staff",
    changes: [],
    additions: ["A", "B"].map((letter) => ({
      id: "planning-" + letter,
      values: {
        "Basic Name": "Synthetic planning " + letter,
        "Statutory Name": "Synthetic planning " + letter,
        Active: "Y",
        "School Section": "Primary",
        "Employment Arrangement": "Full-time",
        "Appointment Status": "Confirmed",
      },
    })),
  });
  const staff = ["A", "B"].map(
    (letter) => people.mapping["planning-" + letter],
  );
  const { versionId } = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "planning-relief-version",
    name: "Synthetic planning relief",
    year: 2027,
  });
  const db = await f.db("deploy");
  const loaded = await loadVersion(db, schoolId, versionId);
  const doc = structuredClone(loaded.doc);
  doc.classes = [
    {
      ref: "planning-class",
      name: "Synthetic class",
      shortName: "A",
      level: "1",
    },
  ];
  doc.groups = [];
  doc.loads = { 1: { Assembly: 0, FTGP: 0, FTT: 0, EL: 6, Math: 36 } };
  doc.assignments = ["EL", "Math"].map((subject, index) => ({
    id: "planning-assignment-" + index,
    teacher: staff[index],
    target: "1A",
    targetRef: "planning-class",
    level: "1",
    subject,
  }));
  doc.organisations = { dept: [], comm: [], cca: [], plt: [], events: [] };
  doc.duties = [];
  const delta = changesFor(schoolId, versionId, loaded.rows, doc);
  await db.batch(
    delta.writes.map((write) => statement(db, write.sql, write.args)),
  );
  const before = await loadVersion(db, schoolId, versionId);
  const contactsDb = await f.db("contacts");
  const contactFields = async () =>
    (
      await contactsDb
        .prepare(
          "SELECT * FROM contacts_fields WHERE school_id=? ORDER BY staff_id,field",
        )
        .bind(schoolId)
        .all()
    ).results;
  const fieldsBefore = await contactFields();
  const bootstrap = (id) =>
    f.call(f.admin, "deploy", "/bootstrap", { versionId: id });
  const initial = (await bootstrap(versionId)).current;
  assert.ok(
    initial.planningReliefResults,
    "bootstrap must expose a separate saved-version Planning R estimate",
  );
  assert.equal(initial.planningReliefResults.versionId, versionId);
  assert.equal(initial.planningReliefResults.revision, before.version.revision);
  const quotaRows = (projection) =>
    staff.map((id) => projection.teachers.find((row) => row.teacherId === id));
  assert.deepEqual(
    quotaRows(initial.planningReliefResults).map((row) => row.R),
    [47, 0],
  );
  assert.deepEqual(
    quotaRows(initial.reliefResults).map((row) => row.R),
    [null, null],
  );
  for (const teacher of initial.teachers) {
    assert.equal(teacher.authority.eo.value, null);
    assert.equal(teacher.teachingEligibility.state, "unavailable");
  }
  assert.deepEqual(
    (await loadVersion(db, schoolId, versionId)).doc,
    before.doc,
  );
  assert.deepEqual(await contactFields(), fieldsBefore);
  console.log(
    "PASS separate saved-version Planning R is numeric, including zero, without accepted EO",
  );

  const { versionId: incompleteId } = await f.call(
    f.admin,
    "deploy",
    "/versions/create",
    {
      operationId: "planning-relief-incomplete-version",
      name: "Synthetic incomplete relief",
      year: 2027,
    },
  );
  const incompleteLoaded = await loadVersion(db, schoolId, incompleteId);
  const incomplete = {
    ...incompleteLoaded.doc,
    classes: structuredClone(doc.classes),
    groups: [],
    assignments: structuredClone(doc.assignments),
    organisations: structuredClone(doc.organisations),
    duties: [],
    loads: { 1: { ...doc.loads["1"], Math: null } },
  };
  const missingDelta = changesFor(
    schoolId,
    incompleteId,
    incompleteLoaded.rows,
    incomplete,
  );
  await db.batch(
    missingDelta.writes.map((write) => statement(db, write.sql, write.args)),
  );
  const missing = (await bootstrap(incompleteId)).current.planningReliefResults;
  assert.equal(missing.versionId, incompleteId);
  assert.equal(missing.revision, incompleteLoaded.version.revision);
  assert(quotaRows(missing).every((row) => row.R === null));
  assert.match(quotaRows(missing)[1].reason, /incomplete|missing/i);

  const page = await f.pageFor();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/deploy/");
  await page.waitForFunction(
    () => document.querySelector("#version")?.options.length === 2,
  );
  const go = (name) =>
    page.getByRole("button", { name, exact: true }).first().click();
  const selectVersion = async (id) => {
    await page.locator("#version").selectOption(id);
    await page.waitForFunction((id) => current === id && !refreshing, id);
    await go("Ledger");
  };
  await selectVersion(versionId);
  const ledger = async (name, planning) => {
    const header = planning
      ? page
          .locator(".workload-ledger thead th")
          .filter({ hasText: "Planning R (estimate)" })
      : page.locator(
          '.workload-ledger thead th[aria-label^="R: Deploy relief quota"]',
        );
    const index = await header.evaluate((cell) => cell.cellIndex);
    return page
      .locator(".workload-ledger tbody tr")
      .filter({ hasText: name })
      .locator("td")
      .nth(index);
  };
  const stats = (label) =>
    page
      .locator(".workload-stats-table tbody tr")
      .filter({
        has: page
          .locator("th")
          .filter({
            hasText: new RegExp(
              "^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
            ),
          }),
      })
      .locator("td")
      .first();
  assert.equal(
    await (await ledger("Synthetic planning A", true)).innerText(),
    "47",
  );
  assert.equal(
    await (await ledger("Synthetic planning B", true)).innerText(),
    "0",
  );
  assert.equal(
    await (await ledger("Synthetic planning A", false)).innerText(),
    "Unavailable",
  );
  await go("Stats");
  assert.equal(await stats("Planning R (average)").innerText(), "23.5");
  assert.equal(await stats("R (average)").innerText(), "Unavailable");
  assert.deepEqual(await contactFields(), fieldsBefore);
  assert.deepEqual(
    (await loadVersion(db, schoolId, versionId)).doc,
    before.doc,
  );
  console.log(
    "PASS Ledger and Stats distinguish numeric planning estimates from unavailable accepted R",
  );

  await selectVersion(incompleteId);
  assert.equal(
    await (await ledger("Synthetic planning B", true)).innerText(),
    "Unavailable",
  );
  await go("Stats");
  assert.equal(await stats("Planning R (average)").innerText(), "Unavailable");
  await selectVersion(versionId);
  assert.equal(
    await (await ledger("Synthetic planning A", true)).innerText(),
    "47",
  );
  for (const key of ["versionId", "revision"]) {
    await page.evaluate((key) => {
      const projection = v().planningReliefResults;
      window.syntheticPlanningProjection = structuredClone(projection);
      projection[key] =
        key === "versionId"
          ? "wrong-planning-version"
          : projection.revision + 1;
      render(true);
    }, key);
    assert.equal(
      await (await ledger("Synthetic planning A", true)).innerText(),
      "Unavailable",
    );
    await page.evaluate(() => {
      v().planningReliefResults = window.syntheticPlanningProjection;
      delete window.syntheticPlanningProjection;
      render(true);
    });
    assert.equal(
      await (await ledger("Synthetic planning A", true)).innerText(),
      "47",
    );
  }
  console.log(
    "PASS missing workload withholds estimates and version/revision mismatches cannot reuse another result",
  );

  await go("Program Settings");
  await go("Subject Load");
  const loadCell = page.locator(
    '.load-cell input[data-level="1"][data-key="EL"]',
  );
  await loadCell.fill("8");
  await loadCell.press("Tab");
  await page.waitForFunction(() => queuedEdits().length === 1);
  await go("Ledger");
  assert.equal(
    await (await ledger("Synthetic planning A", true)).innerText(),
    "Unavailable",
  );
  assert.match(
    await page.locator("#content").innerText(),
    /Save changes to update Planning R/,
  );
  await go("Stats");
  assert.equal(await stats("Planning R (average)").innerText(), "Unavailable");
  assert.match(
    await page.locator("#content").innerText(),
    /Save changes to update Planning R/,
  );
  assert.equal(
    (await loadVersion(db, schoolId, versionId)).doc.loads["1"].EL,
    6,
  );
  await page
    .locator("#saveQueue")
    .getByRole("button", { name: "Save to online", exact: true })
    .click();
  await page.waitForFunction(
    () => !queuedEdits().length && !queueFlight && !refreshing,
  );
  const saved = await loadVersion(db, schoolId, versionId);
  assert.equal(saved.doc.loads["1"].EL, 8);
  assert.equal(saved.version.revision, before.version.revision + 1);
  assert.deepEqual(saved.doc.assignments, before.doc.assignments);
  assert.equal(Object.hasOwn(saved.doc, "planningReliefResults"), false);
  assert.deepEqual(await contactFields(), fieldsBefore);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#version")?.options.length === 2,
  );
  await selectVersion(versionId);
  assert.equal(
    await (await ledger("Synthetic planning A", true)).innerText(),
    "43",
  );
  assert.equal(
    await (await ledger("Synthetic planning B", true)).innerText(),
    "0",
  );
  assert.equal(
    await (await ledger("Synthetic planning A", false)).innerText(),
    "Unavailable",
  );
  const reloaded = (await bootstrap(versionId)).current;
  assert.equal(reloaded.planningReliefResults.revision, saved.version.revision);
  assert.deepEqual(
    quotaRows(reloaded.planningReliefResults).map((row) => row.R),
    [43, 0],
  );
  console.log(
    "PASS queued workload changes withhold old estimates until native Save and reload recompute the saved revision",
  );

  await f.call(f.admin, "contacts", "/staff/" + staff[0] + "/accept", {
    operationId: "planning-relief-accept-a-eo",
    field: "eo",
    value: true,
    revision: 0,
    ownerReviewReference: "Synthetic owner review",
  });
  const accepted = (await bootstrap(versionId)).current;
  assert.deepEqual(
    quotaRows(accepted.planningReliefResults).map((row) => row.R),
    [43, 0],
  );
  assert.deepEqual(
    quotaRows(accepted.reliefResults).map((row) => row.R),
    [43, null],
  );
  assert.equal(
    accepted.teachers.find((t) => t.id === staff[0]).authority.eo.value,
    true,
  );
  assert.equal(
    accepted.teachers.find((t) => t.id === staff[1]).authority.eo.value,
    null,
  );
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#version")?.options.length === 2,
  );
  await selectVersion(versionId);
  assert.equal(
    await (await ledger("Synthetic planning A", false)).innerText(),
    "43",
  );
  assert.equal(
    await (await ledger("Synthetic planning B", false)).innerText(),
    "Unavailable",
  );
  await go("Stats");
  assert.equal(await stats("Planning R (average)").innerText(), "21.5");
  assert.equal(await stats("R (average)").innerText(), "Unavailable");
  assert.deepEqual((await loadVersion(db, schoolId, versionId)).doc, saved.doc);
  assert.deepEqual(errors, []);
  assert(
    f.external.every((url) => url.startsWith("https://accounts.google.com/")),
  );
  console.log(
    "PASS explicit Contacts acceptance alone changes accepted R; estimates never grant or write authority",
  );
  console.log(
    `5/5 planning relief browser groups passed in ${Date.now() - started}ms`,
  );
} finally {
  await f.close();
}
