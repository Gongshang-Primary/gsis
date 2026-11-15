import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";

// B supersedes the removed catalogue panel with the one native draft. Preserve
// its ordering, historical values, CAS, receipt/restart, dirty and read-generation
// regressions. Catalogue-definition mutations are now historical conversion
// tests; a removed editor must not be kept alive merely for its old selectors.
const started = performance.now(),
  school = "synthetic-school";
const evidence = new URL(
  "../deliverables/v1/evidence/contacts-classification/",
  import.meta.url,
);
const configured = {
  GOOGLE_CLIENT_ID: "synthetic-classification.apps.googleusercontent.com",
  HOSTED_DOMAIN: "example.invalid",
};
await mkdir(evidence, { recursive: true });
const suite = await productSuite({ bindings: configured });
let active = suite,
  restarted,
  initialDisposed = false,
  browser,
  page,
  serial = 0,
  passed = 0,
  routeFault = null;
const writes = [],
  pageErrors = [],
  egress = [];
const id = () => "classification-op-" + ++serial;
const firstId = "classification-person-one",
  secondId = "classification-person-two";
async function request(user, path, body, headers = {}) {
  const response = await active.mf.dispatchFetch(
    origin + "/api/contacts" + path,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin,
        cookie: "__Host-gsis_session=" + user.token,
        "x-csrf-token": user.csrf,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  return { status: response.status, body: await response.json() };
}
async function call(user, path, body) {
  const response = await request(user, path, body);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}
async function update(user, staffId, changes, extra = {}) {
  const current = await call(user, "/staff/" + staffId);
  return call(user, "/staff/" + staffId + "/update", {
    operationId: id(),
    revision: current.revision,
    changes,
    ...extra,
  });
}
async function test(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
const cell = (field, staffId = firstId) =>
  page.locator(
    '#dataGrid [data-person="' + staffId + '"][aria-label="' + field + '"]',
  );
async function settle() {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function idle() {
  await page.waitForFunction(
    () =>
      !document.querySelector("#dataGrid").inert &&
      !document.querySelector("#saveData").disabled,
  );
  await settle();
}
async function saveGrid() {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/contacts/save-data" &&
        r.request().method() === "POST",
    ),
    page.locator("#saveData").click(),
  ]);
  const body = await response.json();
  await idle();
  return {
    status: response.status(),
    body,
    request: response.request().postDataJSON(),
  };
}
async function refresh() {
  const result = await page.evaluate(() => GSISV1ContactsViews.refresh());
  await settle();
  return result;
}
async function storedField(staffId, field) {
  const db = await active.db("contacts");
  return db
    .prepare(
      "SELECT revision,value_json,timeline_json,(SELECT COUNT(*) FROM contacts_history h WHERE h.school_id=f.school_id AND h.staff_id=f.staff_id AND h.field=f.field) AS history FROM contacts_fields f WHERE school_id=? AND staff_id=? AND field=?",
    )
    .bind(school, staffId, field)
    .first();
}
async function storedOperation(operationId) {
  const db = await active.db("contacts");
  const operation = await db
    .prepare(
      "SELECT state,digest,receipt_json FROM product_operations WHERE school_id=? AND operation_id=?",
    )
    .bind(school, operationId)
    .first();
  const audits = await db
    .prepare(
      "SELECT details_json FROM product_audit WHERE school_id=? AND operation_id=?",
    )
    .bind(school, operationId)
    .all();
  return {
    operation,
    audits: audits.results.map((r) => JSON.parse(r.details_json)),
  };
}
function barrier() {
  let enter, release;
  return {
    entered: new Promise((r) => {
      enter = r;
    }),
    wait: new Promise((r) => {
      release = r;
    }),
    enter: () => enter(),
    release: () => release(),
  };
}
try {
  const admin = await suite.seedAccount("classification-admin"),
    manager = await suite.seedAccount("classification-manager", {
      capabilities: ["contacts.powerUser"],
    }),
    reader = await suite.seedAccount("classification-reader", {
      capabilities: [],
    }),
    otherPower = await suite.seedAccount("classification-other-power", {
      capabilities: ["deploy.powerUser"],
    }),
    selfManager = await suite.seedAccount("classification-self-manager", {
      staffId: firstId,
      capabilities: ["contacts.powerUser"],
    });
  for (const [staffId, suffix] of [
    [firstId, "One"],
    [secondId, "Two"],
  ]) {
    await call(admin, "/staff/create", {
      operationId: id(),
      staffId,
      basicName: "Synthetic Classifier",
      nameSuffix: suffix,
    });
  }
  await update(manager, firstId, {
    role: "Teacher",
    eoAppointmentLevel: "EO",
    subjectTags: ["B", "A"],
    employmentActive: true,
  });
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath:
      process.env.GSIS_BROWSER_EXECUTABLE ||
      process.env.ROSTER_TEST_CHROMIUM ||
      undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const cookie = (user) => ({
    name: "__Host-gsis_session",
    value: user.token,
    domain: "gsis.example.invalid",
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
  });
  await context.addCookies([cookie(admin)]);
  await context.route("**/*", async (route) => {
    const input = route.request();
    if (!input.url().startsWith(origin + "/")) {
      egress.push(input.url());
      return route.abort();
    }
    const path = new URL(input.url()).pathname,
      body = input.postDataJSON();
    if (input.method() === "POST" && path.startsWith("/api/contacts/"))
      writes.push({ path, body, wire: input.postData() });
    const forward = async () => {
      const response = await active.mf.dispatchFetch(input.url(), {
        method: input.method(),
        headers: await input.allHeaders(),
        body: ["GET", "HEAD"].includes(input.method())
          ? undefined
          : input.postDataBuffer(),
      });
      const headers = Object.fromEntries(response.headers);
      delete headers["transfer-encoding"];
      return {
        status: response.status,
        headers,
        body: Buffer.from(await response.arrayBuffer()),
      };
    };
    if (routeFault && (await routeFault({ route, input, path, body, forward })))
      return;
    await route.fulfill(await forward());
  });
  page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(origin + "/contacts/", { waitUntil: "domcontentloaded" });
  await page.locator("#dataTab").click();
  await cell("Role").waitFor();

  await test("direct classification uses the native draft; unchanged values produce no owner write", async () => {
    assert.equal(await cell("Role").inputValue(), "Teacher");
    assert.equal(await cell("Subject Modifier").inputValue(), "B\nA");
    assert.equal(
      await page.locator("[data-facts],[data-definitions]").count(),
      0,
    );
    const count = writes.length;
    await page.evaluate(() => document.querySelector("#saveData").onclick());
    await settle();
    assert.equal(writes.length, count);
    await page.screenshot({
      path: new URL("classification-selection.png", evidence).pathname,
      fullPage: true,
    });
  });
  await test("EO-only intent retains ordered tags; deliberate list/scalar clear and return to baseline stay distinct", async () => {
    const baseline = await storedField(firstId, "subjectTags");
    await cell("EO Appt Level").fill("LT");
    const saved = await saveGrid();
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(
      saved.request.changes.map((c) => c.field),
      ["EO Appt Level"],
    );
    assert.deepEqual(await storedField(firstId, "subjectTags"), baseline);
    assert.equal(
      (await storedOperation(saved.request.operationId)).audits.length,
      1,
    );
    await cell("Subject Modifier").fill("");
    await saveGrid();
    assert.deepEqual(
      (await call(admin, "/staff/" + firstId)).fields.subjectTags.value,
      [],
    );
    await cell("Subject Modifier").fill("B\nC");
    await saveGrid();
    assert.deepEqual(
      (await call(admin, "/staff/" + firstId)).fields.subjectTags.value,
      ["B", "C"],
    );
    await cell("Role").fill("");
    await saveGrid();
    assert.equal(
      (await call(admin, "/staff/" + firstId)).fields.role.state,
      "superseded",
    );
    await cell("Role").fill("Teacher");
    await saveGrid();
    const count = writes.length;
    await cell("EO Appt Level").fill("ST");
    await cell("EO Appt Level").fill("LT");
    await page.evaluate(() => document.querySelector("#saveData").onclick());
    await settle();
    assert.equal(writes.length, count);
  });
  await test("a synthetic pinned retired record stays readable and byte-identical across an unrelated direct edit", async () => {
    // Deliberately seed an old-format row: current public catalogue writes are
    // retired. This is historical-storage compatibility, not onboarding proof.
    const db = await active.db("contacts"),
      historical = {
        catalogueId: "classification-historical-tags",
        revision: "1",
        kind: "operational-tag",
        entries: [
          {
            code: "B",
            label: "Retired subject",
            category: "subjectTags",
            active: false,
            definitionRevision: "old-definition",
            ttbVisible: true,
            order: 0,
          },
        ],
      };
    await db.batch([
      db
        .prepare(
          "INSERT INTO contacts_catalogues(school_id,catalogue_id,revision,body) VALUES(?,?,1,?)",
        )
        .bind(school, historical.catalogueId, JSON.stringify(historical)),
      db
        .prepare(
          "UPDATE contacts_fields SET value_json=?,timeline_json=NULL WHERE school_id=? AND staff_id=? AND field='subjectTags'",
        )
        .bind(
          JSON.stringify([
            { code: "B", revision: "1", catalogueId: historical.catalogueId },
          ]),
          school,
          firstId,
        ),
    ]);
    await refresh();
    assert.equal(await cell("Subject Modifier").inputValue(), "B");
    assert.match(
      await cell("Subject Modifier")
        .locator("..")
        .locator("[data-contact-evidence]")
        .textContent(),
      /B.*Retired subject/,
    );
    const before = await storedField(firstId, "subjectTags");
    await cell("EO Appt Level").fill("ST");
    await saveGrid();
    assert.deepEqual(await storedField(firstId, "subjectTags"), before);
    assert.equal(await cell("Subject Modifier").inputValue(), "B");
    await update(admin, firstId, { subjectTags: ["B", "A"] });
    await refresh();
  });
  await test("future and expired records are never silently replaced by an unrelated grid change", async () => {
    const now = Date.now();
    await update(
      admin,
      firstId,
      { role: "Future role" },
      { validFrom: now + 3600000, validUntil: now + 7200000 },
    );
    await update(
      admin,
      secondId,
      { eoAppointmentLevel: "Expired appointment" },
      { validFrom: now - 7200000, validUntil: now - 3600000 },
    );
    // Pending field storage has no public create route: this labelled local
    // fixture verifies unrelated edits preserve a nonaccepted record too.
    const db = await active.db("contacts");
    await db
      .prepare(
        "INSERT INTO contacts_fields(school_id,staff_id,field,revision,state,value_json,valid_from,revoked,proposer,operation_id) VALUES(?,?,'role',1,'pending',NULL,0,0,'synthetic-fixture','synthetic-pending-role')",
      )
      .bind(school, secondId)
      .run();
    await refresh();
    const role = await storedField(firstId, "role"),
      expired = await storedField(secondId, "eoAppointmentLevel"),
      pending = await storedField(secondId, "role");
    await cell("EXT", secondId).fill("0034");
    await cell("EXT").fill("0033");
    await saveGrid();
    assert.deepEqual(await storedField(firstId, "role"), role);
    assert.deepEqual(
      await storedField(secondId, "eoAppointmentLevel"),
      expired,
    );
    assert.deepEqual(await storedField(secondId, "role"), pending);
    assert.equal(await cell("EO Appt Level", secondId).inputValue(), "");
  });
  await test("refresh retains dirty native values and an in-flight save keeps one original operation", async () => {
    await cell("Mobile No", secondId).fill("81234567");
    const dirty = await refresh();
    assert.equal(dirty.grid, "deferred");
    assert.equal(
      (await cell("Mobile No", secondId).inputValue()).replace(/\s/g, ""),
      "81234567",
    );
    const gate = barrier();
    let original;
    routeFault = async ({ route, path, body, forward }) => {
      if (path !== "/api/contacts/save-data") return false;
      routeFault = null;
      original = structuredClone(body);
      gate.enter();
      await gate.wait;
      await route.fulfill(await forward());
      return true;
    };
    const saving = saveGrid();
    await gate.entered;
    try {
      assert.equal((await refresh()).grid, "deferred");
      assert.equal(await page.locator("#saveData").isDisabled(), true);
    } finally {
      gate.release();
    }
    const result = await saving;
    assert.equal(result.status, 200);
    assert.deepEqual(result.request, original);
    assert.equal(
      (await call(admin, "/staff/" + secondId)).fields.mobile.value,
      "81234567",
    );
  });
  await test("stale value CAS cannot partially save or claim completion", async () => {
    await cell("EO Appt Level").fill("Stale draft");
    await update(manager, firstId, { eoAppointmentLevel: "Concurrent owner" });
    const stale = await saveGrid();
    assert.equal(stale.status, 409);
    assert.equal(
      (await call(admin, "/staff/" + firstId)).fields.eoAppointmentLevel.value,
      "Concurrent owner",
    );
    assert.notEqual(await page.locator("#dataStatus").textContent(), "Saved");
    assert.equal(
      (await storedOperation(stale.request.operationId)).audits.length,
      0,
    );
    // Discard only the now-terminal conflicting draft using native reload.
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#reloadData").click();
    await idle();
    assert.equal(await cell("EO Appt Level").inputValue(), "Concurrent owner");
  });
  await test("wrong-operation receipts cannot unlock a committed but unconfirmed native attempt", async () => {
    let original;
    routeFault = async ({ route, path, body, forward }) => {
      if (
        !["/api/contacts/save-data", "/api/contacts/save-receipt"].includes(
          path,
        )
      )
        return false;
      original ??= body.operationId || body.requestId;
      const response = await forward();
      assert.equal(response.status, 200);
      const envelope = JSON.parse(response.body);
      if (envelope.data) {
        envelope.data.operationId = "unrelated-operation";
        envelope.data.requestId = "unrelated-operation";
        if (envelope.data.receipt)
          envelope.data.receipt.operationId = "unrelated-operation";
      }
      await route.fulfill({ ...response, body: JSON.stringify(envelope) });
      return true;
    };
    await cell("EO Appt Level").fill("Receipt binding appointment");
    await page.locator("#saveData").click();
    await idle();
    assert.equal(
      (await storedOperation(original)).operation.state,
      "committed",
    );
    assert.notEqual(await page.locator("#dataStatus").textContent(), "Saved");
    assert.equal(await cell("EO Appt Level").isEditable(), false);
    routeFault = null;
    await page.locator("#saveData").click();
    await idle();
    assert.equal(await page.locator("#dataStatus").textContent(), "Saved");
    assert.equal((await storedOperation(original)).audits.length, 1);
  });
  await test("lost committed response and actual Worker restart retain one operation, revision and audit", async () => {
    const before = await storedField(firstId, "subjectTags");
    let originalWire, originalBody, receipt;
    routeFault = async ({ route, input, path, body, forward }) => {
      if (path === "/api/contacts/save-data") {
        originalWire ??= input.postData();
        originalBody ??= structuredClone(body);
        assert.equal(input.postData(), originalWire);
        const response = await forward();
        assert.equal(response.status, 200);
        receipt ??= JSON.parse(response.body).data.receipt;
        await route.abort("failed");
        return true;
      }
      if (path === "/api/contacts/save-receipt") {
        await route.abort("failed");
        return true;
      }
      return false;
    };
    await cell("EO Appt Level").fill("Restart appointment");
    await page.locator("#saveData").click();
    await idle();
    assert.equal(receipt.state, "committed");
    assert.equal(await cell("EO Appt Level").isEditable(), false);
    assert.notEqual(await page.locator("#dataStatus").textContent(), "Saved");
    const after = await storedField(firstId, "eoAppointmentLevel");
    await suite.mf.dispose();
    initialDisposed = true;
    restarted = await startProduct({
      output: join(suite.path, "product"),
      persistPath: join(suite.path, "state"),
      migrateSchemas: false,
      bindings: { ...configured, GSIS_SECRET: suite.secret },
    });
    active = restarted;
    routeFault = null;
    await page.locator("#saveData").click();
    await idle();
    assert.equal(await page.locator("#dataStatus").textContent(), "Saved");
    const durable = await storedOperation(originalBody.operationId);
    assert.equal(durable.operation.state, "committed");
    assert.equal(durable.audits.length, 1);
    assert.deepEqual(await storedField(firstId, "eoAppointmentLevel"), after);
    assert.deepEqual(await storedField(firstId, "subjectTags"), before);
    const retries = writes.filter(
      (r) =>
        r.path === "/api/contacts/save-data" &&
        r.body.operationId === originalBody.operationId,
    );
    assert(retries.every((r) => r.wire === originalWire));
  });
  await test("stale and malformed completed views are rejected without overwriting current controls", async () => {
    const current = await call(admin, "/staff/" + firstId),
      gate = barrier();
    routeFault = async ({ route, path, forward }) => {
      if (path !== "/api/contacts/bootstrap") return false;
      routeFault = null;
      gate.enter();
      await gate.wait;
      await route.fulfill(await forward());
      return true;
    };
    const pending = page.evaluate(
      (input) => GSISV1ContactsViews.refresh(input),
      { staffId: firstId, expectedRevision: current.revision },
    );
    await gate.entered;
    try {
      await update(admin, firstId, { ext: "0044" });
    } finally {
      gate.release();
    }
    assert.equal((await pending).grid, "stale");
    await refresh();
    for (const mode of ["truncated", "duplicate"]) {
      const before = await cell("EO Appt Level").inputValue();
      routeFault = async ({ route, path, forward }) => {
        if (path !== "/api/contacts/bootstrap") return false;
        routeFault = null;
        const response = await forward(),
          envelope = JSON.parse(response.body);
        if (mode === "truncated") {
          envelope.data.fields.pop();
          for (const r of envelope.data.rows) {
            r.values.pop();
            r.computed.pop();
          }
        } else envelope.data.rows.push(structuredClone(envelope.data.rows[0]));
        await route.fulfill({ ...response, body: JSON.stringify(envelope) });
        return true;
      };
      assert.equal((await refresh()).grid, "unavailable", mode);
      assert.equal(await cell("EO Appt Level").inputValue(), before);
    }
  });
  await test("delayed same-person reads cannot repaint newer observations or overwrite a newly dirty form", async () => {
    const hold = async () =>
      page.evaluate(() => {
        const original = window.GSISfetch;
        let armed = true;
        window.__classificationHeld = false;
        window.GSISfetch = async function (...args) {
          const value = await original.apply(this, args);
          if (armed && String(args[0]).endsWith("/bootstrap")) {
            armed = false;
            window.__classificationHeld = true;
            await new Promise((resolve) => {
              window.__releaseClassificationRead = () => {
                window.GSISfetch = original;
                resolve();
              };
            });
          }
          return value;
        };
      });
    await hold();
    const oldRead = refresh();
    await page.waitForFunction(() => window.__classificationHeld);
    try {
      await update(admin, firstId, {
        eoAppointmentLevel: "Newest appointment",
      });
      await refresh();
    } finally {
      await page.evaluate(() => window.__releaseClassificationRead());
    }
    await oldRead;
    assert.equal(
      await cell("EO Appt Level").inputValue(),
      "Newest appointment",
    );
    await hold();
    const dirtyRead = refresh();
    await page.waitForFunction(() => window.__classificationHeld);
    try {
      await cell("EO Appt Level").fill("Unsaved appointment");
    } finally {
      await page.evaluate(() => window.__releaseClassificationRead());
    }
    assert.equal((await dirtyRead).grid, "deferred");
    assert.equal(
      await cell("EO Appt Level").inputValue(),
      "Unsaved appointment",
    );
    await cell("EO Appt Level").fill("Newest appointment");
    await page.locator('[data-page="signatureSettings"]').click();
    const checkbox = page.locator("[data-signature-subject]").first(),
      checked = await checkbox.isChecked();
    await checkbox.setChecked(!checked);
    const deferred = await refresh();
    assert.equal(deferred.grid, "deferred");
    assert.equal(deferred.directory, "deferred");
    assert.equal(await checkbox.isChecked(), !checked);
    await checkbox.setChecked(checked);
    await page.locator("#dataTab").click();
  });
  await test("contribution corrections preserve the original operation and unrelated native draft until exact receipt confirmation", async () => {
    const current = await call(admin, "/staff/" + firstId),
      proposalId = id();
    await call(manager, "/staff/" + firstId + "/propose", {
      operationId: proposalId,
      field: "role",
      value: "Original proposal",
      revision: current.fields.role.revision,
    });
    const panel = page.locator("[data-contacts-contributions]");
    if (!(await panel.evaluate((node) => node.open)))
      await panel.locator("summary").click();
    await Promise.all([
      page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/contacts/contributions",
      ),
      panel.locator("[data-load-contributions]").click(),
    ]);
    const card = panel.locator("[data-contributions] section").filter({
      has: page.getByRole("heading", {
        name: firstId + " · role · pending",
        exact: true,
      }),
    });
    await card
      .getByLabel("Contribution resolution", { exact: true })
      .selectOption("correct");
    await card.getByLabel("Role", { exact: true }).fill("Reviewed mentor");
    const mobileBefore = await cell("Mobile No", secondId).inputValue();
    await cell("Mobile No", secondId).fill("87654321");
    await page.screenshot({
      path: new URL("contribution-review.png", evidence).pathname,
      fullPage: true,
    });
    let original;
    routeFault = async ({ route, path, body, forward }) => {
      if (path !== "/api/contacts/contributions/resolve") return false;
      original ??= structuredClone(body);
      assert.deepEqual(body, original);
      const response = await forward();
      assert.equal(response.status, 200);
      const envelope = JSON.parse(response.body),
        receipt = envelope.data.receipt || envelope.data;
      receipt.operationId = "wrong-contribution-operation";
      await route.fulfill({ ...response, body: JSON.stringify(envelope) });
      return true;
    };
    const button = card.getByRole("button", {
      name: /^(Record reviewed resolution|Retry original resolution)$/,
    });
    await button.click();
    await page.waitForFunction(() =>
      /unconfirmed|original|retry/i.test(
        document.querySelector("[data-contribution-status]").textContent,
      ),
    );
    await button.waitFor({ state: "visible" });
    assert.equal(
      await card.getByLabel("Role", { exact: true }).isDisabled(),
      true,
    );
    assert.equal(
      await card
        .getByRole("button", { name: "Reset review draft", exact: true })
        .isDisabled(),
      true,
    );
    await panel.locator("[data-load-contributions]").click();
    assert.equal(
      await card.getByLabel("Role", { exact: true }).inputValue(),
      "Reviewed mentor",
    );
    routeFault = null;
    await button.click();
    await page.waitForFunction(() =>
      /recorded|saved/i.test(
        document.querySelector("[data-contribution-status]").textContent,
      ),
    );
    assert.equal(
      (await storedOperation(original.operationId)).audits.length,
      1,
    );
    assert.equal(
      (await call(admin, "/staff/" + firstId)).fields.role.value,
      "Reviewed mentor",
    );
    assert.equal(
      (await cell("Mobile No", secondId).inputValue()).replace(/\s/g, ""),
      "87654321",
    );
    const db = await active.db("contacts"),
      proposal = await db
        .prepare(
          "SELECT state,value_json FROM contacts_contributions WHERE school_id=? AND contribution_id=?",
        )
        .bind(school, proposalId)
        .first();
    assert.equal(proposal.state, "applied");
    assert.equal(JSON.parse(proposal.value_json), "Original proposal");
    await cell("Mobile No", secondId).fill(mobileBefore);
    await refresh();
  });
  await test("current permissions, ordinary self-edit, school isolation and late-account response fences survive", async () => {
    await update(selfManager, firstId, {
      eoAppointmentLevel: "Self edited ordinary fact",
    });
    for (const user of [reader, otherPower]) {
      assert.equal(
        (
          await request(user, "/staff/" + firstId + "/update", {
            operationId: id(),
            changes: { role: "P" },
          })
        ).status,
        403,
      );
    }
    assert.equal(
      (
        await request(admin, "/staff/" + firstId + "/update", {
          operationId: id(),
          schoolId: "foreign-school",
          changes: { role: "P" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          admin,
          "/staff/" + firstId + "/update",
          { operationId: id(), changes: { role: "P" } },
          { "x-gsis-preview-account": reader.id },
        )
      ).status,
      403,
    );
    const before = await storedField(firstId, "role");
    assert.equal(
      (
        await request(selfManager, "/staff/" + firstId + "/accept", {
          operationId: id(),
          field: "smc",
          value: true,
          revision: 0,
          ownerReviewReference: "synthetic",
        })
      ).status,
      403,
    );
    assert.deepEqual(await storedField(firstId, "role"), before);
    await refresh();
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    );
    await page.screenshot({
      path: new URL("classification-narrow.png", evidence).pathname,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const gate = barrier();
    routeFault = async ({ route, path, forward }) => {
      if (path !== "/api/contacts/bootstrap") return false;
      routeFault = null;
      const response = await forward();
      gate.enter();
      await gate.wait;
      await route.fulfill(response);
      return true;
    };
    const late = refresh();
    await gate.entered;
    try {
      await context.addCookies([cookie(reader)]);
      await page.evaluate(() => GSISV1.getSession(true));
    } finally {
      gate.release();
    }
    assert.equal((await late).grid, "unavailable");
    assert.equal(await page.locator("#dataGrid").textContent(), "");
    await page.goto(origin + "/contacts/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => GSISV1.getSession(true));
    assert.equal(
      await page.evaluate(() => Boolean(GSISV1.capable("contacts.manage"))),
      false,
    );
  });
  assert.deepEqual(pageErrors, []);
  assert(
    egress.every((url) => url === "https://accounts.google.com/gsi/client"),
  );
  await context.unrouteAll({ behavior: "wait" });
  await context.close();
} finally {
  await browser?.close();
  if (restarted) await restarted.close();
  if (!initialDisposed) await suite.close();
  else await rm(suite.path, { recursive: true, force: true });
  console.log(
    `${passed} direct classification browser groups passed in ${((performance.now() - started) / 1000).toFixed(3)}s`,
  );
}
