import assert from "node:assert/strict";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement, operationStatus } from "../v1/runtime/store.mjs";

// Synthetic immutable plan fixtures; all publication, permission, ordering and
// recovery observations run through the actual built Workers and persistent D1.
const providerCalls = [], bindings = { GSIS_SECRET: "synthetic-authority-publication-secret",
  SCHEDULER_OWNER: "disabled", GOOGLE_CLIENT_ID: "synthetic-authority.apps.googleusercontent.com",
  HOSTED_DOMAIN: "example.invalid" };
const providerFetch = async request => { providerCalls.push(request.url); throw Error("No provider calls"); };
const f = await productSuite({ bindings, providerFetch });
let active = f, restarted, stopped = false, serial = 0, passed = 0;
const next = label => `synthetic-authority-${label}-${++serial}`;
async function request(user, domain, path, body) {
  const response = await active.mf.dispatchFetch(origin + "/api/" + domain + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin, cookie: "__Host-gsis_session=" + user.token, "x-csrf-token": user.csrf,
      ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
async function call(user, domain, path, body) {
  const r = await request(user, domain, path, body);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.data;
}
async function internal(domain, path, body) {
  const worker = await active.mf.getWorker("gsis-" + domain);
  const response = await worker.fetch("https://internal.test" + path, { method: "POST",
    headers: { "content-type": "application/json", "x-gsis-secret": bindings.GSIS_SECRET }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
async function group(label, action) { await action(); passed++; console.log("PASS " + label); }
const matrixRow = (role, { smc = false, sl = false, eo = null } = {}) =>
  [role, "Synthetic " + (role || "ordinary"), sl ? "1" : "", "", smc ? "1" : "", "", "", "", "", "", "", "", "EO", eo];
try {
  f.admin = await f.seedAccount("synthetic-authority-admin");
  const scenario = await seedScenario(f), [personA, personB] = scenario.staff;
  const publisher = await f.seedAccount("synthetic-authority-publisher", { staffId: personA, capabilities: [] });
  const other = await f.seedAccount("synthetic-authority-other", { staffId: personB, capabilities: [] });
  const contact = id => call(f.admin, "contacts", "/staff/" + id);
  const values = async id => Object.fromEntries(Object.entries((await contact(id)).fields)
    .filter(([key]) => ["memberships", "smc", "eo", "schoolLeader"].includes(key)).map(([key, field]) => [key, field.value]));
  const made = await call(f.admin, "deploy", "/versions/create", { operationId: next("create"),
    name: "Synthetic authority matrix", year: Number(scenario.date.slice(0, 4)) });
  const versionId = made.versionId;
  async function setMatrix(a, b, { marker = true, unmatchedB = false } = {}) {
    const db = await active.db("deploy"), loaded = await loadVersion(db, schoolId, versionId);
    loaded.doc.membership = [matrixRow("Synthetic A", a), matrixRow("", b)];
    if (marker) loaded.doc.roleMembershipSchema = 1;
    else delete loaded.doc.roleMembershipSchema;
    loaded.doc.teacherDrafts ??= {};
    for (const teacher of loaded.doc.teachers) {
      const role = teacher.id === personA ? "Synthetic A" : unmatchedB ? "Synthetic unmatched" : "";
      teacher.profile = { ...teacher.profile, Role: role };
      teacher.role = role;
      loaded.doc.teacherDrafts[teacher.id] = { ...loaded.doc.teacherDrafts[teacher.id], Role: role };
      teacher.groups = ["Synthetic custom group"];
      teacher.deploymentTags = { ...teacher.deploymentTags, Memberships: ["Synthetic custom group"] };
    }
    const delta = changesFor(schoolId, versionId, loaded.rows, loaded.doc);
    if (delta.writes.length) await db.batch(delta.writes.map(w => statement(db, w.sql, w.args)));
  }
  let leaseUser;
  async function publish(user = f.admin) {
    const db = await active.db("deploy"), loaded = await loadVersion(db, schoolId, versionId);
    if (leaseUser && leaseUser.id !== user.id) {
      const lease = await db.prepare("SELECT fence FROM deploy_leases WHERE school_id=? AND version_id=? AND scope='meta'").bind(schoolId, versionId).first();
      // Test fixtures can expire a lease after its owner removes their own access.
      // The next lease still goes through the real owner endpoint.
      await db.prepare("UPDATE deploy_leases SET expires_at=0 WHERE school_id=? AND version_id=? AND scope='meta'").bind(schoolId, versionId).run();
      assert(lease);
    }
    const pointer = await db.prepare("SELECT sequence FROM deploy_pointer WHERE school_id=?").bind(schoolId).first();
    const clientId = "synthetic-authority-client", operationId = next("publish");
    const lease = await call(user, "deploy", "/lease", { operationId: next("lease"), versionId, scope: "meta", clientId });
    leaseUser = user;
    const result = await call(user, "deploy", "/publish", { operationId, versionId, revision: loaded.version.revision,
      expectedPointerSequence: pointer?.sequence ?? 0, scope: "meta", clientId, leaseFence: lease.fence });
    return { ...result, sourceOperationId: operationId, versionId };
  }
  const syncBody = (p, offset = 0, limit = 2) => ({ operationId: next("sync"), publicationId: p.publicationId,
    sourceOperationId: p.sourceOperationId, versionId, offset, limit });
  const sync = (p, user = f.admin, offset = 0, limit = 2) => call(user, "deploy", "/memberships/sync", syncBody(p, offset, limit));
  async function sourceOf(p) {
    const op = await operationStatus(await active.db("deploy"), schoolId, p.sourceOperationId);
    return { publicationId: p.publicationId, sourceOperationId: p.sourceOperationId, sourceDigest: op.digest, sourceFence: op.fence };
  }
  async function accept(id, field, value) {
    return call(f.admin, "contacts", `/staff/${id}/accept`, { operationId: next("direct-accept"), field, value,
      revision: (await contact(id)).fields[field]?.revision ?? 0, ownerReviewReference: "Synthetic owner review" });
  }
  await group("explicit matrix publication grants current permission; unknown EO preserves evidence; custom groups remain", async () => {
    assert.equal((await request(publisher, "deploy", "/versions")).status, 403);
    await setMatrix({ smc: true, sl: true, eo: false }, { smc: false, eo: null });
    const p = await publish(), applied = await sync(p);
    assert.equal(applied.completed, 2, JSON.stringify(applied));
    assert.deepEqual(await values(personA), { smc: true, eo: false, schoolLeader: true,
      memberships: ["Synthetic custom group", "SL", "SMC"] });
    assert.equal((await values(personB)).eo, true, "grade text never overwrites EO");
    const session = await call(publisher, "core", "/session");
    assert(session.capabilities.includes("deploy.publish"));
    assert(!session.capabilities.includes("admin"));
    const core = await active.db("core");
    assert.equal((await core.prepare("SELECT COUNT(*) n FROM core_grants WHERE account_id=?").bind(publisher.id).first()).n, 0);
    const contacts = await active.db("contacts");
    const audits = (await contacts.prepare("SELECT * FROM contacts_acceptance_audit WHERE staff_id=? AND after_json LIKE '%authorityPublicationVersion%' ORDER BY field").bind(personA).all()).results;
    assert.equal(audits.length, 4);
    assert(audits.every(row => row.proposer === f.admin.id && row.accepter === f.admin.id && row.operation_id && row.accepted_at));
    assert.equal((await call(f.admin, "contacts", "/contributions")).rows.length, 0);
  });
  await group("publication self-demotion is allowed; another current publisher resumes original proposal", async () => {
    await setMatrix({ smc: false, sl: false, eo: false }, { smc: true, sl: false, eo: true });
    const p = await publish(publisher), source = await sourceOf(p);
    const proof = await internal("deploy", "/internal/publication/verify", { schoolId, ...source, membershipOnly: true });
    assert.equal(proof.status, 200, JSON.stringify(proof.body));
    const offset = proof.body.data.contributions.findIndex(c => c.staffId === personA);
    const response = await request(publisher, "deploy", "/memberships/sync", syncBody(p, offset, 1));
    assert([200, 409].includes(response.status), JSON.stringify(response));
    assert.equal((await values(personA)).smc, false);
    assert.equal((await request(publisher, "deploy", "/memberships/sync", syncBody(p))).status, 403);
    const finished = await sync(p);
    assert.equal(finished.completed, 2, JSON.stringify(finished));
    assert((await call(other, "core", "/session")).capabilities.includes("deploy.publish"));
    const contacts = await active.db("contacts");
    const audit = await contacts.prepare("SELECT * FROM contacts_acceptance_audit WHERE staff_id=? AND field='smc' ORDER BY accepted_at DESC LIMIT 1").bind(personB).first();
    assert.equal(audit.proposer, publisher.id);
    assert.equal(audit.accepter, f.admin.id);
    assert.equal(JSON.parse(audit.after_json).sourcePublicationId, p.publicationId);
  });
  await group("direct field edits cannot cancel unrelated SMC removal; later intentional publication wins", async () => {
    await setMatrix({ smc: false, eo: false }, { smc: false, eo: false });
    const p = await publish();
    await accept(personA, "eo", true);
    await call(f.admin, "contacts", `/staff/${personB}/update`, { operationId: next("direct-membership"),
      changes: { memberships: ["Synthetic direct choice"] } });
    const result = await sync(p);
    assert.equal(result.appliedCount, 2);
    assert.equal((await values(personA)).smc, false);
    assert.equal((await values(personA)).eo, true);
    assert.equal((await values(personB)).smc, false);
    assert.deepEqual((await values(personB)).memberships, ["Synthetic direct choice"]);
    assert.deepEqual(result.results.find(r => r.staffId === personA).supersededFields, ["eo"]);
    assert.deepEqual(result.results.find(r => r.staffId === personB).supersededFields, ["memberships"]);
    await setMatrix({ smc: true, eo: true }, { smc: true, eo: true });
    const later = await publish();
    await Promise.all([sync(later), sync(later)]);
    await sync(later);
    assert.equal((await values(personA)).smc, true);
    assert.equal((await values(personA)).schoolLeader, false);
    const contacts = await active.db("contacts");
    assert.equal((await contacts.prepare("SELECT COUNT(*) n FROM contacts_acceptance_audit WHERE staff_id=? AND field='smc' AND json_extract(after_json,'$.sourcePublicationId')=?").bind(personA, later.publicationId).first()).n, 1);
  });
  await group("self exception is unavailable to direct Contacts edits or forged publication markers", async () => {
    const before = await values(personA);
    const self = await request(publisher, "contacts", `/staff/${personA}/accept`, { operationId: next("self-direct"),
      field: "smc", value: false, revision: (await contact(personA)).fields.smc.revision, ownerReviewReference: "Synthetic" });
    assert.equal(self.status, 403);
    const forged = await request(f.admin, "contacts", `/staff/${personA}/update`, { operationId: next("forged"),
      authorityPublicationVersion: 1, membershipPublicationVersion: 1, membershipPublicationSequence: 100,
      sourcePublicationId: "synthetic-forged", publicationProposerId: f.admin.id,
      changes: { smc: false, schoolLeader: false, eo: false, memberships: [] } });
    assert.equal(forged.status, 403);
    assert.deepEqual(await values(personA), before);
  });
  await group("own unchanged authority settles truthfully and mixed legacy Memberships recover after self-removal", async () => {
    await setMatrix({ smc: true, eo: true }, { smc: true, eo: true });
    const unchanged = await publish(publisher), source = await sourceOf(unchanged);
    const proof = await internal("deploy", "/internal/publication/verify", { schoolId, ...source, membershipOnly: true });
    const offset = proof.body.data.contributions.findIndex(c => c.staffId === personA);
    const before = await contact(personA), result = await sync(unchanged, publisher, offset, 1);
    assert.equal((await contact(personA)).fields.smc.revision, before.fields.smc.revision + 1);
    assert.equal(result.receiptRecorded, false, "own revision changed after application; do not fabricate the outer receipt");
    assert.equal(result.recoveryRequired, true);
    assert.equal(result.terminalReceipt.state, "terminal-not-committed");
    assert.equal((await operationStatus(await active.db("deploy"), schoolId, result.operationId)).state, "aborted");
    assert((await call(publisher, "core", "/session")).capabilities.includes("deploy.publish"));
    await sync(unchanged);
    await setMatrix({ smc: false, eo: true }, {}, { unmatchedB: true });
    const mixed = await publish(publisher);
    await sync(mixed, publisher, offset, 1);
    assert.equal((await request(publisher, "deploy", "/versions")).status, 403);
    const recovered = await sync(mixed);
    assert.equal(recovered.completed, 2, JSON.stringify(recovered));
    assert.deepEqual((await values(personB)).memberships, ["Synthetic custom group"]);
    const contacts = await active.db("contacts"), ordinary = await contacts.prepare("SELECT * FROM contacts_contributions WHERE source_publication=? AND staff_id=?").bind(mixed.publicationId, personB).first();
    assert.equal(ordinary.field, "memberships"); assert.equal(ordinary.state, "applied");
    assert.equal(JSON.parse(ordinary.outcome_json).accepter, f.admin.id);
    assert.equal((await contacts.prepare("SELECT COUNT(*) n FROM source_pins WHERE state='held' AND operation_id LIKE 'membership-apply-%'").first()).n, 0);
  });
  await group("MKE conflict rejects all tuple fields and leaves a recoverable pending proposal", async () => {
    await setMatrix({ smc: true, eo: true }, { smc: true, eo: true });
    await accept(personB, "smc", false);
    const p = await publish();
    await call(f.admin, "contacts", `/staff/${personB}/update`, { operationId: next("mk"), changes: { schoolSection: "MK" } });
    // Contacts changed after the immutable Primary publication; the application
    // transaction must recheck its current MK evidence rather than trusting it.
    const before = await values(personB), result = await sync(p);
    assert.equal(result.results.find(r => r.staffId === personB).code, "MKE_SMC_CONFLICT");
    assert.deepEqual(await values(personB), before);
    assert.equal(result.state, "pending");
    await call(f.admin, "contacts", `/staff/${personB}/update`, { operationId: next("primary"), changes: { schoolSection: "Primary" } });
    assert.equal((await sync(p, publisher)).completed, 2);
    const contacts = await active.db("contacts"), audit = await contacts.prepare("SELECT * FROM contacts_acceptance_audit WHERE staff_id=? AND field='smc' ORDER BY accepted_at DESC LIMIT 1").bind(personB).first();
    assert.equal(audit.accepter, publisher.id, "a new authorised actor can replace a conclusively aborted failed attempt");
  });
  await group("source proof binds exact school, intent, authorised page, live session and non-aborted sync", async () => {
    const p = await publish(), source = await sourceOf(p), input = syncBody(p, 0, 1);
    await call(f.admin, "deploy", "/memberships/sync", input);
    const core = await active.db("core"), deploy = await active.db("deploy");
    const decision = await core.prepare("SELECT decision_id FROM core_evidence WHERE json_extract(descriptor_json,'$.service')='deploy' AND json_extract(descriptor_json,'$.operationId')=? ORDER BY created_at DESC LIMIT 1").bind(input.operationId).first();
    const all = await internal("deploy", "/internal/publication/verify", { schoolId, ...source, membershipOnly: true });
    const full = await internal("deploy", "/internal/publication/verify", { schoolId, ...source });
    const ordinary = full.body.data.contributions.find(c => c.field === "role");
    assert(ordinary);
    assert.equal((await internal("core", "/internal/contribution-authority", { schoolId, source,
      contribution: ordinary, contributionId: "synthetic-ordinary-role-proof", operationId: next("ordinary-proof") })).status, 200,
      "a marked publication does not redirect ordinary role jobs into the interactive authority path");
    const [selected, outside] = all.body.data.contributions;
    const proofInput = { schoolId, source, contribution: selected, contributionId: "synthetic-authority-proof",
      operationId: next("proof"), resumerDecisionId: decision.decision_id,
      resumerOperationId: input.operationId, resumerIntent: input, versionId };
    assert.equal((await internal("core", "/internal/contribution-authority", proofInput)).status, 200);
    assert.equal((await internal("core", "/internal/contribution-authority", { ...proofInput, schoolId: "synthetic-other-school" })).status, 403);
    assert.equal((await internal("core", "/internal/contribution-authority", { ...proofInput, contribution: outside })).status, 403);
    const changed = await internal("core", "/internal/contribution-authority", { ...proofInput,
      resumerIntent: { ...input, offset: 1 } });
    assert.equal(changed.status, 409);
    const forged = await internal("core", "/internal/contribution-authority", { ...proofInput,
      contribution: { ...selected, proposedValue: { ...selected.proposedValue, smc: !selected.proposedValue.smc } } });
    assert.equal(forged.status, 403);
    await core.prepare("UPDATE core_sessions SET revoked=1 WHERE account_id=?").bind(f.admin.id).run();
    assert.equal((await internal("core", "/internal/contribution-authority", proofInput)).status, 401);
    await core.prepare("UPDATE core_sessions SET revoked=0 WHERE account_id=?").bind(f.admin.id).run();
    await core.prepare("UPDATE core_accounts SET suspended=1 WHERE account_id=?").bind(f.admin.id).run();
    assert.equal((await internal("core", "/internal/contribution-authority", proofInput)).status, 403);
    await core.prepare("UPDATE core_accounts SET suspended=0 WHERE account_id=?").bind(f.admin.id).run();
    // Synthetic corruption fixture models a terminally aborted outer operation;
    // the real source-owner verifier must refuse even still-current Core proof.
    await deploy.prepare("UPDATE product_operations SET state='aborted' WHERE operation_id=?").bind(input.operationId).run();
    assert.equal((await internal("core", "/internal/contribution-authority", proofInput)).status, 409);
    await deploy.prepare("UPDATE product_operations SET state='committed' WHERE operation_id=?").bind(input.operationId).run();
    await sync(p);
  });
  await group("lost response and Worker restart preserve receipts, history and missing EO", async () => {
    const missing = await call(f.admin, "contacts", "/staff/create", { operationId: next("missing-person"),
      staffId: "synthetic-authority-missing-eo", basicName: "Synthetic Missing EO", employmentActive: true });
    assert(missing);
    // Remove EO only from a synthetic fixture; absence must never be converted
    // into a Boolean by appointment-grade text or a legacy matrix row.
    const contacts = await active.db("contacts");
    await contacts.prepare("DELETE FROM contacts_fields WHERE school_id=? AND staff_id=? AND field='eo'").bind(schoolId, personB).run();
    await setMatrix({ smc: true, eo: true }, { smc: false, eo: null });
    const p = await publish(), input = syncBody(p);
    await call(f.admin, "deploy", "/memberships/sync", input); // response deliberately discarded
    const before = await contact(personA), beforeB = await contact(personB);
    assert(!beforeB.fields.eo);
    await active.mf.dispose(); stopped = true;
    restarted = await startProduct({ persistPath: join(f.path, "state"), output: join(f.path, "product-restarted"),
      migrateSchemas: false, bindings, providerFetch });
    active = restarted;
    const recovered = await call(f.admin, "deploy", "/memberships/sync", input);
    assert.equal(recovered.completed, 2);
    assert.equal((await contact(personA)).fields.smc.revision, before.fields.smc.revision);
    assert(!(await contact(personB)).fields.eo);
    assert.equal((await request(other, "deploy", "/versions")).body.error.code, "AUTHORITY_EVIDENCE_MISSING");
    const changed = await request(f.admin, "deploy", "/memberships/sync", { ...input, offset: 1 });
    assert.equal(changed.status, 409);
  });
  assert.equal(providerCalls.length, 0);
  console.log(`PASS ${passed} authority publication groups; synthetic Worker/D1 only; hosted UAT Not tested`);
} finally {
  if (restarted) await restarted.close();
  if (stopped) await rm(f.path, { recursive: true, force: true });
  else await f.close();
}
