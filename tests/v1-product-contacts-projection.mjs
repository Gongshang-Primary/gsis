import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";

// Real local gateway/Core/Contacts/Deploy Workers and D1. Owner inputs, sessions
// and catalogue definitions are synthetic. No hosted data or provider is used.
const fields = [
  "Basic Name",
  "TTb Name",
  "Statutory Name",
  "Mobile No",
  "EXT",
  "Role",
  "EO Appt Level",
  "Appointment Status",
  "Active",
  "Employment Modifier",
  "Subject Modifier",
  "MK Modifier",
  "Day of Birth",
  "Month of birth",
  "GSPS Alias (@gsps.edu.sg)",
  "iCON Alias (@moe.edu.sg)",
  "CES Alias (@schools.gov.sg)",
];
const deployFields = [
  "role",
  "eoAppointmentLevel",
  "appointmentStatus",
  "employmentActive",
  "schoolSection",
  "employmentArrangement",
  "employmentTags",
  "subjectTags",
  "mkTags",
  "memberships",
  "eo",
  "smc",
  "schoolLeader",
].sort();
const school = "synthetic-school";
const suite = await productSuite();
let serial = 0,
  passed = 0;
const operationId = () => "projection-op-" + ++serial;
async function test(name, run) {
  await run();
  console.log("PASS " + name);
  passed++;
}
async function get(user, domain, path) {
  const response = await suite.request(user, domain, path);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}
