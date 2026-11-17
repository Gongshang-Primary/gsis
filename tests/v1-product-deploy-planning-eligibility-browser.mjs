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
  const seeded = { date: futureDate() },
    db = await f.db("deploy");
  const cases = [
    ["ordinary", [], "Y", "Teacher"],
    ["mk", ["MK"], "Y", "MK"],
    ["sat", ["SAT"], "Y", "SAT"],
    ["satmk", ["SAT", "MK"], "Y", "SAT MK"],
    ["support", ["Support"], "Y", "Support"],
    ["sl", ["SL"], "Y", "SL"],
    ["oso", ["Support"], "Y", "OSO"],
    ["inactive", [], "N", "Teacher"],
    ["optional", [], "Y", "Uncatalogued role"],
    ["unknown", [], null, "Teacher"],
  ];
  const ids = {};
  for (const [key, groups, active, role] of cases) {
    const temporary = "synthetic-planning-" + key;
    const result = await f.call(f.admin, "contacts", "/save-data", {
      operationId: "synthetic-create-planning-" + key,
      changes: [],
      additions: [
        {
          id: temporary,
          values: {
            "Basic Name": "Synthetic " + key,
            "Statutory Name": "Synthetic " + key,
            Role: role,
            ...(active === null ? {} : { Active: active }),
          },
        },
      ],
    });
    ids[key] = result.mapping[temporary];
  }
  const created = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-planning-matrix",
    name: "Synthetic planning matrix",
    year: Number(seeded.date.slice(0, 4)),
  });
  const loaded = await loadVersion(db, schoolId, created.versionId);
  const doc = structuredClone(loaded.doc);
  doc.teachers = doc.teachers.filter((person) =>
    Object.values(ids).includes(person.id),
  );
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
  const roleName = (key) => (key === "oso" ? "OSO" : "Role " + key);
  doc.membership = cases.map(([key, groups]) => [
    roleName(key),
    "Synthetic role",
    ...managed.map((label) => (groups.includes(label) ? "1" : "")),
    "",
    null,
  ]);
  doc.roleMembershipSchema = 1;
  for (const [key, groups, active] of cases) {
    const person = doc.teachers.find((t) => t.id === ids[key]);
    person.profile = {
      "Basic Name": "Synthetic " + key,
      "TTb Name": "Synthetic " + key,
      Role: roleName(key),
      ...(active === null ? {} : { Active: active }),
    };
    person.planningProfile = structuredClone(person.profile);
    person.active = active === "Y";
    person.groups = groups;
    person.deploymentTags = { ...person.deploymentTags, Memberships: groups };
    person.mk = "";
  }
  doc.classes = [
    {
      ref: "synthetic-planning-class",
      name: "Synthetic class",
      shortName: "1S",
      level: "1",
    },
  ];
  doc.assignments = [];
  doc.reporting = null;
  doc.organisations = Object.fromEntries(
    ["dept", "comm", "cca", "plt", "events"].map((kind) => [
      kind,
      [
        {
          id: "synthetic-" + kind,
          name: "Synthetic " + kind,
          slots: Array(
            kind === "plt" ? 1 : kind === "dept" || kind === "events" ? 2 : 4,
          ).fill(""),
          ...(kind === "comm" ? { leadershipSchema: 1 } : {}),
        },
      ],
    ]),
  );
  const delta = changesFor(schoolId, created.versionId, loaded.rows, doc);
  await db.batch(delta.writes.map((w) => statement(db, w.sql, w.args)));
  const saved = async () =>
    (await loadVersion(db, schoolId, created.versionId)).doc;
  const before = await saved(),
    core = await f.db("core");
  const authorities = await core
    .prepare(
      "SELECT * FROM core_grants WHERE school_id=? ORDER BY account_id,capability",
    )
    .bind(schoolId)
    .all();
  const page = await f.pageFor(),
    errors = [],
    alerts = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", async (d) => {
    alerts.push(d.message());
    await d.dismiss();
  });
  await page.goto(origin + "/deploy/");
  await page.getByRole("button", { name: "HR Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Span of Control", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Initialize staff list", exact: true })
      .count(),
    0,
    "Span must render its read projection without an Initialize action",
  );
  const spanIds = await page
    .locator("[data-ro-person]")
    .evaluateAll((nodes) => [
      ...new Set(nodes.map((node) => node.dataset.roPerson)),
    ]);
  assert.deepEqual(
    spanIds.map((id) => Object.keys(ids).find((key) => ids[key] === id)).sort(),
    ["ordinary", "sat", "satmk", "support", "oso", "optional"].sort(),
  );
  assert.equal(
    await page.locator(`[data-ro-drop="${ids.sl}"]`).count(),
    1,
    "version SL is a visible protected root",
  );
  assert.equal((await saved()).reporting, null, "opening Span is read-only");
  assert.deepEqual(
    await saved(),
    before,
    "opening Span writes no version data or revision",
  );
  assert.equal(
    f.requests.filter(
      (r) =>
        r.input?.operation === "initReporting" ||
        r.input?.operation === "setReportingOfficer",
    ).length,
    0,
  );
  console.log(
    "PASS Span read projection includes SAT×MK/Support/SL/OSO without initializing durable state",
  );

  const general = ["ordinary", "optional"].map((key) => ids[key]).sort();
  for (const [name, kind] of [
    ["Dept", "dept"],
    ["Committees", "comm"],
    ["CCAs", "cca"],
    ["PLT", "plt"],
    ["Events", "events"],
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    const choices = await page
      .locator(`select[data-group="synthetic-${kind}"]`)
      .first()
      .locator("option")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => node.value)
          .filter(Boolean)
          .sort(),
      );
    assert.deepEqual(
      choices,
      general,
      name + " choices use version planning facts without accepted EO",
    );
  }
  await page.getByRole("button", { name: "IP Deploy", exact: true }).click();
  const add = page.locator('[data-target="1S"][data-sub="EL"]').first();
  await add.click();
  const ip = page.locator('select[aria-label="Teacher for 1S EL"]');
  assert.deepEqual(
    await ip.locator("option").evaluateAll((nodes) =>
      nodes
        .map((node) => node.value)
        .filter(Boolean)
        .sort(),
    ),
    general,
  );
  await page
    .getByRole("option", { name: "Synthetic ordinary", exact: true })
    .click();
  await page
    .locator("#saveQueue")
    .getByRole("button", { name: "Save to online", exact: true })
    .click();
  await page.waitForFunction(() => !queuedEdits().length && !queueFlight);
  assert.equal(
    (await saved()).assignments[0].teacher,
    ids.ordinary,
    "actual native IP save accepts the planning-eligible staff member without accepted EO",
  );
  console.log(
    "PASS native IP/Dept/Committees/CCAs/PLT/Events choices share the explicit planning policy",
  );

  await page.getByRole("button", { name: "HR Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Span of Control", exact: true })
    .click();
  await page.locator(`[data-ro-edit="${ids.ordinary}"]`).click();
  await page.locator("dialog .search-select > summary").click();
  await page
    .getByRole("option", { name: "Synthetic sl · Role sl", exact: true })
    .click();
  await page.locator("dialog #ok").click();
  assert.equal(
    (await saved()).reporting,
    null,
    "queued first edit is not yet a durable initialization",
  );
  await page
    .locator("#saveQueue")
    .getByRole("button", { name: "Save to online", exact: true })
    .click();
  await page.waitForFunction(() => !queuedEdits().length && !queueFlight);
  const assigned = await saved();
  assert.equal(
    (assigned.reporting.parents || assigned.reporting.officers)[ids.ordinary],
    ids.sl,
  );
  const requests = f.requests.filter((r) =>
    r.input?.edits?.some((edit) => edit.operation === "setReportingOfficer"),
  );
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].input.edits.some((edit) => edit.operation === "initReporting"),
    false,
  );
  console.log(
    "PASS first explicit reporting edit initializes and assigns in the existing atomic save",
  );

  const savedAssignments = structuredClone(assigned.assignments);
  await page.getByRole("button", { name: "Membership", exact: true }).click();
  const mkFlag = page.locator(
    '[data-role-membership] input[data-member-row="0"][data-member-col="11"]',
  );
  await mkFlag.check();
  assert.equal(
    await page.evaluate(
      (id) => eligibleTeacher(v().teachers.find((t) => t.id === id)),
      ids.ordinary,
    ),
    false,
    "a current version matrix change updates picker eligibility before saving",
  );
  assert.deepEqual(
    await page.evaluate(() => structuredClone(v().assignments)),
    savedAssignments,
  );
  await page
    .locator("#saveQueue")
    .getByRole("button", { name: "Save to online", exact: true })
    .click();
  await page.waitForFunction(() => !queuedEdits().length && !queueFlight);
  await page
    .getByRole("button", { name: "Span of Control", exact: true })
    .click();
  const historical = page.locator(`[data-ro-edit="${ids.ordinary}"]`);
  assert.equal(await historical.count(), 1);
  assert.match(
    await historical.locator("..").innerText(),
    /Excluded from new choices/,
  );
  assert.equal((await saved()).reporting.parents[ids.ordinary], ids.sl);
  await historical.click();
  assert.equal(
    await page.locator("#reportingChoice option:not([disabled])").count(),
    1,
    "excluded linked staff may clear their link but cannot acquire a new RO",
  );
  await page.locator("dialog .search-select > summary").click();
  await page.getByRole("option", { name: "Unassigned", exact: true }).click();
  await page.locator("dialog #ok").click();
  await page
    .locator("#saveQueue")
    .getByRole("button", { name: "Save to online", exact: true })
    .click();
  await page.waitForFunction(() => !queuedEdits().length && !queueFlight);
  assert.equal((await saved()).reporting.parents[ids.ordinary], "");
  assert.deepEqual((await saved()).assignments, savedAssignments);
  console.log(
    "PASS live matrix changes exclude new choices while retaining assignments and allowing stale-link removal",
  );

  await page.getByRole("button", { name: "Membership", exact: true }).click();
  await mkFlag.uncheck();
  assert.equal(
    await page.evaluate(
      (id) => eligibleTeacher(v().teachers.find((t) => t.id === id)),
      ids.ordinary,
    ),
    true,
    "removing a matrix exclusion must not leave a sticky derived MK flag",
  );
  await page
    .locator("#saveQueue")
    .getByRole("button", { name: "Save to online", exact: true })
    .click();
  await page.waitForFunction(() => !queuedEdits().length && !queueFlight);
  await page.evaluate(
    (id) =>
      queueCell({
        operation: "setTeacherField",
        teacher: id,
        field: "Active",
        value: "N",
        expected: "Y",
      }),
    ids.ordinary,
  );
  assert.equal(
    await page.evaluate(
      (id) => eligibleTeacher(v().teachers.find((t) => t.id === id)),
      ids.ordinary,
    ),
    false,
  );
  assert.deepEqual(
    await page.evaluate(() => structuredClone(v().assignments)),
    savedAssignments,
    "Active=N is a planning proposal, not permission to erase historical assignments",
  );
  await page
    .locator("#saveQueue")
    .getByRole("button", { name: "Save to online", exact: true })
    .click();
  await page.waitForFunction(() => !queuedEdits().length && !queueFlight);
  assert.deepEqual((await saved()).assignments, savedAssignments);
  console.log(
    "PASS matrix reversal and explicit Active draft change preserve existing history",
  );

  // Existing contradictory aliases are a synthetic durable compatibility
  // fixture. Opening the page must expose them, not normalise them silently.
  const legacy = await loadVersion(db, schoolId, created.versionId);
  const conflicted = structuredClone(legacy.doc);
  for (const key of ["optional", "oso"]) {
    conflicted.reporting.parents[ids[key]] = ids.sl;
    conflicted.reporting.officers[ids[key]] = ids.sat;
  }
  const legacyDelta = changesFor(
    schoolId,
    created.versionId,
    legacy.rows,
    conflicted,
  );
  await db.batch(legacyDelta.writes.map((w) => statement(db, w.sql, w.args)));
  await page.reload();
  await page.getByRole("button", { name: "HR Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Span of Control", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Some saved reporting links disagree" })
    .waitFor();
  assert.equal((await saved()).reporting.officers[ids.optional], ids.sat);
  await page.getByRole("button", { name: "View", exact: true }).click();
  assert.match(
    await page.locator(".reporting-directory").innerText(),
    /Saved links disagree/,
  );
  await page.getByRole("button", { name: "Assignment", exact: true }).click();
  await page.locator(`[data-ro-edit="${ids.optional}"]`).click();
  await page.locator("dialog .search-select > summary").click();
  await page
    .getByRole("option", {
      name: "Synthetic support · Role support",
      exact: true,
    })
    .click();
  await page.locator("dialog #ok").click();
  await page
    .locator("#saveQueue")
    .getByRole("button", { name: "Save to online", exact: true })
    .click();
  await page.waitForFunction(() => !queuedEdits().length && !queueFlight);
  const reconciled = await saved();
  assert.equal(reconciled.reporting.parents[ids.optional], ids.support);
  assert.equal(reconciled.reporting.officers[ids.optional], ids.support);
  assert.equal(reconciled.reporting.parents[ids.oso], ids.sl);
  assert.equal(
    reconciled.reporting.officers[ids.oso],
    ids.sat,
    "unrelated conflicting aliases remain intact",
  );
  console.log(
    "PASS retained legacy conflicts are visible; explicit edit reconciles only its own person",
  );

  assert.deepEqual(
    (
      await core
        .prepare(
          "SELECT * FROM core_grants WHERE school_id=? ORDER BY account_id,capability",
        )
        .bind(schoolId)
        .all()
    ).results,
    authorities.results,
  );
  for (const person of (await saved()).teachers) {
    const original = before.teachers.find((t) => t.id === person.id);
    assert.deepEqual(person.authority, original.authority);
    assert.deepEqual(person.teachingEligibility, original.teachingEligibility);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(alerts, []);
  console.log(
    "PASS planning list and graph edits preserve accepted authority/capacity metadata",
  );
} finally {
  await f.close();
}
