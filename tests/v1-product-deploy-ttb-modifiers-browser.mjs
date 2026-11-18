import assert from "node:assert/strict";
import {
  fixture,
  seedScenario,
  schoolId,
} from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

// Real built frontend, Core, Contacts and Deploy Workers/D1. Only the existing
// historical version below is seeded directly; every tested save uses the UI.
const f = await fixture();
try {
  const seeded = await seedScenario(f),
    db = await f.db("deploy"),
    contacts = await f.db("contacts");
  const [plainId, suffixId] = seeded.staff;
  const current = (await f.request(f.admin, "contacts", "/staff/" + suffixId))
    .body.data;
  await f.call(f.admin, "contacts", "/staff/" + suffixId + "/update", {
    operationId: "synthetic-ttb-suffix",
    changes: { nameSuffix: "Distinct" },
    fieldRevisions: { nameSuffix: current.fields.nameSuffix?.revision ?? 0 },
  });
  const extra = await f.call(f.admin, "contacts", "/save-data", {
    operationId: "synthetic-ttb-embedded",
    changes: [],
    additions: [
      {
        id: "synthetic-embedded-pe",
        values: { "Basic Name": "Synthetic Embedded (PE)", Active: "Y" },
      },
      {
        id: "synthetic-embedded-bt",
        values: { "Basic Name": "Synthetic Embedded (BT)", Active: "Y" },
      },
    ],
  });
  const peId = extra.mapping["synthetic-embedded-pe"],
    btId = extra.mapping["synthetic-embedded-bt"];
  const created = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-ttb-version",
    name: "Synthetic TTb modifiers",
    year: Number(seeded.date.slice(0, 4)),
  });
  const loaded = await loadVersion(db, schoolId, created.versionId),
    doc = structuredClone(loaded.doc);
  doc.teacherDrafts = {
    [plainId]: { "Subject Modifier": "PE" },
    [suffixId]: { "Subject Modifier": "PE" },
    [peId]: { "Subject Modifier": "PE" },
    [btId]: { "Employment Modifier": "BT", "Subject Modifier": "PE" },
  };
  doc.masterOptions = {
    ...doc.masterOptions,
    "Subject Modifier": ["PE", "Art", "Music"],
    "Employment Modifier": ["BT", "Full-time"],
  };
  const delta = changesFor(schoolId, created.versionId, loaded.rows, doc);
  await db.batch(delta.writes.map((w) => statement(db, w.sql, w.args)));
  const saved = async () =>
    (await loadVersion(db, schoolId, created.versionId)).doc;
  const contactsState = async () => ({
    staff: (
      await contacts
        .prepare(
          "SELECT * FROM contacts_staff WHERE school_id=? ORDER BY staff_id",
        )
        .bind(schoolId)
        .all()
    ).results,
    fields: (
      await contacts
        .prepare(
          "SELECT * FROM contacts_fields WHERE school_id=? ORDER BY staff_id,field",
        )
        .bind(schoolId)
        .all()
    ).results,
  });
  const initial = await saved(),
    contactBefore = await contactsState();
  const page = await f.pageFor(),
    errors = [],
    dialogs = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });
  async function teachers() {
    await page
      .getByRole("button", { name: "HR Settings", exact: true })
      .click();
    await page.getByRole("button", { name: "Teachers", exact: true }).click();
  }
  const row = (id) => page.locator(`[data-roster-teacher="${id}"]`);
  const name = (id) => row(id).locator("[data-teacher-name]").textContent();
  await page.goto(origin + "/deploy/");
  await teachers();
  assert.equal(
    await name(plainId),
    "Synthetic Teacher A (PE)",
    "saved PE draft must derive the visible TTb name on load",
  );
  assert.equal(
    await name(suffixId),
    "Synthetic Teacher B (PE) (Distinct)",
    "the actual Contacts suffix is retained after a subject draft",
  );
  assert.equal(
    await name(peId),
    "Synthetic Embedded (PE)",
    "an existing Basic Name suffix must not be repeated",
  );
  assert.equal(
    await name(btId),
    "Synthetic Embedded (BT) (PE)",
    "employment and subject modifiers retain order without duplicate suffixes",
  );
  assert.equal(
    await row(peId).locator('[data-field="Basic Name"]').inputValue(),
    "Synthetic Embedded (PE)",
  );
  assert.equal(
    await row(btId).locator('[data-field="Basic Name"]').inputValue(),
    "Synthetic Embedded (BT)",
  );
  assert.deepEqual(
    await saved(),
    initial,
    "loading historical name drafts does not rewrite stored rows",
  );
  assert.deepEqual(await contactsState(), contactBefore);
  console.log(
    "PASS 1/4: historical PE load, actual Contacts suffix, embedded Basic Name modifiers, read isolation",
  );

  async function chooseSubject(value) {
    const picker = row(plainId).locator(
      'select[data-field="Subject Modifier"] + details',
    );
    await picker.locator("summary").click();
    await picker.getByRole("option", { name: value, exact: true }).click();
  }
  await chooseSubject("Music");
  assert.equal(
    await name(plainId),
    "Synthetic Teacher A (Music)",
    "live edit updates the displayed name before Save",
  );
  assert.deepEqual(
    await saved(),
    initial,
    "queued edits do not write the owner store",
  );
  async function saveAndReload(expected) {
    await page
      .locator("#saveQueue")
      .getByRole("button", { name: "Save to online", exact: true })
      .click();
    await page.waitForFunction(
      () => !queuedEdits().length && !queueFlight && !refreshing,
    );
    assert.equal(await name(plainId), expected);
    const persisted = await saved();
    await page.reload();
    await teachers();
    assert.equal(
      await name(plainId),
      expected,
      "reload must use the saved version's modifiers",
    );
    const workbook = await f.call(f.admin, "deploy", "/export", {
      versionId: created.versionId,
      scope: "Teachers",
    });
    const sheet = workbook.sheets.Teachers,
      idColumn = sheet.columns.indexOf("Staff ID"),
      nameColumn = sheet.columns.indexOf("TTb Name");
    const exported = sheet.rows.find((r) => r[idColumn] === plainId);
    assert.equal(
      exported[nameColumn],
      expected,
      "canonical export must agree with the current saved displayed name",
    );
    assert.deepEqual(
      await saved(),
      persisted,
      "reload and export are read-only",
    );
  }
  await saveAndReload("Synthetic Teacher A (Music)");
  assert.equal(
    (await saved()).teacherDrafts[plainId]["Subject Modifier"],
    "Music",
  );
  console.log(
    "PASS 2/4: live subject edit, real save/reload and canonical export agree",
  );

  await chooseSubject("");
  assert.equal(
    await name(plainId),
    "Synthetic Teacher A",
    "an explicit empty subject removes its suffix immediately",
  );
  await saveAndReload("Synthetic Teacher A");
  assert.equal((await saved()).teacherDrafts[plainId]["Subject Modifier"], "");
  assert.equal(
    await name(suffixId),
    "Synthetic Teacher B (PE) (Distinct)",
    "other staff's derived name is unchanged",
  );
  console.log(
    "PASS 3/4: explicit clear is saved, reloaded and exported without a stale suffix",
  );

  assert.deepEqual(
    await contactsState(),
    contactBefore,
    "Deploy name proposals never mutate Contacts or authority",
  );
  assert.deepEqual(
    (await saved()).teachers.map((t) => t.id).sort(),
    initial.teachers.map((t) => t.id).sort(),
  );
  assert.deepEqual(
    (await saved()).teachers.map((t) => [t.id, t.profile["Basic Name"]]).sort(),
    initial.teachers.map((t) => [t.id, t.profile["Basic Name"]]).sort(),
  );
  const writes = f.requests.filter(
    (r) => r.input?.operation === "saveDraft" && r.status === 200,
  );
  assert.equal(writes.length, 2, "both real native saves were confirmed");
  assert.deepEqual(errors, []);
  assert.deepEqual(dialogs, []);
  assert(
    f.external.every((url) => url === "https://accounts.google.com/gsi/client"),
    "only the existing blocked Google bootstrap script is attempted; the fixture aborts all external requests",
  );
  console.log(
    "PASS 4/4: stable identities, stored Basic Names, Contacts/authority isolation, no page errors and external requests blocked",
  );
} finally {
  await f.close();
}
