import assert from 'node:assert/strict';
import { createGoogleIdentityVerifier } from '../v1/core/google-identity.mjs';
import { fixture, main, runCases } from './v1-core-authority.mjs';

export async function identityFixture() {
  const f = fixture();
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign','verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'key-1', alg: 'RS256', use: 'sig' };
  const config = { schoolId: 'school-a', audience: 'synthetic.apps.googleusercontent.com', hostedDomain: 'school.example' };
  const claims = { iss: 'https://accounts.google.com', aud: config.audience, sub: 'subject-a',
    email: 'teacher@school.example', email_verified: true, hd: config.hostedDomain,
    iat: Math.floor(f.state.now / 1000), exp: Math.floor(f.state.now / 1000) + 3600 };
  async function sign(patch = {}, headerPatch = {}) {
    const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const input = `${enc({ alg: 'RS256', kid: 'key-1', typ: 'JWT', ...headerPatch })}.${enc({ ...claims, ...patch })}`;
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(input));
    return `${input}.${Buffer.from(signature).toString('base64url')}`;
  }
  const verify = createGoogleIdentityVerifier({ clock: f.clock, getSigningKeys: async () => ({ keys: [jwk] }) });
  return { ...f, claims, config, sign, verify, jwk };
}
if (main(import.meta.url)) await runCases([
  ['A01 real RS256 verification; identical email never links another subject', async () => {
    const f = await identityFixture(); const result = await f.verify(await f.sign(), f.config);
    assert.equal(result.outcome, 'allow'); assert.equal(result.identity.subject, 'subject-a');
    assert(!JSON.stringify(result).includes('teacher@'));
    const other = await f.verify(await f.sign({ sub: 'other-subject' }), f.config);
    assert.equal(other.outcome, 'allow'); assert.notEqual(other.identity.subject, result.identity.subject);
    const { createSessionPolicy } = await import('../v1/core/session-policy.mjs');
    const session = createSessionPolicy({ clock: f.clock, verifyGoogleIdentity: f.verify });
    assert.equal((await session.reauthenticate(await f.sign({ sub: 'other-subject' }), f.config, f.state.account)).outcome, 'deny');
  }],
  ['A02 signature, algorithm, issuer, audience, subject and token times', async () => {
    const f = await identityFixture(); const token = await f.sign();
    const parts = token.split('.'); const bytes = Buffer.from(parts[2], 'base64url'); bytes[0] ^= 1;
    assert.equal((await f.verify(`${parts[0]}.${parts[1]}.${bytes.toString('base64url')}`, f.config)).outcome, 'deny');
    for (const patch of [{ iss: 'https://evil.example' }, { aud: 'other' }, { azp: 'other' }, { sub: '' },
      { exp: f.claims.iat }, { exp: 'later' }, { iat: f.claims.iat + 1 }, { nbf: f.claims.iat + 1 },
      { iat: -1 }, { exp: null }, { sub: undefined }])
      assert.equal((await f.verify(await f.sign(patch), f.config)).outcome, 'deny', JSON.stringify(patch));
    for (const patch of [{ alg: 'none' }, { alg: 'HS256' }, { jku: 'https://evil.example/key' }, { crit: ['x'] }])
      assert.equal((await f.verify(await f.sign({}, patch), f.config)).outcome, 'deny');
    for (const bad of ['', 'a.b.c', token + '=', 'x'.repeat(17000)])
      assert.equal((await f.verify(bad, f.config)).outcome, 'deny');
    const unavailable = createGoogleIdentityVerifier({ clock: f.clock, getSigningKeys: async () => { throw Error('offline'); } });
    assert.equal((await unavailable(token, f.config)).reasonCode, 'SIGNING_KEYS_UNAVAILABLE');
    const duplicate = createGoogleIdentityVerifier({ clock: f.clock, getSigningKeys: async () => ({ keys: [f.jwk,f.jwk] }) });
    assert.equal((await duplicate(token, f.config)).outcome, 'unavailable');
  }],
  ['A03 Workspace domain and email verification', async () => {
    const f = await identityFixture();
    for (const patch of [{ hd: undefined }, { hd: 'evil.example' }, { email_verified: false }, { email_verified: 'true' },
      { email: 'teacher@school.example.evil' }, { email: 'teacher@sch00l.example' }, { email: 'teacher@gmail.com' }])
      assert.equal((await f.verify(await f.sign(patch), f.config)).outcome, 'deny');
  }],
]);
