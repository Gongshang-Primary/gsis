'use strict';
// 0.9.9a: provider delivery times stored as digit strings show as Singapore time, not raw numbers.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8');
const format=src.match(/stampFormat=new Intl\.DateTimeFormat\([^)]*\)/)[0],fn=src.match(/function stamp\(value\)\{[^\n]*\}/)[0];
const ctx={};vm.createContext(ctx);vm.runInContext('const '+format+';'+fn,ctx);const stamp=v=>vm.runInContext('stamp('+JSON.stringify(v)+')',ctx);
const iso=stamp('2026-10-29T06:55:34+08:00');
assert.equal(stamp('1793228134000'),iso,'13-digit milliseconds');
assert.equal(stamp('1793228134'),iso,'10-digit seconds');
assert.equal(stamp(1793228134000),iso,'numeric milliseconds');
assert.doesNotMatch(stamp('1793228134000'),/^\d+$/);
assert.equal(stamp(''),'');
console.log('PASS delivery time: 13-digit ms and 10-digit s strings format as Singapore time ('+iso+')');
