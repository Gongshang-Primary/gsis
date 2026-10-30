/* Current source recovery opens with current installation boundaries, not obsolete migration guidance. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).gsisRelease,readme=fs.readFileSync(path.join(root,'README.md'),'utf8'),notice=readme.split('## Historical v0.9.7 installation handbook')[0];
if(/^0[.]9[.]9[a-z]?$/.test(version)){
 const settings=require('../package.json'),guide=fs.readFileSync(path.join(root,'docs/v099/SETUP.md'),'utf8');
 for(const name of ['docs/v099/SETUP.html','CHANGELOG_v0.9.9.md','VALIDATION_v0.9.9.md','docs/v099/HANDOVER.md','docs/v099/REQUIREMENTS_STATUS.md','docs/v099/ROSTER_WORKER_ROADMAP.md','docs/v099/SOURCE_REVIEW.md']){
  assert(readme.includes(name),'Current entry point links '+name);assert(fs.existsSync(path.join(root,name)),'Current guide exists '+name);
 }
 assert.equal(settings.gsisPackageKind,'full-suite');assert.equal(Object.keys(settings.gsisComponentVersions).length,18);
 assert(Object.values(settings.gsisComponentVersions).every(value=>value===version),'All production labels match');
 assert.equal(settings.gsisSeparatePackages.length,1);assert.equal(settings.gsisSeparatePackages[0].name,'GSiS_v0.9.9_Timetable_Preparation.zip');assert.equal(settings.gsisSeparatePackages[0].productionInstallation,false);
 assert(/Production Roster remains Google-first/.test(readme));assert(/separate administrator-only timetable preparation package/.test(readme));
 assert(readme.includes('CALENDAR_SYNC_CONTINUE=false'));assert(readme.includes('default-off'));assert(readme.includes('explicit enablement'));
 for(const product of ['Contacts','Deploy','Roster','Calendar','LORD','Venues'])assert(guide.includes(product+'_Backend_v'+version.replace(/[a-z]$/, '')+'.gs'),'Matched backend guidance '+product);
 assert(!readme.includes('## Historical v0.9.7 installation handbook'),'Do not restore obsolete migration instructions');
 console.log('PASS 0.9.9 entry point: current guides, eighteen matched components, Google Roster authority, separate shadow preparation and explicit optional push enablement');
}else if(version==='0.9.8q'){
 const settings=require('../package.json');
 assert.deepEqual(settings.gsisPatchComponents,['calendarFrontend','calendarBackend']);
 for(const name of ['docs/v098q/SETUP.html','docs/v098q/CHANGELOG.md','docs/v098q/VALIDATION.md']){assert(readme.includes(name));assert(fs.existsSync(path.join(root,name)));}
 assert(readme.includes('matched Calendar frontend and backend Q'));assert(readme.includes('other 16 production components stay at P'));
 assert(readme.includes('timetable preparation Worker stays at O'));
 for(const [key,value] of Object.entries(settings.gsisComponentVersions))assert.equal(value,settings.gsisPatchComponents.includes(key)?version:'0.9.8p');
 assert(!readme.includes('## Historical v0.9.7 installation handbook'));
 console.log('PASS Q entry point: Calendar matched pair, current guides, other production P and preparation O preserved');
}else if(version==='0.9.8p'){
 for(const name of ['docs/v098p/SETUP.html','docs/v098p/CHANGELOG.md','docs/v098p/VALIDATION.md']){assert(readme.includes(name));assert(fs.existsSync(path.join(root,name)));}
 assert(!readme.includes('## Historical v0.9.7 installation handbook'),'Current guide must not offer obsolete migration steps');
 assert(readme.includes('Preserve Deploy'));
 console.log('PASS P entry point: current guides, preserved authority, old migration handbook excluded');
}else{
for(const name of [`SETUP_v${version}.md`,`SETUP_v${version}.html`,`HOTFIX_v${version}.md`,`VALIDATION_v${version}.md`]){
 assert(notice.includes(name),'Current entry point links '+name);assert(fs.existsSync(path.join(root,name)),'Current linked guide exists '+name);
}
if(version==='0.9.8k'){
 assert(notice.includes('Roster backend and frontend as a matched pair'));
 assert(notice.includes('helper parity for already-deployed instances only'));
 assert(notice.includes('Other products remain J'));
 assert(!notice.includes('CALENDAR_JOBS'),'The urgent Roster entry point must not prescribe optional Calendar setup');
}else{
 assert(notice.includes('no new database, Worker, Queue'));assert(notice.includes('CALENDAR_JOBS'));assert(notice.includes('optional 18th production Calendar job Worker'));
}
assert(readme.includes('# GSiS Suite v0.9.7'),'Historical body retained');
assert(readme.includes('Its migration and infrastructure instructions are historical'));
console.log('PASS '+version+' recovery README: current setup/hotfix/validation entry points exist, historical handbook is explicit');
}
