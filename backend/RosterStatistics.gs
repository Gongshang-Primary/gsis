/* Statistics has its own source stamp. Receipt, delivery and acknowledgement
   writes do not invalidate summaries. Cache eviction changes speed, not truth. */
function rosterStatisticsStamp_(state){
 const pick=(row,keys)=>keys.map(k=>row[k]??null);
 const absences=(state.absences||[]).map(r=>pick(r,['id','staffId','name','staffName','date','deletedAt','periods','coverage','periodSnapshot','timetablePending','typeLabel','reasonDetail','reportedAt','createdAt','updatedAt']));
 const periods=Object.entries(state.dailyPublicationStates||{}).map(([date,row])=>[date,row.periods||[]]).sort(([a],[b])=>a.localeCompare(b));
 return rosterOperationsPlanDigest_(JSON.stringify([1,absences,state.assignments||[],state.importedRelief||[],state.reliefCorrections||[],periods,state.statisticsArchive||{},state.statisticsTrackingFrom||null]));
}
function rosterStatisticsMarker_(){
 try{const row=JSON.parse(props_().getProperty('ROSTER_TIMETABLE_CACHE')||'null');return row?.schema===2&&row.statisticsReady===true&&/^[a-f0-9]{64}$/.test(row.statisticsSource)&&Number.isSafeInteger(row.statisticsRevision)?{source:row.statisticsSource,revision:row.statisticsRevision}:null;}catch(_){return null;}
}
function rosterStatisticsCache_(key,value){
 try{const cache=CacheService.getScriptCache(),name='roster-statistics-v2:'+key;if(value){const json=JSON.stringify(value);if(json.length<90000)cache.put(name,json,21600);return value;}const json=cache.get(name);return json?JSON.parse(json):null;}catch(_){return null;}
}
function rosterStatisticsSourceKey_(source,user,ctx,p){
 return rosterOperationsPlanDigest_(JSON.stringify([2,source,user.email,user.staffId,!!user.smc,!!user.admin,p.from,p.to,ctx.today,ctx.people.map(person=>[person.id,person.name,!!person.active])]));
}
/* Authorise first, then compare a small source marker before loading the
   operational document or calculating a full school-year projection. */
function rosterStatisticsRead_(req,c,p){
 p=p||req.input||{};
 const user=rosterOperationsAuthority_(c,req.identity);if(!user.smc&&!user.admin)error_(403,'Statistics is available to SMC and Admin only.');
 GSISRosterStatistics.range(p.from,p.to);
 const now=new Date(),ctx={user,people:c.rosterPeople||[],today:Utilities.formatDate(now,'Asia/Singapore','yyyy-MM-dd'),iso:now.toISOString()},marker=rosterStatisticsMarker_(),encoding=p.encoding==='gzip-base64-v1'&&typeof Utilities.gzip==='function'?'gzip-base64-v1':'json-v1';
 let key=marker?rosterStatisticsSourceKey_(marker.source,user,ctx,p):null;
 const unchanged=revision=>({schema:1,key,unchanged:true,checkedAt:ctx.iso,revision,today:ctx.today});
 if(key&&p.knownKey===key)return unchanged(marker.revision);
 if(key){const cached=rosterStatisticsCache_(key+':'+encoding);if(cached)return {...cached,checkedAt:ctx.iso,revision:marker.revision,today:ctx.today};}
 const state=rosterOperationsState_(true),source=rosterStatisticsStamp_(state);key=rosterStatisticsSourceKey_(source,user,ctx,p);
 // Missing/pending markers fall back to the durable document; a matching source
 // still avoids expensive accounting, joins and JSON/gzip projection work.
 if(p.knownKey===key)return unchanged(state.revision);
 const cached=rosterStatisticsCache_(key+':'+encoding);if(cached)return {...cached,checkedAt:ctx.iso,revision:state.revision,today:ctx.today};
 const value=GSISRosterStatistics.project(state,ctx,p),json=JSON.stringify(value),blob=Utilities.newBlob(json,'application/json'),bytes=blob.getBytes().length;
 if(bytes>12000000)error_(413,'This Statistics range has too many detailed records. Choose a shorter date range.');
 const result={schema:1,key,bytes,encoding,checkedAt:ctx.iso,revision:state.revision,today:ctx.today,data:encoding==='gzip-base64-v1'?Utilities.base64Encode(Utilities.gzip(blob).getBytes()):json};
 rosterStatisticsCache_(key+':'+encoding,result);return result;
}
