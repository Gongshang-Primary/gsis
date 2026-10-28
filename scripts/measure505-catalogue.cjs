// Actual Contacts signed dispatcher with a synthetic 181-person workbook.
// This measures service counts and JSON bytes, never production latency.
const fs=require('fs'),f=require('../tests/contacts503-fixture.js')(),cache=new Map();
f.ctx.CacheService={getScriptCache:()=>({get:k=>cache.get(k)||null,getAll:ks=>Object.fromEntries(ks.filter(k=>cache.has(k)).map(k=>[k,cache.get(k)])),put:(k,v)=>cache.set(k,v),putAll:vs=>Object.entries(vs).forEach(([k,v])=>cache.set(k,v))})};
const rows=[];let hash;
for(const [label,input] of [['full cold',{readOnly:true}],['warm legacy client',{readOnly:true}],['warm conditional',{readOnly:true,knownCatalogueHash:null}]]){
 f.reset();if('knownCatalogueHash' in input)input.knownCatalogueHash=hash;
 const result=f.post('deploySnapshot',input);if(!result.ok)throw Error(JSON.stringify(result));hash=result.data.catalogueHash;
 rows.push({label,responseBytes:Buffer.byteLength(JSON.stringify(result)),catalogueUnchanged:!!result.data.catalogueUnchanged,apiRequests:f.stats.reads.length,readRanges:f.stats.reads.flat().length,reportedCells:result.data.timing.io.readCells,authorityReads:f.stats.reads.flat().filter(r=>r.includes('admin_users')).length});
}
const report={version:require('../package.json').gsisRelease,scope:'Synthetic 181-person Contacts fixture, actual signed dispatcher; service counts and JSON bytes only, no network or production latency.',rows};
fs.writeFileSync('verification/505-catalogue-counts.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
