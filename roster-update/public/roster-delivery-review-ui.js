/* Compact authorised delivery review. These actions never send a message. */
(()=>{
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let current=null,pending=null;
 const live=s=>current===s&&s.ctx.container.isConnected;
 const time=v=>{const d=new Date(v);return Number.isFinite(+d)?d.toLocaleString('en-SG',{timeZone:'Asia/Singapore',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'})+' SGT':'';};
 const items=rows=>rows.map(row=>({id:row.id,token:row.token}));
 function draw(s){
  if(!live(s))return;const data=s.data,rows=data?.issues||[],page=Math.min(s.page,Math.max(0,Math.ceil(rows.length/50)-1));s.page=page;const shown=rows.slice(page*50,(page+1)*50),locked=s.busy||!!pending,root=s.ctx.container;
  root.innerHTML='<div class="delivery-review"><button type="button" data-review-open aria-expanded="'+s.open+'">WhatsApp delivery issues'+(data?' ('+rows.length+')':'')+'</button><span class="delivery-review-status'+(s.busy?' is-loading':'')+'" role="status" aria-live="polite">'+(s.busy?'<span class="ops-spinner" aria-hidden="true"></span> ':'')+esc(s.message||'')+'</span>'+(s.open?'<section class="delivery-review-panel" aria-label="WhatsApp delivery issues"><div class="delivery-review-tools"><button type="button" data-review-refresh '+(locked?'disabled':'')+'>Refresh</button><button type="button" data-review-clear '+(!shown.length||locked?'disabled':'')+'>Clear shown alerts</button>'+(data?.canCancel?'<button type="button" data-review-cancel-preview '+(!data.pending?.length||locked?'disabled':'')+'>Review pending notifications ('+(data.pending?.length||0)+')</button>':'')+'</div><p class="hint">'+(data?'Checked '+esc(time(data.checkedAt))+'. '+(data.inFlight||0)+' submitted attempts in progress; '+(data.unresolvedUncertain??data.uncertain??0)+' unresolved uncertain outcomes; '+(data.reviewedUncertain||0)+' reviewed outcomes retained in history. ':'')+'Delivery issues are saved to a private text report daily at 08:00 Singapore time. Saved entries clear automatically. Clearing an alert preserves delivery history. It does not confirm WhatsApp delivery.</p>'+((data?.reports||[]).length?'<details><summary>Saved daily reports</summary><ul>'+(data.reports||[]).filter(report=>/^20\d\d-\d\d-\d\d$/.test(report.date)&&report.url==='/api/whatsapp/reports/'+report.date).map(report=>'<li><a href="'+esc(report.url)+'">'+esc(report.date)+' — '+esc(report.count||0)+' issues</a></li>').join('')+'</ul></details>':'')+(pending?'<p class="error">The last action is not yet confirmed. Retry the same action before making another change.</p><button type="button" data-review-retry '+(s.busy?'disabled':'')+'>Retry same action</button>':'')+'<div class="delivery-review-table"><table><thead><tr><th>Teacher / issue</th><th>Date</th><th>Notification</th><th>Outcome</th><th>Details</th><th>Daily report</th></tr></thead><tbody>'+shown.map(row=>'<tr><th scope="row">'+esc(row.name||row.field||row.group)+'</th><td>'+esc(row.date||'')+'</td><td>'+esc(row.kind||'Configuration')+'</td><td>'+esc(row.status)+'</td><td>'+esc(row.cause)+'<br><small>'+esc(row.action)+'</small>'+(row.at?'<br><small>'+esc(time(row.at))+'</small>':'')+'</td><td>'+esc(row.reportStatus||'Waiting for 08:00 report')+'</td></tr>').join('')+(shown.length?'':'<tr><td colspan="6">'+(data?'No open delivery issues.':'Loading delivery issues…')+'</td></tr>')+'</tbody></table></div>'+(rows.length>50?'<div class="delivery-review-tools"><button type="button" data-review-prev '+(page===0?'disabled':'')+'>Previous</button><span>Showing '+(page*50+1)+' to '+Math.min(rows.length,(page+1)*50)+' of '+rows.length+'</span><button type="button" data-review-next '+((page+1)*50>=rows.length?'disabled':'')+'>Next</button></div>':'')+(s.cancelPreview?'<div class="delivery-review-confirm"><h3>Cancel these pending notifications?</h3><p>Only the '+s.cancelPreview.length+' unsubmitted notifications listed below will be cancelled. New jobs and already submitted attempts remain unchanged.</p><ul>'+s.cancelPreview.map(row=>'<li>'+esc([row.name,row.date,row.kind].filter(Boolean).join(' · '))+'</li>').join('')+'</ul><button type="button" data-review-cancel-confirm '+(locked?'disabled':'')+'>Cancel these notifications</button> <button type="button" data-review-cancel-back '+(s.busy?'disabled':'')+'>Keep notifications</button></div>':'')+'</section>':'')+'</div>';
  root.querySelector('[data-review-open]').onclick=()=>{s.open=!s.open;draw(s);};
  const bind=(selector,fn)=>root.querySelector(selector)?.addEventListener('click',fn);
  bind('[data-review-refresh]',()=>load(s));bind('[data-review-clear]',()=>mutate(s,'dismissDeliveryIssues',items(shown)));
  bind('[data-review-prev]',()=>{s.page--;draw(s);});bind('[data-review-next]',()=>{s.page++;draw(s);});
  bind('[data-review-cancel-preview]',()=>{s.cancelPreview=(data.pending||[]).slice(0,50);draw(s);});bind('[data-review-cancel-back]',()=>{s.cancelPreview=null;draw(s);});
  bind('[data-review-cancel-confirm]',()=>mutate(s,'cancelPendingNotifications',items(s.cancelPreview||[])));bind('[data-review-retry]',()=>mutate(s));
 }
 function failure(s,error){
  if(error.status===401||error.status===403){pending=null;s.ctx.container.replaceChildren();current=null;return;}
  s.message=(error.message||'Delivery review could not complete.')+(error.diagnosticId?' Reference: '+error.diagnosticId:'');
 }
 async function load(s){
  if(!live(s)||s.busy||pending)return;s.busy=true;s.message='Checking delivery records…';draw(s);
  try{const data=await s.ctx.api('operations',{operation:'deliveryReview'});if(!live(s))return;s.data=data;s.message='';s.cancelPreview=null;}
  catch(error){if(live(s))failure(s,error);}finally{if(live(s)){s.busy=false;draw(s);}}
 }
 async function mutate(s,operation,selection){
  if(!live(s)||s.busy)return;
  if(!pending){if(!selection?.length)return;pending={owner:s.ctx.owner,payload:{operation,items:selection,requestId:crypto.randomUUID()}};}
  if(pending.owner!==s.ctx.owner||pending.inFlight)return;const task=pending;let settledView=null;task.inFlight=true;s.busy=true;s.message='Updating delivery records…';draw(s);
  const activeView=()=>pending===task&&current?.ctx.owner===task.owner&&live(current)?current:null;
  try{
   const data=await s.ctx.api('operations',task.payload);if(pending!==task)return;settledView=activeView();pending=null;
   if(settledView){settledView.data=data;settledView.cancelPreview=null;settledView.message=(data.changed||0)+(task.payload.operation==='dismissDeliveryIssues'?' alerts cleared.':' pending notifications cancelled.');}
  }catch(error){
   if(pending!==task)return;settledView=activeView();
   if(error.status>=400&&error.status<500&&![408,429].includes(error.status))pending=null;
   if(settledView){settledView.cancelPreview=null;failure(settledView,error);}
  }finally{
   task.inFlight=false;const target=activeView()||(settledView&&live(settledView)?settledView:null);
   if(target){target.busy=false;draw(target);}
  }
 }
 function unmount(){if(current)current.ctx.container.replaceChildren();current=null;}
 window.RosterDeliveryReviewUI={mount(ctx){
  if(current?.ctx.container===ctx.container&&current.ctx.owner===ctx.owner)return;
  unmount();if(pending?.owner!==ctx.owner)pending=null;if(!ctx.user?.smc&&!ctx.user?.admin)return;
  const s=current={ctx,data:null,open:!!pending,busy:!!pending?.inFlight,message:pending?.inFlight?'Updating delivery records…':'',page:0,cancelPreview:null};draw(s);if(!pending)load(s);
 },unmount,reset(){unmount();pending=null;}};
})();
