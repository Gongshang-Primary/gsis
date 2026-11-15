/** Contacts contract v1: no storage, transport or production dependencies. */
import { copy, freeze, id, instant, object } from '../core/contracts.mjs';
import { isDirectField, validateDirectRecord } from './direct-fields.mjs';
export { copy, freeze, id, instant };
export const LIMITS = freeze({ bytes: 262144, fields: 64, references: 128, entries: 256,
  records: 8, groups: 32, streams: 128, identities: 8192, depth: 16 });
export const GROUPS = freeze({
  authority: ['smc','eo','schoolLeader'],
  classification: ['profileState','schoolSection','personnelCategory','employmentArrangement','employmentStatus','employmentActive'],
  appointment: ['role','appointmentStatus','eoAppointmentLevel','memberships'],
  tags: ['employmentTags','subjectTags','mkTags'],
  display: ['basicName','ttbName'],
});
export const PROFILES = freeze({ authority: ['authority'], staff: ['classification','appointment','tags'], display: ['display'] });
export const FIELDS = freeze({ smc:'boolean', eo:'boolean', schoolLeader:'boolean', profileState:'profile',
  schoolSection:'hr-term', personnelCategory:'hr-term', employmentArrangement:'hr-term', employmentStatus:'hr-term',
  employmentActive:'boolean', role:'membership-role', appointmentStatus:'hr-term', eoAppointmentLevel:'hr-term',
  memberships:'membership-role[]', employmentTags:'operational-tag[]', subjectTags:'operational-tag[]', mkTags:'operational-tag[]',
  basicName:'text', ttbName:'text' });
export const CODES = freeze(['MALFORMED_QUERY','INVALID_EVIDENCE','SCHOOL_MISMATCH','STAFF_MISMATCH',
  'STALE_EVIDENCE','UNAVAILABLE','TIMEOUT','LIMIT_EXCEEDED','INCOMPLETE_EVIDENCE','REFERENCE_MISMATCH']);
