import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import fs from 'node:fs';import assert from 'node:assert/strict';
const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const row={id:'n',claimId:'c',recipientId:'bob',mobile:'6591234567',date:'2026-10-14',expiresAt:Date.now()+3600000,name:'Bob',kind:'relief_publication',data:{templateKey:'relief_assignment',summary:'START '+ 'instructions '.repeat(100)+' END'}};
const template=JSON.parse(fs.readFileSync('notification-worker/template-contracts.json')).templates.relief_assignment;
const env={ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',EXTERNAL_LINK_SECRET:'e'.repeat(40)},config={contactsUrl:'https://contacts.example.test',templates:{relief_assignment:{...template,summaryMaxCharacters:2000}}};
const p=await M.templateMessage(row,env,config);assert(p.template.components[0].parameters[2].text.endsWith(' END'));assert(p.template.components[0].parameters[2].text.length>700);
await assert.rejects(()=>M.templateMessage(row,env,{...config,templates:{relief_assignment:{...template,summaryMaxCharacters:700}}}),/EXCEEDS_VERIFIED_TEMPLATE/);
console.log('PASS complete consolidated content or visible template-limit failure; no silent truncation. No live sends.');
