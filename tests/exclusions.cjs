const fs=require('fs'),vm=require('vm'),crypto=require('crypto');const ctx={console,Utilities:{getUuid:crypto.randomUUID,computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()],DigestAlgorithm:{SHA_256:'sha256'}}};vm.createContext(ctx);for(const f of ['Code.gs','Seed.gs'])vm.runInContext(fs.readFileSync(__dirname+'/../backend/'+f,'utf8'),ctx);
vm.runInContext(`
const both={user:{roles:['KP','Admin']}},ordinary={user:{roles:[]}},adminOnly={user:{roles:['Admin']}},idx={active:'v1',revision:0};function check(x,m){if(!x)throw Error(m)}function rejects(fn,status){try{fn()}catch(e){check(e.status===status,e.message);return}throw Error('Expected rejection')}
const d=model_(JSON.parse(JSON.stringify(DEPLOY_SEED)));d.id='v1';d.teachers=[{id:'teacher',name:'Teacher',active:true}];d.assignments=[];both.people=d.teachers;
apply_(d,{operation:'addTeacher',key:'cell:1P:FT',target:'1P',subject:'FT',teacher:'teacher'},both,idx);
const initial=JSON.stringify(d.assignments),total=activeExport_(d,idx).workloads[0].total;
apply_(d,{operation:'setLevelExclusions',key:'meta',teacher:'teacher',levels:['1','2','1']},adminOnly,idx);
check(JSON.stringify(d.assignments)===initial,'existing assignments kept');check(activeExport_(d,idx).workloads[0].total===total,'workload unchanged');check(d.levelExclusions[0].levels.length===2,'deduplicated levels');
apply_(d,{operation:'addTeacher',key:'cell:1P:EL',target:'1P',subject:'EL',teacher:'teacher'},both,idx);
apply_(d,{operation:'addTG',key:'meta',name:'Whole level LSP',form:'P1',level:'1',subject:'LSP',venue:''},both,idx);const g=d.groups.at(-1);
apply_(d,{operation:'addTeacher',key:'cell:'+g.id+':LSP',target:g.id,subject:'LSP',teacher:'teacher'},both,idx);
check(d.assignments.length===3,'excluded subject and TG saves allowed');check(activeExport_(d,idx).workloads[0].total===25,'full FT 5 + EL 15 + LSP 5');
apply_(d,{operation:'publish',key:'meta'},both,idx);check(idx.active==='v1','publication allowed with exclusions');
rejects(()=>apply_(d,{operation:'addTeacher',key:'cell:1T:FT',target:'1T',subject:'FT',teacher:'teacher'},both,idx),409);
rejects(()=>apply_(d,{operation:'setLevelExclusions',key:'meta',teacher:'teacher',levels:['1']},ordinary,idx),403);
rejects(()=>apply_(d,{operation:'setLevelExclusions',key:'meta',teacher:'teacher',levels:['99']},both,idx),400);
check(!view_(d,idx,ordinary).levelExclusions,'ordinary API does not expose rule list');check(view_(d,idx,both).levelExclusions.length===1,'planner API exposes rule list');check(!activeExport_(d,idx).levelExclusions,'Contacts API does not export rules');
const other=JSON.parse(JSON.stringify(d));apply_(d,{operation:'setLevelExclusions',key:'meta',teacher:'teacher',levels:[]},both,idx);check(!d.levelExclusions.length&&other.levelExclusions.length===1,'version isolation');check(d.assignments.length===3,'clearing rule does not erase assignments');
d.levelExclusions=[{teacher:'removed',levels:['1']}];apply_(d,{operation:'setLevelExclusions',key:'meta',teacher:'removed',levels:[]},both,idx);check(!d.levelExclusions.length,'orphan rule can be cleared after Contacts review');
console.log('PASS exclusions advisory: existing/new FT, subject and TG saves, full workload, publication, version isolation, role guard, privacy');
`,ctx);
