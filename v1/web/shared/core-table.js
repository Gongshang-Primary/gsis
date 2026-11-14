/* Presentation tools. Canonical writes are possible only through an owning adapter. */
(function () {
  "use strict";
  const states = new Map(),
    adapters = new Map(),
    preferences = new Map();
  let scheduled = false,
    securityEpoch = 0;
  window.addEventListener("gsis:clear-protected-state", () => {
    securityEpoch++;
  });
  function text(node, header = false) {
    if (!node) return "";
    if (node.nodeType === 3) return node.textContent;
    if (
      node.nodeType !== 1 ||
      node.hidden ||
      node.matches(
        "script,style,svg,template,.column-copy,.gsis-core-sort,[data-export-ignore],[data-core-resize]",
      )
    )
      return "";
    if (node.matches("button") && !header) return "";
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return "";
    if (node.matches("details:not([open])"))
      return text(node.querySelector(":scope > summary"), header);
    if (node.dataset.exportValue !== undefined) return node.dataset.exportValue;
    if (node.matches("input"))
      return ["hidden", "search", "button", "submit"].includes(node.type)
        ? ""
        : ["checkbox", "radio"].includes(node.type)
          ? node.checked
            ? "Yes"
            : "No"
          : node.value;
    if (node.matches("select"))
      return [...node.selectedOptions].map((e) => e.textContent).join(", ");
    if (node.matches("textarea")) return node.value;
    return [...node.childNodes]
      .map((child) => text(child, header))
      .join(node.matches("td,th") ? " " : "")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }
  const visible = (e) =>
    !!e &&
    !e.hidden &&
    !!e.getClientRects().length &&
    getComputedStyle(e).visibility !== "hidden";
  function report(table) {
    const state = states.get(table);
    if (!state) return { headers: [], rows: [] };
    const grid = window.GSISTableTools?.grid(table);
    if (state.complex && grid) {
      const selected = Array.from({ length: grid.width }, (_, i) => i).filter(
        (i) =>
          grid.cells
            .filter(
              (e) => grid.headSet.has(e.row) && i >= e.c && i < e.c + e.cols,
            )
            .every((e) => visible(e.cell)),
      );
      return {
        headers: selected.map((i) => grid.labels[i]),
        rows: grid.rows.flatMap((row, r) =>
          grid.headSet.has(row) ||
          !visible(row) ||
          row.dataset.exportIgnore !== undefined
            ? []
            : [
                selected.map((i) => {
                  const cell = grid.matrix[r]?.[i]?.cell;
                  return visible(cell) ? text(cell) : "";
                }),
              ],
        ),
      };
    }
    const selected = state.labels
      .map((_, i) => i)
      .filter((i) => !state.hidden.has(i) && visible(state.head.cells[i]));
    return {
      headers: selected.map((i) => state.labels[i]),
      rows: dataRows(table)
        .filter(visible)
        .map((row) =>
          selected.map((i) =>
            visible(row.cells[i]) ? text(row.cells[i]) : "",
          ),
        ),
    };
  }
  function adapter(table) {
    for (const [key, value] of [...adapters].reverse())
      if (table.matches(key)) return value;
    return null;
  }
  function dataRows(table) {
    return [...table.tBodies]
      .flatMap((b) => [...b.rows])
      .filter(
        (r) =>
          !r.closest("thead") &&
          !r.classList.contains("column-filters") &&
          !(r.cells.length === 1 && r.cells[0].colSpan > 1),
      );
  }
  function enhance(table) {
    if (
      table.matches(".weekly-grid,.timetable-grid,[data-schedule-matrix]") ||
      !visible(table) ||
      table.dataset.noTableTools !== undefined ||
      (table.closest("dialog") && !table.matches("[data-core-table]")) ||
      table.dataset.plainTable !== undefined
    )
      return;
    let state = states.get(table);
    if (state) {
      if (!state.bar.isConnected || !state.head.isConnected) {
        const nativePicker = state.bar.querySelector(":scope > .column-picker");
        if (nativePicker) state.bar.before(nativePicker);
        state.bar.remove();
        window.removeEventListener("gsis:table-adapters", state.contracts);
        states.delete(table);
        enhance(table);
        const replacement = states.get(table);
        if (nativePicker && replacement) {
          replacement.bar.prepend(nativePicker);
          const ownPicker = replacement.bar.querySelector(":scope > details");
          if (ownPicker) ownPicker.hidden = true;
        }
        return;
      }
      state.apply?.();
      return;
    }
    const head = [...(table.tHead?.rows || [])]
      .filter((row) => !row.matches(".column-filters,.gsis-core-filter"))
      .at(-1);
    if (!head || !head.cells.length) return;
    // Keep timetable and merged-row geometry under the owning table's controls.
    const complex =
      table.matches(".group-table") ||
      [...table.querySelectorAll("th,td")]
        .filter(
          (c) =>
            !(
              c.tagName === "TD" &&
              c.parentElement.cells.length === 1 &&
              c.colSpan > 1
            ),
        )
        .some((c) => c.colSpan > 1 || c.rowSpan > 1);

    const labels = [...head.cells].map((cell) => text(cell, true)),
      bar = document.createElement("div");
    bar.className = "gsis-core-tools";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Table controls");
    const preferenceKey =
      (window.GSISV1?.module || "") +
      ":" +
      (table.id || table.parentElement?.id || "") +
      ":" +
      labels.join("|");
    state = {
      bar,
      labels,
      head,
      complex,
      filters: labels.map(() => ""),
      hidden: new Set(),
      sort: null,
      widths: preferences.get(preferenceKey) || [],
      ownedHidden: new WeakSet(),
      ownedCells: new WeakSet(),
      ownerHidden: new WeakSet(),
      ownerColumns: new Set(
        [...head.cells].flatMap((cell, i) => (visible(cell) ? [] : [i])),
      ),
    };
    states.set(table, state);
    table.classList.add("gsis-core-table");
    const old =
      table.closest(".table-window,.gsis-core-scroll")
        ?.previousElementSibling || table.previousElementSibling;
    if (old?.classList.contains("gsis-table-tools")) old.hidden = true;
    table.dataset.nativeTableTools = "";
    const anchor = table.closest(".table-window,.gsis-core-scroll") || table;
    anchor.before(bar);
    if (!table.closest(".table-window,.gsis-scroll,.gsis-core-scroll")) {
      const wrap = document.createElement("div");
      wrap.className = "gsis-core-scroll";
      table.before(wrap);
      wrap.append(table);
    }
    const columns = document.createElement("details"),
      summary = document.createElement("summary"),
      choices = document.createElement("div");
    summary.textContent = "Columns";
    columns.append(summary, choices);
    bar.append(columns);
    if (table.dataset.noColumnControls === "true") columns.hidden = true;
    const status = document.createElement("span"),
      countStatus = document.createElement("span");
    status.setAttribute("role", "status");
    function apply() {
      if (!complex)
        for (const row of dataRows(table)) {
          const owned = state.ownedHidden.has(row);
          if (row.hidden && !owned) continue;
          const filtered = state.filters.some(
            (q, i) =>
              q &&
              !text(row.cells[i] || document.createElement("td"))
                .toLocaleLowerCase()
                .includes(q),
          );
          if (row.hidden !== filtered) row.hidden = filtered;
          if (filtered) state.ownedHidden.add(row);
          else state.ownedHidden.delete(row);
        }
      if (!complex)
        for (const row of table.rows)
          [...row.cells].forEach((c, i) => {
            if (c.hidden && !state.ownedCells.has(c)) state.ownerHidden.add(c);
            const hide = state.ownerColumns.has(i) || state.hidden.has(i);
            const hidden = hide || state.ownerHidden.has(c);
            if (c.hidden !== hidden) c.hidden = hidden;
            if (hide) state.ownedCells.add(c);
            else state.ownedCells.delete(c);
          });
      const count =
        dataRows(table).filter((r) => visible(r)).length +
        " / " +
        dataRows(table).length +
        " rows";
      if (countStatus.textContent !== count) countStatus.textContent = count;
      window.GSISTableRefresh?.();
    }
    if (!complex)
      labels.forEach((label, i) => {
        if (state.ownerColumns.has(i)) return;
        const line = document.createElement("label"),
          box = document.createElement("input");
        box.type = "checkbox";
        box.checked = true;
        line.append(box, document.createTextNode(label || "Column " + (i + 1)));
        box.onchange = () => {
          if (
            !box.checked &&
            state.hidden.size + state.ownerColumns.size === labels.length - 1
          ) {
            box.checked = true;
            return;
          }
          box.checked ? state.hidden.delete(i) : state.hidden.add(i);
          apply();
        };
        choices.append(line);
      });
    const filters = complex
      ? document.createElement("tr")
      : table.tHead.insertRow();
    filters.className = "gsis-core-filter";
    filters.dataset.exportIgnore = "";
    if (!complex)
      labels.forEach((label, i) => {
        const th = document.createElement("th"),
          input = document.createElement("input");
        input.type = "search";
        input.placeholder = "Filter…";
        input.setAttribute("aria-label", "Filter " + label);
        input.oninput = () => {
          state.filters[i] = input.value.trim().toLocaleLowerCase();
          apply();
        };
        input.onclick = (e) => e.stopPropagation();
        th.append(input);
        filters.append(th);
        const cell = head.cells[i],
          sort = document.createElement("button");
        sort.type = "button";
        sort.className = "gsis-core-sort";
        sort.textContent = "↕";
        sort.setAttribute("aria-label", "Sort " + label);
        if (
          table.dataset.noSort === "true" ||
          table.matches(
            '[data-lord-reference="periods"],[data-preserve-row-order]',
          )
        ) {
          sort.disabled = true;
          sort.title = "This editor preserves its required row order.";
        }
        sort.onclick = (e) => {
          e.stopPropagation();
          const direction =
            state.sort?.column === i ? -state.sort.direction : 1;
          state.sort = { column: i, direction };
          const rows = dataRows(table);
          rows.sort(
            (a, b) =>
              text(a.cells[i]).localeCompare(text(b.cells[i]), undefined, {
                numeric: true,
                sensitivity: "base",
              }) * direction,
          );
          for (const row of rows) row.parentElement.append(row);
          [...head.cells].forEach((c) => c.removeAttribute("aria-sort"));
          cell.setAttribute(
            "aria-sort",
            direction === 1 ? "ascending" : "descending",
          );
        };
        cell.append(sort);
        const handle = document.createElement("span");
        handle.dataset.coreResize = "";
        handle.setAttribute("role", "separator");
        handle.setAttribute("aria-label", "Resize " + label);
        handle.tabIndex = 0;
        function size(width) {
          state.widths[i] = Math.max(65, Math.min(900, width));
          cell.style.minWidth = cell.style.width = state.widths[i] + "px";
          preferences.set(preferenceKey, state.widths.slice());
        }
        handle.onpointerdown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const start = e.clientX,
            width = cell.getBoundingClientRect().width;
          handle.setPointerCapture(e.pointerId);
          handle.onpointermove = (m) => size(width + m.clientX - start);
          handle.onpointerup = () => {
            handle.onpointermove = null;
          };
        };
        handle.onkeydown = (e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            size(
              cell.getBoundingClientRect().width +
                (e.key === "ArrowRight" ? 10 : -10),
            );
          }
        };
        cell.append(handle);
        if (state.widths[i]) size(state.widths[i]);
      });
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Clear filters";
    reset.onclick = () => {
      state.filters.fill("");
      filters.querySelectorAll("input").forEach((i) => (i.value = ""));
      apply();
    };
    if (!complex) bar.append(reset);
    else {
      columns.hidden = true;
      const help = document.createElement("span");
      help.textContent = "Use the view’s filters for this grouped table.";
      bar.append(help);
    }
    const compact = document.createElement("button");
    compact.type = "button";
    compact.textContent = "Compact";
    compact.onclick = () => {
      state.widths = [];
      preferences.delete(preferenceKey);
      [...head.cells].forEach((c) => {
        c.style.width = "";
        c.style.minWidth = "";
      });
      window.GSISTableRefresh?.();
    };
    bar.append(compact);
    const mode = document.createElement("select");
    mode.setAttribute("aria-label", "Excel export scope");
    mode.add(new Option("Export Visible · report", "visible"));
    mode.add(new Option("Export All · import template", "all"));
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.textContent = "Export Excel";
    exportButton.onclick = async () => {
      const epoch = securityEpoch;
      try {
        const contract = adapter(table);
        if (mode.value === "all") {
          if (!contract?.exportAll)
            throw Error(
              "Import-compatible Export All is not yet available for this table. Export Visible is a report only.",
            );
          await contract.exportAll(table);
          return;
        }
        const { encodeWorkbook, download } = await import("./workbooks.mjs");
        const snapshot = report(table),
          rows = snapshot.rows,
          columns = snapshot.headers;
        const bytes = await encodeWorkbook({
          metadata: {
            "Export Kind": "Visible report — not an import template",
            Module: window.GSISV1?.module || "",
            "Exported At": new Date().toISOString(),
          },
          sheets: { Report: { columns, rows } },
        });
        if (epoch !== securityEpoch)
          throw Error("Session changed. Export cancelled.");
        download(
          bytes,
          "GSiS-" + (window.GSISV1?.module || "Table") + "-Visible.xlsx",
        );
        status.textContent = "Exported " + rows.length + " visible rows.";
      } catch (e) {
        status.textContent = e.message;
      }
    };
    const importButton = document.createElement("button");
    importButton.type = "button";
    importButton.className = "gsis-core-import";
    importButton.textContent = "Import Excel";
    importButton.onclick = async () => {
      try {
        await adapter(table)?.importAll?.(table);
      } catch (error) {
        status.textContent = error.message;
      }
    };
    function contracts() {
      const a = adapter(table);
      mode.options[1].disabled = !a?.exportAll;
      importButton.disabled = !a?.importAll;
      importButton.title = a?.importAll
        ? "Import the matching Export All workbook; validation and preview are required."
        : "This table has no approved bulk-import adapter yet. Use its normal editing controls.";
    }
    state.apply = apply;
    bar.append(mode, exportButton, importButton, countStatus, status);
    state.contracts = contracts;
    contracts();
    bar.addEventListener("pointerenter", contracts);
    window.addEventListener("gsis:table-adapters", contracts);
    apply();
  }
  function refresh() {
    scheduled = false;
    for (const [table, state] of states) {
      if (!table.isConnected) {
        state.bar.remove();
        window.removeEventListener("gsis:table-adapters", state.contracts);
        states.delete(table);
      }
    }
    document.querySelectorAll("table").forEach(enhance);
    document.querySelectorAll(".gsis-table-tools").forEach((old) => {
      let next = old.nextElementSibling;
      for (let i = 0; next && i < 5; i++, next = next.nextElementSibling) {
        const table = next.matches("table")
            ? next
            : next.querySelector("table"),
          state = table && states.get(table);
        const core = next.matches(".gsis-core-tools") ? next : state?.bar;
        if (core) {
          const picker = old.querySelector(".column-picker");
          if (picker) {
            core.prepend(picker);
            const generic = core.querySelector(":scope > details");
            if (generic) generic.hidden = true;
          }
          if (!old.hidden) old.hidden = true;
          break;
        }
      }
    });
  }
  function schedule() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(refresh);
    }
  }
  new MutationObserver((records) => {
    if (
      records.some(
        (r) => !r.target.closest?.(".gsis-core-tools,.gsis-core-filter"),
      )
    )
      schedule();
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("click", schedule);
  document.addEventListener("input", (e) => {
    if (e.target.closest("tbody")) schedule();
  });
  window.GSISCoreTables = {
    report,
    register(selector, contract) {
      adapters.set(selector, contract);
      dispatchEvent(new Event("gsis:table-adapters"));
      schedule();
    },
    refresh: schedule,
  };
  dispatchEvent(new Event("gsis:tables-ready"));
  schedule();
})();
