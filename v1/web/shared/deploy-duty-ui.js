// A view of the original duty occurrences, never a replacement saved duty list.
function recessGroups(recess) {
  const groups = [];
  const ids = new Set();
  for (const [index, duty] of recess.entries()) {
    if (
      !duty.id ||
      ids.has(duty.id) ||
      typeof duty.name !== "string" ||
      !Array.isArray(duty.days) ||
      duty.days.some((day) => !Number.isInteger(day) || day < 0 || day > 4) ||
      new Set(duty.days).size !== duty.days.length
    )
      return null;
    ids.add(duty.id);
    // Same-day names may represent separate duties. Give each such occurrence
    // its own lane; an unscheduled definition also retains a visible column.
    let group =
      duty.days.length &&
      groups.find(
        (candidate) =>
          candidate.name === duty.name &&
          candidate.days.size &&
          duty.days.every((day) => !candidate.days.has(day)),
      );
    if (!group) {
      group = { name: duty.name, indices: [], days: new Set() };
      groups.push(group);
    }
    group.indices.push(index);
    duty.days.forEach((day) => group.days.add(day));
  }
  return groups;
}

function occurrenceTime(duty) {
  return `${duty.start.replace(":", "")}–${duty.end.replace(":", "")}`;
}

function appendTime(cell, text) {
  const label = cell.ownerDocument.createElement("small");
  label.className = "duty-occurrence-time";
  label.style.display = "block";
  label.style.fontSize = "0.85em";
  label.textContent = text;
  cell.append(label);
}

function replaceCells(original, replacements) {
  original[0].before(...replacements);
  original.forEach((cell) => cell.remove());
}

export function projectDutyPrintHTML(html, duties) {
  if (!Array.isArray(duties)) return html;
  const recess = duties.filter((duty) => duty.category === "Recess");
  const groups = recessGroups(recess);
  if (!groups || groups.length === recess.length) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("main.page > table");
  const headers = [...(table?.tHead?.rows || [])];
  const columns = [...(table?.querySelector("colgroup")?.children || [])];
  const dayRows = [...(table?.querySelectorAll("tbody tr.day-start") || [])];
  // Preserve the unmodified native view if its structure changes. Never guess
  // at a cell's owner or drop an occurrence because a layout is unfamiliar.
  if (
    headers.length !== 4 ||
    columns.length !== recess.length + 7 ||
    dayRows.length !== 5
  )
    return html;
  const headerCells = headers.map((row) =>
    [...row.cells].slice(2, 2 + recess.length),
  );
  if (
    headers.some((row) => row.cells.length !== recess.length + 4) ||
    headerCells[0].some((cell) => cell.textContent !== "RECESS")
  )
    return html;
  const dayCells = dayRows.map((row, day) => {
    let position = 0;
    const cells = [];
    for (const cell of row.cells) {
      if (position >= 3 && position < 3 + recess.length) cells.push(cell);
      position += cell.colSpan;
    }
    if (
      position !== recess.length + 7 ||
      cells.length !== recess.length ||
      cells.some(
        (cell, index) =>
          cell.colSpan !== 1 ||
          (recess[index].days.includes(day)
            ? cell.dataset.dutyCell !== recess[index].id ||
              cell.dataset.day !== String(day)
            : cell.hasAttribute("data-duty-cell")),
      )
    )
      return null;
    return cells;
  });
  if (dayCells.some((cells) => !cells)) return html;

  const variedTimes = groups.map(
    (group) =>
      new Set(group.indices.map((index) => occurrenceTime(recess[index])))
        .size > 1,
  );
  replaceCells(
    columns.slice(3, 3 + recess.length),
    groups.map(() => {
      const column = columns[3].cloneNode(true);
      column.style.width = `${46 / groups.length}%`;
      return column;
    }),
  );
  headerCells.forEach((cells, row) =>
    replaceCells(
      cells,
      groups.map((group, index) => {
        const cell = cells[group.indices[0]].cloneNode(true);
        if (row === 2 && variedTimes[index]) cell.textContent = "Varies by day";
        // Retain the native printed-period convention over the visible columns.
        if (row === 3) cell.textContent = `pd ${index + 3}`;
        return cell;
      }),
    ),
  );
  dayCells.forEach((cells, day) =>
    replaceCells(
      cells,
      groups.map((group, index) => {
        const source = group.indices.find((i) => recess[i].days.includes(day));
        const cell = cells[source ?? group.indices[0]].cloneNode(true);
        if (source === undefined) {
          cell.textContent = "";
          cell.className = "not-scheduled";
          cell.removeAttribute("data-duty-cell");
          cell.removeAttribute("data-day");
        } else if (variedTimes[index]) {
          cell.dataset.dutyOccurrenceTime = occurrenceTime(recess[source]);
          appendTime(cell, cell.dataset.dutyOccurrenceTime);
        }
        return cell;
      }),
    ),
  );
  table.dataset.dutyProjection = "weekdays";
  return "<!doctype html>" + doc.documentElement.outerHTML;
}

export function installDutyProjection(getDuties) {
  const originalPrint = window.dutyPrintHTML;
  const originalPage = window.dutyPage;
  if (
    typeof getDuties !== "function" ||
    typeof originalPrint !== "function" ||
    typeof originalPage !== "function" ||
    originalPrint.weekdayProjection
  )
    return;
  const print = function (...args) {
    return projectDutyPrintHTML(originalPrint.apply(this, args), getDuties());
  };
  print.weekdayProjection = true;
  window.dutyPrintHTML = print;
  window.dutyPage = function (root, ...args) {
    const result = originalPage.call(this, root, ...args);
    // The native page deliberately replaces printed cell contents with its
    // existing select and event handler. Restore only the timing annotation.
    root
      .querySelectorAll(".duty-entry-roster [data-duty-occurrence-time]")
      .forEach((cell) => {
        if (!cell.querySelector(".duty-occurrence-time"))
          appendTime(cell, cell.dataset.dutyOccurrenceTime);
      });
    return result;
  };
}
