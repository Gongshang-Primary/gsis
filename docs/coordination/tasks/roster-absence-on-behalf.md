# roster-absence-on-behalf: any teacher may report absence for colleague(s) (changelog)

- Status: proposed; owner rulings recorded 2 Nov ~15:40; not authorised to build
- Owner/model: unassigned (Codex when authorised)
- Reviewer/model: Claude
- Lane: R (serial; after the D1 cutover; must work on Google and D1)

## Owner request (verbatim)
"roster: allow all teachers to submit "on behalf" for another(s) for absence"

## Intent
Report Absence lets any signed-in teacher submit for one or more colleagues (e.g. a colleague who is ill and cannot reach a phone), not only for themselves.

## Owner rulings (2 Nov ~15:40)
1. Use the same mechanism as peer-arranged relief (`mutual_request` flow: request row, private capability link, accept/reject, `peer-proposals` processing, WhatsApp + email channels).
2. If teacher A submits on behalf of teacher B, B receives an approve/deny request on **both WhatsApp and email** with a direct private link.
3. Once approved, **only teacher B** can manage (edit, withdraw) the entry. A loses access after approval.

## Design (Claude)
1. A's submission creates a pending on-behalf request per colleague (no absence, no relief yet). States: pending → approved (becomes B's absence, enters normal intake) / denied / expired.
2. Notification: new outbox kind `absence_on_behalf_request`, channels `whatsapp` and `email`, private capability link (same signing and expiry as `mutual_request` links), recipient B.
3. WhatsApp template: **`gsis_relief_request_v1` (mutual_request) cannot be reused**: its fixed text says "{{2}} has requested ... that you cover his/her lesson(s)", which would tell B the opposite of the truth. None of the other approved templates fit either. A new UTILITY template is needed, e.g. `gsis_absence_on_behalf_v1`: "Hi {{1}}, {{2}} has reported an absence for you on {{3}} ({{4}}). Approve or deny: {{5}}." It needs Meta approval (minutes to a day). Until it is approved, email goes out and WhatsApp is held (same "enabled:false" pattern the template registry already uses).
4. After approval: the absence's owner is B; A's record keeps `submittedBy` for audit only. Manage-my-absences and edit APIs authorise B only.
5. SMC sees "Reported by A, approved by B" in Received reports. Pending requests are visible to SMC but do not trigger relief.
6. Expiry: a pending request for today expires at the first period start; future dates expire after 24 hours, with A notified.
7. Same behaviour on Google and D1; add to the post-activation smoke test.

## Design rules (Claude, proposed)
1. Record both identities on every report: `submittedBy` (signed-in teacher) and `staffId` (absent teacher). Show "Reported by X on behalf of Y" to SMC in Received reports and Manage school-wide absences.
2. Notify the absent teacher (existing WhatsApp/email channel) that a report was made for them, with a link to view or withdraw.
3. Multiple colleagues: one submission creates one report per colleague (each with its own receipt and withdrawal), sharing a request group ID.
4. Same validation as self-report: dates, periods, relief required, instructions optional (the submitter may not know lesson plans).
5. Audit trail and rate limit (e.g. at most 5 colleagues per submission, 20 per day per submitter) to limit misuse.
6. Absence intake queue, freeze and D1 paths unchanged; add on-behalf to the D1 smoke test.

## Open questions for the owner
1. Should SMC approve on-behalf reports before relief is allocated, or treat them like self-reports?
2. May the absent teacher's own later report override or withdraw an on-behalf report?
3. Which channels notify the absent teacher: WhatsApp, email, or both?

## WhatsApp template submitted (2 Nov 2026, owner approved wording)
- Name `gsis_absence_on_behalf_v1`, en_GB, UTILITY, template id 1110444688418734, Messaging Account Gongshang Primary. Review status at submission: PENDING.
- Body: "*Absence Reported For You* / Hi {{1}}, {{2}} has reported on your behalf that you will be absent on {{3}}: {{4}}. / Please approve or deny using the button below. No relief is arranged until you approve. / Thank you."
- Positional values: {{1}} recipient (absent teacher), {{2}} submitting teacher, {{3}} date, {{4}} periods and absence type.
- Button: URL "Approve or deny" → `https://roster.gsps.edu.sg/external.html#{{1}}` (button {{1}} = private capability token from `externalUrl`, not the full URL). Owner rule: link behind the button, never in the body.
- Register it in the template registry as `absence_on_behalf_request` with `enabled:false` until review is APPROVED.
