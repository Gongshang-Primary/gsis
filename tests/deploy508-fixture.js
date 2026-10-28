const vm=require('node:vm'),base=require('./storage.cjs');
module.exports=()=>{
 const {ctx,book,sheets,props}=base,run=s=>vm.runInContext(s,ctx),cache=new Map(),stats={reads:[],writes:[],flushes:0};let fault=null,held=false;
 book.getId=()=> 'synthetic508';
 const hook=(s,n)=>{s.getName=()=>n;s.getParent=()=>book;};for(const [n,s]of sheets)hook(s,n);
 const insert=book.insertSheet.bind(book);book.insertSheet=n=>{const s=insert(n);hook(s,n);return s;};
 const parse=range=>{const m=range.match(/^'((?:[^']|'')+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);if(!m)throw Error(range);const col=s=>[...s].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0);return {sheet:sheets.get(m[1].replace(/''/g,"'")),row:+m[3],col:col(m[2]),height:+m[5]-+m[3]+1,width:col(m[4])-col(m[2])+1};};
 ctx.CacheService={getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),getAll:keys=>Object.fromEntries(keys.filter(k=>cache.has(k)).map(k=>[k,cache.get(k)])),putAll:o=>Object.entries(o).forEach(([k,v])=>cache.set(k,v))})};
 ctx.SpreadsheetApp.flush=()=>stats.flushes++;
 const api={batchGet(id,p){stats.reads.push(...p.ranges);return {valueRanges:p.ranges.map(range=>{const r=parse(range);return {values:r.sheet.getRange(r.row,r.col,r.height,r.width).getValues()};})};},batchUpdate(p){stats.writes.push(p.data);fault?.('before',p,stats.writes.length);for(const item of p.data){const r=parse(item.range);r.sheet.getRange(r.row,r.col,r.height,r.width).setValues(item.values);}fault?.('after',p,stats.writes.length);return {};}};
 ctx.Sheets={Spreadsheets:{Values:api}};
 ctx.LockService.getScriptLock=()=>({tryLock(){if(held)return false;held=true;return true;},releaseLock(){held=false;}});
 run("props_().setProperty('LEASES','{}');c.user.email=who.email;");
 return {...base,run,cache,stats,api,reset(){stats.reads=[];stats.writes=[];stats.flushes=0;},failure(fn){fault=fn;},hold(value){held=value;}};
};
