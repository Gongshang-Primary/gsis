# Deploy ledger update, 6 November 2026

The ledger omits the Target offload % indicator. Target, At-load range and Load status remain. FAJT Target uses the same saved weekly budgets as relief: `fajtWeeklyPeriods / weeklyPeriods`. Current schema settings must provide finite positive budgets and a finite ratio; missing, invalid or legacy-only budgets show Needs configuration. The calculation guide displays the configured values. Default settings preserve prior results. This supersedes fixed-budget descriptions in the historical sections below.

# Current workload policy, v0.6.08

This section supersedes the historical target and TG demand rules below. Workload quantification is separate from relief W and R.

Schoolwide demand D is total planned weekly man-periods divided by active eligible full-time teacher headcount. Each offered form-class allocation and each independent TG contributes its weekly periods multiplied by max(1, distinct assigned eligible teachers). Existing actual assignments also count when a form-class cell is no longer offered. TG links identify pupils; they do not cancel class provision, and no Additional/Replacement choice is required. Unassigned duty slots contribute one period each. PD contributes two periods per distinct PLT member, with one member assumed for an empty PLT.

For teacher i, A_i is actual FTT + PD + duties, individual load is all actual deployed periods, and B_i = (1 - OF_i)(D - A_i) + A_i. At load is the inclusive interval [floor(0.9 B_i), ceil(1.1 B_i)]. Unstaffed demand does not create an individual's actual load. Missing required values withhold a benchmark.

FAJT, 4/5 and RT provision stays in demand but these staff are excluded from the full-time denominator. FAJT retains the configured relief `fajtWeeklyPeriods / weeklyPeriods` without appointment stacking; 4/5 retains configured employment and appointment rules; RT has no benchmark or load status. Specialist averages use assigned specialist periods divided by assigned teacher headcount, including supplementary staff. The three individual columns show specialist periods, subject average and percentage of that average. Tamil membership requires a TL assignment and includes TL, HTL and CCE TL. These indicators do not determine relief or overall load status.

Relief retains the PDF formula and floors final nonnegative R to an integer. No relief formula, actual deployment assignment or published snapshot changes in v0.6.08. See CHANGELOG_v0.6.08.md and VALIDATION.md.

## v0.6.04 relief output

Only final individual R changes: floor(max(0, raw R)). Preserve Wi, OF, Ti and school reference precision. Stats averages use the resulting integer individual quotas and may remain fractional. PAL additions now accumulate as specified; retained teachers continue to count until an authorised editor removes their PAL allocation.

# Ledger target update in v0.6.03

This supersedes the historical school-target rules below. Ledger compares actual FTT + teaching + PD + duties + other non-teaching against actual non-teaching plus the retained teaching fraction times whole-school teaching divided by active eligible full-time headcount. Exclude FAJT, 4/5 and RT from that headcount. FAJT uses exactly 65/84, without appointment stacking. RT has no target. Use inclusive floor(90%) and ceil(110%) limits on the whole target. The modal FTT allowance remains only in separate specialist/reference calculations. Relief and weekly-cap formulas are unchanged. See CHANGELOG_v0.6.03.md.

# v0.6.00 current policy

Q186 through Q190 supersede historical formula-adoption and Expected R descriptions below. All versions use the PDF W and actual-load R with calculationVersion whole-week-v2. Legacy settings are normalized without changing source snapshots. One common W counts all actual assigned teaching, including PAL and SDR; school T_avg remains the OF reference. Specialist subject averages are informational only and use assigned periods/headcounts, not unassigned provision demand. See API_CONTRACTS_v0.6.00.md and the newest queued entries for current policy.

# Whole-week relief model in v0.5.08

This section supersedes earlier relief formulas below. The history is retained for traceability. School teaching targets and specialist calculations remain separate and unchanged.

The configured weekly work budget includes afternoon work. Defaults are 84 periods for full-time, 84 × 0.8 = 67.2 for 4/5, and 65 for FAJT. The operational window is 60 periods. It scales residual weekly capacity by 60/84 for full-time and 4/5, and by 1 for FAJT. These are policy estimates, not identified free timetable slots.

`T_avg = all actual teaching teacher-periods / active eligible full-time teacher count`. FAJT and 4/5 teaching remains in the numerator but neither group is in the denominator. This is distinct from the older offload-weighted standard teaching target. The previously quoted 2026 value near 29.58 is contextual, not a hardcoded or newly verified total.

`Wi = FTT + PD + duties + (1 + SIUE/100) * (Ti + OF*T_avg)`.
`R = max(0, timetableFactor * (weeklyBudget - Wi))`.

SIUE defaults to 150%. OF composes applicable appointment and other nonemployment allowances, including BT and TC, with explicit-role overrides and acting treatment. Employment reductions occur only in budgets. Numeric teaching caps remain caps. Personal lunch is excluded; lunch duty remains a duty. Missing demand, employment ambiguity, unresolved required rules or a zero denominator produce unavailable R. Valid zero and fractional precision are retained.

PAL Auto copies P1/P2 Form Teachers once by class and teacher identity. Existing manual matches prevent duplication. PAL teaching affects Ti and shared T_avg, so it can affect other teachers' OF allowances as well. Manual mode retains copies. All resulting workload and relief values derive from the same version.

Only Admin edits relief/PAL business rules. SMC can see all teachers' applied breakdowns. Existing versions retain their old formula until explicit Admin adoption, with old settings and audit preserved. New blank versions use the new model. Duplicates retain the source model, and published snapshots stay frozen.

Ledger and Stats use confirmed server R; pending edits hide it. Stats retains its arithmetic mean over active eligible teachers in each category, with unavailable results for incomplete/empty groups. The receiving app owns weekly Blocks and deducts them once after R. See `API_CONTRACTS_v0.5.08.md` for fields and permissions.

## Historical workload review

# Workload and relief presentation in v0.5.06

The relief engine and API calculation introduced in v0.5.05 remain unchanged. Ledger adds each teacher's R before Block deductions from that engine. R uses the selected deployment version's mode and factors, including unsaved version drafts shown by the application. Changing only Block does not change Ledger R. The existing API `R` field continues to mean the same pre Block quota.

Stats adds **R (average)**, the arithmetic mean across the active eligible teachers in each existing category. It shows Unavailable for an empty category or if any included teacher has unavailable R, rather than treating missing data as zero or silently averaging a partial category. A valid zero participates in the mean. The existing teacher, employment, appointment and specialist categories overlap and must not be added into a school total. Average per teacher was the implementation assumption announced during this commit; it was not a user answer to the earlier average versus total clarification.

Stats fits its width to content on load and through Compact, while preserving readable text and horizontal scrolling where needed. Workload Settings moves to the main navigation immediately right of HR Settings. Workload's rendered fraction numerator and denominator use the equation's main font size; their containers reserve at least two normal line heights and grow for taller content. Mathematical values and the normal use of smaller subscripts are unchanged.

New department TLs and multiple Deputy selections do not create extra teaching, PD, relief or offload allowances. PLT membership continues to contribute PD once per distinct PLT under the existing rules. TG class associations still do not multiply assignments or teaching load.

See `API_CONTRACTS_v0.5.06.md` for current integration notes and `VALIDATION.md` for the completed checks. The retained calculation and historical decisions follow.

# Relief planning and TG associations — v0.5.05

Q150 preserves one teaching-group identity when it is associated with one or several same-level classes. The class checkboxes describe the group's source scope. They do not replicate its assignments or multiply teaching periods. Venue is independent. Existing specialist demand still counts each defined distinct TG once under its subject rules; actual workload still counts each teacher's actual TG assignment once.

