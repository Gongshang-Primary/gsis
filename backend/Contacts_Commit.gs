/* GSIS_CONTACTS_COMMIT_BEGIN */
// Prepare every range and all metadata before a Contacts journal becomes durable.
// A prepared stage may be attempted once. Recovery prepares a new stage from the
// same saved request; an API exception never triggers a native fallback or retry.
function contactPrepareValues_(ss, blocks) {
  const fail = message => { const error = new Error(message); error.status = 400; throw error; };
  if (!Array.isArray(blocks)) fail('Invalid Contacts write plan.');
  const apiValues = typeof Sheets !== 'undefined' && Sheets.Spreadsheets && Sheets.Spreadsheets.Values;
  const entries = [], names = new Map();
  const column = value => { let text = ''; for (; value; value = Math.floor((value - 1) / 26)) text = String.fromCharCode(65 + (value - 1) % 26) + text; return text; };
  for (const block of blocks) {
    if (!block || !block.sheet || !Array.isArray(block.writes)) fail('Invalid Contacts write plan.');
    for (const write of block.writes) {
      if (!write || !Array.isArray(write.values)) fail('Invalid Contacts write values.');
      if (!write.values.length) continue;
      if (!Number.isInteger(write.row) || write.row < 1 || !Number.isInteger(write.col) || write.col < 1 || !Array.isArray(write.values[0]) || !write.values[0].length) fail('Invalid Contacts write range.');
      const width = write.values[0].length;
      const values = write.values.map(row => {
        if (!Array.isArray(row) || row.length !== width) fail('Contacts write values must form a rectangle.');
        return row.map(value => {
          if (value !== null && typeof value !== 'string' && typeof value !== 'boolean' && !(typeof value === 'number' && Number.isFinite(value))) fail('Invalid Contacts cell value.');
          return value;
        });
      });
      if (!names.has(block.sheet)) names.set(block.sheet, block.sheet.getName());
      const range = "'" + names.get(block.sheet).replace(/'/g, "''") + "'!" + column(write.col) + write.row + ':' + column(write.col + width - 1) + (write.row + values.length - 1);
      entries.push({sheet: block.sheet, row: write.row, col: write.col, values, range});
    }
  }
  const data = entries.map(entry => ({range: entry.range, majorDimension: 'ROWS', values: entry.values.map(row => row.map(value => typeof value === 'string' && /^'[=+@-]/.test(value) ? value.slice(1) : value))}));
  const request = {valueInputOption: 'RAW', includeValuesInResponse: false, data};
  // JSON UTF-16 length times three is a conservative UTF-8 upper bound,
  // including surrogate pairs. Refuse the entire stage before any write.
  const bytes = JSON.stringify(request).length * 3;
  if (bytes > 2000000) fail('This Contacts save is too large. Save fewer changes at once.');
  const spreadsheetId = entries.length ? (ss || entries[0].sheet.getParent()).getId() : null;
  const native = apiValues ? [] : entries.map(entry => ({range: entry.sheet.getRange(entry.row, entry.col, entry.values.length, entry.values[0].length), values: entry.values}));
  let attempted = false;
  return {
    mode: apiValues ? 'sheets-api' : 'native', rangeCount: entries.length, bytes,
    flush() {
      if (attempted) throw new Error('This prepared Contacts write has already been attempted. Check its saved request before retrying.');
      attempted = true;
      if (!entries.length) return;
      if(typeof contactTrace_!=='undefined'&&contactTrace_){contactTrace_.preparedIO=contactTrace_.preparedIO||{requests:0,ranges:0,bytesUpperBound:0};contactTrace_.preparedIO.requests++;contactTrace_.preparedIO.ranges+=entries.length;contactTrace_.preparedIO.bytesUpperBound+=bytes;}
      if (apiValues) return apiValues.batchUpdate(request, spreadsheetId);
      for (const entry of native) entry.range.setValues(entry.values);
      SpreadsheetApp.flush();
    }
  };
}
/* GSIS_CONTACTS_COMMIT_END */
