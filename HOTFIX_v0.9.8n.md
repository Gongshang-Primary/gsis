# Install GSiS 0.9.8n

Use SETUP.html or SETUP.md. Replace the existing Roster combined Apps Script code with Roster_Backend_v0.9.8n.gs and deploy a New version of the same web app. Then upload the inner Roster_Frontend_v0.9.8n.zip to the existing Roster Pages project. Preserve all properties, secrets, IDs, URLs, domains and bindings.

This patch restores bounded save headroom without deleting history or changing storage authority. Retained reports keep their request identities. The normal processor can retry pending work; old shorter-review reports receive one corrected recovery attempt. Protected/started cover conflicts still need review. Refresh Received reports to verify applied status; do not resubmit merely to clear a notice.

Worker text files are optional parity updates for existing installations. No new infrastructure or schedule changes. Calendar and Deploy are not updated here. Reverting the backend to M restores its 12,000,000-character guard and may block saves if the document is now larger. No live deployment or notification send is performed by package preparation.
