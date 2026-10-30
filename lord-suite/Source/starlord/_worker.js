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
// Share only identical, read-only in-flight work within this Worker isolate.
// ponytail: other isolates still load independently; no global lock or new service.
const pendingReads = new Map();
async function coalesceRead(key, load, bypass = false) {
  if (bypass) { pendingReads.delete(key); return load(); }
  let pending = pendingReads.get(key);
  if (!pending) {
    if (pendingReads.size >= 32) return load();
    pending = (async () => {
      const response = await load();
      // Share plain data, never a response stream owned by another request.
      return { body: await response.text(), status: response.status,
        statusText: response.statusText, headers: Array.from(response.headers) };
    })();
    pendingReads.set(key, pending);
  }
  try {
    const shared = await pending;
    return new Response(shared.body, { status: shared.status,
      statusText: shared.statusText, headers: shared.headers });
  }
  finally { if (pendingReads.get(key) === pending) pendingReads.delete(key); }
}

/* STARLORD v0.9.7 — compatible cache bypass and feed diagnostics */
const STATIC_EXTENSIONS = /\.(?:html|css|js|webp|png|jpg|jpeg|svg|ico|woff2?)$/i;

// Connection values belong in this Pages project's Variables and Secrets settings.
function backendUrl(env) {
  const url = env && env.LORD_BACKEND_URL;
  const secret = gsisApiSecret(env,'LORD_PROXY_SECRET');
  if (typeof url !== 'string' || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url) || url.includes('REPLACE_') ||
      typeof secret !== 'string' || !secret.trim() || secret.includes('REPLACE_') || /[\r\n]/.test(secret)) {
    const error = new Error('Set valid LORD_BACKEND_URL and LORD_PROXY_SECRET values in Cloudflare Pages settings.');
    error.status = 503;
    error.code = 'LORD_CONFIGURATION_REQUIRED';
    throw error;
  }
  return url;
}

let lastBoardRequestAt = 0;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/board') {
      try {
        backendUrl(env);
        return await proxyBoard(request, env);
      } catch (error) {
        return json({ok:false,error:error && error.code === 'LORD_CONFIGURATION_REQUIRED' ? error.message : 'The booking feed is temporarily unavailable.',code:error && error.code || 'BOARD_NETWORK'},error && error.status || 502);
      }
    }

    return env.ASSETS.fetch(request);
  }
};

async function proxyBoard(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET') return loadBoardResponse(request, env);
  const key = url.origin + '/board?' + (url.searchParams.get('date') || 'today');
  return coalesceRead(key, () => loadBoardResponse(request, env), url.searchParams.get('forceRefresh') === '1');
}
async function loadBoardResponse(request, env) {
  if (request.method !== 'GET') return json({ ok:false,error:'Method not allowed.' },405);
  const target=new URL(backendUrl(env));
  const sharedSecret=gsisApiSecret(env,'LORD_PROXY_SECRET');
  const incoming=new URL(request.url);
  if (incoming.searchParams.get('forceRefresh') === '1') return json({ok:false,error:'Use OVERLORD System settings to refresh shared data.'},403);
  const forceRefresh=false;
  const date=incoming.searchParams.get('date') || new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ok:false,error:'Choose a valid date.'},400);
  const cacheKey=new Request(new URL('/__lord_cache/v1.4/board?date='+encodeURIComponent(date),incoming.origin).toString());
  const cache=typeof caches==='undefined'?null:caches.default;
  const startedAt=Math.max(Date.now(),lastBoardRequestAt+1);
  lastBoardRequestAt=startedAt;
  if (!forceRefresh && cache) {
    try {
      const cached=await cache.match(cacheKey);
      if(cached) {
        const response=new Response(cached.body,cached);
        response.headers.set('X-LORD-Cache','HIT');
        response.headers.set('X-LORD-Worker-Version','0.9.9b');
        return response;
      }
    } catch {}
  }
  target.searchParams.set('action','starlordBoard');
  target.searchParams.set('date',date);
  target.searchParams.set('proxySecret',sharedSecret);
  if(forceRefresh){target.searchParams.set('forceRefresh','1');target.searchParams.set('reloadNonce',crypto.randomUUID());}
  try {
    // Cache the validated final JSON ourselves, after Apps Script's redirect.
    // Neither an error page nor the intermediate redirect enters this cache.
    const upstream=await fetchWithTimeout(target.toString(),{method:'GET',redirect:'follow',cache:'no-store',
      headers:{Accept:'application/json'},cf:{cacheTtl:0,cacheEverything:false}},45000);
    if(!upstream.ok) return json({ok:false,error:'The booking service returned an HTTP error.',code:'BOARD_UPSTREAM_HTTP',upstreamStatus:upstream.status},502);
    let payload;
    try { payload=await upstream.json(); }
    catch { return json({ok:false,error:'The booking service returned a page instead of valid data.',code:'BOARD_INVALID_JSON'},502); }
    if(payload && payload.ok===false) return json({ok:false,error:'The backend could not produce the booking feed.',code:'BOARD_BACKEND_REJECTED'},502);
    if(!payload || payload.ok!==true || !Array.isArray(payload.bookings)) return json({ok:false,error:'The booking service returned an invalid feed.',code:'BOARD_INVALID_FEED'},502);
    if(forceRefresh && payload.cacheReloaded!==true) return json({ok:false,error:'Reload requires the current LORD backend.',code:'BOARD_BACKEND_VERSION'},502);
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=15, s-maxage=30',
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-LORD-Fetched-At':String(startedAt),'X-LORD-Worker-Version':'0.9.9b',
      'Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'"};
    if(cache) {
      try {
        const newer=await cache.match(cacheKey);
        if(!newer || Number(newer.headers.get('X-LORD-Fetched-At') || 0)<=startedAt) {
          await cache.put(cacheKey,new Response(JSON.stringify({...payload,cacheReloaded:false}),{status:200,headers}));
        }
      } catch {} // A cache fault must not discard a valid live response.
    }
    return new Response(JSON.stringify(payload),{status:200,headers:{...headers,
      'Cache-Control':forceRefresh?'no-store':headers['Cache-Control'],'X-LORD-Cache':forceRefresh?'BYPASS':'MISS'}});
  } catch(error) {return json({ok:false,error:'The booking feed is temporarily unavailable.',code:error && error.name==='AbortError'?'BOARD_TIMEOUT':'BOARD_NETWORK'},502);}
}

async function fetchWithTimeout(input, init = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('The booking feed read timed out.');
      error.name = 'AbortError';
      reject(error);
      controller.abort();
    }, timeoutMs);
  });
  // Headers alone do not finish a read. A stalled redirect response body used
  // to hold the shared poll forever, so every later refresh joined that read.
  const completeRead = (async () => {
    const response = await fetch(input, compatibleFetchOptions(init, controller.signal));
    const body = await response.text();
    return new Response(body || null, response);
  })();
  try { return await Promise.race([completeRead, deadline]); }
  finally { clearTimeout(timer); }
}

function compatibleFetchOptions(init, signal) {
  const options = { ...init, signal };
  // RequestInit.cache throws on older Workers compatibility dates. Preserve
  // fresh reads using HTTP headers and the longstanding Cloudflare controls.
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

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-LORD-Worker-Version': '0.9.9b',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
