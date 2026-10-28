# GSiS v0.8.11a validation

23 October 2026. Baseline: v0.8.11 commit `07a1dd8`.

The regression reproduced the original document lock with the real shared viewport CSS and JavaScript: ASC Export was classified as a single table page and the bottom of its form was clipped. Restoring document flow exposed a second issue: the shared table style contained wheel scrolling at table boundaries. The patch fixes both at their existing policy and styling locations.

## Focused verification

Eleven existing test programs pass: `asc0810-browser`, `asc0810-ui`, `asc0810-demand`, `asc0810-settings`, `asc0810-export`, `release509-ui`, `layout-tg-compact`, `release15-ui`, `release18-summary`, `release708-ui-browser` and `release086-deploy-version-browser`.

The extended ASC Chromium regression loads the actual shared viewport assets and uses 60 mapping rows. At 1400, 800 and 390 pixel widths it verifies document scrolling, continued wheel scrolling after a mapping table reaches its end, access to final form controls and no horizontal page overflow. It also checks ASC to IP Deploy to ASC navigation, details collapse/reopening, the Admin separator, KP access without Audit, local XML export and retained edits after validation failure. Existing UI checks retain the Teacher role restriction.

Existing shared viewport checks cover Workload settings, Classes and TGs, publication review and single table views. JavaScript syntax, generated viewport parity and whitespace checks pass. The normal synchronization gate parses all 118 Apps Script files, although no backend change is included.

Independent Thermonuclear correctness and code quality reviews found no material issue in this patch. The component package verifier checks exact Deploy scope, every shipped source byte, archive hashes, route configuration and vendored assets. Only Deploy frontend advances to v0.8.11a; all other component versions remain v0.8.11.

## Limits

Tests use local fixtures and Chromium. Safari, physical touch devices and the installed school site were not exercised. No live deployment, school data mutation or WhatsApp message was performed. The full suite was not repeated for this frontend patch.
