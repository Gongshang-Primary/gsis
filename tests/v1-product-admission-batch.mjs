// Actual local Contacts and Roster D1 services; Core decision/provider fixtures
// are synthetic. This proves bounded owner admission, not live integration UAT.
import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { handle as contactsHandle } from "../v1/services/contacts/service.mjs";
import { handle as rosterHandle } from "../v1/services/roster/service.mjs";
import {
  admit,
  resolveAdmission,
  sourceChangeGuard,
} from "../v1/runtime/admission.mjs";
import {
  acquireContactsPins,
  releaseContactsPins,
} from "../v1/runtime/source-pin-batch.mjs";
import {
  canonical,
  digest,
  query,
  prepareOperation,
  operationStatus,
  abortOperation,
} from "../v1/runtime/store.mjs";
const roster = await createDatabase("roster"),
  contacts = await createDatabase("contacts");
const schoolId = "admission-batch",
  now = Date.now(),
  today = new Date(now + 28800000).toISOString().slice(0, 10),
  year = today.slice(0, 4);
let localQueries = 0,
  sourceQueries = 0,
  pause = null,
  loseAcquire = false,
  loseRelease = false,
  malformed = false,
  extraBinding = false,
  corePause = null;
const counted = (h, onPrepare) => ({
  prepare(sql) {
    onPrepare();
    return h.db.prepare(sql);
  },
  batch: (items) => h.db.batch(items),
});
const db = counted(roster, () => localQueries++),
  sourceDb = {
    ...counted(contacts, () => sourceQueries++),
    async batch(items) {
      if (pause && items.length === 3) {
        const callback = pause;
        pause = null;
        await callback();
      }
      return contacts.db.batch(items);
    },
  };
const principal = {
  schoolId,
  actorId: "admin",
  staffId: "staff-0",
  decisionId: "decision",
  validUntil: now + 600000,
  capabilities: [
    "admin",
    "roster.admin",
    "roster.own",
    "roster.read",
    "roster.write",
  ],
  requestDigest: "a".repeat(64),
  action: "roster.own",
  dependencies: [
    {
      owner: "core",
      scope: "authority:admin",
      revision: "1",
      validUntil: now + 600000,
    },
  ],
};
const ok = (data) => Response.json({ ok: true, data }),
  requests = [];
const core = {
  fetch: async (request) => {
    const b = await request.json(),
      path = new URL(request.url).pathname;
    if (path === "/internal/decision")
      return ok({
        principal,
        descriptor: {
          write: true,
          bodyDigest: principal.requestDigest,
          action: principal.action,
          service: "roster",
          operationId: b.operationId,
        },
      });
    if (path === "/internal/pins/acquire") {
      if (corePause) {
        const f = corePause;
        corePause = null;
        await f();
      }
      return ok({
        pinId: b.pinId,
        owner: "core",
        scope: b.scope,
        revision: b.revision,
        validUntil: b.validUntil,
      });
    }
    if (path === "/internal/pins/release")
      return ok({ pinId: b.pinId, state: "released" });
    if (path === "/internal/evidence/receipt") return ok({ recorded: true });
    throw Error("Unexpected Core route " + path);
  },
};
const sourceEnv = {
  SERVICE_NAME: "contacts",
  SCHOOL_ID: schoolId,
  GSIS_SECRET: "synthetic-only",
  DB: sourceDb,
  CORE: core,
  ROSTER: {
    fetch: async (request) => {
      const b = await request.json();
      return ok(await operationStatus(db, b.schoolId, b.operationId));
    },
  },
};
const env = {
  SERVICE_NAME: "roster",
  SCHOOL_ID: schoolId,
  GSIS_SECRET: "synthetic-only",
  DB: db,
  get ARTIFACTS() {
    return roster.bucket;
  },
  CORE: core,
  CONTACTS: {
    fetch: async (request) => {
      const path = new URL(request.url).pathname,
        b = await request.json();
      requests.push({ path, body: structuredClone(b) });
      try {
        let result = await contactsHandle({
          env: sourceEnv,
          internal: true,
          path,
          body: b,
          method: "POST",
          now,
          request,
        });
        if (path === "/internal/pins/acquire-batch" && loseAcquire) {
          loseAcquire = false;
          throw Error("Lost acquire response");
        }
        if (path === "/internal/pins/release-batch" && loseRelease) {
          loseRelease = false;
          throw Error("Lost release response");
        }
        if (path === "/internal/pins/acquire-batch" && extraBinding) {
          extraBinding = false;
          result.pins = result.pins.map((p) => ({
            ...p,
            binding: { fence: 999 },
            batchVersion: 99,
            state: "released",
          }));
        }
        if (path === "/internal/pins/acquire-batch" && malformed) {
          malformed = false;
          result = { pins: [...result.pins.slice(1), result.pins.at(-1)] };
        }
        return ok(result);
      } catch (e) {
        if (!e.status) throw e;
        return Response.json(
          {
            ok: false,
            error: { code: e.code, message: e.message, retryable: e.retryable },
          },
          { status: e.status },
        );
      }
    },
  },
  CALENDAR: {
    fetch: async (request) => {
      const b = await request.json();
      return ok({
        rows: [
          {
            date: b.from,
            available: true,
            schoolDay: true,
            parity: "single",
            revision: "cal-1",
          },
        ],
        revision: "cal-1",
        asOf: now,
      });
    },
  },
  DEPLOY: {
    fetch: async () =>
      ok({
        schoolId,
        publicationId: "pub",
        publicationSequence: 1,
        calculationVersion: "wi/1",
        rows: [],
        dependencies: [],
      }),
  },
  VENUES: { fetch: async () => ok({ venues: [] }) },
};
const call = (body) =>
  rosterHandle({
    env,
    principal,
    now,
    clock: () => now,
    path: "/operations",
    body,
    method: "POST",
    request: new Request("https://synthetic.invalid/operations"),
  });
