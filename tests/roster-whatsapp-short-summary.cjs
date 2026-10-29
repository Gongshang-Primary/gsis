'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fixture=require('./roster701-fixture.cjs');

function setup(){const f=fixture();f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();return f;}
function snapshot(f,period,kind='assigned',extra={}){
 const a={id:f.ctx.uuid(),staffId:'bob',date:f.date,period,timeStart:'08:30',timeEnd:'09:00',className:'4A',subject:'EL',groupName:'Group B',venue:'Room 2-3',status:kind==='cancelled'?'cancelled':'published',publishedAt:f.ctx.iso,instructions:'Read page 12.',customInstructions:'Use Gate A.',...extra};
 f.state.assignments.push(a);return f.O.publicationSnapshot(f.state,f.ctx,a,kind);
}
const full='P3 08:30 4A · EL · Group B · Room 2-3 (class combination)\nRead page 12.\nSMC: Use Gate A.';

test('assignment and urgent summaries count unique periods in numeric order',()=>{
 const f=setup(),rows=[snapshot(f,16),snapshot(f,3,'assigned',{combination:true}),snapshot(f,0),snapshot(f,3,'assigned',{className:'4B'})];
 for(const key of ['relief_assignment','relief_urgent']){
  assert.equal(f.O.publicationSummary(rows,key),'3 relief duties: P0, P3, P16.');
  assert.equal(f.O.publicationSummary([rows[1]],key),'1 relief duty: P3.');
  assert.equal(f.O.publicationSummary([rows[1],snapshot(f,5)],key),'2 relief duties: P3, P5.');
 }
 const all=Array.from({length:17},(_,p)=>snapshot(f,p));
 assert(f.O.publicationSummary(all,'relief_assignment').length<1024);
});
test('updates list only applicable New, Changed and Cancelled periods',()=>{
 const f=setup(),rows=[snapshot(f,5,'cancelled'),snapshot(f,3,'instructions'),snapshot(f,4),snapshot(f,3,'instructions',{className:'4B'})];
 assert.equal(f.O.publicationSummary(rows,'relief_updated'),'New: P4. Changed: P3. Cancelled: P5.');
 assert.equal(f.O.publicationSummary([...rows,snapshot(f,12),snapshot(f,10,'instructions'),snapshot(f,11,'cancelled')],'relief_updated'),'New: P4, P12. Changed: P3, P10. Cancelled: P5, P11.');
 const all=['assigned','instructions','cancelled'].flatMap(kind=>Array.from({length:17},(_,p)=>snapshot(f,p,kind)));
 assert(f.O.publicationSummary(all,'relief_updated').length<1024);
 for(const [kind,want] of [['assigned','New: P3.'],['instructions','Changed: P3.'],['cancelled','Cancelled: P3.']])assert.equal(f.O.publicationSummary([snapshot(f,3,kind)],'relief_updated'),want);
});
test('reminder and peer summaries preserve every original byte',()=>{
 const f=setup(),row=snapshot(f,3,'assigned',{combination:true});
 for(const key of [undefined,'relief_reminder','mutual_override'])assert.equal(f.O.publicationSummary([row],key),full);
 assert.equal(f.O.publicationSummary([snapshot(f,5,'cancelled')],'mutual_override'),'Cancelled: P5 08:30 4A · EL · Group B · Room 2-3\nRead page 12.\nSMC: Use Gate A.');
});
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
  const summary=O.publicationSummary(rows,key),job={id:'test-'+key,claimId:'claim',recipientId:'bob',mobile:'6591234567',name:'Bob',date,expiresAt:now+3600000,kind:'relief_publication',data:{templateKey:key,summary,startAt:now+12*60000}};
  const payload=await M.templateMessage(job,{ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',EXTERNAL_LINK_SECRET:'s'.repeat(40)},config);
  assert.equal(payload.template.name,registry[key].name);assert.equal(payload.template.components[0].parameters[key==='relief_urgent'?3:2].text,want);
  if(key==='relief_urgent')assert.equal(payload.template.components[0].parameters[2].text,'12','approved urgency countdown retains its third field');
  assert.equal(payload.template.components[0].parameters.length,registry[key].fields.length);assert(!summary.includes('\n'));
 }
});
