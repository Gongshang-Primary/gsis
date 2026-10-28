const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const path=require('path');const base=process.env.GSIS_MEASURE_SOURCE||process.cwd();
const {ctx,book,sheets}=require(base+'/tests/storage.cjs');
const run=s=>vm.runInContext(s,ctx);
let active=false,stats,rangeDepth=0;
const add=(k,n=1)=>{if(active)stats[k]=(stats[k]||0)+n;};
book.getId=()=>{add('bookIdCalls');return 'synthetic';};
const originalLookup=book.getSheetByName.bind(book);
book.getSheetByName=n=>{add('sheetLookupCalls');return originalLookup(n);};
const patched=new WeakSet();
function hook(){for(const [name,s] of sheets){if(patched.has(s))continue;patched.add(s);s.getName=()=>{add('sheetNameCalls');return name;};s.getParent=()=>{add('sheetParentCalls');return book;};
 for(const method of ['getLastRow','getMaxRows','insertRowsAfter']){const original=s[method].bind(s);s[method]=(...a)=>{add(method+'Calls');return original(...a);};}
 const get=s.getRange.bind(s);s.getRange=(...args)=>{add('getRangeCalls');const r=get(...args);let [row,col,h=1,w=1]=args;if(typeof row==='string'){w=row==='A2:B2'?2:1;col=row==='B2'?2:1;row=2;}
  for(const method of ['getValues','getValue','setValues','setValue','createTextFinder']){const original=r[method];if(!original)continue;r[method]=function(...a){const outer=rangeDepth===0;rangeDepth++;try{return original.apply(this,a);}finally{rangeDepth--;if(outer){add('native_'+method);if(method.startsWith('get')){add('nativeReadCells',h*w);if(active)stats.readRanges.push({sheet:name,row,height:h,width:w,mode:'native'});}if(method.startsWith('set'))add('nativeWriteCells',h*w);}}};}return r;};}}
