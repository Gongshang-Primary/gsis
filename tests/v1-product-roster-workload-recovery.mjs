import assert from "node:assert/strict";
import { join } from "node:path";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { workloadSnapshot } from "../v1/services/roster/workload-snapshot.mjs";
import { commitOperation, prepareOperation } from "../v1/runtime/store.mjs";
import { migrate } from "./v1-product/helpers.mjs";

const f = await fixture();
let restarted, release;
try {
  const s = await seedScenario(f);
  await f.call(f.admin, "roster", "/upload", { ...s.payload, operationId: "workload-recovery-baseline" });
  const db = await f.db("roster"), core = await f.db("core");
  // Recreate the pre-upgrade local schema while retaining existing owner data.
  // No workload reads have used the new, empty projection table yet.
  const baseline = await db.prepare("SELECT * FROM roster_baselines").first();
  await db.prepare("DROP TABLE roster_workload_snapshots").run();
  const migration = new URL("../v1/migrations/roster/0005_workload_snapshot.sql", import.meta.url).pathname;
  await migrate(db, [migration, migration]);
  assert.deepEqual(await db.prepare("SELECT * FROM roster_baselines").first(), baseline, "additive upgrade retains existing baseline data");
  const version = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "workload-recovery-version", name: "Synthetic recovery plan", year: Number(s.date.slice(0, 4)),
  });
  const body = { operation: "availability", date: s.date };
  await f.call(f.admin, "roster", "/operations", body);
  const evidence = await core.prepare("SELECT decision_id,principal_json FROM core_evidence WHERE json_extract(descriptor_json,'$.service')='roster' ORDER BY created_at DESC LIMIT 1").first();
  const principal = { ...JSON.parse(evidence.principal_json), decisionId: evidence.decision_id };
  const worker = await f.mf.getWorker("gsis-deploy");
  // Delay only the old source response, after the real Deploy Worker has read
  // it. All current identities, source verification and D1 are real local paths.
  let reached;
  const paused = new Promise(resolve => { reached = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  const env = { SCHOOL_ID: schoolId, SERVICE_NAME: "roster", GSIS_SECRET: f.secret, DB: db,
    DEPLOY: { async fetch(req) {
      const response = await worker.fetch(req.url, { method: req.method, headers: Object.fromEntries(req.headers), body: await req.text() });
      const text = await response.text(); reached(); await barrier;
      return new Response(text, { status: response.status, headers: response.headers });
    } },
  };
  const old = workloadSnapshot({ env, principal, now: Date.now() }, s.date);
  // Attach rejection handling immediately so the deliberate race is not an
  // unhandled promise rejection while the other Worker request completes.
  const oldOutcome = old.then(value => ({ value }), error => ({ error }));
  await paused;
  const before = await db.prepare("SELECT * FROM roster_workload_snapshots").first();
  const lease = await f.call(f.admin, "deploy", "/lease", { versionId: version.versionId, operationId: "recovery-lease", scope: "meta", clientId: "synthetic-client" });
  await f.call(f.admin, "deploy", "/change", { versionId: version.versionId, operation: "metadata", name: "Synthetic newer plan",
    revision: 0, operationId: "recovery-save", scope: "meta", clientId: "synthetic-client", leaseFence: lease.fence });
  await f.call(f.admin, "roster", "/operations", body);
  release();
  assert.equal((await oldOutcome).error?.code, "ROSTER_WORKLOAD_CHANGED", "late old response cannot restore the previous copy");
  const current = await db.prepare("SELECT * FROM roster_workload_snapshots").first();
  assert.equal(current.revision, before.revision + 1);
  assert.equal(JSON.parse(current.payload_json).workloadEvidence.sourceRevision, 1);
  const op = await prepareOperation(db, { schoolId, actorId: "synthetic-race", operationId: "synthetic-stale-commit",
    action: "internal.roster.snapshot-test", intent: { snapshot: before.digest }, now: Date.now(), validUntil: Date.now() + 60000 });
  await assert.rejects(commitOperation(db, op, { now: Date.now(), admission: { kind: "system", reason: "Synthetic local storage guard test" },
    guards: [{ sql: "SELECT digest=? AS ok FROM roster_workload_snapshots WHERE school_id=? AND service_date=?", args: [before.digest, schoolId, s.date] }],
    writes: [{ sql: "UPDATE roster_workload_snapshots SET revision=999 WHERE school_id=?", args: [schoolId] }], result: { saved: true } }), e => e.code === "REVISION_CONFLICT");
  assert.equal((await db.prepare("SELECT revision FROM roster_workload_snapshots").first()).revision, current.revision);
  await f.stopWorkers();
  restarted = await startProduct({ persistPath: join(f.path, "state"), output: join(f.path, "restarted"), migrateSchemas: false });
  const response = await restarted.mf.dispatchFetch(origin + "/api/roster/operations", { method: "POST",
    headers: { origin, cookie: "__Host-gsis_session=" + f.admin.token, "x-csrf-token": f.admin.csrf, "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.data.workloadEvidence.sourceRevision, 1);
  assert.deepEqual(await (await restarted.db("roster")).prepare("SELECT * FROM roster_workload_snapshots").first(), current);
  console.log("PASS real source/Workers/D1 delayed response ordering; owner transaction stale-copy rollback; process restart refresh retains unchanged copy identity");
} finally { release?.(); await restarted?.close(); await f.close(); }
