# v0.7.03 build scope

Full-suite source with Contacts, Deploy, Layout, Roster and Calendar frontend packages, complete Contacts, Deploy and Calendar backends, manifests, notification Worker, tests and local verification evidence. The 62 baseline vendor assets remain included. The exact public privacy page and its three contact images are retained.

Runtime changes cover Roster in-memory timetable reuse, local colleague interactions, save recovery and feedback, batched Calendar dates, Contacts editor stability, Deploy sorting and Calendar read/write reliability. Layout's existing publication protocol remains intact. Write protocol 500, Calendar schema, publication authority, atomic storage and retry receipts remain in place.

Install the matching Calendar backend before the Roster Worker because multi-date operations now require `rosterDates`. Existing deployment URLs, properties, school ownership and data remain in use. No data reset or migration is included.

This package contains the finalised v0.7.03 working tree. No Git commit, tag or push is part of finalisation. The source ZIP, rather than a baseline repository bundle, contains this release's code. The previous v0.7.02 Ready ZIP is preserved for rollback.

Live deployment is separate. WhatsApp and allocation automation remain paused. Live absence cleanup has not been confirmed. Production startup reliability still needs the matching diagnostic record and live acceptance.
