'use strict';
// The current suite discovers top-level scripts, so keep the focused job tests reachable here.
const {spawnSync}=require('node:child_process'),{existsSync}=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),programs=['worker.mjs','gateway.mjs','ui.cjs','venue-core.cjs','source-retry-ui.cjs'];
const browser=process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium';
if(existsSync(browser))programs.push('browser.cjs');else console.log('Calendar Chromium check skipped: set ROSTER_TEST_CHROMIUM to an installed Chromium executable.');
for(const program of programs){
 const result=spawnSync(process.execPath,['--disable-warning=ExperimentalWarning',path.join(__dirname,'calendar-jobs',program)],{cwd:root,stdio:'inherit',env:{...process.env,ROSTER_TEST_CHROMIUM:browser},timeout:35000});
 if(result.status!==0){if(result.error)console.error(result.error);process.exit(result.status||1);}
}
console.log('PASS Calendar 098j focused job suite is included in current top-level test discovery');
