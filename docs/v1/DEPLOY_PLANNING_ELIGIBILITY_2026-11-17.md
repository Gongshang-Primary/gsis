# Deploy planning staff lists and reporting links

Model: Codex. Owner rule recorded on 17 November 2026, Asia/Singapore.

Deploy's saved teacher list supplies planning choices. Optional accepted EO or grade facts do not empty that list. Core application access and Roster's accepted workload inputs keep their existing rules.

| View | New choices |
| --- | --- |
| Span of Control | Known active version staff, excluding MK unless also SAT |
| IP Deploy, Dept, Committees, CCAs, PLT, Events and duties | Known active version staff outside MK, SAT, Support and School Leader groups |

Span therefore includes active SAT, SAT × MK, Support, School Leaders and OSO. Unknown activity is not active. Membership matrix flags come from the selected version and its explicit Role. Missing optional facts remain visible separately as accepted capacity information.

## Source and projection

The pure policy is [deploy-eligibility.mjs](../../v1/web/shared/deploy-eligibility.mjs). The browser, native save checks and canonical workbooks use it. The version matrix drives managed groups; custom labels survive. School Section, personnel category and MK facts retain their distinct meanings. A label used for planning never grants application access.

A small `teacher.planningProfile` stores only ordinary Role and Active values that already existed in that version. An explicit `teacherDrafts` field overrides it. An unknown Active value remains unknown, even when Contacts later gains Active = Yes. Fresh accepted Contacts authority, activity and capacity fields remain unchanged on the server.

Opening a page does not write this annotation or initialize reporting. A note-only save does not migrate unrelated teacher rows. The existing owning save may persist the annotation when it already refreshes the teacher rows. The annotation is not an authority grant or an independent publication mechanism. Role-matrix derivation uses the same ordinary version Role as the UI and workbooks; existing publication authority checks and receipt application still govern any permission change.

Creating or duplicating from current Contacts refreshes Role and Active for existing Contacts IDs. That refresh removes only those two copied draft overrides. Draft-only people, stable IDs, assignments, notes and other draft fields remain. The source version stays unchanged. This change does not claim to complete every Contacts lifecycle field.

## Reporting and retained history

Span renders eligible staff immediately with the existing reporting layout, search, layers, drag and drop and View mode. The first explicit reporting edit initializes the graph in the native atomic save. The old Initialize prerequisite is unnecessary.

Existing excluded assignments and reporting links remain stored and inspectable. Active = No removes new choices without deleting allocations. Removing a member does not turn another retained member into a new assignment merely because its list position shifts. Fixed leadership roles remain positional; adding another occurrence of an excluded member is a new binding and is rejected.

Reporting supports legacy `staff.ro`, `officers` and `parents` aliases per person. An empty whole alias map does not erase another map. Contradictions are flagged. An explicit edit reconciles only that person's aliases and preserves unrelated disagreements. Self-links, cycles, protected roots and expected-value checks remain enforced.

An existing orphan edge can be explicitly cleared with its observed expected value. The save removes that person's edge aliases and clears their retained `staff.ro`; it preserves the staff snapshot and audit history. This does not permit a new unknown-ID relationship or an arbitrary unknown-ID no-op. A projected missing parent is not a new durable identity.

Canonical Span exports retain historical rows and include metadata listing historical or conflicting Staff IDs. Unchanged imports preserve those links. Explicit clears remove them. Teachers and individual Membership workbooks display the same ordinary version Role and Active as the browser, with explicit drafts first. Unknown Active exports as null and an untouched null does not request a clear.

## v0.9 comparison

The reference is commit `d9d180c`, specifically `shared/reporting.js`, `shared/teaching-rules.js`, `public/reporting-ui.js` and `public/planning-ui.js`. Its reporting code required initialization, excluded MK and excluded OSO from officer choices. Its general planning choices excluded SL, SAT, Support and MK. The owner's new Span rule includes OSO and SAT × MK, so those two differences are deliberate. The existing v0.9 layout is retained.

The v1 defect combined two separate decisions. Accepted teaching-capacity checks denied ordinary planning choices, while Span expected a pre-existing reporting snapshot. The correction separates the planning predicate from accepted authority/capacity and projects the reporting list from the saved teacher inventory.

## Visible changes and release limits

- Staff choices populate according to the table above, including staff with missing optional EO facts.
- Span opens with its available staff list and no initialization step.
- Retained excluded links and conflicting aliases have review messages and can be cleared explicitly.
- Changing Active does not make saved allocations disappear in the browser.
- Teachers' small status labels identify accepted capacity inputs rather than implying that they control planning choices.
- Canonical Teachers, Membership and Span workbooks match these version-owned choices.

The functional changes affect Deploy and its workbook output. The common Drive backup reader statically imports Deploy workbooks, so the new shared policy can alter all eight owner bundles as well as web assets. The release must compare the built artifacts. No migration, provider, configuration, immutable historical publication rewrite or live action is part of this task. The builder only changes the existing Deploy script inclusion to a browser module. There is no new build-time business-logic patch.

The separate Subject Load branch changes that same script-inclusion line for its own module. Combine both includes during integration and rerun the build and browser checks. This branch does not include unreviewed Subject Load or Duplicate code.

Local verification and remaining exact-head CI/review are recorded in the [task record](../coordination/tasks/v1-deploy-planning-eligibility.md). Hosted runtime UAT remains Not tested. F5 remains OPEN; T1B-01 and T1B-02 remain Not tested.
