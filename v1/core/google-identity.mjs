import { callProvider, exact, failure, freeze, id, instant, requireValue, serverNow } from './contracts.mjs';

function decode(segment) {
  requireValue(typeof segment === 'string' && /^[A-Za-z0-9_-]+$/.test(segment), 'IDENTITY_INVALID');
  const raw = atob(segment.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  requireValue(btoa(raw).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') === segment,
    'IDENTITY_INVALID');
  return bytes;
}
function json(segment) { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(segment))); }

/** Keys and configuration come from trusted server construction, never token URLs. */
export function createGoogleIdentityVerifier({ clock, getSigningKeys, timeoutMs = 1000 } = {}) {
  return async function verifyGoogleIdentity(token, trustedSchoolConfig) {
    let now;
    try {
      now = serverNow(clock);
      exact(trustedSchoolConfig, ['schoolId','audience','hostedDomain']);
      const { schoolId, audience, hostedDomain } = trustedSchoolConfig;
      requireValue(id(schoolId) && typeof audience === 'string' && audience.length > 0 && audience.length <= 256 &&
        typeof hostedDomain === 'string' && /^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(hostedDomain));
      requireValue(typeof token === 'string' && token.length <= 16384, 'IDENTITY_INVALID');
      const parts = token.split('.'); requireValue(parts.length === 3, 'IDENTITY_INVALID');
      const header = json(parts[0]);
      exact(header, ['alg','kid'], ['typ'], 'IDENTITY_INVALID');
      requireValue(header.alg === 'RS256' && id(header.kid) &&
        (header.typ === undefined || header.typ === 'JWT'), 'IDENTITY_INVALID');
      let jwks;
      try { jwks = await callProvider(getSigningKeys, { schoolId }, timeoutMs); }
      catch { return freeze({ schemaVersion: 1, outcome: 'unavailable', reasonCode: 'SIGNING_KEYS_UNAVAILABLE', retryable: true }); }
      requireValue(jwks && Array.isArray(jwks.keys) && jwks.keys.length <= 32, 'SIGNING_KEYS_UNAVAILABLE');
      const matches = jwks.keys.filter(k => k?.kid === header.kid);
      requireValue(matches.length === 1, 'SIGNING_KEYS_UNAVAILABLE');
      const jwk = matches[0];
      requireValue(jwk.kty === 'RSA' && jwk.alg === 'RS256' && jwk.use === 'sig' &&
        typeof jwk.n === 'string' && typeof jwk.e === 'string' && !('d' in jwk), 'SIGNING_KEYS_UNAVAILABLE');
      requireValue(decode(jwk.n).length >= 256, 'SIGNING_KEYS_UNAVAILABLE');
      let key;
      try { key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e,
        alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']); }
      catch { return freeze({ schemaVersion: 1, outcome: 'unavailable', reasonCode: 'SIGNING_KEYS_UNAVAILABLE', retryable: true }); }
      requireValue(key.algorithm.modulusLength >= 2048, 'SIGNING_KEYS_UNAVAILABLE');
      const verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
      requireValue(verified, 'IDENTITY_INVALID');
      const claims = json(parts[1]);
      now = serverNow(clock);
      requireValue(claims && ['accounts.google.com','https://accounts.google.com'].includes(claims.iss) &&
        claims.aud === audience && (claims.azp === undefined || claims.azp === audience) &&
        typeof claims.sub === 'string' && /^[A-Za-z0-9_-]{1,255}$/.test(claims.sub), 'IDENTITY_INVALID');
      requireValue(instant(claims.iat) && instant(claims.exp) && instant(claims.exp * 1000) && claims.exp > claims.iat &&
        claims.iat <= Math.floor(now / 1000) && now / 1000 < claims.exp &&
        (claims.nbf === undefined || (instant(claims.nbf) && claims.nbf <= now / 1000 && claims.nbf < claims.exp)), 'IDENTITY_INVALID');
      requireValue(claims.hd === hostedDomain && claims.email_verified === true &&
        typeof claims.email === 'string' && claims.email.length <= 320 &&
        claims.email.split('@').length === 2 && claims.email.split('@')[0].length > 0 &&
        claims.email.split('@')[1].toLowerCase() === hostedDomain, 'IDENTITY_INVALID');
      return freeze({ schemaVersion: 1, outcome: 'allow', reasonCode: 'IDENTITY_VERIFIED', retryable: false,
        identity: { schoolId, issuer: 'https://accounts.google.com', subject: claims.sub },
        verifiedAt: now, tokenExpiresAt: claims.exp * 1000 });
    } catch (error) {
      // Decode/crypto exceptions carry no token or provider payload into the result.
      return freeze({ schemaVersion: 1, ...(error?.reasonCode ? failure(error) :
        { outcome: 'deny', reasonCode: 'IDENTITY_INVALID', retryable: false }) });
    }
  };
}
