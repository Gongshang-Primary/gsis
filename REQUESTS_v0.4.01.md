# GSiS — queued changelog

Updated: 26 September 2026, following the 15:29 commit instruction  
Baseline: v0.4  
Target release: v0.4.01  
Status: Approved and implemented for v0.4.01; deployment package prepared for installation.

## Working rule

The user explicitly authorized the v0.4.01 commit on 26 September 2026 at 15:29 Singapore time. All items Q01–Q22 below are included in this release; Q21 carries forward the Contacts toolbar patch. The code and complete deployment package are prepared, with no live installation performed. See the package's VALIDATION.md for verification and limits.

Future requests return to the queue-only workflow until another explicit commit instruction.

## Review of all requests after the v0.4 release

The post-release messages in this chat have been checked against this queue, including the annotated screenshots and later clarifications. The Contacts button stack had been omitted from this queue; it is now Q21. That refinement already exists in the earlier v0.4 toolbar patch and must be carried forward. The other requests are covered below. The latest Settings sub-pages instruction supersedes the earlier flat-navigation preference. That review was approved by the subsequent commit instruction.

## Deploy and Contacts

| ID | Area | Queued change |
| --- | --- | --- |
| Q01 | Deploy loading | Improve first-load reliability and speed; address the first-attempt failure. Retain drafts and give accurate retry/save status. |
| Q02 | Cell readability | Use dark body-cell text in Dept, Committees, CCAs and Duty, including selected teacher names. |
| Q03 | Duty descriptions | Use one common Recess description in the entry page and PDF export. |
| Q04 | Membership | Remove the duplicate Membership page; rename the former Role Truth Table to Membership and make it the single editable source of truth. |
| Q05 | Load Settings | Allow digits and free-text `n/a` in the same compact cell. Remove separate n/a buttons; retain the distinction between zero and n/a. |
| Q06 | HR choices | Remove Shared choices. Keep choices within each deployment version. Publishing makes that version's choices definitive in Contacts; other versions keep their own choices. |
| Q07 | Removed HR terms | Retain terms already assigned to staff when removed from the choice list, show a visible reminder, and allow publication. |
| Q08 | Background operations | Allow requested Deploy and Contacts loads/saves to continue while their tab is inactive. Preserve accurate pending/completed states; avoid duplicate saves. Browser suspension or closing a tab cannot be treated as a guaranteed completed save. |
| Q09 | Offload | Label the final column containing the × buttons **Delete**. |
| Q10 | Duty entry layout | Mirror the final PDF export layout as closely as possible, including P1–P5 recess duties arranged horizontally. Keep the same grouping, order and description layout. Additional scrolling during data entry is acceptable. |
| Q11 | Group settings formatting | Fix formatting in Dept, Committee and CCA settings. Edit names directly in the cell, without an additional visible input box inside it. Keep names within their column so they do not overlap Members or Delete. |
| Q21 | Contacts control stack | Stack Default, All and Clear filters vertically to reduce horizontal sprawl. The full stack should match the height of two filter rows. This was included in the earlier v0.4 toolbar patch; carry it forward and verify it in v0.4.01. |
| Q22 | Release identity | Use v0.4.01 consistently for the system, embedded 3D model and release package. |

Q01–Q11 and Q18–Q22 are implemented or carried forward in v0.4.01.

## Q18 — Settings sub-pages

Replace the earlier flat Settings arrangement with Program Settings and HR Settings, aligned on the right of the navigation. Retain the existing divider-only separation between the navigation groups.

| Navigation group | Pages, in order |
| --- | --- |
| Often | IP Deploy, Dept, Committees, CCAs, Duty |
| Information | Summary, Layout |
| Program Settings | Classes, Subject Load, Dept, Committee, CCA |
| HR Settings | Teachers, Exclusions, Membership, Offload, HR Terms |
| Far-right separate entry | Audit, preceded by its own vertical divider (`\|`) |

- Rename Load Settings to **Subject Load**: this is the table defining periods per week.
- Move Teachers and Exclusions from Often into HR Settings.
- Membership is the renamed former Role Truth Table and remains the single source of truth (Q04).
- Dept, Committee and CCA under Program Settings are the definition lists. Their teacher-assignment pages remain under Often.
- Put **HR Terms** under **HR Settings**.
- Keep the validated **DOB/day-of-birth and month-of-birth choice lists** fixed and system-defined; do not offer user editing of those lists in HR Terms. This concerns the allowed options, not individual teachers' recorded birth details.
- Keep **Audit** as a separate entry at the far right, with its own preceding `|` divider.

This supersedes the earlier preference to keep Settings flat and is included in the approved v0.4.01 release.

## 3D model

| ID | Location | Queued change |
| --- | --- | --- |
| Q12 | Block B, L2 | Remove alternating parapet/rails marked with red crosses. Add metal railing at the blue outline/cyan highlight. Retain the orange rain cover. Add alternating parapet/metal railing at the green outline/highlight. |
| Q13 | Stair to L3 MK playground only | Add metal railing at the marked open corner. |
| Q14 | L3 MK playground / adjacent upper corridor | Remove extra metal rails marked with red crosses. Add a solid parapet wall at the purple outline/highlight. |
| Q15 | Exposed L2 L-shaped connector | Make the corner regularly rectangular. Follow the purple corridor outline and blue alternating parapet/railing outline. |
| Q16 | Block K west stairwell | Fill the highlighted gap between the lift stack and stairwell with a solid wall across the full vertical stack. |
| Q17 | L2 Hall / Block B connection | Remove the two marked sets of Block B rails to open the connection. Mirror the circled two-floor stair east–west; remove the marked railing and add metal rails along the blue-highlighted side, following the reference photo. |
| Q19 | ISH, Block J | Replace both cyan-highlighted exterior sections with a plain solid façade wall. The doors shown are toilet doors and must face the interior, not open onto the exterior façade. Follow image(20260926-070759).png. |
| Q20 | Layout / 3D Campus toolbar | Reclaim vertical space above the model. Move the public-view/update notice, approximate-model note and allocation/publication status into the unused horizontal space beside the search field, following the arrows in image(20260926-070918).png. Remove the repeated “3D Campus · active deployment” heading and its unnecessary row height; keep the fullscreen action accessible in the compact controls. Reduce vertical gaps so the model starts higher and receives more height. Keep text readable, with compact wrapping where needed on narrower screens. |

Q12–Q17 and Q19–Q20 are included in v0.4.01. Geometry is checked against the shipped scene meshes; the revised views are included in the Source ZIP. Visible system and embedded model labels are synchronized to v0.4.01.

## Visual references

- Contacts Default / All / Clear filters stack: image(20260926-062429).png.
- Offload Delete heading: image(20260926-065758).png.
- Group settings in-cell editing: image(20260926-070016).png.
- Duty entry layout: the earlier agreed PDF roster and supplied duty screenshots.
- ISH Block J façade and interior-facing toilet doors: image(20260926-070759).png.
- Layout / 3D Campus vertical-space consolidation: image(20260926-070918).png.
- 3D annotations: image(20260926-064108).png, image(20260926-064352).png, image(20260926-064541).png, image(20260926-064827).png, image(20260926-065022).png, image(20260926-065250).png and reference photo image(20260926-065509).png.
