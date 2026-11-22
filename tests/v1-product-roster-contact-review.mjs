/** v0.9 baseline (W1, owner 21 Nov 2026): a new inactive external relief contact
 * created in Roster queues one contact_review WhatsApp per current Contacts Power
 * User. Global Admin and ordinary staff are not recipients. A retry of the same
 * operation queues nothing new. Synthetic data; no provider send.
 */
import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";

const suite = await productSuite();
try {
  const admin = await suite.seedAccount("review-admin");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
  async function staff(op, name, mobile) {
    const created = await suite.call(admin, "contacts", "/staff/create", {
      operationId: op, basicName: name, employmentActive: true, schoolSection: "Primary", mobile,
    });
    return created.result?.staffId || created.staffId;
  }
  const powerA = await staff("review-pu-a", "Power User A", "91110001");
  const powerB = await staff("review-pu-b", "Power User B", "91110002");
  const ordinary = await staff("review-ordinary", "Ordinary Teacher", "91110003");
  await suite.seedAccount("review-pu-a", { staffId: powerA, capabilities: ["contacts.powerUser"] });
  await suite.seedAccount("review-pu-b", { staffId: powerB, capabilities: ["contacts.manage"] });
  await suite.seedAccount("review-ordinary", { staffId: ordinary, capabilities: ["roster.own"] });

  const op = "review-create-1";
  const created = await suite.call(admin, "roster", "/operations", {
    operation: "contactCreate", date: today, requestId: op, operationId: op,
    name: "Synthetic Relief Review", mobile: "92223333", modifier: "SRE",
  });
  assert.equal(created.saved, true);
  assert.equal(created.notificationsQueued, 2, "one review per current Contacts Power User");

  const roster = await suite.db("roster");
  const rows = (await roster.prepare("SELECT payload_json FROM product_outbox WHERE type='roster-notification'").all()).results
    .map((r) => JSON.parse(r.payload_json)).filter((j) => j.kind === "contact_review");
  assert.deepEqual(rows.map((j) => j.recipientId).sort(), [powerA, powerB].sort(), "only Power Users; no Global Admin, no ordinary staff");
  for (const j of rows) {
    assert.equal(j.data.templateKey, "contact_review");
    assert.equal(j.data.contact_review_details, "New inactive external relief contact: Synthetic Relief Review (SRE). Review permanent details in Contacts.");
    assert.equal(j.data.staffId, created.person.staffId);
    assert.equal(j.key, "contact-created:" + op + ":" + j.recipientId);
  }

  const replay = await suite.call(admin, "roster", "/operations", {
    operation: "contactCreate", date: today, requestId: op, operationId: op,
    name: "Synthetic Relief Review", mobile: "92223333", modifier: "SRE",
  });
  assert.equal(replay.saved, true);
  assert.equal(replay.person.staffId, created.person.staffId);
  assert.equal(replay.notificationsQueued, 2, "retry replays the original receipt");
  const after = (await roster.prepare("SELECT payload_json FROM product_outbox WHERE type='roster-notification'").all()).results
    .map((r) => JSON.parse(r.payload_json)).filter((j) => j.kind === "contact_review");
  assert.equal(after.length, 2, "retry queues nothing new");

  console.log("PASS Roster contact review: Power Users only, exact summary, idempotent retry; no provider send");
} finally {
  await suite.close();
}
