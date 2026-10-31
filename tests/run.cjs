const {readdirSync,mkdirSync}=require('fs'),{spawnSync}=require('child_process'),path=require('path');
process.chdir(path.join(__dirname,'..'));process.env.TZ='Asia/Singapore';mkdirSync('verification',{recursive:true});
const historical={
 'model403.cjs':'original geometry; verify409-landmark.cjs is current',
 'model405.cjs':'original geometry; verify409-landmark.cjs is current',
 'workload407.cjs':'original workload policy; workload408.cjs is current',
 'roster700-operations.cjs':'superseded advisory R and publication policy; roster701-r17/r18/r20 tests are current',
 'roster700-gateway.mjs':'superseded universal four-field sender; roster701-gateway-integration.mjs and Chromium external UI are current',
 'roster700-review.cjs':'superseded policy/time fixtures; roster701-integrity-review.cjs retains current security and integrity coverage',
 'roster700-ui.cjs':'superseded immediate-submit and legacy allocation UI; R03-R20 Chromium, roster701 operations speed, current 605/609 UI tests cover the current flows'
};
if(['0.9.8p','0.9.8q'].includes(require('../package.json').gsisRelease)){
 // These validate a past release's exact inventory/labels, not runtime behavior.
 // Current P/Q inventory, authority boundaries and offline guides have explicit gates.
 for(const file of ['release098h-metadata.cjs','release098k-metadata.cjs','release098l-metadata.cjs','release098m-metadata.cjs','release098n-metadata.cjs','release098o-metadata.cjs'])historical[file]='superseded release-specific inventory; release098p-metadata.cjs and package.cjs verify the current full suite';
}
if(require('../package.json').gsisRelease==='0.9.8q'){
 historical['release098p-metadata.cjs']='past full-suite P inventory and labels; release098q-metadata.cjs and package.cjs verify the Calendar-only Q patch';
}
if(require('../package.json').gsisRelease==='0.9.9'){
 // Exact past-release inventories are historical; runtime/security checks stay selected.
 for(const file of ['release098h-metadata.cjs','release098k-metadata.cjs','release098l-metadata.cjs','release098m-metadata.cjs','release098n-metadata.cjs','release098o-metadata.cjs','release098p-metadata.cjs','release098q-metadata.cjs'])historical[file]='past release inventory and labels; release099-metadata.cjs and package.cjs verify the harmonized 0.9.9 full suite';
}
for(const [f,why] of Object.entries(historical))console.log(f,'HISTORICAL:',why);
if(process.env.GSIS_RUN_HISTORICAL_BENCHMARKS!=='1'){
 // These programs still execute every current assertion. Only comparative branches
 // need original Git objects; never count an absent baseline as a comparison pass.
 const comparisons={'release084-absence-browser.cjs':'v0.8.3','roster717-inbox-performance.cjs':'v0.7.16','roster718-absence-performance-browser.cjs':'v0.7.17','stapler718a-relief-import.cjs':'32d2c2d17621319ba1d57aea34046229544f5513','roster082-notify-performance-browser.cjs':'Git HEAD','roster088-notify-refresh-browser.cjs':'Git HEAD'};
 for(const [file,baseline] of Object.entries(comparisons))console.log(file,'HISTORICAL COMPARISON NOT RUN:',baseline,'— current behavior assertions remain selected.');
}
const files=readdirSync(__dirname).filter(n=>/\.(cjs|mjs)$/.test(n)&&!['run.cjs','dom-helper.cjs','preview-server.cjs','roster701-fixture.cjs','import708-fixture.cjs','roster701-adapter.cjs','roster701-operations-speed-browser.cjs','load-stapler-leases.cjs','load-backend-role.cjs'].includes(n)&&!historical[n]);
// Production-size end-to-end programs need longer than the default per-program limit.
const slow=new Map([['roster-d1-mirror-integration.mjs',180000]]);
let failed=0;for(const f of files){const r=spawnSync(process.execPath,[path.join(__dirname,f)],{encoding:'utf8',timeout:slow.get(f)||45000});console.log(f,r.status===0?'PASS':'FAIL');if(r.status!==0){failed++;console.log(r.stdout,r.stderr);}}
console.log(`${files.length-failed}/${files.length} current scripts passed`);process.exitCode=failed?1:0;
