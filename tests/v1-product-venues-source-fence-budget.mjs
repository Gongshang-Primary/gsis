import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import {
  abortOperation,
  canonical,
  digest,
  operationStatus,
} from "../v1/runtime/store.mjs";
import { sourceBegin } from "../v1/services/venues/service.mjs";

// Only the Venues owner uses actual persisted D1 here. Core decision and Deploy
// source proofs are explicitly synthetic adapters, not live authorization/UAT.
const runtime = await createDatabase("venues");
const school = "synthetic-fence-budget";
const source = new Map();
const decisions = new Map();
const roomId = (n) => "room-" + String(n).padStart(4, "0");
function measured(db, { limit = 50, afterSnapshot, beforeBatch } = {}) {
  const state = {
    attempted: 0,
    dispatched: 0,
    completed: 0,
    maxBindings: 0,
    jsonBytes: 0,
    batches: [],
    trace: [],
  };
  function account(statements, batch) {
    state.attempted += statements.length;
    for (const s of statements) {
      state.trace.push({ sql: s.sql, args: s.args });
      state.maxBindings = Math.max(state.maxBindings, s.args.length);
      for (const value of s.args) {
        if (typeof value === "string" && /^[\[{]/.test(value))
          state.jsonBytes += Buffer.byteLength(value);
      }
    }
    if (batch) state.batches.push(statements.length);
    if (state.attempted > limit)
      throw Error(
        "SYNTHETIC_D1_QUERY_BUDGET " + state.attempted + " > " + limit,
      );
  }
  function wrap(native, sql, args = []) {
    const statement = {
      native,
      sql,
      args,
      bind(...values) {
        return wrap(native.bind(...values), sql, values);
      },
    };
    for (const method of ["first", "all", "run", "raw"]) {
      statement[method] = async (...values) => {
        account([statement], false);
        state.dispatched++;
        const result = await native[method](...values);
        state.completed++;
        if (
          afterSnapshot &&
          /SELECT/i.test(sql) &&
          /venues_records/.test(sql) &&
          /json_each/.test(sql)
        ) {
          const hook = afterSnapshot;
          afterSnapshot = null;
          await hook(result);
        }
        return result;
      };
    }
    return statement;
  }
  return {
    state,
    db: {
      prepare(sql) {
        return wrap(db.prepare(sql), sql);
      },
      async batch(statements) {
        account(statements, true);
        if (beforeBatch) await beforeBatch(statements);
        state.dispatched += statements.length;
        const result = await db.batch(statements.map((s) => s.native));
        state.completed += statements.length;
        return result;
      },
    },
  };
}
function fixture(name, count = 0, projection = {}) {
  const principal = {
    schoolId: school,
    actorId: "synthetic-actor",
    staffId: "synthetic-staff",
    capabilities: ["admin"],
    decisionId: "decision-" + name,
    requestDigest: "synthetic-request-" + name,
    validUntil: Date.now() + 3600000,
  };
  const proof = {
    state: "prepared",
    schoolId: school,
    operationId: name,
    actorId: principal.actorId,
    digest: "source-digest-" + name,
    fence: 1,
    requestDigest: principal.requestDigest,
    authorityAction: "deploy.publish",
    projection: {
      occupancies: [],
      referenceVenues: Array.from({ length: count }, (_, i) => ({
        venueId: roomId(i),
        revision: 1,
      })),
      ...projection,
    },
  };
  const descriptor = {
    service: "deploy",
    action: "deploy.publish",
    operationId: name,
  };
  decisions.set(principal.decisionId, { principal, descriptor });
  source.set(name, proof);
  return {
    principal,
    proof,
    body: {
      schoolId: school,
      sourceDomain: "deploy",
      sourceOperationId: name,
      sourceDigest: proof.digest,
      sourceFence: 1,
      decisionId: principal.decisionId,
    },
  };
}
function context(input, counter) {
  return {
    now: Date.now(),
    body: input.body,
    env: {
      DB: counter.db,
      SCHOOL_ID: school,
      SERVICE_NAME: "venues",
      GSIS_SECRET: "synthetic-only",
      CORE: {
        async fetch(request) {
          const expected = await request.json();
          const evidence = decisions.get(expected.decisionId);
          if (!evidence || evidence.principal.validUntil <= Date.now())
            return Response.json(
              { ok: false, error: { code: "AUTHORITY_CHANGED" } },
              { status: 409 },
            );
          const { principal, descriptor } = evidence;
          assert.equal(expected.schoolId, principal.schoolId);
          assert.equal(expected.service, descriptor.service);
          assert.equal(expected.operationId, descriptor.operationId);
          assert(expected.actions.includes(descriptor.action));
          return Response.json({ ok: true, data: evidence });
        },
      },
      DEPLOY: {
        async fetch(request) {
          const body = await request.json();
          assert.equal(
            new URL(request.url).pathname,
            "/internal/publication-status",
          );
          return Response.json({
            ok: true,
            data: source.get(body.operationId),
          });
        },
      },
    },
  };
}
const localId = async (name) =>
  "fence:" + (await digest(["deploy", name])).slice(0, 40);
async function durable(input) {
  const op = await runtime.db
    .prepare(
      "SELECT state,fence,digest,receipt_json FROM product_operations WHERE school_id=? AND operation_id=?",
    )
    .bind(school, await localId(input.body.sourceOperationId))
    .first();
  const fence = await runtime.db
    .prepare(
      "SELECT * FROM venues_source_fences WHERE school_id=? AND source_operation_id=?",
    )
    .bind(school, input.body.sourceOperationId)
    .first();
  const scopes = await runtime.db
    .prepare(
      "SELECT venue_id,start_at,end_at FROM venues_fence_scopes WHERE school_id=? AND source_operation_id=? ORDER BY venue_id,start_at,end_at",
    )
    .bind(school, input.body.sourceOperationId)
    .all();
  const audit = await runtime.db
    .prepare(
      "SELECT COUNT(*) AS n FROM product_audit WHERE school_id=? AND operation_id=?",
    )
    .bind(school, await localId(input.body.sourceOperationId))
    .first();
  return { op, fence, scopes: scopes.results, audit: audit.n };
}
const totals = [];
const failureBudgets = [];
const brief = ({ trace, ...state }) => state;
async function invoke(input, options = {}) {
  const counter = measured(runtime.db, options);
  try {
    const result = await sourceBegin(context(input, counter));
    return { result, counter };
  } catch (error) {
    error.counter = brief(counter.state);
    throw error;
  }
}
async function rejected(input, code, options) {
  await assert.rejects(
    () => invoke(input, options),
    (error) => {
      assert.equal(error.code, code, error.message);
      assert(error.counter.attempted <= 50, JSON.stringify(error.counter));
      failureBudgets.push({
        operation: input.body.sourceOperationId,
        code,
        ...error.counter,
      });
      return true;
    },
  );
  const value = await durable(input);
  assert.equal(value.fence, null);
  assert.deepEqual(value.scopes, []);
  assert.equal(value.audit, 0);
  assert.notEqual(value.op?.state, "committed");
  return value;
}
function budget(counter) {
  assert(counter.state.attempted <= 25, JSON.stringify(brief(counter.state)));
  assert(counter.state.maxBindings <= 100);
  assert(counter.state.jsonBytes < 1048576);
}
let groups = 0;
async function test(name, run) {
  await run();
  console.log("PASS " + name);
  groups++;
}
const start = Date.now() + 86400000;
const end = start + 600000;
const occupancy = (extra = {}) => ({
  venueId: roomId(0),
  start,
  end,
  ...extra,
});
async function room(number = 0, data = {}, revision = 1) {
  await runtime.db
    .prepare(
      "INSERT OR REPLACE INTO venues_records(school_id,kind,record_id,revision,data_json) VALUES(?,'venues',?,?,?)",
    )
    .bind(
      school,
      roomId(number),
      revision,
      JSON.stringify({
        id: roomId(number),
        name: "Synthetic room " + number,
        ...data,
      }),
    )
    .run();
}
async function interval(extra = {}) {
  const value = {
    school,
    id: "synthetic-conflict",
    kind: "booking",
    venueId: roomId(0),
    group: "",
    start: start + 1,
    end: end - 1,
    buffer: 0,
    status: "confirmed",
    ...extra,
  };
  await runtime.db
    .prepare(
      "INSERT OR REPLACE INTO venues_intervals(school_id,record_id,kind,venue_id,overlap_group,start_at,end_at,buffer_ms,status) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      value.school,
      value.id,
      value.kind,
      value.venueId,
      value.group,
      value.start,
      value.end,
      value.buffer,
      value.status,
    )
    .run();
}
async function clearIntervals() {
  await runtime.db
    .prepare(
      "DELETE FROM venues_intervals WHERE record_id='synthetic-conflict'",
    )
    .run();
}
try {
  await runtime.db.batch(
    Array.from({ length: 1000 }, (_, i) =>
      runtime.db
        .prepare(
          "INSERT INTO venues_records(school_id,kind,record_id,revision,data_json) VALUES(?,'venues',?,1,?)",
        )
        .bind(
          school,
          roomId(i),
          JSON.stringify({ id: roomId(i), name: "Synthetic room " + i }),
        ),
    ),
  );
  await test("1/10/11/41/143/1000 references fit one constant owner SQL budget", async () => {
    for (const n of [1, 10, 11, 41, 143, 1000]) {
      const input = fixture("budget-" + n, n);
      const before = canonical(input);
      const { result, counter } = await invoke(input);
      budget(counter);
      assert.equal(result.state, "pending");
      assert.equal(result.sealed, true);
      assert.equal(result.scopeCount, 0);
      assert.equal(canonical(input), before);
      const saved = await durable(input);
      assert.equal(saved.op.state, "committed");
      assert.equal(saved.fence.state, "pending");
      assert.equal(saved.audit, 1);
      assert.deepEqual(
        saved.scopes,
        Array.from({ length: n }, (_, i) => ({
          venue_id: roomId(i),
          start_at: 0,
          end_at: 0,
        })),
      );
      totals.push({ references: n, ...brief(counter.state) });
    }
    assert.equal(new Set(totals.map((x) => x.attempted)).size, 1);
    assert.equal(new Set(totals.map((x) => JSON.stringify(x.batches))).size, 1);
    console.log("OWNER_BUDGETS " + JSON.stringify(totals));
    assert.equal(
      (
        await runtime.db
          .prepare("SELECT COUNT(*) AS n FROM product_admissions")
          .first()
      ).n,
      0,
    );
    assert.equal(
      (
        await runtime.db
          .prepare("SELECT COUNT(*) AS n FROM source_pins")
          .first()
      ).n,
      0,
    );
  });
  await test("raw count, serialized byte, strict revision and school boundaries reject without a partial fence", async () => {
    await rejected(
      fixture("raw-references", 0, {
        referenceVenues: Array.from({ length: 1001 }, () => ({
          venueId: roomId(0),
          revision: 1,
        })),
      }),
      "INVALID_REFERENCE",
    );
    await rejected(
      fixture("raw-occupancies", 0, {
        occupancies: Array.from({ length: 10001 }, () => occupancy()),
      }),
      "SOURCE_PROJECTION_REQUIRED",
    );
    await rejected(
      fixture("normalized-bytes", 0, {
        occupancies: Array.from({ length: 10000 }, (_, i) => ({
          venueId: roomId(0),
          start: i * 2 + 1,
          end: i * 2 + 2,
        })),
      }),
      "BOUNDS_EXCEEDED",
    );
    await rejected(
      fixture("transport-bytes", 0, {
        occupancies: [occupancy({ sourceId: "x".repeat(1048576) })],
      }),
      "DEPENDENCY_INVALID",
    );
    const maxDuplicateScopes = fixture("raw-occupancy-boundary", 0, {
      occupancies: Array.from({ length: 10000 }, () => occupancy()),
    });
    const maximum = await invoke(maxDuplicateScopes);
    budget(maximum.counter);
    assert.equal(maximum.result.scopeCount, 1);
    // Room-owned UTF-8 metadata expands three SQL-bound copies even though the
    // compact source proof remains safely below its independent transport cap.
    await room(0, { overlapGroup: "😀".repeat(100) });
    try {
      const compact = (length) =>
        Array.from({ length }, (_, i) => ({
          venueId: roomId(0),
          start: i * 2 + 1,
          end: i * 2 + 2,
        }));
      const nearBound = await invoke(
        fixture("unicode-within-budget", 0, { occupancies: compact(700) }),
      );
      budget(nearBound.counter);
      assert(nearBound.counter.state.jsonBytes > 800000);
      console.log(
        "UNICODE_OCCUPIED_BUDGET " +
          JSON.stringify(brief(nearBound.counter.state)),
      );
      await rejected(
        fixture("unicode-over-budget", 0, { occupancies: compact(1000) }),
        "BOUNDS_EXCEEDED",
      );
    } finally {
      await room(0);
    }
    for (const [name, revisions] of [
      ["string", [1, "1"]],
      ["reverse-string", ["1", 1]],
      ["contradictory", [1, 2]],
      ["null", [null]],
      ["zero", [0]],
    ]) {
      await rejected(
        fixture("revision-" + name, 0, {
          referenceVenues: revisions.map((revision) => ({
            venueId: roomId(0),
            revision,
          })),
        }),
        "VENUE_REFERENCE_CHANGED",
      );
    }
    await runtime.db
      .prepare(
        "INSERT INTO venues_records(school_id,kind,record_id,revision,data_json) VALUES('other-school','venues','foreign-room',1,'{}'),(?,'closures','other-kind',1,'{}')",
      )
      .bind(school)
      .run();
    for (const venueId of ["missing-room", "foreign-room", "other-kind"]) {
      await rejected(
        fixture("reference-" + venueId, 0, {
          referenceVenues: [{ venueId, revision: 1 }],
        }),
        "VENUE_REFERENCE_CHANGED",
      );
      await rejected(
        fixture("occupied-" + venueId, 0, {
          occupancies: [occupancy({ venueId })],
        }),
        "INVALID_VENUE",
      );
    }
    for (const [name, bounds] of [
      ["empty", { end: start }],
      ["reversed", { end: start - 1 }],
      ["fractional", { start: start + 0.5 }],
      ["long", { end: start + 86400001 }],
      ["date", { start: "not-a-date" }],
    ]) {
      await rejected(
        fixture("interval-" + name, 0, { occupancies: [occupancy(bounds)] }),
        "INVALID_PROJECTION",
      );
    }
  });
  await test("duplicate scopes preserve original intent, every conflict and the existing primary-key insertion winner", async () => {
    const rows = [
      occupancy({ end: end + 1, sourceId: "long" }),
      occupancy({ sourceId: "first" }),
      occupancy({ sourceId: "second" }),
    ];
    const input = fixture("duplicate-identity", 0, {
      referenceVenues: [
        { venueId: roomId(0), revision: 1 },
        { venueId: roomId(0), revision: 1 },
      ],
      occupancies: rows,
    });
    const { result, counter } = await invoke(input);
    budget(counter);
    assert.equal(result.scopeCount, 2);
    const saved = await durable(input);
    assert.deepEqual(saved.scopes, [
      { venue_id: roomId(0), start_at: 0, end_at: 0 },
      { venue_id: roomId(0), start_at: start, end_at: end },
    ]);
    const scopes = [
      occupancy({ sourceId: "first" }),
      occupancy({ end: end + 1, sourceId: "long" }),
    ];
    assert.equal(
      saved.op.digest,
      await digest({
        schoolId: school,
        actorId: input.principal.actorId,
        action: "internal.venues.source-begin",
        intent: {
          sourceDomain: "deploy",
          sourceOperationId: input.body.sourceOperationId,
          digest: input.body.sourceDigest,
          fence: 1,
          scopes,
        },
      }),
    );
    await interval({ start: end, end: end + 10 });
    try {
      await rejected(
        fixture("duplicate-longer-conflict", 0, { occupancies: rows }),
        "REVISION_CONFLICT",
      );
    } finally {
      await clearIntervals();
    }
    const iso = fixture("date-parsing", 0, {
      occupancies: [
        occupancy({
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          sourceId: "explicit",
        }),
      ],
    });
    iso.body.scopes = [{ venueId: roomId(0), start, end }];
    assert.equal((await invoke(iso)).result.scopeCount, 1);
    const wrong = fixture("supplied-scope", 0, { occupancies: [occupancy()] });
    wrong.body.scopes = [];
    await rejected(wrong, "SOURCE_SCOPE_MISMATCH");
    console.log("OCCUPIED_BUDGET " + JSON.stringify(brief(counter.state)));
    for (const statement of counter.state.trace.filter((x) =>
      x.sql.includes("CROSS JOIN venues_intervals"),
    )) {
      const plan = await runtime.db
        .prepare("EXPLAIN QUERY PLAN " + statement.sql)
        .bind(...statement.args)
        .all();
      assert(
        plan.results.some((r) =>
          /SEARCH occupied USING INDEX venues_intervals_(overlap|linked)/.test(
            r.detail,
          ),
        ),
        JSON.stringify(plan.results),
      );
      console.log(
        "CONFLICT_QUERY_PLAN " +
          JSON.stringify(plan.results.map((r) => r.detail)),
      );
    }
  });
  await test("direct and linked booking/closure statuses retain both buffers and strict half-open boundaries", async () => {
    await room(0, { overlapGroup: "shared" });
    let i = 0;
    try {
      for (const kind of ["booking", "closure"]) {
        for (const status of ["confirmed", "pending", "active"]) {
          for (const linked of [false, true]) {
            await interval({
              kind,
              status,
              venueId: roomId(linked ? 1 : 0),
              group: linked ? "shared" : "",
            });
            await rejected(
              fixture("conflict-" + i++, 0, { occupancies: [occupancy()] }),
              "REVISION_CONFLICT",
            );
            await clearIntervals();
          }
        }
      }
      for (const extra of [
        { status: "cancelled" },
        { school: "other-school" },
        { kind: "source" },
        { venueId: roomId(1), group: "unrelated" },
      ]) {
        await interval(extra);
        budget(
          (
            await invoke(
              fixture("ignored-" + i++, 0, { occupancies: [occupancy()] }),
            )
          ).counter,
        );
        await clearIntervals();
      }
      await room(0);
      await interval({ venueId: roomId(1), group: "" });
      assert.equal(
        (
          await invoke(
            fixture("empty-groups", 0, { occupancies: [occupancy()] }),
          )
        ).result.sealed,
        true,
      );
      await clearIntervals();
      await room(0, { overlapGroup: "shared", bufferMinutes: 2 });
      for (const before of [false, true]) {
        for (const linked of [false, true]) {
          for (const inside of [false, true]) {
            const boundary = before ? start - 180000 : end + 180000;
            await interval({
              kind: before ? "closure" : "booking",
              venueId: roomId(linked ? 1 : 0),
              group: linked ? "shared" : "",
              buffer: 60000,
              start: before ? boundary - 600000 : boundary - (inside ? 1 : 0),
              end: before ? boundary + (inside ? 1 : 0) : boundary + 600000,
            });
            const input = fixture("buffer-boundary-" + i++, 0, {
              occupancies: [occupancy()],
            });
            if (inside) await rejected(input, "REVISION_CONFLICT");
            else budget((await invoke(input)).counter);
            await clearIntervals();
          }
        }
      }
    } finally {
      await clearIntervals();
      await room(0);
    }
  });
  await test("snapshot-to-commit owner changes roll back the entire fence and its audit", async () => {
    const mutations = [
      ["revision", () => room(0, {}, 2)],
      ["group", () => room(0, { overlapGroup: "changed" }, 2)],
      ["buffer", () => room(0, { bufferMinutes: 15 }, 2)],
      [
        "deleted",
        () =>
          runtime.db
            .prepare(
              "DELETE FROM venues_records WHERE school_id=? AND kind='venues' AND record_id=?",
            )
            .bind(school, roomId(0))
            .run(),
      ],
      ["booking", () => interval()],
      ["closure", () => interval({ kind: "closure", status: "active" })],
      [
        "linked",
        () =>
          interval({
            venueId: roomId(1),
            group: "shared",
            kind: "closure",
            status: "active",
          }),
      ],
    ];
    for (const [name, mutate] of mutations) {
      await room(0, { overlapGroup: "shared" });
      let paused = false;
      try {
        const input = fixture("race-" + name, 1, {
          occupancies: [occupancy()],
        });
        const saved = await rejected(input, "REVISION_CONFLICT", {
          afterSnapshot: async () => {
            paused = true;
            await mutate();
          },
        });
        assert(
          paused,
          "the mutation must occur after the actual room snapshot",
        );
        assert.equal(saved.op.state, "prepared");
      } finally {
        await clearIntervals();
        await room(0);
      }
    }
  });
  await test("source/body binding, expiry and durable owner abort cannot produce a late committed fence", async () => {
    for (const [name, change, code] of [
      [
        "actor",
        (x) => {
          x.proof.actorId = "another-actor";
        },
        "SOURCE_PROOF_MISMATCH",
      ],
      [
        "school",
        (x) => {
          x.proof.schoolId = "other-school";
        },
        "SOURCE_PROOF_MISMATCH",
      ],
      [
        "request",
        (x) => {
          x.proof.requestDigest = "wrong-request";
        },
        "SOURCE_PROOF_MISMATCH",
      ],
      [
        "action",
        (x) => {
          x.proof.authorityAction = "deploy.edit";
        },
        "SOURCE_PROOF_MISMATCH",
      ],
      [
        "fence",
        (x) => {
          x.proof.fence = 2;
        },
        "SOURCE_PROOF_MISMATCH",
      ],
      [
        "preview",
        (x) => {
          x.principal.impersonating = true;
        },
        "IMPERSONATION_DENIED",
      ],
      [
        "expired",
        (x) => {
          x.principal.validUntil = Date.now() - 1;
        },
        "AUTHORITY_CHANGED",
      ],
      [
        "aborted",
        (x) => {
          x.proof.state = "aborted";
        },
        "SOURCE_ABORTED",
      ],
      [
        "committed-without-fence",
        (x) => {
          x.proof.state = "committed";
        },
        "SOURCE_FENCE_MISSING",
      ],
    ]) {
      const input = fixture("binding-" + name, 1);
      change(input);
      await rejected(input, code);
    }
    const late = fixture("late-local-writer", 1);
    let aborted = false;
    const saved = await rejected(late, "REVISION_CONFLICT", {
      beforeBatch: async (statements) => {
        if (
          !aborted &&
          statements.some((s) =>
            s.sql.includes("INSERT INTO venues_source_fences"),
          )
        ) {
          aborted = true;
          const op = await operationStatus(
            runtime.db,
            school,
            await localId(late.body.sourceOperationId),
          );
          await abortOperation(runtime.db, op, "SYNTHETIC_CANCEL", Date.now());
        }
      },
    });
    assert(aborted);
    assert.equal(saved.op.state, "aborted");
    assert.equal(saved.op.fence, 2);
    await rejected(late, "OPERATION_ABORTED");
    const expired = fixture("expiry-at-commit", 1);
    await rejected(expired, "REVISION_CONFLICT", {
      afterSnapshot: async () => {
        await runtime.db
          .prepare(
            "UPDATE product_operations SET valid_until=? WHERE school_id=? AND operation_id=?",
          )
          .bind(
            Date.now() - 1,
            school,
            await localId(expired.body.sourceOperationId),
          )
          .run();
      },
    });
  });
  await test("concurrent matching requests and lost responses retain one original fence receipt", async () => {
    const input = fixture("concurrent-original", 41);
    const results = await Promise.all([invoke(input), invoke(input)]);
    for (const { result } of results) {
      assert.equal(result.sealed, true);
      assert.equal(result.sourceDigest, input.body.sourceDigest);
    }
    const committed = await durable(input);
    assert.equal(committed.audit, 1);
    assert.equal(committed.scopes.length, 41);
    // The first reply is not used as proof. Read owning D1, then exact replay.
    const replay = await invoke(input);
    assert.equal(replay.result.sourceOperationId, input.body.sourceOperationId);
    assert.deepEqual(await durable(input), committed);
    input.proof.state = "committed";
    assert.equal((await invoke(input)).result.sealed, true);
    assert.deepEqual(await durable(input), committed);
    input.proof.digest = input.body.sourceDigest = "different-source-intent";
    await assert.rejects(
      () => invoke(input),
      (e) => e.code === "SOURCE_FENCE_CONFLICT",
    );
    assert.deepEqual(await durable(input), committed);
  });
  await test("a pre-fence interruption survives restart and retries the original identity within budget", async () => {
    const input = fixture("restart-original", 143);
    const initial = canonical(input);
    const before = await rejected(input, "COMMIT_UNCONFIRMED", {
      beforeBatch: async () => {
        throw Error("SYNTHETIC_PRE_FENCE_INTERRUPTION");
      },
    });
    assert.equal(before.op.state, "prepared");
    const different = structuredClone(input.proof);
    input.proof.projection.occupancies = [occupancy()];
    await rejected(input, "OPERATION_INTENT_CONFLICT");
    Object.assign(input.proof, different);
    assert.equal(canonical(input), initial);
    await runtime.restart();
    const { result, counter } = await invoke(input);
    budget(counter);
    const after = await durable(input);
    assert.equal(result.sealed, true);
    assert.equal(after.op.state, "committed");
    assert.equal(after.op.digest, before.op.digest);
    assert.equal(after.op.fence, before.op.fence);
    assert.equal(after.audit, 1);
    assert.equal(after.scopes.length, 143);
    assert.equal((await invoke(input)).result.sealed, true);
    assert.deepEqual(await durable(input), after);
    console.log("RESTART_BUDGET " + JSON.stringify(brief(counter.state)));
  });
  console.log("FAILURE_BUDGETS " + JSON.stringify(failureBudgets));
  console.log(
    `PASS ${groups} actual-D1 source-fence budget groups; proof adapters synthetic.`,
  );
} finally {
  await runtime.close();
}
