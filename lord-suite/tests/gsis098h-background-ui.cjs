const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{const browser=await require('playwright').chromium.launch({headless:true,...(process.env.LORD_TEST_CHROMIUM?{executablePath:process.env.LORD_TEST_CHROMIUM}:{})});try{for(const width of [1200,390]){const page=await browser.newPage({viewport:{width,height:850}});await page.route('https://background.test/**',r=>r.fulfill({contentType:'text/html',body:'<html><body><div id="alertStrip"></div><button id="opener">Background work</button></body></html>'}));await page.goto('https://background.test');await page.addStyleTag({content:fs.readFileSync(path.join(__dirname,'../Source/overlord/assets/styles.css'),'utf8')});await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../Source/overlord/assets/app.js'),'utf8').replace('\nbootOverlord();','\n')});await page.evaluate(()=>{window.commands=[];apiJsonV1=async(url,options={})=>{if(!options.body)return {ok:true,data:{items:[{taskId:'fixture',recipient:'staff@gsps.edu.sg',kind:'whatsapp_alert',bookingId:'BOOK-1',createdAt:'2026-10-27T02:00:00Z',state:'unknown',actions:['retire'],expectedHash:'a'.repeat(64),evidence:'Send outcome unknown',error:'<script>unsafe</script>'}],warning:null,unreadable:0}};let c=JSON.parse(options.body);commands.push(c);return {ok:true,result:{items:[{taskId:'fixture',recipient:'staff@gsps.edu.sg',status:c.action==='backgroundpreview'?'ready':'applied',remainingResume:1}],notice:'Retirement does not confirm delivery.'}};};document.getElementById('opener').onclick=openBackgroundWork;});await page.getByRole('button',{name:'Background work',exact:true}).click();await page.locator('#backgroundView').waitFor();assert.equal(await page.locator('#backgroundView').inputValue(),'attention');await page.getByRole('checkbox').check();await page.locator('#backgroundOperation').selectOption('retire');await page.getByRole('button',{name:'Preview selected'}).click();await page.getByRole('button',{name:'Apply reviewed action'}).waitFor();assert.match(await page.locator('#backgroundPreview').innerText(),/1.*remaining recipient/i);await page.getByRole('button',{name:'Apply reviewed action'}).click();await page.waitForFunction(()=>document.getElementById('backgroundStatus').textContent.includes('applied'));let commands=await page.evaluate(()=>window.commands);assert.equal(commands[0].commandId,commands[1].commandId);assert.equal(commands[0].items[0].expectedHash,commands[1].items[0].expectedHash);assert(await page.locator('#backgroundRows').textContent().then(x=>x.includes('<script>unsafe</script>')));assert.equal(await page.locator('#backgroundRows script').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.getByRole('button',{name:'Close dialog'}).click();assert.equal(await page.locator('#backgroundWorkModal').count(),0);await page.close();}
const page2=await browser.newPage({viewport:{width:1200,height:850}});
await page2.route('https://background.test/**',r=>r.fulfill({contentType:'text/html',body:'<html><body><div id="alertStrip"></div><button id="opener">Background work</button></body></html>'}));
await page2.goto('https://background.test');
await page2.addStyleTag({content:fs.readFileSync(path.join(__dirname,'../Source/overlord/assets/styles.css'),'utf8')});
await page2.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../Source/overlord/assets/app.js'),'utf8').replace('\nbootOverlord();','\n')});
await page2.evaluate(()=>{
  window.commands=[];window.applied=false;
  const items=[
    {taskId:'past',recipient:'past@gsps.edu.sg',kind:'booking_email',bookingId:'PAST-1',createdAt:'2026-10-28T02:00:00Z',state:'unknown',actions:['retire'],expectedHash:'b'.repeat(64),evidence:'Send outcome unknown'},
    {taskId:'future',recipient:'future@gsps.edu.sg',kind:'booking_email',bookingId:'FUTURE-1',createdAt:'2026-10-28T02:00:00Z',state:'unknown',actions:['retire'],expectedHash:'c'.repeat(64),evidence:'Send outcome unknown'},
    {taskId:'undated',recipient:'undated@gsps.edu.sg',kind:'whatsapp_alert',bookingId:'',createdAt:'2026-10-28T02:00:00Z',state:'unknown',actions:['retire'],expectedHash:'d'.repeat(64),evidence:'Send outcome unknown'},
    {taskId:'pastfail',recipient:'fail@gsps.edu.sg',kind:'booking_email',bookingId:'PASTFAIL-1',createdAt:'2026-10-28T02:00:00Z',state:'failed',actions:['retry','cancel'],expectedHash:'e'.repeat(64),evidence:'Send outcome unknown',error:'Confirmed failure'}
  ];
  apiJsonV1=async(url,options={})=>{
    if(!options.body){
      if(String(url).includes('bookingGet')){
        if(String(url).includes('PAST-1'))return {ok:true,booking:{bookingId:'PAST-1',date:'2020-01-01'}};
        if(String(url).includes('FUTURE-1'))return {ok:true,booking:{bookingId:'FUTURE-1',date:'2099-01-01'}};
        if(String(url).includes('PASTFAIL-1'))return {ok:true,booking:{bookingId:'PASTFAIL-1',date:'2020-01-01'}};
        return {ok:false,error:'Booking not found.'};
      }
      if(window.applied){
        const reviewed=items.map(x=>x.taskId==='past'?{...x,state:'reviewed',actions:[],reviewedAt:'2026-11-03T00:00:00Z',reviewAction:'retire'}:x);
        return {ok:true,data:{items:reviewed,warning:null,unreadable:0}};
      }
      return {ok:true,data:{items,warning:null,unreadable:0}};
    }
    let c=JSON.parse(options.body);window.commands.push(c);
    if(c.action==='backgroundapply')window.applied=true;
    return {ok:true,result:{items:c.items.map(i=>({taskId:i.taskId,recipient:i.recipient,status:c.action==='backgroundpreview'?'ready':'applied',remainingResume:0})),notice:'Retirement does not confirm delivery.'}};
  };
  document.getElementById('opener').onclick=openBackgroundWork;
});
await page2.getByRole('button',{name:'Background work',exact:true}).click();
await page2.locator('#backgroundView').waitFor();
await page2.getByRole('button',{name:'Select past bookings',exact:true}).click();
await page2.waitForFunction(()=>document.getElementById('backgroundStatus').textContent.includes('1 past booking selected.'));
assert.equal(await page2.locator('[data-background-index]').nth(0).isChecked(),true);
assert.equal(await page2.locator('[data-background-index]').nth(1).isChecked(),false);
assert.equal(await page2.locator('[data-background-index]').nth(2).isChecked(),false);
assert.equal(await page2.locator('[data-background-index]').nth(3).isChecked(),false);
assert.match(await page2.locator('#backgroundPreview').innerText(),/Mark 1 past-booking item as reviewed\? This sends nothing\./);
assert.match(await page2.locator('#backgroundPreview').innerText(),/Confirmed failure: 1 past item shown separately/);
assert.equal(await page2.locator('#backgroundOperation').inputValue(),'retire');
assert.deepEqual(await page2.evaluate(()=>window.commands),[]);
await page2.getByRole('button',{name:'Preview selected'}).click();
await page2.getByRole('button',{name:'Apply reviewed action'}).waitFor();
await page2.getByRole('button',{name:'Apply reviewed action'}).click();
await page2.waitForFunction(()=>document.getElementById('backgroundStatus').textContent.includes('applied'));
let pastCommands=await page2.evaluate(()=>window.commands);
assert.equal(pastCommands.length,2);
assert.equal(pastCommands[0].operation,'retire');
assert.equal(pastCommands[1].operation,'retire');
assert.equal(pastCommands[0].commandId,pastCommands[1].commandId);
assert.equal(pastCommands[0].items.length,1);
assert.equal(pastCommands[0].items[0].taskId,'past');
assert.match(await page2.locator('#backgroundRows').innerText(),/Reviewed/);
assert.match(await page2.locator('#backgroundRows').textContent(),/Send outcome unknown/);
await page2.getByRole('button',{name:'Close dialog'}).click();
assert.equal(await page2.locator('#backgroundWorkModal').count(),0);
await page2.close();
console.log('PASS background manager desktop/mobile preview, escaping, stable apply, dialog close, past-booking selection');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
