(function () {
  "use strict";
  function sync() {
    const active = !!document.querySelector(
      "#signature.active,#signatureSettings.active",
    );
    if (
      document.documentElement.classList.contains("gsis-contacts-signature") !==
      active
    )
      document.documentElement.classList.toggle(
        "gsis-contacts-signature",
        active,
      );
  }
  new MutationObserver(sync).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  document.addEventListener("click", sync);
  sync();
})();

/* Contacts owns this bounded, atomic import. Authority acceptance is never inferred. */
(function () {
  "use strict";
  const api = window.GSISV1;
  if (!api) return;
  let dialog,
    status,
    preview,
    fileInput,
    confirmButton,
    receiptButton,
    readEpoch = 0,
    request = null,
    storageKey = "",
    unresolved = null,
    mode = "manage",
    securityEpoch = 0;
  const values = (row) => row.values.map((v) => String(v ?? ""));
  async function context() {
    const session = await api.getSession();
    if (!session?.schoolId) throw Error("Sign in to Contacts first.");
    storageKey =
      "gsis-contacts-import:" +
      session.schoolId +
      ":" +
      session.user.accountId +
      ":" +
      mode;
    unresolved = sessionStorage.getItem(storageKey);
    return session;
  }
  async function exportAll(scope = "manage") {
    const epoch = securityEpoch;
    const [data, session] = await Promise.all([
      api.request("contacts", scope === "self" ? "/diy" : "/data"),
      api.getSession(),
    ]);
    const { encodeWorkbook, download } = await import("./workbooks.mjs");
    const columns = ["Staff ID", ...data.fields],
      rows = data.rows.map((r) => [r.id, ...values(r)]);
    const bytes = await encodeWorkbook({
      metadata: {
        Schema: "gsis.contacts.grid.v1",
        Scope: scope,
        "School ID": session.schoolId,
        "Exported At": new Date().toISOString(),
        Revision: String(data.revision),
        "Import semantics":
          "Update existing editable cells only; omitted staff are unchanged. Maximum 64 cells / 16 staff per atomic import.",
      },
      sheets: { Contacts: { columns, rows }, Baseline: { columns, rows } },
    });
    if (epoch !== securityEpoch)
      throw Error("Session changed. Export cancelled.");
    download(bytes, "GSiS-Contacts-All.xlsx");
  }
  function validate(workbook, data, schoolId, scope = "manage") {
    const errors = [],
      changes = [],
      sheet = workbook.sheets?.Contacts,
      baseline = workbook.sheets?.Baseline,
      columns = ["Staff ID", ...data.fields];
    if (
      workbook.metadata?.Schema !== "gsis.contacts.grid.v1" ||
      workbook.metadata?.["School ID"] !== schoolId
    )
      errors.push({ message: "Use an Export All workbook from this school." });
    if (
      !sheet ||
      !baseline ||
      JSON.stringify(sheet.columns) !== JSON.stringify(columns) ||
      JSON.stringify(baseline.columns) !== JSON.stringify(columns)
    )
      return {
        changes,
        errors: [
          ...errors,
          {
            message:
              "Contacts and Baseline columns must match the current schema exactly.",
          },
        ],
      };
    const originals = new Map(),
      current = new Map(data.rows.map((r) => [r.id, r])),
      seen = new Set();
    for (const row of baseline.rows) {
      if (originals.has(row[0]) || row.length !== columns.length)
        errors.push({
          message: "Baseline has duplicate identities or invalid columns.",
        });
      originals.set(row[0], row);
    }
    sheet.rows.forEach((row, index) => {
      const id = row[0],
        prior = originals.get(id),
        now = current.get(id);
      if (seen.has(id) || !prior || !now || row.length !== columns.length) {
        errors.push({
          row: index,
          column: 0,
          message:
            "Unknown, duplicate or malformed permanent Staff ID. Add new people using Contacts first.",
        });
        return;
      }
      seen.add(id);
      row.slice(1).forEach((value, i) => {
        const proposed = String(value ?? ""),
          before = String(prior[i + 1] ?? "");
        if (proposed === before) return;
        if (
          now.computed?.[i] ||
          (scope === "self" &&
            !["Statutory Name", "Mobile No"].includes(data.fields[i]))
        )
          errors.push({
            row: index,
            column: i + 1,
            message:
              data.fields[i] +
              " is a derived/reference field. Use its owning editor.",
          });
        else if (String(now.values[i] ?? "") !== before)
          errors.push({
            row: index,
            column: i + 1,
            message:
              data.fields[i] +
              " changed after export. Export again and reconcile.",
          });
        else if (proposed.length > 4096)
          errors.push({
            row: index,
            column: i + 1,
            message: "Value exceeds the field limit.",
          });
        else
          changes.push({
            id,
            field: data.fields[i],
            expected: before,
            value: proposed,
          });
      });
    });
    if (!data.editable || (scope !== "self" && !api.capable("contacts.manage")))
      errors.push({
        message: "Current Contacts management access is required.",
      });
    if (changes.length > 64 || new Set(changes.map((c) => c.id)).size > 16)
      errors.push({
        message:
          "An atomic import supports at most 64 edited cells across 16 staff. No rows will be saved. Reduce the changes and reimport.",
      });
    return { changes, errors };
  }
  function message(value) {
    status.textContent = value;
  }
  function clearPending() {
    sessionStorage.removeItem(storageKey);
    unresolved = null;
    request = null;
    receiptButton.hidden = true;
    fileInput.disabled = false;
  }
  async function checkReceipt() {
    if (!unresolved) return;
    try {
      const result = await api.request("contacts", "/save-receipt", {
        method: "POST",
        body: { operationId: unresolved },
      });
      if (
        result.saved === true ||
        result.state === "committed" ||
        result.receipt?.state === "committed"
      ) {
        clearPending();
        message(
          "The original import committed. Reload Contacts to see saved data.",
        );
        document.getElementById("reloadData")?.click();
        document.getElementById("refresh")?.click();
      } else if (
        result.state === "terminal-not-committed" ||
        result.receipt?.state === "terminal-not-committed"
      ) {
        clearPending();
        message(
          "The original import did not commit. Reimport a current workbook to try a new operation.",
        );
      } else
        message(
          "Original operation " +
            unresolved +
            " is " +
            (result.state || "unconfirmed") +
            ". Check again before starting another import.",
        );
    } catch (error) {
      message(
        error.message + " Original operation " + unresolved + " is retained.",
      );
    }
  }
  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement("dialog");
    dialog.className = "gsis-import-preview";
    dialog.setAttribute("aria-label", "Import Contacts workbook");
    const title = document.createElement("h2");
    title.textContent = "Import Contacts";
    const help = document.createElement("p");
    help.textContent =
      "Only editable fields on existing staff records can change here. All changes are validated together; authority acceptance uses its separate controls.";
    fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".xlsx";
    fileInput.setAttribute("aria-label", "Import Contacts workbook");
    fileInput.onchange = readWorkbook;
    status = document.createElement("p");
    status.setAttribute("role", "status");
    preview = document.createElement("div");
    confirmButton = document.createElement("button");
    confirmButton.textContent = "Confirm atomic import";
    confirmButton.disabled = true;
    confirmButton.onclick = commit;
    receiptButton = document.createElement("button");
    receiptButton.textContent = "Check original import receipt";
    receiptButton.hidden = true;
    receiptButton.onclick = checkReceipt;
    const close = document.createElement("button");
    close.textContent = "Close";
    close.onclick = () => dialog.close();
    dialog.append(
      title,
      help,
      fileInput,
      status,
      preview,
      confirmButton,
      receiptButton,
      close,
    );
    document.body.append(dialog);
  }
  async function openImport(scope = "manage") {
    mode = scope;
    ensureDialog();
    await context();
    dialog.showModal();
    fileInput.disabled = !!unresolved;
    receiptButton.hidden = !unresolved;
    if (unresolved) {
      confirmButton.disabled = true;
      message(
        "Unconfirmed import " +
          unresolved +
          ". Check its original receipt before another import.",
      );
    } else
      message(
        "Choose the matching Export All workbook. No data changes before confirmation.",
      );
  }
  async function readWorkbook() {
    const epoch = ++readEpoch;
    const file = fileInput.files?.[0];
    if (!file) return;
    request = null;
    confirmButton.disabled = true;
    preview.replaceChildren();
    try {
      message("Reading and validating…");
      const { decodeWorkbook } = await import("./workbooks.mjs");
      const workbook = await decodeWorkbook(await file.arrayBuffer());
      const [data, session] = await Promise.all([
        api.request("contacts", mode === "self" ? "/diy" : "/data"),
        context(),
      ]);
      if (epoch !== readEpoch) return;
      if (unresolved) throw Error("An earlier import must be resolved first.");
      const result = validate(workbook, data, session.schoolId, mode),
        sheet = workbook.sheets?.Contacts;
      if (sheet) {
        const table = document.createElement("table");
        table.className = "gsis-code";
        const head = table.createTHead().insertRow();
        sheet.columns.forEach((label) => {
          const cell = document.createElement("th");
          cell.textContent = label;
          head.append(cell);
        });
        const body = table.createTBody();
        sheet.rows.forEach((row, index) => {
          const tr = body.insertRow();
          row.forEach((value, column) => {
            const td = tr.insertCell();
            td.textContent = String(value ?? "");
            const errors = result.errors.filter(
              (e) => e.row === index && e.column === column,
            );
            if (errors.length) {
              td.className = "gsis-import-invalid";
              td.title = errors.map((e) => e.message).join(" ");
            }
          });
        });
        const scroll = document.createElement("div");
        scroll.className = "gsis-core-scroll";
        scroll.append(table);
        preview.append(scroll);
      }
      for (const error of result.errors) {
        const p = document.createElement("p");
        p.className = "gsis-error";
        p.textContent = error.message;
        preview.append(p);
      }
      if (!result.errors.length && result.changes.length) {
        request = {
          operationId: crypto.randomUUID(),
          changes: result.changes,
          additions: [],
        };
        confirmButton.disabled = false;
      }
      message(
        result.errors.length
          ? "Resolve the errors and reimport. No data changed."
          : result.changes.length +
              " editable cells will change. Omitted staff and unchanged cells remain unchanged.",
      );
    } catch (error) {
      if (epoch === readEpoch) message(error.message);
    }
  }
  async function commit() {
    if (!request || unresolved) return;
    confirmButton.disabled = true;
    fileInput.disabled = true;
    unresolved = request.operationId;
    sessionStorage.setItem(storageKey, unresolved);
    receiptButton.hidden = false;
    try {
      const result = await api.request(
        "contacts",
        mode === "self" ? "/save-diy" : "/save-data",
        {
          method: "POST",
          body: request,
        },
      );
      if (result.saved !== true && result.receipt?.state !== "committed")
        throw Error("Import outcome is not confirmed.");
      clearPending();
      message(
        "Import committed atomically. Reload Contacts to see saved data.",
      );
      document.getElementById("reloadData")?.click();
      document.getElementById("refresh")?.click();
    } catch (error) {
      message(
        error.message +
          " Original operation " +
          unresolved +
          " is retained; check its receipt.",
      );
    }
  }
  function register() {
    window.GSISCoreTables?.register("#dataGrid table", {
      exportAll: () => exportAll("manage"),
      importAll: () => openImport("manage"),
    });
    window.GSISCoreTables?.register("#diyGrid table", {
      exportAll: () => exportAll("self"),
      importAll: () => openImport("self"),
    });
  }
  window.GSISContactsTables = { validate, exportAll, openImport };
  register();
  window.addEventListener("load", register);
  window.addEventListener("gsis:clear-protected-state", () => {
    ++readEpoch;
    ++securityEpoch;
    dialog?.remove();
    dialog = null;
    request = null;
    unresolved = null;
  });
})();
