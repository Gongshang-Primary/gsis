# HR Terms, Membership and teacher proposals — v0.4

Deploy owns the global validated-choice catalogue, exposed through HR Terms. Admin edits master choices. Day, month and Active choices remain fixed. Global choices are shared by all versions and projected to Contacts on a confirmed save. Existing version-specific subsets are preserved and can be reviewed in HR Terms.

Membership role names, classification flags and EO mappings belong to each Deploy version. Role Truth Table displays that version's mapping. On first load, a legacy version without Membership seeds from Contacts. Saving persists it; duplication creates an independent copy. Only the active published revision projects its mapping to Contacts. A global master update must not expose an unpublished version's role mapping.

Application permissions are separate from staff Membership flags. Admin edits Membership/master choices; KPs edit group assignments and Duty. EO Appt Level remains derived and read-only in Teachers. Subject Modifier belongs to individual profiles; standard MTL, PE, Art and Music requirements remain enforced. Planner notes and Offload catalogues stay within their version.

New planning tables use explicit queued saves and expected-value comparisons. Stale whole-table updates are rejected and retain the draft. Legacy cell operations retain existing conflict receipts. Publication retains the Admin Contacts difference review and duplicate-name protection. Catalogue synchronization is revision-ordered and retryable if interrupted.
