'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {makeHarness}=require('./calendar/backend_harness.cjs');
function fixture(){const h=makeHarness();if(fs.existsSync('calendar-backend/Commands.gs'))vm.runInContext(fs.readFileSync('calendar-backend/Commands.gs','utf8'),h.sandbox);return h;}
function request(h,mode,payload,extra={}){return JSON.parse(h.sandbox.doPost({postData:{contents:JSON.stringify({proxySecret:'synthetic-secret'.repeat(3),service:'gsis-calendar-command-v1',purpose:'calendar-mutation-job-v1',action:'calendarCommand',mode,actor:h.actor('admin'),commandId:payload.operationId,operation:{action:'saveEvent',payload},...extra})}}).text);}
{
 const h=fixture(),event=h.event('E1'),payload={event:{...event,StaffTitle:'Queued change'},expectedRevision:event._revision,operationId:crypto.randomUUID()},before=JSON.stringify(h.sheets.get('Events').values),writes=h.audit.nativeWrites.length;
 const auth=request(h,'authorize',payload);assert.equal(auth.ok,true,auth.error);assert.equal(auth.result.authorized,true);assert.equal(h.audit.nativeWrites.length,writes);assert.equal(JSON.stringify(h.sheets.get('Events').values),before);
 const saved=request(h,'execute',payload);assert.equal(saved.ok,true,saved.error);assert.equal(saved.result.StaffTitle,'Queued change');assert.equal(saved.result.UpdatedBy,'admin');
 const count=h.audit.nativeWrites.length;assert.equal(request(h,'status',payload).result.state,'SAVED');assert.equal(request(h,'execute',payload).ok,true);assert.equal(h.audit.nativeWrites.length,count,'Exact replay/status may not mutate twice');
 assert.equal(request(h,'execute',{...payload,event:{...payload.event,StaffTitle:'Changed immutable request'}}).code,'OPERATION_MISMATCH');
 assert.equal(request(h,'status',payload,{actor:{...h.actor('admin'),sub:'different-google-subject'}}).code,'OPERATION_MISMATCH','The same email with another Google subject cannot claim an accepted command');
}
{
 const h=fixture(),event=h.event('E1'),payload={event:{...event,StaffTitle:'No'},expectedRevision:event._revision,operationId:crypto.randomUUID()};
 assert.equal(request(h,'execute',payload,{purpose:'roster-message'}).ok,false);assert.equal(request(h,'execute',payload,{actor:{...h.actor('publisher'),userAlias:'admin'}}).ok,false);
 assert.equal(request(h,'authorize',payload,{actor:h.actor('publisher')}).status,403);
 assert.equal(request(h,'authorize',payload).ok,true);h.seed('Users',[{UserAlias:'admin',Active:'No',IsAdmin:'No'}]);assert.equal(request(h,'execute',payload).status,403);assert.equal(h.event('E1').StaffTitle,event.StaffTitle);
}
{
 const h=fixture(),event=h.event('E1'),payload={event:{...event,StaffTitle:'Stale'},expectedRevision:'old',operationId:crypto.randomUUID()};
 assert.equal(request(h,'authorize',payload).code,'CONFLICT');
 const current={...payload,expectedRevision:event._revision};assert.equal(request(h,'status',current).result.state,'NOT_SAVED');assert.equal(request(h,'execute',current).code,'NOT_SAVED');
}
for(const action of ['deleteEvent','saveParentSide','relocateEvent']){
 const h=fixture(),event=h.event('E1'),payload={eventId:'E1',expectedRevision:event._revision,operationId:crypto.randomUUID(),...(action==='saveParentSide'?{ParentEnabled:'Yes',ParentTitle:'Permitted parent edit'}:{}),...(action==='relocateEvent'?{mode:'copy',year:2026,anchorDate:'2026-09-14',targetDate:'2026-09-15',targetLaneId:'after_school',targetShift:'PM_I'}:{})},extra={operation:{action,payload},...(action==='saveParentSide'?{actor:h.actor('publisher')}:{})};
 assert.equal(request(h,'authorize',payload,extra).ok,true);const saved=request(h,'execute',payload,extra);assert.equal(saved.ok,true,saved.error);assert.equal(request(h,'status',payload,extra).result.state,'SAVED');
 const writes=h.audit.nativeWrites.length;assert.equal(request(h,'execute',payload,extra).ok,true);assert.equal(h.audit.nativeWrites.length,writes);
}
{
 const h=fixture(),event=h.event('E1'),payload={event:{...event,StaffTitle:'Unknown dispatch'},expectedRevision:event._revision,operationId:crypto.randomUUID()};
 h.setFault((stage,w)=>{if(stage==='before'&&w.sheet==='Events')throw Error('Lost before acknowledgement');});
 assert.equal(request(h,'execute',payload).code,'UNKNOWN');h.setFault(null);const writes=h.audit.nativeWrites.length;assert.equal(request(h,'status',payload).result.state,'UNKNOWN');assert.equal(request(h,'execute',payload).code,'UNKNOWN');assert.equal(h.audit.nativeWrites.length,writes,'An uncertain Google write cannot be blindly replayed');
}
{
 const h=fixture();h.seed('Events',Array.from({length:20},(_,i)=>({...h.base,EventID:'BURST-'+i})));
 const proposals=Array.from({length:20},(_,i)=>{const event=h.event('BURST-'+i);return {event:{...event,StaffTitle:'Independent queued event '+i},expectedRevision:event._revision,operationId:crypto.randomUUID()};});
 let forbidden=0;h.setFault(stage=>{if(stage==='apiReadBefore'){forbidden++;throw Error("Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute per user'.");}});
 for(const payload of proposals){assert.equal(request(h,'authorize',payload).ok,true);assert.equal(request(h,'execute',payload).ok,true);assert.equal(request(h,'status',payload).result.state,'SAVED');}
 assert.equal(forbidden,0,'Accepted independent commands must not exhaust the separate Sheets API read quota');assert(h.audit.nativeWrites.length>=40);
 h.seed('Users',[{UserAlias:'admin',IsAdmin:'No',Active:'No'}]);assert.equal(request(h,'execute',proposals[0]).status,403,'Native reads still recheck revoked roles');
}
console.log('PASS Calendar 098j command authorization, exact receipts, identity and revision fences');
