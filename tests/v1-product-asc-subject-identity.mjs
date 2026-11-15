/** Built v1 ASC subject identity and local XML download. Synthetic data only;
 * structural/semantic checks do not claim installed-aSc import acceptance. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { buildWeb } from "../scripts/v1/build-web.mjs";

const output = await mkdtemp(join(tmpdir(), "gsis-asc-subject-"));
const origin = "https://asc-subject.example.invalid";
const key = (subject) => JSON.stringify(["5", subject]);
const eventKey = (subject, kind = "class", target = "class-a") =>
  JSON.stringify([kind, target, subject]);
const split = (count = 3) => ({ enabled: false, ws: 0, wd: count, wt: 0 });
function fixture(subject = "Science", loadSubject = subject) {
  return {
    id: "synthetic-asc",
    name: "Synthetic & planning",
    year: 2027,
    revision: 7,
    status: "draft",
    publication: "Saved draft",
    teachers: [{ id: "staff-a", name: "Synthetic <A>", active: true }],
    classes: [{ ref: "class-a", level: "5", shortName: "A", name: "Alpha" }],
    venues: [],
    groups: [],
    assignments: [
      {
        id: "assignment-a",
        teacher: "staff-a",
        subject,
        target: "5A",
        targetRef: "class-a",
        level: "5",
      },
    ],
    loads: { 5: { [loadSubject]: 6 } },
    fortnight: { [key(loadSubject)]: split() },
    organisations: { plt: [] },
    duties: [],
    workload: {},
  };
}
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
    "suppress only sign-in startup",
  );
  const legacy = await readFile(
    new URL("../shared/asc-export.js", import.meta.url),
    "utf8",
  );
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
    unexpected = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      unexpected.push(url.href);
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
      unexpected.push(url.pathname);
      return route.fulfill({ status: 404, body: "" });
    }
  });
  await page.goto(origin + "/deploy/");
  await page.evaluate(() => {
    window.__api = [];
    window.GSISV1 = {
      capable: () => true,
      fetch: (...args) => {
        window.__api.push(args);
        throw Error("ASC must remain local");
      },
    };
  });
  await page.addScriptTag({
    content: built.replace("controls();startSignIn();", ""),
  });
  await page.evaluate((source) => {
    window.__legacyAsc = new Function(source + ";return GSISAscExport;")();
  }, legacy);
  const run = (doc, settings = {}, old = false) =>
    page.evaluate(
      ({ doc, settings, old }) => {
        const api = old ? window.__legacyAsc : GSISAscExport,
          s = { ...api.defaults(doc), ...settings },
          before = JSON.stringify([doc, s]);
        const result = api.buildAscExport(doc, s);
        if (JSON.stringify([doc, s]) !== before)
          throw Error("Export mutated the input snapshot or saved mappings");
        if (api.buildAscExport(doc, s).xml !== result.xml)
          throw Error("Repeated export is not deterministic");
        return result;
      },
      { doc, settings, old },
    );
  const allowed = (p) => {
    assert.deepEqual(p.blockers, []);
    assert.ok(p.xml.startsWith("<?xml"));
    assert.equal(p.provenance.applicationTested, false);
  };
  const blocked = (p, label) => {
    assert.equal(p.xml, "", label);
    assert.ok(p.blockers.length, label);
    assert.ok(
      p.blockers.every((b) => b.field && b.message),
      "blockers must be visible, actionable records",
    );
  };
  let p = await run(fixture());
  assert.deepEqual(
    p.events.map((e) => e.subject),
    ["Science"],
    "exact Science identity must survive load and block lookup",
  );
  allowed(p);
  assert.equal(p.entityCounts.subjects, 1);
  assert.equal(p.events[0].load, 6);
  assert.deepEqual(p.events[0].blocks, [{ length: 2, count: 3, week: "all" }]);
  assert.equal(p.weeklyAndCycleTotals.eventWeekly, 6);
  assert.equal(p.model.lessons.length, 1);
  console.log(
    "PASS ASC exact Science identity, six periods and three weekly double blocks.",
  );

  for (const [source, load] of [
    ["Science", "Science"],
    ["Sci", "Sci"],
    ["PE", "PE"],
    ["PHE", "PHE"],
    ["Science", "Sci"],
    ["Sci", "Science"],
    ["PE", "PHE"],
    ["PHE", "PE"],
  ]) {
    const d = fixture(source, load),
      result = await run(d);
    allowed(result);
    assert.equal(result.events[0].subject, load);
    assert.equal(result.events[0].load, 6);
    assert.equal(result.entityCounts.subjects, 1);
    assert.equal(result.weeklyAndCycleTotals.eventWeekly, 6);
    if (["Sci", "PHE"].includes(load))
      assert.equal(
        result.xml,
        (await run(d, {}, true)).xml,
        "already-valid legacy export and all IDs remain byte-for-byte identical",
      );
  }
  const unrelated = fixture("Science");
  unrelated.loads[5].SCi = 4;
  p = await run(unrelated);
  allowed(p);
  assert.equal(p.events[0].subject, "Science");
  assert.equal(
    p.entityCounts.subjects,
    2,
    "unrelated case-sensitive identities are not collapsed",
  );
  console.log(
    "PASS ASC exact/fallback Science/Sci and PE/PHE, legacy byte identity and unrelated subjects.",
  );

  for (const value of [undefined, null, -1, "6", 0]) {
    const d = fixture();
    d.loads[5].Sci = 6;
    if (value === undefined) delete d.loads[5].Science;
    else d.loads[5].Science = value;
    p = await run(d);
    if (value === undefined) {
      allowed(p);
      assert.equal(p.events[0].subject, "Sci");
    } else
      blocked(
        p,
        "conflicting exact source must not be replaced by alias demand: " +
          String(value),
      );
  }
  const zero = fixture();
  zero.loads[5].Science = 0;
  zero.fortnight[key("Science")] = split(0);
  p = await run(zero);
  allowed(p);
  assert.equal(p.events.length, 0);
  assert.equal(
    p.entityCounts.lessons,
    0,
    "zero demand does not invent lessons",
  );
  const absent = fixture();
  absent.loads = { 5: {} };
  blocked(await run(absent), "missing demand must block");
  const missingSplit = fixture();
  missingSplit.fortnight = {};
  blocked(await run(missingSplit), "missing split must not default to singles");
  const badSplit = fixture();
  badSplit.fortnight[key("Science")] = split(2);
  blocked(await run(badSplit), "split totals must reconcile");
  const conflict = fixture();
  conflict.loads[5].Sci = 8;
  blocked(await run(conflict), "conflicting paired load definitions");
  const same = fixture();
  same.loads[5].Sci = 6;
  allowed(await run(same));
  same.assignments.push({
    ...same.assignments[0],
    id: "assignment-b",
    subject: "Sci",
  });
  blocked(
    await run(same),
    "same target plus both alias subjects must not double demand",
  );
  const collapsed = fixture("Science", "Sci");
  collapsed.assignments.push({
    ...collapsed.assignments[0],
    id: "assignment-b",
    subject: "Sci",
  });
  blocked(
    await run(collapsed),
    "raw mixed aliases on the same target cannot silently merge after fallback",
  );
  const coTeachers = fixture("Science", "Sci");
  coTeachers.teachers.push({ id: "staff-b", name: "Synthetic B" });
  coTeachers.assignments.push({
    ...coTeachers.assignments[0],
    id: "assignment-b",
    teacher: "staff-b",
  });
  p = await run(coTeachers);
  allowed(p);
  assert.equal(p.events.length, 1);
  assert.equal(p.weeklyAndCycleTotals.eventWeekly, 6);
  assert.equal(
    p.weeklyAndCycleTotals.teacherWeekly,
    12,
    "same-source co-teachers share pupil demand",
  );
  p = await run(fixture("Science", "Sci"), { includeUnassigned: true });
  allowed(p);
  assert.equal(
    p.events.length,
    1,
    "generated unassigned demand does not create an explicit alias conflict",
  );
  console.log(
    "PASS ASC absent/zero/invalid/conflicting loads, missing splits and duplicate alias demand.",
  );

  for (const [exact, paired] of [
    ["Science", "Sci"],
    ["PE", "PHE"],
  ]) {
    const d = fixture(exact);
    d.fortnight = { [key(paired)]: split() };
    p = await run(d);
    allowed(p);
    assert.equal(p.events[0].subject, exact);
    d.fortnight[key(exact)] = { enabled: false, ws: 6, wd: 0, wt: 0 };
    blocked(await run(d), "different valid paired splits must block");
    const fresh = fixture(exact),
      blocks = { [eventKey(paired)]: [{ length: 3, count: 2, week: "all" }] };
    p = await run(fresh, { blocks });
    allowed(p);
    assert.deepEqual(p.events[0].blocks, [
      { length: 3, count: 2, week: "all" },
    ]);
    blocks[eventKey(exact)] = [{ length: 2, count: 3, week: "all" }];
    blocked(
      await run(fresh, { blocks }),
      "conflicting explicit paired event blocks",
    );
    const subjects = {
      [paired]: { code: "EXPLICIT", name: "Mapped & subject" },
    };
    p = await run(fresh, { subjects });
    allowed(p);
    assert.equal(p.model.subjects[0].short, "EXPLICIT");
    assert.equal(p.model.lessons[0].subjectid, p.model.subjects[0].id);
    subjects[exact] = { code: "OTHER", name: "Other" };
    blocked(await run(fresh, { subjects }), "conflicting paired crosswalks");
    const equivalent = fixture(exact);
    equivalent.fortnight[key(exact)] = {
      ...split(),
      remarks: "Exact notes",
      ft: 1,
    };
    equivalent.fortnight[key(paired)] = {
      enabled: false,
      wd: 3,
      remarks: "Legacy notes",
      fd: 2,
    };
    p = await run(equivalent);
    allowed(p);
    assert.deepEqual(
      p.events[0].blocks,
      [{ length: 2, count: 3, week: "all" }],
      "remarks and inactive fortnight counts do not conflict with equivalent weekly splits",
    );
    const equivalentBlocks = {
      [eventKey(exact)]: [
        { length: 1, count: 2, week: "all" },
        { length: 2, count: 2, week: "all" },
      ],
      [eventKey(paired)]: [
        { length: 2, count: 2, week: "all" },
        { length: 1, count: 2, week: "all" },
      ],
    };
    p = await run(fresh, { blocks: equivalentBlocks });
    allowed(p);
    assert.equal(
      p.weeklyAndCycleTotals.eventWeekly,
      6,
      "block-array order alone is not a conflict",
    );
  }
  console.log(
    "PASS ASC paired split/block/crosswalk fallback and visible conflict failures.",
  );

  const tg = fixture();
  tg.classes.push({ ref: "class-b", level: "5", shortName: "B", name: "Beta" });
  tg.groups = [
    {
      id: "tg-a",
      name: "Joined group",
      subject: "Science",
      level: "5",
      classRefs: ["class-a", "class-b"],
      associationSchema: 1,
      weeklyPeriods: 3,
    },
  ];
  tg.assignments = [
    {
      id: "tg-assignment",
      teacher: "staff-a",
      subject: "Science",
      target: "tg-a",
      level: "5",
    },
  ];
  const tgSettings = {
    subjects: {
      Science: { code: "SCIENCE-EXTERNAL", name: "Science & learning" },
    },
    divisions: {
      [JSON.stringify(["class-a", "tg-a"])]: {
        tag: "Alpha-science",
        entireClass: "partial",
      },
      [JSON.stringify(["class-b", "tg-a"])]: {
        tag: "Beta-science",
        entireClass: "unknown",
      },
    },
    blocks: {
      [eventKey("Science", "tg", "tg-a")]: [
        { length: 3, count: 1, week: "all" },
      ],
    },
  };
  p = await run(tg, tgSettings);
  allowed(p);
  assert.equal(
    p.events[0].load,
    3,
    "TG actual load takes precedence over level6",
  );
  assert.equal(
    p.weeklyAndCycleTotals.eventWeekly,
    3,
    "joined classes do not multiply demand",
  );
  assert.equal(p.events[0].classRefs.length, 2);
  assert.equal(p.model.lessons[0].classids.split(",").length, 2);
  assert.equal(p.model.lessons[0].groupids.split(",").length, 2);
  assert.equal(p.model.subjects[0].short, "SCIENCE-EXTERNAL");
  assert.deepEqual(
    p.model.groups
      .filter((g) => g.entireclass !== "1")
      .map((g) => g.divisiontag)
      .sort(),
    ["Alpha-science", "Beta-science"],
  );
  const stableIds = p.model.lessons.map((x) => x.id);
  tg.classes[0].shortName = "Renamed";
  tg.classes[0].name = "Renamed class";
  assert.deepEqual(
    (await run(tg, tgSettings)).model.lessons.map((x) => x.id),
    stableIds,
  );
  for (const value of [-1, "3"]) {
    const invalidTG = structuredClone(tg);
    invalidTG.groups[0].weeklyPeriods = value;
    blocked(
      await run(invalidTG, tgSettings),
      "invalid explicit TG load cannot fall back",
    );
  }
  const zeroTG = structuredClone(tg);
  zeroTG.groups[0].weeklyPeriods = 0;
  p = await run(zeroTG, tgSettings);
  allowed(p);
  assert.equal(
    p.events.length,
    0,
    "explicit zero TG does not inherit level demand",
  );
  const fallbackTG = structuredClone(tg);
  delete fallbackTG.groups[0].weeklyPeriods;
  fallbackTG.loads = { 5: { Sci: 6 } };
  fallbackTG.fortnight = { [key("Sci")]: split() };
  p = await run(fallbackTG, { ...tgSettings, blocks: {} });
  allowed(p);
  assert.equal(p.events[0].subject, "Sci");
  assert.equal(p.events[0].load, 6);
  const mixed = fixture();
  mixed.classes.push({
    ref: "class-b",
    level: "4",
    shortName: "B",
    name: "Beta",
  });
  mixed.loads[4] = { Sci: 4 };
  mixed.fortnight[JSON.stringify(["4", "Sci"])] = split(2);
  mixed.assignments.push({
    id: "assignment-b",
    teacher: "staff-a",
    subject: "Sci",
    targetRef: "class-b",
    target: "4B",
    level: "4",
  });
  const crosswalk = { code: "SCIENCE-EXTERNAL", name: "Science" };
  p = await run(mixed, { subjects: { Science: crosswalk, Sci: crosswalk } });
  allowed(p);
  assert.equal(p.entityCounts.subjects, 1);
  assert.equal(p.events.length, 2);
  assert.equal(
    p.weeklyAndCycleTotals.eventWeekly,
    10,
    "different target/level demand with a verified common crosswalk remains valid",
  );
  console.log(
    "PASS ASC actual TG demand, classRefs, class-local divisions, explicit crosswalk and stable IDs.",
  );

  for (const [raw, canonical, alternative] of [
    ["Sci", "Sci", "Science"],
    ["Science", "Sci", "Science"],
    ["PHE", "PHE", "PE"],
    ["PE", "PHE", "PE"],
  ]) {
    for (const variant of ["single", "multi", "zero"]) {
      const explicit = fixture(raw, canonical);
      explicit.fortnight = {};
      explicit.classes.push({
        ref: "class-b",
        level: variant === "multi" ? "4" : "5",
        shortName: "B",
        name: "Beta",
      });
      explicit.groups = [
        {
          id: "tg-stable",
          name: "Stable teaching group",
          subject: raw,
          level: "5",
          levels: variant === "multi" ? ["4", "5"] : ["5"],
          classRefs: ["class-a", "class-b"],
          associationSchema: 1,
          weeklyPeriods: variant === "zero" ? 0 : 3,
        },
      ];
      explicit.assignments = [
        {
          id: "stable-assignment",
          teacher: "staff-a",
          subject: raw,
          target: "tg-stable",
          level: "5",
        },
      ];
      const mapping = {
        code: "EXPLICIT-" + canonical,
        name: "Explicit " + canonical,
      };
      const settings = {
        subjects: { [canonical]: mapping, [alternative]: mapping },
        divisions: {
          [JSON.stringify(["class-a", "tg-stable"])]: {
            tag: "partition-a",
            entireClass: "partial",
          },
          [JSON.stringify(["class-b", "tg-stable"])]: {
            tag: "partition-b",
            entireClass: "unknown",
          },
        },
        blocks: {
          [eventKey(canonical, "tg", "tg-stable")]: [
            { length: 3, count: 1, week: "all" },
          ],
        },
      };
      const baseline = await run(explicit, settings);
      allowed(baseline);
      assert.equal(
        baseline.xml,
        (await run(explicit, settings, true)).xml,
        raw + " explicit TG retains established export-profile bytes and IDs",
      );
      // Change only the unused level default. It cannot rename the TG or alter
      // the explicit demand, its block identity or its verified crosswalk.
      explicit.loads[5] = { [alternative]: 6 };
      const changed = await run(explicit, settings);
      allowed(changed);
      assert.deepEqual(
        changed.model.lessons.map((row) => row.id),
        baseline.model.lessons.map((row) => row.id),
        raw +
          " explicit TG lesson IDs must not depend on unused level defaults",
      );
      assert.equal(
        changed.xml,
        baseline.xml,
        "Unused level default changes neither explicit TG XML nor source identity",
      );
      assert.equal(
        changed.xml,
        (await run(explicit, settings, true)).xml,
        "Already-valid legacy TG exports stay byte-identical",
      );
      assert.equal(
        changed.weeklyAndCycleTotals.eventWeekly,
        variant === "zero" ? 0 : 3,
      );
      if (variant !== "zero")
        assert.equal(
          changed.events[0].subject,
          canonical,
          "Explicit TG keeps the established canonical export identity",
        );
      // Even conflicting defaults are not authority for this TG's own load.
      explicit.loads[5][canonical] = 8;
      const unrelated = await run(explicit, settings);
      allowed(unrelated);
      assert.equal(
        unrelated.xml,
        baseline.xml,
        "Conflicting unused level defaults do not replace an explicit TG load",
      );
    }
  }
  // Keep both valid legacy profiles: assigned TGs use canonical aliases;
  // unassigned-only TGs use their raw subject. Include-unassigned must reuse
  // an already assigned event instead of generating a second pupil demand.
  // Adding the first teacher still follows the existing profile transition.
  for (const [raw, canonical] of [
    ["Science", "Sci"],
    ["PE", "PHE"],
  ]) {
    for (const multilevel of [false, true]) {
      const unassignedTG = structuredClone(tg);
      unassignedTG.loads = { 5: {} };
      unassignedTG.fortnight = {};
      unassignedTG.groups[0].subject = raw;
      unassignedTG.groups[0].levels = multilevel ? ["4", "5"] : ["5"];
      unassignedTG.classes[1].level = multilevel ? "4" : "5";
      unassignedTG.assignments[0].subject = raw;
      const crosswalk = {
        code: "EXPLICIT-" + canonical,
        name: "Explicit " + canonical,
      };
      const bothKeys = {
        ...tgSettings,
        includeUnassigned: true,
        subjects: { [raw]: crosswalk, [canonical]: crosswalk },
        blocks: {
          [eventKey(raw, "tg", "tg-a")]: [{ length: 3, count: 1, week: "all" }],
          [eventKey(canonical, "tg", "tg-a")]: [
            { length: 3, count: 1, week: "all" },
          ],
        },
      };
      const assignedWithUnassigned = await run(unassignedTG, bothKeys);
      allowed(assignedWithUnassigned);
      assert.equal(
        assignedWithUnassigned.events.length,
        1,
        "Assigned/unassigned TG projections consolidate once",
      );
      assert.equal(assignedWithUnassigned.events[0].subject, canonical);
      assert.equal(assignedWithUnassigned.weeklyAndCycleTotals.eventWeekly, 3);
      unassignedTG.assignments = [];
      const onlyUnassigned = await run(unassignedTG, bothKeys);
      allowed(onlyUnassigned);
      const legacyUnassigned = await run(unassignedTG, bothKeys, true);
      allowed(legacyUnassigned);
      assert.equal(
        onlyUnassigned.xml,
        legacyUnassigned.xml,
        "Already-valid unassigned-only " +
          raw +
          " TG bytes and IDs must be preserved",
      );
      assert.equal(onlyUnassigned.events[0].subject, raw);
      assert.equal(onlyUnassigned.weeklyAndCycleTotals.eventWeekly, 3);
    }
  }
  console.log(
    "PASS ASC explicit TG legacy byte/ID parity despite unused level changes, cross-level scope and zero loads.",
  );

  await page.evaluate((doc) => {
    state = { versions: [doc] };
    current = doc.id;
    role = "Admin+KP";
    token = "synthetic";
    lastEmail = "synthetic@example.invalid";
    tab = "ASC Export";
    snapshotCache = { id: doc.id, revision: doc.revision };
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
    render();
    controls();
    window.__snapshotBefore = JSON.stringify(state);
  }, fixture());
  await page.locator("[data-asc-preview]").click();
  await page.waitForFunction(
    () =>
      document.querySelector("[data-asc-status]").textContent ===
      "Local preview ready.",
  );
  assert.match(
    await page.locator("[data-asc-results]").innerText(),
    /Ready for draft XML export/,
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("[data-asc-export]").click(),
  ]);
  assert.match(download.suggestedFilename(), /\.xml$/);
  const bytes = await readFile(await download.path(), "utf8");
  assert.doesNotMatch(bytes, /<!DOCTYPE|<!ENTITY/i);
  const parsed = await page.evaluate((xml) => {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror"))
      throw Error("Downloaded XML malformed");
    const ids = new Set(),
      problems = [];
    for (const row of doc.querySelectorAll("[id]")) {
      const id = row.getAttribute("id");
      if (ids.has(id) || !/^[A-Za-z0-9_-]+$/.test(id))
        problems.push("duplicate/unsafe id");
      ids.add(id);
    }
    for (const table of doc.documentElement.children) {
      const columns = table.getAttribute("columns").split(",");
      for (const row of table.children)
        for (const attr of row.attributes)
          if (!columns.includes(attr.name)) problems.push("undeclared column");
    }
    for (const row of doc.querySelectorAll("lessons lesson"))
      for (const key of [
        "subjectid",
        "classids",
        "groupids",
        "teacherids",
        "classroomids",
        "weeksdefid",
        "termsdefid",
      ])
        for (const ref of row.getAttribute(key).split(",").filter(Boolean))
          if (!ids.has(ref)) problems.push("dangling " + key);
    return {
      root: doc.documentElement.tagName,
      problems,
      subjects: doc.querySelectorAll("subjects subject").length,
      lessons: [...doc.querySelectorAll("lessons lesson")].map((x) => ({
        periods: Number(x.getAttribute("periodsperweek")),
        block: Number(x.getAttribute("periodspercard")),
      })),
      cards: doc.querySelectorAll("cards").length,
      unchanged: window.__snapshotBefore === JSON.stringify(state),
      api: window.__api,
      queue: queuedEdits(),
    };
  }, bytes);
  assert.deepEqual(parsed, {
    root: "timetable",
    problems: [],
    subjects: 1,
    lessons: [{ periods: 6, block: 2 }],
    cards: 0,
    unchanged: true,
    api: [],
    queue: [],
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log(
    "PASS ASC actual browser XML download, secure reparse, unique IDs/foreign keys, no mutation or network.",
  );
} finally {
  await browser?.close();
  await rm(output, { recursive: true, force: true });
}
