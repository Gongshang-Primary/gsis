// Reviewed durable photo upload changes, covered by run_evidence_upload_checks and real custody-cycle regressions.
module.exports = {
  "changed": [
    "doPost",
    "getIdempotentResult_",
    "storeIdempotentResult_",
    "createLoanSession_",
    "completeReturn_",
    "savePhoto_",
    "partitionReignSnapshot_"
  ],
  "added": [
    "evidenceDigest_",
    "evidenceCommand_",
    "validEvidenceManifest_",
    "readEvidenceManifest_",
    "assertEvidenceBinding_",
    "prepareEvidenceRequest_",
    "evidencePhotoSpec_",
    "prepareEvidenceUploads_",
    "verifyEvidenceFile_",
    "requireCommittedEvidence_",
    "queueEvidenceCommit_",
    "inspectLORDPhotoUploadReadiness",
    "maintainLORDPhotoUploads"
  ]
};
