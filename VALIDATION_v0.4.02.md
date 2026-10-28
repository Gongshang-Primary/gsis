# GSiS v0.4.02 validation

**84/84 automated regression scripts passed**, followed by targeted checks after the final compatibility-response and recovery refinements. Build/package syntax checks and Chromium visual/interaction checks passed. These are local tests; no production account, spreadsheet or Cloudflare deployment was changed.

## Evidence

| Check | Result |
| --- | --- |
| Apps Script | Combined generated scripts parse under the ES2020 gate. |
| Existing suite | Permissions, current publication rules, independent versions, class/TG allocation, load validation, recovery, Contacts, gateway/session handling and existing model geometry retained. |
| Concurrent edits | Twenty simulated independent editors retain their changes; duplicate request suppression, conflict reporting and all-or-none validation covered. |
| Stable field writes | Ordinary edit writes only dirty business/dependent fields and necessary audit/index/receipt metadata. Audit-history values are excluded from the edit read path. |
| Interrupted Deploy commit | Injected exception after journal creation; next receipt lookup resumes pending cells and confirms original request; retry does not duplicate audit/business effects. |
| Contacts | Stable catalogue rows survive reorder; one changed catalogue field writes one physical cell; interrupted catalogue publication recovers. Interrupted new-teacher approval resumes the reserved Staff ID instead of adding another row. |
| Incremental reads | Multi-revision Deploy deltas reproduce the changed values; unauthorized private fields are excluded and authority changes request resync. Public campus delta/full/unchanged/expired-cursor paths covered. |
| Browser | PLT/Events column counts, Fortnight Split controls and two header rows, Notes/Versions navigation and Duty Cards rendered without page errors. A changed load cell preserves an unrelated cell and its scroll owner. A distant Events selection closes, focuses the visible summary and preserves independent pane scrolling. |
| Contacts filters | Same-assignment Level/Subject match, OR within/AND across, separate FT, leadership membership and unavailable-data behaviour covered. |
| PDF | Default Duty roster: one A4 landscape page, 841.92 × 594.96 pt. Long-description/custom-duty fixture: two pages; both terminal text markers remain in extracted PDF text. Pages visually inspected. |
| Model | Updated Block J meshes inspected through CPU projection of the shipped scene. Existing scene tests retained. Door and stair dimensions are approximate. |
| Migration | Field round-trip validation, explicit migration, current-state legacy rollback and remigration tested, preserving values. |
| Packaging | Three frontend archives match their source files; combined backends and documentation match the release archive. |

## Instrumented history fixture

`node scripts/measure402.cjs` uses a seeded version with **2,500 audit entries** and two synthetic teacher records. It counts mocked physical Sheet range accesses; it does not measure Google service latency. The latest raw report is `verification/field-metrics.json`.

| Operation | Measured result |
| --- | --- |
| Single load edit | 8,128 cells read, excluding historical audit leaf addresses/values; 73 cells written across business/dependent fields, edit index, journal and commit metadata. |
| Field-store portion | 46 cells written, including appended audit/receipt fields and their address cells. Unchanged historical entries are not rewritten. |
| Save acknowledgement | 164 bytes. |
| Delta since baseline | 1,995 bytes, 14 changed fields; 5 cells read by the fixture. |
| No-change delta | 98 bytes; 2 index-cell reads. |
| Local fixture execution | Approximately 20 ms for the measured save; **not a live performance claim**. |

Current business-field indexes and dependency checks still contribute to write reads. Journal retention grows with commits. Deploy deltas support 32 revisions; campus deltas support the immediately previous publication. Older cursors explicitly resynchronize.

## Reproduce

```sh
npm install
python3 scripts/build-release.py
npm test
node scripts/measure402.cjs
```

`node scripts/verify402.cjs` additionally uses Playwright and a Chromium binary. Its default path `/tmp/chromium` and `CODEX_PRIMARY_RUNTIME_NODE_MODULES` are the verification workspace configuration; adjust those paths for another environment. The script serves local assets through request interception with synthetic records and does not contact a school backend.

The source package contains screenshots, default/overflow PDFs, model proof, regression log and measurement JSON. Older scene screenshots are retained as historical evidence; `402-*`, `Duty-402*` and `ish-front.png` are the current release checks.

## Not verified locally

Live Apps Script execution time, quotas, script deployment identities, Google sign-in, Cloudflare secrets/bindings and the actual production migration. Follow the controlled migration and smoke checks in DEPLOYMENT.md. Browser printing in engines other than the tested Chromium may paginate differently.
