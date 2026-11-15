import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
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
        '<style>html,body,#app{height:100%;overflow:hidden}.page:not(.active){display:none}</style><div id="app"><section id="signature" class="page active"><details open><summary>Gmail instructions</summary><div style="height:2000px">Retained legacy graphics</div></details></section><section id="data" class="page"></section></div>',
    });
  });
  await page.goto("https://test.invalid/contacts/");
  await page.addStyleTag({ url: "/v1/shared/contacts-ui.css" });
  await page.addStyleTag({ url: "/v1/shared/core-table.css" });
  await page.evaluate(() => {
    window.data = {
      fields: ["Basic Name", "Mobile No", "EO Appt Level"],
      rows: [
        {
          id: "staff-one",
          values: ["Alice", "123", "EO"],
          computed: [false, false, true],
        },
      ],
      editable: true,
      revision: 3,
    };
    window.calls = [];
    window.failSave = true;
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
        if (path === "/save-receipt")
          return { saved: true, state: "committed" };
        throw Error(path);
      },
    };
  });
  await page.addScriptTag({ url: "/v1/shared/contacts-ui.js" });
  await page.waitForFunction(() =>
    document.documentElement.classList.contains("gsis-contacts-signature"),
  );
  await page.evaluate(() => scrollTo(0, 1000));
  assert(
    (await page.evaluate(() => scrollY)) > 500,
    "expanded signature instructions scroll",
  );
  const model = await page.evaluate(() => {
    const b = {
      metadata: { Schema: "gsis.contacts.grid.v1", "School ID": "gsps" },
      sheets: {
        Contacts: {
          columns: ["Staff ID", ...data.fields],
          rows: [["staff-one", "Alice", "456", "EO"]],
        },
        Baseline: {
          columns: ["Staff ID", ...data.fields],
          rows: [["staff-one", "Alice", "123", "EO"]],
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
    changed.sheets.Contacts.rows[0][3] = "Non-EO";
    const duplicate = clone();
    duplicate.sheets.Contacts.rows.push(duplicate.sheets.Contacts.rows[0]);
    const wrong = clone();
    wrong.metadata["School ID"] = "other";
    const stale = structuredClone(data);
    stale.rows[0].values[1] = "999";
    return [
      v(changed),
      v(duplicate),
      v(wrong),
      GSISContactsTables.validate(book, stale, "gsps").errors,
    ].map((e) => e.length);
  });
  assert(negative.every((n) => n > 0));
  const bounded = await page.evaluate(() => {
    const many = structuredClone(data),
      large = structuredClone(book);
    many.rows = Array.from({ length: 17 }, (_, i) => ({
      ...data.rows[0],
      id: "staff-" + i,
    }));
    large.sheets.Baseline.rows = many.rows.map((r) => [r.id, ...r.values]);
    large.sheets.Contacts.rows = many.rows.map((r) => [
      r.id,
      r.values[0],
      "456",
      r.values[2],
    ]);
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
    mine.sheets.Contacts.rows[0][1] = "Rename outside DIY";
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
    window.GSISV1 = {
      capable: () => true,
      getSession: async () => ({
        schoolId: "gsps",
        user: { accountId: "owner" },
      }),
      request: async (domain, path, options) => {
        window.calls.push({ path, body: options?.body });
        if (path === "/save-receipt")
          return { saved: true, state: "committed" };
        throw Error("Unexpected new request " + path);
      },
    };
  });
  await page.addScriptTag({ url: "/v1/shared/contacts-ui.js" });
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
      .textContent.includes("committed"),
  );
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
