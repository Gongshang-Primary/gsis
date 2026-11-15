import {
  fixture,
  cases,
  assert,
  createContactsReader,
} from "./v1-contacts-contracts.mjs";
import {
  fieldVector,
  GROUPS,
  validateFields,
} from "../v1/contacts/contracts.mjs";
import {
  encodeDirectValue,
  decodeStoredValue,
} from "../v1/contacts/direct-fields.mjs";
import { digest } from "../v1/core/contracts.mjs";
import { createDatabase } from "./v1-product/helpers.mjs";
import { handle as core, authorizeCore } from "../v1/services/core/service.mjs";
import { handle as contacts } from "../v1/services/contacts/service.mjs";
import { requireMembership } from "../v1/runtime/admission.mjs";
import {
  canonical,
  digest as runtimeDigest,
  one,
  query,
  statement,
  operationStatus,
} from "../v1/runtime/store.mjs";
import {
  makeSnapshots,
  record,
  staffRecord,
} from "../v1/services/contacts/store.mjs";
import {
  previewDirectConversion,
  applyDirectConversion,
} from "../v1/services/contacts/direct-conversion.mjs";
function directFixture() {
  const f = fixture("staff");
  const old = structuredClone(f.s);
  f.s.schemaVersion = 2;
  f.s.fields.role = [
    {
      ...f.s.fields.role[0],
      ...decodeStoredValue("role", encodeDirectValue("role", "P")),
    },
  ];
  f.s.fields.memberships = [
    {
      ...f.s.fields.memberships[0],
      ...decodeStoredValue("memberships", encodeDirectValue("memberships", [])),
    },
  ];
  f.s.catalogues = f.s.catalogues.filter(
    (c) => !["cat-role", "cat-memberships"].includes(c.catalogueId),
  );
  f.groups();
  return { ...f, old };
}
await cases([
  [
    "schema2 mixed staff snapshots retain exact schema1 records and observations",
    async () => {
      const f = directFixture(),
        first = await f.reader.readAcceptedFacts(f.query);
      assert.equal(first.kind, "current");
      assert.equal(first.snapshot.schemaVersion, 2);
      assert.deepEqual(
        first.snapshot.fields.employmentTags,
        f.old.fields.employmentTags,
      );
      const identity = first.contentDigest;
      f.state.now++;
      const later = await f.reader.readAcceptedFacts(f.query);
      assert.equal(later.contentDigest, identity);
      assert.equal(later.snapshot.sequence, first.snapshot.sequence);
      assert.notEqual(later.observation.asOf, first.observation.asOf);
      assert.equal(later.snapshot.fields.role[0].value, "P");
    },
  ],
  [
    "schema1 historical digest and strict reference validation are never broadened",
    async () => {
      const f = fixture("staff"),
        first = await f.reader.readAcceptedFacts(f.query),
        old = JSON.stringify(first.snapshot);
      const restarted = createContactsReader({
        ...f.options,
        readHistorical: async () => ({
          schemaVersion: 1,
          kind: "historical",
          snapshot: JSON.parse(old),
        }),
      });
      const recovered = await restarted.recoverSnapshot(f.ref(first));
      assert.equal(recovered.kind, "historical");
      assert.equal(JSON.stringify(recovered.snapshot), old);
      assert.equal(recovered.contentDigest, await digest(JSON.parse(old)));
      assert.equal(recovered.observationRecovery, "not-provided");
      f.s.fields.role[0].value = "P";
      assert.equal(
        (await createContactsReader(f.options).readAcceptedFacts(f.query)).code,
        "INVALID_EVIDENCE",
      );
      assert.throws(() => validateFields(directFixture().s.fields, "staff"));
    },
  ],
  [
    "schema2 does not extend Core authority or admit unknown metadata",
    async () => {
      const authority = fixture();
      authority.s.schemaVersion = 2;
      assert.equal(
        (await authority.reader.readAcceptedFacts(authority.query)).code,
        "INVALID_EVIDENCE",
      );
      for (const patch of [
        { valueSchema: 3 },
        { valueSchema: 2, value: { code: "P" } },
        { authority: true },
        { legacy: { items: [] } },
      ]) {
        const f = directFixture();
        Object.assign(f.s.fields.role[0], patch);
        assert.equal(
          (await f.reader.readAcceptedFacts(f.query)).code,
          "INVALID_EVIDENCE",
        );
      }
      const f = directFixture();
      f.s.fields.role[0].valueSchema = undefined;
      assert.equal(
        (await f.reader.readAcceptedFacts(f.query)).code,
        "INVALID_EVIDENCE",
      );
    },
  ],
  [
    "re-encoding under a reused immutable field revision is rejected",
    async () => {
      const f = fixture("staff"),
        first = await f.reader.readAcceptedFacts(f.query);
      assert.equal(first.kind, "current");
      f.s.schemaVersion = 2;
      f.s.sequence++;
      f.s.revision = "new-source";
      f.s.snapshotId = "new-snapshot";
      f.s.fields.role[0] = {
        ...f.s.fields.role[0],
        ...decodeStoredValue("role", encodeDirectValue("role", "P")),
      };
      f.s.catalogues = f.s.catalogues.filter(
        (c) => c.catalogueId !== "cat-role",
      );
      f.groups();
      const result = await f.reader.readAcceptedFacts(f.query);
      assert.equal(result.code, "STALE_EVIDENCE");
      f.s.fields.role[0].revision = "role-2";
      for (const [name, group] of Object.entries(f.s.groups))
        group.vector = fieldVector(f.s.fields, GROUPS[name]);
      assert.equal((await f.reader.readAcceptedFacts(f.query)).kind, "current");
    },
  ],
]);

