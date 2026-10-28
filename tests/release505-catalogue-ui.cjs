const assert=require('assert/strict'),make=require('./dom-helper.cjs');
const hash='a'.repeat(64),other='b'.repeat(64),copy=x=>JSON.parse(JSON.stringify(x));
function setup(){const u=make();u.w.AbortController=AbortController;u.run("tab='Load Settings';var catalogueTestBase=clone(v());");const base=copy(u.run('catalogueTestBase'));function full(extra={}){return {user:{email:'first@gsps.edu.sg',roles:['Admin','KP']},versions:[{id:'v1',name:'Test',status:'active',revision:1}],revision:1,active:'v1',currentId:'v1',current:copy(base),cacheKey:'catalogue-test',leases:[],catalogueHash:hash,catalogueUnchanged:false,sysFields:{Role:['Teacher'],Active:['Y','N']},roleCatalogue:[{role:'Teacher',level:'',groups:[]}],staffCatalog:[{id:'t',name:'Live teacher',active:true,role:'Teacher',profile:{'Basic Name':'Live teacher',Role:'Teacher',Active:'Y'},groups:[]}],...extra};}function accept(data){u.w.catalogueTestResponse=data;return u.run('acceptSnapshot(catalogueTestResponse)');}accept(full());return {...u,full,accept};}
function omitted(u,extra={}){const data=u.full({catalogueUnchanged:true,revision:2,...extra});delete data.sysFields;delete data.roleCatalogue;delete data.staffCatalog;return data;}
(async()=>{
 {
  const u=setup();try{
   const requests=[];u.w.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,status:200,json:async()=>({ok:true,data:{saved:true}})}};
   for(const action of ['sync','bootstrap','delta','change','receipt','relief','access'])await u.run(`api('${action}',{},false)`);
   for(const r of requests)assert.equal(Object.hasOwn(r.body,'knownCatalogueHash'),['/api/sync','/api/bootstrap'].includes(r.url));assert.equal(requests[0].body.knownCatalogueHash,hash);assert.equal(requests[1].body.knownCatalogueHash,hash);
   const before=u.run('({fields:contactSysFields,staff:staffCatalog,roles:roleCatalogue})');u.accept(omitted(u));assert.equal(u.run('contactSysFields'),before.fields);assert.equal(u.run('staffCatalog'),before.staff);assert.equal(u.run('roleCatalogue'),before.roles);assert.equal(u.run('contactCatalogueHash'),hash);assert.equal(u.run("staffCatalog.get('t').name"),'Live teacher');assert.match(u.w.document.getElementById('user').textContent,/first/);
   u.accept(omitted(u,{current:null,unchanged:true,revision:3}));assert.equal(u.run('v().id'),'v1','unchanged document and omitted catalogue remain independent');
  }finally{u.w.close();}
 }
 for(const mutate of [data=>{data.catalogueHash=other},data=>{delete data.catalogueHash},data=>{data.catalogueUnchanged='yes'},data=>{data.staffCatalog={broken:true}},data=>{data.sysFields={Role:['Wrong partial']}}]){
  const u=setup();try{const data=omitted(u);mutate(data);const before=u.run('({fields:contactSysFields,staff:staffCatalog,roles:roleCatalogue,doc:v()})');assert.throws(()=>u.accept(data),/catalogue/i);assert.equal(u.run('contactCatalogueHash'),'','malformed omission clears cursor for a full retry');for(const [name,key]of [['contactSysFields','fields'],['staffCatalog','staff'],['roleCatalogue','roles'],['v()','doc']])assert.equal(u.run(name),before[key],'invalid response cannot partially replace retained data');
   u.w.fetch=async(url,options)=>{assert.equal(JSON.parse(options.body).knownCatalogueHash,'');return {ok:true,status:200,json:async()=>({ok:true,data:u.full({revision:4})})}};await u.run('refresh(true)');assert.equal(u.run('contactCatalogueHash'),hash);assert.equal(u.w.document.getElementById('status').textContent,'Loaded');
  }finally{u.w.close();}
 }
 {
  const u=setup();try{assert.throws(()=>u.accept(u.full({catalogueHash:'invalid'})),/catalogue/);assert.equal(u.run('contactCatalogueHash'),'');}finally{u.w.close();}
 }
 {
  const u=setup();try{
   u.run("pendingProjection={private:true};startSignIn=async()=>{};");u.w.fetch=async()=>({ok:true,status:200,json:async()=>({ok:true})});await u.w.document.getElementById('signout').onclick();
   assert.equal(u.run('contactCatalogueHash'),'');assert.equal(u.run('staffCatalog.size'),0);assert.equal(u.run('roleCatalogue.length'),0);assert.equal(u.run('contactSysFields'),null);assert.equal(u.run('pendingProjection'),null);assert.equal(u.w.document.getElementById('content').textContent,'');
  }finally{u.w.close();}
 }
 {
  const u=setup();try{
   const calls=[];u.w.fetch=async(url,options)=>{calls.push(url);if(url==='/api/config')return {ok:true,status:200,json:async()=>({configured:true,clientId:'fixture'})};if(url==='/api/session')return {ok:true,status:200,json:async()=>({ok:true,data:{user:{email:'second@gsps.edu.sg'}}})};assert.equal(url,'/api/sync');assert.equal(JSON.parse(options.body).knownCatalogueHash,'');throw Error('New account load failed')};
   await u.run('startSignIn()');assert.ok(calls.includes('/api/sync'));assert.equal(u.run('lastEmail'),'second@gsps.edu.sg');assert.equal(u.run('contactCatalogueHash'),'');assert.equal(u.run('staffCatalog.size'),0);assert.equal(u.run('roleCatalogue.length'),0);assert.equal(u.run('contactSysFields'),null);assert.equal(u.run('state.versions.length'),0);assert.equal(u.run('current'),'');assert.equal(u.run('role'),'');assert.doesNotMatch(u.w.document.getElementById('content').textContent,/Test|Live teacher/);
  }finally{u.w.close();}
 }
 {
  const u=setup();try{
   u.run("queueCell({operation:'setLoad',level:'1',subject:'EL',value:14,expected:15});");const before=u.run('({base:draftBase,doc:v(),staff:staffCatalog,queue:cellQueue})');assert.throws(()=>u.run("beginDeploySession('second@gsps.edu.sg')"),/same account/);assert.equal(u.run('lastEmail'),'first@gsps.edu.sg');assert.equal(u.run('draftBase'),before.base);assert.equal(u.run('cellQueue'),before.queue);
   u.run("beginDeploySession('first@gsps.edu.sg')");assert.equal(u.run('contactCatalogueHash'),'');assert.equal(u.run('draftBase'),before.base);assert.equal(u.run('v()'),before.doc);assert.equal(u.run('staffCatalog'),before.staff);assert.equal(u.run('cellQueue.length'),1,'same-account reauthentication preserves unresolved work');
  }finally{u.w.close();}
 }
 console.log('PASS 505 catalogue UI: read-only cursor scope, validated omission merge, atomic malformed rejection and full-refresh recovery, logout/new-account reset, failed identity-change load isolation and same-account draft preservation');
})().catch(e=>{console.error(e);process.exitCode=1});
