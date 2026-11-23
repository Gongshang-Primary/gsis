# Public WhatsApp menu with restricted Urgent Message

Model: Codex.

- Status: implemented; verification in progress; owner-requested continuation of pending v0.9 hotfix PR #182.
- Owner/model: Codex.
- Branch: codex/roster-absence-clash-confirm; extension base 592fac9982b8935b1d14b8bbff500a1af78aa2c7.
- Current main inspected: 5386513. The existing absence hotfix and its tested history are retained on this branch.
- Updated: 16 Nov 2026 (Asia/Singapore).
- Review: owner waived Claude review for v0.9 hotfixes. Owner merges and deploys.

## Owner request

Display this notice and menu to every sender without an identity gate:

> *This number is no longer actively manned by staff member*
>
> Gongshang Primary WhatsApp Notifier. Please select an action:
>
> 1. Report Absence
> 2. Urgent Message
> 3. School Layout
> 4. Collect / Return ICT
> 5. Call General Office

Urgent Message remains restricted to a unique staff or engaged relief-teacher record, including both active and inactive records. Unknown and ambiguous identities must not open or submit an urgent session. Recheck identity when the urgent text arrives. Do not broaden recipients or other staff permissions.

## Scope and acceptance

D1 inbound routing and the Worker menu response, their generated Worker artifacts/Pages package, behavioural tests, generated parity references and deployment notes. No Apps Script/shared Google-domain changes, no v1 product work, live configuration, data, provider sends or deployment. Existing menu enablement, webhook verification, Inbox capture, rate limits, expiry, reply claims and duplicate suppression remain.

Test public menu and links for unknown/ambiguous/inactive senders; urgent prompt and submission for uniquely matched active/inactive records; rejection on unknown/ambiguous/changed identity; unchanged active duty recipients; duplicate requests and rate limits. Canonical build must leave no diff. Run v0.9 local checks and full required CI at the exact head. Update PR #182 and provide replacement packages after the gates pass. Previous package 592fac9 remains the absence-only hotfix; it does not contain this change.

## Implementation evidence

The D1 notification adapter uses `edge-whatsapp-inbound.js`; the frozen shared/Google handler is unchanged. Public menu and public selections do not inspect identities. Urgent prompt and text independently require one Contacts roster identity, without an active-status filter. Urgent recipients keep the existing active duty filter.

Targeted tests passed for all sender classes, identity removal/ambiguity/change between prompt and text, replay, rate limit, expiry and long-message splitting. The actual signed webhook test uses SQLite D1, the durable scheduled drain and mocked Meta delivery: Inbox capture occurs before the menu reply and redelivery sends no second menu. No live traffic was sent. Full exact-head local/CI verification follows.
