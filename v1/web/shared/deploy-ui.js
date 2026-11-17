/* Empty-data navigation mirrors the v0.9 taxonomy without pretending a draft exists. */
(function () {
  "use strict";
  const labels = [
    "IP Deploy",
    "Dept",
    "Committees",
    "CCAs",
    "PLT",
    "Events",
    "Duty",
    "Workload",
    "Stats",
    "Ledger",
    "Duty Cards",
    "Classes & TGs",
    "Layout",
    "Program Settings",
    "Relief Settings",
    "HR Settings",
    "Workload Settings",
    "Versions",
    "ASC Export",
    "Audit",
  ];
  let fallback = false,
    create = null,
    selected = "Versions";
  function renderEmpty(next) {
    selected = next;
    const content = document.getElementById("content"),
      nav = document.getElementById("nav");
    if (!content || !nav) return;
    content.dataset.view = next;
    content.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = next;
    const p = document.createElement("p");
    p.textContent =
      next === "Versions"
        ? "No planning version exists yet. Create the initial baseline to begin."
        : "This view becomes available after a planning version is created. Open Versions to begin.";
    content.append(h, p);
    if (next === "Versions" && create) content.append(create);
    else {
      const b = document.createElement("button");
      b.textContent = "Open Versions";
      b.onclick = () => renderEmpty("Versions");
      content.append(b);
    }
    nav.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("selected", b.dataset.tab === next);
      b.setAttribute("aria-current", b.dataset.tab === next ? "page" : "false");
    });
    dispatchEvent(new Event("gsis:navigation"));
  }
  function sync() {
    const nav = document.getElementById("nav"),
      content = document.getElementById("content"),
      version = document.getElementById("version");
    if (!nav || !content || !version) return;
    const exists = !!version.value;
    if (exists) {
      fallback = false;
      return;
    }
    if (
      !content.textContent.includes("No deployment version is available.") &&
      !fallback
    )
      return;
    const initial = [...content.querySelectorAll("button")].find(
      (b) => b.textContent === "Create initial baseline",
    );
    if (initial) create = initial;
    if (nav.hidden) nav.hidden = false;
    if (fallback && nav.querySelector("[data-empty-version]")) return;
    fallback = true;
    nav.replaceChildren();
    for (const label of labels) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.dataset.tab = label;
      b.dataset.emptyVersion = "";
      b.onclick = () => renderEmpty(label);
      nav.append(b);
    }
    renderEmpty(selected);
  }
  new MutationObserver((records) => {
    if (
      records.some(
        (r) =>
          r.target.id === "nav" ||
          r.target.id === "content" ||
          r.target.id === "version",
      )
    )
      sync();
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });
  sync();
})();

