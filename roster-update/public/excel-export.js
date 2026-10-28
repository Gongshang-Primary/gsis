/* Local OOXML export; literal strings never become Excel formulas. */
(()=>{
function workbook(rows,sheetName="Table"){
 const xml=s=>String(s??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const colName=i=>{let s='';for(i++;i;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
 const validDate=v=>Object.prototype.toString.call(v)==='[object Date]'&&Number.isFinite(v.getTime());
 const hasTime=v=>v.getTime()%86400000!==0;
 const label=v=>validDate(v)?v.toISOString().slice(0,hasTime(v)?19:10):String(v??'');
 const widths=(rows[0]||[]).map((_,c)=>Math.min(60,rows.reduce((max,row)=>Math.max(max,...label(row[c]).split('\n').map(x=>x.length+2)),12)));
 const rowHeight=row=>Math.min(409,row.reduce((max,v,c)=>Math.max(max,label(v).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/Math.max(1,(widths[c]||12)-2))),0)),1)*16+6);
 const files={
 '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(String(sheetName).replace(/[\\/?*\[\]:]/g," ").slice(0,31)||"Table")}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
 'xl/styles.xml':`<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF19485E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="22" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
 'xl/worksheets/sheet1.xml':`<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${(rows[0]||[]).map((_,c)=>`<col min="${c+1}" max="${c+1}" width="${widths[c]}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((row,i)=>`<row r="${i+1}" ht="${rowHeight(row)}" customHeight="1">${row.map((v,c)=>validDate(v)?`<c r="${colName(c)}${i+1}" s="${hasTime(v)?3:2}" t="n"><v>${v.getTime()/86400000+25569}</v></c>`:typeof v==='number'&&Number.isFinite(v)?`<c r="${colName(c)}${i+1}" s="${i?0:1}" t="n"><v>${v}</v></c>`:`<c r="${colName(c)}${i+1}" s="${i?0:1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`};
 return packageFiles(files);
}
function packageFiles(files){
 const enc=new TextEncoder(),parts=[],central=[];let offset=0;
 const header=(size,fields)=>{const b=new Uint8Array(size),v=new DataView(b.buffer);for(const [at,value,width] of fields)width===2?v.setUint16(at,value,true):v.setUint32(at,value,true);return b;};
 for(const [path,content] of Object.entries(files)){
  const name=enc.encode(path),data=content instanceof Uint8Array?content:enc.encode(String(content).replace(/^\uFEFF/,'').startsWith('<?xml')?String(content).replace(/^\uFEFF/,''):'<?xml version="1.0" encoding="UTF-8"?>'+content);let crc=0xffffffff;for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
  const local=header(30,[[0,0x04034b50,4],[4,20,2],[14,crc,4],[18,data.length,4],[22,data.length,4],[26,name.length,2]]);
  const dir=header(46,[[0,0x02014b50,4],[4,20,2],[6,20,2],[16,crc,4],[20,data.length,4],[24,data.length,4],[28,name.length,2],[42,offset,4]]);
  parts.push(local,name,data);central.push(dir,name);offset+=local.length+name.length+data.length;
 }
 const size=central.reduce((n,b)=>n+b.length,0),count=Object.keys(files).length;
 return new Blob([...parts,...central,header(22,[[0,0x06054b50,4],[8,count,2],[10,count,2],[12,size,4],[16,offset,4]])],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

window.GSISExcel={workbook,packageFiles};
})();
