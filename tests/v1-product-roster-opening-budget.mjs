import assert from "node:assert/strict";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import { handle } from "../v1/services/roster/service.mjs";
import { canonical, prepareOperation, query } from "../v1/runtime/store.mjs";
for (const size of [200, 2000]) {
  const h = await createDatabase("roster"),
    schoolId = "opening-budget",
    now = Date.now(),
    today = new Date(now + 28800000).toISOString().slice(0, 10),
    year = today.slice(0, 4);
  const people = Array.from({ length: size }, (_, i) => ({
    staffId: "staff-" + i,
    id: "staff-" + i,
    name: "Teacher " + i,
    active: true,
    eo: true,
    role: "Teacher",
    groups: [],
    employment: "Full-time",
  }));
  let statements = 0,
    batches = [],
    inject = false;
  const db = {
    prepare(sql) {
      statements++;
      return h.db.prepare(sql);
    },
    async batch(items) {
      batches.push(items.length);
      if (inject && items.length > 5) {
        inject = false;
        await h.db
          .prepare(
            "UPDATE roster_openings SET revision=revision+1 WHERE school_id=? AND staff_id='staff-0'",
          )
          .bind(schoolId)
          .run();
      }
      return h.db.batch(items);
    },
  };
  const response = (data) => Response.json({ ok: true, data });
  const env = {
    DB: db,
    get ARTIFACTS() {
      return h.bucket;
    },
    SERVICE_NAME: "roster",
    SCHOOL_ID: schoolId,
    GSIS_SECRET: "synthetic-test-only",
    CONTACTS: {
      fetch: async () =>
        response({
          schoolId,
          revision: "contacts-1",
          asOf: now,
          people,
          dependencies: [],
          smcIds: [],
        }),
    },
    CALENDAR: {
      fetch: async (request) => {
        const b = await request.json();
        return response({
          rows: [
            {
              date: b.from,
              available: true,
              schoolDay: true,
              parity: "single",
              revision: "cal-1",
            },
          ],
          revision: "cal-1",
          asOf: now,
        });
      },
    },
    DEPLOY: {
      fetch: async () =>
        response({
          schoolId,
          publicationId: "pub",
          publicationSequence: 1,
          calculationVersion: "wi/1",
          rows: people.map((p) => ({
            staffId: p.id,
            quality: "verified",
            budget: 84,
            weightedWi: 30,
            factor: 5 / 7,
            periodCap: null,
          })),
          dependencies: [],
        }),
    },
    VENUES: { fetch: async () => response({ venues: [] }) },
    CORE: { fetch: async () => response({ state: "resolved" }) },
  };
  const principal = {
    schoolId,
    actorId: "admin",
    staffId: "staff-0",
    email: "admin@example.invalid",
    sessionId: "test-session",
    decisionId: "test-decision",
    validUntil: now + 600000,
    capabilities: [
      "admin",
      "roster.admin",
      "roster.own",
      "roster.read",
      "roster.write",
    ],
    requestDigest: "a".repeat(64),
    action: "roster.own",
  };
  const call = (body) =>
    handle({
      env,
      principal,
      now,
      clock: () => now,
      path: "/operations",
      body,
      method: "POST",
      request: new Request("https://synthetic.invalid/operations"),
    });
  // Synthetic admission isolates the owner mutation budget. This does not prove
  // full cross-owner admission capacity; the real Contacts directory is capped at512.
  const admit = async (body) => {
    const op = await prepareOperation(h.db, {
      schoolId,
      actorId: principal.actorId,
      operationId: body.operationId,
      action: "roster.saveOpeningBalances",
      intent: body,
      now,
      validUntil: principal.validUntil,
      authorization: principal,
    });
    await syntheticAdmission(h.db, op);
  };
  try {
    for (const [key, value] of Object.entries({
      effectiveDate: year + "-01-01",
      fairnessMode: "opening-balances",
    }))
      await h.db
        .prepare(
          "INSERT INTO roster_records(school_id,collection,record_id,revision,payload_json) VALUES(?,?,?,1,?)",
        )
        .bind(
          schoolId,
          "freshStart",
          key,
          canonical({ kind: "map", data: value }),
        )
        .run();
    const view = await call({ operation: "openingBalances" });
    const command = {
      operation: "saveOpeningBalances",
      operationId: "opening-" + size,
      requestId: "opening-" + size,
      revision: view.revision,
      rows: view.rows.map((r) => ({
        staffId: r.staffId,
        version: r.version,
        cumulativeQuota: 20,
        cumulativeDone: 4,
        asOfDate: r.asOfDate,
      })),
      reason:
        size === 2000
          ? "Reviewed " + "R".repeat(990)
          : "Reviewed complete staff set",
      confirmInitial: true,
    };
    assert(
      new TextEncoder().encode(JSON.stringify(command)).length < 1048576,
      "maximum native request remains within HTTP body limit",
    );
    await admit(command);
    statements = 0;
    batches = [];
    const saved = await call(command),
      count = statements;
    assert.equal(saved.rows.length, size);
    assert.equal(saved.confirmed, true);
    assert(
      count <= 46,
      "local mutation path with synthetic admission stays below its budget: " +
        count,
    );
    assert.equal(
      batches.filter((n) => n > 5).length,
      1,
      "one atomic owner commit",
    );
    const persisted = await query(
      h.db,
      "SELECT * FROM roster_openings WHERE school_id=?",
      [schoolId],
    );
    assert.equal(persisted.length, size);
    assert(
      persisted.every(
        (r) => r.revision === 1 && r.operation_id === command.operationId,
      ),
    );
    const audit = await query(
      h.db,
      "SELECT record_id,payload_json FROM roster_records WHERE school_id=? AND collection='audit'",
      [schoolId],
    );
    assert.equal(
      audit.length,
      size + 1,
      "per-staff audit plus confirmation preserved",
    );
    assert(
      audit.every(
        (r) => JSON.parse(r.payload_json).data.reason === command.reason,
      ),
      "full audit reasons retained",
    );
    await h.restart();
    const retry = await call(command);
    assert.equal(retry.requestId, saved.requestId);
    assert.deepEqual(
      retry.receipt,
      saved.receipt,
      "restart retry returns original operation receipt",
    );
    const current = await call({ operation: "openingBalances" }),
      bad = {
        ...command,
        operationId: "bad-" + size,
        requestId: "bad-" + size,
        revision: current.revision,
        confirmInitial: false,
        rows: current.rows.map((r) => ({
          staffId: r.staffId,
          version: r.version,
          cumulativeQuota: 21,
          cumulativeDone: 4,
          asOfDate: r.asOfDate,
        })),
      };
    bad.rows.at(-1).version = 0;
    await admit(bad);
    await assert.rejects(call(bad), (e) => e.status === 409);
    assert(
      (
        await query(
          h.db,
          "SELECT revision FROM roster_openings WHERE school_id=?",
          [schoolId],
        )
      ).every((r) => r.revision === 1),
    );
    if (size === 200) {
      const concurrent = {
        ...bad,
        operationId: "concurrent",
        requestId: "concurrent",
        rows: current.rows.map((r) => ({
          staffId: r.staffId,
          version: r.version,
          cumulativeQuota: 21,
          cumulativeDone: 4,
          asOfDate: r.asOfDate,
        })),
      };
      await admit(concurrent);
      inject = true;
      await assert.rejects(call(concurrent), (e) => e.status === 409);
      assert.equal(inject, false, "race reached actual commit batch");
      assert.equal(
        (
          await query(
            h.db,
            "SELECT revision FROM roster_openings WHERE school_id=? AND staff_id<>'staff-0'",
            [schoolId],
          )
        ).filter((r) => r.revision !== 1).length,
        0,
        "CAS loser cannot update other staff",
      );
      assert.equal(
        (
          await query(
            h.db,
            "SELECT record_id FROM roster_records WHERE school_id=? AND collection='audit'",
            [schoolId],
          )
        ).length,
        size + 1,
        "CAS loser adds no audit records",
      );
    }
    console.log(
      "PASS " +
        size +
        "-staff opening confirmation: " +
        count +
        " owner SQL statements, atomic full set/audit, restart receipt, stale-row rollback",
    );
  } finally {
    await h.close();
  }
}
