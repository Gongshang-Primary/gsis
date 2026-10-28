const {JSDOM}=require(process.env.GSIS_TEST_JSDOM||'jsdom'),fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('layout-update/public/landmark.html','utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);for(const s of scripts)new vm.Script(s);
assert.doesNotMatch(fs.readFileSync('public/landmark.html','utf8'),/function buildCampus/);assert.doesNotMatch(html,/photoView|PHOTO_VIEWS|Photo views/);
const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://example.com/landmark.html'}),w=dom.window,ctx=dom.getInternalVMContext();
w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({measureText:t=>({width:t.length*6})},{get:(o,k)=>o[k]||(()=>{})});
vm.runInContext(scripts[0],ctx);vm.runInContext(scripts[1].replace(/try\{init\(\);\}catch\(error\)\{console.error\(error\);\$\('error'\).hidden=false;\}/,''),ctx);
vm.runInContext('scene=new THREE.Scene();grounds();buildCampus();facadeAccents();photoArchitecture();campusPhotoRevision();finishGlazing();finishBatches();scene.updateMatrixWorld(true);',ctx);
const data=JSON.parse(vm.runInContext(`JSON.stringify({groups:groups.filter(g=>g.userData.block==='K').map(g=>({...g.userData,name:g.name})),glass:glassPanels.filter(p=>/Stairwell K-1233|east stair corridor|Foyer-side lift/.test(p.parent.name)).length})`,ctx));
for(let l=1;l<=6;l++){
 const stair=data.groups.find(g=>g.stairs&&g.stairs[0].x===1233&&g.level===l);assert.equal(stair.stairs[0].facadeColor,0x737983);assert.equal(stair.stairs[0].openSide,true);assert.equal(stair.stairs[0].flights,l<6?2:0);
 const corridor=data.groups.find(g=>g.corridor&&g.level===l);assert.deepEqual(corridor.corridor.footprint,[1233,780,37,34]);assert.equal(corridor.corridor.flights,0);assert.equal(corridor.corridor.glass,false);assert.ok(!corridor.stairs&&!corridor.lift);
 const lift=data.groups.find(g=>g.lift&&g.lift.plan[0]===1251.5&&g.level===l);assert.equal(lift.lift.enclosed,true);assert.equal(lift.lift.glass,false);assert.deepEqual(lift.lift.plan,[1251.5,755,18.5,25]);assert.deepEqual(lift.lift.joins,corridor.corridor.footprint);assert.equal(lift.lift.entrance,'s');assert.ok(!lift.stairs&&!lift.corridor);
 assert.ok(!data.groups.some(g=>g.name===`K foyer-side corridor L${l}`));
}
assert.equal(data.glass,0);
// Exercise navigation after removing the photo selector: these paths formerly dereferenced it.
vm.runInContext("camera=new THREE.PerspectiveCamera();updateView=()=>{};animateTo=()=>{};fit=()=>{};setFloor(2);campus();focusRoom(rooms.find(r=>!r.unlocated));",ctx);
w.close();console.log('PASS complete campus build: six dark open stair bays, six flat corridors, six enclosed lift levels; no photo presets or broken navigation');
