const reliefNotificationKinds = new Set([
  "relief_publication",
  "relief_reminder",
  "conditional_relief_instruction",
  "stapler_timetable",
  "mutual_request",
  "mutual_override",
]);

export function isReliefNotificationKind(kind) {
  return reliefNotificationKinds.has(kind);
}

/** Dated Roster availability is not Contacts employment status or a role grant.
 * Callers supply the current Contacts projection and current owner records.
 * v1 keeps permanent Staff ID matching; names, tags and mobiles grant nothing.
 */
export function hasDatedReliefActivation(person, adhoc, date, period) {
  const staffId = person?.staffId ?? person?.id;
  if (
    typeof staffId !== "string" || !staffId.trim() ||
    !(person.eo === true || person.adhocEligible === true) ||
    typeof date !== "string" || !/^20\d\d-\d\d-\d\d$/.test(date) ||
    !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date ||
    !Array.isArray(adhoc) ||
    (period !== undefined && (!Number.isInteger(period) || period < 0 || period > 39))
  ) return false;
  return adhoc.some(row =>
    row?.staffId === staffId && row.date === date && !row.deletedAt &&
    Array.isArray(row.periods) && row.periods.length > 0 && row.periods.length <= 40 &&
    row.periods.every(value => Number.isInteger(value) && value >= 0 && value <= 39) &&
    (period === undefined || row.periods.includes(period)),
  );
}
