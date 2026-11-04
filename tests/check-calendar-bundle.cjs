'use strict';
// check-calendar-bundle.cjs: tests for scripts/check-calendar-bundle.mjs.
//
// Synthetic fixtures are built in a temporary folder, so this test
// needs no network, no Google and no Cloudflare. It proves:
//   - a matched fixture prints MATCH and exits 0;
//   - a fixture with one piece from an older build prints MISMATCH,
//     names the differing piece, and exits 1;
//   - a backend missing a Worker protocol marker is a MISMATCH;
//   - a missing piece is a MISMATCH, not a pass;
//   - the script does not edit the fixture files it reads.
// In addition, a real-files case builds a frontend zip from the repo's
// actual Calendar frontend, backend and job Worker, with only the
// frontend release label changed from 0.9.9i to 0.9.9f. That is exactly
// the mixed case that product version alone cannot catch: the real
// v0.9.9f frontend (deploy/2026-11-01-v0.9.9f, optional-label-only
// Calendar_Frontend.zip) has FRONTEND_VERSION 0.9.9, the same protocol
// markers and the same Pages worker version as the v0.9.9i frontend,
// but its release label is v0.9.9f. The f deploy bundle is not in the
// main checkout, so the CI test uses the label-swapped real files;
// local verification outside this test used the actual f zip and gave
// the same MISMATCH.

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-calendar-bundle.mjs');
const SERVICES = [
  'gsis-calendar-command-v1',
  'calendar-mutation-job-v1',
  'gsis-calendar-sync-worker-v1',
  'calendarSyncContinue',
  'calendarChangesAuthorize',
];

function backendText(version, services = SERVICES) {
  return [
    '// GSiS Calendar backend fixture',
    `const CALV2 = { RELEASE_VERSION: '${version}' };`,
    ...services.map((s) => `// protocol marker ${s}`),
    '// frontend bootstrap markers: actor years selectedYear events dayNotes yearStructure',
    'const bootstrap = { version: CALV2.RELEASE_VERSION, actor: {}, years: [], selectedYear: 2026, events: [], dayNotes: [], yearStructure: [] };',
    '',
  ].join('\n');
}

function workerText(version) {
  return [
    `// GSiS Calendar Job Worker release ${version}; queue protocol unchanged.`,
    'const body = { purpose: "calendar-mutation-job-v1", service: "gsis-calendar-command-v1", action: "calendarCommand" };',
    'const sync = { service: "gsis-calendar-sync-worker-v1", action: "calendarSyncContinue" };',
    'const changes = "calendarChangesAuthorize";',
    'const ACTIONS = new Set(["saveEvent", "deleteEvent", "saveParentSide", "relocateEvent"]);',
    '',
  ].join('\n');
}

function frontendAppText(version) {
  return [
    `const FRONTEND_VERSION = '${version}';`,
    'if (version !== FRONTEND_VERSION) throw new Error(`Frontend/backend version mismatch: ${FRONTEND_VERSION} / ${payload.version}.`);',
    '',
  ].join('\n');
}

// Minimal ZIP writer: stored entries only, so the test needs no zip library.
function zipBuffer(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0, 8);
    c.writeUInt16LE(0, 10);
    c.writeUInt16LE(0, 12);
    c.writeUInt32LE(0, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt16LE(0, 30);
    c.writeUInt16LE(0, 32);
    c.writeUInt16LE(0, 34);
    c.writeUInt16LE(0, 36);
    c.writeUInt32LE(0, 38);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralStart = offset;
  const centralBuf = Buffer.concat(central);
  offset += centralBuf.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, eocd]);
}

function writeBundle(dir, { backendVersion = '0.9.9', frontendVersion = '0.9.9', workerVersion = '0.9.9', backendServices = SERVICES, omit = null, label = '0.9.9i' } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  if (label !== null) fs.writeFileSync(path.join(dir, 'LABEL.txt'), label + '\n');
  if (omit !== 'backend') fs.writeFileSync(path.join(dir, 'Calendar_Backend_v0.9.9.gs'), backendText(backendVersion, backendServices));
  if (omit !== 'frontend') {
    const zip = zipBuffer([
      ['app.js', Buffer.from(frontendAppText(frontendVersion), 'utf8')],
      ['index.html', Buffer.from('<span class="release-label">v0.9.9i</span>', 'utf8')],
      ['_worker.js', Buffer.from(`const WORKER_VERSION = '${frontendVersion}';`, 'utf8')],
    ]);
    fs.writeFileSync(path.join(dir, 'Calendar_Frontend_v0.9.9.zip'), zip);
  }
  if (omit !== 'worker') fs.writeFileSync(path.join(dir, 'dashboard-worker.txt'), workerText(workerVersion));
}

function run(folder) {
  const args = folder === undefined ? [] : [folder];
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 30000 });
}

