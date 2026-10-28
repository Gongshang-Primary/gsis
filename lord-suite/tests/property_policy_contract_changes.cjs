// v0.9.1a property policy boundaries, covered by run_property_policy_checks.
// All canonical runtime writes use bounded admission/recovery storage; existing
// locks share one handle so pruning never re-acquires/releases a caller's lock.
module.exports = {
  changed: ['commitSurgicalUpdates_','withWriteLock_','doPost','getIdempotentResult_','setBoundedRuntimeProperty_','noteMaintenanceFailure_','getOverlordDashboardData_','acknowledgeLORDMaintenanceWarning','diagnoseLORDBackgroundWork','storeIdempotentResult_','pruneIdempotency_','queueSecondaryTask_','pruneSecondaryTasks_','processSecondaryQueue_','processSecondaryTaskWithClaim_','checkAndSendOverdueTelegramAlerts','claimOverlordMonitorBucket_','appendOverlordEventsBatch_','runSixPmForceReturnSweep_','forceReturnOpenSessionsNow','refreshSuiteData_','deliverWhatsAppAlert_','deliverTeacherWhatsApp_','syncLORDGSiSReferences_','enableLORDGSiSBridge'],
  // H recipient management additions are covered by gsis098h-background-work and the real-browser UI test.
  added: ['reconcileBackgroundCommandAudits_','reconcileBackgroundAuditBatch_','backgroundTaskState_','backgroundActions_','backgroundRecipients_','backgroundHash_','backgroundPublicItem_','listBackgroundWork_','backgroundCommand_','flushBackgroundCommandAudit_','acknowledgeBackgroundWarning_','deliverBookingEmail_','LORD_MAINTENANCE_CATEGORIES','retainMaintenanceFailure_','maintenanceUnresolved_','saveSecondaryFailure_','maintenanceFailurePublic_','maintenanceFailureReason_','getLORDMaintenanceStatus_','scriptWriteLock_','withRuntimePropertyLock_','validCompletedReceipt_','runtimePropertyBytes_','pruneRuntimeProperties_','assertRuntimePropertyCapacity_','checkedRuntimePropertyBytes_','prepareRequestReceipt_','validSecondaryTask_','secondaryTaskNeedsReconciliation_','lordPropertyDiagnostics_','maintainLORDRuntimeProperties','checkpointWhatsAppSend_','LORD_RUNTIME_STORAGE'],
  compareConfig(name, before, after) {
    if (name !== 'LORD_IDEMPOTENCY') return;
    // Only the unsafe live-receipt count eviction is removed. Retention and
    // value size continue to be checked by each historical compatibility test.
    require('assert/strict').equal(before.MAX_ITEMS,180);
    require('assert/strict').equal(Object.hasOwn(after,'MAX_ITEMS'),false);
    delete before.MAX_ITEMS;
  }
};
