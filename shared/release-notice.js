/* A cached page stays usable while a different backend build is installed. */
(function(){
 const page=document.querySelector('meta[name="gsis-build-label"]')?.content;
 const valid=value=>typeof value==='string'&&/^\d+\.\d+\.\d+[a-z]?$/.test(value);
 if(!valid(page)||typeof window.fetch!=='function')return;
 const fetch=window.fetch.bind(window),mismatches=new Map(),observed=new Map();let serial=0,waiting=false;
 function render(){
  if(!document.body){if(!waiting){waiting=true;document.addEventListener('DOMContentLoaded',()=>{waiting=false;render();},{once:true});}return;}
  let notice=document.getElementById('gsis-version-notice');const server=mismatches.values().next().value;
  if(!server){notice?.remove();return;}
  if(!notice){notice=document.createElement('div');notice.id='gsis-version-notice';notice.setAttribute('role','status');notice.style.cssText='padding:10px 16px;background:#fff4ce;color:#3b3100;font:14px/1.5 system-ui;position:relative;z-index:1000';document.body.prepend(notice);}
  notice.textContent='This page is v'+page+'; the server is v'+server+'. Press Ctrl+Shift+R to refresh.';
 }
 function show(server,key,order){
  if(!valid(server)||order<(observed.get(key)||0))return;
  observed.set(key,order);if(server===page)mismatches.delete(key);else mismatches.set(key,server);render();
 }
 window.fetch=async function(input,init){
  const order=++serial,response=await fetch(input,init);
  try{
   const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
   if(url.origin===location.origin&&url.pathname.startsWith('/api/')){
    const header=response.headers.get('X-GSiS-Build-Label'),key=url.origin+url.pathname;
    if(header)show(header,key,order);
    else if(response.headers.get('content-type')?.includes('application/json'))response.clone().json().then(body=>show(body?.buildLabel||body?.data?.buildLabel||body?.result?.buildLabel,key,order)).catch(()=>{});
   }
  }catch{} // A notice must never change the outcome of an operation.
  return response;
 };
})();
