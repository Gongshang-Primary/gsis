'use strict';
// Offline cross-application contract: unmodified LORD consumer -> signed HTTP
// envelope -> actual GSiS doPost/auth/projection. Only Google services are faked.
// Run with the companion checkout beside LORD, or set GSIS_SOURCE_ROOT.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { harness, plain } = require('./backend_harness.cjs');
const suiteRoot = path.join(__dirname, '../..');
const gsisRoot = path.resolve(process.env.GSIS_SOURCE_ROOT || (fs.existsSync(path.join(suiteRoot, 'backend/LordBridge.gs')) ? suiteRoot : path.join(suiteRoot, 'gsis-patch')));
const catalogue = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/gsis-catalogue-synthetic.json'), 'utf8'));
const cwd = process.cwd();
let contacts, deploy;
try {
  process.chdir(gsisRoot); // Contacts' existing fixture loads its canonical source relative to cwd.
  contacts = require(path.join(gsisRoot, 'tests/contacts-data.cjs'));
  deploy = require(path.join(gsisRoot, 'tests/storage.cjs'));
} finally { process.chdir(cwd); }

const secret = 'offline-lord-contract-secret-32-characters';
const h = harness(), c = h.ctx, files = new Map(), calls = [];
h.now = Date.now(); // Source authentication uses a real 60-second request window.
h.properties.LORD_BRIDGE_SECRET = secret;
h.properties.LORD_CONTACTS_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/contacts-fixture/exec';
h.properties.LORD_DEPLOY_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/deploy-fixture/exec';
h.properties.LORD_GSIS_SNAPSHOT_FOLDER_ID = 'offline-snapshot-folder';
c.Utilities.computeHmacSha256Signature = (text, key) => [...crypto.createHmac('sha256', key).update(text).digest()];
for (const source of [contacts, deploy]) {
  source.props.set('LORD_BRIDGE_SECRET', secret);
  source.ctx.Utilities.computeHmacSha256Signature = c.Utilities.computeHmacSha256Signature;
  source.ctx.ContentService = { MimeType: { JSON: 'application/json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) };
  source.ctx.console = { log() {}, info() {}, error() {} };
  assert.equal(typeof source.ctx.doPost, 'function');
}
assert.equal(typeof contacts.ctx.lordContactsService_, 'function', 'Build the Contacts source bridge before running this contract.');
assert.equal(typeof deploy.ctx.lordDeployService_, 'function', 'Build the Deploy source bridge before running this contract.');

// Catalogue, contact identities and all other input data are synthetic.
// Counts and changed 1P identities preserve the cross-application contract case.
const contactSheet = contacts.sheets.get('contacts'), headers = contactSheet.data[0];
const syntheticPerson = {
  'Staff ID': 'contract-teacher', 'Basic Name': 'Synthetic Teacher', 'Active': 'Y', 'Role': 'Teacher',
  'GSPS Alias (@gsps.edu.sg)': 'staff', 'CES Alias (@schools.gov.sg)': 'synthetic.teacher',
  'Statutory Name': 'Synthetic Teacher Full', 'Mobile No': '90000001'
};
contactSheet.data = [headers, headers.map(key => syntheticPerson[key] || '')];
contactSheet.formulas = [];
contacts.props.set('CONTACTS_PENDING_V2', '{}');
contacts.props.delete('DEPLOY_CATALOGUE_PENDING');
const putContact = (key, value) => { assert(headers.includes(key)); contactSheet.data[1][headers.indexOf(key)] = value; };
const indexSheet = deploy.sheets.get('deploy_index');
const readIndex = () => JSON.parse(indexSheet.data[1][1]);
const writeIndex = value => { indexSheet.data[1][1] = JSON.stringify(value); };
const documents = deploy.sheets.get('deploy_documents');
const seedVersion = version => {
  const row = documents.getLastRow() + 1;
  const document = { id: version.id, from: version.from, to: version.to, classes: version.classes, loads: { '1': { SCI: 1 } }, groups: [] };
  documents.getRange(row, 1, 1, 4).setValues([[version.id, version.commit, 0, JSON.stringify(document)]]);
  return { id: version.id, name: version.name, revision: version.revision, commit: version.commit, row, parts: 1, updatedAt: '2026-10-24T00:00:00.000Z' };
};
const publishedEntry = seedVersion(catalogue.published), draftEntry = seedVersion(catalogue.draft);
const seededIndex = readIndex();
Object.assign(seededIndex, { revision: catalogue.indexRevision, publicationSchema: 1, published: publishedEntry, versions: [publishedEntry, draftEntry] });
delete seededIndex.pendingFieldCommit;
writeIndex(seededIndex);
const labels = version => version.classes.map(item => String(item.level) + item.shortName);
h.refSheets[c.LORD_REFERENCE_CONFIG.SHEETS.classes].data = catalogue.lordReference.labels.map(label => [label]);
const currentFormLabels = new Set(catalogue.published.classes.map(item => (item.level + ' ' + item.name).toLowerCase()));
const retainedActivities = catalogue.lordReference.labels.filter(label => !currentFormLabels.has(label.toLowerCase()));
assert.equal(catalogue.lordReference.labels.length, 102);
assert.equal(retainedActivities.length, 62);

let contactReads = 0, deployReads = 0, fileWrites = 0, rewriteEnvelope;
const readTables = contacts.ctx.GSISSheets.readTables;
contacts.ctx.GSISSheets.readTables = (...args) => { contactReads++; return readTables(...args); };
const readDocument = deploy.ctx.lordDeployDocument_;
deploy.ctx.lordDeployDocument_ = (...args) => { deployReads++; return readDocument(...args); };
c.DriveApp = {
  getFolderById(id) {
    assert.equal(id, h.properties.LORD_GSIS_SNAPSHOT_FOLDER_ID);
    return { createFile(name, text) {
      assert.equal(h.locked, false, 'Snapshot serialization stays outside the LORD write lock.');
      const id = 'contract-snapshot-' + ++fileWrites; files.set(id, text); return { getId: () => id };
    } };
  },
  getFileById(id) { assert(files.has(id)); return { getBlob: () => ({ getDataAsString: () => files.get(id) }) }; }
};
c.UrlFetchApp.fetch = (url, options) => {
  assert.equal(h.locked, false, 'Upstream reads stay outside the LORD write lock.');
  assert.equal(options.method, 'post');
  const source = url === h.properties.LORD_CONTACTS_APPS_SCRIPT_URL ? contacts : deploy;
  assert.equal(url, source === contacts ? h.properties.LORD_CONTACTS_APPS_SCRIPT_URL : h.properties.LORD_DEPLOY_APPS_SCRIPT_URL);
  let envelope = JSON.parse(options.payload);
  const request = JSON.parse(envelope.payload);
  if (rewriteEnvelope) envelope = rewriteEnvelope(envelope, request);
  source.ctx.contractEvent = { postData: { contents: JSON.stringify(envelope) } };
  const reply = JSON.parse(vm.runInContext('doPost(contractEvent).text', source.ctx));
  calls.push({ request, reply });
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify(reply) };
};
const sync = () => { h.now = Date.now(); h.reset(); return c.syncLORDGSiSReferences_({ allowDisabled: true }); };
const snapshot = () => { h.reset(); return plain(c.gsisSnapshot_()); };
const publicRefs = () => { h.reset(); return plain(c.getReferenceData_()); };
const sign = request => {
  const payload = JSON.stringify(request);
  return { payload, signature: crypto.createHmac('sha256', secret).update(payload).digest('hex') };
};
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }

