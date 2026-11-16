import assert from 'node:assert/strict';
import { productSuite, origin } from './suite.mjs';
import { HELPER_SCOPES } from '../../v1/runtime/google-drive-credential.mjs';
export const helperBindings = {
  PUBLIC_ORIGIN: origin, HOSTED_DOMAIN: 'example.invalid', GOOGLE_HELPER_ENABLED: 'true',
  GOOGLE_HELPER_CLIENT_ID: 'synthetic-helper.apps.googleusercontent.com', GOOGLE_HELPER_EMAIL: 'helper@example.invalid',
  GOOGLE_HELPER_ROOT_ID: 'synthetic-root', GOOGLE_HELPER_DRIVE_ID: 'synthetic-shared-drive',
  GOOGLE_HELPER_CLIENT_SECRET: 'synthetic-client-secret', GOOGLE_HELPER_WRAP_KEY: Buffer.alloc(32, 42).toString('base64url'),
  GOOGLE_STAFF_CALENDAR_ID: 'synthetic-calendar', GOOGLE_ACCESS_TOKEN: 'synthetic-legacy-must-not-be-used',
};
export async function googleFixture(options = {}) {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign','verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'synthetic-helper-key', alg: 'RS256', use: 'sig' };
  const codes = new Map(), requests = [], controls = { refreshStatus: 200, rootWritable: true, exchanges: 0, refreshes: 0 };
  let serial = 0;
  function consent(url, overrides = {}) {
    const u = new URL(url), code = 'synthetic-code-' + ++serial;
    assert.equal(u.origin, 'https://accounts.google.com');
    assert.equal(u.searchParams.get('access_type'), 'offline');
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
    codes.set(code, { nonce: u.searchParams.get('nonce'), challenge: u.searchParams.get('code_challenge'), ...overrides });
    return { state: u.searchParams.get('state'), code };
  }
  async function jwt(fields) {
    const now = Math.floor(Date.now()/1000), payload = { iss: 'https://accounts.google.com', aud: helperBindings.GOOGLE_HELPER_CLIENT_ID,
      sub: '123450000000000000001', email: helperBindings.GOOGLE_HELPER_EMAIL, email_verified: true, hd: 'example.invalid', iat: now, exp: now+3600, ...fields };
    const part = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const data = part({ alg: 'RS256', kid: jwk.kid })+'.'+part(payload);
    return data+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, Buffer.from(data))).toString('base64url');
  }
  const providerFetch = async request => {
    const url = new URL(request.url), method = request.method;
    requests.push({ host: url.host, path: url.pathname, method });
    if (url.href === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
    if (url.href === 'https://oauth2.googleapis.com/token') {
      const fields = new URLSearchParams(await request.text());
      assert.equal(fields.get('client_id'), helperBindings.GOOGLE_HELPER_CLIENT_ID);
      assert.equal(fields.get('client_secret'), helperBindings.GOOGLE_HELPER_CLIENT_SECRET);
      if (fields.get('grant_type') === 'authorization_code') {
        controls.exchanges++;
        const entry = codes.get(fields.get('code'));
        if (!entry || entry.consumed) return Response.json({ error: 'invalid_grant' }, { status: 400 });
        entry.consumed = true;
        assert.equal(Buffer.from(await crypto.subtle.digest('SHA-256', Buffer.from(fields.get('code_verifier')))).toString('base64url'), entry.challenge);
        assert.equal(fields.get('redirect_uri'), origin+'/admin/');
        if (controls.onExchange) await controls.onExchange();
        return Response.json({ access_token: 'synthetic-helper-access', token_type: 'Bearer', expires_in: 3600,
          refresh_token: 'synthetic-helper-refresh', scope: ['openid','email',...HELPER_SCOPES].join(' '),
          id_token: await jwt({ nonce: entry.nonce, ...entry.claims }), ...entry.token });
      }
      assert.equal(fields.get('grant_type'), 'refresh_token');
      assert.equal(fields.get('refresh_token'), controls.rotated ? 'synthetic-helper-rotated' : 'synthetic-helper-refresh');
      controls.refreshes++;
      if (controls.refreshStatus !== 200) return Response.json({ error: 'invalid_grant' }, { status: controls.refreshStatus });
      return Response.json({ access_token: 'synthetic-helper-access', token_type: 'Bearer', expires_in: 3600,
        ...(controls.rotate ? { refresh_token: 'synthetic-helper-rotated' } : {}) });
    }
    if (url.host === 'www.googleapis.com' && url.pathname === '/drive/v3/files/synthetic-root') {
      assert.equal(request.headers.get('authorization'), 'Bearer synthetic-helper-access');
      assert.equal(method, 'GET');
      return Response.json({ id: helperBindings.GOOGLE_HELPER_ROOT_ID, driveId: controls.wrongDrive ? 'foreign-drive' : helperBindings.GOOGLE_HELPER_DRIVE_ID,
        mimeType: 'application/vnd.google-apps.folder', trashed: false, capabilities: { canAddChildren: controls.rootWritable } });
    }
    if (url.host === 'www.googleapis.com' && url.pathname.startsWith('/calendar/v3/')) {
      assert.equal(request.headers.get('authorization'), 'Bearer synthetic-helper-access');
      if (method !== 'GET') {
        assert(controls.allowWrites, 'provider writes require an explicit synthetic test action');
        assert.equal(method, 'PUT');
        return Response.json({ id: url.pathname.split('/').at(-1), etag: 'synthetic-event-etag' });
      }
      return Response.json({ items: [] });
    }
    if (url.host === 'www.googleapis.com' && url.pathname === '/drive/v3/files/generateIds') {
      assert(controls.allowWrites);
      assert.equal(request.headers.get('authorization'), 'Bearer synthetic-helper-access');
      return Response.json({ ids: ['synthetic-file-id'] });
    }
    if (url.host === 'www.googleapis.com' && url.pathname === '/upload/drive/v3/files') {
      assert(controls.allowWrites);
      assert.equal(request.headers.get('authorization'), 'Bearer synthetic-helper-access');
      assert.equal(url.searchParams.get('supportsAllDrives'), 'true');
      assert.equal(method, 'POST');
      return Response.json({ id: 'synthetic-file-id' });
    }
    throw Error('Unexpected synthetic provider route: '+method+' '+url.origin+url.pathname);
  };
  const suite = await productSuite({ ...options, bindings: { ...helperBindings, ...options.bindings }, providerFetch: async request => { try { return await providerFetch(request); } catch (error) { controls.providerError = String(error); throw error; } } });
  const admin = await suite.seedAccount('synthetic-google-admin');
  const db = await suite.db('core');
  const post = (path, body, user = admin) => suite.request(user, 'core', '/admin/google-connection/'+path,
    { method: 'POST', body: { operationId: crypto.randomUUID(), ...body } });
  const status = async () => (await suite.request(admin, 'core', '/admin/google-connection')).body.data;
  const start = async () => {
    const r = await post('start', { revision: (await status()).revision });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.data;
  };
  return { suite, admin, db, post, status, start, consent, requests, controls, providerFetch, bindings: helperBindings };
}