function snapshot(dir) {
  const out = {};
  for (const name of fs.readdirSync(dir)) {
    out[name] = createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex');
  }
  return out;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-calendar-bundle-'));
try {
  // Matched fixture.
  const matched = path.join(root, 'matched');
  writeBundle(matched);
  const before = snapshot(matched);
  const ok = run(matched);
  assert.strictEqual(ok.status, 0, `matched fixture must exit 0, got ${ok.status}: ${ok.stdout} ${ok.stderr}`);
  assert.match(ok.stdout, /MATCH/);
  assert.match(ok.stdout, /backend: .* version=0\.9\.9/);
  assert.match(ok.stdout, /frontend: .* version=0\.9\.9/);
  assert.match(ok.stdout, /worker: .* version=0\.9\.9/);
  assert.doesNotMatch(ok.stdout, /MISMATCH/);
  assert.deepStrictEqual(snapshot(matched), before, 'script must not edit the files it reads');

  // Mixed fixture: worker from an older build.
  const mixed = path.join(root, 'mixed');
  writeBundle(mixed, { workerVersion: '0.9.8' });
  const bad = run(mixed);
  assert.strictEqual(bad.status, 1, `mixed fixture must exit 1, got ${bad.status}: ${bad.stdout}`);
  assert.match(bad.stdout, /MISMATCH/);
  assert.match(bad.stdout, /job worker 0\.9\.8/);

  // Backend missing a Worker protocol marker.
  const noProtocol = path.join(root, 'no-protocol');
  writeBundle(noProtocol, { backendServices: SERVICES.filter((s) => s !== 'calendarChangesAuthorize') });
  const missing = run(noProtocol);
  assert.strictEqual(missing.status, 1);
  assert.match(missing.stdout, /MISMATCH/);
  assert.match(missing.stdout, /missing Worker protocol markers: calendarChangesAuthorize/);

  // Missing piece is a mismatch, not a pass.
  const incomplete = path.join(root, 'incomplete');
  writeBundle(incomplete, { omit: 'frontend' });
  const incompleteRun = run(incomplete);
  assert.strictEqual(incompleteRun.status, 1);
  assert.match(incompleteRun.stdout, /MISMATCH/);
  assert.match(incompleteRun.stdout, /frontend: no \.zip file found/);

  // Usage error.
  const usage = run(undefined);
  assert.strictEqual(usage.status, 2, `no argument must exit 2, got ${usage.status}`);
  assert.match(usage.stderr, /Usage:/);


  // Real-files mixed case: v0.9.9i backend and job Worker with a
  // v0.9.9f frontend. Product version is 0.9.9 in all three, so only
  // the build label can catch this.
  const repoRoot = path.join(__dirname, '..');
  const realBackend = path.join(repoRoot, 'calendar-backend', 'Code.gs');
  const realWorker = path.join(repoRoot, 'calendar-job-worker', 'dashboard-worker.txt');
  const realPublic = path.join(repoRoot, 'calendar-update', 'public');
  assert.ok(fs.existsSync(realBackend), 'real Calendar backend must exist in the repo checkout');
  assert.ok(fs.existsSync(realWorker), 'real Calendar job Worker must exist in the repo checkout');
  assert.ok(fs.existsSync(path.join(realPublic, 'index.html')), 'real Calendar frontend must exist in the repo checkout');
  const realIndex = fs.readFileSync(path.join(realPublic, 'index.html'), 'utf8');
  const CURRENT_LABEL = require('../package.json').gsisBuildLabel;
  assert.ok(realIndex.includes(CURRENT_LABEL), 'real frontend index.html must carry the current build label ' + CURRENT_LABEL + ' at test time');
  function writeRealBundle(dir, frontendLabel) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'LABEL.txt'), CURRENT_LABEL + '\n');
    fs.copyFileSync(realBackend, path.join(dir, 'C1_Calendar_Backend.gs'));
    fs.copyFileSync(realWorker, path.join(dir, 'C2_gsis-calendar-jobs_worker.js'));
    const entries = [];
    for (const name of fs.readdirSync(realPublic).sort()) {
      const full = path.join(realPublic, name);
      if (!fs.statSync(full).isFile()) continue;
      let data = fs.readFileSync(full);
      if (name === 'index.html') data = Buffer.from(data.toString('utf8').replaceAll(CURRENT_LABEL, frontendLabel), 'utf8');
      entries.push([name, data]);
    }
    fs.writeFileSync(path.join(dir, 'C3_Calendar_Frontend.zip'), zipBuffer(entries));
  }
  const realMatched = path.join(root, 'real-matched');
  writeRealBundle(realMatched, CURRENT_LABEL);
  const realOk = run(realMatched);
  assert.strictEqual(realOk.status, 0, `real matched bundle must exit 0, got ${realOk.status}: ${realOk.stdout} ${realOk.stderr}`);
  assert.match(realOk.stdout, /MATCH/);
  const realMixed = path.join(root, 'real-mixed');
  writeRealBundle(realMixed, '0.9.9f');
  const realBad = run(realMixed);
  assert.strictEqual(realBad.status, 1, `real mixed bundle (0.9.9f frontend, 0.9.9i backend/Worker) must exit 1, got ${realBad.status}: ${realBad.stdout}`);
  assert.match(realBad.stdout, /MISMATCH/);
  assert.match(realBad.stdout, /frontend release label 0\.9\.9f/);
  assert.ok(realBad.stdout.includes('bundle LABEL.txt ' + CURRENT_LABEL), realBad.stdout);

  console.log('check-calendar-bundle: matched, mixed, protocol, missing-piece and usage cases pass');

} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
