'use strict';

// Slow Drive is simulated by a deterministic clock. These are scheduling
// assumptions, not a measurement of Apps Script or the school's Drive account.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const Import = require('../shared/roster-import.js');
const Store = require('../shared/edge-store.js');
const Operations = require('../shared/roster-operations.js');
const Roster = require('../shared/roster.js');
const TARGET_CHARS = 16080000;
const ARCHIVE_COUNT = 16;
const MIB = 1024 * 1024;
const BUDGET_MS = 120000;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const state = Operations.initial();
  state.audit = Array.from({length: 16000}, (_, i) => ({
    id: 'audit-' + i, at: '2026-10-29T01:00:00.000Z',
    message: ('record ' + i + ' ').padEnd(900, 'x')
  }));
  state.allocationAuditExports = Object.fromEntries(Array.from({length: ARCHIVE_COUNT}, (_, i) => {
    const date = '2026-10-' + String(10 + i).padStart(2, '0');
    return [date, {archiveFileId: 'archive-' + i}];
  }));
  let gap = TARGET_CHARS - JSON.stringify(state).length;
  assert(gap > 0);
  const each = Math.floor(gap / state.audit.length);
  for (const row of state.audit) row.message += 'p'.repeat(each);
  state.audit.at(-1).message += 'p'.repeat(TARGET_CHARS - JSON.stringify(state).length);
  assert.equal(JSON.stringify(state).length, TARGET_CHARS);
  const files = new Map();
  const entries = Array.from({length: 12}, (_, i) => {
    const id = 'baseline-' + i;
    const model = {
      layoutMode: 'single-week',
      single: {days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], perDay: 17, maxPeriod: 16,
        blocks: Array.from({length: 100}, (_, n) => ({name: 'Teacher ' + n,
          cells: Array.from({length: 85}, (_, p) => p % 4 ? ['', '', '', ''] : ['EL', '3A', 'Room ' + i, ''])}))},
      timing: {startMinutes: 420, periodMinutes: 30, normalLastPeriod: 12}, recesses: []
    };
    files.set(id, {name: id + '.json', bytes: Buffer.from(JSON.stringify(model))});
    return {id, name: id, from: '2026-01-01', to: '2026-12-31', priority: i, modelFile: id};
  });
  for (const [date, meta] of Object.entries(state.allocationAuditExports)) {
    files.set(meta.archiveFileId, {name: meta.archiveFileId + '.json', bytes: Buffer.from(JSON.stringify({
      schema: 1, date, audit: Array.from({length: 200}, (_, i) => ({id: date + '-' + i, note: 'archived'.repeat(80)}))
    }))});
  }
  return {state, index: {schema: 1, revision: 12, entries, receipts: []}, files};
}

