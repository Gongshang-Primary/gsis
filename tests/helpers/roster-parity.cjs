// Static dispatch inventory. No application code is evaluated by discovery.
const fs=require('node:fs'),path=require('node:path'),{parse}=require('acorn');
const root=path.resolve(__dirname,'../..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function scan(file,providedSource){
 const source=providedSource??read(file),ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true}),found=[];
 function constants(n,bindings){if(!n||typeof n!=='object'||/Function/.test(n.type||''))return;
  if(n.type==='VariableDeclarator'&&n.id.type==='Identifier'&&['ArrayExpression','ObjectExpression'].includes(n.init?.type))bindings.set(n.id.name,n.init.elements||n.init.properties);
  for(const [key,v]of Object.entries(n))if(key!=='loc'){if(Array.isArray(v))v.forEach(c=>constants(c,bindings));else if(v&&typeof v==='object')constants(v,bindings);}
 }
 const arrays=new Map();constants(ast,arrays);
 const unwrap=n=>n?.type==='ChainExpression'?n.expression:n;
 const member=n=>{n=unwrap(n);return n?.type==='MemberExpression'&&!n.computed?n.property.name:null;};
 const requestMember=n=>{n=unwrap(n);while(n?.type==='MemberExpression')n=unwrap(n.object);return n?.type==='Identifier'&&['p','input','req','request','command'].includes(n.name);};
 const kind=n=>member(n)==='operation'&&requestMember(n)||n?.type==='Identifier'&&['op','operation'].includes(n.name)?'operation':member(n)==='view'&&requestMember(n)||n?.type==='Identifier'&&n.name==='view'?'view':member(n)==='action'&&requestMember(n)||n?.type==='Identifier'&&n.name==='action'?'action':null;
 function add(type,value,node,fn){if(typeof value==='string'&&value&&(type!=='action'||/^(roster|edge)/.test(value)))found.push({key:type+':'+value,type,value,file,line:node.loc.start.line,handler:fn||'(module)'});}
 function visit(n,fn,bindings){if(!n||typeof n!=='object')return;if(/Function/.test(n.type||'')){bindings=new Map(bindings);constants(n.body,bindings);}if(n.type==='FunctionDeclaration'){fn=n.id?.name;if(fn==='rosterServiceDispatch_')add('action','rosterService',n,fn);}
  if(n.type==='BinaryExpression'&&['===','==','!==','!='].includes(n.operator)){const k=kind(n.left)||kind(n.right),v=n.left.type==='Literal'?n.left.value:n.right.type==='Literal'?n.right.value:null;if(k)add(k,v,n,fn);}
  if(n.type==='MemberExpression'&&n.computed&&kind(n.property)&&n.object.type==='Identifier')for(const property of bindings.get(n.object.name)||[])if(property.type==='Property')add(kind(n.property),property.key.name||property.key.value,property,fn);
  if(n.type==='SwitchStatement'&&kind(n.discriminant))for(const c of n.cases)if(c.test?.type==='Literal')add(kind(n.discriminant),c.test.value,c,fn);
  if(n.type==='CallExpression'&&member(n.callee)==='includes'&&['ArrayExpression','Identifier'].includes(n.callee.object.type)){
   const k=kind(n.arguments[0]);if(k)for(const v of (n.callee.object.elements||bindings.get(n.callee.object.name)||[]))if(v?.type==='Literal')add(k,v.value,n,fn);
  }
  // Lists at the Pages boundary remain coverage sources even when indirectly used.
  if(n.type==='VariableDeclarator'&&n.id.type==='Identifier'&&/(?:OPERATIONS|READS)$/.test(n.id.name)&&n.id.name!=='COLD_SYSTEM_OPERATIONS'&&['NewExpression','ArrayExpression'].includes(n.init?.type)){
   const arr=n.init.type==='ArrayExpression'?n.init:n.init.arguments[0];if(arr?.type==='ArrayExpression')for(const v of arr.elements)if(v?.type==='Literal')add('operation',v.value,n,fn);
  }
  if(n.type==='CallExpression'&&member(n.callee)==='newTrigger'&&n.arguments[0]?.type==='Literal')add('trigger',n.arguments[0].value,n,fn);
  // Direct Drive/Sheets writer entry points; transitive helper callers are in the source references.
  if(n.type==='FunctionDeclaration'&&/^roster/i.test(fn||'')){
   const body=source.slice(n.body.start,n.body.end);
   if(/\.(?:createFile|setContent|setValues|setValue|appendRow|deleteRows|setTrashed|batchUpdate)\s*\(|rosterDriveRequest_\([^;]*['"](?:post|patch|delete)['"]/s.test(body))add('writer',fn,n,fn);
  }
  if(n.type==='Literal'&&typeof n.value==='string'&&n.value.startsWith('/api/')&&file.endsWith('_worker.js'))add('route',n.value,n,fn);
  for(const [k,v]of Object.entries(n))if(!['loc','start','end'].includes(k)){if(Array.isArray(v))for(const c of v)visit(c,fn,bindings);else if(v&&typeof v==='object')visit(v,fn,bindings);}
 }
 visit(ast,null,arrays);return found;
}
function discover(){
 const files=fs.readdirSync(path.join(root,'backend')).filter(f=>/^Roster.*\.gs$/.test(f)).map(f=>'backend/'+f);
 files.push('shared/roster-operations.js','roster-update/public/_worker.js');
 const map=new Map();for(const file of files)for(const row of scan(file)){if(!map.has(row.key))map.set(row.key,{key:row.key,type:row.type,value:row.value,sources:[]});const target=map.get(row.key);if(!target.sources.some(x=>x.file===row.file&&x.line===row.line))target.sources.push({file:row.file,line:row.line,handler:row.handler});}
 for(const value of ['metadata','activate','prune','restore']){const row=map.get('operation:'+value);if(row){const sources=row.sources.filter(s=>s.handler==='rosterDispatch_');if(sources.length)map.set('rosterUpdate:'+value,{key:'rosterUpdate:'+value,type:'operation',value,action:'rosterUpdate',sources});}}
 return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key));
}
module.exports={root,read,scan,discover};
if(require.main===module)console.log(JSON.stringify(discover(),null,2));
