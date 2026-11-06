// Native compression keeps the single atomic document small without a second store or partial commit.
// The lazy facade leaves unrelated dates compressed; even checking `row.published` does not inflate it.
var rosterPlanPacked_=new WeakMap();
function rosterOperationsPlanDigest_(json){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,json).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function rosterOperationsUnpackPlans_(state){
 const unpack=(value,row,revision)=>{if(value?.encoding!=='gzip-base64-v1')return value;if(typeof value.data!=='string'||value.data.length>2800000||!Number.isInteger(value.bytes)||value.bytes<2||value.bytes>2000000)throw Object.assign(Error('The saved Stapler plan could not be read. Keep this saved date and ask Admin to check its diagnostic reference.'),{status:503,failurePhase:'stapler-identity'});let decoded,facade;
  const load=()=>{if(decoded)return decoded;let phase='stapler-unpack';try{
   // Rebuild a gzip Blob, including its host metadata, from the stored bytes.
   const blob=rosterOperationsPhase_('stapler-unpack',()=>Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(value.data),'application/x-gzip','stapler.json.gz'))),bytes=blob.getBytes().length;if(bytes!==value.bytes||bytes>2000000)throw Error('size');
   phase='stapler-json';const json=blob.getDataAsString('UTF-8'),plan=JSON.parse(json),proof=value.validation;
   phase='stapler-identity';if(!plan||plan.schema!==1||plan.date!==row.date||plan.baselineId!==row.baselineId)throw Error('identity');
   // The marker is stored with the compressed content. It never comes from a
   // save request. A mismatched digest/revision is corruption, not a cache miss.
   phase='stapler-proof';if(proof&&(proof.digest!==rosterOperationsPlanDigest_(json)||proof.date!==plan.date||proof.baselineId!==plan.baselineId||proof.revision!==revision))throw Error('validation binding');
   if(!proof||proof.version!==GSISRosterStapler.validationVersion){phase='stapler-validation';rosterOperationsPhase_('stapler-validation',()=>GSISRosterStapler.validate(plan));}
   const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}};freeze(plan);decoded=plan;GSISRosterStapler.acceptStored(decoded,json,true);GSISRosterStapler.acceptStored(facade,json,true);return decoded;
  }catch(e){throw Object.assign(Error('The saved Stapler plan could not be read. Keep this saved date and ask Admin to check its diagnostic reference.'),{status:503,failurePhase:e.failurePhase||phase});}};
  facade=new Proxy({}, {get:(_,key)=>Reflect.get(load(),key),ownKeys:()=>Reflect.ownKeys(load()),getOwnPropertyDescriptor:(_,key)=>{const d=Reflect.getOwnPropertyDescriptor(load(),key);return d?{...d,configurable:true}:undefined;},set:()=>{error_(503,'Copy the dated Stapler plan before changing it.');}});rosterPlanPacked_.set(facade,value);return facade;
 };
 for(const row of [...(state.staplerPlans||[]),...(state.staplerArchives||[])]){const shared=row.published?.encoding==='same-as-draft-v1';row.draft=unpack(row.draft,row,row.revision);if(shared){if(!row.draft)error_(503,'Stored published Stapler plan is unavailable.');row.published=row.draft;}else row.published=unpack(row.published,row,row.publishedRevision??row.revision);if(row.confirmedPlan){const encoding=row.confirmedPlan.encoding;row.confirmedPlan=encoding==='same-as-draft-v1'?row.draft:encoding==='same-as-published-v1'?row.published:unpack(row.confirmedPlan,row,row.confirmedRevision??row.revision);if(!row.confirmedPlan)error_(503,'Stored confirmed Stapler plan is unavailable.');}}
 return state;
}
function rosterOperationsPackPlans_(state,prepareTimetables=true){
 // Test/older host harnesses can retain the compatible plain representation.
 if(!state.staplerPlans?.length&&!state.staplerArchives?.length||typeof Utilities.gzip!=='function')return state;
 const pack=(value,revision)=>{const prior=rosterPlanPacked_.get(value);if(prior&&prior.validation?.version===GSISRosterStapler.validationVersion&&prior.validation.revision===revision)return prior;
  rosterOperationsPhase_('stapler-validation',()=>GSISRosterStapler.validate(value));const json=JSON.stringify(value),blob=Utilities.newBlob(json,'application/json'),bytes=blob.getBytes().length;if(bytes>2000000)error_(507,'This Stapler plan is too large to save.');
  return {encoding:'gzip-base64-v1',bytes,data:rosterOperationsPhase_('stapler-pack',()=>Utilities.base64Encode(Utilities.gzip(blob).getBytes())),validation:{version:GSISRosterStapler.validationVersion,date:value.date,baselineId:value.baselineId,revision,digest:rosterOperationsPlanDigest_(json)}};};
 let preparedBytes=0;const rows=(list,prepare=false)=>(list||[]).map(row=>{const packed={...row},draft=row.draft?pack(row.draft,row.revision):null,published=row.published?row.published===row.draft?draft:pack(row.published,row.publishedRevision??row.revision):null;if(draft)packed.draft=draft;if(published)packed.published=draft&&published.data===draft.data?{encoding:'same-as-draft-v1'}:published;if(row.confirmedPlan){const confirmed=row.confirmedPlan===row.draft?draft:row.confirmedPlan===row.published?published:pack(row.confirmedPlan,row.confirmedRevision??row.revision);packed.confirmedPlan=draft&&confirmed.data===draft.data?{encoding:'same-as-draft-v1'}:published&&confirmed.data===published.data?{encoding:'same-as-published-v1'}:confirmed;}if(prepare&&typeof rosterTimetablePreparePlan_==='function')try{const ready=rosterTimetablePreparePlan_(state,row,packed),size=ready?JSON.stringify(ready).length:0;if(ready&&preparedBytes+size<=2000000){packed.timetablePackage=ready;preparedBytes+=size;}else delete packed.timetablePackage;}catch(_){delete packed.timetablePackage;}else delete packed.timetablePackage;
  return packed;});return {...state,staplerPlans:rows(state.staplerPlans,prepareTimetables),staplerArchives:rows(state.staplerArchives)};
}
var rosterOperationsStorageSources_=new WeakMap();
var rosterOperationsAuditSources_=new WeakMap();
/* One operational document commits absence, relief, audit and notification intent together. */
function rosterOperationsState_(skipTransport=false){
 let phase='operations-location';try{
  const id=props_().getProperty('ROSTER_OPERATIONS_FILE')||rosterFindFile_(ROSTER_DATA,'Roster operations.json');
  if(!id)return GSISRosterOperations.initial();
  phase='operations-read';const source=rosterOperationsStoredRead_(id),value=source.value;
  phase='operations-schema';const state=GSISRosterOperations.validateState(rosterOperationsUnpackPlans_(typeof rosterAllocationAuditUnpack_==='function'?rosterAllocationAuditUnpack_(value):value));rosterOperationsStorageSources_.set(state,source);rosterOperationsAuditSources_.set(state,state.audit.map(row=>({id:row.id})));if(typeof rosterColdReceiptsUnpack_==='function')rosterColdReceiptsUnpack_(state);return skipTransport!==true&&typeof rosterNotificationOverlay_==='function'?rosterNotificationOverlay_(state):state;
 }catch(e){if(e.status){e.failurePhase=e.failurePhase||phase;throw e;}throw Object.assign(Error('Relief records could not be read.'),{status:503,failurePhase:e.failurePhase||phase});}
}
// Save ceiling for Roster operations.json. Admin may raise it in Script Properties
// (ROSTER_OPERATIONS_MAX_CHARS) up to 24,000,000; anything else keeps 16,000,000.
function rosterOperationsMaxChars_(){let raw=null;try{raw=props_().getProperty('ROSTER_OPERATIONS_MAX_CHARS');}catch(ignore){}const n=Number(raw);return raw&&Number.isInteger(n)&&n>=16000000&&n<=24000000?n:16000000;}
// Storage report view: swap lazy facades for their stored compressed payloads
// so measuring never inflates history and matches what the save ceiling checks.
function rosterOperationsStoredView_(state){
 const stored=v=>(typeof rosterPlanPacked_!=='undefined'&&rosterPlanPacked_.get(v))||(typeof rosterAuditEvidencePacked_!=='undefined'&&rosterAuditEvidencePacked_.get(v))||v;
 const plans=list=>list.map(row=>{const r={...row};if(row.draft)r.draft=stored(row.draft);if(row.published)r.published=row.draft&&row.published===row.draft?{encoding:'same-as-draft-v1'}:stored(row.published);if(row.confirmedPlan)r.confirmedPlan=row.draft&&row.confirmedPlan===row.draft?{encoding:'same-as-draft-v1'}:row.published&&row.confirmedPlan===row.published?{encoding:'same-as-published-v1'}:stored(row.confirmedPlan);return r;});
 const view={...state};if(Array.isArray(state.staplerPlans))view.staplerPlans=plans(state.staplerPlans);if(Array.isArray(state.staplerArchives))view.staplerArchives=plans(state.staplerArchives);if(Array.isArray(state.optimisationRuns))view.optimisationRuns=state.optimisationRuns.map(run=>run.decisionEvidence?{...run,decisionEvidence:stored(run.decisionEvidence)}:run);return view;
}
function rosterOperationsCommit_(state,intakeFenceDates=null,intakeFencePeers=false,beforeWrite=null,preserveStored=false){if(typeof rosterEdgeAssertLegacyWrite_==='function')rosterEdgeAssertLegacyWrite_();gsisRequireBackendRole_('roster');
 // The internal repair path retains stored bytes and checks its original source
 // before preparation can select a newer pointer. Requests cannot set this flag.
 const preserve=preserveStored===true;if(preserve&&beforeWrite)beforeWrite();
 if(!preserve&&typeof rosterAllocationAuditCapture_==='function')rosterAllocationAuditCapture_(state);
 const packed=preserve?state:rosterOperationsPackPlans_(state);let data=JSON.stringify(!preserve&&typeof rosterAllocationAuditPack_==='function'?rosterAllocationAuditPack_(packed):packed);
 // A derived read package must never consume the last space needed to save
 // authoritative work. Dropping it selects the established reader fallback.
 if(!preserve&&data.length>12000000){for(const row of packed.staplerPlans||[])delete row.timetablePackage;data=JSON.stringify(typeof rosterAllocationAuditPack_==='function'?rosterAllocationAuditPack_(packed):packed);}
 // Existing Google document only: bounded emergency headroom preserves every
 // record while the retained intake can finish. The 12M derived-cache fallback
 // above stays first; no new storage format, authority or automatic pruning.
 const stored=props_().getProperty('ROSTER_OPERATIONS_FILE'),id=stored||rosterFindFile_(ROSTER_DATA,'Roster operations.json'),source=rosterOperationsStorageSources_.get(state),root=id?(source?.id===id?source.manifest:JSON.parse(rosterReadFile_(id))):null,split=root?.format==='gsis-roster-operations-split-v1';
 // Compare against identities captured before the command. Existing historical
 // collisions remain evidence; no new collision may reach a durable write.
 const auditBefore=rosterOperationsAuditSources_.get(state)||(split?rosterOperationsStoredRead_(id).value.audit:root?.audit)||[];
 GSISRosterAllocation.assertNewAuditIds(auditBefore,state.audit);
 if(!split&&data.length>rosterOperationsMaxChars_())throw Object.assign(Error('Relief records are full. Ask Admin to review storage capacity before retrying this same report.'),{status:507,code:'ROSTER_STORAGE_CAPACITY'});
 const prepared=split?rosterSplitPrepareDocument_(JSON.parse(data),{folderId:root.folderId,previousId:id}):null;
 // Packed wrappers need server-owned lazy proofs for the source fences. Expand
 // only a temporary row view; the authoritative payload above stays raw.
 const fenceState=preserve?rosterOperationsUnpackPlans_({...state,staplerPlans:(state.staplerPlans||[]).map(row=>({...row})),staplerArchives:(state.staplerArchives||[]).map(row=>({...row}))}):state;
 const batchTicket=typeof rosterTimetableBatchCommitBegin_==='function'?rosterTimetableBatchCommitBegin_(fenceState):null,venueTicket=typeof rosterVenuesBegin_==='function'?rosterVenuesBegin_('operations',fenceState):null;
 const write=()=>{
 // External preparation and file lookup can cross a period start. The allocator
 // rechecks its trusted clock inside the final write closure, never from input.
 // A failed hint-version update after a successful write must not preserve a
 // stale no-work hint. Fence hint readers before submitting any source write.
 props_().setProperty('ROSTER_SCHEDULE_DIRTY','1');
 const finalCheck=()=>{if(prepared&&(props_().getProperty('ROSTER_OPERATIONS_FILE')||id)!==id)throw Object.assign(Error('Roster storage changed. Retry against the latest saved state.'),{status:409});if(beforeWrite)beforeWrite();};
 if(!prepared)finalCheck();
 const saved=prepared?prepared.commit(finalCheck):id?(rosterDriveRequest_('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(id)+'?uploadType=media&supportsAllDrives=true&fields=id',{method:'patch',contentType:'application/json; charset=UTF-8',payload:data},'operations-commit'),id):rosterCreateFile_(ROSTER_DATA,'Roster operations.json',Utilities.newBlob(data,'application/json'));
 if(prepared||!stored)props_().setProperty('ROSTER_OPERATIONS_FILE',saved);
 rosterOperationsAuditSources_.set(state,state.audit.map(row=>({id:row.id})));
 };
 // Keep remote Venues exchanges outside the intake lock. If the final fence
 // stops this write, the derived pending marker prevents stale reuse until the
 // next successful source commit repairs it, as with any interrupted save.
 try{if(intakeFenceDates&&typeof rosterAbsenceIntakeCommitFence_==='function')rosterAbsenceIntakeCommitFence_(intakeFenceDates,write,intakeFencePeers);else write();}finally{rosterOperationsVersionChanged_();}
 if(typeof rosterTimetableBatchCommitEnd_==='function')rosterTimetableBatchCommitEnd_(batchTicket);
 if(typeof rosterVenuesEnd_==='function')rosterVenuesEnd_(venueTicket);
}
function rosterOperationsStoredRead_(id){
 for(let attempt=0;attempt<2;attempt++){
  try{return rosterSplitReadDocument_(id,false,false);}catch(error){const current=props_().getProperty('ROSTER_OPERATIONS_FILE')||id;if(attempt||current===id)throw error;id=current;}
 }
}
// Immutable report timetable transport is separate from fresh absence/receipt data.
// ScriptCache is optional: eviction regenerates bytes; unavailable compression
// returns the authorised plain projection. No write request enters this path.
function rosterOperationsReportTransport_(response,p,ctx){
 if(p.operation!=='read'||p.compact!==true||!['report','entry'].includes(p.view)||p.timetableTransport!=='gzip-base64-v1'||!response.timetable||!response.baselineTimetable||typeof Utilities.gzip!=='function')return response;
 const json=JSON.stringify({timetable:response.timetable,baselineTimetable:response.baselineTimetable}),blob=Utilities.newBlob(json,'application/json'),bytes=blob.getBytes().length;
 if(bytes>2000000)return response;
 const key=rosterOperationsPlanDigest_(JSON.stringify([1,ctx.user.email,ctx.user.staffId,ctx.user.smc===true,ctx.user.admin===true,p.view,response.date,json])),meta={schema:1,key,encoding:'gzip-base64-v1',bytes};
 if(p.timetableSnapshotKey===key)return {...response,timetable:null,baselineTimetable:null,timetableSnapshot:{...meta,unchanged:true}};
 const cacheKey='roster-report-v1:'+key;let cache=null,packed=null;
 try{cache=CacheService.getScriptCache();const stored=cache.get(cacheKey);if(stored){const value=JSON.parse(stored);if(value.key===key&&value.bytes===bytes&&value.encoding===meta.encoding&&typeof value.data==='string')packed=value;}}catch(_){}
 if(!packed){try{packed={...meta,data:Utilities.base64Encode(Utilities.gzip(blob).getBytes())};}catch(_){return response;}const stored=JSON.stringify(packed);if(cache&&stored.length<90000)try{cache.put(cacheKey,stored,21600);}catch(_){} }
 return {...response,timetable:null,baselineTimetable:null,timetableSnapshot:packed};
}
function rosterOperationsAuthority_(c,identity,datesOnly=false){
 const projected=c?.rosterProjection==='staplerDates';
 if(projected){
  const dates=c.rosterDates,person=p=>p&&typeof p.id==='string'&&!!p.id&&typeof p.name==='string'&&!!p.name;
  if(!datesOnly||!Array.isArray(dates?.sponsors)||dates.sponsors.some(p=>!person(p))||dates.caller!==null&&(!person(dates.caller)||dates.caller.id!==c.user?.rosterStaffId||dates.caller.active!==true||typeof dates.caller.role!=='string'||!Array.isArray(dates.caller.groups)||typeof dates.caller.mk!=='string'||typeof dates.caller.appointmentLevel!=='string'))error_(503,'Contacts dates authority is unavailable for this operation.');
 }
 if((!projected&&!Array.isArray(c?.rosterPeople))||typeof c?.user?.rosterSMC!=='boolean'||typeof c?.user?.rosterAdmin!=='boolean')error_(503,'Update Contacts to supply verified relief authority and staff directory.');
 return {staffId:c.user.rosterStaffId||null,email:identity.email,smc:c.user.rosterSMC===true,admin:c.user.rosterAdmin===true};
}
function rosterOperationsNames_(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/^(mr|mrs|ms|mdm|miss|dr)\.?\s+/,'').replace(/\s*\((?:sre|fajt|bt|ut|rt|4\/5)\)\s*/g,' ').replace(/[^a-z0-9]/g,'');}
// Only explicit form-class labels in the imported class column create supervision demand.
// The immutable catalogue is cached separately from current Deploy venues and quotas.
function rosterOperationsFormClasses_(entry,model,known){
 const parse=value=>{const m=/^(?:(?:primary|pri|p)\s*)?([1-6])\s*[-.]?\s*([a-z]+(?:[ '-][a-z]+)*)$/i.exec(String(value||'').trim());return m?{level:Number(m[1]),suffix:m[2].trim(),name:m[1]+m[2].trim(),key:(m[1]+m[2]).toLowerCase().replace(/[^a-z0-9]/g,'')}:null;};
 const key='gsis-roster-classes:v1:'+entry.id+':'+entry.modelFile;let classes;
 try{const raw=CacheService.getScriptCache().get(key);if(raw)classes=JSON.parse(raw);}catch(ignore){}
 if(!Array.isArray(classes)){
  const rows=new Map();for(const [,week] of GSISRoster.weeks(model))for(const block of week.blocks)for(const cell of block.cells)for(const text of cell[1].split(/[\n,;\/]+/)){
   const cls=parse(text);if(!cls)continue;let row=rows.get(cls.key);if(!row){row={...cls,venues:new Set(),formVenues:new Set()};rows.set(cls.key,row);}const venue=cell[2].trim();if(venue){row.venues.add(venue);if(/^form(?:\s|$)/i.test(cell[0].trim()))row.formVenues.add(venue);}
  }
  classes=[...rows.values()].map(({venues,formVenues,...row})=>({...row,venue:formVenues.size===1?[...formVenues][0]:venues.size===1?[...venues][0]:''})).sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name,'en',{numeric:true}));
  try{const raw=JSON.stringify(classes);if(raw.length<30000)CacheService.getScriptCache().put(key,raw,21600);}catch(ignore){}
 }
 const published=new Map();for(const cls of known||[]){const parsed=parse(cls.name);if(parsed){const rows=published.get(parsed.key)||[];rows.push(cls);published.set(parsed.key,rows);}}
 return classes.map(({key,...row})=>{const matches=published.get(key)||[],current=matches.length===1?matches[0]:null;return {...row,id:current?.id||'tt:'+key,timetableClassId:'tt:'+key,deployClassId:current?.id||null,venue:current?.venue||row.venue};});
}
function rosterOperationsQuotaSource_(){
 const book=book_(),index=index_(book);if(index.pendingFieldCommit)error_(503,'Deployment save confirmation is pending. Retry relief after it completes.');
 return {book,index,entry:publishedEntry_(index)};
}
function rosterOperationsQuota_(dates,source){
 // A published Deploy snapshot is the only quota source. No matching snapshot means unknown R.
 const {book:b,index:idx,entry:en}=source||rosterOperationsQuotaSource_();if(!en)return {from:'',to:'',rows:[]};const value=reliefRosterQuota_(b,idx,en);
 return value.from&&value.to&&dates.some(day=>day>=value.from&&day<=value.to)?value:{...value,rows:[],formClasses:[],teachingGroups:[],smcIds:[],venues:[]};
}
function rosterOperationsPeople_(c){return c.rosterPeople.map(p=>({id:String(p.id),name:String(p.name||''),active:p.active===true,mobile:String(p.mobile||''),email:String(p.email||''),emails:Array.isArray(p.emails)?p.emails:[],employment:String(p.employment||''),mk:String(p.mk||''),appointmentLevel:String(p.appointmentLevel||''),adhocEligible:p.adhocEligible===true,role:String(p.role||''),department:String(p.department||''),groups:Array.isArray(p.groups)?p.groups:[]}));}
function rosterOperationsAllocationLearning_(req,c){
 const user=rosterOperationsAuthority_(c,req.identity),people=c.rosterPeople.map(p=>({id:String(p.id),active:p.active===true}));
 if(!user.smc&&!user.admin&&!(user.staffId&&people.some(p=>p.id===user.staffId&&p.active)))error_(403,'A linked staff account, SMC or Admin access is required.');
 const state=rosterOperationsPhase_('state-read',()=>rosterOperationsState_(true));
 return rosterOperationsPhase_('projection',()=>GSISRosterOperations.allocationLearningView(state,{user,people}));
}
function rosterOperationsAllocationReference_(state,people,index,p,source,today,dates){
 const calendar=Object.fromEntries(dates.map(date=>{const c=p.calendarByDate?.[date];return [date,c?{date:c.date,schoolDay:c.schoolDay,parity:c.parity,reason:c.reason,warning:c.warning,sourceRevision:c.sourceRevision}:null];}));
 return rosterOperationsDigest_({schema:2,backendVersion:typeof GSIS_DEPLOY_VERSION==='string'?GSIS_DEPLOY_VERSION:null,today,dates,resolvedTimetables:dates.map(d=>[d,GSISRoster.active(index.entries,d)?.id||null]),entries:index.entries,deploy:{book:source.book.getId(),entry:source.entry||null,calculationVersion:GSISRelief.model},calendar,people,nameBridges:state.nameBridges,systemConfig:state.systemConfig});
}
// Cache only prepared baseline inputs. Live authority, absences, assignments,
// suspended plans and weekly balances are applied again on every read.
function rosterOperationsAllocationBaseline_(key,value){
 try{const cache=CacheService.getScriptCache(),name='roster-allocation-baseline-v2:'+key;
  if(value){const json=JSON.stringify({schema:1,key,...value});if(json.length>2000000)return null;const packed=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(json,'application/json')).getBytes());if(packed.length<90000)cache.put(name,packed,21600);return null;}
  const raw=cache.get(name);if(!raw)return null;const decoded=Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(raw),'application/x-gzip','allocation-baseline.json.gz'));if(decoded.getBytes().length>2000000)return null;const hit=JSON.parse(decoded.getDataAsString('UTF-8'));
  return hit?.schema===1&&hit.key===key&&hit.days&&Object.values(hit.days).every(day=>Array.isArray(day.teachers)&&Array.isArray(day.periods))&&hit.venues?hit:null;
 }catch(_){return null;}
}
function rosterOperationsSubjectCatalogue_(){const b=book_(),idx=index_(b);if(idx.pendingFieldCommit)error_(503,'Deployment save confirmation is pending. Retry relief after it completes.');const en=publishedEntry_(idx);return en?reliefRosterSubjectCatalogue_(b,idx,en):{from:'',to:'',teachingGroups:[]};}
function rosterOperationsCustom_(p){return ['saveCustomInstruction','deleteCustomInstruction','setCustomInstructionEnabled'].includes(p.operation)||(!p.operation||p.operation==='read')&&p.view==='custom';}
function rosterOperationsNeedsQuota_(p){
 if(p.operation==='requestMutual'&&p.proposalOnly===true)return false;
 const op=p.operation||'read';if(['publish','dailyNotify','notifyDaily','createStapler','importStapler','previewRestoreStapler'].includes(op))return false;if(op==='saveAbsence'&&p.ownArrangementsByStaffDate&&Object.values(p.ownArrangementsByStaffDate).some(dated=>dated&&typeof dated==='object'&&Object.values(dated).some(picks=>Array.isArray(picks)&&picks.length)))return true;if(op==='currentDuty'||op==='read'&&p.view==='currentDuty')return false;if(rosterOperationsCustom_(p))return false;if(op==='exportDaily'&&p.fullTeachers===true)return true;if(['systemConfig','saveSystemConfig','nameBridges','saveNameBridge','deleteNameBridge','dailyEmployment','saveDailyEmploymentSettings','dutyRoster','setDutySMC','staplerDates','requestStapler','decideStapler'].includes(op)||op==='read'&&['systemConfig','nameBridges','dailyEmployment','staplerDates','dutyRoster'].includes(p.view))return false;if(['stapler','saveStapler','confirmStapler','publishStapler','resetStapler','moveStapler','restoreStapler'].includes(op)||p.view==='stapler')return false;if(op==='saveRecessSettings'||op==='read'&&p.view==='notificationReadiness')return false;if(['history','acknowledge','exportDaily','dailyNotify','notifyDaily'].includes(op))return false;if(['smc','allocation'].includes(p.view)&&!['setDutySMC','importRHistory','verifyRYear'].includes(op))return true;
 if(op==='read')return !['reportForm','report','entry','mine','duties','adhoc','types','prune','custom'].includes(p.view);
 return ['reliefBatch','assign','candidates','availability','requestMutual','respondMutual','allocation','health','accounting','optimise','autoAllocate','scheduledRoster','combine','undo','unassign','setNoRelief','saveRecess','deleteRecess','sendDailyEmploymentReport'].includes(op);
}
// Ordinary draft removals are atomic cell edits. Published/replacement/corrected cover retains the full pipeline.
function rosterOperationsCellMutation_(p,s){
 if(!['setNoRelief','noRelief','unassign'].includes(p.operation)||p.view!=='allocation'||p.compact!==true||typeof p.expectedTimetableId!=='string'||!Number.isInteger(p.expectedStaplerRevision)||typeof p.expectedParity!=='string'||!p.expectedDemandSources||typeof p.expectedDemandSources!=='object'||!Array.isArray(p.demandIds)||!p.demandIds.length)return false;
 const ids=new Set(p.demandIds);
 // Recess demand also joins mutable Deploy venues; retain its normal authoritative context.
 if(p.demandIds.some(id=>!s.absences.some(a=>a.date===p.date&&a.periods.some(period=>a.id+':'+period===id))))return false;
 const rows=s.assignments.filter(a=>ids.has(a.demandId)&&['draft','published','completed'].includes(a.status));
 // A recorded capacity warning must observe recovery before its next shortage episode.
 if(rows.some(a=>!a.noRelief)&&Object.entries(s.healthWarningState||{}).some(([key,value])=>key.startsWith(p.date+':')&&value?.seen?.length))return false;
 return rows.every(a=>a.noRelief===true||a.status==='draft'&&['smc','automatic'].includes(a.origin)&&!a.replaces&&!a.combination&&!a.repurposedDuty&&!a.remove&&!a.publishedAt&&!(s.reliefCorrections||[]).some(c=>c.assignmentId===a.id));
}
function rosterOperationsCellSource_(s,ctx,p){
 const dd=ctx.days[p.date];if(dd?.verified!==true||dd.schoolDay!==true||dd.id!==p.expectedTimetableId||(dd.staplerRevision||0)!==p.expectedStaplerRevision||dd.parity!==p.expectedParity)return false;
 const current=new Map(GSISRosterOperations.demand(ctx,s,p.date).map(d=>[d.id,GSISRosterOperations.cellSourceKey(d)]));return p.demandIds.every(id=>current.has(id)&&current.get(id)===p.expectedDemandSources[id]);
}
function rosterOperationsPhase_(name,fn){return typeof deployPhase_==='function'?deployPhase_('roster.'+name,fn):fn();}
// Historical/administrative record reads cannot invalidate current cover.
function rosterOperationsRecordOnly_(p){return ['previewStaplerMigration','migrateStaplerPlans','previewTimetableReconcile','confirmTimetableReconcile'].includes(p.operation)||p.operation==='read'&&['timetableReview','staplerMigration','timetableReconcile'].includes(p.view)||['publish','createStapler','importStapler','previewRestoreStapler','restoreStapler'].includes(p.operation)||p.operation==='currentDuty'||p.operation==='read'&&p.view==='currentDuty'||rosterOperationsCustom_(p)||['teacherDailyUpdate','dailyNotify','notifyDaily','acknowledge','history','audit','prunePreview','accounting','saveRecessSettings','dutyRoster','setDutySMC','systemConfig','saveSystemConfig','nameBridges','saveNameBridge','deleteNameBridge','dailyEmployment','saveDailyEmploymentSettings','sendDailyEmploymentReport','staplerDates','requestStapler','decideStapler','renameStapler','deleteStapler'].includes(p.operation)||p.operation==='read'&&(['reportForm','schoolAbsences','teacherDailyUpdate','dailyNotify','mine','prune','notificationReadiness','dutyRoster','systemConfig','nameBridges','dailyEmployment','staplerDates'].includes(p.view)||p.compact===true&&['report','entry'].includes(p.view));}
// A confirmed day owns its cells. Live Deploy quota fields are attached separately.
function rosterOperationsSavedStaplerDay_(state,d){
 const row=state?.staplerPlans?.find(row=>row.date===d);if(!row)return null;const snapshot=GSISRosterOperations.confirmedStaplerSnapshot(row,state?.audit);if(!snapshot)return null;
 const plan=snapshot.plan;
 if(!plan?.tiles)error_(409,'This saved Stapler day needs the Admin day-copy migration before planning.');
 return {...GSISRosterStapler.effectiveDay(plan),staplerRevision:snapshot.revision,staplerBaselineId:plan.baselineId};
}
function rosterOperationsStaplerMigrationContext_(req,c,state,index,base){
 if(!base.user.admin)error_(403,'Admin access is required to migrate saved Stapler days.');
 const origins={},seen=new Set();
 for(const row of [...(state.staplerPlans||[]),...(state.staplerArchives||[])]){
  const plans=['draft','published','confirmedPlan'].map(key=>row[key]).filter(Boolean);
  if(plans.length&&plans.every(plan=>GSISRosterStapler.hasDaySnapshot(plan)))continue;
  const key=row.date+'|'+row.baselineId;if(seen.has(key))continue;seen.add(key);
  const entries=index.entries.filter(entry=>entry.id===row.baselineId);if(entries.length!==1)continue;
  const saved=plans.find(plan=>['single','odd','even'].includes(plan.parity)),calendar=saved?{date:row.date,schoolDay:true,parity:saved.parity,available:true}:req.input.calendarByDate?.[row.date];
  if(!calendar||calendar.date!==row.date||calendar.schoolDay!==true)continue;
  const context=rosterOperationsContext_({identity:req.identity,input:{operation:'staplerMigrationOrigin',date:row.date,calendarByDate:{[row.date]:calendar}}},c,{...state,staplerPlans:[],staplerArchives:[]},{entries:[{...entries[0],from:row.date,to:row.date,pruned:false}]}),day=context.days[row.date];
  if(!day?.verified||!day.schoolDay||!day.parity)continue;
  (origins[row.date]||(origins[row.date]=[])).push(day);
 }
 return {...base,timetableEntries:index.entries,staplerOriginDays:origins};
}
function rosterOperationsWeekCells_(date,timetableName,entries,models,parity,state){
 const monday=GSISRosterAllocation.monday(date),name=rosterOperationsNames_(timetableName),cells=[];cells.capWeekDays=[];
 for(let weekday=0;weekday<5;weekday++){const d=GSISRosterAllocation.addDays(monday,weekday),saved=rosterOperationsSavedStaplerDay_(state,d);if(saved){const matches=saved.teachers.filter(t=>rosterOperationsNames_(t.timetableName||t.name)===name);if(matches.length!==1)return {capVerificationReason:'The saved Stapler day does not uniquely identify '+timetableName+' on '+d+'.'};const dayCells=matches[0].cells;cells.capWeekDays.push({date:d,baselineId:saved.id,periods:saved.periods,cells:dayCells});cells.push(...dayCells);continue;}const entry=GSISRoster.active(entries,d);if(!entry)return {capVerificationReason:'No baseline timetable is active on '+d+'.'};const model=models[entry.id]||(models[entry.id]=rosterModel_(entry)),week=model[model.layoutMode==='single-week'?'single':parity],matches=(week?.blocks||[]).filter(b=>rosterOperationsNames_(b.name)===name);if(matches.length!==1)return {capVerificationReason:'Found '+matches.length+' timetable matches for '+timetableName+' on '+d+'. Exactly one is required.'};const dayCells=matches[0].cells.slice(weekday*week.perDay,(weekday+1)*week.perDay);cells.capWeekDays.push({date:d,baselineId:entry.id,periods:dayCells.map((_,period)=>({period,startMinutes:model.timing.startMinutes+period*model.timing.periodMinutes,endMinutes:model.timing.startMinutes+(period+1)*model.timing.periodMinutes})),cells:dayCells});cells.push(...dayCells);}return cells;
}
function rosterOperationsQuotaTeacher_(teacher,row,cells,categories,source){
 const cap=row?.periodCap??null,capped=row?.capConfigured===true||cap!==null,capBasis=row?.capBasis,diagnostics={},capWorkload=!capped?null:GSISRosterStapler.capWorkload(cells,categories,capBasis,row?.capNonTeachingPeriods,diagnostics),capVerified=!capped||['teaching','total'].includes(capBasis)&&row?.capVerified===true&&Number.isFinite(cap)&&cap>=0&&Array.isArray(cells)&&Number.isFinite(capWorkload),headroom=capped&&capVerified?Math.max(0,cap-capWorkload):null;
 const capVerificationReason=capVerified?null:!Number.isFinite(cap)||cap<0?'The configured weekly cap is invalid.':!['teaching','total'].includes(capBasis)?'The weekly cap basis is missing or unsupported.':row?.capVerified!==true?row?.capVerificationReason||'Published Deploy workload is unverified.':cells?.capVerificationReason||diagnostics.reason||'The calculated weekly workload is invalid.';
 const R=row?.R??null;
 return {...teacher,R,rawR:row?.rawR,timetableFactor:row?.timetableFactor,teachingWeight:row?.teachingWeight,offloadFactor:row?.offloadFactor,fullTimeTeacherCount:row?.fullTimeTeacherCount,periodCap:cap,capConfigured:capped,capBasis,capNonTeachingPeriods:row?.capNonTeachingPeriods||null,capWeekDays:cells?.capWeekDays||null,capWorkload,capHeadroom:headroom,capVerified,capVerificationReason,quotaSource:source||null};
}
function rosterOperationsContext_(req,c,state,providedIndex){
 const p=req.input||{},user=rosterOperationsAuthority_(c,req.identity,p.operation==='staplerDates'),now=new Date(),today=Utilities.formatDate(now,'Asia/Singapore','yyyy-MM-dd'),minute=Number(Utilities.formatDate(now,'Asia/Singapore','HH'))*60+Number(Utilities.formatDate(now,'Asia/Singapore','mm'));
 const allocationRead=(p.operation||'read')==='read'&&p.view==='allocation'&&p.compact===true;
 if(allocationRead&&!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');
 // Home's duty names use the server clock and current Contacts authority only.
 // Keep this before date parsing, name-bridge seeding and timetable preparation.
 if(p.operation==='currentDuty'||p.operation==='read'&&p.view==='currentDuty'){
  const people=c.rosterPeople.map(p=>({id:String(p.id),name:String(p.name||''),active:p.active===true,role:String(p.role||''),groups:Array.isArray(p.groups)?p.groups:[],mk:String(p.mk||''),appointmentLevel:String(p.appointmentLevel||'')})),smcIds=c.rosterSMCIds;
  return {user,people,days:{},timetableEntries:[],quotaRequested:false,dutySources:{[today]:{available:Array.isArray(smcIds),staffIds:smcIds||[]}},smcIds,today,minute,now:now.getTime(),iso:now.toISOString()};
 }
 if((p.view==='notificationReadiness'||p.operation==='saveRecessSettings')&&!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');
 // Only the literal dates read may use the reduced signed Contacts contract.
 if(p.operation==='staplerDates'){
  const projected=c.rosterProjection==='staplerDates',people=projected?(c.rosterDates.caller?[c.rosterDates.caller]:[]):c.rosterPeople;
  return {user,people,days:{},timetableEntries:(providedIndex||rosterIndex_()).entries,today,minute,now:now.getTime(),iso:now.toISOString(),uuid:()=>Utilities.getUuid(),smcIds:c.rosterSMCIds||[],...(projected?{staplerSponsors:c.rosterDates.sponsors}:{})};
 }
 const requested=GSISRosterOperations.date(p.date||today),dates=[requested,...(Array.isArray(p.dates)?p.dates:[])];if(p.actualDate)dates.push(GSISRosterOperations.date(p.actualDate));
 const people=rosterOperationsPeople_(c),contactsDuty={available:Array.isArray(c.rosterSMCIds),staffIds:(c.rosterSMCIds||[]).filter(id=>people.some(t=>t.id===id&&GSISRosterOperations.dutyEligible(t))),source:{kind:'Contacts'}};
 GSISRosterOperations.seedNameBridges(state,people);const recordContext={calendarDatesVerified:Object.entries(p.calendarByDate||{}).filter(([date,value])=>value?.date===date&&value.available===true).map(([date])=>date),user,people,days:{},timetableEntries:[],dutySources:{[requested]:contactsDuty},today,minute,now:now.getTime(),iso:now.toISOString(),uuid:()=>Utilities.getUuid(),notificationsConfigured:p.notificationsReady===true,adminRecipients:[],smcIds:c.rosterSMCIds||[]};
 if(p.view==='reportForm'&&(p.operation||'read')==='read')return recordContext;
 if(p.operation==='read'&&p.view==='timetableReview')return recordContext;
 if(['previewStaplerMigration','migrateStaplerPlans'].includes(p.operation)||p.operation==='read'&&p.view==='staplerMigration')return rosterOperationsStaplerMigrationContext_(req,c,state,providedIndex||rosterIndex_(),recordContext);
 if(p.view==='schoolAbsences'&&(p.operation||'read')==='read'){if(!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');GSISRosterOperations.schoolAbsencesRange(recordContext,p);return recordContext;}
 // Ongoing directions are policy records. Their editor does not need Calendar,
 // daily teacher rows, R quotas or allocation reconciliation.
 if(rosterOperationsCustom_(p)){
  if(!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');
  const index=rosterIndex_(),entry=GSISRoster.active(index.entries,today),model=entry?rosterModel_(entry):null,catalogue=rosterOperationsSubjectCatalogue_(),periods=new Set(Array.from({length:model?model.maxPeriod+1:17},(_,i)=>i));
  for(const row of state.customInstructions||[])if(!row.deletedAt)for(const period of row.periods||[])if(Number.isInteger(period)&&period>=0&&period<40)periods.add(period);
  return {...recordContext,customPeriods:[...periods].sort((a,b)=>a-b).map(period=>({period})),teachingGroups:catalogue.teachingGroups||[]};
 }
 if(['systemConfig','saveSystemConfig','nameBridges','saveNameBridge','deleteNameBridge'].includes(p.operation)||['systemConfig','nameBridges'].includes(p.view)){
  const configRead=p.operation==='systemConfig'||p.operation==='read'&&p.view==='systemConfig';if(!user.admin&&!(configRead&&user.smc))error_(403,'Contacts Admin access is required.');const index=rosterIndex_(),entry=GSISRoster.active(index.entries,today),subjects=new Set(),unmatchedTimetableNames=[],timetableNames=[],availablePeriods=[];if(entry){const model=rosterModel_(entry),blocks=(model.layoutMode==='single-week'?model.single:model.odd).blocks,matched=new Set(GSISRosterOperations.matchTimetableNames(state,people,blocks).map(r=>r.index));availablePeriods.push(...Array.from({length:model.maxPeriod+1},(_,i)=>i));blocks.forEach((r,i)=>{if(!timetableNames.includes(r.name))timetableNames.push(r.name);if(!matched.has(i))unmatchedTimetableNames.push(r.name);});for(const [,week] of GSISRoster.weeks(model))for(const block of week.blocks)for(const cell of block.cells){const subject=String(cell[0]||'').trim().replace(/\s+/g,' ');if(subject)subjects.add(subject);}}
  const subjectConfig=configRead||p.operation==='saveSystemConfig',catalogue=subjectConfig?rosterOperationsSubjectCatalogue_():null;
  return {...recordContext,timetableEntries:index.entries,teachingGroups:catalogue?.teachingGroups||[],timetableNames:timetableNames.sort((a,b)=>a.localeCompare(b)),availablePeriods:entry?availablePeriods:Array.from({length:17},(_,i)=>i),unmatchedTimetableNames,subjects:[...subjects].sort((a,b)=>a.localeCompare(b)),subjectBaseline:entry?{id:entry.id,name:entry.name,from:entry.from,to:entry.to}:null,schedulerAvailable:p.schedulerAvailable===true};
 }
 if(['dutyRoster','setDutySMC'].includes(p.operation)||p.view==='dutyRoster'){if(!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');return recordContext;}

 if(p.operation==='teacherDailyUpdate'||p.operation==='read'&&p.view==='teacherDailyUpdate')return recordContext;
 if(['dailyEmployment','saveDailyEmploymentSettings'].includes(p.operation)||p.operation==='read'&&p.view==='dailyEmployment')return recordContext;
 if(p.operation==='restoreStapler')return {...recordContext,timetableEntries:rosterIndex_().entries};
 if(['createStapler','importStapler','previewRestoreStapler','staplerDates','requestStapler','decideStapler','renameStapler','deleteStapler'].includes(p.operation)||p.view==='staplerDates'&&!['moveStapler','restoreStapler'].includes(p.operation)||p.operation==='stapler'&&requested<today&&state.staplerPlans.some(r=>r.date===requested))return {...recordContext,timetableEntries:rosterIndex_().entries};
 if(p.operation==='stapler'&&!GSISRosterOperations.staplerPermission(state,recordContext,requested)&&GSISRosterOperations.mayViewConfirmed(state,recordContext,state.staplerPlans.find(r=>r.date===requested)))return {...recordContext,timetableEntries:rosterIndex_().entries};
 if(p.operation==='sendDailyEmploymentReport'&&state.dailyEmploymentSnapshots?.some(r=>r.date===requested))return recordContext;
 if(p.operation==='scheduledRoster'&&(state.massPublications?.[today]||state.staplerPlans.some(r=>r.date===today&&r.published))&&minute>=GSISRosterOperations.clock(state.dailyEmploymentSettings.time)&&!state.dailyEmploymentAutomatic?.[today])dates.push(today);
 // These views use durable records, not a rebuilt school-wide timetable or quota.
 if(['history','acknowledge','audit','prunePreview','accounting','saveRecessSettings'].includes(p.operation)||p.operation==='read'&&['duties','mine','prune','notificationReadiness'].includes(p.view))return {user,storageMaxChars:p.operation==='prunePreview'||p.view==='prune'?rosterOperationsMaxChars_():undefined,storageView:p.operation==='prunePreview'||p.view==='prune'?rosterOperationsStoredView_:undefined,people:c.rosterPeople.map(p=>({id:String(p.id),name:String(p.name||''),active:p.active===true,mobile:String(p.mobile||'')})),days:{},timetableEntries:rosterOperationsRecordOnly_(p)?[]:rosterIndex_().entries,today,minute,now:now.getTime(),iso:now.toISOString(),uuid:()=>Utilities.getUuid(),notificationsConfigured:p.notificationsReady===true,adminRecipients:[],smcIds:c.rosterSMCIds||[]};
 if(p.operation==='saveRecess')dates.push(...GSISRosterOperations.dates(p));
 if(p.operation==='moveStapler')dates.push(GSISRosterOperations.date(p.newDate));
 if(p.operation==='saveAbsence'&&!p.id)dates.push(...GSISRosterOperations.absenceDates({...p,date:requested},recordContext));
 for(const id of [p.absenceId,p.id,...(p.absenceIds||[]),...(p.ids||[])]){const a=state.absences.find(a=>a.id===id)||state.requests.find(a=>a.id===id)||state.adhoc.find(a=>a.id===id);if(a)dates.push(a.date);}
 // Existing saved plans supply their own editor data. Reopening needs current
 // baseline identity/timing and authority; Save and Confirm still rebuild quotas.
 const savedRead=p.operation==='stapler'&&GSISRosterOperations.staplerPermission(state,recordContext,requested)?state.staplerPlans.find(r=>r.date===requested):null,savedReadPlan=savedRead?.draft||savedRead?.published;
 const unique=[...new Set(dates)],index=providedIndex||rosterIndex_(),models={},modelIdentities={},cellMutation=rosterOperationsCellMutation_(p,state),quotaRequested=!savedReadPlan&&!cellMutation&&rosterOperationsNeedsQuota_(p),quotaSource=allocationRead?rosterOperationsQuotaSource_():null,allocationReferenceKey=allocationRead?rosterOperationsAllocationReference_(state,people,index,p,quotaSource,today,unique):null,cached=allocationRead?rosterOperationsAllocationBaseline_(allocationReferenceKey):null;
 if(cached&&quotaSource.entry)reliefGuard_(quotaSource.book,quotaSource.index,quotaSource.entry);
 const quota=quotaRequested&&!cached?rosterOperationsPhase_('quota',()=>rosterOperationsQuota_(unique,quotaSource)):{from:'',to:'',rows:[]};
 let subjectCatalogueLoaded=false;
 const compact=p.operation==='read'&&p.compact===true&&['report','entry'].includes(p.view),targetId=(user.smc||user.admin)?(p.staffId||state.absences.find(a=>a.id===(p.absenceId||p.id))?.staffId||user.staffId):user.staffId,targetIds=new Set(compact&&p.staffIds!==undefined?GSISRosterOperations.absenceStaffIds(recordContext,p):[targetId]);

 const quotaById=new Map(quota.rows.map(r=>[r.id,r]));
 const classCatalogues={},days=cached?cached.days:{};for(const d of cached?[]:unique){
  const savedDay=p.operation==='stapler'||p.view==='stapler'?null:rosterOperationsSavedStaplerDay_(state,d);
  if(savedDay){const inRange=d>=quota.from&&d<=quota.to;days[d]={...savedDay,compact,targetId:compact?targetId:null,...(compact&&p.staffIds!==undefined?{targetIds:[...targetIds]}:{}),quotaSource:quota.source||null,deployTeachingEvidence:GSISRosterAllocation.deploymentTeachingEvidence(quota,d),teachers:savedDay.teachers.filter(t=>!compact||targetIds.has(t.staffId)).map(t=>{const row=inRange?quotaById.get(t.staffId):null;return rosterOperationsQuotaTeacher_(t,row,row?.capConfigured||row?.periodCap!=null?rosterOperationsWeekCells_(d,t.timetableName||t.name,index.entries,models,savedDay.parity,state):undefined,quota.subjectCategories,quota.source);})};continue;}
  const entry=GSISRoster.active(index.entries,d);if(!entry){days[d]={id:null,parity:null,verified:true,schoolDay:false,warning:'No timetable is in force on this date.',periods:[],teachers:[]};continue;}
  const model=models[entry.id]||(models[entry.id]=rosterModel_(entry)),calendar=p.calendarByDate?.[d],verified=calendar&&calendar.date===d&&typeof calendar.schoolDay==='boolean',parity=model.layoutMode==='single-week'?'single':verified&&['odd','even'].includes(calendar.parity)?calendar.parity:null;
  const week=parity?model[parity]:null,weekday=(new Date(d+'T12:00:00Z').getUTCDay()+6)%7,schoolDay=verified&&calendar.schoolDay===true&&weekday<5&&!!week;
  const periods=Array.from({length:model.maxPeriod+1},(_,period)=>{const startMinutes=model.timing.startMinutes+period*model.timing.periodMinutes,endMinutes=startMinutes+model.timing.periodMinutes,fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');return {period,start:fmt(startMinutes),end:fmt(endMinutes),startMinutes,endMinutes};});
  if(p.operation!=='publish'&&!quotaRequested&&!cellMutation&&!subjectCatalogueLoaded&&GSISRoster.weeks(model).some(([,w])=>w.blocks.some(b=>b.cells.some(cell=>String(cell[3]||'').trim())))){Object.assign(quota,rosterOperationsSubjectCatalogue_());subjectCatalogueLoaded=true;}
  const teachers=[],identityWeek=model.layoutMode==='single-week'?model.single:model.odd,matched=modelIdentities[entry.id]||(modelIdentities[entry.id]=GSISRosterOperations.matchTimetableNames(state,people,identityWeek.blocks)),teacherIdentities=matched.map(({person,timetableName})=>({staffId:person.id,name:person.name,timetableName}));
  if(week&&weekday<5)for(const {index:blockIndex,person,timetableName} of matched){if(compact&&!targetIds.has(person.id))continue;const block=week.blocks[blockIndex],r=d>=quota.from&&d<=quota.to?quotaById.get(person.id):null;teachers.push(rosterOperationsQuotaTeacher_({staffId:person.id,name:person.name,timetableName,teachingProfile:quotaRequested?GSISRosterAllocation.teachingProfile((model.layoutMode==='single-week'?[model.single]:[model.odd,model.even]).flatMap(w=>w.blocks[blockIndex]?.cells||[]),quota.formClasses||[],quota.teachingGroups||[],quota.subjectCategories||{},state.systemConfig):undefined,cells:block.cells.slice(weekday*week.perDay,(weekday+1)*week.perDay),...(p.operation==='externalDuties'?{weekCells:block.cells,perDay:week.perDay}: {})},r,r?.capConfigured||r?.periodCap!=null?rosterOperationsWeekCells_(d,timetableName,index.entries,models,parity,state):block.cells,quota.subjectCategories,quota.source));}
  days[d]={id:entry.id,modelId:entry.id,modelReference:{id:entry.id,name:entry.name,from:entry.from,to:entry.to,priority:entry.priority},teacherIdentities,compact,targetId:compact?targetId:null,...(compact&&p.staffIds!==undefined?{targetIds:[...targetIds]}:{}),parity,verified:!!verified,schoolDay,warning:!verified?'Calendar date is unverified. Assignment planning is unavailable.':!schoolDay?(calendar.reason||calendar.warning||'This is not a confirmed school day.'):teacherIdentities.length!==identityWeek.blocks.length?'Some timetable names could not be matched uniquely to Contacts; these teachers are unavailable for automatic selection.':'',periods,teachers,endOfDayMinutes:model.timing.endOfDayMinutes??810,deployTeachingEvidence:GSISRosterAllocation.deploymentTeachingEvidence(quota,d),quotaSource:quota.source||null,recesses:model.recesses||[],subjectCategories:quota.subjectCategories||{},teachingGroups:d>=quota.from&&d<=quota.to?quota.teachingGroups||[]:[],formClasses:compact||savedReadPlan?[]:(classCatalogues[entry.id+':'+(d>=quota.from&&d<=quota.to)]||(classCatalogues[entry.id+':'+(d>=quota.from&&d<=quota.to)]=rosterOperationsFormClasses_(entry,model,d>=quota.from&&d<=quota.to?quota.formClasses||[]:[])))};
 }
 if(savedReadPlan)return {...recordContext,days,baselineDays:days,timetableEntries:index.entries,venues:{[requested]:savedReadPlan.venues||[]}};
 const dutySources=Object.fromEntries(unique.map(d=>[d,contactsDuty])),venues=cached?cached.venues:Object.fromEntries(unique.map(d=>[d,d>=quota.from&&d<=quota.to?quota.venues||[]:[]]));
 if(allocationRead&&!cached)rosterOperationsAllocationBaseline_(allocationReferenceKey,{days,venues});
 const configured=p.notificationsReady===true,adminRecipients=(props_().getProperty('ROSTER_NOTIFICATION_ADMIN_IDS')||'').split(',').map(s=>s.trim()).filter(id=>people.some(p=>p.id===id)&&(c.rosterAdminIds||[]).includes(id));
 return GSISRosterOperations.composeStaplerContext(state,{calendarDatesVerified:recordContext.calendarDatesVerified,user,people,days,baselineDays:days,...(allocationRead?{allocationReferenceKey,cacheReused:!!cached}:{}),staplerEditor:['stapler','createStapler','importStapler','saveStapler','confirmStapler','publishStapler','resetStapler','moveStapler','restoreStapler'].includes(p.operation),dutySources,venues,quotaRequested,cellMutation,timetableEntries:index.entries,today,minute,now:now.getTime(),iso:now.toISOString(),uuid:()=>Utilities.getUuid(),notificationsConfigured:configured,adminRecipients,smcIds:c.rosterSMCIds||[]});
}
function rosterOperationsDigest_(p){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(p)).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function rosterOperationsCommandDigest_(p){const stable={...p};delete stable.calendarByDate;delete stable.trustedNow;delete stable.notificationsReady;delete stable.schedulerAvailable;return rosterOperationsDigest_(stable);}
// Repair deliberately reads the stored shape. General validation initialises
// legacy settings and lazy evidence, which this bounded command must preserve.
function rosterOperationsAuditRepairRead_(){
 const id=props_().getProperty('ROSTER_OPERATIONS_FILE')||rosterFindFile_(ROSTER_DATA,'Roster operations.json');
 if(!id)error_(503,'Relief records need review.');
 const source=rosterOperationsStoredRead_(id),raw=source.value;
 if(!raw||raw.schema!==1||!Number.isSafeInteger(raw.revision)||raw.revision<0||!Array.isArray(raw.audit)||!Array.isArray(raw.receipts))error_(503,'Relief records need review.');
 return source;
}
function rosterOperationsAuditRepairReceipt_(raw,p,actor){
 const old=raw.receipts.find(row=>row?.id===p.requestId);if(!old)return null;
 if(typeof rosterNativeReceiptMatches_==='function'?!rosterNativeReceiptMatches_(old,p,actor):old.actor!==actor||old.digest!==rosterOperationsCommandDigest_(p))error_(409,'This request ID was used for a different save.');
 // A matched cold receipt alone may read its verified original result. Never
 // install getters or normalise other receipts in the authoritative raw state.
 return old.archiveRef?{...old,result:rosterColdArchiveItem_(old.archiveRef,raw).result}:old;
}
function rosterOperationsAuditRepair_(req,c){
 const user=rosterOperationsAuthority_(c,req.identity),p=req.input||{};
 if(user.admin!==true)error_(403,'Current Admin access is required.');
 if(!['dryRun','apply'].includes(p.mode))error_(400,'Choose dryRun or apply for the audit repair.');
 if(p.mode==='apply'&&(typeof p.requestId!=='string'||!/^[\w-]{36}$/.test(p.requestId)||typeof p.previewDigest!=='string'||!/^[a-f0-9]{64}$/.test(p.previewDigest)))error_(400,'The repair request ID and dry-run preview are required.');
 const rule='stapler-audit-decision-suffix',version=1,preview=raw=>rosterOperationsDigest_([rule,version,raw]);
 if(p.mode==='dryRun'){
  const raw=rosterOperationsAuditRepairRead_().value,repair=GSiSRosterImport.repairStaplerAuditIds(raw.audit);
  return {rule,version,pairs:repair.pairs,revision:raw.revision,previewDigest:preview(raw)};
 }
 const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Another save is finishing. Retry this same repair request.');
 try{
  const source=rosterOperationsAuditRepairRead_(),raw=source.value,old=rosterOperationsAuditRepairReceipt_(raw,p,req.identity.email);
  if(old)return {...old.result,replayed:true};
  if(preview(raw)!==p.previewDigest)error_(409,'Relief records changed. Run a fresh audit repair dry-run.');
  const repair=GSiSRosterImport.repairStaplerAuditIds(raw.audit);
  if(!repair.pairs)return {rule,version,pairs:0,applied:false,revision:raw.revision};
  if(raw.revision===Number.MAX_SAFE_INTEGER)error_(409,'The saved revision cannot be advanced. Ask Admin to review the records.');
  const sourceCheck=()=>{if((props_().getProperty('ROSTER_OPERATIONS_FILE')||rosterFindFile_(ROSTER_DATA,'Roster operations.json'))!==source.id)error_(409,'Roster storage changed. Retry against the latest saved state.');};
  rosterOperationsStorageSources_.set(raw,source);rosterOperationsAuditSources_.set(raw,raw.audit.map(row=>({id:row?.id})));
  raw.audit=repair.audit;raw.revision++;
  const result={rule,version,pairs:repair.pairs,applied:true,revision:raw.revision,requestId:p.requestId};
  raw.receipts.push({id:p.requestId,actor:req.identity.email,digest:rosterOperationsCommandDigest_(p),result,at:new Date().toISOString(),revision:raw.revision});
  sourceCheck();rosterOperationsCommit_(raw,null,false,sourceCheck,true);return result;
 }finally{deployUnlock_(lock);}
}
function rosterOperationsReceipt_(req,c){
 const user=rosterOperationsAuthority_(c,req.identity),p=req.input?.command,repair=p?.operation==='repairStaplerAuditIds';
 if(repair&&user.admin!==true)error_(403,'Current Admin access is required.');
 const writes=['migrateStaplerPlans','confirmTimetableReconcile','repairStaplerAuditIds','archiveColdOutput','reliefBatch','saveAbsence','deleteAbsences','saveInstructions','saveAdhoc','deleteAdhoc','saveTypes','requestMutual','respondMutual','prune','saveNameBridge','deleteNameBridge','notifyDaily','saveSystemConfig','saveDailyEmploymentSettings','sendDailyEmploymentReport','createStapler','importStapler','saveStapler','confirmStapler','publishStapler','resetStapler','requestStapler','decideStapler','renameStapler','moveStapler','deleteStapler','restoreStapler','unassign','saveRecessSettings','saveRecess','deleteRecess','setNoRelief','noRelief','publish','acknowledge','removeAssignment','saveCustomInstruction','deleteCustomInstruction','setCustomInstructionEnabled','assign','combine','undo','optimise','autoAllocate','setDutySMC','importRHistory','verifyRYear','correctRelief','confirmCompleted'];
 if(!p||typeof p!=='object'||Array.isArray(p)||!writes.includes(p.operation)||typeof p.requestId!=='string'||!/^[\w-]{36}$/.test(p.requestId))error_(400,'The original save command is required.');
 const s=repair?rosterOperationsAuditRepairRead_().value:rosterOperationsState_(true),receipt=repair?rosterOperationsAuditRepairReceipt_(s,p,req.identity.email):s.receipts.find(r=>r.id===p.requestId);
 if(receipt&&(typeof rosterNativeReceiptMatches_==='function'?!rosterNativeReceiptMatches_(receipt,p,req.identity.email):receipt.actor!==req.identity.email||receipt.digest!==rosterOperationsCommandDigest_(p)))error_(409,'This request ID was used for a different save.');
 if(receipt?.cancelled)return {accepted:false,cancelled:true,confirmation:'cancelled',requestId:p.requestId,currentRevision:s.revision};
 // Absence of a receipt can also mean the original request is still running.
 // This read never cancels it or authorises a replacement request ID.
 return {accepted:!!receipt,confirmation:receipt?'accepted':'unconfirmed',requestId:p.requestId,currentRevision:s.revision,...(receipt?{savedIds:receipt.result?.savedIds||[],acceptedAt:receipt.at,acceptedRevision:receipt.revision??null}:{}),...(receipt&&p.operation==='acknowledge'?{...rosterAcknowledgementProjection_(s,rosterAcknowledgementContext_(req,c),p),...receipt.result,acknowledgementOnly:true}: {})};
}
// Acknowledgement validates one teacher's exact published notice. It does not
// require unrelated allocation or another teacher's acknowledgement revision.
function rosterAcknowledgementContext_(req,c){
 const user=rosterOperationsAuthority_(c,req.identity),ctx={user,people:[],days:{},timetableEntries:[],uuid:()=>Utilities.getUuid()};rosterOperationsClock_(ctx);
 if(req.input?.staffId&&req.input.staffId!==user.staffId)error_(403,'You may view only your own acknowledgement.');return ctx;
}
function rosterAcknowledgementProjection_(state,ctx,p){
 const date=GSISRosterOperations.date(p.date||ctx.today),full=ctx.user.staffId?GSISRosterOperations.timetableNotice(state,ctx,{date}):null;
 const notice=full?{id:full.id,date:full.date,publishedAt:full.publishedAt,status:full.status,acknowledgedAt:full.acknowledgedAt,snapshotIds:full.snapshotIds,publicationRevision:state.dailyPublicationStates?.[date]?.revision||null}:null;
 return {date,today:ctx.today,revision:state.revision,checkedAt:ctx.iso,notice};
}
function rosterAcknowledgementStatus_(req,c){
 const ctx=rosterAcknowledgementContext_(req,c),p=req.input||{};GSISRosterOperations.date(p.date||ctx.today);
 return rosterAcknowledgementProjection_(rosterOperationsPhase_('acknowledgement-read',()=>rosterOperationsState_()),ctx,p);
}
function rosterAcknowledgementDispatch_(req,c){
 const p=req.input||{},ctx=rosterAcknowledgementContext_(req,c),date=GSISRosterOperations.date(p.date||ctx.today);
 if(!ctx.user.staffId)error_(403,'A staff identity is required.');
 if(typeof p.requestId!=='string'||!/^[\w-]{36}$/.test(p.requestId))error_(400,'A save request ID is required.');
 const digest=rosterOperationsCommandDigest_(p),lock=LockService.getScriptLock();if(!rosterOperationsPhase_('lock-wait',()=>deployLock_(lock,8000)))error_(503,'Another save is finishing. Retry the same acknowledgement.');
 let state,result,receipt,replayed=false;
 try{
  state=rosterOperationsPhase_('acknowledgement-state',()=>rosterOperationsState_());receipt=state.receipts.find(r=>r.id===p.requestId);
  if(receipt){if(typeof rosterNativeReceiptMatches_==='function'?!rosterNativeReceiptMatches_(receipt,p,req.identity.email):receipt.actor!==req.identity.email||receipt.digest!==digest)error_(409,'This request ID was used for a different save.');result=receipt.result;replayed=true;}
  else{
   rosterOperationsClock_(ctx);result=rosterOperationsPhase_('acknowledgement-apply',()=>GSISRosterOperations.acknowledgePublications(state,ctx,{...p,date}));
   const acknowledgedAt=state.acknowledgements.filter(a=>a.staffId===ctx.user.staffId&&(p.timetableNoticeId?a.timetableNoticeId===p.timetableNoticeId:(p.snapshotIds||[]).includes(a.snapshotId))).map(a=>a.at).sort().at(-1)||null;
   result={...result,acceptedNoticeId:p.timetableNoticeId||null,acknowledged:{timetableNoticeId:p.timetableNoticeId||null,snapshotIds:p.snapshotIds||[],acknowledgedAt}};
   // A duplicate notice with a new request records its retry identity, without
   // pretending there was a second business change or resetting its timestamp.
   if(result.savedIds.length)state.revision++;
   receipt={id:p.requestId,actor:req.identity.email,digest,result,at:ctx.iso,revision:state.revision};state.receipts.push(receipt);
   rosterOperationsPhase_('acknowledgement-commit',()=>rosterOperationsCommit_(state));
  }
 }finally{deployUnlock_(lock);}
 const compact={...rosterAcknowledgementProjection_(state,ctx,{date}),...result,acknowledgementOnly:true,requestId:p.requestId,acceptedAt:receipt.at,acceptedRevision:receipt.revision,...(replayed?{replayed:true}:{})};
 if(p.compact===true)return compact;
 // Compatibility for old My Relief Duties clients; new controls consume only
 // the compact receipt and never rebuild this complete view after a click.
 const viewCtx=rosterOperationsContext_(req,c,state);return {...GSISRosterOperations.view(state,viewCtx,p),...compact,acknowledgementOnly:false};
}

function rosterOperationsSavedCandidates_(response,state,ctx,p,result){
 if(p.operation!=='saveAbsence'||p.includeMutualCandidates!==true)return response;
 // Optional screen preparation follows the committed save, outside its lock.
 // Reuse its fresh register/model/Contacts snapshot; only quota is still needed.
 try{
  const d=GSISRosterOperations.date(p.date||ctx.today),ids=result.savedIds||[result.savedId],absence=state.absences.find(a=>ids.includes(a.id)&&a.date===d&&!a.deletedAt&&(!p.staffId||a.staffId===p.staffId)),dd=ctx.days[d];
  if(!absence||!dd||!ctx.user.smc&&!ctx.user.admin&&absence.staffId!==ctx.user.staffId)return {...response,mutualCandidates:null,mutualCandidatesUnavailable:true};
  const quota=rosterOperationsPhase_('mutual-quota',()=>rosterOperationsQuota_([d])),inRange=d>=quota.from&&d<=quota.to,byId=new Map(quota.rows.map(r=>[r.id,r]));
  // Reuse the existing immutable model cache. Daily cells cannot establish a weekly employment cap.
  const models={},base=ctx.baselineDays?.[d]||dd;
  const day={...base,teachers:base.teachers.map(t=>{const r=inRange?byId.get(t.staffId):null;return rosterOperationsQuotaTeacher_(t,r,r?.capConfigured||r?.periodCap!=null?rosterOperationsWeekCells_(d,t.timetableName||t.name,ctx.timetableEntries||[],models,dd.parity,state):undefined,quota.subjectCategories,quota.source);}),quotaSource:quota.source||null,subjectCategories:quota.subjectCategories||{},teachingGroups:inRange?quota.teachingGroups||[]:[],formClasses:dd.formClasses||[]},planning=GSISRosterOperations.composeStaplerContext(state,{...ctx,quotaRequested:true,baselineDays:{[d]:day},days:{[d]:day}}),demandIds=absence.reliefRequired?GSISRosterOperations.previewAbsence(planning,absence).map(x=>x.id):[];
  const candidates=demandIds.length?rosterOperationsPhase_('mutual-projection',()=>GSISRosterOperations.read(state,planning,{operation:'candidates',purpose:'mutual',byPeriod:true,date:d,demandIds})):{revision:state.revision,date:d,timetableId:dd.id,parity:dd.parity,candidatesByPeriod:{},quotaUnits:'periods/week'};
  return {...response,mutualCandidates:{...candidates,absenceId:absence.id}};
 }catch(error){return {...response,mutualCandidates:null,mutualCandidatesUnavailable:true};}
}
// A dated display checks authority, register identity and timing only; no quota or allocation context.
function rosterTimetableDay_(req,c){
 const user=rosterOperationsAuthority_(c,req.identity),today=rosterToday_();
 const p=req.input||{},date=GSISRosterOperations.date(p.date||today),state=rosterOperationsPhase_('state-read',()=>rosterOperationsState_(true)),saved=rosterOperationsSavedStaplerDay_(state,date),index=saved?null:rosterIndex_(),entry=index?GSISRoster.active(index.entries,date):null,model=entry?rosterModel_(entry):null;
 const periods=model?Array.from({length:model.maxPeriod+1},(_,period)=>{const startMinutes=model.timing.startMinutes+period*model.timing.periodMinutes,endMinutes=startMinutes+model.timing.periodMinutes,fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');return {period,start:fmt(startMinutes),end:fmt(endMinutes),startMinutes,endMinutes};}):[];
 const base=saved||{id:entry?.id||null,periods,teachers:[]},people=c.rosterPeople.map(person=>({id:String(person.id),active:person.active===true,role:String(person.role||''),mk:String(person.mk||''),appointmentLevel:String(person.appointmentLevel||''),groups:Array.isArray(person.groups)?person.groups:[]}));
 return rosterOperationsPhase_('projection',()=>GSISRosterOperations.timetableDay(state,{today,user,people,days:{[date]:base}},p));
}
// Optimistic daily commands prepare outside the writer lock. The final merge is
// still one serialized document commit: separate date locks would lose updates.
function rosterOperationsConflict_(code,message){throw Object.assign(Error(message),{status:409,code});}
function rosterOperationsPackedSnapshot_(s){return JSON.parse(JSON.stringify(rosterOperationsPackPlans_(s)));}
function rosterOperationsDayToken_(s,ctx,d){
 d=GSISRosterOperations.date(d);const packed=rosterOperationsPackPlans_(s,false),scoped=new Set(['absences','adhoc','assignments','requests','importedRelief','reliefCorrections','rotationEvents','smcDutyRoster','recessActivations','staplerPlans','staplerRequests','staplerArchives']);
 // A regenerated read package has no authority over saved content. Its clock
 // and compression work must not change a compare token or delay publication.
 const reliefIds=new Set([...(s.assignments||[]),...(s.importedRelief||[])].filter(row=>row.date===d).map(row=>row.id));
 for(const row of s.reliefCorrections||[])if(row.date===d||row.actual?.date===d)reliefIds.add(row.assignmentId);
 const rows={};for(const [key,value] of Object.entries(packed))if(Array.isArray(value)&&scoped.has(key))rows[key]=value.filter(r=>r&&typeof r==='object'&&(r.date===d||r.actual?.date===d||key==='reliefCorrections'&&reliefIds.has(r.assignmentId))).map(row=>{if(!['staplerPlans','staplerArchives'].includes(key))return row;const {timetablePackage,...saved}=row;return saved;});
 const active=GSISRoster.active(ctx.timetableEntries||[],d),bridges={...s,nameBridges:s.nameBridges.slice()};GSISRosterOperations.seedNameBridges(bridges,ctx.people||[]);
 return rosterOperationsDigest_({schema:1,date:d,rows,dayRevision:s.dayRevisions[d]||0,publication:s.dailyPublicationStates?.[d]?.revision||0,baseline:GSISRosterOperations.readyStaplerPlan((s.staplerPlans||[]).find(row=>row.date===d),s.audit)?(GSISRosterOperations.readyStaplerPlan((s.staplerPlans||[]).find(row=>row.date===d),s.audit).id||'stapler:'+d):active||ctx.days[d]?.id||null,customInstructions:s.customInstructions.filter(r=>!r.deletedAt),systemConfig:s.systemConfig,nameBridges:bridges.nameBridges,types:s.types,recessSettings:s.recessSettings});
}
// Display invalidation includes accounting inputs across dates. Command day
// tokens remain scoped to the edited date and keep their existing semantics.
function rosterOperationsAllocationChangeKey_(s,dayToken){
 const inputs={};for(const key of ['assignments','importedRelief','reliefCorrections','entitlements','accountingYears','accountingProfiles','openingBalances','rotationEvents','absences'])inputs[key]=s[key]||[];
 inputs.periods=Object.fromEntries(Object.entries(s.dailyPublicationStates||{}).map(([date,value])=>[date,value.periods||[]]));
 return rosterOperationsDigest_({schema:1,dayToken,inputs});
}
// Read hints only. Mutation validation always reloads authoritative records.
// A lost Drive acknowledgement still invalidates the hint; failed invalidation
// cannot fail a committed save and is recovered by the embedded 30-second age.
function rosterOperationsVersionChanged_(){try{const p=props_();p.setProperty('ROSTER_VERSION_HINT',Utilities.getUuid());if(p.deleteProperty)p.deleteProperty('ROSTER_SCHEDULE_DIRTY');}catch(ignore){}}
function rosterOperationsVersionSnapshot_(date,ctx,index,people,run){
 const now=Date.now();let cache,key;
 try{key='roster-version-v2:'+rosterOperationsDigest_({date,runId:run?.id||null,marker:props_().getProperty('ROSTER_VERSION_HINT'),file:props_().getProperty('ROSTER_OPERATIONS_FILE'),index,people,build:typeof GSIS_DEPLOY_VERSION==='string'?GSIS_DEPLOY_VERSION:null});cache=CacheService.getScriptCache();const raw=cache.get(key),hit=raw?JSON.parse(raw):null;if(hit?.schema===1&&hit.date===date&&Number.isFinite(hit.at)&&now>=hit.at&&now-hit.at<30000&&typeof hit.allocationChangeKey==='string'&&typeof hit.dayToken==='string'&&Number.isInteger(hit.revision)&&Number.isInteger(hit.dayRevision)&&Array.isArray(hit.nameBridges)&&hit.systemConfig)return hit;}catch(ignore){cache=null;}
 const s=rosterOperationsState_(true);GSISRosterOperations.seedNameBridges(s,people);
 const value={schema:1,date,at:now,revision:s.revision,dayRevision:s.dayRevisions[date]||0,dayToken:rosterOperationsDayToken_(s,ctx,date),nameBridges:s.nameBridges,systemConfig:s.systemConfig,runReceipt:run&&typeof rosterAllocationRunReceipt_==='function'?rosterAllocationRunReceipt_(run,s)?{cancelled:rosterAllocationRunReceipt_(run,s).cancelled===true,optimise:rosterAllocationRunReceipt_(run,s).optimise,allocationStatus:rosterAllocationRunReceipt_(run,s).allocationStatus}:null:null};
 value.allocationChangeKey=rosterOperationsAllocationChangeKey_(s,value.dayToken);
 try{const encoded=JSON.stringify(value);if(cache&&encoded.length<90000)cache.put(key,encoded,30);}catch(ignore){}
 return value;
}
function rosterOperationsSettingsToken_(s){return rosterOperationsDigest_({schema:1,dailyEmploymentSettings:s.dailyEmploymentSettings});}
// Row tokens provide optimistic concurrency for edits to one recorded absence.
// They cover the durable record, not its date-dependent display projection.
function rosterOperationsAbsenceToken_(row){return rosterOperationsDigest_({schema:1,absence:row});}
function rosterOperationsDeletionCheck_(s,p){
 const tokens=p.expectedAbsenceTokens;if(!Array.isArray(p.ids)||!p.ids.length||p.ids.some(id=>typeof id!=='string')||new Set(p.ids).size!==p.ids.length||!tokens||typeof tokens!=='object'||Array.isArray(tokens))error_(400,'Reload the selected absence records before deleting.');
 const rows=new Map(s.absences.map(row=>[row.id,row]));
 for(const id of p.ids){const row=rows.get(id),token=tokens[id];if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token)||!row||row.deletedAt||token!==rosterOperationsAbsenceToken_(row))rosterOperationsConflict_('ABSENCE_CONFLICT','A selected absence changed. Refresh and review the selection before deleting.');}
}
function rosterOperationsAttachDayToken_(response,s,ctx,p){
 if(response&&ctx.allocationReferenceKey)Object.assign(response,{allocationReferenceKey:ctx.allocationReferenceKey,cacheReused:ctx.cacheReused===true,allocationClock:ctx.today+':'+ctx.minute});
 if(response&&(Array.isArray(response.absences)||Array.isArray(response.ownAbsences))){
  const records=new Map(s.absences.map(row=>[row.id,row])),tokens=new Map();
  for(const row of [...(response.absences||[]),...(response.ownAbsences||[])]){const saved=records.get(row.id);if(!saved||row.editable!==true)continue;if(!tokens.has(row.id))tokens.set(row.id,rosterOperationsAbsenceToken_(saved));row.absenceToken=tokens.get(row.id);}
 }
 if(response?.canEdit===true&&(['dailyEmployment','saveDailyEmploymentSettings','sendDailyEmploymentReport'].includes(p.operation)||p.operation==='read'&&p.view==='dailyEmployment'))response.settingsToken=rosterOperationsSettingsToken_(s);
 if(response&&(['allocation','smc','dailyNotify'].includes(p.view)||['allocation','dailyNotify'].includes(p.operation))){response.dayToken=rosterOperationsDayToken_(s,ctx,p.date||ctx.today);response.allocationChangeKey=rosterOperationsAllocationChangeKey_(s,response.dayToken);}
 if(response&&(['allocation','smc'].includes(p.view)||p.operation==='allocation')){
  const date=p.date||ctx.today;
  if(!response.cellStates){const demands=[...GSISRosterOperations.demand(ctx,s,date),...(response.manualRecoveryDemands||GSISRosterOperations.manualRecoveryDemands(s,ctx,date))];response.cellStates=GSISRosterOperations.cellDecisions(s,date,demands.map(d=>d.id));}
  if(response.allocationPatch){const selected=new Set(p.demandIds||[]);response.cellStates=Object.fromEntries(Object.entries(response.cellStates).filter(([id])=>selected.has(id)));}
  response.cellProvenance=GSISRosterOperations.cellProvenance(s,ctx,date,Object.keys(response.cellStates||{}));
  if(!response.allocationPatch)response.exportContext=GSISRosterOperations.dailyExport(s,ctx,{date,fullTeachers:true,dailyDrive:true});
  response.auditExport=s.allocationAuditExports?.[date]?{pendingRevision:s.allocationAuditExports[date].pendingRevision||0,exportedRevision:s.allocationAuditExports[date].exportedRevision||0}:null;
 }
 return response;
}
function rosterOperationsBatchMerge_(s,ctx,p){
 if(p.operation!=='reliefBatch'||p.baseCells===undefined)return {command:p,changes:null};
 if(!p.baseCells||typeof p.baseCells!=='object'||Array.isArray(p.baseCells)||!Array.isArray(p.commands)||!p.commands.length||p.commands.length>100)error_(400,'A complete cell comparison is required.');
 // Older clients cannot prove which human decision they reviewed. Require a
 // current day/document fence before accepting their value-only comparison.
 if(p.baseCellTokens===undefined){const current=typeof p.expectedDayToken==='string'?p.expectedDayToken===rosterOperationsDayToken_(s,ctx,p.date):p.revision===s.revision;if(!current)rosterOperationsConflict_('DAY_CONFLICT','Allocation decisions changed. Refresh before saving your retained choices.');}
 const ids=[...new Set(p.commands.flatMap(c=>Array.isArray(c.demandIds)?c.demandIds:[]))],normal=v=>({staffId:v?.staffId||null,noRelief:v?.noRelief===true,combination:v?.combination===true,manual:v?.manual===true,cleared:v?.cleared===true}),same=(a,b)=>JSON.stringify(normal(a))===JSON.stringify(normal(b)),local={};
 for(const id of ids){const b=p.baseCells[id];if(!b||typeof b!=='object'||!Object.hasOwn(b,'staffId')||!['noRelief','combination','manual','cleared'].every(k=>typeof b[k]==='boolean')||b.staffId!==null&&typeof b.staffId!=='string')error_(400,'The original value for every changed cell is required.');local[id]=normal(b);}
 const dd=ctx.days[p.date],sources=new Map(GSISRosterOperations.demand(ctx,s,p.date).map(d=>[d.id,GSISRosterOperations.cellSourceKey(d)])),assignedHere=new Set(),existing=new Map(GSISRosterAllocation.effectiveAssignments(s,true).filter(a=>a.date===p.date).map(a=>[a.demandId,a]));
 for(const c of p.commands)for(const id of c.demandIds||[]){
  if(['assign','combine'].includes(c.operation)){local[id]={staffId:c.staffId,noRelief:false,combination:c.operation==='combine',manual:true,cleared:false};assignedHere.add(id);}
  else if(c.operation==='unassign'||c.operation==='setNoRelief'&&c.noRelief!==true)local[id]={staffId:null,noRelief:false,combination:false,manual:true,cleared:true};
  else if(c.operation==='setNoRelief')local[id]={staffId:null,noRelief:true,combination:false,manual:true,cleared:false};
  else if(c.operation==='returnAutomatic'){const old=existing.get(id),empty=local[id].noRelief||!local[id].staffId||!sources.has(id)||!assignedHere.has(id)&&(!old||old.invalidCover||old.noRelief);local[id]=empty?{staffId:null,noRelief:false,combination:false,manual:false,cleared:false}:{...local[id],manual:false,cleared:false};}
  else error_(400,'Unsupported cell change.');
 }
 if(ids.some(id=>!sources.has(id)))for(const recovery of GSISRosterOperations.manualRecoveryDemands(s,ctx,p.date)){if(!sources.has(recovery.id)&&p.commands.filter(command=>command.demandIds?.includes(recovery.id)).every(command=>['unassign','returnAutomatic'].includes(command.operation)))sources.set(recovery.id,recovery.recoverySourceKey);}
 if(dd?.verified!==true||dd.schoolDay!==true||dd.id!==p.expectedTimetableId||(dd.staplerRevision||0)!==p.expectedStaplerRevision||dd.parity!==p.expectedParity||ids.some(id=>!sources.has(id)||sources.get(id)!==p.expectedDemandSources?.[id]))rosterOperationsConflict_('DAY_CONFLICT','The timetable or selected lesson changed. Review your retained choices.');
 const conflicts=[],apply=new Set(),changes=[],currentCells=GSISRosterOperations.cellDecisions(s,p.date,ids),provenance=GSISRosterOperations.cellProvenance(s,ctx,p.date,ids);
 if(p.baseCellTokens!==undefined&&(!p.baseCellTokens||typeof p.baseCellTokens!=='object'||Array.isArray(p.baseCellTokens)||ids.some(id=>typeof p.baseCellTokens[id]!=='string')))error_(400,'The original decision token for each changed lesson is required.');
 if(p.cellResolutions!==undefined&&(!p.cellResolutions||typeof p.cellResolutions!=='object'||Array.isArray(p.cellResolutions)||Object.keys(p.cellResolutions).some(id=>!ids.includes(id))))error_(400,'Choose a resolution for a changed lesson.');
 for(const id of ids){const base=normal(p.baseCells[id]),current=normal(currentCells[id]),next=normal(local[id]),currentProvenance=provenance[id],resolution=p.cellResolutions?.[id];let outcome;
  if(resolution&&(!['keepMine','keepOnline'].includes(resolution.choice)||typeof resolution.expectedToken!=='string'))error_(400,'Choose Keep mine or Keep online using the latest comparison.');
  const tokenChanged=p.baseCellTokens!==undefined&&p.baseCellTokens[id]!==currentProvenance.token,reviewChanged=resolution&&resolution.expectedToken!==currentProvenance.token;
  if(reviewChanged||!resolution&&tokenChanged&&!same(next,current)&&!same(next,base)){conflicts.push({demandId:id,base,current,local:next,currentProvenance,baseToken:p.baseCellTokens?.[id]||null});continue;}
  if(resolution?.choice==='keepOnline')outcome='kept-online';
  else if(same(next,current))outcome='already-current';
  else if(resolution?.choice==='keepMine'){outcome='updated';apply.add(id);}
  else if(same(next,base))outcome='kept-online';else if(same(base,current)){outcome='updated';apply.add(id);}else{conflicts.push({demandId:id,base,current,local:next,currentProvenance,baseToken:p.baseCellTokens?.[id]||null});continue;}
  changes.push({demandId:id,before:current,after:outcome==='updated'?next:current,outcome,beforeProvenance:currentProvenance,choice:resolution?.choice||null,actor:ctx.user.email,actorName:ctx.people.find(person=>person.id===ctx.user.staffId)?.name||ctx.user.email,at:ctx.iso});
 }

 if(conflicts.length)throw Object.assign(Error('Some lessons were changed by another user. Compare your changes with the current online values.'),{status:409,code:'CELL_CONFLICT',conflicts});
 return {command:{...p,commands:p.commands.map(c=>({...c,demandIds:c.demandIds.filter(id=>apply.has(id))})).filter(c=>c.demandIds.length)},changes};
}
function rosterOperationsBatchAudit_(s,ctx,p,changes){
 const reviewed=changes.filter(change=>change.choice);if(!reviewed.length)return;
 GSISRosterOperations.essentialDecisionAudit(s,ctx,'resolveAllocationConflict',{date:p.date,requestId:p.requestId,choices:reviewed.map(({demandId,choice,before,after,beforeProvenance,actor,actorName,at,outcome})=>({demandId,choice,before,after,beforeProvenance,actor,actorName,at,outcome}))});
}
function rosterOperationsNotificationReady_(s,p){
 if(s.notificationTransportUnavailable===true&&(p.operation==='notifyDaily'||p.operation==='publishStapler'))error_(503,'WhatsApp delivery records are temporarily unavailable. You can keep saving allocations or let teachers see the timetable without sending. Retry Send WhatsApp when delivery records recover.');
}
function rosterOperationsPreparedCheck_(s,ctx,p,intakeProjection=false){
 rosterOperationsNotificationReady_(s,p);
 if(!Number.isSafeInteger(p.revision)||p.revision<0||p.revision>s.revision)rosterOperationsConflict_('DAY_CONFLICT','Relief records changed. Refresh before saving.');
 if(p.operation==='notifyDaily'&&p.expectedDayToken!==undefined&&p.expectedDayToken!==rosterOperationsDayToken_(s,ctx,p.date||ctx.today))rosterOperationsConflict_('DAY_CONFLICT','The saved timetable changed. Refresh and review it before notifying.');
 if(p.operation==='notifyDaily'&&p.expectedPublicationRevision!==undefined){
  if(!Number.isSafeInteger(p.expectedPublicationRevision)||p.expectedPublicationRevision<0||p.expectedPublicationRevision!==(s.dailyPublicationStates?.[p.date||ctx.today]?.revision||0))rosterOperationsConflict_('PUBLICATION_CONFLICT','The published timetable for this date changed. Refresh and review it before notifying.');
 }else if(p.operation==='saveAbsence'&&p.id&&p.expectedAbsenceToken!==undefined){
  const row=s.absences.find(a=>a.id===p.id);
  if(typeof p.expectedAbsenceToken!=='string'||!/^[a-f0-9]{64}$/.test(p.expectedAbsenceToken)||!row||row.deletedAt||p.expectedAbsenceToken!==rosterOperationsAbsenceToken_(row))rosterOperationsConflict_('ABSENCE_CONFLICT','This absence changed. Refresh and review the entry before saving.');
 }else if(p.operation==='reliefBatch'&&p.baseCells!==undefined){
  rosterOperationsBatchMerge_(s,ctx,p);
 }else if(['publish','reliefBatch','autoAllocate','optimise'].includes(p.operation)&&p.expectedDayToken!==undefined){
  if(typeof p.expectedDayToken!=='string'||!/^[a-f0-9]{64}$/.test(p.expectedDayToken)||p.expectedDayToken!==rosterOperationsDayToken_(s,ctx,p.date||ctx.today))rosterOperationsConflict_('DAY_CONFLICT','The selected day changed. Refresh and review this date before saving.');
 }else if(p.revision!==s.revision&&!(p.operation==='saveAbsence'&&!p.id)&&!(p.operation==='saveInstructions'&&p.instructionChanges!==undefined)&&!(intakeProjection&&['requestMutual','saveInstructions'].includes(p.operation)))rosterOperationsConflict_('DAY_CONFLICT','Relief records changed. Refresh before saving.');
}
function rosterOperationsReferenceKey_(ctx){const source=ctx.quotaRequested?Object.values(ctx.baselineDays||ctx.days).find(d=>d.quotaSource)?.quotaSource:null;return rosterOperationsDigest_({entries:ctx.timetableEntries||[],quota:source?{id:source.versionId,revision:source.revision,commit:source.commit}:null});}
// Recheck small mutable source manifests, never reload all cells under the lock.
function rosterOperationsReferenceStamp_(ctx){
 const index=rosterIndex_();if(JSON.stringify(index.entries)!==JSON.stringify(ctx.timetableEntries||[]))rosterOperationsConflict_('PREPARED_RETRY','Timetable sources changed during preparation.');
 let quota=null;if(ctx.quotaRequested){const idx=index_(book_());if(idx.pendingFieldCommit)rosterOperationsConflict_('PREPARED_RETRY','Deployment save confirmation is pending.');const en=publishedEntry_(idx),source=Object.values(ctx.baselineDays||ctx.days).find(d=>d.quotaSource)?.quotaSource;
  quota=en?{id:en.id,revision:en.revision,commit:en.commit||en.publishedAt||''}:null;
  if(source?(!quota||source.versionId!==quota.id||source.revision!==quota.revision||source.commit!==quota.commit):!!quota)rosterOperationsConflict_('PREPARED_RETRY','Published workload inputs changed during preparation.');
 }
 return rosterOperationsDigest_({entries:index.entries,quota});
}
function rosterOperationsDependencies_(state,p,ctx){
 const A=GSISRosterAllocation,dates=new Set(p.date?[p.date,...(Array.isArray(p.dates)?p.dates:[]),...(p.actualDate?[p.actualDate]:[])]:Object.keys(ctx.days)),scheduled=p.operation==='scheduledRoster';if(scheduled)dates.add(ctx.today);
 const weeks=new Set([...dates].map(A.monday)),years=new Set([...dates].map(A.year)),values={schema:2,dates:[...dates].sort()};
 const dated=row=>dates.has(row.date)||dates.has(row.actual?.date),pickDates=value=>Object.fromEntries(Object.entries(value||{}).filter(([key,row])=>dates.has(key)||dates.has(key.slice(0,10))||row&&dated(row)));
 // Only planning facts belong here. Inbox, delivery, audit and unrelated dated
 // records merge against the latest document without invalidating the solver.
 for(const key of ['types','systemConfig','nameBridges','recessSettings','customInstructions','accountingProfiles'])values[key]=state[key]??null;
 for(const key of ['absences','assignments','importedRelief','requests','adhoc','recessActivations','publicationSnapshots','staplerRequests','optimisationRuns','smcDutyRoster'])values[key]=(state[key]||[]).filter(dated);
 const reliefIds=new Set([...values.assignments,...values.importedRelief].map(row=>row.id));for(const row of state.reliefCorrections||[])if(dated(row))reliefIds.add(row.assignmentId);values.reliefCorrections=(state.reliefCorrections||[]).filter(row=>reliefIds.has(row.assignmentId));
 values.staplerPlans=(state.staplerPlans||[]).filter(dated).map(({timetablePackage,...saved})=>saved);
 for(const key of ['dayRevisions','manualDecisions','manualAuditBaselines','cellDecisionVersions','massPublications','dailyPublicationStates','healthWarningState'])values[key]=pickDates(state[key]);
 values.accountingYears=Object.fromEntries(Object.entries(state.accountingYears||{}).filter(([year])=>years.has(year)));
 values.weekEntitlements=(state.entitlements||[]).filter(row=>weeks.has(row.week));
 values.weekLeave=(state.absences||[]).filter(row=>!row.deletedAt&&weeks.has(A.monday(row.date))&&((state.types||[]).some(type=>type.id===row.typeId&&type.extendedLeave)||['parental','hospital','npl'].includes(row.typeId))).map(({staffId,date,typeId,coverage,periods})=>({staffId,date,typeId,coverage,periods}));
 // Other dates can genuinely change this day's cap or fairness. Compare the
 // allocator's derived values, not every field of every historical record.
 // Unpack only the weeks needed by UT workload, retaining packed merge inputs.
 const accounting=rosterOperationsUnpackPlans_({...state,staplerPlans:(state.staplerPlans||[]).filter(row=>weeks.has(A.monday(row.date))).map(row=>({...row})),staplerArchives:[]});
 values.balances=Object.fromEntries([...dates].map(date=>[date,[...A.balances(accounting,ctx,date)]]));
 values.rotation=Object.fromEntries([...years].map(year=>[year,A.rotation(accounting,year)]));
 if(scheduled){values.dailyEmploymentSettings=state.dailyEmploymentSettings;values.dailyEmploymentAutomatic=pickDates(state.dailyEmploymentAutomatic);values.dailyEmploymentSnapshots=(state.dailyEmploymentSnapshots||[]).filter(dated);values.acknowledgements=(state.acknowledgements||[]).filter(row=>(state.publicationSnapshots||[]).some(snapshot=>snapshot.id===row.snapshotId&&dated(snapshot)));values.notificationInputs=state.outbox.filter(j=>dates.has(j.date)&&(j.kind==='smc_report'||j.data?.dailyPublication));}
 return rosterOperationsDigest_(values);
}
function rosterOperationsMergePrepared_(base,next,current){
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 // Concurrent reconciliation may independently discover the same durable
 // notification intent. Recompute against the winning key, never duplicate it.
 const oldJobs=new Set(base.outbox.map(j=>j.id)),liveKeys=new Map(current.outbox.filter(j=>j.key).map(j=>[j.key,j.id]));
 if(next.outbox.some(j=>!oldJobs.has(j.id)&&j.key&&liveKeys.has(j.key)&&liveKeys.get(j.key)!==j.id))rosterOperationsConflict_('PREPARED_RETRY','A notification intent was already recorded during preparation.');
 const merge=(a,b,c)=>{
  if(same(a,b))return c;if(same(a,c)||same(b,c))return b;
  if([a,b,c].every(Array.isArray)){
   const keyed=rows=>rows.every(r=>r&&typeof r==='object'&&typeof r.id==='string')&&new Set(rows.map(r=>r.id)).size===rows.length;
   if([a,b,c].every(keyed)){const old=new Map(a.map(r=>[r.id,r])),changed=new Map(b.map(r=>[r.id,r])),live=new Map(c.map(r=>[r.id,r]));
    for(const id of new Set([...old.keys(),...changed.keys()])){const before=old.get(id),after=changed.get(id);if(same(before,after))continue;const latest=live.get(id);if(!same(before,latest)&&!same(after,latest))rosterOperationsConflict_('PREPARED_RETRY','A shared record changed during preparation.');if(after===undefined)live.delete(id);else live.set(id,after);}return [...live.values()];}
  }
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);if([a,b,c].every(object)){const result={...c};for(const key of new Set([...Object.keys(a),...Object.keys(b)])){if(same(a[key],b[key]))continue;const value=merge(a[key],b[key],c[key]);if(value===undefined)delete result[key];else result[key]=value;}return result;}
  rosterOperationsConflict_('PREPARED_RETRY','A shared record changed during preparation.');
 };
 return merge(base,next,current);
}
function rosterOperationsClock_(ctx){const stamp=Date.now(),sg=new Date(stamp+8*3600000);Object.assign(ctx,{now:stamp,iso:new Date(stamp).toISOString(),today:sg.toISOString().slice(0,10),minute:sg.getUTCHours()*60+sg.getUTCMinutes()});}
function rosterOperationsCheckClock_(prepared){
 const current={};rosterOperationsClock_(current);const conflict=GSISRosterAllocation.preparedClockConflict(prepared,current);
 if(conflict)throw Object.assign(Error(conflict.message),conflict,{status:409});
}
function rosterOperationsRefreshClock_(ctx){
 const current={};rosterOperationsClock_(current);
 if(ctx.today!==current.today)throw Object.assign(Error('The school date changed while planning; re-run.'),{status:409,code:'PLANNING_CLOCK_CHANGED',reasonCode:'SCHOOL_DATE_CHANGED'});
 Object.assign(ctx,current);
}
function rosterAbsenceContextKey_(state,ctx){
 // Only inputs used to build immutable teacher/timetable context belong here.
 // Absences, allocation records, policy types and receipts are read fresh under
 // the commit lock; changes to them must not repeat model or Contacts reads.
 const names={...state,nameBridges:state.nameBridges.slice()};GSISRosterOperations.seedNameBridges(names,ctx.people);
 // A prepared read package is not timetable authority. Building one here used
 // its generated timestamp as a source proof and manufactured retry conflicts.
 // Hash only relevant source content; unrelated archives remain lazy.
 const weeks=new Set(Object.keys(ctx.days).map(d=>GSISRosterAllocation.monday(d))),relevant=state.staplerPlans.filter(r=>weeks.has(GSISRosterAllocation.monday(r.date)));
 const content=value=>value?rosterOperationsPlanDigest_(JSON.stringify(value)):null;
 const plans=relevant.map(({timetablePackage,draft,published,confirmedPlan,...row})=>({...row,draft:content(draft),published:content(published),confirmedPlan:content(confirmedPlan)}));
 return rosterOperationsDigest_({nameBridges:names.nameBridges,systemConfig:state.systemConfig,plans});
}
function rosterAbsenceReceiptResponse_(state,p,receipt,replayed,notificationsQueued){
 const result=receipt.result||{},savedIds=result.savedIds||[];
 return {...result,accepted:true,receiptOnly:true,requestId:p.requestId,revision:receipt.revision,acceptedRevision:receipt.revision,acceptedAt:receipt.at,savedIds,affectedDates:[...new Set(state.absences.filter(a=>savedIds.includes(a.id)).map(a=>a.date))],...(replayed?{replayed:true}:{notificationsQueued:notificationsQueued||0})};
}
function rosterAbsenceDispatch_(req,c){gsisRequireBackendRole_('roster');
 const p=req.input,digest=rosterOperationsCommandDigest_(p);if(p.receiptOnly===true){const user=rosterOperationsAuthority_(c,req.identity);if(!user.smc&&!user.admin&&!c.rosterPeople.some(person=>person.id===user.staffId))error_(403,'Current Roster access is required.');}if(typeof p.requestId!=='string'||!/^[\w-]{36}$/.test(p.requestId))error_(400,'A save request ID is required.');
 for(let attempt=0;attempt<2;attempt++){
  // Context preparation only needs primary facts. Delivery state is read fresh
  // at commit, or here for a receipt replay that never enters the commit lock.
  const snapshot=rosterOperationsPhase_('absence-prepare-state',()=>rosterOperationsState_(true)),prior=snapshot.receipts.find(r=>r.id===p.requestId);
  if(prior&&(prior.actor!==req.identity.email||prior.digest!==digest))error_(409,'This request ID was used for a different save.');
  if(prior&&p.receiptOnly===true)return rosterAbsenceReceiptResponse_(snapshot,p,prior,true,0);
  if(prior&&typeof rosterNotificationOverlay_==='function')rosterNotificationOverlay_(snapshot);
  if(!prior)rosterOperationsPreparedCheck_(snapshot,null,p,req.intakeProjection===true);
  const ctx=rosterOperationsPhase_('absence-prepare-context',()=>rosterOperationsContext_(req,c,snapshot)),references=rosterOperationsReferenceKey_(ctx),contextKey=rosterAbsenceContextKey_(snapshot,ctx);
  let state=snapshot,receipt=prior,result=prior?.result,replayed=!!prior,notificationsQueued=0;
  try{
   if(!prior){
    const lock=LockService.getScriptLock();if(!rosterOperationsPhase_('lock-wait',()=>deployLock_(lock,8000)))error_(503,'Another save is finishing. Retry the same save.');
    try{
     state=rosterOperationsPhase_('absence-commit-state',()=>rosterOperationsState_());receipt=state.receipts.find(r=>r.id===p.requestId);
     if(receipt){if(typeof rosterNativeReceiptMatches_==='function'?!rosterNativeReceiptMatches_(receipt,p,req.identity.email):receipt.actor!==req.identity.email||receipt.digest!==digest)error_(409,'This request ID was used for a different save.');result=receipt.result;replayed=true;}
     else{
      rosterOperationsPreparedCheck_(state,ctx,p,req.intakeProjection===true);
      if(rosterOperationsReferenceStamp_(ctx)!==references)throw Object.assign(Error('Timetable sources changed during attendance preparation.'),{status:409,code:'PREPARED_RETRY',reasonCode:'TIMETABLE_MANIFEST_CHANGED'});
      if(rosterAbsenceContextKey_(state,ctx)!==contextKey)throw Object.assign(Error('Attendance context changed during preparation.'),{status:409,code:'PREPARED_RETRY',reasonCode:'ABSENCE_CONTEXT_CHANGED'});
      const preparedToday=ctx.today;rosterOperationsClock_(ctx);if(preparedToday!==ctx.today)throw Object.assign(Error('The school date changed while planning; re-run.'),{status:409,code:'PLANNING_CLOCK_CHANGED',reasonCode:'SCHOOL_DATE_CHANGED'});
      const preparedClock=GSISRosterAllocation.prepareClock(ctx,state,p);
      if(req.intakeAcceptedAt&&p.operation==='saveAbsence'){ctx.reportedAt=req.intakeAcceptedAt;ctx.reportToday=new Date(Date.parse(req.intakeAcceptedAt)+8*3600000).toISOString().slice(0,10);ctx.attendanceOnly=req.intakeProjection===true;ctx.resubmission=req.intakeProjection===true&&!p.id;ctx.reportSequence=req.intakeSequence||0;if(req.intakeOverlapChoice){if(req.intakeOverlapChoice.token!==rosterAbsenceOverlapKey_(state,p))rosterOperationsConflict_('ABSENCE_SHORTER_CONFIRMATION','Saved absence details changed. Review the shorter report again.');ctx.resubmissionChoice=req.intakeOverlapChoice.value;}}
      if(req.intakeInstructionSource){rosterAbsenceIntakeInstructionCheck_(state,ctx,p,req.intakeInstructionSource);ctx.intakeInstructions=true;ctx.reportedAt=req.intakeAcceptedAt;ctx.reportSequence=req.intakeSequence||0;}
      GSISRosterOperations.seedNameBridges(state,ctx.people);
      const before=state.outbox.length,auditBefore={audit:state.audit.map(e=>({id:e.id})),optimisationRuns:state.optimisationRuns.map(e=>({id:e.id}))};
      ctx.intakePeer=req.intakeProjection===true;
      const attendanceProjection=ctx.attendanceOnly===true,peerProjection=p.operation==='requestMutual'&&p.proposalOnly===true;
      if(!attendanceProjection&&!peerProjection){rosterOperationsPhase_('absence-reconcile',()=>rosterOperationsReconcile_(state,ctx));for(const d of Object.keys(ctx.days)){GSISRosterAllocation.initialiseHistory(state,ctx,d);GSISRosterAllocation.captureWeek(state,ctx,d);}}
      // Duplicate/overlap checks and all allocation consequences use the latest
      // attendance facts. No context or external service reads occur here.
      result=rosterOperationsPhase_('absence-apply',()=>GSISRosterOperations.apply(state,ctx,{...p,revision:state.revision}));
      if(p.includeMutualCandidates===true&&!state.absences.some(a=>result.savedIds.includes(a.id)&&a.date===(p.date||ctx.today)))error_(400,'Choose a saved absence date for colleague arrangements.');
      if(!attendanceProjection&&!peerProjection)GSISRosterOperations.refreshStaplerNotifications(state,ctx,before);notificationsQueued=state.outbox.length-before;state.revision++;
      receipt={id:p.requestId,actor:req.identity.email,digest,result,at:ctx.iso,revision:state.revision};state.receipts.push(receipt);
      if(typeof rosterAllocationAuditAccepted_==='function')rosterAllocationAuditAccepted_(state,auditBefore,ctx,p);
      rosterOperationsPhase_('absence-commit',()=>rosterOperationsCommit_(state,null,false,()=>rosterOperationsCheckClock_(preparedClock)));
     }
    }finally{deployUnlock_(lock);}
   }
   if(p.receiptOnly===true)return rosterAbsenceReceiptResponse_(state,p,receipt,replayed,notificationsQueued);
   const input=p.view==='report'?{...p,compact:true}:p,response={...rosterOperationsPhase_('projection',()=>GSISRosterOperations.view(state,ctx,input)),...result,requestId:p.requestId,acceptedRevision:receipt.revision,...(replayed?{replayed:true}:{notificationsQueued})};
   return rosterOperationsAttachDayToken_(rosterOperationsSavedCandidates_(response,state,ctx,p,result),state,ctx,p);
  }catch(e){if(!['PREPARED_RETRY','PLANNING_CLOCK_CHANGED'].includes(e.code))throw e;if(attempt===1){if(e.code==='PLANNING_CLOCK_CHANGED')throw e;throw Object.assign(Error('Timetable inputs changed while saving. Your request is retained; retry the same save.'),{status:503,code:'ABSENCE_PREPARATION_RETRY',reasonCode:e.reasonCode||'REFERENCE_SOURCE_CHANGED',attempts:2});}}
 }
}
function rosterOperationsPreparedDispatch_(req,c){
 if(['autoAllocate','optimise'].includes(req.input?.operation)&&typeof rosterAllocationRunExecute_==='function')return rosterAllocationRunExecute_(req,c,run=>rosterOperationsPreparedCore_({...req,allocationRun:run},c));
 return rosterOperationsPreparedCore_(req,c);
}
// The command receipt confirms visibility. Allocation/health/export projections
// are independent reads and cannot turn an accepted publication into a failure.
function rosterOperationsPublicationAcknowledgement_(state,ctx,p,result,revision){
 const date=GSISRosterOperations.date(p.date||ctx.today),publication=state.dailyPublicationStates[date];
 return {...result,publicationAcknowledgement:true,visibilityPublished:true,date,today:ctx.today,revision,currentRevision:state.revision,requestId:p.requestId,acceptedRevision:revision,publishedAt:publication.publishedAt,publishedRevision:publication.revision,allocationRevision:state.dayRevisions[date]||0,dayToken:rosterOperationsDayToken_(state,ctx,date),canPublish:true,publishAudit:{firstPublish:false,required:false,changes:[]}};
}
function rosterOperationsPublishDispatch_(req,c){gsisRequireBackendRole_('roster');
 const p=req.input||{},digest=rosterOperationsCommandDigest_(p);
 if(typeof p.requestId!=='string'||!/^[\w-]{36}$/.test(p.requestId))error_(400,'A save request ID is required.');
 const accepted=(state,receipt,replayed=false)=>{if(typeof rosterNativeReceiptMatches_==='function'?!rosterNativeReceiptMatches_(receipt,p,req.identity.email):receipt.actor!==req.identity.email||receipt.digest!==digest)error_(409,'This request ID was used for a different save.');rosterOperationsAuthority_(c,req.identity);const legacy=receipt.result?.publicationAcknowledgement!==true;return {...receipt.result,...(legacy?{publicationAcknowledgement:true,visibilityPublished:true,requestId:p.requestId,date:p.date||new Date(Date.parse(receipt.at)+8*3600000).toISOString().slice(0,10),revision:receipt.revision,acceptedRevision:receipt.revision,publishedAt:receipt.at,refreshRequired:true}:{}),currentRevision:state.revision,...(replayed?{replayed:true}:{})};};
 for(let attempt=0;attempt<2;attempt++){
  // Exact confirmation needs only the primary receipt, even when Calendar,
  // timetable preparation or notification delivery records are unavailable.
  const prepared=rosterOperationsPhase_('publication-state',()=>rosterOperationsState_(true)),old=prepared.receipts.find(r=>r.id===p.requestId);
  if(old)return accepted(prepared,old,true);
  const ctx=rosterOperationsPhase_('publication-context',()=>rosterOperationsContext_(req,c,prepared)),references=rosterOperationsReferenceKey_(ctx);
  const lock=LockService.getScriptLock();if(!rosterOperationsPhase_('lock-wait',()=>deployLock_(lock,8000)))error_(503,'Another save is finishing. Retry the same publication.');
  try{
   const state=rosterOperationsPhase_('publication-current',()=>rosterOperationsState_()),receipt=state.receipts.find(r=>r.id===p.requestId);
   if(receipt)return accepted(state,receipt,true);
   rosterOperationsPreparedCheck_(state,ctx,p);
   if(rosterOperationsReferenceStamp_(ctx)!==references)rosterOperationsConflict_('PREPARED_RETRY','Timetable sources changed during publication preparation.');
   // Apply to the latest locked records. Only immutable baseline preparation
   // happens outside the lock; saved plan/absence/assignment facts stay current.
   GSISRosterOperations.seedNameBridges(state,ctx.people);rosterOperationsRefreshClock_(ctx);
   const current=GSISRosterOperations.composeStaplerContext(state,{...ctx,days:ctx.baselineDays||ctx.days}),before={audit:state.audit.map(e=>({id:e.id})),optimisationRuns:state.optimisationRuns.map(e=>({id:e.id}))};
   const preparedClock=GSISRosterAllocation.prepareClock(current,state,p);
   const result=rosterOperationsPhase_('publication-apply',()=>GSISRosterOperations.apply(state,current,{...p,notifyMode:'none'}));state.revision++;
   state.dailyPublicationStates[p.date||current.today].sourceRevision=state.revision;
   const response=rosterOperationsPublicationAcknowledgement_(state,current,p,{...result,notificationsQueued:0},state.revision),saved={id:p.requestId,actor:req.identity.email,digest,result:response,at:current.iso,revision:state.revision};state.receipts.push(saved);
   if(typeof rosterAllocationAuditAccepted_==='function')rosterAllocationAuditAccepted_(state,before,current,p);
   rosterOperationsPhase_('publication-commit',()=>rosterOperationsCommit_(state,null,false,()=>rosterOperationsCheckClock_(preparedClock)));return response;
  }catch(error){if(!['PREPARED_RETRY','PLANNING_CLOCK_CHANGED'].includes(error.code))throw error;if(attempt===1){if(error.code==='PLANNING_CLOCK_CHANGED')throw error;error_(503,'Timetable sources changed while publishing. Retry the same publication.');}}
  finally{deployUnlock_(lock);}
 }
}
function rosterOperationsPreparedCore_(req,c){gsisRequireBackendRole_('roster');
 const p=req.input,op=p.operation,digest=rosterOperationsCommandDigest_(p);
 if(typeof p.requestId!=='string'||!/^[\w-]{36}$/.test(p.requestId))error_(400,'A save request ID is required.');
 for(let attempt=0;attempt<2;attempt++){
  const preparationStarted=Date.now();let preparationRecorded=false;
  try{
  let s=rosterOperationsPhase_('prepare-state',()=>rosterOperationsState_()),old=s.receipts.find(r=>r.id===p.requestId);
  if(old&&(old.actor!==req.identity.email||old.digest!==digest))error_(409,'This request ID was used for a different save.');
  if(old?.cancelled)rosterAllocationRunCancellation_();
  const base=rosterOperationsPackedSnapshot_(s),ctx=rosterOperationsPhase_('prepare-context',()=>rosterOperationsContext_(req,c,s));
  if(old){const response={...GSISRosterOperations.view(s,ctx,p),...old.result,replayed:true,...(op==='reliefBatch'?{acceptedRevision:old.revision,requestId:p.requestId}:{})};return rosterOperationsAttachDayToken_(response,s,ctx,p);}
  rosterOperationsPreparedCheck_(s,ctx,p);rosterOperationsRefreshClock_(ctx);
   if(req.allocationRun)rosterAllocationRunStage_(req.allocationRun,attempt?'Planning inputs changed; recalculating against current records.':'Calculating available relief while retaining manual choices.');
   const references=rosterOperationsReferenceKey_(ctx),dependencies=rosterOperationsDependencies_(base,p,ctx),before=s.outbox.length,preparedClock=GSISRosterAllocation.prepareClock(ctx,s,p);
   if(op==='reliefBatch')ctx.draftBatch=true;
   if(!rosterOperationsRecordOnly_(p))rosterOperationsPhase_('prepare-reconcile',()=>rosterOperationsReconcile_(s,ctx));
   if(op==='publish'&&p.notifyMode!==undefined)s.outbox.splice(before);
   if(!['publish','notifyDaily'].includes(op))for(const d of Object.keys(ctx.days)){GSISRosterAllocation.initialiseHistory(s,ctx,d);GSISRosterAllocation.captureWeek(s,ctx,d);}
   // Scope validation above replaces only the broad global counter. Domain
   // validation still runs against this complete authoritative working state.
   const merge=rosterOperationsBatchMerge_(s,ctx,p),result=rosterOperationsPhase_('prepare-apply',()=>merge.changes&&!merge.command.commands.length?{savedIds:[]}:GSISRosterOperations.apply(s,ctx,{...merge.command,revision:s.revision}));
   if(merge.changes){const cells=GSISRosterOperations.cellDecisions(s,p.date,merge.changes.map(change=>change.demandId));result.changes=merge.changes.map(change=>({...change,after:cells[change.demandId]}));rosterOperationsBatchAudit_(s,ctx,p,result.changes);}
   if(!['reliefBatch','notifyDaily','publish'].includes(op))GSISRosterOperations.refreshStaplerNotifications(s,ctx,before);
   if(req.allocationRun){rosterAllocationRunPreparation_(req.allocationRun,Date.now()-preparationStarted);preparationRecorded=true;}
   const next=rosterOperationsPackedSnapshot_(s),queued=s.outbox.length-before;
   const lock=LockService.getScriptLock();if(!rosterOperationsPhase_('lock-wait',()=>deployLock_(lock,8000)))error_(503,'Another save is finishing. Retry the same save.');
   let committed,replayed=false;
   try{
    const current=rosterOperationsPhase_('commit-state',()=>rosterOperationsState_()),receipt=current.receipts.find(r=>r.id===p.requestId);
    if(receipt){if(typeof rosterNativeReceiptMatches_==='function'?!rosterNativeReceiptMatches_(receipt,p,req.identity.email):receipt.actor!==req.identity.email||receipt.digest!==digest)error_(409,'This request ID was used for a different save.');if(receipt.cancelled)rosterAllocationRunCancellation_();old=receipt;committed=current;replayed=true;}
    else{
     rosterOperationsPreparedCheck_(current,ctx,p);
     if(['autoAllocate','optimise'].includes(op)&&typeof rosterAbsenceIntakeGate_==='function')rosterAbsenceIntakeGate_([p.date||ctx.today],['autoAllocate','optimise'].includes(op));
     if(rosterOperationsReferenceStamp_(ctx)!==references||rosterOperationsDependencies_(rosterOperationsPackPlans_(current),p,ctx)!==dependencies)rosterOperationsConflict_('PREPARED_RETRY','Shared planning inputs changed during preparation.');
     rosterOperationsCheckClock_(preparedClock);
     const merged=rosterOperationsMergePrepared_(base,next,rosterOperationsPackedSnapshot_(current));merged.revision=current.revision+1;
     // sourceRevision is a document marker, not the publication conflict token.
     const publicationDate=p.date||ctx.today;if(op==='publish'&&merged.dailyPublicationStates?.[publicationDate])merged.dailyPublicationStates[publicationDate].sourceRevision=merged.revision;
     merged.receipts.push({id:p.requestId,actor:req.identity.email,digest,result,at:ctx.iso,revision:merged.revision});
     committed=GSISRosterOperations.validateState(rosterOperationsUnpackPlans_(merged));if(typeof rosterAllocationAuditAccepted_==='function')rosterAllocationAuditAccepted_(committed,current,ctx,p);rosterOperationsPhase_('commit',()=>rosterOperationsCommit_(committed,['autoAllocate','optimise'].includes(op)?[p.date||ctx.today]:null,['autoAllocate','optimise'].includes(op),()=>{const checkClock=()=>rosterOperationsCheckClock_(preparedClock);checkClock();if(req.allocationRun)rosterAllocationRunBeforeCommit_(req.allocationRun,checkClock);}));if(req.allocationRun)rosterAllocationRunComplete_(req.allocationRun,committed);
    }
   }finally{deployUnlock_(lock);}
   const response={...rosterOperationsPhase_('projection',()=>GSISRosterOperations.view(committed,GSISRosterOperations.composeStaplerContext(committed,ctx),p)),...(replayed?old.result:result),...(replayed?{replayed:true}:{notificationsQueued:result.notificationsQueued??queued}),...(op==='reliefBatch'?{acceptedRevision:committed.receipts.find(r=>r.id===p.requestId).revision,requestId:p.requestId}:{})};
   return rosterOperationsAttachDayToken_(response,committed,ctx,p);
  }catch(e){if(!['PREPARED_RETRY','PLANNING_CLOCK_CHANGED'].includes(e.code))throw e;if(attempt===1){if(e.code==='PLANNING_CLOCK_CHANGED')throw e;error_(503,'Planning inputs changed while saving. Your request is retained; retry the same save.');}}finally{if(req.allocationRun&&!preparationRecorded)rosterAllocationRunPreparation_(req.allocationRun,Date.now()-preparationStarted);}
 }
}

function rosterOperationsPlanningAttach_(response,user,p,state,ctx){
 const permissions=Object.fromEntries(['canEdit','canConfirm','canReset'].filter(key=>Object.hasOwn(response,key)).map(key=>[key,response[key]]));
 // Preserve legacy lifecycle metadata without making local editing lease-dependent.
 if(typeof rosterStaplerLeaseAttach_==='function')rosterStaplerLeaseAttach_(response,user,p,state,ctx);
 Object.assign(response,permissions);if(Object.hasOwn(response,'plan'))response.planningAllowed=response.canEdit;return response;
}
// These projections do not expose notification transport or delivery outcomes.
// Keep the default overlay for duties/history/Daily Notify and generic views.
function rosterOperationsPrimaryRead_(p){
 const op=p.operation||'read';
 return ['stapler','staplerDates','currentDuty','dutyRoster','accounting','availability','candidates'].includes(op)||op==='read'&&(['reportForm','mine','currentDuty','dutyRoster','staplerDates','stapler','schoolAbsences'].includes(p.view)||p.compact===true&&['report','entry'].includes(p.view));
}
// Opening balances use Contacts and the operational document only. A fresh D1
// epoch has no baseline yet; these commands must not prepare day models.
function rosterOpeningBalancesDispatch_(req,c){
 const p=req.input||{},user=rosterOperationsAuthority_(c,req.identity),saving=p.operation==='saveOpeningBalances';
 if(saving?!user.admin:!user.admin&&!user.smc)error_(403,saving?'Contacts Admin access is required.':'SMC or Admin access is required.');
 const ctx={user,people:rosterOperationsPeople_(c),days:{},uuid:()=>Utilities.getUuid()};rosterOperationsClock_(ctx);
 if(!saving)return GSISRosterOperations.read(rosterOperationsState_(true),ctx,p);
 if(typeof p.requestId!=='string'||! /^[\w-]{36}$/.test(p.requestId))error_(400,'A save request ID is required.');
 const digest=rosterOperationsCommandDigest_(p),lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Another save is running. Retry the same save.');
 try{
  const state=rosterOperationsState_(),prior=state.receipts.find(row=>row.id===p.requestId);
  if(prior){if(prior.actor!==req.identity.email||prior.digest!==digest)error_(409,'This request ID was used for a different save.');return {...prior.result,replayed:true};}
  if(!Number.isSafeInteger(p.revision)||p.revision!==state.revision)error_(409,'Relief records changed. Refresh before saving.');
  const result=GSISRosterOperations.apply(state,ctx,p);state.revision++;Object.assign(result,{revision:state.revision,acceptedRevision:state.revision,requestId:p.requestId,notificationsQueued:0});
  state.receipts.push({id:p.requestId,actor:req.identity.email,digest,result,at:ctx.iso,revision:state.revision});rosterOperationsCommit_(state);return result;
 }finally{deployUnlock_(lock);}
}

// Success describes only changed domains. Clients keep immutable timetable
// content for unrelated delivery, acknowledgement and absence commands.
function rosterOperationsDispatch_(req,c){
 let result=rosterOperationsDispatchCore_(req,c);const p=req.input||{},op=p.operation||'read';
 if(result?.plan){
  // This server tag controls transport only. Saves still validate current
  // authority, absences, quotas and immutable sources under the commit lock.
  const {status,revision,...content}=result.plan,tag='stapler-content-v1:'+rosterOperationsPlanDigest_(JSON.stringify([1,req.identity.email,result.viewMode,content]));
  result={...result,planContentTag:tag,planStatus:status,planRevision:revision};
  if(op==='confirmStapler'&&p.knownPlanContentTag===tag)result={...result,plan:null,planUnchanged:true};
 }
 if(result&&Object.prototype.hasOwnProperty.call(result,'comparisonTiles')){
  const comparison=Object.fromEntries(['comparisonAvailable','comparisonBaselineId','comparisonIssues','comparisonGhosts','comparisonTiles','comparisonDifferences'].map(key=>[key,result[key]])),tag='stapler-comparison-v1:'+rosterOperationsPlanDigest_(JSON.stringify([1,req.identity.email,result.viewMode,comparison]));
  result={...result,comparisonContentTag:tag,...(op==='confirmStapler'&&p.knownComparisonContentTag===tag?{comparisonUnchanged:true,comparisonTiles:null,comparisonGhosts:null,comparisonIssues:null,comparisonDifferences:null}:{})};
 }
 if(!result||typeof result!=='object'||!p.requestId||GSISRosterOperations.READS.includes(op)||['receiptStatus','acknowledgementStatus','statistics','statisticsCalendar','calculations','timetableBatch','timetableDay','directory','allocationVersion','deliveryReview','peerMailReview'].includes(op))return result;
 const suspended=['migrateStaplerPlans','createStapler','importStapler','saveStapler','confirmStapler','publishStapler','resetStapler','renameStapler','moveStapler','deleteStapler','restoreStapler'].includes(op),publication=['publish','publishStapler'].includes(op),notification=['notifyDaily','dismissDeliveryIssues','cancelPendingNotifications','reviewPeerMail'].includes(op);
 const affectedDomains=op==='acknowledge'?['acknowledgement']:notification?['notification']:['operations'];
 if(suspended)affectedDomains.push('suspended');if(publication)affectedDomains.push('publication');
 const affectedDates=[...new Set([p.date,p.newDate,p.actualDate,...(Array.isArray(p.dates)?p.dates:[]),...(result.affectedDates||[]),...(op==='migrateStaplerPlans'?result.savedIds||[]:[]),result.date].filter(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)))];
 return {...result,affectedDomains,affectedDates};
}
function rosterOperationsDispatchCore_(req,c){gsisRequireBackendRole_('roster');
 if(['venuesSyncStatus','recoverVenuesSync'].includes(req.input?.operation))return rosterVenuesAdminDispatch_(req,c);
 const edge=typeof rosterEdgeMigrationDispatch_==='function'?rosterEdgeMigrationDispatch_(req,c):null;if(edge?.handled)return edge.result;
 if(typeof rosterEdgeAssertLegacyWrite_==='function')rosterEdgeAssertLegacyWrite_();
 const p=req.input||{},op=p.operation||'read',staplerWrite=['createStapler','importStapler','saveStapler','confirmStapler','publishStapler','resetStapler','renameStapler','moveStapler','deleteStapler','restoreStapler'].includes(op);
 if(op==='repairStaplerAuditIds')return rosterOperationsAuditRepair_(req,c);
 if(['archiveColdOutput','archivedItem','archiveItems'].includes(op))return rosterColdArchiveDispatch_(req,c);
 if(['timetablePreparationManifest','timetablePreparationPart','timetablePreparationCheck'].includes(op))return rosterTimetablePreparationDispatch_(req,c);
 if(p.intake===true&&['saveAbsence','requestMutual'].includes(op))return rosterAbsenceIntakeCapture_(req,c);
 if(['openingBalances','saveOpeningBalances'].includes(op))return rosterOpeningBalancesDispatch_(req,c);
 if(op==='receiptStatus'&&p.command?.intake===true)return rosterAbsenceIntakeReceipt_(req,c);
 if(op==='read'&&p.view==='intake'){
  const user=rosterOperationsAuthority_(c,req.identity),result={...rosterAbsenceIntakeVisible_(req,c),user};
  if(p.includeAllocationPreparation===true&&(user.smc||user.admin))try{result.allocationPreparation=rosterAllocationPreparationStatus_();}catch(_){result.allocationPreparation={available:false};}
  return result;
 }
 if(op==='read'&&p.view==='intakeReview')return rosterAbsenceIntakeReview_(req,c);
 if(op==='retryAbsenceIntake')return rosterAbsenceIntakeRetry_(req,c);
 if(op==='resolveAbsenceIntake')return rosterAbsenceIntakeResolve_(req,c);
 if(['autoAllocate','optimise'].includes(op)&&typeof rosterAbsenceIntakeGate_==='function')rosterAbsenceIntakeGate_([p.date||rosterToday_()],['autoAllocate','optimise'].includes(op));
 if(c?.rosterProjection==='staplerDates'&&op!=='staplerDates')error_(503,'Contacts dates authority is unavailable for this operation.');
 if(['deliveryReview','dismissDeliveryIssues','cancelPendingNotifications'].includes(op))return rosterDeliveryReviewDispatch_(req,c);
 if(['peerMailReview','reviewPeerMail'].includes(op))return rosterPeerMailReviewDispatch_(req,c);
 if(op==='cancelAllocationRun')return rosterAllocationRunCancel_(req,c);
 if(op==='allocationVersion'){
  const user=rosterOperationsAuthority_(c,req.identity);if(!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');const date=GSISRosterOperations.date(p.date||rosterToday_());if(p.statusOnly===true)return {date,allocatorRun:typeof rosterAllocationRunRead_==='function'?rosterAllocationRunPublic_(rosterAllocationRunRead_(date)):null};
  const index=rosterIndex_(),people=rosterOperationsPeople_(c),ctx={user,people,days:{[date]:{id:GSISRoster.active(index.entries,date)?.id||null}},timetableEntries:index.entries};rosterOperationsClock_(ctx);const run=typeof rosterAllocationRunRead_==='function'?rosterAllocationRunRead_(date):null,s=rosterOperationsVersionSnapshot_(date,ctx,index,people,run),receiptState=run&&s.runReceipt?(run.trigger==='scheduled'?{scheduleReceipts:{[run.scheduleKey]:s.runReceipt}}:{receipts:[{id:run.requestId,actor:run.actor,digest:run.digest,...s.runReceipt}]}):null;
  const calendar=p.calendarByDate?.[date],allocationReferenceKey=calendar?.date===date&&typeof calendar.schoolDay==='boolean'?rosterOperationsAllocationReference_(s,people,index,p,rosterOperationsQuotaSource_(),ctx.today,[date]):null;
  return {date,user,revision:s.revision,dayRevision:s.dayRevision,dayToken:s.dayToken,allocationChangeKey:s.allocationChangeKey,checkedAt:s.at,allocationReferenceKey,allocationClock:ctx.today+':'+ctx.minute,allocatorRun:run?rosterAllocationRunPublic_(run,receiptState):null};
 }
 if(op==='audit'&&p.date){const user=rosterOperationsAuthority_(c,req.identity);if(!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');const date=GSISRosterOperations.date(p.date),state=rosterOperationsState_(true),meta=state.allocationAuditExports?.[date];let rows=state.audit.filter(event=>event.date===date);if(meta?.archiveFileId){let evidence;try{evidence=JSON.parse(rosterReadFile_(meta.archiveFileId));if(evidence.schema!==1||evidence.date!==date||!Array.isArray(evidence.audit))throw Error('identity');}catch(error){error_(503,'The archived audit is unavailable. Retry to view the complete history.');}const byId=new Map(evidence.audit.map(event=>[event.id,event]));for(const event of rows)if(!event.archiveRef||!byId.has(event.id))byId.set(event.id,event);rows=[...byId.values()];}return {revision:state.revision,date,audit:rows.sort((a,b)=>String(a.at||'').localeCompare(String(b.at||''))).slice(-500),archived:!!meta?.archiveFileId};}
 if(op==='receiptStatus')return rosterOperationsReceipt_(req,c);
 if(op==='acknowledgementStatus')return rosterAcknowledgementStatus_(req,c);
 if(op==='acknowledge')return rosterAcknowledgementDispatch_(req,c);
 if(op==='statisticsCalendar'){const user=rosterOperationsAuthority_(c,req.identity);if(!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');return {allowed:true};}
 if(op==='statistics')return rosterStatisticsRead_(req,c,p);
 if(op==='saveAbsence'||op==='saveInstructions')return rosterAbsenceDispatch_(req,c);
 if(op==='read'&&p.view==='allocationLearning')return rosterOperationsAllocationLearning_(req,c);
 if(op==='publish'&&(p.publicationAcknowledgement===true||p.compact===true))return rosterOperationsPublishDispatch_(req,c);
 if(['publish','notifyDaily','reliefBatch','autoAllocate','optimise'].includes(op))return rosterOperationsPreparedDispatch_(req,c);
 if(op==='calculations')return rosterPersonalCalculations_(req,c);
 if(op==='timetableBatch')return rosterTimetableBatch_(req,c);
 if(op==='timetableDay')return rosterTimetableDay_(req,c);
 if(['acquireStaplerLock','renewStaplerLock','releaseStaplerLock'].includes(op))return rosterStaplerLeaseDispatch_(req,c);
 if(p.view==='notificationReadiness'||op==='saveRecessSettings'){const user=rosterOperationsAuthority_(c,req.identity);if(!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');}
 if(op==='directory'){
  rosterOperationsAuthority_(c,req.identity);const date=GSISRosterOperations.date(p.date||rosterToday_()),activated=new Set(rosterOperationsState_(true).adhoc.filter(a=>!a.deletedAt&&a.date===date).map(a=>a.staffId));
  return {date,people:c.rosterPeople.filter(p=>p.active===true||activated.has(p.id)).map(p=>({id:String(p.id),name:String(p.name||'')}))};
 }
 if(op==='contactCreate'){
  const user=rosterOperationsAuthority_(c,req.identity);if(!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');
  const created=contacts_(req.identity,false,'rosterContactCreate',{name:p.name,mobile:p.mobile,employment:p.employment,modifier:p.modifier,requestId:p.requestId,confirmDistinct:p.confirmDistinct});
  if(created.saved){const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Contact saved. Retry this same request to finish its review notification.');
   try{const state=rosterOperationsState_(),fresh=rosterServiceContacts_().c,now=Date.now(),date=new Date(now+8*3600000).toISOString().slice(0,10),before=state.outbox.length;
    const configured=(props_().getProperty('ROSTER_NOTIFICATION_ADMIN_IDS')||'').split(',').map(x=>x.trim()),admins=(fresh.rosterAdminIds||[]).filter(id=>configured.includes(id));
    const ctx={now,iso:new Date(now).toISOString(),today:date,people:fresh.rosterPeople,uuid:()=>Utilities.getUuid()};
    for(const id of admins)GSISRosterOperations.queue(state,ctx,'contact_review',id,date,{templateKey:'contact_review',summary:'New inactive external relief contact: '+created.person.name+'. Review permanent details in Contacts.'},null,'contact-created:'+p.requestId+':'+id);
    if(state.outbox.length!==before)rosterOperationsCommit_(state);created.notificationsQueued=state.outbox.length-before;created.revision=state.revision;
   }finally{deployUnlock_(lock);}}
  return created;
 }const readonly=GSISRosterOperations.READS.includes(op);
 if(op==='externalLink'){const s=rosterOperationsState_(),ctx=rosterOperationsContext_(req,c,s);GSISRosterOperations.read(s,ctx,p);const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Another save is finishing. Retry this private link request.');try{const latest=rosterOperationsState_(),before=JSON.stringify(latest.privateLinks||{}),result=GSISRosterOperations.read(latest,ctx,p);if(before!==JSON.stringify(latest.privateLinks||{}))rosterOperationsCommit_(latest);return result;}finally{deployUnlock_(lock);}}
 if(readonly){let s=rosterOperationsPhase_('state-read',()=>rosterOperationsState_(rosterOperationsPrimaryRead_(p)));if(typeof rosterColdArchiveDateView_==='function'&&['read','dailyNotify','teacherDailyUpdate','history','exportDaily'].includes(op))s=rosterColdArchiveDateView_(s,p);const ctx=rosterOperationsPhase_('context',()=>rosterOperationsContext_(req,c,s));if(op==='currentDuty'||op==='read'&&p.view==='currentDuty')return GSISRosterOperations.read(s,ctx,{operation:'currentDuty'});if(op==='candidates'&&p.previewAbsence!==undefined)rosterOperationsPhase_('reconcile',()=>GSISRosterOperations.reconcile(s,ctx));else if(!rosterOperationsRecordOnly_(p)&&op!=='stapler')rosterOperationsPhase_('reconcile',()=>rosterOperationsReadReconcile_(s,ctx));return rosterOperationsReportTransport_(rosterOperationsPlanningAttach_(rosterOperationsAttachDayToken_(rosterOperationsPhase_('projection',()=>GSISRosterOperations.read(s,ctx,{...p,operation:op})),s,ctx,p),ctx.user,p,s,ctx),{...p,operation:op},ctx);}
 if(typeof p.requestId!=='string'||! /^[\w-]{36}$/.test(p.requestId))error_(400,'A save request ID is required.');
 // Hash input before taking the lock. Reject stale commands before loading models or quotas.
 const digest=rosterOperationsCommandDigest_(p);
 const lock=LockService.getScriptLock();if(!rosterOperationsPhase_('lock-wait',()=>deployLock_(lock,8000)))error_(503,'Another save is running. Retry the same save.');
 let s,ctx,result,replayed=false,notificationsQueued,cellMutation=false,auditBefore;
 try{
  s=rosterOperationsPhase_('state-read',()=>rosterOperationsState_());auditBefore={audit:s.audit.map(e=>({id:e.id})),optimisationRuns:s.optimisationRuns.map(e=>({id:e.id}))};const old=s.receipts.find(r=>r.id===p.requestId);
  if(old){
   if(old.actor!==req.identity.email||old.digest!==digest)error_(409,'This request ID was used for a different save.');
   cellMutation=old.cellMutation===true&&old.revision===s.revision&&rosterOperationsCellMutation_(p,s);
   const replayInput={...p,operation:staplerWrite?(['renameStapler','moveStapler','deleteStapler','restoreStapler'].includes(op)?'staplerDates':'stapler'):cellMutation||['saveRecessSettings','setDutySMC','saveSystemConfig','saveDailyEmploymentSettings','sendDailyEmploymentReport','requestStapler','decideStapler','saveCustomInstruction','deleteCustomInstruction','setCustomInstructionEnabled'].includes(op)?op:'read',view:p.view||'report'};
   ctx=rosterOperationsPhase_('replay-context',()=>rosterOperationsContext_({...req,input:replayInput},c,s));
   if(cellMutation&&!rosterOperationsCellSource_(s,ctx,p)){cellMutation=false;ctx=rosterOperationsPhase_('replay-context',()=>rosterOperationsContext_({...req,input:{...p,operation:'read'}},c,s));}
   result=old.result;replayed=true;
  }else{
   rosterOperationsNotificationReady_(s,p);
   // Local Stapler edits require no exclusive lease. Domain source revisions and
   // cell comparison validate the saved result under this commit lock.
   // New reports append independent facts, validated against the locked latest document.
   // Instruction patches compare their own cells and live lesson dependencies.
   // Other edits and shared allocation commands still require the exact revision.
   const newAbsence=op==='saveAbsence'&&!p.id,instructionScoped=op==='saveInstructions'&&p.instructionChanges!==undefined,settingsScoped=op==='saveDailyEmploymentSettings'&&p.expectedSettingsToken!==undefined,deletionScoped=op==='deleteAbsences'&&p.expectedAbsenceTokens!==undefined;
   if(deletionScoped)rosterOperationsDeletionCheck_(s,p);
   if(settingsScoped){if(typeof p.expectedSettingsToken!=='string'||! /^[a-f0-9]{64}$/.test(p.expectedSettingsToken))error_(400,'Reload report settings before saving.');if(p.expectedSettingsToken!==rosterOperationsSettingsToken_(s))rosterOperationsConflict_('SETTINGS_CONFLICT','Report recipient settings changed. Review the saved settings before saving your changes.');}
   if(!Number.isSafeInteger(p.revision)||p.revision<0||p.revision>s.revision||p.revision!==s.revision&&!newAbsence&&!staplerWrite&&!settingsScoped&&!instructionScoped&&!deletionScoped)error_(409,'Relief records changed. Refresh before saving.');
   ctx=rosterOperationsPhase_('context',()=>rosterOperationsContext_(req,c,s));if(staplerWrite&&p.leaseSessionId)rosterStaplerLeaseAssert_(GSISRosterOperations.date(p.date),ctx.user,p);if(op==='reliefBatch')ctx.draftBatch=true;cellMutation=ctx.cellMutation===true;const before=s.outbox.length,refreshRequired=cellMutation&&s.assignments.some(a=>p.demandIds.includes(a.demandId)&&a.status==='draft'&&!a.noRelief);
   if(cellMutation&&!rosterOperationsCellSource_(s,ctx,p))error_(409,'The timetable or confirmed Stapler plan changed. Refresh before saving.');
   if(!cellMutation&&!rosterOperationsRecordOnly_(p))rosterOperationsPhase_('reconcile',()=>rosterOperationsReconcile_(s,ctx));if(['saveStapler','confirmStapler','publishStapler'].includes(op)||op==='publish'&&p.notifyMode!==undefined)s.outbox.splice(before);if(!cellMutation)for(const d of Object.keys(ctx.days)){GSISRosterAllocation.initialiseHistory(s,ctx,d);GSISRosterAllocation.captureWeek(s,ctx,d);}
   // Slow reference reads can cross midnight or a period start. Validate against the clock inside this write lock.
   if(['reliefBatch','publish','publishStapler','setNoRelief','noRelief','unassign','deleteAbsences'].includes(op)){const stamp=Date.now(),sg=new Date(stamp+8*3600000);Object.assign(ctx,{now:stamp,iso:new Date(stamp).toISOString(),today:sg.toISOString().slice(0,10),minute:sg.getUTCHours()*60+sg.getUTCMinutes()});}
   const leaseTransitions=p.leaseSessionId&&['moveStapler','deleteStapler'].includes(op)?rosterStaplerLeaseTransitions_(p,ctx.user):null;
   result=rosterOperationsPhase_('apply',()=>GSISRosterOperations.apply(s,ctx,{...p,operation:op}));if(refreshRequired)result={...result,refreshRequired:true};if(leaseTransitions)result={...result,leaseTransitions};if(!cellMutation&&op!=='reliefBatch'&&!['saveStapler','confirmStapler','publishStapler'].includes(op)&&!(op==='publish'&&p.notifyMode!==undefined))GSISRosterOperations.refreshStaplerNotifications(s,ctx,before);s.revision++;
   if(op==='saveAbsence'&&p.includeMutualCandidates===true&&!s.absences.some(a=>result.savedIds.includes(a.id)&&a.date===(p.date||ctx.today)))error_(400,'Choose a saved absence date for colleague arrangements.');
   s.receipts.push({id:p.requestId,actor:req.identity.email,digest,result,at:ctx.iso,revision:s.revision,...(cellMutation?{cellMutation:true}:{})});
   // Surgical logical changes, one durable document replacement: no false claim of partial Drive I/O.
   if(typeof rosterAllocationAuditAccepted_==='function')rosterAllocationAuditAccepted_(s,auditBefore,ctx,p);
   rosterOperationsPhase_('commit',()=>rosterOperationsCommit_(s));notificationsQueued=s.outbox.length-before;
  }
  if(p.leaseSessionId&&['confirmStapler','publishStapler'].includes(op))rosterStaplerLeaseReleaseCommitted_(GSISRosterOperations.date(p.date),rosterOperationsAuthority_(c,req.identity),p);
  if(result.leaseTransitions)rosterStaplerLeaseFinishTransitions_(result.leaseTransitions,rosterOperationsAuthority_(c,req.identity));
 }finally{deployUnlock_(lock);}
 // The reporting screen needs the selected teacher and saved records, not every teacher's cells.
 const projectionInput=op==='saveAbsence'&&p.view==='report'?{...p,compact:true}:p;
 const {leaseTransitions,...publicResult}=result;
 const projection=rosterOperationsPhase_('projection',()=>cellMutation?GSISRosterOperations.allocationCellView(s,ctx,p):GSISRosterOperations.view(s,GSISRosterOperations.composeStaplerContext(s,ctx),projectionInput));
 // Receipt metadata describes the accepted command, not the current plan. A
 // later save or restore must not inherit an older revision/confirmed flag.
 const response={...(op==='reliefBatch'?{acceptedRevision:s.receipts.find(receipt=>receipt.id===p.requestId)?.revision,requestId:p.requestId}:{}),...projection,...publicResult,...(replayed&&staplerWrite?{...projection,acceptedResult:publicResult,acceptedRevision:s.receipts.find(receipt=>receipt.id===p.requestId)?.revision}:{}),...(replayed?{replayed:true}:{notificationsQueued:result.notificationsQueued??notificationsQueued})};
 return rosterOperationsPlanningAttach_(rosterOperationsAttachDayToken_(rosterOperationsSavedCandidates_(response,s,ctx,p,result),s,ctx,p),ctx.user,p,s,ctx);
}

function rosterOperationsReconcile_(s,ctx,readTriggered=false){
 return GSISRosterOperations.reconcileOperational(s,ctx,readTriggered);
}
function rosterOperationsReadReconcile_(s,ctx){
 if(!rosterOperationsReconcile_(s,ctx,true))return;
 const lock=LockService.getScriptLock();if(!deployLock_(lock,5000))error_(503,'Relief assignments are being reconciled. Retry.');
 try{const current=rosterOperationsState_();if(current.revision!==s.revision)error_(409,'Relief records changed. Refresh.');
  if(rosterOperationsReconcile_(current,ctx,true)){current.revision++;current.audit.push({id:ctx.uuid(),date:ctx.today,at:ctx.iso,actor:'system',operation:'reconcile',ids:current.assignments.filter(a=>a.updatedAt===ctx.iso&&a.status==='invalidated').map(a=>a.id)});rosterOperationsCommit_(current);}
  Object.assign(s,current);
 }finally{deployUnlock_(lock);}
}
function rosterServiceContacts_(){
 const endpoint=props_().getProperty('CONTACTS_API_URL'),secret=gsisApiSecret_('ROSTER_SERVICE_SECRET');if(!endpoint||!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(endpoint)||!secret||secret.length<32)error_(503,'Configure the Contacts endpoint and shared Roster service secret.');
 const payload=JSON.stringify({action:'rosterServiceDirectory',service:'gsis-roster-notifier-v1',input:{},timestamp:Date.now(),nonce:Utilities.getUuid()}),response=UrlFetchApp.fetch(endpoint,{method:'post',contentType:'application/json',payload:JSON.stringify({payload,signature:signature_(payload,secret)}),muteHttpExceptions:true});
 let body;try{body=JSON.parse(response.getContentText());}catch(e){error_(503,'Contacts service directory is unavailable.');}if(!body.ok||!Array.isArray(body.data?.rosterPeople))error_(503,'Contacts service directory is unavailable.');return {identity:{email:'roster-service',subject:'service'},c:body.data};
}
function rosterPrivateCapability_(cap,now){
 if(!cap||!['duties','mutual'].includes(cap.purpose)||typeof cap.staffId!=='string'||!cap.staffId||!Number.isFinite(cap.expiresAt)||cap.expiresAt<=now||cap.expiresAt>now+7*86400000+60000)error_(401,'This private link has expired. Ask SMC for a new link.');
 if(cap.issuedAt!==undefined&&(!Number.isFinite(cap.issuedAt)||cap.issuedAt>now+60000||cap.expiresAt>cap.issuedAt+7*86400000+60000))error_(401,'This private link is invalid. Ask SMC for a new link.');
 GSISRosterOperations.date(cap.date);return cap;
}
function rosterPrivateRecipient_(s,cap,contacts){
 if(!Array.isArray(contacts?.rosterPeople))error_(503,'Current Contacts permissions are unavailable.');
 const matches=contacts.rosterPeople.filter(person=>person.id===cap.staffId);
 if(matches.length!==1||matches[0].active!==true&&!s.adhoc.some(row=>row.staffId===cap.staffId&&row.date===cap.date&&!row.deletedAt))error_(403,'This recipient is no longer eligible for this private link.');
}
function rosterPrivateRead_(p){
 const now=Date.now(),cap=rosterPrivateCapability_(p.capability,now),service=rosterServiceContacts_(),s=rosterOperationsState_();rosterPrivateRecipient_(s,cap,service.c);if(cap.purpose==='duties'){const resolved=GSISRosterOperations.resolveDutiesCapability(s,cap,Date.now());if(resolved.projection)return resolved.projection;}const published=s.dailyPublicationStates?.[cap.date],person=published?.teachers.find(t=>t.staffId===cap.staffId);let ctx;
 if(published&&person){const day={id:published.baselineId,schoolDay:true,verified:true,periods:published.periods,teachers:[{staffId:cap.staffId,name:person.name||'',cells:person.baseline}]};ctx={now,iso:new Date(now).toISOString(),today:new Date(now+8*3600000).toISOString().slice(0,10),days:{[cap.date]:day},baselineDays:{[cap.date]:day},people:[{id:cap.staffId,name:person.name||''}]};}
 else{const plan=s.staplerPlans.find(r=>r.date===cap.date)?.published,calendar=plan?{[cap.date]:{date:cap.date,schoolDay:true,parity:plan.parity}}:p.calendarByDate;ctx=rosterOperationsContext_({identity:service.identity,input:{...p,date:cap.date,calendarByDate:calendar}},service.c,s);}
 const mutual=cap.purpose==='mutual'?s.requests.find(r=>r.id===cap.requestId&&r.recipientId===cap.staffId&&r.date===cap.date):null;if(cap.purpose==='mutual'&&!mutual)error_(403,'This private request is unavailable.');
 ctx.user={staffId:cap.staffId,email:'external:'+cap.staffId,smc:false,admin:false};
 const notice=GSISRosterOperations.timetableNotice(s,ctx,{date:cap.date}),ids=new Set(notice?.snapshotIds||[]),snapshots=s.publicationSnapshots.filter(v=>ids.has(v.id)),rows=published?snapshots.filter(v=>v.kind!=='cancelled').map(v=>({...v.assignment,instructions:v.instructions,customInstructions:v.customInstructions})):s.assignments.filter(a=>a.staffId===cap.staffId&&a.date===cap.date&&a.status==='published'&&!a.noRelief&&!a.remove);
 return {timetableNotice:notice,linkExpiresAt:cap.expiresAt,pendingNotices:GSISRosterOperations.acknowledgementView(s,ctx).filter(v=>v.date===cap.date&&(!published||ids.has(v.id))),history:GSISRosterOperations.notificationHistory(s,ctx,{limit:100}).history.filter(v=>v.date===cap.date),date:cap.date,timetable:rosterPrivateTimetable_(ctx,s,cap.staffId,cap.date),overlay:GSISRosterOperations.dailyTimetable(s,ctx,{date:cap.date}),duties:rows.map(GSISRosterOperations.publicDuty),changes:published?snapshots.filter(v=>v.kind==='cancelled').map(v=>GSISRosterOperations.publicDuty(v.assignment)):s.assignments.filter(a=>a.staffId===cap.staffId&&a.date===cap.date&&a.publishedAt&&['cancelled','invalidated'].includes(a.status)).map(GSISRosterOperations.publicDuty),arrangements:published?[...GSISRosterOperations.latestPublications(s).values()].filter(v=>v.date===cap.date&&v.kind!=='cancelled'&&v.assignment.absentId===cap.staffId&&!v.assignment.remove).map(v=>GSISRosterOperations.publicDuty({...v.assignment,instructions:v.instructions,customInstructions:v.customInstructions})):s.assignments.filter(a=>a.absentId===cap.staffId&&a.date===cap.date&&a.status==='published'&&!a.remove).map(GSISRosterOperations.publicDuty),request:mutual||null};
}
function rosterServiceDispatch_(req){gsisRequireBackendRole_('roster');
 const output=typeof rosterDriveOutputsDispatch_==='function'?rosterDriveOutputsDispatch_(req,true):null;if(output?.handled)return output.result;
 const mirror=typeof rosterMirrorDispatch_==='function'?rosterMirrorDispatch_(req,true):null;if(mirror?.handled)return mirror.result;
 const edgeMail=typeof rosterEdgeMailDispatch_==='function'?rosterEdgeMailDispatch_(req):null;if(edgeMail?.handled)return edgeMail.result;
 const edge=typeof rosterEdgeServiceMigrationDispatch_==='function'?rosterEdgeServiceMigrationDispatch_(req):null;if(edge?.handled)return edge.result;
 if(typeof rosterEdgeAssertLegacyWrite_==='function')rosterEdgeAssertLegacyWrite_();
 if(req.input?.operation==='nextAbsenceIntake')return {job:rosterAbsenceIntakeClaim_(1,req.input.dates||null)[0]||null};
 if(req.input?.operation==='processAbsenceIntake')return rosterAbsenceIntakeProcess_(req);
 if(req.input?.operation==='deferAbsenceIntake')return rosterAbsenceIntakeDefer_(req);
 const transport=typeof rosterNotificationTransportDispatch_==='function'?rosterNotificationTransportDispatch_(req):null;if(transport?.handled)return transport.result;
 if(['inboxIngest','inboxReplyPrepare','inboxReplyResult','inboxDelivery','inboxAlertPrepare','inboxAlertResult','inboxPendingDispatch'].includes(req.input?.operation))return rosterInboxServiceDispatch_(req);
 const p=req.input||{},op=p.operation,allowed=['venuesSyncCheck','connectionStatus','allocationAuditExport','scheduledRoster','dailyEmploymentMailDispatch','deliveryReviewMailDispatch','claimNotifications','inboundMessage','inboundReplyResult','prepareNotification','notificationResult','notificationDelivery','externalDuties','externalRespond','externalAcknowledge'];if(!allowed.includes(op))error_(403,'Unknown notification service operation.');
 if(op==='venuesSyncCheck')return rosterVenuesSyncCheck_();
 if(op==='allocationAuditExport')return rosterAllocationAuditExport_(p);
 if(op==='externalDuties')return rosterPrivateRead_(p);
 if(op==='connectionStatus'){rosterServiceContacts_();return {readOnly:true,backendVersion:GSIS_DEPLOY_VERSION,contactsReady:true};}
 if(op==='scheduledRoster')return rosterScheduledDispatch_(req);if(op==='dailyEmploymentMailDispatch')return rosterDailyEmploymentMailDispatch_(p);
 if(op==='deliveryReviewMailDispatch')return rosterDeliveryReviewMailDispatch_(p);
 // Contacts owns its own state. Fetch current authority before waiting for our
 // writer lock, as school-user requests already do. Claims and eligibility still
 // use the locked latest operational document and a new clock sample below.
 if(['externalAcknowledge','externalRespond'].includes(op))rosterPrivateCapability_(p.capability,Date.now());
 const currentService=['inboundMessage','claimNotifications','prepareNotification','externalAcknowledge','externalRespond'].includes(op)?rosterServiceContacts_():null,currentContacts=currentService?.c||null;
 if(currentContacts&&['claimNotifications','prepareNotification'].includes(op)){
  try{currentContacts.rosterPendingAbsenceDates=[...new Set([...(typeof rosterAbsenceIntakePending_==='function'?rosterAbsenceIntakePending_().blockedDates:[]),...(Array.isArray(p.pendingTransportDates)?p.pendingTransportDates:[])])];}catch(_){currentContacts.rosterAbsenceIntakeUnavailable=true;}
 }
 const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Another relief update is running. Retry.');
 try{const s=rosterOperationsState_(),now=Date.now(),iso=new Date(now).toISOString();let result={},changed=false,domainChanged=false;
  if(op==='inboundMessage'){
   const fresh=currentContacts,ctx={now,iso,today:new Date(now+8*3600000).toISOString().slice(0,10),service:true,inboxMode:p.inboxMode===true,people:fresh.rosterPeople,urgentSMCIds:p.inboxMode===true?rosterInboxDuty_(fresh,now,s):fresh.rosterUrgentSMCIds||[],user:{email:'whatsapp-webhook'},uuid:()=>Utilities.getUuid()};
   result=GSISRosterOperations.inboundMessage(s,ctx,p);changed=!result.duplicate;
  }else if(op==='inboundReplyResult'){
   const e=s.inboundEvents.find(x=>x.id===p.receiptId&&x.replyClaimId===p.replyClaimId);if(!e)error_(409,'Incoming reply claim changed.');
   if(!['sent','failed','uncertain'].includes(p.state))error_(400,'Invalid reply status.');
   if(e.replyStatus==='sending'){e.replyStatus=p.state;e.replyMessageId=String(p.messageId||'').slice(0,300);e.replyRecordedAt=iso;changed=true;}result={recorded:true};
  }else if(op==='claimNotifications'){
   const fresh=currentContacts,rows=[],index=GSISRosterOperations.notificationIndex(s),allowed=new Set(Array.isArray(p.allowedTemplateKeys)?p.allowedTemplateKeys:[]);
   changed=rosterNotificationRetries_(s,now)||changed;
   for(const j of s.outbox){
    if(j.status==='sending'&&j.claimExpiresAt<now){const attempt=(j.attemptHistory||[]).find(a=>a.claimId===j.claimId);if(!j.preparedAt){j.status='queued';j.attempts=Math.max(0,(j.attempts||0)-1);j.error='Unsent claim expired; returned safely to queue.';if(attempt)attempt.state='not-sent';}else{j.status='uncertain';j.error='Prepared send lease expired; reconcile with WhatsApp before retrying.';if(attempt)attempt.state='uncertain';}changed=true;}
    if(!['queued','blocked'].includes(j.status)||j.nextAttemptAt&&j.nextAttemptAt>now)continue;
    const before=JSON.stringify([j.data,j.mobile,j.name,j.status,j.error]);
    const checkedAt=Date.now(),outcome=rosterNotificationEligible_(s,j,checkedAt,fresh,index,allowed);
    changed=rosterNotificationHold_(j,outcome,checkedAt)||changed;
    if(outcome){
     if(['quiet','pending-summary','pending-absence'].includes(outcome))continue;
     if(outcome==='blocked'){j.status='blocked';j.error='Template is disabled, pending approval, or its live contract does not match.';}
     else{j.status='cancelled';j.error=outcome;}
     changed=changed||before!==JSON.stringify([j.data,j.mobile,j.name,j.status,j.error]);continue;
    }
    if(rows.length>=Math.min(10,Math.max(1,Number(p.limit)||5)))continue;
    j.status='sending';j.preparedAt=null;j.error='';j.claimId=Utilities.getUuid();j.claimExpiresAt=now+120000;j.firstAttemptAt=j.firstAttemptAt||now;j.attempts=(j.attempts||0)+1;j.attemptHistory=j.attemptHistory||[];j.attemptHistory.push({number:j.attempts,claimId:j.claimId,at:iso,state:'sending'});rows.push({...j});changed=true;
   }changed=rosterNotificationRetries_(s,now)||changed;result={notifications:rows};
  }else if(op==='prepareNotification'){
   const j=s.outbox.find(j=>j.id===p.id);if(!j||j.claimId!==p.claimId||j.status!=='sending'||j.claimExpiresAt<=now)error_(409,'Notification claim is stale.');
   const fresh=currentContacts,checkedAt=Date.now(),outcome=rosterNotificationEligible_(s,j,checkedAt,fresh,GSISRosterOperations.notificationIndex(s),new Set(Array.isArray(p.allowedTemplateKeys)?p.allowedTemplateKeys:[]));
   rosterNotificationHold_(j,outcome,checkedAt);
   if(outcome){j.status=outcome==='blocked'?'blocked':['quiet','pending-summary','pending-absence'].includes(outcome)?'queued':'cancelled';j.error=outcome==='quiet'?'Held during notification quiet hours.':outcome==='pending-summary'?'Waiting for the earlier summary delivery outcome.':outcome==='pending-absence'?'Waiting for received absence reports to be applied.':outcome;const attempt=j.attemptHistory.find(a=>a.claimId===j.claimId);if(attempt){attempt.state='not-sent';attempt.reason=j.error;}j.attempts=Math.max(0,j.attempts-1);result={notification:null};}
   else{j.preparedAt=now;result={notification:{...j}};}changed=true;
  }else if(op==='notificationResult'){
   const j=s.outbox.find(j=>j.id===p.id);if(!j||j.claimId!==p.claimId)error_(409,'Notification claim is stale.');if(!['sent','failed','uncertain'].includes(p.state))error_(400,'Invalid notification result.');
   if(['sent','delivered','read'].includes(j.deliveryStatus)){j.status='sent';if(p.messageId&&!j.messageId)j.messageId=String(p.messageId).slice(0,300);j.error='';delete j.providerError;changed=true;}
   else if(j.status==='sending'||j.status==='uncertain'){
    j.status=p.state;j.messageId=String(p.messageId||'').slice(0,300);j.error=String(p.error||'').slice(0,500);j.completedAt=iso;
    const providerError=p.state==='sent'?null:rosterNotificationProviderError_(p.providerError);if(providerError)j.providerError=providerError;else delete j.providerError;
    j.retryable=rosterNotificationRetryable_(j.error,j.providerError);changed=true;
   }else if(j.status!==p.state)error_(409,'Notification result was already recorded.');
   const attempt=(j.attemptHistory||[]).find(x=>x.claimId===p.claimId);if(attempt){attempt.state=j.status;attempt.messageId=j.messageId||'';attempt.error=j.error||'';attempt.completedAt=iso;if(j.providerError)attempt.providerError=j.providerError;}
   changed=rosterNotificationRetries_(s,now)||changed;result={recorded:true};
  }else if(op==='notificationDelivery'){
   if(typeof p.eventId!=='string'||!p.eventId||p.eventId.length>300||!['sent','delivered','read','failed'].includes(p.state))error_(400,'Invalid delivery event.');
   if(!s.deliveryEvents.includes(p.eventId)){
    const j=s.outbox.find(j=>j.messageId&&j.messageId===p.messageId||(j.attemptHistory||[]).some(a=>a.messageId===p.messageId))||s.outbox.find(j=>p.notificationId&&j.id===p.notificationId);
    if(j){
     if(p.recipientId&&GSISRosterOperations.mobile(p.recipientId)!==j.mobile)error_(403,'Delivery recipient does not match.');if(p.messageId&&!j.messageId)j.messageId=String(p.messageId).slice(0,300);
     if(['sending','uncertain'].includes(j.status)&&['sent','delivered','read'].includes(p.state))j.status='sent';
     const rank={sent:1,delivered:2,read:3};
     if(p.state==='failed'){
      if((!p.messageId||j.messageId===p.messageId)&&!['delivered','read'].includes(j.deliveryStatus)){
       const providerError=rosterNotificationProviderError_(p.providerError);j.deliveryStatus='failed';j.status='failed';j.error=providerError?'META_'+providerError.code:'Provider confirmed delivery failure.';
       if(providerError)j.providerError=providerError;else delete j.providerError;j.retryable=rosterNotificationRetryable_(j.error,j.providerError);
       const attempt=(j.attemptHistory||[]).find(a=>p.messageId?a.messageId===p.messageId:a.claimId===j.claimId);if(attempt){attempt.state='failed';attempt.error=j.error;attempt.completedAt=iso;if(providerError)attempt.providerError=providerError;}
      }
     }else if((rank[p.state]||0)>(rank[j.deliveryStatus]||0))j.deliveryStatus=p.state;
     if(['sent','delivered','read'].includes(p.state)){
      j.status='sent';j.error='';delete j.providerError;j.completedAt=j.completedAt||iso;delete j.nextAttemptAt;
      const attempt=(j.attemptHistory||[]).find(a=>a.messageId===p.messageId)||(j.attemptHistory||[]).find(a=>a.claimId===j.claimId);
      if(attempt){attempt.state='sent';attempt.messageId=j.messageId||String(p.messageId||'');attempt.error='';attempt.completedAt=attempt.completedAt||iso;delete attempt.providerError;}
     }
     j.deliveryAt=String(p.timestamp||iso);changed=true;
    }
    s.deliveryEvents.push(p.eventId);changed=true;
   }
   changed=rosterNotificationRetries_(s,now)||changed;result={recorded:true};
  }else{
   const cap=rosterPrivateCapability_(p.capability,now);rosterPrivateRecipient_(s,cap,currentContacts);
   if(op==='externalAcknowledge'){
    const ids=p.snapshotIds||[];
    if(!Array.isArray(ids)||!ids.length&&!p.timetableNoticeId||ids.length>100||ids.some(id=>!s.publicationSnapshots.some(v=>v.id===id&&v.staffId===cap.staffId&&v.date===cap.date)))error_(403,'Acknowledge only notices covered by this private link.');
    const ctx={now,iso,today:new Date(now+8*3600000).toISOString().slice(0,10),days:{},uuid:()=>Utilities.getUuid(),user:{staffId:cap.staffId,email:'external:'+cap.staffId,smc:false,admin:false}};
    result=cap.purpose==='duties'?GSISRosterOperations.acknowledgeDutiesCapability(s,ctx,cap,p):GSISRosterOperations.acknowledgePublications(s,ctx,{snapshotIds:ids,...(p.timetableNoticeId!==undefined?{timetableNoticeId:p.timetableNoticeId}:{}),date:cap.date});changed=result.savedIds.length>0;domainChanged=changed;result.acknowledged={timetableNoticeId:p.timetableNoticeId||null,snapshotIds:ids,acknowledgedAt:s.acknowledgements.find(a=>a.staffId===cap.staffId&&(p.timetableNoticeId?a.timetableNoticeId===p.timetableNoticeId:ids.includes(a.snapshotId)))?.at||iso};result.publicationRevision=s.dailyPublicationStates?.[cap.date]?.revision||null;
   }
   else{if(cap.purpose!=='mutual'||!cap.requestId||p.id&&p.id!==cap.requestId)error_(403,'This private link cannot approve relief.');const r=s.requests.find(r=>r.id===cap.requestId&&r.recipientId===cap.staffId&&r.date===cap.date);if(!r)error_(403,'This private request is unavailable.');if(['approved','rejected'].includes(r.status)){if(['approve','reject'].includes(p.decision)&&r.status===(p.decision==='approve'?'approved':'rejected')&&String(r.reason||'')===String(p.reason||'').trim())return {recorded:true,replayed:true,status:r.status};error_(409,'A different response has already been recorded.');}const ctx=rosterOperationsContext_({identity:currentService.identity,input:{...p,date:cap.date}},currentContacts,s);ctx.user={staffId:cap.staffId,email:'external:'+cap.staffId,smc:false,admin:false};const beforeOutbox=s.outbox.length;GSISRosterOperations.apply(s,ctx,{operation:'respondMutual',id:cap.requestId,date:cap.date,decision:p.decision,reason:p.reason||''});GSISRosterOperations.refreshStaplerNotifications(s,ctx,beforeOutbox);changed=true;domainChanged=true;result={recorded:true,status:r.status};}
  }
  if(changed){if(domainChanged)s.revision++;rosterOperationsCommit_(s);}return result;
 }finally{deployUnlock_(lock);}
}

// Provider diagnostics contain structure and safe classifications, never message text or private links.
function rosterNotificationProviderError_(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!Number.isSafeInteger(value.code)||value.code<0)return null;
 const result={code:value.code},details=[
  'Template parameters cannot contain line breaks, tabs or more than four consecutive spaces.',
  'The number of template parameters does not match the approved template.',
  'A template parameter has an invalid format.',
  'A template parameter exceeds the permitted length.',
  'Provider details withheld; use the Meta trace ID for investigation.'
 ];
 if(Number.isSafeInteger(value.subcode)&&value.subcode>=0)result.subcode=value.subcode;
 if(typeof value.traceId==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(value.traceId))result.traceId=value.traceId;
 if(typeof value.details==='string')result.details=details.includes(value.details)?value.details:details[4];
 if(typeof value.templateName==='string'&&/^[a-z0-9_]{1,128}$/.test(value.templateName))result.templateName=value.templateName;
 if(Array.isArray(value.fields))result.fields=value.fields.slice(0,32).filter(f=>f&&typeof f.field==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(f.field)&&Number.isInteger(f.index)&&f.index>=1&&f.index<=100&&Number.isInteger(f.characters)&&f.characters>=0&&f.characters<=1000000).map(f=>({field:f.field,index:f.index,characters:f.characters,...(typeof f.normalized==='boolean'?{normalized:f.normalized}:{})}));
 return result;
}
function rosterNotificationRetryable_(error,providerError){
 if(/^(?:MISSING_OR_INVALID_TEMPLATE_FIELD|NOTIFICATION_CONTENT_EXCEEDS|INVALID_TEMPLATE|TEMPLATE_CONTRACT|FINAL_RUN|STALE_COUNTDOWN|STALE_TIMETABLE|INVALID_OR_EXPIRED_NOTIFICATION)/.test(error||''))return false;
 const code=providerError?.code??Number(/^META_(\d+)$/.exec(error||'')?.[1]);
 return ![100,131008,131009,132000,132001,132005,132007,132012,132015,132016,132018].includes(code);
}
/* Retries are allowed only after a confirmed failure. An ambiguous send is escalated,
   never blindly resent. The same durable intent ID and per-attempt receipts are retained. */
function rosterNotificationRetries_(s,now){
 let changed=false;const iso=new Date(now).toISOString();GSISRosterAllocation.ensure(s);
 for(const j of s.outbox){
  if(['delivered','read'].includes(j.deliveryStatus)){if(j.status!=='sent'){j.status='sent';changed=true;}continue;}
  if((j.status==='failed'||j.status==='queued'&&j.deliveryStatus==='retry-pending')&&!rosterNotificationRetryable_(j.error,j.providerError)){if(j.retryable!==false||j.status!=='failed'||j.nextAttemptAt){j.retryable=false;j.status='failed';delete j.nextAttemptAt;changed=true;}}
  if(j.status==='failed'&&j.retryable!==false&&(j.attempts||0)>0&&j.attempts<3&&j.expiresAt>now){j.status='queued';j.nextAttemptAt=(j.firstAttemptAt||now)+(j.attempts===1?60000:180000);j.deliveryStatus='retry-pending';changed=true;continue;}
  const exhausted=j.status==='failed'&&(j.retryable===false||(j.attempts||0)>=3||!j.mobile||j.expiresAt<=now),uncertain=j.status==='uncertain';
  if((exhausted||uncertain)&&!s.smcAlerts.some(a=>a.key==='delivery:'+j.id)){const recipients=s.smcDutyRoster.find(r=>r.date===j.date)?.staffIds||[];s.smcAlerts.push({id:Utilities.getUuid(),key:'delivery:'+j.id,date:j.date,createdAt:iso,recipients,status:'open',summary:'WhatsApp '+(uncertain?'outcome is unconfirmed':'delivery failed after '+(j.attempts||0)+' attempts')+' for '+j.name+'. Contact the teacher directly and check Roster. No assignment was reversed.',notificationId:j.id});changed=true;}
 }return changed;
}
// Run from the Apps Script editor to grant/check the email scope. This never sends or queues mail.
function authoriseRosterMail(){
 const remaining=MailApp.getRemainingDailyQuota();
 if(!Number.isFinite(remaining)||remaining<0)throw Error('Email service readiness could not be verified.');
 const result={ready:true,remainingDailyQuota:remaining};
 console.log('GSiS email service authorised. Remaining daily recipient quota: '+remaining+'. No email was sent.');
 return result;
}
// Email is an external side effect. A persisted claim is never silently re-sent after a crash.
function rosterDailyEmploymentMailDispatch_(input={}){gsisRequireBackendRole_('roster');
 const outcome={sent:0,failed:0,uncertain:0,blocked:0};
 const publicOrigin=String(props_().getProperty('ROSTER_PUBLIC_ORIGIN')||input.publicOrigin||'').trim().replace(/\/$/,'');
 if(!/^https:\/\/[^\s/?#]+$/i.test(publicOrigin))return {...outcome,blocked:1,reason:'Configure the Roster public origin before sending Daily Updates.'};
 if(typeof MailApp==='undefined')return {...outcome,blocked:1,reason:'Authorise the Apps Script email service.'};
 let remaining;try{remaining=MailApp.getRemainingDailyQuota();}catch(e){return {...outcome,blocked:1,reason:'Authorise the Apps Script email service.'};}
 const fresh=rosterServiceContacts_().c,addresses=new Set(fresh.rosterPeople.flatMap(p=>Array.isArray(p.emails)?p.emails:[]).map(v=>String(v).trim().toLowerCase()));
 for(let attempt=0;attempt<Math.min(5,remaining);attempt++){
  let claim,snapshot;const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))return {...outcome,busy:true};
  try{const s=rosterOperationsState_(),now=Date.now();let changed=false;
   for(const row of s.dailyEmploymentMail)if(row.status==='sending'&&now-Date.parse(row.claimedAt)>10*60000){row.status='uncertain';row.error='Delivery could not be confirmed. Check the mailbox before sending another report.';changed=true;}
   const job=s.dailyEmploymentMail.find(j=>j.status==='queued');if(!job){if(changed)rosterOperationsCommit_(s);return outcome;}
   snapshot=s.dailyEmploymentSnapshots.find(r=>r.date===job.date);
   if(!snapshot||!addresses.has(job.to)){job.status='blocked';job.error=!snapshot?'The original report snapshot is unavailable.':'The selected email address is no longer in Contacts.';outcome.blocked++;rosterOperationsCommit_(s);continue;}
   job.status='sending';job.claimId=Utilities.getUuid();job.claimedAt=new Date(now).toISOString();rosterOperationsCommit_(s);claim={...job};
  }finally{deployUnlock_(lock);}
  gsisRequireBackendRole_('roster');
  let status='sent',error='';try{MailApp.sendEmail({to:claim.to,subject:claim.subject,...GSISRosterOperations.employmentEmail(snapshot,publicOrigin),name:'GSiS Roster'});}catch(e){status='uncertain';error='Email submission could not be confirmed. Check the mailbox before sending another report.';}
  const settle=LockService.getScriptLock();if(!deployLock_(settle,8000)){outcome.uncertain++;return outcome;}
  try{const s=rosterOperationsState_(),job=s.dailyEmploymentMail.find(j=>j.id===claim.id&&j.claimId===claim.claimId&&j.status==='sending');if(job){job.status=status;job.error=error;if(status==='sent')job.sentAt=new Date().toISOString();rosterOperationsCommit_(s);}outcome[status]++;}finally{deployUnlock_(settle);}
 }
 return remaining>0?outcome:{...outcome,blocked:1,reason:'The Apps Script daily email quota is exhausted; queued reports will retry later.'};
}
function rosterScheduledIdle_(s,slot,today){
 slot.report=GSISRosterOperations.smcSummarySlot(s,slot.stamp)||slot.minute===389||slot.minute===390;
 if(s.scheduleReceipts[slot.key]&&(!s.scheduleReceipts[slot.key].cancelled||s.scheduleReceipts[slot.key].reportComplete))return {replayed:true};
 const notices=s.massPublications[today]||s.staplerPlans.some(r=>r.date===today&&r.published);
 if(slot.optimise&&!s.systemConfig.scheduledAllocationEnabled&&!slot.report&&!notices)return {idle:true,allocationPaused:true};
 if(!slot.optimise&&!slot.report&&!notices&&!s.publicationSnapshots.some(v=>v.date===today&&v.kind!=='cancelled'))return {idle:true};
 return null;
}
// Conservative, version-fenced no-work projection. Any operations commit changes
// the version hint, including publication, absence, notification and settings saves.
function rosterScheduledHintWrite_(s,version){
 try{if(!version||props_().getProperty('ROSTER_SCHEDULE_DIRTY')||version!==props_().getProperty('ROSTER_VERSION_HINT'))return;const value={schema:1,version,at:Date.now(),enabled:s.systemConfig.scheduledAllocationEnabled===true,times:s.systemConfig.smcSummaryTimes,noticeDates:[...new Set([...Object.keys(s.massPublications),...s.staplerPlans.filter(r=>r.published).map(r=>r.date),...s.publicationSnapshots.filter(r=>r.kind!=='cancelled').map(r=>r.date)])]},json=JSON.stringify(value);if(json.length<7500)props_().setProperty('ROSTER_SCHEDULE_HINT',json);}catch(_){}
}
function rosterScheduledFastSkip_(slot,gate,today){
 try{const raw=props_().getProperty('ROSTER_SCHEDULE_HINT'),hint=raw&&JSON.parse(raw);if(!hint||hint.schema!==1||!hint.version||props_().getProperty('ROSTER_SCHEDULE_DIRTY')||hint.version!==props_().getProperty('ROSTER_VERSION_HINT')||Date.now()<hint.at||Date.now()-hint.at>=15*60000)return null;
 const phase=slot.minute>=960?'evening':slot.minute<390?'morning':null,time=String(Math.floor(slot.minute/60)).padStart(2,'0')+':'+String(slot.minute%60).padStart(2,'0');
 if([389,390].includes(slot.minute)||phase&&hint.times?.[phase]?.includes(time)||hint.noticeDates.includes(today)||gate.allocate&&hint.enabled)return null;
 return {idle:true,allocationSkipped:true,...(gate.allocationStopped?{allocationStopped:true}:{}),...(gate.allocationInProgress?{allocationInProgress:true}:{}),...(!hint.enabled?{allocationPaused:true}:{})};
 }catch(_){return null;}
}
function rosterScheduledDispatch_(req){gsisRequireBackendRole_('roster');
 const p=req.input||{},stamp=p.scheduledTime,started=Date.now();if(!Number.isFinite(stamp)||stamp>started+60000||started-stamp>120000)error_(400,'Scheduled tick is stale.');
 const slot={...GSISRosterAllocation.schedule(stamp),stamp},today=new Date(started+8*3600000).toISOString().slice(0,10),tracked=typeof rosterScheduledAllocationGate_==='function';
 if(typeof rosterAllocationManualBusy_==='function'&&rosterAllocationManualBusy_(rosterAllocationRunRead_(slot.date)))return {code:'SKIPPED_BUSY',skipped:true,allocationSkipped:true};
 if(tracked)rosterScheduledAllocationRecover_(slot);const gate=tracked?rosterScheduledAllocationGate_(slot):{allocate:slot.optimise};
 if(tracked&&slot.allocationKey){const visible=rosterAllocationRunRead_(slot.date);if(visible?.scheduleKey===slot.allocationKey&&(visible.tickKey||visible.scheduleKey)===slot.key){if(visible.state==='completed')return {replayed:true,allocationSkipped:true};if(gate.allocationInProgress)throw Object.assign(Error('An allocator is already running for this date.'),{status:409,code:'ALLOCATION_IN_PROGRESS'});}}
 const fast=rosterScheduledFastSkip_(slot,gate,today);if(fast)return fast;
 const execute=(run,reportOnly=false)=>{
  const executionStarted=Date.now();if(typeof rosterScheduledManualGuard_==='function')rosterScheduledManualGuard_(slot.date);
  if(typeof rosterAbsenceIntakeGate_==='function')rosterAbsenceIntakeGate_([slot.date],!!run||slot.optimise&&!reportOnly);
  const version=props_().getProperty('ROSTER_VERSION_HINT');let initial=rosterOperationsState_();rosterScheduledHintWrite_(initial,version);
  if(run&&rosterAllocationRunAccepted_(run,initial)){rosterAllocationRunLocked_(()=>rosterAllocationRunComplete_(run,initial));return {replayed:true};}
  if(typeof rosterAllocationAuditEnsureDay_==='function')initial=rosterAllocationAuditEnsureDay_(initial,p.calendarByDate,today);
  const effectiveSlot={...slot,optimise:!reportOnly&&(!!run||slot.optimise)},preflight=rosterScheduledIdle_(initial,effectiveSlot,today);if(preflight)return {...preflight,...(reportOnly?{allocationSkipped:true,...(gate.allocationStopped?{allocationStopped:true}:{})}:{})};
  const fresh=rosterServiceContacts_();
  for(let attempt=0;attempt<2;attempt++){
   const preparationStarted=attempt?Date.now():executionStarted;let preparationRecorded=false;
   try{
   const now=Date.now();if(now-stamp>120000)error_(400,'Scheduled tick is stale.');
   const s=rosterOperationsPhase_('prepare-state',()=>rosterOperationsState_()),today=new Date(now+8*3600000).toISOString().slice(0,10),idle=rosterScheduledIdle_(s,effectiveSlot,today);if(idle)return idle;
   const base=rosterOperationsPackedSnapshot_(s),ctx=rosterOperationsPhase_('prepare-context',()=>rosterOperationsContext_({identity:fresh.identity,input:{...p,operation:'scheduledRoster',date:slot.date}},fresh.c,s));
   ctx.user={staffId:null,email:'roster-service',smc:true,admin:false};ctx.service=true;ctx.skipScheduledAllocation=reportOnly;ctx.scheduledAllocationKey=run?.scheduleKey||slot.allocationKey||slot.key;ctx.scheduledAllocationRetry=!!run&&!slot.optimise;if(run)ctx.allocationBudgetCheck=()=>rosterScheduledAllocationBudget_(run);
   const command={...p,operation:'scheduledRoster',date:slot.date};
    if(run)rosterAllocationRunStage_(run,attempt?'Planning inputs changed; recalculating against current records.':'Calculating scheduled relief while retaining manual choices.');
    rosterOperationsRefreshClock_(ctx);
    const references=rosterOperationsReferenceKey_(ctx),dependencies=rosterOperationsDependencies_(base,command,ctx),beforeOutbox=s.outbox.length,preparedClock=GSISRosterAllocation.prepareClock(ctx,s,command);
     rosterOperationsPhase_('prepare-reconcile',()=>rosterOperationsReconcile_(s,ctx));const result=rosterOperationsPhase_('prepare-apply',()=>GSISRosterOperations.scheduledTick(s,ctx,stamp)),allocating=effectiveSlot.optimise&&!result.allocationTimedOut;
    // Scheduled receipts remain durable; the verified cold-output archive owns retention.
    if(run){rosterAllocationRunPreparation_(run,Date.now()-preparationStarted);preparationRecorded=true;}
    const next=rosterOperationsPackedSnapshot_(s),domainChanged=rosterOperationsDependencies_(base,{},ctx)!==rosterOperationsDependencies_(next,{},ctx);
    if(run)rosterScheduledAllocationBudget_(run,true);
    const lock=LockService.getScriptLock();if(!rosterOperationsPhase_('lock-wait',()=>deployLock_(lock,8000)))error_(503,'Another relief update is finishing. Retry the scheduler tick.');
    try{
     if(typeof rosterAbsenceIntakeGate_==='function')rosterAbsenceIntakeGate_([slot.date],allocating);
     const current=rosterOperationsState_();if(run&&current.scheduleReceipts[run.scheduleKey]?.cancelled)rosterAllocationRunCancellation_();if(current.scheduleReceipts[slot.key]&&(!current.scheduleReceipts[slot.key].cancelled||current.scheduleReceipts[slot.key].reportComplete))return {replayed:true};
     const checkClock=()=>{if(typeof rosterScheduledManualGuard_==='function')rosterScheduledManualGuard_(slot.date);const clock={};rosterOperationsClock_(clock);if(run)rosterScheduledAllocationBudget_(run,true);if(clock.now-stamp>120000)error_(400,'Scheduled tick is stale.');rosterOperationsCheckClock_(preparedClock);if(allocating&&!s.scheduleReceipts[ctx.scheduledAllocationKey]?.cancelled&&s.systemConfig.scheduledAllocationEnabled&&ctx.days[slot.date]?.schoolDay&&clock.now>Date.parse(slot.date+'T06:29:59.999+08:00'))rosterOperationsConflict_('ALLOCATION_CUTOFF','Optimisation crossed the morning cut-off. No draft changes were saved.');};
     checkClock();if(rosterOperationsReferenceStamp_(ctx)!==references||rosterOperationsDependencies_(rosterOperationsPackPlans_(current),command,ctx)!==dependencies)rosterOperationsConflict_('PREPARED_RETRY','Planning inputs changed during allocation.');
     const merged=rosterOperationsMergePrepared_(base,next,rosterOperationsPackedSnapshot_(current));merged.revision=current.revision+(domainChanged?1:0);
     const committed=GSISRosterOperations.validateState(rosterOperationsUnpackPlans_(merged));if(typeof rosterAllocationAuditAccepted_==='function')rosterAllocationAuditAccepted_(committed,current,ctx,{scheduleKey:run?.scheduleKey||slot.key});
     rosterOperationsPhase_('commit',()=>rosterOperationsCommit_(committed,[slot.date],allocating,()=>{checkClock();if(run)rosterAllocationRunBeforeCommit_(run,checkClock);}));if(run)rosterAllocationRunComplete_(run,committed);rosterScheduledHintWrite_(committed,props_().getProperty('ROSTER_VERSION_HINT'));
     return {...result,revision:committed.revision,notificationsQueued:s.outbox.length-beforeOutbox};
    }finally{deployUnlock_(lock);}
   }catch(e){if(!['PREPARED_RETRY','PLANNING_CLOCK_CHANGED'].includes(e.code))throw e;if(attempt===1){if(e.code==='PLANNING_CLOCK_CHANGED')throw e;error_(503,'Planning inputs changed during allocation. Retry this scheduler tick.');}}finally{if(run&&!preparationRecorded)rosterAllocationRunPreparation_(run,Date.now()-preparationStarted);}
  }
 };
 try{return gate.allocate&&tracked?rosterAllocationRunExecute_(req,null,execute,{trigger:'scheduled',date:slot.date,scheduleKey:slot.allocationKey,tickKey:slot.key,budgetDeadline:Math.min(started+75000,stamp+90000),saveDeadline:Math.min(started+110000,stamp+115000)}):execute(null,!gate.allocate);}
 catch(error){if(error.code==='SKIPPED_BUSY')return {code:'SKIPPED_BUSY',skipped:true,allocationSkipped:true};if(!['ALLOCATION_SLOT_DONE','ALLOCATION_CANCELLED','ALLOCATION_IN_PROGRESS','ALLOCATION_UNCONFIRMED'].includes(error.code))throw error;const active=rosterAllocationRunRead_(slot.date);if(!['ALLOCATION_SLOT_DONE','ALLOCATION_CANCELLED'].includes(error.code)&&active?.trigger==='scheduled'&&active.scheduleKey===slot.allocationKey)throw error;
  const currentGate=tracked?rosterScheduledAllocationGate_(slot):gate,skip=rosterScheduledFastSkip_(slot,currentGate,today);return skip||execute(null,true);
 }
}

function rosterNotificationManual_(s,j){
 if(j.kind!=='stapler_timetable'||j.data?.dailyPublication!==true)return false;
 // This field is written only by the domain's explicit Notify / Publish & Notify actions.
 if(j.data.manualSend!==undefined)return j.data.manualSend===true;
 // Earlier releases recorded those actions in the same durable transaction as the job.
 if(typeof j.key!=='string'||!j.key.startsWith('daily:'+j.date+':')||!j.key.endsWith(':'+j.recipientId))return false;
 return s.audit.some(a=>a.date===j.date&&a.at===j.createdAt&&a.publicationRevision===j.data.publicationRevision&&(a.staffIds||[]).includes(j.recipientId)&&(a.operation==='notifyDaily'||a.operation==='publishDaily'&&['all','affected'].includes(a.notifyMode)));
}
function rosterNotificationEmergency_(s,j){
 const data=j.data||{};if(j.kind!=='smc_alert'||data.emergencyAbsence!==true||data.templateKey!=='absence_update'||data.audience!=='duty-smc'||data.newAbsenceCount!==1)return false;
 const absence=s.absences.find(a=>a.id===data.absenceId&&a.date===j.date&&a.reportedAt===j.createdAt),key='emergency-absence:'+data.absenceId,created=Date.parse(j.createdAt);if(!absence||!Number.isFinite(created)||j.key!==key+':'+j.recipientId)return false;
 const slot=GSISRosterAllocation.schedule(created);if(slot.today!==j.date||slot.minute>=840)return false;
 // The domain records this alert and its recipient intent with the new absence.
 // A request field or an outbox flag alone cannot enable a quiet-hours bypass.
 return s.smcAlerts.some(a=>a.key===key&&a.date===j.date&&a.createdAt===j.createdAt&&(a.recipients||[]).includes(j.recipientId));
}
function rosterNotificationHold_(j,outcome,now){
 const before=JSON.stringify([j.holdReason,j.nextEligibleAt]);
 if(outcome==='quiet'){
  const slot=GSISRosterAllocation.schedule(now),morning=Date.parse(slot.today+'T05:45:00+08:00');
  j.holdReason='quiet-hours';j.nextEligibleAt=morning+(morning<=now?86400000:0);
 }else if(outcome==='pending-absence'){j.holdReason='pending-absence';j.nextEligibleAt=now+15000;
 }else{delete j.holdReason;delete j.nextEligibleAt;}
 return before!==JSON.stringify([j.holdReason,j.nextEligibleAt]);
}
/* Only the signed dispatcher supplies the live-approved allow-list. No client flag enables a send. */
function rosterNotificationEligible_(s,j,now,fresh,index,allowed){
 const invalid=GSISRosterOperations.notificationCurrent(s,j,now,index);if(invalid)return invalid;
 if(!j.data?.communicationSnapshot&&!j.data?.emergencyAbsence&&(fresh.rosterAbsenceIntakeUnavailable||fresh.rosterPendingAbsenceDates?.includes(j.date))&&['stapler_timetable','relief_publication','relief_reminder','conditional_relief_instruction','smc_report'].includes(j.kind))return 'pending-absence';
 if(j.kind==='conditional_relief_instruction'){const absent=fresh.rosterPeople.find(x=>x.id===j.data.absentTeacherId),contact=GSISRosterOperations.absentTeacherContact(absent);if(!absent?.name||!contact)return 'Absent teacher contact is missing or invalid in Contacts. Contact the teacher directly.';j.data.absentTeacherName=absent.name;j.data.absentTeacherContact=contact;}
 if(['stapler_request','stapler_decision'].includes(j.kind)){const requester=fresh.rosterPeople.find(x=>x.id===j.data.requesterId);if(!requester?.name)return 'The requesting teacher no longer exists in Contacts.';j.data.requesterName=requester.name;}
 const person=fresh.rosterPeople.find(x=>x.id===j.recipientId);
 if(!person)return 'Recipient no longer exists in Contacts.';
 if(j.kind==='stapler_timetable'&&!j.data.communicationSnapshot){const plan=j.data.dailyPublication?s.dailyPublicationStates?.[j.date]:s.staplerPlans.find(r=>r.date===j.date);if(!plan)return 'The saved timetable is unavailable.';}
 if(j.kind==='stapler_request'&&(!(fresh.rosterSMCIds||[]).includes(j.recipientId)||!GSISRosterOperations.teacherSponsor(person)))return 'The nominated sponsor is no longer an eligible teacher.';
 if(j.kind==='stapler_decision'&&j.data.audience==='stapler-sponsor'&&(!(fresh.rosterSMCIds||[]).includes(j.recipientId)||!GSISRosterOperations.teacherSponsor(person)))return 'The nominated sponsor is no longer an eligible teacher.';
 if(j.kind==='contact_review'&&!(fresh.rosterAdminIds||[]).includes(j.recipientId))return 'Recipient is no longer a Contacts Admin.';
 if(j.data.audience==='duty-smc'){const row=s.smcDutyRoster.find(r=>r.date===j.date);if(!GSISRosterOperations.dutyEligible(person)||!(fresh.rosterSMCIds||[]).includes(j.recipientId)||!row?.staffIds.includes(j.recipientId)||!GSISRosterOperations.dutyWindow(row,j.date,now))return 'Recipient is no longer on relief duty for this time window.';}
 if(j.data.audience==='urgent-smc'&&!(fresh.rosterUrgentSMCIds||[]).includes(j.recipientId))return 'Recipient is no longer eligible for urgent staff messages.';
 if(!person.active&&!s.adhoc.some(a=>a.staffId===j.recipientId&&a.date===j.date&&!a.deletedAt))return 'Recipient is inactive and is not engaged for the selected date.';
 j.mobile=GSISRosterOperations.mobile(person.mobile);j.name=person.name;j.external=person.active!==true;
 if(!/^\d{8,15}$/.test(j.mobile))return 'Recipient mobile number is missing or invalid. Contact the teacher directly.';
 // Explicit Notify actions and proven emergency-absence events bypass quiet hours.
 if(j.kind!=='urgent_forward'&&!GSISRosterOperations.scheduledSummaryCurrent(s,j)&&!rosterNotificationManual_(s,j)&&!rosterNotificationEmergency_(s,j)&&GSISRosterAllocation.schedule(now).quiet)return 'quiet';
 if(j.kind==='smc_report'&&now-Date.parse(j.createdAt)>30*60000)return 'Superseded by the next consolidated report.';
 if(j.data.scheduledSummary&&GSISRosterOperations.pendingSummary(index,j))return 'pending-summary';
 if(!allowed.has(j.data.templateKey))return 'blocked';
 return null;
}

function rosterPrivateTimetable_(ctx,s,staffId,date){
 const daily=GSISRosterOperations.dailyTimetable(s,{...ctx,user:{...ctx.user,staffId,smc:false,admin:false}},{date}),dd=ctx.baselineDays?ctx.baselineDays[date]:ctx.days[date],publication=s.dailyPublicationStates?.[date],matching=dd&&(!publication||dd.id===publication.baselineId)&&JSON.stringify(dd.periods)===JSON.stringify(daily.periods),teacher=matching?dd.teachers.find(t=>t.staffId===staffId):null;
 if(!daily.periods.length)return null;
 const monday=GSISRosterAllocation.monday(date),end=GSISRosterAllocation.addDays(monday,4);
 const duties=[...GSISRosterOperations.latestPublications(s).values()].filter(v=>v.staffId===staffId&&v.date>=monday&&v.date<=end&&v.kind!=='cancelled'&&!v.assignment.noRelief&&!v.assignment.remove).map(v=>GSISRosterOperations.publicDuty({...v.assignment,instructions:v.instructions,customInstructions:v.customInstructions}));
 return {monday,name:teacher?.name||ctx.people.find(t=>t.id===staffId)?.name||'',periods:daily.periods,perDay:daily.periods.length,baseline:teacher?.weekCells||[],duties,daily,...(daily.unavailableReason?{unavailableReason:daily.unavailableReason}:{})};
}

// Shared with PR #19: immutable core/monthly parts and manifest-last commits.
function rosterSplitStorageError_(message,status=503){throw Object.assign(Error(message),{status,...(status===507?{code:'ROSTER_STORAGE_CAPACITY'}:{}),failurePhase:'operations-storage'});}
function rosterSplitPartPlan_(text){
 const state=JSON.parse(text),fields=[],buckets=new Map([['core',[]]]),limit=8000000;
 if(!state||typeof state!=='object'||Array.isArray(state)||state.revision!==undefined&&(!Number.isSafeInteger(state.revision)||state.revision<0))rosterSplitStorageError_('The native document is invalid.');
 let oversized=false;
 const dated=(key,value)=>{const d=/^\d{4}-\d{2}-\d{2}$/.test(key)?key:typeof value?.date==='string'?value.date:typeof value?.at==='string'?value.at.slice(0,10):'';return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d)?d:'';};
 const add=(entry,date)=>{const key=date?date.slice(0,7):'core',json=JSON.stringify(entry);if(json.length+25>limit)oversized=true;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push({entry,date,json});};
 for(const [name,value] of Object.entries(state)){
  const type=Array.isArray(value)?'array':value&&typeof value==='object'?'object':'value',field=fields.length;fields.push([name,type]);
  if(name==='revision')continue;
  if(type==='value')add([field,-1,null,value],'');
  else for(const [index,key] of Object.keys(value).entries())add([field,index,type==='array'?null:key,value[key]],dated(type==='object'?key:'',value[key]));
 }
 if(oversized)return rosterSplitFragmentPlan_(text,state.revision??0,fields);
 const parts=[],serial=rows=>'{'+'"schema":1,"entries":['+rows.map(r=>r.json).join(',')+']}',target=8000000;
 const emit=(key,rows)=>{const data=serial(rows);if(data.length>limit)rosterSplitStorageError_('One group of relief records is too large to save. Ask Admin to review storage capacity.',507);parts.push({key,name:key+'.json',data,chars:data.length,digest:rosterOperationsPlanDigest_(data)});};
 const pages=(key,rows)=>{let page=[],size=25,index=0;const flush=()=>{emit(index?key+'-'+(index+1):key,page);index++;page=[];size=25;};for(const row of rows){if(row.json.length+25>limit)rosterSplitStorageError_('One relief record is too large to save. Ask Admin to review storage capacity.',507);if(page.length&&size+row.json.length+1>target)flush();page.push(row);size+=row.json.length+1;}if(page.length||!index)flush();};
 for(const [key,rows] of buckets){
  if(key==='core'){pages(key,rows);continue;}
  if(serial(rows).length<=target){emit(key,rows);continue;}
  for(const [label,half] of [['01',rows.filter(r=>Number(r.date.slice(8))<=15)],['16',rows.filter(r=>Number(r.date.slice(8))>15)]])if(half.length)pages(key+'-'+label,half);
 }
 return {schema:1,format:'gsis-roster-operations-split-v1',revision:state.revision??0,fields,chars:text.length,digest:rosterOperationsPlanDigest_(text),parts};
}
function rosterSplitFragmentPlan_(text,revision,fields){
 // A valid R2 object may contain one field larger than a Drive part. Retain
 // its exact JSON as bounded fragments instead of narrowing the object limit.
 const parts=[],size=1048576;let offset=0;
 while(offset<text.length){let end=Math.min(text.length,offset+size);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1])&&/[\uDC00-\uDFFF]/.test(text[end]))end--;
  const ordinal=parts.length,key=ordinal?'fragment-'+String(ordinal).padStart(6,'0'):'core',data=JSON.stringify({schema:1,encoding:'json-fragment-v1',ordinal,text:text.slice(offset,end)});parts.push({key,name:key+'.json',data,chars:data.length,digest:rosterOperationsPlanDigest_(data)});offset=end;
 }
 return {schema:1,format:'gsis-roster-operations-split-v1',encoding:'json-fragments-v1',revision,fields,chars:text.length,digest:rosterOperationsPlanDigest_(text),parts};
}
function rosterSplitManifestDigest_(manifest){return rosterOperationsPlanDigest_(JSON.stringify([manifest.schema,manifest.format,manifest.revision,manifest.fields,manifest.chars,manifest.digest,manifest.folderId,manifest.parts,...(manifest.encoding?[manifest.encoding]:[])]));}
function rosterSplitAssemble_(manifest,verifyWhole=false,includeText=true){
 const started=Date.now();let partsReadMs=0;
 const fail=()=>rosterSplitStorageError_('Split relief records failed verification. Keep the saved files and ask Admin to check storage.');
 if(manifest?.schema!==1||manifest.format!=='gsis-roster-operations-split-v1'||!Number.isSafeInteger(manifest.revision)||manifest.revision<0||!Array.isArray(manifest.fields)||!Array.isArray(manifest.parts)||!manifest.parts.length)fail();
 // Earlier split manifests have no metadata digest, so retain their complete
 // verification until the next successful write upgrades the manifest.
 if(manifest.integrityDigest!==undefined){if(!/^[a-f0-9]{64}$/.test(manifest.integrityDigest)||rosterSplitManifestDigest_(manifest)!==manifest.integrityDigest)fail();}else verifyWhole=true;
 if(manifest.encoding==='json-fragments-v1')return rosterSplitAssembleFragments_(manifest,includeText);
 if(manifest.encoding!==undefined)fail();
 const fields=manifest.fields,entries=fields.map(()=>[]),seen=new Set();
 for(const field of fields){if(!Array.isArray(field)||field.length!==2||typeof field[0]!=='string'||seen.has(field[0])||!['array','object','value'].includes(field[1]))fail();seen.add(field[0]);}
 const ids=new Set(),keys=new Set();for(const part of manifest.parts){
  if(typeof part.fileId!=='string'||!part.fileId||ids.has(part.fileId)||keys.has(part.key)||!Number.isSafeInteger(part.chars)||part.chars<1||part.chars>8000000||! /^[a-f0-9]{64}$/.test(part.digest||''))fail();ids.add(part.fileId);keys.add(part.key);
  const readStarted=Date.now(),data=rosterReadFile_(part.fileId);partsReadMs+=Date.now()-readStarted;if(data.length!==part.chars||rosterOperationsPlanDigest_(data)!==part.digest)fail();const parsed=JSON.parse(data);if(parsed.schema!==1||!Array.isArray(parsed.entries))fail();
  for(const row of parsed.entries){if(!Array.isArray(row)||row.length!==4||!Number.isInteger(row[0])||!entries[row[0]]||!Number.isInteger(row[1]))fail();entries[row[0]].push(row);}
 }
 if(!keys.has('core'))fail();const value={};
 fields.forEach(([name,type],field)=>{let result;if(name==='revision'){if(type!=='value'||entries[field].length)fail();result=manifest.revision;}
  else if(type==='value'){if(entries[field].length!==1||entries[field][0][1]!==-1)fail();result=entries[field][0][3];}
  else{result=type==='array'?[]:{};const names=new Set();entries[field].sort((a,b)=>a[1]-b[1]).forEach((row,index)=>{if(row[1]!==index||type==='object'&&(typeof row[2]!=='string'||names.has(row[2])))fail();if(type==='array')result.push(row[3]);else{names.add(row[2]);Object.defineProperty(result,row[2],{value:row[3],writable:true,enumerable:true,configurable:true});}});}
  Object.defineProperty(value,name,{value:result,writable:true,enumerable:true,configurable:true});
 });
 const assembledAt=Date.now(),text=includeText||verifyWhole?JSON.stringify(value):null,serialisedAt=Date.now();
 // Parts are verified on every read. Verify the complete byte stream only at
 // conversion boundaries; normal state reads do not re-serialise all history.
 if(verifyWhole&&(text.length!==manifest.chars||rosterOperationsPlanDigest_(text)!==manifest.digest))fail();
 return {value,text,timings:{partsReadMs,assembleMs:assembledAt-started-partsReadMs,serialiseMs:serialisedAt-assembledAt}};
}
function rosterSplitAssembleFragments_(manifest,includeText){
 const started=Date.now(),seen=new Set(),fragments=[],fail=()=>rosterSplitStorageError_('Split native JSON fragments failed verification. Keep the saved files and ask Admin to check storage.');
 for(const [ordinal,part]of manifest.parts.entries()){
  const key=ordinal?'fragment-'+String(ordinal).padStart(6,'0'):'core';
  if(part.key!==key||part.name!==key+'.json'||typeof part.fileId!=='string'||!part.fileId||seen.has(part.fileId)||!Number.isSafeInteger(part.chars)||part.chars<2||part.chars>8000000)fail();seen.add(part.fileId);
  const raw=rosterReadFile_(part.fileId);if(raw.length!==part.chars||rosterOperationsPlanDigest_(raw)!==part.digest)fail();let fragment;try{fragment=JSON.parse(raw);}catch(error){fail();}
  if(fragment.schema!==1||fragment.encoding!=='json-fragment-v1'||fragment.ordinal!==ordinal||typeof fragment.text!=='string'||!fragment.text.length||fragment.text.length>1048576)fail();fragments.push(fragment.text);
 }
 const text=fragments.join('');if(text.length!==manifest.chars||rosterOperationsPlanDigest_(text)!==manifest.digest)fail();let value;try{value=JSON.parse(text);}catch(error){fail();}
 if(!value||typeof value!=='object'||Array.isArray(value)||(value.revision??0)!==manifest.revision||JSON.stringify(Object.entries(value).map(([name,item])=>[name,Array.isArray(item)?'array':item&&typeof item==='object'?'object':'value']))!==JSON.stringify(manifest.fields))fail();
 return {value,text:includeText?text:null,timings:{partsReadMs:Date.now()-started,assembleMs:0,serialiseMs:0}};
}

function rosterSplitReadDocument_(id,verifyWhole=false,includeText=true){
 const raw=rosterReadFile_(id),root=JSON.parse(raw);
 if(root?.format!=='gsis-roster-operations-split-v1')return {id,value:root,text:includeText?raw:null,manifest:null};
 return {id,...rosterSplitAssemble_(root,verifyWhole,includeText),manifest:root};
}
function rosterSplitPrepareDocument_(value,options){
 const {folderId,previousId,name='manifest.json'}=options||{};
 if(typeof folderId!=='string'||!folderId||typeof name!=='string'||!name)rosterSplitStorageError_('A private native-document folder is required.');
 // PR #19 format and ordinal reconstruction are shared by native writes and
 // the D1 backup. Preflight bounds every part before any external mutation.
 const text=JSON.stringify(value),plan=rosterSplitPartPlan_(text);
 let prior=null,priorRaw=null;if(previousId){priorRaw=rosterReadFile_(previousId);prior=JSON.parse(priorRaw);if(prior.format!=='gsis-roster-operations-split-v1')rosterSplitStorageError_('The previous backup manifest is invalid.');rosterSplitAssemble_(prior,false,false);}
 const previous=new Map((prior?.parts||[]).map(part=>[part.key,part])),parts=[];
 for(const part of plan.parts){const old=previous.get(part.key);if(old?.digest===part.digest&&old.chars===part.chars){parts.push(old);continue;}
  const fileId=rosterCreateFile_(folderId,part.name,Utilities.newBlob(part.data,'application/json; charset=UTF-8'));
  if(rosterReadFile_(fileId)!==part.data)rosterSplitStorageError_('A new native-document part could not be verified.');
  const {data,...descriptor}=part;parts.push({...descriptor,fileId});
 }
 const manifest={...plan,folderId,parts};manifest.integrityDigest=rosterSplitManifestDigest_(manifest);
 let rootId=null,committed=false;
 return {manifest,get id(){return rootId;},commit(beforeWrite){
  if(committed)return rootId;
  if(previousId&&rosterReadFile_(previousId)!==priorRaw)throw Object.assign(Error('The previous document changed. Retry against its current manifest.'),{status:409});
  if(beforeWrite)beforeWrite();
  const encoded=JSON.stringify(manifest);rootId=rosterCreateFile_(folderId,name,Utilities.newBlob(encoded,'application/json; charset=UTF-8'));
  if(rosterReadFile_(rootId)!==encoded)rosterSplitStorageError_('The new native-document manifest could not be verified.');committed=true;return rootId;
 },cleanup(){
  if(!committed||!prior)return;const live=new Set(parts.map(part=>part.fileId));
  for(const old of prior.parts)if(!live.has(old.fileId))try{rosterDriveRequest_('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(old.fileId)+'?supportsAllDrives=true&fields=id',{method:'patch',contentType:'application/json',payload:JSON.stringify({trashed:true})},'native-document-retire');}catch(ignore){}
 }};
}
