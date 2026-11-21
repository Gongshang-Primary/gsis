/** Built Deploy browser and isolated Workers/D1 verifying DEP-21-004:
 * visible Save changes (Save to online) control on Dept, Committees, CCAs, PLT,
 * Events, and Duty, disabled on arrival, enabled on edit, persistent on save,
 * read-only restricted, and preserving original-save recovery controls. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

const schoolId = "synthetic-school";
const suite = await productSuite({
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-planning-save.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});
let browser;
try {
  const editor = await suite.seedAccount("planning-save-editor");

  // Create active planning teachers in Contacts plus a read-only SMC viewer staff record.
  const createdContacts = await suite.call(editor, "contacts", "/save-data", {
    operationId: "synthetic-planning-save-contacts",
    changes: [],
    additions: [
      {
        id: "temp-teacher-a",
        values: {
          "Basic Name": "Synthetic Alpha",
          "Statutory Name": "Synthetic Alpha",
          Role: "Teacher",
          Active: "Y",
        },
      },
      {
        id: "temp-teacher-b",
        values: {
          "Basic Name": "Synthetic Bravo",
          "Statutory Name": "Synthetic Bravo",
          Role: "Teacher",
          Active: "Y",
        },
      },
      {
        id: "temp-reader-smc",
        values: {
          "Basic Name": "Synthetic Reader",
          "Statutory Name": "Synthetic Reader",
          Role: "Teacher",
          Active: "Y",
        },
      },
    ],
  });
  const teacherA = createdContacts.mapping["temp-teacher-a"];
  const teacherB = createdContacts.mapping["temp-teacher-b"];
  const readerStaffId = createdContacts.mapping["temp-reader-smc"];
  for (const [field, value] of [
    ["smc", true],
    ["eo", false],
    ["schoolLeader", false],
  ]) {
    await suite.call(
      editor,
      "contacts",
      "/staff/" + readerStaffId + "/accept",
      {
        operationId: "synthetic-accept-reader-" + field,
        field,
        value,
        revision: 0,
        ownerReviewReference: "Synthetic owner review",
      },
    );
  }
  const reader = await suite.seedAccount("planning-save-reader", {
    staffId: readerStaffId,
    capabilities: [],
  });

  const { versionId } = await suite.call(editor, "deploy", "/versions/create", {
    operationId: "synthetic-planning-save-version",
    name: "Synthetic planning save controls",
    year: 2026,
  });

  const db = await suite.db("deploy");
  const loaded = await loadVersion(db, schoolId, versionId);
  const doc = structuredClone(loaded.doc);
  doc.organisations = {
    dept: [{ id: "syn-dept", name: "Synthetic Dept", slots: ["", ""] }],
    comm: [{ id: "syn-comm", name: "Synthetic Comm", slots: ["", "", "", ""], leadershipSchema: 1 }],
    cca: [{ id: "syn-cca", name: "Synthetic CCA", slots: ["", "", "", ""] }],
    plt: [{ id: "syn-plt", name: "Synthetic PLT", slots: [""] }],
    events: [{ id: "syn-events", name: "Synthetic Events", slots: ["", ""] }],
  };
  doc.duties = [
    {
      id: "syn-duty",
      name: "Synthetic Gate",
      category: "Before School",
      start: "07:00",
      end: "07:25",
      days: [0, 1, 2, 3, 4],
      adhoc: false,
      description: "Gate duty",
      teachers: {},
    },
  ];
  const delta = changesFor(schoolId, versionId, loaded.rows, doc);
  await db.batch(delta.writes.map((w) => statement(db, w.sql, w.args)));
  const savedDoc = async () => (await loadVersion(db, schoolId, versionId)).doc;

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.GSIS_BROWSER_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  let rejectChange = false;
  async function openPageFor(user) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.addCookies([
      {
        name: "__Host-gsis_session",
        value: user.token,
        domain: new URL(origin).hostname,
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (rejectChange && url.pathname === "/api/deploy/change") {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            code: "SYNTHETIC_CONFLICT",
            error: "Synthetic unconfirmed save outcome",
          }),
        });
      }
      const response = await suite.mf.dispatchFetch(request.url(), {
        method: request.method(),
        headers: await request.allHeaders(),
        body: ["GET", "HEAD"].includes(request.method())
          ? undefined
          : request.postDataBuffer(),
      });
      const body = Buffer.from(await response.arrayBuffer());
      const headers = Object.fromEntries(response.headers);
      delete headers["transfer-encoding"];
      await route.fulfill({ status: response.status, headers, body });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    return page;
  }

  const page = await openPageFor(editor);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/deploy/");
  await page.waitForFunction(
    (id) => document.getElementById("version")?.value === id,
    versionId,
  );

  const sixPages = [
    ["Dept", "dept"],
    ["Committees", "comm"],
    ["CCAs", "cca"],
    ["PLT", "plt"],
    ["Events", "events"],
    ["Duty", "duty"],
  ];

  // 1. Visit all 6 pages on a clean draft and verify a visible disabled Save to online button.
  for (const [tabName] of sixPages) {
    await page.getByRole("button", { name: tabName, exact: true }).click();
    await page.waitForFunction(
      (expected) => document.getElementById("content")?.dataset.view === expected,
      tabName,
    );
    const saveQueue = page.locator("#saveQueue");
    assert.equal(
      await saveQueue.isVisible(),
      true,
      `#saveQueue must be visible on clean ${tabName} page`,
    );
    const saveButton = saveQueue.getByRole("button", {
      name: "Save to online",
      exact: true,
    });
    assert.equal(
      await saveButton.isVisible(),
      true,
      `Save to online button must be visible on clean ${tabName} page`,
    );
    assert.equal(
      await saveButton.isDisabled(),
      true,
      `Save to online button must be disabled on clean ${tabName} page`,
    );
    assert.match(await saveQueue.innerText(), /No unsaved changes/);
  }
  console.log("PASS all six pages show a visible disabled Save to online button on arrival");

  // 2. Stage an edit on each of the six pages, save, verify persistence, and confirm button stays visible & disabled after save.
  for (const [tabName, kind] of sixPages) {
    await page.getByRole("button", { name: tabName, exact: true }).click();
    await page.waitForFunction(
      (expected) => document.getElementById("content")?.dataset.view === expected,
      tabName,
    );
    if (kind === "duty") {
      await page.evaluate((teacherId) => {
        const select = document.querySelector(
          'select[data-duty-teacher="syn-duty"][data-day="0"]',
        );
        select.value = teacherId;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }, teacherA);
    } else {
      await page.evaluate(
        ({ groupId, teacherId }) => {
          const select = document.querySelector(
            `select[data-group="${groupId}"][data-slot="0"]`,
          );
          select.value = teacherId;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        },
        { groupId: "syn-" + kind, teacherId: teacherA },
      );
    }
    const saveQueue = page.locator("#saveQueue");
    const saveButton = saveQueue.getByRole("button", {
      name: "Save to online",
      exact: true,
    });
    assert.equal(
      await saveButton.isEnabled(),
      true,
      `Save to online button must enable after staging an edit on ${tabName}`,
    );
    await saveButton.click();
    await page.waitForFunction(
      () => !queuedEdits().length && !queueFlight && !refreshing,
    );
    assert.equal(
      await saveButton.isVisible(),
      true,
      `Save to online button must remain visible after saving on ${tabName}`,
    );
    assert.equal(
      await saveButton.isDisabled(),
      true,
      `Save to online button must return to disabled after saving on ${tabName}`,
    );
  }

  // Reload and verify persistence across all 6 pages.
  await page.reload();
  await page.waitForFunction(
    (id) => document.getElementById("version")?.value === id,
    versionId,
  );
  const afterSave = await savedDoc();
  for (const [, kind] of sixPages) {
    if (kind === "duty") {
      assert.equal(afterSave.duties[0].teachers["0"], teacherA);
    } else {
      assert.equal(afterSave.organisations[kind][0].slots[0], teacherA);
    }
  }
  console.log("PASS staging and saving persists across all six pages and keeps Save visible afterward");

  // 3. Verify unconfirmed save still exposes the original recovery controls on a planning page.
  await page.getByRole("button", { name: "Dept", exact: true }).click();
  rejectChange = true;
  await page.evaluate((teacherId) => {
    const select = document.querySelector(
      'select[data-group="syn-dept"][data-slot="0"]',
    );
    select.value = teacherId;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, teacherB);
  await page
    .locator("#saveQueue")
    .getByRole("button", { name: "Save to online", exact: true })
    .click();
  await page.waitForFunction(() => !!queueFlight && !queueFlight.running);
  assert.equal(
    await page.locator('[data-deploy-recovery-action="check"]').isVisible(),
    true,
    "Check original save recovery control must be visible on unconfirmed save",
  );
  assert.equal(
    await page.locator('[data-deploy-recovery-action="retry"]').isVisible(),
    true,
    "Retry original save recovery control must be visible on unconfirmed save",
  );
  rejectChange = false;
  await page.locator('[data-deploy-recovery-action="retry"]').click();
  await page.waitForFunction(
    () => !queueFlight && !queuedEdits().length && !refreshing,
  );
  assert.equal((await savedDoc()).organisations.dept[0].slots[0], teacherB);
  console.log("PASS unconfirmed save on Dept exposes original recovery controls and recovers cleanly");

  // 4. Verify read-only users cannot submit changes and do not get an active Save control.
  const readerPage = await openPageFor(reader);
  await readerPage.goto(origin + "/deploy/");
  await readerPage.waitForFunction(
    (id) => document.getElementById("version")?.value === id,
    versionId,
  );
  for (const [tabName, kind] of sixPages) {
    await readerPage.getByRole("button", { name: tabName, exact: true }).click();
    await readerPage.waitForFunction(
      (expected) => document.getElementById("content")?.dataset.view === expected,
      tabName,
    );
    assert.equal(
      await readerPage.locator("#saveQueue").isHidden(),
      true,
      `Read-only user must not see #saveQueue on ${tabName}`,
    );
    const selector =
      kind === "duty"
        ? 'select[data-duty-teacher="syn-duty"][data-day="0"]'
        : `select[data-group="syn-${kind}"][data-slot="0"]`;
    assert.equal(
      await readerPage.locator(selector).first().isDisabled(),
      true,
      `Read-only user selector must be disabled on ${tabName}`,
    );
  }
  console.log("PASS read-only users cannot submit changes on any of the six planning pages");

  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await suite.close();
}
