import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { fixture, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";
import { decodeWorkbook } from "../v1/web/shared/workbooks.mjs";

// Real isolated Core/Contacts/Deploy Workers and D1; no hosted data or providers.
// Only the historical saved assignment rows are seeded directly into owner D1.
const started = Date.now();
const f = await fixture();
try {
  const cases = [
    ["ordinary", "Y", "", ""],
    ["second", "Y", "", "BT"],
    ["parttime", "Y", "", "4/5"],
    ["fajt", "Y", "", "FAJT"],
    ["inactive", "N", "", ""],
    ["unknown", null, "", ""],
    ["mk", "Y", "MK", ""],
  ];
  const createdStaff = await f.call(f.admin, "contacts", "/save-data", {
    operationId: "synthetic-workload-create-staff",
    changes: [],
    additions: cases.map(([key, active, role, employment]) => ({
      id: "synthetic-workload-" + key,
      values: {
        "Basic Name": "Synthetic workload " + key,
        "Statutory Name": "Synthetic workload " + key,
        Role: role,
        ...(active === null ? {} : { Active: active }),
        "Employment Modifier": employment,
        "Subject Modifier": "PE",
      },
    })),
  });
  const ids = Object.fromEntries(
    cases.map(([key]) => [
      key,
      createdStaff.mapping["synthetic-workload-" + key],
    ]),
  );
  const { versionId } = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-workload-create-version",
    name: "Synthetic planning workload",
    year: 2026,
  });
  const db = await f.db("deploy"),
    contactsDb = await f.db("contacts");
  const loaded = await loadVersion(db, schoolId, versionId);
  const doc = structuredClone(loaded.doc);
  doc.teachers = doc.teachers.filter((t) => Object.values(ids).includes(t.id));
  ids.orphan = "synthetic-workload-missing-contact";
  doc.teachers.push({
    id: ids.orphan,
    name: "Synthetic missing contact",
    active: true,
    activeKnown: true,
    profile: {
      "Basic Name": "Synthetic missing contact",
      Active: "Y",
      "Subject Modifier": "PE",
    },
  });
  doc.classes = [
    {
      ref: "synthetic-workload-class",
      name: "Synthetic class",
      shortName: "A",
      level: "1",
    },
  ];
  doc.groups = [];
  doc.loads = Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map((level) => [
      level,
      { Assembly: 1, FTGP: 2, FTT: 2, PHE: 4 },
    ]),
  );
  doc.assignments = Object.values(ids).map((teacher, index) => ({
    id: "synthetic-workload-assignment-" + index,
    teacher,
    target: "1A",
    targetRef: "synthetic-workload-class",
    level: "1",
    subject: "PHE",
  }));
  doc.organisations = { dept: [], comm: [], cca: [], plt: [], events: [] };
  doc.duties = [];
  const delta = changesFor(schoolId, versionId, loaded.rows, doc);
  await db.batch(
    delta.writes.map((write) => statement(db, write.sql, write.args)),
  );
  const saved = async () => (await loadVersion(db, schoolId, versionId)).doc;
  const before = await saved();
  const contactsFields = async () =>
    (
      await contactsDb
        .prepare(
          "SELECT * FROM contacts_fields WHERE school_id=? ORDER BY staff_id,field",
        )
        .bind(schoolId)
        .all()
    ).results;
  const fieldsBefore = await contactsFields();
  const boot = await f.call(f.admin, "deploy", "/bootstrap", { versionId });
  const acceptedBefore = boot.current.reliefResults;
  const ordinaryEvidence = acceptedBefore.teachers.find(
    (t) => t.teacherId === ids.ordinary,
  );
  assert.equal(
    boot.current.teachers.find((t) => t.id === ids.ordinary).teachingEligibility
      .state,
    "unavailable",
  );
  assert.equal(ordinaryEvidence.quality, "unavailable");
  assert.equal(ordinaryEvidence.R, null);

  const page = await f.pageFor(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.dismiss());
  await page.goto(origin + "/deploy/");
  await page
    .getByRole("button", { name: "Workload", exact: true })
    .first()
    .click();
  await page.locator(".workload-totals").waitFor();
  const planning = await page.evaluate(() => {
    const w = workloadData();
    return {
      fullTime: w.fullTimeN,
      pe: w.special.PE.pool,
      supplementary: w.special.PE.supplementary.pool,
      assigned: w.totals.total,
      issues: w.issues,
      rows: w.rows.map((r) => ({
        id: r.teacher.id,
        active: r.active,
        eligible: r.rules.eligible,
        total: r.total,
      })),
    };
  });
  assert.equal(
    planning.fullTime,
    2,
    "Known-active saved teachers belong to the planning denominator even without accepted EO/section facts",
  );
  assert.deepEqual(
    planning.pe.slice().sort(),
    [ids.ordinary, ids.second, ids.parttime].sort(),
  );
  assert.deepEqual(planning.supplementary, [ids.fajt]);
  assert.equal(
    planning.assigned,
    32,
    "Retained inactive, unknown, MK and orphan assignments still count as actual periods",
  );
  for (const key of ["inactive", "unknown", "mk", "orphan"]) {
    const row = planning.rows.find((r) => r.id === ids[key]);
    assert.equal(
      row.eligible,
      false,
      key + " stays outside planning teacher pools",
    );
    assert.equal(row.total, 4, key + " retains historical assignment periods");
  }
  assert(
    !planning.issues.some((issue) =>
      /Synthetic workload (ordinary|second|parttime|fajt).*: Non-teaching staff record/.test(
        issue,
      ),
    ),
  );
  await page.locator("[data-workload-basis]").waitFor();
  assert.match(
    await page.locator("[data-workload-basis]").innerText(),
    /planning/i,
  );
  assert.match(
    await page.locator(".workload-totals").innerText(),
    /Full-time teachers: 2/,
  );
  assert.equal(
    await page.evaluate(
      (id) =>
        GSISTeachingRules.calculate(
          plannerTeacher(v().teachers.find((t) => t.id === id)),
          v().offload,
        ).eligible,
      ids.ordinary,
    ),
    false,
    "Default calculation still requires accepted evidence; no synthetic eligibility marker is created",
  );
  console.log(
    "PASS planning Workload restores full-time/specialist pools and retains excluded assignment totals",
  );

  for (const view of ["Stats", "Ledger"]) {
    await page.getByRole("button", { name: view, exact: true }).first().click();
    await page.locator("[data-workload-basis]").waitFor();
    assert.match(
      await page.locator("[data-workload-basis]").innerText(),
      /planning/i,
    );
    assert.equal(await page.evaluate(() => workloadData().fullTimeN), 2);
    if (view === "Stats") {
      const headcount = page
        .locator(".workload-stats-table tr")
        .filter({ hasText: "Teacher headcount" });
      assert.equal(
        await headcount.locator("td").nth(4).innerText(),
        "3",
        "PE statistics use the same planning pool",
      );
    } else {
      const row = page
        .locator(".workload-ledger tbody tr")
        .filter({ hasText: "Synthetic workload ordinary" });
      const rIndex = await page
        .locator(
          '.workload-ledger thead th[aria-label^="R: Deploy relief quota"]',
        )
        .evaluate((cell) => cell.cellIndex);
      assert(rIndex >= 0);
      assert.equal(
        await row.locator("td").nth(rIndex).innerText(),
        "Unavailable",
        "Ledger R stays server-sourced and unavailable",
      );
    }
  }
  console.log(
    "PASS Stats and Ledger share the planning basis without inventing R",
  );

  const tools = page.locator("#content .gsis-core-tools").first();
  await tools
    .getByRole("combobox", { name: "Excel export scope", exact: true })
    .selectOption("visible");
  const download = page.waitForEvent("download");
  await tools
    .getByRole("button", { name: "Export Excel", exact: true })
    .click();
  const xml = new JSDOM("");
  try {
    const workbook = await decodeWorkbook(
      await readFile(await (await download).path()),
      { Zip: JSZip, XMLParser: xml.window.DOMParser },
    );
    assert.match(workbook.metadata["Calculation Basis"], /planning/i);
    assert.match(workbook.metadata["Export Kind"], /not an import template/i);
    assert(
      workbook.sheets.Report.rows.some((row) =>
        String(row[0]).includes("Synthetic workload ordinary"),
      ),
    );
  } finally {
    xml.window.close();
  }
  console.log(
    "PASS visible report workbook retains the planning calculation basis",
  );

  assert.deepEqual(
    await saved(),
    before,
    "Rendering and export cannot mutate the saved version",
  );
  assert.deepEqual(
    await contactsFields(),
    fieldsBefore,
    "Planning does not accept or rewrite Contacts facts",
  );
  const after = await f.call(f.admin, "deploy", "/bootstrap", { versionId });
  assert.deepEqual(
    after.current.reliefResults,
    acceptedBefore,
    "Server publication/relief inputs remain unchanged",
  );
  assert.equal(
    f.requests.filter((r) =>
      /\/api\/deploy\/(change|publish|lease)$/.test(r.url),
    ).length,
    0,
  );
  assert.deepEqual(errors, []);
  assert(
    f.external.every((url) =>
      url.startsWith("https://accounts.google.com/gsi/"),
    ),
    "Only intercepted Google sign-in assets may be attempted",
  );
  console.log(
    "PASS read-only browser reports leave owner documents, accepted relief and publication paths unchanged (" +
      (Date.now() - started) +
      "ms)",
  );
} finally {
  await f.close();
}
