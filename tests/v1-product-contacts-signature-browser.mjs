import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";

// Actual local Workers, owner writes, packaged artwork/fonts and Chromium PNG.
// Delays, invalid projection metadata and browser clock advances are explicit
// transport/clock fixtures; none are hosted or live-school evidence.
const start = performance.now(),
  school = "synthetic-school";
const evidence = new URL(
  "../deliverables/v1/evidence/contacts-signature/",
  import.meta.url,
);
await mkdir(evidence, { recursive: true });
const suite = await productSuite({
  bindings: {
    GOOGLE_CLIENT_ID: "synthetic-signature.apps.googleusercontent.com",
    HOSTED_DOMAIN: "example.invalid",
  },
});
let browser,
  page,
  serial = 0,
  passed = 0,
  viewTransform = null,
  blockAssets = false;
const writes = [],
  assets = [],
  pageErrors = [],
  downloads = [];
const next = () => "signature-browser-" + ++serial;
async function test(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
async function call(user, path, body) {
  if (body !== undefined)
    return suite.call(user, "contacts", path, { operationId: next(), ...body });
  const r = await suite.request(user, "contacts", path);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.data;
}
async function update(user, changes) {
  const old = await call(user, "/staff/signature-person");
  return call(user, "/staff/signature-person/update", {
    revision: old.revision,
    changes,
  });
}
async function refresh() {
  const result = await page.evaluate(() => GSISV1ContactsViews.refresh());
  assert.equal(result?.directory, "refreshed", JSON.stringify(result));
  assert.equal(result?.grid, "refreshed", JSON.stringify(result));
  // Native teaching refresh starts a second signature render. Wait for its
  // completion before testing expiry of a specifically held later render.
  await page.waitForFunction(
    () => !document.querySelector("#deploymentStatus .contacts-spinner"),
  );
  return result;
}
async function ready(title) {
  await page.waitForFunction((title) => {
    const b = document.querySelector("#signatureDownload"),
      c = document.querySelector("#signatureCanvas");
    return (
      b &&
      !b.disabled &&
      c &&
      !c.hidden &&
      document.querySelector("#signatureIdentity").textContent.includes(title)
    );
  }, title);
}
async function installGate(kind) {
  await page.evaluate((kind) => {
    let resolve;
    window.__signatureGate = {
      kind,
      entered: false,
      promise: new Promise((r) => (resolve = r)),
      release: () => resolve(),
    };
  }, kind);
}
async function entered() {
  await page.waitForFunction(() => window.__signatureGate?.entered);
}
async function release() {
  await page.evaluate(() => window.__signatureGate.release());
}
async function settle() {
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}
try {
  const admin = await suite.seedAccount("signature-browser", {
    staffId: "signature-person",
  });
  await call(admin, "/staff/create", {
    staffId: admin.staffId,
    basicName: "Synthetic Signature",
  });
  await update(admin, {
    role: "HOD ICT",
    statutoryName: "Synthetic Signature Name",
    email: "signature-browser@example.invalid",
    employmentActive: true,
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.GSIS_BROWSER_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
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
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (
      request.method() === "POST" &&
      url.pathname.startsWith("/api/contacts/")
    )
      writes.push({ path: url.pathname, body: request.postDataJSON() });
    if (url.pathname.includes("signature-assets/")) {
      assets.push(url.pathname);
      if (blockAssets) return route.abort();
    }
    const response = await suite.mf.dispatchFetch(request.url(), {
      method: request.method(),
      headers: await request.allHeaders(),
      body: ["GET", "HEAD"].includes(request.method())
        ? undefined
        : request.postDataBuffer(),
    });
    const headers = Object.fromEntries(response.headers);
    delete headers["transfer-encoding"];
    let body = Buffer.from(await response.arrayBuffer());
    if (viewTransform && url.pathname === "/api/contacts/bootstrap") {
      const json = JSON.parse(body.toString());
      viewTransform(json);
      body = Buffer.from(JSON.stringify(json));
    }
    return route.fulfill({ status: response.status, headers, body });
  });
  page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("download", (d) => downloads.push(d));
  await page.goto(origin + "/contacts/", { waitUntil: "domcontentloaded" });
  await page.locator('button[data-page="signature"]').waitFor();
  await page.evaluate(() => {
    const render = GSISSignature.render,
      png = GSISSignature.png,
      nativeNow = Date.now;
    Date.now = () => window.__signatureClock ?? nativeNow();
    window.__signatureRendered = [];
    window.__signatureSources = [];
    GSISSignature.render = async (...args) => {
      __signatureSources.push(structuredClone(args[1].signatureSource));
      const gate =
        window.__signatureGate?.kind === "render" &&
        !window.__signatureGate.entered
          ? window.__signatureGate
          : null;
      const info = await render(...args);
      window.__signatureRendered.push(info);
      if (gate) {
        gate.entered = true;
        await gate.promise;
      }
      return info;
    };
    GSISSignature.png = async (...args) => {
      const gate =
        window.__signatureGate?.kind === "png" &&
        !window.__signatureGate.entered
          ? window.__signatureGate
          : null;
      const blob = await png(...args);
      if (gate) {
        gate.entered = true;
        await gate.promise;
      }
      return blob;
    };
  });
  await page.locator('button[data-page="signature"]').click();
  const title = "Head of Department (Information and Communication Technology)";
  await test("packaged v0.9 artwork/fonts render the actual formal title and downloadable PNG", async () => {
    await ready(title);
    const info = await page.evaluate(() => ({
      last: __signatureRendered.at(-1),
      width: signatureCanvas.width,
      height: signatureCanvas.height,
      alpha: signatureCanvas
        .getContext("2d")
        .getImageData(0, 0, signatureCanvas.width, signatureCanvas.height)
        .data.some((v, i) => i % 4 === 3 && v !== 0),
    }));
    assert.equal(info.last.name, "Synthetic Signature Name");
    assert.equal(info.last.designation, title);
    assert(info.width >= 900 && info.height > 60 && info.alpha);
    assert(
      assets.some((p) => p.endsWith("Outfit-Regular.ttf")) &&
        assets.some((p) => p.endsWith("Outfit-Bold.ttf")) &&
        assets.some((p) => p.endsWith("template.png")),
    );
    const download = page.waitForEvent("download");
    await page.locator("#signatureDownload").click();
    const result = await download;
    assert.match(
      result.suggestedFilename(),
      /^GSiS-signature-Synthetic-Signature-Name\.png$/,
    );
    const file = new URL("signature.png", evidence).pathname;
    await result.saveAs(file);
    const bytes = await readFile(file);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(bytes.readUInt32BE(16), info.width);
    assert.equal(bytes.readUInt32BE(20), info.height);
    await page.setViewportSize({ width: 390, height: 844 });
    const box = await page.locator("#signatureCanvas").boundingBox();
    assert(box.width <= 390);
    await page.screenshot({
      path: new URL("signature-narrow.png", evidence).pathname,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await test("an actual asset load failure disables export and valid assets restore the preview", async () => {
    blockAssets = true;
    const other = await context.newPage();
    other.setDefaultTimeout(5000);
    try {
      await other.goto(origin + "/contacts/", {
        waitUntil: "domcontentloaded",
      });
      await other.locator('button[data-page="signature"]').click();
      await other.waitForFunction(() =>
        document
          .querySelector("#signatureStatus")
          .textContent.includes("artwork"),
      );
      assert(await other.locator("#signatureDownload").isDisabled());
      blockAssets = false;
      await other.locator("#signatureRetry").click();
      await other.waitForFunction(
        () => !document.querySelector("#signatureDownload").disabled,
      );
    } finally {
      blockAssets = false;
      await other.close();
    }
  });
  await test("missing statutory name and unavailable pinned evidence cannot produce a signature", async () => {
    await update(admin, { statutoryName: null });
    await refresh();
    await page.waitForFunction(() =>
      document
        .querySelector("#signatureStatus")
        .textContent.includes("Statutory Name"),
    );
    assert(await page.locator("#signatureDownload").isDisabled());
    await update(admin, { statutoryName: "Synthetic Signature Name" });
    await refresh();
    await ready(title);
    const db = await suite.db("contacts"),
      old = await db
        .prepare(
          "SELECT value_json,timeline_json FROM contacts_fields WHERE school_id=? AND staff_id=? AND field='role'",
        )
        .bind(school, admin.staffId)
        .first();
    // Explicit malformed historical-reference fixture, not an accepted owner write.
    await db
      .prepare(
        "UPDATE contacts_fields SET value_json=?,timeline_json=NULL WHERE school_id=? AND staff_id=? AND field='role'",
      )
      .bind(
        JSON.stringify({
          catalogueId: "missing-signature-definition",
          revision: "1",
          code: "HOD ICT",
        }),
        school,
        admin.staffId,
      )
      .run();
    await refresh();
    await page.waitForFunction(() =>
      document
        .querySelector("#signatureStatus")
        .textContent.includes("unavailable"),
    );
    assert(await page.locator("#signatureDownload").isDisabled());
    assert.equal(await page.locator("#signatureIdentity").textContent(), "");
    await db
      .prepare(
        "UPDATE contacts_fields SET value_json=?,timeline_json=? WHERE school_id=? AND staff_id=? AND field='role'",
      )
      .bind(old.value_json, old.timeline_json, school, admin.staffId)
      .run();
    await refresh();
    await ready(title);
  });
  await test("confirmed owner refresh supersedes an older actual render before it can publish its canvas", async () => {
    await installGate("render");
    await page.evaluate(() => {
      window.__signatureAttempt = GSISContactsEditor.renderSignature();
    });
    await entered();
    const before = writes.length;
    await update(admin, { role: "P" });
    await refresh();
    await ready("Principal");
    await release();
    await page.evaluate(() => window.__signatureAttempt);
    await ready("Principal");
    assert.equal(
      writes.length,
      before,
      "read refresh and renderer must not write owner records",
    );
  });
  await test("confirmed grid-save rows invalidate a pending PNG and only the new title downloads", async () => {
    await installGate("png");
    const before = downloads.length;
    await page.evaluate(() => {
      window.__signatureAttempt = GSISContactsEditor.downloadSignature();
    });
    await entered();
    await page.locator("#dataTab").click();
    const role = page.locator(
      '#dataGrid [data-person="signature-person"][aria-label="Role"]',
    );
    await role.fill("VP(EO)");
    await page.locator("#saveData").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#saveData").disabled &&
        !document.querySelector("#dataGrid").inert,
    );
    await page.locator('button[data-page="signature"]').click();
    await ready("Vice Principal");
    await release();
    await page.evaluate(() => window.__signatureAttempt);
    await settle();
    assert.equal(
      downloads.length,
      before,
      "old PNG must not download after confirmed row mutation",
    );
    const d = page.waitForEvent("download");
    await page.locator("#signatureDownload").click();
    await d;
  });
  await test("source expiry after actual render or PNG creation blocks acceptance and download", async () => {
    let until = Date.now() + 60000;
    viewTransform = (json) => {
      for (const p of [...json.data.people, ...json.data.rows])
        if (p.id === admin.staffId) p.signatureSource.validUntil = until;
    };
    await refresh();
    await ready("Vice Principal");
    assert.equal(
      await page.evaluate(() => __signatureSources.at(-1).validUntil),
      until,
    );
    await installGate("render");
    await page.evaluate(() => {
      window.__signatureAttempt = GSISContactsEditor.renderSignature();
    });
    await entered();
    await page.evaluate((until) => {
      window.__signatureClock = until;
    }, until);
    await release();
    await page.evaluate(() => window.__signatureAttempt);
    assert(await page.locator("#signatureDownload").isDisabled());
    assert.match(
      await page.locator("#signatureStatus").textContent(),
      /changed/,
    );
    await page.evaluate(() => {
      delete window.__signatureClock;
    });
    until = Date.now() + 60000;
    await refresh();
    await ready("Vice Principal");
    assert.equal(
      await page.evaluate(() => __signatureSources.at(-1).validUntil),
      until,
    );
    await installGate("png");
    const before = downloads.length;
    await page.evaluate(() => {
      window.__signatureAttempt = GSISContactsEditor.downloadSignature();
    });
    await entered();
    await page.evaluate((until) => {
      window.__signatureClock = until;
    }, until);
    await release();
    await page.evaluate(() => window.__signatureAttempt);
    await settle();
    assert.equal(downloads.length, before);
    assert(await page.locator("#signatureDownload").isDisabled());
    await page.evaluate(() => {
      delete window.__signatureClock;
    });
    viewTransform = null;
    await refresh();
    await ready("Vice Principal");
  });
  await test("a protected-context change rejects a late PNG and removes the private preview", async () => {
    await installGate("png");
    const before = downloads.length;
    await page.evaluate(() => {
      window.__signatureAttempt = GSISContactsEditor.downloadSignature();
    });
    await entered();
    await page.evaluate(() => {
      const original = indexedDB.databases.bind(indexedDB);
      let release;
      const blocked = new Promise((resolve) => (release = resolve));
      window.__storageClear = {
        entered: false,
        release,
        epoch: GSISV1.saveStatus().contextEpoch,
      };
      indexedDB.databases = async () => {
        window.__storageClear.entered = true;
        await blocked;
        indexedDB.databases = original;
        return original();
      };
      window.__signatureLogout = GSISV1.logout();
    });
    await page.waitForFunction(() => window.__storageClear.entered);
    assert(
      await page.evaluate(
        () => GSISV1.saveStatus().contextEpoch > __storageClear.epoch,
      ),
    );
    assert(
      await page
        .locator("#app")
        .evaluate((app) => app.classList.contains("hidden")),
    );
    for (const id of ["dataGrid", "contactRows", "identity"])
      assert.equal(await page.locator("#" + id).textContent(), "");
    await release();
    await page.evaluate(() => window.__signatureAttempt);
    await settle();
    assert.equal(downloads.length, before);
    assert(await page.locator("#signatureDownload").isDisabled());
    assert(
      await page
        .locator("#signatureCanvas")
        .evaluate((canvas) => canvas.hidden),
    );
    assert(
      !(await page.locator("#signatureIdentity").textContent()).includes(
        "Synthetic Signature Name",
      ),
    );
    await page.evaluate(() => __storageClear.release());
    await page.evaluate(() => __signatureLogout);
    const nextUser = await suite.seedAccount("signature-after-clear");
    await context.addCookies([
      {
        name: "__Host-gsis_session",
        value: nextUser.token,
        domain: "gsis.example.invalid",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.evaluate(async () => {
      await GSISV1.getSession(true);
      // Invoke the native retry handler with the new actual server session.
      await document.querySelector("#retryContactsLogin").onclick();
    });
    await page.waitForFunction(
      () =>
        document.querySelector("#identity").textContent ===
          "signature-after-clear" &&
        !document.querySelector("#app").classList.contains("hidden"),
    );
    const latest = await page.locator("#contactRows").textContent();
    assert(latest.includes("Synthetic Signature"));
    // A delayed duplicate completion notification from the older clear has no
    // new context epoch; it must not clear the newly authenticated native view.
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("gsis:clear-protected-state")),
    );
    assert.equal(
      await page.locator("#identity").textContent(),
      "signature-after-clear",
    );
    assert.equal(await page.locator("#contactRows").textContent(), latest);
    assert(
      !(await page
        .locator("#app")
        .evaluate((app) => app.classList.contains("hidden"))),
    );
  });
  assert.deepEqual(pageErrors, []);
  await context.unrouteAll({ behavior: "wait" });
  await context.close();
} catch (error) {
  console.log(
    "SIGNATURE_FAILURE_TRACE " +
      JSON.stringify(
        await page
          ?.evaluate(() => ({
            sources: window.__signatureSources?.slice(-8),
            status: document.querySelector("#signatureStatus")?.textContent,
            disabled: document.querySelector("#signatureDownload")?.disabled,
          }))
          .catch(() => null),
      ),
  );
  throw error;
} finally {
  await browser?.close();
  await suite.close();
}
console.log(
  `${passed} actual signature browser groups passed in ${((performance.now() - start) / 1000).toFixed(3)}s`,
);
