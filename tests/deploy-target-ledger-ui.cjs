const assert=require('node:assert/strict'),fs=require('node:fs'),JSZip=require('jszip'),make=require('./dom-helper.cjs'),fixture=require('./helpers/deploy-target-fixture');
(async()=>{
 const ui=make(),{w,run}=ui;w.TextEncoder=TextEncoder;w.Blob=Blob;
 try{
  run(`Object.assign(v(),${JSON.stringify(fixture())});`);
  for(const file of ['shared/excel-export.js','shared/table-tools.js'])run(fs.readFileSync(file,'utf8'));
  for(const summary of [false,true]){
   run(`document.querySelector('#content').innerHTML='';workloadTeacherTable(document.querySelector('#content'),workloadData(),${summary});`);
   const table=w.document.querySelector('.workload-ledger'),data=w.GSISTableTools.snapshot(table);
   assert.ok(data.headers.includes('Target'));assert.ok(data.headers.includes('At-load range'));assert.ok(data.headers.includes('R'));
   assert.ok(!data.headers.includes('Target offload %'));assert.doesNotMatch(table.outerHTML,/Target offload/i);
   assert.equal(table.rows[1].cells.length,table.tHead.rows[0].cells.length);
   const blob=w.GSISExcel.workbook([data.headers,...data.rows],'Ledger'),zip=await JSZip.loadAsync(await blob.arrayBuffer()),xml=await zip.file('xl/worksheets/sheet1.xml').async('string');
   assert.doesNotMatch(xml,/Target offload/i);assert.match(xml,/At-load range/);assert.match(xml,/>Target</);
  }
  run("v().relief.fajtWeeklyPeriods=60;v().relief.weeklyPeriods=90;");
  assert.match(run('ledgerFormula(workloadData())'),/FAJT retains 60\/90 with no appointment stacking/);
  for(const setup of ['delete v().relief','v().relief={schema:3}',`v().relief=${JSON.stringify({...fixture().relief,fajtWeeklyPeriods:0})}`]){
   run(setup);run("document.querySelector('#content').innerHTML='';workloadTeacherTable(document.querySelector('#content'),workloadData(),false);");
   const data=w.GSISTableTools.snapshot(w.document.querySelector('.workload-ledger')),fajt=data.rows.find(r=>r[0]==='fajt');
   assert.equal(fajt[data.headers.indexOf('Target')],'Needs configuration');assert.equal(fajt[data.headers.indexOf('At-load range')],'Unavailable');
   assert.match(run('ledgerFormula(workloadData())'),/FAJT.*Needs configuration/);assert.doesNotMatch(run('ledgerFormula(workloadData())'),/65\/84/);
  }
  const view=require('./relief-view-fixture'),d=fixture();d.relief.fajtWeeklyPeriods=60;d.relief.weeklyPeriods=90;
  for(const roles of [['Admin'],['KP'],[]]){
   const projection=view(d,roles);w.projected=projection;run("state.versions=[{...projected,id:'v1'}];current='v1';");
   if(!roles.includes('Admin')){assert.equal(projection.relief,undefined);assert.equal(projection.reliefAdmin,undefined);}
   assert.deepEqual(projection.reliefResults.targetSettings,{schema:3,weeklyPeriods:90,fajtWeeklyPeriods:60});
   assert.equal(run("workloadData().rows.find(r=>r.teacher.id==='fajt').targetRetained"),60/90);
   assert.match(run('ledgerFormula(workloadData())'),/FAJT retains 60\/90/);
  }
  const missing=fixture();delete missing.relief;assert.equal(view(missing,['KP']).reliefResults.targetSettings,null);
  assert.equal(run('typeof GSISRelief'),'undefined','private calculation engine stays server-side');
  console.log('PASS both ledger views, table/print markup, real XLSX output, configured help and missing-setting labels');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
