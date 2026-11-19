import assert from "node:assert/strict";
import { join } from "node:path";
import { fixture, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

const f = await fixture();
let restarted;
try {
  const staffId = "synthetic-inheritance-person";
  await f.call(f.admin, "contacts", "/staff/create", {
    operationId: "synthetic-inheritance-contact",
    staffId,
    basicName: "Synthetic Current Person",
    employmentActive: true,
    schoolSection: "Primary",
    role: "Teacher",
    eoAppointmentLevel: "EO",
  });
  const source = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-inheritance-source",
    name: "Synthetic inheritance source",
    year: 2027,
  });
  const db = await f.db("deploy"),
    initial = await loadVersion(db, schoolId, source.versionId);
  assert.equal(
    initial.doc.classes.length,
    0,
    "First creation without a source still starts with defaults",
  );
  const doc = structuredClone(initial.doc),
    draftId = "synthetic-inheritance-draft-only";
  doc.classes = [
    {
      ref: "synthetic-inherited-class",
      name: "Synthetic Class",
      shortName: "1S",
      level: "1",
      venueId: "synthetic-inherited-room",
    },
  ];
  doc.groups = [
    {
      id: "synthetic-inherited-tg",
      name: "Synthetic TG",
      subject: "EL",
      level: "1",
      classRefs: [doc.classes[0].ref],
      venue: "synthetic-inherited-room",
    },
  ];
  doc.venues = [
    {
      id: "synthetic-inherited-room",
      name: "Synthetic Room",
      form: "1S",
      forms: ["1S"],
      uses: ["Synthetic retained usage"],
      revision: 1,
    },
  ];
  doc.loads["1"].EL = 12;
  doc.classNameSets = [
    {
      id: "synthetic-class-set",
      name: "Synthetic set",
      pairs: [["Synthetic Class", "S"]],
    },
  ];
  doc.subjectTypes = { EL: "both" };
  doc.ascExport = { syntheticSetting: "retained" };
  doc.teachers.push({
    ...structuredClone(doc.teachers[0]),
    id: draftId,
    name: "Synthetic draft-only person",
    ttbName: "Synthetic draft-only person",
  });
  doc.assignments = [
    {
      id: "synthetic-inherited-ft",
      target: "1S",
      targetRef: doc.classes[0].ref,
      subject: "FT",
      teacher: staffId,
    },
    {
      id: "synthetic-inherited-ip",
      target: "1S",
      targetRef: doc.classes[0].ref,
      subject: "EL",
      teacher: draftId,
    },
    {
      id: "synthetic-inherited-tg-assignment",
      target: doc.groups[0].id,
      subject: "EL",
      teacher: staffId,
    },
  ];
  doc.teacherNotes = { [staffId]: "Synthetic source-only note" };
  doc.teacherDrafts = {
    [staffId]: { Role: "Synthetic old role", Active: "N" },
    [draftId]: { Role: "Synthetic draft role" },
  };
  doc.removedTeachers = { "synthetic-removed": true };
  doc.organisations = {
    dept: [
      {
        id: "synthetic-dept",
        name: "Synthetic Department",
        slots: [staffId, "", draftId],
        additionalDeputies: [draftId],
        tls: [staffId],
      },
    ],
    comm: [
      {
        id: "synthetic-comm",
        name: "Synthetic Committee",
        slots: [staffId, "", "", "", draftId],
        leadershipSchema: 1,
        legacyLeadership: [{ role: "Head", teacher: staffId }],
      },
    ],
    cca: [
      {
        id: "synthetic-cca",
        name: "Synthetic CCA",
        slots: ["", staffId, "", "", draftId],
      },
    ],
    plt: [{ id: "synthetic-plt", name: "Synthetic PLT", slots: ["", staffId] }],
    events: [
      {
        id: "synthetic-event",
        name: "Synthetic Event",
        slots: [staffId, "", draftId],
      },
    ],
  };
  doc.duties = [
    {
      id: "synthetic-duty",
      name: "Synthetic Duty",
      category: "Before School",
      start: "07:00",
      end: "07:30",
      days: [0],
      teachers: { 0: staffId },
    },
  ];
  doc.workload = {
    categories: { SYN: "Non-teaching" },
    nonTeachingActivities: [
      {
        id: "synthetic-activity",
        code: "SYN",
        name: "Synthetic Activity",
        periods: 2,
        teachers: [staffId, draftId],
      },
    ],
  };
  doc.reporting = {
    staff: [{ id: staffId }, { id: draftId }],
    parents: { [draftId]: staffId },
    officers: { [draftId]: staffId },
  };
  doc.relief = { ...doc.relief, siuePercent: 125, blocks: { [staffId]: 2 } };
  doc.pal = { schema: 1, auto: false };
  const delta = changesFor(schoolId, source.versionId, initial.rows, doc);
  await db.batch(delta.writes.map((w) => statement(db, w.sql, w.args)));
  const before = await loadVersion(db, schoolId, source.versionId);
  // Existing immutable publication is a synthetic owner fixture, not a live publication or R2 proof.
  await db
    .prepare("INSERT INTO deploy_publications VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .bind(
      schoolId,
      "synthetic-inheritance-publication",
      1,
      source.versionId,
      0,
      "synthetic-inheritance-published",
      "a".repeat(64),
      "synthetic/private/source.json",
      "{}",
      Date.now(),
      "synthetic-decision",
    )
    .run();
  const publicationBefore = (
    await db
      .prepare("SELECT * FROM deploy_publications WHERE school_id=?")
      .bind(schoolId)
      .all()
  ).results;
  const contact = (await f.request(f.admin, "contacts", "/staff/" + staffId))
    .body.data;
  await f.call(f.admin, "contacts", "/staff/" + staffId + "/update", {
    operationId: "synthetic-inheritance-current-contact",
    changes: { role: "ST", employmentActive: false, employmentTags: ["BT"] },
    fieldRevisions: Object.fromEntries(
      ["role", "employmentActive", "employmentTags"].map((key) => [
        key,
        contact.fields[key]?.revision ?? 0,
      ]),
    ),
  });
  const contactsDb = await f.db("contacts");
  const contactsState = async () => ({
    staff: (
      await contactsDb
        .prepare(
          "SELECT * FROM contacts_staff WHERE school_id=? ORDER BY staff_id",
        )
        .bind(schoolId)
        .all()
    ).results,
    fields: (
      await contactsDb
        .prepare(
          "SELECT * FROM contacts_fields WHERE school_id=? ORDER BY staff_id,field",
        )
        .bind(schoolId)
        .all()
    ).results,
  });
  const contactsBefore = await contactsState();
  const page = await f.pageFor(),
    alerts = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "prompt")
      await dialog.accept("Synthetic normal inherited version");
    else {
      alerts.push(dialog.message());
      await dialog.dismiss();
    }
  });
  await page.goto(origin + "/deploy/");
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await page
    .getByRole("button", { name: "New planning version", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector("#version")
      ?.selectedOptions[0]?.textContent.includes(
        "Synthetic normal inherited version",
      ),
  );
  const createdId = await page.locator("#version").inputValue();
  const creation = f.requests.find(
    (r) =>
      r.input?.name === "Synthetic normal inherited version" &&
      r.status === 200,
  );
  assert(creation, "Actual built New control reaches the owner Worker");
  assert.equal(creation.input.sourceVersionId, source.versionId);
  assert.equal(creation.input.duplicate, false);
  const normal = await loadVersion(db, schoolId, createdId);
  assert.deepEqual(
    normal.doc.classes,
    before.doc.classes,
    "Normal New must inherit the selected version's class definitions",
  );
  for (const field of [
    "groups",
    "venues",
    "loads",
    "classNameSets",
    "subjectTypes",
    "ascExport",
    "offload",
  ])
    assert.deepEqual(
      normal.doc[field],
      before.doc[field],
      field +
        " is inherited without changing definitions/settings/room placements",
    );
  assert.deepEqual(normal.doc.assignments, []);
  assert.deepEqual(normal.doc.teacherDrafts, {});
  assert.deepEqual(normal.doc.teacherNotes, {});
  assert.deepEqual(normal.doc.removedTeachers, {});
  assert.equal(normal.doc.reporting, null);
  assert.deepEqual(
    normal.doc.relief,
    initial.doc.relief,
    "New uses the current v1 relief defaults, not the source's personal block settings",
  );
  assert.deepEqual(normal.doc.pal, { schema: 1, auto: true });
  for (const [kind, size] of Object.entries({
    dept: 2,
    comm: 4,
    cca: 4,
    plt: 1,
    events: 2,
  })) {
    const inherited = normal.doc.organisations[kind][0],
      original = before.doc.organisations[kind][0];
    assert.equal(inherited.id, original.id);
    assert.equal(inherited.name, original.name);
    assert.deepEqual(inherited.slots, Array(size).fill(""));
    for (const key of ["additionalDeputies", "tls", "legacyLeadership"])
      assert(!Object.hasOwn(inherited, key));
    if (kind === "comm") assert.equal(inherited.leadershipSchema, 1);
  }
  assert.deepEqual(
    normal.doc.duties,
    before.doc.duties.map((duty) => ({ ...duty, teachers: {} })),
  );
  assert.deepEqual(normal.doc.workload, {
    ...before.doc.workload,
    nonTeachingActivities: before.doc.workload.nonTeachingActivities.map(
      (activity) => ({ ...activity, teachers: [] }),
    ),
  });
  const fresh = normal.doc.teachers.find((person) => person.id === staffId);
  assert.equal(fresh.profile.Role, "ST");
  assert.equal(
    fresh.active,
    false,
    "Current inactive Contacts people are not newly filtered by this repair",
  );
  assert.deepEqual(fresh.deploymentTags["Employment Modifier"], ["BT"]);
  assert(
    !normal.doc.teachers.some((person) => person.id === draftId),
    "New does not copy source-only draft people",
  );
  assert.deepEqual(
    await contactsState(),
    contactsBefore,
    "New creates no Contacts fields, revisions or defaults",
  );
  assert.deepEqual(
    await loadVersion(db, schoolId, source.versionId),
    before,
    "Source document and stored rows remain unchanged",
  );
  assert.deepEqual(
    (
      await db
        .prepare("SELECT * FROM deploy_publications WHERE school_id=?")
        .bind(schoolId)
        .all()
    ).results,
    publicationBefore,
  );
  assert.deepEqual(alerts, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS built New control / real Workers-D1: source definitions, class/TG rooms and loads inherited; all personal assignment families reset; current Contacts and immutable source preserved",
  );

  const { newPlanningVersion } = await import(
    "../v1/services/deploy/model.mjs"
  );
  const pureSource = structuredClone(before.doc),
    pureBefore = structuredClone(pureSource),
    pureCopy = newPlanningVersion(pureSource);
  pureCopy.classes[0].name = "Synthetic independent class";
  pureCopy.groups[0].name = "Synthetic independent TG";
  pureCopy.venues[0].forms.push("6S");
  pureCopy.loads["1"].EL = 24;
  pureCopy.organisations.dept[0].name = "Synthetic independent department";
  assert.deepEqual(
    pureSource,
    pureBefore,
    "The pure copy does not alias any retained source collection",
  );
  console.log("PASS pure normal-New policy keeps source objects independent");

  for (const [label, input] of [
    ["duplicate", { sourceVersionId: source.versionId, duplicate: true }],
    ["copyFrom", { copyFrom: source.versionId, duplicate: false }],
    ["sourceId", { sourceId: source.versionId, duplicate: false }],
  ]) {
    const copied = await f.call(f.admin, "deploy", "/versions/create", {
      operationId: "synthetic-inheritance-" + label,
      name: "Synthetic " + label,
      ...input,
    });
    const copy = (await loadVersion(db, schoolId, copied.versionId)).doc;
    for (const key of [
      "classes",
      "groups",
      "venues",
      "assignments",
      "teacherNotes",
      "organisations",
      "duties",
      "workload",
      "reporting",
      "relief",
      "pal",
    ])
      assert.deepEqual(
        copy[key],
        before.doc[key],
        label + " keeps existing copy semantics for " + key,
      );
    assert(copy.teachers.some((person) => person.id === draftId));
    assert.equal(
      copy.teachers.find((person) => person.id === staffId).profile.Role,
      "ST",
    );
    assert.equal(
      copy.teachers.find((person) => person.id === staffId).active,
      false,
    );
    assert.equal(copy.teacherDrafts[staffId]?.Role, undefined);
    assert.deepEqual(
      copy.teacherDrafts[draftId],
      before.doc.teacherDrafts[draftId],
    );
  }
  const noSourceDuplicate = await f.call(
    f.admin,
    "deploy",
    "/versions/create",
    {
      operationId: "synthetic-inheritance-no-source-duplicate",
      name: "Synthetic no-source duplicate",
      duplicate: true,
    },
  );
  const emptyCopy = (
    await loadVersion(db, schoolId, noSourceDuplicate.versionId)
  ).doc;
  assert.deepEqual(emptyCopy.classes, []);
  assert.deepEqual(emptyCopy.assignments, []);
  assert.deepEqual(emptyCopy.organisations, initial.doc.organisations);
  assert.deepEqual(await contactsState(), contactsBefore);
  console.log(
    "PASS Duplicate and copyFrom/sourceId retain assignments and current Contacts refresh; no-source Duplicate retains defaults",
  );

  const countVersions = async () =>
    (
      await db
        .prepare("SELECT COUNT(*) n FROM deploy_versions WHERE school_id=?")
        .bind(schoolId)
        .first()
    ).n;
  const beforeDenied = await countVersions();
  for (const missing of [
    "synthetic-missing-source",
    "synthetic-foreign-source",
    "synthetic-deleted-source",
  ]) {
    if (missing !== "synthetic-missing-source")
      await db
        .prepare(
          "INSERT INTO deploy_versions(school_id,id,name,revision,metadata,created_at,deleted) VALUES(?,?,?,0,'{}',?,?)",
        )
        .bind(
          missing.includes("foreign") ? "foreign-school" : schoolId,
          missing,
          "Synthetic unavailable",
          Date.now(),
          missing.includes("deleted") ? 1 : 0,
        )
        .run();
    const rejected = await f.request(f.admin, "deploy", "/versions/create", {
      method: "POST",
      body: {
        operationId: "synthetic-denied-" + missing,
        sourceVersionId: missing,
        duplicate: false,
        name: "Must not become an empty version",
      },
    });
    assert.equal(rejected.status, 404, JSON.stringify(rejected.body));
  }
  for (const field of ["smc", "eo", "schoolLeader"])
    await f.call(f.admin, "contacts", "/staff/" + staffId + "/accept", {
      operationId: "synthetic-inheritance-reader-authority-" + field,
      field,
      value: field === "eo",
      revision: 0,
      ownerReviewReference: "Synthetic explicit authority fixture",
    });
  const reader = await f.seedAccount("synthetic-inheritance-reader", {
    staffId,
    capabilities: [],
  });
  for (const [label, user, headers] of [
    ["reader", reader, {}],
    ["preview", f.admin, { "x-gsis-preview-account": f.other.id }],
  ]) {
    const denied = await f.request(user, "deploy", "/versions/create", {
      method: "POST",
      headers,
      body: {
        operationId: "synthetic-inheritance-denied-" + label,
        name: "Forbidden",
        sourceVersionId: source.versionId,
        duplicate: false,
      },
    });
    assert.equal(denied.status, 403, JSON.stringify(denied.body));
  }
  assert.equal(
    await countVersions(),
    beforeDenied + 1,
    "Only the explicitly seeded deleted fixture was added; no rejected create writes a version",
  );
  assert.deepEqual(await loadVersion(db, schoolId, source.versionId), before);
  console.log(
    "PASS missing/deleted/foreign sources fail without fallback; current capability and read-only preview remain enforced",
  );

  const path = new URL(creation.url).pathname.replace("/api/deploy", "");
  const originalCount = await countVersions();
  const replay = await f.request(f.admin, "deploy", path, {
    method: "POST",
    body: creation.input,
  });
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.data.versionId, createdId);
  const conflict = await f.request(f.admin, "deploy", path, {
    method: "POST",
    body: { ...creation.input, name: "Different original intent" },
  });
  assert.equal(conflict.status, 409);
  assert.equal(await countVersions(), originalCount);
  const lostIntent = {
    operationId: "synthetic-inheritance-lost-response",
    sourceVersionId: source.versionId,
    duplicate: false,
    name: "Synthetic lost-response New",
  };
  let lostDispatches = 0;
  await page.route("**/api/deploy/versions/create", async (route) => {
    lostDispatches++;
    const request = route.request(),
      response = await f.mf.dispatchFetch(request.url(), {
        method: request.method(),
        headers: await request.allHeaders(),
        body: request.postDataBuffer(),
      });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    await route.abort("connectionfailed");
  });
  const lost = await page.evaluate(async (body) => {
    try {
      await GSISV1.request("deploy", "/versions/create", {
        method: "POST",
        body,
      });
      return { confirmed: true };
    } catch (error) {
      return { confirmed: false, message: error.message };
    }
  }, lostIntent);
  assert.equal(
    lost.confirmed,
    false,
    "The browser did not receive the committed result",
  );
  assert.equal(lostDispatches, 1);
  const durable = await db
    .prepare(
      "SELECT state,receipt_json FROM product_operations WHERE school_id=? AND operation_id=?",
    )
    .bind(schoolId, lostIntent.operationId)
    .first();
  assert.equal(durable.state, "committed");
  const lostId = JSON.parse(durable.receipt_json).result.versionId;
  const lostDoc = (await loadVersion(db, schoolId, lostId)).doc;
  assert.equal(await countVersions(), originalCount + 1);
  // Delete only the synthetic source after taking proof; committed recovery must not re-read it.
  await db
    .prepare("UPDATE deploy_versions SET deleted=1 WHERE school_id=? AND id=?")
    .bind(schoolId, source.versionId)
    .run();
  await contactsDb
    .prepare(
      "UPDATE contacts_fields SET state='superseded',value_json=NULL,timeline_json=NULL WHERE school_id=? AND staff_id=? AND field='role'",
    )
    .bind(schoolId, staffId)
    .run();
  await f.stopWorkers();
  restarted = await startProduct({
    persistPath: join(f.path, "state"),
    output: join(f.path, "restarted"),
    migrateSchemas: false,
  });
  const response = await restarted.mf.dispatchFetch(
    origin + "/api/deploy/versions/create",
    {
      method: "POST",
      headers: {
        origin,
        cookie: "__Host-gsis_session=" + f.admin.token,
        "x-csrf-token": f.admin.csrf,
        "content-type": "application/json",
      },
      body: JSON.stringify(lostIntent),
    },
  );
  const recovered = await response.json();
  assert.equal(response.status, 200, JSON.stringify(recovered));
  assert.equal(recovered.data.versionId, lostId);
  const restartedDb = await restarted.db("deploy");
  assert.deepEqual(
    (await loadVersion(restartedDb, schoolId, createdId)).doc,
    normal.doc,
  );
  assert.deepEqual(
    (await loadVersion(restartedDb, schoolId, lostId)).doc,
    lostDoc,
  );
  assert.equal(
    (
      await restartedDb
        .prepare("SELECT COUNT(*) n FROM deploy_versions WHERE school_id=?")
        .bind(schoolId)
        .first()
    ).n,
    originalCount + 1,
  );
  assert.deepEqual(
    (
      await restartedDb
        .prepare("SELECT * FROM deploy_publications WHERE school_id=?")
        .bind(schoolId)
        .all()
    ).results,
    publicationBefore,
  );
  console.log(
    "PASS original creation receipt survives exact retry, changed-intent denial, actual browser reply loss and restart after source/Contacts changes with one durable result",
  );
} finally {
  await restarted?.close();
  await f.close();
}
