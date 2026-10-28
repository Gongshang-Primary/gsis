import fs from 'node:fs/promises';
import {FileBlob, SpreadsheetFile} from '@oai/artifact-tool';
const [reference,output]=process.argv.slice(2);if(!reference||!output)throw Error('Usage: node build-template.mjs REFERENCE.xlsx OUTPUT.xlsx');
const design=JSON.parse(await fs.readFile(new URL('./design.json',import.meta.url),'utf8'));
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(reference));
const sheet=wb.worksheets.getItem('Layout');
const box=ref=>{const [a,b=a]=ref.split(':');const p=s=>{const m=s.match(/([A-Z]+)(\d+)/);return [m[1].charCodeAt(0)-65,+m[2]]};return [...p(a),...p(b)]};
const overlaps=(a,b)=>a[0]<=b[2]&&b[0]<=a[2]&&a[1]<=b[3]&&b[1]<=a[3];
const rooms=Object.values(design.placements).map(box);
sheet.getRange('A1:R80').clear({applyTo:'contents'});
sheet.getRange('A73:R80').clear({applyTo:'all'});
for(const ref of design.merges)if(overlaps(box(ref),box('A1:R1'))||rooms.some(b=>overlaps(box(ref),b))||box(ref)[1]>=73)sheet.unmergeCells(ref);
for(const [cell,text] of Object.entries(design.static))if(!rooms.some(b=>overlaps(box(cell),b))&&cell!=='P1')sheet.getRange(cell).values=[[text]];
sheet.mergeCells('A1:N1');sheet.getRange('A1').values=[['CLASSROOM LAYOUT']];
sheet.mergeCells('O1:R1');sheet.getRange('O1').values=[['Updated']];
sheet.getRange('A1:R1').format={fill:'#CCDDf6',font:{name:'Arial',size:11,bold:true},wrapText:true};
sheet.getRange('A1:R1').format.rowHeight=30;
for(const [id,ref] of Object.entries(design.placements)){
 const r=sheet.getRange(ref);r.clear({applyTo:'contents'});r.format.borders={preset:'none'};
 if(ref.split(':')[0]!==ref.split(':')[1])sheet.mergeCells(ref);
 r.format.font={name:'Arial',size:10,bold:false,color:'#111111'};
 r.format.wrapText=true;r.format.horizontalAlignment='center';r.format.verticalAlignment='center';
 r.format.borders={preset:'outside',style:'thin',color:'#222222'};
 // Live content is supplied by the browser from its displayed version.
}
sheet.getRange('B32').values=[['Boys’\nToilet']];sheet.getRange('C32').values=[['Girls’\nToilet']];
sheet.getRange('P35').values=[['Boys’\nToilet']];sheet.getRange('Q35').values=[['Girls’\nToilet']];
for(const c of ['E','F','G','H','I','J'])sheet.getRange(c+'65').values=[['HDCP\nToilet']];
sheet.getRange('E65:J65').format.wrapText=true;sheet.getRange('E65:J65').format.rowHeight=28;
sheet.showGridLines=false;
wb.recalculate();
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#N/A|#NAME\\?',options:{useRegex:true,maxResults:10},maxChars:1000})).ndjson);
await (await SpreadsheetFile.exportXlsx(wb)).save(output);
await fs.writeFile(output+'.placements.json',JSON.stringify(design.placements));
console.log('Sanitized editable layout template created');
