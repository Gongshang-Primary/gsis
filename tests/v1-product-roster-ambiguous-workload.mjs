import assert from "node:assert/strict";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";

const f = await fixture();
try {
  const s = await seedScenario(f);
  await f.call(f.admin, "roster", "/upload", { ...s.payload, operationId: "synthetic-ambiguous-baseline" });
  const versions = [];
  for (const name of ["A", "B"]) versions.push(await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-ambiguous-" + name, name: "Synthetic planning " + name,
    year: Number(s.date.slice(0, 4)), from: s.date, to: s.end,
  }));
  const availability = () => f.call(f.admin, "roster", "/operations", { operation: "availability", date: s.date });
  function ambiguous(value) {
    assert.equal(value.workloadEvidence.sourceKind, "unavailable");
    assert.equal(value.workloadEvidence.sourceId, null, "never choose the newest matching version");
    assert.match(value.workloadEvidence.reason, /multiple saved Deploy planning versions/i);
    assert.match(value.workloadEvidence.reason, /Unknown R is not zero/);
  }
  ambiguous(await availability());
  const page = await f.pageFor();
  await page.getByRole("button", { name: /^Assign Relief/ }).click();
  await page.locator("[data-ops-date]").fill(s.date);
  await page.locator("[data-ops-date]").dispatchEvent("change");
  await page.locator("[data-roster-workload]").getByText(/multiple saved Deploy planning versions/i).waitFor();
  const deploy = await f.db("deploy"), roster = await f.db("roster");
  // Seed explicit storage variants, then read through the actual built Workers.
  await deploy.prepare("UPDATE deploy_versions SET metadata='{}' WHERE school_id=?").bind(schoolId).run();
  ambiguous(await availability());
  const row = await roster.prepare("SELECT payload_json FROM roster_workload_snapshots WHERE school_id=? AND service_date=?")
    .bind(schoolId, s.date).first();
  assert.deepEqual(JSON.parse(row.payload_json).rows, [], "ambiguous content must not enter Roster's copy");
  const nextYear = Number(s.date.slice(0, 4)) + 1;
  await deploy.prepare("UPDATE deploy_versions SET metadata=? WHERE school_id=? AND id=?")
    .bind(JSON.stringify({ from: nextYear + "-01-01", to: nextYear + "-12-31" }), schoolId, versions[1].versionId).run();
  assert.equal((await availability()).workloadEvidence.sourceId, versions[0].versionId,
    "one matching version resumes ordinary estimated workload");
  await deploy.prepare("INSERT INTO deploy_versions(school_id,id,name,revision,metadata,created_at) VALUES('synthetic-other-school','other','Other',1,'{}',?)")
    .bind(Date.now()).run();
  await deploy.prepare("UPDATE deploy_versions SET metadata='{}',deleted=1 WHERE school_id=? AND id=?")
    .bind(schoolId, versions[1].versionId).run();
  assert.equal((await availability()).workloadEvidence.sourceId, versions[0].versionId,
    "foreign-school and deleted rows do not manufacture an ambiguity");
  await deploy.prepare("UPDATE deploy_versions SET deleted=1 WHERE school_id=?").bind(schoolId).run();
  const missing = await availability();
  assert.equal(missing.workloadEvidence.sourceKind, "unavailable");
  assert.match(missing.workloadEvidence.reason, /No saved Deploy planning version/);
  assert.equal((await roster.prepare("SELECT COUNT(*) n FROM roster_weekly").first()).n, 0);
  assert.equal((await roster.prepare("SELECT COUNT(*) n FROM roster_publications").first()).n, 0);
  console.log("PASS C-1 built browser/Workers/D1: overlapping and blank ranges unavailable; one match resumes; school/deletion isolation; no invented verified R/publication");
} finally { await f.close(); }
