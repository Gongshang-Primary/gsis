/** Remove the owner-retired Google-era pause control from the copied v1 screen.
 * The original v0.9 asset is untouched. Keep line positions for probe pins.
 */
export function removeRosterQuietMode(source) {
  const start = source.indexOf(" // Quiet mode pauses lock-heavy background jobs"),
    end = source.indexOf(" function timetableSourceHtml(s)", start);
  if (start < 0 || end <= start || !source.slice(start, end).includes("s.ctx.api('quiet-mode'"))
    throw Error("Roster quiet-mode source changed; review the v1 removal adapter");
  let result = source.slice(0, start) + source.slice(start, end).replace(/[^\r\n]/g, " ") + source.slice(end);
  const obsolete = [
    '<button type="button" data-quiet-toggle hidden aria-pressed="false">Quiet mode</button><span data-quiet-note class="ops-draft-status" role="status" hidden></span>',
    "  actions.querySelector('[data-quiet-toggle]').onclick=()=>toggleQuiet(s);drawQuiet(s);void refreshQuiet(s,!s.quietCheckedAt);",
    "if(isLive(s)&&s.page==='Assign Relief'){if(!document.hidden)await refreshQuiet(s);if(isLive(s))drawQuiet(s);}",
  ];
  for (const fragment of obsolete) {
    if (result.split(fragment).length !== 2)
      throw Error("Roster quiet-mode markup/hook changed; review the v1 removal adapter");
    result = result.replace(fragment, "");
  }
  if (/data-quiet-(?:toggle|note)|\b(?:refreshQuiet|toggleQuiet|drawQuiet)\b|['"]quiet-mode['"]/.test(result))
    throw Error("Unexpected quiet-mode caller remains in the v1 Roster screen");
  return result;
}
