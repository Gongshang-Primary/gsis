const assert=require('assert/strict'),crypto=require('crypto'),fixture=require('./contacts503-fixture.js');
const request=()=>({requestId:crypto.randomUUID(),changes:[{id:'staff-17',field:'Statutory Name',expected:'Person 17',value:'Updated name'}]});
for(const after of [false,true]){
 const f=fixture(),p=request(),api=f.ctx.Sheets.Spreadsheets.Values,write=api.batchUpdate;let injected=false;
 api.batchUpdate=(...a)=>{if(!injected){injected=true;if(after)write(...a);throw Error('Protected range private-cell-value');}return write(...a);};
 const failed=f.post('saveData',p);assert.equal(failed.ok,false);assert.equal(failed.reference.category,'protected-range');assert.doesNotMatch(JSON.stringify(failed),/private-cell-value/);assert.deepEqual(JSON.parse(f.props.get('CONTACTS_PENDING_V2')),{},'no pointer without acknowledged durable payload');
 const saved=f.post('saveData',p);assert.equal(saved.data.saved,true);assert.equal(f.post('saveData',p).data.duplicate,true);assert.equal(f.sheets.get('contact_save_journal').data.filter(r=>r[0]===p.requestId).length,1);
}
{
 const f=fixture(),key=f.seedSnapshot(request().changes),api=f.ctx.Sheets.Spreadsheets.Values,read=api.batchGet;
 api.batchGet=(id,p)=>{if(p.ranges.some(r=>r.includes('contact_save_journal')))throw Error('Journal unavailable');return read(id,p);};
 const view=f.post('bootstrap');assert.equal(view.ok,true);assert.equal(view.data.viewState.pending,true);assert.equal(view.data.authoritative,false);assert.ok(view.data.user.roles.includes('Admin'));
}
{
 const f=fixture(),key=f.seedSnapshot(request().changes);f.ctx.Session.getEffectiveUser=()=>({getEmail:()=> 'helper@gsps.edu.sg'});let tested=0;
 for(const sh of f.sheets.values()){const get=sh.getRange.bind(sh);sh.getRange=(...a)=>{const r=get(...a);r.canEdit=()=>{tested++;return sh.name!=='contacts';};return r;};}
 f.reset();const props=JSON.stringify([...f.props]);f.ctx.reqId=key.requestId;const report=f.run('inspectContactsWriteAccess504(reqId)');assert.equal(report.executionAccount,'helper@gsps.edu.sg');assert.equal(report.originalActor,'admin@gsps.edu.sg');assert.ok(report.blockedRanges>0);assert.ok(tested>0);assert.ok(report.ranges.some(r=>r.kind==='Commit marker'));assert.doesNotMatch(JSON.stringify(report),/Updated name|Person 17/);assert.equal(f.stats.writes.length,0);assert.equal(f.stats.nativeWrites,0);assert.equal(JSON.stringify([...f.props]),props);
 f.run("validateContactAlias_('GSPS Alias (@gsps.edu.sg)','valid@gsps.edu.sg')");assert.throws(()=>f.run("validateContactAlias_('GSPS Alias (@gsps.edu.sg)','wrong@moe.edu.sg')"),e=>e.status===400);
}
console.log('PASS 504 Contacts: first-stage faults before/after write, safe viewing on journal failure, private error categories and zero-write executor/range diagnostics');
