// Explicit GSiS reference integration boundaries. requireSurgicalSheets_ changes
// only the obsolete release number in its setup error; its guard is retained. Behavioral coverage lives in
// run_gsis_bridge_checks, run_gsis_contract_checks, gsis-independent-identity-review
// lord-daily-contacts-sync, and the real Chromium gsis-reference-ui-browser regression. Other historical
// functions, configuration, schemas and assets retain their original guards.
module.exports = {
 changed: ['requireSurgicalSheets_','doPost','createBookingBatch_','prepareBooking_','updateBooking_','getBookingEmailsByTtbName_','getOverlordMovements_','getOverlordContacts_','getOverlordOverdueScan_','getStarlordBoardData_','getStarlordStatutoryNameMap_','identityLookup_','adminContacts_','sendWhatsAppTemplate_','getReferenceData_','queueBookingNotificationIntents_','bookingTeacherContact_'],
 added: ['LORD_GSIS_CONTACTS_FRESH_MS','gsisContactsFresh_','syncLORDGSiSReferencesWaiting_','installLORDDailyContactsSync','gsisError_','gsisEnabled_','gsisJSON_','gsisSnapshot_','gsisReadSnapshot_','gsisSourceStatus_','gsisPublicReference_','gsisValidateSource_','gsisFetchSource_','gsisInitialActivities_','syncLORDGSiSReferences_','gsisSnapshotKey_','syncLORDGSiSReferences','enableLORDGSiSBridge','gsisContactRows_','gsisPerson_','gsisRequireFreshContacts_','gsisPrepareReferenceRequest_','gsisBookingPerson_','gsisBookingOwnerEmails_','gsisContactLinkByEmail_','gsisBookingCommandDigest_','gsisRecoverBookingBatch_','gsisCustomLabel_','gsisPeopleIndex_','gsisBookingBindingIndex_'],
 lordChanged: ['applyBookingForEdit','submitBookingUpdate','renderBooking','submitBooking','retryPendingBookingBatch','postTransaction','resumeDraft','renderLanding','loadSession'],
 // The editor refreshes the reference generation on open and includes validated
 // reference IDs on save, with a retry after a generation conflict.
 overlordChanged: ['openAdminEditor','saveAdminEdit']
};
