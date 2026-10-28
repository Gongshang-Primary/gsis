// Private Durable Object: only the Pages binding may mint tickets or publish.
// The public Worker deliberately exposes no routes.
export default {fetch(){return new Response('Not found',{status:404})}};
export class DeployLive {
 constructor(ctx){this.ctx=ctx}
 async fetch(request){
  const url=new URL(request.url),now=Date.now();
  if(url.pathname==='/ticket'&&request.method==='POST'){
   const data=await request.json();
   if(!data.versionId||!data.actor||!data.origin)return new Response('Invalid ticket',{status:400});
   const ticket=crypto.randomUUID(),expires=now+30000;
   await this.ctx.storage.put('ticket:'+ticket,{...data,expires,sessionUntil:Math.min(now+60000,data.authUntil||0)});
   await this.ctx.storage.setAlarm(now+60000);
   return Response.json({ticket,expires});
  }
  if(url.pathname==='/connect'&&request.headers.get('Upgrade')?.toLowerCase()==='websocket'){
   const ticket=url.searchParams.get('ticket');
   if(!/^[\w-]{36}$/.test(ticket||''))return new Response('Invalid ticket',{status:401});
   // Consume atomically: two upgrades must never reuse one ticket.
   const data=await this.ctx.storage.transaction(async txn=>{const d=await txn.get('ticket:'+ticket);if(d)await txn.delete('ticket:'+ticket);return d});
   if(!data||data.expires<=now||data.sessionUntil<=now||request.headers.get('Origin')!==data.origin)return new Response('Expired ticket',{status:401});
   const sockets=this.ctx.getWebSockets();
   for(const ws of sockets){const a=ws.deserializeAttachment();if(a.until<=now)ws.close(1008,'Session ended')}
   const active=sockets.filter(ws=>ws.deserializeAttachment().until>now);
   if(active.length>=100||active.filter(ws=>ws.deserializeAttachment().actor===data.actor).length>=4)return new Response('Too many connections',{status:429});
   const pair=new WebSocketPair(),client=pair[0],server=pair[1];
   this.ctx.acceptWebSocket(server);
   server.serializeAttachment({actor:data.actor,versionId:data.versionId,privileged:!!data.privileged,until:data.sessionUntil});
   server.send(JSON.stringify({type:'ready',until:data.sessionUntil}));
   return new Response(null,{status:101,webSocket:client});
  }
  if(url.pathname==='/publish'&&request.method==='POST'){
   const event=await request.json();
   for(const ws of this.ctx.getWebSockets()){
    const a=ws.deserializeAttachment();
    if(a.until<=now){ws.close(1008,'Session ended');continue}
    if(event.all||a.versionId===event.versionId||event.catalog&&a.privileged){
     // No staff data, names, draft values, or role details are broadcast.
     try{ws.send(JSON.stringify({type:'invalidate',at:now}))}catch{ws.close(1011,'Reconnect')}
    }
   }
   return Response.json({ok:true});
  }
  return new Response('Not found',{status:404});
 }
 async alarm(){
  const now=Date.now(),tickets=await this.ctx.storage.list({prefix:'ticket:'});
  for(const [key,value] of tickets)if(value.expires<=now)await this.ctx.storage.delete(key);
  for(const ws of this.ctx.getWebSockets())if(ws.deserializeAttachment().until<=now)ws.close(1008,'Renew session');
  if(this.ctx.getWebSockets().length||tickets.size)await this.ctx.storage.setAlarm(now+60000);
 }
 webSocketMessage(ws){ws.close(1008,'Receive-only connection')}
 webSocketClose(){}
 webSocketError(ws){try{ws.close(1011,'Reconnect')}catch{}}
}
