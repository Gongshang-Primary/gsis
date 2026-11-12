# Explicit EO authority and T1D readiness proposal

Model: Codex. 13 November 2026 (Asia/Singapore). **Plan only; implementation blocked pending owner answers and separate implementation scope.** Claude independently reviews the exact PR head. This document changes no current runtime contract or production policy. ChatGPT coordinates v1; Muse retains v0.9.9* responsibilities.

## Decisions and evidence

The owner clarified that EO means Education Officer and distinguishes teachers from non-teachers. Ordinary teachers, STs and TCs are EOs; EO is not a rare appointment. Blank Role and EO Appt Level cells do not establish Non-EO. Teaching duties must not be used to infer authority. The owner subsequently selected **Contacts Power User** to confirm and accept each staff member's records, and requested a list of known tags before answering classification exceptions.

| Evidence | Finding |
| --- | --- |
| Main inspected at `b85304c3c8f048f464abf84ee66cc79c4c3d2d36`; T1B merge `16eb139`, reviewed head `b4cbec95b3a335b3212bbd3770bbdefb66d37833` | Isolated T1B library is merged; this is a later integration plan, not a T1B scope extension. |
| [Claude PR125 review, branch snapshot](https://github.com/helper-gsps/gsis/blob/9e32f0127eeac3a6d2874fe982e3bc06a66de85c/docs/coordination/review/pr125-claude-review.md), M1 and Owner input on D1 | Missing roles produce retryable PROVIDER_INVALID/503. Explicit false produces CAPABILITY_DENIED. Both data readiness and a distinct denial are needed. This branch record is newer than the copy read on main. The owner's latest clarification supersedes the review's wording “most teachers”/“rare”. |
| [Historical HR terms](https://github.com/helper-gsps/gsis/blob/b85304c3c8f048f464abf84ee66cc79c4c3d2d36/HR-TERMS.md) | Legacy EO Appt Level is derived and read-only in Teachers; Membership belongs to Deploy versions. This describes legacy behaviour, not v1 authority ownership. |
| [Legacy teaching rules](https://github.com/helper-gsps/gsis/blob/b85304c3c8f048f464abf84ee66cc79c4c3d2d36/shared/teaching-rules.js#L12) | `resolve` overwrites EO Appt Level from the Role catalogue, including blank when no role matches. Adding picker choices alone would not preserve per-person EO status. `eligible` is a workload predicate, not proof of EO: it excludes school leaders while blank ordinary-teacher roles can pass. |
| [Current adapter](https://github.com/helper-gsps/gsis/blob/b85304c3c8f048f464abf84ee66cc79c4c3d2d36/v1/contacts/core-provider.mjs), [Core failures](https://github.com/helper-gsps/gsis/blob/b85304c3c8f048f464abf84ee66cc79c4c3d2d36/v1/core/contracts.mjs) | Adapter requires one accepted interval-bearing record per authority field. Missing/nonaccepted evidence fails checks and becomes PROVIDER_INVALID; Core classifies 503 as unavailable/retryable. |
| Recovered consolidated Revision 49, TJ01/TK01, TL01–07, PG01 and TV02 | Structured classifications are independent of names; normal EO is stored but hidden from TTb suffixes; ambiguous migration requires review; current SMC/EO/SL facts govern capabilities; Deploy cannot overwrite Contacts authority/catalogues through its imports. |

Recovered specification: `GSIS_V1_CONSOLIDATED_SPEC_2026-11-11_REV49.md`, SHA-256 `8fce6177b98d8e5fd87ba924e56be31f4d70e179407782bc6dd1d78495762683`, from the owner-supplied Revision 49 ZIP. [Revised T1B plan](T1B_REVISED_PLAN.md) and [design addendum](T1B_CONTRACT_DESIGN_ADDENDUM.md) were published at `99b56377edf8cb34d05fccac671e3fbb65962ca4`; [merged contract](T1B_CONTRACT.md) records implemented limits. Historical documents' implementation prohibitions describe their original stage; they do not authorise this proposed implementation. Research used the supplied conversation, recovered specification and repository records. No searchable archive of all past chats or live staff catalogue was available; no live records were accessed.

## Recommended representation and ownership

Keep the existing Contacts authority field **`eo`**, an explicit accepted yes/no record keyed by school and permanent Staff ID. It carries its own revision, effective interval and provenance. Role remains the job; EO Appt Level remains appointment information. Neither is a substitute for accepted EO evidence. No new parallel authoritative boolean is needed.

Use Claude's proposed **EO Appt Level presentation** with explicit “EO” (base/no named appointment) and “Non-EO” choices, retaining approved named EO appointment choices. This is a proposed v1 Contacts editing interface, not a change to the legacy derived Deploy column. An explicit accepted selection records the EO status and, where supplied, the separate appointment reference through the Contacts owner. A named appointment cannot silently create EO authority on read: it needs an accepted staff record and consistent status. Resolve conflicts during owner review; do not guess from ST, TC, a Role mapping, a teaching timetable, name suffix, or a blank cell.

A later write design must validate and commit related status/appointment changes atomically within Contacts' owning database, preserving earlier immutable revisions and stable operation identity. Deploy consumes the accepted projection and has no authority to backfill it. Do not reuse legacy Role-to-level recalculation to overwrite status. An owner-approved mapping may prepare suggestions for review; a suggestion or HR import is not accepted evidence. Contacts Power Users confirm each record. Catalogue definition governance stays with the approved catalogue owner; accepting staff assignments does not grant catalogue editing rights.

Rejected alternatives: adding EO to Role would conflate jobs with employment classification and compete with ST/TC roles; deriving EO from workload eligibility misclassifies school leaders and incomplete profiles; blank-as-false fabricates evidence; changing only the picker leaves the legacy recalculation bug; automatic tag-based backfill bypasses acceptance. A separate EO yes/no control is a fallback presentation if the combined picker obscures status, using the same canonical `eo` field, not a second truth.

## Required completeness gate before T1D go-live

A read-only, authorised Contacts readiness report must enumerate **every staff member in the school's Contacts directory**, including inactive and provisional entries, with any missing SMC, EO or School Leader accepted record. Do not silently filter to teachers, active staff or linked accounts. Explicit false counts as complete. Pending/rejected proposals and blank values do not. Report missing evidence separately from expired, future-only, revoked, conflicting or malformed records; all unresolved readiness errors block go-live. Preserve Core's existing interval evaluation semantics rather than changing runtime policy in this plan.

The restricted report contains school, permanent Staff ID, necessary display name, missing/invalid field names, reason, relevant source/field revisions and evaluation time. Keep staff rows out of public Git/CI logs and ordinary error responses. Verify identity uniqueness, directory coverage, catalogue/group dependencies and observation freshness. A failed, truncated, stale or partially paginated scan must return **incomplete**, never an empty success list. Use a consistent source manifest/revision across bounded pages; recheck it at completion and before cutover. A new staff record or authority change invalidates prior readiness evidence. Define the cutover recheck/fence in the later integration contract; there is no cross-D1 atomicity claim.

Go-live waits until the missing list is empty, all other completeness/integrity checks pass, and Contacts Power User acceptance is evidenced. Historical-only records are not silently exempted; a different population policy needs an explicit owner decision. Newly created provisional staff after go-live remain unverified until accepted, with honest denial where authority is required; they do not receive default false records. Re-run readiness for changes and maintain a bounded incomplete-record queue.

## Proposed non-retryable missing-evidence contract

Introduce `AUTHORITY_EVIDENCE_MISSING`: `outcome: 'deny'`, HTTP **403**, `retryable: false`. Use it only after a trusted, school/staff/query-bound current Contacts response establishes that a required authority record is absent or nonaccepted. Missing one or all three records follows the same honest classification; do not relax T1A's three-record requirement for SMC read in this change. User message: “Your authority records are incomplete. Contact a Contacts Power User.” Do not expose other people's fields or raw provider responses. Retrying unchanged data cannot repair it; an accepted correction permits a fresh evaluation.

Do not blanket-map PROVIDER_INVALID/503 to 403. Actual timeout/unavailable remains retryable unavailable; malformed/untrusted responses retain safe provider-error handling, stale evidence retains conflict semantics, explicit false remains complete data evaluated under the existing capability matrix. Accepted future/expired/revoked intervals are not silently relabelled missing. Independent Core Admin authority and read-only impersonation remain unchanged; the global readiness requirement is not a new per-request Admin dependency.

This needs a separately reviewed Core error-contract extension plus Contacts adapter mapping, consumer handling and audit compatibility. Core's audit projector validates known reason codes and discards unapproved fields; do not assume attaching missing-field lists or evidence objects persists them. Minimal approved reason metadata suffices for this denial. Durable observation recovery remains separate **F5 OPEN**; this proposal neither closes it nor changes source revision/sequence on every read.

## Owner questions and classification worksheet

Settled: EO meaning, teachers/STs/TCs are EO, no inference from teaching duties, all three explicit records before go-live, Contacts Power User accepts records. The following labels were found in specification/source, not verified against a current live catalogue. Labels overlap; they are not mutually exclusive staff types. Owner answers guide per-person review, never runtime permission inference.

| Group | Known labels for owner classification |
| --- | --- |
| Employment/modifiers | BT, UT, SRE, FAJT, 4/5, Full-time; combinations such as FAJT + BT |
| Subject/specialist | MTL, PE, Art, Music, Specialist |
| Appointments | HOD (including HOD SM), SH, LH, AYH, SSD, YH, LT, MTT; ST and TC already confirmed EO |
| School leaders | P, VP, SL; approved capability policy already treats School Leader as implying EO, not SMC; still require explicit consistent records |
| Other recognised source labels | MK/MKE, SENO, Counsellor, AE, AM (ICT), ICT A/M, OM, OSO, CSO, DE, Dentist, Library/Librarian, Reception/Recep, Sci Lab, Support |
| Membership flags (not employment categories) | SL, SC, SMC, KP, TL, SDT, CMT, SAT, Support, MK |
| Appointment status | Acting/Ag and OF are separate modifiers, not EO evidence |

Sources: Revision 49 CI04/TK01/1K-B; `shared/teaching-rules.js` exclusion patterns, membership handling and defaults; Contacts MEMBERSHIP_FLAGS. Some source abbreviations are intentionally unexpanded because school meaning has not been confirmed. The source spelling is authoritative evidence of recognition, not proof of classification or completeness.

1. Which listed categories can be **Non-EO while teaching or planning**? In particular confirm UT, SRE, FAJT and MK/MKE and any outside instructors/coaches. Identify the activity/module: teaching assignments, Roster planning and Deploy access are different. Existing approved capability rules remain in force; exceptions requiring broader Deploy access need a separate policy decision.
2. Which source should Contacts Power Users use to verify status (approved HR/staff list or owner-confirmed individual review), and are there ambiguous/historical cases needing owner resolution? No live lookup or migration is authorised by this plan.
3. Confirm the proposed “EO”/“Non-EO” choices under the EO Appt Level presentation and the distinction from named appointments. The technical representation is the existing accepted `eo` boolean; the owner need not choose field names or schemas.

## Later implementation and verification gates

Current documentation allowlist is exactly this file and `docs/coordination/tasks/v1-eo-authority-plan.md`. No implementation paths are authorised. After owner answers, coordinator must approve separate exact scopes for (a) Core/adapter error-contract changes and tests, (b) Contacts acceptance UI/storage and readiness report, and (c) T1D consumer integration. Do not include legacy generated backends, production gateways, migrations or infrastructure implicitly. Contacts owns facts and acceptance; Core owns capability/error semantics; T1D owns transport and cutover integration; Deploy consumes projections.

Required future tests (none executed by this plan):

- Ordinary teacher with blank Role/level but accepted EO=true retains status through role changes; ST/TC appointment and EO coexist; explicit Non-EO=false is complete; combined tags preserve independent values and grant no access themselves.
- Missing EO with SMC=true and SL=false, and all three missing, return exact new code, deny/403/non-retryable; pending-only evidence cannot allow. Explicit three false records yield ordinary capability denial. Valid SMC/EO grants remain as specified; independent Admin and impersonation regressions stay intact.
- Timeouts still yield retryable 503, stale observations conflict, malformed/wrong-school/wrong-staff evidence fails safely; future/expired/revoked interval boundaries retain established semantics. Audit projection accepts the new reason without leaking fields or inventing durable evidence.
- Readiness detects a missing field on an inactive/provisional staff member, duplicate identity, stale catalogue dependency and last-page failure. Zero unresolved rows only passes after complete coverage; concurrent additions/changes invalidate the scan. The three fields' explicit false values do not create false positives.
- Acceptance write timeout: recover by original operation identity and durable result before retry; duplicate operation does not create conflicting accepted revisions. Crash between related status/appointment writes leaves neither partially accepted. Restart/recovery preserves accepted records, source identity and provenance; repeated reads leave content revision/sequence unchanged. These require an authorised durable-store implementation, not only synthetic reader tests.
- Reader lifecycle respects PR125 L1: per-request/bounded-batch readers or evidenced sizing/reset; exercise more than 128 staff/profile streams without an unnoticed partial readiness scan. T1D must validate this at realistic authorised scale.

Exact-head Claude review, canonical build/regressions and integration evidence belong to those later implementation tasks. Current plan can be reviewed while questions are pending; implementation cannot begin. Official **T1B-01 and T1B-02: Not tested**. T1D runtime, migration, durable recovery and go-live: **Not tested**. No merge, deployment or production change follows from this proposal. Reverting these two documentation additions has no runtime/data rollback effect.
