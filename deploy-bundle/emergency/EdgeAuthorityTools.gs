/**
 * Emergency tools for the Roster D1 fence (GSiS). Keep as a separate file in the Roster GSiS Apps Script project.
 * Run from the editor: choose the function, press Run, read the Execution log. Prints no secrets.
 */
const EDGE_KEYS_ = ['ROSTER_EDGE_AUTHORITY','ROSTER_EDGE_SOURCE_DIGEST','ROSTER_EDGE_FENCED_AT','ROSTER_EDGE_FENCE_TOLERATED','ROSTER_CUTOVER_FREEZE'];
function edgeAuthorityStatus() {
  const props = PropertiesService.getScriptProperties();
  EDGE_KEYS_.forEach(function (key) { const v = props.getProperty(key); Logger.log(key + ' = ' + (v === null ? '(not set)' : String(v).slice(0, 120))); });
  Logger.log(props.getProperty('ROSTER_EDGE_AUTHORITY') === 'd1' ? 'FENCED: Google refuses Roster saves (D1 is the record).' : 'OPEN: Google accepts Roster saves (Google is the record).');
}
function edgeAuthorityRollbackToLegacy() {
  const props = PropertiesService.getScriptProperties(), before = props.getProperty('ROSTER_EDGE_AUTHORITY');
  if (before !== 'd1') { Logger.log('Nothing to do: ROSTER_EDGE_AUTHORITY is ' + (before === null ? '(not set)' : before) + '.'); return; }
  props.deleteProperty('ROSTER_EDGE_AUTHORITY'); props.setProperty('ROSTER_EDGE_ROLLBACK_AT', new Date().toISOString());
  Logger.log('Fence lifted. ROSTER_EDGE_AUTHORITY deleted (was d1).'); edgeAuthorityStatus();
}
