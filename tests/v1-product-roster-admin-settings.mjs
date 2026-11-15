import assert from "node:assert/strict";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { createDatabase } from "./v1-product/helpers.mjs";
import Operations from "../shared/roster-operations.js";
import { handle } from "../v1/services/roster/service.mjs";
import {
  loadState,
  requestedDates,
} from "../v1/services/roster/repository.mjs";
import { authorize } from "../v1/runtime/security.mjs";
import {
  canonical,
  digest,
  query,
  operationStatus,
} from "../v1/runtime/store.mjs";

// Local nine-Worker integration first. The separate owning-D1 budget fixture
// below explicitly substitutes peer projections/pins and authority, not SQL.
// Neither fixture accesses school data, providers, or hosted runtime UAT.
const date = "2026-11-16",
  hidden = [
    "allocationRuleEnabled",
    "allocationPreferences",
    "maxDailyPeriods",
    "maxConsecutivePeriods",
    "maxDailyReliefPeriods",
    "adhocReliefMaxPeriods",
    "consecutiveSubjectRules",
  ];
let serial = 0,
  passed = 0;
const id = (prefix) => prefix + "-" + ++serial;
const copy = (v) => structuredClone(v);
async function test(name, run) {
  await run();
  console.log("PASS " + name);
  passed++;
}
const command = (operation, revision, fields = {}) => {
  const operationId = id(operation);
  return {
    operation,
    operationId,
    requestId: operationId,
    date,
    revision,
    ...fields,
  };
};
const retained = (config) =>
  Object.fromEntries(hidden.map((k) => [k, config[k]]));
const types = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: "type-" + String(n - i).padStart(3, "0"),
    label: "課".repeat(98) + String(i).padStart(2, "0"),
    requiresDetail: i % 2 === 0,
    allowSelectAll: i % 3 === 0,
    allowedPeriods: i % 2 ? null : [0, 3, 12],
    afterMinutes: i % 2 ? null : 675,
    minStartMinutes: i % 2 ? null : 690,
    todayOnly: i % 4 === 0,
  }));
const typeIds = (rows) => rows.map((t) => t.id);
function assertSaved(result, body) {
  assert.equal(result.receipt.state, "committed");
  assert.equal(result.receipt.operationId, body.operationId);
  assert.equal(result.requestId, body.operationId);
  assert.equal(result.revision, body.revision + 1);
  assert.equal(result.acceptedRevision, result.revision);
  assert.match(result.receipt.digest, /^[a-f0-9]{64}$/);
  assert(
    Number.isSafeInteger(result.receipt.fence) && result.receipt.fence > 0,
  );
  const { receipt, ...view } = result;
  assert.deepEqual(
    view,
    receipt.result,
    "native view is the actual durable receipt result",
  );
}
async function records(db, schoolId) {
  return query(
    db,
    "SELECT collection,record_id,revision,payload_json FROM roster_records WHERE school_id=? ORDER BY collection,record_id",
    [schoolId],
  );
}

