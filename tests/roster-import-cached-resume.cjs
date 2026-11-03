'use strict';
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {harness}=require('./roster099-resumable-budget.cjs'),{runtime}=require('../scripts/measure-roster-preparation.cjs');
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(){return {state:{audit:Array.from({length:900},(_,i)=>({id:'row-'+i,note:'unchanged '.repeat(30)})),allocationAuditExports:{}},index:{entries:[]},files:new Map()};}
function finish(h,reply){let n=0;while(reply.preparing){assert(++n<40);reply=h.call({operation:'edgeExportManifest',requestId:'resume',preparation:reply.preparation});}return reply;}
const initial={operation:'edgeExportManifest',requestId:'resume',preparation:{ordinal:0,checkpoint:null}};
const old=runtime('e2bfe2c'),expectedHarness=harness({...old,source:fixture()});
const expected=finish(expectedHarness,expectedHarness.call(initial));
const resumed=harness({...old,source:fixture()}),captured=resumed.call(initial),planned=resumed.call({...initial,preparation:captured.preparation});
assert.equal(planned.phase,'Prepare records');
resumed.replaceRuntime(runtime('working'));
const actual=finish(resumed,planned);
assert.deepEqual(JSON.parse(JSON.stringify(actual.manifest)),JSON.parse(JSON.stringify(expected.manifest)),'a v0.9.9i raw work file resumes without changing any manifest part');
for(const part of actual.manifest.parts){const result=resumed.call({operation:'edgeExportPart',requestId:'resume',partId:part.id,preparation:actual.preparation});assert.equal(hash(result.payload),part.digest);}
const names=resumed.sourceWrites.map(x=>x.name);assert.equal(new Set(names).size,names.length,'resuming old work never duplicates files');
const unicode=harness({source:fixture(),actor:'管理员@example.test'}),unicodeResult=finish(unicode,unicode.call(initial));
assert.deepEqual(JSON.parse(JSON.stringify(unicodeResult.manifest.scopes)),JSON.parse(JSON.stringify(expected.manifest.scopes)),'UTF-8 cache headers preserve byte offsets and scope digests');
console.log('PASS cached preparation resumes v0.9.9i work with identical manifest, payload hashes and retained files');
