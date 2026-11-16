import assert from "node:assert/strict";
import { join } from "node:path";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { loadVersion } from "../v1/services/deploy/service.mjs";

const f = await fixture();
let serial = 0, restarted;
const operation = label => `synthetic-role-matrix-${label}-${++serial}`;
const role = (shortform, groups = [], eo = null) => [shortform, shortform || "No role",
  ...["SL", "SC", "SMC", "KP", "TL", "SDT", "CMT", "SAT", "Support", "MK"].map(g => groups.includes(g) ? "1" : ""), "Synthetic grade", eo];
try {
  const db = await f.db("deploy");
  const created = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: operation("empty"), name: "Synthetic empty role matrix", year: 2026,
  });
  const versionId = created.versionId;
  const stored = async (id = versionId) => (await loadVersion(db, schoolId, id)).doc;
  const lease = async (id = versionId) => {
    const value = await f.call(f.admin, "deploy", "/lease", {
      operationId: operation("lease"), versionId: id, scope: "meta", clientId: "synthetic-role-client",
    });
    return { versionId: id, scope: "meta", clientId: "synthetic-role-client", leaseFence: value.fence };
  };
  async function save(edits, id = versionId) {
    const input = { ...(await lease(id)), operationId: operation("save"), edits };
    return { input, result: await f.call(f.admin, "deploy", "/change", input) };
  }
  const matrix = [role("", ["SMC", "KP"], true), role("Synthetic role", ["SL"], null)];
  const first = await save([{ operation: "setRoleMemberships", expected: [], value: matrix }]);
  assert.equal((await stored()).teachers.length, 0);
  assert.deepEqual((await stored()).membership, matrix);
  assert.equal((await stored()).roleMembershipSchema, 1);
  assert.deepEqual(await f.call(f.admin, "deploy", "/change", first.input), first.result);
  const forged = await f.request(f.admin, "deploy", "/change", { method: "POST", body: {
    ...first.input, edits: [{ operation: "setRoleMemberships", expected: [], value: [] }],
  } });
  assert.equal(forged.status, 409, JSON.stringify(forged.body));
  for (const value of [
    [role("Same"), role(" same ")], [role("", []), role("", [])],
    [role("MK", ["MK", "SMC"])], [["", "", ...Array(12).fill("")]],
    Array.from({ length: 301 }, (_, i) => role("Role " + i)),
    [[...role("Short").slice(0, 12)]],
  ]) {
    const denied = await f.request(f.admin, "deploy", "/change", { method: "POST", body: {
      ...(await lease()), operationId: operation("malformed"), edits: [{ operation: "setRoleMemberships", expected: matrix, value }],
    } });
    assert(denied.status >= 400, JSON.stringify(denied.body));
    assert.deepEqual((await stored()).membership, matrix);
  }
  const stale = await f.request(f.admin, "deploy", "/change", { method: "POST", body: {
    ...(await lease()), operationId: operation("stale"), edits: [{ operation: "setRoleMemberships", expected: [], value: [] }],
  } });
  assert.equal(stale.status, 409, JSON.stringify(stale.body));
  const denied = await f.request(f.ordinary, "deploy", "/change", { method: "POST", body: {
    operationId: operation("denied"), versionId, edits: [{ operation: "setRoleMemberships", expected: matrix, value: [] }],
  } });
  assert.equal(denied.status, 503, JSON.stringify(denied.body));
  assert.equal(denied.body.error.code, "AUTHORITY_UNAVAILABLE", "an unlinked account cannot manufacture authority");
  for (const edit of [{ operation: "setMembership", value: matrix },
    { operation: "patchPlanning", source: "setMembership", value: matrix }]) {
    const result = await f.request(f.admin, "deploy", "/change", { method: "POST", body: {
      ...(await lease()), operationId: operation("legacy-denied"), edits: [edit],
    } });
    assert.equal(result.status, 403, JSON.stringify(result.body));
  }

  const scenario = await seedScenario(f), staff = scenario.staff[0];
  const reader = await f.seedAccount("synthetic-role-reader", { staffId: staff, capabilities: [] });
  const readerDenied = await f.request(reader, "deploy", "/change", { method: "POST", body: {
    operationId: operation("reader-denied"), versionId, edits: [{ operation: "setRoleMemberships", expected: matrix, value: [] }],
  } });
  assert.equal(readerDenied.status, 403, JSON.stringify(readerDenied.body));
  const current = (await f.request(f.admin, "contacts", "/staff/" + staff)).body.data;
  await f.call(f.admin, "contacts", "/staff/" + staff + "/update", {
    operationId: operation("custom"), changes: { memberships: ["Custom team", "SC"] },
    fieldRevisions: { memberships: current.fields.memberships?.revision ?? 0 },
  });
  const duplicate = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: operation("duplicate"), copyFrom: versionId, name: "Synthetic populated matrix", duplicate: true,
  });
  const copyId = duplicate.versionId;
  const copy = await stored(copyId), person = copy.teachers.find(t => t.id === staff);
  assert.deepEqual(copy.membership, matrix);
  assert.deepEqual(person.deploymentTags.Memberships, ["Custom team", "SMC", "KP"]);
  assert.equal(person.authority.smc.value, false, "planning flags never change accepted authority before publish");
  assert.equal(person.authority.eo.value, true);
  assert.equal(person.deploymentTags["EO Appt Level"], "Synthetic grade");
  assert.equal((await stored()).teachers.length, 0, "duplicate does not mutate original");
  const override = await f.request(f.admin, "deploy", "/change", { method: "POST", body: {
    ...(await lease(copyId)), operationId: operation("override"), edits: [{ operation: "setTeacherMemberships", teacher: staff,
      expected: person.deploymentTags.Memberships, value: ["Custom team"] }],
  } });
  assert.equal(override.body.error.code, "USE_ROLE_MATRIX", JSON.stringify(override.body));
  await save([{ operation: "setTeacherMemberships", teacher: staff, expected: person.deploymentTags.Memberships,
    value: ["Other custom", "SMC", "KP"] }], copyId);
  await save([{ operation: "setTeacherNote", teacher: staff, expected: "", value: "Synthetic planning note" }], copyId);
  assert.deepEqual((await stored(copyId)).teachers.find(t => t.id === staff).deploymentTags.Memberships, ["Other custom", "SMC", "KP"]);
  await f.call(f.admin, "deploy", "/publishReview", { versionId: copyId });
  assert.deepEqual((await f.call(f.admin, "deploy", "/bootstrap", { versionId: copyId })).current.membership, matrix);
  const book = await f.call(f.admin, "deploy", "/export", { versionId: copyId, scope: "Role Membership" });
  assert.equal(book.sheets["Role Membership"].columns.length, 14);
  assert.deepEqual(book.sheets["Role Membership"].rows, matrix);
  const foreign = structuredClone(book); foreign.metadata["School ID"] = "synthetic-other-school";
  assert.equal((await f.request(f.admin, "deploy", "/imports/preview", { method: "POST", body: {
    operationId: operation("foreign"), versionId: copyId, workbook: foreign,
  } })).status, 403);
  book.sheets["Role Membership"].rows[0] = role("", [], false);
  const preview = await f.call(f.admin, "deploy", "/imports/preview", {
    operationId: operation("preview"), versionId: copyId, workbook: book,
  });
  const appliedInput = { ...(await lease(copyId)), operationId: operation("apply"), previewId: preview.previewId, digest: preview.digest };
  const applied = await f.call(f.admin, "deploy", "/imports/apply", appliedInput);
  assert.deepEqual((await stored(copyId)).teachers.find(t => t.id === staff).deploymentTags.Memberships, ["Other custom"]);
  assert.equal((await stored(copyId)).membership[0][13], false);
  const staleBook = await f.request(f.admin, "deploy", "/imports/preview", { method: "POST", body: {
    operationId: operation("stale-book"), versionId: copyId, workbook: book,
  } });
  assert.equal(staleBook.status, 409);
  const published = await f.call(f.admin, "deploy", "/publish", {
    ...(await lease(copyId)), operationId: operation("publish"),
    revision: (await loadVersion(db, schoolId, copyId)).version.revision, expectedPointerSequence: 0,
  });
  const syncInput = { operationId: operation("sync"), requestId: "synthetic-transport-first",
    publicationId: published.publicationId, sourceOperationId: published.operationId || published.requestId,
    versionId: copyId, offset: 0, limit: 8 };
  const appliedAuthority = await f.call(f.admin, "deploy", "/memberships/sync", syncInput);
  assert.equal(appliedAuthority.state, "applied", JSON.stringify(appliedAuthority));
  assert.equal(appliedAuthority.completed, 2);
  const retriedAuthority = await f.call(f.admin, "deploy", "/memberships/sync", {
    ...syncInput, requestId: "synthetic-transport-retry",
  });
  assert.deepEqual(retriedAuthority, appliedAuthority, "a transport requestId change is an exact business retry");
  const persisted = await stored(copyId);
  await f.stopWorkers();
  restarted = await startProduct({ persistPath: join(f.path, "state"), output: join(f.path, "restarted"), migrateSchemas: false });
  const replay = await restarted.mf.dispatchFetch(origin + "/api/deploy/imports/apply", { method: "POST",
    headers: { origin, cookie: "__Host-gsis_session=" + f.admin.token, "x-csrf-token": f.admin.csrf, "content-type": "application/json" },
    body: JSON.stringify(appliedInput) });
  const replayed = await replay.json();
  assert.equal(replay.status, 200, JSON.stringify(replayed));
  assert.deepEqual(replayed.data, applied);
  assert.deepEqual((await loadVersion(await restarted.db("deploy"), schoolId, copyId)).doc, persisted);
  console.log("PASS role matrix real Workers/D1: empty school, exact native edit, bounds, managed/custom groups, duplicate, authority isolation, canonical import, stale/foreign/denied checks and restart retry");
} finally { await restarted?.close(); await f.close(); }
