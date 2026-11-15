import { encodeWorkbook, decodeWorkbook, download } from "./workbooks.mjs";
const api = window.GSISV1;
const panel = document.createElement("details");
panel.className = "gsis-panel";
panel.innerHTML =
  '<summary>Layout-owned data</summary><p>Local teacher labels, pupil evidence, programmes and notes belong to Layout. They do not change Deploy teaching assignments or Venues room records.</p><div class="gsis-formrow"><label>Year<input data-year type="number" min="2000" max="2100"></label><label>Table<select data-table><option value="groups">Teaching groups</option><option value="venues">Venue annotations</option><option value="classes">Class annotations</option><option value="allocations">Local allocations</option><option value="pupilBreakdown">Pupil evidence</option></select></label><button data-load>Load</button></div><p data-status role="status"></p><div class="gsis-scroll" data-rows></div>';
document.body.append(panel);
panel.querySelector("[data-year]").value =
  new URLSearchParams(location.search).get("year") || new Date().getFullYear();
let snapshot = null, preview = null, importRequest = null, readEpoch = 0, securityEpoch = 0,
  importBusy = false, unresolved = false, recoveryKey = '';
const dialog = document.createElement('dialog');
dialog.className = 'gsis-import-preview';
dialog.setAttribute('aria-label', 'Import Layout workbook');
dialog.innerHTML = '<h2>Import Layout workbook</h2><p>Use the complete Export All workbook for this school and year. Only Layout-owned fields can change. Replace a corrected file here; nothing applies until you confirm the server preview.</p><label>Canonical Layout workbook<input data-import type="file" accept=".xlsx"></label><p data-import-status role="status"></p><div data-preview></div><div class="gsis-actions"><button data-import-confirm disabled>Confirm Layout import</button><button data-import-receipt hidden>Check original import receipt</button><button data-import-close>Close</button></div>';
panel.append(dialog);
const importFile = dialog.querySelector('[data-import]'),
  importConfirm = dialog.querySelector('[data-import-confirm]'),
  importReceipt = dialog.querySelector('[data-import-receipt]'),
  importHost = dialog.querySelector('[data-preview]');
const importMessage = (value, error = false) => {
  const status = dialog.querySelector('[data-import-status]');
  status.textContent = value;
  status.classList.toggle('gsis-error', error);
};
dialog.querySelector('[data-import-close]').onclick = () => dialog.close();
const setup = document.createElement("details");
setup.innerHTML =
  '<summary>Initial source setup</summary><p>Use a validated Layout snapshot only for a year with no existing snapshot. Published Deploy adoption remains the assignment source.</p><label>Source snapshot JSON<input data-initial-source type="file" accept=".json,application/json"></label><div data-initial-preview></div>';
