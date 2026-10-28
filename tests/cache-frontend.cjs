const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',innerHTML:'',open:false,append(){},addEventListener(){},replaceChildren(){},close(){this.open=false;this.onclose?.()}});return nodes.get(id)}
const context={console,crypto:require('crypto').webcrypto,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,document:{hidden:false,getElementById:node,querySelector:s=>node(s.replace('#','')),addEventListener(){}},window:{addEventListener(){}},alert(){},confirm:()=>true};
vm.createContext(context);vm.runInContext(fs.readFileSync('public/app.js','utf8').replace(/controls\(\);startSignIn\(\);\s*$/,''),context);const run=s=>vm.runInContext(s,context);
run(`var renders=0;render=()=>{renders++};token='test';current='v1';
var doc={id:'v1',name:'One',status:'active',loads:{'1':{EL:15}},layout:[],audit:[],assignments:[]};
var snapshot=(d,key='key1')=>({user:{email:'a@gsps.edu.sg',roles:['Admin','KP']},versions:[{id:'v1',name:d.name,status:'active',revision:key==='key1'?1:2}],current:d,currentId:'v1',cacheKey:key,leases:[]});
acceptSnapshot(snapshot(doc));var calls=[];`);
(async()=>{
run(`api=async(a,p)=>{calls.push(a);return {saved:true,snapshot:snapshot({...doc,name:'Saved'},'key2')}};editing={versionId:'v1',key:'meta',token:'existing'};unsavedDraft=true;`);
await run("change('metadata',{name:'Saved'})");assert.equal(run('calls.join()'),'change');assert.equal(run('v().name'),'Saved');assert.equal(run('editing'),null);assert.equal(run('unsavedDraft'),false);
const count=run('renders');run(`acceptSnapshot({...snapshot(doc,'key2'),versions:[{id:'v1',name:'Saved',status:'active',revision:2}],current:null,unchanged:true})`);assert.equal(run('v().name'),'Saved');assert.equal(run('renders'),count);
// Changed permissions deliver a replacement instead of retaining privileged data.
run(`acceptSnapshot({...snapshot({...doc,name:'Saved',audit:undefined},'key3'),user:{email:'a@gsps.edu.sg',roles:['KP']}})`);assert.equal(run('v().audit'),undefined);
// An old read begun before a save cannot replace the new confirmed document.
run(`var resolvePoll;api=(a,p)=>{calls.push(a);if(a==='sync')return new Promise(r=>resolvePoll=r);return Promise.resolve({saved:true,snapshot:snapshot({...doc,name:'Newest'},'key4')})}`);
const polling=run('refresh(true)');run(`editing={versionId:'v1',key:'meta',token:'existing'};viewEpoch++`);await run("change('metadata',{name:'Newest'})");run(`resolvePoll(snapshot(doc))`);await polling;assert.equal(run('v().name'),'Newest');
run(`api=async()=>{throw Error('Network offline')};editing={versionId:'v1',key:'meta',token:'existing'};unsavedDraft=true;`);
await assert.rejects(run("change('metadata',{name:'Unsaved'})"),/Network offline/);assert.equal(run('v().name'),'Newest');assert.equal(run('unsavedDraft'),true);assert.match(node('status').textContent,/not confirmed/);
// Stale metadata must never receive a fresh hash and overwrite a newer class name.
run(`editing=null;unsavedDraft=false;snapshotCache={id:'v1',key:'key4',revision:4};calls=[];var assertRevisionForTest;api=async(a,p)=>{calls.push(p.release?'release':a);assertRevisionForTest=p.expectedRevision;throw Error('Version changed')}`);
await run("acquire('meta')");assert.equal(run('calls.length'),0,'Opening a metadata form is local');await assert.rejects(run("change('metadata',{name:'Stale'})"),/Version changed/);assert.equal(run('calls.join()'),'change');assert.equal(run('assertRevisionForTest'),4);run('forgetLease()');
// A manual refresh remains available when upgraded frontend receives legacy receipts.
run(`var legacyRefresh=0;refresh=async()=>legacyRefresh++;api=async()=>({saved:true});editing={versionId:'v1',key:'meta',token:'existing'};`);await run("change('metadata',{name:'Legacy'})");assert.equal(run('legacyRefresh'),1);
run('forgetLease()');console.log('PASS single-request confirmed save, memory snapshot reuse, permission replacement, delayed poll rejection, failed draft retained, stale metadata guard, old-backend fallback');
})().catch(e=>{console.error(e);run('forgetLease()');process.exitCode=1});
