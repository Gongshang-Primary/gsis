const fs=require('fs'),assert=require('assert/strict'),{dom,w,run}=require('./dom-helper.cjs')();
const q=s=>w.document.querySelector(s),qa=s=>[...w.document.querySelectorAll(s)],plain=v=>JSON.parse(JSON.stringify(v));
let frames=[];
w.requestAnimationFrame=f=>{frames.push(f);return frames.length};w.cancelAnimationFrame=()=>{};
const drain=()=>{for(let i=0;frames.length&&i<10;i++){const batch=frames;frames=[];batch.forEach(f=>f())}};
for(const path of ['public/styles.css','public/table-viewport.css','public/deploy506.css']){const style=w.document.createElement('style');style.textContent=fs.readFileSync(path,'utf8');w.document.head.append(style)}
run(fs.readFileSync('shared/table-tools.js','utf8'));
run(fs.readFileSync('shared/table-viewport.js','utf8'));
try{
 // Audit dates are formatted in Singapore regardless of browser timezone and retain the original instant.
 assert.equal(run("auditSGTFormatter.resolvedOptions().timeZone"),'Asia/Singapore');
 assert.match(run("auditSingaporeTime('2026-10-08T04:22:31Z')"),/08 Oct 2026.*12:22:31/);
 assert.match(run("auditSingaporeTime('2026-12-31T16:15:00Z')"),/01 Jan 2027.*00:15:00/);
 assert.equal(run("auditSingaporeTime('invalid timestamp')"),'invalid timestamp');
 assert.equal(run("auditSingaporeTime(null)"),'Unavailable');
 run(`tab='Audit';auditState={versionId:current,sessionEpoch,loaded:true,loading:false,total:1,events:[{id:'a1',at:'2026-12-31T16:15:00Z',actor:'a@gsps.edu.sg',action:'Save'}]};audit(el('content'));`);
 assert.equal(q('time').getAttribute('datetime'),'2026-12-31T16:15:00Z');assert.match(q('time').textContent,/01 Jan 2027.*00:15:00/);
 assert.equal(q('#content th').textContent,'Time (SGT)');
 run("role='KP';el('content').replaceChildren();audit(el('content'))");assert.match(q('#content').textContent,/Admin only/);assert.equal(q('#content time'),null);

 // Settings access and placement use the existing Workload Settings editor in its own active context.
 run("tab='Classes & TGs';window.workloadOpenCount=0;workloadSettings=()=>window.workloadOpenCount++");
 for(const role of ['Admin','KP','Admin+KP']){
  run(`role=${JSON.stringify(role)};renderDeployNavigation()`);
  const buttons=qa('#nav button'),idx=buttons.findIndex(b=>b.dataset.action==='workload-settings');
  assert.ok(idx>=0,role+' sees Workload Settings');assert.equal(buttons[idx+1].textContent,'Versions');assert.equal(buttons[idx-1].textContent,'HR Settings');
  buttons[idx].click();assert.equal(run('tab'),'Workload Settings');run("tab='Classes & TGs'");
 }
 assert.equal(w.workloadOpenCount,3);
 run("unsavedDraft=true;renderDeployNavigation()");q('[data-action="workload-settings"]').click();assert.equal(w.workloadOpenCount,3,'unfinished edits prevent opening another editor');run('unsavedDraft=false');
 run("role='Teacher';renderDeployNavigation()");assert.equal(q('[data-action="workload-settings"]'),null);
 run("role='Admin+KP';tab='PLT Settings';renderDeployNavigation()");assert.equal(q('#settingsSubnav [data-tab="PLT Settings"]').textContent,'PLT');assert.equal(q('#settingsSubnav [data-tab="Events Settings"]').textContent,'Events');

 // Align the value users see, including selects and text inputs, in all six requested pages.
 for(const tab of ['Load Settings','Dept Settings','Committee Settings','CCA Settings','PLT Settings','Events Settings']){
  run(`tab=${JSON.stringify(tab)};el('content').innerHTML='<table><thead><tr><th>1</th><th>Name</th></tr></thead><tbody><tr><td>15</td><td>-2.5</td><td>1,500</td><td>4/5</td><td>20%</td><td>1A</td><td></td><td><input value="42"></td><td><select><option value="1">Teacher</option></select></td></tr></tbody></table>';alignProgramCells(el('content'))`);
  assert.deepEqual(qa('#content td').map(c=>c.dataset.valueAlign),['number','number','number','text','text','text','text','number','text'],tab);
  if(['PLT Settings','Events Settings'].includes(tab))assert.equal(q('#content table').dataset.exportTitle,tab.replace(' Settings',''),'display/export title uses the short name');
  assert.equal(w.getComputedStyle(q('#content td')).textAlign,'center');assert.equal(w.getComputedStyle(qa('#content td')[3]).textAlign,'left');
  const input=q('#content input');input.value='12a';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(input.parentElement.dataset.valueAlign,'text');
  input.value='0.5';input.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(input.parentElement.dataset.valueAlign,'number');
 }

 // All classes and TGs remain present, including unknown levels, and multi-class context is retained once.
 run(`tab='Classes & TGs';v().classes=[{ref:'a',level:'1',shortName:'A',name:'Alpha'},{ref:'b',level:'1',shortName:'B',name:'Beta'},{ref:'c',level:'3',shortName:'C',name:'Gamma'}];v().groups=[{id:'g10',name:'P1 TG 10',subject:'FMA',level:'1',associationSchema:1,classRefs:['a','b'],levelWide:false},{id:'g2',name:'P1 TG 2',subject:'EL',level:'1',associationSchema:1,classRefs:['a'],levelWide:false},{id:'whole',name:'P3 all',subject:'Art',level:'3',associationSchema:1,classRefs:[],levelWide:true},{id:'missing-level',name:'Unlevelled TG',subject:'Music',level:''}];render();`);
 w.GSISTableTools.enhance(q('#content'));drain();
 const panels=qa('.class-group-level'),p1=panels[0],tables=panels.map(p=>p.querySelector('table'));
 assert.deepEqual(panels.map(p=>p.querySelector('h3').textContent),['P1','P2','P3','P4','P5','P6','No level']);
 assert.equal(qa('#content .scroll').length,1);assert.equal(w.getComputedStyle(q('#content')).overflow,'visible');assert.equal(w.getComputedStyle(q('#content')).maxHeight,'none');
 assert.equal(w.getComputedStyle(q('.class-groups-scroll')).overflow,'auto');assert.equal(w.getComputedStyle(q('.class-group-levels')).display,'flex');
 assert.equal(w.getComputedStyle(p1.querySelector('h3')).position,'sticky');assert.equal(w.getComputedStyle(p1.querySelector('thead')).position,'sticky');assert.equal(w.getComputedStyle(p1.querySelector('thead')).top,w.getComputedStyle(p1.querySelector('h3')).height);
 assert.equal(qa('.class-group-level .table-window').length,0,'no independent level scroll containers');
 assert.equal(qa('.class-group-level .gsis-table-tools').length,7);assert.equal(qa('.class-group-level .gsis-columns').length,7);assert.equal(qa('.class-group-level .gsis-export-excel').length,7);
 const snapshots=tables.map(t=>plain(w.GSISTableTools.snapshot(t))),p1data=snapshots[0];
 assert.deepEqual(p1data.headers,['Type','Class / TG','Name / Subject']);assert.deepEqual(p1data.rows.map(r=>r[1]),['1A','1B','P1 TG 2','P1 TG 10']);
 assert.match(p1data.rows[3][2],/FMA/);assert.match(p1data.rows[3][2],/1A/);assert.match(p1data.rows[3][2],/1B/);
 assert.equal(snapshots.reduce((n,x)=>n+x.rows.length,0),7,'all three form classes and four TGs export exactly once');
 assert.equal(snapshots[1].rows.length,0,'spacer rows are not exported as data');assert.equal(snapshots[6].rows[0][1],'Unlevelled TG');
 const choice=p1.querySelector('[data-table-column-choice="0"]');choice.checked=false;choice.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.deepEqual(plain(w.GSISTableTools.snapshot(tables[0]).headers),['Class / TG','Name / Subject']);assert.equal(w.GSISTableTools.snapshot(tables[2]).headers.length,3,'column hiding is local to one level');
 choice.checked=true;choice.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(w.GSISTableTools.snapshot(tables[0]).headers.length,3);
 run("v().classes=[];v().groups=[];render()");w.GSISTableTools.enhance(q('#content'));drain();assert.equal(qa('.class-group-level').length,6);assert.equal(qa('.class-group-level table').reduce((n,t)=>n+w.GSISTableTools.snapshot(t).rows.length,0),0);
 console.log('PASS 506 Info: Singapore audit instants and date rollover, Workload Settings access/position, Program Settings labels/alignment, six level panels with one scroll owner, full TG contexts, local columns and spacer-free exports.');
}finally{w.close()}
