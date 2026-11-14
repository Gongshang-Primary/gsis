import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { canonical, digest, one, query } from "../v1/runtime/store.mjs";
import {
  sourceBegin,
  sourceComplete,
  handle,
} from "../v1/services/venues/service.mjs";
const runtime = await createDatabase("venues"),
  school = "school",
  now = Date.now(),
  from = "2027-01-04",
  to = "2027-03-04";
const principal = {
  schoolId: school,
  actorId: "account",
  staffId: "staff",
  capabilities: ["admin"],
  decisionId: "decision",
  requestDigest: "request-digest",
  validUntil: now + 3600000,
};
const periods = Array.from({ length: 17 }, (_, i) => ({
    id: String(i),
    start: 420 + i * 30,
    end: 450 + i * 30,
  })),
  venueIds = Array.from({ length: 40 }, (_, i) => `room-${i}`),
  coverage = { from, to, venueIds, periods };
const rows = [];
for (
  let t = Date.parse(from + "T00:00:00+08:00");
  t <= Date.parse(to + "T00:00:00+08:00");
  t += 86400000
)
  for (const venueId of venueIds)
    for (const p of periods)
      rows.push({
        venueId,
        start: t + p.start * 60000,
        end: t + p.end * 60000,
        sourceId: `${t}:${venueId}:${p.id}`,
      });
const parts = [];
for (let i = 0; i < rows.length; i += 256) parts.push(rows.slice(i, i + 256));
const chunks = await Promise.all(
    parts.map(async (part, index) => ({
      index,
      digest: await digest(part),
      count: part.length,
    })),
  ),
  manifest = {
    schemaVersion: 1,
    sourceKind: "baseline",
    coverage,
    chunks,
    totalCount: rows.length,
  },
  manifestDigest = await digest(manifest);
let proof = {
  schoolId: school,
  actorId: principal.actorId,
  operationId: "baseline-op",
  digest: "source-digest",
  requestDigest: principal.requestDigest,
  authorityAction: "roster.admin",
  fence: 1,
  state: "prepared",
  sequence: 1,
  projection: {
    sourceKind: "baseline",
    revision: 1,
    coverage,
    staged: {
      schemaVersion: 1,
      manifestDigest,
      chunks,
      totalCount: rows.length,
    },
  },
};
const body = {
  schoolId: school,
  sourceDomain: "roster",
  sourceOperationId: "baseline-op",
  sourceDigest: "source-digest",
  sourceFence: 1,
  decisionId: "decision",
};
const env = {
  SCHOOL_ID: school,
  SERVICE_NAME: "venues",
  GSIS_SECRET: "synthetic",
  CORE: {
    async fetch(r) {
      return Response.json({
        ok: true,
        data: {
          principal,
          descriptor: {
            action: "roster.admin",
            service: "roster",
            operationId: (await r.json()).operationId,
          },
        },
      });
    },
  },
  ROSTER: {
    async fetch(r) {
      const x = await r.json(),
        path = new URL(r.url).pathname;
      if (path === "/internal/source-projection-chunk")
        return Response.json({
          ok: true,
          data: {
            schoolId: school,
            operationId: proof.operationId,
            digest: proof.digest,
            fence: proof.fence,
            index: x.index,
            chunkDigest: chunks[x.index].digest,
            rows: parts[x.index],
          },
        });
      if (path === "/internal/source-current")
        return Response.json({
          ok: true,
          data: { current: true, revision: 1 },
        });
      return Response.json({ ok: true, data: proof });
    },
  },
};
const ctx = () => ({
  env: { ...env, DB: runtime.db },
  body,
  principal: null,
  now: Date.now(),
  path: "/internal/source-begin",
});
try {
  await runtime.db.batch(
    venueIds.map((id) =>
      runtime.db
        .prepare("INSERT INTO venues_records VALUES(?,?,?,?,?,?,?,?)")
        .bind(
          school,
          "venues",
          id,
          1,
          null,
          null,
          null,
          canonical({
            id,
            name: id,
            bookable: true,
            capacity: 40,
            bufferMinutes: 0,
            overlapGroup: "",
            revision: 1,
          }),
        ),
    ),
  );
  let result = await sourceBegin(ctx());
  assert.equal(result.sealed, false);
  assert.equal(result.validatedChunks, 4);
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT COUNT(*) AS n FROM venues_occupancy WHERE kind='source'",
      )
    ).n,
    0,
    "unsealed rows stay invisible",
  );
  proof.state = "committed";
  await assert.rejects(
    sourceComplete(ctx()),
    (e) => e.code === "SOURCE_NOT_SEALED",
  );
  proof.state = "prepared";
  await runtime.restart();
  while (!result.sealed) result = await sourceBegin(ctx());
  assert.equal(result.validatedChunks, chunks.length);
  assert.ok(rows.length > 40000);
  proof.state = "committed";
  const receipt = await sourceComplete(ctx());
  assert.equal(receipt.state, "adopted");
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT COUNT(*) AS n FROM venues_occupancy WHERE kind='source'",
      )
    ).n,
    rows.length,
  );
  assert.deepEqual(await sourceComplete(ctx()), receipt);
  const data = await handle({
    env: { ...env, DB: runtime.db },
    principal,
    now: Date.now(),
    path: "/read",
    method: "POST",
    request: new Request("https://test/api"),
    body: { operation: "bootstrap", from, to: from },
  });
  assert.equal(data.source.status, "ready");
  assert.equal(data.manifest.from, from);
  assert.equal(data.manifest.to, from);
  assert.equal(data.periods.length, 17);
  assert.equal(
    (
      await query(
        runtime.db,
        "SELECT * FROM venues_source_fences WHERE state='pending'",
      )
    ).length,
    0,
  );
  await runtime.db
    .prepare(
      "INSERT INTO venues_intervals VALUES(?,?,'booking',?,?,?, ?,0,'confirmed',NULL,NULL)",
    )
    .bind(
      school,
      "existing-reservation",
      rows[0].venueId,
      "",
      rows[0].start,
      rows[0].end,
    )
    .run();
  body.sourceOperationId = "conflicting-source";
  proof = {
    ...proof,
    state: "prepared",
    operationId: body.sourceOperationId,
    sequence: 2,
  };
  await assert.rejects(
    sourceBegin(ctx()),
    (e) => e.code === "REVISION_CONFLICT",
  );
  const rejected = await one(
    runtime.db,
    "SELECT validated_count,sealed FROM venues_projection_manifests WHERE source_operation_id=?",
    [body.sourceOperationId],
  );
  assert.deepEqual(rejected, { validated_count: 0, sealed: 0 });
  proof = { ...proof, state: "aborted", fence: 2 };
  assert.equal((await sourceComplete(ctx())).state, "aborted");
  console.log(
    `PASS staged Venues: ${rows.length} intervals, ${chunks.length} durable chunks; restart resume, unsealed rejection, atomic pointer publication, bounded day read, existing booking rejects staging without partial adoption; ${Date.now() - now}ms`,
  );
} finally {
  await runtime.close();
}
