// Local-only synthetic fixture server. Never included in frontend ZIPs.
const fs=require('fs'),vm=require('vm'),path=require('path'),http=require('http');
const root=path.resolve(__dirname,'..');
const original=fs.readFileSync(path.join(__dirname,'storage.cjs'),'utf8');
const bootstrap=original.slice(0,original.indexOf('vm.runInContext(`'));
const setup=new Function('require','__dirname',bootstrap+';return ctx;');
const ctx=setup(require,__dirname);
vm.runInContext(`setupDeploy();var fixtureContacts={user:{email:'planner@gsps.edu.sg',roles:['Admin','KP']},people:Array.from({length:12},(_,i)=>({id:'teacher-'+i,name:'Teacher '+String.fromCharCode(65+i),active:true}))};var fixtureIdentity={email:'planner@gsps.edu.sg',subject:'preview'};var fixtureCall=(action,input)=>dispatch_({action,input,identity:fixtureIdentity},fixtureContacts);var fixtureId=fixtureCall('change',{operation:'create',name:'Preview · synthetic data',requestId:Utilities.getUuid()}).versionId;`,ctx);
function call(action,input){ctx.previewInput=input;ctx.previewAction=action;return vm.runInContext('fixtureCall(previewAction,previewInput)',ctx)}
http.createServer(async(req,res)=>{
 try{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname.startsWith('/api/')){let data='';for await(const chunk of req)data+=chunk;let result;try{result={ok:true,data:call(u.pathname.slice(5),JSON.parse(data||'{}'))}}catch(e){res.statusCode=e.status||500;result={ok:false,error:e.message}}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return}
 const contacts=u.pathname.startsWith('/contacts/');const name=contacts?u.pathname.slice(10):u.pathname.slice(1),file=path.resolve(root,contacts?'contacts-update/public':'public',name||'index.html');
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
 let content=fs.readFileSync(file);
 if(!contacts&&file.endsWith('app.js'))content=content.toString().replace(/controls\(\);startSignIn\(\);\s*$/,"token='preview';refresh();");
 if(!contacts&&file.endsWith('index.html'))content=content.toString().replace('<script src="https://accounts.google.com/gsi/client" async defer></script>','');
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':'application/octet-stream');res.end(content);
 }catch(e){res.writeHead(500);res.end(e.message)}
}).listen(8765,'127.0.0.1',()=>console.log('Synthetic preview on port 8765'));
