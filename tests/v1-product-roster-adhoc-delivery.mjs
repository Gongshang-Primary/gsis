import assert from "node:assert/strict";
import fixture from "./roster701-fixture.cjs";
import { createDatabase } from "./v1-product/helpers.mjs";
import { dispatchRosterJob } from "../v1/services/roster/service.mjs";
import { templateFor } from "../v1/services/roster/templates.mjs";
import { canonical, one } from "../v1/runtime/store.mjs";
import { externalProof } from "../v1/services/roster/external.mjs";

// One actual local owner database; all identity/provider boundaries are synthetic.
const h = await createDatabase("roster"), schoolId = "synthetic-school";
const date = "2030-03-18", now = Date.parse(date + "T06:00:00+08:00");
const f = fixture(), previousDate = f.date;
f.date = date;
f.ctx.days[date] = f.ctx.days[previousDate];
delete f.ctx.days[previousDate];
Object.assign(f.ctx, { today: date, now, iso: new Date(now).toISOString(), minute: 360, notificationsConfigured: true });
f.state.accountingYears["2030"] = { verified: true };
f.O.apply(f.state, f.ctx, { operation: "saveAbsence", date, staffId: "alice", periods: [2], typeId: "mc" });
const demand = f.O.demand(f.ctx, f.state, date)[0];
f.O.apply(f.state, f.ctx, { operation: "assign", date, demandIds: [demand.id], staffId: "bob" });
f.O.apply(f.state, f.ctx, { operation: "publish", date, allocationRevision: f.state.dayRevisions[date] });
f.O.notifyDaily(f.state, f.ctx, { date, staffId: "bob" });
const dailyJob = f.state.outbox.find(j => j.kind === "stapler_timetable" && j.recipientId === "bob");
assert(dailyJob, "actual shared publication creates a source-bound timetable notification");
const snapshot = f.state.publicationSnapshots.find(v => v.staffId === "bob" && v.kind !== "cancelled");
assert(snapshot);
snapshot.conditionalRules = [{ id: "synthetic-rule", version: 1, text: "Synthetic instruction" }];
const lesson = { ...demand, period: 2 };
f.state.requests.push(
  { id: "peer-to-bob", staffId: "alice", recipientId: "bob", date, status: "pending", periods: [2], lessons: [lesson], absentName: "Alice", expiresAt: now + 86400000 },
  { id: "peer-by-bob", staffId: "bob", recipientId: "alice", date, status: "overridden", periods: [2], lessons: [lesson] },
);
const original = structuredClone(f.state);
const inactive = { staffId: "bob", id: "bob", name: "Bob", active: false, eo: true, mobile: "6592345678", employment: "Full-time", groups: [] };
const active = { staffId: "alice", id: "alice", name: "Alice", active: true, eo: true, mobile: "6591234567", groups: [] };
let firstPerson, currentPerson, currentState, projectionReads, onCurrent, sends = [], sequence = 0, powerUsers = [];
const reply = data => Response.json({ ok: true, data });
const env = {
  SCHOOL_ID: schoolId, SERVICE_NAME: "roster", GSIS_SECRET: "synthetic-suite-secret",
  DB: h.db, ARTIFACTS: h.bucket, PUBLIC_ORIGIN: "https://synthetic.invalid",
  SEND_OWNER: "v1", WHATSAPP_ACCESS_TOKEN: "synthetic-token", WHATSAPP_PHONE_NUMBER_ID: "123456789",
  WHATSAPP_TEMPLATES_JSON: JSON.stringify(Object.fromEntries([
    "relief_assignment", "relief_updated", "relief_reminder", "relief_urgent", "conditional_relief_instruction",
    "stapler_timetable", "mutual_request", "mutual_override", "system_alert", "contact_review", "stapler_request",
  ].map(key => [key, { name: "synthetic_" + key, parameters: ["summary", "link"] }]))),
  CORE_SCHEDULER: { async authorizeScheduled() { return { schoolId, actorId: "scheduler", staffId: null, decisionId: "synthetic-decision", capabilities: ["roster.read", "roster.notify"], validUntil: now + 60000 }; } },
  CONTACTS: { async fetch(request) {
    const body = await request.json();
    projectionReads++;
    if (!body.staffIds && onCurrent) await onCurrent();
    const person = body.staffIds ? firstPerson : currentPerson;
    return reply({ schoolId, revision: "contacts-" + projectionReads, asOf: now, people: [active, ...(person ? [person] : [])].filter(p => !body.staffIds || body.staffIds.includes(p.staffId)), smcIds: ["alice"], dependencies: [] });
  } },
  CORE: { async fetch(request) {
    assert.equal(new URL(request.url).pathname, "/internal/contacts-power-users");
    return reply({ staffIds: powerUsers });
  } },
  CALENDAR: { async fetch(request) {
    const body = await request.json();
    return reply({ rows: [{ date: body.from, available: true, schoolDay: true, parity: "single" }], revision: "calendar-1", asOf: now });
  } },
  async PROVIDER_FETCH(url, init) {
    assert.equal(new URL(url).hostname, "graph.facebook.com");
    const body = JSON.parse(init.body);
    sends.push(body);
    return Response.json({ messages: [{ id: "synthetic-message-" + sends.length }] });
  },
};
const activation = () => ({ id: "dated-bob", staffId: "bob", date, periods: [2] });
function payloadFor(kind) {
  if (kind === "stapler_timetable") return structuredClone(dailyJob);
  return {
    kind, recipientId: "bob", date, createdAt: new Date(now).toISOString(), expiresAt: now + 86400000,
    requestId: kind === "mutual_request" ? "peer-to-bob" : null,
    data: kind === "mutual_request" ? { peerRequestId: "peer-to-bob", periods: [2], templateKey: kind }
      : kind === "mutual_override" ? { peerRequestIds: ["peer-by-bob"], templateKey: kind }
      : { snapshotIds: [snapshot.id], templateKey: kind === "relief_publication" ? "relief_assignment" : kind,
          ...(kind === "conditional_relief_instruction" ? { ruleId: "synthetic-rule", ruleVersion: 1 } : {}) },
  };
}
async function seed(state) {
  const statements = [h.db.prepare("DELETE FROM roster_records"), h.db.prepare("DELETE FROM product_outbox")];
  for (const collection of ["adhoc", "assignments", "publicationSnapshots", "requests", "staplerPlans", "dailyPublicationStates", "dailyEmploymentSettings", "dailyEmploymentSnapshots"]) {
    const value = state[collection];
    const kind = Array.isArray(value) ? "array" : collection === "dailyPublicationStates" ? "map" : "value";
    const entries = kind === "array" ? value.map((row, i) => [row.id || String(i), row]) : kind === "map" ? Object.entries(value) : [["settings", value]];
    for (const [id, row] of entries) statements.push(h.db.prepare("INSERT INTO roster_records(school_id,collection,record_id,service_date,staff_id,revision,payload_json) VALUES(?,?,?,?,?,1,?)").bind(schoolId, collection, id, row.date || null, row.staffId || null, canonical({ kind, data: row })));
  }
  await h.db.batch(statements);
}
async function run(kind, options = {}) {
  firstPerson = options.first === undefined ? structuredClone(inactive) : options.first;
  currentPerson = options.current === undefined ? structuredClone(firstPerson) : options.current;
  currentState = structuredClone(original);
  currentState.adhoc = options.adhoc === undefined ? [activation()] : options.adhoc;
  options.changeState?.(currentState);
  onCurrent = options.onCurrent;
  projectionReads = 0;
  await seed(currentState);
  const id = "dispatch-" + (++sequence), payload = options.payload || payloadFor(kind);
  payload.id = id;
  const job = { school_id: schoolId, job_id: id, operation_id: id + "-owner", type: options.type || "roster-notification", fence: 1, payload };
  await h.db.prepare("INSERT INTO product_operations(school_id,operation_id,actor_id,action,digest,state,created_at,valid_until,updated_at) VALUES(?,?,?,?,?,'committed',?,?,?)").bind(schoolId, job.operation_id, "synthetic-owner", "roster.notify", "synthetic-intent", now, now + 60000, now).run();
  await h.db.prepare("INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,due_at,state,fence,lease_until,updated_at) VALUES(?,?,?,?,?,?,'leased',1,?,?)").bind(schoolId, id, job.operation_id, job.type, canonical(payload), now, now + 60000, now).run();
  const before = sends.length, result = await dispatchRosterJob(job, env, now);
  return { result, sent: sends.length - before, job };
}
async function denied(label, kind, options = {}) {
  const result = await run(kind, options);
  assert.equal(result.result.state, "cancelled", label);
  assert.equal(result.sent, 0, label + " never reaches the provider");
}
try {
  // This fails on the original service even after the independent context correction.
  await denied("consent revoked between Contacts reads", "mutual_override", { first: { ...inactive, active: true }, current: { ...inactive, active: true, notificationConsent: false } });
  for (const kind of ["relief_publication", "relief_reminder", "conditional_relief_instruction", "stapler_timetable", "mutual_request", "mutual_override"]) {
    const out = await run(kind);
    assert.equal(out.result.state, "accepted", kind + " permits a currently activated inactive EO");
    assert.equal(out.sent, 1, kind + " makes one synthetic provider call");
    assert.equal(sends.at(-1).to, inactive.mobile);
    if (["relief_publication", "mutual_request"].includes(kind)) {
      const link = await one(h.db, "SELECT * FROM roster_external_links WHERE school_id=? AND job_id=?", [schoolId, out.job.job_id]);
      assert.equal(link.staff_id, "bob");
      assert.equal(link.service_date, date);
      assert.equal(link.purpose, kind === "mutual_request" ? "mutual" : "duties");
      assert(link.source_revision, "private capability retains source revision");
      assert(sends.at(-1).template.components[0].parameters.some(p => p.text.includes("/roster/external/#token=")));
      const operationId = "proof-" + out.job.job_id, commandDigest = "a".repeat(64);
      await h.db.prepare("INSERT INTO roster_external_commands(school_id,operation_id,token_hash,command_digest,command_json) VALUES(?,?,?,?,?)").bind(schoolId, operationId, link.token_hash, commandDigest, canonical({ write: false })).run();
      if (kind === "mutual_request") {
        await h.restart();
        env.DB = h.db;
        env.ARTIFACTS = h.bucket;
      }
      const proofContext = { env, now, body: { tokenDigest: link.token_hash, operationId, commandDigest } };
      const proof = await externalProof(proofContext);
      assert.equal(proof.dateActive, true);
      assert.equal(proof.staffId, "bob");
      assert.equal(proof.sourceRevision, link.source_revision, "source binding survives an owner restart");
      await h.db.prepare("DELETE FROM roster_records WHERE collection='adhoc'").run();
      assert.equal((await externalProof(proofContext)).dateActive, false, "using a saved capability rechecks current activation");
    }
  }
  await denied("no activation", "relief_publication", { adhoc: [] });
  await denied("wrong activation date", "relief_publication", { adhoc: [{ ...activation(), date: "2030-03-19" }] });
  await denied("deleted activation", "relief_publication", { adhoc: [{ ...activation(), deletedAt: new Date(now).toISOString() }] });
  await denied("activation deleted during Contacts IO", "relief_publication", { onCurrent: () => h.db.prepare("DELETE FROM roster_records WHERE collection='adhoc'").run() });
  for (const kind of ["relief_publication", "relief_reminder", "conditional_relief_instruction", "stapler_timetable", "mutual_request"])
    await denied(kind + " outside activated period", kind, { adhoc: [{ ...activation(), periods: [3] }] });
  await denied("missing recipient", "relief_publication", { first: null });
  await denied("recipient disappeared between reads", "relief_publication", { current: null });
  await denied("qualification revoked between reads", "relief_publication", { current: { ...inactive, eo: false } });
  await denied("no accepted qualification", "relief_publication", { first: { ...inactive, eo: null } });
  await denied("notification consent refused", "relief_publication", { first: { ...inactive, notificationConsent: false } });
  await denied("unknown positive duty period", "relief_publication", { changeState: state => { state.publicationSnapshots.find(v => v.id === snapshot.id).period = null; } });
  await denied("unknown mutual lesson period cannot use cached payload periods", "mutual_request", { changeState: state => { state.requests.find(r => r.id === "peer-to-bob").lessons[0].period = null; } });
  const reviseInstruction = state => {
    const revised = structuredClone(state.publicationSnapshots.find(v => v.id === snapshot.id));
    revised.id = "later-conditional-publication";
    revised.revision = (revised.revision || 1) + 1;
    revised.period = revised.assignment.period = 3;
    revised.assignment.timeStart = "08:30";
    revised.assignment.timeEnd = "09:00";
    state.publicationSnapshots.push(revised);
    state.assignments.find(a => a.id === revised.assignmentId).period = 3;
    state.dailyPublicationStates[date].teachers.find(row => row.staffId === "bob").snapshotIds = [revised.id];
  };
  await denied("updated conditional instruction uses current P3 rather than original P2", "conditional_relief_instruction", { changeState: reviseInstruction });
  const currentInstruction = await run("conditional_relief_instruction", { adhoc: [{ ...activation(), periods: [3] }], changeState: reviseInstruction });
  assert.equal(currentInstruction.result.state, "accepted", "current P3 activation permits the updated instruction even when original P2 is unavailable");
  assert.equal(currentInstruction.sent, 1);
  assert.equal(currentInstruction.job.payload.data.checkedPublicationId, "later-conditional-publication");
  assert.deepEqual(currentInstruction.job.payload.data.snapshotIds, [snapshot.id], "the original queue reference is historical; the resolved publication controls current eligibility");
  const correction = await run("relief_publication", { adhoc: [{ ...activation(), periods: [3] }], changeState: state => {
    const published = state.publicationSnapshots.find(v => v.id === snapshot.id);
    published.kind = "cancelled";
    published.assignment.status = "cancelled";
  } });
  assert.equal(correction.result.state, "accepted", "a source-verified cancellation still reports the withdrawn P2 duty after activation narrows to P3");
  assert.equal(correction.sent, 1, "correction does not authorise a new P2 duty; positive-P2 control above is denied");
  const explicit = await run("relief_publication", { first: { ...inactive, eo: false, adhocEligible: true } });
  assert.equal(explicit.result.state, "accepted", "explicit typed ad hoc qualification is preserved");
  for (const kind of ["system_alert", "contact_review", "smc_alert", "capacity_warning", "stapler_request"])
    await denied(kind + " does not inherit relief eligibility", kind);
  await denied("general inbox reply remains active-only", "unused", { type: "roster-inbox-reply", payload: { staffId: "bob", date, text: "Synthetic reply", inReplyTo: "synthetic-inbound" } });
  await denied("duty SMC audience stays active-only", "mutual_override", { payload: { ...payloadFor("mutual_override"), data: { ...payloadFor("mutual_override").data, audience: "duty-smc" } } });
  await denied("active staff still need current duty SMC membership", "smc_alert", { first: { ...inactive, active: true } });
  await denied("active staff still need current sponsor SMC membership", "stapler_request", { first: { ...inactive, active: true } });
  await denied("employment report email stays active-only", "unused", {
    type: "roster-email", first: { ...inactive, email: "bob@example.invalid" },
    payload: { date, to: "bob@example.invalid", subject: "Synthetic report" },
    changeState: state => { state.dailyEmploymentSettings.recipients = [{ staffId: "bob", emails: ["bob@example.invalid"] }]; },
  });
  // Contact review (owner 21 Nov 2026): only a current Contacts Power User receives it.
  const reviewPayload = () => ({ kind: "contact_review", recipientId: "bob", date, createdAt: new Date(now).toISOString(), expiresAt: now + 86400000,
    data: { templateKey: "contact_review", summary: "New inactive external relief contact: Synthetic (SRE). Review permanent details in Contacts." } });
  powerUsers = ["bob"];
  const reviewSent = await run("contact_review", { first: { ...inactive, active: true }, adhoc: [], payload: reviewPayload() });
  assert.equal(reviewSent.result.state, "accepted", "a current Power User receives the contact review");
  assert.equal(reviewSent.sent, 1);
  powerUsers = [];
  const reviewRevoked = await run("contact_review", { first: { ...inactive, active: true }, adhoc: [], payload: reviewPayload() });
  assert.equal(reviewRevoked.result.state, "cancelled", "a recipient who lost Power User is not messaged");
  assert.equal(reviewRevoked.result.code, "RECIPIENT_NO_LONGER_POWER_USER");
  assert.equal(reviewRevoked.sent, 0);
  // v1 button templates (owner 21 Nov 2026): the dynamic URL button carries the
  // same private token as the link; static buttons carry none; a token button
  // never goes out without a token.
  const baseTemplates = env.WHATSAPP_TEMPLATES_JSON, configured = JSON.parse(baseTemplates);
  configured.relief_assignment = { name: "gsis_v1_relief_assignment", language: "en_GB", parameters: ["summary"], button: "token" };
  configured.mutual_override = { name: "gsis_v1_relief_changed", language: "en_GB", parameters: ["summary"], button: "token" };
  configured.stapler_request = { name: "gsis_v1_static", language: "en_GB", parameters: ["summary"], button: "static" };
  env.WHATSAPP_TEMPLATES_JSON = JSON.stringify(configured);
  const buttonSent = await run("relief_publication", { first: { ...inactive, active: true }, adhoc: [] });
  assert.equal(buttonSent.result.state, "accepted");
  const buttonBody = sends.at(-1).template, button = buttonBody.components.find(c => c.type === "button");
  assert.equal(buttonBody.name, "gsis_v1_relief_assignment");
  assert.deepEqual({ sub_type: button.sub_type, index: button.index }, { sub_type: "url", index: "0" });
  assert.match(button.parameters[0].text, /^[A-Za-z0-9_-]{43}$/, "button carries the private token only");
  const peerChange = await run("mutual_override", { first: { ...inactive, active: true }, adhoc: [], payload: { ...payloadFor("mutual_override"), data: { ...payloadFor("mutual_override").data, summary: "Your peer relief arrangement has changed." } } });
  assert.equal(peerChange.result.state, "accepted", JSON.stringify(peerChange.result));
  const peerButton = sends.at(-1).template.components.find(c => c.type === "button");
  assert.equal(sends.at(-1).template.name, "gsis_v1_relief_changed");
  assert.match(peerButton.parameters[0].text, /^[A-Za-z0-9_-]{43}$/, "peer-change notice now gets a private duties link");
  // A token button on a message that has no private link is refused before any send.
  assert.throws(() => templateFor({ WHATSAPP_TEMPLATES_JSON: JSON.stringify({ smc_attention: { name: "x", parameters: ["summary"], button: "token" } }) },
    "smc_attention", { summary: "Synthetic", link: null, linkToken: null }), (e) => e.code === "TEMPLATE_LINK_UNAVAILABLE");
  assert.throws(() => templateFor({ WHATSAPP_TEMPLATES_JSON: JSON.stringify({ k: { name: "x", button: "dynamic" } }) }, "k", {}), (e) => e.code === "TEMPLATE_BUTTON_INVALID");
  const staticButton = templateFor({ WHATSAPP_TEMPLATES_JSON: JSON.stringify({ k: { name: "x", parameters: ["summary"], button: "static" } }) }, "k", { summary: "S" });
  assert.deepEqual(staticButton.components, [{ type: "body", parameters: [{ type: "text", text: "S" }] }], "static button needs no parameter");
  env.WHATSAPP_TEMPLATES_JSON = baseTemplates;
  const activeControl = await run("relief_publication", { first: { ...inactive, active: true }, adhoc: [] });
  assert.equal(activeControl.result.state, "accepted", "ordinary active recipient needs no ad hoc activation");
  console.log("PASS actual local Roster delivery: six relief kinds, current eligibility and source-bound duty/mutual links; date/period/deletion/identity/qualification/consent negatives and active-only non-relief boundaries; synthetic providers only");
} finally { await h.close(); }
