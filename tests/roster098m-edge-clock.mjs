import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import vm from 'node:vm';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {GSISRosterOperations as O} from '../roster-update/public/edge-roster-domain.js';
import {mutateEdgeRoster,loadEdgeRoster} from '../roster-update/public/edge-roster.js';
import {createDeployDomain} from '../roster-update/public/edge-deploy-domain.js';
import {sha256Bytes} from '../roster-update/public/edge-deploy-sha256.js';

// Regression: receipt storage can await beyond the gateway's first clock check.
// Use the same native SQLite D1 adapter contract as roster094-edge-roster.mjs.
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');let receiptHook=null;
 const prepare=text=>({text,args:[],bind(...args){return {...this,args};},async first(){if(receiptHook&&this.text.startsWith('SELECT * FROM gsis_edge_receipts'))await receiptHook(this);return sql.prepare(this.text).get(...this.args)||null;},async all(){return {success:true,results:sql.prepare(this.text).all(...this.args),meta:{changes:0}};},async run(){const result=sql.prepare(this.text).run(...this.args);return {success:true,results:[],meta:{changes:Number(result.changes)}};}});
 return {sql,prepare,withSession(){return this;},onReceipt(fn){receiptHook=fn;},async batch(statements){sql.exec('BEGIN');try{const results=statements.map(s=>{const q=sql.prepare(s.text);if(/^\s*(SELECT|WITH)/.test(s.text))return {success:true,results:q.all(...s.args),meta:{changes:0}};const r=q.run(...s.args);return {success:true,results:[],meta:{changes:Number(r.changes)}};});sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
}
async function activate(db,scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'setup',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'setup',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});}

const actualNow=Date.now;let now=Date.parse('2026-10-14T07:59:59+08:00');Date.now=()=>now;
try{
 const db=database(),who={email:'alice@gsps.edu.sg',subject:'alice'},person={id:'alice',name:'Alice',active:true,email:who.email,emails:[who.email],mobile:'6512345678',employment:'Permanent',groups:['Teaching'],role:'Teacher'},env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_TIMETABLE_SNAPSHOTS:{get(){throw Error('No timetable object is required for this direct transaction witness');},put(){throw Error('No object write is required');}},APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec',ROSTER_PUBLIC_ORIGIN:'https://roster.test',WHATSAPP_ENABLED:'false'};
 await activate(db,'roster',O.initial());await activate(db,'roster-register',{revision:0,entries:[],receipts:[]});await activate(db,'roster-references',{schema:1,contacts:{rosterPeople:[person],rosterSMCIds:['alice'],rosterAdminIds:['alice'],rosterUrgentSMCIds:['alice']},contactsCheckedAt:now,calendarCheckedAt:now,calendarByDate:{}});
 const Fields=vm.runInNewContext(fs.readFileSync('shared/fields.js','utf8')+';GSISFields;'),deploy={index:{versions:[],active:null,published:null,publicationSchema:1,revision:0,requests:[]},drafts:{},publications:{},receipts:{},deltas:{},leases:{},properties:{},jobs:{}},identity={email:who.email},model=createDeployDomain({state:deploy,identity,sha256:sha256Bytes,calculations:new Map(),integration(){assert.fail('No external integration is required');}});
 model.dispatch({action:'change',input:{operation:'create',name:'Review clock fixture',requestId:crypto.randomUUID()},identity},{user:{email:who.email,roles:['Admin','KP']},people:[],sysFields:{},roleCatalogue:[],authoritative:true});
 const document=model.readDocument(deploy.index.versions[0]);document.from='2026-01-01';document.to='2099-12-31';const publication={...deploy.index.versions[0],from:document.from,to:document.to,edgePublished:true,commit:crypto.randomUUID()};deploy.index.published=publication;deploy.index.venuePublications=[publication];deploy.publications=Object.fromEntries(Object.entries(Fields.flat(document)).map(([key,value])=>[publication.commit+'|'+key,value]));await activate(db,'deploy',deploy);
 const requestId=crypto.randomUUID();let receiptReads=0,attempts=0;
 db.onReceipt(query=>{if(query.args.includes(requestId)&&++receiptReads===2)now+=2000;});
 await mutateEdgeRoster(env,{actor:who.email,who,requestId,command:{operation:'autoAllocate',allocationMode:'reoptimise',date:'2026-10-14'},apply(state,ctx){attempts++;if(ctx.minute<480)state.assignments.push({id:'P2-blank-before-start',date:'2026-10-14',period:2,timeStart:'08:00',staffId:'alice',status:'draft',origin:'automatic'});return {attempts};}});
 assert(!((await loadEdgeRoster(env)).state.assignments.some(a=>a.id==='P2-blank-before-start')),'D1 receipt lookup advanced trusted time beyond P2 start, so the prepared write must be retried');
 assert.equal(attempts,2);const savedHead=(await loadEdgeRoster(env)).revision;const replay=await mutateEdgeRoster(env,{actor:who.email,who,requestId,command:{operation:'autoAllocate',allocationMode:'reoptimise',date:'2026-10-14'},apply(){throw Error('Exact replay must read its receipt before running clock guards or mutation');}});assert.equal(replay.replayed,true);assert.equal((await loadEdgeRoster(env)).revision,savedHead);console.log('PASS final D1 batch clock guard catches a period start during asynchronous receipt lookup, recomputes exactly once and replays the same receipt without another commit');
}finally{Date.now=actualNow;}
