// Independent, offline correctness checks. No network or production services.
// Usage: node review-correctness-v17.cjs [candidate-root]
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),vm=require('vm');
const baseline=path.join(__dirname,'baselines/v1.6');
const candidate=path.resolve(__dirname,'..');
const {harness,request}=require('./backend_harness.cjs');
const {base,response,deferred,workerEnv}=require('./frontend_harness.cjs');
const make=root=>harness({source:fs.readFileSync(path.join(root,'Source/backend/Code.gs'),'utf8')});
const results=[];
async function check(name,fn){try{results.push({name,ok:true,detail:await fn()});}catch(error){results.push({name,ok:false,error:error.message});}}
function auditRetry(root){
 const h=make(root),c=h.ctx;c.queueSecondaryTask_('event',{sessionId:'fixture-session',eventType:'LOAN_CREATED',teacher:'Staff',payload:{}});
 const key=Object.keys(h.properties).find(k=>k.startsWith(c.LORD_SECONDARY.PREFIX));
 const remove=h.props.deleteProperty;let fail=true;
 h.props.deleteProperty=k=>{if(k===key&&fail){fail=false;throw Error('Injected task acknowledgement failure');}return remove(k);};
 c.processSecondaryQueue_(10);c.processSecondaryQueue_(10);
 return {eventRows:h.sheets[c.LORD_CONFIG.SHEETS.EVENTS].data.length-1,pending:Boolean(h.properties[key])};
}
function identityInterleave(root){
 const h=make(root),c=h.ctx;h.admins.data[1][5]='';const find=c.findAdminByEmail_;let initial=true;
 c.findAdminByEmail_=email=>{const record=find(email);if(initial){initial=false;h.admins.data[1][5]='newer-binding';}return record;};
 const identity=c.identityLookup_('admin@gsps.edu.sg','earlier-binding');
 return {binding:h.admins.data[1][5],isAdmin:identity.isAdmin,locks:h.locks};
}
function queueInterleave(root){
 const h=make(root),c=h.ctx,key=c.LORD_SECONDARY.PREFIX+'expired-fixture';
 h.properties[key]=JSON.stringify({kind:'booking_email',payload:{},createdAt:h.now-c.LORD_SECONDARY.MAX_AGE_MS-1});
 const get=h.props.getProperties;let first=true,executed=0;
 h.props.getProperties=()=>{const snapshot=get();if(first){first=false;h.properties[key]=JSON.stringify({...JSON.parse(h.properties[key]),leaseToken:'current-owner',leaseUntil:h.now+60000});}return snapshot;};
 c.executeSecondaryTask_=()=>executed++;
 c.processSecondaryQueue_(10);
 return {preserved:Boolean(h.properties[key]),executed,locks:h.locks};
}
function collectionInterleave(root){
 const h=make(root),c=h.ctx,made=h.post(request()),folder=c.getSessionPhotoFolder_;
 c.getSessionPhotoFolder_=id=>{const result=folder(id);h.sheets.Bookings.data[1][13]=true;return result;};
 const out=h.post(request({action:'loan',clientRequestId:'loan-accessory-race',bookingId:made.result.bookingId,cartGroup:'Cart A',trolleys:[{name:'Trolley A',quantity:14,photoData:'data:image/jpeg;base64,AQID'}]}));
 return {accepted:out.ok,error:out.error||'',sessionRows:h.sheets[c.LORD_CONFIG.SHEETS.SESSIONS].data.length-1,bookingStatus:h.sheets.Bookings.data[1][1]};
}
function setupFixture(){
 const h=make(candidate);let next=100;const proto=h.Sheet.prototype,range=proto.getRange,max=proto.getMaxColumns;
 proto.getRange=function(...args){const result=range.apply(this,args);result.setFontWeight=()=>result;result.setNumberFormat=()=>result;return result;};
 proto.getMaxColumns=function(){return this.maxColumns||max.call(this)||26;};
 proto.insertColumnsAfter=function(_,count){this.maxColumns=this.getMaxColumns()+count;};
 proto.setFrozenRows=proto.autoResizeColumns=function(){};
 h.ss.insertSheet=name=>(h.sheets[name]=new h.Sheet(++next,name,[]));
 h.ref.insertSheet=name=>(h.refSheets[name]=new h.Sheet(++next,name,[]));
 h.ref.getSpreadsheetTimeZone=()=> 'Asia/Singapore';
 h.ctx.getPhotoRootFolder_=h.ctx.getReignArchiveFolder_=()=>({getName:()=> 'fixture-folder'});
 return h;
}
function workerFixture(app,handler){
 const cache=new Map(),calls=[];
 const ctx=vm.createContext({...base(),fetch:async(url,init)=>{calls.push({url:new URL(url),init});return handler(url,init);},caches:{default:{match:async req=>cache.get(req.url)?.clone(),put:async(req,res)=>cache.set(req.url,res.clone())}}});
 vm.runInContext(fs.readFileSync(path.join(candidate,'Source',app,'_worker.js'),'utf8').replace('export default {','globalThis.worker = {'),ctx);
 if(app!=='starlord')ctx.readSession=async()=>({sub:'fixture',email:'staff@gsps.edu.sg',ttbName:'Staff',isAdmin:true});
 return {ctx,calls,call:route=>ctx.worker.fetch(new Request('https://fixture.invalid'+route),{...workerEnv,ASSETS:{fetch:()=>response({asset:true})}})};
}
(async()=>{
 await check('Queued audit retry is idempotent',()=>{const before=auditRetry(baseline),after=auditRetry(candidate);assert.equal(before.eventRows,2);assert.equal(after.eventRows,1);assert.equal(after.pending,false);return {before,after};});
 await check('Administrator binding preserves newer value',()=>{const before=identityInterleave(baseline),after=identityInterleave(candidate);assert.equal(before.binding,'earlier-binding');assert.equal(after.binding,'newer-binding');assert.equal(after.isAdmin,false);assert.equal(after.locks,1);return {before,after};});
 await check('Queue pruning refreshes snapshot under lock',()=>{const before=queueInterleave(baseline),after=queueInterleave(candidate);assert.equal(before.preserved,false);assert.equal(after.preserved,true);assert.equal(after.executed,0);return {before,after};});
 await check('Collection rejects changed booking terms',()=>{const before=collectionInterleave(baseline),after=collectionInterleave(candidate);assert.equal(before.accepted,true);assert.equal(after.accepted,false);assert.match(after.error,/Booking changed/);assert.equal(after.sessionRows,0);assert.equal(after.bookingStatus,'BOOKED');return {before,after};});
 await check('Setup rejects mismatched table before any mutation',()=>{const h=setupFixture(),c=h.ctx;delete h.sheets[c.LORD_CONFIG.SHEETS.SESSIONS];h.sheets.Bookings.data[0][1]='Unexpected Status';assert.throws(()=>c.setupLORDV1Workbook(),/header mismatch/);assert.equal(h.writes.length,0);assert.equal(h.sheets[c.LORD_CONFIG.SHEETS.SESSIONS],undefined);return {writes:h.writes.length};});
 await check('Fresh schema creates empty tabs with adequate widths',()=>{const h=setupFixture(),c=h.ctx;h.sheets={};h.refSheets={};const result=c.createLORDV17Schema();assert.equal(result.ok,true);assert.equal(h.sheets.Bookings.getMaxColumns(),30);assert.equal(h.sheets[c.LORD_CONFIG.SHEETS.SESSIONS].getMaxColumns(),42);for(const sheet of Object.values(h.sheets))assert.equal(sheet.data.length,1);for(const key of ['teachers','classes','subjects'])assert.equal(h.refSheets[c.LORD_REFERENCE_CONFIG.SHEETS[key]].data.length,0);const firstWrites=h.writes.length;c.createLORDV17Schema();assert.equal(h.writes.length,firstWrites);return {transactionTabs:Object.keys(h.sheets).length,referenceTabs:Object.keys(h.refSheets).length,rerunAdditionalWrites:0};});
 for(const app of ['lord','overlord','starlord']){
  if(app!=='starlord')await check(app+' public identity guard uses effective normalized action',async()=>{
   const h=workerFixture(app,()=>response({ok:true}));
   for(const value of ['identityLookup',' IDENTITYLOOKUP ']){
    const params=new URLSearchParams();params.set('action',value);
    assert.equal((await h.call('/api/transaction?'+params)).status,403);
   }
   const repeated=new URLSearchParams();repeated.append('action','health');repeated.append('action','identityLookup');
   assert.equal((await h.call('/api/transaction?'+repeated)).status,403);
   assert.equal(h.calls.length,0);return {upstreamCalls:0};
  });
  await check(app+' read coalescing returns separately readable bodies',async()=>{const gate=deferred(),h=workerFixture(app,()=>gate.promise);const route=app==='starlord'?'/api/board?date=2026-10-17':'/api/reference';const pending=Array.from({length:6},()=>h.call(route));await new Promise(setImmediate);assert.equal(h.calls.length,1);gate.resolve(response(app==='starlord'?{ok:true,bookings:[]}:{ok:true,data:{teachers:['Fixture']}}));const bodies=await Promise.all((await Promise.all(pending)).map(r=>r.json()));assert.equal(bodies.length,6);return {simultaneousRequests:6,upstreamCalls:h.calls.length};});
  await check(app+' read coalescing forgets failed request',async()=>{const h=workerFixture(app,async()=>{throw Error('Fixture upstream failure');});const route=app==='starlord'?'/api/board?date=2026-10-17':'/api/reference';await h.call(route);await h.call(route);assert.equal(h.calls.length,2);return {attempts:h.calls.length};});
 }

 for (const tab of ['Bookings','Event Log','admins']) await check('Self-test rejects blank '+tab,()=>{
  const h=setupFixture(),c=h.ctx;h.sheets[tab].data=[];c.selfTestLORDV16=()=>({tests:[]});
  const out=c.selfTestLORDV17();assert(out.failed>0);assert(out.tests.some(x=>!x.ok&&x.error.includes('Missing header row')));
 });
 await check('Deferred STARLORD board rendering and animation remain unchanged',()=>{
  const {browser}=require('./frontend_harness.cjs');
  const before=fs.readFileSync(path.join(baseline,'Source/starlord/assets/app.js'),'utf8'),after=fs.readFileSync(path.join(candidate,'Source/starlord/assets/app.js'),'utf8');
  for(const name of ['renderBoard','fitBoard','rebuildStripScroll']){
   const extract=s=>{const start=s.indexOf('  function '+name+'(');assert(start>=0,name);const end=s.indexOf('\n  function ',start+1);return s.slice(start,end<0?s.length:end);};
   assert.equal(extract(after),extract(before));
  }
 });
 for(const app of ['lord','overlord','starlord'])await check(app+' rejected forced reload leaves a pending ordinary request intact',async()=>{
  const gate=deferred(),h=workerFixture(app,()=>gate.promise),route=app==='starlord'?'/api/board?date=2026-10-17':'/api/reference';
  const a=h.call(route);await new Promise(setImmediate);
  const b=await h.call(route+(route.includes('?')?'&':'?')+'forceRefresh=1');assert.equal(b.status,403);assert.equal(h.calls.length,1);
  gate.resolve(response(app==='starlord'?{ok:true,bookings:[]}:{ok:true,data:{teachers:['Fixture']}}));assert.equal((await (await a).json()).ok,true);
 });
 const report={passed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,sourceSha256:require('./source_fingerprints.cjs')(),results};
 fs.writeFileSync(path.join(__dirname,'v17_results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 process.exitCode=results.some(x=>!x.ok)?1:0;
})();
