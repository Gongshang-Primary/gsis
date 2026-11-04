// Offline v1.3.1 regressions. Production functions run in a VM; Google services
// are in-memory fakes. Explicit dependency overrides are local to each test.
process.env.TZ = 'Asia/Singapore';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Source/backend/Code.gs'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function harness(options = {}) {
  const h = { now:Date.parse('2026-10-08T02:00:00Z'), reads:[], writes:[], logs:[], warnings:[],
    properties:{...require('./backend_config_fixture.cjs'),...options.properties}, propertyWrites:[], snapshots:0, cache:new Map(), cachePuts:[], opens:[],
    locked:false, locks:0, releases:0, batches:[], triggers:[], sends:[], photos:[], folders:new Map(), dateFormats:0,
    driveFiles:new Map(),driveCalls:[],driveSequence:0 };
  let sequence = 0;
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [h.now])); }
    static now() { return h.now; }
  }
  function formatDate(date, tz, pattern) {
    h.dateFormats++;
    const d = new Date(date.getTime() + (tz === 'GMT' || tz === 'UTC' ? 0 : 8*3600000));
    const parts = { yyyy:d.getUTCFullYear(), MM:String(d.getUTCMonth()+1).padStart(2,'0'),
      dd:String(d.getUTCDate()).padStart(2,'0'), HH:String(d.getUTCHours()).padStart(2,'0'),
      mm:String(d.getUTCMinutes()).padStart(2,'0'), ss:String(d.getUTCSeconds()).padStart(2,'0') };
    if (pattern === 'H') return String(d.getUTCHours());
    if (pattern === "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'") return d.toISOString();
    return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g, token => parts[token]);
  }
  class Sheet {
    constructor(id,name,rows) { this.id=id;this.name=name;this.data=rows.map(r=>Array.from(r));this.maxRows=1000; }
    getSheetId() { return this.id; }
    getName() { return this.name; }
    getLastRow() { return this.data.length; }
    getLastColumn() { return this.data[0]?.length || 0; }
    getMaxColumns() { return this.getLastColumn(); }
    getMaxRows() { return this.maxRows; }
    getRange(r,c,n=1,w=1) {
      const sh=this;
      const range = {
        getValues() {
          h.reads.push({sheet:sh.name,r,c,n,w});
          return Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>sh.data[r+i-1]?.[c+j-1] ?? ''));
        },
        getDisplayValues() { return range.getValues().map(row=>row.map(x=>String(x))); },
        setValues(rows) {
          if (h.failSheet === sh.name) throw new Error('Injected Sheet failure');
          rows.forEach((row,i)=>row.forEach((value,j)=>{ (sh.data[r+i-1]??=[])[c+j-1]=value; }));
          h.writes.push({sheet:sh.name,r,c,n,w}); return range;
        },
        setValue(value) { return range.setValues([[value]]); },
        createTextFinder(text) { return {matchEntireCell(){return this;},matchCase(){return this;},useRegularExpression(){return this;},findNext(){return this.findAll()[0] || null;},findAll(){
          const found=[];
          for(let i=0;i<n;i++) if(String(sh.data[r+i-1]?.[c-1] ?? '')===String(text)) found.push({getRow:()=>r+i});
          return found;
        }}; }
      };
      return range;
    }
    appendRow(row) { this.getRange(this.data.length+1,1,1,row.length).setValues([row]); }
  }
  const props = {
    getProperty:key=>h.properties[key] ?? null,
    getProperties:()=>{h.snapshots++;return {...h.properties};},
    setProperty(key,value) {
      if(key===h.failProperty) throw new Error('Injected Properties failure');
      h.properties[key]=String(value);h.propertyWrites.push({key,value:String(value)});return props;
    },
    deleteProperty(key) {delete h.properties[key];return props;}
  };
  const cache={
    get:key=>h.cache.get(key) ?? null,
    put(key,value,ttl){h.cache.set(key,value);h.cachePuts.push({key,value,ttl});},
    remove:key=>h.cache.delete(key)
  };
  const scriptApp={
    getProjectTriggers:()=>h.triggers.slice(),
    deleteTrigger:t=>{h.triggers=h.triggers.filter(x=>x!==t);},
    newTrigger(handler){const t={handler,getHandlerFunction:()=>handler};return {
      timeBased(){return this;},everyMinutes(n){t.minutes=n;return this;},create(){h.triggers.push(t);return t;}
    };}
  };
  const makeFolder = name=>({
    getId:()=> 'folder-'+name,getName:()=>name,
    getFoldersByName(child){h.now+=2;let used=false;return {hasNext:()=>!used&&h.folders.has(child),next(){used=true;return h.folders.get(child);}};},
    createFolder(child){h.now+=3;const folder=makeFolder(child);h.folders.set(child,folder);return folder;},
    createFile(blob){h.now+=11;if(h.failPhoto)throw new Error('Injected Drive failure');h.photos.push({folder:name,...blob});return {getId:()=>`photo-${h.photos.length}`,getUrl:()=>`https://example.test/photo/${h.photos.length}`};}
  });
  const photoRoot=makeFolder('root');
  const ctx=vm.createContext({Date:Clock,console:{log:line=>{if(h.failLog)throw new Error('Injected log failure');h.logs.push(line);}},
    Logger:{log:line=>h.warnings.push(line)},
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:content=>({content,setMimeType(){return this;}})},
    PropertiesService:{getScriptProperties:()=>props},CacheService:{getScriptCache:()=>cache},ScriptApp:scriptApp,
    Utilities:{formatDate,sleep:ms=>{h.now+=ms;},getUuid:()=>`${String(++sequence).padStart(8,'0')}-0000-0000-0000-000000000000`,
      DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'UTF-8'},computeDigest:(algorithm,value)=>Array.from(crypto.createHash(algorithm||'sha256').update(Array.isArray(value)?Buffer.from(value):value).digest()),
      base64Decode:data=>Array.from(Buffer.from(data,'base64')),newBlob:(bytes,mime,name)=>({bytes,mime,name})},
    SpreadsheetApp:{openById:id=>{h.opens.push(id);return id===ctx.LORD_CONFIG.SPREADSHEET_ID?h.ss:h.ref;},flush(){h.now+=2;}},
    Sheets:{Spreadsheets:{batchUpdate(body){
      assert(h.locked);h.now+=7;if(h.failBatch)throw new Error('Injected batch failure');
      const byId=Object.fromEntries(Object.values(h.sheets).map(s=>[s.id,s]));
      // Validate all updates before applying any, modelling atomic batchUpdate.
      for(const req of body.requests) if(req.updateCells){const p=req.updateCells;assert(byId[p.range.sheetId]);assert.equal(p.fields,'userEnteredValue');}
      for(const req of body.requests){
        if(req.appendDimension){byId[req.appendDimension.sheetId].maxRows+=req.appendDimension.length;continue;}
        if(!req.updateCells)continue;
        const p=req.updateCells, r=p.range, sh=byId[r.sheetId];
        p.rows.forEach((row,i)=>row.values.forEach((cell,j)=>{
          let value=cell.userEnteredValue?Object.values(cell.userEnteredValue)[0]:'';
          const col=r.startColumnIndex+j;
          if(typeof value==='number' && /Timestamp| At$|Booking Date/.test(sh.data[0][col]||'')) value=new Clock(Date.UTC(1899,11,30)+value*86400000-8*3600000);
          (sh.data[r.startRowIndex+i]??=[])[col]=value;
        }));
      }
      h.batches.push(plain(body));
    }}},
    LockService:{getScriptLock:()=>({hasLock:()=>h.locked,
      waitLock(){h.now+=5;h.locks++;if(h.failLock)throw new Error('Injected lock timeout');assert(!h.locked);h.locked=true;},
      tryLock(){h.locks++;if(h.busy)return false;assert(!h.locked);h.locked=true;return true;},
      releaseLock(){h.locked=false;h.releases++;}
    })},
    DriveApp:{getFolderById:()=>photoRoot,getFileById:id=>({getBlob:()=>({getBytes:()=>h.driveFiles.get(id).bytes})})},
    Drive:{Files:{
      generateIds(options){assert(!h.locked,'Drive generation must occur outside the write lock');h.driveCalls.push('generate');return {ids:Array.from({length:options.count},()=> 'photo-'+(++h.driveSequence))};},
      get(id){assert(!h.locked,'Drive read must occur outside the write lock');h.driveCalls.push('get');if(h.failDriveGet)throw Error('temporary Drive read failure');const file=h.driveFiles.get(id);if(!file){const error=Error('File not found: '+id);error.code=404;throw error;}return h.transformDriveMetadata?h.transformDriveMetadata(plain(file)):plain(file);},
      create(metadata,blob){assert(!h.locked,'Drive upload must occur outside the write lock');h.driveCalls.push('create');h.now+=11;if(h.failPhoto)throw Error('Injected Drive failure');if(h.driveFiles.has(metadata.id)){const error=Error('File already exists');error.code=409;throw error;}
        const file={...plain(metadata),size:String(blob.bytes.length),md5Checksum:crypto.createHash('md5').update(Buffer.from(blob.bytes)).digest('hex'),sha256Checksum:crypto.createHash('sha256').update(Buffer.from(blob.bytes)).digest('hex'),webViewLink:'https://example.test/photo/'+metadata.id.split('-')[1],bytes:blob.bytes,trashed:false};
        h.driveFiles.set(file.id,file);h.photos.push({folder:file.parents[0].replace(/^folder-/,''),...blob});if(h.afterDriveCreate)h.afterDriveCreate(file);if(h.loseDriveCreateResponse)throw Error('create response lost');return h.transformDriveMetadata?h.transformDriveMetadata(plain(file)):plain(file);
      }
    }},
    UrlFetchApp:{fetch(url,options){const payload=JSON.parse(options.payload);h.sends.push(payload.text);const failed=h.sendFailure?.(payload.text);return {getResponseCode:()=>failed?503:200,getContentText:()=>failed?'Injected failure':'ok'};}},
    MailApp:{sendEmail:()=>{}}
  });
  vm.runInContext(options.source || source,ctx);
  h.ctx=ctx;h.Sheet=Sheet;h.Clock=Clock;h.props=props;
  h.sheets={};h.refSheets={};
  h.ss={getId:()=> 'transactions-fixture',getSheetByName:name=>h.sheets[name],getSpreadsheetTimeZone:()=> 'Asia/Singapore'};
  h.ref={getId:()=> 'reference-fixture',getSheetByName:name=>h.refSheets[name]};
  let sheetId=0;
  for(const [name,headers] of [[ctx.BOOKING_CONFIG.SHEET,ctx.BOOKING_HEADERS],[ctx.LORD_CONFIG.SHEETS.SESSIONS,ctx.SESSION_HEADERS],
    [ctx.LORD_CONFIG.SHEETS.TROLLEYS,ctx.TROLLEY_HEADERS],[ctx.LORD_CONFIG.SHEETS.EVENTS,ctx.EVENT_HEADERS],
    [ctx.LORD_AUTH_CONFIG.ADMINS_SHEET,ctx.ADMIN_HEADERS]]) h.sheets[name]=new Sheet(++sheetId,name,[headers]);
  h.sheets[ctx.BOOKING_CONFIG.CONTACTS_SHEET]=new Sheet(++sheetId,'contacts',[
    ['Name','','Schools','GSPS','','Mobile','','WhatsApp'],
    ['Admin','','admin@schools.gov.sg','admin@gsps.edu.sg','','','',''],
    ['Staff','','staff@schools.gov.sg','staff@gsps.edu.sg','','','','']
  ]);
  h.sheets[ctx.LORD_AUTH_CONFIG.ADMINS_SHEET].data.push(['admin@gsps.edu.sg','Admin','yes','Admin','','admin-sub']);
  const reference={teachers:[['Admin'],['Staff']],classes:[['5A']],subjects:[['SCI']],
    trolleys:[['Name','Quantity','Cart','Type','Stylus','Headphone'],['Trolley A',14,'Cart A','Tablet','No','No']],
    timetable:[['Code','Start','End'],['1','08:00','08:30'],['2','08:30','09:00'],['3','09:00','09:30'],['4','09:30','10:00']]};
  for(const [key,rows] of Object.entries(reference)) {const name=ctx.LORD_REFERENCE_CONFIG.SHEETS[key];h.refSheets[name]=new Sheet(++sheetId,name,rows);}
  h.post=request=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({proxySecret:ctx.LORD_CONFIG.PROXY_SECRET,...request})}}).content);
  h.get=parameters=>JSON.parse(ctx.doGet({parameter:{proxySecret:ctx.LORD_CONFIG.PROXY_SECRET,...parameters}}).content);
  h.reset=()=>ctx.resetExecutionContext_();
  h.contacts=h.sheets[ctx.BOOKING_CONFIG.CONTACTS_SHEET];h.admins=h.sheets[ctx.LORD_AUTH_CONFIG.ADMINS_SHEET];
  return h;
}

function request(extra={}) {return {action:'bookingCreate',clientRequestId:'request-1',teacher:'Staff',authTtbName:'Staff',authEmail:'staff@gsps.edu.sg',authSub:'staff-sub',authIsAdmin:false,
  date:'2026-10-09',resource:'Cart A',startPeriod:'2',endPeriod:'2',classOrActivity:'5A',subject:'SCI',deviceType:'Tablet',requestedQuantity:14,...extra};}
function adminRequest(extra={}) {return request({authIsAdmin:true,teacher:'Admin',authTtbName:'Admin',authEmail:'admin@gsps.edu.sg',authSub:'admin-sub',overrideReason:'Supervised handover',...extra});}
function addExisting(h,period='1') {const row=Array(30).fill('');Object.assign(row,{0:'EXISTING',1:'BOOKED',2:'Other',4:'5B',6:new h.Clock('2026-10-09T00:00:00+08:00'),7:'Cart A',10:period,11:period});h.sheets.Bookings.data.push(row);}
function metric(h) {assert.equal(h.logs.length,1);return JSON.parse(h.logs[0]);}
function readCount(h,name) {return h.reads.filter(r=>r.sheet===name).length;}


module.exports={harness,request,adminRequest,addExisting,metric,readCount,plain};
