import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";
import { enqueueMonitor, dispatchMonitor } from "../v1/services/lord/jobs.mjs";
import { drainOutbox } from "../v1/runtime/jobs.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { join } from "node:path";
import { rm } from "node:fs/promises";

// Actual built owner Workers/D1, synthetic explicit monitor configuration.
// Sender remains owned by v0.9; there are no provider credentials or sends.
const suite = await productSuite({ bindings: {
  SCHEDULER_OWNER: "v1", SEND_OWNER: "v0.9",
  LORD_MONITOR_TELEGRAM_CHAT_ID: "-123456789",
} });
let reopened, disposed = false;
try {
  const admin = await suite.seedAccount("synthetic-overdue-admin");
  await suite.call(admin, "lord", "/reference/refresh", {
    operationId: "synthetic-overdue-reference",
  });
  const result = await suite.trigger("lord");
  assert.equal(result.ok, true, JSON.stringify(result));
  const db = await suite.db("lord");
  const rows = (await db.prepare(
    "SELECT * FROM product_outbox WHERE school_id='synthetic-school' AND type='lord.monitor'",
  ).all()).results;
  assert.equal(rows.length, 0,
    "Built monitor must not emit an hourly summary when there is no overdue physical custody");
  console.log("PASS built Worker/D1: overdue monitor creates no alert without overdue custody");
  const borrower = await suite.seedAccount("synthetic-overdue-borrower", { staffId: "synthetic-overdue-person", capabilities: ["lord.read", "lord.borrow"] });
  await suite.call(admin, "contacts", "/staff/create", { operationId: "synthetic-overdue-person-create", staffId: borrower.staffId, basicName: "Synthetic overdue borrower" });
  const person = (await suite.request(admin, "contacts", "/staff/" + borrower.staffId)).body.data;
  await suite.call(admin, "contacts", "/staff/" + borrower.staffId + "/update", { operationId: "synthetic-overdue-person-facts", revision: person.revision, changes: { employmentActive: true, email: "synthetic-overdue@example.invalid" } });
  await suite.call(admin, "lord", "/reference/refresh", { operationId: "synthetic-overdue-reference-current" });
  const realNow = Date.now(), sg = new Date(realNow + 8 * 3600000), day = sg.toISOString().slice(0, 10);
  const minute = sg.getUTCHours() * 60 + sg.getUTCMinutes(), endMinute = Math.max(minute - 40, 1);
  const hm = n => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
  await suite.call(admin, "lord", "/settings", { operationId: "synthetic-overdue-native-timings", key: "periodTimings", revision: 0,
    value: { periods: [{ code: "1", start: hm(Math.max(endMinute - 10, 0)), end: hm(endMinute) }] } });
  await suite.call(admin, "lord", "/resources", { operationId: "synthetic-overdue-native-cart", resourceId: "synthetic-overdue-cart", name: "Synthetic overdue cart", type: "tablet", capacity: 1, revision: 0 });
  const booking = await suite.call(borrower, "lord", "/bookings", { operationId: "synthetic-overdue-native-book", date: day, startPeriod: 1, endPeriod: 1,
    resourceId: "synthetic-overdue-cart", quantity: 1, classOrActivity: "Synthetic class", subject: "Synthetic subject" });
  const photo = await suite.call(borrower, "lord", "/photos", { operationId: "synthetic-overdue-native-photo", bookingId: booking.bookingId, mime: "image/png",
    base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6xUAAAAASUVORK5CYII=" });
  await suite.call(borrower, "lord", "/collect", { operationId: "synthetic-overdue-native-collect", bookingId: booking.bookingId, revision: 1,
    items: [{ resourceId: "synthetic-overdue-cart", quantity: 1 }], photoIds: [photo.photoId] });
  await suite.trigger("lord");
  const actual = (await db.prepare("SELECT * FROM product_outbox WHERE school_id='synthetic-school' AND type='lord.monitor' AND json_extract(payload_json,'$.bookingId')=?").bind(booking.bookingId).all()).results;
  const shouldBeOverdue = minute - endMinute > 30 && sg.getUTCHours() < 18;
  assert.equal(actual.length, shouldBeOverdue ? 1 : 0, "Built scan follows actual grace and18:00 closure, without a summary fallback");
  assert.ok(actual.every(j => j.provider_id === null), "Built fixture retains v0.9 provider ownership");
  console.log("PASS built native booking/photo/collection: overdue eligibility and unchanged administrative closure");

  // Precise-clock supplements use the same real owning D1; separate synthetic
  // schools keep these fixtures independent of the real wall-clock bookings.
  const clockSchool = "synthetic-overdue-clock", date = "2030-01-20", end = Date.parse(date + "T12:00:00+08:00");
  const periods = [{ code: "1", start: "11:50", end: "12:00" }, { code: "2", start: "14:50", end: "15:00" }];
  const settings = async (school, value) => db.prepare("INSERT INTO lord_settings VALUES(?,'periodTimings',1,?) ON CONFLICT(school_id,setting_key) DO UPDATE SET revision=revision+1,value_json=excluded.value_json").bind(school, JSON.stringify({ periods: value })).run();
  const monitorRows = async school => (await db.prepare("SELECT * FROM product_outbox WHERE school_id=? AND type='lord.monitor' ORDER BY job_id").bind(school).all()).results;
  const reference = async school => db.prepare("INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,state,due_at,updated_at) VALUES(?,'synthetic-reference','synthetic-reference','lord.reference-refresh',?,'delivered',0,0)")
    .bind(school, JSON.stringify({ schoolId: school, originalDecisionId: "synthetic-admin-reference-decision" })).run();
  const resource = async school => db.prepare("INSERT INTO lord_resources VALUES(?,'synthetic-cart','Synthetic cart','tablet',2,1,0,0,1,'{}')").bind(school).run();
  const seed = async (school, id, { status = "COLLECTED", serviceDate = date, code = 1, remaining = 1, accessories = 0 } = {}) => {
    await db.prepare("INSERT INTO lord_bookings(school_id,booking_id,staff_id,created_by,service_date,start_period,end_period,status,revision,details_json,created_at,updated_at) VALUES(?,?,'synthetic-monitor-person','synthetic-monitor-actor',?,1,?,?,1,?,0,0)")
      .bind(school, id, serviceDate, code + 1, status, JSON.stringify({ classOrActivity: "Synthetic monitor class", subject: "Synthetic monitor subject" })).run();
    if (remaining) await db.prepare("INSERT INTO lord_booking_items VALUES(?,?,'synthetic-cart',2,2,?,0)").bind(school, id, 2 - remaining).run();
    if (accessories) await db.prepare("INSERT INTO lord_accessories VALUES(?,?,'styluses',?,0)").bind(school, id, accessories).run();
  };
  await settings(clockSchool, periods); await reference(clockSchool); await resource(clockSchool);
  const clockEnv = { DB: db, SCHOOL_ID: clockSchool, LORD_MONITOR_TELEGRAM_CHAT_ID: "-123456789" };
  await seed(clockSchool, "synthetic-zzz-overdue", { remaining: 2 });
  await seed(clockSchool, "synthetic-accessory-only", { remaining: 0, accessories: 1 });
  for (const status of ["BOOKED", "RETURNED", "CANCELLED", "CLOSED", "DECLARED_RETURNED"]) await seed(clockSchool, "synthetic-state-" + status, { status });
  await seed(clockSchool, "synthetic-empty", { remaining: 0 });
  await seed(clockSchool, "synthetic-future-date", { serviceDate: "2030-01-21" });
  await seed(clockSchool, "synthetic-missing-period", { code: 9 });
  await db.batch(Array.from({ length: 101 }, (_, i) => db.prepare("INSERT INTO lord_bookings(school_id,booking_id,staff_id,created_by,service_date,start_period,end_period,status,revision,details_json,created_at,updated_at) VALUES(?,?,'synthetic-monitor-person','synthetic-monitor-actor',?,2,3,'COLLECTED',1,'{}',0,0)")
    .bind(clockSchool, "synthetic-aaa-not-due-" + i, date)));
  await db.batch(Array.from({ length: 101 }, (_, i) => db.prepare("INSERT INTO lord_booking_items VALUES(?,?,'synthetic-cart',2,2,1,0)")
    .bind(clockSchool, "synthetic-aaa-not-due-" + i)));
  await enqueueMonitor(clockEnv, end + 30 * 60000 - 1);
  assert.equal((await monitorRows(clockSchool)).length, 0);
  await enqueueMonitor(clockEnv, end + 30 * 60000);
  assert.equal((await monitorRows(clockSchool)).length, 0, "Exactly30 minutes is still inside grace");
  assert.equal((await enqueueMonitor(clockEnv, end + 30 * 60000 + 1)).state, "already-scanned", "Monitor scans once per five-minute bucket");
  await Promise.all([enqueueMonitor(clockEnv, end + 35 * 60000), enqueueMonitor(clockEnv, end + 35 * 60000)]);
  const dueRows = await monitorRows(clockSchool);
  assert.equal(dueRows.length, 2, "Only actual overdue resource/accessory custody is admitted");
  assert.ok(dueRows.some(j => JSON.parse(j.payload_json).bookingId === "synthetic-zzz-overdue"), "Non-due prefix cannot hide overdue custody");
  await db.batch([
    db.prepare("UPDATE lord_bookings SET revision=2 WHERE school_id=? AND booking_id='synthetic-zzz-overdue'").bind(clockSchool),
    db.prepare("UPDATE lord_booking_items SET returned_quantity=1 WHERE school_id=? AND booking_id='synthetic-zzz-overdue'").bind(clockSchool),
  ]);
  await db.prepare("UPDATE product_outbox SET state=CASE WHEN json_extract(payload_json,'$.bookingId')='synthetic-zzz-overdue' THEN 'accepted' ELSE 'uncertain' END WHERE school_id=? AND type='lord.monitor'").bind(clockSchool).run();
  const evidence = await monitorRows(clockSchool);
  await enqueueMonitor(clockEnv, end + 40 * 60000);
  assert.deepEqual(await monitorRows(clockSchool), evidence, "Partial returns and later buckets cannot duplicate accepted/uncertain alerts");
  console.log("PASS real D1 exact-clock scan: strict grace, five-minute cadence, open resources/accessories, fair filtering and durable per-booking identity");

  const providerSchool = "synthetic-overdue-provider", providerNow = Date.now(), local = new Date(providerNow + 8 * 3600000);
  const currentMinute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const serviceDate = currentMinute < 40 ? new Date(local.getTime() - 86400000).toISOString().slice(0, 10) : local.toISOString().slice(0, 10);
  const ending = currentMinute < 40 ? 1380 : currentMinute - 40;
  const providerPeriods = [{ code: "1", start: hm(Math.max(ending - 10, 0)), end: hm(ending) }];
  await settings(providerSchool, providerPeriods); await reference(providerSchool); await resource(providerSchool);
  await db.prepare("INSERT INTO lord_references VALUES(?,'synthetic-monitor-person','Synthetic current borrower',NULL,NULL,'synthetic-current-facts',?)").bind(providerSchool, providerNow).run();
  const cases = ["accepted", "uncertain", "returned", "empty", "authority", "config", "owner", "changed"];
  for (const id of cases) await seed(providerSchool, "synthetic-send-" + id, { serviceDate });
  let allowed = true, uncertain = false, sends = [];
  const providerEnv = { DB: db, SCHOOL_ID: providerSchool, SERVICE_NAME: "lord", GSIS_SECRET: "synthetic-only", SEND_OWNER: "v1",
    LORD_MONITOR_TELEGRAM_CHAT_ID: "-123456789", TELEGRAM_BOT_TOKEN: "123:synthetic",
    CORE: { async fetch(request) { const input = await request.json(); assert.equal(input.purpose, "lord.references"); return Response.json({ ok: true, data: { allowed } }); } },
    PROVIDER_FETCH: async (url, init) => { assert.ok(url.startsWith("https://api.telegram.org/")); sends.push(JSON.parse(init.body));
      return uncertain ? new Response("Synthetic unknown outcome", { status: 503 }) : Response.json({ ok: true, result: { message_id: 42 } }); },
  };
  await enqueueMonitor(providerEnv, providerNow);
  assert.equal((await monitorRows(providerSchool)).length, cases.length);
  await db.prepare("UPDATE product_outbox SET due_at=? WHERE school_id=? AND type='lord.monitor'").bind(providerNow + 3600000, providerSchool).run();
  const drain = async id => {
    const jobId = "lord:monitor:overdue:synthetic-send-" + id;
    await db.prepare("UPDATE product_outbox SET due_at=0 WHERE school_id=? AND job_id=?").bind(providerSchool, jobId).run();
    await drainOutbox(db, providerEnv, { schoolId: providerSchool, limit: 1, handlers: { "lord.monitor": dispatchMonitor } });
    return db.prepare("SELECT * FROM product_outbox WHERE school_id=? AND job_id=?").bind(providerSchool, jobId).first();
  };
  assert.equal((await drain("accepted")).state, "accepted");
  assert.match(sends[0].text, /Synthetic current borrower/); assert.match(sends[0].text, /Devices remaining: 1/);
  assert.match(sends[0].text, /Synthetic cart/); assert.match(sends[0].text, /Expected end:/);
  uncertain = true; assert.equal((await drain("uncertain")).state, "uncertain"); uncertain = false;
  await db.prepare("UPDATE lord_bookings SET status='RETURNED',revision=revision+1 WHERE school_id=? AND booking_id='synthetic-send-returned'").bind(providerSchool).run();
  assert.equal((await drain("returned")).last_code, "CUSTODY_NOT_OPEN");
  await db.prepare("UPDATE lord_booking_items SET returned_quantity=collected_quantity WHERE school_id=? AND booking_id='synthetic-send-empty'").bind(providerSchool).run();
  assert.equal((await drain("empty")).last_code, "NO_REMAINING_CUSTODY");
  allowed = false; assert.equal((await drain("authority")).last_code, "ADMIN_AUTHORITY_REVOKED"); allowed = true;
  providerEnv.LORD_MONITOR_TELEGRAM_CHAT_ID = undefined;
  assert.equal((await drain("config")).last_code, "MONITOR_DISABLED"); providerEnv.LORD_MONITOR_TELEGRAM_CHAT_ID = "-123456789";
  providerEnv.SEND_OWNER = "v0.9"; assert.equal((await drain("owner")).state, "failed"); providerEnv.SEND_OWNER = "v1";
  await db.prepare("UPDATE product_outbox SET payload_json=json_set(payload_json,'$.expectedEnd',1) WHERE school_id=? AND job_id='lord:monitor:overdue:synthetic-send-changed'").bind(providerSchool).run();
  assert.equal((await drain("changed")).last_code, "BOOKING_END_CHANGED");
  assert.equal(sends.length, 2, "Only accepted and uncertain synthetic provider attempts occurred");
  const legacy = await dispatchMonitor({ school_id: providerSchool, payload: { originalDecisionId: "synthetic-admin-reference-decision" } }, providerEnv);
  assert.equal(legacy.code, "LEGACY_MONITOR_SUPERSEDED");
  await enqueueMonitor(providerEnv, providerNow + 10 * 60000);
  await drainOutbox(db, providerEnv, { schoolId: providerSchool, limit: 2, handlers: { "lord.monitor": dispatchMonitor } });
  assert.equal(sends.length, 2, "Accepted/uncertain evidence is never automatically replayed");
  console.log("PASS actual owning D1/outbox with synthetic provider: current details, withdrawal, config/authority/owner gates, old summaries and uncertainty");

  await suite.mf.dispose(); disposed = true;
  reopened = await startProduct({ output: join(suite.path, "product"), persistPath: join(suite.path, "state"), migrateSchemas: false,
    bindings: { GSIS_SECRET: suite.secret, SCHEDULER_OWNER: "v1", SEND_OWNER: "v0.9", LORD_MONITOR_TELEGRAM_CHAT_ID: "-123456789" } });
  const reopenedDb = await reopened.db("lord");
  await enqueueMonitor({ ...clockEnv, DB: reopenedDb }, end + 45 * 60000);
  assert.deepEqual((await reopenedDb.prepare("SELECT * FROM product_outbox WHERE school_id=? AND type='lord.monitor' ORDER BY job_id").bind(clockSchool).all()).results, evidence);
  console.log("PASS actual Worker restart: original per-booking accepted/uncertain alert history remains stable");
} finally {
  if (reopened) await reopened.close();
  if (!disposed) await suite.close();
  else await rm(suite.path, { recursive: true, force: true });
}
