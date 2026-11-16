import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { googleFixture } from './v1-product/drive-connection-fixtures.mjs';
import { origin } from './v1-product/suite.mjs';
const f = await googleFixture();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'], executablePath: process.env.GSIS_BROWSER_EXECUTABLE || process.env.ROSTER_TEST_CHROMIUM });
try {
  const context = await browser.newContext();
  await context.addCookies([{ name: '__Host-gsis_session', value: f.admin.token, url: origin, secure: true, httpOnly: true, sameSite: 'Lax' }]);
  const requests = [], errors = [];
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === 'https://accounts.google.com') {
      const callback = f.consent(url.href), target = origin+'/admin/?'+new URLSearchParams(callback);
      return route.fulfill({ contentType: 'text/html', body: '<a href="'+target.replaceAll('&','&amp;')+'">Synthetic helper consent</a>' });
    }
    if (url.origin !== origin) return route.abort();
    const r = await f.suite.mf.dispatchFetch(req.url(), { method: req.method(), headers: await req.allHeaders(), body: req.postDataBuffer() || undefined });
    const body = Buffer.from(await r.arrayBuffer());
    if (url.pathname.startsWith('/api/')) requests.push({ path: url.pathname, status: r.status, body: body.toString() });
    await route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin+'/admin/#health');
  await page.getByRole('button', { name: 'Connect school Google account', exact: true }).click();
  await page.getByRole('link', { name: 'Synthetic helper consent', exact: true }).click();
  await page.getByText('School Google account connected.', { exact: false }).waitFor();
  assert.equal(new URL(page.url()).search, '', 'authorization code removed from URL');
  assert.equal((await f.status()).state, 'connected');
  await page.getByRole('button', { name: 'Check Google connection', exact: true }).click();
  await page.getByText('Helper access and Shared Drive destination verified.', { exact: false }).waitFor();
  await page.reload();
  await page.getByText('helper@example.invalid: connected.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Disconnect / cancel connection', exact: true }).click();
  await page.getByText('helper@example.invalid: disconnected.', { exact: true }).waitFor();
  const credential = await f.db.prepare('SELECT credential_cipher FROM core_google_connections').first();
  assert.equal(credential.credential_cipher, null);
  for (const response of requests) for (const secret of ['synthetic-helper-refresh','synthetic-helper-access','synthetic-client-secret'])
    assert(!response.body.includes(secret), 'backend secret must not reach browser');
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  assert(!storage.includes('synthetic-code-'));
  assert.deepEqual(errors, []);
  assert.equal(f.controls.exchanges, 1);
  assert(f.requests.every(r => r.method === 'GET' || r.path === '/token'), 'no provider data writes or automatic backup activation');
  console.log('PASS real built Admin browser → consent → Worker/D1 connection, URL removal, reload, check and disconnect; no browser credentials or provider writes');
} finally { await browser.close(); await f.suite.close(); }
