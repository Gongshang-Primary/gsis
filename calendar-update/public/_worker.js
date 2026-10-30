/* GSIS_API_SECRET_BEGIN */
// First-party API credentials share one operator-selected setting. Browser
// sessions, private relief links and third-party credentials stay independent.
function gsisApiSecret(env,legacyName){
 const value=env?.GSIS_SECRET;
 if(value!==undefined||Object.prototype.hasOwnProperty.call(env||{},'GSIS_SECRET')){
  if(typeof value!=='string'||!/^[!-~]{32,8000}$/.test(value))throw Object.assign(Error('GSIS_SECRET must contain 32 to 8000 printable ASCII characters without spaces.'),{status:503,code:'GSIS_SECRET_INVALID'});
  return value;
 }
 return env?.[legacyName];
}

/* GSIS_API_SECRET_END */
/**
 * GSPS Shared Calendar v2 — Cloudflare Pages Worker
 * 0.9.7
 *
 * Required Cloudflare bindings:
 *   GOOGLE_CLIENT_ID           plain variable
 *   CALENDAR_APPS_SCRIPT_URL   plain variable (deployed Apps Script /exec URL)
 *   CALENDAR_SESSION_SECRET    secret
 *   CALENDAR_PROXY_SECRET      secret; must match Apps Script Script Property
 * Optional background sync:
 *   CALENDAR_SERVICE_SECRET    secret; match standalone Worker and Script Property
 *
 * Pages Functions binding:
 *   ASSETS                     automatically available for Pages _worker.js
 *
 * Authentication model follows the existing GSPS LORD/ROULETTE pattern:
 * Google Identity Services ID token -> Worker verification -> signed HttpOnly
 * session cookie -> Worker injects verified actor + shared proxy secret into
 * Apps Script requests.
 */

const WORKER_VERSION = '0.9.9b';
const COOKIE_NAME = '__Host-gsps_cal_session';
const SESSION_SECONDS = 12 * 60 * 60;
const GSPS_DOMAIN = 'gsps.edu.sg';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/internal/sync-continue' && request.method === 'POST') {
        return await continueCalendarSync(request, env);
      }
      if (url.pathname === '/api/client-config' && request.method === 'GET') {
        return json({
          ok: true,
          frontendVersion: WORKER_VERSION,
          googleClientId: env.GOOGLE_CLIENT_ID || '',
          calendarJobsEnabled: !!env.CALENDAR_JOBS?.fetch,
          calendarChangePushEnabled: calendarChangeGatewayEnabled(env),
          calendarChangeCoverage: 'supported-pages-writes',
          calendarExternalEditsDetected: false
        });
      }

      if (url.pathname === '/auth/google' && request.method === 'POST') {
        return await handleGoogleLogin(request, env);
      }

      if (url.pathname === '/auth/logout' && request.method === 'POST') {
        return json({ ok: true }, 200, {
          'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
        });
      }

      if (url.pathname === '/api/calendar-jobs' && ['GET','POST'].includes(request.method)) {
        const actor = await requireSession(request, env);
        return await proxyCalendarJobs(request, env, actor);
      }

      if (url.pathname === '/api/calendar-changes' && request.method === 'GET') {
        const actor = await requireSession(request, env);
        if (request.headers.get('Upgrade') === 'websocket' && request.headers.get('Origin') !== url.origin) throw httpError(403, 'Calendar change connections require the same origin.');
        const year=Number(url.searchParams.get('year')),cursor=Number(url.searchParams.get('cursor') || 0);
        if(!Number.isInteger(year)||year<2000||year>2099||!Number.isSafeInteger(cursor)||cursor<0)throw httpError(400,'Choose a valid Calendar year and cursor.');
        return calendarChangeGatewayCall(env,actor,{kind:request.headers.get('Upgrade') === 'websocket'?'subscribe':'replay',year,cursor});
      }

      if (url.pathname === '/api/calendar-changes/delta' && request.method === 'POST') {
        const actor=await requireSession(request,env);
        if(!calendarChangeGatewayEnabled(env))throw httpError(503,'Calendar change push is not enabled.');
        const payload=await readJson(request);
        if(JSON.stringify(payload).length>400000)throw httpError(413,'Calendar revision list is too large.');
        return proxyAppsScript(env,actor,'calendarChangesDelta',payload);
      }

      if (url.pathname === '/api/bootstrap' && request.method === 'GET') {
        const actor = await requireSession(request, env);
        const year = url.searchParams.get('year') || '';
        return await proxyAppsScript(env, actor, 'bootstrap', year ? { year: Number(year) } : {});
      }

      if (url.pathname === '/api' && request.method === 'POST') {
        const actor = await requireSession(request, env);
        const body = await readJson(request);
        if (!body.action) return json({ ok: false, error: 'Missing action.' }, 400);
        return await proxyCalendarTrackedWrite(env, actor, body.action, body.payload || {});
      }

      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
        return json({ ok: false, error: 'Not found.' }, 404);
      }

      // Static frontend from Cloudflare Pages.
      const response = await env.ASSETS.fetch(request);
      const secured = withSecurityHeaders(response);
      const headers = new Headers(secured.headers);
      if (/\.(js|css|html)$/.test(url.pathname) || url.pathname === '/') headers.set('Cache-Control','no-cache');
      return new Response(secured.body,{status:secured.status,statusText:secured.statusText,headers});
    } catch (err) {
      const status = Number(err && err.status) || 500;
      return json({
        ok: false,
        error: String(err && err.message ? err.message : err),
        // These errors occur in authentication/request validation, before forwarding.
        definite: [400,401,403].includes(status),
        code: [401,403].includes(status) ? 'AUTH_REQUIRED' : 'TRANSPORT_ERROR'
      }, status);
    }
  }
};

