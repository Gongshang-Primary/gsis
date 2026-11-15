/** Historical evidence inspection never returns current authority. The single
 * Core row associates event, captured decision, observation and request binding. */
import {requireValue} from '../../runtime/errors.mjs';
import {digest,one,query} from '../../runtime/store.mjs';
import {serviceCall} from '../../runtime/security.mjs';
import {createContactsReader} from '../../contacts/accepted-facts.mjs';

export async function sealDecisionEvidence(event,evidence,principal,binding) {
  return {...evidence,integrityDigest:await digest({event,evidence,principal,binding})};
}
export async function verifyDecisionEvidence({schoolId,decisionId,event,evidence,principal,binding,readHistorical,now=Date.now()}) {
  const check=(value,code='EVIDENCE_INTEGRITY_FAILED')=>requireValue(value,code,409);
  check(event.schoolId===schoolId&&principal.schoolId===schoolId&&(evidence.schoolId===undefined||evidence.schoolId===schoolId)&&event.eventId===decisionId&&evidence.decisionId===decisionId&&principal.decisionId===decisionId,'EVIDENCE_SCOPE_MISMATCH');
  if(evidence.schemaVersion===1)return {state:'incomplete',issues:['LEGACY_UNSEALED_EVIDENCE','FINAL_EVALUATION_TIME_UNVERIFIED'],currentAuthority:false};
  check(evidence.schemaVersion===2);
  check(evidence.schoolId===schoolId,'EVIDENCE_SCOPE_MISMATCH');
  const {integrityDigest,...captured}=evidence;
  check(integrityDigest===await digest({event,evidence:captured,principal,binding}));
  const d=evidence.decision;
  if(!d)return {state:'incomplete',issues:['FINAL_DECISION_CONTRACT_NOT_CAPTURED'],currentAuthority:false};
  check(d.outcome==='allow'&&d.decisionId===decisionId&&d.schoolId===schoolId&&d.action===event.action&&d.action===binding.action&&d.actorAccountId===evidence.actor.accountId&&d.subjectAccountId===evidence.subject.accountId&&d.staffId===evidence.subject.staffId&&d.requestId===event.requestId);
  check(d.evaluatedAt===event.evaluatedAt&&d.evaluatedAt===evidence.evaluatedAt&&Number.isSafeInteger(d.evaluatedAt));
  if(evidence.contacts.kind==='contacts-not-required'){
    check(d.contactsRevisions===null,'EVIDENCE_CONTENT_MISSING');
    return {state:'verified',scope:'captured-allow-decision',contacts:'not-required',verifiedAt:now,currentAuthority:false};
  }
  check(evidence.contacts.kind==='observed'&&d.contactsRevisions,'EVIDENCE_CONTENT_MISSING');
  const {snapshot:s,contentDigest,observation:o}=evidence.contacts;
  check(s.schoolId===schoolId&&s.staffId===evidence.subject.staffId&&s.profile==='authority','EVIDENCE_SCOPE_MISMATCH');
  check(o.evaluationId===decisionId&&[o.requestedAt,o.asOf,o.receivedAt,o.effectiveAt].every(Number.isSafeInteger)&&o.requestedAt<=o.asOf&&o.asOf<=o.receivedAt&&o.receivedAt<=o.effectiveAt&&o.effectiveAt<=d.evaluatedAt,'EVIDENCE_OBSERVATION_INVALID');
  check(d.contactsRevisions.source===s.revision&&event.contactsRevision===s.revision,'EVIDENCE_REVISION_MISMATCH');
  for(const name of ['smc','eo','schoolLeader']){
    const accepted=s.fields?.[name]?.filter(r=>r.state==='accepted');
    check(accepted?.length===1&&accepted[0].revision===d.contactsRevisions[name],'EVIDENCE_REVISION_MISMATCH');
  }
  let ownerRead;
  const reader=createContactsReader({schoolId,clock:()=>now,timeoutMs:5000,readHistorical:async q=>{
    ownerRead=await readHistorical(q);
    return {schemaVersion:1,kind:'historical',snapshot:ownerRead.snapshot};
  }});
  const recovered=await reader.recoverSnapshot({schemaVersion:1,schoolId,staffId:s.staffId,profile:'authority',evaluationId:o.evaluationId,snapshotId:s.snapshotId,revision:s.revision,sequence:s.sequence,contentDigest});
  check(recovered.kind==='historical','EVIDENCE_CONTENT_UNAVAILABLE');
  check(ownerRead.contentDigest===contentDigest&&await digest(recovered.snapshot)===await digest(s),'EVIDENCE_CONTENT_MISMATCH');
  return {state:'verified',scope:'captured-allow-decision',snapshotId:s.snapshotId,contentDigest,contactsRevisions:d.contactsRevisions,observationRecovered:true,verifiedAt:now,currentAuthority:false};
}
export async function recoverDecisionEvidence(ctx,id) {
  const {env,principal}=ctx;
  const r=await one(env.DB,'SELECT event_json,evidence_json,principal_json,descriptor_json,receipt_json FROM core_evidence WHERE school_id=? AND decision_id=?',[env.SCHOOL_ID,id]);
  requireValue(r,'NOT_FOUND',404);
  const event=JSON.parse(r.event_json),evidence=JSON.parse(r.evidence_json),capturedPrincipal=JSON.parse(r.principal_json),binding=JSON.parse(r.descriptor_json);
  const verification=await verifyDecisionEvidence({schoolId:env.SCHOOL_ID,decisionId:id,event,evidence,principal:capturedPrincipal,binding,now:ctx.now??Date.now(),readHistorical:q=>serviceCall(env,'contacts','/internal/historical',{schoolId:env.SCHOOL_ID,decisionId:principal.decisionId,snapshotId:q.snapshotId})});
  return {event,evidence,binding,verification,receipt:{...JSON.parse(r.receipt_json),decisionId:id},destinations:(await query(env.DB,'SELECT destination,operation_id AS operationId,digest,receipt_json FROM core_destination_receipts WHERE school_id=? AND decision_id=?',[env.SCHOOL_ID,id])).map(x=>({...x,receipt:JSON.parse(x.receipt_json)}))};
}
