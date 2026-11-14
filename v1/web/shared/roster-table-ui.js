/* Opening balances use the existing owner preview and atomic save command. */
(function () {
  'use strict';
  const api = window.GSISV1;
  if (!api || api.module !== 'roster') return;
  const schema = 'gsis.roster.openings.v1';
  const columns = ['Staff ID', 'Teacher', 'Record version', 'Cumulative quota', 'Cumulative relief done', 'As of date'];
  const fields = ['cumulativeQuota', 'cumulativeDone', 'asOfDate'];
  const literal = value => String(value ?? '');
  const same = (a, b) => Array.isArray(a) && Array.isArray(b) && JSON.stringify(a.map(literal)) === JSON.stringify(b.map(literal));
  const cells = row => [row.staffId, row.name, row.version, ...fields.map(key => row[key] ?? '')];
  const normalizeName = value => literal(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const dateValid = value => /^\d{4}-\d{2}-\d{2}$/.test(literal(value)) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
  function workbook(data, schoolId) {
    const rows = data.rows.map(cells);
    return {metadata: {Schema: schema, 'School ID': schoolId, Year: data.year, Revision: String(data.revision), 'Exported At': new Date().toISOString(), 'Import semantics': 'Complete staff set; edit quota, relief done and as-of date only. Preview and native reviewed save remain required.'}, sheets: {Balances: {columns, rows}, Baseline: {columns, rows: rows.map(row => row.slice())}}};
  }
  function validate(book, data, schoolId) {
    const errors = [], rows = [], add = (message, row, column) => errors.push({message, row, column});
    if (book.metadata?.Schema !== schema || book.metadata?.['School ID'] !== schoolId || literal(book.metadata?.Year) !== literal(data.year)) add('Use an Opening balances Export All workbook from this school and year.');
    if (literal(book.metadata?.Revision) !== literal(data.revision)) add('Roster changed after export. Refresh records and export again.');
    const sheet = book.sheets?.Balances, baseline = book.sheets?.Baseline;
    if (!sheet || !baseline || !Array.isArray(sheet.rows) || !Array.isArray(baseline.rows) || Object.keys(book.sheets).sort().join('|') !== 'Balances|Baseline' || !same(sheet.columns, columns) || !same(baseline.columns, columns)) return {rows, errors: [...errors, {message: 'Balances and Baseline sheets must retain their exact columns.'}]};
    if (!Array.isArray(data.rows) || !data.rows.length || data.rows.length > 2000 || sheet.rows.length !== data.rows.length || baseline.rows.length !== data.rows.length) return {rows, errors: [...errors, {message: 'Keep the complete staff set. Row insertion, deletion and more than 2,000 staff are unsupported.'}]};
    const current = new Map(data.rows.map(row => [row.staffId, row])), originals = new Map(), seen = new Set(), names = new Map();
    for (const row of data.rows) names.set(normalizeName(row.name), (names.get(normalizeName(row.name)) || 0) + 1);
    for (const row of baseline.rows) {
      const saved = current.get(row[0]);
      if (originals.has(row[0]) || !saved || row.length !== columns.length || !same(row, cells(saved))) add('Baseline differs from the current saved records. Refresh and export again.');
      originals.set(row[0], row);
    }
    sheet.rows.forEach((row, index) => {
      const saved = current.get(row[0]), original = originals.get(row[0]);
      if (!saved || !original || seen.has(row[0]) || row.length !== columns.length) { add('Unknown, duplicate or malformed permanent Staff ID.', index, 0); return; }
      seen.add(row[0]);
      if (!same(row.slice(0, 3), original.slice(0, 3))) add('Staff ID, teacher name and record version are read-only.', index, 0);
      if (names.get(normalizeName(saved.name)) !== 1) add('This teacher name is ambiguous in the native preview. Use the individual Staff ID row editor.', index, 1);
      for (const column of [3, 4]) if (!/^\d{1,4}$/.test(literal(row[column])) || Number(row[column]) > 9999) add('Use a whole number from 0 to 9999.', index, column);
      const value = literal(row[5]), today = new Date(Date.now() + 28800000).toISOString().slice(0, 10);
      if (!dateValid(value) || ![literal(data.year), literal(Number(data.year) - 1)].includes(value.slice(0, 4)) || value > today) add('Use a valid date in this or the previous year, no later than today.', index, 5);
      rows.push({staffId: saved.staffId, name: saved.name, cumulativeQuota: Number(row[3]), cumulativeDone: Number(row[4]), asOfDate: value});
    });
    return {rows, errors};
  }
  function cleanGrid() {
    const grid = document.querySelector('.opening-grid');
    if (!grid || !grid.getClientRects().length) throw Error('Open Opening balances before importing or exporting.');
    if (window.RosterOpsUI?.isDirty()) throw Error('Save or discard the current opening-balance draft first.');
    const preview = document.querySelector('[data-opening-preview]');
    if (preview?.disabled) throw Error('An opening-balance operation is pending. Resolve its original save first.');
    return grid;
  }
  async function read() {
    cleanGrid();
    const session = await api.getSession(true);
    if (!session) throw Error('Sign in to Roster first.');
    const data = await api.request('roster', '/operations', {method: 'POST', body: {operation: 'openingBalances'}});
    if (!Number.isSafeInteger(data.revision) || !Array.isArray(data.rows)) throw Error('Opening-balance evidence is incomplete.');
    return {data, session};
  }
  async function exportAll() {
    const {data, session} = await read(), {encodeWorkbook, download} = await import('./workbooks.mjs');
    download(await encodeWorkbook(workbook(data, session.schoolId)), 'GSiS-Roster-Opening-balances-' + data.year + '-All.xlsx');
  }
  function editable(data, session) {
    if (data.canEdit !== true || session.impersonating || !api.capable('roster.admin')) throw Error('Current Roster administrator access is required.');
  }
  function stageNative(rows, data) {
    cleanGrid();
    const filter = document.querySelector('[data-opening-filter]');
    if (filter) {filter.value = ''; filter.dispatchEvent(new Event('input', {bubbles: true}));}
    const byId = new Map([...document.querySelectorAll('[data-opening-row]')].map(row => [row.dataset.openingRow, row]));
    for (const saved of data.rows) {
      const node = byId.get(saved.staffId);
      if (!node || fields.some(key => literal(node.querySelector('[data-opening-value="' + key + '"]')?.value) !== literal(saved[key]))) throw Error('The displayed grid differs from saved records. Refresh records before import.');
    }
    const paste = document.querySelector('[data-opening-paste]'), preview = document.querySelector('[data-opening-preview]');
    if (!paste || !preview || preview.disabled) throw Error('The native opening-balance preview is unavailable.');
    // Native name matching is used only after unambiguous Staff ID/name binding.
    const quote = value => '"' + literal(value).replace(/"/g, '""') + '"';
    paste.value = rows.map(row => [row.name, ...fields.map(key => row[key])].map(quote).join(',')).join('\n');
    paste.closest('details').open = true;
    preview.click();
    const result = document.querySelector('[data-opening-preview-result]'), matched = [...result.querySelectorAll('[data-opening-preview-row]')].map(row => row.dataset.openingPreviewRow);
    if (matched.length !== rows.length || new Set(matched).size !== rows.length || rows.some(row => !matched.includes(row.staffId))) {
      const apply = result.querySelector('[data-opening-apply]'); if (apply) apply.disabled = true;
      throw Error('Native preview did not resolve the complete staff set. No grid values changed.');
    }
    result.scrollIntoView({block: 'nearest'});
  }
  async function openImport() {
    const initial = await read(); editable(initial.data, initial.session);
    const dialog = document.createElement('dialog');
    dialog.className = 'gsis-panel';dialog.setAttribute('aria-label', 'Import Opening balances');
    Object.assign(dialog.style, {width: 'min(1000px,90vw)', maxHeight: '85vh', overflow: 'auto', margin: 'auto'});
    const title = document.createElement('h2');title.textContent = 'Import Opening balances';
    const help = document.createElement('p');help.textContent = 'Validation changes no records. Review the native preview, apply to the grid, then give a reason and use the existing Save control.';
    const input = document.createElement('input');input.type = 'file';input.accept = '.xlsx';input.setAttribute('aria-label', 'Opening balances workbook');
    const status = document.createElement('p');status.setAttribute('role', 'status');
    const preview = document.createElement('div'), review = document.createElement('button');review.textContent = 'Review in Opening balances';review.disabled = true;
    const close = document.createElement('button');close.textContent = 'Cancel';close.onclick = () => dialog.close();
    let book = null, generation = 0;
    input.onchange = async () => {
      const own = ++generation;review.disabled = true;book = null;preview.replaceChildren();const file = input.files?.[0];if (!file) return;
      try {
        status.textContent = 'Validating the complete workbook…';
        const {decodeWorkbook} = await import('./workbooks.mjs'), decoded = await decodeWorkbook(await file.arrayBuffer()), current = await read();editable(current.data, current.session);
        if (own !== generation || !dialog.open || !dialog.isConnected) return;
        const result = validate(decoded, current.data, current.session.schoolId), sheet = decoded.sheets?.Balances;
        if (sheet) {const table = document.createElement('table'), head = table.createTHead().insertRow();sheet.columns.forEach(name => {const th = document.createElement('th');th.textContent = name;head.append(th);});const body = table.createTBody();sheet.rows.forEach((values, row) => {const tr = body.insertRow();values.forEach((value, column) => {const td = tr.insertCell();td.textContent = literal(value);const errors = result.errors.filter(error => error.row === row && error.column === column);if (errors.length) {td.style.background = '#fee2e2';td.setAttribute('aria-invalid', 'true');td.title = errors.map(error => error.message).join(' ');}});});preview.append(table);}
        if (result.errors.length) {status.textContent = result.errors.map(error => error.message).join(' ');return;}
        book = decoded;review.disabled = false;status.textContent = result.rows.length + ' valid staff rows. Nothing has changed yet.';
      } catch (error) {if (own === generation) status.textContent = error.message;}
    };
    review.onclick = async () => {
      review.disabled = true;
      try {const current = await read();editable(current.data, current.session);const result = validate(book, current.data, current.session.schoolId);if (result.errors.length) throw Error(result.errors.map(error => error.message).join(' '));stageNative(result.rows, current.data);dialog.close();}
      catch (error) {status.textContent = error.message;}
    };
    dialog.append(title, help, input, status, preview, review, close);document.body.append(dialog);dialog.addEventListener('close', () => {generation++;dialog.remove();});dialog.showModal();
  }
  function register() {window.GSISCoreTables?.register('.opening-grid', {exportAll, ...(api.capable('roster.admin') ? {importAll: openImport} : {})});}
  register();api.getSession().then(register).catch(() => {});window.addEventListener('gsis:tables-ready', register);window.addEventListener('load', register);
  window.addEventListener('gsis:clear-protected-state', () => document.querySelector('dialog[aria-label="Import Opening balances"]')?.remove());
  window.GSISV1RosterTables = {workbook, validate, exportAll, openImport};
})();
