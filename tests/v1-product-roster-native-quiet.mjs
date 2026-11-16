import assert from "node:assert/strict";
import { fixture, seedScenario } from "./v1-product/roster-unblock-fixtures.mjs";

// Native browser -> built web/Workers -> local owner D1. No provider access.
const f = await fixture();
try {
  const s = await seedScenario(f);
  await f.call(f.admin, "roster", "/upload", { ...s.payload, operationId: "synthetic-quiet-baseline" });
  await f.call(f.admin, "deploy", "/versions/create", { operationId: "synthetic-quiet-planning",
    name: "Synthetic planning", year: Number(s.date.slice(0, 4)), from: s.date, to: s.end });
  await f.call(f.admin, "roster", "/operations", { operation: "saveAbsence", date: s.date,
    revision: 0, operationId: "synthetic-quiet-absence", staffId: s.staff[0], typeId: "mc", periods: [0] });
  const page = await f.pageFor(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  async function openAllocation() {
    await page.getByRole("button", { name: /^Assign Relief/ }).click();
    await page.locator("[data-ops-date]").fill(s.date);
    await page.locator("[data-ops-date]").dispatchEvent("change");
    await page.locator("[data-roster-workload]").getByText(/Estimated workload/).waitFor();
    // The workload event precedes the asynchronous toolbar render.
    await page.getByRole("button", { name: "Let teachers see", exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Send WhatsApp to all affected", exact: true }).waitFor({ state: "visible" });
  }
  await openAllocation();
  assert.equal(await page.locator("[data-quiet-toggle], [data-quiet-note]").count(), 0,
    "native D1 Assign Relief must not render the obsolete quiet-mode control");
  assert.equal(await page.getByRole("button", { name: "Let teachers see", exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "Send WhatsApp to all affected", exact: true }).count(), 1);
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith("/api/roster/operations") && r.request().postDataJSON()?.operation === "autoAllocate"),
    page.locator("[data-auto-fill-blanks]").click(),
  ]);
  const request = f.requests.find(r => r.input?.operation === "autoAllocate");
  assert.equal(request.status, 200, request.body);
  const result = JSON.parse(request.body).data;
  assert.equal(result.assigned, 1);
  assert.equal(result.receipt.state, "committed");
  const db = await f.db("roster");
  const before = await db.prepare("SELECT record_id,payload_json FROM roster_records WHERE collection='assignments' ORDER BY record_id").all();
  assert.equal(before.results.length, 1, "native allocation has one durable assignment");
  await page.reload();
  await openAllocation();
  assert.equal(await page.locator("[data-quiet-toggle], [data-quiet-note]").count(), 0);
  assert.deepEqual((await db.prepare("SELECT record_id,payload_json FROM roster_records WHERE collection='assignments' ORDER BY record_id").all()).results,
    before.results, "reload does not change the saved allocation");
  assert.deepEqual(f.requests.filter(r => new URL(r.url).pathname.endsWith("/quiet-mode")), [],
    "no quiet-mode read, write or refresh is dispatched");
  assert.deepEqual(errors, []);
  assert.equal((await f.request(null, "roster", "/operations", {
    method: "POST", body: { operation: "autoAllocate", date: s.date, revision: result.revision },
  })).status, 401, "removing the control does not bypass authentication");
  console.log("PASS F08: no quiet control/request; native allocation receipt, D1 persistence and reload; authentication intact");
} catch (error) {
  console.error("Quiet requests:", f.requests.filter(r => r.url.includes("/quiet-mode")).map(r => ({ status: r.status, url: r.url })));
  throw error;
} finally { await f.close(); }
