'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const fixture=require('./roster701-fixture.cjs');
const source=fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
async function setup({ordinary=false,inactiveOwn=false,realPeople=false}={}){
 const f=fixture(),dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};w.confirm=()=>true;w.structuredClone=structuredClone;
 const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[f.ctx.now]));}static now(){return f.ctx.now;}};
 if(ordinary)Object.assign(f.ctx.user,{smc:false,admin:false});
 if(inactiveOwn)f.people.find(p=>p.id==='alice').active=false;
 f.people.push({id:'ext',name:'External Known (SRE)',active:false,mobile:'95678901',employment:'SRE',adhocEligible:true});
 const calls=[];let failCreation=false,created=null;
 const ctx={profile:{user:clone(f.ctx.user)},initialDate:f.date,today:()=>f.date,container:w.document.querySelector('main'),status(){},api:async(route,p)=>{
  calls.push(clone(p));if(p.view==='intake')return {entries:[],total:0};
  if(p.operation==='contactCreate'){
   created??={id:'fresh',name:p.name+' ('+p.employment+')',active:false,employment:p.employment,mobile:p.mobile};
   if(failCreation){failCreation=false;throw Object.assign(Error('Save confirmation lost'),{status:503});}
   return {saved:true,person:clone(created),revision:f.state.revision};
  }
  if(p.operation==='saveAdhoc')throw Error('Inactive contact must not be activated');
  const view=f.O.view(f.state,f.ctx,p);if(!realPeople)view.people=clone(f.people);return clone(view);
 }};
 vm.runInContext(source.replace('return {pages,render,unmount,','return {__test:{notifyTeachers,person},pages,render,unmount,'),dom.getInternalVMContext());
 const q=selector=>w.document.querySelector(selector),input=(selector,value)=>{q(selector).value=value;q(selector).dispatchEvent(new w.Event('input',{bubbles:true}));};
 const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI did not settle');};
 return {f,w,dom,ctx,calls,q,input,wait,failNextCreation(){failCreation=true;},close(){w.RosterOpsUI.unmount();w.close();}};
}
(async()=>{
 {
  const h=await setup({realPeople:true});try{
   await h.w.RosterOpsUI.render('Manage Ad-hoc relief',h.ctx);h.q('[data-add-contact]').click();h.input('[name=name]','External Known');
   assert.equal(h.q('[name=mobile]').value,'','exact name matching does not depend on a mobile number');
   assert.match(h.q('[data-duplicate-matches]').textContent,/External Known \(SRE\) \(inactive\)/,'real read projection includes the historical display suffix');
   assert.equal(h.q('[data-create-contact]').disabled,true,'the inactive display suffix must not hide an exact TTb identity');
   assert.equal(h.q('[data-distinct-label]').hidden,true,'an exact identity cannot be confirmed as a different person');
   assert.equal(h.q('[data-reuse-contact=ext]'),null,'an inactive duplicate waits for activation in Contacts');
   assert.equal(h.f.people.find(p=>p.id==='ext').name,'External Known (SRE)','matching never changes the stored Contacts name');
  }finally{h.close();}
 }
 {
  const h=await setup({ordinary:true,inactiveOwn:true});try{
   await h.w.RosterOpsUI.render('Report Absence',h.ctx);
   assert.equal(h.q('[data-absence-form]'),null,'inactive own identity is not eligible through a stale report payload');
   assert.match(h.q('main').textContent,/not included in Report Absence/);
  }finally{h.close();}
 }
 {
  const h=await setup();try{
   h.f.state.adhoc.push({id:'old-engagement',staffId:'ext',date:h.f.date,periods:[2],employment:'SRE'});
   await h.w.RosterOpsUI.render('Manage Ad-hoc relief',h.ctx);
   assert.match(h.q('.ops-record-table').textContent,/External Known \(SRE\) \(inactive\)/,'retained engagement history keeps its identity and inactive label');
   assert.equal(h.q('[data-edit-adhoc=old-engagement]').disabled,true,'inactive retained engagement cannot be selected for editing');
   h.q('[data-teacher-toggle]').click();
   assert(!h.q('[role=listbox]').textContent.includes('External Known'),'inactive contacts are absent from the ad hoc picker');
   assert(h.q('[role=listbox]').textContent.includes('Bob'),'active contacts remain selectable');
   h.q('[data-add-contact]').click();h.input('[name=name]','External Known');h.input('[name=mobile]','95678901');
   assert.equal(h.q('[data-reuse-contact=ext]'),null,'duplicate recognition cannot bypass Contacts inactivity');
   assert.match(h.q('[data-duplicate-matches]').textContent,/activate.*Contacts/i);
   assert.equal(h.q('[data-create-contact]').disabled,true,'the existing identity cannot be duplicated');
   assert.equal(h.q('[data-duplicate-matches] a').href,'https://contacts.gsps.edu.sg/','activation opens the existing Contacts app');
   h.q('[data-close-dialog]').click();h.f.people.find(p=>p.id==='ext').active=true;h.w.RosterOpsUI.resetPreloads();
   await h.w.RosterOpsUI.render('Manage Ad-hoc relief',h.ctx);h.q('[data-teacher-toggle]').click();
   assert(h.q('[role=listbox]').textContent.includes('External Known'),'reactivation restores the existing contact to choices');
  }finally{h.close();}
 }
 {
  const h=await setup();try{
   await h.w.RosterOpsUI.render('Manage Ad-hoc relief',h.ctx);h.q('[data-add-contact]').click();h.input('[name=name]','Fresh Teacher');h.input('[name=mobile]','98765432');h.failNextCreation();
   h.q('dialog form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));await h.wait(()=>h.q('[data-create-contact]')?.textContent==='Retry the same request');
   h.q('dialog form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));await h.wait(()=>!h.q('dialog'));
   const calls=h.calls.filter(p=>p.operation==='contactCreate');assert.equal(calls.length,2);assert.equal(calls[0].requestId,calls[1].requestId,'uncertain creation retains its request identity');
   assert(!h.calls.some(p=>p.operation==='saveAdhoc'),'new inactive contacts wait for Contacts activation');
   assert.match(h.q('main').textContent,/activate.*Contacts/i);
  }finally{h.close();}
 }
 {
  const h=await setup();try{
   const helpers=h.w.RosterOpsUI.__test;
   const people=[{id:'active',active:true,name:'Active'},{id:'inactive',active:false,name:'Inactive'}],teachers=people.map(p=>({staffId:p.id,changed:true}));
   assert.deepEqual(Array.from(helpers.notifyTeachers({people,teachers}),p=>p.staffId),['active'],'stale notification payloads do not expose inactive recipients');
   assert.equal(helpers.person({data:{people}},'inactive').name,'Inactive (inactive)','historical identity keeps an explicit inactive label');
   assert.equal(helpers.person({data:{people:[{id:'inactive',active:false,name:'Inactive (inactive)'}]}},'inactive').name,'Inactive (inactive)','label is not duplicated');
  }finally{h.close();}
 }
 {
  const h=await setup();try{
   const settings=fs.readFileSync('roster-update/public/roster-settings-ui.js','utf8');
   h.w.GSISRosterAllocation=require('../shared/roster-allocation.js');
   vm.runInContext(settings.replace('return {render:async(page,ctx)=>','return {__test:{drawNameBridges,drawReportSettings},render:async(page,ctx)=>'),h.dom.getInternalVMContext());
   const root=h.q('main'),people=[{id:'active',name:'Active Teacher',active:true,emails:['active@test.example']},{id:'inactive',name:'Former Teacher',active:false,emails:['former@test.example']}];
   const s={root,ctx:h.ctx,date:h.f.date,draft:{subject:'Daily Updates',time:'08:00',recipients:[{staffId:'inactive',emails:['former@test.example']}]},data:{canEdit:true,people,nameBridges:{people,timetableNames:['Former TT'],links:[{timetableName:'Former TT',staffId:'inactive',name:'Former Teacher'}]}}};
   h.w.RosterSettingsUI.__test.drawNameBridges(s,root);
   assert.equal(h.q('select[name=staffId] option[value=inactive]'),null,'inactive Contacts cannot be selected for a name bridge');
   assert(h.q('select[name=staffId] option[value=active]'));
   assert.match(h.q('.ops-record-table').textContent,/Former Teacher/,'saved name bridge history remains visible');
   root.innerHTML='<section data-settings-body></section>';
   h.w.RosterSettingsUI.__test.drawReportSettings(s,h.q('[data-settings-body]'));
   assert.equal(h.q('[data-recipient=inactive]'),null,'inactive staff do not appear in editable daily report recipients');
   assert(h.q('[data-recipient=active]'));
   assert(h.q('[data-remove-inactive-recipient=inactive]'),'retained ineligible recipient has an explicit removal control');
   h.q('[data-remove-inactive-recipient=inactive]').click();
   assert.equal(s.draft.recipients.length,0);assert.equal(h.q('[data-recipient=inactive]'),null,'removed inactive recipient cannot be re-added');
   s.draft.recipients=[{staffId:'inactive',emails:['former@test.example']}];
   s.data.canEdit=false;s.data.recipientPeople=[people[1]];
   h.w.RosterSettingsUI.__test.drawReportSettings(s,h.q('[data-settings-body]'));
   assert.equal(h.q('[data-recipient=inactive]').disabled,true,'read-only former recipient history is retained');
  }finally{h.close();}
 }
 console.log('PASS inactive Roster UI: stale self-report denied, active-only ad hoc choices, retained duplicate identity, same-request creation recovery, no inactive activation, notification filtering and history labels.');
})().catch(error=>{console.error(error);process.exitCode=1;});
