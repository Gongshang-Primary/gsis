/* Request-local adapters. This file is included by the domain generator, not imported. */
const state=runtime.state, clone=x=>JSON.parse(JSON.stringify(x));
const GSIS_DEPLOY_VERSION='0.9.9',GSIS_BACKEND_KIND='deploy';
const Utilities={getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'SHA256'},computeDigest:(algorithm,text)=>runtime.sha256(text)};
const LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
function deployLock_(){return true;}function deployUnlock_(){}function gsisRequireBackendRole_(){}function deployPhase_(name,fn){return fn();}
function book_(){return state;}function index_(){return state.index;}function fieldIndexWrite_(b,idx){state.index=idx;}
function fieldRecover_(){return state.index;}function draftReadScope_(){return null;}
function props_(){return {getProperty:key=>key==='LEASES'?JSON.stringify(state.leases||{}):(state.properties||{})[key]||null,setProperty:(key,value)=>{if(key==='LEASES')state.leases=JSON.parse(value);else (state.properties||(state.properties={}))[key]=value;},deleteProperty:key=>{delete (state.properties||{})[key];}};}
function gsisApiSecret_(){if(typeof runtime.apiSecret!=='function')error_(503,'The signed integration credential is unavailable.');return runtime.apiSecret();}
function document_(b,en){const source=en.edgePublished?'publications':'drafts',prefix=(en.edgePublished?en.commit:en.id)+'|',fields={};for(const [key,value] of Object.entries(state[source]||{}))if(key.startsWith(prefix))fields[key.slice(prefix.length)]=value;if(!fields['[]'])error_(503,'Deploy version data is missing.');return GSISFields.inflate(fields);}
function cleanOld_(b,id){for(const key of Object.keys(state.drafts||{}))if(key.startsWith(id+'|'))delete state.drafts[key];}
function contacts_(identity,authorityOnly,action='deploySnapshot',input=null){return runtime.integration('contacts',action,input||{authorityOnly:!!authorityOnly},identity);}
function liveLandmarkRegistry_(){return runtime.integration('layout','registry',{},runtime.identity);}
function readLandmarkRegistry_(){const registry=liveLandmarkRegistry_();if(!registry)error_(503,'Configure LANDMARK_SHEET_ID in Deploy Apps Script.');return registry;}

