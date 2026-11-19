import assert from "node:assert/strict";
import { fixture, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

const f = await fixture(), errors = [], dialogs = [];
let page;
try {
  const staff = {};
  for (const [key, active] of [["Alpha", "Y"], ["Beta", "Y"], ["Gamma", "Y"], ["Inactive", "N"], ["Unknown", null]]) {
    const temporary = "synthetic-layout-" + key;
    const result = await f.call(f.admin, "contacts", "/save-data", {
      operationId: "synthetic-create-layout-" + key, changes: [],
      additions: [{ id: temporary, values: {
        "Basic Name": "Synthetic " + key, "Statutory Name": "Synthetic " + key,
        Role: "Teacher", ...(active === null ? {} : { Active: active }),
      } }],
    });
    staff[key] = result.mapping[temporary];
  }
  const db = await f.db("deploy"), versions = [];
  for (const multirow of [false, true]) {
    const created = await f.call(f.admin, "deploy", "/versions/create", {
      operationId: "synthetic-create-layout-version-" + multirow,
      name: "Synthetic layout " + (multirow ? "blocks" : "simple"), year: 2026,
    });
    const loaded = await loadVersion(db, schoolId, created.versionId), doc = structuredClone(loaded.doc);
    doc.planning402 = 1;
    doc.roleMembershipSchema = 1;
    doc.membership = [["Teacher", "Synthetic role", ...Array(10).fill(""), "", null]];
    doc.organisations = Object.fromEntries(["dept", "comm", "cca", "plt", "events"].map(kind => {
      const count = kind === "plt" ? 1 : kind === "dept" || kind === "events" ? 2 : 4;
      return [kind, [
        { id: "synthetic-" + kind + "-a", name: "Synthetic " + kind + " A",
          slots: [staff.Alpha, ...Array(count - 1).fill(""), staff.Beta],
          ...(kind === "comm" ? { leadershipSchema: 1 } : {}) },
        { id: "synthetic-" + kind + "-b", name: "Synthetic " + kind + " B",
          slots: [kind === "dept" || kind === "plt" ? "" : staff.Alpha, ...Array(count - 1).fill("")],
          ...(kind === "comm" ? { leadershipSchema: 1 } : {}) },
      ]];
    }));
    doc.classes = ["A", "B"].map(letter => ({
      ref: "synthetic-layout-class-" + letter, name: "Synthetic class " + letter,
      shortName: "1" + letter, level: "1",
    }));
    doc.venues = ["A", "B"].map(letter => ({
      id: "synthetic-layout-room-" + letter, form: "1" + letter, forms: ["1" + letter],
    }));
    doc.groups = multirow ? [{
      id: "synthetic-layout-tg", name: "Synthetic teaching group", subject: "EL",
      level: "1", levels: ["1"], weeklyPeriods: 2, venue: doc.venues[0].id,
      classRefs: [doc.classes[0].ref], sources: ["1A"], form: "1A", associationSchema: 1,
    }] : [];
    doc.loads["1"].EL = 5;
    doc.assignments = [{ id: "synthetic-layout-assignment", target: "1A",
      targetRef: doc.classes[0].ref, subject: "EL", teacher: staff.Alpha }];
    const changes = changesFor(schoolId, created.versionId, loaded.rows, doc);
    await db.batch(changes.writes.map(change => statement(db, change.sql, change.args)));
    versions.push(created.versionId);
  }
  const stored = async () => Promise.all(versions.map(async id => (await loadVersion(db, schoolId, id)).doc));
  const before = await stored();
  page = await f.pageFor();
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.goto(origin + "/deploy/");
  const settle = async () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const chooseVersion = async id => {
    if (await page.locator("#version").inputValue() !== id) await page.locator("#version").selectOption(id);
    await page.waitForFunction(id => current === id && !busy && !refreshing, id);
    await settle();
  };
  const open = async label => {
    await page.locator("#nav").getByRole("button", { name: label, exact: true }).click();
    await page.locator("#content table.gsis-core-table").first().waitFor();
    await settle();
  };
  await chooseVersion(versions[0]);
  const writesBefore = f.requests.filter(request => request.url.endsWith("/api/deploy/change")).length;
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const [label, kind] of [["Dept", "dept"], ["Committees", "comm"], ["CCAs", "cca"], ["PLT", "plt"], ["Events", "events"]]) {
      await open(label);
      const geometry = await page.locator(".assignment-split").evaluate(split => {
        const main = split.querySelector(".assignment-main").getBoundingClientRect();
        const aside = split.querySelector(".unassigned-pane").getBoundingClientRect();
        return { main: { x: main.x, y: main.y, width: main.width },
          aside: { x: aside.x, y: aside.y, width: aside.width }, children: split.children.length };
      });
      assert.equal(geometry.children, 2, label + " keeps only its two owning layout children");
      assert(geometry.main.x < geometry.aside.x && Math.abs(geometry.main.y - geometry.aside.y) < 1,
        label + " keeps its grid left and sidebar right at " + viewport.width);
      if (viewport.width === 1440) assert(geometry.main.width > 800);
      assert.equal(await page.locator(".assignment-split > .gsis-core-tools").count(), 0);
      assert.equal(await page.locator(".unassigned-pane").innerText(),
        (kind === "plt" ? "Teacher without PLT" : "Unassigned") + " 1\nSynthetic Gamma");
      assert.match(await page.locator(".group-table thead").innerText(), /2 teachers/);
      assert.equal(await page.locator('[data-member-picker="add"]').count(), 2);
      if (["comm", "cca", "events"].includes(kind))
        assert.equal(await page.locator(".multiple-membership").count(), 2, "historical orange notices remain visible");
      if (kind === "plt") assert.match(await page.locator(".group-table thead").innerText(), /No leader/);
      if (kind === "dept" && viewport.width === 1440) {
        await page.evaluate(() => render(true));
        await page.locator(".group-table.gsis-core-table").waitFor(); await settle();
        assert.equal(await page.locator(".assignment-split > *").count(), 2,
          "detached native soft render retains the two-child split");
        assert.equal(await page.locator("#content .gsis-core-tools").count(), 1);
        assert.equal(await page.locator(".unassigned-pane").innerText(), "Unassigned 1\nSynthetic Gamma");
      }
    }
  }
  console.log("PASS all five organisation grids retain main/sidebar geometry, counts, member rows and notices at desktop/narrow sizes");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await open("IP Deploy");
  const ip = page.locator("#content table.gsis-core-table");
  assert.equal(await ip.locator(".gsis-core-sort").count(), 0, "native IP sorting has one owner");
  assert(await ip.locator(".gsis-core-filter input").count() > 0);
  assert.equal(await ip.locator("thead tr").first().locator("th").first().evaluate(cell => getComputedStyle(cell).backgroundColor),
    await ip.locator("thead tr").first().locator("th").nth(1).evaluate(cell => getComputedStyle(cell).backgroundColor),
    "Venue retains its adjacent native dark heading fill");
  const classSort = () => ip.locator("thead tr").first().locator("th").nth(1).locator(".sort-button");
  await classSort().click(); await settle();
  await classSort().click(); await settle();
  assert.deepEqual(await ip.locator("tbody [data-row]").evaluateAll(rows => rows.map(row => row.dataset.row)), ["1B", "1A"]);
  assert.equal(await ip.locator(".gsis-core-sort").count(), 0, "native redraw does not reintroduce generic sorting");
  await chooseVersion(versions[1]); await open("IP Deploy");
  const assertBlock = async () => {
    const rows = await ip.locator("tbody [data-row]").evaluateAll(rows => rows.map(row => row.dataset.row));
    assert.equal(rows.indexOf("synthetic-layout-tg"), rows.indexOf("1A") + 1, "the TG stays with its class block");
    assert.equal(await ip.locator('[data-row="1A"] td.venue').getAttribute("rowspan"), "2");
  };
  await assertBlock(); await classSort().click(); await settle(); await assertBlock();
  console.log("PASS native IP sort remains singular and preserves class/TG block ordering and venue rowspans");

  await page.locator("#nav").getByRole("button", { name: "HR Settings", exact: true }).click();
  const expectedHR = ["Teachers", "Exclusions", "Membership", "Offload", "HR Terms", "Span of Control"];
  assert.deepEqual(await page.locator("#settingsSubnav button").allTextContents(), expectedHR);
  await page.locator("#settingsSubnav").getByRole("button", { name: "Teachers", exact: true }).click();
  await page.locator("#content table.gsis-core-table").waitFor(); await settle();
  const teacherTable = page.locator("#content table.gsis-core-table");
  const colours = await teacherTable.evaluate(table => {
    const head = [...table.tHead.rows[0].cells].slice(0, 2).map(cell => ({
      background: getComputedStyle(cell).backgroundColor, color: getComputedStyle(cell).color,
    }));
    return { head, filter: getComputedStyle(table.querySelector(".gsis-core-filter th")).backgroundColor };
  });
  assert.deepEqual(colours.head[0], colours.head[1], "TTb heading matches its adjacent dark header");
  assert.notEqual(colours.head[0].background, colours.filter, "filter row keeps its separate pale fill");
  const assertBands = async () => {
    const bands = await teacherTable.locator("tbody [data-roster-teacher]:visible").evaluateAll(rows => rows.map(row =>
      [...row.cells].map(cell => getComputedStyle(cell).backgroundColor)));
    for (const [index, cells] of bands.entries()) {
      const expected = index % 2 ? "rgb(232, 240, 245)" : "rgb(255, 255, 255)";
      assert(cells.every(value => value === expected), "visible row " + index + " and frozen cells retain normal bands");
    }
  };
  await assertBands();
  const row = key => page.locator('[data-roster-teacher="' + staff[key] + '"]');
  assert.match(await row("Inactive").innerText(), /Inactive/);
  assert.match(await row("Unknown").innerText(), /Activity unknown/);
  assert(await row("Inactive").getAttribute("class").then(value => value.includes("inactive")));
  assert(await row("Unknown").getAttribute("class").then(value => value.includes("inactive")));
  assert.equal(await teacherTable.locator(".gsis-core-sort").count(), 0);
  const teacherSort = () => teacherTable.locator("thead tr").first().locator("th").first().locator(".sort-button");
  await teacherSort().click(); await settle(); await assertBands();
  const firstFilter = teacherTable.locator(".gsis-core-filter input").first();
  await firstFilter.fill("Synthetic"); await settle(); await assertBands();
  await firstFilter.fill("Beta"); await settle();
  assert.equal(await teacherTable.locator("tbody [data-roster-teacher]:visible").count(), 1); await assertBands();
  await firstFilter.fill(""); await settle(); await assertBands();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.waitForFunction(() => !refreshing); await settle(); await assertBands();
  assert.deepEqual(await page.locator("#settingsSubnav button").allTextContents(), expectedHR);
  const basic = row("Alpha").getByRole("textbox", { name: "Basic Name", exact: true });
  await basic.fill("");
  await page.locator("#settingsSubnav").getByRole("button", { name: "Span of Control", exact: true }).click();
  assert.equal(await page.locator("#content").getAttribute("data-view"), "Teachers", "native invalid-draft guard still owns navigation");
  assert(dialogs.some(message => /Basic Name|current|input|draft|finish/i.test(message)));
  await basic.fill("Synthetic Alpha"); await basic.press("Tab");
  console.log("PASS Teachers header/filter contrast, visible row bands, truthful status, HR order and native draft navigation guards");

  assert.equal(f.requests.filter(request => request.url.endsWith("/api/deploy/change")).length, writesBefore);
  assert.deepEqual(await stored(), before, "opening, sorting and styling never change the saved version or staff facts");
  assert.equal(await page.evaluate(() => queuedEdits().length), 0);
  assert.deepEqual(errors, []);
  console.log("PASS presentation and navigation preserve real Worker/D1 data and issue no owner change requests");
} catch (error) {
  console.error(JSON.stringify({ errors, dialogs, view: page && await page.locator("#content").getAttribute("data-view").catch(() => null) }));
  throw error;
} finally { await f.close(); }
