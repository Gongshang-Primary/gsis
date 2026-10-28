# GSiS v0.4.05

Contacts, Deploy and Layout. Prepared on the user's explicit instruction to commit outstanding changes and troubleshoot the teacher-modifier incident. No live software installation or publication was performed.

- Q56: remove every IP **× venue** button. Only extra TG rows have a delete cross; it removes that TG and its teaching assignments. Keep teacher records and main form-class rows. Separate unassigned classes, attach new TGs to their master row, move an assigned venue group together and merge display groups when the same real venue is selected. Reject a stale TG deletion if its definition or assignments changed.
- Q57: rightmost **Compact** action on pages containing tables. Fit contents and controls without shrinking fonts or hiding values, preserve one teacher per line, and recalculate sticky offsets. Compact is local presentation only.
- Navigation: reset the old page container scroll offset when switching views so an Offload scroll position cannot hide the next IP table header.
- Q58: relocate both marked ISH east doors to the right-hand positions in the supplied view, keeping their sizes and levels. Old door openings become matching wall. The entire approved v0.4.04 stair, railing, platform, roof and support geometry is unchanged.
- Incident: remove Layout's 30-second outer deadline that cut off the second read attempt. Give Deploy saves a 60-second gateway / 65-second transport / 70-second outer budget, keeping writes single-attempt. Add read-specific errors and safe diagnostic IDs/categories for gateway failures. Read retry remains bounded; exact receipt recovery remains authoritative.

Direct Google Sheets inspection found the modifier changes committed at working revision 39, with no pending transaction, no canonical/projection disagreement, 156 teachers and 475 assignments. Published revision 16 remains separate. No live data repair or rollback was needed. Exact production timeout cause is unconfirmed: direct gateway probes returned Cloudflare HTTP 403 / 1010, and live execution logs were unavailable.