function syncPublishedCatalogues_(b,idx,identity){const en=publishedEntry_(idx);if(en)queueHandoff_('contactsCatalogue',en,{revision:idx.revision,options:document_(b,en).masterOptions||idx.masterOptions||null,membership:document_(b,en).membership||null},identity);}
function syncLayoutPublication_(b,idx){const en=publishedEntry_(idx);if(!en)return null;queueHandoff_('layoutPublication',en,{publication:idx.layoutHandoff},runtime.identity);return {state:'pending',versionId:en.id,commit:en.commit};}
function queueHandoff_(kind,en,input,identity){const id=kind+':'+en.commit;state.jobs=state.jobs||{};if(!state.jobs[id])state.jobs[id]={id,kind,input,identity,versionId:en.id,commit:en.commit,publicationRevision:state.index.revision,state:'pending',attempts:0,createdAt:new Date().toISOString()};}
function layoutPublicationIntent_(d,entry){return {schema:1,versionId:d.id,versionName:d.name,commit:entry.commit,revision:entry.revision,from:d.from||'',to:d.to||'',document:clone(d),state:'pending'};}
function fieldPersist_(b,idx,d,requestId){
 const prev=idx.versions.find(x=>x.id===d.id),before=prev?document_(b,prev):{},fields=GSISFields.flat(d),changes=GSISFields.diff(before,d).map(({key,value})=>({key,value}));
 const prefix=d.id+'|';for(const key of Object.keys(state.drafts))if(key.startsWith(prefix)&&!(key.slice(prefix.length) in fields))delete state.drafts[key];for(const [key,value] of Object.entries(fields))state.drafts[prefix+key]=value;
 const commit=crypto.randomUUID(),entry={...prev,id:d.id,name:d.name,notes:d.notes||'',from:d.from||'',to:d.to||'',store:'d1',commit,revision:(prev?.revision||0)+1,updatedAt:new Date().toISOString(),pendingUnitRename:!!d.pendingUnitRename};
 const pending=fieldPendingReceipt_.get(d);if(pending)(state.receipts||(state.receipts={}))[d.id+'|'+pending.id]=clone(pending);
 const delta={versionId:d.id,revision:entry.revision,globalRevision:idx.revision+1,changes,at:entry.updatedAt};entry.lastDelta=d.id+'|'+commit;state.deltas[entry.lastDelta]={delta,previousDelta:prev?.lastDelta||null};
 const retained=new Set();let cursor=entry.lastDelta;for(let n=0;cursor&&n<32;n++){retained.add(cursor);cursor=state.deltas[cursor]?.previousDelta;}for(const key of Object.keys(state.deltas))if(key.startsWith(d.id+'|')&&!retained.has(key))delete state.deltas[key];
 idx.versions=idx.versions.filter(x=>x.id!==d.id).concat(entry);idx.revision++;idx.requests=(idx.requests||[]).concat(requestId||[]).slice(-200);
 if(!idx.publicationSchema){idx.publicationSchema=1;idx.published=null;}
 if(idx.publishNext===d.id){const old=idx.published;for(const [key,value] of Object.entries(fields))state.publications[commit+'|'+key]=value;idx.published={...entry,edgePublished:true};idx.venuePublications=[...(idx.venuePublications||[]),...(old?[old]:[])].filter((e,i,all)=>e.id!==d.id&&all.findIndex(x=>x.id===e.id)===i).concat(clone(idx.published));delete idx.publishNext;idx.layoutHandoff={versionId:d.id,commit,state:'pending'};}
 fieldCommitState_.set(d,delta);return entry;
}
function storedReceipt_(b,en,id){return (state.receipts||{})[en.id+'|'+id]||null;}
function fieldJournalRead_(b,commit){const tx=state.deltas[typeof commit==='string'?commit:commit?.commit];if(!tx)error_(409,'This cursor requires a full refresh.');return tx;}
function auditPage_(b,idx,c,p){auth_(c,'Admin');const en=idx.versions.find(x=>x.id===p.versionId);visible_(en,idx,c);const events=document_(b,en).audit||[];if(p.detailId){const event=events.find(x=>x.id===p.detailId);if(!event)error_(404,'Audit event not found');return {event};}let end=events.length;if(p.cursor){try{end=JSON.parse(p.cursor).end;}catch(ignore){error_(400,'Invalid audit cursor');}}if(!Number.isInteger(end)||end<0||end>events.length)error_(400,'Invalid audit cursor');const start=Math.max(0,end-40);return {versionId:en.id,legacy:true,events:events.slice(start,end).reverse().map(({id,at,actor,action})=>({id,at,actor,action})),cursor:start?JSON.stringify({end:start}):null,total:events.length};}

function reliefCache_(b,en,value){const key=en.commit;if(value){runtime.calculations.set(key,value);if(runtime.calculations.size>100)runtime.calculations.delete(runtime.calculations.keys().next().value);return value;}return runtime.calculations.get(key)||null;}
function reliefGuard_(b,idx,en){if(![...idx.versions,...(idx.published?[idx.published]:[])].some(x=>x.id===en.id&&x.commit===en.commit))error_(409,'Deploy changed; refresh.');}
function reliefDocument_(b,en){return document_(b,en);}
function reliefSnapshotDocument_(b,idx,en){const d=document_(b,en);reliefSnapshotReadState_.set(d,reliefConfirmed_(b,idx,en,d).result);return d;}

