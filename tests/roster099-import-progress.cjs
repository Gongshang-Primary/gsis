'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const scope = {}; 
vm.createContext(scope);
vm.runInContext(fs.readFileSync('backend/RosterEdgeMigration.gs', 'utf8'), scope);
scope.rosterEdgeExportHash_=text=>require('node:crypto').createHash('sha256').update(text).digest('hex');

// Counts describe whole saved items. A large object's upload can take many
// calls without completing that object, or changing the captured inventory.
const cases = [
  {name: 'source with no objects', stage: 'objects', jobs: 0, jobIndex: 0, ordinal: 0, workDone: 1, workTotal: 3, legacyTotal: 3},
  {name: 'source with three objects', stage: 'objects', jobs: 3, jobIndex: 0, ordinal: 0, workDone: 1, workTotal: 6, legacyTotal: 6},
  {name: 'large object partially saved', stage: 'objects', jobs: 3, jobIndex: 1, ordinal: 19, work: {header:{partMetadata:[]},parts: 15, next: 4}, workDone: 2, workTotal: 6, legacyTotal: 30},
  {name: 'all objects saved, records not prepared', stage: 'objects', jobs: 3, jobIndex: 3, ordinal: 31, workDone: 4, workTotal: 6, legacyTotal: 34},
  {name: 'record parts partially saved', stage: 'records', jobs: 3, jobIndex: 3, ordinal: 34, work: {header:{partMetadata:[]},parts: 8, next: 7}, workDone: 4, workTotal: 6, legacyTotal: 38},
  {name: 'all record parts saved', stage: 'finalize', jobs: 3, jobIndex: 3, ordinal: 35, workDone: 5, workTotal: 6, legacyTotal: 37},
  {name: 'current record scope digest pending', stage: 'record-scopes', budgetVersion: 2, jobs: 3, jobIndex: 3, ordinal: 40, workDone: 4, workTotal: 6, legacyTotal: 42},
  {name: 'verified manifest', stage: 'ready', jobs: 3, jobIndex: 3, ordinal: 36, workDone: 6, workTotal: 6, legacyTotal: 37},
  {name: 'zero-object manifest', stage: 'ready', jobs: 0, jobIndex: 0, ordinal: 9, workDone: 3, workTotal: 3, legacyTotal: 10}
];
for (const fixture of cases) {
  const checkpoint = {...fixture, sessionId: 'a'.repeat(64), requestId: 'progress-request', sourceDigest: 'b'.repeat(64),
    parts: [{id: 'saved-1'}, {id: 'saved-2'}], elapsedMs: 47000, timing: {elapsedMs: 1200}, lastStep: 'Freeze parts',
    manifest: {retained: true}, manifestDigest: 'c'.repeat(64)};
  const ref = {fileId: 'private-checkpoint', digest: 'd'.repeat(64)}, before = JSON.stringify(checkpoint);
  const reply = scope.rosterEdgeExportReplyV2_(checkpoint, ref);
  assert.equal(reply.progressUnit, 'work-items', fixture.name);
  assert.equal(reply.workDone, fixture.workDone, fixture.name);
  assert.equal(reply.workTotal, fixture.workTotal, fixture.name);
  assert.equal(reply.done, fixture.ordinal + 1, 'old readers retain completed call counts');
  assert.equal(reply.total, fixture.legacyTotal, 'old readers retain their original compatible estimate');
  assert.equal(reply.step, fixture.ordinal + 1, 'call ordinal stays independent of work items');
  assert.equal(reply.preparation.ordinal, fixture.ordinal + 1);
  assert.equal(reply.preparation.checkpoint, ref);
  assert.match(reply.checkpointInputDigest,/^[a-f0-9]{64}$/);
  assert(reply.nextStep);
  assert.equal(reply.preparedParts, 2, 'only already saved parts count');
  assert.equal(reply.elapsedMs, 47000);
  assert.equal(reply.manifest, fixture.stage === 'ready' ? checkpoint.manifest : undefined);
  assert.equal(JSON.stringify(checkpoint), before, 'reporting never mutates checkpoint bytes');
}
console.log('PASS truthful preparation totals: fixed inventory, partial object/record uploads, independent ordinals, zero objects and ready manifest.');
