# GSiS v0.5.06

Baseline: v0.5.05, commit `806309fe18b81c87f0c2976cc0f30d5190538cff`. This release implements Q155 through Q173 under the 8 October 2026 commit instruction. Deploy write protocol remains 500. Packaging and committing do not install the applications or change live school data.

## Audit, saving and HR

Audit displays event times in Singapore time, labelled SGT. Stored UTC timestamps and event order remain unchanged. Summary reads fetch only the displayed summary fields, while before and after details remain separate. The existing consistency checks and Admin access remain; no audit cache is introduced.

Classes and HR save paths now load the collections needed by each operation, with wider reads retained where assignment or venue checks require them. Scoped saves fetch editing values and view row addresses together. Save planning reuses sheet handles and last row results within the request. Conflict checks, journal durability, writer locking, receipts and uncertain save recovery remain in place. The synthetic 159 teacher, 1,500 assignment comparison reduces class ability save reads from 65,429 to 880 cells and teacher note saves from 69,912 to 5,319 cells. Scoped editing and view address reads use one Sheets API read instead of two, including Span of Control; a 40 row Audit summary reads 160 rather than 240 cells. See `PERFORMANCE_v0.5.06.md` and `VALIDATION.md` for the measurement boundaries and installed product checks. These counts do not establish production latency.

Teachers shows inactive colleagues by default and includes inactive Contacts colleagues absent from the selected version. Stable Staff IDs prevent duplicate rows. A Contacts only row does not add or activate a teacher merely by being displayed; an explicit edit creates a version draft. Version owned profiles retain precedence, and changes to Contacts still require approval. Inactive rows remain below active rows when sorting. Shorter rows keep notes available for expansion and editing.

Span of Control fits its containers to content while retaining scrolling for wider structures. Subject Load, department, committee, CCA, PLT and Events settings align text left and purely numeric cells centrally. The Program Settings labels become PLT and Events.

## TG editing and information views

TG subject selection now uses the selected primary level, preserves an explicit valid subject and revalidates it when applying. There is no silent fallback to the first subject. The original live report of selecting FMA and receiving EL was not reproduced locally; the release strengthens this path and adds regression coverage rather than claiming a proven production root cause. IP Deploy restores its table position after TG editing, including closing the editor and save confirmation.

Classes & TGs displays P1 through P6 in one horizontal row with a shared scroll area. Level titles and table headings remain visible; each level retains Columns and Excel export. Narrow screens scroll horizontally instead of wrapping level panels or reducing font size.

Ledger adds R, the individual relief quota before Block deductions. Stats adds R (average), using the same selected version's relief settings and shared calculation. Empty categories or categories containing unavailable relief values show Unavailable. A valid zero stays zero. Category membership continues to overlap, so category figures must not be added into a school total. Average per teacher is the implementation assumption announced during this commit; the earlier total versus average question received no user answer.

Stats opens with content sized columns and includes Compact to restore that sizing. Workload Settings moves immediately right of HR Settings in the main Deploy navigation, retaining its existing access and editor. Workload equations use full size fraction contents, reserve at least two normal line heights, and allow horizontal scrolling where needed.

## Department and group membership

Departments allow multiple Deputy selections and add a TLs row between Deputy and Member. Both use checkboxes. The existing Head, Deputy and member slots retain their meaning; additional deputies and TLs use optional fields. This adds no HR role, offload rate or workload allowance.

Departments, Committees, CCAs, PLT and Events each show one Choose control immediately below their own last member. Shorter columns have blank cells beneath that control. Adding or removing a member closes member gaps while preserving order and fixed leadership rows. Publication, flat membership consumers, counts and Unassigned lists include all department deputies and TLs. Duplicates keep independent copies; blank versions clear these assignments.

## Layout room names

| Unit | Name |
| --- | --- |
| C4-17 | MCL1 |
| C4-18 | MCL2 |

Room names appear alongside existing unit and allocation labels in Layout and its related room displays and exports. Unit identity, geometry and assignments are unchanged.

## Installation and evidence

Install both v0.5.06 backends and all three v0.5.06 frontend packages together. Existing URLs, authentication, spreadsheet setup and bridge secrets remain. The relief API contract and its pre Block `R` field are unchanged. See `DEPLOYMENT.md`, `API_CONTRACTS_v0.5.06.md` and `VALIDATION.md`. Browser appearance and installed save latency require their own evidence; no live deployment is claimed here.
