'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gsis-098o-package-'));
let checks=0;
function run(executable,args,ok=true){const result=cp.spawnSync(executable,args,{cwd:root,encoding:'utf8'});if(ok)assert.equal(result.status,0,result.stdout+'\n'+result.stderr);else assert.notEqual(result.status,0,'Expected rejection: '+args.join(' '));return result;}
function check(name,fn){fn();checks++;console.log('PASS '+name);}
try{
 const archive=path.join(tmp,'GSiS_v0.9.8o_Timetable_Preparation.zip');
 check('build and verify a separate preparation package',()=>{run('python3',['scripts/package-timetable-preparation.py','--zip',archive]);run('python3',['scripts/verify-timetable-preparation.py',archive]);});
 check('extracted preparation source runs its documented exporter test without external source files',()=>{
  const extracted=path.join(tmp,'extracted');run('python3',['-c','import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:z.extractall(sys.argv[2])',archive,extracted]);
  const result=cp.spawnSync(process.execPath,['tests/roster098o-timetable-export.cjs'],{cwd:path.join(extracted,'source'),encoding:'utf8'});assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  const manifest=JSON.parse(fs.readFileSync(path.join(extracted,'MANIFEST.json')));assert.equal(manifest.release,'0.9.9');assert.equal(manifest.protocolRelease,'0.9.8o');assert.equal(manifest.productionCutover,false);
 });
 check('build is deterministic and provenance includes bundle and source hashes',()=>{
  const first=path.join(tmp,'first','worker.mjs'),second=path.join(tmp,'second','worker.mjs');
  run('node',['scripts/build-timetable-prep-worker.cjs','--output',first]);run('node',['scripts/build-timetable-prep-worker.cjs','--output',second]);
  assert.equal(fs.readFileSync(first,'utf8'),fs.readFileSync(second,'utf8'));
  const a=JSON.parse(fs.readFileSync(path.join(path.dirname(first),'provenance.json'))),b=JSON.parse(fs.readFileSync(path.join(path.dirname(second),'provenance.json')));
  assert.deepEqual(a,b);assert.match(a.sourceSha256,/^[a-f0-9]{64}$/);assert.match(a.bundleSha256,/^[a-f0-9]{64}$/);assert.ok(Object.keys(a.inputs).includes('timetable-prep-worker/index.mjs'));
  assert.equal(a.productionInstallation,false);assert.equal(a.mode,'shadow-only');
 });
 check('verifier rejects tampered Worker even when package manifest is recomputed',()=>{
  const altered=path.join(tmp,'altered.zip');run('python3',['-c',`import zipfile,json,hashlib,sys\nsrc,dst=sys.argv[1:]\nwith zipfile.ZipFile(src) as z: files={n:z.read(n) for n in z.namelist()}\nfiles['worker.mjs']+=b'\\n// altered\\n'\nm=json.loads(files['MANIFEST.json']);m['files']['worker.mjs']=hashlib.sha256(files['worker.mjs']).hexdigest();files['MANIFEST.json']=json.dumps(m).encode()\nwith zipfile.ZipFile(dst,'w') as z:\n for n,v in files.items(): z.writestr(n,v)`,archive,altered]);run('python3',['scripts/verify-timetable-preparation.py',altered],false);
 });
 check('verifier rejects undeclared inventory',()=>{
  const extra=path.join(tmp,'extra.zip');fs.copyFileSync(archive,extra);run('python3',['-c',"import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],'a') as z:z.writestr('extra.txt','extra')",extra]);run('python3',['scripts/verify-timetable-preparation.py',extra],false);
 });
 check('schema and configuration preserve the existing private rehearsal boundary',()=>{
  const schema=fs.readFileSync(path.join(root,'timetable-prep-worker/schema.sql'),'utf8');assert.ok(!schema.trimStart().startsWith('--'));assert.ok(!/\b(?:DROP|DELETE|ALTER|TRUNCATE)\b/i.test(schema.replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\n]*/g,'')));
  const config=fs.readFileSync(path.join(root,'timetable-prep-worker/wrangler.example.toml'),'utf8');assert.ok(!/^\s*\[triggers\]|^\s*\[\[queues\.|^\s*routes\s*=/m.test(config));
 });
 console.log('PASS '+checks+' timetable preparation packaging checks');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
