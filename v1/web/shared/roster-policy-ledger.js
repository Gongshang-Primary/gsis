const api = window.GSISV1,
  labels = {
    dailyCapacity: "Daily capacity",
    alternatives: "Fewer alternative relief periods",
    weeklyRemaining: "More weekly R remaining",
    rotation: "Rotation order",
    subjectMatch: "Same teaching subject",
    levelMatch: "Same teaching level",
  };
const panel = document.createElement("details");
panel.className = "gsis-panel";
panel.innerHTML =
  '<summary>Allocation layers and duties done</summary><nav class="gsis-actions"><button data-view="policy">Allocation rules</button><button data-view="ledger">Duties done</button></nav><p data-status role="status"></p><section data-policy><h2>Allocation layers</h2><p>Layers run in order. Enabled limits all apply together. Preference order ranks eligible teachers; moving a limit does not relax it. Daily capacity compares occupied periods first, then usable relief capacity. BLK still occupies a period while breaking a consecutive run.</p><div data-layer-list></div><div class="gsis-actions"><button data-add>Add layer</button><button data-reload>Reload saved rules</button><button data-save class="primary">Save rules</button></div><div data-global></div></section><section data-ledger hidden><h2>Relief duties done</h2><form data-range class="gsis-formrow"><label>Range<select data-range-mode><option value="ytd">Year to date</option><option value="year">Full calendar year</option><option value="custom">Custom range</option></select></label><label>Year<input data-year type="number" min="2000" max="2100"></label><label>From<input data-from type="date" required></label><label>To<input data-to type="date" required></label><button>Show duties</button><button type="button" data-csv>Export CSV</button><button type="button" data-print>Print</button></form><p>Published duties count as assumed completed after their frozen end time unless an explicit correction says otherwise. Distinct periods and chargeable R are shown separately.</p><div data-totals></div><div class="gsis-scroll" data-duties></div></section>';
document.body.append(panel);
let saved = null,
  draft = null,
  request = null,
  report = null;
