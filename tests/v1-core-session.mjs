import assert from 'node:assert/strict';
import { createSessionPolicy, SESSION_DURATION_MS } from '../v1/core/session-policy.mjs';
import { fixture, runCases } from './v1-core-authority.mjs';
import { identityFixture } from './v1-core-identity.mjs';
await runCases([
  ['A04 exact ten-day absolute boundary; no activity extension', async () => {
    const f = fixture(), policy = createSessionPolicy({ clock: f.clock });
    const original = structuredClone(f.state.session);
    for (const offset of [-1,0,1]) {
      f.state.now = original.expiresAt + offset;
      assert.equal(policy.validateSession(original, f.state.account).outcome, offset < 0 ? 'allow' : 'deny');
    }
    f.state.now = original.expiresAt - 1;
    for (let i = 0; i < 5; i++) assert.equal(policy.validateSession(original, f.state.account).expiresAt, original.expiresAt);
    assert.deepEqual(original, f.state.session);
    assert.equal(original.expiresAt - original.authenticatedAt, SESSION_DURATION_MS);
    assert.equal(policy.validateSession({ ...original, expiresAt: original.expiresAt + 1 }, f.state.account).reasonCode, 'SESSION_INVALID');
    assert.equal(policy.validateSession({ ...original, lastActivityAt: f.state.now }, f.state.account).reasonCode, 'SESSION_INVALID');
  }],
  ['A05 fresh Google reauthentication only; failed reauth cannot revive expired session', async () => {
    const f = await identityFixture(); f.state.session.expiresAt = f.state.now;
    f.state.session.authenticatedAt = f.state.now - SESSION_DURATION_MS;
    const policy = createSessionPolicy({ clock: f.clock, verifyGoogleIdentity: f.verify });
    const old = structuredClone(f.state.session);
    assert.equal(policy.validateSession(old, f.state.account).reasonCode, 'SESSION_EXPIRED');
    const renewed = await policy.reauthenticate(await f.sign(), f.config, f.state.account);
    assert.equal(renewed.outcome, 'allow'); assert.equal(renewed.authenticatedAt, f.state.now);
    assert.equal(renewed.expiresAt, f.state.now + SESSION_DURATION_MS);
    assert.equal((await policy.reauthenticate(await f.sign({ exp: f.claims.iat }), f.config, f.state.account)).outcome, 'deny');
    assert.deepEqual(old, f.state.session); assert.equal(policy.validateSession(old, f.state.account).outcome, 'deny');
  }],
  ['A08 session subject binding, account suspension and revocation', async () => {
    const f = fixture(), p = createSessionPolicy({ clock: f.clock });
    assert.equal(p.validateSession(f.state.session, { ...f.state.account, subject: 'another' }).reasonCode, 'IDENTITY_INVALID');
    assert.equal(p.validateSession(f.state.session, { ...f.state.account, suspended: true }).reasonCode, 'ACCOUNT_SUSPENDED');
    assert.equal(p.validateSession({ ...f.state.session, revoked: true }, f.state.account).reasonCode, 'SESSION_REVOKED');
  }],
]);
