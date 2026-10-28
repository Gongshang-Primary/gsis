# GSiS v0.4

## Deploy navigation

Flat tabs are separated by two `|` dividers, with the settings group aligned right. No group labels are displayed.

- Often: IP Deploy, Teachers, Exclusions, Dept, Committees, CCAs, Duty.
- Information: Summary, Layout.
- Settings: Classes, Membership, Role Truth Table, Load Settings, HR Terms, Offload, Dept Settings, Committee Settings, CCA Settings, Audit.
- Versions remains accessible beside the version selector.

## Departments, Committees and CCAs

- Independent version-owned definition lists and assignment tables, with the requested alphabetized defaults.
- Searchable in-cell selectors use active, eligible Teachers. The unassigned pane scrolls independently on the right.
- Department and Committee roles: Head, Deputy, then members. CCA roles: OIC (Boys), OIC (Girls), 2IC, Enrichment, then members.
- Role holders count as members. Blank roles and unassigned teachers do not prevent publication.
- Teachers may belong to multiple groups. All affected cells within that category turn light orange. A teacher cannot occupy two positions within the same group.

## Duty

- Fixed Before School, Recess, Dismissal and After School categories; editable duty definitions, times, descriptions and weekday checkboxes.
- Recurring duties appear on selected weekdays. Additional duties can be added, edited or removed for a single day.
- One teacher per occurrence. Same-day overlapping assignments are blocked, including conflicts introduced by changed times.
- Blanks remain visible as reminders and do not prevent publication. Each assigned occurrence counts as one period, regardless of duration.
- Summary Total periods includes Teaching + FT duties + Duty periods. Teaching offload limits continue to apply to teaching periods only.
- A4 landscape PDF/print view follows the reference roster: centered title, weekly table, grouped duties and two-column descriptions. The supplied default times are included; teacher assignments start blank.

## Contacts toolbar refinement

- Default, All and Clear filters stack vertically beside the column filters. Their combined height matches two filter rows, reducing horizontal space.

## Contacts, role ownership and saves

- HR Terms is the shared master dropdown catalogue in Deploy. Fixed day, month and Active choices remain application-defined.
- Membership belongs to each deployment version. Role Truth Table displays that version's mappings. Duplicates retain independent mappings.
- Successful publication projects the active published Membership mappings to Contacts. Master choices are shared across versions and synchronized to Contacts when saved.
- Contacts no longer has Membership or Sys Fields pages. DIY edits only the authenticated person's Statutory Name and Mobile No.
- Inactive Edit Info rows sort last after loading and saving, preserving their relative order. A complete grid skeleton appears immediately and remains read-only until data is ready.
- Contacts list column choices omit Basic Name, Specialism and Teaching periods.
- Saves reuse returned snapshots, batch pending edits and avoid the former lease/sync round trips. Confirmed saves are distinguished from retained drafts and failed attempts.
- All tables use native scroll containers, frozen headers and first columns. Duplicate window-bottom scrollbars are removed.
- Load Settings explicitly displays `(n/a)`, separately from zero.
- Acting ST has no appointment offload and no missing-configuration warning. Zero offload percentages display blank.

## 3D model and release identity

- The requested Block B/Block K stair, playground, corridor, railing, lift, hall-core and upper-room geometry is included and checked against the actual scene meshes.
- The external stair remains shifted north by 27 plan units, separate from the fixed L3 play deck; L2 has no corridor connection and L3 has the direct open playground gate.
- Lift and corridor routes, open movable partitions, retained room identities, independent stair roof and exposed landing corner are included.
- All current system and embedded-model version labels, asset URLs and revision metadata use v0.4. The old visible model v1.1 label is removed.

This is a complete release package. Update both Apps Script projects and all three frontends together using DEPLOYMENT.md. Building this package does not change the live installation.