const status = (message, error = false) => {
  const e = panel.querySelector("[data-status]");
  e.textContent = message;
  e.classList.toggle("gsis-error", error);
};
const el = (tag, text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};
function render() {
  const list = panel.querySelector("[data-layer-list]");
  list.replaceChildren();
  if (!draft) return;
  draft.layers.forEach((layer, index) => {
    const card = el("section");
    card.className = "gsis-panel";
    const heading = el("h3", "Layer " + (index + 1));
    const resolved = el(
      "p",
      (saved?.resolvedTeachers || [])
        .filter((t) => t.layerId === layer.id)
        .map((t) => t.name + " · " + t.staffId)
        .join(", ") || "No current teachers resolve to this layer.",
    );
    resolved.className = "gsis-hint";
    card.append(
      el(
        "p",
        "Saved membership as of " + (saved?.date || "current school date"),
      ),
      resolved,
    );
    const controls = el("div");
    controls.className = "gsis-formrow";
    const groups = el("label", "Groups in this layer");
    const chips = el("div");
    for (const group of layer.groups) {
      const chip = el("span", group + " "),
        destination = el("select");
      destination.setAttribute("aria-label", "Move " + group + " to layer");
      draft.layers.forEach((_, i) =>
        destination.append(new Option("Layer " + (i + 1), String(i))),
      );
      destination.value = String(index);
      destination.onchange = () => {
        layer.groups = layer.groups.filter((x) => x !== group);
        draft.layers[Number(destination.value)].groups.push(group);
        request = null;
        render();
      };
      chip.append(destination);
      chips.append(chip);
    }
    groups.append(chips);
    controls.append(groups);
    const addGroup = el("input");
    addGroup.placeholder = "Explicit group code";
    addGroup.setAttribute("aria-label", "Add a group to layer " + (index + 1));
    const add = el("button", "Add group");
    add.onclick = () => {
      const value = addGroup.value.trim();
      if (!value) return;
      if (draft.layers.some((l) => l.groups.includes(value))) {
        status("This group already belongs to a layer.", true);
        return;
      }
      layer.groups.push(value);
      request = null;
      render();
    };
    controls.append(addGroup, add);
    const spiral = el("label", "Spiral rounds");
    const toggle = el("input");
    toggle.type = "checkbox";
    toggle.checked = layer.spiral;
    toggle.onchange = () => {
      layer.spiral = toggle.checked;
      request = null;
    };
    spiral.append(toggle);
    controls.append(spiral);
    card.append(heading, controls);
    const limits = el("div");
    limits.className = "gsis-formrow";
    for (const [key, label] of [
      ["maxTotal", "Maximum occupied periods"],
      ["maxRelief", "Maximum relief periods"],
      ["maxConsecutive", "Maximum consecutive periods"],
    ]) {
      const field = el("label", label),
        enabled = el("input");
      enabled.type = "checkbox";
      enabled.checked = layer[key] !== null;
      const value = el("input");
      value.type = "number";
      value.min = "1";
      value.max = "40";
      value.value = layer[key] ?? "";
      value.disabled = !enabled.checked;
      enabled.onchange = () => {
        value.disabled = !enabled.checked;
        layer[key] = enabled.checked
          ? Number(value.value) ||
            { maxTotal: 8, maxRelief: 3, maxConsecutive: 5 }[key]
          : null;
        request = null;
      };
      value.onchange = () => {
        layer[key] = Number(value.value);
        request = null;
      };
      field.append(enabled, value);
      limits.append(field);
    }
    for (const subject of ["PAL", "FORM"]) {
      const field = el("label", subject + " continuous block"),
        input = el("input");
      input.type = "number";
      input.min = "1";
      input.max = "40";
      input.value = layer.continuity[subject] ?? 1;
      input.onchange = () => {
        layer.continuity[subject] = Number(input.value);
        request = null;
      };
      field.append(input);
      limits.append(field);
    }
    card.append(limits);
    const order = el("ol");
    layer.preferences.forEach((key, i) => {
      const row = el("li");
      row.draggable = true;
      row.dataset.preference = key;
      row.append(el("span", labels[key] || key));
      const up = el("button", "↑"),
        down = el("button", "↓");
      up.setAttribute("aria-label", "Move " + labels[key] + " up");
      down.setAttribute("aria-label", "Move " + labels[key] + " down");
      up.disabled = i === 0;
      down.disabled = i === layer.preferences.length - 1;
      function move(to) {
        layer.preferences.splice(i, 1);
        layer.preferences.splice(to, 0, key);
        request = null;
        render();
      }
      up.onclick = () => move(i - 1);
      down.onclick = () => move(i + 1);
      row.ondragstart = (event) =>
        event.dataTransfer.setData("text/plain", index + ":" + key);
      row.ondragover = (event) => event.preventDefault();
      row.ondrop = (event) => {
        event.preventDefault();
        const [owner, source] = event.dataTransfer
          .getData("text/plain")
          .split(":");
        if (Number(owner) !== index) return;
        const at = layer.preferences.indexOf(source);
        if (at < 0) return;
        layer.preferences.splice(at, 1);
        layer.preferences.splice(i, 0, source);
        request = null;
        render();
      };
      row.append(up, down);
      order.append(row);
    });
    card.append(el("h4", "Preference order"), order);
    const remove = el("button", "Remove empty layer");
    remove.disabled = layer.groups.length > 0 || draft.layers.length === 1;
    remove.onclick = () => {
      draft.layers.splice(index, 1);
      draft.layers.forEach((l, i) => (l.id = i + 1));
      request = null;
      render();
    };
    card.append(remove);
    list.append(card);
  });
  const globals = panel.querySelector("[data-global]");
  globals.replaceChildren();
  for (const [key, label] of [
    ["noReliefSubjects", "No-relief subjects"],
    ["consecutiveBreakSubjects", "Consecutive-count breaks"],
    ["sharedCoverSubjects", "Shared lesson cover subjects"],
  ]) {
    const field = el("label", label + " · one per line, * wildcard supported"),
      input = el("textarea");
    input.rows = 3;
    input.value = draft[key]
      .map((x) => (typeof x === "string" ? x : x.value))
      .join("\n");
    input.readOnly = true;
    field.append(input);
    field.append(
      el("small", "Read-only here. Change this shared rule in System Config."),
    );
    globals.append(field);
  }
  panel.querySelector("[data-add]").disabled = draft.layers.length >= 9;
}
async function load() {
  saved = await api.request("roster", "/layers");
  draft = structuredClone(saved.policy);
  request = null;
  render();
  status("Saved allocation policy revision " + saved.revision);
}
panel.querySelector("[data-reload]").onclick = () =>
  load().catch((e) => status(e.message, true));
