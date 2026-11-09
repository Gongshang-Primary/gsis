/* Pending proposals are actor-scoped recovery evidence, never optimistic saved rows. */
(function(root){
 'use strict';
 const actions=['saveDraft','publish','retryContactsSync','saveVersionNote','batchCells','setExclusionCell','metadata'];
 const open=r=>['QUEUED','RUNNING','CHECKING','UNCERTAIN'].includes(r.state),unresolved=s=>!['complete','not_required','APPLIED','REJECTED','CANCELLED'].includes(s.state);
 const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
 async function proposalDigest(payload){const value={...payload};delete value.clientId;const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));return Array.from(new Uint8Array(raw),x=>x.toString(16).padStart(2,'0')).join('');}
 const time=at=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at));
 const asOfLabel=r=>'As of '+time(r.asOf)+' SGT, revision '+r.googleRevision.indexRevision;
 const label=r=>r.state==='QUEUED'?'Queued at '+time(r.submittedAt):r.state==='APPLIED'?'Saved at '+time(r.appliedAt||r.updatedAt):({RUNNING:'Applying',CHECKING:'Checking outcome',UNCERTAIN:'Needs review',REJECTED:'Rejected'}[r.state]||'Outcome unavailable');
 const pending=rows=>rows.reduce((n,r)=>n+(open(r)?1:0)+(r.steps||[]).filter(unresolved).length,0);
 class Client {
  constructor({actor,storage,send,paint=()=>{}}){this.actor=actor.toLowerCase();this.storage=storage;this.send=send;this.paint=paint;this.key='gsis.deploy.commands.v1:'+this.actor;this.rows=[];try{const saved=JSON.parse(storage.getItem(this.key)||'[]');if(!Array.isArray(saved)||saved.some(x=>!x.requestId||!x.receipt))throw Error();this.rows=saved;}catch(e){if(storage.getItem(this.key))throw Error('Pending command recovery is unreadable. Keep browser storage and ask Admin to review.');}this.update();}
  update(){this.paint(this.rows.map(x=>x.receipt),this);}
  save(){this.storage.setItem(this.key,JSON.stringify(this.rows));this.update();}
  record(row,result){if(result.queueReceipt){if(result.queueReceipt.requestId!==row.requestId)throw Error('Receipt identity differs. Keep the original proposal.');row.receipt=result.queueReceipt;}if(row.receipt.state==='APPLIED'){row.versionId=row.payload?.versionId||row.versionId;delete row.payload;}this.save();return result;}
  outcome(row,result={}){
   if(row.receipt.state!=='APPLIED'){const error=Error(label(row.receipt)+'. Keep this proposal and use Check status.');error.code='EDGE_COMMAND_PENDING';error.status=row.receipt.state==='REJECTED'?409:202;error.queueReceipt=row.receipt;throw error;}
   const contact=(row.receipt.steps||[]).find(s=>s.step==='contacts'),layout=(row.receipt.steps||[]).find(s=>s.step==='layout');
   return {...result,saved:true,versionId:result.versionId||row.versionId,requestId:row.requestId,revision:result.revision??((row.action||row.receipt.action)==='saveVersionNote'?row.receipt.afterRevision?.versionRevision:row.receipt.afterRevision?.indexRevision),queueReceipt:row.receipt,
    ...(contact&&!result.contactsSync?{contactsSync:{status:contact.state==='complete'?'updated':'failed',publicationCommit:contact.publication?.commit,revision:contact.publication?.revision,reason:contact.reason||'Contacts update pending'}}:{}),...(layout&&!result.layoutHandoff?{layoutHandoff:{status:layout.state==='complete'?'complete':layout.state==='not_required'?'complete':'pending'}}:{})};
  }
  async submit(payload,expectedRevision){
   let row=this.rows.find(x=>x.requestId===payload.requestId);
   if(row){const original=row.proposalDigest||(row.payload?await proposalDigest(row.payload):null);if(!original||original!==await proposalDigest(payload))throw Error('This request ID belongs to another proposal. Use Check status to inspect the original outcome before making a new decision.');row.proposalDigest=original;const result=await this.check(row.requestId);return this.outcome(row,result);}
   if(this.rows.some(x=>open(x.receipt)))throw Error('Confirm the pending command and refresh its applied revision before submitting a dependent edit.');
   if(this.rows.length>=100){this.rows=this.rows.filter(x=>x.receipt.state!=='APPLIED'||(x.receipt.steps||[]).some(unresolved));if(this.rows.length>=100)throw Error('Resolve pending command evidence before submitting another save.');}
   if(new Blob([canonical(payload)]).size>262144){const error=Error('This atomic save exceeds 256 KiB. Keep the draft and review its size.');error.status=413;throw error;}
   row={requestId:payload.requestId,action:payload.operation,proposalDigest:await proposalDigest(payload),payload:JSON.parse(JSON.stringify(payload)),expectedRevision:JSON.parse(JSON.stringify(expectedRevision)),issuedAt:Date.now(),receipt:{app:'deploy',requestId:payload.requestId,state:'CHECKING',saved:false,submittedAt:Date.now(),steps:[]}};this.rows.push(row);this.save();
   let result;try{result=await this.send({kind:'submit',payload:row.payload,issuedAt:row.issuedAt,expectedRevision:row.expectedRevision});}catch(e){if(e.queueReceipt)this.record(row,{queueReceipt:e.queueReceipt});else{this.update();if(!e.status)e.message='The command outcome is unknown. Keep this request and draft. Independent direct continuation is unavailable until the Google recovery page is provided. Use Check status when the gateway returns.';}throw e;}
   this.record(row,result);return this.outcome(row,result);
  }
  async cancel(id){const row=this.rows.find(x=>x.requestId===id);if(!row?.payload)throw Error('Keep the original proposal for Admin cancellation review.');return this.record(row,await this.send({kind:'cancel',payload:row.payload,issuedAt:row.issuedAt,expectedRevision:row.expectedRevision}));}
  async check(id){const row=this.rows.find(x=>x.requestId===id);if(!row)throw Error('Retain the original proposal before checking this request.');return this.record(row,await this.send({kind:'status',requestId:id}));}
  async checkHealth(){if(this.healthFlight||Date.now()-(this.healthAt||0)<60000)return;this.healthAt=Date.now();this.healthFlight=true;try{this.health=await this.send({kind:'health'});this.update();}finally{this.healthFlight=false;}}
  async restore(){let cursor=0;for(let page=0;page<100;page++){const result=await this.send({kind:'list',cursor});if(!Array.isArray(result.receipts))return this.update();for(const receipt of result.receipts){const own=this.rows.find(x=>x.requestId===receipt.requestId);if(own){own.receipt=receipt;if(receipt.state==='APPLIED')delete own.payload;}else if(open(receipt)||(receipt.steps||[]).some(unresolved))this.rows.push({requestId:receipt.requestId,receipt,versionId:receipt.afterRevision?.versionId||receipt.beforeRevision?.versionId});}this.save();if(!result.cursor)return;cursor=result.cursor;}throw Error('More pending receipts require Admin review. Existing proposals are retained.');}

 }
 function panel(document,rows,client,{admin=false,refresh=()=>{},compare=()=>{}}={}){
  let box=document.getElementById('edge-command-receipts');if(!box){box=document.createElement('details');box.id='edge-command-receipts';box.setAttribute('aria-label','Command receipts');document.querySelector('.notice')?.after(box);}
  let alert=document.getElementById('edge-queue-admin-alert');const health=client.health;
  if(!admin||!health?.alert){alert?.remove();}else if(alert?.dataset.incident!==health.alert.incident){alert?.remove();alert=document.createElement('p');alert.id='edge-queue-admin-alert';alert.dataset.incident=health.alert.incident;alert.setAttribute('role','alert');alert.textContent='Deploy queue needs Admin review. '+(health.open+(health.pendingSteps||0))+' pending; oldest '+Math.floor(health.oldestPendingAge/60000)+' minutes. ';const link=document.createElement('a');link.href='#edge-command-receipts';link.textContent='Open Queue System Health';alert.append(link);box.before(alert);}
  box.replaceChildren();box.hidden=!rows.length&&!admin;const summary=document.createElement('summary');summary.textContent='Pending changes ('+pending(rows)+')';box.append(summary);
  for(const r of rows){if(!open(r)&&r.state!=='REJECTED'&&!(r.steps||[]).some(unresolved))continue;const row=document.createElement('section'),title=document.createElement('p');title.textContent=label(r);row.append(title);
   for(const step of r.steps||[]){const text=document.createElement('p');text.textContent=({deploy:'Deploy publication',contacts:'Contacts catalogue',layout:'Layout handoff',roster:'Roster handoff'}[step.step]||'Publication step')+': '+step.state+(step.reason?' ('+step.reason+')':'');row.append(text);}
   if(r.state==='APPLIED'&&(r.steps||[]).some(s=>s.step==='contacts'&&unresolved(s))){const text=document.createElement('p');text.textContent='Published; Contacts update pending/failed. Use Retry Contacts sync on the version row.';row.append(text);}
   if(open(r)){const b=document.createElement('button');b.textContent='Check status';b.onclick=async()=>{b.disabled=true;try{await client.check(r.requestId);await refresh();}catch{title.textContent='Outcome unavailable. Original request and proposal retained.';}finally{b.disabled=false;}};row.append(b);}
   if(admin&&open(r)&&client.rows.some(x=>x.requestId===r.requestId&&x.payload)){const b=document.createElement('button');b.textContent='Cancel original command';b.onclick=async()=>{b.disabled=true;try{await client.cancel(r.requestId);}catch{title.textContent='Cancellation could not be confirmed. Keep this original request and use Check status.';}finally{b.disabled=false;}};row.append(b);}
   if(r.resultKind==='conflict'){const text=document.createElement('p');text.textContent='Your proposal is retained. Compare the saved version, then make a fresh decision with a new request ID.';row.append(text);const b=document.createElement('button');b.textContent='Compare latest saved version';b.onclick=()=>compare(r);row.append(b);}
   box.append(row);
  }
  if(admin){const b=document.createElement('button');b.textContent='Queue System Health';b.onclick=async()=>{const output=document.createElement('pre');try{const h=await client.send({kind:'health'});output.textContent=h.available===false?'Queue service unavailable; Deploy remains direct.':JSON.stringify({mode:h.mode,queueDepth:h.queueDepth,oldestPendingAge:h.oldestPendingAge,lastApplied:h.lastApplied,failures:h.failures,cacheAge:h.cacheAge,alert:h.alert?.code||null},null,2);}catch{output.textContent='Queue health unavailable.';}box.append(output);};box.append(b);}
 }
 root.GSISDeployCommandClient={Client,actions,label,asOfLabel,pending,panel};if(typeof module!=='undefined'&&module.exports)module.exports=root.GSISDeployCommandClient;
})(typeof window!=='undefined'?window:globalThis);
