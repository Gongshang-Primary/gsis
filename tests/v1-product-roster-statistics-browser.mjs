import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { fixture, seedScenario, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { weeklyScopeRevisions, weekOf } from "../v1/services/roster/repository.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

// Synthetic historical records plus actual browser/gateway/Workers/D1 reads.
const f = await fixture();
try {
  const today = new Date(Date.now() + 28800000).toISOString().slice(0, 10), year = today.slice(0, 4);
  const first = year + "-01-01", priorYear = String(Number(year) - 1), cutoff = priorYear + "-12-31";
  const past = [first, new Date(Date.parse(today) - 14 * 86400000).toISOString().slice(0, 10)].sort().at(-1);
  const s = await seedScenario(f, { date: today }), [a, b] = s.staff, db = await f.db("roster");
  for (const staffId of s.staff) await f.call(f.admin, "contacts", "/staff/" + staffId + "/update", {
    operationId: "synthetic-statistics-profile-" + staffId,
    changes: { role: "Teacher", employmentTags: [], subjectTags: [] },
    fieldRevisions: { role: 0, employmentTags: 0, subjectTags: 0 },
  });
  await f.call(f.admin, "roster", "/upload", { ...s.payload, operationId: "synthetic-statistics-baseline" });
  const version = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-statistics-plan", name: "Synthetic Statistics workload", year: Number(year), from: today, to: s.end,
  });
  const ordinary = await f.seedAccount("synthetic-statistics-ordinary", { staffId: b, capabilities: [] });
  async function record(collection, id, data, date = null, kind = "array") {
    await db.prepare("INSERT INTO roster_records(school_id,collection,record_id,service_date,revision,payload_json) VALUES(?,?,?,?,1,?)")
      .bind(schoolId, collection, id, date, JSON.stringify({ kind, data })).run();
  }
  for (const [key, value] of Object.entries({ effectiveDate: first, fairnessMode: "opening-balances", openingBalancesConfirmedAt: first + "T00:00:00Z" }))
    await record("freshStart", key, value, null, "map");
  await record("accountingYears", year, { verified: false }, null, "map");
  for (const [id, asOfDate, cumulativeDone, cumulativeQuota] of [[a, cutoff, 4, 20], [b, today, 3, 10]]) {
    await record("openingBalances", "synthetic-opening-" + id, { staffId: id, year, asOfDate, cumulativeDone, cumulativeQuota, version: 1 });
    await db.prepare("INSERT INTO roster_openings VALUES(?,?,?,1,?,NULL,?,'synthetic-digest','synthetic-opening')")
      .bind(schoolId, id, year, asOfDate, cumulativeDone).run();
    await db.prepare("INSERT INTO roster_weekly(school_id,staff_id,week,publication_id,publication_sequence,calculation_version,quota,captured_at,evidence_json) VALUES(?,?,?,'synthetic-historical-publication',1,'synthetic/1',10,?,'{}')")
      .bind(schoolId, id, weekOf(today), Date.now()).run();
  }
  async function ledger(id, staffId, date, correction = 0, charge = 1, scope = schoolId) {
    const assignment = { assignmentId: id, staffId, date, period: 0, rCost: 1,
      className: "Synthetic class", subject: "Synthetic subject", status: "published", origin: "manual" };
    await db.prepare("INSERT INTO roster_ledger VALUES(?,?,?,?,?,0,?,?,'synthetic-completion',?,'synthetic-actor','Synthetic review',?,?)")
      .bind(scope, id, correction, staffId, date, charge, charge, JSON.stringify(assignment), id + ":" + correction, Date.now()).run();
  }
  await ledger("synthetic-old-completed", a, past);
  await ledger("synthetic-today-completed", a, today);
  await ledger("synthetic-cancelled", a, past);
  await ledger("synthetic-cancelled", a, past, 1, -1);
  await ledger("synthetic-before-opening", b, past);
  await ledger("synthetic-other-school", a, today, 0, 9, "other-synthetic-school");
  await record("assignments", "synthetic-commitment", {
    id: "synthetic-commitment", staffId: a, date: today, period: 1,
    status: "draft", rCost: 1, origin: "manual", subject: "Synthetic subject",
  }, today);
  await record("absences", "synthetic-absence", {
    id: "synthetic-absence", staffId: b, date: past, typeId: "mc", typeLabel: "Synthetic absence",
    periods: [0], createdAt: past + "T00:00:00Z",
  }, past);
  const businessState = async () => Object.fromEntries(await Promise.all(
    ["roster_records", "roster_ledger", "roster_openings", "roster_weekly", "product_operations", "product_outbox"]
      .map(async table => [table, (await db.prepare("SELECT * FROM " + table + " ORDER BY rowid").all()).results])));
  const before = await businessState(), page = await f.pageFor(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const reportResponse = page.waitForResponse(r => r.url().endsWith("/api/roster/operations") && r.request().postDataJSON()?.operation === "statistics");
  const rankResponse = page.waitForResponse(r => r.url().endsWith("/api/roster/operations") && r.request().postDataJSON()?.operation === "statisticsRPercent");
  await page.getByRole("button", { name: /^Statistics/ }).click();
  const [report, rank] = await Promise.all([reportResponse, rankResponse]);
  const wire = (await report.json()).data;
  assert.equal(wire?.schema, 1, "The built Statistics screen must receive its encoded native report contract.");
  assert.equal(rank.status(), 200, "The built screen's cumulative ranking operation must exist.");
  const ranking = (await rank.json()).data, rowA = ranking.rows.find(row => row.staffId === a), rowB = ranking.rows.find(row => row.staffId === b);
  const entitlement = 20 + (weekOf(today).startsWith(year) ? 10 : 0);
  assert.equal(rowA.completed, 6, "Opening four plus two completed duties; cancelled work is excluded.");
  assert.equal(rowA.committed, 1);
  assert.equal(rowA.entitlement, entitlement);
  assert.equal(rowA.percentage, 700 / entitlement);
  assert.equal(rowA.lastReliefDate, today);
  assert.equal(rowB.completed, 3, "An opening cutoff must exclude older retained duties.");
  assert.equal(rowB.entitlement, 10);
  assert.match(ranking.warnings.join(" "), /history is not verified/i);
  assert.match(ranking.warnings.join(" "), /Estimated current workload/);
  const table = page.locator('[data-stats-table="rPercent"]');
  await table.waitFor();
  assert.match(await table.innerText(), /Synthetic Teacher A/);
  const note = await table.locator("[data-stats-fairness-note]").innerText();
  assert.match(note, /Estimated current workload/);
  assert.match(note, /recorded completed and committed relief with captured entitlement/);
  assert.doesNotMatch(note, /allocator’s fairness value/);
  console.log("PASS actual Statistics UI and annual ranking: opening cutoff, older ledger/correction, commitment and frozen quota; estimated/unknown-history warnings.");

  const all = await f.call(f.admin, "roster", "/operations", { operation: "statistics", from: first, to: today });
  assert.equal(all.bytes, new TextEncoder().encode(all.data).length);
  const snapshot = JSON.parse(all.data);
  assert.equal(snapshot.absenceRows.length, 1);
  assert.equal(snapshot.activityRows.filter(row => row.staffId === a).length, 2);
  assert(!snapshot.activityRows.some(row => row.id.includes("cancelled") || row.id.includes("other-school")));
  const cached = await f.call(f.admin, "roster", "/operations", { operation: "statistics", from: first, to: today, knownKey: all.key });
  assert.equal(cached.unchanged, true);
  assert.equal(cached.key, all.key);
  assert.equal(cached.revision, all.revision);
  const requestCount = f.requests.length;
  await table.locator('[data-stats-filter="name"]').fill("Teacher A");
  assert.equal(await table.locator("tbody tr").count(), 1);
  assert.doesNotMatch(await table.locator("tbody").innerText(), /Teacher B/);
  const [file] = await Promise.all([
    page.waitForEvent("download", { timeout: 7000 }),
    table.locator('[data-stats-export="rPercent"]').click(),
  ]);
  assert.match(file.suggestedFilename(), /^GSiS-rPercent-.*\.xlsx$/);
  const zip = await JSZip.loadAsync(await readFile(await file.path()));
  const xml = (await Promise.all(Object.keys(zip.files).filter(name => /\.xml$/.test(name)).map(name => zip.file(name).async("string")))).join("\n");
  assert.match(xml, /Synthetic Teacher A/);
  assert.doesNotMatch(xml, /Synthetic Teacher B/);
  assert.match(xml, /Estimated current workload/);
  assert.equal(f.requests.length, requestCount, "Filtering and Excel generation stay local.");
  console.log("PASS native encoded report, cache identity, local partial filter and downloaded Excel with evidence warnings.");

  const denied = await f.request(ordinary, "roster", "/operations", { method: "POST", body: { operation: "statisticsRPercent" } });
  assert.equal(denied.status, 403);
  const tooLong = await f.request(f.admin, "roster", "/operations", { method: "POST", body: { operation: "statistics", from: priorYear + "-01-01", to: today } });
  assert.equal(tooLong.status, 400);
  assert.deepEqual(await businessState(), before, "Reports cannot write duties, quota, opening/history, operations or outbox.");
  let reads = 0;
  const measured = { prepare(sql) { reads++; return db.prepare(sql); } };
  const revisions = await weeklyScopeRevisions(measured, schoolId, { from: first, to: year + "-12-31" });
  assert.equal(reads, 1, "Annual revision fences are loaded with one bounded D1 read.");
  assert(Object.keys(revisions).length >= 52);
  await page.reload();
  await page.getByRole("button", { name: /^Statistics/ }).click();
  await page.locator('[data-stats-table="rPercent"]').waitFor();
  assert.match(await page.locator('[data-stats-table="rPercent"]').innerText(), /Synthetic Teacher A/);
  assert.deepEqual(errors, []);
  console.log("PASS current authority denial, range bounds, school isolation, bounded annual fences and reload without business writes.");

  await f.call(f.admin, "contacts", "/staff/" + b + "/update", {
    operationId: "synthetic-statistics-sre", changes: { employmentTags: ["SRE"] }, fieldRevisions: { employmentTags: 1 },
  });
  const estimated = await f.call(f.admin, "roster", "/operations", { operation: "statisticsRPercent" });
  assert(!estimated.rows.some(row => row.staffId === b));
  assert.match(estimated.warnings.join(" "), /Some SRE ranking values are unavailable/);
  const daily = await f.call(f.admin, "contacts", "/save-data", {
    operationId: "synthetic-statistics-daily-sre", changes: [], additions: [{ id: "synthetic-daily-row", values: {
      "Basic Name": "Synthetic Daily SRE", "Statutory Name": "Synthetic Daily SRE", "EO Appt Level": "EO",
      Role: "Teacher", Active: "Y", "School Section": "Primary", "Employment Modifier": "SRE",
      "Employment Arrangement": "Full-time", "Appointment Status": "Confirmed", "Subject Modifier": "",
      "MK Modifier": "", "Personnel Category": "Teaching", "Profile Completion": "complete",
    } }],
  });
  const dailyId = daily.mapping["synthetic-daily-row"];
  await f.call(f.admin, "contacts", "/staff/" + dailyId + "/update", {
    operationId: "synthetic-statistics-daily-facts", changes: { subjectTags: [] }, fieldRevisions: { subjectTags: 0 },
  });
  for (const field of ["smc", "eo", "schoolLeader"]) await f.call(f.admin, "contacts", "/staff/" + dailyId + "/accept", {
    operationId: "synthetic-statistics-daily-" + field, field, value: field === "eo", revision: 0,
    ownerReviewReference: "Synthetic owner review",
  });
  // Seed a retained synthetic planning assignment. Publication, calculation
  // and the report still pass through the real owner Workers and databases.
  const deploy = await f.db("deploy"), initial = await loadVersion(deploy, schoolId, version.versionId);
  const doc = structuredClone(initial.doc);
  doc.classes = [{ ref: "synthetic-statistics-class", level: "1", name: "Synthetic class", shortName: "S" }];
  doc.loads["1"] = Object.fromEntries(Object.keys(doc.loads["1"]).map(key => [key, key === "EL" ? 1 : 0]));
  doc.assignments = [{ id: "synthetic-statistics-teaching", target: "1S", targetRef: "synthetic-statistics-class", subject: "EL", teacher: b }];
  doc.workload.categories.EL = "Teaching";
  await deploy.batch(changesFor(schoolId, version.versionId, initial.rows, doc).writes.map(w => statement(deploy, w.sql, w.args)));
  const lease = await f.call(f.admin, "deploy", "/lease", { operationId: "synthetic-statistics-publish-lease",
    versionId: version.versionId, scope: "meta", clientId: "synthetic-statistics-publisher" });
  await f.call(f.admin, "deploy", "/publish", { operationId: "synthetic-statistics-publish",
    versionId: version.versionId, scope: "meta", clientId: "synthetic-statistics-publisher", leaseFence: lease.fence,
    revision: 0, expectedPointerSequence: 0 });
  const published = await f.call(f.admin, "roster", "/operations", { operation: "statisticsRPercent" });
  const workload = JSON.parse((await db.prepare("SELECT payload_json FROM roster_workload_snapshots WHERE school_id=? AND service_date=?")
    .bind(schoolId, today).first()).payload_json);
  assert.equal(published.workloadEvidence.quality, "unavailable", "The unrelated daily SRE has no weekly quota; aggregate quality stays truthful.");
  assert.equal(published.workloadEvidence.sourceKind, "publication");
  assert.equal(published.workloadEvidence.sourceId, workload.publicationId);
  assert.equal(workload.rows.find(row => row.staffId === b).quality, "verified", JSON.stringify(workload.rows));
  assert.equal(workload.rows.find(row => row.staffId === b).teaching, 1);
  assert.equal(workload.rows.find(row => row.staffId === dailyId).quality, "unavailable");
  assert.equal(published.rows.find(row => row.staffId === b)?.basis, "Weekly SRE", "One unavailable row must not hide another person's verified teaching basis.");
  assert(!published.rows.some(row => row.staffId === dailyId));
  assert.doesNotMatch(published.warnings.join(" "), /Estimated current workload/);
  assert.equal(published.rows.find(row => row.staffId === a).completed, 6);
  assert.equal(published.rows.find(row => row.staffId === a).entitlement, entitlement);
  assert.deepEqual(await businessState(), before, "Source refresh cannot rewrite Roster's captured historical quota or work.");
  console.log("PASS SRE unknown versus verified weekly evidence despite an unrelated unavailable row; publication refresh preserves annual totals.");
  await (await f.db("contacts")).prepare("DROP TABLE contacts_staff").run();
  await (await f.db("calendar")).prepare("DROP TABLE calendar_years").run();
  const retained = await f.call(f.admin, "roster", "/operations", { operation: "statistics", from: first, to: today });
  assert.equal(retained.key, all.key, "Historic owner reports stay available during unrelated current-source outages.");
  const unavailable = await f.request(f.admin, "roster", "/operations", { method: "POST", body: { operation: "statisticsRPercent" } });
  assert.equal(unavailable.status, 503, "Current ranking cannot invent missing current eligibility or workload evidence.");
  console.log("PASS historical reports survive synthetic Contacts/Calendar outage; current ranking remains fail-closed.");
} catch (error) {
  console.error(error);
  console.error(f.requests.filter(row => row.status >= 400));
  throw error;
} finally { await f.close(); }
