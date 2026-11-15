import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { startProduct } from "../scripts/v1/dev.mjs";

// Actual built browser, nine local Workers and D1. Identities and definitions
// are synthetic; route barriers below inject transport faults, never success.
const started = performance.now(),
  school = "synthetic-school",
  evidence = new URL(
    "../deliverables/v1/evidence/contacts-classification/",
    import.meta.url,
  ),
  configured = {
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
const ref = (catalogueId, code, revision = "1") => ({
  code,
  revision,
  catalogueId,
});
const hr = {
  catalogueId: "classification-hr",
  revision: "1",
  kind: "hr-term",
  entries: ["EO", "LT", "ST"].map((code) => ({
    code,
    label: "Appointment " + code,
    category: "eoAppointmentLevel",
    active: true,
    definitionRevision: "definition-1",
  })),
};
const roles = {
  catalogueId: "classification-roles",
  revision: "1",
  kind: "membership-role",
  entries: ["Teacher", "TeacherTwo"].map((code) => ({
    code,
    label: "Same role label",
    active: true,
    definitionRevision: "definition-1",
    flags: Object.fromEntries(
      ["sl", "sc", "smc", "kp", "tl", "sdt", "cmt", "sat", "support", "mk"].map(
        (key) => [key, false],
      ),
    ),
    eoAppointment: null,
  })),
};
const tags = {
  catalogueId: "classification-tags",
  revision: "1",
  kind: "operational-tag",
  entries: ["A", "B", "C"].map((code, order) => ({
    code,
    label: "Subject " + code,
    category: "subjectTags",
    active: true,
    definitionRevision: "definition-1",
    ttbVisible: true,
    order,
  })),
};
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
const facts = (field) =>
  page.locator('[data-facts] [data-field="' + field + '"]');
const panel = () =>
  page
    .locator("details.gsis-panel")
    .filter({ has: page.locator("[data-facts]") });
const selectedLabels = (field) =>
  facts(field).evaluate((select) =>
    [...select.selectedOptions].map((option) => option.textContent),
  );
async function selectField(field, codes) {
  const values = await facts(field).evaluate(
    (select, codes) =>
      codes.map((code) => {
        const options = [...select.options].filter((option) =>
          option.textContent.includes("[" + code + "]"),
        );
        if (options.length !== 1)
          throw Error("Ambiguous fixture option " + code);
        return options[0].value;
      }),
    codes,
  );
  await facts(field).selectOption(values);
}
async function selectStaff(staffId) {
  await Promise.all([
    page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/contacts/staff/" + staffId,
    ),
    panel().locator("[data-staff]").selectOption(staffId),
  ]);
  await facts("role").waitFor();
  await settle();
}
const statusText = () => panel().locator("[data-status]").textContent();
const saveButton = () => page.locator("[data-facts] button");
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
    () => !document.querySelector("[data-facts] button").disabled,
  );
  await settle();
}
async function saveFacts() {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        /\/api\/contacts\/staff\/[^/]+\/update$/.test(
          new URL(r.url()).pathname,
        ) && r.request().method() === "POST",
    ),
    saveButton().click(),
  ]);
  const value = await response.json();
  await idle();
  return {
    status: response.status(),
    body: value,
    request: response.request().postDataJSON(),
  };
}
async function saveCatalogue() {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/contacts/catalogues" &&
        r.request().method() === "POST",
    ),
    page.locator("[data-definitions] button.primary").click(),
  ]);
  const body = await response.json();
  await page.waitForFunction(
    () => !document.querySelector("[data-definitions] button.primary").disabled,
  );
  await settle();
  return {
    status: response.status(),
    body,
    request: response.request().postDataJSON(),
  };
}
async function refreshFacts() {
  const staffId = await panel().locator("[data-staff]").inputValue();
  const views = await page.evaluate(() => window.__classificationViews.length);
  await Promise.all([
    page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/contacts/staff/" + staffId,
    ),
    panel().locator("[data-refresh]").click(),
  ]);
  await page.waitForFunction(
    (count) => window.__classificationViews.length > count,
    views,
  );
  await settle();
}
async function observeStaffCompletion(staffId) {
  await page.evaluate((staffId) => {
    const original = GSISV1.request;
    let armed = true;
    window.__classificationReadSettled = false;
    GSISV1.request = async function (...args) {
      if (armed && args[0] === "contacts" && args[1] === "/staff/" + staffId) {
        armed = false;
        try {
          return await original.apply(this, args);
        } finally {
          window.__classificationReadSettled = true;
          GSISV1.request = original;
        }
      }
      return original.apply(this, args);
    };
  }, staffId);
}
async function storedField(staffId, field) {
  const db = await active.db("contacts");
  return db
    .prepare(
      "SELECT revision,value_json,(SELECT COUNT(*) FROM contacts_history h WHERE h.school_id=f.school_id AND h.staff_id=f.staff_id AND h.field=f.field) AS history FROM contacts_fields f WHERE school_id=? AND staff_id=? AND field=?",
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
async function installViewSpy() {
  await page.evaluate(() => {
    window.__classificationViews = [];
    const original = window.GSISV1ContactsViews;
    window.GSISV1ContactsViews = Object.freeze({
      refresh: async function (input) {
        const result = await original.refresh(input);
        window.__classificationViews.push({ input, result });
        return result;
      },
    });
  });
}
const lastView = () => page.evaluate(() => window.__classificationViews.at(-1));
function barrier() {
  let entered, release;
  return {
    entered: new Promise((resolve) => {
      entered = resolve;
    }),
    wait: new Promise((resolve) => {
      release = resolve;
    }),
    enter: () => entered(),
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
  for (const catalogue of [hr, roles, tags])
    await call(admin, "/catalogues", {
      operationId: id(),
      revision: 0,
      catalogue,
    });
  for (const [staffId, suffix] of [
    [firstId, "One"],
    [secondId, "Two"],
  ])
    await call(admin, "/staff/create", {
      operationId: id(),
      staffId,
      basicName: "Synthetic Classifier",
      nameSuffix: suffix,
    });
  await update(manager, firstId, {
    role: ref(roles.catalogueId, "Teacher"),
    eoAppointmentLevel: ref(hr.catalogueId, "EO"),
    subjectTags: [ref(tags.catalogueId, "B"), ref(tags.catalogueId, "A")],
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
    const path = new URL(input.url()).pathname;
    const body = input.postDataJSON();
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
  await panel()
    .locator("[data-staff] option[value='" + firstId + "']")
    .waitFor({ state: "attached" });
  await page.locator("#dataTab").click();
  if (!(await panel().evaluate((element) => element.open)))
    await panel().locator("summary").first().click();
  await selectStaff(firstId);
  await test("real canonical references remain selected and unchanged Save produces no owner write", async () => {
    await page.screenshot({
      path: new URL("classification-selection.png", evidence).pathname,
      fullPage: true,
    });
    assert.deepEqual(await selectedLabels("role"), [
      "Same role label [Teacher]",
    ]);
    assert.deepEqual((await selectedLabels("subjectTags")).sort(), [
      "Subject A [A]",
      "Subject B [B]",
    ]);
    const count = writes.length;
    await page.locator("[data-facts] button").click();
    await page.waitForFunction(() =>
      /No classification changes/.test(
        document
          .querySelector("[data-facts]")
          .closest("details")
          .querySelector("[data-status]").textContent,
      ),
    );
    assert.equal(writes.length, count);
  });
  await installViewSpy();
  await test("appointment-only intent preserves ordered tags, audit and native clean views; explicit clear and add/remove stay deliberate", async () => {
    const baseline = await storedField(firstId, "subjectTags");
    await selectField("eoAppointmentLevel", ["LT"]);
    const saved = await saveFacts();
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(Object.keys(saved.request.changes), [
      "eoAppointmentLevel",
    ]);
    assert.deepEqual(await storedField(firstId, "subjectTags"), baseline);
    const receipt = saved.body.data,
      persisted = await storedOperation(saved.request.operationId);
    assert.equal(receipt.state, "committed");
    assert.equal(receipt.operationId, saved.request.operationId);
    assert.equal(receipt.result.staffId, firstId);
    assert.deepEqual(JSON.parse(persisted.operation.receipt_json), receipt);
    assert.deepEqual(
      persisted.audits.map((a) => a.fields),
      [["eoAppointmentLevel"]],
    );
    const refreshed = await lastView();
    assert.equal(refreshed.result.directory, "refreshed");
    assert.equal(refreshed.result.grid, "refreshed");
    assert.equal(refreshed.result.revision, receipt.result.revision);
    assert.equal(await cell("EO Appt Level").inputValue(), "LT");
    const latest = await call(admin, "/staff/" + firstId);
    assert.equal(refreshed.result.revision, latest.revision);
    assert(
      (
        await panel().locator("[data-staff] option:checked").textContent()
      ).includes(latest.ttbName),
    );
    assert(
      (await page.locator("#contactRows").textContent()).includes(
        latest.ttbName,
      ),
    );
    await facts("subjectTags").selectOption([]);
    const cleared = await saveFacts();
    assert.deepEqual(cleared.request.changes, { subjectTags: [] });
    assert.equal(cleared.body.data.state, "committed");
    assert.deepEqual(
      JSON.parse((await storedField(firstId, "subjectTags")).value_json),
      [],
    );
    await update(admin, firstId, {
      subjectTags: [ref(tags.catalogueId, "B"), ref(tags.catalogueId, "A")],
    });
    await refreshFacts();
    await selectField("subjectTags", ["B", "C"]);
    const replaced = await saveFacts();
    assert.deepEqual(
      replaced.request.changes.subjectTags.map((r) => r.code),
      ["B", "C"],
    );
    assert.deepEqual(Object.keys(replaced.request.changes), ["subjectTags"]);
    await selectField("eoAppointmentLevel", ["ST"]);
    await selectField("eoAppointmentLevel", ["LT"]);
    const count = writes.length;
    await saveButton().click();
    await settle();
    assert.equal(
      writes.length,
      count,
      "Restoring the baseline must remove dirty intent.",
    );
    await facts("role").evaluate((select) => {
      select.append(
        new Option("Synthetic unknown choice", "unowned-reference"),
      );
      select.value = "unowned-reference";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await saveButton().click();
    await settle();
    assert.equal(
      writes.length,
      count,
      "Unknown option keys cannot invent catalogue references.",
    );
    assert.match(await statusText(), /unknown/i);
    await selectField("role", ["Teacher"]);
    await facts("role").selectOption("");
    await saveButton().click();
    await settle();
    assert.equal(
      writes.length,
      count,
      "Scalar null is not an authorised schema1 clear.",
    );
    assert.match(await statusText(), /not supported|recorded value/i);
    await selectField("role", ["Teacher"]);
  });
  await test("retired and historical references remain selected; unrelated edits and failed choice reads never repin or clear them", async () => {
    const retired = structuredClone(tags);
    retired.revision = "2";
    retired.entries[1].active = false;
    await call(admin, "/catalogues", {
      operationId: id(),
      revision: 1,
      catalogue: retired,
    });
    await refreshFacts();
    assert(
      (await selectedLabels("subjectTags")).some(
        (label) =>
          label.includes("[B]") && /retir|retain|unavailable/i.test(label),
      ),
    );
    await update(admin, firstId, {
      subjectTags: [ref(tags.catalogueId, "B"), ref(tags.catalogueId, "C")],
    });
    await refreshFacts();
    const before = await storedField(firstId, "subjectTags");
    assert(
      await facts("subjectTags").evaluate((select) =>
        [...select.selectedOptions].some(
          (option) =>
            option.dataset.code === "B" && option.dataset.revision === "1",
        ),
      ),
    );
    await selectField("eoAppointmentLevel", ["ST"]);
    const changed = await saveFacts();
    assert.deepEqual(Object.keys(changed.request.changes), [
      "eoAppointmentLevel",
    ]);
    assert.deepEqual(await storedField(firstId, "subjectTags"), before);
    routeFault = async ({ route, path }) => {
      if (path !== "/api/contacts/catalogues") return false;
      routeFault = null;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "SYNTHETIC_READ_OUTAGE",
            message: "Synthetic catalogue read unavailable",
          },
        }),
      });
      return true;
    };
    await panel().locator("[data-refresh]").click();
    await page.waitForFunction(() =>
      /unavailable/i.test(
        document
          .querySelector("[data-facts]")
          .closest("details")
          .querySelector("[data-status]").textContent,
      ),
    );
    const count = writes.length;
    await saveButton().click();
    await settle();
    assert.equal(writes.length, count);
    assert.deepEqual(await storedField(firstId, "subjectTags"), before);
    await refreshFacts();
  });
  await test("future and expired owner facts and a labelled pending read remain untouched by unrelated changes", async () => {
    const now = Date.now();
    await update(
      admin,
      secondId,
      { role: ref(roles.catalogueId, "TeacherTwo") },
      { validFrom: now + 3600000 },
    );
    await update(
      admin,
      secondId,
      { employmentActive: true },
      { validFrom: now - 120000, validUntil: now - 60000 },
    );
    await selectStaff(secondId);
    assert(
      (await selectedLabels("role")).some((label) =>
        label.includes("[TeacherTwo]"),
      ),
    );
    assert.match(
      await panel().locator('[data-field-status="role"]').textContent(),
      /future|not.*effective/i,
    );
    assert.match(
      await panel()
        .locator('[data-field-status="employmentActive"]')
        .textContent(),
      /expir|histor|not.*effective/i,
    );
    const beforeRole = await storedField(secondId, "role"),
      beforeActivity = await storedField(secondId, "employmentActive");
    await selectField("eoAppointmentLevel", ["LT"]);
    const saved = await saveFacts();
    assert.deepEqual(Object.keys(saved.request.changes), [
      "eoAppointmentLevel",
    ]);
    assert.deepEqual(await storedField(secondId, "role"), beforeRole);
    assert.deepEqual(
      await storedField(secondId, "employmentActive"),
      beforeActivity,
    );
    // Owner /propose writes a contribution, not a pending field record. This
    // one response-only fixture tests presentation/intent, not stored recovery.
    routeFault = async ({ route, path, forward }) => {
      if (path !== "/api/contacts/staff/" + secondId) return false;
      routeFault = null;
      const response = await forward(),
        data = JSON.parse(response.body);
      data.data.fields.employmentStatus = {
        state: "pending",
        effective: false,
        revision: 1,
      };
      await route.fulfill({ ...response, body: JSON.stringify(data) });
      return true;
    };
    await refreshFacts();
    assert.match(
      await panel()
        .locator('[data-field-status="employmentStatus"]')
        .textContent(),
      /pending/i,
    );
    const count = writes.length;
    await saveButton().click();
    await settle();
    assert.equal(writes.length, count);
    await selectStaff(firstId);
  });
  await test("disabled catalogue EO mappings preserve historical identity on an unrelated label edit", async () => {
    const mapped = {
      catalogueId: "classification-mapped",
      revision: "1",
      kind: "membership-role",
      entries: [
        {
          ...structuredClone(roles.entries[0]),
          code: "Mapped",
          label: "Mapped role",
          eoAppointment: ref(hr.catalogueId, "EO"),
        },
      ],
    };
    await call(admin, "/catalogues", {
      operationId: id(),
      revision: 0,
      catalogue: mapped,
    });
    const next = structuredClone(hr);
    next.revision = "2";
    next.entries[0].active = false;
    await call(admin, "/catalogues", {
      operationId: id(),
      revision: 1,
      catalogue: next,
    });
    await refreshFacts();
    const details = panel()
      .locator("details")
      .filter({ has: page.locator("[data-definitions]") });
    if (!(await details.evaluate((e) => e.open)))
      await details.locator(":scope > summary").click();
    await panel().locator("[data-catalogue]").selectOption(mapped.catalogueId);
    await panel()
      .locator('[data-entries] [data-key="label"]')
      .fill("Mapped role renamed");
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/contacts/catalogues" &&
          r.request().method() === "POST",
      ),
      page.locator("[data-definitions] button.primary").click(),
    ]);
    const body = response.request().postDataJSON();
    assert.deepEqual(
      body.catalogue.entries[0].eoAppointment,
      ref(hr.catalogueId, "EO"),
    );
    assert.equal((await response.json()).data.state, "committed");
    await page.waitForFunction(
      () =>
        document.querySelector("[data-id]").value === "" &&
        !document.querySelector("[data-kind]").disabled,
    );
    const catalogues = await call(admin, "/catalogues");
    assert.deepEqual(
      catalogues.rows.find((c) => c.catalogueId === mapped.catalogueId)
        .entries[0].eoAppointment,
      ref(hr.catalogueId, "EO"),
    );
    // A competing real publication makes this editor's whole-catalogue CAS
    // stale. Its durable abort is not a Saved outcome or permission to rebase.
    await panel().locator("[data-catalogue]").selectOption(mapped.catalogueId);
    const label = panel().locator('[data-entries] [data-key="label"]');
    await label.fill("Retained unsaved catalogue label");
    const concurrent = structuredClone(
      catalogues.rows.find((c) => c.catalogueId === mapped.catalogueId),
    );
    concurrent.revision = "3";
    concurrent.entries[0].label = "Concurrent owner label";
    await call(admin, "/catalogues", {
      operationId: id(),
      revision: 2,
      catalogue: concurrent,
    });
    const stale = await saveCatalogue();
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    const aborted = await storedOperation(stale.request.operationId);
    assert.equal(aborted.operation.state, "aborted");
    assert.equal(aborted.audits.length, 0);
    assert.equal(await label.isDisabled(), true);
    routeFault = async ({ route, path, forward }) => {
      if (path !== "/api/contacts/catalogues") return false;
      routeFault = null;
      const response = await forward(),
        envelope = JSON.parse(response.body);
      assert.equal(envelope.data.state, "terminal-not-committed");
      envelope.data.operationId = "different-terminal-operation";
      await route.fulfill({ ...response, body: JSON.stringify(envelope) });
      return true;
    };
    const unbound = await saveCatalogue();
    assert.deepEqual(unbound.request, stale.request);
    assert.equal(
      await label.isDisabled(),
      true,
      "Wrong-operation terminal response must not unlock the original catalogue draft.",
    );
    const terminal = await saveCatalogue();
    assert.deepEqual(terminal.request, stale.request);
    assert.deepEqual(
      terminal.body.data,
      JSON.parse(aborted.operation.receipt_json),
    );
    assert.equal(await label.isDisabled(), false);
    assert.equal(await label.inputValue(), "Retained unsaved catalogue label");
    assert.match(await statusText(), /not saved|not.*committed/i);
    assert.doesNotMatch(await statusText(), /^Catalogue revision saved/);
    const actual = (await call(admin, "/catalogues")).rows.find(
      (c) => c.catalogueId === mapped.catalogueId,
    );
    assert.equal(actual.revision, "3");
    assert.equal(actual.entries[0].label, "Concurrent owner label");
    assert.equal(
      (await storedOperation(stale.request.operationId)).audits.length,
      0,
    );
  });
  await test("classification refresh preserves dirty drafts and native in-flight request identity", async () => {
    await refreshFacts();
    await cell("Mobile No", secondId).fill("81234567");
    await cell("Mobile No", secondId).dispatchEvent("change");
    await selectField("eoAppointmentLevel", ["LT"]);
    await saveFacts();
    assert.equal(
      (await cell("Mobile No", secondId).inputValue()).replace(/\s/g, ""),
      "81234567",
    );
    assert.equal(
      await cell("Mobile No", secondId).evaluate((e) =>
        e.classList.contains("dirty"),
      ),
      true,
    );
    assert.equal((await lastView()).result.grid, "deferred");
    assert.match(await statusText(), /defer|draft/i);
    // Manual lower refresh must preserve its own unsaved classification too.
    await selectField("eoAppointmentLevel", ["ST"]);
    await panel().locator("[data-refresh]").click();
    await settle();
    assert(
      (await selectedLabels("eoAppointmentLevel")).some((label) =>
        label.includes("[ST]"),
      ),
    );
    const gate = barrier();
    let nativeBody;
    routeFault = async ({ route, path, body, forward }) => {
      if (path !== "/api/contacts/save-data") return false;
      routeFault = null;
      nativeBody = structuredClone(body);
      gate.enter();
      await gate.wait;
      await route.fulfill(await forward());
      return true;
    };
    await page.locator("#saveData").click();
    await gate.entered;
    try {
      await saveFacts();
      assert.equal((await lastView()).result.grid, "deferred");
      assert.equal(await page.locator("#saveData").isDisabled(), true);
      assert.equal(
        writes.filter((w) => w.path === "/api/contacts/save-data").length,
        1,
      );
    } finally {
      gate.release();
    }
    await page.waitForFunction(
      () => !document.querySelector("#dataGrid").inert,
    );
    await settle();
    assert.equal(
      nativeBody.changes
        .find((c) => c.field === "Mobile No")
        .value.replace(/\s/g, ""),
      "81234567",
    );
    assert.equal(
      (await call(admin, "/staff/" + secondId)).fields.mobile.value,
      "81234567",
    );
  });
  await test("stale staff and catalogue revisions reject without partial writes; only matching terminal evidence unlocks the original attempt", async () => {
    await refreshFacts();
    const before = await storedField(firstId, "eoAppointmentLevel");
    const changedCatalogue = structuredClone(roles);
    changedCatalogue.revision = "2";
    changedCatalogue.entries[0].label = "Updated role label";
    await call(admin, "/catalogues", {
      operationId: id(),
      revision: 1,
      catalogue: changedCatalogue,
    });
    await selectField("eoAppointmentLevel", ["LT"]);
    const stale = await saveFacts();
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    assert.deepEqual(await storedField(firstId, "eoAppointmentLevel"), before);
    assert.equal(
      (await storedOperation(stale.request.operationId)).audits.length,
      0,
    );
    assert.equal(await panel().locator("[data-staff]").isDisabled(), true);
    const terminal = await saveFacts();
    assert.deepEqual(terminal.request, stale.request);
    assert.equal(terminal.body.data.state, "terminal-not-committed");
    assert.equal(await panel().locator("[data-staff]").isDisabled(), false);
    assert.doesNotMatch(await statusText(), /^Classifications saved/);
    const conflicting = await request(admin, "/staff/" + firstId + "/update", {
      ...stale.request,
      changes: { employmentActive: false },
    });
    assert.equal(conflicting.status, 409);
    assert.equal(conflicting.body.error.code, "OPERATION_INTENT_CONFLICT");
    // The failed edit is deliberately retained after terminal noncommit. The
    // user restores its baseline before requesting a fresh owner read.
    await selectField("eoAppointmentLevel", ["ST"]);
    await refreshFacts();
  });
  await test("receipt binding, lost reply and actual Worker restart preserve the exact original operation and one durable effect", async () => {
    let corruptedReceipt;
    routeFault = async ({ route, path, forward }) => {
      if (path !== "/api/contacts/staff/" + firstId + "/update") return false;
      routeFault = null;
      const response = await forward(),
        envelope = JSON.parse(response.body);
      corruptedReceipt = structuredClone(envelope.data);
      envelope.data.operationId = "different-operation";
      await route.fulfill({ ...response, body: JSON.stringify(envelope) });
      return true;
    };
    await selectField("eoAppointmentLevel", ["LT"]);
    await saveFacts();
    assert.equal(
      await panel().locator("[data-staff]").isDisabled(),
      true,
      "Unbound receipt must not unlock the original attempt.",
    );
    assert.doesNotMatch(await statusText(), /^Classifications saved/);
    const confirmed = await saveFacts();
    assert.deepEqual(confirmed.body.data, corruptedReceipt);
    assert.equal(
      (await storedOperation(confirmed.request.operationId)).audits.length,
      1,
    );
    const before = await storedField(firstId, "subjectTags"),
      gate = barrier();
    let originalReceipt, originalWire, originalBody;
    routeFault = async ({ route, input, path, body, forward }) => {
      if (path !== "/api/contacts/staff/" + firstId + "/update") return false;
      routeFault = null;
      const response = await forward();
      originalReceipt = JSON.parse(response.body).data;
      originalWire = input.postData();
      originalBody = structuredClone(body);
      await route.abort("failed");
      gate.enter();
      return true;
    };
    await selectField("eoAppointmentLevel", ["ST"]);
    await saveButton().click();
    await gate.entered;
    await idle();
    assert.equal(originalReceipt.state, "committed");
    assert.equal(await panel().locator("[data-staff]").isDisabled(), true);
    assert.equal(await facts("eoAppointmentLevel").isDisabled(), true);
    const afterCommit = await storedField(firstId, "eoAppointmentLevel");
    await suite.mf.dispose();
    initialDisposed = true;
    restarted = await startProduct({
      output: join(suite.path, "product"),
      persistPath: join(suite.path, "state"),
      migrateSchemas: false,
      bindings: { ...configured, GSIS_SECRET: suite.secret },
    });
    active = restarted;
    const replay = await saveFacts();
    assert.deepEqual(replay.request, originalBody);
    assert.equal(
      writes
        .filter((w) => w.path === "/api/contacts/staff/" + firstId + "/update")
        .at(-1).wire,
      originalWire,
    );
    assert.deepEqual(replay.body.data, originalReceipt);
    const durable = await storedOperation(originalBody.operationId);
    assert.equal(durable.operation.state, "committed");
    assert.equal(durable.audits.length, 1);
    assert.deepEqual(durable.audits[0].fields, ["eoAppointmentLevel"]);
    assert.deepEqual(
      await storedField(firstId, "eoAppointmentLevel"),
      afterCommit,
    );
    assert.deepEqual(await storedField(firstId, "subjectTags"), before);
    assert.equal((await lastView()).result.grid, "refreshed");
  });
  await test("native refresh reports newer/unavailable views and preserves a draft created during its read", async () => {
    let current = await call(admin, "/staff/" + firstId);
    const newer = barrier();
    routeFault = async ({ route, path, forward }) => {
      if (path !== "/api/contacts/bootstrap") return false;
      routeFault = null;
      newer.enter();
      await newer.wait;
      await route.fulfill(await forward());
      return true;
    };
    const refresh = page.evaluate(
      (input) => GSISV1ContactsViews.refresh(input),
      { staffId: firstId, expectedRevision: current.revision },
    );
    await newer.entered;
    try {
      await update(admin, firstId, { ext: "2345" });
    } finally {
      newer.release();
    }
    const stale = await refresh;
    assert.equal(stale.directory, "stale");
    assert.equal(stale.grid, "stale");
    await refreshFacts();
    current = await call(admin, "/staff/" + firstId);
    for (const corruption of ["truncated", "duplicate"]) {
      const prior = await cell("EO Appt Level").inputValue();
      routeFault = async ({ route, path, forward }) => {
        if (path !== "/api/contacts/bootstrap") return false;
        routeFault = null;
        const response = await forward(),
          envelope = JSON.parse(response.body);
        if (corruption === "truncated") {
          envelope.data.fields.pop();
          for (const row of envelope.data.rows) {
            row.values.pop();
            row.computed.pop();
          }
        } else envelope.data.rows.push(structuredClone(envelope.data.rows[0]));
        await route.fulfill({ ...response, body: JSON.stringify(envelope) });
        return true;
      };
      const rejected = await page.evaluate(
        (input) => GSISV1ContactsViews.refresh(input),
        { staffId: firstId, expectedRevision: current.revision },
      );
      assert.equal(rejected.directory, "unavailable", corruption);
      assert.equal(rejected.grid, "unavailable", corruption);
      assert.equal(await cell("EO Appt Level").inputValue(), prior);
    }
    const during = barrier(),
      before = await cell("Mobile No").inputValue();
    routeFault = async ({ route, path, forward }) => {
      if (path !== "/api/contacts/bootstrap") return false;
      routeFault = null;
      const response = await forward();
      during.enter();
      await during.wait;
      await route.fulfill(response);
      return true;
    };
    const dirty = page.evaluate((input) => GSISV1ContactsViews.refresh(input), {
      staffId: firstId,
      expectedRevision: current.revision,
    });
    await during.entered;
    try {
      await cell("Mobile No").fill("87654321");
      await cell("Mobile No").dispatchEvent("change");
    } finally {
      during.release();
    }
    assert.equal((await dirty).grid, "deferred");
    assert.equal(
      (await cell("Mobile No").inputValue()).replace(/\s/g, ""),
      "87654321",
    );
    await cell("Mobile No").fill(before);
    await cell("Mobile No").dispatchEvent("change");
    let failedReads = 0;
    routeFault = async ({ route, path }) => {
      if (path !== "/api/contacts/bootstrap") return false;
      failedReads++;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "SYNTHETIC_READ_OUTAGE",
            message: "Synthetic bootstrap unavailable",
          },
        }),
      });
      return true;
    };
    await selectField("eoAppointmentLevel", ["LT"]);
    const saved = await saveFacts();
    routeFault = null;
    assert.equal(saved.body.data.state, "committed");
    assert.equal(
      failedReads,
      2,
      "Both existing bounded native read attempts fail; their retry policy is unchanged.",
    );
    assert.equal((await lastView()).result.grid, "unavailable");
    assert.match(await statusText(), /saved/i);
    assert.match(await statusText(), /unavailable/i);
    assert.equal(
      (await storedOperation(saved.request.operationId)).audits.length,
      1,
    );
    await refreshFacts();
  });
  await test("older same-person completions cannot replace newer facts or a newly begun draft; native auxiliary drafts defer refresh", async () => {
    // Delay delivery after the real shared read resolves. This leaves request
    // coalescing intact while allowing two actual owner observations to finish
    // out of order at the overlay boundary; no response contents are invented.
    const holdLower = async () =>
      page.evaluate((staffId) => {
        const original = GSISV1.request;
        let armed = true;
        window.__classificationHeld = false;
        GSISV1.request = async function (...args) {
          const result = await original.apply(this, args);
          if (
            armed &&
            args[0] === "contacts" &&
            args[1] === "/staff/" + staffId
          ) {
            armed = false;
            window.__classificationHeld = true;
            await new Promise((resolve) => {
              window.__releaseClassificationRead = () => {
                GSISV1.request = original;
                resolve();
              };
            });
          }
          return result;
        };
      }, firstId);
    await holdLower();
    await panel().locator("[data-refresh]").click();
    await page.waitForFunction(() => window.__classificationHeld);
    try {
      await update(admin, firstId, {
        eoAppointmentLevel: ref(hr.catalogueId, "ST", "2"),
      });
      await refreshFacts();
      assert(
        (await selectedLabels("eoAppointmentLevel")).some((label) =>
          label.includes("[ST]"),
        ),
      );
    } finally {
      await page.evaluate(() => window.__releaseClassificationRead());
    }
    await settle();
    assert(
      (await selectedLabels("eoAppointmentLevel")).some((label) =>
        label.includes("[ST]"),
      ),
    );
    await holdLower();
    await panel().locator("[data-refresh]").click();
    await page.waitForFunction(() => window.__classificationHeld);
    try {
      await selectField("eoAppointmentLevel", ["LT"]);
    } finally {
      await page.evaluate(() => window.__releaseClassificationRead());
    }
    await settle();
    assert(
      (await selectedLabels("eoAppointmentLevel")).some((label) =>
        label.includes("[LT]"),
      ),
    );
    assert.match(await statusText(), /draft|changed/i);
    await selectField("eoAppointmentLevel", ["ST"]);
    await update(admin, firstId, {
      eoAppointmentLevel: ref(hr.catalogueId, "LT", "2"),
    });
    await refreshFacts();
    const current = await call(admin, "/staff/" + firstId);
    await page.locator('[data-page="signatureSettings"]').click();
    const checkbox = page.locator("[data-signature-subject]").first(),
      checked = await checkbox.isChecked();
    await checkbox.setChecked(!checked);
    const deferred = await page.evaluate(
      (input) => GSISV1ContactsViews.refresh(input),
      { staffId: firstId, expectedRevision: current.revision },
    );
    assert.equal(deferred.directory, "deferred");
    assert.equal(deferred.grid, "deferred");
    assert.match(deferred.reason, /native Contacts form has unsaved changes/i);
    assert.equal(await checkbox.isChecked(), !checked);
    await checkbox.setChecked(checked);
    await page.locator("#dataTab").click();
  });
  await test("current capability, self-classification, preview and school boundaries survive; late responses cannot repaint another context", async () => {
    const current = await call(admin, "/staff/" + firstId),
      before = await storedField(firstId, "employmentActive");
    for (const [user, headers, extra] of [
      [reader, {}, {}],
      [otherPower, {}, {}],
      [admin, { "x-gsis-preview-account": reader.id }, {}],
      [admin, {}, { schoolId: "foreign-school" }],
    ]) {
      const denied = await request(
        user,
        "/staff/" + firstId + "/update",
        {
          operationId: id(),
          revision: current.revision,
          changes: { employmentActive: false },
          ...extra,
        },
        headers,
      );
      assert.equal(denied.status, 403, JSON.stringify(denied.body));
    }
    assert.deepEqual(await storedField(firstId, "employmentActive"), before);
    assert.equal(
      (await update(selfManager, firstId, { employmentActive: true })).state,
      "committed",
    );
    const selfDenied = await request(
      selfManager,
      "/staff/" + firstId + "/accept",
      {
        operationId: id(),
        field: "eo",
        value: true,
        revision: 0,
        ownerReviewReference: "Synthetic owner review",
      },
    );
    assert.equal(selfDenied.status, 403);
    assert.equal(selfDenied.body.error.code, "SELF_ACCEPTANCE_DENIED");
    await refreshFacts();
    const late = barrier();
    await observeStaffCompletion(secondId);
    routeFault = async ({ route, path, forward }) => {
      if (path !== "/api/contacts/staff/" + secondId) return false;
      routeFault = null;
      const response = await forward();
      late.enter();
      await late.wait;
      await route.fulfill(response);
      return true;
    };
    await panel().locator("[data-staff]").selectOption(secondId);
    await late.entered;
    try {
      await selectStaff(firstId);
    } finally {
      late.release();
    }
    await page.waitForFunction(() => window.__classificationReadSettled);
    await settle();
    assert.equal(await panel().locator("[data-staff]").inputValue(), firstId);
    assert(
      (await selectedLabels("role")).some((label) =>
        label.includes("[Teacher]"),
      ),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await panel().locator("[data-staff]").isVisible(), true);
    const containment = await panel().evaluate((element) => {
      const card = element.getBoundingClientRect(),
        select = element.querySelector("[data-staff]").getBoundingClientRect();
      return {
        width: innerWidth,
        cardLeft: card.left,
        cardRight: card.right,
        selectLeft: select.left,
        selectRight: select.right,
      };
    });
    assert(
      containment.cardLeft >= 0 &&
        containment.cardRight <= containment.width + 1,
      JSON.stringify(containment),
    );
    assert(
      containment.selectLeft >= containment.cardLeft &&
        containment.selectRight <= containment.cardRight,
      JSON.stringify(containment),
    );
    await selectField("eoAppointmentLevel", ["ST"]);
    await selectField("eoAppointmentLevel", ["LT"]);
    await page.screenshot({
      path: new URL("classification-narrow.png", evidence).pathname,
      fullPage: true,
    });
    const wrong = barrier();
    await observeStaffCompletion(secondId);
    routeFault = async ({ route, path, forward }) => {
      if (path !== "/api/contacts/staff/" + secondId) return false;
      routeFault = null;
      const response = await forward();
      wrong.enter();
      await wrong.wait;
      await route.fulfill(response);
      return true;
    };
    await panel().locator("[data-staff]").selectOption(secondId);
    await wrong.entered;
    try {
      await context.addCookies([
        {
          name: "__Host-gsis_session",
          value: reader.token,
          domain: "gsis.example.invalid",
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await page.evaluate(() => GSISV1.getSession(true));
    } finally {
      wrong.release();
    }
    await page.waitForFunction(() => window.__classificationReadSettled);
    await settle();
    assert.equal(await page.locator("[data-facts]").isVisible(), false);
    assert.equal(await page.locator("[data-facts] [data-field]").count(), 0);
    assert.deepEqual(egress, []);
    assert.deepEqual(pageErrors, []);
  });
  console.log(
    `${passed} classification browser groups passed; actual local owners, synthetic identities. Runtime UAT not performed.`,
  );
} finally {
  await browser?.close();
  await restarted?.close();
  if (initialDisposed) await rm(suite.path, { recursive: true, force: true });
  else await suite.close();
  console.log(
    `Elapsed ${((performance.now() - started) / 1000).toFixed(3)} seconds`,
  );
}
