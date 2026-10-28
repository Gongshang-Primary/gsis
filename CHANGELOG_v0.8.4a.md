# GSiS v0.8.4a

Baseline: v0.8.4, commit `9753648d18dd9d114d78e677cdd4dea57839e66a`.
Scope: Roster frontend and standalone Roster backend only.

## 095: Main relief pool excludes supplemental timetable staff

The Relief Health check counted every active staff row in the effective suspended timetable. Supplemental staff such as SENOs had no Deploy R, so one extra row could mark the whole day “R not verified”.

Use the existing Contacts teaching-eligibility flag and authoritative baseline membership to identify the main relief pool independently of numeric R. Exclude supplemental and ineligible staff from R readiness, weekly capture and automatic relief selection. Retain timetable visibility, genuine missing-R warnings, deliberate eligible ad hoc activation, saved manual choices and audit history. Cover recess-duty repurposing and class-combination selection so they do not bypass eligibility.

The user authorised “commit patch 0.8.4a quickly” on 21 October 2026, Singapore time. Installation uses the existing v0.8.4 Roster project and URLs. No school data migration, reset, permission expansion, live publication or staff message is part of this patch.

See `VALIDATION.md` for the checks performed and `INSTALL.txt` for installation.