panel.querySelector("[data-add]").onclick = () => {
  if (!draft || draft.layers.length >= 9) return;
  draft.layers.push({
    id: draft.layers.length + 1,
    groups: [],
    spiral: false,
    maxTotal: 8,
    maxRelief: 3,
    maxConsecutive: 5,
    continuity: { PAL: 3, FORM: 2 },
    preferences: Object.keys(labels),
  });
  request = null;
  render();
};
panel.querySelector("[data-save]").onclick = async () => {
  if (!draft) return;
  const button = panel.querySelector("[data-save]");
  button.disabled = true;
  try {
    request ??= {
      operationId: crypto.randomUUID(),
      revision: saved.revision,
      policy: { ...draft, version: "policy-" + crypto.randomUUID() },
    };
    const result = await api.request("roster", "/layers", {
      method: "POST",
      body: request,
    });
    if (result.receipt?.state !== "committed" && result.state !== "committed")
      throw Error(
        "Save outcome is not yet confirmed. Retain this operation for recovery.",
      );
    await load();
    status(
      "Allocation policy saved. Running proposals must revalidate this revision.",
    );
  } catch (e) {
    status(e.message, true);
  } finally {
    button.disabled = false;
  }
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
panel.querySelector("[data-year]").value = today().slice(0, 4);
function setRange() {
  const mode = panel.querySelector("[data-range-mode]").value,
    year = panel.querySelector("[data-year]").value;
  if (mode === "ytd") {
    panel.querySelector("[data-from]").value = today().slice(0, 4) + "-01-01";
    panel.querySelector("[data-to]").value = today();
  } else if (mode === "year") {
    panel.querySelector("[data-from]").value = year + "-01-01";
    panel.querySelector("[data-to]").value = year + "-12-31";
  }
}
setRange();
panel.querySelector("[data-range-mode]").onchange = setRange;
panel.querySelector("[data-year]").onchange = setRange;
function filters() {
  return new URLSearchParams({
    from: panel.querySelector("[data-from]").value,
    to: panel.querySelector("[data-to]").value,
  });
}
function table(rows, columns) {
  const t = el("table"),
    head = el("tr");
  for (const [key, label] of columns) head.append(el("th", label));
  t.append(head);
  for (const row of rows) {
    const tr = el("tr");
    for (const [key] of columns) tr.append(el("td", row[key] ?? ""));
    t.append(tr);
  }
  return t;
}
async function ledger() {
  report = await api.request("roster", "/duties?" + filters());
  panel.querySelector("[data-totals]").replaceChildren(
    table(report.totals || [], [
      ["staffId", "Staff ID"],
      ["periods", "Duty periods"],
      ["charge", "Chargeable R"],
    ]),
  );
  panel.querySelector("[data-duties]").replaceChildren(
    table(report.duties || [], [
      ["date", "Date"],
      ["staffId", "Staff ID"],
      ["period", "Period"],
      ["basis", "Completion basis"],
      ["charge", "Chargeable R"],
      ["reason", "Correction reason"],
      ["dutyId", "Duty ID"],
    ]),
  );
  status(
    "Inclusive range " +
      report.from +
      " to " +
      report.to +
      ". Opening balances remain separate from period history.",
  );
}
panel.querySelector("[data-range]").onsubmit = (event) => {
  event.preventDefault();
  void ledger().catch((e) => status(e.message, true));
};
panel.querySelector("[data-csv]").onclick = async () => {
  try {
    const response = await api.fetch("/api/roster/duties/export?" + filters());
    if (!response.ok) throw Error("Duties export could not be verified.");
    const url = URL.createObjectURL(await response.blob()),
      link = el("a");
    link.href = url;
    link.download =
      "Duties-" +
      panel.querySelector("[data-from]").value +
      "-" +
      panel.querySelector("[data-to]").value +
      ".csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    status(e.message, true);
  }
};
panel.querySelector("[data-print]").onclick = () => {
  if (!report) {
    status("Load the duties report before printing.", true);
    return;
  }
  window.print();
};
panel.querySelectorAll("[data-view]").forEach(
  (button) =>
    (button.onclick = () => {
      panel.querySelector("[data-policy]").hidden =
        button.dataset.view !== "policy";
      panel.querySelector("[data-ledger]").hidden =
        button.dataset.view !== "ledger";
      if (button.dataset.view === "ledger")
        void ledger().catch((e) => status(e.message, true));
    }),
);
try {
  const session = await api.getSession();
  if (!session || !(api.capable("roster.own") || api.capable("roster.read")))
    panel.hidden = true;
  else {
    const canReadPolicy = api.capable("roster.read");
    panel.querySelector("[data-view=policy]").hidden = !canReadPolicy;
    panel.querySelector("[data-save]").hidden = !api.capable("roster.admin");
    panel.querySelector("[data-add]").hidden = !api.capable("roster.admin");
    if (canReadPolicy) {
      await load();
      if (!api.capable("roster.admin"))
        panel
          .querySelectorAll(
            "[data-policy] input,[data-policy] select,[data-layer-list] button",
          )
          .forEach((node) => (node.disabled = true));
    } else {
      panel.querySelector("summary").textContent = "Relief duties done";
      panel.querySelector("[data-policy]").hidden = true;
      panel.querySelector("[data-ledger]").hidden = false;
    }
  }
} catch (e) {
  status(e.message, true);
}
