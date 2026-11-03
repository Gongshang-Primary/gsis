'use strict';
// check-calendar-bundle.cjs: tests for scripts/check-calendar-bundle.mjs.
//
// Fixtures are built in a temporary folder, not from the real deploy
// bundle, so this test needs no network, no Google, no Cloudflare and
// no real Calendar files. It proves:
//   - a matched fixture prints MATCH and exits 0;
//   - a fixture with one piece from an older build prints MISMATCH,
//     names the differing piece, and exits 1;
//   - a backend missing a Worker protocol marker is a MISMATCH;
//   - a missing piece is a MISMATCH, not a pass;
//   - the script does not edit the fixture files it reads.

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
    '',
  ].join('\n');
}

function workerText(version) {
  return [
    `// GSiS Calendar Job Worker release ${version}; queue protocol unchanged.`,
    'const body = { purpose: "calendar-mutation-job-v1", service: "gsis-calendar-command-v1", action: "calendarCommand" };',
    'const sync = { service: "gsis-calendar-sync-worker-v1", action: "calendarSyncContinue" };',
    'const changes = "calendarChangesAuthorize";',
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

function writeBundle(dir, { backendVersion = '0.9.9', frontendVersion = '0.9.9', workerVersion = '0.9.9', backendServices = SERVICES, omit = null } = {}) {
  fs.mkdirSync(dir, { recursive: true });
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

  console.log('check-calendar-bundle: matched, mixed, protocol, missing-piece and usage cases pass');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
