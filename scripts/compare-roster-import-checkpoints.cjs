#!/usr/bin/env node
'use strict';
// Offline only. Inputs are retained checkpoint JSON and optional Drive metadata.
// Never compare global part IDs as if they were stable logical object identities.
const {readFileSync} = require('node:fs');
const {createHash} = require('node:crypto');
const {basename} = require('node:path');
const assert = (condition, message) => { if (!condition) throw Error(message); };
const keyOf = job => JSON.stringify([job.kind, job.id]);
const datesOf = id => [...new Set(id.match(/\d{4}-\d{2}-\d{2}/g) || [])];
const percent = (n, total) => total ? Math.round(n / total * 10000) / 100 : null;

function indexCheckpoint(checkpoint) {
  assert(checkpoint?.schema === 'gsis-roster-export-v2', 'unsupported checkpoint schema');
  assert(Array.isArray(checkpoint.parts) && Array.isArray(checkpoint.references)
    && Array.isArray(checkpoint.catalogue?.jobs), 'missing checkpoint inventory');
  const parts = new Map(), objects = new Map(), ids = new Set(), scopeIndex = new Map();
  const catalogue = new Set(checkpoint.catalogue.jobs.map(keyOf));
  let pending = [], objectIndex = 0, sawRecords = false;
  for (const part of checkpoint.parts) {
    assert(typeof part.id === 'string' && !ids.has(part.id), 'duplicate part ID');
    ids.add(part.id);
    assert(/^[a-f0-9]{64}$/.test(part.digest) && Number.isSafeInteger(part.bytes)
      && part.bytes >= 0, 'invalid part digest or byte count');
    if (part.kind === 'segment' || part.kind === 'object') {
      assert(!sawRecords, 'unsupported object after record parts');
      pending.push(part);
      if (part.kind !== 'object') continue;
      const reference = checkpoint.references[objectIndex++];
      assert(reference?.job && /^[a-f0-9]{64}$/.test(reference.reference?.digest),
        'missing object references');
      const job = reference.job, objectKey = keyOf(job);
      assert(catalogue.has(objectKey) && !objects.has(objectKey), 'invalid object identity');
      assert(keyOf(checkpoint.catalogue.jobs[objectIndex - 1]) === objectKey,
        'object references do not follow the catalogue');
      objects.set(objectKey, {job, digest: reference.reference.digest});
      pending.forEach((value, index) => parts.set(JSON.stringify([objectKey, value.kind,
        value.kind === 'object' ? 0 : index]), {part: value, job, objectKey}));
      pending = [];
    } else {
      assert(part.kind === 'records' && typeof part.scope === 'string', 'unsupported record part');
      assert(!pending.length, 'unfinished object parts');
      sawRecords = true;
      const index = scopeIndex.get(part.scope) || 0;
      scopeIndex.set(part.scope, index + 1);
      // Record chunks are positional within a scope, not stable record identities.
      parts.set(JSON.stringify(['records', part.scope, index]), {part, objectKey: null});
    }
  }
  assert(!pending.length && objectIndex === checkpoint.references.length,
    'incomplete object references');
  return {parts, objects, catalogue, stage: checkpoint.stage};
}

function describe(entry) {
  const {part, job} = entry;
  return {kind: part.kind, scope: job ? job.kind === 'baseline' ? 'roster-register' : 'roster' : part.scope,
    objectKind: job?.kind || null, objectId: job?.id || null,
    collection: job?.path?.[1] || null, dates: datesOf(job?.id || '')};
}

function uncompared(left, right) {
  const result = {parts: 0, bytes: 0, notPrepared: 0, jobAbsent: 0, differentShape: 0, details: []};
  for (const [key, entry] of left.parts) {
    if (right.parts.has(key)) continue;
    const category = entry.objectKey
      ? !right.catalogue.has(entry.objectKey) ? 'jobAbsent'
        : !right.objects.has(entry.objectKey) ? 'notPrepared' : 'differentShape'
      : right.stage !== 'ready' ? 'notPrepared' : 'differentShape';
    result.parts++; result.bytes += entry.part.bytes; result[category]++;
    result.details.push({...describe(entry), partId: entry.part.id, bytes: entry.part.bytes, category});
  }
  return result;
}

