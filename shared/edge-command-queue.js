/* Shared edge-command contract. Google decides; D1 stores delivery, never app truth. */
var GSiSEdgeCommandQueue=(()=>{
 'use strict';
 const APP='deploy',GATEWAY='edge-command-gateway-v1',GOOGLE='edge-command-google-v1';
 const OPEN=['QUEUED','RUNNING','CHECKING','UNCERTAIN'],DELAYS=[15000,30000,60000,120000,300000];
 const LIMITS={rows:5000,open:1000,actor:20,receipts:100000,nonces:10000,payload:262144,envelope:16384,cacheEntry:2097152,cacheTotal:67108864};
 const ACTIONS=['saveDraft','publish','retryContactsSync','saveVersionNote','batchCells','setExclusionCell','metadata'];
 const EDITS=['renameClasses','setAscExportSettings','clearVenueAssignments','initReporting','setReportingOfficer','consolidateCCEEL','patchPlanning','setFortnight','setOrganisation','setDuties','setMembership','setMasterOptions','setLoad','setTeacherNote','setExclusionCell','addTeacher','removeTeacher','addClass','updateClass','deleteClass','addTG','moveClass','moveTG','upsertClassNameSet','deleteClassNameSet','upsertTeacherProfile','setHRTerms','setClassAbility','setTeacherField','setOffload','removeTeacherProfile','moveVenueGroup','moveClassBlock','removeTG','updateTG','setWorkload','setReliefSettings','setPAL','setSubjectType'];
 const DEPLOY={app:APP,document:'workbook',actions:ACTIONS,limits:LIMITS,validate:deployPayload};
 function deployPayload(p){
  if(p.protocol!==500||typeof p.versionId!=='string'||!p.versionId||p.versionId.length>200||typeof p.operation!=='string')fail(400,'COMMAND_DEPLOY_SCHEMA');
  const common=['operation','requestId','versionId','protocol','clientId','issuedAt','expectedRevision','key','token','hash','returnDelta','since','authority','auditPaged','reliefResults'];
  const fields={saveDraft:['edits'],publish:['contactApprovals'],retryContactsSync:['publicationCommit'],saveVersionNote:['notes','expected'],batchCells:['edits'],setExclusionCell:['teacher','level','checked','expected'],metadata:['name','from','to','expected','notes']}[p.operation];if(!fields||Object.keys(p).some(k=>!common.includes(k)&&!fields.includes(k)))fail(400,'COMMAND_DEPLOY_SCHEMA');
  if(p.operation==='saveDraft'||p.operation==='batchCells'){if(!Array.isArray(p.edits)||!p.edits.length||p.edits.length>(p.operation==='saveDraft'?500:20)||!Number.isFinite(p.issuedAt)&&p.operation==='saveDraft'||p.edits.some(e=>!e||Array.isArray(e)||!EDITS.includes(e.operation)))fail(400,'COMMAND_DEPLOY_EDITS');}
  if(p.operation==='publish'&&p.contactApprovals!==undefined&&(!Array.isArray(p.contactApprovals)||p.contactApprovals.length>500||p.contactApprovals.some(a=>!a||typeof a.id!=='string'||!a.values||!a.expected)))fail(400,'COMMAND_DEPLOY_APPROVALS');
  if(p.operation==='retryContactsSync'&&(typeof p.publicationCommit!=='string'||!p.publicationCommit))fail(400,'COMMAND_DEPLOY_PUBLICATION');
  if(p.operation==='saveVersionNote'&&(typeof p.notes!=='string'||p.notes.length>4000||typeof p.expected!=='string'||!Number.isFinite(p.issuedAt)))fail(400,'COMMAND_DEPLOY_NOTE');
  if(p.operation==='setExclusionCell'&&(typeof p.teacher!=='string'||typeof p.level!=='string'||typeof p.checked!=='boolean'||typeof p.expected!=='boolean'))fail(400,'COMMAND_DEPLOY_EXCLUSION');
 }
 function deployPermission(command,grant){
  const edits=command.payload.edits||[],admin=['publish','retryContactsSync'].includes(command.action)||edits.some(e=>['setReliefSettings','setPAL','setSubjectType','clearVenueAssignments','setMembership','setMasterOptions'].includes(e.operation)||e.operation==='patchPlanning'&&['setMembership','setMasterOptions'].includes(e.source));
  if(admin&&!grant.admin)fail(403,'COMMAND_DEPLOY_ADMIN');
  if(edits.some(e=>['setTeacherNote','addTeacher','removeTeacher','addTG','moveClass','moveTG'].includes(e.operation)&&e.subject!=='PAL')&&grant.kp!==true&&grant.admin!==true)fail(403,'COMMAND_DEPLOY_KP');
  if(edits.some(e=>e.subject==='PAL'&&['addTeacher','removeTeacher'].includes(e.operation))&&!grant.palEditor)fail(403,'COMMAND_DEPLOY_PAL');
 }
 function fail(status,code){throw Object.assign(Error(code),{status,code});}
 const bytes=s=>unescape(encodeURIComponent(s)).length;
 function canonical(value,depth=0){
  if(depth>32)fail(400,'COMMAND_DEPTH');
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){if(!Number.isFinite(value))fail(400,'COMMAND_NUMBER');return JSON.stringify(value);}
  if(Array.isArray(value)){for(let i=0;i<value.length;i++)if(!Object.prototype.hasOwnProperty.call(value,i))fail(400,'COMMAND_VALUE');return '['+value.map(v=>canonical(v,depth+1)).join(',')+']';}
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k],depth+1)).join(',')+'}';
  fail(400,'COMMAND_VALUE');
 }
 // JSON.parse cannot detect duplicate keys. Parse the bounded wire before hashing.
 function parse(text,limit=LIMITS.payload+LIMITS.envelope){
  if(typeof text!=='string'||bytes(text)>limit)fail(413,'COMMAND_SIZE');let at=0;
  const ws=()=>{while(/[\t\n\r ]/.test(text[at]||'\0'))at++;};
  function string(){const start=at++;while(at<text.length){const ch=text[at++];if(ch==='"'){try{return JSON.parse(text.slice(start,at));}catch{fail(400,'COMMAND_JSON');}}if(ch==='\\')at++;}fail(400,'COMMAND_JSON');}
  function value(depth){
   if(depth>32)fail(400,'COMMAND_DEPTH');ws();const ch=text[at];
   if(ch==='"')return string();
   if(ch==='{'||ch==='['){const object=ch==='{',out=object?{}:[],seen=new Set();at++;ws();if(text[at]===(object?'}':']')){at++;return out;}
    while(at<text.length){ws();let key;if(object){if(text[at]!=='"')fail(400,'COMMAND_JSON');key=string();if(seen.has(key))fail(400,'COMMAND_DUPLICATE_KEY');seen.add(key);ws();if(text[at++]!==':')fail(400,'COMMAND_JSON');}
     const v=value(depth+1);if(object)Object.defineProperty(out,key,{value:v,enumerable:true,configurable:true,writable:true});else out.push(v);ws();const next=text[at++];if(next===(object?'}':']'))return out;if(next!==',')fail(400,'COMMAND_JSON');
    }fail(400,'COMMAND_JSON');
   }
   const token=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));if(!token)fail(400,'COMMAND_JSON');at+=token[0].length;const v=JSON.parse(token[0]);if(typeof v==='number'&&!Number.isFinite(v))fail(400,'COMMAND_NUMBER');return v;
  }
  const out=value(0);ws();if(at!==text.length)fail(400,'COMMAND_JSON');return out;
 }
 function safePayload(value){
  canonical(value);
  function visit(v){if(typeof v==='string'&&/https?:\/\/\S*(?:[?&](?:token|signature|capability|secret)=|\/(?:external|relief-link)\?)/i.test(v))fail(400,'COMMAND_PRIVATE_LINK');if(!v||typeof v!=='object')return;for(const [key,item]of Object.entries(v)){if(/secret|password|authorization|cookie|access.?token|id.?token|private.*link/i.test(key))fail(400,'COMMAND_PRIVATE_FIELD');visit(item);}}
  visit(value);return value;
 }
 function secret(value){if(typeof value!=='string'||!/^[!-~]{32,8000}$/.test(value))fail(503,'GSIS_SECRET_INVALID');return value;}
 function hex(bytes){return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
 async function digest(value){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value))));}
 async function sign(value,key){const payload=canonical(value),k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret(key)),{name:'HMAC',hash:'SHA-256'},false,['sign']);return {payload,signature:hex(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(payload)))};}
 async function verify(envelope,key,purpose,now=Date.now()){
  if(!envelope||typeof envelope.payload!=='string'||! /^[a-f0-9]{64}$/.test(envelope.signature||''))fail(401,'COMMAND_SIGNATURE');
  const value=parse(envelope.payload),k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret(key)),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('HMAC',k,Uint8Array.from(envelope.signature.match(/../g),x=>parseInt(x,16)),new TextEncoder().encode(envelope.payload)))fail(401,'COMMAND_SIGNATURE');
  if(value.purpose!==purpose||!Number.isFinite(value.timestamp)||Math.abs(now-value.timestamp)>60000||!uuid(value.nonce))fail(401,'COMMAND_ENVELOPE');return value;
 }
 const primaryDecision=d=>({app:d.app,document:d.document,requestId:d.requestId,actorSubject:d.actorSubject,action:d.action||null,schemaVersion:d.schemaVersion||1,payloadHash:d.payloadHash,decision:d.decision,resultKind:d.resultKind||null,beforeRevision:d.beforeRevision||null,afterRevision:d.afterRevision||null,nativeCommit:d.nativeCommit||null,reference:d.reference,appliedAt:d.appliedAt||null,code:d.code||null});
 async function decisionProof(value){const {digest:claimed,purpose,timestamp,nonce,...record}=value;if(!['APPLIED','REJECTED','CANCELLED'].includes(record.decision)||typeof record.reference!=='string'||!record.reference||! /^[a-f0-9]{64}$/.test(record.payloadHash||'')||claimed!==await digest(record)||value.primaryDigest!==await digest(primaryDecision(value)))fail(503,'QUEUE_DECISION_PROOF');return value;}
 const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
 function command(value,adapter=DEPLOY){
  if(!value||value.app!==adapter.app||value.document!==adapter.document||!uuid(value.requestId)||!Number.isFinite(value.issuedAt)||value.schemaVersion!==1||!adapter.actions.includes(value.action)||!value.actor||typeof value.actor.subject!=='string'||!value.actor.subject||! /^[^@\s]+@gsps\.edu\.sg$/.test(value.actor.email||'')||!value.expectedRevision||!value.payload||Array.isArray(value.payload)||typeof value.payload!=='object')fail(400,'COMMAND_SCHEMA');
  if(value.payload.operation!==value.action||value.payload.requestId!==value.requestId)fail(400,'COMMAND_IDENTITY');
  const allowed=['app','document','requestId','issuedAt','schemaVersion','action','actor','expectedRevision','payload'];if(Object.keys(value).some(k=>!allowed.includes(k)))fail(400,'COMMAND_SCHEMA');
  if(Object.keys(value.actor).some(k=>!['email','subject'].includes(k)))fail(400,'COMMAND_ACTOR');
  if(Object.keys(value.expectedRevision).sort().join(',')!=='commit,indexRevision,versionId,versionRevision'||!Number.isSafeInteger(value.expectedRevision.indexRevision)||!Number.isSafeInteger(value.expectedRevision.versionRevision)||typeof value.expectedRevision.versionId!=='string'||typeof value.expectedRevision.commit!=='string')fail(400,'COMMAND_REVISION');
  adapter.validate(value.payload);safePayload(value.payload);if(bytes(canonical(value.payload))>adapter.limits.payload||bytes(canonical({...value,payload:null}))>adapter.limits.envelope)fail(413,'COMMAND_SIZE');return value;
 }
 const shadowProjection=data=>({indexRevision:data.revision,versionId:data.currentId||data.current?.id||null,current:data.current||null,versions:data.versions||[]});
 const binding=c=>({app:c.app,document:c.document,actorSubject:c.actor.subject,action:c.action,schemaVersion:c.schemaVersion,expectedRevision:c.expectedRevision,payload:c.payload});
 function time(at){return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at));}
 function receiptLabel(r){return r.state==='QUEUED'?'Queued at '+time(r.submittedAt):r.state==='APPLIED'?'Saved at '+time(r.appliedAt||r.updatedAt):({RUNNING:'Applying',CHECKING:'Checking outcome',UNCERTAIN:'Needs review',REJECTED:'Rejected'}[r.state]||'Outcome unavailable');}
 const unresolved=step=>!['complete','not_required','APPLIED','REJECTED','CANCELLED'].includes(step.state);
 const pendingCount=rows=>rows.reduce((n,r)=>n+(OPEN.includes(r.state)?1:0)+(r.steps||[]).filter(unresolved).length,0);
 return {APP,GATEWAY,GOOGLE,OPEN,DELAYS,LIMITS,ACTIONS,DEPLOY,deployPayload,deployPermission,fail,bytes,canonical,parse,safePayload,secret,digest,sign,verify,primaryDecision,decisionProof,uuid,command,binding,shadowProjection,receiptLabel,pendingCount,unresolved};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSiSEdgeCommandQueue;
