# GSiS reference endpoints for LORD

The Contacts and Deploy Apps Scripts expose a dedicated read-only `lordService` action. It uses `LORD_BRIDGE_SECRET`, independent of the normal browser bridge and Roster notification credentials. Install the updated complete source in the existing source deployments; configure the matching secret in Contacts, Deploy, and LORD. This review does not deploy or configure a live project.

LORD stores the two source URLs in `LORD_CONTACTS_APPS_SCRIPT_URL` and `LORD_DEPLOY_APPS_SCRIPT_URL`. Credentials belong in Script Properties and must not appear in URLs, browser responses, logs, or snapshot files. The service does not grant LORD an Admin role or accept a school-user identity.

## Signed request

POST a JSON envelope `{payload, signature}`. `payload` is the exact JSON string signed with HMAC-SHA256; `signature` is its lowercase hexadecimal digest. The payload is:

```json
{
  "action": "lordService",
  "service": "gsis-lord-v1",
  "source": "contacts",
  "timestamp": 0,
  "nonce": "a fresh UUID for this request",
  "input": {"operation": "manifest"}
}
```

Use the current millisecond timestamp, a fresh UUID, and `source: "deploy"` for Deploy. The endpoint rejects requests outside a 60-second clock window, a wrong source/service, additional request fields, arbitrary version selection, and invalid signatures before workbook access. Read-only nonce replay within that freshness window has no mutation side effect.

`input.operation` is `manifest` or `snapshot`. Optional `knownKey` and `expectedKey` must be 64-character lowercase hexadecimal strings; omit unknown keys rather than passing an empty string. A manifest returns the full current projection on the first or changed read, and `unchanged: true` with no rows when `knownKey` matches. A snapshot always returns its projection. An `expectedKey` mismatch returns status 409, code `SOURCE_CHANGED`.

Successful responses are `{ok: true, data: ...}`. Shared data fields are `schema: 1`, `source`, `key`, `authoritative: true`, and `observedAt`. Observation time is outside the key. Deploy also supplies its stored publication `updatedAt`; Contacts has no fabricated edit timestamp.

## Contacts projection

`people` contains only:

| Field | Source |
|---|---|
| `id` | Staff ID |
| `name` | Derived TTb Name |
| `active` | Active = Y |
| `email` | Normalized GSPS address |
| `cesEmail` | Normalized CES address |
| `statutoryName` | Statutory Name |
| `mobile` | Normalized eight-digit mobile, or blank |

Birthdays, employment fields, role membership, access records, and the rest of the directory are not returned. Email and mobile fields support LORD's existing local authentication and notifications; this response must remain server-side.

Every sync reads Contacts and roles in one fresh batched request when the Sheets API is enabled (two exact table reads in native mode), derives TTb names, validates identities/contact values, sorts by Staff ID, and hashes `['lord-contacts-v1', people]`. A direct Sheet or role edit therefore changes the relevant key even if script epochs did not move. Birthday-only changes do not invalidate this projection. Pending markers and epoch changes across the read fail closed. Reads do not acquire writer locks, recover transactions, or write back calculated fields.

The property fence covers application-managed transactions. Direct manual Sheet edits do not have a transactional marker; the fresh batch detects changes between checks, but is not a claim that arbitrary simultaneous manual edits form an atomic transaction.

## Deploy projection

The source selects `publishedEntry_(idx)` exclusively. It never substitutes `idx.versions`, `idx.active`'s draft record, the highest year, or a caller-selected version. The key is the SHA-256 JSON digest of `['lord-deploy-v1', id, revision, commit]` for that frozen publication.

A matching manifest reads only the publication index twice and reads no catalogue document rows. Draft changes to an unpublished 2027 version change the global index revision but leave this key unchanged. A changed/full snapshot uses indexed ranges for the published `id`, `from`, `to`, `classes`, `loads`, and `groups` roots and rechecks the publication pointer before returning. Legacy storage without those range indexes requires a larger server-side read; the returned projection remains the same allowlist.

The projection supplies:

- `publication`: `id`, frozen version `name`, `revision`, `commit`, stored `updatedAt`, `from`, and `to`.
- `classes`: stored stable class `ref` as `id`, canonical class label as `name`, `fullName`, and `level`.
- `subjects`: exact existing subject code as both `id` and `name`.
- `teachingGroups`: stored `id`, `name`, `subjectId`, `levels`, `classIds`, and `levelWide`.

Subject codes are existing code identities; there is no distinct subject UUID or automatic rename mapping. Legacy published classes without stable refs fail with `SOURCE_INVALID`; review and republish that version in Deploy. No label-derived class identity is invented.

`from`/`to` are exposed metadata. The published pointer remains the source authority, including if an administrator explicitly publishes a future-dated version. LORD should display a date-range mismatch and must not quietly select an unpublished alternative. A missing publication fails with `SOURCE_UNAVAILABLE`, not an authoritative empty list.

## Failures and validation

Applications must preserve their last successful local snapshot on source failure and show the failed check separately. Codes are `SOURCE_UNAUTHORIZED` (401), `SOURCE_REQUEST_INVALID` (400), `SOURCE_CHANGED` (409), and `SOURCE_UNAVAILABLE` / `SOURCE_INVALID` (503). Pending source writes are unavailable; the service never performs recovery.

`tests/lord-source-bridges.cjs` exercises the real signed `doPost` paths with synthetic source storage. Its 14 checks cover strict signing/allowlists before reads, minimal fields, fresh Contacts hashing after direct name/role/phone edits, birthday isolation, pending/change fences, identity validation, frozen publication selection, unpublished 2027 isolation with zero document reads, explicit publication/date metadata, stable refs, canonical class labels, unavailable/corrupt sources, and rejection by the Roster build before workbook access. It performs no live API calls.

Focused existing checks also passed after source-only synchronization: `first-load-contacts.cjs`, `release419-backend.cjs`, `contacts503-view.cjs`, `release084-backend-role.cjs`, and `deploy418-projection.cjs`. The source-only build passed the Apps Script syntax gate; versioned deployment artifacts were unchanged.
