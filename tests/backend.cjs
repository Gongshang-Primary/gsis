const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const ctx={console,Utilities:{getUuid:crypto.randomUUID,computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()],DigestAlgorithm:{SHA_256:'sha256'}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../backend/Code.gs','utf8'),ctx);vm.runInContext(fs.readFileSync(__dirname+'/../backend/Seed.gs','utf8'),ctx);
vm.runInContext(`
const admin={user:{roles:['Admin']}},kpUser={user:{roles:['KP']}},both={user:{roles:['Admin','KP']}},ordinary={user:{roles:[]}};
function check(x,m){if(!x)throw Error(m)};function rejects(f,status){let ok=false;try{f()}catch(e){ok=e.status===status}check(ok,'Expected rejection '+status)}
const d=JSON.parse(JSON.stringify(DEPLOY_SEED));d.id='v1';d.name='Test';d.teachers=[{id:'t1',name:'Teacher One',active:true},{id:'t2',name:'Teacher Two',active:true}];d.audit=[];d.assignments=[];const idx={active:'v1',revision:0};
const p={operation:'addTeacher',key:'cell:1P:FT',venue:'F1-16',subject:'FT',teacher:'t1',target:'1P'};
check(d.venues.find(r=>r.id==='F1-16').form==='1P','fixture');
auth_(admin,'KP'); // Q55 Admin may edit unpublished deployment
rejects(()=>apply_(d,p,ordinary,idx),403);apply_(d,p,kpUser,idx);
rejects(()=>apply_(d,p,kpUser,idx),409);const other=d.venues.find(r=>r.form&&r.form!=='1P');rejects(()=>apply_(d,{...p,venue:other.id,target:other.form,key:'cell:'+other.form+':FT'},kpUser,idx),409);
apply_(d,{...p,teacher:'t2'},kpUser,idx);check(d.assignments.length===2,'multiple FTs');check(periods_(d,'1','FT')===5,'full FT load');
apply_(d,{operation:'setLoad',key:'load:1:Assembly',level:'1',subject:'Assembly',value:1.5},admin,idx);check(periods_(d,'1','FT')===5.5,'dynamic FT');check(periods_(d,'1','TTT')===0,'TTT excluded');
rejects(()=>apply_(d,{operation:'setLoad',key:'load:1:EL',level:'1',subject:'EL',value:1.2},both,idx),400);
kpUser.people=JSON.parse(JSON.stringify(d.teachers));rejects(()=>apply_(d,{operation:'publish',key:'meta'},kpUser,idx),403);rejects(()=>apply_(d,{operation:'publish',key:'meta'},{user:{roles:[]},people:d.teachers},idx),403);
both.people=JSON.parse(JSON.stringify(d.teachers));apply_(d,{operation:'publish',key:'meta'},both,idx);both.people.push({id:'t3',name:'Teacher 3',active:true});apply_(d,{operation:'publish',key:'meta'},both,idx); // Unrelated Contacts additions do not masquerade as version removals.
log_(d,{identity:{email:'tester@gsps.edu.sg'}},'metadata',JSON.parse(JSON.stringify(d)),d);check(JSON.stringify(d).length>0,'no audit recursion');
const out=view_(d,{active:'v1'},ordinary);check(!out.audit,'no ordinary audit access');rejects(()=>visible_({id:'v2'},{active:'v1'},ordinary),403);
rejects(()=>apply_(d,{operation:'delete',key:'meta'},admin,idx),409);
console.log('PASS backend: roles, FT uniqueness, full FT load, dynamic half periods, TTT, publication conflict, nonrecursive audit, planning isolation, active delete guard');
`,ctx);
