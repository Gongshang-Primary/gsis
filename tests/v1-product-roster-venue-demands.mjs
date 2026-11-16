import assert from "node:assert/strict";
import { join } from "node:path";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { origin } from "./v1-product/suite.mjs";
import { readArtifact } from "../v1/services/roster/repository.mjs";
import { sourceBegin, sourceComplete } from "../v1/services/venues/service.mjs";

const f = await fixture();
let restarted;
try {
  const s = await seedScenario(f);
  const labels = ["Synthetic ISH-1A", "Synthetic ISH-1B"], multi = "Synthetic paired rooms";
  s.model.maxPeriod = s.model.single.maxPeriod = 3;
  s.model.single.perDay = 4;
  s.model.timing.endOfDayMinutes = 720;
  for (const [index, block] of s.model.single.blocks.entries()) {
    block.cells = Array.from({ length: 20 }, (_, cell) => {
      switch (cell % 4) {
        case 0: return ["Synthetic PE", "Synthetic Class " + (index ? "B" : "A"), labels[index], ""];
        case 1: return ["Synthetic PE", "Synthetic Class C", labels[index], "Synthetic Group C"];
        case 2: return ["Synthetic PE", "", labels[index], ""];
        default: return index ? ["", "", "", ""] : ["Synthetic PE", "Synthetic Class D", multi, ""];
      }
    });
  }
  const input = { ...s.payload, operationId: "synthetic-venue-demands",
    venueMapping: { [labels[0]]: "synthetic-room-a", [labels[1]]: "synthetic-room-a",
      [multi]: ["synthetic-room-a", "synthetic-room-b"] } };
  const page = await f.pageFor();
  const result = await page.evaluate(async body => {
    try { return { ok: true, data: await GSISV1.request("roster", "/upload", { method: "POST", body }) }; }
    catch (error) { return { ok: false, code: error.code, status: error.status }; }
  }, input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.receipt.state, "committed");
  const rowsFor = async (runtime, operationId) => (await (await runtime.db("venues"))
    .prepare("SELECT source_id,venue_id,start_at,end_at FROM venues_projection_rows WHERE school_id=? AND source_operation_id=? ORDER BY venue_id,start_at,source_id")
    .bind(schoolId, operationId).all()).results;
  const rows = await rowsFor(f, input.operationId);
  const start = Date.parse(s.date + "T10:00:00+08:00");
  assert.equal(rows.filter(r => r.venue_id === "synthetic-room-a" && r.start_at === start).length, 2,
    "two classes mapped through split labels must survive in the same physical venue and period");
  assert.equal(rows.length, 35, "seven distinct venue demands per school day");
  assert.equal(rows.filter(r => r.start_at === start + 1800000).length, 1, "co-teachers share one identified lesson");
  assert.equal(rows.filter(r => r.start_at === start + 3600000).length, 2, "unknown target cannot prove shared demand");
  assert.deepEqual(rows.filter(r => r.start_at === start + 5400000).map(r => r.venue_id).sort(),
    ["synthetic-room-a", "synthetic-room-b"]);
  assert.equal(new Set(rows.map(r => r.source_id)).size, rows.length);
  assert(rows.every(r => r.source_id.length <= 128));

  // The owner R2 chunk, bound by a digest in D1, retains source evidence that
  // the deliberately narrow Venues SQL projector does not copy into columns.
  const roster = await f.db("roster"), bucket = await f.mf.getR2Bucket("ARTIFACTS", "gsis-roster");
  const chunks = (await roster.prepare("SELECT artifact_key,chunk_digest FROM roster_projection_chunks WHERE school_id=? AND operation_id=? ORDER BY chunk_index")
    .bind(schoolId, input.operationId).all()).results;
  const evidence = (await Promise.all(chunks.map(c => readArtifact(bucket, c.artifact_key, c.chunk_digest)))).flat();
  assert.equal(evidence.length, rows.length);
  assert.deepEqual(evidence.find(r => r.start === start + 1800000).sourceLabels, labels);
  const unknown = evidence.filter(r => r.start === start + 3600000);
  assert(unknown.every(r => r.demandEvidence === "unresolved"));
  assert.deepEqual(unknown.flatMap(r => r.staffIds).sort(), [...s.staff].sort());
  assert(evidence.filter(r => r.period !== 2).every(r => r.demandEvidence === "identified"));
  assert.deepEqual(evidence.filter(r => r.start === start).map(r => r.lesson.classOrTeachingGroup).sort(),
    ["Synthetic Class A", "Synthetic Class B"]);

  const send = (user, body) => f.request(user, "roster", "/upload", { method: "POST", body });
  assert.equal((await send(f.admin, input)).body.data.receipt.operationId, input.operationId);
  assert.deepEqual(await rowsFor(f, input.operationId), rows);
  assert.equal((await send(f.admin, { ...input, name: "Different intent" })).status, 409);
  assert.equal((await send(f.admin, { ...input, operationId: "synthetic-stale-demand" })).status, 409);
  const invalid = { ...input, revision: result.data.revision, operationId: "synthetic-foreign-demand",
    venueMapping: { ...input.venueMapping, [labels[1]]: "foreign-school-room" } };
  assert.equal((await send(f.admin, invalid)).status, 409);
  assert.equal((await send(f.ordinary, invalid)).status, 403);
  assert.equal((await send(null, input)).status, 401);
  assert.deepEqual(await rowsFor(f, input.operationId), rows, "denied imports preserve the committed demand set");

  // Input ordering and a new import operation do not change lesson identities.
  const reordered = { ...input, id: result.data.id, operationId: "synthetic-reordered-demand",
    revision: result.data.revision, model: structuredClone(input.model) };
  reordered.model.single.blocks.reverse();
  const second = await send(f.admin, reordered);
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.deepEqual(await rowsFor(f, reordered.operationId), rows);

  // Supplement the full built import above with the other (non-staged) owner
  // adapter over the same real D1. Only its Core/source replies are synthetic.
  const proof = { state: "prepared", schoolId, actorId: f.admin.id,
    operationId: "synthetic-nonstaged-demand", fence: 1, digest: "synthetic-source-digest",
    requestDigest: "synthetic-request-digest", authorityAction: "calendar.admin", sequence: 1,
    projection: { occupancies: [
      { venueId: "synthetic-room-a", start, end: start + 1800000, sourceId: "synthetic-lesson-a" },
      { venueId: "synthetic-room-a", start, end: start + 1800000, sourceId: "synthetic-lesson-b" },
      { venueId: "synthetic-room-a", start, end: start + 1800000, sourceId: "synthetic-lesson-a" },
    ] } };
  const body = { schoolId, sourceDomain: "calendar", sourceOperationId: proof.operationId,
    sourceDigest: proof.digest, sourceFence: 1, decisionId: "synthetic-decision",
    scopes: [{ venueId: "synthetic-room-a", start, end: start + 1800000 }] };
  const principal = { schoolId, actorId: f.admin.id, requestDigest: proof.requestDigest,
    capabilities: ["admin"], validUntil: Date.now() + 60000 };
  const reply = data => Response.json({ ok: true, data });
  const env = { DB: await f.db("venues"), SCHOOL_ID: schoolId, GSIS_SECRET: "synthetic-only",
    CORE: { async fetch() { return reply({ principal,
      descriptor: { action: "calendar.admin", service: "calendar", operationId: proof.operationId } }); } },
    CALENDAR: { async fetch() { return reply(proof); } } };
  const ctx = () => ({ env, body, now: Date.now() });
  await sourceBegin(ctx());
  proof.state = "committed";
  assert.equal((await sourceComplete(ctx())).state, "adopted");
  const sourceRows = (await env.DB.prepare("SELECT record_id FROM venues_intervals WHERE source_domain='calendar' ORDER BY record_id").all()).results;
  assert.deepEqual(sourceRows.map(r => r.record_id), ["calendar:synthetic-lesson-a", "calendar:synthetic-lesson-b"]);
  assert.equal((await sourceComplete(ctx())).state, "adopted");

  await f.stopWorkers();
  restarted = await startProduct({ persistPath: join(f.path, "state"), output: join(f.path, "restarted"), migrateSchemas: false });
  const response = await restarted.mf.dispatchFetch(origin + "/api/roster/upload", { method: "POST",
    headers: { origin, cookie: "__Host-gsis_session=" + f.admin.token, "x-csrf-token": f.admin.csrf,
      "content-type": "application/json" }, body: JSON.stringify(reordered) });
  const replay = await response.json();
  assert.equal(response.status, 200, JSON.stringify(replay));
  assert.equal(replay.data.receipt.operationId, reordered.operationId);
  assert.equal(replay.data.revision, second.body.data.revision);
  assert.deepEqual(await rowsFor(restarted, reordered.operationId), rows);
  assert.equal((await (await restarted.db("roster")).prepare("SELECT COUNT(*) n FROM roster_baselines").first()).n, 1);
  const recoveredBucket = await restarted.mf.getR2Bucket("ARTIFACTS", "gsis-roster");
  assert.deepEqual((await Promise.all(chunks.map(c => readArtifact(recoveredBucket, c.artifact_key, c.chunk_digest)))).flat(), evidence);
  console.log("PASS built Roster browser / nine Workers / D1-R2: split aliases preserve class demand, co-teacher identity, unresolved evidence, multi-room mapping, receipt/restart recovery and unchanged authorization guards");
} finally { await restarted?.close(); await f.close(); }
