import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { chromium } from "playwright";
import { productSuite, origin } from "./suite.mjs";

export const schoolId = "synthetic-school";
export function futureDate(offset = 2) {
  let at = Date.now() + 28800000 + offset * 86400000;
  while ([0, 6].includes(new Date(at).getUTCDay())) at += 86400000;
  return new Date(at).toISOString().slice(0, 10);
}
export async function fixture() {
  const suite = await productSuite({ bindings: {
    GOOGLE_CLIENT_ID: "synthetic-roster-unblock.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  } });
  const admin = await suite.seedAccount("roster-unblock-admin");
  const other = await suite.seedAccount("roster-unblock-other");
  const ordinary = await suite.seedAccount("roster-unblock-reader", { capabilities: [] });
  let browser;
  const requests = [], external = [], contexts = [];
  let closing = false, stopped = false;
  async function pageFor(user = admin) {
    browser ||= await chromium.launch({ headless: true,
      executablePath: process.env.GSIS_BROWSER_EXECUTABLE || process.env.ROSTER_TEST_CHROMIUM || undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contexts.push(context);
    await context.addCookies([{ name: "__Host-gsis_session", value: user.token,
      domain: new URL(origin).hostname, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    await context.route("**/*", async route => {
      if (closing) return route.abort();
      try {
      const request = route.request();
      if (!request.url().startsWith(origin + "/")) {
        external.push(request.url());
        return route.abort();
      }
      const response = await suite.mf.dispatchFetch(request.url(), {
        method: request.method(), headers: await request.allHeaders(),
        body: ["GET", "HEAD"].includes(request.method()) ? undefined : request.postDataBuffer(),
      });
      const body = Buffer.from(await response.arrayBuffer());
      if (request.url().includes("/api/")) requests.push({ url: request.url(),
        input: request.postDataJSON(), status: response.status, body: body.toString() });
      const headers = Object.fromEntries(response.headers);
      delete headers["transfer-encoding"];
      await route.fulfill({ status: response.status, headers, body });
      } catch (error) { if (!closing) throw error; }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    await page.goto(origin + "/roster/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.innerText.includes("Baseline Timetable"));
    return page;
  }
  return { ...suite, admin, other, ordinary, requests, external, pageFor,
    async stopWorkers() { await suite.mf.dispose(); stopped = true; },
    async close() {
      closing = true;
      await Promise.all(contexts.map(context => context.unrouteAll({ behavior: "ignoreErrors" })));
      await browser?.close();
      if (stopped) await rm(suite.path, { recursive: true, force: true });
      else await suite.close();
    },
  };
}
export async function browserOperation(page, input) {
  return page.evaluate(async body => {
    try { return { ok: true, data: await GSISV1.request("roster", "/operations", { method: "POST", body }) }; }
    catch (error) { return { ok: false, code: error.code, status: error.status, message: error.message }; }
  }, input);
}
export function ok(result) {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.data;
}
export async function seedScenario(f, { date = futureDate(), roomLabel = "Synthetic Room A" } = {}) {
  const staff = [];
  for (let index = 0; index < 2; index++) {
    const temporary = "synthetic-row-" + index;
    const result = await f.call(f.admin, "contacts", "/save-data", {
      operationId: "synthetic-create-" + index, changes: [], additions: [{ id: temporary,
        values: { "Basic Name": "Synthetic Teacher " + (index ? "B" : "A"),
          "Statutory Name": "Synthetic Teacher " + (index ? "B" : "A"),
          "EO Appt Level": "EO", Role: "", Active: "Y", "School Section": "Primary",
          "Employment Modifier": "", "Employment Arrangement": "Full-time",
          "Appointment Status": "Confirmed", "Subject Modifier": "", "MK Modifier": "",
          "Personnel Category": "Teaching", "Profile Completion": "complete" } }],
    });
    staff.push(result.mapping[temporary]);
    for (const field of ["smc", "eo", "schoolLeader"]) await f.call(f.admin, "contacts",
      "/staff/" + staff.at(-1) + "/accept", { operationId: "synthetic-accept-" + index + "-" + field,
        field, value: field === "eo", revision: 0, ownerReviewReference: "Synthetic owner review" });
  }
  const end = new Date(Date.parse(date) + 6 * 86400000).toISOString().slice(0, 10);
  const year = Number(date.slice(0, 4)), calendar = await f.db("calendar");
  await calendar.prepare("INSERT INTO calendar_years VALUES(?,?,1,1,'ACTIVE','{}')").bind(schoolId, year).run();
  await calendar.prepare("INSERT INTO calendar_metadata VALUES(?,'yearStructure','synthetic-term',?,1,?)")
    .bind(schoolId, year, JSON.stringify({ Kind: "TERM_WEEK", StartDate: date, EndDate: end, Term: 1, Week: 1 })).run();
  const venues = await f.db("venues");
  for (const letter of ["a", "b"]) {
    const id = "synthetic-room-" + letter;
    await venues.prepare("INSERT INTO venues_records VALUES(?,'venues',?,1,NULL,?,'active',?)")
      .bind(schoolId, id, id, JSON.stringify({ id, name: "Synthetic Room " + letter.toUpperCase(), active: true, overlapGroup: "", bufferMinutes: 0 })).run();
  }
  const model = { layoutMode: "single-week", maxPeriod: 1, recesses: [],
    timing: { startMinutes: 600, periodMinutes: 30, endOfDayMinutes: 660 },
    single: { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], perDay: 2, maxPeriod: 1,
      blocks: staff.map((_, index) => ({ name: "Synthetic Teacher " + (index ? "B" : "A"),
        cells: Array.from({ length: 10 }, (__, period) => !index && period % 2 === 0
          ? ["Synthetic subject", "Synthetic class", roomLabel, ""] : ["", "", "", ""]) })) } };
  return { date, end, staff, model, payload: { name: "Synthetic baseline", from: date, to: end, model,
    staffMapping: { "Synthetic Teacher A": staff[0], "Synthetic Teacher B": staff[1] },
    venueMapping: { [roomLabel]: "synthetic-room-a" }, revision: 0 } };
}
