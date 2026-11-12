import { ContractError } from '../core/contracts.mjs';
import { check, exact, id, instant, freeze, bounded } from './contracts.mjs';
/** The input is T1A's trusted provider query, never browser-supplied authority. */
export function createCoreProvider({reader,schoolId}={}) {
  check(reader && typeof reader.readAcceptedFacts==='function' && id(schoolId));
  return async function readContacts(q) {
    try {
      q=bounded(q); exact(q,['schemaVersion','schoolId','evaluationId','requestedAt','actorAccountId','sessionId','previewAccountId','staffId']);
      check(q.schemaVersion===1 && q.schoolId===schoolId && id(q.evaluationId) && instant(q.requestedAt) &&
        id(q.actorAccountId)&&id(q.sessionId)&&id(q.staffId)&&(q.previewAccountId===null||id(q.previewAccountId)));
      const r=await reader.readAcceptedFacts({schemaVersion:1,schoolId,staffId:q.staffId,profile:'authority',evaluationId:q.evaluationId});
      if(r.kind==='failure') throw new ContractError(r.code==='TIMEOUT'?'PROVIDER_TIMEOUT':r.code==='STALE_EVIDENCE'?'AUTHORITY_CHANGED':'AUTHORITY_UNAVAILABLE');
      check(r.kind==='current' && r.snapshot.schoolId===schoolId && r.snapshot.staffId===q.staffId &&
        r.snapshot.profile==='authority' && r.observation.evaluationId===q.evaluationId && r.observation.asOf>=q.requestedAt);
      const facts={}, fieldRevisions={};
      for(const name of ['smc','eo','schoolLeader']) {
        // The owner supplies one stable interval-bearing authority record per role.
        // Selecting between multiple scheduled records here would change the T1A
        // fingerprint at an unchanged source sequence when the clock advances.
        check(r.snapshot.fields[name].filter(row=>row.state==='accepted').length===1);
        const record=r.fields[name]?.record; check(record?.state==='accepted');
        fieldRevisions[name]=record.revision;
        facts[name]={value:record.value,validFrom:record.validFrom,validUntil:record.validUntil,revoked:record.revoked};
      }
      return freeze({schemaVersion:1,schoolId,evaluationId:q.evaluationId,current:true,asOf:r.observation.asOf,
        revision:r.snapshot.revision,sequence:r.snapshot.sequence,source:'contacts',status:'accepted',staffId:q.staffId,fieldRevisions,facts});
    } catch(e) { if(e instanceof ContractError) throw e; throw new ContractError('PROVIDER_INVALID'); }
  };
}
