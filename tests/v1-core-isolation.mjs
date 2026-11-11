import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createAuthority } from '../v1/core/authority.mjs';
import { createSecurityAudit } from '../v1/core/audit.mjs';
import { fixture, runCases } from './v1-core-authority.mjs';
const files = ['v1/core/contracts.mjs','v1/core/google-identity.mjs','v1/core/session-policy.mjs','v1/core/authority.mjs','v1/core/audit.mjs',
  'docs/v1/core/T1A_CONTRACT.md','tests/v1-core-identity.mjs','tests/v1-core-session.mjs','tests/v1-core-authority.mjs',
  'tests/v1-core-races.mjs','tests/v1-core-isolation.mjs','docs/coordination/tasks/v1-core-t1a.md'];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
// The PR diff check is a task gate, not a permanent freeze on unrelated development.
const taskBase = process.env.T1A_BASE_SHA || (process.env.GITHUB_REF === 'refs/heads/codex/v1-core-t1a'
  ? 'c4c1de8aed5c9f062cbdc7e6ed83deb721fbb3c3' : null);
if (taskBase) assert.match(taskBase, /^[a-f0-9]{40}$/);
await runCases([
  ['A11 foreign-school boundaries fail without disclosure', async () => {
    for (const foreign of ['request','resource','context','account','session','facts','preview','grant']) {
      const f = fixture(); let options = f.options;
      if (foreign === 'request') f.request.schoolId = 'foreign';
      if (foreign === 'resource') f.request.resource.schoolId = 'foreign';
      if (foreign === 'context') f.context.schoolId = 'foreign';
      if (foreign === 'account') f.state.account.schoolId = 'foreign';
      if (foreign === 'session') f.state.session.schoolId = 'foreign';
      if (foreign === 'facts') options = { ...options, readContacts: async q => ({ ...await f.readContacts(q), schoolId: 'foreign' }) };
      if (foreign === 'preview' || foreign === 'grant') {
        f.preview(); f.request.action = 'deploy.read';
        if (foreign === 'preview') f.state.previewAccount.schoolId = 'foreign'; else f.state.previewGrant.schoolId = 'foreign';
      }
      const r = await createAuthority(options).resolveAuthority(f.request, f.context);
      assert.equal(r.outcome, 'deny', foreign); assert.equal(r.reasonCode, 'SCHOOL_MISMATCH', foreign);
      assert(!JSON.stringify(r).includes('foreign')); assert(!('staffId' in r));
    }
    const f = fixture(), other = fixture();
    const old = await f.authority.resolveAuthority(f.request, f.context);
    assert.equal((await other.authority.revalidateAuthority(other.request, old, other.context)).reasonCode, 'AUTHORITY_CHANGED');
  }],
  ['A17 audit projects actor/preview but no credentials or private staff fields', async () => {
    const f = fixture(); const event = { schemaVersion: 1, kind: 'impersonation-denial', eventId: 'event-1', requestId: 'request-1',
      operationId: 'op-1', schoolId: 'school-a', actorAccountId: 'account-a', previewAccountId: 'preview-a',
      action: 'deploy.publish', outcome: 'deny', reasonCode: 'IMPERSONATION_DENIED', policyVersion: 'deploy-capabilities/1',
      coreRevision: 'core-1', contactsRevision: 'contacts-1', evaluatedAt: f.state.now,
      token: 'PRIVATE', cookie: 'PRIVATE', mobile: 'PRIVATE', statutoryName: 'PRIVATE', contacts: { secret: 'PRIVATE' }, recordedAt: 0 };
    const audit = createSecurityAudit({ clock: f.clock }); const projected = audit.projectSecurityAudit(event);
    assert.equal(projected.actorAccountId, 'account-a'); assert.equal(projected.previewAccountId, 'preview-a');
    assert.equal(projected.recordedAt, f.state.now); assert(!JSON.stringify(projected).includes('PRIVATE'));
    assert.equal((await audit.recordSecurityAudit(event)).persisted, false);
    const confirmed = createSecurityAudit({ clock: f.clock, sink: async p => ({ schemaVersion: 1, eventId: p.eventId, persisted: true }) });
    assert.equal((await confirmed.recordSecurityAudit(event)).persisted, true);
    for (const sink of [async () => { throw Error('secret'); }, async () => ({ persisted: true }), async () => new Promise(() => {})]) {
      assert.equal((await createSecurityAudit({ clock: f.clock, sink, timeoutMs: 5 }).recordSecurityAudit(event)).persisted, false);
    }
    assert.throws(() => audit.projectSecurityAudit({ ...event, schemaVersion: 2 }));
    assert.throws(() => audit.projectSecurityAudit({ ...event, kind: 'all-staff-export' }));
    for (const key of ['actorAccountId','previewAccountId','operationId']) {
      const incomplete = { ...event }; delete incomplete[key];
      assert.throws(() => audit.projectSecurityAudit(incomplete), key);
    }
    const privileged = { ...event, kind: 'privileged-decision', outcome: 'allow', reasonCode: 'CAPABILITY_ALLOWED' };
    assert.equal(audit.projectSecurityAudit(privileged).outcome, 'allow');
    for (const key of ['actorAccountId','policyVersion','coreRevision']) {
      const incomplete = { ...privileged }; delete incomplete[key];
      assert.throws(() => audit.projectSecurityAudit(incomplete), key);
    }
    assert.throws(() => audit.projectSecurityAudit({ ...privileged, outcome: 'deny' }));
  }],
  ['A18 existing runner discovers all five new tests without changing selection', async () => {
    const inventoryEnv = { ...process.env };
    delete inventoryEnv.GSIS_TEST_SHARD_INDEX; delete inventoryEnv.GSIS_TEST_SHARD_TOTAL;
    const list = env => JSON.parse(execFileSync(process.execPath, ['tests/run.cjs','--list'], { encoding: 'utf8', env }));
    const selected = list(inventoryEnv);
    const shards = [1,2,3,4].flatMap(index => list({ ...inventoryEnv,
      GSIS_TEST_SHARD_INDEX: String(index), GSIS_TEST_SHARD_TOTAL: '4' }));
    assert.equal(new Set(shards).size, shards.length, 'shards must not duplicate programs');
    assert.deepEqual([...shards].sort(), [...selected].sort(), 'shards must cover the exact full inventory');
    for (const file of files.filter(f => f.startsWith('tests/'))) assert(selected.includes(file.slice(6)), file);
    if (taskBase) {
    const base = taskBase;
    const currentRunner = readFileSync('tests/run.cjs','utf8');
    assert.equal(currentRunner, execFileSync('git', ['show',`${base}:tests/run.cjs`], { encoding: 'utf8' }));
    const before = git('ls-tree','-r','--name-only',base,'tests').split('\n').filter(f => /\.(mjs|cjs)$/.test(f));
    const tracked = new Set(git('ls-files').split('\n'));
    for (const path of before) assert(tracked.has(path), `existing test deleted: ${path}`);
    }
    console.log(`Runner selects ${selected.length} programs; all existing test files and runner retained.`);
  }],
  ['A18 dependency isolation and requested PR allowlist', async () => {
    if (taskBase) {
    const base = taskBase;
    const allowed = new Set([...files, 'docs/coordination/LANES.md']);
    const changes = git('diff','--name-only',base).split('\n').filter(Boolean);
    const untracked = git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean);
    for (const file of [...changes,...untracked]) assert(allowed.has(file), `outside allowlist: ${file}`);
    console.log('T1A exact diff allowlist verified against', base);
    } else console.log('T1A diff scope not requested; permanent dependency isolation remains checked.');
    const acorn = await import('acorn');
    for (const file of files.filter(f => f.startsWith('v1/core/'))) {
      const source = readFileSync(file, 'utf8'); const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
      function walk(node) {
        if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;
        if (node.type === 'ImportDeclaration' || (node.type.startsWith('Export') && node.source))
          assert(/^\.\/(contracts|google-identity|session-policy|authority|audit)\.mjs$/.test(node.source.value), `${file}: foreign import`);
        assert(!['ImportExpression'].includes(node.type), `${file}: dynamic import`);
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier')
          assert(!['require','fetch','eval'].includes(node.callee.name), `${file}: production IO or eval`);
        for (const child of Object.values(node)) if (Array.isArray(child)) child.forEach(walk); else walk(child);
      }
      walk(ast);
    }
    for (const path of git('ls-files').split('\n').filter(p => /\.(mjs|cjs|js|gs|json|toml|ya?ml)$/.test(p) && !p.startsWith('tests/') && !p.startsWith('v1/'))) {
      assert(!readFileSync(path,'utf8').includes('v1/core'), `production references Core: ${path}`);
    }
  }],
]);
