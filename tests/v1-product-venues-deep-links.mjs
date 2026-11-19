import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { dispatchNotification } from "../v1/services/venues/service.mjs";

// Real built browser, gateway, Core and Venues with synthetic local D1 records.
// Product provider ownership stays disabled. A separate injected capture-only
// transport exercises the real URL formatter; it cannot contact a provider.
const suite = await productSuite(), school = "synthetic-school";
const contexts = [], requests = [], external = [], pageErrors = [], captures = [];
let browser;
const started = performance.now();
try {
  const admin = await suite.seedAccount("link-admin"),
    owner = await suite.seedAccount("link-owner", { capabilities: ["venues.read"] }),
    outsider = await suite.seedAccount("link-outsider", { capabilities: ["venues.read"] }),
    db = await suite.db("venues"), date = "2026-11-25", at = new Date().toISOString();
  const room = { id: "room-link", unit: "A-01", name: "Synthetic room", descriptors: [], aliases: [], features: [], bookable: true, special: false, approvalMode: "immediate", open: "07:00", close: "18:00", capacity: 30, bufferMinutes: 0, overlapGroup: "", revision: 1 };
  const booking = { id: "booking_Link-123", seriesId: "", venueId: room.id, date, periodIds: ["P1"], intervals: [{ start: 540, end: 570 }], requesterId: owner.staffId, ownerId: owner.staffId, requesterName: "Synthetic owner", ownerName: "Synthetic owner", note: "Private synthetic booking purpose", status: "confirmed", revision: 1, sourceGeneration: "historical-fixture", createdAt: at, updatedAt: at, ownerResponses: [] };
  const transfer = { id: "transfer_Link-456", bookingId: booking.id, kind: "booking", venueId: room.id, date, periodIds: ["P1"], intervals: [{ start: 540, end: 570 }], requesterId: "staff-requester", requesterName: "Synthetic requester", originalOwnerId: owner.staffId, note: "Private synthetic transfer request", status: "pending", revision: 1, sourceGeneration: "historical-fixture" };
  async function insert(schoolId, kind, row) {
    await db.prepare("INSERT INTO venues_records(school_id,kind,record_id,revision,service_date,venue_id,status,data_json) VALUES(?,?,?,?,?,?,?,?)")
      .bind(schoolId, kind, row.id, row.revision, row.date || null, row.venueId || null, row.status || null, JSON.stringify(row)).run();
  }
  await insert(school, "venues", room);
  await insert(school, "occurrences", booking);
  await insert(school, "transfers", transfer);
  await insert("foreign-school", "occurrences", { ...booking, id: "foreign-booking", note: "Foreign private booking purpose" });

  const captureEnv = {
    DB: db, SCHOOL_ID: school, GSIS_SECRET: "synthetic-no-network", SEND_OWNER: "v1", PUBLIC_ORIGIN: origin,
    EMAIL_PROVIDER: "resend", EMAIL_API_TOKEN: "synthetic-token", EMAIL_FROM: "noreply@example.invalid", DISPATCH_DEADLINE: Date.now() + 60000,
    CORE: { async fetch() { return Response.json({ ok: true, data: { allowed: true, decisionId: "capture-only" } }); } },
    CONTACTS: { async fetch(request) { const input = await request.json(); return Response.json({ ok: true, data: { staff: input.staffIds.map(staffId => ({ staffId, name: "Synthetic owner", active: true, email: "capture@example.invalid" })) } }); } },
    PROVIDER_FETCH: async (url, init) => {
      assert.equal(url, "https://api.resend.com/emails");
      const message = JSON.parse(init.body);
      assert.deepEqual(message.to, ["capture@example.invalid"]);
      captures.push(message.text.match(/Manage this request: (\S+)/)?.[1]);
      return Response.json({ id: "local-capture-" + captures.length });
    },
  };
  for (const [kind, record] of [["booked", booking], ["transferRequested", transfer]]) {
    const id = "capture-" + record.id, now = Date.now(), payload = { notificationId: id, decisionId: "capture-only" };
    await insert(school, "outbox", { id, kind, recordId: record.id, venueId: room.id, participantIds: [owner.staffId], payload: { status: record.status, date }, revision: 1 });
    await db.prepare("INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,state,due_at,lease_until,fence,updated_at) VALUES(?,?,?,?,?,'leased',?,?,1,?)")
      .bind(school, id, "capture-operation-" + record.id, "venues.notify", JSON.stringify(payload), now, now + 60000, now).run();
    await dispatchNotification(captureEnv, { school_id: school, job_id: id, operation_id: "capture-operation-" + record.id, fence: 1, payload });
  }
  assert.deepEqual(captures, [origin + "/venues/b/" + booking.id, origin + "/venues/r/" + transfer.id]);
  const before = (await db.prepare("SELECT * FROM venues_records ORDER BY school_id,kind,record_id").all()).results;
  browser = await chromium.launch({ headless: true, executablePath: process.env.GSIS_BROWSER_EXECUTABLE || process.env.ROSTER_TEST_CHROMIUM || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  async function pageFor(actor) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "Asia/Singapore" });
    contexts.push(context);
    await context.addCookies([{ name: "__Host-gsis_session", value: actor.token, domain: "gsis.example.invalid", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { external.push(url.origin + url.pathname); await route.abort(); return; }
      const response = await suite.mf.dispatchFetch(request.url(), { method: request.method(), headers: await request.allHeaders(), body: ["GET", "HEAD"].includes(request.method()) ? undefined : request.postDataBuffer() });
      requests.push({ actor: actor.id, path: url.pathname, input: request.method() === "POST" ? request.postDataJSON() : null, status: response.status });
      const headers = Object.fromEntries(response.headers); delete headers["transfer-encoding"];
      await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
    });
    const page = await context.newPage(); page.setDefaultTimeout(7000); page.on("pageerror", error => pageErrors.push(error.message));
    return page;
  }
  const targeted = rows => rows.filter(r => r.path === "/api/venues/read" && (r.input?.id || r.input?.transferId));
  async function openTarget(page, index, suffix = "", reload = false) {
    const start = requests.length;
    if (reload) await page.reload(); else await page.goto(captures[index] + suffix);
    await page.locator("#dialog[open]").waitFor();
    const rows = targeted(requests.slice(start));
    assert.equal(rows.length, 1, "exactly one targeted owner read per page boot");
    assert.equal(rows[0].status, 200);
    assert.equal(index === 0 ? rows[0].input.id : rows[0].input.transferId, index === 0 ? booking.id : transfer.id);
    assert.match(await page.locator("#sourceStatus").textContent(), /unavailable|pending/i, "navigation does not invent timetable readiness");
    if (index === 0) assert.equal(await page.locator("#editNote").inputValue(), booking.note);
    else { assert.equal(await page.locator("#dialogTitle").textContent(), "Review transfer"); assert((await page.locator("#dialog").textContent()).includes(transfer.note)); }
  }

  const ownerPage = await pageFor(owner);
  await openTarget(ownerPage, 0);
  assert.equal(await ownerPage.locator('.main-nav [aria-current="page"]').getAttribute("data-view"), "mine");
  await openTarget(ownerPage, 0, "", true);
  await openTarget(ownerPage, 1, "?view=book&date=2026-11-24#notification");
  assert.equal(await ownerPage.locator('.main-nav [aria-current="page"]').getAttribute("data-view"), "mine");
  const adminPage = await pageFor(admin);
  await openTarget(adminPage, 0);
  assert.equal(await adminPage.locator('.main-nav [aria-current="page"]').getAttribute("data-view"), "dashboard");
  assert.equal(await adminPage.locator("#editNote").getAttribute("readonly"), "");
  console.log("PASS actual generated booking/transfer links open owner dialogs, reload/query suffix and manager path");

  const deniedPage = await pageFor(outsider);
  for (const [url, expected] of [[captures[0], 403], [captures[1], 403], [origin + "/venues/b/missing-booking", 404], [origin + "/venues/b/foreign-booking", 404]]) {
    const responsePromise = deniedPage.waitForResponse(r => new URL(r.url()).pathname === "/api/venues/read" && !!(r.request().postDataJSON()?.id || r.request().postDataJSON()?.transferId));
    await deniedPage.goto(url);
    const response = await responsePromise, body = await response.json();
    assert.equal(response.status(), expected, JSON.stringify(body));
    await deniedPage.waitForFunction(() => document.querySelector('[data-status]')?.classList.contains("error"));
    assert.equal(await deniedPage.locator("dialog[open]").count(), 0);
    const visible = await deniedPage.locator("body").textContent();
    for (const secret of [booking.note, transfer.note, "Foreign private booking purpose"]) assert.equal(visible.includes(secret), false);
    assert.equal(body.data, undefined);
  }
  console.log("PASS outsider/missing/foreign targets fail without target data or dialog controls");

  for (const path of ["/venues/b/" + booking.id + "/extra", "/venues/x/" + booking.id, "/venues/b/booking%2Fother"]) {
    const start = requests.length;
    await deniedPage.goto(origin + path);
    await deniedPage.waitForFunction(() => document.querySelector('[data-status]')?.textContent.includes("bookings remain disabled"));
    assert.deepEqual(targeted(requests.slice(start)), []);
    assert.equal(await deniedPage.locator("dialog[open]").count(), 0);
  }
  await deniedPage.goto(origin + "/b/" + booking.id);
  await deniedPage.waitForFunction(() => document.querySelector("#status")?.textContent === "Choose an application.");
  assert.equal(await deniedPage.locator(".main-nav").count(), 0);
  const legacySource = await readFile(new URL("../venues-viewport/public/app.js", import.meta.url), "utf8");
  assert(legacySource.includes(String.raw`deepLink:location.pathname.match(/^\/(b|r)\/([A-Za-z0-9_-]+)$/)`), "legacy source remains unchanged");
  assert.equal(requests.some(r => r.path === "/api/venues/command"), false);
  assert.deepEqual((await db.prepare("SELECT * FROM venues_records ORDER BY school_id,kind,record_id").all()).results, before);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM product_operations").first()).n, 0);
  assert.deepEqual(external, []); assert.deepEqual(pageErrors, []);
  console.log("PASS malformed/root paths do not widen routing; no commands, stored-record changes or network egress");
} finally {
  for (const context of contexts) await context.unrouteAll({ behavior: "wait" });
  await browser?.close(); await suite.close();
  console.log("Venues deep-link browser elapsed " + Math.round(performance.now() - started) + "ms");
}
