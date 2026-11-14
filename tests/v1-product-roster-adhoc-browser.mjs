import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { buildWeb } from "../scripts/v1/build-web.mjs";
import Operations from "../shared/roster-operations.js";
import { context } from "../v1/services/roster/context.mjs";
import { handle } from "../v1/services/roster/service.mjs";
import { flatten, writeArtifact } from "../v1/services/roster/repository.mjs";
import { canonical } from "../v1/runtime/store.mjs";
import { createDatabase } from "./v1-product/helpers.mjs";

// Exercise the shipped renderer against real v1 owner reads and local D1/R2.
// External owner projections are synthetic; no network or provider calls occur.
const started = performance.now();
const folder = await mkdtemp(path.join(tmpdir(), "gsis-v1-adhoc-browser-"));
const h = await createDatabase("roster");
const date = "2026-11-16", nextDate = "2026-11-17", schoolId = "school";
const now = Date.parse(date + "T06:00:00+08:00");
const people = [
  { staffId: "alice", name: "Alice", active: true, eo: true },
  { staffId: "bob", name: "Bob", active: false, eo: true, employment: "SRE" },
];
const env = {
  SERVICE_NAME: "roster", SCHOOL_ID: schoolId, GSIS_SECRET: "synthetic-browser-only",
  DB: h.db, ARTIFACTS: h.bucket,
  CONTACTS: { async fetch() {
    return Response.json({ people, revision: "contacts:1", asOf: now });
  } },
  CALENDAR: { async fetch(request) {
    const { from, to } = await request.json(), rows = [];
    for (let t = Date.parse(from); t <= Date.parse(to); t += 86400000)
      rows.push({ date: new Date(t).toISOString().slice(0, 10), available: true, schoolDay: true });
    return Response.json({ rows });
  } },
  DEPLOY: { async fetch() {
    return Response.json({ schoolId, publicationId: "publication", publicationSequence: 1,
      calculationVersion: "v1", rows: [{ staffId: "alice", quality: "verified", budget: 4, Wi: 0, factor: 1 }] });
  } },
};
const principal = {
  schoolId, actorId: "alice-account", staffId: "alice", email: "alice@test.example",
  sessionId: "synthetic-session", decisionId: "synthetic-decision", impersonating: false,
  capabilities: ["admin", "roster.read", "roster.write", "roster.allocate", "roster.admin"],
};
const makeContext = body => ({ env, principal, now, clock: () => now, body,
  path: "/operations", method: "POST", request: new Request("https://owner.test/operations") });
