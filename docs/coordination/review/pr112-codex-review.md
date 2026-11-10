> Current Codex code-review verdict: **APPROVE** at `1102d2e16dd61981abda853f8940d25265631edf`. The historical P1 below is resolved. Integration remains blocked by a CHANGELOG.md conflict with main `1d89225`; this is not a merge/deployment approval or a review of any future conflict-resolution head. Exact verification follows below.

# PR #112 review

Model: Codex. Date: 10 November 2026, Asia/Singapore.
Exact head: `05fece2219780c3901784cc0ed58006ebf7859c4`.
Verdict: **changes requested**, one P1 privacy finding.

## P1: retained weekdays bypass the absence-reason scrub

Location: `roster-update/public/roster-stapler-export.js:165`–166, newly selected by `roster-update/public/roster-operations-ui.js:1681`.

The new baseline-backed download retains the full Teacher Summary week. `makeWorkbook` copies that whole model through the converter at lines 82–83, but the privacy scrub at line 110 only visits the selected day's plan tiles. A valid baseline can contain `EL (absent — PRIVATE_OTHER_DAY)` on another weekday; that cell is copied into Teacher Summary unchanged even with `hideAbsenceReasons:true`. The new Class POV correctly omits it, and the previous day-only download and Drive file omit it, but the downloadable workbook still discloses the reason through Teacher Summary.

Reproduced using the actual fixture/day/export code and a baseline accepted by `GSISRoster.validate`, with `GSISRosterStapler.validate(plan)` and `canUseBaseline(plan, baseline) === true`. Wednesday is selected; only Monday's baseline cell contains the synthetic annotation. Results:

```json
{"validatedBaseline":true,"selectedDate":"2026-10-14","baselineReasonDay":"Monday","newTeacherSummaryLeaks":true,"newClassPovLeaks":false,"previousDayOnlyPathLeaks":false,"driveLeaks":false}
```

The input data and baseline remain unchanged after rendering. No live input was read. This finding accepts the task's full-week layout decision; it does not ask to change the screenshot layout or Drive renderer. The hidden-reasons option must apply to every cell retained in that workbook, including baseline-only weekdays/rows, rather than just the selected-day overlay.

Requested correction: sanitize the cloned baseline subject cells or all retained Teacher Summary cells when hiding reasons, preserving the original model/plan and the normal reason-visible Stapler screen export. Add a validated-baseline regression with annotations on a non-selected weekday and assert no delivered worksheet contains the sentinel. Keep the selected-day/Class POV privacy tests and default standalone behavior.

## Verification performed by Codex

- Exact-head CI run `42812090570` independently verified successful: all four regression shards and full-suite passed.
- Separate worktree at the reviewed SHA. `TZ=Asia/Singapore npm run build` passed all 18 components and left no diff, including after local tests.
- Eleven local programs passed, all exit 0, with Singapore timezone and Node warnings disabled: `roster-assign-relief-export-day.mjs`, `roster714-export-ui.cjs`, `roster714-teacher-export.cjs`, `roster098j-exports.cjs`, `stapler098h-standalone-export.cjs`, `roster-assign-relief-export-privacy-import.cjs`, `roster098g-export-headers.cjs`, `roster-daily-workbook.cjs`, `roster-daily-workbook-writer.cjs`, `roster-daily-audit.cjs`, `roster099a-excel-relief-for.cjs`. Both changed test programs were included.
- Additional synthetic retained-weekday probe failed at the privacy assertion above. Existing green tests do not exercise an annotated baseline cell outside the selected day.
- Reviewed the actual three-dot PR diff, six scoped files. Main-only coordination files are preserved by merging the branch; a two-dot comparison's apparent deletions are not part of this PR's change. Merge-tree against main `795f9f0` is clean.
- Did not rerun the entire local Node/LORD suite during review; full-suite evidence is exact-head CI. The implementer's recorded local run also discloses three missing-artifact failures and isolated reruns, rather than a single fresh all-green full run. No claim is made here that Codex ran that full suite.
- No implementation edits, live data/settings, provider calls, merge or deployment. The owner/coordinator should retain this head's findings and request re-review at the corrected head.

## Reproducer

Run this script from a worktree at the reviewed head with dependencies available. Fixtures and absence reason are synthetic.

