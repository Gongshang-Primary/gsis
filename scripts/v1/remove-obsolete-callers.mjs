/** Remove obsolete/replaced v0.9-only callers from built v1 frontend assets.
 * Preserves exact line numbers so probe dynamic-call-site pins remain accurate.
 * Original v0.9 source files are never modified.
 */

function padPreservingLines(original, replacement) {
  const originalLines = original.split("\n").length - 1;
  const replacementLines = replacement.split("\n").length - 1;
  if (replacementLines > originalLines) {
    throw Error("Replacement exceeds original line count; cannot preserve probe line pins");
  }
  return replacement + "\n".repeat(originalLines - replacementLines);
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start) : -1;
  if (start < 0 || end <= start) {
    throw Error(`Obsolete caller baseline changed (${label}); review the v1 removal adapter`);
  }
  const original = source.slice(start, end);
  return source.slice(0, start) + padPreservingLines(original, replacement) + source.slice(end);
}

export function removeContactsLegacyRoleCaller(source) {
  const startMarker = "$('roleForm').onsubmit=async e=>{";
  const endMarker = "\nasync function start(forceSignIn=false){";
  const next = replaceBlock(
    source,
    startMarker,
    endMarker,
    "$('roleForm').onsubmit=e=>{e.preventDefault();location.assign('/admin/');};",
    "Contacts /kp",
  );
  if (/api\(\s*['"]kp['"]/.test(next)) {
    throw Error("Unexpected legacy Contacts /kp caller remains in built v1 asset");
  }
  return next;
}

export function removeOverlordLegacyBackgroundCallers(source) {
  const startMarker = "async function previewBackgroundWork(){";
  const endMarker = "\nasync function openSystemSettings(){";
  const replacement = [
    "async function previewBackgroundWork(){return window.GSISV1LordBackground?.open?.();}",
    "async function applyBackgroundWork(){return window.GSISV1LordBackground?.open?.();}",
    "async function acknowledgeBackgroundHistory(){return window.GSISV1LordBackground?.open?.();}",
  ].join("\n");
  const next = replaceBlock(
    source,
    startMarker,
    endMarker,
    replacement,
    "OVERLORD legacy background*",
  );
  if (/['"]background(?:preview|apply|ack)['"]/.test(next)) {
    throw Error("Unexpected legacy OVERLORD background* caller remains in built v1 asset");
  }
  return next;
}

export function removeCalendarLegacyQueueAndPushCallers(source) {
  const jobsReplacement = [
    "  async function enqueueCalendarJob(){throw new Error('Calendar v1 saves directly without the legacy job queue.');}",
    "  function finishQueuedEvent(){}",
    "  function scheduleCalendarJobs(){clearTimeout(state.calendarJobsTimer);state.calendarJobsTimer=0;}",
    "  async function loadCalendarJobs(){return [];}",
    "  function renderCalendarJobs(){$('calendarJobsPanel')?.remove();}",
    "  function openCalendarJobProposal(){}",
  ].join("\n");
  let next = replaceBlock(
    source,
    "  async function enqueueCalendarJob(action,original) {",
    "\n  function applyGlossaryRecord(saved) {",
    jobsReplacement,
    "Calendar legacy /calendar-jobs",
  );
  const pushReplacement = [
    "  function startCalendarChangeStream(){}",
    "  async function drainCalendarChanges(){}",
  ].join("\n");
  next = replaceBlock(
    next,
    "  function startCalendarChangeStream() {",
    "\n})();",
    pushReplacement,
    "Calendar legacy /calendar-changes",
  );
  if (/\/api\/calendar-(?:jobs|changes)\b/.test(next)) {
    throw Error("Unexpected legacy Calendar jobs/changes caller remains in built v1 asset");
  }
  return next;
}
