import { createGoogleIdentityVerifier } from "../../core/google-identity.mjs";
import { ApiError } from "../../runtime/errors.mjs";
import { digest, one, statement } from "../../runtime/store.mjs";

export function decodeClaims(token) {
  try {
    const p = token.split(".");
    if (p.length !== 3) throw 0;
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(atob(p[1].replace(/-/g, "+").replace(/_/g, "/")), (c) =>
          c.charCodeAt(0),
        ),
      ),
    );
  } catch {
    throw new ApiError("IDENTITY_INVALID", 401, "Sign in again.");
  }
}
async function fetchKeys(env, now, refresh) {
  const cached = await one(
    env.DB,
    "SELECT body,expires_at FROM core_jwks WHERE id='google'",
  );
  if (!refresh && cached?.expires_at > now)
    return { jwks: JSON.parse(cached.body), cached: true };
  const fetcher = env.GOOGLE_FETCH?.fetch?.bind(env.GOOGLE_FETCH) ?? fetch;
  let response, raw, timer;
  try {
    ({ response, raw } = await Promise.race([
      (async () => {
        const response = await fetcher(
          "https://www.googleapis.com/oauth2/v3/certs",
          { signal: AbortSignal.timeout(5000) },
        );
        if (!response.ok) throw Error("Unavailable");
        const reader = response.body?.getReader();
        if (!reader) throw Error("Empty response");
        const parts = [];
        let size = 0;
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 65536) {
            await reader.cancel();
            throw Error("Keys exceed bound");
          }
          parts.push(part.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const part of parts) {
          bytes.set(part, offset);
          offset += part.length;
        }
        return { response, raw: new TextDecoder().decode(bytes) };
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("Timeout")), 5000);
      }),
    ]));
  } catch {
    throw new ApiError(
      "SIGNING_KEYS_UNAVAILABLE",
      503,
      "Google signing keys are unavailable.",
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
  }
  let keys;
  try {
    keys = JSON.parse(raw);
  } catch {
    throw new ApiError(
      "SIGNING_KEYS_UNAVAILABLE",
      503,
      "Signing key response is invalid.",
      { retryable: true },
    );
  }
  if (!Array.isArray(keys.keys) || keys.keys.length > 32)
    throw new ApiError(
      "SIGNING_KEYS_UNAVAILABLE",
      503,
      "Signing key response is invalid.",
      { retryable: true },
    );
  await statement(
    env.DB,
    "INSERT INTO core_jwks(id,body,expires_at) VALUES('google',?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,expires_at=excluded.expires_at",
    [JSON.stringify(keys), now + 300000],
  ).run();
  return { jwks: keys, cached: false };
}
export async function verifyIdentity(env, credential, expectedNonce, now) {
  if (typeof credential !== "string" || credential.length > 16384)
    throw new ApiError("IDENTITY_INVALID", 401, "Sign in again.");
  let kid;
  try {
    kid = JSON.parse(
      atob(credential.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")),
    ).kid;
  } catch {
    throw new ApiError("IDENTITY_INVALID", 401, "Sign in again.");
  }
  let loaded = await fetchKeys(env, now, false),
    keys = loaded.jwks;
  if (!keys.keys.some((k) => k.kid === kid) && loaded.cached)
    keys = (await fetchKeys(env, now, true)).jwks;
  if (!keys.keys.some((k) => k.kid === kid))
    throw new ApiError(
      "IDENTITY_INVALID",
      401,
      "Unrecognised Google signing key.",
    );
  const verify = createGoogleIdentityVerifier({
    clock: () => Math.max(now, Date.now()),
    getSigningKeys: async () => keys,
    timeoutMs: 5000,
  });
  const result = await verify(credential, {
    schoolId: env.SCHOOL_ID,
    audience: env.GOOGLE_CLIENT_ID,
    hostedDomain: env.HOSTED_DOMAIN,
  });
  if (result.outcome !== "allow")
    throw new ApiError(
      result.reasonCode,
      result.outcome === "unavailable" ? 503 : 401,
      "Google sign-in could not be verified.",
      { retryable: result.retryable },
    );
  const claims = decodeClaims(credential);
  if (
    typeof claims.nonce !== "string" ||
    (await digest(claims.nonce)) !== expectedNonce
  )
    throw new ApiError(
      "IDENTITY_INVALID",
      401,
      "Sign-in challenge did not match.",
    );
  return {
    identity: result.identity,
    email: claims.email,
    expiresAt: claims.exp * 1000,
  };
}
