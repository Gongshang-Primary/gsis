const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let calls=[],fallback=0,failed=false;
const sheet={getName:()=>"O'Brien",getParent:()=>({getId:()=> 'book'}),getRange:()=>({setValues(){fallback++;},getValues:()=>[[1]],getDisplayValues:()=>[['1']]})};
const ctx=vm.createContext({SpreadsheetApp:{flush(){}},Sheets:{Spreadsheets:{Values:{batchGet(id,p){calls.push({id,p});return {valueRanges:p.ranges.map(()=>({values:[['001',false]]}))};},batchUpdate(p,id){calls.push({id,p});if(failed)throw Error('Synthetic API timeout');return {totalUpdatedCells:1};}}}},sheet});vm.runInContext(fs.readFileSync('backend/SheetsIO.gs','utf8'),ctx);
const run=s=>vm.runInContext(s,ctx);
run(`GSISSheets.write(null,[{sheet,writes:[{row:2,col:1,values:[["'=SUM(A1:A2)",'001','',false,0]]},{row:8,col:27,values:[["'literal"]]}]}],true)`);
assert.equal(calls.length,1);assert.equal(calls[0].p.valueInputOption,'RAW');assert.equal(calls[0].p.data[0].range,"'O''Brien'!A2:E2");assert.deepEqual(JSON.parse(JSON.stringify(calls[0].p.data[0].values)),[['=SUM(A1:A2)','001','',false,0]]);assert.equal(calls[0].p.data[1].range,"'O''Brien'!AA8:AA8");assert.equal(calls[0].p.data[1].values[0][0],"'literal");
calls=[];assert.deepEqual(JSON.parse(run('JSON.stringify(GSISSheets.read(sheet,1,1,2,3))')),[['001',false,''],['','','']]);assert.equal(calls[0].p.valueRenderOption,'UNFORMATTED_VALUE');run('GSISSheets.read(sheet,1,1,1,1,true)');assert.equal(calls[1].p.valueRenderOption,'FORMATTED_VALUE');
calls=[];run('GSISSheets.write(null,[{sheet,writes:Array.from({length:201},(_,i)=>({row:i+1,col:1,values:[[i]]}))}])');assert.deepEqual(calls.map(c=>c.p.data.length),[100,100,1]);
failed=true;assert.throws(()=>run("GSISSheets.write(null,[{sheet,writes:[{row:1,col:1,values:[['x']]}]}])"),/timeout/);assert.equal(fallback,0,'no ambiguous fallback after an API write failure');
ctx.Sheets=undefined;run("GSISSheets.write(null,[{sheet,writes:[{row:1,col:1,values:[['x']]}]}])");assert.equal(fallback,1);assert.throws(()=>run('GSISSheets.check(sheet)'),/Enable Google Sheets API/);
// Replay a field transaction after a simulated partially applied API call.
const storage=require('./storage.cjs'),c=storage.ctx,book=storage.book,sheets=storage.sheets;
book.getId=()=> 'deploy';for(const [name,s]of sheets){s.getName=()=>name;s.getParent=()=>book;}
const insert=book.insertSheet.bind(book);book.insertSheet=name=>{const s=insert(name);s.getName=()=>name;s.getParent=()=>book;return s;};
const parse=a=>{const [,name,x,row,y,end]=a.match(/^'((?:[^']|'')+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);const col=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);return {sheet:sheets.get(name.replace(/''/g,"'")),row:+row,col:col(x),height:+end-+row+1,width:col(y)-col(x)+1};};
let writes=0,failOnce=true;
c.Sheets={Spreadsheets:{Values:{batchUpdate(p){writes++;for(const [i,item]of p.data.entries()){const a=parse(item.range);a.sheet.getRange(a.row,a.col,item.values.length,item.values[0].length).setValues(item.values);if(failOnce&&i===0){failOnce=false;throw Error('After partial API write');}}return {};},batchGet(id,p){return {valueRanges:p.ranges.map(range=>{const a=parse(range);return {values:a.sheet.getRange(a.row,a.col,a.height,a.width).getValues()};})};}}}};
const exec=s=>vm.runInContext(s,c);
exec(`var testIndex=index_(book_());var testTx={commit:'api-test',index:{...testIndex,revision:testIndex.revision+1},blocks:[{sheet:'api_test',writes:[{row:2,col:1,values:[['a','1']]},{row:4,col:1,values:[['b','2']]}]}]};var locator414=fieldJournalWrite_(book_(),testTx);fieldIndexWrite_(book_(),{...testIndex,pendingFieldCommit:locator414});`);
assert.throws(()=>exec('fieldApplyRows_(book_(),testTx)'),/partial/);assert.ok(exec('index_(book_()).pendingFieldCommit'));exec('fieldRecover_(book_())');assert.equal(exec('index_(book_()).pendingFieldCommit'),undefined);assert.equal(exec('index_(book_()).revision'),exec('testTx.index.revision'));assert.equal(sheets.get('api_test').data[3][1],'2');assert.equal(writes,2);
console.log('PASS Sheets API RAW literal values, disjoint ranges, blank padding, request bounds, missing-service compatibility, no error fallback and durable partial-write recovery.');
