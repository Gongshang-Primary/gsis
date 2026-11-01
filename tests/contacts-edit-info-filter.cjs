'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), { JSDOM } = require('jsdom');

(async () => {
  const dom = new JSDOM(fs.readFileSync('contacts-update/public/index.html', 'utf8'), {
    url: 'https://contacts.test', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window, doc = w.document, $ = selector => doc.querySelector(selector);
  const rows = () => [...doc.querySelectorAll('#dataGrid tbody tr')];
  const cell = (id, field) => $(`#dataGrid [data-person="${id}"][data-field="${field}"]`);
  const wait = async (condition, message) => {
    for (let n = 0; n < 200; n++) {
      if (condition()) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail(message);
  };
  w.matchMedia = () => ({ matches: false });
  w.confirm = () => true;
  let table = {
    editable: true, fields: ['TTb Name', 'Basic Name', 'Mobile No', 'Active'], lists: { Active: ['Y', 'N'] },
    rows: [
      { id: 'tan', values: ['Ｔａｎ  Mei Ling', 'Tan  Mei Ling', '90000001', 'Y'], computed: [true, false, false, false] },
      { id: 'alice', values: ['Alice Lim', 'Alice Lim', '90000002', 'Y'], computed: [true, false, false, false] },
      { id: 'bob', values: ['Bob Tan', 'Bob Tan', '90000003', 'Y'], computed: [true, false, false, false] }
    ]
  };
  const directory = () => ({
    user: { email: 'admin@gsps.edu.sg', roles: ['Admin'] }, access: [], groups: [],
    people: table.rows.map(row => ({ id: row.id, name: row.values[0], active: row.values[3], emails: { gsps: row.id + '@gsps.edu.sg' }, groups: [] }))
  });
  const response = data => ({ ok: true, status: 200, json: async () => data });
  let savedPayload, releaseReload, holdReload = false, reads = 0, recalculations = 0;
  w.fetch = async (url, options) => {
    const route = url.replace('/api/', '');
    if (route === 'config') return response({ configured: true, clientId: 'fixture' });
    if (route === 'session') return response({ ok: true });
    if (route === 'bootstrap') return response({ data: directory() });
    if (route === 'deployment') return response({ data: { available: true, assignments: [] } });
    if (route === 'data') {
      reads++;
      if (holdReload) await new Promise(resolve => { releaseReload = resolve; });
      return response({ data: structuredClone(table) });
    }
    if (route === 'save-data') {
      savedPayload = JSON.parse(options.body);
      for (const change of savedPayload.changes) {
        table.rows.find(row => row.id === change.id).values[table.fields.indexOf(change.field)] = change.value;
      }
      return response({ data: { saved: true, data: structuredClone(table) } });
    }
    if (route === 'recalculate-data') {
      recalculations++;
      return response({ data: { recalculated: 3, data: structuredClone(table), directory: directory() } });
    }
    throw Error('Unexpected fixture request: ' + url);
  };
  try {
    const run = code => vm.runInContext(code, dom.getInternalVMContext());
    run(fs.readFileSync('contacts-update/public/core.js', 'utf8').replace(/export /g, ''));
    run(fs.readFileSync('contacts-update/public/app.js', 'utf8').replace(/^import[^\n]+\n/, ''));
    await wait(() => !$('#app').classList.contains('hidden'), 'Contacts should sign in');
    $('[data-page="data"]').click();
    await wait(() => $('#dataGrid').getAttribute('aria-busy') === 'false', 'Initial load should finish');
    assert.equal(rows().length, 3);
    assert.match($('#dataStatus').textContent, /Ready · 3/, 'Unfiltered loading should retain its completion status');
    assert.equal(cell('alice', 1).readOnly, false, 'Admin cells should be editable after loading');
    assert.equal(cell('alice', 0).readOnly, true, 'Computed TTb names should remain read-only');
    assert.equal(cell('alice', 3).disabled, false, 'Editable selects should unlock too');

    const filter = $('#ttbFilter');
    const search = async (value, count) => {
      filter.value = value;
      filter.dispatchEvent(new w.Event('input', { bubbles: true }));
      await wait(() => rows().length === count, 'Typing should apply the TTb name filter');
      assert.match($('#dataStatus').textContent, new RegExp(`Showing ${count} of 3 staff`));
    };
    filter.value = 'tAn';
    filter.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal(rows().length, 3, 'Input should defer the grid update until the debounce');
    await wait(() => rows().length === 2, 'Partial case-insensitive matching should show both Tan names');
    assert.deepEqual(rows().map(row => row.querySelector('[data-person]').dataset.person), ['tan', 'bob']);
    assert.match($('#dataStatus').textContent, /Showing 2 of 3 staff/);
    await search('  ＴＡＮ　ｍｅｉ  ', 1);
    assert.equal(cell('tan', 1).value, 'Tan  Mei Ling', 'Matching should normalize width and collapse internal spaces');

    // Reload must apply the retained filter only after clearing the loading lock.
    holdReload = true;
    $('#reloadData').click();
    await wait(() => !!releaseReload, 'Reload should request the complete staff dataset');
    assert.equal($('#dataGrid').getAttribute('aria-busy'), 'true');
    assert.equal(cell('tan', 1).readOnly, true, 'The preview must stay locked during Reload');
    holdReload = false;
    releaseReload();
    await wait(() => $('#dataGrid').getAttribute('aria-busy') === 'false', 'Reload should finish');
    assert.equal(reads, 2);
    assert.equal(rows().length, 1, 'Reload should reapply the retained filter');
    assert.equal(cell('tan', 1).readOnly, false, 'Filtered Admin cells must be editable after Reload');
    assert.equal(cell('tan', 3).disabled, false);
    assert.match($('#dataStatus').textContent, /Showing 1 of 3 staff/);

    filter.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(filter.value, '');
    assert.equal(rows().length, 3, 'Escape should immediately restore all staff');
    cell('alice', 1).value = 'Alice Updated';
    cell('alice', 1).dispatchEvent(new w.Event('input', { bubbles: true }));
    await search('tan', 2);
    assert.equal(cell('alice', 1), null, 'Alice should be hidden without losing her draft');
    cell('bob', 2).value = '9123 4567';
    cell('bob', 2).dispatchEvent(new w.Event('input', { bubbles: true }));
    $('#saveData').click();
    await wait(() => savedPayload && !$('#saveData').disabled, 'Save should complete');
    assert.deepEqual(savedPayload.changes, [
      { id: 'alice', field: 'Basic Name', expected: 'Alice Lim', value: 'Alice Updated' },
      { id: 'bob', field: 'Mobile No', expected: '90000003', value: '91234567' }
    ], 'Save must include both hidden and visible edits');
    assert.deepEqual(savedPayload.additions, []);

    await search('missing-staff', 0);
    filter.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(filter.value, '');
    assert.equal(rows().length, 3);
    assert.equal(cell('alice', 1).value, 'Alice Updated', 'The saved hidden edit should remain visible after clearing');
    await search('tan', 2);
    $('#recalculateData').click();
    await wait(() => recalculations === 1 && !$('#recalculateData').disabled, 'Recalculate should finish');
    assert.equal(rows().length, 2, 'Recalculate should preserve the view filter');
    filter.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(rows().length, 3, 'Recalculate should retain the complete dataset');
    await search('tan', 2);
    $('#addContactRow').click();
    assert.equal(filter.value, '', 'Adding a row should clear the filter so the new row is visible');
    assert.equal(rows().length, 4, 'Adding a row must retain every existing staff row');
    assert.equal(doc.activeElement.dataset.field, '1', 'The new Basic Name cell should receive focus');
    assert.equal(doc.activeElement.readOnly, false);
    console.log('PASS Contacts TTb filter: real input debounce, partial/NFKC/space matching, Reload unlock, full hidden/visible save payload, counts, Escape, Recalculate and add row.');
  } finally {
    w.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