test('Initial actual signed sync omits unknown knownKey and imports only the 40 published forms', () => {
  const result = sync();
  assert.equal(result.changed, true);
  assert.equal(fileWrites, 1);
  assert.equal(calls.length, 2);
  for (const { request, reply } of calls) {
    assert.equal(Object.hasOwn(request.input, 'knownKey'), false, 'An empty knownKey is invalid at the source.');
    assert.equal(reply.ok, true, JSON.stringify(reply));
  }
  h.properties.LORD_GSIS_ENABLED = 'true';
  const saved = snapshot(), refs = publicRefs();
  assert.equal(saved.deploy.publication.id, catalogue.published.id);
  assert.equal(saved.deploy.classes.length, 40);
  assert.deepEqual(refs.referenceCatalog.classes.map(item => item.name).sort(), labels(catalogue.published).sort());
  assert.deepEqual(saved.activities.map(item => item.name), retainedActivities, 'The exact 40 existing form labels must not become local activities.');
  assert.equal(JSON.stringify(refs).includes(syntheticPerson['Mobile No']), false);
  assert.equal(JSON.stringify(refs).includes(syntheticPerson['Statutory Name']), false);
});

test('Unchanged actual sources retain the file; Deploy skips document reads and Contacts rechecks direct edits', () => {
  const pointer = h.properties.LORD_GSIS_SNAPSHOT, writes = fileWrites, reads = contactReads;
  deployReads = 0;
  assert.equal(sync().changed, false);
  assert.equal(h.properties.LORD_GSIS_SNAPSHOT, pointer);
  assert.equal(fileWrites, writes);
  assert.equal(deployReads, 0);
  assert.equal(contactReads, reads + 1);
  assert(calls.slice(-2).every(call => call.reply.data.unchanged === true));
});

test('Phone-only direct Contacts edit changes the digest and durable copy without epoch writes', () => {
  const before = snapshot(), epoch = contacts.props.get('CONTACTS_DATA_EPOCH');
  putContact('Mobile No', '90000002');
  assert.equal(sync().changed, true);
  const after = snapshot();
  assert.notEqual(after.contacts.key, before.contacts.key);
  assert.equal(after.deploy.key, before.deploy.key);
  assert.equal(after.contacts.people[0].mobile, '90000002');
  assert.equal(contacts.props.get('CONTACTS_DATA_EPOCH'), epoch);
});

