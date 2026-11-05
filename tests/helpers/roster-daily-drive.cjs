'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib'),{JSDOM}=require('jsdom');
module.exports=function drive(now=Date.parse('2026-10-14T07:00:00+08:00')){
 const files=new Map(),calls=[],props=new Map([['ROSTER_EDGE_AUTHORITY','d1'],['ROSTER_FRESH_START_ACTIVE','yes'],['ROSTER_OPERATIONS_FILE','frozen']]);let next=1,lose=false,busy=false,corrupt=false;
 for(const [id,name,parent] of [['home','GSiS',null],['live','01 Live Data','home'],['roster','Roster','live'],['daily','Daily Relief','roster'],['audit','Allocation Audit','roster'],['backups','Backups','roster'],['outside','Daily Relief',null]])files.set(id,{id,name,parents:parent?[parent]:[],mimeType:'application/vnd.google-apps.folder'});
 files.set('frozen',{id:'frozen',name:'operations.json',parents:['roster'],mimeType:'application/json',bytes:Buffer.from('{}')});
 const blob=(bytes,name='')=>{const b=Buffer.isBuffer(bytes)?bytes:Buffer.from(Array.isArray(bytes)?bytes:String(bytes));return {getName:()=>name,getBytes:()=>[...b],getDataAsString:()=>b.toString(),setName(){return this;},setContentType(){return this;}};};
 const response=(data,bytes)=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(data),getContent:()=>[...(bytes||Buffer.from(JSON.stringify(data)))]});
 const NativeDate=Date,Clock=class extends NativeDate{static now(){return now;}};
 const wrap=e=>({getName:()=>e.localName,getValue:()=>e.textContent,getChildren:()=>Array.from(e.children,wrap)});
 const sandbox={XmlService:{parse:text=>({getRootElement:()=>wrap(new JSDOM(text,{contentType:'application/xml'}).window.document.documentElement)})},console,Date:Clock,ROSTER_ROOT:'roster',gsisRequireBackendRole_:()=>{},props_:()=>({getProperty:k=>props.get(k)||null,getProperties:()=>Object.fromEntries(props)}),ScriptApp:{getOAuthToken:()=> 'fixture-only'},Utilities:{newBlob:blob,ungzip:b=>blob(zlib.gunzipSync(Buffer.from(b.getBytes()))),unzip:b=>{const zip=Buffer.from(b.getBytes()),parts=[];let at=0;while(zip.readUInt32LE(at)===0x04034b50){const method=zip.readUInt16LE(at+8),size=zip.readUInt32LE(at+18),start=at+30+zip.readUInt16LE(at+26)+zip.readUInt16LE(at+28),data=zip.subarray(start,start+size);assert([0,8].includes(method));parts.push(blob(method?zlib.inflateRawSync(data):data,zip.subarray(at+30,at+30+zip.readUInt16LE(at+26)).toString()));at=start+size;}return parts;},base64Decode:s=>[...Buffer.from(s,'base64')],base64Encode:b=>Buffer.from(b).toString('base64'),computeDigest:(_a,b)=>[...crypto.createHash('sha256').update(Buffer.from(b)).digest()],DigestAlgorithm:{SHA_256:'SHA256'},getUuid:()=>crypto.randomUUID()},error_:(status,message)=>{throw Object.assign(Error(message),{status});},LockService:{getScriptLock:()=>{throw Error('No Roster request lock');},getUserLock:()=>({tryLock:()=>!busy,releaseLock(){}})},UrlFetchApp:{fetch(url,options={}){
  const u=new URL(url),id=u.pathname.split('/').pop(),method=options.method||'get';calls.push({url,method});assert.notEqual(id,'frozen','frozen archive is never read or written');
  if(method==='get'){
   if(u.searchParams.has('q')){const q=u.searchParams.get('q'),parent=/'([^']+)' in parents/.exec(q)?.[1],name=/name = '([^']+)'/.exec(q)?.[1];return response({files:[...files.values()].filter(f=>f.parents?.includes(parent)&&(!name||f.name===name)).map(f=>({id:f.id})),incompleteSearch:false});}
   const file=files.get(id);assert(file,'unknown file '+id);return u.searchParams.get('alt')==='media'?response({},corrupt?Buffer.from('corrupt readback'):file.bytes):response({...file,bytes:undefined});
  }
  if(u.pathname.includes('/upload/')){
   const boundary=/boundary=([^;]+)/.exec(options.contentType)[1],sections=Buffer.from(options.payload).toString().split('--'+boundary),meta=JSON.parse(sections[1].split('\r\n\r\n')[1].trim()),bytes=Buffer.from(sections[2].split('\r\n\r\n')[1].trim(),'base64'),fileId=method==='patch'?id:'file'+next++,old=files.get(fileId)||{};
   files.set(fileId,{...old,id:fileId,...meta,bytes,version:String(Number(old.version||0)+1)});if(lose){lose=false;throw Error('Lost provider response after commit');}return response({id:fileId});
  }
  const meta=JSON.parse(options.payload),fileId='folder'+next++;files.set(fileId,{id:fileId,...meta});return response({id:fileId});
 }}};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync('backend/RosterDriveOutputs.gs','utf8'),sandbox);
 const call=p=>sandbox.rosterDriveOutputsDispatch_({input:p},true).result;
 return {files,calls,props,sandbox,call,clock:n=>{now=n;},loseResponse:()=>{lose=true;},busy:v=>{busy=v;},corrupt:v=>{corrupt=v;},payload:(text,extra={})=>({operation:'edgeDriveOutput',step:'daily',kind:'log',date:'2026-10-14',revision:1,final:false,config:{homeBaseFolderId:'home',folderId:'daily',auditFolderId:'audit'},data:zlib.gzipSync(text).toString('base64'),digest:crypto.createHash('sha256').update(text).digest('hex'),bytesRaw:Buffer.byteLength(text),...extra})};
};
