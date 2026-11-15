import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { fixture, seedScenario } from "./v1-product/roster-unblock-fixtures.mjs";
const f = await fixture();
try {
  const s = await seedScenario(f);
  await f.call(f.admin, "roster", "/upload", { ...s.payload, operationId: "synthetic-ui-baseline" });
  await f.call(f.admin, "deploy", "/versions/create", { operationId: "synthetic-ui-planning",
    name: "Synthetic planning", year: Number(s.date.slice(0, 4)), from: s.date, to: s.end });
  await f.call(f.admin, "roster", "/operations", { operation: "saveAbsence", date: s.date,
    revision: 0, operationId: "synthetic-ui-absence", staffId: s.staff[0], typeId: "mc", periods: [0] });
  const page = await f.pageFor();
  page.on("pageerror", error => console.error("Browser:", error));
  await page.getByRole("button", { name: /^Assign Relief/ }).click();
  await page.locator("[data-ops-date]").fill(s.date);
  await page.locator("[data-ops-date]").dispatchEvent("change");
  await page.locator("[data-roster-workload]").getByText(/Estimated workload/).waitFor();
  await page.locator(".v1-capacity").getByText("Estimated workload", { exact: true }).waitFor();
  assert.equal(await page.locator("[data-auto-fill-blanks]").isEnabled(), true);
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith("/api/roster/operations") && r.request().postDataJSON()?.operation === "autoAllocate"),
    page.locator("[data-auto-fill-blanks]").click(),
  ]);
  const request = f.requests.find(r => r.input?.operation === "autoAllocate");
  assert(request, "native allocation button dispatches to the Worker");
  assert.equal(request.status, 200, request.body);
  const result = JSON.parse(request.body).data;
  assert.equal(result.assigned, 1); assert.equal(result.workloadEvidence.quality, "estimated");
  assert.equal(result.exportContext.revision, result.revision);
  assert(result.allocationModel.teachers.every(t => !t.balance.quotaVerified));
  await page.waitForFunction(() => document.querySelector("[data-relief-excel]")?.disabled === false);
  for (const selector of ["[data-relief-excel]", "[data-daily-excel]"]) {
    const downloadPromise = page.waitForEvent("download");
    await page.locator(selector).first().click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /\.xlsx$/);
    const zip = await JSZip.loadAsync(await readFile(await download.path()));
    const xml = (await Promise.all(Object.values(zip.files).filter(file => !file.dir && /\.xml$/.test(file.name))
      .map(file => file.async("string")))).join("\n");
    assert.match(xml, /Estimated workload/, "actual native Excel download carries the estimate label");
  }
  await page.reload();
  await page.getByRole("button", { name: /^Assign Relief/ }).click();
  await page.locator("[data-ops-date]").fill(s.date);
  await page.locator("[data-ops-date]").dispatchEvent("change");
  await page.locator("[data-roster-workload]").getByText(/Estimated workload/).waitFor();
  assert.equal((await (await f.db("roster")).prepare("SELECT COUNT(*) n FROM roster_publications").first()).n, 0);
  console.log("PASS real built Assign Relief screen, native auto-fill, capacity label, two actual Excel downloads and reload over nine Workers/D1");
} catch (error) { console.error(f.requests.filter(r => r.status >= 400)); throw error; }
finally { await f.close(); }
