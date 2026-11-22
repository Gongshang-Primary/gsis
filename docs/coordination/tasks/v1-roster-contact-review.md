# v1-roster-contact-review (W1)

- Status: implemented; PR open for Muse review
- Owner/model: Claude (owner 21 Nov 2026: "one by one in most-logical sequence")
- Reviewer/model: Muse at the exact PR head. Merger: GPT.
- Project: v1. Last updated (Asia/Singapore): 21 Nov 2026
- Branch: `claude/v1-roster-contact-review`, from main `b8d9b110`
- Source: `docs/v1/WHATSAPP_TEMPLATE_REVIEW_2026-11-21.md` row 3 and W1

## Problem (v0.9 baseline gap)

v0.9 `backend/Code.gs` `contactCreate` queues `contact_review` for each configured Contacts Admin after Roster creates a new inactive external relief contact. v1 `createRosterContact` registered the contact in Contacts but queued nothing.

## Owner decision

Recipients: **Contacts Power Users only** (owner 21 Nov 2026). Global Admin alone does not receive it.

## Template, trigger and sample

- Template: `contact_review` → `gsis_contact_review_v1` (APPROVED on Meta). Button version W4 follows separately.
- Trigger: Roster `contactCreate` saves a **new** inactive external relief contact (not the existing-contact mobile update). One message per current Power User, keyed `contact-created:<operationId>:<staffId>`. A retry replays the original receipt. At send time the recipient must still be active, consenting and a current Power User; otherwise the job is cancelled with `RECIPIENT_NO_LONGER_POWER_USER`.

> *Contact Details for Ad Hoc External Relief*
>
> Hi Ms Tan Mei Ling.
>
> On https://roster.gsps.edu.sg, contact details for an ad hoc external relief teacher were added or updated on 26 Nov 2026.
>
> Please review these details as a Contacts Admin:
>
> New inactive external relief contact: Rahimah (SRE). Review permanent details in Contacts.
>
> Review and confirm the details in Contacts: https://contacts.gsps.edu.sg.
>
> Thank you.

Data fields carried on each job: `recipient_name`, `request_date`, `contact_review_details`, `contacts_review_url` (contract order), plus `summary` and `staffId`. `WHATSAPP_TEMPLATES_JSON` maps the parameters at deployment.

## Changes

- `v1/services/core/service.mjs`: internal `/internal/contacts-power-users`, bound to a valid Roster decision; returns Staff IDs of non-suspended accounts with a current explicit `contacts.powerUser` or `contacts.manage` grant (bounded 512).
- `v1/services/roster/service.mjs`: `queueContactReview` after a successful new-contact save (prepare/commit, outbox jobs); send-time Power User recheck in `dispatchRosterJob`.
- `tests/v1-product-roster-contact-review.mjs` (new): Power Users only, exact summary, idempotent retry. Fails on main, passes here.
- `tests/v1-product-roster-adhoc-delivery.mjs`: send to a current Power User; cancel after the grant is gone.

## Out of scope

Button version (W4), any live setting, template submission, provider send, deployment.
