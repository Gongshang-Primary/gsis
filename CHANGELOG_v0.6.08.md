# GSiS v0.6.08

Q214: require unique timetable names within a version, including inactive and pending teacher profiles. Reject duplicate edits before they enter the local draft and check again at save. Case and repeated spaces do not bypass the check. Teacher IDs stay stable when a name changes.

Q215: Admin can view a read-only Stable ID under ID / delete in HR Settings > Teachers. Delete teacher shows the selected version, named record and affected allocations. Delete from draft queues the change; Save changes commits it. Deletion removes the version's teacher record and its deployment references. A changed profile or allocation requires a fresh review. Audit history and the existing recovery record remain. This action does not delete Contacts or another version.

Q216: SMC can set a teacher to inactive. The same save removes the teacher's assignments, duties, group roles, reporting links and relief blocks, including auto PAL entries. The teacher record and its notes remain. Reactivation does not restore allocations. Published snapshots remain unchanged until the existing explicit publication process.

Q217: include README.md and the complete GSiS-Deploy-User-Manual-v0.6.08.html at the top level of the full deployment ZIP. The README links to the manual beside it. Both files are covered by SHA256SUMS.txt. The manual's screenshots and controls work offline.

Q218: merge the manual's SMC and middle-management instructions. The main tree is Get Started, Decide, View, Settings, Audit and Reference. Settings groups Program Settings through Versions and Publish. Manual revision 1.5 includes the teacher changes and preserves the 36 screenshots and existing page links.

Q219: reject an incomplete Contacts access response instead of converting missing Roster SMC authority into teacher-only access. The frontend requires the verified access marker and clears stale management controls when access cannot be confirmed. A confirmed current SMC member can open Baseline Timetable even when no timetable is active. Login alone does not grant upload rights. The reported screenshot uses v0.6.06; installation must update the existing Contacts and Deploy web apps and Roster frontend together. The exact old deployed response remains unverified.

No new dependency, Google client, Apps Script project or storage folder. Suite release labels are 0.6.08. Workload and relief formulas, employment rules, PAL policy, Calendar integration and write protocol 500 are retained. Installing the package is separate from this commit.
