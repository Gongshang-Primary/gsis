import assert from "node:assert/strict";
import { fixture, futureDate, browserOperation, ok, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";

// The built browser transport dispatches to all real local Workers and D1.
const f = await fixture(), date = futureDate();
try {
  const page = await f.pageFor();
  const grant = ok(await browserOperation(page, { operation: "acquireStaplerLock", date,
    operationId: "synthetic-lock-acquire", leaseSessionId: "synthetic-editor", staplerRevision: 0 }));
  assert.equal(grant.lock.mine, true);
  assert.equal(grant.lock.active, true);
  assert.equal(grant.lock.fence, 1);
  const db = await f.db("roster");
  assert.equal((await db.prepare("SELECT fence FROM roster_leases WHERE school_id=? AND service_date=?")
    .bind(schoolId, date).first()).fence, 1);
  const release = ok(await browserOperation(page, { operation: "releaseStaplerLock", date,
    operationId: "synthetic-lock-release", leaseSessionId: "synthetic-editor", leaseFence: grant.lock.fence }));
  assert.equal(release.lock.active, false);
  assert(f.requests.some(r => r.input?.operation === "acquireStaplerLock" && r.status === 200));
  assert(f.requests.some(r => r.input?.operation === "releaseStaplerLock" && r.status === 200));
  await page.getByRole("button", { name: /^Stapler/ }).click();
  await page.getByRole("button", { name: "Create blank standalone plan" }).waitFor();
  await page.locator("input[type=date]").first().fill(date);
  await page.getByRole("button", { name: "Create blank standalone plan" }).click();
  await page.locator("dialog input[name=name]").fill("Synthetic planner");
  await page.locator("dialog input[name=start]").fill("09:00");
  await page.locator("dialog input[name=end]").fill("09:30");
  await page.locator("dialog input[name=endOfDay]").fill("09:30");
  await page.getByRole("button", { name: "Create standalone plan", exact: true }).click();
  await page.getByRole("button", { name: "Suspension dates", exact: true }).click();
  await page.getByRole("button", { name: "Rename", exact: true }).waitFor();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.locator("dialog input[name=name]").fill("Synthetic renamed planner");
  await page.locator("dialog").getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByText("Plan name saved.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Open planner", exact: true }).click();
  await page.getByRole("button", { name: "Add ad-hoc class", exact: true }).click();
  await page.locator("dialog input[name=name]").fill("Synthetic Class");
  await page.locator("dialog").getByRole("button", { name: "Add ad-hoc class", exact: true }).click();
  await page.getByRole("button", { name: "Save to online", exact: true }).click();
  await page.getByText("Draft saved. Confirm when ready for automatic allocation.", { exact: true }).waitFor();
  const saved = f.requests.filter(r => r.input?.operation === "saveStapler").at(-1);
  assert.equal(saved.status, 200, saved.body);
  assert(saved.input.leaseFence > 0);
  assert(saved.input.leaseSessionId.startsWith("save-"));
  const result = JSON.parse(saved.body).data;
  assert(result.plan.classes.some(c => c.name === "Synthetic Class"));
  await page.reload();
  // Reconstruct exactly the request retained by the native draft before lease
  // preparation. An expired/released lock must not create a replacement save.
  const original = { ...saved.input };
  delete original.operationId; delete original.leaseFence; delete original.leaseSessionId;
  const replay = ok(await browserOperation(page, original));
  assert.equal(replay.receipt.operationId, saved.input.operationId);
  assert.equal(replay.revision, result.revision);
  const current = ok(await browserOperation(page, { operation: "stapler", date: saved.input.date }));
  assert.equal(current.staplerRevision, result.staplerRevision);
  assert.equal((await db.prepare("SELECT expires_at FROM roster_leases WHERE school_id=? AND service_date=?")
    .bind(schoolId, saved.input.date).first()).expires_at < Date.now(), true);
  const duty = ok(await browserOperation(page, { operation: "currentDuty" }));
  assert.equal(duty.available, true); assert.deepEqual(duty.people, []);
  console.log("PASS real built browser / Worker / D1 Stapler lock and native rename");
} catch (error) { console.error(error); throw error; } finally { await f.close(); }