Q152 introduces a separate weekly relief planning quota. It does not change the existing FTT/teaching/non-teaching ledger, specialist targets, teaching caps or load-status band. The version's relief factors default to 12 periods/day, five days/week, two lunch periods/day and SIUE at 150%. Actual teaching is the default basis. Settings and teacher Blocks persist through the normal version draft Save flow.

Let B = periods/day × days/week, L = lunch periods/day × days/week, q = the existing combined retained capacity (1 − offload), and X = the selected teaching basis. FTT, PD and Duties below are actual assigned weekly values in both modes:

\[
R=\max\left(0,q\left[B-L-FTT-PD-Duties-X-X\frac{SIUE\%}{100}\right]\right).
\]

\[
R_{remaining}=\max(0,R-Block).
\]

Actual mode uses actual assigned teaching directly as X. It does not discount that teaching before SIUE. Expected mode uses the existing teaching target: q × (S − F) for an ordinary teacher, or q × the subject base demand-per-teacher for a teacher with one resolved specialist target. Multiple specialist targets remain unavailable for Expected relief because they are separate targets and cannot be added or chosen silently. Both modes then apply q once to the final remaining weekly budget. The combined offload rules retain explicit-role replacement, multiplicative independent employment factors and other approved behavior.

A hypothetical Actual example, not a staff result: B=60, L=10, FTT=5, PD=2, Duties=1, teaching X=12, SIUE=150%, q=0.7 and Block=3. SIUE is 18. The pre-offload remaining budget is 60−10−5−2−1−12−18=12. Therefore R=0.7×12=8.4 and remaining R=8.4−3=5.4 periods/week. Block is deducted after R; it does not receive a second offload factor. Larger Blocks clamp remaining R to zero. Fractions remain unrounded in the calculation and API; the UI displays up to two decimals.

Missing/invalid settings or workload inputs, unresolved capacity rules, inactive/ineligible teachers and ambiguous Expected targets produce unavailable relief rather than numeric spare capacity. A duplicate version copies factors and Blocks; a fresh version copies factors but clears Blocks. Later edits stay within their version.

The authenticated read-only relief API exposes R, Block, remaining R, inputs and version provenance. It explicitly reports `planningQuota:true` and `timetableAvailability:false`. The figures do not establish free timetable periods, assign relief lessons, reconcile event-based Blocks or send notifications. Timetable and relief-assignment viewports remain future work. See `API_CONTRACTS_v0.5.05.md` for exact integration behavior.

## Historical decisions

The prior workload decisions below remain historical context. Where older text says no remaining-capacity calculation exists, that describes the specialist view at that earlier release; the separate v0.5.05 relief calculation above now applies.

# Confirmed specialist rebuild — v0.4.15

This section supersedes historical specialist overlap/modifier-pool rules below. School-wide actual ledger and quota rules are retained.

For specialist subject s, count each offered form class and extra distinct TG (TL uses defined groups) with its weekly Subject Load L. Demand counts distinct active assigned teachers A, using one provisional teacher when unstaffed:

\[
D_s=\sum_{g\in G_s}L_g\max(1,A_g).
\]

N_s is distinct active eligible teachers assigned the main specialist subject. TTb modifiers do not define this pool. Missing PE/Art/Music modifiers are flagged in Teachers. Inactive assignments remain visible and are flagged in IP Deploy, while being excluded from specialist demand and pools. TL demand includes TL, HTL and CCE TL TGs at their own subject’s load; only TL assignments define its teacher pool.

The teacher’s subject specific target is:

\[
Q_{i,s}=a_i+(1-o_i)\frac{D_s}{N_s}.
\]

The additional pool reference is:

\[
R_s=\frac{D_s}{\sum_{i\in P_s}(1-o_i)}+F.
\]

Ordinarily a_i = F. The existing explicit No FTT expected setting uses a_i = 0. Other teaching subjects increase actual workload but do not change a specialist target. Multiple specialist targets are shown separately; never add them. No remaining-capacity allocation is calculated. Load status continues to compare actual FTT + all teaching with the teacher’s school-wide quota and outward-rounded ±10% range.

| Art demand 120; FTT 5; three assigned teachers | Retained fraction | Individual target |
| --- | ---: | ---: |
| No offload | 1 | 45 |
| 30% offload | 0.7 | 33 |
| 20% offload | 0.8 | 37 |

The pool reference is 120 / 2.5 + 5 = 53. Individual teaching targets sum to 100 rather than 120: the chosen headcount formula intentionally does not redistribute offloaded demand. Display the pool reference separately to make this pressure clear. The frontend calculation guide includes this example and an actual-workload example with other subjects.

No assigned specialist teacher or missing load gives an unavailable target/reference, while defined demand remains visible. PE/Art/Music/TL are defaults; settings can select other teaching subjects and their demand basis later. Invalid non-teaching specialist selections are rejected.

## Historical record

# Implementation update — v0.4.08

The user's 28 September 2026 commit instructions at 13:49 and 13:53 Singapore time authorize Q64–Q66. The confirmed rules below are now implemented, locally verified and packaged; there was no live deployment or publication.

- PD/TTT: two non-teaching periods per distinct PLT membership. Duties: one per assigned occurrence; no odd/even weighting.
- School standard S = assigned teaching periods / active eligible teachers + F. F is the modal per-level FTT-category total; use the highest tied mode and flag unequal values.
- Quota Q_i = F_i + retained_i × (S − F). The quota allowance F_i is the school F unless No FTT expected is deliberately selected, when it is zero. Actual assignment totals never raise or reduce the target.
- Green = floor(0.9Q_i) through ceil(1.1Q_i), inclusive; blue below and amber above. Actual FTT + teaching is compared against this band; exact hard caps remain separate.
- Extra defined subject TGs increase specialist demand even when unstaffed; actual teacher-periods remain assignment-based. TL groups count once.
- Art + EL is allowed and flagged, retaining full Art capacity after offload. Other unresolved specialist overlaps remain flagged.
- Whole-level TGs can reconnect to one same-level form-class venue sub-row, preserving their own assignments.
- Workload now has a short landing explanation and a How it is calculated guide for KPs, with current inputs and labelled illustrative examples.

| Verified illustrative case | Result |
| --- | --- |
| S=25, F=5, offload 20%, FTT expected | Q=21; green 18–24 |
| Same, No FTT expected | Q=16; green 14–18 |
| Two distinct PDs and three duties | 7 non-teaching periods |
| FTT 4,4,4,5,5,5 | School F=5 |
| FTT 4,4,4,4,5,6 | School F=4 |
| Art demand 82 / capacity 2.5 + F=5 | 37.8 |

Legacy PD/TTT entries without matching PLT membership are flagged rather than guessed or duplicated. No FTT expected is explicit; empty planning assignments are not treated as exemption. Missing loads and zero denominators remain unavailable. Tests cover these cases, structural save conflicts, receipt retry, publication isolation and Chromium flows. See the v0.4.08 validation document in the package.

The earlier next-revision-only statements below record the decisions when discussed; this implementation update supersedes them. Frozen v0.4.07 artifacts remain unchanged.

---

# Latest workload decisions — 28 September 2026, 13:47 Singapore time

## Q64 — Workload: PD/TTT, duties and offloaded-teacher quota

Logged 28 September 2026 at 12:55 Singapore time, after the v0.4.07 commit. Status: next-revision queue only; released code/package and live data unchanged.

Confirmed by the user:

