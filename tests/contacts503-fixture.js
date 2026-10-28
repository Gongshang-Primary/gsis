// Synthetic source and browser-independent Apps Script support. No live writes.
const base=require('./contacts502-fixture.js'),zlib=require('zlib');
module.exports=function fixture(options={}){
 const f=base(options.source);f.stats.lockAttempts=[];
 const getLock=f.ctx.LockService.getScriptLock;
 f.ctx.LockService.getScriptLock=()=>{const lock=getLock();return {tryLock(ms){f.stats.lockAttempts.push(ms);return lock.tryLock(ms)},releaseLock:()=>lock.releaseLock()};};
 const reset=f.reset;f.reset=()=>{reset();f.stats.lockAttempts.length=0;};
 if(options.gzip!==false){
  const blob=value=>{const b=Buffer.from(typeof value==='string'?value:Uint8Array.from(value));return {getBytes:()=>Array.from(b),getDataAsString:()=>b.toString('utf8')};};
  f.ctx.Utilities.newBlob=blob;
  f.ctx.Utilities.gzip=b=>blob(zlib.gzipSync(Buffer.from(b.getBytes())));
  f.ctx.Utilities.ungzip=b=>blob(zlib.gunzipSync(Buffer.from(b.getBytes())));
  f.ctx.Utilities.base64DecodeWebSafe=text=>Array.from(Buffer.from(text,'base64url'));
 }
 f.seedSnapshot=(payload,kind='contacts',actor='admin@gsps.edu.sg')=>{
  f.ctx.seedPayload=payload;f.ctx.seedKind=kind;f.ctx.seedActor=actor;
  f.run("var seededViewRequest=Utilities.getUuid();var seededViewBook=SpreadsheetApp.openById(GSIS_SHEET);saveJournal_(seededViewBook,seededViewRequest,seedActor,seedKind,seedPayload).begin(contactViewCapture_(seededViewBook))");
  const row=f.sheets.get('contact_save_journal').data.at(-1);return {requestId:row[0],digest:row[3]};
 };
 return f;
};
