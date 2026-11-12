import { FIELDS, LIMITS, check, exact, id, list, unique, text, refKey, reference } from './contracts.mjs';

/** Catalogue values are owner-supplied references, never capability/workload rules. */
export function validateCatalogues(catalogues, fields, references) {
  list(references,LIMITS.references); unique(references.map(refKey));
  for(const r of references) {exact(r,['catalogueId','revision']);check(id(r.catalogueId)&&id(r.revision));}
  list(catalogues,LIMITS.references); unique(catalogues.map(refKey)); let count=0;
  const lookup=new Map();
  for(const c of catalogues) {
    exact(c,['catalogueId','revision','kind','entries']);
    check(id(c.catalogueId) && id(c.revision) && ['operational-tag','membership-role','hr-term'].includes(c.kind));
    list(c.entries,LIMITS.entries); count+=c.entries.length;
    unique(c.entries.map(e=>e.code));
    for(const e of c.entries) {
      const extras=c.kind==='operational-tag'?['category','ttbVisible','order']:c.kind==='membership-role'?['flags','eoAppointment']:['category'];
      exact(e,['code','label','active','definitionRevision',...extras]);
      check(id(e.code) && text(e.label) && typeof e.active==='boolean' && id(e.definitionRevision));
      if(c.kind==='operational-tag') check(['employmentTags','subjectTags','mkTags'].includes(e.category) && typeof e.ttbVisible==='boolean' && Number.isSafeInteger(e.order) && e.order>=0 && e.order<=10000);
      if(c.kind==='hr-term') check(Object.hasOwn(FIELDS,e.category) && FIELDS[e.category]==='hr-term');
      if(c.kind==='membership-role') {
        exact(e.flags,['sl','sc','smc','kp','tl','sdt','cmt','sat','support','mk']);
        check(Object.values(e.flags).every(v=>typeof v==='boolean'));
        if(e.eoAppointment!==null) reference(e.eoAppointment);
      }
    }
    lookup.set(refKey(c),c);
  }
  check(count<=LIMITS.entries,'LIMIT_EXCEEDED');
  check(references.length===lookup.size && references.every(r=>lookup.has(refKey(r))),'REFERENCE_MISMATCH');
  for(const c of catalogues) if(c.kind==='membership-role') for(const e of c.entries) if(e.eoAppointment!==null) {
    const target=lookup.get(refKey(e.eoAppointment)), entry=target?.entries.find(v=>v.code===e.eoAppointment.code);
    check(target?.kind==='hr-term' && entry?.category==='eoAppointmentLevel','REFERENCE_MISMATCH');
  }
  for(const [field,rows] of Object.entries(fields)) for(const r of rows) {
    if(r.state!=='accepted' || ['boolean','profile','text'].includes(FIELDS[field])) continue;
    for(const ref of FIELDS[field].endsWith('[]')?r.value:[r.value]) {
      const key=refKey(ref), c=lookup.get(key), e=c?.entries.find(e=>e.code===ref.code);
      check(e && c.kind===FIELDS[field].replace('[]',''),'REFERENCE_MISMATCH');
      if(c.kind!=='membership-role') check(e.category===field,'REFERENCE_MISMATCH');
      // Retired definitions remain referenceable; retirement does not revoke staff facts.

    }
  }
  return lookup;
}
