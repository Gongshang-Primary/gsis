/* Contacts-owned current assignment data; no named deployment versions. */
var GSISContactsCurrent=(function(){
 'use strict';
 const sheetName='contacts_current_deployment',schema=1;
 const kinds=['dept','comm','cca','plt','events'];
 function validate(data){
  const text=(x,n)=>typeof x==='string'&&x.length>0&&x.length<=n;
  if(!data||data.source!=='contacts-current'||!Number.isInteger(data.sourceYear)||data.sourceYear<2000||data.sourceYear>2100||!Number.isInteger(data.revision)||data.revision<1)throw Error('Invalid current Contacts metadata');
  if(!Array.isArray(data.subjectHeaders)||data.subjectHeaders.length>100||data.subjectHeaders.some(x=>!text(x,80))||new Set(data.subjectHeaders).size!==data.subjectHeaders.length)throw Error('Invalid current Contacts subjects');
  if(!Array.isArray(data.assignments)||data.assignments.length>10000)throw Error('Invalid current Contacts assignments');
  const ids=new Set();
  for(const a of data.assignments){
   if(!a||!text(a.id,100)||ids.has(a.id)||!text(a.staffId,100)||!/^P?[1-6]$/.test(String(a.level))||!data.subjectHeaders.includes(a.subject)||!text(a.groupName,160)||!text(a.target,100))throw Error('Invalid current Contacts assignment');
   ids.add(a.id);
   if(Object.prototype.hasOwnProperty.call(a,'periods'))throw Error('Current Contacts assignments must not guess period counts');
  }
  if(!data.organisations||typeof data.organisations!=='object'||Array.isArray(data.organisations))throw Error('Invalid current Contacts organisations');
  for(const kind of kinds){
   const groups=data.organisations[kind],used=new Set();
   if(!Array.isArray(groups)||groups.length>200)throw Error('Invalid current Contacts group list');
   for(const g of groups){
    if(!g||!text(g.id,100)||used.has(g.id)||!text(g.name,160)||!Array.isArray(g.slots)||g.slots.length>300||g.slots.some(x=>!text(x,100))||new Set(g.slots).size!==g.slots.length)throw Error('Invalid current Contacts membership');
    used.add(g.id);
   }
  }
  if(!Array.isArray(data.classes)||data.classes.length>200||data.classes.some(c=>!c||!/^P?[1-6]$/.test(String(c.level))||!text(c.name,160)||!text(c.shortName,80)))throw Error('Invalid current Contacts classes');
  if(!Array.isArray(data.duties)||data.duties.length>1000)throw Error('Invalid current Contacts duties');
  for(const d of data.duties){
   if(!d||!text(d.staffId,100)||!['Mon','Tue','Wed','Thu','Fri'].includes(d.day)||!text(d.duty,120)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.end)||d.start>=d.end)throw Error('Invalid current Contacts duty');
  }
  for(const key of ['people','teachers','profiles','loads','workloads','mobile','statutoryName'])if(Object.prototype.hasOwnProperty.call(data,key))throw Error('Current assignment feed must not overwrite staff details or invent workloads');
  return data;
 }
 function decode(marker,rows,sha256){
  if(!Array.isArray(marker)||marker[0]!=='current'||typeof marker[1]!=='string')throw Error('Missing current Contacts marker');
  const manifest=JSON.parse(marker[1]);
  if(manifest.schema!==schema||!Number.isInteger(manifest.parts)||manifest.parts<1||manifest.parts>100||!Number.isInteger(manifest.revision)||manifest.revision<1||!/^[a-f0-9]{64}$/.test(manifest.sha256)||rows.length!==manifest.parts)throw Error('Invalid current Contacts manifest');
  if(rows.some((r,i)=>r[0]!=='part:'+i||typeof r[1]!=='string'||r[1].length>30000))throw Error('Incomplete current Contacts data');
  const raw=rows.map(r=>r[1]).join('');if(sha256(raw)!==manifest.sha256)throw Error('Current Contacts data changed or is incomplete');
  const data=validate(JSON.parse(raw));
  if(data.sourceYear!==manifest.sourceYear||data.revision!==manifest.revision)throw Error('Current Contacts marker does not match data');
  return data;
 }
 return {sheetName,schema,validate,decode};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISContactsCurrent;

function currentContactsDeployment_(ss){
 const sheet=ss.getSheetByName(GSISContactsCurrent.sheetName);if(!sheet)return null;
 try{
  const header=GSISSheets.readAcross(ss,[{sheet,row:1,col:1,height:2,width:2}],false,{flush:false})[0];
  if(header[0][0]!=='Key'||header[0][1]!=='JSON')throw Error('Invalid current Contacts headers');
  const manifest=JSON.parse(header[1][1]);
  if(manifest.schema!==GSISContactsCurrent.schema||!Number.isInteger(manifest.parts)||manifest.parts<1||manifest.parts>100||manifest.parts+2>sheet.getMaxRows())throw Error('Invalid current Contacts manifest');
  const rows=GSISSheets.readAcross(ss,[{sheet,row:3,col:1,height:manifest.parts,width:2}],false,{flush:false})[0];
  const data=GSISContactsCurrent.decode(header[1],rows,raw=>Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join(''));
  const after=GSISSheets.readAcross(ss,[{sheet,row:2,col:1,height:1,width:2}],false,{flush:false})[0][0];
  if(after[0]!==header[1][0]||after[1]!==header[1][1])throw Error('Current Contacts data changed while reading');
  return {available:true,...data};
 }catch(e){
  // A configured current roster is authoritative. Never replace 2026 data
  // with an unrelated published Deploy record after a partial/failed read.
  return {available:false,source:'contacts-current',error:'Current Contacts assignment information could not be loaded. Retry teaching information.'};
 }
}

function verifyCurrentContactsDeployment(){
 const current=currentContactsDeployment_(SpreadsheetApp.openById(GSIS_SHEET));
 if(!current||!current.available)throw new Error(current?.error||'Current Contacts data is not installed');
 return {ready:true,source:current.source,year:current.sourceYear,revision:current.revision,
  classes:current.classes.length,assignments:current.assignments.length,
  organisations:Object.fromEntries(Object.entries(current.organisations).map(([k,groups])=>[k,groups.length])),duties:current.duties.length};
}
