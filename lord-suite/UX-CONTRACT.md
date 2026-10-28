# LORD interaction contract

Policy source: docs/V18_IMPLEMENTATION.md and Review/LORD_V1.7.1_QUEUED_CHANGELOG.md. Existing approved v1.7 behavior remains canonical.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Existing native select | docs/V18_IMPLEMENTATION.md | Platform popup accepted | Keyboard and narrow screen |
| Booking Class / TG / Activity and Subject | Shared assets/reference.js | v0.9.1a booking requirements | Direct custom typing or explicit catalogue selection; retain drafts and identities | DOM, backend and mobile browser regressions |
| Date | Existing date picker | docs/V18_IMPLEMENTATION.md | en-SG, Asia/Singapore | Existing tests |
| Form | Existing field markup and postTransaction | docs/V18_IMPLEMENTATION.md | Explicit validation; prevent duplicate submits | v18 checks and UAT |
| Scrollbar | App stylesheets | docs/V18_IMPLEMENTATION.md | Document scroll, bounded modal body | Narrow screen |
| Toast | Existing app feedback functions | docs/V18_IMPLEMENTATION.md | Persistent error/retry for failed writes | Failure tests |
| CRUD | Existing authenticated transaction envelope | docs/V18_IMPLEMENTATION.md | Current server state wins; same logical action retries safely | Atomic/replay tests |
| Dialog | confirmLORD / showManagedDialog | docs/V18_IMPLEMENTATION.md | Native dialog; safe initial focus; restore trigger | Browser and UAT |

Deep links select an authenticated task and never submit it. A conflicting saved draft must be resumed or explicitly discarded before opening a different task. No photo is silently removed. A stale return page cannot close a newer session. Success is shown only after an authoritative response. Uncertain outcomes retain the payload and request ID.

Teacher consent is independent of admin access and can be withdrawn. Contacts updates that change a phone require renewed consent. Incident counts include confirmed omissions only; resolutions remain visible without reducing historical counts. Initial period start is unknown, not inferred from booking dates. All UI labels are English for the Singapore school context.
