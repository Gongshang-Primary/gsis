#!/usr/bin/env node
'use strict';

// Offline comparison only. Loads real Apps Script source in the existing VM
// harness; no network, production service or project-source writes.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');

const scratch = path.resolve(__dirname, '..');
const baselineRoot = path.resolve(process.argv[2] || path.join(__dirname,'baselines/v1.6'));
const candidateRoot = path.resolve(process.argv[3] || scratch);
const reportPath = path.resolve(process.argv[4] || path.join(__dirname, 'v17_operations_results.json'));
const { harness, request } = require('./backend_harness.cjs');
const baseline = fs.readFileSync(path.join(baselineRoot, 'Source/backend/Code.gs'), 'utf8');
const candidate = fs.readFileSync(path.join(candidateRoot, 'Source/backend/Code.gs'), 'utf8');
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

function stats(h) {
  return {
    cellsRead: h.reads.reduce((sum, range) => sum + range.n * range.w, 0),
    rangeReads: h.reads.length,
    dateConversions: h.dateFormats,
    writeLocks: h.locks,
    propertySnapshots: h.snapshots,
    sheetWrites: h.writes.length,
    atomicBatches: h.batches.length
  };
}

function seeded(source, selected = 12) {
  // Use the same synthetic peppers on both sides of this behavioral comparison.
  // The archived file and its provenance remain unchanged; only its sanitized
  // in-memory configuration literals are mapped to the current fixture.
  const settings = require('./backend_config_fixture.cjs');
  let fixtureSource = source;
  for (const key of ['BOOKING_TOKEN_PEPPER', 'BOOKING_CODE_PEPPER']) {
    const literal = new RegExp("(^\\s*"+key+":\\s*)(['\"])REPLACE_"+key+"\\2", 'm');
    fixtureSource = fixtureSource.replace(literal, (_, prefix) => prefix+JSON.stringify(settings['LORD_'+key]));
  }
  const h = harness({ source: fixtureSource });
  const c = h.ctx;
  for (let i = 0; i < 1500; i++) {
    const relevant = i >= 1500 - selected;
    const day = relevant ? '2026-10-18' : '2026-09-' + String(i % 28 + 1).padStart(2, '0');
    const booking = Array(c.BOOKING_HEADERS.length).fill('');
    Object.assign(booking, {
      0: 'B-' + i, 1: 'BOOKED', 2: 'Staff', 3: 'staff@gsps.edu.sg',
      4: '5A', 5: 'SCI', 6: new h.Clock(day + 'T00:00:00+08:00'),
      7: 'Cart A', 8: 'Tablet', 9: 14, 10: '1', 11: '1',
      12: true, 13: false, 14: 'Keep the final schedule column ' + i,
      24: 'staff-sub', 25: 'staff@gsps.edu.sg', 26: 'Staff',
      27: 'admin-sub', 28: 'admin@gsps.edu.sg', 29: 'Admin'
    });
    h.sheets.Bookings.data.push(booking);
    const session = Array(c.SESSION_HEADERS.length).fill('');
    Object.assign(session, {
      0: 'S-' + i, 1: relevant ? 'OPEN' : 'RETURNED', 2: 'Staff',
      4: '5A', 5: 'SCI', 6: 'Cart A',
      7: new h.Clock(day + 'T08:00:00+08:00'),
      9: 1, 10: 14, 12: 'Loan comment ' + i,
      26: true, 27: true, 28: 13, 31: 12,
      34: relevant ? '' : 13, 38: relevant ? '' : 12
    });
    h.sheets[c.LORD_CONFIG.SHEETS.SESSIONS].data.push(session);
  }
  return h;
}

function readProbe(source, params, selected) {
  const h = seeded(source, selected);
  const response = h.get(params);
  assert.equal(response.ok, true, response.error);
  assert.equal(h.writes.length + h.batches.length + h.photos.length + h.sends.length, 0);
  return { response, stats: stats(h) };
}

function batchProbe(source) {
  // All historical dates precede these twenty distinct dates, so the fixture
  // exercises all conflict scans without an invalid overlap or buffer override.
  const h = seeded(source, 0);
  const response = h.post(request({
    action: 'bookingCreateBatch',
    bookings: Array.from({ length: 20 }, (_, i) => ({ date: '2026-11-' + String(i + 1).padStart(2, '0') }))
  }));
  assert.equal(response.ok, true, response.error);
  assert.equal(response.result.count, 20);
  assert.equal(h.batches.length, 1, 'The batch must retain one authoritative Sheets commit');
  assert.equal(h.locks, 1, 'The authoritative write remains protected by one ScriptLock');
  assert.equal(h.sheets.Bookings.data.length, 1521);
  return { response, stats: stats(h) };
}

const report = {
  scope: 'Offline v1.6 versus current v1.7 source. Operation counts, not live latency.',
  sourceHashes: { baseline: sha256(baseline), candidate: sha256(candidate) },
  fixture: { historicalRows: 1500, selectedRows: 12, historicalDates: 28 },
  checks: []
};

function compare(name, before, after, changedMetric) {
  assert.deepEqual(after.response, before.response, name + ': complete response changed');
  assert(after.stats[changedMetric] < before.stats[changedMetric], name + ': no measured reduction');
  assert(after.stats.cellsRead <= before.stats.cellsRead, name + ': read transfer grew');
  report.checks.push({ name, completeResponseEqual: true, before: before.stats, after: after.stats });
}

const reads = [
  { action: 'bookingDaySchedule', date: '2026-10-18' },
  { action: 'bookingAvailability', date: '2026-10-18', resource: 'Cart A', startPeriod: '2', endPeriod: '2' },
  { action: 'openSessions' }
];
for (const params of reads) {
  compare(params.action + ' populated', readProbe(baseline, params, 12), readProbe(candidate, params, 12), 'cellsRead');
  compare(params.action + ' no selected records', readProbe(baseline, params, 0), readProbe(candidate, params, 0), 'cellsRead');
}
// Approved v1.8 adds CES to the masked notification summary. Compare the remaining public result exactly.
const batchBefore=batchProbe(baseline),batchAfter=batchProbe(candidate);
for(const result of batchAfter.response.result.bookings){assert(result.maskedEmail.includes('@schools.gov.sg'));result.maskedEmail=result.maskedEmail.split(' and ')[0];}
compare('20-item booking batch (CES summary checked separately)',batchBefore,batchAfter,'dateConversions');
report.passed = report.checks.length;
report.failed = 0;
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
