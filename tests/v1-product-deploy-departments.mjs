import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import AscExport from "../shared/asc-export.js";
import Fields from "../v1/services/deploy/planning-fields.mjs";
import { productSuite } from "./v1-product/suite.mjs";
import { loadVersion } from "../v1/services/deploy/service.mjs";

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
let serial = 0;
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
  const stored = async () => (await loadVersion(db, school, versionId)).doc;
  const bootstrap = () => suite.call(admin, "deploy", "/bootstrap", { versionId });
  const lease = async () => {
    const grant = await suite.call(admin, "deploy", "/lease", {
      operationId: operation("lease"), versionId, scope: "meta", clientId: "synthetic-department-client",
    });
    return { versionId, scope: "meta", clientId: "synthetic-department-client", leaseFence: grant.fence };
  };
  const save = async edits => {
    const input = { ...(await lease()), operationId: operation("save"), edits };
    return { input, result: await suite.call(admin, "deploy", "/change", input) };
  };
  const denied = async (input, status, code, user = admin) => {
    const before = canonical(await stored());
    const response = await suite.request(user, "deploy", "/change", { method: "POST", body: input });
    assert.equal(response.status, status, JSON.stringify(response.body));
    if (code) assert.equal(response.body.error.code, code, JSON.stringify(response.body));
    assert.deepEqual(await stored(), before, "a rejected patch must not change owning D1");
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
} finally {
  await suite.close();
}
