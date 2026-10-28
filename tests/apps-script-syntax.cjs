// Conservative syntax gate for Apps Script source (not an emulation of Google services).
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
let acorn;try{acorn=require('acorn')}catch{
 const source=process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
 if(!source)throw Error('Install acorn to run the Apps Script syntax gate.');
 const module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports});acorn=module.exports;
}
const parse=source=>acorn.parse(source,{ecmaVersion:2020,sourceType:'script'});
// These operators caused the production-editor failure despite passing Node tests.
for(const operator of ['||=','&&=','??='])assert.throws(()=>parse('let x; x '+operator+' {};'));
const root=path.join(__dirname,'..'),files=[];
function collect(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git'].includes(entry.name))continue;const p=path.join(dir,entry.name);if(entry.isDirectory())collect(p);else if(p.endsWith('.gs'))files.push(p);}}
collect(root);for(const p of files){try{parse(fs.readFileSync(p,'utf8'))}catch(e){throw Error(path.relative(root,p)+': '+e.message)}}
console.log('PASS Apps Script syntax gate: '+files.length+' .gs files parse as ES2020; logical assignment regression rejected');
