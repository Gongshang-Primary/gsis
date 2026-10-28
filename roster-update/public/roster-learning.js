/* Read-only guidance uses the effective rules returned by the authenticated backend. */
window.RosterLearningUI=(()=>{
 'use strict';
 let ticket=0;
 const auditUrl='https://drive.google.com/drive/u/0/folders/1imeTP73ZowWLIAWZPP_fsh7_8SbRKqZI';
 const promptTemplate="My school uses a rules-based automatic relief allocator. The allocator is not AI-powered. It applies the supplied business rules in their stated priority order. Identify the allocation date and run. Walk through the relevant rules in the actual recorded order. Distinguish hard limits, preferences and tie-breaks where the evidence establishes them.\n\nExplain why a teacher was selected, or an alternative excluded, only when supported by the log. Separate automatic decisions from manual SMC choices and peer arrangements. Quote short supporting log entries. Do not invent rules or reasons. The business rules in-effect are currently:\n\nUsing the above business rules and attached verbose allocation log, explain in simple English:\n\n[MY QUESTION — for example: Why was I assigned these relief periods?]";
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const label=x=>String(x).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
 const value=x=>typeof x==='boolean'?(x?'On':'Off'):x===null?'Not configured':typeof x==='object'?JSON.stringify(x,null,2):String(x);
 const updatedStamp=value=>{const when=new Date(value);return Number.isFinite(when.getTime())?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',dateStyle:'medium',timeStyle:'short',hourCycle:'h23'}).format(when)+' SGT':'Unavailable';};
 function unmount(){ticket++;window.RosterCalculationsUI?.unmount();}
 function prompt(learning){return promptTemplate.replace('currently:\n\nUsing','currently:\n\n'+JSON.stringify(learning,null,2)+'\n\nUsing');}
 async function render(context){
  const run=++ticket,host=context.container,current=()=>run===ticket&&host.isConnected;
  host.innerHTML='<div class="allocation-learning"><h2>Learn about Auto Allocation</h2><ol class="allocation-learning-sections"><li><div data-learning-calculations></div></li><li><section aria-labelledby="learningRulesTitle"><h2 id="learningRulesTitle">Business Rules</h2><p>These are the current effective business rules used by the automatic relief allocator.</p><div data-learning-rules role="status">Loading current business rules…</div></section></li><li><section aria-labelledby="learningLogTitle"><h2 id="learningLogTitle">Understand an allocation log</h2><p>Open the <a href="'+auditUrl+'" target="_blank" rel="noopener">verbose allocation audit folder</a>, attach the relevant allocation log to your AI tool, and copy the prompt below. Add your question before sending it.</p><label for="allocationExplanationPrompt">Explanation prompt with current business rules</label><textarea id="allocationExplanationPrompt" data-learning-prompt readonly rows="12" spellcheck="false" aria-describedby="learningPromptStatus"></textarea><button type="button" data-copy-learning-prompt disabled>Copy prompt</button><p id="learningPromptStatus" data-learning-prompt-status role="status">The prompt will be available when the actual current rules have loaded.</p></section></li></ol></div>';
  const calculations=window.RosterCalculationsUI.render({...context,container:host.querySelector('[data-learning-calculations]')});
  const rulesHost=host.querySelector('[data-learning-rules]'),promptBox=host.querySelector('[data-learning-prompt]'),copy=host.querySelector('[data-copy-learning-prompt]'),promptStatus=host.querySelector('[data-learning-prompt-status]');
  async function loadRules(){
   rulesHost.setAttribute('aria-busy','true');copy.disabled=true;promptBox.value='';promptStatus.textContent='The prompt will be available when the actual current rules have loaded.';
   try{
    const data=await context.api('operations',{operation:'read',view:'allocationLearning'});if(!current())return;
    const learning=data?.learning;if(!learning||!learning.config||typeof learning.config!=='object'||Array.isArray(learning.config)||!Array.isArray(learning.appliedRuleOrder))throw Error('Current business rules are unavailable.');
    rulesHost.innerHTML='<p class="calculation-caption">Configuration revision '+esc(learning.revision)+(learning.updatedAt?' · Updated '+esc(updatedStamp(learning.updatedAt)):'')+'</p><h3>Preference order</h3><ol class="allocation-rule-order">'+learning.appliedRuleOrder.map(rule=>'<li><strong>'+esc(rule.label||rule.id)+'</strong> <span class="ops-badge">'+(rule.enabled===false?'Off':'On')+'</span><p>'+esc(rule.description||'')+'</p></li>').join('')+'</ol><h3>Effective settings</h3><dl class="allocation-rule-settings">'+Object.entries(learning.config).map(([key,setting])=>'<dt>'+esc(label(key))+'</dt><dd><pre>'+esc(value(setting))+'</pre></dd>').join('')+'</dl>';
    promptBox.value=prompt(learning);copy.disabled=false;promptStatus.textContent='The prompt includes the actual rules shown above.';
   }catch(error){if(!current()||error.stale)return;rulesHost.innerHTML='<p role="alert">'+esc(error.message||'Current business rules are unavailable.')+'</p><button type="button" data-retry-learning-rules>Retry rules</button>';rulesHost.querySelector('button').onclick=loadRules;promptStatus.textContent='Current business rules could not load. Retry rules to prepare the prompt.';}
   finally{if(current())rulesHost.setAttribute('aria-busy','false');}
  }
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(promptBox.value);if(current())promptStatus.textContent='Prompt copied.';}catch{if(current()){promptBox.focus();promptBox.select();promptStatus.textContent='Select and copy the prompt above.';}}};
  await Promise.all([calculations,loadRules()]);
 }
 return {render,unmount};
})();
