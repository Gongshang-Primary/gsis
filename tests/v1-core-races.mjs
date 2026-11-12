import assert from 'node:assert/strict';
import { createAuthority } from '../v1/core/authority.mjs';
import { fixture, runCases } from './v1-core-authority.mjs';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
await runCases([
  ['A13 revoke during preparation, wait and retry: zero synthetic writes', async () => {
    for (const change of ['smc','eo','session','account']) {
      const f = fixture(), prepared = deferred(), resume = deferred(); let writes = 0;
      const consume = async () => {
        const initial = await f.authority.resolveAuthority(f.request, f.context);
        assert.equal(initial.outcome, 'allow'); prepared.resolve(); await resume.promise;
        for (let attempt = 0; attempt < 2; attempt++) {
          const final = await f.authority.revalidateAuthority(f.request, initial, f.context);
          if (final.outcome === 'allow') writes++;
        }
      };
      const consumer = consume(); await prepared.promise;
      if (change === 'session') { f.state.session.revoked = true; f.bumpCore(); }
      else if (change === 'account') { f.state.account.suspended = true; f.bumpCore(); }
      else { f.state.facts[change].revoked = true; f.bumpContacts(); }
      resume.resolve(); await consumer; assert.equal(writes, 0);
    }
  }],
  ['A14 linkage, policy and source revisions invalidate previous authority', async () => {
    for (const change of ['linkage','policy','source','field']) {
      const f = fixture(); let policyChanged = false;
      const a = createAuthority({ ...f.options, readCore: async q => ({ ...await f.readCore(q),
        ...(policyChanged ? { policyVersion: 'deploy-capabilities/2' } : {}) }) });
      const first = await a.resolveAuthority(f.request, f.context); assert.equal(first.outcome, 'allow');
      if (change === 'linkage') { f.state.account.staffId = 'staff-b'; f.state.account.linkageRevision = 'link-2'; f.bumpCore(); }
      if (change === 'policy') { policyChanged = true; f.bumpCore(); }
      if (change === 'source') f.bumpContacts();
      if (change === 'field') { f.state.fieldRevisions.eo = 'eo-2'; f.bumpContacts(); }
      const final = await a.revalidateAuthority(f.request, first, f.context);
      assert.equal(final.reasonCode, 'AUTHORITY_CHANGED');
    }
  }],
  ['A14 Core changes while Contacts waits are rejected', async () => {
    const f = fixture(), arrived = deferred(), resume = deferred();
    const a = createAuthority({ ...f.options, readContacts: async q => {
      arrived.resolve(); await resume.promise; return f.readContacts(q);
    } });
    const pending = a.resolveAuthority(f.request, f.context); await arrived.promise;
    f.state.session.revoked = true; f.bumpCore(); resume.resolve();
    assert.equal((await pending).outcome, 'deny');
  }],
  ['A14 concurrent resources allow while same-binding older evaluations reject', async () => {
    for (const differentResource of [true, false]) {
      const f = fixture(), arrived = deferred(), resume = deferred(); let first = true;
      const a = createAuthority({ ...f.options, readContacts: async q => {
        const snapshot = await f.readContacts(q);
        if (first) { first = false; arrived.resolve(); await resume.promise; }
        return snapshot;
      } });
      const request = { ...f.request, action: 'deploy.read' };
      const older = a.resolveAuthority(request, f.context); await arrived.promise;
      // Keep provider sequences/content unchanged: same-binding rejection must
      // come from overlap ordering, not from a newer evidence watermark.
      const newer = await a.resolveAuthority({ ...request, requestId: 'newer',
        resource: { ...request.resource, resourceId: differentResource ? 'plan-2' : 'plan-1' } }, f.context);
      resume.resolve(); const delayed = await older;
      assert.equal(newer.outcome, 'allow');
      assert.equal(delayed.outcome, differentResource ? 'allow' : 'deny');
      assert.equal(delayed.reasonCode, differentResource ? 'CAPABILITY_ALLOWED' : 'AUTHORITY_CHANGED');
    }
  }],
  ['A14 older delayed response cannot replace newer evidence', async () => {
    const f = fixture(), arrived = deferred(), resume = deferred(); let first = true;
    const a = createAuthority({ ...f.options, readContacts: async q => {
      const snapshot = await f.readContacts(q);
      if (first) { first = false; arrived.resolve(); await resume.promise; }
      return snapshot;
    } });
    const older = a.resolveAuthority(f.request, f.context); await arrived.promise;
    f.bumpContacts();
    assert.equal((await a.resolveAuthority({ ...f.request, requestId: 'newer' }, f.context)).outcome, 'allow');
    resume.resolve(); assert.equal((await older).reasonCode, 'AUTHORITY_CHANGED');
  }],
  ['A15 effective instant changes without source revision change', async () => {
    const f = fixture(); f.state.facts.eo.validUntil = f.state.now + 1;
    const old = await f.authority.resolveAuthority(f.request, f.context); assert.equal(old.outcome, 'allow');
    f.state.now++;
    assert.equal((await f.authority.revalidateAuthority(f.request, old, f.context)).reasonCode, 'CAPABILITY_DENIED');
    const g = fixture(); g.state.facts.smc.validFrom = g.state.now + 1;
    assert.equal((await g.authority.resolveAuthority(g.request, g.context)).outcome, 'deny');
    g.state.now++;
    assert.equal((await g.authority.resolveAuthority(g.request, g.context)).outcome, 'allow');
  }],
  ['A15 grant/session expiration during provider waits', async () => {
    for (const kind of ['admin','session']) {
      const f = fixture(); f.state.account.globalAdmin.value = true;
      if (kind === 'admin') f.state.account.globalAdmin.validUntil = f.state.now + 1;
      else { f.state.now = f.state.session.expiresAt - 1; }
      let count = 0;
      const a = createAuthority({ ...f.options, readCore: async q => {
        if (++count === 2) f.state.now++;
        return f.readCore(q);
      } });
      assert.notEqual((await a.resolveAuthority(f.request, f.context)).outcome, 'allow');
    }
  }],
  ['A13 unresolved check-to-commit interval is demonstrated, not hidden', async () => {
    const f = fixture(), initial = await f.authority.resolveAuthority(f.request, f.context);
    const final = await f.authority.revalidateAuthority(f.request, initial, f.context);
    assert.equal(final.outcome, 'allow');
    f.state.facts.smc.revoked = true; f.bumpContacts();
    // Counterexample: a consumer that treats a prior allow as a lease could write here.
    let unsafeWrites = 0; if (final.outcome === 'allow') unsafeWrites++;
    assert.equal(unsafeWrites, 1);
    assert.equal((await f.authority.revalidateAuthority(f.request, final, f.context)).outcome, 'deny');
    console.log('LIMITATION: post-check revocation cannot fence a separate consumer commit; live integration remains gated.');
  }],
  ['revalidation binds actual issued decision, operation, resource, actor and school', async () => {
    const f = fixture(), old = await f.authority.resolveAuthority(f.request, f.context);
    assert.equal((await f.authority.revalidateAuthority(f.request, undefined, f.context)).reasonCode, 'AUTHORITY_CHANGED');
    assert.equal((await f.authority.revalidateAuthority(f.request, structuredClone(old), f.context)).reasonCode, 'AUTHORITY_CHANGED');
    for (const patch of [{ operationId: 'other-operation' }, { action: 'deploy.edit' },
      { resource: { ...f.request.resource, resourceId: 'other-resource' } }])
      assert.equal((await f.authority.revalidateAuthority({ ...f.request, ...patch }, old, f.context)).reasonCode, 'AUTHORITY_CHANGED');
    assert.equal((await f.authority.revalidateAuthority({ ...f.request, expectedAuthorityRevision: '0'.repeat(64) }, old, f.context)).reasonCode, 'AUTHORITY_CHANGED');
    assert.equal((await f.authority.revalidateAuthority({ ...f.request, requestId: 'retry-2', expectedAuthorityRevision: old.authorityRevision }, old, f.context)).outcome, 'allow');
    const reorderedRequest = { ...f.request, resource: Object.fromEntries(Object.entries(f.request.resource).reverse()) };
    assert.equal((await f.authority.revalidateAuthority(reorderedRequest, old, f.context)).outcome, 'allow');
    const g = fixture(); let reads = 0;
    function reverse(value) {
      if (Array.isArray(value)) return value.map(reverse);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([k,v]) => [k,reverse(v)]));
      return value;
    }
    const a = createAuthority({ ...g.options, readCore: async q => {
      const record = await g.readCore(q); return ++reads % 2 ? record : reverse(record);
    } });
    const decision = await a.resolveAuthority(g.request, g.context);
    assert.equal(decision.outcome, 'allow', 'JSON key order is not an authority change');
    assert.equal((await a.revalidateAuthority(g.request, decision, g.context)).outcome, 'allow');
    g.state.account.linkageRevision = 'changed-without-sequence';
    assert.equal((await a.revalidateAuthority(g.request, decision, g.context)).reasonCode, 'AUTHORITY_CHANGED');
  }],
]);
