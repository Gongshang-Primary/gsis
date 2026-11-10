# Review: PR #109 — Assign Relief Export Excel and Drive daily file list baseline + ad hoc teachers only

- Reviewer: Codex (relayed by the owner)
- PR: https://github.com/helper-gsps/gsis/pull/109
- Branch: `muse/assign-relief-export-baseline-adhoc`
- Exact head reviewed: `7ee7afe5db48a8e7ae3abfb8c45054743e0406e7`
- Verdict: **CHANGES REQUESTED**
- Date: 2026-11-10

## Verdict

Changes requested. One P1 finding (below). No other findings were relayed. The full review text and reproduction details are saved locally by Codex and were not relayed; this record covers the finding and verification summary the owner passed on.

## Finding

### P1: absence reasons leak into Export Excel

The new renderer hides reasons from the absence overlay but retains reasons already embedded in imported timetable lessons. Codex reproduced `EL (absent — PRIVATE_SYNTHETIC_MEDICAL)` appearing in the download despite `hideAbsenceReasons:true`. The previous renderer and the current Drive export remove it. Required: fix the export path and add regression coverage.

Cause (confirmed by Muse while fixing, not by Codex): the tile loop in `roster-update/public/roster-stapler-export.js` wrote `tile.subject` raw. An imported lesson's subject already carries the reason — `shared/roster-stapler.js` annotates it at import (`'<subject> (absent — <reason>)'`) — and the overlay (`applyReliefSummary`) appends to the existing cell text rather than replacing it, so the reason survived the overlay too. The daily renderer scrubs the tile subject first (`roster-export.js` `dailyTeacherPage`).

## Codex's reported verification at the reviewed head

