import { download } from './workbooks.mjs';
import { encodeWeeklyWorkbook } from './calendar-ui-workbook.js';

const $ = (id) => document.getElementById(id);
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function weeklyExports() {
  const host = $('weeklyHost');
  if (!host || !host.childElementCount) return;
  let toolbar = host.querySelector('.weekly-toolbar');
  if (!toolbar) {
    toolbar = node('div', undefined, 'weekly-toolbar');
    const pdf = node('button', 'Save as PDF', 'primary');
    pdf.id = 'savePdfBtn';
    toolbar.append(pdf);
    host.prepend(toolbar);
  }
  const table = host.querySelector('.weekly-grid');
  // A chronological calendar matrix must keep its dates in place.
  if (table) table.dataset.noTableTools = '';
  const ready = !!table?.tBodies[0]?.rows.length;
  const pdf = toolbar.querySelector('#savePdfBtn');
  pdf.disabled = !ready;
  pdf.title = ready ? 'Print this weekly calendar or save it as PDF.' : 'Choose an available calendar year first.';
  if (!toolbar.querySelector('[data-weekly-excel]')) {
    const excel = node('button', 'Export to Excel', 'secondary');
    excel.type = 'button';
    excel.dataset.weeklyExcel = '';
    excel.onclick = async () => {
      const current = host.querySelector('.weekly-grid');
      if (!current?.tBodies[0]?.rows.length) return;
      const columns = [...current.tHead.rows[0].cells].map(c => {
        const label = c.cloneNode(true);
        label.querySelectorAll('button,[data-core-resize]').forEach(el => el.remove());
        return label.textContent.trim();
      });
      const rows = [...current.tBodies[0].rows].filter(r => !r.hidden).map(r => [...r.cells].map(c => c.innerText.trim()));
      const year = columns[0];
      excel.dataset.busy = "true";
      excel.disabled = true;
      const status = toolbar.querySelector('[data-export-status]');
      try {
        const bytes = await encodeWeeklyWorkbook({ columns, rows, year });
        download(bytes, `Calendar ${year} Weekly View.xlsx`);
        status.textContent = 'Excel downloaded. This weekly-view report is not an import template.';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        delete excel.dataset.busy;
        excel.disabled = !host.querySelector('.weekly-grid tbody tr');
      }
    };
    toolbar.append(excel);
    const status = node('span', '', 'calendar-export-status');
    status.dataset.exportStatus = '';
    status.setAttribute('role', 'status');
    toolbar.append(status);
  }
  const excel = toolbar.querySelector('[data-weekly-excel]');
  excel.disabled = !ready || excel.dataset.busy === 'true';
  if (!host.querySelector('[data-pdf-help]')) {
    const note = node('p', 'Save as PDF uses your browser’s print dialog and saves to your device. Excel exports the displayed weekly layout, including weeks outside the scroll area.', 'privacy-note calendar-export-help');
    note.dataset.pdfHelp = '';
    toolbar.after(note);
  }
}
function group(host, title, collapsed = false) {
  const section = node(collapsed ? 'details' : 'section', undefined, 'calendar-setup-group');
  section.append(node(collapsed ? 'summary' : 'h3', title));
  const content = node('div', undefined, 'calendar-setup-content');
  section.append(content);
  host.append(section);
  return content;
}
function renderChecks(host, result) {
  host.replaceChildren();
  const providers = result.providers || {};
  host.append(node('p', `Google Calendar credentials: ${providers.googleCalendar ? 'Configured' : 'Not configured'}. Drive export: ${providers.drive ? 'Configured' : 'Not configured'}.`));
  for (const issue of result.issues || []) host.append(node('p', issue.message, issue.severity === 'ERROR' ? 'diagnostic-error' : 'privacy-note'));
  for (const check of result.tests || []) host.append(node('p', `${check.ok ? 'Passed' : 'Needs attention'}: ${check.name}`));
  host.append(node('p', 'These are configuration and local-state checks. Live Google access and event-write verification: Not tested.', 'privacy-note'));
}
function attachReadCheck(button, output, action) {
  if (!button) return;
  button.addEventListener('click', async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    button.disabled = true;
    output.textContent = 'Checking…';
    try { renderChecks(output, await window.GSISV1.request('calendar', `/${action}`)); }
    catch (error) { output.textContent = error.message; }
    finally { button.disabled = false; }
  }, true);
}
function setup() {
  const host = $('urlsHost');
  if (!host || !host.querySelector('#urlForm') || host.dataset.v1Setup) return;
  host.dataset.v1Setup = 'true';
  // The legacy renderer replaces children on refresh. Detect a new form instead of
  // relying on a marker on the host, which survives that replacement.
  const form = $('urlForm');
  form.dataset.v1Setup = 'true';
  const old = [...host.children];
  const connections = group(host, 'Calendar connections');
  const diagnostics = group(host, 'Diagnostics');
  const recovery = group(host, 'Recovery', true);
  const advanced = group(host, 'Advanced actions', true);
  for (const child of old) {
    if (child.contains(form)) connections.append(child);
    else if (child.querySelector('#calendarReadCheckBtn')) diagnostics.append(child);
    else if (child.querySelector('#loadMutationReceipts') || child.querySelector('#healthCheckBtn')) recovery.append(child);
    else if (child.matches('details.danger-zone-card')) advanced.append(child);
    else if (child.textContent.includes('Save as PDF')) child.remove();
    else recovery.append(child);
  }
  connections.querySelector('h3')?.remove();
  for (const input of form.querySelectorAll('input')) {
    const status = node('span', input.value.trim() ? 'Destination configured · access not yet verified' : 'Not configured', 'calendar-connection-status');
    input.after(status);
    input.addEventListener('input', () => { status.textContent = 'Unsaved destination'; });
  }
  form.querySelector('button[type=submit]').textContent = 'Save destinations';
  const diagnosticCard = $('calendarReadCheckBtn').closest('.card');
  diagnosticCard.querySelector('h3').textContent = 'Connection readiness';
  diagnosticCard.querySelector('.privacy-note').textContent = 'Checks configured provider credentials and local sync state. It does not create Google Calendar events or prove live provider access.';
  $('calendarReadCheckBtn').textContent = 'Check configuration';
  const write = $('calendarWriteCheckBtn');
  write.disabled = true;
  write.textContent = 'Live write test unavailable';
  write.title = 'A live create/delete test is not implemented in this v1 diagnostic.';
  write.setAttribute('aria-describedby', 'calendarWriteTestNote');
  const explanation = node('p', 'Live write testing would create and delete a temporary Google event. This prototype provides no such test; no write permission is inferred from these checks.', 'privacy-note');
  explanation.id = 'calendarWriteTestNote';
  write.parentElement.after(explanation);
  attachReadCheck($('calendarReadCheckBtn'), $('calendarDiagnosticHost'), 'calendarPreflight');
  const health = $('healthCheckBtn').closest('.card');
  health.querySelector('h3').textContent = 'Integrity and reconciliation';
  health.querySelector('.privacy-note').textContent = 'Read-only owner-state checks. Unknown provider outcomes require reconciliation before retrying a write.';
  $('selfTestBtn').textContent = 'Check owner state';
  attachReadCheck($('healthCheckBtn'), $('healthCheckHost'), 'healthCheck');
  attachReadCheck($('selfTestBtn'), $('selfTestHost'), 'runSelfTests');
  const title = document.querySelector('#page-urls .page-head h2');
  if (title) title.textContent = 'Calendar Setup';
  const nav = document.querySelector('#nav [data-page=urls]');
  if (nav) nav.textContent = 'Setup';
}
let queued = false;
function refresh() {
  queued = false;
  const host = $('urlsHost');
  if (host?.dataset.v1Setup && !host.querySelector('#urlForm[data-v1-setup]')) delete host.dataset.v1Setup;
  weeklyExports();
  setup();
}
new MutationObserver(() => {
  if (!queued) { queued = true; queueMicrotask(refresh); }
}).observe(document.body, { childList: true, subtree: true });
refresh();

