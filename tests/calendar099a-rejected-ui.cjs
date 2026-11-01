'use strict';
const assert=require('node:assert/strict'),{fixture,settle}=require('./calendar/row9_ui_fixture.cjs');
(async()=>{
 const f=fixture(),event=f.data.events.find(e=>e.EventID==='E1');f.app.openEventModal(event);f.node('eventForm').elements.StaffTitle.value='My retained proposal';f.node('eventForm').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
 const job=f.jobs[0],latest={...event,StaffTitle:'Colleague saved title',_revision:'colleague-newer'};Object.assign(job,{state:'NEEDS_ATTENTION',outcome:'REJECTED',blocked:false,error:{code:'CONFLICT',message:'Changed after capture',current:latest}});
 await f.app.loadCalendarJobs();assert.equal(f.app.state.data.events.find(e=>e.EventID==='E1').StaffTitle,'Colleague saved title','Rejected proposal restores the latest saved event');
 assert(!f.w.document.querySelector('[data-event-id="JOB-'+job.jobId+'"]'),'Rejected proposal leaves the grid');
 f.app.state.calendarJobsExpanded=true;f.app.renderAll();f.w.document.querySelector('[data-job-proposal]').click();assert(f.node('conflictReview'),'Retained conflict exposes existing side-by-side review');assert.match(f.node('conflictReview').textContent,/Colleague saved title/);assert.match(f.node('conflictReview').textContent,/My retained proposal/);
 f.node('acceptConflictReview').click();assert.equal(f.calls.length,1,'Review alone never sends a replacement');assert.equal(f.node('eventForm').elements.StaffTitle.value,'My retained proposal');
 f.node('eventForm').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(f.calls.length,2);assert.equal(f.calls[1].payload.expectedRevision,'colleague-newer');assert.notEqual(f.calls[1].payload.operationId,job.jobId);f.close();
 console.log('PASS Calendar row 9 rejected job saved-view recovery, conflict review and explicit revised submission');
})().catch(error=>{console.error(error);process.exit(1);});
