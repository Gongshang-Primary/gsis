const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'Source/starlord/assets/app.js'),'utf8');
function extract(name) {
  const start=src.indexOf('  function '+name+'(');assert(start>=0);
  let end=src.indexOf('\n  function ',start+1);if(end<0)end=src.lastIndexOf('})();');
  return src.slice(start,end);
}
const ctx=vm.createContext({elements:{activeGrid:{},pastStrip:{}},escapeHtml:v=>String(v??'').replace(/[&<>"']/g,'_')});
vm.runInContext(['resolveDeviceImage','renderActiveGrid','renderPastStrip'].map(extract).join('\n'),ctx);
const results=[];
function test(name,fn){try{fn();results.push({name,ok:true})}catch(e){results.push({name,ok:false,error:e.message})}}
for(const type of ['MacBook Neo','MacBook Air','MacBook Pro','MAC BOOK NEO','Mac-Book Air'])test(type+' uses supplied MacBook image',()=>assert.equal(ctx.resolveDeviceImage(type),'assets/device-mbn.webp'));
for(const type of ['HP Windows','Laptop','Notebook'])test(type+' uses existing laptop image',()=>assert.equal(ctx.resolveDeviceImage(type),'assets/device-laptop.jpg'));
test('iPad artwork retained',()=>assert.equal(ctx.resolveDeviceImage('iPad 9Gen'),'assets/device-ipad.webp'));
test('Android artwork retained',()=>assert.equal(ctx.resolveDeviceImage('Tab S9'),'assets/device-android.webp'));
const row={displayState:'upcoming',teacherStatutoryName:'Test Staff',deviceType:'MacBook Neo',deviceImage:ctx.resolveDeviceImage('MacBook Neo'),classOrActivity:'5A',resource:'Cart B',subject:'SCI',requestedQuantity:41,startTime:'09:00',endTime:'10:00'};
test('Active card renderer includes MacBook image, inventory label and quantity 41',()=>{ctx.renderActiveGrid([row]);const html=ctx.elements.activeGrid.innerHTML;assert(html.includes('src="assets/device-mbn.webp"'));assert(html.includes('MacBook Neo'));assert(html.includes('41'));});
test('Past-strip renderer uses the same image',()=>{ctx.renderPastStrip([row]);assert(ctx.elements.pastStrip.innerHTML.includes('src="assets/device-mbn.webp"'));});
test('Bundled image matches supplied attachment bytes',()=>{
  const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'Source/starlord/assets/device-mbn.webp'))).digest('hex');
  const expected=fs.readFileSync(path.join(__dirname,'fixtures/device-mbn.sha256'),'utf8').trim();assert.equal(actual,expected);
});
const failed=results.filter(r=>!r.ok);const report={passed:results.length-failed.length,failed:failed.length,total:results.length,tests:results};
fs.writeFileSync(path.join(__dirname,'image_results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed,total:report.total}));for(const r of failed)console.error(r);process.exitCode=failed.length?1:0;
