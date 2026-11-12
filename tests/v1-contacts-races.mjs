import {assert,fixture,cases,createContactsReader,deferred} from './v1-contacts-contracts.mjs';
import {fixture as coreFixture} from './v1-core-authority.mjs';
import {createAuthority} from '../v1/core/authority.mjs';
import {createCoreProvider} from '../v1/contacts/core-provider.mjs';
await cases([
  ['B08 changed observation with unchanged content; forged or stale observation rejects',async()=>{
    const f=fixture();const one=await f.reader.readAcceptedFacts(f.query);f.state.now++;
    const two=await f.reader.readAcceptedFacts({...f.query,evaluationId:'second'});assert.equal(two.kind,'current');assert.equal(one.contentDigest,two.contentDigest);assert.notEqual(one.observation.asOf,two.observation.asOf);
    for(const patch of [{asOf:f.state.now-1},{asOf:f.state.now+1},{evaluationId:'forged'},{requestedAt:0}]) {
      const r=createContactsReader({...f.options,readCurrent:async q=>{const value=await f.readCurrent(q);Object.assign(value.observation,patch);return value;}});
      assert.equal((await r.readAcceptedFacts(f.query)).code,'STALE_EVIDENCE');
    }
  }],
  ['B09 delayed older snapshot cannot replace newer observed content',async()=>{
    const f=fixture(), arrived=deferred(), resume=deferred();let first=true;
    const reader=createContactsReader({...f.options,readCurrent:async q=>{const r=await f.readCurrent(q);if(first){first=false;arrived.resolve();await resume.promise;}return r;}});
    const old=reader.readAcceptedFacts(f.query);await arrived.promise;f.s.fields.eo[0].value=false;f.bump();
    assert.equal((await reader.readAcceptedFacts({...f.query,evaluationId:'new'})).kind,'current');resume.resolve();assert.equal((await old).code,'STALE_EVIDENCE');
  }],
  ['B09 reused sequence with changed content, outage and timeout',async()=>{
    const f=fixture();assert.equal((await f.reader.readAcceptedFacts(f.query)).kind,'current');f.s.fields.eo[0].value=false;
    assert.equal((await f.reader.readAcceptedFacts(f.query)).code,'STALE_EVIDENCE');
    const never=createContactsReader({...f.options,timeoutMs:1,readCurrent:()=>new Promise(()=>{})});assert.equal((await never.readAcceptedFacts(f.query)).code,'TIMEOUT');
    const absent=createContactsReader({...f.options,readCurrent:undefined});assert.equal((await absent.readAcceptedFacts(f.query)).code,'UNAVAILABLE');
  }],
  ['B09 late completion cannot poison watermarks after timeout',async()=>{
    const f=fixture(), delayed=deferred();let first=true;
    const reader=createContactsReader({...f.options,timeoutMs:5,readCurrent:q=>first?(first=false,delayed.promise):f.readCurrent(q)});
    assert.equal((await reader.readAcceptedFacts(f.query)).code,'TIMEOUT');
    const late=await f.readCurrent({...f.query,requestedAt:f.state.now});late.snapshot.sequence=999;late.snapshot.revision='late';
    delayed.resolve(late);await new Promise(r=>setTimeout(r,0));assert.equal((await reader.readAcceptedFacts(f.query)).kind,'current');
  }],
  ['B09 immutable field/group/catalogue identities cannot be reused after advancing source',async()=>{
    const f=fixture();assert.equal((await f.reader.readAcceptedFacts(f.query)).kind,'current');
    f.s.fields.eo[0].value=false;f.s.sequence=2;f.s.revision='source-2';f.s.snapshotId='snapshot-2';
    assert.equal((await f.reader.readAcceptedFacts(f.query)).code,'STALE_EVIDENCE');
    const g=fixture('staff');assert.equal((await g.reader.readAcceptedFacts(g.query)).kind,'current');
    g.s.catalogues[0].entries[0].label='Changed label';g.bump();
    assert.equal((await g.reader.readAcceptedFacts(g.query)).code,'STALE_EVIDENCE');
  }],
  ['B09 fresh instances still require a fresh owner observation',async()=>{
    const f=fixture();const snapshot=await f.readCurrent({...f.query,requestedAt:f.state.now});f.state.now++;
    const restarted=createContactsReader({...f.options,readCurrent:async()=>snapshot});
    assert.equal((await restarted.readAcceptedFacts(f.query)).code,'STALE_EVIDENCE');
  }],
  ['B10 unrelated concurrent Core resources both allow through real adapter',async()=>{
    const f=fixture(), c=coreFixture(), arrived=deferred(), resume=deferred();let first=true;
    const reader=createContactsReader({...f.options,readCurrent:async q=>{const r=await f.readCurrent(q);if(first){first=false;arrived.resolve();await resume.promise;}return r;}});
    const a=createAuthority({...c.options,readContacts:createCoreProvider({reader,schoolId:'school-a'})});
    const old=a.resolveAuthority(c.request,c.context);await arrived.promise;
    const newer=await a.resolveAuthority({...c.request,resource:{...c.request.resource,resourceId:'other'}},c.context);
    resume.resolve();assert.equal(newer.outcome,'allow');assert.equal((await old).outcome,'allow');
  }],
]);