function compareCheckpoints(before, after) {
  const left = indexCheckpoint(before), right = indexCheckpoint(after);
  const transport = {compared: 0, identical: 0, changed: 0,
    changedBytesBefore: 0, changedBytesAfter: 0, changedBytesDelta: 0, changePercent: null};
  const objects = {compared: 0, identical: 0, changed: 0, changes: []};
  const changes = [];
  let metadataOnlyAssemblyChanges = 0;
  for (const [key, entry] of left.parts) {
    const next = right.parts.get(key);
    if (!next) continue;
    transport.compared++;
    if (entry.part.digest === next.part.digest) {
      assert(entry.part.bytes === next.part.bytes, 'same digest has different byte counts');
      transport.identical++; continue;
    }
    transport.changed++;
    transport.changedBytesBefore += entry.part.bytes;
    transport.changedBytesAfter += next.part.bytes;
    if (entry.part.kind === 'object' && left.objects.get(entry.objectKey).digest
      === right.objects.get(entry.objectKey).digest) metadataOnlyAssemblyChanges++;
    changes.push({...describe(entry), beforeId: entry.part.id, afterId: next.part.id,
      beforeBytes: entry.part.bytes, afterBytes: next.part.bytes});
  }
  for (const [key, value] of left.objects) {
    const next = right.objects.get(key);
    if (!next) continue;
    objects.compared++;
    if (value.digest === next.digest) objects.identical++;
    else { objects.changed++; objects.changes.push({kind: value.job.kind,
      id: value.job.id, collection: value.job.path?.[1], dates: datesOf(value.job.id)}); }
  }
  transport.changedBytesDelta = transport.changedBytesAfter - transport.changedBytesBefore;
  transport.changePercent = percent(transport.changed, transport.compared);
  return {transport, objects, metadataOnlyAssemblyChanges, changes,
    uncomparedBefore: uncompared(left, right), uncomparedAfter: uncompared(right, left)};
}

function main(args) {
  let inventory = [];
  if (args[0] === '--inventory') {
    assert(args[1], 'missing inventory file');
    inventory = JSON.parse(readFileSync(args[1], 'utf8')); args = args.slice(2);
    assert(Array.isArray(inventory), 'inventory must be an array');
  }
  assert(args.length >= 2, 'usage: compare-roster-import-checkpoints.cjs [--inventory metadata.json] older.json newer.json [...]');
  const inputs = args.map(file => {
    const raw = readFileSync(file), checkpoint = JSON.parse(raw);
    indexCheckpoint(checkpoint);
    const metadata = inventory.find(row => row.id === checkpoint.source?.fileId);
    return {checkpoint, summary: {file: basename(file), sessionId: checkpoint.sessionId,
      sha256: createHash('sha256').update(raw).digest('hex'), ordinal: checkpoint.ordinal,
      completedStepCount: checkpoint.ordinal + 1, stage: checkpoint.stage,
      parts: checkpoint.parts.length, bytes: checkpoint.parts.reduce((n, part) => n + part.bytes, 0),
      objects: checkpoint.references.length, sourceFileId: checkpoint.source?.fileId,
      sourceFileCreatedAt: metadata?.createdTime || null,
      checkpointFinishedAt: new Date(checkpoint.timing.finishedAt).toISOString()}};
  });
  const comparisons = [];
  for (let a = 0; a < inputs.length; a++) for (let b = a + 1; b < inputs.length; b++) {
    const before = inputs[a], after = inputs[b];
    comparisons.push({before: before.summary.file, after: after.summary.file,
      sourceFileGapMs: before.summary.sourceFileCreatedAt && after.summary.sourceFileCreatedAt
        ? Date.parse(after.summary.sourceFileCreatedAt) - Date.parse(before.summary.sourceFileCreatedAt) : null,
      checkpointFinishedGapMs: Date.parse(after.summary.checkpointFinishedAt) - Date.parse(before.summary.checkpointFinishedAt),
      ...compareCheckpoints(before.checkpoint, after.checkpoint)});
  }
  console.log(JSON.stringify({inputs: inputs.map(value => value.summary), comparisons}, null, 2));
}

module.exports = {compareCheckpoints};
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch { console.error('Checkpoint comparison failed. Check input files and checkpoint shape.'); process.exitCode = 1; }
}
