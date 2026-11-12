import {assert,fixture,cases,createContactsReader} from './v1-contacts-contracts.mjs';
await cases([
  ['B07 exact catalogue revisions and separate variants',async()=>{
    const f=fixture('staff');const r=await f.reader.readCatalogue(f.query,{catalogueId:'cat-role',revision:'cat-1'});
    assert.equal(r.kind,'catalogue');assert.equal(r.catalogue.kind,'membership-role');
    assert.equal(r.schoolId,f.query.schoolId);assert.equal(r.staffId,f.query.staffId);assert.equal(r.profile,f.query.profile);
    assert.equal(r.revision,f.s.revision);assert.equal(r.sequence,f.s.sequence);
    assert.equal((await f.reader.readCatalogue(f.query,{catalogueId:'cat-role',revision:'other'})).code,'REFERENCE_MISMATCH');
    for(const change of [g=>{g.s.catalogues[0].entries[0].formula='workload';},g=>{g.s.fields.role[0].value.code='unknown';},g=>{g.s.catalogues[0].revision='different';},g=>{g.s.catalogues[0].entries[0].category='role';}]) {
      const g=fixture('staff');change(g);assert.equal((await g.reader.readAcceptedFacts(g.query)).kind,'failure');
    }
  }],
  ['B07 retired codes remain readable and labels do not redefine identity',async()=>{
    const f=fixture('staff');const cat=f.s.catalogues.find(c=>c.catalogueId==='cat-role');cat.entries[0].active=false;cat.entries[0].label='Global Admin';
    const r=await f.reader.readAcceptedFacts(f.query);assert.equal(r.kind,'current');assert.equal(r.fields.role.record.value.code,'test-code');assert.equal(r.fields.smc,undefined);
    assert.equal(Object.hasOwn(f.reader,'writeCatalogue'),false);
  }],
  ['B07 authority catalogue provenance is validated but never grants a role',async()=>{
    const f=fixture(), source=fixture('staff');f.s.catalogues=[source.s.catalogues.find(c=>c.catalogueId==='cat-role')];f.groups();
    f.s.fields.smc[0].value=false;f.s.catalogues[0].entries[0].flags.smc=true;
    const r=await f.reader.readAcceptedFacts(f.query);assert.equal(r.kind,'current');assert.equal(r.fields.smc.record.value,false);
    f.s.catalogueRefs[0].revision='wrong';assert.equal((await createContactsReader(f.options).readAcceptedFacts(f.query)).code,'REFERENCE_MISMATCH');
  }],
  ['B07 payload and entry limits reject, never truncate',async()=>{
    const f=fixture('staff');f.s.catalogues[0].entries=Array.from({length:257},(_,i)=>({...f.s.catalogues[0].entries[0],code:`code-${i}`}));
    assert.equal((await f.reader.readAcceptedFacts(f.query)).code,'LIMIT_EXCEEDED');
  }],
]);
