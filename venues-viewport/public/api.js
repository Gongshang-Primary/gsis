/* GSiS Venues 0.9.2: transport contains no role or contact authority. */
(function(global){
 'use strict';
 async function request(route,input){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),route==='command'||input.refreshSources===true?90000:30000);
  try{
   const response=await fetch('/api/'+route,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(input),signal:controller.signal});
   let result;try{result=await response.json();}catch{throw Object.assign(Error('The server reply could not be read. Check the outcome before retrying.'),{status:response.status,uncertain:route==='command'});}
   if(!response.ok||result.ok!==true){const error=Error(result.error||'The request could not be completed.');Object.assign(error,{status:result.status||response.status,code:result.code,conflicts:result.conflicts,uncertain:route==='command'&&(response.status>=500||response.status===408)});throw error;}
   return result.data;
  }catch(error){if(error.name==='AbortError'||error instanceof TypeError){throw Object.assign(Error(route==='command'?'The booking outcome is not known yet. Retry this same request to check it safely.':'Could not refresh data. Your last verified timetable is still available.'),{uncertain:route==='command',status:0});}throw error;}
  finally{clearTimeout(timer);}
 }
 global.VenuesAPI={read:input=>request('read',input),command:input=>request('command',input),requestId:()=>crypto.randomUUID()};
})(window);
