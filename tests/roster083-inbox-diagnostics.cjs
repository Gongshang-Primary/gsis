const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),test=require('node:test'),I=require('../shared/roster-inbox.js'),O=require('../shared/roster-operations.js');
const source=fs.readFileSync(__dirname+'/../backend/RosterInbox.gs','utf8'),now=Date.parse('2026-10-19T08:00:00+08:00'),waId='6591234567';
function setup(){
 let durable=JSON.stringify(I.initial());
 const contacts={user:{rosterAdmin:true,rosterStaffId:'admin'},rosterPeople:[{id:'admin',name:'Admin',active:true,mobile:'90000001'},{id:'duty',name:'Duty',active:true,mobile:'90000002'}],rosterSMCIds:['duty'],rosterAdminIds:['admin']};
 function dispatch(input,service){
  let held=false;const ClockDate=class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  const scope=vm.createContext({Date:ClockDate,GSISRosterInbox:I,GSISRosterOperations:O,ROSTER_DATA:'folder',props_:()=>({getProperty:()=> 'inbox-file'}),rosterReadFile_:()=>durable,rosterDriveRequest_:(_url,options)=>{assert(held);durable=options.payload;},LockService:{getScriptLock:()=>({})},deployLock_:()=>{assert(!held);held=true;return true;},deployUnlock_:()=>{assert(held);held=false;},error_:(status,message)=>{throw Object.assign(Error(message),{status});},Utilities:{getUuid:crypto.randomUUID},rosterOperationsAuthority_:()=>({staffId:'admin',email:'admin@example.test',admin:true,smc:false}),rosterOperationsDigest_:p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex'),rosterOperationsState_:()=>({...O.initial(),smcDutyRoster:[{date:'2026-10-19',staffIds:['duty']}]}),rosterServiceContacts_:()=>({c:contacts})});
  require('./load-backend-role.cjs')(scope,'roster');vm.runInContext(source,scope);return service?scope.rosterInboxServiceDispatch_({input}):scope.rosterInboxDispatch_({identity:{email:'admin@example.test'},input},contacts);
 }
 const service=p=>dispatch(p,true),call=p=>dispatch(p,false),state=()=>JSON.parse(durable),ingested=service({operation:'inboxIngest',message:{id:'wamid.in',from:waId,timestamp:now/1000,type:'text',text:'Hello'}});
 function reply(){const saved=call({operation:'inboxReply',waId,kind:'text',text:'Reply',requestId:crypto.randomUUID(),expectedRevision:state().threads[0].revision});service({operation:'inboxReplyPrepare',...saved.dispatch});return saved;}
 return {service,call,state,reply,alert:ingested.alerts[0]};
}
const safe={message:'Meta did not confirm this message.',metaErrorCode:132018,metaErrorSubcode:2494073,fbtraceId:'Trace_safe-123',details:'A template parameter has an invalid format.',templateName:'gsis_timetable_updated_v1',fields:[{field:'change_details',index:3,characters:187}]};
const expected={...safe,metaErrorCode:'132018',metaErrorSubcode:'2494073'};

for(const route of ['replyResult','delivery','alertResult'])test(route+' preserves safe diagnostics through committed metadata and a fresh backend read',()=>{
 const h=setup();let id;
 if(route==='alertResult'){h.service({operation:'inboxAlertPrepare',...h.alert});h.service({operation:'inboxAlertResult',...h.alert,state:'failed',error:safe});assert.deepEqual(h.state().alerts[0].error,expected);return;}
 const r=h.reply();id=r.message.id;
 if(route==='replyResult')h.service({operation:'inboxReplyResult',...r.dispatch,state:'failed',error:safe});
 else {h.service({operation:'inboxReplyResult',...r.dispatch,state:'sent',messageId:'wamid.out'});h.service({operation:'inboxDelivery',replyId:id,messageId:'wamid.out',eventId:'failed-event',recipientId:waId,state:'failed',timestamp:now,error:safe});}
 assert.deepEqual(h.state().messages.find(m=>m.id===id).error,expected);
 assert.deepEqual(h.call({operation:'inboxThread',waId}).messages.find(m=>m.id===id).error,expected);
});

test('Inbox diagnostics drop unknown text and retain bounded structural metadata only',()=>{
 const h=setup(),r=h.reply(),error={...safe,details:'https://roster.example.test/external.html#private-secret raw message secret-token',templateName:'https://private.example.test/secret',fields:[{field:'private text',index:0,characters:-1,text:'secret-token'},...Array.from({length:40},(_,i)=>({field:'parameter_'+i,index:i+1,characters:50,text:'raw private message'}))],accessToken:'secret-token'};
 h.service({operation:'inboxReplyResult',...r.dispatch,state:'failed',error});const saved=h.state().messages.find(m=>m.id===r.message.id).error;
 assert.equal(saved.details,'Provider details withheld; use the Meta trace ID for investigation.');assert.equal(saved.templateName,undefined);assert.equal(saved.accessToken,undefined);assert(saved.fields.length<=32);assert(saved.fields.every(f=>Object.keys(f).sort().join(',')==='characters,field,index'));assert(!JSON.stringify(saved).includes('secret-token'));assert(!JSON.stringify(saved).includes('raw private message'));
});

test('legacy Inbox errors keep their existing schema without fabricated diagnostics',()=>{
 const h=setup(),r=h.reply();h.service({operation:'inboxReplyResult',...r.dispatch,state:'uncertain',error:{message:'Timed out',metaErrorCode:131000}});
 assert.deepEqual(h.state().messages.find(m=>m.id===r.message.id).error,{message:'Timed out',metaErrorCode:'131000',metaErrorSubcode:'',fbtraceId:''});
});
