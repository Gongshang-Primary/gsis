'use strict';
// One visible build label (release plus deploy letter) on every frontend: headers and
// asset query strings. A hand-edited or stale label fails here.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json'),label=pkg.gsisBuildLabel||pkg.gsisRelease;
assert.match(label,new RegExp('^'+pkg.gsisRelease.replace(/\./g,'\\.')+'[a-z]?$'),'label is the release plus at most one letter');
const pages=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?pages(path.join(dir,e.name)):e.name.endsWith('.html')?[path.join(dir,e.name)]:[]);
const pattern=new RegExp('(\\?v=|(?<![\\w.])v)'+pkg.gsisRelease.replace(/\./g,'\\.')+'[a-z]?(?![\\w.])','g');let total=0;
for(const [app,folder] of Object.entries(require('../release-installation-manifest.json').frontends)){
 assert.equal(fs.readFileSync(path.join(root,folder,'version-notice.js'),'utf8'),fs.readFileSync(path.join(root,'shared/version-notice.js'),'utf8'),app+' notice helper matches canonical source');
 for(const page of pages(path.join(root,folder))){const html=fs.readFileSync(page,'utf8'),observesBackend=!['landmark.html','privacy.html'].includes(path.basename(page));assert.equal(html.match(/<meta name="gsis-build-label" content="([^"]+)">/)?.[1],label,path.relative(root,page)+' page runtime metadata');assert.equal((html.match(/<script src="\/version-notice\.js\?v=[^"]+"><\/script>/g)||[]).length,observesBackend?1:0,path.relative(root,page)+' loads the observer only when it requests backend data');for(const m of html.matchAll(pattern)){total++;assert.equal(m[0],m[1]+label,path.relative(root,page)+' carries '+m[0]+', expected '+m[1]+label+'. Run npm run build.');}}
}
assert(total>100,'labels found across frontends');
console.log('PASS build label '+label+' on '+total+' frontend headers and asset URLs');
