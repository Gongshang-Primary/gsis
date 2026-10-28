const fs=require('fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const release=require('../package.json'),version=release.gsisComponentVersions?.calendarFrontend||release.gsisRelease;const zip='../upload/gsps_calendar_v2_rc1_9_2_cloudflare.zip';
// Authorized publication controls change app.js; publication behavior is covered by
// calendar608-publication-ui.cjs and backend tests. Preserve byte checks on the
// unchanged gateway, shared core, styling and logo from the imported release.
if(fs.existsSync(zip))for(const file of ['_worker.js','calendar-core.js','styles.css','gsps-calendar-logo.png']){const original=execFileSync('unzip',['-p',zip,file]);const expected=file.endsWith('.js')?original.toString().replaceAll('RC1.9',version):original;assert.deepEqual(fs.readFileSync('calendar-update/public/'+file,file.endsWith('.js')?'utf8':undefined),expected,file);}
assert.match(fs.readFileSync('calendar-update/public/app.js','utf8'),new RegExp("FRONTEND_VERSION = '"+version+"'"));assert.match(fs.readFileSync('calendar-update/public/index.html','utf8'),new RegExp('>v'+version+'<'));console.log('PASS Calendar suite version; supplied gateway, shared core and visual assets preserved');
