'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const source=fs.readFileSync('roster-update/public/roster.js','utf8');
const html=fs.readFileSync('roster-update/public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,'');
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
async function until(check){for(let i=0;i<200;i++){if(check())return;await tick();}assert.fail('Timed out waiting for Home state');}
async function fixture(saved,setup){
 const dom=new JSDOM(html,{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 const f={clock:Date.parse('2026-11-03T01:00:00Z'),user:{email:'teacher@school.test',staffId:'teacher',smc:false,admin:false,accessVerified:true},revision:1,rows:[],calls:[],holdMain:true,releaseMain:null,fail:false,frames:[],holdDuties:false,pending:[]};
 const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[f.clock]));}static now(){return f.clock;}};
 w.setInterval=(fn,ms)=>{if(ms===60000)f.poll=fn;return 0;};w.requestAnimationFrame=fn=>f.frames.push(fn);w.structuredClone=structuredClone;
 if(saved)for(const [key,value] of saved)w.sessionStorage.setItem(key,value);
 w.RosterTimetablePreload={create:()=>({start(){},clear(){},invalidate(){},isDue:()=>false,snapshot:()=>({phase:'ready'}),getBaseline:()=>({id:'base'})})};
 w.fetch=async(url,args={})=>{
  const route=String(url).split('/').pop(),p=JSON.parse(args.body||'{}'),ok=data=>({ok:true,status:200,json:async()=>({ok:true,data})});
  if(route==='config')return {ok:true,status:200,json:async()=>({clientId:'fixture'})};if(route==='session')return ok({});
  if(route==='profile')return ok({user:{...f.user},revision:f.revision,entries:[]});
  if(p.operation==='currentDuty'){if(f.holdMain)await new Promise(resolve=>f.releaseMain=resolve);return ok({date:'2026-11-03',available:true,people:[]});}
  if(p.operation==='read'&&p.view==='duties'){
   f.calls.push({date:p.date,icons:!!w.document.querySelector('.function-tile'),busy:w.document.querySelector('#content').inert});
   const data={date:p.date,today:new w.Date().toISOString().slice(0,10),user:{...f.user},myDuties:structuredClone(f.rows)};
   if(f.holdDuties)await new Promise(resolve=>f.pending.push(resolve));
   return f.fail?{ok:false,status:503,json:async()=>({ok:false,error:'Unavailable'})}:ok(data);
  }
  throw Error('Unexpected API '+route+' '+p.operation);
 };
 w.RosterOpsUI={pages:()=>[{name:'Report Absence',icon:'absence-report'},{name:'My Relief Duties',icon:'relief-duties'}],unmount(){},resetPreloads(){},isDirty:()=>false,render:async(name,ctx)=>{f.ctx=ctx;if(name==='My Relief Duties')await ctx.api('operations',{operation:'read',view:'duties',date:'2026-11-04'});ctx.container.innerHTML='<h2>'+name+'</h2>';}};
 f.flush=async()=>{f.frames.splice(0).forEach(fn=>fn());await tick();};
 f.release=async()=>{f.holdMain=false;f.releaseMain?.();await tick();};
 f.text=()=>w.document.querySelector('[data-home-own-relief]')?.textContent;
 f.click=selector=>{const node=w.document.querySelector(selector);assert(node,selector);node.click();};
 f.home=async()=>{f.click('#nav [data-page="Home"]');await until(()=>w.document.querySelector('.function-tile'));await f.flush();};
 f.leave=async()=>{f.click('[data-page="Report Absence"]');await until(()=>w.document.querySelector('#content h2')?.textContent==='Report Absence');};
 f.saved=()=>Object.keys(w.sessionStorage).map(key=>[key,w.sessionStorage.getItem(key)]);
 setup?.(f,w);w.eval(source);await until(()=>w.document.querySelector('.function-tile'));
 return {f,w,close:()=>dom.window.close()};
}
(async()=>{
 const a=await fixture();
 try{
  await a.f.flush();assert.equal(a.f.calls.length,0,'own duties wait until main Home data finishes');assert.equal(a.w.document.querySelector('#content').inert,false,'Home stays usable while main data loads');
  await a.f.release();await until(()=>a.f.text()==='You have no relief duty today.');assert.equal(a.f.calls.length,1);
  await a.f.leave();a.f.clock+=2*60000;await a.f.home();assert.equal(a.f.calls.length,1,'second Home visit beyond the former one-minute cache sends no new request');
  const b=await fixture(a.f.saved());try{await b.f.flush();await b.f.release();await until(()=>b.f.text()==='You have no relief duty today.');assert.equal(b.f.calls.length,0,'sessionStorage survives a document reload');}finally{b.close();}
  for(const setup of [f=>f.revision++,f=>f.user.staffId='other',f=>f.clock+=86400000]){
   const other=await fixture(a.f.saved(),setup);try{await other.f.flush();await other.f.release();await until(()=>other.f.calls.length===1);assert.equal(other.f.text(),'You have no relief duty today.','another revision, staff identity or date requires its own check');}finally{other.close();}
  }
  const corrupt=a.f.saved().map(([key])=>[key,JSON.stringify({key,checkedAt:a.f.clock,periods:['P3']})]);
  const bad=await fixture(corrupt);try{await bad.f.flush();await bad.f.release();await until(()=>bad.f.calls.length===1);}finally{bad.close();}
  a.f.rows=[{date:'2026-11-03',staffId:'teacher',period:4,status:'published'}];a.f.click('#refresh');await until(()=>!a.w.document.querySelector('#refresh').disabled);await a.f.flush();await until(()=>a.f.text()==='Your relief duty today: P4.');assert.equal(a.f.calls.length,2,'explicit Refresh bypasses both caches');
  await a.f.leave();a.f.clock+=10*60000;await a.f.home();await until(()=>a.f.calls.length===3);
  await a.f.leave();a.f.ctx.invalidateOperations(['2026-11-03']);await a.f.home();await until(()=>a.f.calls.length===4);
  await a.f.leave();a.f.fail=true;a.f.click('#refresh');await until(()=>!a.w.document.querySelector('#refresh').disabled);await a.f.home();await until(()=>a.f.text()==='Your relief duty could not be checked. Refresh to retry.');assert.equal(a.f.calls.length,5);
  await a.f.leave();await a.f.home();assert.equal(a.f.calls.length,5,'a failed check does not repeat on each Home visit');
  a.f.fail=false;a.f.click('#refresh');await until(()=>!a.w.document.querySelector('#refresh').disabled);await a.f.flush();await until(()=>a.f.text()==='Your relief duty today: P4.');assert.equal(a.f.calls.length,6,'Refresh retries a failed check');
  a.f.clock+=10*60000;await a.f.poll();assert.equal(a.f.calls.length,7,'existing freshness check renews an expired visible Home result');
 }finally{a.close();}
 const c=await fixture();try{
  c.f.holdMain=false;c.f.rows=[{date:'2026-11-03',staffId:'teacher',period:3,status:'completed'}];c.f.click('[data-page="My Relief Duties"]');await until(()=>c.w.document.querySelector('#content h2')?.textContent==='My Relief Duties');const before=c.f.calls.length;await c.f.home();await until(()=>c.f.text()==='Your relief duty today: P3.');assert.equal(c.f.calls.length,before,'the existing full duty list covers today even when another date was selected');
 }finally{c.close();}
 const d=await fixture(null,f=>{f.holdMain=false;f.holdDuties=true;});try{
  await d.f.flush();await until(()=>d.f.pending.length===1);d.f.rows=[{date:'2026-11-03',staffId:'teacher',period:6,status:'published'}];d.f.click('#refresh');await until(()=>!d.w.document.querySelector('#refresh').disabled);await d.f.flush();await until(()=>d.f.pending.length===2);
  d.f.pending.pop()();await until(()=>d.f.text()==='Your relief duty today: P6.');d.f.pending.pop()();await tick();assert.equal(d.f.text(),'Your relief duty today: P6.','pre-Refresh response cannot overwrite the new result');await d.f.leave();await d.f.home();assert.equal(d.f.calls.length,2,'stale result cannot replace the reusable cache');
 }finally{d.close();}
 console.log('PASS Home duty cache: nonblocking order, memory/session reuse, loaded duty list, Refresh, expiry, change signals and failure retry');
})().catch(error=>{console.error(error);process.exitCode=1;});
