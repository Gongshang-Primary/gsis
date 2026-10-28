const assert=require('node:assert/strict'),fs=require('fs'),make=require('./dom-helper.cjs');
const {w,run}=make();try{
 // Load the owned sources so this test also works before release bundle regeneration.
 run(fs.readFileSync('shared/planning.js','utf8'));run(fs.readFileSync('public/planning-ui.js','utf8').replace(/^const (?:groupTabs|groupRoleSearch|groupRoleKey)=.*\n/gm,''));
 run(`v().teachers=Array.from({length:12},(_,i)=>({id:'t'+i,name:'Teacher '+i,active:true,profile:{'EO Appt Level':'ST'}}));tab='Dept';GSISPlanning.init(v());v().organisations.dept=[{id:'short',name:'Alpha',slots:['t0','t1','t2']},{id:'long',name:'Beta',slots:['','t3','t4','','t5','t6']},{id:'none',name:'Gamma',slots:['','']}];render();`);
 const q=s=>w.document.querySelector(s),qa=s=>[...w.document.querySelectorAll(s)],change=e=>e.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.deepEqual(qa('.group-table tbody tr').slice(0,4).map(x=>x.cells[0].textContent),['Head','Deputy','TLs','Members']);
 const addCount=id=>qa('select[data-group="'+id+'"][data-member-picker="add"]').length;
 for(const id of ['short','long','none'])assert.equal(addCount(id),1);
 assert.equal(qa('.group-member-blank').length,5);assert.equal(q('[data-group="short"][data-group-role-choice="deputy"][value="t1"]').checked,true);assert.equal(q('[data-group="short"][data-group-role-choice="tls"][value="t1"]').disabled,true);
 q('[data-group="short"][data-group-role-choice="deputy"][value="t7"]').click();assert.equal(run("GSISPlanning.deputies(v().organisations.dept[0]).join()"),'t1,t7');assert.equal(q('details[data-group="short"][data-group-role="deputy"]').open,true);
 q('[data-group="short"][data-group-role-choice="deputy"][value="t8"]').click();q('[data-group="short"][data-group-role-choice="tls"][value="t9"]').click();q('[data-group="short"][data-group-role-choice="tls"][value="t10"]').click();
 assert.equal(run("GSISPlanning.deputies(v().organisations.dept[0]).join()"),'t1,t7,t8');assert.equal(run("v().organisations.dept[0].tls.join()"),'t9,t10');assert.match(q('.group-table thead th:nth-child(2)').textContent,/7 teachers/);
 q('[data-group="short"][data-group-role-choice="deputy"][value="t1"]').click();assert.equal(run("GSISPlanning.deputies(v().organisations.dept[0]).join()"),'t7,t8');assert.equal(run("v().organisations.dept[0].slots.slice(2).join()"),'t2');
 let picker=q('select[data-group="long"][data-slot="3"]');assert.equal(picker.value,'t5');picker.value='';change(picker);assert.equal(run("v().organisations.dept[1].slots.join()"),',t3,t4,t6');assert.equal(addCount('long'),1);
 picker=q('select[data-group="long"][data-member-picker="add"]');picker.value='t11';change(picker);assert.equal(run("v().organisations.dept[1].slots.join()"),',t3,t4,t6,t11');assert.equal(addCount('long'),1);
 assert.equal(run("queuedEdits().filter(x=>x.operation==='setOrganisation').length"),1);assert.equal(run("saveWireEdits(queuedEdits())[0].source"),'setOrganisation');
 for(const [kind,tab] of [['comm','Committees'],['cca','CCAs'],['plt','PLT'],['events','Events']]){
  run(`cellQueue=[];draftBase=null;tab=${JSON.stringify(tab)};var prefix506=GSISPlanning.roles(${JSON.stringify(kind)}).length;v().organisations[${JSON.stringify(kind)}]=[{id:'a',name:'A',slots:Array(prefix506).fill('').concat(['t1','','t2','t3'])},{id:'b',name:'B',slots:Array(prefix506).fill('')},{id:'c',name:'C',slots:Array(prefix506).fill('').concat(['t4'])}];render();`);
  for(const id of ['a','b','c'])assert.equal(addCount(id),1,kind+' one add picker');const prefix=run('prefix506');assert.equal(qa('.group-member-blank').length,5);assert.equal(qa('select[data-group="b"][data-slot]').length,prefix+1);
  picker=q('select[data-group="a"][data-slot="'+(prefix+1)+'"]');picker.value='';change(picker);assert.equal(run(`v().organisations.${kind}[0].slots.slice(${prefix}).join()`),'t1,t3');assert.equal(run(`v().organisations.${kind}[0].slots.slice(0,${prefix}).every(x=>x==='')`),true);assert.equal(addCount('a'),1);
  if(kind==='plt')assert.match(q('.group-table').textContent,/No leader/);
 }
 console.log('PASS 506 group DOM: preserved legacy deputy, multi-checkbox drafts, disabled duplicate roles, counts, one trailing picker, blank shorter columns and fixed-role-safe gap closure in all five views');
}finally{w.close();}
