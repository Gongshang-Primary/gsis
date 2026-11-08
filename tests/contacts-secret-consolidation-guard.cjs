const assert=require('node:assert/strict'),fs=require('node:fs'),{parse}=require('acorn'),{spawnSync}=require('node:child_process');
const legacy=new Set(['BRIDGE_SECRET','ROSTER_SERVICE_SECRET','CALENDAR_PROXY_SECRET','CALENDAR_SERVICE_SECRET','CONTACTS_BRIDGE_SECRET','VENUES_BRIDGE_SECRET','LORD_BRIDGE_SECRET','DEPLOY_BRIDGE_SECRET','DEPLOY_EDGE_SECRET','GSIS_BACKEND_SECRET']);
// Expand this migrated-app list only in the separately reviewed PR for that app.
const paths=['contacts-update/public/_worker.js','Contacts_Code.gs','Contacts_Backend_v0.9.9.gs','backend/Contacts_Code_with_Deploy_API.gs','calendar-update/public/_worker.js','calendar-backend/Code.gs','calendar-backend/Birthdays.gs','calendar-backend/VenueDirectory.gs','Calendar_Backend_v0.9.9.gs','calendar-job-worker/worker.mjs','calendar-job-worker/dashboard-worker.mjs','calendar-job-worker/dashboard-worker.txt'];
function guard(){for(const file of paths){const source=fs.readFileSync(file,'utf8'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true});
 function visit(n){if(!n||typeof n!=='object'||!n.type)return;
  const name=n.type==='Identifier'?n.name:n.type==='Literal'?n.value:n.type==='TemplateElement'?n.value.cooked:null;
  assert(!legacy.has(name),'Legacy migrated-app transport secret in '+file+':'+n.loc.start.line+': '+name);
  assert(!(n.type==='CallExpression'&&['gsisApiSecret','gsisApiSecret_'].includes(n.callee.name)&&n.arguments.length>(n.callee.name.endsWith('_')?0:1)),'Legacy secret selector argument in '+file);
  for(const [key,value]of Object.entries(n))if(key!=='loc'){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
 }visit(ast);
 assert(!source.includes('getProperty(legacyName)')&&!source.includes('env?.[legacyName]'),'Dynamic legacy fallback remains in '+file);
 }console.log('PASS migrated-app GSIS_SECRET-only guard: '+paths.length+' deployed sources');}
if(process.argv.includes('--prove')||process.argv.includes('--prove-calendar')){const file=process.argv.includes('--prove-calendar')?'calendar-update/public/_worker.js':paths[0],before=fs.readFileSync(file);try{fs.appendFileSync(file,'\nfunction deliberateLegacyRead(env){return env.BRIDGE_SECRET;}\n');const r=spawnSync(process.execPath,[__filename],{encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/Legacy migrated-app transport secret/);console.log('PASS negative control: deliberately reintroduced transport read rejected, child exit '+r.status);}finally{fs.writeFileSync(file,before);}assert.deepEqual(fs.readFileSync(file),before);}
guard();