// Only this authenticated gateway can choose the original actor. The dedicated
// service accepts a purpose-scoped signature, never arbitrary browser identity.
async function proxyCalendarJobs(request, env, actor) {
  if (!env.CALENDAR_JOBS?.fetch) throw httpError(503, 'Calendar background saves are not configured.');
  const input = request.method === 'GET' ? {kind:'list'} : await readJson(request);
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['kind','action','payload','jobId','attemptOperationId'].includes(key)) ||
      !['enqueue','list','retry','check'].includes(input.kind) ||
      (input.kind === 'enqueue' && !['saveEvent','deleteEvent','saveParentSide','relocateEvent'].includes(input.action)) ||
      JSON.stringify(input).length > 34000) throw httpError(400, 'Choose a supported, bounded Calendar event job.');
  const secret = gsisApiSecret(env,'CALENDAR_PROXY_SECRET');
  if (!secret) throw httpError(503, 'Calendar background save authentication is not configured.');
  const payload = JSON.stringify({purpose:'calendar-job-gateway-v1',timestamp:Date.now(),nonce:crypto.randomUUID(),actor,input});
  const response = await env.CALENDAR_JOBS.fetch(new Request('https://calendar-jobs.internal/commands', {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature:await hmac(payload,secret,true)})
  }));
  const headers = new Headers(response.headers); headers.set('Cache-Control','no-store');
  return new Response(response.body,{status:response.status,headers});
}

