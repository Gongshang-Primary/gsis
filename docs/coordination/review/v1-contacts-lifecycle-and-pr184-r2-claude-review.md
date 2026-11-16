# v1: Contacts lifecycle design (main `f22f730`) and PR #184 at its new head, Claude

Project: **v1**. Model: Claude (session `session_01L5sZ14xpe864PwuPQKyrDF`). Reviewed 16 Nov 2026 (Asia/Singapore). Advisory. Both items are design documents; no code was run for this review.

| Item | Exact reference | Verdict |
|---|---|---|
| `docs/v1/contacts/CONTACTS_LIFECYCLE_DESIGN.md` | main `f22f730` | **Accept as the owner's design record.** Four hazards for the owner to confirm before any implementation claim (H-1 to H-4) |
| PR #184 Central Google backup: direct Drive API | `720fe385adaabde05fe2908c0fcf2968a3861d90` | **Approve as document.** My approval at `688e2ae` covered the withdrawn Apps Script transport only |

## Contacts lifecycle design

### What it decides (owner statements, quoted or recorded in the document)

1. There is no single authoritative Contacts database. Contacts is an accumulating register. Each Deploy draft holds its own copy of people.
2. Publishing a Deploy version updates Contacts at once: it appends new Staff IDs, sets Active in both directions, and **overwrites eleven tag fields**, where a stored blank clears the Contacts value.
3. Basic Name: the latest actual edit wins. Statutory Name is edited in Contacts only. TTb Name is derived by each module from its own inputs and must be unique across Contacts and all current and future drafts.
4. Roster may add an ad hoc teacher (created with Active = No) and correct a mobile number. Mobile is required for Roster and not for Deploy.
5. Security authority (SMC, EO, School Leader, Core grants) is still never inferred from tags.

This supersedes the "Contacts is the sole writer" direction of the 15 Nov direct-authority job, parts of which merged in PR #176 a day earlier.

### It settles two of my open findings

1. PR #176 F-2 (duplicate qualified names): decided. A TTb collision between two Staff IDs is rejected, across Contacts and drafts.
2. PR #176 C-1 (Memberships empty): Memberships is now one of the eleven fields a publication writes. See H-1 for the risk that follows.

### Hazards for the owner to confirm

**H-1 (high): the first publication can clear tags for everyone.** A stored blank in the published version clears Contacts. Run B entered roles, modifiers and levels for 182 staff in Contacts. If a Deploy version holds blanks for any of the eleven fields (Memberships is the likely one, since role-derived groups were removed), publishing it wipes those values in Contacts for every represented person. Before the first publication under this design: compare each version's eleven fields with Contacts, person by person, and show a preview of every value the publication would clear. Make that preview part of the publish screen.

**H-2 (high): publishing next year's plan changes this year's staff today.** The design states there is no future-effective provision: publishing a future-dated version changes current Contacts at once. A teacher marked inactive in the 2027 plan becomes inactive in Contacts on the day the 2027 plan is published, while 2026 Roster still needs them. The same applies to role and employment changes. Either accept this and never publish a future plan before its year starts, or apply Active and tags only from versions whose date range includes today.

**H-3 (medium): an old draft overwrites newer Contacts edits by design.** Publication wins over Contacts tag edits made after the draft was copied. A draft copied in October and published in December silently reverses two months of Contacts corrections. The publish preview in H-1 covers this too, if it lists every value that differs from current Contacts.

