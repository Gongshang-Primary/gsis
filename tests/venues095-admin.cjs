'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),D=require('../shared/venues.js');
const {fixture,ctx}=require('./venues-domain.cjs'),{host}=require('./venues-backend.cjs');
const admin={id:'admin',name:'Administrator'},other={id:'other',name:'Other'},command=x=>({requestId:crypto.randomUUID(),expectedRevision:0,...x});
{
 let s=fixture();assert.throws(()=>D.execute(s,{id:'owner',name:'Owner'},command({operation:'saveVenue',venue:{id:'room',capacity:31},revision:1}),ctx),/shared physical room register/);s.people.push({...other,active:true});s.grants.push({id:'elsewhere',kind:'owner',venueId:'elsewhere',staffId:'admin',active:true,from:'',to:'',revision:1});
 const x=command({operation:'saveRoomOwners',venueId:'room',revision:1,staffIds:['staff','other']});let out=D.execute(s,admin,x,ctx);assert.deepEqual(D.read(out.state,admin,{operation:'bootstrap'},ctx).venues[0].ownerIds.sort(),['other','staff']);assert(D.permissions(out.state,other,ctx.today).ownedVenueIds.includes('room'));assert.equal(D.permissions(out.state,other,ctx.today).admin,false);assert.deepEqual(out.state.grants.find(g=>g.id==='elsewhere'),s.grants.find(g=>g.id==='elsewhere'));
 assert.equal(D.execute(out.state,admin,x,ctx).state.grants.length,out.state.grants.length,'idempotent owner save');assert.throws(()=>D.execute(out.state,admin,command({...x,requestId:crypto.randomUUID()}),ctx),/changed/);
 assert.throws(()=>D.execute(s,{id:'staff',name:'Staff'},x,ctx),/administrator/);
 const remove=D.execute(out.state,admin,command({operation:'saveRoomOwners',venueId:'room',revision:2,staffIds:['other']}),ctx);assert.equal(D.permissions(remove.state,{id:'staff'},ctx.today).ownedVenueIds.includes('room'),false);assert.equal(remove.state.venues[0].approvalMode,s.venues[0].approvalMode);assert.equal(remove.state.audit.at(-1).kind,'saveRoomOwners');
}
function registered(){const h=host();const s=fixture();s.grants.find(g=>g.kind==='admin').staffId='staff';h.seed(s);h.sheets.set('Venues',{id:100,rows:[['Unit number','Venue name','Short name','Block','Level','Capacity','Capacity basis','Notes','Preserved'],['D1-06B','EAS Store','Store','D',1,20,'Original','Keep','unrelated'],['D1-06C','Pump Room','P&E','D',1,'','','','also keep']]});h.c.SpreadsheetApp={openById:()=>({getSheetByName:n=>{const sh=h.sheets.get(n);return sh&&{getSheetId:()=>sh.id,getDataRange:()=>({getValues:()=>structuredClone(sh.rows),getFormulas:()=>sh.rows.map(r=>r.map(()=>''))})};}})};h.c.venuesDigest_=s=>crypto.createHash('sha256').update(s).digest('hex');h.c.venuesSourceRequest_=()=>({registryWorkbookKey:h.c.venuesDigest_(JSON.stringify({spreadsheetId:'sheet'}))});vm.runInContext(fs.readFileSync('venues-backend/Register.gs','utf8'),h.c);return h;}
const edit=h=>command({operation:'saveRoomMetadata',registryRevision:h.c.venuesReadRegister_().revision,unitNumber:'D1-06C',fields:{name:'Pump room revised',notes:'Preparation\nUse care',capacity:8}}),send=(h,x)=>JSON.parse(h.c.doPost(h.signed(x)).text);
{
 const h=registered(),x=edit(h),before=h.commits,r=send(h,x);assert.equal(r.ok,true,r.error);assert.equal(h.commits-before,1,'physical row and receipt/audit in one batch');const requests=h.requests;assert(requests.some(r=>r.updateCells?.range.sheetId===100));assert(requests.some(r=>r.updateCells?.range.sheetId===h.c.VENUES_SHEET_IDS.AuditEvent));assert(requests.some(r=>r.updateCells?.range.sheetId===h.c.VENUES_SHEET_IDS.RequestReceipt));assert.deepEqual(h.sheets.get('Venues').rows[2],['D1-06C','Pump room revised','P&E','D',1,8,'','Preparation\nUse care','also keep']);assert.equal(h.sheets.get('Venues').rows[1][1],'EAS Store');assert.equal(h.c.venuesLoadState_().source.status,'stale');h.c.venuesSourceRequest_=()=>{throw Error('Deploy offline');};assert.equal(send(h,x).ok,true,'committed receipt recovers without requiring Deploy availability');h.c.venuesSourceRequest_=()=>({registryWorkbookKey:h.c.venuesDigest_(JSON.stringify({spreadsheetId:'sheet'}))});assert.equal(h.c.venuesLoadState_().audit.filter(a=>a.kind==='saveRoomMetadata').length,1);assert.equal(send(h,{...x,requestId:crypto.randomUUID()}).code,'REVISION_CONFLICT');assert.equal(JSON.stringify(r).includes('patterns'),false,'write response does not expose full internal source');
}
{
 const h=registered(),x=edit(h);h.failBefore();assert.equal(send(h,x).ok,false);assert.equal(h.sheets.get('Venues').rows[2][1],'Pump Room');assert.equal(h.c.venuesLoadState_().audit.length,0);assert.equal(send(h,x).ok,true);
}
{
 const h=registered(),x=edit(h);h.ambiguous();assert.equal(send(h,x).ok,true);assert.equal(send(h,x).ok,true);assert.equal(h.c.venuesLoadState_().audit.filter(a=>a.kind==='saveRoomMetadata').length,1,'unknown accepted response safely recovers receipt');
}
{
 const h=registered(),x=edit(h);h.c.venuesSourceRequest_=()=>({registryWorkbookKey:'different'});assert.equal(send(h,x).code,'REGISTER_SETUP_REQUIRED');assert.equal(h.sheets.get('Venues').rows[2][1],'Pump Room');
}
{
 const h=registered(),x=edit(h);h.c.venuesTransaction_(state=>{state.grants=[];return {state};});assert.equal(send(h,x).code,'FORBIDDEN');
}
{
 const h=registered(),x=edit(h);assert.equal(send(h,{...x,fields:{unitNumber:'D1-07'}}).code,'INVALID_REGISTER_EDIT');assert.equal(send(h,{...x,fields:{name:'=IMPORTXML("evil")'}}).code,'INVALID_REGISTER_EDIT');assert.equal(send(h,{...x,fields:{capacity:-1}}).code,'INVALID_CAPACITY');
 const before=h.c.venuesLoadState_().source.revision;assert.equal(send(h,{...x,fields:{name:'Pump Room'}}).ok,true);assert.equal(h.c.venuesLoadState_().source.revision,before,'no-op does not invalidate timetable');
}
console.log('PASS v095 Venues owner batch authorization/concurrency and shared register atomic persistence, workbook authority, retry recovery, no-op, surgical writes and immutable units.');
