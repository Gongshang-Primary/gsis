import { digest } from '../core/contracts.mjs';
import { LIMITS, GROUPS, PROFILES, check, exact, id, instant, list, unique, now, query,
  freeze, bounded, read, errorResult, fieldNames, fieldVector, validateFields, choose, refKey } from './contracts.mjs';
import { validateCatalogues } from './catalogues.mjs';

async function validate(snapshot, q) {
  exact(snapshot,['schemaVersion','source','schoolId','staffId','profile','snapshotId','revision','sequence','fields','groups','dependencies','catalogueRefs','catalogues']);
  check((snapshot.schemaVersion===1 || snapshot.schemaVersion===2 && snapshot.profile==='staff') && snapshot.source==='contacts' && snapshot.profile===q.profile && id(snapshot.snapshotId) && id(snapshot.revision) && instant(snapshot.sequence));
  check(snapshot.schoolId===q.schoolId,'SCHOOL_MISMATCH'); check(snapshot.staffId===q.staffId,'STAFF_MISMATCH');
  validateFields(snapshot.fields,q.profile,{schemaVersion:snapshot.schemaVersion});
  exact(snapshot.groups,PROFILES[q.profile]);
  for(const name of PROFILES[q.profile]) {
    const g=snapshot.groups[name]; exact(g,['revision','vector']); check(id(g.revision));
    check(await digest(g.vector)===await digest(fieldVector(snapshot.fields,GROUPS[name])));
  }
  // Contacts attests the complete set of dependencies for this profile, including an empty set.
  exact(snapshot.dependencies,['complete','definitions']); check(snapshot.dependencies.complete===true,'INCOMPLETE_EVIDENCE');
  list(snapshot.dependencies.definitions,LIMITS.groups); unique(snapshot.dependencies.definitions.map(g=>g.groupId));
  for(const g of snapshot.dependencies.definitions) {
    exact(g,['groupId','definitionRevision','revision','members','vector']);
    check(id(g.groupId)&&id(g.definitionRevision)&&id(g.revision)); list(g.members,LIMITS.fields); unique(g.members);
    check(g.members.length>0 && g.members.every(n=>fieldNames(q.profile).includes(n)),'INCOMPLETE_EVIDENCE');
    check(await digest(g.vector)===await digest(fieldVector(snapshot.fields,g.members)));
  }
  validateCatalogues(snapshot.catalogues,Object.fromEntries(Object.entries(snapshot.fields).map(([name,rows])=>[name,rows.filter(r=>r.valueSchema!==2)])),snapshot.catalogueRefs);
  return digest(snapshot);
}
function projection(snapshot, at) {
  const fields=Object.fromEntries(Object.entries(snapshot.fields).map(([name,rows])=>[name,choose(rows,at)]));
  if(fields.profileState?.record?.value==='complete' && fields.profileState.state==='effective') {
    for(const name of GROUPS.classification) check(fields[name].state==='effective','INCOMPLETE_EVIDENCE');
  }
  const complete=Object.values(fields).every(f=>f.state==='effective');
  return {fields,complete};
}
/** Trusted injected owner readers only. No store, retries, transport or durable observations. */
export function createContactsReader({schoolId,clock,readCurrent,readHistorical,timeoutMs=1000}={}) {
  check(id(schoolId)&&typeof clock==='function'); check(Number.isSafeInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=30000);
  const streams=new Map(), identities=new Map();
  async function observe(s, hash) {
    const key=JSON.stringify([s.staffId,s.profile]);
    const bodies=[[[key,'snapshot',s.snapshotId],s],[[key,'source',s.revision],s]];
    for(const [name,rows] of Object.entries(s.fields)) for(const r of rows)
      if(r.state==='accepted') bodies.push([[s.staffId,'field',name,r.revision],r]);
    for(const [name,g] of Object.entries(s.groups)) bodies.push([[s.staffId,'group',name,g.revision],g.vector]);
    for(const g of s.dependencies.definitions) {
      bodies.push([['definition',g.groupId,g.definitionRevision],g.members]);
      bodies.push([[s.staffId,'dependent',g.groupId,g.revision],{definitionRevision:g.definitionRevision,vector:g.vector}]);
    }
    for(const c of s.catalogues) {
      bodies.push([['catalogue',c.catalogueId,c.revision],c]);
      for(const e of c.entries) bodies.push([['entry',c.catalogueId,e.code,e.definitionRevision],e]);
    }
    const proposed=new Map();
    for(const [identity,body] of bodies) {
      const k=JSON.stringify(identity), value=await digest(body);
      check(!proposed.has(k)||proposed.get(k)===value,'STALE_EVIDENCE'); proposed.set(k,value);
    }
    // No await between checking shared watermarks and installing the complete observation.
    const old=streams.get(key);
    check(!old || s.sequence>old.sequence || s.sequence===old.sequence && old.hash===hash,'STALE_EVIDENCE');
    if(old && s.sequence>old.sequence) check(s.revision!==old.revision && s.snapshotId!==old.snapshotId,'STALE_EVIDENCE');
    check(old || streams.size<LIMITS.streams,'LIMIT_EXCEEDED');
    for(const [k,v] of proposed) check(!identities.has(k)||identities.get(k)===v,'STALE_EVIDENCE');
    check(identities.size+[...proposed.keys()].filter(k=>!identities.has(k)).length<=LIMITS.identities,'LIMIT_EXCEEDED');
    for(const [k,v] of proposed) identities.set(k,v);
    streams.set(key,{sequence:s.sequence,hash,revision:s.revision,snapshotId:s.snapshotId});
  }
  async function current(input) {
    const q=query(input,schoolId), requestedAt=now(clock);
    const response=await read(readCurrent,{...q,requestedAt},timeoutMs), receivedAt=now(clock);
    exact(response,['schemaVersion','kind','observation','snapshot']); check(response.schemaVersion===1 && response.kind==='current');
    exact(response.observation,['evaluationId','requestedAt','asOf']); const o=response.observation;
    check(o.evaluationId===q.evaluationId && o.requestedAt===requestedAt && instant(o.asOf) && o.asOf>=requestedAt && o.asOf<=receivedAt,'STALE_EVIDENCE');
    const hash=await validate(response.snapshot,q);
    await observe(response.snapshot,hash);
    const effectiveAt=now(clock); check(effectiveAt>=receivedAt,'STALE_EVIDENCE');
    const projected=projection(response.snapshot,effectiveAt);
    return freeze({schemaVersion:1,kind:'current',snapshot:response.snapshot,contentDigest:hash,
      observation:{...o,receivedAt,effectiveAt},...projected});
  }
  return Object.freeze({
    async readAcceptedFacts(input) { try { return await current(input); } catch(e) { return errorResult(e); } },
    async readCatalogue(input, reference) {
      try {
        reference=bounded(reference); exact(reference,['catalogueId','revision']); check(id(reference.catalogueId)&&id(reference.revision),'MALFORMED_QUERY');
        const result=await current(input), catalogue=result.snapshot.catalogues.find(c=>refKey(c)===refKey(reference));
        check(catalogue,'REFERENCE_MISMATCH');
        return freeze({schemaVersion:1,kind:'catalogue',schoolId:result.snapshot.schoolId,staffId:result.snapshot.staffId,
          profile:result.snapshot.profile,revision:result.snapshot.revision,sequence:result.snapshot.sequence,
          catalogue,snapshotId:result.snapshot.snapshotId,
          contentDigest:result.contentDigest,observation:result.observation});
      } catch(e) { return errorResult(e); }
    },
    async recoverSnapshot(input) {
      try {
        const q=query(input,schoolId,true), response=await read(readHistorical,q,timeoutMs);
        exact(response,['schemaVersion','kind','snapshot']); check(response.schemaVersion===1 && response.kind==='historical');
        const s=response.snapshot, hash=await validate(s,q);
        check(s.snapshotId===q.snapshotId && s.revision===q.revision && s.sequence===q.sequence && hash===q.contentDigest,'REFERENCE_MISMATCH');
        // Never update current watermarks or fabricate an asOf from this historical read.
        return freeze({schemaVersion:1,kind:'historical',snapshot:s,contentDigest:hash,
          observationRecovery:'not-provided',evidenceComplete:false});
      } catch(e) { return errorResult(e); }
    },
  });
}
