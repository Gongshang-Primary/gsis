/* STARLORD v1.5 — compatible cache bypass and feed diagnostics */
const STATIC_EXTENSIONS = /\.(?:html|css|js|webp|png|jpg|jpeg|svg|ico|woff2?)$/i;
const LORD_BACKEND_URL = 'https://script.google.com/macros/s/REPLACE_DEPLOYMENT_ID/exec';
const LORD_PROXY_SECRET = 'REPLACE_PROXY_SECRET';

let lastBoardRequestAt = 0;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/board') {
      return proxyBoard(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

async function proxyBoard(request, env) {
  if (request.method !== 'GET') return json({ ok:false,error:'Method not allowed.' },405);
  const sharedSecret=String(LORD_PROXY_SECRET || '').trim();
  if (!sharedSecret) return json({ok:false,error:'Server configuration is incomplete.'},503);
  const incoming=new URL(request.url);
  const forceRefresh=incoming.searchParams.get('forceRefresh')==='1';
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
        response.headers.set('X-LORD-Worker-Version','1.5');
        return response;
      }
    } catch {}
  }
  const target=new URL(LORD_BACKEND_URL);
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
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-LORD-Fetched-At':String(startedAt),'X-LORD-Worker-Version':'1.5',
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
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(input, compatibleFetchOptions(init, controller.signal)); }
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
      'X-LORD-Worker-Version': '1.5',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