async function post(user, domain, path, body) {
  return suite.call(user, domain, path, {
    operationId: operationId(),
    ...body,
  });
}
const ref = (catalogueId, code, revision = "1") => ({
  catalogueId,
  revision,
  code,
});
const flags = Object.fromEntries(
  ["sl", "sc", "smc", "kp", "tl", "sdt", "cmt", "sat", "support", "mk"].map(
    (key) => [key, false],
  ),
);
const hr = {
  catalogueId: "projection-hr",
  revision: "1",
  kind: "hr-term",
  entries: [
    ["PRIMARY", "schoolSection"],
    ["MK", "schoolSection"],
    ["Full-time", "employmentArrangement"],
    ["EO", "eoAppointmentLevel"],
    ["Confirmed", "appointmentStatus"],
  ].map(([code, category]) => ({
    code,
    category,
    label: "Shared human label",
    active: true,
    definitionRevision: "definition-1",
  })),
};
const roles = {
  catalogueId: "projection-roles",
  revision: "1",
  kind: "membership-role",
  entries: ["Teacher", "TeacherTwo"].map((code) => ({
    code,
    label: "Duplicate role label",
    active: true,
    definitionRevision: "definition-1",
    flags,
    eoAppointment: null,
  })),
};
const tags = {
  catalogueId: "projection-tags",
  revision: "1",
  kind: "operational-tag",
  entries: [
    {
      code: "FAJT",
      category: "employmentTags",
      label: "FAJT",
      active: true,
      definitionRevision: "definition-1",
      ttbVisible: true,
      order: 0,
    },
  ],
};
try {
  const admin = await suite.seedAccount("projection-admin"),
    manager = await suite.seedAccount("projection-manager", {
      capabilities: ["contacts.powerUser"],
    }),
    ordinary = await suite.seedAccount("projection-reader", {
      capabilities: [],
    }),
    otherPower = await suite.seedAccount("projection-other-power", {
      capabilities: ["deploy.powerUser"],
    });
  const created = await post(admin, "contacts", "/save-data", {
    changes: [],
    additions: [
      {
        id: "temporary-person",
        values: {
          "Basic Name": "Synthetic Projection Person",
          "Statutory Name": "=SUM(1,2)",
          EXT: "1234",
          "Mobile No": "81234567",
          "GSPS Alias (@gsps.edu.sg)": "School.Local@example.invalid",
          "iCON Alias (@moe.edu.sg)": "Icon.Local@MOE.EDU.SG",
          "CES Alias (@schools.gov.sg)": "Ces.Local@Schools.Gov.Sg",
          "Day of Birth": "7",
          "Month of birth": "3",
        },
      },
    ],
  });
  assert.equal(created.receipt.state, "committed");
  const staffId = created.mapping["temporary-person"],
    self = await suite.seedAccount("projection-self", {
      staffId,
      capabilities: [],
    });
  const accept = (id, field, value, revision = 0, extra = {}) =>
    post(manager, "contacts", `/staff/${id}/accept`, {
      field,
      value,
      revision,
      ownerReviewReference: "Synthetic owner-reviewed fixture",
      ...extra,
    });
  const update = async (id, changes) => {
    const current = await get(admin, "contacts", `/staff/${id}`);
    return post(admin, "contacts", `/staff/${id}/update`, {
      changes,
      fieldRevisions: Object.fromEntries(
        Object.keys(changes).map((key) => [
          key,
          current.fields[key]?.revision ?? 0,
        ]),
      ),
    });
  };
  await accept(staffId, "eo", true);
  await update(staffId, {
    aliases: ["NotDedicated@moe.edu.sg", "NotDedicated@schools.gov.sg"],
    signature: "private-signature-marker",
  });
  const expected = [
    "Synthetic Projection Person",
    "Synthetic Projection Person",
    "=SUM(1,2)",
    "81234567",
    "1234",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "7",
    "3",
    "School.Local",
    "Icon.Local",
    "Ces.Local",
  ];
  await test("actual owner records produce exact public seventeen-cell values without EO appointment inference", async () => {
    const data = await get(admin, "contacts", "/data"),
      row = data.rows.find((row) => row.id === staffId);
    assert.deepEqual(data.fields, fields);
    assert.deepEqual(row.values, expected);
    assert.equal(row.computed.length, 17);
    assert.deepEqual(data.aliasDomains, {
      gsps: "example.invalid",
      icon: "moe.edu.sg",
      ces: "schools.gov.sg",
    });
    const bootstrap = await get(admin, "contacts", "/bootstrap"),
      person = bootstrap.people.find((row) => row.id === staffId);
    assert.equal(person.ext, "1234");
    assert.equal(person.appointmentLevel, "");
    assert.deepEqual(person.emails, {
      gsps: "School.Local@example.invalid",
      icon: "Icon.Local@MOE.EDU.SG",
      ces: "Ces.Local@Schools.Gov.Sg",
    });
  });
  await test("projected expected values support real editing; clearing a dedicated alias never revives a general alias", async () => {
    const changed = await post(manager, "contacts", "/save-data", {
      changes: [
        {
          id: staffId,
          field: "iCON Alias (@moe.edu.sg)",
          expected: "Icon.Local",
          value: "",
        },
        { id: staffId, field: "Day of Birth", expected: "7", value: "8" },
        { id: staffId, field: "EXT", expected: "1234", value: "5678" },
        {
          id: staffId,
          field: "CES Alias (@schools.gov.sg)",
          expected: "Ces.Local",
          value: "Wrong.Domain@outside.example",
        },
      ],
    });
    assert.equal(changed.receipt.state, "committed");
    const data = await get(admin, "contacts", "/data"),
      row = data.rows.find((row) => row.id === staffId);
    assert.equal(row.values[4], "5678");
    assert.equal(row.values[12], "8");
    assert.equal(row.values[15], "");
    assert.equal(row.values[16], "Wrong.Domain@outside.example");
    const raw = await get(admin, "contacts", `/staff/${staffId}`);
    assert.deepEqual(raw.fields.aliases.value, [
      "NotDedicated@moe.edu.sg",
      "NotDedicated@schools.gov.sg",
    ]);
    assert.equal(raw.fields.cesEmail.value, "Wrong.Domain@outside.example");
    const stale = await suite.request(manager, "contacts", "/save-data", {
      method: "POST",
      body: {
        operationId: operationId(),
        changes: [
          { id: staffId, field: "EXT", expected: "1234", value: "9999" },
        ],
      },
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, "REVISION_CONFLICT");
  });
  await test("owner, self, ordinary and other-module projections preserve privacy and write boundaries", async () => {
    for (const user of [ordinary, otherPower]) {
      const data = await get(user, "contacts", "/data"),
        row = data.rows.find((row) => row.id === staffId);
      assert.equal(row.values[2], "");
      assert.equal(row.values[12], "");
      assert.equal(row.values[13], "");
      assert.equal(data.editable, false);
      const denied = await suite.request(user, "contacts", "/save-data", {
        method: "POST",
        body: {
          operationId: operationId(),
          changes: [
            { id: staffId, field: "EXT", expected: "5678", value: "9" },
          ],
        },
      });
      assert.equal(denied.status, 403);
    }
    const diy = await get(self, "contacts", "/diy");
    assert.equal(diy.rows[0].id, staffId);
    assert.equal(diy.rows[0].values[2], "=SUM(1,2)");
    const own = await post(self, "contacts", "/save-diy", {
      changes: [
        {
          id: staffId,
          field: "Statutory Name",
          expected: "=SUM(1,2)",
          value: "=literal-not-formula",
        },
      ],
    });
    assert.equal(own.receipt.state, "committed");
    const preview = await suite.request(admin, "contacts", "/data", {
      headers: { "x-gsis-preview-account": ordinary.id },
    });
    assert.equal(preview.status, 200);
    assert.equal(
      preview.body.data.rows.find((row) => row.id === staffId).values[2],
      "",
    );
    const previewWrite = await suite.request(admin, "contacts", "/save-data", {
      method: "POST",
      headers: { "x-gsis-preview-account": ordinary.id },
      body: { operationId: operationId(), changes: [] },
    });
    assert.equal(previewWrite.status, 403);
    const foreign = await suite.request(admin, "contacts", "/projection", {
      method: "POST",
      body: { schoolId: "other-school", purpose: "deploy" },
    });
    assert.equal(foreign.status, 403);
  });
  let latestProjection;
  await test("Deploy-purpose owner projection exposes only selected effective facts, stable content revision and distinct read observations", async () => {
    latestProjection = await post(admin, "contacts", "/projection", {
      purpose: "deploy",
      schoolId: school,
    });
    const person = latestProjection.staff.find(
      (row) => row.staffId === staffId,
    );
    assert.deepEqual(Object.keys(person.fields).sort(), deployFields);
    assert.equal(person.fields.eo.value, true);
    assert.equal(person.fields.eo.effective, true);
    assert.deepEqual(person.fields.eoAppointmentLevel, {
      state: "missing",
      effective: false,
    });
    for (const name of [
      "birthday",
      "mobile",
      "email",
      "iconEmail",
      "cesEmail",
      "statutoryName",
      "aliases",
      "signature",
    ]) {
      assert(!Object.hasOwn(person.fields, name));
      assert(!Object.hasOwn(person.fieldRevisions, name));
    }
    assert(!JSON.stringify(person).includes("private-signature-marker"));
    assert(!JSON.stringify(person.fields).includes("timeline"));
    const again = await post(admin, "contacts", "/projection", {
      purpose: "deploy",
      schoolId: school,
    });
    assert.equal(again.revision, latestProjection.revision);
    assert.equal(again.sequence, latestProjection.sequence);
    assert.notEqual(
      again.observation.evaluationId,
      latestProjection.observation.evaluationId,
    );
  });
  for (const catalogue of [hr, roles, tags])
    await post(admin, "contacts", "/catalogues", { revision: 0, catalogue });
  // Ordinary teachers may legitimately have no appointment or optional tags.
  // These explicit owner facts establish eligibility without fabricating them.
  await update(staffId, {
    employmentActive: true,
    schoolSection: ref(hr.catalogueId, "PRIMARY"),
  });
  const teacher = "projection-teacher",
    twin = "projection-twin";
  for (const [id, suffix] of [
    [teacher, "One"],
    [twin, "Two"],
  ]) {
    const made = await post(admin, "contacts", "/staff/create", {
      staffId: id,
      basicName: "Synthetic Twin",
      nameSuffix: suffix,
    });
    assert.equal(made.state, "committed");
  }
  await update(teacher, {
    employmentActive: true,
    schoolSection: ref(hr.catalogueId, "PRIMARY"),
    employmentArrangement: ref(hr.catalogueId, "Full-time"),
    role: ref(roles.catalogueId, "Teacher"),
    eoAppointmentLevel: ref(hr.catalogueId, "EO"),
    appointmentStatus: ref(hr.catalogueId, "Confirmed"),
    employmentTags: [],
    subjectTags: [],
  });
  await update(teacher, { mkTags: [], memberships: [] });
  await accept(teacher, "eo", true);
  await update(twin, {
    employmentActive: false,
    employmentTags: [ref(tags.catalogueId, "FAJT")],
  });
  await test("schema1 codes survive duplicate labels and retirement with historical references; same Basic Name keeps distinct permanent identities", async () => {
    const retired = structuredClone(roles);
    retired.revision = "2";
    retired.entries[0].active = false;
    await post(admin, "contacts", "/catalogues", {
      revision: 1,
      catalogue: retired,
    });
    const data = await get(admin, "contacts", "/data"),
      a = data.rows.find((row) => row.id === teacher),
      b = data.rows.find((row) => row.id === twin);
    assert.equal(a.values[0], b.values[0]);
    assert.notEqual(a.values[1], b.values[1]);
    assert.equal(a.values[5], "Teacher");
    assert.equal(a.values[6], "EO");
    assert.equal(a.values[7], "Confirmed");
    assert.equal(b.values[9], "FAJT");
    assert.equal(b.values[8], "N");
    const raw = await get(admin, "contacts", `/staff/${teacher}`);
    assert.deepEqual(
      raw.fields.role.value,
      ref(roles.catalogueId, "Teacher", "2"),
    );
    const history = await (await suite.db("contacts"))
      .prepare(
        "SELECT record_json FROM contacts_history WHERE school_id=? AND staff_id=? AND field='role' AND revision=1",
      )
      .bind(school, teacher)
      .first();
    assert.deepEqual(
      JSON.parse(history.record_json).value,
      ref(roles.catalogueId, "Teacher"),
    );
  });
  await test("selected record evidence identifies the current interval revision instead of the future wrapper revision without exposing timelines", async () => {
    const transitionAt = Date.now() + 60000;
    await accept(teacher, "eo", false, 1, { validFrom: transitionAt });
    await accept(twin, "eo", true, 0, { validFrom: transitionAt });
    const projection = await post(admin, "contacts", "/projection", {
      purpose: "deploy",
      schoolId: school,
    });
    const current = projection.staff.find((row) => row.staffId === teacher)
        .fields.eo,
      future = projection.staff.find((row) => row.staffId === twin).fields.eo;
    assert.equal(current.effective, true);
    assert.equal(current.value, true);
    assert.equal(current.revision, "eo-2");
    assert.equal(
      projection.staff.find((row) => row.staffId === teacher).fieldRevisions.eo,
      3,
    );
    assert.equal(current.validUntil, transitionAt);
    assert.equal(future.effective, false);
    assert.equal(future.value, true);
    assert.equal(future.validFrom, transitionAt);
    assert.equal(projection.validUntil, transitionAt);
    assert(!Object.hasOwn(current, "timeline"));
    assert(!Object.hasOwn(future, "timeline"));
  });
  let pagingVersionId;
  await test("actual Contacts owner facts reach two Deploy versions, retain inactive references and deny new teaching targets", async () => {
    const versions = [];
    for (const name of ["Projection first", "Projection second"])
      versions.push(await post(admin, "deploy", "/versions/create", { name }));
    const versionId = versions[0].versionId;
    pagingVersionId = versionId;
    const boot = () => post(admin, "deploy", "/bootstrap", { versionId });
    let current = (await boot()).current;
    const ordinaryTeacher = current.teachers.find((row) => row.id === staffId);
    assert.equal(ordinaryTeacher.teachingEligibility.state, "eligible");
    assert.equal(ordinaryTeacher.quality, "unavailable");
    assert.equal(ordinaryTeacher.profile.Role, "");
    assert.equal(ordinaryTeacher.profile["EO Appt Level"], "");
    assert.equal(
      current.teachers.find((row) => row.id === teacher).teachingEligibility
        .state,
      "eligible",
    );
    assert.equal(
      current.teachers.find((row) => row.id === twin).teachingEligibility.state,
      "excluded",
    );
    assert.notEqual(
      current.teachers.find((row) => row.id === teacher).ttbName,
      current.teachers.find((row) => row.id === twin).ttbName,
    );
    const save = async (edits, revision, allowError = false) => {
      const lease = await post(admin, "deploy", "/lease", {
        versionId,
        scope: "meta",
        clientId: "projection-client",
      });
      const response = await suite.request(admin, "deploy", "/change", {
        method: "POST",
        body: {
          operationId: operationId(),
          versionId,
          scope: "meta",
          clientId: "projection-client",
          leaseFence: lease.fence,
          revision,
          operation: "saveDraft",
          edits,
        },
      });
      if (!allowError)
        assert.equal(response.status, 200, JSON.stringify(response.body));
      return response;
    };
    await save(
      [
        {
          operation: "addClass",
          ref: "projection-class",
          level: "1",
          name: "Synthetic Class",
          shortName: "P",
        },
        {
          operation: "addTeacher",
          teacher,
          target: "1P",
          targetRef: "projection-class",
          subject: "EL",
        },
      ],
      0,
    );
    current = (await boot()).current;
    const assignment = structuredClone(
      current.assignments.find((row) => row.teacher === teacher),
    );
    assert(assignment);
    await update(teacher, { employmentActive: false });
    await save(
      [
        {
          operation: "setTeacherNote",
          teacher,
          expected: "",
          value: "Historical reference retained",
        },
      ],
      1,
    );
    current = (await boot()).current;
    assert.deepEqual(
      current.assignments.find((row) => row.id === assignment.id),
      assignment,
    );
    assert.equal(
      current.teacherNotes[teacher],
      "Historical reference retained",
    );
    assert.equal(
      current.teachers.find((row) => row.id === teacher).teachingEligibility
        .state,
      "excluded",
    );
    const denied = await save(
      [
        {
          operation: "addTeacher",
          teacher,
          target: "1P",
          targetRef: "projection-class",
          subject: "Math",
        },
      ],
      2,
      true,
    );
    assert.equal(denied.status, 409);
    assert.equal(denied.body.error.code, "TEACHING_ELIGIBILITY_REQUIRED");
    current = (await boot()).current;
    assert.equal(current.revision, 2);
    assert.equal(current.assignments.length, 1);
    const second = await post(admin, "deploy", "/bootstrap", {
      versionId: versions[1].versionId,
    });
    assert.equal(second.current.teacherNotes[teacher], undefined);
    assert.equal(
      second.current.teachers.find((row) => row.id === teacher)
        .teachingEligibility.state,
      "excluded",
    );
  });
  await test("actual owner paging bounds complete 512-staff evidence, rejects tampered and stale cursors, and reaches Deploy without truncation", async () => {
    // This maximum-shape fixture is intentionally seeded in local D1. It tests
    // transport bounds, not a 512-person migration or 512 acceptance writes.
    // The earlier groups establish real owner writes and acceptance semantics.
    const db = await suite.db("contacts"),
      count = await db
        .prepare("SELECT COUNT(*) AS n FROM contacts_staff WHERE school_id=?")
        .bind(school)
        .first(),
      ids = Array.from(
        { length: 512 - count.n },
        (_, index) => `paging-staff-${String(index).padStart(4, "0")}`,
      );
    await db.batch([
      db
        .prepare(
          "INSERT INTO contacts_staff(school_id,staff_id,basic_name,ttb_name,active,section,profile_state,revision,authority_revision,created_at) SELECT p.school_id,j.value,'Synthetic '||j.value,'Synthetic '||j.value,p.active,p.section,p.profile_state,p.revision,p.authority_revision,p.created_at FROM contacts_staff p,json_each(?) j WHERE p.school_id=? AND p.staff_id=?",
        )
        .bind(JSON.stringify(ids), school, teacher),
      db
        .prepare(
          "INSERT INTO contacts_fields(school_id,staff_id,field,revision,state,value_json,timeline_json,valid_from,valid_until,revoked,proposer,accepter,accepted_at,operation_id) SELECT f.school_id,j.value,f.field,f.revision,f.state,f.value_json,f.timeline_json,f.valid_from,f.valid_until,f.revoked,f.proposer,f.accepter,f.accepted_at,f.operation_id FROM contacts_fields f,json_each(?) j WHERE f.school_id=? AND f.staff_id=?",
        )
        .bind(JSON.stringify(ids), school, teacher),
      db
        .prepare(
          "INSERT INTO contacts_fields(school_id,staff_id,field,revision,state,value_json,valid_from,proposer,accepter,accepted_at,operation_id) SELECT ?,p.value,f.value,1,'accepted','false',0,'synthetic-fixture-proposer','synthetic-fixture-accepter',0,'synthetic-paging-fixture' FROM json_each(?) p,json_each('[\"smc\",\"schoolLeader\"]') f",
        )
        .bind(school, JSON.stringify(ids)),
      db
        .prepare(
          "UPDATE contacts_epoch SET revision=revision+1 WHERE school_id=?",
        )
        .bind(school),
    ]);
    const internal = async (service, path, body) => {
      const worker = await suite.mf.getWorker(`gsis-${service}`),
        response = await worker.fetch(`https://internal.invalid${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-gsis-secret": suite.secret,
          },
          body: JSON.stringify(body),
        }),
        text = await response.text();
      return {
        status: response.status,
        body: JSON.parse(text),
        bytes: new TextEncoder().encode(text).length,
      };
    };
    const authorized = await internal("core", "/internal/authorize", {
      schoolId: school,
      sessionToken: admin.token,
      descriptor: {
        service: "deploy",
        action: "deploy.read",
        write: false,
        bodyDigest: "a".repeat(64),
      },
    });
    assert.equal(authorized.status, 200, JSON.stringify(authorized.body));
    const decisionId = authorized.body.data.decisionId,
      page = (cursor) =>
        internal("contacts", "/internal/projection", {
          schoolId: school,
          decisionId,
          purpose: "deploy",
          page: { cursor },
        });
    let cursor = null,
      totalBytes = 0,
      maxBytes = 0,
      pages = 0,
      revision,
      catalogueDigest,
      firstCursor;
    const observed = new Set(),
      observations = new Set();
    do {
      const response = await page(cursor);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const data = response.body.data;
      assert(response.bytes <= 512 * 1024);
      assert(data.staff.length > 0 && data.staff.length <= 64);
      assert.equal(data.page.total, 512);
      assert.equal(data.page.offset, observed.size);
      assert(!Object.hasOwn(data, "people"));
      if (pages) {
        assert.equal(data.revision, revision);
        assert.equal(data.catalogueDigest, catalogueDigest);
      }
      revision = data.revision;
      catalogueDigest = data.catalogueDigest;
      assert(!observations.has(data.observation.evaluationId));
      observations.add(data.observation.evaluationId);
      for (const person of data.staff) {
        assert(!observed.has(person.staffId));
        assert.deepEqual(Object.keys(person.fields).sort(), deployFields);
        assert(
          Object.keys(person.fieldRevisions).every((name) =>
            deployFields.includes(name),
          ),
        );
        assert(!JSON.stringify(person.fields).includes("timeline"));
        observed.add(person.staffId);
      }
      cursor = data.page.nextCursor;
      firstCursor ??= cursor;
      assert.equal(data.page.complete, cursor === null);
      totalBytes += response.bytes;
      maxBytes = Math.max(maxBytes, response.bytes);
      pages++;
      assert(pages <= 32);
    } while (cursor !== null);
    assert.equal(observed.size, 512);
    assert(
      totalBytes > 1024 * 1024,
      "Fixture must exercise more than one 1 MiB service response.",
    );
    const collected = await post(admin, "deploy", "/bootstrap", {
      versionId: pagingVersionId,
    });
    assert.equal(collected.current.teachers.length, 512);
    assert.equal(
      new Set(collected.current.teachers.map((row) => row.id)).size,
      512,
    );
    const tampered = await page(
      firstCursor.slice(0, -1) + (firstCursor.endsWith("0") ? "1" : "0"),
    );
    assert.equal(tampered.status, 400);
    assert.equal(tampered.body.error.code, "INVALID_CURSOR");
    const publicPage = await suite.request(admin, "contacts", "/projection", {
      method: "POST",
      body: { purpose: "deploy", page: { cursor: null } },
    });
    assert.equal(publicPage.status, 400);
    assert.equal(publicPage.body.error.code, "INVALID_PAGE");
    await update(staffId, { ext: "6789" });
    const stale = await page(firstCursor);
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, "SOURCE_REVISION_CHANGED");
    await db
      .prepare(
        "INSERT INTO contacts_staff(school_id,staff_id,basic_name,ttb_name,revision,created_at) VALUES(?,'paging-overflow','Synthetic overflow','Synthetic overflow',1,0)",
      )
      .bind(school)
      .run();
    const overflow = await page(null);
    assert.equal(overflow.status, 413);
    assert.equal(overflow.body.error.code, "DIRECTORY_BOUNDS");
    console.log(
      `Paging evidence: ${pages} pages, ${observed.size} unique staff, ${totalBytes} total UTF-8 bytes, ${maxBytes} largest page.`,
    );
  });
  console.log(
    `${passed} Contacts projection integration groups passed; real local owner mutations and service projections, synthetic identities only. Runtime UAT not performed.`,
  );
} finally {
  await suite.close();
}
