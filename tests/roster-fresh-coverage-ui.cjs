'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require(process.env.GSIS_TEST_JSDOM||'jsdom');
const since='2026-11-05',coverage={since,archiveUrl:'/archive.html'};
const sources=['shared/roster.js','shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','shared/roster-statistics.js','roster-update/public/roster-statistics-ui.js','roster-update/public/roster-calculations.js','roster-update/public/roster-operations-ui.js'];
function setup(){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
 for(const file of sources)w.eval(fs.readFileSync(file,'utf8'));
 return {dom,w,host:w.document.getElementById('content'),close(){w.RosterStatisticsUI.unmount();w.RosterCalculationsUI.unmount();w.RosterOpsUI.unmount();w.close();}};
}
function expectCoverage(host,fresh){
 const note=host.querySelector('[data-history-coverage]'),links=host.querySelectorAll('a[href="/archive.html"]');
 if(fresh){assert(note,'empty fresh views retain their coverage notice');assert.match(note.textContent,/Records since 5 Nov 2026/);assert.equal(links.length,1);assert.match(links[0].textContent,/earlier Google history.*read-only/i);}
 else{assert.equal(note,null,'legacy views do not claim a fresh-start date');assert.equal(links.length,0,'legacy views do not advertise the fresh-start archive');}
}
async function statistics(fresh){
 const h=setup();try{
  const state=h.w.GSISRosterOperations.initial(),calls=[];if(fresh)state.freshStart={effectiveDate:since,fairnessMode:'opening-balances'};
  const user={email:'smc@test.invalid',staffId:'staff',smc:true,admin:false};
  await h.w.RosterStatisticsUI.render({container:h.host,profile:{user},today:()=>since,api:async(route,p)=>{
   assert.equal(route,'operations');calls.push(p);if(p.operation==='statisticsCalendar')return {};
   assert.equal(p.operation,'statistics');const payload=h.w.GSISRosterStatistics.project(state,{user,people:[],today:since,iso:since+'T01:00:00Z'},p),text=JSON.stringify(payload);
   return {schema:1,key:p.from+'|'+p.to,encoding:'json-v1',bytes:Buffer.byteLength(text),data:text};
  }});
  assert.equal(h.host.querySelector('[data-stats-table="absenceSummary"] tbody').textContent,'No matching records.');
  assert.equal(h.host.querySelector('[data-stats-table="reliefTeacher"] tbody').textContent,'No matching records.');
  assert.equal(h.host.querySelector('[data-stats-table="totals"] tbody tr').lastElementChild.textContent,'0');
  expectCoverage(h.host,fresh);
  const mode=h.host.querySelector('[name="mode"]');mode.value='completed';mode.dispatchEvent(new h.w.Event('change',{bubbles:true}));expectCoverage(h.host,fresh);
  assert.equal(calls.filter(p=>p.operation==='statistics').length,1,'changing display mode stays local');
 }finally{h.close();}
}
async function calculations(fresh){
 const h=setup();try{
  const data={name:'Daily teacher',reliefBasis:'daily',asOf:since,completion:{completed:0,...(fresh?{historyCoverage:coverage,openingBalance:{asOfDate:'2026-11-04',cumulativeDone:4,cumulativeQuota:20}}:{})}},calls=[];
  await h.w.RosterCalculationsUI.render({container:h.host,api:async(route,p)=>{calls.push([route,p]);return data;}});
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['operations',{operation:'calculations'}]]);assert.match(h.host.textContent,/Daily roster, no R%/);expectCoverage(h.host,fresh);
  if(fresh){assert.match(h.host.textContent,/Opening balance as of 4 Nov 2026: 4 relief periods and 20 quota periods/);assert.match(h.host.textContent,/Later D1 relief and quota are added separately/);}
  else assert.doesNotMatch(h.host.textContent,/Opening balance/);
 }finally{h.close();}
}
async function duties(fresh,profileOnly=false,historyOnly=false){
 const h=setup();try{
  const user={email:'teacher@test.invalid',staffId:'teacher',smc:false,admin:false},calls=[],profile={user,...(fresh&&profileOnly?{historyCoverage:coverage}:{})};
  const ctx={container:h.host,profile,today:()=>since,status(){},api:async(route,p)=>{calls.push([route,p]);assert.equal(route,'operations');if(p.operation==='history')return {revision:1,history:[],nextOffset:null,...(fresh?{historyCoverage:coverage}:{})};assert.equal(p.operation,'read');assert.equal(p.view,'duties');return {revision:1,date:since,today:since,myDuties:[],mutualRequests:[],pendingNotices:[],timetableNotices:[],dailyTimetable:{date:since,revision:1},...(fresh&&!profileOnly&&!historyOnly?{historyCoverage:coverage}:{})};}};
  await h.w.RosterOpsUI.render('My Relief Duties',ctx);
  assert.match(h.host.querySelector('[data-duty-today]').textContent,/No relief duties assigned for today/);assert.match(h.host.querySelector('[data-duty-past]').textContent,/No past duties/);expectCoverage(h.host,fresh&&!historyOnly);assert.equal(calls.length,1);
  const history=h.host.querySelector('.ops-notification-history');history.open=true;history.dispatchEvent(new h.w.Event('toggle'));await new Promise(setImmediate);assert.match(history.querySelector('[data-notice-history]').textContent,/No notification history\./);expectCoverage(h.host,fresh);assert.equal(calls.at(-1)[1].operation,'history');
 }finally{h.close();}
}
(async()=>{for(const fresh of [true,false]){await statistics(fresh);await calculations(fresh);await duties(fresh);}await duties(true,true);await duties(true,false,true);console.log('PASS fresh coverage UI: empty Statistics, daily My Calculations with opening balance, empty duties/history, response and profile fallbacks, legacy absence of fresh-start claims');})().catch(error=>{console.error(error);process.exitCode=1;});
