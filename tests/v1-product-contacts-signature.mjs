import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { productSuite } from "./v1-product/suite.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import {
  FORMAL_ROLE_PAIRS,
  formalRole,
  decorateContacts,
} from "../v1/services/contacts/formal-role-display.mjs";

const signature = createRequire(import.meta.url)("../shared/signature.js");
const school = "synthetic-school",
  now = Date.now();
let passed = 0,
  sequence = 0;
const operationId = () => "signature-owner-" + ++sequence;
async function test(name, run) {
  await run();
  passed++;
  console.log("PASS " + name);
}
const roleDefinition = (
  catalogueId,
  revision,
  label,
  code = "ROLE",
  active = true,
) => ({
  catalogueId,
  revision,
  kind: "membership-role",
  entries: [
    { code, label, active, definitionRevision: "definition-" + revision },
  ],
});
const record = (value, extra = {}) => ({
  state: "accepted",
  revision: "role-1",
  value,
  effective: true,
  validFrom: now - 1000,
  validUntil: null,
  revoked: false,
  ...extra,
});
const person = (id, value, extra = {}) => ({
  id,
  staffId: id,
  name: "Synthetic " + id,
  fields: { role: record(value, extra) },
});
const ref = (catalogueId, revision = "1", code = "ROLE") => ({
  catalogueId,
  revision,
  code,
});

await test("all 59 source pairs retain the pinned order, bytes and formal spelling", async () => {
  const bytes = Buffer.from(JSON.stringify(FORMAL_ROLE_PAIRS));
  assert.equal(FORMAL_ROLE_PAIRS.length, 59);
  assert.equal(new Set(FORMAL_ROLE_PAIRS.map(([key]) => key)).size, 59);
  assert.equal(bytes.length, 2558);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "47a5343e3fc1459a660f1a877aadf1bf499318c2eeffe35503cf387eb4b7c571",
  );
  for (const [short, formal] of FORMAL_ROLE_PAIRS) {
    assert.equal(formalRole(short), formal);
    assert.equal(formalRole(formal), formal);
  }
  assert.equal(formalRole("Unlisted legitimate appointment"), "");
  assert.equal(formalRole("LT"), "");
  assert.equal(formalRole("hod ict"), "");
  assert.equal(
    signature.designation({ formalRole: formalRole("TC") }, {}, false),
    "Teacher",
  );
  assert.equal(
    signature.designation({ formalRole: formalRole("Counsellor") }, {}, false),
    "School Counsellor",
  );
  assert.equal(
    signature.designation(
      { formalRole: "", teachingAssignments: [{ subject: "Math" }] },
      {},
      false,
    ),
    "Teacher",
  );
  assert.equal(
    signature.designation(
      {
        formalRole: "",
        teachingAssignments: [
          { subject: "Math" },
          { subject: "MA" },
          { subject: "PE" },
          { subject: "FT" },
          { subject: "PD" },
          { subject: "Duty" },
        ],
      },
      {},
      true,
    ),
    "Teacher (Mathematics & Physical Education)",
  );
  assert.equal(signature.SUBJECTS.length, 10);
});

// A focused synthetic SQL adapter exposes code/label collisions before any
// Worker starts. The following groups exercise actual local owner/D1 reads.
await test("historical role identity follows the pinned label, never a coincidentally known code", async () => {
  const definitions = [
    roleDefinition("collision-one", "1", "HOD ICT", "P"),
    roleDefinition(
      "collision-two",
      "1",
      "Unlisted legitimate appointment",
      "P",
    ),
  ];
  const db = {
    prepare: () => ({
      bind: () => ({
        all: async () => ({
          success: true,
          results: definitions.map((definition) => ({
            body: JSON.stringify(definition),
          })),
        }),
      }),
    }),
  };
  const rows = await decorateContacts(
    db,
    school,
    [
      person("one", ref("collision-one", "1", "P")),
      person("two", ref("collision-two", "1", "P")),
    ],
    now,
  );
  assert.equal(
    rows[0].formalRole,
    "Head of Department (Information and Communication Technology)",
  );
  assert.equal(rows[1].formalRole, "");
  assert.equal(rows[1].signatureSource.available, true);
});

const bindings = {
  GOOGLE_CLIENT_ID: "synthetic-signature.apps.googleusercontent.com",
  HOSTED_DOMAIN: "example.invalid",
};
const suite = await productSuite({ bindings });
let restarted,
  originalClosed = false;
