'use strict';
// 0.9.9a: Assign Relief shows a persistent published-time chip (time only, no publisher).
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8');
const pick=re=>{const m=src.match(re);assert(m,'missing '+re);return m[0];};
const code=[pick(/function publicationStamp\(value\)\{[^\n]*\}/),pick(/const chipTime=new Intl\.DateTimeFormat\([^)]*\);/),pick(/function updatePublishedChip\(s\)\{[\s\S]*?\n \}/)].join('\n');
const chip={textContent:'',title:'',dataset:{}},ctx={$:(_,sel)=>sel==='[data-published-chip]'?chip:null};vm.createContext(ctx);vm.runInContext(code,ctx);
const show=data=>{vm.runInContext('updatePublishedChip(__s)',Object.assign(ctx,{__s:{date:'2026-10-30',data}}));return {text:chip.textContent,state:chip.dataset.state,title:chip.title};};
assert.deepEqual(show({date:'2026-10-30'}),{text:'Not published',state:'none',title:''});
let r=show({date:'2026-10-30',publishedAt:'2026-10-29T22:52:10.000Z',publishedRevision:4,allocationRevision:4});
assert.equal(r.text,'Published 06:52');assert.equal(r.state,'current');assert.match(r.title,/30 Oct 2026.*06:52:10 SGT/);
r=show({date:'2026-10-30',publishedAt:'2026-10-29T22:52:10.000Z',publishedRevision:4,allocationRevision:5});
assert.equal(r.text,'Published 06:52 · changes not yet visible');assert.equal(r.state,'stale');
assert.equal(show({date:'2026-10-29',publishedAt:'2026-10-28T22:00:00.000Z'}).text,'','data for another date shows nothing');
assert.doesNotMatch(src.match(/function updatePublishedChip\(s\)\{[\s\S]*?\n \}/)[0],/publishedBy|actor/,'no publisher name');
assert.match(src,/data-published-chip/);
console.log('PASS published chip: not published, published time in SGT, amber when saved changes are newer, correct day, no publisher');
