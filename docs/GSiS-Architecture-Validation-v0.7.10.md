# Architecture documentation validation — v0.7.10

The architecture documents describe the inspected v0.7.10 source package. They are not a claim that live Google, Cloudflare or Meta configuration has been changed. The source was inspected as an archive snapshot; no Git commit identifier has been invented.

Open [the architecture index](GSiS-Architecture-v0.7.10.html) for the diagrams and supporting manuals. Each diagram is a standalone Archify HTML file. Its source specification is included under `architecture-source/` so a maintainer can update the document alongside later code changes.

## Checks performed

All eight diagrams passed Archify's actual `finalize` pipeline: schema validation, HTML delivery, static checking and Chromium browser checking. No diagnostics remained in the final receipts. The two architecture/workflow documents passed the showcase quality gate. The six dense schema documents passed the standard gate, preserving explicit physical fields and logical JSON structure rather than reducing them to an overview.

| Document | Quality | Validate | Deliver | Check | Browser |
| --- | --- | --- | --- | --- | --- |
| System map | Showcase | Pass | Pass | Pass | Pass |
| Backend workflow | Showcase | Pass | Pass | Pass | Pass |
| Contacts schema | Standard | Pass | Pass | Pass | Pass |
| Deploy schema | Standard | Pass | Pass | Pass | Pass |
| Calendar records schema | Standard | Pass | Pass | Pass | Pass |
| Calendar configuration schema | Standard | Pass | Pass | Pass | Pass |
| Roster baseline schema | Standard | Pass | Pass | Pass | Pass |
| Roster operations schema | Standard | Pass | Pass | Pass | Pass |

The system map and backend workflow also passed automated visual capture checks for containment, readability, viewer controls and light/dark themes at 1440×900 and 2048×1320. Their 1440×900 light captures were then visually inspected: titles, nodes, arrows and labels were legible, without cropped content or obscured relationships. A system-map layout was adjusted to remove avoidable route crossings before final verification. Schema diagrams received the automated browser checks; no separate manual screenshot review is claimed for all six.

The eight final artifact hashes and input hashes are recorded in [architecture-verification.json](architecture-verification.json). Individual `*.finalize-summary.json`, `*.finalize.json`, `*.browser-check.json` and `*.delivery.json` receipts sit beside their HTML files. The two inspected captures and corresponding visual-check receipts are included in `architecture-source/verification/`. Original renderer receipts retain build-machine paths as provenance; use the relative paths in the consolidated verification file to navigate the package.

## Scope of the evidence

Source tracing covered the Contacts directory and journals, Deploy version and field stores, Calendar's source-defined sheet headers, Roster Drive register/model/operations JSON, gateway signing and authentication, cache/revision boundaries, locked writes and receipts, publication restrictions, scheduled allocation, mail dispatch and WhatsApp notification handling. The schema reference distinguishes physical Sheets columns from JSON fields and logical groups. It does not invent SQL tables or database-enforced foreign keys.

The diagrams intentionally summarise runtime branches. Their linked schema reference and setup/maintenance manual supply the detailed fields, file ownership, operation boundaries, setup order and recovery limits. A local saved response does not prove provider delivery; a source-level workflow does not make a Google Sheets write, Drive update and external message one atomic transaction.

These checks establish that the supplied diagrams render and match the documented source structure. They do not test live identity permissions, production data, network latency, concurrent production traffic, Google quotas, approved Meta templates or message delivery. Those acceptance steps remain in the setup and WhatsApp activation guides.
