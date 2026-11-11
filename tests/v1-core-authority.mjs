import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createAuthority } from '../v1/core/authority.mjs';
import { POLICY_VERSION, SESSION_DURATION_MS } from '../v1/core/contracts.mjs';

export async function runCases(cases) {
  for (const [name, run] of cases) { await run(); console.log(`PASS ${name}`); }
  console.log(`${cases.length}/${cases.length} cases passed`);
}
export function main(url) { return process.argv[1] && pathToFileURL(process.argv[1]).href === url; }
export function fixture() {
  const state = { now: 1800000000000, coreSequence: 1, contactsSequence: 1, coreRevision: 'core-1', contactsRevision: 'contacts-1' };
  const grant = (value = false) => ({ value, validFrom: 0, validUntil: null, revoked: false });
  state.account = { schoolId: 'school-a', accountId: 'account-a', issuer: 'https://accounts.google.com',
    subject: 'subject-a', identityVerified: true, identityUnique: true, suspended: false,
    linkage: 'unique', linkageRevision: 'link-1', staffId: 'staff-a', globalAdmin: grant() };
  state.session = { schemaVersion: 1, schoolId: 'school-a', sessionId: 'session-a', accountId: 'account-a',
    issuer: state.account.issuer, subject: state.account.subject, authenticatedAt: state.now - 1000,
    expiresAt: state.now - 1000 + SESSION_DURATION_MS, revoked: false };
  state.facts = { smc: grant(true), eo: grant(true), schoolLeader: grant() };
  state.fieldRevisions = { smc: 'smc-1', eo: 'eo-1', schoolLeader: 'sl-1' };
  state.previewAccount = null; state.previewGrant = null;
  const clock = () => state.now;
  const base = q => ({ schemaVersion: 1, schoolId: q.schoolId, evaluationId: q.evaluationId,
    current: true, asOf: state.now });
  const readCore = async q => structuredClone({ ...base(q), revision: state.coreRevision, sequence: state.coreSequence,
    policyVersion: POLICY_VERSION, account: state.account, session: state.session,
    previewAccount: state.previewAccount, previewGrant: state.previewGrant });
  const readContacts = async q => structuredClone({ ...base(q), revision: state.contactsRevision, sequence: state.contactsSequence,
    source: 'contacts', status: 'accepted', staffId: q.staffId, fieldRevisions: state.fieldRevisions, facts: state.facts });
  const context = { schemaVersion: 1, schoolId: 'school-a', serviceId: 'deploy', actorAccountId: 'account-a', sessionId: 'session-a' };
  const request = { schemaVersion: 1, requestId: 'request-1', schoolId: 'school-a', action: 'deploy.publish',
    operationId: 'operation-1', resource: { domain: 'deploy', schoolId: 'school-a', resourceId: 'plan-1' } };
  const options = { clock, schoolId: 'school-a', callers: [{ serviceId: 'deploy', schoolId: 'school-a',
    actions: ['deploy.read','deploy.edit','deploy.publish'] }], readCore, readContacts, timeoutMs: 100 };
  function preview() {
    context.previewAccountId = 'account-preview';
    state.previewAccount = { ...structuredClone(state.account), accountId: 'account-preview', subject: 'subject-preview', staffId: 'staff-preview' };
    state.previewGrant = { schoolId: 'school-a', actorAccountId: 'account-a', subjectAccountId: 'account-preview',
      revision: 'preview-1', permission: grant(true), fieldScope: ['deploy.planning'] };
  }
  return { state, clock, grant, context, request, options, readCore, readContacts, preview,
    authority: createAuthority(options), bumpCore() { state.coreSequence++; state.coreRevision = `core-${state.coreSequence}`; },
    bumpContacts() { state.contactsSequence++; state.contactsRevision = `contacts-${state.contactsSequence}`; } };
}

