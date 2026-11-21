import assert from "node:assert/strict";
import Workload from "../shared/workload.js";
import Rules from "../shared/teaching-rules.js";
import { planningView, workloadAliasView } from "../v1/web/shared/deploy-loads.mjs";
import { calculate } from "../v1/services/deploy/model.mjs";

const baseContacts = {
  schoolId: "synthetic-school",
  revision: "rev-1",
  asOf: Date.now(),
  staff: [
    {
      staffId: "t-sci",
      name: "Tan Science",
      active: true,
      email: "tan.sci@example.invalid",
      role: "Teacher",
      fieldRevisions: { Active: 1, Role: 1 },
    },
  ],
};

function makeDoc(loads6, assignmentSubject = "Sci") {
  return {
    id: "v-sci-alias",
    name: "Synthetic Sci Alias 2026",
    from: "2026-01-01",
    to: "2026-12-31",
    revision: 1,
    loads: { "6": loads6 },
    classes: [{ ref: "c-6a", level: "6", name: "6A", shortName: "6A" }],
    groups: [],
    teachers: [
      {
        id: "t-sci",
        name: "Tan Science",
        active: true,
        activeKnown: true,
        profile: { "Basic Name": "Tan Science", Active: "Y", Role: "Teacher" },
      },
    ],
    assignments: [
      {
        id: "a-1",
        teacher: "t-sci",
        target: "6A",
        targetRef: "c-6a",
        subject: assignmentSubject,
      },
    ],
    workload: { categories: { Science: "Teaching", Sci: "Teaching" } },
    offload: {},
  };
}

// 1. Saved Sci assignment + numeric Science load resolves cleanly (no missing-load warning, no double-count).
{
  const doc = makeDoc({ Science: 6 }, "Sci");
  const view = workloadAliasView(planningView(doc));
  const w = Workload.analyse(view, (t) => Rules.calculate(t, view.offload));
  const row = w.rows.find((r) => r.teacher.id === "t-sci");
  assert.ok(row, "teacher row exists");
  assert.equal(row.incomplete, false, "Sci assignment with Science load must be complete");
  assert.equal(row.Teaching, 6, "exact 6 periods counted");
  assert.deepEqual(row.issues, [], "zero missing-load warnings");

  const calc = calculate(doc, baseContacts);
  const calcRow = calc.rows.find((r) => r.staffId === "t-sci");
  assert.equal(calcRow.teaching, 6, "Worker calculate() resolves Sci -> Science load");
  assert.equal(calcRow.rawTimetabledOccupancy, 6);
}

// 2. Exact key match (Sci assignment + Sci load) resolves cleanly.
{
  const doc = makeDoc({ Sci: 5 }, "Sci");
  const view = workloadAliasView(planningView(doc));
  const w = Workload.analyse(view, (t) => Rules.calculate(t, view.offload));
  const row = w.rows.find((r) => r.teacher.id === "t-sci");
  assert.equal(row.incomplete, false, "exact Sci key must be complete");
  assert.equal(row.Teaching, 5);
  assert.deepEqual(row.issues, []);
}

// 3. Genuinely missing load (neither Sci nor Science numeric) remains incomplete with Missing/not offered warning.
{
  const doc = makeDoc({ EL: 10 }, "Sci");
  const view = workloadAliasView(planningView(doc));
  const w = Workload.analyse(view, (t) => Rules.calculate(t, view.offload));
  const row = w.rows.find((r) => r.teacher.id === "t-sci");
  assert.equal(row.incomplete, true, "genuinely missing load must stay incomplete");
  assert.ok(
    row.issues.some((i) => /Missing\/not offered load: P6 Sci/i.test(i)),
    `expected missing load issue, got: ${JSON.stringify(row.issues)}`,
  );
}

// 4. Conflicting aliases (Sci: 4 and Science: 6 on same level) must NOT silently guess; stays incomplete.
{
  const doc = makeDoc({ Sci: 4, Science: 6 }, "Sci");
  const view = workloadAliasView(planningView(doc));
  const w = Workload.analyse(view, (t) => Rules.calculate(t, view.offload));
  const row = w.rows.find((r) => r.teacher.id === "t-sci");
  assert.equal(
    row.incomplete,
    true,
    "conflicting Sci/Science aliases must remain incomplete rather than guessing",
  );
  assert.equal(row.Teaching, 0, "conflicting alias must not silently pick 4 or 6");
}

// 5. Saved source document is never mutated.
{
  const doc = makeDoc({ Science: 6 }, "Sci");
  workloadAliasView(planningView(doc));
  assert.equal(doc.assignments[0].subject, "Sci", "raw assignment subject unchanged");
  assert.deepEqual(doc.loads["6"], { Science: 6 }, "raw loads unchanged");
}

console.log(
  "PASS Deploy Workload Sci/Science alias resolution: alias match, exact key, missing load, conflicting aliases refusal, and non-mutating derived view.",
);
