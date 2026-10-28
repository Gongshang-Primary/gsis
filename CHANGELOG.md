# GSiS revision K

See [K changes](CHANGELOG_v0.9.8k.md), [setup](SETUP_v0.9.8k.md) and [validation](VALIDATION_v0.9.8k.md). This is a focused Roster correction on J. Other products remain J.

# GSiS Suite v0.9.8j

See [J changes](CHANGELOG_v0.9.8j.md), [setup](SETUP_v0.9.8j.md) and [validation](VALIDATION_v0.9.8j.md). Roster publication/learning/export and Calendar sync/editing updates preserve Google authority; the production Calendar queue is optional and I rehearsal remains separate. Final release evidence is recorded by the controller.

# GSiS Suite v0.9.4

25 October 2026. Coordinated Worker/D1 authority, durable absence and peer capture, private timetable caching, Venues recovery and complete maintainer documentation. See [changes](CHANGELOG_v0.9.4.md), [README](README.md) and [validation](docs/v094/VALIDATION.md). No production deployment is performed.

# GSiS Roster v0.9.3b

25 October 2026, Singapore time. Durable absence receipt and processing are separated from allocation, with protected peer proposals and independent WhatsApp/email invitations. This patch updates the Roster frontend, backend and notification Worker; other components stay v0.9.3. See [changes](CHANGELOG_v0.9.3b.md), [installation](HOTFIX_v0.9.3b.md) and [validation](VALIDATION_v0.9.3b.md).

# GSiS Suite v0.9.2

Full-suite consolidation with Venues, STAPLER recovery and visible known UT cap. See [release changelog](CHANGELOG_v0.9.2.md), [main README](README.md) and [release notes](docs/GSiS-v0.9.2-Release-Notes.md). Local integration and release verification are in progress; no live deployment is performed.

# GSiS v0.9.1c Roster patch

25 October 2026, Singapore time. See [changes](CHANGELOG_v0.9.1c.md), [installation](HOTFIX_v0.9.1c.md) and [validation](VALIDATION_v0.9.1c.md) for full-school-year absence reporting.

# Venues design refinement — not a runtime release

25 October 2026, Singapore time. The [Venues design](docs/superpowers/specs/2026-10-25-venues-design.md) now specifies descriptor-aware room search with unit-only selected values; optional purpose/preparation notes; a multi-room staff dashboard with grouped periods and exact timings; admin-assigned room owners; and room-level immediate/approval-required booking policies. Earlier repeat rules remain explicit. The self-approval assumption is visible for review. No Venues runtime, deployment or provider send is included. The separate product backlog remains outside Git.

# GSiS v0.9.1b LORD and Roster patch

25 October 2026, Singapore time. See [patch changes](CHANGELOG_v0.9.1b.md), [installation](HOTFIX_v0.9.1b.md) and [validation](VALIDATION_v0.9.1b.md). [Change workflow](docs/CHANGE_WORKFLOW.md) records automatic changelog commits and the separate uncommitted product backlog.

# GSiS v0.9.1a LORD patch

25 October 2026, Singapore time. See [patch changes](CHANGELOG_v0.9.1a.md), [installation](HOTFIX_v0.9.1a.md) and [validation](VALIDATION_v0.9.1a.md). The LORD trio and backend use 0.9.1a; other components remain at 0.9.1.

# GSiS Suite v0.9.1

24 October 2026, Singapore time. This release promotes `81cc56a` (`v0.9-correction`) to a full numbered release. All eight app labels and npm metadata become 0.9.1. Storage schemas, cache identities, request protocols and provider template names remain unchanged. The original `v0.9` and `v0.9-correction` history is retained.

## Included since the original v0.9 release

* Move LORD core configuration into Apps Script Properties and Pages bindings; preserve existing peppers and secrets outside source and general archives.
* Restore Report Absence periods/timings and the requested review and **Submit absence** labels.
* Support atomic multi-teacher submissions for SMC/admin with individual teacher/date instructions, self-only ordinary-teacher permissions, and exact retry receipts.
* Keep confirmed green feedback above Relief instructions; avoid unused candidate reads, a duplicate delivery read and unrelated STAPLER preparation packing.
* Restore the Own arrangements full-day matrix with partial-name search, cover/combine selection and confirmed-timetable privacy.
* Offer school-wide absence page sizes 50 / 100 / 150 / 200 while preserving filters and selected eligible records.
* Preserve explicit single-teacher selection on confirmed STAPLER report reads.
* Include settings-first guidance in the deployment inventory and reject stale or dirty source when producing source/history release bundles.

No new runtime behavior is added beyond that retained correction. The original v0.9 LORD integration, trusted timetable caching, STAPLER retries, human allocation authority and allocator lifecycle protections remain included. See [the correction guide](docs/GSiS-v0.9.1-Settings-and-Absence-Correction.md) and [the historical v0.9 changelog](CHANGELOG_v0.9.md).

## Installation and verification

Use [READ_FIRST](docs/READ_FIRST.md), the [maintainer guide](docs/GSiS-v0.9.1-Maintainer-Guide.md) and [LORD setup](docs/LORD_SETUP_v0.9.1.md). Save settings before replacing source, install matching backends before frontends, preserve current owners and URLs, and reload open tabs. [VALIDATION.md](VALIDATION.md) records the fresh release evidence.

This source release does not deploy code, change platform settings or school data, activate a reference bridge, publish a timetable, or send provider messages. Automatic new-absence emergency alerts after first publication and before 14:00, targeted publication follow-ups, expanded Calendar provider cooldown and the future venue-booking pipeline remain queued.