// Actual D1 and real Core evidence/pins; identities and legacy rows are explicit
// historical fixtures. No current catalogue-creation endpoint is used.
const c = await createDatabase("core"),
  p = await createDatabase("contacts");
const base = {
  SCHOOL_ID: "conversion-school",
  PUBLIC_ORIGIN: "https://conversion.example.test",
  GSIS_SECRET: "synthetic-conversion-local-secret",
  HOSTED_DOMAIN: "example.test",
};
const ce = { ...base, DB: c.db, SERVICE_NAME: "core" },
  pe = { ...base, DB: p.db, SERVICE_NAME: "contacts" };
const envs = { core: ce, contacts: pe };
function binding(service) {
  return {
    fetch: async (request) => {
      const env = envs[service];
      try {
        await requireMembership(env, request);
        const path = new URL(request.url).pathname,
          body = await request.json();
        const data =
          path === "/internal/operation-status"
            ? await operationStatus(env.DB, body.schoolId, body.operationId)
            : await (service === "core" ? core : contacts)({
                env,
                path,
                body,
                method: "POST",
                request,
                internal: true,
                now: Date.now(),
              });
        return Response.json({ ok: true, data });
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error: { code: error.code ?? "ERROR", message: error.message },
          },
          { status: error.status ?? 500 },
        );
      }
    },
  };
}
for (const env of Object.values(envs)) {
  env.CORE = binding("core");
  env.CONTACTS = binding("contacts");
}
const now = Date.now(),
  token = "conversion-token";
