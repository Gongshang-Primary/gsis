const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('backend/Code.gs','utf8');
function functionSource(name){const start=code.indexOf('function '+name+'('),end=code.indexOf('\nfunction ',start+1);return code.slice(start,end<0?undefined:end);}
const values={},opened=[],writes=[];
const ctx={DEPLOY_ID:'legacy-deploy',props_:()=>({getProperty:k=>values[k]||null,setProperty:(k,v)=>{values[k]=v;writes.push(k);}}),SpreadsheetApp:{openById:id=>{opened.push(id);return id}},readLandmarkRegistry_:()=>({revision:1})};
vm.createContext(ctx);require('./load-backend-role.cjs')(ctx,'deploy');
vm.runInContext(functionSource('book_'),ctx);
assert.equal(ctx.book_(),'legacy-deploy');
values.DEPLOY_SHEET_ID='configured-deploy';assert.equal(ctx.book_(),'configured-deploy');
vm.runInContext(functionSource('setupLandmarkDeploy'),ctx);
assert.throws(()=>ctx.setupLandmarkDeploy(),/Set LANDMARK_SHEET_ID/);assert.equal(writes.length,0);
values.LANDMARK_SHEET_ID='configured-layout';assert.equal(ctx.setupLandmarkDeploy().ready,true);assert.equal(values.LANDMARK_SHEET_ID,'configured-layout');assert.equal(writes.length,0);
delete values.DEPLOY_SHEET_ID;delete values.LANDMARK_SHEET_ID;ctx.setupLandmarkDeploy();assert.ok(values.LANDMARK_SHEET_ID);assert.equal(writes.length,1);ctx.setupLandmarkDeploy();assert.equal(writes.length,1);
console.log('PASS resource property override and repeatable Layout setup preserve existing configuration.');
