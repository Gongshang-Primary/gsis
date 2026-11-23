/* Additional Deploy workbook scopes use the existing atomic /change owner contract. */
import { parseLoad, storedLoad, parseSplit, loadRows, fortnightRows } from "./deploy-loads.mjs";
import { installWorkloadSettingsView } from "./deploy-workload-settings-ui.js";

(function () {
  "use strict";
  const api = window.GSISV1;
  if (!api) return;
  let securityEpoch = 0;
  window.addEventListener("gsis:clear-protected-state", () => {
    securityEpoch++;
  });
  const kinds = {
    Committees: "comm",
    "Committee Settings": "comm",
    CCAs: "cca",
    "CCA Settings": "cca",
    PLT: "plt",
    "PLT Settings": "plt",
    Events: "events",
    "Events Settings": "events",
  };
  const views = [
    "Load Settings",
    "Subject Type",
    "Fortnight Split",
    "Workload Settings",
    "ASC Export",
    "Duty",
    ...Object.keys(kinds),
  ];
  const clone = (x) => structuredClone(x),
    same = (a, b) => JSON.stringify(a) === JSON.stringify(b),
    fail = (ok, message, location) => {
      if (!ok) throw Object.assign(Error(message), { location });
    };
  const fields = ["enabled", "wt", "wd", "ws", "ft", "fd", "fs", "remarks"];
  const ascKeys = [
    "namespace",
    "profile",
    "installedVersion",
    "schoolName",
    "fileLabel",
    "destination",
    "includeStructure",
    "includeUnassigned",
    "termName",
  ];
  const ascSettings = (doc) =>
    Object.keys(doc.ascExport || {}).length
      ? clone(doc.ascExport)
      : window.GSISAscExport.defaults(doc);
  function sheets(doc, view) {
    if (view === "ASC Export") {
      const value = ascSettings(doc);
      return {
        Settings: {
          columns: ["Setting", "Value"],
          rows: ascKeys.map((key) => [key, value[key]]),
        },
        Days: {
          columns: ["Index", "Name", "Short"],
          rows: value.days.map((d, i) => [i, d.name, d.short]),
        },
        Weeks: {
          columns: ["Index", "Name"],
          rows: value.weeks.map((w, i) => [i, w]),
        },
        Periods: {
          columns: ["Period", "Name", "Short", "Start", "End"],
          rows: value.periods.map((p) => [
            p.period,
            p.name,
            p.short,
            p.starttime,
            p.endtime,
          ]),
        },
        Subjects: {
          columns: ["Source", "Code", "Name"],
          rows: Object.entries(value.subjects).map(([key, v]) => [
            key,
            v.code,
            v.name,
          ]),
        },
        Divisions: {
          columns: ["Source", "Tag", "Entire Class"],
          rows: Object.entries(value.divisions).map(([key, v]) => [
            key,
            v.tag,
            v.entireClass,
          ]),
        },
        Blocks: {
          columns: ["Source", "Index", "Length", "Count", "Week"],
          rows: Object.entries(value.blocks).flatMap(([key, v]) =>
            v.map((b, i) => [key, i, b.length, b.count, b.week]),
          ),
        },
      };
    }
    if (view === "Load Settings")
      return {
        Loads: {
          columns: ["Level", "Subject", "Weekly Periods"],
          rows: loadRows(doc),
        },
      };
    if (view === "Subject Type")
      return {
        Subjects: {
          columns: ["Subject", "Type"],
          rows: window.GSISWorkload.subjectTypeSubjects(doc).map((s) => [
            s,
            window.GSISWorkload.subjectType(doc, s),
          ]),
        },
      };
    if (view === "Fortnight Split")
      return {
        Fortnight: {
          columns: [
            "Level",
            "Subject",
            "Enabled",
            "WT",
            "WD",
            "WS",
            "FT",
            "FD",
            "FS",
            "Remarks",
          ],
          rows: fortnightRows(doc, window.GSISWorkload).map(({ level, subject, key }) => {
            const row = doc.fortnight?.[key] || {};
            return [level, subject, ...fields.map(f => row[f] ?? (f === "enabled" ? false : ""))];
          }),
        },
      };
    if (kinds[view]) {
      const groups = doc.organisations[kinds[view]] || [];
      return {
        Groups: {
          columns: ["Group ID", "Name"],
          rows: groups.map((g) => [g.id, g.name]),
        },
        Members: {
          columns: ["Group ID", "Position", "Staff ID"],
          rows: groups.flatMap((g) => g.slots.map((id, i) => [g.id, i, id])),
        },
      };
    }
    if (view === "Duty")
      return {
        Duties: {
          columns: [
            "Duty ID",
            "Name",
            "Category",
            "Start",
            "End",
            "Days",
            "Description",
          ],
          rows: doc.duties.map((d) => [
            d.id,
            d.name,
            d.category,
            d.start,
            d.end,
            d.days.join(","),
            d.description || "",
          ]),
        },
        Assignments: {
          columns: ["Duty ID", "Day", "Staff ID"],
          rows: doc.duties.flatMap((d) =>
            d.days.map((day) => [d.id, day, d.teachers[day] || ""]),
          ),
        },
      };
    if (view === "Workload Settings")
      return {
        Workload: {
          columns: ["Subject", "Category", "Specialist", "Demand"],
          rows: window.GSISWorkload.subjects(doc).map((subject) => {
            const specialist = window.GSISWorkload.specialists(doc).find(
              (s) => s.subject === subject,
            );
            return [
              subject,
              window.GSISWorkload.category(doc, subject),
              !!specialist,
              specialist?.demand || (subject === "TL" ? "groups" : "classes"),
            ];
          }),
        },
      };
    throw Error(
      "This table is a read-only projection or uses its own import format.",
    );
  }
  function workbook(doc, view, schoolId) {
    return {
      metadata: {
        Schema: "gsis.deploy.settings.v1",
        "School ID": schoolId,
        "Version ID": doc.id,
        "Base Working Revision": doc.revision,
        "Table Scope": view,
        "Import semantics":
          "Edit existing rows, up to 32 changed rows per atomic import. Keep identifiers and row keys. Add/remove records in the owning editor. Saves do not publish.",
      },
      sheets: sheets(doc, view),
    };
  }
  function validate(book, doc, view, schoolId) {
    const m = book.metadata || {},
      original = sheets(doc, view),
      edits = [];
    fail(
      m.Schema === "gsis.deploy.settings.v1" &&
        m["School ID"] === schoolId &&
        m["Version ID"] === doc.id &&
        m["Table Scope"] === view,
      "Workbook school, version or table scope does not match.",
    );
    fail(
      Number(m["Base Working Revision"]) === doc.revision,
      "The saved version changed after export. Export again and reconcile.",
    );
    fail(
      same(Object.keys(book.sheets).sort(), Object.keys(original).sort()),
      "Keep all required sheets.",
    );
    for (const [name, sheet] of Object.entries(original)) {
      const supplied = book.sheets[name];
      fail(
        same(supplied.columns, sheet.columns),
        "Keep the " + name + " column names and order.",
      );
      fail(
        supplied.rows.length === sheet.rows.length &&
          supplied.rows.every((row) => row.length === sheet.columns.length),
        "Use existing rows only. Add or remove records in the owning editor first.",
      );
    }
    if (same(book.sheets, original)) return [];
    const rowPairs = new Map();
    function rows(name, keys) {
      if (rowPairs.has(name)) return rowPairs.get(name);
      const base = original[name].rows,
        seen = new Set();
      const paired = book.sheets[name].rows.map((row) => {
        const key = JSON.stringify(row.slice(0, keys).map(String));
        fail(!seen.has(key), "Duplicate row key in " + name);
        seen.add(key);
        const old = base.find(
          (b) => JSON.stringify(b.slice(0, keys).map(String)) === key,
        );
        fail(old, "Unknown row key in " + name);
        return { name, row, old };
      });
      rowPairs.set(name, paired);
      return paired;
    }
    const paired = Object.keys(original).flatMap((name) =>
      rows(
        name,
        ["Loads", "Fortnight", "Members", "Assignments", "Blocks"].includes(
          name,
        )
          ? 2
          : 1,
      ),
    );
    const parseCell = (value, parser, name, row, column) => {
      try { return parser(value); }
      catch (error) {
        error.location = { sheet: name, row: book.sheets[name].rows.indexOf(row), column };
        throw error;
      }
    };
    for (const pair of paired) {
      const { name, row, old } = pair;
      pair.changed = !same(row, old);
      if (view === "Load Settings" && name === "Loads") {
        pair.expected = storedLoad(old[2]);
        // Retain an unchanged unknown legacy value. Explicit edits use the
        // same parser as the editor and server, including n/a versus zero.
        pair.value = same(row[2], old[2]) ? pair.expected : parseCell(row[2], parseLoad, name, row, 2);
        pair.changed = !same(pair.value, pair.expected);
      } else if (view === "Fortnight Split" && name === "Fortnight") {
        pair.splitChanges = [];
        fields.forEach((field, i) => {
          if (same(row[i + 2], old[i + 2])) return;
          const value = parseCell(row[i + 2], value => parseSplit(value, field), name, row, i + 2);
          let expected = old[i + 2];
          try { expected = parseSplit(expected, field); } catch { /* Retain unknown legacy input until explicitly corrected. */ }
          if (!same(value, expected)) pair.splitChanges.push({ field, value, expected: old[i + 2] });
        });
        pair.changed = pair.splitChanges.length > 0;
      }
    }
    const changed = paired.filter(pair => pair.changed).length;
    fail(
      changed <= 32,
      "At most 32 changed rows can save atomically. Reduce changes and reimport; no rows were saved.",
    );
    if (!changed) return [];
    if (view === "ASC Export") {
      const value = ascSettings(doc);
      for (const { row, old } of rows("Settings", 1)) {
        if (row[0] === "namespace")
          fail(
            row[1] === old[1],
            "Change the stable export namespace in its owning editor.",
          );
        value[row[0]] = row[1];
      }
      for (const { row } of rows("Days", 1))
        value.days[Number(row[0])] = { name: row[1], short: row[2] };
      for (const { row } of rows("Weeks", 1))
        value.weeks[Number(row[0])] = row[1];
      for (const { row } of rows("Periods", 1))
        Object.assign(
          value.periods.find((p) => p.period === Number(row[0])),
          { name: row[1], short: row[2], starttime: row[3], endtime: row[4] },
        );
      for (const { row } of rows("Subjects", 1))
        value.subjects[row[0]] = { code: row[1], name: row[2] };
      for (const { row } of rows("Divisions", 1))
        value.divisions[row[0]] = { tag: row[1], entireClass: row[2] };
      for (const { row } of rows("Blocks", 2))
        value.blocks[row[0]][Number(row[1])] = {
          length: Number(row[2]),
          count: Number(row[3]),
          week: row[4],
        };
      const valid = window.GSISAscExport.validateSettings(value);
      edits.push({
        operation: "setAscExportSettings",
        value: valid,
        expected: doc.ascExport || {},
      });
    } else if (view === "Load Settings")
      for (const { row, changed, value, expected } of rows("Loads", 2)) {
        if (!changed) continue;
        edits.push({
          operation: "setLoad",
          level: String(row[0]),
          subject: row[1],
          value,
          expected,
        });
      }
    else if (view === "Subject Type") {
      for (const { row, old } of rows("Subjects", 1)) {
        if (same(row, old)) continue;
        try {
          window.GSISWorkload.validateSubjectType(doc, row[0], row[1]);
        } catch (error) {
          error.location = {
            sheet: "Subjects",
            row: book.sheets.Subjects.rows.indexOf(row),
            column: 1,
          };
          throw error;
        }
        edits.push({
          operation: "setSubjectType",
          subject: row[0],
          value: row[1],
          expected: doc.subjectTypes?.[row[0]] ?? null,
        });
      }
    } else if (view === "Fortnight Split")
      for (const { row, splitChanges } of rows("Fortnight", 2))
        for (const { field, value, expected } of splitChanges) {
          edits.push({
            operation: "setFortnight",
            row: JSON.stringify([String(row[0]), row[1]]),
            field,
            value,
            expected,
          });
        }
    else if (kinds[view]) {
      const kind = kinds[view],
        value = clone(doc.organisations[kind] || []);
      for (const { row } of rows("Groups", 1)) {
        fail(
          typeof row[1] === "string" && row[1].trim(),
          "Group names cannot be blank.",
          {
            sheet: "Groups",
            row: book.sheets.Groups.rows.indexOf(row),
            column: 1,
          },
        );
        value.find((g) => g.id === row[0]).name = row[1].trim();
      }
      for (const { row } of rows("Members", 2)) {
        fail(
          typeof row[2] === "string" &&
            (!row[2] || doc.teachers.some((t) => t.id === row[2])),
          "Choose a known permanent Staff ID.",
          {
            sheet: "Members",
            row: book.sheets.Members.rows.indexOf(row),
            column: 2,
          },
        );
        value.find((g) => g.id === row[0]).slots[Number(row[1])] = row[2];
      }
      window.GSISPlanning.checkGroups(doc, kind, value);
      if (!same(value, doc.organisations[kind]))
        edits.push({
          operation: "setOrganisation",
          kind,
          value,
          expected: doc.organisations[kind],
        });
    } else if (view === "Duty") {
      const value = clone(doc.duties);
      for (const { row, old } of rows("Duties", 1)) {
        fail(
          String(row[5]) === String(old[5]),
          "Change enabled duty days in the owning editor to reconcile assignments.",
        );
        const d = value.find((d) => d.id === row[0]);
        Object.assign(d, {
          name: String(row[1]),
          category: String(row[2]),
          start: String(row[3]),
          end: String(row[4]),
          days: String(row[5]).split(",").map(Number),
          description: String(row[6] ?? ""),
        });
      }
      for (const { row } of rows("Assignments", 2))
        value.find((d) => d.id === row[0]).teachers[Number(row[1])] = String(
          row[2] ?? "",
        );
      window.GSISPlanning.checkDuties(doc, value);
      if (!same(value, doc.duties))
        edits.push({ operation: "setDuties", value, expected: doc.duties });
    } else if (view === "Workload Settings") {
      const value = clone(doc.workload || {});
      value.categories = {};
      value.specialists = [];
      for (const { row } of rows("Workload", 1)) {
        fail(
          typeof row[2] === "boolean",
          "Specialist must be an Excel boolean.",
        );
        value.categories[row[0]] = row[1];
        if (row[2])
          value.specialists.push({
            subject: row[0],
            pool: "assignment",
            modifier:
              window.GSISWorkload.specialists(doc).find(
                (s) => s.subject === row[0],
              )?.modifier || "",
            demand: row[3],
          });
      }
      const valid = window.GSISWorkload.validate(doc, value);
      if (!same(valid, doc.workload))
        edits.push({
          operation: "setWorkload",
          value: valid,
          expected: doc.workload,
        });
    }
    fail(
      edits.length <= 500,
      "At most 500 changed values can save atomically. Reduce changes and reimport.",
    );
    return edits;
  }
  async function snapshot() {
    const versionId = document.getElementById("version")?.value;
    fail(versionId, "Select a saved planning version first.");
    const data = await api.request("deploy", "/bootstrap", {
      method: "POST",
      body: { versionId },
    });
    fail(
      data.current && Number.isSafeInteger(data.current.revision),
      "Current saved revision is unavailable.",
    );
    return data.current;
  }
  const selected = () => document.getElementById("content")?.dataset.view;
  async function exportAll() {
    const epoch = securityEpoch;
    const view = selected(),
      [doc, session] = await Promise.all([snapshot(), api.getSession()]);
    const { encodeWorkbook, download } = await import("./workbooks.mjs");
    const bytes = await encodeWorkbook(workbook(doc, view, session.schoolId));
    fail(epoch === securityEpoch, "Session changed. Export cancelled.");
    download(bytes, "GSiS-" + view + "-All.xlsx");
  }
  async function openImport() {
    const view = selected(),
      session = await api.getSession();
    fail(api.capable("deploy.edit"), "Current Deploy edit access is required.");
    fail(
      !window.queuedEdits?.().length,
      "Save or discard your current Deploy draft before importing.",
    );
    const key =
      "gsis-deploy-settings-import:" +
      session.schoolId +
      ":" +
      session.user.accountId;
    const dialog = document.createElement("dialog");
    dialog.className = "gsis-import-preview";
    dialog.setAttribute("aria-label", "Import " + view);
    const title = document.createElement("h2");
    title.textContent = "Import " + view;
    const note = document.createElement("p");
    note.textContent =
      "Edit existing rows in Export All. Keep identifiers and row keys. This saves the draft; publication remains separate.";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx";
    input.setAttribute("aria-label", "Import settings workbook");
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    const preview = document.createElement("div");
    const confirm = document.createElement("button");
    confirm.textContent = "Confirm atomic import";
    confirm.disabled = true;
    const check = document.createElement("button");
    check.textContent = "Check original import receipt";
    check.hidden = true;
    const close = document.createElement("button");
    close.textContent = "Close";
    close.onclick = () => dialog.close();
    dialog.append(title, note, input, status, preview, confirm, check, close);
    document.body.append(dialog);
    dialog.showModal();
    let proposed = null,
      epoch = 0,
      pending = sessionStorage.getItem(key),
      leaseRequest = null;
    if (pending) {
      input.disabled = true;
      check.hidden = false;
      status.textContent =
        "An earlier import is unconfirmed: " +
        pending +
        ". Check its original receipt first.";
    }
    const show = (message) => (status.textContent = message);
    check.onclick = async () => {
      try {
        const result = await api.request("deploy", "/receipt", {
          method: "POST",
          body: { operationId: pending },
        });
        const receipt = result.receipt || result;
        if (
          receipt.state === "committed" ||
          receipt.state === "terminal-not-committed"
        ) {
          sessionStorage.removeItem(key);
          pending = null;
          input.disabled = false;
          check.hidden = true;
          show(
            receipt.state === "committed"
              ? "Original import committed. Refresh the version."
              : "Original import did not commit. Export current data before trying again.",
          );
        } else
          show(
            "Original operation remains " +
              (receipt.state || "unconfirmed") +
              ".",
          );
      } catch (error) {
        show(error.message);
      }
    };
    input.onchange = async () => {
      const file = input.files[0],
        ticket = ++epoch;
      if (!file) return;
      proposed = null;
      confirm.disabled = true;
      preview.replaceChildren();
      try {
        const { decodeWorkbook } = await import("./workbooks.mjs");
        const book = await decodeWorkbook(await file.arrayBuffer()),
          doc = await snapshot();
        if (ticket !== epoch) return;
        for (const [name, sheet] of Object.entries(book.sheets)) {
          const h = document.createElement("h3");
          h.textContent = name;
          const table = document.createElement("table"),
            head = table.createTHead().insertRow(),
            body = table.createTBody();
          sheet.columns.forEach((v) => {
            const c = document.createElement("th");
            c.textContent = v;
            head.append(c);
          });
          table.dataset.importSheet = name;
          sheet.rows.forEach((row, rowIndex) => {
            const tr = body.insertRow();
            row.forEach((v, column) => {
              const cell = tr.insertCell();
              cell.textContent = String(v ?? "");
              cell.dataset.importRow = String(rowIndex);
              cell.dataset.importColumn = String(column);
            });
          });
          const scroll = document.createElement("div");
          scroll.className = "gsis-core-scroll";
          scroll.append(table);
          preview.append(h, scroll);
        }
        const edits = validate(book, doc, view, session.schoolId);
        proposed = {
          operationId: crypto.randomUUID(),
          versionId: doc.id,
          revision: doc.revision,
          scope: "meta",
          clientId: "v1-settings-import",
          edits,
        };
        confirm.disabled = !edits.length;
        show(
          edits.length + " owner operations validated. Review before saving.",
        );
      } catch (error) {
        if (ticket === epoch && error.location) {
          const { sheet, row, column } = error.location;
          const table = [...preview.querySelectorAll("table")].find(
            (t) => t.dataset.importSheet === sheet,
          );
          const cell = table?.querySelector(
            '[data-import-row="' +
              row +
              '"][data-import-column="' +
              column +
              '"]',
          );
          if (cell) {
            cell.classList.add("gsis-import-invalid");
            cell.title = error.message;
          }
        }
        if (ticket === epoch)
          show(
            error.message + " No draft data changed. Reimport to correct it.",
          );
      }
    };
    confirm.onclick = async () => {
      if (!proposed || pending) return;
      confirm.disabled = true;
      input.disabled = true;
      try {
        fail(
          api.capable("deploy.edit"),
          "Current Deploy edit access is required.",
        );
        fail(
          !window.queuedEdits?.().length,
          "Save or discard your current Deploy draft first.",
        );
        leaseRequest ??= {
          operationId: crypto.randomUUID(),
          versionId: proposed.versionId,
          revision: proposed.revision,
          scope: "meta",
          clientId: proposed.clientId,
        };
        const lease = await api.request("deploy", "/lease", {
          method: "POST",
          body: leaseRequest,
        });
        fail(
          Number.isSafeInteger(lease.fence),
          "The original edit lease is not confirmed.",
        );
        pending = proposed.operationId;
        sessionStorage.setItem(key, pending);
        check.hidden = false;
        const result = await api.request("deploy", "/change", {
          method: "POST",
          body: { ...proposed, leaseFence: lease.fence },
        });
        fail(
          result.saved === true || result.receipt?.state === "committed",
          "Import outcome is not confirmed.",
        );
        sessionStorage.removeItem(key);
        pending = null;
        check.hidden = true;
        show("Draft changes committed atomically. This did not publish.");
        document.getElementById("refresh")?.click();
      } catch (error) {
        show(
          error.message +
            (pending ? " Original operation " + pending + " is retained." : ""),
        );
        if (!pending) {
          confirm.disabled = false;
          input.disabled = false;
        }
      }
    };
    const clear = () => {
      ++epoch;
      proposed = null;
      dialog.remove();
    };
    window.addEventListener("gsis:clear-protected-state", clear, {
      once: true,
    });
    dialog.addEventListener(
      "close",
      () => {
        ++epoch;
        proposed = null;
        dialog.remove();
        window.removeEventListener("gsis:clear-protected-state", clear);
      },
      { once: true },
    );
  }
  function register() {
    const selector = views
      .map((view) =>
        '#content[data-view="' + view + '"] ' +
        (view === "Workload Settings" ? ".workload-settings table" : "table"),
      )
      .join(",");
    window.GSISCoreTables?.register(selector, {
      exportAll,
      importAll: openImport,
    });
    window.GSISCoreTables?.register(
      '#content[data-view="Workload Settings"] table[data-workload-settings-subjects]',
      { exportAll },
    );
  }
  window.GSISDeploySettingTables = { workbook, validate };
  const installWorkloadView = () =>
    installWorkloadSettingsView(
      (doc) => sheets(doc, "Workload Settings").Workload.rows,
      () => api.capable("deploy.edit"),
    );
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installWorkloadView, { once: true });
  } else installWorkloadView();
  register();
  window.addEventListener("load", register);
  window.addEventListener("gsis:tables-ready", register);
})();
