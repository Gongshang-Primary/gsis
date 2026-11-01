/* Advisory only: no network calls, payload reads, retries, focus or save controls. */
(function(global){
 'use strict';
 global.GSISversionNotice=function(response){
  try{
   const valid=value=>typeof value==='string'&&value.length<=32&&/^\d+\.\d+\.\d+[a-z]?$/.test(value),page=document.querySelector('meta[name="gsis-build-label"]')?.content,server=response?.headers?.get('X-GSiS-Build-Label');
   if(!valid(page)||!valid(server))return response;
   const render=()=>{
    try{
     let notice=document.getElementById('gsis-version-notice');
     if(page===server){notice?.remove();return;}
     if(!notice){notice=document.createElement('p');notice.id='gsis-version-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.style.cssText='margin:0;padding:10px 16px;background:#fff4ce;color:#332800;border-bottom:1px solid #b38c00;font:14px/1.5 system-ui,sans-serif';document.body.prepend(notice);}
     notice.textContent='This page is v'+page+'; the server is v'+server+'. Press Ctrl+Shift+R to refresh.';
    }catch{} // A notice must never turn a confirmed request into an uncertain save.
   };
   if(document.body)render();else document.addEventListener('DOMContentLoaded',render,{once:true});
  }catch{}
  return response;
 };
})(window);
