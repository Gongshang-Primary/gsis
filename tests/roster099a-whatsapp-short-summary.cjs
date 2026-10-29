'use strict';
// 0.9.9a: teacher relief WhatsApp names period numbers only. Instructions and
// lesson details stay behind the private link.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={console};vm.createContext(ctx);
for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const S=ctx.GSISRosterOperations.shortPublicationSummary,row=(period,kind='assigned')=>({period,kind,assignment:{period,className:'4A',subject:'EL',venue:'C1-01',timeStart:'08:00'},instructions:'Read chapter 3'});
test('new assignment and urgent: count and periods, singular and plural',()=>{
 assert.equal(S([row(3)],false),'1 relief duty: P3.');
 assert.equal(S([row(5),row(3)],false),'2 relief duties: P3, P5.');
 assert.equal(S([row(3),row(3)],false),'1 relief duty: P3.','a combined class counts once per period');
 assert.equal(S([{kind:'assigned',assignment:{period:4}}],false),'1 relief duty: P4.','period read from the assignment when the snapshot lacks it');
});
test('update: only the parts that apply, in order New, Changed, Cancelled',()=>{
 assert.equal(S([row(4),row(3,'instructions'),row(5,'cancelled')],true),'New: P4. Changed: P3. Cancelled: P5.');
 assert.equal(S([row(5,'cancelled')],true),'Cancelled: P5.');
 assert.equal(S([row(2,'instructions')],true),'Changed: P2.');
 assert.equal(S([row(3,'cancelled'),row(3)],true),'Changed: P3.','a period moved to another class or cover reads as Changed');
});
test('no lesson details or instructions reach WhatsApp',()=>{
 const text=S([row(3),row(4,'instructions'),row(6,'cancelled')],true)+S([row(3)],false);
 for(const detail of ['4A','EL','C1-01','08:00','Read chapter 3','\n'])assert(!text.includes(detail),detail);
});

// Flow and payload checks carried over from Codex's PR #9 (owner request), adapted to shortPublicationSummary.
const fixture=require('./roster701-fixture.cjs');
function setup(){const f=fixture();f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();return f;}
function snapshot(f,period,kind='assigned',extra={}){
 const a={id:f.ctx.uuid(),staffId:'bob',date:f.date,period,timeStart:'08:30',timeEnd:'09:00',className:'4A',subject:'EL',groupName:'Group B',venue:'Room 2-3',status:kind==='cancelled'?'cancelled':'published',publishedAt:f.ctx.iso,instructions:'Read page 12.',customInstructions:'Use Gate A.',...extra};
 f.state.assignments.push(a);return f.O.publicationSnapshot(f.state,f.ctx,a,kind);
}
const full='P3 08:30 4A · EL · Group B · Room 2-3 (class combination)\nRead page 12.\nSMC: Use Gate A.';

