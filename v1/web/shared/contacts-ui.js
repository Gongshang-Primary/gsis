// Clear private presentation once per client context, before asynchronous storage cleanup.
function onContactsContextClear(clear) {
  let observed = window.GSISV1?.saveStatus?.().contextEpoch;
  const reconcile = (event) => {
    const current = window.GSISV1?.saveStatus?.().contextEpoch;
    if (current !== undefined) {
      if (current === observed) return;
      observed = current;
      clear();
    } else if (event.type === "gsis:clear-protected-state") clear();
  };
  window.addEventListener("gsis:save-status", reconcile);
  window.addEventListener("gsis:clear-protected-state", reconcile);
}

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

/* The owner schema describes these controls; the native draft owns every edit. */
(function () {
  "use strict";
  let bridge = null,
    ownerSchema = null,
    previewTTb = null,
    details = null,
    detailId = null,
    signatureTimer = null,
    staleSignatureState = null;
  const node = (tag, text) => {
    const value = document.createElement(tag);
    if (text !== undefined) value.textContent = text;
    return value;
  };
  function schema(data) {
    const actual = data?.gridSchema;
    if (
      !ownerSchema ||
      actual?.schemaVersion !== ownerSchema.schemaVersion ||
      actual.workbookSchema !== ownerSchema.workbookSchema ||
      JSON.stringify(actual.fields) !== JSON.stringify(ownerSchema.fields) ||
      JSON.stringify(actual.writeLimits) !==
        JSON.stringify(ownerSchema.writeLimits) ||
      !Array.isArray(data.fields) ||
      data.fields.some((label, i) => label !== actual.fields[i]?.label) ||
      data.fields.length !== actual.fields.length
    )
      throw Error(
        "Contacts returned an unsupported field schema. Reload before editing.",
      );
    return actual;
  }
  function validProjection(data) {
    try {
      schema(data);
      return true;
    } catch {
      return false;
    }
  }
  function value(data, row, edits, index) {
    return edits.get(row.id + "|" + index)?.value ?? row.values[index];
  }
  function typed(field, raw) {
    if (field.type === "string[]")
      return raw
        .split(field.separator)
        .map((x) => x.trim())
        .filter(Boolean);
    if (field.type === "boolean")
      return raw === "Y" ? true : raw === "N" ? false : null;
    return raw.trim() || null;
  }
  function validateValue(field, raw) {
    if (typeof raw !== "string") throw Error(field.label + " must be text.");
    const values = field.type === "string[]" ? typed(field, raw) : [raw.trim()];
    if (field.nullable === false && !raw.trim())
      throw Error(field.label + " is required.");
    if (
      field.pattern &&
      values.some((value) => value && !new RegExp(field.pattern).test(value))
    )
      throw Error(
        field.label +
          " must use valid individual values without control characters, commas or semicolons.",
      );
    if (field.choices && raw.trim() && !field.choices.includes(raw.trim()))
      throw Error("Choose a supported " + field.label + " value.");
    if (field.maxItems && values.length > field.maxItems)
      throw Error(field.label + " has too many values.");
    if (field.maxLength && values.some((x) => x.length > field.maxLength))
      throw Error(
        field.label + " exceeds " + field.maxLength + " characters per value.",
      );
  }
  function control(field, raw, disabled) {
    let input;
    if (field.choices) {
      input = node("select");
      for (const text of [
        ...new Set(["", ...field.choices, ...(raw ? [raw] : [])]),
      ]) {
        const option = node("option", text || "Not recorded");
        option.value = text;
        input.append(option);
      }
      input.value = raw;
      input.disabled = disabled;
    } else {
      input = node(field.type === "string[]" ? "textarea" : "input");
      input.value = raw;
      input.readOnly = disabled;
      if (field.type === "string[]") {
        input.rows = Math.min(4, Math.max(2, raw.split("\n").length));
        input.placeholder = "One value per line";
      } else {
        input.type = "text";
        if (field.maxLength) input.maxLength = field.maxLength;
      }
    }
    input.setAttribute("aria-label", field.label);
    return input;
  }
  function preview(data, row, edits) {
    const fields = schema(data).fields,
      profile = {},
      presentation = {};
    fields.forEach((field, i) => {
      profile[field.key] = typed(field, value(data, row, edits, i));
      if (!edits.has(row.id + "|" + i) && row.presentation?.[field.key])
        presentation[field.key] = row.presentation[field.key];
    });
    return previewTTb(profile, presentation);
  }
  function evidence(field, row, edited) {
    if (edited) return "";
    const retained = row.presentation?.[field.key];
    if (!retained || retained.legacy !== true) return "";
    if (retained.available === false)
      return "Retained source evidence is unavailable; unchanged values are preserved.";
    return (retained.items || [])
      .filter((item) => item.label !== item.value)
      .map((item) => item.value + " — " + item.label + " (retained)")
      .join("; ");
  }
  function updateRow(data, row, edits) {
    let result;
    try {
      result = preview(data, row, edits);
    } catch {
      result = { available: false };
    }
    for (const input of document.querySelectorAll(
      "[data-person][data-field]",
    )) {
      if (input.dataset.person !== row.id) continue;
      const index = Number(input.dataset.field),
        field = data.gridSchema.fields[index];
      if (!field) continue;
      if (field.key === "ttbName") {
        input.value = result.available ? result.name : row.values[index];
        input.title = result.available
          ? "Derived preview; saved by Contacts"
          : "Preview unavailable; saved name retained";
      } else if (document.activeElement !== input)
        input.value = value(data, row, edits, index);
      const edited = edits.has(row.id + "|" + index);
      input.classList.toggle("dirty", edited);
      const container = input.closest("td,label");
      if (container) {
        container.querySelector("[data-contact-preview-error]")?.remove();
        if (field.key === "ttbName" && result.reason === "TTB_NAME_TOO_LONG") {
          const error = node(
            "small",
            "TTb name exceeds 160 characters. Shorten display modifiers or suffix.",
          );
          error.dataset.contactPreviewError = "";
          error.setAttribute("role", "status");
          container.append(error);
        }
        container.querySelector("[data-contact-evidence]")?.remove();
        const text = evidence(field, row, edited);
        if (text) {
          const hint = node("small", text);
          hint.dataset.contactEvidence = "";
          container.append(hint);
        }
      }
      const activeIndex = data.fields.indexOf("Active");
      input
        .closest("tr")
        ?.classList.toggle(
          "inactive",
          value(data, row, edits, activeIndex) === "N",
        );
    }
  }
  function attach(input, data, row, edits, index, onEdit, scope, locked) {
    const field = data.gridSchema.fields[index],
      editable =
        data.editable &&
        field.editable &&
        !row.computed?.[index] &&
        (scope !== "self" || field.selfEditable);
    input.dataset.person = row.id;
    input.dataset.field = index;
    input.dataset.canEdit = String(!!editable);
    input.classList.toggle("dirty", edits.has(row.id + "|" + index));
    const valid = bridge.capture();
    input.addEventListener(
      input.tagName === "SELECT" ? "change" : "input",
      () => {
        if (
          !valid() ||
          locked ||
          !editable ||
          input.disabled ||
          input.readOnly ||
          bridge.get().locked
        )
          return;
        const raw =
            field.key === "mobile"
              ? input.value.replace(/\s/g, "")
              : input.value,
          key = row.id + "|" + index;
        if (raw === row.values[index]) edits.delete(key);
        else
          edits.set(key, {
            id: row.id,
            field: field.label,
            expected: row.values[index],
            value: raw,
          });
        updateRow(data, row, edits);
        onEdit();
      },
    );
  }
  function renderGrid(id, data, edits, onEdit, locked = false, append = false) {
    const host = document.getElementById(id);
    if (!host) return;
    let fields;
    try {
      fields = schema(data).fields;
    } catch (error) {
      host.replaceChildren(node("p", error.message));
      return;
    }
    const table = node("table");
    table.className = "data-table source-data";
    const head = table.createTHead().insertRow();
    fields.forEach((field) => head.append(node("th", field.label)));
    if (id === "dataGrid") head.append(node("th", "Details"));
    const body = table.createTBody();
    for (const row of data.rows) {
      const tr = body.insertRow();
      fields.forEach((field, index) => {
        const editable =
          data.editable &&
          field.editable &&
          !row.computed?.[index] &&
          (id !== "diyGrid" || field.selfEditable);
        const input = control(
          field,
          value(data, row, edits, index),
          locked || !editable,
        );
        attach(
          input,
          data,
          row,
          edits,
          index,
          onEdit,
          id === "diyGrid" ? "self" : "manage",
          locked,
        );
        tr.insertCell().append(input);
      });
      if (id === "dataGrid") {
        const button = node("button", "Edit details");
        button.type = "button";
        button.dataset.contactDetails = row.id;
        button.onclick = () => openDetails(data, row.id, edits, onEdit);
        tr.insertCell().append(button);
      }
      tr.classList.toggle(
        "inactive",
        value(data, row, edits, data.fields.indexOf("Active")) === "N",
      );
    }
    if (append && host.querySelector("tbody"))
      host.querySelector("tbody").append(...body.children);
    else host.replaceChildren(table);
    data.rows.forEach((row) => updateRow(data, row, edits));
    if (!append && details?.open && detailId && id === "dataGrid") {
      const current = bridge.get();
      if (!current.data?.rows.some((row) => row.id === detailId))
        closeDetails();
      else openDetails(current.data, detailId, current.edits, onEdit);
    }
  }
  function closeDetails() {
    details?.close();
    details?.remove();
    details = null;
    detailId = null;
  }
  function openDetails(data, id, edits, onEdit) {
    const row = data.rows.find((row) => row.id === id);
    if (!row) return;
    if (!details) {
      details = node("dialog");
      details.className = "gsis-contact-details";
      document.body.append(details);
    }
    detailId = id;
    const current = bridge.get(),
      fields = schema(data).fields,
      title = node("h2", "Edit contact details");
    title.id = "gsis-contact-detail-title";
    details.setAttribute("aria-labelledby", title.id);
    const identity = node(
      "p",
      (row.values[data.fields.indexOf("TTb Name")] ||
        row.values[0] ||
        "New contact") +
        " · " +
        row.id,
    );
    const grid = node("div");
    grid.className = "gsis-contact-fields";
    fields.forEach((field, index) => {
      const label = node("label"),
        text = node("span", field.label),
        editable = data.editable && field.editable && !row.computed?.[index];
      const input = control(
        field,
        value(data, row, edits, index),
        current.locked || !editable,
      );
      attach(input, data, row, edits, index, onEdit, "manage", current.locked);
      label.append(text, input);
      const status = row.fieldStatus?.[field.key];
      if (status && !status.effective)
        label.append(
          node(
            "small",
            "Not currently effective (" +
              status.state +
              "). Left unchanged unless you edit this field.",
          ),
        );
      if (field.type === "string[]")
        label.append(node("small", "One value per line; order is preserved."));
      grid.append(label);
    });
    const hint = node(
      "p",
      "These controls use the same Edit Info draft. Closing retains unsaved changes.",
    );
    const save = node(
      "button",
      current.attempt ? "Retry Save changes" : "Save changes",
    );
    save.type = "button";
    save.disabled = !current.editable || current.saving;
    save.onclick = () => bridge.save();
    const close = node("button", "Close");
    close.type = "button";
    close.onclick = closeDetails;
    details.replaceChildren(title, identity, grid, hint, save, close);
    updateRow(data, row, edits);
    if (!details.open) details.showModal();
  }
  function makeAttempt() {
    const { data, edits, additions, state } = bridge.get(),
      fields = schema(data).fields,
      requestId = crypto.randomUUID();
    const changes = [...edits.values()].filter(
      (change) => !additions.has(change.id),
    );
    const rows = [...additions].map((id) => {
      const row = data.rows.find((row) => row.id === id);
      return {
        id,
        values: Object.fromEntries(
          fields.flatMap((field, i) =>
            field.editable && (edits.has(id + "|" + i) || row.values[i] !== "")
              ? [[field.label, value(data, row, edits, i)]]
              : [],
          ),
        ),
      };
    });
    return Object.freeze({
      requestId,
      owner: state.user.email,
      payload: JSON.stringify({ requestId, changes, additions: rows }),
    });
  }
  function validateDraft() {
    const { data, edits, additions } = bridge.get(),
      fields = schema(data).fields,
      limits = data.gridSchema.writeLimits;
    const changes = [...edits.values()].filter(
      (change) => !additions.has(change.id),
    );
    const people = new Set([
      ...additions,
      ...changes.map((change) => change.id),
    ]);
    if (
      changes.length + additions.size * limits.additionCost >
        limits.mutations ||
      people.size > limits.staff
    )
      throw Error(
        "Save up to " +
          limits.mutations +
          " changed cells or new rows across " +
          limits.staff +
          " staff at a time. Your draft is retained.",
      );
    for (const change of edits.values())
      validateValue(fields[data.fields.indexOf(change.field)], change.value);
    const basicIndex = fields.findIndex((field) => field.key === "basicName");
    for (const id of additions) {
      const row = data.rows.find((row) => row.id === id);
      validateValue(fields[basicIndex], value(data, row, edits, basicIndex));
    }
    for (const id of people) {
      const row = data.rows.find((row) => row.id === id);
      if (preview(data, row, edits).reason === "TTB_NAME_TOO_LONG")
        throw Error(
          "The derived TTb Name exceeds 160 characters. Shorten display modifiers or suffix. Your draft is retained.",
        );
    }
  }
  function addRow() {
    const current = bridge.get();
    if (!current.editable || current.locked) return;
    const fields = schema(current.data).fields,
      id = "contact-" + crypto.randomUUID();
    current.data.rows.unshift({
      id,
      values: fields.map(() => ""),
      computed: fields.map((field) => !field.editable),
    });
    current.additions.add(id);
    const index = current.data.fields.indexOf("Active");
    current.edits.set(id + "|" + index, {
      id,
      field: "Active",
      expected: "",
      value: "Y",
    });
    const filter = document.getElementById("ttbFilter");
    if (filter) filter.value = "";
    bridge.render();
    [...document.querySelectorAll("#dataGrid [data-person]")]
      .find(
        (input) =>
          input.dataset.person === id &&
          input.getAttribute("aria-label") === "Basic Name",
      )
      ?.focus();
  }
  function invalidateSignature() {
    clearTimeout(signatureTimer);
    bridge?.invalidateSignature();
    const canvas = document.getElementById("signatureCanvas");
    if (canvas) {
      canvas.hidden = true;
      canvas.width = canvas.width;
    }
    const button = document.getElementById("signatureDownload");
    if (button) button.disabled = true;
  }
  function markSignatureStale() {
    staleSignatureState = bridge?.get().state;
    invalidateSignature();
  }
  function acceptSignatureView() {
    staleSignatureState = null;
    invalidateSignature();
  }
  function signatureCurrent(person) {
    const source = person?.signatureSource;
    if (source?.available !== true)
      throw Error(
        "Signature designation is unavailable. Refresh Contacts to retry.",
      );
    if (
      source.validUntil != null &&
      (typeof source.validUntil !== "number" ||
        !Number.isFinite(source.validUntil))
    )
      throw Error(
        "Signature designation validity is unavailable. Refresh Contacts to retry.",
      );
    const now = Date.now();
    if (
      (source.validFrom != null && now < Number(source.validFrom)) ||
      (source.validUntil != null && now >= Number(source.validUntil))
    )
      throw Error(
        "Signature designation has changed. Refresh Contacts before downloading.",
      );
  }
  async function renderSignature() {
    invalidateSignature();
    const snapshot = bridge.get().state,
      valid = bridge.capture(),
      epoch = bridge.signature().epoch;
    const current = () =>
      valid() &&
      bridge.get().state === snapshot &&
      bridge.signature().epoch === epoch;
    const status = document.getElementById("signatureStatus");
    status.textContent = "Preparing signature…";
    try {
      if (staleSignatureState === snapshot)
        throw Error(
          "Contacts changed. Refresh the saved view before generating a signature.",
        );
      const person = window.GSISSignature.self(
        snapshot.people,
        snapshot.user.email,
      );
      signatureCurrent(person);
      const settings = snapshot.signatureSettings || {
        subjects: window.GSISSignature.defaults(),
        revision: 0,
      };
      const title = window.GSISSignature.designation(
        person,
        settings,
        snapshot.deploymentAvailable,
      );
      document.getElementById("signatureIdentity").textContent =
        person.statutoryName + " | " + title;
      const staging = node("canvas"),
        info = await window.GSISSignature.render(
          staging,
          person,
          settings,
          snapshot.deploymentAvailable,
        );
      if (!current()) return;
      signatureCurrent(person);
      const canvas = document.getElementById("signatureCanvas");
      canvas.width = staging.width;
      canvas.height = staging.height;
      canvas.getContext("2d").drawImage(staging, 0, 0);
      canvas.hidden = false;
      bridge.setSignature({ person, info, valid: current });
      document.getElementById("signatureDownload").disabled = false;
      status.textContent = info.width + " × " + info.height + " px";
      const until = Number(person.signatureSource.validUntil);
      if (until > Date.now())
        signatureTimer = setTimeout(
          () => {
            if (current()) {
              invalidateSignature();
              status.textContent =
                "Signature designation has changed. Refresh Contacts before downloading.";
            }
          },
          Math.min(until - Date.now(), 2147483647),
        );
    } catch (error) {
      if (current()) {
        status.textContent = error.message;
        document.getElementById("signatureIdentity").textContent = "";
      }
    }
  }
  async function downloadSignature() {
    const ready = bridge.signature().ready;
    if (!ready || !ready.valid()) return;
    const button = document.getElementById("signatureDownload");
    button.disabled = true;
    try {
      signatureCurrent(ready.person);
      const blob = await window.GSISSignature.png(
        document.getElementById("signatureCanvas"),
      );
      if (bridge.signature().ready !== ready || !ready.valid()) return;
      signatureCurrent(ready.person);
      const url = URL.createObjectURL(blob),
        link = node("a");
      link.href = url;
      link.download =
        "GSiS-signature-" +
        ready.person.statutoryName.replace(/[^\p{L}\p{N}._-]+/gu, "-") +
        ".png";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (bridge.signature().ready === ready && ready.valid()) {
        invalidateSignature();
        document.getElementById("signatureStatus").textContent = error.message;
      }
    } finally {
      if (bridge.signature().ready === ready && ready.valid())
        button.disabled = false;
    }
  }
  function install(native, schemaValue, previewFunction) {
    bridge = native;
    ownerSchema = schemaValue;
    previewTTb = previewFunction;
    const style = node("style");
    style.textContent =
      ".gsis-contact-details{box-sizing:border-box;width:min(760px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto}.gsis-contact-details p{overflow-wrap:anywhere}.gsis-contact-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:12px}.gsis-contact-fields label{display:flex;flex-direction:column;gap:4px;min-width:0}.gsis-contact-fields input,.gsis-contact-fields select,.gsis-contact-fields textarea{box-sizing:border-box;min-width:0;max-width:100%;width:100%}.gsis-contact-fields small{color:#526477;overflow-wrap:anywhere}.gsis-contact-details>button{margin:8px 8px 0 0}#dataGrid textarea,#diyGrid textarea{min-width:150px}";
    document.head.append(style);
    const help = document.querySelector("#data > p.muted");
    if (help)
      help.textContent =
        "Edit staff facts directly. One value per line for modifiers, memberships and aliases. TTb names are derived; authority acceptance has separate controls. Save changes applies the draft together.";
  }
  window.GSISContactsEditor = {
    onContextClear: onContactsContextClear,
    install,
    schema,
    validProjection,
    control,
    typed,
    validateValue,
    renderGrid,
    makeAttempt,
    validateDraft,
    addRow,
    invalidateSignature,
    markSignatureStale,
    acceptSignatureView,
    renderSignature,
    downloadSignature,
  };
  onContactsContextClear(() => {
    closeDetails();
    staleSignatureState = null;
    invalidateSignature();
    document.getElementById("signatureIdentity")?.replaceChildren();
    document.getElementById("signatureStatus")?.replaceChildren();
  });
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
  async function context(scope = mode) {
    const session = await api.getSession();
    if (!session?.schoolId || session.impersonating)
      throw Error("Sign in to Contacts first.");
    return {
      ...session,
      importKey:
        "gsis-contacts-import:" +
        session.schoolId +
        ":" +
        session.user.accountId +
        ":" +
        scope,
    };
  }
  function binding(id = unresolved) {
    return {
      id,
      key: storageKey,
      scope: mode,
      epoch: securityEpoch,
      view: readEpoch,
      clientEpoch: api.saveStatus?.().contextEpoch,
    };
  }
  function currentBinding(bound) {
    return (
      bound.clientEpoch === api.saveStatus?.().contextEpoch &&
      bound.epoch === securityEpoch &&
      bound.view === readEpoch &&
      bound.key === storageKey &&
      bound.scope === mode &&
      bound.id === unresolved
    );
  }
  function outcome(result, id) {
    const receipt = result?.receipt || result;
    return receipt?.operationId === id &&
      ["committed", "terminal-not-committed"].includes(receipt.state)
      ? receipt.state
      : "unknown";
  }
  async function refreshSaved(bound) {
    window.GSISContactsEditor.markSignatureStale();
    const result = await window.GSISV1ContactsViews?.refresh({});
    if (
      bound.clientEpoch !== api.saveStatus?.().contextEpoch ||
      bound.epoch !== securityEpoch ||
      bound.view !== readEpoch
    )
      return;
    message(
      result?.grid === "refreshed"
        ? "Import committed; Contacts refreshed."
        : "Import committed. " +
            (result?.reason ||
              "Use Reload to read the saved view; existing drafts are retained."),
    );
  }
  async function exportAll(scope = "manage") {
    const epoch = securityEpoch,
      clientEpoch = api.saveStatus?.().contextEpoch;
    const [data, session] = await Promise.all([
      api.request("contacts", scope === "self" ? "/diy" : "/data"),
      api.getSession(),
    ]);
    const { encodeWorkbook, download } = await import("./workbooks.mjs");
    const columns = ["Staff ID", ...data.fields],
      rows = data.rows.map((r) => [r.id, ...values(r)]);
    const bytes = await encodeWorkbook({
      metadata: {
        Schema: window.GSISContactsEditor.schema(data).workbookSchema,
        Scope: scope,
        "School ID": session.schoolId,
        "Exported At": new Date().toISOString(),
        Revision: String(data.revision),
        "Import semantics":
          "Update existing editable cells only; omitted staff are unchanged. Maximum 64 cells / 16 staff per atomic import.",
      },
      sheets: { Contacts: { columns, rows }, Baseline: { columns, rows } },
    });
    if (
      epoch !== securityEpoch ||
      clientEpoch !== api.saveStatus?.().contextEpoch
    )
      throw Error("Session changed. Export cancelled.");
    download(bytes, "GSiS-Contacts-All.xlsx");
  }
  function validate(workbook, data, schoolId, scope = "manage") {
    const errors = [],
      changes = [],
      sheet = workbook.sheets?.Contacts,
      baseline = workbook.sheets?.Baseline,
      owner = window.GSISContactsEditor.schema(data),
      legacy = workbook.metadata?.Schema === "gsis.contacts.grid.v1",
      fields = legacy ? owner.fields.slice(0, 17) : owner.fields,
      columns = ["Staff ID", ...fields.map((field) => field.label)];
    if (
      (!legacy && workbook.metadata?.Schema !== owner.workbookSchema) ||
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
          !fields[i].editable ||
          now.computed?.[i] ||
          (scope === "self" && !fields[i].selfEditable)
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
        else {
          try {
            window.GSISContactsEditor.validateValue(fields[i], proposed);
            changes.push({
              id,
              field: fields[i].label,
              expected: before,
              value: proposed,
            });
          } catch (error) {
            errors.push({ row: index, column: i + 1, message: error.message });
          }
        }
      });
    });
    if (!data.editable || (scope !== "self" && !api.capable("contacts.manage")))
      errors.push({
        message: "Current Contacts management access is required.",
      });
    if (
      changes.length > owner.writeLimits.mutations ||
      new Set(changes.map((c) => c.id)).size > owner.writeLimits.staff
    )
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
    const bound = binding();
    receiptButton.disabled = true;
    try {
      const result = await api.request("contacts", "/save-receipt", {
        method: "POST",
        body: { operationId: bound.id },
      });
      if (!currentBinding(bound)) return;
      const state = outcome(result, bound.id);
      if (state === "committed") {
        clearPending();
        message("The original import committed.");
        await refreshSaved(bound);
      } else if (state === "terminal-not-committed") {
        clearPending();
        message(
          "The original import did not commit. Reimport a current workbook to start a new operation.",
        );
      } else
        message(
          "Original operation " +
            bound.id +
            " remains unconfirmed. Check again before another import.",
        );
    } catch (error) {
      if (currentBinding(bound))
        message(
          error.message + " Original operation " + bound.id + " is retained.",
        );
    } finally {
      if (bound.epoch === securityEpoch && bound.view === readEpoch)
        receiptButton.disabled = false;
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
    dialog.addEventListener("close", () => {
      readEpoch++;
    });
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
    const view = ++readEpoch,
      epoch = securityEpoch;
    const session = await context(scope);
    if (view !== readEpoch || epoch !== securityEpoch) return;
    mode = scope;
    storageKey = session.importKey;
    unresolved = sessionStorage.getItem(storageKey);
    request = null;
    ensureDialog();
    if (!dialog.open) dialog.showModal();
    fileInput.disabled = !!unresolved;
    receiptButton.hidden = !unresolved;
    confirmButton.disabled = true;
    message(
      unresolved
        ? "Unconfirmed import " +
            unresolved +
            ". Check its original receipt before another import."
        : "Choose the matching Export All workbook. No data changes before confirmation.",
    );
  }
  async function readWorkbook() {
    const epoch = ++readEpoch,
      security = securityEpoch,
      scope = mode;
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
        api.request("contacts", scope === "self" ? "/diy" : "/data"),
        context(scope),
      ]);
      if (epoch !== readEpoch || security !== securityEpoch || scope !== mode)
        return;
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
    const submitted = request;
    try {
      sessionStorage.setItem(storageKey, submitted.operationId);
    } catch (error) {
      message("Import not sent: " + error.message);
      return;
    }
    unresolved = submitted.operationId;
    const bound = binding();
    confirmButton.disabled = true;
    fileInput.disabled = true;
    receiptButton.hidden = false;
    try {
      const result = await api.request(
        "contacts",
        bound.scope === "self" ? "/save-diy" : "/save-data",
        { method: "POST", body: submitted },
      );
      if (!currentBinding(bound)) return;
      if (outcome(result, bound.id) !== "committed")
        throw Error("Import outcome is not confirmed.");
      clearPending();
      message("Import committed atomically.");
      await refreshSaved(bound);
    } catch (error) {
      if (currentBinding(bound))
        message(
          error.message +
            " Original operation " +
            bound.id +
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
  onContactsContextClear(() => {
    ++readEpoch;
    ++securityEpoch;
    dialog?.remove();
    dialog = null;
    request = null;
    unresolved = null;
  });
})();

