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
const suite = await productSuite({
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-browser.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});
let browser;
try {
  const admin = await suite.seedAccount("lord-browser-admin"),
    borrower = await suite.seedAccount("lord-browser-borrower", {
      staffId: "lord-browser-staff",
      capabilities: ["lord.borrow"],
    });
  await suite.call(admin, "contacts", "/staff/create", {
    operationId: "lord-browser-create-staff",
    staffId: borrower.staffId,
    basicName: "Synthetic Borrower",
  });
  const person = (
    await suite.request(admin, "contacts", "/staff/" + borrower.staffId)
  ).body.data;
  await suite.call(
    admin,
    "contacts",
    "/staff/" + borrower.staffId + "/update",
    {
      operationId: "lord-browser-staff-facts",
      revision: person.revision,
      changes: {
        employmentActive: true,
        email: "lord-browser-borrower@example.invalid",
      },
    },
  );
  await suite.call(admin, "lord", "/resources", {
    operationId: "lord-browser-resource",
    resourceId: "browser-cart",
    name: "Browser cart",
    type: "tablet",
    capacity: 20,
    revision: 0,
  });
  await suite.call(admin, "lord", "/reference/refresh", {
    operationId: "lord-browser-references",
  });
  await suite.call(admin, "lord", "/settings", {
    operationId: "lord-browser-periods",
    key: "periodTimings",
    revision: 0,
    value: {
      periods: [
        { code: "1", start: "07:30", end: "08:00" },
        { code: "2", start: "08:00", end: "08:30" },
      ],
    },
  });
  const date = new Date(Date.now() + 8 * 3600000 - 86400000)
      .toISOString()
      .slice(0, 10),
    booking = await suite.call(borrower, "lord", "/bookings", {
      operationId: "lord-browser-booking",
      date,
      startPeriod: 1,
      endPeriod: 2,
      resourceId: "browser-cart",
      quantity: 10,
      classOrActivity: "Synthetic class",
      subject: "Science",
    });
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath:
      process.env.GSIS_BROWSER_EXECUTABLE ||
      process.env.ROSTER_TEST_CHROMIUM ||
      undefined,
  });
  const urls = [],
    errors = [];
  async function makeContext(user) {
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
      urls.push(request.url());
      if (!request.url().startsWith(origin + "/")) return route.abort();
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
    context.on("page", (page) => {
      page.setDefaultTimeout(10000);
      page.on("pageerror", (error) => errors.push(error.message));
    });
    return context;
  }
  const owner = await makeContext(borrower),
    page = await owner.newPage();
  await page.goto(origin + "/lord/");
  await page.locator("[data-lord-edit-bookings]").click();
  await page.locator("[data-lord-edit-booking]").click();
  const editor = page.locator("#gsisLordBookingEditor");
  await editor
    .locator("[name=classOrActivity]")
    .fill("Revised synthetic class");
  await editor.locator("[name=quantity0]").fill("12");
  await editor.locator("[data-lord-submit]").click();
  await editor
    .locator("[data-lord-status]")
    .filter({ hasText: "confirmed saved" })
    .waitFor();
  const updated = (
    await suite.request(
      borrower,
      "lord",
      "/bookings/get?bookingId=" + booking.bookingId,
    )
  ).body.data.booking;
  assert.equal(updated.classOrActivity, "Revised synthetic class");
  assert.equal(updated.items[0].quantity, 12);
  assert.equal(updated.revision, 2);
  await page.screenshot({
    path: join(evidence, "lord-after-own-booking-edit.png"),
  });
  const declaration = await suite.call(borrower, "lord", "/bookings/respond", {
    operationId: "lord-browser-missing-photo-declaration",
    bookingId: booking.bookingId,
    revision: 2,
    confirmed: true,
    response: "collected",
    items: [{ resourceId: "browser-cart", quantity: 8 }],
  });
  assert(declaration.incidentId);
  const issuer = await makeContext(admin),
    adminPage = await issuer.newPage();
  await adminPage.goto(origin + "/overlord/");
  await adminPage
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  const linkForm = adminPage.locator("[data-incident-link]");
  await linkForm
    .locator("[name=incidentId]")
    .selectOption(declaration.incidentId);
  await linkForm
    .getByRole("button", { name: "Create response link", exact: true })
    .click();
  await linkForm.locator("[data-response-link]").waitFor();
  const issuedHref = await linkForm
      .locator("[data-response-link]")
      .getAttribute("href"),
    issued = new URL(issuedHref),
    link = {
      token: new URLSearchParams(issued.hash.slice(1)).get("incidentToken"),
    };
  assert(link.token);
  assert(!issued.search.includes(link.token));
  await adminPage.screenshot({
    path: join(evidence, "overlord-created-scoped-response-link.png"),
  });
  const guest = await makeContext(null),
    guestPage = await guest.newPage();
  await guestPage.goto(issuedHref);
  await guestPage.waitForURL(
    (url) =>
      url.pathname === "/" &&
      url.searchParams.get("next")?.startsWith("/lord/"),
  );
  assert.equal(
    new URLSearchParams(new URL(guestPage.url()).hash.slice(1)).get(
      "incidentToken",
    ),
    link.token,
  );
  assert(
    !new URL(guestPage.url()).search.includes(link.token),
    "Login continuation retains the token only in the fragment",
  );
  await guest.addCookies([
    {
      name: "__Host-gsis_session",
      value: borrower.token,
      domain: "gsis.example.invalid",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await guestPage.reload();
  await guestPage.waitForURL((url) => url.pathname === "/lord/");
  const incident = guestPage.locator("#gsisLordIncidentResponse");
  await incident
    .locator("[name=response]")
    .fill("Synthetic account holder confirms the collection details.");
  await incident.locator("[data-lord-submit]").click();
  await incident
    .locator("[data-lord-status]")
    .filter({ hasText: "confirmed recorded" })
    .waitFor();
  const stored = (
    await suite.request(
      admin,
      "lord",
      "/incidents/get?incidentId=" + declaration.incidentId,
    )
  ).body.data;
  assert.equal((stored.incident || stored).status, "responded");
  await guestPage.screenshot({
    path: join(evidence, "lord-after-scoped-incident-response.png"),
  });
  assert(
    !urls.some((url) => url.includes(link.token)),
    "Scoped token never enters browser request URLs, including login continuation or context reads",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    join(evidence, "lord-workflows-results.json"),
    JSON.stringify(
      {
        source: "actual isolated Workers and browser",
        verified: [
          "own BOOKED edit with exact viewed revision",
          "persisted quantity and class change",
          "Admin-issued incident response link",
          "signed incident recipient response",
          "fragment-preserving login continuation",
          "raw scoped token absent from request URLs",
        ],
        pageErrors: errors,
        officialRuntimeUAT: "Not tested",
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS actual LORD own-booking edit and scoped incident response, with token-private login continuation. Official runtime UAT: Not tested.",
  );
  await Promise.all([owner.close(), issuer.close(), guest.close()]);
} finally {
  await browser?.close();
  await suite.close();
}
