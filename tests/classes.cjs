const fs=require('fs'),vm=require('vm'),crypto=require('crypto');const ctx={console,Utilities:{getUuid:crypto.randomUUID,computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()],DigestAlgorithm:{SHA_256:'sha256'}}};vm.createContext(ctx);for(const f of ['Code.gs','Seed.gs'])vm.runInContext(fs.readFileSync(__dirname+'/../backend/'+f,'utf8'),ctx);
vm.runInContext(`
const both={user:{roles:['Admin','KP']}},ordinary={user:{roles:[]}},idx={active:'one',revision:0};function check(x,m){if(!x)throw Error(m)}function rejects(fn,status){try{fn()}catch(e){check(e.status===status,e.message);return}throw Error('Expected rejection')}
const one=model_(JSON.parse(JSON.stringify(DEPLOY_SEED)));one.id='one';one.teachers=[{id:'a',name:'A',active:true},{id:'b',name:'B',active:true}];one.assignments=[];const two=JSON.parse(JSON.stringify(one));two.id='two';
apply_(one,{operation:'addTeacher',key:'cell:1P:FT',target:'1P',subject:'FT',teacher:'a'},both,idx);
apply_(one,{operation:'addTG',key:'meta',name:'LSP test',subject:'LSP',level:'1',form:'1P',venue:'',sources:['1P']},both,idx);const g=one.groups.at(-1);
apply_(one,{operation:'updateClass',key:'meta',previous:'1P',level:'1',name:'Graciousness',shortName:'Gc'},both,idx);
check(one.venues.find(r=>r.id==='F1-16').form==='1Gc','homeroom rename');check(one.assignments[0].target==='1Gc','assignment rename');check(g.form==='1Gc'&&g.sources[0]==='1Gc','TG references renamed');check(two.classes.some(c=>c.shortName==='P')&&!two.classes.some(c=>c.shortName==='Gc'),'other version unchanged');check(activeExport_(one,idx).assignments[0].className==='Graciousness','active API includes full class name');
rejects(()=>apply_(one,{operation:'addClass',key:'meta',level:'1',name:'Graciousness',shortName:'Gc'},both,idx),400);
rejects(()=>apply_(one,{operation:'addClass',key:'meta',level:'1',name:'Reserved',shortName:'P1'},both,idx),400);
rejects(()=>apply_(one,{operation:'deleteClass',key:'meta',previous:'1Gc'},both,idx),409);
apply_(one,{operation:'addClass',key:'meta',level:'1',name:'Gratitude',shortName:'Gt'},both,idx);apply_(one,{operation:'addTeacher',key:'cell:1Gt:FT',target:'1Gt',subject:'FT',teacher:'b'},both,idx);check(one.assignments.at(-1).venue==='','new class can remain without homeroom');
rejects(()=>apply_(one,{operation:'updateClass',key:'meta',previous:'1Gt',level:'1',name:'No',shortName:'1Gt'},ordinary,idx),403);
console.log('PASS three-field classes, version isolation, atomic rename references, duplicate/reserved names, deletion guard, unassigned-class workload, API class name');
`,ctx);
