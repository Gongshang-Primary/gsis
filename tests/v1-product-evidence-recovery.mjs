import {assert,cases,fixture} from './v1-contacts-contracts.mjs';
import {sealDecisionEvidence,verifyDecisionEvidence} from '../v1/services/core/evidence.mjs';
async function sample(){
  const f=fixture(), observed=await f.reader.readAcceptedFacts(f.query);
  const schoolId=f.s.schoolId,decisionId=f.query.evaluationId,now=f.state.now;
  const event={schoolId,eventId:decisionId,action:'deploy.read',requestId:'request-1',evaluatedAt:now,contactsRevision:f.s.revision};
  const binding={action:event.action};
  const principal={schoolId,decisionId};
  const decision={outcome:'allow',schoolId,decisionId,action:event.action,requestId:event.requestId,evaluatedAt:now,actorAccountId:'actor',subjectAccountId:'actor',staffId:f.s.staffId,contactsRevisions:{source:f.s.revision,...Object.fromEntries(['smc','eo','schoolLeader'].map(k=>[k,f.s.fields[k][0].revision]))}};
  const evidence={schemaVersion:2,schoolId,decisionId,actor:{accountId:'actor'},subject:{accountId:'actor',staffId:f.s.staffId},evaluatedAt:now,decision,contacts:{kind:'observed',snapshot:structuredClone(observed.snapshot),contentDigest:observed.contentDigest,observation:structuredClone(observed.observation)}};
  const q={schoolId,decisionId,event,evidence,principal,binding,now,readHistorical:async()=>({snapshot:structuredClone(f.s),contentDigest:observed.contentDigest})};
  q.evidence=await sealDecisionEvidence(event,evidence,principal,binding);
  return q;
}
async function reseal(q){const {integrityDigest,...e}=q.evidence;q.evidence=await sealDecisionEvidence(q.event,e,q.principal,q.binding);return q;}
await cases([
 ['F5 full immutable snapshot and actual observation verify without granting current authority',async()=>{const q=await sample(),r=await verifyDecisionEvidence(q);assert.equal(r.state,'verified');assert.equal(r.currentAuthority,false);assert.equal(r.observationRecovered,true);assert.deepEqual(r.contactsRevisions,q.evidence.decision.contactsRevisions);} ],
 ['F5 event/binding/observation corruption is detected',async()=>{for(const change of [q=>q.event.requestId='other',q=>q.binding.action='deploy.publish',q=>q.evidence.contacts.observation.asOf++]){const q=await sample();change(q);await assert.rejects(()=>verifyDecisionEvidence(q),e=>e.code==='EVIDENCE_INTEGRITY_FAILED');}}],
 ['F5 foreign school and staff identity reject',async()=>{let q=await sample();q.schoolId='foreign';await assert.rejects(()=>verifyDecisionEvidence(q),e=>e.code==='EVIDENCE_SCOPE_MISMATCH');q=await sample();q.evidence.subject.staffId='other';await reseal(q);await assert.rejects(()=>verifyDecisionEvidence(q),e=>e.code==='EVIDENCE_INTEGRITY_FAILED');}],
 ['F5 malformed observation ordering and changed role vector reject even with intact envelope',async()=>{let q=await sample();q.evidence.contacts.observation.asOf=q.now+1;await reseal(q);await assert.rejects(()=>verifyDecisionEvidence(q),e=>e.code==='EVIDENCE_OBSERVATION_INVALID');q=await sample();q.evidence.decision.contactsRevisions.eo='wrong';await reseal(q);await assert.rejects(()=>verifyDecisionEvidence(q),e=>e.code==='EVIDENCE_REVISION_MISMATCH');}],
 ['F5 missing or altered immutable owner content cannot fall back to current facts',async()=>{for(const read of [async()=>{throw Error('missing');},async()=>({snapshot:{},contentDigest:'wrong'})]){const q=await sample();q.readHistorical=read;await assert.rejects(()=>verifyDecisionEvidence(q),e=>e.code==='EVIDENCE_CONTENT_UNAVAILABLE');}}],
 ['F5 legacy records remain incomplete without fabricated final evaluation time',async()=>{const q=await sample();q.evidence.schemaVersion=1;const r=await verifyDecisionEvidence(q);assert.equal(r.state,'incomplete');assert(r.issues.includes('FINAL_EVALUATION_TIME_UNVERIFIED'));assert.equal(r.currentAuthority,false);} ],
 ['F5 Admin bypass has explicit no-Contacts evidence, no historical lookup',async()=>{const q=await sample();q.evidence.contacts={kind:'contacts-not-required'};q.evidence.decision.contactsRevisions=null;q.readHistorical=()=>{throw Error('unexpected Contacts read');};await reseal(q);const r=await verifyDecisionEvidence(q);assert.equal(r.contacts,'not-required');assert.equal(r.currentAuthority,false);} ],
 ['F5 non-Deploy capture does not claim the T1A decision contract',async()=>{const q=await sample();q.evidence.decision=null;await reseal(q);assert.equal((await verifyDecisionEvidence(q)).state,'incomplete');} ],
]);
