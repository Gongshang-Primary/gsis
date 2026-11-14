# Owner change queue — 14 November 2026

Owner instruction: build and clear the changelog one related group at a time, with a claim and independent exact-head Claude review for each PR. This authorises implementation, not merge, deployment, provider sending, Drive activation or live deletion. PR145 remains independently reviewed.

| Order | Item | Implementation / next evidence |
| --- | --- | --- |
| 0 | PR145 L1 migration collision | `codex/v1-admin-account-create`, f1efe8a687cb640dae8731fe674acb72b33e7f9b. Byte-identical REIGN rename to 0003; local upgrade, build, 62 product programs and both exact-head CI jobs green. Claude re-review pending. |
| 1 | Layered relief capacity and remaining-week projection | `codex/v1-relief-capacity-forecast`, [claim](../../coordination/tasks/v1-relief-capacity-forecast.md), [contract](RELIEF_CAPACITY.md). Local implementation; review/CI pending. |
| 2 | Early SMC capacity warnings | Separate related follow-up after item 1: current layered health, meaningful-change fingerprint, bounded weekly outlook at existing summary slots; recipient/quiet-time/dedup/unknown-provider safeguards. Existing approved-template records are usable in principle; actual configured templates require verification. No sending authorised. |
| 3 | Global Admin Toolbox | Tenth homepage tile visible only to Global Admin; reuse existing `/admin/` and enforce server authority. Inventory misplaced maintenance controls; preserve routine controls for their authorised operators. |
| 4 | Storage management | D1/R2 size inventory, manual preview and explicit prune confirmation, owner-specific reference and recovery guards; no automatic age-based retention deletion. Do not describe logical row deletion as immediate D1 file shrinkage. |
| 5 | Provider setup | Protected GitHub environment `gsis-v1-owner-approved`; credentials outside repository/browser/build output, existing tokens unchanged. Document exact WhatsApp and Telegram names after checking actual provider contracts. No activation/cutover inferred. |
| 6 | F5 durable recovery | Trace decision to actual observation and immutable Contacts evidence, demonstrate restart/restore integrity and negative cases; preserve evidence while retention remains undecided. F5 stays OPEN until required recovery and review are demonstrated. |

D1 Drive folder sharing: closed, owner-managed. D2 Drive retention: open owner choice; no automatic deletion. Official T1B-01/T1B-02 and unperformed runtime UAT: **Not tested**. A local test pass is not a live integration or recovery claim. Subsequent claims and PRs must link their exact heads here; this queue does not mark pending work complete.
