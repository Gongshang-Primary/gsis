# GSiS v0.9.5a: STAPLER staff picker

Baseline: the supplied GSiS v0.9.5 suite. This is a Roster component patch.

## What changes

STAPLER > Add teacher lists active and inactive Contacts staff who are not already in the plan. MK staff are excluded. This includes SENO, school leaders, OSO and other support staff. Search matches any part of the displayed name, without case sensitivity, including modifiers such as SENO. Choose a result, then select Add selected teacher.

The addition stays in the local draft until Save to online. Confirm and publication remain separate actions. Contacts records, recurring baseline timetables, absence policy and automatic relief eligibility are unchanged. Contacts-ineligible inactive staff do not receive external relief activation. Eligible inactive relief teachers retain the existing dated manual relief flow.

Offline JSON name resolution and server validation use the same MK exclusion rule.

## Install on an existing v0.9.5 system

1. Keep a copy of the currently deployed Roster frontend, Roster Apps Script source and notification Worker source for rollback. Finish or save open STAPLER edits first.
2. In the existing Roster Apps Script project, replace its combined code with `Roster_Backend_v0.9.5a.gs`. Update the existing web app deployment to the new version so its URL stays the same. Retain Script Properties and deployment permissions. This keeps the legacy backend path consistent where it is still enabled.
3. Deploy `Roster_Frontend_v0.9.5a.zip` to the existing Roster Pages project. The ZIP contains the site root and the Pages Worker modules. Keep the existing environment variables, D1/R2 bindings and Access settings.
4. Update the existing notification Worker with `Roster_Notification_Worker_v0.9.5a.txt`. Retain its bindings, secrets, flags and cron schedule. It contains the matching shared Roster domain code. Do not run a fresh Wrangler deployment with the baseline's disabled example variables.
5. Reload Roster. The header and `/api/config` version should show `0.9.5a`.

The frontend and backend must both be updated: an old backend still rejects school leaders and OSO even if the new picker shows them. No database migration or authority flag change is required. This patch does not implement the earlier proposed Deploy rollback or timetable cache optimisation.

## Check after installation

1. Open an editable STAPLER date and select Add teacher.
2. Enter part of a name, such as `oli`, or a displayed modifier, such as `seno`.
3. Select the correct Contacts record. Verify that existing plan members and MK staff are absent from the choices.
4. Save to online and reopen the date. Confirm the staff row remains present.
5. Verify normal relief allocation still excludes staff who are not eligible for relief.

## Rollback and source

Restore all three previous components together if required. No records are deleted by this patch. A saved plan containing newly permitted staff can require this patch's backend to edit successfully; reverting to v0.9.5 restores its narrower validation rules.

`SOURCE.patch` records source and generated-runtime changes against the supplied suite. `PATCH.json` records the input archive digest and exact deployment components. `SHA256SUMS.txt` covers every other package member. Local verification results and limitations are in `VALIDATION.md`. No live deployment has been performed.
