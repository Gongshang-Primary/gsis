const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('contacts-update/public/index.html','utf8'),{url:'https://contacts.example',runScripts:'outside-only'}),w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext());
w.structuredClone=structuredClone;w.AbortController=AbortController;w.confirm=()=>true;
const timeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>timeout(fn,[1000,2500].includes(ms)?0:ms);
run(fs.readFileSync('contacts-update/public/core.js','utf8').replace(/export /g,''));run(fs.readFileSync('contacts-update/public/app.js','utf8').replace(/^import[^\n]+\n/,'').replace(/start\(\);\s*$/,''));
run(`state={user:{email:'admin@gsps.edu.sg',roles:['Admin']},people:[],groups:[],access:[]};token='session';
contactData={editable:true,fields:['TTb Name','Basic Name','Active','EO Appt Level'],lists:{Active:['Y','N']},rows:[{id:'s1',values:['Old','Old','Y',''],computed:[true,false,false,true]}]};renderData();`);
const el=id=>w.document.getElementById(id),input=()=>w.document.querySelector('[aria-label="Basic Name"]');
function edit(name){input().value=name;input().dispatchEvent(new w.Event('input'));}
const calls=[];let mode='uncertain',polls=0;
w.testAPI=async(path,body)=>{calls.push({path,body:structuredClone(body)});
 if(path==='save-data'){if(mode==='validation')throw Object.assign(Error('Invalid value'),{draftEditable:true,status:400});if(mode!=='saved')throw Object.assign(Error('Connection interrupted'),{status:503});return {saved:true,changed:[{id:'s1',values:['New','New','Y','']}]};}
 if(path==='save-receipt'){polls++;return {saved:mode==='late'&&polls>=2,pending:true};}
 if(path==='data'){if(mode==='display-failure')throw Error('Read failed');return {editable:true,fields:['TTb Name','Basic Name','Active','EO Appt Level'],lists:{Active:['Y','N']},rows:[{id:'s1',values:['Later','Later','Y',''],computed:[true,false,false,true]}]};}
 throw Error('Unexpected '+path);
};run('api=testAPI');
(async()=>{
 edit('New');await el('saveData').onclick();assert.equal(polls,3);const attempt=run('dataRequest');assert.ok(attempt.requestId);assert.equal(input().readOnly,true);assert.equal(run('dataSaving'),false);
 edit('Changed after uncertainty');assert.equal(run("dataEdits.get('s1|1').value"),'New');assert.equal(run('dataRequest.payload'),attempt.payload);
 assert.equal(el('reloadData').disabled,true);el('reloadData').onclick();assert.equal(run('dataRequest.requestId'),attempt.requestId);
 await run('signout()');assert.equal(run('token'),'session');assert.equal(run('dataRequest.requestId'),attempt.requestId);
 mode='saved';await el('saveData').onclick();const writes=calls.filter(c=>c.path==='save-data');assert.deepEqual(writes[1].body,writes[0].body);assert.equal(run('dataRequest'),null);assert.equal(input().readOnly,false);assert.equal(input().value,'New');assert.equal(el('dataStatus').textContent,'Saved');
 edit('Invalid');mode='validation';const before=calls.length;await el('saveData').onclick();assert.equal(calls.length,before+1);assert.equal(input().readOnly,false);assert.equal(run('dataRequest'),null);assert.equal(run('dataEdits.size'),1);
 mode='late';polls=0;const beforeWrites=calls.filter(c=>c.path==='save-data').length;await el('saveData').onclick();assert.equal(polls,2);assert.equal(calls.filter(c=>c.path==='save-data').length,beforeWrites+1);assert.equal(input().value,'Later');assert.equal(input().readOnly,false);assert.equal(run('dataEdits.size'),0);
 // An Applied receipt stays confirmed if refreshing the display fails.
 mode='display-failure';w.testAPI=async(path)=>path==='save-data'?{saved:true}:Promise.reject(Error('Read failed'));run('api=testAPI');edit('Last');await el('saveData').onclick();assert.match(el('dataStatus').textContent,/save is confirmed/);assert.equal(run('dataRequest'),null);assert.equal(run('dataSaving'),false);assert.equal(input().readOnly,true);assert.equal(el('reloadData').disabled,false);
 console.log('PASS Contacts immutable same-ID retries, locked uncertain drafts, bounded receipt polling, late confirmation without replay, validation correction, editable confirmed saves and display-failure recovery.');dom.window.close();
})().catch(e=>{dom.window.close();console.error(e);process.exitCode=1});
