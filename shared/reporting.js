/* Version-owned staff and reporting relationships. No Contacts writes. */
var GSISReporting=(function(){
 function compact(p){const v=p.profile||{},role=v.Role||p.role||'';return {id:p.id,name:v['Basic Name']||p.basicName||p.name||p.id,role,active:v.Active!=null?v.Active==='Y':p.active===true||p.active==='Y',groups:p.groups||[],mk:!!(p.mk||v['MK Modifier']||(p.groups||[]).includes('MK')||/^MK(?:\b|E)/i.test(role))};}
 function snapshot(d,people){const by=new Map((people||[]).filter(p=>p.id).map(p=>[p.id,compact(p)]));for(const p of d.teachers||[]){const row=compact({...p,profile:{...p.profile,...d.teacherDrafts?.[p.id]}});by.set(p.id,row);}return [...by.values()].filter(p=>p.active&&!p.mk&&!(d.membership||[]).some(r=>r[0]===p.role&&r[11]==='1')).sort((a,b)=>a.id.localeCompare(b.id));}
 function staff(d){const rows=snapshot(d,d.reporting?.staff||[]);return rows.map(p=>{const role=(d.membership||[]).find(r=>r[0]===p.role);return {...p,sl:role?role[2]==='1':p.groups.includes('SL'),oso:p.role==='OSO'};});}
 function value(d,x){return x.operation==='initReporting'?d.reporting||null:d.reporting?.officers?.[x.officer]||'';}
 function assign(d,id,ro){if(!d.reporting)throw Error('Initialize this version’s staff list first.');const people=staff(d),officers=people.filter(p=>!p.sl&&!p.oso),choices=people.filter(p=>!p.oso);if(!officers.some(p=>p.id===id))throw Error('Choose an active officer other than an OSO or SL.');if(typeof ro!=='string'||ro&&!choices.some(p=>p.id===ro))throw Error('Choose an active reporting officer.');if(id===ro)throw Error('An officer cannot report to themselves.');const links={...d.reporting.officers,[id]:ro};let next=ro,seen=new Set([id]);while(next){if(seen.has(next))throw Error('This reporting link would create a cycle.');seen.add(next);next=links[next]||'';}d.reporting.officers=links;}
 return {snapshot,staff,value,assign};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISReporting;
