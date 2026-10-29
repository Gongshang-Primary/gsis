'use strict';
// 0.9.9a: teacher relief WhatsApp names period numbers only. Instructions and
// lesson details stay behind the private link.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={console};vm.createContext(ctx);
for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const S=ctx.GSISRosterOperations.shortPublicationSummary,row=(period,kind='assigned')=>({period,kind,assignment:{period,className:'4A',subject:'EL',venue:'C1-01',timeStart:'08:00'},instructions:'Read chapter 3'});
test('new assignment and urgent: count and periods, singular and plural',()=>{
 assert.equal(S([row(3)],false),'1 relief duty: P3.');
 assert.equal(S([row(5),row(3)],false),'2 relief duties: P3, P5.');
 assert.equal(S([row(3),row(3)],false),'1 relief duty: P3.','a combined class counts once per period');
 assert.equal(S([{kind:'assigned',assignment:{period:4}}],false),'1 relief duty: P4.','period read from the assignment when the snapshot lacks it');
});
test('update: only the parts that apply, in order New, Changed, Cancelled',()=>{
 assert.equal(S([row(4),row(3,'instructions'),row(5,'cancelled')],true),'New: P4. Changed: P3. Cancelled: P5.');
 assert.equal(S([row(5,'cancelled')],true),'Cancelled: P5.');
 assert.equal(S([row(2,'instructions')],true),'Changed: P2.');
 assert.equal(S([row(3,'cancelled'),row(3)],true),'Changed: P3.','a period moved to another class or cover reads as Changed');
});
test('no lesson details or instructions reach WhatsApp',()=>{
 const text=S([row(3),row(4,'instructions'),row(6,'cancelled')],true)+S([row(3)],false);
 for(const detail of ['4A','EL','C1-01','08:00','Read chapter 3','\n'])assert(!text.includes(detail),detail);
});
