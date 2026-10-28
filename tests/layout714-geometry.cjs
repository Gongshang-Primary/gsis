'use strict';
const assert=require('node:assert/strict'),{load}=require('./model403-helper.js');
const baseline=require('./fixtures/layout-v0.7.13-geometry.json');
const changed=new Set(['B:2:B L2 rain cover and open corridor','B:2:B L2 non-walkable rain cover']);
let model;
try{
 model=load('.');
 assert.deepEqual(Object.keys(model.hashes),Object.keys(baseline.hashes),'No structures added or removed');
 for(const [key,hash] of Object.entries(baseline.hashes)){
  if(changed.has(key))assert.notEqual(model.hashes[key],hash,key+' changes only for the marked shelter extension');
  else assert.equal(model.hashes[key],hash,key+' stays unchanged, including all A and K structures');
 }
 const state=model.run(`(()=>{
  const corridor=scene.getObjectByName('B L2 rain cover and open corridor'),cover=scene.getObjectByName('B L2 non-walkable rain cover');
  const hit=(a,b,objects=scene.children)=>{const A=pt(...a),B=pt(...b),ray=new THREE.Raycaster(A,B.clone().sub(A).normalize(),0,A.distanceTo(B));return ray.intersectObjects(objects,true)[0]||null;};
  const roof=(x,z)=>{const h=hit([x,z,4],[x,z,3.3]);return h?{height:h.point.y,colour:h.object.material.color.getHex(),group:h.object.parent.name}:null;};
  return {connection:corridor.userData.connection,cover:cover.userData.rainCover,
   blue:[865,895,920].flatMap(x=>[622,635,641].map(z=>roof(x,z))),yellow:[935,980,1025].flatMap(x=>[622,635,641].map(z=>roof(x,z))),seam:roof(927,630),
   removedRail:[621,632.75,640].map(z=>!!hit([922,z,4.88],[932,z,4.88])),retainedGuard:!!hit([850,630,4.88],[859,630,4.88]),
   approach:[840,850].map(x=>roof(x,630)),threshold:roof(1044,630),eastFloor:roof(1080,630),
   transforms:Object.fromEntries(groups.map(g=>[g.userData.key,g.matrixWorld.toArray()])),rooms:rooms.map(({id,name,block,level})=>({id,name,block,level}))};
 })()`);
 assert.deepEqual(state.transforms,baseline.transforms,'No structure is translated or rotated');
 assert.deepEqual(state.rooms,baseline.roomIdentities,'All room identities and labels are retained');
 assert.deepEqual(state.cover,{footprint:[854,617,202,27],walkable:false});
 assert.deepEqual(state.connection.rainCover,state.cover.footprint);
 assert.deepEqual(state.connection.floors,[[686,617,168,27],[1056,617,177,27]]);
 for(const h of [...state.blue,...state.yellow,state.seam]){
  assert(h,'Continuous shelter covers the sampled bay');
  assert(Math.abs(h.height-3.58)<.00001,'Blue and yellow share the same roof height without the old walkway slab above');
  assert.equal(h.colour,0xc6cdcc,'The extension matches the adjacent rain shelter finish');
  assert.equal(h.group,'B L2 non-walkable rain cover');
 }
 assert(state.removedRail.every(v=>!v),'The crossed transverse rail is removed along its span');
 assert(state.retainedGuard,'The A-side walkway end guard remains');
 for(const h of [...state.approach,state.threshold,state.eastFloor])assert(Math.abs(h.height-3.78)<.00001,'The A approach, B doorway threshold and eastern corridor retain their walkable floor');
 console.log('PASS layout714: marked B L2 bay becomes continuous matching rain shelter; crossed rail absent; A/K geometry, guards, doorway threshold and room identities retained.');
}finally{model?.dom.window.close();}
