const assert = require('assert/strict'), crypto = require('crypto');
const fixture = require('./contacts502-fixture.js');

function addition(suffix = '') {
  return {id: 'contact-' + crypto.randomUUID(), values: {'Basic Name': 'New contact ' + suffix, 'Statutory Name': 'New contact ' + suffix, 'GSPS Alias (@gsps.edu.sg)': 'new_contact' + suffix, 'Mobile No': '81234567', Role: 'Teacher', Active: 'Y'}};
}

// The API mock internally reuses fake Range handles to represent its remote
// storage. Exclude those internals while rejecting all application calls into
// SpreadsheetApp after its first API write during a save or recovery request.
function guarded() {
  const f = fixture(), book = f.ctx.SpreadsheetApp.openById();
  let writing = false, insideAPI = false, active = false;
  const lateNative = [], batches = [], readAfterWrite = [];
  function check(name) {
    if (active && writing && !insideAPI) { lateNative.push(name); throw Error('Native spreadsheet access after API write: ' + name); }
  }
  const rangeMethods = ['getRow', 'getValues', 'getDisplayValues', 'getFormulas', 'setValues', 'setValue', 'createTextFinder'];
  for (const [name, sheet] of f.sheets) {
    for (const method of ['getName', 'getParent', 'getLastRow', 'getLastColumn', 'getMaxRows', 'getMaxColumns', 'getDataRange', 'insertRowsAfter', 'appendRow']) {
      if (!sheet[method]) continue;
      const original = sheet[method].bind(sheet);
      sheet[method] = (...args) => { check(name + '.' + method); return original(...args); };
    }
    const originalRange = sheet.getRange.bind(sheet);
    sheet.getRange = (...args) => {
      check(name + '.getRange'); const range = originalRange(...args);
      for (const method of rangeMethods) {
        if (!range[method]) continue; const original = range[method].bind(range);
        range[method] = (...values) => { check(name + '.range.' + method); return original(...values); };
      }
      return range;
    };
  }
  for (const method of ['getId', 'getSheetByName', 'getSheets', 'insertSheet']) {
    const original = book[method].bind(book); book[method] = (...args) => { check('book.' + method); return original(...args); };
  }
  for (const method of ['openById', 'flush']) {
    const original = f.ctx.SpreadsheetApp[method].bind(f.ctx.SpreadsheetApp); f.ctx.SpreadsheetApp[method] = (...args) => { check('SpreadsheetApp.' + method); return original(...args); };
  }
  const api = f.ctx.Sheets.Spreadsheets.Values, get = api.batchGet, update = api.batchUpdate;
  api.batchGet = (...args) => {
    if (active && writing) readAfterWrite.push(args[1].ranges);
    insideAPI = true; try { return get(...args); } finally { insideAPI = false; }
  };
  api.batchUpdate = (...args) => {
    writing = true; batches.push(JSON.parse(JSON.stringify(args[0].data)));
    insideAPI = true; try { return update(...args); } finally { insideAPI = false; }
  };
  function post(...args) {
    writing = false; active = true; lateNative.length = batches.length = readAfterWrite.length = 0;
    try { return f.post(...args); } finally { active = false; }
  }
  return {...f, post, lateNative, batches, readAfterWrite};
}

function assertPrepared(f) {
  assert.deepEqual(f.lateNative, []);
  assert.deepEqual(f.readAfterWrite, [], 'Save acknowledgements use the prepared projection, not a reread after writing');
  assert.equal(f.getHeld(), false);
}
const journalRow = f => f.sheets.get('contact_save_journal').data.at(-1);
const contactsWithId = (f, id) => f.sheets.get('contacts').data.filter(row => row[17] === id);

// Mixed edits plus addition reproduce the latest reported shape. Row allocation,
// journal snapshot metadata and the complete commit must be prepared up front.
{
  const f = guarded(), item = addition('mixed'), request = {requestId: crypto.randomUUID(), changes: [{id: 'staff-1', field: 'EXT', expected: '', value: '314'}, {id: 'staff-1', field: 'GSPS Alias (@gsps.edu.sg)', expected: 'person1', value: 'updated_alias'}], additions: [item]};
  const result = f.post('saveData', request); assert.equal(result.ok, true, JSON.stringify(result)); assertPrepared(f);
  assert.equal(result.data.saved, true); assert.equal(f.batches.length, 2, 'one durable journal batch, one complete commit');
  const final = f.batches[1]; assert.equal(final.at(-1).values[0][0], 'Applied');
  assert.ok(final.some(entry => entry.range.startsWith("'contacts'!") && entry.values.flat().includes(item.id)), 'new Staff ID belongs to the same atomic commit');
  assert.equal(contactsWithId(f, item.id).length, 1); assert.equal(contactsWithId(f, 'staff-1')[0][7], '314');
  assert.equal(f.stats.nativeWrites, 0); assert.equal(f.stats.flush, 0);
}

