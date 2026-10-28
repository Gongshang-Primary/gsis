// Edit this single catalogue when a GSiS viewport is added; copy it to all three frontend packages.
window.GSIS_VIEWPORTS=[
 {id:'contacts',label:'Contacts',url:'https://gsps-gsis.pages.dev/'},
 {id:'deploy',label:'Deploy',url:'https://gsps-deploy.pages.dev/'},
 {id:'layout',label:'Layout',url:'https://gsps-layout.pages.dev/'}
];
window.setGSISViewport=function(active,roles=[]){document.querySelectorAll('[data-viewport-bar]').forEach(bar=>{
 const header=bar.closest('header,.topbar');bar.replaceChildren();
 let current=header?.querySelector('.active-viewport-title');if(!current){current=document.createElement('span');current.className='viewport-current active-viewport-title';bar.before(current)}
 current.textContent=window.GSIS_VIEWPORTS.find(v=>v.id===active)?.label||active;current.setAttribute('aria-current','page');
 if(header&&bar.parentElement!==header)header.querySelector('.spacer')?.before(bar);
 if(header){const anchor=header.querySelector('#user,.account,.identity');if(anchor)anchor.before(bar)}
})};
window.setGSISViewport(document.body.dataset.viewport||'contacts');
