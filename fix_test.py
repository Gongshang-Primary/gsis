with open('tests/contacts-edit-info-filter.cjs', 'w') as f:
    f.write('''const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const vm = require('vm');

async function runTest() {
  const dom = new JSDOM(fs.readFileSync('contacts-update/public/index.html', 'utf8'), {
    url: 'https://contacts.example',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });

  const w = dom.window;
  w.crypto = { randomUUID: () => 'uuid-' + Math.random() };
  let fetchPaths = [];
  let savedPayload = null;
  w.fetch = async (url, options) => {
    fetchPaths.push(url);
    if (url === '/api/config') return { json: async () => ({ configured: true, clientId: 'mock', preview: false }) };
    if (url === '/api/session') return { json: async () => ({ ok: true }) };
    if (url === '/api/bootstrap') return { json: async () => ({
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
    if (url === '/api/deployment') return { json: async () => ({ data: { available: true, assignments: [] } }) };
    if (url === '/api/data') return { json: async () => ({
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
    if (url === '/api/save-data') {
      savedPayload = JSON.parse(options.body);
      return { json: async () => ({ data: { saved: true, data: {
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
    return { ok: true, json: async () => ({}) };
  };

  const ctx = dom.getInternalVMContext();
  vm.runInContext(fs.readFileSync('contacts-update/public/core.js', 'utf8').replace(/export function/g, 'function').replace(/export const/g, 'const'), ctx);
  vm.runInContext(fs.readFileSync('contacts-update/public/app.js', 'utf8').replace(/import.*?from.*?;/g, ''), ctx);

  // Wait for bootstrap and data load
  await new Promise(r => setTimeout(r, 100));

  const doc = w.document;

  // Click on Edit Info tab
  doc.querySelector('[data-page="data"]').click();
  await new Promise(r => setTimeout(r, 100)); // wait for data to load

  // We should have 3 rows initially
  const tbody = doc.querySelector('#dataGrid tbody');
  assert.strictEqual(tbody.querySelectorAll('tr').length, 3, 'Should render 3 initial rows');

  // 1. Edit a cell
  const aliceInput = doc.querySelector('[data-person="c1"][data-field="0"]');
  aliceInput.value = 'Alice Changed';
  aliceInput.dispatchEvent(new w.Event('input'));

  // 2. Filter by typing "bob"
  const filterInput = doc.querySelector('#ttbFilter');
  filterInput.value = 'bob';
  filterInput.dispatchEvent(new w.Event('input'));

  // Wait for debounce (150ms)
  await new Promise(r => setTimeout(r, 200));

  // Should only show Bob
  assert.strictEqual(tbody.querySelectorAll('tr').length, 1, 'Filter should show 1 row');
  assert(doc.querySelector('#dataStatus').textContent.includes('Showing 1 of 3 staff'), 'Status should show "Showing 1 of 3 staff"');

  // 3. Save
  doc.querySelector('#saveData').click();
  await new Promise(r => setTimeout(r, 100));

  // Verify payload includes Alice's change even though she was filtered away
  assert.ok(savedPayload, 'Save should have been called');
  assert.strictEqual(savedPayload.changes[0].id, 'c1');
  assert.strictEqual(savedPayload.changes[0].value, 'Alice Changed');

  // 4. Test Escape clears filter
  filterInput.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  await new Promise(r => setTimeout(r, 100));
  assert.strictEqual(filterInput.value, '', 'Escape should clear filter box');
  assert.strictEqual(tbody.querySelectorAll('tr').length, 3, 'Filter should be cleared and show all 3 rows');

  console.log('All tests passed');
}

runTest().catch(e => { console.error(e); process.exit(1); });
''')
