import assert from "node:assert/strict";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";

// Actual built v1 frontend and local Workers/D1. All identities and planning
// records are synthetic; external requests are blocked and nothing is deployed.
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
  const admin = await suite.seedAccount("draft-status-admin");
  const editor = await suite.seedAccount("draft-status-editor", {
    staffId: "draft-status-staff",
    capabilities: [],
  });
  const previewTarget = await suite.seedAccount("draft-status-preview-admin");
  await suite.call(admin, "contacts", "/staff/create", {
    operationId: "draft-status-staff-create",
    staffId: editor.staffId,
    basicName: "Synthetic Planning Teacher",
  });
  await suite.call(admin, "contacts", `/staff/${editor.staffId}/update`, {
    operationId: "draft-status-staff-active",
    changes: { employmentActive: true },
    fieldRevisions: { employmentActive: 0 },
  });
  for (const [field, value] of [
    ["smc", true],
    ["eo", true],
    ["schoolLeader", false],
  ]) {
    await suite.call(admin, "contacts", `/staff/${editor.staffId}/accept`, {
      operationId: "draft-status-accept-" + field,
      field,
      value,
      revision: 0,
      ownerReviewReference: "synthetic-owner-review",
    });
  }
  const db = await suite.db("deploy");
  const venues = await suite.db("venues");
  await venues
    .prepare(
      "INSERT INTO venues_records(school_id,kind,record_id,revision,data_json) VALUES(?,'venues','draft-room',7,?)",
    )
    .bind(
      "synthetic-school",
      JSON.stringify({
        id: "draft-room",
        name: "Synthetic room",
        unit: "A-01",
        shortName: "A",
      }),
    )
    .run();
  async function createPlan(label) {
    const created = await suite.call(admin, "deploy", "/versions/create", {
      operationId: "create-" + label.toLowerCase().replaceAll(" ", "-"),
      name: label,
      year: 2026,
    });
    const rows = [
      [
        "classes",
        "draft-class",
        {
          ref: "draft-class",
          level: "1",
          name: "Alpha",
          shortName: "A",
          venueId: "draft-room",
        },
      ],
      [
        "venues",
        "draft-room",
        {
          id: "draft-room",
          name: "Synthetic room",
          unit: "A-01",
          shortName: "A",
          revision: 7,
          form: "1A",
          forms: ["1A"],
        },
      ],
      [
        "groups",
        "draft-group",
        {
          id: "draft-group",
          name: "Synthetic TG",
          subject: "Music",
          level: "1",
          levels: ["1"],
          classRefs: ["draft-class"],
          weeklyPeriods: 1,
          venue: "draft-room",
        },
      ],
      [
        "assignments",
        "draft-assignment",
        {
          id: "draft-assignment",
          teacher: editor.staffId,
          target: "draft-group",
          subject: "Music",
          level: "1",
          venue: "draft-room",
        },
      ],
    ];
    await db.batch(
      rows.map(([scope, rowId, value]) =>
        db
          .prepare(
            "INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,?,?,1,?)",
          )
          .bind(
            "synthetic-school",
            created.versionId,
            scope,
            rowId,
            JSON.stringify(value),
          ),
      ),
    );
    return created.versionId;
  }
  const versionId = await createPlan("Saved draft fixture");
  const snapshot = async (id) =>
    (await suite.call(admin, "deploy", "/bootstrap", { versionId: id }))
      .current;
  const planning = (doc) =>
    Object.fromEntries(
      ["classes", "venues", "groups", "assignments"].map((key) => [
        key,
        doc[key],
      ]),
    );
  const before = await snapshot(versionId);
  assert.equal(before.status, "draft");
  assert.equal(before.publication, "Saved draft");
  assert.equal(before.publishedRevision, null);
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath:
      process.env.GSIS_BROWSER_EXECUTABLE ||
      process.env.ROSTER_TEST_CHROMIUM ||
      undefined,
  });
  const errors = [],
    mutations = [];
  async function contextFor(user, { preview = null, narrow = false } = {}) {
    const context = await browser.newContext({
      viewport: narrow
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
    });
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
    if (preview)
      await context.addInitScript(
        ({ id, expectedOrigin }) => {
          if (location.origin === expectedOrigin)
            sessionStorage.setItem("gsis-preview-account", id);
        },
        { id: preview, expectedOrigin: origin },
      );
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (!request.url().startsWith(origin + "/")) return route.abort();
      if (
        /\/api\/deploy\/(?:change|lease|publish)(?:\?|$)/.test(request.url()) &&
        request.method() === "POST"
      )
        mutations.push(request.postDataJSON());
      const response = await suite.mf.dispatchFetch(request.url(), {
        method: request.method(),
        headers: await request.allHeaders(),
        body: ["GET", "HEAD"].includes(request.method())
          ? undefined
          : request.postDataBuffer(),
      });
      const headers = Object.fromEntries(response.headers);
      delete headers["transfer-encoding"];
      await route.fulfill({
        status: response.status,
        headers,
        body: Buffer.from(await response.arrayBuffer()),
      });
    });
    context.on("page", (page) =>
      page.on("pageerror", (error) => errors.push(error.message)),
    );
    return context;
  }
  async function openPlan(page, id, { venuesView = true } = {}) {
    await page.goto(origin + "/deploy/", { waitUntil: "domcontentloaded" });
    await page
      .locator(`#version option[value="${id}"]`)
      .waitFor({ state: "attached" });
    await page.locator("#version").selectOption(id);
    await page.waitForFunction(
      (expected) =>
        document.querySelector("#version")?.value === expected &&
        document.querySelector("#nav [data-section='Program Settings']"),
      id,
    );
    await page.locator('#nav [data-section="Program Settings"]').click();
    if (venuesView) {
      await page.locator('#settingsSubnav [data-tab="Venues"]').click();
      await page
        .locator("[data-clear-venues]")
        .waitFor()
        .catch(async (error) => {
          console.error(
            "Browser diagnostics: " +
              JSON.stringify({
                errors,
                view: await page.locator("#content").getAttribute("data-view"),
                content: await page.locator("#content").textContent(),
              }),
          );
          throw error;
        });
    }
  }
  const adminContext = await contextFor(admin, { narrow: true });
  const page = await adminContext.newPage();
  page.setDefaultTimeout(12000);
  await openPlan(page, versionId);
  const clear = page.locator("[data-clear-venues]");
  assert.equal(
    await clear.isEnabled(),
    true,
    "A native v1 saved draft must offer clear-assignment preview to Admin",
  );
  assert.equal(
    await page
      .getByText("Choose an unpublished planning version.", { exact: true })
      .count(),
    0,
  );
  done(
    "Admin can open venue-clear controls for a native saved draft on a narrow screen",
  );

  const writesBefore = mutations.length;
  await clear.click();
  const preview = page.locator(
    '.inline-editor[aria-label="Clear venue assignments"]',
  );
  await preview.waitFor();
  assert(
    (await preview.textContent()).includes(
      "1 room/class links, 1 teaching groups, 1 teacher deployment rows",
    ),
  );
  assert.deepEqual(planning(await snapshot(versionId)), planning(before));
  assert.equal(
    mutations.length,
    writesBefore,
    "Opening preview must not acquire a lease or write",
  );
  await preview.locator("[data-cancel]").click();
  assert.deepEqual(planning(await snapshot(versionId)), planning(before));
  assert.equal(mutations.length, writesBefore, "Cancellation must not write");
  done(
    "venue preview and cancellation leave all saved planning records unchanged",
  );

  await clear.click();
  await page
    .getByRole("button", { name: "Add clear to draft", exact: true })
    .click();
  await page
    .locator("#saveQueue")
    .getByRole("button", { name: "Save to online", exact: true })
    .waitFor();
  assert.equal(
    mutations.length,
    writesBefore,
    "Adding a clear operation only queues a local draft",
  );
  assert.deepEqual(planning(await snapshot(versionId)), planning(before));
  await page
    .locator("#saveQueue")
    .getByRole("button", { name: "Save to online", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector("#saveQueue")
      ?.textContent.includes("No unsaved changes"),
  );
  const after = await snapshot(versionId);
  assert.equal(after.revision, before.revision + 1);
  for (const kind of ["classes", "venues", "groups", "assignments"])
    assert.deepEqual(
      after[kind].map((row) => row.id || row.ref),
      before[kind].map((row) => row.id || row.ref),
      kind + " identities survive clearing",
    );
  assert.deepEqual(after.venues[0], {
    ...before.venues[0],
    form: "",
    forms: [],
  });
  assert.deepEqual(after.classes[0], { ...before.classes[0], venueId: "" });
  assert.deepEqual(after.groups[0], { ...before.groups[0], venue: "" });
  assert.deepEqual(after.assignments[0], {
    ...before.assignments[0],
    venue: "",
  });
  assert.equal(mutations.filter((x) => x.operation === "saveDraft").length, 1);
  done(
    "explicit queued save uses actual Workers and clears only venue assignments",
  );

  const publishedId = await createPlan("Published fixture");
  const lease = await suite.call(admin, "deploy", "/lease", {
    operationId: "published-fixture-lease",
    versionId: publishedId,
    scope: "meta",
    clientId: "fixture",
  });
  await suite.call(admin, "deploy", "/publish", {
    operationId: "publish-fixture",
    versionId: publishedId,
    revision: 0,
    expectedPointerSequence: 0,
    scope: "meta",
    clientId: "fixture",
    leaseFence: lease.fence,
  });
  await openPlan(page, publishedId);
  assert.equal((await snapshot(publishedId)).publication, "Published");
  assert.equal(await page.locator("[data-clear-venues]").isEnabled(), false);
  const editLease = await suite.call(admin, "deploy", "/lease", {
    operationId: "later-draft-lease",
    versionId: publishedId,
    scope: "meta",
    clientId: "fixture",
  });
  await suite.call(admin, "deploy", "/change", {
    operationId: "later-draft",
    operation: "metadata",
    versionId: publishedId,
    name: "Saved draft after publication",
    revision: 0,
    scope: "meta",
    clientId: "fixture",
    leaseFence: editLease.fence,
  });
  await openPlan(page, publishedId);
  const later = await snapshot(publishedId);
  assert.equal(later.publication, "Saved draft; previous publication in force");
  assert.equal(later.publishedRevision, 0);
  assert.equal(await page.locator("[data-clear-venues]").isEnabled(), false);
  assert.equal(
    later.venues[0].form,
    "1A",
    "negative cases still have assignments to clear",
  );
  done(
    "published and previously published versions retain their existing restrictions",
  );

  const editorContext = await contextFor(editor),
    editorPage = await editorContext.newPage();
  await openPlan(editorPage, versionId, { venuesView: false });
  assert.equal(
    await editorPage.evaluate(() => GSISV1.capable("deploy.edit")),
    true,
  );
  assert.equal(await editorPage.evaluate(() => GSISV1.capable("admin")), false);
  assert.equal(
    await editorPage.locator('#settingsSubnav [data-tab="Venues"]').count(),
    0,
  );
  assert.equal(await editorPage.locator("[data-clear-venues]").count(), 0);
  done(
    "a Contacts-authorised Deploy editor does not acquire Admin venue-clear controls",
  );

  const previewContext = await contextFor(admin, { preview: previewTarget.id });
  const previewPage = await previewContext.newPage();
  await openPlan(previewPage, versionId, { venuesView: false });
  assert.equal(
    await previewPage.evaluate(
      async () => (await GSISV1.getSession()).impersonating,
    ),
    true,
  );
  assert.equal(
    await previewPage.evaluate(() => GSISV1.capable("admin")),
    false,
  );
  assert.equal(
    await previewPage.locator('#settingsSubnav [data-tab="Venues"]').count(),
    0,
  );
  const forbidden = await suite.request(admin, "deploy", "/change", {
    method: "POST",
    headers: { "x-gsis-preview-account": previewTarget.id },
    body: {
      operationId: "preview-clear-denied",
      versionId,
      operation: "clearVenueAssignments",
    },
  });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(planning(await snapshot(versionId)), planning(after));
  assert.deepEqual(errors, []);
  done(
    "Admin impersonation stays read-only in both the built UI and owning Worker",
  );
  await previewContext.close();
  await editorContext.close();
  await adminContext.close();
} finally {
  await browser?.close();
  await suite.close();
}
console.log(
  `PASS ${passed} built-browser/actual Worker draft-status groups. Runtime UAT Not tested.`,
);