try {
  const admin = await suite.seedAccount("signature-admin"),
    reader = await suite.seedAccount("signature-reader", { capabilities: [] }),
    otherPower = await suite.seedAccount("signature-other-power", {
      capabilities: ["deploy.powerUser"],
    });
  async function get(user, path) {
    const response = await suite.request(user, "contacts", path);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body.data;
  }
  const owner = (path, body) =>
    suite.call(admin, "contacts", path, {
      operationId: operationId(),
      ...body,
    });
  const create = (staffId) =>
    owner("/staff/create", { staffId, basicName: "Synthetic " + staffId });
  const update = async (staffId, changes) =>
    owner("/staff/" + staffId + "/update", {
      revision: (await get(admin, "/staff/" + staffId)).revision,
      changes,
    });
  await create("signature-self-person");
  await update("signature-self-person", {
    role: "HOD ICT",
    statutoryName: "Synthetic Signature Name",
    email: "signature-self@example.invalid",
    ext: "4321",
  });
  const self = await suite.seedAccount("signature-self", {
    staffId: "signature-self-person",
    capabilities: [],
  });
  const db = await suite.db("contacts");
  async function storedState() {
    const result = {};
    for (const table of [
      "contacts_staff",
      "contacts_fields",
      "contacts_history",
      "contacts_snapshots",
      "contacts_catalogues",
      "contacts_epoch",
      "product_operations",
      "product_audit",
    ])
      result[table] = (
        await db.prepare("SELECT * FROM " + table + " ORDER BY rowid").all()
      ).results;
    return JSON.stringify(result);
  }
  await test("actual bootstrap, grid and DIY share one formal source while preserving private fields", async () => {
    const before = await storedState();
    const boot = await get(admin, "/bootstrap"),
      grid = await get(admin, "/data"),
      diy = await get(self, "/diy");
    const p = boot.people.find((p) => p.id === self.staffId),
      r = grid.rows.find((p) => p.id === self.staffId);
    for (const value of [p, r, diy.rows[0]]) {
      assert.equal(value.formalRole, formalRole("HOD ICT"));
      assert.equal(value.signatureSource.available, true);
      assert.equal(value.signatureSource.reason, null);
    }
    assert.deepEqual(r.values, diy.rows[0].values);
    assert.equal(grid.fields.length, 25);
    assert.equal(r.values[grid.fields.indexOf("EXT")], "4321");
    assert.equal(p.statutoryName, "Synthetic Signature Name");
    for (const user of [reader, otherPower]) {
      const view = await get(user, "/bootstrap");
      const hidden = view.people.find((p) => p.id === self.staffId);
      assert.equal(hidden.formalRole, p.formalRole);
      assert.equal(hidden.statutoryName, "");
      assert(!JSON.stringify(hidden).includes("Synthetic Signature Name"));
      assert.equal(view.editable, false);
    }
    assert.equal(
      await storedState(),
      before,
      "presentation reads never rewrite facts/history/snapshots/receipts",
    );
  });

  async function insertDefinition(
    definition,
    schoolId = school,
    body = JSON.stringify(definition),
  ) {
    await db
      .prepare(
        "INSERT OR REPLACE INTO contacts_catalogues(school_id,catalogue_id,revision,body) VALUES(?,?,?,?)",
      )
      .bind(schoolId, definition.catalogueId, Number(definition.revision), body)
      .run();
  }
  const old = roleDefinition(
      "signature-history",
      "1",
      "HOD ICT",
      "SAME",
      false,
    ),
    latest = roleDefinition("signature-history", "2", "P", "SAME");
  await insertDefinition(old);
  await insertDefinition(latest);
  await insertDefinition(
    roleDefinition("signature-foreign", "1", "P"),
    "foreign-school",
  );
  await insertDefinition(
    roleDefinition("signature-corrupt", "1", "P"),
    school,
    "{broken-json",
  );
  await insertDefinition({
    ...roleDefinition("signature-wrong-kind", "1", "P"),
    kind: "hr-term",
  });
  await insertDefinition({
    ...roleDefinition("signature-duplicate", "1", "P"),
    entries: [...old.entries, ...old.entries],
  });
  await test("actual pinned lookup retains retired revisions and contains missing, foreign, corrupt and ambiguous evidence", async () => {
    const rows = await decorateContacts(
      db,
      school,
      [
        person("old", ref("signature-history", "1", "SAME")),
        person("latest", ref("signature-history", "2", "SAME")),
        ...["missing", "foreign", "corrupt", "wrong-kind", "duplicate"].map(
          (s) =>
            person(
              s,
              ref("signature-" + s, "1", s === "duplicate" ? "SAME" : "ROLE"),
            ),
        ),
        person("malformed", {
          catalogueId: "signature-history",
          revision: "1",
        }),
        {
          ...person("subject-evidence", "P", { valueSchema: 2 }),
          fields: {
            role: record("P", { valueSchema: 2 }),
            subjectTags: record([ref("missing-subject-definition")]),
          },
        },
      ],
      now,
    );
    assert.equal(rows[0].formalRole, formalRole("HOD ICT"));
    assert.equal(rows[1].formalRole, "Principal");
    for (const row of rows.slice(2)) {
      assert.equal(row.formalRole, "");
      assert.deepEqual(row.signatureSource, {
        available: false,
        reason: "PINNED_EVIDENCE_UNAVAILABLE",
        asOf: now,
        validUntil: null,
      });
      assert.equal(row.name, "Synthetic " + row.id);
    }
    // A historical JSON value is seeded directly because new public writes
    // deliberately reject references. This is a synthetic legacy fixture.
    await db
      .prepare(
        "UPDATE contacts_fields SET value_json=?,timeline_json=NULL WHERE school_id=? AND staff_id=? AND field='role'",
      )
      .bind(
        JSON.stringify(ref("signature-history", "1", "SAME")),
        school,
        self.staffId,
      )
      .run();
    assert.equal(
      (await get(self, "/bootstrap")).people.find((p) => p.id === self.staffId)
        .formalRole,
      formalRole("HOD ICT"),
    );
    await db
      .prepare(
        "UPDATE contacts_fields SET value_json=? WHERE school_id=? AND staff_id=? AND field='role'",
      )
      .bind(JSON.stringify(ref("signature-missing")), school, self.staffId)
      .run();
    const missing = (await get(reader, "/bootstrap")).people.find(
      (p) => p.id === self.staffId,
    );
    assert.equal(missing.signatureSource.available, false);
    assert.equal(missing.statutoryName, "");
  });

  await test("absence, pending, revoked and interval boundaries retain fallback and source expiry without role inference", async () => {
    const noRead = {
      prepare() {
        throw Error("Direct-only signatures must not read catalogues");
      },
    };
    const rows = await decorateContacts(
      noRead,
      school,
      [
        { id: "absent", fields: {} },
        person("unknown", "New appointment", { valueSchema: 2 }),
        person("pending", "P", { state: "pending", valueSchema: 2 }),
        person("future", "P", {
          effective: false,
          valueSchema: 2,
          validFrom: now + 1000,
        }),
        person("expired", "P", {
          effective: false,
          valueSchema: 2,
          validUntil: now - 1,
        }),
        person("revoked", "P", { valueSchema: 2, revoked: true }),
        person("bounded", "P", {
          valueSchema: 2,
          validUntil: now + 2000,
          timeline: [
            record("HOD ICT", { valueSchema: 2, validFrom: now + 1000 }),
          ],
        }),
      ],
      now,
    );
    for (const row of rows.slice(0, 6)) {
      assert.equal(row.formalRole, "");
      assert.equal(row.signatureSource.available, true);
    }
    assert.equal(rows[3].signatureSource.validUntil, now + 1000);
    assert.equal(rows[6].formalRole, "Principal");
    assert.equal(rows[6].signatureSource.validUntil, now + 1000);
  });

  await test("512 distinct pinned references use one bounded actual D1 lookup; 513 reject before SQL", async () => {
    const defs = Array.from({ length: 512 }, (_, i) =>
      roleDefinition("signature-bound-" + i, "1", "HOD ICT"),
    );
    await db
      .prepare(
        "INSERT INTO contacts_catalogues(school_id,catalogue_id,revision,body) SELECT ?,json_extract(value,'$.catalogueId'),1,json_extract(value,'$.body') FROM json_each(?)",
      )
      .bind(
        school,
        JSON.stringify(
          defs.map((d) => ({
            catalogueId: d.catalogueId,
            body: JSON.stringify(d),
          })),
        ),
      )
      .run();
    const queries = [];
    const counted = {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async all() {
                const response = await db
                  .prepare(sql)
                  .bind(...args)
                  .all();
                queries.push({
                  sql,
                  binds: args.length,
                  inputBytes: Buffer.byteLength(JSON.stringify(args)),
                  resultBytes: Buffer.byteLength(
                    JSON.stringify(response.results),
                  ),
                });
                return response;
              },
            };
          },
        };
      },
    };
    const input = defs.map((d, i) =>
      person("bounded-" + i, ref(d.catalogueId)),
    );
    const output = await decorateContacts(counted, school, input, now);
    assert.equal(output.length, 512);
    assert(output.every((p) => p.formalRole === formalRole("HOD ICT")));
    assert.equal(queries.length, 1);
    assert.equal(queries[0].binds, 2);
    assert(
      queries[0].inputBytes < 1024 * 1024 &&
        queries[0].resultBytes < 1024 * 1024,
    );
    await assert.rejects(
      decorateContacts(
        counted,
        school,
        [...input, person("over", ref("signature-bound-over"))],
        now,
      ),
      (e) => e.code === "REFERENCE_BOUNDS",
    );
    assert.equal(queries.length, 1);
    console.log(
      "MEASURE signature pinned lookup " + JSON.stringify(queries[0]),
    );
  });
  await test("process restart reconstructs the same pinned signature from persisted D1 without an isolate cache", async () => {
    const input = [person("restart", ref("signature-history", "1", "SAME"))];
    const before = await decorateContacts(db, school, input, now);
    await suite.mf.dispose();
    originalClosed = true;
    restarted = await startProduct({
      persistPath: join(suite.path, "state"),
      output: join(suite.path, "restarted"),
      bindings,
      migrateSchemas: false,
    });
    const after = await decorateContacts(
      await restarted.db("contacts"),
      school,
      input,
      now,
    );
    assert.deepEqual(after, before);
  });
} finally {
  await restarted?.close();
  if (!originalClosed) await suite.close();
  else await rm(suite.path, { recursive: true, force: true });
}
console.log(`${passed}/${passed} signature source groups passed`);
