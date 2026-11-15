import assert from "node:assert/strict";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
const f = await fixture();
try {
  const label = "Synthetic Room A / Synthetic Room B", s = await seedScenario(f, { roomLabel: label });
  s.model.single.blocks[0].name = "Synthetic bridge label";
  s.model.single.blocks[1].name = "Synthetic unresolved label";
  await (await f.db("roster")).prepare("INSERT INTO roster_records(school_id,collection,record_id,revision,payload_json) VALUES(?,'nameBridges','synthetic-link',1,?)")
    .bind(schoolId, JSON.stringify({ kind: "array", data: { timetableName: "Synthetic bridge label", staffId: s.staff[0] } })).run();
  const page = await f.pageFor();
  async function openMapping() {
    await page.evaluate(model => { window.mappingResult = null;
      window.mappingPromise = GSISV1RosterMapping(model).then(value => { window.mappingResult = value; })
        .catch(error => { window.mappingError = error.message; }); }, s.model);
    await page.getByRole("heading", { name: "Confirm timetable identities" }).waitFor();
  }
  await openMapping();
  assert.equal(await page.locator('select[aria-label^="Teachers:"]').count(), 1,
    "exact saved bridge auto-matches; only unresolved labels ask for a choice");
  await page.getByLabel("Teachers: Synthetic unresolved label", { exact: true }).selectOption(s.staff[1]);
  await page.getByLabel("Venues: " + label, { exact: true }).selectOption(["synthetic-room-a", "synthetic-room-b"]);
  await page.getByRole("button", { name: "Confirm identity mapping", exact: true }).click();
  let mapping = await page.evaluate(() => window.mappingResult);
  assert.equal(mapping.staffMapping["Synthetic bridge label"], s.staff[0]);
  const send = body => page.evaluate(async body => {
    try { return { ok: true, data: await GSISV1.request("roster", "/upload", { method: "POST", body }) }; }
    catch (error) { return { ok: false, code: error.code, status: error.status }; }
  }, body);
  const failed = await send({ ...s.payload, ...mapping, revision: 99, operationId: "synthetic-browser-rejected" });
  assert.equal(failed.status, 409);
  await page.reload();
  await page.waitForFunction(() => !!window.GSISV1RosterMapping);
  await openMapping();
  assert.equal(await page.locator('select[aria-label^="Teachers:"]').count(), 0);
  assert.deepEqual(await page.getByLabel("Venues: " + label, { exact: true })
    .evaluate(select => [...select.selectedOptions].map(o => o.value)), ["synthetic-room-a", "synthetic-room-b"]);
  await page.getByRole("button", { name: "Confirm identity mapping", exact: true }).click();
  mapping = await page.evaluate(() => window.mappingResult);
  const saved = await send({ ...s.payload, ...mapping, operationId: "synthetic-browser-baseline" });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(saved.data.receipt.state, "committed");
  assert(saved.data.entries.some(e => e.id === saved.data.savedId));
  await openMapping();
  await page.getByLabel("Keep unmapped: " + label, { exact: true }).check();
  await page.getByRole("button", { name: "Confirm identity mapping", exact: true }).click();
  mapping = await page.evaluate(() => window.mappingResult);
  const unmapped = await send({ ...s.payload, ...mapping, id: saved.data.id, revision: saved.data.revision,
    operationId: "synthetic-browser-unmapped" });
  assert.equal(unmapped.ok, true, JSON.stringify(unmapped));
  assert.deepEqual(unmapped.data.unmappedVenueLabels, [label]);
  assert.equal(unmapped.data.occupancyComplete, false);
  const loaded = await f.call(f.admin, "roster", "/read", { id: saved.data.id });
  assert.equal(loaded.model.single.blocks[0].cells[0][2], label);
  assert.equal(loaded.selected.occupancyComplete, false);
  await page.reload();
  await page.getByRole("button", { name: /^Baseline Timetable/ }).click();
  await page.locator("[data-roster-mapping-warning]").getByText(/Venue occupancy is incomplete/).waitFor();
  await openMapping();
  await page.evaluate(() => GSISV1.clearProtectedState());
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(await page.locator("[data-roster-mapping-warning]").count(), 0);
  await openMapping();
  assert.equal(await page.locator('select[aria-label^="Teachers:"]').count(), 1,
    "access reset clears in-memory choices as well as browser storage");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  console.log("PASS real built mapping modal / nine Workers / D1: exact bridge, unresolved-only selection, multiple rooms, failed-save reload and flagged unmapped labels");
} catch (error) { console.error(error); throw error; } finally { await f.close(); }
