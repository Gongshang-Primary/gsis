'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {makeHarness}=require('./calendar/backend_harness.cjs');
const html=fs.readFileSync('calendar-update/public/index.html','utf8');
const source=fs.readFileSync('calendar-update/public/app.js','utf8').replace("document.addEventListener('DOMContentLoaded', init);",'').replace(/\}\)\(\);\s*$/,`
 renderAll=()=>{};
 window.testCalendar={state,openTagModal,openLaneModal,openPersonModal,openFormattingModal,openDayNoteModal,renderUrls,renderYearSetup,renderFormatting,renderGlossary,renderPeople,renderColumns};
})();`);
function fixture(prepare){
 const h=makeHarness();h.seed('ColourRules',[{RuleID:'R1',Priority:20,RuleType:'TAG',Field:'OwnerTag',Operator:'EQUALS',Value:'Mtg',FillColour:'#ffffff',Active:'Yes',Locked:'No',Notes:'Old'}]);
 if(prepare)prepare(h);
 const data=h.call('bootstrap',{year:2026}),dom=new JSDOM(html,{url:'https://calendar.example/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];
 w.confirm=()=>true;w.fetch=async(url,options)=>{const req=JSON.parse(options.body);calls.push(req);return {ok:false,status:409,json:async()=>({ok:false,code:'METADATA_CONFLICT',definite:true,error:'A colleague changed this record. Nothing was saved and your draft is retained. Copy your changes, refresh, then review the latest record before saving.'})};};
 vm.runInContext(source,dom.getInternalVMContext());const app=w.testCalendar;
 Object.assign(app.state,{data,year:2026,page:'glossary',readOnly:false});
 return {dom,w,app,data,calls,h,node:id=>w.document.getElementById(id)};
}
const cases=[
 ['saveTag','tagForm','Meaning',f=>f.app.openTagModal(f.data.tags.find(t=>t.Tag==='Mtg')),f=>f.data.metadataRevisions.tags.mtg],
 ['saveLane','laneForm','Header',f=>f.app.openLaneModal(f.data.lanes.find(t=>t.LaneID==='day')),f=>f.data.metadataRevisions.lanes.day],
 ['saveUser','personForm','DisplayName',f=>f.app.openPersonModal(f.data.people.find(t=>t.userAlias==='publisher')),f=>f.data.metadataRevisions.users.publisher],
 ['saveColourRule','formattingForm','Notes',f=>f.app.openFormattingModal(f.data.colourRules[0]),f=>f.data.metadataRevisions.rules.R1],
 ['saveDayNote','dayNoteForm','Text',f=>f.app.openDayNoteModal('2026-09-14','Old'),'missing'],
 ['saveUrls','urlForm','staffCalendarUrl',f=>f.app.renderUrls(),f=>f.data.metadataRevisions.urls],
 ['saveYear','yearForm','RamadanStart',f=>f.app.renderYearSetup(),f=>f.data.metadataRevisions.years[2026],'2026-02-18'],
 ['savePublicHolidays','publicHolidayForm',null,f=>f.app.renderYearSetup(),f=>f.data.metadataRevisions.holidays],
 ['generateYearStructure','structureForm','Vacation1Start',f=>f.app.renderYearSetup(),f=>f.data.metadataRevisions.structure,'2026-03-14']
];
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
(async()=>{
 for(const [action,id,field,open,getToken,value='Unsaved draft']of cases){
  const f=fixture(),token=typeof getToken==='function'?getToken(f):getToken;open(f);const form=f.node(id);assert(form,id);
  if(field){assert(form.elements[field],field);form.elements[field].value=value;}
  // A background state change must not silently rebase an already open form.
  f.app.state.data.metadataRevisions={tags:{mtg:'f'.repeat(64)},lanes:{day:'f'.repeat(64)},users:{publisher:'f'.repeat(64)},rules:{R1:'f'.repeat(64)},notes:{'2026-09-14':'f'.repeat(64)},years:{2026:'f'.repeat(64)},urls:'f'.repeat(64),holidays:'f'.repeat(64),structure:'f'.repeat(64)};
  form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(f.calls.length,1,action+' should submit exactly once');assert.equal(f.calls[0].action,action);
  assert.equal(f.calls[0].payload.expectedMetadataRevision,token,action+' carries opening snapshot revision');
  assert.equal(f.node(id),form,action+' retains same form after conflict');if(field)assert.equal(form.elements[field].value,value);
  assert.match(f.node('toast').textContent,/draft is retained.*refresh/);assert(!f.node('workOverlay')||f.node('workOverlay').classList.contains('hidden'));
  f.dom.window.close();
 }
 for(const action of ['deleteTag','deleteColourRule']){
  const f=fixture();let button,token;
  if(action==='deleteTag'){f.app.renderGlossary();button=f.w.document.querySelector('.delete-tag[data-tag="Mtg"]');token=f.data.metadataRevisions.tags.mtg;}
  else {f.app.openFormattingModal(f.data.colourRules[0]);button=f.node('deleteFormattingBtn');token=f.data.metadataRevisions.rules.R1;}
  assert(button,action+' control');button.click();await settle();assert.equal(f.calls[0].action,action);assert.equal(f.calls[0].payload.expectedMetadataRevision,token);assert.match(f.node('toast').textContent,/draft is retained/);f.dom.window.close();
 }

 for(const kind of ['user','tag','lane']){
  const f=fixture(h=>{
   if(kind==='user')h.call('saveUser',{UserAlias:'publisher',DisplayName:'Inactive user',IsAdmin:'No',IsParentPublisher:'No',Active:'No'});
   if(kind==='tag')h.call('saveTag',{Tag:'Mtg',Meaning:'Inactive tag',Active:'No'});
   if(kind==='lane'){const lane=h.call('bootstrap',{year:2026}).lanes.find(r=>r.LaneID==='day');h.call('saveLane',{...lane,Active:'No'});}
  });
  let form,token;
  if(kind==='user'){f.app.renderPeople();f.w.document.querySelector('.edit-person[data-alias="publisher"]').click();form=f.node('personForm');token=f.data.metadataRevisions.users.publisher;}
  if(kind==='tag'){f.app.renderGlossary();f.w.document.querySelector('.edit-tag[data-tag="Mtg"]').click();form=f.node('tagForm');token=f.data.metadataRevisions.tags.mtg;}
  if(kind==='lane'){f.app.renderColumns();f.w.document.querySelector('.edit-lane[data-id="day"]').click();form=f.node('laneForm');token=f.data.metadataRevisions.lanes.day;}
  assert.equal(form.elements.Active.checked,false,kind+' editor shows stored inactive state');form.elements.Active.checked=true;
  form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(f.calls[0].payload.Active,'Yes');assert.equal(f.calls[0].payload.expectedMetadataRevision,token);f.dom.window.close();
 }
 {
  const f=fixture();let first=true;f.w.fetch=async(url,options)=>{
   const req=JSON.parse(options.body);f.calls.push(req);
   try {const result=f.h.call(req.action,req.payload);if(first){first=false;throw Error('Lost committed response');}return {ok:true,status:200,json:async()=>({result})};}
   catch(error){if(!error.code)throw error;return {ok:false,status:409,json:async()=>({ok:false,error:error.message,code:error.code,definite:error.definite})};}
  };
  f.app.openFormattingModal(null);const form=f.node('formattingForm');form.elements.UseFill.checked=true;form.elements.FillColour.value='#123456';
  form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(f.calls.length,2);assert.match(f.calls[0].payload.RuleID,/^RULE-/);assert.equal(f.calls[0].payload.RuleID,f.calls[1].payload.RuleID);
  assert.equal(f.h.call('bootstrap',{year:2026}).colourRules.filter(r=>r.RuleID===f.calls[0].payload.RuleID).length,1);
  assert.equal(f.node('formattingForm'),form);assert.match(f.node('toast').textContent,/draft is retained/);f.dom.window.close();
 }
 console.log('PASS Calendar 708 metadata UI: nine forms capture opening revision, send once, retain inputs and show refresh guidance on conflict; both destructive metadata controls send revisions; inactive user/tag/lane editors and stable creation retry verified');
})().catch(error=>{console.error(error);process.exitCode=1;});