- PD contributes **2 non-teaching periods per week per distinct PD attended**. Two different PDs contribute 4; three contribute 6. Contributions add to the teacher's non-teaching and Total periods, not teaching or FTT. Repeated membership/display of the same PD is not evidence of a second PD. Allocation is intended through PLT groupings; do not invent an extra session merely from duplicated membership records.
- Confirmed at 12:55:43: **TTT is the old name for PD via PLT**, and belongs to non-teaching. Treat TTT and PD as the same activity, not two independent contributions. Apply the 2-period/week rate once per distinct PD attended; two different PDs still add to 4. This resolves the earlier Unclassified TTT policy. Legacy naming must not create double counting during migration.
- Duties contribute **1 non-teaching period per assigned duty occurrence**. No odd/even alternation or duration scaling. Two duties contribute 2. This resolves the previously open duty weighting/frequency issue.
- Offloaded teachers' standard band is **±10% of their adjusted quota**, inclusive, compared with actual FTT + teaching. The user wrote the quota as **FTT + (1 − offload) × standard workload**. The follow-up at 13:30 resolves this expression to the teaching-only formula below; do not use the earlier double-counted-FTT interpretation.

Arithmetic clarification resolved at 13:30:49 Singapore time:

The user answered **21**, explicitly choosing the teaching-only offload calculation. The school-wide standard S = T/N + F already includes the standard FTT allowance F. Subtract that standard FTT component before applying the retained teaching fraction, then add the teacher's FTT term once: **Q_i = F_i + (1 − o_i)(S − F)**. Here F_i is the teacher-specific FTT term; the 13:34 response below accepts F_i = 0 for the intentionally-no-FTT example. In the confirmed example F_i = F = 5, S = 25 and offload = 20%, so Q_i = 5 + 0.8 × (25−5) = **21**. The inclusive standard band is **18.9–23.1**, compared with actual FTT + teaching. Actual assigned periods are not discounted. At zero offload with F_i = F, the formula returns S, matching the existing no-offload rule.

Rounding update, confirmed 28 September 2026 at 13:34:10 Singapore time:

The user responded to the intentionally-no-FTT example with: **round “aggressively”, i.e. 14–18**. Retain its quota of 16 and record the requested band as 14–18, replacing the unrounded 14.4–17.6 presentation for this example. This response accepts the no-FTT example with F_i = 0; do not reserve five FTT periods for a teacher intentionally given none. A temporary unfilled FTT assignment during planning is not automatically an intentional no-FTT designation.

Confirmed 28 September 2026 at 13:36:07 Singapore time: the user selected **A yes**, approving **outward rounding** and its use as the actual green-pill range, not just a displayed approximation.

For quota Q, calculate the unrounded ±10% bounds, then use:

- **Lower bound L = floor(0.9 × Q)**.
- **Upper bound U = ceil(1.1 × Q)**.
- Blue below standard when actual FTT + teaching < L.
- Green standard when **L ≤ actual FTT + teaching ≤ U**, including both endpoints.
- Amber above standard when actual FTT + teaching > U.

| Quota | Raw ±10% band | Confirmed green-pill band |
| --- | --- | --- |
| 16 | 14.4–17.6 | **14–18** |
| 21 | 18.9–23.1 | **18–24** |

This is the general rounding rule for the workload quota bands, preserving a consistent Summary pill calculation. For a no-offload teacher whose quota equals the school-wide standard, use the same band-rounding rule. Keep full precision in the quota, assigned periods and intermediate calculations; round only the final band boundaries. Exact integer endpoints remain unchanged. Missing inputs remain unavailable rather than being rounded into numeric bounds. A rounded standard band may be wider than exactly ±10%; label it as a rounded band where appropriate. Hard weekly caps remain separate, exact and unchanged: a green pill never overrides a cap breach.

Status: confirmed for the next revision; no source, release package, backend or published data changed by logging this decision.

The earlier expression that returned 25 is not selected. This resolves which standard-workload component receives offload; it does not alter the separate subject-specific-load formula or include PD/duties in the teaching cap.

| Illustrative teacher: S=25, standard F=5, teacher FTT=5, offload=20% | Quota | Inclusive band |
| --- | ---: | ---: |
| Earlier expression — not selected: 5 + 0.8 × 25 | 25 | 22.5–27.5 |
| Confirmed teaching component only: 5 + 0.8 × (25−5) | 21 | 18.9–23.1 |

These are illustrative values, not production teacher totals. The teaching-only interpretation is now confirmed. The intentionally-no-FTT example uses F_i = 0, quota 16; the user now requests its band as 14–18. The general rounding method is now confirmed as outward rounding: floor the lower bound and ceil the upper bound. Do not silently treat a temporary unfilled FTT assignment during deployment as an intentional no-FTT designation; the already confirmed cap still uses that teacher's actual FTT, including zero when none is assigned. Actual assigned periods are never discounted. Non-teaching remains outside the cap and pill comparison. Hard weekly caps remain separate from this ±10% band; a standard-band result cannot waive a cap breach.

At 12:56 the user asked to rephrase the TG question. Two distinct matters were previously listed: (1) workload demand—whether an additional specialist TG adds required subject periods beyond ordinary form classes, including before a teacher is assigned; (2) optional editing—whether a whole-level TG may later be attached back to a particular form class. Do not conflate them. Illustrative workload question: five P5 form classes at Art 2 periods each require 10; one extra Art TG at 2 periods could raise the specialist required-demand numerator to 12. Actual assigned teacher-periods already include a staffed extra TG; that confirmed rule is not being reopened. Rephrase the required-demand choice first; the optional reverse-link feature can remain aside.

Confirmed 28 September 2026 at 12:59:25 Singapore time: **yes**, an additional specialist TG increases the required subject-period numerator even before a teacher is assigned. For the illustrated five Art form classes at 2 periods, demand is 10; adding one extra Art TG at 2 periods makes 12. This is consistent with the agreed required-provision numerator, independent of deployment completion.

Keep two separate quantities:

| Extra TG with weekly load 2 | Required subject periods added | Assigned teacher-periods added |
| --- | ---: | ---: |
| No teacher | 2 | 0 |
| One teacher | 2 | 2 |
| Two teachers, each full load | 2 | 4 |

For specialist demand that currently uses form-class provision, count ordinary applicable form classes plus genuinely additional defined subject TGs, each once at its subject/level load. TL already counts defined TL groups: include an extra TL group once, not twice through a second additive path. Count canonical provision records, not venue displays; changing a TG's venue, name or form/whole-level scope does not create another TG. Do not add an ordinary form class twice merely because it is represented in multiple views. Removing an extra TG removes its required contribution. Actual workload remains assignment-based; do not add the required-demand baseline to assigned totals. School-wide standard currently uses assigned teaching periods, so an unstaffed TG changes specialist required demand but not that assigned-teaching numerator. Subject modifiers, retained-capacity denominators and the TL assignment-based teacher pool remain as previously agreed.

### Specialist capacity and modal FTT — confirmed 13:39–13:40 Singapore time

On 28 September 2026 at 13:39:13, the user specified: Art teachers should not teach EL; flag but allow an exception and **use Art capacity**. Interpret this as keeping the active Art-modifier teacher's full retained capacity (1 − offload) in the Art denominator, without subtracting or apportioning an EL share. Display the Art reference despite the advisory Art + EL conflict; do not suppress it merely because of that combination. Actual EL assignments still contribute their full configured teaching periods to the teacher's workload, school assigned totals, cap and Summary comparison. No assignments are removed or blocked. The Art pool remains modifier-based, so an active Art-modifier teacher with no Art TG yet still belongs to it. This resolves the specific mixed Art/EL capacity question; do not silently invent capacity-sharing rules for other combinations or replace the existing Art/Music conflict warning.

