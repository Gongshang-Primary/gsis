const fs=require('fs'),assert=require('assert/strict'),{load}=require('./model403-helper.js'),m=load('.'),base=JSON.parse(fs.readFileSync('verification/model404-baseline.json'));
const changed=Object.keys(m.hashes).filter(k=>m.hashes[k]!==base.geometry[k]);assert.deepEqual(changed.sort(),['J:1','J:4']);
// Full mesh/batch hash of all other groups, including entire approved staircase, is exact.
for(const [k,v] of Object.entries(base.geometry))if(!['J:1','J:4'].includes(k))assert.equal(m.hashes[k],v,k);
const html=fs.readFileSync('layout-update/public/landmark.html','utf8');assert.equal((html.match(/\{side:'e',pos:360\}/g)||[]).length,2);assert.equal((html.match(/\{side:'e',pos:385\}/g)||[]).length,0);
fs.writeFileSync('verification/model405-results.json',JSON.stringify({changedGroups:changed,stairGeometryUnchanged:true,allOtherGroupsUnchanged:true,oldDoorPosition:385,newDoorPosition:360},null,2));m.dom.window.close();console.log('PASS two ISH wall/door groups changed; approved stair, railings, platforms, roof, supports and all other geometry exactly unchanged.');
