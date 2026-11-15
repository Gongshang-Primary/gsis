import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { productSuite, origin } from "./v1-product/suite.mjs";

// Built browser sources and actual isolated Workers/D1. No live accounts,
// providers or records; the malformed imported shape does not prove its origin.
const suite = await productSuite({
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-browser.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});
let browser;
try {
  const admin = await suite.seedAccount("venue-ui-admin");
  const db = await suite.db("deploy");
  const venues = await suite.db("venues");
  await venues
    .prepare(
      "INSERT INTO venues_records(school_id,kind,record_id,revision,data_json) VALUES('synthetic-school','venues','room-a',7,?)",
    )
    .bind(
      JSON.stringify({ id: "room-a", name: "Canonical room", unit: "A-01" }),
    )
    .run();
  const { versionId } = await suite.call(admin, "deploy", "/versions/create", {
    operationId: "venue-ui-plan",
    name: "Synthetic venue plan",
    year: 2026,
  });
  await db.batch(
    [
      [
        "classes",
        "class-a",
        {
          ref: "class-a",
          level: "1",
          name: "A",
          shortName: "A",
          venueId: "room-a",
        },
      ],
      [
        "venues",
        "room-a",
        { id: "room-a", name: "Old room", form: "1A", forms: ["1A"] },
      ],
    ].map(([scope, id, value]) =>
      db
        .prepare(
          "INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES('synthetic-school',?,?,?,1,?)",
        )
        .bind(versionId, scope, id, JSON.stringify(value)),
    ),
  );
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath: process.env.GSIS_BROWSER_EXECUTABLE || undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
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
  const requests = [],
    errors = [];
  let failBefore = null,
    failAfter = null,
    mutateAfterRefresh = false,
    holdLease = false,
    releaseLease = null;
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (!request.url().startsWith(origin + "/")) return route.abort();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST")
      requests.push({ path, body: request.postDataJSON() });
    if (failBefore === path) {
      failBefore = null;
      return route.abort();
    }
    if (holdLease && path === "/api/deploy/lease") {
      holdLease = false;
      await new Promise((resolve) => {
        releaseLease = resolve;
      });
    }
    const response = await suite.mf.dispatchFetch(request.url(), {
      method: request.method(),
      headers: await request.allHeaders(),
      body: ["GET", "HEAD"].includes(request.method())
        ? undefined
        : request.postDataBuffer(),
    });
    if (failAfter === path) {
      failAfter = null;
      await response.arrayBuffer();
      return route.abort();
    }
    if (
      mutateAfterRefresh &&
      path === "/api/deploy/change" &&
      request.postDataJSON().operation === "refreshVenueRegistry" &&
      response.ok
    ) {
      mutateAfterRefresh = false;
      await db
        .prepare("UPDATE deploy_versions SET revision=revision+1 WHERE id=?")
        .bind(versionId)
        .run();
    }
    const headers = Object.fromEntries(response.headers);
    delete headers["transfer-encoding"];
    await route.fulfill({
      status: response.status,
      headers,
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/deploy/");
  await page.waitForFunction(
    (id) => document.getElementById("version")?.value === id,
    versionId,
  );
  await page
    .locator("#nav")
    .getByRole("button", { name: "Versions", exact: true })
    .click();
  await page
    .locator(`[data-version-row="${versionId}"] [data-version-action=publish]`)
    .click();
  const dialog = page.locator("dialog[open]").last();
  await dialog
    .getByRole("button", { name: "Refresh venues and review", exact: true })
    .waitFor({ state: "visible", timeout: 5000 });
  assert.equal(
    await dialog
      .getByRole("button", { name: "Publish saved revision", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(requests.filter((x) => x.path.endsWith("/publish")).length, 0);
  const status = dialog.getByRole("status");
  const refresh = () =>
    dialog.getByRole("button", {
      name: "Refresh venues and review",
      exact: true,
    });
  const confirm = () =>
    dialog.getByRole("button", { name: "Publish saved revision", exact: true });
  const waitStatus = async (text) => {
    try {
      await page.waitForFunction(
        () => {
          const dialog = document.querySelector(
            "dialog[data-publication-dialog][open]",
          );
          return (
            dialog &&
            [...dialog.querySelectorAll("button")].some(
              (b) => b.textContent === "Close" && !b.disabled,
            )
          );
        },
        null,
        { timeout: 5000 },
      );
      await status
        .filter({ hasText: text })
        .waitFor({ state: "visible", timeout: 5000 });
    } catch (error) {
      throw Error(String(text) + ": " + (await status.textContent()), {
        cause: error,
      });
    }
  };
  const posts = (path) =>
    requests.filter((x) => x.path === "/api/deploy/" + path);
  const pendingCount = () => posts("change").length + posts("publish").length;
  const note = page.locator(
    `[data-version-row="${versionId}"] [data-note-input]`,
  );
  const beforeDraft = pendingCount();
  await note.evaluate((el) => {
    el.value = "Unsaved synthetic note";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await refresh().click();
  await waitStatus("Save or discard all drafts");
  assert.equal(await note.inputValue(), "Unsaved synthetic note");
  assert.equal(pendingCount(), beforeDraft);
  await note.evaluate((el) => {
    el.value = "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => {
    document.getElementById("version").value = "";
  });
  await refresh().click();
  await waitStatus("Select a saved planning version");
  assert.equal(pendingCount(), beforeDraft);
  await page.evaluate((id) => {
    document.getElementById("version").value = id;
  }, versionId);
  console.log(
    "PASS dirty version notes and changed selection block recovery without discarding edits.",
  );

  const blocker = await suite.call(admin, "deploy", "/lease", {
    operationId: "other-editor-lease",
    versionId,
    scope: "meta",
    clientId: "other-editor",
  });
  await refresh().click();
  await waitStatus("Check the original receipt");
  const rejectedLease = posts("lease").at(-1).body.operationId;
  await dialog
    .getByRole("button", { name: "Check preparation receipt" })
    .click();
  await waitStatus("Preparation did not commit");
  assert.equal(posts("receipt").at(-1).body.operationId, rejectedLease);
  await suite.call(admin, "deploy", "/lease", {
    operationId: "other-editor-release",
    versionId,
    scope: "meta",
    clientId: "other-editor",
    release: true,
    fence: blocker.fence,
  });
  console.log(
    "PASS lease contention resolves its durable abort before a fresh preparation is permitted.",
  );
  failAfter = "/api/deploy/lease";
  await refresh().click();
  await waitStatus(/Failed to fetch|NetworkError/);
  const originalLease = posts("lease").at(-1).body;
  assert.notEqual(originalLease.operationId, rejectedLease);
  failBefore = "/api/deploy/change";
  await refresh().click();
  await waitStatus("Check the original receipt");
  assert.deepEqual(
    posts("lease").at(-1).body,
    originalLease,
    "lost lease response retries its exact original identity",
  );
  const originalRefresh = posts("change").at(-1).body;
  await dialog
    .getByRole("button", { name: "Check venue refresh receipt" })
    .click();
  await waitStatus("original operation outcome is not confirmed");
  assert.equal(await confirm().isDisabled(), true);
  await dialog
    .getByRole("button", { name: "Retry same venue refresh" })
    .click();
  await waitStatus("Review complete for saved revision 1");
  assert.deepEqual(
    posts("change").at(-1).body,
    originalRefresh,
    "unknown refresh retries the frozen request",
  );
  assert.equal(
    posts("publish").length,
    0,
    "refresh never publishes automatically",
  );
  assert.equal(await confirm().isEnabled(), true);
  const saved = (await suite.call(admin, "deploy", "/bootstrap", { versionId }))
    .current;
  assert.equal(saved.revision, 1);
  assert.equal(saved.venues[0].revision, 7);
  assert.equal(saved.venues[0].form, "1A");
  assert.deepEqual(saved.venues[0].forms, ["1A"]);
  assert.equal(
    await dialog.getByText("Publication committed.", { exact: true }).count(),
    0,
    "refresh is never labelled as a publication",
  );
  const evidence =
    process.env.GSIS_WEB_EVIDENCE_DIR || "/tmp/gsis-deploy-venue-ui";
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, "venue-refresh-mobile.png") });
  const bounds = await dialog.boundingBox();
  assert(
    bounds.x >= 0 && bounds.x + bounds.width <= 390,
    "mobile dialog stays within viewport",
  );
  console.log(
    "PASS lost lease and unknown refresh recover with original identities, retained form assignments and exact revision.",
  );

  // Facts change after review. The real service durably aborts this publication;
  // its HTTP error alone must not be treated as that durable receipt.
  await db
    .prepare(
      "UPDATE deploy_rows SET value=json_remove(value,'$.revision') WHERE version_id=? AND scope='venues'",
    )
    .bind(versionId)
    .run();
  await confirm().click();
  await waitStatus("Check the original receipt");
  const abortedPublication = posts("publish").at(-1).body;
  assert.equal(abortedPublication.revision, 1);
  assert.equal(await refresh().isDisabled(), true);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  // Reopening in this tab retains the failed operation instead of inventing a new one.
  await page.evaluate(
    ({ versionId }) => {
      void GSISV1Publication.open({
        versionId,
        revision: 1,
        name: "Recovered plan",
      });
    },
    { versionId },
  );
  await dialog
    .getByRole("button", { name: "Check original receipt", exact: true })
    .click();
  await waitStatus("This operation did not commit");
  assert.equal(
    posts("receipt").at(-1).body.operationId,
    abortedPublication.operationId,
  );
  assert.equal(await refresh().isEnabled(), true);
  await refresh().click();
  await waitStatus("Review complete for saved revision 2");
  failBefore = "/api/deploy/publish";
  await confirm().click();
  await waitStatus("Check the original receipt");
  const unknownPublication = posts("publish").at(-1).body;
  await dialog
    .getByRole("button", { name: "Check original receipt", exact: true })
    .click();
  await waitStatus("original operation outcome is not confirmed");
  assert.equal(
    await dialog
      .getByRole("button", { name: "Review saved revision", exact: true })
      .isHidden(),
    true,
  );
  failAfter = "/api/deploy/publish";
  await dialog.getByRole("button", { name: "Retry same publication" }).click();
  await waitStatus("Check the original receipt");
  assert.deepEqual(posts("publish").at(-1).body, unknownPublication);
  const committedPublication = posts("publish").at(-1).body;
  assert.notEqual(
    committedPublication.operationId,
    abortedPublication.operationId,
  );
  assert.equal(committedPublication.revision, 2);
  const durable = await suite.call(admin, "deploy", "/receipt", {
    operationId: committedPublication.operationId,
    versionId,
  });
  assert.equal(durable.receipt.state, "committed");
  const originalPublicationId = durable.receipt.result.publicationId;
  await dialog.getByRole("button", { name: "Retry same publication" }).click();
  await waitStatus("Publication committed. Delivery status is independent.");
  assert.deepEqual(posts("publish").at(-1).body, committedPublication);
  assert(
    (await dialog.innerText()).includes(originalPublicationId),
    "shows the original committed publication",
  );
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS n FROM deploy_publications").first())
      .n,
    1,
  );
  console.log(
    "PASS aborted publication permits explicit new intent; lost committed response replays only the original publication.",
  );

  // A newer saved revision must not be silently substituted for the revision
  // returned in the venue refresh receipt.
  await dialog
    .getByRole("button", { name: "Review saved revision", exact: true })
    .click();
  await waitStatus("Review complete");
  await db
    .prepare(
      "UPDATE deploy_rows SET value=json_remove(value,'$.revision') WHERE version_id=? AND scope='venues'",
    )
    .bind(versionId)
    .run();
  await confirm().click();
  await waitStatus("Check the original receipt");
  await dialog
    .getByRole("button", { name: "Check original receipt", exact: true })
    .click();
  await waitStatus("This operation did not commit");
  mutateAfterRefresh = true;
  await refresh().click();
  await waitStatus("saved revision changed after venue refresh");
  assert.equal(await confirm().isDisabled(), true);
  console.log(
    "PASS concurrent saved revision after refresh blocks fresh review and publication.",
  );

  // Reopen during an in-flight lease: both views share the same action lock.
  await dialog
    .getByRole("button", { name: "Review saved revision", exact: true })
    .click();
  await waitStatus("Review complete");
  holdLease = true;
  await confirm().click();
  await page.waitForFunction(
    () =>
      document.querySelector(
        "dialog[data-publication-dialog][open] button.primary",
      )?.disabled,
  );
  for (let i = 0; !releaseLease && i < 500; i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert(releaseLease, "the lease request reached the local Worker route");
  assert.equal(
    await dialog
      .getByRole("button", { name: "Close", exact: true })
      .isDisabled(),
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(await dialog.isVisible(), true);
  const leaseCount = posts("lease").length,
    publishCount = posts("publish").length;
  await page.evaluate(
    ({ versionId }) => {
      document.querySelector("dialog[data-publication-dialog][open]").close();
      void GSISV1Publication.open({
        versionId,
        revision: 999,
        name: "Concurrent reopen",
      });
    },
    { versionId },
  );
  assert.equal(await confirm().isDisabled(), true);
  assert.equal(posts("lease").length, leaseCount);
  assert.equal(posts("publish").length, publishCount);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("gsis:clear-protected-state")),
  );
  releaseLease();
  releaseLease = null;
  await page.waitForFunction(
    () => !document.querySelector("dialog[data-publication-dialog]"),
  );
  await page.waitForLoadState("networkidle");
  assert.equal(
    posts("publish").length,
    publishCount,
    "cleared session cannot publish after delayed lease",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS shared in-flight lock and protected-state clear fence delayed modal callbacks.",
  );
} finally {
  await browser?.close();
  await suite.close();
}
