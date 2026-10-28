# Supported rehearsal snapshot interchange, version 1

This is a deliberately bounded **synthetic rehearsal** format. It is not a native GSiS operational document or a production migration format. The importer accepts only the exact keys and values described below. Unsupported native state, unknown fields, credentials, people/contact data, extra source properties and unsupported operations are refused with an explicit error. No field is silently dropped. A future production migration needs a separate converter, verified reconciliation and intake buffer.

All top-level keys are required:

```json
{
  "schema": "gsis.rehearsal.snapshot",
  "version": 1,
  "release": "0.9.8i",
  "mode": "simulation-only",
  "source": {
    "system": "gsis-roster-rehearsal",
    "instanceId": "rehearsal-synthetic-example",
    "snapshotId": "synthetic-snapshot-0001",
    "exportedAt": "2026-10-27T00:00:00.000Z"
  },
  "dataset": {
    "schema": "gsis.rehearsal.dataset",
    "version": 1,
    "seed": {"kind": "synthetic-school-day-v1", "date": "2026-10-27"},
    "journal": [
      {"requestId": "synthetic-absence-0001", "command": {"operation": "saveAbsence", "staffId": "alice", "periods": [2,3]}},
      {"requestId": "synthetic-auto-0002", "command": {"operation": "autoAllocate"}}
    ]
  }
}
```

`source` identifies the export event, not a trust grant or confirmation. `instanceId` has 8–64 lowercase letters, digits or hyphens; `snapshotId` has 8–80 letters, digits or hyphens. `exportedAt` is a valid UTC ISO timestamp with milliseconds. An imported source is retained in the isolated ledger's `importSource` field. A subsequent export receives a fresh export identity for the current instance; its dataset/journal is preserved. Cloudflare receipt identities, authenticated operator audit emails, destination revision and prior source-event chains are local transport metadata, outside the portable dataset.

The dataset contains exactly `schema`, `version`, `seed` and `journal`. The seed contains exactly `kind` and a valid `20xx-MM-DD` date. The seed expands to four fixed synthetic identities `alice`, `bob`, `charlie`, `dora`, labelled “Synthetic Alice”, etc., eight half-hour periods numbered 0–7 from 07:00, and verified synthetic annual accounting. Alice has EL P2/P3, MA P4 and FORM P5/P6 in class 4A, room Demo-01. Each teacher has R=8. Synthetic policy explicitly configures FORM=2 and PAL=3. This policy does not change production defaults.

The journal contains at most 100 entries. Each entry contains exactly `requestId` and `command`; request IDs are unique 8–80 character strings of ASCII letters, digits, hyphens and underscores. Replay derives stable domain record IDs from each request ID and uses a synthetic operator/time context at 06:00 Singapore time on the seeded date. Domain state is reconstructed by the same production pure Operations, Allocation and Stapler modules used by this release. There is no raw state overlay, supplied role flag or browser authority.

| Supported journal command | Exact required fields and bounds |
| --- | --- |
| `saveAbsence` | `operation`, `staffId` (one fixed identity), `periods` (1–8 unique integers 0–7). Uses MC and instructions marked not applicable. |
| `assign` | `operation`, `staffId`, `demandIds` (1–8 unique demand IDs, each at most 160 characters). IDs must exist in replayed demand. Uses the production manual decision rules. |
| `autoAllocate` | Only `operation`. Uses the production fill-only solver and its own search bound. |
| `simulateNotifications` | Only `operation`. Records a rehearsal simulation; no delivery occurs. |
| `saveTimetable` | `operation`, `day` with exactly the supported day shape below. Replaces only the synthetic effective baseline from that journal step. |

`seedSynthetic` is an API command with exactly `operation` and `date`. It is accepted only for an empty ledger and represented by `dataset.seed`, never inside the journal. Imported commands cannot call publishing, scheduling, providers, native import, production activation or arbitrary production operations.

The supported `day` has exactly these fields:

```text
id: "synthetic-school-day-v1"
parity: "even"
schoolDay: true
verified: true
periods: [eight {period, startMinutes, endMinutes} objects]
teachers: [four {staffId, name, cells, R} objects in alice/bob/charlie/dora order]
```

Every period number equals its 0–7 array index. Start/end minutes are integers within 0–1440, each interval has positive duration, and intervals are ordered without overlap. Each teacher's ID/name is fixed, R equals 8, and `cells` contains eight arrays of exactly four plain text strings `[subject, class, venue, group]`. Each string is at most 100 characters and contains no control characters or `<`/`>`. Subject/class/venue/group cell values and valid period timings may be edited; names, contacts, employment fields, extra columns and arbitrary staff identities may not be added. The production Stapler parser additionally validates the day. A day is limited to 64 KiB.

The import API accepts exactly `{requestId, expectedRevision, snapshot}`; the ordinary write API accepts exactly `{requestId, expectedRevision, command}`. Both use the current nonnegative destination revision. Reads use a POST JSON body `{}` and same-origin Bearer Google identity. The whole request and ledger document are limited to 512 KiB. An unsupported or oversized import does not commit anything. A successfully replayed import writes an immutable gzip timetable before its D1 revision/receipt/simulated-intent/pointer transaction commits. Import replaces only this rehearsal's current portable dataset; existing durable receipts, simulation records and timetable versions remain retained.

An R2 timetable object has exactly `schema: "gsis.rehearsal.timetable"`, `version: 1`, `instanceId` and the supported `day`. Its immutable key is `rehearsal/INSTANCE-ID/timetables/v1/SHA256.json.gz`, where SHA256 covers the canonical uncompressed UTF-8 JSON. Metadata repeats the schema, version, instance and hash. Compressed and decompressed payloads are separately bounded at 64 KiB. The current D1 pointer, version record, receipt and simulated outbox share a single CAS transaction. Export is a reconstruction contract for the **supported synthetic dataset only**; it does not claim copied school snapshots are ready for migration.
