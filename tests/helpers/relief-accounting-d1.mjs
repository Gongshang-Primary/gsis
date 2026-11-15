import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {GSiSEdgeStore} from '../../roster-update/public/edge-store.js';
import {edgeRosterBackend} from '../../roster-update/public/edge-roster.js';
const require=createRequire(import.meta.url),database=require('./chunked-import-db.cjs'),{harness}=require('../roster716-calculations.cjs');
const Fields=vm.runInNewContext(fs.readFileSync('shared/fields.js','utf8')+';GSISFields;');
export async function setup({state,people,doc}={}){
 const google=harness(),db=database(),now=Date.parse('2026-11-01T12:00:00+08:00'),who={email:'plain@gsps.edu.sg',subject:'plain'};
 Object.assign(google.state,state||{});if(doc)Object.assign(google.doc,doc);if(people)google.contacts.rosterPeople=people;
 const contacts=google.contacts.rosterPeople.map(p=>({...p,email:p.email||p.id+'@gsps.edu.sg',employment:p.employment||'Permanent',groups:p.groups||[]}));
 const refs={schema:1,contacts:{rosterPeople:contacts,rosterSMCIds:['plain'],rosterAdminIds:['plain'],rosterUrgentSMCIds:[]},contactsCheckedAt:now,calendarCheckedAt:now,calendarByDate:{'2026-11-01':{date:'2026-11-01',available:true,schoolDay:false,parity:'single'}}};
 const publication={...google.en,from:google.doc.from,to:google.doc.to,edgePublished:true},deploy={index:{versions:[],active:null,published:publication,venuePublications:[],publicationSchema:1,revision:2,requests:[]},drafts:{},publications:Object.fromEntries(Object.entries(Fields.flat(google.doc)).map(([key,value])=>[publication.commit+'|'+key,value])),receipts:{},deltas:{},leases:{},properties:{},jobs:{}};
 async function activate(scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'fixture',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}
 const store=await activate('roster',google.state);await activate('roster-register',{revision:0,entries:[],receipts:[]});await activate('roster-references',refs);await activate('deploy',deploy);
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',DEPLOY_EDGE_AUTHORITY:'d1',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec',WHATSAPP_ENABLED:'false'};
 return {google,db,env,store,who,now,async send(input,actor=who){const reply=await edgeRosterBackend(env,'rosterOperations',input,actor,'fixture');if(!reply.result.ok)throw Object.assign(Error(reply.result.error),reply.result);return reply.result.data;}};
}
