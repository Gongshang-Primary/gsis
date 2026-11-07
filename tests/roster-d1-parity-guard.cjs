// Runs automatically in tests/run.cjs. A new dispatcher literal must be inventoried.
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const {discover,scan,root}=require('./helpers/roster-parity.cjs');
function guard(){
 const fixture=`function one(p){const allowed=['one'];return allowed.includes(p.operation);}
 function two(p){const allowed=['two'];return allowed.includes(p.operation);}
 function three(req){if(req.input?.operation==='three')return 1;switch(req.input?.operation){case 'four':return 4;}}
 function map(p){const handlers={five:()=>5};return handlers[p.operation]();}
 function events(event){return event.operation==='not-a-dispatch';}`;
 assert.deepEqual([...new Set(scan('dispatcher-fixture',fixture).map(r=>r.key))].sort(),['one','two','three','four','five'].map(v=>'operation:'+v).sort(),'Dispatcher discovery must cover scoped lists, optional chains, switches and dispatch maps, excluding audit events');

 const catalog=JSON.parse(fs.readFileSync(root+'/docs/roster/d1-parity.json','utf8')),rows=new Map(catalog.rows.map(r=>[r.key,r]));
 assert.equal(rows.size,catalog.rows.length,'Duplicate parity row');
 for(const source of discover()){
  const row=rows.get(source.key);assert(row,'Uninventoried Google/Pages dispatch: '+source.key+'; add a verified D1 handler or an explicit Google-only exception');
  assert(row.handler||row.googleOnly?.reason,'No D1 handler or explicit Google-only entry: '+source.key);
  assert(row.risk&&/^(port|retire|keep Google-only)/.test(row.action),'Missing risk/action: '+source.key);
  assert(row.outcome&&Number.isInteger(row.outcome.status),'No harness outcome: '+source.key);
  if(row.outcome.code==='FROZEN_GOOGLE')assert.equal(row.handler,null,'Frozen Google forwarding must be MISSING: '+source.key);
 }
 assert.equal(rows.size,discover().length,'Retired dispatcher rows must be reviewed');
 console.log('PASS parity inventory coverage: '+rows.size+' operations/views/routes/writers; D1 handler or explicit Google-only exception per row');
}
if(process.argv.includes('--prove')){
 const file=root+'/backend/RosterOperations.gs',before=fs.readFileSync(file);
 try{
  fs.appendFileSync(file,"\nfunction rosterParityDeliberate_(p){if(p.operation==='parityDeliberatelyUnmapped')return {};}\n");
  const result=spawnSync(process.execPath,[__filename],{cwd:root,encoding:'utf8'});
  assert.notEqual(result.status,0,'Guard accepted an uninventoried Google operation');
  assert.match(result.stderr,/Uninventoried Google\/Pages dispatch: operation:parityDeliberatelyUnmapped/);
  console.log('PASS negative control: deliberately added Google operation rejected (child exit '+result.status+')');
 }finally{fs.writeFileSync(file,before);}
 assert.deepEqual(fs.readFileSync(file),before,'Restore deliberate operation byte-for-byte');
}
guard();
