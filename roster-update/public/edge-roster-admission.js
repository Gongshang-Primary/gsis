// Bound overlapping materialized Roster mutations in one notification isolate.
// This is resource admission, not a replacement for D1 receipts or CAS guards.
// Foreground Pages requests retain their existing cancellation/concurrency path.
const backgroundEnvironments=new WeakSet(),waiters=[];
let active=false;
// One minute invocation can fan out several jobs and up to three captures.
// Sixteen small waiters accommodate that fanout without retaining loaded state;
// 30 seconds leaves time within the capture's 90-second durable delivery lease.
const MAX_WAITERS=16,WAIT_MS=30000;
const busy=()=>Object.assign(Error('Background roster work is busy. Retry the retained operation.'),{status:503,code:'ROSTER_MEMORY_BUSY'});

export function withRosterMutationAdmission(env){
 if(env?.ROSTER_EDGE_AUTHORITY!=='d1')return env;
 const background={...env};backgroundEnvironments.add(background);return background;
}
function release(){
 while(waiters.length){
  const next=waiters.shift();clearTimeout(next.timer);
  if(Date.now()>=next.expiresAt){next.reject(busy());continue;}
  next.resolve();return;
 }
 active=false;
}
function acquire(){
 if(!active){active=true;return Promise.resolve();}
 if(waiters.length>=MAX_WAITERS)return Promise.reject(busy());
 return new Promise((resolve,reject)=>{
  const waiter={resolve,reject,expiresAt:Date.now()+WAIT_MS,timer:null};
  waiter.timer=setTimeout(()=>{const index=waiters.indexOf(waiter);if(index<0)return;waiters.splice(index,1);reject(busy());},WAIT_MS);
  waiters.push(waiter);
 });
}
export async function runRosterMutation(env,work){
 if(!backgroundEnvironments.has(env))return work();
 await acquire();
 // The active permit never expires: releasing while work still runs would
 // allow a second full state load. Worker termination leaves durable recovery
 // to the existing capture, allocation and notification claims.
 try{return await work();}finally{release();}
}
