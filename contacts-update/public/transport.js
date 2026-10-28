/* Bounded reads; timed-out executions and mutations are never replayed. */
(function(){
 window.GSISfetch=async function(url,options={}){
  const {gsisRead=false,gsisOnReadStatus,gsisNoRetryCodes=[],gsisTimeoutMs=28000,gsisTotalTimeoutMs,...init}=options,read=gsisRead||(!init.method||init.method==='GET'),outer=init.signal,deadline=Date.now()+(gsisTotalTimeoutMs??(gsisTimeoutMs*(read?2:1)+800));
  const diagnostics=[],attempts=[],traceId=typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():undefined;
  if(traceId&&typeof Headers!=='undefined'){init.headers=new Headers(init.headers);init.headers.set('X-GSiS-Trace-ID',traceId);}
  const cancelled=()=>outer?.reason||Object.assign(Error('Request cancelled'),{name:'AbortError'});
  const pause=ms=>new Promise((resolve,reject)=>{if(outer?.aborted){reject(cancelled());return;}let timer;const abort=()=>{clearTimeout(timer);outer?.removeEventListener('abort',abort);reject(cancelled());};timer=setTimeout(()=>{outer?.removeEventListener('abort',abort);resolve();},ms);outer?.addEventListener('abort',abort,{once:true});});
  for(let attempt=0;attempt<(read?2:1);attempt++){
   if(outer?.aborted)throw cancelled();
   const remaining=deadline-Date.now();if(remaining<=0)throw Object.assign(Error('The school service took too long to respond. Please retry.'),{name:'TimeoutError',diagnostics,attempts,traceId});
   gsisOnReadStatus?.({attempt:attempt+1,traceId});
   const controller=new AbortController(),started=Date.now(),record={attempt:attempt+1,traceId};attempts.push(record);let timedOut=false,response,retry=false;
   const abort=()=>controller.abort(cancelled()),timer=setTimeout(()=>{timedOut=true;controller.abort()},Math.min(gsisTimeoutMs,remaining));
   outer?.addEventListener('abort',abort,{once:true});
   try{
    response=await fetch(url,{...init,signal:controller.signal});
    // A response is complete only when its body has arrived within this deadline.
    if(typeof response.arrayBuffer==='function'&&typeof Response!=='undefined'){const bytes=await response.arrayBuffer();response=new Response([204,205,304].includes(response.status)?null:bytes,{status:response.status,statusText:response.statusText,headers:response.headers});}
    response.gsisDiagnostics=diagnostics;response.gsisAttempts=attempts;response.gsisTraceId=traceId;record.status=response.status;
    if(read&&!attempt&&[502,503].includes(response.status)){
     let body;if(response.clone)try{body=await response.clone().json();}catch{}
     record.code=body?.code;record.diagnosticId=body?.diagnosticId||body?.gatewayTiming?.diagnosticId||body?.reference?.requestId;
     if(record.diagnosticId)diagnostics.push(record.diagnosticId);
     // Abort at the edge does not stop an Apps Script execution. Even an early
     // UPSTREAM_TIMEOUT must be returned, never replayed as a new execution.
     retry=body?.code!=='UPSTREAM_TIMEOUT'&&!gsisNoRetryCodes.includes(body?.code)&&Date.now()-started<=5000;
    }
   }catch(error){
    record.outcome=outer?.aborted?'cancelled':timedOut?'timeout':'connection-error';
    if(outer?.aborted)throw cancelled();
    const failure=timedOut?Object.assign(Error('The school service took too long to respond. Please retry.'),{name:'TimeoutError'}):error;
    throw Object.assign(failure,{diagnostics,attempts,traceId});
   }finally{record.durationMs=Date.now()-started;clearTimeout(timer);outer?.removeEventListener('abort',abort);}
   if(outer?.aborted)throw cancelled();
   const delay=400+Math.floor(Math.random()*401);
   if(!retry||deadline-Date.now()<gsisTimeoutMs+delay)return response;
   await pause(delay);
   // Recheck after background-tab throttling; never start a partial attempt.
   if(deadline-Date.now()<gsisTimeoutMs)return response;
  }
 };
})();
