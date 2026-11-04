'use strict';
const assert = require('node:assert/strict');
const {compareCheckpoints} = require('../scripts/compare-roster-import-checkpoints.cjs');

// These checks fail if global ordinal IDs are treated as stable object identities,
// or an unfinished session's missing work is counted as a source change.
const digest = digit => digit.repeat(64);
function checkpoint(prefix, jobs, ready = false) {
  const parts = [], references = [];
  for (const [i, {id, hash = 'a', bytes = 10}] of jobs.entries()) {
    const job = {kind: 'stapler', id, path: ['state', 'staplerPlans', i, 'draft']};
    parts.push({id: `part-${prefix + i * 2}`, kind: 'segment', scope: '', bytes,
      digest: digest(hash)});
    parts.push({id: `part-${prefix + i * 2 + 1}`, kind: 'object', scope: '', bytes: 5,
      digest: digest(prefix === 0 ? hash : 'd')});
    references.push({job, reference: {digest: digest(hash)}});
  }
  return {schema: 'gsis-roster-export-v2', sessionId: digest('1'), ordinal: 2,
    stage: ready ? 'ready' : 'objects', parts, references,
    catalogue: {jobs: references.map(x => x.job)}, jobIndex: references.length};
}
const a = checkpoint(0, [{id: '2026-11-02/draft'}, {id: '2026-11-03/draft'}]);
const b = checkpoint(10, [{id: '2026-11-02/draft'}, {id: '2026-11-03/draft', hash: 'b', bytes: 12}]);
const result = compareCheckpoints(a, b);
assert.deepEqual(result.transport, {
  compared: 4, identical: 1, changed: 3,
  changedBytesBefore: 20, changedBytesAfter: 22, changedBytesDelta: 2,
  changePercent: 75,
});
assert.equal(result.objects.compared, 2);
assert.equal(result.objects.identical, 1);
assert.equal(result.objects.changed, 1);
assert.deepEqual(result.objects.changes.map(x => x.dates), [['2026-11-03']]);
assert.equal(result.metadataOnlyAssemblyChanges, 1);

const partial = checkpoint(0, [{id: '2026-11-02/draft'}]);
partial.catalogue.jobs.push(a.catalogue.jobs[1]);
const coverage = compareCheckpoints(partial, a);
assert.equal(coverage.transport.compared, 2);
assert.equal(coverage.transport.changed, 0);
assert.equal(coverage.uncomparedAfter.notPrepared, 2);
assert.equal(coverage.uncomparedAfter.jobAbsent, 0);

const added = compareCheckpoints(partial, checkpoint(0, [{id: '2026-11-04/draft'}]));
assert.equal(added.transport.compared, 0);
assert.equal(added.transport.changePercent, null);
assert.equal(added.uncomparedAfter.jobAbsent, 2);

const full = checkpoint(0, [{id: '2026-11-02/draft'}], true);
full.parts.push({id: 'part-2', kind: 'records', scope: 'roster', bytes: 50, digest: digest('f')});
assert.equal(compareCheckpoints(partial, full).uncomparedAfter.notPrepared, 1);
assert.throws(() => compareCheckpoints({...a, parts: [...a.parts, a.parts[0]]}, b), /duplicate part/);
assert.throws(() => compareCheckpoints({...a, references: []}, b), /object references/);
const inconsistent = structuredClone(a);
inconsistent.parts[0].bytes++;
assert.throws(() => compareCheckpoints(a, inconsistent), /same digest has different byte counts/);
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawnSync} = require('node:child_process');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-checkpoint-comparison-'));
try {
  const first = path.join(directory, 'first.json'), second = path.join(directory, 'second.json');
  const left = {...a, actor: 'private-actor@example.test', source: {fileId: 'source-a'},
    timing: {finishedAt: 1000}};
  const right = {...b, source: {fileId: 'source-b'}, timing: {finishedAt: 2000}};
  fs.writeFileSync(first, JSON.stringify(left)); fs.writeFileSync(second, JSON.stringify(right));
  const beforeBytes = fs.readFileSync(first);
  const run = spawnSync(process.execPath,
    [path.join(__dirname, '../scripts/compare-roster-import-checkpoints.cjs'), first, second],
    {encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).comparisons[0].transport.changed, 3);
  assert.ok(!run.stdout.includes('private-actor'));
  assert.deepEqual(fs.readFileSync(first), beforeBytes);
  fs.writeFileSync(second, 'PRIVATE_MALFORMED_INPUT');
  const invalid = spawnSync(process.execPath,
    [path.join(__dirname, '../scripts/compare-roster-import-checkpoints.cjs'), first, second],
    {encoding: 'utf8'});
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stderr, 'Checkpoint comparison failed. Check input files and checkpoint shape.\n');
} finally { fs.rmSync(directory, {recursive: true, force: true}); }
console.log('Roster checkpoint comparison: logical identity, changed bytes, partial coverage, read-only CLI and private-error handling passed');
