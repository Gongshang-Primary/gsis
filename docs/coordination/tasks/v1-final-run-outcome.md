# v1-final-run-outcome (W2)

- Status: implemented; PR open for Muse review
- Owner/model: Claude. Reviewer: Muse at the exact head. Merger: GPT.
- Project: v1. Updated 21 Nov 2026 SGT. Branch `claude/v1-final-run-outcome` from main `b8d9b110`.
- Source: `docs/v1/WHATSAPP_TEMPLATE_REVIEW_2026-11-21.md` rows 13, 15, 18 and W2 (owner chose "Split: use 13 + 15").

## Behaviour (improvement over v0.9, owner decision)

At the 06:29 and 06:30 scheduled ticks on a school day, after the shared logic runs:

| Final 06:29 run | Message to duty SMC | Template |
| --- | --- | --- |
| Complete, periods uncovered | uncovered list | `relief_manual_review` (`gsis_relief_manual_review_v1`, APPROVED) |
| Complete, none uncovered | allocation summary + Relief Health | `relief_final` (`gsis_relief_final_v1`, APPROVED) |
| Not complete | unchanged: shared `smc_attention` | `gsis_relief_attention_v2` |

One alert per date (`final-outcome:<date>`), so a replayed tick or the 06:30 tick does not resend. Duty SMC, quiet-hour, recheck and delivery rules are the shared ones (kind `smc_alert`, audience duty SMC).

Samples:

> *Relief Allocation Requires Review*
> Hi Mr Lim Wei Jie, please review the relief plan for Thu 26 Nov 2026.
> The final scheduled allocation run is complete.
> 2 periods remain uncovered: P2 3 Kindness, P7 5 Respect.
> Please allocate the remaining cover and publish the relief plan here: https://gsis.gsps.edu.sg/roster/.
> Thank you.

> *Final Draft Relief Allocation*
> Hi Mr Lim Wei Jie, the final scheduled relief allocation for Thu 26 Nov 2026 is complete.
> 3 absent teachers. 12 periods have planned cover; 0 uncovered.
> Relief Health: 86.0%
> Review and publish the draft in Roster: https://gsis.gsps.edu.sg/roster/.
> Thank you.

## Why a v1 module

The 06:29 logic lives in `shared/roster-operations.js`, which also builds frozen v0.9 outputs; editing it would change the v0.9 build (CI blocks that). The new `v1/services/roster/final-run-notifications.mjs` runs after the shared tick, like the existing capacity-notification module.

## Changes

- `v1/services/roster/final-run-notifications.mjs` (new).
- `v1/services/roster/service.mjs`: call after `refreshNewSummaries` in the scheduled-notification tick.
- `tests/v1-product-roster-final-run-outcome.mjs` (new): gaps, covered, incomplete, off-slot, replay.

## Activation

`WHATSAPP_TEMPLATES_JSON` needs `relief_manual_review` and `relief_final` mapped (both APPROVED). Check parameter order against each body. No live change made.

## Not covered

The call site inside the scheduled tick is not exercised end to end by a test; the module is tested directly with the shared fixture.
