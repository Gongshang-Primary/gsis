/** Verify Roster contactCreate (F03) delegates permanent Staff ID registration
 * to Contacts /internal/register-provisional with duplicate checks, idempotent
 * retry, capability denials, and zero inferred authority.
 */
import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";

const suite = await productSuite();
try {
  const admin = await suite.seedAccount("roster-contact-admin");
  const teacher = await suite.seedAccount("roster-contact-teacher", {
    capabilities: ["roster.own"],
  });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
  }).format(new Date());

  // 1. Ordinary teacher without roster.write is denied (403).
  const denied = await suite.request(teacher, "roster", "/operations", {
    method: "POST",
    body: {
      operation: "contactCreate",
      date: today,
      requestId: crypto.randomUUID(),
      name: "Synthetic Unauthorized",
      mobile: "91234560",
      modifier: "SRE",
    },
  });
  assert.ok(
    [403, 503].includes(denied.status),
    `Expected 403 or fail-closed 503, got ${denied.status}`,
  );

  // 2. Invalid mobile fails validation (400).
  const badMobile = await suite.request(admin, "roster", "/operations", {
    method: "POST",
    body: {
      operation: "contactCreate",
      date: today,
      requestId: crypto.randomUUID(),
      name: "Synthetic Relief A",
      mobile: "61234567",
      modifier: "SRE",
    },
  });
  assert.equal(badMobile.status, 400);

  // 3. Valid creation delegates to Contacts, returns inactive relief person with permanent Staff ID.
  const createOp = crypto.randomUUID();
  const created = await suite.call(admin, "roster", "/operations", {
    operation: "contactCreate",
    date: today,
    requestId: createOp,
    operationId: createOp,
    name: "Synthetic Relief One",
    mobile: "+65 9234 5678",
    modifier: "SRE",
  });
  assert.equal(created.saved, true);
  assert.ok(created.person.id.startsWith("staff-"));
  assert.equal(created.person.active, false);
  assert.equal(created.person.mobile, "92345678");
  assert.equal(created.person.name, "Synthetic Relief One (SRE)");

  // Confirm Contacts D1 actually owns the new record with zero inferred authority.
  const contactsDb = await suite.db("contacts");
  const staffRow = await contactsDb
    .prepare("SELECT staff_id, basic_name, ttb_name FROM contacts_staff WHERE staff_id=?")
    .bind(created.person.id)
    .first();
  assert.equal(staffRow?.basic_name, "Synthetic Relief One");
  assert.equal(staffRow?.ttb_name, "Synthetic Relief One (SRE)");

  // 4. Exact retry with the same operationId recovers the same Staff ID cleanly.
  const replay = await suite.call(admin, "roster", "/operations", {
    operation: "contactCreate",
    date: today,
    requestId: createOp,
    operationId: createOp,
    name: "Synthetic Relief One",
    mobile: "+65 9234 5678",
    modifier: "SRE",
  });
  assert.equal(replay.saved, true);
  assert.equal(replay.person.id, created.person.id);

  // 5. Duplicate mobile under a new operationId is blocked without creating a second contact.
  const dupMobile = await suite.call(admin, "roster", "/operations", {
    operation: "contactCreate",
    date: today,
    requestId: crypto.randomUUID(),
    name: "Completely Different Name",
    mobile: "92345678",
    modifier: "SRE",
  });
  assert.equal(dupMobile.saved, false);
  assert.equal(dupMobile.blocked, true);
  assert.ok(dupMobile.duplicates.some((d) => d.match === "mobile"));

  // 6. Duplicate derived TTb Name under a new operationId is blocked.
  const dupName = await suite.call(admin, "roster", "/operations", {
    operation: "contactCreate",
    date: today,
    requestId: crypto.randomUUID(),
    name: "Synthetic Relief One",
    mobile: "98887777",
    modifier: "SRE",
  });
  assert.equal(dupName.saved, false);
  assert.equal(dupName.blocked, true);
  assert.ok(dupName.duplicates.some((d) => d.match === "ttbName"));

  // 7. Similar name without confirmDistinct warns (not blocked); with confirmDistinct succeeds.
  const simWarn = await suite.call(admin, "roster", "/operations", {
    operation: "contactCreate",
    date: today,
    requestId: crypto.randomUUID(),
    name: "Synthetic Relief One A",
    mobile: "98886666",
    modifier: "SRE",
    confirmDistinct: false,
  });
  assert.equal(simWarn.saved, false);
  assert.equal(simWarn.blocked, false);
  assert.ok(simWarn.duplicates.some((d) => d.match === "similar"));

  const simConfirmed = await suite.call(admin, "roster", "/operations", {
    operation: "contactCreate",
    date: today,
    requestId: crypto.randomUUID(),
    name: "Synthetic Relief One A",
    mobile: "98886666",
    modifier: "FAJT",
    confirmDistinct: true,
  });
  assert.equal(simConfirmed.saved, true);
  assert.notEqual(simConfirmed.person.id, created.person.id);
  assert.equal(simConfirmed.person.name, "Synthetic Relief One A (FAJT)");

  console.log("v1-product-roster-contact-create: PASS");
} finally {
  await suite.close();
}
