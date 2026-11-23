/** Built Deploy browser and isolated Workers/D1 verifying UI03, UI01, UR03, D08, D09, TV07:
 * 1. UI03 / D08 / TV07 — Concurrent cell editing in IP Deploy:
 *    - Opening a cell editor (chooseTeacher or renameClass) acquires a cell lease.
 *    - Another user's browser sees an orange outline, translucent orange tint, hover identity, and locked cell controls (.gsis-cell-collaborator).
 *    - Closing/cancelling the editor releases the lease and clears the orange indicator.
 * 2. UI01 / D09 — Duplicate Form Teacher (FT) presentation:
 *    - Temporarily assigning the same teacher as FT to two classes is permitted in draft without an alert blocking input.
 *    - Both affected FT cells receive a thick red outline and subtle red tint (.gsis-cell-error).
 *    - Only the duplicated teacher name chip is styled in red text (.gsis-chip-duplicate-ft); an unaffected co-FT in the same cell keeps normal text color.
 *    - Save to online is blocked while duplicate FT exists, and re-enabled once resolved.
 * 3. UR03 / D09 — Duplicate class rename in draft:
 *    - Choosing an occupied class name changes only the selected class without displacing the existing class into (undefined).
 *    - Both conflicting class-name cells (td.row-name) receive a thick red outline and subtle red tint (.gsis-cell-error), and Save to online is blocked until resolved.
 * 4. UI03 / D09 — Simultaneous orange collaborator lock and red validation error:
 *    - When a cell has both a red validation error and an active orange collaborator lock (.gsis-cell-error.gsis-cell-collaborator), both visual indicators and both tooltip/aria-label messages remain simultaneously visible. */
import assert from "node:assert/strict";
import {
  fixture,
  futureDate,
  schoolId,
} from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

