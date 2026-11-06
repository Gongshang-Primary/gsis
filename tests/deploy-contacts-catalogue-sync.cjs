'use strict';
// deploy-contacts-catalogue-sync: the Contacts step of a Deploy publish reports
// separately and retries idempotently; the viewport invalidates by catalogue revision.
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const {run,sheets,props,ctx}=require('./contacts-data.cjs');

// --- 1. syncPublishedCatalogues_ reports the Contacts step instead of throwing ---
const planning=vm.createContext({console});
planning.gsisRequireBackendRole_=()=>{};
planning.publishedEntry_=()=>planning._entry;
planning.document_=()=>({masterOptions:{Role:['HOD','Teacher']},membership:[['HOD','Head','','','','','','','','','','','HOD']]});
planning.contacts_=()=>planning._contacts();
vm.runInContext(fs.readFileSync('backend/Planning.gs','utf8'),planning);
const sync=s=>JSON.parse(vm.runInContext('JSON.stringify('+s+')',planning));
planning._entry={id:'v1',commit:'publish-41',catalogueRevision:41};
const details={versionId:'v1',publicationCommit:'publish-41',revision:41};
planning._contacts=()=>{const e=new Error('Contacts is busy. Retry publication.');e.status=503;throw e;};
assert.deepEqual(sync('syncPublishedCatalogues_(null,{revision:99},null)'),{status:'failed',reason:'Contacts is busy. Retry publication.',code:503,...details});
planning._contacts=()=>({saved:true,revision:41});
assert.deepEqual(sync('syncPublishedCatalogues_(null,{revision:99},null)'),{status:'updated',...details});
planning._contacts=()=>({saved:true,duplicate:true,revision:41});
assert.deepEqual(sync('syncPublishedCatalogues_(null,{revision:99},null)'),{status:'duplicate',...details});
planning._contacts=()=>({saved:true,unchanged:true,revision:41});
assert.deepEqual(sync('syncPublishedCatalogues_(null,{revision:99},null)'),{status:'unchanged',...details});
for(const result of [undefined,{}, {saved:true}, {saved:true,revision:99}]){planning._contacts=()=>result;assert.equal(sync('syncPublishedCatalogues_(null,{revision:99},null)').status,'failed');}
const readDocument=planning.document_;planning.document_=()=>{throw Error('Published data unavailable');};assert.equal(sync('syncPublishedCatalogues_(null,{revision:99},null)').reason,'Published data unavailable');planning.document_=readDocument;
planning._entry=null;
assert.deepEqual(sync('syncPublishedCatalogues_(null,{revision:41},null)'),{status:'failed',reason:'No published version.'});
console.log('PASS syncPublishedCatalogues_ reports failed/updated/duplicate/unchanged, missing response and source-read failure and never throws for the Contacts step');

// --- 2. Contacts busy, then retry succeeds; viewport sees the new revision ---
const beforeHash=run('deploySnapshot_(book,actor,{}).catalogueHash');
const beforeRevision=run('catalogueRevision_(book)');
assert.equal(run(`deploySnapshot_(book,actor,{knownCatalogueHash:'${beforeHash}'}).catalogueUnchanged`),true,'known hash matches before the sync');
const lists=JSON.parse(run('JSON.stringify(sysFields_(book))'));
lists['Subject Modifier']=[...lists['Subject Modifier'],'Drama'];
lists.Role=['HOD','Teacher','VP'];
const membership=[['HOD','Head',...Array(10).fill(''),'HOD'],['Teacher','Teacher',...Array(10).fill(''),''],['VP','Vice Principal',...Array(10).fill(''),'VP']];
run(`var catalogueSync={identity:actor,input:{revision:1234,options:${JSON.stringify(lists)},membership:${JSON.stringify(membership)}}};`);
// Busy lock: nothing is written and the 503 names the Contacts step.
ctx.LockService={getScriptLock:()=>({tryLock:()=>false,releaseLock(){}})};
assert.throws(()=>run('applyDeployCatalogues_(book,catalogueSync)'),e=>e.status===503&&/Contacts is busy/.test(e.message));
assert.equal(props.get('DEPLOY_CATALOGUE_REVISION'),undefined);
assert.equal(sheets.get('catalogue_journal'),undefined);
ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
assert.deepEqual(JSON.parse(run('JSON.stringify(applyDeployCatalogues_(book,catalogueSync))')),{saved:true,revision:1234});
assert.equal(props.get('DEPLOY_CATALOGUE_REVISION'),'1234');
assert.ok(JSON.parse(run("JSON.stringify(sysFields_(book)['Subject Modifier'])")).includes('Drama'),'new option reaches the viewport lists');
assert.ok(JSON.parse(run("JSON.stringify(table_(book,'roles').rows.map(r=>r['Role Shortform']))")).includes('VP'),'new role reaches the membership table');
assert.notEqual(run('catalogueRevision_(book)'),beforeRevision,'catalogue revision moves on a successful sync');
assert.equal(run('bootstrap_(book,actor).catalogueRevision'),run('catalogueRevision_(book)'));
assert.equal(run('contactData_(book,actor).catalogueRevision'),run('catalogueRevision_(book)'));
assert.equal(run("adminTable_(book,actor,'sysFields').catalogueRevision"),run('catalogueRevision_(book)'));
assert.equal(run("adminTable_(book,actor,'membership').catalogueRevision"),run('catalogueRevision_(book)'));
// The old hash no longer matches: the snapshot returns full new data, not catalogueUnchanged.
const after=JSON.parse(run(`JSON.stringify(deploySnapshot_(book,actor,{knownCatalogueHash:'${beforeHash}'}))`));
assert.equal(after.catalogueUnchanged,undefined);
assert.ok(after.sysFields['Subject Modifier'].includes('Drama'),'old known hash returns the new catalogues');
assert.notEqual(after.catalogueHash,beforeHash);
// Re-publish, same revision and payload: duplicate, journal and sheets unchanged.
const journalRows=run("book.getSheetByName('catalogue_journal').getLastRow()");
const rolesBefore=run("JSON.stringify(table_(book,'roles').rows)");
assert.deepEqual(JSON.parse(run('JSON.stringify(applyDeployCatalogues_(book,catalogueSync))')),{saved:true,duplicate:true,revision:1234});
assert.equal(run("book.getSheetByName('catalogue_journal').getLastRow()"),journalRows);
assert.equal(run("JSON.stringify(table_(book,'roles').rows)"),rolesBefore);
// Re-publish after a save (new revision, same payload): unchanged, no duplicate rows.
assert.deepEqual(JSON.parse(run("JSON.stringify(applyDeployCatalogues_(book,{identity:actor,input:{revision:1235,options:catalogueSync.input.options,membership:catalogueSync.input.membership}}))")),{saved:true,unchanged:true,revision:1235});
assert.equal(props.get('DEPLOY_CATALOGUE_REVISION'),'1235');
assert.equal(run("book.getSheetByName('catalogue_journal').getLastRow()"),journalRows);
assert.equal(run("JSON.stringify(table_(book,'roles').rows)"),rolesBefore);
console.log('PASS Contacts busy leaves nothing written, retry applies once, revision moves, old hash returns new catalogues, re-publish is idempotent');
