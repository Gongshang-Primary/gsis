import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import fixture from './roster701-fixture.cjs';

const contracts=JSON.parse(fs.readFileSync('notification-worker/template-contracts.json')).templates;
const activation=JSON.parse(fs.readFileSync('notification-worker/templates.activation.json'));
const expected={mutual_request:['1860613241950793',4,'APPROVED'],relief_assignment:['1111277344970510',3,'PENDING'],relief_updated:['1093823786983973',3,'PENDING'],relief_reminder:['1140063958558991',3,'PENDING'],relief_urgent:['1068710112868282',4,'PENDING'],mutual_override:['2114085432831676',3,'PENDING']};
// Hashes from the live Meta BODY text read on 3 November 2026, not the task table.
const liveHashes={mutual_request:'8d1496eda9cb385716226219d725c2e1d43b62c23dcccdcd9b8b0ad3a2232244',relief_assignment:'083d017fb9ea2e4d2d16728efab4b37f449bc1f8dc8fb9f6e5611b53d47ef594',relief_updated:'8a542ed6992817e84bf4e70b7499156eec1f10e288cd438c5533e7fa022a020a',relief_reminder:'e7ead96c54ba5012bdde84f61fd69c8eecfd8b7b8bcb3794238d0b2dc4daa490',relief_urgent:'5e2043f529bdac5c651bc7f7879dfa56d37217be7773151b47fce4bd5fbd066c',mutual_override:'e22e7a991f5672626cf3e84eef482f433d7b767786a077ce5a41563f828a81ff'};
for(const [key,[id,count,status]] of Object.entries(expected)){
 const button=contracts[key].variants?.buttons;
 assert(button,key+' must register the live Meta button contract');
 assert.equal(button.id,id);assert.equal(button.fields.length,count);assert.equal(button.submissionState,status);
 assert.equal(button.privateLinkPurpose,contracts[key].privateLinkPurpose);
 assert.equal(button.bodySha256,createHash('sha256').update(button.body).digest('hex'));
 assert.equal(button.bodySha256,liveHashes[key],'contract must retain the exact live Meta BODY');
 assert(!button.fields.some(field=>field.startsWith('private_')));
 assert.deepEqual(button.urlButtons,[{text:key==='mutual_request'?'Review request':key==='mutual_override'?'View arrangement':'View and acknowledge',url:'https://roster.gsps.edu.sg/external.html#{{1}}'}]);
 if(key==='mutual_request'){assert.equal(activation[key].name,button.name);assert.equal(activation[key].bodySha256,button.bodySha256);assert.equal(activation[key].enabled,true);}
 else {assert.equal(activation[key].name,contracts[key].name);assert.equal(activation[key].enabled,true);assert.equal(activation[key].variants.buttons.enabled,false);}
}
assert(Buffer.byteLength(JSON.stringify(activation))<5120,'activation map fits the existing Worker variable limit');
const source=fs.readFileSync('roster-update/public/_worker.js','utf8');
const gateway=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const bundle=await import('../notification-worker/dashboard-worker.mjs');
const now=Date.now(),date=new Date(now+8*3600000).toISOString().slice(0,10);
const env={WHATSAPP_ENABLED:'true',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_TEMPLATE_ACCOUNT_ID:'323456789',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_ACCESS_TOKEN:'fixture-access-'.repeat(4),WHATSAPP_APP_SECRET:'fixture-app-'.repeat(4),WHATSAPP_VERIFY_TOKEN:'fixture-verify-'.repeat(4),GSIS_SECRET:'fixture-service-'.repeat(4),EXTERNAL_LINK_SECRET:'fixture-link-'.repeat(4),ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',CONTACTS_PUBLIC_URL:'https://contacts.example.test/',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec'};
const row={id:'notice',claimId:'claim',recipientId:'teacher',requestId:'request',mobile:'6591234567',name:'Fixture Teacher',date,createdAt:new Date(now).toISOString(),expiresAt:now+3600000,data:{requesterName:'Requester',summary:'P3 4A EL Room',startAt:now+15*60000}};
const record=c=>({...c,status:'APPROVED',components:[{type:'BODY',text:c.body},...(c.urlButtons?[{type:'BUTTONS',buttons:c.urlButtons.map(b=>({type:'URL',...b}))}]:[])]});
globalThis.fetch=async(input,init={})=>{assert(new URL(input).pathname.endsWith('/message_templates'),'no live send or backend request');assert(!init.method||init.method==='GET');return Response.json({data:Object.values(contracts).flatMap(c=>[c,...Object.values(c.variants||{})]).map(record)});};
for(const M of [gateway,bundle])for(const key of Object.keys(expected)){
 const input={...row,data:{...row.data,templateKey:key,startAt:now+(key==='relief_reminder'?20:15)*60000}},before=JSON.stringify(input),base=contracts[key],button=base.variants.buttons;
 const chosen=key==='mutual_request'?{...activation[key]}:{...activation[key],variants:{buttons:{enabled:true}}},settings={...env,WHATSAPP_TEMPLATES_JSON:JSON.stringify({[key]:chosen})};
 assert.deepEqual(await M.approvedTemplateKeys(settings),[key]);
 const payload=await M.templateMessage(input,settings),[body,component]=payload.template.components;
 assert.equal(payload.template.name,button.name);assert.equal(body.parameters.length,button.fields.length);
 assert(body.parameters.every(p=>!p.text.includes('https://')&&!p.text.includes('external.html#')),'private URL is absent from body parameters');
 assert.equal(component.type,'button');assert.equal(component.sub_type,'url');assert.equal(component.index,'0');assert.equal(component.parameters.length,1);
 const token=component.parameters[0].text;assert.match(token,/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);assert(!token.includes('https://'));
 const cap=await M.readCapability(token,settings,env.ROSTER_PUBLIC_ORIGIN);assert.equal(cap.staffId,input.recipientId);assert.equal(cap.purpose,base.privateLinkPurpose);
 assert.equal(JSON.stringify(input),before);
 const off={...env,WHATSAPP_ACCESS_TOKEN:env.WHATSAPP_ACCESS_TOKEN+key+'off',WHATSAPP_TEMPLATES_JSON:JSON.stringify({[key]:{name:base.name,language:base.language,bodySha256:base.bodySha256,enabled:true,variants:{buttons:{enabled:false}}}})};
 assert.deepEqual(await M.approvedTemplateKeys(off),[key],'disabled button uses approved v1 even when v2 is live-approved');
 const fallback=await M.templateMessage(input,off);assert.equal(fallback.template.name,base.name);assert.equal(fallback.template.components.length,1);assert.equal(fallback.template.components[0].parameters.length,base.fields.length);
 assert.match(fallback.template.components[0].parameters.at(-1).text,/^https:\/\/roster\.gsps\.edu\.sg\/external\.html#/);
 const disabled=structuredClone(chosen);disabled.enabled=false;const paused={...env,WHATSAPP_TEMPLATES_JSON:JSON.stringify({[key]:disabled})};assert.deepEqual(await M.approvedTemplateKeys(paused),[],'button opt-in cannot enable a disabled route');
 if(key!=='mutual_request'){
  const staging={...settings,ROSTER_PUBLIC_ORIGIN:'https://roster.example.test'};assert.equal((await M.templateMessage(input,staging)).template.name,base.name,'registered production button falls back to v1 on another origin');
 }
}
for(const M of [gateway,bundle]){
 const selected={...activation.relief_assignment,variants:{buttons:{enabled:true}}};
 const pending={...env,WHATSAPP_ACCESS_TOKEN:env.WHATSAPP_ACCESS_TOKEN+'pending',WHATSAPP_TEMPLATES_JSON:JSON.stringify({relief_assignment:selected})};
 globalThis.fetch=async()=>Response.json({data:[record(contracts.relief_assignment),{...record(contracts.relief_assignment.variants.buttons),status:'PENDING'}]});
 assert.deepEqual(await M.approvedTemplateKeys(pending),[],'owner opt-in does not bypass live Meta approval');
 const malformed={...pending,WHATSAPP_TEMPLATES_JSON:JSON.stringify({relief_assignment:{...selected,variants:{buttons:{enabled:'true'}}}})};
 assert.equal(M.notificationStatus(malformed).configured,false,'button choice must be a boolean');
}
// Isolate fragment transport from signing to pin every punctuation byte at the payload boundary.
const token='Header.payload-SIGNATURE_with.parts-_';
const fixed=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source+`\nexternalUrl=async()=>${JSON.stringify(env.ROSTER_PUBLIC_ORIGIN+'/external.html#'+token)};`).toString('base64')));
for(const key of Object.keys(expected)){
 const chosen=key==='mutual_request'?activation[key]:{...activation[key],variants:{buttons:{enabled:true}}};
 const settings={...env,WHATSAPP_TEMPLATES_JSON:JSON.stringify({[key]:chosen})};
 const payload=await fixed.templateMessage({...row,data:{...row.data,templateKey:key,startAt:now+(key==='relief_reminder'?20:15)*60000}},settings);assert.equal(payload.template.components[1].parameters[0].text,token,'dots, hyphens and underscores pass unchanged');
}
console.log('PASS six live button contracts, body counts, token-only payloads, disabled-v1 fallback, explicit activation and punctuation in Pages and notification Worker; no live sends');