**H-4 (medium, effort): this is the third Contacts design in one week.** Catalogue references (13 Nov), direct authoring (15 Nov, merged as PR #176), now sequential updates (16 Nov). The new design needs a shared name index across databases, durable event ordering, and 28 acceptance scenarios. Parts of the contribution-review machinery merged in PR #176 become obsolete. Estimate the work honestly before claiming it, and freeze this design until it is built and used. A fourth change before the third is delivered would cost more than any defect in it.

### Smaller notes

1. The design keeps "omitted is not blank" for ordinary saves and makes "stored blank clears" a publication rule. That is consistent with the 15 Nov validation directive. The two rules must be tested together (scenario C08).
2. Deploy Power Users gain the power to change Active and role fields in Contacts by publishing. Check that the capability to publish is granted as deliberately as the capability to manage Contacts.
3. Mobile becomes mandatory for Roster participation. Count how many current staff have no mobile before this is enforced.

## PR #184 at `720fe38`

The owner withdrew Apps Script ("no appscript"). The plan now calls the Google Drive API directly from Core, as the helper Workspace account, into a private Shared Drive.

### What changed for the better

1. No public script endpoint. My earlier point about an anonymous web app no longer applies.
2. It reuses the existing direct Drive adapter (`v1/runtime/drive-backup.mjs`) and withdraws its own exception to the specification.
3. It adopts the replay rule I asked for: a completed operation returns its recorded result and performs no new file write.
4. It forbids public or anyone-with-link sharing and records the private status as an owner statement, not a verified audit.

### Points the owner should know

1. **A long-lived credential now exists.** The offline refresh token lets Core act on Drive as the helper account indefinitely. The plan stores it encrypted with the key in a Worker secret. Whoever can read both the database and that secret holds the account's Drive access. Keep the helper account's own Drive access as small as the backup folder allows.
2. **The narrow scope may not see existing folders.** The `drive.file` scope covers only files the app created or was explicitly given. The plan says to validate this first. Expect either a folder-picker step during setup or a wider scope decision.
3. **OAuth app status matters.** An app left in "testing" loses its refresh token after about a week. Make the app internal to the Workspace domain if policy allows. The plan lists this as a setup check.
4. **The helper account needs an owner.** Who holds its password and second factor, and what happens when that person leaves. A shared mailbox identity with weak sign-in protection would be the weakest part of this design.
5. **Still not a restore plan, and Core still has no readable dataset.** Both gaps from my first review stand.

## Evidence limits

Documents only. No build, test, Drive access or hosted check. F5 remains open. Runtime UAT remains not tested.

## Owner responses, 16 Nov 2026 (given to Claude in session `session_01L5sZ14xpe864PwuPQKyrDF`)

Recorded so that builders do not reopen these points. The owner's words are quoted. They are decisions on the hazards above, not new implementation authority.

### Contacts lifecycle design

| Hazard | Owner response | Consequence for builders |
|---|---|---|
| H-1 publication can clear tags | "yes risk accepted. though the idea is to duplicate deploy-versions before editing drafts." | Risk accepted. The intended working method is: duplicate a version (which refreshes people from current Contacts), edit the duplicate, publish the duplicate. A publish preview is not required by the owner. Builders must make Duplicate refresh all eleven tag fields from Contacts, because that refresh is what makes the method safe. |
| H-2 future plan changes current staff | "on publish. no future accomodation." | Decided. Publication applies at once. Do not build date-conditional application. |
| H-3 old draft overwrites newer Contacts edits | "yes" | Accepted as designed. |
| H-4 third Contacts design in a week | "this is as per my spec else v1 cannot run ... it is by design" | The sequential, circular flow between Contacts, Deploy and Roster is the owner's intended model. Treat `CONTACTS_LIFECYCLE_DESIGN.md` as the controlling Contacts design. |

One operating note from me, not a new condition: the two Deploy versions migrated in Run B were not created by Duplicate under this design. Their eleven tag fields were never refreshed from Contacts. The first publication under the new design should be of a fresh duplicate, not of those versions directly.

### Drive backup plan (#184)

| Point | Owner response | Consequence |
|---|---|---|
| 1 long-lived credential | "yes long term key" | Accepted. |
| 2 narrow scope may not see existing folders | "set setup permissions long before gsis" | Folder and account permissions are an owner setup step done ahead of activation. Builders must not widen scope or change sharing to work around a missing permission. |
| 3 OAuth app must be internal, not testing | "ok guide me along then it comes to that juncture" | Claude guides the owner through the Google Cloud setup when implementation reaches it. |
| 4 helper account ownership | "that is human processs outside of coding, yes" | Out of scope for builders. |
| 5 not a restore plan | "yes. at best it is a front-end individual repopulation of data" | Decided. Recovery means re-entering or re-importing data through each application's own screens. Builders must not add a generic restore endpoint. It follows that each application's Excel import must work and be tested, because import is the recovery path. |
