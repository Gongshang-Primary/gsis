import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import {safeHealthError,recordJobHealth,readSystemHealth} from '../shared/edge-health.js';
globalThis.crypto??=webcrypto;
function database(){const sql=new DatabaseSync(':memory:');return {sql,prepare(query){const make=(args=[])=>({bind(...next){return make(next);},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async first(){return sql.prepare(query).get(...args)||null;},async run(){return {success:true,meta:{changes:sql.prepare(query).run(...args).changes}};}});return make();},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};}
const db=database(),env={GSIS_JOBS:db},logs=[];let backend;
const source=fs.readFileSync('roster-update/public/_worker.js','utf8'),start=source.indexOf('export async function dispatchAllocationAudit('),end=source.indexOf('\nexport ',start+1);
const worker=fs.readFileSync('notification-worker/index.js','utf8');
const scope=vm.createContext({crypto,Date,safeHealthError,recordJobHealth,assertRecoveryWritable(){},serviceBackend:async(_,command)=>{assert.equal(command.operation,'allocationAuditExport');assert.equal(command.limit,1);return backend;},console:{info:s=>logs.push(JSON.parse(s)),error:s=>logs.push(JSON.parse(s))}});
vm.runInContext(source.slice(start,end).replace('export async function ','async function '),scope);vm.runInContext(worker.slice(worker.indexOf('function writable'),worker.indexOf('function settleMessages')),scope);
async function run(data){backend={ok:true,data};await scope.stage(env,'audit-export','roster-allocation-audit',()=>scope.dispatchAllocationAudit(env));return (await readSystemHealth(env,{jobsOnly:true})).jobs[0];}
let row=await run({exported:[{date:'2026-10-13',fileId:'PRIVATE_FILE',actor:'PRIVATE_STAFF'}],pending:2,failures:[]});assert.equal(row.status,'success');assert.deepEqual(row.counts,{pending:2,exported:1,failed:0});const success=row.lastSuccessAt;assert(success);
row=await run({exported:[],pending:2,failures:[],busy:true});assert.equal(row.status,'skipped');assert.equal(row.code,'AUDIT_EXPORT_BUSY');assert.equal(row.lastSuccessAt,success);
row=await run({exported:[],pending:2,failures:[],deferred:'notification-priority'});assert.equal(row.status,'skipped');assert.equal(row.code,'AUDIT_NOTIFICATION_PRIORITY');
row=await run({exported:[],pending:2,failures:[],disabled:true});assert.equal(row.status,'skipped');assert.equal(row.code,'AUDIT_LOGGING_DISABLED');
row=await run({exported:[],pending:2,failures:[{date:'2026-10-13',error:'PRIVATE_REPORT'}]});assert.equal(row.status,'failure');assert.equal(row.code,'AUDIT_EXPORT_PENDING');assert.equal(row.operation,'allocationAuditExport');assert.equal(row.counts.failed,1);assert.equal(row.counts.pending,2);
row=await run({exported:[],pending:0,failures:[]});assert.equal(row.status,'idle');assert.equal(row.lastSuccessAt,success);assert(!JSON.stringify([logs,await readSystemHealth(env,{jobsOnly:true}),db.sql.prepare('SELECT * FROM gsis_job_health').all()]).includes('PRIVATE'));
backend={ok:false,status:503,code:'BACKEND_UNAVAILABLE',operation:'allocationAuditExport',diagnosticId:'a'.repeat(32),backendVersion:'0.9.8i',error:'PRIVATE_FAILURE'};await scope.stage(env,'audit-export','roster-allocation-audit',()=>scope.dispatchAllocationAudit(env));row=(await readSystemHealth(env,{jobsOnly:true})).jobs[0];assert.equal(row.status,'failure');assert.equal(row.operation,'allocationAuditExport');assert.equal(row.diagnosticId,'a'.repeat(32));assert(!JSON.stringify(logs).includes('PRIVATE'));
let diagnosticProjections=0;const successfulRecords=[];
const successfulScope=vm.createContext({crypto,Date,safeHealthError:value=>{diagnosticProjections++;return safeHealthError(value);},recordJobHealth:async(_,value)=>successfulRecords.push(value),assertRecoveryWritable(){},console:{info(){},error(){assert.fail('Successful work must not emit a failure');}}});
vm.runInContext(worker.slice(worker.indexOf('function writable'),worker.indexOf('function settleMessages')),successfulScope);
for(const result of [undefined,{}, {sent:0}, {sent:1}])await successfulScope.stage(env,'notifications',null,async()=>result);
assert.equal(diagnosticProjections,0,'Successful results without diagnostic codes need no error projection');assert.deepEqual(successfulRecords.map(value=>value.status),['success','success','idle','success']);
console.log('PASS real audit dispatch and durable health: bounded counters, actual completion success, backlog, contention/disabled/priority, diagnostics, idle and no staff/file/error leakage');