export class ContactsError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function check(ok, code = 'INVALID_EVIDENCE') { if (!ok) throw new ContactsError(code); }
export function exact(value, required, optional = [], code = 'INVALID_EVIDENCE') {
  check(object(value) && required.every(k => Object.hasOwn(value,k)) &&
    Object.keys(value).every(k => required.includes(k) || optional.includes(k)), code);
}
export function list(value, max) { check(Array.isArray(value) && value.length <= max, 'LIMIT_EXCEEDED'); }
export function unique(values) { check(new Set(values).size === values.length); }
export function text(value, max = 160) { return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value); }
export function now(clock) { const t = clock(); check(instant(t), 'UNAVAILABLE'); return t; }
export function active(r, at) { return !r.revoked && r.validFrom <= at && (r.validUntil === null || at < r.validUntil); }
export function fieldNames(profile) { check(Object.hasOwn(PROFILES,profile)); return PROFILES[profile].flatMap(g => GROUPS[g]); }
export function reference(r) { exact(r,['catalogueId','revision','code']); check(id(r.catalogueId) && id(r.revision) && id(r.code)); }
export function refKey(r) { return JSON.stringify([r.catalogueId,r.revision]); }
export function bounded(value) {
  let nodes = 0; const ancestors = new Set();
  function walk(v, depth) {
    check(depth <= LIMITS.depth && ++nodes <= 32768, 'LIMIT_EXCEEDED');
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'number') { check(Number.isFinite(v)); return; }
    if (typeof v === 'string') { check(v.length <= LIMITS.bytes,'LIMIT_EXCEEDED'); return; }
    check(typeof v === 'object' && !ancestors.has(v));
    check(Array.isArray(v) || object(v)); ancestors.add(v);
    const descriptors = Object.getOwnPropertyDescriptors(v);
    check(Reflect.ownKeys(v).every(k => typeof k === 'string'));
    for (const [key,d] of Object.entries(descriptors)) {
      if (Array.isArray(v) && key === 'length') continue;
      check(Object.hasOwn(d,'value') && d.enumerable);
      walk(d.value,depth+1);
    }
    ancestors.delete(v);
  }
  walk(value,0);
  check(new TextEncoder().encode(JSON.stringify(value)).length <= LIMITS.bytes,'LIMIT_EXCEEDED');
  return freeze(copy(value));
}
export function query(input, schoolId, historical = false) {
  bounded(input);
  exact(input, ['schemaVersion','schoolId','staffId','profile','evaluationId', ...(historical ? ['snapshotId','revision','sequence','contentDigest'] : [])], [], 'MALFORMED_QUERY');
  check(input.schemaVersion === 1 && id(input.staffId) && id(input.evaluationId) && Object.hasOwn(PROFILES,input.profile),'MALFORMED_QUERY');
  check(input.schoolId === schoolId,'SCHOOL_MISMATCH');
  if (historical) check(id(input.snapshotId) && id(input.revision) && instant(input.sequence) && /^[a-f0-9]{64}$/.test(input.contentDigest),'MALFORMED_QUERY');
  return freeze(copy(input));
}
export function errorResult(error) {
  const code = error instanceof ContactsError && CODES.includes(error.code) ? error.code : 'UNAVAILABLE';
  return freeze({ schemaVersion:1, kind:'failure', code, retryable:['STALE_EVIDENCE','UNAVAILABLE','TIMEOUT'].includes(code) });
}
export async function read(provider, q, timeoutMs) {
  check(typeof provider === 'function','UNAVAILABLE'); let timer;
  try {
    return bounded(await Promise.race([
      Promise.resolve().then(() => provider(freeze(copy(q)))),
      new Promise((_,reject) => { timer=setTimeout(() => reject(new ContactsError('TIMEOUT')),timeoutMs); }),
    ]));
  } finally { clearTimeout(timer); }
}
export function fieldVector(fields, names) {
  return Object.fromEntries(names.map(name => [name,fields[name].map(r => r.state === 'accepted'
    ? {state:r.state,revision:r.revision} : {state:r.state})]));
}
export function validateFields(fields, profile, {schemaVersion=1} = {}) {
  check(schemaVersion===1 || schemaVersion===2 && profile==='staff');
  const names=fieldNames(profile); exact(fields,names); check(names.length <= LIMITS.fields,'LIMIT_EXCEEDED');
  let references=0;
  for (const name of names) {
    const rows=fields[name]; list(rows,LIMITS.records); check(rows.length>0);
    unique(rows.filter(r=>r?.state==='accepted').map(r=>r.revision));
    for (const r of rows) {
      check(object(r));
      if (r.state !== 'accepted') {
        exact(r,['state']); check(['missing','pending','rejected','superseded'].includes(r.state)); continue;
      }
      const direct=schemaVersion===2 && isDirectField(name) && r.valueSchema===2;
      exact(r,['state','revision','value','validFrom','validUntil','revoked'],direct?['valueSchema','legacy']:[]);
      check(id(r.revision) && instant(r.validFrom) && (r.validUntil === null || instant(r.validUntil) && r.validUntil>r.validFrom) && typeof r.revoked==='boolean');
      if(direct) { try { validateDirectRecord(name,r); } catch { check(false); } continue; }
      const type=FIELDS[name];
      if(type==='boolean') check(typeof r.value==='boolean');
      else if(type==='profile') check(['provisional','complete'].includes(r.value));
      else if(type==='text') check(text(r.value));
      else {
        const refs=type.endsWith('[]') ? r.value : [r.value]; list(refs,LIMITS.references);
        for(const ref of refs) reference(ref);
        unique(refs.map(ref=>JSON.stringify([ref.catalogueId,ref.revision,ref.code]))); references+=refs.length;
      }
    }
    check(!rows.some(r=>r.state==='missing') || rows.length===1);
    // Owner-selected schedules must be unambiguous at every instant, not just now.
    const accepted=rows.filter(r=>r.state==='accepted' && !r.revoked).sort((a,b)=>a.validFrom-b.validFrom);
    for(let i=1;i<accepted.length;i++) check(accepted[i-1].validUntil!==null && accepted[i-1].validUntil<=accepted[i].validFrom);
  }
  check(references<=LIMITS.references,'LIMIT_EXCEEDED');
}
export function choose(rows, at) {
  const accepted=rows.filter(r=>r.state==='accepted');
  const current=accepted.find(r=>active(r,at));
  if(current) return {state:'effective',record:current};
  const future=accepted.filter(r=>!r.revoked && r.validFrom>at).sort((a,b)=>a.validFrom-b.validFrom)[0];
  if(future) return {state:'future',record:future};
  const past=accepted.sort((a,b)=>b.validFrom-a.validFrom)[0];
  if(past) return {state:past.revoked?'revoked':'expired',record:past};
  return {state:rows.some(r=>r.state==='missing')?'missing':rows[0].state};
}
