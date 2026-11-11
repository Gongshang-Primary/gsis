/** Versioned internal contracts. No transport, storage or production imports. */
export const SCHEMA_VERSION = 1;
export const POLICY_VERSION = 'deploy-capabilities/1';
export const SESSION_DURATION_MS = 864000000;
export const ACTIONS = Object.freeze(['deploy.read', 'deploy.edit', 'deploy.publish']);
export const HTTP_STATUS = Object.freeze({
  MALFORMED_REQUEST: 400, UNSUPPORTED_CONTRACT_VERSION: 400,
  IDENTITY_INVALID: 401, IDENTITY_UNLINKED: 401, SESSION_INVALID: 401,
  SESSION_EXPIRED: 401, SESSION_REVOKED: 401, REAUTHENTICATION_REQUIRED: 401,
  SCHOOL_MISMATCH: 403, ACCOUNT_SUSPENDED: 403, CAPABILITY_DENIED: 403,
  IMPERSONATION_DENIED: 403, SERVICE_DENIED: 403,
  AUTHORITY_CHANGED: 409, AUTHORITY_UNAVAILABLE: 503,
  PROVIDER_TIMEOUT: 503, PROVIDER_INVALID: 503, SIGNING_KEYS_UNAVAILABLE: 503,
});
export class ContractError extends Error {
  constructor(reasonCode) { super(reasonCode); this.reasonCode = reasonCode; }
}
export function requireValue(condition, code = 'PROVIDER_INVALID') {
  if (!condition) throw new ContractError(code);
}
export function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
export function exact(value, required, optional = [], code = 'PROVIDER_INVALID') {
  requireValue(object(value), code);
  const keys = Object.keys(value);
  requireValue(required.every(k => Object.hasOwn(value, k)) &&
    keys.every(k => required.includes(k) || optional.includes(k)), code);
}
export function id(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(value);
}
export function instant(value) { return Number.isSafeInteger(value) && value >= 0; }
export function version(value, code = 'UNSUPPORTED_CONTRACT_VERSION') {
  requireValue(value === SCHEMA_VERSION, code);
}
export function serverNow(clock) {
  requireValue(typeof clock === 'function', 'AUTHORITY_UNAVAILABLE');
  const now = clock(); requireValue(instant(now), 'AUTHORITY_UNAVAILABLE'); return now;
}
export function freeze(value) {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}
export function copy(value) { return structuredClone(value); }
export function failure(error) {
  const code = error instanceof ContractError && Object.hasOwn(HTTP_STATUS, error.reasonCode)
    ? error.reasonCode : 'AUTHORITY_UNAVAILABLE';
  return { outcome: HTTP_STATUS[code] === 503 ? 'unavailable' : 'deny',
    reasonCode: code, retryable: [409, 503].includes(HTTP_STATUS[code]) };
}
export function parseRequest(value) {
  const code = 'MALFORMED_REQUEST';
  exact(value, ['schemaVersion','requestId','schoolId','action','resource'],
    ['operationId','expectedAuthorityRevision'], code);
  version(value.schemaVersion);
  requireValue(id(value.requestId) && id(value.schoolId) && ACTIONS.includes(value.action), code);
  exact(value.resource, ['domain','schoolId'], ['resourceId'], code);
  requireValue(value.resource.domain === 'deploy' && id(value.resource.schoolId) &&
    (value.resource.resourceId === undefined || id(value.resource.resourceId)), code);
  requireValue(value.action === 'deploy.read' || id(value.operationId), code);
  requireValue(value.operationId === undefined || id(value.operationId), code);
  requireValue(value.expectedAuthorityRevision === undefined ||
    (typeof value.expectedAuthorityRevision === 'string' && /^[a-f0-9]{64}$/.test(value.expectedAuthorityRevision)), code);
  return freeze(copy(value));
}
/** Provider deadline is a local safety bound, not the T1D transport implementation. */
export async function callProvider(provider, request, timeoutMs = 1000) {
  requireValue(typeof provider === 'function', 'AUTHORITY_UNAVAILABLE');
  requireValue(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000,
    'AUTHORITY_UNAVAILABLE');
  let timer;
  try {
    return copy(await Promise.race([
      Promise.resolve().then(() => provider(freeze(copy(request)))),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new ContractError('PROVIDER_TIMEOUT')), timeoutMs); }),
    ]));
  } finally { clearTimeout(timer); }
}
export function envelope(value, query, now) {
  requireValue(object(value)); version(value.schemaVersion);
  requireValue(value.schoolId === query.schoolId, 'SCHOOL_MISMATCH');
  requireValue(value.evaluationId === query.evaluationId && value.current === true &&
    instant(value.asOf) && value.asOf >= query.requestedAt && value.asOf <= now &&
    id(value.revision) && instant(value.sequence));
}
export function interval(value) {
  exact(value, ['value','validFrom','validUntil','revoked']);
  requireValue(typeof value.value === 'boolean' && typeof value.revoked === 'boolean' &&
    instant(value.validFrom) && (value.validUntil === null ||
      (instant(value.validUntil) && value.validUntil > value.validFrom)));
}
export function effective(value, now) {
  return value.value && !value.revoked && value.validFrom <= now &&
    (value.validUntil === null || now < value.validUntil);
}
export async function digest(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
}
