const {ctx}=require('./storage.cjs'),vm=require('vm');
vm.runInContext(`
{
 const assert=(ok,msg)=>{if(!ok)throw Error(msg)},fresh=()=>document_(book_(),index_(book_()).versions.find(x=>x.id===planningId));
 const original=JSON.parse(JSON.stringify(fresh())),activeBefore=JSON.stringify(document_(book_(),publishedEntry_(index_(book_()))));
 const request={operation:'saveVersionNote',versionId:planningId,notes:'Only this version note',expected:original.notes||'',requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'notes'};
 const result=call('change',request),after=fresh();assert(result.saved&&result.versionId===planningId,'Save confirmation');assert(after.notes===request.notes,'Note missing');
 for(const k of Object.keys(original).filter(k=>!['notes','audit','saveReceipts'].includes(k)))assert(JSON.stringify(after[k])===JSON.stringify(original[k]),'Unrelated field changed: '+k);
 assert(JSON.stringify(document_(book_(),publishedEntry_(index_(book_()))))===activeBefore,'Published snapshot changed');
 const revision=index_(book_()).revision,again=call('change',request);assert(again.duplicate&&index_(book_()).revision===revision,'Retry wrote twice');
 const bad=(input,status)=>{let e;try{call('change',input)}catch(x){e=x}assert(e?.status===status,'Expected '+status+', got '+e?.message);};
 bad({...request,notes:'Different payload'},409);
 bad({...request,requestId:Utilities.getUuid(),notes:'Stale note'},409);
 bad({...request,requestId:Utilities.getUuid(),expected:after.notes,notes:'x'.repeat(4001)},400);
 const lease=call('lease',{versionId:planningId,key:'meta',clientId:'other'});
 bad({...request,requestId:Utilities.getUuid(),expected:after.notes},423);
 call('lease',{versionId:planningId,key:'meta',clientId:'other',release:true});
 const roles=c.user.roles;
 try{c.user.roles=['Teacher'];bad({...request,requestId:Utilities.getUuid(),expected:after.notes},403);
 c.user.roles=['KP'];const cleared=call('change',{...request,requestId:Utilities.getUuid(),notes:'',expected:after.notes});assert(cleared.saved&&fresh().notes==='','KP cannot clear note');}finally{c.user.roles=roles;}
 assert(call('receipt',{versionId:planningId,requestId:request.requestId}).saved,'Lost receipt');
 console.log('PASS Q42 note-only persistence, frozen publication, idempotent retries, conflicts, length, leases and roles');
}
`,ctx);
