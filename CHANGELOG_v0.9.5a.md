# v0.9.5a STAPLER staff picker

* Add teacher includes active and inactive Contacts staff except MK.
* Partial text search matches displayed staff names and modifiers without case sensitivity.
* Existing plan members are omitted, and adding requires an explicit selection.
* Editing search text cannot accidentally submit a previous selection.
* Server save and Offline JSON import enforce the same MK-only exclusion.
* Inactive Contacts staff excluded from relief no longer receive an external relief reservation when added to STAPLER.
* Existing Contacts identity, permissions, draft save, confirmation and relief policy checks remain in force.

Scope: Roster frontend, Roster backend and the matching shared domain in the notification Worker. Baseline: v0.9.5. Production deployment: not performed.
