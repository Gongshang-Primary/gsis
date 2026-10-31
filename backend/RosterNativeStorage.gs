/* Native readers follow an installed split manifest only. These helpers never
 * convert a live single document or select a backup as a fallback. */
function rosterNativeRead_(id,stages){
 const raw=rosterReadFile_(id);if(typeof rosterSplitAssemble_!=='function')return raw;
 // Callers keep source I/O, JSON parsing and split-part verification distinct.
 if(stages?.json)rosterStage_(stages.json);const root=JSON.parse(raw);
 if(root?.format!=='gsis-roster-operations-split-v1')return raw;
 if(stages?.parts)rosterStage_(stages.parts);return JSON.stringify(rosterSplitAssemble_(root,false,false).value);
}
function rosterNativeSplitWrite_(id,value,property){
 if(!id||typeof rosterSplitPrepareDocument_!=='function')return false;
 const root=JSON.parse(rosterReadFile_(id));if(root?.format!=='gsis-roster-operations-split-v1')return false;
 const prepared=rosterSplitPrepareDocument_(value,{folderId:root.folderId,previousId:id,name:'manifest.json'}),saved=prepared.commit();
 if(property)props_().setProperty(property,saved);return saved;
}
function rosterNativeReceiptMatches_(receipt,command,actor){
 if(receipt.actor!==actor)return false;
 if(!receipt.edgeDigest)return receipt.digest===rosterOperationsCommandDigest_(command);
 const value={...command};for(const key of ['calendarByDate','calendarCache','trustedNow','trustedIntakeAt','notificationsReady','schedulerAvailable'])delete value[key];
 const stable=v=>v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(stable):Object.fromEntries(Object.keys(v).sort().map(key=>[key,stable(v[key])]));
 const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(stable(value))).map(n=>(n&255).toString(16).padStart(2,'0')).join('');
 return receipt.edgeDigest===digest;
}
