import { ApiError, requireValue } from "./errors.mjs";
import { digest, one, statement } from "./store.mjs";

export const HELPER_SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar.events",
]);
const enc = new TextEncoder(), dec = new TextDecoder();
export const helperEnabled = env => env.GOOGLE_HELPER_ENABLED === "true";
export const googleConfigured = env => helperEnabled(env) || !!(env.GOOGLE_SERVICE_ACCOUNT || env.GOOGLE_ACCESS_TOKEN);
export const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const unbase64 = text => Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
export const randomSecret = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

export async function helperConfig(env) {
  const cfg = { schoolId: env.SCHOOL_ID, clientId: env.GOOGLE_HELPER_CLIENT_ID,
    email: env.GOOGLE_HELPER_EMAIL, hostedDomain: env.HOSTED_DOMAIN,
    rootId: env.GOOGLE_HELPER_ROOT_ID, driveId: env.GOOGLE_HELPER_DRIVE_ID,
    redirectUri: env.PUBLIC_ORIGIN + "/admin/", scopes: HELPER_SCOPES };
  const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
  requireValue(helperEnabled(env) && typeof cfg.clientId === "string" && cfg.clientId.endsWith(".apps.googleusercontent.com") &&
    typeof cfg.email === "string" && cfg.email === cfg.email.toLowerCase() && cfg.email.endsWith("@" + cfg.hostedDomain) &&
    id(cfg.rootId) && id(cfg.driveId) && /^https:\/\/[^/]+$/.test(env.PUBLIC_ORIGIN || "") &&
    typeof env.GOOGLE_HELPER_CLIENT_SECRET === "string" && env.GOOGLE_HELPER_CLIENT_SECRET.length > 0 &&
    typeof env.GOOGLE_HELPER_WRAP_KEY === "string" && /^[A-Za-z0-9_-]{43}$/.test(env.GOOGLE_HELPER_WRAP_KEY),
    "GOOGLE_HELPER_NOT_CONFIGURED", 503);
  return { ...cfg, digest: await digest(cfg) };
}
async function key(env) {
  let raw;
  try { raw = unbase64(env.GOOGLE_HELPER_WRAP_KEY); } catch { /* safe error below */ }
  requireValue(raw?.length === 32, "GOOGLE_HELPER_KEY_UNAVAILABLE", 503);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function sealHelper(env, purpose, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), plaintext = enc.encode(JSON.stringify(value));
  requireValue(plaintext.length <= 32768, "GOOGLE_HELPER_BOUNDS", 413);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv,
    additionalData: enc.encode(env.SCHOOL_ID + ":helper-google/1:" + purpose) }, await key(env), plaintext);
  return base64url(iv) + "." + base64url(new Uint8Array(ciphertext));
}
export async function openHelper(env, purpose, value) {
  try {
    requireValue(typeof value === "string" && value.length <= 65536, "GOOGLE_HELPER_CREDENTIAL_INVALID", 503);
    const [iv, ciphertext, extra] = value.split(".");
    if (extra) throw Error();
    const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(iv),
      additionalData: enc.encode(env.SCHOOL_ID + ":helper-google/1:" + purpose) }, await key(env), unbase64(ciphertext));
    return JSON.parse(dec.decode(bytes));
  } catch { throw new ApiError("GOOGLE_HELPER_CREDENTIAL_INVALID", 503, "Reconnect the school Google account."); }
}
export function validateGoogleToken(value, { offline = false } = {}) {
  requireValue(value && typeof value.access_token === "string" && value.access_token.length > 0 && value.access_token.length <= 8192 &&
    value.token_type?.toLowerCase() === "bearer" && Number.isFinite(value.expires_in) && value.expires_in > 0 && value.expires_in <= 86400,
    "GOOGLE_HELPER_TOKEN_INVALID", 502);
  if (offline) requireValue(typeof value.refresh_token === "string" && value.refresh_token.length > 0 && value.refresh_token.length <= 8192 &&
    typeof value.id_token === "string" && value.id_token.length <= 16384, "GOOGLE_HELPER_OFFLINE_REQUIRED", 409);
  if (offline || value.scope !== undefined) {
    const granted = new Set(String(value.scope || "").split(/\s+/));
    requireValue(HELPER_SCOPES.every(scope => granted.has(scope)) &&
      [...granted].every(scope => [...HELPER_SCOPES, "openid", "email", "https://www.googleapis.com/auth/userinfo.email"].includes(scope)),
      "GOOGLE_HELPER_SCOPE_MISMATCH", 403);
  }
  return value;
}
export async function tokenRequest(env, fields, fetchProvider) {
  let r;
  try { r = await fetchProvider(env, "https://oauth2.googleapis.com/token", {
    method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...fields, client_id: env.GOOGLE_HELPER_CLIENT_ID, client_secret: env.GOOGLE_HELPER_CLIENT_SECRET }),
  }); } catch { throw new ApiError("GOOGLE_HELPER_UNAVAILABLE", 503, "Google did not confirm the connection request.", { retryable: true }); }
  // fetchProvider deliberately strips non-2xx bodies; never return provider
  // descriptions which could echo credentials. 400/401 require reconnection.
  if (r.status === 400 || r.status === 401) throw new ApiError("GOOGLE_HELPER_RECONNECT_REQUIRED", 409, "Reconnect the school Google account.");
  requireValue(r.ok, "GOOGLE_HELPER_UNAVAILABLE", 503);
  try { return await r.json(); } catch { throw new ApiError("GOOGLE_HELPER_TOKEN_INVALID", 502); }
}
export async function helperAccessToken(env, scopes, fetchProvider) {
  requireValue(env.SERVICE_NAME === "core" && Array.isArray(scopes) && scopes.length > 0 &&
    scopes.length <= HELPER_SCOPES.length && scopes.every(s => HELPER_SCOPES.includes(s)), "GOOGLE_HELPER_SCOPE_DENIED", 403);
  const cfg = await helperConfig(env);
  const row = await one(env.DB, "SELECT * FROM core_google_connections WHERE school_id=?", [env.SCHOOL_ID]);
  requireValue(row?.state === "connected" && row.config_digest === cfg.digest, "GOOGLE_HELPER_RECONNECT_REQUIRED", 409);
  const credential = await openHelper(env, "credential:" + row.subject, row.credential_cipher);
  let token;
  try {
    token = validateGoogleToken(await tokenRequest(env, { grant_type: "refresh_token", refresh_token: credential.refreshToken }, fetchProvider));
  } catch (error) {
    if (error.code === "GOOGLE_HELPER_RECONNECT_REQUIRED") await statement(env.DB,
      "UPDATE core_google_connections SET state='reconnect-required',updated_at=? WHERE school_id=? AND revision=? AND credential_cipher=?",
      [Date.now(), env.SCHOOL_ID, row.revision, row.credential_cipher]).run();
    throw error;
  }
  const current = await one(env.DB, "SELECT state,revision,credential_cipher FROM core_google_connections WHERE school_id=?", [env.SCHOOL_ID]);
  requireValue(current?.state === "connected" && current.revision === row.revision && current.credential_cipher === row.credential_cipher,
    "GOOGLE_HELPER_CONNECTION_CHANGED", 409);
  if (token.refresh_token && token.refresh_token !== credential.refreshToken) {
    requireValue(typeof token.refresh_token === "string" && token.refresh_token.length <= 8192, "GOOGLE_HELPER_TOKEN_INVALID", 502);
    const encrypted = await sealHelper(env, "credential:" + row.subject, { refreshToken: token.refresh_token });
    const update = await statement(env.DB,
      "UPDATE core_google_connections SET credential_cipher=?,updated_at=? WHERE school_id=? AND revision=? AND state='connected' AND credential_cipher=?",
      [encrypted, Date.now(), env.SCHOOL_ID, row.revision, row.credential_cipher]).run();
    requireValue(update.meta.changes === 1, "GOOGLE_HELPER_CONNECTION_CHANGED", 409);
  }
  return { accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
}
