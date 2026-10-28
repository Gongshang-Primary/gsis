'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {makeHarness}=require('./calendar/backend_harness.cjs');
function fixture(){const h=makeHarness();if(fs.existsSync('calendar-backend/VenueDirectory.gs'))vm.runInContext(fs.readFileSync('calendar-backend/VenueDirectory.gs','utf8'),h.sandbox);h.sandbox.calendarVenueCatalogue_=()=>({venues:[{id:'stable-room',unit:'A1-01',name:'Meeting room',aliases:['Old meeting room'],active:true}],venueSource:{status:'ready'}});return h;}
{
 const h=fixture();assert.equal(h.spec.HEADERS.Events.at(-1),'VenueID');
 const s=h.sheets.get('Events');s.values=s.values.map(r=>r.slice(0,-1));const before=JSON.stringify(s.values.slice(1));h.sandbox.upgradeCalendarToRC19();h.sandbox.upgradeCalendarToRC19();
 assert.equal(s.values[0].at(-1),'VenueID');assert.equal(JSON.stringify(s.values.slice(1)),before,'Header-only migration preserves every historical row byte');
 assert.equal(s.values[0].filter(x=>x==='VenueID').length,1);assert.equal(s.values[0].indexOf('LastMutationID'),29);
}
{
 const h=fixture(),sheet=h.sheets.get('Events');sheet.values=sheet.values.map(r=>r.slice(0,-1));sheet.values[0].push('LocalFormula');sheet.values[1].push('=SUM(1,2)');
 h.sandbox.upgradeCalendarToRC19();assert.equal(sheet.values[0].at(-1),'VenueID');assert.equal(sheet.values[1][30],'=SUM(1,2)');
 const before=h.event('E1'),saved=h.call('saveEvent',{event:{...before,StaffTitle:'Preserve custom column'},expectedRevision:before._revision,operationId:crypto.randomUUID()});assert.equal(saved.StaffTitle,'Preserve custom column');assert.equal(sheet.values[1][30],'=SUM(1,2)');
 const created=h.call('saveEvent',{event:{...h.base,EventID:'',Location:'Custom'},operationId:crypto.randomUUID()});assert(created.EventID);assert.equal(h.event(created.EventID).Location,'Custom');assert.equal(sheet.values[1][30],'=SUM(1,2)');
}
{
 const h=fixture(),before=h.event('E1');const save=(event,expectedRevision)=>h.call('saveEvent',{event,expectedRevision,operationId:crypto.randomUUID()});
 const selected=save({...before,Location:'Meeting room (A1-01)',VenueID:'stable-room'},before._revision);assert.equal(selected.VenueID,'stable-room');
 const custom=save({...selected,Location:'Custom field trip location'},selected._revision);assert.equal(custom.VenueID,'');assert.equal(custom.Location,'Custom field trip location');
 assert.throws(()=>save({...custom,VenueID:'not-a-room'},custom._revision),/venue/i);
 h.sandbox.calendarVenueCatalogue_=()=>({venues:[],venueSource:{status:'unavailable'}});
 const plain=save({...custom,Location:'Another custom place',VenueID:''},custom._revision);assert.equal(plain.Location,'Another custom place');
}
{
 const h=fixture(),b=h.call('bootstrap',{year:2026});assert.equal(b.venues[0].id,'stable-room');assert.equal(b.venueSource.status,'ready');
 const r=h.call('saveTag',{Tag:'new',Meaning:'New tag'});assert.equal(r._metadataRevision,h.sandbox.calendarMetadataRevision_({...r,_metadataRevision:undefined}));
 assert.equal(h.call('deleteTag',{Tag:r.Tag})._metadataRevision,'missing');
}
{
 const h=makeHarness(),key='k'.repeat(40);h.props.set('GSIS_SECRET',key);h.props.set('VENUES_APPS_SCRIPT_URL','https://script.google.com/macros/s/catalogue/exec');
 h.sandbox.Utilities.computeHmacSha256Signature=(payload,secret)=>Array.from(crypto.createHmac('sha256',secret).update(payload).digest());
 h.sandbox.UrlFetchApp={fetch(url,options){const outer=JSON.parse(options.payload),p=JSON.parse(outer.payload);assert.equal(outer.signature,crypto.createHmac('sha256',key).update(outer.payload).digest('hex'));assert.equal(p.purpose,'calendar-venue-catalogue-v1');assert.equal(p.identity.subject,h.actor('admin').sub);assert.equal(p.input.operation,'calendarLookup');return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,data:{venues:[{id:'canonical',unit:'A1-01',name:'Current room',aliases:['Old room'],active:true,privateNote:'must not escape'}]}})};}};
 const loaded=h.call('bootstrap',{year:2026});assert.equal(loaded.venues[0].id,'canonical');assert.equal(loaded.venueSource.status,'ready');assert(!('privateNote' in loaded.venues[0]));
 h.sandbox.UrlFetchApp.fetch=()=>{throw Error('source offline');};const offline=h.call('bootstrap',{year:2026});assert.equal(offline.venueSource.status,'unavailable');assert.equal(offline.events.length,2);
}
console.log('PASS Calendar 098j stable venue identity, append-only upgrade, custom text and tag revisions');
