const assert=require('node:assert/strict'),crypto=require('node:crypto'),fixture=require('./contacts503-fixture.js');
const request=()=>({requestId:crypto.randomUUID()});
// Each stage is interrupted once. A failed API request never switches transport.
for(const stage of ['journal','data','lost-ack']){
 const f=fixture(),input=request(),api=f.ctx.Sheets.Spreadsheets.Values,write=api.batchUpdate;let fired=false;
 const original=f.sheets.get('contacts').data.map(r=>r.slice()),ids=original.slice(1).map(r=>r[17]);
 api.batchUpdate=(p,id)=>{const isJournal=p.data.some(x=>x.range.includes("'contact_recalculate_journal'")),isData=p.data.some(x=>x.range.includes("'contacts'"));if(!fired&&(stage==='journal'&&isJournal||stage==='data'&&isData)){fired=true;throw Error('Interrupted '+stage);}const out=write(p,id);if(!fired&&stage==='lost-ack'&&p.data.some(x=>x.values[0]?.[0]==='Applied')){fired=true;throw Error('Acknowledgement lost');}return out;};
 const failed=f.post('recalculateData',input);assert.equal(failed.ok,false);assert.ok(fired);assert.equal(f.getHeld(),false);
 if(stage==='data'){
  const view=f.post('bootstrap');assert.equal(view.ok,true);assert.equal(view.data.viewState.pending,true);assert.equal(f.post('saveData',{requestId:crypto.randomUUID(),changes:[]}).ok,false);
  const status=f.post('recoveryStatus');assert.equal(status.ok,true);const pending=status.data.pending.find(x=>x.kind==='recalculate');assert.ok(pending?.recoverable);
  const denied=f.post('recoverSave',{requestId:input.requestId,digest:pending.digest},'kp@gsps.edu.sg');assert.equal(denied.status,403);
  const recovered=f.post('recoverSave',{requestId:input.requestId,digest:pending.digest},'other-admin@gsps.edu.sg');assert.equal(recovered.ok,true);assert.equal(recovered.data.saved,true);
 }
 const retry=f.post('recalculateData',input);assert.equal(retry.ok,true,JSON.stringify(retry));assert.equal(retry.data.saved,true);assert.equal(retry.data.recalculated,181);assert.equal(f.sheets.get('contact_recalculations').data.length,2,'One audit entry for the original request');
 assert.deepEqual(f.sheets.get('contacts').data.slice(1).map(r=>r[17]),ids,'Staff IDs stay unchanged');assert.equal(f.sheets.get('contacts').data[0][11],'EO Appt Level');assert.equal(f.sheets.get('roles').data[0][12],'EO Appt Level');
 assert.ok(f.sheets.get('contacts').formulas.slice(1).every(r=>!r[0]&&!r[11]));assert.equal(f.props.get('CONTACT_VALUE_MIGRATION_BACKUP'),'backup');assert.equal(f.props.get('CONTACTS_PENDING_V2'),'{}');
 f.reset();const duplicate=f.post('recalculateData',input);assert.equal(duplicate.data.duplicate,true);assert.equal(f.stats.writes.length,0);assert.equal(f.post('saveReceipt',input).data.saved,true);
 assert.equal(f.post('recalculateData',request(),'kp@gsps.edu.sg').status,403);
}
// Native writes can fail between ranges; the before-image and durable plan survive.
{
 const f=fixture(),input=request();f.ctx.Sheets=undefined;const contact=f.sheets.get('contacts'),get=contact.getRange.bind(contact);let once=true;
 contact.getRange=(...args)=>{const range=get(...args),set=range.setValues;range.setValues=function(values){if(args[0]>=2&&once){once=false;set.call(this,values);throw Error('Partial native write');}return set.call(this,values);};return range;};
 assert.equal(f.post('recalculateData',input).ok,false);assert.equal(f.post('bootstrap').data.viewState.pending,true);assert.equal(f.post('recalculateData',input).data.saved,true);assert.equal(f.sheets.get('contact_recalculations').data.length,2);
}
{
 const f=fixture();f.reset();const out=f.post('recalculateData',request());assert.equal(out.ok,true,JSON.stringify(out));assert.ok(f.stats.writes.length<=3,'Small fixture is bounded preparation plus completion, not per-row requests');assert.ok(f.stats.writes.every(r=>r.length<=100));
}
// Fragmented dirty columns exceed one data batch. A reader still gets the
// complete before-image after the first batch and recovery replays the plan.
{
 const f=fixture();assert.equal(f.post('recalculateData',request()).ok,true);const sh=f.sheets.get('contacts');
 for(let i=1;i<182;i++){const col=i%2?0:11;sh.formulas[i][col]='=LEGACY()';}
 const input=request(),api=f.ctx.Sheets.Spreadsheets.Values,write=api.batchUpdate;let dataCalls=0,interrupted=false;
 api.batchUpdate=(p,id)=>{if(p.data.some(x=>x.range.startsWith("'contacts'!"))&&++dataCalls===2&&!interrupted){interrupted=true;throw Error('Between bounded data batches');}return write(p,id);};
 assert.equal(f.post('recalculateData',input).ok,false);assert.ok(interrupted);assert.equal(f.post('bootstrap').data.viewState.pending,true);assert.equal(f.post('recalculateData',input).data.saved,true);assert.equal(sh.formulas.slice(1,182).some(r=>r[0]||r[11]),false);assert.equal(f.sheets.get('contact_recalculations').data.length,3);
}
console.log('PASS 508 Contacts Recalculate: bounded exact spans, appointment/formula migration, backup and ID preservation, journal/data interruptions, native partial writes, current Admin recovery, lost acknowledgement, duplicate and receipt.');
