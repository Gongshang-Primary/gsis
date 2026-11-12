import {assert,fixture,cases,createContactsReader} from './v1-contacts-contracts.mjs';
import {fixture as coreFixture} from './v1-core-authority.mjs';
import {createAuthority} from '../v1/core/authority.mjs';
import {createCoreProvider} from '../v1/contacts/core-provider.mjs';
export function connected() {
  const f=fixture(), c=coreFixture();c.state.now=f.state.now;
  c.options.clock=()=>f.state.now;
  const readCore=async q=>{c.state.now=f.state.now;return c.readCore(q);};
  const provider=createCoreProvider({reader:f.reader,schoolId:'school-a'});
  const authority=createAuthority({...c.options,readCore,readContacts:provider});
  return {f,c,provider,authority};
}
await cases([
  ['B10 real Core capability matrix including schoolLeader implies EO, not SMC',async()=>{
    for(const [smc,eo,sl,admin,expected] of [[true,true,false,false,[true,true,true]],[true,false,false,false,[true,false,false]],
      [false,true,true,false,[false,false,false]],[true,false,true,false,[true,true,true]],[false,false,false,true,[true,true,true]]]) {
      for(const [i,action] of ['deploy.read','deploy.edit','deploy.publish'].entries()) {
        const {f,c,authority}=connected();f.s.fields.smc[0].value=smc;f.s.fields.eo[0].value=eo;f.s.fields.schoolLeader[0].value=sl;c.state.account.globalAdmin.value=admin;
        const r=await authority.resolveAuthority({...c.request,action},c.context);assert.equal(r.outcome==='allow',expected[i]);
      }
    }
  }],
  ['B10 real revalidation preserves unchanged read identity and rejects content change',async()=>{
    const {f,c,authority}=connected();const first=await authority.resolveAuthority(c.request,c.context);assert.equal(first.outcome,'allow');
    f.state.now+=10;const again=await authority.revalidateAuthority(c.request,first,c.context);assert.equal(again.outcome,'allow');assert.equal(again.authorityRevision,first.authorityRevision);
    f.bump();assert.equal((await authority.revalidateAuthority(c.request,again,c.context)).reasonCode,'AUTHORITY_CHANGED');
  }],
  ['B10 ambiguous scheduled authority projection fails rather than changing evidence on reads',async()=>{
    const {f,c,authority}=connected();const r=f.s.fields.eo[0];r.validUntil=f.state.now+1;
    f.s.fields.eo.push({...r,revision:'eo-next',validFrom:r.validUntil,validUntil:null});f.groups();
    assert.equal((await authority.resolveAuthority(c.request,c.context)).reasonCode,'PROVIDER_INVALID');
  }],
  ['B10 intervals, missing roles, school isolation, preview and independent Admin',async()=>{
    const {f,c,authority}=connected();f.s.fields.eo[0].validFrom=f.state.now+1;f.s.fields.schoolLeader[0].value=false;
    assert.equal((await authority.resolveAuthority(c.request,c.context)).outcome,'deny');f.state.now++;
    assert.equal((await authority.resolveAuthority(c.request,c.context)).outcome,'allow');
    f.s.fields.eo[0].revoked=true;f.bump();assert.equal((await authority.resolveAuthority(c.request,c.context)).outcome,'deny');
    assert.equal((await authority.resolveAuthority({...c.request,schoolId:'foreign'},c.context)).reasonCode,'SCHOOL_MISMATCH');
    c.preview();assert.equal((await authority.resolveAuthority(c.request,c.context)).reasonCode,'IMPERSONATION_DENIED');
    const g=connected();g.c.state.account.globalAdmin.value=true;
    const a=createAuthority({...g.c.options,readContacts:async()=>{throw Error('outage');}});
    assert.equal((await a.resolveAuthority(g.c.request,g.c.context)).outcome,'allow');
    const h=connected();h.f.s.fields.eo=[{state:'missing'}];h.f.groups();assert.notEqual((await h.authority.resolveAuthority(h.c.request,h.c.context)).outcome,'allow');
  }],
]);