panel.append(setup);
setup.querySelector("[data-initial-source]").onchange = async (event) => {
  const host = setup.querySelector("[data-initial-preview]");
  host.replaceChildren();
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024)
      throw Error("Choose a source snapshot smaller than 8 MiB.");
    const source = JSON.parse(await file.text());
    if (source.year !== year())
      throw Error("The source year differs from the selected year.");
    const preview = document.createElement("p");
    preview.textContent = [
      "venues",
      "classes",
      "groups",
      "allocations",
      "pupilBreakdown",
    ]
      .map(
        (key) =>
          key +
          ": " +
          (Array.isArray(source[key]) ? source[key].length : "invalid"),
      )
      .join(" · ");
    const confirm = document.createElement("button");
    confirm.textContent = "Confirm initial source import";
    const body = {
      operationId: crypto.randomUUID(),
      year: year(),
      revision: 0,
      snapshot: source,
    };
    confirm.onclick = async () => {
      confirm.disabled = true;
      try {
        const result = await api.request("layout", "/snapshot/import", {
          method: "POST",
          body,
        });
        if (
          result.receipt?.state !== "committed" &&
          result.state !== "committed"
        )
          throw Error(
            "Initial import is not yet confirmed. Retry the same operation.",
          );
        host.replaceChildren();
        await load();
        message(
          "Initial Layout source committed. Refresh the campus view to display it.",
        );
      } catch (error) {
        message(error.message, true);
        confirm.disabled = false;
      }
    };
    host.append(preview, confirm);
  } catch (error) {
    message(error.message, true);
  }
};
const editable = {
  groups: [
    "teacherLabels",
    "pupilCount",
    "pupilCountText",
    "programmes",
    "active",
    "notes",
  ],
  venues: ["active"],
  classes: ["active"],
  allocations: ["active"],
  pupilBreakdown: [],
};
const message = (value, error = false) => {
  const e = panel.querySelector("[data-status]");
  e.textContent = value;
  e.classList.toggle("gsis-error", error);
};
const year = () => Number(panel.querySelector("[data-year]").value);
function render() {
  const host = panel.querySelector("[data-rows]");
  // The shared viewport can promote this persistent host to .table-window,
  // placing its toolbar immediately outside the replaced table children.
  if (host.previousElementSibling?.classList.contains('gsis-core-tools'))
    host.previousElementSibling.remove();
  host.replaceChildren();
  if (!snapshot) return;
  const tableName = panel.querySelector("[data-table]").value,
    rows = snapshot.rows?.[tableName] || [],
    columns = [...new Set(rows.flatMap(Object.keys))];
  const table = document.createElement("table"),
    head = table.createTHead().insertRow(),
    body = table.createTBody();
  table.dataset.layoutOwned = tableName;
  for (const field of columns) {
    const th = document.createElement("th");
    th.textContent = field;
    head.append(th);
  }
  const action = document.createElement("th");
  action.textContent = "Save";
  head.append(action);
  for (const row of rows) {
    const tr = document.createElement("tr"),
      inputs = new Map();
    for (const field of columns) {
      const td = document.createElement("td");
      if (
        (
          snapshot.editableFields?.[tableName] ||
          editable[tableName] ||
          []
        ).includes(field)
      ) {
        const input = document.createElement("input");
        input.value = row[field] ?? "";
        input.setAttribute(
          "aria-label",
          (row.id || row.code || row.unitNumber || "record") + " " + field,
        );
        td.append(input);
        inputs.set(field, input);
      } else
        td.textContent =
          typeof row[field] === "object"
            ? JSON.stringify(row[field])
            : String(row[field] ?? "");
      tr.append(td);
    }
    const td = document.createElement("td"),
      save = document.createElement("button");
    save.textContent = "Save";
    let request = null;
    save.onclick = async () => {
      save.disabled = true;
      try {
        const changes = Object.fromEntries(
          [...inputs]
            .filter(
              ([field, input]) => String(row[field] ?? "") !== input.value,
            )
            .map(([field, input]) => [
              field,
              field === "pupilCount"
                ? input.value === ""
                  ? null
                  : Number(input.value)
                : input.value,
            ]),
        );
        request ??= {
          operationId: crypto.randomUUID(),
          revision: snapshot.revision,
          year: year(),
          table: tableName,
          id: row.id || row.code || row.unitNumber,
          changes,
        };
        const result = await api.request("layout", "/owned-data", {
          method: "POST",
          body: request,
        });
        if (
          result.receipt?.state !== "committed" &&
          result.state !== "committed" &&
          result.saved !== true
        )
          throw Error(
            "The save is not confirmed. Check the original operation before retrying.",
          );
        message(
          "Local Layout data saved. Published assignments are unchanged.",
        );
        await load();
      } catch (error) {
        message(
          error.message + " Your edit and original request are retained.",
          true,
        );
        save.textContent = "Retry same save";
      } finally {
        save.disabled = false;
      }
    };
    td.append(save);
    tr.append(td);
    body.append(tr);
  }
  host.append(table);
}
async function load() {
  const ticket = securityEpoch;
  const loaded = await api.request("layout", "/owned-data?year=" + year());
  if (ticket !== securityEpoch) return;
  snapshot = loaded;
  render();
  message("Layout " + year() + " revision " + snapshot.revision);
}
panel.querySelector("[data-load]").onclick = () =>
  load().catch((e) => message(e.message, true));
