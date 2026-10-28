const {ctx}=require('./storage.cjs'),vm=require('vm');
vm.runInContext(`
const saveNote=(versionId,expected,value,roles=['KP'])=>dispatch_({action:'change',identity:who,input:{operation:'batchCells',versionId,requestId:Utilities.getUuid(),clientId:'notes',edits:[{operation:'setTeacherNote',teacher:'t1',expected,value}]}},{user:{roles},people:c.people});
saveNote(id,'','Free text\\n<em>literal</em>');
if(call('sync',{versionId:id}).current.teacherNotes.t1!=='Free text\\n<em>literal</em>')throw Error('Note lost');
if(call('sync',{versionId:planningId}).current.teacherNotes.t1)throw Error('Note leaked across versions');
let denied=false;try{saveNote(id,'Free text\\n<em>literal</em>','Admin edit',['Admin'])}catch(e){denied=e.status===403}if(denied)throw Error('Q55 Admin was denied planner edits');
let conflict=false;try{saveNote(id,'','stale overwrite')}catch(e){conflict=e.status===409}if(!conflict)throw Error('Stale note replaced');
const noteDoc=call('sync',{versionId:id}).current;
if('teacherNotes' in view_(noteDoc,index_(book_()),{user:{roles:[]}}))throw Error('Ordinary user sees notes');
if(JSON.stringify(activeExport_(noteDoc,index_(book_()))).includes('Free text'))throw Error('Contacts export leaked notes');
const blankNoteVersion=call('change',{operation:'create',name:'Blank notes',requestId:Utilities.getUuid()}).versionId;
if(Object.keys(call('sync',{versionId:blankNoteVersion}).current.teacherNotes).length)throw Error('New plan inherited notes');
console.log('PASS version-specific notes, role visibility, stale conflict, blank new plan, export exclusion');
`,ctx);
const assert=require('assert/strict'),make=require('./dom-helper.cjs');const {dom,w,run}=make();run("tab='Ledger';render()");assert.equal(w.document.querySelector('.note-editor'),null);run("tab='Teachers';render();clearTimeout(queueTimer)");const input=w.document.querySelector('.note-editor');assert.ok(input);input.focus();input.value='Line 1\n<script>literal</script>';input.dispatchEvent(new w.Event('input'));input.blur();run('clearTimeout(queueTimer)');assert.equal(run('queuedEdits()[0].value'),input.value);assert.equal(run('v().teacherNotes.t'),input.value);run("render();clearTimeout(queueTimer)");assert.equal(w.document.querySelector('.note-editor').value,input.value);assert.equal(w.document.querySelector('.note-editor').querySelector('script'),null);run("role='Admin';render()");assert.equal(w.document.querySelector('.note-editor').readOnly,false);run("role='Teacher';render()");assert.equal(w.document.querySelector('.note-editor'),null);dom.window.close();console.log('PASS notes immediate entry, literal multiline text, blur queue, role-controlled editor');
