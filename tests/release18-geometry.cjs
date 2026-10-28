const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{JSDOM}=require(process.env.GSIS_TEST_JSDOM||'jsdom');
const html=fs.readFileSync('layout-update/public/landmark.html','utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),dom=new JSDOM(html,{runScripts:'outside-only'}),ctx=dom.getInternalVMContext();dom.window.HTMLCanvasElement.prototype.getContext=()=>new Proxy({measureText:t=>({width:t.length*6})},{get:(o,k)=>o[k]||(()=>{})});vm.runInContext(scripts[0],ctx);vm.runInContext(scripts[1].replace(/try\{init\(\);\}catch\(error\)\{console.error\(error\);\$\('error'\).hidden=false;\}/,''),ctx);
vm.runInContext('scene=new THREE.Scene();buildCampus();facadeAccents();photoArchitecture();campusPhotoRevision();finishGlazing();finishBatches();scene.updateMatrixWorld(true);',ctx);
const data=JSON.parse(vm.runInContext(`JSON.stringify((()=>{
 const hit=(a,b)=>{const A=pt(...a),B=pt(...b),ray=new THREE.Raycaster(A,B.clone().sub(A).normalize(),0,A.distanceTo(B));return ray.intersectObjects(scene.children,true).length>0;};
 const floor=(x,z,y)=>hit([x,z,y+.7],[x,z,y-.1]);
 const path=(points,y)=>({blocked:points.slice(1).some((p,i)=>hit([...points[i],y+1.5],[...p,y+1.5])),floor:points.slice(1).every((p,i)=>Array.from({length:21},(_,j)=>{const a=points[i],t=j/20;return floor(a[0]+(p[0]-a[0])*t,a[1]+(p[1]-a[1])*t,y)}).every(Boolean))});
 const upper=rooms.filter(r=>r.block==='K'&&r.level>=3&&!r.supplement);
 return {upper:upper.map(r=>({id:r.id,doors:r.doorOpenings,sides:r.openPartitionSides,pickable:pickables.some(p=>p.userData.room===r),panels:r.wallPanels})),
  partitions:[3,4,5,6].map(l=>({level:l,blocked:[978,1029,1080,1131,...(l===3?[]:[1182])].some(x=>hit([x-2,820,(l-1)*3.6+1.5],[x+2,820,(l-1)*3.6+1.5]))})),
  gateBlocked:hit([1266,615,8.8],[1278,615,8.8]),gateFloor:floor(1266,615,7.2)&&floor(1278,615,7.2),
  noL2Link:!floor(1250,611,3.6),skyOpen:!hit([1242,535,11.2],[1242,535,10.6]),
  l2Opening:!hit([1230,599,5.5],[1235,599,5.5]),l2Guard:hit([1230,599,4.88],[1235,599,4.88]),
  liftRoutes:[1,2,3].map(l=>({level:l,...path(l===3?[[1260.75,781],[1260.75,792],[1242.25,792],[1242.25,732]]:[[1242.25,740],[1242.25,792],[1225,792]],(l-1)*3.6)})),
  corridor:path([[1044,610],[1044,630],[1227,630],[1227,638],[1250,638],[1250,750],[1242,750],[1242,792],[1225,792]],3.6),
  endGuard:hit([1250,612,4.2],[1250,621,4.2]),
  hall:[1,2,3,4,5,6].map(l=>({left:hit([875,820,(l-1)*3.6+1.5],[883,820,(l-1)*3.6+1.5]),right:hit([918,820,(l-1)*3.6+1.5],[929,820,(l-1)*3.6+1.5]),doorBlocked:hit([925,794,(l-1)*3.6+1.5],[930,794,(l-1)*3.6+1.5])}))};
})())`,ctx));
assert.equal(data.upper.length,23);assert.ok(data.upper.every(r=>r.pickable));assert.ok(data.partitions.every(x=>!x.blocked),'Internal classroom partitions open on L3–L6');for(const l of [3,4,5,6])assert.equal(data.upper.filter(r=>Number(r.id[1])===l).flatMap(r=>r.doors).length,2,'Two end doors per level');
assert.equal(data.gateBlocked,false,'Gate opens directly to playground');assert.equal(data.gateFloor,true);assert.equal(data.noL2Link,true);assert.equal(data.skyOpen,true);assert.equal(data.l2Opening,true);assert.equal(data.l2Guard,true);
for(const r of data.liftRoutes){assert.equal(r.blocked,false,'Lift path clear L'+r.level);assert.equal(r.floor,true,'Lift path has floor L'+r.level)}
assert.equal(data.corridor.blocked,false,'B–K corridor continuous and unobstructed');assert.equal(data.corridor.floor,true,'B–K corridor floor continuous');assert.equal(data.endGuard,true,'L2 end closed beside separate stair');for(const h of data.hall){assert.equal(h.left,true);assert.equal(h.right,true)}assert.ok(data.hall.slice(2).every(h=>!h.doorBlocked),'Upper west doors open to retained core approach');
dom.window.close();console.log('PASS full-scene mesh rays: open partitions and end doors; gate floor/opening; sky hole; L2 landing guard/isolation; clear lift routes and B–K floor continuity; hall-side infill');
