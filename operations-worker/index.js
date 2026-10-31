import rosterGateway,{rosterBackend,serviceBackend,absenceTransportRoute,assertAbsenceTransportReady,forwardAbsenceTransport,receivedReportWorkDue} from '../roster-update/public/_worker.js';
import deployGateway,{deployBackend} from '../public/_worker.js';
import {runDeployHandoffs} from '../public/edge-deploy.js';
import {readEdgeRosterReferences,readRosterMirrorStatus} from '../roster-update/public/edge-roster.js';
import {verifyBackendEnvelope,backendDomainEnv,permittedRelayPath} from '../shared/backend-service.js';
import {assertRecoveryWritable,readRecoveryState,recordRecoveryCheckpoint} from '../shared/edge-recovery.js';
import {readSystemHealth} from '../shared/edge-health.js';
import {requestBackgroundWork,readBackgroundJobs,retryBackgroundJob} from '../shared/edge-background-jobs.js';

const fail=(status,code,message)=>{throw Object.assign(Error(message),{status,code});};
const ROSTER_ACTIONS=new Set(['rosterProfile','rosterRead','rosterUpload','rosterUpdate','rosterOperations','rosterInbox','edgeMigration']);
const DEPLOY_ACTIONS=new Set(['deployEdgeAdmin','access','relief','acknowledgeNotices','auditPage','versionNote','delta','receipt','roleTruthTable','saveRoleTruthTable','publicCampus','landmarkUnit','landmarkSearch','publishReview','bootstrap','sync','lease','change','active']);
const ROSTER_WRITES=new Set(['saveAbsence','deleteAbsences','saveInstructions','assign','combine','undo','unassign','returnAutomatic','removeAssignment','requestMutual','respondMutual','reliefBatch','publish','autoAllocate','optimise','saveStapler','confirmStapler','publishStapler','resetStapler','requestStapler','decideStapler','renameStapler','moveStapler','deleteStapler','restoreStapler','saveNameBridge','deleteNameBridge','saveAdhoc','deleteAdhoc','saveRecess','deleteRecess','saveRecessSettings','saveSystemConfig','saveDailyEmploymentSettings','sendDailyEmploymentReport','saveCustomInstruction','deleteCustomInstruction','setCustomInstructionEnabled','setDutySMC','importRHistory','verifyRYear','correctRelief','confirmCompleted','setNoRelief','noRelief','notifyDaily','retryAbsenceIntake','resolveAbsenceIntake','acknowledge']);
const TIMETABLE_WRITES=new Set(['confirmStapler','publishStapler','resetStapler','moveStapler','deleteStapler','restoreStapler','publish','saveNameBridge','deleteNameBridge']);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
async function authority(env,domain,command){
 const migration=domain==='roster'?command.purpose==='roster'&&command.action==='edgeMigration':command.purpose==='deploy'&&command.action==='deployEdgeAdmin';
 if(!env.GSIS_JOBS?.prepare)fail(503,'GSIS_BACKEND_STORAGE','Bind the existing operational database.');
 if(!migration&&env[domain.toUpperCase()+'_EDGE_AUTHORITY']!=='d1')fail(503,'GSIS_BACKEND_AUTHORITY','Complete the verified D1 migration before opening the operational service.');
 if(migration)return;
 // Flags select the implementation; only verified active database heads grant
 // authority. Read primary metadata before any ingress capture or lazy writer.
 const scopes=domain==='roster'?['roster','roster-register','roster-references']:['deploy'],db=env.GSIS_JOBS.withSession?.('first-primary')||env.GSIS_JOBS;
 let rows;try{const result=await db.prepare("SELECT h.scope,h.mode,EXISTS(SELECT 1 FROM gsis_edge_records r WHERE r.scope=h.scope AND r.collection='$root' AND r.record_id='$') has_state FROM gsis_edge_heads h WHERE h.scope IN ("+scopes.map(()=>'?').join(',')+")").bind(...scopes).all();if(result.success===false)throw Error();rows=result.results||[];}catch{fail(503,'GSIS_BACKEND_NOT_ACTIVE','Verified operational ownership is not available.');}
 if(scopes.some(scope=>!rows.some(row=>row.scope===scope&&row.mode==='active'&&row.has_state===1)))fail(503,'GSIS_BACKEND_NOT_ACTIVE','Complete the verified D1 migration before accepting operational requests.');
}
// Health authorization is a primary, read-only Contacts check. It remains safe
// when recovery has stopped every writer; SMC does not imply administrator.
export async function requireHealthAdmin(env,identity){
 if(!env.GSIS_JOBS?.prepare)fail(503,'ROSTER_AUTHORITY_MISSING','Contacts authority is unavailable.');
 const db=env.GSIS_JOBS.withSession?.('first-primary')||env.GSIS_JOBS;
 let result;try{result=await db.batch([
  db.prepare("SELECT mode FROM gsis_edge_heads WHERE scope='roster-references'"),
  db.prepare("SELECT collection,record_id,value_json FROM gsis_edge_records WHERE scope='roster-references' AND ((collection='contactsCheckedAt' AND record_id='$') OR (collection='contacts' AND record_id IN ('key:rosterPeople','key:rosterAdminIds')))")
 ]);}catch{fail(503,'ROSTER_AUTHORITY_MISSING','Contacts authority is unavailable.');}
 if(result.some(row=>row.success===false)||result[0].results?.[0]?.mode!=='active')fail(503,'ROSTER_AUTHORITY_MISSING','Contacts authority is unavailable.');
 const refs={contacts:{}};try{for(const row of result[1].results){const value=JSON.parse(row.value_json);if(row.collection==='contacts')refs.contacts[row.record_id.slice(4)]=value;else refs.contactsCheckedAt=value.value;}}catch{fail(503,'ROSTER_AUTHORITY_MISSING','Contacts authority is invalid.');}
 const configuredAge=Number(env.ROSTER_AUTHORITY_MAX_AGE_SECONDS||900);
 if(!Number.isFinite(configuredAge)||configuredAge<=0)fail(503,'ROSTER_AUTHORITY_CONFIG','Contacts freshness is not configured correctly.');
 const maxAge=Math.min(3600000,Math.max(60000,configuredAge*1000));
 if(!Number.isFinite(refs.contactsCheckedAt)||Date.now()-refs.contactsCheckedAt>maxAge||refs.contactsCheckedAt>Date.now()+60000)fail(503,'ROSTER_AUTHORITY_STALE','Contacts permissions need a background refresh.');
 const contacts=refs.contacts;
 if(!Array.isArray(contacts?.rosterPeople)||!Array.isArray(contacts.rosterAdminIds))fail(503,'ROSTER_AUTHORITY_MISSING','Contacts authority is invalid.');
 const matches=contacts.rosterPeople.filter(person=>[person.email,...(Array.isArray(person.emails)?person.emails:[])].some(email=>String(email||'').toLowerCase()===identity.email));
 if(matches.length!==1||!contacts.rosterAdminIds.includes(matches[0].id))fail(403,'ROSTER_ADMIN_REQUIRED','Administrator access is required.');
 return {email:identity.email};
}
async function health(env,command){
 const actor=await requireHealthAdmin(env,command.identity),input=command.input;
 if(!object(input))fail(400,'GSIS_HEALTH_INPUT','Choose a supported health operation.');
 if(input.operation==='retryBackgroundJob')await retryBackgroundJob(env,{kind:input.kind,expectedGeneration:input.expectedGeneration},actor);
 else if(input.operation==='recordRecoveryCheckpoint')await recordRecoveryCheckpoint(env,{...(Object.hasOwn(input,'reason')?{reason:input.reason}:{}),...(Object.hasOwn(input,'label')?{label:input.label}:{})},actor);
 else if(input.operation!=='read')fail(400,'GSIS_HEALTH_INPUT','Choose a supported health operation.');
 const [data,background,recovery,googleBackup]=await Promise.all([readSystemHealth(env),readBackgroundJobs(env),readRecoveryState(env),readRosterMirrorStatus(env)]);
 const cache=await import('../roster-update/public/edge-timetable-cache.js');
 const timetables=cache.readTimetableCacheHealth?await cache.readTimetableCacheHealth(env):{available:false};
 return {ok:true,data:{...data,background,recovery,timetables,googleBackup}};
}
async function afterCommit(env,domain,action,input,result){
 if(!result?.ok||result.data?.replayed===true||result.data?.duplicate===true)return;
 const kinds=new Set();
 if(domain==='roster'){
  if(action==='rosterUpload'||action==='rosterUpdate'||action==='rosterOperations'&&TIMETABLE_WRITES.has(input.operation))kinds.add('timetables');
  if(action==='rosterOperations'&&ROSTER_WRITES.has(input.operation)){kinds.add('notifications');kinds.add('audit');}
  if(action==='rosterInbox'&&['inboxReply','inboxRetry','inboxResolve'].includes(input.operation))kinds.add('notifications');
 }else if(action==='change'&&input.operation==='publish'){kinds.add('timetables');kinds.add('audit');}
 for(const kind of kinds){try{await requestBackgroundWork(env,kind);}catch(error){console.warn(JSON.stringify({event:'gsis-background-wake-pending',kind,code:/^[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'WAKE_UNCONFIRMED'}));}}
}
async function relay(env,command,ctx){
 const domain=command.purpose==='deploy-http'?'deploy':'roster',value=command.request;
 if(!object(value)||!['GET','HEAD','POST'].includes(value.method)||!object(value.headers))fail(400,'GSIS_BACKEND_ROUTE','Invalid relayed request.');
 let url;try{url=new URL(value.url);}catch{fail(400,'GSIS_BACKEND_ROUTE','Invalid relayed request.');}
 if(url.origin!==command.origin||url.username||url.password||url.hash||!permittedRelayPath(domain,url.pathname))fail(403,'GSIS_BACKEND_ROUTE','The operational route is not permitted.');
 const allowed=new Set(['Authorization','Cookie','Origin','Sec-Fetch-Site','Content-Type']);if(Object.keys(value.headers).some(key=>!allowed.has(key)))fail(403,'GSIS_BACKEND_ROUTE','The relayed headers are not permitted.');
 if(value.body!==undefined&&(typeof value.body!=='string'||new TextEncoder().encode(value.body).byteLength>160000))fail(413,'GSIS_BACKEND_SIZE','Request too large.');
 const request=new Request(url,{method:value.method,headers:value.headers,...(['GET','HEAD'].includes(value.method)?{}:{body:value.body})});
 return (domain==='roster'?rosterGateway:deployGateway).fetch(request,env,ctx);
}
export default {async fetch(request,bindings,ctx){
 try{
  const command=await verifyBackendEnvelope(request,bindings),domain=command.purpose.startsWith('deploy')?'deploy':'roster',env=backendDomainEnv(bindings,domain);
  if(command.purpose==='health')return Response.json({ok:true,value:await health(env,command)},{headers:{'Cache-Control':'no-store'}});
  if(command.purpose==='roster'&&(!ROSTER_ACTIONS.has(command.action)||!object(command.input))||command.purpose==='deploy'&&(!DEPLOY_ACTIONS.has(command.action)||!object(command.input)))fail(403,'GSIS_BACKEND_ACTION','This operational action is not available.');
  assertRecoveryWritable(env);await authority(env,domain,command);
  if(command.purpose.endsWith('-http'))return await relay(env,command,ctx);
  let value;
  if(command.purpose==='roster'){
   if(!ROSTER_ACTIONS.has(command.action)||!object(command.input))fail(403,'GSIS_BACKEND_ACTION','This Roster action is not available.');
   value=await rosterBackend(env,command.action,command.input,command.identity,command.traceId);
   await afterCommit(env,'roster',command.action,command.input,value.result);
  }else if(command.purpose==='deploy'){
   if(!DEPLOY_ACTIONS.has(command.action)||!object(command.input))fail(403,'GSIS_BACKEND_ACTION','This Deploy action is not available.');
   value=await deployBackend(env,command.action,command.input,command.identity,{context:ctx,traceId:command.traceId,diagnosticId:command.diagnosticId,started:Number.isFinite(command.started)?command.started:Date.now()});
   await afterCommit(env,'deploy',command.action,command.input,value);
  }else if(command.purpose==='roster-service'){
   if(!object(command.input)||typeof command.input.operation!=='string')fail(400,'GSIS_BACKEND_ACTION','Supply a service operation.');
   if(command.input.operation==='forwardAbsenceTransport')value=await forwardAbsenceTransport(env,{limit:command.input.limit,budgetMs:command.input.budgetMs,concurrency:command.input.concurrency});
   else if(command.input.operation==='receivedReportWorkDue')value=await receivedReportWorkDue(env,{now:command.input.now});
   else if(command.input.operation==='deployHandoffs'){
    const deployEnv=backendDomainEnv(bindings,'deploy');await authority(deployEnv,'deploy',{});await runDeployHandoffs(deployEnv);value={ok:true,data:{processed:true}};
   }else value=await serviceBackend(env,command.input);
   if(['externalRespond','externalAcknowledge'].includes(command.input.operation))await afterCommit(env,'roster','rosterOperations',{operation:'respondMutual'},value);
  }else if(command.purpose==='roster-calendar'){
   if(!Array.isArray(command.dates)||command.dates.length>366||command.dates.some(date=>!/^20\d\d-\d\d-\d\d$/.test(date)))fail(400,'GSIS_BACKEND_INPUT','Supply valid calendar dates.');
   const refs=await readEdgeRosterReferences(env);value=Object.fromEntries(command.dates.map(date=>[date,refs.calendarByDate?.[date]||{available:false}]));
  }else if(command.purpose==='roster-transport'){
   if(command.operation==='ready'){
    if(!Array.isArray(command.dates)||command.dates.length>366||command.dates.some(date=>!/^20\d\d-\d\d-\d\d$/.test(date)))fail(400,'GSIS_BACKEND_INPUT','Supply valid capture dates.');
    await assertAbsenceTransportReady(env,command.dates,command.includePeers===true,command.identity);value={ready:true};
   }else if(command.operation==='route'&&object(command.input)){
    const response=await absenceTransportRoute(new Request(command.origin+'/api/operations'),command.input,env,command.identity,command.traceId,ctx);
    value=response?{status:response.status,body:await response.json()}:null;
    if(value?.body?.ok&&value.body.data?.intakeReceipt)await afterCommit(env,'roster','rosterOperations',{operation:'saveAbsence'},value.body);
   }else fail(400,'GSIS_BACKEND_ACTION','Supply a supported intake operation.');
  }else fail(404,'GSIS_BACKEND_ACTION','Private action not found.');
  return Response.json({ok:true,value},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){const status=[400,401,403,404,405,409,413,423,503].includes(error.status)?error.status:503,code=/^[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'GSIS_BACKEND_UNCONFIRMED';return Response.json({ok:false,status,code,error:status<500?error.message:'The private operation could not be confirmed. Retry with the same request.'},{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
}};
