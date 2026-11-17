import { parseLoad, planningView, loadRows, fortnightRows, legacyFormUsed } from "./deploy-loads.mjs";

// Keep the existing Deploy queue and raw snapshot as the write authority.
// These adapters only derive the displayed/calculated view of period inputs.
function install() {
  if (typeof window.settings !== "function" || !window.GSISWorkload) return;
  const derived = new WeakSet();
  const view = doc => {
    if (!doc || derived.has(doc)) return doc;
    const result = planningView(doc);
    derived.add(result);
    return result;
  };
  function project(owner, name) {
    const original = owner?.[name];
    if (typeof original !== "function") return;
    owner[name] = function (doc, ...args) { return original.call(this, view(doc), ...args); };
  }
  for (const name of ["analyse", "subjects", "subjectTypeSubjects", "isFormSubject"])
    project(window.GSISWorkload, name);
  for (const name of ["preview", "buildAscExport"]) project(window.GSISAscExport, name);
  const originalSubjects = window.subjects;
  window.subjects = function (...args) {
    const subjects = originalSubjects.apply(this, args);
    return legacyFormUsed(v()) ? subjects : subjects.filter(subject => subject.toUpperCase() !== "FORM");
  };

  window.settings = root => {
    const doc = v(), rows = loadRows(doc), shown = view(doc);
    const subjects = [...new Set(rows.map(([, subject]) => subject))];
    const components = ["Assembly", "FTGP", "FTT"];
    const columns = [...components, "FT", ...subjects.filter(subject => !components.includes(subject)), "PD"];
    const meaningfulLegacyForm = Object.values(doc.loads || {}).some(row => Object.entries(row).some(([subject, value]) => {
      if (subject.trim().toUpperCase() !== "FORM") return false;
      try { const parsed = parseLoad(value); return parsed !== null && parsed !== 0; }
      catch { return true; }
    }));
    if (legacyFormUsed(doc)) columns.push("FORM");
    const editable = kp() || admin();
    const values = new Map(rows.map(([level, subject, value]) => [JSON.stringify([level, subject]), value]));
    const display = value => value === null || value === undefined ? "n/a" : String(value);
    const total = level => loadValue(shown, level, "FT");
    root.innerHTML = '<p class="hint">FORM = Assembly + FTGP + FTT. PD is reference only: each PLT membership supplies 2 periods. Type n/a for not offered, or 0 for offered with zero periods. Save to online confirms your draft. Tab or Enter moves between cells; Escape restores the starting value.</p>';
    if (meaningfulLegacyForm || legacyFormUsed(doc)) root.insertAdjacentHTML("beforeend",
      '<p class="warning-text" data-legacy-form-notice>Standalone legacy FORM values and references are retained unchanged. They are separate from the calculated FORM total and need review before any conversion.</p>');
    root.insertAdjacentHTML("beforeend", table(["Level", ...columns], Object.keys(doc.loads || {})
      .filter(lev => !level || lev === level).map(lev => '<tr><td>P' + esc(lev) + '</td>' + columns.map(subject => {
        if (subject === "FT") return '<td class="load-cell ft-component"><strong data-load-total-level="' + esc(lev) + '" title="Calculated FORM load">' + esc(total(lev)) + '</strong></td>';
        if (subject === "PD") return '<td class="load-cell ft-component"><span data-load-reference="PD" title="Reference: 2 periods per PLT">2</span></td>';
        if (subject === "FORM") return '<td class="load-cell"><span data-load-reference="FORM">' + esc(display(doc.loads[lev].FORM)) + '</span></td>';
        const value = values.get(JSON.stringify([lev, subject]));
        return '<td class="load-cell ' + (components.includes(subject) ? 'ft-component' : '') + '"><input aria-label="P' + esc(lev) + ' ' + esc(subject) + ' periods" type="text" autocomplete="off" spellcheck="false" value="' + esc(display(value)) + '" data-level="' + esc(lev) + '" data-key="' + esc(subject) + '" placeholder="(n/a)" ' + (editable && !queueFlight ? '' : 'disabled') + '></td>';
      }).join('') + '</tr>')));
    root.querySelector("table").classList.add("load-table");
    const refreshTotals = () => {
      const current = view(v());
      for (const cell of root.querySelectorAll("[data-load-total-level]"))
        cell.textContent = loadValue(current, cell.dataset.loadTotalLevel, "FT");
    };
    for (const input of root.querySelectorAll(".load-cell input")) {
      let previous = input.value, start = input.value;
      const invalid = message => {
        input.setCustomValidity(message);
        input.toggleAttribute("data-invalid-load", !!message);
        input.classList.toggle("dirty", !!message);
        unsavedDraft = !!root.querySelector("[data-invalid-load]");
      };
      const finish = () => {
        if (input.value === previous) { invalid(""); return true; }
        let value;
        try { value = parseLoad(input.value); }
        catch (error) { invalid(error.message); return false; }
        const row = v().loads[input.dataset.level];
        const expected = Object.hasOwn(row, input.dataset.key) ? row[input.dataset.key] : null;
        try { queueCell({ operation: "setLoad", level: input.dataset.level, subject: input.dataset.key, value, expected }); }
        catch (error) { invalid(error.message); return false; }
        previous = input.value;
        invalid(""); input.classList.add("pending"); refreshTotals();
        return true;
      };
      input.onfocus = () => { start = input.value; };
      input.oninput = finish;
      input.onblur = () => { if (!finish()) input.reportValidity(); };
      input.onkeydown = event => {
        if (event.key === "Escape") {
          event.preventDefault(); input.value = start; finish(); input.blur();
        } else if (event.key === "Enter") {
          event.preventDefault();
          if (finish()) {
            const inputs = [...root.querySelectorAll(".load-cell input")];
            inputs[inputs.indexOf(input) + 1]?.focus();
          }
        } else if (event.key === "Tab" && !finish()) event.preventDefault();
      };
    }
    root.append(button("Add subject", () => {
      const subject = prompt("New subject code"); if (subject) action("addSubject", { subject });
    }, !editable), button("Add level", () => {
      const lev = prompt("New level number"); if (lev) action("addLevel", { level: lev });
    }, !editable));
  };

  const originalFortnight = window.fortnightPage;
  window.fortnightPage = root => {
    originalFortnight(root);
    const allowed = new Set(fortnightRows(v(), window.GSISWorkload).map(row => row.key));
    for (const row of root.querySelectorAll(".fortnight-table tbody tr"))
      if (!allowed.has(row.querySelector("[data-fortnight-toggle]")?.dataset.fortnightToggle)) row.remove();
  };
  // FT is also a fortnight field code. Only subject-bearing screens use the
  // FORM presentation alias; dialogs and field-preview tables keep their labels.
  const subjectViews = new Set(["Load Settings", "IP Deploy", "Workload", "Stats", "Ledger"]);
  const relabel = () => {
    if (!subjectViews.has(tab)) return;
    for (const head of document.querySelectorAll("#content table thead th")) {
      if (head.closest("dialog,.inline-editor,.gsis-import-preview")) continue;
      const nodes = document.createTreeWalker(head, NodeFilter.SHOW_TEXT);
      while (nodes.nextNode()) {
        const node = nodes.currentNode;
        const label = node.nodeValue.trim();
        if (/^FT(?:\s*[↑↓↕▾▴])?\s*$/.test(label)) {
          head.dataset.loadSubjectLabel = "FT";
          node.nodeValue = node.nodeValue.replace("FT", "FORM");
        } else if (/^FORM(?:\s*[↑↓↕▾▴])?\s*$/.test(label) && head.dataset.loadSubjectLabel !== "FT") {
          head.dataset.loadSubjectLabel = "FORM";
          node.nodeValue = node.nodeValue.replace("FORM", "Legacy FORM");
        }
      }
    }
  };
  new MutationObserver(relabel).observe(document.getElementById("content"), { childList: true, subtree: true });
  relabel();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
