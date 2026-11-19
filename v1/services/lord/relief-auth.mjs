/** Restricted LORD relief-teacher session helpers (F15).
 * Issues a LORD-only HMAC-SHA256-signed HttpOnly cookie bound to schoolId,
 * name, 8-digit Singapore mobile, CSRF token and a 12-hour TTL.
 * Never creates a Core staff session or grants access outside loan/return.
 */
import { ApiError } from "../../runtime/errors.mjs";
import { digest } from "../../runtime/store.mjs";
import { secretEquals } from "../../runtime/providers.mjs";

export const RELIEF_COOKIE_NAME = "__Host-gsis_lord_relief";
export const RELIEF_TTL_MS = 12 * 60 * 60 * 1000;
export const RELIEF_ALLOWED_ACTIONS = new Set([
  "reference",
  "bookingeligible",
  "opensessions",
  "session",
  "loan",
  "return",
  "photo-upload",
]);

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function signingKey(env) {
  if (!env?.GSIS_SECRET || !env?.SCHOOL_ID) {
    throw new ApiError("SERVICE_NOT_CONFIGURED", 503, "Service configuration is incomplete.");
  }
  const derived = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(`gsis:lord-relief:v1:${env.SCHOOL_ID}:${env.GSIS_SECRET}`),
  );
  return crypto.subtle.importKey(
    "raw",
    derived,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function normalizeReliefInput(body = {}) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120) {
    throw new ApiError("INVALID_INPUT", 400, "Enter your name.");
  }
  let mobile = typeof body.mobile === "string" || typeof body.mobile === "number"
    ? String(body.mobile).replace(/\D/g, "")
    : "";
  if (mobile.startsWith("65") && mobile.length === 10) mobile = mobile.slice(2);
  if (!/^[689]\d{7}$/.test(mobile)) {
    throw new ApiError(
      "INVALID_INPUT",
      400,
      "Enter a valid 8-digit Singapore mobile number.",
    );
  }
  return { name, mobile };
}

export async function issueReliefSession(env, { name, mobile, now = Date.now() }) {
  const csrf = crypto.randomUUID().replace(/-/g, "");
  const payload = {
    v: 1,
    schoolId: env.SCHOOL_ID,
    sub: "relief:" + mobile,
    name,
    mobile,
    csrf,
    iat: now,
    exp: now + RELIEF_TTL_MS,
  };
  const bodyPart = toBase64Url(enc.encode(JSON.stringify(payload)));
  const key = await signingKey(env);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(bodyPart)));
  const token = `${bodyPart}.${toBase64Url(sig)}`;
  const cookie = `${RELIEF_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(RELIEF_TTL_MS / 1000)}`;
  const session = {
    identityType: "RELIEF",
    sub: payload.sub,
    email: "",
    ttbName: name,
    mobile,
    isAdmin: false,
  };
  return { cookie, session, csrfToken: csrf, expiresAt: payload.exp };
}

export function clearReliefCookie() {
  return `${RELIEF_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(name + "=")) return trimmed.slice(name.length + 1);
  }
  return "";
}

export async function verifyReliefCookie(env, request, now = Date.now()) {
  const token = readCookie(request, RELIEF_COOKIE_NAME);
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [bodyPart, sigPart] = parts;
  const bodyBytes = fromBase64Url(bodyPart);
  const sigBytes = fromBase64Url(sigPart);
  if (!bodyBytes || !sigBytes || sigBytes.length !== 32) return null;
  const key = await signingKey(env);
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(bodyPart));
  if (!valid) return null;
  let payload;
  try {
    payload = JSON.parse(dec.decode(bodyBytes));
  } catch {
    return null;
  }
  if (
    !payload ||
    payload.v !== 1 ||
    payload.schoolId !== env.SCHOOL_ID ||
    typeof payload.sub !== "string" ||
    !payload.sub.startsWith("relief:") ||
    typeof payload.name !== "string" ||
    !payload.name.trim() ||
    !/^[689]\d{7}$/.test(payload.mobile || "") ||
    typeof payload.csrf !== "string" ||
    !payload.csrf ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= now
  ) {
    return null;
  }
  return payload;
}

export async function authorizeReliefRequest(ctx, descriptor) {
  const verified = await verifyReliefCookie(ctx.env, ctx.request, ctx.now);
  if (!verified) return null;
  if (!descriptor.allowRelief) {
    throw new ApiError(
      "CAPABILITY_DENIED",
      403,
      "Relief teacher access is limited to loan and return functions.",
    );
  }
  if (descriptor.write) {
    const suppliedCsrf = ctx.request.headers.get("x-csrf-token") || "";
    if (!(await secretEquals(verified.csrf, suppliedCsrf))) {
      throw new ApiError("CSRF_INVALID", 403, "Refresh the page and try again.");
    }
  }
  const decisionId =
    "relief:" +
    (await digest([
      ctx.env.SCHOOL_ID,
      verified.sub,
      descriptor.action,
      descriptor.operationId || "",
      verified.exp,
    ]));
  return {
    schoolId: ctx.env.SCHOOL_ID,
    actorId: verified.sub,
    staffId: null,
    name: verified.name,
    email: "",
    mobile: verified.mobile,
    identityType: "RELIEF",
    capabilities: ["lord.relief"],
    validUntil: verified.exp,
    decisionId,
  };
}
