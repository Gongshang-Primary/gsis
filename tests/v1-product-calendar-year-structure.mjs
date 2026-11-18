import assert from "node:assert/strict";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import { prepareOperation, query, one, canonical } from "../v1/runtime/store.mjs";
import { handle, internal } from "../v1/services/calendar/service.mjs";

const runtime = await createDatabase("calendar");
const principal = { schoolId: "structure-school", actorId: "structure-admin", staffId: "structure-staff", capabilities: ["calendar.admin"], decisionId: "structure-decision", validUntil: Date.now() + 3600000 };
const input = (Year = 2027) => ({ Year, Vacation1Start: `${Year}-03-13`, Vacation1End: `${Year}-03-21`, Vacation2Start: `${Year}-${Year === 2028 ? "06-03" : "05-29"}`, Vacation2End: `${Year}-06-27`, Vacation3Start: `${Year}-${Year === 2028 ? "09-09" : "09-04"}`, Vacation3End: `${Year}-09-12`, Vacation4Start: `${Year}-11-27`, Vacation4End: `${Year}-12-31` });
const context = (action, payload = {}, db = runtime.db, who = principal) => ({ env: { DB: db, ARTIFACTS: runtime.bucket, SCHOOL_ID: principal.schoolId, SERVICE_NAME: "calendar" }, request: new Request("https://synthetic.invalid/calendar/action"), path: "/action", method: "POST", body: { action, payload }, principal: who, now: Date.now(), requestId: crypto.randomUUID() });
async function mutate(action, payload, db = runtime.db) {
  const p = { ...payload, operationId: payload.operationId || crypto.randomUUID() }, ctx = context(action, p, db);
  const op = await prepareOperation(runtime.db, { schoolId: principal.schoolId, actorId: principal.actorId, operationId: p.operationId, action: "calendar." + action, intent: { action, payload: p }, now: ctx.now, validUntil: principal.validUntil, authorization: principal });
  await syntheticAdmission(runtime.db, op, { decisionId: principal.decisionId });
  return handle(ctx);
}
const bootstrap = (year = 2027) => handle(context("bootstrap", { year }));
const payload = async (year = 2027, extra = {}) => ({ ...input(year), expectedMetadataRevision: (await bootstrap(year)).metadataRevisions.structure, ...extra });
const createYear = (Year) => mutate("saveYear", { Year, Status: "PLANNING", ReleasedToTeachers: "No", expectedMetadataRevision: "missing" });
const content = () => Promise.all(["calendar_years", "calendar_events", "calendar_metadata", "calendar_sync", "product_outbox", "product_audit"].map(table => query(runtime.db, `SELECT * FROM ${table} ORDER BY rowid`)));
try {
  await createYear(2027);
  const manual = await mutate("saveEvent", { event: { Year: 2027, StaffTitle: "T1W1", StartDate: "2027-02-01", EndDate: "2027-02-01", EventType: "ALL_DAY", Status: "HIDDEN", LaneID: "day", StaffDescription: "Manually entered; matching title is not ownership" } });
  await runtime.db.prepare("INSERT INTO calendar_metadata VALUES(?,'yearStructure','manual-note',2027,1,?)").bind(principal.schoolId, canonical({ Kind: "NOTE", Label: "Keep this custom label" })).run();
  const p = await payload(2027, { operationId: "first-generation" });
  const first = await mutate("generateYearStructure", p);
  assert.equal(first.structures.length, 45); assert.equal(first.materialisedEventCount, 44);
  assert.equal(first.multiDayEventsCreatedOrUpdated, 44); assert.equal(first.externalSyncQueued, false);
  assert.equal(first.receipt.state, "committed"); assert.equal(first.receipt.operationId, p.operationId);
  assert.equal(first.structures[0].Week, 0);
  const regular = first.structures.filter(r => r.Kind === "TERM_WEEK" && r.Week > 0);
  assert.equal(regular.length, 40);
  assert(regular.every(r => new Date(r.StartDate).getUTCDay() === 1 && new Date(r.EndDate).getUTCDay() === 0));
  assert.deepEqual(regular.filter(r => r.Term === 1).map(r => r.Week), [1,2,3,4,5,6,7,8,9,10]);
  assert.equal(regular[0].StartDate, "2027-01-04");
  assert(!regular.some(r => r.StartDate <= "2027-11-22" && r.EndDate >= "2027-11-22"));
  assert.equal((await bootstrap()).events.length, 45);
  assert.equal((await one(runtime.db, "SELECT COUNT(*) n FROM product_outbox")).n, 0);
  assert.equal((await one(runtime.db, "SELECT data_json FROM calendar_events WHERE event_id=?", [manual.eventId])).data_json, canonical(Object.fromEntries(Object.entries(manual.event).filter(([k]) => k !== "_revision"))));
  const saved = await content();
  assert.deepEqual(await mutate("generateYearStructure", p), first);
  assert.deepEqual(await content(), saved);
  await runtime.restart();
  assert.deepEqual(await mutate("generateYearStructure", p), first, "restart recovers original durable receipt");
  assert.deepEqual(await content(), saved);
  await assert.rejects(() => mutate("generateYearStructure", { ...p, Vacation4Start: "2027-11-28" }), e => e.code === "OPERATION_INTENT_CONFLICT");

  const original = (await bootstrap()).events.find(e => e.EventID === first.generation.entries[0].eventId);
  const stale = await payload();
  await mutate("saveEvent", { event: { EventID: original.EventID, StaffTitle: "Keep owner-edited label", ParentEnabled: "Yes", ParentTitle: "Keep parent label" }, expectedRevision: original._revision });
  await assert.rejects(() => mutate("generateYearStructure", stale), e => e.code === "METADATA_CONFLICT");
  await runtime.db.prepare("UPDATE calendar_metadata SET revision=revision+1,data_json=json_set(data_json,'$.Label','Keep custom week label') WHERE school_id=? AND kind='yearStructure' AND record_id='2027-T1-W1'").bind(principal.schoolId).run();
  const rerun = await mutate("generateYearStructure", await payload());
  assert.equal(rerun.structures.find(row => row.StructureID === "2027-T1-W1").Label, "Keep custom week label");
  assert.equal(rerun.multiDayEventsCreatedOrUpdated, 0); assert.equal(rerun.multiDayEventsRetained, 44);
  assert.deepEqual(rerun.generation.entries.map(e => e.eventId), first.generation.entries.map(e => e.eventId));
  const edited = (await bootstrap()).events.find(e => e.EventID === original.EventID);
  assert.equal(edited.StaffTitle, "Keep owner-edited label"); assert.equal(edited.ParentTitle, "Keep parent label"); assert.equal(edited.ParentEnabled, "Yes");
  assert.equal((await one(runtime.db, "SELECT data_json FROM calendar_metadata WHERE record_id='manual-note'")).data_json, canonical({ Kind: "NOTE", Label: "Keep this custom label" }));

  for (const override of [{ Vacation1Start: "2027-03-08" }, { Vacation2Start: "2027-03-20" }, { Vacation1Start: "2027-02-30" }, { Vacation4End: "2028-01-01" }]) {
    const before = await content();
    const bad = await payload(2027, override);
    await assert.rejects(() => mutate("generateYearStructure", bad), e => e.code === "INVALID_VACATIONS");
    assert.deepEqual(await content(), before);
  }
  const fail = await payload(); let injected = false;
  const failedDb = new Proxy(runtime.db, { get(target, key) { if (key === "batch") return async batch => { if (!injected && batch.length > 10) { injected = true; batch.splice(7, 0, runtime.db.prepare("INSERT INTO product_assertions VALUES('synthetic-failure',0)")); } return target.batch(batch); }; const v = target[key]; return typeof v === "function" ? v.bind(target) : v; } });
  const beforeFailure = await content();
  await assert.rejects(() => mutate("generateYearStructure", fail, failedDb), e => e.code === "REVISION_CONFLICT");
  assert(injected); assert.deepEqual(await content(), beforeFailure, "one failed assertion rolls back metadata/events/year/audit together");
  const race = await payload(); let raced = false;
  const racedDb = new Proxy(runtime.db, { get(target, key) { if (key === "batch") return async batch => { if (!raced && batch.length > 10) { raced = true; await runtime.db.prepare("INSERT INTO calendar_metadata VALUES(?,'yearStructure','racing-manual',2027,1,?)").bind(principal.schoolId, canonical({ Kind: "NOTE", Label: "Concurrent manual insertion" })).run(); } return target.batch(batch); }; const v = target[key]; return typeof v === "function" ? v.bind(target) : v; } });
  const beforeRace = await one(runtime.db, "SELECT revision FROM calendar_years WHERE year=2027");
  await assert.rejects(() => mutate("generateYearStructure", race, racedDb), e => e.code === "REVISION_CONFLICT");
  assert(raced); assert.deepEqual(await one(runtime.db, "SELECT revision FROM calendar_years WHERE year=2027"), beforeRace);
  assert.equal((await one(runtime.db, "SELECT COUNT(*) n FROM calendar_events WHERE year=2027")).n, 45);

  await createYear(2024);
  const monday = await mutate("generateYearStructure", await payload(2024));
  assert.equal(monday.structures.length, 44); assert(!monday.structures.some(r => r.Kind === "TERM_WEEK" && r.Week === 0));
  assert.equal(monday.materialisedEventCount, 44);
  const lockedEvent = monday.generation.entries[0].eventId;
  await runtime.db.prepare("INSERT INTO calendar_dispatch_locks VALUES(?,'staff',?,'synthetic-dispatch','uncertain',?,?)").bind(principal.schoolId, lockedEvent, Date.now(), Date.now()).run();
  const lockedRequest = await payload(2024), beforeLock = await content();
  await assert.rejects(() => mutate("generateYearStructure", lockedRequest), e => e.code === "REVISION_CONFLICT");
  assert.deepEqual(await content(), beforeLock, "uncertain provider dispatch is retained and generation cannot overwrite it");
  await runtime.db.prepare("DELETE FROM calendar_dispatch_locks WHERE intent_id='synthetic-dispatch'").run();
  await runtime.db.prepare("INSERT INTO source_pins VALUES(?,'year:2024','held-pin','roster','held-roster-operation','synthetic-digest',1,?,?,'synthetic-roster-decision','held',?)").bind(principal.schoolId, String(monday.revision), Date.now() + 600000, Date.now()).run();
  const heldRequest = await payload(2024), beforePin = await content();
  await assert.rejects(() => mutate("generateYearStructure", heldRequest), e => e.code === "SOURCE_CHANGE_PENDING");
  assert.deepEqual(await content(), beforePin, "existing Roster source pin blocks this owner year update");
  await createYear(2030);
  await mutate("saveEvent", { event: { Year: 2030, StaffTitle: "Imported custom label", StaffDescription: "[[GSPS_YEAR_STRUCTURE:TERM_WEEK:T1W1]]", EventType: "MULTI_DAY", StartDate: "2030-01-07", EndDate: "2030-01-13", Status: "HIDDEN", LaneID: "day" } });
  const markerRequest = await payload(2030), markerBefore = await content();
  await assert.rejects(() => mutate("generateYearStructure", markerRequest), e => e.code === "GENERATION_CONTENT_CONFLICT");
  assert.deepEqual(await content(), markerBefore, "an imported marker is not adopted as generator-owned");
  await createYear(2028);
  await runtime.db.prepare("INSERT INTO calendar_metadata VALUES(?,'yearStructure','imported-structure',2028,1,?)").bind(principal.schoolId, canonical({ Kind: "TERM_WEEK", Label: "Imported custom term label", Term: 1, Week: 1, StartDate: "2028-01-03", EndDate: "2028-01-09" })).run();
  const importedBefore = await content();
  const importedRequest = await payload(2028);
  await assert.rejects(() => mutate("generateYearStructure", importedRequest), e => e.code === "GENERATION_CONTENT_CONFLICT");
  assert.deepEqual(await content(), importedBefore);
  const altered = (await bootstrap()).events.find(e => e.EventID === original.EventID);
  await mutate("saveEvent", { event: { EventID: altered.EventID, StartDate: "2027-01-05" }, expectedRevision: altered._revision });
  const alteredRequest = await payload(), alteredBefore = await content();
  await assert.rejects(() => mutate("generateYearStructure", alteredRequest), e => e.code === "GENERATION_CONTENT_CONFLICT");
  assert.deepEqual(await content(), alteredBefore);
  for (const who of [{ ...principal, capabilities: ["calendar.read"] }, { ...principal, impersonating: true }]) {
    await assert.rejects(() => handle(context("generateYearStructure", input(), runtime.db, who)), e => ["CAPABILITY_DENIED", "IMPERSONATION_DENIED"].includes(e.code));
  }
  // Preserve the independent school-day predicate while correcting zero parity.
  const yearRow = await one(runtime.db, "SELECT revision FROM calendar_years WHERE year=2027");
  await mutate("saveYear", { Year: 2027, Status: "ACTIVE", ReleasedToTeachers: "Yes", revision: yearRow.revision });
  const dateCtx = context("bootstrap"); dateCtx.path = "/internal/dates";
  dateCtx.body = { schoolId: principal.schoolId, decisionId: principal.decisionId, from: "2027-01-01", to: "2027-01-04" };
  dateCtx.env.GSIS_SECRET = "synthetic";
  dateCtx.env.CORE = { async fetch() { return Response.json({ ok: true, data: { principal } }); } };
  const dates = await internal(dateCtx);
  assert.equal(dates.rows[0].week, 0); assert.equal(dates.rows[0].parity, null); assert.equal(dates.rows[0].schoolDay, true);
  assert.equal(dates.rows[1].schoolDay, false); assert.equal(dates.rows[3].parity, "odd");

  // Cold owner admission with a real D1 adapter, retained manual content and
  // all local SQL counted, including the atomic batch and source fencing.
  await createYear(2025);
  const retained = Array.from({ length: 4500 }, (_, i) => ({ id: "manual-2025-" + i, data: canonical({ Year: 2025, EventID: "manual-2025-" + i, StaffTitle: "Synthetic unrelated event " + i, Status: "HIDDEN", StartDate: "2025-02-01", EndDate: "2025-02-01", StaffDescription: "", EventType: "ALL_DAY" }) }));
  await runtime.db.prepare("INSERT INTO calendar_events(school_id,event_id,year,revision,status,start_date,end_date,data_json) SELECT ?,json_extract(value,'$.id'),2025,1,'HIDDEN','2025-02-01','2025-02-01',json_extract(value,'$.data') FROM json_each(?)").bind(principal.schoolId, canonical(retained)).run();
  const budgets = [];
  for (let run = 0; run < 2; run++) {
    const current = await payload(2025, { operationId: "bounded-generation-" + run });
    let statements = 0, maxBatch = 0, maxBindings = 0, serviceCalls = 0;
    const counted = new Proxy(runtime.db, { get(target, key) {
      if (key === "prepare") return sql => { statements++; const statement = target.prepare(sql); return new Proxy(statement, { get(object, name) { if (name === "bind") return (...args) => { maxBindings = Math.max(maxBindings, args.length); return object.bind(...args); }; const v = object[name]; return typeof v === "function" ? v.bind(object) : v; } }); };
      if (key === "batch") return batch => { maxBatch = Math.max(maxBatch, batch.length); return target.batch(batch); };
      const v = target[key]; return typeof v === "function" ? v.bind(target) : v;
    } });
    const cold = context("generateYearStructure", current, counted, { ...principal, dependencies: [{ owner: "core", scope: "account:structure-admin", revision: 1 }] });
    cold.env.GSIS_SECRET = "synthetic";
    cold.env.CORE = { async fetch(request) { serviceCalls++; const body = await request.json(), path = new URL(request.url).pathname; return Response.json({ ok: true, data: path.endsWith("/release") ? { state: "released" } : path.endsWith("/receipt") ? { recorded: true } : { pinId: body.pinId, owner: "core", scope: body.scope, revision: body.revision, validUntil: principal.validUntil } }); } };
    const result = await handle(cold);
    assert.equal(result.materialisedEventCount, 44);
    assert(statements <= 50 && statements + serviceCalls <= 50, JSON.stringify({ statements, serviceCalls, maxBatch }));
    assert(maxBindings <= 100);
    budgets.push({ run, statements, serviceCalls, maxBatch, maxBindings });
  }
  assert.equal((await one(runtime.db, "SELECT COUNT(*) n FROM calendar_events WHERE year=2025")).n, 4544);
  assert.equal((await one(runtime.db, "SELECT COUNT(*) n FROM product_outbox")).n, 0);
  console.log("GENERATION_BUDGET " + JSON.stringify(budgets));
  console.log("PASS Calendar year generation: native W0/40 full weeks/gaps/44 records, no jobs, ownership/import/manual preservation, stale token/CAS rollback, original receipt/restart and authority");
} finally { await runtime.close(); }
