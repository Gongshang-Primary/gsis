// Synthetic acceptance benchmark in real local workerd, D1 and R2. No school
// records, credentials or remote services are used. Run after npm run build.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import zlib from 'node:zlib';
import {build} from 'esbuild';
import {Miniflare, Response as LocalResponse} from 'miniflare';
import {profileWorker} from './worker-profile.mjs';

const require = createRequire(import.meta.url);
const Import = require('../../shared/roster-import.js');
const Operations = require('../../shared/roster-operations.js');
const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const MiB = 1024 * 1024;
const who = {email: 'admin@example.test', subject: 'synthetic-admin'};
const requestId = '0dd7168a-0ec7-4b9e-b94b-5eed5611e81a';
const binding = {actor: who.email, requestId, sessionId: hash(JSON.stringify([who.email, requestId]))};
const state = Operations.initial();
state.audit = Array.from({length: 5000}, (_, i) => ({id: 'audit-' + i, date: '2026-10-29', message: 'entry'.repeat(250)}));
const largePlan = {fixture: 'opaque immutable timetable content', payload: crypto.randomBytes(6 * MiB).toString('base64')};
state.staplerPlans = [{id: 'large-fixture-plan', date: '2026-10-29', draft: largePlan}];
const snapshot = {schema: 1, state, index: {revision: 0, entries: [], receipts: []}};
const sourceBytes = Buffer.byteLength(JSON.stringify(snapshot));
assert.ok(sourceBytes >= 14 * MiB, 'acceptance fixture must be at least 14 MiB before packing');
snapshot.sourceDigest = hash(JSON.stringify(snapshot));
const frozen = Import.freeze(snapshot, binding, {
  hash,
  gzip: value => [...zlib.gzipSync(value)],
  base64: bytes => Buffer.from(bytes).toString('base64'),
  readModel: () => assert.fail('fixture contains no baseline models'),
  readArchive: () => assert.fail('fixture contains no audit archive')
});
const contacts = {
  rosterPeople: [{id: 'admin', name: 'Synthetic Admin', email: who.email, emails: [who.email], active: true, groups: ['Teaching']}],
  rosterSMCIds: ['admin'], rosterAdminIds: ['admin'], rosterUrgentSMCIds: ['admin']
};
let partReads = 0, manifestReads = 0, maximumBridgeBytes = 0;
const bridgeReply = data => {
  const body = JSON.stringify({ok: true, data});
  maximumBridgeBytes = Math.max(maximumBridgeBytes, Buffer.byteLength(body));
  return new LocalResponse(body, {headers: {'Content-Type': 'application/json'}});
};
const script = await build({
  stdin: {
    resolveDir: root, sourcefile: 'roster-import-runtime-entry.mjs',
    contents: `import {edgeRosterMigration} from './roster-update/public/edge-roster.js';
      export default {async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/object') {
          const object = await env.ROSTER_TIMETABLE_SNAPSHOTS.get(url.searchParams.get('key'));
          return object ? new Response(object.body) : new Response('missing', {status:404});
        }
        if (url.pathname === '/counts') {
          const counts = await env.GSIS_JOBS.prepare('SELECT scope,COUNT(*) records FROM gsis_edge_records GROUP BY scope').all();
          return Response.json(counts.results);
        }
        try { return Response.json(await edgeRosterMigration(env, await request.json(), ${JSON.stringify(who)})); }
        catch (error) { return Response.json({error:error.message,code:error.code}, {status:error.status || 500}); }
      }};`
  },
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022'
});
const bundled = script.outputFiles[0].text;
const name = 'roster-chunked-import-benchmark';
const mf = new Miniflare({
  name, modules: true, script: bundled, compatibilityDate: '2026-07-01', inspectorPort: 0,
  d1Databases: {GSIS_JOBS: 'synthetic-import'}, r2Buckets: ['ROSTER_TIMETABLE_SNAPSHOTS'],
  bindings: {
    ROSTER_EDGE_AUTHORITY: 'legacy', APPS_SCRIPT_URL: 'https://script.google.com/macros/s/fixture/exec',
    ROSTER_PUBLIC_ORIGIN: 'https://roster.example.test', GSIS_SECRET: 'b'.repeat(32),
    ROSTER_SERVICE_SECRET: 's'.repeat(32), CALENDAR_PROXY_SECRET: 'c'.repeat(32),
    CALENDAR_APPS_SCRIPT_URL: 'https://script.google.com/macros/s/calendar-fixture/exec', WHATSAPP_ENABLED: 'false'
  },
  async outboundService(request) {
    const envelope = await request.json();
    if (envelope.action === 'rosterDates') return LocalResponse.json({ok: true, result: {dates: envelope.payload.dates.map(date => ({date, schoolDay: true, parity: 'odd'}))}});
    if (envelope.action === 'rosterStatisticsCalendar') return LocalResponse.json({ok: true, result: {terms: [], semesters: []}});
    const command = JSON.parse(envelope.payload);
    const input = command.input;
    if (input.operation === 'edgeReferences') return bridgeReply({adminVerified: true, contacts, contactsSource: 'synthetic-contacts'});
    assert.equal(command.identity.email, who.email);
    assert.equal(input.requestId, requestId);
    assert.equal(input.sessionId, binding.sessionId);
    if (input.operation === 'edgeExportManifest') {
      manifestReads++;
      return bridgeReply({adminVerified: true, ...binding, sourceDigest: snapshot.sourceDigest, manifest: frozen.manifest, manifestDigest: frozen.manifestDigest});
    }
    assert.equal(input.operation, 'edgeExportPart', 'the Worker must never request a monolithic export, model, audit or authority fence');
    const index = frozen.manifest.parts.findIndex(part => part.id === input.partId);
    assert.ok(index >= 0);
    partReads++;
    return bridgeReply({adminVerified: true, sessionId: binding.sessionId, manifestDigest: frozen.manifestDigest, partId: input.partId, payload: frozen.parts[index]});
  }
});
let profiler;
try {
  profiler = await profileWorker(mf, name);
  const send = async (label, input) => profiler.measure(label, async () => {
    const response = await mf.dispatchFetch('http://localhost/migrate', {method: 'POST', body: JSON.stringify(input)});
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  });
  let progress, previous = 0, steps = 0;
  do {
    assert.ok(steps <= frozen.manifest.parts.length + 4, 'import must make bounded forward progress');
    progress = await send('import-' + steps++, {operation: 'import', requestId, sessionId: binding.sessionId});
    assert.ok(progress.completedParts >= previous);
    previous = progress.completedParts;
  } while (!progress.imported);
  assert.equal(progress.completedParts, frozen.manifest.parts.length);
  assert.equal(manifestReads, 1, 'continuation must retain the same captured manifest');
  assert.equal(partReads, frozen.manifest.parts.length);
  const status = await send('status', {operation: 'status'});
  for (const scope of ['roster', 'roster-register']) {
    const head = status.scopes.find(row => row.scope === scope);
    assert.equal(head.mode, 'imported');
    assert.equal(head.metadata.source.sourceDigest, snapshot.sourceDigest);
    assert.equal(head.sourceDigest, frozen.manifest.scopes[scope].digest);
    assert.equal(head.importedRecords, frozen.manifest.scopes[scope].records);
  }
  const counts = await (await mf.dispatchFetch('http://localhost/counts')).json();
  for (const scope of ['roster', 'roster-register']) assert.equal(counts.find(row => row.scope === scope).records, frozen.manifest.scopes[scope].records);
  const replay = await send('completed-replay', {operation: 'import', requestId, sessionId: binding.sessionId});
  assert.equal(replay.imported, true);
  assert.equal(partReads, frozen.manifest.parts.length, 'completed replay cannot retrieve another part');
  const evidence = await send('bounded-evidence', {operation: 'export', importRequestId: requestId});
  assert.ok(Buffer.byteLength(JSON.stringify(evidence)) < MiB, 'operator evidence must remain bounded');
  const objectIndex = frozen.manifest.parts.findIndex(part => part.kind === 'object');
  const object = JSON.parse(frozen.parts[objectIndex]);
  const compressed = Buffer.from(await (await mf.dispatchFetch('http://localhost/object?key=' + encodeURIComponent(object.reference.key))).arrayBuffer());
  assert.equal(hash(zlib.gunzipSync(compressed)), object.reference.digest, 'large R2 object must match frozen bytes');
  const restart = await send('bounded-restart', {operation: 'restart', importRequestId: requestId, requestId: crypto.randomUUID()});
  assert.equal(restart.restarted, true);
  const reset = await send('reset-status', {operation: 'status'});
  assert.ok(reset.scopes.filter(row => ['roster', 'roster-register'].includes(row.scope)).every(row => row.mode === 'legacy'));
  const measurements = profiler.measurements;
  const maximumSampledCpuMs = Math.max(...measurements.map(row => row.sampledActiveMs));
  const maximumWallMs = Math.max(...measurements.map(row => row.wallMs));
  assert.ok(profiler.peakBytes < 96 * MiB, 'sampled isolate memory must leave headroom within 128 MiB');
  assert.ok(maximumSampledCpuMs < 30000 && maximumWallMs < 30000, 'every local step must fit the default paid Worker CPU budget');
  assert.ok(maximumBridgeBytes < 2 * MiB, 'no Google response may contain the whole export');
  const report = {
    runtime: 'local workerd via miniflare ' + require('miniflare/package.json').version,
    sourceBytes, frozenBytes: frozen.manifest.totalBytes, parts: frozen.parts.length, steps,
    bundleSha256: hash(bundled), maximumBridgeBytes,
    sampledPeakIsolateBytes: profiler.peakBytes, maximumSampledCpuMs, maximumWallMs,
    measurements,
    boundaries: 'Synthetic local measurements, including real D1/R2 bindings. CPU is profiler sampling; memory is sampled V8 + embedder + backing storage, not a production RSS guarantee. The 10ms free-plan CPU limit and live Google timing are not certified. No authority switch or real messages.'
  };
  const output = path.resolve(root, process.env.GSIS_IMPORT_PROFILE_OUTPUT || 'verification/v099/roster-chunked-import-runtime.json');
  await fs.mkdir(path.dirname(output), {recursive: true});
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({...report, measurements: undefined, evidence: path.relative(root, output)}, null, 2));
  console.log('PASS >=14MiB full Worker continuation, streamed multi-MiB object, bounded status/evidence/replay/restart and imported-only heads');
} finally {
  await profiler?.close();
  await mf.dispose();
}
