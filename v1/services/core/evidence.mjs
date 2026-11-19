/** Historical evidence inspection never returns current authority. The single
 * Core row associates event, captured decision, observation and request binding. */
import {requireValue} from '../../runtime/errors.mjs';
import {canonical,digest,one,query,statement} from '../../runtime/store.mjs';
import {createSecurityAudit} from '../../core/audit.mjs';
import {HTTP_STATUS,id} from '../../core/contracts.mjs';
import {choose} from '../../contacts/contracts.mjs';
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
  if (!r) return recoverDeniedDecision(ctx,id);
  const event=JSON.parse(r.event_json),evidence=JSON.parse(r.evidence_json),capturedPrincipal=JSON.parse(r.principal_json),binding=JSON.parse(r.descriptor_json);
  const verification=await verifyDecisionEvidence({schoolId:env.SCHOOL_ID,decisionId:id,event,evidence,principal:capturedPrincipal,binding,now:ctx.now??Date.now(),readHistorical:q=>serviceCall(env,'contacts','/internal/historical',{schoolId:env.SCHOOL_ID,decisionId:principal.decisionId,snapshotId:q.snapshotId})});
  return {event,evidence,binding,verification,receipt:{...JSON.parse(r.receipt_json),decisionId:id},destinations:(await query(env.DB,'SELECT destination,operation_id AS operationId,digest,receipt_json FROM core_destination_receipts WHERE school_id=? AND decision_id=?',[env.SCHOOL_ID,id])).map(x=>({...x,receipt:JSON.parse(x.receipt_json)}))};
}

// Denials live in the append-only owner audit, never in the principal store.
const DENIAL_ACTION = "core.authority-denial";
const DENIAL_SCOPE = "captured-final-non-allow-decision";
const denialCheck = (value, code = "EVIDENCE_INTEGRITY_FAILED") =>
  requireValue(value, code, 409);
function denialContent({ event, evidence, binding }) {
  return { event, evidence, binding };
}
function denialIdentity(record) {
  return {
    ...denialContent(record),
    event: { ...record.event, recordedAt: 0 },
  };
}
function capturedContacts(authority, decisionId) {
  if (
    authority?.kind !== "current" ||
    authority.observation?.evaluationId !== decisionId
  )
    return {
      kind: "not-captured",
      reason: "FINAL_VALIDATED_OBSERVATION_UNAVAILABLE",
    };
  const s = authority.snapshot;
  return {
    kind: "observed",
    reference: {
      schoolId: s.schoolId,
      staffId: s.staffId,
      profile: s.profile,
      snapshotId: s.snapshotId,
      revision: s.revision,
      sequence: s.sequence,
      contentDigest: authority.contentDigest,
    },
    observation: Object.fromEntries(
      ["evaluationId", "requestedAt", "asOf", "receivedAt", "effectiveAt"].map(
        (key) => [key, authority.observation[key]],
      ),
    ),
    fieldRevisions: Object.fromEntries(
      ["smc", "eo", "schoolLeader"].map((name) => [
        name,
        authority.fields[name].record?.revision ?? null,
      ]),
    ),
  };
}

