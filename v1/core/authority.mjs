import { ACTIONS, POLICY_VERSION, ContractError, callProvider, copy, digest, effective, envelope,
  exact, failure, freeze, id, interval, parseRequest, requireValue, serverNow, version } from './contracts.mjs';
import { createSessionPolicy } from './session-policy.mjs';

function account(a, schoolId) {
  exact(a, ['schoolId','accountId','issuer','subject','identityVerified','identityUnique','suspended',
    'linkage','linkageRevision','staffId','globalAdmin']);
  requireValue(a.schoolId === schoolId, 'SCHOOL_MISMATCH');
  requireValue(id(a.accountId) && a.issuer === 'https://accounts.google.com' &&
    typeof a.subject === 'string' && /^[A-Za-z0-9_-]{1,255}$/.test(a.subject) &&
    a.identityVerified === true && a.identityUnique === true, 'IDENTITY_INVALID');
  requireValue(typeof a.suspended === 'boolean' && id(a.linkageRevision) &&
    ['unique','none','ambiguous'].includes(a.linkage) &&
    (a.linkage === 'unique' ? id(a.staffId) : a.staffId === null));
  interval(a.globalAdmin);
}
function coreSnapshot(value, query, now, context) {
  exact(value, ['schemaVersion','schoolId','evaluationId','current','asOf','revision','sequence',
    'policyVersion','account','session','previewAccount','previewGrant']);
  envelope(value, query, now);
  requireValue(value.policyVersion === POLICY_VERSION, 'AUTHORITY_CHANGED');
  account(value.account, query.schoolId);
  requireValue(value.account.accountId === context.actorAccountId, 'IDENTITY_INVALID');
  requireValue(value.session?.sessionId === context.sessionId, 'SESSION_INVALID');
  if (context.previewAccountId !== undefined) {
    account(value.previewAccount, query.schoolId);
    requireValue(value.previewAccount.accountId === context.previewAccountId, 'IMPERSONATION_DENIED');
    const p = value.previewGrant;
    exact(p, ['schoolId','actorAccountId','subjectAccountId','revision','permission','fieldScope']);
    requireValue(p.schoolId === query.schoolId, 'SCHOOL_MISMATCH');
    requireValue(p.actorAccountId === context.actorAccountId && p.subjectAccountId === context.previewAccountId &&
      id(p.revision) && Array.isArray(p.fieldScope) && p.fieldScope.length === 1 &&
      p.fieldScope[0] === 'deploy.planning', 'IMPERSONATION_DENIED');
    interval(p.permission);
  } else requireValue(value.previewAccount === null && value.previewGrant === null);
}
function contactsSnapshot(value, query, now, staffId) {
  exact(value, ['schemaVersion','schoolId','evaluationId','current','asOf','revision','sequence',
    'source','status','staffId','fieldRevisions','facts']);
  envelope(value, query, now);
  requireValue(value.source === 'contacts' && value.status === 'accepted' && value.staffId === staffId);
  exact(value.fieldRevisions, ['smc','eo','schoolLeader']);
  exact(value.facts, ['smc','eo','schoolLeader']);
  for (const name of ['smc','eo','schoolLeader']) {
    requireValue(id(value.fieldRevisions[name])); interval(value.facts[name]);
  }
}
function evidenceBody(value) {
  const { evaluationId, asOf, ...body } = value; return body;
}
function binding(request, context) {
  return JSON.stringify([request.schoolId,request.action,request.resource.domain,request.resource.schoolId,request.resource.resourceId ?? null,request.operationId ?? null,
    context.serviceId,context.actorAccountId,context.sessionId,context.previewAccountId ?? null]);
}

