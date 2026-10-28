const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');
const root=path.join(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gsis505-performance-')),output=path.join(temporary,'counts.json');
try{
 // This invokes the actual current dispatcher and field store. The fixture has
 // native index/journal calls plus the Sheets API for exact data ranges.
 const result=spawnSync(process.execPath,[path.join(root,'scripts/measure504.cjs')],{cwd:root,env:{...process.env,GSIS_MEASURE_SOURCE:root,GSIS_MEASURE_OUTPUT:output},encoding:'utf8',timeout:25000,maxBuffer:2*1024*1024});
 assert.equal(result.status,0,'performance fixture failed: '+String(result.error||result.stderr||result.stdout).slice(-4000));
 const report=JSON.parse(fs.readFileSync(output,'utf8'));
 const ceilings={'Load Settings steady one cell':1000,'Load Settings first normalising save':1000,'Offload one rate':700,'HR Terms one option':650,'Fortnight toggle':1000,'Membership one label':10000,'same save submitted again':10,'receipt confirmation':10};
 assert.deepEqual(report.measurements.map(x=>x.assignmentCount),[0,1500]);
 for(const fixture of report.measurements){
  assert.equal(fixture.teacherCount,159);
  for(const [label,ceiling]of Object.entries(ceilings)){
   const row=fixture.rows.find(x=>x.label===label);assert.ok(row,'missing '+label);assert.equal(row.saved,true,label+' must succeed');
   assert.ok(row.readCells<=ceiling,`${label} at ${fixture.assignmentCount} assignments read ${row.readCells}; ceiling ${ceiling}`);
   assert.ok((row.apiWriteRequests||0)<=2,`${label}: atomic preparation and completion requests`);assert.ok(row.flushCalls<=4,`${label}: at most four durable/structural flushes`);
   if(['same save submitted again','receipt confirmation'].includes(label)){assert.equal(row.apiWriteCells,0);assert.equal(row.flushCalls,0);}
  }
 }
 const small=report.measurements[0],large=report.measurements[1];
 for(const label of Object.keys(ceilings)){const a=small.rows.find(r=>r.label===label),b=large.rows.find(r=>r.label===label);assert.equal(b.readCells,a.readCells,label+' must not grow with unrelated assignments');}
 // The first normalising save is measured separately from the steady save.
 // Legacy stores without root indexes intentionally do one broader upgrade read;
 // release504-storage / release404-upgrade validate that migration's integrity.
 const by=Object.fromEntries(large.rows.map(r=>[r.label,r.readCells]));
 console.log(`PASS 505 performance (synthetic, 159 teachers/1500 assignments): Load ${by['Load Settings steady one cell']}, Offload ${by['Offload one rate']}, HR ${by['HR Terms one option']}, Fortnight ${by['Fortnight toggle']}, duplicate ${by['same save submitted again']}, receipt ${by['receipt confirmation']} cells; <=2 API writes (journal plus completion), <=4 flushes`);
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
