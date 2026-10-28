// Offline integration tests. Real production cells, emails and Drive files are never changed.
process.env.TZ = 'Asia/Singapore';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Source/backend/Code.gs'), 'utf8');
const results = [];
const metrics = {};
const clone = v => structuredClone(v);
const now = new Date('2026-09-29T10:00:00Z');

function harness() {
  const h = { sheets: {}, batches: [], reads: [], writes: [], tasks: [], photos: [], locked: false, attempts: 0, failAt: 0, replay: new Map() };
  let sequence = 0;
  class Sheet {
    constructor(id, name, headers, rows=[]) { this.id=id; this.name=name; this.headers=headers; this.data=[Array.from(headers), ...clone(rows)]; this.maxRows=1000; this.formulas=new Map(); this.formats=new Map(); h.sheets[name]=this; }
    getSheetId() { return this.id; }
    getName() { return this.name; }
    getMaxRows() { return this.maxRows; }
    getLastRow() { return this.data.length; }
    getLastColumn() { return this.headers.length; }
    getRange(r,c,n=1,w=1) {
      assert.equal(typeof r, 'number');
      const sh=this;
      const obj={
        getValues() { h.reads.push({sheet:sh.name,r,c,n,w}); return Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>clone(sh.data[r+i-1]?.[c+j-1]??''))); },
        getDisplayValues() { return obj.getValues().map(row=>row.map(v=>String(v??''))); },
        setValues(values) { assert(h.locked,'Built-in transaction write must hold lock'); for(let i=0;i<n;i++)for(let j=0;j<w;j++){ (sh.data[r+i-1]??=[])[c+j-1]=clone(values[i][j]); h.writes.push({sheet:sh.name,row:r+i,col:c+j});} return obj; },
        createTextFinder(query) {
          const finder={matchEntireCell(){return finder},matchCase(){return finder},findAll(){ const out=[]; for(let i=0;i<n;i++){if(String(sh.data[r+i-1]?.[c-1]??'')===query)out.push({getRow:()=>r+i})}return out;},findNext(){return finder.findAll()[0]??null}};
          return finder;
        }
      }; return obj;
    }
    appendRow(row) { this.getRange(this.data.length+1,1,1,row.length).setValues([row]); }
  }
  const ss={getId:()=> 'TEST',getName:()=> 'Fixture',getSpreadsheetTimeZone:()=> 'Asia/Singapore',getSheetByName:name=>h.sheets[name]};
  const utilities={
    getUuid:()=>`id-${++sequence}`,
    formatDate(date,tz,pattern) {
      const shifted=new Date(date.getTime()+8*3600000);
      if(pattern==="yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")return shifted.toISOString();
      if(pattern==='yyyy-MM-dd')return shifted.toISOString().slice(0,10);
      if(pattern==='H')return String(shifted.getUTCHours());
      return shifted.toISOString();
    }
  };
  function batchUpdate(body) {
    assert(h.locked,'Atomic transaction write must hold lock');
    h.attempts++;
    if(h.failAt===h.attempts)throw new Error('Injected batch rejection');
    const byId=Object.fromEntries(Object.values(h.sheets).map(sh=>[sh.id,sh]));
    // Validate the whole request before applying any member, as the real API does.
    for(const req of body.requests) {
      if(!req.updateCells)continue;
      const p=req.updateCells, r=p.range;
      assert(byId[r.sheetId]); assert(r.startRowIndex>=1); assert.equal(p.fields,'userEnteredValue');
      assert.equal(p.rows.length,r.endRowIndex-r.startRowIndex);
      p.rows.forEach(row=>assert.equal(row.values.length,r.endColumnIndex-r.startColumnIndex));
    }
    const touched=[];
    for(const req of body.requests) {
      if(req.appendDimension){byId[req.appendDimension.sheetId].maxRows+=req.appendDimension.length;continue;}
      if(req.repeatCell){const r=req.repeatCell.range;byId[r.sheetId].formats.set(`${r.startRowIndex+1}:${r.startColumnIndex+1}`,clone(req.repeatCell.cell.userEnteredFormat));continue;}
      const p=req.updateCells,r=p.range,sh=byId[r.sheetId];
      for(let i=0;i<p.rows.length;i++)for(let j=0;j<p.rows[i].values.length;j++) {
        const cell=p.rows[i].values[j].userEnteredValue;
        let v=cell?Object.values(cell)[0]:'';
        const col=r.startColumnIndex+j;
        if(typeof v==='number' && /Timestamp| At$|Booking Date/.test(sh.headers[col]||'')) v=new Date(Date.UTC(1899,11,30)+v*86400000-8*3600000);
        const row=r.startRowIndex+i;
        (sh.data[row]??=[])[col]=v;
        sh.formulas.delete(`${row+1}:${col+1}`);
        touched.push({sheet:sh.name,row:row+1,col:col+1});
      }
    }
    h.batches.push({requests:clone(body.requests),touched}); h.writes.push(...touched);
  }
  const ctx=vm.createContext({Date,Number,console,Utilities:utilities,Logger:{log(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>require('./backend_config_fixture.cjs')[key]||null})},
    SpreadsheetApp:{flush(){}},Sheets:{Spreadsheets:{batchUpdate}},
    LockService:{getScriptLock:()=>({hasLock:()=>h.locked,waitLock(){assert(!h.locked);h.locked=true;},releaseLock(){h.locked=false;}})}
  });
  vm.runInContext(source,ctx);
  Object.assign(ctx,{
    getTransactionSpreadsheet_:()=>ss,
    assertSessionSchema_:()=>true,
    isAuthenticatedAdmin_:()=>true,
    validateBookingCredential_:()=>true,
    isBookingOwner_:()=>true,
    getBookingNotificationEmails_:()=>['staff@example.test'],
    getGspsEmailForTtbName_:()=> 'staff@example.test',
    findBookingConflict_:()=>null,
    authoriseConflict_:()=>({used:false,reason:''}),
    isBackTimed_:()=>false,
    clearBookingDayCache_:()=>{},
    queueSecondaryTask_:(kind,payload)=>h.tasks.push({kind,payload}),
    enqueueSecondary_:(kind,payload)=>h.tasks.push({kind,payload}),
    // This suite isolates surgical custody writes. Real Drive/manifest and
    // interrupted-retry behavior runs in run_evidence_upload_checks.
    prepareEvidenceUploads_:()=>{},
    queueEvidenceCommit_:()=>{},
    requireCommittedEvidence_:sessionId=>{assert([...h.replay.values()].some(result=>result.sessionId===sessionId),'Photos were not attached by this submission');},
    getSessionPhotoFolder_:()=>({}),
    savePhoto_:details=>{h.photos.push(details);return {fileId:'photo-'+h.photos.length,url:'https://example.test/photo/'+h.photos.length}},
    createSessionIdForRequest_:id=>'SESSION-'+id,
    getIdempotentResult_:id=>h.replay.get(id),
    storeIdempotentResult_:(id,value)=>h.replay.set(id,value)
  });
  new Sheet(1,'Bookings',ctx.BOOKING_HEADERS);
  new Sheet(2,'Sessions',ctx.SESSION_HEADERS);
  new Sheet(3,'Session Trolleys',ctx.TROLLEY_HEADERS);
  new Sheet(4,'Event Log',ctx.EVENT_HEADERS);
  h.ctx=ctx; h.Sheet=Sheet; h.withLock=fn=>ctx.withWriteLock_(fn);
  h.put=(name,index,row)=>{ const sh=h.sheets[name]; while(sh.data.length<index)sh.data.push(Array(sh.headers.length).fill('')); sh.data[index-1]=clone(row); };
  return h;
}
function booking(id='B1', status='BOOKED', session='') {
  const a=Array(30).fill('');
  Object.assign(a,{0:id,1:status,2:'Test Staff',3:'staff@example.test',4:'5A',5:'SCI',6:new Date('2026-09-29T00:00:00'),7:'Cart B',8:'MacBook Neo',9:41,10:'1',11:'2',12:false,13:false,15:'TOKEN_HASH',16:'CODE_HASH',17:now,18:now,20:session,21:false,22:false,25:'staff@example.test',26:'Test Staff'});
  return a;
}
function session(id='S1',status='OPEN') {
  const a=Array(42).fill('');
  Object.assign(a,{0:id,1:status,2:'Test Staff',4:'5A',5:'SCI',6:'Cart B',7:now,9:2,10:27,12:'original loan notes',14:now,15:now,16:'collector-sub',17:'staff@example.test',18:'Test Staff',22:'GSPS',26:false,27:false}); return a;
}
function trolley(id,sid,sequence,qty) {const a=Array(16).fill('');Object.assign(a,{0:id,1:sid,2:sequence,3:'Laptop '+sequence,4:qty,5:'loan-photo',6:'https://example.test/loan',15:now});return a;}
function returnFixture() {
  const h=harness();h.put('Sessions',2,session());h.put('Bookings',2,booking('B1','COLLECTED','S1'));
  h.put('Session Trolleys',2,trolley('T1','S1',1,14));h.put('Session Trolleys',4,trolley('T2','S1',2,13));
  h.put('Session Trolleys',3,trolley('OTHER','OTHER-SESSION',1,45));
  h.request={sessionId:'S1',teacher:'Return Staff',authEmail:'return@example.test',authSub:'return-sub',trolleys:[
    {trolleyRecordId:'T1',quantity:14,correctTrolleyDeclaration:true,sameOrientationDeclaration:true,photoData:'test'},
    {trolleyRecordId:'T2',quantity:13,correctTrolleyDeclaration:true,sameOrientationDeclaration:true,photoData:'test'}]};return h;
}
function test(name,fn){try{fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:e.stack});}}
function coords(batch,sheet){return batch.touched.filter(x=>x.sheet===sheet).map(x=>`${x.row}:${x.col}`).sort();}

