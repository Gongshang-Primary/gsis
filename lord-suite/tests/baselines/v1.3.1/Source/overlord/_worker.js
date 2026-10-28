/* OVERLORD v1.3 LTS — explicit reload from Sheets */
const COOKIE_NAME = '__Host-lord_session';
const SESSION_SECONDS = 14 * 24 * 60 * 60;
const SESSION_REFRESH_THRESHOLD_SECONDS = 7 * 24 * 60 * 60;
const IDENTITY_FRESH_SECONDS = 15 * 60;
const IDENTITY_STALE_SECONDS = 24 * 60 * 60;
const REFERENCE_FRESH_SECONDS = 15 * 60;
const REFERENCE_STALE_SECONDS = 24 * 60 * 60;
const JWKS_FRESH_SECONDS = 60 * 60;
const JWKS_STALE_SECONDS = 24 * 60 * 60;
const LORD_BACKEND_URL = 'https://script.google.com/macros/s/REPLACE_DEPLOYMENT_ID/exec';
const LORD_PROXY_SECRET = 'REPLACE_PROXY_SECRET';

function backendUrl() {
  return LORD_BACKEND_URL;
}

async function fetchWithTimeout(input, init = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(`LORD backend timed out after ${Math.round(timeoutMs / 1000)} seconds. Please retry.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const RETRYABLE_UPSTREAM_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function looksLikeHtml(text) { return /^\s*<!doctype\s+html/i.test(String(text || '')) || /^\s*<html[\s>]/i.test(String(text || '')); }
function serviceError(message, { status = 502, retryable = false, code = 'UPSTREAM_ERROR' } = {}) {
  const error = new Error(message);
  error.status = status;
  error.retryable = Boolean(retryable);
  error.code = code;
  return error;
}
async function backendJson(target, init = {}, { timeoutMs = 45000, retries = 1, label = 'LORD backend' } = {}) {
  const delays = [700, 1800, 3500];
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(target, init, timeoutMs);
      const text = await response.text();
      let payload;
      try { payload = text.trim() ? JSON.parse(text) : null; }
      catch (parseError) {
        const html = looksLikeHtml(text);
        const retryable = html || RETRYABLE_UPSTREAM_STATUS.has(response.status) || response.ok;
        throw serviceError(
          html ? `${label} temporarily returned an HTML page instead of data.` : `${label} returned invalid JSON.`,
          { status: 502, retryable, code: html ? 'UPSTREAM_HTML' : 'UPSTREAM_INVALID_JSON' }
        );
      }
      if (!payload || typeof payload !== 'object') {
        throw serviceError(`${label} returned an empty response.`, { status: 502, retryable: true, code: 'UPSTREAM_EMPTY' });
      }
      if (RETRYABLE_UPSTREAM_STATUS.has(response.status)) {
        throw serviceError(payload.error || `${label} is temporarily unavailable.`, { status: 502, retryable: true, code: 'UPSTREAM_TRANSIENT' });
      }
      return { response, payload };
    } catch (error) {
      const normalized = error && typeof error.retryable === 'boolean'
        ? error
        : serviceError(error && error.message ? error.message : `${label} request failed.`, { status: 502, retryable: true, code: 'UPSTREAM_NETWORK' });
      lastError = normalized;
      if (!normalized.retryable || attempt >= retries) break;
      await sleep(delays[Math.min(attempt, delays.length - 1)]);
    }
  }
  throw lastError || serviceError(`${label} request failed.`, { status: 502, retryable: true });
}
function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...extraHeaders } });
}
function b64urlDecode(value) {
  value = value.replace(/-/g, '+').replace(/_/g, '/');
  while (value.length % 4) value += '=';
  const binary = atob(value);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function b64urlEncode(bytes) {
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('Cookie') || '';
  raw.split(';').forEach(part => {
    const index = part.indexOf('=');
    if (index > 0) out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  });
  return out;
}
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64urlEncode(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}
async function makeSessionCookie(identity, env) {
  const now = Math.floor(Date.now() / 1000);
  const cleanIdentity = { ...identity };
  delete cleanIdentity.exp;
  delete cleanIdentity.iat;
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({ ...cleanIdentity, iat: now, exp: now + SESSION_SECONDS })));
  const signature = await hmac(payload, env.LORD_SESSION_SECRET);
  return `${COOKIE_NAME}=${payload}.${signature}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}
async function readSession(request, env) {
  try {
    const value = parseCookies(request)[COOKIE_NAME];
    if (!value) return null;
    const [payload, signature] = value.split('.');
    if (!payload || !signature || signature !== await hmac(payload, env.LORD_SESSION_SECRET)) return null;
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    if (!data.exp || data.exp <= Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch { return null; }
}
function publicSession(session) {
  if (!session) return null;
  const { exp, iat, ...identity } = session;
  return identity;
}
function sessionNeedsRefresh(session) {
  if (!session || !session.exp) return false;
  return (session.exp - Math.floor(Date.now() / 1000)) < SESSION_REFRESH_THRESHOLD_SECONDS;
}
async function cachedGoogleJwks(forceRefresh = false) {
  const cache = caches.default;
  const key = new Request('https://overlord-auth-cache.local/google-jwks-v1.3');
  const now = Date.now();
  let cached = forceRefresh ? null : await cache.match(key);
  if (cached) {
    const fetchedAt = Number(cached.headers.get('X-OVERLORD-Fetched-At') || 0);
    if (fetchedAt && now - fetchedAt < JWKS_FRESH_SECONDS * 1000) return cached.json();
  }
  try {
    const response = await fetchWithTimeout('https://www.googleapis.com/oauth2/v3/certs', { redirect: 'follow' }, 12000);
    if (!response.ok) throw serviceError('Could not retrieve Google verification keys.', { status: 502, retryable: true, code: 'GOOGLE_KEYS' });
    const payload = await response.json();
    const stored = new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${JWKS_STALE_SECONDS}`, 'X-OVERLORD-Fetched-At': String(now) } });
    await cache.put(key, stored.clone());
    return payload;
  } catch (error) {
    if (!cached) cached = await cache.match(key);
    if (cached) return cached.json();
    throw error;
  }
}
async function verifyGoogleToken(token, env) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid Google credential.');
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  if (payload.aud !== env.GOOGLE_CLIENT_ID) throw new Error('Google client ID mismatch.');
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(payload.iss)) throw new Error('Invalid Google token issuer.');
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('Google sign in has expired.');
  if (payload.email_verified !== true) throw new Error('Google email is not verified.');
  if (payload.hd !== 'gsps.edu.sg' || !String(payload.email || '').toLowerCase().endsWith('@gsps.edu.sg')) throw new Error('Only gsps.edu.sg accounts may use this service.');
  let jwks = await cachedGoogleJwks(false);
  let jwk = jwks.keys.find(k => k.kid === header.kid && k.alg === 'RS256');
  if (!jwk) {
    jwks = await cachedGoogleJwks(true);
    jwk = jwks.keys.find(k => k.kid === header.kid && k.alg === 'RS256');
  }
  if (!jwk) throw new Error('Google verification key not found.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error('Google credential signature is invalid.');
  return payload;
}
async function identityLookup(email, sub, env) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail.endsWith('@gsps.edu.sg')) throw serviceError('Only verified gsps.edu.sg accounts may use OVERLORD.', { status: 403, retryable: false, code: 'DOMAIN_REJECTED' });
  const target = new URL(backendUrl(env));
  target.searchParams.set('action', 'identityLookup');
  target.searchParams.set('proxySecret', LORD_PROXY_SECRET);
  target.searchParams.set('email', normalizedEmail);
  target.searchParams.set('sub', sub || '');
  const { response, payload } = await backendJson(target.toString(), { redirect: 'follow' }, { timeoutMs: 30000, retries: 1, label: 'Administrator identity service' });
  if (!response.ok || !payload.ok || !payload.identity || !payload.identity.found) throw serviceError('Your GSPS account is not listed in LORD contacts.', { status: 403, retryable: false, code: 'IDENTITY_NOT_FOUND' });
  return payload.identity;
}
async function cachedIdentity(email, sub, env) {
  const cache = caches.default;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const cacheKey = new Request(`https://overlord-identity-cache.local/${encodeURIComponent(String(sub || 'nosub'))}/${encodeURIComponent(normalizedEmail)}`);
  const now = Date.now();
  let cached = await cache.match(cacheKey);
  if (cached) {
    const fetchedAt = Number(cached.headers.get('X-OVERLORD-Fetched-At') || 0);
    if (fetchedAt && now - fetchedAt < IDENTITY_FRESH_SECONDS * 1000) return cached.json();
  }
  try {
    const identity = await identityLookup(normalizedEmail, sub, env);
    const stored = new Response(JSON.stringify(identity), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${IDENTITY_STALE_SECONDS}`, 'X-OVERLORD-Fetched-At': String(Date.now()) } });
    await cache.put(cacheKey, stored.clone());
    return identity;
  } catch (error) {
    if (!cached) cached = await cache.match(cacheKey);
    if (cached) {
      const fetchedAt = Number(cached.headers.get('X-OVERLORD-Fetched-At') || 0);
      if (fetchedAt && now - fetchedAt < IDENTITY_STALE_SECONDS * 1000) {
        const identity = await cached.json();
        // OVERLORD never promotes a generic GSPS account. Stale fallback is permitted
        // only for an administrator identity that was previously verified by the backend.
        if (identity && identity.isAdmin) return identity;
      }
    }
    throw error;
  }
}
async function proxyReference(env, forceRefresh = false) {
  const cache = caches.default;
  const cacheKey = new Request('https://overlord-reference-cache.local/v1.3');
  const now = Date.now();
  let cached = forceRefresh ? null : await cache.match(cacheKey);
  if (cached) {
    const fetchedAt = Number(cached.headers.get('X-OVERLORD-Fetched-At') || 0);
    if (fetchedAt && now - fetchedAt < REFERENCE_FRESH_SECONDS * 1000) {
      return new Response(await cached.clone().text(), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-OVERLORD-Reference': 'edge-fresh' } });
    }
  }
  const target = new URL(backendUrl(env));
  target.searchParams.set('action', 'reference');
  target.searchParams.set('proxySecret', LORD_PROXY_SECRET);
  if (forceRefresh) {
    target.searchParams.set('forceRefresh', '1');
    target.searchParams.set('reloadNonce', crypto.randomUUID());
  }
  try {
    const { response, payload } = await backendJson(target.toString(), { redirect: 'follow', cache: 'no-store' }, { timeoutMs: 45000, retries: forceRefresh ? 0 : 1, label: 'Reference service' });
    if (!response.ok || !payload.ok) throw serviceError(payload.error || 'Reference service returned an error.', { status: response.status || 502, retryable: RETRYABLE_UPSTREAM_STATUS.has(response.status), code: 'REFERENCE_UPSTREAM' });
    if (forceRefresh && payload.cacheReloaded !== true) throw serviceError('Reload requires the v1.3 backend. Update the Apps Script deployment.');
    const stored = new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${REFERENCE_STALE_SECONDS}`, 'X-OVERLORD-Fetched-At': String(Date.now()), ...(forceRefresh ? { 'X-OVERLORD-Reloaded-At': String(Date.now()) } : {}) } });
    // An ordinary read started before a manual reload must not replace it.
    const latest = await cache.match(cacheKey);
    if (forceRefresh || !latest || Number(latest.headers.get('X-OVERLORD-Reloaded-At') || 0) < now) {
      await cache.put(cacheKey, stored.clone());
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-OVERLORD-Reference': 'live' } });
  } catch (error) {
    if (forceRefresh) throw error;
    if (!cached) cached = await cache.match(cacheKey);
    if (cached) {
      return new Response(await cached.clone().text(), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-OVERLORD-Reference': 'edge-stale' } });
    }
    throw error;
  }
}
async function proxyTransaction(request, session, env) {
  const incoming = new URL(request.url);
  const target = new URL(backendUrl(env));
  incoming.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  target.searchParams.set('authEmail', session.email);
  target.searchParams.set('authSub', session.sub);
  target.searchParams.set('authTtbName', session.ttbName);
  target.searchParams.set('authIsAdmin', session.isAdmin ? 'true' : 'false');
  target.searchParams.set('proxySecret', LORD_PROXY_SECRET);
  const method = request.method.toUpperCase();
  const reloading = method === 'GET' && target.searchParams.get('action') === 'dashboard' && target.searchParams.get('forceRefresh') === '1';
  if (reloading) target.searchParams.set('reloadNonce', crypto.randomUUID());
  const init = { method, redirect: 'follow', headers: { 'Content-Type': 'application/json' }, ...(reloading ? { cache: 'no-store' } : {}) };
  if (!['GET', 'HEAD'].includes(method)) {
    let body = {};
    try { body = JSON.parse(await request.text() || '{}'); } catch { throw serviceError('Invalid request body.', { status: 400, retryable: false, code: 'INVALID_REQUEST' }); }
    body.authEmail = session.email;
    body.authSub = session.sub;
    body.authTtbName = session.ttbName;
    body.authIsAdmin = Boolean(session.isAdmin);
    body.proxySecret = LORD_PROXY_SECRET;
    init.body = JSON.stringify(body);
  }
  const { response, payload } = await backendJson(target.toString(), init, {
    timeoutMs: method === 'GET' ? 45000 : 60000,
    retries: reloading ? 0 : 1,
    label: 'LORD transaction service'
  });
  if (reloading && payload.ok) {
    if (payload.cacheReloaded !== true || !payload.reference) throw serviceError('Reload requires the v1.3 backend. Update the Apps Script deployment.');
    const stored = new Response(JSON.stringify({ ok: true, data: payload.reference }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${REFERENCE_STALE_SECONDS}`, 'X-OVERLORD-Fetched-At': String(Date.now()), 'X-OVERLORD-Reloaded-At': String(Date.now()) } });
    await caches.default.put(new Request('https://overlord-reference-cache.local/v1.3'), stored);
  }
  const status = response.ok ? 200 : (RETRYABLE_UPSTREAM_STATUS.has(response.status) ? 502 : response.status);
  return json(payload, status, { 'Cache-Control': 'no-store' });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/auth/config') return json({ ok: true, clientId: env.GOOGLE_CLIENT_ID });
      if (url.pathname === '/api/auth/google' && request.method === 'POST') {
        const body = await request.json();
        const claims = await verifyGoogleToken(body.credential, env);
        const identity = await cachedIdentity(claims.email, claims.sub, env);
        if (!identity.isAdmin) throw new Error('OVERLORD access is restricted to active administrators.');
        const session = { sub: claims.sub, email: claims.email.toLowerCase(), ttbName: identity.ttbName, isAdmin: true };
        return json({ ok: true, session }, 200, { 'Set-Cookie': await makeSessionCookie(session, env) });
      }
      if (url.pathname === '/api/auth/session') {
        const session = await readSession(request, env);
        if (!session || !session.isAdmin) return json({ ok: true, authenticated: false });
        let publicIdentity = publicSession(session);
        const headers = {};
        if (sessionNeedsRefresh(session)) {
          try {
            const identity = await cachedIdentity(session.email, session.sub, env);
            if (!identity || !identity.isAdmin) {
              return json({ ok: true, authenticated: false }, 200, { 'Set-Cookie': `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
            }
            publicIdentity = { ...publicIdentity, ttbName: identity.ttbName || publicIdentity.ttbName, isAdmin: true };
            headers['Set-Cookie'] = await makeSessionCookie(publicIdentity, env);
          } catch (error) {
            // A transient identity-service delay must not eject an already-valid administrator.
            // Keep the current cookie; renewal can be retried on a later visit before expiry.
            if (!error || !error.retryable) throw error;
          }
        }
        return json({ ok: true, authenticated: true, session: publicIdentity }, 200, headers);
      }
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
      const session = await readSession(request, env);
      if (!session || !session.isAdmin) {
        if (url.pathname.startsWith('/api/')) return json({ ok: false, error: 'Administrator authentication required.' }, 403);
        return env.ASSETS.fetch(request);
      }
      if (url.pathname === '/api/dashboard' && request.method === 'GET') {
        const rewrittenUrl = new URL(request.url);
        rewrittenUrl.pathname = '/api/transaction';
        rewrittenUrl.searchParams.set('action', 'dashboard');
        const rewritten = new Request(rewrittenUrl.toString(), request);
        return await proxyTransaction(rewritten, session, env);
      }
      if (url.pathname === '/api/reference' && request.method === 'GET') return await proxyReference(env, url.searchParams.get('forceRefresh') === '1');
      if (url.pathname === '/api/transaction') return proxyTransaction(request, session, env);
      return env.ASSETS.fetch(request);
    } catch (error) { return json({ ok: false, error: error.message || String(error), retryable: Boolean(error && error.retryable), code: error && error.code || 'WORKER_ERROR' }, error && error.status || 500); }
  }
};
