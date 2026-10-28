/* Reuse only hash-verified vendor assets from the owner's baseline ZIP.
   This module contains no vendor asset bytes and never makes a network request. */
(function(root){
 'use strict';
 async function completeRelease(JSZip, baselineBytes, releaseBytes, sha256, progress=()=>{}){
  const base=await JSZip.loadAsync(baselineBytes),out=await JSZip.loadAsync(releaseBytes);
  const item=out.file('vendor-assets-manifest.json');if(!item)throw Error('Select the v0.7.01 release package.');
  const manifest=JSON.parse(await item.async('string'));if(manifest.version!=='0.7.01'||manifest.baseline!=='0.7.00')throw Error('Unsupported baseline or release version.');
  const sources=new Map(),targets=new Map();
  for(let i=0;i<manifest.assets.length;i++){
   const a=manifest.assets[i];if(!['Contacts','Deploy'].includes(a.frontend)||!/^[-\w./]+$/.test(a.path)||a.path.includes('..')||!/^[-\w./]+$/.test(a.sourcePath)||a.sourcePath.includes('..'))throw Error('Invalid asset manifest.');
   const sourceName=a.frontend+'_Frontend_v0.7.00.zip',targetName=a.frontend+'_Frontend_v0.7.01.zip';
   if(!sources.has(sourceName)){const f=base.file(sourceName);if(!f)throw Error('Original v0.7.00 package is missing '+sourceName);sources.set(sourceName,await JSZip.loadAsync(await f.async('uint8array')));}
   if(!targets.has(targetName)){const f=out.file(targetName);if(!f)throw Error('Release is missing '+targetName);targets.set(targetName,await JSZip.loadAsync(await f.async('uint8array')));}
   const source=sources.get(sourceName).file(a.path);if(!source)throw Error('Baseline asset missing: '+a.path);
   const bytes=await source.async('uint8array');if(bytes.length!==a.bytes||await sha256(bytes)!==a.sha256)throw Error('Baseline asset does not match: '+a.path);
   targets.get(targetName).file(a.path,bytes);
   if(!targets.has('GSiS_v0.7.01_Source.zip')){const f=out.file('GSiS_v0.7.01_Source.zip');if(!f)throw Error('Source package missing.');targets.set('GSiS_v0.7.01_Source.zip',await JSZip.loadAsync(await f.async('uint8array')));}
   targets.get('GSiS_v0.7.01_Source.zip').file(a.sourcePath,bytes);
   progress('Verified existing asset '+(i+1)+' of '+manifest.assets.length);
  }
  for(const [name,z] of targets){progress('Completing '+name);out.file(name,await z.generateAsync({type:'uint8array',compression:'DEFLATE'}));}
  out.file('LOCAL_ASSET_COMPLETION.txt','GSiS v0.7.01: unchanged assets verified and restored locally from the owner’s v0.7.00 package. Source code and commit are unchanged. SHA256SUMS.txt has been updated for the completed archive.\n');
  let sums='';for(const name of Object.keys(out.files).sort()){const f=out.files[name];if(f.dir||name==='SHA256SUMS.txt')continue;sums+=await sha256(await f.async('uint8array'))+'  '+name+'\n';}out.file('SHA256SUMS.txt',sums);
  progress('Creating completed release ZIP');return out.generateAsync({type:'uint8array',compression:'DEFLATE'});
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={completeRelease};else root.completeRelease=completeRelease;
})(typeof globalThis!=='undefined'?globalThis:this);