test('publication enqueue and dispatch both use the resolved template format',()=>{
 for(const [kind,want,key] of [['assigned','1 relief duty: P3.','relief_assignment'],['instructions','Changed: P3.','relief_updated'],['cancelled','Cancelled: P3.','relief_updated']]){
  const f=setup(),row=snapshot(f,3,kind);f.O.queuePublication(f.state,f.ctx,[row]);
  const job=f.state.outbox.find(j=>j.kind==='relief_publication');assert.equal(job.data.templateKey,key);assert.equal(job.data.summary,want);
  job.data.summary='old full details';job.data.templateKey='relief_updated';
  assert.equal(f.O.notificationCurrent(f.state,job,f.ctx.now),null);assert.equal(job.data.templateKey,key);assert.equal(job.data.summary,want);
 }
 const f=setup(),row=snapshot(f,3,'cancelled',{mutual:true,cancellationReason:'Published replacement'});f.O.queuePublication(f.state,f.ctx,[row]);
 const job=f.state.outbox.find(j=>j.kind==='relief_publication'),before=job.data.summary;
 assert.equal(job.data.templateKey,'mutual_override');assert.equal(f.O.notificationCurrent(f.state,job,f.ctx.now),null);assert.equal(job.data.summary,before);assert(before.includes('Read page 12.'));
});
test('urgent enqueue is short while a regular reminder keeps full detail until promoted',()=>{
 const f=setup(),row=snapshot(f,3,'assigned',{combination:true});
 const start=Date.parse(f.date+'T08:30:00+08:00'),at=minutes=>start-minutes*60000;
 f.ctx.now=at(12);f.ctx.iso=new Date(f.ctx.now).toISOString();f.O.queuePublication(f.state,f.ctx,[row]);
 const urgent=f.state.outbox.find(j=>j.kind==='relief_publication');assert.equal(urgent.data.templateKey,'relief_urgent');assert.equal(urgent.data.summary,'1 relief duty: P3.');
 assert.equal(f.O.notificationCurrent(f.state,urgent,at(12)),null);assert.equal(urgent.data.summary,'1 relief duty: P3.');
 const reminder={kind:'relief_reminder',date:f.date,recipientId:'bob',createdAt:f.ctx.iso,expiresAt:start+60000,data:{templateKey:'relief_reminder',snapshotIds:[row.id]}};
 assert.equal(f.O.notificationCurrent(f.state,reminder,at(20)),null);assert.equal(reminder.data.templateKey,'relief_reminder');assert.equal(reminder.data.summary,full);
 assert.equal(f.O.notificationCurrent(f.state,reminder,at(12)),null);assert.equal(reminder.data.templateKey,'relief_urgent');assert.equal(reminder.data.summary,'1 relief duty: P3.');
 // The scheduled reminder creation path also selects the short urgent variant.
 const scheduled=setup();snapshot(scheduled,3);scheduled.ctx.now=at(12);scheduled.ctx.iso=new Date(scheduled.ctx.now).toISOString();scheduled.ctx.service=true;
 scheduled.O.scheduledTick(scheduled.state,scheduled.ctx,scheduled.ctx.now);
 const queued=scheduled.state.outbox.find(j=>j.kind==='relief_reminder');assert(queued);assert.equal(queued.data.templateKey,'relief_urgent');assert.equal(queued.data.summary,'1 relief duty: P3.');
});
test('generated Worker domain sends the short summary in the existing template summary field',async()=>{
 const fs=require('node:fs'),{pathToFileURL}=require('node:url'),{toWorkerModuleURL}=require('./helpers/worker-module.cjs');
 const {GSISRosterOperations:O}=await import(pathToFileURL(require('node:path').resolve('roster-update/public/edge-roster-domain.js')).href);
 const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
 const registry=JSON.parse(fs.readFileSync('notification-worker/template-contracts.json')).templates;
 const config={templates:Object.fromEntries(Object.entries(registry).map(([key,value])=>[key,{...value,enabled:true}]))};
 const now=Date.now(),date=new Date(now+8*3600000).toISOString().slice(0,10),f=setup();f.O=O;
 const row=snapshot(f,3),updated=snapshot(f,5,'cancelled');
 for(const [key,rows,want] of [['relief_assignment',[row],'1 relief duty: P3.'],['relief_urgent',[row],'1 relief duty: P3.'],['relief_updated',[row,updated],'New: P3. Cancelled: P5.']]){
  const summary=O.shortPublicationSummary(rows,key==='relief_updated'),job={id:'test-'+key,claimId:'claim',recipientId:'bob',mobile:'6591234567',name:'Bob',date,expiresAt:now+3600000,kind:'relief_publication',data:{templateKey:key,summary,startAt:now+12*60000}};
  const payload=await M.templateMessage(job,{ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',EXTERNAL_LINK_SECRET:'s'.repeat(40)},config);
  assert.equal(payload.template.name,registry[key].name);assert.equal(payload.template.components[0].parameters[key==='relief_urgent'?3:2].text,want);
  if(key==='relief_urgent')assert.equal(payload.template.components[0].parameters[2].text,'12','approved urgency countdown retains its third field');
  assert.equal(payload.template.components[0].parameters.length,registry[key].fields.length);assert(!summary.includes('\n'));
 }
});
