import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { authorizeCore } from "../v1/services/core/service.mjs";
import { digest, one, statement } from "../v1/runtime/store.mjs";
const h = await createDatabase("core");
const schoolId = "deadline-school",
  token = "opaque-provider-deadline-token",
  now = Date.now();
const env = {
  DB: h.db,
  SCHOOL_ID: schoolId,
  SERVICE_NAME: "core",
  PUBLIC_ORIGIN: "https://deadline.example.test",
};
const request = {
  schoolId,
  sessionToken: token,
  origin: env.PUBLIC_ORIGIN,
  csrfToken: "csrf-deadline",
  descriptor: {
    service: "deploy",
    action: "deploy.publish",
    write: true,
    operationId: "deadline-positive",
    bodyDigest: await digest({ operationId: "deadline-positive" }),
  },
};
/** Add transport latency to real D1 reads, without replacing their results or clocks. */
function delayedReads(db, milliseconds) {
  const pending = new Set();
  function wrap(prepared) {
    return new Proxy(prepared, {
      get(target, key) {
        if (key === "bind") return (...args) => wrap(target.bind(...args));
        if (key === "first" || key === "all")
          return (...args) => {
            const task = (async () => {
              await new Promise((resolve) => setTimeout(resolve, milliseconds));
              return target[key](...args);
            })();
            pending.add(task);
            task.finally(() => pending.delete(task)).catch(() => {});
            return task;
          };
        const value = target[key];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }
  return {
    db: {
      prepare: (sql) => wrap(db.prepare(sql)),
      batch: (args) => db.batch(args),
    },
    settle: () => Promise.allSettled([...pending]),
  };
}
try {
  await statement(
    h.db,
    "INSERT INTO core_accounts(school_id,account_id,issuer,subject,email,created_at) VALUES(?,?,'https://accounts.google.com',?,?,?)",
    [schoolId, "admin", "deadline-subject", "admin@example.test", now],
  ).run();
  await statement(
    h.db,
    "INSERT INTO core_grants(school_id,account_id,capability,valid_from) VALUES(?,?,'admin',0)",
    [schoolId, "admin"],
  ).run();
  await statement(
    h.db,
    "INSERT INTO core_sessions(school_id,session_id,token_hash,account_id,authenticated_at,expires_at,csrf_token) VALUES(?,?,?,?,?,?,?)",
    [
      schoolId,
      "session",
      await digest(token),
      "admin",
      now,
      now + 864000000,
      "csrf-deadline",
    ],
  ).run();
  // Three sequential 400-ms RPCs breach T1A's 1000-ms bound; one owner snapshot fits.
  const delayed = delayedReads(h.db, 400);
  env.DB = delayed.db;
  const allowed = await authorizeCore(env, request, Date.now());
  assert(allowed.capabilities.includes("deploy.publish"));
  await delayed.settle();
  assert.equal(
    (await one(h.db, "SELECT COUNT(*) AS n FROM core_evidence")).n,
    1,
  );
  // A genuinely slow read must still fail closed; late completion cannot record an allow.
  const slow = delayedReads(h.db, 1200);
  env.DB = slow.db;
  const slowRequest = {
    ...request,
    descriptor: {
      ...request.descriptor,
      operationId: "deadline-negative",
      bodyDigest: await digest({ operationId: "deadline-negative" }),
    },
  };
  await assert.rejects(
    () => authorizeCore(env, slowRequest, Date.now()),
    (error) =>
      error.code === "PROVIDER_TIMEOUT" &&
      error.status === 503 &&
      error.retryable === true,
  );
  await slow.settle();
  assert.equal(
    (await one(h.db, "SELECT COUNT(*) AS n FROM core_evidence")).n,
    1,
  );
  console.log(
    "PASS Core provider deadline: real D1 with bounded transport latency permits coherent authority; a slow owner read remains retryable PROVIDER_TIMEOUT/503 and late completion records no allow",
  );
} finally {
  await h.close();
}
