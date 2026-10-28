const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gsis-lord-patch-')),root=path.join(temporary,'source');
function run(command,args,ok=true){const r=spawnSync(command,args,{cwd:root,encoding:'utf8'});if(ok)assert.equal(r.status,0,r.stdout+r.stderr);return r;}
function put(name,text){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
function git(...args){return run('git',args).stdout.trim();}
try{
 for(const name of ['build-component-patch.py','verify-component-patch.py'])put('scripts/'+name,fs.readFileSync(path.join(__dirname,'../scripts/'+name)));
 const components=['lordBackend','lordFrontend','overlordFrontend','starlordFrontend'];
 put('package.json',JSON.stringify({gsisRelease:'0.9.1a',gsisPackageKind:'component-patch',gsisPatchBaseline:'0.9.1',gsisPatchComponents:components,gsisComponentVersions:Object.fromEntries(components.map(key=>[key,'0.9.1a'])),gsisPatchRepositoryBundle:true}));
 put('vendor-assets-manifest.json',JSON.stringify({assets:[]}));
 for(const app of ['lord','overlord','starlord']){
  put(`lord-suite/Source/${app}/index.html`,'<title>'+app+' v0.9.1a</title>');
  put(`lord-suite/Source/${app}/_worker.js`,'export default {fetch(){return new Response("fixture");}};');
  put(`lord-suite/Source/${app}/assets/app.js`,'// fixture '+app);
 }
 put('lord-suite/Source/backend/Code.gs','const LORD_CONFIG = {VERSION:"0.9.1a"};\n');
 put('lord-suite/docs/PHOTO_UPLOAD_RELIABILITY.md','Enable Advanced Drive v3 before publishing.\n');
 put('lord-suite/Source/backend/appsscript.services.fragment.json',JSON.stringify({dependencies:{enabledAdvancedServices:[{userSymbol:'Sheets',version:'v4',serviceId:'sheets'},{userSymbol:'Drive',version:'v3',serviceId:'drive'}]}}));
 for(const prefix of ['HOTFIX','CHANGELOG','VALIDATION','SUITE_MERGE'])put(prefix+'_v0.9.1a.md',prefix+' fixture\n');
 put('RELEASE_SUMMARY_v0.9.1a.json','{}\n');
 git('init','-b','fixture');git('config','user.name','GSiS package test');git('config','user.email','package-test@example.invalid');
 git('add','.');git('commit','-m','Baseline fixture');const baseline=git('rev-parse','HEAD');
 const settings=JSON.parse(fs.readFileSync(path.join(root,'package.json')));settings.gsisPatchSourceBase=baseline;put('package.json',JSON.stringify(settings));
 git('add','.');git('commit','-m','Patch fixture');const commit=git('rev-parse','HEAD');git('tag','v0.9.1a');
 run('python3',['scripts/build-component-patch.py','--no-sync']);
 const archive=path.join(temporary,'deliverables/GSiS_v0.9.1a_Updated_Deployments.zip');
 const result=JSON.parse(run('python3',['-c',`import json,zipfile
with zipfile.ZipFile(${JSON.stringify(archive)}) as archive:
 print(json.dumps({'names':archive.namelist(),'manifest':json.loads(archive.read('PATCH.json')),'backend':archive.read('LORD_Backend_v0.9.1a.gs').decode()}))`]).stdout);
 assert.deepEqual(result.manifest.components,['LORD_Backend_v0.9.1a.gs','LORD_Frontend_v0.9.1a.zip','OVERLORD_Frontend_v0.9.1a.zip','STARLORD_Frontend_v0.9.1a.zip']);
 assert.equal(result.manifest.sourceCommit,commit);assert.equal(result.manifest.sourceState,'committed');
 assert.equal(result.manifest.liveDeploymentPerformed,false);assert.ok(result.names.includes('SOURCE.patch'));assert.ok(result.names.includes('GSiS_v0.9.1a_Incremental.bundle'));
 assert.equal(result.backend,fs.readFileSync(path.join(root,'lord-suite/Source/backend/Code.gs'),'utf8'));
 assert(result.names.includes('PHOTO_UPLOAD_RELIABILITY.md'),'LORD backend package must include its photo upgrade guide');
 assert(result.names.includes('appsscript.services.fragment.json'),'LORD backend package must include its additive service declarations');
 assert.ok(!result.names.some(name=>/^(Roster|Deploy|Contacts|Calendar)_/.test(name)));
 put('lord-suite/Source/backend/Code.gs','changed source');assert.notEqual(run('python3',['scripts/verify-component-patch.py'],false).status,0,'A stale backend must fail source parity');
 console.log('PASS LORD component patch: three frontends, backend parity, exact scope, committed provenance, recovery bundle and tamper rejection');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
