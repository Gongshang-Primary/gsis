/* Durable transport receipt, not absence/allocation authority. The caller verifies
 * the Google school session; Apps Script rechecks current Contacts on delivery.
 * Keep this source import-free: the build embeds it in both Worker entry points.
 */
export const ABSENCE_TRANSPORT_SCHEMA_SQL=`CREATE TABLE IF NOT EXISTS gsis_absence_transport (
 namespace TEXT NOT NULL, actor TEXT NOT NULL, request_id TEXT NOT NULL,
 command TEXT NOT NULL, identity TEXT NOT NULL, digest TEXT NOT NULL,
 accepted_at TEXT NOT NULL, dates TEXT NOT NULL, operation TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','claimed','forwarded','needsReview','withdrawn')),
 available_at INTEGER NOT NULL, claim_id TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0, last_code TEXT, forwarded_at TEXT,
 resolved_at TEXT, resolved_by TEXT, resolution_reason TEXT,
 PRIMARY KEY(namespace,actor,request_id)
)`;
const absenceTransportSchemas_=new WeakMap();
const absenceMirrorControlSQL_="CREATE TABLE IF NOT EXISTS gsis_roster_mirror_control(id INTEGER PRIMARY KEY CHECK(id=1),epoch INTEGER NOT NULL DEFAULT 1,phase TEXT NOT NULL DEFAULT 'normal' CHECK(phase IN ('normal','quiescing','paused','released')),release_request TEXT NOT NULL DEFAULT '',transport_revision INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0)";
const absenceMirrorGate_ = "NOT EXISTS(SELECT 1 FROM gsis_roster_mirror_control WHERE id=1 AND phase<>'normal')";
function absenceTransportError_(status,code,message){return Object.assign(Error(message),{status,code});}
function absenceTransportInvalid_(){throw absenceTransportError_(400,'INVALID_ABSENCE_CAPTURE','Supply a valid absence report or colleague request.');}
const absenceTransportObject_=value=>value&&typeof value==='object'&&!Array.isArray(value);
function absenceTransportText_(value,max=240,empty=false){if(typeof value!=='string'||value.length>max||(!empty&&!value)||/[\u0000]/.test(value))absenceTransportInvalid_();return value;}
function absenceTransportMap_(value,max,convert){if(!absenceTransportObject_(value)||Object.keys(value).length>max)absenceTransportInvalid_();return Object.fromEntries(Object.entries(value).map(([key,item])=>{absenceTransportText_(key,2000);if(['__proto__','prototype','constructor'].includes(key))absenceTransportInvalid_();return [key,convert(item,key)];}));}
function absenceTransportDate_(value){if(typeof value!=='string'||!/^20\d\d-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)absenceTransportInvalid_();return value;}
function absenceTransportDates_(command){
 let dates;if(command.dates!==undefined){if(!Array.isArray(command.dates)||!command.dates.length||command.dates.length>366)absenceTransportInvalid_();dates=[...new Set(command.dates.map(absenceTransportDate_))].sort();}
 else{const from=absenceTransportDate_(command.from||command.date),to=absenceTransportDate_(command.to||from),start=Date.parse(from),end=Date.parse(to);if(end<start||end-start>365*86400000)absenceTransportInvalid_();dates=[];for(let n=start;n<=end;n+=86400000)dates.push(new Date(n).toISOString().slice(0,10));}
 if(Date.parse(dates.at(-1))-Date.parse(dates[0])>365*86400000)absenceTransportInvalid_();return dates;
}
function absenceTransportIdentity_(who){if(!who||typeof who.email!=='string'||! /^[^@\s]+@gsps\.edu\.sg$/i.test(who.email)||typeof who.subject!=='string'||!who.subject||who.subject.length>240)throw absenceTransportError_(401,'SCHOOL_SESSION_REQUIRED','Sign in with your school account.');return {email:who.email.toLowerCase(),subject:who.subject};}
function absenceTransportScope_(env){
 let backend,origin;try{backend=new URL(env.APPS_SCRIPT_URL);origin=new URL(env.ROSTER_PUBLIC_ORIGIN);}catch{throw absenceTransportError_(503,'ABSENCE_TRANSPORT_CONFIG','Configure the Roster backend and public origin for durable capture.');}
 if(backend.protocol!=='https:'||backend.hostname!=='script.google.com'||backend.port||backend.username||backend.password||backend.search||backend.hash||!/^\/macros\/s\/[-\w]+\/exec$/.test(backend.pathname)||origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||origin.port)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_CONFIG','Configure valid Roster backend and public origin URLs.');
 return {backend:backend.href,origin:origin.origin};
}
async function absenceTransportHash_(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
function absenceTransportStable_(value){return Array.isArray(value)?value.map(absenceTransportStable_):absenceTransportObject_(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,absenceTransportStable_(value[key])])):value;}
async function absenceTransportContext_(env){
 if(!env.GSIS_JOBS)return null;const db=env.GSIS_JOBS;if(typeof db.prepare!=='function')throw absenceTransportError_(503,'ABSENCE_TRANSPORT_CONFIG','Configure durable Roster storage.');
 const config=absenceTransportScope_(env),namespace=await absenceTransportHash_(JSON.stringify([config.backend,config.origin]));
 if(!absenceTransportSchemas_.has(db)){const prepare=(async()=>{for(const sql of [ABSENCE_TRANSPORT_SCHEMA_SQL,'CREATE INDEX IF NOT EXISTS gsis_absence_transport_due ON gsis_absence_transport(namespace,state,available_at,accepted_at)']){const result=await db.prepare(sql).run();if(result.success===false)throw Error('schema');}})().catch(()=>{absenceTransportSchemas_.delete(db);throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','Durable capture is unavailable. Retry the same report.');});absenceTransportSchemas_.set(db,prepare);}
 await absenceTransportSchemas_.get(db);if(env.ROSTER_EDGE_AUTHORITY==='d1'){await db.prepare(absenceMirrorControlSQL_).run();await db.prepare('INSERT OR IGNORE INTO gsis_roster_mirror_control(id) VALUES(1)').run();}return {db,namespace,...config,edge:env.ROSTER_EDGE_AUTHORITY==='d1'};
}
function absenceTransportCommand_(input,origin){
 if(!absenceTransportObject_(input)||!['saveAbsence','requestMutual'].includes(input.operation)||input.intake!==true||typeof input.requestId!=='string'||! /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(input.requestId))absenceTransportInvalid_();
 let size;try{size=JSON.stringify(input).length;}catch{absenceTransportInvalid_();}if(size>220000)throw absenceTransportError_(413,'ABSENCE_CAPTURE_TOO_LARGE','Shorten the absence instructions before submitting.');
 if(input.publicOrigin!==undefined&&input.publicOrigin!==origin)absenceTransportInvalid_();
 const out={operation:input.operation,intake:true,requestId:input.requestId,publicOrigin:origin};
 for(const key of ['date','from','to','viewFrom','viewTo'])if(input[key]!==undefined)out[key]=absenceTransportDate_(input[key]);
 for(const key of ['staffId','id','typeId','absenceId','view','scope','expectedTimetableId','expectedParity'])if(input[key]!==undefined)out[key]=absenceTransportText_(input[key]);
 if(input.expectedAbsenceToken!==undefined){if(typeof input.expectedAbsenceToken!=='string'||! /^[a-f0-9]{64}$/.test(input.expectedAbsenceToken))absenceTransportInvalid_();out.expectedAbsenceToken=input.expectedAbsenceToken;}
 for(const [key,max] of [['reasonDetail',500],['remarks',2000]])if(input[key]!==undefined)out[key]=absenceTransportText_(input[key],max,true);
 for(const key of ['fullDay','selectAll','reliefRequired','instructionsNA','receiptOnly'])if(input[key]!==undefined){if(typeof input[key]!=='boolean')absenceTransportInvalid_();out[key]=input[key];}
 for(const key of ['revision','expectedStaplerRevision'])if(input[key]!==undefined){if(!Number.isSafeInteger(input[key])||input[key]<0)absenceTransportInvalid_();out[key]=input[key];}
 if(input.absenceClashToken!==undefined){if(out.operation!=='saveAbsence'||typeof input.absenceClashToken!=='string'||! /^[a-f0-9]{64}$/.test(input.absenceClashToken)||typeof input.confirmAbsenceReplacement!=='boolean')absenceTransportInvalid_();out.absenceClashToken=input.absenceClashToken;out.confirmAbsenceReplacement=input.confirmAbsenceReplacement;}
 if(input.staffIds!==undefined){if(!Array.isArray(input.staffIds)||!input.staffIds.length||input.staffIds.length>150||new Set(input.staffIds).size!==input.staffIds.length)absenceTransportInvalid_();out.staffIds=input.staffIds.map(id=>absenceTransportText_(id));}
 if(input.dates!==undefined){if(!Array.isArray(input.dates)||!input.dates.length||input.dates.length>366)absenceTransportInvalid_();out.dates=input.dates.map(absenceTransportDate_);}
 if(input.periods!==undefined){if(!Array.isArray(input.periods)||input.periods.length>40||input.periods.some(p=>!Number.isInteger(p)||p<0||p>=40)||new Set(input.periods).size!==input.periods.length)absenceTransportInvalid_();out.periods=input.periods.slice();}
 if(input.coverage!==undefined){const c=input.coverage;if(!absenceTransportObject_(c))absenceTransportInvalid_();if(c.kind==='fullDay')out.coverage={kind:'fullDay'};else if(c.kind==='timeRange'&&Number.isInteger(c.startMinutes)&&Number.isInteger(c.endMinutes)&&c.startMinutes>=0&&c.endMinutes<=1440&&c.startMinutes<c.endMinutes)out.coverage={kind:c.kind,startMinutes:c.startMinutes,endMinutes:c.endMinutes};else absenceTransportInvalid_();}
 const dates=absenceTransportDates_(out),dateSet=new Set(dates),dated=(value,convert)=>absenceTransportMap_(value,366,(item,date)=>{if(!dateSet.has(date))absenceTransportInvalid_();return convert(item);});
 const notes=value=>absenceTransportMap_(value,100,text=>absenceTransportText_(text,8000,true));
 if(input.instructionsByDate!==undefined)out.instructionsByDate=dated(input.instructionsByDate,notes);
 const staffIds=out.staffIds||[out.staffId].filter(Boolean),staffMap=(value,convert)=>absenceTransportMap_(value,150,(item,id)=>{if(!staffIds.includes(id))absenceTransportInvalid_();return convert(item);});
 if(input.instructionsByStaffDate!==undefined)out.instructionsByStaffDate=staffMap(input.instructionsByStaffDate,value=>dated(value,notes));
 if(input.expectedInstructionScopes!==undefined)out.expectedInstructionScopes=dated(input.expectedInstructionScopes,value=>{if(!absenceTransportObject_(value)||!Number.isSafeInteger(value.staplerRevision)||value.staplerRevision<0||!['odd','even','single'].includes(value.parity))absenceTransportInvalid_();return {timetableId:absenceTransportText_(value.timetableId),staplerRevision:value.staplerRevision,parity:value.parity};});
 const proposal=(value,periodRequired)=>{
  if(!absenceTransportObject_(value)||value.combination!==undefined&&typeof value.combination!=='boolean')absenceTransportInvalid_();const pick={recipientId:absenceTransportText_(value.recipientId)};
  if(value.combination!==undefined)pick.combination=value.combination;
  if(periodRequired){if(!Number.isInteger(value.period)||value.period<0||value.period>=40||!Number.isSafeInteger(value.expectedStaplerRevision)||value.expectedStaplerRevision<0||!['odd','even','single'].includes(value.expectedParity))absenceTransportInvalid_();Object.assign(pick,{period:value.period,lessonKey:absenceTransportText_(value.lessonKey,2000),expectedTimetableId:absenceTransportText_(value.expectedTimetableId),expectedStaplerRevision:value.expectedStaplerRevision,expectedParity:value.expectedParity});}
  if(value.expectedRecipientCell!==undefined){if(!Array.isArray(value.expectedRecipientCell)||value.expectedRecipientCell.length!==4)absenceTransportInvalid_();pick.expectedRecipientCell=value.expectedRecipientCell.map(cell=>absenceTransportText_(cell,2000,true));}
  if(periodRequired&&pick.combination&&!pick.expectedRecipientCell)absenceTransportInvalid_();return pick;
 };
 if(input.ownArrangementsByStaffDate!==undefined)out.ownArrangementsByStaffDate=staffMap(input.ownArrangementsByStaffDate,value=>dated(value,picks=>{if(!Array.isArray(picks)||picks.length>40||new Set(picks.map(p=>p?.period)).size!==picks.length)absenceTransportInvalid_();return picks.map(p=>proposal(p,true));}));
 if(out.operation==='requestMutual'){
  if(!out.absenceId||!Array.isArray(input.requests)||!input.requests.length||input.requests.length>40||dates.length!==1)absenceTransportInvalid_();const demandIds=new Set();
  out.requests=input.requests.map(request=>{const pick=proposal(request,false);if(!Array.isArray(request.demandIds)||!request.demandIds.length||request.demandIds.length>40)absenceTransportInvalid_();pick.demandIds=request.demandIds.map(id=>{absenceTransportText_(id);if(!id.startsWith(out.absenceId+':')||demandIds.has(id))absenceTransportInvalid_();demandIds.add(id);return id;});if(request.expectedLessons!==undefined)pick.expectedLessons=absenceTransportMap_(request.expectedLessons,40,(expected,id)=>{if(!pick.demandIds.includes(id)||!absenceTransportObject_(expected)||!['odd','even','single'].includes(expected.parity))absenceTransportInvalid_();return {lessonKey:absenceTransportText_(expected.lessonKey,2000),timetableId:absenceTransportText_(expected.timetableId),parity:expected.parity};});return pick;});
 }else if(!out.typeId||out.fullDay!==true&&!out.coverage&&!out.periods?.length)absenceTransportInvalid_();
 return {command:out,dates};
}
async function absenceTransportFind_(context,actor,requestId){return context.db.prepare('SELECT * FROM gsis_absence_transport WHERE namespace=? AND actor=? AND request_id=?').bind(context.namespace,actor,requestId).first();}
// Internal raw record lookup. all:true requires a fresh authority check in the
// caller; never return this record (identity/namespace included) to a browser.
export async function readAbsenceTransportRecord(env,who,{requestId,all=false}={}){
 const context=await absenceTransportContext_(env);if(!context)return null;const identity=absenceTransportIdentity_(who);
 if(typeof requestId!=='string'||! /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(requestId))absenceTransportInvalid_();
 const result=await context.db.prepare('SELECT * FROM gsis_absence_transport WHERE namespace=? AND request_id=?'+(all===true?'':' AND actor=?')+' LIMIT 2').bind(context.namespace,requestId,...(all===true?[]:[identity.email])).all();
 if(result.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','The original report could not be read.');
 if(result.results?.length>1)throw absenceTransportError_(409,'ABSENCE_CAPTURE_AMBIGUOUS','The report identity needs administrator review.');return result.results?.[0]||null;
}
export function publicAbsenceTransportReceipt(row){return absenceTransportReceiptValue_(row);}
function absenceTransportReceiptValue_(row){const peers=row.operation==='requestMutual'||!!JSON.parse(row.command).ownArrangementsByStaffDate;return {accepted:true,intakeReceipt:true,receiptOnly:true,requestId:row.request_id,acceptedAt:row.accepted_at,intakeState:['needsReview','withdrawn'].includes(row.state)?row.state:'pending',transportState:row.state,absenceApplied:false,savedIds:[],peerState:peers?'pending':'none',mutualRequestIds:[],reasonCode:row.last_code||null,affectedDates:JSON.parse(row.dates),...(row.state==='withdrawn'?{resolution:{at:row.resolved_at,by:row.resolved_by,reason:row.resolution_reason}}:{})};}
export async function captureAbsenceTransport(env,who,input){
 const context=await absenceTransportContext_(env);if(!context)return null;const identity=absenceTransportIdentity_(who),{command,dates}=absenceTransportCommand_(input,context.origin),encoded=JSON.stringify(command),digest=await absenceTransportHash_(JSON.stringify(absenceTransportStable_(command))),now=Date.now();
 let writeFailed=false;try{const insert=context.db.prepare('INSERT OR IGNORE INTO gsis_absence_transport (namespace,actor,request_id,command,identity,digest,accepted_at,dates,operation,available_at) '+(context.edge?'SELECT ?,?,?,?,?,?,?,?,?,? WHERE '+absenceMirrorGate_:'VALUES (?,?,?,?,?,?,?,?,?,?)')).bind(context.namespace,identity.email,command.requestId,encoded,JSON.stringify(identity),digest,new Date(now).toISOString(),JSON.stringify(dates),command.operation,now);const results=env.ROSTER_EDGE_AUTHORITY==='d1'?await context.db.batch([insert,context.db.prepare("UPDATE gsis_edge_heads SET revision=revision+1,updated_at=? WHERE scope='roster' AND mode='active' AND changes()=1").bind(now)]):[await insert.run()];writeFailed=results.some(result=>result.success===false);}catch{writeFailed=true;}
 // An acknowledgement can be lost after commit. A primary read confirms only
 // the immutable command actually stored; never mint a replacement request ID.
 let row;try{row=await absenceTransportFind_(context,identity.email,command.requestId);}catch{throw absenceTransportError_(503,'ABSENCE_CAPTURE_UNCONFIRMED','Capture could not be confirmed. Retry the same report.');}
 if(!row)throw absenceTransportError_(503,writeFailed?'ABSENCE_CAPTURE_UNCONFIRMED':'ABSENCE_CAPTURE_MISSING','Capture could not be confirmed. Retry the same report.');
 if(row.digest!==digest)throw absenceTransportError_(409,'ABSENCE_CAPTURE_CONFLICT','This request ID was already used for a different report.');return absenceTransportReceiptValue_(row);
}
export async function absenceTransportReceipt(env,who,input){const context=await absenceTransportContext_(env);if(!context)return null;const identity=absenceTransportIdentity_(who),{command}=absenceTransportCommand_(input,context.origin),row=await absenceTransportFind_(context,identity.email,command.requestId);if(!row)return null;const digest=await absenceTransportHash_(JSON.stringify(absenceTransportStable_(command)));if(row.digest!==digest)throw absenceTransportError_(409,'ABSENCE_CAPTURE_CONFLICT','This request ID was already used for a different report.');return absenceTransportReceiptValue_(row);}
function absenceTransportBackendResult_(reply,requestId){
 const envelope=reply?.result??reply;if(envelope?.ok===false)return {deterministic:[400,403,404,409,413,422].includes(envelope.status),code:[400,403,404,409,413,422].includes(envelope.status)?'BACKEND_REJECTED_'+envelope.status:'BACKEND_RETRY'};
 const receipt=envelope?.ok===true?envelope.data:envelope;
 return receipt?.accepted===true&&receipt.intakeReceipt===true&&receipt.receiptOnly===true&&receipt.requestId===requestId?{forwarded:true}:{code:'RECEIPT_UNCONFIRMED'};
}
export async function dispatchAbsenceTransport(env,{limit=2,budgetMs=55000,concurrency=3,capture}={}){
 const context=await absenceTransportContext_(env),summary={enabled:!!context,claimed:0,forwarded:0,pending:0,needsReview:0};if(!context)return summary;if(typeof capture!=='function')throw Error('Supply the authenticated absence intake callback.');
 const until=Date.now()+Math.max(1,Math.min(180000,budgetMs)),count=Math.max(1,Math.min(50,Math.trunc(limit)||1)),width=Math.min(count,Math.max(1,Math.min(4,Math.trunc(concurrency)||1)));let reservations=0;
 // Reserve one total slot per lane, then claim immediately before forwarding.
 // No lane preclaims a batch that could expire while waiting behind slow I/O.
 const lane=async()=>{while(reservations<count&&Date.now()<until){reservations++;
  const now=Date.now(),claimId=crypto.randomUUID(),claimed=await context.db.prepare("UPDATE gsis_absence_transport SET state='claimed',claim_id=?,lease_until=?,attempts=attempts+1 WHERE rowid IN (SELECT rowid FROM gsis_absence_transport WHERE namespace=? AND ((state='queued' AND available_at<=?) OR (state='claimed' AND lease_until<=?)) ORDER BY accepted_at,request_id LIMIT 1)"+(context.edge?' AND '+absenceMirrorGate_:'')+" RETURNING *").bind(claimId,now+90000,context.namespace,now,now).all();if(claimed.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','Durable delivery is unavailable.');const row=claimed.results?.[0];if(!row)return;summary.claimed++;
  let outcome;try{outcome=absenceTransportBackendResult_(await capture(JSON.parse(row.command),JSON.parse(row.identity),{acceptedAt:row.accepted_at}),row.request_id);}catch(error){const deterministic=error?.code!=='BACKEND_AUTHENTICATION'&&[400,403,404,409,413,422].includes(error?.status);outcome={deterministic,code:deterministic?'BACKEND_REJECTED_'+error.status:'BACKEND_RETRY'};}
  const state=outcome.forwarded?'forwarded':outcome.deterministic?'needsReview':'queued',delay=Math.min(300000,5000*2**Math.min(6,row.attempts-1)),settled=await context.db.prepare('UPDATE gsis_absence_transport SET state=?,claim_id=NULL,lease_until=0,available_at=?,last_code=?,forwarded_at=? WHERE namespace=? AND actor=? AND request_id=? AND state=\'claimed\' AND claim_id=? AND lease_until>?').bind(state,Date.now()+delay,outcome.forwarded?null:outcome.code,outcome.forwarded?new Date().toISOString():null,context.namespace,row.actor,row.request_id,claimId,Date.now()).run();
  if(settled.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','Delivery remains recoverable in durable storage.');if(settled.meta?.changes)summary[outcome.forwarded?'forwarded':outcome.deterministic?'needsReview':'pending']++;
 }};
 // Await every live delivery even if one settlement fails. The failed lease
 // remains durable; other in-flight jobs must not be abandoned by early reject.
 const completed=await Promise.allSettled(Array.from({length:width},()=>lane())),failed=completed.find(result=>result.status==='rejected');if(failed)throw failed.reason;return summary;
}
function absenceTransportFilter_(context,who,{all=false,date,scope,includeForwarded=false}={}){const identity=absenceTransportIdentity_(who),terms=['namespace=?'],values=[context.namespace];if(includeForwarded!==true)terms.push("state!='forwarded'");if(all!==true||scope==='mine'){terms.push('actor=?');values.push(identity.email);}if(date!==undefined){absenceTransportDate_(date);terms.push('EXISTS (SELECT 1 FROM json_each(dates) WHERE value=?)');values.push(date);}return {sql:terms.join(' AND '),values};}
// all:true is an internal capability: only pass it after a fresh Apps Script
// response confirms SMC/Admin. Never spread a browser request into these options.
export async function readAbsenceTransport(env,who,options={}){
 const context=await absenceTransportContext_(env);if(!context)return null;const filter=absenceTransportFilter_(context,who,options),totals=await context.db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN operation='saveAbsence' AND (state IN ('queued','claimed') OR (state='needsReview' AND last_code='BACKEND_REJECTED_409')) THEN 1 ELSE 0 END) pendingCaptureCount, SUM(CASE WHEN state='needsReview' AND operation='requestMutual' THEN 1 ELSE 0 END) peerReviewCount FROM gsis_absence_transport WHERE ${filter.sql}`).bind(...filter.values).first(),result=await context.db.prepare(`SELECT * FROM gsis_absence_transport WHERE ${filter.sql} ORDER BY (state IN ('forwarded','withdrawn')),accepted_at,request_id LIMIT 150`).bind(...filter.values).all();
 if(result.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','Received reports could not be read.');const entries=(result.results||[]).map(row=>({...absenceTransportReceiptValue_(row),command:JSON.parse(row.command),dates:JSON.parse(row.dates)}));return {entries,total:totals.total,hasMore:totals.total>entries.length,pendingCaptureCount:totals.pendingCaptureCount||0,peerReviewCount:totals.peerReviewCount||0};
}
export async function pendingAbsenceTransport(env,dates=null){
 const context=await absenceTransportContext_(env);if(!context)return {enabled:false,pendingCaptureCount:0,pendingPeerCount:0,peerReviewCount:0,blockedDates:[],peerBlockedDates:[],requestIds:[]};if(dates!==null&&(!Array.isArray(dates)||dates.length>366))absenceTransportInvalid_();if(dates)dates.forEach(absenceTransportDate_);
 const filter=dates?` AND EXISTS (SELECT 1 FROM json_each(dates) WHERE value IN (SELECT value FROM json_each(?)))`:'',result=await context.db.prepare("SELECT request_id,dates,operation,state,last_code FROM gsis_absence_transport WHERE namespace=? AND state NOT IN ('forwarded','withdrawn')"+filter).bind(context.namespace,...(dates?[JSON.stringify(dates)]:[])).all();if(result.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','Received reports could not be checked.');
 const rows=result.results||[],pending=rows.filter(row=>row.operation==='saveAbsence'&&(['queued','claimed'].includes(row.state)||row.state==='needsReview'&&row.last_code==='BACKEND_REJECTED_409')),peers=rows.filter(row=>row.operation==='requestMutual'&&['queued','claimed'].includes(row.state));return {enabled:true,pendingCaptureCount:pending.length,pendingPeerCount:peers.length,peerBlockedDates:[...new Set(peers.flatMap(row=>JSON.parse(row.dates)))].sort(),peerReviewCount:rows.filter(row=>row.operation==='requestMutual'&&row.state==='needsReview').length,blockedDates:[...new Set(pending.flatMap(row=>JSON.parse(row.dates)))].sort(),requestIds:pending.map(row=>row.request_id)};
}

export async function retryAbsenceTransport(env,who,{requestId,all=false}={}){
 const context=await absenceTransportContext_(env);if(!context)return null;const identity=absenceTransportIdentity_(who);if(typeof requestId!=='string'||! /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(requestId))absenceTransportInvalid_();
 const query=all===true?'namespace=? AND request_id=?':'namespace=? AND request_id=? AND actor=?',values=[context.namespace,requestId,...(all===true?[]:[identity.email])],found=await context.db.prepare(`SELECT * FROM gsis_absence_transport WHERE ${query} LIMIT 2`).bind(...values).all();
 if(found.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','The report could not be read.');if(!found.results?.length)return null;if(found.results.length!==1)throw absenceTransportError_(409,'ABSENCE_CAPTURE_AMBIGUOUS','The report identity needs administrator review.');const row=found.results[0];
 if(['forwarded','withdrawn'].includes(row.state))return absenceTransportReceiptValue_(row);if(row.state==='claimed'&&row.lease_until>Date.now())throw absenceTransportError_(409,'ABSENCE_CAPTURE_PROCESSING','This report is already being processed.');
 const updated=await context.db.prepare("UPDATE gsis_absence_transport SET state='queued',available_at=?,claim_id=NULL,lease_until=0,last_code=NULL WHERE namespace=? AND actor=? AND request_id=? AND state NOT IN ('forwarded','withdrawn') AND (state!='claimed' OR lease_until<=?)").bind(Date.now(),context.namespace,row.actor,requestId,Date.now()).run();if(updated.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','The report remains retained. Retry shortly.');
 const current=await absenceTransportFind_(context,row.actor,requestId);if(!current)throw absenceTransportError_(503,'ABSENCE_CAPTURE_UNCONFIRMED','The report could not be confirmed.');if(current.state==='claimed')throw absenceTransportError_(409,'ABSENCE_CAPTURE_PROCESSING','This report is already being processed.');return absenceTransportReceiptValue_(current);
}

// Use this same normalization when probing the Apps Script receipt after D1
// forwarding; the browser's original payload can contain stripped authority data.
export function normalizeAbsenceTransportCommand(env,input){return absenceTransportCommand_(input,absenceTransportScope_(env).origin).command;}
// Fresh backend SMC/Admin authorization is required before passing all:true.
// Only deterministic delivery failures can be withdrawn here. Forwarded jobs
// belong to the Apps Script journal and must be resolved at that authority.
export async function resolveAbsenceTransport(env,who,{requestId,reason,all=false}={}){
 const context=await absenceTransportContext_(env);if(!context)return null;const identity=absenceTransportIdentity_(who);if(all!==true)throw absenceTransportError_(403,'SMC_AUTHORIZATION_REQUIRED','SMC authorization is required to withdraw a received report.');if(typeof requestId!=='string'||! /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(requestId)||typeof reason!=='string'||!reason.trim()||reason.length>1000)absenceTransportInvalid_();
 const found=await context.db.prepare('SELECT * FROM gsis_absence_transport WHERE namespace=? AND request_id=? LIMIT 2').bind(context.namespace,requestId).all();if(found.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','The report could not be read.');if(!found.results?.length)return null;if(found.results.length!==1)throw absenceTransportError_(409,'ABSENCE_CAPTURE_AMBIGUOUS','The report identity needs administrator review.');const row=found.results[0];
 if(['forwarded','withdrawn'].includes(row.state))return absenceTransportReceiptValue_(row);if(row.state!=='needsReview')throw absenceTransportError_(409,'ABSENCE_CAPTURE_PROCESSING','Only a report awaiting review can be withdrawn here.');
 const result=await context.db.prepare("UPDATE gsis_absence_transport SET state='withdrawn',resolved_at=?,resolved_by=?,resolution_reason=? WHERE namespace=? AND actor=? AND request_id=? AND state='needsReview'").bind(new Date().toISOString(),identity.email,reason.trim(),context.namespace,row.actor,requestId).run();if(result.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','Withdrawal could not be confirmed. Retry the same review.');const current=await absenceTransportFind_(context,row.actor,requestId);if(current?.state!=='withdrawn')throw absenceTransportError_(409,'ABSENCE_CAPTURE_PROCESSING','This report changed while it was being reviewed.');return absenceTransportReceiptValue_(current);
}

// Internal bounded recovery of old overlap refusals. A partial overlap remains
// parked; backoff prevents a poison report from monopolising each queue wake.
export async function dueAbsenceOverlapRecords(env){
 const context=await absenceTransportContext_(env);if(!context||!context.edge)return [];
 const result=await context.db.prepare("SELECT * FROM gsis_absence_transport WHERE namespace=? AND operation='saveAbsence' AND state='needsReview' AND last_code='BACKEND_REJECTED_409' AND available_at<=? ORDER BY available_at,accepted_at LIMIT 4").bind(context.namespace,Date.now()).all();
 if(result.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','Report recovery is unavailable.');return result.results||[];
}
export async function deferAbsenceOverlapRecord(env,row){
 const context=await absenceTransportContext_(env);if(!context||context.namespace!==row.namespace)return;
 const result=await context.db.prepare("UPDATE gsis_absence_transport SET available_at=? WHERE namespace=? AND actor=? AND request_id=? AND attempts=? AND state='needsReview'").bind(Date.now()+3600000,row.namespace,row.actor,row.request_id,row.attempts).run();
 if(result.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','Report recovery could not be deferred.');
}
