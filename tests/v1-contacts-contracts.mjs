import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createContactsReader } from '../v1/contacts/accepted-facts.mjs';
import { GROUPS, PROFILES, FIELDS, fieldNames, fieldVector, choose, bounded } from '../v1/contacts/contracts.mjs';
export { assert, createContactsReader };
export const main=url=>process.argv[1] && pathToFileURL(process.argv[1]).href===url;
export async function cases(rows) { for(const [name,fn] of rows) {await fn();console.log('PASS '+name);}console.log(`${rows.length}/${rows.length} cases passed`); }
export const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
export function fixture(profile='authority') {
  const state={now:1800000000000};
  const record=(value,revision='field-1')=>({state:'accepted',revision,value,validFrom:0,validUntil:null,revoked:false});
  const s={schemaVersion:1,source:'contacts',schoolId:'school-a',staffId:'staff-a',profile,snapshotId:'snapshot-1',revision:'source-1',sequence:1,fields:{},groups:{},dependencies:{complete:true,definitions:[]},catalogueRefs:[],catalogues:[]};
  const flags={sl:false,sc:false,smc:false,kp:false,tl:false,sdt:false,cmt:false,sat:false,support:false,mk:false};
  for(const name of fieldNames(profile)) {
    const type=FIELDS[name];let value;
    if(type==='boolean')value=true;
    else if(type==='profile')value='provisional';
    else if(type==='text')value=name==='basicName'?'Synthetic Person':'Synthetic';
    else {
      const catalogueId=`cat-${name}`, kind=type.replace('[]','');
      const entries=(name==='employmentTags'?['FAJT','BT']:['test-code']).map(code=>({code,label:`Test ${code}`,active:true,definitionRevision:'def-1',
        ...(kind==='membership-role'?{flags:{...flags},eoAppointment:null}:kind==='hr-term'?{category:name}:{category:name,ttbVisible:true,order:1})}));
      s.catalogues.push({catalogueId,revision:'cat-1',kind,entries});
      const refs=entries.map(e=>({catalogueId,revision:'cat-1',code:e.code}));value=type.endsWith('[]')?refs:refs[0];
    }
    s.fields[name]=[record(value,`${name}-1`)];
  }
  function groups(){s.catalogueRefs=s.catalogues.map(({catalogueId,revision})=>({catalogueId,revision}));for(const name of PROFILES[profile])s.groups[name]={revision:`${name}-${s.sequence}`,vector:fieldVector(s.fields,GROUPS[name])};}
  groups();
  const clock=()=>state.now;
  const readCurrent=async q=>structuredClone({schemaVersion:1,kind:'current',observation:{evaluationId:q.evaluationId,requestedAt:q.requestedAt,asOf:state.now},snapshot:s});
  const readHistorical=async()=>structuredClone({schemaVersion:1,kind:'historical',snapshot:s});
  const options={schoolId:s.schoolId,clock,readCurrent,readHistorical,timeoutMs:100};
  const query={schemaVersion:1,schoolId:s.schoolId,staffId:s.staffId,profile,evaluationId:'evaluation-1'};
  return {state,s,record,groups,clock,readCurrent,readHistorical,options,query,reader:createContactsReader(options),
    bump(){s.sequence++;s.revision=`source-${s.sequence}`;s.snapshotId=`snapshot-${s.sequence}`;for(const [name,rows] of Object.entries(s.fields)) rows.forEach((r,i)=>{if(r.state==='accepted')r.revision=`${name}-${s.sequence}-${i}`;});groups();},
    ref(r){return {...query,snapshotId:r.snapshot.snapshotId,revision:r.snapshot.revision,sequence:r.snapshot.sequence,contentDigest:r.contentDigest};}};
}
if(main(import.meta.url)) await cases([
  ['B01 exact query/version/profile/bounds',async()=>{
    const f=fixture();assert.equal((await f.reader.readAcceptedFacts(f.query)).kind,'current');
    for(const patch of [{schemaVersion:2},{profile:'everything'},{evaluationId:''},{roles:['admin']},{effectiveAt:f.state.now+1}])
      assert.equal((await f.reader.readAcceptedFacts({...f.query,...patch})).kind,'failure');
    assert.throws(()=>bounded({payload:'x'.repeat(262145)}));
    assert.throws(()=>bounded({get value(){throw Error('getter executed');}}));
    f.s.source='deploy';assert.equal((await createContactsReader(f.options).readAcceptedFacts(f.query)).code,'INVALID_EVIDENCE');
  }],
  ['B02 identity remains permanent across display change; foreign and missing identity fail',async()=>{
    const f=fixture('display');const old=await f.reader.readAcceptedFacts(f.query);
    f.s.fields.basicName[0].value='Another synthetic name';f.bump();
    const updated=await f.reader.readAcceptedFacts(f.query);assert.equal(updated.kind,'current');assert.equal(updated.snapshot.staffId,old.snapshot.staffId);
    for(const patch of [{staffId:'different'},{schoolId:'foreign'},{staffId:undefined}])assert.equal((await f.reader.readAcceptedFacts({...f.query,...patch})).kind,'failure');
  }],
  ['B01 projections cannot mutate caller evidence and nonaccepted values are rejected',async()=>{
    const f=fixture(), r=await f.reader.readAcceptedFacts(f.query);assert(Object.isFrozen(r.snapshot.fields.smc[0]));
    f.s.fields.smc[0].value=false;assert.equal(r.snapshot.fields.smc[0].value,true);
    f.s.fields.smc=[{state:'pending',value:true}];f.groups();assert.equal((await createContactsReader(f.options).readAcceptedFacts(f.query)).kind,'failure');
  }],
]);