// Own the Membership view in v1 while retaining the existing draft queue,
// leases, revision checks and original-operation recovery of the Deploy shell.
(function () {
  "use strict";
  const api = window.GSISV1;
  const managedGroups = ["SL", "SC", "SMC", "KP", "TL", "SDT", "CMT", "SAT", "Support", "MK"];
  const hrFields = ["Day of Birth", "Month of birth", "Role", "EO Appt Level", "Appointment Status", "Employment Modifier", "Subject Modifier", "Active", "MK Modifier"];
  const fixedChoices = { "Day of Birth": Array.from({ length: 31 }, (_, i) => String(i + 1)),
    "Month of birth": Array.from({ length: 12 }, (_, i) => String(i + 1)), Active: ["Y", "N"] };
  function choiceLists(doc) {
    const source = doc?.hrChoicesSchema === 1 ? doc.hrChoices : doc?.masterOptions || doc?.hrTerms || {};
    const result = Object.fromEntries(hrFields.map(field => [field,
      [...(Object.hasOwn(fixedChoices, field) ? fixedChoices[field]
        : field === "Role" ? doc?.masterOptions?.Role || doc?.hrTerms?.Role || []
        : Array.isArray(source?.[field]) ? source[field] : [])]]));
    if (doc?.roleMembershipSchema === 1) result.Role = [...new Set((doc.membership || []).map(row => String(row[0]).trim()).filter(Boolean))];
    return result;
  }
  function linkChoices(doc) {
    const lists = choiceLists(doc);
    if (doc.hrChoicesSchema === 1 || doc.roleMembershipSchema === 1 || Object.hasOwn(doc, "masterOptions"))
      doc.masterOptions = structuredClone(lists);
    doc.hrTerms = structuredClone(lists);
    return lists;
  }

  const mappingFor = (doc, teacher) => doc.roleMembershipSchema === 1
    ? (doc.membership || []).find(row => String(row[0]).trim().toLowerCase() ===
        String(doc.teacherDrafts?.[teacher.id]?.Role ?? teacher.profile?.Role ?? teacher.role ?? "").trim().toLowerCase()) : null;
  const groupsFor = row => managedGroups.filter((_, index) => row[index + 2] === "1");
  const valueOf = (doc, id) => {
    const value = doc.teachers?.find((t) => t.id === id)?.deploymentTags?.Memberships;
    return Array.isArray(value) ? value : null;
  };
  function labels(text) {
    const values = [...new Set(text.split(/\r?\n/).map((v) => v.trim()).filter(Boolean))];
    if (values.some((value) => /[,;]/.test(value)))
      throw Error("Use one label per line. Commas and semicolons cannot be part of a membership label.");
    if (values.length > 32 || values.some((v) => v.length > 160 || /[\x00-\x1f\x7f]/.test(v)))
      throw Error("Use at most 32 memberships, each up to 160 characters without control characters.");
    return values;
  }
  function install() {
    if (!api || typeof window.membershipPage !== "function") return;
    const matrixStyle = document.createElement("style");
    matrixStyle.textContent = 'html body #content table[data-role-membership] .gsis-core-filter input{width:50px!important;min-width:0!important;max-width:100%!important}html body #content table[data-role-membership] input[data-member-col="0"],html body #content table[data-role-membership] .gsis-core-filter th:first-child input{width:140px!important;max-width:140px!important}html body #content table[data-role-membership] input[data-member-col="1"],html body #content table[data-role-membership] .gsis-core-filter th:nth-child(2) input{width:280px!important;max-width:280px!important}html body #content table[data-role-membership] input[data-member-col="12"]{width:130px!important;max-width:130px!important}table[data-role-membership] thead tr:first-child th:first-child{background:#1e4a5c;color:#fff}';
    document.head.append(matrixStyle);
    // The copied v0.9 resolver infers managed groups from appointment grades.
    // An explicit v1 matrix owns those groups, including unchecked flags and
    // unmatched staff's existing labels, both during snapshot load and preview.
    let incomingDocument = null;
    window.hrTermLists = () => choiceLists(v());
    window.teacherTermLists = () => choiceLists(v());
    const originalAccept = window.acceptSnapshot;
    window.acceptSnapshot = data => {
      const previous = incomingDocument;
      incomingDocument = data.current || (data.unchanged ? v() : null);
      if (incomingDocument) linkChoices(incomingDocument);
      try { return originalAccept(data); } finally { incomingDocument = previous; }
    };
    const originalResolve = window.GSISTeachingRules.resolve;
    window.GSISTeachingRules.resolve = (teacher, catalogue, live, draft) => {
      const doc = incomingDocument || v();
      if (doc?.roleMembershipSchema !== 1) return originalResolve(teacher, catalogue, live, draft);
      const result = originalResolve(teacher, undefined, live, draft);
      const mapping = mappingFor(doc, result);
      const existing = teacher.deploymentTags?.Memberships || teacher.groups || [];
      result.groups = mapping ? [...existing.filter(label => !managedGroups.includes(label)), ...groupsFor(mapping)] : [...existing];
      if (mapping) result.profile["EO Appt Level"] = mapping[12] || "";
      return result;
    };
    const originalKey = window.queueKey;
    window.queueKey = (edit) => edit.operation === "setHRChoices" ? "hr-choices" : edit.operation === "setRoleMemberships" ? "role-memberships"
      : edit.operation === "setTeacherMemberships" ? "memberships:" + edit.teacher : originalKey(edit);
    const originalProject = window.projectEditBase;
    window.projectEditBase = (doc, edit) => {
      if (edit.operation === "setHRChoices") {
        doc.hrChoicesSchema = 1;
        doc.hrChoices = Object.fromEntries(hrFields.filter(field => !Object.hasOwn(fixedChoices, field) && field !== "Role")
          .map(field => [field, [...edit.value[field]]]));
        linkChoices(doc);
        return;
      }
      if (edit.operation === "setRoleMemberships") {
        doc.membership = structuredClone(edit.value); doc.roleMembershipSchema = 1;
        linkChoices(doc);
        for (const teacher of doc.teachers || []) {
          const mapping = mappingFor(doc, teacher);
          if (!mapping) continue;
          const custom = (teacher.deploymentTags?.Memberships ?? teacher.groups ?? []).filter(value => !managedGroups.includes(value));
          teacher.deploymentTags = { ...teacher.deploymentTags, Memberships: [...custom, ...groupsFor(mapping)], "EO Appt Level": mapping[12] || null };
          teacher.groups = [...teacher.deploymentTags.Memberships];
          teacher.profile = { ...teacher.profile, "EO Appt Level": mapping[12] || "" };
        }
        if (doc.reliefResults) doc.reliefResults.pending = true;
        return;
      }
      if (edit.operation !== "setTeacherMemberships") {
        const result = originalProject(doc, edit);
        if (["setTeacherField", "upsertTeacherProfile"].includes(edit.operation)) {
          const person = doc.teachers.find(teacher => teacher.id === edit.teacher);
          const mapping = person && mappingFor(doc, person);
          if (mapping) {
            const custom = (person.deploymentTags?.Memberships ?? person.groups ?? []).filter(value => !managedGroups.includes(value));
            person.deploymentTags = { ...person.deploymentTags, Memberships: [...custom, ...groupsFor(mapping)], "EO Appt Level": mapping[12] || null };
            person.groups = [...person.deploymentTags.Memberships];
            person.profile = { ...person.profile, "EO Appt Level": mapping[12] || "" };
          }
        }
        return result;
      }
      const teacher = doc.teachers.find((t) => t.id === edit.teacher);
      if (!teacher) throw Error("This teacher is no longer in the selected version.");
      teacher.deploymentTags ??= {};
      teacher.deploymentTags.Memberships = [...edit.value];
      teacher.groups = [...edit.value];
    };
    const originalDisplay = window.draftDisplayValue;
    window.draftDisplayValue = (doc, edit) => edit.operation === "setHRChoices" ? choiceLists(doc) : edit.operation === "setRoleMemberships"
      ? (doc.membership || []) : edit.operation === "setTeacherMemberships"
        ? valueOf(doc, edit.teacher) : originalDisplay(doc, edit);
    const originalStatus = window.drawQueueStatus;
    window.drawQueueStatus = () => {
      originalStatus();
      if (["Membership", "HR Terms"].includes(document.getElementById("content")?.dataset.view) && api.capable("deploy.edit"))
        document.getElementById("saveQueue").hidden = false;
    };
    window.masterOptionsPage = (root) => {
      const lists = choiceLists(v()), editable = api.capable("deploy.edit");
      const note = document.createElement("p"); note.className = "hint";
      note.textContent = "Choices belong to this planning version and feed its teacher and Membership selectors. Saving does not change Contacts catalogues. Existing staff values outside these choices are retained and flagged. Edit Role choices in Membership.";
      const error = document.createElement("p"); error.className = "error"; error.setAttribute("role", "status");
      const table = document.createElement("table"); table.dataset.hrChoices = "";
      table.dataset.workbookScope = "HR Terms"; table.dataset.controlsWired = "true";
      const header = table.createTHead().insertRow();
      for (const title of ["Field", "Choices — one per line"]) { const th = document.createElement("th"); th.scope = "col"; th.textContent = title; header.append(th); }
      const body = table.createTBody();
      for (const field of hrFields) {
        const row = body.insertRow(); row.insertCell().textContent = field;
        const cell = row.insertCell(), fixed = field === "Role" || Object.hasOwn(fixedChoices, field);
        if (fixed || !editable) {
          const span = document.createElement("span"); span.dataset.hrChoiceField = field;
          span.style.whiteSpace = "pre-line"; span.textContent = lists[field].join(", "); cell.append(span);
          if (field === "Role") { const hint = document.createElement("small"); hint.textContent = "Defined in Membership"; cell.append(hint); }
          continue;
        }
        const input = document.createElement("textarea"); input.dataset.hrChoiceField = field;
        input.setAttribute("aria-label", field + " choices"); input.rows = Math.min(6, Math.max(2, lists[field].length));
        input.style.cssText = "min-width:20rem;width:100%;box-sizing:border-box"; input.value = lists[field].join("\n");
        input.oninput = () => { unsavedDraft = true; };
        input.onchange = () => {
          try {
            const values = [...new Set(input.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean))];
            if (values.length > 150 || values.some(value => value.length > 160 || /[\x00-\x1f\x7f]/.test(value)))
              throw Error("Use at most 150 choices, each up to 160 characters without control characters.");
            const expected = choiceLists(v()), value = { ...expected, [field]: values };
            unsavedDraft = false;
            window.queueCell({ operation: "setHRChoices", value, expected });
            error.textContent = "";
          } catch (failure) { unsavedDraft = true; error.textContent = failure.message; }
          window.drawQueueStatus();
        };
        cell.append(input);
      }
      const scroll = document.createElement("div"); scroll.className = "scroll"; scroll.append(table);
      root.replaceChildren(note, error, scroll);
    };
    const originalTeacherEditor = window.editTeacherProfile;
    window.editTeacherProfile = teacher => {
      originalTeacherEditor(teacher);
      const editor = document.querySelector('.inline-editor[aria-label="Add teacher"],.inline-editor[aria-label="Edit teacher"]');
      if (!editor) return;
      const role = editor.querySelector('[data-profile="1"]'), grade = editor.querySelector('[data-profile="2"]');
      if (!role || !grade) return;
      const update = () => {
        if (v()?.roleMembershipSchema !== 1) return;
        const mapping = (v().membership || []).find(row => String(row[0]).trim().toLowerCase() === role.value.trim().toLowerCase());
        if (mapping) grade.value = mapping[12] || "";
      };
      role.addEventListener("change", update); update();
    };
    function staffMembershipPage(root) {
      const doc = v();
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = "Memberships belong to this planning version. Enter one label per line; save the draft, then publish to update Contacts. These labels do not grant access.";
      const table = document.createElement("table");
      table.dataset.contactsReference = "";
      table.dataset.workbookScope = "Membership";
      table.dataset.controlsWired = "true"; // Core owns this table's controls.
      const header = table.createTHead().insertRow();
      for (const label of ["Staff ID", "TTb Name", "Role", "Memberships"]) {
        const th = document.createElement("th");
        th.scope = "col"; th.textContent = label; header.append(th);
      }
      const body = table.createTBody();
      for (const teacher of doc.teachers || []) {
        const row = body.insertRow();
        row.dataset.membershipsTeacher = teacher.id;
        for (const text of [teacher.id, teacher.ttbName || teacher.name, teacher.profile?.Role || teacher.role || ""])
          row.insertCell().textContent = text;
        const cell = row.insertCell(), value = valueOf(doc, teacher.id), mapping = mappingFor(doc, teacher);
        const managed = mapping ? groupsFor(mapping) : null;
        const editableValue = managed ? (value || []).filter(label => !managedGroups.includes(label)) : value;
        if (!api.capable("deploy.edit")) {
          cell.textContent = value === null ? "Not recorded" : value.join("\n");
          continue;
        }
        const input = document.createElement("textarea");
        input.rows = Math.max(2, Math.min(5, value?.length || 2));
        input.style.cssText = "min-width:15rem;width:100%;box-sizing:border-box";
        input.value = editableValue?.join("\n") || "";
        if (managed) {
          const fixed = document.createElement("p"); fixed.dataset.managedMemberships = "";
          fixed.textContent = "From role mapping: " + (managed.join(", ") || "None") + ". Edit these checkboxes above; use the box below for other memberships.";
          cell.append(fixed);
        }
        input.placeholder = value === null ? "Not recorded" : "No memberships";
        input.setAttribute("aria-label", "Memberships for " + (teacher.ttbName || teacher.name));
        const error = document.createElement("span");
        error.className = "error"; error.setAttribute("role", "status");
        function queue(next, explicit = false) {
          if (!api.capable("deploy.edit")) return;
          if (managed) {
            if (next.some(label => managedGroups.includes(label))) throw Error("Change managed memberships in the role matrix above.");
            next = [...next, ...managed];
          }
          // Merely focusing an unknown blank is never an explicit clear.
          if (!explicit && JSON.stringify(next) === JSON.stringify(value || [])) return;
          try {
            window.queueCell({ operation: "setTeacherMemberships", teacher: teacher.id,
              value: next, expected: value });
          } catch (failure) { error.textContent = failure.message; }
        }
        input.onchange = () => {
          try { queue(labels(input.value)); } catch (failure) { error.textContent = failure.message; }
        };
        const clear = document.createElement("button");
        clear.type = "button"; clear.textContent = managed ? "Clear other memberships" : "Clear memberships";
        clear.setAttribute("aria-label", (managed ? "Clear other memberships for " : "Clear memberships for ") + (teacher.ttbName || teacher.name));
        clear.onclick = () => queue([], true);
        cell.append(input, clear, error);
      }
      if (!body.rows.length) {
        const cell = body.insertRow().insertCell();
        cell.colSpan = 4; cell.textContent = "No teachers are available in this version.";
      }
      const scroll = document.createElement("div");
      scroll.className = "scroll"; scroll.append(table);
      root.replaceChildren(note, scroll);
    }
    const fields = ["Role Shortform", "Formal Role Name", "SL", "SC", "SMC", "KP", "TL", "SDT", "CMT", "SAT", "Support", "MK", "EO Appt Level", "EO"];
    let staffOpen = false;
    window.membershipPage = (root) => {
      const doc = v(), rows = doc.membership || [], editable = api.capable("deploy.edit");
      let draftRows = structuredClone(rows);
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = "Save this version, then publish to update Contacts memberships and SMC, EO and School Leader permissions. EO is separate from appointment level. A blank shortform with a formal name explicitly maps staff with no Role.";
      const error = document.createElement("p");
      error.className = "error"; error.setAttribute("role", "status");
      const stage = (next) => {
        if (!editable) return;
        draftRows = next;
        try {
          if (next.length > 300) throw Error("Use at most 300 role mappings.");
          const names = next.map(row => String(row[0]).trim().toLocaleLowerCase());
          if (next.some(row => !String(row[0]).trim() && !String(row[1]).trim()) || new Set(names).size !== names.length)
            throw Error("Use unique role shortforms. A No role mapping needs a formal name.");
          unsavedDraft = false;
          window.queueCell({ operation: "setRoleMemberships", value: next, expected: structuredClone(v().membership || []) });
        } catch (failure) { unsavedDraft = true; error.textContent = failure.message; }
      };
      const add = document.createElement("button");
      add.type = "button"; add.textContent = "Add role"; add.disabled = !editable || rows.length >= 300;
      add.onclick = () => {
        const next = structuredClone(draftRows);
        let number = 1;
        while (next.some(row => String(row[0]).toLowerCase() === "new role " + number)) number++;
        next.push(["New role " + number, "", ...Array(10).fill(""), "", null]);
        stage(next);
      };
      const table = document.createElement("table");
      table.dataset.roleMembership = ""; table.dataset.workbookScope = "Role Membership";
      table.dataset.contactsReference = "role-matrix";
      table.dataset.controlsWired = "true"; // Skip the copied v0.9 column picker; use Core.
      const header = table.createTHead().insertRow();
      for (const [index, label] of [...fields, "Delete"].entries()) {
        const cell = document.createElement("th"); cell.scope = "col"; cell.textContent = label;
        cell.style.width = (index === 0 ? 140 : index === 1 ? 330 : index === 10 ? 90 : index === 12 ? 150 : index === 13 ? 86 : index === 14 ? 76 : 54) + "px";
        header.append(cell);
      }
      const gradeChoices = document.createElement("datalist"); gradeChoices.id = "deploy-role-grade-choices";
      for (const value of choiceLists(doc)["EO Appt Level"]) gradeChoices.append(new Option(value, value));
      const body = table.createTBody();
      rows.forEach((row, index) => {
        const tr = body.insertRow(); tr.dataset.roleMembershipRow = String(index);
        fields.forEach((field, column) => {
          const cell = tr.insertCell();
          const control = document.createElement(column === 13 ? "select" : "input");
          control.dataset.memberRow = String(index); control.dataset.memberCol = String(column);
          control.setAttribute("aria-label", field + " for " + (row[0] || "No role"));
          if (column > 1 && column < 12) {
            control.type = "checkbox"; control.checked = row[column] === "1" || row[column] === true;
            control.disabled = !editable;
          } else if (column === 13) {
            control.dataset.native = "";
            for (const [value, label] of [["", "Not set"], ["true", "Yes"], ["false", "No"]])
              control.add(new Option(label, value));
            control.value = row[13] === true ? "true" : row[13] === false ? "false" : "";
            control.disabled = !editable;
          } else {
            control.type = "text"; control.value = row[column] || "";
            control.maxLength = column === 1 ? 240 : 160; control.readOnly = !editable;
            control.style.minWidth = column === 1 ? "18rem" : "7rem";
            if (column === 0) control.placeholder = "(No role)";
            if (column === 12) control.setAttribute("list", gradeChoices.id);
          }
          control.onchange = () => {
            const next = structuredClone(draftRows);
            next[index][column] = control.type === "checkbox" ? (control.checked ? "1" : "")
              : column === 13 ? (control.value === "" ? null : control.value === "true") : control.value.trim();
            stage(next);
          };
          cell.append(control);
        });
        const remove = document.createElement("button");
        remove.type = "button"; remove.textContent = "×"; remove.disabled = !editable;
        remove.setAttribute("aria-label", "Delete role " + (row[0] || "No role"));
        remove.onclick = () => { if (confirm("Remove this role mapping?")) stage(draftRows.filter((_, i) => i !== index)); };
        tr.insertCell().append(remove);
      });
      if (!body.rows.length) {
        const cell = body.insertRow().insertCell(); cell.colSpan = fields.length + 1;
        cell.textContent = "No role mappings yet. Add a role or import the v0.9 Membership workbook.";
      }
      const scroll = document.createElement("div"); scroll.className = "scroll"; scroll.append(table);
      const people = document.createElement("details"); people.dataset.staffMemberships = ""; people.open = staffOpen;
      const summary = document.createElement("summary"); summary.textContent = "Individual staff memberships";
      const content = document.createElement("div"); staffMembershipPage(content);
      people.append(summary, content); people.ontoggle = () => { if (people.isConnected) staffOpen = people.open; };
      root.replaceChildren(note, add, error, gradeChoices, scroll, people);
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