function edgeRosterReference_(d,en){
 const confirmed={source:reliefSource_(d),result:reliefAnalysis_(d)},formClasses=(d.classes||[]).map(c=>{const level=Number(String(c.level||'').replace(/\D/g,'')),short=String(c.shortName||c.ref||c.name||''),name=short.startsWith(String(level))?short:String(level)+short;return {id:c.ref||c.id||name,name,level,venue:c.venue||''};}).filter(c=>c.id&&c.name&&c.level>=1&&c.level<=6),catalogue=Array.isArray(d.membership)?membershipCatalogue_(d.membership):undefined;
 return {teachingEvidenceVersion:1,formClasses,teachingGroups:reliefTeachingGroups_(d),smcIds:(d.teachers||[]).map(t=>GSISTeachingRules.resolve(t,catalogue,undefined,d.teacherDrafts?.[t.id])).filter(t=>t.active&&(t.groups||[]).includes('SMC')).map(t=>t.id),subjectCategories:Object.fromEntries([...GSISWorkload.subjects(d).map(subject=>[subject,GSISWorkload.category(d,subject)]),...GSISWorkload.nonTeachingActivities(d).map(a=>[a.code,'Non-teaching'])]),venues:[...new Set(formClasses.map(c=>c.venue).concat((d.assignments||[]).map(a=>a.venue),(d.venueRegistry?.venues||d.venues||[]).flatMap(v=>[v.unitNumber||v.id,v.name])).filter(Boolean))].sort(),from:d.from||'',to:d.to||'',versionId:en.id,rows:confirmed.result.rows.map(r=>({id:r.id,R:Number.isFinite(r.quota)?r.quota:null,rawR:r.rawQuota,teachingPeriods:r.actualTeaching,teachingVerified:r.teachingVerified===true,periodCap:r.periodCap??null,capConfigured:r.capConfigured===true,capBasis:r.capBasis,capNonTeachingPeriods:r.capNonTeachingPeriods,capWorkload:r.capWorkload??null,capVerified:r.quota!==null,capVerificationReason:r.quota===null?r.reason||'Published Deploy workload is unverified.':null,timetableFactor:r.timetableFactor,teachingWeight:1+confirmed.result.settings.siuePercent/100,offloadFactor:r.OF,fullTimeTeacherCount:confirmed.result.reference.fullTimeTeacherCount})),source:{service:'deploy',versionId:en.id,revision:en.revision,commit:en.commit,from:d.from||'',to:d.to||'',calculationVersion:GSISRelief.model,cacheDay:new Date(Date.now()+8*3600000).toISOString().slice(0,10),checkedAt:new Date().toISOString()}};
}
function lordSourceAuthenticate_(input){return input;}
function venuesSourceAuthenticate_(input){return input;}
function lordDeployDocument_(b,en){return document_(b,en);}
function venuesDeployPublications_(b,idx){
 const latest=new Map();for(const en of [...(idx.venuePublications||[]),...(idx.published?[idx.published]:[])]){if(!en.edgePublished||!en.commit)error_(503,'Deploy publication is not immutable.');const old=latest.get(en.id);if(!old||old.revision<en.revision)latest.set(en.id,en);}
 return [...latest.values()].map(entry=>{const d=entry.from&&entry.to?entry:document_(b,entry);if(!/^20\d\d-\d\d-\d\d$/.test(d.from||'')||!/^20\d\d-\d\d-\d\d$/.test(d.to||'')||d.from>d.to)error_(503,'Published Deploy effective dates are missing or invalid.');return {entry,reference:{versionId:entry.id,revision:entry.revision,commit:entry.commit,updatedAt:entry.updatedAt,from:d.from,to:d.to}};}).sort((a,b)=>a.reference.from.localeCompare(b.reference.from)||a.reference.versionId.localeCompare(b.reference.versionId));
}
// This factory runs only behind the D1 active-mode gate. GAS fences are not a second authority here.
function deployEdgeFence_(){}
function deployEdgeFenced_(){return false;}
function deployEdgeForward_(){error_(503,'Unexpected legacy forwarding inside the D1 domain.');}
function edgePersonalCalculation_(d,en,staffId,today){
 const result=reliefAnalysis_(reliefSource_(d)),rawRows=result.rows.filter(r=>r.id===staffId),rows=reliefResultRows_({...result,rows:rawRows},true),row=rows.length===1?rows[0]:null;
 const source={name:d.name||en.id,revision:en.revision,commit:en.commit||'',from:d.from||'',to:d.to||'',model:result.calculationVersion},inRange=/^\d{4}-\d{2}-\d{2}$/.test(d.from||'')&&/^\d{4}-\d{2}-\d{2}$/.test(d.to||'')&&today>=d.from&&today<=d.to;
 const reference={T_avg:result.reference.T_avg,siuePercent:result.reference.siuePercent,fullTimeTeacherCount:result.reference.fullTimeTeacherCount,teachingPeriodTotal:result.reference.teachingPeriodTotal};
 const calculationReason=!inRange?'The published Deploy version does not cover today.':result.calculationVersion!==GSISRelief.model?'The published calculation model needs an update.':!row?'Your teacher record is not uniquely matched in the published Deploy version.':row.reason||row.breakdown.reason||'';
 let calculation=null;if(inRange&&result.calculationVersion===GSISRelief.model&&row){const {teacherId,name,...own}=row;calculation={...own,reference};}
 return {asOf:today,units:'periods/week',source,calculation,calculationReason,row,reference,deployTeachingEvidence:{verified:inRange&&result.calculationVersion===GSISRelief.model,rows:rawRows.map(r=>({id:r.id,periods:r.actualTeaching,verified:r.teachingVerified===true}))}};
}
