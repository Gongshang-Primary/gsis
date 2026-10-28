# GSiS v0.5.06 API contracts

This document extends `API_CONTRACTS_v0.5.05.md`. Deploy write protocol remains 500. Existing routes, web app URLs, school identity checks, Contacts owned roles, version isolation, frozen publication and durable save recovery remain. Both backends and all three frontends must use the matching v0.5.06 package.

## Department leadership

Department objects retain their existing positional `slots`. Index 0 is Head, index 1 is the first Deputy, and indexes 2 onward are Members. Two optional arrays extend departments only:

```json
{
  "id": "dept-example",
  "name": "Example department",
  "slots": ["head-id", "deputy-one-id", "member-id"],
  "additionalDeputies": ["deputy-two-id"],
  "tls": ["tl-one-id", "tl-two-id"]
}
```

All values use existing teacher identities. Missing arrays mean no additional deputies or TLs, so existing snapshots retain their old Deputy and Members without a positional migration. Selections must contain eligible active teachers and a teacher may appear only once within the same department. The same teacher can belong to another department under the existing cross group rules. These arrays are rejected on other group kinds. The existing limit of 300 assignments per group applies across its roles and members.

Normal organisation draft edits store these fields with existing expected values, request identities and receipts. `GSISPlanning.members` includes slots, additional deputies, TLs and any retained committee leadership. Publication and Contacts membership consumers therefore see the complete flat membership. Consumers that read only `slots` must adopt the shared membership rule before interpreting a v0.5.06 department.

Duplicating a version copies all department assignments independently. Creating a blank version clears slots and removes the optional arrays. Department TLs does not create a Contacts HR role, offload rule, teaching assignment or workload allowance.

## Member lists

Department, Committee, CCA, PLT and Events member arrays discard empty member gaps while preserving remaining order. Their fixed leadership slots are not compacted. The single trailing Choose control is presentation only and is not a new stored teacher assignment. A group with no members remains addable. Retained committee leadership data continues to follow its existing schema.

## Teachers from Contacts

The Teachers view merges the selected version's teachers with currently available inactive Contacts colleagues by stable Staff ID. Version records take precedence. Contacts only rows are a view of the existing catalogue and do not mutate either application when listed.

An explicit edit to a Contacts only colleague uses the existing `upsertTeacherProfile` draft operation. Reactivation is an explicit Active change. Existing profile validation, expected value checks, publication review and Contacts approval still apply. This release adds no unauthenticated directory endpoint and does not turn a displayed inactive colleague into an active assignment.

## TG subject and class scope

The `addTG` and `updateTG` request shapes remain unchanged. The UI offers subjects for the selected primary level, retains an explicitly valid selection and revalidates it on Apply. A subject invalid at the new level requires another explicit selection. Class references, whole level exclusivity, independent venue choice and assignment remapping keep the v0.5.05 contract.

## Relief and information views

`GET /api/relief` and the signed Apps Script `relief` action retain schema version 1 and their existing authorization. Omitting `versionId` reads the frozen published version; an explicit version ID reads that version's draft. No new endpoint is required for Ledger or Stats.

| Field | Meaning |
| --- | --- |
| `R` | Teacher relief quota before Block deductions |
| `blockPeriods` | Version owned weekly Block allowance |
| `remainingR` | `max(0, R - blockPeriods)` when R is available |

Unavailable R and remaining R remain `null`, distinct from a valid zero. API values retain calculation precision. Ledger formats each individual R from this shared calculation. Stats displays the arithmetic mean of R across the existing eligible active teachers in each category. It reports Unavailable for an empty category or if any included teacher has unavailable R. Categories can overlap and cannot be summed as an unduplicated school total. UI formatting is up to two decimals and does not change the API's precision.

Only Block changes leave both Ledger R and Stats R unchanged. Mode, factor, teacher and version changes use that version's relief inputs. Actual FTT, PD and duties still apply in both modes. `planningQuota:true` and `timetableAvailability:false` remain; the API does not allocate timetable periods or send notifications.

## Audit and storage

Audit timestamps remain canonical UTC ISO instants in stored records and responses. The frontend formats them using `Asia/Singapore` and labels them SGT. Pagination, ordering, detail access and Admin purge permissions keep their existing contracts.

Additional narrow save scopes and request local storage metadata reuse reduce redundant service work. They do not remove cross reference validation, writer locks, journals, pending markers, receipt authorization or reload consistency checks. Operations that need assignment or venue references retain those dependencies. Legacy stores may need a broader first read to prepare projection metadata. Refer to `PERFORMANCE_v0.5.06.md` and `VALIDATION.md` for the exact measured boundaries.
