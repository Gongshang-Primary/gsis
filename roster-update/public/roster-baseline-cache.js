/* Immutable models and authorised timetable-only batch snapshots.
   Every reused batch is checked against the live manifest before display. */
(()=>{
 'use strict';
 let opening;
 const contentSchema=1;
 function open(){
  if(!opening)opening=new Promise(resolve=>{
   let settled=false,request;
   const finish=db=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);if(!db)opening=null;resolve(db);};
   const timer=setTimeout(()=>finish(null),500);
   try{
    request=indexedDB.open('gsis-roster-baselines',3);
    request.onupgradeneeded=()=>{for(const name of ['models','snapshots','contents','meta'])if(!request.result.objectStoreNames.contains(name)){const store=request.result.createObjectStore(name,{keyPath:['owner','id']});store.createIndex('owner','owner');}};
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};finish(db);};
    request.onerror=request.onblocked=()=>finish(null);
   }catch{finish(null);}
  });
  const request=opening;return request.then(db=>{if(!db&&opening===request)opening=null;return db;});
 }
 async function transaction(mode,work,name='models'){
  const db=await open();if(!db)return null;
  return new Promise(resolve=>{
   let tx,value=null,settled=false;
   const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);resolve(result);};
   const timer=setTimeout(()=>{try{tx?.abort();}catch{}finish(null);},500);
   try{tx=db.transaction(name,mode);tx.oncomplete=()=>finish(value);tx.onerror=tx.onabort=()=>finish(null);work(tx.objectStore(name),result=>value=result);}catch{finish(null);}
  });
 }
 function get(owner,id){return owner&&id?transaction('readonly',(store,done)=>{const req=store.get([owner,id]);req.onsuccess=()=>done(req.result?.model||null);}):Promise.resolve(null);}
 async function put(owner,id,model){
  if(!owner||!id||!model)return null;
  let bytes;try{bytes=JSON.stringify(model).length*2;}catch{return null;}if(bytes>32*1024*1024)return null;
  const db=await open();if(!db)return null;
  return new Promise(resolve=>{try{
   const tx=db.transaction(['models','meta'],'readwrite'),models=tx.objectStore('models'),meta=tx.objectStore('meta');tx.oncomplete=()=>resolve(true);tx.onerror=tx.onabort=()=>resolve(null);
   models.put({owner,id,model,savedAt:Date.now(),bytes});meta.put({owner,id:'legacy:'+id,modelId:id,bytes,savedAt:Date.now()});
   const req=meta.index('owner').getAll(owner);req.onsuccess=()=>{let total=0;for(const [i,row] of req.result.filter(r=>r.modelId).sort((a,b)=>b.savedAt-a.savedAt).entries()){total+=row.bytes||0;if(i>=8||total>32*1024*1024){models.delete([owner,row.modelId]);meta.delete([owner,row.id]);}}};
  }catch{resolve(null);}});
 }
 function removeOwner(owner){
  if(!owner)return Promise.resolve(null);
  return Promise.all(['models','snapshots','contents','meta'].map(name=>transaction('readwrite',store=>{const req=store.index('owner').openKeyCursor(owner);req.onsuccess=()=>{const cursor=req.result;if(!cursor)return;store.delete(cursor.primaryKey);cursor.continue();};},name)));
 }
 function retainOwner(owner){
  if(!owner)return Promise.resolve(null);
  return Promise.all(['models','snapshots','contents','meta'].map(name=>transaction('readwrite',store=>{const req=store.openKeyCursor();req.onsuccess=()=>{const cursor=req.result;if(!cursor)return;if(cursor.primaryKey[0]!==owner)store.delete(cursor.primaryKey);cursor.continue();};},name)));
 }
 function getSnapshot(owner,id){return owner&&id?transaction('readonly',(store,done)=>{const req=store.get([owner,id]);req.onsuccess=()=>{const row=req.result;done(row&&Date.now()-row.savedAt<2*86400000?row.envelope:null);};},'snapshots'):Promise.resolve(null);}
 function putSnapshot(owner,id,envelope){
  if(!owner||!id||!envelope||typeof envelope.data!=='string')return Promise.resolve(null);
  const bytes=envelope.data.length*2;if(bytes>32*1024*1024)return Promise.resolve(null);
  return transaction('readwrite',store=>{
   store.put({owner,id,envelope,savedAt:Date.now(),bytes});
   const req=store.index('owner').getAll(owner);req.onsuccess=()=>{let total=0;for(const [i,row] of req.result.sort((a,b)=>b.savedAt-a.savedAt).entries()){total+=row.bytes||0;if(i>=4||total>32*1024*1024||Date.now()-row.savedAt>=2*86400000)store.delete([owner,row.id]);}};
  },'snapshots');
 }
 function removeSnapshot(owner,id){return transaction('readwrite',store=>store.delete([owner,id]),'snapshots');}
 function removeSnapshots(owner,prefix,dates){return transaction('readwrite',store=>{const req=store.index('owner').openCursor(owner);req.onsuccess=()=>{const cursor=req.result;if(!cursor)return;const row=cursor.value;if(row.id.startsWith(prefix)&&(!dates||dates.some(date=>row.id.includes(date))))cursor.delete();cursor.continue();};},'snapshots');}
 // Payloads have immutable content keys. The small generation row is the only
 // pointer changed on promotion; a failed transaction leaves its predecessor.
 async function getGeneration(owner){
  if(!owner)return null;
  const db=await open();if(!db)return null;
  return new Promise(resolve=>{
   let result=null,tx;const invalidKeys=[];try{
    tx=db.transaction(['meta','contents'],'readonly');tx.oncomplete=()=>{if(invalidKeys.length)removeContents(owner,invalidKeys).then(()=>resolve(null));else resolve(result);};tx.onerror=tx.onabort=()=>resolve(null);
    const req=tx.objectStore('meta').get([owner,'generation']);req.onsuccess=()=>{
     const row=req.result;if(!row||row.schema!==contentSchema||!row.value)return;
     const value=row.value,needed=new Map();
     for(const stage of ['baseline','suspended'])for(const ref of value[stage]?.refs||[])needed.set(ref.key,null);
     if(!needed.size){result={...value};for(const stage of ['baseline','suspended'])if(value[stage])result[stage]={...value[stage],payload:{...value[stage].payload,[stage==='baseline'?'models':'plans']:[]}};return;}
     let remaining=needed.size,invalid=false;
     for(const key of needed.keys()){
      const read=tx.objectStore('contents').get([owner,key]);read.onsuccess=()=>{
       const content=read.result;if(!content||content.schema!==contentSchema||!content.value){invalid=true;invalidKeys.push(key);}else needed.set(key,content.value);
       if(--remaining||invalid)return;
       const restored={...value};
       for(const stage of ['baseline','suspended'])if(value[stage]){
        const part=value[stage],payload={...part.payload};
        payload[stage==='baseline'?'models':'plans']=part.refs.map(ref=>stage==='baseline'?{id:ref.id,contentKey:ref.contentKey,model:needed.get(ref.key)}:needed.get(ref.key));
        restored[stage]={...part,payload};delete restored[stage].refs;
       }
       result=restored;
      };
     }
    };
   }catch{resolve(null);}
  });
 }
 async function removeContents(owner,keys){
  const db=await open();if(!db)return;
  return new Promise(resolve=>{try{const tx=db.transaction(['contents','meta'],'readwrite');tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();for(const key of keys){tx.objectStore('contents').delete([owner,key]);tx.objectStore('meta').delete([owner,'content:'+key]);}}catch{resolve();}});
 }
 async function discardGeneration(owner){
  const db=await open();if(!db)return;
  return new Promise(resolve=>{try{const tx=db.transaction(['meta','contents'],'readwrite'),meta=tx.objectStore('meta');tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();const req=meta.get([owner,'generation']);req.onsuccess=()=>{for(const stage of ['baseline','suspended'])for(const ref of req.result?.value?.[stage]?.refs||[]){tx.objectStore('contents').delete([owner,ref.key]);meta.delete([owner,'content:'+ref.key]);}meta.delete([owner,'generation']);};}catch{resolve();}});
 }
 const generationInfo=value=>value?{checkedAt:value.checkedAt,role:value.role,from:value.baseline?.payload.from,baselineSourceKey:value.baseline?.sourceKey,suspendedSourceKey:value.suspended?.sourceKey}:null;
 // A late tab may advance a check only for the exact generation it read.
 const sameGeneration=(a,b)=>a===null||b===null?a===b:!!a&&!!b&&!!a.baselineSourceKey&&a.role===b.role&&a.from===b.from&&a.baselineSourceKey===b.baselineSourceKey&&a.suspendedSourceKey===b.suspendedSourceKey;
 async function commitGeneration(owner,value,expectedInfo){
  if(!owner||!value?.baseline)return false;
  const db=await open();if(!db)return false;
  let packed,contents=[];try{
   packed={...value};
   for(const stage of ['baseline','suspended'])if(value[stage]){
    const part=value[stage],payload={...part.payload},refs=[];
    for(const row of payload[stage==='baseline'?'models':'plans']||[]){
     const contentKey=stage==='baseline'?(payload.modelKeys?.[row.id]||row.contentKey||row.id):(payload.planKeys?.[row.date]||part.sourceKey+':'+row.date);
     const id=stage==='baseline'?row.id:row.date,key=(stage==='baseline'?'baseline:':'suspended:')+contentKey,item=stage==='baseline'?row.model:row;
     contents.push({owner,id:key,schema:contentSchema,value:item});refs.push({id,key,contentKey});
    }
    delete payload[stage==='baseline'?'models':'plans'];packed[stage]={...part,payload,refs};
   }
  }catch{return false;}
  return new Promise(resolve=>{
   let tx;try{
    tx=db.transaction(['contents','meta'],'readwrite');tx.oncomplete=()=>resolve(true);tx.onerror=tx.onabort=()=>resolve(false);
    const store=tx.objectStore('contents'),meta=tx.objectStore('meta');
    const old=meta.get([owner,'generation']);old.onsuccess=()=>{try{
     const current=generationInfo(old.result?.value);
     if(expectedInfo!==undefined?!sameGeneration(current,expectedInfo):current?.checkedAt>value.checkedAt&&!sameGeneration(current,generationInfo(value))){tx.abort();return;}
     for(const row of contents){const req=store.getKey([owner,row.id]);req.onsuccess=()=>{if(req.result!==undefined)return;try{
      // Unchanged immutable timetables need neither serialization nor cloning.
      const bytes=JSON.stringify(row.value).length*2;if(bytes>64*1024*1024){tx.abort();return;}
      store.put({...row,bytes});meta.put({owner,id:'content:'+row.id,contentId:row.id,bytes,savedAt:Date.now()});
     }catch{tx.abort();}};}
     if(old.result&&!sameGeneration(current,generationInfo(packed)))meta.put({...old.result,id:'previous-generation'});
     packed.checkedAt=Math.max(current?.checkedAt||0,packed.checkedAt||0);
     meta.put({owner,id:'generation',schema:contentSchema,value:packed,savedAt:Date.now()});
    }catch{tx.abort();}};
   }catch{try{tx?.abort();}catch{}resolve(false);}
  });
 }
 function getGenerationInfo(owner){return transaction('readonly',(store,done)=>{const req=store.get([owner,'generation']);req.onsuccess=()=>done(generationInfo(req.result?.value));},'meta');}
 function markChecked(owner,checkedAt,expectedInfo){return transaction('readwrite',store=>{const req=store.get([owner,'generation']);req.onsuccess=()=>{const row=req.result;if(row&&checkedAt>(row.value.checkedAt||0)&&(expectedInfo===undefined||sameGeneration(generationInfo(row.value),expectedInfo)))store.put({...row,value:{...row.value,checkedAt}});};},'meta');}
 async function pruneContents(owner){
  const db=await open();if(!db)return;
  return new Promise(resolve=>{try{
   const tx=db.transaction(['contents','meta'],'readwrite'),meta=tx.objectStore('meta'),contents=tx.objectStore('contents');tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();
   // Only small metadata rows are read. Keep current and previous generations.
   const req=meta.index('owner').getAll(owner);req.onsuccess=()=>{
    const rows=req.result,keep=new Set();for(const row of rows)if(['generation','previous-generation'].includes(row.id))for(const stage of ['baseline','suspended'])for(const ref of row.value?.[stage]?.refs||[])keep.add(ref.key);
    let bytes=rows.filter(r=>r.contentId&&keep.has(r.contentId)).reduce((n,r)=>n+(r.bytes||0),0),count=keep.size;
    for(const row of rows.filter(r=>r.contentId&&!keep.has(r.contentId)).sort((a,b)=>b.savedAt-a.savedAt)){bytes+=row.bytes||0;count++;if(bytes>64*1024*1024||count>128){contents.delete([owner,row.contentId]);meta.delete([owner,row.id]);}}
   };
  }catch{resolve();}});
 }
 window.RosterBaselineCache={get,put,removeOwner,retainOwner,getSnapshot,putSnapshot,removeSnapshot,removeSnapshots,getGeneration,getGenerationInfo,discardGeneration,commitGeneration,markChecked,pruneContents};
})();