test('Cancellation changes exactly status, updated-at and cancelled-at; preserves formulas and credentials',()=>{
  const h=harness();h.put('Bookings',2,booking());h.sheets.Bookings.formulas.set('2:6','=LOOKUP()');
  h.withLock(()=>h.ctx.cancelBooking_({bookingId:'B1'}));
  assert.deepEqual(coords(h.batches[0],'Bookings'),['2:19','2:2','2:20']);
  assert.equal(h.sheets.Bookings.data[1][15],'TOKEN_HASH');assert.equal(h.sheets.Bookings.formulas.get('2:6'),'=LOOKUP()');
  metrics.cancellation={oldCells:30,newCells:3,batchCalls:h.batches.length};
});
test('No-op row diff performs no service call; equal dates do not rewrite',()=>{
  const h=harness();h.withLock(()=>h.ctx.writeChangedRow_(h.sheets.Bookings,2,[now,'',false,0],[new Date(now),null,false,0]));assert.equal(h.batches.length,0);
});
test('Administrator quantity-only edit preserves other cells',()=>{
  const h=harness();h.put('Bookings',2,booking());
  h.withLock(()=>h.ctx.updateBooking_({bookingId:'B1',date:'2026-09-29',resource:'Cart B',startPeriod:'1',endPeriod:'2',classOrActivity:'5A',subject:'SCI',deviceType:'MacBook Neo',requestedQuantity:40}));
  assert.deepEqual(coords(h.batches[0],'Bookings'),['2:10','2:19']);
});
test('Collection linkage changes exactly three cells; completion changes exactly two',()=>{
  const h=harness();h.put('Bookings',2,booking());h.withLock(()=>h.ctx.linkBookingCollection_({bookingId:'B1',sessionId:'S1'}));
  assert.deepEqual(coords(h.batches[0],'Bookings'),['2:19','2:2','2:21']);
  // Model a later Return, rather than requiring two test calls to span a millisecond.
  h.sheets.Bookings.data[1][18]=new Date(Date.now()-60000);
  h.withLock(()=>h.ctx.completeBookingBySession_({sessionId:'S1'}));
  assert.deepEqual(coords(h.batches[1],'Bookings'),['2:19','2:2']);
  const calls=h.batches.length;h.withLock(()=>h.ctx.completeBookingBySession_({sessionId:'S1'}));assert.equal(h.batches.length,calls);
});
test('Rejected booking batch leaves every cell unchanged and releases the lock',()=>{
  const h=harness();h.put('Bookings',2,booking());const before=clone(h.sheets.Bookings.data);h.failAt=1;
  assert.throws(()=>h.withLock(()=>h.ctx.cancelBooking_({bookingId:'B1'})),/Injected/);assert.deepEqual(h.sheets.Bookings.data,before);assert(!h.locked);
});
test('Clean return commits Session and scattered trolley evidence together, preserving unrelated rows',()=>{
  const h=returnFixture(),other=clone(h.sheets['Session Trolleys'].data[2]);
  h.sheets.Sessions.formulas.set('2:13','=NOTE()');
  const result=h.ctx.completeReturn_(h.request,'RETURN1');assert.equal(result.status,'RETURNED');assert.equal(h.batches.length,1);
  assert.deepEqual([...new Set(h.batches[0].touched.map(x=>x.sheet))].sort(),['Session Trolleys','Sessions']);
  assert.deepEqual(h.sheets['Session Trolleys'].data[2],other);assert.equal(h.sheets.Sessions.data[1][12],'original loan notes');assert(h.sheets.Sessions.formulas.has('2:13'));
  assert.equal(h.sheets.Sessions.data[1][11],27);assert.equal(h.sheets.Sessions.data[1][16],'collector-sub');
  assert(h.batches[0].touched.filter(x=>x.sheet==='Session Trolleys').every(x=>x.col>=8));
  metrics.cleanReturn={oldCells:42+18,newCells:h.batches[0].touched.length,batchCalls:1};
  h.ctx.completeReturn_(h.request,'RETURN1');assert.equal(h.batches.length,1);
});
test('Failed return batch leaves Session OPEN and trolley evidence unchanged; retry succeeds once',()=>{
  const h=returnFixture(),s=clone(h.sheets.Sessions.data),t=clone(h.sheets['Session Trolleys'].data);h.failAt=1;
  assert.throws(()=>h.ctx.completeReturn_(h.request,'RETRY'),/Injected/);assert.deepEqual(h.sheets.Sessions.data,s);assert.deepEqual(h.sheets['Session Trolleys'].data,t);
  h.failAt=0;assert.equal(h.ctx.completeReturn_(h.request,'RETRY').status,'RETURNED');assert.equal(h.batches.length,1);
});
test('Partial return is rejected before photos or writes',()=>{
  const h=returnFixture();h.request.trolleys.pop();assert.throws(()=>h.ctx.completeReturn_(h.request,'X'),/All trolleys/);assert.equal(h.photos.length,0);assert.equal(h.batches.length,0);
});
test('Duplicate trolley return is rejected before photos or writes',()=>{
  const h=returnFixture();h.request.trolleys[1]=h.request.trolleys[0];assert.throws(()=>h.ctx.completeReturn_(h.request,'X'),/more than once/);assert.equal(h.photos.length,0);
});
test('Quantity mismatch requires issue note; accepted issue keeps custody closure',()=>{
  const h=returnFixture();h.request.trolleys[1].quantity=12;
  assert.throws(()=>h.ctx.completeReturn_(h.request,'X'),/discrepancy/);h.request.issue=true;
  assert.throws(()=>h.ctx.completeReturn_(h.request,'X'),/Describe/);h.request.issueNotes='One device missing';
  assert.equal(h.ctx.completeReturn_(h.request,'X').status,'RETURNED WITH ISSUE');assert.equal(h.sheets['Session Trolleys'].data[3][14],'One device missing');
});
test('Zero collected headphones need no accessory photo and remain valid',()=>{
  const h=returnFixture();h.sheets.Sessions.data[1][27]=true;h.sheets.Sessions.data[1][31]=0;h.request.accessories={headphones:{quantity:0}};
  assert.equal(h.ctx.completeReturn_(h.request,'X').status,'RETURNED');assert.equal(h.photos.length,2);
});
test('18:00 sweep touches only eligible cells, preserves closed/pending rows and is atomic across sheets',()=>{
  const h=harness();
  for(let i=2;i<=201;i++){h.put('Sessions',i,session('S'+i,'RETURNED'));h.put('Bookings',i,booking('B'+i,'COMPLETED','S'+i));}
  for(const i of [5,198]) {h.sheets.Sessions.data[i-1][1]='OPEN';h.sheets.Bookings.data[i-1][1]='COLLECTED';}
  h.sheets.Sessions.data[99][1]='PENDING_COLLECTION';const before=clone(h.sheets.Sessions.data[99]);
  const result=h.withLock(()=>h.ctx.forceReturnAllOpenSessions_(new Date('2026-09-29T10:05:00Z')));
  assert.equal(result.count,2);assert.equal(h.batches.length,1);
  assert(h.batches[0].touched.every(x=>x.sheet==='Event Log'?[2,3,4].includes(x.row):['Sessions','Bookings'].includes(x.sheet)&&[5,198].includes(x.row)));
  assert.equal(h.sheets['Event Log'].data.filter(row=>row[2]==='WHATSAPP_FORCE_CLOSE_PENDING').length,1);
  assert.deepEqual(h.sheets.Sessions.data[99],before);
  assert.equal(h.sheets.Sessions.data[4][11],'');assert.equal(h.sheets.Sessions.data[4][34],'');
  metrics.sweep={fixtureSessions:200,fixtureBookings:200,openSessions:2,oldCells:200*42+200*30,newCells:h.batches[0].touched.length,batchCalls:1};
});
test('Rejected 18:00 batch closes neither bookings nor sessions',()=>{
  const h=returnFixture();const s=clone(h.sheets.Sessions.data),b=clone(h.sheets.Bookings.data);h.failAt=1;
  assert.throws(()=>h.withLock(()=>h.ctx.forceReturnAllOpenSessions_(now)),/Injected/);assert.deepEqual(h.sheets.Sessions.data,s);assert.deepEqual(h.sheets.Bookings.data,b);
});
test('Trolley lookup reads only matched row groups, preserves sequence order',()=>{
  const h=harness();for(let i=2;i<=500;i++)h.put('Session Trolleys',i,trolley('T'+i,'OTHER',i,14));
  for(const [i,seq] of [[10,3],[11,1],[400,2]])h.put('Session Trolleys',i,trolley('T'+i,'S1',seq,13));
  const rows=h.ctx.getTrolleyRowsForSession_(h.sheets['Session Trolleys'],'S1');
  assert.deepEqual(Array.from(rows,x=>x.rowNumber),[11,400,10]);
  assert.equal(h.reads.reduce((n,r)=>n+r.n*r.w,0),48);assert.equal(h.reads.length,2);
});
test('Pending trolley retry preserves record IDs, clears only surplus matching records',()=>{
  const h=harness();h.put('Session Trolleys',2,trolley('KEEP','S1',1,14));h.put('Session Trolleys',3,trolley('OTHER','S2',1,14));h.put('Session Trolleys',4,trolley('REMOVE','S1',2,14));
  const staged=[{trolleyRecordId:'NEW',sequence:1,name:'Laptop 1',quantity:13,photoFileId:'new',photoUrl:'new-url'}];
  h.withLock(()=>h.ctx.writePendingCollectionTrolleys_(h.sheets['Session Trolleys'],'S1',staged,now));
  assert.equal(staged[0].trolleyRecordId,'KEEP');assert.equal(h.sheets['Session Trolleys'].data[2][0],'OTHER');assert(h.sheets['Session Trolleys'].data[3].every(v=>v===''));
});
test('MacBook Neo reference data parses into capacities 42/41 with the 13-device final trolley',()=>{
  const h=harness();const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/reference_trolleys_2026-09-29.json'),'utf8'));
  const sheet=new h.Sheet(9,'trolleys',fixture.values[0],fixture.values.slice(1));
  h.ctx.getReferenceRequiredSheet_=()=>sheet;
  const trolleys=h.ctx.readReferenceTrolleys_({},'trolleys');const resources=h.ctx.buildBookingResources_(trolleys);
  for(const [cart,qty] of [['Cart A',42],['Cart B',41]]){const r=resources.find(r=>r.resource===cart);assert.equal(r.capacity,qty);assert.equal(r.deviceType,'MacBook Neo');assert.equal(r.stylusOption,false);assert.equal(r.headphoneOption,true);}
  assert.equal(trolleys.find(t=>t.name==='Laptop B29 - B41').defaultQuantity,13);
});
test('Cell codec preserves booleans/zero, clears blanks and stores formula-looking text literally',()=>{
  const h=harness();assert.equal(h.ctx.surgicalCellData_(false).userEnteredValue.boolValue,false);assert.equal(h.ctx.surgicalCellData_(0).userEnteredValue.numberValue,0);
  assert.equal(Object.keys(h.ctx.surgicalCellData_('')).length,0);assert.equal(h.ctx.surgicalCellData_('=1+1').userEnteredValue.stringValue,'=1+1');assert.throws(()=>h.ctx.surgicalCellData_(NaN));
  const serial=h.ctx.surgicalCellData_(now).userEnteredValue.numberValue;
  assert.equal(new Date(Date.UTC(1899,11,30)+serial*86400000).toISOString(),'2026-09-29T18:00:00.000Z');
});
test('Missing Sheets service fails with setup guidance before a Sheet write',()=>{
  const h=harness();delete h.ctx.Sheets;assert.throws(()=>h.ctx.requireSurgicalSheets_(),/add Google Sheets API/);assert.equal(h.writes.length,0);
});
test('New row allocation expands only rows when needed and dates receive formatting',()=>{
  const h=harness();h.sheets.Sessions.maxRows=1;const requests=[];
  h.ctx.queueNewRows_(requests,h.sheets.Sessions,2,[session()]);h.withLock(()=>h.ctx.commitSurgicalUpdates_(requests));
  assert.equal(h.sheets.Sessions.maxRows,2);assert(h.sheets.Sessions.formats.has('2:8'));assert.equal(h.sheets.Sessions.data[1][0],'S1');
});

