const api=window.GSISV1,$=id=>document.getElementById(id);
let epoch=0;
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const status=text=>{$('storageStatus').textContent=text;};
const bytes=n=>n==null?'Unavailable':new Intl.NumberFormat('en-SG').format(n)+' bytes';
function committed(result){if(result.state!=='committed')throw Error('Outcome not confirmed. Retry the same operation.');return result.result;}
async function inspect(owner=$('storageOwner').value,cursor=null){
 const generation=++epoch;status('Inspecting storage…');$('storagePrune').replaceChildren();
 try{
  const r=await api.request(owner,'/system/storage'+(cursor?'?'+new URLSearchParams({cursor}):''));
  if(generation!==epoch)return;
  const host=$('storageReport');host.replaceChildren(node('p','D1 allocated: '+bytes(r.d1.allocatedBytes)+'; reusable pages: '+bytes(r.d1.reusablePageBytes)),node('p',r.note));
  host.append(node('p','R2 listing page: backup copies '+bytes(r.r2.page.backups.bytes)+' ('+r.r2.page.backups.objects+' objects); artifacts '+bytes(r.r2.page.artifacts.bytes)+' ('+r.r2.page.artifacts.objects+' objects). '+r.r2.scope));
  if(r.r2.unscopedObjects)host.append(node('p','Unrecognised-scope objects on this page: '+r.r2.unscopedObjects+'. Not pruneable here.'));
  if(r.r2.nextCursor){const next=node('button','Next R2 page');next.onclick=()=>inspect(owner,r.r2.nextCursor);host.append(next);}
  if(r.d1.canPrunePreviews){const b=node('button','Preview expired temporary previews ('+r.d1.expiredPreviews+(r.d1.expiredPreviewsAtLeast?'+':'')+')');b.onclick=()=>preview(owner,{kind:'expired-previews'});host.append(b);}
  const form=node('form'),label=node('label','Completed backup ID '),input=node('input'),button=node('button','Inspect abandoned backup-attempt files');input.required=true;label.append(input);form.append(label,button);form.onsubmit=e=>{e.preventDefault();void preview(owner,{kind:'backup-orphans',backupId:input.value.trim()});};host.append(form);
  for(const cleanup of r.cleanups){const row=node('p',cleanup.cleanupId+' · '+cleanup.state);if(cleanup.state==='pending'){const b=node('button','Resume confirmed prune');b.onclick=()=>finish(owner,cleanup.cleanupId,b);row.append(b);}host.append(row);}
  status('Observed '+new Date(r.observedAt).toLocaleString('en-SG',{timeZone:'Asia/Singapore'})+' SGT. Nothing was deleted.');
 }catch(e){if(generation===epoch)status(e.message);}
}
async function preview(owner,request){
 const generation=++epoch;status('Preparing exact scratch selection…');
 try{
  const p=await api.request(owner,'/system/storage/preview',{method:'POST',body:request});if(generation!==epoch)return;
  const host=$('storagePrune');host.replaceChildren(node('h3','Review prune selection'),node('p',p.protected),node('p',p.selection.length+' items in this bounded batch.'));
  const list=node('ul');for(const item of p.selection)list.append(node('li',item.id||item.key));host.append(list);
  if(p.nextCursor){const next=node('button','Inspect next backup page');next.onclick=()=>preview(owner,{...request,cursor:p.nextCursor});host.append(next);}
  if(!p.selection.length){status('No disposable scratch selected on this page.');return;}
  const form=node('form'),label=node('label','Type '+p.confirmation+' '),input=node('input'),confirm=node('button','Confirm this prune');input.required=true;input.autocomplete='off';label.append(input);form.append(label,confirm);host.append(form);
  let body=null;
  form.onsubmit=async event=>{
   event.preventDefault();if(input.value!==p.confirmation){status('Confirmation text does not match.');return;}
   body??={operationId:crypto.randomUUID(),kind:p.kind,cutoff:p.cutoff,backupId:p.backupId,cursor:p.cursor,previewDigest:p.previewDigest,confirmation:p.confirmation};confirm.disabled=true;
   try{const result=committed(await api.request(owner,'/system/storage/confirm',{method:'POST',body}));
    if(generation!==epoch)return;
    host.replaceChildren(node('p','Recorded '+result.cleanupId+' · '+result.state));
    if(result.state==='pending'){const b=node('button','Finish confirmed R2 prune');b.onclick=()=>finish(owner,result.cleanupId,b);host.append(b);status('Selection is durably recorded. R2 deletion is pending.');}
    else status('Expired previews removed. The audit and cleanup journal are retained.');
   }catch(e){status(e.message+' Operation '+body.operationId+' retained for retry; inspect storage after a reload.');confirm.textContent='Retry same confirmation';}
   finally{confirm.disabled=false;}
  };
  status('Preview only. Review the exact selection before confirming; it expires in five minutes.');
 }catch(e){if(generation===epoch)status(e.message);}
}
async function finish(owner,cleanupId,button){
 button.dataset.operationId??=crypto.randomUUID();button.disabled=true;
 try{const result=committed(await api.request(owner,'/system/storage/finish',{method:'POST',body:{operationId:button.dataset.operationId,cleanupId}}));status(result.state==='complete'?'Prune completion verified. The manifest and every referenced backup part are retained.':'Prune remains pending.');button.textContent='Completion verified';}
 catch(e){status(e.message+' Cleanup remains recorded; inspect storage to resume after a reload.');button.disabled=false;}
}
$('storageRefresh').onclick=()=>inspect();
$('storageOwner').onchange=()=>{epoch++;$('storageReport').replaceChildren();$('storagePrune').replaceChildren();status('Choose Inspect storage to load this owner.');};
window.addEventListener('gsis:clear-protected-state',()=>{epoch++;$('storageReport')?.replaceChildren();$('storagePrune')?.replaceChildren();});
