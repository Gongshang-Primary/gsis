const api = window.GSISV1;
const panel = document.createElement("details");
panel.className = "gsis-panel";
panel.innerHTML =
  '<summary>Staff classifications and controlled catalogues</summary><p>Choose explicit staff facts from Contacts-owned definitions. Classifications and display tags do not grant SMC, EO or School Leader authority.</p><div class="gsis-formrow"><label style="min-width:0;max-width:100%">Staff member<select data-staff style="width:100%;min-width:0;max-width:100%"></select></label><button data-refresh>Refresh</button></div><p data-status role="status"></p><form data-facts><div data-fields class="gsis-formrow"></div><button class="primary">Save classifications</button></form><details><summary>Maintain catalogue definitions</summary><p>Stable codes are retained. Retire unused entries; use a new code for a different meaning. Display changes update current names and preserve historical snapshots.</p><div class="gsis-formrow"><label>Catalogue<select data-catalogue></select></label><button data-new>New catalogue</button></div><form data-definitions><div class="gsis-formrow"><label>Stable catalogue ID<input data-id required pattern="[A-Za-z0-9][A-Za-z0-9._:-]*"></label><label>Kind<select data-kind><option value="operational-tag">Operational tags</option><option value="hr-term">HR terms</option><option value="membership-role">Roles and memberships</option></select></label></div><div style="overflow:auto"><table><thead><tr><th>Code</th><th>Label</th><th>Category / role flags</th><th>Visible in TTb</th><th>Order</th><th>Active</th></tr></thead><tbody data-entries></tbody></table></div><button type="button" data-add>Add entry</button> <button class="primary">Save catalogue revision</button></form></details>';
document.body.append(panel);
const $ = (s) => panel.querySelector(s),
  status = $("[data-status]"),
  staffSelect = $("[data-staff]"),
  catalogueSelect = $("[data-catalogue]");
let catalogues = [],
  staff = null,
  current = null,
  dirtyId = null,
  factAttempt = null,
  catalogueAttempt = null,
  contextEpoch = 0,
  formEpoch = 0,
  owner = null,
  factSaving = false,
  catalogueSaving = false,
  refreshSequence = 0,
  staffReadSequence = 0;
const factDraft = new Map(),
  fieldStates = new Map();
const names = {
  schoolSection: "School section",
  personnelCategory: "Personnel category",
  employmentArrangement: "Employment arrangement",
  employmentStatus: "Employment status",
  employmentActive: "Employment active",
  role: "Role",
  appointmentStatus: "Appointment status",
  eoAppointmentLevel: "EO appointment level",
  memberships: "Memberships",
  employmentTags: "Employment tags",
  subjectTags: "Subject tags",
  mkTags: "MK tags",
  profileState: "Profile completion",
};
const multi = new Set([
    "memberships",
    "employmentTags",
    "subjectTags",
    "mkTags",
  ]),
  tagFields = ["employmentTags", "subjectTags", "mkTags"],
  hrFields = [
    "schoolSection",
    "personnelCategory",
    "employmentArrangement",
    "employmentStatus",
    "appointmentStatus",
    "eoAppointmentLevel",
  ],
  flags = ["sl", "sc", "smc", "kp", "tl", "sdt", "cmt", "sat", "support", "mk"];
