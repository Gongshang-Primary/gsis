import assert from "node:assert/strict";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { prepareOperation, operationStatus } from "../v1/runtime/store.mjs";

// Real built Contacts UI, owning Workers and local D1. Transport faults are
// injected at the browser boundary; no provider or live school is contacted.
const suite = await productSuite({
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-browser.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});
let browser;
let passed = 0;
const done = (name) => {
  passed++;
  console.log("PASS " + name);
};
try {
  const admin = await suite.seedAccount("contacts-browser-admin");
  const db = await suite.db("contacts");
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath:
      process.env.GSIS_BROWSER_EXECUTABLE ||
      process.env.ROSTER_TEST_CHROMIUM ||
      undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1300, height: 900 },
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
  const calls = [],
    errors = [];
  let fault = null;
  async function forward(route, request) {
    const response = await suite.mf.dispatchFetch(request.url(), {
      method: request.method(),
      headers: await request.allHeaders(),
      body: ["GET", "HEAD"].includes(request.method())
        ? undefined
        : request.postDataBuffer(),
    });
    const headers = Object.fromEntries(response.headers);
    delete headers["transfer-encoding"];
    return {
      status: response.status,
      headers,
      body: Buffer.from(await response.arrayBuffer()),
    };
  }
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (!request.url().startsWith(origin + "/")) return route.abort();
    const path = new URL(request.url()).pathname;
    const body =
      request.method() === "POST" && request.postData()
        ? request.postDataJSON()
        : null;
    if (path.startsWith("/api/contacts/"))
      calls.push({ path, body: structuredClone(body) });
    if (fault && (await fault({ route, request, path, body }))) return;
    await route.fulfill(await forward(route, request));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/contacts/", { waitUntil: "domcontentloaded" });
  await page.locator("#dataTab").click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#addContactRow").disabled &&
      document.querySelector("#dataGrid table"),
  );
  const field = (label) =>
    page.locator('#dataGrid [aria-label="' + label + '"]').first();
  async function addDraft(name, role = "") {
    await page.locator("#addContactRow").click();
    await field("Basic Name").fill(name);
    await field("Statutory Name").fill(name + " Full");
    await field("Mobile No").fill("81234567");
    if (role) await field("Role").fill(role);
  }
  const saves = () => calls.filter((c) => c.path === "/api/contacts/save-data");
  const settle = () =>
    page.waitForFunction(
      () =>
        !document.querySelector("#saveData").disabled &&
        !document.querySelector("#dataGrid").inert,
    );
  const staffCount = async () =>
    (
      await db
        .prepare(
          "SELECT COUNT(*) n FROM contacts_staff WHERE school_id='synthetic-school'",
        )
        .first()
    ).n;
  await addDraft("Synthetic Recovery Teacher", "P");
  await page.locator("#saveData").click();
  await settle();
  const rejected = saves().at(-1).body;
  const rejectedId = rejected.operationId || rejected.requestId;
  assert.equal(
    (await operationStatus(db, "synthetic-school", rejectedId)).state,
    "aborted",
  );
  assert.equal(await staffCount(), 0);
  assert.equal(
    await field("Basic Name").inputValue(),
    "Synthetic Recovery Teacher",
  );
  assert.equal(
    await field("Statutory Name").inputValue(),
    "Synthetic Recovery Teacher Full",
  );
  assert.equal(await field("Mobile No").inputValue(), "8123 4567");
  assert.equal(await field("Role").inputValue(), "P");
  assert.equal(
    await field("Basic Name").isEditable(),
    true,
    "A durably aborted save must retain and unlock its draft",
  );
  assert(!/\bSaved\b/.test(await page.locator("#dataStatus").textContent()));
  done(
    "catalogue rejection unlocks only after its durable abort and retains every entered value",
  );
  await field("Role").fill("");
  await page.locator("#saveData").click();
  await settle();
  assert.equal(await staffCount(), 1);
  const corrected = saves().at(-1).body;
  assert.notEqual(corrected.operationId || corrected.requestId, rejectedId);
  assert.equal(
    (
      await operationStatus(
        db,
        "synthetic-school",
        corrected.operationId || corrected.requestId,
      )
    ).state,
    "committed",
  );
  assert.equal(await page.locator("#dataStatus").textContent(), "Saved");
  done(
    "an explicitly corrected draft gets a new operation and creates exactly one staff record",
  );
  let lostId;
  fault = async ({ route, request, path, body }) => {
    if (path !== "/api/contacts/save-data") return false;
    lostId = body.operationId || body.requestId;
    const response = await forward(route, request);
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).data.saved, true);
    fault = null;
    await route.abort("failed");
    return true;
  };
  await addDraft("Synthetic Lost Response");
  const saveCountBeforeLoss = saves().length;
  await page.locator("#saveData").click();
  await settle();
  assert.equal(await staffCount(), 2);
  assert.equal(
    (await operationStatus(db, "synthetic-school", lostId)).state,
    "committed",
  );
  assert.equal(
    saves().length,
    saveCountBeforeLoss + 1,
    "a confirmed receipt must not send another creation",
  );
  assert.equal(await page.locator("#dataStatus").textContent(), "Saved");
  assert(
    calls.some(
      (c) =>
        c.path === "/api/contacts/save-receipt" &&
        (c.body.operationId || c.body.requestId) === lostId,
    ),
  );
  done(
    "a response lost after commit recovers the original save without duplicate staff",
  );

  let unknownRequest;
  fault = async ({ route, path, body }) => {
    if (path !== "/api/contacts/save-data") return false;
    unknownRequest ??= structuredClone(body);
    assert.deepEqual(
      body,
      unknownRequest,
      "unknown save retries must preserve the exact payload and operation ID",
    );
    await route.abort("failed");
    return true;
  };
  await addDraft("Synthetic Unknown Outcome");
  await page.locator("#saveData").click();
  await settle();
  const unknownId = unknownRequest.operationId || unknownRequest.requestId;
  assert.equal(await operationStatus(db, "synthetic-school", unknownId), null);
  assert.equal(await field("Basic Name").isEditable(), false);
  assert.equal(await page.locator("#addContactRow").isDisabled(), true);
  assert.equal(await page.locator("#reloadData").isDisabled(), true);
  assert.equal(
    await field("Basic Name").inputValue(),
    "Synthetic Unknown Outcome",
  );
  const recoveryCallsBeforeUnknown = calls.filter(
    (c) => c.path === "/api/contacts/recover-save",
  ).length;
  await page.locator("[data-contacts-recover-attempt]").click();
  await settle();
  assert.equal(
    calls.filter((c) => c.path === "/api/contacts/recover-save").length,
    recoveryCallsBeforeUnknown,
    "an absent operation cannot be declared fenced by requesting recovery",
  );
  assert.equal(await field("Basic Name").isEditable(), false);
  // The next check is unavailable, not an abort; the original payload stays held.
  fault = async ({ route, path, body }) => {
    if (path === "/api/contacts/save-receipt") {
      assert.equal(body.operationId || body.requestId, unknownId);
      await route.abort("failed");
      return true;
    }
    if (path === "/api/contacts/save-data") {
      assert.deepEqual(body, unknownRequest);
      await route.abort("failed");
      return true;
    }
    return false;
  };
  await page.locator("#saveData").click();
  await settle();
  assert.equal(await field("Basic Name").isEditable(), false);
  assert.equal(await staffCount(), 2);
  fault = null;
  await page.locator("#saveData").click();
  await settle();
  assert.deepEqual(saves().at(-1).body, unknownRequest);
  assert.equal(await staffCount(), 3);
  assert.equal(await page.locator("#dataStatus").textContent(), "Saved");
  done(
    "absent and unavailable receipts retain the original locked draft until its exact retry commits",
  );

  let preparedRequest;
  fault = async ({ route, path, body }) => {
    if (path !== "/api/contacts/save-data") return false;
    preparedRequest = structuredClone(body);
    await prepareOperation(db, {
      schoolId: "synthetic-school",
      actorId: admin.id,
      operationId: body.operationId || body.requestId,
      action: "contacts.manage",
      intent: { changes: body.changes, additions: body.additions ?? [] },
      now: Date.now(),
      validUntil: Date.now() + 60000,
    });
    await route.abort("failed");
    return true;
  };
  await addDraft("Synthetic Prepared Recovery");
  await page.locator("#saveData").click();
  await settle();
  const preparedId = preparedRequest.operationId || preparedRequest.requestId;
  assert.equal(
    (await operationStatus(db, "synthetic-school", preparedId)).state,
    "prepared",
  );
  assert.equal(await field("Basic Name").isEditable(), false);
  const recover = page.locator("[data-contacts-recover-attempt]");
  await recover.waitFor();
  assert.equal(await recover.textContent(), "Stop original save");
  assert(
    (await page.locator("#contactRecovery").textContent()).includes(preparedId),
  );
  fault = null;
  const recoveryCallsBeforeCheck = calls.filter(
    (c) => c.path === "/api/contacts/recover-save",
  ).length;
  await page.locator("#refreshRecovery").click();
  await settle();
  assert.equal(
    (await operationStatus(db, "synthetic-school", preparedId)).state,
    "prepared",
  );
  assert.equal(
    calls.filter((c) => c.path === "/api/contacts/recover-save").length,
    recoveryCallsBeforeCheck,
    "Check again must read the original receipt without requesting an abort",
  );
  assert.equal(await field("Basic Name").isEditable(), false);
  await recover.click();
  await settle();
  assert.equal(
    (await operationStatus(db, "synthetic-school", preparedId)).state,
    "aborted",
  );
  assert.equal(
    await field("Basic Name").inputValue(),
    "Synthetic Prepared Recovery",
  );
  assert.equal(await field("Basic Name").isEditable(), true);
  assert.equal(await staffCount(), 3);
  assert.equal(
    await recover.count(),
    0,
    "only a retained attempt owns a recovery control",
  );
  done(
    "explicit recovery fences a prepared original operation before unlocking its retained draft",
  );
  // Discard only the now-proved-aborted draft, using the normal confirmation.
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#reloadData").click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#reloadData").disabled &&
      document.querySelectorAll("#dataGrid tbody tr").length === 3,
  );

  const importBytes = await page.evaluate(async () => {
    const data = await GSISV1.request("contacts", "/data");
    const columns = ["Staff ID", ...data.fields];
    const rows = data.rows.map((row) => [row.id, ...row.values]);
    const changed = structuredClone(rows);
    changed[0][columns.indexOf("Mobile No")] = "87654321";
    return Array.from(
      await (
        await import("/v1/shared/workbooks.mjs")
      ).encodeWorkbook({
        metadata: {
          Schema: "gsis.contacts.grid.v1",
          "School ID": "synthetic-school",
          Scope: "manage",
        },
        sheets: {
          Contacts: { columns, rows: changed },
          Baseline: { columns, rows },
        },
      }),
    );
  });
  let importRequest;
  fault = async ({ route, path, body }) => {
    if (path !== "/api/contacts/save-data") return false;
    importRequest = structuredClone(body);
    await route.abort("failed");
    return true;
  };
  await page.evaluate(() => GSISContactsTables.openImport());
  await page.locator('dialog input[type="file"]').setInputFiles({
    name: "Contacts.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(importBytes),
  });
  const importConfirm = page.getByRole("button", {
    name: "Confirm atomic import",
    exact: true,
  });
  await page.waitForFunction(() =>
    [...document.querySelectorAll("dialog button")].some(
      (b) => b.textContent === "Confirm atomic import" && !b.disabled,
    ),
  );
  await importConfirm.click();
  await page.waitForFunction(() =>
    document
      .querySelector("dialog.gsis-import-preview [role=status]")
      ?.textContent.includes("retained"),
  );
  const importId = importRequest.operationId;
  const importStorage =
    "gsis-contacts-import:synthetic-school:" + admin.id + ":manage";
  assert.equal(
    await page.evaluate((key) => sessionStorage.getItem(key), importStorage),
    importId,
  );
  fault = null;
  await page.reload();
  await page.locator("#dataTab").click();
  await page.evaluate(() => GSISContactsTables.openImport());
  await page
    .getByRole("button", { name: "Check original import receipt", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector("dialog.gsis-import-preview [role=status]")
      ?.textContent.includes("unknown"),
  );
  assert.equal(
    await page.locator('dialog input[type="file"]').isDisabled(),
    true,
  );
  assert.equal(
    await page.evaluate((key) => sessionStorage.getItem(key), importStorage),
    importId,
  );
  // A competing legitimate save invalidates this held import's old baseline.
  const importChange = importRequest.changes[0];
  await suite.call(admin, "contacts", "/save-data", {
    operationId: "competing-browser-import",
    changes: [{ ...importChange, value: "89998888" }],
    additions: [],
  });
  const failedImport = await suite.request(admin, "contacts", "/save-data", {
    method: "POST",
    body: importRequest,
  });
  assert.equal(failedImport.status, 409);
  assert.equal(
    (await operationStatus(db, "synthetic-school", importId)).state,
    "aborted",
  );
  await page
    .getByRole("button", { name: "Check original import receipt", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector("dialog.gsis-import-preview [role=status]")
      ?.textContent.includes("did not commit"),
  );
  assert.equal(
    await page.locator('dialog input[type="file"]').isDisabled(),
    false,
  );
  assert.equal(
    await page.evaluate((key) => sessionStorage.getItem(key), importStorage),
    null,
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  done(
    "import retains its account-bound operation across reload and clears it only on the nested durable abort receipt",
  );

  await page.waitForFunction(
    () => !document.querySelector("#addContactRow").disabled,
  );
  let releaseResponse, committedResponse;
  const responseHeld = new Promise((resolve) => {
    committedResponse = resolve;
  });
  const release = new Promise((resolve) => {
    releaseResponse = resolve;
  });
  fault = async ({ route, request, path }) => {
    if (path !== "/api/contacts/save-data") return false;
    const response = await forward(route, request);
    assert.equal(response.status, 200);
    committedResponse();
    await release;
    await route.fulfill(response);
    return true;
  };
  await addDraft("Synthetic Session Ends");
  // Await the real registered handler, including its late-response continuation.
  // Calling button.click() does not expose this promise to the test.
  await page.evaluate(() => {
    window.contactsTestSaveCompletion = document
      .querySelector("#saveData")
      .onclick();
  });
  await responseHeld;
  await page.evaluate(() => GSISV1.logout());
  releaseResponse();
  await page.evaluate(() => window.contactsTestSaveCompletion);
  await page.waitForFunction(
    () =>
      document.querySelector("#app").classList.contains("hidden") &&
      document.querySelectorAll("#dataGrid tbody tr").length === 0,
  );
  assert.equal(
    await page.locator("[data-contacts-recover-attempt]").count(),
    0,
  );
  assert.equal(await page.locator("#dataGrid").textContent(), "");
  assert.notEqual(await page.locator("#dataStatus").textContent(), "Saved");
  done(
    "a late save response cannot repopulate Contacts after session clearance",
  );
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser?.close();
  await suite.close();
}
console.log(
  `PASS ${passed} built Contacts recovery groups. Runtime UAT Not tested.`,
);
