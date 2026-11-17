// v1 ES-module port of the existing stable-field wire contract in shared/fields.js.
// The classic v0.9 browser script has no module export. Keep it
// unchanged; browser/Worker tests verify this port against its actual patches.
/* Stable field addresses shared by transport and sheet storage. */
var GSISFields=(function(){
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 function flat(value){const out={};function walk(v,path){const key=JSON.stringify(path);if(v===null||typeof v!=='object'){out[key]=JSON.stringify({v:v===undefined?null:v});return;}if(Array.isArray(v)){const used=new Set(),keys=v.map((x,i)=>{let id=x&&typeof x==='object'&&!Array.isArray(x)?x.id||x.ref||x.teacher:x&&Array.isArray(x)&&typeof x[0]==='string'?x[0]:null;if(path[path.length-1]==='venues'&&id==='D1-06B'&&x.name==='Pump Room')id='D1-06B|Pump Room';let k=id?'@'+id:'#'+i;if(used.has(k))throw Error('Duplicate record identity '+JSON.stringify(path)+' '+k);used.add(k);return k;});putOrder(out,path,keys);v.forEach((x,i)=>walk(x,path.concat(keys[i])));}else{const keys=Object.keys(v);if(keys.length>100){out[key]=JSON.stringify({oc:Math.ceil(keys.length/100)});for(let i=0;i<keys.length;i+=100)out[JSON.stringify(path.concat('!keys'+i/100))]=JSON.stringify({v:keys.slice(i,i+100)});}else out[key]=JSON.stringify({o:keys});keys.forEach(k=>walk(v[k],path.concat(k)));}}walk(value,[]);return out;}
 // Metadata comes from encoded JSON strings, so validate while decoding rather
 // than waiting for the reconstructed document's normal plain-value boundary.
 const maxKeys = 5000, maxNodes = 100000, maxDepth = 19;
 function check(condition, message) {
  if (!condition) throw Error(message || 'Invalid planning field encoding.');
 }
 function node(fields, path) {
  const key = JSON.stringify(path);
  check(own(fields, key), 'Missing planning field.');
  const value = JSON.parse(fields[key]);
  check(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1);
  return value;
 }
 function keys(values) {
  check(Array.isArray(values) && values.length <= maxKeys &&
   values.every(value => typeof value === 'string' && value.length <= 160) &&
   new Set(values).size === values.length, 'Invalid planning field order.');
  return values;
 }
 function chunks(fields, path, count, prefix, size) {
  check(Number.isSafeInteger(count) && count > 0 && count <= Math.ceil(maxKeys / size),
   'Invalid planning field chunks.');
  const values = [];
  for (let i = 0; i < count; i++) {
   const part = node(fields, path.concat(prefix + i));
   check(own(part, 'v') && Array.isArray(part.v) && part.v.length <= size);
   values.push(...part.v);
  }
  return keys(values);
 }
 function order(fields, path, value = node(fields, path)) {
  return own(value, 'a') ? keys(value.a) : chunks(fields, path, value.ac, '!order', 500);
 }
 function inflate(fields) {
  let visited = 0;
  function read(path) {
   check(path.length <= maxDepth && ++visited <= maxNodes, 'Planning field bounds exceeded.');
   const value = node(fields, path);
   if (own(value, 'v')) {
    check(value.v === null || ['string', 'number', 'boolean'].includes(typeof value.v));
    return value.v;
   }
   if (own(value, 'a') || own(value, 'ac')) return order(fields, path, value).map(key => read(path.concat(key)));
   check(own(value, 'o') || own(value, 'oc'));
   const names = own(value, 'o') ? keys(value.o) : chunks(fields, path, value.oc, '!keys', 100);
   const result = {};
   for (const name of names) Object.defineProperty(result, name,
    {value: read(path.concat(name)), enumerable: true, writable: true, configurable: true});
   return result;
  }
  return read([]);
 }
 function putOrder(fields,path,keys){if(keys.length<=500){fields[JSON.stringify(path)]=JSON.stringify({a:keys});return;}fields[JSON.stringify(path)]=JSON.stringify({ac:Math.ceil(keys.length/500)});for(let i=0;i<keys.length;i+=500)fields[JSON.stringify(path.concat('!order'+i/500))]=JSON.stringify({v:keys.slice(i,i+500)});}
 function diff(before,after){const a=flat(before),b=flat(after);return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>a[k]!==b[k]).map(key=>({key,old:own(a,key)?a[key]:null,value:own(b,key)?b[key]:null}));}
 function apply(value,changes){const f=flat(value);changes.forEach(x=>{if(x.value===null)delete f[x.key];else f[x.key]=x.value;});return inflate(f);}
 return {flat,inflate,diff,apply,order,putOrder};
})();

export default GSISFields;
