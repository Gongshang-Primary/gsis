import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import bundleTools from '../scripts/bundle-worker.cjs';
globalThis.crypto??=webcrypto;
const entry=await import('data:text/javascript;base64,'+Buffer.from(bundleTools.bundle('notification-worker/dashboard-entry.js')).toString('base64'));
const calls=[],logs=[],work=[],env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/audit-fixture/exec',ROSTER_SERVICE_SECRET:'synthetic-audit-service-'.repeat(3),ROSTER_EDGE_AUTHORITY:'d1',GSIS_BACKGROUND_JOBS:'true',GSIS_BACKEND:{fetch(){assert.fail('Production recovery must never use the isolated migration backend');}},NOTIFICATION_QUEUE:{send(){assert.fail('Export cannot wake sends');}}};
const originalFetch=globalThis.fetch,info=console.info,error=console.error;
globalThis.fetch=async(url,options)=>{assert.equal(String(url),env.APPS_SCRIPT_URL);const envelope=JSON.parse(options.body);assert.equal(envelope.signature,createHmac('sha256',env.ROSTER_SERVICE_SECRET).update(envelope.payload).digest('hex'));const request=JSON.parse(envelope.payload);assert.equal(request.action,'rosterService');assert.equal(request.service,'gsis-roster-notifier-v1');assert.deepEqual(request.input,{operation:'allocationAuditExport',limit:1});calls.push(request.input.operation);return Response.json({ok:true,data:{exported:[{date:'2026-10-13',fileId:'PRIVATE_FILE'}],pending:4,failures:[]}});};
console.info=console.error=value=>logs.push(JSON.parse(value));
try{await entry.default.scheduled({cron:'2-57/5 * * * *',scheduledTime:Date.parse('2026-10-27T00:02:00Z')},env,{waitUntil:p=>work.push(p)});await Promise.all(work);assert.deepEqual(calls,['allocationAuditExport']);assert.equal(logs.length,1);assert.equal(logs[0].event,'roster-allocation-audit');assert.equal(logs[0].exported,1);assert.equal(logs[0].pending,4);assert(!JSON.stringify(logs).includes('PRIVATE'));assert.equal(env.ROSTER_EDGE_AUTHORITY,'d1','caller config is not mutated');}finally{globalThis.fetch=originalFetch;console.info=info;console.error=error;}
console.log('PASS packaged notifier audit-only trigger: one bounded signed Google call, recovery routing, no notifications or raw file details');