if (main(import.meta.url)) await runCases([
  ['A06 complete capability matrix', async () => {
    for (const [smc, eo, sl, admin, expected] of [
      [false,false,false,true,['allow','allow','allow']], [true,true,false,false,['allow','allow','allow']],
      [true,false,false,false,['allow','deny','deny']], [false,true,false,false,['deny','deny','deny']],
      [false,false,true,false,['deny','deny','deny']], [false,false,false,false,['deny','deny','deny']],
      [true,false,true,false,['allow','allow','allow']],
    ]) {
      for (const [i, action] of ['deploy.read','deploy.edit','deploy.publish'].entries()) {
        const f = fixture(); f.state.facts.smc.value = smc; f.state.facts.eo.value = eo;
        f.state.facts.schoolLeader.value = sl; f.state.account.globalAdmin.value = admin;
        assert.equal((await f.authority.resolveAuthority({ ...f.request, action }, f.context)).outcome, expected[i]);
      }
    }
  }],
  ['A07 effective future/expired/revoked SMC and Admin grants', async () => {
    for (const which of ['smc','eo','schoolLeader','admin']) for (const mode of ['future','expired','revoked']) {
      const f = fixture(); const g = which === 'admin' ? f.state.account.globalAdmin : f.state.facts[which];
      if (which === 'schoolLeader') f.state.facts.eo.value = false;
      g.value = true; if (which === 'admin') f.state.facts.smc.value = false;
      if (mode === 'future') g.validFrom = f.state.now + 1;
      if (mode === 'expired') g.validUntil = f.state.now;
      if (mode === 'revoked') g.revoked = true;
      assert.equal((await f.authority.resolveAuthority(f.request, f.context)).outcome, 'deny');
    }
  }],
  ['A08 suspension and session revocation defeat previous allow', async () => {
    for (const kind of ['suspended','revoked']) {
      const f = fixture(), old = await f.authority.resolveAuthority(f.request, f.context);
      assert.equal(old.outcome, 'allow');
      if (kind === 'suspended') f.state.account.suspended = true; else f.state.session.revoked = true;
      f.bumpCore();
      assert.equal((await f.authority.revalidateAuthority(f.request, old, f.context)).outcome, 'deny');
    }
  }],
  ['A09 invalid Contacts fails closed while independent Admin still works', async () => {
    const mutations = [v => ({ ...v, current: false }), v => ({ ...v, asOf: v.asOf - 1 }),
      v => ({ ...v, status: 'pending' }), v => ({ ...v, status: 'superseded' }),
      v => ({ ...v, staffId: 'wrong' }), v => ({ ...v, fieldRevisions: {} }),
      v => ({ ...v, source: 'deploy-draft' }), v => ({ ...v, facts: { ...v.facts, eo: { ...v.facts.eo, value: 'true' } } })];
    for (const mutate of mutations) for (const admin of [false,true]) {
      const f = fixture(); f.state.account.globalAdmin.value = admin; let calls = 0;
      const a = createAuthority({ ...f.options, readContacts: async q => { calls++; return mutate(await f.readContacts(q)); } });
      assert.equal((await a.resolveAuthority(f.request, f.context)).outcome, admin ? 'allow' : 'unavailable');
      if (admin) assert.equal(calls, 0);
    }
    for (const admin of [false,true]) {
      const f = fixture(); f.state.account.globalAdmin.value = admin;
      const a = createAuthority({ ...f.options, readContacts: async () => { throw Error('private payload'); } });
      assert.equal((await a.resolveAuthority(f.request, f.context)).outcome, admin ? 'allow' : 'unavailable');
    }
  }],
  ['A10 preview cannot mutate or union actor privileges', async () => {
    const f = fixture(); f.state.account.globalAdmin.value = true; f.preview();
    f.state.previewAccount.globalAdmin.value = false; f.state.facts.smc.value = false;
    for (const action of ['deploy.edit','deploy.publish'])
      assert.equal((await f.authority.resolveAuthority({ ...f.request, action }, f.context)).reasonCode, 'IMPERSONATION_DENIED');
    assert.equal((await f.authority.resolveAuthority({ ...f.request, action: 'deploy.read' }, f.context)).reasonCode, 'CAPABILITY_DENIED');
    f.state.facts.smc.value = true; f.bumpContacts();
    const read = await f.authority.resolveAuthority({ ...f.request, action: 'deploy.read' }, f.context);
    assert.equal(read.outcome, 'allow'); assert.equal(read.actorAccountId, 'account-a');
    assert.equal(read.subjectAccountId, 'account-preview'); assert.deepEqual(read.fieldScope, ['deploy.planning']);
    f.state.previewGrant.permission.revoked = true; f.bumpCore();
    assert.equal((await f.authority.resolveAuthority({ ...f.request, action: 'deploy.read' }, f.context)).reasonCode, 'IMPERSONATION_DENIED');
  }],
  ['A12 client roles, preview escape and draft flags rejected', async () => {
    const f = fixture();
    for (const key of ['roles','globalAdmin','isAdmin','verified','serviceId','evaluatedAt','impersonating','previewAccountId','draftMembership','pendingContributions'])
      assert.equal((await f.authority.resolveAuthority({ ...f.request, [key]: true }, f.context)).reasonCode, 'MALFORMED_REQUEST');
    for (const linkage of ['none','ambiguous']) {
      const g = fixture(); g.state.account.linkage = linkage; g.state.account.staffId = null;
      assert.equal((await g.authority.resolveAuthority(g.request, g.context)).reasonCode, 'IDENTITY_UNLINKED');
    }
    f.state.account.identityUnique = false;
    assert.equal((await f.authority.resolveAuthority(f.request, f.context)).reasonCode, 'IDENTITY_INVALID');
  }],
  ['A16 malformed requests, wrong service, version, provider timeout', async () => {
    const f = fixture();
    for (const patch of [{ action: 'root' }, { operationId: '' }, { requestId: 'x'.repeat(129) },
      { resource: { ...f.request.resource, role: 'admin' } }])
      assert.equal((await f.authority.resolveAuthority({ ...f.request, ...patch }, f.context)).reasonCode, 'MALFORMED_REQUEST');
    assert.equal((await f.authority.resolveAuthority({ ...f.request, schemaVersion: 2 }, f.context)).reasonCode, 'UNSUPPORTED_CONTRACT_VERSION');
    assert.equal((await f.authority.resolveAuthority(f.request, { ...f.context, serviceId: 'roster' })).reasonCode, 'SERVICE_DENIED');
    for (const readCore of [undefined, async () => null, async () => { throw Error('secret'); }, async () => new Promise(() => {})]) {
      const a = createAuthority({ ...f.options, readCore, timeoutMs: 5 });
      const r = await a.resolveAuthority(f.request, f.context);
      assert.equal(r.outcome, 'unavailable'); assert(!JSON.stringify(r).includes('secret'));
    }
  }],
]);
