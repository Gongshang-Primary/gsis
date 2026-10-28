'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {makeHarness}=require('./calendar/backend_harness.cjs');
function fixture(){
 const h=makeHarness();
 h.seed('ColourRules',[{RuleID:'R1',Priority:20,RuleType:'TAG',Field:'OwnerTag',Operator:'EQUALS',Value:'Mtg',FillColour:'#ffffff',TextColour:'',BorderColour:'',Active:'Yes',Locked:'No',Notes:'First'},{RuleID:'R2',Priority:10,RuleType:'TAG',Field:'OwnerTag',Operator:'EQUALS',Value:'PSLE',FillColour:'#eeeeee',TextColour:'',BorderColour:'',Active:'Yes',Locked:'No',Notes:'Second'}]);
 h.seed('DayNotes',[{NoteID:'N1',Year:2026,Date:'2026-09-14',Text:'Old',CreatedAt:'',CreatedBy:'',UpdatedAt:'',UpdatedBy:''}]);
 return h;
}
const specs=[
 ['saveTag',{Tag:'Mtg',Meaning:'Draft',Active:'Yes'},b=>b.metadataRevisions.tags.mtg,'Tags','Meaning'],
 ['deleteTag',{Tag:'Mtg'},b=>b.metadataRevisions.tags.mtg,'Tags','Meaning'],
 ['saveLane',{LaneID:'day',Header:'Draft'},b=>b.metadataRevisions.lanes.day,'Lanes','Header'],
 ['saveColourRule',{RuleID:'R1',RuleType:'TAG',Value:'Mtg',FillColour:'#dddddd',Active:'Yes'},b=>b.metadataRevisions.rules.R1,'ColourRules','Notes'],
 ['deleteColourRule',{RuleID:'R1'},b=>b.metadataRevisions.rules.R1,'ColourRules','Notes'],
 ['reorderColourRules',{RuleIDs:['R2','R1']},b=>b.metadataRevisions.ruleOrder,'ColourRules','Priority'],
 ['saveUser',{UserAlias:'publisher',DisplayName:'Draft',IsAdmin:'No',IsParentPublisher:'Yes',Active:'Yes'},b=>b.metadataRevisions.users.publisher,'Users','DisplayName',2],
 ['saveYear',{Year:2026,Status:'ACTIVE',ReleasedToTeachers:'Yes'},b=>b.metadataRevisions.years[2026],'Years','RamadanStart'],
 ['saveUrls',{staffCalendarUrl:'new',parentCalendarUrl:'new'},b=>b.metadataRevisions.urls,'Settings','Value',null,'STAFF_CALENDAR_URL'],
 ['saveDayNote',{year:2026,date:'2026-09-14',text:'Draft'},b=>b.metadataRevisions.notes['2026-09-14'],'DayNotes','Text'],
 ['savePublicHolidays',{Year:2026,holidays:[]},b=>b.metadataRevisions.holidays,'Years','RamadanStart'],
 ['generateYearStructure',{Year:2026},b=>b.metadataRevisions.structure,'Events','StaffTitle']
];
for(const [action,payload,tokenFor,sheetName,field,index=1,key] of specs){
 const h=fixture(),snapshot=h.call('bootstrap',{year:2026}),token=tokenFor(snapshot);
 h.sandbox.rc18ResetIO_();
 assert.equal(token,h.sandbox.calendarMetadataRevision_(h.sandbox.calendarMetadataCurrent_(action,payload)),action+' actual bootstrap snapshot token must match fresh record');
 const sheet=h.sheets.get(sheetName),row=key?sheet.values.findIndex(r=>r[0]===key):index;
 const col=sheet.values[0].indexOf(field);assert(col>=0&&row>0);
 // Simulate an already committed concurrent writer after the user opened the form.
 sheet.values[row][col]=field==='Priority'?37:field==='RamadanStart'?'2026-02-18':'Colleague edit';
 const before=JSON.stringify([...h.sheets].map(([name,s])=>[name,s.values])),writes=h.audit.nativeWrites.length;
 assert.throws(()=>h.call(action,{...payload,expectedMetadataRevision:token}),e=>e.status===409&&e.code==='METADATA_CONFLICT'&&e.definite&&/draft is retained/.test(e.message),action);
 assert.equal(h.audit.nativeWrites.length,writes,action+' must not write any operational/audit row');
 assert.equal(JSON.stringify([...h.sheets].map(([name,s])=>[name,s.values])),before);
 // Requests from older open clients may not bypass concurrency by omitting the token.
 assert.throws(()=>h.sandbox.dispatch_(action,h.actor('admin'),payload,crypto.randomUUID()),e=>e.status===409&&e.code==='METADATA_REFRESH_REQUIRED'&&e.definite&&/refresh/.test(e.message));
}
{
 const h=fixture(),b=h.call('bootstrap',{year:2026});
 h.call('saveTag',{Tag:'Mtg',Meaning:'A wins',Active:'Yes',expectedMetadataRevision:b.metadataRevisions.tags.mtg});
 assert.throws(()=>h.call('saveTag',{Tag:'Mtg',Meaning:'Meeting',Active:'No',expectedMetadataRevision:b.metadataRevisions.tags.mtg}),e=>e.code==='METADATA_CONFLICT');
 assert.equal(h.call('bootstrap',{year:2026}).tags.find(t=>t.Tag==='Mtg').Meaning,'A wins');
 // Separate metadata records do not share a global revision.
 h.call('saveTag',{Tag:'PSLE',Meaning:'Independent edit',Active:'Yes',expectedMetadataRevision:b.metadataRevisions.tags.psle});
 h.call('saveTag',{Tag:'New',Meaning:'First creator',Active:'Yes',expectedMetadataRevision:'missing'});
 assert.throws(()=>h.call('saveTag',{Tag:'new',Meaning:'Second creator',Active:'Yes',expectedMetadataRevision:'missing'}),e=>e.code==='METADATA_CONFLICT');
}
{
 const h=fixture(),b=h.call('bootstrap',{year:2026}),native=h.sandbox.LockService;let waited=false;
 h.sandbox.LockService={getScriptLock:()=>{const lock=native.getScriptLock();return {tryLock(ms){if(!waited){waited=true;h.sheets.get('Tags').values[1][1]='Winner while waiting';}return lock.tryLock(ms);},releaseLock(){lock.releaseLock();}};}};
 assert.throws(()=>h.call('saveTag',{Tag:'Mtg',Meaning:'Stale queued edit',Active:'Yes',expectedMetadataRevision:b.metadataRevisions.tags.mtg}),e=>e.code==='METADATA_CONFLICT');
 assert.equal(h.audit.nativeWrites.length,0,'Conflict comparison occurs inside acquired lock');
}
{
 const h=fixture(),b=h.call('bootstrap',{year:2026});
 const ordered=h.call('reorderColourRules',{RuleIDs:['R2','R1'],expectedMetadataRevision:b.metadataRevisions.ruleOrder});
 const r=ordered.find(r=>r.RuleID==='R1');
 h.call('saveColourRule',{...r,Notes:'Edit immediately after reorder',expectedMetadataRevision:r._metadataRevision});
 assert.throws(()=>h.call('reorderColourRules',{RuleIDs:['R1','R2'],expectedMetadataRevision:b.metadataRevisions.ruleOrder}),e=>e.code==='METADATA_CONFLICT');
 const note=h.call('saveDayNote',{year:2026,date:'2026-09-14',text:'First save',expectedMetadataRevision:b.metadataRevisions.notes['2026-09-14']});
 const next=h.call('saveDayNote',{year:2026,date:'2026-09-14',text:'Second save',expectedMetadataRevision:note.metadataRevision});
 const deleted=h.call('saveDayNote',{year:2026,date:'2026-09-14',text:'',expectedMetadataRevision:next.metadataRevision});
 assert.equal(deleted.metadataRevision,'missing');
 h.call('saveDayNote',{year:2026,date:'2026-09-14',text:'Recreate',expectedMetadataRevision:deleted.metadataRevision});
}
{
 const h=fixture();h.seed('LaneSchedule',[{LaneID:'day',Weekday:'MON',Enabled:'Yes',DefaultStartTime:'07:30',DefaultEndTime:'13:30'}]);
 const b=h.call('bootstrap',{year:2026});h.sandbox.rc18ResetIO_();
 assert.equal(b.metadataRevisions.lanes.day,h.sandbox.calendarMetadataRevision_(h.sandbox.calendarMetadataCurrent_('saveLane',{LaneID:'day'})));
 const s=h.sheets.get('LaneSchedule');s.values[1][s.values[0].indexOf('DefaultEndTime')]='14:00';
 assert.throws(()=>h.call('saveLane',{LaneID:'day',expectedMetadataRevision:b.metadataRevisions.lanes.day}),e=>e.code==='METADATA_CONFLICT','Weekly schedule participates in lane revision');
}
{
 const h=fixture(),old=h.sandbox.userRowsCached_();
 h.call('saveUser',{UserAlias:'publisher',DisplayName:'Changed role',IsAdmin:'Yes',IsParentPublisher:'No',Active:'Yes'});
 // A delayed display reader repopulates the old catalogue after invalidation.
 h.sandbox.CacheService.getScriptCache().put('calv2:users:rc19',JSON.stringify(old),120);
 const b=h.call('bootstrap',{year:2026}),person=b.people.find(r=>r.userAlias==='publisher');
 assert.equal(person.isAdmin,true);assert.equal(person.isParentPublisher,false);
 h.call('saveUser',{UserAlias:person.userAlias,DisplayName:person.displayName,IsAdmin:person.isAdmin?'Yes':'No',IsParentPublisher:person.isParentPublisher?'Yes':'No',Active:'Yes',expectedMetadataRevision:b.metadataRevisions.users.publisher});
 const fresh=h.call('bootstrap',{year:2026}).people.find(r=>r.userAlias==='publisher');
 assert.equal(fresh.isAdmin,true);assert.equal(fresh.isParentPublisher,false,'Displayed roles and revision share one fresh source snapshot');
}
{
 const h=fixture(),b=h.call('bootstrap',{year:2026}),lane=b.editableLanes.find(r=>r.LaneID==='day'),tag=b.editableTags.find(r=>r.Tag==='Mtg');
 h.call('saveUser',{UserAlias:'publisher',DisplayName:'Inactive role',IsAdmin:'No',IsParentPublisher:'No',Active:'No',expectedMetadataRevision:b.metadataRevisions.users.publisher});
 h.call('saveTag',{...tag,Active:'No',expectedMetadataRevision:b.metadataRevisions.tags.mtg});
 h.call('saveLane',{...lane,Active:'No',expectedMetadataRevision:b.metadataRevisions.lanes.day});
 const inactive=h.call('bootstrap',{year:2026});
 assert.equal(inactive.people.find(r=>r.userAlias==='publisher').active,false);
 assert(!inactive.tags.some(r=>r.Tag==='Mtg'));assert(!inactive.lanes.some(r=>r.LaneID==='day'));
 assert.equal(inactive.editableTags.find(r=>r.Tag==='Mtg').Active,'No');
 assert.equal(inactive.editableLanes.find(r=>r.LaneID==='day').Active,'No');
 const viewer=h.call('bootstrap',{year:2026},'publisher');
 assert.equal(viewer.editableTags,undefined);assert.equal(viewer.editableLanes,undefined);assert(!viewer.people.some(r=>r.userAlias==='publisher'));
 h.call('saveUser',{UserAlias:'publisher',DisplayName:'Restored role',IsAdmin:'No',IsParentPublisher:'Yes',Active:'Yes',expectedMetadataRevision:inactive.metadataRevisions.users.publisher});
 h.call('saveTag',{...inactive.editableTags.find(r=>r.Tag==='Mtg'),Active:'Yes',expectedMetadataRevision:inactive.metadataRevisions.tags.mtg});
 h.call('saveLane',{...inactive.editableLanes.find(r=>r.LaneID==='day'),Active:'Yes',expectedMetadataRevision:inactive.metadataRevisions.lanes.day});
 const restored=h.call('bootstrap',{year:2026});assert(restored.people.find(r=>r.userAlias==='publisher').active);assert(restored.tags.some(r=>r.Tag==='Mtg'));assert(restored.lanes.some(r=>r.LaneID==='day'));
}
{
 const h=fixture(),payload={RuleID:'RULE-'+crypto.randomUUID(),RuleType:'TAG',Value:'Mtg',FillColour:'#123456',Active:'Yes',expectedMetadataRevision:'missing'};
 let lost=false;h.setFault(stage=>{if(stage==='after'&&!lost){lost=true;throw Error('Synthetic lost committed response');}});
 assert.throws(()=>h.call('saveColourRule',payload));h.setFault(null);
 assert.throws(()=>h.call('saveColourRule',payload),e=>e.code==='METADATA_CONFLICT');
 assert.equal(h.call('bootstrap',{year:2026}).colourRules.filter(r=>r.RuleID===payload.RuleID).length,1,'Stable form identity prevents a duplicate after lost commit response');
}
console.log('PASS Calendar 708 metadata: 12 actions use actual bootstrap revisions, stale/missing rejected with zero writes, under-lock comparison, independent records, duplicate creation, lane schedule, coherent fresh admin role values/revisions, note local-save chain, rule reorder/edit chain, inactive metadata restoration and duplicate-free lost-response create');