function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle("gsis-error", error);
}
function option(text, value) {
  return new Option(text, value);
}
function choices(field) {
  return catalogues.flatMap((c) =>
    c.entries
      .filter(
        (e) =>
          e.active &&
          (field === "role" || field === "memberships"
            ? c.kind === "membership-role"
            : e.category === field),
      )
      .map((e) => ({
        label: e.label + " [" + e.code + "]",
        ref: { catalogueId: c.catalogueId, revision: c.revision, code: e.code },
      })),
  );
}
function referenceKey(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ["catalogueId", "revision", "code"].every(
      (key) => typeof value[key] === "string",
    )
    ? JSON.stringify([value.catalogueId, value.revision, value.code])
    : null;
}
function valueKey(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map(valueKey));
  if (value && typeof value === "object") return referenceKey(value);
  return typeof value + ":" + JSON.stringify(value ?? null);
}
function sameValue(a, b) {
  return valueKey(a) === valueKey(b);
}
function sessionKey(session) {
  return session?.schoolId && session?.user?.accountId
    ? JSON.stringify([
        session.schoolId,
        session.user.accountId,
        session.user.email,
      ])
    : null;
}
function context() {
  return {
    epoch: contextEpoch,
    form: formEpoch,
    owner,
    staffId: staffSelect.value,
  };
}
function canManage() {
  return api.capable("contacts.manage") || api.capable("contacts.powerUser");
}
function currentContext(c) {
  return (
    c.epoch === contextEpoch &&
    c.form === formEpoch &&
    c.owner === owner &&
    c.staffId === staffSelect.value &&
    !!owner &&
    !panel.hidden &&
    canManage()
  );
}
function lockFacts() {
  const locked =
    !!factAttempt || factSaving || !!catalogueAttempt || catalogueSaving;
  staffSelect.disabled = locked;
  $("[data-refresh]").disabled = locked;
  for (const select of panel.querySelectorAll("[data-field]"))
    select.disabled = locked;
  const button = $("[data-facts] button");
  button.disabled =
    factSaving || !!catalogueAttempt || catalogueSaving || !staff;
  button.textContent = factAttempt
    ? "Retry original classifications"
    : "Save classifications";
}
function lockCatalogue(locked) {
  for (const element of panel.querySelectorAll(
    "[data-definitions] input, [data-definitions] select, [data-add], [data-new], [data-catalogue]",
  )) {
    if (locked) {
      if (element.gsisBeforeLock === undefined)
        element.gsisBeforeLock = element.disabled;
      element.disabled = true;
    } else if (element.gsisBeforeLock !== undefined) {
      element.disabled = element.gsisBeforeLock;
      delete element.gsisBeforeLock;
    }
  }
  $("[data-definitions] button.primary").textContent = catalogueAttempt
    ? "Retry original catalogue"
    : "Save catalogue revision";
  lockFacts();
}
function clearContext() {
  contextEpoch++;
  formEpoch++;
  owner = null;
  staff = null;
  current = null;
  factAttempt = null;
  catalogueAttempt = null;
  factSaving = false;
  catalogueSaving = false;
  refreshSequence++;
  staffReadSequence++;
  dirtyId = null;
  factDraft.clear();
  fieldStates.clear();
  staffSelect.replaceChildren();
  catalogueSelect.replaceChildren();
  $("[data-fields]").replaceChildren();
  $("[data-entries]").replaceChildren();
  panel.querySelector("[data-contributions]")?.replaceChildren();
  $("[data-id]").value = "";
  message("");
  panel.hidden = true;
}
window.addEventListener("gsis:clear-protected-state", clearContext);
window.addEventListener("gsis:session", (event) => {
  if (owner && sessionKey(event.detail) !== owner) clearContext();
});
function referenceLabel(ref) {
  const catalogue = catalogues.find(
      (c) => c.catalogueId === ref.catalogueId && c.revision === ref.revision,
    ),
    entry = catalogue?.entries.find((e) => e.code === ref.code);
  return entry
    ? entry.label + " [" + ref.code + "]" + (entry.active ? "" : " — retired")
    : ref.code +
        " [" +
        ref.catalogueId +
        " @ " +
        ref.revision +
        "] — retained; original label unavailable";
}
function addValue(select, values, label, value) {
  const key = valueKey(value);
  if (key === null) return;
  if (!values.has(key)) {
    values.set(key, structuredClone(value));
    const entry = option(label, key);
    const ref = referenceKey(value);
    if (ref) {
      entry.dataset.catalogueId = value.catalogueId;
      entry.dataset.revision = value.revision;
      entry.dataset.code = value.code;
    }
    select.append(entry);
  }
}
function fieldValue(select, entry) {
  const selected = [...select.selectedOptions]
    .filter((o) => o.value !== "")
    .map((o) => {
      if (!entry.values.has(o.value))
        throw Error(
          "An unknown classification option was selected. Refresh before editing.",
        );
      return entry.values.get(o.value);
    });
  if (!select.multiple) {
    if (!selected.length) {
      if (entry.original == null) return entry.original;
      throw Error(
        "Choose a recorded value. Clearing this scalar classification is not supported.",
      );
    }
    return selected[0];
  }
  const original = Array.isArray(entry.original) ? entry.original : [];
  return original
    .filter((value) => selected.some((v) => sameValue(v, value)))
    .concat(
      selected.filter((value) => !original.some((v) => sameValue(v, value))),
    );
}
function renderFacts() {
  const host = $("[data-fields]");
  host.replaceChildren();
  fieldStates.clear();
  factDraft.clear();
  if (!staff) {
    lockFacts();
    return;
  }
  for (const [field, label] of Object.entries(names)) {
    const wrap = document.createElement("label"),
      select = document.createElement("select"),
      record = staff.fields?.[field],
      original = structuredClone(record?.value ?? null),
      values = new Map();
    wrap.textContent = label;
    select.dataset.field = field;
    select.multiple = multi.has(field);
    if (!select.multiple) select.append(option("Not recorded", ""));
    if (field === "employmentActive") {
      addValue(select, values, "Yes", true);
      addValue(select, values, "No", false);
    } else if (field === "profileState") {
      addValue(select, values, "Provisional", "provisional");
      addValue(select, values, "Complete", "complete");
    } else
      for (const c of choices(field)) addValue(select, values, c.label, c.ref);
    const assigned = Array.isArray(original)
      ? original
      : original == null
        ? []
        : [original];
    for (const value of assigned)
      if (referenceKey(value))
        addValue(select, values, referenceLabel(value), value);
    for (const o of select.options)
      o.selected = assigned.some((value) => valueKey(value) === o.value);
    if (!assigned.length && !select.multiple) select.value = "";
    const info = document.createElement("small");
    info.dataset.fieldStatus = field;
    if (record && !record.effective)
      info.textContent =
        record.state === "pending"
          ? "Pending record; not current."
          : record.validFrom > Date.now()
            ? "Future record; not current."
            : record.validUntil != null && record.validUntil <= Date.now()
              ? "Expired record; not current."
              : "Historical record; not current.";
    if (record && !record.effective)
      info.textContent +=
        " Selecting the same retained value does not apply it again.";
    const baseline = {
      original,
      record: structuredClone(record ?? null),
      values,
      info,
    };
    fieldStates.set(field, baseline);
    select.addEventListener("change", () => {
      if (factAttempt || factSaving || catalogueAttempt || catalogueSaving)
        return;
      try {
        const value = fieldValue(select, baseline);
        if (
          sameValue(value, baseline.original) ||
          (multi.has(field) && baseline.original == null && !value.length)
        )
          factDraft.delete(field);
        else factDraft.set(field, structuredClone(value));
        select.setCustomValidity("");
        message(
          factDraft.size
            ? factDraft.size + " classification field(s) changed."
            : "No classification changes.",
        );
      } catch (error) {
        factDraft.set(field, { invalid: true });
        select.setCustomValidity(error.message);
        message(error.message, true);
      }
    });
    wrap.append(select, info);
    host.append(wrap);
  }
  lockFacts();
}
function personLabel(person) {
  return (
    (person.ttbName || person.name || person.basicName || person.staffId) +
    " · " +
    person.staffId
  );
}
async function loadStaff(c = context()) {
  if (factAttempt) {
    message(
      "Retry the original classification operation before changing staff.",
      true,
    );
    return false;
  }
  if (!c.staffId) {
    if (currentContext(c)) {
      staff = null;
      renderFacts();
    }
    return true;
  }
  const read = ++staffReadSequence;
  let next;
  try {
    next = await api.request(
      "contacts",
      "/staff/" + encodeURIComponent(c.staffId),
    );
  } catch (error) {
    if (read !== staffReadSequence || !currentContext(c)) return false;
    throw error;
  }
  if (read !== staffReadSequence || !currentContext(c)) return false;
  if (factDraft.size) {
    message(
      "Your classification draft changed while refreshing and is retained.",
    );
    return false;
  }
  if (
    next.staffId !== c.staffId ||
    !Number.isSafeInteger(next.revision) ||
    !next.fields
  )
    throw Error("The staff record could not be verified.");
  staff = next;
  renderFacts();
  const selected = [...staffSelect.options].find(
    (o) => o.value === next.staffId,
  );
  if (selected) selected.textContent = personLabel(next);
  return true;
}
async function refreshNative(c, minimumRevision = null) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!currentContext(c)) return null;
    if (factDraft.size)
      return {
        directory: "deferred",
        grid: "deferred",
        reason:
          "Your classification draft is retained. Save or review it before refreshing the views.",
      };
    if (c.staffId && (!staff || staff.revision < (minimumRevision ?? 0))) {
      if (!(await loadStaff(c))) return null;
      if (staff.revision < (minimumRevision ?? 0))
        return {
          directory: "stale",
          grid: "stale",
          reason: "The current staff read is older than the confirmed save.",
        };
    }
    const hook = window.GSISV1ContactsViews?.refresh;
    if (!hook)
      return {
        directory: "unavailable",
        grid: "unavailable",
        reason: "Native Contacts views are not ready. Use Refresh.",
      };
    const result = await hook(
      c.staffId ? { staffId: c.staffId, expectedRevision: staff.revision } : {},
    );
    if (!currentContext(c)) return null;
    if (factDraft.size)
      return {
        ...result,
        reason:
          "Your classification draft changed while refreshing and is retained.",
      };
    if (
      attempt === 0 &&
      result.directory === "stale" &&
      result.revision > staff?.revision
    ) {
      if (!(await loadStaff(c))) return null;
      continue;
    }
    return result;
  }
}
function viewMessage(result) {
  if (!result) return "";
  if (result.directory === "refreshed" && result.grid === "refreshed")
    return " Directory and Edit Info refreshed.";
  return (
    " View refresh " +
    (result.grid === "deferred" || result.directory === "deferred"
      ? "deferred"
      : result.directory === "stale" || result.grid === "stale"
        ? "stale"
        : "unavailable") +
    ": " +
    (result.reason || "Use Refresh to reload current views.")
  );
}
async function refresh({ native = false } = {}) {
  if (factAttempt) {
    message(
      "Retry the original classification operation before refreshing.",
      true,
    );
    return;
  }
  const c = context(),
    selected = staffSelect.value,
    read = ++refreshSequence;
  staffReadSequence++;
  const active = () => read === refreshSequence && currentContext(c);
  let cs, people;
  try {
    [cs, people] = await Promise.all([
      api.request("contacts", "/catalogues"),
      api.request("contacts", "/staff"),
    ]);
  } catch (error) {
    if (!active()) return;
    throw error;
  }
  if (!active()) return;
  if (!Array.isArray(cs.rows) || !Array.isArray(people.rows))
    throw Error("Classification choices are unavailable.");
  catalogues = cs.rows;
  staffSelect.replaceChildren(option("Choose a staff member", ""));
  for (const p of people.rows)
    staffSelect.append(option(personLabel(p), p.staffId));
  staffSelect.value = selected;
  catalogueSelect.replaceChildren(option("Choose a catalogue", ""));
  for (const catalogue of catalogues)
    catalogueSelect.append(
      option(
        catalogue.catalogueId + " · revision " + catalogue.revision,
        catalogue.catalogueId,
      ),
    );
  catalogueSelect.value = current?.catalogueId || "";
  if (!currentContext(c)) {
    staff = null;
    renderFacts();
    return;
  }
  if (factDraft.size) {
    message("Choices refreshed. Your classification draft is retained.");
    return;
  }
  const loaded = await loadStaff(c);
  if (native && loaded && active()) {
    const views = await refreshNative(c);
    if (active()) message("Classifications refreshed." + viewMessage(views));
  }
}
function entryRow(entry = {}) {
  const tr = document.createElement("tr");
  for (const name of ["code", "label"]) {
    const td = document.createElement("td"),
      input = document.createElement("input");
    input.dataset.key = name;
    input.value = entry[name] || "";
    input.required = true;
    if (entry.code && name === "code") input.readOnly = true;
    td.append(input);
    tr.append(td);
  }
  const td = document.createElement("td");
  if ($("[data-kind]").value === "membership-role") {
    for (const name of flags) {
      const label = document.createElement("label"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.flag = name;
      input.checked = entry.flags?.[name] === true;
      if (entry.code) input.disabled = true;
      label.append(input, document.createTextNode(name.toUpperCase() + " "));
      td.append(label);
    }
    const eo = document.createElement("select");
    eo.dataset.eo = "";
    eo.append(option("No EO appointment mapping", ""));
    const mappingValues = new Map();
    for (const c of choices("eoAppointmentLevel"))
      addValue(eo, mappingValues, c.label, c.ref);
    if (entry.eoAppointment)
      addValue(
        eo,
        mappingValues,
        referenceLabel(entry.eoAppointment),
        entry.eoAppointment,
      );
    eo.value = entry.eoAppointment ? valueKey(entry.eoAppointment) : "";
    eo.mappingValues = mappingValues;
    eo.originalMapping = structuredClone(entry.eoAppointment ?? null);
    if (entry.code) eo.disabled = true;
    td.append(eo);
  } else {
    const select = document.createElement("select");
    select.dataset.key = "category";
    for (const field of $("[data-kind]").value === "operational-tag"
      ? tagFields
      : hrFields)
      select.append(option(names[field], field));
    select.value = entry.category || select.options[0].value;
    if (entry.code) select.disabled = true;
    td.append(select);
  }
  tr.append(td);
  for (const key of ["ttbVisible", "order", "active"]) {
    const cell = document.createElement("td"),
      input = document.createElement("input");
    input.dataset.key = key;
    input.type = key === "order" ? "number" : "checkbox";
    if (key === "order") {
      input.min = "0";
      input.max = "10000";
      input.value = entry.order ?? 0;
    } else input.checked = entry[key] ?? key === "active";
    if (key !== "active" && $("[data-kind]").value !== "operational-tag")
      input.disabled = true;
    cell.append(input);
    tr.append(cell);
  }
  tr.dataset.definition = entry.definitionRevision || "";
  $("[data-entries]").append(tr);
}
function renderCatalogue(c) {
  if (catalogueAttempt) {
    message(
      "Retry the original pending catalogue operation before editing another definition.",
      true,
    );
    return;
  }
  current = c;
  dirtyId = null;
  $("[data-id]").value = c?.catalogueId || "";
  $("[data-id]").readOnly = !!c;
  $("[data-kind]").value = c?.kind || "operational-tag";
  $("[data-kind]").disabled = !!c;
  $("[data-entries]").replaceChildren();
  for (const e of c?.entries || []) entryRow(e);
}
staffSelect.onchange = () => {
  if (factAttempt || factSaving || catalogueAttempt || catalogueSaving) {
    staffSelect.value = staff?.staffId || "";
    lockFacts();
    return;
  }
  if (
    factDraft.size &&
    !confirm(
      "Discard the unsaved classification changes and choose another staff member?",
    )
  ) {
    staffSelect.value = staff?.staffId || "";
    return;
  }
  formEpoch++;
  staff = null;
  renderFacts();
  const c = context();
  loadStaff(c).catch((error) => {
    if (currentContext(c)) message(error.message, true);
  });
};
catalogueSelect.onchange = () =>
  renderCatalogue(
    catalogues.find((c) => c.catalogueId === catalogueSelect.value),
  );
$("[data-refresh]").onclick = () => {
  const c = context();
  refresh({ native: true }).catch((error) => {
    if (currentContext(c)) message(error.message, true);
  });
};
$("[data-new]").onclick = () => renderCatalogue(null);
$("[data-kind]").onchange = () => {
  if (!catalogueAttempt) $("[data-entries]").replaceChildren();
};
$("[data-add]").onclick = () => {
  if (!catalogueAttempt) entryRow();
};
$("[data-facts]").onsubmit = async (event) => {
  event.preventDefault();
  if (!staff || factSaving) return;
  const c = context();
  if (!currentContext(c)) return;
  if (!factAttempt) {
    const changes = {};
    try {
      for (const [field] of factDraft) {
        const select = $("[data-field=" + field + "]"),
          entry = fieldStates.get(field),
          value = fieldValue(select, entry);
        if (!sameValue(value, entry.original))
          changes[field] = structuredClone(value);
      }
    } catch (error) {
      message(error.message, true);
      return;
    }
    if (!Object.keys(changes).length) {
      message("No classification changes.");
      return;
    }
    if (Object.keys(changes).length > 8) {
      message("Save up to eight classification fields at once.", true);
      return;
    }
    const body = {
      operationId: crypto.randomUUID(),
      revision: staff.revision,
      changes,
    };
    factAttempt = {
      staffId: staff.staffId,
      operationId: body.operationId,
      revision: body.revision,
      payload: JSON.stringify(body),
    };
  }
  const attempt = factAttempt;
  factSaving = true;
  lockFacts();
  try {
    const result = await api.request(
      "contacts",
      "/staff/" + encodeURIComponent(attempt.staffId) + "/update",
      { method: "POST", body: JSON.parse(attempt.payload) },
    );
    if (!currentContext(c) || factAttempt !== attempt) return;
    if (
      result.operationId === attempt.operationId &&
      result.state === "terminal-not-committed"
    ) {
      factAttempt = null;
      message(
        "Classifications were not saved. Review the retained draft before a new attempt.",
        true,
      );
      return;
    }
    if (
      result.operationId !== attempt.operationId ||
      result.state !== "committed" ||
      result.result?.staffId !== attempt.staffId ||
      result.result?.revision !== attempt.revision + 1 ||
      !result.result.fieldRevisions ||
      !Object.keys(JSON.parse(attempt.payload).changes).every(
        (field) =>
          Number.isSafeInteger(result.result.fieldRevisions[field]) &&
          result.result.fieldRevisions[field] > 0,
      )
    ) {
      message(
        "Save unconfirmed. Retry preserves operation " +
          attempt.operationId +
          ".",
        true,
      );
      return;
    }
    factAttempt = null;
    factDraft.clear();
    message("Classifications saved. Refreshing current views…");
    try {
      if (!(await loadStaff(c))) return;
      const views = await refreshNative(c, result.result.revision);
      if (currentContext(c))
        message("Classifications saved." + viewMessage(views));
    } catch (error) {
      if (currentContext(c))
        message(
          "Classifications saved. View refresh unavailable: " + error.message,
          true,
        );
    }
  } catch (error) {
    if (!currentContext(c) || factAttempt !== attempt) return;
    if (error.code === "OPERATION_ABORTED") factAttempt = null;
    message(
      error.message +
        (factAttempt
          ? " Retry preserves operation " + attempt.operationId
          : " Review the retained draft before a new attempt."),
      true,
    );
  } finally {
    if (currentContext(c)) {
      factSaving = false;
      lockFacts();
    }
  }
};
$("[data-definitions]").onsubmit = async (event) => {
  event.preventDefault();
  const c = context();
  if (!currentContext(c) || catalogueSaving) return;
  if (factAttempt || factSaving) {
    message("Resolve the pending classification operation first.", true);
    return;
  }
  const button = event.submitter,
    kind = $("[data-kind]").value,
    revision = Number(current?.revision || 0),
    entries = [...panel.querySelectorAll("[data-entries] tr")].map((tr) => {
      const get = (k) => tr.querySelector('[data-key="' + k + '"]'),
        entry = {
          code: get("code").value.trim(),
          label: get("label").value.trim(),
          active: get("active").checked,
          definitionRevision: tr.dataset.definition || "definition-1",
        };
      if (kind === "operational-tag")
        Object.assign(entry, {
          category: get("category").value,
          ttbVisible: get("ttbVisible").checked,
          order: Number(get("order").value),
        });
      else if (kind === "hr-term") entry.category = get("category").value;
      else {
        entry.flags = Object.fromEntries(
          flags.map((k) => [
            k,
            tr.querySelector('[data-flag="' + k + '"]').checked,
          ]),
        );
        const mapping = tr.querySelector("[data-eo]");
        if (mapping.disabled)
          entry.eoAppointment = structuredClone(mapping.originalMapping);
        else if (!mapping.value) entry.eoAppointment = null;
        else {
          if (!mapping.mappingValues.has(mapping.value))
            throw Error("Choose a known EO mapping.");
          entry.eoAppointment = structuredClone(
            mapping.mappingValues.get(mapping.value),
          );
        }
      }
      return entry;
    });
  dirtyId ??= crypto.randomUUID();
  catalogueAttempt ??= {
    operationId: dirtyId,
    revision,
    catalogue: {
      catalogueId: $("[data-id]").value.trim(),
      revision: String(revision + 1),
      kind,
      entries,
    },
  };
  button.disabled = true;
  catalogueSaving = true;
  lockCatalogue(true);
  try {
    const result = await api.request("contacts", "/catalogues", {
      method: "POST",
      body: catalogueAttempt,
    });
    if (!currentContext(c)) return;
    if (
      result.operationId === catalogueAttempt.operationId &&
      result.state === "terminal-not-committed"
    ) {
      catalogueAttempt = null;
      dirtyId = null;
      message(
        "Catalogue changes were not saved. Review the retained definition draft before a new attempt.",
        true,
      );
      return;
    }
    const confirmed =
      result.operationId === catalogueAttempt.operationId &&
      result.state === "committed" &&
      result.result?.catalogueId === catalogueAttempt.catalogue.catalogueId &&
      result.result?.revision === catalogueAttempt.catalogue.revision;
    message(
      confirmed
        ? "Catalogue revision saved."
        : "Catalogue change unconfirmed. Retry preserves operation " +
            catalogueAttempt.operationId,
    );
    if (confirmed) {
      dirtyId = null;
      catalogueAttempt = null;
      try {
        await refresh();
        if (!currentContext(c)) return;
        const views = await refreshNative(c);
        if (!currentContext(c)) return;
        lockCatalogue(false);
        renderCatalogue(null);
        message("Catalogue revision saved." + viewMessage(views));
      } catch (error) {
        if (currentContext(c))
          message(
            "Catalogue revision saved. View refresh unavailable: " +
              error.message,
            true,
          );
      }
    }
  } catch (error) {
    if (!currentContext(c)) return;
    if (error.code === "OPERATION_ABORTED") {
      catalogueAttempt = null;
      dirtyId = null;
    }
    message(
      error.message +
        " Operation: " +
        (dirtyId || "terminal; review before a new attempt"),
      true,
    );
  } finally {
    if (currentContext(c)) {
      catalogueSaving = false;
      lockCatalogue(!!catalogueAttempt);
      button.disabled = false;
    }
  }
};
try {
  const initialEpoch = contextEpoch,
    session = await api.getSession();
  if (
    initialEpoch !== contextEpoch ||
    !session ||
    session.impersonating ||
    !canManage()
  )
    panel.hidden = true;
  else {
    owner = sessionKey(session);
    await refresh();
  }
} catch (error) {
  message(error.message, true);
}
const inbox = document.createElement("details");
inbox.innerHTML =
  "<summary>Deploy contribution review</summary><p>Publication has already succeeded. Review each pending or conflicting Contacts field independently. Accepting a field does not republish Deploy.</p><button data-load-contributions>Refresh contributions</button><div data-contributions></div>";
panel.append(inbox);
async function loadContributions() {
  const result = await api.request("contacts", "/contributions"),
    host = inbox.querySelector("[data-contributions]");
  host.replaceChildren();
  for (const row of result.rows) {
    const card = document.createElement("section");
    card.className = "gsis-panel";
    const title = document.createElement("h3");
    title.textContent = row.staff_id + " · " + row.field + " · " + row.state;
    const info = document.createElement("p");
    info.textContent =
      "Publication " +
      (row.source_publication || "staff proposal") +
      " · proposer " +
      row.proposer +
      " · proposed base " +
      row.base_revision +
      " · current revision " +
      (row.current?.revision ?? 0);
    const values = document.createElement("p");
    values.textContent =
      "Current: " +
      (row.current?.value_json ?? "Missing") +
      " · Proposed: " +
      JSON.stringify(row.value);
    card.append(title, info, values);
    if (["pending", "conflicted"].includes(row.state)) {
      const controls = document.createElement("div");
      controls.className = "gsis-formrow";
      const choice = document.createElement("select");
      choice.append(
        option("Choose a resolution", ""),
        option("Accept the proposed value", "accept"),
        option("Reject this proposal", "reject"),
        option("Correct before acceptance", "correct"),
      );
      const correction = document.createElement("input");
      correction.placeholder = "Corrected value";
      correction.hidden = true;
      choice.onchange = () => {
        correction.hidden = choice.value !== "correct";
      };
      const button = document.createElement("button");
      button.textContent = "Record reviewed resolution";
      let attempt = null;
      button.onclick = async () => {
        if (!choice.value) return;
        button.disabled = true;
        try {
          let value;
          if (choice.value === "correct") {
            if (row.field === "employmentActive") {
              if (!["true", "false"].includes(correction.value))
                throw Error("Use true or false for employment Active.");
              value = correction.value === "true";
            } else if (["basicName"].includes(row.field))
              value = correction.value;
            else {
              const codes = correction.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                refs = codes.map((code) => {
                  const found = choices(row.field).filter(
                    (x) => x.ref.code === code,
                  );
                  if (found.length !== 1)
                    throw Error("Choose current unambiguous catalogue codes.");
                  return found[0].ref;
                });
              value = multi.has(row.field) ? refs : refs[0];
            }
          }
          attempt ??= {
            operationId: crypto.randomUUID(),
            contributionId: row.contribution_id,
            resolution: choice.value,
            revision: row.current?.revision ?? 0,
            ...(choice.value === "correct" ? { value } : {}),
          };
          const response = await api.request(
            "contacts",
            "/contributions/resolve",
            { method: "POST", body: attempt },
          );
          if (response.state === "committed") {
            message("Reviewed contribution resolution recorded.");
            attempt = null;
            await loadContributions();
          } else
            message(
              "Resolution pending. Retry preserves operation " +
                attempt.operationId,
            );
        } catch (error) {
          if (
            [400, 403].includes(error.status) ||
            error.code === "OPERATION_ABORTED"
          )
            attempt = null;
          message(
            error.message +
              (attempt ? " Operation " + attempt.operationId : ""),
            true,
          );
        } finally {
          button.disabled = false;
        }
      };
      controls.append(choice, correction, button);
      card.append(controls);
    }
    host.append(card);
  }
  if (!result.rows.length) {
    const empty = document.createElement("p");
    empty.textContent = "No delivered staff contributions.";
    host.append(empty);
  }
}
inbox.querySelector("[data-load-contributions]").onclick = () =>
  loadContributions().catch((error) => message(error.message, true));