// Canonical imports are scoped to existing Calendar definitions. Year lifecycle
// and People/Roles continue through their dedicated permission-checked editors.
(function calendarTableImports() {
  const api = window.GSISV1;
  let dialog, file, status, previewHost, confirm, receiptButton, kind,
    request = null, unresolved = false, busy = false, epoch = 0, storageKey = '', allowed;
  const message = (text, error = false) => { status.textContent = text; status.classList.toggle('gsis-error', error); };
  const call = (action, payload) => api.request('calendar', '/action', {method:'POST',body:{action,payload}});
  function clear() {
    if(storageKey)sessionStorage.removeItem(storageKey);
    unresolved = false; request = null; file.disabled = false; file.value = '';
    confirm.disabled = true; confirm.textContent = 'Confirm Calendar import'; receiptButton.hidden = true;
  }
  function ensureDialog() {
    if(dialog)return;
    dialog=node('dialog');dialog.className='gsis-import-preview';dialog.setAttribute('aria-label','Import Calendar definitions');
    dialog.append(node('h2','Import Calendar definitions'),node('p','Use the matching Export All workbook. Change at most 12 existing definitions together. Omitted records remain unchanged; add or delete definitions through their normal editors.'));
    const label=node('label','Corrected workbook ');file=node('input');file.type='file';file.accept='.xlsx';file.setAttribute('aria-label','Calendar workbook');file.onchange=read;
    label.append(file);status=node('p');status.setAttribute('role','status');previewHost=node('div');
    confirm=node('button','Confirm Calendar import');confirm.disabled=true;confirm.onclick=apply;
    receiptButton=node('button','Check original import receipt');receiptButton.hidden=true;receiptButton.onclick=checkReceipt;
    const close=node('button','Close');close.onclick=()=>dialog.close();
    dialog.append(label,status,previewHost,confirm,receiptButton,close);document.body.append(dialog);
  }
  function showWorkbook(book, errors = []) {
    previewHost.replaceChildren();
    const sheet=book.sheets.Records, table=node('table'), head=table.createTHead().insertRow(), body=table.createTBody();
    table.dataset.noTableTools = '';
    sheet.columns.forEach(text=>head.append(node('th',text)));
    sheet.rows.forEach((row,r)=>{const tr=body.insertRow();row.forEach((value,c)=>{
      const td=tr.insertCell();td.textContent=String(value??'');const issue=errors.find(e=>e.row===r&&e.column===c);
      if(issue){td.className='gsis-import-invalid';td.title=issue.message;td.setAttribute('aria-invalid','true');}
    });});
    const scroll=node('div',undefined,'gsis-core-scroll');scroll.append(table);previewHost.append(scroll);
    errors.forEach(error=>previewHost.append(node('p',error.message,'gsis-error')));
  }
  async function open(nextKind) {
    if(!api.capable('calendar.admin'))throw Error('Current Calendar administrator access is required.');
    const session=await api.getSession();
    storageKey='gsis-calendar-table-import:'+session.schoolId+':'+session.user.accountId;
    ensureDialog();
    const stored=sessionStorage.getItem(storageKey);
    if(stored){request=JSON.parse(stored);unresolved=true;kind=request.workbook.kind;file.disabled=true;confirm.textContent='Retry original import';confirm.disabled=false;receiptButton.hidden=false;message('The original import is unconfirmed. Check its receipt; a retry retains the same operation.');}
    else if(!unresolved){kind=nextKind;request=null;file.value='';previewHost.replaceChildren();confirm.disabled=true;message('Choose the '+(kind==='lanes'?'Columns':'Glossary')+' Export All workbook. No changes apply before confirmation.');}
    if(!dialog.open)dialog.showModal();
  }
  async function read() {
    if(unresolved||busy)return;
    const chosen=file.files[0], ticket=++epoch;if(!chosen)return;
    request=null;confirm.disabled=true;previewHost.replaceChildren();message('Reading and validating…');
    try {
      const {decodeWorkbook}=await import('./workbooks.mjs');
      if(chosen.size>8*1024*1024)throw Error('The workbook exceeds 8 MiB.');
      const parsed=await decodeWorkbook(await chosen.arrayBuffer());if(ticket!==epoch)return;
      const book={...parsed.metadata,sheets:parsed.sheets};
      if(book.kind!==kind)throw Error('Use the workbook for the selected table.');
      const result=await call('tableImportPreview',{workbook:book});if(ticket!==epoch)return;
      showWorkbook(book,result.errors||[]);
      if(!result.valid){message('Correct the outlined cells and replace this file. Nothing was changed.',true);return;}
      request={operationId:crypto.randomUUID(),workbook:book,expiresAt:result.expiresAt,previewToken:result.previewToken};
      confirm.disabled=result.changedRecords===0;confirm.textContent='Confirm Calendar import';
      message(result.changedRecords+' definitions will change together. The preview expires in 15 minutes.');
    } catch(error){if(ticket===epoch)message(error.message+' No Calendar changes were applied.',true);}
  }
  async function apply() {
    if(!request||busy)return;
    const ticket=epoch;
    busy=true;confirm.disabled=true;file.disabled=true;
    try {
      sessionStorage.setItem(storageKey,JSON.stringify(request));unresolved=true;receiptButton.hidden=false;
      const result=await call('tableImportApply',request);
      if(ticket!==epoch)return;
      if(result.saved!==true)throw Error('The import outcome is unconfirmed.');
      clear();previewHost.replaceChildren();message('Calendar definitions committed.');$('refreshCalendarBtn')?.click();
    } catch(error) {
      if(ticket!==epoch)return;
      message(error.message+(unresolved?' The original operation is retained. Check its receipt before replacing the file.':' The request was not sent; local recovery storage is unavailable.'),true);
      confirm.textContent=unresolved?'Retry original import':'Confirm Calendar import';confirm.disabled=false;
      if(!unresolved)file.disabled=false;
    } finally {if(ticket===epoch)busy=false;}
  }
  async function checkReceipt() {
    if(!request||busy)return;
    const ticket=epoch;
    receiptButton.disabled=true;
    try {
      const result=await call('eventMutationStatus',{operationId:request.operationId});
      if(ticket!==epoch)return;
      if(result.state==='SAVED'){clear();previewHost.replaceChildren();message('The original Calendar import committed.');$('refreshCalendarBtn')?.click();}
      else if(result.state==='NOT_SAVED'){clear();message('The original import did not commit. Export again and review a corrected workbook.');}
      else message('The original operation is still unconfirmed. A retry uses its same identity and content.');
    } catch(error){if(ticket===epoch)message(error.message+' The original operation is retained.',true);}
    finally {if(ticket===epoch)receiptButton.disabled=false;}
  }
  async function exportAll(exportKind) {
    const ticket=epoch;
    const {encodeWorkbook}=await import('./workbooks.mjs');
    const book=await call('tableWorkbook',{kind:exportKind});
    const bytes=await encodeWorkbook(book);
    if(ticket===epoch)download(bytes,'GSiS-Calendar-'+(exportKind==='lanes'?'Columns':'Glossary')+'.xlsx');
  }
  function register() {
    const next=api.capable('calendar.admin');
    if(!window.GSISCoreTables||allowed===next)return;allowed=next;
    for(const [selector,tableKind] of [['#columnsHost table','lanes'],['#glossaryHost table','tags']])
      window.GSISCoreTables.register(selector,next?{exportAll:()=>exportAll(tableKind),importAll:()=>open(tableKind)}:{});
  }
  api.getSession().then(register).catch(()=>{});window.addEventListener('load',register);window.addEventListener('gsis:capabilities',register);
  window.addEventListener('gsis:clear-protected-state',()=>{
    epoch++;dialog?.close();dialog?.remove();dialog=null;request=null;unresolved=false;busy=false;allowed=false;
    if(storageKey)sessionStorage.removeItem(storageKey);storageKey='';
    for(const selector of ['#columnsHost table','#glossaryHost table'])window.GSISCoreTables?.register(selector,{});
  });
})();

