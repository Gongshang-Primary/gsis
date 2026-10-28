/* LORD v1.5 LTS — explicit reload from Sheets */
const COOKIE_NAME = '__Host-lord_session';
const SESSION_SECONDS = 14 * 24 * 60 * 60;
const SESSION_REFRESH_THRESHOLD_SECONDS = 7 * 24 * 60 * 60;
const IDENTITY_CACHE_SECONDS = 15 * 60;
const REFERENCE_FRESH_SECONDS = 15 * 60;
const REFERENCE_STALE_SECONDS = 24 * 60 * 60;
const JWKS_FRESH_SECONDS = 60 * 60;
const JWKS_STALE_SECONDS = 24 * 60 * 60;
const READ_TIMEOUT_MS = 30000;
const TRANSACTION_READ_TIMEOUT_MS = 45000;
const BOOKING_WRITE_TIMEOUT_MS = 90000;
const EVIDENCE_WRITE_TIMEOUT_MS = 180000;
const LORD_BACKEND_URL = 'https://script.google.com/macros/s/REPLACE_DEPLOYMENT_ID/exec';
const LORD_PROXY_SECRET = 'REPLACE_PROXY_SECRET';

function backendUrl() {
  return LORD_BACKEND_URL;
}

async function fetchWithTimeout(url, init = {}, timeoutMs = READ_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, compatibleFetchOptions(init, controller.signal)); }
  finally { clearTimeout(timer); }
}

