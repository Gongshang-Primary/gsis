import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {GSiSEdgeStore} from '../public/edge-store.js';
import {createDeployDomain} from '../public/edge-deploy-domain.js';
import {sha256Bytes} from '../public/edge-deploy-sha256.js';
import {edgeDeployRosterReference,edgeDeployQuotaSource} from '../public/edge-deploy.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs');
const db=database(),identity={email:'test@gsps.edu.sg'},state={index:{versions:[],active:null,published:null,publicationSchema:1,revision:0,requests:[]},drafts:{},publications:{},receipts:{},deltas:{},leases:{},properties:{},jobs:{}};
const domain=createDeployDomain({state,identity,sha256:sha256Bytes,calculations:new Map(),integration(){assert.fail('No network is required for a local publication');}});
domain.dispatch({action:'change',input:{operation:'create',name:'Published quota',requestId:crypto.randomUUID()},identity},{user:{email:identity.email,roles:['Admin','KP']},people:[],sysFields:{},roleCatalogue:[],authoritative:true});
const entry=state.index.versions[0],prefix=entry.id+'|';
// The real seeded field tree is copied into an immutable publication. Its date
// leaves are changed directly so no Contacts/publication handoff is required.
state.drafts[prefix+'["from"]']=JSON.stringify({v:'2026-01-01'});state.drafts[prefix+'["to"]']=JSON.stringify({v:'2026-12-31'});
const document=domain.readDocument(entry),publication={...entry,commit:'immutable-quota-publication',from:document.from,to:document.to,edgePublished:true,publishedAt:'2026-10-30T00:00:00.000Z'};
publication.quotaCalculationVersion=domain.rosterReference(document,publication).source.calculationVersion;
state.index.published=publication;state.index.venuePublications=[publication];state.index.quotaPublications=[publication];state.publications=Object.fromEntries(Object.entries(state.drafts).filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[publication.commit+'|'+key.slice(prefix.length),value]));
async function imported(binding){const store=GSiSEdgeStore.open(binding,'deploy'),result=await store.importState({state,actor:identity.email,requestId:crypto.randomUUID(),source:{test:true}});return {store,result};}
const {store,result}=await imported(db);await store.transition({from:'imported',to:'active',expectedRevision:result.revision,actor:identity.email,proof:{legacyWritesDisabled:true,sourceDigest:result.sourceDigest,verifiedRecords:result.importedRecords}});
const original=globalThis.fetch;let network=0;
try{
 globalThis.fetch=async()=>{network++;assert.fail('An active local Deploy head must not call Google');};
 const env={GSIS_JOBS:db},date='2026-11-02',live=await edgeDeployRosterReference(env,[date]);assert.equal(live.source.commit,publication.commit,'persisted active head is sufficient without DEPLOY_EDGE_AUTHORITY');
 const manifest=await edgeDeployQuotaSource(env,{manifest:true,date});assert.equal(manifest.expectedSource.commit,publication.commit);const body=await edgeDeployQuotaSource(env,{versionId:publication.id,revision:publication.revision,commit:publication.commit});assert.equal(body.source.publishedAt,publication.publishedAt);assert.equal(network,0);
 const head=await store.head();await store.transition({from:'active',to:'paused',expectedRevision:head.revision,actor:identity.email,proof:{reason:'authority boundary test'}});
 const configured={...env,DEPLOY_APPS_SCRIPT_URL:'https://script.google.com/macros/s/never-use/exec',GSIS_SECRET:'s'.repeat(40)};
 await assert.rejects(edgeDeployRosterReference(configured,[date]),e=>e.status===503,'a paused head cannot fall back to Google');await assert.rejects(edgeDeployQuotaSource(configured,{manifest:true,date}),e=>e.status===503);assert.equal(network,0);
 const inertDb=database();await imported(inertDb);const inert={GSIS_JOBS:inertDb,DEPLOY_EDGE_AUTHORITY:'d1'};await assert.rejects(edgeDeployQuotaSource(inert,{manifest:true,date}),e=>e.status===503,'explicit D1 routing does not activate an imported head');assert.equal(network,0);
 globalThis.fetch=async()=>{network++;return Response.json({ok:true,data:{schema:'gsis-roster-quota-source-v1',publications:[],expectedSource:null}});};
 await edgeDeployQuotaSource({...configured,GSIS_JOBS:inertDb},{manifest:true,date});assert.equal(network,1,'an inert imported head retains the Google source');
 console.log('PASS quota authority: active head without routing flag stays local, paused reads never fall back, imported head remains inert and explicit D1 cannot activate it.');
}finally{globalThis.fetch=original;}
