/* Exercises the actual component packager and Roster source boundary in a local Git fixture. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gsis-roster-lord-patch-')),root=path.join(temporary,'source');
const version='0.9.1b',components=['rosterBackend','rosterFrontend','lordBackend','lordFrontend','overlordFrontend','starlordFrontend'];
const markers=['GSIS_LAYOUT_DATA','GSIS_LAYOUT_REPOSITORY','GSIS_LAYOUT_DIAGNOSTICS','GSIS_LAYOUT_SEED','GSIS_ASC_EXPORT'];
function put(name,text){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
function run(command,args,ok=true){const r=spawnSync(command,args,{cwd:root,encoding:'utf8',env:{...process.env,NODE_PATH:path.resolve(__dirname,'../node_modules')}});if(ok)assert.equal(r.status,0,r.stdout+r.stderr);return r;}
const git=(...args)=>run('git',args).stdout.trim();
const verify=()=>run('python3',['scripts/verify-component-patch.py'],false);
const build=()=>run('python3',['scripts/build-component-patch.py','--no-sync']);
try{
  for(const name of ['build-component-patch.py','verify-component-patch.py','build-release.py','bundle-worker.cjs'])put('scripts/'+name,fs.readFileSync(path.join(__dirname,'../scripts/'+name)));
  put('tests/pages096-packaged-worker.cjs',fs.readFileSync(path.join(__dirname,'pages096-packaged-worker.cjs')));
  put('package.json',JSON.stringify({gsisRelease:version,gsisPackageKind:'component-patch',gsisPatchBaseline:'0.9.1a',gsisPatchComponents:components,gsisComponentVersions:Object.fromEntries(components.map(key=>[key,version])),gsisPatchRepositoryBundle:true}));
  put('vendor-assets-manifest.json',JSON.stringify({assets:[]}));
  for(const [app,folder] of [['roster','roster-update/public'],...['lord','overlord','starlord'].map(app=>[app,'lord-suite/Source/'+app])]){
    put(folder+'/index.html','<title>'+app+' v'+version+'</title>');put(folder+'/_worker.js','export default {fetch(){return new Response("fixture");}};');put(folder+'/assets/app.js','// fixture '+app);
    if(app==='roster'){
      // A valid minimal gateway contract with a real imported dependency makes
      // this packaging fixture exercise the production bundler and smoke test.
      put(folder+'/gateway-config.js',`export const config=env=>({version:${JSON.stringify(version)},clientId:env.GOOGLE_CLIENT_ID||''});\n`);
      put(folder+'/_worker.js',"import {config} from './gateway-config.js';\nexport default {fetch(request,env){const path=new URL(request.url).pathname;if(path==='/api/config')return Response.json(config(env));if(path.startsWith('/api/'))return Response.json({ok:false,error:'School sign-in required.'},{status:401});return env.ASSETS.fetch(request);}};\n");
      put(folder+'/_routes.json',JSON.stringify({include:['/api/*']}));for(const name of ['external.html','external.js','external.css','privacy.html'])put(folder+'/'+name,'fixture '+name);
    }
  }
  put('backend/Code.gs',"const GSIS_BACKEND_KIND='deploy';\nconst GSIS_DEPLOY_VERSION='0.9.1a';\nfunction liveVenueIdentity_(){return 'retained';}\n"+markers.map(marker=>'/* '+marker+'_BEGIN */\nconst '+marker+'_FIXTURE="excluded";\n/* '+marker+'_END */').join('\n')+'\n');
  put('backend/Seed.gs','const DEPLOY_SEED={fixture:true};\n');
  // Load only the pure production derivation; the full release builder has unrelated side effects.
  run('python3',['-c',`import ast,re
from pathlib import Path
tree=ast.parse(Path('scripts/build-release.py').read_text())
function=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='roster_backend_source')
exec(compile(ast.Module(body=[function],type_ignores=[]),'build-release.py','exec'))
code=Path('backend/Code.gs').read_text()+'\\n'+Path('backend/Seed.gs').read_text()
Path('Roster_Backend_v${version}.gs').write_text(roster_backend_source(code,'${version}').replace('DEPLOY_SEED','GSIS_DEPLOY_EMBEDDED_SEED_04'))`]);
  put('lord-suite/Source/backend/Code.gs','const LORD_CONFIG={VERSION:"'+version+'"};\n');
  put('lord-suite/docs/PHOTO_UPLOAD_RELIABILITY.md','Enable Advanced Drive v3 before publishing.\n');
  put('lord-suite/Source/backend/appsscript.services.fragment.json',JSON.stringify({dependencies:{enabledAdvancedServices:[{userSymbol:'Sheets',version:'v4',serviceId:'sheets'},{userSymbol:'Drive',version:'v3',serviceId:'drive'}]}}));
  for(const prefix of ['HOTFIX','CHANGELOG','VALIDATION','SUITE_MERGE'])put(prefix+'_v'+version+'.md',prefix+' fixture\n');put('RELEASE_SUMMARY_v'+version+'.json','{}\n');
  git('init','-b','fixture');git('config','user.name','GSiS package test');git('config','user.email','package-test@example.invalid');git('add','.');git('commit','-m','Baseline fixture');const baseline=git('rev-parse','HEAD');
  const settings=JSON.parse(fs.readFileSync(path.join(root,'package.json')));settings.gsisPatchSourceBase=baseline;put('package.json',JSON.stringify(settings));git('add','.');git('commit','-m','Combined patch fixture');const commit=git('rev-parse','HEAD');git('tag','v'+version);
  build();
  const archive=path.join(temporary,'deliverables/GSiS_v'+version+'_Updated_Deployments.zip'),bundle=path.join(temporary,'deliverables/GSiS_v'+version+'_Incremental.bundle');
  const originalArchive=fs.readFileSync(archive),originalBundle=fs.readFileSync(bundle),rosterName='Roster_Backend_v'+version+'.gs',originalRoster=fs.readFileSync(path.join(root,rosterName));
  const result=JSON.parse(run('python3',['-c',`import json,zipfile
with zipfile.ZipFile(${JSON.stringify(archive)}) as archive:
 print(json.dumps({'names':archive.namelist(),'manifest':json.loads(archive.read('PATCH.json')),'roster':archive.read('${rosterName}').decode(),'lord':archive.read('LORD_Backend_v${version}.gs').decode()}))`]).stdout);
  assert.deepEqual(result.manifest.components,['Roster_Backend_v'+version+'.gs','Roster_Frontend_v'+version+'.zip','LORD_Backend_v'+version+'.gs','LORD_Frontend_v'+version+'.zip','OVERLORD_Frontend_v'+version+'.zip','STARLORD_Frontend_v'+version+'.zip']);
  assert.equal(result.manifest.sourceCommit,commit);assert.equal(result.manifest.sourceState,'committed');assert.equal(result.manifest.liveDeploymentPerformed,false);
  assert(result.names.includes('SOURCE.patch'));assert(result.names.includes(path.basename(bundle)));assert(!result.names.some(name=>/^(Deploy|Contacts|Calendar)_/.test(name)));
  assert.equal(result.roster,originalRoster.toString());assert(result.roster.includes("GSIS_BACKEND_KIND='roster'"));assert(result.roster.includes("GSIS_DEPLOY_VERSION='"+version+"'"));assert(result.roster.includes('liveVenueIdentity_'));assert(result.roster.includes('GSIS_DEPLOY_EMBEDDED_SEED_04'));
  for(const marker of markers)assert(!result.roster.includes(marker),'Roster must exclude '+marker);
  assert.equal(result.lord,fs.readFileSync(path.join(root,'lord-suite/Source/backend/Code.gs'),'utf8'));
  for(const name of ['PHOTO_UPLOAD_RELIABILITY.md','appsscript.services.fragment.json'])assert(result.names.includes(name),'LORD backend support file must ship: '+name);
  assert.equal(git('bundle','list-heads',bundle).split('\n').find(line=>line.endsWith(' HEAD')).split(' ')[0],commit);run('git',['bundle','verify',bundle]);
  const mutateArchive=code=>run('python3',['-c',`import hashlib,io,json,zipfile
from pathlib import Path
p=Path(${JSON.stringify(archive)})
with zipfile.ZipFile(p) as archive: files={name:archive.read(name) for name in archive.namelist()}
${code}
files['SHA256SUMS.txt']=''.join(hashlib.sha256(data).hexdigest()+'  '+name+'\\n' for name,data in sorted(files.items()) if name!='SHA256SUMS.txt').encode()
with zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as archive:
 for name,data in files.items(): archive.writestr(name,data)`]);
  mutateArchive("files['SOURCE.patch']+=b'\\nforged patch\\n'");assert.notEqual(verify().status,0,'Source patch tampering must fail even with repaired hashes');fs.writeFileSync(archive,originalArchive);
  for(const name of ['PHOTO_UPLOAD_RELIABILITY.md','appsscript.services.fragment.json']){
    mutateArchive(`files[${JSON.stringify(name)}]=b'forged support file'`);assert.notEqual(verify().status,0,'Support source parity must reject repaired archive hashes: '+name);fs.writeFileSync(archive,originalArchive);
    mutateArchive(`del files[${JSON.stringify(name)}]`);assert.notEqual(verify().status,0,'Missing required support file must fail: '+name);fs.writeFileSync(archive,originalArchive);
  }
  mutateArchive(`with zipfile.ZipFile(io.BytesIO(files['Roster_Frontend_v${version}.zip'])) as frontend: nested={name:frontend.read(name) for name in frontend.namelist()}
nested['assets/app.js']=b'forged frontend'
output=io.BytesIO()
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as frontend:
 for name,data in nested.items(): frontend.writestr(name,data)
files['Roster_Frontend_v${version}.zip']=output.getvalue()`);assert.notEqual(verify().status,0,'Frontend source parity must reject repaired archive hashes');fs.writeFileSync(archive,originalArchive);
  git('tag','-f','v'+version,baseline);assert.notEqual(verify().status,0,'Release tag must match source commit');git('tag','-f','v'+version,commit);
  fs.writeFileSync(bundle,Buffer.concat([originalBundle,Buffer.from('forged bundle')]));assert.notEqual(verify().status,0,'Recovery bundle bytes must match');fs.writeFileSync(bundle,originalBundle);
  put(rosterName,originalRoster+'\n/* GSIS_LAYOUT_DATA_BEGIN */\nconst forbidden="layout";\n/* GSIS_LAYOUT_DATA_END */\n');
  const forbidden=run('python3',['scripts/build-component-patch.py','--no-sync'],false);
  assert.notEqual(forbidden.status,0,'An artifact containing forbidden Layout code must fail despite valid source-file parity and hashes');assert(forbidden.stderr.includes('archive.read(roster_backend_name) == expected.encode()'),'the independent canonical derivation rejects forbidden code');
  put(rosterName,originalRoster);
  const code=fs.readFileSync(path.join(root,'backend/Code.gs'),'utf8');put('backend/Code.gs',code.replace('/* GSIS_ASC_EXPORT_BEGIN */','/* missing marker */'));
  const malformed=run('python3',['scripts/build-component-patch.py','--no-sync'],false);assert.notEqual(malformed.status,0);assert(malformed.stderr.includes('Expected one audited Layout block: GSIS_ASC_EXPORT'),'a missing boundary must fail closed');
  put('backend/Code.gs',code);
  put(rosterName,originalRoster);fs.writeFileSync(archive,originalArchive);assert.equal(verify().status,0);
  settings.gsisPatchClean=true;put('package.json',JSON.stringify(settings));build();
  const cleanNames=JSON.parse(run('python3',['-c',`import json,zipfile\nwith zipfile.ZipFile(${JSON.stringify(archive)}) as archive: print(json.dumps(archive.namelist()))`]).stdout);
  assert(!cleanNames.includes('INSTALL.txt'));assert(cleanNames.includes('PHOTO_UPLOAD_RELIABILITY.md'));assert(cleanNames.includes('appsscript.services.fragment.json'));
  settings.gsisPatchComponents=components.filter(key=>key!=='lordBackend');put('package.json',JSON.stringify(settings));build();
  const frontendOnlyNames=JSON.parse(run('python3',['-c',`import json,zipfile\nwith zipfile.ZipFile(${JSON.stringify(archive)}) as archive: print(json.dumps(archive.namelist()))`]).stdout);
  assert(!frontendOnlyNames.includes('PHOTO_UPLOAD_RELIABILITY.md'));assert(!frontendOnlyNames.includes('appsscript.services.fragment.json'),'LORD setup files must follow the backend component');
  console.log('PASS combined Roster/LORD package: exact scope and derivation, five excluded blocks, retained venue identity, source/tag/bundle provenance and tamper rejection');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
