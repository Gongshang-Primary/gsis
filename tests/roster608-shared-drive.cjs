const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const M = require('../shared/roster');

// Exercise the real Roster storage and dispatch code against a strict Drive v3
// HTTP fixture. No DriveApp or enabled Advanced Drive service is available.
const ROOT = '1YTYau20Nvkj3BS-IsE4CYaJW1nIdaD91';
const ARCHIVE = '1_9CnZI2DggC0cJc1l6fU0kH0BaJr2eEl';
const DATA = '14M4imcYdcrfiUax_LckvWwrqU83_9rlb';
const DRIVE = 'shared-drive-fixture';
const TOKEN = 'private-oauth-token';
const ACTOR = { email: 'private.staff@gsps.edu.sg', subject: 'private-subject' };
const SMC = { user: { rosterSMC: true, rosterAdmin: true } };
const TEACHER = { user: { rosterSMC: false } };
const source = fs.readFileSync('backend/Roster.gs', 'utf8');
const model = M.validate({
  layoutMode: 'single-week',
  sourceMode: 'legacy-four-line',
  single: {
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    perDay: 2,
    maxPeriod: 1,
    blocks: [{ name: 'Private teacher', cells: Array.from({ length: 10 }, (_, i) => i === 0 ? ['EL', '1A', 'R1', 'Group'] : ['', '', '', '']) }]
  },
  timing: { startMinutes: 420, periodMinutes: 30, normalLastPeriod: 1 }
});

function asBytes(value) {
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (value && typeof value.getBytes === 'function') return Buffer.from(value.getBytes());
  return Buffer.from(value || []);
}

function blob(value, type = 'application/octet-stream', name = '') {
  const bytes = asBytes(value);
  return {
    getBytes: () => Array.from(bytes, b => b > 127 ? b - 256 : b),
    getDataAsString: () => bytes.toString('utf8'),
    getContentType: () => type,
    getName: () => name,
    setName(next) { name = next; return this; }
  };
}

function response(body, status = 200, headers = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    getResponseCode: () => status,
    getContentText: () => raw,
    getHeaders: () => headers,
    getAllHeaders: () => headers,
    getBlob: () => blob(raw)
  };
}

