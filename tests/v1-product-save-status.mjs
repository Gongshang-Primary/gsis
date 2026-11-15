import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { JSDOM, VirtualConsole } from "jsdom";
import { chromium } from "playwright";
import { digest } from "../v1/runtime/store.mjs";
import { productSuite, origin } from "./v1-product/suite.mjs";

// Full client and shell, never a replacement status implementation. Synthetic
// transport cases are followed by one actual local owner/Chromium integration.
const started = performance.now();
const [client, shell] = await Promise.all(
  ["client.js", "module-shell.js"].map((name) =>
    readFile(new URL("../v1/web/shared/" + name, import.meta.url), "utf8"),
  ),
);
const identity = {
  schoolId: "synthetic-school",
  user: {
    accountId: "synthetic-manager",
    email: "manager@example.invalid",
    staffId: "synthetic-staff",
  },
  capabilities: ["admin"],
  csrfToken: "synthetic-csrf",
  expiresAt: 9999999999999,
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
let passed = 0;
async function test(name, run) {
  await run();
  passed++;
  console.log("PASS " + name);
}
async function harness(module, transport) {
  let session = structuredClone(identity);
  const dom = new JSDOM(
      '<meta name="gsis-module" content="' + module + '"><div id="data"></div>',
      {
        url: "https://school.test/" + module + "/",
        runScripts: "outside-only",
        pretendToBeVisual: true,
        virtualConsole: new VirtualConsole(),
      },
    ),
    w = dom.window;
  Object.assign(w, {
    Response,
    Request,
    Headers,
    structuredClone,
    TextEncoder,
    TextDecoder,
    fetch: async (input, init = {}) => {
      const path = new URL(input.url || input, "https://school.test").pathname;
      if (path === "/api/core/session")
        return session
          ? json({ ok: true, data: session })
          : json(
              {
                ok: false,
                error: {
                  code: "SESSION_REQUIRED",
                  message: "Synthetic expired read",
                },
              },
              401,
            );
      return transport(path, init, session);
    },
  });
  Object.defineProperty(w.crypto, "subtle", { value: webcrypto.subtle });
  w.eval(client);
  w.eval(shell);
  const api = w.GSISV1;
  await api.getSession();
  return {
    w,
    api,
    close: () => w.close(),
    setSession: async (next) => {
      session = structuredClone(next);
      return api.getSession(true);
    },
    snapshot: () => ({
      pending: api
        .pending()
        .map(({ operationId, path }) => ({ operationId, path })),
      banner: w.document.querySelector('.gsis-suitebar [role="status"]')
        .textContent,
      ...(api.saveStatus ? { status: api.saveStatus() } : {}),
    }),
  };
}
function gridBody(operationId) {
  return {
    operationId,
    changes: [
      {
        id: "synthetic-staff",
        field: "Mobile No",
        expected: "",
        value: "81234567",
      },
    ],
    additions: [],
  };
}
async function gridReceipt(body, session, state = "committed") {
  return {
    operationId: body.operationId,
    state,
    digest: await digest({
      schoolId: session.schoolId,
      actorId: session.user.accountId,
      action: "contacts.manage",
      intent: { changes: body.changes, additions: body.additions || [] },
    }),
    result: { state: "applied" },
  };
}
await test("verified original receipt removes pending and clears its own unknown-save banner", async () => {
  let reply = false;
  const wires = [];
  const h = await harness("contacts", async (path, init, session) => {
    assert.equal(path, "/api/contacts/save-data");
    wires.push(init.body);
    if (!reply) throw new TypeError("Synthetic response lost");
    return json({
      ok: true,
      data: await gridReceipt(JSON.parse(init.body), session),
    });
  });
  try {
    const body = gridBody("single-original"),
      send = () =>
        h.api.request("contacts", "/save-data", { method: "POST", body });
    await assert.rejects(send(), /response lost/);
    assert.equal(h.snapshot().pending.length, 1);
    assert.match(h.snapshot().banner, /outcome unknown/i);
    reply = true;
    const result = await send();
    assert.equal(result.state, "committed");
    assert.equal(wires[0], wires[1]);
    assert.equal(h.snapshot().pending.length, 0);
    assert.doesNotMatch(h.snapshot().banner, /outcome unknown/i);
  } finally {
    h.close();
  }
});
function assertStatus(h, count, { banner = count > 0 } = {}) {
  const current = h.snapshot();
  assert.deepEqual(Object.keys(current.status).sort(), [
    "contextEpoch",
    "uncertainCount",
  ]);
  assert.equal(current.status.uncertainCount, count);
  assert.ok(
    Number.isSafeInteger(current.status.contextEpoch) &&
      current.status.contextEpoch >= 0,
  );
  assert.equal(/outcome unknown/i.test(current.banner), banner, current.banner);
  return current;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const lost = () => {
  throw new TypeError("Synthetic response lost");
};
await test("two unknown originals, unrelated successes and invalid receipts preserve exact pending evidence", async () => {
  let handler = lost;
  const h = await harness("contacts", (...args) => handler(...args));
  const notifications = [];
  h.w.addEventListener("gsis:save-status", (e) => notifications.push(e.detail));
  try {
    const a = gridBody("first-unknown"),
      b = gridBody("second-unknown");
    const send = (body) =>
      h.api.request("contacts", "/save-data", { method: "POST", body });
    await assert.rejects(send(a), /response lost/);
    await assert.rejects(send(b), /response lost/);
    assertStatus(h, 2);
    handler = async (_path, init, session) =>
      json({
        ok: true,
        data: await gridReceipt(JSON.parse(init.body), session),
      });
    await send(gridBody("unrelated-confirmed"));
    assertStatus(h, 2);
    handler = async () => json({ ok: true, data: { rows: [] } });
    await h.api.request("contacts", "/staff");
    assertStatus(h, 2);
    const receipt = await gridReceipt(a, identity);
    for (const wrong of [
      { ...receipt, operationId: "different-original" },
      { ...receipt, digest: "0".repeat(64) },
      { ...receipt, digest: "bad" },
      { saved: true },
      { state: "pending", operationId: a.operationId },
      { ...receipt, schoolId: "another-school" },
      { ...receipt, actorId: "another-actor" },
    ]) {
      handler = async () => json({ ok: true, data: wrong });
      await send(a);
      assertStatus(h, 2);
    }
    handler = async () => json({ ok: true, data: receipt });
    await h.api.request("roster", "/receipt?operationId=" + a.operationId);
    assertStatus(h, 2);
    await send(a);
    assert.equal(assertStatus(h, 1).pending[0].operationId, b.operationId);
    handler = async () =>
      json({
        ok: true,
        data: await gridReceipt(b, identity, "terminal-not-committed"),
      });
    const terminal = await send(b);
    assert.equal(terminal.state, "terminal-not-committed");
    assert.equal(terminal.saved, undefined);
    assertStatus(h, 0);
    assert.ok(notifications.length > 0);
    assert.ok(
      notifications.every((detail) => detail == null),
      "Status signals expose no operation or private request fields",
    );
  } finally {
    h.close();
  }
});
await test("in-flight and unsent preparation entries are not transport uncertainty", async () => {
  const entered = deferred(),
    held = deferred();
  let handler = lost;
  const h = await harness("lord", (...args) => handler(...args));
  try {
    const unknown = gridBody("real-unknown");
    await assert.rejects(
      h.api.request("contacts", "/save-data", {
        method: "POST",
        body: unknown,
      }),
      /response lost/,
    );
    handler = async (_path, init, session) => {
      if (JSON.parse(init.body).operationId === "in-flight") {
        entered.resolve();
        return held.promise;
      }
      return json({
        ok: true,
        data: await gridReceipt(JSON.parse(init.body), session),
      });
    };
    const pending = h.api.request("contacts", "/save-data", {
      method: "POST",
      body: gridBody("in-flight"),
    });
    await entered.promise;
    assertStatus(h, 1);
    await h.api.request("contacts", "/save-data", {
      method: "POST",
      body: unknown,
    });
    assertStatus(h, 0);
    assert.equal(
      h.snapshot().pending.length,
      1,
      "Known in-flight slot is not itself unknown",
    );
    held.resolve(
      json({
        ok: true,
        data: await gridReceipt(gridBody("in-flight"), identity),
      }),
    );
    await pending;
    handler = lost;
    await assert.rejects(
      h.api.request("contacts", "/save-data", {
        method: "POST",
        body: unknown,
      }),
      /response lost/,
    );
    // Invalid booking preparation fails before transport. Its fresh slot cleanup
    // must not erase a separate unknown Contacts operation.
    await assert.rejects(
      h.api.request("lord", "/bookings", {
        method: "POST",
        body: {
          operationId: "invalid-unsent",
          bookingGroup: { invalid: true },
        },
      }),
    );
    assertStatus(h, 1);
  } finally {
    h.close();
  }
});
await test("direct owner compatibility acknowledgments settle only their original lost replies", async () => {
  const pubId =
    "pub-" +
    (await digest({ school: identity.schoolId, operationId: "publish" })).slice(
      0,
      24,
    );
  const versionId =
    "version-" +
    (await digest({ school: identity.schoolId, operationId: "create" })).slice(
      0,
      24,
    );
  const archiveKey =
    identity.schoolId + "/calendar/archive/" + "a".repeat(64) + ".json";
  const pdfBase64 = Buffer.from("%PDF-1.4\nSynthetic local fixture").toString(
    "base64",
  );
  const pdfDigest = await digest(pdfBase64);
  const cases = [
    [
      "deploy",
      "/lease",
      { operationId: "lease", versionId: "v1", scope: "meta" },
      {
        fence: 2,
        token: 2,
        until: 9999999999999,
        scope: "meta",
        key: "meta",
        revision: 1,
      },
    ],
    [
      "deploy",
      "/versions/create",
      { operationId: "create", name: "Synthetic" },
      { saved: true, revision: 0, versionId, requestId: "create" },
    ],
    [
      "deploy",
      "/imports/apply",
      {
        operationId: "import",
        versionId: "v1",
        revision: 2,
        scope: "meta",
        leaseFence: 2,
        previewId: "synthetic-preview",
        digest: "a".repeat(64),
      },
      { saved: true, versionId: "v1", requestId: "import", changedRows: 1 },
    ],
    [
      "deploy",
      "/publish",
      {
        operationId: "publish",
        versionId: "v1",
        revision: 2,
        expectedPointerSequence: 3,
        leaseFence: 2,
      },
      {
        saved: true,
        state: "committed",
        versionId: "v1",
        requestId: "publish",
        publicationId: pubId,
        sequence: 4,
        workingRevision: 2,
        contactsSync: { status: "pending", publicationCommit: pubId },
      },
    ],
    [
      "deploy",
      "/change",
      {
        operationId: "requeue",
        operation: "retryContactsSync",
        versionId: "v1",
        publicationCommit: pubId,
        leaseFence: 2,
      },
      {
        saved: true,
        versionId: "v1",
        publicationId: pubId,
        contactsSync: { status: "pending", publicationCommit: pubId },
      },
    ],
    [
      "calendar",
      "/action",
      {
        operationId: "calendar-import",
        action: "tableImportApply",
        payload: {
          operationId: "calendar-import",
          workbook: { kind: "tags", sourceRevision: "a".repeat(64) },
          expiresAt: 9999999999999,
          previewToken: "synthetic-preview-proof",
        },
      },
      {
        saved: true,
        kind: "tags",
        sourceRevision: "a".repeat(64),
        changedRecords: 2,
      },
    ],
    [
      "calendar",
      "/action",
      {
        operationId: "calendar-archive",
        action: "archiveYearsCommit",
        payload: {
          operationId: "calendar-archive",
          selections: [{ year: 2025, status: "RELEASED" }],
          previewDigest: "a".repeat(64),
          confirm: true,
        },
      },
      {
        state: "committed",
        archived: true,
        historyRetained: true,
        driveExport: "queued",
        fileName: "Synthetic.json",
        artifactKey: archiveKey,
        downloadUrl:
          "/api/calendar/archive-download?key=" +
          encodeURIComponent(archiveKey),
        counts: { years: 1, events: 2, Events: 2 },
      },
    ],
    [
      "calendar",
      "/action",
      {
        operationId: "calendar-pdf",
        action: "savePdf",
        payload: {
          operationId: "calendar-pdf",
          base64: pdfBase64,
          name: "Synthetic.pdf",
        },
      },
      {
        saved: true,
        digest: pdfDigest,
        key: identity.schoolId + "/calendar/pdf/" + pdfDigest + ".pdf",
      },
    ],
  ];
  for (const [domain, path, body, receipt] of cases) {
    let reply = false;
    const wires = [];
    const h = await harness(domain, async (_path, init) => {
      wires.push(init.body);
      if (!reply) return lost();
      return json({ ok: true, data: receipt });
    });
    try {
      const send = () => h.api.request(domain, path, { method: "POST", body });
      await assert.rejects(send(), /response lost/);
      assertStatus(h, 1);
      reply = true;
      const result = await send();
      assert.equal(wires[0], wires[1]);
      assertStatus(h, 0);
      assert.equal(h.snapshot().pending.length, 0, domain + path);
      if (result.contactsSync)
        assert.equal(result.contactsSync.status, "pending");
      if (result.driveExport) assert.equal(result.driveExport, "queued");
    } finally {
      h.close();
    }
  }
});
await test("account, school, preview and logout changes fence late failures and terminal responses", async () => {
  for (const change of ["account", "school", "preview", "logout"])
    for (const late of ["failure", "terminal"]) {
      const entered = deferred(),
        held = deferred();
      let calls = 0;
      const h = await harness("contacts", async (path) => {
        if (path === "/api/core/logout")
          return json({ ok: true, data: { signedOut: true } });
        if (calls++ === 0) {
          entered.resolve();
          return held.promise;
        }
        return lost();
      });
      try {
        const body = gridBody("reused-operation"),
          send = () =>
            h.api.request("contacts", "/save-data", { method: "POST", body });
        const original = send().then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
        await entered.promise;
        const next = structuredClone(identity);
        if (change === "account")
          next.user = {
            ...next.user,
            accountId: "other-account",
            email: "other@example.invalid",
          };
        if (change === "school") next.schoolId = "other-school";
        if (change === "preview") {
          next.impersonating = true;
          next.previewAccountId = "preview-account";
        }
        if (change === "logout") await h.api.logout();
        await h.setSession(next);
        assertStatus(h, 0);
        // Preview is deliberately read-only; do not manufacture a preview write.
        if (change !== "preview") {
          await assert.rejects(send(), /response lost/);
          assertStatus(h, 1);
        }
        if (late === "failure")
          held.reject(new TypeError("Late old transport failure"));
        else
          held.resolve(
            json({ ok: true, data: await gridReceipt(body, identity) }),
          );
        await original;
        assertStatus(h, change === "preview" ? 0 : 1);
        h.w.dispatchEvent(
          new h.w.CustomEvent("gsis:uncertain", {
            detail: {
              operationId: body.operationId,
              schoolId: identity.schoolId,
            },
          }),
        );
        h.w.dispatchEvent(new h.w.CustomEvent("gsis:save-status"));
        assertStatus(h, change === "preview" ? 0 : 1);
        await h.api.clearProtectedState();
        assertStatus(h, 0);
        h.w.dispatchEvent(new h.w.CustomEvent("gsis:uncertain"));
        assertStatus(h, 0);
      } finally {
        h.close();
      }
    }
});
await test("denial and failed sign-out statuses are not erased by save-status rendering", async () => {
  let handler = lost;
  const h = await harness("contacts", (...args) => handler(...args));
  try {
    const body = gridBody("preserve-status"),
      send = () =>
        h.api.request("contacts", "/save-data", { method: "POST", body });
    await assert.rejects(send(), /response lost/);
    handler = async (path, init, session) =>
      path === "/api/core/logout"
        ? json({ ok: true, data: { state: "pending" } })
        : json({
            ok: true,
            data: await gridReceipt(JSON.parse(init.body), session),
          });
    await h.w.document.querySelector(".gsis-suitebar button").onclick();
    assert.match(h.snapshot().banner, /Sign-out could not be confirmed/);
    await send();
    assertStatus(h, 0, { banner: false });
    assert.match(h.snapshot().banner, /Sign-out could not be confirmed/);
    handler = async () =>
      json(
        {
          ok: false,
          error: { code: "CAPABILITY_DENIED", message: "Synthetic denial" },
        },
        403,
      );
    await assert.rejects(h.api.request("contacts", "/staff"));
    assert.match(h.snapshot().banner, /Permission could not be confirmed/);
    h.w.dispatchEvent(new h.w.CustomEvent("gsis:save-status"));
    h.w.dispatchEvent(new h.w.CustomEvent("gsis:uncertain"));
    assert.match(h.snapshot().banner, /Permission could not be confirmed/);
  } finally {
    h.close();
  }
});
await test("session 401 hides old uncertainty and same-account restoration re-renders retained evidence", async () => {
  const h = await harness("contacts", lost);
  try {
    await assert.rejects(
      h.api.request("contacts", "/save-data", {
        method: "POST",
        body: gridBody("session-read-unknown"),
      }),
      /response lost/,
    );
    assertStatus(h, 1);
    assert.equal(await h.setSession(null), null);
    assertStatus(h, 0);
    assert.equal(
      h.snapshot().pending.length,
      1,
      "Existing session-read semantics retain the original pending evidence",
    );
    await h.setSession(identity);
    assertStatus(h, 1);
  } finally {
    h.close();
  }
});
await test("Deploy verified recovery clears uncertainty while retaining terminal history", async () => {
  for (const state of ["committed", "aborted"]) {
    let wire,
      recovery,
      mode = "wrong",
      writes = 0,
      reads = 0;
    const body = {
      operationId: "deploy-original-" + state,
      operation: "saveDraft",
      versionId: "version-status",
      revision: 3,
      scope: "meta",
      clientId: "status-client",
      leaseFence: 2,
      edits: [
        {
          operation: "setTeacherNote",
          teacher: "synthetic-staff",
          expected: "",
          value: "Synthetic note",
        },
      ],
    };
    const h = await harness("deploy", async (path, init) => {
      if (path === "/api/deploy/change") {
        writes++;
        wire = JSON.parse(init.body);
        return lost();
      }
      assert.equal(path, "/api/deploy/receipt");
      reads++;
      assert.deepEqual(JSON.parse(init.body), {
        operationId: body.operationId,
        versionId: body.versionId,
        recovery: true,
      });
      return json({
        ok: true,
        data:
          mode === "wrong"
            ? { ...recovery, requestDigest: "0".repeat(64) }
            : recovery,
      });
    });
    try {
      await assert.rejects(
        h.api.request("deploy", "/change", { method: "POST", body }),
        /response lost/,
      );
      const requestIntent = structuredClone(wire);
      delete requestIntent.requestId;
      const intent = structuredClone(wire);
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
      const ownerDigest = await digest({
        schoolId: identity.schoolId,
        actorId: identity.user.accountId,
        action: "deploy.edit",
        intent,
      });
      recovery = {
        state,
        bindingVerified: true,
        service: "deploy",
        schoolId: identity.schoolId,
        actorId: identity.user.accountId,
        operationId: wire.operationId,
        versionId: wire.versionId,
        action: "deploy.edit",
        digest: ownerDigest,
        requestDigest: await digest(requestIntent),
        originalFence: 1,
        currentFence: state === "committed" ? 1 : 2,
        receipt: {
          state: state === "committed" ? "committed" : "terminal-not-committed",
          operationId: wire.operationId,
          digest: ownerDigest,
          ...(state === "committed"
            ? { fence: 1, result: { saved: true } }
            : { reason: "SYNTHETIC_ABORT" }),
        },
      };
      assertStatus(h, 1);
      const reference = h.api.operationState("deploy", body.operationId);
      await assert.rejects(
        h.api.recoverOperation(reference, "check"),
        (error) => error.code === "RECEIPT_MISMATCH",
      );
      assertStatus(h, 1);
      mode = "correct";
      const result = await h.api.recoverOperation(reference, "check");
      assert.equal(result.verified, true);
      assert.equal(result.state, state);
      assertStatus(h, 0);
      assert.equal(h.api.pending().length, 0);
      assert.equal(h.api.operationStates("deploy").length, 0);
      const retained = h.api.operationState("deploy", body.operationId);
      assert.equal(retained.state, state);
      assert.equal(retained.verified, true);
      assert.equal(retained.canRetry, false);
      assert.equal(writes, 1);
      assert.equal(reads, 2);
    } finally {
      h.close();
    }
  }
});
await test("LORD read-only exact receipt cleanup updates status without replaying its booking", async () => {
  let wire,
    operation,
    correct = false,
    writes = 0,
    reads = 0;
  const body = {
    operationId: "lord-original",
    date: "2026-11-20",
    startPeriod: "1",
    endPeriod: "2",
    classOrActivity: "Synthetic class",
    subject: "Science",
    resource: "SYNTHETIC-CART",
    requestedQuantity: 1,
    bookingGroup: {
      cart: "SYNTHETIC-CART",
      revision: "a".repeat(64),
      members: [{ resourceId: "synthetic-device", revision: 1, capacity: 2 }],
    },
  };
  const h = await harness("lord", async (path, init) => {
    if (path === "/api/lord/bookings") {
      writes++;
      wire = JSON.parse(init.body);
      return lost();
    }
    assert.equal(path, "/api/lord/receipt");
    assert.equal((init.method || "GET").toUpperCase(), "GET");
    reads++;
    return json({
      ok: true,
      data: correct
        ? operation
        : {
            ...operation,
            receipt: { ...operation.receipt, digest: "0".repeat(64) },
          },
    });
  });
  try {
    await assert.rejects(
      h.api.request("lord", "/bookings", { method: "POST", body }),
      /response lost/,
    );
    const intent = structuredClone(wire);
    delete intent.requestId;
    const ownerDigest = await digest({
      schoolId: identity.schoolId,
      actorId: identity.user.accountId,
      action: "lord.bookingcreate",
      intent,
    });
    operation = {
      schoolId: identity.schoolId,
      operationId: wire.operationId,
      actorId: identity.user.accountId,
      action: "lord.bookingcreate",
      digest: ownerDigest,
      fence: 1,
      state: "committed",
      validUntil: 9999999999999,
      requestDigest: await digest(intent),
      receipt: {
        state: "committed",
        operationId: wire.operationId,
        digest: ownerDigest,
        fence: 1,
        result: {
          bookingId: "synthetic-booking",
          status: "BOOKED",
          revision: 1,
        },
      },
    };
    const bindings = () =>
      Object.fromEntries(
        Object.keys(h.w.sessionStorage)
          .filter((key) => key.startsWith("gsis-lord-group-bindings:v1:"))
          .map((key) => [key, h.w.sessionStorage.getItem(key)]),
      );
    const before = bindings();
    assert.equal(Object.keys(before).length, 1);
    assertStatus(h, 1);
    const wrong = await h.api.checkLordBookingReceipt(wire, {
      path: "/api/lord/bookings",
    });
    assert.equal(wrong.verified, false);
    assertStatus(h, 1);
    correct = true;
    const result = await h.api.checkLordBookingReceipt(wire, {
      path: "/api/lord/bookings",
    });
    assert.equal(result.verified, true);
    assert.equal(result.state, "committed");
    assertStatus(h, 0);
    assert.equal(h.api.pending().length, 0);
    assert.deepEqual(bindings(), before);
    assert.equal(writes, 1);
    assert.equal(reads, 2);
  } finally {
    h.close();
  }
});
await test("old shell errors are fenced immediately while protected storage clearing is blocked", async () => {
  const logout = deferred(),
    entered = deferred(),
    storage = deferred();
  const h = await harness("contacts", async (path) => {
    if (path === "/api/core/logout") {
      entered.resolve();
      return logout.promise;
    }
    return lost();
  });
  try {
    Object.defineProperty(h.w, "indexedDB", {
      value: { databases: () => storage.promise, deleteDatabase() {} },
    });
    const click = h.w.document.querySelector(".gsis-suitebar button").onclick();
    await entered.promise;
    const oldEpoch = h.api.saveStatus().contextEpoch;
    let cleared = false;
    h.w.addEventListener("gsis:clear-protected-state", () => {
      cleared = true;
    });
    const clear = h.api.clearProtectedState();
    assert.equal(cleared, false);
    assert.ok(h.api.saveStatus().contextEpoch > oldEpoch);
    logout.reject(Error("Synthetic old-context sign-out error"));
    await click;
    assert.equal(h.snapshot().banner, "");
    await assert.rejects(
      h.api.request("contacts", "/save-data", {
        method: "POST",
        body: gridBody("new-context-unknown"),
      }),
      /response lost/,
    );
    assertStatus(h, 1);
    storage.resolve([]);
    await clear;
    assert.equal(cleared, true);
    assertStatus(h, 1);
  } finally {
    storage.resolve([]);
    h.close();
  }
});
await test("actual nine-Worker owner receipts settle two lost browser replies exactly once", async () => {
  const suite = await productSuite({
    bindings: {
      GOOGLE_CLIENT_ID: "synthetic-save-status.apps.googleusercontent.com",
      HOSTED_DOMAIN: "example.invalid",
    },
  });
  let browser;
  const egress = [],
    errors = [],
    wires = [],
    lostReplies = new Map(),
    drop = new Set(["real-status-commit", "real-status-abort"]);
  try {
    const admin = await suite.seedAccount("status-admin"),
      staffId = "status-synthetic-staff";
    await suite.call(admin, "contacts", "/staff/create", {
      operationId: "status-create",
      staffId,
      basicName: "Synthetic Status",
    });
    const initial = (
      await suite.request(admin, "contacts", "/staff/" + staffId)
    ).body.data;
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      executablePath:
        process.env.GSIS_BROWSER_EXECUTABLE ||
        process.env.ROSTER_TEST_CHROMIUM ||
        undefined,
    });
    const context = await browser.newContext({
      viewport: { width: 1200, height: 900 },
    });
    await context.addCookies([
      {
        name: "__Host-gsis_session",
        value: admin.token,
        domain: "gsis.example.invalid",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await context.route("**/*", async (route) => {
      const input = route.request();
      if (!input.url().startsWith(origin + "/")) {
        egress.push(input.url());
        return route.abort();
      }
      const path = new URL(input.url()).pathname,
        body = input.postDataJSON();
      if (path === "/api/contacts/staff/" + staffId + "/update")
        wires.push(input.postData());
      const response = await suite.mf.dispatchFetch(input.url(), {
        method: input.method(),
        headers: await input.allHeaders(),
        body: ["GET", "HEAD"].includes(input.method())
          ? undefined
          : input.postDataBuffer(),
      });
      const bytes = Buffer.from(await response.arrayBuffer()),
        headers = Object.fromEntries(response.headers);
      delete headers["transfer-encoding"];
      if (drop.delete(body?.operationId)) {
        lostReplies.set(body.operationId, {
          status: response.status,
          body: JSON.parse(bytes.toString()),
        });
        return route.abort("failed");
      }
      await route.fulfill({ status: response.status, headers, body: bytes });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin + "/contacts/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () =>
        window.GSISV1?.saveStatus &&
        document.querySelector(".gsis-suitebar [role=status]"),
    );
    await page.evaluate(() => GSISV1.getSession());
    const a = {
        operationId: "real-status-commit",
        revision: initial.revision,
        changes: { employmentActive: true },
      },
      b = {
        operationId: "real-status-abort",
        revision: initial.revision,
        changes: { employmentActive: false },
      };
    const send = (body) =>
      page.evaluate(
        async ({ staffId, body }) => {
          try {
            return {
              value: await GSISV1.request(
                "contacts",
                "/staff/" + staffId + "/update",
                { method: "POST", body },
              ),
            };
          } catch (error) {
            return { error: { message: error.message, code: error.code } };
          }
        },
        { staffId, body },
      );
    const snapshot = () =>
      page.evaluate(() => ({
        pending: GSISV1.pending().map((x) => x.operationId),
        status: GSISV1.saveStatus(),
        banner: document.querySelector(".gsis-suitebar [role=status]")
          .textContent,
      }));
    assert.ok((await send(a)).error);
    assert.ok((await send(b)).error);
    const unresolved = await snapshot();
    assert.equal(unresolved.status.uncertainCount, 2);
    assert.equal(unresolved.pending.length, 2);
    assert.match(unresolved.banner, /outcome unknown/i);
    const evidence = new URL(
      "../deliverables/v1/evidence/save-status/",
      import.meta.url,
    );
    await mkdir(evidence, { recursive: true });
    await page.screenshot({
      path: new URL("two-unknown.png", evidence).pathname,
    });
    assert.equal(lostReplies.get(a.operationId).body.data.state, "committed");
    assert.equal(lostReplies.get(b.operationId).status, 409);
    const committed = await send(a);
    assert.equal(committed.value.state, "committed");
    assert.deepEqual(committed.value, lostReplies.get(a.operationId).body.data);
    const one = await snapshot();
    assert.equal(one.status.uncertainCount, 1);
    assert.deepEqual(one.pending, [b.operationId]);
    assert.match(one.banner, /outcome unknown/i);
    const aborted = await send(b);
    assert.equal(aborted.value.state, "terminal-not-committed");
    assert.equal(aborted.value.saved, undefined);
    const settled = await snapshot();
    assert.equal(settled.status.uncertainCount, 0);
    assert.ok(Number.isSafeInteger(settled.status.contextEpoch));
    assert.deepEqual(settled.pending, []);
    assert.doesNotMatch(settled.banner, /outcome unknown/i);
    await page.screenshot({
      path: new URL("originals-settled.png", evidence).pathname,
    });
    assert.equal(wires[0], wires[2]);
    assert.equal(wires[1], wires[3]);
    const db = await suite.db("contacts");
    const rows = (
      await db
        .prepare(
          "SELECT operation_id,state,receipt_json,(SELECT COUNT(*) FROM product_audit a WHERE a.school_id=o.school_id AND a.operation_id=o.operation_id) AS audits FROM product_operations o WHERE school_id=? AND operation_id IN (?,?) ORDER BY operation_id",
        )
        .bind(identity.schoolId, a.operationId, b.operationId)
        .all()
    ).results;
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(
        row.state,
        row.operation_id === a.operationId ? "committed" : "aborted",
      );
      assert.equal(row.audits, row.operation_id === a.operationId ? 1 : 0);
      assert.equal(JSON.parse(row.receipt_json).operationId, row.operation_id);
    }
    const field = await db
      .prepare(
        "SELECT value_json,revision FROM contacts_fields WHERE school_id=? AND staff_id=? AND field='employmentActive'",
      )
      .bind(identity.schoolId, staffId)
      .first();
    assert.equal(JSON.parse(field.value_json), true);
    assert.equal(field.revision, 1);
    const final = (await suite.request(admin, "contacts", "/staff/" + staffId))
      .body.data;
    assert.equal(final.revision, initial.revision + 1);
    assert.deepEqual(egress, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await suite.close();
  }
});
console.log(
  `${passed} save-status groups passed; synthetic transport except the identified owner/Chromium integration. Runtime UAT not performed.`,
);
console.log(
  `Elapsed ${((performance.now() - started) / 1000).toFixed(3)} seconds`,
);
