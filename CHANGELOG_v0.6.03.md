# GSiS v0.6.03

Baseline: v0.6.02. Authorized 13 October 2026.

## Q197 Ledger targets and compact presentation

Actual A_i = actual FTT + PD + duties + other non-teaching + teaching.
Target Q_i = actual FTT + PD + duties + other non-teaching + (1 - OF_i) * whole-school teaching / active eligible full-time headcount.

Exclude FAJT, 4/5 and RT from the denominator; retain their assigned teaching in the numerator. Use actual non-teaching periods once, not the modal FTT allowance. FAJT retains exactly 65/84 of the teaching reference with no appointment offload stacking. Existing configured 4/5 and appointment rules remain multiplicative. RT has no target or load classification.

At-load limits are floor(0.9 * Q_i) and ceil(1.1 * Q_i), both inclusive. Missing required inputs return unavailable. No full-time teachers means no reference, never division by zero.

Ledger shows rendered LaTeX above adjacent Actual total, Target and At-load range columns. Filters and exports use these same values. Compact controls and rows retain existing table scrolling. The calculation guide describes the new rules. Separate FTT-based specialist references remain explicitly labelled; they do not classify Ledger status.

Weekly cap still uses FTT + teaching. PDF relief R, its API, permissions, write protocol, save receipts and publication storage are unchanged. This is read-time calculation and frontend presentation, with no new backend read/write requests or migration. Roster remains specification-only.

The 2026 workbook was used for policy examples only. It is not imported by this release. Current saved versions and frozen publications keep their own data.
