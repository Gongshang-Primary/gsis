'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const records=new Map(),storage={get length(){return records.size;},key:i=>[...records.keys()][i]??null,getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,String(value)),removeItem:key=>records.delete(key)},windows=[];
 const scope='alice@gsps.edu.sg|2026-10-14',pointer='roster-relief-active:'+scope;
 async function tab(existingPointer){
  const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;windows.push(w);w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=()=>{};
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js'])w.eval(fs.readFileSync(file,'utf8'));
  Object.defineProperty(w,'localStorage',{configurable:true,value:storage});if(existingPointer)w.sessionStorage.setItem(pointer,existingPointer);
  const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');f.state.absences.push({id:'a',date:f.ctx.today,staffId:'alice',name:'Alice',typeId:'mc',periods:[2],reliefRequired:true,instructions:{}});
  const q=selector=>w.document.querySelector(selector),ctx={profile:f.profile,today:()=>f.ctx.today,container:q('#content'),status(){},api:async(route,p)=>{const r=await w.fetch('/'+route,{body:JSON.stringify(p)}),v=await r.json();if(!r.ok)throw Object.assign(Error(v.error),{status:r.status});return v.data;}};
  w.eval(fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8'));await w.RosterOpsUI.render('Assign Relief',ctx);return {w,q,ctx,id:()=>w.sessionStorage.getItem(pointer),key:()=> 'roster-relief-draft:'+scope+':'+w.sessionStorage.getItem(pointer)};
 }
 try{
  const first=await tab();first.q('[data-manual-select="dora"]').click();const firstKey=first.key(),firstBytes=records.get(firstKey);
  const second=await tab();assert(second.q('[data-recover-draft]'),'new tab offers retained copies explicitly');second.q('[data-manual-select="bob"]').click();const secondKey=second.key(),secondBytes=records.get(secondKey);assert.notEqual(firstKey,secondKey);assert.equal(records.get(firstKey),firstBytes,'second tab cannot overwrite the first draft');
  first.q('[data-save-online]').click();await new Promise(r=>setTimeout(r,30));assert.equal(records.has(firstKey),false,'successful save removes only its own key');assert.equal(records.get(secondKey),secondBytes,'saving one tab leaves the other draft byte-for-byte intact');
  const duplicate=await tab(second.id());assert.notEqual(duplicate.id(),second.id(),'copied session pointer forks into a distinct owned draft');duplicate.q('[data-clear-assignment]').click();assert.equal(records.get(secondKey),secondBytes,'editing recovered duplicate cannot overwrite its source');
  const duplicateKey=duplicate.key();duplicate.w.RosterOpsUI.unmount();duplicate.w.eval(fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8'));await duplicate.w.RosterOpsUI.render('Assign Relief',duplicate.ctx);assert.notEqual(duplicate.key(),duplicateKey,'reloaded runtime claims a fresh owned copy');assert.match(duplicate.q('[data-draft-status]').textContent,/recovered/);
  const fresh=await tab();assert(fresh.q('[data-recover-draft]'));const calls=fresh.w.__fixture.calls.length;fresh.q('[data-recover-draft]').click();assert.equal(fresh.w.__fixture.calls.length,calls,'explicit recovery remains local');assert(records.has(secondKey),'all predecessor copies remain protected');
  console.log('PASS same-user tab draft isolation, own-key cleanup, duplicated-session and reopened recovery without cross-tab overwrite');
 }finally{for(const w of windows)w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
