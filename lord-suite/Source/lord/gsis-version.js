/* A cached page stays usable while a different backend release is installed. */
(function(){
 const page=document.querySelector('meta[name="gsis-version"]')?.content;
 const valid=value=>typeof value==='string'&&/^\d+\.\d+\.\d+[a-z]?$/.test(value);
 if(!valid(page)||typeof window.fetch!=='function')return;
 const fetch=window.fetch.bind(window);
 function show(server){
  if(!valid(server))return;
  let notice=document.getElementById('gsis-version-notice');
  if(server===page){notice?.remove();return;}
  if(!notice){notice=document.createElement('div');notice.id='gsis-version-notice';notice.setAttribute('role','status');notice.style.cssText='padding:10px 16px;background:#fff4ce;color:#3b3100;font:14px/1.5 system-ui;position:relative;z-index:1000';document.body.prepend(notice);}
  notice.textContent='This page is v'+page+'; the server is v'+server+'. Press Ctrl+Shift+R to refresh.';
 }
 window.fetch=async function(input,init){
  const response=await fetch(input,init);
  try{
   const url=new URL(typeof input==='string'?input:input.url,location.href);
   if(url.origin===location.origin&&url.pathname.startsWith('/api/')){
    const header=response.headers.get('X-GSiS-Backend-Version');
    if(header)show(header);
    else if(response.headers.get('content-type')?.includes('application/json')){
     // Clone only local API responses, never consume the caller's response.
     response.clone().json().then(body=>show(body?.backendVersion||body?.data?.backendVersion||body?.timing?.backendVersion||body?.data?.timing?.backendVersion)).catch(()=>{});
    }
   }
  }catch{} // A notice must not turn a successful operation into a failure.
  return response;
 };
})();
