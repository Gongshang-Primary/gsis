const assert=require('assert/strict'),fs=require('fs'),make=require('./dom-helper.cjs');
function setup(){
 const u=make();
 u.run(`
 roleCatalogue=[{role:'Teacher',level:'EO',groups:[]},{role:'OSO',level:'',groups:['Support']}];
 function hr506Person(id,name,active,role='Teacher'){return {id,name,active,role,profile:{'Basic Name':name,Role:role,'EO Appt Level':role==='Teacher'?'EO':'','Appointment Status':'Permanent','Employment Modifier':'','Subject Modifier':'',Active:active?'Y':'N'}}}
 v().teachers=[hr506Person('active','Zed Active',true),hr506Person('owned','Version-owned name',true),hr506Person('old','Old Version',false)];
 v().teacherNotes={old:'First line\\nSecond line\\nFull stored note'};
 staffCatalog=new Map([hr506Person('owned','Contacts old name',false),hr506Person('former','Former Teacher',false),hr506Person('other','Another Former',false),hr506Person('support','Former Support',false,'OSO'),hr506Person('newactive','New Active',true)].map(t=>[t.id,t]));
 tab='Teachers';render();
 `);
 return u;
}
const ids=u=>[...u.w.document.querySelectorAll('[data-roster-teacher]')].map(row=>row.dataset.rosterTeacher);
const edit=(u,id,field,value)=>{const input=u.w.document.querySelector('[data-teacher="'+id+'"][data-field="'+field+'"]');assert.ok(input,id+' '+field+' is editable');input.value=value;input.dispatchEvent(new u.w.Event('change',{bubbles:true}));};

