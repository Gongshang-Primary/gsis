/* LORD v1.4: display-only prechecks; the backend remains authoritative. */
(function(root) {
  'use strict';
  function analyse(selection, context) {
    const periods = (context.periods || []).map(p => String(p.code));
    const indices = item => [periods.indexOf(String(item.startPeriod)), periods.indexOf(String(item.endPeriod))];
    const [start, end] = indices(selection);
    if (start < 0 || end < 0) return { available:false, conflictType:'ERROR', conflictSummary:'Choose valid periods.' };
    const low = Math.min(start,end), high = Math.max(start,end);
    let buffer = null;
    const rows = (context.bookings || []).concat((context.selections || []).filter(item => item !== selection));
    for (const row of rows) {
      if (context.excludeId && String(row.bookingId) === String(context.excludeId)) continue;
      if (row.status && !['BOOKED','COLLECTED'].includes(String(row.status).toUpperCase())) continue;
      if (row.date && String(row.date).slice(0,10) !== context.date) continue;
      if (String(row.resource) !== String(selection.resource)) continue;
      const [a,b] = indices(row);
      if (a < 0 || b < 0) continue;
      const rowLow = Math.min(a,b), rowHigh = Math.max(a,b);
      const conflictSummary = `${row.teacher || 'Another selection'} · ${row.classOrActivity || ''} · P${row.startPeriod} to P${row.endPeriod}`;
      if (Math.max(low,rowLow) <= Math.min(high,rowHigh)) return { available:false, conflictType:'OVERLAP', conflictSummary, overrideAllowed:false };
      if (rowHigh + 1 === low || high + 1 === rowLow) buffer = { available:false, conflictType:'BUFFER', conflictSummary, overrideAllowed:true };
    }
    return buffer || { available:true, conflictType:'', conflictSummary:'', overrideAllowed:false };
  }
  root.LordBookingRules = Object.freeze({ analyse });
})(globalThis);
