const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const fixture=require('./contacts503-fixture');
function setup(){
 const f=fixture({source:fs.readFileSync('backend/Contacts_Code_with_Deploy_API.gs','utf8')}),contacts=f.sheets.get('contacts'),roles=f.sheets.get('roles');
 contacts.data[2][3]='smc';contacts.data[2][10]='SH';
 roles.data.push(roles.data[0].map(k=>k==='Role Shortform'?'SH':k==='SMC'?'1':''));
 contacts.data[3][5]='Noor Hamidah';contacts.data[3][13]='SRE';contacts.data[3][15]='N';contacts.data[3][6]='+65 9345 6789';
 return f;
}
const request=(overrides={})=>({requestId:crypto.randomUUID(),name:'Zarina Example',mobile:'9234 5678',...overrides});
const row=(f,id)=>f.sheets.get('contacts').data.find(r=>r[17]===id);
const create=(f,p,actor='smc@gsps.edu.sg')=>f.post('rosterContactCreate',p,actor);
function service(f,extra={},secret='s'.repeat(32)){
 const payload=JSON.stringify({action:'rosterServiceDirectory',service:'gsis-roster-notifier-v1',input:{},timestamp:Date.now(),nonce:crypto.randomUUID(),...extra});
 f.ctx.serviceSigned={postData:{contents:JSON.stringify({payload,signature:crypto.createHmac('sha256',secret).update(payload).digest('hex')})}};
 return JSON.parse(f.run('doPost(serviceSigned).text'));
}
// The directory service shares transport authentication but cannot impersonate a school user or write.
{
 const f=setup();f.props.delete('GSIS_SECRET');assert.equal(service(f).status,503);f.props.set('ROSTER_SERVICE_SECRET','s'.repeat(32));assert.equal(service(f).status,503,'legacy-only service setting is rejected');f.props.set('GSIS_SECRET','s'.repeat(32));
 f.sheets.get('contacts').data[4][3]='admin';const out=service(f);assert.equal(out.ok,true,JSON.stringify(out));assert.deepEqual(out.data.rosterAdminIds,['staff-3']);
 assert.deepEqual(out.data.user,{rosterSMC:false,rosterAdmin:false,rosterStaffId:null});assert.equal(out.data.timing.io.apiReads,1);assert.equal(f.stats.writes.length,0);
 assert.equal(service(f,{},'x'.repeat(32)).status,401);assert.equal(service(f,{identity:{email:'admin@gsps.edu.sg',subject:'fake'}}).status,403);
 assert.equal(service(f,{service:'wrong'}).status,403);assert.equal(service(f,{input:{role:'Admin'}}).status,403);assert.equal(service(f,{timestamp:Date.now()-61000}).status,401);
 assert.equal(service(f,{action:'rosterContactCreate',input:request(),identity:{email:'admin@gsps.edu.sg',subject:'fake'}}).status,403);
 f.sheets.get('admin_users').data[1][2]='N';assert.deepEqual(service(f).data.rosterAdminIds,[]);
 f.seedSnapshot([{id:'staff-1',field:'Basic Name',expected:'Person 1',value:'Changed name'}]);assert.equal(service(f).status,503);
}
// The internal directory is narrow and fresh, and authority still uses one batched read.
{
 const f=setup(),input={authorityOnly:true,rosterAuthority:true,rosterDirectory:true},out=f.post('deploySnapshot',input,'smc@gsps.edu.sg');
 assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.data.user.rosterSMC,true);assert.equal(out.data.user.rosterAdmin,false);assert.equal(out.data.user.rosterStaffId,'staff-1');
 assert.equal(out.data.timing.io.apiReads,1);assert.equal(f.stats.writes.length,0);
 assert.deepEqual(Object.keys(out.data.rosterPeople[0]).sort(),['active','adhocEligible','appointmentLevel','email','emails','employment','groups','id','mk','mobile','name','role']);
 const inactive=out.data.rosterPeople.find(p=>p.id==='staff-2');assert.equal(inactive.active,false);assert.equal(inactive.name,'Noor Hamidah (SRE)');assert.equal(inactive.mobile,'93456789');
 assert.equal(f.post('deploySnapshot',{authorityOnly:true},'person4@gsps.edu.sg').data.rosterPeople,undefined);
 assert.equal(f.post('deploySnapshot',{authorityOnly:true,rosterAuthority:true},'person4@gsps.edu.sg').data.rosterPeople,undefined);
 const worker=fs.readFileSync('contacts-update/public/_worker.js','utf8');assert.doesNotMatch(worker,/['"]\/api\/[^'"]+['"]\s*:\s*['"](?:deploySnapshot|rosterContactCreate)['"]/);
 f.sheets.get('contacts').data[2][10]='Teacher';assert.equal(f.post('deploySnapshot',input,'smc@gsps.edu.sg').data.user.rosterSMC,false);
 f.sheets.get('contacts').data[2][15]='N';assert.equal(f.post('deploySnapshot',input,'smc@gsps.edu.sg').data.user.rosterStaffId,null);
 assert.equal(f.post('deploySnapshot',input,'admin@gsps.edu.sg').data.user.rosterAdmin,true);
 f.sheets.get('admin_users').data[1][2]='N';assert.equal(f.post('deploySnapshot',input,'admin@gsps.edu.sg').data.user.rosterAdmin,false);
}
// The explicit SMC exception creates one inactive record and cannot mutate existing contacts.
{
 const f=setup(),before=JSON.stringify(f.sheets.get('contacts').data.slice(0,182)),p=request({mobile:'+65 9234-5678',employment:'FAJT'}),out=create(f,p);
 assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.data.saved,true);assert.equal(out.data.person.active,false);assert.equal(out.data.person.employment,'FAJT');assert.equal(out.data.person.mobile,'92345678');
 assert.deepEqual(Object.keys(out.data.person).sort(),['active','adhocEligible','appointmentLevel','email','emails','employment','groups','id','mk','mobile','name','role']);assert.equal(row(f,out.data.person.id)[15],'N');assert.equal(row(f,out.data.person.id)[13],'FAJT','Chosen modifier is saved provisionally in Contacts');
 assert.equal(JSON.stringify(f.sheets.get('contacts').data.slice(0,182)),before,'Existing contacts and availability are untouched');
 f.reset();const repeated=create(f,p);assert.equal(repeated.data.duplicate,true);assert.equal(f.stats.writes.length,0);assert.equal(f.sheets.get('contacts').data.filter(r=>r[17]===out.data.person.id).length,1);
 assert.equal(create(f,{...p,name:'Changed'}).status,409);
 assert.equal(create(f,request({Active:'Y'})).status,400);assert.equal(create(f,request({changes:[]})).status,400);
 assert.equal(f.post('saveData',{requestId:crypto.randomUUID(),changes:[{id:'staff-5',field:'Active',value:'N',expected:'Y'}]},'smc@gsps.edu.sg').status,403);
 f.sheets.get('contacts').data[2][10]='Teacher';assert.equal(create(f,request()).status,403,'SMC revocation takes effect immediately');
}
// Non-SMC KP and ordinary staff cannot create contacts; Admin can.
{
 const f=setup();for(const actor of ['kp@gsps.edu.sg','person4@gsps.edu.sg']){f.reset();assert.equal(create(f,request(),actor).status,403);assert.equal(f.stats.writes.length,0);}
 assert.equal(create(f,request(),'admin@gsps.edu.sg').data.saved,true);
}
// Normalized mobile matches block even after explicit distinct confirmation, including inactive records.
{
 const f=setup();for(const mobile of ['93456789','+65 9345 6789','0065-9345-6789','(65)93456789']){
  f.reset();const out=create(f,request({mobile,confirmDistinct:true}));assert.equal(out.ok,true);assert.equal(out.data.saved,false);assert.equal(out.data.blocked,true);assert.equal(out.data.requiresConfirmation,false);
  assert.equal(out.data.duplicates[0].id,'staff-2');assert.equal(out.data.duplicates[0].match,'mobile');assert.equal(out.data.duplicates[0].email,undefined);assert.equal(f.stats.writes.length,0);
 }
 assert.equal(create(f,request({mobile:'91234567890'})).status,400);
}
// Fuzzy names offer a choice without silent merging; blank mobile numbers never collide.
{
 const f=setup(),p=request({name:'Noor Hamida',mobile:'94567890'}),out=create(f,p);
 assert.equal(out.data.saved,false);assert.equal(out.data.blocked,false);assert.equal(out.data.requiresConfirmation,true);assert.equal(out.data.duplicates[0].id,'staff-2');
 const confirmed=create(f,{...p,requestId:crypto.randomUUID(),confirmDistinct:true});assert.equal(confirmed.data.saved,true);assert.notEqual(confirmed.data.person.id,'staff-2');
 assert.equal(create(f,request({name:'Safiya Example',mobile:'95678901'})).data.saved,true);
 assert.equal(row(f,'staff-2')[15],'N');
}
// The existing durable journal prevents duplicates after a lost response and supports Admin recovery.
{
 const f=setup(),p=request();f.setMode('lostAck');assert.equal(create(f,p).ok,false);
 assert.equal(f.post('saveReceipt',{requestId:p.requestId},'smc@gsps.edu.sg').data.saved,true);
 f.reset();assert.equal(create(f,p).data.duplicate,true);assert.equal(f.stats.writes.length,0);
}
{
 const f=setup(),p=request();f.setMode('partial');assert.equal(create(f,p).ok,false);
 const publicRead=f.post('deploySnapshot',{authorityOnly:true,rosterAuthority:true,rosterDirectory:true},'smc@gsps.edu.sg');assert.equal(publicRead.status,503);
 const recovery=f.post('recoveryStatus',{},'admin@gsps.edu.sg');assert.equal(recovery.data.pending[0].kind,'roster');assert.equal(recovery.data.pending[0].recoverable,true);
 const pending=recovery.data.pending[0];const repaired=f.post('recoverSave',{requestId:pending.requestId,digest:pending.digest},'admin@gsps.edu.sg');assert.equal(repaired.ok,true,JSON.stringify(repaired));
 assert.equal(row(f,'contact-'+p.requestId)[15],'N');assert.equal(row(f,'contact-'+p.requestId)[5],p.name);assert.equal(f.getHeld(),false);
 assert.equal(create(f,p).data.duplicate,true);
}
console.log('PASS Roster Contacts: fresh batched authority and narrow internal directory, inactive-only SMC creation, denied generic writes, normalized/fuzzy duplicates, idempotent receipts and Admin recovery.');