function compatibleFetchOptions(init, signal) {
  const options = { ...init, signal };
  if (options.cache === 'no-store') {
    delete options.cache;
    options.headers = new Headers(options.headers);
    options.headers.set('Cache-Control', 'no-cache, no-store');
    options.headers.set('Pragma', 'no-cache');
    options.cf = { ...options.cf, cacheEverything: false, cacheTtlByStatus: { '100-599': -1 } };
    delete options.cf.cacheTtl;
  }
  return options;
}

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-LORD-Worker-Version': '1.5', ...extraHeaders } });
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
  const key = new Request('https://lord-auth-cache.local/google-jwks');
  const now = Date.now();
  let cached = forceRefresh ? null : await cache.match(key);
  if (cached) {
    const fetchedAt = Number(cached.headers.get('X-LORD-Fetched-At') || 0);
    if (fetchedAt && now - fetchedAt < JWKS_FRESH_SECONDS * 1000) return cached.json();
  }
  try {
    const response = await fetchWithTimeout('https://www.googleapis.com/oauth2/v3/certs', { redirect: 'follow' }, 12000);
    if (!response.ok) throw new Error('Could not retrieve Google verification keys.');
    const payload = await response.json();
    const stored = new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${JWKS_STALE_SECONDS}`, 'X-LORD-Fetched-At': String(now) } });
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
function displayNameFromGspsEmail(email) {
  const localPart = String(email || '').toLowerCase().split('@')[0];
  const words = localPart.split('.').filter(Boolean);
  if (!words.length) return 'GSPS User';
  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
async function identityLookup(email, sub, env) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail.endsWith('@gsps.edu.sg')) throw new Error('Only verified gsps.edu.sg accounts may use LORD.');
  try {
    const target = new URL(backendUrl(env));
    target.searchParams.set('action', 'identityLookup');
    target.searchParams.set('proxySecret', LORD_PROXY_SECRET);
    target.searchParams.set('email', normalizedEmail);
    target.searchParams.set('sub', sub || '');
    const response = await fetchWithTimeout(target.toString(), { redirect: 'follow' }, 8000);
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch {}
    if (response.ok && payload && payload.ok && payload.identity && payload.identity.found) return payload.identity;
  } catch (error) {
    // Authentication has already cryptographically verified a GSPS Google account.
    // Do not make a temporary Sheets/Apps Script delay prevent that user from entering LORD.
  }
  return {
    found: true,
    ttbName: displayNameFromGspsEmail(normalizedEmail),
    email: normalizedEmail,
    isAdmin: false,
    role: '',
    googleSub: sub || ''
  };
}
async function cachedIdentity(email, sub, env) {
  const cache = caches.default;
  const key = new Request(`https://identity-cache.local/${encodeURIComponent(email.toLowerCase())}`);
  let response = await cache.match(key);
  if (response) return response.json();
  const identity = await identityLookup(email, sub, env);
  response = json(identity, 200, { 'Cache-Control': `public, max-age=${IDENTITY_CACHE_SECONDS}` });
  await cache.put(key, response.clone());
  return identity;
}
async function proxyReference(env, forceRefresh = false, reloadDate = '') {
  const cache = caches.default;
  const cacheKey = new Request('https://lord-reference-cache.local/v1.3');
  const now = Date.now();
  let cached = forceRefresh ? null : await cache.match(cacheKey);
  if (cached) {
    const fetchedAt = Number(cached.headers.get('X-LORD-Fetched-At') || 0);
    if (fetchedAt && now - fetchedAt < REFERENCE_FRESH_SECONDS * 1000) {
      return new Response(await cached.clone().text(), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-LORD-Worker-Version': '1.5', 'X-LORD-Reference': 'edge-fresh' } });
    }
  }

  const target = new URL(backendUrl(env));
  target.searchParams.set('action', 'reference');
  target.searchParams.set('proxySecret', LORD_PROXY_SECRET);
  if (forceRefresh) {
    target.searchParams.set('forceRefresh', '1');
    target.searchParams.set('reloadNonce', crypto.randomUUID());
    if (reloadDate) target.searchParams.set('reloadDate', reloadDate);
  }
  let lastError = null;
  const attempts = 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchWithTimeout(target.toString(), { redirect: 'follow', cache: 'no-store' }, 45000);
      const text = await response.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch {}
      if (response.ok && payload && payload.ok) {
        if (forceRefresh && payload.cacheReloaded !== true) throw new Error('Reload requires the v1.3 backend. Update the Apps Script deployment.');
        // A shared reference cache must never retain the selected day's bookings.
        const storedPayload = { ok: true, generatedAt: payload.generatedAt, data: payload.data };
        const stored = new Response(JSON.stringify(storedPayload), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${REFERENCE_STALE_SECONDS}`, 'X-LORD-Fetched-At': String(Date.now()), ...(forceRefresh ? { 'X-LORD-Reloaded-At': String(Date.now()) } : {}) } });
        // An ordinary read started before a manual reload must not replace it.
        const latest = await cache.match(cacheKey);
        if (forceRefresh || !latest || Number(latest.headers.get('X-LORD-Reloaded-At') || 0) < now) {
          await cache.put(cacheKey, stored.clone());
        }
        return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-LORD-Worker-Version': '1.5', 'X-LORD-Reference': 'live' } });
      }
      lastError = new Error((payload && payload.error) || 'Reference backend returned an unexpected response.');
    } catch (error) { lastError = error; }
    if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 800));
  }

  if (forceRefresh) throw lastError || new Error('Could not reload from Sheets.');
  if (!cached) cached = await cache.match(cacheKey);
  if (cached) {
    return new Response(await cached.clone().text(), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-LORD-Worker-Version': '1.5', 'X-LORD-Reference': 'edge-stale' } });
  }
  throw lastError || new Error('Reference data could not be loaded.');
}
async function proxyTransaction(request, session, env) {
  const incoming = new URL(request.url);
  const target = new URL(backendUrl(env));
  incoming.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  target.searchParams.set('authEmail', session.email);
  target.searchParams.set('authSub', session.sub);
  target.searchParams.set('authTtbName', session.ttbName);
  target.searchParams.set('authIsAdmin', session.isAdmin ? 'true' : 'false');
  target.searchParams.set('authIdentityType', session.identityType || 'GSPS');
  target.searchParams.set('authMobile', session.mobile || '');
  target.searchParams.set('proxySecret', LORD_PROXY_SECRET);
  const init = { method: request.method, redirect: 'follow', headers: { 'Content-Type': 'application/json' } };
  let action = String(incoming.searchParams.get('action') || '').toLowerCase();
  let timeoutMs = TRANSACTION_READ_TIMEOUT_MS;
  if (!['GET', 'HEAD'].includes(request.method)) {
    let body = {};
    try { body = JSON.parse(await request.text() || '{}'); } catch { throw new Error('Invalid request body.'); }
    action = String(body.action || action).toLowerCase();
    body.authEmail = session.email;
    body.authSub = session.sub;
    body.authTtbName = session.ttbName;
    body.authIsAdmin = Boolean(session.isAdmin);
    body.authIdentityType = session.identityType || 'GSPS';
    body.authMobile = session.mobile || '';
    body.proxySecret = LORD_PROXY_SECRET;
    init.body = JSON.stringify(body);
    timeoutMs = (action === 'loan' || action === 'return') ? EVIDENCE_WRITE_TIMEOUT_MS : BOOKING_WRITE_TIMEOUT_MS;
  }
  let response;
  try { response = await fetchWithTimeout(target.toString(), init, timeoutMs); }
  catch (cause) {
    const error = new Error('The Google backend could not be reached. Please try again.');
    error.status = cause && cause.name === 'AbortError' ? 504 : 502;
    error.retryable = true;
    throw error;
  }
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!payload || typeof payload !== 'object') {
    const looksHtml = /^\s*</.test(text || '');
    return json({
      ok: false,
      error: looksHtml ? 'Google backend returned a temporary HTML response. Please retry.' : 'Google backend returned an unexpected response. Please retry.',
      retryable: true,
      code: looksHtml ? 'UPSTREAM_HTML' : 'UPSTREAM_INVALID_RESPONSE'
    }, 502);
  }
  return json(payload, response.ok ? 200 : 502);
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
        const session = { identityType: 'GSPS', sub: claims.sub, email: claims.email.toLowerCase(), ttbName: identity.ttbName, mobile: '', isAdmin: Boolean(identity.isAdmin) };
        return json({ ok: true, session }, 200, { 'Set-Cookie': await makeSessionCookie(session, env) });
      }

      if (url.pathname === '/api/auth/relief' && request.method === 'POST') {
        const body = await request.json();
        const name = String(body.name || '').trim();
        let mobile = String(body.mobile || '').replace(/\D/g, '');
        if (mobile.startsWith('65') && mobile.length === 10) mobile = mobile.slice(2);
        if (!name) throw new Error('Enter your name.');
        if (!/^[689]\d{7}$/.test(mobile)) throw new Error('Enter a valid 8-digit Singapore mobile number.');
        const session = { identityType: 'RELIEF', sub: 'relief:' + mobile, email: '', ttbName: name, mobile, isAdmin: false };
        return json({ ok: true, session }, 200, { 'Set-Cookie': await makeSessionCookie(session, env) });
      }
      if (url.pathname === '/api/auth/session') {
        const session = await readSession(request, env);
        if (!session) return json({ ok: true, authenticated: false });
        const headers = sessionNeedsRefresh(session) ? { 'Set-Cookie': await makeSessionCookie(publicSession(session), env) } : {};
        return json({ ok: true, authenticated: true, session: publicSession(session) }, 200, headers);
      }
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
      const session = await readSession(request, env);
      if (url.pathname === '/api/reference') {
        if (!session) return json({ ok: false, error: 'Authentication required.' }, 401);
        if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed.' }, 405);
        const forceRefresh = url.searchParams.get('forceRefresh') === '1';
        const date = url.searchParams.get('date') || '';
        const reloadDate = forceRefresh && session.identityType !== 'RELIEF' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
        return await proxyReference(env, forceRefresh, reloadDate);
      }
      if (url.pathname === '/api/transaction') {
        if (!session) return json({ ok: false, error: 'Authentication required.' }, 401);
        if (session.identityType === 'RELIEF') {
          let action = String(url.searchParams.get('action') || '').toLowerCase();
          if (request.method !== 'GET') {
            try { const clone = request.clone(); const body = JSON.parse(await clone.text() || '{}'); action = String(body.action || action).toLowerCase(); } catch {}
          }
          const allowed = ['bookingeligible','opensessions','session','loan','return'];
          if (!allowed.includes(action)) return json({ ok: false, error: 'Relief teacher access is limited to loan and return functions.' }, 403);
        }
        return await proxyTransaction(request, session, env);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      const timedOut = error && error.name === 'AbortError';
      return json({ ok: false, error: timedOut ? 'Upstream service timed out. Please retry.' : (error.message || String(error)), retryable: timedOut || Boolean(error.retryable) }, error.status || (timedOut ? 504 : 400));
    }
  }
};