async function seed(from, to) {
  const ids = Array.from({ length: to - from }, (_, i) => i + from);
  await contacts.db
    .prepare(
      "INSERT INTO contacts_staff(school_id,staff_id,basic_name,ttb_name,active,profile_state,revision,created_at) SELECT ?,'staff-'||value,'Teacher '||value,'T'||value,1,'accepted',1,? FROM json_each(?)",
    )
    .bind(schoolId, now, canonical(ids))
    .run();
  for (const [field, value] of Object.entries({
    employmentActive: true,
    eo: true,
    role: "Teacher",
    employmentArrangement: "Full-time",
  }))
    await contacts.db
      .prepare(
        "INSERT INTO contacts_fields(school_id,staff_id,field,revision,state,value_json,valid_from,proposer,accepter,accepted_at,operation_id) SELECT ?,'staff-'||value,?,1,'accepted',?,?,'proposer','accepter',?,'fixture-seed' FROM json_each(?)",
      )
      .bind(
        schoolId,
        field,
        canonical(value),
        now - 1000,
        now - 1000,
        canonical(ids),
      )
      .run();
}
async function prepare(id) {
  return prepareOperation(roster.db, {
    schoolId,
    actorId: principal.actorId,
    operationId: id,
    action: "roster.saveOpeningBalances",
    intent: { operationId: id },
    now,
    validUntil: principal.validUntil,
    authorization: principal,
  });
}
async function input(op, ids = ["staff-0", "staff-1"]) {
  return {
    schoolId,
    destination: "roster",
    operationId: op.operationId,
    digest: op.digest,
    fence: op.fence,
    decisionId: principal.decisionId,
    pins: await Promise.all(
      ids.map(async (id) => ({
        pinId: await digest([
          schoolId,
          "roster",
          op.operationId,
          op.fence,
          "contacts",
          "staff:" + id,
        ]),
        scope: "staff:" + id,
        revision: "1",
        validUntil: principal.validUntil,
      })),
    ),
  };
}
async function pins(op) {
  return query(
    contacts.db,
    "SELECT * FROM source_pins WHERE school_id=? AND operation_id=?",
    [schoolId, op.operationId],
  );
}
try {
  for (const [key, value] of Object.entries({
    effectiveDate: year + "-01-01",
    fairnessMode: "opening-balances",
  }))
    await roster.db
      .prepare(
        "INSERT INTO roster_records(school_id,collection,record_id,revision,payload_json) VALUES(?,?,?,1,?)",
      )
      .bind(
        schoolId,
        "freshStart",
        key,
        canonical({ kind: "map", data: value }),
      )
      .run();
  let previous = 0;
  for (const size of [200, 512]) {
    await seed(previous, size);
    previous = size;
    const view = await call({ operation: "openingBalances" });
    assert.equal(view.rows.length, size);
    const command = {
      operation: "saveOpeningBalances",
      operationId: "full-" + size,
      requestId: "full-" + size,
      revision: view.revision,
      rows: view.rows.map((r) => ({
        staffId: r.staffId,
        version: r.version,
        cumulativeQuota: 20,
        cumulativeDone: 4,
        asOfDate: r.asOfDate,
      })),
      reason: "Reviewed actual Contacts projection",
      confirmInitial: size === 200,
    };
    localQueries = 0;
    sourceQueries = 0;
    requests.length = 0;
    const result = await call(command),
      ownerCount = localQueries,
      sourceCount = sourceQueries;
    assert.equal(result.rows.length, size);
    assert(
      ownerCount <= 50,
      "entire Roster handler plus source callbacks <=50 SQL: " + ownerCount,
    );
    assert(
      sourceCount <= 50,
      "all Contacts requests combined <=50 SQL: " + sourceCount,
    );
    assert.equal(
      requests.filter((r) => r.path === "/internal/pins/acquire-batch").length,
      1,
    );
    assert.equal(
      requests.filter((r) => r.path === "/internal/pins/release-batch").length,
      1,
    );
    const saved = await pins({ operationId: command.operationId });
    assert.equal(saved.length, size);
    assert(saved.every((p) => p.state === "released"));
    await roster.restart();
    await contacts.restart();
    const retry = await call(command);
    assert.deepEqual(retry.receipt, result.receipt);
    console.log(
      "PASS full " +
        size +
        "-staff Contacts→Roster opening-save: " +
        ownerCount +
        " destination SQL including callbacks; " +
        sourceCount +
        " Contacts SQL; one batch acquire/release; durable retry",
    );
  }
  const good = await prepare("retry-held"),
    goodInput = await input(good);
  const first = await acquireContactsPins(sourceEnv, goodInput, now);
  assert.deepEqual(await acquireContactsPins(sourceEnv, goodInput, now), first);
  const g = sourceChangeGuard(
    schoolId,
    "staff:staff-0",
    "unrelated",
    "contacts",
  );
  assert.equal(
    (
      await contacts.db
        .prepare(g.sql)
        .bind(...g.args)
        .first()
    ).ok,
    0,
    "existing individual writer guard blocks held member",
  );
  assert.equal(
    (await releaseContactsPins(sourceEnv, goodInput, now + 700000)).state,
    "held",
    "expiry alone never releases unresolved pins",
  );
  const statusBinding = sourceEnv.ROSTER;
  sourceEnv.ROSTER = {
    fetch: async () =>
      Response.json(
        {
          ok: false,
          error: {
            code: "DEPENDENCY_UNAVAILABLE",
            message: "Synthetic status outage",
          },
        },
        { status: 503 },
      ),
  };
  await assert.rejects(
    releaseContactsPins(sourceEnv, goodInput, now),
    (e) => e.code === "DEPENDENCY_UNAVAILABLE",
  );
  sourceEnv.ROSTER = statusBinding;
  assert((await pins(good)).every((p) => p.state === "held"));
  const changed = await prepare("changed"),
    changedInput = await input(changed);
  changedInput.pins[1].revision = "2";
  await assert.rejects(
    acquireContactsPins(sourceEnv, changedInput, now),
    (e) => e.code === "AUTHORITY_CHANGED",
  );
  assert.equal((await pins(changed)).length, 0);
  const pending = await prepare("pending-source");
  await contacts.db
    .prepare(
      "INSERT INTO source_changes(school_id,scope,operation_id,created_at,state) VALUES(?,?,'queued-update',?,'pending')",
    )
    .bind(schoolId, "staff:staff-1", now)
    .run();
  await assert.rejects(
    acquireContactsPins(sourceEnv, await input(pending), now),
    (e) => e.code === "AUTHORITY_CHANGED",
  );
  assert.equal((await pins(pending)).length, 0);
  await contacts.db
    .prepare("DELETE FROM source_changes WHERE operation_id='queued-update'")
    .run();
  for (const edit of [
    (x) => (x.schoolId = "other"),
    (x) => x.fence++,
    (x) => (x.digest = "b".repeat(64)),
    (x) => x.pins.push(x.pins[0]),
    (x) => (x.pins[0].validUntil = now - 1),
    (x) => (x.pins[0].scope = "catalogue:roles"),
    (x) => (x.pins = Array(513).fill(x.pins[0])),
  ]) {
    const altered = structuredClone(goodInput);
    edit(altered);
    await assert.rejects(acquireContactsPins(sourceEnv, altered, now));
  }
  const revisionRace = await prepare("revision-race"),
    revisionInput = await input(revisionRace);
  pause = async () =>
    contacts.db
      .prepare(
        "UPDATE contacts_staff SET revision=2 WHERE school_id=? AND staff_id='staff-1'",
      )
      .bind(schoolId)
      .run();
  await assert.rejects(
    acquireContactsPins(sourceEnv, revisionInput, now),
    (e) => e.code === "AUTHORITY_CHANGED",
  );
  assert.equal((await pins(revisionRace)).length, 0);
  await contacts.db
    .prepare(
      "UPDATE contacts_staff SET revision=1 WHERE school_id=? AND staff_id='staff-1'",
    )
    .bind(schoolId)
    .run();
  const delayed = await prepare("delayed"),
    delayedInput = await input(delayed);
  pause = async () => {
    await abortOperation(
      roster.db,
      delayed,
      "paused-before-source-insert",
      now,
    );
    await releaseContactsPins(sourceEnv, delayedInput, now);
  };
  await assert.rejects(
    acquireContactsPins(sourceEnv, delayedInput, now),
    (e) => e.code === "AUTHORITY_CHANGED",
  );
  assert(
    (await pins(delayed)).every((p) => p.state === "released"),
    "tombstones fence source resumed after terminal release",
  );
  await abortOperation(roster.db, good, "done", now);
  await assert.rejects(
    releaseContactsPins(
      sourceEnv,
      { ...goodInput, decisionId: "changed-decision" },
      now,
    ),
    (e) => e.code === "PIN_CONFLICT",
  );
  await releaseContactsPins(sourceEnv, goodInput, now);
  assert.equal(
    (
      await contacts.db
        .prepare(g.sql)
        .bind(...g.args)
        .first()
    ).ok,
    1,
    "same individual writer guard clears after terminal release",
  );
  await assert.rejects(acquireContactsPins(sourceEnv, goodInput, now));
  const dependencies = ["staff-0", "staff-1"].map((id) => ({
    owner: "contacts",
    scope: "staff:" + id,
    revision: "1",
  }));
  const lost = await prepare("lost-acquire");
  loseAcquire = true;
  loseRelease = true;
  await assert.rejects(
    admit(env, db, lost, principal, dependencies, now),
    (e) => e.code === "DEPENDENCY_UNAVAILABLE",
  );
  assert.equal(
    (await operationStatus(roster.db, schoolId, lost.operationId)).state,
    "aborted",
  );
  const stored = (
    await query(
      roster.db,
      "SELECT * FROM product_admissions WHERE operation_id=?",
      [lost.operationId],
    )
  )[0];
  assert.equal(stored.state, "resolving");
  const uncertain = JSON.parse(stored.pins_json);
  assert.equal(uncertain.length, 3);
  assert(
    uncertain
      .filter((p) => p.owner === "contacts")
      .every((p) => p.binding.fence === 1 && p.revision === "1"),
    "original uncertain binding survives abort fence increment",
  );
  await roster.restart();
  await contacts.restart();
  const resolved = await resolveAdmission(
    env,
    db,
    await operationStatus(roster.db, schoolId, lost.operationId),
    null,
    null,
    now,
  );
  assert.equal(resolved.state, "resolved");
  assert((await pins(lost)).every((p) => p.state === "released"));
  const malformedOp = await prepare("malformed");
  malformed = true;
  await assert.rejects(
    admit(env, db, malformedOp, principal, dependencies, now),
    (e) => e.code === "PIN_RESPONSE_INVALID",
  );
  assert.equal(
    (await operationStatus(roster.db, schoolId, malformedOp.operationId)).state,
    "aborted",
  );
  assert((await pins(malformedOp)).every((p) => p.state === "released"));
  const oversized = await prepare("oversized-runtime"),
    beforeRequests = requests.length;
  await assert.rejects(
    admit(
      env,
      db,
      oversized,
      principal,
      Array.from({ length: 513 }, (_, i) => ({
        owner: "contacts",
        scope: "staff:staff-" + i,
        revision: "1",
      })),
      now,
    ),
    (e) => e.code === "PIN_BATCH_BOUNDS",
  );
  assert.equal(requests.length, beforeRequests);
  assert.equal(
    (
      await query(
        roster.db,
        "SELECT * FROM product_admissions WHERE operation_id=?",
        [oversized.operationId],
      )
    ).length,
    0,
  );
  const extra = await prepare("extra-response-fields");
  extraBinding = true;
  await admit(env, db, extra, principal, dependencies, now);
  const protectedPins = JSON.parse(
    (
      await query(
        roster.db,
        "SELECT pins_json FROM product_admissions WHERE operation_id=?",
        [extra.operationId],
      )
    )[0].pins_json,
  ).filter((p) => p.owner === "contacts");
  assert(
    protectedPins.every(
      (p) =>
        p.batchVersion === 1 && p.binding.fence === 1 && p.state === "held",
    ),
  );
  await abortOperation(roster.db, extra, "test-complete", now);
  assert.equal(
    (await resolveAdmission(env, db, extra, null, null, now)).state,
    "resolved",
  );
  const beforeLater = await prepare("fail-before-later-owner");
  await assert.rejects(
    admit(
      env,
      db,
      beforeLater,
      principal,
      [
        { ...dependencies[0], revision: "2" },
        dependencies[1],
        { owner: "deploy", scope: "publication:future", revision: "1" },
      ],
      now,
    ),
    (e) => e.code === "AUTHORITY_CHANGED",
  );
  const laterRow = (
    await query(
      roster.db,
      "SELECT * FROM product_admissions WHERE operation_id=?",
      [beforeLater.operationId],
    )
  )[0];
  assert.equal(
    laterRow.state,
    "resolved",
    "never-dispatched legacy pins do not cause permanent recovery",
  );
  assert.equal(
    JSON.parse(laterRow.pins_json).find((p) => p.owner === "deploy").state,
    "planned",
  );
  const overlapping = await prepare("overlapping");
  let started, continueCore;
  const entered = new Promise((resolve) => (started = resolve)),
    gate = new Promise((resolve) => (continueCore = resolve));
  corePause = async () => {
    started();
    await gate;
  };
  const firstAttempt = admit(
    env,
    db,
    overlapping,
    principal,
    dependencies,
    now,
  ).catch((error) => error);
  await entered;
  await assert.rejects(
    admit(env, db, overlapping, principal, dependencies, now),
    (e) => e.code === "OPERATION_ABORTED",
  );
  const immutable = JSON.parse(
    (
      await query(
        roster.db,
        "SELECT pins_json FROM product_admissions WHERE operation_id=?",
        [overlapping.operationId],
      )
    )[0].pins_json,
  );
  assert.equal(
    immutable.length,
    3,
    "overlap retains the whole original membership",
  );
  continueCore();
  assert.equal((await firstAttempt).code, "OPERATION_ABORTED");
  assert.equal(
    (await pins(overlapping)).length,
    0,
    "planned Contacts group was never dispatched",
  );
  const wrongActor = await prepare("wrong-actor"),
    wrongActorInput = await input(wrongActor);
  principal.actorId = "other";
  await assert.rejects(
    acquireContactsPins(sourceEnv, wrongActorInput, now),
    (e) => e.code === "OPERATION_CONFLICT",
  );
  principal.actorId = "admin";
  principal.impersonating = true;
  await assert.rejects(
    acquireContactsPins(sourceEnv, wrongActorInput, now),
    (e) => e.code === "CAPABILITY_DENIED",
  );
  principal.impersonating = false;
  const deadline = principal.validUntil;
  principal.validUntil = now - 1;
  await assert.rejects(
    acquireContactsPins(sourceEnv, wrongActorInput, now),
    (e) => e.code === "CAPABILITY_DENIED",
  );
  principal.validUntil = deadline;
  console.log(
    "PASS individual-pin compatibility, source revision/pending-change atomic rejection, wrong binding/bounds/expiry, paused acquire tombstones, source writer guards, lost acquire/release ACK restart recovery and malformed-response fencing",
  );
} finally {
  await contacts.close();
  await roster.close();
}
