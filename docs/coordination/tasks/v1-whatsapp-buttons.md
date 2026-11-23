# v1-whatsapp-buttons (W4)

- Status: implemented; PR open for Muse review
- Owner/model: Claude. Reviewer: Muse at the exact head. Merger: GPT.
- Project: v1. Updated 21 Nov 2026 SGT. Branch `claude/v1-whatsapp-buttons` from main `b8d9b110`.
- Source: `docs/v1/WHATSAPP_TEMPLATE_REVIEW_2026-11-21.md` (row B, follow-up decisions) and `docs/v1/WHATSAPP_V1_BUTTON_TEMPLATES_DRAFT.md`.

## Owner decisions (21 Nov 2026)

Button templates in v1 now; new v1 templates at `https://gsis.gsps.edu.sg` (10 submitted, PENDING Meta review); evening summary uses the approved `gsis_relief_evening_v2` wording.

## Problem

1. v1 `templateFor` built only a body component. A template with a dynamic URL button cannot be sent without a button parameter, so v1 could not use any button template, including the two v0.9 already used (peer request, timetable change).
2. Separate baseline gap: the peer-change `mutual_override` notice (no snapshot) got no private link, so its link field was empty.

## Change

- `v1/services/roster/templates.mjs` (new, moved from `service.mjs`): `templateFor` supports per-template `button: "token"` (adds a URL button component whose parameter is the private token) or `button: "static"` (no parameter). A token button without a valid token refuses before send (`TEMPLATE_LINK_UNAVAILABLE`); any other `button` value is a configuration error (`TEMPLATE_BUTTON_INVALID`).
- `v1/services/roster/service.mjs`: passes `linkToken` with `link`; issues a private duties link for `mutual_override`.
- `tests/v1-product-roster-adhoc-delivery.mjs`: token button carries the same token; peer-change gets a link (fails without the fix); refusal and static cases.

## Templates, triggers and samples

Unchanged triggers; see the review record. Example (route 4, after approval):

> *Relief Assignment*
> Hi Ms Tan Mei Ling, Relief Team has assigned you relief duties on Thu 26 Nov 2026.
> P3-P4 EL, 4 Integrity, Room 3-04
> View the relief instructions and acknowledge your duties using the button below.
> Thank you.
> [View and acknowledge] → https://gsis.gsps.edu.sg/roster/external/#token=<private>

## Activation (deployment configuration, not code)

`WHATSAPP_TEMPLATES_JSON` maps each key to `{name, language, parameters, button}`. Only after Meta approves each `gsis_v1_*` template: set its name and `button` (`token` for routes 1, 2, 4, 5, 6, 8, 10; `static` for 3, 7, 9), and map `relief_evening` to `gsis_relief_evening_v2`. Until then keep the approved link-in-body names. Never map v1 to the v0.9 button templates: their URLs point at the v0.9 hosts. Parameter lists must be checked against each template's body order at activation.

## Out of scope

Live configuration, sending, deployment, the W2 final-run split.
