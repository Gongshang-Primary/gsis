import assert from "node:assert/strict";
import JSZip from "jszip";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { abortOperation, operationStatus } from "../v1/runtime/store.mjs";
import { loadVersion } from "../v1/services/deploy/service.mjs";
import { encodeWorkbook } from "../v1/web/shared/workbooks.mjs";

// Real built UI, gateway/owner Workers and isolated D1. All identities/data are
// synthetic. No live provider call or hosted UAT is represented by this test.
const started = Date.now();
const f = await fixture();
try {
  const s = await seedScenario(f), db = await f.db("deploy");
  const person = (await f.request(f.admin, "contacts", "/staff/" + s.staff[0])).body.data;
  await f.call(f.admin, "contacts", "/staff/" + s.staff[0] + "/update", {
    operationId: "synthetic-membership-seed", changes: { memberships: ["Original synthetic team"] },
    fieldRevisions: { memberships: person.fields.memberships?.revision || 0 },
  });
  const { versionId } = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-membership-plan", name: "Synthetic membership plan", year: 2026,
  });
  const saved = async () => (await loadVersion(db, schoolId, versionId)).doc;
  const member = (doc, index) => doc.teachers.find(t => t.id === s.staff[index]).deploymentTags;
  assert.deepEqual(member(await saved(), 0).Memberships, ["Original synthetic team"]);
  assert(!Object.hasOwn(member(await saved(), 1), "Memberships"));
  const page = await f.pageFor(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + "/deploy/");
  await page.getByRole("button", { name: "HR Settings", exact: true }).click();
  await page.getByRole("button", { name: "Membership", exact: true }).click();
  const input = index => page.locator('[data-memberships-teacher="' + s.staff[index] + '"] textarea');
  assert.equal(await input(0).inputValue(), "Original synthetic team");
  await input(1).focus(); await input(1).blur();
  assert.equal(await page.evaluate(() => queuedEdits().length), 0, "untouched unknown never becomes an empty list");
  await input(0).fill("Planning, Support"); await input(0).blur();
  assert.equal(await page.evaluate(() => queuedEdits().length), 0, "reserved separators are rejected, never silently split");
  assert.match(await page.locator('[data-memberships-teacher="' + s.staff[0] + '"]').innerText(), /Commas and semicolons/);
  await input(0).fill("Synthetic Alpha\nResearch & Support"); await input(0).blur();
  await page.locator("#saveQueue").getByRole("button", { name: "Save to online", exact: true }).click();
  await page.waitForFunction(() => !queuedEdits().length && !queueFlight);
  assert.deepEqual(member(await saved(), 0).Memberships, ["Synthetic Alpha", "Research & Support"]);
  assert(!Object.hasOwn(member(await saved(), 1), "Memberships"));
  await page.reload();
  await page.getByRole("button", { name: "HR Settings", exact: true }).click();
  await page.getByRole("button", { name: "Membership", exact: true }).click();
  assert.equal(await input(0).inputValue(), "Synthetic Alpha\nResearch & Support");
  await page.locator('[data-memberships-teacher="' + s.staff[1] + '"]').getByRole("button", { name: /Clear memberships/ }).click();
  await page.locator("#saveQueue").getByRole("button", { name: "Save to online", exact: true }).click();
  await page.waitForFunction(() => !queuedEdits().length && !queueFlight);
  assert.deepEqual(member(await saved(), 1).Memberships, []);
  const book = await f.call(f.admin, "deploy", "/export", { versionId, scope: "Membership" });
  const first = book.sheets.Membership.rows.find(r => r[0] === s.staff[0]);
  assert.equal(first[3], "Synthetic Alpha\nResearch & Support");
  first[3] = "Imported synthetic team\nLearning & Wellbeing";
  const bytes = await encodeWorkbook(book, { Zip: JSZip });
  await page.locator('[data-panel-id="deploy-publication"] [data-import]').setInputFiles({
    name: "synthetic-memberships.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(bytes),
  });
  const dialog = page.getByRole("dialog", { name: "Import Deploy workbook" });
  try { await dialog.getByRole("button", { name: "Confirm atomic replacement", exact: true }).click(); }
  catch (error) { throw Error(error.message + "\nImport UI: " + await dialog.innerText() + "\nRequests: " + JSON.stringify(f.requests.slice(-4).map(r => ({ url: r.url, status: r.status, error: JSON.parse(r.body).error })))); }
  await dialog.getByRole("status").filter({ hasText: "Draft replacement committed" }).waitFor();
  assert.deepEqual(member(await saved(), 0).Memberships, ["Imported synthetic team", "Learning & Wellbeing"]);
  assert.deepEqual(member(await saved(), 1).Memberships, []);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForFunction(() => !refreshing);
  // Force a real cross-owner partial outcome: Contacts commits, then the
  // Deploy acknowledgement transaction fails. Its prepared/unknown receipt
  // must retain the exact original progress request and source publication.
  await db.prepare("CREATE TRIGGER synthetic_membership_finish_failure BEFORE INSERT ON deploy_deliveries WHEN NEW.recipient='contacts-memberships' BEGIN SELECT RAISE(ABORT, 'synthetic finish conflict'); END").run();
  let loseAcknowledgement = false;
  await page.route("**/api/deploy/memberships/sync", async route => {
    if (!loseAcknowledgement) return route.fallback();
    const request = route.request();
    const response = await f.mf.dispatchFetch(request.url(), {
      method: request.method(), headers: await request.allHeaders(), body: request.postDataBuffer(),
    });
    const body = await response.text();
    f.requests.push({ url: request.url(), input: request.postDataJSON(), status: response.status, body });
    if (response.ok) {
      loseAcknowledgement = false;
      await route.abort("failed");
    } else await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
  });
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await page.locator('[data-version-row="' + versionId + '"] [data-version-action="publish"]').click();
  const publish = page.locator("dialog[data-publication-dialog]");
  await publish.getByRole("button", { name: "Publish saved revision", exact: true }).click();
  await publish.locator("[data-memberships-status]").filter({ hasText: "Memberships are pending" }).waitFor({ timeout: 20000 });
  const continueButton = publish.getByRole("button", { name: "Continue Memberships update", exact: true });
  await page.waitForFunction(() => [...document.querySelectorAll("dialog[data-publication-dialog] button")].some(b => b.textContent === "Continue Memberships update" && !b.disabled));
  const appliedBeforeRetry = (await f.request(f.admin, "contacts", "/staff/" + s.staff[0])).body.data.fields.memberships;
  assert.deepEqual(appliedBeforeRetry.value, ["Imported synthetic team", "Learning & Wellbeing"]);
  await db.prepare("DROP TRIGGER synthetic_membership_finish_failure").run();
  const originalBatch = f.requests.find(r => r.url.endsWith("/memberships/sync")).input;
  const prepared = await operationStatus(db, schoolId, originalBatch.operationId);
  assert.equal(prepared.state, "prepared");
  // Isolated durable recovery fixture: make the previously unknown outcome
  // conclusively aborted, then require the browser to verify its real receipt.
  await abortOperation(db, prepared, "SYNTHETIC_RECOVERY_ABORT", Date.now());
  loseAcknowledgement = true;
  await continueButton.click();
  try { await publish.locator("[data-memberships-status]").filter({ hasText: "Memberships remain pending" }).waitFor(); }
  catch (error) { throw Error(error.message + "\nLoss UI: " + await publish.innerText() + "\nSync: " + JSON.stringify(f.requests.filter(r => r.url.endsWith("/memberships/sync")))); }
  await page.reload();
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  const recoveredPanel = page.locator('[data-panel-id="deploy-publication"]');
  if (!(await recoveredPanel.evaluate(panel => panel.open))) await recoveredPanel.locator("summary").click();
  try { await recoveredPanel.getByRole("button", { name: "Resume pending Memberships update", exact: true }).click(); }
  catch (error) { throw Error(error.message + "\nRecovery: " + JSON.stringify(await page.evaluate(() => ({ keys: Object.entries(sessionStorage), buttons: [...document.querySelectorAll('[data-panel-id="deploy-publication"] button')].map(b => b.textContent) }))) + "\nErrors: " + JSON.stringify(errors)); }
  try { await recoveredPanel.locator("[data-memberships-status]").filter({ hasText: "Memberships complete: 2 applied; 0 newer edits/publications preserved." }).waitFor({ timeout: 20000 }); }
  catch (error) { throw Error(error.message + "\nPublication UI: " + await recoveredPanel.innerText() + "\nSync: " + JSON.stringify(f.requests.filter(r => r.url.endsWith("/memberships/sync")))); }
  for (const [index, expected] of [[0, ["Imported synthetic team", "Learning & Wellbeing"]], [1, []]]) {
    const contact = (await f.request(f.admin, "contacts", "/staff/" + s.staff[index])).body.data;
    assert.deepEqual(contact.fields.memberships.value, expected);
  }
  const sync = f.requests.filter(r => r.url.endsWith("/memberships/sync"));
  assert(sync.length >= 4, "built Publish control resumes unknown, conclusively aborted and lost acknowledgements");
  assert.deepEqual(sync[2].input, sync[3].input, "a lost response retries the exact original request identity and intent after browser reload");
  assert.deepEqual(sync[0].input, sync[1].input, "an unconfirmed acknowledgement retains its original request until a terminal receipt is verified");
  assert.notEqual(sync[1].input.operationId, sync[2].input.operationId, "only a proven terminal batch gets a new progress request identity");
  assert.equal(sync[0].input.sourceOperationId, sync.at(-1).input.sourceOperationId);
  assert.equal(sync[0].input.publicationId, sync.at(-1).input.publicationId);
  assert.equal((await f.request(f.admin, "contacts", "/staff/" + s.staff[0])).body.data.fields.memberships.revision, appliedBeforeRetry.revision, "retry does not repeat the durable Contacts edit");
  assert(sync.every(r => r.input.limit === 8 && r.input.sourceOperationId && r.input.publicationId));
  assert(!f.external.some(url => /graph\.facebook\.com|api\.telegram\.org/.test(url)), "no messaging provider is contacted; fixture blocks all external browser requests");
  assert.deepEqual(errors, []);
  console.log("PASS built Membership editor/save/reload, unknown and explicit clear, canonical Excel import, publish-to-Contacts application via real Workers/D1; unconfirmed/lost acknowledgement recovery; no provider sends (" + (Date.now() - started) + "ms)");
} finally { await f.close(); }