function harness({interrupt = false} = {}) {
  const backendSource = fs.readFileSync('backend/RosterEdgeMigration.gs', 'utf8');
  const source = fixture(), files = new Map(source.files), properties = new Map();
  const originalArchiveDigests = Object.fromEntries(Object.entries(source.state.allocationAuditExports)
    .map(([date, metadata]) => [date, hash(files.get(metadata.archiveFileId).bytes)]));
  const revisions = new Map([...files].map(([id, file]) => [id + '|revision-1', Buffer.from(file.bytes)]));
  const pinnedRevisions = new Set(), killedOrdinals = new Set();
  let clock = Date.parse('2026-10-31T08:00:00Z'), locks = 0, uploads = 0, captures = 0;
  let elapsed = 0, active = false, scope, callNumber = 0, ordinal = -1, cutPower = false, lockedArchiveCalls = 0;
  const calls = [], fileReads = new Map(), sourceWrites = [];
  const termination = Object.assign(Error('Simulated process termination'), {simulatedTermination: true});
  function writable() { if (cutPower) throw termination; }
  function cost(kind, bytes = 0) {
    const ms = kind === 'cpu' ? Math.ceil(bytes / MIB * 300) : 5000 + Math.ceil(bytes / MIB * 1000);
    clock += ms;
    if (active) {
      elapsed += ms;
      assert(elapsed <= BUDGET_MS, 'preparation step ' + ordinal + ' exceeded simulated two-minute budget: ' + elapsed + 'ms');
    }
  }
  function blob(value, contentType = 'application/octet-stream', name = '') {
    const bytes = Buffer.from(value);
    return {getBytes: () => new Uint8Array(bytes), getDataAsString: () => bytes.toString('utf8'),
      getContentType: () => contentType, getName: () => name};
  }
  function stored(id) { const result = files.get(id); assert(result, 'unknown private file: ' + id); return result; }
  function read(id) {
    assert.equal(locks, 0, 'batch input reads must release production locks');
    const file = stored(id); cost('read', file.bytes.length);
    fileReads.set(id, (fileReads.get(id) || 0) + 1);
    return file.bytes.toString('utf8');
  }
  function resetVm() {
    assert.equal(locks, 0);
    const Clock = class extends Date {
      constructor(...args) { super(...(args.length ? args : [clock])); }
      static now() { return clock; }
    };
    scope = {
      console, Date: Clock, GSiSEdgeStore: Store, GSiSRosterImport: Import,
      GSISRosterOperations: Operations, GSISRoster: Roster, ROSTER_DATA: 'private-folder',
      props_: () => ({getProperty: key => properties.get(key) || null,
        getProperties: () => Object.fromEntries(properties),
        setProperty: (key, value) => { writable(); assert(Buffer.byteLength(value) < 9000, 'Script Property exceeds 9KB'); properties.set(key, value); },
        setProperties: values => { writable(); for (const [key, value] of Object.entries(values)) properties.set(key, value); },
        deleteProperty: key => { writable(); properties.delete(key); }}),
      LockService: {getScriptLock: () => ({}), getUserLock: () => ({})},
      deployLock_: () => { locks++; return true; }, deployUnlock_: () => { assert(locks > 0); locks--; },
      error_: (status, message) => { throw Object.assign(Error(message), {status}); },
      Utilities: {newBlob: blob, gzip: b => { const bytes = Buffer.from(b.getBytes()); cost('cpu', bytes.length); return blob(zlib.gzipSync(bytes)); },
        base64Encode: value => Buffer.from(value).toString('base64'),
        base64Decode: value => [...Buffer.from(value, 'base64')],
        getUuid: () => 'fixture-id-' + uploads,
        computeDigest: (_algorithm, value) => { const bytes = Buffer.from(value); cost('cpu', bytes.length); return [...crypto.createHash('sha256').update(bytes).digest()]; },
        DigestAlgorithm: {SHA_256: 'sha256'}, Charset: {UTF_8: 'utf8'}},
      rosterOperationsDigest_: value => { const raw = JSON.stringify(value); cost('cpu', Buffer.byteLength(raw)); return hash(raw); },
      rosterFolder_: () => ({}), rosterReadFile_: read,
      rosterFindFile_: (_folder, name) => [...files].find(([, file]) => file.name === name)?.[0] || null,
      rosterCreateFile_: (_folder, name, content) => {
        writable();
        const bytes = Buffer.from(content.getBytes());
        if (locks) assert.equal(captures, 1, 'only the initial frozen snapshot may be written under production locks');
        cost('write', bytes.length); const id = 'created-' + (++uploads);
        files.set(id, {name, bytes}); revisions.set(id + '|revision-1', Buffer.from(bytes));
        sourceWrites.push({id, name, locked: locks > 0});
        // Durable bytes survive termination. Any catch/finally storage writes
        // are refused, then a fresh VM starts from these exact durable maps.
        if (interrupt && ordinal > 0 && !killedOrdinals.has(ordinal)) {
          killedOrdinals.add(ordinal); cutPower = true; throw termination;
        }
        return id;
      },
      rosterDriveJson_: response => JSON.parse(response.getContentText()),
      rosterDriveRequest_: (url, options = {}) => {
        const parsed = new URL(url);
        const path = /\/files\/([^/]+)(?:\/revisions\/([^/]+))?$/.exec(parsed.pathname);
        const id = path && decodeURIComponent(path[1]), revision = path?.[2] && decodeURIComponent(path[2]);
        if (locks && id?.startsWith('archive-')) lockedArchiveCalls++;
        assert.equal(locks, 0, 'snapshot capture must not read or pin external archives while locked');
        let body, status = 200, headers = {};
        if (parsed.pathname.endsWith('/files')) {
          const query = parsed.searchParams.get('q') || '';
          const named = /name = '([^']+)'/.exec(query)?.[1];
          const matches = [...files].filter(([, f]) => !named || f.name === named);
          body = Buffer.from(JSON.stringify({files: matches.map(([key, f]) => ({id: key, name: f.name, size: String(f.bytes.length)}))}));
        } else {
          const file = stored(id);
          if (revision && String(options.method).toLowerCase() === 'patch') {
            writable(); assert.deepEqual(JSON.parse(options.payload), {keepForever: true});
            assert(revisions.has(id + '|' + revision)); pinnedRevisions.add(id + '|' + revision);
          }
          if (parsed.searchParams.get('alt') === 'media') {
            const bytes = revision ? revisions.get(id + '|' + revision) : file.bytes;
            assert(bytes, 'unknown immutable revision');
            const range = /bytes=(\d+)-(\d+)/.exec(options.headers?.Range || '');
            if (range) {
              const start = Number(range[1]), end = Number(range[2]); body = bytes.subarray(start, end + 1);
              status = 206; headers = {'Content-Range': `bytes ${start}-${end}/${bytes.length}`};
            } else body = bytes;
          } else body = Buffer.from(JSON.stringify({id, size: String(file.bytes.length), parents: ['private-folder'], trashed: false, version: '1', headRevisionId: 'revision-1'}));
        }
        cost('read', body.length);
        return {getResponseCode: () => status, getAllHeaders: () => headers,
          getContent: () => [...body], getContentText: () => body.toString('utf8')};
      }
    };
    vm.createContext(scope);
    vm.runInContext(backendSource, scope);
    scope.rosterEdgeSnapshot_ = () => {
      assert(locks > 0, 'snapshot is captured under the production lock'); captures++;
      const value = {schema: 1, state: clone(source.state), index: clone(source.index)};
      const raw = JSON.stringify(value); cost('read', Buffer.byteLength(raw));
      cost('cpu', Buffer.byteLength(raw)); return {...value, sourceDigest: hash(raw)};
    };
  }
  resetVm();
  function call(input) {
    elapsed = 0; active = true; ordinal = input.preparation?.ordinal ?? -1; cutPower = false;
    try {
      return scope.rosterEdgeMigrationDispatch_({input, identity: {email: 'admin@example.test'}}, {user: {rosterAdmin: true}}).result;
    } finally {
      active = false; cutPower = false; assert.equal(locks, 0, 'every call releases production locks');
      calls.push({number: ++callNumber, elapsed});
    }
  }
  function probeRoster() {
    const lock = scope.LockService.getScriptLock(); assert(scope.deployLock_(lock));
    const ctx = {user: {admin: true, smc: true, email: 'admin@example.test'}, people: [],
      today: '2026-10-31', now: clock, iso: new Date(clock).toISOString(), uuid: () => 'probe-' + callNumber};
    assert.equal(Operations.read(source.state, ctx, {operation: 'accounting'}).revision, source.state.revision);
    const saved = Operations.apply(source.state, ctx, {operation: 'saveDailyEmploymentSettings',
      time: '08:00', subject: 'Between-step save', recipients: []});
    assert.deepEqual(saved.savedIds, ['dailyEmploymentSettings']);
    source.state.revision++; scope.deployUnlock_(lock); assert.equal(locks, 0);
  }
  return {call, source, files, properties, resetVm, probeRoster, sourceWrites, originalArchiveDigests,
    stats: () => ({captures, uploads, calls, fileReads: Object.fromEntries(fileReads),
      interruptions: killedOrdinals.size, pinnedRevisions: pinnedRevisions.size, lockedArchiveCalls})};
}

