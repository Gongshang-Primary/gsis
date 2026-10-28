const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require(process.env.GSIS_TEST_JSDOM||'jsdom');
const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'https://deploy.example',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext());
w.scrollTo=()=>{};w.alert=()=>{};w.confirm=()=>true;w.fetch=()=>{throw Error('Unexpected network call')};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.onclose?.()};
w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:s=>({width:s.length*7})});
// Use the maintained module during development; release parity checks verify its bundle copy.
const app=fs.readFileSync('public/app.js','utf8').replace(/\/\* GSIS_WORKLOAD_UI_BEGIN \*\/[\s\S]*?\/\* GSIS_WORKLOAD_UI_END \*\//,()=>fs.readFileSync('public/workload-ui.js','utf8'));
run(app.replace(/controls\(\);startSignIn\(\);\s*$/,''));
for(const path of ['public/vendor/katex/katex.min.js','shared/table-tools.js'])run(fs.readFileSync(path,'utf8'));
for(const path of ['public/styles.css','public/workload506.css']){const style=w.document.createElement('style');style.textContent=fs.readFileSync(path,'utf8');w.document.head.append(style)}
const serverView=require('./relief-view-fixture');
function refreshR(){w.serverDoc=serverView(JSON.parse(run('JSON.stringify(v())')));run('Object.assign(v(),serverDoc)');}
const text=cell=>(cell.tagName==='TH'?cell.textContent:w.GSISTableTools.text(cell)).replace(/[↕▴▾]/g,'').trim();
const table=()=>w.document.querySelector('.workload-ledger');
const rIndex=()=>[...table().tHead.rows[0].cells].findIndex(c=>text(c)==='R');
const ledgerR=name=>[...table().tBodies[0].rows].find(row=>text(row.cells[0]).startsWith(name)).cells[rIndex()].textContent;
const stats=()=>w.document.querySelector('.workload-stats-table');
const stat=(row,col)=>{const n=[...stats().tHead.rows[0].cells].findIndex(c=>text(c)===col);return [...stats().tBodies[0].rows].find(r=>text(r.cells[0])===row).cells[n].textContent};
try{
 run(`state={versions:[{id:'v1',status:'active',name:'Test',classes:[{ref:'c1',level:'1',shortName:'A'},{ref:'c2',level:'2',shortName:'A'}],loads:Object.fromEntries([1,2,3,4,5,6].map(l=>[l,{Assembly:1,FTGP:2,FTT:2,EL:l===1?12:28}])),venues:[],groups:[],teachers:[{id:'t',name:'Alpha',active:true},{id:'z',name:'Zero',active:true},{id:'hod',name:'HOD',active:true,profile:{Role:'HOD ICT','EO Appt Level':'HOD'}},{id:'pt',name:'Part time HOD',active:true,profile:{Role:'HOD MA','EO Appt Level':'HOD','Employment Modifier':'4/5'}},{id:'inactive',name:'Inactive',active:false}],assignments:[{teacher:'t',target:'1A',subject:'EL'},{teacher:'t',target:'1A',subject:'FT'},{teacher:'z',target:'2A',subject:'EL'},{teacher:'z',target:'2A',subject:'FT'},{teacher:'hod',target:'1A',subject:'EL'},{teacher:'hod',target:'1A',subject:'FT'},{teacher:'inactive',target:'1A',subject:'EL'}],levelExclusions:[],audit:[],offload:GSISTeachingRules.migrate(null),workload:{categories:{},specialists:[]},relief:{schema:2,mode:'actual',weeklyPeriods:60,daysPerWeek:5,lunchPeriodsPerDay:2,siuePercent:150,blocks:{}}}]};current='v1';role='Admin+KP';token='test';connectLive=()=>{};tab='Ledger';`);refreshR();run('render()');
 assert.equal(ledgerR('Alpha'),'35');assert.equal(ledgerR('Zero'),'6');assert.equal(ledgerR('HOD'),'23');assert.equal(ledgerR('Part time HOD'),'36');assert.equal(ledgerR('Inactive'),'Unavailable');
 assert.match(table().tHead.rows[0].cells[rIndex()].title,/Deploy relief quota/);
 const snap=w.GSISTableTools.snapshot(table());assert.equal(snap.rows.find(r=>r[0]==='Alpha')[snap.headers.indexOf('R')],35);
 const rChoice=[...w.document.querySelectorAll('.column-picker label')].find(x=>x.textContent.trim()==='R');assert.ok(rChoice,'R participates in existing column controls');
 const checkbox=rChoice.querySelector('input');checkbox.checked=false;checkbox.dispatchEvent(new w.Event('change'));
 assert.ok(!w.GSISTableTools.snapshot(table()).headers.includes('R'),'hidden R is omitted from visible-table export');
 checkbox.checked=true;checkbox.dispatchEvent(new w.Event('change'));assert.ok(w.GSISTableTools.snapshot(table()).headers.includes('R'));
 run("v().relief.blocks={t:100,hod:3};render()");assert.equal(ledgerR('Alpha'),'35');assert.equal(ledgerR('HOD'),'23');
 run("tab='Stats';render()");assert.equal(stat('R (average)','Teacher'),'20.5');assert.equal(stat('R (average)','HOD'),'29.5');assert.equal(stat('R (average)','4/5 Load / PTES'),'36');assert.equal(stat('R (average)','Jnr KP'),'Unavailable');
 assert.equal(stat('Teacher headcount','HOD'),'2');assert.equal(stat('Teacher headcount','4/5 Load / PTES'),'1');assert.match(w.document.querySelector('.workload-reference').textContent,/Categories overlap/);
 assert.ok(stats().hasAttribute('data-plain-table'));assert.ok(stats().hasAttribute('data-no-column-controls'));assert.ok(stats().classList.contains('workload-stats-compact'));
 assert.equal(w.getComputedStyle(stats()).width,'max-content');assert.equal(w.getComputedStyle(stats()).tableLayout,'auto');assert.equal(w.getComputedStyle(stats().parentElement).overflowX,'auto');
 const compact=w.document.querySelector('[data-stats-compact]');assert.equal(compact.textContent,'Compact');
 stats().style.width='3000px';stats().style.tableLayout='fixed';stats().rows[0].cells[0].style.width='900px';compact.click();
 assert.equal(stats().style.width,'');assert.equal(stats().style.tableLayout,'');assert.equal(stats().rows[0].cells[0].style.width,'');assert.equal(w.getComputedStyle(stats()).width,'max-content');
 run("v().relief.blocks={};render()");assert.equal(stat('R (average)','Teacher'),'20.5');
 run("v().relief.mode='expected';tab='Ledger'");refreshR();run('render()');
 const expected='35';assert.equal(ledgerR('Alpha'),expected);assert.equal(run('v().reliefAdmin.rows.find(r=>r.id==="t").comparison'),undefined);
 run("v().relief=clone(v().reliefAdmin.settings);v().relief.weeklyPeriods=65");refreshR();run('render()');assert.notEqual(ledgerR('Alpha'),expected);
 const v1Value=ledgerR('Alpha');run("state.versions.push({...clone(v()),id:'v2',relief:{schema:2,mode:'actual',weeklyPeriods:60,daysPerWeek:5,lunchPeriodsPerDay:2,siuePercent:150,blocks:{}}});current='v2'");refreshR();run('render()');assert.equal(ledgerR('Alpha'),'35');run("current='v1';render()");assert.equal(ledgerR('Alpha'),v1Value);
 run("v().relief.mode='actual';v().relief.weeklyPeriods=60;v().assignments.push({teacher:'t',target:'1A',subject:'MA'})");refreshR();run('render()');assert.equal(ledgerR('Alpha'),'Unavailable');assert.equal(ledgerR('Zero'),'Unavailable');
 run("tab='Stats';render()");assert.equal(stat('R (average)','Teacher'),'Unavailable','incomplete category must not masquerade as a lower mean');assert.equal(stat('R (average)','HOD'),'Unavailable');
 run("v().assignments.pop();v().reliefResults.pending=true;tab='Ledger';render()");assert.equal(ledgerR('Alpha'),'Unavailable');assert.equal(ledgerR('Zero'),'Unavailable');refreshR();run("tab='Workload';render()");
 assert.ok(![...w.document.querySelectorAll('#content button')].some(b=>/workload settings/i.test(b.textContent)),'settings button is removed from Info Workload');
 assert.equal(run('typeof workloadSettings'),'function','navigation can still open the original handler');
 assert.ok(w.document.querySelector('.workload-math.has-fraction'));
 // Numeric numerator and denominator must not acquire KaTeX's script-size wrapper.
 const fraction=[...w.document.querySelectorAll('.workload-math.has-fraction')].find(el=>el.dataset.mathFallback.includes('÷ 3'));
 assert.ok(fraction);assert.ok(!fraction.querySelector('.mfrac .sizing'),'simple fraction contents retain the base font size');
 assert.equal(fraction.querySelector('math mstyle').getAttribute('displaystyle'),'true');
 const mathStyle=w.getComputedStyle(fraction);assert.ok(parseFloat(mathStyle.minHeight)>=2*parseFloat(mathStyle.lineHeight),'fraction wrapper reserves at least two normal line heights');assert.equal(mathStyle.overflowX,'auto');assert.equal(w.getComputedStyle(fraction.querySelector('.katex')).fontSize,mathStyle.fontSize);
 assert.equal(w.document.querySelectorAll('.katex-error').length,0);
 const before=run('JSON.stringify(workloadData())');run('render()');assert.equal(run('JSON.stringify(workloadData())'),before);
 run('window.katex=undefined;render()');assert.equal(w.document.querySelectorAll('.katex').length,0);assert.ok(!w.document.querySelector('#content').textContent.includes('\\frac'));
 console.log('PASS 506 Ledger/Stats pre-Block R, valid zero vs unavailable, overlapping category means, visible export/columns, version/mode/factor changes, default and button compact sizing, full-size fraction markup and accessible fallback.');
}finally{w.close()}
