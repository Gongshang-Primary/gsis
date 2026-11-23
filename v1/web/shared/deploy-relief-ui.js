const missingEvidence = {
  ACTIVITY_UNVERIFIED: "Accepted activity status is missing.",
  EO_UNVERIFIED: "Accepted EO evidence is missing.",
  SECTION_UNVERIFIED: "Accepted Primary school section is missing.",
};

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
  title.textContent = `Unavailable relief quotas in this version (${unavailable.length})`;
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

  const reference = window.workloadReference;
  window.workloadReference = function (workload) {
    const stats = reference.call(this, workload);
    const active = workload.rows.filter(row => row.active && row.rules.eligible);
    const diagnostics = quotaDiagnostics(v(), active);
    return diagnostics ? diagnostics.outerHTML + stats : stats;
  };

  const teacherTable = window.workloadTeacherTable;
  window.workloadTeacherTable = function (root, workload, summary = false) {
    const result = teacherTable.call(this, root, workload, summary);
    if (summary) {
      const rows = workload.rows.filter(row => row.active || row.total || row.incomplete);
      const diagnostics = quotaDiagnostics(v(), rows);
      if (diagnostics) root.prepend(diagnostics);
    }
    return result;
  };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
