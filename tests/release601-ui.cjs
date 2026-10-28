const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{JSDOM}=require(process.env.GSIS_TEST_JSDOM||'jsdom');
const dom=new JSDOM(fs.readFileSync('contacts-update/public/index.html','utf8'),{url:'https://contacts.example',runScripts:'outside-only'}),w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext()),el=id=>w.document.getElementById(id);
w.structuredClone=structuredClone;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
run(fs.readFileSync('contacts-update/public/core.js','utf8').replace(/export /g,''));run(fs.readFileSync('contacts-update/public/app.js','utf8').replace(/^import[^\n]+\n/,'').replace(/start\(\);\s*$/,''));
run(`state={user:{email:'admin@gsps.edu.sg',roles:['Admin']},people:[],groups:['SMC','TL'],access:[{email:'smc@gsps.edu.sg',name:'SMC User',roles:['KP'],active:'Y',version:'original'},{email:'admin@gsps.edu.sg',name:'Admin',roles:['Admin'],active:'Y',version:'admin'}]};var sent;api=async(action,input)=>{sent={action,input};return {email:input.email,roles:input.grantAdmin?['KP','Admin']:['Admin'],active:'Y',version:'saved'}};`);
(async()=>{try{
 run("openRole()");el('roleAlias').value='ADMIN';el('roleAlias').oninput();assert.equal(el('roleAdmin').checked,true);assert.equal(el('roleAdmin').disabled,true);el('roleAlias').value='smc';el('roleAlias').oninput();assert.equal(el('roleKP').checked,true);assert.equal(el('roleAdmin').checked,false);assert.equal(el('roleAdmin').disabled,false);
 run("openRole('smc@gsps.edu.sg')");assert.equal(el('roleKP').checked,true);assert.equal(el('roleAdmin').disabled,false);el('roleAdmin').checked=true;
 await el('roleForm').onsubmit({preventDefault(){}});const sent=JSON.parse(run('JSON.stringify(sent)'));assert.deepEqual(sent,{action:'kp',input:{email:'smc@gsps.edu.sg',enabled:true,grantAdmin:true,version:'original'}});assert.equal(el('roleDialog').open,false);
 run("openRole('admin@gsps.edu.sg')");assert.equal(el('roleAdmin').checked,true);assert.equal(el('roleAdmin').disabled,true);assert.match(el('roleAdminHint').textContent,/cannot be removed/);
 await el('roleForm').onsubmit({preventDefault(){}});assert.equal(run('sent.input.grantAdmin'),false);
 run("state.people=[{id:'sh',name:'Acting Head',active:'Y',role:'SH SL',appointmentStatus:'Acting',groups:['SMC'],emails:{gsps:'sh@gsps.edu.sg'}},{id:'st',name:'Acting Senior',active:'Y',role:'ST HAL',appointmentStatus:'Acting',groups:['TL'],emails:{gsps:'st@gsps.edu.sg'}}];filters=[{category:'groups',value:'SMC'}];renderContacts()");
 assert.match(el('contactRows').textContent,/Acting Head/);assert.doesNotMatch(el('contactRows').textContent,/Acting Senior/);
 run("filters=[{category:'groups',value:'TL'}];renderContacts()");assert.match(el('contactRows').textContent,/Acting Senior/);assert.doesNotMatch(el('contactRows').textContent,/Acting Head/);
 console.log('PASS 601 Contacts UI: explicit Admin grant preserving SMC, existing Admin removal disabled, acting membership filters');
}finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1});
