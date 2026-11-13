import assert from "node:assert/strict";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import {
  prepareOperation,
  query,
  one,
  canonical,
} from "../v1/runtime/store.mjs";
import {
  handle,
  sourceBegin,
  sourceComplete,
} from "../v1/services/venues/service.mjs";
const runtime = await createDatabase("venues"),
  school = "school",
  now = Date.now(),
  date = new Date(now + 86400000 + 28800000).toISOString().slice(0, 10),
  start = Date.parse(date + "T09:00:00+08:00"),
  end = start + 1800000;
const principal = {
  schoolId: school,
  actorId: "account",
  staffId: "staff",
  displayName: "Synthetic teacher",
  capabilities: ["admin"],
  decisionId: "decision",
  requestDigest: "synthetic-request-digest",
  validUntil: now + 3600000,
};
const proofs = new Map();
let inspectCount = 0;
const env = {
  DB: runtime.db,
  SCHOOL_ID: school,
  SERVICE_NAME: "venues",
  GSIS_SECRET: "local-test-only",
  CORE: {
    async fetch(r) {
      inspectCount++;
      return Response.json({
        ok: true,
        data: {
          principal,
          descriptor: {
            action: "deploy.publish",
            service: "deploy",
            operationId: (await r.json()).operationId,
          },
        },
      });
    },
  },
  DEPLOY: {
    async fetch(r) {
      const body = await r.json();
      if (new URL(r.url).pathname === "/internal/current-publication")
        return Response.json({ ok: true, data: { revision: 1 } });
      return Response.json({ ok: true, data: proofs.get(body.operationId) });
    },
  },
};
const context = (path, body, who = principal) => ({
  env: { ...env, DB: runtime.db },
  principal: who,
  path,
  method: "POST",
  body,
  now: Date.now(),
  request: new Request("https://gsis.test/api/venues" + path),
  requestId: crypto.randomUUID(),
});
async function command(body, who = principal) {
  body = { ...body, operationId: body.operationId || crypto.randomUUID() };
  const c = context("/command", body, who);
  const op = await prepareOperation(runtime.db, {
    schoolId: who.schoolId,
    actorId: who.actorId,
    operationId: body.operationId,
    action: `venues.${body.operation}`,
    intent: body,
    now: c.now,
    validUntil: who.validUntil,
    authorization: who,
  });
  await syntheticAdmission(runtime.db, op, { decisionId: who.decisionId });
  return handle(c);
}
async function head() {
  await runtime.db
    .prepare("INSERT INTO venues_source_heads VALUES(?,?,?,?,?,?,?)")
    .bind(
      school,
      "deploy",
      "1",
      1,
      Date.now(),
      "digest",
      canonical({
        coverage: {
          from: date,
          to: date,
          venueIds: ["room-a", "room-b", "room-c"],
          periods: [
            { id: "P1", start: 540, end: 570 },
            { id: "P2", start: 570, end: 600 },
          ],
        },
      }),
    )
    .run();
}
try {
  await command({
    operation: "importVenues",
    venues: ["room-a", "room-b", "room-c"].map((id) => ({
      id,
      name: id,
      capacity: 20,
      bookable: true,
      revision: 0,
    })),
  });
  await head();
  const input = {
    operation: "book",
    venueId: "room-a",
    dates: [date],
    periodIds: ["P1"],
    expectedRevision: 0,
    operationId: crypto.randomUUID(),
  };
  const competing = await Promise.allSettled([
    command(input),
    command({ ...input, operationId: crypto.randomUUID() }),
  ]);
  assert.equal(competing.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(competing.filter((x) => x.status === "rejected").length, 1);
  const winner = competing.find((x) => x.status === "fulfilled").value;
  assert.equal(
    (
      await query(
        runtime.db,
        "SELECT * FROM venues_records WHERE kind='occurrences'",
      )
    ).length,
    1,
  );
  assert.equal(
    (await query(runtime.db, "SELECT * FROM product_outbox")).length,
    1,
  );
  const booking = (
      await query(
        runtime.db,
        "SELECT * FROM venues_records WHERE kind='occurrences'",
      )
    )[0],
    opid = (
      await query(
        runtime.db,
        "SELECT operation_id FROM product_operations WHERE action='venues.book' AND state='committed'",
      )
    )[0].operation_id;
  const replay = await command({ ...input, operationId: opid });
  assert.deepEqual(replay, winner);
  const disjoint = await Promise.allSettled([
    command({
      operation: "book",
      venueId: "room-b",
      dates: [date],
      periodIds: ["P2"],
      expectedRevision: 0,
    }),
    command({
      operation: "book",
      venueId: "room-c",
      dates: [date],
      periodIds: ["P2"],
      expectedRevision: 0,
    }),
  ]);
  assert.equal(disjoint.filter((r) => r.status === "fulfilled").length, 2);
  await assert.rejects(
    () =>
      handle(context("/command", input, { ...principal, impersonating: true })),
    (e) => e.code === "IMPERSONATION_DENIED",
  );
  await assert.rejects(
    () =>
      handle(context("/command", input, { ...principal, capabilities: [] })),
    (e) => e.code === "CAPABILITY_DENIED",
  );
  const sourceId = "source-one",
    proof = {
      state: "prepared",
      schoolId: school,
      actorId: principal.actorId,
      operationId: sourceId,
      fence: 1,
      digest: "source-digest",
      requestDigest: principal.requestDigest,
      authorityAction: "deploy.publish",
      sequence: 2,
      projection: {
        occupancies: [{ venueId: "room-b", start, end, sourceId: "lesson-1" }],
        coverage: {
          from: date,
          to: date,
          venueIds: ["room-a", "room-b", "room-c"],
          periods: [
            { id: "P1", start: 540, end: 570 },
            { id: "P2", start: 570, end: 600 },
          ],
        },
      },
    };
  proofs.set(sourceId, proof);
  const sourceBody = {
    schoolId: school,
    sourceDomain: "deploy",
    sourceOperationId: sourceId,
    sourceDigest: proof.digest,
    sourceFence: 1,
    decisionId: "decision",
    scopes: [{ venueId: "room-b", start, end }],
  };
  await sourceBegin(context("/internal/source-begin", sourceBody));
  await assert.rejects(
    () =>
      command({
        operation: "book",
        venueId: "room-b",
        dates: [date],
        periodIds: ["P1"],
        expectedRevision: 0,
      }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    () => sourceComplete(context("/internal/source-complete", sourceBody)),
    (e) => e.code === "SOURCE_UNRESOLVED",
  );
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT state FROM venues_source_fences WHERE source_operation_id=?",
        [sourceId],
      )
    ).state,
    "pending",
  );
  await runtime.restart();
  env.DB = runtime.db;
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT state FROM venues_source_fences WHERE source_operation_id=?",
        [sourceId],
      )
    ).state,
    "pending",
  );
  proofs.set(sourceId, { ...proof, state: "committed" });
  const completed = await sourceComplete(
    context("/internal/source-complete", sourceBody),
  );
  assert.equal(completed.state, "adopted");
  assert.equal(
    (
      await query(
        runtime.db,
        "SELECT * FROM venues_intervals WHERE kind='source'",
      )
    ).length,
    1,
  );
  assert.deepEqual(
    await sourceComplete(context("/internal/source-complete", sourceBody)),
    completed,
  );
  const blockedId = "source-booking-conflict";
  proofs.set(blockedId, {
    ...proof,
    state: "prepared",
    operationId: blockedId,
    sequence: 3,
    projection: {
      ...proof.projection,
      occupancies: [{ venueId: "room-a", start, end, sourceId: "lesson-2" }],
    },
  });
  await assert.rejects(
    () =>
      sourceBegin(
        context("/internal/source-begin", {
          ...sourceBody,
          sourceOperationId: blockedId,
          scopes: [{ venueId: "room-a", start, end }],
        }),
      ),
    (e) => e.status === 409,
  );
  assert.equal(
    await one(
      runtime.db,
      "SELECT * FROM venues_source_fences WHERE source_operation_id=?",
      [blockedId],
    ),
    null,
  );
  const foreign = await handle(
    context(
      "/read",
      { operation: "bootstrap" },
      { ...principal, schoolId: "foreign-school" },
    ),
  );
  assert.equal(foreign.venues.length, 0);
  assert(inspectCount >= 2);
  console.log(
    "PASS Venues actual D1: last-room race, disjoint concurrency, idempotent receipt/outbox, preview/capability denial, publication fence both orders, uncertain outcome retains fence, restart/recovery and foreign-school isolation. Core/source proofs synthetic; integrated authentication separate.",
  );
} finally {
  await runtime.close();
}
