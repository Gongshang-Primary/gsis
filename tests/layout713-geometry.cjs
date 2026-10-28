'use strict';
const assert=require('node:assert/strict'),{load}=require('./model403-helper.js');
const baseline=require('./fixtures/layout-v0.7.12-geometry.json');
// layout714-geometry isolates the later approved B rain-shelter extension.
const changedMeshes=new Set(['A:2:Hall L2 inset east corridor','B:2:B L2 rain cover and open corridor','B:2:B L2 non-walkable rain cover']);
const translated=new Set(['A:1:Relocated flagpole platform','A:1:Exposed straight court stair','A:2:Court stair landing']);
let model;
try{
 model=load('.');
 assert.deepEqual(Object.keys(model.hashes),Object.keys(baseline.hashes),'No structures added or removed');
 for(const [key,hash] of Object.entries(baseline.hashes)){
  if(changedMeshes.has(key))assert.notEqual(model.hashes[key],hash,key+' changes its floor or guard');
  else assert.equal(model.hashes[key],hash,key+' geometry remains unchanged, including every K structure');
 }
 const state=model.run(`(()=>{
  const hall=groups.find(g=>g.name==='Hall L2 inset east corridor'),k=groups.find(g=>g.name==='K Hall-side lift lobby L2');
  const instances=(g,colour)=>g.children.filter(m=>m.isInstancedMesh).flatMap(mesh=>Array.from({length:mesh.count},(_,i)=>{
   const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),size=new THREE.Vector3(),rotation=new THREE.Quaternion(),c=new THREE.Color();mesh.getMatrixAt(i,matrix);matrix.decompose(pos,rotation,size);pos.applyMatrix4(mesh.matrixWorld);
   c.copy(mesh.material.color);if(mesh.instanceColor){const instanceColour=new THREE.Color();mesh.getColorAt(i,instanceColour);c.multiply(instanceColour);}return {x:pos.x,y:pos.y,z:pos.z,w:size.x,h:size.y,d:size.z,colour:c.getHex()};
  })).filter(it=>it.colour===colour);
  const wall=instances(k,0x999e9f).filter(it=>it.w<.2&&it.d>1).sort((a,b)=>a.x-b.x)[0];
  const railItems=instances(hall,0x59636a).filter(it=>it.d>1);
  const ray=(x,z,from=50,to=-1,objects=scene.children)=>{
   const caster=new THREE.Raycaster(pt(x,z,from),new THREE.Vector3(0,-1,0),0,from-to),hit=caster.intersectObjects(objects,true)[0];
   if(!hit)return null;const colour=hit.object.material.color.clone();if(hit.object.isInstancedMesh&&hit.object.instanceColor){const c=new THREE.Color();hit.object.getColorAt(hit.instanceId,c);colour.multiply(c);}
   return {height:hit.point.y,colour:colour.getHex(),ground:hit.object.parent===groundGroup};
  };
  return {connection:hall.userData.connection,wallCentre:wall.x,wallWidth:wall.w,railItems,transforms:Object.fromEntries(groups.map(g=>[g.userData.key,g.matrixWorld.toArray()])),rooms:rooms.map(({id,name,block,level})=>({id,name,block,level})),
   exposed:[635,650,660].map(z=>ray(845,z)),covered:[680,710,900,990].map(z=>ray(845,z)),
   narrowStrip:[655,690,730].map(z=>ray(845,z,1,-1,[groundGroup])),adjacentGround:ray(845,748,1,-1,[groundGroup]),
   lawn:[880,910,935].flatMap(x=>[660,690,730].map(z=>ray(x,z))),
   newFloor:[650,680,710,900,990].map(z=>ray(845,z,4,3))};
 })()`);
 assert.deepEqual(state.rooms,baseline.roomIdentities,'All room identities and labels remain intact');
 assert.equal(state.connection.eastShift,25,'Displacement comes from the existing reflected K wall alignment');
 for(const [key,before] of Object.entries(baseline.transforms)){
  const after=state.transforms[key],expected=before.slice();
  if(translated.has(key))expected[12]+=25/7.45;
  after.forEach((v,i)=>assert(Math.abs(v-expected[i])<1e-10,key+' only receives its permitted translation'));
 }
 for(const rail of state.railItems){
  assert(Math.abs(rail.x-state.wallCentre)<1e-5,'Railing follows one straight K wall alignment');
  assert(rail.x+rail.w/2>=state.wallCentre-state.wallWidth/2,'The railing meets K without an air gap');
 }
 assert.equal(state.railItems.length,2,'One straight edge interrupted only by the retained stair entrance');
 for(const hit of state.exposed)assert(Math.abs(hit.height-3.78)<.001,'Blue approach remains open to sky at L2');
 for(const hit of state.covered)assert(Math.abs(hit.height-6.93)<.001,'Red walkway cover retains its elevation over the extension');
 for(const hit of state.newFloor)assert(Math.abs(hit.height-3.78)<.001,'All extended walkway surfaces have continuous L2 floor');
 for(const hit of state.narrowStrip){assert.equal(hit.colour,state.adjacentGround.colour,'Marked strip matches adjoining ground floor finish');assert.equal(hit.height,state.adjacentGround.height,'Marked strip matches adjoining floor elevation');}
 for(const hit of state.lawn){assert.equal(hit.ground,true);assert.equal(hit.colour,0x87a968);assert(Math.abs(hit.height+.08)<.001,'Larger courtyard lawn remains open to sky');}
 console.log('PASS A east geometry: unchanged K and L1 rooms; same +25 translation for flags/stairs; straight railing meets K; exposed/covered floor rays; narrow paving strip and retained lawn.');
}finally{model?.dom.window.close();}
