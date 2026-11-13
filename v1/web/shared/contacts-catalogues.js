const api = window.GSISV1;
const panel = document.createElement("details");
panel.className = "gsis-panel";
panel.innerHTML =
  '<summary>Staff classifications and controlled catalogues</summary><p>Choose explicit staff facts from Contacts-owned definitions. Classifications and display tags do not grant SMC, EO or School Leader authority.</p><div class="gsis-formrow"><label>Staff member<select data-staff></select></label><button data-refresh>Refresh</button></div><p data-status role="status"></p><form data-facts><div data-fields class="gsis-formrow"></div><button class="primary">Save classifications</button></form><details><summary>Maintain catalogue definitions</summary><p>Stable codes are retained. Retire unused entries; use a new code for a different meaning. Display changes update current names and preserve historical snapshots.</p><div class="gsis-formrow"><label>Catalogue<select data-catalogue></select></label><button data-new>New catalogue</button></div><form data-definitions><div class="gsis-formrow"><label>Stable catalogue ID<input data-id required pattern="[A-Za-z0-9][A-Za-z0-9._:-]*"></label><label>Kind<select data-kind><option value="operational-tag">Operational tags</option><option value="hr-term">HR terms</option><option value="membership-role">Roles and memberships</option></select></label></div><div style="overflow:auto"><table><thead><tr><th>Code</th><th>Label</th><th>Category / role flags</th><th>Visible in TTb</th><th>Order</th><th>Active</th></tr></thead><tbody data-entries></tbody></table></div><button type="button" data-add>Add entry</button> <button class="primary">Save catalogue revision</button></form></details>';
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
  catalogueAttempt = null;
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
function renderFacts() {
  const host = $("[data-fields]");
  host.replaceChildren();
  if (!staff) return;
  for (const [field, label] of Object.entries(names)) {
    const wrap = document.createElement("label");
    wrap.textContent = label;
    const select = document.createElement("select");
    select.dataset.field = field;
    select.multiple = multi.has(field);
    if (!select.multiple) select.append(option("Not recorded", ""));
    if (field === "employmentActive") {
      select.append(option("Yes", "true"), option("No", "false"));
    } else if (field === "profileState") {
      select.append(
        option("Provisional", "provisional"),
        option("Complete", "complete"),
      );
    } else
      for (const c of choices(field))
        select.append(option(c.label, JSON.stringify(c.ref)));
    const value = staff.fields?.[field]?.effective
        ? staff.fields[field].value
        : null,
      values = Array.isArray(value) ? value : [value];
    for (const o of select.options)
      o.selected = values.some((v) =>
        typeof v === "object" && v
          ? JSON.stringify(v) === o.value
          : String(v) === o.value,
      );
    wrap.append(select);
    host.append(wrap);
  }
}
async function loadStaff() {
  if (factAttempt) {
    message(
      "Resolve or retry the pending classification operation before changing staff.",
      true,
    );
    return;
  }
  if (!staffSelect.value) {
    staff = null;
    renderFacts();
    return;
  }
  staff = await api.request(
    "contacts",
    "/staff/" + encodeURIComponent(staffSelect.value),
  );
  renderFacts();
}
async function refresh() {
  const [cs, people] = await Promise.all([
    api.request("contacts", "/catalogues"),
    api.request("contacts", "/staff"),
  ]);
  catalogues = cs.rows;
  const selected = staffSelect.value;
  staffSelect.replaceChildren(option("Choose a staff member", ""));
  for (const p of people.rows)
    staffSelect.append(option(p.name + " · " + p.staffId, p.staffId));
  staffSelect.value = selected;
  catalogueSelect.replaceChildren(option("Choose a catalogue", ""));
  for (const c of catalogues)
    catalogueSelect.append(
      option(c.catalogueId + " · revision " + c.revision, c.catalogueId),
    );
  await loadStaff();
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
    for (const c of choices("eoAppointmentLevel"))
      eo.append(option(c.label, JSON.stringify(c.ref)));
    eo.value = entry.eoAppointment ? JSON.stringify(entry.eoAppointment) : "";
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
staffSelect.onchange = () => loadStaff().catch((e) => message(e.message, true));
catalogueSelect.onchange = () =>
  renderCatalogue(
    catalogues.find((c) => c.catalogueId === catalogueSelect.value),
  );
$("[data-refresh]").onclick = () =>
  refresh().catch((e) => message(e.message, true));
$("[data-new]").onclick = () => renderCatalogue(null);
$("[data-kind]").onchange = () => {
  $("[data-entries]").replaceChildren();
};
$("[data-add]").onclick = () => entryRow();
$("[data-facts]").onsubmit = async (event) => {
  event.preventDefault();
  if (!staff) return;
  const changes = {};
  for (const select of panel.querySelectorAll("[data-field]")) {
    const field = select.dataset.field,
      values = [...select.selectedOptions].map((o) => o.value).filter(Boolean);
    if (!values.length && !multi.has(field)) continue;
    const decode = (v) =>
        field === "employmentActive"
          ? v === "true"
          : field === "profileState"
            ? v
            : JSON.parse(v),
      value = multi.has(field) ? values.map(decode) : decode(values[0]);
    if (JSON.stringify(value) !== JSON.stringify(staff.fields?.[field]?.value))
      changes[field] = value;
  }
  if (!Object.keys(changes).length && !factAttempt) {
    message("No classification changes.");
    return;
  }
  if (Object.keys(changes).length > 8) {
    message("Save up to eight classification fields at once.", true);
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  try {
    factAttempt ??= {
      staffId: staff.staffId,
      body: {
        operationId: crypto.randomUUID(),
        revision: staff.revision,
        changes,
      },
    };
    const result = await api.request(
      "contacts",
      "/staff/" + encodeURIComponent(factAttempt.staffId) + "/update",
      { method: "POST", body: factAttempt.body },
    );
    message(
      result.state === "committed"
        ? "Classifications saved."
        : "Change pending: " + (result.reason || result.state),
    );
    if (result.state === "committed") {
      factAttempt = null;
      await loadStaff();
    }
  } catch (error) {
    if ([400, 403].includes(error.status) || error.code === "OPERATION_ABORTED")
      factAttempt = null;
    message(
      error.message +
        (factAttempt
          ? " Retry preserves operation " + factAttempt.body.operationId
          : ""),
      true,
    );
  } finally {
    button.disabled = false;
  }
};
$("[data-definitions]").onsubmit = async (event) => {
  event.preventDefault();
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
        entry.eoAppointment = tr.querySelector("[data-eo]").value
          ? JSON.parse(tr.querySelector("[data-eo]").value)
          : null;
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
  try {
    const result = await api.request("contacts", "/catalogues", {
      method: "POST",
      body: catalogueAttempt,
    });
    message(
      result.state === "committed"
        ? "Catalogue revision saved."
        : "Catalogue change pending: " + (result.reason || result.state),
    );
    if (result.state === "committed") {
      dirtyId = null;
      catalogueAttempt = null;
      await refresh();
      renderCatalogue(null);
    }
  } catch (error) {
    if (
      [400, 403].includes(error.status) ||
      error.code === "OPERATION_ABORTED"
    ) {
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
    button.disabled = false;
  }
};
try {
  const session = await api.getSession();
  if (!session || session.impersonating || !api.capable("contacts.manage"))
    panel.hidden = true;
  else await refresh();
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