// Owner-authorized Part 2: equivalent communicated duties retain acknowledgement through publication.
const f=fixture(),{O,state:s,ctx,date:d}=f;
ctx.now=Date.parse(d+'T06:00:00+08:00');ctx.minute=360;ctx.iso=new Date(ctx.now).toISOString();
O.apply(s,ctx,{operation:'saveAbsence',date:d,staffId:'alice',typeId:'mc',periods:[2]});
O.apply(s,ctx,{operation:'assign',date:d,demandIds:[O.demand(ctx,s,d)[0].id],staffId:'bob'});
O.notifyDaily(s,ctx,{date:d,staffId:'bob'});
const job=s.outbox.find(j=>j.kind==='stapler_timetable'),claims={purpose:'duties',staffId:'bob',date:d,communicationId:job.id,issuedAt:ctx.now,expiresAt:ctx.now+7*86400000};
const signed=await gateway.createCapability(claims,env,ctx.now),cap=await gateway.readCapability(signed,env,env.ROSTER_PUBLIC_ORIGIN,ctx.now);
const old=O.communicationProjection(s,cap),teacher={...ctx,user:{staffId:'bob',email:'bob@example.test'}};
O.acknowledgeCommunication(s,teacher,cap,{timetableNoticeId:old.timetableNotice.id});
O.publishDay(s,ctx,{date:d,allocationRevision:s.dayRevisions[d]});
assert.equal((await gateway.readCapability(signed,env,env.ROSTER_PUBLIC_ORIGIN,ctx.now)).communicationId,job.id,'publishing does not invalidate the signed token');
assert.equal(O.communicationProjection(s,cap).timetableNotice.status,'acknowledged','original communication remains readable and acknowledged');
const published=O.timetableNotice(s,teacher,{date:d});assert.equal(published.id,old.timetableNotice.id);assert.equal(published.status,'acknowledged','equivalent first publication retains the recipient acknowledgement');const current=O.resolveDutiesCapability(s,cap,ctx.now).projection;assert.equal(current.timetableNotice.id,published.id);assert.equal(current.timetableNotice.status,'acknowledged');assert.equal(current.updatedSinceMessage,false,'equivalent publication is not a changed-duties message');
const tick=Date.parse(d+'T07:40:00+08:00');O.scheduledTick(s,{...ctx,service:true,now:tick,iso:new Date(tick).toISOString(),minute:460},tick);
assert(!s.outbox.some(j=>j.kind==='relief_reminder'&&j.recipientId==='bob'&&j.data.templateKey==='relief_reminder'&&j.status==='queued'),'equivalent acknowledged duties do not queue a 20-minute reminder');
O.acknowledgePublications(s,teacher,{date:d,timetableNoticeId:published.id,snapshotIds:published.snapshotIds});
const revision=s.dailyPublicationStates[d].revision;
O.publishDay(s,ctx,{date:d,allocationRevision:s.dayRevisions[d]});assert.equal(s.dailyPublicationStates[d].revision,revision+1);assert.equal(O.timetableNotice(s,teacher,{date:d}).id,published.id,'unchanged published content already keeps its notice ID');
assert.equal(O.timetableNotice(s,teacher,{date:d}).status,'acknowledged','an acknowledged publication stays acknowledged after unchanged republish');
console.log('PASS Part 2: equivalent first publication and republication retain acknowledgement; original signed link resolves current duties; no false 20-minute reminder');
