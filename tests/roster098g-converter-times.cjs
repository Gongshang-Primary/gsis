'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),JSZip=require('jszip');
(async()=>{
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;w.JSZip=JSZip;w.Blob=Blob;
 try{
  w.eval(fs.readFileSync('roster-update/public/converter.js','utf8'));
  const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:2,maxPeriod:1,blocks:[{name:'Teacher One',cells:Array.from({length:10},()=>['=Literal','1A','Room','Group'])}]};
  const model={layoutMode:'single-week',single:week,maxPeriod:1,teacherCount:1,timing:{startMinutes:457,periodMinutes:23,normalLastPeriod:1}},before=JSON.stringify(model);
  async function read(value){const out=await w.RosterConverter.makeWorkbook(value),zip=await JSZip.loadAsync(await out.blob.arrayBuffer());return {sheet:new w.DOMParser().parseFromString(await zip.file('xl/worksheets/sheet1.xml').async('string'),'application/xml'),book:new w.DOMParser().parseFromString(await zip.file('xl/workbook.xml').async('string'),'application/xml')};}
  const {sheet,book}=await read(model),text=(address)=>sheet.querySelector('c[r="'+address+'"]')?.textContent||'';
  assert.equal(text('B4'),'07:37\n08:00','time row must use source start and duration');
  assert.equal(text('C4'),'08:00\n08:23');assert.equal(text('D4'),'07:37\n08:00','each weekday repeats its period schedule');
  assert.equal(text('B5'),'0','period header directly follows time row');
  assert.equal(text('A6'),'Teacher One');assert.equal(text('B6'),'=Literal');assert.equal(sheet.querySelectorAll('f').length,0);
  assert.equal(sheet.querySelector('pane').getAttribute('ySplit'),'5');assert.equal(sheet.querySelector('pane').getAttribute('xSplit'),'1');assert.equal(sheet.querySelector('pane').getAttribute('topLeftCell'),'B6');
  assert.equal(book.querySelector('definedName[name="_xlnm.Print_Titles"]').textContent,"'Teachers'!$1:$5");
  assert.equal(sheet.querySelector('mergeCell[ref="A6:A9"]')!==null,true);assert.equal(JSON.stringify(model),before);
  const output=await w.RosterConverter.makeWorkbook(model),imported=await w.RosterConverter.parseFile(await output.blob.arrayBuffer());
  assert.equal(JSON.stringify(imported.single.blocks.map(b=>({name:b.name,cells:b.cells}))),JSON.stringify(week.blocks),'the new time header must remain compatible with baseline reimport');
  const noTiming=structuredClone(model);delete noTiming.timing;const missing=await read(noTiming);assert.equal(missing.sheet.querySelector('c[r="B4"]').textContent,'Time unavailable','missing schedule must not fabricate time');
  console.log('PASS G converter workbook: source times directly before periods, frozen headers, repeated print titles, stable four-row data, literal text and missing-time label.');
 }finally{dom.window.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
