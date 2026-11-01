/* Dated editor leases are independent metadata, not operational document revisions. */
const STAPLER_LEASE_PREFIX_='ROSTER_STAPLER_LEASE:';
const STAPLER_LEASE_MS_=180000;
function rosterStaplerLeaseRead_(date,properties){const key=STAPLER_LEASE_PREFIX_+date,raw=properties?properties[key]:props_().getProperty(key);if(!raw)return {fence:0};try{const row=JSON.parse(raw);if(!Number.isInteger(row.fence)||row.fence<0)throw Error('fence');return row;}catch(e){error_(503,'The planning lock could not be read. Ask Admin to check this date.');}}
function rosterStaplerLeaseWrite_(date,row){if(typeof rosterEdgeAssertLegacyWrite_==='function')rosterEdgeAssertLegacyWrite_();gsisRequireBackendRole_('roster');const json=JSON.stringify(row);if(unescape(encodeURIComponent(json)).length>1200)error_(507,'The planning lock record is too large.');props_().setProperty(STAPLER_LEASE_PREFIX_+date,json);}
function rosterStaplerLeaseOwned_(row,user,p){return row.owner===user.email&&row.staffId===user.staffId&&row.session===p.leaseSessionId&&row.fence===p.leaseFence;}
function rosterStaplerLeaseView_(date,user,p,now=Date.now(),properties){
 const row=rosterStaplerLeaseRead_(date,properties),active=!!row.owner&&row.until>now;
 return {fence:row.fence,active,mine:active&&row.owner===user.email&&row.staffId===user.staffId&&row.session===p.leaseSessionId,ownerName:active?row.name:'',expiresAt:active?row.until:null,renewAfterMs:45000,canRelease:user.admin===true&&active};
}
function rosterStaplerLeaseAttach_(response,user,p,state,ctx){
 if((p.operation==='staplerDates'||p.view==='staplerDates')&&Array.isArray(response.dates)){
  // One fresh snapshot per request; ownership is still checked again inside each write lock.
  const properties=props_().getProperties(),now=Date.now(),view=date=>rosterStaplerLeaseView_(date,user,p,now,properties),known=new Set(response.dates.map(row=>row.date));
  if(state&&ctx)for(const key of Object.keys(properties).filter(k=>k.startsWith(STAPLER_LEASE_PREFIX_))){const date=key.slice(STAPLER_LEASE_PREFIX_.length);if(!known.has(date)&&view(date).active&&GSISRosterOperations.staplerPermission(state,ctx,date))response.dates.push({date,status:'New',draftRevision:0,mayEdit:true,mayConfirm:true,mayPublish:false,baselineChanged:false});}
  response.dates=response.dates.sort((a,b)=>b.date.localeCompare(a.date)).map(row=>({...row,lock:view(row.date)}));
  if(Array.isArray(response.deletedArchives))response.deletedArchives=response.deletedArchives.map(row=>({...row,lock:view(row.date)}));
 }
 if(Object.prototype.hasOwnProperty.call(response,'plan')){response.lock=rosterStaplerLeaseView_(response.date,user,p);response.planningAllowed=response.canEdit;const owns=response.lock.mine;response.canEdit=!!response.canEdit&&owns;response.canConfirm=!!response.canConfirm&&owns;response.canReset=!!response.canReset&&owns;}
 return response;
}
function rosterStaplerLeaseAssert_(date,user,p,current){const row=current||rosterStaplerLeaseRead_(date);if(!rosterStaplerLeaseOwned_(row,user,p)||row.until<=Date.now())error_(409,'This editing lock has ended or belongs to another session. Reload the saved plan before editing.');return row;}
function rosterStaplerLeaseReleaseCommitted_(date,user,p){
 const row=rosterStaplerLeaseRead_(date);if(!rosterStaplerLeaseOwned_(row,user,p))return;
 rosterStaplerLeaseWrite_(date,{fence:row.fence+1,releasedFence:row.fence,releasedSession:row.session,releasedBy:user.email,releasedAt:Date.now()});
}
function rosterStaplerLeaseTransitions_(p,user){
 const date=GSISRosterOperations.date(p.date),source=rosterStaplerLeaseAssert_(date,user,p),rows=[{date,fence:source.fence}];
 if(p.operation==='moveStapler'){
  const targetDate=GSISRosterOperations.date(p.newDate);if(targetDate===date)error_(400,'Choose a different suspension date.');
  const target=rosterStaplerLeaseRead_(targetDate);if(target.owner&&target.until>Date.now())error_(409,'The destination date is being edited. Choose another date or wait for its editor.');
  rows.push({date:targetDate,fence:target.fence});
 }
 return rows;
}
function rosterStaplerLeaseFinishTransitions_(rows,user){
 // Receipt replay may run after another editor acquired a newer fence. Never
 // release that editor while finishing an older accepted move or deletion.
 for(const item of rows||[]){const row=rosterStaplerLeaseRead_(item.date);if(row.fence!==item.fence)continue;rosterStaplerLeaseWrite_(item.date,{fence:row.fence+1,releasedFence:row.fence,releasedBy:user.email,releasedAt:Date.now()});}
}
function rosterStaplerLeaseDispatch_(req,c){gsisRequireBackendRole_('roster');
 const p=req.input||{},user=rosterOperationsAuthority_(c,req.identity),date=GSISRosterOperations.date(p.date),today=rosterToday_();
 if(date<today)error_(403,'Past planning dates are read only.');
 if(typeof p.leaseSessionId!=='string'||! /^[\w-]{36}$/.test(p.leaseSessionId)||!Number.isInteger(p.leaseFence)||p.leaseFence<0)error_(400,'A current editing session and lock version are required.');
 const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Another save is running. Retry the editing lock.');
 try{
  if(typeof rosterEdgeAssertLegacyWrite_==='function')rosterEdgeAssertLegacyWrite_();
  const row=rosterStaplerLeaseRead_(date),now=Date.now(),active=!!row.owner&&row.until>now,op=p.operation;let saved=row;
  if(op==='acquireStaplerLock'){
   const state=rosterOperationsState_(),ctx={user,people:c.rosterPeople,today};if(!GSISRosterOperations.staplerPermission(state,ctx,date))error_(403,'Planning access is required for this date.');
   const revision=state.staplerPlans.find(r=>r.date===date)?.revision||0;if(p.staplerRevision!==revision)error_(409,'The saved plan changed. Reload before editing.');
   if(active&&row.owner===user.email&&row.session===p.leaseSessionId&&row.acquireBase===p.leaseFence)return {lock:rosterStaplerLeaseView_(date,user,p),staplerRevision:revision};
   if(row.fence!==p.leaseFence||active)error_(409,active?'This plan is being edited by '+row.name+'. Open it read only or try again later.':'The editing lock changed. Reload before editing.');
   // ponytail: at most 256 dated records (under 308 KB); past dates are pruned on acquisition.
   // Future tombstones must remain so delayed old acquisition requests cannot regain ownership.
   const properties=props_().getProperties(),keys=Object.keys(properties).filter(k=>k.startsWith(STAPLER_LEASE_PREFIX_));let retained=0;for(const key of keys){if(key.slice(STAPLER_LEASE_PREFIX_.length)<today){props_().deleteProperty(key);delete properties[key];}else retained++;}if(!properties[STAPLER_LEASE_PREFIX_+date]&&retained>=256)error_(507,'Too many future planning locks. Ask Admin to review the planning dates.');
   if(unescape(encodeURIComponent(JSON.stringify(properties))).length+1200>350000)error_(507,'Planning lock storage is near its safe limit. Ask Admin to review old dates.');
   const name=String(c.rosterPeople.find(t=>t.id===user.staffId)?.name||user.email).slice(0,160);saved={fence:row.fence+1,acquireBase:row.fence,owner:user.email,staffId:user.staffId,authority:user.admin||user.smc?'manager':'sponsored',session:p.leaseSessionId,name,until:now+STAPLER_LEASE_MS_};rosterStaplerLeaseWrite_(date,saved);
  }else if(op==='renewStaplerLock'){
   if(row.authority==='manager'?!user.admin&&!user.smc:!c.rosterPeople.some(t=>t.id===user.staffId&&t.active))error_(403,'Active planning access is required.');
   rosterStaplerLeaseAssert_(date,user,p,row);saved={...row,until:now+STAPLER_LEASE_MS_};rosterStaplerLeaseWrite_(date,saved);
  }else{
   if(!user.admin)error_(403,'Only Admin can release an abandoned editing lock.');
   if(!active&&row.releasedFence===p.leaseFence&&row.releasedBy===user.email)return {lock:rosterStaplerLeaseView_(date,user,p)};
   if(row.fence!==p.leaseFence)error_(409,'The editor changed. Refresh before releasing this lock.');
   if(!row.owner)return {lock:rosterStaplerLeaseView_(date,user,p)};
   saved={fence:row.fence+1,releasedFence:row.fence,releasedBy:user.email,releasedAt:now};rosterStaplerLeaseWrite_(date,saved);
  }
  return {lock:rosterStaplerLeaseView_(date,user,p,Date.now(),{[STAPLER_LEASE_PREFIX_+date]:JSON.stringify(saved)})};
 }finally{deployUnlock_(lock);}
}
