# GSiS 0.9.8m changes

Both manual Roster controls can run at any time on eligible current/future dates. Auto-allocate reconsiders unstarted blanks and unstarted unpublished automatic assignments together. Auto-fill blanks fills eligible unstarted blanks and preserves all existing assignments. Past dates and elapsed periods are not reopened.

Started/completed, published, SMC, approved peer, protected and explicit manual no-relief/clear decisions remain fixed. Pending peer proposals reserve their lessons. Current authority, source conflict checks, request identity, cancellation, uncertain-response recovery, K suspended-day policy and all enabled business rules remain.

Scheduled run cadence and the existing 06:29 Singapore optimisation cutoff are unchanged. This is a manual-control change, not an extra cron or a scheduler expansion. No publication or WhatsApp send occurs merely because allocation is run.

The patch contains the matched Roster frontend/backend pair and two optional helper-parity files for existing notification and Operations Workers. Calendar and Deploy stay L; other products stay J. The separate I rehearsal remains unchanged. No authority/storage migration, new resource or secret is required. Preparation does not change live school records.
