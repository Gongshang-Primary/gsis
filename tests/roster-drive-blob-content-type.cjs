'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),zlib=require('node:zlib'),crypto=require('node:crypto'),JSZip=require('jszip'),drive=require('./helpers/roster-daily-drive.cjs');

test('compression fakes reject absent and incorrect content types',()=>{
 const {Utilities:u}=drive().sandbox;
 for(const type of [undefined,'text/plain']){
  assert.throws(()=>u.ungzip(u.newBlob([...zlib.gzipSync('fixture')],type)),/ungzip requires/);
  assert.throws(()=>u.unzip(u.newBlob([],type)),/unzip requires/);
 }
 assert.equal(u.ungzip(u.newBlob([...zlib.gzipSync('fixture')],'application/x-gzip')).getDataAsString(),'fixture');
});
test('daily audit decompresses and verifies Drive readback',()=>{
 const d=drive(),text='Allocation audit fixture';const saved=d.call(d.payload(text));
 assert.equal(saved.verified,true);assert.equal(d.files.get(saved.fileId).bytes.toString(),text);
});
test('daily workbook decompresses, scans cells and verifies Drive readback',async()=>{
 const zip=new JSZip();zip.file('xl/worksheets/sheet1.xml','<worksheet><sheetData><row><c><is><t>Fixture</t></is></c></row></sheetData></worksheet>');
 const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),d=drive(),saved=d.call(d.payload(bytes,{kind:'excel'}));
 assert.equal(saved.verified,true);assert.deepEqual(d.files.get(saved.fileId).bytes,bytes);
 zip.file('xl/worksheets/sheet1.xml','<worksheet><sheetData><row><c><is><t>https://example.test/private?token=fixture</t></is></c></row></sheetData></worksheet>');
 const unsafe=await zip.generateAsync({type:'nodebuffer'});assert.throws(()=>d.call(d.payload(unsafe,{kind:'excel',revision:2})),/private link/);
});
test('compressed audit values still undergo privacy validation',()=>{
 const d=drive(),encoded=value=>({encoding:'gzip-audit-v1',data:zlib.gzipSync(JSON.stringify(value)).toString('base64')});
 assert.doesNotThrow(()=>d.sandbox.rosterDriveOutputPrivacy_(encoded({event:'fixture'})));
 assert.throws(()=>d.sandbox.rosterDriveOutputPrivacy_(encoded({secret:'fixture'})),/Credentials/);
});
test('backup verification decompresses and checks digest and counts',()=>{
 const d=drive(),value={schema:'gsis-roster-drive-backup-v1',tier:1,rows:[],counts:{}},raw=JSON.stringify(value),bytes=[...zlib.gzipSync(raw)],p={step:'writeBackup',digest:crypto.createHash('sha256').update(raw).digest('hex'),records:0,counts:{}};
 assert.equal(d.sandbox.rosterDriveOutputVerify_(bytes,p).records,0);
 assert.throws(()=>d.sandbox.rosterDriveOutputVerify_(bytes,{...p,digest:'0'.repeat(64)}),/digest/);
});
