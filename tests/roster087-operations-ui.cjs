'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{
  w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};w.confirm=()=>true;
  for(const file of ['shared/roster.js','shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-acknowledgement-ui.js','roster-update/public/roster-operations-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
  const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');f.state.absences.push({id:'a',date:f.ctx.today,staffId:'alice',name:'Alice',typeId:'mc',periods:[2],reliefRequired:true,instructions:{}});
  const q=selector=>w.document.querySelector(selector),calls=[];let notifyResolve,holdNotify=true,ackResolve;
  const notice={id:'n1',date:f.ctx.today,status:'pending',publishedAt:f.ctx.iso,snapshotIds:[],timetable:{date:f.ctx.today,periods:[{period:2,start:'08:00',end:'08:30'}],baseline:{cells:[[],[],['EL','4A']]},modified:{cells:[[],[],[]]}},publishedInstructions:[{period:2,instructions:'READ THE PUBLISHED INSTRUCTIONS'}]};
  const ctx={profile:f.profile,acknowledgementOwner:'verified-scope',today:()=>f.ctx.today,container:q('#content'),status(){},api:async(route,p)=>{
   calls.push(structuredClone(p));if(p.operation==='dailyNotify'||p.operation==='notifyDaily'){const data={date:f.ctx.today,today:f.ctx.today,revision:3,allocationRevision:1,canPublish:true,publishedAt:f.ctx.iso,publishedRevision:2,teachers:[{staffId:'bob',name:'Bob',changed:true,rows:[{period:2,kind:'relief',subject:'EL',className:'4A'}]}]};if(p.operation==='notifyDaily'&&holdNotify)await new Promise(resolve=>notifyResolve=resolve);return {...data,notificationsQueued:1,notificationDispatch:{state:'queued'}};}
   if(p.operation==='acknowledge')return new Promise(resolve=>ackResolve=()=>resolve({acknowledgementOnly:true,revision:5,notice:{...notice,status:'acknowledged',acknowledgedAt:f.ctx.iso},acknowledged:{timetableNoticeId:'n1',snapshotIds:[],acknowledgedAt:f.ctx.iso}}));
   if(p.view==='duties')return {revision:4,today:f.ctx.today,date:f.ctx.today,timetableNotices:[notice],pendingNotices:[],myDuties:[],mutualRequests:[],dailyTimetable:{...notice.timetable,revision:4}};
   const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),v=await response.json();if(!response.ok)throw Object.assign(Error(v.error),{status:response.status});return v.data;
  }};
  await w.RosterOpsUI.render('Daily Notify',ctx);assert.match(q('.ops-notify-publication').textContent,/06:00:00 SGT/);q('[data-notify-teacher="bob"]').click();assert(notifyResolve);
  await w.RosterOpsUI.render('Assign Relief',ctx);assert(!q('[data-ops-body]').inert);q('[data-manual-select="dora"]').click();assert(q('[data-draft-status]'),'notification enqueue does not block local assignment');assert(!q('[data-save-online]').disabled,'notification-only pending request does not block roster saving');notifyResolve();await new Promise(r=>setTimeout(r,5));
  await w.RosterOpsUI.render('My Relief Duties',ctx);const article=q('[data-timetable-notice="n1"]'),action=article.querySelector('[data-ack-notice]'),grid=article.querySelector('.ops-daily-overlay');assert(action);assert(action.compareDocumentPosition(grid)&w.Node.DOCUMENT_POSITION_FOLLOWING,'acknowledge is before timetable');action.click();assert(!q('[data-ops-body]').inert,'acknowledgement does not block the duties page');assert.equal(q('dialog.ops-progress'),null);ackResolve();await new Promise(r=>setTimeout(r,5));assert.match(article.querySelector('[data-notice-action]').textContent,/Acknowledged/);
  assert(calls.find(p=>p.operation==='acknowledge').compact);console.log('PASS v087 operations UI: publication seconds/SGT, background notification vs local save, first-row compact acknowledgement, nonblocking durable acceptance');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