/* Delivered proposals remain explicit reviews, separate from direct staff input. */
(function () {
  "use strict";
  const api = window.GSISV1;
  if (!api) return;
  let panel = null,
    epoch = 0,
    read = 0,
    clientEpoch = null,
    owner = "",
    attempts = new Map(),
    dirty = new Set();
  const element = (name, text) => {
    const node = document.createElement(name);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const key = (session) => session.schoolId + ":" + session.user.accountId;
  function message(text) {
    const status = panel?.querySelector("[data-contribution-status]");
    if (status) status.textContent = text;
  }
  async function mount() {
    const captured = epoch,
      session = await api.getSession();
    if (
      captured !== epoch ||
      !session ||
      session.impersonating ||
      !api.capable("contacts.manage")
    )
      return;
    if (panel) return;
    owner = key(session);
    clientEpoch = api.saveStatus?.().contextEpoch;
    panel = element("details");
    panel.dataset.contactsContributions = "";
    panel.append(
      element("summary", "Deploy contribution review"),
      element(
        "p",
        "Publication has already succeeded. Review each delivered field independently. This does not republish Deploy.",
      ),
    );
    const refresh = element("button", "Refresh contributions");
    refresh.type = "button";
    refresh.dataset.loadContributions = "";
    refresh.onclick = () => load().catch((error) => message(error.message));
    const status = element("p");
    status.dataset.contributionStatus = "";
    status.setAttribute("role", "status");
    const host = element("div");
    host.dataset.contributions = "";
    panel.append(refresh, status, host);
    document.getElementById("data")?.append(panel);
  }
  async function load() {
    if (attempts.size || dirty.size) {
      message(
        "Review drafts and original operations are retained. Finish or reset them before refreshing.",
      );
      return;
    }
    const captured = epoch,
      generation = ++read,
      session = await api.getSession();
    if (
      captured !== epoch ||
      !session ||
      key(session) !== owner ||
      session.impersonating
    )
      return;
    const [result, data] = await Promise.all([
      api.request("contacts", "/contributions"),
      api.request("contacts", "/data"),
    ]);
    if (
      captured !== epoch ||
      generation !== read ||
      attempts.size ||
      dirty.size
    )
      return;
    const fields = window.GSISContactsEditor.schema(data).fields,
      host = panel.querySelector("[data-contributions]");
    host.replaceChildren();
    for (const row of result.rows) {
      const card = element("section");
      card.className = "gsis-panel";
      card.append(
        element("h3", row.staff_id + " · " + row.field + " · " + row.state),
        element(
          "p",
          "Publication " +
            (row.source_publication || "staff proposal") +
            " · proposer " +
            row.proposer +
            " · proposed base " +
            row.base_revision +
            " · current revision " +
            (row.current?.revision ?? 0),
        ),
        element(
          "p",
          "Current: " +
            (row.current?.value_json ?? "Missing") +
            " · Proposed: " +
            JSON.stringify(row.value),
        ),
      );
      if (["pending", "conflicted"].includes(row.state)) {
        const field = fields.find((field) => field.key === row.field);
        const choice = element("select");
        choice.setAttribute("aria-label", "Contribution resolution");
        for (const [value, label] of [
          ["", "Choose a resolution"],
          ["accept", "Accept the proposed value"],
          ["reject", "Reject this proposal"],
          ["correct", "Correct before acceptance"],
        ]) {
          const option = element("option", label);
          option.value = value;
          choice.append(option);
        }
        const correction = field
          ? window.GSISContactsEditor.control(field, "", false)
          : element("input");
        correction.hidden = true;
        const button = element("button", "Record reviewed resolution");
        button.type = "button";
        const reset = element("button", "Reset review draft");
        reset.type = "button";
        choice.onchange = () => {
          correction.hidden = choice.value !== "correct";
          dirty.add(row.contribution_id);
        };
        correction.addEventListener("input", () =>
          dirty.add(row.contribution_id),
        );
        reset.onclick = () => {
          if (attempts.has(row.contribution_id)) return;
          choice.value = "";
          correction.value = "";
          correction.hidden = true;
          dirty.delete(row.contribution_id);
        };
        button.onclick = async () => {
          if (!choice.value || clientEpoch !== api.saveStatus?.().contextEpoch)
            return;
          const captured = epoch;
          let attempt = attempts.get(row.contribution_id);
          try {
            if (!attempt) {
              if (choice.value === "correct" && !field)
                throw Error(
                  "This field has no direct correction control. Accept or reject its proposal.",
                );
              if (choice.value === "correct")
                window.GSISContactsEditor.validateValue(
                  field,
                  correction.value,
                );
              attempt = {
                operationId: crypto.randomUUID(),
                contributionId: row.contribution_id,
                resolution: choice.value,
                revision: row.current?.revision ?? 0,
                ...(choice.value === "correct"
                  ? {
                      value: window.GSISContactsEditor.typed(
                        field,
                        correction.value,
                      ),
                    }
                  : {}),
              };
              attempts.set(row.contribution_id, attempt);
            }
            button.disabled = true;
            choice.disabled = true;
            correction.disabled = true;
            reset.disabled = true;
            const response = await api.request(
              "contacts",
              "/contributions/resolve",
              { method: "POST", body: attempt },
            );
            if (
              captured !== epoch ||
              clientEpoch !== api.saveStatus?.().contextEpoch ||
              attempts.get(row.contribution_id) !== attempt
            )
              return;
            const receipt = response.receipt || response;
            if (
              receipt.operationId !== attempt.operationId ||
              !["committed", "terminal-not-committed"].includes(
                receipt.state,
              ) ||
              !/^[a-f0-9]{64}$/.test(receipt.digest || "")
            )
              throw Error(
                "Original resolution remains unconfirmed. Retry keeps its values and operation ID.",
              );
            if (receipt.state === "committed") {
              const result = receipt.result;
              const targetMatches =
                attempt.resolution === "reject"
                  ? result?.contributionId === attempt.contributionId &&
                    result.state === "rejected"
                  : result?.staffId === row.staff_id &&
                    result.state === "applied" &&
                    Number.isSafeInteger(result.revision) &&
                    result.revision > 0 &&
                    result.fieldRevisions?.[row.field] === attempt.revision + 1;
              if (
                !Number.isSafeInteger(receipt.fence) ||
                receipt.fence <= 0 ||
                !targetMatches
              )
                throw Error(
                  "The original resolution receipt is incomplete or belongs to another field. Its operation is retained.",
                );
            }
            attempts.delete(row.contribution_id);
            dirty.delete(row.contribution_id);
            if (receipt.state === "terminal-not-committed") {
              choice.disabled = false;
              correction.disabled = false;
              reset.disabled = false;
              dirty.add(row.contribution_id);
              message(
                "Resolution was not saved. Draft retained; reset and refresh before reviewing the current field.",
              );
            } else {
              card.replaceChildren(
                element(
                  "p",
                  "Reviewed resolution recorded for " + row.staff_id + ".",
                ),
              );
              window.GSISContactsEditor.markSignatureStale();
              const saved = receipt.result || response.result;
              const refreshed = await window.GSISV1ContactsViews?.refresh(
                saved?.staffId && Number.isSafeInteger(saved.revision)
                  ? { staffId: saved.staffId, expectedRevision: saved.revision }
                  : {},
              );
              if (captured === epoch)
                message(
                  refreshed?.grid === "refreshed"
                    ? "Reviewed resolution recorded. Contacts refreshed."
                    : "Reviewed resolution recorded. " +
                        (refreshed?.reason ||
                          "Reload to see the saved view; existing drafts are retained."),
                );
            }
          } catch (error) {
            if (captured === epoch)
              message(
                error.message +
                  (attempt
                    ? " Original operation " +
                      attempt.operationId +
                      " is retained."
                    : ""),
              );
          } finally {
            if (captured === epoch) {
              button.disabled = false;
              button.textContent = attempts.has(row.contribution_id)
                ? "Retry original resolution"
                : "Record reviewed resolution";
            }
          }
        };
        card.append(choice, correction, button, reset);
      }
      host.append(card);
    }
    message(
      result.rows.length
        ? "Review each proposal before saving."
        : "No delivered staff contributions.",
    );
  }
  window.GSISContactsContributions = { mount };
  onContactsContextClear(() => {
    epoch++;
    read++;
    panel?.remove();
    panel = null;
    owner = "";
    attempts.clear();
    dirty.clear();
  });
  window.addEventListener("gsis:session", () => mount().catch(() => {}));
  window.addEventListener("load", () => mount().catch(() => {}));
})();
