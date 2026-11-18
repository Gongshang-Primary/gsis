import assert from "node:assert/strict";
import { fixture } from "./v1-product/roster-unblock-fixtures.mjs";

// Actual built browser, gateway, Core/Contacts/Roster Workers and persistent
// local D1. Only synthetic staff are entered; no provider ownership is enabled.
const f = await fixture();
let closing = false;
try {
  const saved = await f.call(f.admin, "contacts", "/save-data", {
    operationId: "synthetic-duty-contact",
    changes: [],
    additions: ["Duty", "Ordinary"].map(label => ({ id: "synthetic-" + label, values: {
      "Basic Name": "Synthetic " + label + " Teacher",
      "Statutory Name": "Synthetic " + label + " Teacher",
      Role: "HOD", "EO Appt Level": "EO", Active: "Y",
      "School Section": "Primary", "Personnel Category": "Teaching",
      "Employment Arrangement": "Full-time", "Appointment Status": "Confirmed",
      "Profile Completion": "complete",
    } })),
  });
  const staffId = saved.mapping["synthetic-Duty"];
  for (const label of ["Duty", "Ordinary"])
    for (const field of ["smc", "eo", "schoolLeader"])
      await f.call(f.admin, "contacts", "/staff/" + saved.mapping["synthetic-" + label] + "/accept", {
        operationId: "synthetic-duty-accept-" + label + "-" + field,
        field, value: field === "eo" || field === "smc" && label === "Duty", revision: 0,
        ownerReviewReference: "Synthetic owner review",
      });
  const ordinary = await f.seedAccount("synthetic-duty-ordinary", {
    staffId: saved.mapping["synthetic-Ordinary"], capabilities: [],
  });
  const date = new Date(Date.now() + 28800000).toISOString().slice(0, 10);
  const db = await f.db("roster");
  const view = () => f.call(f.admin, "roster", "/operations", {
    operation: "dutyRoster", date,
  });
  const records = async () => (await db.prepare(
    "SELECT collection,record_id,revision,payload_json FROM roster_records WHERE collection IN ('smcDutyLists','smcDutyRoster') ORDER BY collection,record_id",
  ).all()).results;
  const page = await f.pageFor(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  async function openDuty() {
    await page.getByRole("button", { name: /^SMC Duty Roster/ }).click();
    await page.locator("[data-duty-new]:enabled").waitFor();
  }
  async function saveForm() {
    const response = page.waitForResponse(r =>
      r.url().endsWith("/api/roster/operations") &&
      r.request().postDataJSON()?.operation === "setDutySMC");
    await page.getByRole("button", { name: "Save duty list", exact: true }).click();
    const received = await response;
    assert.equal(received.status(), 200);
    await page.locator("[data-duty-message]").filter({ hasText: "Duty list saved." }).waitFor();
    return (await received.json()).data;
  }
  const row = name => page.locator(".ops-record-table tbody tr").filter({ hasText: name });

  await openDuty();
  await page.locator("[data-duty-new]").click();
  await page.getByLabel("Duty list name", { exact: true }).fill("Synthetic duty list");
  await page.locator('[name="staffIds"][value="' + staffId + '"]').check();
  const created = await saveForm();
  const createInput = structuredClone(f.requests.find(r => r.input?.operation === "setDutySMC").input);
  const durableCreated = await view();
  assert.equal(durableCreated.lists.length, 1, "The owner saved one list before checking its immediate display.");
  assert.equal((await records()).length, 2, "The list and current-day membership both persisted.");
  assert.equal(await row("Synthetic duty list").count(), 1,
    "A successful save must display its accepted list without refresh.");
  assert.equal(created.available, true);
  assert.equal(created.lists[0].name, "Synthetic duty list");
  assert.equal(created.people[0].id, staffId);
  assert.equal(created.revision, durableCreated.revision);
  assert.equal(created.acceptedRevision, created.revision);
  assert.equal(created.receipt.state, "committed");
  assert.equal(await page.locator("[data-duty-new]").isEnabled(), true);
  const listId = created.savedIds[0];
  console.log("PASS duty save: committed list, accepted view and usable controls remain visible immediately.");

  await row("Synthetic duty list").getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Duty list name", { exact: true }).fill("Synthetic renamed duty");
  const edited = await saveForm();
  assert.equal(await row("Synthetic renamed duty").count(), 1);
  assert.equal(edited.lists[0].id, listId);
  assert.equal(edited.lists[0].version, 2);
  assert.equal(edited.revision, created.revision + 1);
  await page.reload();
  await openDuty();
  assert.equal(await row("Synthetic renamed duty").count(), 1);
  const beforeReplay = await records();
  assert.deepEqual(await f.call(f.admin, "roster", "/operations", createInput), created,
    "Exact replay returns the original accepted view, not a newer read.");
  assert.deepEqual(await records(), beforeReplay);
  console.log("PASS duty save: edit/reload and original immutable receipt replay preserve the accepted revisions.");

  const rejected = async (user, body, status) => {
    const before = await records();
    const response = await f.request(user, "roster", "/operations", { method: "POST", body });
    assert.equal(response.status, status, JSON.stringify(response.body));
    assert.deepEqual(await records(), before, "A rejected request cannot change duty lists or membership.");
    return response;
  };
  const change = { operation: "setDutySMC", view: "dutyRoster", date,
    action: "save", listId, listVersion: 2, name: "Rejected duty change",
    startDate: date, endDate: date, staffIds: [staffId], revision: edited.revision };
  await rejected(f.admin, { ...change, revision: created.revision, operationId: "synthetic-duty-stale" }, 409);
  const changedIntent = await rejected(f.admin, { ...createInput, name: "Changed original intent" }, 409);
  assert.equal(changedIntent.body.error.code, "OPERATION_INTENT_CONFLICT");
  await rejected(ordinary, { ...change, operationId: "synthetic-duty-unauthorized" }, 403);
  console.log("PASS duty save: stale revision, changed operation intent and unauthorized user are rejected without writes.");

  let lostInput, lostResult, loseNext = true;
  await page.route("**/api/roster/operations", async route => {
    if (closing) return route.abort();
    const request = route.request(), input = request.postDataJSON();
    if (!loseNext || input?.operation !== "setDutySMC") return route.fallback();
    loseNext = false;
    lostInput = structuredClone(input);
    const response = await f.mf.dispatchFetch(request.url(), {
      method: request.method(), headers: await request.allHeaders(), body: request.postDataBuffer(),
    });
    assert.equal(response.status, 200);
    lostResult = (await response.json()).data;
    await route.fulfill({ status: 503, contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { code: "SYNTHETIC_RESPONSE_LOST", message: "Synthetic response lost after commit." } }) });
  });
  await row("Synthetic renamed duty").getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Duty list name", { exact: true }).fill("Synthetic recovered duty");
  await page.getByRole("button", { name: "Save duty list", exact: true }).click();
  await page.getByRole("button", { name: "Retry the same save", exact: true }).waitFor();
  assert.equal((await view()).lists[0].name, "Synthetic recovered duty");
  const afterLost = await records();
  await page.getByRole("button", { name: "Retry the same save", exact: true }).click();
  await page.locator("[data-duty-message]").filter({ hasText: "Duty list saved." }).waitFor();
  assert.equal(await row("Synthetic recovered duty").count(), 1);
  const retried = f.requests.filter(r => r.input?.operation === "setDutySMC").at(-1);
  assert.deepEqual(retried.input, lostInput, "The browser retries the exact original command.");
  assert.deepEqual(JSON.parse(retried.body).data, lostResult);
  assert.deepEqual(await records(), afterLost);
  assert.equal(lostResult.lists[0].version, 3);
  console.log("PASS duty save: lost response after commit recovers the same view without another write.");

  await row("Synthetic recovered duty").getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete duty list", exact: true }).click();
  await page.locator("[data-duty-message]").filter({ hasText: "Duty list deleted." }).waitFor();
  assert.equal(await row("Synthetic recovered duty").count(), 0);
  await page.locator("[data-duty-history]").check();
  assert.match(await row("Synthetic recovered duty").innerText(), /Deleted/);
  const deleted = await view();
  assert.equal(deleted.lists[0].status, "Deleted");
  assert.equal(deleted.lists[0].version, 4);
  assert.equal((await records()).filter(r => r.collection === "smcDutyRoster").length, 0);
  await page.reload();
  await openDuty();
  await page.locator("[data-duty-history]").check();
  assert.match(await row("Synthetic recovered duty").innerText(), /Deleted/);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM product_outbox").first()).n, 0);
  assert.deepEqual(errors, []);
  console.log("PASS duty save: delete updates immediately, retained history reloads and no notification job is created.");
} catch (error) {
  console.error(f.requests.filter(r => r.status >= 400));
  throw error;
} finally {
  closing = true;
  await f.close();
}
