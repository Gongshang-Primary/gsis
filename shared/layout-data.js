/* Layout owns these records. Only an explicit published snapshot updates Deploy fields. */
var GSISLayoutData=(function(){
 'use strict';
 const tg=()=>typeof GSISVenueGroups!=='undefined'?GSISVenueGroups:require('./venue-groups.js');
 const copy=x=>JSON.parse(JSON.stringify(x)),on=x=>x.active!=='N'&&x.active!==false,text=x=>String(x??'').trim();
 function year(d){
  const values=[d.layoutYear,d.year,...[d.name,d.from,d.to].flatMap(s=>text(s).match(/\b20\d{2}\b/g)||[])].filter(x=>x!==undefined&&x!==null&&x!=='').map(Number);
  const years=[...new Set(values)];
  if(years.length!==1||!Number.isInteger(years[0])||years[0]<2000||years[0]>2099)throw Error('Set one unambiguous year in the Deploy version name before transferring to Layout.');
  return years[0];
 }
 const unit=r=>r.id==='D1-06B'&&r.name==='Pump Room'?'D1-06C':text(r.unitNumber||r.id);
 const classCode=c=>{const short=text(c.shortName||c.name?.[0]);return text(c.code||String(c.level)+(short.startsWith(String(c.level))?short.slice(String(c.level).length):short));};
 const groupCode=g=>text(g.code||g.name);
 const groupKey=g=>[tg().levels(g).join(','),text(g.subject).toUpperCase(),groupCode(g).toUpperCase()].join('|');
 function validate(s){
  if(s.schemaVersion!==1||s.repository!=='layout-current'||!Number.isInteger(s.year)||!s.revision)throw Error('Invalid Layout snapshot metadata.');
  for(const key of ['venues','classes','groups','allocations']){
   if(!Array.isArray(s[key]))throw Error('Missing Layout '+key+'.');const ids=new Set();
   for(const row of s[key]){if(!row.id||ids.has(row.id)||!['Y','N'].includes(row.active))throw Error('Invalid or duplicate Layout '+key+' ID / Active.');ids.add(row.id);}
  }
  const units=new Set(),targets=new Map([...s.classes,...s.groups].map(r=>[r.id,r]));
  for(const v of s.venues){if(!/^[A-Z]\d+-[A-Z0-9]+$/.test(v.unitNumber)||units.has(v.unitNumber))throw Error('Invalid or duplicate Layout unit '+v.unitNumber);units.add(v.unitNumber);}
  for(const a of s.allocations)if(on(a)&&(!units.has(a.unitNumber)||!targets.has(a.targetId)||!['homeroom','teaching_group'].includes(a.kind)))throw Error('Unknown Layout allocation target / unit: '+a.targetLabel);
  return s;
 }
 function empty(y){return {schemaVersion:1,repository:'layout-current',year:y,revision:'empty-'+y,state:'empty',sourceDeployVersion:null,sources:[],venues:[],classes:[],groups:[],allocations:[],pupilBreakdown:[],sourceUsage:[],sourceSummaries:[],issues:[]};}
 function merge(old,incoming,key,id,retained){
  const rows=old.map(copy),by=new Map(rows.map(r=>[key(r),r])),seen=new Set();
  for(const value of incoming){const k=key(value);if(seen.has(k))throw Error('Ambiguous published Layout identity: '+k);seen.add(k);let row=by.get(k);
   if(!row){row={id:id(k),...copy(value)};rows.push(row);by.set(k,row);}else Object.assign(row,value);
   row.active='Y';
  }
  for(const row of rows)if(!seen.has(key(row))&&!retained?.(row))row.active='N';
  return rows;
 }
 function publication(previous,d,entry,makeId){
  const y=year(d);if(previous.year!==y)throw Error('Layout year differs from the published Deploy version.');
  if(!entry.commit||entry.id!==d.id||!Number.isInteger(entry.revision))throw Error('A completed Deploy publication is required.');
  if(previous.sourceDeployVersion?.commit===entry.commit)return copy(previous);
  const out=copy(previous),provenance={id:d.id,name:d.name,year:y,revision:entry.revision,commit:entry.commit},sourceId='deploy:'+entry.commit;
  const reg=d.venueRegistry?.venues||d.venues||[],venueRows=reg.filter(on).map(r=>{
   const n=unit(r),match=n.match(/^([A-Z])(\d+)-/);return {unitNumber:n,geometryUnit:d.unitGeometry?.[n]||r.geometryUnit||n,name:text(r.name)||n,shortName:text(r.shortName),block:r.block||match?.[1],floor:Number(r.floor??r.level??match?.[2]),capacity:r.capacity??null,publication:provenance};
  });
  out.venues=merge(out.venues,venueRows,r=>r.unitNumber,k=>makeId('venue',k));
  out.classes=merge(out.classes,(d.classes||[]).filter(on).map(c=>({code:classCode(c),name:text(c.name),shortName:text(c.shortName),level:Number(c.level),deployId:classCode(c),publication:provenance})),classCode,k=>makeId('class',k));
  const mtl=r=>r.sourceId==='mtl_allocation_'+y;
  const teachers=new Map((d.teachers||[]).map(t=>[t.id,text(t.name)]));
  const publishedGroups=(d.groups||[]).filter(on).map(g=>{
   const original=out.groups.find(r=>mtl(r)&&(groupKey(r)===groupKey(g)||r.deployId===g.id&&r.publication?.id===d.id));
   const base={code:groupCode(g),level:Number(g.level),levels:tg().levels(g),weeklyPeriods:g.weeklyPeriods??null,subject:text(g.subject),deployId:g.id,publication:provenance};
   if(original)return {...copy(original),...base}; // MTL teacher and pupil evidence remains authoritative.
   return {...base,teacherLabels:[...new Set((d.assignments||[]).filter(a=>a.target===g.id).map(a=>teachers.get(a.teacher)).filter(Boolean))].join(', '),teacherIds:[],pupilCount:null,pupilCountText:'',programmes:'',sourceId,sourceLocator:'Published TG '+g.id,notes:''};
  });
  for(const g of publishedGroups){const prior=out.groups.find(r=>r.deployId===g.deployId&&r.publication?.id===d.id);if(prior){prior.level=g.level;prior.levels=g.levels;prior.code=g.code;prior.subject=g.subject;}}
  out.groups=merge(out.groups,publishedGroups,groupKey,k=>makeId('tg',k),mtl);
  const classIds=new Map(out.classes.filter(on).map(c=>[classCode(c),c.id])),groupIds=new Map(out.groups.filter(on).map(g=>[groupKey(g),g.id]));
  const allocations=[],formsFor=room=>Array.isArray(room.forms)?room.forms:Array.isArray(room.form)?room.form:text(room.form).split(/[,\n]/).map(text).filter(Boolean);
  for(const room of d.venues||[]){const forms=formsFor(room);
   for(const form of forms){const targetId=classIds.get(form);if(!targetId)throw Error('Published homeroom is not a defined class: '+form);allocations.push({kind:'homeroom',targetId,targetLabel:form,unitNumber:unit(room),sourceId,sourceLocator:'Published venue '+room.id,publication:provenance});}
  }
  const matchedMTL=new Set();
  for(const g of (d.groups||[]).filter(on)){const targetId=groupIds.get(groupKey(g));if(out.groups.some(r=>r.id===targetId&&mtl(r)))matchedMTL.add(targetId);
   let venue=text(g.venue);
   if(!venue&&!g.levelWide&&g.associationSchema!==1){const anchor=(d.classes||[]).find(c=>g.anchorRef?c.ref===g.anchorRef:classCode(c)===g.form);if(anchor){const rooms=(d.venues||[]).filter(r=>formsFor(r).includes(classCode(anchor)));if(rooms.length>1)throw Error('Ambiguous published anchor venue for '+groupCode(g));if(rooms.length)venue=unit(rooms[0]);}}
   if(venue)allocations.push({kind:'teaching_group',targetId,targetLabel:groupCode(g),unitNumber:venue,sourceId,sourceLocator:'Published TG '+g.id,publication:provenance});
  }
  const allocationKey=a=>[a.kind,a.targetId,a.unitNumber].join('|');
  out.allocations=merge(out.allocations,allocations,allocationKey,k=>makeId('allocation',k),a=>a.kind==='teaching_group'&&!matchedMTL.has(a.targetId)&&out.groups.some(g=>g.id===a.targetId&&mtl(g)&&on(g)));
  for(const a of out.allocations)if(on(a)&&!out.venues.some(v=>v.unitNumber===a.unitNumber&&on(v)))a.active='N';
  out.previousRevision=previous.revision;out.revision=y+'-published-'+entry.commit;out.sourceDeployVersion=provenance;out.state='published';out.frontendIntegration='v0.5.01';out.otherTGStatus='Copied from '+d.name+' revision '+entry.revision;
  out.sources=(out.sources||[]).concat({id:sourceId,name:d.name,contentDate:entry.updatedAt||'',publication:provenance});
  return validate(out);
 }
 function publicView(s){
  validate(s);const activeTargets=new Set([...s.classes,...s.groups].filter(on).map(r=>r.id)),activeUnits=new Set(s.venues.filter(on).map(v=>v.unitNumber));
  const allocations=s.allocations.filter(a=>on(a)&&activeTargets.has(a.targetId)&&activeUnits.has(a.unitNumber));
  const venues=s.venues.filter(on).map(v=>({id:v.id,unitNumber:v.unitNumber,geometryUnit:v.geometryUnit||v.unitNumber,name:v.name,shortName:v.shortName||'',block:v.block,level:v.floor??v.level,capacity:v.capacity??null,allocations:allocations.filter(a=>a.unitNumber===v.unitNumber).map(a=>({id:a.id,unitNumber:a.unitNumber,kind:a.kind,targetId:a.targetId,label:a.targetLabel}))}));
  const units=id=>allocations.filter(a=>a.targetId===id).map(a=>a.unitNumber);
  return {schemaVersion:2,modelVersion:'1.1.0',layoutYear:s.year,layoutRevision:s.revision,layoutState:s.state,repository:'layout-current',deploymentVersionId:s.sourceDeployVersion?.id||null,deploymentRevision:s.sourceDeployVersion?.revision||0,publication:s.sourceDeployVersion||null,registryRevision:s.revision,cursor:s.revision,
   venues,classes:s.classes.filter(on).map(c=>({id:c.id,code:c.code,name:c.name||c.code,shortName:c.shortName,level:String(c.level),units:units(c.id)})),
   groups:s.groups.filter(on).map(g=>({id:g.id,code:g.code,name:g.code,level:String(g.level),levels:tg().levels(g),weeklyPeriods:g.weeklyPeriods??null,subject:g.subject,teacherLabels:g.teacherLabels||'',pupilCount:g.pupilCount??null,pupilCountText:g.pupilCountText||'',programmes:g.programmes||'',sourceVenueText:g.sourceVenueText||'',notes:g.notes||'',breakdown:g.breakdown||{},countRows:g.countRows||[],sourceId:g.sourceId||'',sourceLocator:g.sourceLocator||'',publication:g.publication||null,units:units(g.id)})),
   sources:s.sources||[],reviews:(s.issues||[]).filter(r=>!(r.kind==='Frontend integration pending'&&s.frontendIntegration==='v0.5.01')&&!(r.kind==='Matching Deploy version unavailable'&&s.sourceDeployVersion)),otherTGStatus:s.otherTGStatus||'',sourceSummaries:s.sourceSummaries||[]};
 }
 return {year,validate,empty,publication,publicView};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISLayoutData;
