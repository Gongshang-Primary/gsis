/* Direct booking inputs exercise the shipped shared field and backend contract. */
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {JSDOM}=require('jsdom');
const {fixture}=require('./run_gsis_bridge_checks.cjs');
const {request,adminRequest,plain}=require('./backend_harness.cjs');
const reference={referenceSource:{enabled:true,key:'A'},referenceCatalog:{classes:[{id:'c1',name:'5A'}],teachingGroups:[{id:'g1',name:'5A'}],activities:[],subjects:[{id:'s1',name:'Science'}]}};
const dom=new JSDOM('<main></main>',{runScripts:'outside-only'}),w=dom.window;
w.eval(fs.readFileSync(path.join(__dirname,'../Source/lord/assets/reference.js'),'utf8'));
const api=w.LordReference;
function mount(type,config={}){w.document.querySelector('main').innerHTML=api.field('entry','Booking field',reference,type,config);const input=w.document.getElementById('entry');assert.equal(input.tagName,'INPUT','custom text is entered directly into the main field');api.bindField('entry',type);return input;}
function type(input,value){input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));}
function payload(type){const value=api.read('entry');return plain(api.payload(reference,{[type]:value.value},null,{[type]:value.custom}));}
let input=mount('class');
assert.equal(input.tagName,'INPUT','custom text is entered directly into the main field');
assert.equal(input.getAttribute('role'),'combobox');assert(!w.document.querySelector('#entryCustomValue'));
type(input,'5A');assert.deepEqual(payload('class').classRef,{kind:'customActivity',name:'5A'},'typing a listed label never infers its ID');
assert.equal(w.document.querySelectorAll('[role=option]:not([hidden])').length,2,'equal labels retain distinct choices');
input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
assert.deepEqual(payload('class').classRef,{kind:'class',id:'c1'});assert.equal(input.getAttribute('aria-expanded'),'false');
input.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(input.getAttribute('aria-expanded'),'true','a second tap reopens suggestions without changing focus');
type(input,'5A');assert.deepEqual(payload('class').classRef,{kind:'customActivity',name:'5A'},'editing a chosen value returns to explicit custom text');
input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(input.value,'5A');assert.equal(input.getAttribute('aria-expanded'),'false');
input=mount('class',{value:'customActivity:',custom:'Art <club> & friends'});assert.equal(input.value,'Art <club> & friends');assert(!w.document.querySelector('club'));assert.equal(payload('class').classRef.name,'Art <club> & friends');
input=mount('subject');type(input,' Science ');assert.deepEqual(payload('subject').subjectRef,{kind:'customPurpose',name:'Science'});assert(!payload('subject').subjectId);
type(input,'');assert.throws(()=>payload('subject'),/Enter/);type(input,'x'.repeat(121));assert.throws(()=>payload('subject'),/120/);
input=mount('class',{saved:'Retired class'});assert.equal(input.value,'Retired class');assert.equal(api.read('entry').value,'');
assert.deepEqual(plain(api.payload(reference,{class:api.read('entry').value},{classOrActivity:'Retired class'})),{referenceKey:'A',classOrActivity:'Retired class'});
input=mount('class',{value:'class:retired-id',text:'Retired class'});assert.equal(input.value,'Retired class');assert.throws(()=>payload('class'),/current/,'retired identities cannot become custom implicitly');
const h=fixture();h.enable();const snapshot=h.ctx.gsisSnapshot_(),emails=[];h.ctx.MailApp.sendEmail=message=>emails.push(plain(message));
const base=request({referenceKey:snapshot.key,classRef:{kind:'customActivity',name:'5A'},subjectRef:{kind:'customPurpose',name:'SCI'}});
let result=h.post(base);assert.equal(result.ok,true,result.error);
assert.equal(h.sheets.Bookings.data[1][4],'5A');assert.equal(h.sheets.Bookings.data[1][5],'SCI');
const bindings=h.sheets['Event Log'].data.filter(row=>row[2]==='GSIS_REFERENCE_BOUND').map(row=>JSON.parse(row[5]));
assert.deepEqual(bindings[0].classRef,{kind:'customActivity',name:'5A'});assert.deepEqual(bindings[0].subjectRef,{kind:'customPurpose',name:'SCI'});assert(!bindings[0].subjectId);
assert.equal(h.post(base).ok,true);assert.equal(h.sheets.Bookings.data.length,2,'same custom request retries once');
h.ctx.processSecondaryQueue_();assert.deepEqual(emails.map(message=>message.to).sort(),['staff@gsps.edu.sg','staff@schools.gov.sg'],'each address is sent once with an independent durable checkpoint');assert(emails[0].body.includes('Class or student group: 5A\nSubject: SCI'));
const original=h.ctx.bookingPublic_(h.sheets.Bookings.data[1]);assert.equal(original.classOrActivity,'5A');assert.equal(original.subject,'SCI');
const edit=adminRequest({action:'bookingUpdate',clientRequestId:'custom-edit',bookingId:original.bookingId,teacher:original.teacher,referenceKey:snapshot.key,classRef:{kind:'customActivity',name:'=Art <club>'},subjectRef:{kind:'customPurpose',name:'Projects & making'}});
result=h.post(edit);assert.equal(result.ok,true,result.error);const edited=h.ctx.bookingPublic_(h.sheets.Bookings.data[1]);assert.equal(edited.classOrActivity,'=Art <club>');assert.equal(edited.subject,'Projects & making');
assert(h.batches.some(batch=>JSON.stringify(batch).includes('"stringValue":"=Art <club>"')),'formula-shaped custom text is stored literally');
assert.equal(h.post(edit).ok,true);assert.equal(h.sheets.Bookings.data.length,2);
const lastBinding=h.sheets['Event Log'].data.filter(row=>row[2]==='GSIS_REFERENCE_BOUND').at(-1);assert.equal(JSON.parse(lastBinding[5]).classRef.name,'=Art <club>');
assert.equal(h.ctx.gsisSnapshot_().deploy.classes.length,1,'custom booking never mutates source catalogue');
assert.throws(()=>h.ctx.gsisCustomLabel_('bad\nlabel',160),/short/);
console.log('PASS direct booking entry: typed identity, keyboard selection, historical values, escaping, validation and backend retry');
