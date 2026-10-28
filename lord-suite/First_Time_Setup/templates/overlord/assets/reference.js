/* Shared booking reference contract. Keep the LORD and OVERLORD copies identical. */
(function (root) {
  'use strict';
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const enabled = ref => Boolean(ref && ref.referenceSource && ref.referenceSource.enabled);
  function groups(ref, type) {
    const catalog = ref && ref.referenceCatalog || {};
    return type === 'class' ? [
      {kind:'class', label:'Classes', items:catalog.classes || []},
      {kind:'teachingGroup', label:'Teaching groups', items:catalog.teachingGroups || []},
      {kind:'activity', label:'Local activities', items:catalog.activities || []}
    ] : [{kind:type, label:type === 'teacher' ? 'Staff' : 'Subjects', items:catalog[type === 'teacher' ? 'teachers' : 'subjects'] || []}];
  }
  const optionValue = (kind, id) => kind + ':' + String(id);
  const customKind = type => type === 'class' ? 'customActivity' : type === 'subject' ? 'customPurpose' : '';
  const customLimit = type => type === 'class' ? 160 : 120;
  function choice(ref, type, value) {
    for (const group of groups(ref, type)) {
      const item = group.items.find(item => optionValue(group.kind, item.id) === value);
      if (item) return {id:String(item.id), name:String(item.name), kind:group.kind};
    }
    return null;
  }
  function options(ref, type, value, saved, self) {
    const first = saved != null ? String(saved) + ' — saved booking' : self ? 'Myself (signed in)' : 'Choose ' + (type === 'class' ? 'a class, teaching group or activity' : type === 'teacher' ? 'a staff member' : 'a subject');
    return '<option value="">' + escape(first) + '</option>' + groups(ref,type).map(group => '<optgroup label="' + escape(group.label) + '">' + group.items.map(item => {
      const key = optionValue(group.kind,item.id);
      return '<option value="' + escape(key) + '"' + (key === value ? ' selected' : '') + '>' + escape(item.name) + '</option>';
    }).join('') + '</optgroup>').join('');
  }
  function field(id, label, ref, type, config = {}) {
    const labelHtml=config.bare ? '<span id="'+escape(id)+'Label">'+escape(label)+'</span>' : '<label id="'+escape(id)+'Label" for="'+escape(id)+'">'+escape(label)+'</label>';
    if (!customKind(type)) return labelHtml+'<select class="input" id="'+escape(id)+'">'+options(ref,type,config.value,config.saved,config.self)+'</select>';
    const item=choice(ref,type,config.value), value=config.value||'';
    const text=value===customKind(type)+':' ? config.custom||'' : item ? item.name : config.text != null ? config.text : config.saved||'';
    const hint=value===customKind(type)+':' ? 'Custom entry' : item ? 'Selected from shared choices' : config.saved != null ? 'Saved booking value' : 'Type a name or choose a suggestion.';
    const suggestions=groups(ref,type).flatMap(group=>group.items.map(item=>({kind:group.kind,group:group.label,item}))).map(({kind,group,item},index)=>'<button type="button" role="option" tabindex="-1" aria-selected="false" id="'+escape(id)+'Option'+index+'" data-reference-choice="'+escape(optionValue(kind,item.id))+'" data-reference-label="'+escape(item.name)+'"><span>'+escape(item.name)+'</span><small>'+escape(group)+'</small></button>').join('');
    return labelHtml+'<span class="reference-entry"><input class="input" id="'+escape(id)+'" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="'+escape(id)+'Choices" aria-labelledby="'+escape(id)+'Label" aria-describedby="'+escape(id)+'Hint" autocomplete="off" maxlength="'+customLimit(type)+'" data-reference-value="'+escape(value)+'" value="'+escape(text)+'" placeholder="Type or choose"><span class="reference-suggestions" id="'+escape(id)+'Choices" role="listbox" aria-labelledby="'+escape(id)+'Label" hidden>'+suggestions+'</span></span><small class="reference-hint" id="'+escape(id)+'Hint">'+hint+'</small>';
  }
  function read(id) {
    const input=document.getElementById(id);
    if (!input) return {value:'',custom:''};
    const value=input.dataset.referenceValue;
    return {value:value === undefined ? input.value : value,custom:value === undefined ? '' : input.value};
  }
  function selected(ref, type, value, saved, self, custom) {
    if (customKind(type) && value===customKind(type)+':') {
      const name=String(custom||'').trim();
      if (!name || name.length>customLimit(type) || /[\x00-\x1f]/.test(String(custom||''))) throw new Error('Enter '+(type==='class'?'an activity or student group name':'an activity or purpose')+' (up to '+customLimit(type)+' characters).');
      return {name,kind:customKind(type),custom:true};
    }
    if (!value && saved != null) return {name:saved};
    if (!value && self) return null;
    const item = choice(ref,type,value);
    if (!item) throw new Error('Choose a current ' + (type === 'class' ? 'class, teaching group or activity' : type === 'teacher' ? 'staff member' : 'subject') + ' from the shared lists.');
    return item;
  }
  function payload(ref, values, saved, custom = {}) {
    if (!enabled(ref)) return {};
    const key = ref.referenceSource.key;
    if (!key) throw new Error('Shared data is not ready. Ask an administrator to refresh it in OVERLORD Settings.');
    const result = {referenceKey:key};
    for (const [type, property] of [['class','classOrActivity'],['subject','subject'],['teacher','teacher']]) {
      if (values[type] === undefined) continue;
      const item = selected(ref,type,values[type],saved && saved[property],type === 'teacher' && !saved,custom[type]);
      if (!item) continue;
      result[property] = item.name;
      if (item.custom) {result[type==='class'?'classRef':'subjectRef']={kind:item.kind,name:item.name};continue;}
      if (!item.id) continue;
      if (type === 'class') result.classRef = {kind:item.kind,id:item.id};
      else if (type === 'subject') result.subjectId = item.id;
      else {result.teacherStaffId = item.id;result.bookingForTtbName = item.name;}
    }
    return result;
  }
  function bindField(id, type, changed) {
    const input=document.getElementById(id), list=document.getElementById(id+'Choices'), hint=document.getElementById(id+'Hint');
    if (!input || !list) return;
    const options=Array.from(list.querySelectorAll('[data-reference-choice]'));
    let active=-1;
    const visible=()=>options.filter(option=>!option.hidden);
    function close() {list.hidden=true;active=-1;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');options.forEach(option=>option.setAttribute('aria-selected','false'));}
    function show() {
      if(input.disabled)return;
      const query=input.value.trim().toLowerCase();
      options.forEach(option=>{option.hidden=!option.dataset.referenceLabel.toLowerCase().includes(query);option.setAttribute('aria-selected','false');});
      active=-1;input.removeAttribute('aria-activedescendant');list.hidden=!visible().length;input.setAttribute('aria-expanded',String(!list.hidden));
    }
    function choose(option) {
      if(input.disabled)return;
      input.value=option.dataset.referenceLabel;input.dataset.referenceValue=option.dataset.referenceChoice;
      hint.textContent='Selected from shared choices';input.focus();close();if(changed)changed();
    }
    input.addEventListener('input',()=>{input.dataset.referenceValue=customKind(type)+':';hint.textContent=input.value.trim()?'Custom entry':'Type a name or choose a suggestion.';show();if(changed)changed();});
    input.addEventListener('focus',show);
    input.addEventListener('click',show);
    input.addEventListener('blur',close);
    input.addEventListener('keydown',event=>{
      if(event.isComposing || input.disabled)return;
      if(event.key==='Escape'){if(!list.hidden){event.preventDefault();event.stopPropagation();}close();return;}
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();if(list.hidden)show();const rows=visible();if(!rows.length)return;
        active=(active+(event.key==='ArrowDown'?1:active<0?0:-1)+rows.length)%rows.length;
        options.forEach(option=>option.setAttribute('aria-selected',String(option===rows[active])));
        input.setAttribute('aria-activedescendant',rows[active].id);rows[active].scrollIntoView?.({block:'nearest'});
      }else if(event.key==='Enter'&&!list.hidden&&active>=0){event.preventDefault();choose(visible()[active]);}
    });
    // Keep input focus while the pointer chooses an option; keyboard focus stays
    // on the combobox and is represented by aria-activedescendant.
    list.addEventListener('mousedown',event=>{if(event.target.closest('[data-reference-choice]'))event.preventDefault();});
    list.addEventListener('click',event=>{const option=event.target.closest('[data-reference-choice]');if(option)choose(option);});
  }
  function status(ref) {
    if (!ref) return 'Shared data status unavailable';
    const source = ref.referenceSource;
    if (!source || !source.enabled) return 'Shared data · local LORD lists';
    const labels = {healthy:'GSiS copy checked',stale:'GSiS copy · check overdue',error:'GSiS check failed · last successful copy kept'};
    const parts = [labels[source.status] || 'GSiS copy · status unavailable'];
    if (!source.key) parts[0] = 'GSiS copy unavailable';
    const publication=source.publication || {};
    if (publication.name) parts.push(String(publication.name));
    if (publication.revision != null && publication.revision !== '') parts.push('revision ' + publication.revision);
    const timeText=value=>{const time=new Date(value);return value && Number.isFinite(time.getTime()) ? time.toLocaleString('en-SG',{timeZone:'Asia/Singapore',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';};
    const updated=timeText(source.updatedAt || publication.updatedAt), checked=timeText(source.lastCheckedAt);
    if (updated) parts.push('updated ' + updated);
    if (checked) parts.push('checked ' + checked);
    if (source.outsidePublishedPeriod) parts.push('Today is outside this publication’s date range' + (publication.from&&publication.to ? ' ('+publication.from+' to '+publication.to+')' : '') + '; this published copy is still in use');
    if (ref.referenceReadDelayed) parts.push('connection delayed; showing saved choices');
    return parts.join(' · ');
  }
  function statusHtml(ref) { return '<p class="help shared-reference-status" role="status">' + escape(status(ref)) + '</p>'; }
  const isReferenceError = error => /^GSIS_(REFERENCE_CHANGED|REFERENCE_INVALID|CONTACT_UNAVAILABLE|SYNC_UNAVAILABLE)$/.test(error && (error.referenceCode || error.code) || '');
  root.LordReference = {enabled,choice,options,field,payload,status,statusHtml,isReferenceError,optionValue,read,bindField};
})(globalThis);
