'use strict';

const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const harness = require('./fixtures/roster099-packed-capture.cjs');
const Store = require('../shared/edge-store.js');
const h = harness();
let first, failure;
try { first = h.call(h.input); } catch (error) { failure = error; }
assert.equal(h.stats().decodes, 0, 'capture must never inflate any of the 10 stored plans, 9 archives or compressed audit evidence');
if (failure) throw failure;
assert(first.preparing);
assert.equal(h.stats().captures, 1);
const source = [...h.files.values()].find(file => file.name.endsWith('source.json'));
assert(source, 'capture uploads the frozen source');
assert(source.bytes.length <= h.packedBytes * 1.5, 'capture bytes stay within 1.5 times the packed operations file');
const envelope = JSON.parse(source.bytes);
assert.equal(envelope.snapshot.state.staplerPlans.length, 10);
assert.equal(envelope.snapshot.state.staplerArchives.length, 9);
assert.equal(envelope.snapshot.state.staplerPlans[0].draft.encoding, 'gzip-base64-v1');
assert.equal(envelope.snapshot.state.optimisationRuns[0].decisionEvidence.encoding, 'gzip-audit-v1');
assert.equal(h.writes.find(write => write.name.endsWith('source.json')).locks, 0);
assert(h.calls[0].elapsed < 120000, 'capture stays below the simulated two-minute budget');

let response = first, polls = 0;
while (response.preparing) {
  assert(++polls < 250, 'production-shaped import completes in bounded polls');
  response = h.call({...h.input, preparation: response.preparation});
  assert(h.calls.at(-1).decodes <= 1, 'one preparation call expands at most its selected dated plan');
  if(response.phase==='Freeze parts')assert.equal(h.calls.at(-1).decodes,0,'freezing cached parts never reopens a stored plan');
  assert(h.calls.at(-1).elapsed < 120000, 'every preparation call stays below the simulated two-minute budget');
}
assert(response.manifest);
const parts = response.manifest.parts.map(part => h.call({operation: 'edgeExportPart', requestId: h.input.requestId,
  partId: part.id, preparation: response.preparation}).payload);
const rows = parts.flatMap((payload, i) => response.manifest.parts[i].kind === 'records'
  ? JSON.parse(payload).rows.map(row => ({...row, scope: response.manifest.parts[i].scope})) : []);
const state = Store.decode(rows.filter(row => row.scope === 'roster'));
assert.equal(state.staplerPlans.length, 10);
assert.equal(state.staplerArchives.length, 9);
for (const row of [...state.staplerPlans, ...state.staplerArchives]) {
  for (const field of ['draft', 'published', 'confirmedPlan']) {
    assert.equal(row[field].edgeObject, true, 'shared stored aliases also become usable immutable plan references');
    assert.equal(row[field].encoding, 'gzip-json-v1');
    assert.equal(row[field].digest, row.draft.digest, 'draft, published and confirmed aliases retain identical plan bytes');
  }
}
assert.deepEqual(state.optimisationRuns[0].decisionEvidence, h.packed.optimisationRuns[0].decisionEvidence,
  'the records batch preserves compressed allocation evidence without expanding it');
const firstReference = state.staplerPlans[0].draft;
assert.equal(firstReference.edgeObject, true);
const object = parts.map(payload => JSON.parse(payload)).find(value => value.reference?.key === firstReference.key);
assert(object, 'the expanded native Stapler plan is stored as an immutable object');
const segments = object.segments.map(id => JSON.parse(parts[response.manifest.parts.findIndex(part => part.id === id)]).base64);
const plan = JSON.parse(zlib.gunzipSync(Buffer.concat(segments.map(value => Buffer.from(value, 'base64')))));
assert.deepEqual(plan, JSON.parse(zlib.gunzipSync(Buffer.from(h.packed.staplerPlans[0].draft.data, 'base64'))),
  'object preparation expands the complete stored plan without changing it');
assert.equal(plan.date, h.packed.staplerPlans[0].date);
assert.equal(plan.teachers.length, 150);
assert.equal(plan.tiles.length, 150 * 17);
assert.equal(h.stats().captures, 1, 'later batches never recapture live state');

const broken = harness({uploadFailure: true});
assert.throws(() => broken.call(broken.input), /Drive upload unavailable/);
const descriptor = JSON.parse([...broken.properties.entries()].find(([key]) => key.startsWith('ROSTER_EDGE_EXPORT:'))[1]);
assert.equal(descriptor.failureReason.status, 503);
assert.match(descriptor.failureReason.message, /Drive upload unavailable/);
assert.equal(typeof descriptor.failureReason.phase, 'string');
assert(descriptor.failureReason.phase.length > 0);
assert.equal(typeof descriptor.failureReason.elapsed, 'number');
assert.equal(broken.stats().locks, 0);
const killed = harness({killPhase: 'Serialize packed source'});
assert.throws(() => killed.call(killed.input), error => error.simulatedTermination);
const retained = JSON.parse([...killed.properties.entries()].find(([key]) => key.startsWith('ROSTER_EDGE_EXPORT:'))[1]);
assert.equal(retained.lastPhase, 'Serialize packed source', 'hard termination retains the last durable phase marker');
assert.equal(retained.failureReason, undefined, 'the killed execution cannot write a fabricated caught error');
killed.advance();
const failed = killed.call(killed.input);
assert.equal(failed.requiresRestart, true);
assert.equal(failed.failureReason.phase, 'Serialize packed source', 'lease recovery reports the phase that actually stopped');
assert.match(failed.failureReason.message, /frozen source is incomplete/i);
assert.equal(killed.stats().captures, 1, 'a killed capture never reads changed live data under the old identity');
console.log(JSON.stringify({check: 'packed production-shaped capture', plans: 10, archives: 9, teachers: 150,
  packedBytes: h.packedBytes, sourceBytes: source.bytes.length, captureMs: h.calls[0].elapsed,
  polls, maxCallMs: Math.max(...h.calls.map(call => call.elapsed)), captureDecodes: h.calls[0].decodes, simulated: true}));
