'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const message='Drive output failed (HTTP 403). Writer lacks permission. <img src=x onerror=alert(1)>',error='ROSTER_DRIVE_OUTPUT · Google PERMISSION_DENIED · '+message;
async function page(name,data){
 const dom=new JSDOM(fs.readFileSync('roster-update/public/'+name+'.html','utf8'),{url:'https://school.test/'+name+'.html',runScripts:'outside-only'}),w=dom.window;
 w.fetch=async path=>({ok:true,json:async()=>({ok:true,data:path==='/api/operations'?{alerts:[],migrationNeeded:0}:data})});
 vm.runInContext(fs.readFileSync('roster-update/public/'+name+'.js','utf8'),dom.getInternalVMContext());await tick();await tick();return dom;
}
(async()=>{
 const now=Date.now(),row={id:'failure',kind:'excel',date:'2026-11-06',started_at:now,status:'failed',error,revision_from:0,revision_to:1,record_count:1,bytes_raw:1,bytes_compressed:1};
 const ledger=await page('backup-ledger',{status:{warnings:[]},config:{enabled:true},rows:[row],requests:[]});assert.match(ledger.window.document.querySelector('#rows').textContent,/Writer lacks permission/);assert.equal(ledger.window.document.querySelectorAll('#rows img').length,0);ledger.window.close();
 const job={job:'daily-outputs',status:'failure',code:'ROSTER_DRIVE_OUTPUT',outputError:{code:'ROSTER_DRIVE_OUTPUT',googleCode:'PERMISSION_DENIED',message},eventAt:now};
 const health=await page('system-health',{checkedAt:now,jobs:[job],recentFailures:[job],storage:{available:true},driveBackup:{admin:true,enabled:true,available:true,status:'failed',lastError:error,warnings:[],daily:{enabled:true,available:true,warnings:[],dates:[{date:row.date,last_error:error,files:[]}]}}});
 for(const id of ['jobs-body','recent-failures','daily-output','drive-backup'])assert.match(health.window.document.getElementById(id).textContent,/Writer lacks permission/,id);
 assert.equal(health.window.document.querySelectorAll('#health-content img').length,0);health.window.close();
 console.log('ledger, daily/full health and job diagnostics show the provider reason as literal text');
})().catch(e=>{console.error(e);process.exitCode=1;});