// Authorized bulk event import (A16/T03) over importEventsPreview / importEventsApply.
(function calendarBulkEventImports() {
  const api = window.GSISV1;
  if (!api) return;
  let dialog, yearInput, fileInput, textInput, status, previewHost, previewBtn, confirmBtn, receiptBtn,
    request = null, unresolved = false, busy = false, epoch = 0, storageKey = '';
  const isAllowed = () => Boolean(api.capable('calendar.admin') || api.capable('admin'));
  const setStatus = (text, error = false) => {
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('gsis-error', error);
  };
  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cell += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell); cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some((c) => c.trim() !== '')) rows.push(row);
        row = [];
      } else {
        cell += ch;
      }
    }
    if (cell.length || row.length) {
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
    }
    if (rows.length < 2) throw Error('Provide a header row and at least one event row.');
    const headers = rows[0].map((h) => h.trim());
    return rows.slice(1).map((cols) => {
      const obj = {};
      headers.forEach((h, idx) => {
        if (!h) return;
        const val = (cols[idx] ?? '').trim();
        if (val !== '') obj[h] = val;
      });
      return obj;
    });
  }
  function parseEvents(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) throw Error('Paste JSON or CSV event rows, or choose a file.');
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : parsed?.events;
      if (!Array.isArray(list) || !list.length) throw Error('JSON must be a non-empty array of event objects (or { events: [...] }).');
      return list;
    }
    return parseCsv(trimmed);
  }
  function clearPending() {
    if (storageKey) sessionStorage.removeItem(storageKey);
    unresolved = false;
    request = null;
    if (yearInput) yearInput.disabled = false;
    if (fileInput) { fileInput.disabled = false; fileInput.value = ''; }
    if (textInput) textInput.disabled = false;
    if (previewBtn) previewBtn.disabled = false;
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Confirm bulk import'; }
    if (receiptBtn) receiptBtn.hidden = true;
  }
  function ensureDialog() {
    if (dialog) return;
    dialog = node('dialog');
    dialog.id = 'calendarBulkImportDialog';
    dialog.className = 'gsis-import-preview';
    dialog.setAttribute('aria-label', 'Bulk import events');
    dialog.append(
      node('h2', 'Bulk import events'),
      node('p', 'Preview JSON or CSV event rows before committing. Invalid rows must be corrected before import; all valid rows commit atomically.'),
    );
    const yearLabel = node('label', 'Target school year ');
    yearInput = node('input');
    yearInput.id = 'bulkImportYear';
    yearInput.type = 'number';
    yearInput.min = '2000';
    yearInput.max = '2200';
    yearLabel.append(yearInput);
    const fileLabel = node('label', 'Load JSON or CSV file ');
    fileInput = node('input');
    fileInput.id = 'bulkImportFile';
    fileInput.type = 'file';
    fileInput.accept = '.json,.csv,text/csv,application/json';
    fileInput.onchange = async () => {
      const f = fileInput.files?.[0];
      if (!f || unresolved) return;
      textInput.value = await f.text();
      invalidatePreview();
    };
    fileLabel.append(fileInput);
    const textLabel = node('label', 'Event rows (JSON array or CSV)');
    textInput = node('textarea');
    textInput.id = 'bulkImportInput';
    textInput.rows = 8;
    textInput.style.width = '100%';
    textInput.setAttribute('aria-label', 'Bulk import event rows');
    textInput.addEventListener('input', invalidatePreview);
    yearInput.addEventListener('input', invalidatePreview);
    textLabel.append(textInput);
    status = node('p');
    status.id = 'bulkImportStatus';
    status.setAttribute('role', 'status');
    previewHost = node('div');
    previewHost.id = 'bulkImportPreviewHost';
    const actions = node('div', undefined, 'recovery-actions');
    previewBtn = node('button', 'Preview import', 'secondary');
    previewBtn.id = 'bulkImportPreviewBtn';
    previewBtn.type = 'button';
    previewBtn.onclick = runPreview;
    confirmBtn = node('button', 'Confirm bulk import', 'primary');
    confirmBtn.id = 'bulkImportConfirmBtn';
    confirmBtn.type = 'button';
    confirmBtn.disabled = true;
    confirmBtn.onclick = runApply;
    receiptBtn = node('button', 'Check original import receipt', 'secondary');
    receiptBtn.id = 'bulkImportReceiptBtn';
    receiptBtn.type = 'button';
    receiptBtn.hidden = true;
    receiptBtn.onclick = checkReceipt;
    const closeBtn = node('button', 'Close', 'secondary');
    closeBtn.type = 'button';
    closeBtn.onclick = () => dialog.close();
    actions.append(previewBtn, confirmBtn, receiptBtn, closeBtn);
    dialog.append(yearLabel, fileLabel, textLabel, status, previewHost, actions);
    document.body.append(dialog);
  }
  function invalidatePreview() {
    if (unresolved) return;
    request = null;
    if (confirmBtn) confirmBtn.disabled = true;
  }
  function renderPreview(result) {
    previewHost.replaceChildren();
    if (result.errors?.length) {
      const list = node('ul', undefined, 'bulk-import-errors');
      for (const err of result.errors) {
        const li = node('li', `Row ${err.row + 1} (${err.code}): ${err.message}`, 'gsis-error');
        li.dataset.bulkImportError = String(err.row);
        list.append(li);
      }
      previewHost.append(list);
    }
    if (result.rows?.length) {
      const table = node('table');
      table.dataset.noTableTools = '';
      const head = table.createTHead().insertRow();
      ['Row', 'Title', 'Start', 'End', 'Type', 'Status', 'Lane', 'Venues'].forEach((h) => head.append(node('th', h)));
      const body = table.createTBody();
      for (const row of result.rows) {
        const tr = body.insertRow();
        [row.row + 1, row.StaffTitle, row.StartDate, row.EndDate, row.EventType, row.Status, row.LaneID || '', row.VenueID || ''].forEach((v) => tr.insertCell().textContent = String(v ?? ''));
      }
      const scroll = node('div', undefined, 'gsis-core-scroll');
      scroll.append(table);
      previewHost.append(scroll);
    }
  }
  async function openDialog() {
    if (!isAllowed()) throw Error('Current Calendar administrator access is required.');
    const session = await api.getSession();
    storageKey = `gsis-calendar-bulk-import:${session.schoolId}:${session.user.accountId}`;
    ensureDialog();
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      request = JSON.parse(stored);
      unresolved = true;
      yearInput.value = String(request.year);
      textInput.value = JSON.stringify(request.events, null, 2);
      yearInput.disabled = true;
      fileInput.disabled = true;
      textInput.disabled = true;
      previewBtn.disabled = true;
      confirmBtn.textContent = 'Retry original import';
      confirmBtn.disabled = false;
      receiptBtn.hidden = false;
      setStatus('The original bulk import is unconfirmed. Check its receipt or retry using the same operation.');
    } else {
      const selectedYear = $('yearSelect')?.value || String(new Date().getFullYear());
      if (!yearInput.value) yearInput.value = selectedYear;
      previewHost.replaceChildren();
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Confirm bulk import';
      receiptBtn.hidden = true;
      setStatus('Enter or load event rows and click Preview import. No events are saved before confirmation.');
    }
    if (!dialog.open) dialog.showModal();
  }
  async function runPreview() {
    if (unresolved || busy) return;
    const ticket = ++epoch;
    busy = true;
    previewBtn.disabled = true;
    confirmBtn.disabled = true;
    request = null;
    previewHost.replaceChildren();
    setStatus('Validating event rows…');
    try {
      const year = Number(yearInput.value);
      const events = parseEvents(textInput.value);
      const result = await api.request('calendar', '/action', {
        method: 'POST',
        body: { action: 'importEventsPreview', payload: { year, events } },
      });
      if (ticket !== epoch) return;
      renderPreview(result);
      if (!result.valid) {
        setStatus(`Found ${result.errorCount} validation error(s) in ${result.totalRows} row(s). Correct invalid rows and preview again.`, true);
        return;
      }
      request = {
        operationId: crypto.randomUUID(),
        year: result.year,
        events,
        previewDigest: result.previewDigest,
        expectedYearRevision: result.yearRevision,
      };
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm bulk import';
      setStatus(`Preview ready: ${result.validCount} event(s) for ${result.year} (revision ${result.yearRevision}). Confirm to import atomically.`);
    } catch (error) {
      if (ticket === epoch) setStatus(`${error.message} No events were imported.`, true);
    } finally {
      if (ticket === epoch) {
        busy = false;
        previewBtn.disabled = unresolved;
      }
    }
  }
  async function runApply() {
    if (!request || busy) return;
    const ticket = epoch;
    busy = true;
    confirmBtn.disabled = true;
    previewBtn.disabled = true;
    yearInput.disabled = true;
    fileInput.disabled = true;
    textInput.disabled = true;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      unresolved = true;
      receiptBtn.hidden = false;
      setStatus('Importing events…');
      const result = await api.request('calendar', '/action', {
        method: 'POST',
        body: { action: 'importEventsApply', payload: request },
      });
      if (ticket !== epoch) return;
      clearPending();
      previewHost.replaceChildren();
      setStatus(`Imported ${result.importedCount} event(s) for ${result.year}.`);
      $('refreshCalendarBtn')?.click();
    } catch (error) {
      if (ticket !== epoch) return;
      const statusCode = error?.status || error?.response?.status || 0;
      if (statusCode === 400 || statusCode === 403 || statusCode === 409) {
        clearPending();
        setStatus(`${error.message} Preview again before importing.`, true);
      } else {
        setStatus(`${error.message} The original operation is retained. Check its receipt or retry with the same operation.`, true);
        confirmBtn.textContent = 'Retry original import';
        confirmBtn.disabled = false;
      }
    } finally {
      if (ticket === epoch) busy = false;
    }
  }
  async function checkReceipt() {
    if (!request || busy) return;
    const ticket = epoch;
    receiptBtn.disabled = true;
    try {
      const result = await api.request('calendar', '/action', {
        method: 'POST',
        body: { action: 'eventMutationStatus', payload: { operationId: request.operationId } },
      });
      if (ticket !== epoch) return;
      if (result.state === 'SAVED') {
        clearPending();
        previewHost.replaceChildren();
        setStatus('The original bulk import committed.');
        $('refreshCalendarBtn')?.click();
      } else if (result.state === 'NOT_SAVED') {
        clearPending();
        setStatus('The original bulk import did not commit. Review and preview again.');
      } else {
        setStatus('The original bulk import is still unconfirmed. A retry uses its same operation identity.');
      }
    } catch (error) {
      if (ticket === epoch) setStatus(`${error.message} The original operation is retained.`, true);
    } finally {
      if (ticket === epoch) receiptBtn.disabled = false;
    }
  }
  function attachTrigger() {
    const toolbar = document.querySelector('#weeklyHost .weekly-toolbar');
    const existing = $('bulkImportEventsBtn');
    if (!isAllowed()) {
      existing?.remove();
      return;
    }
    if (!toolbar || existing) return;
    const btn = node('button', 'Bulk import events', 'secondary');
    btn.id = 'bulkImportEventsBtn';
    btn.type = 'button';
    btn.onclick = () => openDialog().catch((err) => alert(err.message));
    toolbar.append(btn);
  }
  new MutationObserver(() => queueMicrotask(attachTrigger)).observe(document.body, { childList: true, subtree: true });
  api.getSession().then(attachTrigger).catch(() => {});
  window.addEventListener('load', attachTrigger);
  window.addEventListener('gsis:capabilities', attachTrigger);
  window.addEventListener('gsis:clear-protected-state', () => {
    epoch++;
    dialog?.close();
    dialog?.remove();
    dialog = null;
    clearPending();
    storageKey = '';
    $('bulkImportEventsBtn')?.remove();
  });
})();