let serial = 0;
async function authorize(body) {
  return authorizeCore(
    ce,
    {
      schoolId: base.SCHOOL_ID,
      sessionToken: token,
      csrfToken: "conversion-csrf",
      origin: base.PUBLIC_ORIGIN,
      descriptor: {
        service: "contacts",
        action: "contacts.manage",
        write: true,
        operationId: body.operationId,
        bodyDigest: await runtimeDigest(body),
        requestId: `conversion-request-${++serial}`,
      },
    },
    Date.now(),
  );
}
try {
  await statement(
    ce.DB,
    "INSERT INTO core_accounts(school_id,account_id,issuer,subject,email,staff_id,created_at) VALUES(?,?,'https://accounts.google.com',?,?,?,?)",
    [
      base.SCHOOL_ID,
      "conversion-admin",
      "conversion-google",
      "admin@example.test",
      "admin-staff",
      now,
    ],
  ).run();
  await statement(
    ce.DB,
    "INSERT INTO core_grants(school_id,account_id,capability,valid_from) VALUES(?,?,?,0)",
    [base.SCHOOL_ID, "conversion-admin", "admin"],
  ).run();
  await statement(
    ce.DB,
    "INSERT INTO core_sessions(school_id,session_id,token_hash,account_id,authenticated_at,expires_at,csrf_token) VALUES(?,?,?,?,?,?,?)",
    [
      base.SCHOOL_ID,
      "conversion-session",
      await runtimeDigest(token),
      "conversion-admin",
      now - 100,
      now - 100 + 864000000,
      "conversion-csrf",
    ],
  ).run();
  const flags = Object.fromEntries(
    ["sl", "sc", "smc", "kp", "tl", "sdt", "cmt", "sat", "support", "mk"].map(
      (key) => [key, false],
    ),
  );
  const definitions = [
    {
      catalogueId: "old-role",
      revision: "1",
      kind: "membership-role",
      entries: [
        {
          code: "P",
          label: "Principal",
          active: false,
          definitionRevision: "role-definition",
          flags,
          eoAppointment: {
            catalogueId: "old-level",
            revision: "1",
            code: "HOD",
          },
        },
      ],
    },
    {
      catalogueId: "old-tags",
      revision: "1",
      kind: "operational-tag",
      entries: [
        {
          code: "UT",
          label: "Untrained Teacher",
          active: false,
          definitionRevision: "tag-UT",
          category: "employmentTags",
          ttbVisible: true,
          order: 0,
        },
        {
          code: "BT",
          label: "Beginning Teacher",
          active: true,
          definitionRevision: "tag-BT",
          category: "employmentTags",
          ttbVisible: true,
          order: 1,
        },
      ],
    },
  ];
  definitions.push({
    catalogueId: "old-level",
    revision: "1",
    kind: "hr-term",
    entries: [
      {
        code: "HOD",
        label: "Head of Department",
        active: true,
        definitionRevision: "level-HOD",
        category: "eoAppointmentLevel",
      },
    ],
  });
  for (const catalogue of definitions)
    await statement(
      pe.DB,
      "INSERT INTO contacts_catalogues(school_id,catalogue_id,revision,body) VALUES(?,?,?,?)",
      [base.SCHOOL_ID, catalogue.catalogueId, 1, canonical(catalogue)],
    ).run();
  const newerRole = {
    ...definitions[0],
    revision: "2",
    entries: definitions[0].entries.map((entry) => ({
      ...entry,
      label: "Later definition must not reinterpret history",
    })),
  };
  await statement(
    pe.DB,
    "INSERT INTO contacts_catalogues(school_id,catalogue_id,revision,body) VALUES(?,?,2,?)",
    [base.SCHOOL_ID, "old-role", canonical(newerRole)],
  ).run();
  const staffId = "legacy-person",
    future = now + 120000;
  await statement(
    pe.DB,
    "INSERT INTO contacts_staff(school_id,staff_id,basic_name,ttb_name,revision,created_at) VALUES(?,?,?,?,?,?)",
    [
      base.SCHOOL_ID,
      staffId,
      "Synthetic Legacy",
      "Synthetic Legacy (Untrained Teacher)",
      1,
      now,
    ],
  ).run();
  const ref = (catalogueId, code) => ({ catalogueId, revision: "1", code });
  const values = {
    basicName: "Synthetic Legacy",
    ttbName: "Synthetic Legacy (Beginning Teacher)",
    role: ref("old-role", "P"),
    employmentTags: [ref("old-tags", "BT")],
  };
  for (const [field, value] of Object.entries(values)) {
    const row = {
      school_id: base.SCHOOL_ID,
      staff_id: staffId,
      field,
      revision: ["employmentTags", "ttbName"].includes(field) ? 2 : 1,
      state: "accepted",
      value_json: canonical(value),
      valid_from: ["employmentTags", "ttbName"].includes(field) ? future : 0,
      valid_until: null,
      revoked: 0,
      proposer: "historical-manager",
      accepter: "historical-manager",
      accepted_at: now - 1000,
      operation_id: "historical-operation",
    };
    const timeline =
      field === "employmentTags"
        ? [
            {
              state: "accepted",
              revision: "employmentTags-1",
              value: [ref("old-tags", "UT")],
              validFrom: 0,
              validUntil: future,
              revoked: false,
            },
            record(row),
          ]
        : field === "ttbName"
          ? [
              {
                state: "accepted",
                revision: "ttbName-1",
                value: "Synthetic Legacy (Untrained Teacher)",
                validFrom: 0,
                validUntil: future,
                revoked: false,
              },
              record(row),
            ]
          : [record(row)];
    const columns = Object.keys(row);
    await statement(
      pe.DB,
      `INSERT INTO contacts_fields(${columns.join(",")},timeline_json) VALUES(${columns.map(() => "?").join(",")},?)`,
      [...Object.values(row), canonical(timeline)],
    ).run();
    for (const r of timeline)
      await statement(
        pe.DB,
        "INSERT INTO contacts_history(school_id,staff_id,field,revision,record_json) VALUES(?,?,?,?,?)",
        [
          base.SCHOOL_ID,
          staffId,
          field,
          Number(r.revision.slice(field.length + 1)),
          canonical(r),
        ],
      ).run();
  }
  const initial = await staffRecord(pe.DB, base.SCHOOL_ID, staffId);
  for (const write of await makeSnapshots(
    pe.DB,
    base.SCHOOL_ID,
    staffId,
    1,
    initial.fields,
  ))
    await statement(pe.DB, write.sql, write.args).run();
  const oldSnapshots = await query(
    pe.DB,
    "SELECT snapshot_id,digest,body FROM contacts_snapshots ORDER BY snapshot_id",
  );
  const oldHistory = await query(
    pe.DB,
    "SELECT field,revision,record_json FROM contacts_history ORDER BY field,revision",
  );
  const plan = await previewDirectConversion({
    db: pe.DB,
    schoolId: base.SCHOOL_ID,
    staffId,
    fields: ["role", "employmentTags"],
    now,
  });
  assert.equal(plan.state, "ready");
  assert.equal(plan.proposed.length, 2);
  const body = {
    schemaVersion: 1,
    operationId: "convert-original",
    staffId,
    fields: plan.fields,
    expectedStaffRevision: plan.expectedStaffRevision,
    expectedFields: plan.expectedFields,
    sourceDefinitions: plan.sourceDefinitions,
    planDigest: plan.planDigest,
  };
  let conversionStatements = 0;
  const rawDb = pe.DB;
  pe.DB = {
    prepare(sql) {
      let raw = rawDb.prepare(sql);
      const wrapped = {
        get raw() {
          return raw;
        },
        bind(...args) {
          raw = raw.bind(...args);
          return wrapped;
        },
        first(...args) {
          conversionStatements++;
          return raw.first(...args);
        },
        all(...args) {
          conversionStatements++;
          return raw.all(...args);
        },
        run(...args) {
          conversionStatements++;
          return raw.run(...args);
        },
      };
      return wrapped;
    },
    batch(statements) {
      conversionStatements += statements.length;
      return rawDb.batch(statements.map((s) => s.raw ?? s));
    },
  };
  const original = await applyDirectConversion({
    env: pe,
    principal: await authorize(body),
    body,
    now: Date.now(),
  });
  assert.equal(original.state, "committed");
  assert.ok(
    conversionStatements <= 50,
    `Full conversion owner query count ${conversionStatements} exceeds 50`,
  );
  console.log(
    `Conversion owner statements: ${conversionStatements}/50, including admission/receipt queries`,
  );
  assert.equal(original.result.revision, 2);
  const converted = await staffRecord(pe.DB, base.SCHOOL_ID, staffId);
  assert.equal(record(converted.fields.role).value, "P");
  assert.equal(
    record(converted.fields.role).legacy.items[0].label,
    "Principal",
  );
  const tags = JSON.parse(converted.fields.employmentTags.timeline_json);
  assert.deepEqual(
    tags.map((r) => r.value),
    [["UT"], ["BT"]],
  );
  assert.equal(tags[0].validUntil, future);
  assert.equal(tags[1].validFrom, future);
  assert.ok(tags.every((r) => r.valueSchema === 2 && r.legacy));
  const currentSnapshot = await one(
    pe.DB,
    "SELECT body FROM contacts_snapshots WHERE school_id=? AND staff_id=? AND staff_revision=2 AND profile='staff'",
    [base.SCHOOL_ID, staffId],
  );
  assert.equal(JSON.parse(currentSnapshot.body).schemaVersion, 2);
  assert.deepEqual(
    JSON.parse(currentSnapshot.body).fields.eoAppointmentLevel,
    [{ state: "missing" }],
    "A role catalogue mapping never becomes explicit appointment or authority",
  );
  const authority = await one(
    pe.DB,
    "SELECT body FROM contacts_snapshots WHERE school_id=? AND staff_id=? AND staff_revision=2 AND profile='authority'",
    [base.SCHOOL_ID, staffId],
  );
  assert.equal(JSON.parse(authority.body).schemaVersion, 1);
  assert.deepEqual(JSON.parse(authority.body).fields.smc, [
    { state: "missing" },
  ]);
  // Discard the first response, restart both owning stores, then recover by the
  // same original body. Re-running its old preflight would now conflict.
  await p.restart();
  await c.restart();
  pe.DB = p.db;
  ce.DB = c.db;
  const replay = await applyDirectConversion({
    env: pe,
    principal: await authorize(body),
    body,
    now: Date.now(),
  });
  assert.deepEqual(replay, original);
  assert.equal(
    (
      await one(
        pe.DB,
        "SELECT COUNT(*) n FROM product_audit WHERE operation_id='convert-original'",
      )
    ).n,
    1,
  );
  for (const row of oldSnapshots)
    assert.deepEqual(
      await one(
        pe.DB,
        "SELECT snapshot_id,digest,body FROM contacts_snapshots WHERE snapshot_id=?",
        [row.snapshot_id],
      ),
      row,
    );
  for (const row of oldHistory)
    assert.deepEqual(
      await one(
        pe.DB,
        "SELECT field,revision,record_json FROM contacts_history WHERE field=? AND revision=?",
        [row.field, row.revision],
      ),
      row,
    );
  const changed = { ...body, fields: ["role"] };
  await assert.rejects(
    applyDirectConversion({
      env: pe,
      principal: await authorize(changed),
      body: changed,
      now: Date.now(),
    }),
    (error) => error.code === "OPERATION_INTENT_CONFLICT",
  );
  assert.equal(
    (await one(pe.DB, "SELECT COUNT(*) n FROM contacts_acceptance_audit")).n,
    0,
  );
  console.log(
    "PASS actual D1 conversion preserves pinned current/future facts and original history; restart replays one Core-authorized receipt",
  );
  // A real subsequent Contacts owner change makes the old no-op conversion
  // preview stale before any conversion operation is prepared.
  const stale = await previewDirectConversion({
    db: pe.DB,
    schoolId: base.SCHOOL_ID,
    staffId,
    fields: ["role"],
    now: Date.now(),
  });
  const update = {
    operationId: "concurrent-owner-edit",
    revision: 2,
    changes: { mobile: "81234567" },
  };
  await contacts({
    env: pe,
    principal: await authorize(update),
    path: `/staff/${staffId}/update`,
    method: "POST",
    body: update,
    now: Date.now(),
  });
  const staleBody = {
    schemaVersion: 1,
    operationId: "stale-conversion",
    staffId,
    fields: stale.fields,
    expectedStaffRevision: stale.expectedStaffRevision,
    expectedFields: stale.expectedFields,
    sourceDefinitions: stale.sourceDefinitions,
    planDigest: stale.planDigest,
  };
  await assert.rejects(
    applyDirectConversion({
      env: pe,
      principal: await authorize(staleBody),
      body: staleBody,
      now: Date.now(),
    }),
    (error) => error.code === "REVISION_CONFLICT",
  );
  assert.equal(
    await operationStatus(pe.DB, base.SCHOOL_ID, staleBody.operationId),
    null,
  );
  await statement(
    pe.DB,
    "INSERT INTO contacts_staff(school_id,staff_id,basic_name,ttb_name,revision,created_at) VALUES(?,?,?,?,1,?)",
    [base.SCHOOL_ID, "broken-person", "Broken fixture", "Broken fixture", now],
  ).run();
  await statement(
    pe.DB,
    "INSERT INTO contacts_fields(school_id,staff_id,field,revision,state,value_json,valid_from,revoked,proposer,operation_id) VALUES(?,?,'role',1,'accepted',?,0,0,'historical-manager','historical-broken')",
    [base.SCHOOL_ID, "broken-person", canonical(ref("missing-role", "P"))],
  ).run();
  const broken = await previewDirectConversion({
    db: pe.DB,
    schoolId: base.SCHOOL_ID,
    staffId: "broken-person",
    fields: ["role"],
    now: Date.now(),
  });
  assert.equal(broken.state, "repair-required");
  assert.equal(broken.repairs.length, 1);
  assert.equal(
    (
      await one(
        pe.DB,
        "SELECT revision FROM contacts_staff WHERE staff_id='broken-person'",
      )
    ).revision,
    1,
  );
  console.log(
    "PASS actual owner concurrency and missing pinned definitions prevent partial conversion before prepare",
  );
  const racePlan = await previewDirectConversion({
    db: pe.DB,
    schoolId: base.SCHOOL_ID,
    staffId,
    fields: ["role"],
    now: Date.now(),
  });
  const raceBody = {
    schemaVersion: 1,
    operationId: "commit-race-conversion",
    staffId,
    fields: racePlan.fields,
    expectedStaffRevision: racePlan.expectedStaffRevision,
    expectedFields: racePlan.expectedFields,
    sourceDefinitions: racePlan.sourceDefinitions,
    planDigest: racePlan.planDigest,
  };
  const racePrincipal = await authorize(raceBody),
    unwrapped = pe.DB;
  let interrupted = false;
  pe.DB = {
    prepare(sql) {
      let raw = unwrapped.prepare(sql);
      const wrapped = {
        sql,
        get raw() {
          return raw;
        },
        bind(...args) {
          raw = raw.bind(...args);
          return wrapped;
        },
        first(...args) {
          return raw.first(...args);
        },
        all(...args) {
          return raw.all(...args);
        },
        run(...args) {
          return raw.run(...args);
        },
      };
      return wrapped;
    },
    async batch(statements) {
      if (
        !interrupted &&
        statements.some((s) => s.sql?.includes("INSERT INTO product_audit"))
      ) {
        interrupted = true;
        const winning = {
          operationId: "winning-owner-edit",
          revision: racePlan.expectedStaffRevision,
          changes: { mobile: "81234568" },
        };
        const won = await contacts({
          env: pe,
          principal: await authorize(winning),
          path: `/staff/${staffId}/update`,
          method: "POST",
          body: winning,
          now: Date.now(),
        });
        assert.equal(won.state, "committed");
      }
      return unwrapped.batch(statements.map((s) => s.raw ?? s));
    },
  };
  await assert.rejects(
    applyDirectConversion({
      env: pe,
      principal: racePrincipal,
      body: raceBody,
      now: Date.now(),
    }),
    (error) => error.code === "REVISION_CONFLICT",
  );
  pe.DB = unwrapped;
  assert.equal(interrupted, true);
  const lost = await operationStatus(
    pe.DB,
    base.SCHOOL_ID,
    raceBody.operationId,
  );
  assert.equal(lost.state, "aborted");
  assert.equal(lost.receipt.state, "terminal-not-committed");
  const terminalReplay = await applyDirectConversion({
    env: pe,
    principal: await authorize(raceBody),
    body: raceBody,
    now: Date.now(),
  });
  assert.deepEqual(terminalReplay, lost.receipt);
  assert.equal(
    (
      await one(
        pe.DB,
        "SELECT COUNT(*) AS n FROM product_audit WHERE operation_id=?",
        [raceBody.operationId],
      )
    ).n,
    0,
  );
  console.log(
    "PASS real owner write between preflight and commit aborts conversion atomically and replays its terminal receipt",
  );
  // Many existing authority phases are legitimate history, but one conversion
  // must not promise a transaction that exceeds the owner invocation budget.
  const boundedId = "bounded-person";
  await statement(
    pe.DB,
    "INSERT INTO contacts_staff(school_id,staff_id,basic_name,ttb_name,revision,created_at) VALUES(?,?,?,?,1,?)",
    [base.SCHOOL_ID, boundedId, "Bounded fixture", "Bounded fixture", now],
  ).run();
  const boundedFields = {
    basicName: { value: "Bounded fixture" },
    ttbName: { value: "Bounded fixture" },
    role: { value: ref("old-role", "P") },
    eo: { value: true },
    smc: { value: true },
  };
  for (const [field, { value }] of Object.entries(boundedFields)) {
    const timeline = ["eo", "smc"].includes(field)
      ? Array.from({ length: 8 }, (_, i) => ({
          state: "accepted",
          revision: `${field}-${i + 1}`,
          value: i % 2 === 0,
          validFrom:
            i === 0 ? 0 : now + i * 60000 + (field === "smc" ? 30000 : 0),
          validUntil:
            i === 7
              ? null
              : now + (i + 1) * 60000 + (field === "smc" ? 30000 : 0),
          revoked: false,
        }))
      : [
          {
            state: "accepted",
            revision: `${field}-1`,
            value,
            validFrom: 0,
            validUntil: null,
            revoked: false,
          },
        ];
    const latest = timeline.at(-1);
    await statement(
      pe.DB,
      "INSERT INTO contacts_fields(school_id,staff_id,field,revision,state,value_json,valid_from,valid_until,revoked,proposer,operation_id,timeline_json) VALUES(?,?,?,?,'accepted',?,?,?,0,'historical-manager','historical-budget',?)",
      [
        base.SCHOOL_ID,
        boundedId,
        field,
        timeline.length,
        canonical(latest.value),
        latest.validFrom,
        latest.validUntil,
        canonical(timeline),
      ],
    ).run();
  }
  const large = await previewDirectConversion({
    db: pe.DB,
    schoolId: base.SCHOOL_ID,
    staffId: boundedId,
    fields: ["role"],
    now: Date.now(),
  });
  const largeBody = {
    schemaVersion: 1,
    operationId: "oversized-conversion",
    staffId: boundedId,
    fields: large.fields,
    expectedStaffRevision: large.expectedStaffRevision,
    expectedFields: large.expectedFields,
    sourceDefinitions: large.sourceDefinitions,
    planDigest: large.planDigest,
  };
  await assert.rejects(
    applyDirectConversion({
      env: pe,
      principal: await authorize(largeBody),
      body: largeBody,
      now: Date.now(),
    }),
    (error) => error.code === "CONVERSION_BOUNDS",
  );
  assert.equal(
    await operationStatus(pe.DB, base.SCHOOL_ID, largeBody.operationId),
    null,
  );
  assert.equal(
    (
      await one(pe.DB, "SELECT revision FROM contacts_staff WHERE staff_id=?", [
        boundedId,
      ])
    ).revision,
    1,
  );
  assert.equal(
    (
      await one(
        pe.DB,
        "SELECT COUNT(*) AS n FROM contacts_history WHERE staff_id=?",
        [boundedId],
      )
    ).n,
    0,
  );
  console.log(
    "PASS oversized authority-phase conversion rejects before prepare without partial history or staff changes",
  );
} finally {
  await p.close();
  await c.close();
}