function fixture(settings = {}) {
  const files = new Map(), properties = new Map(), requests = [], sessions = new Map(), logs = [];
  const folders = new Map([ROOT, ARCHIVE, DATA].map(id => [id, {
    id, mimeType: 'application/vnd.google-apps.folder', driveId: DRIVE,
    capabilities: { canAddChildren: true, canEdit: true }
  }]));
  let serial = 0, locked = false, lockCalls = 0, unlockCalls = 0;
  const state = { fail: null, page: false };

  function addFile(parent, name, bytes, mimeType = 'application/json') {
    const file = { id: 'fixture-file-' + (++serial), parents: [parent], name, bytes: asBytes(bytes), mimeType };
    files.set(file.id, file);
    return file;
  }

  function denied(spec = {}) {
    return response({ error: {
      code: spec.status || 403,
      message: spec.message || 'PRIVATE_ERROR staff.private@gsps.edu.sg ' + TOKEN + ' https://private.example/file',
      errors: [{ reason: spec.reason || 'insufficientFilePermissions', message: 'PRIVATE_ERROR body must not reach diagnostics' }]
    } }, spec.status || 403);
  }

  function fetch(address, options = {}) {
    const url = new URL(address), method = (options.method || 'get').toLowerCase();
    const headers = Object.fromEntries(Object.entries(options.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    assert.equal(url.origin, 'https://www.googleapis.com');
    assert.equal(options.muteHttpExceptions, true, 'Drive responses must be examined without copying native exception text');
    assert.equal(headers.authorization, 'Bearer ' + TOKEN);
    const request = { url, method, options, headers };
    requests.push(request);
    const uploadId = url.searchParams.get('upload_id');
    if (uploadId) {
      assert.equal(method, 'put');
      const pending = sessions.get(uploadId);
      assert.ok(pending, 'Unexpected resumable upload session');
      Object.assign(request, { operation: 'upload', parent: pending.parents[0], name: pending.name });
      if (state.fail?.(request)) return denied(state.fail(request));
      const bytes = asBytes(options.payload);
      assert.equal(bytes.length, pending.length, 'Final upload body must match declared binary length');
      const file = addFile(pending.parents[0], pending.name, bytes, pending.mimeType);
      sessions.delete(uploadId);
      return response({ id: file.id });
    }

    assert.equal(url.searchParams.get('supportsAllDrives'), 'true', 'Every Drive metadata/list/content request must support shared drives');
    if (method === 'get' && url.pathname === '/drive/v3/files') {
      request.operation = 'list';
      assert.equal(url.searchParams.get('includeItemsFromAllDrives'), 'true');
      assert.equal(url.searchParams.get('corpora'), 'drive');
      assert.equal(url.searchParams.get('driveId'), DRIVE);
      const q = url.searchParams.get('q');
      const parent = q.match(/'([^']+)'\s+in\s+parents/);
      const name = q.match(/name\s*=\s*'((?:\\.|[^'])*)'/);
      assert.ok(parent, 'File lookup must be limited to the configured parent folder');
      assert.ok(name, 'File lookup must use an exact name');
      assert.match(q, /trashed\s*=\s*false/);
      request.parent = parent[1];
      request.name = name[1].replace(/\\(.)/g, '$1');
      if (state.fail?.(request)) return denied(state.fail(request));
      const matches = [...files.values()].filter(f => f.parents.includes(request.parent) && f.name === request.name).map(f => ({ id: f.id, name: f.name }));
      if (state.page && !url.searchParams.has('pageToken')) return response({ files: [], nextPageToken: 'page-two' });
      if (state.page) assert.equal(url.searchParams.get('pageToken'), 'page-two');
      return response({ files: matches });
    }

    if (method === 'post' && url.pathname === '/upload/drive/v3/files') {
      assert.equal(url.searchParams.get('uploadType'), 'resumable');
      const metadata = JSON.parse(asBytes(options.payload).toString());
      Object.assign(request, { operation: 'start', parent: metadata.parents[0], name: metadata.name });
      assert.equal(metadata.parents.length, 1);
      assert.ok(folders.has(request.parent));
      assert.ok(metadata.name && metadata.mimeType);
      if (state.fail?.(request)) return denied(state.fail(request));
      const id = 'upload-' + (++serial);
      sessions.set(id, { ...metadata, length: Number(headers['x-upload-content-length']) });
      assert.ok(Number.isSafeInteger(sessions.get(id).length));
      return response('', 200, { Location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=' + id });
    }

    const id = decodeURIComponent(url.pathname.split('/').at(-1));
    if (method === 'get' && folders.has(id)) {
      request.operation = 'folder';
      if (state.fail?.(request)) return denied(state.fail(request));
      return response(folders.get(id));
    }
    const file = files.get(id);
    assert.ok(file, 'Unexpected file ID in Drive request: ' + id);
    Object.assign(request, { file, parent: file.parents[0], name: file.name });
    if (method === 'get') {
      request.operation = 'read';
      if (state.fail?.(request)) return denied(state.fail(request));
      assert.equal(url.searchParams.get('alt'), 'media');
      return response(file.bytes.toString('utf8'));
    }
    if (method === 'patch') {
      request.operation = 'update';
      assert.equal(url.pathname, '/upload/drive/v3/files/' + file.id);
      assert.equal(url.searchParams.get('uploadType'), 'media');
      if (state.fail?.(request)) return denied(state.fail(request));
      file.bytes = asBytes(options.payload);
      return response({ id: file.id });
    }
    throw Error('Unexpected HTTP request: ' + method + ' ' + url.pathname);
  }

  const ctx = vm.createContext({
    GSISRoster: M, GSIS_DEPLOY_VERSION: '0.6.08',
    props_: () => ({ getProperty: k => properties.get(k) || null, setProperty: (k, v) => properties.set(k, v) }),
    Utilities: {
      formatDate: () => '2026-10-13', getUuid: crypto.randomUUID, newBlob: blob,
      base64Decode: text => Array.from(Buffer.from(text, 'base64'), b => b > 127 ? b - 256 : b),
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_, text) => Array.from(crypto.createHash('sha256').update(text).digest(), b => b > 127 ? b - 256 : b)
    },
    ScriptApp: { getOAuthToken: () => TOKEN }, UrlFetchApp: { fetch },
    LockService: { getScriptLock: () => ({ releaseLock() { assert.equal(locked, true); locked = false; unlockCalls++; } }) },
    deployLock_: () => { assert.equal(locked, false); locked = true; lockCalls++; return true; },
    deployUnlock_: lock => lock.releaseLock(),
    error_: (status, message) => { throw Object.assign(Error(message), { status }); },
    console: { log: line => logs.push(JSON.parse(line)) },
    CacheService: { getScriptCache: () => ({ put() {} }) },
    deployTrace_: { rosterDiagnostic: true, backendVersion: '0.6.08', diagnosticBuild: 'test', requestId: 'private-reference', started: Date.now(), phase: 'test', authenticated: true }
  });
  require('./load-backend-role.cjs')(ctx,'roster');vm.runInContext(source, ctx);
  function call(action, input = {}, authority = SMC) {
    ctx.deployTrace_.action = action;
    return ctx.rosterDispatch_({ action, input, identity: ACTOR }, authority);
  }
  return { ctx, call, files, folders, properties, requests, state, logs, addFile,
    get locked() { return locked; }, get lockCalls() { return lockCalls; }, get unlockCalls() { return unlockCalls; } };
}

