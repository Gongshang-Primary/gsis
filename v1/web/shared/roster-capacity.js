/* The server uses the same layered eligibility as allocation. This renderer
 * never derives quota or authority from names, tags or browser calculations. */
(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(s, h) {
    if (!h) return '<p role="status">Relief capacity is not verified. Refresh records.</p>';
    const unknown = h.incomplete || h.verified === false, names = new Map((s.data?.people || []).map(p => [p.id,p.name]));
    const shown = new Set(h.visiblePeriods || h.periods.map(p => p.period));
    const columns = h.periods.filter(p => shown.has(p.period)).map(p => {
      const current = new Set(unknown ? [] : p.green), baseline = new Set(unknown ? [] : p.potentialStaffIds || []);
      const rows = [...new Set([...current,...baseline])].map(id => '<span class="v1-capacity-choice '+(current.has(id)?'available':'baseline')+'" title="'+esc((names.get(id)||id)+' · '+(current.has(id)?'Eligible now for one period':'Baseline only; unavailable now'))+'">'+esc(names.get(id)||id)+'</span>').join('');
      return '<section data-health-period="'+p.period+'"><strong>P'+p.period+'</strong><small>'+esc(p.start||'')+'–'+esc(p.end||'')+'</small><b>'+(unknown?'Not verified':current.size+' eligible now')+'</b><div>'+rows+'</div></section>';
    }).join('');
    return '<section class="v1-capacity" aria-label="Relief capacity"><h3>Relief capacity</h3><p>Saved assignments and current allocation rules. Unsaved edits are excluded.</p><p>'+(unknown?esc(h.reason||'Capacity is not verified. Unknown is not zero.') : esc(h.note))+'</p><p>Green: eligible now. Faint: baseline only. Updated '+esc(new Date(h.observedAt).toLocaleString('en-SG',{timeZone:'Asia/Singapore'}))+' (SGT).</p><div class="v1-capacity-periods" tabindex="0">'+columns+'</div><details><summary>Remaining-week cover outlook</summary><p>Projects known absences using remaining R, saved duties and the same allocation rules. This does not allocate relief or activate external staff.</p><button type="button" data-capacity-forecast="'+esc(s.date||h.date)+'">Check remaining week</button><div data-capacity-result role="status"></div></details></section>';
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-capacity-forecast]');
    if (!button) return;
    const host = button.parentElement.querySelector('[data-capacity-result]');
    button.disabled = true; host.textContent = 'Checking current evidence…';
    try {
      const result = await window.GSISV1.request('roster','/operations',{method:'POST',body:{operation:'capacityForecast',date:button.dataset.capacityForecast}});
      if (!host.isConnected) return;
      host.innerHTML = '<p>'+esc(result.note)+'</p><p>As of '+esc(new Date(result.observedAt).toLocaleString('en-SG',{timeZone:'Asia/Singapore'}))+' (SGT). Refresh after changes.</p><div class="gsis-scroll"><table><thead><tr><th>Date</th><th>Evidence</th><th>New cover found</th><th>Uncovered periods</th><th>Eligible choices before projection</th></tr></thead><tbody>'+result.days.map(d => '<tr><td>'+esc(d.date)+'</td><td>'+esc(d.state)+'</td><td>'+esc(d.planned??'—')+'</td><td>'+esc(d.unresolved?.length??'—')+'</td><td>'+esc(d.reserve?.periods.map(p=>'P'+p.period+': '+p.green.length).join('; ')||d.reason||'—')+'</td></tr>').join('')+'</tbody></table></div><p>Uncovered periods are a reason to review external relief needs, not a proven minimum number of external teachers.</p>';
    } catch (error) { if (host.isConnected) host.textContent = 'Forecast not verified: '+error.message; }
    finally {button.disabled=false;}
  });
  window.GSISV1RosterCapacity = {render};
})();
