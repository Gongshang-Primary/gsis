/* Lease-aware adapter for older UI-only fixtures. Production lease rules are checked by stapler712-leases.cjs. */
(()=>{
 const render=RosterStaplerUI.render,wrapped=new WeakSet(),rows=new Map();
 RosterStaplerUI.render=ctx=>{
  if(!wrapped.has(ctx.api)){
   const original=ctx.api,view=(date,p)=>{const row=rows.get(date)||{fence:0},active=!!row.owner&&row.until>Date.now();return {fence:row.fence,active,mine:active&&row.owner===ctx.profile.user.email&&row.session===p.leaseSessionId,ownerName:active?'Fixture editor':'',expiresAt:active?row.until:null,renewAfterMs:45000,canRelease:ctx.profile.user.admin===true&&active};};
   ctx.api=async(route,p)=>{
    if(route==='operations'&&['acquireStaplerLock','renewStaplerLock','releaseStaplerLock'].includes(p.operation)){
     const row=rows.get(p.date)||{fence:0},active=!!row.owner&&row.until>Date.now();
     if(p.leaseFence!==row.fence||p.operation==='acquireStaplerLock'&&active||p.operation==='renewStaplerLock'&&(!active||row.session!==p.leaseSessionId))throw Object.assign(Error('Editing lock changed'),{status:409});
     rows.set(p.date,p.operation==='releaseStaplerLock'?{fence:row.fence+1}:{fence:p.operation==='acquireStaplerLock'?row.fence+1:row.fence,owner:ctx.profile.user.email,session:p.leaseSessionId,until:Date.now()+180000});return {lock:view(p.date,p)};
    }
    const value=await original(route,p);
    if(route!=='operations')return value;
    if(['confirmStapler','publishStapler'].includes(p.operation)){const row=rows.get(p.date);if(row&&row.session===p.leaseSessionId)rows.set(p.date,{fence:row.fence+1});}
    if(Object.prototype.hasOwnProperty.call(value,'plan')){const lock=view(value.date,p);return {...value,planningAllowed:value.canEdit,lock,canEdit:!!value.canEdit&&lock.mine,canConfirm:!!value.canConfirm&&lock.mine,canReset:!!value.canReset&&lock.mine};}
    if(Array.isArray(value.dates))return {...value,dates:value.dates.map(row=>({...row,lock:view(row.date,p)}))};return value;
   };wrapped.add(ctx.api);
  }
  return render(ctx);
 };
})();
