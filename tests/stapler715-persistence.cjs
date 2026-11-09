'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const S=require('../shared/roster-stapler.js'),O=require('../shared/roster-operations.js'),clone=x=>JSON.parse(JSON.stringify(x)),root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'backend/Code.gs'),'utf8'),post=source.slice(source.indexOf('function doPost(e){'),source.indexOf('\nfunction auth_',source.indexOf('function doPost(e){')));
function blob(value,type,name){const bytes=Buffer.from(value);return {getBytes:()=>[...bytes],getDataAsString:()=>bytes.toString('utf8'),getContentType:()=>type,getName:()=>name};}
function harness(day,people){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gsis715-save-')),file=path.join(dir,'operations.json'),secret='715-regression-secret-'.repeat(3),properties=new Map([["GSIS_SECRET",secret],['ROSTER_OPERATIONS_FILE','ops-file']]);
 fs.writeFileSync(file,JSON.stringify(O.initial()));let reads=0,writes=0,failWrite=false,loseResponse=false;
 const now=Date.parse(day.date+'T06:00:00+08:00'),identity={email:'admin@gsps.edu.sg',subject:'verified-test-subject'},contacts={user:{rosterStaffId:people[0].id,rosterSMC:true,rosterAdmin:true},rosterPeople:people,rosterSMCIds:[people[0].id],rosterAdminIds:[people[0].id]};
 const context={today:day.date,now,iso:new Date(now).toISOString(),minute:360,user:{...identity,staffId:people[0].id,smc:true,admin:true},people,days:{[day.date]:day},baselineDays:{[day.date]:day},timetableEntries:[{id:day.id,from:'2026-01-01',to:'2026-12-31'}],uuid:crypto.randomUUID,smcIds:[people[0].id],notificationsConfigured:false,adminRecipients:[]};
 function call(input,options={}){
  // Each request starts a fresh Apps Script runtime. Only the file and script properties survive.
  let locked=false;const NativeDate=Date,ClockDate=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  const scope=vm.createContext({Date:ClockDate,console,GSIS_DEPLOY_VERSION:'test',GSISSheets:{resetStats(){}},props_:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v),getProperties:()=>Object.fromEntries(properties),deleteProperty:k=>properties.delete(k)}),
   error_:(status,message)=>{throw Object.assign(Error(message),{status});},out_:x=>clone(x),signature_:(payload,key)=>crypto.createHmac('sha256',key).update(payload).digest('hex'),same_:(a,b)=>a===b,contacts_:()=>contacts,
   Utilities:{getUuid:crypto.randomUUID,DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()],newBlob:blob,gzip:b=>blob(zlib.gzipSync(Buffer.from(b.getBytes()))),ungzip:b=>{assert.equal(b.getContentType(),'application/x-gzip','the host must receive a gzip Blob, not an untyped byte Blob');assert.match(b.getName(),/\.gz$/);return blob(zlib.gunzipSync(Buffer.from(b.getBytes())));},base64Encode:b=>Buffer.from(b).toString('base64'),base64Decode:s=>[...Buffer.from(s,'base64')]},
   ScriptApp:{getOAuthToken:()=> 'test-token'},LockService:{getScriptLock:()=>({})},deployLock_:()=>{assert(!locked);locked=true;return true;},deployUnlock_:()=>{assert(locked);locked=false;},
   UrlFetchApp:{fetch(url,request){const endpoint=new URL(url);assert.equal(endpoint.origin,'https://www.googleapis.com');assert.equal(request.headers.Authorization,'Bearer test-token');assert.equal(endpoint.searchParams.get('supportsAllDrives'),'true');let text;
    if(request.method==='patch'){assert(locked);assert.equal(endpoint.pathname,'/upload/drive/v3/files/ops-file');if(failWrite){failWrite=false;return {getResponseCode:()=>503,getContentText:()=>JSON.stringify({error:{errors:[{reason:'backendError'}]}})};}fs.writeFileSync(file,request.payload);writes++;if(loseResponse){loseResponse=false;throw Error('response lost after durable write');}text='{}';}
    else{assert.equal(endpoint.pathname,'/drive/v3/files/ops-file');assert.equal(endpoint.searchParams.get('alt'),'media');reads++;text=fs.readFileSync(file,'utf8');}return {getResponseCode:()=>200,getContentText:()=>text};}}
  });
  if(options.instrumentValidation)scope.__staplerChecks={full:0,incremental:0,tiles:0};
  scope.PropertiesService={getScriptProperties:scope.props_};require('./load-backend-role.cjs')(scope,'roster');for(const name of ['backend/ApiSecret.gs','shared/roster.js','shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','backend/Roster.gs','backend/RosterOperations.gs','backend/StaplerLeases.gs']){let code=fs.readFileSync(path.join(root,name),'utf8');if(options.instrumentValidation&&name==='shared/roster-stapler.js')code=code.replace('  const changedIds=', '  __staplerChecks[incremental?"incremental":"full"]++;__staplerChecks.tiles+=changed.length; const changedIds=');vm.runInContext(code,scope);}
  if(!options.actualContext)scope.rosterOperationsContext_=()=>({...clone(context),uuid:crypto.randomUUID});scope.rosterToday_=()=>day.date;scope.rosterDiagnostic_=()=>{};scope.rosterStage_=()=>{};scope.rosterDiagnosticError_=e=>e.message;scope.rosterDiagnosticText_=x=>String(x);
  vm.runInContext(post,scope);
  if(options.inspect)options.inspect(scope);
  const payload=JSON.stringify({action:options.action||'rosterOperations',input,identity,timestamp:now,nonce:crypto.randomUUID()}),signature=options.badSignature?'invalid':crypto.createHmac('sha256',secret).update(payload).digest('hex'),raw=JSON.stringify({payload,signature});
  return {result:scope.doPost({postData:{contents:raw}}),envelopeChars:raw.length,payloadBytes:Buffer.byteLength(payload),validationChecks:scope.__staplerChecks};
 }
 return {call,state:()=>JSON.parse(fs.readFileSync(file,'utf8')),replace:s=>fs.writeFileSync(file,JSON.stringify(s)),writes:()=>writes,failWrite:()=>{failWrite=true;},loseResponse:()=>{loseResponse=true;},close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
function fixture(){
 const date='2026-10-21',periods=Array.from({length:17},(_,period)=>({period,startMinutes:420+period*30,endMinutes:450+period*30})),teachers=Array.from({length:104},(_,i)=>({staffId:'staff-'+i,name:'Teacher '+i,timetableName:'Teacher '+i,cells:periods.map((_,p)=>p>0&&p<11?['EL','Exam '+i,'Room '+i,'']:['','','',''])})),people=teachers.map(t=>({id:t.staffId,name:t.name,active:true}));
 const day={date,id:'baseline',parity:'even',verified:true,schoolDay:true,periods,teachers,formClasses:[],recesses:[]};
 const payload={app:'Stapler',version:'4.3',stateType:'plan',selectedDate:date,selectedDay:'Wednesday',selectedSheet:'Even Week',startTime:'07:00',periodMinutes:30,addedTeachers:teachers.slice(0,-1).map(t=>t.name),reliefAbsences:[],tiles:teachers.slice(0,-2).flatMap(t=>Array.from({length:7},(_,i)=>({id:t.staffId+':'+i,teacher:t.name,assignedPeriod:i+1,subject:'SCI',className:'Exam '+t.staffId,venue:'Hall',group:'',sheet:'Even Week',day:'Wednesday',location:'teacher'})))};
 return {day,people,plan:S.importLegacy(S.create(day),payload,{people})};
}
function verify({day,people,plan},label,failureCases=false){
 const h=harness(day,people),leaseSessionId=crypto.randomUUID();const command=(operation,fields={})=>({operation,view:'stapler',date:day.date,leaseSessionId,leaseFence:1,revision:0,staplerRevision:0,requestId:crypto.randomUUID(),...fields});
 try{
  assert.equal(h.call(command('acquireStaplerLock',{leaseFence:0})).result.ok,true);
  const save=command('saveStapler',{plan}),bad=h.call(save,{badSignature:true});assert.equal(bad.result.status,401);assert.equal(h.writes(),0);
  const saved=h.call(save);assert(saved.envelopeChars>600000,'fixture must cross the previous signed-envelope limit');assert(saved.payloadBytes<2200000);assert.equal(saved.result.ok,true,JSON.stringify(saved.result));assert.equal(h.writes(),1);
  assert.equal(h.state().staplerPlans[0].draft.encoding,'gzip-base64-v1','actual store writes compressed durable payload');
  const read=h.call({operation:'stapler',date:day.date,leaseSessionId}).result;assert.equal(read.ok,true,JSON.stringify(read));assert.equal(read.data.confirmed,null,'Save alone keeps a draft');assert.equal(read.data.staplerRevision,1);const expected=clone(plan);expected.status='draft';assert.deepEqual(read.data.plan,expected,'fresh request reloads every tile, blank and source field before Confirm');
  const list=h.call({operation:'staplerDates',leaseSessionId}).result;assert.equal(list.data.dates.find(r=>r.date===day.date).draftRevision,1);
  assert.equal(h.call(save).result.data.replayed,true);assert.equal(h.writes(),1,'retry cannot duplicate saved draft');
  let revision=1;
  if(failureCases){
   const again=command('saveStapler',{plan,revision:1,staplerRevision:1});h.failWrite();assert.equal(h.call(again).result.ok,false,'failed Drive write is never a successful Save');assert.equal(h.writes(),1);assert.equal(h.call({operation:'stapler',date:day.date,leaseSessionId}).result.data.staplerRevision,1);
   h.loseResponse();assert.equal(h.call(again).result.ok,false,'lost write acknowledgement remains an uncertain save');assert.equal(h.writes(),2);assert.equal(h.call({operation:'stapler',date:day.date,leaseSessionId}).result.data.staplerRevision,2,'fresh runtime recovers committed draft after lost acknowledgement');assert.equal(h.call(again).result.data.replayed,true);assert.equal(h.writes(),2);revision=2;
  }
  const confirm=h.call(command('confirmStapler',{revision,staplerRevision:revision})).result;assert.equal(confirm.ok,true,JSON.stringify(confirm));assert.equal(h.writes(),revision+1);
  const confirmed=h.call({operation:'stapler',date:day.date,leaseSessionId}).result;assert(confirmed.data.confirmed);assert.deepEqual(S.effectiveDay(confirmed.data.plan,day).teachers,S.effectiveDay(plan,day).teachers);assert.equal(h.state().outbox.length,0,'Save and Confirm do not send notices');
  const originalWrites=h.writes();assert.equal(h.call({...save,operation:'saveAbsence'}).result.status,400,'other large operations retain their existing envelope bound');assert.equal(h.call({...save,plan:{padding:'x'.repeat(4100000)}}).result.status,400,'oversize Stapler requests remain rejected');assert.equal(h.writes(),originalWrites);
  if(failureCases){const corrupt=h.state();corrupt.staplerPlans[0].draft.data='corrupt';h.replace(corrupt);assert.equal(h.call({operation:'stapler',date:day.date,leaseSessionId}).result.ok,false,'unreadable saved plan produces an error, never a successful baseline fallback');}
  console.log('PASS '+label+': '+Buffer.byteLength(JSON.stringify(plan))+' plan bytes, '+saved.envelopeChars+' signed envelope chars; Save, new-runtime readback, date list, receipt replay and Confirm persist'+(failureCases?'; failed write, lost acknowledgement and corrupt read handled without false success':''));
 }finally{h.close();}
}
if(require.main===module)verify(fixture(),'school-sized imported day',true);
async function supplied(dir,check=verify){
 const {JSDOM}=require('jsdom'),JSZip=require('jszip'),window=new JSDOM('').window,box={window,DOMParser:window.DOMParser,JSZip,TextEncoder,TextDecoder,Uint8Array};vm.createContext(box);vm.runInContext(fs.readFileSync(path.join(root,'roster-update/public/converter.js'),'utf8'),box);
 try{for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json')&&f!=='RELEASE_SUMMARY.json')){
  const payload=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')),workbook=await window.RosterConverter.parseFile(Buffer.from(payload.workbookBase64,'base64')),week=workbook.single||workbook[payload.selectedSheet.split(' ')[0].toLowerCase()],offset=week.days.indexOf(payload.selectedDay)*week.perDay,start=Number(payload.startTime.slice(0,2))*60+Number(payload.startTime.slice(3)),duration=Number(payload.periodMinutes),periods=Array.from({length:week.perDay},(_,period)=>({period,startMinutes:start+period*duration,endMinutes:start+(period+1)*duration})),teachers=week.blocks.map((b,i)=>({staffId:'staff-'+i,name:b.name,timetableName:b.name,cells:clone(b.cells.slice(offset,offset+week.perDay))})),people=teachers.map(t=>({id:t.staffId,name:t.name,active:true}));
  for(const name of payload.addedTeachers||[])if(!people.some(p=>p.name===name))people.push({id:'external-'+people.length,name,active:false});
  const day={date:payload.selectedDate,id:'baseline',parity:payload.selectedSheet.startsWith('Odd')?'odd':'even',verified:true,schoolDay:true,periods,teachers,formClasses:[],recesses:[]};check({day,people,plan:S.importLegacy(S.create(day),payload,{people,workbook})},file);
 }}finally{window.close();}
}
module.exports={harness,fixture,supplied};
if(require.main===module&&process.argv[2])supplied(path.resolve(process.argv[2])).catch(error=>{console.error(error);process.exitCode=1;});