The user also specified that FTT should be equal; if unequal, **flag but allow** and use the school modal value. At 13:40:54 the user explicitly corrected “model” to **modal**. The school standard FTT allowance is therefore the most frequent configured per-level FTT-category total across P1–P6. Use the configured FTT category (currently the combined Assembly + FTGP + FTT allowance), not just the subject named FTT. Each level supplies one value; do not weight the mode by class counts or staffing. Equal values naturally return the shared value. Unequal values produce a visible advisory warning while allowing saves and, when a unique mode is available, the school calculation. Do not replace actual assignment loads with this school reference or alter the underlying Subject Loads.

Illustrative check only: level FTT allowances **5, 5, 5, 5, 4, 6** give school F = **5**, with an unequal-FTT warning. Use this F consistently wherever the agreed formulas require the school FTT reference, including S = T/N + F, the specialist reference, and Q_i = F_i + (1 − o_i)(S − F). Teacher-specific actual FTT and the intentional-no-FTT rule remain distinct from that reference.

Confirmed 28 September 2026 at 13:45:56 Singapore time: the user answered **5** to the tied-mode example **4, 4, 4, 5, 5, 5**. At 13:47:55 the user answered **yes**, explicitly confirming the general rule: **when multiple FTT values tie for highest frequency, use the highest tied mode**. Thus the school reference is the maximum among the modal per-level FTT-category totals, not the highest value across all levels regardless of frequency. For example, **4, 4, 4, 5, 5, 5 → F = 5**; **4, 4, 4, 4, 5, 6 → F = 4**. Retain the unequal-FTT warning and allow calculation/saving. No manual Admin choice or fixed fallback of 5 is needed. Missing loads remain missing, not zero; no missing-data fallback was authorized. This resolves the modal tie policy for the next revision; no new implementation or commit is authorized by this confirmation.

These are next-revision decisions only. Released v0.4.07 code, packages and live data are unchanged.

No additional commit was requested after v0.4.07. These decisions update the review and next-revision queue only.

## Q65 — TG editor: return a whole-level TG to a form-class venue sub-row

Confirmed 28 September 2026 at 12:59:25 Singapore time: the user permits the reverse transition. Selecting a particular form class reduces the TG from an independent whole-level row to **one sub-row belonging to that class's venue**. The row participates in ordinary venue grouping again; its teachers appear only on its TG sub-row.

Implementation interpretation, preserving the established scope-only change: retain the TG's stable identity, subject and teacher assignments; update its class anchor and venue references to the selected form class. A class whose venue is Unassigned still retains its own discrete anchored row/group; do not merge all unassigned classes. Do not delete a teacher, clone assignments or change unrelated groups. Reattachment must not add another provision record or inflate workload. Any cross-level reassociation needs explicit handling and is not assumed by this same-level scope transition.

Status: queued for the next revision. No source, release package or live data changed; no new commit requested.

# Implementation update — v0.4.07

The user's 28 September 2026 “commit” instruction authorized implementation of the confirmed rules below. The release now includes the Workload page/settings, shared assignment ledger, Summary pills/caps and subject-specific references. This document retains the earlier source review as a historical snapshot; it is not a new production calculation.

Confirmed equations implemented:

$$S=\frac{\text{assigned teaching periods}}{\text{active eligible teachers}}+F$$

$$L_s=\frac{\text{required subject periods}}{\sum_{i\in\mathrm{pool}_s}(1-o_i)}+F$$

FTT, teaching and non-teaching are separate; total is their sum. Offload applies to teaching only. Caps apply to actual FTT + teaching. FT composite/component duplicates count once; different teachers count separately. PD is pending. Unclassified/missing inputs are flagged.

| Fixture check | Expected | Verified |
| --- | ---: | ---: |
| FTT allowance, 1+2+2 | 5 | 5 |
| Two teachers, same 5-period FT class | 10 | 10 |
| PE required demand, reviewed class/load fixture | 188 | 188 |
| Art required demand | 82 | 82 |
| Music required demand | 70 | 70 |
| TL required demand, six defined groups | 59 | 59 |
| Art: 82 / (1+1+0.5) + 5 | 37.8 | 37.8 |
| Inclusive band around standard 100 | 90–110 | Both endpoints standard |

PE/Art/Music default to active matching modifiers; TL uses distinct active assigned teachers. Named pools and retained factors are shown. Art + Music conflicts and shared specialist capacity are visibly unresolved. Reference values do not change school-wide pills.

Blue/green/amber mapping is an implementation default. Individual offloaded targets, PD allocation, duty weighting and mixed capacity splits remain pending; TTT is configurable and defaults Unclassified. Different level FTT rates yield unavailable instead of an assumed average.

---

# Workload review — 2027 Term 1

Read-only check on 28 September 2026. Working revision 42; the source index was unchanged before and after bounded reads, with no pending transaction.

