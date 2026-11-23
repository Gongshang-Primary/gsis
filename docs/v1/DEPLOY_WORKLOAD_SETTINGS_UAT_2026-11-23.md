# Deploy Workload Settings UAT, 23 November 2026

Model: Codex. Times are Asia/Singapore. Evidence is the owner's v1.10 screenshot of the **2026 T4 post-PSLE** saved draft and the pinned source of both releases. [v1.10 release source](https://github.com/Gongshang-Primary/gsis/commit/d726896ce933b139721e3c0acc990b1f8f837f3e)

## DEP-23-004 — Workload Settings opens in edit mode

**Open.** Logged at 11:43 SGT. On entering the page, the planner sees editable categories, specialist checkboxes and demand selectors with **Cancel** and **Apply to draft**. The owner reports having to cancel on each arrival to avoid editing.

Both releases directly call `selectionEditor` when building this page. Opening the editor alone leaves the draft clean. Applying a changed form queues `setWorkload` for the normal save flow. The Workload Settings renderer is identical in the pinned v1.10 and v0.9.9y source. [v1 renderer](https://github.com/Gongshang-Primary/gsis/blob/d726896ce933b139721e3c0acc990b1f8f837f3e/public/workload-ui.js#L69) · [v0.9 renderer](https://github.com/Gongshang-Primary/gsis/blob/d9d180ced16d32c836a94d67d9cff8d3030eb21d/public/workload-ui.js#L69)

**Acceptance.** Arrival, reload and version selection show a compact, readable view. An explicit **Edit** action opens the form for an authorised planner. Cancel returns to the view without queued changes. Apply keeps the existing draft and Save changes workflow. Verify read-only access and current version scoping.

## DEP-23-005 — Where IMP appears and how the list is populated

**Activity presence in the hosted draft unverified.** Logged at 11:43 SGT. The screenshot shows 32 of 32 subject rows and no countable-activity section above them.

- The subject list takes the union of keys in the selected version's **Program Settings → Subject Load** across all levels, including blank-valued entries. At the shared renderer boundary, it excludes exact `FT`, maps `PE` to `PHE`, `Science` to `Sci`, and `TTT` to `PD`, and includes `PD`. The row count measures this table. [Subject list](https://github.com/Gongshang-Primary/gsis/blob/d726896ce933b139721e3c0acc990b1f8f837f3e/shared/workload.js#L6)
- **IMP (Instructional Mentoring Programme)** belongs in **Countable non-teaching activities** above the subject table when saved as a version activity. The read-only summary draws its activity code, name, weekly periods and teachers from `workload.nonTeachingActivities`. An empty activity list omits that summary. The editor preserves existing activity records when saving subject settings, and v1.10 has no visible add/edit action for those activities. [Settings and preservation path](https://github.com/Gongshang-Primary/gsis/blob/d726896ce933b139721e3c0acc990b1f8f837f3e/public/workload-ui.js#L69)
- Adding an IMP subject would classify it as Teaching by default. The validator rejects using the same code as both a subject and an activity, including case variants. Compare the matching saved versions and activity inputs to establish why IMP is absent. If an IMP activity exists, verify its periods and teachers in the summary, Ledger and Relief Settings. Scope an activity editor separately if authoring is required. [Activity validation](https://github.com/Gongshang-Primary/gsis/blob/d726896ce933b139721e3c0acc990b1f8f837f3e/shared/workload.js#L21)

## Verification

The two pinned renderer and workload modules have identical Git blobs. Synthetic probes at both revisions passed subject-key union, alias mapping, empty activity handling, IMP summary data and subject/activity collision checks. The IMP UI test passed on the exact v1.10 source, including activity summary, save preservation, Ledger and relief breakdown. Hosted version data and activity provenance were outside this investigation. [IMP UI regression](https://github.com/Gongshang-Primary/gsis/blob/d726896ce933b139721e3c0acc990b1f8f837f3e/tests/imp-nonteaching-ui.cjs)
