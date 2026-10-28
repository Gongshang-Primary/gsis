'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{load}=require('./model403-helper.js');
// Captured from the released model, so the source archive needs no Git checkout.
const baseline=require('./fixtures/layout-v0.7.11-geometry.json');
let after;
try{
 after=load('.');
 const removed='A:2:L2 roof between Hall B and K';
 assert(baseline.geometry[removed],'released model contained the mistaken roof');
 assert.equal(after.hashes[removed],undefined,'roof assembly, beams, posts and its rails are removed together');
 const retained={...baseline.geometry};delete retained[removed];
 // layout713/714-geometry isolate the approved A edge and B shelter changes,
 // including exact comparisons of K and every other unchanged structure.
 for(const key of ['A:2:Hall L2 inset east corridor','B:2:B L2 rain cover and open corridor','B:2:B L2 non-walkable rain cover']){delete retained[key];delete after.hashes[key];}
 assert.deepEqual(after.hashes,retained,'every retained structure, including Block K, rain shelters and L2 bridge rails, is byte-equivalent in geometry');
 const rooms=after.run('rooms.map(v=>({id:v.id,name:v.name,block:v.block,level:v.level}))');
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(rooms)).digest('hex'),baseline.roomIdentitySha256,'all room identities and labels remain intact');
 const samples=after.run(`(()=>{const ray=new THREE.Raycaster(),rows=[];for(const x of [880,900,910,935])for(const z of [660,690,730]){const [wx,wz]=coord(x,z);ray.set(new THREE.Vector3(wx,50,wz),new THREE.Vector3(0,-1,0));const hit=ray.intersectObjects(scene.children,true)[0];const color=hit.object.material.color.clone();if(hit.object.isInstancedMesh&&hit.object.instanceColor){const instanceColor=new THREE.Color();hit.object.getColorAt(hit.instanceId,instanceColor);color.multiply(instanceColor);}rows.push({x,z,y:hit.point.y,ground:hit.object.parent===groundGroup,color:color.getHex()});}return rows;})()`);
 for(const sample of samples){assert.equal(sample.ground,true,JSON.stringify(sample));assert.equal(sample.color,0x87a968,JSON.stringify(sample));assert(Math.abs(sample.y+.08)<.001,'open sky reaches the continuous L1 lawn');}
 assert(baseline.courtyardObstructionHeight>3,'released baseline records the overhead obstruction');
 console.log('PASS courtyard correction: 12 sky-to-lawn rays; old obstruction detected; every retained structural mesh and room identity unchanged.');
}finally{after?.dom.window.close();}
