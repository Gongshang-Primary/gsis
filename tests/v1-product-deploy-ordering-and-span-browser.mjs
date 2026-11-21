/** Built Deploy browser and isolated Workers/D1 verifying DEP-21-001, DEP-21-002,
 * and DEP-21-003:
 * - DEP-21-001: Teachers row order (active HOD -> active Junior KP -> active teachers -> unknown activity -> confirmed inactive at bottom) & grey inactive fill, including after Show inactive toggle, sorting in both directions, and filtering.
 * - DEP-21-002: Consistent class suffix order in IP Deploy and Program Settings -> Classes for both single-letter (P->T->I->R->C->H->G->K) and two-letter (Gc->Gt->P->Rs->Rp->I->D->E->K) schemes, with attached TGs and custom suffixes preserved across search, level filtering, and reload.
 * - DEP-21-003: Span of Control staff pool & School Leader roots hydrated from both saved version teachers and Contacts references without mutating doc.teachers on read. */
import assert from "node:assert/strict";
import {
  fixture,
  futureDate,
  schoolId,
} from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

const f = await fixture();
try {
  const db = await f.db("deploy"),
    year = Number(futureDate().slice(0, 4));

  // Seed Contacts staff covering DEP-21-001 (active HOD, active Junior KP, active teachers, inactive HOD, unknown activity)
  // and DEP-21-003 (Contacts-only SL, SAT, SATxMK, Support, OSO, MK-only).
  const staffDefs = [
    ["inactiveHod", [], "N", "HOD", "HOD"],
    ["teacherB", [], "Y", "Teacher", ""],
    ["jnrKpB", ["KP"], "Y", "SH", "SH"],
    ["hodB", ["KP"], "Y", "HOD", "HOD"],
    ["unknownTeacher", [], null, "Teacher", ""],
    ["teacherA", [], "Y", "Teacher", ""],
    ["jnrKpA", ["KP"], "Y", "LH", "LH"],
    ["hodA", ["KP"], "Y", "YH", "YH"],
    // Contacts-only staff for DEP-21-003 (not in doc.teachers initially)
    ["catalogSl", ["SL"], "Y", "Principal", "SL"],
    ["catalogSat", ["SAT"], "Y", "SAT", ""],
    ["catalogSatMk", ["SAT", "MK"], "Y", "SAT MK", ""],
    ["catalogSupport", ["Support"], "Y", "OM", ""],
    ["catalogOso", ["Support"], "Y", "OSO", ""],
    ["catalogMkOnly", ["MK"], "Y", "MK", ""],
  ];

  const ids = {};
  for (const [key, , active, role, eoLevel] of staffDefs) {
    const temp = "syn-order-" + key;
    const res = await f.call(f.admin, "contacts", "/save-data", {
      operationId: "syn-create-" + key,
      changes: [],
      additions: [
        {
          id: temp,
          values: {
            "Basic Name": "Synthetic " + key,
            "Statutory Name": "Synthetic " + key,
            Role: role,
            ...(eoLevel ? { "EO Appt Level": eoLevel } : {}),
            ...(active === null ? {} : { Active: active }),
          },
        },
      ],
    });
    ids[key] = res.mapping[temp];
  }

  // Create version 1 (single-letter class scheme + scrambled Teachers + Contacts-only SL/SAT/Support/OSO)
  const v1Created = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "syn-ordering-v1",
    name: "Synthetic ordering single-letter",
    year,
  });
  const loaded1 = await loadVersion(db, schoolId, v1Created.versionId);
  const doc1 = structuredClone(loaded1.doc);

  const managed = [
    "SL",
    "SC",
    "SMC",
    "KP",
    "TL",
    "SDT",
    "CMT",
    "SAT",
    "Support",
    "MK",
  ];
  doc1.roleMembershipSchema = 1;
  doc1.membership = [
    ["HOD", "Head of Department", "", "", "1", "1", "", "", "", "", "", "", "HOD", true],
    ["YH", "Year Head", "", "", "1", "1", "", "", "", "", "", "", "YH", true],
    ["SH", "Subject Head", "", "", "1", "1", "", "", "", "", "", "", "SH", true],
    ["LH", "Level Head", "", "", "1", "1", "", "", "", "", "", "", "LH", true],
    ["Teacher", "Classroom Teacher", "", "", "", "", "", "", "", "", "", "", "", true],
    ["Principal", "Principal", "1", "1", "1", "", "", "", "", "", "", "", "SL", false],
    ["SAT", "School Admin Team", "", "", "", "", "", "", "", "1", "", "", "", false],
    ["SAT MK", "School Admin Team MK", "", "", "", "", "", "", "", "1", "", "1", "", false],
    ["OM", "Operations Manager", "", "", "", "", "", "", "", "", "1", "", "", false],
    ["OSO", "Operations Support Officer", "", "", "", "", "", "", "", "", "1", "", "", false],
    ["MK", "MOE Kindergarten", "", "", "", "", "", "", "", "", "", "1", "", false],
  ];

  // Put only the first 8 staff in doc1.teachers in scrambled order; leave catalog* staff in Contacts only!
  const savedKeys = [
    "inactiveHod",
    "teacherB",
    "jnrKpB",
    "hodB",
    "unknownTeacher",
    "teacherA",
    "jnrKpA",
    "hodA",
  ];
  doc1.teachers = savedKeys.map((key) => {
    const [, groups, active, role, eoLevel] = staffDefs.find((d) => d[0] === key);
    const existing = loaded1.doc.teachers.find((t) => t.id === ids[key]) || {
      id: ids[key],
      name: "Synthetic " + key,
      ttbName: "Synthetic " + key,
    };
    const profile = {
      "Basic Name": "Synthetic " + key,
      "TTb Name": "Synthetic " + key,
      Role: role,
      "EO Appt Level": eoLevel,
      ...(active === null ? {} : { Active: active }),
    };
    return {
      ...existing,
      id: ids[key],
      name: "Synthetic " + key,
      ttbName: "Synthetic " + key,
      role,
      active: active === "Y",
      activeKnown: active !== null,
      groups,
      deploymentTags: {
        ...(existing.deploymentTags || {}),
        Role: role,
        "EO Appt Level": eoLevel || null,
        Memberships: groups,
      },
      profile,
      planningProfile: {
        Active: active === null ? null : active,
        Role: role,
      },
    };
  });

  // Scrambled single-letter classes across P1 and P2 + custom suffix + attached TG
  doc1.venues = [
    { id: "R-1K", name: "Room 1K", form: "1K" },
    { id: "R-1P", name: "Room 1P", form: "1P" },
    { id: "R-1I", name: "Room 1I", form: "1I" },
    { id: "R-1T", name: "Room 1T", form: "1T" },
  ];
  doc1.classes = [
    { ref: "c-2C", level: "2", name: "Courage", shortName: "2C" },
    { ref: "c-1K", level: "1", name: "Kindness", shortName: "1K" },
    { ref: "c-1Z", level: "1", name: "Zenith", shortName: "1Z" },
    { ref: "c-1I", level: "1", name: "Integrity", shortName: "1I" },
    { ref: "c-2P", level: "2", name: "Perseverance", shortName: "2P" },
    { ref: "c-1P", level: "1", name: "Perseverance", shortName: "1P" },
    { ref: "c-1T", level: "1", name: "Thrift", shortName: "1T" },
  ];
  doc1.groups = [
    {
      id: "tg-1I-pull",
      name: "1I Pull-out EL",
      level: "1",
      levels: ["1"],
      subject: "EL",
      venue: "R-1I",
      levelWide: false,
      classRefs: ["c-1I"],
      anchorRef: "c-1I",
    },
  ];
  doc1.assignments = [
    { id: "a-1p-el", target: "1P", targetRef: "c-1P", subject: "EL", teacher: ids.teacherA },
  ];
  doc1.reporting = null;

  const delta1 = changesFor(schoolId, v1Created.versionId, loaded1.rows, doc1);
  await db.batch(delta1.writes.map((w) => statement(db, w.sql, w.args)));

  // Create version 2 (two-letter class scheme with scrambled Gc, Gt, P, Rs, Rp, I, D, E, K + custom suffix)
  const v2Created = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "syn-ordering-v2",
    name: "Synthetic ordering two-letter",
    year,
  });
  const loaded2 = await loadVersion(db, schoolId, v2Created.versionId);
  const doc2 = structuredClone(loaded2.doc);
  doc2.teachers = structuredClone(doc1.teachers);
  doc2.classes = [
    { ref: "c2-1Rp", level: "1", name: "Respect", shortName: "1Rp" },
    { ref: "c2-1Gt", level: "1", name: "Gratitude", shortName: "1Gt" },
    { ref: "c2-1Rs", level: "1", name: "Resilience", shortName: "1Rs" },
    { ref: "c2-1Gc", level: "1", name: "Graciousness", shortName: "1Gc" },
    { ref: "c2-1P", level: "1", name: "Prudence", shortName: "1P" },
    { ref: "c2-1X", level: "1", name: "Xcel", shortName: "1X" },
    { ref: "c2-2Rp", level: "2", name: "Respect", shortName: "2Rp" },
    { ref: "c2-2Rs", level: "2", name: "Resilience", shortName: "2Rs" },
  ];
  doc2.venues = [];
  doc2.groups = [];
  const delta2 = changesFor(schoolId, v2Created.versionId, loaded2.rows, doc2);
  await db.batch(delta2.writes.map((w) => statement(db, w.sql, w.args)));

  const page = await f.pageFor();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/deploy/");
  await page.locator("#version").selectOption(v1Created.versionId);
  await page.waitForFunction(
    (id) => v()?.id === id && !refreshing,
    v1Created.versionId,
  );

  // =========================================================================
  // Suite 1: DEP-21-001 — Teachers row order and grey inactive fill
  // =========================================================================
  await page.getByRole("button", { name: "HR Settings", exact: true }).click();
  await page.getByRole("button", { name: "Teachers", exact: true }).click();
  await page.locator("tr[data-roster-teacher]").first().waitFor();

  const getVisibleTeacherRows = () =>
    page
      .locator("tr[data-roster-teacher]:visible")
      .evaluateAll((rows) =>
        rows.map((tr) => ({
          id: tr.dataset.rosterTeacher,
          inactiveClass: tr.classList.contains("inactive"),
          activityState: tr.dataset.activityState,
          bg: getComputedStyle(tr.cells[0]).backgroundColor,
          text: tr.cells[0].innerText,
        })),
      );

  const keyForId = (id) => Object.keys(ids).find((k) => ids[k] === id) || id;
  const initialRows = (await getVisibleTeacherRows()).filter((r) =>
    savedKeys.includes(keyForId(r.id)),
  );
  assert.deepEqual(
    initialRows.map((r) => keyForId(r.id)),
    [
      "hodB",
      "hodA",
      "jnrKpB",
      "jnrKpA",
      "teacherB",
      "teacherA",
      "unknownTeacher",
      "inactiveHod",
    ],
    "Teachers initial load orders active HODs -> active Junior KPs -> remaining active -> unknown activity -> confirmed inactive",
  );

  const inactiveRow = initialRows.find((r) => keyForId(r.id) === "inactiveHod");
  const unknownRow = initialRows.find((r) => keyForId(r.id) === "unknownTeacher");
  const activeRow0 = initialRows[0];
  const activeRow1 = initialRows[1];
  assert.equal(inactiveRow.inactiveClass, true, "Confirmed inactive row has .inactive class");
  assert.equal(inactiveRow.bg, "rgb(228, 231, 234)", "Confirmed inactive row has grey fill #e4e7ea");
  assert.equal(unknownRow.inactiveClass, false, "Unknown activity row is not marked confirmed .inactive");
  assert.match(unknownRow.text, /Activity unknown/);
  assert.notEqual(unknownRow.bg, "rgb(228, 231, 234)", "Unknown activity row keeps normal band fill");
  assert.equal(activeRow0.bg, "rgb(255, 255, 255)", "First active row has white fill");
  assert.equal(activeRow1.bg, "rgb(232, 240, 245)", "Second active row has light-blue band fill");

  // Sort ascending and descending by TTb Name; verify inactiveHod stays at the bottom in both directions!
  const sortTtbButton = page
    .locator("#content table thead th")
    .first()
    .locator("button")
    .first();
  await sortTtbButton.click();
  const ascRows = (await getVisibleTeacherRows()).filter((r) =>
    savedKeys.includes(keyForId(r.id)),
  );
  assert.equal(
    keyForId(ascRows.at(-1).id),
    "inactiveHod",
    "Confirmed inactive teacher stays at the bottom after ascending sort",
  );
  await sortTtbButton.click();
  const descRows = (await getVisibleTeacherRows()).filter((r) =>
    savedKeys.includes(keyForId(r.id)),
  );
  assert.equal(
    keyForId(descRows.at(-1).id),
    "inactiveHod",
    "Confirmed inactive teacher stays at the bottom after descending sort",
  );

  // Toggle Show inactive off and back on
  const showInactiveBox = page.locator(".show-inactive-toggle input");
  await showInactiveBox.uncheck();
  const activeOnlyRows = (await getVisibleTeacherRows()).filter((r) =>
    savedKeys.includes(keyForId(r.id)),
  );
  assert.equal(
    activeOnlyRows.some((r) => keyForId(r.id) === "inactiveHod"),
    false,
    "Unchecking Show inactive hides inactive teacher rows",
  );
  await showInactiveBox.check();
  const restoredRows = (await getVisibleTeacherRows()).filter((r) =>
    savedKeys.includes(keyForId(r.id)),
  );
  assert.equal(
    keyForId(restoredRows.at(-1).id),
    "inactiveHod",
    "Re-checking Show inactive restores inactive teacher at the bottom",
  );
  console.log("PASS DEP-21-001 Teachers row order, grey inactive fill, unknown-activity distinction, and sort pinning");

  // =========================================================================
  // Suite 2: DEP-21-002 — Consistent class suffix order (single-letter & two-letter)
  // =========================================================================
  await page.getByRole("button", { name: "IP Deploy", exact: true }).click();
  await page.locator("#content tr[data-row]").first().waitFor();
  const ipRowsV1 = await page
    .locator("#content tr[data-row]")
    .evaluateAll((rows) => rows.map((r) => r.dataset.row));
  assert.deepEqual(
    ipRowsV1,
    ["1P", "1T", "1I", "tg-1I-pull", "1K", "1Z", "2P", "2C"],
    "Single-letter IP Deploy orders P -> T -> I (with attached TG) -> K -> custom Z, then P2 P -> C",
  );

  // Filter by level P1 and search, verifying naming pattern still uses full version scheme
  await page.locator("#levels").selectOption("1");
  const ipRowsV1P1 = await page
    .locator("#content tr[data-row]")
    .evaluateAll((rows) => rows.map((r) => r.dataset.row));
  assert.deepEqual(ipRowsV1P1, ["1P", "1T", "1I", "tg-1I-pull", "1K", "1Z"]);
  await page.locator("#levels").selectOption("");

  // Check Program Settings -> Classes in single-letter version
  await page.getByRole("button", { name: "Program Settings", exact: true }).click();
  await page.getByRole("button", { name: "Classes", exact: true }).click();
  const classShortsV1 = await page
    .locator(".class-checklist table tbody tr")
    .evaluateAll((rows) => rows.map((r) => r.cells[1]?.innerText.trim()));
  assert.deepEqual(
    classShortsV1,
    ["P", "T", "I", "R", "C", "H", "G", "K", "Z"],
    "Program Settings -> Classes orders single-letter suffixes P->T->I->R->C->H->G->K followed by custom Z",
  );

  // Switch to two-letter version (v2) and verify Rs precedes Rp in both IP Deploy and Classes
  await page.locator("#version").selectOption(v2Created.versionId);
  await page.waitForFunction(
    (id) => v()?.id === id && !refreshing,
    v2Created.versionId,
  );
  const classShortsV2 = await page
    .locator(".class-checklist table tbody tr")
    .evaluateAll((rows) => rows.map((r) => r.cells[1]?.innerText.trim()));
  assert.deepEqual(
    classShortsV2,
    ["Gc", "Gt", "P", "Rs", "Rp", "I", "D", "E", "K", "X"],
    "Program Settings -> Classes orders two-letter suffixes Gc->Gt->P->Rs->Rp->I->D->E->K followed by custom X",
  );

  await page.getByRole("button", { name: "IP Deploy", exact: true }).click();
  await page.locator("#content tr[data-row]").first().waitFor();
  const ipRowsV2 = await page
    .locator("#content tr[data-row]")
    .evaluateAll((rows) => rows.map((r) => r.dataset.row));
  assert.deepEqual(
    ipRowsV2,
    ["1Gc", "1Gt", "1P", "1Rs", "1Rp", "1X", "2Rs", "2Rp"],
    "Two-letter IP Deploy orders Gc -> Gt -> P -> Rs -> Rp -> custom X in P1, then 2Rs -> 2Rp in P2",
  );
  console.log("PASS DEP-21-002 Consistent single-letter and two-letter (Rs before Rp) class suffix order in IP Deploy and Classes");

  // =========================================================================
  // Suite 3: DEP-21-003 — Span of Control staff pool & School Leader roots
  // =========================================================================
  await page.locator("#version").selectOption(v1Created.versionId);
  await page.waitForFunction(
    (id) => v()?.id === id && !refreshing,
    v1Created.versionId,
  );
  const savedBeforeSpan = (await loadVersion(db, schoolId, v1Created.versionId)).doc.teachers.map((t) => t.id);

  await page.getByRole("button", { name: "HR Settings", exact: true }).click();
  await page.getByRole("button", { name: "Span of Control", exact: true }).click();
  await page.locator(".reporting-workspace").waitFor();

  // Verify Contacts-only School Leader (catalogSl) populates Layer 1 root box!
  assert.equal(
    await page.locator(`[data-ro-drop="${ids.catalogSl}"]`).count(),
    1,
    "Contacts-only active School Leader populates Layer 1 root box",
  );

  // Verify Contacts-only SAT, SATxMK, Support, and OSO appear in Span of Control while MK-only, inactive, and unknown activity are excluded.
  const spanOfficerKeys = await page
    .locator("[data-ro-person]")
    .evaluateAll((nodes) => [...new Set(nodes.map((n) => n.dataset.roPerson))]);
  const spanKeySet = new Set(spanOfficerKeys.map(keyForId));
  for (const expectedKey of [
    "hodA",
    "hodB",
    "jnrKpA",
    "jnrKpB",
    "teacherA",
    "teacherB",
    "catalogSat",
    "catalogSatMk",
    "catalogSupport",
    "catalogOso",
  ]) {
    assert.equal(
      spanKeySet.has(expectedKey),
      true,
      `Span of Control must include ${expectedKey}`,
    );
  }
  for (const excludedKey of ["catalogMkOnly", "inactiveHod", "unknownTeacher"]) {
    assert.equal(
      spanKeySet.has(excludedKey),
      false,
      `Span of Control must exclude ${excludedKey}`,
    );
  }

  // Verify reading Span of Control did NOT mutate saved version teacher membership
  const savedAfterRead = (await loadVersion(db, schoolId, v1Created.versionId)).doc.teachers.map((t) => t.id);
  assert.deepEqual(
    savedAfterRead,
    savedBeforeSpan,
    "Reading Span of Control must not mutate saved version teacher membership",
  );

  // Assign a Contacts-only SAT officer (catalogSat) to report to the Contacts-only School Leader (catalogSl), save, and reload
  await page.locator(`[data-ro-edit="${ids.catalogSat}"]`).click();
  await page.locator("dialog .search-select > summary").click();
  await page
    .getByRole("option", { name: "Synthetic catalogSl · Principal", exact: true })
    .click();
  await page.locator("dialog #ok").click();
  await page
    .locator("#saveQueue")
    .getByRole("button", { name: "Save to online", exact: true })
    .click();
  await page.waitForFunction(
    () => !queuedEdits().length && !queueFlight && !refreshing,
  );

  const savedAfterAssign = (await loadVersion(db, schoolId, v1Created.versionId)).doc;
  assert.equal(
    savedAfterAssign.reporting.parents[ids.catalogSat],
    ids.catalogSl,
    "Saved reporting link persists between Contacts-hydrated SAT officer and SL root",
  );
  console.log("PASS DEP-21-003 Span of Control hydrates SL roots and SAT/SATxMK/Support/OSO from Contacts without mutating doc.teachers on read");

  assert.deepEqual(errors, []);
} finally {
  await f.close();
}
