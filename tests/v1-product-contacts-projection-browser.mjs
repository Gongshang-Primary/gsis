import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { decodeWorkbook } from "../v1/web/shared/workbooks.mjs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";

// Real owner handlers, all nine local Workers/D1 and built browser assets.
// No native-profile substitute, live school records or provider calls.
const evidence = fileURLToPath(
    new URL(
      "../deliverables/v1/evidence/contacts-projection/",
      import.meta.url,
    ),
  ),
  started = performance.now();
await mkdir(evidence, { recursive: true });
const suite = await productSuite({
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-projection.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});
let browser,
  passed = 0,
  serial = 0;
const results = [],
  errors = [],
  egress = [];
const fields = [
  "Basic Name",
  "TTb Name",
  "Statutory Name",
  "Mobile No",
  "EXT",
  "Role",
  "EO Appt Level",
  "Appointment Status",
  "Active",
  "Employment Modifier",
  "Subject Modifier",
  "MK Modifier",
  "Day of Birth",
  "Month of birth",
  "GSPS Alias (@gsps.edu.sg)",
  "iCON Alias (@moe.edu.sg)",
  "CES Alias (@schools.gov.sg)",
  "School Section",
  "Personnel Category",
  "Employment Arrangement",
  "Employment Status",
  "Memberships",
  "General Aliases",
  "Name Suffix",
  "Profile Completion",
];
async function test(name, run) {
  await run();
  passed++;
  results.push(name);
  console.log("PASS " + name);
}
try {
  const admin = await suite.seedAccount("projection-browser-admin");
  const post = (domain, path, body) =>
    suite.call(admin, domain, path, {
      operationId: "browser-projection-" + ++serial,
      ...body,
    });
  const get = async (domain, path) => {
    const r = await suite.request(admin, domain, path);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.data;
  };
  const update = async (id, changes) => {
    const current = await get("contacts", "/staff/" + id);
    return post("contacts", "/staff/" + id + "/update", {
      changes,
      fieldRevisions: Object.fromEntries(
        Object.keys(changes).map((key) => [
          key,
          current.fields[key]?.revision ?? 0,
        ]),
      ),
    });
  };

  const created = await suite.call(admin, "contacts", "/save-data", {
    operationId: "projection-browser-create",
    changes: [],
    additions: [
      {
        id: "temporary-projection",
        values: {
          "Basic Name": "Synthetic Projection Person",
          "Statutory Name": "=Literal name",
          "Mobile No": "81234567",
          EXT: "1234",
          "GSPS Alias (@gsps.edu.sg)": "School.Local@example.invalid",
          "iCON Alias (@moe.edu.sg)": "Icon.Local@MOE.EDU.SG",
          "CES Alias (@schools.gov.sg)": "Ces.Local@Schools.Gov.Sg",
          "Day of Birth": "7",
          "Month of birth": "3",
        },
      },
    ],
  });
  const staffId = created.mapping["temporary-projection"];
  assert.equal(typeof staffId, "string");
  await suite.call(admin, "contacts", "/staff/" + staffId + "/accept", {
    operationId: "projection-browser-eo",
    field: "eo",
    value: true,
    revision: 0,
    ownerReviewReference: "synthetic-explicit-review",
  });
  await update(staffId, {
    aliases: ["Fallback@moe.edu.sg", "Fallback@schools.gov.sg"],
  });
  const expected = [
    "Synthetic Projection Person",
    "Synthetic Projection Person",
    "=Literal name",
    "81234567",
    "1234",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "7",
    "3",
    "School.Local",
    "Icon.Local",
    "Ces.Local",
    "",
    "",
    "",
    "",
    "",
    "Fallback@moe.edu.sg\nFallback@schools.gov.sg",
    "",
    "provisional",
  ];
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath:
      process.env.GSIS_BROWSER_EXECUTABLE ||
      process.env.ROSTER_TEST_CHROMIUM ||
      undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  await context.addCookies([
    {
      name: "__Host-gsis_session",
      value: admin.token,
      domain: "gsis.example.invalid",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (!request.url().startsWith(origin + "/")) {
      egress.push(request.url());
      return route.abort();
    }
    const response = await suite.mf.dispatchFetch(request.url(), {
      method: request.method(),
      headers: await request.allHeaders(),
      body: ["GET", "HEAD"].includes(request.method())
        ? undefined
        : request.postDataBuffer(),
    });
    const headers = Object.fromEntries(response.headers);
    delete headers["transfer-encoding"];
    return route.fulfill({
      status: response.status,
      headers,
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) => errors.push(error.message));
  const cell = (label) =>
    page.locator(
      '#dataGrid [data-person="' + staffId + '"][aria-label="' + label + '"]',
    );
  await test("actual owner grid reaches native browser with canonical EXT, aliases, birthday and blank EO appointment", async () => {
    await page.goto(origin + "/contacts/", { waitUntil: "domcontentloaded" });
    await page.locator("#dataTab").click();
    await cell("EXT").waitFor();
    const actual = [];
    for (const field of fields) {
      const value = await cell(field).inputValue();
      actual.push(field === "Mobile No" ? value.replace(/\s/g, "") : value);
    }
    assert.deepEqual(actual, expected);
    const data = await page.evaluate(async () =>
      GSISV1.request("contacts", "/data"),
    );
    assert.deepEqual(data.fields, fields);
    assert.deepEqual(
      data.rows.find((row) => row.id === staffId).values,
      expected,
    );
    assert.deepEqual(data.aliasDomains, {
      gsps: "example.invalid",
      icon: "moe.edu.sg",
      ces: "schools.gov.sg",
    });
  });
  await test("canonical Export All preserves independently expected cells and literal formula text", async () => {
    await page
      .locator("#data")
      .getByRole("group", { name: "Table controls", exact: true })
      .getByLabel("Excel export scope")
      .selectOption("all");
    const download = page.waitForEvent("download");
    await page
      .locator("#data")
      .getByRole("group", { name: "Table controls", exact: true })
      .getByRole("button", { name: "Export Excel", exact: true })
      .click();
    const file = await download;
    const dom = new JSDOM();
    try {
      const workbook = await decodeWorkbook(await readFile(await file.path()), {
        Zip: JSZip,
        XMLParser: dom.window.DOMParser,
      });
      assert.deepEqual(workbook.sheets.Contacts.columns, [
        "Staff ID",
        ...fields,
      ]);
      assert.deepEqual(
        workbook.sheets.Contacts.rows.find((row) => row[0] === staffId),
        [staffId, ...expected],
      );
      assert.deepEqual(
        workbook.sheets.Baseline.rows,
        workbook.sheets.Contacts.rows,
      );
    } finally {
      dom.window.close();
    }
  });
  await test("native permitted edit and dedicated clear preserve configured directory addresses across reload", async () => {
    await cell("Mobile No").fill("8765 4321");
    await cell("iCON Alias (@moe.edu.sg)").fill("");
    await page.locator("#saveData").click();
    await page.waitForFunction(
      () => document.querySelector("#dataStatus")?.textContent === "Saved",
    );
    expected[3] = "87654321";
    expected[15] = "";
    const raw = await get("contacts", "/staff/" + staffId);
    assert.equal(raw.fields.ext.value, "1234");
    assert.equal(raw.fields.mobile.value, "87654321");
    assert.equal(raw.fields.iconEmail.value ?? null, null);
    assert(raw.fields.aliases.value.includes("Fallback@moe.edu.sg"));
    // The native directory is module-scoped. Inspect its rendered addresses
    // before reload so the save-side alias reconstruction is exercised too.
    const addresses = await page
      .locator("#contactRows tr")
      .filter({ has: page.locator('[data-contact-vcard="' + staffId + '"]') })
      .locator('a[href^="mailto:"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    assert.deepEqual(addresses, [
      "mailto:School.Local@example.invalid",
      "mailto:Ces.Local@Schools.Gov.Sg",
    ]);
    await page.reload();
    await page.locator("#dataTab").click();
    await cell("EXT").waitFor();
    assert.equal(await cell("EXT").inputValue(), "1234");
    assert.equal(
      (await cell("Mobile No").inputValue()).replace(/\s/g, ""),
      "87654321",
    );
    assert.equal(await cell("iCON Alias (@moe.edu.sg)").inputValue(), "");
    await page.screenshot({
      path: join(evidence, "contacts-grid-desktop.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(evidence, "contacts-grid-narrow.png") });
    await page.setViewportSize({ width: 1440, height: 960 });
  });
  // New ordinary setup uses direct values. Historical/orphan Deploy rows below
  // still exercise preserved references; current catalogue CRUD is retired.
  const eligible = ["browser-twin-one", "browser-twin-two"],
    inactive = "browser-inactive",
    nonEO = "browser-non-eo",
    mk = "browser-mk",
    unknown = "browser-unknown",
    proposalOnly = "browser-proposal-only",
    unreferenced = "browser-unreferenced",
    orphan = "browser-missing-owner";
  await post("contacts", "/staff/create", {
    staffId: unknown,
    basicName: "Unknown activity teacher",
  });
  await update(staffId, {
    employmentActive: true,
    schoolSection: "Primary",
  });
  // Version-owned activity/role are planning choices. Missing or false accepted
  // EO does not exclude ordinary version teachers; MK and unknown activity do.
  const choicesExpected = [...eligible, staffId, inactive, nonEO, proposalOnly, unreferenced];
  for (const [id, basicName, suffix] of [
    [eligible[0], "Synthetic Twin", "One"],
    [eligible[1], "Synthetic Twin", "Two"],
    [inactive, "Dated relief teacher", ""],
    [nonEO, "Explicit non EO", ""],
    [mk, "MK teacher", ""],
    [proposalOnly, "Proposal only non EO", ""],
    [unreferenced, "Unreferenced non EO", ""],
  ]) {
    await post("contacts", "/staff/create", {
      staffId: id,
      basicName,
      ...(suffix ? { nameSuffix: suffix } : {}),
    });
    await update(id, {
      employmentActive: true,
      schoolSection: id === mk ? "MK" : "Primary",
      employmentArrangement: "Full-time",
      role: "Teacher",
      eoAppointmentLevel: "EO",
      appointmentStatus: "Confirmed",
      employmentTags: id === eligible[1] || id === inactive ? ["FAJT"] : [],
      subjectTags: [],
    });
    await update(id, { mkTags: [], memberships: [] });
    await post("contacts", "/staff/" + id + "/accept", {
      field: "eo",
      value: ![proposalOnly, unreferenced].includes(id),
      revision: 0,
      ownerReviewReference: "synthetic-owner-review",
    });
  }
  const versions = [];
  for (const name of ["Projection One", "Projection Two"])
    versions.push(await post("deploy", "/versions/create", { name }));
  const versionId = versions[0].versionId;
  async function save(edits) {
    const boot = await post("deploy", "/bootstrap", { versionId }),
      lease = await post("deploy", "/lease", {
        versionId,
        revision: boot.current.revision,
        scope: "meta",
        clientId: "projection-browser",
      });
    return post("deploy", "/change", {
      versionId,
      revision: boot.current.revision,
      scope: "meta",
      clientId: "projection-browser",
      leaseFence: lease.fence,
      operation: "saveDraft",
      edits,
    });
  }
  await save([
    {
      operation: "addClass",
      ref: "browser-class",
      level: "1",
      name: "Synthetic Class",
      shortName: "A",
    },
    { operation: "setLoad", level: "1", subject: "EL", value: 10, expected: 0 },
    {
      operation: "setLoad",
      level: "1",
      subject: "Math",
      value: 6,
      expected: 0,
    },
    { operation: "setSubjectType", subject: "Math", value: "tg" },
    {
      operation: "addTG",
      localId: "browser-tg",
      level: "1",
      levels: ["1"],
      name: "Synthetic Math group",
      subject: "Math",
      classRefs: ["browser-class"],
      levelWide: false,
      weeklyPeriods: 3,
      venue: "",
    },
    {
      operation: "addTeacher",
      teacher: nonEO,
      target: "1A",
      targetRef: "browser-class",
      subject: "EL",
    },
    {
      operation: "addTeacher",
      teacher: inactive,
      target: "1A",
      targetRef: "browser-class",
      subject: "EL",
    },
  ]);
  const before = (await post("deploy", "/bootstrap", { versionId })).current,
    history = before.assignments.find((row) => row.teacher === inactive),
    groupId = before.groups.find(
      (row) => row.name === "Synthetic Math group",
    ).id;
  assert(history);
  await update(inactive, { employmentActive: false });
  await post("contacts", "/staff/" + nonEO + "/accept", {
    field: "eo",
    value: false,
    revision: 1,
    ownerReviewReference: "synthetic-changed-authority",
  });
  // Accepted labels change after the version was created. The version's
  // Role/Active planning snapshot remains independent of accepted capacity.
  await update(mk, { role: "MK" });
  await update(nonEO, { role: "P" });
  await save([
    { operation: "setTeacherNote", teacher: mk, expected: "", value: "" },
    {
      operation: "setTeacherField",
      teacher: proposalOnly,
      field: "Role",
      value: "Teacher",
    },
    {
      operation: "setTeacherNote",
      teacher: inactive,
      expected: "",
      value: "Retained dated reference",
    },
    {
      operation: "setTeacherField",
      teacher: inactive,
      field: "Active",
      expected: "N",
      value: "Y",
    },
  ]);
  // Isolated synthetic historical snapshot: no current Contacts identity exists.
  // There is no supported owner delete route; this fixtures only an old retained
  // version row/assignment, not a live deletion or a new assignment API success.
  const deployDb = await suite.db("deploy");
  for (const [scope, rowId, value] of [
    [
      "teachers",
      orphan,
      {
        id: orphan,
        name: "Historical missing owner",
        active: true,
        activeKnown: true,
        profile: { "Basic Name": "Historical missing owner", Active: "Y" },
      },
    ],
    [
      "assignments",
      "historical-orphan-assignment",
      {
        id: "historical-orphan-assignment",
        teacher: orphan,
        target: "1A",
        targetRef: "browser-class",
        subject: "EL",
      },
    ],
  ])
    await deployDb
      .prepare(
        "INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        "synthetic-school",
        versionId,
        scope,
        rowId,
        1,
        JSON.stringify(value),
      )
      .run();
  await test("real Contacts identities and qualified labels survive two versions and historical inactive references", async () => {
    await page.goto(origin + "/deploy/", { waitUntil: "domcontentloaded" });
    await page.locator("#version").waitFor();
    await page.locator("#version").selectOption(versionId);
    await page.waitForFunction(
      (id) => current === id && !refreshing,
      versionId,
    );
    const snapshot = await page.evaluate(() => structuredClone(v()));
    const names = snapshot.teachers
      .filter((row) => eligible.includes(row.id))
      .map((row) => row.name)
      .sort();
    assert.deepEqual(names, [
      "Synthetic Twin (FAJT) (Two)",
      "Synthetic Twin (One)",
    ]);
    assert.deepEqual(
      snapshot.assignments.find((row) => row.id === history.id),
      history,
    );
    assert.equal(snapshot.teacherNotes[inactive], "Retained dated reference");
    const ordinary = snapshot.teachers.find((row) => row.id === staffId);
    assert.equal(ordinary.teachingEligibility.state, "eligible");
    assert.equal(ordinary.profile.Role, "");
    assert.equal(ordinary.profile["EO Appt Level"], "");
    assert.equal(ordinary.quality, "unavailable");
    const exported = await page.evaluate(
      async (id) =>
        GSISV1.request(
          "deploy",
          "/export?versionId=" + encodeURIComponent(id) + "&scope=IP",
        ),
      versionId,
    );
    const sheet = exported.sheets.TeachingAssignments;
    assert(
      sheet.rows.some(
        (row) => row[sheet.columns.indexOf("Staff ID")] === inactive,
      ),
    );
    assert.equal(
      snapshot.teachers.find((row) => row.id === inactive).active,
      true,
      "Explicit version Active=Y is displayed consistently with planning choices.",
    );
    for (const id of [inactive, nonEO, mk, unknown])
      assert.notEqual(
        snapshot.teachers.find((row) => row.id === id).teachingEligibility
          .state,
        "eligible",
      );
    await page.locator("#version").selectOption(versions[1].versionId);
    await page.waitForFunction(
      (id) => current === id && !refreshing,
      versions[1].versionId,
    );
    assert.deepEqual(
      await page.evaluate(
        (ids) =>
          v()
            .teachers.filter((row) => ids.includes(row.id))
            .map((row) => row.name)
            .sort(),
        eligible,
      ),
      names,
    );
    await page.locator("#version").selectOption(versionId);
    await page.waitForFunction(
      (id) => current === id && !refreshing,
      versionId,
    );
    await page.reload();
    await page.locator("#version").waitFor();
    await page.locator("#version").selectOption(versionId);
    await page.waitForFunction(
      (id) => current === id && !refreshing,
      versionId,
    );
  });
  await test("served IP, FT and TG pickers use version planning eligibility while keeping historical chips", async () => {
    assert.match(
      await page.locator("#content").innerText(),
      /Dated relief teacher/,
    );
    for (const [target, subject] of [
      ["1A", "EL"],
      ["1A", "FT"],
      [groupId, "Math"],
    ]) {
      const button = page.locator(
        '[data-target="' + target + '"][data-sub="' + subject + '"]',
      );
      await button.click();
      const selector = page.getByLabel(
        "Teacher for " + target + " " + subject,
        { exact: true },
      );
      const choices = await selector
        .locator("option")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.value).filter(Boolean),
        );
      const expectedChoices = target === "1A" && subject === "EL"
        ? choicesExpected.filter(id => ![inactive, nonEO].includes(id)) : choicesExpected;
      assert.deepEqual(choices.sort(), expectedChoices.slice().sort());
      await page.locator(".search-select[open] input").press("Escape");
      await page.locator("#refresh").click();
      await page.waitForFunction(() => !refreshing);
    }
    await page.screenshot({
      path: join(evidence, "deploy-pickers-desktop.png"),
    });
    await page
      .getByRole("button", { name: "HR Settings", exact: true })
      .click();
    for (const [name, headers] of [
      ["Membership", ["Staff ID", "TTb Name", "Role", "Memberships"]],
    ]) {
      const report = page.locator("#content table[data-contacts-reference]:not([data-role-membership])");
      for (let render = 0; render < 2; render++) {
        await page.getByRole("button", { name, exact: true }).click();
        if (name === "Membership") {
          const section = page.locator("[data-staff-memberships]");
          if (!(await section.evaluate(node => node.open))) await section.locator(":scope > summary").click();
          assert.equal(await page.locator("table[data-role-membership]").count(), 1, "The editable role matrix is separate from individual staff memberships");
        }
        await page.waitForFunction(
          () =>
            document
              .querySelector("#content table[data-contacts-reference]:not([data-role-membership])")
              ?.querySelectorAll("thead .gsis-core-sort").length === 4,
        );
        const headerCells = report.locator("thead tr").first().locator("th");
        assert.equal(await headerCells.count(), 4);
        assert.deepEqual(
          await headerCells.evaluateAll((nodes) =>
            nodes.map((node) => {
              const copy = node.cloneNode(true);
              copy
                .querySelectorAll(
                  ".gsis-core-sort,[data-core-resize],.resize-grip",
                )
                .forEach((control) => control.remove());
              return copy.textContent.trim();
            }),
          ),
          headers,
        );
        assert.equal(
          await report.locator(".sort-button,.member-sort").count(),
          0,
          "Only shared Core owns report sorting",
        );
        for (let column = 0; column < 4; column++) {
          assert.equal(
            await headerCells.nth(column).locator("button").count(),
            1,
            "One sort control per column after every render",
          );
          assert.equal(
            await headerCells
              .nth(column)
              .locator(".gsis-core-sort")
              .getAttribute("aria-label"),
            "Sort " + headers[column],
          );
        }
        assert.equal(
          await report.locator("thead .gsis-core-filter").count(),
          1,
        );
        assert.equal(
          await report.locator("thead .gsis-core-filter input").count(),
          4,
        );
      }
      const sort = report.getByRole("button", {
        name: "Sort Staff ID",
        exact: true,
      });
      const readIds = () =>
        report
          .locator("tbody tr")
          .evaluateAll((nodes) => nodes.map((row) => row.cells[0].textContent));
      await sort.click();
      const ascending = await readIds();
      assert(ascending.length > 1);
      assert.deepEqual(
        ascending,
        [...ascending].sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
        ),
      );
      await sort.click();
      assert.deepEqual(
        await readIds(),
        ascending.slice().reverse(),
        "The single Core sorter changes real report row order",
      );
      const reportRows = await report
        .locator("tbody tr")
        .evaluateAll((nodes) =>
          nodes.map((row) => [...row.cells].map((cell) => cell.textContent)),
        );
      assert(
        reportRows.some(
          (row) =>
            row[0] === nonEO &&
            row[2] === "Teacher",
        ),
        name + " reports this version's Role by permanent Staff ID",
      );
      assert.equal(
        await report
          .locator("tbody input,tbody select")
          .count(),
        0,
      );
      assert.equal(
        await report.locator("tbody textarea").count(),
        name === "Membership" ? await report.locator("tbody tr").count() : 0,
        "Version-owned Memberships are editable",
      );
      assert.doesNotMatch(
        await report.innerText(),
        /add role|role flags|catalogue manager|create catalogue/i,
      );
    }
    await page.getByRole("button", { name: "Teachers", exact: true }).click();
    await page
      .getByRole("button", { name: "Add existing teacher", exact: true })
      .click();
    const choices = await page
      .locator("#existingTeacher option")
      .evaluateAll((nodes) => nodes.map((n) => n.value).filter(Boolean));
    assert(!choices.some((id) => [inactive, nonEO, mk, unknown].includes(id)),
      "Already present active version staff are not offered as Add existing; MK and unknown remain excluded.");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.locator(".show-inactive-toggle input").check();
    assert.match(
      await page.locator('[data-roster-teacher="' + unknown + '"]').innerText(),
      /Activity unknown/,
    );
    assert.doesNotMatch(
      await page.locator('[data-roster-teacher="' + unknown + '"]').innerText(),
      /\bInactive\b/,
    );
    assert.equal(
      await page.locator('[data-roster-teacher="' + inactive + '"]').count(),
      1,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: join(evidence, "deploy-teachers-narrow.png"),
    });
    await page.setViewportSize({ width: 1440, height: 960 });
  });
  await test("HR retains references, separates accepted capacity from planning choices, and preserves Offload classification", async () => {
    const failures = [];
    for (const [id, label] of [
      [orphan, "Accepted capacity inputs unavailable"],
      [nonEO, "Accepted capacity excludes teaching workload"],
      [mk, "Accepted capacity excludes teaching workload"],
      [proposalOnly, "Accepted capacity excludes teaching workload"],
    ]) {
      const row = page.locator('[data-roster-teacher="' + id + '"]');
      if ((await row.count()) !== 1)
        failures.push("Missing retained HR row: " + id);
      else if (!(await row.innerText()).includes(label))
        failures.push("Missing status: " + id);
    }
    assert.equal(
      await page
        .locator('[data-roster-teacher="' + unreferenced + '"]')
        .count(),
      1,
      "An active version teacher is not hidden solely because accepted EO is false.",
    );
    await page.locator(".show-inactive-toggle input").uncheck();
    assert.equal(
      await page.locator('[data-roster-teacher="' + inactive + '"]').count(),
      1,
      "The saved explicit version Active=Y remains visible with Show inactive off.",
    );
    if (
      (await page.locator('[data-roster-teacher="' + orphan + '"]').count()) !==
      1
    )
      failures.push("Active historical orphan lost when Show inactive is off");
    const absentChoices = await page.evaluate(
      (ids) =>
        v()
          .teachers.filter((t) => ids.includes(t.id) && eligibleTeacher(t))
          .map((t) => t.id),
      [orphan, nonEO, mk, proposalOnly, unreferenced],
    );
    assert.deepEqual(absentChoices.sort(), [nonEO, proposalOnly, unreferenced].sort(),
      "Historical orphan and MK are unavailable, while version-active ordinary teachers need no EO approval.");
    assert.equal(
      await page.evaluate(
        (id) =>
          v().assignments.some(
            (a) => a.teacher === id && a.id === "historical-orphan-assignment",
          ),
        orphan,
      ),
      true,
    );
    await page.getByRole("button", { name: "Offload", exact: true }).click();
    const staffTag = page
      .locator("tr")
      .filter({
        has: page.locator(
          '[data-prop="source"] option:checked[value="Staff tag"]',
        ),
      })
      .first();
    const staffChoices = await staffTag
      .locator('[data-prop="match"] option')
      .evaluateAll((nodes) => nodes.map((n) => n.value));
    if (!staffChoices.includes("Teacher"))
      failures.push("Offload Staff tag lost accepted Teacher value");
    assert(!staffChoices.includes("P") && !staffChoices.includes("MK"));
    const roleChoices = await page
      .locator('[data-rule="role-hod-sm"][data-prop="match"] option')
      .evaluateAll((nodes) => nodes.map((n) => n.value));
    for (const value of ["Teacher", "P", "MK"])
      assert(
        roleChoices.includes(value),
        "Unchanged Role options retain " + value,
      );
    assert.deepEqual(failures, []);
  });
  await test("Contacts scoped manager and linked self receive completed privacy-filtered native views", async () => {
    const manager = await suite.seedAccount("projection-browser-manager", {
        capabilities: ["contacts.powerUser"],
      }),
      self = await suite.seedAccount("projection-browser-self", {
        staffId,
        capabilities: [],
      });
    async function login(user) {
      await context.addCookies([
        {
          name: "__Host-gsis_session",
          value: user.token,
          domain: "gsis.example.invalid",
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await page.goto(origin + "/contacts/");
    }
    await login(manager);
    await page.locator("#dataTab").click();
    await cell("EXT").waitFor();
    assert.equal(await cell("Mobile No").isEditable(), true);
    assert.equal(await cell("EXT").isEditable(), true);
    assert.equal(
      await page.evaluate(() => GSISV1.capable("core.admin")),
      false,
    );
    await login(self);
    await page.locator('.navbar [data-page="diy"]').click();
    await page
      .locator('#diyGrid [data-person="' + staffId + '"]')
      .first()
      .waitFor();
    assert.equal(
      await page
        .locator("#diyGrid [data-person]")
        .evaluateAll(
          (nodes) => new Set(nodes.map((n) => n.dataset.person)).size,
        ),
      1,
    );
    assert.equal(
      await page.locator('#diyGrid [aria-label="Mobile No"]').isEditable(),
      true,
    );
    assert.equal(
      await page.locator('#diyGrid [aria-label="EXT"]').isEditable(),
      false,
    );
    assert.deepEqual(errors, []);
    assert(
      egress.every((url) => url === "https://accounts.google.com/gsi/client"),
      "Only the inherited blocked Google sign-in script may attempt external loading",
    );
  });
  await context.unrouteAll({ behavior: "wait" });
  await context.close();
} finally {
  await browser?.close();
  await suite.close();
  const elapsedMs = Math.round(performance.now() - started);
  await writeFile(
    join(evidence, "results.json"),
    JSON.stringify(
      {
        groups: passed,
        elapsedMs,
        results,
        errors,
        egress,
        source:
          "actual local nine-Worker owner services and built Chromium; synthetic identities; no live/runtime UAT claim",
      },
      null,
      2,
    ),
  );
  console.log(
    passed +
      " Contacts projection browser groups passed in " +
      elapsedMs +
      "ms",
  );
}
