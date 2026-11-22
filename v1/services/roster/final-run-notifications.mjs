import Operations from '../../../shared/roster-operations.js';
import Allocation from '../../../shared/roster-allocation.js';

// Owner decision 21 Nov 2026 (W2): after the 06:29 final scheduled run on a
// school day, tell the duty SMC the outcome. Complete with uncovered periods ->
// relief_manual_review; complete with none -> relief_final. A run that did not
// complete keeps the shared smc_attention alert. One alert per date (key), so a
// replayed tick or the 06:30 tick does not resend.
export function finalRunComplete(s, d) {
  return (s.optimisationRuns || []).some(r => r.date === d && String(r.key || '').includes('T06:29') && r.status === 'complete');
}
export function uncoveredText(h) {
  const rows = (h.uncovered || []).map(u => 'P' + u.period + ' ' + String(u.className || u.groupName || u.name || '').trim()).map(t => t.trim());
  return rows.length + ' period' + (rows.length === 1 ? '' : 's') + ' remain uncovered: ' + rows.join(', ') + '.';
}
export function queueFinalRunOutcome(next, c, tick) {
  const slot = Allocation.schedule(tick), d = slot.date;
  if (![389, 390].includes(slot.minute) || c.days[d]?.schoolDay !== true || !finalRunComplete(next, d)) return null;
  const key = 'final-outcome:' + d;
  if (next.smcAlerts.some(a => a.key === key)) return null;
  const h = Allocation.health(next, c, d, Operations.demand(c, next, d));
  const absent = Operations.summaryAbsences(next, d).length,
    covered = Allocation.effectiveAssignments(next).filter(a => a.date === d && !a.noRelief).length,
    healthText = h.percentage === null ? 'No eligible capacity' : h.percentage.toFixed(1) + '%';
  if (h.uncovered.length) {
    const summary = uncoveredText(h);
    Operations.smcAlert(next, c, d, key, summary, true, 'smc_alert', {
      templateKey: 'relief_manual_review', finalRunOutcome: 'gaps', uncovered_periods_summary: summary,
    });
    return 'relief_manual_review';
  }
  const summary = absent + ' absent teacher' + (absent === 1 ? '' : 's') + '. ' + covered + ' periods have planned cover; 0 uncovered.';
  Operations.smcAlert(next, c, d, key, summary, true, 'smc_alert', {
    templateKey: 'relief_final', finalRunOutcome: 'covered', allocation_summary: summary,
    healthSummary: healthText, relief_health_summary: healthText,
  });
  return 'relief_final';
}
