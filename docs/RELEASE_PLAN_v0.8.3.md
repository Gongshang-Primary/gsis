# GSiS v0.8.3 implementation and verification plan

Authorised full release, 21 October 2026. Baselines are the full v0.8.2 suite and committed v0.8.2a Contacts patch (`b5481c4e1882bb232e6c460fd690f4cb52aeeb46`). Item 084 records the user's report that the patched Contacts action does not work and request for a full v0.8.3 package. Item 085 adds the normal-teacher confirmed suspension list and main-screen navigation help. Item 086 adds separate inline Subject, Venue and Group apply arrows in Stapler Class view. Item 087 places Own arrangements beside No relief instructions and retains a confirmed-save boundary before its colleague chooser.

## Scope

Inspect the actual Contacts source and deployable, reproduce meaningful failure paths, fix the supported cause and integrate the result into the full suite. Retain the existing compact **add** / **+** contract and exact vCard name mapping. Keep all full v0.8.2 features and school configuration. Add item 085: today/future confirmed suspension views for active mapped eligible teachers independently of plan membership; a dedicated confirmed list, retained delegate planner rights and main-screen Timetable help. Verify frozen revisions and redacted imported absence reasons throughout current/baseline/provenance copies without modifying stored SMC evidence. Refresh versioned documentation and make outer-package extraction versus inner-frontend upload explicit.

## Verification gates

1. Distinguish an installed-version, asset delivery or browser handoff failure from a contact-file serialization defect using available evidence. Do not infer a production cause from the version label alone.
2. Verify the complete Contacts page loads, the selected row produces the expected file and no extra Contacts permission/API call occurs.
3. Exercise field correctness, reserved characters, Unicode, missing optional values, compact controls, touch/keyboard access, fallback and session cleanup using synthetic data.
4. Verify teacher access for today/future confirmed dates, exclusion of past/unconfirmed ordinary views, no dependency on plan membership, frozen revision privacy, nested absence-reason redaction, delegate planning access and no writes from browsing.
5. Verify each class-field arrow changes only its field on linked current lessons including Card Pit, preserves baseline/recess and other unapplied inputs, rejects blank/invalid input without plan mutation, supports one Undo and stays local until Save to online. Read-only teachers must have no arrows.
6. Verify Own arrangements is available in editable preview/saved headers with or without text, saves new/dirty records before the chooser, preserves text/No relief instructions, recovers the exact uncertain save on the same active report/date, and creates requests only through Submit requests.
7. Check actual native-device handoff only where an Android/iPhone contact app is available; otherwise retain this as an explicit installed-device limitation.
8. Run current release checks, generated-source consistency, archive integrity and full-package component/version assertions. Record actual outcomes in `VALIDATION.md` and `RELEASE_SUMMARY.json`.
9. Preserve the full changelog, source and committed repository history with the package. Production installation, timetable publication and staff messaging are separate operations.

## External boundaries

The existing school sign-in configuration remains required. The contact-file action requires no People API or extra Contacts OAuth scope and does not write a personal address book. Previously saved contacts and Google grants are untouched.

The last recorded 21 October observation of `gsis_timetable_updated_button_v2` was PENDING. This plan is not a fresh Meta status check. Retain the approved existing route until exact approval and intentional activation are established. Preserve the live Worker flags, minute cron, signed service connections and private media binding.