/** Bounded best-effort audit; a failed sink never changes the original denial. */
export async function recordFinalDenial(
  env,
  { decision, descriptor, actor, subject, sessionId, authority },
  now = Date.now(),
) {
  try {
    denialCheck(
      decision?.schemaVersion === 1 &&
        ["deny", "unavailable"].includes(decision.outcome),
    );
    denialCheck(
      Object.keys(decision).every((key) =>
        [
          "schemaVersion",
          "requestId",
          "decisionId",
          "schoolId",
          "action",
          "evaluatedAt",
          "outcome",
          "reasonCode",
          "retryable",
        ].includes(key),
      ),
    );
    denialCheck(
      decision.schoolId === env.SCHOOL_ID &&
        decision.action === descriptor.action &&
        descriptor.service === "deploy",
    );
    actor = { accountId: actor.accountId, staffId: actor.staffId ?? null };
    subject = {
      accountId: subject.accountId,
      staffId: subject.staffId ?? null,
    };
    denialCheck(
      [actor.accountId, subject.accountId, sessionId].every(id) &&
        [actor.staffId, subject.staffId].every(
          (value) => value === null || id(value),
        ),
    );
    denialCheck(descriptor.resourceId == null || id(descriptor.resourceId));
    denialCheck(
      descriptor.bodyDigest == null ||
        /^[a-f0-9]{64}$/.test(descriptor.bodyDigest),
    );
    const binding = {
      schoolId: env.SCHOOL_ID,
      service: descriptor.service,
      action: descriptor.action,
      requestId: decision.requestId,
      operationId: descriptor.operationId ?? null,
      resourceId: descriptor.resourceId ?? null,
      bodyDigest: descriptor.bodyDigest ?? null,
      actorAccountId: actor.accountId,
      subjectAccountId: subject.accountId,
      sessionId,
    };
    const evidence = {
      schemaVersion: 1,
      scope: DENIAL_SCOPE,
      decision,
      actor,
      subject,
      contacts: capturedContacts(authority, decision.decisionId),
    };
    if (evidence.contacts.kind === "observed")
      denialCheck(
        evidence.contacts.reference.schoolId === env.SCHOOL_ID &&
          evidence.contacts.reference.staffId === subject.staffId &&
          evidence.contacts.reference.profile === "authority",
      );
    const audit = createSecurityAudit({
      clock: () => now,
      timeoutMs: 1000,
      sink: async (event) => {
        const content = { event, evidence, binding };
        const record = { ...content, integrityDigest: await digest(content) };
        const encoded = canonical(record);
        denialCheck(new TextEncoder().encode(encoded).length <= 32768);
        await statement(
          env.DB,
          `INSERT OR IGNORE INTO product_audit(school_id,event_id,operation_id,actor_id,action,recorded_at,decision_id,details_json) VALUES(?,?,?,?,?,?,?,?)`,
          [
            env.SCHOOL_ID,
            event.eventId,
            binding.operationId ?? event.requestId,
            actor.accountId,
            DENIAL_ACTION,
            event.recordedAt,
            event.eventId,
            encoded,
          ],
        ).run();
        const row = await one(
          env.DB,
          "SELECT * FROM product_audit WHERE school_id=? AND event_id=?",
          [env.SCHOOL_ID, event.eventId],
        );
        const retained = await validateDenialRow(
          row,
          env.SCHOOL_ID,
          event.eventId,
        );
        denialCheck(
          canonical(denialIdentity(retained)) ===
            canonical(denialIdentity(record)),
        );
        return { schemaVersion: 1, eventId: event.eventId, persisted: true };
      },
    });
    const kind =
      decision.outcome === "unavailable"
        ? "authority-unavailable"
        : decision.reasonCode === "AUTHORITY_CHANGED"
          ? "authority-changed"
          : decision.reasonCode === "SESSION_EXPIRED"
            ? "session-expiry"
            : decision.reasonCode === "SESSION_REVOKED"
              ? "session-revocation"
              : decision.reasonCode === "IMPERSONATION_DENIED"
                ? "impersonation-denial"
                : decision.reasonCode.startsWith("IDENTITY_")
                  ? "identity-rejection"
                  : "capability-denial";
    return await audit.recordSecurityAudit({
      schemaVersion: 1,
      kind,
      ...(kind === "impersonation-denial"
        ? { previewAccountId: subject.accountId }
        : {}),
      eventId: decision.decisionId,
      requestId: decision.requestId,
      schoolId: env.SCHOOL_ID,
      action: decision.action,
      outcome: decision.outcome,
      reasonCode: decision.reasonCode,
      actorAccountId: actor.accountId,
      evaluatedAt: decision.evaluatedAt,
      ...(binding.operationId ? { operationId: binding.operationId } : {}),
      ...(evidence.contacts.kind === "observed"
        ? { contactsRevision: evidence.contacts.reference.revision }
        : {}),
    });
  } catch {
    return { persisted: false, status: "unconfirmed" };
  }
}

async function validateDenialRow(row, schoolId, decisionId) {
  denialCheck(
    row &&
      row.school_id === schoolId &&
      row.event_id === decisionId &&
      row.decision_id === decisionId &&
      row.action === DENIAL_ACTION,
    "EVIDENCE_SCOPE_MISMATCH",
  );
  denialCheck(
    typeof row.details_json === "string" &&
      new TextEncoder().encode(row.details_json).length <= 32768,
  );
  let record;
  try {
    record = JSON.parse(row.details_json);
  } catch {
    denialCheck(false);
  }
  const { event, evidence, binding, integrityDigest } = record;
  denialCheck(
    event &&
      evidence &&
      binding &&
      integrityDigest === (await digest(denialContent(record))),
  );
  const d = evidence.decision;
  denialCheck(
    evidence.schemaVersion === 1 &&
      evidence.scope === DENIAL_SCOPE &&
      d?.schemaVersion === 1 &&
      ["deny", "unavailable"].includes(d.outcome),
  );
  denialCheck(
    d.outcome ===
      (HTTP_STATUS[d.reasonCode] === 503 ? "unavailable" : "deny") &&
      d.retryable === [409, 503].includes(HTTP_STATUS[d.reasonCode]),
  );
  denialCheck(
    event.schoolId === schoolId &&
      binding.schoolId === schoolId &&
      d.schoolId === schoolId &&
      event.eventId === decisionId &&
      d.decisionId === decisionId,
    "EVIDENCE_SCOPE_MISMATCH",
  );
  denialCheck(
    event.action === d.action &&
      binding.action === d.action &&
      binding.service === "deploy" &&
      event.requestId === d.requestId &&
      binding.requestId === d.requestId &&
      event.outcome === d.outcome &&
      event.reasonCode === d.reasonCode &&
      event.evaluatedAt === d.evaluatedAt,
  );
  denialCheck(
    event.actorAccountId === evidence.actor.accountId &&
      binding.actorAccountId === evidence.actor.accountId &&
      binding.subjectAccountId === evidence.subject.accountId &&
      row.actor_id === event.actorAccountId &&
      row.recorded_at === event.recordedAt &&
      row.operation_id === (binding.operationId ?? d.requestId) &&
      (event.operationId ?? null) === binding.operationId,
  );
  // Re-project the stored event: no unapproved field may ride the audit envelope.
  const projected = createSecurityAudit({
    clock: () => event.recordedAt,
  }).projectSecurityAudit(event);
  denialCheck(canonical(projected) === canonical(event));
  return record;
}