/** Construct once per trusted school/service boundary. No decision store or bearer-token API. */
export function createAuthority({ clock, schoolId, callers, readCore, readContacts, timeoutMs = 1000 } = {}) {
  requireValue(id(schoolId) && Array.isArray(callers) && callers.length > 0);
  const allowedCallers = freeze(copy(callers));
  for (const c of allowedCallers) {
    exact(c, ['serviceId','schoolId','actions']);
    requireValue(id(c.serviceId) && c.schoolId === schoolId && Array.isArray(c.actions) &&
      c.actions.length > 0 && c.actions.every(a => ACTIONS.includes(a)));
  }
  const sessions = createSessionPolicy({ clock });
  const issued = new WeakMap(), watermarks = new Map(), inFlight = new Map();
  let serial = 0;
  async function observe(key, value) {
    const fingerprint = await digest(evidenceBody(value)), old = watermarks.get(key);
    requireValue(!old || value.sequence > old.sequence ||
      (value.sequence === old.sequence && fingerprint === old.fingerprint), 'AUTHORITY_CHANGED');
    // Revisions are monotonic provider sequences; memory is rejection-only, never authority.
    watermarks.set(key, { sequence: value.sequence, fingerprint });
  }
  async function evaluate(input, trustedContext, previousDecision) {
    let request, context, evaluatedAt = null, decisionId = crypto.randomUUID();
    let flightKey, order, core, contacts, revision;
    try {
      evaluatedAt = serverNow(clock); request = parseRequest(input);
      exact(trustedContext, ['schemaVersion','serviceId','schoolId','actorAccountId','sessionId'],
        ['previewAccountId'], 'SERVICE_DENIED');
      version(trustedContext.schemaVersion);
      context = freeze(copy(trustedContext));
      requireValue(id(context.serviceId) && id(context.actorAccountId) && id(context.sessionId) &&
        (context.previewAccountId === undefined || id(context.previewAccountId)), 'SERVICE_DENIED');
      requireValue(context.schoolId === schoolId && request.schoolId === schoolId &&
        request.resource.schoolId === schoolId, 'SCHOOL_MISMATCH');
      requireValue(allowedCallers.some(c => c.serviceId === context.serviceId && c.actions.includes(request.action)), 'SERVICE_DENIED');
      if (context.previewAccountId !== undefined && request.action !== 'deploy.read')
        throw new ContractError('IMPERSONATION_DENIED');
      if (previousDecision !== undefined) {
        requireValue(issued.has(previousDecision) && issued.get(previousDecision) === binding(request, context), 'AUTHORITY_CHANGED');
      }
      // Overlapping responses for the same actor/session cannot replace a later-started evaluation.
      flightKey = JSON.stringify([context.actorAccountId, context.sessionId]);
      order = ++serial; inFlight.set(flightKey, order);
      const query = { schemaVersion: 1, schoolId, evaluationId: decisionId,
        requestedAt: evaluatedAt, actorAccountId: context.actorAccountId, sessionId: context.sessionId,
        previewAccountId: context.previewAccountId ?? null };
      core = await callProvider(readCore, query, timeoutMs);
      coreSnapshot(core, query, serverNow(clock), context);
      await observe(`core:${context.actorAccountId}:${context.sessionId}:${context.previewAccountId ?? ''}`, core);
      let session = sessions.validateSession(core.session, core.account);
      requireValue(session.outcome === 'allow', session.reasonCode);
      const target = context.previewAccountId === undefined ? core.account : core.previewAccount;
      requireValue(!target.suspended, 'ACCOUNT_SUSPENDED');
      if (context.previewAccountId !== undefined)
        requireValue(effective(core.previewGrant.permission, serverNow(clock)), 'IMPERSONATION_DENIED');
      // Independent current Core Admin does not depend on Contacts availability.
      if (!effective(target.globalAdmin, serverNow(clock))) {
        requireValue(target.linkage === 'unique', 'IDENTITY_UNLINKED');
        contacts = await callProvider(readContacts, { ...query, staffId: target.staffId }, timeoutMs);
        contactsSnapshot(contacts, query, serverNow(clock), target.staffId);
        await observe(`contacts:${target.staffId}`, contacts);
      }
      // Catch Core revocation/linkage changes while Contacts was being read.
      const finalQuery = { ...query, requestedAt: serverNow(clock) };
      const finalCore = await callProvider(readCore, finalQuery, timeoutMs);
      coreSnapshot(finalCore, finalQuery, serverNow(clock), context);
      await observe(`core:${context.actorAccountId}:${context.sessionId}:${context.previewAccountId ?? ''}`, finalCore);
      requireValue(await digest(evidenceBody(core)) === await digest(evidenceBody(finalCore)), 'AUTHORITY_CHANGED');
      revision = await digest([POLICY_VERSION, evidenceBody(finalCore), contacts ? evidenceBody(contacts) : null]);
      evaluatedAt = serverNow(clock);
      requireValue(evaluatedAt >= query.requestedAt, 'AUTHORITY_UNAVAILABLE');
      session = sessions.validateSession(finalCore.session, finalCore.account);
      requireValue(session.outcome === 'allow', session.reasonCode);
      if (context.previewAccountId !== undefined)
        requireValue(effective(finalCore.previewGrant.permission, evaluatedAt), 'IMPERSONATION_DENIED');
      const admin = effective(target.globalAdmin, evaluatedAt);
      // A grant expiring during IO cannot fall through to an unverified derived path.
      if (!admin) {
        requireValue(contacts !== undefined, 'AUTHORITY_UNAVAILABLE');
        const { smc, eo, schoolLeader } = contacts.facts;
        requireValue(effective(smc, evaluatedAt) && (request.action === 'deploy.read' ||
          effective(eo, evaluatedAt) || effective(schoolLeader, evaluatedAt)), 'CAPABILITY_DENIED');
      }
      requireValue(previousDecision === undefined || previousDecision.authorityRevision === revision, 'AUTHORITY_CHANGED');
      requireValue(request.expectedAuthorityRevision === undefined || request.expectedAuthorityRevision === revision, 'AUTHORITY_CHANGED');
      requireValue(inFlight.get(flightKey) === order, 'AUTHORITY_CHANGED');
      const result = freeze({ schemaVersion: 1, requestId: request.requestId, decisionId, schoolId,
        action: request.action, outcome: 'allow', reasonCode: 'CAPABILITY_ALLOWED', retryable: false,
        evaluatedAt, actorAccountId: context.actorAccountId, subjectAccountId: target.accountId,
        staffId: target.linkage === 'unique' ? target.staffId : null,
        impersonating: context.previewAccountId !== undefined,
        fieldScope: context.previewAccountId === undefined ? ['deploy.planning'] : copy(core.previewGrant.fieldScope),
        policyVersion: POLICY_VERSION, coreRevision: finalCore.revision,
        contactsRevisions: contacts ? { source: contacts.revision, ...contacts.fieldRevisions } : null,
        authorityRevision: revision, sessionExpiresAt: session.expiresAt });
      issued.set(result, binding(request, context)); return result;
    } catch (error) {
      // Denials carry no account, staff, provider payload or foreign-school identifiers.
      return freeze({ schemaVersion: 1, requestId: request?.requestId ?? null, decisionId,
        schoolId, action: request?.action ?? null, evaluatedAt, ...failure(error) });
    } finally {
      if (inFlight.get(flightKey) === order) inFlight.delete(flightKey);
    }
  }
  return Object.freeze({ resolveAuthority: (r, c) => evaluate(r, c),
    revalidateAuthority: (r, previous, c) => evaluate(r, c, previous ?? null) });
}