// A wake is only a hint. The durable source session, claim and fresh Admin role
// in Apps Script decide whether work may run. Replayed wakes cannot start jobs.
async function continueCalendarSync(request, env) {
  if (!gsisApiSecret(env,'CALENDAR_SERVICE_SECRET')) throw httpError(503, 'Calendar background sync is not configured.');
  const envelope = await readJson(request);
  if (typeof envelope.payload !== 'string' || envelope.payload.length > 2048 || !/^[a-f0-9]{64}$/.test(String(envelope.signature || ''))) {
    throw httpError(401, 'Invalid Calendar service signature.');
  }
  const expected = await hmac(envelope.payload, gsisApiSecret(env,'CALENDAR_SERVICE_SECRET'), true);
  if (!timingSafeEqual(envelope.signature, expected)) throw httpError(401, 'Invalid Calendar service signature.');
  let payload;
  try { payload = JSON.parse(envelope.payload); } catch { throw httpError(400, 'Invalid Calendar service payload.'); }
  if (payload?.purpose !== 'gsis-calendar-sync-wake-v1' || !Number.isFinite(payload.timestamp) ||
      Math.abs(Date.now() - payload.timestamp) > 120000 || !/^[a-zA-Z0-9-]{16,80}$/.test(String(payload.nonce || ''))) {
    throw httpError(401, 'Calendar service wake has expired or is invalid.');
  }
  if (!env.CALENDAR_APPS_SCRIPT_URL || !gsisApiSecret(env,'CALENDAR_PROXY_SECRET')) throw httpError(503, 'Calendar backend is not configured.');
  const result = await callAppsScriptManualRedirect_(env.CALENDAR_APPS_SCRIPT_URL, JSON.stringify({
    proxySecret: gsisApiSecret(env,'CALENDAR_PROXY_SECRET'), service: 'gsis-calendar-sync-worker-v1',
    calendarServiceSecret: gsisApiSecret(env,'CALENDAR_SERVICE_SECRET'), action: 'calendarSyncContinue',
    requestId: crypto.randomUUID()
  }));
  if (!result || result.ok !== true || !result.result) {
    return json({ok: false, error: 'Calendar background sync could not be confirmed. The source session is retained.'},
      Math.min(599, Math.max(400, Number(result?.status) || 502)));
  }
  return json(result);
}


async function handleGoogleLogin(request, env) {
  const body = await readJson(request);
  const credential = String(body.credential || '').trim();
  if (!credential) return json({ ok: false, error: 'Google credential missing.' }, 400);

  const google = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID);
  const email = String(google.email || '').toLowerCase();
  const alias = email.split('@')[0];

  const session = {
    sub: google.sub,
    email,
    userAlias: alias,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS
  };

  const cookieValue = await signSession(session, env.CALENDAR_SESSION_SECRET);
  return json({
    ok: true,
    userAlias: alias
  }, 200, {
    'Set-Cookie': `${COOKIE_NAME}=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`
  });
}


async function verifyGoogleIdToken(idToken, clientId) {
  if (!clientId) throw httpError(500, 'GOOGLE_CLIENT_ID is not configured.');

  // Tokeninfo is called only at sign-in. Normal API traffic uses the signed
  // Worker session cookie and does not repeatedly call Google.
  const res = await fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { headers: { 'Accept': 'application/json' } }
  );

  if (!res.ok) throw httpError(401, 'Google sign-in token could not be verified.');
  const token = await res.json();

  const now = Math.floor(Date.now() / 1000);
  const issuerOk = token.iss === 'https://accounts.google.com' || token.iss === 'accounts.google.com';
  const emailVerified = token.email_verified === true || token.email_verified === 'true';
  const email = String(token.email || '').toLowerCase();

  if (!issuerOk) throw httpError(401, 'Unexpected Google token issuer.');
  if (String(token.aud || '') !== String(clientId)) throw httpError(401, 'Google token audience mismatch.');
  if (!emailVerified) throw httpError(401, 'Google account email is not verified.');
  if (String(token.hd || '').toLowerCase() !== GSPS_DOMAIN) throw httpError(403, 'A GSPS Google account is required.');
  if (!email.endsWith('@' + GSPS_DOMAIN)) throw httpError(403, 'A GSPS Google account is required.');
  if (Number(token.exp || 0) <= now) throw httpError(401, 'Google sign-in token has expired.');
  if (!token.sub) throw httpError(401, 'Google account identifier missing.');

  return token;
}