const originalInsert=book.insertSheet.bind(book);book.insertSheet=n=>{const s=originalInsert(n);hook();return s;};
ctx.SpreadsheetApp.openById=()=>{add('openWorkbookCalls');return book;};
ctx.SpreadsheetApp.flush=()=>add('flushCalls');
ctx.LockService.getScriptLock=()=>({tryLock:()=>{add('lockAttempts');return true;},releaseLock:()=>add('lockReleases')});
function parse(a){const m=/^'((?:[^']|'')*)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(a);if(!m)throw Error(a);const n=s=>[...s].reduce((a,c)=>a*26+c.charCodeAt(0)-64,0);return {sheet:sheets.get(m[1].replace(/''/g,"'")),name:m[1].replace(/''/g,"'"),row:+m[3],col:n(m[2]),height:+m[5]-m[3]+1,width:n(m[4])-n(m[2])+1};}
ctx.Sheets={Spreadsheets:{Values:{batchGet(id,p){add('apiReadRequests');return {valueRanges:p.ranges.map(a=>{const r=parse(a);add('apiReadRanges');add('apiReadCells',r.height*r.width);if(active)stats.readRanges.push({sheet:r.name,row:r.row,height:r.height,width:r.width,mode:'api'});return {values:Array.from({length:r.height},(_,y)=>Array.from({length:r.width},(_,x)=>r.sheet.data[r.row+y-1]?.[r.col+x-1]??''))};})};},batchUpdate(p,id){add('apiWriteRequests');for(const item of p.data){const r=parse(item.range);add('apiWriteRanges');add('apiWriteCells',r.height*r.width);item.values.forEach((line,y)=>line.forEach((v,x)=>{r.sheet.data[r.row+y-1]??=[];r.sheet.data[r.row+y-1][r.col+x-1]=v;}));}return {};}}}};
hook();
run(`c.user.email=who.email;c.people=Array.from({length:159},(_,i)=>({id:'t'+(i+1),name:'Synthetic Teacher '+(i+1),role:'Teacher',active:true,profile:{Role:'Teacher',Active:'Y'}}));c.sysFields={'Day of Birth':Array.from({length:31},(_,i)=>String(i+1)),'Month of birth':Array.from({length:12},(_,i)=>String(i+1)),Role:['Teacher','HOD SM'],'EO Appt Level':['HOD'],'Appointment Status':['Confirmed'],'Employment Modifier':['4/5'],'Subject Modifier':['EL'],Active:['Y','N'],'MK Modifier':[]};c.roleCatalogue=[{role:'Teacher',level:'',groups:[]},{role:'HOD SM',level:'HOD',groups:['KP']}];var probeId,probeDoc,probeEdit,probeRequest;var entryProbe=()=>index_(book_()).versions.find(x=>x.id===probeId),getProbe=()=>document_(book_(),entryProbe());`);
function measure(label,code){hook();stats={label,readRanges:[]};active=true;let result;try{result=run(code);}finally{active=false;}stats.responseBytes=Buffer.byteLength(JSON.stringify(result));stats.saved=!!result?.saved;stats.hasDelta=!!result?.delta;stats.apiReadCells??=0;stats.apiWriteCells??=0;stats.flushCalls??=0;stats.readCells=(stats.nativeReadCells||0)+stats.apiReadCells;stats.metadataCalls=['sheetLookupCalls','getLastRowCalls','getMaxRowsCalls','sheetNameCalls','sheetParentCalls','bookIdCalls','getRangeCalls'].reduce((n,k)=>n+(stats[k]||0),0);return stats;}
function save(label,prepare){run('probeDoc=getProbe();'+prepare+`;probeRequest={operation:'saveDraft',versionId:probeId,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'q149-probe',edits:probeEdit,returnDelta:true,since:entryProbe().revision,authority:'Admin+KP',auditPaged:true};`);return measure(label,`call('change',probeRequest)`);}
const measurements=[];
for(const count of [0,1500]){
 run(`probeId=call('change',{operation:'create',name:'Q149 synthetic '+${count},requestId:Utilities.getUuid()}).versionId;probeDoc=getProbe();probeDoc.assignments=Array.from({length:${count}},(_,i)=>({id:'synthetic-assignment-'+i,teacher:'t'+(i%159+1),target:'1P',subject:'EL',level:'1',venue:'F1-16'}));probeDoc.masterOptions=JSON.parse(JSON.stringify(c.sysFields));probeDoc.membership=seedMembership_(c);probeDoc.hrChoicesSchema=1;probeDoc.offload=GSISTeachingRules.migrate(probeDoc.offload);persist_(book_(),index_(book_()),probeDoc,null);`);
 const rows=[];
 rows.push(measure('full bootstrap',`call('bootstrap',{versionId:probeId,auditPaged:true,full:true})`));
 run('var unchangedRevision=entryProbe().revision,unchangedGlobal=index_(book_()).revision;');
 rows.push(measure('unchanged delta',`call('delta',{versionId:probeId,since:unchangedRevision,globalRevision:unchangedGlobal,authority:'Admin+KP',auditPaged:true})`));
 rows.push(save('Fortnight toggle',`probeEdit=[{operation:'setFortnight',row:'["1","EL"]',field:'enabled',expected:'',value:true}];`));
 rows.push(save('Load Settings first normalising save',`probeEdit=[{operation:'setLoad',level:'1',subject:'EL',expected:probeDoc.loads['1'].EL,value:14}];`));
 rows.push(save('Offload one rate',`var o=JSON.parse(JSON.stringify(probeDoc.offload));o.tags.find(r=>r.match==='HOD').percent=31;probeEdit=[{operation:'setOffload',expected:probeDoc.offload,value:o}];`));
 rows.push(save('HR Terms one option',`var o=JSON.parse(JSON.stringify(probeDoc.masterOptions));o['Subject Modifier'].push('Synthetic option');probeEdit=[{operation:'patchPlanning',source:'setMasterOptions',changes:GSISFields.diff(probeDoc.masterOptions,o)}];`));
 rows.push(save('Membership one label',`var o=JSON.parse(JSON.stringify(probeDoc.membership));o[0][1]='Synthetic role label';probeEdit=[{operation:'patchPlanning',source:'setMembership',changes:GSISFields.diff(probeDoc.membership,o)}];`));
 rows.push(save('Load Settings steady one cell',`probeEdit=[{operation:'setLoad',level:'1',subject:'EL',expected:probeDoc.loads['1'].EL,value:13}];`));
 rows.push(measure('same save submitted again',`call('change',probeRequest)`));
 rows.push(measure('receipt confirmation',`call('receipt',{versionId:probeId,requestId:probeRequest.requestId})`));
 measurements.push({assignmentCount:count,teacherCount:159,rows});
}
const output={baseline:require(base+'/package.json').gsisRelease,sourceHash:crypto.createHash('sha256').update(fs.readFileSync(base+'/backend/Code.gs')).digest('hex'),scope:'Synthetic service-call counts using unchanged real Deploy dispatch/storage code with an in-memory native spreadsheet and Sheets API. No network, Google execution, Contacts authority round trip, browser render time or live latency measured. Metadata invocations are counted, not asserted to be separate network RPCs.',measurements};
fs.writeFileSync(process.env.GSIS_MEASURE_OUTPUT||path.join(process.cwd(),'verification/504-deploy-counts.json'),JSON.stringify(output,null,2));
for(const m of measurements)for(const r of m.rows){const {readRanges,...summary}=r;console.log(JSON.stringify({assignments:m.assignmentCount,...summary}));}
