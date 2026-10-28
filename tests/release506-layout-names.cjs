const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),{JSDOM}=require('jsdom'),JSZip=require('jszip');
const Layout=require('../shared/layout-data.js');
(async()=>{
 const seed=JSON.parse(fs.readFileSync('data/layout-2026.json','utf8'));
 const source=seed.venues.filter(v=>['C4-17','C4-18'].includes(v.unitNumber));
 assert.deepEqual(Object.fromEntries(source.map(v=>[v.unitNumber,v.shortName])),{'C4-18':'MCL2','C4-17':'MCL1'});
 const deploy={id:'v506',name:'2026 test',venueRegistry:{venues:source},venues:source.map(v=>({id:v.unitNumber,name:v.name,form:v.unitNumber==='C4-18'?'3P':''})),classes:[{level:'3',shortName:'P',name:'Perseverance'}],groups:[{id:'g1',name:'3CL6',subject:'CL',level:3,venue:'C4-18'},{id:'g2',name:'3CL6 CCE',subject:'CCE',level:3,venue:'C4-18'}],teachers:[{id:'t1',name:'Teacher One'}],assignments:[{target:'g1',teacher:'t1'}]};
 const before=JSON.stringify(deploy),snapshot=Layout.publication(Layout.empty(2026),deploy,{id:deploy.id,revision:1,commit:'test506'},(kind,key)=>kind+':'+key);
 assert.equal(JSON.stringify(deploy),before,'Publication must not change venue identity or allocations in Deploy');
 const campus=Layout.publicView(JSON.parse(JSON.stringify(snapshot)));
 assert.deepEqual(Object.fromEntries(campus.venues.map(v=>[v.unitNumber,v.shortName])),{'C4-18':'MCL2','C4-17':'MCL1'});
 assert.equal(campus.groups.find(g=>g.code==='3CL6').teacherLabels,'Teacher One');
 assert.deepEqual(campus.venues.find(v=>v.unitNumber==='C4-18').allocations.map(a=>a.label),['3P','3CL6','3CL6 CCE']);
 const dom=new JSDOM(fs.readFileSync('layout-update/public/index.html','utf8'),{url:'https://layout.example',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext());
 try{
  w.fetch=()=>{throw Error('No network expected')};w.HTMLElement.prototype.scrollIntoView=()=>{};w.TextEncoder=TextEncoder;w.Blob=Blob;w.HTMLCanvasElement.prototype.getContext=()=>({measureText:s=>({width:s.length*7})});
  for(const file of ['layout-update/public/campus-map.js','shared/layout-renderer.js','shared/excel-export.js','shared/layout-excel.js'])run(fs.readFileSync(file,'utf8'));
  run(fs.readFileSync('layout-update/public/app.js','utf8').replace(/refreshCampus\(\);restoreSession\(\);[\s\S]+$/,''));
  w.fixture=campus;w.drawing=fs.readFileSync('layout-update/public/campus-base.svg','utf8');
  run('campus=fixture;baseSVG=drawing;renderMap()');
  const lines=id=>[...w.document.querySelector(`[data-unit="${id}"]`).querySelectorAll('text')].map(n=>n.textContent);
  assert.deepEqual(lines('C4-17'),['MCL1','C4-17'],'Unassigned named classroom retains its name');
  assert.deepEqual(lines('C4-18'),['MCL2','3P','3CL6','3CL6 CCE','C4-18'],'Named room, homeroom, TGs and unit all remain visible');
  const group=w.document.querySelector('[data-unit="C4-18"]'),hit=group.querySelector('.room-hit'),texts=[...group.querySelectorAll('text')];
  assert.ok(Number(texts.at(-1).getAttribute('y'))<Number(hit.getAttribute('y'))+Number(hit.getAttribute('height')),'Room grows to retain the unit inside its boundary');
  assert.ok(texts.every((text,i)=>!i||Number(text.getAttribute('y'))>Number(texts[i-1].getAttribute('y'))),'Name and allocation lines do not overlap');
  assert.match(hit.getAttribute('aria-label'),/MCL2/);
  run('renderMap()');assert.deepEqual(lines('C4-18'),['MCL2','3P','3CL6','3CL6 CCE','C4-18'],'Rerender retains names and assignments');
  w.document.getElementById('search').value='MCL2';run('renderSearch()');assert.match(w.document.getElementById('results').textContent,/C4-18.*MCL2/);w.document.querySelector('#results button').click();assert.match(w.document.getElementById('unitDetails').textContent,/C4-18.*MCL2.*3P.*3CL6.*3CL6 CCE/);
  const template=JSON.parse(fs.readFileSync('shared/layout-excel-template.json')),output=w.GSISLayoutExcel.build(template,w.document.querySelector('#map svg')._gsisLayoutSnapshot),zip=await JSZip.loadAsync(await output.blob.arrayBuffer()),xml=await zip.file('xl/worksheets/sheet1.xml').async('string'),sheet=new w.DOMParser().parseFromString(xml,'application/xml');
  for(const [id,expected] of [['C4-17',['MCL1','C4-17']],['C4-18',['MCL2','3P','3CL6','3CL6 CCE','C4-18']]]){const address=template.placements[id].split(':')[0],cell=[...sheet.getElementsByTagNameNS('*','c')].find(c=>c.getAttribute('r')===address);assert.deepEqual(cell.textContent.split('\n'),expected,'Excel must retain '+id+' room and allocation names');}
 }finally{dom.window.close();}
 const landmark=fs.readFileSync('layout-update/public/landmark.html','utf8'),modelDom=new JSDOM('<div id="resultCount"></div><div id="roomList"></div><div id="detail"></div>',{runScripts:'outside-only'}),mw=modelDom.window,modelRun=s=>vm.runInContext(s,modelDom.getInternalVMContext());
 try{
  mw.testRooms=campus.venues.map(v=>({id:v.unitNumber,key:v.unitNumber,name:v.name,short:v.shortName,block:'C',level:4,unlocated:true,r:{x:0,z:0,w:1,d:1},y:0,capacity:null,lookupState:'loaded',home:v.allocations.filter(a=>a.kind==='homeroom').map(a=>a.label),teaching:v.allocations.filter(a=>a.kind==='teaching_group').map(a=>a.label)}));
  modelRun("const rooms=testRooms,S={query:'MCL',selected:null},$=id=>document.getElementById(id),esc=x=>String(x).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])),isRoomVisible=()=>true,interiorGroup={clear(){}},selectionMesh={position:{set(){}},scale:{set(){}}};function requestRender(){}function focusRoom(){}function fit(){}");
  modelRun(landmark.slice(landmark.indexOf('function roomName('),landmark.indexOf('\nfunction selectRoom(')));
  modelRun(landmark.slice(landmark.indexOf('function updateSelection('),landmark.indexOf('\nfunction restoreInterior(')));
  modelRun('renderList()');assert.match(mw.document.getElementById('roomList').textContent,/MCL1/);assert.match(mw.document.getElementById('roomList').textContent,/MCL2/);
  modelRun("S.selected=rooms.find(v=>v.id==='C4-18');updateSelection()");assert.match(mw.document.getElementById('detail').textContent,/C4-18.*MCL2.*3P.*3CL6.*3CL6 CCE/s);
 }finally{modelDom.window.close();}
 console.log('PASS Q165 MCL1/MCL2 publication and reload, assigned/unassigned SVG names, unchanged unit/class/TG/teacher data, Excel and 3D details');
})().catch(error=>{console.error(error);process.exitCode=1;});
