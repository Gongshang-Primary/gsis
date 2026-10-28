const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),spec=JSON.parse(fs.readFileSync(path.join(root,'release-installation-manifest.json')));
assert.deepEqual(Object.keys(spec.frontends),['Contacts','Deploy','Layout','Roster','Calendar','LORD','OVERLORD','STARLORD','Venues']);
assert.deepEqual(spec.backends,['Contacts','Deploy','Roster','Calendar','LORD','Venues']);
assert.equal(spec.frontends.Venues,'venues-viewport/public');
assert(spec.documents.includes('README.md'),'A first-time deployer needs the main README in the installation ZIP');
assert(!spec.documents.some(x=>/Maintainer-Guide|VENUES_PIPELINE|READ_FIRST/.test(x)),'One current installation authority; historical guides stay in source history');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gsis-release-inventory-'));
try{
 fs.writeFileSync(path.join(temporary,'release-installation-manifest.json'),JSON.stringify(spec));
 const program=`import json,runpy\nfrom pathlib import Path\nf=runpy.run_path(${JSON.stringify(path.join(root,'scripts/installation-manifest.py'))})['installation_manifest']\ns,m=f(Path(${JSON.stringify(temporary)}),'0.9.2')\nassert m['README.md']==Path(${JSON.stringify(temporary)})/'README.md'\nassert m['Venues_Backend_v0.9.2.gs'].name=='Venues_Backend_v0.9.2.gs'\nprint(len(m))\n`;
 const result=spawnSync('python3',['-c',program],{encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 const unsafe=structuredClone(spec);unsafe.documents.push('../secret.txt');fs.writeFileSync(path.join(temporary,'release-installation-manifest.json'),JSON.stringify(unsafe));
 assert.notEqual(spawnSync('python3',['-c',program],{encoding:'utf8'}).status,0,'A document cannot escape the declared source directory');
 console.log('PASS 0.9.2 inventory: nine viewports, six Apps Script owners, canonical README and bounded document paths');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
