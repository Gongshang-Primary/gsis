import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parse} from 'acorn';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tests=['v1-authority-evidence-missing.mjs','v1-authority-evidence-missing-isolation.mjs'];
const allowed=['v1/core/contracts.mjs','v1/contacts/core-provider.mjs',...tests.map(n=>`tests/${n}`),
  'docs/v1/core/T1A_CONTRACT.md','docs/v1/contacts/T1B_CONTRACT.md','docs/coordination/tasks/v1-authority-evidence-missing.md','docs/coordination/LANES.md'];
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const env={...process.env};delete env.GSIS_TEST_SHARD_INDEX;delete env.GSIS_TEST_SHARD_TOTAL;
const list=(extra={})=>JSON.parse(execFileSync(process.execPath,['tests/run.cjs','--list'],{cwd:root,env:{...env,...extra},encoding:'utf8'}));
const all=list();for(const file of tests)assert(all.includes(file));
const shards=[1,2,3,4].flatMap(i=>list({GSIS_TEST_SHARD_INDEX:String(i),GSIS_TEST_SHARD_TOTAL:'4'}));
assert.deepEqual(shards.sort(),[...all].sort());assert.equal(new Set(shards).size,all.length);
console.log(`PASS runner discovers both Package A tests; ${all.length} programs partition exactly across four shards`);
const sources=['v1/core','v1/contacts'].flatMap(dir=>readdirSync(path.join(root,dir)).filter(f=>f.endsWith('.mjs')).map(f=>`${dir}/${f}`));
for(const file of sources) {
  const ast=parse(readFileSync(path.join(root,file),'utf8'),{ecmaVersion:'latest',sourceType:'module'});
  function visit(n) {
    if(!n||typeof n!=='object')return;
    if(n.type==='ImportDeclaration')assert(sources.includes(path.posix.normalize(path.posix.join(path.posix.dirname(file),n.source.value))));
    assert.notEqual(n.type,'ImportExpression');
    if(n.type==='Identifier')assert(!['fetch','WebSocket','XMLHttpRequest','D1Database','process','require','eval','Function'].includes(n.name));
    for(const value of Object.values(n))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
  }
  visit(ast);
}
console.log('PASS Core/Contacts static imports remain isolated, no transport or store introduced');
const base=process.env.AUTHORITY_MISSING_BASE_SHA || (process.env.GITHUB_REF==='refs/heads/codex/v1-authority-evidence-missing'?'e996dfdb3a69bee76355ba60500468679d0963de':null);
if(base) {
  const changed=[...git('diff','--name-only',base).split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean);
  for(const file of changed)assert(allowed.includes(file),`Out of scope: ${file}`);
  for(const file of ['v1/core/authority.mjs','v1/core/audit.mjs','tests/run.cjs','package.json','package-lock.json','.github','scripts',
    ...readdirSync(path.join(root,'tests')).filter(n=>/^v1-(core|contacts)-.*\.mjs$/.test(n)).map(n=>`tests/${n}`)])assert.equal(git('diff',base,'--',file),'',file);
  console.log(`PASS exact eight-path task scope against ${base}; original tests/runner and Core authority/audit unchanged`);
} else console.log('Task diff gate omitted outside Package A review context; permanent discovery/dependency checks pass.');
