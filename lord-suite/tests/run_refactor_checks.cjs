// Compare real production functions with the archived v1.5 source, using identical service/DOM boundaries.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {harness,plain}=require('./backend_harness.cjs');
const {browser,element,worker,response,staff}=require('./frontend_harness.cjs');
const root=path.resolve(__dirname,'..'),oldRoot=path.join(__dirname,'baselines/v1.5/Source');
const previous=fs.readFileSync(path.join(oldRoot,'backend/Code.gs'),'utf8');
const current=fs.readFileSync(path.join(root,'Source/backend/Code.gs'),'utf8');
const settingsContract=require('./settings_contract_changes.cjs');
const propertyContract=require('./property_policy_contract_changes.cjs');
const results=[],measurements=[];
async function test(name,fn){try{await fn();results.push({name,ok:true});}catch(error){results.push({name,ok:false,error:error.stack});}}
function seeded(source,{count=1500,selected=12,linked=true}={}){
  const h=harness({source}),c=h.ctx;h.now=Date.parse('2026-10-09T03:00:00Z');
  h.contacts.data[1][4]='Test Administrator';h.contacts.data[2][4]='Test Staff';
  h.contacts.data[2][5]='81234567';
  for(let i=0;i<count;i++){
    const relevant=i>=count-selected,day=relevant?'2026-10-09':`2026-09-${String(i%28+1).padStart(2,'0')}`;
    const status=['OPEN','RETURNED','RETURNED WITH ISSUES','PENDING_COLLECTION'][i%4];
    const returned=!['OPEN','PENDING_COLLECTION'].includes(status),id='S-'+i;
    const booking=Array(c.BOOKING_HEADERS.length).fill('');
    Object.assign(booking,{0:'B-'+i,1:i%11===0?'CANCELLED':returned?'COMPLETED':status==='OPEN'?'COLLECTED':'BOOKED',2:'Staff',4:'5A',5:'SCI',6:new h.Clock(day+'T00:00:00+08:00'),7:'Cart A',8:'Tablet',9:14,10:'1',11:'2',12:i%2===0,13:i%3===0,14:'Keep this note',20:linked?id:'',26:'Staff',28:'admin@gsps.edu.sg',29:'Admin'});
    h.sheets.Bookings.data.push(booking);
    const session=Array(c.SESSION_HEADERS.length).fill('');
    Object.assign(session,{0:id,1:status,2:'Staff',3:returned?'Admin':'',4:'5A',5:'SCI',6:'Cart A',7:new h.Clock(day+'T08:00:00+08:00'),8:returned?new h.Clock(day+'T09:30:00+08:00'):'',9:2,10:14,11:returned?13:'',12:'Loan note '+i,13:returned?'Return note '+i:'',22:'GSPS',24:returned?'GSPS':'',26:true,28:14,29:'stylus-loan-'+i,30:'https://example.test/loan',34:returned?13:'',35:returned?'stylus-return-'+i:'',36:returned?'https://example.test/return':'',37:returned?false:''});
    h.sheets[c.LORD_CONFIG.SHEETS.SESSIONS].data.push(session);
    for(let t=0;t<2;t++){
      const trolley=Array(c.TROLLEY_HEADERS.length).fill('');
      Object.assign(trolley,{0:'T-'+i+'-'+t,1:id,3:'Trolley '+t,4:7,5:'loan-'+i+'-'+t,6:'https://example.test/photo',7:returned?6:'',8:returned?'return-'+i+'-'+t:'',9:returned?'https://example.test/return':'',10:'Yes',11:returned?'No':'',12:returned?'Yes':'',13:status==='RETURNED WITH ISSUES',14:status==='RETURNED WITH ISSUES'?'Screen cracked':''});
      h.sheets[c.LORD_CONFIG.SHEETS.TROLLEYS].data.push(trolley);
    }
  }
  let trolleyConversions=0;const convert=c.normaliseOverlordBoolean_;
  c.normaliseOverlordBoolean_=value=>{trolleyConversions++;return convert(value);};
  h.stats=()=>({rangeReads:h.reads.length,cellsRead:h.reads.reduce((n,r)=>n+r.n*r.w,0),dateFormats:h.dateFormats,trolleyConversions});
  return h;
}
function probe(h,request,warm){
  if(warm)h.get(request);
  h.reads=[];h.logs=[];h.dateFormats=0;
  const before=h.stats();const output=h.get(request);
  assert.equal(output.ok,true,output.error);
  assert.equal(h.writes.length+h.batches.length+h.photos.length+h.sends.length,0,'Feed caused a write or notification');
  const stats=h.stats();stats.trolleyConversions-=before.trolleyConversions;
  return {output,stats};
}
function normalizeFunction(fn){return fn.toString().replace(/^(async )?function\s*\w*\s*\(/,(_,a)=>(a||'')+'function(');}
(async()=>{
  await test('Historical functions unchanged except reviewed v1.6 reads and v1.7 fixes',()=>{
    const old=settingsContract.context(previous),now=settingsContract.context(current);
    const changedReads=new Set(['getOverlordBookings_','getOverlordMovements_','getOverlordTrolleyMap_','getStarlordBoardData_','getStarlordSessionMap_']);
    for(const name of Object.keys(old)){
      if(typeof old[name]==='function'){
        if(require('./evidence_contract_changes.cjs').changed.includes(name)||require('./booking_speed_contract_changes.cjs').changed.includes(name)||propertyContract.changed.includes(name)||settingsContract.changed.includes(name)||changedReads.has(name)||require('./v17_allowed_changes.cjs').includes(name)||require('./v18_contract_changes.cjs').changed.includes(name)||require('./gsis_contract_changes.cjs').changed.includes(name))continue;
        assert.equal(now[name]?.toString().replace('LORD Suite Backend v1.7','LORD Suite Backend v1.5'),require('./gsis_contract_changes.cjs').expectedBuildMetadata(name,old[name].toString()),name);
      }else{
        const a=settingsContract.value(old,name),b=settingsContract.value(now,name);propertyContract.compareConfig(name,a,b);if(name==='LORD_CONFIG'){b.VERSION=a.VERSION;b.RELEASE_CHANNEL=a.RELEASE_CHANNEL;}
        assert(JSON.stringify(a)===JSON.stringify(b),name+' configuration changed');
      }
    }
  });
  for(const action of ['dashboard','starlordBoard'])for(const mode of ['cold','warm','forced','empty-day','no-linked-session'])await test(`${action} ${mode}: complete response equals v1.5 with no writes`,()=>{
    const fixture={linked:mode!=='no-linked-session'};
    const request={action,date:mode==='empty-day'?'2027-01-01':'2026-10-09',...(mode==='forced'?{forceRefresh:'1',authEmail:'admin@gsps.edu.sg',authSub:'admin-sub',authIsAdmin:true}:{})};
    const old=probe(seeded(previous,fixture),request,mode==='warm'),now=probe(seeded(current,fixture),request,mode==='warm');
    assert.deepEqual(now.output,{...old.output,gsisBuildLabel:require('../../package.json').gsisBuildLabel});
    // Privileged forced reads additionally recheck the current six-column admin row.
    assert(now.stats.cellsRead<=old.stats.cellsRead+(mode==='forced'?6:0));assert(now.stats.dateFormats<old.stats.dateFormats);
    if(action==='dashboard')assert(now.stats.trolleyConversions<old.stats.trolleyConversions);
    measurements.push({action,mode,historyBookings:1500,historySessions:1500,selectedSessions:mode==='empty-day'?0:12,before:old.stats,after:now.stats});
  });
  for(const action of ['dashboard','starlordBoard'])await test(`${action}: fresh read sees edits after prior request`,()=>{
    const h=seeded(current,{count:1,selected:1});h.sheets.Bookings.data[1][1]='BOOKED';
    const first=h.get({action,date:'2026-10-09'});assert(first.ok);assert.equal((action==='dashboard'?first.data.bookings:first.bookings).length,1);
    h.sheets.Bookings.data[1][6]=new h.Clock('2026-10-10T00:00:00+08:00');
    const second=h.get({action,date:'2026-10-09'});assert(second.ok);assert.equal((action==='dashboard'?second.data.bookings:second.bookings).length,0);
  });
  await test('Singapore midnight, overnight returns, orphan movements and duplicate linked bookings retain v1.5 results',()=>{
    for(const action of ['dashboard','starlordBoard']){
      const outputs=[];
      for(const source of [previous,current]){
        const h=seeded(source,{count:6,selected:6}),c=h.ctx,s=h.sheets[c.LORD_CONFIG.SHEETS.SESSIONS].data;
        h.sheets.Bookings.data[1][1]='BOOKED';h.sheets.Bookings.data[1][6]=new h.Clock('2026-10-08T16:00:00Z');
        h.sheets.Bookings.data[2][6]=new h.Clock('2026-10-08T15:59:59.999Z');
        s[1][7]=new h.Clock('2026-10-08T15:59:59Z');s[1][8]=new h.Clock('2026-10-08T16:00:00Z');s[1][1]='RETURNED';
        h.sheets.Bookings.data[3][20]=s[4][0];h.sheets.Bookings.data[4][20]=s[4][0];
        s[5][0]='ORPHAN';outputs.push(h.get({action,date:'2026-10-09'}));
      }
      assert(outputs[0].ok&&outputs[1].ok);assert.deepEqual(outputs[1],{...outputs[0],gsisBuildLabel:require('../../package.json').gsisBuildLabel});
    }
  });
  await test('Empty workbooks and all-cancelled boards retain the exact response shape',()=>{
    for(const action of ['dashboard','starlordBoard'])for(const count of [0,1]){
      const outputs=[previous,current].map(source=>{const h=seeded(source,{count,selected:count});return h.get({action,date:'2026-10-09'});});
      assert(outputs.every(x=>x.ok));assert.deepEqual(outputs[1],{...outputs[0],gsisBuildLabel:require('../../package.json').gsisBuildLabel});
    }
  });
  await test('Active feeds still reject invalid Session headers and untrusted proxy credentials',()=>{
    for(const action of ['dashboard','starlordBoard']){
      const h=seeded(current,{count:2,selected:2});
      assert.equal(h.get({action,proxySecret:'untrusted'}).ok,false);
      h.sheets[h.ctx.LORD_CONFIG.SHEETS.SESSIONS].data[0][0]='WRONG';
      assert.equal(h.get({action,date:'2026-10-09'}).ok,false);
    }
  });
  await test('Optional narrow Session/Trolley maps retain the original full-map maintenance call',()=>{
    const old=seeded(previous,{count:8,selected:8}),now=seeded(current,{count:8,selected:8});
    assert.deepEqual(plain(now.ctx.getStarlordSessionMap_(now.ss)),plain(old.ctx.getStarlordSessionMap_(old.ss)));
    assert.deepEqual(plain(now.ctx.getOverlordTrolleyMap_(now.sheets[now.ctx.LORD_CONFIG.SHEETS.TROLLEYS])),plain(old.ctx.getOverlordTrolleyMap_(old.sheets[old.ctx.LORD_CONFIG.SHEETS.TROLLEYS])));
  });
  await test('LORD cleanup preserves every surviving function and all active business logic',()=>{
    const old=browser('lord',{source:fs.readFileSync(path.join(oldRoot,'lord/assets/app.js'),'utf8'),preserveRender:true});
    const now=browser('lord',{preserveRender:true}),removed=require('./simplify_frontends.cjs').removedLord;
    for(const key of Object.keys(old.ctx).filter(k=>typeof old.ctx[k]==='function')){
      if(['persistDraft','restoreDraft','resumeDraft','resetStateKeepTeacher','renderLanding','routeAfterAuthentication','renderEligibleBookings','cancelBooking','renderLoanTrolleys','trolleyEditorHtml','renderReturnForm','returnTrolleyHtml','bindReturnEditors','resetApp','closeBookingOverlay','showBookingOverlay','cancelOwnedBooking','refreshReferenceInBackground','loadAuthenticatedReference','signOutLord','reloadFromSheets'].includes(key))continue;
      if(require('./gsis_contract_changes.cjs').lordChanged.includes(key))continue;
      // Approved Remarks keyboard and explicit return actions are exercised in
      // booking-remarks-return-browser; other historical functions stay exact.
      if(['bindBooking','bindReturnIssueControl','updateReturnIssueUi','submitReturn'].includes(key))continue;
      if(removed.includes(key)){assert.equal(now.ctx[key],undefined);continue;}
      const actual=now.ctx[key]?.toString().replace('ask an administrator to refresh shared lists in OVERLORD Settings.','select Reload from Sheets.');
      const expected=key==='lordFetch'?old.ctx[key].toString().replace('      clearTimeout(timer);','      clearTimeout(timer);\n      window.GSISversionNotice?.(response);'):old.ctx[key].toString();
      assert.equal(actual,expected,key+' changed');
    }
  });
  await test('OVERLORD keeps the final authentication, editor, notes, issue and photo behaviour',()=>{
    const old=browser('overlord',{source:fs.readFileSync(path.join(oldRoot,'overlord/assets/app.js'),'utf8'),preserveRender:true}),now=browser('overlord',{preserveRender:true});
    for(const name of ['showOverlordAuth','openAdminEditor','saveAdminEdit','adminCancel','renderExceptions','showReturnIssuesInActionRequired','movementOperationalComments','rc19CommentCards','rc19IssueBanner','rc24AccessorySummaryHtml','rc24AccessoryPhotoCards']){
      if(require('./gsis_contract_changes.cjs').overlordChanged.includes(name))continue;
      assert.equal(normalizeFunction(now.ctx[name]),normalizeFunction(old.ctx[name]),name);
    }
    assert.equal(normalizeFunction(now.ctx.renderBaseDetails),normalizeFunction(vm.runInContext('rc18BaseShowDetails',old.ctx)));
    // Photo content retained; native dialog lifecycle is covered by approved E checks.
    assert(normalizeFunction(now.ctx.renderBaseMovementPhotos).includes('showManagedDialog'));
    assert.equal(normalizeFunction(now.ctx.showDetails),normalizeFunction(old.ctx.showDetails).replace('rc18BaseShowDetails','renderBaseDetails'));
    assert.equal(normalizeFunction(now.ctx.openMovementPhotos),normalizeFunction(old.ctx.openMovementPhotos).replace('rc18BaseOpenMovementPhotos','renderBaseMovementPhotos'));
  });
  await test('OVERLORD complete dashboard HTML and counts match the v1.5 render chain',()=>{
    const snapshot=seeded(current,{count:6,selected:6}).get({action:'dashboard',date:'2026-10-09'}).data;
    const outputs=[];
    for(const source of [fs.readFileSync(path.join(oldRoot,'overlord/assets/app.js'),'utf8'),undefined]){
      const h=browser('overlord',{source,preserveRender:true});h.nodes.returnIssuesCount=element();h.nodes.returnIssuesMetric=element();h.nodes.maintenanceStatus=element();
      h.api.setData(snapshot);h.nodes.dateInput.value='2026-10-09';h.ctx.render();
      outputs.push(Object.fromEntries(['openCount','overdueCount','trolleyCount','deviceCount','returnedTodayCount','returnIssuesCount','timeline','exceptions'].map(id=>[id,{text:h.nodes[id].textContent,html:h.nodes[id].innerHTML}])));
    }
    assert.deepEqual(outputs[1],outputs[0]);
  });
  for(const app of ['lord','overlord'])await test(`${app} Worker still makes one upstream attempt on failure`,async()=>{
    const h=worker(app,()=>new Response('<html>temporary error</html>',{status:503}),staff);
    const reply=await h.call('/api/reference');assert.equal(reply.status,app==='lord'?400:502);assert.equal(h.requests.length,1);
  });
  const changes=['lord/assets/app.js','overlord/assets/app.js','lord/_worker.js','overlord/_worker.js'].map(name=>{
    const before=fs.readFileSync(path.join(oldRoot,name)),after=fs.readFileSync(path.join(root,'Source',name));
    return {file:'Source/'+name,beforeBytes:before.length,afterBytes:after.length,removedBytes:before.length-after.length};
  });
  const report={release:'1.7',checkedAt:new Date().toISOString(),passed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,total:results.length,sourceSha256:require('./source_fingerprints.cjs')(),environment:'Actual source functions with simulated Google services, network and DOM; counts are measured service operations, not production latency.',measurements,changes,results};
  fs.writeFileSync(path.join(__dirname,'refactor_results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,total:report.total,measurements,changes},null,2));
  results.filter(x=>!x.ok).forEach(x=>console.error(x.name+'\n'+x.error));process.exitCode=report.failed?1:0;
})();
