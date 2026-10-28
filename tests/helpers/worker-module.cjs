/* Test the actual module graph while retaining isolated inline gateway fixtures. */
'use strict';
const path=require('node:path'),crypto=require('node:crypto'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..');
function toWorkerModuleURL(url){
 if(typeof url!=='string'||!url.startsWith('data:text/javascript;base64,'))throw Error('Expected inline JavaScript fixture');
 const source=Buffer.from(url.slice(url.indexOf(',')+1),'base64').toString('utf8');
 if(!/^import\s/m.test(source))return url;
 const deploy=/import\s*\{edgeDeployEnabled,edgeDeployDispatch/.test(source);
 const result=esbuild.buildSync({absWorkingDir:root,stdin:{contents:source,resolveDir:path.join(root,deploy?'public':'roster-update/public'),sourcefile:'worker-fixture.js'},bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',keepNames:true,treeShaking:false,logLevel:'silent'});
 // esbuild removes fixture nonce comments. Retain their identity so a fresh
 // inline import cannot accidentally reuse a previous test's module globals.
 const identity=crypto.createHash('sha256').update(source).digest('hex');
 return 'data:text/javascript;base64,'+Buffer.from('// Fixture '+identity+'\n'+result.outputFiles[0].text).toString('base64');
}
module.exports={toWorkerModuleURL};
