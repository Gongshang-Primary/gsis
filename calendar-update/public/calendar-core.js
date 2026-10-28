/* Shared by the browser and Apps Script. Keep these copies byte-identical.
 * No network, storage, timezone-sensitive parsing, or UI dependencies. */
function gspsCalendarCoreFactory() {
  'use strict';
  const EDIT_FIELDS = Object.freeze([
    'EventID','Year','Status','LaneID','ShiftSpan','OwnerTag','StaffTitle',
    'StaffDescription','Location','VenueID','EventType','StartDate','EndDate','StartTime',
    'EndTime','ParentEnabled','ParentTitle','ParentDescription'
  ]);
  const date = value => String(value || '').slice(0, 10);
  function dateNumber(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return NaN;
    const [y,m,d] = key.split('-').map(Number);
    const n = Date.UTC(y, m - 1, d);
    return new Date(n).toISOString().slice(0,10) === key ? n / 86400000 : NaN;
  }
  function shifted(key, days) {
    const n = dateNumber(key);
    if (!Number.isFinite(n)) throw new Error('A valid calendar date is required.');
    return new Date((n + days) * 86400000).toISOString().slice(0,10);
  }
  function parseDateSearch(raw, selectedYear) {
    const text = String(raw || '').trim();
    if (!text) return {status:'valid', kind:'all', year:Number(selectedYear)};
    const parts = text.split('/');
    let d, m, y = Number(selectedYear), kind;
    if (parts.length === 2 && /^\d{1,2}$/.test(parts[0]) && /^\d{4}$/.test(parts[1])) {
      m = Number(parts[0]); y = Number(parts[1]); kind = 'month';
    } else if (parts.length === 2 && parts.every(p => /^\d{1,2}$/.test(p))) {
      d = Number(parts[0]); m = Number(parts[1]); kind = 'day';
    } else if (parts.length === 3 && /^\d{1,2}$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1]) && /^\d{4}$/.test(parts[2])) {
      d = Number(parts[0]); m = Number(parts[1]); y = Number(parts[2]); kind = 'day';
    } else {
      return {status:'invalid', message:'Use DD/MM, MM/YYYY or DD/MM/YYYY. The last valid view is retained.'};
    }
    const key = `${y}-${String(m).padStart(2,'0')}-${String(d || 1).padStart(2,'0')}`;
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || (kind === 'day' && (d < 1 || d > 31)) || !Number.isFinite(dateNumber(key))) {
      return {status:'invalid', message:'Enter a real calendar date. The last valid view is retained.'};
    }
    return {status:'valid', kind, day:d, month:m, year:y, external:y !== Number(selectedYear)};
  }
  function dateMatches(key, filter) {
    if (!filter || filter.kind === 'all') return true;
    return Number(key.slice(0,4)) === filter.year && Number(key.slice(5,7)) === filter.month &&
      (filter.kind === 'month' || Number(key.slice(8,10)) === filter.day);
  }
  function editableCopy(source) {
    const out = {};
    EDIT_FIELDS.forEach(k => { out[k] = source[k] == null ? '' : source[k]; });
    return out;
  }
  function relocate(source, options) {
    const start = date(source.StartDate), end = date(source.EndDate || start);
    const anchor = date(options.anchorDate || start), target = date(options.targetDate);
    const year = Number(options.year), lane = options.lane;
    if (!source.EventID || !lane || !lane.LaneID) throw new Error('Source event or destination lane is missing.');
    if (Number(source.Year) !== year) throw new Error('Move / Copy must stay within the selected year.');
    const nums = [start,end,anchor,target].map(dateNumber);
    if (nums.some(n => !Number.isFinite(n)) || nums[1] < nums[0] || nums[2] < nums[0] || nums[2] > nums[1]) {
      throw new Error('The source date range or grabbed day is invalid. Refresh before trying again.');
    }
    const delta = nums[3] - nums[2];
    const newStart = shifted(start, delta), newEnd = shifted(end, delta);
    if ([newStart,newEnd].some(k => Number(k.slice(0,4)) !== year)) {
      throw new Error(`The complete event must remain within ${year}. Its date span will not be shortened.`);
    }
    const out = editableCopy(source);
    out.StartDate = newStart; out.EndDate = newEnd; out.LaneID = String(lane.LaneID);
    const supportsShift = /^(yes|true|1)$/i.test(String(lane.SupportsShift || ''));
    const shift = supportsShift ? String(options.shift || 'PM_I').toUpperCase() : 'NONE';
    if (supportsShift && !['PM_I','PM_II','BOTH'].includes(shift)) throw new Error('Choose a valid destination shift.');
    const sameLane = String(source.LaneID) === out.LaneID && String(source.ShiftSpan || 'NONE') === shift;
    out.ShiftSpan = shift;
    // The date span and the time mode are independent: TIMED may span days.
    // MULTI_DAY remains the existing representation for multi-day ALL-DAY events.
    const timedDestination = String(lane.DefaultEventType || 'ALL_DAY').toUpperCase() === 'TIMED';
    const preserveTimes = sameLane && String(source.EventType) === 'TIMED';
    if (preserveTimes || timedDestination) {
      out.EventType = 'TIMED';
      out.StartTime = preserveTimes ? String(source.StartTime || '') : String(options.defaultStart || '');
      out.EndTime = preserveTimes ? String(source.EndTime || '') : String(options.defaultEnd || '');
      if (![out.StartTime,out.EndTime].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || ((newStart === newEnd || !preserveTimes) && out.EndTime <= out.StartTime)) {
        throw new Error('The destination lane needs valid default start/end times under Columns.');
      }
    } else {
      out.EventType = newStart === newEnd ? 'ALL_DAY' : 'MULTI_DAY';
      out.StartTime = ''; out.EndTime = '';
    }
    if (options.copy) {
      out.EventID = '';
      out.Status = 'HIDDEN'; // Preserve RC1.5 staff-side copy/release semantics.
      out.ParentEnabled = 'No';
    }
    return out;
  }
  return Object.freeze({EDIT_FIELDS, dateNumber, shifted, parseDateSearch, dateMatches, editableCopy, relocate});
}

const GSPSCalendarCore = gspsCalendarCoreFactory();
