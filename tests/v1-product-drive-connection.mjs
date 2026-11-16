import assert from 'node:assert/strict';
import { startProduct } from '../scripts/v1/dev.mjs';
import { origin } from './v1-product/suite.mjs';
import { join } from 'node:path';
import { rm, readFile, writeFile, readdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createDatabase, migrate } from './v1-product/helpers.mjs';
import { buildProduct } from '../scripts/v1/build.mjs';
import { googleFixture, helperBindings } from './v1-product/drive-connection-fixtures.mjs';
// Apply only the new migration to a database containing all prior Core schema
// and a saved account. This supplements the complete built Worker/D1 tests.
const upgrade = await createDatabase('test');
try {
  const folder = new URL('../v1/migrations/core/', import.meta.url);
  const prior = (await readdir(folder)).filter(n => n.endsWith('.sql') && n !== '0005_drive_connection.sql').sort();
  await migrate(upgrade.db, prior.map(n => new URL(n,folder)));
  await upgrade.db.prepare("INSERT INTO core_accounts(school_id,account_id,issuer,subject,email,suspended,created_at) VALUES('synthetic-school','upgrade-account','https://accounts.google.com','synthetic-upgrade-subject','upgrade@example.invalid',0,1)").run();
  await migrate(upgrade.db,[new URL('0005_drive_connection.sql',folder)]);
  assert.equal((await upgrade.db.prepare("SELECT email FROM core_accounts WHERE account_id='upgrade-account'").first()).email,'upgrade@example.invalid');
  assert.equal((await upgrade.db.prepare('SELECT count(*) AS n FROM core_google_connections').first()).n,0);
} finally { await upgrade.close(); }
const packaging = await mkdtemp(join(tmpdir(),'synthetic-helper-config-'));
try {
  const config = JSON.parse(await readFile(new URL('../v1/config/school.example.json',import.meta.url),'utf8'));
  config.settings = Object.fromEntries(Object.entries(helperBindings).filter(([k]) => k.startsWith('GOOGLE_HELPER_') && !['GOOGLE_HELPER_CLIENT_SECRET','GOOGLE_HELPER_WRAP_KEY'].includes(k)));
  const configPath = join(packaging,'config.json'), output = join(packaging,'product');
  await writeFile(configPath,JSON.stringify(config));
  await buildProduct({ configPath,output });
  const built = JSON.parse(await readFile(join(output,'core/wrangler.json'),'utf8'));
  assert.equal(built.vars.GOOGLE_HELPER_ENABLED,'true');
  assert.equal(built.vars.GOOGLE_HELPER_CLIENT_SECRET,undefined);
  assert.equal(built.vars.GOOGLE_HELPER_WRAP_KEY,undefined);
  config.settings.GOOGLE_HELPER_CLIENT_SECRET = 'synthetic-private-canary';
  await writeFile(configPath,JSON.stringify(config));
  await assert.rejects(buildProduct({configPath,output}),/Unrecognised or secret setting/);
} finally { await rm(packaging,{recursive:true,force:true}); }
const f = await googleFixture({ bindings: { SEND_OWNER: 'v1', SCHEDULER_OWNER: 'v1', GOOGLE_DRIVE_FOLDER_ID: 'synthetic-root' } });
try {
  const { suite, admin, db, post, status, start, consent, controls } = f;
  assert.equal((await status()).state, 'disconnected');
  const staff = await suite.seedAccount('synthetic-google-staff', { capabilities: [] });
  for (const user of [null, staff, { ...admin, csrf: 'wrong' }]) assert([401,403].includes((await post('start', { revision: 0 }, user)).status));
  assert.equal((await post('start', { revision: 0, schoolId: 'foreign' })).status, 403);
  const flow = await start(), proposal = { ...consent(flow.authorizationUrl), operationId: 'synthetic-complete' };
  const result = await post('complete', proposal);
  assert.equal(result.status, 200, JSON.stringify({ body: result.body, requests: f.requests, providerError: controls.providerError }));
  assert.equal(result.body.data.state, 'connected');
  assert.equal((await status()).revision, 1);
  const row = await db.prepare('SELECT * FROM core_google_connections').first();
  assert(row.credential_cipher && !row.credential_cipher.includes('synthetic-helper-refresh'));
  assert(!JSON.stringify(result).includes('synthetic-helper-refresh'));
  const stored = JSON.stringify(await Promise.all(['core_google_connections','core_google_flows','product_operations','product_audit','core_evidence']
    .map(table => db.prepare('SELECT * FROM '+table).all())));
  for (const secret of ['synthetic-helper-refresh','synthetic-helper-access',proposal.code,helperBindings.GOOGLE_HELPER_CLIENT_SECRET,helperBindings.GOOGLE_HELPER_WRAP_KEY])
    assert(!stored.includes(secret),'no plaintext credential/code in durable records');
  assert.equal((await post('complete', proposal)).status, 200);
  assert.equal(controls.exchanges, 1);
  assert.equal((await post('complete', { ...proposal, code: 'changed' })).status, 409);
  assert.equal((await post('check', {})).status, 200);
  const calendar = await suite.request(admin, 'calendar', '/operations', { method: 'POST', body: {
    action: 'calendarWipePreview', payload: { year: 2026, target: 'staff' },
  } });
  assert.equal(calendar.status, 200, JSON.stringify(calendar.body));
  assert(f.requests.some(r => r.path.startsWith('/calendar/v3/')));
  assert.equal((await suite.request(admin, 'core', '/internal/google-helper-access', { method: 'POST', body: {} })).status, 404);
  assert(f.requests.every(r => r.method === 'GET' || r.path === '/token'), 'connection itself writes no provider data');
  // Existing Calendar APIs and its real scheduled Worker use the helper for both
  // Calendar writes and direct Drive exports. Only these synthetic actions send.
  const calDb = await suite.db('calendar'), school = 'synthetic-school';
  const event = { LaneID: 'day', EventID: 'synthetic-event', Year: 2026, Status: 'PUBLISHED', StaffTitle: 'Synthetic event',
    StaffDescription: '', Location: 'Synthetic room', EventType: 'TIMED', StartDate: '2026-11-16', EndDate: '2026-11-16',
    StartTime: '09:00', EndTime: '10:00', ParentEnabled: 'No' };
  await calDb.batch([
    calDb.prepare('INSERT INTO calendar_years VALUES(?,?,?,?,?,?)').bind(school,2026,1,1,'ACTIVE','{}'),
    calDb.prepare("INSERT INTO calendar_metadata VALUES(?,'lanes','day',0,1,?)").bind(school,JSON.stringify({ LaneID:'day',Active:'Yes',SyncToStaffCalendar:'Yes' })),
    calDb.prepare('INSERT INTO calendar_events VALUES(?,?,?,?,?,?,?,?,?)').bind(school,event.EventID,2026,1,'PUBLISHED',event.StartDate,event.EndDate,null,JSON.stringify(event)),
  ]);
  controls.allowWrites = true;
  await suite.call(admin,'calendar','/operations',{ action:'startSyncYear',operationId:'synthetic-google-sync',payload:{year:2026,target:'staff'} });
  await suite.call(admin,'calendar','/operations',{ action:'savePdf',operationId:'synthetic-google-pdf',payload:{name:'Synthetic.pdf',base64:Buffer.from('%PDF-1.7\nSynthetic').toString('base64')} });
  await suite.trigger('calendar');
  assert(f.requests.some(r => r.method === 'PUT' && r.path.startsWith('/calendar/v3/')), JSON.stringify(await calDb.prepare('SELECT type,state,last_code FROM product_outbox').all()));
  assert.equal((await calDb.prepare('SELECT state FROM calendar_exports').first())?.state,'delivered');
  assert.equal((await calDb.prepare('SELECT state FROM calendar_sync').first())?.state,'delivered');
  const writes = f.requests.filter(r => r.method !== 'GET' && r.path !== '/token').length;
  await suite.trigger('calendar');
  assert.equal(f.requests.filter(r => r.method !== 'GET' && r.path !== '/token').length,writes,'settled jobs are not resent');
  controls.allowWrites = false;
  // A different Admin/session or state cannot consume the initiating flow.
  const secondAdmin = await suite.seedAccount('synthetic-second-google-admin');
  const pending = consent((await start()).authorizationUrl);
  assert.equal((await post('complete', pending, secondAdmin)).status, 403);
  assert.equal((await post('complete', { ...pending, state: 'a'.repeat(43) })).status, 403);
  const before = controls.exchanges;
  const concurrent = await Promise.all([post('complete', { ...pending, operationId: 'synthetic-race' }), post('complete', { ...pending, operationId: 'synthetic-race' })]);
  assert(concurrent.some(r => r.status === 200), JSON.stringify(concurrent));
  assert(concurrent.every(r => [200,503].includes(r.status)));
  assert.equal(controls.exchanges, before+1);
  assert.equal((await post('complete', { ...pending, operationId: 'synthetic-race' })).status, 200);
  // Each failed reconnect leaves the previously connected credential intact.
  for (const overrides of [
    { claims: { email: 'other@example.invalid' } }, { claims: { hd: 'other.invalid' } },
    { claims: { aud: 'other.apps.googleusercontent.com' } }, { claims: { sub: '123450000000000000002' } },
    { claims: { nonce: 'wrong-nonce' } }, { claims: { email_verified: false } },
    { token: { scope: 'openid email https://www.googleapis.com/auth/drive' } }, { token: { refresh_token: '' } },
  ]) {
    const previous = await db.prepare('SELECT revision,credential_cipher FROM core_google_connections').first();
    const input = consent((await start()).authorizationUrl, overrides);
    assert([401,403,409].includes((await post('complete', input)).status));
    assert.deepEqual(await db.prepare('SELECT revision,credential_cipher FROM core_google_connections').first(), previous);
  }
  controls.wrongDrive = true;
  assert.equal((await post('complete', consent((await start()).authorizationUrl))).status, 409);
  controls.wrongDrive = false;
  const abandoned = consent((await start()).authorizationUrl), beforeAbandoned = controls.exchanges;
  await db.prepare("UPDATE core_google_flows SET status='exchanging'").run();
  assert.equal((await post('complete', abandoned)).status,503);
  assert.equal(controls.exchanges,beforeAbandoned,'an unknown exchange is never blindly repeated');
  await db.prepare('UPDATE core_google_flows SET expires_at=0').run();
  const expired = consent((await start()).authorizationUrl);
  await db.prepare('UPDATE core_google_flows SET expires_at=0').run();
  assert.equal((await post('complete', expired)).status, 403);
  const late = consent((await start()).authorizationUrl);
  controls.onExchange = async () => { await db.prepare('UPDATE core_google_flows SET expires_at=0').run(); };
  assert.equal((await post('complete', late)).status,409,'consent expiring during the exchange cannot commit');
  controls.onExchange = null;
  const changing = consent((await start()).authorizationUrl);
  controls.onExchange = async () => { await db.prepare("UPDATE core_grants SET valid_until=? WHERE account_id=? AND capability='admin'").bind(Date.now()-1000, admin.id).run(); };
  const denied = await post('complete', changing);
  assert([403,409].includes(denied.status), JSON.stringify(denied.body));
  assert.equal((await db.prepare('SELECT revision FROM core_google_connections').first()).revision, 2);
  controls.onExchange = null;
  await db.prepare("UPDATE core_grants SET valid_until=NULL WHERE account_id=?").bind(admin.id).run();
  controls.refreshStatus = 503;
  assert.equal((await post('check', {})).status, 503);
  assert.equal((await status()).state, 'connected', 'transient outage does not erase connection');
  controls.refreshStatus = 400;
  assert.equal((await post('check', {})).status, 409);
  assert.equal((await status()).state, 'reconnect-required');
  controls.refreshStatus = 200;
  assert.equal((await post('complete', consent((await start()).authorizationUrl))).status, 200);
  const beforeRotation = (await db.prepare('SELECT credential_cipher FROM core_google_connections').first()).credential_cipher;
  controls.rotate = true;
  assert.equal((await post('check', {})).status,200);
  controls.rotate = false; controls.rotated = true;
  assert.notEqual((await db.prepare('SELECT credential_cipher FROM core_google_connections').first()).credential_cipher,beforeRotation);
  assert.equal((await post('check', {})).status,200,'rotated refresh credential is durable');
  const revision = (await status()).revision;
  const disconnect = { revision, operationId: 'synthetic-disconnect' };
  assert.equal((await post('disconnect', disconnect)).status, 200);
  assert.equal((await post('disconnect', disconnect)).status, 200);
  assert.equal((await post('disconnect', { revision, operationId: 'stale-disconnect' })).status, 409);
  assert.equal((await db.prepare('SELECT credential_cipher FROM core_google_connections').first()).credential_cipher, null);
  // Restart every built Worker with the same D1 files. No browser stays signed in
  // for token renewal; the server's encrypted refresh credential survives restart.
  const recovered = { ...consent((await start()).authorizationUrl), operationId: 'synthetic-restart-connect' };
  assert.equal((await post('complete', recovered)).status, 200);
  controls.rotated = false;
  await suite.mf.dispose();
  suite.close = async () => rm(suite.path, { recursive:true, force:true });
  const restarted = await startProduct({ persistPath: join(suite.path,'state'), output: join(suite.path,'product'), migrateSchemas:false,
    bindings: { ...f.bindings, GSIS_SECRET:suite.secret }, providerFetch:f.providerFetch });
  try {
    const request = async (path, body) => {
      const r = await restarted.mf.dispatchFetch(origin+'/api/core/admin/google-connection/'+path,{ method:'POST',
        headers:{ origin, cookie:'__Host-gsis_session='+admin.token,'x-csrf-token':admin.csrf,'content-type':'application/json'},body:JSON.stringify(body) });
      return { status:r.status, body:await r.json() };
    };
    const beforeReplay = controls.exchanges;
    assert.equal((await request('complete',recovered)).status,200);
    assert.equal(controls.exchanges,beforeReplay,'lost success is recovered without repeating code exchange');
    assert.equal((await request('check',{operationId:'synthetic-restarted-check'})).status,200);
    const restartedCoreDb = await restarted.db('core');
    await restartedCoreDb.prepare('UPDATE core_sessions SET revoked=1').run();
    const core = await restarted.mf.getWorker('gsis-core');
    const broker = async input => core.fetch('https://gsis.internal/internal/google-helper-access',{
      method:'POST',headers:{'content-type':'application/json','x-gsis-secret':suite.secret},body:JSON.stringify(input) });
    const token = await broker({ schoolId:school,service:'calendar',scopes:['https://www.googleapis.com/auth/calendar.events'] });
    assert.equal(token.status,200);
    assert.equal((await token.json()).data.accessToken,'synthetic-helper-access','offline refresh needs no active staff session');
    assert.equal((await broker({ schoolId:'other-school',service:'calendar',scopes:['https://www.googleapis.com/auth/calendar.events'] })).status,403);
    assert.equal((await broker({ schoolId:school,service:'roster',scopes:['https://www.googleapis.com/auth/calendar.events'] })).status,403);
    await restartedCoreDb.prepare("UPDATE core_google_connections SET credential_cipher='tampered'").run();
    assert.equal((await broker({ schoolId:school,service:'calendar',scopes:['https://www.googleapis.com/auth/calendar.events'] })).status,503,'encrypted credential tampering fails closed');
    const other = await restarted.db('contacts');
    assert.equal(await other.prepare("SELECT name FROM sqlite_master WHERE name='core_google_connections'").first(),null,'only Core retains credentials');
  } finally { await restarted.close(); }
  console.log('PASS built Workers/D1 consent, encrypted storage, exact replay/concurrency, wrong account/session/state/nonce/scope/root, expiry, current Admin guard, revoked refresh, outages, Calendar reads/writes, Drive export, broker, disconnect and offline restart');
} finally { await f.suite.close(); }
