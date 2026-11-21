/** Isolated Workers/D1 verification for PR 20 (CI01, C12-C14):
 * 1. Roster statisticsCalendar queries Calendar /internal/year-structure and returns
 *    authoritative Term (T1-T4) and Semester (S1, S2) presets without guessing dates.
 * 2. Roster adHocUpdateMobile (and contactCreate with existingStaffId) updates ONLY
 *    mobile on an existing Contacts teacher via Contacts /internal/update-mobile,
 *    preserving Basic Name and TTb Name as read-only, enforcing mandatory SG mobile
 *    validation and duplicate-mobile rejection, and replaying idempotently. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { productSuite } from "./v1-product/suite.mjs";

const require = createRequire(import.meta.url);
const GSISRosterStatistics = require("../roster-update/public/roster-statistics.js");

const schoolId = "synthetic-school";
const suite = await productSuite();
try {
  const admin = await suite.seedAccount("roster-stats-admin", {
    capabilities: ["admin", "roster.read", "roster.write", "roster.admin", "contacts.manage"],
  });
  const reader = await suite.seedAccount("roster-stats-reader", {
    capabilities: ["roster.read"],
  });

  // 1. statisticsCalendar with no Calendar yearStructure returns empty terms/semesters (no guessed dates)
  const emptyCal = await suite.call(admin, "roster", "/operations", {
    operation: "statisticsCalendar",
    year: 2026,
  });
  assert.deepEqual(emptyCal.terms, []);
  assert.deepEqual(emptyCal.semesters, []);
  assert.match(emptyCal.basis, /unavailable/i);
  assert.equal(GSISRosterStatistics.preset("term", "2026-10-15", emptyCal), null);
  assert.equal(GSISRosterStatistics.preset("semester", "2026-10-15", emptyCal), null);
  console.log("PASS statisticsCalendar returns empty terms/semesters without guessing when Calendar yearStructure is absent");

  // Seed Calendar yearStructure TERM_WEEK rows for 2026 T1..T4
  const calDb = await suite.db("calendar");
  const termWeeks = [
    ["2026-t1-w1", 2026, { Kind: "TERM_WEEK", Term: 1, Week: 1, StartDate: "2026-01-02", EndDate: "2026-01-09" }],
    ["2026-t1-w10", 2026, { Kind: "TERM_WEEK", Term: 1, Week: 10, StartDate: "2026-03-09", EndDate: "2026-03-13" }],
    ["2026-t2-w1", 2026, { Kind: "TERM_WEEK", Term: 2, Week: 1, StartDate: "2026-03-23", EndDate: "2026-03-27" }],
    ["2026-t2-w10", 2026, { Kind: "TERM_WEEK", Term: 2, Week: 10, StartDate: "2026-05-25", EndDate: "2026-05-29" }],
    ["2026-t3-w1", 2026, { Kind: "TERM_WEEK", Term: 3, Week: 1, StartDate: "2026-06-29", EndDate: "2026-07-03" }],
    ["2026-t3-w10", 2026, { Kind: "TERM_WEEK", Term: 3, Week: 10, StartDate: "2026-08-31", EndDate: "2026-09-04" }],
    ["2026-t4-w1", 2026, { Kind: "TERM_WEEK", Term: 4, Week: 1, StartDate: "2026-09-14", EndDate: "2026-09-18" }],
    ["2026-t4-w10", 2026, { Kind: "TERM_WEEK", Term: 4, Week: 10, StartDate: "2026-11-16", EndDate: "2026-11-20" }],
  ];
  for (const [id, y, obj] of termWeeks) {
    await calDb
      .prepare(
        "INSERT INTO calendar_metadata(school_id,kind,year,record_id,revision,data_json) VALUES(?,'yearStructure',?,?,1,?)",
      )
      .bind(schoolId, y, id, JSON.stringify(obj))
      .run();
  }

  const cal = await suite.call(admin, "roster", "/operations", {
    operation: "statisticsCalendar",
    year: 2026,
  });
  assert.equal(cal.terms.length, 4);
  assert.deepEqual(
    cal.terms.map((t) => [t.label, t.from, t.to]),
    [
      ["T1", "2026-01-02", "2026-03-13"],
      ["T2", "2026-03-23", "2026-05-29"],
      ["T3", "2026-06-29", "2026-09-04"],
      ["T4", "2026-09-14", "2026-11-20"],
    ],
  );
  assert.deepEqual(
    cal.semesters.map((s) => [s.label, s.from, s.to]),
    [
      ["S1", "2026-01-02", "2026-05-29"],
      ["S2", "2026-06-29", "2026-11-20"],
    ],
  );
  assert.deepEqual(GSISRosterStatistics.preset("term", "2026-10-15", cal), {
    from: "2026-06-29",
    to: "2026-09-04",
  });
  assert.deepEqual(GSISRosterStatistics.preset("semester", "2026-10-15", cal), {
    from: "2026-01-02",
    to: "2026-05-29",
  });
  console.log("PASS statisticsCalendar derives authoritative Term (T1-T4) and Semester (S1, S2) presets from Calendar yearStructure");

  // 2. Ad Hoc Relief existing teacher mobile update (C12-C14)
  const t1 = await suite.call(admin, "contacts", "/staff/create", {
    operationId: "seed-adhoc-t1",
    basicName: "Tan Relief Alpha",
    employmentTags: ["SRE"],
  });
  const t2 = await suite.call(admin, "contacts", "/staff/create", {
    operationId: "seed-adhoc-t2",
    basicName: "Lim Relief Beta",
    mobile: "91112222",
    employmentTags: ["SRE"],
  });
  const t1Id = t1.result?.staffId || t1.staffId;
  const t2Id = t2.result?.staffId || t2.staffId;
  assert.ok(t1Id);
  assert.ok(t2Id);

  // Blank/invalid mobile rejected (mandatory mobile gate)
  const badMobile = await suite.request(admin, "roster", "/operations", {
    method: "POST",
    body: {
      operation: "adHocUpdateMobile",
      operationId: "mob-bad-1",
      staffId: t1Id,
      mobile: "1234",
      date: "2026-11-23",
    },
  });
  assert.equal(badMobile.status, 400);

  // Duplicate mobile belonging to another teacher rejected
  const dupMobile = await suite.request(admin, "roster", "/operations", {
    method: "POST",
    body: {
      operation: "adHocUpdateMobile",
      operationId: "mob-dup-1",
      staffId: t1Id,
      mobile: "91112222",
      date: "2026-11-23",
    },
  });
  assert.equal(dupMobile.status, 409);
  assert.equal(dupMobile.body.error.code, "DUPLICATE_MOBILE");

  // Unauthorized roster.read-only caller denied
  const denied = await suite.request(reader, "roster", "/operations", {
    method: "POST",
    body: {
      operation: "adHocUpdateMobile",
      operationId: "mob-denied-1",
      staffId: t1Id,
      mobile: "98887777",
      date: "2026-11-23",
    },
  });
  assert.ok([403, 503].includes(denied.status), `Expected 403 or 503, got ${denied.status}`);

  // Valid mobile update commits via Contacts /internal/update-mobile, preserves basic_name & ttb_name
  const ok = await suite.call(admin, "roster", "/operations", {
    operation: "adHocUpdateMobile",
    operationId: "mob-ok-1",
    staffId: t1Id,
    mobile: "+65 9888 7777",
    basicName: "Attempted Overwrite Name",
    date: "2026-11-23",
  });
  assert.equal(ok.saved, true);
  assert.equal(ok.person.staffId, t1Id);
  assert.equal(ok.person.mobile, "98887777");

  // Verify Contacts D1 updated mobile ONLY while preserving basic_name and ttb_name
  const contactsDb = await suite.db("contacts");
  const staffRow = await contactsDb
    .prepare("SELECT basic_name, ttb_name FROM contacts_staff WHERE school_id=? AND staff_id=?")
    .bind(schoolId, t1Id)
    .first();
  assert.equal(staffRow.basic_name, "Tan Relief Alpha");
  assert.match(staffRow.ttb_name, /Tan Relief Alpha/);
  const mobileRow = await contactsDb
    .prepare("SELECT value_json FROM contacts_fields WHERE school_id=? AND staff_id=? AND field='mobile'")
    .bind(schoolId, t1Id)
    .first();
  assert.equal(JSON.parse(mobileRow.value_json), "98887777");

  // Idempotent retry with same operationId succeeds without conflict
  const replay = await suite.call(admin, "roster", "/operations", {
    operation: "adHocUpdateMobile",
    operationId: "mob-ok-1",
    staffId: t1Id,
    mobile: "+65 9888 7777",
    basicName: "Attempted Overwrite Name",
    date: "2026-11-23",
  });
  assert.equal(replay.saved, true);
  assert.equal(replay.person.mobile, "98887777");

  // contactCreate with existingStaffId also updates mobile cleanly
  const viaCreate = await suite.call(admin, "roster", "/operations", {
    operation: "contactCreate",
    operationId: "mob-ok-2",
    existingStaffId: t1Id,
    mobile: "87776666",
    date: "2026-11-23",
  });
  assert.equal(viaCreate.saved, true);
  assert.equal(viaCreate.person.mobile, "87776666");
  const mobileRow2 = await contactsDb
    .prepare("SELECT value_json FROM contacts_fields WHERE school_id=? AND staff_id=? AND field='mobile'")
    .bind(schoolId, t1Id)
    .first();
  assert.equal(JSON.parse(mobileRow2.value_json), "87776666");
  console.log("PASS Roster adHocUpdateMobile enforces mandatory mobile gate, rejects duplicates/unauthorized callers, writes back to Contacts read-only-preserving Basic/TTb Name, and replays idempotently");
} finally {
  await suite.close();
}
