import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildWeb } from "../scripts/v1/build-web.mjs";

// Actual built native renderers/controls in Chromium, with explicitly synthetic
// ctx.api responses. These tests verify UI confirmation and intent retention;
// Worker authorization, durable ordering and commit races have separate tests.
const root = dirname(dirname(fileURLToPath(import.meta.url))),
  out = await mkdtemp(join(tmpdir(), "gsis-roster-admin-ui-")),
  evidence = join(root, "deliverables/v1/evidence/roster-admin-settings"),
  started = performance.now();
await mkdir(evidence, { recursive: true });
await buildWeb(out);
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  executablePath:
    process.env.GSIS_BROWSER_EXECUTABLE ||
    process.env.ROSTER_TEST_CHROMIUM ||
    undefined,
});
const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  }),
  errors = [],
  egress = [],
  results = [];
let count = 0,
  serial = 0;
await context.route("**/*", async (route) => {
  if (route.request().url() === "https://roster.test/")
    return route.fulfill({
      contentType: "text/html",
      body: '<main id="content"></main>',
    });
  egress.push(route.request().url());
  return route.abort();
});
const page = await context.newPage();
page.setDefaultTimeout(5000);
page.on("pageerror", (error) => errors.push(error.message));
async function test(name, run) {
  await run();
  count++;
  results.push(name);
  console.log("PASS " + name);
}
async function boot({
  kind = "config",
  admin = true,
  subjects = [],
  revision = 0,
} = {}) {
  await page.goto("https://roster.test/");
  for (const file of [
    "roster.css",
    "roster-operations.css",
    "roster-settings.css",
  ])
    await page.addStyleTag({
      content: await readFile(join(out, "roster", file), "utf8"),
    });
  for (const file of [
    "shared/roster-stapler.js",
    "shared/roster-allocation.js",
    "shared/roster-operations.js",
  ])
    await page.addScriptTag({
      content: await readFile(join(root, file), "utf8"),
    });
  for (const file of ["roster-operations-ui.js", "roster-settings-ui.js"])
    await page.addScriptTag({
      content: await readFile(join(out, "roster", file), "utf8"),
    });
  await page.evaluate(
    async (options) => {
      const clone = (value) => structuredClone(value),
        initial = GSISRosterOperations.initial();
      window.calls = [];
      window.replyMode = "success";
      window.lastResult = null;
      window.committed = null;
      window.loaded =
        options.kind === "config"
          ? {
              revision: options.revision,
              canEdit: options.admin,
              config: initial.systemConfig,
              subjects: options.subjects,
              consecutiveSubjects: options.subjects,
              periods: [],
              employmentTypes: [],
              teachingGroups: [],
              preferenceRules: GSISRosterAllocation.preferenceRules,
              baseline: null,
              schedulerAvailable: false,
              nameBridges: null,
            }
          : {
              date: "2026-11-16",
              revision: options.revision,
              types: [
                {
                  id: "z-stable",
                  label: "First type",
                  requiresDetail: false,
                  allowSelectAll: true,
                  allowedPeriods: null,
                  afterMinutes: null,
                  minStartMinutes: null,
                  todayOnly: false,
                },
                {
                  id: "a-stable",
                  label: "Second type",
                  requiresDetail: true,
                  allowSelectAll: false,
                  allowedPeriods: [1],
                  afterMinutes: 390,
                  minStartMinutes: 420,
                  todayOnly: true,
                },
              ],
              periods: [{ period: 1, start: "07:00", end: "07:30" }],
            };
      window.ctx = {
        profile: {
          user: {
            email: "admin-" + options.serial + "@example.invalid",
            staffId: "synthetic-staff",
            admin: options.admin,
            smc: true,
          },
        },
        today: () => "2026-11-16",
        initialDate: "2026-11-16",
        container: document.getElementById("content"),
        status() {},
        invalidateOperations() {},
        api: async (route, input) => {
          calls.push(clone(input));
          if (!["saveSystemConfig", "saveTypes"].includes(input.operation))
            return clone(loaded);
          const { operation, date, revision, requestId, view, ...values } =
            input;
          const body = {
            ...clone(loaded),
            ...(operation === "saveSystemConfig"
              ? { config: clone(values) }
              : { date, types: clone(values.types) }),
            revision: revision + 1,
            acceptedRevision: revision + 1,
            requestId,
            savedIds: operation === "saveSystemConfig" ? ["systemConfig"] : [],
            notificationsQueued: 0,
          };
          const result = {
            ...clone(body),
            receipt: {
              state: "committed",
              operationId: requestId,
              digest: "a".repeat(64),
              fence: 1,
              committedAt: Date.now(),
              result: clone(body),
            },
          };
          committed = clone(result);
          lastResult = clone(result);
          if (replyMode === "loss")
            throw Error("Synthetic response lost; outcome unknown.");
          if (replyMode === "preview-denied")
            throw Object.assign(Error("Preview is read-only."), {
              status: 403,
            });
          if (replyMode === "validation")
            throw Object.assign(Error("Check the requested backup lag."), {
              status: 400,
            });
          if (replyMode === "conflict")
            throw Object.assign(Error("Synthetic newer revision."), {
              status: 409,
            });
          if (replyMode === "missing-view") {
            delete result.config;
            delete result.types;
            delete result.receipt.result.config;
            delete result.receipt.result.types;
          }
          if (replyMode === "wrong-id")
            result.receipt.operationId = "another-operation";
          if (replyMode === "wrong-request")
            result.requestId = "another-operation";
          if (replyMode === "prepared") result.receipt.state = "prepared";
          if (replyMode === "bad-fence") result.receipt.fence = 0;
          if (replyMode === "bad-digest")
            result.receipt.digest = "not-a-digest";
          if (replyMode === "wrong-revision") result.acceptedRevision++;
          if (replyMode === "wrong-receipt-revision")
            result.receipt.result.revision++;
          if (replyMode === "wrong-order") result.types.reverse();
          if (replyMode === "missing-subjects") {
            delete result.consecutiveSubjects;
            delete result.receipt.result.consecutiveSubjects;
          }
          if (replyMode === "missing-lag") {
            delete result.config.googleBackupLagMinutes;
            delete result.receipt.result.config.googleBackupLagMinutes;
          }
          if (replyMode === "missing-drive") {
            delete result.config.driveBackup;
            delete result.receipt.result.config.driveBackup;
          }
          if (replyMode === "partial-drive") {
            delete result.config.driveDaily.auditFolderId;
            delete result.receipt.result.config.driveDaily.auditFolderId;
          }
          if (replyMode === "view-mismatch") {
            result.config.googleBackupLagMinutes++;
          }
          if (replyMode === "success") {
            loaded = clone(body);
          }
          return result;
        },
      };
      if (options.kind === "config")
        await RosterSettingsUI.render("System Config", ctx);
      else await RosterOpsUI.render("Manage Absence Type", ctx);
    },
    { kind, admin, subjects, revision, serial: ++serial },
  );
}
const configSave = () =>
  page.locator('[data-config-form] button[type="submit"]').click();
