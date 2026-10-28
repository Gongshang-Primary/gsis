const assert=require('node:assert/strict'),crypto=require('node:crypto'),JSZip=require('jszip'),{completeRelease}=require('../scripts/complete-release-assets.js');
const hash=async b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const bytes=Buffer.from('synthetic unchanged asset, not a font');const asset={sourcePath:'public/vendor/example.woff2',frontend:'Deploy',path:'vendor/example.woff2',sha256:await hash(bytes),bytes:bytes.length};
 const oldApp=new JSZip().file(asset.path,bytes),old=new JSZip().file('Deploy_Frontend_v0.7.00.zip',await oldApp.generateAsync({type:'nodebuffer'}));
 const next=new JSZip().file('vendor-assets-manifest.json',JSON.stringify({version:'0.7.01',baseline:'0.7.00',assets:[asset]})).file('Deploy_Frontend_v0.7.01.zip',await new JSZip().file('index.html','version 0.7.01').generateAsync({type:'nodebuffer'})).file('GSiS_v0.7.01_Source.zip',await new JSZip().file('package.json','{}').generateAsync({type:'nodebuffer'}));
 const baseline=await old.generateAsync({type:'nodebuffer'}),release=await next.generateAsync({type:'nodebuffer'}),out=await JSZip.loadAsync(await completeRelease(JSZip,baseline,release,hash));
 for(const name of ['Deploy_Frontend_v0.7.01.zip','GSiS_v0.7.01_Source.zip']){const z=await JSZip.loadAsync(await out.file(name).async('nodebuffer'));assert.equal(await z.file(name.startsWith('Deploy')?asset.path:asset.sourcePath).async('string'),bytes.toString());}
 for(const line of (await out.file('SHA256SUMS.txt').async('string')).trim().split('\n')){const [digest,name]=line.split('  ');assert.equal(await hash(await out.file(name).async('nodebuffer')),digest);}
 const bad=new JSZip().file('Deploy_Frontend_v0.7.00.zip',await new JSZip().file(asset.path,'modified bytes').generateAsync({type:'nodebuffer'}));await assert.rejects(()=>completeRelease(JSZip,bad.generateAsync({type:'nodebuffer'}),release,hash),/does not match/);
 next.file('vendor-assets-manifest.json',JSON.stringify({version:'0.7.01',baseline:'0.7.00',assets:[{...asset,path:'../escape'}]}));await assert.rejects(()=>completeRelease(JSZip,baseline,next.generateAsync({type:'nodebuffer'}),hash),/Invalid asset/);
 console.log('PASS local asset completion: verified baseline reuse, source/frontend parity, checksums, tamper and path rejection');
})().catch(e=>{console.error(e);process.exit(1);});