panel.querySelector("[data-table]").onchange = render;
async function exportAll() {
  const ticket = securityEpoch;
  try {
    const selectedYear = year();
    const data = await api.request("layout", "/export?year=" + selectedYear);
    const bytes = await encodeWorkbook(data);
    if (ticket !== securityEpoch) return;
    download(bytes, "GSiS-Layout-" + selectedYear + ".xlsx");
    message("Canonical Layout workbook ready.");
  } catch (error) { message(error.message, true); }
}
function openImport() {
  if (!dialog.open) dialog.showModal();
  importFile.disabled = unresolved || importBusy;
  importReceipt.hidden = !unresolved;
  if (unresolved) {
    importConfirm.textContent = 'Retry original Layout import';
    importConfirm.disabled = importBusy;
    importMessage('Import ' + importRequest.operationId + ' is unconfirmed. Check its receipt; a retry preserves the same operation.', true);
  }
}
function clearImport() {
  if (recoveryKey) sessionStorage.removeItem(recoveryKey);
  unresolved = false;
  importRequest = null;
  preview = null;
  importFile.disabled = false;
  importFile.value = '';
  importConfirm.disabled = true;
  importConfirm.textContent = 'Confirm Layout import';
  importReceipt.hidden = true;
}
const editableLabels = {
  teacherLabels: 'Teacher labels', pupilCount: 'Pupils', pupilCountText: 'Pupil text',
  programmes: 'Programme notes', active: 'Active', notes: 'Review notes',
};
// Cell hints explain server rejection; the owning service alone accepts a workbook.
function cellIssue(table, field, value, old, owned) {
  const allowed = (owned?.editableFields?.[table] || []).map(key => editableLabels[key]);
  if (JSON.stringify(value ?? null) === JSON.stringify(old ?? null)) return '';
  if (!allowed.includes(field)) return 'Published/source fields are read-only.';
  if (field === 'Active' && !['Y', 'N'].includes(value)) return 'Active must be Y or N.';
  if (field === 'Pupils' && value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 10000)) return 'Pupils must be a whole number from 0 to 10000, or blank.';
  if (!['Active', 'Pupils'].includes(field) && (typeof value !== 'string' || value.length > 4000)) return 'Use text of at most 4000 characters.';
  return '';
}
function renderImport(workbook, baseline, owned, rejected = false) {
  importHost.replaceChildren();
  for (const [name, sheet] of Object.entries(workbook.sheets || {})) {
    const section = document.createElement('details');
    section.open = true;
    const summary = document.createElement('summary');
    summary.textContent = name + ' · ' + sheet.rows.length + ' rows';
    section.append(summary);
    const table = document.createElement('table'), head = table.createTHead().insertRow(), body = table.createTBody();
    table.dataset.noTableTools = '';
    const canonical = baseline?.sheets?.[name];
    const previous = new Map((canonical?.rows || []).map(row => [row[0], row]));
    sheet.columns.forEach((label, column) => {
      const th = document.createElement('th'); th.textContent = label;
      if (rejected && label !== canonical?.columns[column]) {
        th.className = 'gsis-import-invalid'; th.title = 'Header differs from the canonical export.'; th.setAttribute('aria-invalid', 'true');
      }
      head.append(th);
    });
    const seen = new Set();
    sheet.rows.forEach(row => {
      const tr = body.insertRow(), prior = previous.get(row[0]), duplicate = seen.has(row[0]);
      seen.add(row[0]);
      row.forEach((value, column) => {
        const td = tr.insertCell(); td.textContent = String(value ?? '');
        const issue = rejected && (column === 0 && (!prior || duplicate)
          ? 'Unknown or duplicate permanent identity.'
          : prior && cellIssue(name, sheet.columns[column], value, prior[column], owned));
        if (issue) { td.className = 'gsis-import-invalid'; td.title = issue; td.setAttribute('aria-invalid', 'true'); }
      });
    });
    const scroll = document.createElement('div'); scroll.className = 'gsis-core-scroll'; scroll.append(table); section.append(scroll); importHost.append(section);
  }
}
importFile.onchange = async event => {
  if (unresolved || importBusy) return;
  const file = event.target.files[0], epoch = ++readEpoch, selectedYear = year();
  if (!file) return;
  openImport();
  importRequest = null; preview = null; importConfirm.disabled = true; importHost.replaceChildren();
  importMessage('Reading and validating the workbook…');
  let workbook, baseline, owned;
  try {
    if (file.size > 8 * 1024 * 1024) throw Error('The workbook exceeds 8 MiB.');
    const parsed = await decodeWorkbook(await file.arrayBuffer());
    if (epoch !== readEpoch) return;
    workbook = { ...parsed.metadata, sheets: parsed.sheets };
    [baseline, owned] = await Promise.all([
      api.request('layout', '/export?year=' + selectedYear),
      api.request('layout', '/owned-data?year=' + selectedYear),
    ]);
    if (epoch !== readEpoch) return;
    renderImport(workbook, baseline, owned);
    const result = await api.request('layout', '/import-preview', {
      method: 'POST', body: { year: selectedYear, revision: workbook.revision, workbook },
    });
    if (epoch !== readEpoch) return;
    preview = result;
    importRequest = { operationId: crypto.randomUUID(), year: selectedYear, revision: result.revision, previewId: result.previewId };
    importConfirm.disabled = !!result.errors?.length;
    importMessage((result.diff?.length || 0) + ' records will change. Review the workbook, then confirm. This preview expires in 15 minutes.');
  } catch (error) {
    if (epoch !== readEpoch) return;
    if (workbook) renderImport(workbook, baseline, owned, true);
    importMessage(error.message + ' No Layout changes were applied. Replace the corrected file in this dialog.', true);
  }
};
importConfirm.onclick = async () => {
  if (!importRequest || importBusy) return;
  const ticket = securityEpoch;
  if (!unresolved && preview?.expiresAt <= Date.now()) { importConfirm.disabled = true; importMessage('This preview expired. Choose the workbook again to obtain a current preview.', true); return; }
  importBusy = true; importConfirm.disabled = true; importFile.disabled = true;
  try {
    // Persist the exact identity before dispatch. Reload never creates a new apply.
    sessionStorage.setItem(recoveryKey, JSON.stringify(importRequest));
    unresolved = true; importReceipt.hidden = false;
    const result = await api.request('layout', '/import-apply', { method: 'POST', body: importRequest });
    if (ticket !== securityEpoch) return;
    if (result.receipt?.state !== 'committed' && result.state !== 'committed' && result.saved !== true)
      throw Error('The import outcome is not confirmed.');
    clearImport(); importHost.replaceChildren(); await load();
    importMessage('Layout import committed.'); message('Layout ' + year() + ' revision ' + snapshot.revision + ' · import committed.'); dialog.close();
  } catch (error) {
    if (ticket !== securityEpoch) return;
    importMessage(error.message + (unresolved ? ' The original operation is retained. Check its receipt before another import.' : ' The request was not sent; local recovery storage is unavailable.'), true);
    importConfirm.disabled = false;
    if (unresolved) importConfirm.textContent = 'Retry original Layout import';
    else importFile.disabled = false;
  } finally { importBusy = false; }
};
importReceipt.onclick = async () => {
  if (!unresolved || importBusy) return;
  const ticket = securityEpoch;
  importReceipt.disabled = true;
  try {
    const receipt = await api.request('layout', '/receipt?operationId=' + encodeURIComponent(importRequest.operationId));
    if (ticket !== securityEpoch) return;
    if (receipt?.state === 'committed') {
      clearImport(); importHost.replaceChildren(); await load();
      importMessage('The original Layout import committed.'); message('Layout ' + year() + ' revision ' + snapshot.revision + ' · original import committed.');
    } else if (['terminal-not-committed', 'aborted'].includes(receipt?.state)) {
      clearImport(); importMessage('The original import did not commit. Replace the workbook with a current export before trying again.');
    } else importMessage('The original operation is ' + (receipt?.state || 'unconfirmed') + '. No new import was started.');
  } catch (error) { if(ticket === securityEpoch) importMessage(error.message + ' The original operation is retained.', true); }
  finally { importReceipt.disabled = false; }
};
function register() { window.GSISCoreTables?.register('table[data-layout-owned]', { exportAll, importAll: openImport }); }
register(); window.addEventListener('load', register);
window.addEventListener('gsis:clear-protected-state', () => {
  readEpoch++; securityEpoch++; dialog.close(); importHost.replaceChildren(); snapshot = null; importRequest = null; preview = null;
  if (recoveryKey) sessionStorage.removeItem(recoveryKey);
  recoveryKey = ''; unresolved = false;
  panel.querySelector('[data-rows]').replaceChildren(); panel.hidden = true;
});

try {
  const session = await api.getSession();
  if (!session || !(api.capable("layout.edit") || api.capable("layout.admin")))
    panel.hidden = true;
  else {
    recoveryKey = 'gsis-layout-import:' + session.schoolId + ':' + session.user.accountId;
    const pending = sessionStorage.getItem(recoveryKey);
    if (pending) { importRequest = JSON.parse(pending); unresolved = true; }
    await load();
  }
} catch (error) {
  message(error.message, true);
}
