import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { productSuite, origin } from "./v1-product/suite.mjs";

const evidence =
  process.env.GSIS_WEB_EVIDENCE_DIR ||
  fileURLToPath(
    new URL("../deliverables/v1/evidence/browser/", import.meta.url),
  );
await mkdir(evidence, { recursive: true });
// Actual owner databases and service bindings; no provider or live data access.
const suite = await productSuite({
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-browser.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});
let browser;
try {
  const admin = await suite.seedAccount("workflow-admin"),
    teacher = await suite.seedAccount("workflow-teacher", {
      staffId: "workflow-teacher",
      capabilities: [],
    });
  await suite.call(admin, "contacts", "/staff/create", {
    operationId: "workflow-create-teacher",
    staffId: teacher.staffId,
    basicName: "Synthetic Ordinary Teacher",
  });
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath:
      process.env.GSIS_BROWSER_EXECUTABLE ||
      process.env.ROSTER_TEST_CHROMIUM ||
      undefined,
  });
  const calls = [],
    errors = [];
  async function contextFor(user) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    if (user)
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
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (!request.url().startsWith(origin + "/")) return route.abort();
      calls.push({ url: request.url(), method: request.method() });
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
      page.on("pageerror", (e) => errors.push(e.message)),
    );
    return context;
  }
  const manager = await contextFor(admin),
    page = await manager.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/admin/#health");
  const owner = page.locator("#healthRows > section").filter({
    has: page.getByRole("heading", { name: "contacts", exact: true }),
  });
  await owner
    .getByRole("button", { name: "Create verified owner backup", exact: true })
    .click();
  await owner.getByRole("button", { name: /Download manifest/ }).waitFor();
  await owner.getByRole("button", { name: "Show backup parts" }).click();
  await owner
    .getByRole("button", { name: "Database snapshot", exact: true })
    .waitFor();
  const health = await suite.request(admin, "contacts", "/system/health");
  assert.equal(health.status, 200);
  assert.equal(
    health.body.data.backups.length,
    1,
    "Native backup control produced a verified owner backup",
  );
  await page
    .getByRole("button", { name: "Scheduled service access", exact: true })
    .click();
  const grant = page
    .locator("#serviceRows form")
    .filter({ hasText: "roster.allocate" });
  await grant.getByRole("checkbox").check();
  await grant.getByRole("button", { name: "Save grant" }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#status")?.textContent ===
      "Explicit service grant saved.",
  );
  const grants = await suite.request(admin, "core", "/admin/service-grants");
  assert.equal(
    Boolean(
      grants.body.data.rows.find((r) => r.capability === "roster.allocate")
        .enabled,
    ),
    true,
  );
  await page.goto(origin + "/overlord/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const inventory = page.locator("#settingsBody [data-reference-tables]");
  const resource = inventory.locator("table[data-lord-reference=resources]");
  await inventory
    .locator("[role=status]")
    .filter({ hasText: /Setup required|Saved reference/ })
    .waitFor();
  const resourceSection = resource.locator("xpath=ancestor::section[1]");
  await resourceSection
    .getByRole("button", { name: "Add row", exact: true })
    .click();
  const row = resource.locator("tbody tr").last();
  await row.locator('[data-column="0"]').fill("browser-cart");
  await row.locator('[data-column="1"]').fill("Browser cart");
  await row.locator('[data-column="4"]').fill("MacBook Air");
  await row.locator('[data-column="2"]').fill("20");
  await row.locator('[data-column="3"]').fill("Synthetic cart group");
  await inventory
    .getByRole("button", { name: "Save devices and trolleys", exact: true })
    .click();
  await inventory
    .locator("[role=status]")
    .filter({ hasText: "Atomic save confirmed" })
    .waitFor();
  const resources = (await suite.request(admin, "lord", "/resources")).body
    .data;
  assert(
    (resources.resources || resources.rows || resources).some(
      (row) =>
        row.id === "browser-cart" &&
        row.capacity === 20 &&
        row.cart === "Synthetic cart group",
    ),
  );
  await inventory.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(evidence, "lord-after-resource-create.png"),
  });
  await suite.call(admin, "calendar", "/action", {
    operationId: "workflow-calendar-year",
    action: "saveYear",
    payload: {
      Year: 2027,
      Status: "ACTIVE",
      ReleasedToTeachers: "No",
      expectedMetadataRevision: "missing",
    },
  });
  await page.goto(origin + "/calendar/");
  await page.locator("#yearSelect").selectOption("2027");
  await page.locator("[data-page=events]").click();
  await page.locator("[data-add-date]").first().click();
  await page
    .locator("#eventForm [name=StaffTitle]")
    .fill("Synthetic browser science");
  await page.locator("#eventForm [name=OwnerTag]").selectOption("IP");
  await page.locator("#eventForm [name=Status]").selectOption("HIDDEN");
  await page.locator("#eventSaveBtn").click();
  await page.locator("#eventForm").waitFor({ state: "detached" });
  const calendar = (
    await suite.request(admin, "calendar", "/bootstrap?year=2027")
  ).body.data;
  assert(
    calendar.events.some(
      (event) => event.StaffTitle === "Synthetic browser science",
    ),
  );
  await page
    .locator("[data-event-id]")
    .filter({ hasText: "Synthetic browser science" })
    .first()
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(evidence, "calendar-after-event-create.png"),
  });
  const staffStart = calls.length,
    ordinary = await contextFor(teacher),
    staffPage = await ordinary.newPage();
  await staffPage.goto(origin + "/contacts/");
  await staffPage.waitForFunction(() =>
    document.body.innerText.includes("Contacts are ready"),
  );
  await staffPage
    .getByRole("button", { name: "DIY update", exact: true })
    .click();
  const authority = staffPage.locator("details").filter({
    has: staffPage
      .locator("summary")
      .filter({ hasText: "Accepted authority records" }),
  });
  if ((await authority.getAttribute("open")) === null)
    await authority.locator("summary").click();
  assert.equal(
    await authority.locator("[data-readiness]").isVisible(),
    false,
    "Ordinary staff are not offered manager readiness controls",
  );
  assert.equal(
    await authority.locator("[data-staff] option").count(),
    2,
    "Own authority view lists only the linked staff member",
  );
  await authority.locator("[data-staff]").selectOption(teacher.staffId);
  await authority.locator("[data-records] table").waitFor();
  assert.equal(
    await authority.locator("[data-accept]").isVisible(),
    false,
    "Own authority acceptance is unavailable",
  );
  await staffPage.goto(origin + "/roster/");
  await staffPage.locator('[data-page="My Relief Duties"]').click();
  const duties = staffPage.locator("details").filter({
    has: staffPage.locator("summary").filter({ hasText: "Relief duties done" }),
  });
  await duties
    .locator("[data-range] button")
    .filter({ hasText: "Show duties" })
    .click();
  await duties.locator("[data-totals] table").waitFor();
  assert.equal(await duties.locator("[data-policy]").isVisible(), false);
  assert(
    !calls.slice(staffStart).some((c) => c.url.includes("/api/roster/layers")),
  );
  const guest = await contextFor(null),
    guestPage = await guest.newPage(),
    before = calls.length;
  await guestPage.goto(
    origin + "/roster/external/?token=invalid-synthetic-token",
  );
  await guestPage.waitForFunction(
    () =>
      document.querySelector("#status")?.textContent !==
      "Checking this private link…",
  );
  assert.equal(new URL(guestPage.url()).searchParams.has("token"), false);
  assert.equal(await guestPage.locator("#response").isVisible(), false);
  assert(
    !calls.slice(before).some((c) => c.url.includes("/api/core/")),
    "Narrow external links do not initiate Google or Core account authentication",
  );
  assert(
    calls.slice(before).some((c) => c.url === origin + "/api/roster/external"),
    "The guest page validates its opaque link against the real owner service",
  );
  await writeFile(
    join(evidence, "workflows-results.json"),
    JSON.stringify(
      {
        source: "actual isolated Workers and browser",
        verified: [
          "Contacts owner backup with manifest and parts",
          "explicit scheduled service grant",
          "LORD resource creation",
          "Calendar event creation",
          "own-only Contacts and Roster views",
          "invalid guest link denial",
        ],
        screenshots: [
          "lord-after-resource-create.png",
          "calendar-after-event-create.png",
        ],
        pageErrors: errors,
        officialRuntimeUAT: "Not tested",
      },
      null,
      2,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS actual browser Admin owner backup/service grant, LORD resource setup, Calendar event creation, own-only Contacts and Roster panels, invalid private link denial without Google/Core login. Official runtime UAT: Not tested.",
  );
  await Promise.all([manager.close(), ordinary.close(), guest.close()]);
} finally {
  await browser?.close();
  await suite.close();
}
