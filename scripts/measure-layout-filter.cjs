// Headless DOM timing only. This does not measure browser paint or display scaling.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),{JSDOM}=require('jsdom'),Layout=require('../shared/layout-data');
function measure(source){
 const dom=new JSDOM(fs.readFileSync('layout-update/public/index.html','utf8'),{url:'https://layout.example',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext());
 try{
  w.document.querySelector('#tgView').hidden=false;w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{width:1000,height:30}]};
  w.fetch=()=>{throw Error('Unexpected network')};w.HTMLCanvasElement.prototype.getContext=()=>({measureText:s=>({width:String(s).length*7})});
  run(fs.readFileSync('shared/table-tools.js','utf8'));run(fs.readFileSync(source,'utf8').replace(/refreshCampus\(\);restoreSession\(\);[\s\S]+$/,''));
  w.fixture=Layout.publicView(JSON.parse(fs.readFileSync('data/layout-2026.json','utf8')));run("campus=fixture;view='tg';renderTG()");
  const input=w.document.querySelector('[data-tg-filter="teacher"]'),body=w.document.querySelector('#tgRows'),first=body.rows[0],times=[],results=[];let rebuilt=0;
  for(let i=0;i<24;i++){
   const previous=body.rows[0];input.value=['yan','lu','zz-no-match',''][i%4];const start=performance.now();input.dispatchEvent(new w.Event('input',{bubbles:true}));times.push(performance.now()-start);if(body.rows[0]!==previous)rebuilt++;
   const visible=[...body.rows].filter(r=>!r.hidden).map(r=>r.cells[0].textContent);if(i<4)results.push(visible);
   assert.equal(w.GSISTableTools.snapshot(w.document.querySelector('#tgTable')).rows.length,visible.length);
  }
  times.sort((a,b)=>a-b);return {source,groups:w.fixture.groups.length,filterEvents:24,medianMs:+times[12].toFixed(3),tableRowReplacements:rebuilt,keptFirstRow:first===body.rows[0],results};
 }finally{w.close();}
}
const after=measure('layout-update/public/app.js'),before=process.env.GSIS_LAYOUT_BASELINE?measure(process.env.GSIS_LAYOUT_BASELINE):null;
if(before)assert.deepEqual(after.results,before.results,'Visible matches and filtered export must be unchanged');
const report={kind:'Local JSDOM filter events only; not real browser rendering',...(before?{before}:{}),after};
if(process.env.GSIS_MEASURE_OUTPUT)fs.writeFileSync(process.env.GSIS_MEASURE_OUTPUT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
