const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gsis-correction-package-')),root=path.join(temporary,'source');
function run(command,args,ok=true){const result=spawnSync(command,args,{cwd:root,encoding:'utf8'});if(ok)assert.equal(result.status,0,result.stdout+result.stderr);return result;}
function git(...args){return run('git',args).stdout.trim();}
function deployment(commit){run('python3',['-c',`import json,zipfile
with zipfile.ZipFile('GSiS_v0.9_Deployment.zip','w') as archive:
 archive.writestr('README.txt','Fixture deployment')
 archive.comment=json.dumps({'sourceCommit':${JSON.stringify(commit)},'sourceState':'committed'}).encode()
`]);}
function inspect(file){return JSON.parse(run('python3',['-c',`import json,zipfile
with zipfile.ZipFile(${JSON.stringify(file)}) as archive:
 print(json.dumps({'metadata':json.loads(archive.comment),'names':archive.namelist(),'start':archive.read('START_HERE.txt').decode(),'readFirst':archive.read('README.md').decode()}))
`]).stdout);}
try{
 fs.mkdirSync(path.join(root,'scripts'),{recursive:true});fs.mkdirSync(path.join(root,'docs'));
 fs.copyFileSync(path.join(__dirname,'../scripts/package-suite.py'),path.join(root,'scripts/package-suite.py'));
 // Runtime package verification has its own tests; this fixture exercises Git provenance and suite assembly.
 fs.writeFileSync(path.join(root,'scripts/verify-full-package.py'),'print("fixture deployment gate")\n');
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({gsisRelease:'0.9'}));
 fs.writeFileSync(path.join(root,'.gitignore'),'*.zip\n');
 fs.writeFileSync(path.join(root,'README.md'),'Set Apps Script Properties and Pages bindings before installing.\n');
 git('init','-b','fixture');git('config','user.name','GSiS package test');git('config','user.email','package-test@example.invalid');
 git('add','.');git('commit','-m','Baseline fixture');const baseline=git('rev-parse','HEAD');git('tag','v0.9');deployment(baseline);
 run('python3',['scripts/package-suite.py']);const original=path.join(temporary,'deliverables/GSiS_v0.9_Suite.zip'),originalBytes=fs.readFileSync(original);
 fs.writeFileSync(path.join(root,'correction.txt'),'Corrected source\n');fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({gsisRelease:'0.9',gsisSourceBase:baseline}));git('add','correction.txt','package.json');git('commit','-m','Correction fixture');const correction=git('rev-parse','HEAD');git('tag','v0.9-correction');deployment(correction);
 run('python3',['scripts/package-suite.py','--tag','v0.9-correction','--label','Correction']);
 const output=path.join(temporary,'deliverables/GSiS_v0.9_Correction_Suite.zip'),result=inspect(output),validBytes=fs.readFileSync(output);
 assert.equal(result.metadata.sourceCommit,correction);assert.equal(result.metadata.tag,'v0.9-correction');assert.equal(result.metadata.packageLabel,'Correction');
 assert.equal(result.metadata.version,'0.9');assert.equal(result.metadata.productionDeployed,false);
 assert.ok(result.names.includes('GSiS_v0.9_Correction_Source.zip'));assert.ok(result.names.includes('GSiS_v0.9_Correction_Source_Changes.bundle'));assert.ok(result.names.includes('SOURCE_RECOVERY.txt'));assert.equal(result.metadata.sourceBase,baseline);assert.equal(result.metadata.historyKind,'incremental');
 assert.match(result.start,/Apps Script Properties/);assert.match(result.start,/Pages/);assert.doesNotMatch(result.start,/safe placeholders|restore.*constants/i);assert.match(result.readFirst,/before installing/);
 assert.deepEqual(fs.readFileSync(original),originalBytes);assert.equal(git('rev-parse','v0.9'),baseline);
 assert.notEqual(run('python3',['scripts/package-suite.py','--tag','v0.9-correction'],false).status,0,'Alternate tags require a distinct filename label');
 assert.notEqual(run('python3',['scripts/package-suite.py','--tag','v0.9-correction','--label','../unsafe'],false).status,0,'Labels cannot escape the output directory');
 assert.notEqual(run('python3',['scripts/package-suite.py','--tag','v0.9','--label','Correction'],false).status,0,'A stale tag must not package the current source');
 deployment(baseline);assert.notEqual(run('python3',['scripts/package-suite.py','--tag','v0.9-correction','--label','Correction'],false).status,0,'A stale deployment must not package against a current source tag');deployment(correction);
 fs.writeFileSync(path.join(root,'untracked-source.txt'),'Not committed\n');assert.notEqual(run('python3',['scripts/package-suite.py','--tag','v0.9-correction','--label','Correction'],false).status,0,'Untracked source must not disappear from the committed source archive');fs.unlinkSync(path.join(root,'untracked-source.txt'));
 fs.writeFileSync(path.join(root,'correction.txt'),'Uncommitted changes\n');assert.notEqual(run('python3',['scripts/package-suite.py','--tag','v0.9-correction','--label','Correction'],false).status,0,'Dirty source must not package');
 assert.deepEqual(fs.readFileSync(output),validBytes,'Rejected packaging must preserve the valid correction archive');
 console.log('PASS correction suite preserves baseline tag/archive, validates provenance and labels, and includes settings-first guidance');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
