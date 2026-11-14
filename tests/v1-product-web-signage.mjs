import assert from "node:assert/strict";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { digest } from "../v1/runtime/store.mjs";
const suite = await productSuite({
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-signage.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});
let browser;
try {
  const admin = await suite.seedAccount("signage-admin"),
    borrower = await suite.seedAccount("signage-borrower", {
      staffId: "signage-staff",
      capabilities: ["lord.borrow"],
    });
  await suite.call(admin, "contacts", "/staff/create", {
    operationId: "signage-staff",
    staffId: borrower.staffId,
    basicName: "Synthetic Photo Borrower",
  });
  const person = (
    await suite.request(admin, "contacts", "/staff/" + borrower.staffId)
  ).body.data;
  await suite.call(
    admin,
    "contacts",
    "/staff/" + borrower.staffId + "/update",
    {
      operationId: "signage-staff-facts",
      revision: person.revision,
      changes: {
        employmentActive: true,
        email: "signage-borrower@example.invalid",
      },
    },
  );
  await suite.call(admin, "lord", "/reference/refresh", {
    operationId: "signage-refs",
  });
  for (const id of ["cart-a", "cart-b"])
    await suite.call(admin, "lord", "/resources", {
      operationId: "signage-" + id,
      resourceId: id,
      name: "Synthetic " + id,
      type: "tablet",
      capacity: 20,
      revision: 0,
    });
  await suite.call(admin, "lord", "/settings", {
    operationId: "signage-periods",
    key: "periodTimings",
    revision: 0,
    value: {
      periods: [
        { code: "1", start: "07:30", end: "08:00" },
        { code: "2", start: "08:00", end: "08:30" },
      ],
    },
  });
  const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
    booking = await suite.call(borrower, "lord", "/bookings", {
      operationId: "signage-booking",
      date,
      startPeriod: 1,
      endPeriod: 2,
      resourceId: "cart-a",
      quantity: 10,
      classOrActivity: "Synthetic class",
      subject: "Science",
    }),
    photo = await suite.call(borrower, "lord", "/photos", {
      operationId: "signage-photo",
      bookingId: booking.bookingId,
      mime: "image/png",
      base64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6xUAAAAASUVORK5CYII=",
    });
  await suite.call(borrower, "lord", "/collect", {
    operationId: "signage-collect",
    bookingId: booking.bookingId,
    revision: 1,
    items: [{ resourceId: "cart-a", quantity: 10 }],
    photoIds: [photo.photoId],
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
    errors = [],
    photoCalls = [];
  async function context(user) {
    const c = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    if (user)
      await c.addCookies([
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
    await c.addInitScript(() => {
      const revoke = URL.revokeObjectURL;
      window.revokedPhotos = [];
      URL.revokeObjectURL = function (url) {
        window.revokedPhotos.push(url);
        return revoke.call(URL, url);
      };
    });
    await c.route("**/*", async (route) => {
      const request = route.request();
      urls.push(request.url());
      if (!request.url().startsWith(origin + "/")) return route.abort();
      const headers = await request.allHeaders();
      if (new URL(request.url()).searchParams.has("photoId"))
        photoCalls.push({ url: request.url(), headers });
      const response = await suite.mf.dispatchFetch(request.url(), {
          method: request.method(),
          headers,
          body: ["GET", "HEAD"].includes(request.method())
            ? undefined
            : request.postDataBuffer(),
        }),
        out = Object.fromEntries(response.headers);
      delete out["transfer-encoding"];
      await route.fulfill({
        status: response.status,
        headers: out,
        body: Buffer.from(await response.arrayBuffer()),
      });
    });
    c.on("page", (p) => {
      p.setDefaultTimeout(10000);
      p.on("pageerror", (e) => errors.push(e.message));
    });
    return c;
  }
  const manager = await context(admin),
    managerPage = await manager.newPage();
  await managerPage.goto(origin + "/overlord/");
  await managerPage
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  const access = managerPage
    .locator("details")
    .filter({
      has: managerPage.locator("summary").filter({ hasText: "Signage access" }),
    });
  if ((await access.getAttribute("open")) === null)
    await access.locator("summary").click();
  const create = access.locator("[data-create]");
  await create.locator("[name=deviceId]").fill("synthetic-display");
  assert.equal(
    await create.locator("[name=photos]").isChecked(),
    false,
    "Photo access requires explicit opt-in",
  );
  await create.locator("[name=resource][value=cart-a]").check();
  await create.locator("[name=photos]").check();
  await create
    .getByRole("button", { name: "Create device token", exact: true })
    .click();
  await managerPage.waitForFunction(() =>
    /^[a-f0-9]{64}$/.test(
      document.querySelector("[data-token]")?.textContent || "",
    ),
  );
  const token = (await create.locator("[data-token]").textContent()).trim();
  const boardResponse = await suite.mf.dispatchFetch(
      origin + "/api/lord/board",
      { headers: { "X-GSiS-Device-Token": token } },
    ),
    boardEnvelope = await boardResponse.json();
  assert(Number.isFinite(boardEnvelope.data.validUntil));
  const sameResponse = await suite.mf.dispatchFetch(
      origin +
        "/api/lord/board?since=" +
        encodeURIComponent(boardEnvelope.data.revision),
      { headers: { "X-GSiS-Device-Token": token } },
    ),
    sameEnvelope = await sameResponse.json();
  assert.equal(sameEnvelope.data.unchanged, true);
  assert.equal(sameEnvelope.data.validUntil, boardEnvelope.data.validUntil);
  const device = await context(null),
    page = await device.newPage();
  let activationCount = 0;
  async function useToken(value) {
    const configurator = await suite.seedAccount(
      "display-setup-" + ++activationCount,
    );
    await device.addCookies([
      {
        name: "__Host-gsis_session",
        value: configurator.token,
        domain: "gsis.example.invalid",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto(origin + "/overlord/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const settings = page
      .locator("#settingsBody details")
      .filter({
        has: page.locator("summary").filter({ hasText: "Signage access" }),
      });
    if ((await settings.getAttribute("open")) === null)
      await settings.locator("summary").click();
    await settings.locator("[data-use] [name=token]").fill(value);
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/starlord/"),
      settings
        .getByRole("button", { name: "Use in this tab", exact: true })
        .click(),
    ]);
    assert.equal(
      await page
        .locator("summary")
        .filter({ hasText: "Signage access" })
        .count(),
      0,
      "STARLORD contains no administrative settings",
    );
    const sessionCheck = await suite.request(configurator, "core", "/session");
    assert.equal(
      sessionCheck.status,
      401,
      "Device activation revokes its configuring staff session",
    );
  }
  await useToken(token);
  await page.waitForFunction(() =>
    [...document.querySelectorAll("img[data-private-photo]")].some(
      (image) => image.complete && image.naturalWidth === 1,
    ),
  );
  assert(photoCalls.length > 0);
  assert(
    photoCalls.every(
      (call) =>
        call.headers["x-gsis-device-token"] === token && !call.headers.cookie,
    ),
    "Private photos use only the scoped device credential",
  );
  assert.equal(await page.locator("[data-private-photo]").count(), 1);
  await suite.call(admin, "lord", "/links/revoke", {
    operationId: "signage-revoke",
    tokenHash: await digest(token),
  });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForFunction(() =>
    document
      .querySelector("#feedStatus")
      ?.textContent.includes("expired or was revoked"),
  );
  assert.equal(await page.locator("[data-private-photo]").count(), 0);
  assert(
    await page.evaluate(() => window.revokedPhotos.length > 0),
    "Revocation releases the private object URL",
  );
  assert(
    !(await page
      .locator("body")
      .innerText()
      .then((t) => t.includes("Synthetic Photo Borrower"))),
  );
  const plain = await suite.call(admin, "lord", "/links", {
    operationId: "signage-no-photos",
    purpose: "signage",
    deviceId: "plain-display",
    resourceIds: ["cart-a"],
    photos: false,
    expiresAt: Date.now() + 3600000,
  });
  const before = photoCalls.length;
  await useToken(plain.token);
  await page.waitForFunction(() =>
    document
      .querySelector("#activeGrid")
      ?.textContent.includes("Synthetic Photo Borrower"),
  );
  assert.equal(await page.locator("[data-private-photo]").count(), 0);
  assert.equal(
    photoCalls.length,
    before,
    "A no-photo token never fetches private image bytes",
  );
  const other = await suite.call(admin, "lord", "/links", {
    operationId: "signage-other-scope",
    purpose: "signage",
    deviceId: "other-display",
    resourceIds: ["cart-b"],
    photos: true,
    expiresAt: Date.now() + 3600000,
  });
  await useToken(other.token);
  await page.waitForFunction(() =>
    document
      .querySelector("#activeGrid")
      ?.textContent.includes("No active or upcoming"),
  );
  assert(
    !(await page
      .locator("body")
      .innerText()
      .then((t) => t.includes("Synthetic Photo Borrower"))),
  );
  assert.equal(await page.locator("[data-private-photo]").count(), 0);
  assert(
    !urls.some((url) =>
      [token, plain.token, other.token].some((secret) => url.includes(secret)),
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS actual STARLORD photo opt-in, authorized private image rendering, revoked token clears DOM/object URLs, no-photo token makes no image request, and resource scope changes cannot restore another display. Official runtime UAT: Not tested.",
  );
} finally {
  if (browser) {
    await Promise.all(
      browser.contexts().map((c) => c.unrouteAll({ behavior: "wait" })),
    );
    await browser.close();
  }
  await suite.close();
}
