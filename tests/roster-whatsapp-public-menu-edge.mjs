import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {GSISRosterOperations as O,GSISRoster as R} from '../roster-update/public/edge-roster-domain.js';
import {edgeRosterBackend,edgeRosterService,loadEdgeRoster,mutateEdgeRoster,edgeRosterClock} from '../roster-update/public/edge-roster.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';

import {edgeNotificationService} from '../roster-update/public/edge-notifications.js';
import {sign,whatsappWebhook,dispatchWebhookJobs,WEBHOOK_SCHEMA_SQL} from '../roster-update/public/_worker.js';
function database(){const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');let hook=null;const prepare=text=>({text,args:[],bind(...args){return {...this,args};},async first(){return sql.prepare(this.text).get(...this.args)||null;},async all(){return {success:true,results:sql.prepare(this.text).all(...this.args),meta:{changes:0}};},async run(){const result=sql.prepare(this.text).run(...this.args);return {success:true,results:[],meta:{changes:Number(result.changes)}};}});const db={sql,prepare,withSession(){return this;},async batch(statements){if(hook&&statements[0].text.startsWith('UPDATE gsis_edge_heads SET revision=revision+1,mode=')){const fn=hook;hook=null;await fn();}sql.exec('BEGIN');try{const values=statements.map(s=>{const q=sql.prepare(s.text);if(/^\s*(SELECT|WITH)/.test(s.text)||/\bRETURNING\b/i.test(s.text))return {success:true,results:q.all(...s.args),meta:{changes:0}};const result=q.run(...s.args);return {success:true,results:[],meta:{changes:Number(result.changes)}};});sql.exec('COMMIT');return values;}catch(error){sql.exec('ROLLBACK');throw error;}},onCommit(fn){hook=fn;}};return db;}
async function activate(db,scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'setup',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'setup',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}

const db=database(),objects=new Map(),bucket={async put(k,v){objects.set(k,new Uint8Array(v));},async get(k){const v=objects.get(k);return v?{body:new Blob([v]).stream(),text:async()=>new TextDecoder().decode(v)}:null;}};
const today=edgeRosterClock().today;let day=new Date(Date.parse(today)+86400000).toISOString().slice(0,10);while([0,6].includes(new Date(day).getUTCDay()))day=new Date(Date.parse(day)+86400000).toISOString().slice(0,10);
const people=['alice','bob','charlie'].map(id=>({id,name:id,active:id!=='alice',email:id+'@gsps.edu.sg',emails:[id+'@gsps.edu.sg'],groups:['Teaching'],role:'Teacher',mobile:'65'+({alice:'91234567',bob:'92345678',charlie:'93456789'})[id],employment:'Permanent'})),who={email:people[0].email,subject:'alice'},smc={email:people[1].email,subject:'bob'};
const refs={schema:1,contacts:{rosterPeople:people,rosterSMCIds:['bob'],rosterAdminIds:['bob'],rosterUrgentSMCIds:[]},contactsCheckedAt:Date.now(),calendarCheckedAt:Date.now(),calendarByDate:{[day]:{date:day,schoolDay:true,parity:'single',available:true}}};
const model=R.validate({layoutMode:'single-week',single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:people.map(p=>({name:p.name,cells:Array.from({length:85},()=>['','','',''])}))},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[]}),json=JSON.stringify(model),modelKey='baseline';await bucket.put(modelKey,await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_TIMETABLE_SNAPSHOTS:bucket,APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',WHATSAPP_ENABLED:'false'};
const store=await activate(db,'roster',O.initial());await activate(db,'roster-register',{revision:1,entries:[{id:'baseline',name:'test',from:today,to:'2099-12-31',priority:1,modelObject:{key:modelKey,digest:sha256Hex(json),encoding:'gzip-json-v1'}}],receipts:[]});await activate(db,'roster-references',refs);
globalThis.fetch=()=>assert.fail('D1 intake must not call Google');
async function send(input,actor=who){const response=(await edgeRosterBackend(env,'rosterOperations',input,actor,'test')).result;if(!response.ok)throw Object.assign(Error(response.error),response);return response.data;}
const command=extra=>({operation:'saveAbsence',intake:true,requestId:crypto.randomUUID(),date:day,staffId:'alice',typeId:'others',reasonDetail:'Work review',periods:[5,6],reliefRequired:false,receiptOnly:true,...extra});


async function inbound(extra){return edgeNotificationService(env,{operation:'inboundMessage',inboxMode:true,messageId:'wamid.'+crypto.randomUUID(),from:'6581111111',timestamp:Date.now(),type:'text',text:'Hello',...extra});}
assert.equal((await inbound({})).reply.action,'menu');
assert.equal((await inbound({type:'interactive',selection:'gsis_report_absence'})).reply.action,'report-absence');
assert.equal((await inbound({type:'interactive',selection:'gsis_urgent'})).reply.action,'unknown');
const from=people[0].mobile;assert.equal((await inbound({from,type:'interactive',selection:'gsis_urgent'})).reply.action,'urgent-prompt');
const messageId='wamid.'+crypto.randomUUID(),result=await inbound({from,messageId,text:'Inactive relief sender request'});assert(['urgent-confirm','urgent-no-recipient'].includes(result.reply.action));
const snapshot=JSON.stringify((await loadEdgeRoster(env)).state);assert((await inbound({from,messageId,text:'Inactive relief sender request'})).duplicate);assert.equal(JSON.stringify((await loadEdgeRoster(env)).state),snapshot);
console.log('PASS real D1 notification service exposes public menu and gates urgent requests, including inactive sender and durable duplicate replay; no external calls');

// Exercise the public Meta webhook through the actual D1 adapter, with only Meta mocked.
db.sql.exec(WEBHOOK_SCHEMA_SQL);
Object.assign(env,{WHATSAPP_DURABLE_INGRESS:'true',WHATSAPP_ENABLED:'true',WHATSAPP_MENU_ENABLED:'true',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_ACCESS_TOKEN:'fixture-access-'.repeat(8),WHATSAPP_APP_SECRET:'fixture-app-'.repeat(8),GSIS_SECRET:'fixture-service-'.repeat(8)});
const sent=[];globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://graph.facebook.com/v23.0/123456789/messages','no Google fallback');const state=(await loadEdgeRoster(env,{includeInbox:true})).state;assert(state.inboxMessages.some(row=>row.direction==='inbound'),'Inbox capture precedes automatic reply');sent.push(JSON.parse(options.body));return Response.json({messages:[{id:'wamid.reply-'+sent.length}]});};
const message={id:'wamid.public-webhook',from:'6581111111',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'Hello'}};
async function webhook(value){const event={object:'whatsapp_business_account',entry:[{id:env.WHATSAPP_ACCOUNT_ID,changes:[{field:'messages',value:{metadata:{phone_number_id:env.WHATSAPP_PHONE_NUMBER_ID},messages:[value]}}]}]},signed=await sign(event,env.WHATSAPP_APP_SECRET);return whatsappWebhook(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/whatsapp/webhook',{method:'POST',headers:{'X-Hub-Signature-256':'sha256='+signed.signature},body:signed.payload}),env);}
const response=await webhook(message);assert.equal(response.status,200,await response.text());assert.equal(sent.length,0,'acknowledgement precedes the scheduled drain');const drained=await dispatchWebhookJobs(env);assert.equal(drained.completed,1,JSON.stringify(drained));assert.equal(sent.length,1);assert.match(sent[0].interactive.body.text,/This number is no longer actively manned/);assert.equal(sent[0].interactive.action.sections[0].rows.length,5);
assert.equal((await webhook(message)).status,200);assert.equal((await dispatchWebhookJobs(env)).claimed,0);assert.equal(sent.length,1,'Meta redelivery does not resend the menu');
console.log('PASS signed WhatsApp webhook -> durable D1 Inbox -> public menu; provider mocked and duplicate reply suppressed');
