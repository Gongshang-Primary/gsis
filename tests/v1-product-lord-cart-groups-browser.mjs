/** Actual built LORD UI/client with synthetic transport. This checks browser
 * intent/retry binding; durable membership races are in the Worker/D1 program. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { buildWeb } from "../scripts/v1/build-web.mjs";
import { productSuite, origin as workerOrigin } from "./v1-product/suite.mjs";
import { digest } from "../v1/runtime/store.mjs";
const output = await mkdtemp(join(tmpdir(), "gsis-lord-groups-browser-"));
const origin = "https://lord-groups.example.invalid";
const session = {
  schoolId: "synthetic-school",
  csrfToken: "synthetic-csrf",
  expiresAt: Date.now() + 86400000,
  capabilities: ["lord.borrow"],
  user: {
    accountId: "synthetic-user",
    staffId: "synthetic-staff",
    email: "synthetic@example.invalid",
    ttbName: "Synthetic User",
  },
};
const group = (cart, type, prefix) => ({
  resource: cart,
  name: cart,
  deviceType: type,
  capacity: 42,
  active: true,
  stylusOption: true,
  headphoneOption: true,
  bookingGroup: {
    cart,
    revision: prefix.repeat(64).slice(0, 64),
    members: [1, 2, 3].map((i) => ({
      resourceId: prefix + "-" + i,
      revision: 1,
      capacity: 14,
    })),
  },
});
let reference = {
  bookingResources: [
    group("B1", "laptop", "b"),
    group("Z10", "tablet", "d"),
    group("A1", "ipad", "a"),
    group("Z2", "tablet", "c"),
  ],
  trolleys: [],
  teachers: ["Synthetic User"],
  staff: [{ staffId: "synthetic-staff", name: "Synthetic User" }],
  classes: ["Synthetic class"],
  subjects: ["Science"],
  periods: [1, 2, 3, 4].map((i) => ({
    code: String(i),
    start: "08:00",
    end: "08:30",
    active: true,
  })),
};
reference.trolleys = reference.bookingResources.flatMap((g) =>
  g.bookingGroup.members.map((m) => ({
    id: m.resourceId,
    name: m.resourceId,
    group: g.resource,
    deviceType: g.deviceType,
    defaultQuantity: m.capacity,
  })),
);
let booking = {
  bookingId: "synthetic-booking",
  staffId: "synthetic-staff",
  date: "2026-11-20",
  startPeriod: "1",
  endPeriod: "2",
  status: "BOOKED",
  revision: 4,
  resource: "Z2",
  requestedQuantity: 20,
  reservedCapacity: 42,
  groupState: "verified",
  bookingGroup: structuredClone(reference.bookingResources[3].bookingGroup),
  classOrActivity: "Synthetic class",
  subject: "Science",
  remarks: "",
  deviceType: "tablet",
  items: reference.bookingResources[3].bookingGroup.members.map((m) => ({
    resourceId: m.resourceId,
    quantity: m.capacity,
  })),
  trolleys: reference.bookingResources[3].bookingGroup.members.map((m) => ({
    resourceId: m.resourceId,
    trolleyRecordId: m.resourceId,
    name: m.resourceId,
    quantity: 0,
    remainingQuantity: 0,
  })),
};
let mode = "success";
const ownerDigests = new Map();
let releaseReceipt, receiptStarted;
const receipt = (operationId, state = "committed") => ({
  operationId,
  digest:
    mode === "wrongDigest"
      ? "0".repeat(64)
      : ownerDigests.get(operationId) || "f".repeat(64),
  state,
  ...(state === "committed" ? { committedAt: 1 } : { abortedAt: 1 }),
});
const writes = [],
  unexpected = [],
  errors = [];
let browser, live;
async function capture(name, page) {
  const dir = process.env.GSIS_WEB_EVIDENCE_DIR;
  if (dir) {
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: join(dir, name), fullPage: true });
  }
}
try {
  await buildWeb(join(output, "web"));
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.GSIS_BROWSER_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(5000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.origin !== origin) {
      unexpected.push(url.href);
      return route.abort();
    }
    const reply = (data, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({
          ok: status === 200,
          ...(status === 200 ? { data } : { error: data }),
        }),
      });
    if (url.pathname === "/api/core/session") return reply(session);
    if (url.pathname === "/api/core/config")
      return reply({
        schoolId: "synthetic-school",
        schoolName: "Synthetic school",
        configured: true,
      });
    if (url.pathname.startsWith("/api/lord/")) {
      const body = req.postDataJSON(),
        action = String(
          body?.action || url.searchParams.get("action") || "",
        ).toLowerCase();
      if (req.method() === "POST") {
        writes.push({ path: url.pathname, body: structuredClone(body) });
        const wire = structuredClone(body);
        delete wire.requestId;
        const ownerAction =
          url.pathname.endsWith("/bookings/update") ||
          action === "bookingupdate"
            ? "bookingupdate"
            : Array.isArray(body.bookings)
              ? "bookingcreatebatch"
              : action === "bookingcreate" ||
                  url.pathname === "/api/lord/bookings"
                ? "bookingcreate"
                : action;
        ownerDigests.set(
          body.operationId,
          await digest({
            schoolId: session.schoolId,
            actorId: session.user.accountId,
            action: "lord." + ownerAction,
            intent: wire,
          }),
        );
        if (mode === "lost") return route.abort("failed");
        if (mode === "pending") return reply({ state: "unknown" });
        if (mode === "stale")
          return reply(
            {
              code: "GROUP_REVISION_CONFLICT",
              message: "The cart membership changed.",
              retryable: false,
            },
            409,
          );
        return reply({
          receipt: {
            ...receipt(body.operationId),
            ...(mode === "wrongReceipt"
              ? { operationId: "different-operation" }
              : {}),
          },
          result: {
            bookingId: booking.bookingId,
            revision: 5,
            bookings: [
              {
                bookingId: "created-booking",
                resource: "Z2",
                date: booking.date,
                periodRange: "P1–P2",
                requestedQuantity: 20,
              },
            ],
          },
        });
      }
      if (url.pathname.endsWith("/reference")) return reply(reference);
      if (url.pathname.endsWith("/bookings/get") || action === "bookingget")
        return reply({ booking });
      if (url.pathname.endsWith("/bookings"))
        return reply({ bookings: [booking] });
      if (action === "session") return reply({ session: booking });
      if (action === "bookingdayschedule")
        return reply({
          bookings: [{ ...booking, startPeriod: "3", endPeriod: "4" }],
        });
      if (action === "bookingeligible") return reply({ bookings: [booking] });
      if (action === "open") return reply({ sessions: [booking] });
      if (url.pathname.endsWith("/receipt") && mode === "holdTerminal") {
        await new Promise((resolve) => {
          releaseReceipt = resolve;
          receiptStarted?.();
        });
        return reply({
          ...receipt(
            url.searchParams.get("operationId"),
            "terminal-not-committed",
          ),
        });
      }
      if (url.pathname.endsWith("/receipt"))
        return reply({
          ...receipt(
            url.searchParams.get("operationId"),
            mode === "terminal"
              ? "terminal-not-committed"
              : ["success", "wrongReceipt", "wrongDigest"].includes(mode)
                ? "committed"
                : "unknown",
          ),
          ...(mode === "wrongReceipt"
            ? { operationId: "different-operation" }
            : {}),
          result: { bookingId: booking.bookingId },
        });
      if (
        url.pathname.endsWith("/bookings/availability") ||
        action === "bookingavailability"
      )
        return reply({
          available: true,
          advisory: true,
          recheckedAtCommit: true,
        });
      if (url.pathname.endsWith("/profile"))
        return reply({ capabilities: ["lord.borrow"] });
      unexpected.push(url.pathname + url.search);
      return reply({});
    }
    try {
      const pathname = url.pathname.endsWith("/")
        ? url.pathname + "index.html"
        : url.pathname;
      return route.fulfill({
        contentType: pathname.endsWith(".html")
          ? "text/html"
          : pathname.endsWith(".js")
            ? "text/javascript"
            : pathname.endsWith(".css")
              ? "text/css"
              : pathname.endsWith(".svg")
                ? "image/svg+xml"
                : "application/octet-stream",
        body: await readFile(join(output, "web", pathname)),
      });
    } catch {
      unexpected.push(url.pathname);
      return route.fulfill({ status: 404, body: "" });
    }
  });
  await page.goto(origin + "/lord/");
  await page.locator("#bookBtn").waitFor();
  await page.locator("#bookBtn").click();
  await page.locator(".resource-name").first().waitFor();
  assert.deepEqual(
    await page.locator(".resource-name strong").allTextContents(),
    ["Z2", "Z10", "A1", "B1"],
    "explicit device type then natural cart order",
  );
  const intent = {
    action: "bookingCreateBatch",
    clientRequestId: "synthetic-group-op",
    date: booking.date,
    classOrActivity: "Synthetic class",
    subject: "Science",
    bookings: [
      {
        resource: "Z2",
        requestedQuantity: 20,
        startPeriod: "1",
        endPeriod: "2",
        deviceType: "tablet",
      },
    ],
  };
  await page.evaluate(async (body) => {
    await GSISV1.request("lord", "/transaction", { method: "POST", body });
  }, intent);
  assert.deepEqual(
    writes.at(-1).body.bookings[0].bookingGroup,
    booking.bookingGroup,
    "native group selection must carry the exact viewed member/revision vector",
  );
  console.log(
    "PASS LORD grouped native grid/type order and exact viewed cart selection.",
  );
  const send = (body) =>
    page.evaluate(async (body) => {
      try {
        return {
          result: await GSISV1.request("lord", "/transaction", {
            method: "POST",
            body,
          }),
        };
      } catch (error) {
        return { code: error.code, message: error.message };
      }
    }, body);
  const stored = () =>
    page.evaluate(() =>
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("gsis-lord-group-bindings:"))
        .map((k) => ({ key: k, value: JSON.parse(sessionStorage.getItem(k)) })),
    );
  const originalGroup = structuredClone(booking.bookingGroup);
  await page
    .locator('.timetable-cell[data-resource="Z2"][data-code="1"]')
    .click();
  await page
    .locator('.timetable-cell[data-resource="Z2"][data-code="2"]')
    .click();
  assert(
    (await page
      .locator('.timetable-cell.occupied[data-resource="Z2"]')
      .count()) > 0,
    "existing cart occupancy is visible",
  );
  reference.bookingResources[3].bookingGroup = {
    ...structuredClone(originalGroup),
    revision: "e".repeat(64),
    members: originalGroup.members.map((m) => ({ ...m, revision: 2 })),
  };
  await page.evaluate(() => GSISV1.request("lord", "/reference"));
  await send({ ...intent, clientRequestId: "viewed-before-refresh" });
  assert.deepEqual(
    writes.at(-1).body.bookings[0].bookingGroup,
    originalGroup,
    "background refresh cannot rebind the displayed range",
  );
  console.log(
    "PASS LORD displayed group vector survives a background reference refresh.",
  );

  mode = "lost";
  const lost = { ...intent, clientRequestId: "lost-cart-operation" };
  const lostResult = await send(lost);
  assert(lostResult.message);
  const firstLost = structuredClone(writes.at(-1).body);
  mode = "success";
  await page.reload();
  await page.locator("#bookBtn").waitFor();
  await send(lost);
  assert.deepEqual(
    writes.at(-1).body,
    firstLost,
    "reload/retry keeps original membership and intent",
  );
  const count = writes.length;
  assert.equal(
    (
      await send({
        ...lost,
        bookings: [{ ...lost.bookings[0], requestedQuantity: 21 }],
      })
    ).code,
    "OPERATION_ID_REUSED",
  );
  assert.equal(
    writes.length,
    count,
    "changed intent is never sent under old ID",
  );
  const records = (await stored()).flatMap((s) => s.value);
  assert(records.some((r) => r.operationId === "lost-cart-operation"));
  assert(
    records.every(
      (r) =>
        Object.keys(r).sort().join(",") ===
        "intentHash,operationId,ownerDigest,selections,terminal",
    ),
    "retained state contains binding only, not full staff/booking payloads",
  );
  mode = "wrongReceipt";
  const wrong = { ...intent, clientRequestId: "wrong-receipt" };
  assert.equal((await send(wrong)).code, "RECEIPT_MISMATCH");
  assert.equal(
    (await stored())
      .flatMap((s) => s.value)
      .find((r) => r.operationId === "wrong-receipt").terminal,
    false,
    "wrong-operation receipt cannot retire original binding",
  );
  mode = "wrongDigest";
  const wrongDigest = { ...intent, clientRequestId: "wrong-digest" };
  assert.equal((await send(wrongDigest)).code, "RECEIPT_MISMATCH");
  assert.equal(
    (await stored())
      .flatMap((s) => s.value)
      .find((r) => r.operationId === "wrong-digest").terminal,
    false,
  );
  const digestRead = await page.evaluate(async () => {
    try {
      await GSISV1.request("lord", "/receipt?operationId=wrong-digest");
      return "";
    } catch (e) {
      return e.code;
    }
  });
  assert.equal(digestRead, "RECEIPT_MISMATCH");
  mode = "success";
  const malformed = {
    ...intent,
    clientRequestId: "bad-member",
    bookings: [
      {
        ...intent.bookings[0],
        bookingGroup: { ...originalGroup, members: [null] },
      },
    ],
  };
  const beforeMalformed = writes.length;
  const pendingBeforeMalformed = await page.evaluate(() => GSISV1.pending());
  assert.equal((await send(malformed)).code, "GROUP_SELECTION_INVALID");
  assert.equal(writes.length, beforeMalformed);
  assert.deepEqual(
    await page.evaluate(() => GSISV1.pending()),
    pendingBeforeMalformed,
    "a rejected new cart preparation does not leak a generic pending slot",
  );
  const savedStorage = await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((k) =>
      k.startsWith("gsis-lord-group-bindings:"),
    );
    const raw = sessionStorage.getItem(key);
    sessionStorage.setItem(key, "{");
    return { key, raw };
  });
  assert.equal(
    (await send({ ...intent, clientRequestId: "bad-storage" })).code,
    "GROUP_SELECTION_INVALID",
  );
  assert.deepEqual(
    await page.evaluate(() => GSISV1.pending()),
    pendingBeforeMalformed,
    "malformed storage does not retain an unsent fresh intent",
  );
  assert.equal((await send(wrong)).code, "GROUP_SELECTION_INVALID");
  assert.deepEqual(
    await page.evaluate(() => GSISV1.pending()),
    pendingBeforeMalformed,
    "preparation failure must retain a pre-existing unknown operation",
  );
  assert.equal(
    writes.length,
    beforeMalformed,
    "failed preparations send no POST",
  );
  await page.evaluate(
    ({ key, raw }) => sessionStorage.setItem(key, raw),
    savedStorage,
  );
  console.log(
    "PASS LORD lost-response/reload binding, changed-intent denial, wrong receipt and malformed stored/vector negatives.",
  );

  async function editCurrent() {
    await page.locator("[data-lord-edit-bookings]").click();
    await page.locator("[data-lord-edit-booking]").click();
    await page.waitForFunction(
      () =>
        document.querySelector("[data-lord-booking-form]") ||
        document
          .querySelector("#gsisLordBookingEditor [data-lord-status]")
          ?.textContent.includes("does not prove"),
    );
    return page.locator("#gsisLordBookingEditor");
  }
  let editor = await editCurrent();
  assert.equal(await editor.locator("[data-lord-cart-quantity]").count(), 1);
  assert.equal(
    await editor.locator("[data-resource-id]").count(),
    0,
    "cart editing cannot shrink physical reservations",
  );
  await editor.locator("[name=requestedQuantity]").fill("18");
  await editor.locator("[data-lord-submit]").click();
  await editor
    .locator("[data-lord-status]")
    .filter({ hasText: "confirmed saved" })
    .waitFor();
  let editWrite = writes.at(-1).body;
  assert.equal(editWrite.requestedQuantity, 18);
  assert.equal(editWrite.items, undefined);
  assert.deepEqual(editWrite.bookingGroup, originalGroup);
  await editor.locator("[data-lord-close]").click();
  booking.requestedQuantity = null;
  editor = await editCurrent();
  assert.equal(
    await editor.locator("[name=requestedQuantity]").inputValue(),
    "",
  );
  assert.match(
    await editor.innerText(),
    /original requested quantity was not recorded/,
  );
  assert.match(await editor.innerText(), /42 devices reserved/);
  await editor.locator("[name=requestedQuantity]").fill("19");
  mode = "stale";
  await editor.locator("[data-lord-submit]").click();
  await editor
    .locator("[data-lord-status]")
    .filter({ hasText: "outcome is not confirmed" })
    .waitFor();
  assert.equal(
    await editor.locator("fieldset").evaluate((node) => node.disabled),
    true,
  );
  const staleOperation = writes.at(-1).body.operationId;
  mode = "holdTerminal";
  const terminalStarted = new Promise((resolve) => (receiptStarted = resolve));
  await editor.locator("[data-lord-check-receipt]").click();
  await terminalStarted;
  await editor.locator("[data-lord-close]").click();
  await page.locator("[data-lord-edit-bookings]").click();
  editor = page.locator("#gsisLordBookingEditor");
  await editor.locator("[data-lord-booking-form]").waitFor();
  releaseReceipt();
  await editor.locator("[data-lord-reload-booking]").waitFor();
  booking.bookingGroup = structuredClone(
    reference.bookingResources[3].bookingGroup,
  );
  mode = "success";
  await editor.locator("[data-lord-reload-booking]").click();
  await editor.locator("[name=requestedQuantity]").fill("19");
  await editor.locator("[data-lord-submit]").click();
  await editor
    .locator("[data-lord-status]")
    .filter({ hasText: "confirmed saved" })
    .waitFor();
  assert.notEqual(writes.at(-1).body.operationId, staleOperation);
  assert.deepEqual(writes.at(-1).body.bookingGroup, booking.bookingGroup);
  await editor.locator("[data-lord-close]").click();
  booking.groupState = "unresolved";
  editor = await editCurrent();
  assert.equal(await editor.locator("[data-lord-booking-form]").count(), 0);
  assert.match(
    await editor.innerText(),
    /does not prove one complete current cart/,
  );
  await editor.locator("[data-lord-close]").click();
  booking.groupState = "verified";
  console.log(
    "PASS LORD cart-only edits, unknown historical requested quantity and terminal receipt/reload separation.",
  );

  await page.evaluate(() => loadEligibleBookings());
  await page.locator(".booking-list .session-card").first().waitFor();
  assert.match(
    await page.locator(".booking-list").innerText(),
    /Requested:\s*Not recorded/,
  );
  assert.doesNotMatch(
    await page.locator(".booking-list").innerText(),
    /Requested:\s*null/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate((value) => startBookingCollection(value), booking);
  assert.equal(
    await page.locator("#trolleyList .trolley-card").count(),
    3,
    "collection still lists three physical trolleys",
  );
  await capture("lord-physical-collection-narrow.png", page);
  const movement = {
    action: "loan",
    operationId: "physical-collection",
    bookingId: booking.bookingId,
    revision: booking.revision,
    trolleys: [
      { resourceId: "c-1", quantity: 8 },
      { resourceId: "c-3", quantity: 4 },
    ],
  };
  await send(movement);
  assert.deepEqual(
    writes.at(-1).body.items.map((i) => ({
      resourceId: i.resourceId,
      quantity: i.quantity,
    })),
    [
      { resourceId: "c-1", quantity: 8 },
      { resourceId: "c-3", quantity: 4 },
    ],
  );
  await send({
    ...movement,
    action: "return",
    operationId: "physical-return",
    trolleys: [{ resourceId: "c-1", quantity: 3 }],
  });
  assert.equal(writes.at(-1).body.items[0].quantity, 3);
  const beforeUnknown = writes.length;
  assert.match(
    (
      await send({
        ...movement,
        operationId: "unbooked-trolley",
        trolleys: [{ resourceId: "other-cart", quantity: 1 }],
      })
    ).message,
    /exact booked trolley/,
  );
  assert.equal(writes.length, beforeUnknown);
  const requestUnknown = await page.evaluate(async () => {
    const r = await GSISV1.fetch(
      "/api/transaction?action=bookingGet&bookingId=synthetic-booking",
    );
    return r.json();
  });
  assert.equal(requestUnknown.booking.requestedQuantity, "Not recorded");
  assert.equal(
    requestUnknown.data.booking.requestedQuantity,
    null,
    "canonical receipt/view evidence remains null",
  );
  console.log(
    "PASS LORD narrow collection remains physical, partial return IDs and unbooked trolley rejection.",
  );

  reference.bookingResources.push({
    resource: "Z2",
    name: "Standalone collision",
    deviceType: "tablet",
    capacity: 1,
    active: true,
  });
  await page.evaluate(async () => {
    state.reference = await GSISV1.request("lord", "/reference");
    state.mode = "booking";
    renderBooking();
  });
  const beforeAmbiguous = writes.length;
  assert.equal(
    (await send({ ...intent, clientRequestId: "ambiguous-group" })).code,
    "GROUP_SELECTION_AMBIGUOUS",
  );
  assert.equal(writes.length, beforeAmbiguous);
  reference.bookingResources.pop();
  await page.evaluate(async () => {
    state.reference = await GSISV1.request("lord", "/reference");
    renderBooking();
  });
  const beforeBound = writes.length;
  const boundedStore = await page.evaluate((group) => {
    const key = Object.keys(sessionStorage).find((k) =>
        k.startsWith("gsis-lord-group-bindings:"),
      ),
      raw = sessionStorage.getItem(key);
    const entries = Array.from({ length: 128 }, (_, i) => ({
      operationId: "bound-" + i,
      intentHash: "a".repeat(64),
      ownerDigest: "b".repeat(64),
      selections: [{ index: 0, group }],
      terminal: false,
    }));
    const bounded = JSON.stringify(entries);
    sessionStorage.setItem(key, bounded);
    return { key, raw, bounded };
  }, originalGroup);
  assert.equal(
    (await send({ ...intent, clientRequestId: "bound-denied" })).code,
    "GROUP_SELECTION_REQUIRED",
  );
  assert.equal(writes.length, beforeBound);
  assert.equal(
    await page.evaluate((key) => sessionStorage.getItem(key), boundedStore.key),
    boundedStore.bounded,
  );
  await page.evaluate((key) => {
    const entries = JSON.parse(sessionStorage.getItem(key));
    entries[0].terminal = true;
    sessionStorage.setItem(key, JSON.stringify(entries));
  }, boundedStore.key);
  mode = "lost";
  await send({ ...intent, clientRequestId: "bound-replacement" });
  const retained = (await stored()).flatMap((s) => s.value);
  assert.equal(retained.length, 128);
  assert(!retained.some((x) => x.operationId === "bound-0"));
  assert(
    retained.some((x) => x.operationId === "bound-replacement" && !x.terminal),
  );
  assert(
    retained
      .filter(
        (x) =>
          x.operationId.startsWith("bound-") &&
          x.operationId !== "bound-replacement",
      )
      .every((x) => !x.terminal),
  );
  await page.evaluate(
    ({ key, raw }) => sessionStorage.setItem(key, raw),
    boundedStore,
  );
  mode = "success";
  const concurrentA = { ...intent, clientRequestId: "concurrent-a" },
    concurrentB = {
      ...intent,
      clientRequestId: "concurrent-b",
      bookings: [{ ...intent.bookings[0], resource: "Z10" }],
    };
  const expectedA = structuredClone(reference.bookingResources[3].bookingGroup),
    expectedB = structuredClone(reference.bookingResources[1].bookingGroup);
  mode = "lost";
  await page.evaluate(
    ({ a, b }) => {
      window.__originalDigest = crypto.subtle.digest.bind(crypto.subtle);
      window.__hashReleases = [];
      crypto.subtle.digest = async (...args) => {
        if (new TextDecoder().decode(args[1]).startsWith("["))
          await new Promise((resolve) => window.__hashReleases.push(resolve));
        return window.__originalDigest(...args);
      };
      const run = (body) =>
        GSISV1.request("lord", "/transaction", { method: "POST", body }).then(
          () => ({ ok: true }),
          (error) => ({ code: error.code }),
        );
      window.__parallelA = run(a);
      window.__parallelB = run(b);
    },
    { a: concurrentA, b: concurrentB },
  );
  await page.waitForFunction(() => window.__hashReleases.length === 2);
  reference.bookingResources[3].bookingGroup = {
    ...expectedA,
    revision: "3".repeat(64),
    members: expectedA.members.map((m) => ({ ...m, revision: 3 })),
  };
  reference.bookingResources[1].bookingGroup = {
    ...expectedB,
    revision: "4".repeat(64),
    members: expectedB.members.map((m) => ({ ...m, revision: 4 })),
  };
  await page.evaluate(async () => {
    state.reference = await GSISV1.request("lord", "/reference");
    state.booking.selections = [];
    state.booking.resource = "";
    state.booking.startPeriod = "";
    renderBooking();
  });
  mode = "success";
  await page.evaluate(() =>
    GSISV1.request("lord", "/receipt?operationId=wrong-receipt"),
  );
  mode = "lost";
  await page.evaluate(() => window.__hashReleases[0]());
  await page.evaluate(() => window.__parallelA);
  await page.evaluate(() => window.__hashReleases[1]());
  await page.evaluate(() => window.__parallelB);
  await page.evaluate(() => (crypto.subtle.digest = window.__originalDigest));
  const concurrentStored = (await stored()).flatMap((s) => s.value);
  assert(concurrentStored.some((r) => r.operationId === "concurrent-a"));
  assert(concurrentStored.some((r) => r.operationId === "concurrent-b"));
  assert.equal(
    concurrentStored.find((r) => r.operationId === "wrong-receipt").terminal,
    true,
    "late preparation cannot undo a terminal receipt",
  );
  const sentA = structuredClone(
      writes.find((w) => w.body.operationId === "concurrent-a").body,
    ),
    sentB = structuredClone(
      writes.find((w) => w.body.operationId === "concurrent-b").body,
    );
  assert.deepEqual(sentA.bookings[0].bookingGroup, expectedA);
  assert.deepEqual(sentB.bookings[0].bookingGroup, expectedB);
  mode = "success";
  await page.reload();
  await page.locator("#bookBtn").waitFor();
  await send(concurrentA);
  assert.deepEqual(writes.at(-1).body, sentA);
  await send(concurrentB);
  assert.deepEqual(writes.at(-1).body, sentB);
  console.log(
    "PASS LORD concurrent preparation merges bindings and freezes selections before asynchronous hashing.",
  );

  await page.evaluate(() => {
    const json = Response.prototype.json;
    Response.prototype.json = async function (...args) {
      const value = await json.apply(this, args);
      if (this.url.includes("/api/lord/reference") && !window.__jsonHeld) {
        window.__jsonHeld = true;
        await new Promise((resolve) => (window.__releaseJson = resolve));
      }
      return value;
    };
    window.__lateReference = GSISV1.request("lord", "/reference").then(
      () => ({ ok: true }),
      (error) => ({ code: error.code }),
    );
  });
  await page.waitForFunction(() => window.__jsonHeld);
  await page.evaluate(() => GSISV1.clearProtectedState());
  await page.evaluate(() => window.__releaseJson());
  assert.equal(
    (await page.evaluate(() => window.__lateReference)).code,
    "SESSION_CHANGED",
  );
  assert.deepEqual(await stored(), []);
  const beforeLateRead = writes.length;
  assert.equal(
    (await send({ ...intent, clientRequestId: "after-late-reference" })).code,
    "GROUP_SELECTION_REQUIRED",
  );
  assert.equal(
    writes.length,
    beforeLateRead,
    "late JSON cannot restore a protected reference map",
  );
  await page.reload();
  await page.locator("#bookBtn").waitFor();
  console.log(
    "PASS LORD delayed response decoding cannot restore protected maps or bindings.",
  );
  const beforeEarly = writes.length;
  const early = await page.evaluate(
    async (body) => {
      const result = GSISV1.request("lord", "/transaction", {
        method: "POST",
        body,
      }).then(
        () => ({ ok: true }),
        (error) => ({ code: error.code }),
      );
      await GSISV1.clearProtectedState();
      return result;
    },
    {
      ...intent,
      clientRequestId: "before-hash-clear",
      bookings: [{ ...intent.bookings[0], bookingGroup: originalGroup }],
    },
  );
  assert.equal(early.code, "SESSION_CHANGED");
  assert.deepEqual(await stored(), []);
  assert.equal(writes.length, beforeEarly);
  await page.reload();
  await page.locator("#bookBtn").waitFor();
  const beforeFence = writes.length;
  await page.evaluate(
    (body) => {
      const original = crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest = async (...args) => {
        if (new TextDecoder().decode(args[1]).startsWith("[")) {
          window.__hashStarted = true;
          await new Promise((resolve) => (window.__releaseHash = resolve));
        }
        return original(...args);
      };
      window.__lateBooking = GSISV1.request("lord", "/transaction", {
        method: "POST",
        body,
      }).then(
        () => ({ ok: true }),
        (error) => ({ code: error.code }),
      );
    },
    { ...intent, clientRequestId: "late-hash" },
  );
  await page.waitForFunction(() => window.__hashStarted);
  await page.evaluate(() => GSISV1.clearProtectedState());
  await page.evaluate(() => window.__releaseHash());
  assert.equal(
    (await page.evaluate(() => window.__lateBooking)).code,
    "SESSION_CHANGED",
  );
  assert.equal(writes.length, beforeFence);
  assert.deepEqual(
    await stored(),
    [],
    "late hash cannot restore protected bindings after logout cleanup",
  );
  console.log(
    "PASS LORD late preparation is fenced by protected-state clearing.",
  );
  await page.reload();
  await page.locator("#bookBtn").waitFor();
  mode = "lost";
  await send({ ...intent, clientRequestId: "old-account-pending" });
  assert((await stored()).length > 0);
  session.schoolId = "another-school";
  session.user = {
    ...session.user,
    accountId: "another-account",
    staffId: "another-staff",
    email: "another@example.invalid",
  };
  await page.evaluate(() => GSISV1.getSession(true));
  assert.deepEqual(await stored(), []);
  const beforeSwitch = writes.length;
  assert.equal(
    (await send({ ...intent, clientRequestId: "old-account-pending" })).code,
    "GROUP_SELECTION_REQUIRED",
  );
  assert.equal(
    writes.length,
    beforeSwitch,
    "new account cannot reuse old group binding",
  );
  console.log(
    "PASS LORD ambiguous labels and account/school changes never reuse another selection.",
  );

  // One complete native UI -> real local Worker/D1 booking proves the synthetic
  // transport contract matches the owning service. No Contacts/live records used.
  live = await productSuite();
  const actor = await live.seedAccount("cart-browser", {
    capabilities: ["lord.borrow", "lord.read"],
  });
  const db = await live.db("lord"),
    now = Date.now();
  await db.batch([
    db
      .prepare("INSERT INTO lord_references VALUES(?,?,?,?,?,?,?)")
      .bind(
        "synthetic-school",
        actor.staffId,
        "Synthetic Borrower",
        "cart-browser@example.invalid",
        null,
        "browser-reference",
        now,
      ),
    db
      .prepare(
        "INSERT INTO lord_reference_state VALUES(?,1,?,'browser-reference',NULL,?)",
      )
      .bind("synthetic-school", now, now + 86400000),
    db.prepare("INSERT INTO lord_settings VALUES(?,'periodTimings',1,?)").bind(
      "synthetic-school",
      JSON.stringify({
        periods: [
          { code: "1", start: "08:00", end: "08:30" },
          { code: "2", start: "08:30", end: "09:00" },
          { code: "3", start: "09:00", end: "09:30" },
        ],
      }),
    ),
    ...[1, 2, 3].map((i) =>
      db
        .prepare("INSERT INTO lord_resources VALUES(?,?,?,?,?,?,?,?,?,?)")
        .bind(
          "synthetic-school",
          "actual-trolley-" + i,
          "Synthetic trolley " + i,
          "Android tablet",
          14,
          1,
          1,
          1,
          1,
          JSON.stringify({ cart: "Cart Ü1" }),
        ),
    ),
  ]);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.addCookies([
    {
      name: "__Host-gsis_session",
      value: actor.token,
      domain: "gsis.example.invalid",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await context.route("**/*", async (route) => {
    const r = route.request();
    if (!r.url().startsWith(workerOrigin + "/")) {
      unexpected.push(r.url());
      return route.abort();
    }
    const response = await live.mf.dispatchFetch(r.url(), {
      method: r.method(),
      headers: await r.allHeaders(),
      ...(["GET", "HEAD"].includes(r.method())
        ? {}
        : { body: r.postDataBuffer() }),
    });
    const headers = Object.fromEntries(response.headers);
    delete headers["transfer-encoding"];
    return route.fulfill({
      status: response.status,
      headers,
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  const actual = await context.newPage();
  actual.setDefaultTimeout(7000);
  actual.on("pageerror", (e) => errors.push(e.message));
  actual.on("dialog", (d) => d.accept());
  await actual.goto(workerOrigin + "/lord/");
  await actual.locator("#bookBtn").click();
  await actual
    .locator(".resource-name strong")
    .filter({ hasText: "Cart Ü1" })
    .waitFor();
  await actual.locator("#classOrActivity").fill("Synthetic class");
  await actual.locator("#subject").fill("Science");
  await actual
    .locator('.timetable-cell[data-resource="Cart Ü1"][data-code="1"]')
    .click();
  await actual
    .locator('.timetable-cell[data-resource="Cart Ü1"][data-code="2"]')
    .click();
  await actual.locator(".selection-qty").fill("20");
  await capture("lord-cart-grid-local-worker.png", actual);
  await actual.locator("#confirmBookingBtn").click();
  await actual.locator(".booking-success-list").waitFor();
  const confirmation = await actual
    .locator(".booking-success-list")
    .innerText();
  assert.match(confirmation, /Cart Ü1/);
  assert.match(confirmation, /20 devices/);
  assert.doesNotMatch(confirmation, /undefined|null/);
  const saved = (await live.request(actor, "lord", "/bookings")).body.data
    .bookings[0];
  assert.equal(saved.resource, "Cart Ü1");
  assert.equal(saved.requestedQuantity, 20);
  assert.equal(saved.reservedCapacity, 42);
  assert.equal(saved.items.length, 3);
  assert(saved.items.every((item) => item.quantity === 14));
  await actual.locator("#doneBtn").click();
  await actual.locator("[data-lord-edit-bookings]").click();
  await actual.locator("[data-lord-edit-booking]").click();
  await actual.locator("[name=requestedQuantity]").fill("18");
  await actual.setViewportSize({ width: 390, height: 844 });
  await capture("lord-cart-editor-narrow-local-worker.png", actual);
  await actual.locator("[data-lord-submit]").click();
  await actual
    .locator("[data-lord-status]")
    .filter({ hasText: "confirmed saved" })
    .waitFor();
  const revised = (
    await live.request(
      actor,
      "lord",
      "/bookings/get?bookingId=" + saved.bookingId,
    )
  ).body.data.booking;
  assert.equal(revised.requestedQuantity, 18);
  assert.equal(revised.reservedCapacity, 42);
  assert.equal(revised.revision, 2);
  assert.deepEqual(
    revised.items.map((i) => [i.resourceId, i.quantity]),
    saved.items.map((i) => [i.resourceId, i.quantity]),
  );
  await context.close();
  console.log(
    "PASS LORD actual native create/edit through local Worker/D1 reserves the whole cart and preserves requested quantity.",
  );

  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await live?.close();
  await rm(output, { recursive: true, force: true });
}
