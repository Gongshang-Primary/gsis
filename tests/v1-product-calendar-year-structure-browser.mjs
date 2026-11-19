import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import JSZip from "jszip";
import { productSuite, origin } from "./v1-product/suite.mjs";

const suite = await productSuite({ bindings: { HOSTED_DOMAIN: "example.invalid" } });
let browser;
try {
  const admin = await suite.seedAccount("calendar-generation-browser");
  await suite.call(admin, "calendar", "/action", { action: "saveYear", operationId: "browser-year", payload: { Year: 2027, Status: "PLANNING", ReleasedToTeachers: "No", expectedMetadataRevision: "missing" } });
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"], executablePath: process.env.GSIS_BROWSER_EXECUTABLE || process.env.ROSTER_TEST_CHROMIUM || undefined });
  const context = await browser.newContext({ acceptDownloads: true });
  context.setDefaultTimeout(10000);
  await context.addCookies([{ name: "__Host-gsis_session", value: admin.token, domain: "gsis.example.invalid", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  const external = [], errors = [], generations = [];
  let loseReply = true, lostReply;
  const lost = new Promise(resolve => { lostReply = resolve; });
  await context.route("**/*", async route => {
    const request = route.request();
    if (request.url() === "https://accounts.google.com/gsi/client") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    if (!request.url().startsWith(origin + "/")) { external.push(request.url()); return route.abort(); }
    const body = request.postDataJSON();
    const generation = body?.action === "generateYearStructure" || new URL(request.url()).pathname.endsWith("/generateYearStructure");
    if (generation) generations.push(body.operationId || body.payload?.operationId);
    const response = await suite.mf.dispatchFetch(request.url(), { method: request.method(), headers: await request.allHeaders(), body: ["GET", "HEAD"].includes(request.method()) ? undefined : request.postDataBuffer() });
    if (generation && loseReply && response.status === 200) {
      loseReply = false; await response.arrayBuffer(); await route.abort("failed"); lostReply(); return;
    }
    const headers = Object.fromEntries(response.headers); delete headers["transfer-encoding"];
    await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
  });
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + "/calendar/");
  await page.locator('#nav [data-page="yearSetup"]').click();
  const form = page.locator("#structureForm");
  const dates = { Vacation1Start: "2027-03-13", Vacation1End: "2027-03-21", Vacation2Start: "2027-05-29", Vacation2End: "2027-06-27", Vacation3Start: "2027-09-04", Vacation3End: "2027-09-12", Vacation4Start: "2027-11-27", Vacation4End: "2027-12-31" };
  for (const [name, value] of Object.entries(dates)) await form.locator(`[name="${name}"]`).fill(value);
  await form.locator('button[type="submit"]').click();
  await lost;
  await page.waitForFunction(() => window.GSISV1.pending().some(entry => entry.path.startsWith("/api/calendar/")));
  const db = await suite.db("calendar");
  assert.equal((await db.prepare("SELECT count(*) n FROM calendar_events WHERE year=2027").first()).n, 44, "actual owner commit survived response loss");
  assert.equal(generations.length, 1);
  assert(generations[0], "transport carries a stable operation ID");
  await form.locator('button[type="submit"]').click();
  await page.locator(".generation-success").waitFor();
  assert((await page.locator(".generation-success").innerText()).includes("44 generated event records"));
  assert((await page.locator(".generation-success").innerText()).includes("Google Calendar sync is separate"));
  assert.deepEqual(generations, [generations[0], generations[0]], "retry sends the original operation, not another generation");
  assert.equal((await db.prepare("SELECT count(*) n FROM product_operations WHERE action='calendar.generateYearStructure'").first()).n, 1);
  assert.equal(await page.evaluate(() => window.GSISV1.pending().filter(entry => entry.path.startsWith("/api/calendar/")).length), 0, "bound committed receipt settles the original operation");
  assert.equal((await db.prepare("SELECT count(*) n FROM product_outbox").first()).n, 0);
  assert.equal((await db.prepare("SELECT count(*) n FROM calendar_metadata WHERE kind='yearStructure' AND year=2027").first()).n, 45);
  const generated = (await db.prepare("SELECT data_json FROM calendar_events WHERE year=2027").all()).results.map(row => JSON.parse(row.data_json));
  assert(!generated.some(event => event.StaffTitle === "T1W0"));
  await page.locator('#nav [data-page="events"]').click();
  assert.equal((await page.locator('.cal-row[data-date="2027-01-01"] .cal-meta').allTextContents())[2], "0");
  assert.equal((await page.locator('.cal-row[data-date="2027-01-04"] .cal-meta').allTextContents())[2], "1");
  assert.equal((await page.locator('.cal-row[data-date="2027-11-22"] .cal-meta').allTextContents())[2], "");
  await page.locator('#nav [data-page="weekly"]').click();
  assert.equal(await page.locator('.weekly-grid tbody tr').first().locator('.week-label').innerText(), "T1W0");
  const download = page.waitForEvent("download"); await page.locator('[data-weekly-excel]').click();
  const archive = await JSZip.loadAsync(await readFile(await (await download).path()));
  const sheet = await archive.file("xl/worksheets/sheet2.xml").async("string");
  assert(sheet.includes("T1W0") && sheet.includes("T1W1") && sheet.includes("T4W10"));
  assert(!sheet.includes("T4W11"));
  await page.reload();
  await page.locator('#nav [data-page="weekly"]').click();
  assert.equal(await page.locator('.weekly-grid tbody tr').first().locator('.week-label').innerText(), "T1W0");
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  console.log("PASS built Calendar Year Setup → actual Core/Calendar/D1: 45 structure/44 event records, lost-response original receipt retry, no provider jobs, Week0/gaps/Weekly Excel and reload; synthetic browser only");
} finally { await browser?.close(); await suite.close(); }
