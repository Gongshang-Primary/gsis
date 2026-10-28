'use strict';
const assert=require('node:assert/strict'),h=require('./roster701-adapter.cjs')(),s=h.state(),key=()=>h.scope.rosterOperationsAllocationChangeKey_(s,'day-token');
const initial=key();s.outbox.push({id:'notice'});s.audit.push({id:'log'});s.revision++;assert.equal(key(),initial,'delivery bookkeeping does not force allocation reload');
s.assignments.push({id:'other-day',staffId:'bob',date:'2026-10-15',period:2,rCost:1,status:'published'});assert.notEqual(key(),initial,'other date can change weekly R');
const before=key();s.entitlements.push({staffId:'bob',quota:2,week:'2026-10-12',year:2026});assert.notEqual(key(),before,'quota evidence changes capacity');
console.log('PASS cross-date balances invalidate allocation without noisy delivery bookkeeping');
