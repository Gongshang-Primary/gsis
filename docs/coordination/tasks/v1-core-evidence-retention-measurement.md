# Core evidence retention after PR #257

Model: Codex. Recorded 21 November 2026 SGT. Status: owner decisions recorded. Retention period open.

This record covers the read-only measurement and the owner's cleanup design choices. Product baseline is [merged #257](https://github.com/Gongshang-Primary/gsis/pull/257) at `2cc0c47f68e4f8931ff4fd92eda3c5a44be2d20d`. Coordination baseline is `fabbc9f8f32d5152022daf72fb892ab46dfdc8f1`. The only changed file is this task record.

## Owner decisions

- Measure 90-day and one-year savings before choosing a retention period for fully settled evidence.
- Keep a compact audit entry when detailed evidence expires. An authorised investigator should still see who acted, what action was evaluated, when, its outcome and a durable reference.
- Give Global Admin Toolbox a preview that shows what would be removed, what is protected and why. A Global Admin explicitly confirms each batch after the recovery checks are proven.

## Snapshot measurement

Read the verified private Core D1 export completed on 20 November 2026 at 22:30:34 SGT before the v1.09 rollout. The receipt and dump checksums match and the read-only SQLite copy passed `PRAGMA quick_check`. The assessment uses the export timestamp for both cutoffs.

| Minimum age | Detailed evidence meeting both age checks | Linked receipts eligible through that evidence | Expired terminal Core admissions | Estimated space reclaimable |
| --- | ---: | ---: | ---: | ---: |
| 90 days | 0 | 0 | 0 | 0 bytes |
| 365 days | 0 | 0 | 0 | 0 bytes |

The snapshot has 2,414 rows in `core_evidence` and 432 in `core_destination_receipts`. Their tables and indexes occupy 10,448,896 bytes (9.96 MiB) in the local SQLite copy, out of 10,936,320 bytes (10.43 MiB) for Core. The oldest detailed record was created on 14 November 2026. No Core admission rows were present. #257 leaves the separately stored denial audit in `product_audit` outside its cleanup scope. [Denial evidence storage](https://github.com/Gongshang-Primary/gsis/blob/2cc0c47f68e4f8931ff4fd92eda3c5a44be2d20d/v1/services/core/evidence.mjs#L49-L61)

The measurement used aggregate counts from immutable, read-only SQLite. The evidence count requires both `created_at` and `valid_until` before the cutoff. The admission count requires `resolved` or `aborted` with `valid_until` before the cutoff. The age filter returns zero before any protections are evaluated, so stricter cross-owner checks cannot increase eligible rows. The exact #257 selection also returned zero. An independent import of the verified SQL and a repeat using the measurement-time cutoff on 21 November confirmed the same result. Page allocation comes from SQLite `dbstat` joined to `sqlite_schema`. It describes the local import. D1 allocated bytes and billing can differ from local page size or logical deletion estimates. All checks ran offline. [Storage measurement semantics](../../v1/accelerated-delivery/STORAGE_TOOLBOX.md#inventory)

## Recovery boundary

#257's age query checks only Core's own admission and pin tables. A synthetic two-database check selected a decision while its admission was still resolving in another owner's database. An expired authorization can still be needed to reconcile a save. Before offering deletion, obtain current settlement and dependency evidence from the affected owners and protect any record whose status is unresolved or unknown. Verify that a stale preview cannot delete a newly protected item. A cross-Worker recovery regression must show that a lost receipt can still be reconciled after preview and cleanup of unrelated settled evidence. [Selection query](https://github.com/Gongshang-Primary/gsis/blob/2cc0c47f68e4f8931ff4fd92eda3c5a44be2d20d/v1/services/core/service.mjs#L1661-L1679) · [Recovery flow](https://github.com/Gongshang-Primary/gsis/blob/2cc0c47f68e4f8931ff4fd92eda3c5a44be2d20d/v1/runtime/admission.mjs#L839-L933)

The owner's decisions are for the future workflow design. The committed deletion flag stays false. F5 remains open. [Storage Toolbox](../../v1/accelerated-delivery/STORAGE_TOOLBOX.md) · [Evidence recovery design](../../v1/core/F5_EVIDENCE_RECOVERY_DESIGN.md)
