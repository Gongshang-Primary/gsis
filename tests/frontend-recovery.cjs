const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',innerHTML:'',open:false,append(){},querySelector(){return null},addEventListener(){},replaceChildren(){},parentElement:{insertBefore(){}},close(){}});return nodes.get(id)}
let pending,fetches=0;
const ctx=vm.createContext({console,crypto:require('node:crypto').webcrypto,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,document:{hidden:false,getElementById:node,querySelector:s=>node(s.replace('#','')),addEventListener(){}},window:{addEventListener(){}},fetch:()=>{fetches++;return new Promise(resolve=>pending=resolve)},alert(){},confirm:()=>true});
vm.runInContext(fs.readFileSync('public/app.js','utf8').replace(/controls\(\);startSignIn\(\);\s*$/,''),ctx);const run=s=>vm.runInContext(s,ctx);
(async()=>{
run('controls()');assert.equal(node('signout').hidden,true);assert.equal(node('viewFilters').hidden,true);assert.equal(node('signin').hidden,false);
run("token='a';state={versions:[{id:'old'}]};current='old'");const one=run('refresh()');await run('refresh()');assert.equal(fetches,1);
run("sessionEpoch++;token='';state={versions:[]};current=''");pending({ok:true,json:async()=>({ok:true,data:{user:{email:'old',roles:['Admin']},versions:[{id:'old'}]}})});await one;assert.equal(run('state.versions.length'),0);
run("token='b';state={versions:[{id:'kept'}]};current='kept'");const two=run('refresh()');pending({ok:false,status:503,json:async()=>({ok:false,error:'Temporary outage'})});await two;assert.equal(run('state.versions[0].id'),'kept');assert.match(node('connection').textContent,/Temporary outage/);
const before=fetches;await run('refresh()');assert.equal(fetches,before,'Background polls back off after an outage');const three=run('refresh(true)');pending({ok:false,status:401,json:async()=>({ok:false,error:'Expired'})});await three;assert.equal(run('token'),'');assert.equal(node('signin').hidden,false);assert.equal(node('signout').hidden,true);assert.equal(node('retrySignIn').hidden,false);assert.equal(run('state.versions[0].id'),'kept');
console.log('PASS signed-out controls, single-flight sync, late response rejection, retained data on outage, 401 recovery');
})().catch(e=>{console.error(e);process.exitCode=1});
