/* Synthetic staff only. Runs the real operations model behind a deterministic API adapter. */
(function(){
 if(!crypto.randomUUID)crypto.randomUUID=()=>"10000000-1000-4000-8000-"+String(++window.__uuidCounter).padStart(12,"0");window.__uuidCounter=0;
 const NativeDate=Date;let clock=NativeDate.parse('2026-10-14T00:00:00Z'),serial=0;
 window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[clock]));}static now(){return clock;}};
 const memory={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>memory[k]??null,setItem:(k,v)=>memory[k]=String(v),removeItem:k=>delete memory[k]}});
 const blank=()=>Array.from({length:17},()=>['','','','']),cells=blank();cells[2]=['EL','4A','C1-01',''];cells[3]=['EL','4A','C1-01',''];cells[4]=['EL','4B','C1-02',''];cells[7]=['.','','','PD (P5/6 Sci)'];cells[8]=[' . ','','','PD (P5/6 Sci) '];
 const periods=Array.from({length:17},(_,period)=>{const fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');return {period,startMinutes:420+30*period,endMinutes:450+30*period,start:fmt(420+30*period),end:fmt(450+30*period)};});
 const people=['Alice Teacher','Bob Colleague','Charlie Busy','Dora Free'].map((name,i)=>({id:['alice','bob','charlie','dora'][i],name,active:true,mobile:String(91234567+i*1111111),employment:''}));people.push({id:'ext',name:'External Known (SRE)',active:false,mobile:'95678901',employment:'SRE'});
 const teachers=people.slice(0,4).map(p=>({staffId:p.id,name:p.name,cells:blank(),R:p.id==='bob'?0:4}));teachers[0].cells=cells;teachers[2].cells[2]=['MA','3A','C2-02',''];
 const day={id:'baseline',parity:'even',schoolDay:true,verified:true,periods,teachers,recesses:[{level:1,period:5},{level:2,period:6},{level:3,period:7}],formClasses:[{id:'4A',name:'4A',level:4,venue:'C1-01'},{id:'4B',name:'4B',level:4,venue:'C1-02'},{id:'3A',name:'3A',level:3,venue:'C2-02'}]};
 // The baseline subject catalogue includes other weekdays beyond this dated slice.
 const ctx={subjects:['EL','MA','PAL'],today:'2026-10-14',iso:new Date().toISOString(),minute:480,now:clock,user:{staffId:'alice',email:'alice@gsps.edu.sg',smc:true,admin:true,accessVerified:true},people,days:{'2026-10-14':day},uuid:()=>('test-id-'+(++serial)),notificationsConfigured:false,adminRecipients:[],smcIds:['alice']};
 const profile={user:ctx.user,revision:1,active:null,upcoming:null,selected:null,entries:[],model:null};
 const f=window.__fixture={ctx,day,profile,state:GSISRosterOperations.initial(),receipts:new Map(),calls:[],fail:null,delay:{},setClock:iso=>{clock=NativeDate.parse(iso);ctx.now=clock;ctx.iso=new Date().toISOString();ctx.minute=(clock/60000+480)%1440;}};
 window.__calls=[];window.__confirmations=[];window.confirm=m=>(__confirmations.push(m),true);
 window.fetch=async(url,args={})=>{
  const route=String(url).split('/').pop(),p=JSON.parse(args.body||'{}');__calls.push(route);f.calls.push({route,p:structuredClone(p)});
  if(f.delay[p.operation||route])await new Promise(r=>setTimeout(r,f.delay[p.operation||route]));
  try{
   if(route==='config')return {ok:true,status:200,json:async()=>({clientId:'fixture'})};
   let data={};
   if(route==='profile'||route==='read')data=profile;
   if(route==='operations'){
    const O=GSISRosterOperations;
    for(const d of O.dates(['saveAbsence','saveRecess'].includes(p.operation)?p:{date:p.date||ctx.today}))ctx.days[d]??=structuredClone(day);
    if(p.operation==='receiptStatus'){const saved=f.receipts.get(p.command.requestId);data={accepted:!!saved,requestId:p.command.requestId,savedIds:saved?.savedIds,revision:f.state.revision,acceptedAt:ctx.iso};}
    else if(O.READS.includes(p.operation))data=O.read(f.state,ctx,p);
    else if(f.receipts.has(p.requestId))data=f.receipts.get(p.requestId);
    else{
     if(p.revision!==undefined&&p.revision!==f.state.revision)throw Object.assign(Error('Allocation changed. Refresh before saving.'),{status:409});
     const next=structuredClone(f.state),result=O.apply(next,ctx,p);next.revision++;f.state=next;data={...O.view(next,ctx,p),...result};f.receipts.set(p.requestId,data);
     if(f.fail==='after-save'){f.fail=null;throw Object.assign(Error('Save confirmation unavailable'),{status:503});}
    }
   }
   return {ok:true,status:200,json:async()=>({ok:true,data})};
  }catch(e){return {ok:false,status:e.status||400,json:async()=>({ok:false,error:e.message})};}
 };
})();
