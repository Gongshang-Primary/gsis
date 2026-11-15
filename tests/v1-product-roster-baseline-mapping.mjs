import assert from "node:assert/strict";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
const f = await fixture();
try {
  const label = "Synthetic Room A / Synthetic Room B", s = await seedScenario(f, { roomLabel: label });
  const input = { ...s.payload, operationId: "synthetic-multiroom",
    venueMapping: { [label]: ["synthetic-room-a", "synthetic-room-b"] } };
  const response = await f.request(f.admin, "roster", "/upload", { method: "POST", body: input });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const result = response.body.data;
  assert.equal(result.receipt.state, "committed");
  assert.equal(result.savedId, result.id);
  assert(result.entries.some(e => e.id === result.id));
  const row = await (await f.db("roster")).prepare("SELECT venue_mapping_json FROM roster_baselines WHERE school_id=? AND baseline_id=?")
    .bind(schoolId, result.id).first();
  assert.deepEqual(JSON.parse(row.venue_mapping_json)[label], ["synthetic-room-a", "synthetic-room-b"]);
  const intervals = await (await f.db("venues")).prepare("SELECT DISTINCT venue_id FROM venues_fence_scopes WHERE school_id=? AND source_operation_id=? ORDER BY venue_id")
    .bind(schoolId, input.operationId).all();
  assert.deepEqual(intervals.results.map(r => r.venue_id), ["synthetic-room-a", "synthetic-room-b"]);
  assert.equal((await f.request(f.admin, "roster", "/upload", { method: "POST", body: input })).body.data.revision, result.revision);
  const invalid = { ...input, operationId: "synthetic-foreign-room", revision: result.revision,
    venueMapping: { [label]: ["foreign-school-room"] } };
  assert.equal((await f.request(f.admin, "roster", "/upload", { method: "POST", body: invalid })).status, 409);
  assert.equal((await f.request(f.ordinary, "roster", "/upload", { method: "POST", body: invalid })).status, 403);
  assert.equal((await f.request(f.admin, "roster", "/upload", { method: "POST", body: { ...input,
    operationId: "synthetic-stale-mapping" } })).status, 409);
  console.log("PASS real Workers/D1 multi-room baseline, durable mapping/occupancy, receipt replay and security/revision guards");
} finally { await f.close(); }
