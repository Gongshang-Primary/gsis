import {assert,fixture,cases,createContactsReader} from './v1-contacts-contracts.mjs';
import {fieldVector} from '../v1/contacts/contracts.mjs';
await cases([
  ['B03 explicit false, empty sets and combined FAJT + BT survive',async()=>{
    const a=fixture();a.s.fields.eo[0].value=false;
    assert.equal((await a.reader.readAcceptedFacts(a.query)).fields.eo.record.value,false);
    const f=fixture('staff');let r=await f.reader.readAcceptedFacts(f.query);assert.equal(r.kind,'current');
    assert.deepEqual(r.fields.employmentTags.record.value.map(v=>v.code),['FAJT','BT']);
    f.s.fields.subjectTags[0].value=[];f.s.catalogues=f.s.catalogues.filter(c=>c.catalogueId!=='cat-subjectTags');f.bump();
    r=await f.reader.readAcceptedFacts(f.query);assert.deepEqual(r.fields.subjectTags.record.value,[]);
    f.s.fields.subjectTags=[{state:'missing'}];f.bump();r=await f.reader.readAcceptedFacts(f.query);assert.equal(r.fields.subjectTags.state,'missing');assert.equal(r.complete,false);
  }],
  ['B04 half-open boundaries without revision change',async()=>{
    const f=fixture('display');const start=f.state.now+1;f.s.fields.basicName[0].validFrom=start;f.s.fields.basicName[0].validUntil=start+1;
    assert.equal((await f.reader.readAcceptedFacts(f.query)).fields.basicName.state,'future');
    f.state.now=start;assert.equal((await f.reader.readAcceptedFacts(f.query)).fields.basicName.state,'effective');
    f.state.now++;assert.equal((await f.reader.readAcceptedFacts(f.query)).fields.basicName.state,'expired');
  }],
  ['B04 current accepted value survives pending and future replacement',async()=>{
    const f=fixture('display'), current=f.s.fields.basicName[0];current.validUntil=f.state.now+100;
    f.s.fields.basicName.push({...current,revision:'name-future',value:'Future name',validFrom:current.validUntil,validUntil:null},{state:'pending'});f.groups();
    let r=await f.reader.readAcceptedFacts(f.query);assert.equal(r.fields.basicName.record.value,current.value);
    f.state.now+=100;r=await f.reader.readAcceptedFacts(f.query);assert.equal(r.fields.basicName.record.value,'Future name');
  }],
  ['B05 missing and nonaccepted are never fabricated accepted facts',async()=>{
    for(const state of ['missing','pending','rejected','superseded']) {
      const f=fixture();f.s.fields.eo=[{state}];f.groups();const r=await f.reader.readAcceptedFacts(f.query);
      assert.equal(r.kind,'current');assert.equal(r.fields.eo.state,state);assert.equal(r.fields.eo.record,undefined);assert.equal(r.complete,false);
    }
    const f=fixture('staff');f.s.fields.profileState[0].value='complete';f.s.fields.schoolSection=[{state:'missing'}];f.s.catalogues=f.s.catalogues.filter(c=>c.catalogueId!=='cat-schoolSection');f.groups();
    assert.equal((await f.reader.readAcceptedFacts(f.query)).code,'INCOMPLETE_EVIDENCE');
  }],
  ['B06 group and dependent vectors cannot silently omit or mix fields',async()=>{
    const f=fixture();f.s.dependencies.definitions=[{groupId:'roles',definitionRevision:'definition-1',revision:'dep-1',members:['smc','eo'],vector:fieldVector(f.s.fields,['smc','eo'])}];
    assert.equal((await f.reader.readAcceptedFacts(f.query)).kind,'current');
    for(const change of [g=>{g.s.fields.eo[0].revision='changed';},g=>{g.s.dependencies.complete=false;},g=>{delete g.s.groups.authority.vector.smc;}]) {
      const g=fixture();change(g);assert.equal((await g.reader.readAcceptedFacts(g.query)).kind,'failure');
    }
    f.s.dependencies.definitions[0].members.push('role');assert.equal((await createContactsReader(f.options).readAcceptedFacts(f.query)).code,'INCOMPLETE_EVIDENCE');
  }],
  ['B05 overlapping accepted intervals are inconsistent even before overlap becomes current',async()=>{
    const f=fixture('display');f.s.fields.basicName.push({...f.s.fields.basicName[0],revision:'overlap',validFrom:f.state.now+100});f.groups();
    assert.equal((await f.reader.readAcceptedFacts(f.query)).code,'INVALID_EVIDENCE');
  }],
]);
