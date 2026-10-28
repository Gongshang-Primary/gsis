/* Independent Layout repository. Immutable chunks, then one verified head pointer. */
const LAYOUT_REPOSITORY_2026_ID='1SzoUIR57eAAtXWcjCiVfiv08dpk72xhPkjd60CKhYAU';
const layoutSchemas_={
 layout_venues:['Venue ID','Unit','Geometry unit','Venue','Abbreviation','Block','Floor','Capacity','Active','Source locator'],
 layout_classes:['Class ID','Class','Level','Name','Short name','Active'],
 layout_tgs:['TG ID','TG','Level','Subject','Teacher labels','Pupils','Pupil text','Programme notes','Source venue text','Active','Source locator','Review notes'],
 layout_allocations:['Allocation ID','Kind','Target ID','Class or TG','Unit','Active','Source','Source locator','Notes'],
 layout_tg_pupils:['Breakdown ID','TG ID','TG','Form class','Pupils','Source locator']
};
function layoutRepositoryId_(year,create){
 const map=JSON.parse(props_().getProperty('LAYOUT_REPOSITORIES')||'{}');map['2026']=map['2026']||LAYOUT_REPOSITORY_2026_ID;
 if(!map[year]&&create){gsisRequireBackendRole_('deploy');const b=SpreadsheetApp.create('GSiS Layout Local Repository '+year);map[year]=b.getId();props_().setProperty('LAYOUT_REPOSITORIES',JSON.stringify(map));}
 if(!map[year])error_(404,'No owned Layout repository is configured for '+year+'.');return map[year];
}
function layoutSheet_(b,name,header){
 let s=b.getSheetByName(name);if(!s){gsisRequireBackendRole_('deploy');s=b.insertSheet(name);s.getRange(1,1,1,header.length).setValues([header]);s.setFrozenRows?.(1);}
 const actual=GSISSheets.read(s,1,1,1,header.length)[0];if(JSON.stringify(actual)!==JSON.stringify(header))error_(409,'Layout '+name+' headers changed. Restore them before saving.');return s;
}
function layoutHead_(b,year,create){
 const header=['Year','Head JSON','Handoff JSON'];const s=create?layoutSheet_(b,'layout_index',header):b.getSheetByName('layout_index');
 if(!s)error_(503,'Run prepareLayoutRepository501() in the Deploy Apps Script editor first.');
 const rows=s.getLastRow()>1?GSISSheets.read(s,2,1,s.getLastRow()-1,3):[],matches=rows.map((r,i)=>({row:i+2,values:r})).filter(r=>Number(r.values[0])===year);
 const meta=b.getSheetByName('layout_meta'),metaYear=meta&&GSISSheets.read(meta,1,1,meta.getLastRow(),2).find(r=>r[0]==='year')?.[1];
 if(metaYear&&Number(metaYear)!==year||rows.some(r=>r[0]!==''&&Number(r[0])!==year))error_(409,'This Layout workbook belongs to a different year. Use a separate year repository.');
 if(matches.length>1)error_(409,'Duplicate Layout year pointer. Administrator review required.');
 let match=matches[0];if(!match){if(!create)error_(503,'Layout '+year+' has no verified snapshot.');match={row:s.getLastRow()+1,values:[year,'','']};s.getRange(match.row,1,1,3).setValues([match.values]);}
 return {sheet:s,row:match.row,head:match.values[1]?JSON.parse(match.values[1]):null,handoff:match.values[2]?JSON.parse(match.values[2]):null};
}
function layoutRead_(b,year,knownPointer){
 const pointer=knownPointer||layoutHead_(b,year,false),h=pointer.head;if(!h)error_(503,'Layout '+year+' has no verified snapshot.');
 const s=b.getSheetByName('layout_snapshots');if(!s||!Number.isInteger(h.row)||!Number.isInteger(h.parts)||h.parts<1||h.parts>200)error_(503,'Layout snapshot marker needs review.');
 const rows=GSISSheets.read(s,h.row,1,h.parts,4);let json='';
 rows.forEach((r,i)=>{if(Number(r[0])!==year||r[1]!==h.revision||Number(r[2])!==i+1||typeof r[3]!=='string')error_(503,'Layout snapshot is incomplete.');json+=r[3];});
 if(hash_(json)!==h.sha256)error_(503,'Layout snapshot checksum differs.');const snapshot=GSISLayoutData.validate(JSON.parse(json));
 if(snapshot.year!==year||snapshot.revision!==h.revision)error_(503,'Layout snapshot year / revision differs.');
 const after=layoutHead_(b,year,false);if(JSON.stringify(after.head)!==JSON.stringify(h))error_(503,'Layout was just updated. Retry shortly.');
 return {snapshot,head:h,handoff:after.handoff};
}
function layoutRows_(s){return {
 layout_venues:s.venues.map(v=>[v.id,v.unitNumber,v.geometryUnit||v.unitNumber,v.name,v.shortName||'',v.block,v.floor??v.level,v.capacity??'',v.active,v.sourceLocator||'']),
 layout_classes:s.classes.map(c=>[c.id,c.code,c.level,c.name||c.code,c.shortName,c.active]),
 layout_tgs:s.groups.map(g=>[g.id,g.code,GSISVenueGroups.levels(g).length>1?GSISVenueGroups.levelLabel(g):g.level,g.subject,g.teacherLabels||'',g.pupilCount??'',g.pupilCountText||'',g.programmes||'',g.sourceVenueText||'',g.active,g.sourceLocator||'',g.notes||'']),
 layout_allocations:s.allocations.map(a=>[a.id,a.kind,a.targetId,a.targetLabel,a.unitNumber,a.active,a.sourceId||'',a.sourceLocator||'',a.notes||'']),
 layout_tg_pupils:(s.pupilBreakdown||[]).map(p=>[p.id,p.groupId,p.groupCode,p.formClass,p.pupils,p.sourceLocator||''])
};}
var layoutTableReadState_=new WeakMap();
function layoutMirror_(b,s){gsisRequireBackendRole_('deploy');
 const tables=layoutRows_(s),blocks=[],entries=[];
 for(const [name,rows]of Object.entries(tables)){let sheet=b.getSheetByName(name);if(!sheet){sheet=b.insertSheet(name);sheet.getRange(1,1,1,layoutSchemas_[name].length).setValues([layoutSchemas_[name]]);}
  const max=sheet.getMaxRows();if(max<rows.length+1)sheet.insertRowsAfter(max,rows.length+1-max);
  entries.push({sheet,row:1,col:1,height:Math.max(1,sheet.getLastRow()),width:layoutSchemas_[name].length,name,rows});
 }
 const prior=layoutTableReadState_.get(s)||{},missing=entries.filter(e=>!prior[e.name]),read=GSISSheets.readAcross(b,missing,false),observed=entries.map(e=>prior[e.name]||read[missing.indexOf(e)]);
 entries.forEach((e,i)=>{if(JSON.stringify(observed[i][0])!==JSON.stringify(layoutSchemas_[e.name]))error_(409,'Layout '+e.name+' headers changed. Restore them before saving.');const writes=[];
  for(let row=0;row<Math.max(e.rows.length,observed[i].length-1);row++){const values=(e.rows[row]||Array(e.width).fill('')).map(v=>!GSISSheets.enabled()&&typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:v),old=observed[i][row+1]||[];if(values.every((v,c)=>String(v??'')===String(old[c]??'')))continue;const prior=writes[writes.length-1];if(prior&&prior.row+prior.values.length===row+2)prior.values.push(values);else writes.push({row:row+2,col:1,values:[values]});}
  if(writes.length)blocks.push({sheet:e.sheet,writes});
 });
 const meta=layoutSheet_(b,'layout_meta',['Key','Value']),rows=GSISSheets.read(meta,1,1,meta.getLastRow(),2),values={repository:'Layout local repository',schema_version:1,year:s.year,revision:s.revision,state:s.state,frontend_integration:'v0.6.04',other_tg_status:s.otherTGStatus||'',source_deploy_id:s.sourceDeployVersion?.id||'',source_deploy_revision:s.sourceDeployVersion?.revision||'',source_deploy_commit:s.sourceDeployVersion?.commit||''},writes=[];
 for(const [key,value]of Object.entries(values)){const at=rows.findIndex(r=>r[0]===key);if(at>=0){if(String(rows[at][1])!==String(value))writes.push({row:at+1,col:2,values:[[value]]});}else{rows.push([key,value]);writes.push({row:rows.length,col:1,values:[[key,value]]});}}
 if(writes.length)blocks.push({sheet:meta,writes});GSISSheets.write(b,blocks);if(!GSISSheets.enabled())deployFlush_();
}
function layoutStore_(b,snapshot){gsisRequireBackendRole_('deploy');
 GSISLayoutData.validate(snapshot);const index=layoutHead_(b,snapshot.year,true);
 if(index.head?.revision===snapshot.revision){const prior=layoutRead_(b,snapshot.year).snapshot;if(hash_(JSON.stringify(prior))!==hash_(JSON.stringify(snapshot)))error_(409,'Layout revision content differs.');if(!index.head.verified504)layoutMirror_(b,prior);return index.head;}
 const sheet=layoutSheet_(b,'layout_snapshots',['Year','Revision','Part','JSON']),json=JSON.stringify(snapshot),parts=Math.ceil(json.length/30000);
 const staging=layoutSheet_(b,'layout_staging',['Year','Revision','Marker JSON']),markers=staging.getLastRow()>1?GSISSheets.read(staging,2,1,staging.getLastRow()-1,3):[];
 const previous=markers.filter(r=>Number(r[0])===snapshot.year&&r[1]===snapshot.revision);if(previous.length>1)error_(409,'Duplicate Layout staging marker.');
 let marker=previous.length?JSON.parse(previous[0][2]):null;
 if(marker&&(marker.sha256!==hash_(json)||marker.parts!==parts))error_(409,'The pending Layout snapshot differs. Finish its publication before changing owned data.');
 if(!marker){const row=Math.max(sheet.getLastRow()+1,...markers.map(r=>{const m=JSON.parse(r[2]);return m.row+m.parts;}));marker={row,parts,sha256:hash_(json)};staging.getRange(staging.getLastRow()+1,1,1,3).setValues([[snapshot.year,snapshot.revision,JSON.stringify(marker)]]);deployFlush_();}
 const row=marker.row;
 if(sheet.getMaxRows()<row+parts)sheet.insertRowsAfter(sheet.getMaxRows(),row+parts-sheet.getMaxRows());
 // A durable staging locator reserves one range per revision. Retry uses that
 // range after an interrupted byte/table write, without appending another copy.
 GSISSheets.write(b,[{sheet,writes:[{row,col:1,values:Array.from({length:parts},(_,i)=>[snapshot.year,snapshot.revision,i+1,json.slice(i*30000,(i+1)*30000)])}]}]);deployFlush_();
 const read=GSISSheets.read(sheet,row,1,parts,4);if(read.some((r,i)=>Number(r[0])!==snapshot.year||r[1]!==snapshot.revision||Number(r[2])!==i+1)||hash_(read.map(r=>r[3]).join(''))!==hash_(json))error_(503,'Layout staging readback differs. The previous snapshot remains active.');
 const head={verified504:true,year:snapshot.year,revision:snapshot.revision,row,parts,sha256:hash_(json),publication:snapshot.sourceDeployVersion||null,previous:index.head?.revision||null};
 // Editable tables can be repaired from the immutable snapshot after interruption.
 // The public head changes only after every table write and staging readback passes.
 layoutMirror_(b,snapshot);index.sheet.getRange(index.row,2).setValue(JSON.stringify(head));deployFlush_();
 const observed=layoutHead_(b,snapshot.year,false).head;if(JSON.stringify(observed)!==JSON.stringify(head))error_(503,'Layout head confirmation failed. Retry the same publication.');return head;
}
function layoutCounts_(s){return {venues:s.venues.filter(v=>v.active==='Y').length,classes:s.classes.filter(v=>v.active==='Y').length,groups:s.groups.filter(v=>v.active==='Y').length,allocations:s.allocations.filter(v=>v.active==='Y').length};}
function layoutAdminTables_(b,current,initial){
 const next=JSON.parse(JSON.stringify(current)),matrices=layoutRows_(current),observed={};
 for(const [name,expected] of Object.entries(matrices)){
  if(initial&&name==='layout_classes'&&!b.getSheetByName(name))continue;
  const sheet=layoutSheet_(b,name,layoutSchemas_[name]),rows=sheet.getLastRow()>1?GSISSheets.read(sheet,2,1,sheet.getLastRow()-1,layoutSchemas_[name].length):[];
  observed[name]=[layoutSchemas_[name],...rows];
  const nonempty=rows.filter(r=>r.some(v=>v!=='')),by=new Map(nonempty.map(r=>[r[0],r]));
  if(by.size!==expected.length||by.size!==nonempty.length||expected.some(r=>!by.has(r[0])))error_(409,'Layout '+name+' records / IDs differ. Mark Active N instead of removing rows.');
  const allowed=initial?[]:name==='layout_tgs'?[4,5,6,7,9,11]:name==='layout_venues'?[8]:name==='layout_classes'?[5]:name==='layout_allocations'?[5]:[];
  for(const values of expected){const actual=by.get(values[0]);for(let i=0;i<values.length;i++)if(!allowed.includes(i)&&String(actual[i])!==String(values[i]))error_(409,'Layout '+name+' published/source column changed. Venue changes require a Deploy edit and republication.');
   if(name==='layout_venues')next.venues.find(v=>v.id===values[0]).active=actual[8];
   if(name==='layout_classes')next.classes.find(v=>v.id===values[0]).active=actual[5];
   if(name==='layout_allocations')next.allocations.find(v=>v.id===values[0]).active=actual[5];
   if(name==='layout_tgs'){const g=next.groups.find(g=>g.id===values[0]);Object.assign(g,{teacherLabels:String(actual[4]),pupilCount:actual[5]===''?null:Number(actual[5]),pupilCountText:String(actual[6]),programmes:String(actual[7]),active:actual[9],notes:String(actual[11])});if(g.pupilCount!==null&&(!Number.isSafeInteger(g.pupilCount)||g.pupilCount<0))error_(400,'Invalid TG pupil count.');}
  }
 }
 GSISLayoutData.validate(next);layoutTableReadState_.set(next,observed);return next;
}
function prepareLayoutRepository501(){gsisRequireBackendRole_('deploy');
 const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Another save is finishing.');
 try{const b=SpreadsheetApp.openById(layoutRepositoryId_(2026,false)),index=layoutHead_(b,2026,true);if(index.head){const s=layoutRead_(b,2026).snapshot;return {ready:true,unchanged:true,year:2026,revision:s.revision,...layoutCounts_(s)};}
  const s=layoutAdminTables_(b,GSIS_LAYOUT_SEED_2026,true);s.frontendIntegration='v0.5.01';layoutStore_(b,s);return {ready:true,year:2026,revision:s.revision,...layoutCounts_(s)};
 }finally{deployUnlock_(lock);}
}
function saveLayoutAdmin501(year){gsisRequireBackendRole_('deploy');
 year=Number(year||props_().getProperty('LAYOUT_YEAR')||2026);const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Another save is finishing.');
 try{const b=SpreadsheetApp.openById(layoutRepositoryId_(year,false)),read=layoutRead_(b,year);if(read.handoff?.status==='pending')error_(409,'Finish the pending Layout publication before committing owned Admin changes.');const current=read.snapshot,next=layoutAdminTables_(b,current,false);if(hash_(next)===hash_(current))return {saved:true,unchanged:true,year,revision:current.revision};next.previousRevision=current.revision;next.revision=year+'-admin-'+Utilities.getUuid();layoutStore_(b,next);return {saved:true,year,revision:next.revision,...layoutCounts_(next)};}finally{deployUnlock_(lock);}
}
function repairLayoutTables501(year){gsisRequireBackendRole_('deploy');year=Number(year||props_().getProperty('LAYOUT_YEAR')||2026);const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Another save is finishing.');try{const b=SpreadsheetApp.openById(layoutRepositoryId_(year,false)),s=layoutRead_(b,year).snapshot;layoutMirror_(b,s);return {ready:true,year,revision:s.revision};}finally{deployUnlock_(lock);}}
function publicLayout_(p={}){
 const year=Number(p.year||props_().getProperty('LAYOUT_YEAR')||2026);if(!Number.isInteger(year)||year<2000||year>2099)error_(400,'Invalid Layout year.');
 const b=SpreadsheetApp.openById(layoutRepositoryId_(year,false)),pointer=layoutHead_(b,year,false),head=pointer.head,registry=liveLandmarkRegistry_(),cursor=head?.revision+(registry?':'+registry.revision:'');
 // The caller already owns this verified immutable publication. A changed
 // head always takes the full checksum/shape path; handoff state stays live.
 if(head?.verified504&&head.year===year&&cursor===p.since&&Number.isInteger(head.row)&&Number.isInteger(head.parts)&&head.parts>0&&head.parts<=200&&/^[a-f0-9]{64}$/.test(head.sha256))return {unchanged:true,cursor,handoff:pointer.handoff};
 const current=layoutRead_(b,year,pointer),view=GSISLayoutData.publicView(current.snapshot);
 if(registry){const rooms=new Map(registry.venues.map(v=>[v.unitNumber,v]));view.venues=view.venues.map(v=>{const room=rooms.get(v.unitNumber);return room?{...v,name:room.name,shortName:room.shortName||'',capacity:room.capacity??null,block:room.block,level:room.level}:v;});view.registryRevision=registry.revision;view.layoutRevision=view.layoutRevision+':'+registry.revision;view.cursor=view.layoutRevision;}
 view.handoff=current.handoff;if(p.since===view.cursor)return {unchanged:true,cursor:view.cursor,handoff:view.handoff};return view;
}
function layoutPublicationIntent_(d,entry){
 try{return {status:'pending',year:GSISLayoutData.year(d),versionId:d.id,revision:entry.revision,commit:entry.commit};}
 catch(e){return {status:'needs-year',versionId:d.id,revision:entry.revision,commit:entry.commit,message:e.message};}
}
function syncLayoutPublication_(b,idx){gsisRequireBackendRole_('deploy');
 const job=idx.layoutHandoff,entry=publishedEntry_(idx);if(!job||job.commit!==entry?.commit)return {status:'not-requested'};
 if(job.status==='needs-year')return job;let repository;
 try{
  repository=SpreadsheetApp.openById(layoutRepositoryId_(job.year,true));const pointer=layoutHead_(repository,job.year,true);
  if(pointer.head?.verified504&&pointer.head.publication?.commit===job.commit&&pointer.handoff?.status==='complete'&&pointer.handoff.commit===job.commit){const done=pointer.handoff;if(job.status!=='complete'){idx.layoutHandoff=done;fieldIndexWrite_(b,idx);}return done;}
  pointer.sheet.getRange(pointer.row,3).setValue(JSON.stringify({...job,status:'pending'}));deployFlush_();
  if(job.year===2026&&!pointer.head)error_(503,'Prepare the 2026 Layout seed before transferring a publication.');
  const old=pointer.head?layoutRead_(repository,job.year).snapshot:GSISLayoutData.empty(job.year);
  const published=document_(b,entry);if(GSISLayoutData.year(published)!==job.year)error_(409,'Layout publication year differs.');
  const s=GSISLayoutData.publication(old,published,entry,(kind,key)=>'layout-'+hash_([job.year,kind,key]).slice(0,32));layoutStore_(repository,s);
  const done={...job,status:'complete',layoutRevision:s.revision};pointer.sheet.getRange(pointer.row,3).setValue(JSON.stringify(done));deployFlush_();
  idx.layoutHandoff=done;fieldIndexWrite_(b,idx);return done;
 }catch(e){
  const pending={...job,status:'pending',message:'Layout transfer is pending. The last verified copy remains displayed. Retry publication or run retryLayoutPublication501().'};
  console.error('Layout publication handoff',{year:job.year,commit:job.commit,error:String(e.message).slice(0,300)});
  if(repository)try{const pointer=layoutHead_(repository,job.year,true);pointer.sheet.getRange(pointer.row,3).setValue(JSON.stringify(pending));deployFlush_();}catch(ignore){}
  idx.layoutHandoff=pending;try{fieldIndexWrite_(b,idx);}catch(ignore){}return pending;
 }
}
function retryLayoutPublication501(){gsisRequireBackendRole_('deploy');const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Another save is finishing.');try{const b=book_(),idx=fieldRecover_(b);return syncLayoutPublication_(b,idx);}finally{deployUnlock_(lock);}}
