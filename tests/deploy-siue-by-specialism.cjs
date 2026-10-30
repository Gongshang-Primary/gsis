'use strict';
// 15b: Relief Settings has optional SIUE for PE, Art and Music specialists (blank = general).
const assert=require('node:assert/strict'),R=require('../shared/relief.js');
const {harness}=require('./roster716-calculations.cjs');
const h=harness(),base=h.scope.reliefAnalysis_(h.doc),id='plain',teacher=h.doc.teachers.find(t=>t.id===id);
assert.deepEqual(base.settings.siuePercentBySpecialism,{PE:null,Art:null,Music:null},'older settings read as all inherit');
// Blank overrides: every teacher identical to today.
h.doc.relief={...R.defaults(),...(h.doc.relief||{}),siuePercentBySpecialism:{PE:null,Art:null,Music:null}};
assert.deepEqual(JSON.parse(JSON.stringify(h.scope.reliefAnalysis_(h.doc).rows)),JSON.parse(JSON.stringify(base.rows)),'blank overrides change nothing');
// PE override 0% for a PE specialist (mixed modifier): W_i drops by the whole SIUE term.
teacher.profile={...teacher.profile,'Subject Modifier':'PE, MTL'};
const general=h.scope.reliefAnalysis_(h.doc).byTeacher[id];assert.equal(general.siueBasis,'general');
h.doc.relief.siuePercentBySpecialism={PE:0,Art:null,Music:null};
const pe=h.scope.reliefAnalysis_(h.doc),row=pe.byTeacher[id];
assert.equal(row.siueBasis,'PE');assert.equal(row.siuePercentApplied,0);assert.equal(row.siuePeriods,0);
assert(Math.abs((general.Wi-row.Wi)-general.siuePeriods)<1e-9,'W_i drops by the full SIUE term');assert(row.quota>=general.quota);
for(const r of pe.rows)if(r.id!==id)assert.deepEqual(JSON.parse(JSON.stringify(r)),JSON.parse(JSON.stringify(base.byTeacher[r.id])),'non-specialists unchanged: '+r.id);
// Two specialisms: the lower SIUE applies.
teacher.profile['Subject Modifier']='PE, Art';h.doc.relief.siuePercentBySpecialism={PE:120,Art:40,Music:null};
assert.equal(h.scope.reliefAnalysis_(h.doc).byTeacher[id].siueBasis,'Art');
// Owner study formula: W_i = FTT+PD+Duties+Other+(1+S)(T+OF·Tavg); S=2 general, PE S=0.
const study=(r,S)=>r.form+r.pd+r.duties+r.other+(1+S)*(r.teaching+r.offload*r.tavg);
const ch={form:0,pd:2,duties:3,other:1,teaching:20,offload:0.2,tavg:22};assert.equal(Math.floor(Math.max(0,1*(65-study(ch,2)))),0);assert.equal(Math.floor(Math.max(0,1*(65-study(ch,0)))),34);
assert.throws(()=>R.validate({teachers:[]},{...R.defaults(),siuePercentBySpecialism:{PE:-5}}),/blank or a finite/);
assert.throws(()=>R.validate({teachers:[]},{...R.defaults(),siuePercentBySpecialism:{Science:10}}),/PE, Art and Music/);
console.log('PASS SIUE by specialism: inherit by default, PE 0% removes the SIUE term, others unchanged, lowest of two, invalid refused');
