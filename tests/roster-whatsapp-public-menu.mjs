import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {edgeInboundMessage} from '../roster-update/public/edge-whatsapp-inbound.js';
import {menuReply} from '../roster-update/public/_worker.js';
const fixture=createRequire(import.meta.url)('./roster701-fixture.cjs');
const env={WHATSAPP_CURRENT_RELIEF_URL:'https://roster.test/',WHATSAPP_LAYOUT_URL:'https://layout.test/',WHATSAPP_LORD_URL:'https://lord.test/',GENERAL_OFFICE_PHONE:'+6567000000'};
function setup(){const f=fixture();Object.assign(f.ctx,{service:true,inboxMode:true,urgentSMCIds:['charlie','dora']});f.people.find(p=>p.id==='dora').active=false;let seq=0;f.send=(extra={})=>edgeInboundMessage(f.state,f.ctx,{messageId:'wamid.public-'+(++seq),from:'6591234567',timestamp:f.ctx.now,type:'text',text:'Hello',...extra});return f;}
const unknown='6581111111';
for(const kind of ['active','inactive','unknown','ambiguous']){
 const f=setup();if(kind==='inactive')f.people[0].active=false;if(kind==='ambiguous')f.people.push({...f.people[0],id:'duplicate',active:false});
 const from=kind==='unknown'?unknown:'6591234567';
 const result=f.send({from});assert.equal(result.reply.action,'menu');
 const menu=menuReply(result.reply,env);assert.equal(menu.interactive.body.text,'*This number is no longer actively manned by staff member*\n\nGongshang Primary WhatsApp Notifier. Please select an action:');
 assert.deepEqual(menu.interactive.action.sections[0].rows.map(r=>r.title),['1. Report Absence','2. Urgent Message','3. School Layout','4. Collect / Return ICT','5. Call General Office']);
 for(const [selection,action] of [['gsis_report_absence','report-absence'],['gsis_layout','layout'],['gsis_devices','devices'],['gsis_office','office']])assert.equal(f.send({from,type:'interactive',selection}).reply.action,action);
 assert.equal(f.state.outbox.length,0);assert.equal(f.state.smcAlerts.length,0);
}
// Public navigation never resolves Contacts identities.
{const f=setup();f.ctx.people=new Proxy([],{get(){throw Error('Public menu must not inspect identities');}});assert.equal(f.send({from:unknown}).reply.action,'menu');}
for(const active of [true,false]){
 const f=setup();f.people[0].active=active;assert.equal(f.send({type:'interactive',selection:'gsis_urgent'}).reply.action,'urgent-prompt');
 const input={messageId:'wamid.urgent-body',text:'Please call me.'};assert.equal(f.send(input).reply.action,'urgent-confirm');
 assert.deepEqual(f.state.smcAlerts[0].recipients,['charlie'],'inactive sender must not broaden duty recipients');assert.equal(f.state.outbox.length,1);
 const snapshot=JSON.stringify(f.state);assert(f.send(input).duplicate);assert.equal(JSON.stringify(f.state),snapshot,'duplicate webhook does not queue twice');
}
for(const kind of ['unknown','ambiguous']){
 const f=setup();if(kind==='ambiguous')f.people.push({...f.people[0],id:'duplicate'});
 const from=kind==='unknown'?unknown:'6591234567';const result=f.send({from,type:'interactive',selection:'gsis_urgent'});assert.equal(result.reply.action,'unknown');assert.match(menuReply(result.reply,env).text.body,/Urgent Message is available only/);
 assert.equal(f.state.inboundSessions[from],undefined);assert.equal(f.state.outbox.length,0);
}
for(const change of ['removed','ambiguous','different-record']){
 const f=setup();f.send({type:'interactive',selection:'gsis_urgent'});
 if(change==='removed')f.people.splice(0,1);else if(change==='ambiguous')f.people.push({...f.people[0],id:'duplicate'});else f.people[0].id='replacement-identity';
 assert.equal(f.send({text:'Urgent details'}).reply.action,'unknown');assert.equal(f.state.outbox.length,0);assert.equal(f.state.smcAlerts.length,0);
}
{const f=setup();f.send({type:'interactive',selection:'gsis_urgent'});f.people[0].active=false;assert.equal(f.send({text:'Still eligible'}).reply.action,'urgent-confirm','inactive records remain eligible as requested');}
{const f=setup();for(let i=0;i<6;i++)assert.equal(f.send({from:unknown}).reply.action,'menu');assert.equal(f.send({from:unknown}).reply.action,'rate-limited');}
{const f=setup();f.send({type:'interactive',selection:'gsis_urgent'});f.ctx.now+=16*60000;assert.equal(f.send({text:'Expired session'}).reply.action,'menu');assert.equal(f.state.outbox.length,0);}
{const f=setup();f.send({type:'interactive',selection:'gsis_urgent'});f.send({selection:'gsis_layout',type:'interactive'});assert.equal(f.send().reply.action,'menu');assert.equal(f.state.outbox.length,0);}
{const f=setup();f.send({type:'interactive',selection:'gsis_urgent'});f.send({text:'A'.repeat(3000)});assert(f.state.outbox.length>1);assert(f.state.outbox.every(j=>j.recipientId==='charlie'||j.staffId==='charlie'));}
{const f=setup();assert.throws(()=>edgeInboundMessage(f.state,{...f.ctx,service:false},{messageId:'wamid.forbidden',from:unknown}),e=>e.status===403);assert.throws(()=>f.send({timestamp:f.ctx.now-86400001}),e=>e.status===400);}
console.log('PASS public WhatsApp menu/links; active and inactive urgent senders; unknown/ambiguous/changed identity denied; active recipients, replay, rate limit, expiry, split text and signed-service boundary');
