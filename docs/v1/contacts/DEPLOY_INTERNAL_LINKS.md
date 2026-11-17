# Deploy internal catalogue links

Owner instruction, 17 November 2026: fix and review Deploy internal linkages using v0.9 where necessary. This implements the internal portion of the HR Terms and Membership findings in PR197's dated UAT ledger. Source reference: v0.9 `d9d180ced16d32c836a94d67d9cff8d3030eb21d`; prior v1 release `d5c8899aeb867448ad7399f9925f46ac11371380`.

## Internal source and consumers

| Source in the selected version | Consumer | Behaviour |
| --- | --- | --- |
| Membership Role Shortform | Teachers Add/Edit/Grid Role choices, HR Terms Role display, Offload Role choices | Derive choices from the explicit matrix even with no teachers. Never assign a role merely because its row exists. Retain existing out-of-list staff values. |
| Selected teacher Role + matching Membership row | Teacher appointment-grade display and ten managed Membership labels | Apply the explicit mapping in local preview and saved projection; preserve custom labels. A role/grade does not imply accepted EO. |
| HR Terms EO Appt Level choices | Membership appointment-grade suggestions | Version-owned suggestions; retain explicit values outside the list. EO yes/no remains a separate field. |
| HR Terms Appointment Status, Employment Modifier, Subject Modifier | Existing Teachers selectors and Offload tag choices | Save the selected version's lists; reuse them after refresh/import and across screen changes. |
| HR Terms MK Modifier | Version-owned choice data and canonical export/import | Retained; the existing Teachers form does not expose a separate MK Modifier control. This task does not add an unsupported staff writer. |
| Fixed Day of Birth, Month of birth, Active | HR Terms fixed display; Active in Teachers | Calendar-day/month lists and Y/N remain fixed. Editing a choice list does not change staff values. |

`hrChoicesSchema: 1` marks explicitly configured ordinary lists in `hrChoices`. Role derives from `membership` when `roleMembershipSchema: 1`; the intentional blank-role mapping remains the existing blank choice. `masterOptions` and `hrTerms` are compatibility projections from the same resolver. Legacy configured `masterOptions` is retained. Explicit empty lists do not fall back to Contacts values. Fresh unconfigured versions may use their observed Contacts values until explicitly configured.

Native `setHRChoices` and canonical HR Terms workbook imports save only the five editable lists, with current capability, school, lease, revision and operation checks. Fixed fields cannot be edited. Native queued payloads may carry an earlier/later derived Role display while mixed edits are coalesced: that Role display is ignored and recomputed from the actual matrix, never used to write roles. Workbook imports still require their read-only Role list to agree with the current version. Each workbook contains all nine fields and school/version/revision metadata. Blank cells explicitly mean an empty list; omitted fields are invalid, not implicit clears.

The original v0.9 HR Terms function used a Field/Choices table; the prior v1 build replaced it with a staff-facts report and rejected edits. A v1-owned renderer now supplies the editor without adding another `build-web.mjs` text patch. Existing canonical import preview, confirmation and recovery are retained. The old report shape cannot be silently imported as a catalogue.

## Authority and scope limits

This is an internal Deploy repair. Saving HR Terms does **not** replace Contacts catalogues or grant application access. Existing explicit Membership publication still applies SMC/EO/School Leader and Memberships through its reviewed proof/audit/recovery path. Global Admin remains separate. Full external catalogue publication from v0.9 and remaining ordinary deployment-tag lifecycle work are not implemented here. This supersedes the earlier reference-only HR Terms wording only for version-owned internal choice editing/import; that wording remains applicable to changing Contacts itself.

The eleven lifecycle tags remain distinct. Role, appointment grade/status, Employment/Subject Modifier and Memberships have the internal links above. MK Modifier choice data is preserved. Employment Arrangement, Employment Status, School Section and Personnel Category have no new editor in this slice. Do not infer them from job labels, map Employment Arrangement onto Employment Modifier, or fabricate values. Basic Name remains explicit; TTb formatting follows the existing resolver. Planner notes remain private to Deploy and are never parsed into tags. Current accepted authority/eligibility and workload calculations retain their existing contracts.

## Evidence and remaining gates

New real Worker/local D1 and built-browser tests reproduce the original empty Role picker and exercise save/reload, HR list persistence, version isolation, explicit clears, workbook import, fixed/stale/foreign/unauthorised rejection, role-grade preview and existing teacher-grid save. Existing Membership and authority-publication regressions remain required. Tests use synthetic people and local resources only. The original failing browser assertion is retained in task evidence; no live row edits were performed.

Implementation and independent review status live in [the task record](../../coordination/tasks/v1-deploy-internal-links.md). No deployment is authorised by this document. F5 OPEN; official T1B-01/T1B-02 and hosted/runtime UAT Not tested.