const saves = () =>
  page.evaluate(() =>
    calls.filter((row) =>
      ["saveSystemConfig", "saveTypes"].includes(row.operation),
    ),
  );
try {
  await test("no-baseline lag edit saves while retaining hidden PAL and allocation policy", async () => {
    await boot();
    const before = await page.evaluate(() => structuredClone(loaded.config));
    await page.locator("[data-backup-lag]").fill("11");
    await configSave();
    const writes = await saves();
    assert.equal(
      writes.length,
      1,
      JSON.stringify(
        await page.evaluate(() => ({
          calls,
          message: document.querySelector("[data-settings-message]")
            .textContent,
          hiddenError: document.querySelector("[data-consecutive-error]")
            .textContent,
        })),
      ),
    );
    await page.waitForFunction(
      () =>
        document.querySelector("[data-settings-message]")?.textContent ===
        "Changes saved.",
    );
    assert.equal(writes[0].googleBackupLagMinutes, 11);
    for (const key of [
      "allocationRuleEnabled",
      "allocationPreferences",
      "maxDailyPeriods",
      "maxConsecutivePeriods",
      "maxDailyReliefPeriods",
      "adhocReliefMaxPeriods",
      "consecutiveSubjectRules",
    ])
      assert.deepEqual(writes[0][key], before[key], key);
    assert.equal(
      await page.locator("[data-consecutive-rules]").isHidden(),
      true,
    );
    assert.equal(
      await page.locator("[data-consecutive-exclusions]").isVisible(),
      true,
    );
    assert.equal(await page.locator("[data-pending-request]").count(), 0);
    assert.equal(await page.evaluate(() => RosterSettingsUI.isDirty()), false);
  });
  await test("active exclusions and visible validation remain effective; hidden DOM changes ignored", async () => {
    await boot({ subjects: ["BLK", "PD (ART)", "Math"] });
    const before = await page.evaluate(() => structuredClone(loaded.config));
    const panel = page.locator("[data-consecutive-exclusions]");
    assert.equal(await panel.isVisible(), true);
    await panel.locator("[data-add-pattern]").click();
    assert.match(
      await page.locator("[data-settings-message]").innerText(),
      /Enter a wildcard pattern/,
    );
    assert.equal((await saves()).length, 0);
    await panel.locator("[data-rule-pattern]").fill("PD*");
    await panel.locator("[data-add-pattern]").click();
    await panel.locator('[data-subject="Math"]').check();
    assert.match(
      await panel.locator("[data-rule-preview]").innerText(),
      /PD \(ART\).*Math/s,
    );
    await page.evaluate(() => {
      const field = document.querySelector("[data-consecutive-periods]");
      field.value = "4";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector('[data-priority-down="0"]').click();
    });
    await page.locator('[data-smc-times="evening"]').fill("12:00");
    await configSave();
    assert.equal((await saves()).length, 0);
    assert.equal(await page.locator("#smc-times-error").isVisible(), true);
    assert.match(
      await page.locator("#smc-times-error").innerText(),
      /16:00|evening/i,
    );
    await page.locator('[data-smc-times="evening"]').fill("16:00");
    await configSave();
    await page.waitForFunction(
      () =>
        document.querySelector("[data-settings-message]")?.textContent ===
        "Changes saved.",
    );
    const [write] = await saves();
    assert.deepEqual(
      write.consecutiveSubjectRules,
      before.consecutiveSubjectRules,
    );
    assert.deepEqual(write.allocationPreferences, before.allocationPreferences);
    assert.ok(
      write.consecutiveCountExclusions.some(
        (x) => x.type === "wildcard" && x.value === "PD*",
      ),
    );
    assert.ok(
      write.consecutiveCountExclusions.some(
        (x) => x.type === "exact" && x.value === "Math",
      ),
    );
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(evidence, "settings-desktop.png") });
  });
  await test("malformed config confirmations visibly retain the exact original retry", async () => {
    for (const mode of [
      "missing-view",
      "missing-subjects",
      "missing-lag",
      "missing-drive",
      "partial-drive",
      "wrong-id",
      "wrong-request",
      "prepared",
      "bad-fence",
      "bad-digest",
      "wrong-revision",
      "wrong-receipt-revision",
      "view-mismatch",
    ]) {
      await boot();
      await page.evaluate((mode) => {
        replyMode = mode;
      }, mode);
      await page.locator("[data-backup-lag]").fill("11");
      await configSave();
      await page.locator("[data-pending-request]").waitFor();
      assert.equal(
        await page.locator("[data-settings-message]").getAttribute("role"),
        "alert",
      );
      assert.match(
        await page.locator("[data-settings-message]").innerText(),
        /confirm|same request/i,
      );
      assert.equal(await page.locator("[data-backup-lag]").inputValue(), "11");
      const first = (await saves())[0];
      await page.evaluate(() => {
        replyMode = "success";
      });
      await page.locator("[data-pending-request]").click();
      await page.waitForFunction(
        () =>
          document.querySelector("[data-settings-message]")?.textContent ===
          "Changes saved.",
      );
      assert.deepEqual((await saves())[1], first, mode);
      assert.equal(await page.locator("[data-pending-request]").count(), 0);
    }
  });
  await test("response loss and server validation/conflict keep the native draft", async () => {
    await boot();
    await page.evaluate(() => {
      replyMode = "loss";
    });
    await page.locator("[data-backup-lag]").fill("11");
    await configSave();
    await page.locator("[data-pending-request]").waitFor();
    const first = (await saves())[0];
    assert.equal(
      await page.locator("[data-settings-body]").evaluate((el) => el.inert),
      true,
    );
    await page.evaluate(() => {
      replyMode = "success";
    });
    await page.locator("[data-pending-request]").click();
    await page.waitForFunction(
      () =>
        document.querySelector("[data-settings-message]")?.textContent ===
        "Changes saved.",
    );
    assert.deepEqual((await saves())[1], first);
    for (const mode of ["validation", "conflict"]) {
      await boot();
      await page.evaluate((mode) => {
        replyMode = mode;
      }, mode);
      await page.locator("[data-backup-lag]").fill("12");
      await configSave();
      await page.waitForFunction(
        () =>
          document
            .querySelector("[data-settings-message]")
            ?.getAttribute("role") === "alert",
      );
      assert.equal(await page.locator("[data-backup-lag]").inputValue(), "12");
      assert.equal(await page.evaluate(() => RosterSettingsUI.isDirty()), true);
      assert.equal((await saves()).length, 1);
    }
  });
  await test("absence type reorder confirms full returned view and preserves detail fields", async () => {
    await boot({ kind: "types" });
    const before = await page.evaluate(() => structuredClone(loaded.types));
    await page.locator('[data-type-down="0"]').click();
    await page.locator("[data-save-types]").click();
    await page.waitForFunction(() =>
      document
        .querySelector("[data-ops-message]")
        ?.textContent.includes("Saved."),
    );
    assert.deepEqual((await saves())[0].types, [before[1], before[0]]);
    assert.deepEqual(
      await page
        .locator("[data-type-label]")
        .evaluateAll((nodes) => nodes.map((n) => n.value)),
      ["Second type", "First type"],
    );
    assert.equal(await page.locator("[data-retry-save]").count(), 0);
    await page.evaluate(async () => {
      RosterOpsUI.unmount();
      RosterOpsUI.resetPreloads();
      await RosterOpsUI.render("Manage Absence Type", ctx);
    });
    assert.deepEqual(
      await page
        .locator("[data-type-label]")
        .evaluateAll((nodes) => nodes.map((n) => n.value)),
      ["Second type", "First type"],
    );
  });
  await test("absence type malformed/lost confirmations retain original order and request", async () => {
    for (const mode of [
      "missing-view",
      "wrong-order",
      "wrong-id",
      "wrong-receipt-revision",
      "loss",
    ]) {
      await boot({ kind: "types" });
      await page.evaluate((mode) => {
        replyMode = mode;
      }, mode);
      await page.locator('[data-type-down="0"]').click();
      await page.locator("[data-save-types]").click();
      await page.locator("[data-retry-save]").waitFor();
      const first = (await saves())[0];
      assert.deepEqual(
        await page
          .locator("[data-type-label]")
          .evaluateAll((nodes) => nodes.map((n) => n.value)),
        ["Second type", "First type"],
      );
      await page.evaluate(() => {
        replyMode = "success";
      });
      await page.locator("[data-retry-save]").click();
      await page.waitForFunction(() =>
        document
          .querySelector("[data-ops-message]")
          ?.textContent.includes("Saved."),
      );
      assert.deepEqual((await saves())[1], first, mode);
      assert.equal(await page.locator("[data-type-label]").count(), 2);
    }
  });
  await test("stale type revision and preview denial remain visible without false confirmation", async () => {
    await boot({ kind: "types" });
    await page.evaluate(() => {
      replyMode = "conflict";
    });
    await page.locator('[data-type-down="0"]').click();
    await page.locator("[data-save-types]").click();
    await page.waitForFunction(() =>
      document
        .querySelector("[data-ops-message]")
        ?.textContent.includes("newer revision"),
    );
    assert.deepEqual(
      await page
        .locator("[data-type-label]")
        .evaluateAll((nodes) => nodes.map((n) => n.value)),
      ["Second type", "First type"],
    );
    assert.equal((await saves()).length, 1);
    assert.equal(await page.locator("[data-retry-save]").count(), 0);
    assert.doesNotMatch(
      await page.locator("[data-ops-message]").innerText(),
      /^Saved\./,
    );
    // The actual service suite proves preview authorization. This synthetic 403
    // checks only native presentation of that denial, not server enforcement.
    for (const kind of ["config", "types"]) {
      await boot({ kind });
      await page.evaluate(() => {
        replyMode = "preview-denied";
      });
      if (kind === "config") {
        await page.locator("[data-backup-lag]").fill("11");
        await configSave();
        await page.waitForFunction(() =>
          document
            .querySelector("[data-settings-message]")
            ?.textContent.includes("Preview is read-only"),
        );
      } else {
        await page.locator('[data-type-down="0"]').click();
        await page.locator("[data-save-types]").click();
        await page.waitForFunction(() =>
          document
            .querySelector("[data-ops-message]")
            ?.textContent.includes("Preview is read-only"),
        );
      }
      assert.equal((await saves()).length, 1);
      assert.equal(await page.evaluate(() => loaded.revision), 0);
      assert.equal(await page.locator("[data-pending-request]").count(), 0);
      assert.equal(await page.locator("[data-retry-save]").count(), 0);
    }
  });
  await test("SMC view-only controls and narrow active exclusions remain usable", async () => {
    await boot({ admin: false });
    assert.equal(
      await page
        .locator('[data-config-form] button[type="submit"]')
        .isDisabled(),
      true,
    );
    assert.match(
      await page.locator("[data-settings-message]").innerText(),
      /View only/,
    );
    await page.evaluate(() =>
      document
        .querySelector("[data-config-form]")
        .dispatchEvent(new Event("submit", { cancelable: true })),
    );
    assert.equal((await saves()).length, 0);
    const denied = await page.evaluate(async () => {
      try {
        await RosterOpsUI.render("Manage Absence Type", ctx);
        return false;
      } catch {
        return true;
      }
    });
    assert.equal(denied, true);
    await boot();
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = page.locator("[data-consecutive-exclusions]");
    await panel.scrollIntoViewIfNeeded();
    await panel.locator("[data-add-pattern]").click();
    assert.equal(
      await page.locator("[data-settings-message]").isVisible(),
      true,
    );
    const bounds = await panel.locator("[data-rule-pattern]").boundingBox();
    assert(
      bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390,
      "Narrow exclusion input stays within viewport",
    );
    await page.screenshot({ path: join(evidence, "settings-narrow.png") });
    await page.locator("[data-settings-message]").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(evidence, "settings-narrow-alert.png"),
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(egress, []);
  });
} finally {
  await context.unrouteAll({ behavior: "wait" });
  await browser.close();
  await rm(out, { recursive: true, force: true });
  const elapsedMs = Math.round(performance.now() - started);
  await writeFile(
    join(evidence, "results.json"),
    JSON.stringify(
      {
        groups: count,
        elapsedMs,
        transport:
          "Synthetic ctx.api; actual built native renderer and Chromium. No Worker/live outcome claim.",
        results,
        errors,
        egress,
      },
      null,
      2,
    ),
  );
  console.log(count + " Roster admin UI groups passed in " + elapsedMs + "ms");
}
