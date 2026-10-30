# deploy-siue-by-specialism: SIUE for PE, Art and Music as Relief Settings fields

- Status: implementing on a prepared branch; PR waits for an available queue slot.
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 14:30
- Branch: codex/deploy-siue-by-specialism
- Base SHA: 77ac1007000c7a832e65722415e5165b01ea00e5 (stacked after FAJT and shared release labels).
- PR: none
- Files/domains owned: shared/relief.js (settings schema, validate, analyse), Deploy Relief Settings UI (public/relief-ui.js and its section in public/app.js), Roster calculations text where SIUE is shown, generated copies, tests.
- Out of scope: offload rules, budgets, PD values.

## Request
Relief Settings gets more user-adjustable fields: SIUE (general) plus SIUE for PE, Art and Music specialists. Owner supplied a working study (sensitivity-study_2PD.html, "Custom S" panel) to reuse its logic.

## Logic to reuse (from the owner's study, already matching Deploy's formula)
- Deploy today: `W_i = FTT + PD + Duties + Other + (1 + SIUE/100) × (T_i + OF_i × T_avg)` with one `siuePercent` (150) for everyone (shared/relief.js ~line 81: `siue=(r.Teaching+allowance)*settings.siuePercent/100`).
- Study: S per teacher = override for the teacher's specialism (PE, Art or Music) if set, else All. `allowance = OF × T_avg`, `siue = (teaching + allowance) × S`, `W_i = form + pd + duties + other + teaching + allowance + siue`, `R = floor(max(0, min(factor × (budget − W_i), capHeadroom)))`. The override applies to the specialist's **entire** teaching-and-offload term, including any mixed-subject teaching.
- Same units: study S = 1.5 equals Deploy SIUE 150%.

## Required
1. Settings fields (Relief Settings, beside "Preparation and marking: SIUE (%)"): **SIUE PE (%)**, **SIUE Art (%)**, **SIUE Music (%)**. Blank = use the general SIUE. Finite, non-negative; same validation as `siuePercent`.
2. Schema: `relief` settings add `siuePercentBySpecialism: {PE, Art, Music}` (null = inherit). `defaults()` gives all null, so existing saved settings calculate exactly as today. `validate()` must accept the new key (it rejects unknown keys today), keep `schema` handling backward compatible, and old clients must see the existing "refresh" message rather than silently dropping the field.
3. Specialism from data, not names: a teacher is a PE/Art/Music specialist when their Deploy **Subject Modifier** (or the teacher subject field the Staff-tag rules already read) contains PE, Art or Music. If more than one applies, use the lowest SIUE among them and show it in Details. No parsing of display names like "(PE)".
4. Details/Relief calculations: show which SIUE was applied per teacher ("SIUE 0% (PE)" or "SIUE 150% (general)"), and the formula line uses that value.
5. Roster's My Calculations shows the SIUE actually used for the person.

## Acceptance
- All overrides blank: every R equals today's values for a production-like fixture (byte-identical calculation output).
- PE override 0%: a PE specialist's W_i drops by (T + OF × T_avg) × 1.5 and R rises accordingly; non-specialists unchanged. Reproduce two rows of the owner's study (e.g. Choon Hong (PE): S=2 all, PE S=0 → R 34 with study inputs).
- Mixed modifiers (e.g. "PE, MTL"): PE override applies to the whole term.
- Invalid entries (negative, text) refused with the existing message style.

## Implementation plan

Model: Codex. Add nullable specialism percentages with read compatibility for old saved settings and a calculation-version refresh guard. Select PE/Art/Music from Subject Modifier or the existing legacy subject field; apply the lowest matching effective percentage to the whole teaching-plus-offload term. Keep default calculation rows unchanged when all overrides inherit. Surface applied overrides in Deploy details and Roster My Calculations. Regenerate bundles; run focused formula/UI checks and the full Linux suite. No merge or deployment.
