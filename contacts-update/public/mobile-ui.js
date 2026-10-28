/* Mobile presentation reuses the existing Contacts filter and column state. */
window.GSISContactsMobile=(()=>{
 let api=null,mode='',trigger=null;
 const $=id=>document.getElementById(id),escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function close(){if(!$('mobilePanel').open)return;$('mobilePanel').close();}
 function render(){if(!api)return;const d=api.get();if(!d.state){close();return;}
  const count=d.filters.length+Object.values(d.dropdownFilters).filter(v=>v.length).length+d.columns.filter(([k])=>d.selectedColumns.includes(k)&&String(d.columnFilters[k]||'').trim()).length;
  $('mobileFilters').textContent='Filters'+(count?' ('+count+')':'');
  const active=document.querySelector('.navbar .nav-button.active');$('mobilePageName').textContent=active?.textContent||'Contacts';
  if(!$('mobilePanel').open)return;
  const body=$('mobilePanelBody'),scroll=body.scrollTop,focused=document.activeElement,focusKey=focused?.dataset.mobileText,position=focused?.selectionStart,end=focused?.selectionEnd;
  const expanded=new Set([...body.querySelectorAll('details[open]')].map(e=>e.dataset.mobileGroup));
  $('mobilePanelTitle').textContent=mode==='filters'?'Filters':mode==='columns'?'Columns':'Menu';
  if(mode==='menu'){
   const buttons=[...document.querySelectorAll('.navbar .nav-button')].filter(b=>!b.hidden&&!b.classList.contains('hidden'));
   body.innerHTML='<nav aria-label="Mobile workspace">'+buttons.map(b=>'<button data-mobile-page="'+escape(b.dataset.page)+'" aria-current="'+(b.classList.contains('active')?'page':'false')+'">'+escape(b.textContent)+'</button>').join('')+'</nav><hr><button data-mobile-action="exportExcel" '+($('exportExcel').disabled?'disabled':'')+'>Export contacts to Excel</button><button data-mobile-compact>Compact contact table</button>';
   body.querySelectorAll('[data-mobile-page]').forEach(b=>b.onclick=()=>{const target=document.querySelector('.navbar [data-page="'+b.dataset.mobilePage+'"]');close();target?.click();render()});
   body.querySelector('[data-mobile-action]').onclick=()=>{close();$('exportExcel').click()};
   body.querySelector('[data-mobile-compact]').onclick=()=>{close();document.querySelector('#contacts [data-compact]')?.click()};
  }else if(mode==='columns'){
   body.innerHTML='<div class="mobile-presets"><button data-mobile-preset="defaultColumns">Default</button><button data-mobile-preset="allColumns">All</button></div>'+d.columns.map(([key,label])=>'<label class="mobile-column"><input type="checkbox" data-mobile-column="'+key+'" '+(d.selectedColumns.includes(key)?'checked':'')+'> '+escape(label)+'</label>').join('');
   body.querySelectorAll('[data-mobile-preset]').forEach(b=>b.onclick=()=>{$(b.dataset.mobilePreset).click();render()});
   body.querySelectorAll('[data-mobile-column]').forEach(i=>i.onchange=()=>api.column(i.dataset.mobileColumn));
  }else{
   body.innerHTML='<button id="mobileClearFilters">Clear filters</button>'+d.columns.map(([key,label])=>{
    const chosen=d.dropdownFilters[key]||[],text=d.columnFilters[key]||'',isColumn=d.columns.some(([k])=>k===key),unavailable=!!d.deploymentFilters[key]&&!d.state.deploymentAvailable;
    return '<details data-mobile-group="'+key+'" '+(expanded.has(key)?'open':'')+'><summary>'+escape(label)+(chosen.length||text?' · active':'')+'</summary>'+(isColumn&&key!=='birthday'?'<label>Text filter<input type="search" data-mobile-text="'+key+'" value="'+escape(text)+'" '+(!d.selectedColumns.includes(key)?'disabled':'')+' aria-label="Filter '+escape(label)+' text"></label>'+(!d.selectedColumns.includes(key)?'<small>Enable this column in Columns to use its text filter.</small>':''):'')+(unavailable?'<p>Teaching information is loading or unavailable.</p>':'<div class="mobile-filter-values">'+api.options(key).map(([value,name])=>'<label><input type="checkbox" data-mobile-dropdown="'+key+'" value="'+escape(value)+'" '+(chosen.includes(value)?'checked':'')+'> '+escape(name)+'</label>').join('')+'</div>')+'</details>';
   }).join('');
   $('mobileClearFilters').onclick=()=>api.reset();
   body.querySelectorAll('[data-mobile-text]').forEach(i=>i.oninput=()=>api.text(i.dataset.mobileText,i.value));
   body.querySelectorAll('[data-mobile-dropdown]').forEach(i=>i.onchange=()=>{const key=i.dataset.mobileDropdown,values=[...(api.get().dropdownFilters[key]||[])];api.dropdown(key,i.checked?[...new Set([...values,i.value])]:values.filter(v=>v!==i.value))});
  }
  body.scrollTop=scroll;
  if(focusKey){const input=body.querySelector('[data-mobile-text="'+focusKey+'"]');input?.focus({preventScroll:true});if(position!==null&&input)input.setSelectionRange(position,end??position);}
 }
 function open(next,button){mode=next;trigger=button;document.querySelector('.column-menu')?.remove();$('mobilePanel').showModal();document.body.classList.add('mobile-panel-open');render();$('mobilePanelClose').focus();}
 function init(adapter){if(api)return;api=adapter;$('mobileMenu').onclick=e=>open('menu',e.currentTarget);$('mobileFilters').onclick=e=>open('filters',e.currentTarget);$('mobileColumns').onclick=e=>open('columns',e.currentTarget);$('mobilePanelClose').onclick=close;$('mobilePanel').addEventListener('close',()=>{document.body.classList.remove('mobile-panel-open');mode='';trigger?.focus({preventScroll:true});});
  window.matchMedia?.('(max-width:640px), (max-width:900px) and (max-height:500px)').addEventListener('change',e=>{if(!e.matches)close();window.GSISTableRefresh?.()});render();
 }
 return {init,render,close};
})();
