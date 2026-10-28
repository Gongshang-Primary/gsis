# GSiS v0.4.09 performance and write scope

- Fortnight filtering, PD labels, reporting trees and workload remain local calculations over the loaded version.
- Span of Control initialization stores a full active staff snapshot once. Routine RO edits change only the selected relationship field plus normal audit/journal metadata. Contacts is not consulted repeatedly while expanding a tree.
- Contact creation reuses empty template rows where available, avoiding a whole-sheet copy and unnecessary grid expansion for append-only saves. The production-shaped fixture verifies existing staff rows and the legacy header remain unchanged. Mixed saves that edit existing contacts retain their backup guard.
- CCE EL consolidation is an explicit version edit. Changed groups, assignments and migration history are persisted through the existing field store, preserving unrelated version content.
- No new network requests are added to fortnight filtering, + TG placement or the layout renderer. Computed workload totals are not written back.

These are verified operation and persistence checks, not production latency measurements. The earlier live Contacts exception remains unconfirmed; error references are provided for a targeted follow-up after installation.
