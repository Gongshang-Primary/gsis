window.installCampusWindow=function(frame,{title='3D Campus',popoutUrl,toolsHost}={}){
 const document=frame.ownerDocument;
 const box=frame.closest('.campus-frame');if(!box||box.dataset.tools)return;box.dataset.tools='ready';
 const bar=document.createElement('div');bar.className='campus-frame-tools';bar.setAttribute('aria-label','3D viewing controls');
 const name=document.createElement('span');name.textContent=title;name.hidden=!title;const full=document.createElement('button');full.type='button';full.textContent='Full window';full.setAttribute('aria-pressed','false');
 const pop=document.createElement('button');pop.type='button';pop.textContent='Pop out ↗';bar.append(name,full,pop);if(toolsHost)toolsHost.append(bar);else box.prepend(bar);
 let scrollX=0,scrollY=0,priorOverflow='';
 function expand(on){if(on===box.classList.contains('campus-expanded'))return;if(on){scrollX=window.scrollX;scrollY=window.scrollY;priorOverflow=document.body.style.overflow;document.body.style.overflow='hidden'}else document.body.style.overflow=priorOverflow;
 box.classList.toggle('campus-expanded',on);if(toolsHost){if(on)box.prepend(bar);else toolsHost.append(bar);}full.textContent=on?'Return to page':'Full window';full.setAttribute('aria-pressed',String(on));if(!on){window.scrollTo(scrollX,scrollY);full.focus()}frame.contentWindow?.dispatchEvent(new Event('resize'));
 }
 full.onclick=()=>expand(!box.classList.contains('campus-expanded'));
 const escape=e=>{if(e.key==='Escape'&&box.classList.contains('campus-expanded')){e.preventDefault();expand(false)}};
 document.addEventListener('keydown',escape);frame.addEventListener('load',()=>{try{frame.contentDocument.addEventListener('keydown',escape)}catch{}});
 pop.onclick=()=>{const url=new URL(typeof popoutUrl==='function'?popoutUrl():popoutUrl||location.href,location.href);if(url.origin!==location.origin)return;const width=screen.availWidth||innerWidth,height=screen.availHeight||innerHeight;const opened=window.open(url.href,'gsis-campus-window','popup=yes,width='+width+',height='+height+',left=0,top=0');if(opened){opened.opener=null;opened.focus()}else{name.hidden=false;name.textContent='Pop-up blocked. Allow it, or use Full window.'}};
 const observer=new MutationObserver(()=>{if(!frame.isConnected){expand(false);document.removeEventListener('keydown',escape);bar.remove();observer.disconnect()}});observer.observe(document.body,{childList:true,subtree:true});
 return {expand};
};
if(new URLSearchParams(location.search).get('window')==='1')document.body.classList.add('campus-popout');
