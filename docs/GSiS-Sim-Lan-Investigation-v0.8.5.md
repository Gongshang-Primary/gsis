# Sim Lan retained draft investigation, 21 October 2026

## What the evidence establishes

The supplied conversation reports an attempt to add teaching group 3HCL1 and teacher Fayth. The cropped banner ends with “and level. Draft retained.” Retry did not clear it, and Review appeared unresponsive. This is a report of a rejected local draft, not evidence that the requested addition reached the shared timetable.

Read-only inspection of the [live Deploy workbook](https://docs.google.com/spreadsheets/d/1gXyYNbb8tHKDsb3Q3yepLEuc3cjsbbAsfLl7_XACfls/edit) found 17 accepted teacher assignment changes by Sim Lan in the 2027 Term 1 version, six at 17:59:28 and eleven at 18:04:57 Singapore time. The version's latest saved revision was 191 at 18:04:57. There was no later accepted group addition in that revision's audit tail.

The complete indexed group projections for 2027 Term 1 and 2026 T4 post-PSLE did not contain 3HCL1. The 2027 edit and display projections agreed for populated group fields. 3HCL2 existed. This rules out a saved 3HCL1 or disagreement between those group projections in the inspected snapshot as the explanation. It does not prove the state at the instant of the failed request.

The user's browser draft, full error response and execution logs were unavailable. The precise failed sequence cannot therefore be recovered. A duplicate inside one pending batch is a supported reproduction, not a proven account of every click in this incident. Raw school snapshots and personal details are not included in the release.

## Reproduced software defects

The modern addTG backend returned the generic “Check TG name, subject and level.” error for a duplicate group name. The client allowed a duplicate name into its unsaved draft. Retrying that same rejected batch repeated the error. The error did not identify the conflicting name or provide a way to repair it while retaining linked assignments.

Review waited for a fresh bootstrap before displaying its dialog. A slow or failed read could make the click look ineffective. Recovery needs an immediate visible state and actionable errors, without discarding edits or changing the identity of an uncertain save.

## v0.8.5 remedy and boundaries

The patch validates duplicate group names locally, identifies the conflicting name on the server, and opens Review immediately. Review can rename pending teaching group creations while keeping their temporary IDs, teacher assignments and unrelated edits. Saves whose outcome is unknown retain their original request identity and receipt recovery. Same-name groups are not automatically merged, since their subject and class scope may differ.

IP Deploy search also includes teaching group subjects and their families, so MTL can find related group rows. This provides a direct response to the user's difficulty finding the MTL group.

These changes repair the reproducible failure and recovery paths. No live timetable was altered, no local draft was discarded and no message was sent to Sim Lan. The accepted 18:04 assignments remain part of the saved history.

## Verification

The regression scripts for this incident are tests/deploy085-tg-duplicates.cjs and tests/deploy085-tg-recovery.cjs. Native browser and final full-suite results are recorded in the accompanying v0.8.5 validation report. Release claims apply to the packaged source; deployment and the original device's retained draft remain separate checks.
