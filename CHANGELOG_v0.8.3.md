# GSiS v0.8.3

Full suite release based on v0.8.2 and the committed v0.8.2a Contacts patch. This package includes all five frontends, all three complete Apps Script backends, the separate notification Worker, source, deployment instructions and verification evidence.

## Contacts: portable contact file

Item 083 is included throughout the full suite. The **add** column immediately before **TTb Name** contains an unboxed text **+**. Invisible horizontal padding widens the touch target without increasing normal text row height. Export is on demand for the selected authorised loaded row.

| Contact field | Source |
| --- | --- |
| Prefix | GSPS |
| First Name | Entire TTb Name |
| Last Name | Entire Statutory Name |

Available mobile and work email fields are included. Internal extensions remain labelled notes. Complete source names are preserved without surname extraction or Basic Name substitution. The vCard 3.0 serializer handles reserved characters, CRLF and UTF-8 line folding.

The action requires no extra directory request, People API, Contacts permission or personal address-book token. Existing school sign-in and directory permissions remain. A fallback is available if the initial file handoff does not work. Saving the generated file in a contact app is a separate user action; GSiS cannot confirm the native save, synchronise it or prevent duplicates from repeated imports.

## Full package and retained suite functions

Extract the outer deployment ZIP and upload each enclosed frontend ZIP to its matching existing Pages project. The outer suite package and source archive are not Pages uploads. The v0.8.3 manuals and setup instructions describe the contact-file flow and remove the former People API prerequisite for this action. Existing school OAuth settings must be retained.

The full v0.8.2 features remain included: local planning and **Save to online**, **Let teachers see**, **Send WhatsApp**, protected manual allocation, conflict comparison and receipt recovery, local Excel exports, reusable seven-day private timetable links, Daily Notify acknowledgement statistics, absence-aware recipients, daily allocation audit export, teacher view-only timetable access, daily employment email settings and private Inbox images.

## Item 084: Contacts incident and full package

A read-only check of the installed Contacts site found the v0.8.2 sign-in shell and references to `google-contacts.js`; it did not reference `contact-vcard.js`. This establishes that the checked page was still serving the earlier assets. It does not establish the exact cause of the user's failed attempt or prove which assets that user's browser held.

Separately, a controlled mixed-version fixture reproduced an uncaught failure when newer Contacts JavaScript expected a status element absent from older HTML. The release creates the missing status region safely. If `contact-vcard.js` is unavailable, it displays an explanation telling the user to **Reload Contacts and try again**, rather than failing with an undefined-module error. The login screen and workspace header display v0.8.3 so the installed release can be checked visibly. These are separate findings; neither is a claim of a successful live v0.8.3 installation.

After installing the full package's inner Contacts frontend ZIP, refresh Contacts and verify the visible version is v0.8.3 before testing **+**. See `VALIDATION.md` and `RELEASE_SUMMARY.json` for completed checks and limitations. Native Android/iPhone contact import requires a device check beyond file generation.

## Item 085: teacher access to confirmed suspensions

Active, mapped, eligible teaching staff can view confirmed suspension plans for today and future dates. They do not need sponsorship or a lesson in the selected plan. The **Confirmed suspensions** table appears first with Date and Plan columns. The Plan cell contains its name, Confirmed revision and action, keeping the action visible on a narrow screen. **View confirmed timetable** opens the frozen confirmed revision; a later unconfirmed draft remains private. Authorised delegates retain **Open planner** and their existing editing rights.

**Request planning access** is collapsed by default, and remains expanded when the teacher has an existing planning date or pending request. The helper explains: “Today and upcoming confirmed plans are available to view. To view the published daily timetable, choose Timetable from the main screen.” Past and unconfirmed plans are not added to the ordinary teacher's confirmed list; existing planning permissions remain separate.

The read-only projection neutralises imported absence reasons in the current, baseline and provenance copies. Stored SMC evidence is unchanged. Browsing the list or confirmed timetable does not save, confirm, publish or send a notice. See `VALIDATION.md` and `RELEASE_SUMMARY.json` for the actual privacy and access checks.

## Item 086: separate class-field apply arrows

Stapler Class view has inline **Subject**, **Venue** and **Group** fields, each with its own **→** apply arrow, replacing the Edit tiles dialog. An arrow changes only its field on all current lesson tiles linked to that class, including Card Pit tiles. A shared multi-class tile is updated once; baseline comparison tiles and recess are unchanged.

Blank input makes no change and asks for a value. Invalid text leaves the whole plan unchanged. Other unapplied field values survive the redraw, and each successful apply creates one Undo step. Changes remain local until **Save to online**. Ordinary teachers' confirmed read-only views have no editing controls. This UI change adds no API, backend or model contract.

## Item 087: own arrangements beside relief instructions

**Own arrangements** sits directly beside **No relief instructions** in the editable absence preview and saved instruction header. It is available with or without written instructions. For a new absence or changed instructions, it saves through the existing recoverable flow before opening the colleague chooser. A clean saved record opens the chooser directly. Typed text and the No relief instructions choice are preserved; blank text does not silently select that choice or remove relief demand.

A failed or uncertain save does not open the chooser. A confirmed recovery can resume it while the same report/date remains open; a definite failure retains editable values for retry. Cancelling the chooser leaves the saved absence and instructions intact. A colleague request is created only through explicit **Submit requests**. Opening the chooser does not mark No Relief or submit a request.

Production installation, timetable publication, staff messaging and personal contact creation are not performed by packaging. The two-button WhatsApp template still requires its exact current approval and deliberate activation; this release does not infer approval from earlier checks.