function prepare({reload = false, changeLive = false, interrupt = false} = {}) {
  const h = harness({interrupt}), request = {operation: 'edgeExportManifest', requestId: 'budget-fixture'};
  let response = h.call({...request, preparation: {ordinal: 0, checkpoint: null}});
  assert.equal(response.preparing, true, 'capture returns preparation progress instead of freezing every object in one call');
  assert.equal(response.manifest, undefined);
  const sourceDigest = response.sourceDigest;
  if (changeLive) {
    h.source.state.audit[0].message = 'changed after capture';
    h.source.index.entries[0].modelFile = 'untrusted-new-model';
    // The actual audit writer creates a new immutable file for each version.
    // Live pointers move, while the IDs in the captured source remain readable.
    for (const [date, metadata] of Object.entries(h.source.state.allocationAuditExports)) {
      const id = metadata.archiveFileId + '-new';
      h.files.set(id, {name: id + '.json', bytes: Buffer.from(JSON.stringify({
        schema: 1, date, audit: [{id: 'changed after capture'}]
      }))});
      metadata.archiveFileId = id;
    }
  }
  let steps = 0;
  while (response.preparing) {
    assert(++steps < 256, 'preparation must complete in bounded polls');
    assert(response.preparation, 'reply must bind the next preparation checkpoint');
    h.probeRoster();
    if (reload) h.resetVm();
    const next = {...request, preparation: response.preparation};
    try { response = h.call(next); }
    catch (error) {
      if (!interrupt || !error.simulatedTermination) throw error;
      h.resetVm(); response = h.call(next);
    }
    assert.equal(response.sourceDigest, sourceDigest, 'all steps retain the initial source identity');
    assert.notEqual(response.preparationFailed, true);
  }
  assert(response.manifest, 'all completed parts produce a manifest');
  assert.equal(h.stats().captures, 1, 'resume never reads the live snapshot again');
  Import.validateManifest(response.manifest);
  const parts = Array.from(response.manifest.parts, part => {
    const value = h.call({...request, operation: 'edgeExportPart', sessionId: response.sessionId,
      preparation: response.preparation, partId: part.id});
    assert.equal(hash(value.payload), part.digest); return value.payload;
  });
  assert.equal(new Set(response.manifest.parts.map(part => part.id)).size, parts.length);
  assert(h.stats().calls.every(call => call.elapsed <= BUDGET_MS));
  const rows = parts.flatMap((payload, i) => response.manifest.parts[i].kind === 'records'
    ? JSON.parse(payload).rows.map(row => ({...row, scope: response.manifest.parts[i].scope})) : []);
  const state = Store.decode(rows.filter(row => row.scope === 'roster'));
  assert.equal(state.audit.length, 16000);
  assert.equal(state.audit[0].message.startsWith('record 0 '), true, 'frozen state survives live edits');
  const index = Store.decode(rows.filter(row => row.scope === 'roster-register'));
  assert.equal(index.entries.length, 12);
  assert(index.entries.every(entry => entry.modelObject));
  assert.equal(Object.keys(state.allocationAuditExports).length, ARCHIVE_COUNT);
  assert(Object.values(state.allocationAuditExports).every(row => row.archiveObject));
  for (const [date, metadata] of Object.entries(state.allocationAuditExports)) {
    assert.equal(metadata.archiveObject.digest, h.originalArchiveDigests[date], 'capture retains the original immutable audit bytes');
  }
  assert(!Object.keys(h.stats().fileReads).some(id => id.endsWith('-new')), 'later archive pointers never enter the frozen source');
  assert(h.sourceWrites.filter(write => write.locked).length <= 1, 'only snapshot storage holds production locks');
  const names = h.sourceWrites.map(write => write.name);
  assert.equal(new Set(names).size, names.length, 'lost uploads reuse verified named files instead of creating duplicates');
  assert.equal(h.stats().pinnedRevisions, 0, 'capture does not perform one revision pin call per historical archive');
  assert.equal(h.stats().lockedArchiveCalls, 0);
  if (interrupt) assert(h.stats().interruptions > 1, 'interruptions cover multiple separate steps');
  return {manifest: clone(response.manifest), parts, stats: h.stats(), steps};
}

const uninterrupted = prepare();
const resumed = prepare({reload: true, changeLive: true, interrupt: true});
assert.deepEqual(resumed.manifest, uninterrupted.manifest, 'resume and live edits preserve the exact final manifest');
assert.deepEqual(resumed.parts, uninterrupted.parts, 'resume does not duplicate, omit or change a logical part');
console.log(JSON.stringify({check: '16.08M operations, 12 models, 16 archives; resumable preparation budget',
  steps: uninterrupted.steps, maxCallMs: Math.max(...uninterrupted.stats.calls.map(call => call.elapsed)),
  resumedMaxCallMs: Math.max(...resumed.stats.calls.map(call => call.elapsed)),
  interruptions: resumed.stats.interruptions, parts: uninterrupted.parts.length, simulated: true}));
