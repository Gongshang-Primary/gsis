// v0.9.8 restores the existing Google Roster authority at the deployed entry
// points. This is a release profile, not another dashboard switch to configure.
// Keep transport receipts, queues, secrets and explicit pause/send controls.
// Never remove an Apps Script migration fence or modify persisted D1 authority.
export function rosterRecoveryEnvironment(env){
 return {...env,
  GSIS_BACKEND:undefined,
  GSIS_BACKEND_REQUIRED:'false',
  ROSTER_EDGE_AUTHORITY:'legacy',
  DEPLOY_EDGE_AUTHORITY:'legacy',
  GSIS_BACKGROUND_JOBS:'false'
 };
}
