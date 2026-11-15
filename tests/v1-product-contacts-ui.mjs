import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import {
  CONTACT_GRID_FIELDS,
  CONTACT_GRID_SCHEMA,
} from "../v1/services/contacts/grid-projection.mjs";
import { previewTTb } from "../v1/contacts/direct-fields.mjs";
const read = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");
const files = new Map(
  await Promise.all(
    [
      "contacts-ui.js",
      "contacts-ui.css",
      "core-table.css",
      "workbooks.mjs",
    ].map(async (n) => ["/v1/shared/" + n, await read("v1/web/shared/" + n)]),
  ),
);
files.set(
  "/roster/jszip.min.js",
  await read("roster-update/public/jszip.min.js"),
);
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
  executablePath: process.env.GSIS_BROWSER_EXECUTABLE || undefined,
});
try {
  const page = await browser.newPage({
      viewport: { width: 1000, height: 650 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://test.invalid/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      contentType: path.endsWith(".css")
        ? "text/css"
        : path.endsWith(".js") || path.endsWith(".mjs")
          ? "text/javascript"
          : "text/html",
      body:
        files.get(path) ||
        '<style>html,body,#app{height:100%;overflow:hidden}.page:not(.active){display:none}</style><div id="app"><section id="signature" class="page active"><details open><summary>Gmail instructions</summary><div style="height:2000px">Retained legacy graphics</div></details></section><section id="data" class="page"><input id="nativeDraft" value="Unsubmitted native edit"></section></div>',
    });
  });
  await page.goto("https://test.invalid/contacts/");
  await page.addStyleTag({ url: "/v1/shared/contacts-ui.css" });
  await page.addStyleTag({ url: "/v1/shared/core-table.css" });
  await page.evaluate(({ fields, gridSchema }) => {
    const values = fields.map(
      (field) =>
        ({
          "Basic Name": "Alice",
          "TTb Name": "Alice",
          "Mobile No": "123",
          "EO Appt Level": "EO",
          "Profile Completion": "provisional",
        })[field] ?? "",
    );
    window.data = {
      fields,
      gridSchema,
      rows: [
        {
          id: "staff-one",
          staffId: "staff-one",
          revision: 3,
          values,
          computed: gridSchema.fields.map((field) => !field.editable),
        },
      ],
      editable: true,
      revision: 3,
    };
    window.calls = [];
    window.failSave = true;
    window.nativeState = { user: { accountId: "owner" }, people: [] };
    window.signatureInvalidations = 0;
    window.GSISV1 = {
      capable: () => true,
      getSession: async () => ({
        schoolId: "gsps",
        user: { accountId: "owner" },
      }),
      request: async (domain, path, options) => {
        window.calls.push({ path, body: options?.body });
        if (path === "/data") return structuredClone(window.data);
        if (path === "/save-data") {
          if (window.failSave) throw Error("Response lost");
          return { saved: true };
        }
        throw Error(path);
      },
    };
  }, { fields: CONTACT_GRID_FIELDS, gridSchema: CONTACT_GRID_SCHEMA });
  await page.addScriptTag({ url: "/v1/shared/contacts-ui.js" });
  await page.addScriptTag({
    content: `GSISContactsEditor.install({get:()=>({state:window.nativeState}),invalidateSignature:()=>{window.signatureInvalidations++;}}, ${JSON.stringify(CONTACT_GRID_SCHEMA)}, ${previewTTb.toString()});`,
  });
  await page.waitForFunction(() =>
    document.documentElement.classList.contains("gsis-contacts-signature"),
  );
  await page.evaluate(() => scrollTo(0, 1000));
  assert(
    (await page.evaluate(() => scrollY)) > 500,
    "expanded signature instructions scroll",
  );
  const model = await page.evaluate(() => {
    const prior = [data.rows[0].id, ...data.rows[0].values],
      changed = [...prior];
    changed[data.fields.indexOf("Mobile No") + 1] = "456";
    const b = {
      metadata: { Schema: data.gridSchema.workbookSchema, "School ID": "gsps" },
      sheets: {
        Contacts: {
          columns: ["Staff ID", ...data.fields],
          rows: [changed],
        },
        Baseline: {
          columns: ["Staff ID", ...data.fields],
          rows: [prior],
        },
      },
    };
    window.book = b;
    return GSISContactsTables.validate(b, data, "gsps");
  });
  assert.deepEqual(model.errors, []);
  assert.deepEqual(model.changes, [
    { id: "staff-one", field: "Mobile No", expected: "123", value: "456" },
  ]);
  const negative = await page.evaluate(() => {
    const clone = () => structuredClone(book),
      v = (b) => GSISContactsTables.validate(b, data, "gsps").errors;
    const changed = clone();
    changed.sheets.Contacts.rows[0][data.fields.indexOf("TTb Name") + 1] =
      "Override derived name";
    const duplicate = clone();
    duplicate.sheets.Contacts.rows.push(duplicate.sheets.Contacts.rows[0]);
    const wrong = clone();
    wrong.metadata["School ID"] = "other";
    const stale = structuredClone(data);
    stale.rows[0].values[data.fields.indexOf("Mobile No")] = "999";
    return [
      v(changed),
      v(duplicate),
      v(wrong),
      GSISContactsTables.validate(book, stale, "gsps").errors,
    ].map((e) => e.length);
  });
  assert(negative.every((n) => n > 0));
  const directFields = await page.evaluate(() => {
    const changed = structuredClone(book);
    changed.sheets.Contacts.rows[0][data.fields.indexOf("EO Appt Level") + 1] =
      "P";
    changed.sheets.Contacts.rows[0][data.fields.indexOf("School Section") + 1] =
      "Primary";
    return GSISContactsTables.validate(changed, data, "gsps");
  });
  assert.deepEqual(directFields.errors, []);
  assert.deepEqual(
    directFields.changes.map((change) => change.field),
    ["Mobile No", "EO Appt Level", "School Section"],
  );
  const legacy = await page.evaluate(() => {
    const old = structuredClone(book);
    old.metadata.Schema = "gsis.contacts.grid.v1";
    for (const sheet of Object.values(old.sheets)) {
      sheet.columns = sheet.columns.slice(0, 18);
      sheet.rows = sheet.rows.map((row) => row.slice(0, 18));
    }
    return GSISContactsTables.validate(old, data, "gsps");
  });
  assert.deepEqual(
    legacy.errors,
    [],
    "the explicit legacy 17-column mapping remains importable",
  );
  assert.deepEqual(
    legacy.changes,
    model.changes,
    "omitted appended fields are unchanged",
  );
  const bounded = await page.evaluate(() => {
    const many = structuredClone(data),
      large = structuredClone(book);
    many.rows = Array.from({ length: 17 }, (_, i) => ({
      ...data.rows[0],
      id: "staff-" + i,
      staffId: "staff-" + i,
    }));
    large.sheets.Baseline.rows = many.rows.map((r) => [r.id, ...r.values]);
    large.sheets.Contacts.rows = many.rows.map((r) => {
      const values = [...r.values];
      values[data.fields.indexOf("Mobile No")] = "456";
      return [r.id, ...values];
    });
    return GSISContactsTables.validate(large, many, "gsps").errors;
  });
  assert(
    bounded.some((error) => error.message.includes("16 staff")),
    "oversized import rejects rather than splitting atomic work",
  );
  const selfService = await page.evaluate(() => {
    const mine = structuredClone(book),
      limited = structuredClone(data);
    const allowed = GSISContactsTables.validate(mine, limited, "gsps", "self");
    mine.sheets.Contacts.rows[0][data.fields.indexOf("Basic Name") + 1] =
      "Rename outside DIY";
    return {
      allowed: allowed.errors,
      denied: GSISContactsTables.validate(mine, limited, "gsps", "self").errors,
    };
  });
  assert.deepEqual(selfService.allowed, []);
  assert(
    selfService.denied.some((error) => error.message.includes("Basic Name")),
    "DIY rejects fields beyond statutory name/mobile",
  );
  // Real XLSX encoding/decoding, explicit confirmation and unknown-operation recovery.
  const bytes = await page.evaluate(async () =>
    Array.from(
      await (await import("/v1/shared/workbooks.mjs")).encodeWorkbook(book),
    ),
  );
  await page.evaluate(() => GSISContactsTables.openImport());
  await page.locator("dialog input[type=file]").setInputFiles({
    name: "Contacts.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(bytes),
  });
  await page.getByRole("button", { name: "Confirm atomic import" }).waitFor();
  await page.waitForFunction(
    () => !document.querySelector("dialog button").disabled,
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll("dialog button")].some(
      (b) => b.textContent === "Confirm atomic import" && !b.disabled,
    ),
  );
  assert.equal(
    await page.evaluate(
      () => calls.filter((c) => c.path === "/save-data").length,
    ),
    0,
    "preview never writes",
  );
  await page.getByRole("button", { name: "Confirm atomic import" }).click();
  await page.waitForFunction(() =>
    document
      .querySelector("dialog [role=status]")
      .textContent.includes("retained"),
  );
  assert.equal(
    await page.locator("dialog input[type=file]").isDisabled(),
    true,
  );
  const operationId = await page.evaluate(
    () =>
      JSON.parse(
        JSON.stringify(calls.find((c) => c.path === "/save-data").body),
      ).operationId,
  );
  assert(operationId);
  assert.equal(
    await page.evaluate(
      () => calls.filter((c) => c.path === "/save-data").length,
    ),
    1,
  );
  await page.reload();
  await page.evaluate(() => {
    window.calls = [];
    window.refreshCalls = [];
    window.wrongReceipt = true;
    window.nativeState = { user: { accountId: "owner" }, people: [] };
    window.signatureInvalidations = 0;
    // The actual guarded native bridge is covered by the built-browser suite.
    // This transport fixture verifies that import delegates refresh to it and
    // honours its retained-draft outcome instead of clicking native Reload.
    window.GSISV1ContactsViews = {
      refresh: async (options) => {
        window.refreshCalls.push(options);
        return {
          directory: "refreshed",
          grid: "retained",
          reason: "Existing native draft retained.",
        };
      },
    };
    window.GSISV1 = {
      capable: () => true,
      getSession: async () => ({
        schoolId: "gsps",
        user: { accountId: "owner" },
      }),
      request: async (domain, path, options) => {
        window.calls.push({ path, body: options?.body });
        if (path === "/save-receipt")
          return {
            saved: true,
            state: "committed",
            mapping: {},
            receipt: {
              state: "committed",
              operationId:
                options.body.operationId + (window.wrongReceipt ? "-other" : ""),
              fence: 1,
              digest: "a".repeat(64),
              result: {
                mapping: {},
                staff: [{ staffId: "staff-one", revision: 4 }],
              },
            },
          };
        throw Error("Unexpected new request " + path);
      },
    };
  });
  await page.addScriptTag({ url: "/v1/shared/contacts-ui.js" });
  await page.addScriptTag({
    content: `GSISContactsEditor.install({get:()=>({state:window.nativeState}),invalidateSignature:()=>{window.signatureInvalidations++;}}, ${JSON.stringify(CONTACT_GRID_SCHEMA)}, ${previewTTb.toString()});`,
  });
  await page.evaluate(() => GSISContactsTables.openImport());
  assert.equal(
    await page.locator("dialog input[type=file]").isDisabled(),
    true,
    "reload preserves unresolved operation guard",
  );
  await page
    .getByRole("button", { name: "Check original import receipt" })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector("dialog [role=status]")
      .textContent.includes("remains unconfirmed"),
  );
  assert.equal(await page.locator("dialog input[type=file]").isDisabled(), true);
  assert.deepEqual(await page.evaluate(() => refreshCalls), []);
  await page.evaluate(() => (window.wrongReceipt = false));
  await page
    .getByRole("button", { name: "Check original import receipt" })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector("dialog [role=status]")
      .textContent.includes("committed"),
  );
  await page.waitForFunction(() => refreshCalls.length === 1);
  assert.deepEqual(await page.evaluate(() => refreshCalls), [{}]);
  assert.equal(await page.evaluate(() => signatureInvalidations), 1);
  assert.equal(await page.locator("#nativeDraft").inputValue(), "Unsubmitted native edit");
  assert.match(await page.locator("dialog [role=status]").textContent(), /native draft retained/);
  assert.equal(
    await page.evaluate(
      () => calls.filter((c) => c.path === "/save-data").length,
    ),
    0,
    "restart receipt recovery does not start another write",
  );
  assert.equal(
    await page.evaluate(
      () => calls.find((c) => c.path === "/save-receipt").body.operationId,
    ),
    operationId,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Contacts signature scrolling; canonical XLSX preview; wrong-school/duplicate/stale/derived-field rejection; explicit atomic submission and same-operation receipt recovery",
  );
} finally {
  await browser.close();
}
