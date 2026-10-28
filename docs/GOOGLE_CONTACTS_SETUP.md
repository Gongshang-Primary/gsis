# Add a directory contact using a contact file

From v0.8.2a, the **add** column immediately before **TTb Name** contains a plain **+**. Press it to generate that person's `.vcf` file from the authorised directory data already loaded in the browser. The action does not request Google Contacts permission, read a personal address book or create a contact through Google People API.

School sign-in remains required to load the directory. After loading, exporting the selected contact needs no further request or network connection. Files are created only on demand, one person at a time.

## Name and contact fields

The vCard 3.0 file uses these exact structured fields, preserving the complete source names:

| Contact field | Source |
| --- | --- |
| Prefix | `GSPS` |
| First name | Entire TTb Name |
| Last name | Entire Statutory Name |
| Other name components | Empty |
| Formatted display name | Prefix, first name, last name in that order |
| Organisation | Gongshang Primary School |
| Mobile | Recorded mobile; eight-digit Singapore numbers receive `+65` |
| Work emails | Available GSPS, iCON and CES email addresses |
| Note, when available | School extension, kept separate from the mobile number |

Missing name components remain empty. Basic Name is never substituted, and no surname is extracted. The contact app may apply its own display and sorting preferences. The file excludes birthday, employment, access roles, staff ID and timetable information. Unsupported or absent phone/email values are omitted; an extension is not represented as a complete dialable phone number.

## Open and save on a phone

The browser may download the file or offer a contact preview. Review it and choose where to save it in the contact app. The page retains **Download contact file** and brief instructions if the first handoff does not work.

- **Android:** in Google Contacts, choose **Organize > Import from file**, select an account if asked, then select the downloaded `.vcf`.
- **iPhone:** if the browser does not offer a usable import, open the `.vcf` as an email or message attachment and use the contact import flow.

The exact prompt varies by browser, contact app and device policy. A generated or downloaded file is not proof that a contact was saved. The file is a copy, not an automatic sync; repeated imports may create duplicates. GSiS cannot observe the destination app's save or duplicate handling.

## Installation and privacy

Install the matching Contacts frontend, including `contact-vcard.js`. No backend, People API enablement, extra OAuth scope, Google Contacts popup, Web Locks support or local-storage receipt is required for this action. Keep the existing school sign-in configuration; do not remove its client ID or authentication settings.

The old Google Contacts creation module is no longer shipped or invoked by the plus control. Previous OAuth grants and previously saved personal contacts are not changed by this frontend update.

Contact files are held as local browser object URLs for the active page. Replacing a file retires the prior URL after a short grace period so its initiated download can finish. Signing out, authentication expiry or leaving the page clears these URLs and the visible fallback. Nothing is uploaded to GSiS or sent to a contact provider.

## Verification scope

Local serializer and browser tests cover exact name fields, escaping, CRLF and UTF-8 line folding, no extra data/API requests, file download, fallback, compact row height, mobile horizontal touch space, keyboard activation and account cleanup. No live device contact is created by those tests. Actual Android and iPhone browser-to-contact-app handoff remains an installed-device check.

Platform instructions: [Google Contacts file import](https://support.google.com/contacts/answer/15147365?co=GENIE.Platform%3DAndroid&hl=en) and [Apple iPhone contact import](https://support.apple.com/en-vn/guide/iphone/iph356499f31/ios).
