// Actual built Toolbox and nine local Workers; identities and storage are synthetic.
// Dry-run estimates must never become pending cleanup operations or delete data.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";

const SCHOOL = "synthetic-school",
  DAY = 86400000;
const PATH = "/api/core/admin/evidence/retention";
const suite = await productSuite();
let browser,
  closing = false,
  currentHold = null;
const allGates = [];
const flights = new Set(),
  requests = [],
  goodResponses = new Map(),
  routeErrors = [];
let fault = null;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function holdNext() {
  const entered = deferred(),
    released = deferred();
  currentHold = { entered, released };
  allGates.push(currentHold);
  return currentHold;
}
try {
  const admin = await suite.seedAccount("retention-preview-admin");
  const staff = await suite.seedAccount("retention-preview-staff", {
    capabilities: [],
  });
  const core = await suite.db("core"),
    deploy = await suite.db("deploy");
  const now = Date.now();
  const fixture = [
    ["ret-preview-old-400", 400],
    ["ret-preview-old-120", 120],
    ["ret-preview-local-admission", 400],
    ["ret-preview-local-pin", 400],
    ["ret-preview-remote", 400],
    ["ret-preview-recent", 5],
  ];
  // These are deliberately legacy/incomplete evidence rows, not fabricated verified decisions.
  await core.batch(
    fixture.map(([id, age]) =>
      core
        .prepare(
          "INSERT INTO core_evidence(school_id,decision_id,event_json,evidence_json,principal_json,descriptor_json,created_at,valid_until) VALUES(?,?,?,?,?,'{}',?,?)",
        )
        .bind(
          SCHOOL,
          id,
          JSON.stringify({ schoolId: SCHOOL, eventId: id }),
          JSON.stringify({ schemaVersion: 1, decisionId: id }),
          JSON.stringify({ schoolId: SCHOOL, decisionId: id }),
          now - age * DAY,
          now - age * DAY,
        ),
    ),
  );
  const admission = (db, op, id, age, state) =>
    db
      .prepare(
        "INSERT INTO product_admissions(school_id,operation_id,fence,digest,decision_id,valid_until,pins_json,state) VALUES(?,?,1,'synthetic-retention-digest',?,?,'[]',?)",
      )
      .bind(SCHOOL, op, id, now - age * DAY, state);
  await core.batch([
    admission(
      core,
      "ret-preview-terminal-400",
      "ret-preview-old-400",
      400,
      "resolved",
    ),
    admission(
      core,
      "ret-preview-terminal-120",
      "ret-preview-old-120",
      120,
      "aborted",
    ),
    admission(
      core,
      "ret-preview-held",
      "ret-preview-local-admission",
      400,
      "ready",
    ),
    core
      .prepare(
        "INSERT INTO source_pins(school_id,scope,pin_id,destination,operation_id,digest,fence,revision,valid_until,decision_id,state,created_at) VALUES(?,'synthetic-scope','ret-preview-pin','deploy','ret-preview-pin-op','synthetic-digest',1,'1',?,'ret-preview-local-pin','held',?)",
      )
      .bind(SCHOOL, now - 400 * DAY, now - 400 * DAY),
    core
      .prepare(
        "INSERT INTO core_destination_receipts(school_id,decision_id,destination,operation_id,digest,receipt_json,recorded_at) VALUES(?,'ret-preview-old-400','contacts','ret-preview-terminal-400','synthetic-digest','{}',?)",
      )
      .bind(SCHOOL, now - 400 * DAY),
  ]);
  await admission(
    deploy,
    "ret-preview-remote-op",
    "ret-preview-remote",
    400,
    "resolving",
  ).run();
  async function preservedRows() {
    const tables = [
      "core_evidence",
      "core_destination_receipts",
      "product_admissions",
      "source_pins",
      "product_operations",
    ];
    const records = {};
    for (const table of tables) {
      const filter =
        table === "core_evidence"
          ? " WHERE decision_id LIKE 'ret-preview-%'"
          : "";
      records[table] = (
        await core
          .prepare("SELECT * FROM " + table + filter + " ORDER BY 1,2")
          .all()
      ).results;
    }
    records.remote = (
      await deploy
        .prepare("SELECT * FROM product_admissions ORDER BY 1,2")
        .all()
    ).results;
    return records;
  }
  const originalRows = await preservedRows();
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath:
      process.env.GSIS_BROWSER_EXECUTABLE || process.env.ROSTER_TEST_CHROMIUM,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const setUser = (user) =>
    context.addCookies([
      {
        name: "__Host-gsis_session",
        value: user.token,
        url: origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  await setUser(admin);
  await context.route("**/*", (route) => {
    const flight = (async () => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      const body = request.postDataJSON(),
        retention = url.pathname === PATH && request.method() === "POST";
      if (retention) requests.push(structuredClone(body));
      if (fault?.kind === "classification" && request.method() === "POST") {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: {
              code: "SYNTHETIC_UNCERTAIN",
              message: "Synthetic transport uncertainty",
              retryable: true,
            },
          }),
        });
      }
      if (retention && fault?.kind === "error" && body.retentionDays === 90) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: {
              code: "SYNTHETIC_OUTAGE",
              message: "Synthetic owner unavailable",
              retryable: true,
            },
          }),
        });
      }
      if (
        retention &&
        fault?.kind === "envelope" &&
        body.retentionDays === 90
      ) {
        const value = structuredClone(goodResponses.get(90));
        fault.modify(value.data);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(value),
        });
      }
      const response = await suite.mf.dispatchFetch(request.url(), {
        method: request.method(),
        headers: await request.allHeaders(),
        body: request.postDataBuffer() || undefined,
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (
        retention &&
        response.status === 200 &&
        !goodResponses.has(body.retentionDays)
      ) {
        goodResponses.set(body.retentionDays, JSON.parse(bytes.toString()));
      }
      if (retention && currentHold) {
        const held = currentHold;
        currentHold = null;
        held.entered.resolve();
        await held.released.promise;
      }
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: bytes,
      });
    })().catch((error) => {
      if (!closing && !route.request().failure())
        routeErrors.push(error.message);
    });
    flights.add(flight);
    return flight.finally(() => flights.delete(flight));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(origin + "/admin/#evidence");
  await page.locator("#adminContent").waitFor({ state: "visible" });
  assert.equal(
    await page.locator("#retentionEstimate").count(),
    1,
    "Global Admin Decision evidence must expose the bounded retention estimate",
  );
  const button = page.locator("#retentionEstimate"),
    results = page.locator("#retentionResults");
  assert.equal(await button.textContent(), "Get estimate");
  await page.waitForFunction(
    () => !document.getElementById("retentionEstimate").disabled,
  );
  const noPending = async () =>
    assert.deepEqual(
      await page.evaluate(() => GSISV1.pending()),
      [],
      "an estimate must not enter save recovery",
    );
  const estimate = async () => {
    await button.click();
    await page.waitForFunction(
      () => !document.getElementById("retentionEstimate").disabled,
    );
  };
  const row = (days) => page.locator(`[data-retention-days="${days}"]`);
  const pause = holdNext();
  await button.click();
  await pause.entered.promise;
  assert.equal(await button.isDisabled(), true);
  await button.evaluate((node) => {
    node.click();
    node.click();
  });
  assert.equal(
    requests.length,
    1,
    "double click cannot start another estimate or parallel year read",
  );
  await noPending();
  pause.released.resolve();
  await page.waitForFunction(
    () => !document.getElementById("retentionEstimate").disabled,
  );
  assert.deepEqual(
    requests.map((x) => x.retentionDays),
    [90, 365],
  );
  for (const request of requests) {
    assert.deepEqual(Object.keys(request).sort(), [
      "dryRun",
      "limit",
      "operationId",
      "retentionDays",
    ]);
    assert.equal(request.dryRun, true);
    assert.equal(request.limit, 500);
    assert.match(request.operationId, /^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
  }
  assert.notEqual(requests[0].operationId, requests[1].operationId);
  for (const [days, evidence, admissions] of [
    [90, 2, 2],
    [365, 1, 1],
  ]) {
    const actual = goodResponses.get(days).data;
    assert.deepEqual(actual.eligible, { evidence, admissions });
    assert.equal(actual.protected.count, 1);
    assert.equal(
      actual.protected.reasons["ret-preview-remote"],
      "unresolved-owner-dependency:deploy",
    );
    assert.match(
      await row(days).innerText(),
      new RegExp(`Detailed evidence: ${evidence}\\.`),
    );
    assert.match(
      await row(days).innerText(),
      new RegExp(`Expired terminal Core admissions: ${admissions}\\.`),
    );
    await row(days).locator("summary").click();
    assert.match(
      await row(days).innerText(),
      /unresolved-owner-dependency:deploy/,
    );
  }
  assert.equal(
    await page
      .locator("#retentionPreview input,#retentionPreview select")
      .count(),
    0,
  );
  await noPending();
  console.log(
    "PASS 1: actual 90/365 owner scans, local/remote protection, serial double-click guard and no pending cleanup",
  );

  // Exceed the actual endpoint's 500-row bound using synthetic aged rows.
  const bulk = Array.from(
    { length: 501 },
    (_, i) => "ret-preview-bulk-" + i.toString().padStart(3, "0"),
  );
  await core
    .prepare(
      "INSERT INTO core_evidence(school_id,decision_id,event_json,evidence_json,principal_json,descriptor_json,created_at,valid_until) SELECT ?,value,'{}','{}','{}','{}',?,? FROM json_each(?)",
    )
    .bind(SCHOOL, now - 600 * DAY, now - 600 * DAY, JSON.stringify(bulk))
    .run();
  await estimate();
  for (const days of [90, 365]) {
    assert.equal(
      await row(days).getAttribute("data-retention-state"),
      "incomplete",
    );
    assert.match(await row(days).innerText(), /500/);
    assert.match(await row(days).innerText(), /additional|limit|bounded/i);
  }
  // Test-fixture cleanup only; no HTTP deletion or production retention operation.
  await core
    .prepare(
      "DELETE FROM core_evidence WHERE decision_id LIKE 'ret-preview-bulk-%'",
    )
    .run();
  await noPending();
  console.log(
    "PASS 2: actual 501-row source marks the 500-row scan incomplete",
  );

  for (const modify of [
    (data) => {
      data.eligible.evidence = -1;
    },
    (data) => {
      data.dryRun = false;
    },
    (data) => {
      data.deleted.evidence = 1;
    },
  ]) {
    fault = { kind: "envelope", modify };
    await estimate();
    assert.equal(await row(90).getAttribute("data-retention-state"), "error");
    assert.match(
      await row(90).innerText(),
      /invalid|unexpected|unavailable|failed|could not/i,
    );
    assert.doesNotMatch(await row(90).innerText(), /Detailed evidence: 0/);
    await noPending();
  }
  fault = { kind: "error" };
  await estimate();
  assert.equal(await row(90).getAttribute("data-retention-state"), "error");
  assert.equal(await row(365).getAttribute("data-retention-state"), "complete");
  assert.match(
    await page.locator("#retentionStatus").innerText(),
    /incomplete/i,
  );
  await noPending();
  console.log(
    "PASS 3: malformed/non-preview/deleting responses and owner outage never become zero or confirmed estimates",
  );

  fault = {
    kind: "envelope",
    modify(data) {
      data.eligible.evidence = 0;
      data.protected = {
        count: 3,
        unknownOwners: ["contacts"],
        reasons: {
          "ret-preview-old-400": "owner-status-unknown:contacts",
          "ret-preview-old-120": "owner-status-unknown:contacts",
          "ret-preview-remote": "unresolved-owner-dependency:deploy",
        },
      };
    },
  };
  await estimate();
  assert.equal(
    await row(90).getAttribute("data-retention-state"),
    "incomplete",
  );
  assert.match(
    await row(90).innerText(),
    /unavailable.*owner|owner.*incomplete/is,
  );
  assert.doesNotMatch(await row(90).innerText(), /Detailed evidence: 0/);
  await noPending();
  fault = null;
  console.log(
    "PASS 4: simulated unknown-owner reply keeps evidence savings unknown instead of presenting zero",
  );

  await page.locator("#decisionId").fill("ret-preview-old-400");
  await page
    .getByRole("button", { name: "Recover exact evidence", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .getElementById("evidenceResult")
      .textContent.includes("LEGACY_UNSEALED_EVIDENCE"),
  );
  const recovered = JSON.parse(
    await page.locator("#evidenceResult").innerText(),
  );
  assert.equal(recovered.verification.state, "incomplete");
  assert.equal(recovered.event.eventId, "ret-preview-old-400");
  assert.deepEqual(
    await preservedRows(),
    originalRows,
    "all original evidence, receipts, admissions, pins and operations survive previews",
  );
  assert.equal(
    (
      await core
        .prepare(
          "SELECT count(*) AS n FROM product_audit WHERE json_extract(details_json,'$.kind')='evidence-retention'",
        )
        .first()
    ).n,
    0,
  );
  console.log(
    "PASS 5: original legacy evidence still recovers as incomplete, with byte-equal retained rows and no cleanup operation",
  );

  // Change the real account while an actual owner reply and IndexedDB clearing are held.
  const late = holdNext();
  await button.click();
  await late.entered.promise;
  await setUser(staff);
  const epoch = await page.evaluate(() => GSISV1.saveStatus().contextEpoch);
  await page.evaluate(() => {
    const original = indexedDB.databases.bind(indexedDB);
    indexedDB.databases = () =>
      new Promise((resolve) => {
        window.releaseRetentionIdb = () => {
          indexedDB.databases = original;
          resolve([]);
        };
      });
    window.retentionClearing = GSISV1.clearProtectedState();
  });
  assert.equal(
    await page.evaluate(() => GSISV1.saveStatus().contextEpoch),
    epoch + 1,
  );
  assert.equal(
    await results.innerText(),
    "",
    "old-account counts disappear before asynchronous IndexedDB cleanup",
  );
  assert.equal(await button.isDisabled(), true);
  late.released.resolve();
  await page.evaluate(async () => {
    window.releaseRetentionIdb();
    await window.retentionClearing;
    await GSISV1.getSession(true);
  });
  await Promise.allSettled([...flights]);
  assert.equal(
    await page.locator("#retentionResults").count(),
    0,
    "completed context cleanup removes the old panel; late replies cannot restore it",
  );
  assert.equal(await page.locator("#retentionEstimate").count(), 0);
  const denied = await suite.request(
    staff,
    "core",
    "/admin/evidence/retention",
    {
      method: "POST",
      body: {
        operationId: "ret-preview-denied",
        dryRun: true,
        retentionDays: 90,
        limit: 500,
      },
    },
  );
  assert.equal(denied.status, 403);
  console.log(
    "PASS 6: real account switch clears counts synchronously and suppresses late replies; non-Admin owner access denied",
  );

  await setUser(admin);
  await page.reload();
  await page.waitForFunction(
    () =>
      document.getElementById("retentionEstimate") &&
      !document.getElementById("retentionEstimate").disabled,
  );
  // Synthetic transport uncertainty isolates client classification; none reaches a deleting handler.
  fault = { kind: "classification" };
  const classification = await page.evaluate(async () => {
    const cases = [
      {
        id: "ret-preview-read",
        domain: "core",
        path: "/admin/evidence/retention",
        body: { dryRun: true },
      },
      {
        id: "ret-preview-false",
        domain: "core",
        path: "/admin/evidence/retention",
        body: { dryRun: false, action: "read" },
      },
      {
        id: "ret-preview-omitted",
        domain: "core",
        path: "/admin/evidence/retention",
        body: { action: "read" },
      },
      {
        id: "ret-preview-wrong-domain",
        domain: "contacts",
        path: "/admin/evidence/retention",
        body: { dryRun: true },
      },
      {
        id: "ret-preview-other-path",
        domain: "core",
        path: "/admin/evidence/retention-extra",
        body: { dryRun: true },
      },
    ];
    const outcomes = [];
    for (const item of cases) {
      try {
        await GSISV1.request(item.domain, item.path, {
          method: "POST",
          body: { operationId: item.id, ...item.body },
        });
        outcomes.push("unexpected-success");
      } catch (error) {
        outcomes.push(error.code);
      }
    }
    return {
      outcomes,
      pending: GSISV1.pending()
        .map((item) => item.operationId)
        .sort(),
    };
  });
  assert.deepEqual(
    classification.outcomes,
    Array(5).fill("SYNTHETIC_UNCERTAIN"),
  );
  assert.deepEqual(classification.pending, [
    "ret-preview-false",
    "ret-preview-omitted",
    "ret-preview-other-path",
    "ret-preview-wrong-domain",
  ]);
  assert.deepEqual(await preservedRows(), originalRows);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(routeErrors, []);
  console.log(
    "PASS 7: only exact Core path plus explicit true bypasses pending-write recovery; false/omitted/wrong paths remain writes",
  );
} finally {
  closing = true;
  for (const gate of allGates) gate.released.resolve();
  await browser?.close();
  await Promise.allSettled([...flights]);
  await suite.close();
}