async function recoverDeniedDecision(ctx, id) {
  const { env, principal } = ctx;
  const row = await one(
    env.DB,
    "SELECT * FROM product_audit WHERE school_id=? AND event_id=? AND action=?",
    [env.SCHOOL_ID, id, DENIAL_ACTION],
  );
  requireValue(row, "NOT_FOUND", 404);
  const { event, evidence, binding } = await validateDenialRow(
    row,
    env.SCHOOL_ID,
    id,
  );
  const now = ctx.now ?? Date.now(),
    contacts = evidence.contacts;
  const verification = {
    state: "verified",
    scope: DENIAL_SCOPE,
    currentAuthority: false,
    operationCommitted: false,
    verifiedAt: now,
    observationRecovered: false,
  };
  if (contacts.kind === "not-captured") {
    denialCheck(contacts.reason === "FINAL_VALIDATED_OBSERVATION_UNAVAILABLE");
    verification.contacts = "not-captured";
    verification.issues = [contacts.reason];
  } else {
    denialCheck(contacts.kind === "observed", "EVIDENCE_CONTENT_MISSING");
    const r = contacts.reference,
      o = contacts.observation;
    denialCheck(
      r.schoolId === env.SCHOOL_ID &&
        r.staffId === evidence.subject.staffId &&
        r.profile === "authority",
      "EVIDENCE_SCOPE_MISMATCH",
    );
    denialCheck(
      o.evaluationId === id &&
        [o.requestedAt, o.asOf, o.receivedAt, o.effectiveAt].every(
          Number.isSafeInteger,
        ) &&
        o.requestedAt <= o.asOf &&
        o.asOf <= o.receivedAt &&
        o.receivedAt <= o.effectiveAt &&
        o.effectiveAt <= event.recordedAt,
      "EVIDENCE_OBSERVATION_INVALID",
    );
    denialCheck(
      event.contactsRevision === r.revision,
      "EVIDENCE_REVISION_MISMATCH",
    );
    let ownerRead;
    const reader = createContactsReader({
      schoolId: env.SCHOOL_ID,
      clock: () => now,
      timeoutMs: 5000,
      readHistorical: async (q) => {
        ownerRead = await serviceCall(env, "contacts", "/internal/historical", {
          schoolId: env.SCHOOL_ID,
          decisionId: principal.decisionId,
          snapshotId: q.snapshotId,
        });
        return {
          schemaVersion: 1,
          kind: "historical",
          snapshot: ownerRead.snapshot,
        };
      },
    });
    const recovered = await reader.recoverSnapshot({
      schemaVersion: 1,
      ...r,
      evaluationId: o.evaluationId,
    });
    denialCheck(
      recovered.kind === "historical",
      "EVIDENCE_CONTENT_UNAVAILABLE",
    );
    denialCheck(
      ownerRead.contentDigest === r.contentDigest,
      "EVIDENCE_CONTENT_MISMATCH",
    );
    for (const name of ["smc", "eo", "schoolLeader"])
      denialCheck(
        (choose(recovered.snapshot.fields[name], o.effectiveAt).record
          ?.revision ?? null) === contacts.fieldRevisions[name],
        "EVIDENCE_REVISION_MISMATCH",
      );
    Object.assign(verification, {
      contacts: "observed",
      snapshotId: r.snapshotId,
      contentDigest: r.contentDigest,
      fieldRevisions: contacts.fieldRevisions,
      observationRecovered: true,
    });
  }
  return {
    event,
    evidence,
    binding,
    verification,
    receipt: {
      schemaVersion: 1,
      state: "recorded",
      kind: "security-audit",
      decisionId: id,
    },
    destinations: [],
  };
}
