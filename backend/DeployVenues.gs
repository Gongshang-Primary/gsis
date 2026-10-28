function venuesDeployPublications_(b,idx){
 if(idx.pendingFieldCommit)venuesSourceError_(503,'VENUES_SOURCE_PENDING','Deploy has a pending publication or save.');
 const current=publishedEntry_(idx),entries=[...(idx.venuePublications||[]),...(current?[current]:[])],latest=new Map();
 for(const entry of entries){
  if(!entry?.id||!entry.commit||!Number.isInteger(entry.revision)||!Number.isFinite(Date.parse(entry.updatedAt)))venuesSourceError_(503,'VENUES_SOURCE_INVALID','Published Deploy metadata is incomplete.');
  if(entry.store?!/^published_/.test(entry.store):!Number.isInteger(entry.row)||!Number.isInteger(entry.parts)||entry.parts<1)venuesSourceError_(503,'VENUES_SOURCE_INVALID','The published Deploy reference has no immutable storage. Republish that version.');
  const old=latest.get(entry.id);if(!old||entry.revision>old.revision)latest.set(entry.id,entry);else if(entry.revision===old.revision&&entry.commit!==old.commit)venuesSourceError_(503,'VENUES_SOURCE_INVALID','Published Deploy revision is ambiguous.');
 }
 return [...latest.values()].map(entry=>{
  // Legacy frozen pointers predate effective dates in the index. Read only that
  // proven publication, never its editable counterpart in idx.versions.
  const d=entry.from!==undefined&&entry.to!==undefined?entry:document_(b,entry),from=d.from||'',to=d.to||'',valid=s=>/^20\d\d-\d\d-\d\d$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
  if(!valid(from)||!valid(to)||from>to)venuesSourceError_(503,'VENUES_SOURCE_INVALID','Published Deploy effective dates are missing or invalid.');
  return {entry,reference:{versionId:entry.id,revision:entry.revision,commit:entry.commit,updatedAt:entry.updatedAt,from,to}};
 }).sort((a,b)=>a.reference.from.localeCompare(b.reference.from)||a.reference.versionId.localeCompare(b.reference.versionId));
}
function venuesDeploySource_(envelope){
 gsisRequireBackendRole_('deploy');const input=venuesSourceReadInput_(venuesSourceAuthenticate_(envelope,'deploy'),['versionId','commit']);
 if(typeof deployEdgeFenced_==='function'&&deployEdgeFenced_())return deployEdgeForward_('venuesSource',input);
 const b=book_(),idx=index_(b),publications=venuesDeployPublications_(b,idx),references=publications.map(p=>p.reference),registry=readLandmarkRegistry_(),key=venuesSourceHash_({publications:references,physicalRooms:registry.venues});
 if(input.operation==='manifest')return venuesSourceResult_('deploy',key,input,{publications:references,registryWorkbookKey:registry.workbookKey});
 const selected=publications.find(p=>p.reference.versionId===input.versionId&&p.reference.commit===input.commit);if(!selected)venuesSourceError_(409,'VENUES_SOURCE_CHANGED','Choose a current published Deploy reference.');
 if(input.expectedKey!==key)venuesSourceError_(409,'VENUES_SOURCE_CHANGED','Published Deploy references changed. Refresh before trying again.');
 const rows=registry.venues;
 if(!Array.isArray(rows)||!rows.length)venuesSourceError_(503,'VENUES_SOURCE_INVALID','The published physical room register is unavailable.');
 if(rows.some(v=>!v||typeof v.unitNumber!=='string'||!v.unitNumber))venuesSourceError_(503,'VENUES_SOURCE_INVALID','The physical room register contains an invalid identity.');
 const venues=rows.filter(v=>v.active!=='N'&&v.active!==false).map(v=>({sourceId:'deploy:'+selected.reference.versionId+':'+v.unitNumber,unit:String(v.unitNumber||v.id||''),name:String(v.name||v.unitNumber||v.id||''),shortName:String(v.shortName||''),aliases:[...new Set([v.unitNumber||v.id,v.geometryUnit,v.name,v.shortName].filter(Boolean).map(String))],capacity:Number(v.capacity)||0}));
 if(venues.some(v=>!v.sourceId||!v.unit)||new Set(venues.map(v=>v.sourceId)).size!==venues.length||new Set(venues.map(v=>v.unit)).size!==venues.length)venuesSourceError_(503,'VENUES_SOURCE_INVALID','The physical room register contains an invalid identity.');
 const after=index_(b);if(after.pendingFieldCommit||venuesSourceHash_({publications:venuesDeployPublications_(b,after).map(p=>p.reference),physicalRooms:readLandmarkRegistry_().venues})!==key)venuesSourceError_(409,'VENUES_SOURCE_CHANGED','Deploy changed while preparing the room register.');
 return venuesSourceResult_('deploy',key,input,{publication:selected.reference,venues});
}
