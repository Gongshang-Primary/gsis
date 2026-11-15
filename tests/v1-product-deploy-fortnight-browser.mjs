/** Actual built Fortnight editor and native queue, with synthetic transport.
 * This checks browser input/queue behaviour, not Worker durability or runtime UAT.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { buildWeb } from "../scripts/v1/build-web.mjs";
import { defaults } from "../v1/services/deploy/model.mjs";

const output = await mkdtemp(join(tmpdir(), "gsis-fortnight-browser-"));
const origin = "https://fortnight.example.invalid";
let browser;
try {
  await buildWeb(join(output, "web"));
  const html = (
    await readFile(join(output, "web/deploy/index.html"), "utf8")
  ).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const built = await readFile(join(output, "web/deploy/app.js"), "utf8");
  assert.equal(
    built.split("controls();startSignIn();").length,
    2,
    "isolate sign-in startup only; exercise the actual built editor",
  );
  const app = built.replace("controls();startSignIn();", "");
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.GSIS_BROWSER_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({
    viewport: { width: 1180, height: 800 },
  });
  page.setDefaultTimeout(4000);
  const errors = [],
    external = [],
    dialogs = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      external.push(url.origin);
      return route.abort();
    }
    if (url.pathname === "/deploy/")
      return route.fulfill({ contentType: "text/html", body: html });
    try {
      return route.fulfill({
        contentType: url.pathname.endsWith(".css")
          ? "text/css"
          : url.pathname.endsWith(".svg")
            ? "image/svg+xml"
            : "application/octet-stream",
        body: await readFile(join(output, "web", url.pathname)),
      });
    } catch {
      return route.fulfill({ status: 404, body: "" });
    }
  });
  await page.goto(origin + "/deploy/");
  await page.evaluate(() => {
    window.__requests = [];
    window.__canEdit = true;
    window.__mode = "success";
    window.__attemptBodies = new Map();
    window.__receipts = new Map();
    window.__verified = new Set();
    const reference = (id) =>
      window.__attemptBodies.has(id)
        ? {
            service: "deploy",
            operationId: id,
            versionId: window.__saved.id,
            canRetry: !window.__verified.has(id),
            canWithdraw: false,
          }
        : null;
    window.GSISV1 = {
      capable: () => window.__canEdit,
      isUnsentOperation: () => false,
      operationState: (_service, id) => reference(id),
      operationStates: () =>
        [...window.__attemptBodies.keys()]
          .filter((id) => !window.__verified.has(id))
          .map(reference),
      recoverOperation: async (ref, mode) => {
        if (mode === "retry")
          await window.GSISV1.fetch("/api/change", {
            method: "POST",
            body: JSON.stringify(window.__attemptBodies.get(ref.operationId)),
          });
        const response = await window.GSISV1.fetch("/api/receipt", {
          method: "POST",
          body: JSON.stringify({ requestId: ref.operationId }),
        });
        const outcome = (await response.json()).data;
        if (["committed", "aborted"].includes(outcome.state))
          window.__verified.add(ref.operationId);
        return { ...outcome, reference: reference(ref.operationId) };
      },
      fetch: async (url, options) => {
        const action = String(url).split("/").at(-1),
          body = JSON.parse(options?.body || "{}");
        window.__requests.push({ action, body });
        const reply = (data, status = 200) =>
          new Response(
            JSON.stringify(
              status === 200
                ? { ok: true, data }
                : { ok: false, error: "Synthetic permission denial", status },
            ),
            { status, headers: { "content-type": "application/json" } },
          );
        if (action === "sync" || action === "bootstrap")
          return reply({
            user: { roles: ["Admin"], email: "synthetic@example.invalid" },
            versions: [structuredClone(window.__saved)],
            current: structuredClone(window.__saved),
            currentId: window.__saved.id,
            cacheKey: "synthetic-" + window.__saved.revision,
            revision: window.__saved.revision,
          });
        if (action === "receipt")
          return reply(
            window.__receipts.get(body.requestId) || {
              state: "unknown",
              verified: false,
              result: { saved: false },
            },
          );
        if (action !== "change")
          throw Error("Unexpected synthetic transport action " + action);
        window.__attemptBodies.set(body.requestId, structuredClone(body));
        window.__pending = structuredClone(body);
        if (window.__mode === "denied") {
          // Explicit synthetic durable abort; HTTP403 alone is not terminal proof.
          window.__receipts.set(body.requestId, {
            state: "aborted",
            verified: true,
            result: { saved: false },
          });
          return reply({}, 403);
        }
        if (window.__mode === "unknown")
          return reply({ saved: false, state: "unknown" });
        const before = structuredClone(window.__saved);
        for (const edit of body.edits) {
          if (edit.operation !== "setFortnight")
            throw Error("Unexpected write operation");
          window.__saved.fortnight[edit.row] ||= {};
          window.__saved.fortnight[edit.row][edit.field] = edit.value;
        }
        window.__saved.revision++;
        const result = {
          saved: true,
          delta: {
            versionId: window.__saved.id,
            revision: window.__saved.revision,
            globalRevision: window.__saved.revision,
            changes: GSISFields.diff(before, window.__saved),
          },
        };
        window.__pending = null;
        window.__receipts.set(body.requestId, {
          state: "committed",
          verified: true,
          result,
        });
        return reply(result);
      },
    };
  });
  await page.addScriptTag({ content: app });
  const row = '["5","Science"]';
  const fixture = {
    ...defaults(),
    id: "synthetic-fortnight",
    name: "Synthetic plan",
    status: "draft",
    publication: "Saved draft",
    revision: 1,
    classes: [],
    teachers: [],
    assignments: [],
    groups: [],
    loads: { 5: { Science: 9 } },
    fortnight: { [row]: { enabled: true, wd: 2, remarks: "Saved note" } },
  };
  const input = (field) => page.locator('[data-split-field="' + field + '"]');
  const save = () => page.locator("#saveQueue button:visible").first();
  const discard = () =>
    page
      .locator("#saveQueue")
      .getByRole("button", {
        name: "Discard",
        exact: true,
        includeHidden: true,
      });
  async function reset({
    canEdit = true,
    mode = "success",
    narrow = false,
  } = {}) {
    dialogs.length = 0;
    await page.setViewportSize(
      narrow ? { width: 390, height: 844 } : { width: 1180, height: 800 },
    );
    await page.evaluate(
      ({ doc, canEdit, mode }) => {
        if (!canEdit) {
          doc.status = "active";
          doc.publication = "Published";
        }
        window.__requests = [];
        window.__pending = null;
        window.__attemptBodies.clear();
        window.__receipts.clear();
        window.__verified.clear();
        window.__saved = structuredClone(doc);
        window.__canEdit = canEdit;
        window.__mode = mode;
        state = {
          versions: [
            structuredClone(doc),
            {
              ...structuredClone(doc),
              id: "synthetic-other",
              name: "Other plan",
            },
          ],
        };
        current = doc.id;
        role = canEdit ? "Admin+KP" : "Teacher";
        document.getElementById("version").innerHTML = options(
          state.versions.map((item) => [item.id, item.name]),
          current,
        );
        token = "synthetic";
        lastEmail = "synthetic@example.invalid";
        tab = "Fortnight Split";
        snapshotCache = { id: doc.id, revision: 1, globalRevision: 1 };
        cellQueue = [];
        queueFlight = null;
        draftBase = null;
        unsavedDraft = false;
        editing = null;
        busy = false;
        acquiring = false;
        exclusionEdits.clear();
        queueError = "";
        invalidatePendingProjection();
        document.querySelector("dialog").close();
        render();
        controls();
      },
      { doc: fixture, canEdit, mode },
    );
  }
  const inspect = () =>
    page.evaluate(() => ({
      dirty: unsavedDraft,
      queue: structuredClone(queuedEdits()),
      flight: queueFlight ? structuredClone(queueFlight) : null,
      tab,
      current,
      token,
      requests: structuredClone(window.__requests),
      inert: document.getElementById("content").inert,
      value: v().fortnight['["5","Science"]'],
      status: document.getElementById("status").textContent,
    }));
  async function finishSave() {
    await page.waitForFunction(
      () =>
        !queueFlight &&
        !queuedEdits().length &&
        document.getElementById("status").textContent.startsWith("Saved"),
    );
  }

  await reset();
  await input("wd").fill("3");
  await input("wd").fill("2");
  await input("wd").press("Tab");
  assert.equal(
    (await inspect()).dirty,
    false,
    "reverted numeric input must clear raw dirty state",
  );
  assert.equal((await inspect()).queue.length, 0);
  await page.locator('#nav [data-tab="Workload"]').click();
  assert.equal(
    (await inspect()).tab,
    "Workload",
    "reverted input must permit native navigation",
  );
  assert.equal((await inspect()).requests.length, 0);
  await reset();
  await input("remarks").fill("Changed note");
  await input("remarks").fill("Saved note");
  await input("remarks").press("Tab");
  assert.equal(
    (await inspect()).dirty,
    false,
    "reverted remarks must clear raw dirty state",
  );
  assert.equal((await inspect()).queue.length, 0);
  console.log("PASS reverted number/remarks and navigation make no writes");

  await reset();
  await input("ws").fill("1");
  await input("ws").press("Tab");
  await input("wd").fill("3");
  await input("wd").press("Tab");
  await input("wd").fill("4");
  await input("wd").fill("3");
  await input("wd").press("Tab");
  assert.equal(
    (await inspect()).dirty,
    false,
    "raw revert uses the staged value as its baseline",
  );
  assert.equal(
    (await inspect()).queue.length,
    2,
    "staged same-field edit and unrelated edit survive raw reversion",
  );
  await input("wd").fill("2");
  await input("wd").press("Tab");
  let stateNow = await inspect();
  assert.equal(stateNow.dirty, false);
  assert.equal(stateNow.queue.length, 1);
  assert.equal(stateNow.queue[0].field, "ws");
  assert.equal(stateNow.queue[0].value, 1);
  await save().click();
  await finishSave();
  assert.equal(
    (await inspect()).requests.filter((x) => x.action === "change").length,
    1,
  );
  assert.equal((await inspect()).value.ws, 1);
  console.log("PASS raw reversion retains and saves an unrelated queued field");

  await reset({ narrow: true });
  await input("wd").fill("3");
  assert.equal(await save().isVisible(), true, "focused draft exposes Save");
  assert.equal(await save().isEnabled(), true);
  await save().click();
  await finishSave();
  stateNow = await inspect();
  assert.equal(
    stateNow.requests.filter((x) => x.action === "change").length,
    1,
  );
  assert.equal(
    stateNow.requests.find((x) => x.action === "change").body.edits[0].value,
    3,
  );
  assert.equal(
    stateNow.value.wd,
    3,
    "normal queue displays the confirmed saved revision",
  );
  await input("remarks").fill("Keyboard note");
  await input("remarks").press("Tab");
  await save().focus();
  await page.keyboard.press("Enter");
  await finishSave();
  assert.equal((await inspect()).value.remarks, "Keyboard note");
  console.log("PASS focused Save and narrow keyboard save use native queue");

  for (const value of ["1.5", "-1", "201", "e"]) {
    await reset();
    if (value === "e") {
      await input("wd").focus();
      await input("wd").press("ControlOrMeta+A");
      await input("wd").pressSequentially("e");
    } else await input("wd").fill(value);
    if (value === "e")
      assert.equal(
        await input("wd").evaluate((node) => node.validity.badInput),
        true,
      );
    await input("wd").press("Tab");
    stateNow = await inspect();
    assert.equal(
      stateNow.queue.length,
      0,
      "invalid number must not stage, including native badInput",
    );
    assert.equal(stateNow.requests.length, 0);
    assert.equal(stateNow.dirty, true);
    assert.equal(await save().isVisible(), true);
    assert.equal(await save().isDisabled(), true);
    assert.equal(
      await input("wd").evaluate((node) => node.validity.valid),
      false,
    );
    await page.locator('#nav [data-tab="Workload"]').click();
    assert.equal(
      (await inspect()).tab,
      "Fortnight Split",
      "invalid input retains navigation guard",
    );
    await discard().click();
    stateNow = await inspect();
    assert.equal(stateNow.dirty, false);
    assert.equal(stateNow.queue.length, 0);
    assert.equal(
      stateNow.requests.length,
      0,
      "raw-only discard does not fetch or write",
    );
    assert.equal(await input("wd").inputValue(), "2");
  }
  console.log(
    "PASS decimal/range/badInput remain editable and raw-only discard is local",
  );

  await reset({ mode: "unknown" });
  await input("wd").fill("3");
  await save().click();
  await page.waitForFunction(() => queueFlight && !queueFlight.running);
  const uncertain = await inspect();
  assert.equal(uncertain.queue.length, 1);
  assert.equal(uncertain.inert, true);
  assert.equal(await discard().isDisabled(), true);
  await page.locator('#nav [data-tab="Workload"]').click();
  stateNow = await inspect();
  assert.equal(
    stateNow.tab,
    "Workload",
    "native same-version tab navigation remains available",
  );
  assert.equal(
    stateNow.inert,
    true,
    "the submitted draft remains read-only in another tab",
  );
  assert.equal(stateNow.flight.requestId, uncertain.flight.requestId);
  await page.locator("#version").selectOption("synthetic-other");
  assert.equal(
    (await inspect()).current,
    "synthetic-fortnight",
    "native version-switch guard remains active",
  );
  await page.locator("#signout").click();
  assert.equal(
    (await inspect()).token,
    "synthetic",
    "native sign-out guard retains the unresolved save",
  );
  await page.locator('#nav [data-section="Program Settings"]').click();
  assert.equal((await inspect()).tab, "Fortnight Split");
  assert.equal(await discard().isDisabled(), true);
  await page.locator('[data-deploy-recovery-action="retry"]').click();
  await page.waitForFunction(
    () =>
      queueFlight &&
      !queueFlight.running &&
      window.__requests.filter((x) => x.action === "change").length === 2,
  );
  stateNow = await inspect();
  assert.equal(stateNow.flight.requestId, uncertain.flight.requestId);
  assert.deepEqual(
    stateNow.requests
      .filter((x) => x.action === "change")
      .map((x) => x.body.edits),
    [uncertain.flight.wire, uncertain.flight.wire],
  );
  assert(
    stateNow.requests
      .filter((x) => x.action === "receipt")
      .every((x) => x.body.requestId === uncertain.flight.requestId),
  );
  console.log(
    "PASS uncertain flight keeps identity/payload, disables edits/discard and preserves native navigation guards",
  );

  await reset({ mode: "denied" });
  await input("wd").fill("3");
  await save().click();
  await page.waitForFunction(() => queueFlight && !queueFlight.running);
  assert.equal(
    (await inspect()).inert,
    true,
    "HTTP denial alone keeps submitted input locked",
  );
  await page.locator('[data-deploy-recovery-action="check"]').click();
  await page.waitForFunction(
    () => !queueFlight && queuedEdits().length === 1 && !!queueError,
  );
  stateNow = await inspect();
  assert.equal(stateNow.value.wd, 3);
  assert.equal(stateNow.queue.length, 1);
  assert.equal(
    stateNow.requests.filter((x) => x.action === "change").length,
    1,
  );
  await reset({ canEdit: false });
  assert.equal(await input("wd").getAttribute("readonly"), "");
  assert.equal(
    await page.locator("[data-fortnight-toggle]").first().isDisabled(),
    true,
  );
  await page.evaluate(() =>
    queueCell({
      operation: "setFortnight",
      row: '["5","Science"]',
      field: "wd",
      value: 4,
      expected: 2,
    }),
  );
  stateNow = await inspect();
  assert.equal(stateNow.queue.length, 0);
  assert.equal(stateNow.requests.length, 0);
  console.log(
    "PASS rejected save retains draft and read-only capability cannot queue edits",
  );

  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS six built-browser groups; synthetic transport only; runtime UAT Not tested",
  );
} finally {
  await browser?.close();
  await rm(output, { recursive: true, force: true });
}
