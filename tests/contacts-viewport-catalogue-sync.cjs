'use strict';
// contacts-viewport-catalogue-sync: after a Deploy catalogue sync, the Contacts
// viewport shows the new catalogues on a normal Refresh, without a manual reload
// of the individual tables. The data grid and aux tables are invalidated by
// catalogue revision, not by a cache clear.
const assert=require('assert/strict'),fs=require('fs'),{JSDOM}=require('jsdom');
const FIELDS=['TTb Name','Basic Name','Statutory Name','iCON Alias (@moe.edu.sg)','CES Alias (@schools.gov.sg)','GSPS Alias (@gsps.edu.sg)','Mobile No','EXT','Day of Birth','Month of birth','Role','EO Appt Level','Appointment Status','Employment Modifier','Subject Modifier','Active','MK Modifier'];
const person={id:'s1',name:'Test',statutoryName:'Test Legal',emails:{gsps:'a@gsps.edu.sg',icon:'',ces:''},mobile:'',ext:'',role:'HOD',formTeacher:'',dayOfBirth:'1',monthOfBirth:'1',groups:[],employment:'4/5',mk:'',active:'Y'};
const listsFor=subjects=>({'Subject Modifier':subjects,'Role':['HOD'],'EO Appt Level':['HOD'],'Employment Modifier':['4/5'],'MK Modifier':[''],'Day of Birth':['1'],'Month of birth':['1'],'Active':['Y','N']});
function dataFor(revision,subjects){
 const values=['Test','Test','Test Legal','','','a@gsps.edu.sg','','','1','1','HOD','HOD','','4/5',subjects[0],'Y',''];
 return {fields:FIELDS,editable:true,catalogueRevision:revision,roleRules:[{role:'HOD',level:'HOD',requiredSubject:''}],lists:listsFor(subjects),rows:[{id:'s1',values,computed:FIELDS.map(()=>false)}],viewState:{}};
}
function stateFor(revision){
 return {user:{email:'a@gsps.edu.sg',roles:['Admin']},people:[{...person}],groups:[],access:[{email:'a@gsps.edu.sg',name:'Test',roles:['Admin'],active:'Y'}],catalogueRevision:revision,fetchedAt:new Date().toISOString(),signatureSettings:{subjects:[],revision:0},deploymentAvailable:false,viewState:{}};
}
(async()=>{
 const html=fs.readFileSync('contacts-update/public/index.html','utf8');
 const dom=new JSDOM(html,{url:'https://contacts.example',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 w.structuredClone=v=>JSON.parse(JSON.stringify(v));
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 const calls=[];
 let revision='rev1';
 w.GSISfetch=async url=>{
  calls.push(url);
  // start() reads /api/config as the config itself; api() reads {ok,data} for the rest.
  if(url.endsWith('/api/config'))return {ok:true,json:async()=>({configured:true,clientId:'test',version:'0.9.9'})};
  const payload=url.endsWith('/api/session')?{ok:true}:url.endsWith('/api/bootstrap')?stateFor(revision):url.endsWith('/api/deployment')?{available:false,error:'Teaching information is unavailable'}:url.endsWith('/api/data')?dataFor(revision,revision==='rev1'?['MTL']:['MTL','Art']):{ok:true};
  return {ok:true,json:async()=>({ok:true,data:payload})};
 };
 let app=fs.readFileSync('contacts-update/public/app.js','utf8');
 app=app.replace(/^import \{[^}]*\} from '\.\/core\.js';/m,'');
 const stubs='const filterPeople=p=>p,emailList=()=>[],whatsapp=()=>"",tokens=()=>[],excelWorkbook=()=>({}),staffRank=()=>0,compareStaff=()=>0;';
 w.eval(stubs+app);
 const until=async(cond,label)=>{for(let i=0;i<100;i++){if(cond())return;await new Promise(r=>setTimeout(r,10));}throw Error('timeout waiting for '+label);};
 const q=s=>w.document.querySelector(s);
 await until(()=>!q('#app').classList.contains('hidden'),'sign-in');
 await until(()=>q('#identity').textContent==='a','identity');
 // Open the data page and load the v1 catalogues.
 q('[data-page="data"]').click();
 await until(()=>q('#dataStatus').textContent.startsWith('Ready'),'data v1 load');
 const dataCalls=()=>calls.filter(u=>u.endsWith('/api/data')).length;
 assert.equal(dataCalls(),1,'one data load for v1');
 const subjectOptions=()=>[...q('#dataGrid').querySelectorAll('select')].flatMap(s=>[...s.options].map(o=>o.value));
 assert.ok(subjectOptions().includes('MTL'),'v1 choices shown');
 assert.equal(subjectOptions().includes('Art'),false,'v2 choice not shown yet');
 // A plain revisit without a catalogue change must not refetch.
 q('[data-page="data"]').click();
 await new Promise(r=>setTimeout(r,50));
 assert.equal(dataCalls(),1,'unchanged catalogues are not refetched');
 // The Deploy sync lands (new revision). A normal Refresh must show the new choices.
 revision='rev2';
 q('#refresh').click();
 await until(()=>subjectOptions().includes('Art'),'data v2 load after Refresh');
 assert.equal(dataCalls(),2,'Refresh refetches the directory on a catalogue revision change');
 assert.ok(subjectOptions().includes('MTL'),'v1 choice retained');
 // A further Refresh with no change refetches nothing.
 q('#refresh').click();
 await new Promise(r=>setTimeout(r,100));
 assert.equal(dataCalls(),2,'unchanged catalogues are not refetched on Refresh');
 dom.window.close();
 console.log('PASS Contacts viewport shows the new catalogues after a sync on Refresh, without a manual table reload');
})().catch(e=>{console.error(e);process.exitCode=1;});
