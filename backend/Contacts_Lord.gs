// Fresh minimal projection: direct Sheet edits are detected without trusting an epoch alone.
function lordContactsMarker_(){
 const properties=PropertiesService.getScriptProperties(),all=typeof properties.getProperties==='function'?properties.getProperties():null,value=key=>all?(all[key]||''):(properties.getProperty(key)||'');
 let pending;try{pending=JSON.parse(value('CONTACTS_PENDING_V2')||'{}');}catch(_){lordSourceError_(503,'SOURCE_UNAVAILABLE','Contacts save status needs review.');}
 if(!pending||typeof pending!=='object'||Array.isArray(pending)||Object.keys(pending).length||value('DEPLOY_CATALOGUE_PENDING'))lordSourceError_(503,'SOURCE_UNAVAILABLE','Contacts changes are pending. Retry after the save completes.');
 return JSON.stringify(['CONTACTS_DATA_EPOCH','DEPLOY_READ_EPOCH','CONTACTS_PENDING_V2','DEPLOY_CATALOGUE_PENDING'].map(value));
}
function lordContactsService_(envelope){
 return lordContactsSnapshot_(lordSourceAuthenticate_(envelope,'contacts'));
}
function lordContactsSnapshot_(input){
 const before=lordContactsMarker_(),ss=SpreadsheetApp.openById(GSIS_SHEET),names=['contacts','roles'];
 const values=GSISSheets.readTables(ss,names,true),tables=values.map(rows=>({headers:rows[0],rows:rows.slice(1).map((row,i)=>Object.fromEntries([['_row',i+2],...rows[0].map((key,j)=>[key,row[j]||''])]))}));
 required_(tables[0],['Staff ID','Basic Name','TTb Name','Active','Role','Employment Modifier','Subject Modifier','MK Modifier','EO Appt Level','GSPS Alias (@gsps.edu.sg)','CES Alias (@schools.gov.sg)','Statutory Name','Mobile No']);
 const records=deriveContacts_(ss,tables[0],tables[1]).rows,ids=new Set(),ttbNames=new Set(),emails=new Set();
 const address=(raw,domain)=>{const value=String(raw||'').trim().toLowerCase();if(!value)return '';const email=value.includes('@')?value:value+'@'+domain;if(!/^[a-z0-9._%+-]+@[^@\s]+$/.test(email)||email.split('@')[1]!==domain)lordSourceError_(503,'SOURCE_INVALID','A Contacts email needs review.');return email;};
 const people=[];for(const row of records){
  if(!Object.keys(row).some(k=>k!=='_row'&&String(row[k]||'').trim()))continue;
  const id=String(row['Staff ID']||'').trim(),name=String(row['TTb Name']||'').trim(),nameKey=name.normalize('NFKC').replace(/\s+/g,' ').toLowerCase(),mobile=String(row['Mobile No']||'').replace(/\s/g,''),email=address(row['GSPS Alias (@gsps.edu.sg)'],'gsps.edu.sg'),cesEmail=address(row['CES Alias (@schools.gov.sg)'],'schools.gov.sg');
  if(!id||id.length>100||ids.has(id)||!name||name.length>240||ttbNames.has(nameKey)||!['Y','N'].includes(row.Active)||mobile&&!/^\d{8}$/.test(mobile)||[email,cesEmail].some(value=>value&&emails.has(value)))lordSourceError_(503,'SOURCE_INVALID','Contacts has a missing or duplicated staff identity, or invalid contact details. Review the directory.');
  ids.add(id);ttbNames.add(nameKey);for(const value of [email,cesEmail])if(value)emails.add(value);
  people.push({id,name,active:row.Active==='Y',email,cesEmail,statutoryName:String(row['Statutory Name']||'').trim(),mobile});
 }
 people.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 if(before!==lordContactsMarker_())lordSourceError_(409,'SOURCE_CHANGED','Contacts changed while reading. Retry the reference sync.');
 return lordSourceResult_('contacts',lordSourceHash_(['lord-contacts-v1',people]),input,{people});
}