```javascript
const assert=require('node:assert/strict'),fs=require('node:fs');
const req=require('node:module').createRequire(process.cwd()+'/tests/review-probe.cjs');
const {JSDOM}=req('jsdom'),JSZip=req('jszip'),S=req('../shared/roster-stapler.js'),R=req('../shared/roster.js'),fixture=req('./roster701-fixture.cjs');
(async()=>{
 const f=fixture(),day=f.ctx.days[f.date],plan=S.create({...day,date:f.date});
 const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};
 // Export is Wednesday. Only Monday's baseline contains the synthetic reason.
 const model={layoutMode:'odd-even',odd:structuredClone(week),even:structuredClone(week),maxPeriod:16,teacherCount:day.teachers.length,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[]};
 for(const parity of ['odd','even'])model[parity].blocks[0].cells[1]=['EL (absent — PRIVATE_OTHER_DAY)','4A','Synthetic room',''];
 const baseline={modelId:plan.baselineId,model:R.validate(model)};
 S.validate(plan);
 const data={date:f.date,revision:1,allocationRevision:0,exportedAt:f.date+'T01:00:00Z',periods:plan.periods,teacherSummary:{plan,absences:[],assignments:[],demands:[],addedTeachers:[],staplerStatus:'baseline'}};
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;w.JSZip=JSZip;w.Blob=Blob;
 try{
  for(const name of ['converter.js','roster-stapler-model.js','roster-export.js','roster-stapler-export.js','excel-export.js'])w.eval(fs.readFileSync('roster-update/public/'+name,'utf8'));
  w.fetch=()=>assert.fail('No live reads permitted');
  assert.equal(w.RosterStaplerExport.canUseBaseline(plan,baseline),true);
  const before=JSON.stringify({data,baseline});
  const full=await w.RosterStaplerExport.makeReliefWorkbook(data,baseline,{hideAbsenceReasons:true,includeClassPov:true});
  const previous=await w.RosterStaplerExport.makeReliefWorkbook(data,null,{hideAbsenceReasons:true});
  const drive=w.RosterExport.dailyTeacherWorkbook(data);
  const xml=async(book,path='xl/worksheets/sheet1.xml')=>(await JSZip.loadAsync(await book.blob.arrayBuffer())).file(path).async('string');
  const teacher=await xml(full),classes=await xml(full,'xl/worksheets/sheet2.xml');
  console.log(JSON.stringify({validatedBaseline:true,selectedDate:f.date,baselineReasonDay:'Monday',newTeacherSummaryLeaks:teacher.includes('PRIVATE_OTHER_DAY'),newClassPovLeaks:classes.includes('PRIVATE_OTHER_DAY'),previousDayOnlyPathLeaks:(await xml(previous)).includes('PRIVATE_OTHER_DAY'),driveLeaks:(await xml(drive)).includes('PRIVATE_OTHER_DAY')}));
  assert.equal(JSON.stringify({data,baseline}),before);
  assert.equal(teacher.includes('PRIVATE_OTHER_DAY'),false,'hideAbsenceReasons must scrub retained baseline weekdays too');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
```

---

## Codex re-review of the retained-weekday privacy fix

Model: Codex. Reviewed 10 November 2026, Asia/Singapore.
Exact head: `1102d2e16dd61981abda853f8940d25265631edf`.
Code verdict: **APPROVE**, prior P1 resolved, no additional blocking code finding identified in the reviewed delta. **Integration hold:** CHANGELOG.md conflicts with current main; resolve and verify the resulting head before merging.

### Source and behavior

The fix scrubs subject cells across all retained `single`, `odd` and `even` week blocks of the prepared cloned model before the converter generates Teacher Summary. The selected-day writer uses the same `scrubSubject` transformation. Hiding applies only when requested; neither the original model nor saved plan is changed. The default reason-visible Stapler export keeps its previous behavior. The delta from the last reviewed head contains this bounded correction, a new regression, CHANGELOG and task evidence only.

### Tests actually performed

- Original Codex reproducer, run unmodified against this head: validated baseline, Wednesday selected, private reason only on Monday. Teacher Summary, Class POV, previous day-only path and Drive all report `leaks=false`. Input immutability assertion passes.
- All twelve targeted programs passed locally, exit 0, with `TZ=Asia/Singapore NODE_NO_WARNINGS=1`: `roster-assign-relief-export-privacy-weekday.cjs`, `roster-assign-relief-export-day.mjs`, `roster714-export-ui.cjs`, `roster714-teacher-export.cjs`, `roster098j-exports.cjs`, `stapler098h-standalone-export.cjs`, `roster-assign-relief-export-privacy-import.cjs`, `roster098g-export-headers.cjs`, `roster-daily-workbook.cjs`, `roster-daily-workbook-writer.cjs`, `roster-daily-audit.cjs`, `roster099a-excel-relief-for.cjs`. All changed/new test programs are covered.
- Independently ran the new weekday regression unchanged with the old `05fece2` exporter substituted in memory. It exits 1 at the intended assertion, "Teacher Summary must not leak a non-selected weekday reason". No test source or product file was edited for this control.
- `TZ=Asia/Singapore npm run build`: all 18 components passed; no tracked diff before or after tests.
- Independently verified CI run `42919423312`: completed successfully at the exact full SHA, all four regression shards and `full-suite` green. The PR body's earlier pending wording was stale when checked; this review relies on the actual complete run.

### Integration and handoff

Main has advanced to `1d89225`, including the owner-merged #111 drain fix. Read-only `git merge-tree --write-tree --name-only origin/main HEAD` reports a single conflict, `CHANGELOG.md`, and no product-source or generated-file conflicts. GitHub also reports the PR unmergeable. Keep both the #111 and #112 changelog entries when resolving. The reviewer has not edited the implementation branch, merged it, or claimed approval at a not-yet-existing resolution head. Recheck build/CI and the exact source diff after conflict resolution, then record the new reviewed head.

Codex did not rerun all 1,044 Node programs or all 40 LORD programs locally during this re-review. Full-suite evidence is independently verified exact-head CI; the implementer's local full-suite result is recorded in the PR. No live export, school data, settings, provider calls, merge or deployment were touched. Advisory code approval is distinct from owner release/merge approval.
