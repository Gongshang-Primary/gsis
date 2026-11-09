import assert from 'node:assert/strict';
import fs from 'node:fs';
import {toWorkerModuleURL} from './helpers/worker-module.cjs';

const contracts=JSON.parse(fs.readFileSync('notification-worker/template-contracts.json')).templates,activation=JSON.parse(fs.readFileSync('notification-worker/templates.activation.json'));
const expected={contact_review:['gsis_contact_review_v2','1512880204232296'],relief_unacknowledged:['gsis_relief_unacknowledged_v2','2320845038701493'],relief_urgent_smc:['gsis_relief_urgent_smc_v2','1746432063105141'],smc_attention:['gsis_relief_attention_v3','3330480857342320']};
for(const [key,[name,id]]of Object.entries(expected)){
 assert.deepEqual(contracts[key].pendingVariants?.buttons,{name,id,language:'en_GB',submissionState:'PENDING',evidenceState:'MISSING_BODY_COMPONENTS'},key+' records metadata without inventing a selectable contract');
 assert.equal(contracts[key].variants?.buttons,undefined,key+' has no verified button contract');
 assert.equal(activation[key].name,contracts[key].name);assert.equal(activation[key].enabled,true);assert.equal(activation[key].variants?.buttons.enabled,false);
}
for(const key of ['relief_assignment','relief_updated','relief_reminder','relief_urgent','mutual_override'])assert.equal(activation[key].variants.buttons.enabled,false);
assert.equal(activation.mutual_request.name,contracts.mutual_request.variants.buttons.name);assert.equal(activation.mutual_request.enabled,true);assert.equal(contracts.mutual_request.variants.buttons.submissionState,'APPROVED');
assert(Buffer.byteLength(JSON.stringify(activation))<5120);

// Feed the canonical registry to the actual module graph. The release build
// regenerates the same embedded block after all source owners have finished.
const source=fs.readFileSync('roster-update/public/_worker.js','utf8'),moduleFor=async registry=>import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source.replace(/\/\* GSIS_WHATSAPP_CONTRACTS_BEGIN \*\/[\s\S]*?\/\* GSIS_WHATSAPP_CONTRACTS_END \*\//,()=> 'const WHATSAPP_CONTRACTS='+JSON.stringify(registry)+';')).toString('base64')));
const gateway=await moduleFor(contracts),now=Date.now(),date=new Date(now+28800000).toISOString().slice(0,10),originalFetch=globalThis.fetch;
const env={WHATSAPP_ENABLED:'true',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_TEMPLATE_ACCOUNT_ID:'323456789',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_ACCESS_TOKEN:'synthetic-access-'.repeat(4),WHATSAPP_APP_SECRET:'synthetic-app-'.repeat(4),WHATSAPP_VERIFY_TOKEN:'synthetic-verify-'.repeat(4),GSIS_SECRET:'synthetic-service-'.repeat(4),EXTERNAL_LINK_SECRET:'synthetic-private-link-'.repeat(4),ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',CONTACTS_PUBLIC_URL:'https://contacts.gsps.edu.sg/',APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec'};
const row={id:'fixture-notice',claimId:'fixture-claim',recipientId:'fixture-staff',mobile:'6591234567',name:'Fixture staff',date,createdAt:new Date(now).toISOString(),expiresAt:now+3600000,data:{summary:'Synthetic duty details',assignedTeacherName:'Synthetic assigned teacher',startAt:now+600000}};
const record=c=>({name:c.name,language:c.language,category:'UTILITY',status:'APPROVED',components:[{type:'BODY',text:c.body}]});
try{
 for(const [key,[name,id]]of Object.entries(expected)){
  const base=contracts[key],pending={name,id,language:'en_GB',category:'UTILITY',body:'Unverified provider fixture body'},catalogue=[record(base),record(pending)];
  globalThis.fetch=async(input,init={})=>{assert(new URL(input).pathname.endsWith('/message_templates'),'test permits only synthetic catalogue reads');assert(!init.method||init.method==='GET');return Response.json({data:catalogue});};
  for(const enabled of [false,true]){
   const settings={...env,WHATSAPP_ACCESS_TOKEN:env.WHATSAPP_ACCESS_TOKEN+key+enabled,WHATSAPP_TEMPLATES_JSON:JSON.stringify({[key]:{...activation[key],variants:{buttons:{enabled}}}})};
   assert.equal(gateway.notificationStatus(settings).configured,true,'pending metadata must keep the base route configured');assert.deepEqual(await gateway.approvedTemplateKeys(settings),[key]);
   const payload=await gateway.templateMessage({...row,data:{...row.data,templateKey:key}},settings);assert.equal(payload.template.name,base.name,'pending button toggle cannot select the unverified template');assert.equal(payload.template.components.length,1);assert.equal(payload.template.components[0].parameters.length,base.fields.length);assert.match(payload.template.components[0].parameters.at(-1).text,/^https:\/\//);
  }
  const off={...env,WHATSAPP_TEMPLATES_JSON:JSON.stringify({[key]:{...activation[key],enabled:false,variants:{buttons:{enabled:true}}}})};assert.deepEqual(await gateway.approvedTemplateKeys(off),[],'pending metadata cannot enable an off route');
  for(const bodySha256 of [undefined,'0'.repeat(64),base.bodySha256]){
   const direct={...env,WHATSAPP_TEMPLATES_JSON:JSON.stringify({[key]:{name,language:'en_GB',bodySha256,enabled:true}})};assert.equal(gateway.notificationStatus(direct).configured,false);await assert.rejects(()=>gateway.approvedTemplateKeys(direct),/Template contract mismatch/,'provider approval cannot make pending metadata selectable');
  }
  const invalid={...env,WHATSAPP_TEMPLATES_JSON:JSON.stringify({[key]:{...activation[key],variants:{buttons:{enabled:'true'}}}})};assert.equal(gateway.notificationStatus(invalid).configured,false,'the pending choice still requires a boolean');
 }
 const accidental=structuredClone(contracts);for(const key of Object.keys(expected))accidental[key].variants={buttons:{...accidental[key],name:expected[key][0],id:expected[key][1],submissionState:'APPROVED'}};
 const guarded=await moduleFor(accidental);
 for(const key of Object.keys(expected)){const base=contracts[key],choice=accidental[key].variants.buttons;globalThis.fetch=async()=>Response.json({data:[record(base),record(choice)]});const direct={...env,WHATSAPP_TEMPLATES_JSON:JSON.stringify({[key]:{name:choice.name,language:choice.language,bodySha256:choice.bodySha256,enabled:true}})};assert.equal(guarded.notificationStatus(direct).configured,false,'pending marker blocks an accidentally copied complete contract');await assert.rejects(()=>guarded.approvedTemplateKeys(direct),/Template contract mismatch/);}
 console.log('PASS pending staff templates: canonical metadata, disabled activation, safe v1 fallback on accidental opt-in, direct-selection refusal and no provider sends');
}finally{globalThis.fetch=originalFetch;}
