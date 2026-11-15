import assert from "node:assert/strict";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { handle as contactsHandle } from "../v1/services/contacts/service.mjs";
import {
  digest,
  operationStatus,
  abortOperation,
} from "../v1/runtime/store.mjs";
import { resolveAdmission } from "../v1/runtime/admission.mjs";

// Real owner services, nine local Workers and D1. Accounts are synthetic;
// staff facts below are created through authenticated owner commands.
const started = performance.now(),
  schoolId = "synthetic-school";
const bindings = {
  GOOGLE_CLIENT_ID: "synthetic-direct-service.apps.googleusercontent.com",
  HOSTED_DOMAIN: "example.invalid",
};
const suite = await productSuite({ bindings });
let active = suite,
  restarted,
  initialDisposed = false,
  passed = 0,
  serial = 0;
const op = () => "direct-service-" + ++serial;
async function request(user, domain, path, body, headers = {}) {
  const response = await active.mf.dispatchFetch(
    origin + "/api/" + domain + path,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        cookie: "__Host-gsis_session=" + user.token,
        "x-csrf-token": user.csrf,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  return { status: response.status, body: await response.json() };
}
async function call(user, path, body) {
  const response = await request(user, "contacts", path, body);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}
async function write(user, path, body) {
  return call(user, path, { operationId: op(), ...body });
}
async function update(user, staffId, changes, extra = {}) {
  const before = await call(user, "/staff/" + staffId);
  return write(user, "/staff/" + staffId + "/update", {
    changes,
    fieldRevisions: Object.fromEntries(
      Object.keys(changes).map((key) => [
        key,
        before.fields[key]?.revision ?? 0,
      ]),
    ),
    ...extra,
  });
}
async function test(name, run) {
  await run();
  passed++;
  console.log("PASS " + name);
}
async function count(table, where = "", args = []) {
  const db = await active.db("contacts");
  return (
    await db
      .prepare(
        `SELECT COUNT(*) n FROM ${table}${where ? " WHERE " + where : ""}`,
      )
      .bind(...args)
      .first()
  ).n;
}
const fieldNames = [
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
  "School Section",
  "Personnel Category",
  "Employment Arrangement",
  "Employment Status",
  "Memberships",
  "General Aliases",
  "Name Suffix",
  "Profile Completion",
];
let admin, manager, ordinary, otherPower, firstId, secondId;
try {
  admin = await suite.seedAccount("direct-service-admin");
  manager = await suite.seedAccount("direct-service-manager", {
    capabilities: ["contacts.powerUser"],
  });
  ordinary = await suite.seedAccount("direct-service-reader", {
    capabilities: [],
  });
  otherPower = await suite.seedAccount("direct-service-deploy", {
    capabilities: ["deploy.powerUser"],
  });
  await test("Admin and Contacts manager independently save all direct fields with zero catalogues", async () => {
    assert.equal(await count("contacts_catalogues"), 0);
    for (const [index, actor] of [admin, manager].entries()) {
      const saved = await write(actor, "/save-data", {
        changes: [],
        additions: [
          {
            id: "temporary-" + index,
            values: {
              "Basic Name": "Synthetic Direct " + index,
              "Statutory Name": "Synthetic Full " + index,
              "Mobile No": "8123456" + index,
              EXT: "00" + index,
              Role: "P",
              "EO Appt Level": "EO",
              "Appointment Status": "Confirmed",
              Active: "Y",
              "Employment Modifier": "BT\n4/5",
              "Subject Modifier": "Art\nMusic",
              "MK Modifier": "",
              "Day of Birth": "29",
              "Month of birth": "2",
              "GSPS Alias (@gsps.edu.sg)": "direct" + index,
              "iCON Alias (@moe.edu.sg)": "icon" + index,
              "CES Alias (@schools.gov.sg)": "ces" + index,
              "School Section": "Primary",
              "Personnel Category": "Teaching",
              "Employment Arrangement": "Full-time",
              "Employment Status": "Permanent",
              Memberships: "Science team\nLibrary team",
              "General Aliases": "Alias " + index + "\nOther " + index,
              "Name Suffix": "Section " + index,
              "Profile Completion": "complete",
            },
          },
        ],
      });
      assert.equal(saved.receipt.state, "committed");
      const staffId = saved.mapping["temporary-" + index];
      if (index) secondId = staffId;
      else firstId = staffId;
      const person = await call(actor, "/staff/" + staffId);
      assert.equal(person.fields.role.value, "P");
      assert.equal(person.fields.role.valueSchema, 2);
      assert.equal(person.fields.eoAppointmentLevel.value, "EO");
      assert.deepEqual(person.fields.employmentTags.value, ["BT", "4/5"]);
      assert.deepEqual(person.fields.memberships.value, [
        "Science team",
        "Library team",
      ]);
      assert.deepEqual(person.fields.aliases.value, [
        "Alias " + index,
        "Other " + index,
      ]);
      for (const name of ["smc", "eo", "schoolLeader"])
        assert.notEqual(person.fields[name]?.state, "accepted");
      const data = await call(actor, "/data"),
        row = data.rows.find((r) => r.id === staffId);
      assert.deepEqual(data.fields, fieldNames);
      assert.equal(data.gridSchema.schemaVersion, 2);
      assert.deepEqual(data.gridSchema.writeLimits, {
        mutations: 64,
        staff: 16,
        additionCost: 1,
      });
      assert.equal(row.values.length, 25);
      assert.equal(row.values[4], "00" + index);
      assert.equal(row.values[6], "EO");
      assert.equal(row.values[21], "Science team\nLibrary team");
      assert.equal(row.values[24], "complete");
    }
    assert.equal(await count("contacts_catalogues"), 0);
  });
  await test("real Roster, LORD, Venues and Calendar consumers read direct owner facts", async () => {
    await update(manager, secondId, {
      employmentTags: ["SRE"],
      schoolSection: "MK",
    });
    const read = async (domain, path) => {
      const response = await request(admin, domain, path);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      return response.body.data;
    };
    const roster = await read("roster", "/profile");
    const projected = roster.people.find((p) => p.id === firstId);
    assert.equal(projected.role, "P");
    assert.equal(projected.employment, "BT,4/5");
    const layers = await read("roster", "/layers");
    assert.equal(
      layers.resolvedTeachers.find((p) => p.staffId === secondId).layerId,
      2,
    );
    const lord = await request(admin, "lord", "/reference/refresh", {
      operationId: op(),
    });
    assert.equal(lord.status, 200, JSON.stringify(lord.body));
    const lordDb = await active.db("lord"),
      references = await lordDb
        .prepare(
          "SELECT staff_id,name,email,mobile FROM lord_references WHERE school_id=? ORDER BY staff_id",
        )
        .bind(schoolId)
        .all();
    assert.equal(references.results.length, 2);
    assert.equal(
      references.results.find((p) => p.staff_id === firstId).email,
      "direct0@example.invalid",
    );
    const venues = await read("venues", "/bootstrap");
    assert(venues.staff.some((p) => p.id === firstId && p.active === true));
    for (const input of [
      {
        action: "saveYear",
        payload: {
          Year: 2028,
          Status: "ACTIVE",
          ReleasedToTeachers: "No",
          expectedMetadataRevision: "missing",
        },
      },
      { action: "pullBirthdays", payload: { year: 2028 } },
    ]) {
      const response = await request(admin, "calendar", "/action", {
        operationId: op(),
        ...input,
      });
      assert.equal(response.status, 200, JSON.stringify(response.body));
    }
    const calendarDb = await active.db("calendar"),
      birthdays = await calendarDb
        .prepare(
          "SELECT event_id,data_json FROM calendar_events WHERE school_id=? AND year=2028 AND json_extract(data_json,'$.OwnerTag')='birthday'",
        )
        .bind(schoolId)
        .all();
    assert.equal(
      birthdays.results.length,
      1,
      "The MK section cannot produce a primary-school birthday",
    );
    const birthday = JSON.parse(birthdays.results[0].data_json);
    assert.equal(birthday.StartDate, "2028-02-29");
    assert.equal(birthdays.results[0].event_id, "birthday-2028-" + firstId);
  });
  await test("basic-only creation stays provisional and labels never create authority", async () => {
    const id = "direct-provisional";
    await write(manager, "/staff/create", {
      staffId: id,
      basicName: "Synthetic Provisional",
    });
    let person = await call(manager, "/staff/" + id);
    assert.equal(person.profileState, "provisional");
    assert.equal(person.active, null);
    for (const key of ["employmentActive", "smc", "eo", "schoolLeader"])
      assert.notEqual(person.fields[key]?.state, "accepted");
    await update(manager, id, {
      role: "New curriculum mentor",
      eoAppointmentLevel: "Custom appointment",
      employmentTags: ["Novel tag", "Novel tag", "BT"],
      subjectTags: [],
    });
    person = await call(manager, "/staff/" + id);
    assert.deepEqual(person.fields.employmentTags.value, ["Novel tag", "BT"]);
    assert.equal(person.fields.role.value, "New curriculum mentor");
    assert.deepEqual(person.fields.subjectTags.value, []);
    assert.equal(person.fields.subjectTags.state, "accepted");
    await update(manager, id, { role: null });
    assert.equal(
      (await call(manager, "/staff/" + id)).fields.role.state,
      "superseded",
    );
    assert.equal(await count("contacts_catalogues"), 0);
    const registered = await request(admin, "deploy", "/staff/register", {
      operationId: op(),
      basicName: "Synthetic Restricted Registration",
      tags: ["BT", "Art"],
    });
    assert.equal(registered.status, 200, JSON.stringify(registered.body));
    const registeredId =
      registered.body.data.result?.staffId ?? registered.body.data.staffId;
    assert(
      registeredId,
      "Restricted registration returns the permanent owner Staff ID",
    );
    const restricted = await call(manager, "/staff/" + registeredId);
    assert.equal(restricted.profileState, "provisional");
    assert.deepEqual(restricted.fields.employmentTags.value, ["BT"]);
    assert.deepEqual(restricted.fields.subjectTags.value, ["Art"]);
    for (const field of ["employmentActive", "smc", "eo", "schoolLeader"])
      assert.notEqual(restricted.fields[field]?.state, "accepted");
    const beforeUnknown = await count("contacts_staff");
    const unknown = await request(admin, "deploy", "/staff/register", {
      operationId: op(),
      basicName: "Synthetic Unclassified Registration",
      tags: ["Novel tag"],
    });
    assert.equal(unknown.status, 409, JSON.stringify(unknown.body));
    assert.equal(unknown.body.error.code, "CONTACTS_FIELD_REVIEW_REQUIRED");
    assert.equal(await count("contacts_staff"), beforeUnknown);
  });
  await test("ordinary self-classification is allowed for managers while acceptance remains independently guarded", async () => {
    const self = await suite.seedAccount("direct-service-self-manager", {
      staffId: firstId,
      capabilities: ["contacts.powerUser"],
    });
    const alias = await suite.seedAccount("direct-service-self-alias", {
      staffId: firstId,
      capabilities: ["admin"],
    });
    await update(self, firstId, { role: "HOD ICT", eoAppointmentLevel: "ST" });
    for (const actor of [self, alias]) {
      const denied = await request(
        actor,
        "contacts",
        `/staff/${firstId}/accept`,
        {
          operationId: op(),
          field: "smc",
          value: true,
          revision: 0,
          ownerReviewReference: "Synthetic owner review",
        },
      );
      assert.equal(denied.status, 403);
      assert.equal(denied.body.error.code, "SELF_ACCEPTANCE_DENIED");
    }
    for (const field of ["smc", "eo", "schoolLeader"]) {
      await write(manager, `/staff/${firstId}/accept`, {
        field,
        value: field === "eo",
        revision: 0,
        ownerReviewReference: "Synthetic owner review",
      });
    }
    const db = await active.db("contacts"),
      audits = await db
        .prepare(
          "SELECT field,proposer,accepter,accepted_at,operation_id FROM contacts_acceptance_audit WHERE school_id=? AND staff_id=? ORDER BY field",
        )
        .bind(schoolId, firstId)
        .all();
    assert.equal(audits.results.length, 3);
    assert(
      audits.results.every(
        (r) =>
          r.proposer === manager.id &&
          r.accepter === manager.id &&
          Number.isSafeInteger(r.accepted_at) &&
          r.operation_id,
      ),
    );
    assert.equal(
      await count("contacts_settings", "setting LIKE '%notification%'"),
      0,
    );
    const mke = await request(
      manager,
      "contacts",
      `/staff/${secondId}/accept`,
      {
        operationId: op(),
        field: "smc",
        value: true,
        revision: 0,
        ownerReviewReference: "Synthetic direct MK conflict",
      },
    );
    assert(mke.status >= 400 && mke.status < 500, JSON.stringify(mke));
    assert.notEqual(
      (await call(manager, "/staff/" + secondId)).fields.smc?.state,
      "accepted",
    );
  });
  await test("wrong module, ordinary, preview, foreign school and client-provided storage evidence cannot manage facts", async () => {
    for (const actor of [ordinary, otherPower]) {
      const denied = await request(
        actor,
        "contacts",
        `/staff/${firstId}/update`,
        { operationId: op(), changes: { role: "P" } },
      );
      assert.equal(denied.status, 403);
    }
    const preview = await request(
      admin,
      "contacts",
      `/staff/${firstId}/update`,
      {
        operationId: op(),
        changes: { role: "P" },
      },
      { "x-gsis-preview-account": ordinary.id },
    );
    assert.equal(preview.status, 403);
    const foreign = await request(
      admin,
      "contacts",
      `/staff/${firstId}/update`,
      {
        operationId: op(),
        schoolId: "another-school",
        changes: { role: "P" },
      },
    );
    assert.equal(foreign.status, 403);
    for (const changes of [
      { role: { schemaVersion: 2, value: "P" } },
      { role: { catalogueId: "fake", revision: "1", code: "P" } },
      { eo: true },
      { ttbName: "Untrusted display" },
    ]) {
      const response = await request(
        admin,
        "contacts",
        `/staff/${firstId}/update`,
        { operationId: op(), changes },
      );
      assert(
        response.status >= 400 && response.status < 500,
        JSON.stringify(response),
      );
    }
    assert.equal(
      (await call(admin, "/staff/" + firstId)).fields.role.value,
      "HOD ICT",
    );
  });
  await test("actual field bounds and deterministic errors preserve committed state and original draft freedom", async () => {
    const before = await call(admin, "/staff/" + secondId);
    const cases = [
      { employmentTags: Array.from({ length: 33 }, (_, i) => "Tag " + i) },
      { aliases: Array.from({ length: 17 }, (_, i) => "Alias " + i) },
      { role: "a".repeat(161) },
      { role: "Guest,UT" },
      { role: "bad\u0001" },
      { employmentTags: "BT" },
      { role: ["P"] },
      { birthday: "02-30" },
      { email: "wrong@foreign.invalid" },
      { mobile: "not-a-number" },
      // Every token is valid, but the retained subject/suffix makes TTb172.
      {
        employmentTags: Array.from({ length: 32 }, (_, i) =>
          String.fromCodePoint(0x4e00 + i),
        ),
      },
    ];
    for (const changes of cases) {
      const operationId = op();
      const response = await request(
        admin,
        "contacts",
        `/staff/${secondId}/update`,
        { operationId, changes },
      );
      assert(
        response.status >= 400 && response.status < 500,
        JSON.stringify({ changes, response }),
      );
      if (changes.employmentTags?.length === 32)
        assert.equal(response.body.error.code, "TTB_NAME_TOO_LONG");
      const db = await active.db("contacts"),
        row = await db
          .prepare(
            "SELECT state FROM product_operations WHERE school_id=? AND operation_id=?",
          )
          .bind(schoolId, operationId)
          .first();
      assert(
        !row || row.state === "aborted",
        "Validation must not retain a prepared operation",
      );
    }
    assert.equal(
      (await call(admin, "/staff/" + secondId)).revision,
      before.revision,
    );
    await update(manager, "direct-provisional", {
      employmentTags: Array.from({ length: 32 }, (_, i) =>
        String.fromCodePoint(0x4e00 + i),
      ),
      aliases: Array.from({ length: 16 }, (_, i) => "Alias " + i),
    });
    const accepted = await call(admin, "/staff/direct-provisional");
    assert.equal(accepted.fields.employmentTags.value.length, 32);
    assert.equal(accepted.fields.aliases.value.length, 16);
  });
  await test("same-field stale writes reject; independent current-field edits retain each accepted fact", async () => {
    const before = await call(admin, "/staff/" + firstId),
      revision = before.fields.role.revision;
    await update(admin, firstId, { role: "Research lead" });
    const stale = await request(
      manager,
      "contacts",
      `/staff/${firstId}/update`,
      {
        operationId: op(),
        changes: { role: "Stale value" },
        fieldRevisions: { role: revision },
      },
    );
    assert.equal(stale.status, 409);
    await write(manager, `/staff/${firstId}/update`, {
      changes: { ext: "0007" },
      fieldRevisions: { ext: before.fields.ext.revision },
    });
    const after = await call(admin, "/staff/" + firstId);
    assert.equal(after.fields.role.value, "Research lead");
    assert.equal(after.fields.ext.value, "0007");
    const twins = await write(manager, "/save-data", {
      changes: [],
      additions: ["A", "B"].map((suffix) => ({
        id: "collision-" + suffix,
        values: {
          "Basic Name": "Synthetic Duplicate Base",
          "Name Suffix": suffix,
        },
      })),
    });
    const db = await active.db("contacts"),
      snapshot = async () =>
        Object.fromEntries(
          await Promise.all(
            [
              ["contacts_staff", "staff_id"],
              ["contacts_fields", "staff_id,field"],
              ["contacts_history", "staff_id,field,revision"],
              ["contacts_snapshots", "snapshot_id"],
              ["contacts_epoch", "school_id"],
            ].map(async ([table, order]) => [
              table,
              (
                await db
                  .prepare(
                    `SELECT * FROM ${table} WHERE school_id=? ORDER BY ${order}`,
                  )
                  .bind(schoolId)
                  .all()
              ).results,
            ]),
          ),
        ),
      original = await snapshot();
    const collision = await request(manager, "contacts", "/save-data", {
      operationId: op(),
      additions: [],
      changes: [
        {
          id: twins.mapping["collision-B"],
          field: "Name Suffix",
          expected: "B",
          value: "A",
        },
        {
          id: firstId,
          field: "EXT",
          expected: "0007",
          value: "0099",
        },
      ],
    });
    assert.equal(collision.status, 409, JSON.stringify(collision.body));
    assert.deepEqual(
      await snapshot(),
      original,
      "An occupied derived name rejects every cell, history and epoch change",
    );
  });
  await test("real 64-entry and 16-person limits accept their boundary and reject overflow atomically", async () => {
    const created = await write(admin, "/save-data", {
      changes: [],
      additions: Array.from({ length: 16 }, (_, i) => ({
        id: "bound-" + i,
        values: { "Basic Name": "Synthetic Bound " + i },
      })),
    });
    const ids = Object.values(created.mapping);
    assert.equal(ids.length, 16);
    const changes = ids.flatMap((id, index) => [
      { id, field: "EXT", expected: "", value: "0" + index },
      { id, field: "Role", expected: "", value: "Bound role" },
      { id, field: "EO Appt Level", expected: "", value: "Bound level" },
      { id, field: "Appointment Status", expected: "", value: "Bound status" },
    ]);
    const saved = await write(admin, "/save-data", { changes, additions: [] });
    assert.equal(saved.receipt.state, "committed");
    // Count the complete real Contacts owner handler against the free-D1
    // statement budget; Core and Contacts peer calls still use actual Workers.
    const operationId = op(),
      strictBody = {
        operationId,
        additions: [],
        changes: changes.map((c) => ({
          ...c,
          expected: c.value,
          value: c.value + "X",
        })),
      };
    const core = await active.mf.getWorker("gsis-core");
    const authorize = async (input) => {
      const authResponse = await core.fetch(
        "https://core.internal/internal/authorize",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-gsis-secret": suite.secret,
          },
          body: JSON.stringify({
            schoolId,
            sessionToken: admin.token,
            csrfToken: admin.csrf,
            origin,
            descriptor: {
              service: "contacts",
              action: "contacts.manage",
              write: true,
              operationId: input.operationId,
              requestId: input.operationId,
              bodyDigest: await digest(input),
              resourceId: "directory",
            },
          }),
        },
      );
      const auth = await authResponse.json();
      assert.equal(authResponse.status, 200, JSON.stringify(auth));
      return auth.data;
    };
    const principal = await authorize(strictBody);
    const nativeDb = await active.db("contacts"),
      metrics = { statements: 1, maxBinds: 0, jsonBytes: 0, batches: [] };
    const counted = (rows, batch) => {
      metrics.statements += rows.length;
      if (batch) metrics.batches.push(rows.length);
      for (const row of rows) {
        metrics.maxBinds = Math.max(metrics.maxBinds, row.args.length);
        assert(Buffer.byteLength(row.sql) <= 100000, "SQL text bound");
        for (const value of row.args)
          if (typeof value === "string" && /^[\[{]/.test(value))
            metrics.jsonBytes += Buffer.byteLength(value);
      }
      assert(
        metrics.statements <= 50,
        "Full owner strict50: " + JSON.stringify(metrics),
      );
      assert(metrics.maxBinds < 100, "SQL bind bound");
      assert(metrics.jsonBytes < 1048576, "Repeated JSON argument bound");
    };
    const wrap = (native, sql, args = []) => ({
      native,
      sql,
      args,
      bind: (...values) => wrap(native.bind(...values), sql, values),
      first: (...values) => {
        counted([{ sql, args }], false);
        return native.first(...values);
      },
      all: (...values) => {
        counted([{ sql, args }], false);
        return native.all(...values);
      },
      run: (...values) => {
        counted([{ sql, args }], false);
        return native.run(...values);
      },
    });
    let beforeCommit = null;
    const measuredDb = {
      prepare: (sql) => wrap(nativeDb.prepare(sql), sql),
      batch: async (rows) => {
        counted(rows, true);
        if (
          beforeCommit &&
          rows.some((r) =>
            r.sql.includes("UPDATE product_operations SET state='committed'"),
          )
        ) {
          const run = beforeCommit;
          beforeCommit = null;
          await run();
        }
        return nativeDb.batch(rows.map((r) => r.native));
      },
    };
    // Miniflare's host proxy accepts URL/init rather than Node's Request
    // instance. This transport bridge still invokes the actual owning Worker.
    const peer = (worker) => ({
      fetch: async (input) =>
        worker.fetch(input.url, {
          method: input.method,
          headers: Object.fromEntries(input.headers),
          body: await input.text(),
          signal: input.signal,
        }),
    });
    const env = {
      DB: measuredDb,
      SCHOOL_ID: schoolId,
      SERVICE_NAME: "contacts",
      HOSTED_DOMAIN: "example.invalid",
      PUBLIC_ORIGIN: origin,
      GSIS_SECRET: suite.secret,
      CORE: peer(core),
      CONTACTS: peer(await active.mf.getWorker("gsis-contacts")),
    };
    const result = await contactsHandle({
      env,
      principal,
      body: strictBody,
      method: "POST",
      path: "/save-data",
      now: Date.now(),
    });
    assert.equal(result.receipt.state, "committed");
    console.log("Contacts64/16 strict50 metrics " + JSON.stringify(metrics));
    const snapshot = async () => ({
      fields: (
        await nativeDb
          .prepare(
            "SELECT staff_id,field,revision,value_json,timeline_json FROM contacts_fields WHERE school_id=? AND staff_id IN(SELECT value FROM json_each(?)) ORDER BY staff_id,field",
          )
          .bind(schoolId, JSON.stringify(ids))
          .all()
      ).results,
      history: (
        await nativeDb
          .prepare(
            "SELECT staff_id,field,revision,record_json FROM contacts_history WHERE school_id=? AND staff_id IN(SELECT value FROM json_each(?)) ORDER BY staff_id,field,revision",
          )
          .bind(schoolId, JSON.stringify(ids))
          .all()
      ).results,
      epoch: await nativeDb
        .prepare("SELECT revision FROM contacts_epoch WHERE school_id=?")
        .bind(schoolId)
        .first(),
    });
    const beforeRace = await snapshot(),
      raceBody = {
        operationId: op(),
        additions: [],
        changes: strictBody.changes.map((c) => ({
          ...c,
          expected: c.value,
          value: c.value + "Y",
        })),
      };
    const racePrincipal = await authorize(raceBody);
    Object.assign(metrics, {
      statements: 1,
      maxBinds: 0,
      jsonBytes: 0,
      batches: [],
    });
    // Controlled competing revision at the final transaction boundary; this
    // fixture changes no field/history/epoch and is not a simulated success.
    beforeCommit = () =>
      nativeDb
        .prepare(
          "UPDATE contacts_staff SET revision=revision+1 WHERE school_id=? AND staff_id=?",
        )
        .bind(schoolId, ids[0])
        .run();
    await assert.rejects(
      () =>
        contactsHandle({
          env,
          principal: racePrincipal,
          body: raceBody,
          method: "POST",
          path: "/save-data",
          now: Date.now(),
        }),
      (error) => error.status === 409,
    );
    assert.equal(
      beforeCommit,
      null,
      "The competing revision must land after preparation",
    );
    assert.deepEqual(
      await snapshot(),
      beforeRace,
      "One stale person rejects all64 proposed cells and their histories/epoch",
    );
    const unresolved = await operationStatus(
      nativeDb,
      schoolId,
      raceBody.operationId,
    );
    if (unresolved?.state === "prepared")
      await abortOperation(
        nativeDb,
        unresolved,
        "SYNTHETIC_RACE_CONFIRMED",
        Date.now(),
      );
    if (unresolved)
      await resolveAdmission(
        { ...env, DB: nativeDb },
        nativeDb,
        unresolved,
        null,
        null,
        Date.now(),
      );

    for (const body of [
      {
        changes: [
          ...changes,
          { id: firstId, field: "EXT", expected: "0007", value: "999" },
        ],
        additions: [],
      },
      {
        changes: [],
        additions: Array.from({ length: 17 }, (_, i) => ({
          id: "over-" + i,
          values: { "Basic Name": "Synthetic Overflow " + i },
        })),
      },
    ]) {
      const before = await count("contacts_staff");
      const result = await request(admin, "contacts", "/save-data", {
        operationId: op(),
        ...body,
      });
      assert(
        result.status >= 400 && result.status < 500,
        JSON.stringify(result),
      );
      assert.equal(await count("contacts_staff"), before);
    }
  });
  await test("direct accepted values reach purpose projections without authority inference or private-field leaks", async () => {
    await update(manager, firstId, {
      role: "Teacher",
      employmentTags: ["UT"],
      schoolSection: "Primary",
      eoAppointmentLevel: "ST",
      subjectTags: ["Art"],
      memberships: [],
    });
    for (const purpose of ["roster", "deploy", "lord", "venues", "layout"]) {
      const data = await write(admin, "/projection", {
        purpose,
        staffIds: [firstId],
      });
      const person = data.staff.find((p) => p.staffId === firstId);
      assert(person);
      if (purpose === "roster") {
        assert.deepEqual(person.employmentTags, ["UT"]);
        assert.equal(person.appointmentLevel, "ST");
        assert.equal(person.schoolSection, "Primary");
        assert.equal(person.eo, true);
      } else if (purpose === "deploy") {
        assert.equal(person.fields.role.value, "Teacher");
        assert.equal(person.fields.eo.value, true);
        for (const key of [
          "mobile",
          "email",
          "birthday",
          "statutoryName",
          "aliases",
        ])
          assert(!Object.hasOwn(person, key));
        assert.deepEqual(data.catalogues, []);
      } else {
        for (const key of [
          "role",
          "employmentTags",
          "fields",
          "eo",
          "smc",
          "schoolLeader",
        ])
          assert(!Object.hasOwn(person, key));
      }
    }
    const data = await call(ordinary, "/data");
    const person = data.rows.find((r) => r.id === firstId);
    assert.equal(person.values[fieldNames.indexOf("Statutory Name")], "");
    assert.equal(person.values[fieldNames.indexOf("General Aliases")], "");
  });
  await test("an acknowledged-lost response is recovered after actual Worker restart without duplicate facts or audit", async () => {
    const operationId = op(),
      body = {
        operationId,
        changes: [],
        additions: [
          {
            id: "restart-temp",
            values: { "Basic Name": "Synthetic Restart Survivor", Role: "P" },
          },
        ],
      };
    const first = await call(manager, "/save-data", body),
      staffId = first.mapping["restart-temp"];
    assert.equal(first.receipt.state, "committed");
    // Deliberately discard the first response at this boundary, then replace all
    // Worker isolates while keeping their real D1/R2 persistence directories.
    await active.mf.dispose();
    initialDisposed = true;
    restarted = await startProduct({
      persistPath: join(suite.path, "state"),
      output: join(suite.path, "restarted"),
      migrateSchemas: false,
      bindings: { ...bindings, GSIS_SECRET: suite.secret },
    });
    active = restarted;
    const retry = await call(manager, "/save-data", body);
    assert.equal(retry.mapping["restart-temp"], staffId);
    assert.equal(retry.receipt.state, "committed");
    assert.equal(await count("contacts_staff", "staff_id=?", [staffId]), 1);
    assert.equal(
      await count("product_audit", "operation_id=?", [operationId]),
      1,
    );
    const changed = await request(manager, "contacts", "/save-data", {
      ...body,
      additions: [
        {
          ...body.additions[0],
          values: { "Basic Name": "Different intent", Role: "P" },
        },
      ],
    });
    assert.equal(changed.status, 409);
    assert.equal(
      (await call(manager, "/staff/" + staffId)).fields.role.value,
      "P",
    );
    assert.equal(await count("contacts_catalogues"), 0);
  });
} finally {
  if (restarted) await restarted.close();
  if (!initialDisposed) await suite.close();
  else await rm(suite.path, { recursive: true, force: true });
  console.log(
    `${passed} direct-authority service groups passed in ${((performance.now() - started) / 1000).toFixed(3)}s`,
  );
}
