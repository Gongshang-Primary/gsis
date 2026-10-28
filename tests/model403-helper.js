const fs=require('fs'),vm=require('vm'),path=require('path'),crypto=require('crypto'),{JSDOM}=require(process.env.GSIS_TEST_JSDOM||'jsdom');
function load(root){
 const html=fs.readFileSync(path.join(root,'layout-update/public/landmark.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
 const dom=new JSDOM(html,{runScripts:'outside-only'}),ctx=dom.getInternalVMContext();
 dom.window.HTMLCanvasElement.prototype.getContext=()=>new Proxy({measureText:t=>({width:t.length*6})},{get:(o,k)=>o[k]||(()=>{})});
 vm.runInContext(scripts[0],ctx);vm.runInContext(scripts[1].replace(/try\{init\(\);\}catch\(error\)\{console.error\(error\);\$\('error'\).hidden=false;\}/,''),ctx);
 vm.runInContext('scene=new THREE.Scene();grounds();buildCampus();facadeAccents();photoArchitecture();campusPhotoRevision();finishGlazing();',ctx);
 const raw=JSON.parse(vm.runInContext(`JSON.stringify(groups.map(g=>({key:g.userData.key,boxes:[...batch.values()].filter(b=>b.parent===g).map(b=>({color:b.color,role:b.role,items:b.items})),meshes:g.children.filter(m=>m.geometry).map(m=>({type:m.type,position:m.position.toArray(),scale:m.scale.toArray(),rotation:m.rotation.toArray(),vertices:Array.from(m.geometry.attributes.position.array),index:m.geometry.index?Array.from(m.geometry.index.array):null,color:m.material?.color?.getHex(),role:m.userData.role}))})))`,ctx));
 const hashes=Object.fromEntries(raw.map(g=>[g.key,crypto.createHash('sha256').update(JSON.stringify(g)).digest('hex')]));
 vm.runInContext('finishBatches();scene.updateMatrixWorld(true);',ctx);
 return {ctx,dom,hashes,run:s=>JSON.parse(vm.runInContext('JSON.stringify('+s+')',ctx))};
}
module.exports={load};
