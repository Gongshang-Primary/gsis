# GSiS v0.8.1b component patch

Baseline: v0.8.1, including the v0.8.1a patch. Authorised on 20 October 2026.

## Release scope

053. Retain immediate notification eligibility after publication of a current or future day, inline Daily Notify progress and browser summary reuse from v0.8.1a.

054. Export precise teaching-group subjects from Deploy. Use configurable subject families and exact teaching-group exceptions for Roster business preferences. Default Chinese to CL/HCL/FCL, Malay to ML/HML/FML and Tamil to TL/HTL/FTL. Tamil lessons default to No Relief Required; their teachers remain eligible for other cover. Ambiguous groups do not receive an inferred language match.

055. Require acknowledgement of each teacher's published changed timetable, including Stapler changes, relief, cancellation and restoration. Show a filled Acknowledged pill or grey Pending status in Daily Notify. An unchanged resend retains acknowledgement; a change to that teacher's timetable or instructions requires another acknowledgement.

056. Keep private timetable pages accessible without Google sign-in through their signed, teacher-specific link. Expiry remains the earlier of seven days after issue and 23:59:59 Singapore time on the day after the timetable date. Expiry removes access, not the audit history. A page visit or WhatsApp read receipt is not an acknowledgement.

057. Audit every existing WhatsApp template and send path. Encode dynamic text as single-line content, handle line breaks, tabs, paragraph separators and repeated spaces, preserve original stored content, and leave approved fixed template paragraphs intact. Retain safe provider diagnostics and stop unchanged retries for permanent parameter errors. The previously accepted compact inline absence-name format is retained.

## Release verification

Implemented and current accepted queue cleared. Ponytail, Pstack, Thermonuclear, Vercel and Superpowers were applied; independent correctness and structural reviews closed with no unresolved material findings.

The full suite passed 445 of 451 scripts. The six failures were corrected, and all passed the final scoped rerun with three related checks (9/9). All 451 current scripts are verified across those runs; the original full invocation is not labelled all-green. The Apps Script ES2020 gate passed for 67 source files. The three-component archive passed exact scope, source-parity and hash checks. Detailed evidence is in VALIDATION_v0.8.1b.md in the committed source.

Local checks cannot establish live Meta delivery. No live deployment, template edit or staff notification was performed.