Source: [Deploy backend](https://docs.google.com/spreadsheets/d/1gXyYNbb8tHKDsb3Q3yepLEuc3cjsbbAsfLl7_XACfls/edit?usp=drivesdk). Only class, load and TG definitions were used; no teacher personal data is needed for this calculation.

## Subject specific load — TL assignment-based pool confirmed 28 September 2026 at 12:21 Singapore time

Add a **subject specific load** column in Deploy → Summary and show the corresponding calculation breakdown in Workload. The initial subjects were PE, Art and Music; the user added **TL** at 11:32. The configured list is now **PE, Art, Music, TL**. The original purpose is reference information for selected subjects with high period counts but lower marking demand. Use **Subject Modifier** eligibility for PE/Art/Music and **actual TL assignments** for TL, as confirmed at 12:21 below. Grey out the cell/value for teachers to whom the metric does not apply, keeping not-applicable distinct from zero. The Art/Music combination is resolved by the conflict rule below; no broader rule for every possible modifier combination has been supplied.

Confirmed at 11:32: the **Summary pill remains consistent against the school-wide standard**. The user expects Art/Music teachers may show above-standard load and explicitly accepts this; subject specific load is contextual reference information, not a replacement pill benchmark. Do not normalize a specialist's pill against their subject-specific value or alter the ±10% band for them. The existing confirmed no-offload scope remains; this does not resolve how offloaded teachers' pills should work.

The same request adds a specialised subject calculation for teachers teaching **TL**, within the existing subject specific load column and Workload breakdown. Retain formula B: required TL periods divided by included TL teachers' retained teaching capacity, plus the dynamic FTT allowance. Count applicable TL classes/TGs by level using TL loads, rather than multiplying TL load by every ordinary form class. The reviewed revision-42 definitions have one TL group at each level and weekly loads12,12,9,8,9,9, yielding a TL-only demand check of **59**; this is historical snapshot arithmetic, not a fresh current result. Do not silently combine TL with HTL/FTL or use the whole MTL teacher pool.

Confirmed at 12:21: the user chose **B for TL**, meaning existing TL teaching assignments. TL's pool is the set of **distinct active teachers with at least one TL assignment** in the selected deployment. Count each teacher's retained teaching fraction once even if that teacher has several TL classes/TGs. TL display eligibility follows this assignment-based pool; a TL Subject Modifier is neither required nor created. A teacher awaiting all TL assignments is not yet in this pool. Recalculate when TL assignments are added/removed or active status/offload changes; removing a teacher's last TL assignment removes them from the TL pool.

This is a TL-specific exception to PE/Art/Music's modifier-based eligibility. TL's numerator still comes from required TL class/TG counts × TL subject loads, including groups awaiting teachers; it is not reduced to the classes already staffed. If no eligible teachers or no retained teaching capacity remains, show the TL benchmark as unavailable, not zero. No current TL teacher denominator or final benchmark has been calculated; this is a queued rule, not a backend/code change.

Confirmed at 10:46: “a teacher will not have both art and music. flag jn deployment if so”. Treat simultaneous **Art and Music Subject Modifiers** as a data conflict. Show a visible **Art + Music modifier conflict** warning beside the affected teacher in Deploy, including Summary where the subject specific load is shown. Re-evaluate when the modifiers change, and clear the warning when the conflict is resolved.

Do not present two ordinary Art/Music benchmark values as the normal answer for this case, choose one modifier automatically, sum the benchmarks, or silently amend teacher records. Surface the ambiguity in the subject specific load cell and Workload calculation review; do not silently hide the inconsistent teacher from a denominator. Implementation default for the requested “flag” is an advisory warning, not a new save/publish block. The rule concerns the Art/Music modifier pair; it does not establish a ban on every other modifier pairing or every cross-subject teaching assignment. No live teacher audit or data cleanup was requested or performed.

Reuse the subject-classification/settings location to hold the eligible subject list as appropriate; do not make PE/Art/Music hard-coded exceptions. This subject-specific metric is additional to the already agreed FTT/Teaching/Non-teaching categories and does not reclassify PE, Art or Music as non-teaching. PE is named by the user, while the reviewed Load Settings use PHE; resolve that mapping explicitly at implementation, without creating a duplicate subject or inferring it from names alone.

The user proposed for Art: **(total Art periods + number of Art teachers × FTT allowance per teacher from Subject Load) / sum of (1 − offload) across those teachers**. Their Art example also says “music”; treat this as a likely wording slip for review and keep each subject's numerator, teacher group and displayed label aligned. No Music data should silently enter an Art calculation.

Confirmed at 10:08: include **all active teachers with the Art Subject Modifier**, even if they have not yet been assigned a TG, because deployment may be incomplete. Do not filter the Art teacher pool by existing assignments. Recompute the pool and its effective remaining capacity when active status, relevant modifier or offload changes. The numerator is separately confirmed at 10:16 below.

Let T be the selected subject's school-wide required weekly periods, N the number of distinct active teachers in its eligible pool, F the configured per-teacher FTT allowance and o_i the offload fraction for each included teacher (e.g. 50% = 0.5). Eligibility is modifier-based for PE/Art/Music and assignment-based for TL. The denominator D sums (1 − o_i) once per teacher in that pool. The user selected **B** at 10:12: **subject specific load = T / D + F**. FTT remains outside the teaching-offload divisor. Keep A below only as the original comparison, not an approved alternative.

**A — original proposal, not selected**

$$
L_A = \frac{T + N F}{\displaystyle\sum_{i=1}^{N}(1-o_i)}
$$

**B — confirmed formula: keep FTT outside the teaching-offload divisor**

$$
L_B = \frac{T}{\displaystyle\sum_{i=1}^{N}(1-o_i)} + F
$$

Formula A scales the FTT allowance by reduced teaching capacity too. Formula B preserves the confirmed teaching-only offload scope. The selection approves this formula for the queued subject-specific metric; it does not authorize code changes, backend writes or a commit.

Illustrative comparison only: T = 60 Art periods/week, N = 3, F = 5, with offloads 0%, 0%, 50%; Σr_i = 1 + 1 + 0.5 = 2.5. Assume all three teachers have the full FTT allocation.

| Calculation | Result |
| --- | ---: |
| User's proposal: (60 + 3 × 5) / 2.5 | 30 |
| Keep FTT outside teaching offload: 60 / 2.5 + 5 | 29 |

The selected B formula yields a subject-specific baseline of29. Applying teaching-only offload illustratively gives teaching targets24,24,12 (sum60), plus5 FTT each. Using A's30 as the combined baseline and then offloading only its teaching component would instead produce teaching targets25,25,12.5 (sum62.5), exceeding the example's60. Individual target/cap rules remain a separate review item; these are illustrative figures, not actual staff values.

Confirmed at 10:16: “periods defined by number of classes and subj load”. For this subject-specific benchmark, T is required provision from class definitions and weekly Subject Load, not the sum of existing teacher assignments. Sum across all six levels:

$$
T_s = \sum_{\ell=1}^{6} C_{\ell}\,P_{s,\ell},
\qquad
L_s = \frac{\displaystyle\sum_{\ell=1}^{6}C_{\ell}\,P_{s,\ell}}
{\displaystyle\sum_{i=1}^{N_s}(1-o_i)} + F
$$

Here C_l is the applicable class count at level l, P_(s,l) that subject's configured weekly load, and N_s the number of distinct active teachers in its eligible pool (modifier-based for PE/Art/Music; actual TL assignments for TL). Classes awaiting teacher assignment still contribute; assigning a second teacher to the same class does not itself increase this class-defined numerator. Do not change the main Workload table, which still counts actual assigned teacher-periods. Any separate extra-TG demand beyond the form-class requirement needs a defined counting rule rather than being inferred from assignment headcount.

Using the earlier verified revision-42 class counts 9,8,6,6,6,6 and corresponding loads:

| Subject | P1 | P2 | P3 | P4 | P5 | P6 | Required periods/week |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| PE (source load key PHE) | 36 | 32 | 30 | 30 | 30 | 30 | 188 |
| Art | 18 | 16 | 12 | 12 | 12 | 12 | 82 |
| Music | 18 | 16 | 12 | 12 | 6 | 6 | 70 |

These are demand numerators from the reviewed snapshot, not newly read live data or final subject-specific loads. No current modifier-teacher pool/offload denominator has been calculated. Recompute T when classes or subject loads change; completing deployment assignments alone should not inflate the benchmark's required periods.

Further review items: any other allowed multiple-modifier cases; teachers dividing capacity between multiple subjects (separate benchmarks do not prove the same capacity can fulfil both subjects simultaneously); additional TG demand beyond form-class requirements; FAJTs without FTT and weekly caps; combination of multiple offload rules; missing/zero remaining capacity and level-varying FTT loads. If Σr_i is zero, no finite standard can be calculated; do not show zero. Keep actual workload unchanged. The Art/Music display question is answered: flag the conflicting modifiers rather than showing two normal benchmarks. Do not add independent benchmarks together.

The Workload breakdown should expose T, included teacher count, effective remaining capacity, F and the approved formula/result so the Summary value is reviewable. Exact placement is open. The prior Summary pill colour mapping and offload-target example remain unanswered. This request authorizes logging and clarification, not a software commit or backend changes.

## Summary workload pill — requested 28 September 2026 at 09:42 Singapore time

For a teacher **without an offload factor**, compare actual **FTT-category + teaching periods** with the **school-wide standard workload**. “Teaching pd” in this request means teaching periods, not the separate non-teaching PD activity. Non-teaching periods are excluded from this comparison.

Confirmed at 11:32 in response to the school-wide-versus-subject-specific question: keep this comparison consistent for PE/Art/Music and other teachers receiving a subject-specific reference, including the newly requested TL metric. An Art/Music teacher showing above-school-standard load can be an intended result. The subject-specific reference does not change the pill's comparison benchmark. This answer does not select the pending pill colour mapping or approve an offloaded-teacher target rule.

Let A be that teacher's actual FTT + teaching and S the valid school-wide standard. A teacher has **Standard load** when **0.90 × S ≤ A ≤ 1.10 × S**. Both endpoints are included. Below 0.90 × S is below standard; above 1.10 × S is above standard. Compare the unrounded values so display rounding does not change the classification.

Add a compact workload-status pill immediately next to the teacher's name in **Deploy → Summary**, matching the existing HA/MA/LA class-ability badge style. Use workload labels, not HA/MA/LA labels. The requested palette is green/blue/amber, but its status mapping has not been specified. Proposed mapping for confirmation:

| Status | Actual FTT + teaching | Example if S = 25 | Proposed colour |
| --- | --- | --- | --- |
| Below standard | A < 0.90 × S | Below 22.5 | Blue |
| Standard load | 0.90 × S ≤ A ≤ 1.10 × S | 22.5 through 27.5 inclusive | Green |
| Above standard | A > 1.10 × S | Above 27.5 | Amber |

This uses a hypothetical standard of 25, not a calculated school figure. Read-only source check: `abilityBadge()` uses `.ability-badge` with compact bold text, 9px corner radius, 1px/6px padding and a 5px left gap. Existing palette: green `#b9e7bc`/`#154523`, blue `#bcdff8`/`#143958`, amber `#ffdc86`/`#60420a`. Reuse that presentation when implementing; existing HA/MA/LA meanings are not workload-status meanings.

Recalculate the pill when actual assignments, active-teacher count, subject loads or classification change. Keep S school-wide for the selected deployment; name/level display filters must not silently redefine the standard. Show the compared figures and percentage difference in supporting text/title when implemented. Invalid/incomplete inputs or an unavailable/nonpositive standard must not produce a misleading ordinary status; handling of a zero standard remains to be settled.

This rule is explicitly limited to teachers without offload. Do not apply it to offloaded teachers until their target/comparison rule is agreed. The prior 20% offload example remains unanswered. A maximum weekly cap remains a separate constraint: falling inside the ±10% band does not waive a breach of the FTT + teaching cap. No automatic scaling of the school-wide standard for capped teachers is authorized by this request.

Still awaiting confirmation: Blue = below standard, Green = within ±10%, Amber = above standard. The later subject-specific-load discussion does not confirm this mapping. This is queued requirements work only; no Summary UI, calculation code or backend data changed.

## Standard workload and subject categories — clarified 28 September 2026 at 09:36 Singapore time

At 09:23 the user defined: **standard workload = total teaching periods / active teachers + FTT periods**. At 09:25 they clarified that the FTT amount is determined dynamically from Subject Load, and that the same Workload settings location used to define non-teaching subjects must also define FTT subjects.

Use the same classification list for three mutually exclusive categories: **FTT**, **Teaching**, **Non-teaching**. FTT is a configurable category of subjects, not necessarily only the subject literally named FTT. This supersedes the earlier literal-FTT interpretation below. Classifying a subject selects how its contributions are counted; its numeric weekly rate remains in existing Subject Load settings.

Confirmed at 09:36: the user answered “yes” to the initial FTT category containing **Assembly, FTGP and FTT**. The reviewed revision-42 loads are 1 + 2 + 2 = **5 periods/week at each P1–P6 level**. This gives F = 5 for that snapshot; the application must derive F from Subject Load and the configured category, not hard-code 5. Exclude these subjects from teaching and non-teaching totals. Their combined FT assignment is expanded/counts once, not again alongside the component subjects. TTT is a different subject and remains unresolved.

Distinguish two quantities:

- **Standard FTT allowance:** sum of the weekly Subject Load values for subjects classified as FTT. This is a per-teacher reference amount, not the school's total assigned FTT and not a new manually entered rate.
- **Total FTT periods:** sum the actual teacher-assignment contributions belonging to the FTT category. A teacher without such assignments still contributes zero actual FTT, even though a standard reference allowance exists.

Let T be the table's total teaching teacher-periods/week, N the active-teacher count, and F the standard FTT allowance from configured subject loads. Then **standard workload = T / N + F**, in teacher-periods/week per teacher. It is a separate baseline variable from the table's actual **Total periods = FTT + teaching + non-teaching**. Non-teaching is not included in the standard workload formula the user specified. Never substitute total assigned FTT for F or multiply F by teacher/class counts before adding it to the per-teacher average.

Illustration: T = 1,000, N = 50 and F = 5 gives standard workload = 1,000 / 50 + 5 = **25**. T and N are hypothetical; F = 5 matches the confirmed category and reviewed loads. No actual active-teacher count or standard-workload value has been calculated.

Recalculate the standard when teaching assignments, the active-teacher count, subject classification or relevant loads change. If N = 0, show the baseline as unavailable, not zero or infinity. Do not substitute total staff or an FTE-weighted denominator for the specified active-teacher count without a separate decision. The same calculation population must be explicit rather than changing silently with a display filter.

Subject Load is level-specific. For a given level, F is the sum of that level's FTT-category subject loads. If those sums differ across P1–P6, the choice of one suite-wide allowance or level-specific standards remains to be agreed; do not choose an arbitrary level or average without review. Missing/n/a rates must not silently become zero. Current assignment totals are committed workload, so this proposed standard changes as assignments are completed and does not automatically include unassigned provision.

Initial FTT membership is resolved. Offload's target/baseline application remains unanswered: for a hypothetical standard of 25 (20 teaching + 5 FTT), a teacher assigned the full 5 FTT periods and a 20% teaching offload would have a proposed adjusted target of 20 × 0.8 + 5 = **21**, before any separate cap, while actual assigned workload remains unchanged. This formula is a review question, not an approved offload calculation. The later Summary pill rule above covers only teachers without offload and does not approve this formula. Other subject classifications, denominator edge cases and future differing level-load handling remain pending.

## Offload and weekly cap — confirmed 28 September 2026 at 09:20 Singapore time

The user clarified: “any offload factor only applies to teaching periods. max weekly period cap applies to FTT+teaching (some FAJTs will not receive FTT so is important to make that distinction)”.

| Rule | Applies to | Excludes |
| --- | --- | --- |
| Offload factor | Teaching periods only | FTT and non-teaching periods |
| Maximum weekly period cap | FTT + teaching | Non-teaching periods |
| Total periods | FTT + teaching + non-teaching | None of those three categories |

Use actual FTT assignments per teacher. Do not reserve a standard FTT amount for every FAJT or assume every FAJT has no FTT. A teacher with no FTT assignment contributes zero FTT to cap usage. Non-teaching PD/duties still contribute to Total periods even though they do not use this cap.

Illustrative cap arithmetic only, assuming the cap is checked against actual assigned FTT + teaching and a configured cap of 20 teacher-periods/week:

| Example teacher | FTT | Teaching | Non-teaching | Total periods | FTT + teaching | Cap result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| With FTT | 2 | 19 | 4 | 25 | 21 | 1 over |
| Without FTT | 0 | 19 | 4 | 23 | 19 | 1 below |

Offload's category scope is confirmed; its precise use in target/cap arithmetic still needs clarification. Recommended interpretation, awaiting confirmation: offload reduces permitted/target teaching allocation, while actual assigned periods remain visible unchanged; compare the cap against actual assigned FTT-category + teaching periods. Do not silently discount already-assigned lessons to make a cap appear satisfied or apply offload to FTT/non-teaching. The standard-workload proposal above supplies a baseline structure, but its offload/cap interaction remains a later formula decision.

Existing Summary code checks the weekly cap against teaching alone. The requested combined FTT + teaching scope supersedes that behavior for the planned Workload calculation. No code or backend change has been made; this remains queued design work.

## Four live workload values — clarified 28 September 2026 at 09:18 Singapore time

From the teacher-row table, derive four dynamically updated values: **total FTT periods**, **total teaching periods**, **total non-teaching periods**, and **total periods**. The user confirmed at 09:18: “FTT period separate / but definite a new var called total periods that is FTT+teaching+non-teaching”. FTT, teaching and non-teaching are separate categories; Total periods is their sum. Keep these as computed values from the selected deployment, not independent manually maintained totals. Continue to count weekly teacher-periods, not elapsed class periods or hours.

| Requested total | Source and calculation |
| --- | --- |
| Total FTT periods | Sum each assigned teacher's contributions for subjects classified as FTT, using the relevant level's configured loads. Exclude these contributions from teaching and non-teaching. |
| Total teaching periods | Sum each teacher's assignment contributions for subjects classified as teaching. |
| Total non-teaching periods | Sum each teacher's assignment contributions for subjects classified as non-teaching, plus PD from later PLT-based allocation and duties from Deploy → Often → Duty. Count each underlying commitment once. |
| Total periods | Total FTT periods + total teaching periods + total non-teaching periods. |

The user proposed a subpage within Workload to define which “subjects” are non-teaching, then explicitly extended it at 09:25 to define FTT subjects too. Proposed title: **Workload → Settings**. Use one mutually exclusive FTT/Teaching/Non-teaching classification list linked to existing subjects and loads, not a second rate table. Classification changes recalculate the affected teacher rows, aggregate totals and standard workload. Initial FTT membership is confirmed as Assembly, FTGP and FTT; other unresolved classifications include TTT.

Confirmed category rule: FTT, teaching and non-teaching are mutually exclusive. Apply Total periods = FTT + Teaching + Non-teaching to each teacher row and to the aggregate table. The sum of teachers' Total periods must equal the sum of the three aggregate category totals. Total periods is a derived fourth value, not a fourth source category; do not add it to its own components. Missing/unconfigured components remain visible and prevent an incomplete Total periods from appearing final.

Combined FT is currently Assembly + FTGP + FTT. Resolve a combined FT assignment into its component subject contributions and apply the configured category to each once. The 09:25 clarification supersedes the earlier assumption that the FTT category contains only literal FTT. Combined FT's 5 periods belong wholly to the FTT category only if all its components are classified that way. Never count combined FT again on top of its components.

PD is confirmed non-teaching, with teacher allocation later through PLT groupings; PD weekly rates/frequency and group-to-teacher counting are not defined yet. Do not invent them or report an unconfigured PD allocation as an established zero. A teacher appearing in multiple PLTs does not by itself establish whether the PD sessions are separate or shared; resolve that when PD is designed. Duties are now explicitly included under non-teaching, sourced from the existing roster rather than a duplicate editable workload list.

Read-only source check: the existing duty counter counts one assigned duty/day occurrence as one period, irrespective of duration. This is an implementation fact, not a newly approved duration conversion. Keep duty weighting/frequency and odd/even-week handling as later calculation questions. Until PD/other required inputs are configured, identify known subtotals and incomplete components instead of presenting an apparently complete total.

Recalculate from teacher/class/TG assignments, subject/level loads, subject classifications, duty-roster assignments and, once defined, PLT/PD allocations. Keep a traceable per-teacher breakdown and derive the category totals and Total periods from the same underlying contributions. This updates the earlier subject-only scope to include the requested PD and duty sources. Offload and cap scopes are now confirmed above; target/baseline formula details remain open.

No actual staff totals, source code or live backend values changed. This is logged design work only. FTT separation and the Total periods formula are confirmed; individual subject classifications, including TTT, and PD/duty counting details remain open for later review.

## Calculation structure — confirmed 28 September 2026 at 09:05 Singapore time

The user proposed duplicating the Summary page layout, working out the maths per teacher row, looking up each class entry's subject weekly periods, and summing the table. Use this structure for Deploy → Info → Workload. This is a design decision, not permission to implement or commit.

- One teacher per row and one subject per column. Use each teacher's actual class/TG assignments, not form-class counts as a second additive baseline.
- For each distinct teacher/class-or-TG/subject assignment, resolve the class/TG's level and look up that subject's weekly load in the selected version's Load Settings. Apply the configured load once for that teacher's assignment. Do not parse class names to guess a subject, level or rate.
- A subject cell sums all that teacher's applicable assignment loads. A row total sums its counted subject cells. A bottom totals row sums each subject column across teachers. The overall total must equal both the sum of teacher totals and the sum of subject totals, counting each atomic contribution once.
- Retain the requested P1–P6 subject totals as a roll-up of these same assignment contributions. Do not calculate that roll-up independently from class definitions.
- Same class with two different teachers contributes on both rows. Repeated displays of the same teacher's same assignment do not create another contribution. A TG with no teacher adds zero committed periods; an unassigned venue does not suppress an assignment.
- Recalculate when assignments, target level/subject or configured loads change. Preserve class ordering by level and the class-definition order. Use the existing Summary data relationships and layout, not a second editable assignment list.
- Numeric zero is valid; a missing or n/a load on an existing assignment is unresolved, not zero. Make that entry visible and mark affected totals incomplete rather than silently undercounting. FT's combined load must not be added again alongside the same Assembly/FTGP/FTT components.

Illustrative assignments only; rates use the reviewed settings. A and B both hold FT for 3P. A also teaches EL in 3P and 4P; B teaches one P5 FSC group.

| Teacher | FT | EL | FSC | Teacher-periods/week |
| --- | --- | --- | --- | ---: |
| A | 3P: 5 | 3P: 12 + 4P: 12 = 24 | — | 29 |
| B | 3P: 5 | — | P5 FSC: 5 | 10 |
| Total | 10 | 24 | 5 | 39 |

Cross-check: 29 + 10 = 10 + 24 + 5 = 39. These are not actual staff assignments or a school total.

The lookup rule resolves the earlier FTT example for implementation: always use the configured subject/level rate, with no implied rate change. The reviewed settings have FTT = 2 and combined FT = 5. There is no need to block this structure on the earlier hypothetical label.

Read-only source check of v0.4.05: Summary already offers Assignments and Periods modes and sums loads per teacher/subject. However its helper forces TTT to zero, and its Total periods includes duty occurrences; its row selection is limited to active eligible teachers. Reuse the layout/data relationships, not those exclusions or totals without review. Do not silently drop any retained assignment merely because its teacher is filtered out; define visible/filter totals separately from full-version totals if needed.

The earlier TTT question remains unresolved: count its configured load or retain Summary's exclusion. The later four-value specification above explicitly includes duties and PD as non-teaching and confirms FTT as separate. Offload is restricted to teaching, and the cap covers FTT + teaching; the target/baseline formula remains to clarify. Classify subjects and settle PD/duty counting details in subsequent review.

## Latest counting rule — confirmed 28 September 2026 at 09:01 Singapore time

The user clarified: “add for every TG that has teacher assigned since it means manhours are committed”, followed by “count on per teacher basjs”. Workload therefore measures committed **teacher-periods per week**, not just the number of class/TG periods required. Count each teacher's assignment to each relevant class/TG and subject. An extra TG with no teacher contributes zero committed teacher-periods; an unassigned venue does not exclude a valid teacher assignment. The additive rule applies across subjects, including FSC and the other pull-out TGs.

Formula: for each subject and level, sum the weekly periods allocated to each assigned teacher. If all teachers assigned to a TG take its full configured weekly load, that TG contributes weekly load × assigned teacher count. Do not additionally add the form-class baseline to those same teacher assignments. Do not count a repeated venue display or duplicate representation of the same assignment again.

| Illustrative 5-period TG | Committed teacher-periods/week |
| --- | ---: |
| No teacher assigned | 0 |
| One teacher assigned all 5 periods | 5 |
| Two teachers each assigned all 5 periods | 10 |
| Two teachers split the 5 periods as 3 + 2 | 5 |

At 09:02 the user gave the example: “so if 2 teachers take same class for FTT, its a delta of +10 per week”. This confirms counting each teacher for the same class; with a full weekly rate of 5, two teachers contribute 10 teacher-periods. The increase is +10 relative to no teachers, or +5 when adding a second teacher to an existing full-load assignment. No split-period feature or automatic allocation is approved; the 3 + 2 row above is a mathematical contrast only.

The source snapshot has FTT = 2, so two full-load FTT teachers contribute 4 teacher-periods/week. Combined FT = Assembly 1 + FTGP 2 + FTT 2 = 5, giving 10 for two teachers each taking all three components. The later 09:05 instruction settles the calculation route: look up the configured subject and level rate; no saved rate change was requested. Keep units as teacher-periods/week until period length is established; do not label these numbers as hours.

**The tables below are retained as the earlier definition-based review, not recalculated committed workload.** Only class, load and TG definitions were read for them; current teacher assignments have not yet been read or counted. Actual totals must be recalculated on the confirmed per-teacher basis before approval. This supersedes the earlier assumption that every defined TG counts without a teacher.

## Form-class baseline

Earlier demand baseline: assumes each ordinary form class requires each listed subject. It is not the newly requested assigned-teacher total. FT is a subtotal of Assembly + FTGP + FTT; do not sum it again with its components. TTT is shown as a configured timetable item; this does not approve counting it as teacher workload.

| Subject | P1 | P2 | P3 | P4 | P5 | P6 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Form classes | 9 | 8 | 6 | 6 | 6 | 6 |
| Assembly | 9 | 8 | 6 | 6 | 6 | 6 |
| FTGP | 18 | 16 | 12 | 12 | 12 | 12 |
| FTT | 18 | 16 | 12 | 12 | 12 | 12 |
| FT | 45 | 40 | 30 | 30 | 30 | 30 |
| TTT | 18 | 16 | 12 | 12 | 12 | 12 |
| EL | 135 | 120 | 72 | 72 | 72 | 72 |
| SS | 9 | 8 | 12 | 12 | 18 | 18 |
| Math | 81 | 72 | 66 | 66 | 54 | 54 |
| Sci | — | — | 30 | 30 | 36 | 36 |
| Art | 18 | 16 | 12 | 12 | 12 | 12 |
| Music | 18 | 16 | 12 | 12 | 6 | 6 |
| PHE | 36 | 32 | 30 | 30 | 30 | 30 |
| PAL | 27 | 24 | 0 | 0 | 0 | 0 |
| CCE EL | 9 | 8 | 6 | 9 | 9 | 9 |

## Defined TG provision — provisional

Each cell shows distinct stored TG count × weekly load = periods. Counts reflect saved definitions, not a confirmation that every record is distinct operational provision. N/a load stays unavailable rather than zero. A numeric zero reflects the stored rate or count. Do not multiply specialist subjects by all form classes merely because a load has been configured.

| Subject | P1 | P2 | P3 | P4 | P5 | P6 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| LSP | 1 × 5 = 5 | 1 × 5 = 5 | — | — | — | — |
| FEL | — | — | — | — | 0 × 0 = 0 | 1 × 14 = 14 |
| RRP | 0 × 0 = 0 | 0 × 0 = 0 | 1 × 4 = 4 | 1 × 4 = 4 | 1 × 2 = 2 | 0 × 2 = 0 |
| SDR | 0 × 0 = 0 | 0 × 0 = 0 | 1 × 6 = 6 | 1 × 6 = 6 | 0 × 0 = 0 | 0 × 0 = 0 |
| LSM | 1 × 9 = 9 | 1 × 9 = 9 | 1 × 11 = 11 | 1 × 11 = 11 | — | — |
| FMA | — | — | — | — | 0 × 12 = 0 | 2 × 12 = 24 |
| FSC | — | — | — | — | 1 × 5 = 5 | 1 × 5 = 5 |
| CL | 6 × 12 = 72 | 7 × 12 = 84 | 6 × 9 = 54 | 6 × 8 = 48 | 6 × 9 = 54 | 5 × 9 = 45 |
| HCL | 0 × 0 = 0 | 0 × 0 = 0 | 1 × 11 = 11 | 2 × 10 = 20 | 2 × 11 = 22 | 1 × 11 = 11 |
| FCL | — | — | — | — | 0 × 0 = 0 | 2 × 5 = 10 |
| ML | 3 × 12 = 36 | 3 × 12 = 36 | 2 × 9 = 18 | 2 × 8 = 16 | 2 × 9 = 18 | 2 × 9 = 18 |
| HML | 0 × 0 = 0 | 0 × 0 = 0 | 1 × 2 = 2 | 1 × 2 = 2 | 1 × 2 = 2 | 1 × 2 = 2 |
| FML | — | — | — | — | 0 × 0 = 0 | 1 × 5 = 5 |
| TL | 1 × 12 = 12 | 1 × 12 = 12 | 1 × 9 = 9 | 1 × 8 = 8 | 1 × 9 = 9 | 1 × 9 = 9 |
| HTL | 0 × 0 = 0 | 0 × 0 = 0 | 1 × 2 = 2 | 0 × 2 = 0 | 0 × 2 = 0 | 0 × 2 = 0 |
| CCE | 10 × 2 = 20 | 11 × 2 = 22 | 8 × 2 = 16 | 8 × 3 = 24 | 7 × 3 = 21 | 10 × 3 = 30 |

## FSC addition — confirmed 28 September 2026 at 08:51 Singapore time

The user clarified: “FSC adds because ultimately another teacher needs to teach another class”. Apply FSC as additional teaching provision; do not subtract a regular Science class when opening an FSC TG.

| P5 scenario | Regular Science | FSC | Combined periods/week |
| --- | ---: | ---: | ---: |
| Current definitions | 6 × 6 = 36 | 1 × 5 = 5 | 41 |
| Open one additional FSC group | 6 × 6 = 36 | 2 × 5 = 10 | 46 |

This earlier scenario is definition-based arithmetic only. No new group was opened. Under the later per-teacher rule, 41 or 46 is a committed total only if the relevant assignments supply exactly those teacher-periods; this has not been verified. The frontend should recalculate when class/TG definitions, load settings or teacher assignments change within the selected deployment version, including removal of the last teacher. Count real additional teacher assignments, but not repeated venue displays of the same assignment.

## Items to review before a final combined total

- The user's hypothetical 5 × 9 = 45 is correct. Current FTT is 2 and combined FT is 5, so P1 FTT is 18 while combined FT is 45.
- The additive rule now applies to all TGs with teacher assignments, counted per teacher. Existing extra TGs outside the earlier TG-only table are EL: one P4 and two P6; Sci: one P4; PAL: one P2; CCE EL: one each in P2/P4/P5/P6. Recalculate from actual assignments and configured subject/level rates; do not add a baseline again for provision already represented in those assignments.
- Saved definitions include `2CL5_dup`, `6FCL_dup` and related CCE groups. Confirm whether these denote distinct teaching groups before treating totals as final. Do not merge them solely by name or venue.
- Saved P6 TG `6FEL` is mapped to EL (12 periods), while another P6 TG is mapped to FEL (14). Names do not override mappings; the app must derive subject totals from the explicit mapping and make inconsistencies reviewable.
- Standard/higher language groups may overlap; the stored HCL load is 11/10/11/11 for P3–P6, while HML/HTL use 2. Do not assume all higher-language rates are either incremental or inclusive without checking their intended counting basis.

No school grand total is issued while those counting rules remain unresolved. No application code, backend data or published version changed. Q62 remains queued for review before an explicit commit.
