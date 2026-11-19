import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";
import AscExport from "../shared/asc-export.js";
import Fields from "../v1/services/deploy/planning-fields.mjs";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

// Generate the actual classic-browser wire format. Requests below pass through
// the built local Workers, Core decisions, leases, receipts and owning D1.
const browser = vm.createContext({});
vm.runInContext(await readFile(new URL("../shared/fields.js", import.meta.url), "utf8"), browser);
const canonical = value => JSON.parse(JSON.stringify(value));
const wire = (source, before, after, kind) => ({ operation: "patchPlanning", source,
  ...(kind ? { kind } : {}), changes: canonical(browser.GSISFields.diff(before, after)) });
// Keep the v1-owned ESM adapter compatible with the actual browser contract,
// including escaped field paths and both chunked key/order representations.
const escaped = { 'quoted"key': { "slash/key": ["value", { id: "synthetic-escaped", "bracket[]": "before" }] } };
const changedEscaped = structuredClone(escaped);
changedEscaped['quoted"key']["slash/key"][1]["bracket[]"] = "after\\value";
const wide = Object.fromEntries(Array.from({ length: 125 }, (_, i) => ["synthetic-key-" + i, i]));
const changedWide = { ...wide, "synthetic-extra": "after" };
changedWide["synthetic-key-124"] = "changed";
const long = Array.from({ length: 505 }, (_, i) => ({ id: "synthetic-array-" + i, value: i }));
const changedLong = [...long.slice(1), { ...long[0], value: "moved" }];
for (const [before, after] of [[escaped, changedEscaped], [wide, changedWide], [long, changedLong]]) {
  assert.deepEqual(Fields.flat(before), canonical(browser.GSISFields.flat(before)));
  assert.deepEqual(Fields.diff(before, after), canonical(browser.GSISFields.diff(before, after)));
  assert.deepEqual(Fields.apply(before, canonical(browser.GSISFields.diff(before, after))), after);
}
const school = "synthetic-school", suite = await productSuite();
let serial = 0, restarted, originalDisposed = false;
const operation = label => "synthetic-departments-" + label + "-" + ++serial;
try {
  const admin = await suite.seedAccount("synthetic-departments-admin");
  const additions = Array.from({ length: 5 }, (_, index) => ({ id: "synthetic-dept-row-" + index,
    values: { "Basic Name": "Synthetic Department Teacher " + index,
      "Statutory Name": "Synthetic Department Teacher " + index, Active: "Y",
      "School Section": "Primary", "Personnel Category": "Teaching", "EO Appt Level": "ST" } }));
  const createdStaff = await suite.call(admin, "contacts", "/save-data", {
    operationId: operation("staff"), changes: [], additions,
  });
  const staff = additions.map(row => createdStaff.mapping[row.id]);
  for (const id of staff) for (const field of ["eo", "smc", "schoolLeader"])
    await suite.call(admin, "contacts", "/staff/" + id + "/accept", {
      operationId: operation("authority"), field, value: field === "eo", revision: 0,
      ownerReviewReference: "Synthetic department fixture review",
    });
  const create = name => suite.call(admin, "deploy", "/versions/create", {
    operationId: operation("create"), name, year: 2026,
  });
  const { versionId } = await create("Synthetic department planning");
  const { versionId: independentId } = await create("Synthetic independent planning");
  const db = await suite.db("deploy"), independent = canonical((await loadVersion(db, school, independentId)).doc);
  const stored = async (targetId = versionId) => (await loadVersion(db, school, targetId)).doc;
  const bootstrap = (targetId = versionId) => suite.call(admin, "deploy", "/bootstrap", { versionId: targetId });
  const lease = async (targetId = versionId) => {
    const grant = await suite.call(admin, "deploy", "/lease", {
      operationId: operation("lease"), versionId: targetId, scope: "meta", clientId: "synthetic-department-client",
    });
    return { versionId: targetId, scope: "meta", clientId: "synthetic-department-client", leaseFence: grant.fence };
  };
  const save = async (edits, targetId = versionId) => {
    const input = { ...(await lease(targetId)), operationId: operation("save"), edits };
    return { input, result: await suite.call(admin, "deploy", "/change", input) };
  };
  const denied = async (input, status, code, user = admin) => {
    const before = canonical(await stored(input.versionId));
    const response = await suite.request(user, "deploy", "/change", { method: "POST", body: input });
    assert.equal(response.status, status, JSON.stringify(response.body));
    if (code) assert.equal(response.body.error.code, code, JSON.stringify(response.body));
    assert.deepEqual(await stored(input.versionId), before, "a rejected patch must not change owning D1");
    return response.body;
  };

  const kinds = ["dept", "comm", "cca", "plt", "events"], roles = { dept: 2, comm: 4, cca: 4, plt: 1, events: 2 };
  const expected = Object.fromEntries(kinds.map(kind => [kind, [
    { id: "synthetic-" + kind, name: "Synthetic " + kind, slots: Array(roles[kind]).fill(""),
      ...(kind === "comm" ? { leadershipSchema: 1, legacyLeadership: [{ role: "Head", teacher: staff[4] }] } : {}) },
    { id: "synthetic-" + kind + "-retained", name: "Synthetic retained " + kind,
      slots: Array(roles[kind]).fill(""), ...(kind === "comm" ? { leadershipSchema: 1 } : {}) },
  ]]));
  const first = await save(kinds.map(kind => wire("setOrganisation", [], expected[kind], kind)));
  assert.deepEqual((await stored()).organisations, expected);
  assert.deepEqual((await bootstrap()).current.organisations, expected);
  assert.deepEqual(await suite.call(admin, "deploy", "/change", first.input), first.result, "lost-response retries reuse the original outcome");
  await denied({ ...first.input, edits: [wire("setOrganisation", [], [], "dept")] }, 409);

  const renameBase = canonical(expected.dept), renamed = canonical(renameBase);
  renamed[0].name = "Synthetic renamed department";
  await save([wire("setOrganisation", renameBase, renamed, "dept")]);
  assert.equal((await bootstrap()).current.organisations.dept[0].name, renamed[0].name);
  const assigned = canonical(renamed);
  assigned[0].slots = [staff[0], staff[1], staff[4]];
  assigned[0].additionalDeputies = [staff[2]];
  assigned[0].tls = [staff[3]];
  await save([wire("setOrganisation", renamed, assigned, "dept")]);
  assert.deepEqual((await stored()).organisations.dept, assigned);
  assert.deepEqual((await bootstrap()).current.organisations.dept, assigned);
  for (const kind of kinds.filter(kind => kind !== "dept"))
    assert.deepEqual((await stored()).organisations[kind], expected[kind], "department editing preserves " + kind);

  // A second distinct department is not another position in the same group.
  const departmentBase = (await stored()).organisations.dept;
  const secondDepartment = canonical(departmentBase);
  secondDepartment[1].slots[0] = staff[0];
  await denied({ ...(await lease()), operationId: operation("second-department"),
    edits: [{ operation: "setOrganisation", kind: "dept", expected: departmentBase, value: secondDepartment }] },
  409, "DEPARTMENT_MEMBERSHIP_CONFLICT");
  await denied({ ...(await lease()), operationId: operation("second-department-patch"),
    edits: [wire("setOrganisation", departmentBase, secondDepartment, "dept")] },
  409, "DEPARTMENT_MEMBERSHIP_CONFLICT");
  for (const field of ["additionalDeputies", "tls"]) {
    const anotherPosition = canonical(departmentBase);
    anotherPosition[1][field] = [staff[0]];
    await denied({ ...(await lease()), operationId: operation("second-department-" + field),
      edits: [wire("setOrganisation", departmentBase, anotherPosition, "dept")] },
    409, "DEPARTMENT_MEMBERSHIP_CONFLICT");
  }

  // The stale structural edit must fail without changing the saved leadership.
  const staleDelete = wire("setOrganisation", renameBase, [renameBase[1]], "dept");
  await denied({ ...(await lease()), operationId: operation("stale"), edits: [staleDelete] }, 409, "REVISION_CONFLICT");
  const malformed = wire("setOrganisation", assigned, assigned, "dept");
  malformed.changes = [{ key: "[]", old: JSON.stringify({ a: assigned.map(g => "@" + g.id) }),
    value: JSON.stringify({ a: ["@synthetic-missing"] }) }];
  const staleMalformed = structuredClone(malformed);
  staleMalformed.changes[0].old = JSON.stringify({ a: ["@synthetic-outdated-root"] });
  await denied({ ...(await lease()), operationId: operation("stale-before-inflate"),
    edits: [staleMalformed] }, 409, "REVISION_CONFLICT");
  await denied({ ...(await lease()), operationId: operation("malformed"), edits: [malformed] }, 400, "DEPLOY_INVALID");
  for (const field of ["slots", "additionalDeputies", "tls"]) {
    const invalid = canonical(assigned);
    invalid[0][field] = ["synthetic-unknown-staff"];
    await denied({ ...(await lease()), operationId: operation("unknown-member"),
      edits: [wire("setOrganisation", assigned, invalid, "dept")] }, 400, "DEPLOY_INVALID");
  }
  // Encoded field values must cross the same object boundary as direct edits;
  // a JSON string in a patch must not smuggle a forbidden property into D1.
  const prototypeBase = (await bootstrap()).current.organisations.dept;
  const poisoned = structuredClone(prototypeBase);
  Object.defineProperty(poisoned[0], "__proto__", { value: { synthetic: true }, enumerable: true });
  await denied({ ...(await lease()), operationId: operation("encoded-prototype"),
    edits: [wire("setOrganisation", prototypeBase, poisoned, "dept")] }, 400, "DEPLOY_INVALID");
  await denied({ ...(await lease()), operationId: operation("null-change"),
    edits: [{ operation: "patchPlanning", source: "setOrganisation", kind: "dept", changes: [null] }] },
  400, "DEPLOY_INVALID");
  const originalFields = canonical(browser.GSISFields.flat(prototypeBase));
  const chain = Array.from({ length: 20 }, (_, depth) => [Array(depth).fill("x"), { o: ["x"] }]);
  chain.push([Array(20).fill("x"), { v: "synthetic-depth-value" }]);
  for (const [label, metadata, message] of [
    ["duplicate-array-order", [[[], { a: ["@synthetic-duplicate", "@synthetic-duplicate"] }]], /Invalid planning field order/],
    ["duplicate-object-keys", [[[], { o: ["synthetic-key", "synthetic-key"] }]], /Invalid planning field order/],
    ["huge-array-chunks", [[[], { ac: 1e12 }]], /Invalid planning field chunks/],
    ["huge-object-chunks", [[[], { oc: 1e12 }]], /Invalid planning field chunks/],
    ["encoded-depth", chain, /Planning field bounds exceeded/],
  ]) {
    const changes = metadata.map(([path, value]) => ({ key: JSON.stringify(path),
      old: originalFields[JSON.stringify(path)] ?? null, value: JSON.stringify(value) }));
    const rejected = await denied({ ...(await lease()), operationId: operation(label),
      edits: [{ operation: "patchPlanning", source: "setOrganisation", kind: "dept", changes }] },
    400, "DEPLOY_INVALID");
    assert.match(rejected.error.message, message);
  }

  const reader = await suite.seedAccount("synthetic-departments-reader", { staffId: staff[0], capabilities: [] });
  await denied({ operationId: operation("reader"), versionId,
    edits: [wire("setOrganisation", assigned, [], "dept")] }, 403, undefined, reader);
  await db.prepare("INSERT INTO deploy_versions(school_id,id,name,revision,metadata,created_at) VALUES('synthetic-foreign-school','synthetic-foreign-department-version','Synthetic foreign version',0,'{}',?)")
    .bind(Date.now()).run();
  const foreign = await suite.request(admin, "deploy", "/lease", { method: "POST", body: {
    operationId: operation("foreign"), versionId: "synthetic-foreign-department-version", scope: "meta", clientId: "synthetic-department-client",
  } });
  assert.equal(foreign.status, 404, JSON.stringify(foreign.body));

  const beforeImport = canonical(await stored());
  const workbook = await suite.call(admin, "deploy", "/export", { versionId, scope: "Dept" });
  workbook.sheets.Departments.rows.find(row => row[0] === assigned[0].id)[1] = "Synthetic workbook department";
  const preview = await suite.call(admin, "deploy", "/imports/preview", {
    operationId: operation("preview"), versionId, workbook,
  });
  assert.deepEqual(await stored(), beforeImport, "preview does not mutate the planning version");
  const imported = { ...(await lease()), operationId: operation("import"), previewId: preview.previewId, digest: preview.digest };
  const importResult = await suite.call(admin, "deploy", "/imports/apply", imported);
  assert.deepEqual(await suite.call(admin, "deploy", "/imports/apply", imported), importResult);
  const importedDepartment = (await bootstrap()).current.organisations.dept[0];
  assert.equal(importedDepartment.name, "Synthetic workbook department");
  for (const field of ["id", "slots", "additionalDeputies", "tls"])
    assert.deepEqual(importedDepartment[field], beforeImport.organisations.dept[0][field], "department import preserves " + field);
  assert.deepEqual((await stored()).organisations.comm, expected.comm, "department import preserves legacy committee history");

  // Like the browser after a confirmed save, take the next field baseline from
  // the reloaded snapshot, including D1's canonical object-key order.
  const savedDepartments = (await bootstrap()).current.organisations.dept;
  const removed = [savedDepartments[1]];
  await save([wire("setOrganisation", savedDepartments, removed, "dept")]);
  assert.deepEqual((await bootstrap()).current.organisations.dept, removed);
  assert.deepEqual((await stored()).organisations.comm, expected.comm, "retained committee history survives department removal");
  const duties = [{ id: "synthetic-department-duty", name: "Synthetic duty", category: "Before School",
    start: "07:00", end: "07:30", days: [0, 1], description: "Synthetic duty instructions", teachers: { 0: staff[0] } }];
  const settings = AscExport.defaults({ id: versionId, name: "Synthetic department export" });
  await save([wire("setDuties", [], duties), wire("setAscExportSettings", {}, settings)]);
  const loaded = (await bootstrap()).current;
  assert.deepEqual(loaded.duties, duties);
  assert.deepEqual(loaded.ascExport, settings);
  assert.deepEqual((await loadVersion(db, school, independentId)).doc, independent, "another planning version stays isolated");
  console.log("PASS browser/ESM field parity and real built Worker/D1 department/all organisation patches: add/rename/remove, leadership/member arrays, legacy history, reload/isolation, receipts, stale/malformed/security rejection, Dept export/preview/import, duties and aSc settings");

  const { versionId: moveId } = await create("Synthetic department move history");
  const acceptedContacts = await suite.db("contacts"), core = await suite.db("core");
  const acceptedFacts = async () => ({
    staff: (await acceptedContacts.prepare("SELECT * FROM contacts_staff WHERE school_id=? ORDER BY staff_id").bind(school).all()).results,
    fields: (await acceptedContacts.prepare("SELECT * FROM contacts_fields WHERE school_id=? ORDER BY staff_id,field").bind(school).all()).results,
    grants: (await core.prepare("SELECT * FROM core_grants WHERE school_id=? ORDER BY account_id,capability").bind(school).all()).results,
  });
  const acceptedBefore = await acceptedFacts(), originalVersion = canonical(await stored());
  const moveGroups = ["A", "B", "C"].map(letter => ({
    id: "synthetic-move-dept-" + letter, name: "Synthetic Department " + letter, slots: ["", ""],
  }));
  moveGroups[0].slots = [staff[0], staff[1], staff[2]];
  moveGroups[0].additionalDeputies = [staff[3]];
  moveGroups[0].tls = [staff[4]];
  await save([{ operation: "setOrganisation", kind: "dept", expected: [], value: moveGroups }], moveId);
  const committees = ["A", "B"].map(letter => ({
    id: "synthetic-move-committee-" + letter, name: "Synthetic Committee " + letter,
    leadershipSchema: 1, slots: ["", "", "", "", staff[0]],
  }));
  await save([{ operation: "setOrganisation", kind: "comm", expected: [], value: committees }], moveId);
  let moveBefore = (await stored(moveId)).organisations.dept;
  const moved = canonical(moveBefore);
  moved[0].slots[0] = "";
  moved[1].slots.push(staff[0]);
  const move = await save([{ operation: "setOrganisation", kind: "dept", expected: moveBefore, value: moved }], moveId);
  assert.deepEqual((await stored(moveId)).organisations.dept, moved, "one atomic move removes the original role and installs the target role");
  assert.deepEqual(await suite.call(admin, "deploy", "/change", move.input), move.result, "an exact move retry returns its one committed outcome");
  await denied({ ...move.input, edits: [{ ...move.input.edits[0], value: moveBefore }] }, 409);

  // Historical multi-department rows cannot be manufactured by new edits. Seed
  // their old owner rows explicitly, then exercise every real mutation route.
  const historical = await loadVersion(db, school, moveId), legacy = canonical(historical.doc);
  legacy.organisations.dept[0].slots[0] = staff[0];
  legacy.organisations.dept[2].slots.push(staff[0]);
  legacy.teacherDrafts[staff[4]] = { Active: "N" };
  const seededHistory = changesFor(school, moveId, historical.rows, legacy);
  await db.batch(seededHistory.writes.map(change => statement(db, change.sql, change.args)));
  await db.prepare("INSERT INTO deploy_publications VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .bind(school, "synthetic-department-sealed-history", 900001, moveId, historical.version.revision,
      "synthetic-department-publication", "synthetic-digest", "synthetic-payload-key",
      JSON.stringify({ fixture: "Synthetic immutable department history" }), Date.now(), "synthetic-decision").run();
  const publicationRows = async () => (await db.prepare("SELECT * FROM deploy_publications WHERE school_id=? ORDER BY id").bind(school).all()).results;
  const historyBefore = await publicationRows(), beforeOpen = canonical(await stored(moveId));
  await bootstrap(moveId);
  assert.deepEqual(await stored(moveId), beforeOpen, "reading legacy departments cannot repair saved memberships");
  await save([{ operation: "setTeacherNote", teacher: staff[1], value: "Synthetic unrelated note", expected: "" }], moveId);
  assert.deepEqual((await stored(moveId)).organisations.dept, beforeOpen.organisations.dept, "an unrelated note preserves legacy department assignments");
  moveBefore = (await stored(moveId)).organisations.dept;
  const renamedLegacy = canonical(moveBefore);
  renamedLegacy[0].name = "Synthetic renamed legacy department";
  await save([wire("setOrganisation", moveBefore, renamedLegacy, "dept")], moveId);
  const reducedLegacy = canonical((await stored(moveId)).organisations.dept);
  reducedLegacy[2].slots = ["", ""];
  await save([wire("setOrganisation", (await stored(moveId)).organisations.dept, reducedLegacy, "dept")], moveId);
  assert.equal(reducedLegacy.filter(group => group.slots.includes(staff[0])).length, 2, "a historical three-department membership may reduce to its existing two");
  for (const mode of ["replace", "increase"]) {
    const before = (await stored(moveId)).organisations.dept, invalid = canonical(before);
    if (mode === "replace") invalid[1].slots = ["", ""];
    invalid[2].slots.push(staff[0]);
    await denied({ ...(await lease(moveId)), operationId: operation("legacy-" + mode),
      edits: [wire("setOrganisation", before, invalid, "dept")] }, 409, "DEPARTMENT_MEMBERSHIP_CONFLICT");
  }
  const legacyBook = await suite.call(admin, "deploy", "/export", { versionId: moveId, scope: "Dept" });
  const legacyPreview = await suite.call(admin, "deploy", "/imports/preview", {
    operationId: operation("legacy-import-preview"), versionId: moveId, workbook: legacyBook,
  });
  assert.equal(legacyPreview.errors.length, 0, "unchanged historical memberships remain importable");
  const invalidBook = canonical(legacyBook), member = invalidBook.sheets.DepartmentMembers.rows.find(row => row[1] === staff[0]);
  invalidBook.sheets.DepartmentMembers.rows.push([moveGroups[2].id, staff[0], member[2], "Member", 2]);
  const beforeInvalidImport = canonical(await stored(moveId));
  const invalidPreview = await suite.request(admin, "deploy", "/imports/preview", { method: "POST", body: {
    operationId: operation("invalid-import-preview"), versionId: moveId, workbook: invalidBook,
  } });
  assert.equal(invalidPreview.status, 409, JSON.stringify(invalidPreview.body));
  assert.equal(invalidPreview.body.error.code, "DEPARTMENT_MEMBERSHIP_CONFLICT");
  assert.deepEqual(await stored(moveId), beforeInvalidImport, "rejected canonical imports leave old memberships intact");
  const duplicateRoleBook = canonical(legacyBook);
  duplicateRoleBook.sheets.DepartmentMembers.rows.push([...member.slice(0, 3), "TL", 2]);
  const duplicateRole = await suite.request(admin, "deploy", "/imports/preview", { method: "POST", body: {
    operationId: operation("duplicate-role-preview"), versionId: moveId, workbook: duplicateRoleBook,
  } });
  assert.equal(duplicateRole.status, 400, JSON.stringify(duplicateRole.body));
  assert.match(duplicateRole.body.error.message, /Duplicate department member/);
  const validBook = canonical(legacyBook);
  validBook.sheets.DepartmentMembers.rows = validBook.sheets.DepartmentMembers.rows.filter(row => row[1] !== staff[0]);
  validBook.sheets.DepartmentMembers.rows.push([moveGroups[2].id, staff[0], member[2], "Member", 2]);
  const validPreview = await suite.call(admin, "deploy", "/imports/preview", {
    operationId: operation("valid-move-preview"), versionId: moveId, workbook: validBook,
  });
  const importMove = { ...(await lease(moveId)), operationId: operation("valid-move-import"), previewId: validPreview.previewId, digest: validPreview.digest };
  const importedMove = await suite.call(admin, "deploy", "/imports/apply", importMove);
  assert.deepEqual(await suite.call(admin, "deploy", "/imports/apply", importMove), importedMove);
  let afterMove = await stored(moveId);
  const departmentsFor = (groups, staffId) => groups.filter(group =>
    [group.slots, group.additionalDeputies, group.tls].some(values => values?.includes(staffId))).map(group => group.id);
  assert.deepEqual(departmentsFor(afterMove.organisations.dept, staff[0]), [moveGroups[2].id]);
  assert(afterMove.organisations.dept[0].tls.includes(staff[4]), "an excluded historical TL remains retained during another person's move");
  const excludedMove = canonical(afterMove.organisations.dept);
  excludedMove[0].tls = [];
  excludedMove[2].tls = [staff[4]];
  await denied({ ...(await lease(moveId)), operationId: operation("excluded-move"),
    edits: [{ operation: "setOrganisation", kind: "dept", expected: afterMove.organisations.dept, value: excludedMove }] },
  409, "TEACHING_ELIGIBILITY_REQUIRED");
  const staleRevision = { ...(await lease(moveId)), operationId: operation("stale-move-revision"), revision: 0,
    edits: [wire("setOrganisation", afterMove.organisations.dept, afterMove.organisations.dept, "dept")] };
  await denied(staleRevision, 409);
  const staleFence = { ...(await lease(moveId)), operationId: operation("stale-move-fence"),
    edits: [wire("setOrganisation", afterMove.organisations.dept, afterMove.organisations.dept, "dept")] };
  staleFence.leaseFence++;
  await denied(staleFence, 409);
  await denied({ operationId: operation("move-reader"), versionId: moveId,
    edits: [{ operation: "setOrganisation", kind: "dept", expected: afterMove.organisations.dept, value: [] }] }, 403, undefined, reader);
  assert.deepEqual(afterMove.organisations.comm, committees, "multiple committees remain allowed and unchanged");
  assert.deepEqual(await acceptedFacts(), acceptedBefore, "department moves do not change accepted Contacts facts or Core grants");
  assert.deepEqual(await publicationRows(), historyBefore, "department moves never rewrite sealed publication history");
  assert.deepEqual(await stored(), originalVersion, "department moves preserve another populated planning version");
  assert.deepEqual(await stored(independentId), independent, "department moves preserve an independent empty planning version");
  console.log("PASS one-department native/patch/import guards, atomic moves, historical subset retention, unchanged authority and unrelated versions");

  // Ignore the first acknowledgement, restart the actual Workers over the same
  // synthetic D1 files, and recover only the original committed move identity.
  afterMove = await stored(moveId);
  const lostValue = canonical(afterMove.organisations.dept);
  lostValue[2].slots = ["", ""];
  lostValue[1].slots.push(staff[0]);
  const lostInput = { ...(await lease(moveId)), operationId: operation("lost-move-response"),
    edits: [{ operation: "setOrganisation", kind: "dept", expected: afterMove.organisations.dept, value: lostValue }] };
  const ignored = await suite.request(admin, "deploy", "/change", { method: "POST", body: lostInput });
  assert.equal(ignored.status, 200, JSON.stringify(ignored.body));
  const durableMove = canonical(await stored(moveId));
  await suite.mf.dispose(); originalDisposed = true;
  restarted = await startProduct({ output: join(suite.path, "product"), persistPath: join(suite.path, "state"),
    migrateSchemas: false, bindings: { GSIS_SECRET: suite.secret } });
  const replayResponse = await restarted.mf.dispatchFetch(origin + "/api/deploy/change", {
    method: "POST", headers: { origin, cookie: "__Host-gsis_session=" + admin.token,
      "x-csrf-token": admin.csrf, "content-type": "application/json" }, body: JSON.stringify(lostInput),
  });
  const replay = await replayResponse.json();
  assert.equal(replayResponse.status, 200, JSON.stringify(replay));
  assert.equal(replay.data.saved, true);
  const restartedDb = await restarted.db("deploy");
  assert.deepEqual((await loadVersion(restartedDb, school, moveId)).doc, durableMove, "restart replay cannot repeat the move");
  assert.deepEqual(departmentsFor(durableMove.organisations.dept, staff[0]), [moveGroups[1].id]);
  console.log("PASS original department move receipt survives a lost acknowledgement and Worker restart without another mutation");
} finally {
  await restarted?.close();
  if (originalDisposed) await rm(suite.path, { recursive: true, force: true });
  else await suite.close();
}
