'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const page='roster-update/public/timetable-review.html',script='roster-update/public/timetable-review.js';
async function setup(admin=true){
 assert(fs.existsSync(page)&&fs.existsSync(script),'Timetable review page is available');
 const dom=new JSDOM(fs.readFileSync(page,'utf8'),{runScripts:'outside-only',url:'https://roster.test/timetable-review.html'}),calls=[],win=dom.window;
 let failApply=false;
 win.confirm=()=>true;win.fetch=async(url,opt)=>{const body=JSON.parse(opt.body);calls.push(body);let data;
 if(body.operation==='read')data={user:{admin,smc:true},revision:7,alerts:[{date:'2026-11-05',summary:'6 releases need review',affectedCount:6}],migrationNeeded:1,migrationDates:['2026-11-05']};
 else if(body.operation==='previewStaplerMigration')data={digest:'preview-digest',ready:true,needed:1,rows:[{date:'2026-11-05',representation:'draft',sourceId:'pruned',ready:true}]};
 else if(body.operation==='previewTimetableReconcile')data={date:'2026-11-05',digest:'release-digest',affectedCount:6,totalCount:10,requiresConfirmation:true,rows:[{id:'assignment',period:2,staffId:'cover',className:'3 Respect'}]};
 else if(failApply){failApply=false;throw Error('connection lost');}
 else data={migrated:1,savedIds:['assignment']};
 return {ok:true,status:200,json:async()=>({ok:true,data})};};
 win.eval(fs.readFileSync(script,'utf8'));const settle=()=>new Promise(resolve=>setImmediate(resolve));await settle();
 return {win,calls,settle,failNextApply:()=>{failApply=true;},close:()=>win.close()};
}
test('Admin dry run is read only, apply binds digest, uncertain retry preserves request',async()=>{
 const h=await setup();try{const $=id=>h.win.document.getElementById(id);assert.equal($('migration-section').hidden,false);$('preview-migration').click();await h.settle();assert.equal(h.calls.some(row=>row.operation==='migrateStaplerPlans'),false);assert.match($('preview').textContent,/pruned/);
 h.failNextApply();$('apply-preview').click();await h.settle();const first=h.calls.find(row=>row.operation==='migrateStaplerPlans');assert.equal(first.previewDigest,'preview-digest');assert.equal($('retry-action').hidden,false);$('retry-action').click();await h.settle();const retries=h.calls.filter(row=>row.operation==='migrateStaplerPlans');assert.equal(retries.length,2);assert.deepEqual(retries[0],retries[1]);}finally{h.close();}
});
test('SMC sees releases and cannot access Admin migration control',async()=>{
 const h=await setup(false);try{const $=id=>h.win.document.getElementById(id);assert.equal($('migration-section').hidden,true);h.win.document.querySelector('[data-review-date]').click();await h.settle();assert.match($('preview').textContent,/6 of 10/);assert.equal(h.calls.some(row=>row.operation==='confirmTimetableReconcile'),false);$('apply-preview').click();await h.settle();const command=h.calls.find(row=>row.operation==='confirmTimetableReconcile');assert.equal(command.date,'2026-11-05');assert.equal(command.previewDigest,'release-digest');}finally{h.close();}
});
