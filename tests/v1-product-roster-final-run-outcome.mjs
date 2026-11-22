/** W2 (owner 21 Nov 2026): after the 06:29 final scheduled run, the duty SMC gets
 * relief_manual_review when periods remain uncovered and relief_final when none
 * do. Incomplete runs keep the shared smc_attention path. Synthetic fixture only.
 */
import assert from "node:assert/strict";
import fixture from "./roster701-fixture.cjs";
import { queueFinalRunOutcome } from "../v1/services/roster/final-run-notifications.mjs";

function setup() {
  const date = "2030-03-18", tick = Date.parse(date + "T06:29:00+08:00");
  const f = fixture(), previous = f.date;
  f.ctx.days[date] = f.ctx.days[previous];
  if (previous !== date) delete f.ctx.days[previous];
  Object.assign(f.ctx, { today: date, now: tick, iso: new Date(tick).toISOString(), minute: 389 });
  f.state.accountingYears["2030"] = { verified: true };
  // Duty SMC for the date: a verified SMC (dora) from a current Contacts source.
  f.state.smcDutyRoster = [{ date, staffIds: ["dora"] }];
  f.ctx.dutySources = { [date]: { available: true, staffIds: ["dora"] } };
  f.ctx.smcIds = ["alice", "dora"];
  f.O.apply(f.state, f.ctx, { operation: "saveAbsence", date, staffId: "alice", periods: [2], typeId: "mc" });
  return { f, date, tick };
}
const jobs = (s, kind) => s.outbox.filter(j => j.data?.templateKey === kind);

// 1. Final run complete with an uncovered period -> relief_manual_review to duty SMC.
{
  const { f, date, tick } = setup();
  f.state.optimisationRuns.push({ date, key: date + "T06:29", status: "complete" });
  assert.equal(queueFinalRunOutcome(f.state, f.ctx, tick), "relief_manual_review");
  const sent = jobs(f.state, "relief_manual_review");
  assert.ok(sent.length >= 1, "duty SMC is told");
  assert.match(sent[0].data.uncovered_periods_summary, /^1 period remain uncovered: P2 /);
  assert.equal(sent[0].data.audience, "duty-smc");
  assert.equal(jobs(f.state, "relief_final").length, 0);
  // Replayed 06:29 tick or the 06:30 tick does not resend.
  assert.equal(queueFinalRunOutcome(f.state, f.ctx, tick + 60000), null);
  assert.equal(jobs(f.state, "relief_manual_review").length, sent.length);
}
// 2. Final run complete with everything covered -> relief_final.
{
  const { f, date, tick } = setup();
  const demand = f.O.demand(f.ctx, f.state, date)[0];
  f.O.apply(f.state, f.ctx, { operation: "assign", date, demandIds: [demand.id], staffId: "bob" });
  f.state.optimisationRuns.push({ date, key: date + "T06:29", status: "complete" });
  assert.equal(queueFinalRunOutcome(f.state, f.ctx, tick), "relief_final");
  const sent = jobs(f.state, "relief_final");
  assert.ok(sent.length >= 1);
  assert.equal(sent[0].data.allocation_summary, "1 absent teacher. 1 periods have planned cover; 0 uncovered.");
  assert.ok(sent[0].data.relief_health_summary);
}
// 3. Run not complete -> nothing here (shared smc_attention handles it).
{
  const { f, tick } = setup();
  assert.equal(queueFinalRunOutcome(f.state, f.ctx, tick), null);
  assert.equal(jobs(f.state, "relief_manual_review").length + jobs(f.state, "relief_final").length, 0);
}
// 4. Outside 06:29-06:30 -> nothing.
{
  const { f, date, tick } = setup();
  f.state.optimisationRuns.push({ date, key: date + "T06:29", status: "complete" });
  assert.equal(queueFinalRunOutcome(f.state, f.ctx, tick + 5 * 60000), null);
}
console.log("PASS final-run outcome: gaps -> relief_manual_review, covered -> relief_final, incomplete/off-slot/replay -> none");
