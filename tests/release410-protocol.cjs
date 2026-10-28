const assert=require('assert/strict'),make=require('./dom-helper.cjs');
const release=require('../package.json'),{w,run}=make(),protocol=release.gsisWriteProtocol||Number(release.gsisRelease.replaceAll('.',''));
(async()=>{try{
 run(`snapshotCache={revision:7};var protocolCalls=[],deltaApplied=0,fullReads=0;api=async(action,input)=>{protocolCalls.push(action);return {saved:true,protocol:${protocol},delta:{revision:8,changes:[]}}};applyFieldDelta=delta=>{assertDelta=delta;deltaApplied++};refresh=async()=>{fullReads++};`);
 await run("acquire('meta')");await run("change('rename',{name:'Updated'})");
 assert.deepEqual(Array.from(run('protocolCalls')),['change']);assert.equal(run('deltaApplied'),1);assert.equal(run('fullReads'),0);assert.equal(run('editing'),null);
 console.log('PASS current-release write acknowledgement applies its delta without a redundant full snapshot read.');
}finally{w.close()}})().catch(e=>{console.error(e);process.exitCode=1});
