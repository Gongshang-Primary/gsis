'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('roster-update/public/roster.js','utf8'),start=source.indexOf(' async function warmHomeReport(');assert(start>=0,'Home warms missing dated report context without a pointer gesture');
const code=source.slice(start,source.indexOf('\n function ',start+1)),date='2026-10-14',tomorrow='2026-10-15',now=Date.now(),tile={isConnected:true},fresh={checkedAt:now,dates:Object.fromEntries([date,tomorrow].map(date=>[date,{date,available:true,schoolDay:true,parity:'even'}]))};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(value){let calls=0,owner='account-a';const box={Promise,Date,sessionEpoch:1,sequence:2,page:'Home',today:()=>date,cacheOwner:()=>owner,getReportForm:async()=>({schema:1}),restoreCalendarContext:async()=>value};vm.runInNewContext(code,box);return {box,run:()=>box.warmHomeReport(tile,()=>{calls++;return Promise.resolve();}),calls:()=>calls,owner:value=>owner=value};}
(async()=>{
 for(const value of [null,{...fresh,checkedAt:now-300001},{...fresh,dates:{[date]:fresh.dates[date]}}]){const h=fixture(value);await h.run();assert.equal(h.calls(),1,'missing/expired/incomplete Calendar context starts one existing report preload');}
 const h=fixture(fresh);await h.run();assert.equal(h.calls(),0,'valid today and tomorrow context avoids another report request');
 for(const change of [h=>h.owner('account-b'),h=>h.box.sessionEpoch++,h=>h.box.sequence++,h=>h.box.page='Report Absence',()=>tile.isConnected=false]){tile.isConnected=true;const h=fixture(null),wait=deferred();h.box.getReportForm=()=>wait.promise;const pending=h.run();change(h);wait.resolve({schema:1});await pending;assert.equal(h.calls(),0,'stale Home mount cannot start a report warm');}
 tile.isConnected=true;console.log('PASS v0.9.3a Home report warm: missing/expired window only, current today+tomorrow reuse, no wait before navigation, owner/session/mount guards');
})().catch(e=>{console.error(e);process.exitCode=1;});
