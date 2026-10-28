/* Immutable, account-scoped occupancy. Bookings and permissions are never stored here. */
(function(global){
 'use strict';
 const DB='gsis-venues-v1',STORE='snapshots',MAX_BYTES=32000000;
 const transaction=(db,mode,work)=>new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);let value;try{value=work(store);}catch(e){tx.abort();reject(e);return;}tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error||Error('Cache unavailable'));tx.onabort=()=>reject(tx.error||Error('Cache unavailable'));});
 async function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('Cache is busy'));});}
 const get=(db,key)=>new Promise((resolve,reject)=>{const req=db.transaction(STORE).objectStore(STORE).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 function validateManifest(m){if(!m||m.schema!==1||!m.generation||!m.updatedAt||!/^\d{4}-\d{2}-\d{2}$/.test(m.from)||!/^\d{4}-\d{2}-\d{2}$/.test(m.to)||!Array.isArray(m.pieces)||!m.pieces.length||m.pieces.length>64)throw Error('The timetable package is incomplete.');const keys=new Set();for(const p of m.pieces){if(!p.key||keys.has(p.key)||!/^[a-f0-9]{64}$/.test(p.sha256)||p.encoding!=='gzip-base64-v1'||!Number.isInteger(p.bytes)||p.bytes<1||p.bytes>MAX_BYTES)throw Error('The timetable package is invalid.');keys.add(p.key);}}
 async function decode(meta,piece){
  if(!piece||piece.key!==meta.key||piece.encoding!==meta.encoding||piece.sha256!==meta.sha256||piece.bytes!==meta.bytes||typeof piece.data!=='string'||piece.data.length>MAX_BYTES*2)throw Error('The timetable package did not match its manifest.');
  let bytes;try{bytes=Uint8Array.from(atob(piece.data),c=>c.charCodeAt(0));}catch{throw Error('The timetable download could not be decoded.');}
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==meta.sha256)throw Error('The timetable download failed its integrity check.');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),reader=stream.getReader(),chunks=[];let length=0;
  for(;;){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>meta.bytes||length>MAX_BYTES){await reader.cancel();throw Error('The timetable download exceeded its declared size.');}chunks.push(r.value);}
  if(length!==meta.bytes)throw Error('The timetable download was incomplete.');const text=await new Blob(chunks).text();let data;try{data=JSON.parse(text);}catch{throw Error('The timetable download was not valid data.');}
  if(data.schema!==1||!Array.isArray(data.periods)||!Array.isArray(data.days)||!data.patterns||typeof data.patterns!=='object')throw Error('The timetable package has an unsupported format.');return data;
 }
 function merge(manifest,pieces){
  const periods=new Map(),days=new Map(),patterns=Object.create(null);
  for(const data of pieces){for(const p of data.periods){if(!p.id||!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.end>1440||p.start>=p.end)throw Error('Invalid period timing.');const prior=periods.get(p.id);if(prior&&JSON.stringify(prior)!==JSON.stringify(p))throw Error('Conflicting timetable periods.');periods.set(p.id,p);}
   for(const [id,rows]of Object.entries(data.patterns)){if(!Array.isArray(rows)||rows.some(r=>!r.venueId||!Number.isInteger(r.start)||!Number.isInteger(r.end)||r.start>=r.end||!['Timetable','Confirmed timetable'].includes(r.label)))throw Error('Invalid timetable occupancy.');const safe=rows.map(r=>{const names=r.staffNames===undefined?[]:r.staffNames;if(!Array.isArray(names)||names.length>200||names.some(name=>typeof name!=='string'||!name.trim()||name.length>200||/[\u0000-\u001f\u007f]/.test(name)))throw Error('Invalid occupying staff names.');return {venueId:r.venueId,start:r.start,end:r.end,sourceId:r.sourceId,kind:'timetable',label:r.label,staffNames:[...new Set(names.map(name=>name.trim().replace(/\s+/g,' ')))].sort()};});if(patterns[id]&&JSON.stringify(patterns[id])!==JSON.stringify(safe))throw Error('Conflicting timetable patterns.');patterns[id]=safe;}
   for(const d of data.days){if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||typeof d.covered!=='boolean'||d.date<manifest.from||d.date>manifest.to||days.has(d.date)||['venueIds','periodIds'].some(k=>d[k]!==undefined&&(!Array.isArray(d[k])||d[k].some(id=>typeof id!=='string'||!id)||new Set(d[k]).size!==d[k].length)))throw Error('Invalid timetable date coverage.');days.set(d.date,d);}
  }
  for(const d of days.values()){if(d.periodIds?.some(id=>!periods.has(id)))throw Error('A timetable date has an unknown period.');if(d.covered&&!Object.hasOwn(patterns,d.patternId))throw Error('A covered timetable date is missing its pattern.');}
  return {manifest,periods:[...periods.values()].sort((a,b)=>a.start-b.start),days:[...days.values()],patterns};
 }
 class Cache{
  constructor(actorId,db){this.actorId=actorId;this.db=db;this.active=null;this.pieces={};this.queue=Promise.resolve();}
  async load(){if(!this.db)return null;const record=await get(this.db,this.actorId);if(record){this.active=record.active;this.pieces=record.pieces||{};}return this.active;}
  activate(manifest,fetchPiece){const run=async()=>{validateManifest(manifest);if(this.active?.manifest.generation===manifest.generation&&this.active.manifest.updatedAt===manifest.updatedAt){this.active.manifest={...manifest};return this.active;}
   const parts={};for(const p of manifest.pieces)parts[p.sha256]=this.pieces[p.sha256]||await decode(p,await fetchPiece(p.key));
   const active=merge(manifest,manifest.pieces.map(p=>parts[p.sha256]));if(this.active&&Date.parse(manifest.updatedAt)<Date.parse(this.active.manifest.updatedAt))throw Error('An older timetable package was ignored.');
   if(this.db)await transaction(this.db,'readwrite',s=>s.put({active,pieces:parts},this.actorId));this.active=active;this.pieces=parts;return active;
  };const pending=this.queue.then(run);this.queue=pending.catch(()=>{});return pending;}
  async clear(){this.active=null;this.pieces={};if(this.db)await transaction(this.db,'readwrite',s=>s.clear());}
  static async open(actorId){if(!actorId)throw Error('Sign in before reading the timetable cache.');let db=null;try{db=await openDB();const previous=await get(db,'account');if(previous!==actorId)await transaction(db,'readwrite',s=>{s.clear();s.put(actorId,'account');});}catch{db=null;}const cache=new Cache(actorId,db);try{await cache.load();}catch{cache.active=null;}return cache;}
 }
 global.VenuesCache=Cache;
})(window);
