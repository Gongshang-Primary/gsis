
'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {makeHarness}=require('./calendar/backend_harness.cjs');
function execute(h,action,payload,alias='admin'){
 return JSON.parse(h.sandbox.doPost({postData:{contents:JSON.stringify({proxySecret:'synthetic-secret',service:'gsis-calendar-command-v1',purpose:'calendar-mutation-job-v1',action:'calendarCommand',mode:'execute',actor:h.actor(alias),commandId:payload.operationId,operation:{action,payload}})}}).text);
}
function proposal(h,extra={}){const event=h.event('E1');return {operationId:crypto.randomUUID(),expectedRevision:event._revision,event:{...event,StaffTitle:'Queued direct execute'},...extra};}
// Removing any execute-time fence must fail without a preceding authorize call.
for(const scenario of ['stale','archived','invalid','non-editor','relocation','pending']){
 const h=makeHarness(),p=proposal(h),before=h.event('E1');let action='saveEvent',alias='admin',want;
 if(scenario==='stale'){p.expectedRevision='stale';want='CONFLICT';}
 if(scenario==='archived'){h.seed('Years',[{Year:2026,Status:'ARCHIVED',ReleasedToTeachers:'Yes'}]);want='ARCHIVED';}
 if(scenario==='invalid'){p.event.StaffTitle='';want='Staff title';}
 if(scenario==='non-editor'){alias='publisher';want=403;}
 if(scenario==='relocation'){action='relocateEvent';Object.assign(p,{eventId:'E1',mode:'invalid',year:2026,targetDate:'2026-09-15',targetLaneId:'day'});delete p.event;want='Choose Move or Copy';}
 if(scenario==='pending'){
  h.setFault((stage,w)=>{if(stage==='before'&&w.sheet==='Events')throw Error('Lost dispatch');});
  assert.equal(execute(h,'saveEvent',proposal(h)).code,'UNKNOWN');h.setFault(null);want='PENDING_EVENT_WRITE';
 }
 const result=execute(h,action,p,alias);assert.equal(result.ok,false,scenario+' must reject');assert.equal(result.definite,true,scenario+' denial must be definite');
 if(typeof want==='number')assert.equal(result.status,want);else assert.match(result.code+' '+result.error,new RegExp(want));
 assert.equal(h.event('E1').StaffTitle,before.StaffTitle,scenario+' must retain saved event');
}
{
 const h=makeHarness(),p=proposal(h);assert.equal(execute(h,'saveEvent',p).ok,true,'Direct execution still saves a valid accepted proposal');
}
console.log('PASS Calendar row 9 execute enforces permissions, pending event, revision, archived year, event validation and relocation mode without authorize');

function venuesFixture(){
 const h=makeHarness();h.sandbox.calendarVenueCatalogue_=()=>({venues:Array.from({length:7},(_,i)=>({id:'room-'+i,unit:'B2-0'+i,name:'Room '+i,aliases:[],active:true})),venueSource:{status:'ready'}});return h;
}
// Dropping an id, permitting duplicates/unknown ids or losing the joined labels must fail.
{
 const h=venuesFixture(),p=proposal(h);Object.assign(p.event,{VenueID:'room-0,room-1',Location:'B2-00 Room 0, B2-01 Room 1'});
 const saved=execute(h,'saveEvent',p);assert.equal(saved.ok,true,saved.error);assert.equal(saved.result.VenueID,'room-0,room-1');assert.equal(saved.result.Location,'B2-00 Room 0, B2-01 Room 1');
 const next={operationId:crypto.randomUUID(),eventId:'E1',expectedRevision:saved.result._revision,mode:'copy',year:2026,anchorDate:saved.result.StartDate,targetDate:'2026-09-15',targetLaneId:'day',targetShift:'NONE'};
 const copied=execute(h,'relocateEvent',next);assert.equal(copied.ok,true,copied.error);assert.equal(copied.result.VenueID,'room-0,room-1');assert.equal(copied.result.Location,p.event.Location);
}
for(const ids of ['room-0,unknown','room-0,room-0',Array.from({length:7},(_,i)=>'room-'+i).join(',')]){
 const h=venuesFixture(),p=proposal(h);Object.assign(p.event,{VenueID:ids,Location:'B2-00 Room 0, B2-01 Room 1'});const result=execute(h,'saveEvent',p);assert.equal(result.ok,false,ids+' must reject');assert.equal(h.event('E1').VenueID||'','');
}
for(const location of ['B2-00 Room 0, Offsite meeting','Offsite meeting, B2-00 Room 0']){
 const h=venuesFixture(),p=proposal(h);Object.assign(p.event,{VenueID:'room-0',Location:location});const result=execute(h,'saveEvent',p);assert.equal(result.ok,true,result.error);assert.equal(result.result.VenueID,'room-0');assert.equal(result.result.Location,location);
}
console.log('PASS Calendar row 9 multiple venue identities, copy preservation, custom text, unknown/duplicate ids and six-venue limit');
// The six-location cap includes the one optional free-text chip.
{
 const h=venuesFixture(),p=proposal(h);Object.assign(p.event,{VenueID:'room-0,room-1,room-2,room-3,room-4,room-5',Location:'B2-00 Room 0, B2-01 Room 1, B2-02 Room 2, B2-03 Room 3, B2-04 Room 4, B2-05 Room 5, Offsite'});assert.equal(execute(h,'saveEvent',p).ok,false,'Six directory venues plus custom text exceeds six locations');
}
for(const location of ['Custom, with comma, B2-00 Room 0, B2-01 Room 1','B2-00 Room 0, Custom, with comma, B2-01 Room 1','B2-00 Room 0, B2-01 Room 1, Custom, with comma']){
 const h=venuesFixture(),p=proposal(h);Object.assign(p.event,{VenueID:'room-0,room-1',Location:location});let saved=execute(h,'saveEvent',p);assert.equal(saved.ok,true,saved.error);
 for(const mode of ['move','copy']){
  const relocated=execute(h,'relocateEvent',{operationId:crypto.randomUUID(),eventId:'E1',expectedRevision:saved.result._revision,mode,year:2026,anchorDate:saved.result.StartDate,targetDate:'2026-09-15',targetLaneId:'day',targetShift:'NONE'});assert.equal(relocated.ok,true,relocated.error);assert.equal(relocated.result.VenueID,'room-0,room-1');assert.equal(relocated.result.Location,location);if(mode==='move')saved=relocated;
 }
}
console.log('PASS Calendar row 9 six total locations and comma-containing custom labels retain order through move/copy');
// An unchanged field cannot smuggle an unknown id past an available catalogue.
{
 const h=venuesFixture();h.seed('Events',[{...h.base,EventID:'E1',VenueID:'room-0,unknown',Location:'B2-00 Room 0, Unknown room'}]);assert.equal(execute(h,'saveEvent',proposal(h)).ok,false);
}
