import {assert,fixture,cases,createContactsReader} from './v1-contacts-contracts.mjs';
import {fixture as coreFixture} from './v1-core-authority.mjs';
import {createAuthority} from '../v1/core/authority.mjs';
import {createCoreProvider} from '../v1/contacts/core-provider.mjs';
import {ContractError,HTTP_STATUS} from '../v1/core/contracts.mjs';
import {createSecurityAudit} from '../v1/core/audit.mjs';
const missing='AUTHORITY_EVIDENCE_MISSING';
function connected(changeReader={}) {
  const f=fixture(), c=coreFixture();f.s.fields.schoolLeader[0].value=false;
  const reader=createContactsReader({...f.options,...changeReader});
  const provider=createCoreProvider({reader,schoolId:'school-a'});
  const authority=createAuthority({...c.options,clock:f.clock,readCore:async q=>{c.state.now=f.state.now;return c.readCore(q);},readContacts:provider});
  return {f,c,reader,provider,authority,run:(action='deploy.publish')=>authority.resolveAuthority({...c.request,action},c.context)};
}
function result(r,code,outcome='deny',retryable=false) {
  assert.equal(r.reasonCode,code);assert.equal(r.outcome,outcome);assert.equal(r.retryable,retryable);
}
await cases([
  ['M01 each validated nonaccepted state and all missing deny non-retryably',async()=>{
    for(const state of ['missing','pending','rejected','superseded']) for(const fields of [['eo'],['smc','eo','schoolLeader']]) {
      const h=connected();for(const field of fields)h.f.s.fields[field]=[{state}];h.f.groups();
      for(const action of ['deploy.read','deploy.edit','deploy.publish']) result(await h.run(action),missing);
    }
    assert.equal(HTTP_STATUS[missing],403);
  }],
  ['M02 pending observations do not displace accepted false or true records',async()=>{
    const h=connected();for(const rows of Object.values(h.f.s.fields))rows.push({state:'pending'});h.f.groups();
    assert.equal((await h.run()).outcome,'allow');
    const g=connected();for(const rows of Object.values(g.f.s.fields))rows[0].value=false;
    for(const action of ['deploy.read','deploy.edit','deploy.publish'])result(await g.run(action),'CAPABILITY_DENIED');
  }],
  ['M03 unchanged capability matrix and every preview mutation denied',async()=>{
    for(const [eo,sl,expected] of [[true,false,true],[false,true,true],[false,false,false]]) {
      const h=connected();h.f.s.fields.eo[0].value=eo;h.f.s.fields.schoolLeader[0].value=sl;
      assert.equal((await h.run('deploy.read')).outcome,'allow');
      for(const action of ['deploy.edit','deploy.publish'])assert.equal((await h.run(action)).outcome,expected?'allow':'deny');
    }
    const h=connected();h.c.preview();h.f.s.staffId='staff-preview';h.f.s.fields.eo=[{state:'missing'}];h.f.groups();
    for(const action of ['deploy.edit','deploy.publish'])result(await h.run(action),'IMPERSONATION_DENIED');
    result(await h.run('deploy.read'),missing);
  }],
  ['M04 independent Admin ignores Contacts outage and missing records',async()=>{
    let calls=0;const h=connected({readCurrent:async()=>{calls++;throw Error('outage');}});h.c.state.account.globalAdmin.value=true;
    for(const action of ['deploy.read','deploy.edit','deploy.publish'])assert.equal((await h.run(action)).outcome,'allow');assert.equal(calls,0);
  }],
  ['M05 accepted future/expired/revoked intervals remain capability evidence',async()=>{
    for(const mode of ['future','expired','revoked']) {
      const h=connected(), r=h.f.s.fields.eo[0];
      if(mode==='future')r.validFrom=h.f.state.now+1;if(mode==='expired')r.validUntil=h.f.state.now;if(mode==='revoked')r.revoked=true;
      result(await h.run(),'CAPABILITY_DENIED');assert.equal((await h.run('deploy.read')).outcome,'allow');
      if(mode==='future'){h.f.state.now++;assert.equal((await h.run()).outcome,'allow');}
    }
    const h=connected();h.f.s.fields.eo[0].validUntil=h.f.state.now+1;assert.equal((await h.run()).outcome,'allow');h.f.state.now++;result(await h.run(),'CAPABILITY_DENIED');
  }],
  ['M06 unavailable, timeout and stale observations retain failure classes',async()=>{
    result(await connected({readCurrent:async()=>{throw Error('private outage');}}).run(),'AUTHORITY_UNAVAILABLE','unavailable',true);
    result(await connected({readCurrent:()=>new Promise(()=>{}),timeoutMs:5}).run(),'PROVIDER_TIMEOUT','unavailable',true);
    const h=connected();const old=await h.run();assert.equal(old.outcome,'allow');h.f.s.sequence=0;h.f.s.revision='older';h.f.s.snapshotId='older';
    result(await h.run(),'AUTHORITY_CHANGED','deny',true);
    const f=fixture();const g=connected({readCurrent:async q=>{const r=await f.readCurrent(q);r.observation.asOf=q.requestedAt-1;return r;}});
    result(await g.run(),'AUTHORITY_CHANGED','deny',true);
  }],
  ['M07 incomplete plus malformed/foreign evidence never becomes honest missing',async()=>{
    for(const mutate of [s=>{s.fields.schoolLeader[0].value='false';},s=>{delete s.fields.schoolLeader;},s=>{s.schoolId='foreign';},
      s=>{s.staffId='foreign';},s=>{s.source='deploy';},s=>{s.dependencies.complete=false;},s=>{s.fields.eo=[{state:'pending',value:true}];}]) {
      const h=connected();h.f.s.fields.smc=[{state:'missing'}];h.f.groups();mutate(h.f.s);
      const r=await h.run();assert.notEqual(r.reasonCode,missing);assert.equal(r.outcome,'unavailable');assert.equal(r.retryable,true);
    }
    // Valid broad schedules are nevertheless ambiguous for the narrow adapter, even beside missing SMC.
    const h=connected();h.f.s.fields.smc=[{state:'missing'}];const r=h.f.s.fields.eo[0];r.validUntil=h.f.state.now+1;
    h.f.s.fields.eo.push({...r,revision:'next',validFrom:r.validUntil,validUntil:null});h.f.groups();result(await h.run(),'PROVIDER_INVALID','unavailable',true);
  }],
  ['M08 provider-thrown missing errors are not evidence of absent records',async()=>{
    const h=connected({readCurrent:async()=>{throw new ContractError(missing);}});result(await h.run(),'AUTHORITY_UNAVAILABLE','unavailable',true);
    const c=coreFixture();const reader={readAcceptedFacts:async()=>{throw new ContractError(missing);}};
    const authority=createAuthority({...c.options,readContacts:createCoreProvider({reader,schoolId:'school-a'})});
    result(await authority.resolveAuthority(c.request,c.context),'PROVIDER_INVALID','unavailable',true);
  }],
  ['M09 actual audit projector retains reason and strips unapproved evidence',async()=>{
    const h=connected();h.f.s.fields.eo=[{state:'missing'}];h.f.groups();const r=await h.run();result(r,missing);
    const audit=createSecurityAudit({clock:h.f.clock});const receipt=await audit.recordSecurityAudit({schemaVersion:1,kind:'capability-denial',eventId:'event-1',
      requestId:h.c.request.requestId,operationId:h.c.request.operationId,schoolId:'school-a',action:'deploy.publish',outcome:r.outcome,reasonCode:r.reasonCode,
      staffId:'staff-a',missingFields:['eo'],providerPayload:h.f.s,observation:{asOf:h.f.state.now}});
    assert.equal(receipt.projection.reasonCode,missing);assert.equal(receipt.persisted,false);assert.equal(receipt.status,'not-configured');
    for(const key of ['staffId','missingFields','providerPayload','observation'])assert.equal(Object.hasOwn(receipt.projection,key),false);
  }],
  ['M10 unchanged content revalidates; accepted correction needs actual content revision',async()=>{
    const h=connected();const a=await h.run();h.f.state.now+=10;
    const b=await h.authority.revalidateAuthority(h.c.request,a,h.c.context);assert.equal(b.outcome,'allow');assert.equal(a.authorityRevision,b.authorityRevision);assert.equal(h.f.s.sequence,1);
    const g=connected();g.f.s.fields.eo=[{state:'missing'}];g.f.groups();result(await g.run(),missing);
    g.f.s.fields.eo=[g.f.record(true,'eo-fixed')];g.f.bump();assert.equal((await g.run()).outcome,'allow');
  }],
]);
