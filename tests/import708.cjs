const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom'),JSZip=require('jszip'),M=require('../shared/roster'),F=require('./import708-fixture.cjs');
const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;w.TextDecoder=TextDecoder;w.TextEncoder=TextEncoder;w.JSZip=JSZip;
vm.runInContext(fs.readFileSync('roster-update/public/converter.js','utf8'),dom.getInternalVMContext());
const C=w.RosterConverter,plain=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const model=await C.parseFile(Buffer.from(F.html())),original=JSON.stringify(model);
 assert.equal(model.teacherCount,100);assert.equal(model.maxPeriod,16);assert.equal(model.importClashes.length,4);
 assert.deepEqual(plain(model.importClashes.map(c=>[c.week,c.day,c.period,c.options.map(o=>o[0])])),['odd','even'].flatMap(week=>[11,12].map(period=>[week,'Tuesday',period,['Activity A','Activity B']])));
 assert.equal(model.odd.blocks[1].cells[2][0],'Inherited lesson');assert.equal(model.odd.blocks[1].cells[5][0],'Continuation lesson');
 assert.throws(()=>M.validate(model),/Resolve imported lesson clashes/);
 for(const metadata of [null,{},[]])assert.throws(()=>M.validate({...model,importClashes:metadata}),/Resolve imported/);
 assert.throws(()=>C.resolveClashes(model),/Resolve 4 lesson clashes/);
 assert.throws(()=>C.resolveClashes(model,{[model.importClashes[0].id]:1}),/Resolve 3 lesson clashes/);
 await assert.rejects(C.makeWorkbook(model),/Resolve 4 lesson clashes/);
 for(const choice of [0,1]){
  const choices=Object.fromEntries(model.importClashes.map(c=>[c.id,choice])),resolved=C.resolveClashes(model,choices);
  assert.equal(resolved.importClashes,undefined);M.validate(resolved);
  for(const c of model.importClashes)assert.deepEqual(plain(resolved[c.week].blocks[c.teacherIndex].cells[c.cellIndex]),plain(c.options[choice]));
  for(const key of ['odd','even'])for(let t=0;t<100;t++)for(let c=0;c<85;c++)if(!model.importClashes.some(k=>k.week===key&&k.teacherIndex===t&&k.cellIndex===c))assert.deepEqual(plain(resolved[key].blocks[t].cells[c]),plain(model[key].blocks[t].cells[c]));
  const archive=await C.makeWorkbook(resolved),reloaded=await C.parseFile(await archive.blob.arrayBuffer());
  assert.equal(reloaded.importClashes,undefined);assert.deepEqual(plain((reloaded.single||reloaded.odd).blocks.map(b=>b.cells)),plain(resolved.odd.blocks.map(b=>b.cells)));
 }
 assert.equal(JSON.stringify(model),original,'resolution never mutates candidate source');
 const different=C.resolveClashes(model,Object.fromEntries(model.importClashes.map((c,i)=>[c.id,i%2])));assert.equal(different.odd.blocks[1].cells[28][0],'Activity A');assert.equal(different.odd.blocks[1].cells[29][0],'Activity B');
 for(const oddEven of [true,false]){const merged=await C.parseFile(Buffer.from(F.html({oddEven,clash:false,horizontal:true})));assert.equal(merged.importClashes,undefined);const week=merged.single||merged.odd;assert.equal(week.blocks[1].cells[2][0],'Inherited lesson');assert.equal(week.blocks[1].cells[3][0],'Inherited lesson');assert.equal(week.blocks[1].cells[28][0],'Activity B');}
 await assert.rejects(C.parseFile(Buffer.from(F.html({missing:true}))),/missing its teacher name/);
 const excel=await C.parseFile(await F.xlsx(JSZip));assert.equal(excel.teacherCount,2);assert.equal(excel.importClashes.length,4);assert.equal(excel.odd.blocks[0].cells[2][0],'Inherited');
 await assert.rejects(C.parseFile(await F.xlsx(JSZip,{mixed:true})),/ambiguous mixed lesson fields/);
 // A failed overlap must not be silently shifted into a second teacher or next day.
 const crossing=F.html({teachers:2,clash:false}).replace('<td rowspan="2"></td>','<td rowspan="2" colspan="18"></td>');
 await assert.rejects(C.parseFile(Buffer.from(crossing)),/Incomplete|Unexpected|merged lesson crosses|merged timetable cells/);
 console.log('PASS v708 merged HTML/XLSX import: 100 synthetic identities, four exact clashes, source span deduplication, every explicit choice, no unresolved save/export, all unrelated cells preserved, archives reimport without discarded lessons, genuine missing names and ambiguous mixed fields rejected.');
 dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
