/** Minimal fresh source for the Calendar birthday integration. The caller is
 * already signed by the trusted bridge; access remains live and never cached. */
function calendarContactBirthdays_(ss,req) {
  requireStaffView_(ss,req.identity);
  if(contactViewStatus_?.pending)throw fault_(503,'Contacts changes are pending. Retry the birthday update after they finish.');
  const raw=deriveContacts_(ss,table_(ss,'contacts'));
  required_(raw,['Staff ID','TTb Name','Active','MK Modifier','Day of Birth','Month of birth']);
  const people=[],seen=new Set();
  for(const row of raw.rows) {
    if(!raw.headers.some(k=>String(row[k]||'').trim()))continue;
    const id=String(row['Staff ID']||'').trim();
    if(!id||seen.has(id))throw fault_(503,'A Contacts Staff ID is missing or duplicated. No birthday source was supplied.');
    seen.add(id);
    people.push({id:id,name:String(row['TTb Name']||'').trim(),active:String(row.Active||'').trim(),mk:String(row['MK Modifier']||'').trim(),day:String(row['Day of Birth']||'').trim(),month:String(row['Month of birth']||'').trim()});
  }
  return {schema:1,complete:true,authoritative:true,revision:digestData_(people),observedAt:Date.now(),count:people.length,people:people};
}