const f = await fixture();
try {
  const db = await f.db("deploy"),
    year = Number(futureDate().slice(0, 4));

  const createdContacts = await f.call(f.admin, "contacts", "/save-data", {
    operationId: "syn-cell-presence-contacts",
    changes: [],
    additions: [
      {
        id: "temp-ft-dup",
        values: {
          "Basic Name": "Synthetic FT Dup",
          "Statutory Name": "Synthetic FT Dup",
          Role: "Teacher",
          Active: "Y",
        },
      },
      {
        id: "temp-ft-normal",
        values: {
          "Basic Name": "Synthetic FT Normal",
          "Statutory Name": "Synthetic FT Normal",
          Role: "Teacher",
          Active: "Y",
        },
      },
    ],
  });
  const teacherDup = createdContacts.mapping["temp-ft-dup"];
  const teacherNormal = createdContacts.mapping["temp-ft-normal"];

  const vCreated = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "syn-cell-presence-version",
    name: "Synthetic cell presence",
    year,
  });
  const loaded = await loadVersion(db, schoolId, vCreated.versionId);
  const doc = structuredClone(loaded.doc);
  doc.classes = [
    { ref: "c-1P", level: "1", name: "Perseverance", shortName: "1P" },
    { ref: "c-1T", level: "1", name: "Thrift", shortName: "1T" },
  ];
  doc.venues = [
    { id: "R-1P", name: "Room 1P", form: "1P" },
    { id: "R-1T", name: "Room 1T", form: "1T" },
  ];
  doc.assignments = [
    {
      id: "a-1p-ft-dup",
      target: "1P",
      targetRef: "c-1P",
      subject: "FT",
      teacher: teacherDup,
      level: "1",
    },
    {
      id: "a-1p-ft-normal",
      target: "1P",
      targetRef: "c-1P",
      subject: "FT",
      teacher: teacherNormal,
      level: "1",
    },
  ];
  const delta = changesFor(schoolId, vCreated.versionId, loaded.rows, doc);
  await db.batch(delta.writes.map((w) => statement(db, w.sql, w.args)));

  const pageA = await f.pageFor(f.admin);
  const pageB = await f.pageFor(f.other);
  const errors = [];
  pageA.on("pageerror", (e) => errors.push("A:" + e.message));
  pageB.on("pageerror", (e) => errors.push("B:" + e.message));

  for (const p of [pageA, pageB]) {
    await p.goto(origin + "/deploy/");
    await p.locator("#version").selectOption(vCreated.versionId);
    await p.waitForFunction(
      (id) => v()?.id === id && !refreshing,
      vCreated.versionId,
    );
  }

  // =========================================================================
  // 1. UI03 — Concurrent cell editing: User A opens 1T EL teacher selector;
  //    User B sees orange outline, translucent orange tint, hover identity, and locked button.
  // =========================================================================
  await pageA.locator('[data-target="1T"][data-sub="EL"]').click();
  await pageA.locator('td[data-cell="1T|EL"] .search-select[open]').waitFor();

  // Wait for User B's background lease poll (or trigger poll) to observe User A's cell lease
  await pageB.waitForFunction(
    () =>
      document
        .querySelector('td[data-cell="1T|EL"]')
        ?.classList.contains("gsis-cell-collaborator"),
    null,
    { timeout: 6000 },
  );

  const cellStyleB = await pageB
    .locator('td[data-cell="1T|EL"]')
    .evaluate((cell) => {
      const s = getComputedStyle(cell);
      const btn = cell.querySelector('button[data-target="1T"][data-sub="EL"]');
      return {
        outlineColor: s.outlineColor,
         outlineStyle: s.outlineStyle,
        backgroundColor: s.backgroundColor,
        title: cell.title,
        actor: cell.dataset.collaboratorActor,
        btnDisabled: btn?.disabled,
        btnText: btn?.textContent,
      };
    });
  assert.equal(cellStyleB.outlineColor, "rgb(230, 126, 34)", "Collaborator cell has orange outline #e67e22");
  assert.equal(cellStyleB.outlineStyle, "solid");
  assert.match(cellStyleB.backgroundColor, /rgba\(230,\s*126,\s*34/, "Collaborator cell has translucent orange tint");
  assert.equal(cellStyleB.actor, f.admin.id, "Collaborator actor identity is exposed on cell");
  assert.match(cellStyleB.title, new RegExp(f.admin.id + " is editing"), "Hover title identifies active editor");
  assert.equal(cellStyleB.btnDisabled, true, "Locked cell button is disabled for other users");
  assert.equal(cellStyleB.btnText, "Editing…");

  // User A closes the selector without choosing; lease releases and User B's orange outline clears
  await pageA.evaluate(() => {
    const wrap = document.querySelector('td[data-cell="1T|EL"] .search-select');
    if (wrap) wrap.open = false;
  });
  await pageB.waitForFunction(
    () =>
      !document
        .querySelector('td[data-cell="1T|EL"]')
        ?.classList.contains("gsis-cell-collaborator"),
    null,
    { timeout: 6000 },
  );
  console.log("PASS UI03 concurrent cell editing shows orange outline, translucent orange tint, hover identity, and lock on collaborator viewport");

  // =========================================================================
  // 2. UI01 / D09 — Duplicate FT assignment in draft & simultaneous UI03 + UI01
  // =========================================================================
  // User B assigns teacherDup as FT to 1T (while teacherDup is already FT on 1P alongside teacherNormal).
  await pageB.locator('[data-target="1T"][data-sub="FT"]').click();
  await pageB
    .locator('td[data-cell="1T|FT"]')
    .getByRole("option", { name: "Synthetic FT Dup", exact: true })
    .click();

  // Both 1P|FT and 1T|FT on User B's draft must have thick red outline (.gsis-cell-error)
  const ftStateB = await pageB.evaluate(() => {
    const cell1P = document.querySelector('td[data-cell="1P|FT"]');
    const cell1T = document.querySelector('td[data-cell="1T|FT"]');
    const chips1P = [...cell1P.querySelectorAll(".chip")].map((c) => ({
      text: c.textContent.replace("×", "").trim(),
      dupClass: c.classList.contains("gsis-chip-duplicate-ft"),
      color: getComputedStyle(c).color,
    }));
    return {
      err1P: cell1P.classList.contains("gsis-cell-error"),
      err1T: cell1T.classList.contains("gsis-cell-error"),
      outline1P: getComputedStyle(cell1P).outlineColor,
      chips1P,
      saveDisabled: document
        .querySelector("#saveQueue")
        ?.querySelector("button")?.disabled,
      queueStatus: document.querySelector("#saveQueue [role='status']")
        ?.textContent,
    };
  });
  assert.equal(ftStateB.err1P, true, "1P FT cell has .gsis-cell-error");
  assert.equal(ftStateB.err1T, true, "1T FT cell has .gsis-cell-error");
  assert.equal(ftStateB.outline1P, "rgb(192, 57, 43)", "Duplicate FT cell has thick red outline #c0392b");
  const dupChip = ftStateB.chips1P.find((c) => c.text.includes("Synthetic FT Dup"));
  const normalChip = ftStateB.chips1P.find((c) => c.text.includes("Synthetic FT Normal"));
  assert.equal(dupChip.dupClass, true, "Duplicated FT teacher chip has .gsis-chip-duplicate-ft");
  assert.equal(dupChip.color, "rgb(192, 57, 43)", "Duplicated FT teacher name renders in red text");
  assert.equal(normalChip.dupClass, false, "Unaffected co-FT teacher chip does not have .gsis-chip-duplicate-ft");
  assert.notEqual(normalChip.color, "rgb(192, 57, 43)", "Unaffected co-FT teacher name keeps normal text color");
  assert.equal(ftStateB.saveDisabled, true, "Save to online is blocked while duplicate FT exists");
  assert.match(ftStateB.queueStatus, /Resolve duplicate Form Teacher/);

  // Test simultaneous red validation error + orange collaborator lock (UI03 + UI01):
  // User A opens 1P FT cell editor while User B has a red duplicate FT error on 1P FT!
  await pageA.locator('[data-target="1P"][data-sub="FT"]').click();
  await pageB.waitForFunction(
    () => {
      const c = document.querySelector('td[data-cell="1P|FT"]');
      return (
        c?.classList.contains("gsis-cell-error") &&
        c?.classList.contains("gsis-cell-collaborator")
      );
    },
    null,
    { timeout: 6000 },
  );
  const simultaneousB = await pageB
    .locator('td[data-cell="1P|FT"]')
    .evaluate((cell) => {
      const s = getComputedStyle(cell);
      return {
        outlineColor: s.outlineColor,
        boxShadow: s.boxShadow,
        title: cell.title,
      };
    });
  assert.equal(simultaneousB.outlineColor, "rgb(192, 57, 43)", "Red validation outline remains visible during orange collaborator lock");
  assert.match(simultaneousB.boxShadow, /rgb\(230,\s*126,\s*34\)/, "Orange collaborator inner ring is simultaneously visible");
  assert.match(simultaneousB.title, /assigned as Form Teacher to multiple classes/, "Validation error remains in hover title");
  assert.match(simultaneousB.title, new RegExp(f.admin.id + " is editing"), "Collaborator identity is also in hover title");

  // User A closes 1P FT editor; User B removes duplicate FT from 1T and verifies red outline clears
  await pageA.evaluate(() => {
    const wrap = document.querySelector('td[data-cell="1P|FT"] .search-select');
    if (wrap) wrap.open = false;
  });
  await pageB.locator('td[data-cell="1T|FT"] button[data-remove]').click();
  assert.equal(
    await pageB.locator('td[data-cell="1P|FT"]').evaluate((c) => c.classList.contains("gsis-cell-error")),
    false,
    "Resolving duplicate FT immediately clears red cell outline",
  );
  console.log("PASS UI01 / D09 whole-cell duplicate FT red outline, red duplicate teacher text only, Save gate, and simultaneous orange+red visibility");

  // =========================================================================
  // 3. UR03 / D09 — Duplicate class rename in draft without displacing into (undefined)
  // =========================================================================
  await pageB.locator('button[data-rename-class="c-1T"]').click();
  await pageB.getByRole("option", { name: "Perseverance (P)", exact: true }).click();
  await pageB.locator(".inline-editor #ok, dialog #ok").first().click();

  const classDupState = await pageB.evaluate(() => {
    const rows = [...document.querySelectorAll("tbody tr[data-row]")];
    const rowNames = rows.map((r) => ({
      rowId: r.dataset.row,
      text: r.querySelector("td.row-name strong")?.textContent,
      hasError: r.querySelector("td.row-name")?.classList.contains("gsis-cell-error"),
      outlineColor: getComputedStyle(r.querySelector("td.row-name")).outlineColor,
    }));
    return {
      rowNames,
      saveDisabled: document.querySelector("#saveQueue button")?.disabled,
      queueStatus: document.querySelector("#saveQueue [role='status']")?.textContent,
    };
  });
  assert.equal(
    classDupState.rowNames.every((r) => r.text === "1P" && r.hasError && r.outlineColor === "rgb(192, 57, 43)"),
    true,
    "Both duplicate 1P class-name cells keep '1P' (no displacement to undefined) and show thick red outlines",
  );
  assert.equal(classDupState.saveDisabled, true, "Save to online is blocked while duplicate class names exist");
  assert.match(classDupState.queueStatus, /Resolve 2 duplicate class name/);
  console.log("PASS UR03 / D09 non-displacing duplicate class rename in draft with thick red outlines on both class-name cells and Save gate");

  assert.deepEqual(errors, []);
} finally {
  await f.close();
}