{
 const u=setup();try{
  assert.equal(u.w.document.querySelector('.show-inactive-toggle input').checked,true);
  assert.deepEqual(ids(u),['active','owned','old','former','other','support']);
  assert.equal(u.run('v().teachers.length'),3,'listing Contacts does not add records to version');
  assert.equal(u.run('queuedEdits().length'),0,'listing Contacts does not create save or approval drafts');
  assert.equal(u.run('teacherRosterEntry("owned").profile["Basic Name"]'),'Version-owned name');
  assert.equal(u.run('teacherRosterEntry("owned").active'),true,'version active status wins over inactive Contacts');
  assert.equal(u.run('teacherRoster().filter(t=>t.id==="owned").length'),1,'stable Staff ID prevents duplicates');
  u.run("sorts.Teachers={index:0,desc:false};render()");
  assert.deepEqual(ids(u).slice(0,2),['owned','active'],'active stays first when sorting names');
  u.run("sorts.Teachers={index:0,desc:true};render()");
  assert.deepEqual(ids(u).slice(0,2),['active','owned'],'inactive stays last in reverse sorts');
  assert.equal(u.run('v().teachers.length'),3);
  const checkbox=u.w.document.querySelector('.show-inactive-toggle input');checkbox.checked=false;checkbox.dispatchEvent(new u.w.Event('change'));
  assert.deepEqual(ids(u),['active','owned'],'optional hidden inactive changes only the display');
  u.run("showInactiveTeachers=true;var second=clone(v());second.id='v2';second.teachers=[hr506Person('active','Second Version',true)];state.versions.push(second);current='v2';render()");
  assert.ok(ids(u).includes('former'),'inactive Contacts remain available after changing versions');
  assert.equal(u.run('v().teachers.length'),1,'new selected version is not mutated by roster union');
 }finally{u.w.close()}
}
{
 const u=setup();try{
  edit(u,'former','Basic Name','Former Teacher Renamed');
  assert.equal(u.run('queuedEdits()[0].operation'),'upsertTeacherProfile');
  assert.equal(u.run('queuedEdits()[0].expected'),null);
  assert.equal(u.run('v().teachers.find(t=>t.id==="former").active'),false,'profile edit does not reactivate');
  assert.equal(u.run('staffCatalog.get("former").profile["Basic Name"]'),'Former Teacher','Contacts remain untouched');
  edit(u,'former','Active','Y');
  assert.equal(u.run('v().teachers.filter(t=>t.id==="former").length'),1);
  assert.equal(u.run('v().teachers.find(t=>t.id==="former").active'),true,'Active Y explicitly reuses the colleague');
  assert.equal(ids(u).filter(id=>id==='former').length,1);
  assert.equal(u.run('v().assignments.length'),0,'reuse creates no assignments');
  assert.equal(u.run('staffCatalog.get("former").active'),false,'Contacts approval path remains separate');
  // A refresh from a saved profile must retain one identity and version-owned values.
  u.run("cellQueue=[];draftBase=null;render()");
  assert.equal(ids(u).filter(id=>id==='former').length,1);
  assert.equal(u.run('teacherRosterEntry("former").profile["Basic Name"]'),'Former Teacher Renamed');
 }finally{u.w.close()}
}
{
 const u=setup();try{
  const note=u.w.document.querySelector('[data-note-teacher="former"]');note.value='A note about a former colleague';note.dispatchEvent(new u.w.Event('input',{bubbles:true}));
  assert.deepEqual(JSON.parse(u.run('JSON.stringify(queuedEdits().map(x=>x.operation))')),['upsertTeacherProfile','setTeacherNote'],'note first brings an inactive snapshot into the draft');
  assert.equal(u.run('v().teachers.find(t=>t.id==="former").active'),false);
  assert.equal(u.run('v().teacherNotes.former'),'A note about a former colleague');
  assert.equal(u.run('v().teacherNotes.old'),'First line\nSecond line\nFull stored note');
  const style=u.w.document.createElement('style');style.textContent=fs.readFileSync('public/styles.css','utf8')+'\n'+fs.readFileSync('public/hr506.css','utf8');u.w.document.head.append(style);
  assert.equal(u.w.getComputedStyle(note).minHeight,'28px','compact rule overrides the old 58px minimum');
  note.focus();note.setAttribute('data-focus-test','true');assert.equal(u.w.getComputedStyle(note).minHeight,'84px','focused notes expand to read or edit');
  assert.equal(note.value,'A note about a former colleague');
 }finally{u.w.close()}
}
{
 const u=setup();try{
  // Add-existing must not replace a version's already-planned fields with live Contacts.
  u.run("v().teachers.find(t=>t.id==='owned').active=false;v().teachers.find(t=>t.id==='owned').profile.Active='N';pickExistingTeacher()");
  const panel=u.w.document.querySelector('.inline-editor');panel.querySelector('#existingTeacher').value='owned';panel.querySelector('form').dispatchEvent(new u.w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(u.run('v().teachers.find(t=>t.id==="owned").profile["Basic Name"]'),'Version-owned name');
  assert.equal(u.run('v().teachers.filter(t=>t.id==="owned").length'),1);
 }finally{u.w.close()}
}
{
 const u=setup();try{
  const reporting=fs.readFileSync('public/reporting-ui.js','utf8');u.run(reporting.slice(reporting.indexOf('function reportingPage(')));
  u.run("v().reporting={staff:[{id:'sl',name:'School Leader',role:'P',active:true,groups:['SL']},{id:'ro',name:'Reporting Officer',role:'Teacher',active:true},{id:'jh',name:'Job Holder',role:'Teacher',active:true}],officers:{ro:'sl',jh:'ro'}};tab='Span of Control';render()");
  assert.ok(u.w.document.querySelector('.reporting-content-fit[data-reporting-view="assignment"]'));
  assert.ok(u.w.document.querySelector('[data-ro-drop="ro"]'),'content fitting retains deeper reporting drop targets');
  assert.ok(u.w.document.querySelector('[data-ro-person="jh"]'));
  u.run("reportingView='view';render()");
  assert.ok(u.w.document.querySelector('.reporting-content-fit[data-reporting-view="view"]'));
  assert.match(u.w.document.querySelector('.reporting-directory').textContent,/Job Holder/);
  u.w.document.querySelector('[data-ro-toggle="ro"]').click();
  assert.ok(u.w.document.querySelector('[data-ro-toggle="ro"]').closest('li').querySelector('ul').hidden,'branch collapse stays usable');
  assert.equal(u.run('v().reporting.officers.jh'),'ro','display changes preserve reporting links');
 }finally{u.w.close()}
}
console.log('PASS Q161/Q162: content-fitted reporting controls, complete inactive roster, version ownership, explicit reuse, notes, sorting and compact note sizing');
