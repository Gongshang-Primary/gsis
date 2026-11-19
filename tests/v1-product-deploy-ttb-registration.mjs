import assert from "node:assert/strict";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { choiceLists } from "../v1/services/deploy/catalogue-links.mjs";
import { loadVersion } from "../v1/services/deploy/service.mjs";

const f = await fixture();
try {
  const { staff: [original] } = await seedScenario(f);
  const { versionId } = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-ttb-version", name: "Synthetic TTb plan", year: 2027,
  });
  const deploy = await f.db("deploy"), contacts = await f.db("contacts");
  const stored = async () => (await loadVersion(deploy, schoolId, versionId)).doc;
  const people = async () => (await contacts.prepare(
    "SELECT staff_id, basic_name, ttb_name, profile_state FROM contacts_staff WHERE school_id=? AND basic_name=? ORDER BY ttb_name",
  ).bind(schoolId, "Synthetic Teacher A").all()).results;
  const clientId = "synthetic-ttb-configuration";
  const lease = await f.call(f.admin, "deploy", "/lease", {
    operationId: "synthetic-ttb-choice-lease", versionId, scope: "meta", clientId,
  });
  const list = choiceLists(await stored());
  await f.call(f.admin, "deploy", "/change", {
    operationId: "synthetic-ttb-choices", versionId, scope: "meta", clientId, leaseFence: lease.fence,
    edits: [{ operation: "setHRChoices", expected: list, value: { ...list, "Subject Modifier": ["PE", "Art"] } }],
  });

  const page = await f.pageFor();
  const openTeachers = async () => {
    await page.getByRole("button", { name: "HR Settings", exact: true }).click();
    await page.getByRole("button", { name: "Teachers", exact: true }).click();
  };
  await page.goto(origin + "/deploy/");
  await openTeachers();
  await page.getByRole("button", { name: "Add teacher", exact: true }).click();
  await page.locator('input[data-profile="0"]').fill("Synthetic Teacher A");
  await page.locator('select[data-profile="5"] + details summary').click();
  await page.getByRole("option", { name: "PE", exact: true }).click();
  const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/deploy/staff/register"));
  await page.getByRole("button", { name: "Apply to draft", exact: true }).click();
  const response = await responsePromise;
  const registration = await response.json();
  assert.equal(response.status(), 200, JSON.stringify(registration));
  const newId = registration.data?.result?.staffId ?? registration.data?.staffId;
  assert(newId && newId !== original);
  const input = response.request().postDataJSON();
  assert.deepEqual(input.nameModifiers.subjectTags, ["PE"]);
  await page.locator("#saveQueue").getByRole("button", { name: "Save to online", exact: true }).click();
  await page.waitForFunction(() => !queuedEdits().length && !queueFlight && !refreshing);
  await page.reload();
  await openTeachers();
  await page.getByText("Synthetic Teacher A (PE)", { exact: true }).waitFor();
  assert((await stored()).teachers.some(teacher => teacher.id === newId));
  assert.deepEqual((await people()).map(row => [row.staff_id, row.ttb_name, row.profile_state]), [
    [original, "Synthetic Teacher A", "complete"],
    [newId, "Synthetic Teacher A (PE)", "provisional"],
  ]);
  const hasAuthority = await contacts.prepare(
    "SELECT COUNT(*) n FROM contacts_fields WHERE school_id=? AND staff_id=? AND field IN ('smc','eo','schoolLeader')",
  ).bind(schoolId, newId).first();
  assert.equal(hasAuthority.n, 0);
  console.log("PASS built Teachers flow saves two Staff IDs sharing a Basic Name with distinct TTb Names.");

  const register = async body => f.request(f.admin, "deploy", "/staff/register", { method: "POST", body });
  const replay = await register(input);
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.data.result?.staffId ?? replay.body.data.staffId, newId);
  const changed = await register({ ...input, nameModifiers: { schemaVersion: 1, subjectTags: ["Art"] } });
  assert.equal(changed.status, 409);
  assert.equal(changed.body.error.code, "OPERATION_INTENT_CONFLICT");
  const duplicate = await register({ ...input, operationId: "synthetic-ttb-collision" });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, "IDENTITY_SELECTION_REQUIRED");
  assert.match(duplicate.body.error.message, /TTb Name/i);
  assert.equal((await people()).length, 2);

  const art = {
    basicName: "Synthetic Teacher A", nameModifiers: { schemaVersion: 1, subjectTags: ["Art"] },
  };
  const racing = await Promise.all(["first", "second"].map(key => register({ ...art, operationId: "synthetic-ttb-race-" + key })));
  assert.deepEqual(racing.map(result => result.status).sort(), [200, 409]);
  assert.equal((await people()).filter(row => row.ttb_name === "Synthetic Teacher A (Art)").length, 1);
  const looseOperations = await contacts.prepare(
    "SELECT COUNT(*) n FROM product_operations WHERE school_id=? AND action='contacts.provisional' AND state='prepared'",
  ).bind(schoolId).first();
  assert.equal(looseOperations.n, 0);
  console.log("PASS exact replay preserves the ID, changed intent and duplicate TTb fail, concurrent registration creates one person.");

  const role = await register({
    operationId: "synthetic-ttb-role-hint", basicName: "Synthetic Teacher A",
    nameModifiers: { schemaVersion: 1, role: "Music" },
  });
  assert.equal(role.status, 200, JSON.stringify(role.body));
  const roleId = role.body.data.result?.staffId ?? role.body.data.staffId;
  assert((await people()).some(row => row.staff_id === roleId && row.ttb_name === "Synthetic Teacher A (Music)"));
  const acceptedFacts = await contacts.prepare(
    "SELECT COUNT(*) n FROM contacts_fields WHERE school_id=? AND staff_id=? AND state='accepted' AND field IN ('role','employmentActive','smc','eo','schoolLeader')",
  ).bind(schoolId, roleId).first();
  assert.equal(acceptedFacts.n, 0);
  const unrelated = await register({
    operationId: "synthetic-ttb-invalid-modifiers", basicName: "Synthetic Unregistered Teacher",
    nameModifiers: { schemaVersion: 1, employmentActive: true },
  });
  assert.equal(unrelated.status, 400);
  console.log("PASS role-derived display tag stays separate from Contacts role, activity, and authority.");
} finally {
  await f.close();
}