let browser;
try {
  const cells = Array.from({ length: 85 }, () => ["", "", "", ""]);
  for (let day = 0; day < 5; day++)
    for (const period of [2, 3]) cells[day * 17 + period] = ["EL", "4A", "Room 1", ""];
  const model = {
    layoutMode: "single-week", maxPeriod: 16, recesses: [],
    timing: { startMinutes: 420, periodMinutes: 30, endOfDayMinutes: 960 },
    single: { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], perDay: 17,
      maxPeriod: 16, blocks: [{ name: "Alice", cells }] },
  };
  const artifact = await writeArtifact(h.bucket, schoolId, "baselines", model);
  await h.db.prepare("INSERT INTO roster_baselines(school_id,baseline_id,revision,name,from_date,to_date,priority,model_key,digest,mapping_json,pruned) VALUES(?,?,?,?,?,?,?,?,?,?,0)")
    .bind(schoolId, "baseline", 1, "Synthetic baseline", date, "2026-11-20", 1,
      artifact.key, artifact.digest, canonical({ Alice: "alice" })).run();
  const state = Operations.initial();
  state.adhoc.push({ id: "dated-bob", staffId: "bob", date, periods: [2], employment: "SRE" });
  const c = await context(makeContext({ operation: "read", date }), { state, accountingRevisions: {} },
    { from: date, to: nextDate, dates: [date, nextDate] }, { needsQuota: true });
  for (const selectedDate of [date, nextDate])
    Operations.apply(state, c, { operation: "saveAbsence", date: selectedDate,
      staffId: "alice", typeId: "mc", periods: [2, 3] });
  const records = [...flatten(state).values()];
  await h.db.batch(records.map(row => h.db.prepare("INSERT INTO roster_records(school_id,collection,record_id,service_date,staff_id,year,revision,payload_json) VALUES(?,?,?,?,?,?,?,?)")
    .bind(schoolId, row.collection, row.id, row.date, row.staffId, row.year, 1,
      canonical({ kind: row.kind, data: row.data }))));

  await buildWeb(folder);
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath: process.env.GSIS_BROWSER_EXECUTABLE || process.env.ROSTER_TEST_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(5000);
  await page.clock.setFixedTime(now);
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.exposeFunction("ownerRead", async body => {
    requests.push(structuredClone(body));
    assert.equal(body.operation, "read", "this browser regression must not perform a write");
    return handle(makeContext(body));
  });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    assert.equal(url.origin, "https://browser.test", "all browser resources stay synthetic");
    if (url.pathname === "/fixture.html")
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><main id="content"></main>' });
    const relative = url.pathname.slice(1);
    assert(!relative.includes(".."));
    return route.fulfill({ body: await readFile(path.join(folder, relative)),
      contentType: relative.endsWith(".css") ? "text/css" : "text/javascript" });
  });
  await page.goto("https://browser.test/fixture.html");
  for (const file of ["roster/roster.css", "roster/roster-operations.css", "v1/shared/roster-capacity.css"])
    await page.addStyleTag({ url: "https://browser.test/" + file });
  for (const file of ["roster/roster-stapler-model.js", "roster/roster-allocation.js",
    "roster/roster-operations-model.js", "v1/shared/roster-capacity.js", "roster/roster-operations-ui.js"])
    await page.addScriptTag({ url: "https://browser.test/" + file });
  await page.evaluate(({ date, principal }) => {
    window.fixtureContext = {
      profile: { user: { staffId: principal.staffId, email: principal.email, smc: true, admin: true } },
      initialDate: date, today: () => date, container: document.querySelector("main"), status() {},
      api: async (_route, body) => ownerRead(body),
    };
  }, { date, principal });
  async function render(name, selectedDate = date) {
    await page.evaluate(async ({ name, selectedDate }) => {
      RosterOpsUI.unmount();
      RosterOpsUI.resetPreloads();
      fixtureContext.initialDate = selectedDate;
      window.rendered = await RosterOpsUI.render(name, fixtureContext);
    }, { name, selectedDate });
  }

  await render("Manage Ad-hoc relief");
  assert.match(await page.locator(".ops-record-table").innerText(), /Bob \(ad hoc\)/);
  assert.doesNotMatch(await page.locator(".ops-record-table").innerText(), /Bob \(inactive\)/);
  assert.equal(await page.locator('[data-edit-adhoc="dated-bob"]').isDisabled(), false);

  await render("Assign Relief");
  const browserTeacher = await page.evaluate(() => rendered.data.allocationModel.teachers.find(p => p.id === "bob"));
  assert.equal(browserTeacher.person.active, false, "owner response and renderer preserve actual Contacts inactivity");
  assert.deepEqual(browserTeacher.reliefActivePeriods, [2], "period evidence survives owner-to-browser serialization");
  await page.locator('[data-relief-period="2"]').click();
  const assignBob = page.locator('[data-candidate-scroll] [data-manual-select="bob"]');
  assert.equal(await assignBob.count(), 1);
  assert.equal(await assignBob.isEnabled(), true, "P2 is explicitly activated");
  assert.match(await page.locator(".ops-quick-adhoc-chip").innerText(), /Bob \(ad hoc\)/);
  await page.locator('[data-relief-period="3"]').click();
  assert.equal(await page.locator('[data-manual-select="bob"]').count(), 0, "P3 cannot offer an out-of-period inactive teacher");

  await render("Assign Relief", nextDate);
  await page.locator('[data-relief-period="2"]').click();
  assert.equal(await page.locator('[data-manual-select="bob"]').count(), 0, "activation does not carry into the next day");
  assert.equal(await page.locator(".ops-quick-adhoc-chip").count(), 0);
  assert.equal(await page.evaluate(() => rendered.data.people.find(p => p.id === "bob").name), "Bob (inactive)");

  const row = records.find(row => row.collection === "adhoc" && row.id === "dated-bob");
  await h.db.prepare("UPDATE roster_records SET payload_json=?, revision=revision+1 WHERE school_id=? AND collection='adhoc' AND record_id=?")
    .bind(canonical({ kind: row.kind, data: { ...row.data, deletedAt: new Date(now).toISOString() } }), schoolId, row.id).run();
  await render("Assign Relief");
  await page.locator('[data-relief-period="2"]').click();
  assert.equal(await page.locator('[data-manual-select="bob"]').count(), 0, "deleted activation grants no candidate eligibility");
  assert.equal(await page.locator(".ops-quick-adhoc-chip").count(), 0);
  assert.equal(await page.evaluate(() => rendered.data.people.find(p => p.id === "bob").name), "Bob (inactive)");
  assert.equal(people[1].active, false, "no fixture read changes Contacts employment status");
  assert(requests.some(body => body.view === "adhoc") && requests.some(body => body.view === "allocation"));
  assert.deepEqual(errors, []);
  console.log(`PASS built v1 Roster + local owner reads: dated ad hoc label, P2 allowed/P3 excluded, manual-model periods retained, next-day/deleted negatives (${Math.round(performance.now() - started)}ms)`);
} finally {
  await browser?.close();
  await h.close();
  await rm(folder, { recursive: true, force: true });
}
