import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { defaults, applyEdits } from "../v1/services/deploy/model.mjs";
import { policy } from "../v1/services/deploy/service.mjs";
import { fixture } from "./v1-core-authority.mjs";
const read = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");
const doc = {
  ...defaults(),
  id: "version-test",
  revision: 4,
  name: "Plan",
  teachers: [
    {
      id: "staff-a",
      name: "Alpha",
      active: true,
      groups: [],
      profile: { "Basic Name": "Alpha", "EO Appt Level": "EO", Active: "Y" },
    },
  ],
};
doc.loads["1"].EL = 10;
doc.organisations.comm = [
  {
    id: "comm-a",
    name: "Committee",
    slots: ["staff-a", "", "", ""],
    leadershipSchema: 1,
  },
];
doc.duties = [
  {
    id: "duty-a",
    name: "Gate",
    category: "Before School",
    start: "07:00",
    end: "07:30",
    days: [0],
    description: "Gate duty",
    teachers: { 0: "staff-a" },
  },
];
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
  executablePath: process.env.GSIS_BROWSER_EXECUTABLE || undefined,
});
try {
  const page = await browser.newPage();
  // The production adapter is an ES module sharing the real period policy.
  // Serve the adapter and its dependencies on one intercepted origin.
  const origin = "https://deploy-settings.example.invalid";
  const modules = new Map(await Promise.all([
    "v1/web/shared/deploy-ui-tables.js",
    "v1/web/shared/deploy-loads.mjs",
    "v1/web/shared/deploy-workload-settings-ui.js",
  ].map(async path => ["/v1/shared/" + path.split("/").at(-1), await read(path)])));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: '<main id="content"></main>' });
    const body = modules.get(url.pathname);
    if (body === undefined) return route.abort();
    return route.fulfill({ contentType: "application/javascript", body });
  });
  await page.goto(origin);
  await page.evaluate((d) => {
    window.doc = d;
    window.isAdmin = true;
    window.GSISV1 = {
      capable: (cap) => (cap === "admin" ? window.isAdmin : true),
    };
  }, doc);
  for (const path of [
    "shared/teaching-rules.js",
    "shared/workload.js",
    "shared/planning.js",
    "shared/asc-export.js",
  ])
    await page.addScriptTag({ content: await read(path) });
  await page.addScriptTag({ type: "module", url: origin + "/v1/shared/deploy-ui-tables.js" });
  await page.waitForFunction(() => !!window.GSISDeploySettingTables);
  const cases = await page.evaluate(() => {
    const a = GSISDeploySettingTables,
      make = (view) => a.workbook(doc, view, "school"),
      check = (book, view, d = doc) => a.validate(book, d, view, "school"),
      result = {};
    for (const view of [
      "Load Settings",
      "Subject Type",
      "Fortnight Split",
      "Committee Settings",
      "Committees",
      "Duty",
      "Workload Settings",
      "ASC Export",
    ]) {
      const book = make(view);
      if (check(book, view).length)
        throw Error("Unchanged " + view + " was not a no-op");
    }
    let book = make("Load Settings");
    book.sheets.Loads.rows.find((r) => r[0] === "1" && r[1] === "EL")[2] = 10.5;
    result.load = check(book, "Load Settings");
    const error = (fn) => {
      try {
        fn();
        return false;
      } catch {
        return true;
      }
    };
    result.stale = error(() =>
      check(book, "Load Settings", { ...doc, revision: 5 }),
    );
    book.metadata["School ID"] = "other";
    result.school = error(() => check(book, "Load Settings"));
    book = make("Load Settings");
    book.sheets.Loads.rows[0][2] = -1;
    result.negative = error(() => check(book, "Load Settings"));
    book = make("Load Settings");
    book.sheets.Loads.rows
      .slice(0, 33)
      .forEach((row) => (row[2] = row[2] === 2 ? 3 : 2));
    result.bound = error(() => check(book, "Load Settings"));
    book = make("Committee Settings");
    book.sheets.Groups.rows[0][1] = "Renamed Committee";
    result.group = check(book, "Committee Settings");
    book.sheets.Members.rows[0][2] = "foreign-staff";
    result.foreignStaff = error(() => check(book, "Committee Settings"));
    book = make("Subject Type");
    book.sheets.Subjects.rows.find((r) => r[0] === "EL")[1] = "tg";
    window.isAdmin = false;
    result.nonAdminSubject = check(book, "Subject Type");
    window.isAdmin = true;
    result.subject = check(book, "Subject Type");
    book = make("Fortnight Split");
    book.sheets.Fortnight.rows.find((r) => r[0] === "1" && r[1] === "EL")[3] =
      3;
    result.fortnight = check(book, "Fortnight Split");
    book = make("Duty");
    book.sheets.Duties.rows[0][3] = "07:10";
    result.duty = check(book, "Duty");
    book.sheets.Duties.rows[0][4] = "07:05";
    result.interval = error(() => check(book, "Duty"));
    book = make("Workload Settings");
    book.sheets.Workload.rows.find((r) => r[0] === "EL")[1] = "Non-teaching";
    result.workload = check(book, "Workload Settings");
    book = make("ASC Export");
    book.sheets.Settings.rows.find((r) => r[0] === "schoolName")[1] =
      "Synthetic school";
    result.asc = check(book, "ASC Export");
    book.sheets.Periods.rows[0][4] = "06:59";
    result.bell = error(() => check(book, "ASC Export"));
    return result;
  });
  assert.equal(applyEdits(doc, cases.load).loads["1"].EL, 10.5);
  assert.equal(
    applyEdits(doc, cases.group).organisations.comm[0].name,
    "Renamed Committee",
  );
  assert.deepEqual(
    cases.nonAdminSubject,
    cases.subject,
    "Subject Type follows Deploy edit, without an additional Admin condition",
  );
  assert.equal(applyEdits(doc, cases.subject).subjectTypes.EL, "tg");
  assert.equal(applyEdits(doc, cases.fortnight).fortnight['["1","EL"]'].wt, 3);
  assert.equal(applyEdits(doc, cases.duty).duties[0].start, "07:10");
  assert.equal(
    applyEdits(doc, cases.workload).workload.categories.EL,
    "Non-teaching",
  );
  assert.equal(
    applyEdits(doc, cases.asc).ascExport.schoolName,
    "Synthetic school",
  );
  for (const name of [
    "stale",
    "school",
    "negative",
    "bound",
    "foreignStaff",
    "interval",
    "bell",
  ])
    assert.equal(cases[name], true, name + " rejects before confirmation");
  const descriptor = policy("POST", "/change", {
    versionId: doc.id,
    edits: cases.subject,
  });
  assert.equal(descriptor.action, "deploy.edit");
  for (const [admin, smc, eo, outcome] of [
    [true, false, false, "allow"],
    [false, true, true, "allow"],
    [false, true, false, "deny"],
    [false, false, true, "deny"],
  ]) {
    const f = fixture();
    f.state.account.globalAdmin.value = admin;
    f.state.facts.smc.value = smc;
    f.state.facts.eo.value = eo;
    const request = { ...f.request, action: descriptor.action };
    const decision = await f.authority.resolveAuthority(request, f.context);
    assert.equal(
      decision.outcome,
      outcome,
      "current Core capability matrix for Subject Type import",
    );
    if (!admin && outcome === "allow") {
      f.state.facts.eo.value = false;
      f.bumpContacts();
      assert.equal(
        (await f.authority.revalidateAuthority(request, decision, f.context))
          .outcome,
        "deny",
        "loss of EO defeats prior edit allowance",
      );
    }
  }
  // Exercise the actual dialog, XLSX parser and existing lease/change/receipt sequence.
  const ui = await browser.newPage(), files = new Map(modules);
  files.set("/v1/shared/workbooks.mjs", await read("v1/web/shared/workbooks.mjs"));
  files.set(
    "/roster/jszip.min.js",
    await read("roster-update/public/jszip.min.js"),
  );
  await ui.route("https://settings.invalid/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: files.has(path) ? "text/javascript" : "text/html",
      body:
        files.get(path) ||
        '<select id="version"><option value="version-test">Plan</option></select><main id="content" data-view="Load Settings"><table></table></main>',
    });
  });
  await ui.goto("https://settings.invalid/deploy/");
  await ui.evaluate((d) => {
    window.doc = d;
    window.calls = [];
    window.GSISCoreTables = {
      register(selector, contract) {
        if (document.querySelector(selector)) window.adapter = contract;
      },
    };
    window.GSISV1 = {
      capable: () => true,
      getSession: async () => ({
        schoolId: "school",
        user: { accountId: "editor" },
      }),
      request: async (domain, path, options) => {
        calls.push({ path, body: options?.body });
        if (path === "/bootstrap") return { current: structuredClone(doc) };
        if (path === "/lease") return { fence: 23 };
        if (path === "/change") throw Error("Reply lost");
        if (path === "/receipt") return { state: "committed", saved: true };
        throw Error(path);
      },
    };
  }, doc);
  await ui.addScriptTag({ type: "module", url: "/v1/shared/deploy-ui-tables.js" });
  await ui.waitForFunction(() => !!window.GSISDeploySettingTables);
  const encoded = await ui.evaluate(async () => {
    const book = GSISDeploySettingTables.workbook(
      doc,
      "Load Settings",
      "school",
    );
    const cell = book.sheets.Loads.rows.find(
      (r) => r[0] === "1" && r[1] === "EL",
    );
    const { encodeWorkbook } = await import("/v1/shared/workbooks.mjs");
    cell[2] = -1;
    const bad = Array.from(await encodeWorkbook(book));
    cell[2] = 14.5;
    return { bad, good: Array.from(await encodeWorkbook(book)) };
  });
  await ui.evaluate(() => adapter.importAll());
  await ui.locator("dialog[open] input[type=file]").setInputFiles({
    name: "bad.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(encoded.bad),
  });
  await ui.waitForFunction(() =>
    document.querySelector(".gsis-import-invalid"),
  );
  assert.equal(
    await ui
      .getByRole("button", { name: "Confirm atomic import" })
      .isDisabled(),
    true,
  );
  assert.equal(
    await ui.evaluate(() => calls.some((c) => c.path === "/change")),
    false,
  );
  await ui.locator("dialog[open] input[type=file]").setInputFiles({
    name: "good.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(encoded.good),
  });
  await ui.waitForFunction(() =>
    [...document.querySelectorAll("dialog button")].some(
      (b) => b.textContent === "Confirm atomic import" && !b.disabled,
    ),
  );
  await ui.getByRole("button", { name: "Confirm atomic import" }).click();
  await ui.waitForFunction(() =>
    document
      .querySelector("dialog[open] [role=status]")
      .textContent.includes("retained"),
  );
  const submitted = await ui.evaluate(
    () => calls.find((c) => c.path === "/change").body,
  );
  assert.equal(submitted.revision, 4);
  assert.equal(submitted.leaseFence, 23);
  assert.equal(submitted.scope, "meta");
  assert.equal(applyEdits(doc, submitted.edits).loads["1"].EL, 14.5);
  await ui.getByRole("button", { name: "Close", exact: true }).click();
  await ui.evaluate(() => adapter.importAll());
  assert.equal(
    await ui.locator("dialog[open] input[type=file]").isDisabled(),
    true,
  );
  await ui
    .getByRole("button", { name: "Check original import receipt" })
    .click();
  await ui.waitForFunction(() =>
    document
      .querySelector("dialog[open] [role=status]")
      .textContent.includes("committed"),
  );
  assert.equal(
    await ui.evaluate(() => calls.filter((c) => c.path === "/change").length),
    1,
  );
  assert.equal(
    await ui.evaluate(
      () => calls.find((c) => c.path === "/receipt").body.operationId,
    ),
    submitted.operationId,
  );
  await ui.close();
  console.log(
    "PASS Deploy additional workbook schemas produce existing owner operations; unchanged imports no-op; stale/school/value/foreign identity/interval negatives and actual Core approved edit matrix",
  );
} finally {
  await browser.close();
}