function workbook(length = 260) {
  const bytes = Buffer.alloc(length);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  bytes.set([80, 75, 3, 4]);
  return bytes;
}

function upload(bytes = workbook(), fields = {}) {
  return {
    requestId: crypto.randomUUID(), revision: 0, name: 'Private baseline',
    from: '2026-10-13', to: '2026-10-31', model, workbook: bytes.toString('base64'), ...fields
  };
}

function register(h) {
  const file = [...h.files.values()].find(x => x.name === 'Roster register.json');
  return file ? JSON.parse(file.bytes.toString()) : { revision: 0, entries: [], receipts: [] };
}

// A shared-drive lookup cannot use My Drive search defaults. Exact names are
// escaped, deleted files are excluded, and an empty page is not an empty result.
{
  const h = fixture(), name = "A teacher's \\ timetable.json";
  const file = h.addFile(DATA, name, '{}');
  h.state.page = true;
  assert.equal(h.ctx.rosterFindFile_(DATA, name), file.id);
  const lookups = h.requests.filter(x => x.operation === 'list');
  assert.equal(lookups.length, 2);
  assert.match(lookups[0].url.searchParams.get('q'), /teacher\\'s \\\\ timetable/);
  assert.equal(lookups[1].url.searchParams.get('pageToken'), 'page-two');
  h.ctx.rosterFindFile_(DATA, 'absent.json');
  assert.equal(h.requests.filter(x => x.operation === 'folder').length, 1, 'Folder metadata is cached within an execution');
}

// The maximum accepted workbook includes every byte value and crosses the 5 MB
// simple-upload threshold. The archive must preserve bytes and content type.
{
  const h = fixture(), bytes = workbook(8000000), input = upload(bytes);
  const saved = h.call('rosterUpload', input);
  assert.equal(saved.revision, 1);
  assert.equal(saved.savedId, input.requestId);
  const index = register(h), entry = index.entries[0];
  assert.equal(index.receipts.length, 1);
  assert.deepEqual(h.files.get(entry.workbookFile).bytes, bytes);
  assert.equal(h.files.get(entry.workbookFile).mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(h.files.get(entry.workbookFile).parents[0], ARCHIVE);
  assert.equal(h.files.get(entry.modelFile).parents[0], DATA);
  assert.deepEqual(JSON.parse(h.files.get(entry.modelFile).bytes.toString()), model);
  assert.deepEqual(JSON.parse(JSON.stringify(h.call('rosterRead', {}, TEACHER).model)), model);
  assert.equal(h.call('rosterProfile', {}, TEACHER).entries, undefined);
  const count = h.files.size, writes = h.requests.filter(r => ['start', 'upload', 'update'].includes(r.operation)).length;
  assert.equal(h.call('rosterUpload', input).replayed, true);
  h.properties.delete('ROSTER_INDEX_FILE');
  assert.equal(h.call('rosterUpload', input).replayed, true, 'Discovery recovers a committed register without its property pointer');
  assert.equal(h.files.size, count);
  assert.equal(h.requests.filter(r => ['start', 'upload', 'update'].includes(r.operation)).length, writes);
  assert.throws(() => h.call('rosterUpload', { ...input, name: 'Changed' }), e => e.status === 409);
  const updated = h.call('rosterUpdate', {
    requestId: crypto.randomUUID(), revision: 1, id: saved.savedId, operation: 'metadata',
    name: 'Renamed baseline', from: '2026-10-14', to: '2026-10-31'
  });
  assert.equal(updated.revision, 2);
  assert.equal(h.call('rosterRead', {}, TEACHER).active, null);
  assert.equal(h.call('rosterRead', { date: '2026-10-14' }, TEACHER).active.name, 'Renamed baseline');
  assert.equal(h.files.size, count, 'Metadata changes replace the register without creating data or archive copies');
  assert.equal(h.requests.filter(r => r.operation === 'update').length, 1);
  assert.equal(h.locked, false);
  assert.equal(h.lockCalls, h.unlockCalls);
}

// Failure before the register is published cannot expose a partly saved
// timetable. A retry reuses the immutable files that were already written.
for (const failureAt of ['archive', 'register']) {
  const h = fixture(), input = upload();
  h.state.fail = request => request.operation === 'upload' &&
    (failureAt === 'archive' ? request.parent === ARCHIVE : request.name === 'Roster register.json') ? {} : null;
  assert.throws(() => h.call('rosterUpload', input), e => e.status === 503);
  assert.equal(h.call('rosterProfile').active, null);
  assert.equal(register(h).revision, 0);
  assert.equal(h.locked, false);
  const savedModels = [...h.files.values()].filter(x => x.parents[0] === DATA && x.name !== 'Roster register.json');
  assert.equal(savedModels.length, 1);
  h.state.fail = null;
  assert.equal(h.call('rosterUpload', input).revision, 1);
  assert.equal(h.files.size, 3, 'Retry must reuse model and any previously saved workbook');
  assert.equal(register(h).entries[0].modelFile, savedModels[0].id);
  assert.equal(h.lockCalls, h.unlockCalls);
}

// Failed replacement of a published register preserves its previous contents,
// revision and receipt. A retry may publish the change exactly once.
{
  const h = fixture(), first = upload();
  h.call('rosterUpload', first);
  const old = register(h), change = {
    id: first.requestId, revision: 1, requestId: crypto.randomUUID(), operation: 'metadata',
    name: 'Pending name', from: '2026-10-13', to: '2026-10-31'
  };
  h.state.fail = request => request.operation === 'update' ? {} : null;
  assert.throws(() => h.call('rosterUpdate', change), e => e.status === 503);
  assert.deepEqual(register(h), old);
  assert.equal(h.call('rosterProfile').active.name, first.name);
  h.state.fail = null;
  assert.equal(h.call('rosterUpdate', change).revision, 2);
  assert.equal(h.call('rosterUpdate', change).replayed, true);
  assert.equal(register(h).receipts.length, 2);
}

// HTTP details are structured metadata. Provider text, unknown reason strings,
// OAuth credentials, file names and user identities cannot enter diagnostics.
for (const reason of ['insufficientFilePermissions', 'PRIVATE_ERROR_' + TOKEN]) {
  const h = fixture();
  h.state.fail = request => request.operation === 'start' ? { reason } : null;
  let failure;
  try { h.call('rosterUpload', upload()); } catch (e) { failure = e; }
  assert.ok(failure);
  assert.equal(failure.status, 503);
  assert.equal(failure.rosterDrive.httpStatus, 403);
  assert.ok(typeof failure.rosterDrive.operation === 'string');
  assert.ok(Number.isFinite(failure.rosterDrive.elapsedMs));
  assert.deepEqual(Array.from(failure.rosterDrive.reasons), reason === 'insufficientFilePermissions' ? [reason] : ['UNCLASSIFIED']);
  h.ctx.rosterDiagnostic_('roster-backend-failed', { message: h.ctx.rosterDiagnosticError_(failure) });
  assert.equal(h.logs.at(-1).drive.httpStatus, 403);
  const diagnostic = JSON.stringify([failure.message, failure.rosterDrive, h.logs]);
  assert.doesNotMatch(diagnostic, /PRIVATE_ERROR|private-oauth-token|private\.staff|staff\.private|private\.example|Private teacher|Private baseline/);
  assert.equal(h.locked, false);
}

console.log('PASS Roster 608 shared Drive: scoped paginated lookups, maximum binary workbook, real upload/read/update/replay, atomic publication, safe API diagnostics');
