import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import fs from 'node:fs';import assert from 'node:assert/strict';
const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
let fetches=0;globalThis.fetch=async()=>{fetches++;throw Error('Unexpected network');};
const result=await M.trustedOperationsInput({operation:'read',view:'duties',date:'2026-10-14',calendarByDate:{evil:true}}, {}, {});
assert.equal(fetches,0);assert.deepEqual(result.calendarByDate,{});console.log('PASS R11: personal duties bypasses Calendar entirely without trusting browser Calendar data.');
