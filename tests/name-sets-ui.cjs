const assert=require('assert/strict'),make=require('./dom-helper.cjs');const {dom,w,run}=make();
(async()=>{
run(`tab='Classes';v().classes[0].ref='existing';render()`);
assert.equal(w.document.querySelector('#classNameSetChoice').value,'new');
const choices=[...w.document.querySelectorAll('[data-class-choice][data-choice-level="1"]')].slice(0,9).map(o=>o.dataset.choiceName+'|'+o.dataset.choiceShort);
assert.deepEqual(choices,['Graciousness|Gc','Gratitude|Gt','Prudence|P','Respect|Rp','Resilience|Rs','Integrity|I','Diligence|D','Empathy|E','Kindness|K']);
assert.ok([...w.document.querySelectorAll('[data-class-choice][data-choice-level="1"]')].find(o=>o.dataset.choiceName==='Perseverance').checked,'Existing class stays selected');
assert.equal(w.document.querySelector('#classNameSetChoice').value,'new');
run('manageClassNameSets()');assert.ok([...w.document.querySelectorAll('#nameSetList button')].every(b=>b.type==='button'));[...w.document.querySelectorAll('#nameSetList button')].find(b=>b.textContent==='Add set').click();w.document.querySelector('#setName').value='Future';const fields=w.document.querySelectorAll('#setPairs input');fields[0].value='Unity';fields[1].value='U';await w.document.querySelector('#ok').onclick();
assert.equal(run('cellQueue[0].operation'),'upsertClassNameSet');assert.equal(run('v().classNameSets.at(-1).name'),'Future');assert.equal(w.document.querySelector('#classNameSetChoice').selectedOptions[0].textContent,'Future');
const field=[...w.document.querySelectorAll('[data-class-choice][data-choice-level="1"]')].find(o=>o.dataset.choiceName==='Unity');field.click();assert.ok(run("v().classes.some(c=>c.shortName==='U')"));assert.equal(run('cellQueue.length'),2);assert.equal(run('cellQueue[1].expected'),null);
run(`editClassNameSet(classNameSets().find(s=>s.name==='Future'))`);w.document.querySelector('#addSetPair').click();const rows=w.document.querySelectorAll('#setPairs tr');rows[1].querySelectorAll('input')[0].value='Union';rows[1].querySelectorAll('input')[1].value='u';await w.document.querySelector('#ok').onclick();assert.match(w.document.querySelector('#formerror').textContent,/unique/);assert.equal(run('cellQueue.length'),2);w.document.querySelector('dialog').close();
run('discardDrafts()');assert.equal(run('v().classes[0].shortName'),'P');assert.equal(run('classNameSets().length'),2);assert.equal(w.document.querySelector('#classNameSetChoice').value,'new');await new Promise(resolve=>setTimeout(resolve,0));dom.window.close();console.log('PASS new default mapping, retained existing class, custom name set draft, auto short name, validation and discard without network');
})().catch(e=>{dom.window.close();console.error(e);process.exitCode=1});
