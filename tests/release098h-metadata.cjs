/* Current release contract: J production queue is optional; preserved I rehearsal keeps pinned source provenance. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8'),settings=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
if(settings.gsisRelease==='0.9.8n'){require('./release098n-metadata.cjs');}else if(settings.gsisRelease==='0.9.8m'){require('./release098m-metadata.cjs');}else if(settings.gsisRelease==='0.9.8l'){require('./release098l-metadata.cjs');}else if(settings.gsisRelease==='0.9.8k'){require('./release098k-metadata.cjs');}else{
const version='0.9.8j',baseline='0.9.8i',baselineCommit='f512ac6f584c26a027c1cf2aefb3b19d01fd6838';
assert.equal(settings.version,version);assert.equal(settings.gsisRelease,version);assert.equal(lock.version,version);assert.equal(lock.packages[''].version,version);
assert.equal(settings.gsisBaseline,baseline);assert.equal(settings.gsisPatchBaseline,baseline);assert.equal(settings.gsisPatchSourceBase,baselineCommit);
assert.equal(settings.gsisSourceBase,'703d3975e05d64acc512511ae2d09b0942cc900c','Foundation provenance is distinct from the patch baseline');
assert.equal(settings.gsisRehearsalSourceBase,baselineCommit,'The unchanged I rehearsal rebuilds against I shared dependencies');
const components=['contactsFrontend','deployFrontend','layoutFrontend','rosterFrontend','calendarFrontend','lordFrontend','overlordFrontend','starlordFrontend','venuesFrontend','contactsBackend','deployBackend','rosterBackend','calendarBackend','lordBackend','venuesBackend','notificationWorker','operationsWorker','calendarJobWorker'];
assert.deepEqual([...settings.gsisPatchComponents].sort(),[...components].sort());assert.deepEqual(Object.keys(settings.gsisComponentVersions).sort(),[...components].sort());
for(const value of Object.values(settings.gsisComponentVersions))assert.equal(value,version);assert.equal(settings.gsisPatchSetupGuide,true);assert.equal(settings.gsisSourceRecoveryKind,'full-reachable-history');
assert.deepEqual(settings.gsisOptionalProductionComponents,['calendarJobWorker']);
assert.deepEqual(settings.gsisProductionChangedComponents,['rosterFrontend','rosterBackend','calendarFrontend','calendarBackend','venuesBackend','calendarJobWorker']);
assert.equal(settings.gsisVersionHarmonisedComponents.length,12);assert.deepEqual(new Set([...settings.gsisProductionChangedComponents,...settings.gsisVersionHarmonisedComponents]),new Set(components));
assert.deepEqual(settings.gsisSeparatePackages,[{name:'GSiS_v0.9.8i_Rehearsal.zip',purpose:'admin-only parallel rehearsal with dedicated D1 and private R2',productionInstallation:false}]);
for(const prefix of ['CHANGELOG','HOTFIX','VALIDATION','SUITE_MERGE'])assert(read(prefix+'_v'+version+'.md').length>100);
const summary=JSON.parse(read('RELEASE_SUMMARY_v'+version+'.json'));assert.equal(summary.version,version);assert.equal(summary.baseline,baseline);assert.equal(summary.baselineCommit,baselineCommit);assert.equal(summary.componentCount,18);
for(const name of ['timetableCacheChanged','migrationRequired','newInfrastructureRequired','productionDeployed','liveRecordsChanged','messagesSent'])assert.equal(summary[name],false,name);
assert.equal(summary.calendarAppendOnlyHeaderUpgradeRequired,true);assert.equal(summary.productionAuthority,'Google');assert.equal(summary.authorityCutoverPerformed,false);
assert.equal(summary.optionalCalendarJobs.productionInstallation,true);assert.equal(summary.optionalCalendarJobs.newInfrastructureRequired,true);assert.equal(summary.optionalCalendarJobs.directModeWithoutBinding,true);assert.equal(summary.optionalCalendarJobs.liveCloudflareStorageVerified,false);
assert.equal(summary.optionalCalendarJobs.syncContinuation.default,false);assert.equal(summary.optionalCalendarJobs.syncContinuation.startsNewSync,false);assert.equal(summary.optionalCalendarJobs.syncContinuation.replacesExistingScheduler,false);assert.equal(summary.optionalCalendarJobs.syncContinuation.maximumExistingBatchesPerCronInvocation,1);
assert(read('SETUP.md').includes('CALENDAR_SYNC_CONTINUE'),'Current setup entry point states optional continuation default');
assert.equal(summary.separateRehearsal.release,'0.9.8i');assert.equal(summary.separateRehearsal.productionInstallation,false);assert.equal(summary.separateRehearsal.productionActivationAvailable,false);assert.equal(summary.separateRehearsal.liveCloudflareStorageVerified,false);assert.equal(summary.separateRehearsal.sourceCommit,baselineCommit);
const markdown=read('SETUP_v'+version+'.md'),document=new JSDOM(read('SETUP_v'+version+'.html')).window.document;
assert.equal(document.querySelectorAll('script,iframe,form').length,0,'Offline guide never collects a key');
const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);assert.equal(ids.length,new Set(ids).size);
for(const link of document.querySelectorAll('a[href^="#"]'))assert(document.getElementById(link.hash.slice(1)),link.href);
for(const text of [markdown,document.querySelector('main').textContent]){
 for(const phrase of ['33-character','GSIS_SECRET_INVALID','CALENDAR_SESSION_SECRET','LORD_SESSION_SECRET','EXTERNAL_LINK_SECRET','Roster_Backend_v'+version+'.gs','Calendar_Backend_v'+version+'.gs','Venues_Backend_v'+version+'.gs','Roster_Notification_Worker_v'+version+'.txt','GSiS_Calendar_Job_Worker_v'+version+'.txt','2-57/5 * * * *','* * * * *','15 18 * * *','upgradeCalendarToRC19','VENUES_APPS_SCRIPT_URL','CALENDAR_JOBS_DB','CALENDAR_APPS_SCRIPT_URL','CALENDAR_JOBS','CALENDAR_SYNC_CONTINUE','false','original initiating Admin','provider lease','retry deadlines','workers.dev','preview URLs','Calendar_Jobs_schema.sql','Calendar_Jobs_wrangler.example.jsonc','Google stays authoritative','Let teachers see and send WhatsApp to all','Learn about Auto Allocation','no Activate action','GSiS_v0.9.8i_Rehearsal.zip'])assert(text.includes(phrase),'Guide retains current contract: '+phrase);
 assert(!/exactly 32 characters|chosen 32 character key/.test(text),'Existing longer shared keys remain valid');
}
assert.equal(document.querySelectorAll('h2').length,(markdown.match(/^## /gm)||[]).length,'Every guide section is present offline');
const validation=read('VALIDATION_v'+version+'.md');for(const name of ['release084-absence-browser.cjs','roster717-inbox-performance.cjs','roster718-absence-performance-browser.cjs','stapler718a-relief-import.cjs','roster-draft-cell-save-speed.cjs','roster080-batch-backend.cjs','roster719-performance.cjs'])assert(validation.includes(name),'Inherited limit remains visible: '+name);
console.log('PASS current J metadata: 18 components, optional production Calendar jobs, pinned unchanged I rehearsal, preserved authority/settings, current offline guide and inherited limits');

}
