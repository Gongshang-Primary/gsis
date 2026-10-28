# GSiS v0.7.10

Baseline: v0.7.09. Release date: 18 October 2026. Write protocol remains 500.

## Deploy and Contacts

- Keep the latest unpublished draft as Deploy's default, with current in-force fallback.
- Make every Subject Type editable as Class, TG or both. Preserve existing values and defaults.
- Support explicit Deploy and Contacts workbook properties while retaining existing-install compatibility.
- Guard blank Contacts setup and preserve configured Layout resources on repeated setup.
- Create provisional relief contacts immediately with mandatory mobile, default SRE or custom modifier, and canonical name/mobile duplicate recovery. Known contacts retain their in-force modifier. Stapler and Manage Ad-hoc Relief share this backend contract.

## Roster

- Add Admin-only System Config and restrict Baseline Upload to Admin, including Admin without SMC.
- Match No Relief Required subjects by exact value or a literal wildcard pattern. New absence previews and saves use the same policy. Existing absence records retain captured policy.
- Allow Admin to order four allocation preferences. Annual cumulative R utilisation is first by default, followed by fewer alternative periods, weekly R remaining and rotation. The selected order governs candidate cost, improvements and draft acceptance. Maximum coverage, eligibility, protected assignments and special recess-duty reuse remain mandatory.
- Add a separate scheduled allocation switch, default Off. Reports and reminders retain their independent scheduled processing. Manual Auto-allocate remains fill-only.
- Read SMC duty members from Contacts. Eliminate unnecessary Calendar/timetable/quota work for configuration, saved report, duty and sponsorship record operations.
- Improve baseline preview search, upload/prune feedback and post-save handling. Reuse the saved response and already loaded timetable instead of redundant refreshes.
- Open Stapler at a date/sponsorship list, then the dated workspace. Preserve recoverable errors and stale-response protection.
- Add Daily Employment Update with settings, absent-teacher table and relief-load table. Admin and SMC edit settings; normal teachers view the reports, including absence reasons. Selected CES and school addresses default on. Automatic delivery is once per published workday at the chosen time, immediately when first publication is later. Past-date reports and manual resends use the original captured snapshot.
- Dispatch email through durable individual claims with uncertain-outcome handling. Send through Apps Script MailApp, independently of WhatsApp template activation.

## Package and documentation

- Include all five Pages upload ZIPs, three complete Apps Script backends, standalone notification Worker, source and verification evidence.
- Update the illustrated Deploy manual and add complete existing-install/blank-install setup, capability and maintenance guides.
- Generate Archify HTML for application ownership, backend workflow, workbook schemas and Roster JSON stores.
- Add a separate WhatsApp activation guide and copyable all-route configuration for Roster Pages and the notification Worker. Live Meta observation: 17 Approved routes, four Pending, exact contracts matched. Evening v1 remains selected; v2 is retained on Meta.

No live deployment, flag change, staff message, data reset or Git commit was performed. See VALIDATION.md for evidence and production limits.
