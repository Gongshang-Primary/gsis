import assert from "node:assert/strict";
import { join } from "node:path";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { origin } from "./v1-product/suite.mjs";
const f = await fixture();
let restarted;
try {
  const s = await seedScenario(f);
  await f.call(f.admin, "roster", "/upload", { ...s.payload, operationId: "synthetic-estimated-baseline" });
  const absentSource = await f.call(f.admin, "roster", "/operations", { operation: "availability", date: s.date });
  assert.equal(absentSource.workloadEvidence.sourceKind, "unavailable");
  const version = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-estimated-version", name: "Synthetic planning", year: Number(s.date.slice(0, 4)),
    from: s.date, to: s.end,
  });
  const absence = await f.call(f.admin, "roster", "/operations", { operation: "saveAbsence", date: s.date,
    revision: 0, operationId: "synthetic-estimated-absence", staffId: s.staff[0], typeId: "mc", periods: [0] });
  const available = await f.call(f.admin, "roster", "/operations", { operation: "availability", date: s.date, complete: true });
  assert.equal(available.workloadEvidence.quality, "estimated");
  assert.equal(available.workloadEvidence.sourceId, version.versionId);
  assert(available.periods.find(p => p.period === 0).available.length > 0, "saved estimates provide actual available capacity");
  const view = await f.call(f.admin, "roster", "/operations", { operation: "allocation", date: s.date });
  assert.equal(view.health.verified, false); assert.equal(view.health.usable, true);
  assert.equal(view.automaticPublicationAllowed, false);
  assert.equal(view.exportContext.workloadEvidence.quality, "estimated");
  const candidates = await f.call(f.admin, "roster", "/operations", { operation: "candidates", date: s.date,
    demandIds: [view.demands[0].id] });
  assert.equal(candidates.workloadEvidence.quality, "estimated");
  assert(JSON.stringify(candidates).includes(s.staff[1]));
  const input = { operation: "autoAllocate", date: s.date, revision: absence.revision,
    operationId: "synthetic-estimated-run", mode: "fill-only" };
  const run = await f.call(f.admin, "roster", "/operations", input);
  assert.equal(run.assigned, 1); assert.equal(run.automaticPublicationAllowed, false);
  assert.equal(run.workloadEvidence.quality, "estimated");
  const db = await f.db("roster"), count = async table => (await db.prepare("SELECT COUNT(*) n FROM " + table).first()).n;
  assert.equal(await count("roster_weekly"), 0, "estimated quotas never enter verified weekly captures");
  assert.equal(await count("roster_publications"), 0, "automatic allocation remains an unpublished draft");
  const rows = (await db.prepare("SELECT payload_json FROM roster_records WHERE collection='assignments'").all()).results;
  assert.equal(rows.length, 1);
  const saved = JSON.parse(rows[0].payload_json).data;
  assert.equal(saved.status, "draft"); assert.equal(saved.workloadEvidence.quality, "estimated");
  const exportData = await f.call(f.admin, "roster", "/operations", { operation: "exportDaily", date: s.date, fullTeachers: true });
  assert.equal(exportData.workloadEvidence.quality, "estimated");
  const send = (user, body) => f.request(user, "roster", "/operations", { method: "POST", body });
  const teacher = await f.seedAccount("synthetic-estimated-reader", { staffId: s.staff[1], capabilities: [] });
  const denied = await send(teacher, { ...input, operationId: "synthetic-denied-run" });
  assert.equal(denied.status, 403, JSON.stringify(denied.body));
  assert.equal((await send(f.admin, { ...input, mode: "auto" })).status, 409, "same ID cannot change intent");
  assert.equal((await send(f.admin, { ...input, operationId: "synthetic-stale-run" })).status, 409);
  const blocked = await send(f.admin, { operation: "publish", automatic: true, date: s.date,
    revision: run.revision, operationId: "synthetic-auto-publish" });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(blocked.body.error.code, "WORKLOAD_ESTIMATED_AUTOPUBLISH_BLOCKED");
  assert.equal(await count("roster_publications"), 0);
  const deploy = await f.db("deploy");
  const pins = (await deploy.prepare("SELECT scope,revision,state FROM source_pins WHERE school_id=? AND operation_id=?")
    .bind(schoolId, input.operationId).all()).results;
  assert(pins.some(p => p.scope === "planning:" + version.versionId && p.revision === "0" && p.state === "released"));
  assert(pins.some(p => p.scope === "publication" && p.revision === "absent" && p.state === "released"));
  await deploy.prepare("INSERT INTO deploy_pointer VALUES(?,1,'synthetic-missing-publication','1')").bind(schoolId).run();
  const corrupt = await send(f.admin, { operation: "availability", date: s.date, complete: true });
  assert.equal(corrupt.status, 503, "broken publication evidence cannot silently fall back to estimates");
  await deploy.prepare("DELETE FROM deploy_pointer WHERE school_id=?").bind(schoolId).run();
  // Local Worker/process restart over the same synthetic persistent D1/R2.
  await f.stopWorkers();
  restarted = await startProduct({ persistPath: join(f.path, "state"), output: join(f.path, "restarted"), migrateSchemas: false });
  const response = await restarted.mf.dispatchFetch(origin + "/api/roster/operations", { method: "POST",
    headers: { origin, cookie: "__Host-gsis_session=" + f.admin.token, "x-csrf-token": f.admin.csrf,
      "content-type": "application/json" }, body: JSON.stringify(input) });
  const replay = await response.json();
  assert.equal(response.status, 200, JSON.stringify(replay));
  assert.equal(replay.data.receipt.operationId, input.operationId);
  assert.equal(replay.data.revision, run.revision);
  assert.equal((await (await restarted.db("roster")).prepare("SELECT COUNT(*) n FROM roster_runs").first()).n, 1);
  console.log("PASS real nine-Worker/D1 estimated availability, candidates and allocation; authority/revision/idempotency guards, no automatic publication, no verified R capture, durable restart replay");
} finally { await restarted?.close(); await f.close(); }
