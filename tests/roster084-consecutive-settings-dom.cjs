'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.example',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.structuredClone=v=>JSON.parse(JSON.stringify(v));w.HTMLElement.prototype.scrollIntoView=()=>{};
 for(const f of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js','roster-update/public/roster-settings-ui.js'])w.eval(fs.readFileSync(f,'utf8'));
 const f=w.__fixture,ctx={profile:f.profile,today:()=>f.ctx.today,container:w.document.getElementById('content'),status(){},api:async(route,p)=>{const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result.data;}};
 const q=s=>w.document.querySelector(s),all=s=>[...w.document.querySelectorAll(s)],input=(el,value)=>{el.value=value;el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input'));},settle=()=>new Promise(r=>setTimeout(r,0)),save=async()=>{q('[data-config-form]').dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();};
 await w.RosterSettingsUI.render('System Config',ctx);
 assert.equal(q('[data-consecutive-subject]').value,'PAL');assert.equal(q('[data-consecutive-periods]').value,'3');assert.match(q('[data-consecutive-rules]').textContent,/same relief teacher/i);
 const before=f.calls.length;input(q('[data-consecutive-periods]'),'2.5');await save();assert.equal(f.calls.length,before);assert.match(q('[data-consecutive-error]').textContent,/whole number/);assert.equal(q('[data-consecutive-periods]').getAttribute('aria-invalid'),'true');
 input(q('[data-consecutive-periods]'),'3');q('[data-add-consecutive-rule]').click();input(all('[data-consecutive-subject]').at(-1),'EL');input(all('[data-consecutive-periods]').at(-1),'2');assert.equal(f.calls.length,before,'editing stays local');await save();assert.equal(q('[data-settings-message]').textContent,'Changes saved.');assert.equal(JSON.stringify(f.state.systemConfig.consecutiveSubjectRules),JSON.stringify([{subject:'PAL',periods:3},{subject:'EL',periods:2}]));
 input(q('[data-consecutive-subject]'),'SCI');q('[data-config-cancel]').click();assert.equal(q('[data-consecutive-subject]').value,'PAL');
 q('[data-remove-consecutive-rule]').click();q('[data-remove-consecutive-rule]').click();await save();assert.equal(f.state.systemConfig.consecutiveSubjectRules.length,0);assert.match(q('[data-consecutive-rules]').textContent,/No subject blocks/);
 q('[data-add-consecutive-rule]').click();input(q('[data-consecutive-subject]'),'<img src=x>');await save();assert.equal(q('[data-consecutive-rules] img'),null);
 w.RosterSettingsUI.unmount();f.ctx.user.admin=false;await w.RosterSettingsUI.render('System Config',ctx);assert.equal(q('[data-add-consecutive-rule]').disabled,true);assert(all('[data-consecutive-subject],[data-consecutive-periods],[data-remove-consecutive-rule]').every(el=>el.disabled));
 dom.window.close();console.log('PASS consecutive System Config defaults, local edits, inline validation, save/cancel, removal, escaping and SMC view only');
})().catch(e=>{console.error(e);process.exitCode=1;});
