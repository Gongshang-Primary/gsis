// Catch lost/duplicated programs, accidental empty green shards and swallowed child failures.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const vm=require('node:vm');

const repository=path.join(__dirname,'..');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'gsis-runner-shards-'));
const marker=path.join(fixture,'executed.jsonl');
const shardKeys=['GSIS_TEST_SHARD_INDEX','GSIS_TEST_SHARD_TOTAL'];
function run(root,args=[],extra={}){
 const env={...process.env,TZ:'Etc/UTC',GSIS_RUNNER_FIXTURE_LOG:marker};
 for(const key of shardKeys)delete env[key];
 Object.assign(env,extra);
 return spawnSync(process.execPath,[path.join(root,'tests/run.cjs'),...args],{cwd:root,env,encoding:'utf8',timeout:30000});
}
function list(root,extra={}){
 const result=run(root,['--list'],extra);
 assert.equal(result.status,0,`listing must succeed without executing children: ${result.stdout}\n${result.stderr}`);
 return JSON.parse(result.stdout);
}
function executed(){
 if(!fs.existsSync(marker))return [];
 return fs.readFileSync(marker,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
}
function clear(){fs.rmSync(marker,{force:true});}
try{
 fs.mkdirSync(path.join(fixture,'tests'));
 fs.writeFileSync(path.join(fixture,'package.json'),JSON.stringify({gsisRelease:'0.9.9'}));
 fs.copyFileSync(path.join(__dirname,'run.cjs'),path.join(fixture,'tests/run.cjs'));
 const expected=['aa-pass.cjs','bb-fail.cjs','cc-pass.mjs','dd-signal.cjs','ee-pass.cjs','roster-d1-mirror-integration.mjs'];
 for(const name of expected){
  const record=`fs.appendFileSync(process.env.GSIS_RUNNER_FIXTURE_LOG,JSON.stringify({name:${JSON.stringify(name)},tz:process.env.TZ})+'\\n');`;
  const imports=name.endsWith('.mjs')?"import fs from 'node:fs';":"const fs=require('node:fs');";
  const outcome=name==='bb-fail.cjs'?'process.exitCode=9;':name==='dd-signal.cjs'?"process.kill(process.pid,'SIGTERM');":'';
  fs.writeFileSync(path.join(fixture,'tests',name),imports+record+outcome);
 }
 // These fixture programs must never execute: they represent existing helpers and historical rules.
 const excluded=['dom-helper.cjs','preview-server.cjs','roster701-fixture.cjs','import708-fixture.cjs','roster701-adapter.cjs','roster701-operations-speed-browser.cjs','load-stapler-leases.cjs','load-backend-role.cjs','model403.cjs','model405.cjs','workload407.cjs','roster700-operations.cjs','roster700-gateway.mjs','roster700-review.cjs','roster700-ui.cjs',...['h','k','l','m','n','o','p','q'].map(v=>`release098${v}-metadata.cjs`)];
 for(const name of excluded)fs.writeFileSync(path.join(fixture,'tests',name),"throw Error('helper/historical program was selected');");

 assert.deepEqual(list(fixture),expected);
 assert.deepEqual(executed(),[],'listing must not execute even a failing program');
 assert.equal(fs.existsSync(path.join(fixture,'verification')),false,'listing must have no output-directory side effect');
 assert.deepEqual(list(fixture,{GSIS_TEST_SHARD_INDEX:'1',GSIS_TEST_SHARD_TOTAL:'2'}),['aa-pass.cjs','cc-pass.mjs','ee-pass.cjs']);
 assert.deepEqual(list(fixture,{GSIS_TEST_SHARD_INDEX:'2',GSIS_TEST_SHARD_TOTAL:'2'}),['bb-fail.cjs','dd-signal.cjs','roster-d1-mirror-integration.mjs']);

 // Inspect the OS process boundary without waiting 45/180 seconds for real timeouts.
 // Real execution/failure handling is exercised below; this catches a lost deadline argument.
 const deadlines=[];
 const fakeProcess={argv:[process.execPath,path.join(fixture,'tests/run.cjs')],execPath:process.execPath,env:{},chdir(){},exit(){throw Error('unexpected runner exit');}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'run.cjs'),'utf8'),{
  __dirname:path.join(fixture,'tests'),process:fakeProcess,console:{log(){},error(){}},
  require(name){
   if(name==='fs')return {...fs,mkdirSync(){}};
   if(name==='child_process')return {spawnSync(executable,args,options){deadlines.push([path.basename(args[0]),options.timeout]);return {status:0};}};
   if(name==='../package.json')return {gsisRelease:'0.9.9'};
   return require(name);
  }
 });
 assert.deepEqual(deadlines,[['aa-pass.cjs',45000],['bb-fail.cjs',45000],['cc-pass.mjs',45000],['dd-signal.cjs',45000],['ee-pass.cjs',45000],['roster-d1-mirror-integration.mjs',180000]],'ordinary and production-sized program deadlines must reach spawnSync');

 // Exercise the repository's actual inventory: all four CI shards must be exhaustive and disjoint.
 const all=list(repository);
 const shards=[1,2,3,4].map(index=>list(repository,{GSIS_TEST_SHARD_INDEX:String(index),GSIS_TEST_SHARD_TOTAL:'4'}));
 const union=shards.flat();
 assert.equal(new Set(union).size,union.length,'a program must not execute in multiple shards');
 assert.deepEqual([...union].sort(),all,'the shard union must equal the default full selection');
 assert.ok(shards.every(shard=>shard.length>0),'no CI shard may silently succeed empty');
 assert.ok(Math.max(...shards.map(s=>s.length))-Math.min(...shards.map(s=>s.length))<=1);
 assert.deepEqual(list(repository,{GSIS_TEST_SHARD_INDEX:'3',GSIS_TEST_SHARD_TOTAL:'4'}),shards[2],'selection must be deterministic');

 const invalid=[
  {GSIS_TEST_SHARD_INDEX:'1'}, {GSIS_TEST_SHARD_TOTAL:'2'},
  {GSIS_TEST_SHARD_INDEX:'',GSIS_TEST_SHARD_TOTAL:'2'},
  {GSIS_TEST_SHARD_INDEX:'0',GSIS_TEST_SHARD_TOTAL:'2'},
  {GSIS_TEST_SHARD_INDEX:'1',GSIS_TEST_SHARD_TOTAL:'0'},
  {GSIS_TEST_SHARD_INDEX:'-1',GSIS_TEST_SHARD_TOTAL:'2'},
  {GSIS_TEST_SHARD_INDEX:'01',GSIS_TEST_SHARD_TOTAL:'2'},
  {GSIS_TEST_SHARD_INDEX:'1.5',GSIS_TEST_SHARD_TOTAL:'2'},
  {GSIS_TEST_SHARD_INDEX:'1',GSIS_TEST_SHARD_TOTAL:'2x'},
  {GSIS_TEST_SHARD_INDEX:'1',GSIS_TEST_SHARD_TOTAL:' 2'},
  {GSIS_TEST_SHARD_INDEX:'3',GSIS_TEST_SHARD_TOTAL:'2'},
  {GSIS_TEST_SHARD_INDEX:'1',GSIS_TEST_SHARD_TOTAL:'7'},
  {GSIS_TEST_SHARD_INDEX:'1',GSIS_TEST_SHARD_TOTAL:'9007199254740992'}
 ];
 for(const env of invalid){
  for(const args of [[],['--list']]){
   const result=run(fixture,args,env);
   assert.notEqual(result.status,0,`invalid shard configuration must fail: ${JSON.stringify(env)}`);
   assert.match(result.stderr,/shard/i);
   assert.deepEqual(executed(),[],'invalid configuration must fail before running any program');
  }
 }
 assert.notEqual(run(fixture,['--unknown']).status,0,'unknown arguments must not launch a full suite');
 assert.deepEqual(executed(),[]);

 const pass=run(fixture,[],{GSIS_TEST_SHARD_INDEX:'1',GSIS_TEST_SHARD_TOTAL:'2'});
 assert.equal(pass.status,0,pass.stdout+pass.stderr);
 assert.match(pass.stdout,/3\/3 current scripts passed/);
 assert.deepEqual(executed().map(row=>row.name),['aa-pass.cjs','cc-pass.mjs','ee-pass.cjs']);
 assert.ok(executed().every(row=>row.tz==='Asia/Singapore'));
 clear();
 const failed=run(fixture,[],{GSIS_TEST_SHARD_INDEX:'2',GSIS_TEST_SHARD_TOTAL:'2'});
 assert.equal(failed.status,1,'a nonzero child exit or signal must fail its shard');
 assert.match(failed.stdout,/bb-fail\.cjs FAIL/);
 assert.match(failed.stdout,/dd-signal\.cjs FAIL/);
 assert.match(failed.stdout,/1\/3 current scripts passed/);
 assert.deepEqual(executed().map(row=>row.name),['bb-fail.cjs','dd-signal.cjs','roster-d1-mirror-integration.mjs'],'failure must not skip remaining selected programs');
 clear();
 const full=run(fixture);
 assert.equal(full.status,1);
 assert.match(full.stdout,/4\/6 current scripts passed/);
 assert.deepEqual(executed().map(row=>row.name),expected,'default execution must remain the full selection');

 const empty=path.join(fixture,'empty');
 fs.mkdirSync(path.join(empty,'tests'),{recursive:true});
 fs.copyFileSync(path.join(__dirname,'run.cjs'),path.join(empty,'tests/run.cjs'));
 fs.writeFileSync(path.join(empty,'package.json'),JSON.stringify({gsisRelease:'0.9.9'}));
 assert.notEqual(run(empty).status,0,'an empty suite must not report success');
 assert.notEqual(run(empty,['--list']).status,0,'an empty inventory must fail listing too');
 console.log(`runner-shards: real child failures/signals, strict config, default execution and ${all.length}-program four-shard union passed`);
}finally{
 fs.rmSync(fixture,{recursive:true,force:true});
}
