const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {ctx,book,sheets}=require('../tests/storage.cjs'),run=s=>vm.runInContext(s,ctx);
run(`c.people=Array.from({length:159},(_,i)=>({id:'staff-'+i,name:'Synthetic Teacher '+i,active:true,role:'Teacher'}));var reviewId=call('change',{operation:'create',name:'Synthetic 404 history review',requestId:Utilities.getUuid()}).versionId;var di=index_(book_()),de=di.versions.find(x=>x.id===reviewId),dd=document_(book_(),de);dd.organisations.plt[0].slots=['','staff-0'];persist_(book_(),di,dd,null);`);
let records=[],flushes=0,enabled=false;const patched=new WeakSet();
function hook(){for(const [name,s] of sheets){if(patched.has(s))continue;patched.add(s);const get=s.getRange.bind(s);s.getRange=(...args)=>{const range=get(...args);let nested=0;for(const method of ['getValues','getValue','setValues','setValue','createTextFinder']){const base=range[method];if(!base)continue;range[method]=function(...v){let out;const record=enabled&&!nested;try{nested++;out=base.apply(this,v);return out;}finally{nested--;if(record){let [row,col,n=1,m=1]=args;if(typeof row==='string'){m=row==='A2:B2'?2:1;col=row==='A2:B2'?1:2;row=2;}records.push({sheet:name,method,row,col,n,m,cells:method==='createTextFinder'?0:n*m});}}};}return range;};}}
ctx.SpreadsheetApp.flush=()=>{if(enabled)flushes++;};
function measure(code){hook();records=[];flushes=0;enabled=true;let result;try{result=run(code)}finally{enabled=false;}const reads=records.filter(x=>x.method.startsWith('get')),writes=records.filter(x=>x.method.startsWith('set'));return {readCalls:reads.length,readCells:reads.reduce((n,x)=>n+x.cells,0),receiptSearchCalls:records.filter(x=>x.method==='createTextFinder').length,writeCalls:writes.length,writeCells:writes.reduce((n,x)=>n+x.cells,0),flushes,responseBytes:Buffer.byteLength(JSON.stringify(result)),result};}
const results=[];
for(let count=0;count<=1000;count++){
 run(`var patch={operation:'patchPlanning',source:'setOrganisation',kind:'plt',changes:[{key:'["@plt-0","slots","#1"]',old:JSON.stringify({v:'staff-'+(${count}%2)}),value:JSON.stringify({v:'staff-'+((${count}+1)%2)})}]};var priorRevision=index_(book_()).versions.find(x=>x.id===reviewId).revision;`);
 const save=measure(`call('change',{operation:'saveDraft',versionId:reviewId,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'404',edits:[patch]})`);
 if([0,10,100,1000].includes(count)){
  const tx=run('fieldJournalRead_(book_(),index_(book_()).versions.find(x=>x.id===reviewId).lastDelta)');
  const business=tx.delta.changes.filter(x=>!['audit','fieldAuthors','saveReceipts'].includes(JSON.parse(x.key)[0]));assert.equal(business.length,1);
  const audit=measure(`call('auditPage',{versionId:reviewId})`),detail=measure(`call('auditPage',{versionId:reviewId,detailId:${JSON.stringify(audit.result.events[0].id)},row:${audit.result.events[0].row},epoch:${JSON.stringify(audit.result.events[0].epoch)}})`);
  const delta=measure(`call('delta',{versionId:reviewId,since:priorRevision,authority:'Admin+KP',auditPaged:true})`);
  for(const x of [save,audit,detail,delta])delete x.result;
  results.push({priorSaves:count,businessFields:business.length,save,audit,detail,delta});console.log('Measured history',count,'save reads',save.readCalls,'cells',save.readCells);
 }
}
assert.ok(results.every(x=>x.save.readCalls===results[0].save.readCalls),'Save read calls grow with history');assert.ok(results.every(x=>x.audit.readCalls<=5),'Audit loads whole history');assert.ok(results.every(x=>x.save.readCells<results[0].save.readCells*1.2),'Ordinary read payload grows with receipts');
const otherWrites=[];
for(const [name,edits] of [['IP add teacher',[{operation:'addTeacher',target:'1P',subject:'EL',teacher:'staff-0',expected:false}]],['IP unassign class',[{operation:'moveClass',form:'1P',venue:'',expected:'F1-16'}]],['IP remove teacher',[{operation:'removeTeacher',target:'1P',subject:'EL',teacher:'staff-0',expected:true}]]]){run('var extraEdits404='+JSON.stringify(edits)+';var extraRevision404=index_(book_()).versions.find(x=>x.id===reviewId).revision;');const m=measure(`call('change',{operation:'saveDraft',versionId:reviewId,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'404',edits:extraEdits404,since:extraRevision404,returnDelta:true,authority:'Admin+KP',auditPaged:true})`);assert.ok(m.result.delta);delete m.result;otherWrites.push({name,...m});}
run(`var noteBefore404=document_(book_(),index_(book_()).versions.find(x=>x.id===reviewId),'note').notes||'';`);
const note=measure(`call('change',{operation:'saveVersionNote',versionId:reviewId,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'404',expected:noteBefore404,notes:'Synthetic note after 1000 prior PLT saves'})`);delete note.result;otherWrites.push({name:'Save version note',...note});
assert.ok(otherWrites.every(x=>x.readCalls<=8),'Representative write has excessive reads');
fs.writeFileSync('verification/performance404.json',JSON.stringify({scope:'Synthetic 159 staff; actual backend functions and 1001 consecutive PLT saves. Spreadsheet value calls exclude metadata and real service/network latency; TextFinder searches separately counted.',results,otherWrites},null,2));console.log('PASS bounded PLT reads through 1000 historical saves and paged Audit/detail reads.');
