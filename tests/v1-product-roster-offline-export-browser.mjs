import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import {
  fixture,
  seedScenario,
  schoolId,
} from "./v1-product/roster-unblock-fixtures.mjs";

const f = await fixture();
try {
  const s = await seedScenario(f);
  let next = Date.parse(s.date) + 86400000;
  while ([0, 6].includes(new Date(next).getUTCDay())) next += 86400000;
  const date2 = new Date(next).toISOString().slice(0, 10);
  await f.call(f.admin, "roster", "/upload", {
    ...s.payload,
    operationId: "synthetic-offline-baseline",
  });
  await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-offline-planning",
    name: "Synthetic export planning",
    year: Number(s.date.slice(0, 4)),
    from: s.date,
    to: s.end,
  });
  for (const [index, date] of [s.date, date2].entries()) {
    const current = await f.call(f.admin, "roster", "/operations", {
      operation: "read",
      date,
      view: "allocation",
    });
    await f.call(f.admin, "roster", "/operations", {
      operation: "saveAbsence",
      date,
      revision: current.revision,
      operationId: "synthetic-offline-absence-" + index,
      staffId: s.staff[0],
      typeId: "mc",
      periods: [0],
      instructionsNA: true,
      reasonDetail: "PRIVATE_SYNTHETIC_REASON",
    });
  }
  const db = await f.db("roster");
  const savedAssignments = async () =>
    (
      await db
        .prepare(
          "SELECT * FROM roster_records WHERE school_id=? AND collection='assignments' ORDER BY record_id",
        )
        .bind(schoolId)
        .all()
    ).results;
  const before = await savedAssignments(),
    page = await f.pageFor(),
    errors = [],
    downloads = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("download", (file) => downloads.push(file));
  // Observe the real native editor through its public render entry. Fixture
  // variants below alter only its already-loaded local projection, never owner
  // responses, stored assignments or the implementation being tested.
  await page.evaluate(() => {
    const render = RosterOpsUI.render;
    RosterOpsUI.render = async function (...args) {
      const result = await render.apply(this, args);
      if (args[0] === "Assign Relief") window.__offlineExportSession = result;
      return result;
    };
  });
  let offline = false;
  const blocked = [];
  await page.route("**/*", (route) => {
    if (!offline) return route.fallback();
    blocked.push(route.request().url());
    return route.abort("internetdisconnected");
  });
  await page.getByRole("button", { name: /^Assign Relief/ }).click();
  async function selectDate(date) {
    await page.locator("[data-ops-date]").fill(date);
    await page.locator("[data-ops-date]").dispatchEvent("change");
    await page.waitForFunction((date) => {
      const state = window.__offlineExportSession;
      return (
        state?.date === date &&
        state.data?.date === date &&
        !state.reading &&
        !!state.data.exportContext &&
        !!document.querySelector("[data-relief-excel]")
      );
    }, date);
    await page.waitForFunction(
      () => !window.__offlineExportSession.exportLoading,
    );
  }
  await selectDate(s.date);
  await page.locator('[data-relief-period="0"]').click();
  await page
    .locator('.ops-assign-button[data-manual-select="' + s.staff[1] + '"]')
    .click();
  await page.waitForFunction(
    (id) =>
      window.__offlineExportSession.data.allocationModel.assignments.some(
        (a) => a.staffId === id && a.pending,
      ),
    s.staff[1],
  );
  assert.deepEqual(
    await savedAssignments(),
    before,
    "the visible manual assignment is still unsaved",
  );
  // Controlled compact-patch shape: the local allocation revision is newer
  // than a complete plan for the same exact timetable. The optional comparison
  // baseline is unavailable. A click must not try to fetch it.
  await page.evaluate(() => {
    const state = window.__offlineExportSession;
    state.data.exportContext.revision = state.data.revision - 1;
    window.__firstDateExportContext = structuredClone(state.data.exportContext);
    state.exportBaseline = null;
    state.ctx.cachedTimetable = () => null;
    window.__offlineExportCalls = [];
    const api = state.ctx.api,
      timetable = state.ctx.localTimetable;
    state.ctx.api = (...args) => {
      __offlineExportCalls.push(["api", args[0]]);
      return api(...args);
    };
    state.ctx.localTimetable = (...args) => {
      __offlineExportCalls.push(["timetable", args[0]]);
      return timetable(...args);
    };
  });
  const localDate = (date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Singapore",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(date + "T12:00:00+08:00"));
  async function exportAll(
    date,
    { unsaved = false, excludeReliever = false, captureBlobs = false } = {},
  ) {
    const apiBefore = f.requests.length,
      blockedBefore = blocked.length;
    const callsBefore = await page.evaluate(() => __offlineExportCalls.length);
    offline = true;
    await page.context().setOffline(true);
    const results = [];
    for (const selector of [
      "[data-daily-excel]",
      "[data-relief-excel]",
      "[data-class-excel]",
    ]) {
      const capturedBefore = captureBlobs
        ? await page.evaluate(() => __offlineWorkbookCapture.blobs.length)
        : null;
      const pending = captureBlobs
        ? null
        : page.waitForEvent("download", { timeout: 3500 });
      await page.locator(selector).click();
      let bytes;
      if (captureBlobs) {
        await page.waitForFunction(
          (before) => __offlineWorkbookCapture.blobs.length === before + 1,
          capturedBefore,
          { timeout: 3500 },
        );
        bytes = Buffer.from(
          await page.evaluate(async (index) => {
            const blob = __offlineWorkbookCapture.blobs[index];
            return Array.from(new Uint8Array(await blob.arrayBuffer()));
          }, capturedBefore),
        );
      } else {
        let file;
        try {
          file = await pending;
        } catch (error) {
          throw Error(
            "No local workbook for " +
              selector +
              " after " +
              downloads.length +
              " downloads: " +
              (await page.locator("[data-ops-message]").innerText()),
            { cause: error },
          );
        }
        assert.match(file.suggestedFilename(), /\.xlsx$/);
        bytes = await readFile(await file.path());
      }
      const zip = await JSZip.loadAsync(bytes);
      const xml = (
        await Promise.all(
          Object.values(zip.files)
            .filter(
              (item) =>
                !item.dir && /^xl\/worksheets\/sheet\d+\.xml$/.test(item.name),
            )
            .map((item) => item.async("string")),
        )
      ).join("\n");
      assert(
        xml.includes(localDate(date)),
        "every workbook labels the selected date",
      );
      assert.match(xml, /Local snapshot/);
      assert.match(
        xml,
        /Estimated workload/,
        "the existing v1 workload warning is preserved",
      );
      assert.doesNotMatch(
        xml,
        /PRIVATE_SYNTHETIC_REASON|PRIVATE_SYNTHETIC_INSTRUCTION/,
      );
      if (unsaved) {
        assert.match(xml, /Local changes not saved/);
        assert.match(
          xml,
          /Synthetic Teacher B/,
          "the unsaved manual reliever must appear",
        );
        if (selector !== "[data-relief-excel]")
          assert.match(
            xml,
            /\(for Synthetic Teacher A\)/,
            "teacher and class sheets contain the actual relief-for cell, not merely the free teacher's baseline row",
          );
      }
      if (excludeReliever)
        assert.doesNotMatch(
          xml,
          /\(for Synthetic Teacher A\)/,
          "no second-date workbook may reuse the first date's relief-for cell",
        );
      results.push(xml);
    }
    assert.equal(
      blocked.length,
      blockedBefore,
      "all three export clicks must start zero network requests",
    );
    assert.equal(
      f.requests.length,
      apiBefore,
      "no export API request reaches the actual Workers",
    );
    assert.equal(
      await page.evaluate(() => __offlineExportCalls.length),
      callsBefore,
      "exports must not call the API or the optional timetable loader",
    );
    if (excludeReliever)
      assert.doesNotMatch(
        results[1],
        /Synthetic Teacher B/,
        "the second date's relief-only sheet must not inherit the first date's unsaved assignment",
      );
    return results;
  }
  await exportAll(s.date, { unsaved: true });
  console.log(
    "PASS 1/6: all three real XLSX files contain the unsaved selected-day edit despite context revision mismatch; zero export requests",
  );

  await page.evaluate(() => {
    delete window.__offlineExportSession.data.exportContext;
  });
  await exportAll(s.date, { unsaved: true });
  console.log(
    "PASS 2/6: absent export context rebuilds from complete loaded cells, retaining privacy and estimated-workload labels",
  );

  offline = false;
  await page.context().setOffline(false);
  await selectDate(date2);
  await page.evaluate(() => {
    window.__secondDateExportData = structuredClone(
      window.__offlineExportSession.data,
    );
    // A complete older plan from another selected date is not usable evidence
    // for this day, even though both days belong to the same baseline.
    window.__offlineExportSession.data.exportContext =
      window.__firstDateExportContext;
  });
  await exportAll(date2, { excludeReliever: true });
  assert.deepEqual(await savedAssignments(), before);
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM roster_publications WHERE school_id=?")
        .bind(schoolId)
        .first()
    ).n,
    0,
  );
  console.log(
    "PASS 3/6: actual date change rejects the wrong-date cached plan and exports its own state without leaking the other draft",
  );

  const missingMessage = await page.evaluate(() => {
    const state = window.__offlineExportSession;
    delete state.data.exportContext;
    state.ctx.cachedTimetable = () => null;
    state.ctx.timetablePreload = null;
    const id = state.data.timetable.teachers[0].staffId;
    delete state.data.timetable.teachers[0].cells;
    const model = state.data.allocationModel.teachers.find((t) => t.id === id);
    if (model?.t) delete model.t.cells;
    const teacher = state.data.timetable.teachers[0];
    const period = (state.data.timetable.periods || state.data.periods)[0]
      .period;
    return `The local timetable for ${state.date} is missing P${period} for ${teacher.name || teacher.staffId}.`;
  });
  const priorDownloads = downloads.length,
    priorBlocked = blocked.length;
  for (const selector of [
    "[data-daily-excel]",
    "[data-relief-excel]",
    "[data-class-excel]",
  ]) {
    await page.evaluate(() =>
      document.querySelector("[data-ops-message]").replaceChildren(),
    );
    await page.locator(selector).click();
    await page.waitForFunction(
      (message) =>
        document
          .querySelector("[data-ops-message]")
          ?.textContent.includes(message),
      missingMessage,
    );
    assert(
      (await page.locator("[data-ops-message]").innerText()).includes(
        missingMessage,
      ),
      "the refusal identifies the exact selected date, teacher and missing period",
    );
  }
  assert.equal(
    downloads.length,
    priorDownloads,
    "incomplete local periods must not become an empty/free workbook",
  );
  assert.equal(blocked.length, priorBlocked);
  assert.deepEqual(await savedAssignments(), before);
  assert.deepEqual(errors, []);
  console.log(
    "PASS 4/6: all three exports explicitly refuse incomplete current cells with no file, network request or owner write",
  );

  // This is a declared synthetic local confirmed-plan projection built from the
  // real owner's loaded date/identities. It tests export fidelity, not the
  // separate save/confirm or provider workflows. Recess is not recoverable from
  // teacher cells alone, and the changed-lesson rows require the immutable plan.
  await page.evaluate(([originalTeacher, movedTeacher]) => {
    const state = window.__offlineExportSession;
    const data = structuredClone(window.__secondDateExportData);
    const day = structuredClone(data.timetable);
    day.date = data.date;
    day.periods = structuredClone(data.periods);
    day.endOfDayMinutes = day.periods.at(-1).endMinutes;
    day.formClasses = [
      {
        id: "synthetic-recess-class",
        name: "1S",
        level: 1,
        traditional: true,
        venue: "Synthetic Room A",
      },
    ];
    day.recesses = [
      {
        level: 1,
        period: day.periods[1].period,
        startMinutes: day.periods[1].startMinutes,
        endMinutes: day.periods[1].endMinutes,
      },
    ];
    day.teachers = day.teachers.map((teacher) => ({
      ...teacher,
      cells: Array.from({ length: day.periods.at(-1).period + 1 }, () => [
        "",
        "",
        "",
        "",
      ]),
    }));
    day.teachers.find((teacher) => teacher.staffId === originalTeacher).cells[
      day.periods[0].period
    ] = ["SYNTHETIC_MOVED_LESSON", "1S", "Synthetic Room A", ""];
    let plan = GSISRosterStapler.create(day);
    plan = GSISRosterStapler.apply(plan, {
      type: "move",
      tileId: plan.tiles.find((tile) => tile.kind === "lesson").id,
      teacherId: movedTeacher,
      period: day.periods[0].period,
    });
    plan.revision = 7;
    plan.status = "confirmed";
    GSISRosterStapler.validate(plan);
    const effective = GSISRosterStapler.effectiveDay(plan);
    const teacherById = new Map(
      effective.teachers.map((teacher) => [teacher.staffId, teacher]),
    );
    state.data = {
      ...data,
      timetable: effective,
      periods: effective.periods,
      absences: [],
      ownAbsences: [],
      demands: [],
      assignments: [],
      adhoc: [],
      allocationModel: {
        ...data.allocationModel,
        date: data.date,
        assignments: [],
        teachers: data.allocationModel.teachers.map((teacher) => ({
          ...teacher,
          t: teacherById.get(teacher.id),
        })),
      },
    };
    delete state.data.exportContext;
    state.exportBaseline = null;
    state.ctx.cachedTimetable = () => null;
    state.ctx.timetablePreload = {
      getPlan: (date) =>
        date === data.date
          ? {
              date,
              plan,
              confirmedPlan: plan,
              revision: 7,
              confirmedRevision: 7,
              viewMode: "confirmed",
              timetableDay: { source: "confirmed" },
            }
          : null,
      getEffectiveDay: (date) => (date === data.date ? effective : null),
    };
  }, s.staff);
  assert.equal(
    downloads.length,
    9,
    "the first three groups use nine real downloads",
  );
  // Locked Chromium lost a download event after ten files despite UI success.
  // The synthetic plan case clicks the real buttons and parses their XLSX Blobs;
  // only this group's final generated download-anchor handoff is intercepted.
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    const state = { blobs: [], urls: new Set(), filenames: [] };
    URL.createObjectURL = function (blob) {
      const url = original.call(this, blob);
      state.blobs.push(blob);
      state.urls.add(url);
      return url;
    };
    // The exporters click detached anchors, so their prototype entry is the
    // narrow observation point; unrelated anchors keep their native behavior.
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (state.urls.has(this.href) && this.hasAttribute("download")) {
        state.filenames.push(this.download);
        return;
      }
      return click.call(this);
    };
    state.restore = () => {
      URL.createObjectURL = original;
      HTMLAnchorElement.prototype.click = click;
    };
    window.__offlineWorkbookCapture = state;
  });
  let staplerBooks;
  try {
    staplerBooks = await exportAll(date2, { captureBlobs: true });
    const captured = await page.evaluate(() => ({
      count: __offlineWorkbookCapture.blobs.length,
      filenames: __offlineWorkbookCapture.filenames,
    }));
    assert.equal(captured.count, 3);
    assert.equal(captured.filenames.length, 3);
    captured.filenames.forEach((name) => assert.match(name, /\.xlsx$/));
    assert.equal(downloads.length, 9);
  } finally {
    await page.evaluate(() => __offlineWorkbookCapture.restore());
  }
  for (const xml of staplerBooks) assert.match(xml, /SYNTHETIC_MOVED_LESSON/);
  assert.match(
    staplerBooks[1],
    /Suspended \/ available/,
    "the relief sheet regenerates changed-lesson rows from the exact plan",
  );
  assert.match(
    staplerBooks[2],
    /Recess/,
    "Class POV retains the non-lesson recess tile",
  );
  assert.match(
    staplerBooks[2],
    /Synthetic Teacher B/,
    "Class POV uses the moved lesson's current teacher",
  );
  assert.deepEqual(await savedAssignments(), before);
  console.log(
    "PASS 5/6: synthetic confirmed-plan cache preserves moved lessons, change rows and class recess in three button-generated XLSX Blobs",
  );

  await page.evaluate(() => {
    window.__offlineExportSession.ctx.timetablePreload.getPlan = () => null;
    const original = URL.createObjectURL;
    window.__missingPlanBlobCount = 0;
    URL.createObjectURL = function (blob) {
      __missingPlanBlobCount++;
      return original.call(this, blob);
    };
    window.__restoreMissingPlanBlobSpy = () => {
      URL.createObjectURL = original;
    };
  });
  const missingPlan = `The confirmed local Stapler plan for ${date2} (revision 7) is missing.`;
  const beforeMissingPlan = downloads.length,
    beforeMissingRequests = blocked.length;
  try {
    for (const selector of [
      "[data-daily-excel]",
      "[data-relief-excel]",
      "[data-class-excel]",
    ]) {
      await page.evaluate(() =>
        document.querySelector("[data-ops-message]").replaceChildren(),
      );
      await page.locator(selector).click();
      await page.waitForFunction(
        (message) =>
          document
            .querySelector("[data-ops-message]")
            ?.textContent.includes(message),
        missingPlan,
      );
    }
    assert.equal(
      downloads.length,
      beforeMissingPlan,
      "teacher cells cannot substitute for a missing confirmed plan",
    );
    assert.equal(blocked.length, beforeMissingRequests);
    assert.equal(await page.evaluate(() => __missingPlanBlobCount), 0);
  } finally {
    await page.evaluate(() => __restoreMissingPlanBlobSpy());
  }
  assert.deepEqual(await savedAssignments(), before);
  assert.deepEqual(errors, []);
  console.log(
    "PASS 6/6: unavailable confirmed-plan evidence explicitly refuses all three files without fetching or writing",
  );
} finally {
  await f.close();
}
