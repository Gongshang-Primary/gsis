'use strict';
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
function makeHarness(options={}) {
  const audit={reads:0,writes:0,readCells:0,writeCells:0,flushes:0,calendarCalls:[],apiReads:[],apiWrites:[],nativeReads:[],nativeWrites:[]};
  let fault=null,cacheBroken=false,locked=false,clockOffset=0;
  class HarnessDate extends Date {constructor(...args){super(...(args.length?args:[Date.now()+clockOffset]));}static now(){return Date.now()+clockOffset;}}
  const sheets=new Map(),props=new Map(),cache=new Map();
  const copy=v=>JSON.parse(JSON.stringify(v));
  class Range {
    constructor(sheet,row,col,rows=1,cols=1){
      if(typeof row==='string'){
        const m=row.match(/^([A-Z]+)(\d+):([A-Z]+)(\d*)$/);if(!m)throw new Error('Unsupported native fixture A1 '+row);
        const c=s=>[...s].reduce((n,x)=>n*26+x.charCodeAt(0)-64,0);
        col=c(m[1]);cols=c(m[3])-col+1;row=Number(m[2]);rows=Math.max(0,(Number(m[4])||Math.max(1000,sheet.values.length))-row+1);
      }
      Object.assign(this,{sheet,row,col,rows,cols});
    }
    getValues(){const what={sheet:this.sheet.name,row:this.row,col:this.col,rows:this.rows,cols:this.cols};if(fault)fault('nativeReadBefore',what);audit.reads++;audit.readCells+=this.rows*this.cols;audit.nativeReads.push(what);const values=Array.from({length:this.rows},(_,r)=>Array.from({length:this.cols},(_,c)=>this.sheet.values[this.row+r-1]?.[this.col+c-1]??''));if(fault){const replaced=fault('nativeReadAfter',{...what,values});if(replaced!==undefined)return replaced;}return values;}
    getDisplayValues(){return this.getValues().map(r=>r.map(v=>String(v??'')));}
    getValue(){return this.getValues()[0][0];}
    getFormulas(){return Array.from({length:this.rows},(_,r)=>Array.from({length:this.cols},(_,c)=>this.sheet.formulas.get((this.row+r)+'|'+(this.col+c))||''));}
    setValue(v){return this.setValues([[v]]);}
    setValues(values){
      if(values.length!==this.rows||values.some(r=>r.length!==this.cols))throw new Error('Range dimensions mismatch');
      const what={sheet:this.sheet.name,row:this.row,col:this.col,values,before:Array.from({length:this.rows},(_,r)=>Array.from({length:this.cols},(_,c)=>this.sheet.values[this.row+r-1]?.[this.col+c-1]??''))};
      if(fault)fault('before',what);
      values.forEach((r,i)=>{const row=this.sheet.values[this.row+i-1]||(this.sheet.values[this.row+i-1]=[]);r.forEach((v,j)=>{const key=(this.row+i)+'|'+(this.col+j);if(typeof v==='string'&&v.startsWith('='))this.sheet.formulas.set(key,v);else this.sheet.formulas.delete(key);row[this.col+j-1]=typeof v==='string'&&v.startsWith("'")?v.slice(1):v;});});
      audit.writes++;audit.writeCells+=values.reduce((n,r)=>n+r.length,0);audit.nativeWrites.push(what);
      if(fault)fault('after',what);
      return this;
    }
    getRow(){return this.row;}
    getColumn(){return this.col;}
    createTextFinder(text){
      const self=this;let entire=false,regex=false,matchCase=false;
      return {matchEntireCell(v){entire=v;return this;},useRegularExpression(v){regex=v;return this;},matchCase(v){matchCase=v;return this;},
        findAll(){const hits=[];for(let r=0;r<self.rows;r++)for(let c=0;c<self.cols;c++){
          let a=String(self.sheet.values[self.row+r-1]?.[self.col+c-1]??''),b=String(text),ok;
          if(regex)ok=new RegExp(b,matchCase?'':'i').test(a);
          else {if(!matchCase){a=a.toLowerCase();b=b.toLowerCase();}ok=entire?a===b:a.includes(b);}
          if(ok)hits.push(new Range(self.sheet,self.row+r,self.col+c));
        }return hits;},findNext(){return this.findAll()[0]||null;}};
    }
    clearContent(){return this.setValues(Array.from({length:this.rows},()=>Array(this.cols).fill('')));}
    setNumberFormat(){return this;} setFontWeight(){return this;} setBackground(){return this;} setFontColor(){return this;}
    setWrap(){return this;}setDataValidation(){return this;}setVerticalAlignment(){return this;}setHorizontalAlignment(){return this;}setFontSize(){return this;}
  }
  class Sheet {
    constructor(name,values=[]){this.name=name;this.formulas=new Map();this.values=copy(values);this.maxCols=Math.max(26,...values.map(r=>r.length));}
    getName(){return this.name;}getLastRow(){let n=this.values.length;while(n&&!this.values[n-1]?.some(v=>String(v??'').trim()))n--;return n;}
    getLastColumn(){return Math.max(0,...this.values.map(r=>r.length));}getMaxColumns(){return this.maxCols;}
    getMaxRows(){return Math.max(1000,this.values.length);}getSheetId(){return [...sheets.keys()].indexOf(this.name)+1;}
    getRange(...args){return new Range(this,...args);}getDataRange(){return this.getRange(1,1,Math.max(1,this.getLastRow()),Math.max(1,this.getLastColumn()));}
    appendRow(row){this.getRange(this.getLastRow()+1,1,1,row.length).setValues([row]);return this;}
    deleteRow(row){this.values.splice(row-1,1);}deleteRows(row,n){this.values.splice(row-1,n);}
    insertColumnsAfter(after,n){this.maxCols+=n;}insertRowsAfter(){}setFrozenRows(){}setFrozenColumns(){}setColumnWidths(){}autoResizeColumns(){}
    hideSheet(){}showSheet(){}clearContents(){this.values=[];}clear(){this.values=[];}setTabColor(){}setRowHeight(){}
  }
  const ss={getSheetByName:n=>sheets.get(n)||null,insertSheet:n=>{const s=new Sheet(n);sheets.set(n,s);return s;},getSheets:()=>[...sheets.values()],getId:()=> 'synthetic-workbook',getSpreadsheetTimeZone:()=> 'Asia/Singapore',setSpreadsheetTimeZone(){},setSpreadsheetLocale(){}};
  const fmt=(date,tz,format)=>{
    const d=date instanceof Date?date:new Date(date);
    if(!Number.isFinite(d.getTime()))throw new Error('Invalid formatDate date');
    const sg=new Date(d.getTime()+8*3600000).toISOString();
    if(format==='yyyy-MM-dd')return sg.slice(0,10);
    if(format==='HH:mm')return sg.slice(11,16);
    return sg.slice(0,19)+'+08:00';
  };
  // Real byte/gzip semantics for the bounded Calendar checkpoint transport.
  const blob=value=>{const bytes=typeof value==='string'?Buffer.from(value,'utf8'):Buffer.from(Uint8Array.from(value));return{getBytes:()=>[...bytes].map(n=>n>127?n-256:n),getDataAsString:()=>bytes.toString('utf8')};};
  const sandbox={Sheets:null,console:{log(){},info(){},error(){}},Logger:{log(){}},Date:HarnessDate,Math,JSON,Map,Set,Object,Array,String,Number,Boolean,RegExp,Error,
    Utilities:{getUuid:()=>crypto.randomUUID(),formatDate:fmt,computeDigest:(algorithm,text)=>[...crypto.createHash('sha256').update(text).digest()].map(v=>v>127?v-256:v),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'UTF-8'},sleep(ms){clockOffset+=ms;},newBlob:blob,gzip:b=>blob(zlib.gzipSync(Buffer.from(Uint8Array.from(b.getBytes())))),ungzip:b=>blob(zlib.gunzipSync(Buffer.from(Uint8Array.from(b.getBytes())))),base64Encode:b=>Buffer.from(Uint8Array.from(b)).toString('base64'),base64Decode:s=>[...Buffer.from(s,'base64')].map(n=>n>127?n-256:n)},
    SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush:()=>{audit.flushes++;if(fault)fault('flush',{});}},
    LockService:{getScriptLock:()=>({tryLock(){if(locked)return false;locked=true;return true;},releaseLock(){locked=false;},hasLock(){return locked;}})},
    CacheService:{getScriptCache:()=>{if(cacheBroken)throw new Error('Synthetic cache unavailable');return{get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),removeAll:ks=>ks.forEach(k=>cache.delete(k))};}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
    Session:{getScriptTimeZone:()=> 'Asia/Singapore',getEffectiveUser:()=>({getEmail:()=> 'admin@gsps.edu.sg'})},
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({text,setMimeType(){return this;}})}
  };
  // Independent Sheets v4 emulator: typed values, exact field masks and atomic batches.
  const byId=id=>[...sheets.values()].find(s=>s.getSheetId()===id);
  const colN=letters=>[...letters].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
  function parseA1(a1){
    const bang=a1.lastIndexOf('!');let name=a1.slice(0,bang);
    if(name.startsWith("'"))name=name.slice(1,-1).replace(/''/g,"'");
    const sheet=sheets.get(name);if(!sheet)throw new Error('400 Unknown sheet '+name);
    const m=a1.slice(bang+1).match(/^([A-Z]+)(\d*):([A-Z]+)(\d*)$/);
    if(!m)throw new Error('Unsupported fixture A1 '+a1);
    return {sheet,row:Number(m[2])||1,col:colN(m[1]),endRow:Number(m[4])||sheet.values.length,endCol:colN(m[3])};
  }
  const value=c=>{const v=c.userEnteredValue;if(!v)return '';if('stringValue'in v)return v.stringValue;if('numberValue'in v)return v.numberValue;if('boolValue'in v)return v.boolValue;throw new Error('Unsupported typed cell');};
  sandbox.Sheets={Spreadsheets:{
    get(id,options){if(fault)fault('apiMetadata',{id,options});return {spreadsheetId:id,properties:{timeZone:'Asia/Singapore'},sheets:[...sheets.values()].map(s=>({properties:{sheetId:s.getSheetId(),title:s.name}}))};},
    Values:{batchGet(id,options){
      if(fault)fault('apiReadBefore',{id,options});
      const call={ranges:[...options.ranges],options,cells:0};audit.apiReads.push(call);
      const valueRanges=options.ranges.map(a1=>{const r=parseA1(a1),values=[];
        for(let n=r.row;n<=r.endRow;n++){
          const row=Array.from({length:r.endCol-r.col+1},(_,i)=>r.sheet.values[n-1]?.[r.col+i-1]??'');
          while(row.length&&(row.at(-1)===''||row.at(-1)==null))row.pop();values.push(row);
        }
        while(values.length&&!values.at(-1).length)values.pop();call.cells+=values.reduce((n,r)=>n+r.length,0);
        return {range:a1,majorDimension:'ROWS',values};
      });
      let result={spreadsheetId:id,valueRanges};if(fault){const replaced=fault('apiReadAfter',{id,options,result});if(replaced)result=replaced;}return result;
    }},
    batchUpdate(body,id){
      const call={requests:copy(body.requests),cells:0,committed:false};audit.apiWrites.push(call);
      if(fault)fault('apiBefore',{id,body});
      // Each request is validated and applied to a shadow workbook first.
      const shadow=new Map([...sheets].map(([n,s])=>[n,copy(s.values)]));
      for(const req of body.requests){
        const type=Object.keys(req)[0],r=req[type];
        if(!['updateCells','appendCells','deleteDimension'].includes(type))throw new Error('400 Unsupported fixture request '+type);
        const sid=type==='appendCells'?r.sheetId:type==='updateCells'?r.start.sheetId:r.range.sheetId;
        const sheet=byId(sid);if(!sheet)throw new Error('400 Sheet ID missing');
        const data=shadow.get(sheet.name);
        if(type==='deleteDimension'){
          if(r.range.dimension!=='ROWS'||r.range.startIndex<1)throw new Error('400 Invalid deletion');
          data.splice(r.range.startIndex,r.range.endIndex-r.range.startIndex);continue;
        }
        if(r.fields!=='userEnteredValue')throw new Error('400 Invalid field mask');
        let row=type==='appendCells'?data.length:r.start.rowIndex,col=type==='appendCells'?0:r.start.columnIndex;
        if(row<0||col<0)throw new Error('400 Negative coordinate');
        const vals=r.rows.map(r=>r.values.map(value));
        const what={sheet:sheet.name,row:row+1,col:col+1,values:vals};
        if(fault)fault('before',what);
        vals.forEach((rr,i)=>{if(!data[row+i])data[row+i]=[];rr.forEach((v,j)=>{data[row+i][col+j]=v;call.cells++;});});
      }
      for(const [name,data]of shadow)sheets.get(name).values=data;
      call.committed=true;
      if(fault)fault('apiAfter',{id,body});
      return {spreadsheetId:id,replies:body.requests.map(()=>({}))};
    }
  }};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(options.sourcePath||path.join(__dirname,'../../calendar-backend/Code.gs'),'utf8'),sandbox,{filename:'CalendarV2_RC1.9.gs'});
  if(!options.sourcePath)for(const name of ['Commands.gs','VenueDirectory.gs']){
    const file=path.join(__dirname,'../../calendar-backend',name);
    if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),sandbox,{filename:name});
  }
  const spec=vm.runInContext('CALV2',sandbox);
  Object.entries(spec.HEADERS).forEach(([name,headers])=>sheets.set(name,new Sheet(name,[headers])));
  function seed(name,objects){const s=sheets.get(name),headers=s.values[0];s.values=[headers,...objects.map(o=>headers.map(h=>o[h]??''))];cache.clear();if(sandbox.rc18ResetIO_)sandbox.rc18ResetIO_();}
  const lanes=spec.DEFAULT_LANES.filter(r=>r[3]==='Yes').map(r=>Object.fromEntries(spec.HEADERS.Lanes.map((h,i)=>[h,r[i]])));
  seed('Lanes',lanes);
  seed('Tags',[{Tag:'Mtg',Meaning:'Meeting',Active:'Yes',SortOrder:1},{Tag:'PSLE',Meaning:'PSLE',Active:'Yes',SortOrder:2},{Tag:'hol',Meaning:'Holiday',Active:'Yes',SortOrder:3},{Tag:'term',Meaning:'Term',Active:'Yes',SortOrder:4}]);
  seed('Users',[{UserAlias:'admin',DisplayName:'Synthetic Admin',IsAdmin:'Yes',IsParentPublisher:'Yes',Active:'Yes'},{UserAlias:'publisher',DisplayName:'Synthetic Publisher',IsAdmin:'No',IsParentPublisher:'Yes',Active:'Yes'}]);
  seed('Years',[{Year:2026,Status:'ACTIVE',ReleasedToTeachers:'Yes'},{Year:2027,Status:'PLANNING',ReleasedToTeachers:'No'},{Year:2028,Status:'PLANNING',ReleasedToTeachers:'No'}]);
  seed('Settings',spec.DEFAULT_SETTINGS.map(r=>({Key:r[0],Value:r[1],Description:r[2]})));
  const base={EventID:'E1',Year:2026,Status:'PUBLISHED',LaneID:'after_school',ShiftSpan:'PM_I',OwnerTag:'Mtg',StaffTitle:'Synthetic staff meeting',StaffDescription:'Fixture only',Location:'Room 1',EventType:'TIMED',StartDate:'2026-09-14',EndDate:'2026-09-14',StartTime:'14:15',EndTime:'15:15',ParentEnabled:'Yes',ParentTitle:'Parent-facing title',ParentDescription:'Parent-facing description',StaffCalendarEventId:'STAFF-LINK',ParentCalendarEventId:'PARENT-LINK',StaffSyncState:'SYNCED',ParentSyncState:'SYNCED',CreatedAt:'2026-08-01T12:00:00+08:00',UpdatedAt:'2026-08-01T12:00:00+08:00',LastMutationID:''};
  seed('Events',[base,{...base,EventID:'E2',StaffTitle:'Multi-day camp',LaneID:'day',ShiftSpan:'NONE',EventType:'MULTI_DAY',StartDate:'2026-09-14',EndDate:'2026-09-16',StartTime:'',EndTime:''},{...base,EventID:'E3',Year:2027,Status:'HIDDEN',StartDate:'2027-01-04',EndDate:'2027-01-04',StaffTitle:'2027 planning meeting'}]);
  props.set('GSIS_SECRET','synthetic-secret'.repeat(3));
  const actor=alias=>({sub:'synthetic-'+alias,email:alias+'@gsps.edu.sg',userAlias:alias});
  const call=(action,payload={},alias='admin')=>{
    const input=copy(payload);
    if(['saveTag','deleteTag','saveLane','saveColourRule','deleteColourRule','reorderColourRules','saveUser','saveYear','savePublicHolidays','generateYearStructure','saveUrls','saveDayNote'].includes(action)&&!Object.prototype.hasOwnProperty.call(input,'expectedMetadataRevision')){
      sandbox.rc18ResetIO_();input.expectedMetadataRevision=sandbox.calendarMetadataRevision_(sandbox.calendarMetadataCurrent_(action,input));
    }
    return copy(sandbox.dispatch_(action,actor(alias),input,crypto.randomUUID()));
  };
  const event=id=>sandbox.eventForClient_(sandbox.findRowByKey_(sheets.get('Events'),'EventID',id)?.object);
  return {sandbox,call,event,seed,base,ss,sheets,props,audit,spec,actor,advanceClock:ms=>{clockOffset+=ms;},
    setFault:fn=>{fault=fn;},setCacheBroken:v=>{cacheBroken=v;},setLocked:v=>{locked=v;},
    addEvents:n=>{const all=sandbox.tableObjects_(sheets.get('Events'));for(let i=0;i<n;i++){const d=new Date(Date.UTC(2026,0,1+i%365)).toISOString().slice(0,10);all.push({...base,EventID:'BENCH-'+i,ParentEnabled:'No',ParentCalendarEventId:'',StaffCalendarEventId:'',StartDate:d,EndDate:d,StaffTitle:'Synthetic event '+i+' — full title with clear details'});}seed('Events',all);}
  };
}
module.exports={makeHarness};