async function requireSession(request, env) {
  if (!env.CALENDAR_SESSION_SECRET) throw httpError(500, 'CALENDAR_SESSION_SECRET is not configured.');

  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const token = cookies[COOKIE_NAME];
  if (!token) throw httpError(401, 'Sign-in required.');

  const session = await verifySession(token, env.CALENDAR_SESSION_SECRET);
  if (!session || Number(session.exp || 0) <= Math.floor(Date.now() / 1000)) {
    throw httpError(401, 'Session expired. Sign in again.');
  }

  if (!String(session.email || '').toLowerCase().endsWith('@' + GSPS_DOMAIN)) {
    throw httpError(403, 'GSPS account required.');
  }

  const actor={
    sub: String(session.sub || ''),
    email: String(session.email || '').toLowerCase(),
    userAlias: String(session.userAlias || '').toLowerCase()
  };
  Object.defineProperty(actor,'sessionExpiresAt',{value:Number(session.exp)*1000});
  return actor;
}


async function proxyAppsScript(env, actor, action, payload) {
  if (!env.CALENDAR_APPS_SCRIPT_URL) throw httpError(500, 'CALENDAR_APPS_SCRIPT_URL is not configured.');
  if (!gsisApiSecret(env,'CALENDAR_PROXY_SECRET')) throw httpError(500, 'CALENDAR_PROXY_SECRET is not configured.');

  const requestId = crypto.randomUUID();
  const body = JSON.stringify({
    proxySecret: gsisApiSecret(env,'CALENDAR_PROXY_SECRET'),
    actor,
    action,
    payload,
    requestId
  });

  // Apps Script ContentService requires a POST first hop followed by a GET to
  // the returned googleusercontent result URL. Use exactly one Apps Script
  // execution per browser request; do not issue a speculative second POST.
  const data = await callAppsScriptManualRedirect_(env.CALENDAR_APPS_SCRIPT_URL, body);

  if (!data || data.ok !== true) {
    const message = data && data.error ? data.error : 'Calendar backend returned an invalid response.';
    return json({ok:false,error:message,code:data?.code || 'BACKEND_ERROR',
      definite:data?.definite === true,current:data?.current || null,
      ...(Number.isFinite(data?.retryAfterMs)?{retryAfterMs:Math.max(0,Math.min(86400000,data.retryAfterMs))}:{})},
      Math.min(599,Math.max(400,Number(data?.status) || 502)),{'Cache-Control':'no-store'});
  }

  if (!Object.prototype.hasOwnProperty.call(data, 'result')) {
    throw httpError(502, 'Calendar backend returned an incomplete response. Please retry.');
  }

  // Bootstrap has a stronger contract because the UI cannot function without
  // actor/year metadata.
  if (action === 'bootstrap') {
    const result = data.result;
    if (!result || typeof result !== 'object' || !result.actor || !Array.isArray(result.years)) {
      throw httpError(502, 'Calendar backend returned incomplete bootstrap data. Please retry.');
    }
  }

  return json(data, 200, {
    'Cache-Control': 'no-store'
  });
}

async function callAppsScriptManualRedirect_(url, body) {
  let firstHop;

  try {
    firstHop = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type':
          'application/json'
      },
      body
    });

  } catch (err) {
    throw httpError(
      502,
      'Could not reach the Apps Script backend for this request. ' +
      'For Calendar Sync, click Sync again; the resumable session is preserved. ' +
      'Transport detail: ' +
      String(
        err && err.message
          ? err.message
          : err
      )
    );
  }

  let upstream =
    firstHop;

  if (
    firstHop.status >= 300 &&
    firstHop.status < 400
  ) {
    const location =
      firstHop.headers.get(
        'Location'
      );

    if (!location) {
      throw httpError(
        502,
        'Calendar backend redirect was missing a Location header.'
      );
    }

    try {
      upstream = await fetch(
        location,
        {
          method:
            'GET',
          redirect:
            'follow',
          headers: {
            'Accept':
              'application/json'
          }
        }
      );

    } catch (err) {
      throw httpError(
        502,
        'Apps Script began the request but the result fetch failed. ' +
        'For Calendar Sync, click Sync again; completed rows are not reprocessed. ' +
        'Transport detail: ' +
        String(
          err && err.message
            ? err.message
            : err
        )
      );
    }
  }

  return parseAppsScriptResponse_(
    upstream
  );
}


