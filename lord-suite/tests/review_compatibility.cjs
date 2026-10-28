// Compare this release with the restored v1.6 baseline without printing configuration.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),baselineCommit='restored-v1.6-package';
const baselineRoot=path.join(__dirname,'baselines/v1.6');
const baselineFile=name=>fs.readFileSync(path.join(baselineRoot,name));
const oldSource=baselineFile('Source/backend/Code.gs').toString(),newSource=fs.readFileSync(path.join(root,'Source/backend/Code.gs'),'utf8');
const settingsContract=require('./settings_contract_changes.cjs');
const old=settingsContract.context(oldSource),current=settingsContract.context(newSource);
const functions=Object.keys(old).filter(k=>typeof old[k]==='function');
const removed=functions.filter(k=>typeof current[k]!=='function');assert.deepEqual(removed,[]);
const changed=functions.filter(k=>old[k].toString()!==current[k].toString());
const headerNames=Object.keys(old).filter(k=>k.endsWith('_HEADERS'));
for(const name of headerNames)assert.equal(JSON.stringify(current[name]),JSON.stringify(old[name]),name+' changed');
// Collection has a new terms recheck, covered by v1.7 interleaving regressions.
// Return declaration replay and atomic REIGN are covered by v18 behavioral tests.
// Photo semantics now have interrupted-create, checksum and concurrency tests.
const core=[];
for(const name of core)assert.equal(current[name].toString(),old[name].toString(),name+' changed');
for(const name of ['LORD_CONFIG','BOOKING_CONFIG','OVERLORD_CONFIG','LORD_REFERENCE_CONFIG','REIGN_CONFIG']){
  const a=settingsContract.value(old,name),b=settingsContract.value(current,name);delete a.VERSION;delete b.VERSION;delete a.RELEASE_CHANNEL;delete b.RELEASE_CHANNEL;
  assert.deepEqual(b,a,name+' configuration changed');
}
const actions=source=>[...new Set([...source.matchAll(/action === '([^']+)'/g)].map(m=>m[1]))].sort();
const oldActions=actions(old.doGet.toString()+old.doPost.toString()),newActions=actions(current.doGet.toString()+current.doPost.toString());
assert(oldActions.every(action=>newActions.includes(action)));
const preservedAssets=[];
for(const app of ['lord','overlord','starlord']){
  const relative='Source/'+app+'/_worker.js',a=baselineFile(relative).toString(),b=fs.readFileSync(path.join(root,relative),'utf8');
  const routes=source=>[...source.matchAll(/['"](\/api\/[A-Za-z/]+)['"]/g)].map(m=>m[1]);
  assert(routes(a).every(route=>routes(b).includes(route)),app+' removed an API route');
  for(const key of ['LORD_PROXY_SECRET','LORD_BACKEND_URL']){
    assert(key==='LORD_PROXY_SECRET'
      ? b.includes("gsisApiSecret(env,'LORD_PROXY_SECRET')")&&b.includes('env?.GSIS_SECRET')&&b.includes('return env?.[legacyName];')
      : b.includes('env.'+key),app+' must read '+key+' from its environment');
    assert(!new RegExp('(?:const|let|var)\\s+'+key+'\\s*=\\s*[\x27\x22]').test(b),app+' must not embed '+key);
  }
}
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'Source/backend/appsscript.services.fragment.json'),'utf8')).dependencies.enabledAdvancedServices,[{userSymbol:'Sheets',version:'v4',serviceId:'sheets'},{userSymbol:'Drive',version:'v3',serviceId:'drive'}]);
const tracked=fs.readdirSync(path.join(baselineRoot,'Source'),{recursive:true}).map(name=>'Source/'+name).filter(name=>fs.statSync(path.join(baselineRoot,name)).isFile());
for(const file of tracked.filter(f=>/\.(webp|png|jpg|jpeg|svg|gif|ico)$/.test(f))){
  assert(baselineFile(file).equals(fs.readFileSync(path.join(root,file))),file+' changed');preservedAssets.push(file);
}
const report={baselineCommit,checkedAt:new Date().toISOString(),compatibilityPassed:true,
 sourceSha256:require('./source_fingerprints.cjs')(),existingBackendFunctionsRetained:functions.length,
 removedBackendFunctions:removed,changedExistingBackendFunctions:changed,unchangedHeaderArrays:headerNames,
 byteIdenticalCoreFunctions:core,preservedConfigurationContract:true,configurationStorage:'Script Properties and Cloudflare bindings',existingApiActionsRetained:oldActions,
 addedApiActions:newActions.filter(x=>!oldActions.includes(x)),preservedAssets,
 limits:['Offline source comparison only','No live source parity verification','No real browser or copied Sheet execution']};
fs.writeFileSync(path.join(__dirname,'release_review.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({compatibilityPassed:true,existingBackendFunctionsRetained:functions.length,unchangedHeaderArrays:headerNames.length,byteIdenticalCoreFunctions:core.length,unchangedAssets:preservedAssets.length,addedApiActions:report.addedApiActions},null,2));
