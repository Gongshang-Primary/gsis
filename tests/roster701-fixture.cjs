const O=require('../shared/roster-operations.js');
function fixture(){
 let seq=0;const date='2026-10-14',blank=()=>Array.from({length:17},()=>['','','','']);
 const people=['Alice','Bob','Charlie','Dora'].map((name,i)=>({id:name.toLowerCase(),name,active:true,mobile:String(91234567+i*1111111)}));
 const periods=Array.from({length:17},(_,period)=>{const fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');return {period,startMinutes:420+30*period,endMinutes:450+30*period,start:fmt(420+30*period),end:fmt(450+30*period)};});
 const teachers=people.map(p=>({staffId:p.id,name:p.name,cells:blank(),R:4}));teachers[0].cells[2]=['EL','4A','C1-01',''];teachers[0].cells[3]=['EL','4A','C1-01',''];
 // The baseline subject catalogue includes other weekdays beyond this dated slice.
 const ctx={subjects:['EL','PAL'],today:date,now:Date.parse(date+'T00:00:00Z'),iso:date+'T00:00:00Z',minute:480,user:{staffId:'alice',email:'alice@gsps.edu.sg',smc:true,admin:true},people,days:{[date]:{id:'baseline',parity:'even',schoolDay:true,verified:true,periods,teachers}},uuid:()=>('id-'+(++seq)),notificationsConfigured:false,adminRecipients:[],smcIds:['alice']};
 const state=O.initial();return {O,state,ctx,date,blank,teachers,people};
}
module.exports=fixture;
