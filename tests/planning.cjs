const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const ctx={console,Utilities:{getUuid:crypto.randomUUID,computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()],DigestAlgorithm:{SHA_256:'sha256'}}};vm.createContext(ctx);for(const f of ['Code.gs','Seed.gs'])vm.runInContext(fs.readFileSync(__dirname+'/../backend/'+f,'utf8'),ctx);
vm.runInContext(`
const kpUser={user:{roles:['KP']}},administrator={user:{roles:['Admin']}},idx={active:'v1',revision:0};
function check(x,m){if(!x)throw Error(m)}function rejects(fn,status){try{fn()}catch(e){check(e.status===status,e.message);return}throw Error('Expected rejection')}
const d=model_(JSON.parse(JSON.stringify(DEPLOY_SEED)));d.id='v1';d.teachers=[{id:'one',name:'One',active:true},{id:'two',name:'Two',active:true}];d.assignments=[];
apply_(d,{operation:'addTG',key:'meta',name:'P1 LSP A',subject:'LSP',level:'1',form:'P1',venue:'',sources:[]},kpUser,idx);
const group=d.groups.at(-1);check(!group.venue&&group.form==='P1','level-wide unassigned group');
const p={operation:'addTeacher',key:'cell:'+group.id+':LSP',target:group.id,subject:'LSP',teacher:'one'};apply_(d,p,kpUser,idx);apply_(d,{...p,teacher:'two'},kpUser,idx);
check(d.assignments.every(a=>a.venue===''),'no guessed venue');check(activeExport_(d,idx).workloads.every(w=>w.total===5),'both co-teachers receive full load');
rejects(()=>apply_(d,{...p,subject:'FT',key:'cell:'+group.id+':FT'},kpUser,idx),400);
auth_(administrator,'KP'); // Q55 Admin can edit; duplicate assignment is still rejected.
rejects(()=>apply_(d,p,administrator,idx),409);
apply_(d,{operation:'moveTG',key:'meta',groupId:group.id,venue:'F1-16'},kpUser,idx);check(d.assignments.every(a=>a.venue==='F1-16'),'move updates assignments');
apply_(d,{operation:'moveTG',key:'meta',groupId:group.id,venue:''},kpUser,idx);check(d.assignments.every(a=>a.venue===''),'unassign keeps assignments');
apply_(d,{operation:'addTG',key:'meta',name:'P1 MTSP blank',subject:'MTSP',level:'1',form:'P1',venue:''},kpUser,idx);check(d.groups.at(-1).subject==='MTSP','blank load permits planning TG');
rejects(()=>apply_(d,{...p,target:d.groups.at(-1).id,key:'cell:'+d.groups.at(-1).id+':MTSP',subject:'MTSP'},kpUser,idx),400);
const oldSci=d.loads['1']['Pull/FSci'];model_(d);check(d.loads['1']['Pull/FSci']===oldSci,'legacy rate preserved');check(d.loads['1'].FSC===null,'no guessed FSC migration');
const a=hash_(resource_(d,p.key));d.groups.find(g=>g.id===group.id).venue='F1-16';check(a!==hash_(resource_(d,p.key)),'moving TG invalidates prior cell hash');
`,ctx);
console.log('PASS level-wide TG, optional venue, co-teacher load, subject binding, role guard, moves, legacy preservation');
