'use strict';

const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync('contacts-update/public/index.html','utf8');
const app=fs.readFileSync('contacts-update/public/app.js','utf8').replace(/^import[^\n]+\n/,'').replace(/start\(\);\s*$/,'');
const core=fs.readFileSync('contacts-update/public/core.js','utf8').replace(/export /g,'');
const teacher={id:'t1',name:'Teacher One',statutoryName:'Ms Legal Name',mobile:'91234567',emails:{gsps:'teacher@gsps.edu.sg'},active:'Y',groups:[]};

// A cached 0.8.2 page has the old status ID and does not load contact-vcard.js.
// Isolate that observed boundary instead of requiring git history to run tests.
for(const legacyMarkup of [true,false]){
 const errors=[],downloads=[],requests=[],virtualConsole=new VirtualConsole();
 virtualConsole.on('jsdomError',error=>errors.push(error.message));
 const documentHTML=legacyMarkup?html.replace('id="contactVCardStatus"','id="googleContactStatus"'):html;
 const dom=new JSDOM(documentHTML,{url:'https://contacts.example',runScripts:'outside-only',virtualConsole});
 const w=dom.window,run=source=>vm.runInContext(source,dom.getInternalVMContext());
 try{
  w.fetch=async url=>{requests.push(url);throw Error('No request expected');};
  w.URL.createObjectURL=()=>{throw Error('No contact should be prepared without its helper');};
  w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.href);};
  run(core);run(app);w.testTeacher=teacher;
  run("state={user:{email:'qa@gsps.edu.sg',roles:[]},people:[testTeacher],groups:[],access:[],deploymentAvailable:true};token='session';show();");
  const button=w.document.querySelector('[data-contact-vcard="t1"]');
  assert.ok(button,'the directory remains readable even if its export helper is missing');
  button.click();
  assert.deepEqual(errors,[],legacyMarkup?'cached old markup must not throw on export':'failed helper loading must not throw on export');
  const visibleMessages=[...w.document.querySelectorAll('#contactVCardStatus,#googleContactStatus,#toast')].filter(node=>!node.hidden&&!node.classList.contains('hidden')).map(node=>node.textContent).join(' ');
  assert.match(visibleMessages,/reload.*contacts|contacts.*reload/i,'show an actionable current-version recovery message');
  assert.doesNotMatch(visibleMessages,/Cannot read|undefined|replaceChildren/,'do not expose raw JavaScript errors');
  assert.deepEqual(downloads,[]);
  assert.deepEqual(requests,[],'export recovery must not change server state or retry a hidden API call');
  assert.match(w.document.getElementById('contactRows').textContent,/Teacher One/,'contact list is retained during recovery');
 }finally{w.close();}
}
console.log('PASS Contacts mixed-asset recovery: legacy status markup and missing helper show reload guidance without uncaught errors, downloads or requests');