const suite = await productSuite();
try {
  const admin = await suite.seedAccount("settings-admin"),
    reader = await suite.seedAccount("settings-reader", {
      capabilities: ["roster.read"],
    }),
    other = await suite.seedAccount("settings-other"),
    school = "synthetic-school",
    db = await suite.db("roster"),
    core = await suite.db("core");
  const send = (user, body, headers) =>
    suite.request(user, "roster", "/operations", {
      method: "POST",
      body,
      headers,
    });
  const call = async (body) => {
    const r = await send(admin, body);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.data;
  };
  const read = () => call({ operation: "systemConfig", date });
  let saved, original, originalBody;
  await test("actual nine Workers save unchanged PAL3 without a baseline and return the complete committed view", async () => {
    original = await read();
    assert.deepEqual(original.subjects, []);
    assert.deepEqual(original.config.consecutiveSubjectRules, [
      { subject: "PAL", periods: 3 },
    ]);
    const body = command("saveSystemConfig", original.revision, {
      ...original.config,
      googleBackupLagMinutes: 11,
    });
    originalBody = copy(body);
    saved = await call(body);
    assertSaved(saved, body);
    assert.equal(saved.config.googleBackupLagMinutes, 11);
    assert.deepEqual(retained(saved.config), retained(original.config));
    assert.deepEqual(saved.subjects, []);
    assert.deepEqual(saved.consecutiveSubjects, []);
    assert.equal(saved.baseline, null);
    const fresh = await read();
    assert.deepEqual(fresh.config, saved.config);
    assert.equal(
      fresh.revision,
      saved.revision,
      "native config reads use the same owner scope as saves",
    );
    assert.deepEqual((await call(body)).receipt, saved.receipt);
    const changed = await send(admin, { ...body, googleBackupLagMinutes: 12 });
    assert.equal(changed.status, 409);
  });
  await test("actual administrative saves retain omitted compatibility policy and accept active consecutive exclusions", async () => {
    const current = await read(),
      input = {
        ...current.config,
        consecutiveCountExclusions: [
          { type: "exact", value: "BLK" },
          { type: "wildcard", value: "Assembly*" },
        ],
      };
    for (const key of hidden) delete input[key];
    const body = command("saveSystemConfig", current.revision, input),
      result = await call(body);
    assertSaved(result, body);
    assert.deepEqual(retained(result.config), retained(original.config));
    assert.deepEqual(
      result.config.consecutiveCountExclusions,
      input.consecutiveCountExclusions,
    );
    for (const key of [
      "scheduledAllocationEnabled",
      "driveBackup",
      "driveDaily",
      "smcSummaryTimes",
    ])
      assert.deepEqual(result.config[key], current.config[key]);
    // Replay is the old committed view even after a newer configuration exists.
    const old = await call(originalBody);
    assert.deepEqual(old.receipt, saved.receipt);
    assert((await read()).revision > old.revision);
  });
  await test("actual validation failures cannot alter settings, success audit or send jobs", async () => {
    const current = await read(),
      before = await records(db, school);
    const counts = async () =>
      Promise.all(
        ["product_audit", "product_outbox"].map(
          async (table) =>
            (
              await db
                .prepare(
                  "SELECT COUNT(*) n FROM " + table + " WHERE school_id=?",
                )
                .bind(school)
                .first()
            ).n,
        ),
      );
    const beforeCounts = await counts();
    for (const patch of [
      { maxDailyPeriods: current.config.maxDailyPeriods + 1 },
      { sharedSubjectCoverSubjects: ["PAL"] },
      {
        consecutiveCountExclusions: [
          { type: "wildcard", value: "missing-star" },
        ],
      },
      { smcSummaryTimes: { evening: ["06:00"], morning: [] } },
    ]) {
      const r = await send(
        admin,
        command("saveSystemConfig", current.revision, {
          ...current.config,
          ...patch,
        }),
      );
      assert.equal(r.status, 400, JSON.stringify(r.body));
    }
    assert.deepEqual(await records(db, school), before);
    assert.deepEqual(await counts(), beforeCounts);
  });
  await test("actual non-Admin, preview, foreign-school and absent session requests remain denied", async () => {
    const current = await read(),
      before = await records(db, school);
    for (const [user, headers, patch] of [
      [reader, {}, {}],
      [admin, { "x-gsis-preview-account": other.id }, {}],
      [admin, {}, { schoolId: "another-school" }],
      [null, {}, {}],
    ]) {
      const r = await send(
        user,
        command("saveSystemConfig", current.revision, {
          ...current.config,
          ...patch,
        }),
        headers,
      );
      assert([401, 403].includes(r.status), JSON.stringify(r.body));
    }
    assert.deepEqual(await records(db, school), before);
  });
  await test("Calendar dates accepts the actual current roster.admin proof, not missing, expired or another-service actions", async () => {
    const worker = await suite.mf.getWorker("gsis-calendar");
    const decision = await core
      .prepare(
        "SELECT decision_id,valid_until FROM core_evidence WHERE school_id=? AND json_extract(descriptor_json,'$.action')='roster.admin' ORDER BY rowid DESC LIMIT 1",
      )
      .bind(school)
      .first();
    assert(decision);
    const internal = async (decisionId, schoolId = school) => {
      const r = await worker.fetch("https://gsis.internal/internal/dates", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gsis-secret": suite.secret,
        },
        body: JSON.stringify({ decisionId, schoolId, from: date, to: date }),
      });
      return { status: r.status, body: await r.json() };
    };
    assert.equal((await internal(decision.decision_id)).status, 200);
    assert.equal(
      (await internal(decision.decision_id, "foreign-school")).status,
      403,
    );
    assert.equal((await internal("missing-decision")).status, 409);
    await core
      .prepare(
        "UPDATE core_evidence SET valid_until=0 WHERE school_id=? AND decision_id=?",
      )
      .bind(school, decision.decision_id)
      .run();
    assert.equal((await internal(decision.decision_id)).status, 409);
    await core
      .prepare(
        "UPDATE core_evidence SET valid_until=? WHERE school_id=? AND decision_id=?",
      )
      .bind(decision.valid_until, school, decision.decision_id)
      .run();
    const coreWorker = await suite.mf.getWorker("gsis-core"),
      env = {
        SCHOOL_ID: school,
        SERVICE_NAME: "deploy",
        GSIS_SECRET: suite.secret,
        CORE: {
          fetch: async (req) =>
            coreWorker.fetch(req.url, {
              method: req.method,
              headers: Object.fromEntries(req.headers),
              body: await req.text(),
            }),
        },
      };
    const request = new Request(origin + "/api/deploy/bootstrap", {
      method: "POST",
      headers: {
        origin,
        cookie: "__Host-gsis_session=" + admin.token,
        "x-csrf-token": admin.csrf,
      },
    });
    const proof = await authorize(env, request, {
      service: "deploy",
      action: "deploy.read",
      write: false,
      resourceId: "bootstrap",
      operationId: id("wrong-purpose"),
      bodyDigest: await digest({}),
    });
    assert.equal((await internal(proof.decisionId)).status, 403);
  });
  await test("actual competing type saves have one config-CAS winner and exact immutable replay", async () => {
    const current = await read(),
      a = command("saveTypes", current.revision, { types: types(3) }),
      b = command("saveTypes", current.revision, { types: types(4) });
    const results = await Promise.all([send(admin, a), send(other, b)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const winning = results[0].status === 200 ? a : b,
      actor = results[0].status === 200 ? admin : other;
    const result = results.find((r) => r.status === 200).body.data;
    assertSaved(result, winning);
    assert.deepEqual(result.types, winning.types);
    assert.equal(result.date, date);
    assert.deepEqual(result.periods, []);
    for (const forbidden of ["people", "absences", "ownAbsences", "mobile"])
      assert.equal(result[forbidden], undefined);
    const replay = await send(actor, winning);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.deepEqual(replay.body.data.receipt, result.receipt);
    const currentTypes = await call({ operation: "read", view: "types", date });
    assert.deepEqual(currentTypes.types, winning.types);
    assert.equal(
      currentTypes.revision,
      result.revision,
      "native type reads and saves share the config scope",
    );
  });
} finally {
  await suite.close();
}

// Real owner D1 and complete handle path, with explicitly synthetic peer
// projections, identity and pin responses. No pre-seeded operation/admission:
// preparation, three owner-pin acquisitions, commit and cleanup are counted.
const h = await createDatabase("roster"),
  metrics = [];
let school = "",
  costs,
  inject = null,
  lastBody,
  lastReceipt,
  syntheticPeople = [];
const now = Date.now(),
  until = now + 600000;
const resetCosts = (label, limit = 50) =>
  (costs = {
    label,
    limit,
    attempted: 0,
    dispatched: 0,
    maxBinds: 0,
    jsonBytes: 0,
    batches: [],
  });
function count(rows, batch) {
  costs.attempted += rows.length;
  if (batch) costs.batches.push(rows.length);
  for (const row of rows) {
    costs.maxBinds = Math.max(costs.maxBinds, row.args.length);
    for (const value of row.args)
      if (typeof value === "string" && /^[\[{]/.test(value))
        costs.jsonBytes += Buffer.byteLength(value);
  }
  assert(costs.maxBinds < 100, "strict owner SQL bind bound");
  assert(
    costs.jsonBytes < 1048576,
    "repeated aggregate owner JSON arguments below 1 MiB",
  );
  if (costs.attempted > costs.limit)
    throw Error(
      "SYNTHETIC_D1_QUERY_BUDGET " +
        costs.attempted +
        " > " +
        costs.limit +
        " " +
        costs.label,
    );
  costs.dispatched += rows.length;
}
function wrap(native, sql, args = []) {
  const row = {
    native,
    sql,
    args,
    bind: (...values) => wrap(native.bind(...values), sql, values),
  };
  for (const method of ["first", "all", "run", "raw"])
    row[method] = (...values) => {
      count([row], false);
      return native[method](...values);
    };
  return row;
}
const db = {
  prepare: (sql) => wrap(h.db.prepare(sql), sql),
  async batch(rows) {
    count(rows, true);
    if (
      inject &&
      rows.some((row) =>
        row.sql.includes("UPDATE product_operations SET state='committed'"),
      )
    ) {
      const run = inject;
      inject = null;
      await run();
    }
    return h.db.batch(rows.map((row) => row.native));
  },
};
const reply = (data) => Response.json({ ok: true, data });
function peer(owner) {
  return {
    async fetch(request) {
      const body = await request.json(),
        path = new URL(request.url).pathname;
      if (path === "/internal/pins/acquire")
        return reply({
          owner,
          pinId: body.pinId,
          scope: body.scope,
          revision: body.revision,
          validUntil: body.validUntil,
        });
      if (path === "/internal/pins/release")
        return reply({ state: "released" });
      if (path === "/internal/evidence/receipt")
        return reply({ recorded: true });
      if (owner === "contacts" && path === "/internal/projection")
        return reply({
          schoolId: school,
          revision: "contacts-1",
          asOf: now,
          people: syntheticPeople,
          smcIds: [],
          dependencies: [
            {
              owner: "contacts",
              scope: "staff:synthetic-staff",
              revision: "1",
              validUntil: until,
            },
          ],
        });
      if (owner === "calendar" && path === "/internal/dates")
        return reply({
          rows: [
            {
              date: body.from,
              available: true,
              schoolDay: true,
              parity: "single",
              revision: "1",
            },
          ],
          revision: "1",
          asOf: now,
          dependencies: [
            {
              owner: "calendar",
              scope: "year:2026",
              revision: "1",
              validUntil: until,
            },
          ],
        });
      throw Error("Unexpected synthetic peer route " + owner + path);
    },
  };
}
const env = {
  SERVICE_NAME: "roster",
  get SCHOOL_ID() {
    return school;
  },
  GSIS_SECRET: "synthetic-owner-budget-secret",
  DB: db,
  get ARTIFACTS() {
    return h.bucket;
  },
  CORE: peer("core"),
  CONTACTS: peer("contacts"),
  CALENDAR: peer("calendar"),
};
const principal = () => ({
  schoolId: school,
  actorId: "synthetic-admin",
  staffId: "synthetic-staff",
  email: "admin@example.invalid",
  sessionId: "synthetic-session",
  decisionId: "synthetic-decision",
  validUntil: until,
  capabilities: ["admin", "roster.admin", "roster.read"],
  requestDigest: "a".repeat(64),
  action: "roster.admin",
  dependencies: [
    {
      owner: "core",
      scope: "account:synthetic-admin",
      revision: "1",
      validUntil: until,
    },
  ],
});
async function ownerCall(body, label, overrides = {}) {
  resetCosts(label);
  const bound = { ...body };
  delete bound.requestId;
  const who = {
    ...principal(),
    requestDigest: await digest(bound),
    ...overrides.principal,
  };
  let outcome;
  try {
    const result = await handle({
      env,
      principal: who,
      now,
      clock: () => now,
      path: "/operations",
      method: "POST",
      body,
      request: new Request("https://synthetic.invalid/operations"),
    });
    assert(costs.attempted <= 50, JSON.stringify(costs));
    outcome = "committed";
    return result;
  } catch (error) {
    outcome = error.code || error.message;
    throw error;
  } finally {
    metrics.push({ ...copy(costs), outcome });
    if (costs.attempted > 50)
      console.error(
        "OWNER SQL BUDGET FAILURE " + JSON.stringify(metrics.at(-1)),
      );
  }
}
async function seed(name, rows, positions = false) {
  school = name;
  const state = Operations.initial();
  state.systemConfig.consecutiveCountExclusions = [
    { type: "exact", value: "BLK" },
  ];
  state.systemConfig.driveBackup = Operations.normalizeDriveBackup({
    enabled: false,
    homeBaseFolderId: "synthetic-home-folder",
    folderId: "synthetic-backup-folder",
    continuitySheetId: "synthetic-continuity",
    sizeAlertMiB: 20,
  });
  state.systemConfig.driveDaily = Operations.normalizeDriveDaily(
    {
      enabled: false,
      folderId: "synthetic-daily-folder",
      auditFolderId: "synthetic-audit-folder",
    },
    state.systemConfig.driveBackup,
  );
  const entries = [
    ...Object.entries(state.systemConfig).map(([key, value]) => [
      "systemConfig",
      key,
      { kind: "map", data: value },
    ]),
    ...rows.map((data, position) => [
      "types",
      data.id,
      { kind: "array", data, ...(positions ? { position } : {}) },
    ]),
  ];
  await h.db.batch(
    entries.map(([collection, key, payload]) =>
      h.db
        .prepare(
          "INSERT INTO roster_records(school_id,collection,record_id,revision,payload_json) VALUES(?,?,?,?,?)",
        )
        .bind(school, collection, key, 1, canonical(payload)),
    ),
  );
  return state.systemConfig;
}
const loaded = () => loadState(h.db, school, requestedDates({ date }, now));
const readOwner = async () => (await loaded()).state;
const typeRecords = async () =>
  (await records(h.db, school)).filter((row) => row.collection === "types");
async function assertNoEffect(body, matcher, options) {
  const before = await records(h.db, school),
    audit = await query(
      h.db,
      "SELECT event_id FROM product_audit WHERE school_id=?",
      [school],
    );
  await assert.rejects(
    ownerCall(body, "negative-" + body.operationId, options),
    matcher,
  );
  assert.deepEqual(await records(h.db, school), before);
  assert.deepEqual(
    await query(h.db, "SELECT event_id FROM product_audit WHERE school_id=?", [
      school,
    ]),
    audit,
  );
}
try {
  await test("full owner saves of 1, 16 and 80 Unicode-labelled types stay within strict50 with three synthetic peer pins", async () => {
    for (const size of [1, 16, 80]) {
      const requested = types(size);
      await seed("budget-types-" + size, requested);
      const legacy = await loaded();
      assert.deepEqual(
        typeIds(legacy.state.types),
        [...typeIds(requested)].sort(),
        "all-absent metadata uses only documented legacy ID order",
      );
      const body = command("saveTypes", 0, { types: requested }),
        result = await ownerCall(body, size + "-types-first-stamp");
      assertSaved(result, body);
      assert.deepEqual(result.types, requested);
      assert.deepEqual((await readOwner()).types, requested);
      const rows = await typeRecords();
      assert(
        rows.every((row) =>
          Number.isSafeInteger(JSON.parse(row.payload_json).position),
        ),
      );
      assert.equal(
        (await operationStatus(h.db, school, body.operationId)).state,
        "committed",
      );
      const admissions = await query(
        h.db,
        "SELECT state,pins_json FROM product_admissions WHERE school_id=? AND operation_id=?",
        [school, body.operationId],
      );
      assert.equal(admissions[0].state, "resolved");
      assert.equal(JSON.parse(admissions[0].pins_json).length, 3);
      lastBody = body;
      lastReceipt = result.receipt;
    }
  });
  await test("reorder-only, relabel, lexical-first insertion and removal preserve order and historical type references", async () => {
    const before = await readOwner(),
      order = [...before.types].reverse();
    const historical = {
      id: "historical-absence",
      date: "2020-01-01",
      staffId: "historical-staff",
      typeId: order[0].id,
      typeLabel: "Historical label",
      periods: [0],
    };
    await h.db
      .prepare(
        "INSERT INTO roster_records(school_id,collection,record_id,service_date,revision,payload_json) VALUES(?,'absences',?,'2020-01-01',1,?)",
      )
      .bind(
        school,
        historical.id,
        canonical({ kind: "array", data: historical }),
      )
      .run();
    let body = command("saveTypes", 1, { types: order }),
      result = await ownerCall(body, "80-types-reorder-only");
    assertSaved(result, body);
    assert.deepEqual((await readOwner()).types, order);
    const renamed = order.map((row, i) => ({
      ...row,
      label: i === 0 ? row.label.slice(0, 99) + "改" : row.label,
    }));
    body = command("saveTypes", 2, { types: renamed });
    result = await ownerCall(body, "80-types-relabel");
    assertSaved(result, body);
    const inserted = [
      renamed[0],
      { ...renamed[1], id: "00-new", label: "Inserted type" },
      ...renamed.slice(2),
    ];
    body = command("saveTypes", 3, { types: inserted });
    result = await ownerCall(body, "80-types-insert-and-delete");
    assertSaved(result, body);
    assert.deepEqual((await readOwner()).types, inserted);
    const shorter = inserted.slice(1);
    body = command("saveTypes", 4, { types: shorter });
    result = await ownerCall(body, "79-types-remove");
    assertSaved(result, body);
    assert.deepEqual((await readOwner()).types, shorter);
    const history = await h.db
      .prepare(
        "SELECT payload_json FROM roster_records WHERE school_id=? AND collection='absences' AND record_id=?",
      )
      .bind(school, historical.id)
      .first();
    assert.deepEqual(JSON.parse(history.payload_json).data, historical);
    lastBody = body;
    lastReceipt = result.receipt;
  });
  await test("all active settings fit full-owner strict50, preserve hidden/Drive state, and never stamp unrelated legacy types", async () => {
    const config = await seed("budget-config", types(16)),
      beforeTypes = await typeRecords(),
      input = {
        ...config,
        googleBackupLagMinutes: 17,
        verboseLogging: false,
        allowAdvancePublishing: true,
        noReliefSubjects: [{ type: "wildcard", value: "PD*" }],
        consecutiveCountExclusions: [{ type: "wildcard", value: "BLK*" }],
        scheduledAllocationEnabled: true,
        sharedSubjectCoverEnabled: false,
        sharedSubjectCoverSubjects: [],
        smcSummaryTimes: { evening: ["17:00"], morning: ["06:00"] },
        reliefHealthPeriods: [1, 3],
        employmentPeriodRestrictions: [],
        subjectFamilies: config.subjectFamilies.map((row, i) => ({
          ...row,
          name: row.name + (i === 0 ? " revised" : ""),
        })),
        driveDaily: { ...config.driveDaily, folderId: "changed-daily-folder" },
        driveBackup: { ...config.driveBackup, sizeAlertMiB: 21 },
      };
    // Synthetic identity deliberately matches one hard-coded legacy alias so a
    // view-only nameBridges seed would be observable if it leaked into writes.
    syntheticPeople = [
      {
        staffId: "synthetic-alias",
        name: "Yasmin (Art)",
        active: true,
        eo: true,
        employment: "Full-time",
        groups: [],
      },
    ];
    for (const key of hidden) delete input[key];
    const body = command("saveSystemConfig", 0, input),
      result = await ownerCall(body, "all-active-settings");
    assertSaved(result, body);
    assert.deepEqual(retained(result.config), retained(config));
    assert.deepEqual(result.subjects, []);
    assert.deepEqual(result.consecutiveSubjects, []);
    assert.equal(result.baseline, null);
    assert.deepEqual(
      result.nameBridges.links,
      [],
      "saved view does not invent a legacy alias",
    );
    for (const key of Object.keys(input))
      assert.deepEqual(result.config[key], input[key], key);
    assert.deepEqual(await typeRecords(), beforeTypes);
    assert.equal(
      (await records(h.db, school)).filter((row) =>
        ["nameBridges", "nameBridgesSeeded"].includes(row.collection),
      ).length,
      0,
      "admin read projection cannot persist implicit aliases",
    );
    assert.equal(
      (
        await query(h.db, "SELECT * FROM product_outbox WHERE school_id=?", [
          school,
        ])
      ).length,
      0,
    );
    const legacy = (await readOwner()).types,
      stamp = command("saveTypes", 1, { types: legacy });
    const stamped = await ownerCall(stamp, "unchanged-legacy-full-stamp");
    assertSaved(stamped, stamp);
    assert(
      (await typeRecords()).every((row) =>
        Object.hasOwn(JSON.parse(row.payload_json), "position"),
      ),
    );
    syntheticPeople = [];
  });
  await test("invalid type bounds/IDs/timing and attempted hidden-policy changes leave no partial record or success audit", async () => {
    const current = await readOwner(),
      config = current.systemConfig;
    for (const candidate of [
      [],
      types(81),
      [{ ...types(1)[0], id: "bad space" }],
      [types(1)[0], types(1)[0]],
      [{ ...types(1)[0], afterMinutes: 1440 }],
      [{ ...types(1)[0], allowedPeriods: [40] }],
    ])
      await assertNoEffect(
        command("saveTypes", 2, { types: candidate }),
        (e) => e.status === 400,
      );
    for (const key of hidden) {
      const value =
        typeof config[key] === "number"
          ? config[key] + 1
          : Array.isArray(config[key])
            ? []
            : {};
      await assertNoEffect(
        command("saveSystemConfig", 2, { ...config, [key]: value }),
        (e) => e.code === "LAYER_SETTINGS_READ_ONLY",
      );
    }
    await assertNoEffect(
      command("saveSystemConfig", 2, {
        ...config,
        sharedSubjectCoverSubjects: ["PAL"],
      }),
      (e) => e.status === 400,
    );
    await assertNoEffect(
      command("saveSystemConfig", 2, {
        ...config,
        consecutiveCountExclusions: [{ type: "wildcard", value: "invalid" }],
      }),
      (e) => e.status === 400,
    );
  });
  await test("bounded legal input whose complete audit/receipt plan exceeds the byte limit rejects before the commit batch", async () => {
    const config = (await readOwner()).systemConfig,
      subjectFamilies = Array.from({ length: 50 }, (_, family) => ({
        id: "family-" + family,
        name: "Synthetic family " + family,
        reliefRequired: true,
        subjects: Array.from({ length: 100 }, (_, subject) =>
          ("F" + family + "S" + subject + "-").padEnd(100, "A"),
        ),
      })),
      body = command("saveSystemConfig", 2, { ...config, subjectFamilies });
    assert(
      Buffer.byteLength(JSON.stringify(body)) < 1048576,
      "request itself fits the public body bound",
    );
    await assertNoEffect(
      body,
      (e) => e.code === "ADMIN_SAVE_BOUNDS" && e.status === 413,
    );
    assert.equal(
      costs.batches.length,
      0,
      "oversized complete plan never reaches an owner commit batch",
    );
  });
  await test("valid retained annotation survives normalization exactly, including new audit and untouched historical audit", async () => {
    const priorSchool = school,
      config = await seed("retained-annotation", types(1));
    config.consecutiveSubjectRules = [
      { subject: "pal (retained annotation)", periods: 3 },
    ];
    await h.db
      .prepare(
        "UPDATE roster_records SET payload_json=? WHERE school_id=? AND collection='systemConfig' AND record_id='consecutiveSubjectRules'",
      )
      .bind(
        canonical({ kind: "map", data: config.consecutiveSubjectRules }),
        school,
      )
      .run();
    const historical = {
      id: "historical-config-audit",
      at: "2020-01-01T00:00:00.000Z",
      operation: "saveSystemConfig",
      config: {
        consecutiveSubjectRules: [
          { subject: "Old historical rule", periods: 2 },
        ],
      },
    };
    await h.db
      .prepare(
        "INSERT INTO roster_records(school_id,collection,record_id,revision,payload_json) VALUES(?,'audit',?,1,?)",
      )
      .bind(
        school,
        historical.id,
        canonical({ kind: "array", data: historical }),
      )
      .run();
    const body = command("saveSystemConfig", 0, {
        ...config,
        googleBackupLagMinutes: 11,
      }),
      result = await ownerCall(body, "retained-annotation");
    assertSaved(result, body);
    assert.deepEqual(retained(result.config), retained(config));
    assert.deepEqual(result.subjects, []);
    assert.deepEqual(result.consecutiveSubjects, []);
    assert.equal(result.baseline, null);
    const audit = (await records(h.db, school))
      .filter((row) => row.collection === "audit")
      .map((row) => JSON.parse(row.payload_json).data);
    assert.deepEqual(
      audit.find((row) => row.id === historical.id),
      historical,
    );
    const current = audit.filter((row) => row.id !== historical.id);
    assert(current.length > 0);
    assert(
      current.some(
        (row) =>
          canonical(
            row.config?.consecutiveSubjectRules ??
              row.details?.config?.consecutiveSubjectRules ??
              null,
          ) === canonical(config.consecutiveSubjectRules),
      ),
    );
    school = priorSchool;
  });
  await test("compacted owner assertions reject config, unchanged-member, deletion and membership races atomically", async () => {
    const savedTypes = (await readOwner()).types;
    for (const kind of ["config", "unchanged-member", "deletion", "addition"]) {
      const before = await records(h.db, school),
        body = command("saveTypes", kind === "config" ? 2 : 3, {
          types: savedTypes,
        });
      inject = async () => {
        if (kind === "config")
          await h.db
            .prepare(
              "UPDATE roster_scopes SET revision=revision+1 WHERE school_id=? AND scope='config'",
            )
            .bind(school)
            .run();
        else if (kind === "unchanged-member")
          await h.db
            .prepare(
              "UPDATE roster_records SET revision=revision+1 WHERE school_id=? AND collection='types' AND record_id=?",
            )
            .bind(school, savedTypes[0].id)
            .run();
        else if (kind === "deletion")
          await h.db
            .prepare(
              "DELETE FROM roster_records WHERE school_id=? AND collection='types' AND record_id=?",
            )
            .bind(school, savedTypes[0].id)
            .run();
        else
          await h.db
            .prepare(
              "INSERT INTO roster_records(school_id,collection,record_id,revision,payload_json) VALUES(?,'types','new-concurrent',1,?)",
            )
            .bind(
              school,
              canonical({
                kind: "array",
                data: { ...savedTypes[0], id: "new-concurrent" },
                position: savedTypes.length,
              }),
            )
            .run();
      };
      await assert.rejects(
        ownerCall(body, "race-" + kind),
        (e) => e.status === 409,
      );
      assert.equal(inject, null, "race injected at actual atomic owner commit");
      assert.equal(
        (await operationStatus(h.db, school, body.operationId)).state,
        "aborted",
      );
      assert.equal(
        (
          await query(
            h.db,
            "SELECT * FROM product_audit WHERE school_id=? AND operation_id=?",
            [school, body.operationId],
          )
        ).length,
        0,
      );
      const after = await records(h.db, school);
      assert.deepEqual(
        after.filter((row) => row.collection !== "types"),
        before.filter((row) => row.collection !== "types"),
      );
      // Restore only the deliberate independent race fixture, never a committed save.
      if (kind !== "config") {
        await h.db
          .prepare(
            "DELETE FROM roster_records WHERE school_id=? AND collection='types'",
          )
          .bind(school)
          .run();
        await h.db.batch(
          before
            .filter((row) => row.collection === "types")
            .map((row) =>
              h.db
                .prepare(
                  "INSERT INTO roster_records(school_id,collection,record_id,revision,payload_json) VALUES(?,'types',?,?,?)",
                )
                .bind(school, row.record_id, row.revision, row.payload_json),
            ),
        );
      }
    }
  });
  await test("mixed, duplicate, gapped and malformed stored positions fail closed; foreign-school records cannot fill gaps", async () => {
    const snapshot = await typeRecords(),
      first = snapshot[0],
      second = snapshot[1];
    const malformed = [
      null,
      -1,
      1.5,
      999,
      JSON.parse(second.payload_json).position,
    ];
    for (const value of malformed) {
      const payload = JSON.parse(first.payload_json);
      if (value === null) delete payload.position;
      else payload.position = value;
      await h.db
        .prepare(
          "UPDATE roster_records SET payload_json=? WHERE school_id=? AND collection='types' AND record_id=?",
        )
        .bind(canonical(payload), school, first.record_id)
        .run();
      await assert.rejects(
        loaded(),
        (e) => e.code === "TYPE_ORDER_INTEGRITY" && e.status === 503,
      );
    }
    await h.db
      .prepare(
        "UPDATE roster_records SET payload_json=? WHERE school_id=? AND collection='types' AND record_id=?",
      )
      .bind(first.payload_json, school, first.record_id)
      .run();
    for (const payload of [
      "null",
      "{",
      canonical({
        ...JSON.parse(first.payload_json),
        data: { ...JSON.parse(first.payload_json).data, id: "bad id" },
      }),
    ]) {
      await h.db
        .prepare(
          "UPDATE roster_records SET payload_json=? WHERE school_id=? AND collection='types' AND record_id=?",
        )
        .bind(payload, school, first.record_id)
        .run();
      await assert.rejects(
        loaded(),
        (e) => e.code === "TYPE_ORDER_INTEGRITY" && e.status === 503,
      );
    }
    await h.db
      .prepare(
        "UPDATE roster_records SET payload_json=? WHERE school_id=? AND collection='types' AND record_id=?",
      )
      .bind(first.payload_json, school, first.record_id)
      .run();
    for (const [column, value] of [
      ["service_date", "2020-01-01"],
      ["staff_id", "unexpected-staff"],
      ["year", "2020"],
    ]) {
      await h.db
        .prepare(
          "UPDATE roster_records SET " +
            column +
            "=? WHERE school_id=? AND collection='types' AND record_id=?",
        )
        .bind(value, school, first.record_id)
        .run();
      await assert.rejects(
        loaded(),
        (e) => e.code === "TYPE_ORDER_INTEGRITY" && e.status === 503,
      );
      await h.db
        .prepare(
          "UPDATE roster_records SET " +
            column +
            "=NULL WHERE school_id=? AND collection='types' AND record_id=?",
        )
        .bind(school, first.record_id)
        .run();
    }
    await h.db
      .prepare(
        "INSERT INTO roster_records(school_id,collection,record_id,revision,payload_json) VALUES('foreign-school','types',?,1,?)",
      )
      .bind(
        first.record_id,
        canonical({
          kind: "array",
          data: {
            ...JSON.parse(first.payload_json).data,
            label: "foreign-only",
          },
          position: 0,
        }),
      )
      .run();
    assert(
      !(await readOwner()).types.some((row) => row.label === "foreign-only"),
    );
  });
  await test("zero-revision presence remains distinct from absence in compacted atomic settings guards", async () => {
    const target = (await records(h.db, school)).find(
      (row) =>
        row.collection === "systemConfig" &&
        row.record_id === "googleBackupLagMinutes",
    );
    for (const present of [true, false]) {
      if (present)
        await h.db
          .prepare(
            "UPDATE roster_records SET revision=0 WHERE school_id=? AND collection='systemConfig' AND record_id=?",
          )
          .bind(school, target.record_id)
          .run();
      else
        await h.db
          .prepare(
            "DELETE FROM roster_records WHERE school_id=? AND collection='systemConfig' AND record_id=?",
          )
          .bind(school, target.record_id)
          .run();
      const config = (await readOwner()).systemConfig,
        body = command("saveSystemConfig", 3, {
          ...config,
          googleBackupLagMinutes: 19,
        });
      inject = async () => {
        if (present)
          await h.db
            .prepare(
              "DELETE FROM roster_records WHERE school_id=? AND collection='systemConfig' AND record_id=?",
            )
            .bind(school, target.record_id)
            .run();
        else
          await h.db
            .prepare(
              "INSERT INTO roster_records(school_id,collection,record_id,revision,payload_json) VALUES(?,'systemConfig',?,0,?)",
            )
            .bind(school, target.record_id, target.payload_json)
            .run();
      };
      await assert.rejects(
        ownerCall(body, present ? "present-zero-removed" : "absent-zero-added"),
        (e) => e.status === 409,
      );
      assert.equal(inject, null);
      assert.equal(
        (
          await query(
            h.db,
            "SELECT * FROM product_audit WHERE school_id=? AND operation_id=?",
            [school, body.operationId],
          )
        ).length,
        0,
      );
      await h.db
        .prepare(
          "INSERT INTO roster_records(school_id,collection,record_id,revision,payload_json) VALUES(?,'systemConfig',?,?,?) ON CONFLICT(school_id,collection,record_id) DO UPDATE SET revision=excluded.revision,payload_json=excluded.payload_json",
        )
        .bind(school, target.record_id, target.revision, target.payload_json)
        .run();
    }
  });
  await test("missing admission authority, preview and mismatched school cannot commit owner records", async () => {
    const config = (await readOwner()).systemConfig;
    await assertNoEffect(
      command("saveSystemConfig", 3, { ...config, googleBackupLagMinutes: 18 }),
      (e) => e.code === "AUTHORITY_UNAVAILABLE",
      { principal: { dependencies: [] } },
    );
    await assertNoEffect(
      command("saveSystemConfig", 3, config),
      (e) => e.status === 403,
      { principal: { impersonating: true } },
    );
    await assertNoEffect(
      command("saveSystemConfig", 3, config),
      (e) => e.code === "SCHOOL_MISMATCH",
      { principal: { schoolId: "foreign-school" } },
    );
    await assertNoEffect(
      command("saveSystemConfig", 3, config),
      (e) => e.code === "CAPABILITY_DENIED",
      { principal: { capabilities: ["roster.read"] } },
    );
  });
  await test("actual owner process restart recovers the complete ordered type receipt after response loss", async () => {
    school = "budget-types-80";
    const expected = (await readOwner()).types,
      saved = lastReceipt;
    assert.equal(saved.operationId, lastBody.operationId);
    await h.restart();
    assert.deepEqual((await readOwner()).types, expected);
    const replay = await ownerCall(lastBody, "restart-original-receipt");
    assert.deepEqual(replay.receipt, saved);
    assert.deepEqual(replay.types, expected);
    await assertNoEffect(
      { ...lastBody, types: [...lastBody.types].reverse() },
      (e) => e.code === "OPERATION_INTENT_CONFLICT",
    );
  });
  console.log(
    "OWNER SQL budget (synthetic peers; actual D1): " +
      JSON.stringify(
        metrics
          .filter((m) => !m.label.startsWith("negative"))
          .map(
            ({
              label,
              attempted,
              dispatched,
              maxBinds,
              jsonBytes,
              batches,
              outcome,
            }) => ({
              label,
              attempted,
              dispatched,
              maxBinds,
              jsonBytes,
              batches,
              outcome,
            }),
          ),
      ),
  );
  console.log(
    "PASS " +
      passed +
      " Roster administrative settings groups; official/runtime UAT Not tested.",
  );
} finally {
  await h.close();
}