// More than 100 final ranges must not be split: the Applied marker and every
// changed contact are committed by one API request.
{
  const f = guarded(), changes = Array.from({length: 80}, (_, i) => ({id: 'staff-' + i, field: 'EXT', expected: '', value: String(1000 + i)}));
  const result = f.post('saveData', {requestId: crypto.randomUUID(), changes}); assert.equal(result.ok, true, JSON.stringify(result)); assertPrepared(f);
  assert.equal(f.batches.length, 2); assert.ok(f.batches[1].length > 100); assert.equal(f.batches[1].at(-1).values[0][0], 'Applied');
  for (let i = 0; i < 80; i++) assert.equal(contactsWithId(f, 'staff-' + i)[0][7], String(1000 + i));
}

// An API failure after it committed everything cannot cause another contact or
// another write when the same original request is retried.
{
  const f = guarded(), item = addition('lost'), request = {requestId: crypto.randomUUID(), changes: [], additions: [item]};
  f.setMode('lostAck'); const lost = f.post('saveData', request); assert.equal(lost.ok, false); assertPrepared(f); assert.equal(journalRow(f)[4], 'Applied');
  const receipt = f.post('saveReceipt', {requestId: request.requestId}); assert.equal(receipt.data.saved, true);
  const retried = f.post('saveData', request); assert.equal(retried.data.saved, true); assert.equal(retried.data.duplicate, true); assertPrepared(f);
  assert.equal(f.batches.length, 0); assert.equal(contactsWithId(f, item.id).length, 1); assert.equal(f.sheets.get('contact_save_journal').data.length, 2);
}

// A legacy partial write can include an already updated existing cell and a
// reserved addition ID. Rearranging rows between attempts must not redirect the
// recovery to someone else: lookup is by fresh Staff ID, not the old row number.
{
  const f = guarded(), item = addition('legacy'), payload = {changes: [{id: 'staff-1', field: 'EXT', expected: '', value: '271'}, {id: 'staff-1', field: 'GSPS Alias (@gsps.edu.sg)', expected: 'person1', value: 'moved_person'}], additions: [item]};
  const key = f.seedPending(payload), sheet = f.sheets.get('contacts');
  sheet.data[2][7] = '271'; sheet.data[182][17] = item.id;
  [sheet.data[2], sheet.data[75]] = [sheet.data[75], sheet.data[2]];
  [sheet.formulas[2], sheet.formulas[75]] = [sheet.formulas[75], sheet.formulas[2]];
  const displaced = JSON.stringify(sheet.data[2]);
  const result = f.post('recoverSave', key, 'other-admin@gsps.edu.sg'); assert.equal(result.ok, true, JSON.stringify(result)); assertPrepared(f);
  assert.equal(f.batches.length, 1, 'existing Pending recovery uses one complete commit');
  assert.equal(f.batches[0].at(-1).values[0][0], 'Applied');
  assert.equal(contactsWithId(f, 'staff-1')[0][3], 'moved_person'); assert.equal(contactsWithId(f, 'staff-1')[0][7], '271');
  assert.equal(JSON.stringify(sheet.data[2]), displaced); assert.equal(contactsWithId(f, item.id).length, 1); assert.equal(contactsWithId(f, item.id)[0][5], item.values['Basic Name']);
  assert.equal(journalRow(f)[7], 'other-admin@gsps.edu.sg'); assert.equal(journalRow(f)[4], 'Applied');
  const again = f.post('recoverSave', key, 'other-admin@gsps.edu.sg'); assert.equal(again.data.duplicate, true); assert.equal(f.batches.length, 0); assertPrepared(f);
}

console.log('PASS Contacts 503 save integration: no native/API reads after writing, mixed save, >100 ranges in one commit, lost acknowledgement, legacy partial recovery, fresh Staff ID row mapping, and no duplicate rows or retries.');