async function parseAppsScriptResponse_(upstream) {
  const text = await upstream.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw httpError(502, 'Calendar backend returned an invalid response.');
  }

  // Apps Script reports application errors in a successful ContentService
  // response. Preserve the envelope so conflicts/definite outcomes reach the UI.
  if (data && typeof data === 'object' && !Array.isArray(data) && data.ok === false) return data;
  if (!upstream.ok || !data || data.ok !== true) {
    throw httpError(502, `Calendar backend returned an invalid response (${upstream.status}).`);
  }

  return data;
}


async function signSession(payload, secret) {
  if (!secret) throw httpError(500, 'CALENDAR_SESSION_SECRET is not configured.');
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(body, secret);
  return body + '.' + sig;
}


async function verifySession(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;

  const expected = await hmac(parts[0], secret);
  if (!timingSafeEqual(parts[1], expected)) return null;

  try {
    const jsonText = new TextDecoder().decode(base64UrlDecode(parts[0]));
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}


async function hmac(message, secret, hex = false) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const bytes = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message)
  ));
  return hex ? Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') : base64UrlEncode(bytes);
}


function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}


function base64UrlDecode(text) {
  let b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}


function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}


function parseCookies(header) {
  const out = {};
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = value;
  });
  return out;
}


async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw httpError(400, 'Invalid JSON request.');
  }
}


function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  return new Response(JSON.stringify(data), { status, headers });
}


function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client; " +
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; " +
    "frame-src https://accounts.google.com/gsi/; " +
    "connect-src 'self' https://accounts.google.com; " +
    "img-src 'self' data: https://lh3.googleusercontent.com; " +
    "base-uri 'self'; frame-ancestors 'self'"
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}


function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// The new affordance is explicitly enabled on both Pages and the jobs Worker.
function calendarChangeGatewayEnabled(env){return env.CALENDAR_CHANGE_PUSH==='true'&&!!env.CALENDAR_JOBS?.fetch;}
async function calendarChangeGatewayCall(env,actor,input){
 if(!calendarChangeGatewayEnabled(env))throw httpError(503,'Calendar change push is not enabled.');
 if(input.kind==='subscribe')input={...input,sessionExpiresAt:actor.sessionExpiresAt};
 const payload=JSON.stringify({purpose:'calendar-change-gateway-v1',timestamp:Date.now(),nonce:crypto.randomUUID(),actor,input});
 const response=await env.CALENDAR_JOBS.fetch(new Request('https://calendar-jobs.internal/changes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature:await hmac(payload,gsisApiSecret(env,'CALENDAR_PROXY_SECRET'),true)})}));
 return response;
}
const CALENDAR_CHANGE_READ_ACTIONS=new Set(['bootstrap','eventMutationStatus','calendarSyncStatus','calendarChangesAuthorize','calendarChangesDelta','calendarPreflight','healthCheck','calendarReconciliationPreview','calendarWipePreview','archiveYearsPreview','runSelfTests']);
async function proxyCalendarTrackedWrite(env,actor,action,payload){
 if(!calendarChangeGatewayEnabled(env)||CALENDAR_CHANGE_READ_ACTIONS.has(action))return proxyAppsScript(env,actor,action,payload);
 // Store only identity/scope metadata, never proposed titles, people or edits.
 // Use global invalidation because year moves and metadata can affect multiple
 // years; the subsequent delta is always scoped and freshly authorized.
 const intentId=crypto.randomUUID();
 const captured=await calendarChangeGatewayCall(env,actor,{kind:'begin',intentId,action,year:0});
 if(!captured.ok)return captured;
 let outcome='unknown';
 try{
  const response=await proxyAppsScript(env,actor,action,payload);
  const data=await response.clone().json();
  outcome=data?.ok===true?'changed':data?.definite===true?'no-change':'unknown';
  return response;
 }finally{
  // A lost finish acknowledgement is recovered from the pre-dispatch intent.
  // Never replay the Google write and never replace its response with a hint.
  try{await calendarChangeGatewayCall(env,actor,{kind:'finish',intentId,outcome});}catch(error){console.error('Calendar change intent retained for reconciliation.');}
 }
}
