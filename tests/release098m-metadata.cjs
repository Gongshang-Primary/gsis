'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),settings=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
if(settings.gsisRelease==='0.9.8n'){require('./release098n-metadata.cjs');}else{
const version='0.9.8m',baseline='0.9.8l',baselineCommit='b029e0972ec1b88fad17d30829861b1e7a3b36ec',required=['rosterFrontend','rosterBackend'],optional=['notificationWorker','operationsWorker'],included=[...required,...optional];
assert.equal(settings.version,version);assert.equal(settings.gsisRelease,version);assert.equal(lock.version,version);assert.equal(lock.packages[''].version,version);
assert.equal(settings.gsisBaseline,baseline);assert.equal(settings.gsisPatchBaseline,baseline);assert.equal(settings.gsisPatchSourceBase,baselineCommit);
assert.equal(settings.gsisSourceBase,'703d3975e05d64acc512511ae2d09b0942cc900c');
assert.deepEqual(settings.gsisPatchComponents,included);assert.deepEqual(settings.gsisOptionalProductionComponents,optional);assert.deepEqual(settings.gsisProductionChangedComponents,required);assert.deepEqual(settings.gsisSharedHelperParityComponents,optional);
const retainedL=['calendarFrontend','calendarBackend','deployFrontend','deployBackend'];
assert.equal(Object.keys(settings.gsisComponentVersions).length,18);for(const [component,pin] of Object.entries(settings.gsisComponentVersions))assert.equal(pin,included.includes(component)?version:retainedL.includes(component)?baseline:'0.9.8j',component+' must retain its scoped version');
assert.equal(settings.gsisPatchSetupGuide,true);assert.equal(settings.gsisSourceRecoveryKind,'full-reachable-history');assert.equal(settings.gsisRehearsalSourceBase,'f512ac6f584c26a027c1cf2aefb3b19d01fd6838');
assert.deepEqual(settings.gsisSeparatePackages,[{name:'GSiS_v0.9.8i_Rehearsal.zip',purpose:'admin-only parallel rehearsal with dedicated D1 and private R2',productionInstallation:false}]);
const summary=JSON.parse(read('RELEASE_SUMMARY_v'+version+'.json'));assert.deepEqual(summary,JSON.parse(read('RELEASE_SUMMARY.json')));assert.equal(summary.version,version);assert.equal(summary.baseline,baseline);assert.equal(summary.baselineCommit,baselineCommit);assert.equal(summary.componentCount,4);assert.equal(summary.productionAuthority,'Google');
for(const key of ['authorityCutoverPerformed','migrationRequired','timetableCacheChanged','newInfrastructureRequired','productionDeployed','liveRecordsChanged','messagesSent','automaticRunInvokedByPreparation','existingProtectedChoicesRewritten','scheduledCadenceChanged'])assert.equal(summary[key],false,key);
assert.equal(summary.manualAllocationAnyTime,true);assert.equal(summary.elapsedSlotsProtected,true);assert.equal(summary.manualOptimisationCutoffSingapore,null);assert.equal(summary.scheduledOptimisationCutoffSingapore,'06:29');assert.equal(summary.autoAllocateMode,'reoptimise-unstarted-unpublished-automatic');assert.equal(summary.autoFillBlanksMode,'fill-only');assert.equal(summary.separateRehearsal.unchanged,true);assert.equal(summary.separateRehearsal.productionInstallation,false);
const markdown=read('SETUP_v'+version+'.md'),document=new JSDOM(read('SETUP_v'+version+'.html')).window.document;
assert.equal(document.querySelectorAll('script,iframe,form').length,0,'Offline instructions collect no credential');assert.equal(document.querySelectorAll('h2').length,(markdown.match(/^## /gm)||[]).length);
for(const content of [markdown,document.querySelector('main').textContent])for(const phrase of ['Roster_Backend_v0.9.8m.gs','Roster_Frontend_v0.9.8m.zip','Roster_Notification_Worker_v0.9.8m.txt','GSiS_Operations_Worker_v0.9.8m.txt','33-character','06:29','Auto-allocate','Auto-fill blanks','any time','already-started','published','manual','peer','GSIS_SECRET','Google stays authoritative','15 18 * * *','2-57/5 * * * *','* * * * *','GSiS_v0.9.8i_Rehearsal.zip'])assert(content.includes(phrase),'Setup must state '+phrase);
assert.equal(document.querySelectorAll('h2')[0].textContent,'1. Update the existing Roster backend');assert.equal(document.querySelectorAll('h2')[1].textContent,'2. Update the existing Roster Pages frontend');
assert(!document.querySelector('main').textContent.includes('Deploy_Backend_v0.9.8m.gs'),'M must not require a Deploy update');assert(!document.querySelector('main').textContent.includes('Calendar_Backend_v0.9.8m.gs'),'M must not require a Calendar update');
for(const prefix of ['CHANGELOG','HOTFIX','VALIDATION','SUITE_MERGE'])assert(read(prefix+'_v'+version+'.md').length>100);
const validation=read('VALIDATION_v'+version+'.md');for(const name of ['roster-draft-cell-save-speed.cjs','roster080-batch-backend.cjs','roster719-performance.cjs','release084-absence-browser.cjs','roster717-inbox-performance.cjs','roster718-absence-performance-browser.cjs','stapler718a-relief-import.cjs'])assert(validation.includes(name));
assert(read('roster-update/public/_worker.js').includes("version:'"+version+"'"),'Roster config must report its shipped component version');
assert(read('roster-update/public/edge-roster.js').includes("version:'"+version+"'"),'Private Roster profile must report its shipped component version');
console.log('PASS M scoped metadata and offline guide: two required Roster files, two optional parity Workers, manual anytime with elapsed/protected slots fixed, scheduled cutoff retained and unrelated L/J versions preserved');

}
