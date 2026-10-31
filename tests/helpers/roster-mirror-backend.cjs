'use strict';
// Offline Apps Script host. Storage and identity boundaries remain the real
// production functions; only Drive, Properties and execution locks are fakes.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const Store=require('../../shared/edge-store.js');
module.exports=function mirrorBackend(){
 const files=new Map(),events=[],properties=new Map([['ROSTER_EDGE_AUTHORITY','d1'],['ROSTER_OPERATIONS_FILE','live-operations'],['ROSTER_INDEX_FILE','live-register']]);let next=0;
 const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
 const blob=raw=>{const bytes=Buffer.from(Array.isArray(raw)?raw:String(raw));return {getBytes:()=>[...bytes],getDataAsString:()=>bytes.toString()};};
 const writable=()=>{if(properties.get('ROSTER_EDGE_AUTHORITY')==='d1'&&!scope.rosterMirrorWriteAllowed_())throw Object.assign(Error('Google is fenced'),{status:409});};
 const scope={console,GSiSEdgeStore:Store,ROSTER_DATA:'data',
  GSISRosterOperations:{initial:()=>({schema:1,revision:0}),validateState:value=>value},gsisRequireBackendRole_:()=>{},rosterStage_:()=>{},
  Utilities:{newBlob:blob,getUuid:()=>crypto.randomUUID(),base64Decode:value=>[...Buffer.from(value,'base64')],base64Encode:value=>Buffer.from(value).toString('base64'),computeDigest:(_algorithm,value)=>[...crypto.createHash('sha256').update(Buffer.from(value)).digest()],DigestAlgorithm:{SHA_256:'SHA256'}},
  rosterNotificationOwner_:()=>({email:'owner@example.test',scriptId:'script'}),LockService:{getScriptLock:()=>({})},deployLock_:()=>true,deployUnlock_:()=>{},
  props_:()=>({getProperty:key=>properties.get(key)||null,getProperties:()=>Object.fromEntries(properties),setProperty:(key,value)=>properties.set(key,value),setProperties:values=>Object.entries(values).forEach(([key,value])=>properties.set(key,value)),deleteProperty:key=>properties.delete(key)}),
  rosterFindFile_:(parent,name)=>[...files].find(([,row])=>row.parent===parent&&row.name===name&&!row.trashed)?.[0]||null,
  rosterReadFile_:id=>{assert(files.has(id)&&!files.get(id).trashed,'missing '+id);return files.get(id).raw;},
  rosterCreateFile_:(parent,name,value)=>{writable();const id='file-'+ ++next;files.set(id,{parent,name,mimeType:'application/json',raw:value.getDataAsString(),bytes:Buffer.from(value.getBytes())});events.push({operation:'create',id,parent,name});return id;},
  rosterDriveJson_:value=>value,
  rosterDriveRequest_:(url,options={})=>{if(!options.method||options.method==='get'){const uri=new URL(url);if(uri.pathname.endsWith('/files')&&uri.searchParams.has('q')){const parent=/'([^']+)' in parents/.exec(uri.searchParams.get('q'))?.[1];return {files:[...files].filter(([,file])=>file.parent===parent&&!file.trashed).map(([id,file])=>({id,name:file.name,mimeType:file.mimeType}))};}const id=/\/files\/([^?]+)/.exec(url)[1],file=files.get(id);assert(file);return {getContent:()=>[...(file.bytes||Buffer.from(file.raw))],getContentText:()=>file.raw};}writable();const value=JSON.parse(options.payload);if(url.includes('/upload/')){const id=/\/files\/([^?]+)/.exec(url)[1];assert(files.has(id));files.get(id).raw=options.payload;events.push({operation:'update',id});return {id};}if(options.method==='patch'){const id=/\/files\/([^?]+)/.exec(url)[1];assert(files.has(id));Object.assign(files.get(id),value);events.push({operation:'patch',id});return {id};}const id='folder-'+ ++next;files.set(id,{parent:value.parents[0],name:value.name,mimeType:value.mimeType,raw:'{}'});return {id};},
  rosterEdgeAssertLegacyWrite_:()=>{if(properties.get('ROSTER_EDGE_AUTHORITY')==='d1')throw Object.assign(Error('Google is fenced'),{status:409});},
  error_:(status,message)=>{throw Object.assign(Error(message),{status});}
 };
 vm.createContext(scope);vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);vm.runInContext(fs.readFileSync('backend/RosterMirror.gs','utf8'),scope);
 const roster=fs.readFileSync('backend/Roster.gs','utf8');vm.runInContext(roster.slice(roster.indexOf('function rosterIndex_(){'),roster.indexOf('function rosterPublic_(')),scope);
 vm.runInContext(fs.readFileSync('backend/RosterNativeStorage.gs','utf8'),scope);
 scope.rosterOperationsPlanDigest_=hash;
 const call=input=>scope.rosterMirrorDispatch_({input},true).result;
 return {scope,files,events,properties,call};
};
