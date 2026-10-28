/* Bounded Sheets API v4 value I/O. Journals, locks and commit markers belong to callers. */
var GSISSheets = (function(){
 'use strict';
 let counters={};
 function resetStats(){counters={apiReads:0,apiWrites:0,nativeReads:0,nativeWrites:0,readRanges:0,writeRanges:0,readCells:0,writeCells:0,writeBytesUpperBound:0,serviceMs:0,metadataCalls:0};}
 function stats(){return {...counters};}
 function service(key,fn){const start=Date.now();counters[key]=(counters[key]||0)+1;try{return fn();}finally{counters.serviceMs=(counters.serviceMs||0)+Date.now()-start;}}
 resetStats();
 function enabled(){return typeof Sheets!=='undefined'&&Sheets.Spreadsheets&&Sheets.Spreadsheets.Values;}
 function column(n){let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
 function range(s,row,col,height,width,names){if(names&&!names.has(s)){counters.metadataCalls++;names.set(s,s.getName());}return "'"+(names?names.get(s):s.getName()).replace(/'/g,"''")+"'!"+column(col)+row+':'+column(col+width-1)+(row+height-1);}
 function readAcross(book,entries,display,options){
  if(!entries.length)return [];
  counters.readRanges+=entries.length;counters.readCells+=entries.reduce((n,r)=>n+r.height*r.width,0);
  if(!enabled())return entries.map(r=>{counters.metadataCalls++;const g=r.sheet.getRange(r.row,r.col,r.height,r.width);return service('nativeReads',()=>display?g.getDisplayValues():g.getValues());});
  if(options?.flush!==false)SpreadsheetApp.flush();
  const out=[],names=new Map(),id=(book||entries[0].sheet.getParent()).getId();counters.metadataCalls+=book?1:2;
  for(let start=0;start<entries.length;start+=100){const part=entries.slice(start,start+100);
   const ranges=part.map(r=>range(r.sheet,r.row,r.col,r.height,r.width,names));
   const data=service('apiReads',()=>Sheets.Spreadsheets.Values.batchGet(id,{ranges,valueRenderOption:display?'FORMATTED_VALUE':'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'}));
   if(!data.valueRanges||data.valueRanges.length!==part.length)throw Error('Incomplete Sheets API read; retry the load.');
   part.forEach((r,i)=>{const values=data.valueRanges[i].values||[];out.push(Array.from({length:r.height},(_,y)=>Array.from({length:r.width},(_,x)=>values[y]&&values[y][x]!==undefined?(display?String(values[y][x]):values[y][x]):'')));});
  }return out;
 }
 // Directory callers already need the complete tables. A quoted sheet name
 // lets Values.batchGet omit empty trailing cells without dimension lookups.
 function readTables(book,names,display){
  if(!names.length)return [];
  if(!enabled())return readAcross(book,names.map(name=>{counters.metadataCalls+=3;const sheet=book.getSheetByName(name);if(!sheet)throw Error('Missing '+name+' sheet');return {sheet,row:1,col:1,height:Math.max(1,sheet.getLastRow()),width:Math.max(1,sheet.getLastColumn())};}),display,{flush:false});
  counters.metadataCalls++;const id=book.getId(),out=[];
  for(let start=0;start<names.length;start+=100){const part=names.slice(start,start+100),ranges=part.map(name=>"'"+name.replace(/'/g,"''")+"'");
   const data=service('apiReads',()=>Sheets.Spreadsheets.Values.batchGet(id,{ranges,majorDimension:'ROWS',valueRenderOption:display?'FORMATTED_VALUE':'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'}));
   if(!data.valueRanges||data.valueRanges.length!==part.length)throw Error('Incomplete Sheets API read; retry the load.');
   counters.readRanges+=part.length;
   for(const item of data.valueRanges){const values=item.values||[],height=Math.max(1,values.length),width=values.reduce((n,r)=>Math.max(n,r.length),1);counters.readCells+=height*width;
    out.push(Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>values[y]&&values[y][x]!==undefined?(display?String(values[y][x]):values[y][x]):'')));
   }
  }return out;
 }
 function readMany(sheet,ranges,display,options){return readAcross(null,ranges.map(r=>({...r,sheet})),display,options);}
 function read(sheet,row,col,height,width,display,options){return readMany(sheet,[{row,col,height,width}],display,options)[0];}
 function write(book,blocks,escaped,options){
  // Complete the plan before mutating. A caller's completion range is always
  // last, even when limits split the data across several requests.
  const entries=[];for(const block of blocks)for(const w of block.writes)if(w.values.length)entries.push({sheet:block.sheet,row:w.row,col:w.col,values:w.values});
  const final=options?.final;
  if(final){if(final.values.length!==1||final.values[0].length!==1)throw Error('Completion marker must be one cell.');entries.push(final);}
  if(!entries.length)return;
  for(const e of entries)if(!Number.isInteger(e.row)||e.row<1||!Number.isInteger(e.col)||e.col<1||!e.values[0]?.length||e.values.some(row=>row.length!==e.values[0].length||row.some(v=>v!==null&&typeof v!=='string'&&typeof v!=='boolean'&&!(typeof v==='number'&&Number.isFinite(v)))))throw Error('Invalid Sheets write plan.');
  counters.writeRanges+=entries.length;counters.writeCells+=entries.reduce((n,e)=>n+e.values.length*e.values[0].length,0);
  if(!enabled()){for(const e of entries){if(e===final)SpreadsheetApp.flush();counters.metadataCalls++;service('nativeWrites',()=>e.sheet.getRange(e.row,e.col,e.values.length,e.values[0].length).setValues(e.values));}if(final)SpreadsheetApp.flush();return;}
  const batches=[],names=new Map();let batch=[],size=80;
  const finish=()=>{if(batch.length)batches.push({data:batch,bytes:size});batch=[];size=80;};
  for(const e of entries){const values=e.values.map(row=>row.map(v=>escaped&&typeof v==='string'&&/^'[=+@-]/.test(v)?v.slice(1):v));
   for(let start=0;start<values.length;){const first=start;let rows=[],bytes=0;while(start<values.length&&rows.length<500){const n=JSON.stringify(values[start]).length*3+3;if(n>990000)throw Error('A Sheets row exceeds the supported batch size.');if(rows.length&&bytes+n>990000)break;rows.push(values[start++]);bytes+=n;}
    const item={range:range(e.sheet,e.row+first,e.col,rows.length,rows[0].length,names),majorDimension:'ROWS',values:rows};
    const itemBytes=JSON.stringify(item).length*3+3;
    if(itemBytes+80>1000000)throw Error('A Sheets range exceeds the supported batch size.');
    if(batch.length>=100||size+itemBytes>1000000)finish();batch.push(item);size+=itemBytes;
   }
  }finish();
  if(options?.flush!==false)SpreadsheetApp.flush();
  const id=(book||entries[0].sheet.getParent()).getId();counters.metadataCalls+=book?1:2;
  for(const b of batches){counters.writeBytesUpperBound+=b.bytes;service('apiWrites',()=>Sheets.Spreadsheets.Values.batchUpdate({valueInputOption:'RAW',includeValuesInResponse:false,data:b.data},id));}
  // No transport switch or retry after an uncertain API failure.
 }
 function check(sheet){if(!enabled())throw Error('Enable Google Sheets API v4 under Apps Script Services, then run this check again.');read(sheet,1,1,1,1,true);return {ready:true,service:'Google Sheets API v4',mode:'batched exact ranges',writes:0};}
 return {enabled,read,readMany,readAcross,readTables,write,check,stats,resetStats};
})();
