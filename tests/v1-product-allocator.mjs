import assert from "node:assert/strict";
import {
  allocate,
  runEngine,
  defaultPolicy,
  validatePolicy,
  deriveDemands,
  validateProposal,
  matches,
} from "../v1/allocator/index.mjs";
const stamp = Date.parse("2026-11-13T00:00:00+08:00");
const person = (staffId, extra = {}) => ({
  staffId,
  active: true,
  eo: true,
  hasBaseline: true,
  employment: "Full-time",
  occupied: [],
  available: Array.from({ length: 17 }, (_, i) => i),
  weekly: { quality: "verified", remaining: 12 },
  subjects: [],
  levels: [],
  ...extra,
});
const demand = (id, period, extra = {}) => ({
  id,
  period,
  subject: "EL",
  lessonId: id,
  level: 1,
  ...extra,
});
const snapshot = (staff, demands, extra = {}) => ({
  schemaVersion: 1,
  schoolId: "s",
  runId: "r",
  date: "2026-11-13",
  observedAt: stamp,
  inputDigest: "synthetic-content",
  revisions: { day: 1, config: 1 },
  staff,
  demands,
  assignments: [],
  ...extra,
});
let count = 0;
function test(name, fn) {
  fn();
  count++;
  console.log("PASS " + name);
}
test("AL01 sequential layers, employment and daily ad hoc precedence", () => {
  const s = snapshot(
    [
      person("adhoc", {
        active: false,
        dateActive: true,
        dailyAdhoc: true,
        hasBaseline: false,
        employment: "FAJT",
        adhocEligible: true,
        available: [1],
      }),
      person("fajt", { employment: "FAJT", available: [2] }),
      person("eo", { available: [3] }),
    ],
    [demand("a", 1), demand("b", 2), demand("c", 3)],
  );
  const p = runEngine(s, defaultPolicy());
  assert.deepEqual(
    p.assignments.map((a) => [a.staffId, a.layer]),
    [
      ["adhoc", 1],
      ["fajt", 2],
      ["eo", 3],
    ],
  );
  assert.equal(p.unresolved.length, 0);
  assert.throws(
    () =>
      validatePolicy({
        ...defaultPolicy(),
        layers: [
          ...defaultPolicy().layers,
          { ...defaultPolicy().layers[0], id: 4 },
        ],
      }),
    /group/,
  );
});
test("AL02 spiral opportunities before second round, existing duties counted once", () => {
  const people = ["a", "b", "c", "d"].map((id) =>
      person(id, { employment: "FAJT" }),
    ),
    s = snapshot(
      people,
      Array.from({ length: 6 }, (_, i) => demand("d" + i, i + 1)),
    );
  const out = runEngine(s, defaultPolicy());
  assert.equal(
    new Set(out.assignments.slice(0, 4).map((a) => a.staffId)).size,
    4,
  );
  assert.deepEqual(
    out.assignments.map((a) => a.round),
    [0, 0, 0, 0, 1, 1],
  );
  const existing = {
    id: "fixed",
    staffId: "a",
    demandId: "fixed-demand",
    period: 10,
    status: "published",
    origin: "manual",
    charge: 1,
  };
  const again = runEngine({ ...s, assignments: [existing] }, defaultPolicy());
  assert.notEqual(again.assignments[0].staffId, "a");
  assert.equal(again.retained[0].id, "fixed");
});
test("AL03 daily occupied count wins when both have three usable places", () => {
  for (const heavier of [5, 7]) {
    const p = defaultPolicy();
    p.layers[2].maxConsecutive = null;
    const s = snapshot(
      [
        person("heavy", {
          occupied: Array.from({ length: heavier }, (_, i) => ({
            period: i + 5,
            subject: "EL",
          })),
        }),
        person("light", {
          occupied: [5, 6, 7, 8].map((period) => ({ period, subject: "EL" })),
        }),
      ],
      [demand("a", 1), demand("b", 2), demand("c", 3)],
    );
    assert.equal(runEngine(s, p).assignments[0].staffId, "light");
  }
});
test("AL04 simultaneous caps and final consecutive stretch", () => {
  const p = defaultPolicy(),
    s = snapshot(
      [
        person("a", {
          occupied: [1, 2, 3, 4, 6].map((period) => ({
            period,
            subject: "EL",
          })),
        }),
      ],
      [
        demand("gap", 5),
        demand("free1", 8),
        demand("free2", 10),
        demand("free3", 12),
        demand("free4", 14),
      ],
    );
  const out = runEngine(s, p);
  assert.equal(out.assignments.length, 3);
  assert(out.unresolved.some((d) => d.demandId === "gap"));
  assert(out.comparisons.some((x) => x.reasons?.includes("consecutive")));
  assert(out.comparisons.some((x) => x.reasons?.includes("daily-total")));
});
test("AL05 BLK breaks run but remains occupied; shared cover and exclusions", () => {
  const p = defaultPolicy(),
    s = snapshot(
      [
        person("a", {
          occupied: [
            { period: 1, subject: "EL" },
            { period: 2, subject: "BLK" },
            { period: 3, subject: "EL" },
            { period: 4, subject: "EL" },
          ],
        }),
      ],
      [demand("blk", 2), demand("after", 5), demand("after2", 6)],
    );
  const out = runEngine(s, p);
  assert(!out.assignments.some((a) => a.period === 2));
  assert.equal(out.assignments.length, 2);
  const lessons = [
    {
      id: "form",
      lessonId: "f",
      subject: "FORM",
      venueId: "v",
      classId: "c",
      period: 1,
      staffIds: ["a", "b"],
    },
    { id: "pd", subject: "PD", period: 2, staffIds: ["a"] },
  ];
  assert.equal(
    deriveDemands(lessons, [{ staffId: "a", periods: [1, 2] }], p).length,
    0,
  );
  assert.equal(
    deriveDemands(
      lessons,
      [
        { staffId: "a", periods: [1, 2] },
        { staffId: "b", periods: [1] },
      ],
      p,
    ).length,
    1,
  );
  assert(matches("MTL-1", ["MTL*"]));
});
test("AL06 partial PAL block follows fixed anchor or remains unresolved", () => {
  const s = snapshot(
    [person("a"), person("b")],
    [
      demand("p2", 2, { subject: "PAL", lessonId: "lesson", classId: "c" }),
      demand("p3", 3, { subject: "PAL", lessonId: "lesson", classId: "c" }),
    ],
    {
      assignments: [
        {
          id: "anchor",
          demandId: "p1",
          staffId: "b",
          period: 1,
          subject: "PAL",
          lessonId: "lesson",
          classId: "c",
          origin: "manual",
          status: "published",
          blockLength: 3,
        },
      ],
    },
  );
  const out = runEngine(s, defaultPolicy());
  assert.deepEqual(
    out.assignments.map((a) => a.staffId),
    ["b", "b"],
  );
  s.staff[1].weekly.remaining = 2;
  assert.equal(runEngine(s, defaultPolicy()).assignments.length, 0);
});
test("AL07 zero and missing quota, inactivity, ad hoc and duplicate identity", () => {
  const s = snapshot(
    [
      person("zero", { weekly: { quality: "verified", remaining: 0 } }),
      person("missing", { weekly: null }),
      person("inactive", { active: false }),
      person("adhoc", {
        active: false,
        dateActive: true,
        dailyAdhoc: true,
        hasBaseline: false,
        adhocEligible: true,
        weekly: null,
      }),
    ],
    [demand("d", 1)],
  );
  const out = runEngine(s, defaultPolicy());
  assert.equal(out.assignments[0].staffId, "adhoc");
  assert.throws(
    () => allocate({ ...s, staff: [s.staff[0], s.staff[0]] }),
    /duplicate/,
  );
  const restricted = snapshot(
    [person("f", { employment: "FAJT" })],
    [demand("d", 13)],
  );
  assert.equal(runEngine(restricted, defaultPolicy()).assignments.length, 0);
});
test("AL08 bounded P2/P3 backfill preserves higher layer count", () => {
  const p = defaultPolicy();
  p.layers[0].maxRelief = 1;
  p.layers[1].maxRelief = 1;
  const s = snapshot(
      [
        person("first", {
          dailyAdhoc: true,
          hasBaseline: false,
          adhocEligible: true,
          available: [2, 3],
        }),
        person("second", { employment: "FAJT", available: [2] }),
      ],
      [demand("p2", 2), demand("p3", 3)],
    ),
    out = runEngine(s, p);
  assert.equal(out.assignments.length, 2);
  assert.equal(out.backfill.length, 1);
  assert(out.assignments.some((a) => a.staffId === "first" && a.period === 3));
  const bounded = allocate(s, p, { maxComparisons: 1 });
  assert.equal(bounded.search.status, "bounded");
  assert.equal(bounded.search.optimalityProven, false);
});
test("AL09 fill blank protects every existing assignment; auto preserves published manual peer started", () => {
  const s = snapshot([person("a"), person("b")], [demand("d", 1)], {
    assignments: [
      {
        id: "old",
        demandId: "d",
        staffId: "b",
        period: 1,
        origin: "automatic",
        status: "draft",
        charge: 1,
      },
    ],
  });
  assert.equal(
    runEngine(s, defaultPolicy(), { mode: "fill-only" }).retained[0].staffId,
    "b",
  );
  assert.equal(runEngine(s, defaultPolicy()).retained.length, 0);
  for (const extra of [
    { status: "published" },
    { origin: "manual" },
    { origin: "peer" },
    { protected: true },
  ]) {
    const row = { ...s.assignments[0], ...extra };
    assert.equal(
      runEngine({ ...s, assignments: [row] }, defaultPolicy()).retained[0].id,
      "old",
    );
  }
});
test("AL10 interchangeable engine validates binding and rejects invalid proposals", () => {
  const s = snapshot([person("a")], [demand("d", 1)]),
    p = defaultPolicy(),
    engine = (s, p, o) => ({
      ...allocate(s, p, o),
      engineVersion: "test-adapter/1",
    });
  const result = runEngine(s, p, {}, engine);
  assert.equal(result.engineVersion, "test-adapter/1");
  assert.throws(
    () => validateProposal(s, p, { ...result, inputDigest: "wrong" }),
    /bound/,
  );
  assert.throws(
    () =>
      validateProposal(s, p, {
        ...result,
        assignments: [...result.assignments, ...result.assignments],
      }),
    /duplicate/,
  );
  const block = snapshot(
      [person("a")],
      [
        demand("p1", 1, { subject: "PAL", lessonId: "pal" }),
        demand("p2", 2, { subject: "PAL", lessonId: "pal" }),
      ],
    ),
    complete = allocate(block, p);
  assert.throws(
    () =>
      validateProposal(block, p, {
        ...complete,
        assignments: complete.assignments.slice(0, 1),
      }),
    /continuous block/,
  );
  assert.throws(
    () =>
      validateProposal(s, p, { ...result, assignments: [], unresolved: [] }),
    /omitted/,
  );
  assert.throws(
    () =>
      validateProposal(s, p, {
        ...result,
        assignments: result.assignments.map((a) => ({ ...a, layer: 99 })),
      }),
    /invalid/,
  );
  const before = JSON.stringify(s);
  allocate(s, p);
  assert.equal(JSON.stringify(s), before);
});
console.log(`${count} allocator acceptance groups passed`);
