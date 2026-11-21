import { planningSnapshot, planningPerson, planningEligible, reportingRoot, reportingStaff, reportingLinks, reportingConflicts, hasReportingEdge, projectPlanningNames } from "./deploy-eligibility.mjs";

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

// Preserve the owning Deploy colours and navigation beneath shared table tools.
(function () {
  const style = document.createElement("style");
  style.textContent = `
    html body #content:is([data-view="IP Deploy"],[data-view="Teachers"],[data-view="Dept"],[data-view="Committees"],[data-view="CCAs"],[data-view="PLT"],[data-view="Events"]) table.gsis-core-table thead > tr:first-child > th:first-child {
      background:#19485e !important;color:#fff;
    }
    html body #content[data-view="Teachers"] tbody > tr[data-roster-teacher] {
      --row-band:#fff;
    }
    html body #content[data-view="Teachers"] tbody > tr:nth-child(even of [data-roster-teacher]:not([hidden])) {
      --row-band:#e8f0f5;
    }
    html body #content[data-view="Teachers"] tbody > tr[data-roster-teacher].inactive {
      --row-band:#e4e7ea !important;
    }
    html body #content[data-view="Teachers"] tbody > tr[data-roster-teacher] > :is(td,th) {
      background:var(--row-band) !important;color:#193448 !important;
    }
    html body #content[data-view="Teachers"] tbody > tr[data-roster-teacher] :is(input,select,textarea):not(.dirty) {
      background:var(--row-band);color:inherit;
    }
  `;
  document.head.append(style);
  if (typeof settingsSections !== "undefined") {
    const hr = settingsSections["HR Settings"];
    if (Array.isArray(hr)) {
      const span = hr.indexOf("Span of Control");
      if (span >= 0) hr.push(...hr.splice(span, 1));
    }
  }
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
    const originalPlanningInit = window.GSISPlanning.init;
    window.GSISPlanning.init = doc => {
      // Explicit v1 lists belong to the saved version. The v0.9 one-time
      // committee seed creates browser-only records which no v1 save owns.
      if (doc?.schemaVersion === 1 && doc.organisations) doc.planning402 = 1;
      return originalPlanningInit(doc);
    };
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
      const result = originalResolve(teacher, doc?.roleMembershipSchema === 1 ? undefined : catalogue, live, draft);
      const projected = planningPerson(doc, teacher), mapping = mappingFor(doc, projected);
      result.profile = { ...result.profile, ...projected.profile };
      if (!projected.activeKnown) delete result.profile.Active;
      if (mapping) result.profile["EO Appt Level"] = mapping[12] || "";
      result.name = projected.name;
      result.ttbName = projected.ttbName;
      for (const field of ["active", "activeKnown", "role", "groups"]) result[field] = projected[field];
      result.planningProfile = planningSnapshot(teacher);
      return result;
    };
    const originalRender = window.render;
    if (typeof originalRender === "function") window.render = (...args) => {
      const doc = v();
      if (doc) projectPlanningNames(doc);
      return originalRender(...args);
    };
    window.eligibleTeacher = teacher => planningEligible(v(), teacher);
    window.activeGroupTeachers = () => v().teachers.filter(teacher => planningEligible(v(), teacher))
      .map(teacher => planningPerson(v(), teacher)).sort((a, b) => natural(a.name, b.name));
    // This exported predicate serves Deploy selectors. The embedded calculation
    // closure and accepted authority/capacity fields are deliberately unchanged.
    window.GSISTeachingRules.eligible = teacher => planningEligible(incomingDocument || v(), teacher);
    const originalTeacherNotes = window.teacherNotesPage;
    function teacherAppointmentRank(doc, teacher) {
      if (!teacher?.active) return teacher?.activeKnown === false ? 3 : 4;
      const projected = planningPerson(doc, teacher);
      const role = projected.profile?.Role || projected.role || "";
      const level = projected.profile?.["EO Appt Level"] || "";
      const group = window.GSISTeachingRules?.group?.(role, level) || "";
      if (group === "HOD") return 0;
      if (group === "Jnr KP") return 1;
      return 2;
    }
    window.teacherNotesPage = root => {
      originalTeacherNotes(root);
      // Accepted capacity remains visible, but is not the version's picker rule.
      const labels = {
        "Teaching eligibility unavailable": "Accepted capacity inputs unavailable",
        "Not currently eligible": "Accepted capacity excludes teaching workload",
      };
      for (const status of root.querySelectorAll("[data-roster-teacher] small"))
        if (labels[status.textContent]) status.textContent = labels[status.textContent];
      for (const hint of root.querySelectorAll("p"))
        if (hint.textContent.includes("Making a teacher inactive clears their deployment allocations when saved."))
          hint.textContent = hint.textContent.replace(
            "Making a teacher inactive clears their deployment allocations when saved.",
            "Inactive staff are unavailable for new assignments; saved allocations are retained until explicitly removed.");
      const doc = v();
      const body = root.querySelector("table tbody");
      if (doc && body) {
        const rosterById = new Map((window.teacherRoster?.() || []).map(t => [t.id, t]));
        const trs = [...body.querySelectorAll("tr[data-roster-teacher]")];
        trs.forEach((tr, index) => {
          tr.dataset.initialIndex = String(index);
          const person = rosterById.get(tr.dataset.rosterTeacher) || doc.teachers?.find(t => t.id === tr.dataset.rosterTeacher);
          const projected = person ? planningPerson(doc, person) : null;
          const confirmedInactive = projected ? (projected.activeKnown && !projected.active) : tr.classList.contains("inactive");
          tr.classList.toggle("inactive", confirmedInactive);
          tr.dataset.activityState = !projected || !projected.activeKnown ? "unknown" : projected.active ? "active" : "inactive";
          tr.dataset.appointmentRank = String(teacherAppointmentRank(doc, projected || person));
        });
        if (!window.sorts?.Teachers) {
          trs.sort((a, b) =>
            Number(a.dataset.appointmentRank) - Number(b.dataset.appointmentRank) ||
            Number(a.dataset.initialIndex) - Number(b.dataset.initialIndex));
          trs.forEach(tr => body.append(tr));
        }
      }
    };
    const SINGLE_LETTER_SUFFIX_ORDER = ["P", "T", "I", "R", "C", "H", "G", "K"];
    const TWO_LETTER_SUFFIX_ORDER = ["Gc", "Gt", "P", "Rs", "Rp", "I", "D", "E", "K"];
    const rawClassesForDoc = doc =>
      doc?.classes || (doc?.venues || []).filter(r => r.form).map(r => ({ shortName: r.form, level: r.form.match(/^\d+/)?.[0], name: "" }));
    const suffixForClass = c => {
      const s = String(c?.shortName || "");
      const l = String(c?.level || "");
      return /^\d/.test(s) && l && s.startsWith(l) ? s.slice(l.length) : s;
    };
    function versionUsesTwoLetterScheme(doc) {
      const classes = rawClassesForDoc(doc).filter(c => !c?.undefinedDraft && !String(c?.shortName || "").startsWith("__undefined_"));
      return classes.some(c => suffixForClass(c).length >= 2);
    }
    function suffixRankForDoc(doc, suffix) {
      const order = versionUsesTwoLetterScheme(doc) ? TWO_LETTER_SUFFIX_ORDER : SINGLE_LETTER_SUFFIX_ORDER;
      const code = String(suffix || "").trim();
      const idx = order.findIndex(item => item.toLowerCase() === code.toLowerCase());
      return idx >= 0 ? idx : order.length;
    }
    if (typeof window.classList === "function") {
      const originalClassList = window.classList;
      window.classList = () => {
        const list = originalClassList();
        const doc = v();
        if (!doc || !Array.isArray(list)) return list;
        return list
          .map((c, index) => ({ c, index }))
          .sort((a, b) => {
            const la = Number(a.c?.level) || 0, lb = Number(b.c?.level) || 0;
            if (la !== lb) return la - lb;
            const ra = suffixRankForDoc(doc, suffixForClass(a.c));
            const rb = suffixRankForDoc(doc, suffixForClass(b.c));
            if (ra !== rb) return ra - rb;
            return a.index - b.index;
          })
          .map(entry => entry.c);
      };
    }
    if (typeof window.compareClass === "function") {
      const originalCompareClass = window.compareClass;
      window.compareClass = (a, b) => {
        const doc = v();
        const ma = /^(\d+)([A-Za-z][A-Za-z0-9_-]*)$/.exec(String(a || "").trim());
        const mb = /^(\d+)([A-Za-z][A-Za-z0-9_-]*)$/.exec(String(b || "").trim());
        if (doc && ma && mb) {
          const la = Number(ma[1]), lb = Number(mb[1]);
          if (la !== lb) return la - lb;
          const ra = suffixRankForDoc(doc, ma[2]), rb = suffixRankForDoc(doc, mb[2]);
          if (ra !== rb) return ra - rb;
        }
        return originalCompareClass(a, b);
      };
    }
    if (typeof window.selectedClassNameSet === "function") {
      window.selectedClassNameSet = () => {
        const sets = window.classNameSets();
        const doc = v();
        const explicit = window.classSetSelections?.[window.current];
        let set = sets.find(s => s.id === explicit);
        if (!set && doc && versionUsesTwoLetterScheme(doc)) {
          set = sets.find(s => s.pairs?.some(([, short]) => String(short || "").length >= 2));
        }
        set = set || sets.find(s => s.id === "new") || sets[0];
        if (!set || !doc) return set;
        const order = set.pairs?.some(([, short]) => String(short || "").length >= 2) || versionUsesTwoLetterScheme(doc)
          ? TWO_LETTER_SUFFIX_ORDER
          : SINGLE_LETTER_SUFFIX_ORDER;
        const rank = short => {
          const idx = order.findIndex(item => item.toLowerCase() === String(short || "").toLowerCase());
          return idx >= 0 ? idx : order.length;
        };
        return {
          ...set,
          pairs: (set.pairs || [])
            .map((pair, index) => ({ pair, index }))
            .sort((a, b) => rank(a.pair[1]) - rank(b.pair[1]) || a.index - b.index)
            .map(entry => entry.pair),
        };
      };
    }
    const currentStaffCatalog = () => typeof staffCatalog !== "undefined" ? staffCatalog : null;
    window.GSISReporting.staff = doc => reportingStaff(doc, { retainHistorical: true, catalog: currentStaffCatalog() });
    window.GSISReporting.snapshot = doc => reportingStaff(doc, { catalog: currentStaffCatalog() });
    window.GSISReporting.value = (doc, edit) => edit.operation === "initReporting"
      ? doc.reporting || null : reportingLinks(doc)[edit.officer] || "";
    window.GSISReporting.assign = assignPlanningReporting;
    window.reportingPage = planningReportingPage;
    const originalKey = window.queueKey;
    window.queueKey = (edit) => edit.operation === "setHRChoices" ? "hr-choices" : edit.operation === "setRoleMemberships" ? "role-memberships"
      : edit.operation === "setTeacherMemberships" ? "memberships:" + edit.teacher : originalKey(edit);
    const originalProject = window.projectEditBase;
    window.projectEditBase = (doc, edit) => {
      if (["setTeacherField", "upsertTeacherProfile"].includes(edit.operation)) {
        let person = doc.teachers.find(teacher => teacher.id === edit.teacher);
        if (!person && edit.operation === "upsertTeacherProfile") {
          originalProject(doc, edit);
          person = doc.teachers.find(teacher => teacher.id === edit.teacher);
        }
        if (!person) throw Error("This teacher is no longer in the selected version.");
        const profile = edit.operation === "setTeacherField"
          ? { ...person.profile, ...doc.teacherDrafts?.[person.id], [edit.field]: edit.value }
          : structuredClone(edit.profile);
        doc.teacherDrafts ??= {};
        doc.teacherDrafts[person.id] = profile;
        const projected = planningPerson(doc, person), mapping = mappingFor(doc, projected);
        person.profile = projected.profile;
        person.name = projected.name;
        person.ttbName = projected.ttbName;
        for (const field of ["active", "activeKnown", "role", "groups"]) person[field] = projected[field];
        if (mapping) {
          person.deploymentTags = { ...person.deploymentTags, Memberships: [...person.groups], "EO Appt Level": mapping[12] || null };
          person.profile["EO Appt Level"] = mapping[12] || "";
        }
        if (doc.reliefResults) doc.reliefResults.pending = true;
        return;
      }
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


// A local draft projection only; the owner validates and persists this edit.
function assignPlanningReporting(doc, id, ro) {
  const catalog = typeof staffCatalog !== "undefined" ? staffCatalog : null;
  const people = reportingStaff(doc, { retainHistorical: true, catalog });
  const person = people.find((row) => row.id === id),
    links = reportingLinks(doc);
  if (!person)
    throw Error("This person is no longer in the version's reporting list.");
  if (typeof ro !== "string") throw Error("Choose a reporting officer.");
  if (
    (!person.reportingAllowed || reportingRoot(doc, person)) &&
    (ro || !hasReportingEdge(doc, id))
  )
    throw Error(
      "This person cannot receive a new reporting link. An existing link may be cleared.",
    );
  if (ro && !people.some((row) => row.id === ro && row.reportingAllowed))
    throw Error(
      "Choose an active reporting officer who is available to this version.",
    );
  const next = { ...links, [id]: ro },
    seen = new Set([id]);
  for (let at = ro; at; at = next[at] || "") {
    if (seen.has(at)) throw Error("This reporting link would create a cycle.");
    seen.add(at);
  }
  const parents = { ...doc.reporting?.parents },
    officers = { ...doc.reporting?.officers };
  if (person.orphan) {
    delete parents[id];
    delete officers[id];
  } else {
    parents[id] = ro;
    officers[id] = ro;
  }
  doc.reporting = {
    ...doc.reporting,
    staff: (doc.reporting?.staff || reportingStaff(doc, { catalog })).map(person =>
      person.id === id && Object.hasOwn(person, "ro") ? { ...person, ro } : person),
    parents,
    officers,
  };
}

function planningReportingPage(root) {
  const can = window.GSISV1.capable("deploy.edit");
  if (!can) {
    root.textContent = "Deploy access is required.";
    return;
  }
  const toolbar = document.createElement("div");
  toolbar.className = "tools reporting-toolbar";
  for (const [key, label] of [
    ["assignment", "Assignment"],
    ["view", "View"],
  ]) {
    const b = button(label, () => {
      reportingView = key;
      render();
    });
    b.setAttribute("aria-pressed", String(reportingView === key));
    toolbar.append(b);
  }
  if (reportingView === "assignment") {
    const label = document.createElement("label");
    label.textContent = "Number of layers ";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "12";
    input.value = reportingLayers.get(current) || 3;
    input.setAttribute("aria-label", "Number of layers");
    input.onchange = () => {
      const n = Number(input.value);
      if (!Number.isInteger(n) || n < 1 || n > 12) {
        input.value = reportingLayers.get(current) || 3;
        return;
      }
      reportingLayers.set(current, n);
      render();
    };
    label.append(input);
    toolbar.append(label);
  }
  root.append(toolbar);
  root.insertAdjacentHTML(
    "beforeend",
    '<p class="hint">Drag a name into a reporting box. Click a name to choose its RO. Each person has one RO. Active staff are included except MK without SAT. Existing excluded links are retained for review. Layers change the view; deeper links are kept. Save changes to store your edits.</p>',
  );

  const doc = v(),
    links = reportingLinks(doc),
    conflicts = reportingConflicts(doc),
    people = reportingStaff(doc, {
      retainHistorical: true,
      catalog: typeof staffCatalog !== "undefined" ? staffCatalog : null,
    }),
    by = new Map(people.map((p) => [p.id, p])),
    officers = people.filter((p) => !reportingRoot(doc, p) || links[p.id]),
    children = (id) =>
      officers
        .filter((p) => links[p.id] === id)
        .sort((a, b) => natural(a.name, b.name)),
    roots = people
      .filter((p) => p.reportingAllowed && reportingRoot(doc, p))
      .sort((a, b) => natural(a.name, b.name)),
    unassigned = officers.filter((p) => !links[p.id] || !by.has(links[p.id])),
    shown = new Set();
  const conflicted = new Set(conflicts.map((item) => item.id));
  if (conflicts.length) {
    const note = document.createElement("p");
    note.className = "warning-text";
    note.setAttribute("role", "status");
    note.textContent =
      "Some saved reporting links disagree. Review the marked people; saving one person reconciles only that person’s link.";
    root.append(note);
  }
  const warning = (p) =>
    (p.historical
      ? '<small class="warning-text">Excluded from new choices; retained link needs review.</small>'
      : "") +
    (conflicted.has(p.id)
      ? '<small class="warning-text">Saved links disagree; review this person.</small>'
      : "");
  const matches = (p) =>
    !query ||
    [p.name, p.role, by.get(links[p.id])?.name]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase());
  const chip = (p) =>
    '<button type="button" class="ro-chip" data-ro-person="' +
    esc(p.id) +
    '" data-ro-edit="' +
    esc(p.id) +
    '" draggable="' +
    (can && p.reportingAllowed && !reportingRoot(doc, p)) +
    '" ' +
    (!p.reportingAllowed && !links[p.id] ? "disabled " : "") +
    'aria-label="Reporting officer for ' +
    esc(p.name) +
    '">' +
    esc(p.name) +
    "</button>" +
    warning(p);
  const branch = (p, trail = new Set()) => {
    if (trail.has(p.id))
      return "<li>Cycle needs review: " + esc(p.name) + "</li>";
    shown.add(p.id);
    const nested = children(p.id),
      closed = reportingCollapsed.has(p.id);
    return (
      '<li><div class="reporting-person">' +
      (nested.length
        ? '<button data-ro-toggle="' +
          esc(p.id) +
          '" aria-expanded="' +
          !closed +
          '" aria-label="' +
          (closed ? "Expand " : "Collapse ") +
          esc(p.name) +
          '">' +
          (closed ? "+" : "−") +
          "</button>"
        : '<span class="reporting-leaf">·</span>') +
      "<span>" +
      esc(p.name) +
      " <small>" +
      esc(p.role) +
      "</small>" +
      warning(p) +
      "</span></div>" +
      (nested.length
        ? "<ul " +
          (closed ? "hidden" : "") +
          ">" +
          nested.map((c) => branch(c, new Set([...trail, p.id]))).join("") +
          "</ul>"
        : "") +
      "</li>"
    );
  };
  let main = "";
  if (reportingView === "assignment") {
    let managers = roots;
    const layers = reportingLayers.get(current) || 3;
    for (let row = 0; row < layers; row++) {
      const boxes = managers.map((p) => {
        shown.add(p.id);
        return (
          '<section class="ro-box" ' +
          (p.reportingAllowed ? 'data-ro-drop="' + esc(p.id) + '"' : "") +
          "><h3>" +
          esc(p.name) +
          " <small>" +
          esc(p.role) +
          "</small></h3>" +
          warning(p) +
          "<p>" +
          children(p.id).length +
          " Job Holder(s)</p>" +
          children(p.id).filter(matches).map(chip).join("") +
          '<span class="muted">Drop a Job Holder here</span></section>'
        );
      });
      if (row === 0)
        while (boxes.length < 4)
          boxes.push(
            '<section class="ro-box ro-empty"><h3>SL position</h3><p>No active SL in this position.</p></section>',
          );
      main +=
        '<section class="ro-layer"><h3>Layer ' +
        (row + 1) +
        '</h3><div class="ro-layer-scroll scroll" tabindex="0" aria-label="Layer ' +
        (row + 1) +
        ' reporting boxes">' +
        (boxes.join("") ||
          '<p class="muted">Assign Job Holders in the row above to create their boxes.</p>') +
        "</div></section>";
      managers = managers.flatMap((p) => children(p.id));
    }
  } else {
    main =
      '<div class="reporting-directory">' +
      roots
        .map((p) => "<section><ul>" + branch(p) + "</ul></section>")
        .join("") +
      "</div>";
  }
  const disconnected = officers.filter(
    (p) =>
      !unassigned.includes(p) &&
      !shown.has(p.id) &&
      !roots.some((r) => {
        let next = p.id,
          trail = new Set();
        while (next && !trail.has(next)) {
          if (next === r.id) return true;
          trail.add(next);
          next = links[next];
        }
        return false;
      }),
  );
  if (disconnected.length)
    main +=
      '<section class="ro-review"><h3>Needs review</h3>' +
      (reportingView === "view"
        ? "<ul>" + disconnected.map((p) => branch(p)).join("") + "</ul>"
        : disconnected.filter(matches).map(chip).join("")) +
      "</section>";
  root.insertAdjacentHTML(
    "beforeend",
    '<div class="reporting-workspace reporting-content-fit" data-reporting-view="' +
      reportingView +
      '"><div class="reporting-main scroll">' +
      main +
      '</div><aside class="unassigned-pane reporting-unassigned" ' +
      (reportingView === "assignment" ? 'data-ro-drop=""' : "") +
      '><div class="ro-unassigned-head"><h3>Unassigned <span>' +
      unassigned.length +
      '</span></h3><label>Find a name<input type="search" data-ro-search aria-label="Search unassigned names" value="' +
      esc(reportingSearch.get(current) || "") +
      '"></label></div><div class="ro-unassigned-list">' +
      unassigned
        .map(
          (p) =>
            '<div data-ro-unassigned-name="' +
            esc(p.name.toLocaleLowerCase()) +
            '">' +
            (reportingView === "assignment"
              ? chip(p) +
                (links[p.id]
                  ? '<small class="warning-text">Previous RO excluded or unavailable; review retained link.</small>'
                  : "")
              : "<ul>" + branch(p) + "</ul>") +
            "</div>",
        )
        .join("") +
      "</div></aside></div>",
  );
  const search = root.querySelector("[data-ro-search]"),
    filter = () => {
      reportingSearch.set(current, search.value);
      const q = search.value.trim().toLocaleLowerCase();
      root
        .querySelectorAll("[data-ro-unassigned-name]")
        .forEach((e) => (e.hidden = !e.dataset.roUnassignedName.includes(q)));
    };
  search.oninput = filter;
  filter();
  const assign = (id, ro) => {
    try {
      GSISReporting.assign(clone(v()), id, ro);
      queueCell({
        operation: "setReportingOfficer",
        officer: id,
        value: ro,
        expected: links[id] || "",
      });
    } catch (e) {
      alert(e.message);
    }
  };
  root.querySelectorAll("[data-ro-toggle]").forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.roToggle;
        reportingCollapsed.has(id)
          ? reportingCollapsed.delete(id)
          : reportingCollapsed.add(id);
        render();
      }),
  );
  root.querySelectorAll("[data-ro-edit]").forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.roEdit,
          p = by.get(id);
        modal(
          "Reporting officer for " + p.name,
          '<label>Reporting officer<select id="reportingChoice"><option value="">Unassigned</option>' +
            options(
              people
                .filter(
                  (r) =>
                    r.id !== id &&
                    r.reportingAllowed &&
                    p.reportingAllowed &&
                    !reportingRoot(doc, p),
                )
                .map((r) => [r.id, r.name + " · " + r.role]),
              links[id] || "",
            ) +
            (links[id] &&
            (!p.reportingAllowed ||
              reportingRoot(doc, p) ||
              !by.get(links[id])?.reportingAllowed)
              ? '<option disabled selected value="' +
                esc(links[id]) +
                '">' +
                esc(by.get(links[id])?.name || links[id]) +
                " · retained link; clear to remove</option>"
              : "") +
            "</select></label>",
          (d) => assign(id, d.querySelector("#reportingChoice").value),
        );
      }),
  );
  root.querySelectorAll("[data-ro-person]").forEach(
    (e) =>
      (e.ondragstart = (event) => {
        event.dataTransfer.setData(
          "application/x-gsis-officer",
          e.dataset.roPerson,
        );
        event.dataTransfer.effectAllowed = "move";
      }),
  );
  root.querySelectorAll("[data-ro-drop]").forEach((e) => {
    e.ondragover = (event) => {
      if (
        [...event.dataTransfer.types].includes("application/x-gsis-officer")
      ) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        e.classList.add("ro-drop-active");
      }
    };
    e.ondragleave = () => e.classList.remove("ro-drop-active");
    e.ondrop = (event) => {
      event.preventDefault();
      e.classList.remove("ro-drop-active");
      const id = event.dataTransfer.getData("application/x-gsis-officer");
      if (id && by.has(id)) assign(id, e.dataset.roDrop);
    };
  });
}
