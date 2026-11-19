import assert from "node:assert/strict";
import {
  fixture,
  seedScenario,
  schoolId,
} from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

// Actual local Core/Contacts/Deploy Workers and native built frontend. Only
// historical/empty owner snapshots are seeded directly, never hosted records.
const f = await fixture();
try {
  const seeded = await seedScenario(f),
    [first, second] = seeded.staff;
  const old = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "membership-old",
    name: "Synthetic same-name draft",
    year: 2027,
  });
  const created = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "membership-current",
    name: "Synthetic same-name draft",
    year: 2027,
  });
  const db = await f.db("deploy"),
    contacts = await f.db("contacts");
  const stored = () => loadVersion(db, schoolId, created.versionId);
  const rows = async () =>
    (
      await db
        .prepare(
          "SELECT * FROM deploy_rows WHERE school_id=? AND version_id=? ORDER BY scope,row_id",
        )
        .bind(schoolId, created.versionId)
        .all()
    ).results;
  const contactRows = async () =>
    (
      await contacts
        .prepare(
          "SELECT * FROM contacts_fields WHERE school_id=? ORDER BY staff_id,field",
        )
        .bind(schoolId)
        .all()
    ).results;
  const contactsBefore = await contactRows();
  const initial = await stored();
  assert.deepEqual(
    initial.doc.teachers.map((t) => t.id).sort(),
    seeded.staff.slice().sort(),
    "Explicit creation still seeds current Contacts",
  );
  await db
    .prepare("UPDATE deploy_versions SET deleted=1 WHERE school_id=? AND id=?")
    .bind(schoolId, old.versionId)
    .run();
  const deletedRows = (
    await db
      .prepare(
        "SELECT * FROM deploy_rows WHERE school_id=? AND version_id=? ORDER BY scope,row_id",
      )
      .bind(schoolId, old.versionId)
      .all()
  ).results;
  const page = await f.pageFor(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.dismiss());
  const teachers = async () => {
    await page
      .getByRole("button", { name: "HR Settings", exact: true })
      .click();
    await page.getByRole("button", { name: "Teachers", exact: true }).click();
  };
  await page.goto(origin + "/deploy/");
  await teachers();
  assert.equal(await page.locator("#version").inputValue(), created.versionId);
  assert.equal(await page.locator("[data-roster-teacher]").count(), 2);
  const cached = await page.evaluate(() => ({ ...snapshotCache }));
  // A direct synthetic deletion leaves an old nonempty ordering index and does
  // not advance revision. The reader must not manufacture missing records.
  await db
    .prepare(
      "DELETE FROM deploy_rows WHERE school_id=? AND version_id=? AND scope='teachers'",
    )
    .bind(schoolId, created.versionId)
    .run();
  const emptiedRows = await rows();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.waitForFunction(() => !refreshing);
  assert.equal(await page.locator("[data-roster-teacher]").count(), 0);
  assert.equal(
    await page.evaluate(() => snapshotCache.revision),
    cached.revision,
    "Foreground Refresh accepts the actual full owner document even at the same synthetic out-of-band revision",
  );
  const bootstrap = () =>
    f.call(f.admin, "deploy", "/bootstrap", { versionId: created.versionId });
  let boot = await bootstrap();
  assert.equal(
    boot.current.teachers.length,
    0,
    "Saved empty membership is not current Contacts inventory",
  );
  assert.deepEqual(
    boot.staffCatalog.map((t) => t.id).sort(),
    seeded.staff.slice().sort(),
    "Contacts remains a separate Add-existing choice pool",
  );
  assert.deepEqual(boot.current.reliefResults.teachers, []);
  const emptyExport = await f.call(f.admin, "deploy", "/export", {
    versionId: created.versionId,
    scope: "Teachers",
  });
  assert.deepEqual(emptyExport.sheets.Teachers.rows, []);
  assert.deepEqual(
    await rows(),
    emptiedRows,
    "Read, calculation and export do not write membership or repair an order",
  );
  assert.equal(await page.locator("#version").inputValue(), created.versionId);
  assert.equal(await page.locator("[data-roster-teacher]").count(), 0);
  await page.reload();
  await teachers();
  assert.equal(
    await page.locator("[data-roster-teacher]").count(),
    0,
    "Hard refresh cannot select a deleted similarly named draft",
  );
  console.log(
    "PASS 1/5: actual owner empty scope and stale index stay empty in native UI, workload and export; Contacts candidates stay separate",
  );
  const missingFieldEdit = await page.evaluate((staffId) => {
    const doc = structuredClone(v()),
      before = JSON.stringify(doc);
    try {
      projectEditBase(doc, {
        operation: "setTeacherField",
        teacher: staffId,
        field: "Basic Name",
        value: "Must not add a member",
      });
      return { denied: false };
    } catch (error) {
      return {
        denied: true,
        unchanged: before === JSON.stringify(doc),
        message: error.message,
      };
    }
  }, first);
  assert.equal(missingFieldEdit.denied, true);
  assert.equal(missingFieldEdit.unchanged, true);

  const save = async () => {
    await page
      .locator("#saveQueue")
      .getByRole("button", { name: "Save to online", exact: true })
      .click();
    await page.waitForFunction(
      () => !queuedEdits().length && !queueFlight && !refreshing,
    );
  };
  await page
    .getByRole("button", { name: "Add existing teacher", exact: true })
    .click();
  const choices = page.locator("#existingTeacher + details");
  const choiceOptions = await page.locator("#existingTeacher").evaluate((el) =>
    [...el.options].map((option) => ({
      value: option.value,
      label: option.textContent,
    })),
  );
  const firstOption = choiceOptions.find((option) => option.value === first);
  assert(firstOption, JSON.stringify(choiceOptions));
  if (!(await choices.evaluate((el) => el.open)))
    await choices.locator("summary").click();
  await choices
    .getByRole("option", { name: firstOption.label, exact: true })
    .click();
  await page.locator("#ok").click();
  assert.equal(
    await page.evaluate(() => queuedEdits().length),
    1,
    "The explicit missing-person upsert queues through the native picker",
  );
  assert.equal(
    (await stored()).doc.teachers.length,
    0,
    "Queue-only Add does not persist",
  );
  await save();
  assert.deepEqual(
    (await stored()).doc.teachers.map((t) => t.id),
    [first],
    "Explicit Add admits only its selected identity",
  );
  await page.reload();
  await teachers();
  assert.equal(await page.locator("[data-roster-teacher]").count(), 1);
  const row = page.locator('[data-roster-teacher="' + first + '"]');
  await row.locator(".teacher-admin summary").click();
  await row
    .getByRole("button", { name: "Delete teacher", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete from draft", exact: true })
    .click();
  assert.equal(
    (await stored()).doc.teachers.length,
    1,
    "Delete preview/queue does not write",
  );
  await save();
  const removed = await stored();
  assert.deepEqual(removed.doc.teachers, []);
  assert.equal(removed.doc.removedTeachers[first].id, first);
  const deletion = f.requests
    .filter((r) =>
      r.input?.edits?.some((e) => e.operation === "removeTeacherProfile"),
    )
    .at(-1);
  assert.equal(deletion.status, 200);
  const receiptBefore = await db
    .prepare(
      "SELECT * FROM product_operations WHERE school_id=? AND operation_id=?",
    )
    .bind(schoolId, deletion.input.operationId)
    .first();
  assert.equal(receiptBefore.state, "committed");
  await page.reload();
  await teachers();
  assert.equal(
    await page.locator("[data-roster-teacher]").count(),
    0,
    "A committed Delete cannot reappear through Contacts hydration",
  );
  const replay = await f.request(f.admin, "deploy", "/change", {
    method: "POST",
    body: deletion.input,
  });
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.deepEqual(
    await stored(),
    removed,
    "Original replay neither adds candidates nor advances saved revision",
  );
  const conflict = await f.request(f.admin, "deploy", "/change", {
    method: "POST",
    body: {
      ...deletion.input,
      edits: [{ ...deletion.input.edits[0], teacher: second }],
    },
  });
  assert.equal(conflict.status, 409);
  assert.deepEqual(await stored(), removed);
  console.log(
    "PASS 2/5: native targeted Add, real Delete, save/reload, exact committed replay and changed-intent conflict preserve version membership",
  );

  assert.deepEqual(
    JSON.parse(
      removed.rows.find((r) => r.scope === "_orders" && r.row_id === "teachers")
        .value,
    ),
    [],
  );
  assert.deepEqual(
    (await bootstrap()).current.teachers,
    [],
    "Valid saved empty ordering is authoritative",
  );
  await db
    .prepare(
      "DELETE FROM deploy_rows WHERE school_id=? AND version_id=? AND scope='_orders' AND row_id='teachers'",
    )
    .bind(schoolId, created.versionId)
    .run();
  assert.deepEqual(
    (await bootstrap()).current.teachers,
    [],
    "Legacy missing order is not proof that Contacts should be copied",
  );
  // A legacy nonempty list without an order remains a saved list. Keep a
  // historical orphan as well; current Contacts cannot silently erase it.
  const legacy = await stored(),
    doc = structuredClone(legacy.doc);
  doc.teachers = [
    structuredClone(initial.doc.teachers.find((t) => t.id === second)),
    {
      ...structuredClone(initial.doc.teachers[0]),
      id: "synthetic-retained-orphan",
      name: "Synthetic retained history",
      ttbName: "Synthetic retained history",
    },
  ];
  const delta = changesFor(schoolId, created.versionId, legacy.rows, doc);
  await db.batch(delta.writes.map((w) => statement(db, w.sql, w.args)));
  await db
    .prepare(
      "DELETE FROM deploy_rows WHERE school_id=? AND version_id=? AND scope='_orders' AND row_id='teachers'",
    )
    .bind(schoolId, created.versionId)
    .run();
  boot = await bootstrap();
  assert.deepEqual(
    boot.current.teachers.map((t) => t.id).sort(),
    [second, "synthetic-retained-orphan"].sort(),
  );
  assert.equal(
    boot.current.teachers.find((t) => t.id === "synthetic-retained-orphan")
      .orphan,
    true,
  );
  console.log(
    "PASS 3/5: explicit empty, legacy missing order, retained legacy members and orphan history are distinguished without inferred restoration",
  );

  const lease = await f.call(f.admin, "deploy", "/lease", {
    operationId: "membership-note-lease",
    versionId: created.versionId,
    scope: "meta",
  });
  const revision = (await stored()).version.revision;
  const note = await f.call(f.admin, "deploy", "/change", {
    operationId: "membership-note",
    versionId: created.versionId,
    operation: "saveVersionNote",
    notes: "Synthetic unrelated note",
    expected: "",
    revision,
    scope: "meta",
    leaseFence: lease.fence,
  });
  assert.equal(note.saved, true);
  assert.deepEqual(
    (await stored()).doc.teachers.map((t) => t.id).sort(),
    [second, "synthetic-retained-orphan"].sort(),
  );
  const importLease = await f.call(f.admin, "deploy", "/lease", {
    operationId: "membership-import-lease",
    versionId: created.versionId,
    scope: "meta",
  });
  const stale = await f.request(f.admin, "deploy", "/change", {
    method: "POST",
    body: {
      operationId: "membership-stale",
      versionId: created.versionId,
      operation: "saveVersionNote",
      notes: "Must not commit",
      expected: "Synthetic unrelated note",
      revision,
      scope: "meta",
      leaseFence: importLease.fence,
    },
  });
  assert.equal(stale.status, 409);
  const workbook = await f.call(f.admin, "deploy", "/export", {
    versionId: created.versionId,
    scope: "HR Terms",
  });
  const preview = await f.call(f.admin, "deploy", "/imports/preview", {
    operationId: "membership-import-preview",
    versionId: created.versionId,
    workbook,
  });
  const imported = await f.call(f.admin, "deploy", "/imports/apply", {
    operationId: "membership-import",
    versionId: created.versionId,
    previewId: preview.previewId,
    digest: preview.digest,
    revision: (await stored()).version.revision,
    scope: "meta",
    leaseFence: importLease.fence,
  });
  assert.equal(imported.saved, true);
  assert.deepEqual(
    (await stored()).doc.teachers.map((t) => t.id).sort(),
    [second, "synthetic-retained-orphan"].sort(),
    "Unrelated table import does not admit all Contacts",
  );
  assert.deepEqual(
    (
      await db
        .prepare(
          "SELECT * FROM deploy_rows WHERE school_id=? AND version_id=? ORDER BY scope,row_id",
        )
        .bind(schoolId, old.versionId)
        .all()
    ).results,
    deletedRows,
  );
  assert.deepEqual(await contactRows(), contactsBefore);
  console.log(
    "PASS 4/5: unrelated notes/import, stale owner revision, deleted-source isolation and Contacts no-write boundary",
  );

  const reader = await f.seedAccount("membership-reader", {
    staffId: second,
    capabilities: [],
  });
  for (const [user, headers] of [
    [reader, {}],
    [f.admin, { "x-gsis-preview-account": f.other.id }],
  ]) {
    const denied = await f.request(user, "deploy", "/change", {
      method: "POST",
      headers,
      body: {
        operationId:
          "membership-denied-" +
          user.id +
          (headers["x-gsis-preview-account"] || ""),
        versionId: created.versionId,
        operation: "saveDraft",
        edits: [{ operation: "removeTeacherProfile", teacher: second }],
        scope: "meta",
        revision: (await stored()).version.revision,
        leaseFence: lease.fence,
      },
    });
    assert.equal(denied.status, 403, JSON.stringify(denied.body));
  }
  const foreign = await f.request(f.admin, "deploy", "/bootstrap", {
    method: "POST",
    body: { versionId: "synthetic-foreign-unavailable" },
  });
  assert.equal(foreign.status, 404);
  assert.deepEqual(errors, []);
  assert.equal(
    f.external.every((url) =>
      url.startsWith("https://accounts.google.com/gsi/client"),
    ),
    true,
  );
  console.log(
    "PASS 5/5: existing read-only capability, preview and exact-version boundaries; no browser errors or provider writes",
  );
} finally {
  await f.close();
}
