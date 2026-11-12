import Q from '../shared/edge-command-queue.js';
export async function googleDeploy(env,input){
 Q.secret(env.GSIS_SECRET);const endpoint=new URL(env.APPS_SCRIPT_URL||'');if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname)||endpoint.search||endpoint.hash||endpoint.username)Q.fail(503,'QUEUE_GOOGLE_ENDPOINT');
 const signed=await Q.sign({...input,app:'deploy',document:'workbook',purpose:Q.GOOGLE,timestamp:Date.now(),nonce:crypto.randomUUID()},env.GSIS_SECRET);
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(signed),redirect:'follow',signal:AbortSignal.timeout(35000)});
 const raw=await response.text();if(Q.bytes(raw)>8388608)Q.fail(503,'QUEUE_GOOGLE_RESPONSE_SIZE');const body=Q.parse(raw,8388608);if(!response.ok||body.ok!==true||!body.data)Q.fail(503,'QUEUE_GOOGLE_UNCONFIRMED');return body.data;
}
export async function decision(env,input,now=Date.now()){
 const signed=await googleDeploy(env,input),value=await Q.verify(signed,env.GSIS_SECRET,'edge-command-google-result-v1',now);
 if(value.app!=='deploy'||value.document!=='workbook')Q.fail(503,'QUEUE_GOOGLE_RESULT');
 return value.decision==='UNKNOWN'||value.decision==='PREPARED'?null:value;
}

export const deployAdapter={...Q.DEPLOY,binding:'DEPLOY_EDGE_QUEUE',google:googleDeploy,authorize:Q.deployPermission};
