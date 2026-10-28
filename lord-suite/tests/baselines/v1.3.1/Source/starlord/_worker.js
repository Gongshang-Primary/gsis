/* STARLORD v1.3 — explicit live reload with cache bypass */
const STATIC_EXTENSIONS = /\.(?:html|css|js|webp|png|jpg|jpeg|svg|ico|woff2?)$/i;
const LORD_BACKEND_URL = 'https://script.google.com/macros/s/REPLACE_DEPLOYMENT_ID/exec';
const LORD_PROXY_SECRET = 'REPLACE_PROXY_SECRET';

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
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Method not allowed.' }, 405);
  }

  const backendUrl = LORD_BACKEND_URL;
  const sharedSecret = String(LORD_PROXY_SECRET || '').trim();

  if (!sharedSecret) {
    return json({ ok: false, error: 'Server configuration is incomplete.' }, 503);
  }

  const incoming = new URL(request.url);
  const forceRefresh = incoming.searchParams.get('forceRefresh') === '1';
  const target = new URL(backendUrl);
  target.searchParams.set('action', 'starlordBoard');
  target.searchParams.set('date', incoming.searchParams.get('date') || '');
  target.searchParams.set('proxySecret', sharedSecret);
  if (forceRefresh) {
    target.searchParams.set('forceRefresh', '1');
    target.searchParams.set('reloadNonce', crypto.randomUUID());
  }

  try {
    const response = await fetchWithTimeout(target.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      ...(forceRefresh ? { cache: 'no-store', cf: { cacheTtl: 0, cacheEverything: false } } : { cf: { cacheTtl: 30, cacheEverything: true } })
    }, forceRefresh ? 45000 : 12000);

    const text = await response.text();
    if (forceRefresh) {
      let payload;
      try { payload = JSON.parse(text); } catch { throw new Error('The booking feed returned an invalid response.'); }
      if (!response.ok || !payload || payload.ok !== true) throw new Error(payload && payload.error || 'The booking feed is temporarily unavailable.');
      if (payload.cacheReloaded !== true) return json({ ok: false, error: 'Reload requires the v1.3 backend. Update the Apps Script deployment.' }, 502);
    }
    return new Response(text, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': forceRefresh ? 'no-store' : 'public, max-age=15, s-maxage=30',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'"
      }
    });
  } catch (error) {
    return json({ ok: false, error: 'The booking feed is temporarily unavailable.' }, 502);
  }
}

async function fetchWithTimeout(input, init = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
