'use strict';
process.env.TZ='Asia/Singapore';
const assert=require('node:assert/strict');
const {makeHarness}=require('./calendar/backend_harness.cjs');

// The live health action retains every check after retiring the versioned chain.
const h=makeHarness(),before=JSON.stringify([...h.sheets].map(([name,s])=>[name,s.values]));
const result=h.sandbox.runCalendarSelfTests();
assert.equal(result.total,31);
assert.equal(result.passed,31);
assert.equal(result.failed,0);
assert.equal(result.ok,true);
assert.equal(new Set(result.tests.map(t=>t.name)).size,31);
assert.equal(result.version,h.spec.VERSION);
assert.equal(h.spec.VERSION,'v2 RC1.9','existing workbook schema must not migrate');
assert.equal(JSON.stringify([...h.sheets].map(([name,s])=>[name,s.values])),before);
assert.equal(h.audit.apiWrites.length,0);
assert.equal(h.audit.writes,0);

// A failed check is reported while later checks still execute.
h.sandbox.inclusiveDays_=()=>0;
const failed=h.sandbox.runCalendarSelfTests();
assert.equal(failed.total,31);
assert.equal(failed.failed,1);
assert.equal(failed.passed,30);
assert.equal(failed.ok,false);
assert.equal(failed.tests[0].ok,false);
assert.equal(failed.tests.at(-1).ok,true);

// Browser/API health uses the same complete runner and retains access control.
const api=makeHarness(),report=api.call('runSelfTests');
assert.equal(report.total,31);
assert.equal(report.failed,0);
assert.throws(()=>api.call('runSelfTests',{},'teacher'),/Administrator/);
assert.equal(api.sheets.get('AuditLog').values.at(-1)[3],'RUN_SELF_TESTS');
for(const name of ['upgradeCalendarV2ToRC0_85','upgradeCalendarV2ToRC0_87',
  'upgradeCalendarV2ToRC0_88','upgradeCalendarV2ToRC0_89','upgradeCalendarV2ToRC1_0',
  'upgradeCalendarV2ToRC1_1','upgradeCalendarV2ToRC1_5','upgradeCalendarToRC17',
  'runRC1_5SelfTests','runRC1_7SelfTests','runRC1_9SelfTests'])assert.equal(typeof api.sandbox[name],'undefined',name);
assert.equal(typeof api.sandbox.setupCalendarV2Workbook,'function');
assert.equal(typeof api.sandbox.upgradeCalendarToRC19,'function');
console.log('Calendar cleanup: all 31 diagnostics, error aggregation, access control and unchanged schema passed');
