import assert from "node:assert/strict";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";

const f = await fixture();
try {
  const s = await seedScenario(f);
  for (const staffId of s.staff) await f.call(f.admin, "contacts", `/staff/${staffId}/update`, {
    operationId: "snapshot-profile-" + staffId, changes: { role: "Teacher", employmentTags: [], subjectTags: [] },
    fieldRevisions: { role: 0, employmentTags: 0, subjectTags: 0 },
  });
  await f.call(f.admin, "roster", "/upload", { ...s.payload, operationId: "snapshot-baseline" });
  const created = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "snapshot-version", name: "Synthetic workload", year: Number(s.date.slice(0, 4)), from: s.date, to: s.end,
  });
  const versionId = created.versionId, deploy = await f.db("deploy"), roster = await f.db("roster");
  const read = () => f.call(f.admin, "roster", "/operations", { operation: "availability", date: s.date });
  const first = await read();
  assert.equal(first.workloadEvidence.quality, "estimated");
  // Model an old Roster operation which can never settle. Its pin must not
  // become a lock on the authoritative planning document or publication.
  for (const scope of ["planning:" + versionId, "publication"]) {
    await deploy.prepare("INSERT INTO source_pins VALUES(?,?,?,'roster','synthetic-stranded-run','synthetic-digest',1,'0',?,'synthetic-decision','held',?)")
      .bind(schoolId, scope, "synthetic-pin-" + scope, Date.now() + 3600000, Date.now()).run();
  }
  let leaseId = 0;
  async function binding() {
    const lease = await f.call(f.admin, "deploy", "/lease", { operationId: "snapshot-lease-" + ++leaseId, versionId, scope: "meta", clientId: "synthetic-client" });
    return { versionId, scope: "meta", clientId: "synthetic-client", leaseFence: lease.fence };
  }
  const change = { ...await binding(), operation: "metadata", name: "Synthetic changed workload", revision: 0, operationId: "snapshot-save" };
  const saved = await f.call(f.admin, "deploy", "/change", change);
  assert.equal(saved.saved, true, "stranded Roster planning pin cannot prevent Deploy save");
  const current = await read();
  assert.equal(current.workloadEvidence.sourceRevision, 1);
  const row = await roster.prepare("SELECT * FROM roster_workload_snapshots WHERE school_id=? AND service_date=?").bind(schoolId, s.date).first();
  await read();
  assert.deepEqual(await roster.prepare("SELECT * FROM roster_workload_snapshots WHERE school_id=? AND service_date=?").bind(schoolId, s.date).first(), row, "unchanged content has a stable local revision and stored observation");
  const published = await f.call(f.admin, "deploy", "/publish", { ...await binding(), revision: 1, expectedPointerSequence: 0, operationId: "snapshot-publish" });
  assert.equal(published.state, "committed", "stranded Roster publication pin cannot prevent publication");
  const verified = await read();
  assert.equal(verified.workloadEvidence.quality, "verified");
  const weekday = (new Date(s.date).getUTCDay() + 6) % 7;
  const week = new Date(Date.parse(s.date) - weekday * 86400000).toISOString().slice(0, 10);
  await roster.prepare("INSERT INTO roster_weekly(school_id,staff_id,week,publication_id,publication_sequence,calculation_version,quota,captured_at,evidence_json) VALUES(?,?,?,?,1,'synthetic/1',7,?,'{}')")
    .bind(schoolId, s.staff[1], week, published.publicationId, Date.now()).run();
  const historical = await roster.prepare("SELECT * FROM roster_weekly").first();
  await f.call(f.admin, "deploy", "/change", { ...change, ...await binding(), name: "Synthetic saved after publication", revision: 1, operationId: "snapshot-save-again" });
  assert.equal((await read()).workloadEvidence.quality, "estimated", "saved edits refresh the working copy without claiming publication");
  const republished = await f.call(f.admin, "deploy", "/publish", { ...await binding(), revision: 2, expectedPointerSequence: 1, operationId: "snapshot-republish" });
  assert.equal(republished.sequence, 2);
  assert.equal((await read()).workloadEvidence.quality, "verified");
  assert.deepEqual(await f.call(f.admin, "deploy", "/change", change), saved, "lost save response replays original result");
  assert.equal((await deploy.prepare("SELECT COUNT(*) n FROM source_pins WHERE destination='roster' AND state='held'").first()).n, 2, "old receipt evidence is preserved, not forcibly released");
  assert.deepEqual(await roster.prepare("SELECT * FROM roster_weekly").first(), historical, "refreshes and republication cannot rewrite captured historical R");
  await f.call(f.admin, "deploy", "/versions/create", { operationId: "snapshot-unrelated-draft", name: "Synthetic unrelated draft", year: Number(s.date.slice(0, 4)) });
  assert.equal((await read()).workloadEvidence.sourceId, republished.publicationId, "an unrelated draft cannot replace the selected publication");
  await deploy.prepare("INSERT INTO source_pins VALUES(?,'publication','synthetic-layout-pin','layout','synthetic-layout-operation','synthetic',1,'2',?,'synthetic','held',?)")
    .bind(schoolId, Date.now() + 3600000, Date.now()).run();
  const protectedConsumer = await f.request(f.admin, "deploy", "/publish", { method: "POST", body: {
    ...await binding(), revision: 2, expectedPointerSequence: 2, operationId: "snapshot-layout-protected" } });
  assert.equal(protectedConsumer.status, 409);
  assert.equal(protectedConsumer.body.error.code, "SOURCE_CHANGE_PENDING", "Layout still has its publication protection");
  console.log("PASS real Workers/D1: stranded Roster pins cannot block save/publish/republish; current local copy refreshes, unchanged reads are stable, original receipt replays");
} finally { await f.close(); }
