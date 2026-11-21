// Regression test for Core -> Contacts bounded validUntil-scoped authority read cache (D01/D02).
import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { productSuite } from "./v1-product/suite.mjs";
import { handle as core, authorizeCore } from "../v1/services/core/service.mjs";
import { handle as contacts } from "../v1/services/contacts/service.mjs";
import { makeSnapshots } from "../v1/services/contacts/store.mjs";
import {
  AUTH_CACHE_MAX_ENTRIES,
  AUTH_CACHE_TTL_MS,
  getCachedAuthority,
  setCachedAuthority,
  invalidateAuthorityCache,
} from "../v1/services/core/auth-cache.mjs";
import { digest, canonical } from "../v1/runtime/store.mjs";
import { requireMembership } from "../v1/runtime/admission.mjs";

// Part 1: Direct authorizeCore + real Contacts D1 wrapped in a counting service binding.
const c = await createDatabase("core");
const p = await createDatabase("contacts");
try {
  const schoolId = "synthetic-school";
  const secret = "synthetic-cache-secret";
  const origin = "https://gsis.example.invalid";
  const baseNow = Date.now();
  const sessionToken = "tok-" + crypto.randomUUID();
  const csrfToken = "csrf-" + crypto.randomUUID();
  const staffId = "staff-smc-1";
  const accountId = "acct-smc-1";
  const sessionId = "sess-smc-1";

  await c.db.batch([
    c.db
      .prepare(
        "INSERT INTO core_accounts(school_id,account_id,issuer,subject,email,staff_id,suspended,created_at) VALUES(?,?,'https://accounts.google.com',?,?,?,?,?)",
      )
      .bind(schoolId, accountId, "sub-1", "smc@example.invalid", staffId, 0, baseNow),
    c.db
      .prepare(
        "INSERT INTO core_sessions(school_id,session_id,token_hash,account_id,authenticated_at,expires_at,csrf_token) VALUES(?,?,?,?,?,?,?)",
      )
      .bind(
        schoolId,
        sessionId,
        await digest(sessionToken),
        accountId,
        baseNow - 1000,
        baseNow - 1000 + 864000000,
        csrfToken,
      ),
  ]);

  let rpcCalls = 0;
  let failContacts = false;
  let currentNow = baseNow;
  let staffRev = 0;

  const setContactsFields = async ({ smc = true, validUntil = null } = {}) => {
    staffRev++;
    const fieldSpecs = [
      ["employmentActive", true],
      ["smc", smc],
      ["eo", true],
      ["schoolLeader", false],
    ];
    const nextFields = Object.fromEntries(
      fieldSpecs.map(([field, value]) => [
        field,
        {
          field,
          revision: staffRev,
          state: "accepted",
          value_json: canonical(value),
          timeline_json: null,
          valid_from: 0,
          valid_until: validUntil,
          revoked: 0,
          proposer: "admin-1",
          accepter: "admin-2",
          accepted_at: currentNow,
          operation_id: `op-seed-${staffRev}`,
        },
      ]),
    );
    const snapWrites = await makeSnapshots(
      p.db,
      schoolId,
      staffId,
      staffRev,
      nextFields,
    );
    await p.db.batch([
      p.db
        .prepare(
          "INSERT INTO contacts_staff(school_id,staff_id,basic_name,ttb_name,active,section,profile_state,revision,authority_revision,created_at) VALUES(?,?,'Synthetic SMC','Synthetic SMC',1,'Primary','complete',?,?,?) ON CONFLICT(school_id,staff_id) DO UPDATE SET revision=excluded.revision,authority_revision=excluded.authority_revision",
        )
        .bind(schoolId, staffId, staffRev, staffRev, currentNow),
      ...fieldSpecs.map(([field, value]) =>
        p.db
          .prepare(
            "INSERT INTO contacts_fields(school_id,staff_id,field,revision,state,value_json,timeline_json,valid_from,valid_until,revoked,proposer,accepter,accepted_at,operation_id) VALUES(?,?,?,?,'accepted',?,NULL,0,?,0,'admin-1','admin-2',?,?) ON CONFLICT(school_id,staff_id,field) DO UPDATE SET revision=excluded.revision,value_json=excluded.value_json,valid_until=excluded.valid_until,accepted_at=excluded.accepted_at,operation_id=excluded.operation_id",
          )
          .bind(
            schoolId,
            staffId,
            field,
            staffRev,
            canonical(value),
            validUntil,
            currentNow,
            `op-seed-${staffRev}`,
          ),
      ),
      ...snapWrites.map((w) => p.db.prepare(w.sql).bind(...w.args)),
    ]);
  };
  await setContactsFields({ smc: true, validUntil: baseNow + 60000 });

  const coreEnv = {
    SCHOOL_ID: schoolId,
    PUBLIC_ORIGIN: origin,
    GSIS_SECRET: secret,
    DB: c.db,
    SERVICE_NAME: "core",
  };
  const contactsEnv = {
    SCHOOL_ID: schoolId,
    PUBLIC_ORIGIN: origin,
    GSIS_SECRET: secret,
    DB: p.db,
    SERVICE_NAME: "contacts",
  };
  const makeBinding = (service) => ({
    fetch: async (request) => {
      const targetEnv = service === "core" ? coreEnv : contactsEnv;
      await requireMembership(targetEnv, request);
      const path = new URL(request.url).pathname;
      const body = await request.json();
      if (service === "contacts" && path === "/internal/authority") {
        rpcCalls++;
        if (failContacts) {
          return Response.json(
            { ok: false, error: { code: "DEPENDENCY_UNAVAILABLE", message: "down" } },
            { status: 503 },
          );
        }
      }
      try {
        const data = await (service === "core" ? core : contacts)({
          env: targetEnv,
          path,
          body,
          method: "POST",
          request,
          internal: true,
          now: Math.max(currentNow, Date.now()),
        });
        return Response.json({ ok: true, data });
      } catch (e) {
        return Response.json(
          { ok: false, error: { code: e.code ?? "ERROR", message: e.message } },
          { status: e.status ?? 500 },
        );
      }
    },
  });
  coreEnv.CORE = makeBinding("core");
  coreEnv.CONTACTS = makeBinding("contacts");
  contactsEnv.CORE = makeBinding("core");
  contactsEnv.CONTACTS = makeBinding("contacts");

  const readInput = (action = "deploy.read") => ({
    schoolId,
    sessionToken,
    origin,
    descriptor: { service: action.split(".")[0], action, write: false },
  });

  // 1a. Five repeated derived-capability reads hit Contacts exactly ONCE.
  for (let i = 0; i < 5; i++) {
    currentNow = baseNow + i * 100;
    const decision = await authorizeCore(
      coreEnv,
      readInput(i % 2 === 0 ? "deploy.read" : "roster.read"),
      currentNow,
    );
    assert.equal(decision.actorId, accountId);
  }
  assert.equal(rpcCalls, 1, "repeated derived reads reuse cached Contacts authority");

  // 1b. Mutating write ALWAYS bypasses the read cache and reads Contacts fresh.
  const callsBeforeWrite = rpcCalls;
  currentNow = baseNow + 500;
  await authorizeCore(
    coreEnv,
    {
      schoolId,
      sessionToken,
      csrfToken,
      origin,
      descriptor: {
        service: "deploy",
        action: "deploy.edit",
        write: true,
        operationId: "op-write-fresh-1",
      },
    },
    currentNow,
  );
  assert(rpcCalls > callsBeforeWrite, "writes always bypass read cache");

  // 1c. Advancing past AUTH_CACHE_TTL_MS triggers a fresh Contacts read.
  const callsBeforeTtl = rpcCalls;
  currentNow = baseNow + AUTH_CACHE_TTL_MS + 100;
  await authorizeCore(coreEnv, readInput("deploy.read"), currentNow);
  assert.equal(rpcCalls, callsBeforeTtl + 1, "TTL expiry forces fresh Contacts read");

  // 1d. Strict validUntil ceiling: if validUntil is only 2s away, advancing 2.5s misses cache.
  invalidateAuthorityCache(coreEnv.DB, { schoolId });
  const callsBeforeValidUntil = rpcCalls;
  currentNow = baseNow + 23000;
  await setContactsFields({ smc: true, validUntil: baseNow + 25000 });
  await authorizeCore(coreEnv, readInput("deploy.read"), currentNow);
  assert.equal(rpcCalls, callsBeforeValidUntil + 1);
  currentNow = baseNow + 24000;
  await authorizeCore(coreEnv, readInput("deploy.read"), currentNow);
  assert.equal(rpcCalls, callsBeforeValidUntil + 1, "hit before validUntil");
  currentNow = baseNow + 25500;
  await setContactsFields({ smc: true, validUntil: baseNow + 90000 });
  await authorizeCore(coreEnv, readInput("deploy.read"), currentNow);
  assert.equal(rpcCalls, callsBeforeValidUntil + 2, "entry never extends past validUntil");

  // 1e. Explicit /internal/authority-cache/invalidate immediately evicts and observes revocation.
  const callsBeforeInvalidate = rpcCalls;
  currentNow = baseNow + 26000;
  await setContactsFields({ smc: false, validUntil: baseNow + 90000 });
  const inv = await core({
    env: coreEnv,
    path: "/internal/authority-cache/invalidate",
    method: "POST",
    internal: true,
    body: { schoolId, staffId },
    now: currentNow,
  });
  assert.equal(inv.invalidated, 1);
  currentNow = baseNow + 26100;
  await assert.rejects(
    authorizeCore(coreEnv, readInput("deploy.read"), currentNow),
    (err) => err.code === "CAPABILITY_DENIED" && err.status === 403,
  );
  assert.equal(
    rpcCalls,
    callsBeforeInvalidate + 1,
    "invalidation immediately forces fresh Contacts check",
  );

  // 1f. Unavailable Contacts error is NEVER cached (fail-closed).
  await setContactsFields({ smc: true, validUntil: baseNow + 90000 });
  invalidateAuthorityCache(coreEnv.DB, { schoolId });
  const callsBeforeFail = rpcCalls;
  failContacts = true;
  currentNow = baseNow + 27000;
  await assert.rejects(
    authorizeCore(coreEnv, readInput("deploy.read"), currentNow),
    (err) => err.status === 503,
  );
  failContacts = false;
  currentNow = baseNow + 27100;
  await authorizeCore(coreEnv, readInput("deploy.read"), currentNow);
  assert.equal(rpcCalls, callsBeforeFail + 2, "failed Contacts read is never cached");

  // 1g. Bounded LRU capacity never exceeds AUTH_CACHE_MAX_ENTRIES.
  const lruDb = {};
  for (let i = 0; i < AUTH_CACHE_MAX_ENTRIES + 25; i++) {
    setCachedAuthority(
      lruDb,
      { schoolId, staffId: `s-${i}`, sessionId: `sess-${i}` },
      { read: { ok: i }, observation: { active: true }, expiresAt: baseNow + 10000 },
      baseNow,
    );
  }
  assert.equal(
    getCachedAuthority(lruDb, { schoolId, staffId: "s-0", sessionId: "sess-0" }, baseNow),
    null,
    "oldest entry evicted by LRU bound",
  );
  assert.notEqual(
    getCachedAuthority(
      lruDb,
      {
        schoolId,
        staffId: `s-${AUTH_CACHE_MAX_ENTRIES + 24}`,
        sessionId: `sess-${AUTH_CACHE_MAX_ENTRIES + 24}`,
      },
      baseNow,
    ),
    null,
    "newest entry retained",
  );
} finally {
  await c.close();
  await p.close();
}