test('Unpublished 2027 draft changes cannot alter the current LORD catalogue or reload Deploy content', () => {
  const pointer = h.properties.LORD_GSIS_SNAPSHOT, writes = fileWrites, index = readIndex();
  index.revision++;
  index.versions[1] = { ...index.versions[1], name: '2027 Term 1 edited draft', revision: index.versions[1].revision + 1, commit: crypto.randomUUID() };
  writeIndex(index);
  deployReads = 0;
  assert.equal(sync().changed, false);
  assert.equal(h.properties.LORD_GSIS_SNAPSHOT, pointer);
  assert.equal(fileWrites, writes);
  assert.equal(deployReads, 0);
  assert.equal(snapshot().deploy.classes.length, 40);
});

test('Publishing 2027 replaces 40 forms with 59 while preserving local activities and distinct 1P identity', () => {
  const before = snapshot(), oldP = before.deploy.classes.find(item => item.name === '1P');
  const index = readIndex(); index.revision++; index.published = draftEntry; writeIndex(index);
  assert.equal(sync().changed, true);
  const after = snapshot(), newP = after.deploy.classes.find(item => item.name === '1P');
  assert.equal(after.deploy.publication.id, catalogue.draft.id);
  assert.equal(after.deploy.classes.length, 59);
  assert.notEqual(after.deploy.key, before.deploy.key);
  assert.notEqual(newP.id, oldP.id);
  assert.equal(oldP.fullName, 'Synthetic Published Class 1');
  assert.equal(newP.fullName, 'Synthetic Draft Class 1');
  assert.deepEqual(after.activities, before.activities);
});

test('Contacts changing during an actual read yields SOURCE_CHANGED and cannot replace the durable snapshot', () => {
  const pointer = h.properties.LORD_GSIS_SNAPSHOT, writes = fileWrites;
  const original = contacts.ctx.GSISSheets.readTables;
  contacts.ctx.GSISSheets.readTables = (...args) => {
    const value = original(...args); contacts.props.set('CONTACTS_DATA_EPOCH', crypto.randomUUID()); return value;
  };
  try {
    assert.throws(sync, /authoritative reference/);
    assert.equal(calls.at(-1).reply.code, 'SOURCE_CHANGED');
    assert.equal(calls.at(-1).reply.status, 409);
    assert.equal(h.properties.LORD_GSIS_SNAPSHOT, pointer);
    assert.equal(fileWrites, writes);
    assert.equal(JSON.parse(h.properties.LORD_GSIS_CHECK).ok, false);
    assert.throws(() => c.gsisRequireFreshContacts_(), /Contacts/);
  } finally { contacts.ctx.GSISSheets.readTables = original; }
  assert.equal(sync().changed, false);
});

test('Actual sources reject signed empty knownKey instead of masking the initial-sync contract regression', () => {
  const pointer = h.properties.LORD_GSIS_SNAPSHOT, writes = fileWrites;
  const reads = contactReads;
  rewriteEnvelope = (envelope, request) => sign({ ...request, input: { ...request.input, knownKey: '' } });
  try {
    assert.throws(sync, /authoritative reference/);
    assert.equal(calls.at(-1).reply.status, 400);
    assert.equal(contactReads, reads);
    assert.equal(h.properties.LORD_GSIS_SNAPSHOT, pointer);
    assert.equal(fileWrites, writes);
  } finally { rewriteEnvelope = undefined; }
});

test('Both real source boundaries reject wrong signatures and expired requests before source reads', () => {
  for (const target of ['contacts', 'deploy']) {
    for (const mutation of [
      (envelope) => ({ ...envelope, signature: '0'.repeat(64) }),
      (envelope, request) => sign({ ...request, timestamp: 0 })
    ]) {
      const pointer = h.properties.LORD_GSIS_SNAPSHOT, writes = fileWrites;
      const reads = target === 'contacts' ? contactReads : deployReads;
      rewriteEnvelope = (envelope, request) => request.source === target ? mutation(envelope, request) : envelope;
      try {
        assert.throws(sync, /authoritative reference/);
        assert.equal(calls.at(-1).reply.status, 401);
        assert.equal(target === 'contacts' ? contactReads : deployReads, reads);
        assert.equal(h.properties.LORD_GSIS_SNAPSHOT, pointer);
        assert.equal(fileWrites, writes);
      } finally { rewriteEnvelope = undefined; }
    }
  }
  assert.equal(sync().changed, false);
  assert.equal(JSON.parse(h.properties.LORD_GSIS_CHECK).ok, true);
});

console.log(JSON.stringify({ passed, failed: 0, transport: 'real signed consumer and source endpoints', liveCalls: 0 }));
