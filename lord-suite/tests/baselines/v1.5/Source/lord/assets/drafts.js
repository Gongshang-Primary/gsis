/* LORD v1.4: one device draft, scoped to its authenticated owner. Photos stay
   in IndexedDB. localStorage contains only a small recovery copy without photos. */
(function(root) {
  'use strict';
  const DB = 'lord_drafts_v1_4', STORE = 'drafts', KEY = 'current';
  const META = 'lord_draft_meta_v1_4', LEGACY = 'lord_mvp_draft_v1';
  const MAX_AGE = 24 * 60 * 60 * 1000;
  let database = null, opening = null, tail = Promise.resolve();
  function open() {
    if (database) return Promise.resolve(database);
    if (opening) return opening;
    opening = new Promise((resolve,reject) => {
      if (!root.indexedDB) { reject(new Error('Draft storage is unavailable.')); return; }
      const request = root.indexedDB.open(DB,1);
      let settled = false;
      const timer = setTimeout(() => { settled = true; opening = null; reject(new Error('Draft storage did not open.')); },4000);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
      request.onerror = () => { clearTimeout(timer); opening=null; reject(request.error || new Error('Draft storage failed.')); };
      request.onblocked = () => { clearTimeout(timer); settled=true; opening=null; reject(new Error('Close other LORD tabs before saving this draft.')); };
      request.onsuccess = () => {
        clearTimeout(timer);
        if (settled) { request.result.close(); return; }
        database = request.result;
        database.onversionchange = () => { database.close(); database=null; opening=null; };
        resolve(database);
      };
    });
    return opening;
  }
  async function transaction(mode, operation) {
    const db = await open();
    return new Promise((resolve,reject) => {
      let tx, result;
      try {
        tx = db.transaction(STORE,mode);
        const request = operation(tx.objectStore(STORE));
        if (request) request.onsuccess = () => { result=request.result; };
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(tx.error || new Error('Draft could not be saved.'));
      } catch(error) { reject(error); }
    });
  }
  function serial(operation) {
    const next = tail.then(operation,operation);
    tail = next.catch(() => {});
    return next;
  }
  function withoutPhotos(value) {
    if (Array.isArray(value)) return value.map(withoutPhotos);
    if (!value || typeof value !== 'object') return value;
    const output = {};
    Object.keys(value).forEach(key => { output[key] = /photoData$/i.test(key) ? '' : withoutPhotos(value[key]); });
    return output;
  }
  function current(record, owner) {
    return record && record.owner === owner && Number(record.savedAt) > 0 && Date.now() - Number(record.savedAt) <= MAX_AGE;
  }
  function save(snapshot, owner) {
    // Copy now, before asynchronous writes, so later form edits cannot change
    // an earlier queued save or resurrect a draft after Clear.
    const record = typeof structuredClone === 'function' ? structuredClone(snapshot) : JSON.parse(JSON.stringify(snapshot));
    record.owner=owner; record.savedAt=Date.now(); record.revision=crypto.randomUUID();
    return serial(async () => {
      let metadataSaved=false;
      try { localStorage.setItem(META,JSON.stringify({...withoutPhotos(record),photosOmitted:true})); metadataSaved=true; } catch {}
      try {
        await transaction('readwrite',store => store.put(record,KEY));
        try { localStorage.removeItem(LEGACY); } catch {}
        return {saved:true,photosSaved:true};
      } catch(error) { return {saved:metadataSaved,photosSaved:false,error:String(error.message || error)}; }
    });
  }
  function load(owner, teacher) {
    return serial(async () => {
      let record=null, fallback=null;
      try { record=await transaction('readonly',store => store.get(KEY)); } catch {}
      try { fallback=JSON.parse(localStorage.getItem(META) || 'null'); } catch {}
      if (fallback && fallback.cleared && (!record || fallback.savedAt >= record.savedAt)) return null;
      // Prefer a newer recovery copy if the latest full photo save failed.
      if (current(fallback,owner) && (!current(record,owner) || (fallback.revision !== record.revision && fallback.savedAt >= record.savedAt))) record=fallback;
      if (current(record,owner)) return record;
      try {
        const legacy=JSON.parse(localStorage.getItem(LEGACY) || 'null');
        if (legacy && legacy.identity && legacy.identity.teacher === teacher && Date.now()-Number(legacy.savedAt) <= MAX_AGE) {
          legacy.owner=owner;
          try { await transaction('readwrite',store=>store.put(legacy,KEY)); localStorage.removeItem(LEGACY); } catch {}
          return legacy;
        }
      } catch {}
      return null;
    });
  }
  function clear() {
    return serial(async () => {
      // A tombstone also prevents a stale IndexedDB draft returning if its
      // deletion fails while the small recovery store is still available.
      try { localStorage.setItem(META,JSON.stringify({cleared:true,savedAt:Date.now()})); localStorage.removeItem(LEGACY); } catch {}
      try { await transaction('readwrite',store=>store.delete(KEY)); return true; } catch { return false; }
    });
  }
  root.LordDraftStore=Object.freeze({save,load,clear,flush:()=>tail});
})(globalThis);
