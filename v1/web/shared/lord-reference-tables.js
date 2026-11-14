/* LORD owns reference lists and inventory; staff names remain a Contacts projection. */
(function () {
  "use strict";
  const columns = {
    resources: [
      "Resource ID",
      "Trolley name",
      "Quantity",
      "Cart / group",
      "Device type",
      "Styluses",
      "Headphones",
      "Active",
      "Exclusive",
      "Preparation periods",
    ],
    classes: ["Class / group"],
    subjects: ["Subject / activity"],
    periods: ["Code", "Start", "End"],
  };
  window.GSISV1LordReferenceTables = { install };
  function install(host, api) {
    const pending = new Map();
    let revisions = {},
      resources = [],
      session = null,
      savedLists = { classes: [], subjects: [] };
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    host.append(status);
    const grids = {};
    for (const kind of Object.keys(columns)) {
      const section = document.createElement("section"),
        heading = document.createElement("h3"),
        table = document.createElement("table");
      heading.textContent = {
        resources: "Devices and trolleys",
        classes: "Classes and groups",
        subjects: "Subjects and activities",
        periods: "Period timings",
      }[kind];
      table.dataset.coreTable = "";
      table.dataset.lordReference = kind;
      const head = table.createTHead().insertRow();
      for (const title of [...columns[kind], "Actions"]) {
        const th = document.createElement("th");
        th.textContent = title;
        head.append(th);
      }
      table.createTBody();
      const add = document.createElement("button");
      add.type = "button";
      add.textContent = "Add row";
      add.onclick = () =>
        row(
          kind,
          kind === "resources"
            ? ["", "", 1, "", "", false, false, true, true, 1]
            : columns[kind].map(() => ""),
        );
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "Save " + heading.textContent.toLowerCase();
      save.onclick = () => saveGrid(kind);
      section.append(heading, table, add, save);
      host.append(section);
      grids[kind] = table;
    }
    const note = document.createElement("p");
    note.textContent =
      "Staff choices come from Contacts. Resource IDs remain permanent. Changes that would alter reserved inventory or period timings wait until existing reservations are resolved.";
    host.prepend(note);
    const reload = document.createElement("button");
    reload.textContent = "Reload saved tables";
    reload.type = "button";
    reload.onclick = () => {
      if (pending.size) {
        status.textContent = "Resolve the pending save before reloading.";
        return;
      }
      load().catch(showError);
    };
    host.prepend(reload);
    const recover = document.createElement("button");
    recover.type = "button";
    recover.textContent = "Check pending save receipts";
    recover.onclick = async () => {
      try {
        for (const [key, request] of pending) {
          const record = await api.request(
            "lord",
            "/receipt?operationId=" + encodeURIComponent(request.operationId),
          );
          if (record?.state === "committed" || record?.state === "aborted")
            pending.delete(key);
        }
        if (pending.size)
          throw Error(
            "The original save is still unconfirmed. Keep its operation identity and retry the same unchanged save.",
          );
        await load();
        status.textContent =
          "Save receipts checked; current saved tables reloaded.";
      } catch (error) {
        showError(error);
      }
    };
    host.prepend(recover);
    function showError(error) {
      status.textContent = error.message;
    }
    function row(kind, values) {
      const tr = grids[kind].tBodies[0].insertRow();
      values.forEach((value, index) => {
        const td = tr.insertCell(),
          input = document.createElement("input");
        input.setAttribute("aria-label", columns[kind][index]);
        input.dataset.column = index;
        if (kind === "resources" && index >= 5 && index <= 8) {
          input.type = "checkbox";
          input.checked = value === true;
        } else {
          if (kind === "resources")
            input.style.minWidth =
              [130, 180, 75, 150, 100, 18, 18, 18, 18, 75][index] + "px";
          input.type =
            kind === "resources" && [2, 9].includes(index)
              ? "number"
              : kind === "periods" && index > 0
                ? "time"
                : "text";
          input.value = value ?? "";
          if (input.type === "number") {
            input.min = index === 2 ? "1" : "0";
            input.max = index === 2 ? "200" : "4";
          }
          input.maxLength = kind === "periods" ? 5 : 200;
        }
        if (
          kind === "resources" &&
          index === 0 &&
          resources.some((r) => r.id === value)
        )
          input.readOnly = true;
        td.append(input);
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove row";
      remove.onclick = () => {
        if (
          kind === "resources" &&
          resources.some((r) => r.id === tr.querySelector("input").value)
        ) {
          status.textContent =
            "Existing inventory is retained. Uncheck Active, then save to retire it safely.";
          return;
        }
        tr.remove();
      };
      tr.insertCell().append(remove);
      return tr;
    }
    function values(kind) {
      return [...grids[kind].tBodies[0].rows].map((tr) =>
        [...tr.querySelectorAll("input[data-column]")].map((input) =>
          input.type === "checkbox"
            ? input.checked
            : input.type === "number"
              ? Number(input.value)
              : input.value.trim(),
        ),
      );
    }
    function render(kind, rows) {
      grids[kind].tBodies[0].replaceChildren();
      for (const data of rows) row(kind, data);
      window.GSISCoreTables?.refresh();
    }
    function resourceValues(r) {
      return [
        r.id,
        r.name,
        r.capacity,
        r.cart || "",
        r.type,
        !!r.stylusOption,
        !!r.headphoneOption,
        r.active !== false,
        r.exclusive !== false,
        r.bufferPeriods,
      ];
    }
    async function load() {
      const [ref, settings, current] = await Promise.all([
        api.request("lord", "/resources?includeInactive=1"),
        api.request("lord", "/settings"),
        api.getSession(),
      ]);
      session = current;
      resources = (ref.resources || []).sort((a, b) =>
        a.id.localeCompare(b.id),
      );
      revisions = {};
      const records = {};
      for (const record of settings.settings || []) {
        revisions[record.setting_key] = record.revision;
        records[record.setting_key] = JSON.parse(record.value_json);
      }
      savedLists = structuredClone(
        records.referenceLists || { classes: [], subjects: [] },
      );
      render("resources", resources.map(resourceValues));
      for (const k of ["classes", "subjects"])
        render(
          k,
          (records.referenceLists?.[k] || []).map((x) => [x]),
        );
      render(
        "periods",
        (records.periodTimings?.periods || []).map((p) => [
          p.code,
          p.start,
          p.end,
        ]),
      );
      status.textContent = ref.setupRequired?.length
        ? "Setup required: " + ref.setupRequired.join(", ")
        : "Saved reference tables loaded.";
    }
    async function write(key, path, body) {
      if (pending.has(key)) {
        const { operationId, ...original } = pending.get(key);
        if (JSON.stringify(original) !== JSON.stringify(body))
          throw Error(
            "An earlier save is unconfirmed. Check its receipt before changing the request.",
          );
      }
      if (!pending.has(key))
        pending.set(key, { operationId: crypto.randomUUID(), ...body });
      try {
        const result = await api.request("lord", path, {
          method: "POST",
          body: pending.get(key),
        });
        if (
          result.receipt?.state !== "committed" &&
          result.state !== "committed"
        )
          throw Error(
            "Save outcome is unknown. Retry this same save to recover its receipt.",
          );
        pending.delete(key);
        return result;
      } catch (error) {
        try {
          const receipt = await api.request(
            "lord",
            "/receipt?operationId=" +
              encodeURIComponent(pending.get(key).operationId),
          );
          if (receipt?.state === "aborted") pending.delete(key);
        } catch {}
        throw error;
      }
    }
    function validate(kind, rows) {
      if (rows.length > 2000) throw Error("At most 2,000 rows are supported.");
      if (kind === "periods" && (rows.length < 1 || rows.length > 41))
        throw Error("Use between one and 41 period rows.");
      if (rows.some((r) => r.length !== columns[kind].length))
        throw Error("The column count does not match.");
      if (
        new Set(rows.map((r) => String(r[0]).toLowerCase())).size !==
        rows.length
      )
        throw Error("Duplicate labels or IDs are not permitted.");
      for (const r of rows) {
        if (!String(r[0] || "").trim())
          throw Error("Every row needs a label or ID.");
        if (
          ["classes", "subjects"].includes(kind) &&
          (typeof r[0] !== "string" ||
            r[0] !== r[0].trim() ||
            r[0].length > 200)
        )
          throw Error("Labels must be trimmed text of at most 200 characters.");
        if (kind === "resources") {
          if (
            !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(r[0]) ||
            typeof r[0] !== "string" ||
            r[0].length > 128 ||
            typeof r[1] !== "string" ||
            r[1].length > 160 ||
            typeof r[3] !== "string" ||
            r[3].length > 160 ||
            typeof r[4] !== "string" ||
            r[4].length > 80 ||
            !r[1] ||
            !r[4] ||
            !Number.isInteger(r[2]) ||
            r[2] < 1 ||
            r[2] > 200 ||
            !Number.isInteger(r[9]) ||
            r[9] < 0 ||
            r[9] > 4 ||
            r.slice(5, 9).some((v) => typeof v !== "boolean")
          )
            throw Error(
              "Check resource IDs, names, types, quantities and yes/no fields.",
            );
        }
        if (
          kind === "periods" &&
          (!/^\d{1,2}$/.test(String(r[0])) ||
            r.slice(1).some((v) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) ||
            r[1] >= r[2])
        )
          throw Error(
            "Periods need numeric codes and an increasing start/end time.",
          );
      }
      if (kind === "periods" && rows.some((r, i) => i && r[1] < rows[i - 1][2]))
        throw Error("Periods must be chronological and cannot overlap.");
    }
    async function saveRows(kind, rows) {
      validate(kind, rows);
      if (kind === "resources") {
        const changed = rows.filter((r) => {
          const old = resources.find((x) => x.id === r[0]);
          return (
            !old || JSON.stringify(resourceValues(old)) !== JSON.stringify(r)
          );
        });
        if (!changed.length) return 0;
        if (changed.length > 200)
          throw Error(
            "One atomic save supports up to 200 changed resource rows.",
          );
        const result = await write("resources", "/resources/batch", {
          resources: changed.map((r) => ({
            revision: resources.find((x) => x.id === r[0])?.revision || 0,
            resourceId: r[0],
            name: r[1],
            capacity: r[2],
            type: r[4],
            metadata: { cart: r[3], stylusOption: r[5], headphoneOption: r[6] },
            active: r[7],
            exclusive: r[8],
            bufferPeriods: r[9],
          })),
        });
        for (const r of changed) {
          const record = {
              id: r[0],
              name: r[1],
              capacity: r[2],
              cart: r[3],
              type: r[4],
              stylusOption: r[5],
              headphoneOption: r[6],
              active: r[7],
              exclusive: r[8],
              bufferPeriods: r[9],
              revision: result.resources.find((v) => v.resourceId === r[0])
                .revision,
            },
            old = resources.find((v) => v.id === r[0]);
          if (old) Object.assign(old, record);
          else resources.push(record);
        }
        resources.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        return changed.length;
      }
      const key = kind === "periods" ? "periodTimings" : "referenceLists";
      const value =
        kind === "periods"
          ? {
              periods: rows.map((r) => ({
                code: String(r[0]),
                start: r[1],
                end: r[2],
              })),
            }
          : { ...savedLists, [kind]: rows.map((r) => r[0]) };
      const result = await write(key, "/settings", {
        key,
        revision: revisions[key] || 0,
        value,
      });
      revisions[key] = result.revision;
      if (key === "referenceLists") savedLists = structuredClone(value);
      return rows.length;
    }
    async function saveGrid(kind) {
      try {
        const saved = await saveRows(kind, values(kind));
        status.textContent = "Atomic save confirmed: " + saved + " rows.";
      } catch (error) {
        status.textContent = error.message;
      }
    }
    function openImport(kind) {
      const dialog = document.createElement("dialog");
      dialog.className = "gsis-import-preview gsis-lord-import";
      dialog.setAttribute("aria-label", "Import LORD " + kind);
      const title = document.createElement("h2");
      title.textContent = "Import " + kind;
      const file = document.createElement("input");
      file.type = "file";
      file.accept = ".xlsx";
      file.setAttribute("aria-label", "Choose or replace Excel workbook");
      const state = document.createElement("p");
      state.setAttribute("role", "status");
      state.textContent =
        "Choose Export All or the matching Google backup workbook. Review the change set before one atomic save.";
      const preview = document.createElement("div"),
        commit = document.createElement("button"),
        close = document.createElement("button");
      commit.textContent = "Confirm atomic import";
      commit.disabled = true;
      close.textContent = "Close";
      close.onclick = () => dialog.close();
      dialog.append(title, file, state, preview, commit, close);
      document.body.append(dialog);
      dialog.showModal();
      dialog.onclose = () => dialog.remove();
      let imported = null,
        epoch = 0;
      function revision() {
        return kind === "resources"
          ? JSON.stringify(resources.map((r) => [r.id, r.revision]))
          : String(
              revisions[
                kind === "periods" ? "periodTimings" : "referenceLists"
              ] || 0,
            );
      }
      file.onchange = async () => {
        const generation = ++epoch;
        commit.disabled = true;
        imported = null;
        preview.replaceChildren();
        state.style.color = "";
        try {
          if (pending.size)
            throw Error(
              "Resolve the original pending save before replacing its workbook.",
            );
          const { decodeWorkbook } = await import("./workbooks.mjs");
          const wb = await decodeWorkbook(await file.files[0].arrayBuffer());
          if (generation !== epoch) return;
          const meta = wb.metadata,
            sheet = wb.sheets.Reference;
          if (
            Number(meta.schemaVersion) !== 1 ||
            meta.owner !== "lord" ||
            meta.schoolId !== (session?.schoolId || "") ||
            meta.table !== kind ||
            String(meta.sourceRevision) !== revision() ||
            meta.mode !== "import" ||
            JSON.stringify(sheet?.columns) !== JSON.stringify(columns[kind])
          )
            throw Error(
              "Use a matching, current Export All workbook from this school and table.",
            );
          const old = values(kind),
            table = document.createElement("table");
          table.dataset.noTableTools = "";
          const header = table.createTHead().insertRow();
          for (const label of ["Change", ...columns[kind]]) {
            const th = document.createElement("th");
            th.textContent = label;
            header.append(th);
          }
          const body = table.createTBody();
          let invalid = false,
            changes = 0;
          for (const row of sheet.rows) {
            const tr = body.insertRow(),
              prior = old.find((v) => v[0] === row[0]),
              change = !prior
                ? "Add"
                : JSON.stringify(prior) === JSON.stringify(row)
                  ? "Unchanged"
                  : "Change";
            if (change !== "Unchanged") changes++;
            tr.insertCell().textContent = change;
            for (const value of row)
              tr.insertCell().textContent = String(value ?? "");
            try {
              validate(kind, [row]);
            } catch (error) {
              invalid = true;
              tr.className = "gsis-import-invalid";
              tr.style.background = "#fee2e2";
              tr.style.color = "#9b1c1c";
              tr.title = error.message;
            }
          }
          for (const row of old.filter(
            (r) => !sheet.rows.some((v) => v[0] === r[0]),
          )) {
            changes++;
            const tr = body.insertRow();
            tr.insertCell().textContent = "Remove";
            for (const value of row)
              tr.insertCell().textContent = String(value ?? "");
          }
          preview.append(table);
          validate(kind, sheet.rows);
          if (invalid)
            throw Error(
              "Correct the highlighted invalid rows and upload a replacement file.",
            );
          if (
            kind === "resources" &&
            resources.some((r) => !sheet.rows.some((x) => x[0] === r.id))
          )
            throw Error(
              "Keep existing resource rows; use Active=false to retire inventory.",
            );
          if (kind === "resources" && changes > 200)
            throw Error(
              "One atomic import supports up to 200 changed resources.",
            );
          imported = sheet.rows;
          commit.disabled = false;
          state.textContent =
            changes +
            " changed rows. No rows are written until confirmation; any conflict rejects the whole import.";
        } catch (error) {
          state.textContent = error.message;
          state.style.color = "#9b1c1c";
          if (!preview.querySelector(".gsis-import-invalid"))
            preview.querySelectorAll("tbody tr").forEach((r) => {
              r.style.background = "#fee2e2";
            });
        }
      };
      commit.onclick = async () => {
        if (!imported) return;
        commit.disabled = true;
        file.disabled = true;
        try {
          await saveRows(kind, imported);
          render(kind, imported);
          state.textContent =
            "Atomic import committed. All changes saved together.";
          imported = null;
        } catch (error) {
          state.textContent = error.message;
          state.style.color = "#9b1c1c";
          commit.disabled = false;
        } finally {
          file.disabled = pending.size > 0;
        }
      };
    }
    function register() {
      if (!window.GSISCoreTables) return;
      for (const kind of Object.keys(grids)) {
        window.GSISCoreTables.register(
          'table[data-lord-reference="' + kind + '"]',
          {
            async exportAll() {
              const { encodeWorkbook, download } =
                await import("./workbooks.mjs");
              const rows = values(kind);
              validate(kind, rows);
              download(
                await encodeWorkbook({
                  metadata: {
                    schemaVersion: 1,
                    owner: "lord",
                    schoolId: session?.schoolId || "",
                    table: kind,
                    sourceRevision:
                      kind === "resources"
                        ? JSON.stringify(
                            resources.map((r) => [r.id, r.revision]),
                          )
                        : String(
                            revisions[
                              kind === "periods"
                                ? "periodTimings"
                                : "referenceLists"
                            ] || 0,
                          ),
                    mode: "import",
                  },
                  sheets: { Reference: { columns: columns[kind], rows } },
                }),
                "LORD-" + kind + "-All.xlsx",
              );
            },
            importAll() {
              openImport(kind);
            },
          },
        );
      }
    }
    register();
    window.addEventListener("gsis:tables-ready", register);
    load().catch(showError);
    return { load };
  }
})();
