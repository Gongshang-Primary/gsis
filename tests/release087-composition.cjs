'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
// Execute the actual pure composition function without running the release
// builder or altering authorised deployment archives.
const source=execFileSync('python3',['-c',`import ast,re
from pathlib import Path
tree=ast.parse(Path('scripts/build-release.py').read_text())
function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='roster_backend_source')
exec(compile(ast.Module(body=[function],type_ignores=[]),'<composition>','exec'))
code=Path('backend/Code.gs').read_text()+'\\n'+Path('backend/Seed.gs').read_text()
print(roster_backend_source(code,'0.8.7'))`],{encoding:'utf8',maxBuffer:8*1024*1024});
const original=fs.readFileSync('backend/Code.gs','utf8')+'\n'+fs.readFileSync('backend/Seed.gs','utf8'),build=fs.readFileSync('scripts/build-release.py','utf8');
for(const marker of ['GSIS_LAYOUT_DATA','GSIS_LAYOUT_REPOSITORY','GSIS_LAYOUT_DIAGNOSTICS','GSIS_LAYOUT_SEED','GSIS_ASC_EXPORT'])assert(!source.includes('/* '+marker+'_BEGIN */'));
for(const file of ['shared/roster-statistics.js','backend/RosterStatistics.gs','backend/RosterNotificationStore.gs','shared/excel-export.js'])assert(build.includes(file),'build includes '+file);
const properties={ROSTER_WRITER_ENABLED:'true',ROSTER_OWNER_SCRIPT_ID:'owner'},scope=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key]||null})},ScriptApp:{getScriptId:()=> 'owner'}});vm.runInContext(source,scope);
for(const fn of ['rosterOperationsDispatch_','rosterOperationsContext_','reliefRosterQuota_','publishedEntry_','document_','gsisRequireBackendAction_'])assert.equal(typeof scope[fn],'function',fn+' retained');
assert.equal(scope.GSISAscExport,undefined);assert.equal(scope.GSISLayoutData,undefined);assert.equal(scope.layoutRead_,undefined);assert.equal(scope.prepareLayoutRepository501,undefined);assert.equal(scope.gsisRequireBackendAction_('rosterOperations'),'roster');
for(const action of ['publicLayout','publicCampus','publishReview','change'])assert.throws(()=>scope.gsisRequireBackendAction_(action),e=>e.code==='BACKEND_ROLE_MISMATCH');
console.log(JSON.stringify({check:'Roster composition preserves retained domain/venue helpers and rejects Layout/Deploy routes',removedBytes:Buffer.byteLength(original)-Buffer.byteLength(source),rosterBytes:Buffer.byteLength(source),note:'Source-size change is not a production latency benchmark.'}));
