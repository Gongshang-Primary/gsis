# Classes and name sets

The Classes viewport presents a matrix of possible class names against P1–P6. Ticks form classes in the local draft, and Save changes commits them. Add option extends the chosen name set with a name/code pair; it starts unchecked. Existing classes outside the selected set remain visible.

Each deployment version holds classes with separate level, name and short-name suffix fields. A full key joins the numeric level and suffix: level 1 + Rp = 1Rp. Displayed full names can join the level and name: 1-Respect. The user chooses the name; its short name is automatic.

New set is selected by default and has the nine confirmed mappings: Gc Graciousness, Gt Gratitude, P Prudence, Rp Respect, Rs Resilience, I Integrity, D Diligence, E Empathy and K Kindness. Old set is retained as an explicit alternate list. Admin/KP users can add, edit or remove custom sets through Classes → Name sets. Sets are validation choices, not a required class ordering.

Catalog storage: `classNameSets: [{id, name, pairs: [[name, shortName], ...]}]` within the version document. Missing catalogs receive independent default copies; a new planning version inherits the selected source version’s catalog. Set changes do not rewrite existing classes. Retained existing name/code pairs can still move levels; selecting a new pair must match a current set.

Sets require unique names across the version. Names and codes are unique, case-insensitively, within each set. Short names omit the level prefix, start with a letter and contain letters, digits, underscores or hyphens. P1/P2/etc. remain reserved for whole-level groups. Limits: 20 sets, 100 pairs per set.

`upsertClassNameSet` and `deleteClassNameSet` use the explicit saveDraft transaction. One set is one conflict resource, so a later conflicting save replaces that set and reports its author and before/after values. Separate sets remain independent. Never delete the last set. Class renames preserve version-local references and update linked assignments, homerooms and TG sources.

All six levels remain visible in numeric order; a level without load configuration is disabled. Other tables retain selected-value sorting. Unticking uses the existing deleteClass operation and guards; re-ticking a saved class cancels its pending deletion to preserve references and its venue. Clearing all draft edits also clears draftBase to avoid hiding later refreshes.
