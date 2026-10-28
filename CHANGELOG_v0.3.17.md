# GSiS v0.3.17 — queued changes completed

| Queued request | Shipped behavior |
| --- | --- |
| Edit Info top row freeze | Header freezes within table scroll area; TTb Name stays frozen horizontally. |
| DIY option A | Only own Mobile No editable, including Admin using DIY; other personal fields read-only; server rejects forged edits. |
| Smaller checkboxes | 18 px checkbox dimensions, including minimum sizes that previously enlarged them. |
| Membership formal names clipped | Content-sized second column, stable fixed table sizing, synchronized frozen-column offsets. |
| Membership header sort / resize | Ascending/descending actual cell values; drag or keyboard resize; widths retained as display preferences. |
| Remove Subject Modifier from Membership | Removed from Contacts Membership and Deploy Role Truth Table; obsolete backend column cleared on table Save; individual teacher modifiers retained. |
| Delete column label | Contacts Membership and Deploy Role Truth Table label the × column Delete. |
| EO Appt source of truth | Role Truth Table remains authoritative. Teachers displays derived EO read-only, including existing version records. Role changes update immediately in the local draft. |
| EO choices | Sys Fields supplies editable shared validated EO choices, including SL/HOD/Jnr KP/TC/ST/LT and blank; existing MTT/custom choices retained. This replaces the earlier proposal for independently editable EO values in Teachers. |
| Exclude nonteachers | Shared resolved classification used by Teachers, Summary, selection lists and backend assignment validation. SC role excluded; SC membership alone does not exclude HOD/teachers. |
| Truth Table placement | HR Terms → Teachers → Role Truth Table → Offload. |
| Block B L2 latest markup | Green N–S and magenta E–W open rails; cyan N–S solid parapet; yellow removed; orange open; enclosed rain cover retained and marked non-walkable. |
| F–E internal rails L2/L3/L4 | Only the internal crossing segments removed; outside courtyard guards and floor retained. |

## Reliability details

- Master role changes invalidate the deployment snapshot cache. Loaded and saved profiles use one shared resolver, including legacy snapshots with missing profile fields.
- Planned source fields are preserved; only classifications are derived from the current master mapping. Legacy missing fields can fall back to Contacts.
- Offload uses the resolved EO level, so the displayed classification and teaching-load factor agree. Explicit blank mappings remain blank.
- Save journals, conflict handling, Admin/KP permissions, public published-allocation isolation and the single Layout-owned 3D model remain intact.
- No new polling, persistent live connection, independent teacher EO override or automatic publication.

## Delivery

The full suite includes three directly uploadable frontend ZIPs, both combined Apps Script backends, source/tests, geometry proof images and DEPLOYMENT.md. This is a packaged release, not a live deployment or a Git commit. No Git repository is configured in the supplied source tree.
