const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),{JSDOM}=require('jsdom'),JSZip=require('jszip');
(async()=>{
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;w.TextEncoder=TextEncoder;w.Blob=Blob;w.HTMLCanvasElement.prototype.getContext=()=>({measureText:s=>({width:s.length*7})});
 try{
  for(const p of ['shared/excel-export.js','shared/layout-excel.js'])vm.runInContext(fs.readFileSync(p,'utf8'),dom.getInternalVMContext());
  const template=JSON.parse(fs.readFileSync('shared/layout-excel-template.json'));
  const rooms=Object.keys(template.placements).map((id,i)=>({id:i?'live-'+id:'=literal',geometry:id,name:'Current name '+i,form:'1P',groups:['TG & <label>'],level:1}));
  rooms.push({id:'Z9-NEW',name:'Unmapped',groups:[]});
  const output=w.GSISLayoutExcel.build(template,{rooms,title:'Selected draft',version:'v-test',date:'29 Sep 2026',colors:['','#FFFFE0']});
  assert.equal(output.placed.length,rooms.length-1);assert.deepEqual([...output.unmapped],['Z9-NEW']);
  const zip=await JSZip.loadAsync(await output.blob.arrayBuffer()),xml=await zip.file('xl/worksheets/sheet1.xml').async('string'),sheet=new w.DOMParser().parseFromString(xml,'application/xml');
  assert.equal(sheet.getElementsByTagName('parsererror').length,0);assert.equal(sheet.getElementsByTagNameNS('*','f').length,0);
  const texts=[...sheet.getElementsByTagNameNS('*','t')].map(x=>x.textContent),allLines=texts.flatMap(t=>t.split('\n'));
  for(const r of rooms)assert.equal(allLines.filter(t=>t===r.id).length,1,r.id+' must appear once');
  const occupied=new Set();for(const merge of sheet.getElementsByTagNameNS('*','mergeCell')){
   const [a,b]=merge.getAttribute('ref').split(':'),p=s=>[s.match(/[A-Z]+/)[0].charCodeAt(0),+s.match(/\d+/)[0]],[c1,r1]=p(a),[c2,r2]=p(b);
   for(let c=c1;c<=c2;c++)for(let r=r1;r<=r2;r++){const key=c+','+r;assert.ok(!occupied.has(key),'overlapping merge '+key);occupied.add(key);}
  }
  for(const name of Object.keys(zip.files).filter(n=>n.endsWith('.xml')||n.endsWith('.rels'))){const text=await zip.file(name).async('string');assert.equal(new w.DOMParser().parseFromString(text,'application/xml').getElementsByTagName('parsererror').length,0,name);}
  const duplicate=w.GSISLayoutExcel.build(template,{rooms:[rooms[0],rooms[0]],colors:[]});assert.equal(duplicate.unmapped.length,2);assert.equal(duplicate.placed.length,0);
  const collision=w.GSISLayoutExcel.build(template,{rooms:[rooms[0],{...rooms[0],id:'different'}],colors:[],title:'Conflicting geometry',date:''});assert.equal(collision.placed.length,0);assert.equal(collision.unmapped.length,2);
  console.log('PASS all mapped venues exactly once; unmatched and duplicate geometry retained; valid XML/merges, literal text, no formulas, version snapshot and no input mutation.');
 }finally{dom.window.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
