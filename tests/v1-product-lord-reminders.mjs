import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";
import { enqueueReminders } from "../v1/services/lord/jobs.mjs";
import { notificationIntent } from "../v1/services/lord/service.mjs";
import { reminderEligibility, reminderPhase } from "../v1/services/lord/model.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { join } from "node:path";
import { rm } from "node:fs/promises";

// Actual built Core/Contacts/LORD Workers and owning synthetic D1. Scheduling
// ownership is local only; SEND_OWNER remains disabled, with no provider token.
const suite = await productSuite({ bindings: {
  SCHEDULER_OWNER: "v1", SEND_OWNER: "v0.9",
  LORD_SCHOOL_WHATSAPP_AGREEMENT: "true",
} });
const school = "synthetic-school";
let serial = 0, restarted, disposed = false;
const operation = label => "synthetic-lord-reminder-" + label + "-" + ++serial;
const localDay = time => new Date(time + 8 * 3600000).toISOString().slice(0, 10);
const hhmm = minute => String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
try {
  const admin = await suite.seedAccount("synthetic-reminder-admin");
  const borrower = await suite.seedAccount("synthetic-reminder-borrower", {
    staffId: "synthetic-reminder-staff", capabilities: ["lord.read", "lord.borrow"],
  });
  await suite.call(admin, "contacts", "/staff/create", {
    operationId: operation("person"), staffId: borrower.staffId, basicName: "Synthetic reminder borrower",
  });
  const person = (await suite.request(admin, "contacts", "/staff/" + borrower.staffId)).body.data;
  await suite.call(admin, "contacts", "/staff/" + borrower.staffId + "/update", {
    operationId: operation("facts"), revision: person.revision,
    changes: { employmentActive: true, email: "synthetic-reminder@example.invalid" },
  });
  await suite.call(admin, "lord", "/reference/refresh", { operationId: operation("reference") });
  await suite.call(admin, "lord", "/resources", {
    operationId: operation("resource"), resourceId: "synthetic-reminder-cart",
    name: "Synthetic reminder cart", type: "tablet", capacity: 1, revision: 0,
  });
  const now = Date.now(), sg = new Date(now + 8 * 3600000);
  // Usually ten minutes ahead; near midnight use an already expired window.
  // Both are outside the source's required five-minute collection window.
  const start = Math.min(sg.getUTCHours() * 60 + sg.getUTCMinutes() + 10, 1410);
  await suite.call(admin, "lord", "/settings", {
    operationId: operation("timings"), key: "periodTimings", revision: 0,
    value: { periods: [{ code: "1", start: hhmm(start), end: hhmm(start + 10) }] },
  });
  await suite.call(admin, "lord", "/settings", {
    operationId: operation("enabled"), key: "reminders", revision: 0, value: { enabled: true },
  });
  const booking = await suite.call(borrower, "lord", "/bookings", {
    operationId: operation("booking"), date: localDay(now), startPeriod: 1, endPeriod: 1,
    resourceId: "synthetic-reminder-cart", quantity: 1,
    classOrActivity: "Synthetic class", subject: "Synthetic subject",
  });
  const triggered = await suite.trigger("lord");
  assert.equal(triggered.ok, true, JSON.stringify(triggered));
  const db = await suite.db("lord");
  const reminders = (await db.prepare(
    "SELECT job_id,state,payload_json FROM product_outbox WHERE school_id=? AND json_extract(payload_json,'$.bookingId')=? AND json_extract(payload_json,'$.kind')='collection-reminder'",
  ).bind(school, booking.bookingId).all()).results;
  assert.equal(reminders.length, 0,
    "Built LORD scheduler must not enqueue a collection reminder outside [start−5 minutes, start)");
  await suite.call(borrower, "lord", "/bookings/cancel", {
    operationId: operation("cancel"), bookingId: booking.bookingId, revision: 1,
  });
  let dueAt = new Date(Date.now() + 3 * 60000 + 8 * 3600000);
  if (dueAt.getUTCHours() === 23 && dueAt.getUTCMinutes() === 59)
    dueAt = new Date(dueAt.getTime() + 60000);
  const dueMinute = dueAt.getUTCHours() * 60 + dueAt.getUTCMinutes();
  await suite.call(admin, "lord", "/settings", {
    operationId: operation("due-timings"), key: "periodTimings", revision: 1,
    value: { periods: [{ code: "1", start: hhmm(dueMinute),
      end: hhmm(Math.min(dueMinute + 1, 1439)) }] },
  });
  const dueBooking = await suite.call(borrower, "lord", "/bookings", {
    operationId: operation("due-booking"), date: dueAt.toISOString().slice(0, 10), startPeriod: 1, endPeriod: 1,
    resourceId: "synthetic-reminder-cart", quantity: 1,
    classOrActivity: "Synthetic due class", subject: "Synthetic due subject",
  });
  await suite.trigger("lord");
  const jobs = async id => (await db.prepare(
    "SELECT * FROM product_outbox WHERE school_id=? AND json_extract(payload_json,'$.bookingId')=? AND (json_extract(payload_json,'$.kind')='collection-reminder' OR type='lord.return-reminder') ORDER BY job_id",
  ).bind(school, id).all()).results;
  const dueJobs = await jobs(dueBooking.bookingId);
  assert.equal(dueJobs.length, 2, "Actual built scheduler enqueues each existing channel in the five-minute window");
  assert.ok(dueJobs.every(j => JSON.parse(j.payload_json).reminderPhase === "collection"));
  await suite.trigger("lord");
  assert.equal((await jobs(dueBooking.bookingId)).length, 2, "Repeated built scheduling keeps the same jobs");
  await suite.call(admin, "lord", "/settings", {
    operationId: operation("disable"), key: "reminders", revision: 1, value: { enabled: false },
  });
  // Requeue only these synthetic, unsent attempts so the real dispatch path must
  // recheck the setting rather than trusting its earlier eligibility decision.
  await db.prepare("UPDATE product_outbox SET state='queued',due_at=0 WHERE school_id=? AND json_extract(payload_json,'$.bookingId')=? AND json_extract(payload_json,'$.kind')='collection-reminder'")
    .bind(school, dueBooking.bookingId).run();
  await db.prepare("INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,state,due_at,updated_at) VALUES(?,?,?,'lord.return-reminder',?,'queued',0,?)")
    .bind(school, "synthetic-legacy-fixed-return", "synthetic-legacy-fixed-operation",
      JSON.stringify({ schoolId: school, bookingId: dueBooking.bookingId, staffId: borrower.staffId, revision: 1 }), Date.now()).run();
  await suite.trigger("lord");
  assert.ok((await jobs(dueBooking.bookingId)).every(j => j.state === "cancelled" && j.last_code === "REMINDERS_DISABLED"));
  const photo = await suite.call(borrower, "lord", "/photos", {
    operationId: operation("photo"), bookingId: dueBooking.bookingId, mime: "image/png",
    base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6xUAAAAASUVORK5CYII=",
  });
  await suite.call(borrower, "lord", "/collect", {
    operationId: operation("collect"), bookingId: dueBooking.bookingId, revision: 1,
    items: [{ resourceId: "synthetic-reminder-cart", quantity: 1 }], photoIds: [photo.photoId],
  });
  assert.equal((await jobs(dueBooking.bookingId)).filter(j => j.type === "lord.return-reminder").length, 1,
    "Actual native collection creates no new fixed16:00 job; only the retained synthetic legacy row remains");
  assert.ok((await jobs(dueBooking.bookingId)).every(j => j.provider_id === null), "Local sender ownership prevents provider sends");
  console.log("PASS real built Worker/D1: five-minute due filtering, repeated scheduling, queued setting revocation and native collection");

  // Exact-clock supplements use the same real owning D1 and exported scheduler
  // function. No product clock hook, provider send, live record or fake DB.
  const day = "2030-01-20", at = Date.parse(day + "T12:00:00+08:00"), nowDue = at - 2 * 60000;
  const periods = [{ code: "1", start: "12:00", end: "12:10" }, { code: "2", start: "15:00", end: "15:10" }];
  const env = { DB: db, SCHOOL_ID: school, LORD_SCHOOL_WHATSAPP_AGREEMENT: "true" };
  const setting = async (key, value, revision) => db.prepare(
    "INSERT INTO lord_settings VALUES(?,?,?,?) ON CONFLICT(school_id,setting_key) DO UPDATE SET revision=excluded.revision,value_json=excluded.value_json",
  ).bind(school, key, revision, JSON.stringify(value)).run();
  await setting("periodTimings", { periods }, 3);
  await setting("reminders", { enabled: true }, 3);
  await db.prepare("UPDATE lord_references SET observed_at=? WHERE school_id=? AND staff_id=?")
    .bind(nowDue - 1000, school, borrower.staffId).run();
  const seed = async (id, status = "BOOKED", code = 1, date = day, remaining = 0) => {
    await db.prepare("INSERT INTO lord_bookings(school_id,booking_id,staff_id,created_by,service_date,start_period,end_period,status,revision,details_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,'{}',?,?)")
      .bind(school, id, borrower.staffId, borrower.id, date, code, code + 1, status, nowDue, nowDue).run();
    if (remaining) await db.prepare("INSERT INTO lord_booking_items(school_id,booking_id,resource_id,quantity,collected_quantity,returned_quantity) VALUES(?,?,?,2,2,?)")
      .bind(school, id, "synthetic-reminder-cart", 2 - remaining).run();
  };
  const job = async (id, bookingId, kind, state, due, extra = {}) => db.prepare(
    "INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,state,due_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
  ).bind(school, id, "synthetic-old-" + id,
    kind === "fixed-return" ? "lord.return-reminder" : "lord.booking-notification",
    JSON.stringify({ schoolId: school, bookingId, staffId: borrower.staffId, revision: 1,
      ...(kind === "fixed-return" ? {} : { kind }), ...extra }), state, due, nowDue).run();
  const payload = (id, kind, revision = 1) => ({ schoolId: school, bookingId: id, kind, revision });
  const collection = { service_date: day, start_period: 1, end_period: 2, status: "BOOKED" };
  for (const [offset, state] of [[-300001, "suppressed"], [-300000, "ready"], [-1, "ready"], [0, "suppressed"]]) {
    assert.equal(reminderEligibility(collection, "collection", periods, {}, at + offset).state, state);
    assert.equal(reminderEligibility({ ...collection, status: "COLLECTED" }, "return", periods, {}, at + 10 * 60000 + offset, 1).state, state);
  }
  assert.equal(reminderEligibility(collection, "collection", periods, { enabled: 0 }, nowDue).reason, "REMINDERS_DISABLED");
  assert.equal(reminderPhase({}, "lord.return-reminder"), "return");
  // A non-due prefix larger than the bounded batch cannot hide a due booking.
  await db.batch(Array.from({ length: 101 }, (_, i) => db.prepare(
    "INSERT INTO lord_bookings(school_id,booking_id,staff_id,created_by,service_date,start_period,end_period,status,revision,details_json,created_at,updated_at) VALUES(?,?,?,?,?,2,3,'BOOKED',1,'{}',?,?)",
  ).bind(school, "synthetic-aaa-not-due-" + String(i).padStart(3, "0"), borrower.staffId, borrower.id, day, nowDue, nowDue)));
  await seed("synthetic-zzz-due");
  await seed("synthetic-other-date", "BOOKED", 1, "2030-01-21");
  await seed("synthetic-cancelled", "CANCELLED");
  await enqueueReminders(env, nowDue);
  assert.equal((await jobs("synthetic-zzz-due")).length, 2);
  assert.equal((await jobs("synthetic-other-date")).length, 0);
  assert.equal((await jobs("synthetic-cancelled")).length, 0);
  await Promise.all([enqueueReminders(env, nowDue), enqueueReminders(env, nowDue)]);
  assert.equal((await jobs("synthetic-zzz-due")).length, 2, "Concurrent/exact scheduling cannot duplicate jobs");
  assert.equal((await notificationIntent(env, payload("synthetic-zzz-due", "collection-reminder"), at)).reason, "REMINDER_WINDOW_EXPIRED");
  assert.equal((await notificationIntent(env, payload("synthetic-zzz-due", "collection-reminder"), at - 6 * 60000)).reason, "REMINDER_NOT_DUE");
  assert.equal((await notificationIntent(env, payload("synthetic-zzz-due", "collection-reminder", 2), nowDue)).reason, "BOOKING_REVISION_CHANGED");
  await setting("periodTimings", { periods }, 4);
  await enqueueReminders(env, nowDue);
  assert.equal((await jobs("synthetic-zzz-due")).length, 2, "A timing-setting revision with the same window cannot duplicate queued jobs");
  await seed("synthetic-timing-change");
  await enqueueReminders(env, nowDue);
  const originalTimingJobs = await jobs("synthetic-timing-change");
  assert.equal(originalTimingJobs.length, 2);
  const shifted = [{ code: "1", start: "12:01", end: "12:11" }, periods[1]];
  await setting("periodTimings", { periods: shifted }, 5);
  assert.equal((await notificationIntent(env, JSON.parse(originalTimingJobs[0].payload_json), nowDue)).reason, "REMINDER_WINDOW_CHANGED");
  await enqueueReminders(env, nowDue);
  assert.equal((await jobs("synthetic-timing-change")).length, 4, "Changed timing gets a fresh identity; old jobs remain bound to their original window");
  await setting("periodTimings", { periods }, 6);
  await setting("reminders", { enabled: false }, 4);
  assert.equal((await notificationIntent(env, payload("synthetic-zzz-due", "collection-reminder"), nowDue)).reason, "REMINDERS_DISABLED");
  assert.equal((await enqueueReminders(env, nowDue)).state, "disabled");
  await setting("reminders", { enabled: true }, 5);
  const returnNow = at + 8 * 60000;
  for (const [id, state, remaining] of [["synthetic-open", "COLLECTED", 1], ["synthetic-empty", "COLLECTED", 0], ["synthetic-returned", "RETURNED", 1], ["synthetic-declared", "DECLARED_RETURNED", 1], ["synthetic-closed", "CLOSED", 1]]) await seed(id, state, 1, day, remaining);
  await seed("synthetic-accessories", "COLLECTED");
  await db.prepare("INSERT INTO lord_accessories VALUES(?,?,'styluses',1,0)").bind(school, "synthetic-accessories").run();
  await job("synthetic-fixed-future", "synthetic-open", "fixed-return", "queued", at + 4 * 3600000);
  await enqueueReminders(env, returnNow);
  assert.equal((await jobs("synthetic-open")).length, 3, "An obsolete future16:00 job does not hide the correct five-minute reminder");
  assert.equal((await jobs("synthetic-accessories")).length, 2, "Remaining accessories count as physical custody");
  for (const id of ["synthetic-empty", "synthetic-returned", "synthetic-declared", "synthetic-closed"]) assert.equal((await jobs(id)).length, 0);
  const openPayload = payload("synthetic-open", "reminder");
  assert.equal((await notificationIntent(env, openPayload, returnNow)).kind, "reminder", "Existing return template key is preserved");
  assert.equal((await notificationIntent(env, openPayload, at + 4 * 3600000)).reason, "REMINDER_WINDOW_EXPIRED", "Legacy fixed16:00 job suppresses when expired");
  assert.equal((await notificationIntent(env, payload("synthetic-open", "overdue"), at + 40 * 60000)).reason, "REMINDER_WINDOW_EXPIRED", "Old late overdue job does not send outside the window");
  await db.prepare("UPDATE product_outbox SET state='accepted' WHERE school_id=? AND job_id LIKE 'lord:synthetic-open:%:email'").bind(school).run();
  await db.prepare("UPDATE product_outbox SET state='uncertain' WHERE school_id=? AND job_id LIKE 'lord:synthetic-open:%:whatsapp'").bind(school).run();
  const before = await jobs("synthetic-open");
  await db.prepare("UPDATE lord_bookings SET revision=2 WHERE school_id=? AND booking_id='synthetic-open'").bind(school).run();
  await enqueueReminders(env, returnNow);
  assert.deepEqual(await jobs("synthetic-open"), before, "Partial-return revision changes cannot duplicate accepted/uncertain reminder evidence");
  await db.prepare("UPDATE lord_accessories SET returned_quantity=1 WHERE school_id=? AND booking_id='synthetic-accessories'").bind(school).run();
  assert.equal((await notificationIntent(env, payload("synthetic-accessories", "reminder"), returnNow)).reason, "NO_REMAINING_CUSTODY");
  assert.equal((await notificationIntent(env, { ...payload("synthetic-open", "reminder", 2), reminderWindow: "synthetic-old-window" }, returnNow)).reason, "REMINDER_WINDOW_CHANGED");
  console.log("PASS real D1 exact-clock supplements: bounds, fair due filtering, custody, old jobs, settings, concurrent identity and accepted/uncertain replay");

  await suite.mf.dispose(); disposed = true;
  restarted = await startProduct({ output: join(suite.path, "product"), persistPath: join(suite.path, "state"),
    migrateSchemas: false, bindings: { GSIS_SECRET: suite.secret, SCHEDULER_OWNER: "v1", SEND_OWNER: "v0.9", LORD_SCHOOL_WHATSAPP_AGREEMENT: "true" } });
  const reopened = await restarted.db("lord");
  await enqueueReminders({ ...env, DB: reopened }, returnNow);
  assert.deepEqual((await reopened.prepare("SELECT * FROM product_outbox WHERE school_id=? AND json_extract(payload_json,'$.bookingId')='synthetic-open' ORDER BY job_id").bind(school).all()).results, before);
  console.log("PASS actual Worker restart: accepted/uncertain reminders and original provider history remain stable");
} finally {
  if (restarted) await restarted.close();
  if (!disposed) await suite.close();
  else await rm(suite.path, { recursive: true, force: true });
}
