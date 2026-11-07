// Synthetic Contacts workbook. No real staff data, sessions or service calls.
const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),assert=require('assert/strict');
module.exports=function fixture(source=fs.readFileSync('Contacts_Code.gs','utf8')){
 const sheets=new Map(),props=new Map([['GSIS_SECRET','x'.repeat(32)],['BRIDGE_SECRET','x'.repeat(32)],['CONTACTS_PENDING_V2','{}']]);
 const stats={flush:0,reads:[],writes:[],nativeWrites:0,finds:0};let held=false,busy=false,mode='',insideAPI=false;
 class Sheet{
  constructor(name,data=[],max=1000){this.name=name;this.data=data;this.formulas=[];this.max=max;}
  getName(){return this.name}getParent(){return book}getLastRow(){return this.data.length}getLastColumn(){return this.data[0]?.length||0}getMaxRows(){return this.max}getMaxColumns(){return 26}
  insertRowsAfter(at,n){this.max+=n}appendRow(row){stats.nativeWrites++;this.data.push(row)}getDataRange(){return this.getRange(1,1,this.getLastRow(),this.getLastColumn())}
  getRange(row,col,height=1,width=1){const sheet=this;return {
   getRow:()=>row,getValues:()=>Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>sheet.data[row+y-1]?.[col+x-1]??'')),
   getDisplayValues(){return this.getValues().map(r=>r.map(String))},getFormulas:()=>Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>sheet.formulas[row+y-1]?.[col+x-1]||'')),
   setValues(values){if(!insideAPI)stats.nativeWrites++;values.forEach((r,y)=>{sheet.data[row+y-1]??=[];sheet.formulas[row+y-1]??=[];r.forEach((v,x)=>{sheet.data[row+y-1][col+x-1]=v;sheet.formulas[row+y-1][col+x-1]='';});});return this},setValue(v){return this.setValues([[v]])},
   createTextFinder(id){return {matchEntireCell(){return this},matchCase(){return this},useRegularExpression(){return this},findNext(){stats.finds++;for(let i=0;i<height;i++)if(String(sheet.data[row+i-1]?.[col-1]??'')===id)return {getRow:()=>row+i};return null;}}}
  }}
 }
 const book={getId:()=> 'fixture',getSheetByName:n=>sheets.get(n),insertSheet:n=>{const sh=new Sheet(n);sheets.set(n,sh);return sh},getSheets:()=>[...sheets.values()]};
 const col=s=>[...s].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0),parse=range=>{const full=range.match(/^'((?:[^']|'')+)'$/);if(full){const sheet=sheets.get(full[1].replace(/''/g,"'"));assert.ok(sheet,range);return {sheet,row:1,col:1,height:sheet.data.length,width:Math.max(1,...sheet.data.map(r=>r.length))};}const m=range.match(/^'((?:[^']|'')+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);assert.ok(m,range);return {sheet:sheets.get(m[1].replace(/''/g,"'")),row:+m[3],col:col(m[2]),height:+m[5]-+m[3]+1,width:col(m[4])-col(m[2])+1}};
 const logs=[];
 const ctx=vm.createContext({console:{info:s=>logs.push(s),error:s=>logs.push(s),log(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)??null,setProperty:(k,v)=>props.set(k,v)})},
  SpreadsheetApp:{openById:()=>book,flush(){stats.flush++}},LockService:{getScriptLock:()=>({tryLock(){if(held||busy)return false;held=true;return true},releaseLock(){assert.ok(held);held=false}})},
  Session:{getEffectiveUser:()=>({getEmail:()=> 'admin@gsps.edu.sg'})},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this}})},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_alg,s)=>[...crypto.createHash('sha256').update(s).digest()],base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),computeHmacSha256Signature:(s,k)=>[...crypto.createHmac('sha256',k).update(s).digest()],getUuid:crypto.randomUUID,formatDate:()=> '20261006_010000'}});
 ctx.Sheets={Spreadsheets:{Values:{batchGet(id,p){assert.equal(id,'fixture');stats.reads.push(p.ranges.slice());return {valueRanges:p.ranges.map(range=>{const r=parse(range),g=r.sheet.getRange(r.row,r.col,r.height,r.width);const values=p.valueRenderOption==='FORMATTED_VALUE'?g.getDisplayValues():g.getValues();for(const row of values)while(row.length&&row.at(-1)==='')row.pop();while(values.length&&!values.at(-1).length)values.pop();return {values}})}},
  batchUpdate(p,id){assert.equal(id,'fixture');assert.equal(p.valueInputOption,'RAW');stats.writes.push(p.data.map(x=>x.range));insideAPI=true;try{for(const item of p.data){const r=parse(item.range);r.sheet.getRange(r.row,r.col,r.height,r.width).setValues(item.values);
   if(mode==='reserve'&&r.sheet.name==='contacts'&&r.width===1&&r.col===18){mode='';throw Error('Interrupted after identity reservation')}
   if(mode==='partial'&&r.sheet.name==='contacts'&&r.width>1){mode='';throw Error('Interrupted after a contact patch')}
  }if(mode==='lostAck'&&p.data.some(x=>x.values[0]?.[0]==='Applied')){mode='';throw Error('Response lost after Applied')}return {};}finally{insideAPI=false}}
 }}};
 vm.runInContext(source,ctx);const run=s=>vm.runInContext(s,ctx);
 const headers=['TTb Name','iCON Alias (@moe.edu.sg)','CES Alias (@schools.gov.sg)','GSPS Alias (@gsps.edu.sg)','Statutory Name','Basic Name','Mobile No','EXT','Day of Birth','Month of birth','Role','Appointment Level','Appointment Status','Employment Modifier','Subject Modifier','Active','MK Modifier','Staff ID'];
 const rows=Array.from({length:181},(_,i)=>headers.map(k=>({'TTb Name':'Person '+i,'Basic Name':'Person '+i,'Statutory Name':'Person '+i,'Mobile No':'8123 4567',Role:i===0?'AE':'Teacher','Employment Modifier':i===0?'AE':'',Active:'Y','Staff ID':'staff-'+i,'GSPS Alias (@gsps.edu.sg)':'person'+i}[k]||'')));
 const contact=new Sheet('contacts',[headers,...rows,Array(18).fill(''),Array(18).fill('')],184);contact.formulas=contact.data.map((r,i)=>r.map((_,c)=>i&&[0,11].includes(c)?'=LEGACY()':''));sheets.set('contacts',contact);
 const flags=['SL','SC','SMC','KP','TL','SDT','CMT','SAT','Support','MK'];sheets.set('roles',new Sheet('roles',[['Role Shortform','Formal Role Name',...flags,'Appointment Level'],['Teacher','Teacher',...flags.map(()=>''),''],['AE','Allied Educator',...flags.map(k=>k==='Support'?'1':''),'']]));
 sheets.set('admin_users',new Sheet('admin_users',[['Email','Role','Active','Updated At','Admin ID'],['admin@gsps.edu.sg','Admin','Y','',''],['other-admin@gsps.edu.sg','Admin','Y','',''],['kp@gsps.edu.sg','KP','Y','','']]));
 sheets.set('contact_save_journal',new Sheet('contact_save_journal',[['Request ID','Actor','Kind','Digest','Status','At','Payload','Recovery actor','Recovery started']]));
 sheets.set('backup',new Sheet('backup',[['Protected'],['Original history']]));props.set('CONTACT_VALUE_MIGRATION_BACKUP','backup');
 function post(action,input={},email='admin@gsps.edu.sg'){const payload=JSON.stringify({action,input,identity:{email,subject:email},timestamp:Date.now(),nonce:crypto.randomUUID()});ctx.signed={postData:{contents:JSON.stringify({payload,signature:crypto.createHmac('sha256','x'.repeat(32)).update(payload).digest('hex')})}};return JSON.parse(run('doPost(signed).text'));}
 function reset(){stats.flush=stats.nativeWrites=stats.finds=0;stats.reads.length=stats.writes.length=logs.length=0;}
 function seedPending(payload){ctx.seedPayload=payload;run("var seededRequest=Utilities.getUuid();saveJournal_(SpreadsheetApp.openById(GSIS_SHEET),seededRequest,'admin@gsps.edu.sg','contacts',seedPayload).begin()");const r=sheets.get('contact_save_journal').data.at(-1);return {requestId:r[0],digest:r[3]};}
 return {ctx,run,post,seedPending,reset,sheets,props,stats,logs,headers,setBusy:v=>busy=v,setMode:v=>mode=v,getHeld:()=>held};
};
