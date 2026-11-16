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
    const originalKey = window.queueKey;
    window.queueKey = (edit) => edit.operation === "setTeacherMemberships"
      ? "memberships:" + edit.teacher : originalKey(edit);
    const originalProject = window.projectEditBase;
    window.projectEditBase = (doc, edit) => {
      if (edit.operation !== "setTeacherMemberships") return originalProject(doc, edit);
      const teacher = doc.teachers.find((t) => t.id === edit.teacher);
      if (!teacher) throw Error("This teacher is no longer in the selected version.");
      teacher.deploymentTags ??= {};
      teacher.deploymentTags.Memberships = [...edit.value];
      teacher.groups = [...edit.value];
    };
    const originalDisplay = window.draftDisplayValue;
    window.draftDisplayValue = (doc, edit) => edit.operation === "setTeacherMemberships"
      ? valueOf(doc, edit.teacher) : originalDisplay(doc, edit);
    const originalStatus = window.drawQueueStatus;
    window.drawQueueStatus = () => {
      originalStatus();
      if (document.getElementById("content")?.dataset.view === "Membership" && api.capable("deploy.edit"))
        document.getElementById("saveQueue").hidden = false;
    };
    window.membershipPage = (root) => {
      const doc = v();
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = "Memberships belong to this planning version. Enter one label per line; save the draft, then publish to update Contacts. These labels do not grant access.";
      const table = document.createElement("table");
      table.dataset.contactsReference = "";
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
        const cell = row.insertCell(), value = valueOf(doc, teacher.id);
        if (!api.capable("deploy.edit")) {
          cell.textContent = value === null ? "Not recorded" : value.join("\n");
          continue;
        }
        const input = document.createElement("textarea");
        input.rows = Math.max(2, Math.min(5, value?.length || 2));
        input.style.cssText = "min-width:15rem;width:100%;box-sizing:border-box";
        input.value = value?.join("\n") || "";
        input.placeholder = value === null ? "Not recorded" : "No memberships";
        input.setAttribute("aria-label", "Memberships for " + (teacher.ttbName || teacher.name));
        const error = document.createElement("span");
        error.className = "error"; error.setAttribute("role", "status");
        function queue(next, explicit = false) {
          if (!api.capable("deploy.edit")) return;
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
        clear.type = "button"; clear.textContent = "Clear memberships";
        clear.setAttribute("aria-label", "Clear memberships for " + (teacher.ttbName || teacher.name));
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
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