// Part 2: End-to-end real built Workers/D1 invalidation on Contacts authority revocation & logout.
const suite = await productSuite();
try {
  const admin = await suite.seedAccount("synthetic-cache-admin");
  const created = await suite.call(admin, "contacts", "/save-data", {
    operationId: "synthetic-cache-seed-staff",
    changes: [],
    additions: [
      {
        id: "row-smc",
        values: {
          "Basic Name": "Synthetic SMC",
          "Statutory Name": "Synthetic SMC",
          Role: "Teacher",
          "School Section": "Primary",
          Active: "Y",
        },
      },
    ],
  });
  const staffId = created.mapping["row-smc"];
  for (const [field, value] of [
    ["smc", true],
    ["eo", true],
    ["schoolLeader", false],
  ]) {
    await suite.call(admin, "contacts", `/staff/${staffId}/accept`, {
      operationId: `synthetic-cache-accept-${field}`,
      field,
      value,
      revision: 0,
      ownerReviewReference: "Synthetic cache authority grant",
    });
  }
  const smcUser = await suite.seedAccount("synthetic-cache-smc", {
    capabilities: [],
    staffId,
  });

  // Warm the cache with two consecutive derived-capability reads on Deploy.
  const firstRead = await suite.request(smcUser, "deploy", "/bootstrap");
  assert.equal(firstRead.status, 200, JSON.stringify(firstRead.body));
  const secondRead = await suite.request(smcUser, "deploy", "/bootstrap");
  assert.equal(secondRead.status, 200, JSON.stringify(secondRead.body));

  // Admin revokes SMC in Contacts -> Contacts notifies Core /internal/authority-cache/invalidate -> immediate denial!
  await suite.call(admin, "contacts", `/staff/${staffId}/accept`, {
    operationId: "synthetic-cache-revoke-smc",
    field: "smc",
    value: false,
    revision: 1,
    ownerReviewReference: "Synthetic cache authority revocation",
  });
  const afterRevoke = await suite.request(smcUser, "deploy", "/bootstrap");
  assert.equal(afterRevoke.status, 403, JSON.stringify(afterRevoke.body));
  assert.equal(afterRevoke.body?.error?.code, "CAPABILITY_DENIED");

  // Re-grant SMC, warm cache, then logout -> immediate 401 SESSION_INVALID.
  await suite.call(admin, "contacts", `/staff/${staffId}/accept`, {
    operationId: "synthetic-cache-regrant-smc",
    field: "smc",
    value: true,
    revision: 2,
    ownerReviewReference: "Synthetic cache authority re-grant",
  });
  assert.equal((await suite.request(smcUser, "deploy", "/bootstrap")).status, 200);
  const logout = await suite.request(smcUser, "core", "/logout", {
    method: "POST",
    body: { operationId: "synthetic-cache-logout" },
  });
  assert.equal(logout.status, 200, JSON.stringify(logout.body));
  assert.equal((await suite.request(smcUser, "deploy", "/bootstrap")).status, 401);

  console.log(
    "PASS v1 Core->Contacts authority read cache (D01/D02): repeated reads reuse bounded cache, writes always read fresh, validUntil & TTL ceilings enforced, errors never cached, LRU bounded, and Contacts revocation + logout immediately invalidate.",
  );
} finally {
  await suite.close();
}
