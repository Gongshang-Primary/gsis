# Task Claim: v1 Deploy Group & Duty Validation Parity

- Task ID: `v1-deploy-group-duty-validation`
- Model: `Antigravity`
- Branch: `antigravity/v1-deploy-group-duty-validation`
- Reviewer: `Muse` (exact-head review)
- Coordinator / Merger: `GPT`
- Scope: Close the three backend validation parity gaps identified in `docs/coordination/tasks/v1-deploy-v09-frontend-parity-audit.md`:
  1. Within-group duplicate teacher check across `slots`, `additionalDeputies`, `tls`, and `legacyLeadership` (`409 DUPLICATE_GROUP_MEMBER`), preserving grandfathered pre-existing duplicates for repairability.
  2. Department `tls` appointment-level eligibility check requiring active eligible ST / LT / MTT teachers for new TL assignments (`409 TL_ELIGIBILITY_REQUIRED`), preserving grandfathered retained TLs.
  3. Same-weekday Duty interval overlap check (`a.start < b.end && b.start < a.end`, `409 DUTY_OVERLAP_CONFLICT`), allowing adjacent intervals (`a.end === b.start`) and blank publishable duty slots, and preserving untouched grandfathered overlaps.

## Files Claimed
- `docs/coordination/tasks/v1-deploy-group-duty-validation.md`
- `v1/services/deploy/model.mjs`
- `tests/v1-product-deploy-group-duty-validation.mjs`

## Constraints
- Zero v0.9 changes (`npm run build` zero drift).
- Prove both negative-case rejection and positive-case acceptance through real built Worker/D1 requests.
