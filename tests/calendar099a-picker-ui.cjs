'use strict';
const assert=require('node:assert/strict'),{fixture,settle}=require('./calendar/row9_ui_fixture.cjs');
(async()=>{
 const f=fixture();f.app.openEventModal({...f.data.events[0],Location:'',VenueID:''});const form=f.node('eventForm'),input=f.node('calendarVenueInput');
 const choose=id=>{input.value='alias-'+id;input.dispatchEvent(new f.w.Event('input',{bubbles:true}));f.w.document.querySelector('[data-calendar-venue="room-'+id+'"]').click();};
 choose(0);assert.equal(input.value,'','Choosing a venue clears the search for another');
 choose(1);assert.equal(form.elements.VenueID.value,'room-0,room-1');assert.equal(form.elements.Location.value,'B2-00 Room 0, B2-01 Room 1');
 assert.equal(f.w.document.querySelectorAll('[data-remove-venue]').length,2);assert.equal(f.w.document.querySelector('[data-remove-venue]').getAttribute('aria-label'),'Remove B2-00 Room 0');
 choose(0);assert.equal(form.elements.VenueID.value,'room-0,room-1','Duplicate selection is ignored');
 f.w.document.querySelector('[data-remove-venue]').click();assert.equal(form.elements.VenueID.value,'room-1');
 input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true}));assert.equal(form.elements.VenueID.value,'');
 input.value='Offsite visit';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 assert.equal(form.elements.Location.value,'Offsite visit');assert(f.w.document.querySelector('.calendar-venue-chip.custom'));
 choose(2);assert.equal(form.elements.Location.value,'Offsite visit, B2-02 Room 2');
 input.value='Another custom';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(f.w.document.querySelectorAll('.calendar-venue-chip.custom').length,1,'At most one custom location');
 input.value='';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));for(const id of [0,1,3,4,5,6])choose(id);
 assert.equal(f.w.document.querySelectorAll('[data-remove-venue]').length,6,'Chip count is bounded at six');
 f.close();
 for(const [VenueID,Location,count] of [['room-0','Room 0 (B2-00)',1],['','Custom, with comma',1],['room-0,room-1','B2-00 Room 0, B2-01 Room 1',2]]){
  const f=fixture(),event={...f.data.events[0],VenueID,Location};f.app.openEventModal(event);assert.equal(f.w.document.querySelectorAll('[data-remove-venue]').length,count);assert.equal(f.node('eventForm').elements.Location.value,Location);assert.equal(f.node('eventForm').elements.VenueID.value,VenueID);f.close();
 }
 // Joined legacy fields retain a comma-containing custom chip anywhere.
 for(const Location of ['Custom, with comma, B2-00 Room 0, B2-01 Room 1','B2-00 Room 0, Custom, with comma, B2-01 Room 1','B2-00 Room 0, B2-01 Room 1, Custom, with comma']){
  const f=fixture();f.app.openEventModal({...f.data.events[0],VenueID:'room-0,room-1',Location});const form=f.node('eventForm');assert.equal(f.w.document.querySelectorAll('[data-remove-venue]').length,3);assert.equal(f.w.document.querySelector('.calendar-venue-chip.custom').textContent,'×Custom, with comma');form.elements.StaffTitle.value='Changed title only';form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(f.calls[0].payload.event.VenueID,'room-0,room-1');assert.equal(f.calls[0].payload.event.Location,Location);f.close();
 }
 {
  const f=fixture();f.data.venues[0].name='Room, East';const Location='B2-00 Room, East, Custom, with comma, B2-01 Room 1';f.app.openEventModal({...f.data.events[0],VenueID:'room-0,room-1',Location});assert.equal(f.w.document.querySelectorAll('[data-remove-venue]').length,3);assert.equal(f.w.document.querySelector('.calendar-venue-chip').textContent,'×B2-00 Room, East');assert.equal(f.node('eventForm').elements.Location.value,Location);f.close();
 }
 // A save flushes a typed custom location without an extra Enter, and closes at receipt.
 {
  const f=fixture();f.app.openEventModal({...f.data.events[0],Location:'',VenueID:''});const form=f.node('eventForm');f.node('calendarVenueInput').value='Typed before Save';form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(f.calls[0].payload.event.Location,'Typed before Save');assert(!f.node('eventForm'));f.close();
 }
 console.log('PASS Calendar row 9 picker: multiple chips, duplicate guard, removal, Backspace, custom location, cap, legacy open and submit');
})().catch(error=>{console.error(error);process.exit(1);});
