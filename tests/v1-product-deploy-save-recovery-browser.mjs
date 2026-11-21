/** Actual built Deploy/client and isolated Workers/D1. Controlled transport
 * failures are synthetic; no hosted operation or runtime UAT is verified. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { authorize } from "../v1/runtime/security.mjs";
import { policy } from "../v1/services/deploy/service.mjs";
import { digest, prepareOperation } from "../v1/runtime/store.mjs";
import { productSuite, origin } from "./v1-product/suite.mjs";

const suite = await productSuite({
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-recovery.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});
let browser;
try {
  const actor = await suite.seedAccount("save-recovery-admin");
  const { versionId } = await suite.call(actor, "deploy", "/versions/create", {
    operationId: "recovery-plan",
    name: "Synthetic recovery",
    year: 2026,
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.GSIS_BROWSER_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1180, height: 820 },
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
  const requests = [],
    errors = [],
    changeLosses = [];
  let foreignReceipt = null,
    contactReceipt = null;
  const contactsChanges = [
    {
      staffId: "synthetic-shared-contact",
      field: "Basic Name",
      value: "Synthetic",
      expected: "",
    },
  ];
  const contactsDigest = await digest({
    schoolId: "synthetic-school",
    actorId: actor.id,
    action: "contacts.manage",
    intent: { changes: contactsChanges, additions: [] },
  });
  let rejectChange = true,
    loseChange = false,
    receiptOverride = null,
    holdReceipt = false,
    releaseReceipt = null,
    prepareNext = false,
    syncBarrier = null;
  async function prepareInterrupted(body) {
    const core = await suite.mf.getWorker("gsis-core");
    const env = {
      SCHOOL_ID: "synthetic-school",
      SERVICE_NAME: "deploy",
      GSIS_SECRET: suite.secret,
      CORE: {
        fetch: async (request) =>
          core.fetch(request.url, {
            method: request.method,
            headers: Object.fromEntries(request.headers),
            body: await request.text(),
          }),
      },
    };
    const request = new Request(origin + "/change", {
      method: "POST",
      headers: {
        origin,
        cookie: "__Host-gsis_session=" + actor.token,
        "x-csrf-token": actor.csrf,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const bound = { ...body };
    delete bound.requestId;
    const now = Date.now(),
      principal = await authorize(
        env,
        request,
        {
          ...policy("POST", "/change", body),
          service: "deploy",
          operationId: body.operationId,
          bodyDigest: await digest(bound),
        },
        now,
      );
    const intent = { ...body };
    for (const key of [
      "requestId",
      "operationId",
      "protocol",
      "authority",
      "auditPaged",
      "reliefResults",
      "returnDelta",
      "since",
      "knownCatalogueHash",
    ])
      delete intent[key];
    await prepareOperation(await suite.db("deploy"), {
      schoolId: "synthetic-school",
      actorId: actor.id,
      operationId: body.operationId,
      action: principal.action,
      intent,
      now,
      validUntil: principal.validUntil,
      authorization: principal,
    });
  }
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (request.method() === "POST")
      requests.push({ path: url.pathname, body: request.postDataJSON() });
    if (
      url.pathname === "/api/deploy/versions/create" &&
      request.postDataJSON()?.operationId?.startsWith("creation-malformed")
    )
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            saved: true,
            revision: 0,
            requestId: "different",
            versionId: "version-unverified",
          },
        }),
      });
    if (
      url.pathname === "/api/venues/command" ||
      url.pathname === "/api/contacts/save-data"
    )
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { state: "unknown" } }),
      });
    if (["/api/venues/receipt", "/api/calendar/receipt"].includes(url.pathname))
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: foreignReceipt }),
      });
    if (url.pathname === "/api/contacts/save-receipt")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: contactReceipt }),
      });
    if (rejectChange && url.pathname === "/api/deploy/change")
      return route.fulfill({
        status: Number.isInteger(rejectChange) ? rejectChange : 409,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          code: "SYNTHETIC_CONFLICT",
          error: "Synthetic unverified conflict",
        }),
      });
    if (prepareNext && url.pathname === "/api/deploy/change") {
      prepareNext = false;
      await prepareInterrupted(request.postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { state: "prepared", saved: false },
        }),
      });
    }
    if (
      url.pathname === "/api/deploy/receipt" &&
      request.postDataJSON()?.recovery
    ) {
      if (holdReceipt) {
        holdReceipt = false;
        await new Promise((resolve) => (releaseReceipt = resolve));
      }
      if (receiptOverride)
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: receiptOverride }),
        });
    }
    const response = await suite.mf.dispatchFetch(request.url(), {
      method: request.method(),
      headers: await request.allHeaders(),
      body: ["GET", "HEAD"].includes(request.method())
        ? undefined
        : request.postDataBuffer(),
    });
    const responseBody = Buffer.from(await response.arrayBuffer());
    if (syncBarrier && url.pathname === "/api/deploy/sync") {
      const barrier = syncBarrier;
      syncBarrier = null;
      barrier.reached(JSON.parse(responseBody).data);
      await barrier.release;
    }
    if (loseChange && url.pathname === "/api/deploy/change") {
      loseChange = false;
      const payload = JSON.parse(responseBody),
        requestId = request.postDataJSON().operationId;
      changeLosses.push({ status: response.status, payload, requestId });
      // A lost-commit fixture must never hide an actual rejection as a commit.
      if (
        response.status === 200 &&
        payload.ok === true &&
        payload.data?.saved === true &&
        payload.data.requestId === requestId
      )
        return route.abort();
    }
    const headers = Object.fromEntries(response.headers);
    delete headers["transfer-encoding"];
    await route.fulfill({
      status: response.status,
      headers,
      body: responseBody,
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(origin + "/deploy/");
  await page.waitForFunction(
    (id) => document.getElementById("version")?.value === id,
    versionId,
  );
  await page.evaluate(async () => {
    queueCell({
      operation: "setLoad",
      level: "1",
      subject: "Science",
      value: 4,
      expected: v().loads?.["1"]?.Science ?? null,
    });
    await pumpQueue(true);
  });
  assert.equal(
    await page.evaluate(() => !!queueFlight),
    true,
    "an HTTP409 without matching durable outcome cannot unlock the submitted queue",
  );
  console.log(
    "PASS ordinary queue retains original unknown operation after unverified HTTP denial.",
  );
  const original = structuredClone(
    requests.filter((r) => r.path.endsWith("/change")).at(-1).body,
  );
  const writes = () => requests.filter((r) => r.path.endsWith("/change"));
  const leases = () => requests.filter((r) => r.path.endsWith("/lease"));
  const check = () => page.locator('[data-deploy-recovery-action="check"]');
  const retry = () => page.locator('[data-deploy-recovery-action="retry"]');
  const waitForSavedSnapshot = (id, science) =>
    page.waitForFunction(
      ({ id, science }) =>
        !queueFlight &&
        !refreshing &&
        current === id &&
        snapshotCache?.id === id &&
        Number.isInteger(snapshotCache.revision) &&
        snapshotCache.revision === v()?.revision &&
        v()?.loads?.["1"]?.Science === science &&
        !document.getElementById("content").inert,
      { id, science },
    );
  function assertCommittedResponseLoss(index, requestId) {
    assert.equal(changeLosses.length, index + 1);
    const lost = changeLosses[index];
    assert.equal(
      lost.status,
      200,
      "the lost response was a real owner success",
    );
    assert.equal(lost.payload.ok, true);
    assert.equal(lost.payload.data.saved, true);
    assert.equal(lost.payload.data.requestId, requestId);
    assert.equal(lost.requestId, requestId);
  }
  await check().click();
  await page.waitForFunction(() => !queueFlight?.running);
  assert.equal(writes().length, 1, "check is read-only");
  assert.equal(
    await page.evaluate(() => !!queueFlight),
    true,
    "missing durable operation stays unknown",
  );
  if (process.env.GSIS_WEB_EVIDENCE_DIR) {
    await mkdir(process.env.GSIS_WEB_EVIDENCE_DIR, { recursive: true });
    await page.screenshot({
      path: join(
        process.env.GSIS_WEB_EVIDENCE_DIR,
        "deploy-save-recovery-desktop.png",
      ),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await page
      .locator("[data-deploy-recovery]")
      .evaluate((node) => ({
        right: node.getBoundingClientRect().right,
        width: innerWidth,
      }));
    assert(
      bounds.right <= bounds.width,
      "recovery actions stay within the narrow viewport",
    );
    await page.screenshot({
      path: join(
        process.env.GSIS_WEB_EVIDENCE_DIR,
        "deploy-save-recovery-narrow.png",
      ),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1180, height: 820 });
  }
  const leaseCount = leases().length;
  for (const status of [400, 403, 404, 503]) {
    rejectChange = status;
    await retry().click();
    await page.waitForFunction(() => !queueFlight?.running);
    assert.equal(
      await page.evaluate(() => queueFlight?.requestId),
      original.operationId,
    );
    assert.deepEqual(writes().at(-1).body, original);
  }
  rejectChange = false;
  let releaseSync, reportSync, syncTimeout;
  const syncReached = new Promise((resolve) => (reportSync = resolve));
  syncBarrier = {
    reached: reportSync,
    release: new Promise((resolve) => (releaseSync = resolve)),
  };
  await retry().click();
  await page.waitForFunction(() => !queueFlight);
  try {
    const savedSnapshot = await Promise.race([
      syncReached,
      new Promise((_, reject) => {
        syncTimeout = setTimeout(
          () =>
            reject(Error("Post-commit owner sync did not reach the barrier")),
          5000,
        );
      }),
    ]);
    assert.equal(savedSnapshot.current.loads["1"].Science, 4);
    const savedRevision = savedSnapshot.versions.find(
      (entry) => entry.id === versionId,
    ).revision;
    const beforeRefresh = await page.evaluate(() => ({
      refreshing,
      snapshot: snapshotCache,
      revision: v().revision,
      inert: document.getElementById("content").inert,
    }));
    assert.equal(beforeRefresh.refreshing, true);
    assert.equal(beforeRefresh.snapshot, null);
    assert.equal(beforeRefresh.inert, true);
    assert(beforeRefresh.revision < savedRevision);
    releaseSync();
    await waitForSavedSnapshot(versionId, 4);
    assert.equal(await page.evaluate(() => v().revision), savedRevision);
  } finally {
    clearTimeout(syncTimeout);
    releaseSync();
  }
  assert.deepEqual(
    writes().at(-1).body,
    original,
    "explicit retry sends identical complete wire",
  );
  assert.equal(
    leases().length,
    leaseCount,
    "retry does not acquire a new lease",
  );
  assert.equal(
    (await suite.call(actor, "deploy", "/bootstrap", { versionId })).current
      .loads["1"].Science,
    4,
  );
  assert.equal(
    await page.evaluate(
      (id) =>
        GSISV1.pending().some(
          (entry) => entry.operationId === id + ":lease" && !entry.terminal,
        ),
      original.operationId,
    ),
    false,
    "confirmed child lease no longer consumes pending capacity",
  );
  console.log(
    "PASS original receipt check never writes; explicit retry uses complete frozen wire and same lease.",
  );

  loseChange = true;
  await page.evaluate(async () => {
    queueCell({
      operation: "setLoad",
      level: "1",
      subject: "Science",
      value: 5,
      expected: v().loads["1"].Science,
    });
    await pumpQueue(true);
  });
  assert.equal(await page.evaluate(() => !!queueFlight), true);
  const lostId = writes().at(-1).body.operationId,
    beforeCheck = writes().length;
  assertCommittedResponseLoss(0, lostId);
  await check().click();
  await page.waitForFunction(() => !queueFlight);
  assert.equal(
    writes().length,
    beforeCheck,
    "lost committed response is recovered without resend",
  );
  assert.equal(
    (await suite.call(actor, "deploy", "/bootstrap", { versionId })).current
      .loads["1"].Science,
    5,
  );
  assert.equal(
    await page.evaluate(
      (id) =>
        GSISV1.pending().some(
          (entry) => entry.operationId === id && !entry.terminal,
        ),
      lostId,
    ),
    false,
  );
  await waitForSavedSnapshot(versionId, 5);
  console.log(
    "PASS real Worker/D1 committed save recovers after response loss without duplicate write.",
  );

  await page
    .locator("#nav")
    .getByRole("button", { name: "Versions", exact: true })
    .click();
  const noteRow = page.locator('[data-version-row="' + versionId + '"]');
  rejectChange = true;
  await noteRow.locator("[data-note-input]").fill("Unconfirmed synthetic note");
  await noteRow.locator("[data-note-save]").click();
  await page.waitForFunction(
    (id) =>
      !!versionNoteDrafts.get(id)?.attempt &&
      !versionNoteDrafts.get(id)?.saving,
    versionId,
  );
  assert.equal(
    await noteRow.locator("[data-note-input]").isEditable(),
    false,
    "unverified note remains locked",
  );
  const beforeNote = writes().length;
  await noteRow
    .getByRole("button", { name: "Check original note", exact: true })
    .click();
  await page.waitForFunction(
    (id) => !versionNoteDrafts.get(id)?.saving,
    versionId,
  );
  assert.equal(writes().length, beforeNote);
  rejectChange = false;
  await noteRow
    .getByRole("button", { name: "Retry original note", exact: true })
    .click();
  await page.waitForFunction(
    (id) => !versionNoteDrafts.get(id)?.attempt,
    versionId,
  );
  assert.equal(
    (await suite.call(actor, "deploy", "/bootstrap", { versionId })).current
      .notes,
    "Unconfirmed synthetic note",
  );
  console.log(
    "PASS version-note unknown outcome locks the original note and separates check from exact retry.",
  );

  const other = await suite.call(actor, "deploy", "/versions/create", {
    operationId: "other-note-plan",
    name: "Other note plan",
    year: 2026,
  });
  await page.evaluate(() => refresh(true));
  const otherRow = page.locator('[data-version-row="' + other.versionId + '"]');
  loseChange = true;
  await otherRow.locator("[data-note-input]").fill("Original historical note");
  await otherRow.locator("[data-note-save]").click();
  await page.waitForFunction(
    (id) =>
      versionNoteDrafts.get(id)?.attempt && !versionNoteDrafts.get(id)?.saving,
    other.versionId,
  );
  assertCommittedResponseLoss(1, writes().at(-1).body.operationId);
  const grant = await suite.call(actor, "deploy", "/lease", {
    operationId: "later-note-lease",
    versionId: other.versionId,
    scope: "meta",
    clientId: "other-writer",
  });
  await suite.call(actor, "deploy", "/change", {
    operationId: "later-note-save",
    operation: "saveVersionNote",
    versionId: other.versionId,
    scope: "meta",
    clientId: "other-writer",
    leaseFence: grant.fence,
    revision: grant.revision,
    notes: "Later saved note",
    expected: "Original historical note",
  });
  await page.evaluate(() => refresh(true));
  await otherRow
    .getByRole("button", { name: "Check original note", exact: true })
    .click();
  await page.waitForFunction(
    (id) =>
      !versionNoteDrafts.get(id)?.attempt && !versionNoteDrafts.get(id)?.saving,
    other.versionId,
  );
  assert.equal(
    await otherRow.locator("[data-note-input]").inputValue(),
    "Later saved note",
  );
  assert.equal(
    await page.evaluate(() => current),
    versionId,
    "recovering another row never changes selected version",
  );
  console.log(
    "PASS historical nonselected note receipt cannot overwrite a later saved note.",
  );

  rejectChange = true;
  await page.evaluate(async () => {
    await acquire("meta");
    try {
      await change("saveVersionNote", {
        notes: "Direct synthetic note",
        expected: v().notes || "",
      });
    } catch {}
  });
  assert.equal(await page.evaluate(() => !!v1DirectSave), true);
  await page.evaluate(() => release());
  assert.equal(
    await page.evaluate(() => !!editing),
    true,
    "closing/releasing cannot forget an unresolved direct attempt",
  );
  rejectChange = false;
  await retry().click();
  await page.waitForFunction(() => !v1DirectSave);
  await waitForSavedSnapshot(versionId, 5);
  assert.equal(
    (await suite.call(actor, "deploy", "/bootstrap", { versionId })).current
      .notes,
    "Direct synthetic note",
  );
  console.log(
    "PASS direct edit retains its attempt and lease after error; recovery settles the exact request.",
  );

  await page.evaluate(async () => {
    queueCell({
      operation: "setLoad",
      level: "1",
      subject: "Science",
      value: -1,
      expected: v().loads["1"].Science,
    });
    await pumpQueue(true);
  });
  assert.equal(
    await page.evaluate(() => !!queueFlight),
    true,
    "validation HTTP error alone stays unresolved",
  );
  await check().click();
  await page.waitForFunction(() => !queueFlight);
  assert.equal(
    await page.evaluate(() => cellQueue[0]?.value),
    -1,
    "durable abort preserves the editable draft",
  );
  assert.equal(
    (await suite.call(actor, "deploy", "/bootstrap", { versionId })).current
      .loads["1"].Science,
    5,
  );
  await page.evaluate(() => discardDrafts());
  await page.waitForFunction(() => !cellQueue.length && !refreshing);
  prepareNext = true;
  await page.evaluate(async () => {
    queueCell({
      operation: "setLoad",
      level: "1",
      subject: "Science",
      value: 6,
      expected: v().loads["1"].Science,
    });
    await pumpQueue(true);
  });
  assert.equal(await page.evaluate(() => !!queueFlight), true);
  const stop = page.locator('[data-deploy-recovery-action="withdraw"]');
  assert.equal(await stop.isEnabled(), true);
  const beforeStop = writes().length;
  await stop.click();
  await page.waitForFunction(() => !queueFlight);
  assert.equal(writes().length, beforeStop);
  assert.equal(
    (await suite.call(actor, "deploy", "/bootstrap", { versionId })).current
      .loads["1"].Science,
    5,
  );
  assert.equal(
    requests.filter((r) => r.path.endsWith("/operations/withdraw")).length,
    1,
  );
  await page.evaluate(() => discardDrafts());
  await page.waitForFunction(() => !cellQueue.length && !refreshing);
  console.log(
    "PASS durable validation abort and explicit original-operation withdrawal unlock only the retained draft.",
  );

  rejectChange = true;
  await page.evaluate(async () => {
    queueCell({
      operation: "setLoad",
      level: "1",
      subject: "Science",
      value: 6,
      expected: v().loads["1"].Science,
    });
    await pumpQueue(true);
  });
  const reloadId = writes().at(-1).body.operationId;
  const recoveryStorage = await page.evaluate(() =>
    Object.entries(sessionStorage)
      .filter(([key]) => key.startsWith("gsis-operation-references:"))
      .map(([key, value]) => ({ key, value })),
  );
  assert(recoveryStorage.length, "minimal operation reference is persisted");
  assert(
    recoveryStorage.every(
      ({ value }) =>
        !value.includes("Direct synthetic note") &&
        !value.includes("edits") &&
        !value.includes("leaseFence"),
    ),
    "new recovery storage contains no full staff-bearing draft or request body",
  );
  await page.reload();
  await page.waitForFunction(() => !!current);
  if ((await page.locator("#version").inputValue()) !== versionId)
    await page.locator("#version").selectOption(versionId);
  await page.waitForFunction((id) => queueFlight?.requestId === id, reloadId);
  assert.equal(
    await retry().isDisabled(),
    true,
    "reload reference cannot reconstruct a final request",
  );
  const beforeReloadCheck = writes().length;
  await check().click();
  await page.waitForFunction(() => !queueFlight?.running);
  assert.equal(writes().length, beforeReloadCheck);
  console.log(
    "PASS reload restores a minimal original reference with check-only recovery, never reconstructed write.",
  );
  const originalFlight = await page.evaluate(() => queueFlight.requestId);
  receiptOverride = {
    state: "committed",
    saved: true,
    operationId: "wrong-original",
    bindingVerified: true,
  };
  await check().click();
  await page.waitForFunction(() => !queueFlight?.running);
  assert.equal(
    await page.evaluate(() => queueFlight?.requestId),
    originalFlight,
    "malformed/wrong receipt cannot clear original",
  );
  receiptOverride = null;
  holdReceipt = true;
  await check().click();
  for (let i = 0; i < 40 && !releaseReceipt; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert(releaseReceipt);
  await page.evaluate(() => GSISV1.clearProtectedState());
  releaseReceipt();
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => queueFlight), null);
  assert.equal(
    await page.evaluate(
      () => document.getElementById("content").children.length,
    ),
    0,
  );
  console.log(
    "PASS mismatched receipt and delayed protected-context response cannot unlock or restore another session.",
  );
  await page.reload();
  await page.waitForFunction(() => !!current);
  if ((await page.locator("#version").inputValue()) !== versionId)
    await page.locator("#version").selectOption(versionId);
  await page.waitForFunction(
    (id) => document.getElementById("version")?.value === id,
    versionId,
  );
  await page.evaluate(async () => {
    try {
      await GSISV1.request("venues", "/command", {
        method: "POST",
        body: { operationId: "shared-opaque", command: "synthetic" },
      });
    } catch {}
  });
  const hasPending = (id) =>
    page.evaluate(
      (id) =>
        GSISV1.pending().some(
          (entry) => entry.operationId === id && !entry.terminal,
        ),
      id,
    );
  assert.equal(await hasPending("shared-opaque"), true);
  foreignReceipt = {
    operationId: "shared-opaque",
    state: "committed",
    digest: "a".repeat(64),
  };
  await page.evaluate(() =>
    GSISV1.request("calendar", "/receipt", {
      method: "POST",
      body: { operationId: "shared-opaque" },
    }),
  );
  assert.equal(
    await hasPending("shared-opaque"),
    true,
    "same ID in another domain cannot clear unknown write",
  );
  await page.evaluate(() =>
    GSISV1.request("venues", "/receipt", {
      method: "POST",
      body: { operationId: "shared-opaque" },
    }),
  );
  assert.equal(
    await hasPending("shared-opaque"),
    true,
    "unknown owner digest cannot be replaced by arbitrary receipt hex",
  );
  await page.evaluate(async (changes) => {
    try {
      await GSISV1.request("contacts", "/save-data", {
        method: "POST",
        body: { requestId: "shared-contact", changes, additions: [] },
      });
    } catch {}
  }, contactsChanges);
  assert.equal(await hasPending("shared-contact"), true);
  contactReceipt = {
    receipt: {
      operationId: "shared-contact",
      state: "committed",
      digest: contactsDigest,
    },
    state: "committed",
  };
  await page.evaluate(() =>
    GSISV1.request("contacts", "/save-receipt", {
      method: "POST",
      body: { requestId: "shared-contact" },
    }),
  );
  assert.equal(
    await hasPending("shared-contact"),
    false,
    "known Contacts business digest resolves original pending across endpoints",
  );
  assert.equal(await hasPending("shared-opaque"), true);
  console.log(
    "PASS shared-client cleanup requires exact domain and known owner evidence, preserving Contacts endpoint recovery.",
  );
  await page.evaluate(() => GSISV1.clearProtectedState());
  await page.reload();
  await page.waitForFunction(() => !!current);
  const activeVersion = await page.evaluate(() => current);
  const beforeStorageWrites = writes().length,
    beforeStorageLeases = leases().length;
  await page.evaluate(async () => {
    window.__storageSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (String(key).includes("operation-references"))
        throw Error("Synthetic reference storage denied");
      return window.__storageSet.call(this, key, value);
    };
    queueCell({
      operation: "setLoad",
      level: "1",
      subject: "Science",
      value: 7,
      expected: v().loads["1"].Science,
    });
    await pumpQueue(true);
  });
  assert.equal(await page.evaluate(() => queueFlight), null);
  assert.equal(await page.evaluate(() => cellQueue.length), 1);
  assert.equal(writes().length, beforeStorageWrites);
  assert.equal(leases().length, beforeStorageLeases);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__storageSet;
  });
  rejectChange = false;
  await page.evaluate(() => pumpQueue(true));
  await page.waitForFunction(() => !queueFlight && !cellQueue.length);
  console.log(
    "PASS proven fresh local storage refusal keeps draft editable and sends neither lease nor save.",
  );

  const refreshVersion = await suite.call(actor, "deploy", "/versions/create", {
    operationId: "legacy-refresh-plan",
    name: "Synthetic publication refresh",
    year: 2026,
  });
  await (
    await suite.db("venues")
  )
    .prepare(
      "INSERT INTO venues_records(school_id,kind,record_id,revision,data_json) VALUES(?,'venues',?,7,?)",
    )
    .bind(
      "synthetic-school",
      "recovery-room",
      JSON.stringify({
        id: "recovery-room",
        name: "Synthetic room",
        unit: "A-01",
      }),
    )
    .run();
  const refreshed = await page.evaluate(async (id) => {
    const lease = await GSISV1.request("deploy", "/lease", {
      method: "POST",
      body: {
        operationId: "legacy-refresh-lease",
        versionId: id,
        revision: 0,
        scope: "meta",
        clientId: "v1-publish",
      },
    });
    return GSISV1.request("deploy", "/change", {
      method: "POST",
      body: {
        operationId: "legacy-refresh-save",
        versionId: id,
        revision: 0,
        leaseFence: lease.fence,
        scope: "meta",
        clientId: "v1-publish",
        operation: "refreshVenueRegistry",
      },
    });
  }, refreshVersion.versionId);
  assert.equal(refreshed.saved, true);
  assert.equal(refreshed.workingRevision, 1);
  assert.equal(await hasPending("legacy-refresh-save"), true);
  assert.equal(
    await page.evaluate(() =>
      GSISV1.operationStates("deploy").some(
        (entry) => entry.operationId === "legacy-refresh-save",
      ),
    ),
    false,
    "the publication panel's refresh does not create an ordinary-save recovery reference",
  );
  const refreshReceipt = await page.evaluate(
    (id) =>
      GSISV1.request("deploy", "/receipt", {
        method: "POST",
        body: { operationId: "legacy-refresh-save", versionId: id },
      }),
    refreshVersion.versionId,
  );
  assert.equal(refreshReceipt.state, "committed");
  assert.equal(refreshReceipt.receipt.result.workingRevision, 1);
  assert.equal(await hasPending("legacy-refresh-save"), false);
  assert.equal(await hasPending("legacy-refresh-lease"), false);
  assert.equal(
    await page.evaluate(() =>
      GSISV1.operationState("deploy", "legacy-refresh-save"),
    ),
    null,
  );
  console.log(
    "PASS publication venue refresh keeps its existing receipt path and creates no ordinary-save recovery reference.",
  );

  await page.evaluate(() =>
    GSISV1.request("deploy", "/versions/create", {
      method: "POST",
      body: {
        operationId: "creation-clean",
        name: "Client-created synthetic",
        year: 2026,
      },
    }),
  );
  assert.equal(await hasPending("creation-clean"), false);
  await page.evaluate(() =>
    GSISV1.request("deploy", "/versions/create", {
      method: "POST",
      body: {
        operationId: "creation-malformed",
        name: "Unverified synthetic",
        year: 2026,
      },
    }),
  );
  assert.equal(
    await hasPending("creation-malformed"),
    true,
    "malformed creation acknowledgement retains original slot",
  );
  await page.evaluate(async () => {
    const count = GSISV1.pending().filter((entry) => !entry.terminal).length;
    for (let i = count; i < 126; i++) {
      try {
        await GSISV1.request("venues", "/command", {
          method: "POST",
          body: { operationId: "capacity-" + i, command: "synthetic" },
        });
      } catch {}
    }
  });
  const raced = await page.evaluate(async (id) => {
    const outcome = await Promise.allSettled([
      GSISV1.request("deploy", "/change", {
        method: "POST",
        freshAttempt: true,
        body: {
          operationId: "reserved-child-main",
          versionId: id,
          operation: "saveVersionNote",
          notes: "Reserved preparation slot",
        },
      }),
      GSISV1.request("venues", "/command", {
        method: "POST",
        body: { operationId: "unrelated-final-slot", command: "synthetic" },
      }),
    ]);
    const ref = GSISV1.operationState("deploy", "reserved-child-main");
    if (outcome[0].status === "fulfilled")
      await GSISV1.recoverOperation(ref, "check");
    return outcome.map((item) => ({
      status: item.status,
      code: item.reason?.code,
    }));
  }, activeVersion);
  assert.equal(raced[0].status, "fulfilled");
  assert.equal(
    raced[1].code,
    "PENDING_BOUNDS",
    "the child lease slot remains reserved across asynchronous preparation",
  );
  await page.evaluate(async () => {
    try {
      await GSISV1.request("venues", "/command", {
        method: "POST",
        body: { operationId: "capacity-last", command: "synthetic" },
      });
    } catch {}
  });
  const capacityBefore = await page.evaluate(
    () => GSISV1.pending().filter((entry) => !entry.terminal).length,
  );
  assert.equal(capacityBefore, 127);
  const beforeCapacity = requests.length;
  const capacityError = await page.evaluate(async (id) => {
    try {
      await GSISV1.request("deploy", "/change", {
        method: "POST",
        body: {
          operationId: "capacity-main",
          versionId: id,
          operation: "saveVersionNote",
          notes: "Capacity note",
        },
        freshAttempt: true,
      });
      return null;
    } catch (e) {
      return e.code;
    }
  }, activeVersion);
  assert.equal(capacityError, "PENDING_BOUNDS");
  assert.equal(
    requests.length,
    beforeCapacity,
    "two-slot preparation refuses before any lease or save",
  );
  assert.equal(
    await page.evaluate(
      () => GSISV1.pending().filter((entry) => !entry.terminal).length,
    ),
    127,
  );
  await page.evaluate(() =>
    GSISV1.request("venues", "/receipt", {
      method: "POST",
      body: { operationId: "shared-opaque" },
    }),
  );
  console.log(
    "PASS valid creation clears only its own slot and capacity refuses before auto-lease while receipt reads remain available.",
  );

  await page.evaluate(() => GSISV1.clearProtectedState());
  await page.reload();
  await page.waitForFunction(() => !!current);
  holdReceipt = true;
  releaseReceipt = null;
  await page.evaluate(() => {
    window.__oldDirect = (async () => {
      await acquire("meta");
      try {
        await change("saveVersionNote", {
          notes: "Old context note",
          expected: v().notes || "",
        });
      } catch (error) {
        return error.message;
      }
    })();
  });
  for (let i = 0; i < 100 && !releaseReceipt; i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert(releaseReceipt);
  await page.evaluate(async () => {
    await GSISV1.clearProtectedState();
    document.getElementById("status").textContent = "New protected context";
    busy = true;
  });
  releaseReceipt();
  await page.evaluate(() => window.__oldDirect);
  assert.deepEqual(
    await page.evaluate(() => ({
      status: document.getElementById("status").textContent,
      busy,
    })),
    { status: "New protected context", busy: true },
  );
  console.log(
    "PASS late initial direct-save receipt cannot mutate a newer protected context.",
  );
  await page.evaluate(() => (busy = false));
  await page.evaluate(() => {
    modal(
      "Old synthetic form",
      "<p>Old</p>",
      () => new Promise((resolve) => (window.__finishOldModal = resolve)),
    );
    document.querySelector("dialog #ok").click();
    document.querySelector("dialog").close();
    modal("Replacement synthetic form", "<p>Replacement</p>", async () => {});
    window.__finishOldModal();
  });
  await page.waitForTimeout(10);
  assert.equal(
    await page.locator("dialog[open] h2").innerText(),
    "Replacement synthetic form",
  );
  await page.evaluate(() => document.querySelector("dialog").close());
  console.log(
    "PASS delayed direct-form completion cannot close a replacement modal.",
  );

  // #245 Regression Handoff Scenario 6: Review of queued addTeacher / removeTeacher edits shows
  // escaped human-readable teacher, class/TG, subject labels and Assigned / Not assigned wording.
  await page.evaluate(() => GSISV1.clearProtectedState());
  await page.reload();
  await page.waitForFunction(() => !!current && !!v());
  const reviewCheck = await page.evaluate(async () => {
    const doc = v();
    if (!doc.classes?.length) {
      doc.classes = [{ ref: "cls-review-1", level: "1", name: "Graciousness", shortName: "Gc" }];
    }
    if (!doc.teachers?.length) {
      doc.teachers = [{ id: "staff-review-1", name: "Tan <Escaped> Teacher", active: true }];
    }
    const cls = doc.classes[0];
    const teacher = doc.teachers[0];
    const target = classKey(cls);
    const originalName = teacher.name;
    teacher.name = "Tan <Escaped> Teacher";
    queueCell({
      operation: "addTeacher",
      target,
      targetRef: cls.ref,
      subject: "EL",
      level: cls.level,
      teacher: teacher.id,
      expected: false,
    });
    await resolveQueue();
    const headings = [...document.querySelectorAll("dialog[open] [data-review-content] section h3")].map(
      (n) => n.textContent,
    );
    const pres = [...document.querySelectorAll("dialog[open] [data-review-content] section pre")].map(
      (n) => n.textContent,
    );
    const hasRawTag = document.querySelector("dialog[open] [data-review-content] escaped") !== null;
    document.querySelector("dialog[open]")?.close();
    discardDrafts();
    teacher.name = originalName;
    return { headings, pres, hasRawTag, teacherId: teacher.id, target };
  });
  assert.equal(reviewCheck.hasRawTag, false, "display text must be escaped, never parsed as HTML");
  assert(
    reviewCheck.headings.some(
      (h) => h.includes("Assign Tan <Escaped> Teacher to ") && h.includes("· EL"),
    ),
    "Review heading shows readable teacher/class/subject label: " + JSON.stringify(reviewCheck.headings),
  );
  assert(
    reviewCheck.headings.every((h) => !h.includes(reviewCheck.teacherId)),
    "Review heading does not expose opaque staffId",
  );
  assert(
    reviewCheck.pres.some(
      (p) => p.includes("Saved: Not assigned") && p.includes("Draft: Assigned"),
    ),
    "Review pre shows Assigned/Not assigned wording: " + JSON.stringify(reviewCheck.pres),
  );
  console.log(
    "PASS #245/#247 readable assignment-review labels show teacher/class/subject and Assigned/Not assigned with escaped text.",
  );

  // #245 Regression Handoff Scenario 1: Unrelated retained old pending operation + fresh Deploy edits
  // encountering a pre-dispatch refusal keeps all new edits editable, clears queueFlight, creates no
  // phantom pending entry, and sends zero /lease or /change requests.
  await page.evaluate(async () => {
    const doc = v();
    if (!doc.classes?.length) {
      doc.classes = [{ ref: "cls-review-1", level: "1", name: "Graciousness", shortName: "Gc" }];
    }
    if (!doc.teachers?.length) {
      doc.teachers = [{ id: "staff-review-1", name: "Tan Teacher", active: true }];
    }
    const cls = doc.classes[0];
    const teacher = doc.teachers[0];
    const target = classKey(cls);
    queueCell({
      operation: "addTeacher",
      target,
      targetRef: cls.ref,
      subject: "EL",
      level: cls.level,
      teacher: teacher.id,
      expected: false,
    });
  });
  const requestsBeforeUnsent = requests.length;
  const unsentState = await page.evaluate(async () => {
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("Synthetic quota full", "QuotaExceededError");
    };
    try {
      await pumpQueue();
    } finally {
      Storage.prototype.setItem = origSetItem;
    }
    return {
      flight: queueFlight,
      queuedCount: queuedEdits().length,
      pendingDeploy: GSISV1.pending().filter((e) => e.service === "deploy" && !e.terminal).length,
    };
  });
  assert.equal(unsentState.flight, null, "definitely-unsent refusal must not lock queueFlight");
  assert.equal(unsentState.queuedCount, 1, "new draft edits remain editable in cellQueue");
  assert.equal(unsentState.pendingDeploy, 0, "no phantom pending deploy operation created");
  assert.equal(
    requests.length,
    requestsBeforeUnsent,
    "pre-dispatch refusal sends zero /lease or /change requests",
  );
  await page.evaluate(() => discardDrafts());
  console.log(
    "PASS #245 Scenario 1: pre-dispatch refusal keeps fresh Deploy edits editable with zero phantom operations or network writes.",
  );

  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await suite.close();
}
