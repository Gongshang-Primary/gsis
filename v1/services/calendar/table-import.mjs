import { ApiError } from '../../runtime/errors.mjs';
import { canonical, digest, query, abortOperation } from '../../runtime/store.mjs';
import { secureEqual, resolveAdmission } from '../../runtime/admission.mjs';
const MAX_ROWS = 128, MAX_CHANGED = 12, MAX_BYTES = 262144;
const FIELDS = {
  lanes: ['LaneID','Header','SortOrder','Active','SupportsShift','ShiftALabel','ShiftBLabel','DefaultWeekday','DefaultEventType','DefaultStartTime','DefaultEndTime','ShiftADefaultStartTime','ShiftADefaultEndTime','ShiftBDefaultStartTime','ShiftBDefaultEndTime','SyncToStaffCalendar','Notes','Schedule'],
  tags: ['Tag','Meaning','Active','SortOrder'],
};
const need = (condition, code, message, status = 400) => {
  if (!condition) throw new ApiError(code, status, message);
};
const identity = (kind, value) => kind === 'tags' ? String(value).replace(/^\[|\]$/g,'').toLowerCase() : String(value);
const fields = kind => { need(Object.hasOwn(FIELDS,kind),'WORKBOOK_KIND','Only Columns and Glossary workbooks are supported.'); return FIELDS[kind]; };
const sourceIdentity = rows => rows.map(row => [row.record_id,row.revision,row.data_json]);
const byteSize = value => new TextEncoder().encode(canonical(value)).byteLength;
async function state(ctx, kind) {
  fields(kind);
  const rows = await query(ctx.env.DB,'SELECT record_id,revision,year,data_json FROM calendar_metadata WHERE school_id=? AND kind=? ORDER BY record_id LIMIT 129',[ctx.principal.schoolId,kind]);
  need(rows.length <= MAX_ROWS,'WORKBOOK_BOUNDS','Use at most 128 records per Calendar workbook.',413);
  return rows;
}
// Owner-local backup producers may reuse this exact projection; no read observation
// increments a revision and no workbook carries provider or application grants.
export async function metadataWorkbook(rows, schoolId, kind) {
  const names = fields(kind);
  need(rows.length <= MAX_ROWS,'WORKBOOK_BOUNDS','Use at most 128 records per Calendar workbook.',413);
  need(rows.every(row=>row.year===undefined||row.year===0),'WORKBOOK_SCOPE','Use the normal editor for year-specific Calendar definitions.');
  const sorted = [...rows].sort((a,b) => a.record_id < b.record_id ? -1 : a.record_id > b.record_id ? 1 : 0);
  need(byteSize(sourceIdentity(sorted)) <= MAX_BYTES,'WORKBOOK_BOUNDS','Calendar source exceeds the 256 KiB atomic import bound.',413);
  const book = { schemaVersion:1, owner:'calendar', schoolId, kind,
    sourceRevision:await digest(sourceIdentity(sorted)),
    sheets:{ Records:{ columns:['Record ID','Source revision',...names], rows:sorted.map(row => {
      const data = JSON.parse(row.data_json);
      return [row.record_id,row.revision,...names.map(field => data[field] == null ? null : typeof data[field] === 'object' ? canonical(data[field]) : data[field])];
    }) } } };
  need(byteSize(book) <= MAX_BYTES,'WORKBOOK_BOUNDS','Calendar workbook exceeds 256 KiB.',413);
  return book;
}
export async function tableWorkbook(ctx,p) {
  return metadataWorkbook(await state(ctx,p.kind),ctx.principal.schoolId,p.kind);
}
function fieldError(field,value) {
  if (field === 'Schedule') {
    if (value == null) return '';
    if (!Array.isArray(value) || value.length > 7) return 'Use a JSON array of at most seven weekday schedule rows.';
    const days = new Set();
    for (const row of value) {
      if (!row || typeof row !== 'object' || !['MON','TUE','WED','THU','FRI','SAT','SUN'].includes(row.Weekday) || days.has(row.Weekday)) return 'Schedule weekdays must be unique MON–SUN values.';
      days.add(row.Weekday);
      if (!['Yes','No'].includes(row.Enabled)) return 'Schedule Enabled must be Yes or No.';
      for (const [key,v] of Object.entries(row)) {
        if (!['Weekday','Enabled','DefaultStartTime','DefaultEndTime','ShiftADefaultStartTime','ShiftADefaultEndTime','ShiftBDefaultStartTime','ShiftBDefaultEndTime'].includes(key)) return 'Unknown schedule field.';
        if (key.endsWith('Time') && v !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return 'Schedule times must use HH:mm or blank.';
      }
    }
    return '';
  }
  if (field === 'SortOrder') return value === '' || Number.isSafeInteger(value) && value >= 0 && value <= 10000 ? '' : 'SortOrder must be a whole number from 0 to 10000, or blank.';
  if (typeof value !== 'string' || value.length > 4000 || value.includes('\0')) return 'Use bounded plain text (at most 4000 characters).';
  if (['Active','SupportsShift','SyncToStaffCalendar'].includes(field) && !['Yes','No'].includes(value)) return 'Use Yes or No.';
  if (field.endsWith('Time') && value !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return 'Use HH:mm or blank.';
  if (field === 'DefaultWeekday' && !['ANY','MON','TUE','WED','THU','FRI','SAT','SUN'].includes(value)) return 'Use ANY or MON–SUN.';
  if (field === 'DefaultEventType' && !['ALL_DAY','TIMED','MULTI_DAY'].includes(value)) return 'Use ALL_DAY, TIMED or MULTI_DAY.';
  if (['Header','Meaning'].includes(field) && !value.trim()) return 'A value is required.';
  return '';
}
async function validate(ctx,p) {
  const book=p.workbook, kind=book?.kind, names=fields(kind);
  need(byteSize(book) <= MAX_BYTES,'WORKBOOK_BOUNDS','Calendar workbook exceeds 256 KiB.',413);
  need(book.schemaVersion===1 && book.owner==='calendar' && book.schoolId===ctx.principal.schoolId,'WORKBOOK_SCOPE','Use a Calendar workbook from this school.',403);
  const rows=await state(ctx,kind), current=await metadataWorkbook(rows,ctx.principal.schoolId,kind);
  need(book.sourceRevision===current.sourceRevision,'METADATA_CONFLICT','Calendar definitions changed after export. Export again and reconcile.',409);
  need(book.sheets && Object.keys(book.sheets).join('|')==='Records','WORKBOOK_SCHEMA','The workbook must contain the Records worksheet.');
  const sheet=book.sheets.Records;
  need(canonical(sheet.columns)===canonical(current.sheets.Records.columns) && Array.isArray(sheet.rows) && sheet.rows.length<=MAX_ROWS,'WORKBOOK_SCHEMA','Use the canonical Calendar columns and bounded rows.');
  const existing=new Map(rows.map(row=>[row.record_id,row])), seen=new Set(), errors=[], changes=[];
  sheet.rows.forEach((values,rowIndex)=>{
    const bad=(column,message)=>errors.push({row:rowIndex,column,message});
    if (!Array.isArray(values)||values.length!==names.length+2) {bad(0,'The row width differs from the canonical export.');return;}
    const key=identity(kind,values[0]), before=existing.get(key);
    if (!before||seen.has(key)||values[0]!==key) {bad(0,'Use each existing canonical Record ID once. Add new definitions using the normal editor.');return;}
    seen.add(key);
    if (values[1]!==before.revision) {bad(1,'Source revision must remain unchanged.');return;}
    const old=JSON.parse(before.data_json), edits={};
    names.forEach((field,index)=>{
      let value=values[index+2];
      if (field==='Schedule' && value!=null) {
        try {value=JSON.parse(value);} catch {bad(index+2,'Schedule must be valid JSON.');return;}
      }
      if(canonical(value??null)===canonical(old[field]??null))return;
      if(index===0) {bad(index+2,'The definition identity is read-only.');return;}
      const error=fieldError(field,value);
      if(error)bad(index+2,error);else edits[field]=value;
    });
    if(Object.keys(edits).length)changes.push({row:rowIndex,id:key,before,edits});
  });
  if(changes.length>MAX_CHANGED)errors.push({row:null,column:null,message:'Change at most 12 existing records per atomic import.'});
  return {book,kind,rows,changes,errors};
}
async function signature(ctx,book,expiresAt) {
  need(ctx.env.GSIS_SECRET,'CONFIGURATION_REQUIRED','Backend signing secret is not configured.',503);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(ctx.env.GSIS_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const payload=canonical({purpose:'calendar-table-preview-v1',schoolId:ctx.principal.schoolId,actorId:ctx.principal.actorId,expiresAt,book});
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function previewTableImport(ctx,p) {
  const checked=await validate(ctx,p), expiresAt=ctx.now+900000;
  return { valid:!checked.errors.length, errors:checked.errors, changedRecords:checked.changes.length,
    changes:checked.changes.map(change=>({id:change.id,fields:Object.keys(change.edits)})),
    expiresAt, previewToken:checked.errors.length?null:await signature(ctx,checked.book,expiresAt) };
}
async function applyValidated(ctx,op,p,{metadataPlan,finish}) {
  need(Number.isSafeInteger(p.expiresAt)&&p.expiresAt>ctx.now&&p.expiresAt<=ctx.now+900000,'PREVIEW_EXPIRED','Obtain a current workbook preview.',409);
  const checked=await validate(ctx,p);
  need(!checked.errors.length,'WORKBOOK_INVALID','Correct the workbook and obtain a new preview.');
  need(await secureEqual(p.previewToken,await signature(ctx,checked.book,p.expiresAt)),'PREVIEW_CHANGED','The workbook differs from the preview or its actor.',409);
  const years=checked.kind==='lanes'?await query(ctx.env.DB,"SELECT year FROM calendar_years WHERE school_id=? AND released=1 AND status<>'ARCHIVED' ORDER BY year LIMIT 9",[ctx.principal.schoolId]):[];
  need(years.length<=8,'WORKBOOK_BOUNDS','Use normal column edits when more than eight calendar years are released.',413);
  const predicates=[{
    sql:'SELECT COUNT(*)=json_array_length(?) AND NOT EXISTS(SELECT 1 FROM calendar_metadata m LEFT JOIN json_each(?) j ON json_extract(j.value,\'$[0]\')=m.record_id AND json_extract(j.value,\'$[1]\')=m.revision AND json_extract(j.value,\'$[2]\')=m.data_json WHERE m.school_id=? AND m.kind=? AND j.key IS NULL) AS ok FROM calendar_metadata WHERE school_id=? AND kind=?',
    args:[canonical(sourceIdentity(checked.rows)),canonical(sourceIdentity(checked.rows)),ctx.principal.schoolId,checked.kind,ctx.principal.schoolId,checked.kind],
  }], writes=[], outbox=new Map();
  for(const change of checked.changes){
    const key=checked.kind==='lanes'?'LaneID':'Tag';
    const plan=await metadataPlan(ctx,op,checked.kind==='lanes'?'saveLane':'saveTag',{[key]:JSON.parse(change.before.data_json)[key],...change.edits,revision:change.before.revision},{row:change.before,years});
    predicates.push(...plan.guards);writes.push(...plan.writes);
    for(const job of plan.outbox)outbox.set(job.id,job);
  }
  // Every lane uses the same released-year snapshot. Enforce that shared
  // predicate once while retaining each record's revision/dispatch predicates.
  const uniquePredicates=[...new Map(predicates.map(g=>[canonical(g),g])).values()];
  const args=uniquePredicates.flatMap(g=>g.args);
  need(args.length<=90 && writes.length<=12 && outbox.size<=8,'WORKBOOK_BOUNDS','The atomic import exceeds its query budget.',413);
  const guard={sql:'SELECT '+uniquePredicates.map(g=>'('+g.sql.replace(/ AS ok(?= FROM|$)/g,'')+')').join(' AND ')+' AS ok',args};
  return finish(ctx,op,[guard],writes,{saved:true,changedRecords:checked.changes.length,kind:checked.kind,sourceRevision:checked.book.sourceRevision},[...outbox.values()]);
}
export async function applyTableImport(ctx,op,p,dependencies) {
  try { return await applyValidated(ctx,op,p,dependencies); }
  catch (error) {
    // Fence a rejected/losing attempt only if it is still prepared. A racing
    // committed retry wins and its durable receipt remains authoritative.
    try {
      const receipt = await abortOperation(ctx.env.DB,op,error.code||'IMPORT_UNCONFIRMED',ctx.now);
      await resolveAdmission(ctx.env,ctx.env.DB,op,null,receipt,ctx.now);
      if(receipt?.state==='committed')return receipt.result;
    } catch { /* Keep an unknown outcome attached to its original operation. */ }
    throw error;
  }
}
