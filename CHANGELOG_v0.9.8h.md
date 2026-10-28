# GSiS revision H changelog

Baseline: v0.9.8g, commit `cb7a44ec1f42ecda6262e781de988330f465f62c`. All 17 supplied suite components use v0.9.8h.

## Stapler authority and recovery

The confirmed dated Stapler timetable is authoritative independently of uploaded baselines. A blank standalone plan supplies its own valid timings, verified Contacts teachers and classes. Baseline uploads, replacements and removal update optional comparison without moving cards, changing the intended plan or revoking confirmation. Readers use the confirmed dated plan without requiring a matching current baseline.

Native recovery import preserves IDs, Card Pit, mats, recess and annotations. Imported confirmation claims do not become server-verified confirmation. Authorised SMC/admin can preview and restore server-verified reset archives through the application, with current-plan backup, expected-version checks, audit and receipts. Restoring unchanged confirmed content preserves its original confirmation. Existing deleted-plan restoration remains supported.

A ready live incident preview has been reported. Successful live restoration has not been confirmed. No private incident plan or payload is included.

Standalone Stapler export uses the plan's own periods and timings without a new upload or network reference. A compatible baseline retains G's weekly Teacher Summary. Without an available compatible baseline, Teacher Summary and Class POV cover the selected date; other weekdays and times are not invented.

## Publication and communication

Publish / Let teachers see controls visibility of saved work. Pending cover, reports, availability and workload business warnings do not prevent publication. Authorisation, privacy, structural validation and stale-write protection remain. Publication does not implicitly allocate or notify.

SMC WhatsApp communication is independent of publication. An unpublished message link is limited to that recipient's communicated snapshot; later drafts and other teachers' data remain private. Existing template contracts, durable intent, provider evidence and duplicate protection remain. Acceptance is distinct from delivery. User-facing absence update dates and times use Asia/Singapore; audit UTC instants do not change.

## UT capacity

The configured UT weekly time cap is hard for automatic allocation, including confirmed suspended days. Capacity uses the effective weekly timetable and relief accounting in the existing employment cap units. Missing verifiable capacity excludes automatic UT selection. Manual SMC choices may override the cap with a visible warning and audit evidence. Other employment and time eligibility remains.

## Shared secret and startup diagnostics

`GSIS_SECRET` accepts at least 32 printable non-whitespace ASCII characters, within existing configuration storage limits. Existing 33-character values are accepted. Values are not trimmed or truncated; invalid configured values fail closed. When the canonical setting is absent, legacy credentials remain supported. Session, OAuth, Meta and private link keys remain independent.

Roster checks startup HTTP status and error envelopes before requiring `clientId`. Safe backend codes and references, including `GSIS_SECRET_INVALID`, remain visible instead of becoming a missing school sign-in error.

## OVERLORD Background work

Administrators can manage existing LORD background notification work from Settings and the maintenance notice. Needs attention is the default view. Concrete previews cover individual recipients and bounded selections. Eligible waiting/recoverable work can retry; unsent notifications can cancel; unknown outcomes can be reviewed and retired without resending; expired reminders can retire. Historical warnings have separate acknowledgement.

Active or provider-accepted sends have no ordinary retry. Retirement preserves unknown outcomes and provider evidence and cannot recall a submission. Reviewed, retired and accepted do not mean delivered. Grouped tasks retain per-recipient decisions and report whether remaining recipients resume. Live Google administrator checks, the existing mutation lock, stable command identities, expected hashes and per-item stale results protect changes. Booking, custody and audit repairs are outside notification cancellation.

## Installation scope

G's class drafts, source timing exports and teacher Stapler navigation remain. Install the matched nine frontend ZIPs, six Apps Script backends and two supplied Workers only into their existing projects. The Operations Worker remains optional and must not be activated for this release. No new database, Worker, Queue, cron, infrastructure migration, active relief ledger or timetable-cache activation is required. Building the release does not change production.
