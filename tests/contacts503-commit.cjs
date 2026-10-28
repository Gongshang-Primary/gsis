const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('backend/Contacts_Commit.gs', 'utf8');

function fixture({api = true, failAPI = false} = {}) {
  let executing = false;
  const calls = {metadata: [], api: [], native: [], flush: 0};
  const metadata = (name, value) => { assert.equal(executing, false, 'Native metadata accessed while executing: ' + name); calls.metadata.push(name); return value; };
  const book = {getId: () => metadata('book.id', 'book-503')};
  const sheet = {
    getName: () => metadata('sheet.name', "Contacts' records"),
    getParent: () => metadata('sheet.parent', book),
    getRange(row, col, height, width) {
      metadata('sheet.range', null);
      return {setValues(values) { assert.equal(executing, true); calls.native.push({row, col, height, width, values}); }};
    }
  };
  const context = {SpreadsheetApp: {flush() { assert.equal(executing, true); calls.flush++; }}};
  if (api) context.Sheets = {Spreadsheets: {Values: {batchUpdate(request, id) { assert.equal(executing, true); calls.api.push({request, id}); if (failAPI) throw Error('Simulated API failure after uncertain write'); return {updated: true}; }}}};
  vm.createContext(context); vm.runInContext(source, context);
  return {book, sheet, calls, prepare: blocks => context.contactPrepareValues_(book, blocks), prepareNoBook: blocks => context.contactPrepareValues_(null, blocks), execute(stage) { executing = true; try { return stage.flush(); } finally { executing = false; }}};
}

// Every contact patch and the Applied marker must share one request even when
// there are more than the shared SheetsIO helper's usual 100 ranges.
{
  const f = fixture(), writes = Array.from({length: 150}, (_, i) => ({row: i + 2, col: 28, values: [[i === 149 ? 'Applied' : 'Contact ' + i]]}));
  const stage = f.prepare([{sheet: f.sheet, writes}]);
  assert.equal(stage.mode, 'sheets-api'); assert.equal(stage.rangeCount, 150);
  assert.equal(f.calls.metadata.filter(x => x === 'sheet.name').length, 1);
  assert.equal(f.calls.api.length, 0); assert.equal(f.calls.native.length, 0);
  assert.equal(f.execute(stage).updated, true);
  assert.equal(f.calls.api.length, 1); assert.equal(f.calls.api[0].id, 'book-503');
  const request = f.calls.api[0].request;
  assert.equal(request.data.length, 150); assert.equal(request.valueInputOption, 'RAW'); assert.equal(request.includeValuesInResponse, false);
  assert.equal(request.data[0].range, "'Contacts'' records'!AB2:AB2");
  assert.equal(request.data.at(-1).values[0][0], 'Applied');
  assert.equal(f.calls.flush, 0); assert.equal(f.calls.native.length, 0);
  assert.throws(() => f.execute(stage), /already been attempted/); assert.equal(f.calls.api.length, 1);
}

// Capture the escaped inputs and workbook metadata before execute. Later caller
// changes cannot replace the already prepared commit payload.
{
  const f = fixture(), raw = ["'=SUM(A1:A2)", "'+123", "'-123", "'@alias", "'plain", 'plain', true, 0, null];
  const writes = [{row: 2, col: 1, values: [raw]}], stage = f.prepareNoBook([{sheet: f.sheet, writes}]);
  raw[0] = 'tampered'; writes[0].row = 999;
  f.execute(stage);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.api[0].request.data[0].values[0])), ['=SUM(A1:A2)', '+123', '-123', '@alias', "'plain", 'plain', true, 0, null]);
  assert.equal(f.calls.api[0].request.data[0].range, "'Contacts'' records'!A2:I2");
  assert.ok(f.calls.metadata.includes('sheet.parent'));
}

// The full body budget is checked before API/native writes and before creating
// native Range handles. Multibyte data is conservatively bounded as well.
for (const api of [true, false]) {
  const f = fixture({api});
  assert.throws(() => f.prepare([{sheet: f.sheet, writes: [{row: 1, col: 1, values: [['\u6f22'.repeat(700000)]]}]}]), /too large/);
  assert.equal(f.calls.api.length, 0); assert.equal(f.calls.native.length, 0); assert.equal(f.calls.flush, 0);
  assert.equal(f.calls.metadata.includes('sheet.range'), false);
}

// No retry or native fallback can follow an API exception with unknown outcome.
{
  const f = fixture({failAPI: true}), stage = f.prepare([{sheet: f.sheet, writes: [{row: 2, col: 1, values: [['Pending']]}]}]);
  assert.throws(() => f.execute(stage), /Simulated API failure/);
  assert.equal(f.calls.api.length, 1); assert.equal(f.calls.native.length, 0); assert.equal(f.calls.flush, 0);
  assert.throws(() => f.execute(stage), /already been attempted/); assert.equal(f.calls.api.length, 1);
}

// Native fallback retains safeCell escapes and completes planned writes in
// order, with Applied last and one explicit flush at the boundary.
{
  const f = fixture({api: false}), writes = [{row: 2, col: 1, values: [["'=not a formula", "'-literal"]]}, {row: 8, col: 5, values: [['Applied']]}];
  const stage = f.prepare([{sheet: f.sheet, writes}]);
  assert.equal(stage.mode, 'native'); assert.equal(f.calls.metadata.filter(x => x === 'sheet.range').length, 2);
  writes[0].values[0][0] = 'tampered'; f.execute(stage);
  assert.equal(f.calls.api.length, 0); assert.equal(f.calls.native.length, 2); assert.equal(f.calls.flush, 1);
  assert.equal(f.calls.native[0].values[0][0], "'=not a formula"); assert.equal(f.calls.native[1].values[0][0], 'Applied');
}

{
  const f = fixture(), empty = f.prepare([]); f.execute(empty);
  assert.equal(empty.rangeCount, 0); assert.equal(f.calls.metadata.length, 0); assert.equal(f.calls.api.length, 0); assert.equal(f.calls.flush, 0);
  assert.throws(() => f.prepare([{sheet: f.sheet, writes: [{row: 1, col: 1, values: [['one'], ['two', 'three']]}]}]), /rectangle/);
  assert.throws(() => f.prepare([{sheet: f.sheet, writes: [{row: 0, col: 1, values: [['value']]}]}]), /range/);
  assert.throws(() => f.prepare([{sheet: f.sheet, writes: [{row: 1, col: 1, values: [[Infinity]]}]}]), /cell value/);
}

console.log('PASS Contacts 503 prepared commit: 150 ranges in one atomic API request, precomputed metadata, immutable values, conservative body limit, RAW escaping, no retry or fallback after API error, and ordered native fallback.');
