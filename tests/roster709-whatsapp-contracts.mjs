import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';

const source=fs.readFileSync('roster-update/public/_worker.js','utf8');
const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const contracts=JSON.parse(fs.readFileSync('notification-worker/template-contracts.json')).templates;
const submitted=[...JSON.parse(fs.readFileSync('notification-worker/proposed-template-submissions.json')),...JSON.parse(fs.readFileSync('notification-worker/stapler-template-submissions.json'))];
const expected={
 conditional_relief_instruction:['2516068742237019','93eb9ef8c917dd27080fb8f662eb2eee1aa8a277d18b9f24d3c4d2730da82723',7],
 stapler_timetable:['1116798554168000','b7ea3b9c0741face4f14e08d84793fe3588a2f010ec8d629d2801db59f3bffcb',4],
 stapler_request:['1647877567013330','740a0dbae98d03ada92af8e11602d180daa3054221fabc67d0442a7080a9a37f',4],
 stapler_decision:['2207471319799180','f36a327edb998054baf402b6a7c6df03c77804ad00425d659d3936c7e72d63b5',4]
};
assert.deepEqual(M.WHATSAPP_CONTRACTS,contracts,'built Worker must carry the canonical contracts');
for(const [key,[id,hash,count]] of Object.entries(expected)){
 const c=contracts[key],s=submitted.find(s=>s.integrationKey===key);
 assert.equal(c.id,id);assert.equal(c.bodySha256,hash);assert.equal(createHash('sha256').update(c.body).digest('hex'),hash);assert.equal(c.fields.length,count);
 assert.equal(c.submissionState,'PENDING');assert.equal(c.category,'UTILITY');assert.equal(c.language,'en_GB');
 assert.equal(s.templateId,id);assert.equal(s.state,'PENDING');assert.equal(s.request.components[0].text,c.body);
 assert.equal(s.request.components[0].example.body_text[0].length,count);
}
const disabled=JSON.parse(fs.readFileSync('notification-worker/templates.disabled.example.json'));
assert.equal(Object.keys(disabled).length,21);assert(Object.values(disabled).every(t=>t.enabled===false&&t.verifiedAt===null));
const config={contactsUrl:'https://contacts.example.test/',templates:Object.fromEntries(Object.entries(contracts).map(([key,c])=>[key,{...c,enabled:true}]))};
const env={ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',CONTACTS_PUBLIC_URL:config.contactsUrl,EXTERNAL_LINK_SECRET:'l'.repeat(40),ROSTER_SERVICE_SECRET:'s'.repeat(40),APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',WHATSAPP_ENABLED:'true',WHATSAPP_API_VERSION:'v99.0',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'987654321',WHATSAPP_TEMPLATE_ACCOUNT_ID:'987654320',WHATSAPP_APP_SECRET:'a'.repeat(40),WHATSAPP_ACCESS_TOKEN:'t'.repeat(40),WHATSAPP_VERIFY_TOKEN:'v'.repeat(40),WHATSAPP_TEMPLATES_JSON:JSON.stringify(config.templates)};
const originalNow=Date.now,originalFetch=globalThis.fetch,originalCrypto=Object.getOwnPropertyDescriptor(globalThis,'crypto');
let clock=Date.parse('2026-10-19T00:00:00Z'),crossMidnightDuringLink=false;
Date.now=()=>clock;
Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=>webcrypto.randomUUID(),subtle:{importKey:(...args)=>webcrypto.subtle.importKey(...args),sign:async(...args)=>{
 const signature=await webcrypto.subtle.sign(...args);
 const data=JSON.parse(new TextDecoder().decode(args[2]));
 if(crossMidnightDuringLink&&['gsis-roster-link-v1','gsis-roster-link-v2'].includes(data.type))clock=Date.parse('2026-10-19T16:00:00Z');
 return signature;
}}}});
try{
 const row={id:'notice',claimId:'claim',recipientId:'relief-teacher',mobile:'6590000000',name:'Relief Teacher',date:'2026-10-19',expiresAt:Date.parse('2026-10-20T16:00:00Z'),data:{templateKey:'conditional_relief_instruction',className:'3A',periodAndTime:'Period 3, 08:30 to 09:00',instruction:'Collect the worksheet.',absentTeacherName:'Absent Teacher',absentTeacherContact:'https://wa.me/6590000001',requesterName:'Planning Teacher',summary:'Approved for the requested date.'}};
 const values=async r=>(await M.templateMessage(r,env,config)).template.components[0].parameters.map(p=>p.text);
 assert.deepEqual(await values(row),['Relief Teacher','3A','19 Oct 2026 (Mon)','Period 3, 08:30 to 09:00','Collect the worksheet.','Absent Teacher','https://wa.me/6590000001']);
 assert.equal((await values({...row,data:{...row.data,absentTeacherContact:'absent.teacher@gsps.edu.sg'}}))[6],'absent.teacher@gsps.edu.sg');
 await assert.rejects(()=>values({...row,data:{...row.data,absentTeacherName:undefined}}),/absent_teacher_name/);
 await assert.rejects(()=>values({...row,data:{...row.data,absentTeacherContact:''}}),/absent_teacher_contact/);
 for(const name of ['Planning Teacher','SMC Sponsor'])assert.equal((await values({...row,name,data:{...row.data,templateKey:'stapler_decision'}}))[0],'Planning Teacher');
 await assert.rejects(()=>values({...row,data:{...row.data,templateKey:'stapler_decision',requesterName:''}}),/requesting_teacher_name/);
 for(const date of ['2026-10-18','2026-10-20'])await assert.rejects(()=>values({...row,date,data:{...row.data,templateKey:'stapler_timetable'}}),/STALE_TIMETABLE/);
 assert.equal((await values({...row,data:{...row.data,templateKey:'stapler_timetable'}}))[1],'19 Oct 2026 (Mon)');
 for(const key of ['stapler_request','stapler_decision'])assert.equal((await values({...row,date:'2026-10-20',data:{...row.data,templateKey:key}})).length,4,'future planning decisions remain valid');

 // Exact text and category approval remain mandatory; a matching name alone is insufficient.
 globalThis.fetch=async()=>Response.json({data:Object.entries(expected).map(([key])=>({...contracts[key],status:key==='conditional_relief_instruction'?'PENDING':'APPROVED',category:key==='stapler_request'?'MARKETING':'UTILITY',components:[{type:'BODY',text:contracts[key].body+(key==='stapler_decision'?' changed':'')}]}))});
 const selected={...config,templates:Object.fromEntries(Object.keys(expected).map(k=>[k,config.templates[k]]))};
 assert.deepEqual(await M.approvedTemplateKeys({...env,WHATSAPP_ACCESS_TOKEN:'v'.repeat(40)},selected),['stapler_timetable']);

 let queued,outcomes=[],sent=[];
 globalThis.fetch=async(url,options)=>{
  url=String(url);
  if(url.includes('/message_templates?'))return Response.json({data:Object.values(contracts).map(c=>({...c,status:'APPROVED',components:[{type:'BODY',text:c.body}]}))});
  if(url.startsWith('https://graph.facebook.com/')){sent.push(JSON.parse(options.body));return Response.json({messages:[{id:'wamid.test'}]});}
  const input=JSON.parse(JSON.parse(options.body).payload).input;
  if(input.operation==='claimNotifications')return Response.json({ok:true,data:{notifications:[queued]}});
  if(input.operation==='prepareNotification')return Response.json({ok:true,data:{notification:queued}});
  assert.equal(input.operation,'notificationResult');outcomes.push(input);return Response.json({ok:true,data:{}});
 };
 queued={...row,data:{...row.data,templateKey:'stapler_timetable'}};
 assert.equal((await M.dispatchNotifications(env)).sent,1);assert.equal(sent.length,1);
 clock=Date.parse('2026-10-19T15:59:59.999Z');crossMidnightDuringLink=true;
 assert.equal((await M.dispatchNotifications(env)).failed,1);assert.equal(sent.length,1,'no send when link signing crosses Singapore midnight');assert.equal(outcomes.at(-1).error,'STALE_TIMETABLE_NOTIFICATION');
 crossMidnightDuringLink=false;clock=Date.parse('2026-10-19T00:00:00Z');queued={...row,date:'2026-10-20',data:{...row.data,templateKey:'stapler_request'}};
 assert.equal((await M.dispatchNotifications(env)).sent,1);assert.equal(sent.length,2,'future planning request is dispatched');
 queued={...queued,data:{...queued.data,templateKey:'stapler_decision'}};
 assert.equal((await M.dispatchNotifications(env)).sent,1);assert.equal(sent.at(-1).template.components[0].parameters[0].text,'Planning Teacher');
}finally{
 Date.now=originalNow;globalThis.fetch=originalFetch;
 if(originalCrypto)Object.defineProperty(globalThis,'crypto',originalCrypto);else delete globalThis.crypto;
}
console.log('PASS v0.7.09 exact submitted contracts, seven-field instructions, requester addressing, approval gates and Singapore-midnight dispatch; mocked network only.');
