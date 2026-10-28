# v0.8.3 validation

Baseline: full v0.8.2 commit `4cd0fbe5f33175ac2be5c28b33e2c55d9a8a05b6`, with Contacts patch v0.8.2a `b5481c4e1882bb232e6c460fd690f4cb52aeeb46` integrated. This is a complete suite package. The earlier full validation is preserved in VALIDATION_v0.8.2.md; Contacts patch evidence is preserved in VALIDATION_v0.8.2a.md.

## Investigation

On 21 October 2026 a read-only browser inspection received the live v0.8.2 Contacts sign-in page and old google-contacts.js references. The actual v0.8.2a frontend ZIP contains all referenced files and matches its committed source. Both fresh and restored synthetic sessions loaded that extracted ZIP over real local HTTP and downloaded a valid VCF offline. The user's precise installed failure has not been established.

A controlled mixed old-HTML/new-JavaScript regression did reproduce a silent plus-button failure when the status region and VCF helper were missing. The regression failed before the fix and passed afterward. The current app creates the missing status region and gives actionable reload guidance if the helper is unavailable. Contacts now displays its version before and after sign-in.

## Behaviour checked

Contacts exports the selected loaded contact only, with Prefix GSPS, entire TTb Name as First Name and entire Statutory Name as Last Name. Tests cover vCard escaping, Unicode folding, phone normalization, safe filenames, omitted fields, privacy boundaries, preview/auth guards, URL cleanup, compact controls, keyboard operation and actual offline browser downloads. The real-HTTP test uses packaged static files and actual worker configuration/assets paths. School identity and backend responses are fixtures; it does not validate production Google authentication.

Teachers see confirmed suspensions for today and upcoming dates, including plans that do not contain their own name. Tests cover the frozen confirmed snapshot, private newer drafts, no editing authority, current-day backend reads and a narrow-screen list whose View action stays visible. An imported absence-reason disclosure was reproduced and fixed in the read-only projection across current/baseline tiles and source copies; the original stored SMC evidence remains intact.

Class view provides separate Subject, Venue and Group fields and apply arrows. Tests cover one-field changes across current class lesson tiles including Card Pit, unchanged other fields/recess/baseline, retained typed values, one Undo, keyboard operation and no online write before Save to online. Teacher confirmed views do not expose these controls.

Own arrangements appears beside No relief instructions for editable preview and saved entries. New absences and edited instructions are saved through the existing recoverable write before the colleague chooser opens. Blank or typed text, the No relief instructions choice and cover requirements are retained. Opening alone creates no peer request. The final affected gate covers ordinary-teacher access, saved IDs, uncertain-save recovery, duplicate clicks, selected dates, stale navigation, mobile layout, keyboard activation and focus restoration.

## Release gates

All 494 current scripts passed in `npm run test:release -- --skip-package` with Chromium 153.0.8010.0 after items 084–086 were finalised. Results are `verification/83-node-results.json`, `83-node-summary.json` and `083-full-gate.log`. Seven historical exclusions and helper exclusions are unchanged. Item 087 was requested after this run. A fresh final affected gate passed all 16 checks: 15 absence/instruction/mutual/recovery tests and the real-browser UI review. Its exact test list and output are in `083-post-gate-summary.json`, `083-post-gate-results.json` and `083-post-gate.log`. The 494-script run is not claimed to cover the later item 087 changes.

The actual extracted Contacts ZIP passed the real-HTTP browser check, including fresh/restored synthetic sign-in, module MIME/nosniff behavior and actual offline VCF download. All 48 Contacts files match source and the nested Contacts ZIP in the full package. Evidence: `083-contacts-final-artifact.log`. Apps Script syntax passed for 75 files. The assembled release passed `node tests/package.cjs`: exact archive membership, ZIP integrity, source parity and SHA256 checks for all five frontends, three complete backends, the Worker, retained 62 assets and the manual's 36 embedded figures. The gate is repeated on the final committed archive containing the repository bundle. Its evidence is recorded in `083-precommit-package.log` and the final `083-package.log`.

## Review

The five coding skills are Ponytail, Pstack, Thermonuclear, Vercel and Superpowers. Independent correctness, quality and UI review findings are recorded in the verification archive. The imported absence privacy issue and narrow-screen confirmed-action clipping were fixed and independently reverified. An old temporary backend file found inside the source tree was moved outside the repository before packaging. No material finding remains open in the inspected scope. The five UI skills informed the compact controls and mobile review; broad legacy heuristic audit findings were not represented as a clean whole-repository audit.

## Browser runtime investigation

The first full run, before the last class/UI additions, passed 490 of 492 scripts under a restored Chromium 138 runtime. The two Inbox failures were reproduced serially. A plain HTML textarea with no GSiS code reproduced the same inability to enter text after delayed re-enabling; the input and beforeinput events did not fire. The identical standalone case and both original Inbox tests passed unchanged on Chromium 153.0.8010.0. No Inbox source change or test-assertion weakening was made. The original failed run and the comparative diagnostic remain in the verification archive. The final full gate uses Chromium 153.

## Installation limits

No production deployment, contact write, staff message or school-data mutation was performed for this build. Native Android/iOS import is not verified; local browser download success does not establish successful device contact import. The live site's old version observation is separate from the controlled mixed-asset reproduction. Installed school save/readback, provider delivery, inbox media and audit folder access retain the previous release's operational checks. WhatsApp template approval is not rechecked or activated in this release.
