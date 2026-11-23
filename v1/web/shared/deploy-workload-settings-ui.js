const settingsView = "Workload Settings";
const previewSelector = "[data-workload-settings-view]";

function appendTable(panel, headers, rows) {
  const body = rows.map(
    (row) =>
      "<tr>" +
      row.map((value) => "<td>" + esc(value) + "</td>").join("") +
      "</tr>",
  );
  panel.insertAdjacentHTML("beforeend", table(headers, body));
  const grid = panel.lastElementChild.querySelector("table");
  grid.classList.add("gsis-compact");
  return grid;
}

export function installWorkloadSettingsView(readSubjectRows, canEdit) {
  const openEditor = window.workloadSettings;
  if (typeof openEditor !== "function") return;

  function editSettings(event) {
    const panel = event.currentTarget.closest(previewSelector);
    const host = panel?.closest('#content[data-view="Workload Settings"]');
    if (!host || !canEdit()) return;

    try {
      const editor = openEditor(host);
      editor.returnTab = settingsView;
      panel.remove();
    } catch (error) {
      let message = panel.querySelector('[role="alert"]');
      if (!message) {
        message = document.createElement("p");
        message.setAttribute("role", "alert");
        panel.prepend(message);
      }
      message.textContent = error.message;
    }
  }

  window.workloadSettings = function (host) {
    if (!host) return openEditor.call(this, host);
    const doc = v();
    const panel = document.createElement("section");
    panel.dataset.workloadSettingsView = "";
    if (canEdit()) panel.append(button("Edit", editSettings));

    const activities = GSISWorkload.nonTeachingActivities(doc);
    const heading = document.createElement("h3");
    heading.textContent = "Countable non-teaching activities";
    panel.append(heading);
    if (activities.length) {
      const names = new Map(doc.teachers.map(({ id, name }) => [id, name]));
      appendTable(
        panel,
        ["Activity", "Periods per teacher/week", "Teachers"],
        activities.map(({ code, name, weeklyPeriods, teachers }) => [
          code + " · " + name,
          wlNumber(weeklyPeriods),
          teachers.map((id) => names.get(id) || id).join(", "),
        ]),
      );
    } else {
      const empty = document.createElement("p");
      empty.textContent =
        "No countable non-teaching activities are configured for this version.";
      panel.append(empty);
    }

    const subjects = appendTable(
      panel,
      ["Subject", "Category", "Specialist subject", "Demand basis"],
      readSubjectRows(doc).map(([code, category, specialist, demand]) => [
        subjectLabel(code),
        category,
        specialist ? "Yes" : "No",
        demand === "groups"
          ? "Defined subject TGs"
          : "Form classes + extra TGs",
      ]),
    );
    subjects.dataset.workloadSettingsSubjects = "";
    host.append(panel);
  };
}
