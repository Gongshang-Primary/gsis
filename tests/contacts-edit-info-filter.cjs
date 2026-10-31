'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), { JSDOM } = require('jsdom');

(async () => {
  const dom = new JSDOM(fs.readFileSync('contacts-update/public/index.html', 'utf8'), {
    url: 'https://contacts.test',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });

  const w = dom.window, doc = w.document, $ = q => doc.querySelector(q);
  Object.defineProperty(w, 'crypto', { value: { randomUUID: () => 'uuid-' + Math.random() }, configurable: true, writable: true });
  w.matchMedia = () => ({ matches: false });

  let savedPayload = null;
  w.fetch = async (url, options) => {
    const route = url.replace('/api/', '');
    if (route === 'config') return { ok: true, json: async () => ({ configured: true, clientId: 'mock', preview: false }) };
    if (route === 'session') return { ok: true, status: 200, json: async () => ({ ok: true }) };
    if (route === 'bootstrap') return { ok: true, json: async () => ({
      data: {
        user: { email: 'admin@gsps.edu.sg', roles: ['Admin'] },
        people: [
          { id: 'c1', name: 'Alice Smith', emails: { gsps: 'alice@gsps.edu.sg' }, groups: [] },
          { id: 'c2', name: 'Bob Jones', emails: { gsps: 'bob@gsps.edu.sg' }, groups: [] },
          { id: 'c3', name: 'Charlie Brown', emails: { gsps: 'charlie@gsps.edu.sg' }, groups: [] }
        ],
        access: [],
        groups: []
      }
    }) };
    if (route === 'deployment') return { ok: true, json: async () => ({ data: { available: true, assignments: [] } }) };
    if (route === 'data') return { ok: true, json: async () => ({
      data: {
        editable: true,
        fields: ['TTb Name', 'Active'],
        lists: {},
        rows: [
          { id: 'c1', values: ['Alice Smith', 'Y'], computed: [false, false] },
          { id: 'c2', values: ['Bob Jones', 'Y'], computed: [false, false] },
          { id: 'c3', values: ['Charlie Brown', 'Y'], computed: [false, false] }
        ]
      }
    }) };
    if (route === 'save-receipt') return { ok: true, json: async () => ({ data: { writing: false, saved: true } }) };
    if (route === 'save-data') {
      savedPayload = JSON.parse(options.body);
      return { ok: true, json: async () => ({ data: { saved: true, data: {
        editable: true,
        fields: ['TTb Name', 'Active'],
        lists: {},
        rows: [
          { id: 'c1', values: ['Alice Changed', 'Y'], computed: [false, false] },
          { id: 'c2', values: ['Bob Jones', 'Y'], computed: [false, false] },
          { id: 'c3', values: ['Charlie Brown', 'Y'], computed: [false, false] }
        ]
      } } }) };
    }
    throw Error('Unhandled fetch: ' + url);
  };

  const ctx = dom.getInternalVMContext();
  const run = code => vm.runInContext(code, ctx);

  run(`
    // Define GSISfetch so it uses our mock fetch
    window.GSISfetch = window.fetch;
  `);

  run(fs.readFileSync('contacts-update/public/core.js', 'utf8').replace(/export function/g, 'function').replace(/export const/g, 'const'));
  run(fs.readFileSync('contacts-update/public/app.js', 'utf8').replace(/import.*?from.*?;/g, ''));

  const wait = async (fn) => {
    for (let n = 0; n < 400; n++) {
      if (fn()) return;
      await new Promise(r => setTimeout(r, 10));
    }
    throw Error('Timed out waiting for condition');
  };

  await wait(() => !$('#app').classList.contains('hidden'));

  $('[data-page="data"]').click();

  await wait(() => $('#dataGrid tbody') && $('#dataGrid tbody').querySelectorAll('tr').length === 3);

  assert.strictEqual($('#dataGrid tbody').querySelectorAll('tr').length, 3);

  // 1. Edit a cell for Alice
  const aliceInput = $('#dataGrid [data-person="c1"][data-field="0"]');
  aliceInput.value = 'Alice Changed';
  aliceInput.dispatchEvent(new w.Event('input'));

  // 2. Filter by "bob  " (tests NFKC / spaces if implemented)
  const filterInput = $('#ttbFilter');
  filterInput.value = 'bob  ';
  filterInput.dispatchEvent(new w.Event('input'));

  run('renderData()');

  assert.strictEqual($('#dataGrid tbody').querySelectorAll('tr').length, 1, 'Filter should show 1 row');
  assert.match($('#dataStatus').textContent, /Showing 1 of 3 staff/, 'Status should show "Showing 1 of 3 staff"');

  // 3. Save
  $('#saveData').click();

  await wait(() => savedPayload !== null);

  assert.strictEqual(savedPayload.changes[0].id, 'c1', 'Saved payload must include Alice, even if she is hidden');
  assert.strictEqual(savedPayload.changes[0].value, 'Alice Changed', 'Saved payload must have the correct edited value');

  // 4. Test Escape key clears the filter
  filterInput.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));

  assert.strictEqual(filterInput.value, '', 'Escape should clear filter box');
  assert.strictEqual($('#dataGrid tbody').querySelectorAll('tr').length, 3, 'Filter should be cleared and show all 3 rows');

  console.log('DOM test passed');
})().catch(e => { console.error(e); process.exit(1); });
