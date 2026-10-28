const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');
const root=path.join(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'gsis506-performance-')),output=path.join(temp,'counts.json');
try{
 const child=spawnSync(process.execPath,[path.join(root,'scripts/measure506.cjs')],{cwd:root,env:{...process.env,GSIS_MEASURE_OUTPUT:output},encoding:'utf8',timeout:25000,maxBuffer:2*1024*1024});
 assert.equal(child.status,0,String(child.error||child.stderr||child.stdout).slice(-4000));const report=JSON.parse(fs.readFileSync(output,'utf8'));
 // v0.6.08 profile edits include reporting and relief references for atomic inactive cleanup.
 // Measured teacher-field reads: 13,653 cells empty; 55,665 with 1,500 assignments. Write batches stay at two.
 const ceilings={'Span of Control one officer':11000,'Classes ability':1200,'Classes name set':600,'Classes name edit':51000,'HR teacher note':6500,'HR exclusion':7500,'HR teacher field':56000};
 for(const fixture of report.measurements)for(const [label,max]of Object.entries(ceilings)){
  const row=fixture.rows.find(r=>r.label===label);assert.ok(row.saved,label);assert.ok(row.readCells<max,label+' cells '+row.readCells);assert.equal(row.readRanges.filter(r=>r.mode==='api'&&!r.sheet.includes('deploy_index')).length>=1,true,label+' has scoped value reads');assert.ok(row.readRanges.filter(r=>r.mode==='api'&&r.sheet.includes('deploy_index')).every(r=>r.height===1&&r.width===1));assert.equal(row.apiWriteRequests,2,label+' uses atomic preparation and completion batches');assert.ok(row.flushCalls<=4);
 }
 for(const label of ['Span of Control one officer','Classes ability','Classes name set','HR teacher note','HR exclusion'])assert.equal(report.measurements[0].rows.find(r=>r.label===label).readCells,report.measurements[1].rows.find(r=>r.label===label).readCells,label+' must not grow with unrelated IP assignments');
 for(const fixture of report.measurements){const row=fixture.rows.find(r=>r.label==='audit first page');assert.ok(row.readRanges.filter(r=>r.mode==='api'&&!r.sheet.includes('deploy_index')).every(r=>r.width===4));assert.equal(row.readRanges.filter(r=>r.sheet.includes('deploy_index')).length,2);}
 console.log('PASS 506 performance: class/HR bounds, scoped values, fresh API markers and atomic preparation/completion, assignment-independent simple edits, four-column audit summaries with both consistency checks');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
