const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),{JSDOM}=require('jsdom'),JSZip=require('jszip');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('layout-update/public/index.html','utf8'),{url:'https://layout.example',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext());
 const venues=[
  {unitNumber:'C4-17',name:'Classroom',shortName:'MCL1',allocations:[]},
  {unitNumber:'C4-18',name:'Classroom',shortName:'MCL2',allocations:[{kind:'homeroom',label:'3P'},{kind:'teaching_group',label:'3CL6'},{kind:'teaching_group',label:'3CL6 CCE'}]},
  {unitNumber:'D1-07',name:'Classroom',allocations:[{kind:'homeroom',label:'3P'},{kind:'homeroom',label:'4P'},{kind:'teaching_group',label:'TG A'}]},
  {unitNumber:'B3-01',name:'Classroom',allocations:[]},
  {unitNumber:'B3-02A',name:'Classroom',allocations:[{kind:'teaching_group',label:'TG One'},{kind:'teaching_group',label:'TG Two'}]},
  {unitNumber:'A1-24B',name:'Conference Room',allocations:[]},
  {unitNumber:'UNMAPPED',name:'=Literal & <name>',allocations:[{kind:'homeroom',label:'5H'}]}
 ];
 try{
  w.fetch=()=>{throw Error('No network expected')};w.TextEncoder=TextEncoder;w.Blob=Blob;w.HTMLCanvasElement.prototype.getContext=()=>({measureText:s=>({width:s.length*7})});
  for(const file of ['layout-update/public/campus-map.js','shared/layout-renderer.js','shared/excel-export.js','shared/layout-excel.js'])run(fs.readFileSync(file,'utf8'));
  run(fs.readFileSync('layout-update/public/app.js','utf8').replace(/refreshCampus\(\);restoreSession\(\);[\s\S]+$/,''));
  w.fixture={repository:'layout-current',layoutRevision:'test609',layoutYear:2027,venues,classes:[],groups:[]};w.drawing=fs.readFileSync('layout-update/public/campus-base.svg','utf8');const before=JSON.stringify(w.fixture);
  run('campus=fixture;baseSVG=drawing;renderMap()');
  const check=(doc,id,labels,boldCount)=>{const texts=[...doc.querySelector(`[data-unit="${id}"]`).querySelectorAll('text')];assert.deepEqual(texts.map(t=>t.textContent),labels);texts.forEach((t,i)=>assert.equal(t.getAttribute('font-weight')||'normal',i<boldCount?'bold':'normal',id+' '+t.textContent));};
  const variants=[['C4-17',['MCL1','C4-17'],1],['C4-18',['MCL2','3P','3CL6','3CL6 CCE','C4-18'],1],['D1-07',['3P','4P','TG A','D1-07'],1],['B3-01',['B3-01'],0],['B3-02A',['TG One','TG Two','B3-02A'],1]];
  variants.forEach(v=>check(w.document,...v));
  // Exercise the actual PDF iframe, which must preserve the SVG text weights.
  const savedTimeout=w.setTimeout;w.setTimeout=()=>0;run('printMap()');w.setTimeout=savedTimeout;
  const printDoc=w.document.querySelector('.print-frame').contentDocument;
  variants.forEach(v=>check(printDoc,...v));
  const staticRoom=[...printDoc.querySelectorAll('svg > text')].find(t=>t.textContent==='Conference Room'),staticId=[...printDoc.querySelectorAll('svg > text')].find(t=>t.textContent==='A1-24B');
  assert.equal(staticRoom.getAttribute('font-weight'),'bold');assert.equal(staticId.getAttribute('font-weight'),'normal');
  const template=JSON.parse(fs.readFileSync('shared/layout-excel-template.json')),snapshot=w.document.querySelector('#map svg')._gsisLayoutSnapshot,output=w.GSISLayoutExcel.build(template,snapshot),bytes=Buffer.from(await output.blob.arrayBuffer()),zip=await JSZip.loadAsync(bytes),sheet=new w.DOMParser().parseFromString(await zip.file('xl/worksheets/sheet1.xml').async('string'),'application/xml');
  assert.equal(sheet.getElementsByTagName('parsererror').length,0);assert.equal(sheet.getElementsByTagNameNS('*','f').length,0);
  const cells=[...sheet.getElementsByTagNameNS('*','c')],cell=address=>cells.find(c=>c.getAttribute('r')===address);
  const checkCell=(address,expected,bold)=>{const c=cell(address),runs=[...c.getElementsByTagNameNS('*','r')];assert.equal(c.getAttribute('t'),'inlineStr');assert.equal(c.textContent,expected.join('\n'));if(bold){assert.equal(runs.length,2);assert.equal(runs[0].getElementsByTagNameNS('*','b')[0].getAttribute('val'),'1');assert.equal(runs[0].textContent,expected[0]);assert.equal(runs[1].getElementsByTagNameNS('*','b')[0].getAttribute('val'),'0');assert.equal(runs[1].textContent,'\n'+expected.slice(1).join('\n'));}else assert.equal(runs.length,0);};
  for(const [id,labels,boldCount] of variants)checkCell(template.placements[id].split(':')[0],labels,!!boldCount);
  checkCell(template.placements['A1-24B'].split(':')[0],['Conference Room','A1-24B'],true);checkCell('B74',['=Literal & <name>','5H','UNMAPPED'],true);
  assert.equal(JSON.stringify(w.fixture),before,'Rendering and export preserve source rooms and assignments');
  const qa=path.resolve('..','qa609-layout');fs.mkdirSync(qa,{recursive:true});fs.mkdirSync('verification',{recursive:true});fs.writeFileSync(path.join(qa,'layout-print.html'),'<!doctype html>'+printDoc.documentElement.outerHTML);fs.writeFileSync(path.join(qa,'layout.xlsx'),bytes);fs.writeFileSync('verification/609-layout-export-bold.json',JSON.stringify({namedAssigned:true,namedUnassigned:true,primaryAssignment:true,multipleAssignments:true,teachingGroupOnly:true,emptyClassroomIdRegular:true,staticRoom:true,unmappedWorkbookRoom:true,actualPDFIframe:true,xlsxRichText:true,literalText:true,sourceUnchanged:true},null,2));
  console.log('PASS 2D PDF iframe and Excel rich text: only room/primary assignment bold; named, unnamed, unassigned, multiple assignments, static rooms, group-only, blank and unmapped variants; source unchanged');
 }finally{w.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
