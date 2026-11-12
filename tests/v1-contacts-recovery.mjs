import {assert,fixture,cases,createContactsReader} from './v1-contacts-contracts.mjs';
import {createSecurityAudit} from '../v1/core/audit.mjs';
await cases([
  ['B11 immutable historical recovery is not current authority or observation recovery',async()=>{
    const f=fixture('staff'), current=await f.reader.readAcceptedFacts(f.query), archived=structuredClone(current.snapshot), ref=f.ref(current);
    f.s.fields.role[0].revision='role-new';f.bump();
    const restarted=createContactsReader({...f.options,readHistorical:async()=>({schemaVersion:1,kind:'historical',snapshot:archived})});
    const old=await restarted.recoverSnapshot(ref);assert.equal(old.kind,'historical');assert.equal(old.snapshot.fields.role[0].revision,'role-1');
    assert.deepEqual(old.snapshot.catalogues,archived.catalogues);assert.equal(old.evidenceComplete,false);assert.equal(old.observationRecovery,'not-provided');assert.equal(old.current,undefined);
    assert.equal((await restarted.readAcceptedFacts(f.query)).snapshot.revision,f.s.revision);
    console.log('F5 OPEN: injected synthetic archive is not durable restart/restore evidence.');
  }],
  ['B11 missing, altered, wrong-school or substituted history fails',async()=>{
    const f=fixture(), current=await f.reader.readAcceptedFacts(f.query), ref=f.ref(current);
    for(const patch of [{schoolId:'foreign'},{staffId:'other'},{snapshotId:'other'},{contentDigest:'0'.repeat(64)}])assert.equal((await f.reader.recoverSnapshot({...ref,...patch})).kind,'failure');
    f.s.fields.eo[0].value=false;assert.equal((await f.reader.recoverSnapshot(ref)).code,'REFERENCE_MISMATCH');
    const absent=createContactsReader({...f.options,readHistorical:undefined});assert.equal((await absent.recoverSnapshot(ref)).code,'UNAVAILABLE');
  }],
  ['B11 current audit projector does not retain injected observation data',async()=>{
    const f=fixture(), audit=createSecurityAudit({clock:f.clock});
    const p=audit.projectSecurityAudit({schemaVersion:1,kind:'privileged-decision',eventId:'event',requestId:'req',schoolId:'school-a',action:'deploy.read',outcome:'allow',reasonCode:'CAPABILITY_ALLOWED',actorAccountId:'actor',policyVersion:'deploy-capabilities/1',coreRevision:'core-1',contactsRevision:'source-1',evaluatedAt:f.state.now,contactsAsOf:f.state.now,observationId:'obs',staffId:'staff-a'});
    for(const key of ['contactsAsOf','observationId','staffId'])assert.equal(Object.hasOwn(p,key),false);
  }],
]);
