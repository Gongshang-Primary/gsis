import { SESSION_DURATION_MS, exact, failure, freeze, id, instant, requireValue, serverNow, version } from './contracts.mjs';
export { SESSION_DURATION_MS } from './contracts.mjs';

/** Policy only: evidence must be read from the trusted Core store, not browser JSON. */
export function createSessionPolicy({ clock, verifyGoogleIdentity } = {}) {
  function validateSession(sessionEvidence, currentAccountEvidence) {
    try {
      const now = serverNow(clock), s = sessionEvidence, a = currentAccountEvidence;
      exact(s, ['schemaVersion','schoolId','sessionId','accountId','issuer','subject','authenticatedAt','expiresAt','revoked'], [], 'SESSION_INVALID');
      version(s.schemaVersion);
      requireValue(id(s.schoolId) && id(s.sessionId) && id(s.accountId) &&
        s.issuer === 'https://accounts.google.com' && typeof s.subject === 'string' &&
        /^[A-Za-z0-9_-]{1,255}$/.test(s.subject) && typeof s.revoked === 'boolean' &&
        instant(s.authenticatedAt) && instant(s.expiresAt) && s.authenticatedAt <= now &&
        s.expiresAt - s.authenticatedAt === SESSION_DURATION_MS, 'SESSION_INVALID');
      requireValue(a && a.schoolId === s.schoolId, 'SCHOOL_MISMATCH');
      requireValue(a.accountId === s.accountId && a.issuer === s.issuer && a.subject === s.subject &&
        a.identityVerified === true && typeof a.suspended === 'boolean', 'IDENTITY_INVALID');
      requireValue(!a.suspended, 'ACCOUNT_SUSPENDED');
      requireValue(!s.revoked, 'SESSION_REVOKED');
      requireValue(now < s.expiresAt, 'SESSION_EXPIRED');
      return freeze({ schemaVersion: 1, outcome: 'allow', reasonCode: 'SESSION_VALID', retryable: false,
        authenticatedAt: s.authenticatedAt, expiresAt: s.expiresAt, evaluatedAt: now });
    } catch (error) { return freeze({ schemaVersion: 1, ...failure(error) }); }
  }
  async function reauthenticate(token, config, currentAccountEvidence) {
    try {
      requireValue(typeof verifyGoogleIdentity === 'function', 'REAUTHENTICATION_REQUIRED');
      const startedAt = serverNow(clock);
      const result = await verifyGoogleIdentity(token, config);
      const now = serverNow(clock), a = currentAccountEvidence;
      requireValue(result?.outcome === 'allow' && result.schemaVersion === 1 &&
        instant(result.verifiedAt) && result.verifiedAt >= startedAt && result.verifiedAt <= now && result.tokenExpiresAt > now &&
        result.identity?.schoolId === config.schoolId && a?.schoolId === config.schoolId &&
        a.identityVerified === true && a.identityUnique === true && a.suspended === false && id(a.accountId) &&
        a.issuer === result.identity.issuer && a.subject === result.identity.subject, 'REAUTHENTICATION_REQUIRED');
      // A policy proposal only. The future Core store must recheck and persist atomically.
      return freeze({ schemaVersion: 1, outcome: 'allow', reasonCode: 'REAUTHENTICATED', retryable: false,
        accountId: a.accountId, schoolId: a.schoolId, authenticatedAt: now, expiresAt: now + SESSION_DURATION_MS });
    } catch { return freeze({ schemaVersion: 1, outcome: 'deny', reasonCode: 'REAUTHENTICATION_REQUIRED', retryable: false }); }
  }
  return Object.freeze({ validateSession, reauthenticate });
}
