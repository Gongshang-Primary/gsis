'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const files=new Map(),calls=[],props=new Map([['ROSTER_EDGE_AUTHORITY','d1'],['ROSTER_FRESH_START_ACTIVE','yes'],['ROSTER_OPERATIONS_FILE','frozen']]);let next=1;
for(const [id,name,parent] of [['home','GSiS',null],['live','01 Live Data','home'],['roster','Roster','live'],['backups','Backups','roster'],['outside','Backups',null]])files.set(id,{id,name,parents:parent?[parent]:[],mimeType:'application/vnd.google-apps.folder'});
files.set('frozen',{id:'frozen',name:'operations.json',parents:['backups'],mimeType:'application/json',bytes:Buffer.from('{}')});
const response=(data,bytes)=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(data),getContent:()=>[...(bytes||Buffer.from(JSON.stringify(data)))],getBlob:()=>blob(bytes||Buffer.from(JSON.stringify(data)))});
const blob=bytes=>{const b=Buffer.isBuffer(bytes)?bytes:Buffer.from(Array.isArray(bytes)?bytes:String(bytes));return {getBytes:()=>[...b],getDataAsString:()=>b.toString(),setName(){return this;},setContentType(){return this;}};};
const sandbox={console,ROSTER_ROOT:'roster',gsisRequireBackendRole_:()=>{},props_:()=>({getProperty:k=>props.get(k)||null,getProperties:()=>Object.fromEntries(props)}),ScriptApp:{getOAuthToken:()=> 'TEST-OAUTH'},Utilities:{newBlob:blob,ungzip:b=>blob(zlib.gunzipSync(Buffer.from(b.getBytes()))),base64Decode:s=>[...Buffer.from(s,'base64')],base64Encode:b=>Buffer.from(b).toString('base64'),computeDigest:(_a,b)=>[...crypto.createHash('sha256').update(Buffer.from(b)).digest()],DigestAlgorithm:{SHA_256:'SHA256'},getUuid:()=>crypto.randomUUID()},error_:(status,message)=>{throw Object.assign(Error(message),{status});},UrlFetchApp:{fetch(url,options={}){
 calls.push({url,method:options.method||'get'});const u=new URL(url),id=u.pathname.split('/').pop();
 if((options.method||'get')==='get'){
  if(u.searchParams.has('q')){const q=u.searchParams.get('q'),parent=/'([^']+)' in parents/.exec(q)?.[1],name=/name = '([^']+)'/.exec(q)?.[1];return response({files:[...files.values()].filter(f=>f.parents?.includes(parent)&&(!name||f.name===name)).map(f=>({id:f.id})),incompleteSearch:false});}
  const f=files.get(id);assert(f,'unknown file '+id);return u.searchParams.get('alt')==='media'?response({},f.bytes):response({...f,bytes:undefined});
 }
 if(u.pathname.includes('/upload/')){
  const boundary=/boundary=([^;]+)/.exec(options.contentType)[1],raw=Buffer.from(options.payload).toString(),sections=raw.split('--'+boundary),meta=JSON.parse(sections[1].split('\r\n\r\n')[1].trim()),encoded=sections[2].split('\r\n\r\n')[1].trim(),fileId='file'+next++;
  files.set(fileId,{id:fileId,...meta,bytes:Buffer.from(encoded,'base64'),version:'1'});return response({id:fileId,version:'1'});
 }
 const meta=JSON.parse(options.payload),fileId='folder'+next++;files.set(fileId,{id:fileId,...meta});return response({id:fileId});
}},LockService:{getScriptLock:()=>{throw Error('Writer must never acquire the Roster lock');}}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('backend/RosterDriveOutputs.gs','utf8'),sandbox);
const cfg={homeBaseFolderId:'home',folderId:'backups'},payload={schema:'gsis-roster-drive-backup-v1',tier:1,rows:[{scope:'roster',collection:'absences',record_id:'id:a',position:0,value_json:JSON.stringify({id:'a',reason:'restricted reason'})}],deleted:[],objects:[],counts:{'roster.absences':1}},raw=JSON.stringify(payload),digest=crypto.createHash('sha256').update(raw).digest('hex'),input={operation:'edgeDriveOutput',step:'writeBackup',config:cfg,date:'2026-11-06',name:'2026-11-06-tier1-full-r0-2-'+digest+'.json.gz',data:zlib.gzipSync(raw).toString('base64'),digest,counts:payload.counts,records:1};
assert.throws(()=>sandbox.rosterDriveOutputsDispatch_({input},false));
assert.throws(()=>sandbox.rosterDriveOutputsDispatch_({input:{...input,config:{...cfg,folderId:'outside'}}},true),/folder|home|Backups/i);
const saved=sandbox.rosterDriveOutputsDispatch_({input},true).result;assert.equal(saved.verified,true);assert.equal(saved.records,1);assert.equal(saved.digest,digest);
assert.equal(sandbox.rosterDriveOutputsDispatch_({input},true).result.fileId,saved.fileId,'idempotent immutable upload');
assert.throws(()=>sandbox.rosterDriveOutputsDispatch_({input:{...input,digest:'0'.repeat(64),name:input.name.replace(digest,'0'.repeat(64))}},true),/digest|verification/i);
assert.throws(()=>sandbox.rosterDriveOutputsDispatch_({input:{operation:'edgeDriveOutput',step:'readBackup',config:cfg,fileId:'frozen'}},true),/archive|frozen|output/i);
assert.equal(files.get('frozen').bytes.toString(),'{}');assert(!calls.some(c=>c.method==='patch'),'immutable writer never overwrites archive files');
console.log('signed output writer, fresh-start, home-base guard, immutable replay and readback pass');
