const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{JSDOM}=require('jsdom');
const makeDeploy=require('./dom-helper.cjs');

function contacts(){
 const dom=new JSDOM(fs.readFileSync('contacts-update/public/index.html','utf8'),{url:'https://contacts.example',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext());
 w.structuredClone=structuredClone;w.confirm=()=>true;w.GSISSignature={SUBJECTS:[['EL','English'],['MA','Mathematics']],defaults:()=>['EL']};
 run(fs.readFileSync('contacts-update/public/core.js','utf8').replace(/export /g,''));
 run(fs.readFileSync('contacts-update/public/app.js','utf8').replace(/^import[^\n]+\n/,'').replace(/start\(\);\s*$/,''));
 run(`token='session';state={user:{email:'admin@gsps.edu.sg',roles:['Admin']},people:Array.from({length:180},(_,i)=>({id:'s'+i,name:'Teacher '+String(i).padStart(3,'0'),basicName:'Teacher '+i,active:'Y',groups:[],emails:{gsps:'s'+i+'@gsps.edu.sg'}})),groups:[],access:[],signatureSettings:{subjects:['EL'],revision:1}};show();`);
 return {dom,w,run,el:id=>w.document.getElementById(id)};
}

(async()=>{
 const u=contacts();try{
  const head=u.el('contactHead'),choices=u.el('columnChoices'),input=head.querySelector('[data-column-filter="name"]'),firstChoice=choices.firstElementChild;
  const observer=new u.w.MutationObserver(()=>{});observer.observe(head,{childList:true,subtree:true});observer.observe(choices,{childList:true,subtree:true});
  u.run(`api=()=>{throw Error('Local filters must not request the backend')}`);input.focus();
  for(const value of ['T','Te','Teacher','Teacher 1','Teacher 17']){input.value=value;input.setSelectionRange(value.length,value.length);input.dispatchEvent(new u.w.Event('input',{bubbles:true}));assert.equal(head.querySelector('[data-column-filter="name"]'),input);assert.equal(u.w.document.activeElement,input);assert.equal(input.selectionStart,value.length);assert.equal(choices.firstElementChild,firstChoice);}
  assert.equal(u.el('contactRows').children.length,10);assert.equal(observer.takeRecords().filter(r=>r.type==='childList').length,0,'Filtering must retain header and chooser DOM');
  input.value='No matching teacher';input.dispatchEvent(new u.w.Event('input',{bubbles:true}));assert.equal(u.el('contactRows').children.length,0);assert.equal(head.querySelector('[data-copy="name"]').disabled,true);
  u.el('clear').click();assert.equal(input.value,'');assert.equal(u.el('contactRows').children.length,180);assert.equal(head.querySelector('[data-copy="name"]').disabled,false);
  choices.querySelector('[data-column="role"]').click();assert.ok(head.querySelector('[data-column-filter="role"]'),'Changing columns still rebuilds the header');observer.disconnect();

  // Teaching data arrives after the user starts editing unrelated Contacts fields.
  u.run(`contactData={editable:true,fields:['TTb Name','Basic Name','Active'],lists:{},rows:[{id:'s0',values:['Teacher 000','Teacher 0','Y'],computed:[true,false,false]}]};renderData();renderSignatureSettings();var finishDeployment;api=path=>{if(path!=='deployment')throw Error(path);return new Promise(resolve=>{finishDeployment=resolve})};`);
  const loading=u.run('loadDeployment(state)'),field=u.el('dataGrid').querySelector('[aria-label="Basic Name"]'),subject=u.el('signatureSubjectChoices').querySelector('[data-signature-subject="MA"]');
  field.value='Retained draft';field.dispatchEvent(new u.w.Event('input'));field.focus();field.setSelectionRange(3,8);subject.checked=true;
  u.run(`finishDeployment({available:true,revision:2,assignments:[{staffId:'s0',subject:'FT',level:'1',groupName:'1P'}],organisations:{},subjectHeaders:['EL'],workloads:[]})`);await loading;
  assert.equal(u.el('dataGrid').querySelector('[aria-label="Basic Name"]'),field);assert.equal(field.value,'Retained draft');assert.equal(u.w.document.activeElement,field);assert.equal(field.selectionStart,3);assert.equal(field.selectionEnd,8);assert.equal(u.el('signatureSubjectChoices').querySelector('[data-signature-subject="MA"]'),subject);assert.equal(subject.checked,true);assert.equal(u.run('dataEdits.size'),1);assert.match(u.el('contactRows').textContent,/1P/,'Directory teaching columns update without replacing unrelated editors');

  // Refresh preserves a signature draft and its original comparison revision.
  subject.dispatchEvent(new u.w.Event('change',{bubbles:true}));
  u.run(`$('signatureSettings').classList.add('active');api=async path=>{if(path==='bootstrap')return {...state,signatureSettings:{subjects:['MA'],revision:2}};if(path==='deployment')return {available:true,revision:2,assignments:[],organisations:{},subjectHeaders:[],workloads:[]};throw Error(path)};`);await u.run('refresh()');
  assert.equal(u.el('signatureSubjectChoices').querySelector('[data-signature-subject="EL"]').checked,true);assert.equal(u.el('signatureSubjectChoices').querySelector('[data-signature-subject="MA"]').checked,true);assert.equal(u.run('signatureSettingsDraft.expectedRevision'),1);assert.equal(u.run('hasContactDrafts()'),true);
  const retainedMath=u.el('signatureSubjectChoices').querySelector('[data-signature-subject="MA"]');retainedMath.checked=false;retainedMath.dispatchEvent(new u.w.Event('change',{bubbles:true}));assert.equal(u.run('signatureSettingsDraft.expectedRevision'),1,'Returning to an old baseline must not adopt a newer unseen revision');retainedMath.checked=true;retainedMath.dispatchEvent(new u.w.Event('change',{bubbles:true}));
  u.run(`var signatureRequests=[];api=async(path,body)=>{signatureRequests.push(body);throw Object.assign(Error('Signature settings changed'),{status:409})};`);await u.el('signatureSettingsSave').onclick();
  assert.equal(u.run('signatureRequests[0].expectedRevision'),1);assert.equal(u.run('signatureSettingsDraft.expectedRevision'),1,'A conflict must never silently rebase onto unseen settings');assert.match(u.el('signatureSettingsStatus').textContent,/selection is retained/);assert.equal(u.el('signatureSettingsSave').disabled,false);
  u.el('signatureSettingsStatus').querySelector('button').click();assert.equal(u.run('signatureSettingsDraft.expectedRevision'),2,'Only explicit review advances the draft comparison');
  u.run(`api=async(path,body)=>{signatureRequests.push(body);return {subjects:body.subjects,revision:3,saved:true}};`);await u.el('signatureSettingsSave').onclick();assert.equal(u.run('signatureRequests.at(-1).expectedRevision'),2);assert.equal(u.run('signatureSettingsDraft'),null);assert.equal(u.run('state.signatureSettings.revision'),3);

  // An older session's save result cannot replace a new account's data or draft.
  const math=u.el('signatureSubjectChoices').querySelector('[data-signature-subject="MA"]');math.checked=false;math.dispatchEvent(new u.w.Event('change',{bubbles:true}));u.run(`var finishSignature;api=()=>new Promise(resolve=>{finishSignature=resolve})`);const saving=u.el('signatureSettingsSave').onclick();assert.equal(u.el('signatureSettingsSave').disabled,true);
  u.run(`loginAttempt++;token='other-session';state={...state,user:{email:'other@gsps.edu.sg',roles:['Admin']},signatureSettings:{subjects:['MA'],revision:5}};signatureSettingsDraft={owner:state.user.email,expectedRevision:5,baseline:['MA'],subjects:['EL']};renderSignatureSettings();finishSignature({subjects:['EL'],revision:4,saved:true})`);await saving;
  assert.equal(u.run('state.signatureSettings.revision'),5);assert.equal(u.run('signatureSettingsDraft.expectedRevision'),5);assert.equal(u.el('signatureSettingsSave').disabled,false);assert.match(u.el('signatureSettingsStatus').textContent,/Unsaved/);
 }finally{u.dom.window.close();}

 const d=makeDeploy();try{
  d.run(`v().classes=Array.from({length:42},(_,i)=>({ref:'class'+i,level:String(1+i%6),name:['Courage','Integrity','Unlisted'][i%3],shortName:'X'+i}));v().classNameSets=[{id:'names',pairs:v().classes.slice(0,30).map(c=>[c.name,c.shortName])}];v().groups=Array.from({length:40},(_,i)=>({id:'tg'+i,name:'Group '+i,level:String(1+i%6)}));v().assignments=Array.from({length:1500},(_,i)=>({id:'a'+i,target:i%5===0?'unknown':i%3===0?'tg'+i%40:classKey(v().classes[i%42]),...(i%7===0?{targetRef:i%11===0?'missing':'class'+i%42}:{}),level:String(1+i%6)}));
  var referenceAssignments=assignments=>{const pairs=classNameSets().flatMap(set=>set.pairs),classes=classList();const rank=a=>{const cl=assignmentClass(a);if(cl){const n=pairs.findIndex(([name,short])=>classChoiceMatch(cl,name,short));return n<0?pairs.length+classes.indexOf(cl):n;}const i=v().groups.findIndex(g=>g.id===a.target);return pairs.length+classes.length+(i<0?v().groups.length:i);};const lev=a=>Number(v().groups.find(g=>g.id===a.target)?.level??assignmentClass(a)?.level??a.level);return assignments.slice().sort((a,b)=>lev(a)-lev(b)||rank(a)-rank(b));};
  var realClassList=classList,classListReads=0;classList=()=>{classListReads++;return realClassList()};var expected=referenceAssignments(v().assignments).map(a=>a.id),beforeReads=classListReads;classListReads=0;var result=orderedAssignments(v().assignments),afterReads=classListReads;`);
  assert.equal(d.run('JSON.stringify(result.map(a=>a.id))'),d.run('JSON.stringify(expected)'),'Names, levels, stable references and missing targets retain the established ordering');assert.equal(d.run('afterReads'),1);assert.ok(d.run('beforeReads')>1500);assert.equal(d.run('result.every(a=>v().assignments.includes(a))'),true,'Sorting retains the actual assignment objects');assert.equal(d.run('v().assignments[0].id'),'a0','Sorting must not mutate the draft');
  console.log(JSON.stringify({assignmentCount:1500,classListReadsBefore:d.run('beforeReads'),classListReadsAfter:d.run('afterReads'),filterKeystrokes:5,headerOrChooserReplacements:0}));
 }finally{d.dom.window.close();}
 console.log('PASS Contacts filters preserve focused controls; delayed teaching and Refresh retain editor drafts; signature conflicts require reviewed revisions and reject stale-session results; Deploy sorts 1,500 assignments with one class-list read and unchanged ordering.');
})().catch(error=>{console.error(error);process.exitCode=1;});
