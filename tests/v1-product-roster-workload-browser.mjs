import assert from "node:assert/strict";
import { fixture, seedScenario, schoolId, browserOperation, ok } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";

const f = await fixture();
try {
  const s = await seedScenario(f);
  for (const staffId of s.staff) await f.call(f.admin, "contacts", `/staff/${staffId}/update`, {
    operationId: "workload-browser-profile-" + staffId, changes: { role: "Teacher", employmentTags: [], subjectTags: [] },
    fieldRevisions: { role: 0, employmentTags: 0, subjectTags: 0 },
  });
  await f.call(f.admin, "roster", "/upload", { ...s.payload, operationId: "workload-browser-baseline" });
  const version = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "workload-browser-version", name: "Synthetic browser plan", year: Number(s.date.slice(0, 4)),
  });
  const db = await f.db("deploy");
  await db.prepare("INSERT INTO source_pins VALUES(?,?,'browser-stuck-pin','roster','browser-stuck-run','synthetic',1,'0',?,'synthetic','held',?)")
    .bind(schoolId, "planning:" + version.versionId, Date.now() + 3600000, Date.now()).run();
  const page = await f.pageFor();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  const initial = ok(await browserOperation(page, { operation: "availability", date: s.date }));
  assert.equal(initial.workloadEvidence.sourceRevision, 0);
  await page.goto(origin + "/deploy/", { waitUntil: "domcontentloaded" });
  await page.locator(`#version option[value="${version.versionId}"]`).waitFor({ state: "attached" });
  await page.locator("#version").selectOption(version.versionId);
  await page.locator("#nav").getByRole("button", { name: "Versions", exact: true }).click();
  const row = page.locator(`[data-version-row="${version.versionId}"]`);
  await row.locator("[data-note-input]").fill("Synthetic note saved while Roster holds a temporary workload copy.");
  await row.locator("[data-note-save]").click();
  await page.waitForFunction(id => [...document.querySelectorAll("[data-version-row]")].find(r => r.dataset.versionRow === id)?.textContent.includes("confirmed"), version.versionId);
  const stored = await db.prepare("SELECT revision,metadata FROM deploy_versions WHERE school_id=? AND id=?").bind(schoolId, version.versionId).first();
  assert.equal(stored.revision, 1);
  assert.equal(JSON.parse(stored.metadata).notes, "Synthetic note saved while Roster holds a temporary workload copy.");
  const rosterPage = await f.pageFor();
  const latest = ok(await browserOperation(rosterPage, { operation: "availability", date: s.date }));
  assert.equal(latest.workloadEvidence.sourceRevision, 1);
  assert.equal(latest.workloadEvidence.quality, "estimated");
  const lease = await f.call(f.admin, "deploy", "/lease", { operationId: "workload-browser-publish-lease",
    versionId: version.versionId, scope: "meta", clientId: "synthetic-browser-publish" });
  const published = await f.call(f.admin, "deploy", "/publish", { operationId: "workload-browser-publish",
    versionId: version.versionId, scope: "meta", clientId: "synthetic-browser-publish", leaseFence: lease.fence,
    revision: 1, expectedPointerSequence: 0 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(`#version option[value="${version.versionId}"]`).waitFor({ state: "attached" });
  await page.locator("#version").selectOption(version.versionId);
  await page.locator("#nav").getByRole("button", { name: "Versions", exact: true }).click();
  await row.locator("[data-note-input]").fill("Synthetic unpublished edit after publication.");
  await row.locator("[data-note-save]").click();
  await page.waitForFunction(id => [...document.querySelectorAll("[data-version-row]")].find(r => r.dataset.versionRow === id)?.textContent.includes("confirmed"), version.versionId);
  assert.equal((await db.prepare("SELECT revision FROM deploy_versions WHERE school_id=? AND id=?").bind(schoolId, version.versionId).first()).revision, 2);
  const retained = ok(await browserOperation(rosterPage, { operation: "availability", date: s.date }));
  assert.equal(retained.workloadEvidence.quality, "verified");
  assert.equal(retained.workloadEvidence.sourceId, published.publicationId);
  await rosterPage.getByRole("button", { name: /^Assign Relief/ }).click();
  await rosterPage.locator("[data-ops-date]").fill(s.date);
  await rosterPage.locator("[data-ops-date]").dispatchEvent("change");
  await rosterPage.locator(".v1-capacity").waitFor();
  assert.equal(await rosterPage.locator("[data-roster-workload]").count(), 0, "published workload has no estimated banner after draft save");
  assert.doesNotMatch(await rosterPage.locator(".v1-capacity").innerText(), /Estimated workload/i);
  assert(f.requests.some(r => r.url.endsWith("/api/deploy/change") && r.status === 200));
  assert.deepEqual(errors, []);
  console.log("PASS built browser native Deploy saves despite stranded Roster pin; estimates before publication, verified published workload and no estimated label after a draft save");
} finally { await f.close(); }
