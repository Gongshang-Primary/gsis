import assert from "node:assert/strict";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement, canonical, digest, operationStatus, prepareOperation } from "../v1/runtime/store.mjs";

// Public owner commands and the real built service-binding/D1 path. Only the
// stored planning fixture is seeded directly; no hosted data or provider call.
const providerCalls = [];
const started = performance.now();
const bindings = { SCHEDULER_OWNER: "disabled", GSIS_SECRET: "synthetic-membership-test-secret",
  GOOGLE_CLIENT_ID: "synthetic-membership.apps.googleusercontent.com", HOSTED_DOMAIN: "example.invalid" };
const f = await productSuite({ bindings, providerFetch: async request => {
  providerCalls.push(request.url); throw Error("No provider is permitted in this test");
} });
let active = f, restarted, initialStopped = false, serial = 0, passed = 0;
const next = label => `synthetic-membership-${label}-${++serial}`;
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
  const response = await request(user, domain, path, body);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}
async function group(label, action) { await action(); passed++; console.log("PASS " + label); }
async function internal(domain, path, body) {
  const worker = await active.mf.getWorker("gsis-" + domain);
  const response = await worker.fetch("https://internal.test" + path, { method: "POST",
    headers: { "content-type": "application/json", "x-gsis-secret": bindings.GSIS_SECRET }, body: JSON.stringify(body) });
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  return value.data;
}
try {
  f.admin = await f.seedAccount("synthetic-membership-admin");
  const scenario = await seedScenario(f);
  const [personA, personB] = scenario.staff;
  const reader = await f.seedAccount("synthetic-membership-reader", { staffId: personB, capabilities: [] });
  const publisher = await f.seedAccount("synthetic-membership-publisher", { staffId: personA, capabilities: [] });
  const contact = id => call(f.admin, "contacts", "/staff/" + id);
  const memberships = async id => (await contact(id)).fields.memberships.value;
  async function edit(id, value) {
    const before = await contact(id);
    return call(f.admin, "contacts", `/staff/${id}/update`, { operationId: next("direct"),
      changes: { memberships: value }, fieldRevisions: { memberships: before.fields.memberships?.revision ?? 0 } });
  }
  await edit(personA, ["Synthetic seed A"]);
  await edit(personB, ["Synthetic seed B"]);
  const made = await call(f.admin, "deploy", "/versions/create", { operationId: next("version"),
    name: "Synthetic Memberships plan", year: Number(scenario.date.slice(0, 4)) });
  const versionId = made.versionId;
  async function fixtureMemberships(values) {
    const db = await active.db("deploy"), loaded = await loadVersion(db, schoolId, versionId);
    for (const teacher of loaded.doc.teachers) if (Object.hasOwn(values, teacher.id)) {
      teacher.deploymentTags ??= {};
      teacher.deploymentTags.Memberships = values[teacher.id];
      teacher.groups = values[teacher.id];
      teacher.profile ??= {};
      teacher.profile.Memberships = values[teacher.id].join(";");
    }
    const delta = changesFor(schoolId, versionId, loaded.rows, loaded.doc);
    await db.batch(delta.writes.map(w => statement(db, w.sql, w.args)));
  }
  await fixtureMemberships({ [personA]: ["Synthetic published A"], [personB]: ["Synthetic published B"] });
  async function publish(user = f.admin) {
    const db = await active.db("deploy"), loaded = await loadVersion(db, schoolId, versionId);
    const pointer = await db.prepare("SELECT sequence FROM deploy_pointer WHERE school_id=?").bind(schoolId).first();
    const operationId = next("publish"), clientId = "synthetic-membership-client";
    const lease = await call(user, "deploy", "/lease", { operationId: next("lease"), versionId, scope: "meta", clientId });
    const result = await call(user, "deploy", "/publish", { operationId, versionId, revision: loaded.version.revision,
      expectedPointerSequence: pointer?.sequence ?? 0, scope: "meta", clientId, leaseFence: lease.fence });
    return { ...result, sourceOperationId: operationId, versionId };
  }
  function syncBody(publication, offset = 0, limit = 1) {
    return { operationId: next("sync"), publicationId: publication.publicationId,
      sourceOperationId: publication.sourceOperationId, versionId, offset, limit };
  }
  const sync = (publication, offset = 0, limit = 1) => call(f.admin, "deploy", "/memberships/sync", syncBody(publication, offset, limit));
  async function sourceOf(publication) {
    const op = await operationStatus(await active.db("deploy"), schoolId, publication.sourceOperationId);
    return { publicationId: publication.publicationId, sourceOperationId: publication.sourceOperationId,
      sourceDigest: op.digest, sourceFence: op.fence };
  }
  async function syncAll(publication) {
    let last;
    for (let i = 0; i < 2; i++) last = await sync(publication, i, 1);
    return last;
  }
  const first = await publish();
  const contactsDb = await active.db("contacts");
  const authorityBefore = (await contactsDb.prepare("SELECT staff_id,field,revision,value_json FROM contacts_fields WHERE field IN('smc','eo','schoolLeader') ORDER BY staff_id,field").all()).results;
  await group("direct edit after committed publication survives delayed delivery; another person's publication applies", async () => {
    await edit(personA, ["Synthetic later direct"]);
    await syncAll(first);
    assert.deepEqual(await memberships(personA), ["Synthetic later direct"]);
    assert.deepEqual(await memberships(personB), ["Synthetic published B"]);
    const frontier = await contactsDb.prepare("SELECT * FROM contacts_membership_frontiers WHERE school_id=? AND staff_id=?").bind(schoolId, personA).first();
    assert.equal(frontier.publication_sequence, first.sequence);
    assert.equal(frontier.source_kind, "direct");
    const inbox = await call(f.admin, "contacts", "/contributions");
    assert.equal(inbox.rows.length, 0, "automatic Memberships delivery is not a manual approval queue");
    const row = await contactsDb.prepare("SELECT contribution_id FROM contacts_contributions WHERE source_publication=? LIMIT 1").bind(first.publicationId).first();
    const manual = await request(f.admin, "contacts", "/contributions/resolve", { operationId: next("reject-auto"),
      contributionId: row.contribution_id, resolution: "reject" });
    assert.equal(manual.status, 409);
    assert.equal(manual.body.error.code, "MEMBERSHIP_AUTOMATIC_PUBLICATION");
  });
  const second = await publish();
  await group("intentional republication wins; exact sync retry does not write again", async () => {
    await syncAll(second);
    assert.deepEqual(await memberships(personA), ["Synthetic published A"]);
    const input = syncBody(second, 0, 2);
    await call(f.admin, "deploy", "/memberships/sync", input);
    const before = await contact(personA);
    await edit(personA, ["Synthetic after completed sync"]);
    await call(f.admin, "deploy", "/memberships/sync", input);
    assert.deepEqual(await memberships(personA), ["Synthetic after completed sync"]);
    assert.equal((await contact(personA)).fields.memberships.revision, before.fields.memberships.revision + 1);
    const conflict = await request(f.admin, "deploy", "/memberships/sync", { ...input, offset: 1 });
    assert.equal(conflict.status, 409);
  });
  await fixtureMemberships({ [personA]: [], [personB]: ["Synthetic third publication"] });
  const third = await publish();
  await group("grid edits take the same ordering frontier; explicit published empty list clears", async () => {
    const data = await call(f.admin, "contacts", "/data"), index = data.fields.indexOf("Memberships");
    const row = data.rows.find(r => r.id === personB);
    await call(f.admin, "contacts", "/save-data", { operationId: next("grid"), additions: [],
      changes: [{ id: personB, field: "Memberships", expected: row.values[index], value: "Synthetic later grid" }] });
    await syncAll(third);
    assert.deepEqual(await memberships(personA), []);
    assert.deepEqual(await memberships(personB), ["Synthetic later grid"]);
    await syncAll(first);
    assert.deepEqual(await memberships(personA), []);
    assert.deepEqual(await memberships(personB), ["Synthetic later grid"]);
  });
  await group("concurrent delivery preserves one effect and authoritative fields", async () => {
    await fixtureMemberships({ [personA]: ["Synthetic concurrent A"], [personB]: ["Synthetic concurrent B"] });
    const fresh = await publish(), before = await contact(personA);
    await Promise.all([sync(fresh, 0, 2), sync(fresh, 0, 2)]);
    await syncAll(fresh);
    assert.equal((await contact(personA)).fields.memberships.revision, before.fields.memberships.revision + 1);
    assert.deepEqual(await memberships(personA), ["Synthetic concurrent A"]);
    assert.deepEqual((await contactsDb.prepare("SELECT staff_id,field,revision,value_json FROM contacts_fields WHERE field IN('smc','eo','schoolLeader') ORDER BY staff_id,field").all()).results, authorityBefore);
    assert.equal((await request(reader, "deploy", "/memberships/sync", syncBody(third))).status, 403);
    const owner = await active.mf.getWorker("gsis-contacts");
    const denied = await owner.fetch("https://internal.test/internal/membership-publication", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ schoolId }) });
    assert.equal(denied.status, 403);
    const foreign = await owner.fetch("https://internal.test/internal/membership-publication", { method: "POST",
      headers: { "content-type": "application/json", "x-gsis-secret": bindings.GSIS_SECRET }, body: JSON.stringify({ schoolId: "other-school" }) });
    assert.equal(foreign.status, 403);
  });
  await group("accepted SMC and EO publisher delegates Memberships without an Admin grant", async () => {
    const current = await contact(personA);
    await call(f.admin, "contacts", `/staff/${personA}/accept`, { operationId: next("publisher-smc"), field: "smc",
      value: true, revision: current.fields.smc.revision, ownerReviewReference: "Synthetic owner review" });
    async function release(user) {
      const db = await active.db("deploy");
      const lease = await db.prepare("SELECT fence FROM deploy_leases WHERE school_id=? AND version_id=? AND scope='meta'").bind(schoolId, versionId).first();
      await call(user, "deploy", "/lease", { operationId: next("release"), versionId, scope: "meta",
        clientId: "synthetic-membership-client", release: true, fence: lease.fence });
    }
    await release(f.admin);
    const beforeMembership = (await contact(personA)).fields.memberships.revision;
    const fresh = await publish(publisher);
    let outcome, recoveredProgress = 0;
    for (const offset of [0, 1]) {
      const input = syncBody(fresh, offset, 1);
      const response = await request(publisher, "deploy", "/memberships/sync", input);
      if (response.status === 409) {
        // The actor's own Memberships changed their observed staff revision.
        // Re-evaluate only after the original progress receipt is terminal.
        const receipt = await call(publisher, "deploy", "/receipt", { operationId: input.operationId });
        assert.equal(receipt.receipt.state, "terminal-not-committed", JSON.stringify(receipt));
        recoveredProgress++;
        outcome = await call(publisher, "deploy", "/memberships/sync", syncBody(fresh, offset, 1));
      } else {
        assert.equal(response.status, 200, JSON.stringify(response.body));
        outcome = response.body.data;
      }
    }
    assert.equal(outcome.completed, 2, JSON.stringify(outcome));
    assert.equal(outcome.appliedCount, 2);
    assert.equal(recoveredProgress, 1);
    assert.equal((await contact(personA)).fields.memberships.revision, beforeMembership + 1,
      "new progress identity must not repeat the already committed Contacts update");
    await release(publisher);
  });
  await group("restart recovers expired apply and supersede attempts without changing later edits", async () => {
    const fresh = await publish(), source = await sourceOf(fresh);
    await edit(personB, ["Synthetic after pending publication"]);
    const before = await contact(personB);
    const proof = await internal("deploy", "/internal/publication/verify", { schoolId, ...source, membershipOnly: true, offset: 0, limit: 2 });
    const recoveryIds = [];
    // Durable crash fixtures: both original attempts were prepared but no
    // membership or supersede commit was made before the Worker stopped.
    for (const contribution of proof.contributions) {
      const contributionId = `contribution-${await digest([source.publicationId, contribution.staffId, "memberships"])}`;
      await contactsDb.prepare("INSERT INTO contacts_contributions(school_id,contribution_id,staff_id,field,value_json,base_revision,source_publication,source_sequence,source_json,proposal_json,decision_id,proposer,state,created_at) VALUES(?,?,?,'memberships',?,?,?,?,?,?,?,?,'pending',?)")
        .bind(schoolId, contributionId, contribution.staffId, canonical(contribution.proposedValue), contribution.acceptedBaseFieldRevision,
          source.publicationId, proof.sequence, canonical(source), canonical(contribution), proof.decisionId, f.admin.id, Date.now()).run();
      const skip = contribution.staffId === personB;
      const operationId = `membership-${skip ? "skip" : "apply"}-${await digest(contributionId)}-0`;
      recoveryIds.push(operationId);
      const delegated = skip ? null : await internal("core", "/internal/contribution-authority", { schoolId, source, contribution, contributionId, operationId });
      await prepareOperation(contactsDb, { schoolId, actorId: f.admin.id, operationId,
        action: skip ? "internal.membership-superseded" : "contacts.contribute",
        intent: skip ? { contributionId, source } : delegated.intent,
        now: Date.now() - 120000, validUntil: Date.now() - 60000, authorization: delegated?.principal });
    }
    await f.mf.dispose();
    initialStopped = true;
    restarted = await startProduct({ bindings, persistPath: join(f.path, "state"), output: join(f.path, "restarted"), migrateSchemas: false,
      providerFetch: async request => { providerCalls.push(request.url); throw Error("No provider permitted"); } });
    active = restarted;
    await syncAll(fresh);
    assert.deepEqual(await memberships(personB), ["Synthetic after pending publication"]);
    assert.equal((await contact(personB)).fields.memberships.revision, before.fields.memberships.revision);
    const recovered = await active.db("contacts");
    for (const id of recoveryIds) {
      assert.equal((await operationStatus(recovered, schoolId, id)).state, "aborted");
      assert.equal((await operationStatus(recovered, schoolId, id.slice(0, -1) + "1")).state, "committed");
    }
    await active.trigger("deploy"); await active.trigger("contacts");
    assert.equal(providerCalls.length, 0);
    const db = await active.db("deploy");
    assert((await db.prepare("SELECT COUNT(*) n FROM product_outbox WHERE type='deploy.drive-export' AND state='queued'").first()).n > 0);
  });
  await group("large immutable publication uses bounded proof pages and eight independent owner commits", async () => {
    const ids = [personA, personB];
    for (let i = 0; i < 6; i++) {
      const staffId = `synthetic-large-member-${i}`;
      await call(f.admin, "contacts", "/staff/create", { operationId: next("large-person"), staffId, basicName: `Synthetic large person ${i}` });
      ids.push(staffId);
    }
    const fresh = await publish(), source = await sourceOf(fresh), db = await active.db("deploy");
    const publication = await db.prepare("SELECT * FROM deploy_publications WHERE id=?").bind(fresh.publicationId).first();
    const bucket = await active.mf.getR2Bucket("ARTIFACTS", "gsis-deploy");
    const payload = JSON.parse(await (await bucket.get(publication.payload_key)).text());
    const labels = Array.from({ length: 32 }, (_, i) => (`Synthetic membership ${i} `).padEnd(160, "x"));
    const template = payload.document.teachers[0];
    // Synthetic storage fixture representing a legal large published school;
    // tested reads and selected writes still use real built Workers and D1.
    payload.document.teachers = Array.from({ length: 256 }, (_, i) => ({ ...structuredClone(template),
      id: ids[i] ?? `synthetic-unselected-member-${i}`, name: `Synthetic member ${i}`, ttbName: `Synthetic member ${i}`,
      groups: labels, deploymentTags: { ...template.deploymentTags, Memberships: labels },
      profile: { ...template.profile, Memberships: labels.join(";") } }));
    const raw = canonical(payload);
    assert(Buffer.byteLength(raw) > 1024 * 1024 && Buffer.byteLength(raw) < 8 * 1024 * 1024);
    await bucket.put(publication.payload_key, raw);
    await db.prepare("UPDATE deploy_publications SET payload_digest=? WHERE id=?").bind(await digest(raw), fresh.publicationId).run();
    const page = await internal("deploy", "/internal/publication/verify", { schoolId, ...source, membershipOnly: true, offset: 0, limit: 8 });
    assert.equal(page.total, 256); assert.equal(page.contributions.length, 8);
    assert(Buffer.byteLength(JSON.stringify(page)) < 1024 * 1024);
    const single = await internal("deploy", "/internal/publication/verify", { schoolId, ...source, membershipOnly: true, staffId: personA });
    assert.equal(single.contributions.length, 1);
    const at = performance.now(), result = await sync(fresh, 0, 8);
    console.log(`Eight-person Memberships chunk: ${Math.round(performance.now() - at)} ms locally`);
    assert.equal(result.completed, 8, JSON.stringify(result));
    assert.equal(result.appliedCount, 8);
    assert.equal(result.state, "pending", "unselected people are not reported as completed");
    assert.deepEqual(await memberships(personA), labels);
    const core = await active.db("core"), coreWorker = await active.mf.getWorker("gsis-core");
    await core.prepare("UPDATE core_accounts SET suspended=1,revision=revision+1 WHERE account_id=?").bind(f.admin.id).run();
    try {
      const response = await coreWorker.fetch("https://internal.test/internal/contribution-authority", { method: "POST",
        headers: { "content-type": "application/json", "x-gsis-secret": bindings.GSIS_SECRET },
        body: JSON.stringify({ schoolId, source, contribution: single.contributions[0], contributionId: "synthetic-revoked-proof", operationId: next("revoked") }) });
      assert.equal(response.status, 403, "a committed publication does not bypass current actor suspension");
    } finally {
      await core.prepare("UPDATE core_accounts SET suspended=0,revision=revision+1 WHERE account_id=?").bind(f.admin.id).run();
    }
    const legacy = structuredClone(payload);
    delete legacy.envelope.membershipPublicationVersion;
    const legacyRaw = canonical(legacy);
    await bucket.put(publication.payload_key, legacyRaw);
    await db.prepare("UPDATE deploy_publications SET payload_digest=? WHERE id=?").bind(await digest(legacyRaw), fresh.publicationId).run();
    const contactsWorker = await active.mf.getWorker("gsis-contacts");
    const legacyResult = await contactsWorker.fetch("https://internal.test/internal/membership-publication", { method: "POST",
      headers: { "content-type": "application/json", "x-gsis-secret": bindings.GSIS_SECRET }, body: JSON.stringify({ schoolId, ...source, offset: 0, limit: 1 }) });
    assert.equal(legacyResult.status, 409, "old publications cannot silently acquire the new automatic contract");
    assert.equal(providerCalls.length, 0);
  });
  console.log(`PASS ${passed} Memberships publication boundary groups in ${Math.round(performance.now() - started)} ms; hosted UAT Not tested`);
} finally {
  if (restarted) await restarted.close();
  if (initialStopped) await rm(f.path, { recursive: true, force: true });
  else await f.close();
}