- Canonical build: passed (Codex's report; not independently re-run by Muse for this review).
- Nine targeted tests: passed (Codex's report; the nine programs were not named in the relayed summary).
- All five CI jobs: green (Codex's report; Muse independently verified CI run 42733163866 green at 7ee7afe on 10 Nov ~09:55 SGT).

## Muse's verification of the finding

- Reproduced the leak locally before fixing: the rewritten test `tests/roster-assign-relief-export-day.mjs`, with Alice's P2 tile subject annotated `EL (absent — PRIVATE_SYNTHETIC_MEDICAL)`, failed on the pre-fix code with the assertion "reason embedded in the imported lesson tile must not leak into the download".
- Fix (branch commit `f70cbe0`, pushed 10 Nov): the tile loop in `roster-stapler-export.js` scrubs `values[0]` with the same two replaces the daily renderer uses when `hideAbsenceReasons` is set, so the download matches the Drive file. The standalone Stapler export still shows reasons (the scrub is conditional). Regression coverage is in the rewritten test, which asserts neither file contains the sentinel reason.
- After the fix: the rewritten test passes; nine targeted tests pass (rewritten test, stapler098h standalone, 714-teacher-export, 714-export-ui, 098j-exports, daily-workbook, daily-workbook-writer, daily-audit, 099a-excel-relief-for); canonical build passes with no diff. Full local suite and CI at the new head are the gate; the PR body is updated once CI is green.

## What this review does not cover

- No formal approval was given. The PR must be re-reviewed at its new head after the fix, or the owner must decide the fix plus CI is enough.
- Nothing is merged or deployed by this review.

---

## Direct Codex record and reproducible evidence

### Original review text

Model: Codex. Reviewed 10 November 2026, Asia/Singapore.

Verdict: **changes requested** at `7ee7afe5db48a8e7ae3abfb8c45054743e0406e7`.

Historical review, recorded to Git after the original local review. PR #109 has since advanced to `4443f9741ac3a4679a74d1c28714006211b79565`. This record does not assert that the finding persists at that newer head or that Codex has reviewed its fix. Re-review is pending.

## P1: the new download exposes absence reasons embedded in imported Stapler lessons

Location: `roster-update/public/roster-stapler-export.js:117`, reached from Assign Relief Export Excel with `hideAbsenceReasons:true`.

The new flag only stops `applyReliefSummary` from appending reasons from `summary.absences`. Before that overlay, `makeWorkbook` copies `tile.subject` verbatim into the sheet at lines 105–109. A valid offline Relief import already contains subjects such as `EL (absent — PRIVATE_SYNTHETIC_MEDICAL)` or `Absent — PRIVATE_SYNTHETIC_MEDICAL`. Those reasons remain in the downloadable workbook even with the flag enabled. The pre-change daily renderer, still used for Drive, explicitly strips these annotations in `roster-export.js:219`. Thus switching the download renderer reintroduces a privacy disclosure that the task and PR explicitly require keeping hidden.

Reproduced using only synthetic data through the real `GSISRosterStapler.importLegacy`, validated with `GSISRosterStapler.validate`, then exported using the real new and previous renderers with the same input:

```text
new-download: privateReasonPresent=true
  EL (absent — PRIVATE_SYNTHETIC_MEDICAL)
previous-renderer-and-drive: privateReasonPresent=false
```

The accepted fixture comes from the existing `stapler714-import.cjs` import shape, with an offline absence and covering teacher. It does not rely on inserting an invalid tile. No live data or provider calls were used. Reproducer retained locally at `verification/pr109-codex-privacy-probe.cjs`; run `TZ=Asia/Singapore NODE_NO_WARNINGS=1 node verification/pr109-codex-privacy-probe.cjs` from this review worktree.

Requested correction: when reasons are hidden, sanitize existing subject annotations as well as the newly applied absence overlay, without mutating the saved plan or its provenance. Add regression coverage for valid imported lesson and standalone absence annotations, and assert both download and Drive outputs omit the private reason. The rewritten test currently covers only reasons in `teacherSummary.absences`; the old test's offline reason case was removed.

## Verification performed by Codex

- Confirmed the PR body names this exact full head.
- GitHub run `42733163866` is complete and successful at this head. All four regression shards and `full-suite` passed, five jobs total.
- Separate detached review worktree at the exact head. `TZ=Asia/Singapore npm run build` passed all 18 components and left no tracked diff.
- Nine local test programs passed, exit 0: `roster-assign-relief-export-day.mjs`, `roster714-export-ui.cjs`, `stapler098h-standalone-export.cjs`, `roster714-teacher-export.cjs`, `roster098j-exports.cjs`, `roster-daily-workbook.cjs`, `roster-daily-workbook-writer.cjs`, `roster-daily-audit.cjs`, `roster099a-excel-relief-for.cjs`. Both changed test programs were included. All ran with Singapore timezone and Node warnings disabled.
- The additional synthetic privacy probe reproduces the finding despite those tests passing.
- Merge-tree against current main `9f9f2a5` succeeded without conflicts. Main's new commit is the #108 review record.
- Reviewed canonical source and generated diff. No implementation fix, merge, deployment, live read/write or settings change was performed.

## Coverage clarification and limits

The PR body says Export Excel button wiring and `localExportSnapshot` were not tested. Existing `roster714-export-ui.cjs` actually clicks `[data-daily-excel]`, checks the generated XLSX while offline, and verifies local unsaved changes and the snapshot label. That path ran and passed in this review. The new narrowed-list assertion is still in the renderer/domain test rather than an extra-person UI fixture.

Codex did not rerun the entire 1,042-program Node suite or all 40 LORD programs locally for this review; those full-suite results were verified through the exact-head CI run. No live compatibility probe or actual deployment was performed. This is an advisory model review, not owner merge approval. Keep the PR unmerged until the privacy finding is fixed and the new head is reviewed.

## Reproducer source

Use a worktree checked out at the reviewed head `7ee7afe5db48a8e7ae3abfb8c45054743e0406e7`, with its dependencies available. Save this script under `verification/` and run it from the repository root. All fixture identities and reasons are synthetic.

```javascript
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=process.cwd(),req=require('node:module').createRequire(root+'/package.json'),S=req('./shared/roster-stapler.js'),{JSDOM}=req('jsdom'),JSZip=req('jszip');
const code=fs.readFileSync(root+'/tests/stapler714-import.cjs','utf8');
const f=vm.runInNewContext(code.slice(code.indexOf('function fixture('),code.indexOf('function store('))+';fixture()', {S});
f.payload.stateType='relief';f.payload.reliefAbsences=[{teacher:'Alice',periods:[1],reason:'PRIVATE_SYNTHETIC_MEDICAL',assignments:{1:'Bob'}}];
const imported=S.importLegacy(f.plan,f.payload,f.options);S.validate(imported);
const data={date:f.day.date,revision:1,allocationRevision:0,exportedAt:f.day.date+'T01:00:00Z',periods:imported.periods,teacherSummary:{plan:imported,addedTeachers:[],absences:[],assignments:[],demands:[],staplerStatus:'confirmed'}};
(async()=>{const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;w.JSZip=JSZip;w.Blob=Blob;
try {for(const path of ['shared/roster-stapler.js','roster-update/public/roster-export.js','roster-update/public/roster-stapler-export.js','roster-update/public/excel-export.js'])w.eval(fs.readFileSync(root+'/'+path,'utf8'));
const download=await w.RosterStaplerExport.makeReliefWorkbook(data,null,{hideAbsenceReasons:true});const drive=w.RosterExport.dailyTeacherWorkbook(data);
for(const [label,book] of [['new-download',download],['previous-renderer-and-drive',drive]]){const zip=await JSZip.loadAsync(await book.blob.arrayBuffer()),xml=await zip.file('xl/worksheets/sheet1.xml').async('string');console.log(label,JSON.stringify({privateReasonPresent:xml.includes('PRIVATE_SYNTHETIC_MEDICAL'),absenceText:(xml.match(/[^<>]*PRIVATE_SYNTHETIC_MEDICAL[^<>]*/g)||[])}));}
}finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1});
```
