import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { decodeWorkbook } from "../v1/web/shared/workbooks.mjs";
import { productSuite, origin } from "./v1-product/suite.mjs";

// Built viewport and real local owning Workers/D1. Only the login identity is
// synthetic. All network traffic is routed locally; no provider is contacted.
const started = performance.now();
const evidence = new URL(
  "../deliverables/v1/evidence/contacts-direct-authority/",
  import.meta.url,
);
await mkdir(evidence, { recursive: true });
const suite = await productSuite({
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-direct-authority.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});
let browser,
  passed = 0;
try {
  const admin = await suite.seedAccount("direct-authority-admin");
  const db = await suite.db("contacts");
  const count = async (table) =>
    (await db.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n;
  assert.equal(await count("contacts_catalogues"), 0);
  const owner = await suite.request(admin, "contacts", "/save-data", {
    method: "POST",
    body: {
      operationId: "direct-authority-owner-role-p",
      changes: [],
      additions: [
        {
          id: "direct-owner-temporary",
          values: { "Basic Name": "Synthetic Direct Owner", Role: "P" },
        },
      ],
    },
  });
  console.log(
    "Owner Role P result " +
      JSON.stringify({
        status: owner.status,
        code: owner.body?.error?.code,
        receipt: owner.body?.data?.receipt?.state,
        staff: await count("contacts_staff"),
      }),
  );

  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath:
      process.env.GSIS_BROWSER_EXECUTABLE ||
      process.env.ROSTER_TEST_CHROMIUM ||
      undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
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
  const errors = [],
    egress = [],
    writes = [];
  await context.route("**/*", async (route) => {
    const input = route.request();
    if (!input.url().startsWith(origin + "/")) {
      egress.push(input.url());
      return route.abort();
    }
    if (
      input.method() === "POST" &&
      new URL(input.url()).pathname === "/api/contacts/save-data"
    ) {
      writes.push(input.postDataJSON());
    }
    const response = await suite.mf.dispatchFetch(input.url(), {
      method: input.method(),
      headers: await input.allHeaders(),
      body: ["GET", "HEAD"].includes(input.method())
        ? undefined
        : input.postDataBuffer(),
    });
    const headers = Object.fromEntries(response.headers);
    delete headers["transfer-encoding"];
    const bytes = Buffer.from(await response.arrayBuffer());
    await route.fulfill({ status: response.status, headers, body: bytes });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/contacts/", { waitUntil: "domcontentloaded" });
  await page.locator("#dataTab").click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#addContactRow").disabled &&
      document.querySelector("#dataGrid table"),
  );
  await page.locator("#addContactRow").click();
  const newRow = page.locator('#dataGrid [aria-label="Basic Name"]').first();
  await newRow.fill("Synthetic Direct Browser");
  await page.locator('#dataGrid [aria-label="Role"]').first().fill("P");
  const [saved] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/contacts/save-data" &&
        response.request().method() === "POST",
    ),
    page.locator("#saveData").click(),
  ]);
  const savedBody = await saved.json();
  console.log(
    "Browser Role P result " +
      JSON.stringify({
        status: saved.status(),
        code: savedBody?.error?.code,
        receipt: savedBody?.data?.receipt?.state,
        staff: await count("contacts_staff"),
      }),
  );
  assert.equal(writes.length, 1, "The viewport must submit one owner command");
  assert.equal(writes[0].additions[0].values.Role, "P");
  assert.deepEqual(errors, []);
  assert.equal(await count("contacts_catalogues"), 0);
  // Compare both genuine responses only after both paths ran. A fixture/startup
  // failure throws normally; it is never treated as the expected product defect.
  assert.deepEqual(
    [
      owner.status,
      owner.body?.data?.receipt?.state,
      saved.status(),
      savedBody?.data?.receipt?.state,
    ],
    [200, "committed", 200, "committed"],
    "Both owner and built viewport must save Role P without catalogue setup",
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#dataTab").click();
  await page.locator('#dataGrid [aria-label="Basic Name"]').first().waitFor();
  const rows = (await suite.request(admin, "contacts", "/data")).body.data.rows;
  assert.equal(rows.length, 2);
  assert(rows.every((row) => row.values[5] === "P"));
  passed++;
  console.log(
    "PASS owner and built viewport direct Role P with zero catalogues",
  );
  const staffId = Object.values(savedBody.data.mapping)[0];
  const cell = (label) =>
    page.locator(
      '#dataGrid [data-person="' + staffId + '"][aria-label="' + label + '"]',
    );
  const save = async () => {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/contacts/save-data" &&
          r.request().method() === "POST",
      ),
      page.locator("#saveData").click(),
    ]);
    const data = await response.json();
    assert.equal(response.status(), 200, JSON.stringify(data));
    assert.equal(data.data.receipt.state, "committed");
    await page.waitForFunction(
      () =>
        !document.querySelector("#dataGrid").inert &&
        !document.querySelector("#saveData").disabled,
    );
    assert.equal(await page.locator("#dataStatus").textContent(), "Saved");
    return data.data;
  };
  const expectedLabels = [
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
  for (const label of expectedLabels)
    assert.equal(await cell(label).count(), 1, label);
  await cell("EO Appt Level").fill("Custom appointment");
  await cell("EXT").fill("0009");
  assert.equal(
    await cell("EO Appt Level").inputValue(),
    "Custom appointment",
    "Another-cell edit must never recompute EO appointment",
  );
  await cell("Role").fill("Research mentor");
  await cell("Employment Modifier").fill("BT\n4/5");
  await cell("Subject Modifier").fill("Art\nMusic");
  await cell("School Section").selectOption("Primary");
  await cell("Personnel Category").fill("Teaching");
  await cell("Employment Arrangement").fill("Full-time");
  await cell("Employment Status").fill("Permanent");
  await cell("Memberships").fill("Team Alpha\nTeam Beta");
  await cell("General Aliases").fill("Prior Name\nSecond Alias");
  await cell("Name Suffix").fill("West");
  await cell("Profile Completion").selectOption("provisional");
  const preview = await cell("TTb Name").inputValue();
  await save();
  assert.equal(
    await cell("TTb Name").inputValue(),
    preview,
    "Preview and owner-derived saved display agree",
  );
  assert.equal(await cell("EO Appt Level").inputValue(), "Custom appointment");
  assert.equal(await cell("Memberships").inputValue(), "Team Alpha\nTeam Beta");
  assert.equal(
    await cell("General Aliases").inputValue(),
    "Prior Name\nSecond Alias",
  );
  const persisted = await suite.request(admin, "contacts", "/staff/" + staffId);
  assert.equal(persisted.body.data.fields.role.value, "Research mentor");
  for (const key of ["eo", "smc", "schoolLeader"])
    assert.notEqual(persisted.body.data.fields[key]?.state, "accepted");
  passed++;
  console.log(
    "PASS all25 controls share one draft and explicit EO appointment survives other edits",
  );

  await page.screenshot({
    path: new URL("direct-role-appointment.png", evidence).pathname,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-contact-details="' + staffId + '"]').click();
  const details = page.getByRole("dialog", {
    name: "Edit contact details",
    exact: true,
  });
  await details
    .getByLabel("EO Appt Level", { exact: true })
    .fill("Detail appointment");
  await details.getByLabel("Name Suffix", { exact: true }).fill("East");
  await details.getByLabel("Name Suffix", { exact: true }).press("Tab");
  assert(
    await details.evaluate((element) =>
      element.contains(document.activeElement),
    ),
    "Keyboard focus stays in the native details workflow",
  );
  await page.screenshot({
    path: new URL("direct-details-narrow.png", evidence).pathname,
    fullPage: true,
  });
  const [detailResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/contacts/save-data" &&
        r.request().method() === "POST",
    ),
    details.getByRole("button", { name: "Save changes", exact: true }).click(),
  ]);
  assert.equal(detailResponse.status(), 200, await detailResponse.text());
  await page.waitForFunction(() => !document.querySelector("#dataGrid").inert);
  assert.equal(await cell("EO Appt Level").inputValue(), "Detail appointment");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  );
  passed++;
  console.log(
    "PASS narrow keyboard-accessible details save through the same owner draft",
  );

  const manager = await suite.seedAccount("direct-authority-manager", {
    capabilities: ["contacts.powerUser"],
  });
  await context.addCookies([
    {
      name: "__Host-gsis_session",
      value: manager.token,
      domain: "gsis.example.invalid",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(origin + "/contacts/", { waitUntil: "domcontentloaded" });
  // The previous group leaves the viewport narrow. Use the actual mobile
  // menu rather than clicking the CSS-hidden desktop navigation bar.
  await page.locator("#mobileMenu").click();
  await page.locator('[data-mobile-page="data"]').click();
  await page.waitForFunction(
    () => !document.querySelector("#addContactRow").disabled,
  );
  assert.equal(await page.evaluate(() => GSISV1.capable("core.admin")), false);
  await page.locator("#addContactRow").click();
  const draftName = page.locator('#dataGrid [aria-label="Basic Name"]').first();
  const draftRole = page.locator('#dataGrid [aria-label="Role"]').first();
  await draftName.fill("Synthetic Direct Manager");
  await draftRole.fill("Invalid,role");
  const countBeforeInvalid = await count("contacts_staff");
  await page.evaluate(() => document.querySelector("#saveData").onclick());
  assert.equal(await count("contacts_staff"), countBeforeInvalid);
  assert.equal(await draftName.inputValue(), "Synthetic Direct Manager");
  assert.equal(await draftRole.isEditable(), true);
  assert.notEqual(await page.locator("#dataStatus").textContent(), "Saved");
  await draftRole.fill("P");
  const longTags = page
    .locator('#dataGrid [aria-label="Employment Modifier"]')
    .first();
  await longTags.fill(
    Array.from({ length: 32 }, (_, i) => "Long tag " + i).join("\n"),
  );
  await page.evaluate(() => document.querySelector("#saveData").onclick());
  assert.equal(await count("contacts_staff"), countBeforeInvalid);
  assert.equal(await longTags.isEditable(), true);
  assert.match(await page.locator("#toast").textContent(), /160|long|TTb/i);
  assert.equal(await page.locator("#toast").isVisible(), true);
  assert.match(
    await longTags
      .locator("xpath=ancestor::tr")
      .locator("[data-contact-preview-error]")
      .textContent(),
    /160/,
  );
  await longTags.fill("");
  await save();
  assert.equal(await count("contacts_staff"), countBeforeInvalid + 1);
  assert.equal(await count("contacts_catalogues"), 0);
  assert.equal(
    await page.locator('script[src*="contacts-catalogues"]').count(),
    0,
  );
  assert.equal(
    await page.locator("[data-facts],[data-definitions]").count(),
    0,
  );
  assert.deepEqual(errors, []);
  assert(
    egress.every((url) => url === "https://accounts.google.com/gsi/client"),
  );
  passed++;
  console.log(
    "PASS Contacts Power User corrects an editable invalid draft then saves Role P without setup",
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  const controls = page
    .locator("#data")
    .getByRole("group", { name: "Table controls", exact: true });
  await controls.getByLabel("Excel export scope").selectOption("all");
  const downloaded = page.waitForEvent("download");
  await controls
    .getByRole("button", { name: "Export Excel", exact: true })
    .click();
  const exported = await readFile(await (await downloaded).path());
  const dom = new JSDOM();
  let edited;
  try {
    const workbook = await decodeWorkbook(exported, {
      Zip: JSZip,
      XMLParser: dom.window.DOMParser,
    });
    assert.equal(workbook.metadata.Schema, "gsis.contacts.grid.v2");
    assert.deepEqual(workbook.sheets.Contacts.columns, [
      "Staff ID",
      ...expectedLabels,
    ]);
    assert.deepEqual(
      workbook.sheets.Baseline.rows,
      workbook.sheets.Contacts.rows,
    );
    const original = workbook.sheets.Contacts.rows.find(
      (row) => row[0] === staffId,
    );
    assert.equal(
      original[workbook.sheets.Contacts.columns.indexOf("Memberships")],
      "Team Alpha\nTeam Beta",
    );
    const archive = await JSZip.loadAsync(exported);
    const parser = new dom.window.DOMParser();
    const structure = parser.parseFromString(
      await archive.file("xl/workbook.xml").async("string"),
      "application/xml",
    );
    const sheet = [...structure.getElementsByTagName("sheet")].find(
      (node) => node.getAttribute("name") === "Contacts",
    );
    const relationships = parser.parseFromString(
      await archive.file("xl/_rels/workbook.xml.rels").async("string"),
      "application/xml",
    );
    const relationship = [
      ...relationships.getElementsByTagName("Relationship"),
    ].find((node) => node.getAttribute("Id") === sheet.getAttribute("r:id"));
    const path = "xl/" + relationship.getAttribute("Target");
    const xml = parser.parseFromString(
      await archive.file(path).async("string"),
      "application/xml",
    );
    const row = [...xml.getElementsByTagName("row")].find(
      (node) => node.querySelector("c is t")?.textContent === staffId,
    );
    assert(row, "The actual owner export contains the permanent Staff ID");
    const cells = [...row.getElementsByTagName("c")];
    const selected =
      cells[
        workbook.sheets.Contacts.columns.indexOf("Memberships")
      ].querySelector("is t");
    selected.textContent = "Import team\nRegional team";
    archive.file(path, new dom.window.XMLSerializer().serializeToString(xml));
    edited = await archive.generateAsync({ type: "nodebuffer" });
  } finally {
    dom.window.close();
  }
  await controls
    .getByRole("button", { name: "Import Excel", exact: true })
    .click();
  const importer = page.getByRole("dialog", {
    name: "Import Contacts workbook",
    exact: true,
  });
  await importer
    .getByLabel("Import Contacts workbook", { exact: true })
    .setInputFiles({
      name: "Contacts-owner-export.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: edited,
    });
  const confirm = importer.getByRole("button", {
    name: "Confirm atomic import",
    exact: true,
  });
  await page.waitForFunction(() =>
    [...document.querySelectorAll("dialog button")].some(
      (button) =>
        button.textContent === "Confirm atomic import" && !button.disabled,
    ),
  );
  const beforeImport = await suite.request(
    manager,
    "contacts",
    "/staff/" + staffId,
  );
  assert.deepEqual(beforeImport.body.data.fields.memberships.value, [
    "Team Alpha",
    "Team Beta",
  ]);
  const [importResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/contacts/save-data" &&
        r.request().method() === "POST",
    ),
    confirm.click(),
  ]);
  assert.equal(importResponse.status(), 200, await importResponse.text());
  assert.deepEqual(importResponse.request().postDataJSON().changes, [
    {
      id: staffId,
      field: "Memberships",
      expected: "Team Alpha\nTeam Beta",
      value: "Import team\nRegional team",
    },
  ]);
  await importer.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#dataTab").click();
  await cell("Memberships").waitFor();
  assert.equal(
    await cell("Memberships").inputValue(),
    "Import team\nRegional team",
  );
  const afterImport = await suite.request(
    manager,
    "contacts",
    "/staff/" + staffId,
  );
  assert.deepEqual(afterImport.body.data.fields.memberships.value, [
    "Import team",
    "Regional team",
  ]);
  assert.equal(
    afterImport.body.data.fields.eoAppointmentLevel.value,
    "Detail appointment",
  );
  assert.deepEqual(errors, []);
  passed++;
  console.log(
    "PASS actual 25-column owner export edits an appended field through native preview and atomic import/reload",
  );
} finally {
  await browser?.close();
  await suite.close();
  console.log(
    `${passed} direct-authority browser groups passed in ${((performance.now() - started) / 1000).toFixed(3)}s`,
  );
}
