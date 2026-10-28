/* One teaching-load rule engine, shared by browser and Apps Script. No workload calculation. */
var GSISTeachingRules = (function () {
 'use strict';
 var excludedGroups=['SL','SAT','Support','MK'];
 var nonTeacher=/^(?:SLs?|School Leaders?|AE|AM(?: \(ICT\))?|Counsellor|CSO|DE|Dentist|ICT [AM]|Library|Librarian|Reception(?:ist)?|MK(?:\b.*)?|MKE|OM|OSO|P|VP(?:\b.*)?|Recep|SAT|SC|Sci Lab|SENO|Support(?: Staff)?)$/i;
 function eligible(t){var p=t.profile||{};return p['EO Appt Level']!=='SL'&&!t.mk&&!p['MK Modifier']&&!(t.groups||[]).some(function(g){return excludedGroups.indexOf(g)>=0})&&!nonTeacher.test(String(p.Role||t.role||'').trim())&&!nonTeacher.test(String(p['Employment Modifier']||t.employment||'').trim());}
 // Appointment membership is independent of Acting/Ag and OF. Preserve other catalogue groups.
 function memberships(role,level,groups){
  var result=(groups||[]).slice(),required=/^(SH|Jnr KP)$/.test(String(level||'').trim())&&/^SH(?:\s|$)/i.test(String(role||'').trim())?'SMC':['ST','LT','MTT'].includes(String(level||'').trim())?'TL':null;
  if(required&&!result.includes(required))result.push(required);return result;
 }
 function resolve(t,catalogue,live,draft){
  var out=Object.assign({},t),base={'Basic Name':t.name||'',Role:t.role||'','EO Appt Level':'','Appointment Status':'','Employment Modifier':t.employment||'','Subject Modifier':t.subject||'',Active:t.active?'Y':'N'};
  var legacy={};if(t.role!==undefined)legacy.Role=t.role;if(t.employment!==undefined)legacy['Employment Modifier']=t.employment;if(t.subject!==undefined)legacy['Subject Modifier']=t.subject;if(t.active!==undefined)legacy.Active=t.active===true||t.active==='Y'?'Y':'N';
  var p=Object.assign(base,live&&live.profile||{},legacy,t.profile||{},draft||{}),key=String(p.Role||'').trim().toLowerCase(),rule=(catalogue||[]).find(function(r){return String(r.role||'').trim().toLowerCase()===key});
  // A loaded master catalogue is authoritative, including deliberately blank levels.
  if(Array.isArray(catalogue)){p['EO Appt Level']=rule?String(rule.level||''):'';out.groups=rule?memberships(rule.role,rule.level,rule.groups):[];}
  out.profile=p;out.role=p.Role;out.active=p.Active==='Y';out.mk=t.mk!==undefined?t.mk:live&&live.mk||'';return out;
 }
 function group(role,level){if(level!==undefined&&level!==null){level=String(level).trim();return /^(SH|LH|AYH)$/.test(level)?'Jnr KP':/^(SSD|YH)$/.test(level)?'HOD':level;}role=String(role||'').trim();level='';if(/^(ST|LT|MTT)$/.test(role))return role;if(/^(HOD(?:\b.*)?|SSD|YH)$/.test(role))return 'HOD';if(/^(LH(?:\b.*)?|SH(?:\b.*)?|AYH|Jnr KP)$/.test(role))return 'Jnr KP';return /^(HOD|Jnr KP|ST|LT|MTT)$/.test(level)?level:/^(SH|LH|AYH)$/.test(level)?'Jnr KP':'';}
 function defaults(){return [
 ['HOD','Appointment group','HOD',30,20,'',''],['Jnr KP','Appointment group','Jnr KP',20,0,'',''],
 ['ST','Appointment group','ST',20,0,'',''],['LT','Appointment group','LT',30,'','',''],['MTT','Appointment group','MTT','','','','Rate unknown; configure if appointed.'],
 ['4/5','Employment Modifier','4/5',20,'','',''],['BT','Staff tag','BT',20,'','',''],
 ['UT','Staff tag','UT','','',26,'Weekly cap covers total actual workload, including non-teaching.'],
 ['FAJT','Staff tag','FAJT','','','','No fixed rate.'],['SRE','Staff tag','SRE','','','','No fixed rate.'],
 ['TC','Staff tag','TC',20,'','','it should be 30% but case load in our school is lower']
 ].map(function(a,i){return {id:'rule-'+i,name:a[0],source:a[1],match:a[2],percent:a[3],actingPercent:a[4],periods:a[5],notes:a[6]}});}
 function migrate(old){var cfg=old&&old.schema===2?JSON.parse(JSON.stringify(old)):{schema:2,tags:defaults(),staff:{},baseline:null,legacy:old?JSON.parse(JSON.stringify(old)):null};
  // One-time seed. The marker survives edits and deletion, including an explicit 0%.
  if(!cfg.roleOverrideSchema){if(!cfg.tags.some(function(r){return r.source==='Role'&&String(r.match).trim().toLowerCase()==='hod sm';}))cfg.tags.push({id:'role-hod-sm',name:'HOD SM',source:'Role',match:'HOD SM',percent:50,actingPercent:'',periods:'',notes:'Replaces the general appointment offload.'});cfg.roleOverrideSchema=1;}return cfg;}
 function tokens(value){return String(value||'').split(/[,;]\s*/).map(function(v){return v.trim()}).filter(Boolean)}
 function calculate(t,catalogue){var cfg=catalogue&&catalogue.schema===2&&catalogue.roleOverrideSchema?catalogue:migrate(catalogue),p=t.profile||{},g=group(p.Role||t.role,p['EO Appt Level']),acting=/^(Ag|Acting)$/i.test(String(p['Appointment Status']||'').trim()),matched=[],pending=[],retained=1,caps=[];
  if(!eligible(t))return {eligible:false,retained:null,offloadPercent:null,cap:null,limit:null,matched:[],pending:[]};
  var explicit=cfg.tags.find(function(r){return r.source==='Role'&&String(r.match).trim().toLowerCase()===String(p.Role||t.role||'').trim().toLowerCase()&&r.percent!==''&&r.percent!==null&&r.percent!==undefined;});
  cfg.tags.forEach(function(rule){var values=rule.source==='Appointment group'?[g]:rule.source==='Membership'?(t.groups||[]):rule.source==='Staff tag'?[p.Role||t.role,p['EO Appt Level']].concat(tokens(p['Employment Modifier']||t.employment),tokens(p['Subject Modifier']||t.subject),tokens(p['Appointment Status'])):tokens(p[rule.source]||(rule.source==='Role'?t.role:rule.source==='Employment Modifier'?t.employment:rule.source==='Subject Modifier'?t.subject:''));if(rule.source==='Role'?!values.some(function(v){return String(v||'').trim().toLowerCase()===String(rule.match).trim().toLowerCase();}):values.indexOf(rule.match)<0)return;var rate=rule.source==='Appointment group'&&acting?rule.actingPercent:rule.percent;
   if(rule.source==='Appointment group'&&rule.match==='ST'&&acting)rate=0;
   var replaced=rule.source==='Appointment group'&&!!explicit;if(replaced)rate='';
   if(!replaced&&rule.source==='Appointment group'&&acting&&rate==='')pending.push('Acting rate not configured: '+rule.name);
   if(!replaced&&rule.match==='MTT'&&rate==='')pending.push('MTT rate not configured');
   if(rate!==''&&rate!==null&&rate!==undefined)retained*=1-Number(rate)/100;
   if(rule.periods!==''&&rule.periods!==null&&rule.periods!==undefined)caps.push(Number(rule.periods));
   matched.push({id:rule.id,name:rule.name,source:rule.source,match:rule.match,percent:rate,periods:rule.periods,acting:rule.source==='Appointment group'&&acting,replacedBy:replaced?explicit.id:null});
  });
  var cap=caps.length?Math.min.apply(null,caps):null,baseline=cfg.baseline!==''&&cfg.baseline!==null&&cfg.baseline!==undefined?Number(cfg.baseline):null;
  return {eligible:true,retained:retained,offloadPercent:Math.round((1-retained)*1e8)/1e6,cap:cap,capBasis:matched.some(function(r){return r.match==='UT';})?'total':'teaching',limit:pending.length?null:baseline===null?cap:Math.min(baseline*retained,cap===null?Infinity:cap),baselinePending:baseline===null,matched:matched,pending:pending};
 }
 return {memberships:memberships,resolve:resolve,eligible:eligible,group:group,defaults:defaults,migrate:migrate,calculate:calculate};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISTeachingRules;
