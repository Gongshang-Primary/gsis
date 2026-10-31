'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const Operations = require('../../shared/roster-operations.js');
const Stapler = require('../../shared/roster-stapler.js');
const Import = require('../../shared/roster-import.js');
const Store = require('../../shared/edge-store.js');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const root = path.resolve(__dirname, '../..');
let packedFixture;

function makeFixture(scope) {
  if (packedFixture) return clone(packedFixture);
  const state = Operations.initial();
  const periods = Array.from({length: 17}, (_, period) => ({period, startMinutes: 420 + period * 30, endMinutes: 450 + period * 30}));
  const teachers = Array.from({length: 150}, (_, i) => ({staffId: 'staff-' + i, name: 'Teacher ' + i + ' 李',
    timetableName: 'Teacher ' + i + ' 李', cells: periods.map((_, period) => ['English', '4' + String(i % 8), 'Room ' + (period % 4), ''])}));
  const rows = Array.from({length: 19}, (_, i) => {
    const date = '2026-10-' + String(i + 1).padStart(2, '0');
    const plan = Stapler.create({date, id: 'baseline', verified: true, schoolDay: true, parity: 'even', periods, teachers, formClasses: [], recesses: []});
    return {id: 'plan-' + i, date, baselineId: 'baseline', revision: 1, publishedRevision: 1, confirmedRevision: 1,
      draft: plan, published: plan, confirmedPlan: plan};
  });
  state.staplerPlans = rows.slice(0, 10);
  state.staplerArchives = rows.slice(10);
  state.optimisationRuns = Array.from({length: 10}, (_, i) => ({id: 'run-' + i, date: rows[i].date,
    decisionEvidence: {version: 1, teachers: teachers.map(person => ({staffId: person.staffId, remaining: 3,
      teachingProfile: {subjects: ['EL', 'MA'], levels: [1, 2, 3]}})),
    lessons: Array.from({length: 90}, (_, n) => ({demandId: 'lesson-' + n, period: n % 12, className: '1A',
      selectedStaffId: teachers[n].staffId, disposition: 'selected'})), periods: []}}));
  const packed = scope.rosterAllocationAuditPack_(scope.rosterOperationsPackPlans_(state, false));
  packedFixture = clone(packed);
  return clone(packedFixture);
}

