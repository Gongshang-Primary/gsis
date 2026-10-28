/* Own-account acknowledgement state shared by Home and My Relief Duties.
   A pending command always names one immutable publication and one request ID. */
var RosterAcknowledgements = (() => {
 'use strict';
 const entries=new Map();let generation=0;
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const dateOf=o=>typeof o.today==='function'?o.today():o.today||today();
 const stamp=value=>{const d=new Date(value);return Number.isFinite(+d)?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d)+' SGT':'';};
 const emit=e=>{for(const f of e.listeners)f();};
 function adopt(e,result){
  const ack=result.acknowledged;
  if(ack?.timetableNoticeId)e.receipts.set(ack.timetableNoticeId,ack.acknowledgedAt||result.acceptedAt||true);
  if(!Number.isFinite(result.revision)||result.revision>=e.revision){
   e.revision=result.revision??e.revision;e.loaded=true;
   if(result.notice!==undefined)e.notice=result.notice?{...result.notice}:null;
  }
  if(e.notice?.status==='acknowledged')e.receipts.set(e.notice.id,e.notice.acknowledgedAt||e.receipts.get(e.notice.id)||true);
  if(e.notice&&e.receipts.has(e.notice.id))e.notice={...e.notice,status:'acknowledged',acknowledgedAt:e.receipts.get(e.notice.id)};
 }
 async function load(e,force=false){
  if(e.loading||!force&&e.loaded)return e.loading;const born=generation;e.error='';
  e.loading=(async()=>{try{const result=await e.api('operations',{operation:'acknowledgementStatus',date:e.date});if(born!==generation)return;adopt(e,result);}catch(error){if(born===generation)e.error=error.message||'Acknowledgement status could not load.';}finally{if(born===generation){e.loading=null;emit(e);}}})();emit(e);return e.loading;
 }
 async function acknowledge(e,notice){
  if(e.sending||e.receipts.has(notice.id))return;
  if(e.pending&&e.pending.timetableNoticeId!==notice.id)return;
  const command=e.pending||{operation:'acknowledge',date:notice.date,timetableNoticeId:notice.id,snapshotIds:[],compact:true,revision:e.revision,requestId:globalThis.crypto?.randomUUID?.()||'ack-'+Date.now()+'-'+Math.random().toString(36).slice(2)};
  const retry=!!e.pending,born=generation;e.pending=command;e.error='';e.sending=true;emit(e);
  try{
   let result;
   // Receipt lookup is read-only. A lost lookup may safely replay the exact command.
   if(retry){try{const receipt=await e.api('operations',{operation:'receiptStatus',command});if(receipt?.accepted===true&&receipt.acknowledgementOnly)result=receipt;}catch{}}
   result=result||await e.api('operations',command);if(born!==generation)return;
   const accepted=result.acknowledged?.timetableNoticeId;
   if(accepted!==command.timetableNoticeId)throw Error('The acknowledgement could not be confirmed. Retry the same acknowledgement.');
   adopt(e,result);e.pending=null;for(const callback of e.accepted)callback(result);
  }catch(error){if(born!==generation)return;e.error=error.message||'The acknowledgement could not be confirmed. Retry the same acknowledgement.';
   if(error.status===409){e.pending=null;await load(e,true);}
  }finally{if(born===generation){e.sending=false;emit(e);}}
 }
 function mount(host,options){
  const date=options.notice?.date||dateOf(options),key=options.owner+'|'+date;
  if(!options.owner||!/^\d{4}-\d\d-\d\d$/.test(date)){host.hidden=true;return ()=>{};}
  let e=entries.get(key);if(!e){e={date,owner:options.owner,api:options.api,revision:0,notice:null,loaded:false,loading:null,sending:false,pending:null,error:'',listeners:new Set(),accepted:new Set(),receipts:new Map()};entries.set(key,e);}e.api=options.api;
  if(options.notice&&(!e.loaded||(options.revision??0)>=e.revision))adopt(e,{revision:options.revision,notice:options.notice});
  const fixed=options.notice?.id;let disposed=false;
  const render=()=>{
   if(disposed)return;host.replaceChildren();host.classList.add('roster-ack-action');host.setAttribute('aria-live','polite');
   const notice=fixed?(e.notice?.id===fixed?e.notice:options.notice):e.notice,acknowledged=notice&&e.receipts.has(notice.id),stale=fixed&&e.notice&&e.notice.id!==fixed;
   host.hidden=!notice&&!e.error&&!e.loading;if(host.hidden)return;
   const text=document.createElement('span');host.append(text);
   if(!notice){text.textContent=e.error||'Checking for a published timetable…';host.classList.toggle('is-pending',true);if(e.error){const retry=document.createElement('button');retry.type='button';retry.textContent='Retry';retry.onclick=()=>load(e,true);host.append(retry);}return;}
   host.classList.toggle('is-pending',!acknowledged);host.classList.toggle('is-acknowledged',!!acknowledged);
   if(stale&&!acknowledged){text.textContent='A newer timetable is available. Open it before acknowledging.';if(options.onView){const view=document.createElement('button');view.type='button';view.textContent='View latest timetable';view.onclick=()=>options.onView(notice.date);host.append(view);}return;}
   text.textContent=acknowledged?'Acknowledged'+(typeof e.receipts.get(notice.id)==='string'?' · '+stamp(e.receipts.get(notice.id)):''):'Published timetable'+(notice.publishedAt?' · '+stamp(notice.publishedAt):'')+' · Acknowledgement required';
   if(!acknowledged){const earlier=e.pending&&e.pending.timetableNoticeId!==notice.id,target=earlier?{id:e.pending.timetableNoticeId,date:e.pending.date}:notice,button=document.createElement('button');button.type='button';button.className='primary';button.textContent=e.sending?'Confirming acknowledgement…':earlier?'Check earlier acknowledgement':e.pending?'Retry acknowledgement':'Acknowledge timetable and instructions';button.disabled=e.sending;button.dataset.ackNotice=target.id;button.onclick=()=>acknowledge(e,target);host.append(button);
    if(e.sending){const spin=document.createElement('span');spin.className='ops-spinner';spin.setAttribute('aria-hidden','true');host.append(spin);}}
   if(options.onView&&!fixed){const view=document.createElement('button');view.type='button';view.textContent='View timetable';view.onclick=()=>options.onView(notice.date);host.append(view);}
   if(e.error){const error=document.createElement('span');error.className='roster-ack-error';error.textContent=e.error;host.append(error);}
  };
  e.listeners.add(render);if(options.onAccepted)e.accepted.add(options.onAccepted);render();if(!options.notice)load(e);
  return ()=>{if(disposed)return;disposed=true;e.listeners.delete(render);if(options.onAccepted)e.accepted.delete(options.onAccepted);};
 }
 function refresh(owner,date){return Promise.all([...entries.values()].filter(e=>e.owner===owner&&(!date||e.date===date)).map(e=>load(e,true)));}
 function clear(){generation++;for(const e of entries.values()){e.listeners.clear();e.accepted.clear();}entries.clear();}
 return {mount,refresh,clear};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=RosterAcknowledgements;
