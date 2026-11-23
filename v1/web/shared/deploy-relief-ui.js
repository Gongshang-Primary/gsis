const missingEvidence = {
  ACTIVITY_UNVERIFIED: "Accepted activity status is missing.",
  EO_UNVERIFIED: "Accepted EO evidence is missing.",
  SECTION_UNVERIFIED: "Accepted Primary school section is missing.",
};

function planningRelief() {
  const doc = v();
  const saved = doc?.planningReliefResults;
  const matches = saved && saved.versionId === doc.id && saved.revision === doc.revision
    && snapshotCache?.id === doc.id && snapshotCache.revision === doc.revision;
  const message = queuedEdits().length || doc?.reliefResults?.pending
    ? "Save changes to update Planning R."
    : !matches || doc.reliefResults?.stale
      ? "Refresh to load Planning R for the saved version."
      : "";
  const teachers = new Map((message ? [] : saved.teachers).map(row => [row.teacherId, row]));
  const quota = id => {
    const value = teachers.get(id)?.R;
    return Number.isFinite(value) ? value : null;
  };
  return {
    message,
    teachers,
    quota,
    average(rows) {
      const values = rows.map(row => quota(row.teacher.id));
      return values.length && values.every(Number.isFinite)
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
    },
  };
}

function planningNotes(rows) {
  const result = planningRelief();
  const notes = document.createElement("section");
  const basis = document.createElement("p");
  basis.className = "hint";
  basis.dataset.planningReliefStatus = "";
  basis.textContent = result.message ||
    "Planning R estimates weekly relief periods from the saved planning version.";
  notes.append(basis);
  if (result.message) return notes;

  const unavailable = rows.filter(row => result.quota(row.teacher.id) === null);
  if (unavailable.length) {
    const details = document.createElement("details");
    const title = document.createElement("summary");
    title.textContent = `Unavailable planning estimates (${unavailable.length})`;
    const reasons = document.createElement("ul");
    for (const { teacher } of unavailable) {
      const item = document.createElement("li");
      const resultRow = result.teachers.get(teacher.id);
      item.textContent = teacher.name + " · " + (resultRow?.reason || "Saved planning inputs are unavailable.");
      reasons.append(item);
    }
    details.append(title, reasons);
    notes.append(details);
  }
  return notes;
}

function quotaDiagnostics(doc, rows) {
  if (!doc || !rows.length) return null;
  const projection = doc.reliefResults;
  const status = projection?.pending
    ? "Save changes to update relief quotas."
    : projection?.stale
      ? "Refresh to update relief quotas."
      : !projection
        ? "Refresh to load relief quotas."
        : "";
  if (status) {
    const note = document.createElement("p");
    note.className = "hint";
    note.dataset.reliefQuotaDiagnostics = "";
    note.textContent = status;
    return note;
  }

  const results = new Map((projection.teachers || []).map(row => [row.teacherId, row]));
  const evidence = new Map(doc.teachers.map(teacher => [teacher.id, teacher.teachingEligibility]));
  const unavailable = rows.filter(row => !Number.isFinite(results.get(row.teacher.id)?.R));
  if (!unavailable.length) return null;

  const details = document.createElement("details");
  details.dataset.reliefQuotaDiagnostics = "";
  const title = document.createElement("summary");
  title.textContent = `Unavailable accepted-evidence relief quotas (${unavailable.length})`;
  const reasons = document.createElement("ul");
  for (const { teacher } of unavailable) {
    const row = results.get(teacher.id);
    const eligibility = evidence.get(teacher.id);
    const missing = eligibility?.state === "unavailable"
      ? (eligibility.reasons || []).map(code => missingEvidence[code]).filter(Boolean).join(" ")
      : "";
    const reason = row?.reason || (row
      ? "Review the calculation in Relief Settings."
      : "Deploy returned no quota for this teacher.");
    const item = document.createElement("li");
    item.textContent = teacher.name + " · " + [missing, reason].filter(Boolean).join(" ");
    reasons.append(item);
  }
  details.append(title, reasons);
  return details;
}

function install() {
  if (typeof window.workloadReference !== "function" || typeof window.workloadTeacherTable !== "function") return;
  window.GSISV1PlanningRelief = planningRelief;

  const reference = window.workloadReference;
  window.workloadReference = function (workload) {
    const stats = reference.call(this, workload);
    const active = workload.rows.filter(row => row.active && row.rules.eligible);
    const diagnostics = quotaDiagnostics(v(), active);
    return planningNotes(active).outerHTML + (diagnostics?.outerHTML || "") + stats;
  };

  const teacherTable = window.workloadTeacherTable;
  window.workloadTeacherTable = function (root, workload, summary = false) {
    const result = teacherTable.call(this, root, workload, summary);
    if (summary) {
      const rows = workload.rows.filter(row => row.active || row.total || row.incomplete);
      const diagnostics = quotaDiagnostics(v(), rows);
      if (diagnostics) root.prepend(diagnostics);
      root.prepend(planningNotes(rows.filter(row => row.active && row.rules.eligible)));
    }
    return result;
  };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