module.exports = function harness({uploadFailure = false, killPhase = null} = {}) {
  const properties = new Map(), files = new Map(), writes = [];
  let clock = Date.parse('2026-10-31T08:00:00Z'), locks = 0, decodes = 0, captures = 0, serial = 0, elapsed = 0, killed = false;
  const termination = Object.assign(Error('Simulated process termination'), {simulatedTermination: true});
  const cost = bytes => { const ms = Math.ceil(bytes / 1048576 * 300); clock += ms; elapsed += ms; };
  const blob = value => { const bytes = Buffer.from(value); return {getBytes: () => new Uint8Array(bytes), getDataAsString: () => bytes.toString('utf8')}; };
  const Clock = class extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
  const scope = {console, Date: Clock, GSISRosterOperations: Operations, GSISRosterStapler: Stapler,
    GSiSRosterImport: Import, GSiSEdgeStore: Store, ROSTER_DATA: 'private',
    error_: (status, message) => { throw Object.assign(Error(message), {status}); },
    Utilities: {newBlob: blob, DigestAlgorithm: {SHA_256: 'sha256'},
      computeDigest: (_, value) => { const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value); cost(bytes.length); return [...crypto.createHash('sha256').update(bytes).digest()]; },
      gzip: value => { const bytes = Buffer.from(value.getBytes()); cost(bytes.length); return blob(zlib.gzipSync(bytes)); },
      ungzip: value => { decodes++; const bytes = zlib.gunzipSync(Buffer.from(value.getBytes())); cost(bytes.length); return blob(bytes); },
      base64Encode: value => Buffer.from(value).toString('base64'), base64Decode: value => new Uint8Array(Buffer.from(value, 'base64'))},
    props_: () => ({getProperty: key => properties.get(key) || null, getProperties: () => Object.fromEntries(properties),
      setProperty: (key, value) => {
        if (killed) throw termination;
        assert(Buffer.byteLength(value) < 9000); properties.set(key, value);
        if (killPhase && key.startsWith('ROSTER_EDGE_EXPORT:') && JSON.parse(value).lastPhase === killPhase) {
          killed = true; throw termination;
        }
      },
      setProperties: values => { for (const [key, value] of Object.entries(values)) properties.set(key, value); },
      deleteProperty: key => properties.delete(key)}),
    LockService: {getScriptLock: () => ({}), getUserLock: () => ({})},
    deployLock_: () => { locks++; return true; }, deployUnlock_: () => { assert(locks > 0); locks--; },
    rosterOperationsDigest_: value => { const raw = JSON.stringify(value); cost(Buffer.byteLength(raw)); return hash(raw); },
    rosterIndex_: () => ({schema: 1, revision: 1, entries: [], receipts: []}),
    rosterFolder_: () => ({}),
    rosterFindFile_: (_folder, name) => name === 'Roster import files' ? 'import-folder' : null,
    rosterReadFile_: id => {
      const file = files.get(id); assert(file, 'missing file ' + id);
      if (id === 'operations') { assert.equal(locks, 2); captures++; } else assert.equal(locks, 0, 'batch reads must release both production locks');
      clock += 5000; elapsed += 5000; cost(file.bytes.length); return file.bytes.toString('utf8');
    },
    rosterCreateFile_: (folder, name, content) => {
      const bytes = Buffer.from(content.getBytes());
      writes.push({name, locks, bytes: bytes.length});
      assert.equal(folder, 'import-folder', 'new imports use the dedicated private child folder');
      if (uploadFailure && name.endsWith('source.json')) throw Object.assign(Error('Drive upload unavailable'), {status: 503});
      assert.equal(locks, 0, 'all frozen source and part uploads must release both production locks');
      clock += 5000; elapsed += 5000; cost(bytes.length);
      const id = 'file-' + (++serial); files.set(id, {name, bytes, parents: [folder]}); return id;
    },
    rosterDriveJson_: response => JSON.parse(response.getContentText()),
    rosterDriveRequest_: (url, options = {}) => {
      assert.equal(locks, 0, 'private export metadata and reads must release both production locks');
      const parsed = new URL(url); let bytes, status = 200, headers = {};
      if (parsed.pathname.endsWith('/files')) {
        const name = /name = '([^']+)'/.exec(parsed.searchParams.get('q') || '')?.[1];
        bytes = Buffer.from(JSON.stringify({files: [...files].filter(([, file]) => !name || file.name === name)
          .map(([id, file]) => ({id, name: file.name, size: String(file.bytes.length)}))}));
      } else {
        const id = decodeURIComponent(parsed.pathname.split('/').at(-1)), file = files.get(id); assert(file, 'missing ' + id);
        if (parsed.searchParams.get('alt') === 'media') {
          const range = /bytes=(\d+)-(\d+)/.exec(options.headers?.Range || '');
          if (range) { const start = +range[1], end = +range[2]; bytes = file.bytes.subarray(start, end + 1); status = 206; headers = {'Content-Range': `bytes ${start}-${end}/${file.bytes.length}`}; }
          else bytes = file.bytes;
        } else bytes = Buffer.from(JSON.stringify({id, size: String(file.bytes.length), parents: file.parents || ['private'], trashed: false}));
      }
      clock += 5000; elapsed += 5000; cost(bytes.length);
      return {getResponseCode: () => status, getAllHeaders: () => headers, getContent: () => new Uint8Array(bytes), getContentText: () => bytes.toString('utf8')};
    }};
  vm.createContext(scope);
  for (const file of ['backend/RosterOperations.gs', 'backend/RosterAuditExport.gs', 'backend/RosterEdgeMigration.gs']) {
    const source = file === 'backend/RosterEdgeMigration.gs' && process.env.GSIS_TEST_CAPTURE_SOURCE
      ? process.env.GSIS_TEST_CAPTURE_SOURCE : path.join(root, file);
    vm.runInContext(fs.readFileSync(source, 'utf8'), scope);
  }
  const packed = makeFixture(scope), packedRaw = JSON.stringify(packed);
  files.set('operations', {name: 'Roster operations.json', bytes: Buffer.from(packedRaw)});
  properties.set('ROSTER_OPERATIONS_FILE', 'operations');
  elapsed = 0;
  const input = {operation: 'edgeExportManifest', requestId: 'packed-production', preparation: {ordinal: 0, checkpoint: null}};
  const calls = [];
  const call = next => { elapsed = 0; const before = decodes; try {
    return scope.rosterEdgeMigrationDispatch_({input: next, identity: {email: 'admin@example.test'}}, {user: {rosterAdmin: true}}).result;
  } finally { assert.equal(locks, 0); calls.push({ordinal: next.preparation?.ordinal, elapsed, decodes: decodes - before}); } };
  return {scope, files, properties, writes, calls, input, call, packed, packedBytes: Buffer.byteLength(packedRaw),
    stats: () => ({locks, decodes, captures}), advance: () => { clock += 420001; killed = false; killPhase = null; }};
};
