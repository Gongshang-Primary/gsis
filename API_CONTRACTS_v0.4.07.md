# v0.4.07 API additions

Deploy write protocol: **407**. Existing clients must reload after frontend/backend installation.

`saveDraft` accepts these additional operations through the existing authenticated, journalled field-store path:

- `setWorkload`: `{value: {categories: {[subject]: category}, specialists?: [{subject, pool, modifier, demand}]}, expected}`. Categories are FTT, Teaching, Non-teaching or Unclassified. Subjects must exist in Subject Load. Pool is modifier or assignment; demand is classes or groups. TL retains assignment/group semantics. Admin/KP access is checked by the existing save path.
- `updateTG`: `{groupId, name, subject, levelWide, assignments, expected}`. `expected` is canonical TG plus its assignments. Subject remaps require `assignments: retain | clear`. A new whole-level transition clears venue, anchor and source classes while preserving teacher assignments. No implicit reverse transition. Structural state mismatch returns 409.

`levelWide: true` is stored on independent TGs. Venue-group moves exclude them. Their venue changes affect only that TG and its assignments.

Contacts `saveData` continues to accept `changes` and an immutable `requestId`, and may additionally accept `additions: [{id, values}]`. New IDs use `contact-` plus a UUID. New contact values use existing editable DATA_FIELDS; derived fields are rejected. Only Admin can create contacts. Basic Name and Active Y/N are required; alias uniqueness includes inactive records. The journal contains additions as well as edits. Stable Staff IDs are reserved before field writes so partial saves resume in the same row. DIY rejects additions.

Workload analysis is browser-local and pure. It generates no API requests or writes; only explicit settings/assignment edits enter the normal Save changes queue. Figures include local drafts and the UI says so. Publication remains a separate Admin action.
