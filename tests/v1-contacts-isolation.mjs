import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'acorn';
import {assert,cases} from './v1-contacts-contracts.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=['contracts','accepted-facts','catalogues','core-provider'].map(n=>`v1/contacts/${n}.mjs`);
const tests=['contracts','snapshots','catalogues','core-provider','races','recovery','isolation'].map(n=>`tests/v1-contacts-${n}.mjs`);
const allowed=[...source,...tests,'docs/v1/contacts/T1B_CONTRACT.md','docs/coordination/tasks/v1-contacts-t1b.md','docs/coordination/LANES.md'];
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
await cases([
  ['B12 static dependency boundary: library has no production imports or IO',async()=>{
    for(const file of source) {
      const ast=parse(readFileSync(path.join(root,file),'utf8'),{ecmaVersion:'latest',sourceType:'module'});
      function visit(n) {
        if(!n||typeof n!=='object')return;
        if(n.type==='ImportDeclaration') {
          const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),n.source.value));
          assert([...source,'v1/core/contracts.mjs'].includes(resolved),`${file}: ${resolved}`);
        }
        assert.notEqual(n.type,'ImportExpression');
        if(n.type==='Identifier')assert(!['fetch','WebSocket','XMLHttpRequest','D1Database','process','require','eval','Function'].includes(n.name),`${file}: ${n.name}`);
        for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);
      }
      visit(ast);
    }
  }],
  ['B12 unchanged runner discovers all seven tests; shard coverage is exact',async()=>{
    const env={...process.env};delete env.GSIS_TEST_SHARD_INDEX;delete env.GSIS_TEST_SHARD_TOTAL;
    const select=(extra={})=>JSON.parse(execFileSync(process.execPath,['tests/run.cjs','--list'],{cwd:root,env:{...env,...extra},encoding:'utf8'}));
    const all=select();for(const file of tests)assert(all.includes(path.basename(file)),file);
    const shards=[1,2,3,4].flatMap(i=>select({GSIS_TEST_SHARD_INDEX:String(i),GSIS_TEST_SHARD_TOTAL:'4'}));
    assert.deepEqual(shards.sort(),[...all].sort());assert.equal(new Set(shards).size,all.length);
    console.log(`Runner selects ${all.length} programs, including seven T1B files.`);
  }],
  ['B12 task-scoped allowlist and unchanged Core/production baseline',async()=>{
    const base=process.env.T1B_BASE_SHA || (process.env.GITHUB_REF==='refs/heads/codex/v1-contacts-t1b'?'620010fb85c4d90b498d15724250af1d86a469c5':null);
    if(!base){console.log('Task diff gate omitted outside T1B review context.');return;}
    const changed=[...git('diff','--name-only',base).split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean);
    for(const name of changed)assert(allowed.includes(name),`Out of scope: ${name}`);
    assert.equal(git('diff',base,'--','v1/core','tests/v1-core-*.mjs','docs/v1/core/T1A_CONTRACT.md','tests/run.cjs','package.json','package-lock.json','.github','scripts'),'');
    console.log(`Exact 14-path scope checked against ${base}.`);
  }],
]);
