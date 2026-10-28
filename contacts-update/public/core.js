export const tokens = value => String(value || '').split(',').map(s=>s.trim()).filter(Boolean);
export function whatsapp(value){let s=String(value||'').replace(/[\s()+.-]/g,'');if(s.startsWith('0065'))s=s.slice(4);else if(s.length===10&&s.startsWith('65'))s=s.slice(2);return /^[89]\d{7}$/.test(s)?'https://wa.me/65'+s:'';}
export function filterPeople(people,{inactive=false,filters=[]}={}){
 return people.filter(p=>(inactive||p.active!=='N')&&filters.every(f=>f.category==='groups'?p.groups.includes(f.value):tokens(p[f.category]).includes(f.value)));
}
export function emailList(people,type){return [...new Set(people.map(p=>p.emails[type]).filter(s=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s||'')))].join('\n');}

// Minimal OOXML workbook: inline strings preserve phone numbers and prevent formula execution.
export function excelWorkbook(rows){
 const xml=s=>String(s??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const files={
 '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Contacts" sheetId="1" r:id="rId1"/></sheets></workbook>`,
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':`<worksheet xmlns="${ns}"><sheetData>${rows.map((row,i)=>`<row r="${i+1}">${row.map(v=>`<c t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`};
 const enc=new TextEncoder(),parts=[],central=[];let offset=0;
 const header=(size,fields)=>{const b=new Uint8Array(size),v=new DataView(b.buffer);for(const [at,value,width] of fields)width===2?v.setUint16(at,value,true):v.setUint32(at,value,true);return b;};
 for(const [path,content] of Object.entries(files)){
  const name=enc.encode(path),data=enc.encode('<?xml version="1.0" encoding="UTF-8"?>'+content);let crc=0xffffffff;for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
  const local=header(30,[[0,0x04034b50,4],[4,20,2],[14,crc,4],[18,data.length,4],[22,data.length,4],[26,name.length,2]]);
  const dir=header(46,[[0,0x02014b50,4],[4,20,2],[6,20,2],[16,crc,4],[20,data.length,4],[24,data.length,4],[28,name.length,2],[42,offset,4]]);
  parts.push(local,name,data);central.push(dir,name);offset+=local.length+name.length+data.length;
 }
 const size=central.reduce((n,b)=>n+b.length,0),count=Object.keys(files).length;
 return new Blob([...parts,...central,header(22,[[0,0x06054b50,4],[8,count,2],[10,count,2],[12,size,4],[16,offset,4]])],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

// Shared staff hierarchy. Role truth-table memberships take precedence over employment.
export function staffRank(p){return (p?.active==='N'?1000:0)+appointmentRank(p);}
function appointmentRank(p){
 if(!p)return 90; // Unmatched application accounts follow known primary staff, before MK.
 const role=String(p.role||'').trim(),groups=new Set(p.groups||[]),mods=new Set(tokens(p.employment));
 const oso=role==='OSO'||mods.has('OSO');
 if(p.mk||groups.has('MK')||/^MK(?:\s|E$)/i.test(role)){
  if(/^(MK\s+)?(?:Ctr Hd|Centre Head)$/i.test(role))return 100;
  if(/^(MK\s+)?(?:Dy Ctr Hd|Deputy Centre Head)$/i.test(role))return 101;
  if(/^(MK\s+)?(?:LH|Level Head)(?:\s|$)/i.test(role))return 102;
  if(/^(MK\s+)?(?:ST|Senior Teacher)(?:\s|$)/i.test(role))return 103;
  if(oso)return 106;
  if(mods.has('FAJT')||mods.has('CAJT'))return 105;
  return 104;
 }
 for(const [i,g] of ['SL','SC','SMC','TL'].entries())if(groups.has(g))return i;
 if(oso)return 8;
 if(mods.has('FAJT')||mods.has('CAJT'))return 5;
 if(mods.has('SRE'))return 6;
 const support=['SC','SENO','Dentist','Library','DE','Sci Lab','Security Guard','OSO'];
 if(groups.has('Support')||groups.has('SAT')||support.some(m=>mods.has(m))||/^(AE|CSO|Recep|Counsellor|SC|(?:Snr )?SENO|Dentist|Library|DE|Sci Lab|Security)$/.test(role))return 7;
 return 4;
}
export function compareStaff(a,b){return staffRank(a)-staffRank(b)||String(a?.name||a?.email||'').localeCompare(String(b?.name||b?.email||''),undefined,{numeric:true})||String(a?.id||a?.email||'').localeCompare(String(b?.id||b?.email||''));}
