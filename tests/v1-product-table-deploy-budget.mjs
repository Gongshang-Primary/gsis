import assert from "node:assert/strict";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import {
  handle,
  loadVersion,
  changesFor,
} from "../v1/services/deploy/service.mjs";
import {
  statement,
  one,
  prepareOperation,
  commitOperation,
  operationStatus,
  canonical,
} from "../v1/runtime/store.mjs";
// Local D1/storage evidence. Core admission is synthetic here; the Core matrix is tested separately.
const h = await createDatabase("deploy"),
  now = Date.now(),
  school = "budget-school";
let count = 0,
  enforce = false;
const countQuery = (n) => {
  count += n;
  if (enforce && count > 50)
    throw Error("D1 local query budget exceeded: " + count);
};
const raw = new WeakMap();
function wrap(stmt) {
  const proxy = new Proxy(stmt, {
    get(target, key) {
      if (key === "bind") return (...args) => wrap(target.bind(...args));
      if (["run", "all", "first", "raw"].includes(key))
        return (...args) => {
          countQuery(1);
          return target[key](...args);
        };
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  raw.set(proxy, stmt);
  return proxy;
}
const db = {
  prepare: (sql) => wrap(h.db.prepare(sql)),
  batch: (statements) => {
    countQuery(statements.length);
    return h.db.batch(statements.map((s) => raw.get(s) || s));
  },
};
const principal = {
  schoolId: school,
  actorId: "actor-a",
  staffId: "staff-a",
  sessionId: "session-a",
  impersonating: false,
  capabilities: ["admin", "deploy.read", "deploy.edit", "deploy.publish"],
  decisionId: "decision-a",
  validUntil: now + 3600000,
  revisions: {},
  dependencies: [
    {
      owner: "core",
      scope: "account:actor-a",
      revision: "1",
      validUntil: now + 3600000,
    },
  ],
  requestDigest: "synthetic-request-digest",
  action: "deploy.edit",
};
const env = {
  SCHOOL_ID: school,
  SERVICE_NAME: "deploy",
  GSIS_SECRET: "synthetic-only-secret",
  DB: db,
  CORE: {
    fetch: async (req) => {
      const body = await req.json();
      return Response.json({
        ok: true,
        data: new URL(req.url).pathname.endsWith("/release")
          ? { pinId: body.pinId, state: "released" }
          : {
              pinId: body.pinId,
              owner: "core",
              scope: body.scope,
              revision: body.revision,
              validUntil: body.validUntil,
            },
      });
    },
  },
  CONTACTS: {
    fetch: async () =>
      Response.json({
        ok: true,
        data: {
          staff: [],
          revision: "contacts-1",
          sequence: 1,
          asOf: now,
          observation: { evaluationId: "observation-a", asOf: now },
          dependencies: [],
        },
      }),
  },
};
const call = (path, body) =>
  handle({
    env,
    path,
    body: structuredClone(body),
    principal,
    now,
    method: "POST",
    request: new Request("https://synthetic.invalid" + path),
    requestId: crypto.randomUUID(),
  });
async function measured(path, body) {
  count = 0;
  enforce = true;
  try {
    const result = await call(path, body);
    return { result, queries: count, request: body };
  } finally {
    enforce = false;
  }
}
async function edit(versionId, operationId, edits, revision) {
  const lease = await call("/lease", {
    operationId: operationId + "-lease",
    versionId,
    scope: "meta",
    clientId: "budget-client",
  });
  return measured("/change", {
    operationId,
    versionId,
    scope: "meta",
    clientId: "budget-client",
    leaseFence: lease.fence,
    revision,
    operation: "saveDraft",
    edits,
  });
}
let serial = 0;
async function applyPlan(plan) {
  const op = await prepareOperation(h.db, {
    schoolId: school,
    actorId: principal.actorId,
    operationId: "plan-" + ++serial,
    action: "deploy.edit",
    intent: { serial },
    now,
    validUntil: now + 3600000,
  });
  const admission = await syntheticAdmission(h.db, op);
  return commitOperation(h.db, op, {
    now,
    admission,
    guards: plan.guards,
    writes: plan.writes,
    result: { changedRows: plan.changedRows },
  });
}
try {
  const created = await measured("/versions/create", {
    operationId: "create-budget",
    name: "Budget plan",
  });
  const versionId = created.result.versionId;
  const duties = Array.from({ length: 40 }, (_, i) => ({
    id: "duty-" + i,
    name: "Duty " + i,
    category: "Before School",
    start: "07:00",
    end: "07:30",
    days: [],
    description: "",
    teachers: {},
  }));
  const inserted = await edit(
    versionId,
    "insert-40",
    [{ operation: "setDuties", value: duties, expected: [] }],
    0,
  );
  assert.equal(
    inserted.result.changedRows,
    42,
    "40 duty rows plus order row and existing metadata normalization",
  );
  assert(inserted.queries <= 50);
  const before = await loadVersion(h.db, school, versionId),
    nextDuties = structuredClone(before.doc.duties);
  nextDuties.forEach(
    (d) => (d.description = 'Literal \\ and "quotes" 中文 🏫 ' + d.id),
  );
  const updated = await edit(
    versionId,
    "update-40",
    [
      {
        operation: "setDuties",
        value: nextDuties,
        expected: before.doc.duties,
      },
    ],
    1,
  );
  assert.equal(updated.result.changedRows, 40);
  assert(updated.queries <= 50);
  const after = await loadVersion(h.db, school, versionId);
  assert.deepEqual(after.doc.duties, nextDuties);
  assert(
    after.rows
      .filter((r) => r.scope === "duties")
      .every((r) => r.revision === 2),
  );
  const audit = await one(
    h.db,
    "SELECT details_json AS details FROM product_audit WHERE school_id=? AND operation_id=?",
    [school, "update-40"],
  );
  assert.equal(JSON.parse(audit.details).changedRows, 40);
  // One changed row races: every other write and its receipt must roll back.
  let loaded = await loadVersion(h.db, school, versionId),
    next = structuredClone(loaded.doc);
  next.duties[0].name = "Candidate zero";
  next.duties[1].name = "Candidate one";
  let plan = changesFor(school, versionId, loaded.rows, next);
  const outsider = { ...loaded.doc.duties[0], name: "Concurrent owner edit" };
  await statement(
    h.db,
    "UPDATE deploy_rows SET value=?,revision=revision+1 WHERE school_id=? AND version_id=? AND scope=? AND row_id=?",
    [canonical(outsider), school, versionId, "duties", "duty-0"],
  ).run();
  await assert.rejects(applyPlan(plan), (e) => e.code === "REVISION_CONFLICT");
  loaded = await loadVersion(h.db, school, versionId);
  assert.equal(loaded.doc.duties[0].name, "Concurrent owner edit");
  assert.equal(loaded.doc.duties[1].name, "Duty 1");
  // An unrelated row changes without participating in the delta; it must survive.
  next = structuredClone(loaded.doc);
  next.duties[2].name = "Disjoint edit";
  plan = changesFor(school, versionId, loaded.rows, next);
  const unrelated = { ...loaded.doc.duties[3], name: "Unrelated edit" };
  await statement(
    h.db,
    "UPDATE deploy_rows SET value=?,revision=revision+1 WHERE school_id=? AND version_id=? AND scope=? AND row_id=?",
    [canonical(unrelated), school, versionId, "duties", "duty-3"],
  ).run();
  await applyPlan(plan);
  loaded = await loadVersion(h.db, school, versionId);
  assert.equal(loaded.doc.duties[2].name, "Disjoint edit");
  assert.equal(loaded.doc.duties[3].name, "Unrelated edit");
  // An insert must still mean absent, not revision zero.
  next = structuredClone(loaded.doc);
  const fresh = { ...duties[0], id: "fresh-duty", name: "Requested new row" };
  next.duties.push(fresh);
  plan = changesFor(school, versionId, loaded.rows, next);
  await statement(
    h.db,
    "INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,?,?,?,?)",
    [
      school,
      versionId,
      "duties",
      "fresh-duty",
      0,
      canonical({ ...fresh, name: "Concurrent insert" }),
    ],
  ).run();
  await assert.rejects(applyPlan(plan), (e) => e.code === "REVISION_CONFLICT");
  assert.equal(
    JSON.parse(
      (
        await one(
          h.db,
          "SELECT value FROM deploy_rows WHERE school_id=? AND version_id=? AND scope=? AND row_id=?",
          [school, versionId, "duties", "fresh-duty"],
        )
      ).value,
    ).name,
    "Concurrent insert",
  );
  // School/version identity is part of both set-based writes, even for matching row IDs.
  for (const [otherSchool, otherVersion] of [
    ["other-school", versionId],
    [school, "other-version"],
  ]) {
    await statement(
      h.db,
      "INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,?,?,?,?)",
      [
        otherSchool,
        otherVersion,
        "duties",
        "duty-4",
        9,
        canonical({ id: "duty-4", sentinel: true }),
      ],
    ).run();
  }
  // A conflict rolls back a mixed delete/insert/update, not only a pair of updates.
  loaded = await loadVersion(h.db, school, versionId);
  next = structuredClone(loaded.doc);
  next.duties = next.duties.filter((d) => d.id !== "duty-4");
  next.duties.push({ ...fresh, id: "mixed-new" });
  next.duties.find((d) => d.id === "duty-5").name = "Candidate mixed";
  plan = changesFor(school, versionId, loaded.rows, next);
  await statement(
    h.db,
    "UPDATE deploy_rows SET revision=revision+1 WHERE school_id=? AND version_id=? AND scope=? AND row_id=?",
    [school, versionId, "duties", "duty-5"],
  ).run();
  await assert.rejects(applyPlan(plan), (e) => e.code === "REVISION_CONFLICT");
  assert.equal(
    (
      await one(
        h.db,
        "SELECT COUNT(*) AS n FROM deploy_rows WHERE school_id=? AND version_id=? AND scope=? AND row_id=?",
        [school, versionId, "duties", "duty-4"],
      )
    ).n,
    1,
  );
  assert.equal(
    await one(
      h.db,
      "SELECT 1 FROM deploy_rows WHERE school_id=? AND version_id=? AND scope=? AND row_id=?",
      [school, versionId, "duties", "mixed-new"],
    ),
    null,
  );
  // Guarded deletion and insertion share one atomic plan, preserving literal JSON.
  loaded = await loadVersion(h.db, school, versionId);
  next = structuredClone(loaded.doc);
  next.duties = next.duties.filter((d) => d.id !== "duty-4");
  next.duties.push({
    ...fresh,
    id: "second-new",
    name: 'New literal " row',
    optional: null,
  });
  plan = changesFor(school, versionId, loaded.rows, next);
  assert.equal(plan.writes.length, 2);
  await applyPlan(plan);
  assert.equal(
    await one(
      h.db,
      "SELECT 1 AS found FROM deploy_rows WHERE school_id=? AND version_id=? AND scope=? AND row_id=?",
      [school, versionId, "duties", "duty-4"],
    ),
    null,
  );
  assert.equal(
    JSON.parse(
      (
        await one(
          h.db,
          "SELECT value FROM deploy_rows WHERE school_id=? AND version_id=? AND scope=? AND row_id=?",
          [school, versionId, "duties", "second-new"],
        )
      ).value,
    ).name,
    'New literal " row',
  );
  assert.equal(
    (await loadVersion(h.db, school, versionId)).doc.duties.find(
      (d) => d.id === "second-new",
    ).optional,
    null,
  );
  for (const [otherSchool, otherVersion] of [
    ["other-school", versionId],
    [school, "other-version"],
  ]) {
    const unchanged = await one(
      h.db,
      "SELECT revision,value FROM deploy_rows WHERE school_id=? AND version_id=? AND scope=? AND row_id=?",
      [otherSchool, otherVersion, "duties", "duty-4"],
    );
    assert.equal(unchanged.revision, 9);
    assert.deepEqual(JSON.parse(unchanged.value), {
      id: "duty-4",
      sentinel: true,
    });
  }
  // UTF-8 bytes, rather than JS character count, bound the complete unchunked delta.
  loaded = await loadVersion(h.db, school, versionId);
  next = structuredClone(loaded.doc);
  next.duties[0].description = "🏫".repeat(270000);
  const countBefore = (
    await one(
      h.db,
      "SELECT COUNT(*) AS n FROM deploy_rows WHERE school_id=? AND version_id=?",
      [school, versionId],
    )
  ).n;
  assert.throws(
    () => changesFor(school, versionId, loaded.rows, next),
    (e) => e.code === "EDIT_BOUNDS" && e.status === 413,
  );
  assert.equal(
    (
      await one(
        h.db,
        "SELECT COUNT(*) AS n FROM deploy_rows WHERE school_id=? AND version_id=?",
        [school, versionId],
      )
    ).n,
    countBefore,
  );
  // Deterministic rejection fences the prepared request before any owner write.
  const beforeOversize = await loadVersion(h.db, school, versionId);
  const oversized = structuredClone(beforeOversize.doc.duties);
  oversized.forEach((d) => {
    d.description = "🏫".repeat(8000);
  });
  await assert.rejects(
    edit(
      versionId,
      "oversize-duty",
      [
        {
          operation: "setDuties",
          value: oversized,
          expected: beforeOversize.doc.duties,
        },
      ],
      beforeOversize.version.revision,
    ),
    (e) => e.code === "EDIT_BOUNDS" && e.status === 413,
  );
  const rejected = await operationStatus(h.db, school, "oversize-duty");
  assert.equal(rejected.state, "aborted");
  assert.equal(rejected.receipt.state, "terminal-not-committed");
  assert.equal(rejected.receipt.reason, "EDIT_BOUNDS");
  const afterOversize = await loadVersion(h.db, school, versionId);
  assert.deepEqual(afterOversize.rows, beforeOversize.rows);
  assert.equal(afterOversize.version.revision, beforeOversize.version.revision);
  assert.equal(
    await one(
      h.db,
      "SELECT 1 AS found FROM product_audit WHERE school_id=? AND operation_id=?",
      [school, "oversize-duty"],
    ),
    null,
  );
  await assert.rejects(
    edit(
      versionId,
      "oversize-duty",
      [
        {
          operation: "setDuties",
          value: oversized,
          expected: beforeOversize.doc.duties,
        },
      ],
      beforeOversize.version.revision,
    ),
    (e) => e.code === "OPERATION_ABORTED",
  );
  // Committed receipt recovery precedes even lookup of a subsequently deleted version.
  assert.equal(
    (await operationStatus(h.db, school, "update-40")).state,
    "committed",
  );
  await statement(
    h.db,
    "UPDATE deploy_versions SET deleted=1 WHERE school_id=? AND id=?",
    [school, versionId],
  ).run();
  assert.deepEqual(await call("/change", updated.request), updated.result);
  console.log(
    `PASS real D1 40-row atomic update ${updated.queries}/50 local statements (insert ${inserted.queries}, create ${created.queries}); row CAS/absence, unrelated changes, deletion/upsert, literal JSON and UTF8 bounds`,
  );
} finally {
  await h.close();
}
