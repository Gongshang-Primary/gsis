/* Dated Stapler model. One tile, two projections; no I/O or notification side effects. */
var GSISRosterStapler=(()=>{
 const clone=x=>JSON.parse(JSON.stringify(x));
 // This version tracks structural rules, not the application release. Only the
 // authenticated storage/response adapters may adopt a stored validation result.
 const validationVersion=1,validated=new WeakMap(),comparisonIndexes=new WeakMap();
 function acceptStored(plan,json=JSON.stringify(plan),immutable=false){validated.set(plan,{json,immutable});return plan;}
 function isValidated(plan){if(plan)void plan.schema;const proof=plan&&validated.get(plan);return !!proof&&(proof.immutable||proof.json===JSON.stringify(plan));}
 function canonical(plan){validate(plan);const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}};freeze(plan);return acceptStored(plan,JSON.stringify(plan),true);}
 function copyValidated(plan){validate(plan);return acceptStored(clone(plan));}
 function structure(plan){return JSON.stringify([plan.id,plan.daySnapshot,plan.schema,plan.date,plan.baselineId,plan.parity,plan.endOfDayMinutes,plan.venues,plan.periods,plan.teachers,plan.classes,plan.subjectCategories,plan.recessDefaults,plan.baseline,plan.mats]);}

 const clean=x=>String(x==null?'':x).trim();
 const norm=x=>clean(x).normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
 const classKey=x=>norm(x).replace(/^(?:primary|pri|p)\s*(?=[1-6])/,'').replace(/\s+/g,'');
 const split=x=>clean(x).split(/[\n,;\/]+/).map(clean).filter(Boolean);
 function fail(message,status=409){throw Object.assign(Error(message),{status});}
 function date(value){if(!/^20\d\d-\d\d-\d\d$/.test(value||'')||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail('Choose a valid Stapler date.',400);return value;}
 function text(value,max=500){if(typeof value!=='string'||value.length>max)fail('Invalid Stapler text.',400);return value.trim();}
 function minute(value){if(Number.isInteger(value))return value;const m=/^(\d\d):(\d\d)$/.exec(clean(value));return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:NaN;}
 function defaultRecesses(){return Array.from({length:6},(_,i)=>({level:i+1,startMinutes:510+i*30,endMinutes:540+i*30}));}
 function period(plan,id){const p=plan.periods.find(p=>p.period===id);if(!p)fail('Choose a valid timetable period.',400);return p;}
 function span(plan,tile){if(tile.location==='pit')return [];const p=period(plan,tile.period),end=p.startMinutes+(tile.kind==='recess'?tile.durationMinutes:p.endMinutes-p.startMinutes),out=plan.periods.filter(x=>x.startMinutes>=p.startMinutes&&x.endMinutes<=end).sort((a,b)=>a.startMinutes-b.startMinutes);if(!out.length||out[0].startMinutes!==p.startMinutes||out[out.length-1].endMinutes!==end||out.some((x,i)=>i&&out[i-1].endMinutes!==x.startMinutes))fail('The card does not fit this timetable timing.');return out.map(x=>x.period);}
 function overlaps(plan,a,b){const as=span(plan,a),bs=span(plan,b);return as.some(x=>bs.some(y=>{const p=period(plan,x),q=period(plan,y);return p.startMinutes<q.endMinutes&&q.startMinutes<p.endMinutes;}));}
 function active(plan){return plan.tiles.filter(t=>t.location==='grid');}
 function recessGroups(plan){
  const classes=new Map(plan.classes.map(c=>[c.id,c])),groups=new Map();for(const t of active(plan).filter(t=>t.kind==='recess')){const cls=classes.get(t.classIds[0]);if(!cls?.traditional||!Number.isInteger(cls.level)||cls.level<1||cls.level>6)continue;const key=[cls.level,t.period,t.durationMinutes].join('|');if(!groups.has(key))groups.set(key,{tileId:t.id,level:cls.level,period:t.period,durationMinutes:t.durationMinutes,classIds:[],tileIds:[]});const group=groups.get(key);group.classIds.push(cls.id);group.tileIds.push(t.id);}return [...groups.values()];
 }
 function classIds(plan,value){return split(value).map(name=>{const hits=plan.classes.filter(c=>classKey(c.name)===classKey(name));if(hits.length!==1)fail('Class “'+name+'” needs an exact mapping.');return hits[0].id;});}
 function classNames(plan,ids){return ids.map(id=>plan.classes.find(c=>c.id===id)?.name||id).join(', ');}
 function source(tile){return {teacherId:tile.teacherId,classIds:tile.classIds.slice(),period:tile.period,subject:tile.subject,venue:tile.venue,group:tile.group};}
 function newId(plan,prefix){let n=plan.nextId||1,id;do{id=prefix+':'+n++;}while(plan.tiles.some(t=>t.id===id)||plan.mats.some(t=>t.id===id)||plan.classes.some(c=>c.id===id));plan.nextId=n;return id;}
 function selectedClasses(plan,ids,custom=[]){
  if(!Array.isArray(ids)||!Array.isArray(custom)||custom.length>100)fail('Choose valid classes.',400);
  const selected=ids.map(id=>text(id,200));for(const raw of custom){const name=text(raw,160);if(!name)continue;let cls=plan.classes.find(c=>classKey(c.name)===classKey(name));if(!cls){cls={id:newId(plan,'adhoc-class'),name,level:null,traditional:false,venue:'',adhoc:true};plan.classes.push(cls);}selected.push(cls.id);}return [...new Set(selected)];
 }
 function settingRecesses(day){
  const rows=Array.isArray(day.recesses)?day.recesses:[],out=[];for(const row of rows){if(row.none===true||row.period===null)continue;const level=Number(row.level),p=Number.isInteger(row.period)?day.periods.find(p=>p.period===row.period):null,start=minute(row.startMinutes??row.start??p?.startMinutes),end=minute(row.endMinutes??row.end??p?.endMinutes);if(!Number.isInteger(level)||level<1||level>6||out.some(r=>r.level===level)||!Number.isInteger(start)||!Number.isInteger(end)||end<=start||end>1440)fail('Check uploaded recess timing for Primary '+level+'.',400);out.push({level,startMinutes:start,endMinutes:end});}return out.sort((a,b)=>a.level-b.level);
 }
 function createStandalone(options={}){
  const periods=options.periods;if(!Array.isArray(periods)||!periods.length||!Number.isInteger(options.endOfDayMinutes)||options.endOfDayMinutes<periods[periods.length-1].endMinutes||periods.some((p,i)=>!p||p.period!==i||i&&p.startMinutes<periods[i-1].endMinutes))fail('Invalid standalone period timings.',400);
  return create({id:options.id||'standalone:'+date(options.date),date:options.date,periods,teachers:[],formClasses:[],recesses:[],endOfDayMinutes:options.endOfDayMinutes,parity:null});
 }
 function importNative(payload,options={}){
  if(!payload||unescape(encodeURIComponent(JSON.stringify(payload))).length>1900000)fail('The native plan is missing or too large.',400);
  const plan=clone(payload);if(typeof plan.baselineId!=='string'||!plan.baselineId||plan.baselineId.length>500||!Array.isArray(plan.periods)||plan.periods.some((p,i)=>!p||p.period!==i||i&&p.startMinutes<plan.periods[i-1].endMinutes))fail('Invalid native timetable identity or timing.',400);try{validate(plan);}catch(error){if(error.status)throw error;fail('Invalid native timetable structure.',400);}if(options.date&&plan.date!==options.date)fail('The native plan belongs to another date.',400);plan.status='draft';return snapshotPlan(plan);
 }
 function comparison(plan,day){
  validate(plan);const available=!!day?.id&&Array.isArray(day.periods)&&day.periods.length>0,issues=[],ghosts=[],tiles=[],differences=[];
  if(!available)return {available:false,baselineId:null,issues:['No comparison baseline is available.'],ghosts,tiles,differences};
  const teachers=new Map(plan.teachers.map(t=>[t.staffId,t])),periods=new Map(plan.periods.map(p=>[p.startMinutes+':'+p.endMinutes,p])),effective=new Map(effectiveDay(plan).teachers.map(t=>[t.staffId,t]));
  for(const p of day.periods){const match=periods.get(p.startMinutes+':'+p.endMinutes);if(!match){issues.push('Comparison period '+p.period+' has no matching time interval.');continue;}
   for(const t of day.teachers||[]){const c=t.cells?.[p.period];if(!c?.some(Boolean))continue;if(!teachers.has(t.staffId)){issues.push('Comparison teacher '+t.name+' is not in this plan.');continue;}
    const classIds=[];for(const name of split(c[1])){const cls=plan.classes.find(c=>classKey(c.name)===classKey(name));if(cls)classIds.push(cls.id);else issues.push('Comparison class '+name+' is not in this plan.');}
    const tile={id:'comparison:'+encodeURIComponent(t.staffId)+':'+p.period,kind:'lesson',teacherId:t.staffId,classIds,period:match.period,location:'grid',subject:c[0]||'',venue:c[2]||'',group:c[3]||'',baselineId:day.id};tiles.push(tile);if(!sameCell(c,effective.get(t.staffId)?.cells[match.period]||[]))ghosts.push(tile);
   }
  }
  const slots=value=>{const rows=new Map();for(const t of value.teachers||[])for(const p of value.periods||[]){const c=canonicalCell(t.cells?.[p.period]);if(c.some(Boolean))rows.set(JSON.stringify([t.staffId,p.startMinutes,p.endMinutes]),{staffId:t.staffId,name:t.name,period:p.period,startMinutes:p.startMinutes,endMinutes:p.endMinutes,cell:c});}return rows;};
  const before=slots(day),after=slots(effectiveDay(plan));for(const key of [...new Set([...before.keys(),...after.keys()])].sort()){const b=before.get(key),a=after.get(key);if(sameCell(b?.cell,a?.cell))continue;const row=a||b;differences.push({kind:!b?'added':!a?'removed':'changed',staffId:row.staffId,name:row.name,period:row.period,startMinutes:row.startMinutes,endMinutes:row.endMinutes,before:b?.cell||['','','',''],after:a?.cell||['','','','']});}
  return {available:true,baselineId:day.id,issues:[...new Set(issues)],ghosts,tiles,differences};
 }
 function create(day,options={}){
  if(!day||day.verified===false||day.schoolDay===false||!Array.isArray(day.periods)||!day.periods.length||!Array.isArray(day.teachers))fail('Load a verified school-day baseline before planning.');
  const plan={schema:1,id:'stapler:'+date(options.date||day.date),daySnapshot:{...clone(day),schema:1},date:date(options.date||day.date),baselineId:clean(day.modelId||day.id),parity:day.parity||null,endOfDayMinutes:options.endOfDayMinutes??day.endOfDayMinutes??day.timing?.endOfDayMinutes??810,venues:clone(options.venues||day.venues||[]),status:'draft',revision:0,nextId:1,periods:clone(day.periods),teachers:day.teachers.map(t=>({staffId:clean(t.staffId),name:clean(t.name),timetableName:clean(t.timetableName||t.name)})),classes:(day.formClasses||[]).map(c=>({id:clean(c.id),name:clean(c.name),level:Number(c.level)||null,traditional:c.traditional!==false,venue:clean(c.venue)})),subjectCategories:clone(options.subjectCategories||day.subjectCategories||{}),tiles:[],mats:[],warnings:[],recessDefaults:settingRecesses(day)};
  if(!plan.baselineId)fail('The school day needs a saved baseline identity.');
  for(const t of day.teachers)for(const cell of t.cells||[])for(const name of split(cell?.[1]))if(!plan.classes.some(c=>classKey(c.name)===classKey(name))){const match=/^([1-6])([a-z]+)$/.exec(classKey(name));plan.classes.push({id:'class:'+encodeURIComponent(name),name,level:match?Number(match[1]):null,traditional:!!match,venue:''});if(match)plan.warnings.push('Class '+name+' was inferred from the timetable; verify its class identity against Deploy.');}
  for(const teacher of day.teachers)for(const p of plan.periods){const cell=teacher.cells[p.period];if(!Array.isArray(cell)||!cell.some(v=>clean(v)))continue;
   const tile={id:'baseline:'+encodeURIComponent(teacher.staffId)+':'+p.period,kind:'lesson',teacherId:clean(teacher.staffId),classIds:classIds(plan,cell[1]),period:p.period,location:'grid',subject:clean(cell[0]),venue:clean(cell[2]),group:clean(cell[3]),baselineId:plan.baselineId};tile.source=source(tile);plan.tiles.push(tile);
  }
  // Baseline remains exact even if a configured recess displaces an imported lesson.
  if(!plan.venues.length)plan.venues=[...new Set(plan.tiles.map(t=>t.venue).filter(Boolean))];
  plan.baseline={parity:plan.parity,endOfDayMinutes:plan.endOfDayMinutes,venues:clone(plan.venues),tiles:clone(plan.tiles),teachers:clone(plan.teachers),classes:clone(plan.classes),periods:clone(plan.periods),subjectCategories:clone(plan.subjectCategories),recessDefaults:clone(plan.recessDefaults)};
  for(const cls of plan.classes.filter(c=>c.traditional&&c.level>=1&&c.level<=6)){
   const def=plan.recessDefaults.find(r=>r.level===cls.level);if(!def)continue;const p=plan.periods.find(p=>p.startMinutes===def.startMinutes);if(!p)fail('Primary '+cls.level+' recess does not align with the timetable.');
   const tile={id:'recess:'+encodeURIComponent(cls.id),kind:'recess',teacherId:null,classIds:[cls.id],period:p.period,durationMinutes:def.endMinutes-def.startMinutes,location:'grid',subject:'Recess',venue:cls.venue,group:'',baselineId:null};tile.source=source(tile);
   for(const other of active(plan).filter(t=>t.classIds.includes(cls.id)&&overlaps(plan,t,tile))){other.location='pit';other.period=null;if(!/^recess(?:\b|$)/i.test(other.subject))plan.warnings.push(classNames(plan,other.classIds)+' '+other.subject+' was moved to Card Pit because it overlaps configured recess.');}
   plan.tiles.push(tile);
  }
  validate(plan);return plan;
 }
 // Move a saved working timetable onto a verified destination baseline. Retain the
 // old working cards and their provenance; destination originals supply accounting.
 function redate(plan,baseline){
  validate(plan);validate(baseline);
  if(JSON.stringify(plan.periods)!==JSON.stringify(baseline.periods)||plan.endOfDayMinutes!==baseline.endOfDayMinutes)fail('The destination has different period timings. The saved plan has not moved.');
  if(JSON.stringify(plan.recessDefaults)!==JSON.stringify(baseline.recessDefaults))fail('The destination has different recess settings. The saved plan has not moved.');
  const next=clone(plan),oldTeachers=new Set(plan.teachers.map(t=>t.staffId));
  for(const c of baseline.classes){const old=next.classes.find(x=>x.id===c.id);if(old&&['name','level','traditional','venue'].some(k=>old[k]!==c[k]))fail('The destination has a different class identity for '+c.name+'. The saved plan has not moved.');if(!old)next.classes.push(clone(c));}
  for(const t of baseline.teachers){const i=next.teachers.findIndex(x=>x.staffId===t.staffId);if(i<0)next.teachers.push(clone(t));else next.teachers[i]=clone(t);}
  const originals=new Map(baseline.baseline.tiles.map(t=>[t.id,t])),retained=new Set(),ids=new Set(next.tiles.map(t=>t.id));
  for(const t of next.tiles.filter(t=>t.kind==='lesson'&&t.baselineId)){
   const original=originals.get(t.id);
   if(original&&JSON.stringify(original.source)===JSON.stringify(t.source)){t.baselineId=baseline.baselineId;retained.add(t.id);}
   else {const before=t.id;let n=1;while(ids.has('carried:'+n+':'+before))n++;t.id='carried:'+n+':'+before;ids.add(t.id);t.baselineId=null;}
  }
  const destinationTiles=new Map(baseline.tiles.map(t=>[t.id,t]));
  for(const t of baseline.baseline.tiles)if(!retained.has(t.id))next.tiles.push(oldTeachers.has(t.teacherId)?{...clone(t),location:'pit',period:null}:clone(destinationTiles.get(t.id)||t));
  for(const t of baseline.tiles.filter(t=>t.kind==='recess'))if(!next.tiles.some(x=>x.id===t.id))next.tiles.push(clone(t));
  for(const key of ['id','daySnapshot','date','baselineId','parity','endOfDayMinutes','periods','venues','subjectCategories','recessDefaults','baseline'])next[key]=clone(baseline[key]);
  next.status='draft';next.revision=(plan.revision||0)+1;validate(next);return next;
 }
 // A new imported cover may be reassigned locally before its first save only
 // when both immutable offline cells prove the original relief relationship.
 // This is source validation, not an exemption from teacher/cap/absence checks.
 function verifiedImportedReliefTransfer(plan,t,tiles){
  const r=t.importedRelief,l=r?.lesson,original=l&&tiles.get(r.linkedTileId),owned=x=>x?.kind==='lesson'&&!x.baselineId&&/^offline:\d+:\d+$/.test(x.id)&&!!x.source&&!!x.offlineSource&&x.source.teacherId===x.offlineSource.teacherId&&x.source.period===x.offlineSource.period&&['subject','venue','group'].every(k=>x.source[k]===x.offlineSource[k]);
  if(plan.importSource?.mode!=='final-day'||!l||!owned(t)||!owned(original)||l.date!==plan.date||l.tileId!==original.id||l.teacherId===t.source.teacherId||original.source.teacherId!==l.teacherId||original.source.period!==l.period||t.source.period!==l.period)return false;
  const annotation=/^(.+) \((for|swapped w\/) (.+)\)$/.exec(t.source.subject),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  if(!annotation||annotation[1]!== (l.subject||'Relief')||annotation[2]!== (r.kind==='combine'?'swapped w/':'for')||!same(t.source.classIds,l.classIds)||['venue','group'].some(k=>t.source[k]!==l[k]))return false;
  if(r.kind==='combine')return /^.+ \(dropped — swapped w\/ .+\)$/.test(original.source.subject);
  return original.source.subject.startsWith((l.subject||'Lesson')+' (absent — ')&&original.source.subject.endsWith(')')&&same(original.source.classIds,l.classIds)&&['venue','group'].every(k=>original.source[k]===l[k]);
 }
 function validate(plan,options={}){
  if(!options.baseline&&!options.previous&&!options.publish&&isValidated(plan))return plan;
  if(!plan||plan.schema!==1||!Array.isArray(plan.tiles)||!Array.isArray(plan.teachers)||!Array.isArray(plan.classes)||!Array.isArray(plan.periods)||!Array.isArray(plan.mats)||!Array.isArray(plan.baseline?.tiles)||plan.tiles.length>20000||plan.teachers.length>500||plan.classes.length>1000||!plan.periods.length||plan.periods.length>40)fail('Invalid Stapler plan.',400);
  const expected=options.baseline?.baseline||options.baseline,previous=options.previous||(options.baseline?.schema===1?options.baseline:null),incremental=!options.publish&&previous&&isValidated(previous)&&structure(plan)===structure(previous),ids=list=>list.map(x=>x.id),unique=xs=>new Set(xs).size===xs.length;
  if(previous&&(planId(plan)!==planId(previous)||hasDaySnapshot(previous)&&JSON.stringify(plan.daySnapshot)!==JSON.stringify(previous.daySnapshot)))fail('The saved plan identity or day snapshot cannot be edited.');
  if(!unique(ids(plan.tiles)))fail('Duplicate timetable identities.',400);
  if(!incremental){
  date(plan.date);if(!Number.isInteger(plan.endOfDayMinutes)||plan.endOfDayMinutes<=450||plan.endOfDayMinutes>1440||plan.endOfDayMinutes!==plan.baseline.endOfDayMinutes)fail('Invalid baseline end-of-day timing.',400);
  if(!unique(plan.teachers.map(t=>t.staffId))||!unique(ids(plan.classes))||!unique(ids(plan.tiles))||!unique(plan.periods.map(p=>p.period)))fail('Duplicate timetable identities.',400);
  if(plan.teachers.some(t=>!t.staffId||!clean(t.name)||!clean(t.timetableName))||!unique(plan.teachers.map(t=>norm(t.timetableName))))fail('Every teacher needs a unique timetable name.',400);
  if(plan.classes.some(c=>!c.id||!clean(c.name))||!unique(plan.classes.map(c=>classKey(c.name))))fail('Every class needs a unique name.',400);
  for(const p of plan.periods)if(!Number.isInteger(p.period)||p.period<0||!Number.isInteger(p.startMinutes)||!Number.isInteger(p.endMinutes)||p.startMinutes<0||p.endMinutes<=p.startMinutes||p.endMinutes>1440)fail('Invalid timetable timing.',400);
  if(plan.parity!==plan.baseline.parity||JSON.stringify(plan.venues)!==JSON.stringify(plan.baseline.venues))fail('The baseline week and venue catalogue cannot be edited.');
  if(JSON.stringify(plan.periods)!==JSON.stringify(plan.baseline.periods)||JSON.stringify(plan.subjectCategories||{})!==JSON.stringify(plan.baseline.subjectCategories||{}))fail('The baseline timing or workload categories cannot be edited.');
  }
  if(expected&&JSON.stringify(plan.baseline)!==JSON.stringify(expected))fail('The baseline changed. Reload before saving.');
  const teacherSet=new Set(plan.teachers.map(t=>t.staffId)),classSet=new Set(plan.classes.map(c=>c.id)),baselineTiles=new Map(plan.baseline.tiles.map(t=>[t.id,t])),currentTiles=new Map(plan.tiles.map(t=>[t.id,t])),priorTiles=new Map((previous?.tiles||[]).map(t=>[t.id,t]));
  // Unchanged catalogues and an exact, previously validated plan allow a local
  // edit to check only changed cards and the teacher/class slots they touch.
  const changed=incremental?plan.tiles.filter(t=>JSON.stringify(t)!==JSON.stringify(priorTiles.get(t.id))):plan.tiles;
  const changedIds=new Set(changed.map(t=>t.id)),affectedTeachers=new Set(),affectedClasses=new Set();if(incremental)for(const t of [...changed,...(previous.tiles||[]).filter(t=>!currentTiles.has(t.id)||changedIds.has(t.id))]){if(t.teacherId)affectedTeachers.add(t.teacherId);for(const id of t.classIds||[])affectedClasses.add(id);}
  for(const t of changed){if(!t.id||!['lesson','recess'].includes(t.kind)||!['grid','pit'].includes(t.location)||!Array.isArray(t.classIds)||!unique(t.classIds)||t.classIds.some(id=>!classSet.has(id))||['subject','venue','group'].some(k=>typeof t[k]!=='string'||t[k].length>500))fail('Invalid lesson card.',400);
   // Original source identifiers remain immutable when an ad-hoc class is deleted.
   if(!t.source||!Array.isArray(t.source.classIds)||t.source.classIds.some(id=>typeof id!=='string'||!id||id.length>200)||['subject','venue','group'].some(k=>typeof t.source[k]!=='string'||t.source[k].length>500)||t.source.period!==null&&!plan.periods.some(p=>p.period===t.source.period)||t.kind==='lesson'&&!teacherSet.has(t.source.teacherId))fail('Invalid original card details.',400);
   if(t.kind==='lesson'&&!teacherSet.has(t.teacherId)||t.kind==='recess'&&(t.teacherId!==null||t.classIds.length!==1||!Number.isInteger(t.durationMinutes)||t.durationMinutes<=0))fail('Invalid card identity.',400);
   const original=baselineTiles.get(t.id);if(original&&JSON.stringify(t.source)!==JSON.stringify(original.source))fail('Original lesson details cannot be edited.');
   if(original&&(t.kind!==original.kind||t.baselineId!==original.baselineId))fail('Original lesson identity cannot be edited.');
   if(!original&&t.kind==='lesson'&&t.baselineId)fail('Unknown baseline card.',400);
   const prior=priorTiles.get(t.id);if(prior&&JSON.stringify(t.source)!==JSON.stringify(prior.source))fail('Original card details cannot be edited.');
   if(t.offlineSource){const o=t.offlineSource;if(t.kind!=='lesson'||t.baselineId||!teacherSet.has(o.teacherId)||o.period!==null&&!Number.isInteger(o.period)||['teacher','subject','className','venue','group'].some(k=>typeof o[k]!=='string'||o[k].length>500))fail('Invalid offline source details.',400);}
   if(prior?.offlineSource&&JSON.stringify(prior.offlineSource)!==JSON.stringify(t.offlineSource))fail('Original offline source details cannot be edited.');
   if(t.importedRelief){const r=t.importedRelief,l=r.lesson;if(t.kind!=='lesson'||t.baselineId||!t.offlineSource||r.version!==1||!['cover','combine'].includes(r.kind)||!l||!teacherSet.has(l.teacherId)||!Array.isArray(l.classIds)||l.classIds.some(id=>typeof id!=='string'||!id||id.length>200)||!plan.periods.some(p=>p.period===l.period)||!/^20\d\d-\d\d-\d\d$/.test(l.date||'')||['subject','venue','group'].some(k=>typeof l[k]!=='string'||l[k].length>500)||typeof l.tileId!=='string'||!l.tileId||l.tileId.length>500||typeof r.linkedTileId!=='string'||r.linkedTileId.length>500||!currentTiles.has(r.linkedTileId))fail('Invalid imported relief provenance.',400);date(l.date);}
   if(prior?.importedRelief&&JSON.stringify(prior.importedRelief)!==JSON.stringify(t.importedRelief))fail('Original imported relief provenance cannot be edited.');
   if(previous&&!prior&&!original&&t.kind==='lesson'&&t.source?.teacherId!==t.teacherId&&!verifiedImportedReliefTransfer(plan,t,currentTiles))fail('Save a newly added card before transferring it to another teacher.');
   if(t.kind==='recess'){const cls=plan.classes.find(c=>c.id===t.classIds[0]),def=plan.baseline.recessDefaults.find(r=>r.level===cls?.level);const defaultPeriod=plan.periods.find(p=>p.startMinutes===def?.startMinutes)?.period,originalSource={teacherId:null,classIds:t.classIds,period:defaultPeriod,subject:'Recess',venue:cls?.venue||'',group:''};if(t.id!=='recess:'+encodeURIComponent(cls?.id)||!cls.traditional||!def||t.durationMinutes!==def.endMinutes-def.startMinutes||t.baselineId!==null||JSON.stringify(t.source)!==JSON.stringify(originalSource)||t.subject!=='Recess'||t.group!==''||t.venue!==originalSource.venue)fail('Original recess identity cannot be edited.');}
   if(t.location==='pit'){if(t.period!==null)fail('Pit cards must be unplaced.',400);}else span(plan,t);
  }
  if(plan.baseline.tiles.some(b=>!currentTiles.has(b.id)))fail('Baseline cards must be retained in the plan or Card Pit.');
  if(!incremental){
  for(const original of plan.baseline.teachers||[])if(!plan.teachers.some(t=>t.staffId===original.staffId&&t.timetableName===original.timetableName&&t.name===original.name))fail('Baseline teacher identities cannot be removed or renamed.');
  for(const original of plan.baseline.classes||[])if(!plan.classes.some(c=>c.id===original.id&&c.name===original.name&&c.level===original.level&&c.traditional===original.traditional&&c.venue===original.venue))fail('Baseline class identities cannot be removed or changed.');
  if(JSON.stringify(plan.recessDefaults)!==JSON.stringify(plan.baseline.recessDefaults))fail('Draft recess defaults are fixed to this baseline.');
  }
  for(const cls of plan.classes.filter(c=>c.traditional&&c.level>=1&&c.level<=6&&(!incremental||affectedClasses.has(c.id))))if(plan.tiles.filter(t=>t.kind==='recess'&&t.classIds.includes(cls.id)).length!==(plan.recessDefaults.some(r=>r.level===cls.level)?1:0))fail('Each traditional class requires one recess card.');
  const teacherSlots=new Map(),classSlots=new Map();for(const t of active(plan).filter(t=>!incremental||affectedTeachers.has(t.teacherId)||t.classIds.some(id=>affectedClasses.has(id))))for(const n of span(plan,t)){const p=period(plan,n);
   if(t.teacherId){const list=teacherSlots.get(t.teacherId)||[];const conflict=list.find(x=>x.tile.id!==t.id&&x.p.startMinutes<p.endMinutes&&p.startMinutes<x.p.endMinutes);if(conflict)fail((plan.teachers.find(x=>x.staffId===t.teacherId)?.name||t.teacherId)+' already has a lesson at '+(p.start||p.startMinutes)+'.');list.push({tile:t,p});teacherSlots.set(t.teacherId,list);}
   for(const id of t.classIds){const list=classSlots.get(id)||[];if(list.some(x=>x.tile.id!==t.id&&(t.kind==='recess'||x.tile.kind==='recess')&&x.p.startMinutes<p.endMinutes&&p.startMinutes<x.p.endMinutes))fail('Recess overlaps a lesson for '+classNames(plan,[id])+'.');list.push({tile:t,p});classSlots.set(id,list);}
  }
  if(!incremental)for(const mat of plan.mats){if(!['teacher','class'].includes(mat.target)||!(mat.target==='teacher'?teacherSet:classSet).has(mat.targetId)||!clean(mat.reason))fail('Invalid suspension marker.',400);period(plan,mat.fromPeriod);period(plan,mat.toPeriod);if(period(plan,mat.fromPeriod).startMinutes>period(plan,mat.toPeriod).startMinutes)fail('Invalid suspension range.',400);}
  if(options.publish){const gaps=[];for(const cls of plan.classes.filter(c=>c.traditional)){const intervals=(classSlots.get(cls.id)||[]).map(x=>[Math.max(450,x.p.startMinutes),Math.min(plan.endOfDayMinutes,x.p.endMinutes)]).filter(x=>x[1]>x[0]).sort((a,b)=>a[0]-b[0]);let until=450;for(const [from,to] of intervals){if(from>until)break;until=Math.max(until,to);}if(until<plan.endOfDayMinutes)gaps.push(cls.name);}if(gaps.length)fail('Fill every class period from 07:30 to '+String(Math.floor(plan.endOfDayMinutes/60)).padStart(2,'0')+':'+String(plan.endOfDayMinutes%60).padStart(2,'0')+' before publishing: '+gaps.join(', ')+'.');}
  return acceptStored(plan);
 }
 function apply(plan,command,options={}){
  validate(plan);if(!command||typeof command!=='object')fail('Choose a planner action.',400);const next=clone(plan),type=command.type||command.operation,tile=()=>{const t=next.tiles.find(t=>t.id===command.tileId);if(!t)fail('This card is no longer available.');return t;};
  if(type==='move'||type==='pit'){
   const t=tile();if(t.kind==='recess'&&type==='move')return apply(plan,{...command,type:'recessMove'});
   if(type==='pit'){t.location='pit';t.period=null;}else {t.location='grid';t.period=command.period;if(command.teacherId!==undefined)t.teacherId=text(command.teacherId);if(command.classId!==undefined)t.classIds=[text(command.classId)];}
  }else if(type==='edit'){
   const t=tile(),patch=command.patch||{};if(t.kind==='recess')fail('Move recess cards or edit their defaults in baseline timing settings.');
   for(const [key,value] of Object.entries(patch)){if(['subject','venue','group','teacherId'].includes(key))t[key]=text(value);else if(key==='classIds'&&Array.isArray(value))t.classIds=selectedClasses(next,value,command.customClasses);else fail('Unsupported card field.',400);}
  }else if(type==='addTeacher'){
   const t=command.teacher||{},staffId=text(t.staffId,200),name=text(t.name,160),timetableName=text(t.timetableName||t.name,160);if(!staffId||!name||!timetableName)fail('Select a teacher with a unique timetable name.',400);next.teachers.push({staffId,name,timetableName,adhoc:true});
  }else if(type==='addClass'){
   const c=command.class||{},name=text(c.name,160),id=c.id?text(c.id,200):'class:'+encodeURIComponent(name);if(!name)fail('Enter a class name.',400);next.classes.push({id,name,level:Number(c.level)||null,traditional:c.traditional===true,venue:clean(c.venue),adhoc:true});
  }else if(type==='renameClass'||type==='deleteClass'){
   const cls=next.classes.find(c=>c.id===command.classId);if(!cls?.adhoc||next.baseline.classes.some(c=>c.id===cls.id))fail('Only ad-hoc classes can be renamed or deleted.');
   if(type==='renameClass'){const name=text(command.name,160);if(!name)fail('Enter a class name.',400);cls.name=name;}
   else{for(const t of next.tiles)if(t.classIds.includes(cls.id)){t.classIds=t.classIds.filter(id=>id!==cls.id);t.location='pit';t.period=null;}next.mats=next.mats.filter(m=>m.target!=='class'||m.targetId!==cls.id);next.classes=next.classes.filter(c=>c.id!==cls.id);}
  }else if(type==='addTile'){
   const quantity=command.quantity??1;if(!Number.isInteger(quantity)||quantity<1||quantity>100)fail('Choose a quantity from 1 to 100.',400);
   const v=command.tile||{},classes=selectedClasses(next,v.classIds||[],command.customClasses);for(let i=0;i<quantity;i++){const t={id:newId(next,'extra'),kind:'lesson',teacherId:text(v.teacherId,200),classIds:classes.slice(),period:Number.isInteger(v.period)?v.period:null,location:Number.isInteger(v.period)?'grid':'pit',subject:text(v.subject||''),venue:text(v.venue||''),group:text(v.group||''),baselineId:null};t.source=source(t);next.tiles.push(t);}
  }else if(type==='suspend'){
   const target=command.target,targetId=text(command.targetId,200),reason=text(command.reason,240);if(!reason)fail('Enter a suspension reason.',400);const from=period(next,command.fromPeriod),to=period(next,command.toPeriod);if(from.startMinutes>to.startMinutes)fail('Choose an end after the start.',400);
   if(target==='teacher'&&!next.baseline.teachers.some(t=>t.staffId===targetId))fail('Suspend a teacher present in the baseline.');if(!['teacher','class'].includes(target))fail('Choose a teacher or class.',400);
   for(const t of active(next))if((target==='teacher'?t.teacherId===targetId:t.classIds.includes(targetId))&&span(next,t).some(n=>{const p=period(next,n);return p.startMinutes<to.endMinutes&&p.endMinutes>from.startMinutes;})){t.location='pit';t.period=null;}
   const same=next.mats.find(m=>m.target===target&&m.targetId===targetId&&m.fromPeriod===from.period&&m.toPeriod===to.period);if(same)same.reason=reason;else next.mats.push({id:newId(next,'mat'),target,targetId,fromPeriod:from.period,toPeriod:to.period,reason});
  }else if(type==='removeMat'){next.mats=next.mats.filter(m=>m.id!==command.matId);
  }else if(type==='bulkEdit'){
   const column=command.classId===undefined,patch=command.patch||{};
   if(column){
    if(!Array.isArray(command.periods)||!command.periods.length)fail('Choose a valid timetable period.',400);
    command.periods.forEach(id=>period(next,id));
    if(Object.keys(patch).some(key=>!['venue','group','classIds'].includes(key)))fail('Only Venue, Group and Class can be changed by period.',400);
    const tiles=next.tiles.filter(t=>t.kind==='lesson'&&t.location==='grid'&&command.periods.includes(t.period)),values={};
    for(const key of ['venue','group'])if(patch[key]!==undefined){const value=text(patch[key]);if(value)values[key]=value;}
    if(patch.classIds!==undefined||command.customClasses!==undefined){const ids=selectedClasses(next,patch.classIds===undefined?[]:patch.classIds,command.customClasses);if(ids.some(id=>!next.classes.some(c=>c.id===id)))fail('Choose valid classes.',400);if(ids.length)values.classIds=ids;}
    if(!tiles.some(t=>Object.entries(values).some(([key,value])=>JSON.stringify(t[key])!==JSON.stringify(value))))return plan;
    for(const t of tiles)for(const [key,value] of Object.entries(values))t[key]=Array.isArray(value)?value.slice():value;
   }else{
    if(!next.classes.some(c=>c.id===command.classId))fail('Choose a class.');if(Object.keys(patch).some(k=>!['subject','venue','group'].includes(k)))fail('Only Subject, Venue and Group can be changed together.',400);for(const t of next.tiles.filter(t=>t.kind==='lesson'&&t.classIds.includes(command.classId)&&(!Array.isArray(command.periods)||command.periods.includes(t.period))))for(const [key,value] of Object.entries(patch))t[key]=text(value);
   }
  }else if(type==='recessLevelMove'){
   const t=tile(),group=recessGroups(next).find(g=>g.tileIds.includes(t.id));if(!group)fail('Choose a placed recess block.');const classSet=new Set(group.classIds),memberIds=new Set(group.tileIds),members=next.tiles.filter(t=>memberIds.has(t.id)),order=next.periods.slice().sort((a,b)=>a.startMinutes-b.startMinutes),target=order.findIndex(p=>p.period===command.period);if(target<0)fail('Choose a valid period.',400);let index=order.findIndex(p=>p.period===t.period);
   const toPit=(card,reason)=>{card.location='pit';card.period=null;const teacher=next.teachers.find(p=>p.staffId===card.teacherId),message=classNames(next,card.classIds)+' '+(card.subject||'lesson')+' ('+(teacher?.name||card.teacherId)+') moved to Card Pit: '+reason+'.';next.warnings=next.warnings||[];if(!next.warnings.includes(message))next.warnings.push(message);};
   while(index!==target){const direction=target>index?1:-1,oldSpan=span(next,t);index+=direction;for(const member of members)member.period=order[index].period;const newSpan=span(next,t),added=newSpan.filter(n=>!oldSpan.includes(n)),removed=oldSpan.filter(n=>!newSpan.includes(n));if(added.length!==removed.length||added.length!==1)fail('Recess movement requires matching adjacent timetable slots.');
    const displaced=active(next).filter(other=>!memberIds.has(other.id)&&other.classIds.some(id=>classSet.has(id))&&span(next,other).some(n=>added.includes(n)));
    // Move the cohort together before checking teachers; a shared lesson remains one card.
    for(const other of displaced){if(other.kind!=='lesson'||span(next,other).length!==1)fail('Recess movement requires matching adjacent timetable slots.');if(other.classIds.some(id=>!classSet.has(id)))toPit(other,'shared with classes outside this recess block');else other.period=removed[0];}
    for(const other of displaced.filter(t=>t.location==='grid'))if(active(next).some(booking=>booking.id!==other.id&&booking.teacherId===other.teacherId&&overlaps(next,other,booking))){const p=period(next,other.period),time=p.start||String(Math.floor(p.startMinutes/60)).padStart(2,'0')+':'+String(p.startMinutes%60).padStart(2,'0');toPit(other,'teacher already has another lesson at '+time);}
    validate(next);
   }
  }else if(type==='recessMove'){
   const t=tile();if(t.kind!=='recess')fail('Choose a recess card.');if(command.classId!==undefined&&command.classId!==t.classIds[0])fail('A recess card belongs to its original class.');
   // A Pit marker has no vacated slot to swap into. Keep every overlapping
   // lesson intact in Pit and report it, just as configured recess creation does.
   if(t.location==='pit'){
    t.period=command.period;t.location='grid';span(next,t);
    for(const other of active(next).filter(other=>other.id!==t.id&&other.classIds.includes(t.classIds[0])&&overlaps(next,t,other))){
     if(other.kind!=='lesson')fail('Duplicate recess cards.');other.location='pit';other.period=null;
     next.warnings=next.warnings||[];next.warnings.push(classNames(next,other.classIds)+' '+(other.subject||'lesson')+' moved to Card Pit because it overlaps placed recess.');
    }
   }
   const order=next.periods.slice().sort((a,b)=>a.startMinutes-b.startMinutes),target=order.findIndex(p=>p.period===command.period);if(target<0)fail('Choose a valid period.',400);let index=order.findIndex(p=>p.period===t.period);
   while(index!==target){const direction=target>index?1:-1,oldSpan=span(next,t);index+=direction;t.period=order[index].period;const newSpan=span(next,t),added=newSpan.filter(n=>!oldSpan.includes(n)),removed=oldSpan.filter(n=>!newSpan.includes(n));if(added.length!==removed.length||added.length!==1)fail('Recess movement requires matching adjacent timetable slots.');
    const displaced=active(next).filter(other=>other.id!==t.id&&other.classIds.some(id=>t.classIds.includes(id))&&span(next,other).some(n=>added.includes(n)));for(const other of displaced){if(other.kind==='recess'||span(next,other).length!==1)fail('Move shared recess cards separately.');other.period=removed[0];}validate(next);
   }
  }else if(type==='resetRecesses'){
   for(const t of next.tiles.filter(t=>t.kind==='recess')){const cls=next.classes.find(c=>c.id===t.classIds[0]),def=next.recessDefaults.find(r=>r.level===cls.level),p=next.periods.find(p=>p.startMinutes===def?.startMinutes);if(!p)fail('Recess defaults do not fit this timetable.');t.period=p.period;t.durationMinutes=def.endMinutes-def.startMinutes;t.location='grid';for(const other of active(next).filter(x=>x.id!==t.id&&x.classIds.some(id=>t.classIds.includes(id))&&overlaps(next,x,t))){if(other.kind==='recess')fail('Duplicate recess cards.');other.location='pit';other.period=null;}}
  }else fail('Unsupported Stapler action.',400);
  next.status=plan.status==='confirmed'?'confirmed':'draft';next.revision=(plan.revision||0)+1;validate(next,{baseline:plan.baseline,previous:options.previous||plan});return next;
 }
 function cell(plan,tile){return [tile.subject,classNames(plan,tile.classIds),tile.venue,tile.group];}
 function canonicalCell(value){return [clean(value?.[0]),split(value?.[1]).join(', '),clean(value?.[2]),clean(value?.[3])];}
 function sameCell(a,b){return JSON.stringify(canonicalCell(a))===JSON.stringify(canonicalCell(b));}
 function comparisonIndex(plan){
  // Only canonical, immutable plans can retain a comparison index. Imported card
  // provenance stays intact; colours and ghosts describe the effective timetable.
  const immutable=validated.get(plan)?.immutable,cached=immutable&&comparisonIndexes.get(plan);if(cached)return cached;
  const entry=t=>[t.teacherId+'|'+t.period,{tile:t,key:JSON.stringify(canonicalCell(cell(plan,t)))}],index={before:new Map(plan.baseline.tiles.map(entry)),after:new Map(active(plan).filter(t=>t.kind==='lesson').map(entry))};
  if(immutable)comparisonIndexes.set(plan,index);return index;
 }
 function planId(plan){return plan.id||'stapler:'+plan.date;}
 function hasDaySnapshot(plan){return !!plan&&plan.daySnapshot?.schema===1&&Array.isArray(plan.daySnapshot.periods)&&Array.isArray(plan.daySnapshot.teachers)&&Array.isArray(plan.tiles)&&Array.isArray(plan.baseline?.tiles);}
 function snapshotPlan(plan,origin){
  validate(plan);const next=clone(plan);if(hasDaySnapshot(plan)&&plan.id)return acceptStored(next);next.id=planId(plan);
  if(!hasDaySnapshot(plan)){
   if(!origin){
    const base=plan.baseline;if(!Array.isArray(base.teachers)||!Array.isArray(base.classes)||!Array.isArray(base.periods)||!base.periods.length)fail('The original timetable needs Admin migration before saving.');
    // Legacy native plans retain immutable originals separately from working
    // cards. Rebuild from those originals, never from the edited projection.
    origin={id:plan.baselineId,modelId:plan.baselineId,date:plan.date,parity:base.parity,verified:true,schoolDay:true,endOfDayMinutes:base.endOfDayMinutes,venues:clone(base.venues||[]),subjectCategories:clone(base.subjectCategories||{}),periods:clone(base.periods),formClasses:clone(base.classes.filter(c=>c.traditional)),recesses:clone(base.recessDefaults||[]),teachers:base.teachers.map(t=>({...clone(t),cells:Array.from({length:Math.max(...base.periods.map(p=>p.period))+1},()=>['','','',''])}))};
    const teachers=new Map(origin.teachers.map(t=>[t.staffId,t]));for(const tile of base.tiles.filter(t=>t.kind==='lesson'&&t.location==='grid')){const teacher=teachers.get(tile.teacherId);if(!teacher||!base.periods.some(p=>p.period===tile.period)||tile.classIds.some(id=>!base.classes.some(c=>c.id===id)))fail('The original timetable needs Admin migration before saving.');teacher.cells[tile.period]=cell(base,tile);}
   }
   next.daySnapshot={...clone(origin),schema:1};
  }
  validate(next);return next;
 }
 // Only accounting evidence may come from a runtime day. Timetable cells,
 // teacher membership, timing and class catalogues always belong to the plan.
 const runtimeTeacherFields=['R','originalR','quotaSource','capConfigured','capBasis','periodCap','capVerified','capHeadroom','capWorkload','capVerificationReason','capWeekDays','capNonTeachingPeriods','rosterBasis'];
 function effectiveDay(plan,day){
  validate(plan);const stored=hasDaySnapshot(plan)?plan.daySnapshot:{},out=clone(stored),runtime=new Map((day?.teachers||[]).map(t=>[t.staffId,t])),metadata=new Map((stored.teachers||[]).map(t=>[t.staffId,t])),originalTeachers=new Set((plan.baseline.teachers||[]).map(t=>t.staffId));
  out.date=plan.date;out.id=planId(plan);out.modelId=out.id;out.parity=plan.parity||'single';out.verified=true;out.schoolDay=true;out.warning='';out.endOfDayMinutes=plan.endOfDayMinutes;out.subjectCategories=clone(plan.subjectCategories||{});out.periods=clone(plan.periods);out.formClasses=clone(plan.classes.filter(c=>c.traditional));
  if(day?.quotaSource!==undefined)out.quotaSource=clone(day.quotaSource);
  out.teachers=plan.teachers.filter(t=>!day?.compact||(Array.isArray(day.targetIds)?day.targetIds.includes(t.staffId):t.staffId===day.targetId)).map(t=>{const source=runtime.get(t.staffId),captured=clone(metadata.get(t.staffId)||{}),accounting={};if(day)for(const key of runtimeTeacherFields)delete captured[key];if(source)for(const key of runtimeTeacherFields)if(source[key]!==undefined)accounting[key]=clone(source[key]);return {...captured,...clone(t),...accounting,adhoc:!originalTeachers.has(t.staffId),cells:Array.from({length:Math.max(...plan.periods.map(p=>p.period))+1},()=>['','','',''])};});
  const teachers=new Map(out.teachers.map(t=>[t.staffId,t]));for(const t of active(plan).filter(t=>t.kind==='lesson')){const teacher=teachers.get(t.teacherId);if(teacher)teacher.cells[t.period]=cell(plan,t);}out.staplerRecesses=active(plan).filter(t=>t.kind==='recess').map(t=>({classId:t.classIds[0],periods:span(plan,t)}));out.staplerRevision=plan.revision;return out;
 }
 function changes(plan){validate(plan);const {before,after}=comparisonIndex(plan),empty=JSON.stringify(['','','','']);return [...new Set([...before.keys(),...after.keys()])].sort().flatMap(key=>{const b=before.get(key),a=after.get(key);if((b?.key||empty)===(a?.key||empty))return [];const tile=(a||b).tile;return [{staffId:tile.teacherId,period:tile.period,before:b?cell(plan,b.tile):['','','',''],after:a?cell(plan,a.tile):['','','','']}];});}
 function isTransfer(t){return !!t.source?.teacherId&&t.teacherId!==t.source.teacherId;}
 function tileState(plan,t){if(t.kind==='recess')return 'recess';if(t.location==='grid'&&comparisonIndex(plan).before.get(t.teacherId+'|'+t.period)?.key===JSON.stringify(canonicalCell(cell(plan,t))))return 'original';if(isTransfer(t))return 'transfer';return 'edited';}
 function isImportedPlacement(plan,t){return plan.importSource?.mode==='final-day'&&/^offline:\d+:\d+$/.test(t?.id)&&!!t.offlineSource&&t.location==='grid'&&JSON.stringify(source(t))===JSON.stringify(t.source);}
 function ghosts(plan){const {before,after}=comparisonIndex(plan);return plan.baseline.tiles.filter(original=>{const key=original.teacherId+'|'+original.period;return before.get(key)?.key!==after.get(key)?.key;}).map(clone);}
 // Final offline absence/dropped cells reserve availability, not teaching demand.
 function isOfflineAbsence(subject){return /^(?:Absent — .+|.+ \((?:absent|dropped) — .+\))$/i.test(clean(subject));}
 function activityCode(value){const code=clean(value).toUpperCase().replace(/\s+\((?:FOR|SWAPPED W\/) .+\)$/,'').replace(/\s*\([^)]*\)\s*$/,'').trim();return code==='TTT'?'PD':code;}
 function activityClassifier(subjectCategories){
  const categories=new Map(Object.entries(subjectCategories||{}).map(([key,value])=>[activityCode(key),value])),knownTeaching=new Set(['EL','ENG','ENGLISH','MA','MATH','MATHS','MATHEMATICS','SCI','SCIENCE','MT','MTL','HMT','HMTL','CL','ML','TL','HCL','HML','HTL','PE','PHE','ART','MUSIC','CCE','RRP','SDR']);
  return t=>{if(isOfflineAbsence(t.subject))return {kind:null,known:true,cap:false};const subject=activityCode(t.subject),category=categories.get(subject);if(['BLK','BLOCK','RECESS','BREAK'].includes(subject))return {kind:null,known:true,cap:false};if(category==='Teaching')return {kind:'teaching',known:true,cap:true};if(category==='FTT')return {kind:'nonTeaching',known:true,cap:true};if(category==='Non-teaching')return {kind:'nonTeaching',known:true,cap:false};if(category==='Unclassified')return {kind:t.classIds?.length||t.group?'teaching':'nonTeaching',known:false,cap:false};if(['FT','FTT','FTGP','ASSEMBLY'].includes(subject)||/^FORM(?:\s|\d|$)/.test(subject))return {kind:'nonTeaching',known:true,cap:true};if(['PD','DUTY','INVIGILATION'].includes(subject))return {kind:'nonTeaching',known:true,cap:false};return {kind:t.classIds?.length||t.group?'teaching':'nonTeaching',known:category!=='Unclassified'&&knownTeaching.has(subject),cap:knownTeaching.has(subject)};};
 }
 // Count the selected Odd/Even week, never its fortnight average. Unknown cells fail closed.
 function capWorkload(cells,subjectCategories,basis='teaching',nonTeachingPeriods=null,diagnostics={}){
  const missing=reason=>{diagnostics.reason=reason;return null;};
  if(!Array.isArray(cells))return missing('The selected week timetable is unavailable.');
  if(!['teaching','total'].includes(basis))return missing('The weekly cap basis is missing or unsupported.');
  const classify=activityClassifier(subjectCategories),printed=new Map(),reserved=new Map();let total=0;
  if(basis==='total'){
   if(!nonTeachingPeriods||typeof nonTeachingPeriods!=='object'||Array.isArray(nonTeachingPeriods))return missing('Weekly non-teaching reservations are missing.');
   for(const [key,value] of Object.entries(nonTeachingPeriods)){const code=activityCode(key);if(!code||!Number.isFinite(value)||value<0)return missing('Invalid weekly non-teaching reservation: '+key+'.');reserved.set(code,(reserved.get(code)||0)+value);}
  }
  for(const c of cells){if(!c?.some(x=>clean(x)))continue;const a=classify({subject:c[0],classIds:c[1]?[c[1]]:[],group:c[3]});if(!a.known)return missing('Unclassified activity: '+clean(c[0])+'.');if(a.cap)total++;else if(basis==='total'&&a.kind==='nonTeaching'){const code=activityCode(c[0]);printed.set(code,(printed.get(code)||0)+1);}}
  // Weekly duties may be absent from the grid. Retain those reservations, while
  // matching printed activities replace rather than duplicate the same count.
  if(basis==='total')for(const code of new Set([...printed.keys(),...reserved.keys()]))total+=Math.max(printed.get(code)||0,reserved.get(code)||0);
  return total;
 }
 // Relief belongs to the transferred card's immutable source, even when its
 // visible content equals the recipient's baseline lesson.
 function accounting(plan,subjectCategories=plan.subjectCategories){
  validate(plan);const classification=activityClassifier(subjectCategories);
  const baselineByTeacher=new Map(),currentByTeacher=new Map();for(const t of plan.baseline.tiles){const list=baselineByTeacher.get(t.teacherId)||[];list.push(t);baselineByTeacher.set(t.teacherId,list);}for(const t of active(plan).filter(t=>t.kind==='lesson')){const list=currentByTeacher.get(t.teacherId)||[];list.push(t);currentByTeacher.set(t.teacherId,list);}
  return plan.teachers.map(teacher=>{const baseline=(baselineByTeacher.get(teacher.staffId)||[]).filter(t=>classification(t).kind),allCurrent=currentByTeacher.get(teacher.staffId)||[],current=allCurrent.filter(t=>!isTransfer(t)&&classification(t).kind),relief=allCurrent.filter(t=>isTransfer(t)),count=(list,k)=>list.filter(t=>classification(t).kind===k).length,unknownActivities=[...new Set([...baseline,...current].filter(t=>!classification(t).known).map(t=>t.subject))];return {staffId:teacher.staffId,ordinaryBaseline:baseline.length,ordinaryCurrent:current.length,teachingDelta:count(current,'teaching')-count(baseline,'teaching'),nonTeachingDelta:count(current,'nonTeaching')-count(baseline,'nonTeaching'),capWorkloadDelta:current.filter(t=>classification(t).cap).length-baseline.filter(t=>classification(t).cap).length,totalWorkloadDelta:current.length-baseline.length,teachingDemandDelta:count(allCurrent,'teaching')-count(baseline,'teaching'),unknownActivities,reliefPeriods:relief.map(t=>t.period),reliefCount:relief.length,transfers:relief.map(t=>({tileId:t.id,period:t.period,sourceTeacherId:t.source.teacherId,subject:t.subject,className:classNames(plan,t.classIds),venue:t.venue,group:t.group}))};});
 }
 // Import the final dated timetable. The workbook supplies teacher membership only;
 // its old lessons and source-card provenance do not constrain the final placements.
 function offlineDay(plan,payload,options={}){
  validate(plan);
  if(!payload||!['Stapler','Staple'].includes(payload.app)||!Array.isArray(payload.tiles)||payload.tiles.length>30000)fail('Choose a saved Offline JSON plan.',400);
  if(payload.selectedDate!==plan.date)fail('Offline JSON date does not match this Stapler date.');
  if(!['plan','relief'].includes(payload.stateType))fail('Choose an Offline JSON Plan or Relief state.',400);
  if(payload.reliefAbsences!=null&&!Array.isArray(payload.reliefAbsences))fail('Invalid Offline JSON relief records.',400);
  if(plan.parity&&plan.parity!=='single'&&/odd|even/i.test(payload.selectedSheet||'')&&!new RegExp(plan.parity,'i').test(payload.selectedSheet))fail('Offline JSON week does not match the selected date.');
  const start=minute(payload.startTime),duration=Number(payload.periodMinutes),order=plan.periods.slice().sort((a,b)=>a.startMinutes-b.startMinutes);
  if(start!==order[0].startMinutes||!Number.isFinite(duration)||order.some((p,i)=>p.startMinutes!==start+i*duration||p.period!==i||p.endMinutes-p.startMinutes!==duration))fail('Offline JSON period timings do not match this baseline.');
  const dayName=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(plan.date+'T12:00:00Z').getUTCDay()];
  if(payload.selectedDay&&payload.selectedDay!==dayName)fail('Offline JSON weekday does not match its date.');
  if(!clean(payload.selectedSheet))fail('Offline JSON has no selected timetable sheet.',400);
  const incoming=payload.tiles.filter(t=>t.sheet===payload.selectedSheet&&t.day===(payload.selectedDay||dayName));
  if(payload.workbookBase64&&!options.workbook)fail('Read the embedded teacher list before importing Offline JSON.',400);
  const wb=options.workbook,week=wb?.single||(/^odd(?:\s+week)?$/i.test(payload.selectedSheet)?wb?.odd:/^even(?:\s+week)?$/i.test(payload.selectedSheet)?wb?.even:null);
  if(wb&&(!week||week.days&&!week.days.includes(dayName))||!wb&&payload.tiles.length&&!payload.tiles.some(t=>t.sheet===payload.selectedSheet))fail('Offline JSON selected sheet or day is not in its workbook.',400);
  const roster=[wb?.single,wb?.odd,wb?.even].filter(Boolean).flatMap(w=>w.blocks||[]).map(b=>b.name);
  // A teacher can have no tiles on this date. Use the whole workbook roster, not
  // just placed cards, to distinguish a blank day from someone absent from the file.
  const names=[...new Set([...roster,...payload.tiles.map(t=>t.teacher),...(payload.addedTeachers||[]),...(payload.adHocTeachers||[]).map(t=>typeof t==='string'?t:t.name||t.teacher),...(payload.teacherSuspensions||[]).map(t=>t.teacher),...(payload.reliefAbsences||[]).flatMap(a=>[a.teacher,...Object.values(a.assignments||{})])].map(clean).filter(Boolean))];
  if(!names.length||names.length>500||names.some(n=>n.length>160))fail('Offline JSON has no valid teacher list.',400);
  return {incoming,names};
 }
 const importNameKey=value=>norm(value).replace(/^(mr|mrs|ms|mdm|miss|dr)\.?\s+/,'').replace(/\s*\((?:sre|fajt|bt|ut|rt|4\/5)\)\s*/g,' ').replace(/[^a-z0-9]/g,'');
 function importNameDistance(a,b){
  let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}return row[b.length];
 }
 function importContactEligible(person){
  if(!person||person.importEligible===false)return false;
  const profile=person.profile||{},excluded=/^(?:MK(?:\b.*)?|MKE)$/i,category=value=>String(value||'').trim().replace(/^(?:acting|ag)\.?\s+/i,'');
  return !person.mk&&!profile['MK Modifier']&&![person.role,profile.Role,person.employment,profile['Employment Modifier'],...(person.groups||[])].some(value=>excluded.test(category(value)));
 }
 function offlineIdentities(plan,payload,options,info){
  const people=new Map((options.people||[]).map(p=>[p.staffId||p.id,{...p,staffId:p.staffId||p.id}]));
  for(const p of plan.teachers)if(!options.people||people.has(p.staffId))people.set(p.staffId,{...p,...people.get(p.staffId),timetableName:p.timetableName||p.name});
  const allowed=importContactEligible,resolved=new Map(),issues=[];
  for(const name of info.names){
   const key=importNameKey(name),exact=[...people.values()].filter(p=>[p.name,p.timetableName].some(n=>n&&norm(n)===norm(name))),links=(options.nameBridges||[]).filter(b=>importNameKey(b.timetableName)===key),linked=links.map(b=>b.staffId).filter(id=>people.has(id));
   let candidates=[...new Set([...exact.map(p=>p.staffId),...linked])];const manual=options.teacherMappings?.[name],id=manual||(candidates.length===1?candidates[0]:null);
   if(id&&allowed(people.get(id))){resolved.set(name,id);continue;}
   let reason=id&&people.has(id)?'excluded':candidates.length?'ambiguous':'missing';
   candidates=candidates.filter(id=>allowed(people.get(id)));
   if(!candidates.length&&reason!=='excluded'){candidates=[...people.values()].filter(allowed).map(p=>({id:p.staffId,distance:Math.min(...[p.name,p.timetableName].filter(Boolean).map(n=>importNameDistance(key,importNameKey(n))))})).filter(p=>p.distance<=Math.max(1,Math.ceil(key.length/4))).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id)).slice(0,5).map(p=>p.id);if(candidates.length)reason='fuzzy';}
   issues.push({name,candidates,reason});
  }
  return {people,resolved,issues};
 }
 function importIssues(plan,payload,options={}){const info=offlineDay(plan,payload,options);return offlineIdentities(plan,payload,options,info).issues;}
 // The offline file saves planning tiles and Relief decisions separately. Flatten
 // the latter using its Relief export precedence, without creating online history.
 function overlayOfflineRelief(next,payload,info,teacherId,generation){
  const records=payload.reliefAbsences||[];if(!records.length)return;
  const key=(id,p)=>JSON.stringify([id,p]),planned=new Map(),absent=new Set(),coverage=new Set(),decisions=[];
  for(const t of active(next).filter(t=>t.kind==='lesson')){period(next,t.period);const k=key(t.teacherId,t.period);if(planned.has(k))fail('Offline JSON has conflicting teacher periods. Resolve the names or planning cards before importing.');planned.set(k,t);}
  const validPeriod=value=>{if(!/^(0|[1-9]\d*)$/.test(String(value)))fail('Invalid Offline JSON relief period.',400);const p=Number(value);period(next,p);return p;};
  const object=value=>value==null?{}:typeof value==='object'&&!Array.isArray(value)?value:fail('Invalid Offline JSON relief decisions.',400);
  const signature=(name,p)=>payload.startTime+'|'+payload.periodMinutes+'|'+p+'␞'+info.incoming.filter(t=>t.location!=='pit'&&t.teacher===name&&Number(t.assignedPeriod)===p).map(t=>[t.id,clean(t.subject),clean(t.className),clean(t.venue),clean(t.group)].join('␟')).sort().join('␝');
  for(const a of records){
   if(!a||!Array.isArray(a.periods)||!teacherId(a.teacher))fail('Invalid Offline JSON absence details.',400);
   const id=teacherId(a.teacher),periods=a.periods.map(validPeriod),assignments=object(a.assignments),swaps=object(a.swaps),signatures=object(a.planSignatures),swapSignatures=object(a.swapPlanSignatures);
   if(a.noRelief!=null&&!Array.isArray(a.noRelief))fail('Invalid Offline JSON no-relief periods.',400);
   const noRelief=(a.noRelief||[]).map(validPeriod);
   if(noRelief.some(p=>!periods.includes(p)))fail('Offline JSON has a no-relief decision outside its absence.');
   for(const p of periods){const k=key(id,p);if(absent.has(k))fail('Offline JSON has overlapping absence periods. Resolve the names or absences before importing.');absent.add(k);}
   for(const [per,name] of Object.entries(assignments)){
    const p=validPeriod(per),coverId=teacherId(name),lesson=planned.get(key(id,p)),swap=!!swaps[per];
    if(!periods.includes(p)||noRelief.includes(p)||a.reliefNeeded===false||!coverId||!lesson)fail('Offline JSON relief does not match an absent lesson. Review it in the offline Relief module.');
    if(signatures[per]!=null&&signatures[per]!==signature(a.teacher,p)||swap&&swapSignatures[per]!=null&&swapSignatures[per]!==signature(name,p))fail('Offline JSON relief refers to an older planning timetable. Reopen and save it in the offline Relief module, then import again.');
    const k=key(coverId,p),own=planned.get(k);if(id===coverId||coverage.has(k)||!swap&&own)fail('Offline JSON has clashing relief assignments. Review them in the offline Relief module.');
    coverage.add(k);decisions.push({a,id,p,coverId,coverName:clean(name),lesson,own,swap});
   }
  }
  if(decisions.some(d=>absent.has(key(d.coverId,d.p))))fail('Offline JSON assigns relief to a teacher who is absent in that period.');
  const final=new Map(planned);
  function place(id,p,details,subject){
   const previous=final.get(key(id,p)),t={id:previous?.id||newId(next,'offline:'+generation),kind:'lesson',baselineId:null,teacherId:id,classIds:details?.classIds.slice()||[],subject:text(subject),venue:details?.venue||'',group:details?.group||'',location:'grid',period:p};
   t.source=source(t);t.offlineSource={teacherId:id,teacher:next.teachers.find(t=>t.staffId===id).timetableName,period:p,subject:t.subject,className:classNames(next,t.classIds),venue:t.venue,group:t.group};
   if(previous)next.tiles[next.tiles.indexOf(previous)]=t;else next.tiles.push(t);final.set(key(id,p),t);
  }
  for(const a of records){const id=teacherId(a.teacher),reason=clean(a.reason)==='Others'?clean(a.reasonOther)||'Others':clean(a.reason)||'Unspecified';for(const value of a.periods){const p=Number(value),lesson=planned.get(key(id,p));place(id,p,lesson,lesson?(lesson.subject||'Lesson')+' (absent — '+reason+')':'Absent — '+reason);}}
  for(const d of decisions){place(d.coverId,d.p,d.lesson,(d.lesson.subject||'Relief')+' ('+(d.swap?'swapped w/':'for')+' '+clean(d.a.teacher)+')');if(d.swap&&d.own)place(d.id,d.p,d.own,(d.own.subject||'Lesson')+' (dropped — swapped w/ '+d.coverName+')');
   final.get(key(d.coverId,d.p)).importedRelief={version:1,kind:d.swap?'combine':'cover',linkedTileId:final.get(key(d.id,d.p)).id,lesson:{tileId:d.lesson.id,date:next.date,...source(d.lesson)}};
  }
 }
 // Older final-day imports flattened relief into text. Only an unchanged,
 // unambiguous pair of imported source cells can safely recover that link.
 function reviewImportedRelief(plan){
  validate(plan);const matched=[],converted=[],uncertain=[],same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),owned=t=>t.kind==='lesson'&&!!t.offlineSource&&/^offline:\d+:\d+$/.test(t.id)&&t.source.teacherId===t.offlineSource.teacherId&&t.source.period===t.offlineSource.period&&['subject','venue','group'].every(k=>t.source[k]===t.offlineSource[k]),unchanged=t=>t.location==='grid'&&same(source(t),t.source);
  const teacherNames=new Map(),originalSlots=new Map();for(const teacher of plan.teachers)for(const value of new Set([teacher.name,teacher.timetableName].map(norm))){if(!teacherNames.has(value))teacherNames.set(value,[]);teacherNames.get(value).push(teacher);}
  for(const t of plan.tiles)if(owned(t)){const key=JSON.stringify([t.source.teacherId,t.source.period]);if(!originalSlots.has(key))originalSlots.set(key,[]);originalSlots.get(key).push(t);}
  for(const t of plan.tiles){
   if(t.importedRelief){converted.push({tileId:t.id,relief:clone(t.importedRelief)});continue;}
   if(plan.importSource?.mode!=='final-day'||!owned(t))continue;
   const annotation=/^(.+) \((for|swapped w\/) (.+)\)$/.exec(t.source.subject);if(!annotation)continue;
   const reject=reason=>uncertain.push({tileId:t.id,reason}),teachers=teacherNames.get(norm(annotation[3]))||[];
   if(!unchanged(t)){reject('This relief tile has later manual changes.');continue;}
   if(teachers.length!==1||teachers[0].staffId===t.teacherId){reject('The original teacher is not an exact unique match.');continue;}
   const teacherId=teachers[0].staffId,links=originalSlots.get(JSON.stringify([teacherId,t.source.period]))||[];
   if(links.length!==1||!unchanged(links[0])){reject('The linked original lesson is missing or has later changes.');continue;}
   const link=links[0];
   if(annotation[2]!=='for'){reject('This older combined relief needs the original Offline JSON to verify both lessons.');continue;}
   if(!link.source.subject.startsWith(annotation[1]+' (absent — ')||!link.source.subject.endsWith(')')||!same(link.source.classIds,t.source.classIds)||['venue','group'].some(k=>link.source[k]!==t.source[k])){reject('The original lesson does not match the imported relief source.');continue;}
   matched.push({tileId:t.id,relief:{version:1,kind:'cover',linkedTileId:link.id,lesson:{tileId:link.id,date:plan.date,...clone(link.source),subject:annotation[1]}}});
  }
  const counts=new Map();for(const row of matched)counts.set(row.relief.linkedTileId,(counts.get(row.relief.linkedTileId)||0)+1);
  return {matched:matched.filter(row=>{if(counts.get(row.relief.linkedTileId)===1)return true;uncertain.push({tileId:row.tileId,reason:'More than one relief tile refers to this original lesson.'});return false;}),converted,uncertain};
 }
 function convertImportedRelief(plan){
  const review=reviewImportedRelief(plan);if(!review.matched.length)return plan;
  const next=clone(plan),tiles=new Map(next.tiles.map(t=>[t.id,t]));for(const row of review.matched)tiles.get(row.tileId).importedRelief=clone(row.relief);
  next.revision=(plan.revision||0)+1;validate(next,{baseline:plan.baseline,previous:plan});return next;
 }
 function importLegacy(plan,payload,options={}){
  const info=offlineDay(plan,payload,options),identity=offlineIdentities(plan,payload,options,info);
  if(identity.issues.length){const error=Error('Resolve Offline JSON teacher identities: '+identity.issues.map(i=>i.name+' ('+i.reason+')').join(', ')+'. Use Name Bridge or select a verified Contacts identity.');error.status=409;error.identityIssues=identity.issues;throw error;}
  const next=clone(plan),represented=new Set(identity.resolved.values()),teacherId=name=>identity.resolved.get(clean(name)),warnings=[];
  next.tiles=clone(plan.baseline.tiles).concat(plan.tiles.filter(t=>t.kind==='recess').map(t=>({...clone(t),location:'grid',period:t.source.period})));next.mats=[];
  next.teachers=clone(plan.teachers);next.classes=clone(plan.baseline.classes);
  for(const t of next.tiles)if(t.kind==='lesson'&&represented.has(t.teacherId)){t.location='pit';t.period=null;}
  for(const id of represented)if(!next.teachers.some(t=>t.staffId===id)){const person=identity.people.get(id);next.teachers.push({staffId:id,name:person.name,timetableName:person.name,adhoc:true});}
  const addClass=name=>{let matches=next.classes.filter(c=>classKey(c.name)===classKey(name));if(matches.length>1)fail('Class “'+name+'” needs an exact mapping.');if(!matches.length){const cls={id:'offline-class:'+encodeURIComponent(name),name,level:null,traditional:false,venue:'',adhoc:true};next.classes.push(cls);matches=[cls];}return matches[0].id;};
  for(const name of payload.customClasses||[])if(clean(name))addClass(text(name,160));
  const currentClasses=value=>{const name=clean(value);if(!name)return [];const exact=next.classes.find(c=>classKey(c.name)===classKey(name));if(exact)return [exact.id];return [...new Set(name.split(',').map(clean).filter(Boolean).flatMap(part=>{const match=next.classes.find(c=>classKey(c.name)===classKey(part));if(match)return [match.id];const fragments=split(part),existing=fragments.map(n=>next.classes.find(c=>classKey(c.name)===classKey(n)));return existing.length>1&&existing.every(Boolean)?existing.map(c=>c.id):[addClass(text(part,160))];}))];};
  // Fresh IDs preserve immutable source snapshots across reimports. Old imported
  // cards are replaced, so the plan does not accumulate duplicate import history.
  const generation=1+Math.max(0,...plan.tiles.map(t=>Number(/^offline:(\d+):/.exec(t.id)?.[1])||0));
  const rawIds=new Set();
  for(const [index,raw] of info.incoming.entries()){
   if(!['teacher','class','pit'].includes(raw.location))fail('Invalid Offline JSON card location.',400);
   if(raw.id){if(rawIds.has(raw.id))fail('Offline JSON contains duplicate card identifiers.',400);rawIds.add(raw.id);}
   if(raw.location==='pit')continue;
   if(raw.assignedPeriod===null||raw.assignedPeriod===undefined||!Number.isInteger(Number(raw.assignedPeriod)))fail('A placed Offline JSON card has no valid period.',400);
   const t={id:'offline:'+generation+':'+index,kind:'lesson',baselineId:null,teacherId:teacherId(raw.teacher),classIds:currentClasses(raw.className),subject:text(clean(raw.subject)),venue:text(clean(raw.venue)),group:text(clean(raw.group)),location:'grid',period:Number(raw.assignedPeriod)};
   t.source=source(t);t.offlineSource={teacherId:t.teacherId,teacher:clean(raw.teacher),period:t.period,subject:t.subject,className:clean(raw.className),venue:t.venue,group:t.group};next.tiles.push(t);
  }
  overlayOfflineRelief(next,payload,info,teacherId,generation);
  // Teacher-assigned RECESS is a staffed duty. Keep it as a lesson; park the
  // generated class recess marker instead of deleting or moving imported duties.
  for(const recess of next.tiles.filter(t=>t.kind==='recess')){
   const lessons=active(next).filter(t=>t.kind==='lesson'&&t.classIds.some(id=>recess.classIds.includes(id))),staffed=lessons.filter(t=>/^recess$/i.test(t.subject));
   if(staffed.length||recess.location==='grid'&&lessons.some(t=>overlaps(next,t,recess))){recess.location='pit';recess.period=null;warnings.push(classNames(next,recess.classIds)+': configured recess marker is in Card Pit'+(staffed.length?' because the imported plan contains staffed RECESS.':' to preserve the imported lesson placements. Review recess before confirming.'));}
  }
  const knownVenues=new Set(next.venues.map(v=>norm(typeof v==='string'?v:v.name||v.label||''))),customVenues=[...new Set(next.tiles.filter(t=>t.kind==='lesson'&&t.venue&&!knownVenues.has(norm(t.venue))).map(t=>t.venue))];
  if(customVenues.length)warnings.push('Offline venue text retained for review: '+customVenues.join(', ')+'.');
  next.warnings=[...new Set([...(plan.warnings||[]),...warnings])];next.status=plan.status==='confirmed'?'confirmed':'draft';next.revision=(plan.revision||0)+1;next.importSource={mode:'final-day',app:payload.app,version:clean(payload.version),savedAt:clean(payload.savedAt),eventName:clean(payload.eventName),fileName:clean(payload.fileName),selectedSheet:clean(payload.selectedSheet),selectedDay:clean(payload.selectedDay)};
  validate(next,{baseline:plan.baseline,previous:plan});return next;
 }
 return {planId,hasDaySnapshot,snapshotPlan,validationVersion,acceptStored,canonical,copyValidated,create,createStandalone,importNative,comparison,redate,apply,validate,effectiveDay,canonicalCell,sameCell,changes,accounting,capWorkload,activityClassifier,isOfflineAbsence,importContactEligible,importIssues,importLegacy,reviewImportedRelief,convertImportedRelief,ghosts,tileState,isImportedPlacement,tilePeriods:span,defaultRecesses,recessGroups};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISRosterStapler;
