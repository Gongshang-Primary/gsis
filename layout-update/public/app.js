'use strict';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
let campus=null,baseSVG='',selectedUnit='',view='layout',scale=1,user=null,loading=false,config=null,modelReady=false;
const venueLabel=room=>room.name==='Classroom'&&room.shortName?room.shortName:room.name;
const ownedCampus=()=>!!campus?.layoutRevision&&campus?.repository==='layout-current';
const requestedYear=new URLSearchParams(location.search).get('year');
const colors=['','#FFFFE0','#FFC0CB','#FCF1AE','#ADD8E6','#90EE90','#D8BFD8'];
function elem(tag,attrs={},text){const e=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text!=null)e.textContent=text;return e;}
function button(text,fn){const b=document.createElement('button');b.textContent=text;b.onclick=fn;return b;}
function status(text,busy=false){$('status').replaceChildren();if(busy){const s=document.createElement('span');s.className='spinner';$('status').append(s)}$('status').append(document.createTextNode(text));}
async function request(path,input){const response=await (window.GSISfetch||fetch)(path,{method:input===undefined?'GET':'POST',headers:input===undefined?{}:{'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input),gsisRead:input===undefined||path==='/api/profile',gsisTimeoutMs:28000,credentials:'same-origin'});let body;try{body=await response.json()}catch{throw Error('The service did not return data. Retry shortly.')}if(!response.ok||body.ok===false)throw Object.assign(Error(body.error||'Could not load campus data.'),{status:response.status});return body.data??body;}
function validateCampus(data){if(data.repository!=='layout-current'||!Number.isInteger(data.layoutYear)||typeof data.layoutRevision!=='string'||!data.layoutRevision||data.schemaVersion!==2||data.modelVersion!=='1.1.0'||!Array.isArray(data.venues)||!Array.isArray(data.classes)||!Array.isArray(data.groups))throw Error('Campus response is incompatible. Update the backend first.');const seen=new Set();data.venues.forEach(v=>{if(typeof v.unitNumber!=='string'||seen.has(v.unitNumber)||!Array.isArray(v.allocations))throw Error('Venue data needs review');seen.add(v.unitNumber)});return data;}
let campusFailures=0,nextCampusRead=0,drawingFlight=null;
function loadDrawing(){if(baseSVG)return Promise.resolve(baseSVG);if(!drawingFlight)drawingFlight=(async()=>{try{const response=await (window.GSISfetch||fetch)('campus-base.svg');if(!response.ok)throw Error('Campus drawing is unavailable.');return await response.text();}finally{drawingFlight=null;}})();return drawingFlight;}
async function refreshCampus(manual=false){if(loading||(!manual&&Date.now()<nextCampusRead))return;loading=true;if(manual||!campus)status('Loading Layout repository…',true);$('refresh').disabled=true;
 try{const [data,drawing]=await Promise.all([request('/api/public/campus?'+new URLSearchParams({...(!manual&&campus?.cursor?{since:campus.cursor}:{}),...(requestedYear?{year:requestedYear}:{})})),loadDrawing()]);const next=data.unchanged?{...campus,handoff:data.handoff}:validateCampus(data.delta?GSISFields.apply(campus,data.changes):data);
  const changed=!campus||next.layoutRevision!==campus.layoutRevision;
  // Commit one coherent snapshot only after both data and drawing are ready.
  campus=next;baseSVG=drawing;campusFailures=0;nextCampusRead=0;
  if(selectedUnit&&!campus.venues.some(r=>r.unitNumber===selectedUnit))selectedUnit='';
  if(changed||!$('map').querySelector('svg')){renderMap();renderSearch();renderSelected();renderTG();connectModel();}
  const time=new Date().toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit'});status('Layout '+campus.layoutYear+' · '+(campus.publication?'published copy':'source import')+' · checked '+time+(campus.handoff?.status==='pending'?' · publication transfer pending; showing verified copy':''));$('caption').textContent='Layout '+campus.layoutYear+' · '+campus.layoutRevision+(campus.publication?' · Deploy '+campus.publication.name+' r'+campus.publication.revision:' · initial source import');
 }catch(e){campusFailures++;nextCampusRead=Date.now()+Math.min(60000,15000*2**Math.min(campusFailures,2));status((campus?'Showing last loaded campus. ':'')+e.message);if(!$('map').querySelector('svg')){$('map').textContent='Campus data could not be loaded. Use Refresh to retry.';$('map').removeAttribute('aria-busy');}}
 finally{loading=false;$('refresh').disabled=false;}
}

function renderMap(){
 if(!ownedCampus()){$('map').textContent='No verified Layout snapshot is available.';$('map').removeAttribute('aria-busy');$('print').disabled=true;$('excel').disabled=true;return;}
 $('map').innerHTML=baseSVG;$('map').removeAttribute('aria-busy');const svg=$('map').querySelector('svg');if(!svg)return;
 svg.setAttribute('role','group');svg.setAttribute('aria-label','Layout repository campus layout');
 const mapped=new Set(CAMPUS_ROOMS.map(p=>campus.venues.find(r=>(r.geometryUnit||r.unitNumber)===p.id)?.unitNumber).filter(Boolean));
 window.GSISrenderLayout(svg,{positions:CAMPUS_ROOMS,rooms:campus.venues.map(r=>{const home=r.allocations.find(a=>a.kind==='homeroom'),group=r.allocations.find(a=>a.kind==='teaching_group');return {id:r.unitNumber,geometry:r.geometryUnit,name:r.name,shortName:r.shortName,form:r.allocations.filter(a=>a.kind==='homeroom').map(a=>a.label).join(', '),groups:r.allocations.filter(a=>a.kind==='teaching_group').map(a=>a.label),level:campus.classes.find(c=>c.id===home?.targetId)?.level||campus.groups.find(g=>g.id===group?.targetId)?.level}}),title:'CLASSROOM LAYOUT · '+campus.layoutYear,date:new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),colors,onSelect:selectUnit,version:campus.layoutRevision});
 const missing=campus.venues.filter(r=>!mapped.has(r.unitNumber));$('unmapped').hidden=!missing.length;const list=$('unmapped').querySelector('div');list.replaceChildren(...missing.map(r=>button(r.unitNumber+' · '+venueLabel(r),()=>selectUnit(r.unitNumber))));
 $('print').disabled=!ownedCampus();$('excel').disabled=!ownedCampus();applyZoom();highlight();
}
function applyZoom(){$('map').style.width=100*scale+'%';$('map').style.maxWidth=1100*scale+'px';}
function renderSearch(){const q=$('search').value.trim().toLowerCase(),results=$('results');results.replaceChildren();results.hidden=view==='tg'||!q;$('clearSearch').hidden=!q;if(!q||!campus||view==='tg')return;
 const matches=[];campus.venues.filter(r=>[r.unitNumber,r.name,r.shortName].some(x=>String(x).toLowerCase().includes(q))).forEach(r=>matches.push({label:r.unitNumber+' · '+venueLabel(r),units:[r.unitNumber]}));
 campus.classes.filter(c=>[c.code||c.id,c.name,'P'+c.level+' '+c.name].some(x=>x.toLowerCase().includes(q))).forEach(c=>matches.push({label:(c.code||c.id)+' · '+c.name,units:c.units}));
 campus.groups.filter(g=>[g.name,g.subject].some(x=>String(x).toLowerCase().includes(q))).forEach(g=>matches.push({label:g.name+' · '+g.subject,units:g.units}));
 if(!matches.length)results.textContent='No matching unit, class or teaching group.';
 for(const item of matches.slice(0,100)){if(!item.units.length){const span=document.createElement('span');span.textContent=item.label+' — venue unassigned';results.append(span);}else for(const unit of item.units)results.append(button(item.label+' → '+unit,()=>selectUnit(unit)));}
 if(matches.length>100)results.append(document.createTextNode('Refine your search to see more specific results.'));
}
function highlight(){document.querySelectorAll('[data-unit]').forEach(g=>g.querySelector('.room-hit')?.classList.toggle('selected',g.dataset.unit===selectedUnit));}
function selectUnit(unit,fromModel=false){selectedUnit=unit;renderSelected();highlight();if(view==='model'&&!fromModel){const result=$('model').contentWindow?.GSIS_LANDMARK?.selectUnit(unit);if(result&&(!result.selected||!result.located))$('modelState').textContent=unit+' has no confirmed 3D position.';}else if(view==='layout'){const node=[...document.querySelectorAll('[data-unit]')].find(g=>g.dataset.unit===unit);if(node)node.scrollIntoView?.({block:'center',behavior:'smooth'});else status(unit+' is listed, but has no confirmed 2D boundary.');}}
function canEdit(){return user?.roles?.some(r=>r==='Admin'||r==='KP');}
function renderSelected(){const room=campus?.venues.find(r=>r.unitNumber===selectedUnit);$('selection').hidden=view==='tg'||!room;$('editUnit').hidden=!room||!canEdit();if(!room)return;const d=$('unitDetails');d.replaceChildren();const title=document.createElement('strong');title.textContent=room.unitNumber+' · '+venueLabel(room);const p=document.createElement('p');p.textContent=room.allocations.length?room.allocations.map(a=>(a.kind==='homeroom'?'Form class: ':'TG: ')+a.label).join(' · '):'No class or TG is allocated to this unit.';d.append(title,p);}
const tgLevels=g=>(Array.isArray(g.levels)?g.levels:[g.level]).map(String);
const tgLevelLabel=g=>tgLevels(g).map(l=>'P'+l).join(', ');
const tgNormal=x=>String(x??'').toLowerCase().replace(/\s+/g,' ').trim();
function tgFields(g,issues=(campus.reviews||[]).filter(r=>r.target===g.code),breakdown=Object.entries(g.breakdown||{}).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}))){
 const source=g.publication?'Deploy '+g.publication.name+' r'+g.publication.revision:g.sourceLocator;
 return {code:g.code,level:tgLevelLabel(g),subject:[g.subject,g.programmes].filter(Boolean).join(' '),teacher:g.teacherLabels,
  pupils:g.pupilCountText||(g.pupilCount??''),form:breakdown.filter(([,count])=>Number(count)!==0).map(([form,count])=>form+': '+count).join(' · '),
  venue:g.units.length?g.units.join(', '):'Unassigned',review:[g.notes,...issues.map(r=>r.kind+': '+r.sourceValue+' / '+r.referenceValue),source,g.sourceVenueText].filter(Boolean).join('\n')};
}
function renderTG(){
 if(!ownedCampus())return;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 for(const [id,key,label] of [['tgLevel','level','levels'],['tgSubject','subject','subjects']]){const input=$(id),selected=input.value,values=[...new Set(campus.groups.flatMap(g=>key==='level'?tgLevels(g):[g[key]]))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));input.innerHTML='<option value="">All '+label+'</option>'+values.map(v=>'<option value="'+esc(v)+'">'+(key==='level'?'P':'')+esc(v)+'</option>').join('');if(values.includes(selected))input.value=selected;}
 const mtlSource=campus.sources.find(s=>s.id==='mtl_allocation_'+campus.layoutYear);
 $('tgSource').textContent='Layout '+campus.layoutYear+' · '+campus.layoutRevision+(mtlSource?' · MTL source updated '+mtlSource.contentDate:'')+' · '+campus.otherTGStatus;
 const groups=campus.groups.slice().sort((a,b)=>Number(!a.sourceId.startsWith('mtl_allocation_'))-Number(!b.sourceId.startsWith('mtl_allocation_'))||a.level.localeCompare(b.level,undefined,{numeric:true})||a.code.localeCompare(b.code,undefined,{numeric:true}));
 const searchFields=[];
 $('tgRows').innerHTML=groups.map(g=>{
  const issues=(campus.reviews||[]).filter(r=>r.target===g.code),entries=Object.entries(g.breakdown||{}).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}));
  searchFields.push(tgFields(g,issues,entries));
  const shown=entries.filter(([,count])=>$('tgShowZero').checked||Number(count)!==0);
  const breakdown=shown.map(([form,count])=>'<span class="tg-form-count">'+esc(form)+': <strong>'+esc(count)+'</strong></span>').join(' ');
  const fullBreakdown=entries.map(([form,count])=>form+': '+count).join('\n');
  const countRows=g.countRows.length>1?'<details><summary>Source count rows</summary>'+g.countRows.map(r=>'<p>'+esc(r.countText)+' · '+esc(r.sourceLocator)+'</p>').join('')+'</details>':'';
  return '<tr data-tg-id="'+esc(g.id)+'"><td>'+esc(g.code)+'</td><td>'+esc(tgLevelLabel(g))+'</td><td>'+esc(g.subject)+(g.programmes?'<br>'+esc(g.programmes):'')+'</td><td class="source-text">'+esc(g.teacherLabels)+'</td><td>'+esc(g.pupilCountText||(g.pupilCount??''))+countRows+'</td><td class="tg-breakdown" data-export-value="'+esc(fullBreakdown)+'">'+(breakdown||(entries.length?'No nonzero counts':''))+'</td><td data-export-value="'+esc(g.units.length?g.units.join(', '):'Unassigned')+'">'+g.units.map(u=>'<button data-tg-unit="'+esc(u)+'">'+esc(u)+'</button>').join(' ')+(g.units.length?'':'Unassigned')+'</td><td class="source-text">'+esc([g.notes,...issues.map(r=>r.kind+': '+r.sourceValue+' / '+r.referenceValue)].filter(Boolean).join('\n'))+'<details><summary>Source</summary><p>'+esc(g.publication?'Deploy '+g.publication.name+' r'+g.publication.revision:g.sourceLocator)+'</p>'+(g.sourceVenueText?'<p>Original venue: '+esc(g.sourceVenueText)+'</p>':'')+(g.weeklyPeriods!=null?'<p>'+esc(g.weeklyPeriods)+' periods/week</p>':'')+'</details></td></tr>';
 }).join('');
 // Search reuses these rows until the snapshot or zero-count display changes.
 tgSearchRows=[...$('tgRows').rows].map((row,i)=>({row,levels:tgLevels(groups[i]),subject:groups[i].subject,fields:Object.fromEntries(Object.entries(searchFields[i]).map(([key,value])=>[key,tgNormal(value)])),text:tgNormal(Object.values(searchFields[i]).join(' '))}));
 $('tgReviewRows').replaceChildren(...(campus.reviews||[]).map(r=>{const p=document.createElement('p');p.textContent=r.target+' · '+r.kind+' · '+r.sourceValue+' / '+r.referenceValue+' · '+r.action;return p;}));
 $('tgRows').querySelectorAll('[data-tg-unit]').forEach(b=>b.onclick=()=>{setView('layout');selectUnit(b.dataset.tgUnit);});
 window.GSISTableTools?.enhance($('tgView'));
 const tools=$('tgView').querySelector('.gsis-table-tools');if(tools&&tools.parentElement!==$('tgActions'))$('tgActions').append(tools);
 filterTG();
}
let tgSearchRows=[];
function filterTG(){
 const query=tgNormal($('tgSearch').value),level=$('tgLevel').value,subject=$('tgSubject').value;
 const filters=[...document.querySelectorAll('[data-tg-filter]')].map(input=>[input.dataset.tgFilter,tgNormal(input.value)]).filter(([,value])=>value);
 let count=0;for(const item of tgSearchRows){const visible=(!level||item.levels.includes(level))&&(!subject||item.subject===subject)&&(!query||item.text.includes(query))&&filters.every(([key,value])=>item.fields[key].includes(value));item.row.hidden=!visible;if(visible)count++;}
 $('tgCount').textContent=count+' of '+tgSearchRows.length+' TGs';$('tgEmpty').hidden=count>0;
 $('tgClearFilters').disabled=!query&&!level&&!subject&&!filters.length;
}
for(const id of ['tgLevel','tgSubject'])$(id).onchange=filterTG;$('tgSearch').oninput=filterTG;
document.querySelectorAll('[data-tg-filter]').forEach(input=>input.oninput=filterTG);
$('tgShowZero').onchange=renderTG;
$('tgClearFilters').onclick=()=>{for(const id of ['tgLevel','tgSubject','tgSearch'])$(id).value='';document.querySelectorAll('[data-tg-filter]').forEach(input=>input.value='');filterTG();$('tgSearch').focus();};
function sizeModelViewport(){const frame=$('model').closest('.campus-frame');if(view!=='model'||frame.classList.contains('campus-expanded')||document.body.classList.contains('campus-popout'))return;frame.style.height=Math.max(320,innerHeight-frame.getBoundingClientRect().top-8)+'px';}
function setView(next){view=next;document.body.dataset.campusView=next;$('campusToolbar').hidden=next==='tg';for(const id of ['modelNote','modelState','modelTools'])$(id).hidden=next!=='model';$('print').hidden=next!=='layout';$('excel').hidden=next!=='layout';$('layoutView').hidden=next!=='layout';$('modelView').hidden=next!=='model';$('tgView').hidden=next!=='tg';for(const [id,key] of [['layoutTab','layout'],['modelTab','model'],['tgTab','tg']]){$(id).classList.toggle('active',next===key);if(next===key)$(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current');}renderSearch();renderSelected();if(next==='tg')renderTG();window.GSISTableRefresh?.();if(next==='model'&&!$('model').getAttribute('src')){$('modelState').textContent='Loading 3D campus…';$('model').src=$('model').dataset.src;}if(next==='model'&&modelReady&&selectedUnit)selectUnit(selectedUnit);sizeModelViewport();}
function connectModel(){const bridge=$('model').contentWindow?.GSIS_LANDMARK;if(!modelReady||!bridge)return;if(!ownedCampus()){bridge.disconnect();bridge.setUnits([]);$('modelState').textContent='No verified Layout snapshot is available.';return;}bridge.setUnits(campus.venues);bridge.connect({layoutRevision:campus.layoutRevision,publicationVersionId:campus.deploymentVersionId,lookupUnit:async({unitNumber,versionId,signal})=>{if(signal.aborted)throw new DOMException('Superseded','AbortError');if(versionId!==campus.layoutRevision)throw Error('Layout revision changed. Search again.');const room=campus.venues.find(r=>r.unitNumber===unitNumber);if(!room)throw Error('Unit is not in this Layout snapshot.');return {schemaVersion:2,modelVersion:'1.1.0',unitNumber,registryRevision:campus.registryRevision,layoutRevision:campus.layoutRevision,deploymentVersionId:campus.deploymentVersionId,deploymentRevision:campus.deploymentRevision,venue:room,allocations:room.allocations,warnings:[]};}});if(selectedUnit)bridge.selectUnit(selectedUnit);}
$('model').onload=()=>{modelReady=!!$('model').contentWindow?.GSIS_LANDMARK;$('modelState').textContent=modelReady?'Select a room or search above.':'3D model could not start. Check that WebGL is available in your browser.';if(!modelReady)return;const d=$('model').contentDocument;d.addEventListener('landmark:select',e=>{if(e.detail.unitNumber)selectUnit(e.detail.unitNumber,true)});d.addEventListener('landmark:unit-error',e=>$('modelState').textContent=e.detail.message);connectModel();};
function renderUser(){window.setGSISViewport?.('layout',user?.roles||[]);$('identity').textContent=user?user.email+(user.roles.length?' · '+user.roles.join('+'):''):'';$('login').hidden=!!user;$('signout').hidden=!user;if(user)$('googleSignIn').hidden=true;renderSelected();}
async function profile(){const result=await request('/api/profile',{});user=result.user;renderUser();return result;}
async function restoreSession(){try{await request('/api/session');await profile()}catch{user=null;renderUser();}}
async function startLogin(){if($('googleSignIn').childElementCount){$('googleSignIn').hidden=false;return;}status('Opening school sign-in…',true);$('login').disabled=true;try{config||=await request('/api/config');if(!config.clientId)throw Error('School sign-in is not configured. Public viewing remains available.');if(!window.google?.accounts?.id)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';const timer=setTimeout(()=>reject(Error('Sign-in took too long. Try again.')),12000);script.onload=()=>{clearTimeout(timer);resolve()};script.onerror=()=>{clearTimeout(timer);reject(Error('Could not open Google sign-in.'))};document.head.append(script)});
 google.accounts.id.initialize({client_id:config.clientId,hd:'gsps.edu.sg',callback:async response=>{status('Checking your school access…',true);try{const r=await fetch('/api/session',{method:'POST',headers:{Authorization:'Bearer '+response.credential},credentials:'same-origin',signal:AbortSignal.timeout(15000)});const body=await r.json();if(!r.ok)throw Error(body.error||'Sign-in failed.');await profile();status(canEdit()?'Signed in · edit venues in Deploy, then republish.':'Signed in · public read-only campus.');}catch(e){status(e.message);}}});$('googleSignIn').hidden=false;google.accounts.id.renderButton($('googleSignIn'),{theme:'outline',size:'medium'});status('Choose your school Google account.');
 }catch(e){status(e.message);}finally{$('login').disabled=false;}}
function printMap(){if(!ownedCampus()||!$('map').querySelector('svg'))return;const frame=document.createElement('iframe');frame.className='print-frame';document.body.append(frame);const d=frame.contentDocument;d.open();d.write('<!doctype html><html><head><title>GSiS Layout campus</title><style>@page{size:A4 portrait;margin:0}body{margin:0}svg{display:block;width:210mm;height:297mm}.room-hit{display:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>'+ $('map').querySelector('svg').outerHTML+'</body></html>');d.close();frame.contentWindow.onafterprint=()=>frame.remove();setTimeout(()=>{frame.contentWindow.focus();frame.contentWindow.print()},150);}
$('layoutTab').onclick=()=>setView('layout');$('modelTab').onclick=()=>setView('model');$('tgTab').onclick=()=>setView('tg');$('search').oninput=renderSearch;$('clearSearch').onclick=()=>{$('search').value='';renderSearch();$('search').focus()};$('refresh').onclick=()=>refreshCampus(true);$('zoomOut').onclick=()=>{scale=Math.max(.5,scale-.25);applyZoom()};$('zoomIn').onclick=()=>{scale=Math.min(3,scale+.25);applyZoom()};$('fit').onclick=()=>{scale=1;applyZoom()};$('login').onclick=startLogin;$('print').onclick=printMap;
$('signout').onclick=async()=>{try{await request('/api/logout',{});user=null;$('googleSignIn').replaceChildren();$('googleSignIn').hidden=true;$('resumePanel').hidden=true;renderUser();status('Signed out · public campus remains available.');}catch(e){status(e.message)}};
let campusPollTimer;function scheduleCampusPoll(){clearTimeout(campusPollTimer);campusPollTimer=setTimeout(async()=>{if(!document.hidden)await refreshCampus();scheduleCampusPoll();},60000+Math.floor(Math.random()*15001));}
refreshCampus();restoreSession();scheduleCampusPoll();document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshCampus();scheduleCampusPoll();}});window.addEventListener('online',()=>refreshCampus(true));

window.installCampusWindow?.($('model'),{title:'',toolsHost:$('modelTools'),popoutUrl:()=>{const u=new URL(location.href);u.searchParams.set('view','campus');u.searchParams.set('window','1');if(selectedUnit)u.searchParams.set('unit',selectedUnit);return u.href}});
const campusParams=new URLSearchParams(location.search);if(campusParams.get('unit'))selectedUnit=campusParams.get('unit');if(campusParams.get('view')==='campus')setView('model');else if(campusParams.get('view')==='tg')setView('tg');

// Size the model from the actual compact toolbar, including wrapped notices/results.

window.addEventListener('resize',sizeModelViewport);
if(window.ResizeObserver){const modelLayoutObserver=new ResizeObserver(sizeModelViewport);for(const node of document.querySelectorAll('header,nav,.statusbar,.campus-toolbar,#selection,#results,#resumePanel'))modelLayoutObserver.observe(node);}
sizeModelViewport();

$('excel').onclick=async()=>{const button=$('excel');button.disabled=true;try{await window.GSISLayoutExcel.download($('map').querySelector('svg'))}catch(e){status(e.message)}finally{button.disabled=!ownedCampus()}};
