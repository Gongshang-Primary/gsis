import { ACTIONS, HTTP_STATUS, callProvider, exact, freeze, id, instant, requireValue, serverNow, version } from './contracts.mjs';
export const AUDIT_EVENTS = Object.freeze(['identity-rejection','session-expiry','session-revocation',
  'capability-denial','authority-unavailable','authority-changed','impersonation-denial','privileged-decision']);

/** Call after an operation result; the sink is not part of authority evaluation. */
export function createSecurityAudit({ clock, sink, timeoutMs = 1000 } = {}) {
  function projectSecurityAudit(event) {
    requireValue(event && typeof event === 'object'); version(event.schemaVersion);
    requireValue(AUDIT_EVENTS.includes(event.kind) && id(event.eventId) && id(event.requestId) && id(event.schoolId));
    requireValue(['allow','deny','unavailable'].includes(event.outcome) &&
      (Object.hasOwn(HTTP_STATUS, event.reasonCode) || event.reasonCode === 'CAPABILITY_ALLOWED'));
    requireValue(event.action === null || ACTIONS.includes(event.action));
    const result = { schemaVersion: 1, kind: event.kind, eventId: event.eventId, requestId: event.requestId,
      schoolId: event.schoolId, action: event.action, outcome: event.outcome,
      reasonCode: event.reasonCode, recordedAt: serverNow(clock) };
    for (const name of ['operationId','actorAccountId','previewAccountId','policyVersion','coreRevision','contactsRevision']) {
      if (event[name] !== undefined && event[name] !== null) {
        requireValue(id(event[name])); result[name] = event[name];
      }
    }
    if (event.evaluatedAt !== undefined) {
      requireValue(instant(event.evaluatedAt) && event.evaluatedAt <= result.recordedAt);
      result.evaluatedAt = event.evaluatedAt;
    }
    // Projection intentionally drops every unlisted field, including raw provider data.
    return freeze(result);
  }
  async function recordSecurityAudit(event) {
    const projection = projectSecurityAudit(event);
    if (typeof sink !== 'function') return freeze({ projection, persisted: false, status: 'not-configured' });
    try {
      const receipt = await callProvider(sink, projection, timeoutMs);
      exact(receipt, ['schemaVersion','eventId','persisted']); version(receipt.schemaVersion);
      requireValue(receipt.eventId === projection.eventId && receipt.persisted === true);
      return freeze({ projection, persisted: true, status: 'confirmed' });
    } catch { return freeze({ projection, persisted: false, status: 'unconfirmed' }); }
  }
  return Object.freeze({ projectSecurityAudit, recordSecurityAudit });
}
