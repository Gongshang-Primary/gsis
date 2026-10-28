# GSiS v0.6.01

## Q191: Admin grants

Contacts > Sys Admin can add Admin access to school users. Current Admin authority and the target record version are checked server side. Existing roles are preserved; a grant cannot silently remove SMC. Existing Admin access cannot be removed through this control. Reactivating an inactive Admin requires an explicit current-Admin grant. Legacy requests without a grant retain their existing SMC behavior.

## Q193: Acting membership

The shared membership calculation includes SH in SMC and ST, LT and MTT in TL, independent of Acting/Ag status. Other groups remain intact. This corrects the observed SH SL omission without rewriting current Contacts or version snapshots. Contacts directory/data replies and Deploy resolution use the same rule. Cache namespaces change so old membership results are not reused. Department TL assignment remains explicit; active eligibility and backend validation remain. Acting OF rates and application access grants are unchanged.

## Q192: Loading diagnostics and containment, incident still open

The live Layout endpoint returned HTTP 503 with UPSTREAM_RESPONSE before this release. The independent 2026 snapshot was already valid. The production failure cause could not be established through the available connection.

Gateways now distinguish access HTML, execution-error HTML, unavailable deployments and other invalid responses using fixed safe categories. Raw responses, URLs, credentials and personal data are not copied into errors or logs. Layout rejects an incompatible success envelope rather than reporting a usable load. Refresh can recover after a successful response. Backend initialization errors return JSON; failed performance logging cannot break a valid response.

The read-only diagnoseLayout601 function reports current snapshot integrity, JSON serialization and the published Apps Script endpoint/version. Its output is printed in the execution log without needing to expand a failed execution. It does not reseed, publish, reset or grant access.

Installation and live verification remain required. This package does not claim that the reported loading incident is fixed. No live application or data was changed by this release preparation.
