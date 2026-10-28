# Merge v0.8.2a into the next full GSiS suite

Base commit: 4cd0fbe5f33175ac2be5c28b33e2c55d9a8a05b6, full v0.8.2. Implemented changelog item: 083.

## Runtime changes

Merge contacts-update/public/contact-vcard.js, app.js, styles.css and index.html. Delete contacts-update/public/google-contacts.js and remove all callers of that integration. Preserve the existing Google sign-in loader: only the separate Google Contacts authorisation path is removed. The Contacts gateway change is its version label alone.

Keep the exact name mapping: GSPS prefix, full TTb Name in the first-name component, full Statutory Name in the last-name component. Do not infer surnames or substitute Basic Name. Generate one VCF only after the explicit plus click, using loaded authorised data. Keep proper escaping, CRLF delimiters, Unicode-safe folding, phone formatting and missing-value handling.

Preserve compact row height, lowercase add heading and the keyboard-operable plain + with horizontal hit padding. Keep temporary download URLs short-lived after replacement and clear them on sign-out/auth expiry/page exit. Show file readiness rather than claiming an address-book write.

## Documentation and tests

Retain the new contacts083 serializer and browser regressions. The old contacts082 Google API tests are intentionally superseded because that integration is removed. Keep contacts410 transport coverage with its updated function boundary. Update DESIGN.md, UX-CONTRACT.md and docs/GOOGLE_CONTACTS_SETUP.md with the new local export flow.

The existing component builder and verifier now accept contactsFrontend as well as rosterFrontend. This patch declares only contactsFrontend. The optional source patch captures the changes from the exact baseline; a later full release must restore full-suite build scripts, component versions and release metadata instead of shipping this component-only configuration.

## Wider queue

Items 061–082 remain in the v0.8.2 baseline. This patch does not add a scheduled initial morning teacher notification batch, activate the pending WhatsApp button template, convert the other private-link templates, correct missing live recipient numbers or resolve installation checks. Those statuses remain in GSiS_Queued_Changelog.md and the wider post-v0.8.1b changelog.

Contacts OAuth setup for the old plus action is superseded by item 083. The existing school sign-in OAuth configuration remains required. Actual Android and iPhone contact import must be checked on the installed site; browser download tests cannot establish each phone's native import behaviour.
