import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";
import { loadVersion } from "../v1/services/deploy/service.mjs";
import { canonical } from "../v1/runtime/store.mjs";
import { planningView } from "../v1/web/shared/deploy-loads.mjs";
import AscExport from "../shared/asc-export.js";

// All mutations and receipts below use the built owner Workers and isolated D1.
// Direct fixture writes model historical sparse rows, never a hosted database.
const suite = await productSuite(), school = "synthetic-school";
const clientId = "synthetic-load-owner-client";
let sequence = 0;
const operation = label => "synthetic-load-owner-" + label + "-" + ++sequence;
try {
  const admin = await suite.seedAccount("synthetic-load-owner-admin");
  const staffResult = await suite.call(admin, "contacts", "/save-data", {
    operationId: operation("staff"), changes: [], additions: [{ id: "synthetic-load-staff-row", values: {
      "Basic Name": "Synthetic Load Teacher", "Statutory Name": "Synthetic Load Teacher", Active: "Y",
      "School Section": "Primary", "Personnel Category": "Teaching", "EO Appt Level": "ST",
      "Employment Arrangement": "Full-time", "Appointment Status": "Confirmed", "Employment Modifier": "",
    } }],
  });
  const staffId = staffResult.mapping["synthetic-load-staff-row"];
  for (const field of ["eo", "smc", "schoolLeader"])
    await suite.call(admin, "contacts", "/staff/" + staffId + "/accept", {
      operationId: operation("authority"), field, value: field === "eo", revision: 0,
      ownerReviewReference: "Synthetic load test authority review",
    });
  const reader = await suite.seedAccount("synthetic-load-owner-reader", { capabilities: [], staffId });
  const { versionId } = await suite.call(admin, "deploy", "/versions/create", {
    operationId: operation("create"), name: "Synthetic load planning", year: 2026,
  });
  const db = await suite.db("deploy"), core = await suite.db("core");
  const stored = async () => (await loadVersion(db, school, versionId)).doc;
  const rawRows = async scopes => (await db.prepare("SELECT scope,row_id,revision,value FROM deploy_rows WHERE school_id=? AND version_id=? ORDER BY scope,row_id")
    .bind(school, versionId).all()).results.filter(row => !scopes || scopes.includes(row.scope));
  const fixtureRow = async (scope, id, value) => db.prepare("INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,?,?,1,?) ON CONFLICT(school_id,version_id,scope,row_id) DO UPDATE SET value=excluded.value")
    .bind(school, versionId, scope, id, canonical(value)).run();
  const lease = async (user = admin, client = clientId) => {
    const grant = await suite.call(user, "deploy", "/lease", {
      operationId: operation("lease"), versionId, scope: "meta", clientId: client,
    });
    return { versionId, scope: "meta", clientId: client, leaseFence: grant.fence };
  };
  const save = async (edits, extra = {}) => {
    const input = { ...(await lease()), operationId: operation("save"), edits, ...extra };
    return { input, result: await suite.call(admin, "deploy", "/change", input) };
  };
  const denied = async (input, status, code, user = admin) => {
    const before = await rawRows(), doc = await stored();
    const response = await suite.request(user, "deploy", "/change", { method: "POST", body: input });
    assert.equal(response.status, status, JSON.stringify(response.body));
    if (code) assert.equal(response.body.error.code, code, JSON.stringify(response.body));
    assert.deepEqual(await rawRows(), before, "Rejected requests must not partially mutate owning rows");
    assert.deepEqual(await stored(), doc, "Rejected requests must preserve the version/revision");
    return response;
  };
  const rejectedEdits = async (edits, status = 400, code) => denied({ ...(await lease()), operationId: operation("reject"), edits }, status, code);
  let doc = await stored();
  assert.equal(doc.loads["1"].LSP, null);
  assert.equal(Object.hasOwn(doc.loads["1"], "FORM"), false, "New documents have one derived FT/FORM identity");

  // A valid legacy subject may exist globally while being absent at this level.
  const sparse = { ...doc.loads["1"], Science: "n/a", Math: "0" };
  delete sparse.LSP;
  await fixtureRow("loads", "1", sparse);
  await fixtureRow("loads", "2", { ...doc.loads["2"], "Synthetic Support Subject": null });
  const untouchedLevel = (await rawRows(["loads"])).find(row => row.row_id === "2");
  const first = await save([{ operation: "setLoad", level: "1", subject: "LSP", value: 2.5, expected: null }]);
  assert.equal((await stored()).loads["1"].LSP, 2.5);
  assert.deepEqual((await rawRows(["loads"])).find(row => row.row_id === "2"), untouchedLevel);
  assert.deepEqual(await suite.call(admin, "deploy", "/change", first.input), first.result, "A lost response replays the original durable result");
  await denied({ ...first.input, edits: [{ operation: "setLoad", level: "1", subject: "LSP", value: 3, expected: null }] }, 409);
  await save([{ operation: "setLoad", level: "1", subject: "Science", value: "4.5", expected: null }]);
  assert.equal((await stored()).loads["1"].Science, 4.5, "Legacy n/a compares semantically with null");
  await save([{ operation: "setLoad", level: "1", subject: "Math", value: 3, expected: 0 }]);
  await save([{ operation: "setLoad", level: "1", subject: "Math", value: " (N/A) ", expected: 3 }]);
  assert.equal((await stored()).loads["1"].Math, null);
  await save([{ operation: "setLoad", level: "1", subject: "Math", value: 0, expected: null }]);
  assert.equal((await stored()).loads["1"].Math, 0, "Offered zero is distinct from not offered");
  await save([{ operation: "setLoad", level: "1", subject: "Synthetic Support Subject", value: 1, expected: null }]);
  assert.equal((await stored()).loads["1"]["Synthetic Support Subject"], 1);
  await save([{ operation: "addSubject", subject: "Synthetic Added Subject" }]);
  assert(Object.values((await stored()).loads).every(row => row["Synthetic Added Subject"] === null));
  for (const value of [true, false, -1, 101, 1.25, "NaN", "1e2", {}, []])
    await rejectedEdits([{ operation: "setLoad", level: "1", subject: "Math", value, expected: 0 }], 400);
  for (const subject of ["FT", "FORM", "PD", "TTT"])
    await rejectedEdits([{ operation: "setLoad", level: "1", subject, value: 2, expected: null }], 400, "REFERENCE_ONLY");
  for (const subject of ["__proto__", "constructor", "prototype", "Synthetic Unknown Subject"])
    await rejectedEdits([{ operation: "setLoad", level: "1", subject, value: 2, expected: null }], 400);
  await rejectedEdits([{ operation: "setLoad", level: "7", subject: "Math", value: 2, expected: null }]);
  for (const level of ["__proto__", "constructor", "prototype"])
    await rejectedEdits([{ operation: "setLoad", level, subject: "Math", value: 2, expected: null }]);
  await rejectedEdits([{ operation: "setLoad", level: "1", subject: "Math", expected: 0 }]);
  await rejectedEdits([{ operation: "setLoad", level: "1", subject: "Math", value: 8, expected: 0 },
    { operation: "setLoad", level: "1", subject: "LSP", value: true, expected: 2.5 }]);
  await rejectedEdits([{ operation: "setLoad", level: "1", subject: "Math", value: 5, expected: 9 }], 409, "REVISION_CONFLICT");
  await denied({ ...(await lease()), operationId: operation("stale-revision"), revision: (await stored()).revision - 1,
    edits: [{ operation: "setLoad", level: "1", subject: "Math", value: 5, expected: 0 }] }, 409);
  await denied({ ...(await lease()), operationId: operation("stale-fence"), leaseFence: 1000000,
    edits: [{ operation: "setLoad", level: "1", subject: "Math", value: 5, expected: 0 }] }, 409);
  await denied({ operationId: operation("reader"), versionId, edits: [{ operation: "setLoad", level: "1", subject: "Math", value: 5 }] }, 403, undefined, reader);
  await denied({ operationId: operation("anonymous"), versionId, edits: [{ operation: "setLoad", level: "1", subject: "Math", value: 5 }] }, 401, undefined, null);
  await db.prepare("INSERT INTO deploy_versions(school_id,id,name,revision,metadata,created_at) VALUES('synthetic-other-school','synthetic-foreign-load-version','Synthetic foreign version',0,'{}',?)").bind(Date.now()).run();
  const foreign = await suite.request(admin, "deploy", "/lease", { method: "POST", body: { operationId: operation("foreign"), versionId: "synthetic-foreign-load-version", scope: "meta", clientId } });
  assert.equal(foreign.status, 404);

  // Fortnight can address the same sparse standard subject. Explicit blanks
  // clear a count; they never manufacture numeric zero or touch another field.
  const split = JSON.stringify(["3", "LSP"]), oldLevel = (await stored()).loads["3"];
  const withoutLsp = { ...oldLevel }; delete withoutLsp.LSP;
  await fixtureRow("loads", "3", withoutLsp);
  await save([{ operation: "setFortnight", row: split, field: "wt", value: 2, expected: "" },
    { operation: "setFortnight", row: split, field: "remarks", value: "Synthetic retained note", expected: "" }]);
  await save([{ operation: "setFortnight", row: split, field: "wt", value: null, expected: 2 }]);
  assert.deepEqual((await stored()).fortnight[split], { wt: "", remarks: "Synthetic retained note" });
  await save([{ operation: "setFortnight", row: split, field: "wt", value: 0, expected: "" },
    { operation: "setFortnight", row: split, field: "remarks", value: null, expected: "Synthetic retained note" },
    { operation: "setFortnight", row: split, field: "enabled", value: true, expected: false }]);
  assert.deepEqual((await stored()).fortnight[split], { wt: 0, remarks: "", enabled: true });
  for (const [field, value] of [["wt", true], ["wt", -1], ["wt", 1.5], ["enabled", "false"], ["remarks", 4]])
    await rejectedEdits([{ operation: "setFortnight", row: split, field, value }]);
  await rejectedEdits([{ operation: "setFortnight", row: split, field: "wt" }]);
  await rejectedEdits([{ operation: "setFortnight", row: split, field: "wt", value: 3, expected: 9 }], 409, "REVISION_CONFLICT");
  await rejectedEdits([{ operation: "setFortnight", row: "not json", field: "wt", value: 3 }]);
  await rejectedEdits([{ operation: "setFortnight", row: JSON.stringify(["1", "FORM"]), field: "wt", value: 3 }]);
  for (const level of ["__proto__", "constructor", "prototype"])
    await rejectedEdits([{ operation: "setFortnight", row: JSON.stringify([level, "LSP"]), field: "wt", value: 3 }]);

  await save([...["Assembly", "FTGP", "FTT"].map((subject, index) => ({ operation: "setLoad", level: "1", subject, value: [1, 2, 2][index], expected: 0 }))]);
  const classA = { ref: "synthetic-load-class-a", level: "1", name: "Synthetic A", shortName: "A" };
  const classB = { ref: "synthetic-load-class-b", level: "1", name: "Synthetic B", shortName: "B" };
  await fixtureRow("classes", classA.ref, classA);
  await fixtureRow("classes", classB.ref, classB);
  const ft = { id: "synthetic-ft-assignment", target: "1A", targetRef: classA.ref, subject: "FT", teacher: staffId, level: "1" };
  await fixtureRow("assignments", ft.id, ft);
  const unusedForm = { ...(await stored()).loads["1"], FORM: 7 };
  await fixtureRow("loads", "1", unusedForm);
  const view = planningView(await stored());
  assert(!Object.hasOwn(view.loads["1"], "FORM"), "An unused legacy FORM rate is not a second derived demand");
  const preview = AscExport.preview(view);
  const classEvents = preview.events.filter(event => event.target === classA.ref);
  assert.equal(classEvents.length, 3);
  assert.deepEqual(classEvents.map(event => event.subject).sort(), ["Assembly", "FTGP", "FTT"].sort());
  assert.equal(classEvents.reduce((sum, event) => sum + event.load, 0), 5);
  const boot = await suite.call(admin, "deploy", "/bootstrap", { versionId });
  assert.equal(boot.current.reliefResults.teachers.find(person => person.teacherId === staffId).breakdown.FTT, 5,
    "The actual built calculation retains one five-period FT/FORM aggregate");

  // Historical aliases may collide or belong to a TG. A note save must not
  // silently migrate them, normalize unrelated loads or rewrite publications.
  const legacyGroup = { id: "synthetic-legacy-form-tg", name: "Synthetic legacy FORM group", subject: "FORM", level: "1", classRefs: [classA.ref], weeklyPeriods: 3 };
  await fixtureRow("groups", legacyGroup.id, legacyGroup);
  for (const entry of [
    { ...ft, id: "synthetic-legacy-form-class", subject: "FORM" },
    { ...ft, id: "synthetic-legacy-form-other-class", target: "1B", targetRef: classB.ref, subject: "FORM" },
    { id: "synthetic-legacy-form-group", target: legacyGroup.id, subject: "FORM", teacher: staffId, level: "1" },
  ]) await fixtureRow("assignments", entry.id, entry);
  const publication = JSON.stringify({ schema: 1, immutable: "synthetic-original-publication", loads: { "1": { FORM: 7 } } });
  await db.prepare("INSERT INTO deploy_publications(school_id,id,sequence,version_id,working_revision,operation_id,payload_digest,payload_key,envelope,published_at,decision_id) VALUES(?,?,1,?,0,?,?,?,?,?,?)")
    .bind(school, "synthetic-original-load-publication", versionId, "synthetic-original-load-publication-operation", "synthetic-original-digest", "synthetic-original-payload", publication, Date.now(), "synthetic-original-decision").run();
  const rawBefore = await rawRows(["loads", "classes", "groups", "assignments"]);
  const publicationBefore = (await db.prepare("SELECT * FROM deploy_publications WHERE school_id=? ORDER BY id").bind(school).all()).results;
  await save([{ operation: "setTeacherNote", teacher: staffId, value: "Synthetic note-only correction", expected: "" }]);
  assert.deepEqual(await rawRows(["loads", "classes", "groups", "assignments"]), rawBefore);
  assert.deepEqual((await db.prepare("SELECT * FROM deploy_publications WHERE school_id=? ORDER BY id").bind(school).all()).results, publicationBefore);
  assert.equal((await stored()).loads["1"].FORM, 7);
  assert(!Object.hasOwn((await stored()).loads["3"], "LSP"), "Unrelated sparse rows are not implicitly expanded by a note save");
  assert.equal(planningView(await stored()).loads["1"].FORM, 7, "Used standalone FORM remains available for historical interpretation");

  const identities = document => document.assignments.map(({ id, target, targetRef, subject, teacher }) =>
    ({ id, target, ...(targetRef ? { targetRef } : {}), subject, teacher })).sort((a, b) => a.id.localeCompare(b.id));
  const beforeWorkbook = await stored(), beforeIdentities = identities(beforeWorkbook);
  const workbook = await suite.call(admin, "deploy", "/export", { versionId, scope: "IP" });
  const previewImport = await suite.call(admin, "deploy", "/imports/preview", {
    operationId: operation("preview"), versionId, workbook,
  });
  assert.deepEqual(identities(await stored()), beforeIdentities, "Workbook preview is not a publication or assignment rewrite");
  const importInput = { ...(await lease()), operationId: operation("import"), previewId: previewImport.previewId, digest: previewImport.digest };
  const imported = await suite.call(admin, "deploy", "/imports/apply", importInput);
  assert.deepEqual(await suite.call(admin, "deploy", "/imports/apply", importInput), imported);
  assert.deepEqual(identities(await stored()), beforeIdentities, "IP workbook round-trip preserves FT/FORM class and TG assignment IDs and meanings");
  assert.deepEqual((await stored()).loads, beforeWorkbook.loads, "A non-load workbook does not migrate sparse/legacy load rows");
  assert.deepEqual((await db.prepare("SELECT * FROM deploy_publications WHERE school_id=? ORDER BY id").bind(school).all()).results, publicationBefore);

  // Authorization is decided again at the owner, rather than cached at lease acquisition.
  const revoked = await suite.seedAccount("synthetic-load-revoked-admin", { staffId });
  const pending = { ...(await lease(revoked, "synthetic-revoked-client")), operationId: operation("revoked"),
    edits: [{ operation: "setLoad", level: "1", subject: "Math", value: 9, expected: 0 }] };
  await core.prepare("DELETE FROM core_grants WHERE school_id=? AND account_id=?").bind(school, revoked.id).run();
  await denied(pending, 403, undefined, revoked);
  console.log("PASS built owner Workers/D1: sparse and legacy load saves; null/zero/half periods; strict bounds, school/capability/revision/fence and retry guards; atomic rejection; explicit blank split semantics; single FT/FORM aggregate; retained historical FORM/TG/publication rows, note-only isolation and canonical IP workbook round-trip");
} finally { await suite.close(); }