function loanFixture() {
  const h=harness();h.put('Bookings',2,booking());
  h.request={bookingId:'B1',teacher:'Test Staff',authTtbName:'Test Staff',authSub:'test-sub',authEmail:'staff@example.test',classOrActivity:'5A',subject:'SCI',cartGroup:'Cart B',trolleys:[
    {name:'Laptop B01 - B14',quantity:14,photoData:'test'},
    {name:'Laptop B15 - B28',quantity:14,photoData:'test'},
    {name:'Laptop B29 - B41',quantity:13,photoData:'test'}]};return h;
}
test('Collection commits all three Sheets in one batch, totals 41 and replays without duplication',()=>{
  const h=loanFixture();const result=h.ctx.createLoanSession_(h.request,'LOAN1');
  assert.equal(result.deviceTotal,41);assert.equal(result.status,'OPEN');assert.equal(h.batches.length,1);
  assert.deepEqual([...new Set(h.batches[0].touched.map(x=>x.sheet))].sort(),['Bookings','Session Trolleys','Sessions']);
  assert.equal(h.sheets.Bookings.data[1][1],'COLLECTED');assert.equal(h.sheets.Sessions.data[1][1],'OPEN');
  assert.equal(h.sheets['Session Trolleys'].data[3][4],13);
  const replay=h.ctx.createLoanSession_(h.request,'LOAN1');assert.equal(replay.sessionId,result.sessionId);assert.equal(h.batches.length,1);
  metrics.collection={oldCommitCalls:4,newCommitCalls:1,newCells:h.batches[0].touched.length};
});
test('Rejected Collection creates no partial Session/trolleys/link; same request retries safely',()=>{
  const h=loanFixture(),book=clone(h.sheets.Bookings.data);h.failAt=1;
  assert.throws(()=>h.ctx.createLoanSession_(h.request,'RETRY'),/Injected/);
  assert.equal(h.sheets.Sessions.getLastRow(),1);assert.equal(h.sheets['Session Trolleys'].getLastRow(),1);assert.deepEqual(h.sheets.Bookings.data,book);
  h.failAt=0;assert.equal(h.ctx.createLoanSession_(h.request,'RETRY').status,'OPEN');assert.equal(h.batches.length,1);
});
test('Legacy pending Collection resumes without duplicating Session or trolley record IDs',()=>{
  const h=loanFixture();h.put('Sessions',2,session('SESSION-LEGACY','PENDING_COLLECTION'));h.put('Session Trolleys',2,trolley('OLD-TROLLEY','SESSION-LEGACY',1,14));
  const result=h.ctx.createLoanSession_(h.request,'LEGACY');assert.equal(result.status,'OPEN');assert.equal(h.sheets.Sessions.getLastRow(),2);assert.equal(h.sheets['Session Trolleys'].data[1][0],'OLD-TROLLEY');assert.equal(h.batches.length,1);
});
test('Another OPEN or pending loan still blocks collection of the same cart',()=>{
  for(const status of ['OPEN','PENDING_COLLECTION']) {
    const h=loanFixture();h.put('Sessions',2,session('OTHER',status));assert.throws(()=>h.ctx.createLoanSession_(h.request,'BLOCKED'),/active or pending/);assert.equal(h.batches.length,0);
  }
});
test('Already force-closed Session rejects a new photo declaration without manufacturing evidence',()=>{
  const h=returnFixture();h.sheets.Sessions.data[1][1]='FORCED RETURN';assert.throws(()=>h.ctx.completeReturn_(h.request,'X'),/Photos were not attached/);assert.equal(h.photos.length,0);assert.equal(h.batches.length,0);
});

const failed=results.filter(r=>!r.ok);
fs.writeFileSync(path.join(__dirname,'behavior_results.json'),JSON.stringify({passed:results.length-failed.length,failed:failed.length,total:results.length,metrics,tests:results},null,2));
console.log(JSON.stringify({passed:results.length-failed.length,failed:failed.length,total:results.length,metrics},null,2));
for(const item of failed)console.error(item.name+'\n'+item.error);
process.exitCode=failed.length?1:0;
