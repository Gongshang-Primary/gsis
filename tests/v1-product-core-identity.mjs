import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { verifyIdentity } from "../v1/services/core/identity.mjs";
import { handle, authorizeCore } from "../v1/services/core/service.mjs";
import { digest, one, statement } from "../v1/runtime/store.mjs";
const h = await createDatabase("core");
try {
  const now = Date.now(),
    keys = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
  const jwk = {
    ...(await crypto.subtle.exportKey("jwk", keys.publicKey)),
    kid: "test-key",
    alg: "RS256",
    use: "sig",
  };
  let fetches = 0,
    failProvider = false;
  const env = {
    DB: h.db,
    SERVICE_NAME: "core",
    SCHOOL_ID: "school-identity",
    SCHOOL_NAME: "Synthetic",
    GOOGLE_CLIENT_ID: "synthetic-client",
    HOSTED_DOMAIN: "example.test",
    PUBLIC_ORIGIN: "https://school.example.test",
    BOOTSTRAP_SUBJECT: "google-owner",
    BOOTSTRAP_EMAIL: "owner@example.test",
    GOOGLE_FETCH: {
      fetch: async () => {
        fetches++;
        if (failProvider) throw Error("synthetic unavailable");
        return Response.json({ keys: [jwk] });
      },
    },
  };
  const b64 = (bytes) => Buffer.from(bytes).toString("base64url");
  async function token(patch = {}, kid = "test-key") {
    const header = b64(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })),
      claims = {
        iss: "https://accounts.google.com",
        sub: "google-owner",
        aud: "synthetic-client",
        hd: "example.test",
        email_verified: true,
        email: "owner@example.test",
        iat: Math.floor(now / 1000) - 10,
        exp: Math.floor(now / 1000) + 300,
        nonce: "nonce-a",
        ...patch,
      },
      payload = b64(JSON.stringify(claims)),
      sig = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        keys.privateKey,
        new TextEncoder().encode(header + "." + payload),
      );
    return header + "." + payload + "." + b64(sig);
  }
  assert.equal(
    (await verifyIdentity(env, await token(), await digest("nonce-a"), now))
      .identity.subject,
    "google-owner",
  );
  assert.equal(fetches, 1);
  const awaitableNonce = await digest("nonce-a");
  for (const patch of [
    { aud: "wrong" },
    { hd: "wrong.test" },
    { exp: Math.floor(now / 1000) },
    { nonce: "wrong" },
    { email_verified: false },
  ])
    await assert.rejects(
      () =>
        token(patch).then((t) => verifyIdentity(env, t, awaitableNonce, now)),
      (e) => e.code === "IDENTITY_INVALID",
    );
  async function invalidNonceTest() {
    await assert.rejects(
      () => verifyIdentity(env, "malformed", awaitableNonce, now),
      (e) => e.code === "IDENTITY_INVALID",
    );
  }
  // Explicit tests use the same validated nonce digest; malformed outcomes do not reveal claims.
  await invalidNonceTest();
  const before = fetches;
  await assert.rejects(
    () =>
      token({}, "unknown-key").then((t) =>
        verifyIdentity(env, t, awaitableNonce, now),
      ),
    (e) => e.code === "IDENTITY_INVALID" && e.status === 401,
  );
  assert.equal(fetches, before + 1);
  failProvider = true;
  await assert.rejects(
    () =>
      token({}, "unknown-key-2").then((t) =>
        verifyIdentity(env, t, awaitableNonce, now),
      ),
    (e) => e.code === "SIGNING_KEYS_UNAVAILABLE" && e.status === 503,
  );
  failProvider = false;
  console.log(
    "PASS CORE01 signed Google identity, audience/domain/expiry/nonce and bounded unknown-kid refresh",
  );
  const startRequest = new Request(
    env.PUBLIC_ORIGIN + "/api/core/login/start",
    { method: "POST", headers: { origin: env.PUBLIC_ORIGIN } },
  );
  const start = await handle({
    env,
    path: "/login/start",
    method: "POST",
    body: {},
    request: startRequest,
    now,
  });
  const challenge = (await start.json()).data;
  const credential = await token({ nonce: challenge.nonce });
  const loginReq = new Request(env.PUBLIC_ORIGIN + "/api/core/login", {
    method: "POST",
    headers: {
      origin: env.PUBLIC_ORIGIN,
      cookie: `__Host-gsis_challenge=${challenge.challengeId}`,
    },
  });
  const response = await handle({
    env,
    path: "/login",
    method: "POST",
    body: { credential, challengeId: challenge.challengeId },
    request: loginReq,
    now,
  });
  assert.equal(response.status, 200);
  const result = (await response.json()).data;
  assert.equal(result.expiresAt - now, 864000000);
  assert.match(
    response.headers.get("set-cookie"),
    /Secure; HttpOnly; SameSite=Lax/,
  );
  await assert.rejects(
    () =>
      handle({
        env,
        path: "/login",
        method: "POST",
        body: { credential, challengeId: challenge.challengeId },
        request: loginReq,
        now,
      }),
    (e) => e.code === "IDENTITY_INVALID",
  );
  const sessionToken = response.headers
    .get("set-cookie")
    .match(/__Host-gsis_session=([^;]+)/)[1];
  const request = {
    schoolId: env.SCHOOL_ID,
    sessionToken,
    origin: env.PUBLIC_ORIGIN,
    csrfToken: result.csrfToken,
    descriptor: {
      service: "core",
      action: "core.session",
      write: false,
      bodyDigest: await digest({}),
    },
  };
  assert.equal(
    (
      await authorizeCore(env, request, now + 864000000 - 1)
    ).capabilities.includes("admin"),
    true,
  );
  await assert.rejects(
    () => authorizeCore(env, request, now + 864000000),
    (e) => e.code === "SESSION_EXPIRED",
  );
  await assert.rejects(
    () =>
      authorizeCore(
        env,
        {
          ...request,
          descriptor: {
            service: "core",
            action: "core.admin",
            write: true,
            operationId: "admin-op",
          },
          csrfToken: "forged",
        },
        now,
      ),
    (e) => e.code === "CSRF_DENIED",
  );
  await assert.rejects(
    () => authorizeCore(env, { ...request, schoolId: "other-school" }, now),
    (e) => e.code === "SCHOOL_MISMATCH",
  );
  await assert.rejects(
    () =>
      authorizeCore(
        env,
        {
          ...request,
          previewAccountId: "unrelated",
          descriptor: {
            service: "core",
            action: "core.admin",
            write: true,
            operationId: "preview-op",
          },
        },
        now,
      ),
    (e) => e.code === "IMPERSONATION_DENIED",
  );
  console.log(
    "PASS one-time explicit first Admin, challenge replay, secure ten-day cookie, CSRF and isolation",
  );
} finally {
  await h.close();
}
