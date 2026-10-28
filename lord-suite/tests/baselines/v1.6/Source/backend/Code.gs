/**
 * LORD Suite v1.6 LTS — Consolidated Google Workspace Backend
 * =======================================================
 *
 * LANDMARK ARCHITECTURE
 * ---------------------
 * One Apps Script project / one Code.gs / one web-app deployment.
 * This project is intended to be container-bound to the TRANSACTION workbook,
 * but all runtime access deliberately uses explicit Spreadsheet IDs so web-app
 * and time-trigger executions never depend on an active spreadsheet context.
 *
 * Data stores retained from the pre-v1 development line (NO schema migration for v1):
 *   1) Transaction workbook: Bookings, Sessions, Session Trolleys, Event Log,
 *      contacts, admins.
 *   2) Inventory / Reference workbook: teacher, classes, subjects, trolleys,
 *      timetable.
 *   3) Google Drive photo folder.
 *   4) Google Drive REIGN archive folder.
 *
 * FRONTENDS
 * ---------
 * LORD, OVERLORD and STARLORD all call this single web-app deployment through
 * their Cloudflare Workers. The production /exec URL is intentionally embedded
 * in each Worker for a clean, low-maintenance deployment; Workers still send
 * the matching proxy secret.
 *
 * CONFIGURATION POLICY — v1
 * ---------------------------
 * User-maintained backend configuration is intentionally embedded below in
 * Code.gs for ease of maintenance. Script Properties are NOT configuration.
 * They are reserved only for small pieces of AUTO-MANAGED RUNTIME STATE such
 * as idempotency records, deferred work and monitor/sweep state.
 *
 * Consequence: after v1 cutover there should be NO manually maintained Script
 * Properties such as LORD_PROXY_SECRET, booking peppers, STARLORD IDs/secrets,
 * or old OVERLORD configuration state. Use cleanLegacyScriptPropertiesV1() once after all
 * three v1 Cloudflare frontends have been confirmed live.
 *
 * SECURITY / DISTRIBUTION NOTE
 * ----------------------------
 * This source deliberately contains operational credentials because the owner
 * chose a self-contained deployment model. Therefore Code.gs, the backend ZIP
 * and the full release ZIP are credential-bearing artefacts. Do not publish or
 * share them outside the trusted maintenance group.
 *
 * RUNTIME SCRIPT PROPERTIES — STABLE INTERNAL KEYS
 * --------------------------------------------------
 *   LORD_V3_IDEMPOTENCY_<sha256>  - durable request replay protection, 7 days
 *   LORD_V3_SECONDARY_<uuid>       - deferred email/audit/link tasks, 7 days
 *   LORD_V3_BOOKING_END_ALERTED    - currently-open overdue sessions alerted
 *   LORD_V3_FORCE_RETURN_SWEEP_DATE- date of last 18:00 administrative sweep
 *   LORD_V3_FORCE_RETURN_PENDING_ALERT - Telegram retry payload, if needed
 *   LORD_V3_MONITOR_BUCKET         - prevents duplicate five-minute monitor run
 *   LORD_V3_PENDING_ALERT_EVENTS   - temporary audit events awaiting Sheet lock
 *   LORD_V14_MAINTENANCE_WARNING   - latest background storage failure marker
 *
 * The LORD_V3_* property names are intentionally retained as stable internal
 * storage identifiers during the v1 formalisation. Renaming them would discard
 * in-flight idempotency/alert state during cutover. They are not public version
 * labels and can remain while the product itself is formally v1.
 *
 * These runtime entries are pruned/overwritten by the application. They are
 * not deployment settings and should normally be left alone.
 *
 * KEY SAFETY INVARIANTS
 * ---------------------
 * - Collection/Return evidence is staged before the short Sheet commit lock.
 * - PENDING_COLLECTION is recoverable and blocks double allocation.
 * - Request idempotency prevents duplicate physical transactions on retry.
 * - Runtime schema checks are read-only; only explicit migration/setup helpers
 *   may alter workbook structure.
 * - REIGN cannot close while unresolved physical custody exists, cannot close
 *   before the configured safe hour, and preserves future-dated transactions.
 * - The 18:00 force return is an ADMINISTRATIVE close, not evidence of physical
 *   return; it does not manufacture return quantities/photos/declarations.
 *
 * LTS v1.6 DEPLOYMENT
 * -------------------
 * 1) Back up saved Code.gs and confirm the existing Sheets v4 service remains.
 * 2) Replace Code.gs during a quiet window. Preserve current deployment settings.
 * 3) Run selfTestLORDV16(); it reads configuration and never writes test records.
 * 4) Publish a new version of the EXISTING web-app deployment.
 * 5) Deploy the three v1.6 Cloudflare packages after the backend is ready.
 * 6) Verify Booking, Collect, Return and Reload using the deployment checklist.
 * Existing triggers remain valid; do not rerun setup, migration or REIGN.
 *
 * LTS v1.6 keeps the formal v1 schema. Existing PENDING_COLLECTION records can
 * be resumed; new Collection state is committed atomically across all three
 * tables. Primary transaction updates change only their differing cells.
 */

var LORD_CONFIG = Object.freeze({
  VERSION: '1.6',
  RELEASE_CHANNEL: 'LTS',

  // ---- Static deployment identity / storage ----
  // Transaction workbook (this Apps Script project may be bound here, but
  // runtime code still opens it explicitly by ID for deterministic triggers).
  SPREADSHEET_ID: 'REPLACE_SPREADSHEET_ID',
  // Inventory / Reference workbook.
  REFERENCE_SPREADSHEET_ID: 'REPLACE_REFERENCE_SPREADSHEET_ID',
  // Evidence and archival storage.
  PHOTO_FOLDER_ID: 'REPLACE_PHOTO_FOLDER_ID',
  REIGN_ARCHIVE_FOLDER_ID: 'REPLACE_REIGN_ARCHIVE_FOLDER_ID',

  // ---- Static backend credentials ----
  // Must match LORD_PROXY_SECRET in all three Cloudflare Workers.
  PROXY_SECRET: 'REPLACE_PROXY_SECRET',
  // Legacy-compatible booking peppers retained verbatim so historical booking
  // edit token/code hashes remain valid across the formal v1 cutover.
  BOOKING_TOKEN_PEPPER: 'REPLACE_BOOKING_TOKEN_PEPPER',
  BOOKING_CODE_PEPPER: 'REPLACE_BOOKING_CODE_PEPPER',

  // ---- Operational policy ----
  TIME_ZONE: 'Asia/Singapore',
  REFERENCE_CACHE_SECONDS: 3600,
  REIGN_CLOSE_HOUR: 18,
  SHEETS: Object.freeze({
    SESSIONS: 'Sessions',
    TROLLEYS: 'Session Trolleys',
    EVENTS: 'Event Log',
    BOOKINGS: 'Bookings',
    CONTACTS: 'contacts',
    ADMINS: 'admins'
  })
});

var BOOKING_CONFIG = Object.freeze({
  SHEET: LORD_CONFIG.SHEETS.BOOKINGS,
  CONTACTS_SHEET: LORD_CONFIG.SHEETS.CONTACTS,
  REFERENCE_SPREADSHEET_ID: LORD_CONFIG.REFERENCE_SPREADSHEET_ID,
  TIME_ZONE: LORD_CONFIG.TIME_ZONE
});

var OVERLORD_CONFIG = Object.freeze({
  GRACE_MINUTES: 30,
  TELEGRAM_CHECK_MINUTES: 5,
  TELEGRAM_BOT_TOKEN: 'REPLACE_TELEGRAM_BOT_TOKEN',
  TELEGRAM_CHAT_ID: 'REPLACE_TELEGRAM_CHAT_ID',
  TELEGRAM_NOTIFIED_PROPERTY: 'LORD_V3_BOOKING_END_ALERTED',
  FORCE_RETURN_SWEEP_DATE_PROPERTY: 'LORD_V3_FORCE_RETURN_SWEEP_DATE',
  FORCE_RETURN_PENDING_ALERT_PROPERTY: 'LORD_V3_FORCE_RETURN_PENDING_ALERT',
  PENDING_ALERT_EVENTS_PROPERTY: 'LORD_V3_PENDING_ALERT_EVENTS',
  FORCE_RETURN_HOUR: 18,
  MONITOR_BUCKET_PROPERTY: 'LORD_V3_MONITOR_BUCKET',
  REFERENCE_CACHE_SECONDS: LORD_CONFIG.REFERENCE_CACHE_SECONDS,
  CONTACT_CACHE_SECONDS: 120,
  TRIGGER_STATUS_CACHE_SECONDS: 300,
  TRIGGER_STATUS_CACHE_KEY: 'lord_v3_trigger_status'
});

var LORD_REFERENCE_CONFIG = Object.freeze({
  SPREADSHEET_ID: LORD_CONFIG.REFERENCE_SPREADSHEET_ID,
  SHEETS: Object.freeze({
    teachers: 'teacher',
    classes: 'classes',
    subjects: 'subjects',
    trolleys: 'trolleys',
    timetable: 'timetable'
  }),
  CACHE_SECONDS: LORD_CONFIG.REFERENCE_CACHE_SECONDS,
  CACHE_KEY: 'LORD_V1_3_REFERENCE_DATA'
});

var REIGN_CONFIG = Object.freeze({
  ARCHIVE_FOLDER_ID: LORD_CONFIG.REIGN_ARCHIVE_FOLDER_ID,
  ARCHIVE_PREFIX: 'LORD',
  TRANSACTION_SHEETS: Object.freeze([
    'Bookings',
    'Sessions',
    'Session Trolleys',
    'Event Log'
  ])
});

var LORD_RUNTIME_ = null;

function executionContext_() {
  if (!LORD_RUNTIME_) LORD_RUNTIME_ = {};
  return LORD_RUNTIME_;
}

// One privacy-safe timing record per HTTP execution. Counters never add service
// calls and logging must not turn a committed transaction into an API failure.
function beginRequestMetrics_(method) {
  var metrics = {
    startedAt: Date.now(), method: method, action: 'unknown', outcome: 'ok',
    replayed: false, photoCount: 0, photoMs: 0, folderMs: 0,
    lockWaitMs: 0, lockHeldMs: 0, commitMs: 0, referenceCache: 'unused'
  };
  executionContext_().requestMetrics = metrics;
  return metrics;
}

function requestActionForLog_(action, method) {
  // Do not echo arbitrary request data into logs, even in the action field.
  var allowed = method === 'GET' ? [
    'health', 'reference', 'identitylookup', 'mybookings', 'opensessions',
    'session', 'bookingavailability', 'bookingdayschedule', 'bookingget',
    'bookingeligible', 'dashboard', 'reignpreview', 'starlordboard'
  ] : ['loan', 'return', 'bookingcreate', 'bookingcreatebatch', 'bookingupdate', 'bookingcancel', 'reignclose'];
  return allowed.indexOf(action) !== -1 ? action : 'unknown';
}

function measureBackendPhase_(name, fn) {
  var metrics = executionContext_().requestMetrics;
  if (!metrics) return fn();
  var startedAt = Date.now();
  try {
    return fn();
  } finally {
    metrics[name] = (Number(metrics[name]) || 0) + Math.max(0, Date.now() - startedAt);
  }
}

function finishRequestMetrics_(metrics) {
  if (!metrics || metrics.logged) return;
  metrics.logged = true;
  try {
    console.log(JSON.stringify({
      event: 'LORD_TIMING', version: LORD_CONFIG.VERSION,
      method: metrics.method, action: metrics.action, outcome: metrics.outcome,
      elapsedMs: Math.max(0, Date.now() - metrics.startedAt), replayed: metrics.replayed,
      photoCount: metrics.photoCount, photoMs: metrics.photoMs, folderMs: metrics.folderMs,
      lockWaitMs: metrics.lockWaitMs, lockHeldMs: metrics.lockHeldMs,
      commitMs: metrics.commitMs, referenceCache: metrics.referenceCache
    }));
  } catch (ignore) {}
}

function getTransactionSpreadsheet_() {
  var ctx = executionContext_();
  if (!ctx.transactionSpreadsheet) {
    ctx.transactionSpreadsheet = SpreadsheetApp.openById(LORD_CONFIG.SPREADSHEET_ID);
  }
  return ctx.transactionSpreadsheet;
}

function getReferenceSpreadsheet_() {
  var ctx = executionContext_();
  if (!ctx.referenceSpreadsheet) {
    ctx.referenceSpreadsheet = SpreadsheetApp.openById(LORD_CONFIG.REFERENCE_SPREADSHEET_ID);
  }
  return ctx.referenceSpreadsheet;
}

function getPhotoRootFolder_() {
  var ctx = executionContext_();
  if (!ctx.photoRootFolder) ctx.photoRootFolder = DriveApp.getFolderById(LORD_CONFIG.PHOTO_FOLDER_ID);
  return ctx.photoRootFolder;
}

function getReignArchiveFolder_() {
  var ctx = executionContext_();
  if (!ctx.reignArchiveFolder) ctx.reignArchiveFolder = DriveApp.getFolderById(LORD_CONFIG.REIGN_ARCHIVE_FOLDER_ID);
  return ctx.reignArchiveFolder;
}

function resetExecutionContext_() {
  LORD_RUNTIME_ = null;
}

function bookingTokenPepper_() {
  return LORD_CONFIG.BOOKING_TOKEN_PEPPER;
}

function bookingCodePepper_() {
  return LORD_CONFIG.BOOKING_CODE_PEPPER;
}

function telegramBotToken_() {
  return OVERLORD_CONFIG.TELEGRAM_BOT_TOKEN;
}

function telegramChatId_() {
  return OVERLORD_CONFIG.TELEGRAM_CHAT_ID;
}

/* LTS v1.3: only changed cells, one atomic Sheets API request per commit.
 * Callers hold the existing ScriptLock. No automatic replay of an ambiguous
 * network failure: the normal client request ID and state checks govern retries.
 * Enable Google Sheets API v4 (identifier Sheets) in Apps Script Services.
 */
function requireSurgicalSheets_() {
  if (typeof Sheets === 'undefined' || !Sheets.Spreadsheets ||
      typeof Sheets.Spreadsheets.batchUpdate !== 'function') {
    throw new Error('LORD v1.3 LTS setup: add Google Sheets API v4 (identifier Sheets) under Apps Script Services, then run selfTestLORDV13().');
  }
}

function sameSheetValue_(left, right) {
  if (left == null) left = '';
  if (right == null) right = '';
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return left === right;
}

function surgicalCellData_(value) {
  if (value == null || value === '') return {};
  if (value instanceof Date) {
    if (!isFinite(value.getTime())) throw new Error('Cannot write an invalid date.');
    // Sheets stores dates as wall-clock serial numbers in the workbook timezone.
    // Formatting is preserved: the field mask below changes only cell values.
    var stamp = Utilities.formatDate(value, LORD_CONFIG.TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
    return { userEnteredValue: { numberValue: (Date.parse(stamp) - Date.UTC(1899, 11, 30)) / 86400000 } };
  }
  if (typeof value === 'boolean') return { userEnteredValue: { boolValue: value } };
  if (typeof value === 'number') {
    if (!isFinite(value)) throw new Error('Cannot write a non-finite number.');
    return { userEnteredValue: { numberValue: value } };
  }
  // User-entered comments beginning with '=' remain literal text, never formulas.
  return { userEnteredValue: { stringValue: String(value) } };
}

function queueChangedRow_(requests, sheet, rowNumber, before, after, startColumn) {
  startColumn = startColumn || 1;
  if (!Number.isInteger(rowNumber) || rowNumber < 2 ||
      !Number.isInteger(startColumn) || startColumn < 1 || before.length !== after.length) {
    throw new Error('Invalid targeted Sheet update.');
  }
  var count = 0;
  var index = 0;
  while (index < after.length) {
    if (sameSheetValue_(before[index], after[index])) { index++; continue; }
    var first = index;
    var cells = [];
    while (index < after.length && !sameSheetValue_(before[index], after[index])) {
      cells.push(surgicalCellData_(after[index++]));
      count++;
    }
    requests.push({ updateCells: {
      range: {
        sheetId: sheet.getSheetId(), startRowIndex: rowNumber - 1, endRowIndex: rowNumber,
        startColumnIndex: startColumn - 1 + first, endColumnIndex: startColumn - 1 + index
      },
      rows: [{ values: cells }], fields: 'userEnteredValue'
    } });
  }
  return count;
}

function queueNewRows_(requests, sheet, firstRow, rows) {
  if (!rows.length) return;
  var lastRow = firstRow + rows.length - 1;
  var maxRows = sheet.getMaxRows();
  if (lastRow > maxRows) {
    requests.push({ appendDimension: { sheetId: sheet.getSheetId(), dimension: 'ROWS', length: lastRow - maxRows } });
  }
  for (var r = 0; r < rows.length; r++) {
    queueChangedRow_(requests, sheet, firstRow + r, rows[r].map(function(){ return ''; }), rows[r]);
    // Newly appended grid rows may not inherit the existing date format.
    // Only new date cells receive formatting; edits preserve all formatting.
    for (var c = 0; c < rows[r].length; c++) {
      if (rows[r][c] instanceof Date) requests.push({ repeatCell: {
        range: { sheetId: sheet.getSheetId(), startRowIndex: firstRow + r - 1,
          endRowIndex: firstRow + r, startColumnIndex: c, endColumnIndex: c + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: 'dd mmm yyyy hh:mm:ss' } } },
        fields: 'userEnteredFormat.numberFormat'
      } });
    }
  }
}

function compactSurgicalRequests_(requests) {
  // Merge adjacent rows only when they change exactly the same column span.
  // Unchanged cells and intervening rows are never included to make a rectangle.
  var structural = requests.filter(function(r){ return !r.updateCells; });
  var patches = requests.filter(function(r){ return Boolean(r.updateCells); }).slice();
  patches.sort(function(a,b) {
    var x = a.updateCells.range, y = b.updateCells.range;
    return x.sheetId - y.sheetId || x.startColumnIndex - y.startColumnIndex ||
      x.endColumnIndex - y.endColumnIndex || x.startRowIndex - y.startRowIndex;
  });
  var output = [];
  patches.forEach(function(patch) {
    var last = output.length ? output[output.length - 1].updateCells : null;
    var next = patch.updateCells;
    if (last && last.range.sheetId === next.range.sheetId &&
        last.range.startColumnIndex === next.range.startColumnIndex &&
        last.range.endColumnIndex === next.range.endColumnIndex &&
        last.range.endRowIndex === next.range.startRowIndex) {
      last.range.endRowIndex = next.range.endRowIndex;
      last.rows = last.rows.concat(next.rows);
    } else {
      output.push({ updateCells: {
        range: Object.assign({}, next.range), rows: next.rows.slice(), fields: next.fields
      } });
    }
  });
  return structural.concat(output);
}

function commitSurgicalUpdates_(requests) {
  if (!requests.length) return { requests: 0, cells: 0 };
  requireSurgicalSheets_();
  var compacted = compactSurgicalRequests_(requests);
  var cells = 0;
  compacted.forEach(function(r) {
    if (r.updateCells) r.updateCells.rows.forEach(function(row){ cells += row.values.length; });
  });
  measureBackendPhase_('commitMs', function() {
    executionContext_().commitAttempted = true;
    // Finish any preceding built-in append before mixing service paths.
    SpreadsheetApp.flush();
    Sheets.Spreadsheets.batchUpdate({ requests: compacted, includeSpreadsheetInResponse: false }, LORD_CONFIG.SPREADSHEET_ID);
  });
  return { requests: compacted.length, cells: cells };
}

function writeChangedRow_(sheet, rowNumber, before, after) {
  var requests = [];
  queueChangedRow_(requests, sheet, rowNumber, before, after);
  return commitSurgicalUpdates_(requests);
}


function withWriteLock_(fn, timeoutMs) {
  var lock = LockService.getScriptLock();
  measureBackendPhase_('lockWaitMs', function() {
    lock.waitLock(Number(timeoutMs) || 30000);
  });
  try {
    return measureBackendPhase_('lockHeldMs', fn);
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function doGet(e) {
  resetExecutionContext_();
  var metrics = beginRequestMetrics_('GET');
  try {
    var parameters = e && e.parameter ? e.parameter : {};
    var action = normaliseText_(parameters.action || 'health').toLowerCase();
    metrics.action = requestActionForLog_(action, 'GET');

    if (action === 'health') {
      return jsonResponse_({
        ok: true,
        service: 'LORD Suite Backend v1.6',
        version: LORD_CONFIG.VERSION,
        releaseChannel: LORD_CONFIG.RELEASE_CHANNEL,
        timestamp: new Date().toISOString()
      });
    }

    requireProxySecret_(parameters.proxySecret);

    // A forced read skips data caches only. Authentication, idempotency and
    // transaction records are never cleared by a viewport reload.
    var reloading = parameters.forceRefresh === '1' &&
      ['reference', 'dashboard', 'starlordboard'].indexOf(action) !== -1;
    executionContext_().forceRefresh = reloading;

    if (action === 'reference') {
      var referenceResult = {
        ok: true,
        generatedAt: new Date().toISOString(),
        cacheReloaded: reloading,
        data: getReferenceData_()
      };
      // The authenticated LORD Worker supplies this only for a staff booking
      // screen. Read the selected day's schedule in the same execution.
      if (reloading && /^\d{4}-\d{2}-\d{2}$/.test(String(parameters.reloadDate || ''))) {
        referenceResult.date = parameters.reloadDate;
        referenceResult.daySchedule = bookingDaySchedule_({ date: parameters.reloadDate });
      }
      return jsonResponse_(referenceResult);
    }
    if (action === 'identitylookup') {
      return jsonResponse_({ ok: true, identity: identityLookup_(normaliseText_(parameters.email), normaliseText_(parameters.sub)) });
    }
    if (action === 'mybookings') return jsonResponse_({ ok: true, bookings: listMyBookings_(parameters) });
    if (action === 'opensessions') return jsonResponse_({ ok: true, sessions: getOpenSessions_(normaliseText_(parameters.teacher)) });
    if (action === 'session') return jsonResponse_({ ok: true, session: getSession_(requiredText_(parameters.sessionId, 'Session ID')) });
    if (action === 'bookingavailability') return jsonResponse_({ ok: true, result: bookingAvailability_(parameters) });
    if (action === 'bookingdayschedule') return jsonResponse_({ ok: true, bookings: bookingDaySchedule_(parameters) });
    if (action === 'bookingget') return jsonResponse_({ ok: true, booking: getBookingForEditAuthenticated_(parameters) });
    if (action === 'bookingeligible') return jsonResponse_({ ok: true, bookings: listEligibleBookings_(parameters) });
    if (action === 'dashboard') {
      var dashboardResult = { ok: true, cacheReloaded: reloading, data: getOverlordDashboardData_(parameters) };
      if (reloading) dashboardResult.reference = getReferenceData_();
      return jsonResponse_(dashboardResult);
    }
    if (action === 'reignpreview') return jsonResponse_({ ok: true, data: previewReignClose_(parameters) });
    if (action === 'starlordboard') {
      var boardResult = getStarlordBoardData_(parameters);
      boardResult.cacheReloaded = reloading;
      return jsonResponse_(boardResult);
    }

    throw new Error('Unknown GET action: ' + action);
  } catch (error) {
    metrics.outcome = 'error';
    return jsonResponse_({ ok: false, error: getErrorMessage_(error) });
  } finally {
    finishRequestMetrics_(metrics);
  }
}

function doPost(e) {
  resetExecutionContext_();
  var metrics = beginRequestMetrics_('POST');
  try {
    var request = parsePostRequest_(e);
    var action = normaliseText_(request.action).toLowerCase();
    metrics.action = requestActionForLog_(action, 'POST');
    requireProxySecret_(request.proxySecret);

    var requestId = normaliseText_(request.clientRequestId);
    var prior = requestId ? getIdempotentResult_(requestId) : null;
    if (prior) return jsonResponse_({ ok: true, result: prior, replayed: true });

    requireSurgicalSheets_();
    var result;
    if (action === 'loan') {
      result = createLoanSession_(request, requestId);
    } else if (action === 'return') {
      result = completeReturn_(request, requestId);
    } else {
      result = withWriteLock_(function() {
        var insidePrior = requestId ? getIdempotentResult_(requestId) : null;
        if (insidePrior) return insidePrior;

        var committed;
        if (action === 'bookingcreate') committed = createBooking_(request);
        else if (action === 'bookingcreatebatch') committed = createBookingBatch_(request);
        else if (action === 'bookingupdate') committed = updateBooking_(request);
        else if (action === 'bookingcancel') committed = cancelBooking_(request);
        else if (action === 'reignclose') committed = closeReignPeriod_(request);
        else throw new Error('Unknown POST action: ' + action);

        if (requestId) storeIdempotentResult_(requestId, committed);
        return committed;
      });
    }

    if (result && result.alreadyRecorded) metrics.replayed = true;
    var warnings = executionContext_().maintenanceWarnings;
    if (warnings && warnings.length && result) result.maintenanceWarnings = warnings.slice();
    return jsonResponse_({ ok: true, result: result });
  } catch (error) {
    metrics.outcome = 'error';
    return jsonResponse_({ ok: false, error: getErrorMessage_(error), code: executionContext_().commitAttempted ? 'UNKNOWN_OUTCOME' : 'SUBMISSION_REJECTED', retryable: Boolean(executionContext_().commitAttempted) });
  } finally {
    finishRequestMetrics_(metrics);
  }
}



/* =========================
 * CORE / BOOKING / OVERLORD / STARLORD / AUTH MODULES
 * ========================= */

/* =========================
 * DATA SCHEMA + CORE MOVEMENT SERVICE
 * ========================= */

var SESSION_HEADERS = [
  'Session ID',
  'Status',
  'Loan Teacher',
  'Return Teacher',
  'Class or Activity',
  'Subject',
  'Cart Group',
  'Loan Timestamp',
  'Return Timestamp',
  'Loan Trolley Count',
  'Loan Device Total',
  'Return Device Total',
  'Loan Comments',
  'Return Comments',
  'Created At',
  'Updated At',
  'Collector Google Sub',
  'Collector Verified Email',
  'Collector TTB Name',
  'Returner Google Sub',
  'Returner Verified Email',
  'Returner TTB Name',
  'Collector Identity Type',
  'Collector Mobile',
  'Returner Identity Type',
  'Returner Mobile',
  'Styluses Booked',
  'Headphones Booked',
  'Loan Stylus Quantity',
  'Loan Stylus Photo File ID',
  'Loan Stylus Photo URL',
  'Loan Headphone Quantity',
  'Loan Headphone Photo File ID',
  'Loan Headphone Photo URL',
  'Return Stylus Quantity',
  'Return Stylus Photo File ID',
  'Return Stylus Photo URL',
  'Return Stylus Bag Declaration',
  'Return Headphone Quantity',
  'Return Headphone Photo File ID',
  'Return Headphone Photo URL',
  'Return Headphone Bag Declaration'
];

var TROLLEY_HEADERS = [
  'Trolley Record ID',
  'Session ID',
  'Sequence',
  'Trolley Name',
  'Loan Quantity',
  'Loan Photo File ID',
  'Loan Photo URL',
  'Return Quantity',
  'Return Photo File ID',
  'Return Photo URL',
  'Stylus Declaration',
  'Correct Trolley Declaration',
  'Same Orientation Declaration',
  'Return Issue',
  'Return Notes',
  'Updated At'
];

var EVENT_HEADERS = [
  'Event ID',
  'Session ID',
  'Event Type',
  'Timestamp',
  'Teacher',
  'Payload JSON'
];

function setupLORDWorkbook() {
  var spreadsheet = getTransactionSpreadsheet_();

  createOrResetHeader_(spreadsheet, LORD_CONFIG.SHEETS.SESSIONS, SESSION_HEADERS);
  createOrResetHeader_(spreadsheet, LORD_CONFIG.SHEETS.TROLLEYS, TROLLEY_HEADERS);
  createOrResetHeader_(spreadsheet, LORD_CONFIG.SHEETS.EVENTS, EVENT_HEADERS);
  formatWorkbook_(spreadsheet);
}

var LORD_IDEMPOTENCY = Object.freeze({
  PREFIX: 'LORD_V3_IDEMPOTENCY_',
  MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  MAX_ITEMS: 180,
  MAX_VALUE_CHARS: 8000
});

function idempotencyPropertyKey_(requestId) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(requestId || ''),
    Utilities.Charset.UTF_8
  );
  var hex = bytes.map(function(b) {
    var v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
  return LORD_IDEMPOTENCY.PREFIX + hex;
}

function getIdempotentResult_(requestId) {
  try {
    var props = PropertiesService.getScriptProperties();
    var key = idempotencyPropertyKey_(requestId);
    var raw = props.getProperty(key);
    if (raw) {
      var item = JSON.parse(raw);
      if (!item || !item.timestamp || Date.now() - Number(item.timestamp) > LORD_IDEMPOTENCY.MAX_AGE_MS) {
        props.deleteProperty(key);
        return null;
      }
      var result = Object.prototype.hasOwnProperty.call(item, 'result') ? item.result : null;
      var metrics = executionContext_().requestMetrics;
      if (result && metrics) metrics.replayed = true;
      return result;
    }

    return null;
  } catch (error) {
    Logger.log('Idempotency read warning: ' + getErrorMessage_(error));
    return null;
  }
}

function utf8Bytes_(value) {
  var text = String(value == null ? '' : value);
  var bytes = 0;
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    if (code < 128) bytes++;
    else if (code < 2048) bytes += 2;
    else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xDC00 && text.charCodeAt(i + 1) <= 0xDFFF) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

function setBoundedRuntimeProperty_(props, key, value, snapshot) {
  // Leave headroom below the shared 500 KB store and 9 KB value quotas.
  if (utf8Bytes_(value) > 8000) throw new Error('Background record exceeds its storage limit.');
  var all = snapshot || props.getProperties();
  var bytes = utf8Bytes_(key) + utf8Bytes_(value);
  Object.keys(all).forEach(function(name) { if (name !== key) bytes += utf8Bytes_(name) + utf8Bytes_(all[name]); });
  if (bytes > 400000) throw new Error('Background storage is near capacity. Administrator attention is required.');
  props.setProperty(key, value);
}

function noteMaintenanceFailure_(kind, error) {
  var ctx = executionContext_();
  var warnings = ctx.maintenanceWarnings || (ctx.maintenanceWarnings = []);
  var message = 'The main record was saved, but a background task needs administrator attention.';
  if (warnings.indexOf(message) === -1) warnings.push(message);
  try { Logger.log('LORD_MAINTENANCE_FAILURE ' + String(kind) + ': ' + getErrorMessage_(error)); } catch (ignoreLog) {}
  // Best effort only: the execution warning remains visible if Properties is full.
  try {
    PropertiesService.getScriptProperties().setProperty('LORD_V14_MAINTENANCE_WARNING', JSON.stringify({ at: new Date().toISOString(), kind: String(kind) }));
  } catch (ignore) {}
}

function getLORDMaintenanceWarning_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('LORD_V14_MAINTENANCE_WARNING');
    return raw ? JSON.parse(raw) : null;
  } catch (ignore) { return null; }
}

function diagnoseLORDBackgroundWork() {
  var all = PropertiesService.getScriptProperties().getProperties();
  var keys = Object.keys(all);
  var result = {
    estimatedPropertyBytes: keys.reduce(function(total, key) { return total + utf8Bytes_(key) + utf8Bytes_(all[key]); }, 0),
    queueTasks: keys.filter(function(key) { return key.indexOf(LORD_SECONDARY.PREFIX) === 0; }).length,
    receipts: keys.filter(function(key) { return key.indexOf(LORD_IDEMPOTENCY.PREFIX) === 0; }).length,
    lastWarning: getLORDMaintenanceWarning_()
  };
  Logger.log(JSON.stringify(result));
  return result;
}

function acknowledgeLORDMaintenanceWarning() {
  // Maintainer-only editor function. It clears the notice after reconciliation,
  // never queue tasks, receipts, custody records or user data.
  PropertiesService.getScriptProperties().deleteProperty('LORD_V14_MAINTENANCE_WARNING');
}

function storeIdempotentResult_(requestId, result) {
  try {
    var props = PropertiesService.getScriptProperties();
    var now = Date.now();
    var key = idempotencyPropertyKey_(requestId);
    var all = props.getProperties();
    pruneIdempotency_(props, now, all, Object.prototype.hasOwnProperty.call(all, key) ? LORD_IDEMPOTENCY.MAX_ITEMS : LORD_IDEMPOTENCY.MAX_ITEMS - 1);
    var encoded = JSON.stringify({ timestamp: now, result: result });
    setBoundedRuntimeProperty_(props, key, encoded, all);
  } catch (error) {
    // Never report a committed physical movement as failed. Batch booking IDs
    // also permit recovery when its receipt write fails.
    noteMaintenanceFailure_('idempotency', error);
  }
}

function pruneIdempotency_(props, now, snapshot, maxItems) {
  var all = snapshot || props.getProperties();
  maxItems = maxItems == null ? LORD_IDEMPOTENCY.MAX_ITEMS : maxItems;
  var items = [];
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(LORD_IDEMPOTENCY.PREFIX) !== 0) return;
    try {
      var item = JSON.parse(all[key]);
      var ts = Number(item && item.timestamp || 0);
      if (!ts || now - ts > LORD_IDEMPOTENCY.MAX_AGE_MS) {
        props.deleteProperty(key); delete all[key];
      } else {
        items.push({ key: key, timestamp: ts });
      }
    } catch (ignore) {
      props.deleteProperty(key); delete all[key];
    }
  });
  items.sort(function(a, b) { return a.timestamp - b.timestamp; });
  while (items.length > maxItems) {
    var removed = items.shift().key;
    props.deleteProperty(removed); delete all[removed];
  }
}

var LORD_SECONDARY = Object.freeze({
  PREFIX: 'LORD_V3_SECONDARY_',
  MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  MAX_ITEMS: 100,
  MAX_VALUE_CHARS: 8000
});

function enqueueSecondary_(kind, payload, fn) {
  return { ok: true, queued: queueSecondaryTask_(kind, payload) };
}

function queueSecondaryTask_(kind, payload) {
  try {
    if (kind === 'event') payload = { sessionId: payload.sessionId, eventType: payload.eventType, teacher: payload.teacher, payload: payload.payload || {} };
    var props = PropertiesService.getScriptProperties();
    var all = props.getProperties();
    var tasks = pruneSecondaryTasks_(props, all);
    if (tasks.length >= LORD_SECONDARY.MAX_ITEMS) throw new Error('The background queue is full; existing tasks were retained.');
    // Pruning can remove expired entries. Reuse the updated snapshot below.
    var task = { kind: String(kind || ''), payload: payload || {}, createdAt: Date.now() };
    setBoundedRuntimeProperty_(props, LORD_SECONDARY.PREFIX + Utilities.getUuid(), JSON.stringify(task), all);
    return true;
  } catch (error) {
    noteMaintenanceFailure_('queue_' + String(kind), error);
    return false;
  }
}

function pruneSecondaryTasks_(props, snapshot) {
  var now = Date.now();
  var all = snapshot || props.getProperties();
  var items = [];
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(LORD_SECONDARY.PREFIX) !== 0) return;
    try {
      var task = JSON.parse(all[key]);
      var ts = Number(task && task.createdAt || 0);
      if (!ts || (now - ts > LORD_SECONDARY.MAX_AGE_MS && !(Number(task.leaseUntil) > now))) {
        props.deleteProperty(key); delete all[key];
        noteMaintenanceFailure_('queue_expired', new Error('An expired background task needs reconciliation.'));
      } else { task._key = key; items.push(task); }
    } catch (error) {
      props.deleteProperty(key); delete all[key];
      noteMaintenanceFailure_('queue_invalid', new Error('An unreadable background task was removed.'));
    }
  });
  items.sort(function(a, b) { return Number(a.createdAt) - Number(b.createdAt); });
  // Never discard pending tasks just to admit a newer one.
  return items;
}

function processSecondaryQueue_(limit) {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  if (!Object.keys(all).some(function(key) { return key.indexOf(LORD_SECONDARY.PREFIX) === 0; })) return;
  var tasks = pruneSecondaryTasks_(props, all).slice(0, Math.max(1, Number(limit) || 10));
  for (var i = 0; i < tasks.length; i++) processSecondaryTaskWithClaim_(props, tasks[i]._key);
}

function processSecondaryTaskWithClaim_(props, key) {
  var lock = LockService.getScriptLock();
  var acquired = false;
  var task = null;
  var emailClaim = '';
  try {
    acquired = lock.tryLock(3000);
    if (!acquired) return;
    var raw = props.getProperty(key);
    if (!raw) return; // Another runner completed it after our snapshot.
    task = JSON.parse(raw);
    if (Number(task.leaseUntil) > Date.now()) return;
    if (task.kind !== 'booking_email') {
      executeSecondaryTask_(task);
      props.deleteProperty(key);
      return;
    }
    // Serialize the email claim, then release the Sheet lock while sending.
    emailClaim = Utilities.getUuid();
    task.leaseToken = emailClaim;
    task.leaseUntil = Date.now() + 6 * 60 * 1000;
    setBoundedRuntimeProperty_(props, key, JSON.stringify(task));
  } catch (error) {
    noteMaintenanceFailure_('queue_retry', error);
    emailClaim = '';
  } finally {
    if (acquired) lock.releaseLock();
  }
  if (!emailClaim) return;
  var sent = false;
  try { executeSecondaryTask_(task); sent = true; }
  catch (error) { noteMaintenanceFailure_('email_retry', error); }
  var finishLock = LockService.getScriptLock();
  if (!finishLock.tryLock(3000)) return; // Lease expires if receipt cannot be saved.
  try {
    var currentRaw = props.getProperty(key);
    var current = currentRaw ? JSON.parse(currentRaw) : null;
    if (!current || current.leaseToken !== emailClaim) return;
    if (sent) props.deleteProperty(key);
    else {
      delete current.leaseToken; delete current.leaseUntil;
      setBoundedRuntimeProperty_(props, key, JSON.stringify(current));
    }
  } catch (error) { noteMaintenanceFailure_('email_checkpoint', error); }
  finally { finishLock.releaseLock(); }
}

function executeSecondaryTask_(task) {
  if (task.kind === 'booking_email') return sendBookingEmail_(task.payload);
  if (task.kind === 'booking_link') return linkBookingCollection_(task.payload);
  if (task.kind === 'booking_complete') return completeBookingBySession_(task.payload);
  if (task.kind === 'event') {
    var details = task.payload || {};
    details.spreadsheet = getTransactionSpreadsheet_();
    return appendEvent_(details);
  }
  throw new Error('Unknown secondary task: ' + task.kind);
}

function getSessionPhotoFolder_(sessionId) {
  return measureBackendPhase_('folderMs', function() {
    var root = getPhotoRootFolder_();
    return getOrCreateFolder_(root, sessionId);
  });
}

function createLoanSession_(request, requestId) {
  var bookingId = requiredText_(request.bookingId, 'Booking ID');
  var booking = getBookingInternalById_(bookingId);
  if (!booking) throw new Error('Booking not found: ' + bookingId);

  if (booking.status === 'COLLECTED' && booking.collectedSessionId) {
    var previouslyCollected = getSession_(String(booking.collectedSessionId));
    if (previouslyCollected.status === 'OPEN') {
      return loanResultFromSession_(previouslyCollected, bookingId, true);
    }
    if (previouslyCollected.status !== 'PENDING_COLLECTION') {
      throw new Error('This booking has already been collected and the linked loan is ' + previouslyCollected.status + '.');
    }
  } else if (booking.status !== 'BOOKED') {
    throw new Error('Booking cannot be collected. Status: ' + booking.status);
  }

  var teacher = requiredText_(request.authTtbName || request.teacher, 'Teacher');
  var classOrActivity = requiredText_(request.classOrActivity, 'Class or student group');
  var subject = requiredText_(request.subject, 'Subject');
  var cartGroup = requiredText_(request.cartGroup, 'Cart group');
  var loanComments = normaliseText_(request.comments);
  var trolleys = validateLoanTrolleys_(request.trolleys);

  if (String(booking.resource) !== cartGroup) {
    throw new Error('Selected cart does not match the booking. Booking resource: ' + booking.resource);
  }

  var sessionId = createSessionIdForRequest_(requestId);
  var now = new Date();
  var loanDeviceTotal = 0;
  for (var i = 0; i < trolleys.length; i++) loanDeviceTotal += trolleys[i].quantity;

  var stylusesBooked = booking.styluses === true || String(booking.styluses).toLowerCase() === 'true';
  var headphonesBooked = booking.headphones === true || String(booking.headphones).toLowerCase() === 'true';
  var requestAccessories = request.accessories || {};
  var stylusLoanQuantity = 0;
  var headphoneLoanQuantity = 0;

  if (stylusesBooked) {
    var loanStylus = requestAccessories.styluses || {};
    stylusLoanQuantity = requiredInteger_(loanStylus.quantity, 'Collected stylus quantity', 0, 200);
    if (stylusLoanQuantity > loanDeviceTotal) {
      throw new Error('Collected stylus quantity cannot exceed the number of devices collected.');
    }
  }
  if (headphonesBooked) {
    var loanHeadphone = requestAccessories.headphones || {};
    headphoneLoanQuantity = requiredInteger_(loanHeadphone.quantity, 'Collected headphone quantity', 0, 200);
    if (headphoneLoanQuantity > loanDeviceTotal) {
      throw new Error('Collected headphone quantity cannot exceed the number of devices collected.');
    }
  }

  // Phase 1: expensive Drive work occurs outside the global Sheet write lock.
  // Accessory evidence is required only when the teacher actually collected
  // one or more of that accessory type.
  var sessionPhotoFolder = getSessionPhotoFolder_(sessionId);
  var stylusLoanPhoto = { fileId: '', url: '' };
  var headphoneLoanPhoto = { fileId: '', url: '' };
  if (stylusesBooked && stylusLoanQuantity > 0) {
    stylusLoanPhoto = savePhoto_({
      sessionId: sessionId, sessionFolder: sessionPhotoFolder, phase: 'loan_accessory',
      sequence: 1, trolleyName: 'Styluses',
      photoData: requestAccessories.styluses && requestAccessories.styluses.photoData
    });
  }
  if (headphonesBooked && headphoneLoanQuantity > 0) {
    headphoneLoanPhoto = savePhoto_({
      sessionId: sessionId, sessionFolder: sessionPhotoFolder, phase: 'loan_accessory',
      sequence: 2, trolleyName: 'Headphones',
      photoData: requestAccessories.headphones && requestAccessories.headphones.photoData
    });
  }

  var stagedTrolleys = [];
  for (i = 0; i < trolleys.length; i++) {
    var photo = savePhoto_({
      sessionId: sessionId, sessionFolder: sessionPhotoFolder, phase: 'loan',
      sequence: i + 1, trolleyName: trolleys[i].name, photoData: trolleys[i].photoData
    });
    stagedTrolleys.push({
      trolleyRecordId: Utilities.getUuid(),
      sequence: i + 1,
      name: trolleys[i].name,
      quantity: trolleys[i].quantity,
      photoFileId: photo.fileId,
      photoUrl: photo.url
    });
  }

  // Phase 2: short, authoritative critical section. Everything is revalidated.
  return withWriteLock_(function() {
    var prior = requestId ? getIdempotentResult_(requestId) : null;
    if (prior) return prior;

    var freshBooking = getBookingInternalById_(bookingId);
    if (!freshBooking) throw new Error('Booking disappeared before collection could be committed.');

    if (freshBooking.status === 'COLLECTED' && freshBooking.collectedSessionId &&
        String(freshBooking.collectedSessionId) !== sessionId) {
      var other = getSession_(String(freshBooking.collectedSessionId));
      if (other.status === 'OPEN') return loanResultFromSession_(other, bookingId, true);
      throw new Error('Booking was collected by another transaction before this collection completed.');
    }
    if (freshBooking.status !== 'BOOKED' &&
        !(freshBooking.status === 'COLLECTED' && String(freshBooking.collectedSessionId) === sessionId)) {
      throw new Error('Booking cannot be collected. Status: ' + freshBooking.status);
    }
    if (String(freshBooking.resource) !== cartGroup) {
      throw new Error('Booking resource changed before collection could be committed.');
    }

    ensureNoOpenLoanForCart_(cartGroup, sessionId);
    var spreadsheet = getTransactionSpreadsheet_();
    assertSessionSchema_(spreadsheet);
    var sessionSheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.SESSIONS);
    var sessionRow = findRowByValue_(sessionSheet, 1, sessionId);
    var createdAt = now;

    if (sessionRow) {
      var existing = sessionSheet.getRange(sessionRow, 1, 1, SESSION_HEADERS.length).getValues()[0];
      var existingStatus = normaliseText_(existing[1]);
      if (existingStatus === 'OPEN') {
        var current = getSession_(sessionId);
        var existingResult = loanResultFromSession_(current, bookingId, true);
        if (requestId) storeIdempotentResult_(requestId, existingResult);
        return existingResult;
      }
      if (existingStatus !== 'PENDING_COLLECTION') {
        throw new Error('Collection retry found an incompatible Session state: ' + existingStatus);
      }
      createdAt = existing[14] || now;
    }

    var pendingRow = [
      sessionId, 'PENDING_COLLECTION', teacher, '', classOrActivity, subject, cartGroup,
      now, '', stagedTrolleys.length, loanDeviceTotal, '', loanComments, '', createdAt, now,
      normaliseText_(request.authSub), normaliseText_(request.authEmail),
      normaliseText_(request.authTtbName) || teacher, '', '', '',
      normaliseText_(request.authIdentityType) || 'GSPS', normaliseText_(request.authMobile),
      '', '', stylusesBooked, headphonesBooked,
      stylusesBooked ? stylusLoanQuantity : '',
      stylusesBooked ? stylusLoanPhoto.fileId : '',
      stylusesBooked ? stylusLoanPhoto.url : '',
      headphonesBooked ? headphoneLoanQuantity : '',
      headphonesBooked ? headphoneLoanPhoto.fileId : '',
      headphonesBooked ? headphoneLoanPhoto.url : '',
      '', '', '', '', '', '', '', ''
    ];

    var isNewSession = !sessionRow;
    if (isNewSession) sessionRow = sessionSheet.getLastRow() + 1;
    var collectionRequests = [];
    var trolleySheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.TROLLEYS);
    writePendingCollectionTrolleys_(trolleySheet, sessionId, stagedTrolleys, now, collectionRequests);

    // Booking linkage, trolley records and Session activation are one commit.
    // Existing PENDING_COLLECTION records remain recoverable, but a new failed
    // batch cannot leave a partly created Session in the workbook.
    linkBookingCollection_({ bookingId: bookingId, sessionId: sessionId }, collectionRequests);

    pendingRow[1] = 'OPEN';
    pendingRow[15] = new Date();
    if (isNewSession) queueNewRows_(collectionRequests, sessionSheet, sessionRow, [pendingRow]);
    else queueChangedRow_(collectionRequests, sessionSheet, sessionRow, existing, pendingRow);
    commitSurgicalUpdates_(collectionRequests);
    clearBookingDayCache_(freshBooking.date);

    queueSecondaryTask_('event', {
      sessionId: sessionId,
      eventType: 'LOAN_CREATED',
      teacher: teacher,
      payload: {
        bookingId: bookingId, classOrActivity: classOrActivity, subject: subject,
        cartGroup: cartGroup, trolleyCount: stagedTrolleys.length,
        deviceTotal: loanDeviceTotal,
        styluses: stylusesBooked ? stylusLoanQuantity : 0,
        headphones: headphonesBooked ? headphoneLoanQuantity : 0,
        comments: loanComments
      }
    });

    var result = {
      sessionId: sessionId,
      bookingId: bookingId,
      status: 'OPEN',
      teacher: teacher,
      classOrActivity: classOrActivity,
      subject: subject,
      cartGroup: cartGroup,
      trolleyCount: stagedTrolleys.length,
      deviceTotal: loanDeviceTotal,
      stylusesBooked: stylusesBooked,
      headphonesBooked: headphonesBooked,
      stylusQuantity: stylusesBooked ? stylusLoanQuantity : 0,
      headphoneQuantity: headphonesBooked ? headphoneLoanQuantity : 0,
      loanTimestamp: formatDate_(now),
      trolleys: stagedTrolleys.map(function(t) {
        return { trolleyRecordId: t.trolleyRecordId, name: t.name, quantity: t.quantity, photoUrl: t.photoUrl };
      })
    };
    if (requestId) storeIdempotentResult_(requestId, result);
    return result;
  });
}

function createSessionIdForRequest_(requestId) {
  if (!normaliseText_(requestId)) return createSessionId_();
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(requestId),
    Utilities.Charset.UTF_8
  );
  var hex = bytes.map(function(b) {
    var v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('').slice(0, 12).toUpperCase();
  return 'LORD-' + hex;
}

function loanResultFromSession_(session, bookingId, alreadyRecorded) {
  return {
    sessionId: session.sessionId,
    bookingId: bookingId,
    status: session.status,
    teacher: session.loanTeacher,
    classOrActivity: session.classOrActivity,
    subject: session.subject,
    cartGroup: session.cartGroup,
    trolleyCount: session.loanTrolleyCount,
    deviceTotal: session.loanDeviceTotal,
    stylusesBooked: session.stylusesBooked,
    headphonesBooked: session.headphonesBooked,
    stylusQuantity: session.stylusQuantity,
    headphoneQuantity: session.headphoneQuantity,
    loanTimestamp: session.loanTimestamp,
    trolleys: session.trolleys,
    alreadyRecorded: Boolean(alreadyRecorded)
  };
}

function writePendingCollectionTrolleys_(sheet, sessionId, stagedTrolleys, now, deferredRequests) {
  var existing = getTrolleyRowsForSession_(sheet, sessionId);
  var rows = [];
  for (var i = 0; i < stagedTrolleys.length; i++) {
    var t = stagedTrolleys[i];
    rows.push([
      t.trolleyRecordId, sessionId, t.sequence, t.name, t.quantity,
      t.photoFileId, t.photoUrl, '', '', '', '', '', '', '', '', now
    ]);
  }

  var requests = deferredRequests || [];
  var reuse = Math.min(existing.length, rows.length);
  for (i = 0; i < reuse; i++) {
    rows[i][0] = existing[i].trolleyRecordId || rows[i][0];
    queueChangedRow_(requests, sheet, existing[i].rowNumber, existing[i].values, rows[i]);
    stagedTrolleys[i].trolleyRecordId = rows[i][0];
  }
  if (rows.length > reuse) {
    queueNewRows_(requests, sheet, sheet.getLastRow() + 1, rows.slice(reuse));
  }
  for (i = rows.length; i < existing.length; i++) {
    queueChangedRow_(requests, sheet, existing[i].rowNumber, existing[i].values, existing[i].values.map(function(){ return ''; }));
  }
  if (!deferredRequests) commitSurgicalUpdates_(requests);
}

function completeReturn_(request, requestId) {
  var sessionId = requiredText_(request.sessionId, 'Session ID');
  var returnTeacher = requiredText_(request.authTtbName || request.teacher, 'Return teacher');
  var returnComments = normaliseText_(request.comments);
  var sessionIssue = request.issue === true || request.issue === 'true';
  var sessionIssueNotes = normaliseText_(request.issueNotes);

  if (!request.trolleys || Object.prototype.toString.call(request.trolleys) !== '[object Array]') {
    throw new Error('Return trolley data is missing.');
  }

  var spreadsheet = getTransactionSpreadsheet_();
  assertSessionSchema_(spreadsheet);
  var sessionSheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.SESSIONS);
  var sessionRow = findRowByValue_(sessionSheet, 1, sessionId);
  if (!sessionRow) throw new Error('Session not found: ' + sessionId);

  var sessionValues = sessionSheet.getRange(sessionRow, 1, 1, SESSION_HEADERS.length).getValues()[0];
  var initialStatus = normaliseText_(sessionValues[1]).toUpperCase();
  if (initialStatus !== 'OPEN') {
    if (initialStatus === 'RETURNED' || initialStatus === 'RETURNED WITH ISSUE' || initialStatus === 'FORCE RETURNED' || initialStatus === 'FORCED RETURN') {
      return {
        sessionId: sessionId,
        status: initialStatus,
        returnTeacher: normaliseText_(sessionValues[3]),
        returnDeviceTotal: Number(sessionValues[11]) || 0,
        returnStylusQuantity: Number(sessionValues[34]) || 0,
        returnHeadphoneQuantity: Number(sessionValues[38]) || 0,
        returnTimestamp: sessionValues[8] ? formatDate_(sessionValues[8]) : '',
        alreadyRecorded: true
      };
    }
    throw new Error('Session is not open. Current status: ' + initialStatus);
  }

  var stylusesBooked = sessionValues[26] === true || String(sessionValues[26]).toLowerCase() === 'true';
  var headphonesBooked = sessionValues[27] === true || String(sessionValues[27]).toLowerCase() === 'true';
  var loanStylusQuantity = Number(sessionValues[28]) || 0;
  var loanHeadphoneQuantity = Number(sessionValues[31]) || 0;
  var trolleySheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.TROLLEYS);
  var savedTrolleys = getTrolleyRowsForSession_(trolleySheet, sessionId);

  // v1 does not permit partial returns. The request must contain every trolley
  // exactly once; a direct Return flow may ask the user to select/confirm them,
  // but the authoritative commit remains all-or-nothing at Session level.
  if (savedTrolleys.length !== request.trolleys.length) {
    throw new Error('All trolleys in this loan session must be returned together.');
  }

  // Validate all return declarations before performing Drive writes.
  var validated = [];
  var seenTrolleyIds = {};
  var discrepancyReasons = [];
  for (var i = 0; i < request.trolleys.length; i++) {
    var returnedTrolley = request.trolleys[i];
    var trolleyRecordId = requiredText_(returnedTrolley.trolleyRecordId, 'Trolley ' + (i + 1) + ' record ID');
    if (seenTrolleyIds[trolleyRecordId]) {
      throw new Error('The same trolley was submitted more than once. Partial or duplicate returns are not permitted.');
    }
    seenTrolleyIds[trolleyRecordId] = true;

    var saved = null;
    for (var j = 0; j < savedTrolleys.length; j++) {
      if (savedTrolleys[j].trolleyRecordId === trolleyRecordId) { saved = savedTrolleys[j]; break; }
    }
    if (!saved) throw new Error('Trolley record does not belong to this session: ' + trolleyRecordId);

    var returnQuantity = requiredInteger_(returnedTrolley.quantity, 'Return quantity for ' + saved.name, 0, 200);
    var correctTrolleyDeclaration = requiredBoolean_(returnedTrolley.correctTrolleyDeclaration, 'Correct trolley declaration for ' + saved.name);
    var sameOrientationDeclaration = requiredBoolean_(returnedTrolley.sameOrientationDeclaration, 'Orientation declaration for ' + saved.name);

    // Backward compatibility with the pre-v1 client, which carried the same
    // issue declaration on every trolley row.
    var legacyIssue = returnedTrolley.issue === true || returnedTrolley.issue === 'true';
    var legacyNotes = normaliseText_(returnedTrolley.notes);
    if (legacyIssue) sessionIssue = true;
    if (!sessionIssueNotes && legacyNotes) sessionIssueNotes = legacyNotes;

    if (returnQuantity !== saved.loanQuantity) {
      discrepancyReasons.push(saved.name + ': returned ' + returnQuantity + ' of ' + saved.loanQuantity + ' devices.');
    }
    if (!correctTrolleyDeclaration) {
      discrepancyReasons.push(saved.name + ': correct-trolley placement was not confirmed.');
    }
    if (!sameOrientationDeclaration) {
      discrepancyReasons.push(saved.name + ': same-orientation placement was not confirmed.');
    }

    validated.push({
      saved: saved,
      returnQuantity: returnQuantity,
      correctTrolleyDeclaration: correctTrolleyDeclaration,
      sameOrientationDeclaration: sameOrientationDeclaration,
      photoData: returnedTrolley.photoData
    });
  }

  var returnAccessories = request.accessories || {};
  var returnStylusQuantity = 0;
  var returnHeadphoneQuantity = 0;

  if (stylusesBooked) {
    var sr = returnAccessories.styluses || {};
    returnStylusQuantity = requiredInteger_(sr.quantity, 'Returned stylus quantity', 0, 200);
    if (returnStylusQuantity !== loanStylusQuantity) {
      discrepancyReasons.push('Styluses: returned ' + returnStylusQuantity + ' of ' + loanStylusQuantity + '.');
    }
  }
  if (headphonesBooked) {
    var hr = returnAccessories.headphones || {};
    returnHeadphoneQuantity = requiredInteger_(hr.quantity, 'Returned headphone quantity', 0, 200);
    if (returnHeadphoneQuantity !== loanHeadphoneQuantity) {
      discrepancyReasons.push('Headphones: returned ' + returnHeadphoneQuantity + ' of ' + loanHeadphoneQuantity + '.');
    }
  }

  // A clean return cannot be forged around a physical discrepancy. Quantity
  // mismatches or failed trolley declarations require the single Session-level
  // Return with issue state and a human explanation.
  if (discrepancyReasons.length && !sessionIssue) {
    throw new Error('A return discrepancy was detected. Use Return with issue and describe the discrepancy before submitting.');
  }
  if (sessionIssue && !sessionIssueNotes) {
    throw new Error('Describe the outstanding issue for the ICT Backend team.');
  }

  // These legacy schema fields are retained without requiring a separate user
  // checkbox. An accessory batch is considered physically returned when some
  // quantity is returned; a zero-at-collection accessory requires no return.
  var returnStylusBagDeclaration = stylusesBooked ? (loanStylusQuantity === 0 || returnStylusQuantity > 0) : '';
  var returnHeadphoneBagDeclaration = headphonesBooked ? (loanHeadphoneQuantity === 0 || returnHeadphoneQuantity > 0) : '';

  // Phase 1: stage photos in Drive without blocking unrelated Sheet writes.
  // Accessory photos are required only when the user declares a non-zero
  // returned quantity.
  var sessionPhotoFolder = getSessionPhotoFolder_(sessionId);
  var stylusReturnPhoto = { fileId: '', url: '' };
  var headphoneReturnPhoto = { fileId: '', url: '' };
  if (stylusesBooked && returnStylusQuantity > 0) {
    stylusReturnPhoto = savePhoto_({
      sessionId: sessionId, sessionFolder: sessionPhotoFolder, phase: 'return_accessory',
      sequence: 1, trolleyName: 'Styluses', photoData: returnAccessories.styluses && returnAccessories.styluses.photoData
    });
  }
  if (headphonesBooked && returnHeadphoneQuantity > 0) {
    headphoneReturnPhoto = savePhoto_({
      sessionId: sessionId, sessionFolder: sessionPhotoFolder, phase: 'return_accessory',
      sequence: 2, trolleyName: 'Headphones', photoData: returnAccessories.headphones && returnAccessories.headphones.photoData
    });
  }

  for (i = 0; i < validated.length; i++) {
    var stagedPhoto = savePhoto_({
      sessionId: sessionId, sessionFolder: sessionPhotoFolder, phase: 'return',
      sequence: validated[i].saved.sequence, trolleyName: validated[i].saved.name,
      photoData: validated[i].photoData
    });
    validated[i].photoFileId = stagedPhoto.fileId;
    validated[i].photoUrl = stagedPhoto.url;
  }

  // Phase 2: short authoritative commit with state revalidation.
  return withWriteLock_(function() {
    var prior = requestId ? getIdempotentResult_(requestId) : null;
    if (prior) return prior;

    var currentSessionRow = findRowByValue_(sessionSheet, 1, sessionId);
    if (!currentSessionRow) throw new Error('Session disappeared before return could be committed.');
    var currentRow = sessionSheet.getRange(currentSessionRow, 1, 1, SESSION_HEADERS.length).getValues()[0];
    var currentStatus = normaliseText_(currentRow[1]).toUpperCase();

    if (currentStatus !== 'OPEN') {
      if (currentStatus === 'RETURNED' || currentStatus === 'RETURNED WITH ISSUE' || currentStatus === 'FORCE RETURNED' || currentStatus === 'FORCED RETURN') {
        var replayResult = {
          sessionId: sessionId,
          status: currentStatus,
          returnTeacher: normaliseText_(currentRow[3]),
          returnDeviceTotal: Number(currentRow[11]) || 0,
          returnStylusQuantity: Number(currentRow[34]) || 0,
          returnHeadphoneQuantity: Number(currentRow[38]) || 0,
          returnTimestamp: currentRow[8] ? formatDate_(currentRow[8]) : '',
          alreadyRecorded: true
        };
        if (requestId) storeIdempotentResult_(requestId, replayResult);
        return replayResult;
      }
      throw new Error('Session state changed before return could be committed: ' + currentStatus);
    }

    var freshTrolleys = getTrolleyRowsForSession_(trolleySheet, sessionId);
    if (freshTrolleys.length !== validated.length) {
      throw new Error('Session trolley records changed before return could be committed.');
    }
    var freshById = {};
    for (i = 0; i < freshTrolleys.length; i++) freshById[freshTrolleys[i].trolleyRecordId] = freshTrolleys[i];

    var now = new Date();
    var returnDeviceTotal = 0;
    var hasIssue = Boolean(sessionIssue || discrepancyReasons.length);
    var returnRequests = [];

    for (i = 0; i < validated.length; i++) {
      var item = validated[i];
      var fresh = freshById[item.saved.trolleyRecordId];
      if (!fresh) throw new Error('Session trolley records changed before return could be committed.');
      queueChangedRow_(returnRequests, trolleySheet, fresh.rowNumber, fresh.values.slice(7, 16), [
          item.returnQuantity, item.photoFileId, item.photoUrl, '',
          item.correctTrolleyDeclaration, item.sameOrientationDeclaration,
          hasIssue, hasIssue ? sessionIssueNotes : '', now
        ], 8);
      returnDeviceTotal += item.returnQuantity;
    }

    var status = hasIssue ? 'RETURNED WITH ISSUE' : 'RETURNED';
    var beforeReturn = currentRow.slice();
    currentRow[1] = status;
    currentRow[3] = returnTeacher;
    currentRow[8] = now;
    currentRow[11] = returnDeviceTotal;
    currentRow[13] = returnComments;
    currentRow[15] = now;
    currentRow[19] = normaliseText_(request.authSub);
    currentRow[20] = normaliseText_(request.authEmail);
    currentRow[21] = normaliseText_(request.authTtbName) || returnTeacher;
    currentRow[24] = normaliseText_(request.authIdentityType) || 'GSPS';
    currentRow[25] = normaliseText_(request.authMobile);
    currentRow[34] = stylusesBooked ? returnStylusQuantity : '';
    currentRow[35] = stylusesBooked ? stylusReturnPhoto.fileId : '';
    currentRow[36] = stylusesBooked ? stylusReturnPhoto.url : '';
    currentRow[37] = stylusesBooked ? returnStylusBagDeclaration : '';
    currentRow[38] = headphonesBooked ? returnHeadphoneQuantity : '';
    currentRow[39] = headphonesBooked ? headphoneReturnPhoto.fileId : '';
    currentRow[40] = headphonesBooked ? headphoneReturnPhoto.url : '';
    currentRow[41] = headphonesBooked ? returnHeadphoneBagDeclaration : '';
    queueChangedRow_(returnRequests, sessionSheet, currentSessionRow, beforeReturn, currentRow);
    // Trolley evidence and Session closure succeed or fail together.
    commitSurgicalUpdates_(returnRequests);

    // Physical return is authoritative. Booking completion and audit event are
    // durable queued maintenance; their failure cannot roll back custody closure.
    queueSecondaryTask_('booking_complete', { sessionId: sessionId });
    queueSecondaryTask_('event', {
      sessionId: sessionId,
      eventType: status,
      teacher: returnTeacher,
      payload: {
        returnDeviceTotal: returnDeviceTotal,
        returnStylusQuantity: stylusesBooked ? returnStylusQuantity : 0,
        returnHeadphoneQuantity: headphonesBooked ? returnHeadphoneQuantity : 0,
        comments: returnComments,
        hasIssue: hasIssue,
        issueNotes: hasIssue ? sessionIssueNotes : '',
        discrepancyReasons: discrepancyReasons
      }
    });

    var result = {
      sessionId: sessionId,
      status: status,
      returnTeacher: returnTeacher,
      returnDeviceTotal: returnDeviceTotal,
      returnStylusQuantity: stylusesBooked ? returnStylusQuantity : 0,
      returnHeadphoneQuantity: headphonesBooked ? returnHeadphoneQuantity : 0,
      returnTimestamp: formatDate_(now)
    };
    if (requestId) storeIdempotentResult_(requestId, result);
    return result;
  });
}

function ensureNoOpenLoanForCart_(cartGroup, excludeSessionId) {
  var spreadsheet = getTransactionSpreadsheet_();
  assertSessionSchema_(spreadsheet);
  var sheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.SESSIONS);
  if (sheet.getLastRow() < 2) return;

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  for (var i = 0; i < rows.length; i++) {
    var sessionId = normaliseText_(rows[i][0]);
    var status = normaliseText_(rows[i][1]).toUpperCase();
    if (excludeSessionId && sessionId === excludeSessionId) continue;
    if ((status === 'OPEN' || status === 'PENDING_COLLECTION') &&
        normaliseText_(rows[i][6]) === cartGroup) {
      throw new Error('This cart already has an active or pending loan: ' + sessionId);
    }
  }
}

function getOpenSessions_(teacherFilter) {
  var spreadsheet = getTransactionSpreadsheet_();
  assertSessionSchema_(spreadsheet);
  var sheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.SESSIONS);

  if (sheet.getLastRow() < 2) {
    return [];
  }

  var rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, SESSION_HEADERS.length)
    .getValues();
  var filter = normaliseText_(teacherFilter).toLowerCase();
  var output = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];

    if (normaliseText_(row[1]) !== 'OPEN') {
      continue;
    }

    if (filter && normaliseText_(row[2]).toLowerCase().indexOf(filter) === -1) {
      continue;
    }

    output.push({
      sessionId: row[0],
      status: row[1],
      teacher: row[2],
      classOrActivity: row[4],
      subject: row[5],
      cartGroup: row[6],
      loanTimestamp: formatDate_(row[7]),
      trolleyCount: Number(row[9]) || 0,
      deviceTotal: Number(row[10]) || 0,
      stylusesBooked: row[26] === true || String(row[26]).toLowerCase() === 'true',
      headphonesBooked: row[27] === true || String(row[27]).toLowerCase() === 'true',
      stylusQuantity: Number(row[28]) || 0,
      headphoneQuantity: Number(row[31]) || 0,
      comments: row[12]
    });
  }

  output.reverse();
  return output;
}

function getSession_(sessionId) {
  var spreadsheet = getTransactionSpreadsheet_();
  assertSessionSchema_(spreadsheet);
  var sessionSheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.SESSIONS);
  var rowNumber = findRowByValue_(sessionSheet, 1, sessionId);

  if (!rowNumber) {
    throw new Error('Session not found: ' + sessionId);
  }

  var row = sessionSheet
    .getRange(rowNumber, 1, 1, SESSION_HEADERS.length)
    .getValues()[0];

  var trolleySheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.TROLLEYS);
  var savedTrolleys = getTrolleyRowsForSession_(trolleySheet, sessionId);
  var trolleys = [];

  for (var i = 0; i < savedTrolleys.length; i++) {
    trolleys.push({
      trolleyRecordId: savedTrolleys[i].trolleyRecordId,
      sequence: savedTrolleys[i].sequence,
      name: savedTrolleys[i].name,
      loanQuantity: savedTrolleys[i].loanQuantity,
      loanPhotoUrl: savedTrolleys[i].loanPhotoUrl
    });
  }

  return {
    sessionId: row[0],
    status: row[1],
    loanTeacher: row[2],
    returnTeacher: row[3],
    classOrActivity: row[4],
    subject: row[5],
    cartGroup: row[6],
    loanTimestamp: formatDate_(row[7]),
    returnTimestamp: formatDate_(row[8]),
    loanTrolleyCount: Number(row[9]) || 0,
    loanDeviceTotal: Number(row[10]) || 0,
    returnDeviceTotal: Number(row[11]) || 0,
    loanComments: row[12],
    returnComments: row[13],
    stylusesBooked: row[26] === true || String(row[26]).toLowerCase() === 'true',
    headphonesBooked: row[27] === true || String(row[27]).toLowerCase() === 'true',
    stylusQuantity: Number(row[28]) || 0,
    stylusLoanPhotoFileId: normaliseText_(row[29]),
    stylusLoanPhotoUrl: normaliseText_(row[30]),
    headphoneQuantity: Number(row[31]) || 0,
    headphoneLoanPhotoFileId: normaliseText_(row[32]),
    headphoneLoanPhotoUrl: normaliseText_(row[33]),
    returnStylusQuantity: Number(row[34]) || 0,
    stylusReturnPhotoFileId: normaliseText_(row[35]),
    stylusReturnPhotoUrl: normaliseText_(row[36]),
    stylusBagReturned: row[37] === true || String(row[37]).toLowerCase() === 'true',
    returnHeadphoneQuantity: Number(row[38]) || 0,
    headphoneReturnPhotoFileId: normaliseText_(row[39]),
    headphoneReturnPhotoUrl: normaliseText_(row[40]),
    headphoneBagReturned: row[41] === true || String(row[41]).toLowerCase() === 'true',
    trolleys: trolleys
  };
}

function validateLoanTrolleys_(trolleys) {
  if (!trolleys || Object.prototype.toString.call(trolleys) !== '[object Array]' ||
      trolleys.length < 1) {
    throw new Error('Select at least one trolley.');
  }

  if (trolleys.length > 10) {
    throw new Error('Too many trolleys in one session.');
  }

  var names = {};
  var output = [];

  for (var i = 0; i < trolleys.length; i++) {
    var trolley = trolleys[i];
    var name = requiredText_(trolley.name, 'Trolley ' + (i + 1) + ' name');
    var duplicateKey = name.toLowerCase();

    if (names[duplicateKey]) {
      throw new Error('Duplicate trolley selected: ' + name);
    }

    names[duplicateKey] = true;

    output.push({
      name: name,
      quantity: requiredInteger_(
        trolley.quantity,
        'Quantity for ' + name,
        1,
        200
      ),
      photoData: requiredText_(trolley.photoData, 'Photo for ' + name)
    });
  }

  return output;
}

function sanitiseFileName_(value) {
  var text = normaliseText_(value);
  if (!text) return 'item';
  text = text
    .replace(/[\\\/:*?"<>|]/g, '_')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);
  return text || 'item';
}

function savePhoto_(details) {
  var data = requiredText_(details.photoData, 'Photo');
  var match = data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error('Photo format is invalid.');
  var contentType = match[1];
  var bytes = Utilities.base64Decode(match[2]);
  var extension = contentType === 'image/png' ? 'png' : (contentType === 'image/webp' ? 'webp' : 'jpg');
  var sessionFolder = details.sessionFolder || getSessionPhotoFolder_(details.sessionId);
  var fileName = [
    details.sessionId,
    details.phase,
    details.sequence,
    sanitiseFileName_(details.trolleyName),
    Utilities.formatDate(new Date(), LORD_CONFIG.TIME_ZONE, 'yyyyMMdd-HHmmss')
  ].join('_') + '.' + extension;
  var blob = Utilities.newBlob(bytes, contentType, fileName);
  var metrics = executionContext_().requestMetrics;
  if (metrics) metrics.photoCount++;
  return measureBackendPhase_('photoMs', function() {
    var file = sessionFolder.createFile(blob);
    return { fileId: file.getId(), url: file.getUrl() };
  });
}

function getOrCreateFolder_(parentFolder, folderName) {
  var folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(folderName);
}

function getTrolleyRowsForSession_(sheet, sessionId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var matches = sheet.getRange(2, 2, lastRow - 1, 1)
    .createTextFinder(String(sessionId || '')).matchEntireCell(true).matchCase(true).findAll();
  var rowNumbers = matches.map(function(match){ return match.getRow(); }).sort(function(a,b){ return a-b; });
  var output = [];
  for (var i = 0; i < rowNumbers.length;) {
    var first = rowNumbers[i], count = 1;
    while (i + count < rowNumbers.length && rowNumbers[i + count] === first + count) count++;
    var rows = sheet.getRange(first, 1, count, TROLLEY_HEADERS.length).getValues();
    for (var j = 0; j < rows.length; j++) {
      var row = rows[j];
      // Do not cache row numbers across requests or locks: REIGN can compact rows.
      if (normaliseText_(row[1]) !== sessionId) continue;
      output.push({
        rowNumber: first + j, trolleyRecordId: normaliseText_(row[0]),
        sessionId: normaliseText_(row[1]), sequence: Number(row[2]),
        name: normaliseText_(row[3]), loanQuantity: Number(row[4]),
        loanPhotoFileId: normaliseText_(row[5]), loanPhotoUrl: normaliseText_(row[6]),
        values: row
      });
    }
    i += count;
  }
  output.sort(function(a,b){ return a.sequence-b.sequence; });
  return output;
}

function appendEvent_(details) {
  var sheet = getRequiredSheet_(
    details.spreadsheet,
    LORD_CONFIG.SHEETS.EVENTS
  );

  sheet.appendRow([
    Utilities.getUuid(),
    details.sessionId,
    details.eventType,
    new Date(),
    details.teacher,
    JSON.stringify(details.payload || {})
  ]);
}

function createSessionId_() {
  var timestamp = Utilities.formatDate(
    new Date(),
    LORD_CONFIG.TIME_ZONE,
    'yyyyMMdd-HHmmss'
  );
  var suffix = Utilities.getUuid()
    .replace(/-/g, '')
    .slice(0, 6)
    .toUpperCase();
  return 'LORD-' + timestamp + '-' + suffix;
}

function parsePostRequest_(e) {
  var rawBody = e && e.postData ? e.postData.contents : '';

  if (rawBody) {
    try {
      return JSON.parse(rawBody);
    } catch (jsonError) {
      if (e && e.parameter && e.parameter.payload) {
        return JSON.parse(e.parameter.payload);
      }
      throw new Error('Invalid JSON request body.');
    }
  }

  if (e && e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }

  return e && e.parameter ? e.parameter : {};
}

function assertSessionSchema_(spreadsheet) {
  spreadsheet = spreadsheet || getTransactionSpreadsheet_();
  var ctx = executionContext_();
  var verified = ctx.sessionSchemaValidated || (ctx.sessionSchemaValidated = Object.create(null));
  var workbookId = spreadsheet.getId();
  if (verified[workbookId]) return true;
  var sheet = spreadsheet.getSheetByName(LORD_CONFIG.SHEETS.SESSIONS);
  if (!sheet) throw new Error('Required sheet not found: ' + LORD_CONFIG.SHEETS.SESSIONS);
  if (sheet.getMaxColumns() < SESSION_HEADERS.length) {
    throw new Error('Sessions schema is incomplete. Run migrateLORDWorkbookV1() before using the live system.');
  }
  var existing = sheet.getRange(1, 1, 1, SESSION_HEADERS.length).getDisplayValues()[0];
  for (var i = 0; i < SESSION_HEADERS.length; i++) {
    if (String(existing[i] || '') !== SESSION_HEADERS[i]) {
      throw new Error(
        'Sessions schema mismatch at column ' + (i + 1) + ': expected "' +
        SESSION_HEADERS[i] + '", found "' + String(existing[i] || '') +
        '". Run migrateLORDWorkbookV1() explicitly; runtime reads will not mutate schema.'
      );
    }
  }
  verified[workbookId] = true;
  return true;
}

function createOrResetHeader_(spreadsheet, sheetName, headers) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

function migrateLORDWorkbookV1() {
  setupLORDV1Workbook();
  return 'LORD v1 schema verified. Existing data rows were preserved.';
}

function formatWorkbook_(spreadsheet) {
  var sheetNames = [
    LORD_CONFIG.SHEETS.SESSIONS,
    LORD_CONFIG.SHEETS.TROLLEYS,
    LORD_CONFIG.SHEETS.EVENTS
  ];

  for (var i = 0; i < sheetNames.length; i++) {
    var sheet = spreadsheet.getSheetByName(sheetNames[i]);
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
    sheet.autoResizeColumns(1, sheet.getLastColumn());
  }

  spreadsheet.getSheetByName(LORD_CONFIG.SHEETS.SESSIONS)
    .getRange('H:I')
    .setNumberFormat('dd mmm yyyy hh:mm:ss');
  spreadsheet.getSheetByName(LORD_CONFIG.SHEETS.SESSIONS)
    .getRange('O:P')
    .setNumberFormat('dd mmm yyyy hh:mm:ss');
  spreadsheet.getSheetByName(LORD_CONFIG.SHEETS.TROLLEYS)
    .getRange('P:P')
    .setNumberFormat('dd mmm yyyy hh:mm:ss');
  spreadsheet.getSheetByName(LORD_CONFIG.SHEETS.EVENTS)
    .getRange('D:D')
    .setNumberFormat('dd mmm yyyy hh:mm:ss');
}

function findRowByValue_(sheet, columnNumber, searchValue) {
  if (sheet.getLastRow() < 2) return 0;
  var range = sheet.getRange(2, columnNumber, sheet.getLastRow() - 1, 1);
  var match = range.createTextFinder(String(searchValue || ''))
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();
  return match ? match.getRow() : 0;
}

function getRequiredSheet_(spreadsheet, sheetName) {
  var ctx = executionContext_();
  if (!ctx.sheetCache) ctx.sheetCache = {};
  var spreadsheetId = '';
  try { spreadsheetId = spreadsheet.getId(); } catch (ignore) {}
  var key = spreadsheetId + '::' + sheetName;
  if (ctx.sheetCache[key]) return ctx.sheetCache[key];

  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(
      'Required sheet not found: ' + sheetName +
      '. Run the relevant setup function first.'
    );
  }
  ctx.sheetCache[key] = sheet;
  return sheet;
}

function requiredText_(value, fieldName) {
  var text = normaliseText_(value);
  if (!text) {
    throw new Error(fieldName + ' is required.');
  }
  return text;
}

function normaliseText_(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function requiredInteger_(value, fieldName, minimum, maximum) {
  var number = Number(value);
  if (!isFinite(number) || Math.floor(number) !== number ||
      number < minimum || number > maximum) {
    throw new Error(
      fieldName + ' must be a whole number from ' +
      minimum + ' to ' + maximum + '.'
    );
  }
  return number;
}

function requiredBoolean_(value, fieldName) {
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }
  throw new Error(fieldName + ' must be confirmed.');
}

function formatDate_(value) {
  if (!value) {
    return '';
  }

  var date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) {
    return '';
  }

  return Utilities.formatDate(
    date,
    LORD_CONFIG.TIME_ZONE,
    'dd MMM yyyy, hh:mm a'
  );
}

function getErrorMessage_(error) {
  if (error && error.message) {
    return error.message;
  }
  return String(error);
}

function padNumber_(value, width) {
  var text = String(value);
  while (text.length < width) {
    text = '0' + text;
  }
  return text;
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}


/* =========================
 * BOOKING SERVICE
 * ========================= */

var BOOKING_HEADERS = [
  'Booking ID',
  'Status',
  'Teacher TTB Name',
  'GSPS Email',
  'Class or Student Group',
  'Subject',
  'Booking Date',
  'Resource',
  'Device Type',
  'Requested Quantity',
  'Start Period',
  'End Period',
  'Headphones',
  'Styluses',
  'Other Remarks',
  'Edit Token Hash',
  'Edit Code Hash',
  'Created At',
  'Updated At',
  'Cancelled At',
  'Collected Session ID',
  'Back Timed',
  'Buffer Override Used',
  'Override Reason',
  'Owner Google Sub',
  'Owner Verified Email',
  'Owner TTB Name',
  'Created By Google Sub',
  'Created By Verified Email',
  'Created By TTB Name'
];

function setupBookingSheet() {
  var spreadsheet = getTransactionSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(BOOKING_CONFIG.SHEET);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(BOOKING_CONFIG.SHEET);
  }

  sheet.getRange(1, 1, 1, BOOKING_HEADERS.length)
    .setValues([BOOKING_HEADERS])
    .setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, BOOKING_HEADERS.length);
  sheet.getRange('G:G').setNumberFormat('dd mmm yyyy');
  sheet.getRange('R:T').setNumberFormat('dd mmm yyyy hh:mm:ss');
}

function bookingDaySchedule_(request) {
  var date = requiredText_(request.date, 'Booking date');
  var cacheKey = 'lord_booking_day_' + String(date).slice(0,10);
  var cache = CacheService.getScriptCache();
  var cached = executionContext_().forceRefresh ? null : cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  var spreadsheet = getTransactionSpreadsheet_();
  var sheet = getRequiredSheet_(spreadsheet, BOOKING_CONFIG.SHEET);
  var output = [];
  if (sheet.getLastRow() < 2) { cache.put(cacheKey, '[]', 45); return output; }

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, BOOKING_HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row[1] !== 'BOOKED' && row[1] !== 'COLLECTED') {
      continue;
    }
    var rowDate = Utilities.formatDate(new Date(row[6]), BOOKING_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
    if (rowDate !== String(date).slice(0, 10)) {
      continue;
    }
    output.push({
      bookingId: String(row[0]),
      status: String(row[1]),
      teacher: String(row[2]),
      classOrActivity: String(row[4]),
      subject: String(row[5]),
      resource: String(row[7]),
      requestedQuantity: Number(row[9]) || 0,
      startPeriod: String(row[10]),
      endPeriod: String(row[11]),
      headphones: row[12] === true,
      styluses: row[13] === true,
      remarks: String(row[14] || '')
    });
  }
  cache.put(cacheKey, JSON.stringify(output), 45);
  return output;
}

function bookingAvailability_(request) {
  var conflict = analyseBookingConflict_(request);

  return {
    available: !conflict,
    conflictType: conflict ? conflict.type : '',
    overrideAllowed: conflict ? conflict.type === 'BUFFER' : false,
    conflictSummary: conflict ?
      conflict.teacher + ' · ' + conflict.classOrActivity +
      ' · P' + conflict.startPeriod + ' to P' + conflict.endPeriod : ''
  };
}

function analyseBookingConflict_(request) {
  var date = requiredText_(request.date, 'Booking date');
  var resource = requiredText_(request.resource, 'Resource');
  var startPeriod = requiredText_(request.startPeriod, 'Start period');
  var endPeriod = requiredText_(request.endPeriod, 'End period');

  return findBookingConflict_(
    date,
    resource,
    startPeriod,
    endPeriod,
    normaliseText_(request.excludeBookingId)
  );
}

function createBooking_(request) {
  var prepared = prepareBooking_(request);
  var sheet = getRequiredSheet_(getTransactionSpreadsheet_(), BOOKING_CONFIG.SHEET);
  executionContext_().commitAttempted = true;
  sheet.appendRow(prepared.row);
  finishPreparedBooking_(prepared);
  return prepared.result;
}

function finishPreparedBooking_(prepared) {
  // The Sheet commit is authoritative. Maintenance failures must not tell a
  // teacher to submit a booking that was already recorded.
  try { clearBookingDayCache_(prepared.result.date); }
  catch (error) { noteMaintenanceFailure_('booking_cache', error); }
  enqueueSecondary_('booking_email', prepared.emailTask);
  enqueueSecondary_('event', prepared.eventTask);
}

function createBookingBatch_(request) {
  var items = request.bookings;
  if (!Array.isArray(items) || !items.length || items.length > 20) {
    throw new Error('Submit between 1 and 20 bookings together.');
  }
  var requestId = requiredText_(request.clientRequestId, 'Request ID');
  if (requestId.length > 200) throw new Error('Request ID is too long.');
  var spreadsheet = getTransactionSpreadsheet_();
  var sheet = getRequiredSheet_(spreadsheet, BOOKING_CONFIG.SHEET);
  var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, BOOKING_HEADERS.length).getValues();
  var periodOrder = getPeriodOrder_();
  var batchHash = hashBookingValue_(requestId + '|' + normaliseText_(request.authEmail).toLowerCase() + '|' + normaliseText_(request.authSub), bookingTokenPepper_()).slice(0, 20).toUpperCase();
  var ids = items.map(function(item, index) { return 'BOOK-B' + batchHash + '-' + (index + 1); });
  var existing = rows.filter(function(row) { return ids.indexOf(String(row[0])) !== -1; });
  if (existing.length && existing.length !== items.length) throw new Error('An earlier batch is incomplete. Ask the administrator to check it before retrying.');
  var candidates = rows.filter(function(row) { return ids.indexOf(String(row[0])) === -1; });
  var prepared = [];
  for (var i = 0; i < items.length; i++) {
    if (!items[i] || typeof items[i] !== 'object' || Array.isArray(items[i])) throw new Error('Each booking must be an object.');
    var itemRequest = Object.assign({}, request, items[i]);
    // Only the top-level identity supplied by the trusted Worker may authorize
    // the batch. Nested browser fields never elevate a single item.
    ['authEmail', 'authSub', 'authTtbName', 'authIsAdmin', 'authIdentityType', 'authMobile'].forEach(function(key) {
      itemRequest[key] = request[key];
    });
    var entry = prepareBooking_(itemRequest, { rows: candidates, periodOrder: periodOrder, bookingId: ids[i] });
    prepared.push(entry);
    candidates.push(entry.row);
  }
  if (existing.length) {
    // Deterministic IDs also recover a committed batch whose receipt could not
    // be saved. Reject reuse of the same request ID with different contents.
    var comparable = [2,3,4,5,7,8,9,10,11,12,13,14,23,24,25,26,27,28,29];
    for (var r = 0; r < prepared.length; r++) {
      var old = existing.filter(function(row) { return String(row[0]) === ids[r]; })[0];
      var expected = prepared[r].row;
      if (!old || Utilities.formatDate(new Date(old[6]), BOOKING_CONFIG.TIME_ZONE, 'yyyy-MM-dd') !== prepared[r].result.date ||
          comparable.some(function(col) { return String(old[col] == null ? '' : old[col]) !== String(expected[col] == null ? '' : expected[col]); })) {
        throw new Error('This request ID was already used for different booking details. Reload before starting a new booking.');
      }
      prepared[r].result.status = String(old[1]);
      prepared[r].result.backTimed = old[21] === true;
    }
    return { bookings: prepared.map(function(entry) { return entry.result; }), count: prepared.length, alreadyRecorded: true };
  }
  var updates = [];
  queueNewRows_(updates, sheet, sheet.getLastRow() + 1, prepared.map(function(entry) { return entry.row; }));
  // One atomic request commits every new row or none. doPost holds the shared
  // write lock during the read, conflict checks and this commit.
  commitSurgicalUpdates_(updates);
  prepared.forEach(finishPreparedBooking_);
  return { bookings: prepared.map(function(entry) { return entry.result; }), count: prepared.length };
}

function prepareBooking_(request, options) {
  options = options || {};
  var authenticatedAdmin = isAuthenticatedAdmin_(request);
  var requestedBookFor = normaliseText_(request.bookingForTtbName);
  var teacher = requiredText_(authenticatedAdmin && requestedBookFor ? requestedBookFor : (request.authTtbName || request.teacher), 'Teacher');
  var ownerGspsEmail = getGspsEmailForTtbName_(teacher);
  var isOnBehalfBooking = authenticatedAdmin && requestedBookFor &&
    teacher !== normaliseText_(request.authTtbName);

  var recipientEmails = getBookingNotificationEmails_(
    teacher,
    isOnBehalfBooking ? ownerGspsEmail : request.authEmail
  );

  var creatorEmails = [];
  if (isOnBehalfBooking) {
    creatorEmails = getBookingNotificationEmails_(
      normaliseText_(request.authTtbName),
      normaliseText_(request.authEmail)
    );
  }

  var emails = mergeUniqueBookingEmails_(recipientEmails, creatorEmails);
  var email = emails.join(',');

  if (!recipientEmails.length) {
    throw new Error('No valid GSPS email is available for the booking recipient.');
  }

  var date = requiredText_(request.date, 'Booking date');
  var resource = requiredText_(request.resource, 'Resource');
  var startPeriod = requiredText_(request.startPeriod, 'Start period');
  var endPeriod = requiredText_(request.endPeriod, 'End period');
  var conflict = options.rows ? findBookingConflictInRows_(options.rows, options.periodOrder, date, resource, startPeriod, endPeriod, '') :
    findBookingConflict_(date, resource, startPeriod, endPeriod, '');
  var overrideResult = authoriseConflict_(
    conflict,
    request.overrideReason,
    authenticatedAdmin
  );

  var bookingId = options.bookingId || createBookingId_();
  var editToken = createBookingToken_();
  var editCode = String(Math.floor(100000 + Math.random() * 900000));
  var now = new Date();
  var backTimed = isBackTimed_(date, startPeriod, now);
  var spreadsheet = getTransactionSpreadsheet_();
  var sheet = getRequiredSheet_(spreadsheet, BOOKING_CONFIG.SHEET);
  var classOrActivity = requiredText_(
    request.classOrActivity,
    'Class or student group'
  );
  var subject = requiredText_(request.subject, 'Subject');
  var deviceType = requiredText_(request.deviceType, 'Device type');
  var requestedQuantity = requiredInteger_(
    request.requestedQuantity,
    'Requested quantity',
    1,
    200
  );
  var headphones = request.headphones === true || request.headphones === 'true';
  var styluses = request.styluses === true || request.styluses === 'true';
  var remarks = normaliseText_(request.remarks);

  var row = [
    bookingId,
    'BOOKED',
    teacher,
    email,
    classOrActivity,
    subject,
    new Date(date + 'T00:00:00'),
    resource,
    deviceType,
    requestedQuantity,
    startPeriod,
    endPeriod,
    headphones,
    styluses,
    remarks,
    hashBookingValue_(editToken, bookingTokenPepper_()),
    hashBookingValue_(editCode, bookingCodePepper_()),
    now,
    now,
    '',
    '',
    backTimed,
    overrideResult.used,
    overrideResult.reason,
    authenticatedAdmin && requestedBookFor && teacher !== normaliseText_(request.authTtbName) ? '' : normaliseText_(request.authSub),
    ownerGspsEmail || normaliseText_(request.authEmail),
    teacher,
    normaliseText_(request.authSub),
    normaliseText_(request.authEmail),
    normaliseText_(request.authTtbName)
  ];

  var editUrl = buildBookingEditUrl_(
    request.editBaseUrl,
    bookingId,
    editToken
  );

  var bookingEmailTask = {
    bookingId: bookingId,
    editCode: editCode,
    editUrl: editUrl,
    teacher: teacher,
    email: email,
    date: date,
    resource: resource,
    deviceType: deviceType,
    requestedQuantity: requestedQuantity,
    startPeriod: startPeriod,
    endPeriod: endPeriod,
    classOrActivity: classOrActivity,
    subject: subject,
    headphones: headphones,
    styluses: styluses,
    remarks: remarks,
    backTimed: backTimed,
    createdBy: normaliseText_(request.authTtbName),
    onBehalf: isOnBehalfBooking
  };


  var bookingEventTask = {
    spreadsheet: spreadsheet,
    sessionId: bookingId,
    eventType: overrideResult.used ?
      'BOOKING_CREATED_BUFFER_OVERRIDE' : 'BOOKING_CREATED',
    teacher: teacher,
    payload: {
      date: date,
      resource: resource,
      startPeriod: startPeriod,
      endPeriod: endPeriod,
      requestedQuantity: requestedQuantity,
      backTimed: backTimed,
      overrideReason: overrideResult.reason,
      bookedFor: teacher,
      createdBy: normaliseText_(request.authTtbName)
    }
  };


  var result = {
    bookingId: bookingId,
    status: 'BOOKED',
    resource: resource,
    date: date,
    periodRange: 'P' + startPeriod + ' to P' + endPeriod,
    requestedQuantity: requestedQuantity,
    maskedEmail: emails.map(maskBookingEmail_).join(' and '),
    backTimed: backTimed
  };
  return { row: row, result: result, emailTask: bookingEmailTask, eventTask: bookingEventTask };
}

function getBookingForEdit_(bookingId, token, code, adminPasskey) {
  var row = findBookingRow_(bookingId);

  if (!row) {
    throw new Error('Booking not found.');
  }

  var validCredential = validateBookingCredential_(row.values, token, code);
  if (!validCredential) {
    throw new Error('Invalid booking credentials.');
  }

  return bookingPublic_(row.values);
}

function updateBooking_(request) {
  var row = findBookingRow_(requiredText_(request.bookingId, 'Booking ID'));
  if (!row) throw new Error('Booking not found.');
  var admin = isAuthenticatedAdmin_(request);
  if (!admin) throw new Error('Only an identified administrator may edit a saved booking.');
  if (row.values[1] !== 'BOOKED') throw new Error('Booking cannot be edited. Status: ' + row.values[1]);

  var originalDate = Utilities.formatDate(new Date(row.values[6]), BOOKING_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  var newTeacher = requiredText_(request.teacher || row.values[2], 'Teacher');
  var fallbackEmail = isBookingOwner_(row.values, request) ? normaliseText_(request.authEmail) : normaliseText_(row.values[25]);
  var newEmails = getBookingNotificationEmails_(newTeacher, fallbackEmail);
  if (!newEmails.length) throw new Error('No valid school email is available for this booking owner.');

  var date = requiredText_(request.date, 'Booking date');
  var resource = requiredText_(request.resource, 'Resource');
  var startPeriod = requiredText_(request.startPeriod, 'Start period');
  var endPeriod = requiredText_(request.endPeriod, 'End period');
  var conflict = findBookingConflict_(date, resource, startPeriod, endPeriod, row.values[0]);
  var overrideResult = authoriseConflict_(conflict, request.overrideReason, admin);
  var before = bookingPublic_(row.values);
  var now = new Date();
  var values = row.values.slice();

  values[2] = newTeacher;
  values[3] = newEmails.join(',');
  values[4] = requiredText_(request.classOrActivity, 'Class or student group');
  values[5] = requiredText_(request.subject, 'Subject');
  values[6] = new Date(date + 'T00:00:00');
  values[7] = resource;
  values[8] = requiredText_(request.deviceType, 'Device type');
  values[9] = requiredInteger_(request.requestedQuantity, 'Requested quantity', 1, 200);
  values[10] = startPeriod;
  values[11] = endPeriod;
  values[12] = request.headphones === true || request.headphones === 'true';
  values[13] = request.styluses === true || request.styluses === 'true';
  values[14] = normaliseText_(request.remarks);
  values[18] = now;
  values[21] = isBackTimed_(date, startPeriod, now);
  values[22] = overrideResult.used;
  values[23] = overrideResult.reason;
  if (newTeacher !== row.values[2]) {
    values[24] = '';
    values[25] = getGspsEmailForTtbName_(newTeacher);
    values[26] = newTeacher;
  }

  writeChangedRow_(row.sheet, row.rowNumber, row.values, values);
  clearBookingDayCache_(originalDate);
  if (date !== originalDate) clearBookingDayCache_(date);

  var event = {
    sessionId: row.values[0],
    eventType: 'ADMIN_EDIT',
    teacher: newTeacher,
    payload: {
      before: before,
      after: { date: date, resource: resource, startPeriod: startPeriod, endPeriod: endPeriod },
      reason: normaliseText_(request.overrideReason)
    }
  };
  enqueueSecondary_('event', event, function() {
    return appendEvent_({ spreadsheet: getTransactionSpreadsheet_(), sessionId: event.sessionId, eventType: event.eventType, teacher: event.teacher, payload: event.payload });
  });
  return { bookingId: row.values[0], status: 'BOOKED' };
}

function cancelBooking_(request) {
  var row = findBookingRow_(requiredText_(request.bookingId, 'Booking ID'));
  if (!row) throw new Error('Booking not found.');
  var admin = isAuthenticatedAdmin_(request);
  var credential = validateBookingCredential_(row.values, request.editToken, request.editCode);
  var owner = isBookingOwner_(row.values, request);
  if (!admin && !credential && !owner) throw new Error('Invalid edit credentials.');
  if (row.values[1] !== 'BOOKED') throw new Error('Booking cannot be cancelled. Status: ' + row.values[1]);
  if (row.values[20] && !admin) throw new Error('A collected booking can only be cancelled by an identified administrator.');

  var now = new Date();
  var values = row.values.slice();
  values[1] = 'CANCELLED';
  values[18] = now;
  values[19] = now;
  writeChangedRow_(row.sheet, row.rowNumber, row.values, values);
  var date = Utilities.formatDate(new Date(row.values[6]), BOOKING_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  clearBookingDayCache_(date);

  var event = { sessionId: row.values[0], eventType: admin ? 'ADMIN_CANCEL' : 'BOOKING_CANCELLED', teacher: row.values[2], payload: { reason: normaliseText_(request.overrideReason) } };
  enqueueSecondary_('event', event, function() {
    return appendEvent_({ spreadsheet: getTransactionSpreadsheet_(), sessionId: event.sessionId, eventType: event.eventType, teacher: event.teacher, payload: event.payload });
  });
  return { bookingId: row.values[0], status: 'CANCELLED' };
}

function listEligibleBookings_(request) {
  var date = normaliseText_(request.date);
  if (!date) {
    date = Utilities.formatDate(
      new Date(),
      BOOKING_CONFIG.TIME_ZONE,
      'yyyy-MM-dd'
    );
  }

  var spreadsheet = getTransactionSpreadsheet_();
  var sheet = getRequiredSheet_(spreadsheet, BOOKING_CONFIG.SHEET);

  if (sheet.getLastRow() < 2) {
    return [];
  }

  var rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, BOOKING_HEADERS.length)
    .getValues();
  var output = [];
  var teacherFilter = normaliseText_(request.teacher).toLowerCase();
  var resourceFilter = normaliseText_(request.resource);

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowDate = Utilities.formatDate(
      new Date(row[6]),
      BOOKING_CONFIG.TIME_ZONE,
      'yyyy-MM-dd'
    );

    if (row[1] !== 'BOOKED' || row[20] || rowDate !== date) {
      continue;
    }

    if (teacherFilter &&
        String(row[2]).toLowerCase().indexOf(teacherFilter) === -1) {
      continue;
    }

    if (resourceFilter && String(row[7]) !== resourceFilter) {
      continue;
    }

    output.push(bookingPublic_(row));
  }

  output.sort(function (a, b) {
    var periodDiff = Number(a.startPeriod) - Number(b.startPeriod);
    if (periodDiff !== 0) {
      return periodDiff;
    }
    return a.resource.localeCompare(b.resource);
  });

  return output;
}

function linkBookingCollection_(request, deferredRequests) {
  var bookingId = requiredText_(request.bookingId, 'Booking ID');
  var sessionId = requiredText_(request.sessionId, 'Session ID');
  var row = findBookingRow_(bookingId);
  if (!row) throw new Error('Booking not found.');
  var status = String(row.values[1] || '').toUpperCase();
  var linked = String(row.values[20] || '');
  if ((status === 'COLLECTED' || status === 'COMPLETED') && linked === sessionId) {
    return { bookingId: bookingId, status: status, sessionId: sessionId, alreadyLinked: true };
  }
  if (status !== 'BOOKED') throw new Error('Booking is ' + row.values[1] + '.');
  if (linked && linked !== sessionId) throw new Error('Booking is already linked to another session.');

  var values = row.values.slice();
  values[1] = 'COLLECTED';
  values[20] = sessionId;
  values[18] = new Date();
  if (deferredRequests) {
    queueChangedRow_(deferredRequests, row.sheet, row.rowNumber, row.values, values);
  } else {
    writeChangedRow_(row.sheet, row.rowNumber, row.values, values);
    clearBookingDayCache_(Utilities.formatDate(new Date(row.values[6]), BOOKING_CONFIG.TIME_ZONE, 'yyyy-MM-dd'));
  }
  return { bookingId: bookingId, status: 'COLLECTED', sessionId: sessionId };
}

function completeBookingBySession_(request) {
  var sessionId = requiredText_(request.sessionId, 'Session ID');
  var spreadsheet = getTransactionSpreadsheet_();
  var sheet = getRequiredSheet_(spreadsheet, BOOKING_CONFIG.SHEET);
  if (sheet.getLastRow() < 2) return { sessionId: sessionId, status: 'NO_LINK' };

  var match = sheet.getRange(2, 21, sheet.getLastRow() - 1, 1)
    .createTextFinder(sessionId)
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();
  if (!match) return { sessionId: sessionId, status: 'NO_LINK' };

  var rowNumber = match.getRow();
  var values = sheet.getRange(rowNumber, 1, 1, BOOKING_HEADERS.length).getValues()[0];
  var status = String(values[1] || '').toUpperCase();
  if (status === 'COMPLETED') {
    return { bookingId: values[0], status: 'COMPLETED', sessionId: sessionId, alreadyCompleted: true };
  }
  if (status !== 'COLLECTED' && status !== 'BOOKED') {
    throw new Error('Linked booking cannot be completed. Status: ' + status);
  }
  var beforeComplete = values.slice();
  values[1] = 'COMPLETED';
  values[18] = new Date();
  writeChangedRow_(sheet, rowNumber, beforeComplete, values);
  clearBookingDayCache_(Utilities.formatDate(new Date(values[6]), BOOKING_CONFIG.TIME_ZONE, 'yyyy-MM-dd'));
  return { bookingId: values[0], status: 'COMPLETED', sessionId: sessionId };
}

function getBookingInternalById_(bookingId) {
  var row = findBookingRow_(bookingId);
  if (!row) {
    return null;
  }
  return bookingPublic_(row.values);
}

function authoriseConflict_(conflict, reason, authenticatedAdmin) {
  if (!conflict) return { used: false, reason: '' };

  if (conflict.type === 'OVERLAP') {
    throw new Error(
      'This cart overlaps an existing booking by ' + conflict.teacher +
      ' for P' + conflict.startPeriod + ' to P' + conflict.endPeriod +
      '. Overlap cannot be overridden.'
    );
  }

  if (!authenticatedAdmin) {
    throw new Error(
      'BUFFER_OVERRIDE_REQUIRED|This cart has a consecutive booking by ' +
      conflict.teacher + ' for P' + conflict.startPeriod + ' to P' +
      conflict.endPeriod + '. One free period is required.'
    );
  }

  return { used: true, reason: requiredText_(reason, 'Override reason') };
}

function findBookingConflict_(date, resource, startPeriod, endPeriod, excludeId) {
  var sheet = getRequiredSheet_(getTransactionSpreadsheet_(), BOOKING_CONFIG.SHEET);
  var periodOrder = getPeriodOrder_();
  var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, BOOKING_HEADERS.length).getValues();
  return findBookingConflictInRows_(rows, periodOrder, date, resource, startPeriod, endPeriod, excludeId);
}

function findBookingConflictInRows_(rows, periodOrder, date, resource, startPeriod, endPeriod, excludeId) {
  var startIndex = periodOrder.indexOf(String(startPeriod));
  var endIndex = periodOrder.indexOf(String(endPeriod));
  if (startIndex < 0 || endIndex < 0) throw new Error('Unknown period.');
  var low = Math.min(startIndex, endIndex);
  var high = Math.max(startIndex, endIndex);
  var targetDate = String(date).slice(0, 10);
  var bufferConflict = null;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];

    if (String(row[0]) === String(excludeId)) {
      continue;
    }

    if (row[1] !== 'BOOKED' && row[1] !== 'COLLECTED') {
      continue;
    }

    if (String(row[7]) !== resource) {
      continue;
    }

    var rowDate = Utilities.formatDate(
      new Date(row[6]),
      BOOKING_CONFIG.TIME_ZONE,
      'yyyy-MM-dd'
    );

    if (rowDate !== targetDate) {
      continue;
    }

    var rowStartIndex = periodOrder.indexOf(String(row[10]));
    var rowEndIndex = periodOrder.indexOf(String(row[11]));

    if (rowStartIndex < 0 || rowEndIndex < 0) {
      continue;
    }

    var rowLow = Math.min(rowStartIndex, rowEndIndex);
    var rowHigh = Math.max(rowStartIndex, rowEndIndex);

    if (Math.max(low, rowLow) <= Math.min(high, rowHigh)) {
      return {
        type: 'OVERLAP',
        teacher: row[2],
        classOrActivity: row[4],
        startPeriod: row[10],
        endPeriod: row[11]
      };
    }

    if (rowHigh + 1 === low || high + 1 === rowLow) {
      bufferConflict = {
        type: 'BUFFER',
        teacher: row[2],
        classOrActivity: row[4],
        startPeriod: row[10],
        endPeriod: row[11]
      };
    }
  }

  return bufferConflict;
}

function getPeriodOrder_() {
  var records = getPeriodRecords_();
  var output = [];

  for (var i = 0; i < records.length; i++) {
    output.push(records[i].code);
  }

  return output;
}

function getPeriodRecords_() {
  var periods = getReferenceData_().periods || [];
  var output = [];
  for (var i = 0; i < periods.length; i++) {
    output.push({
      code: String(periods[i].code),
      start: bookingNormaliseTime_(periods[i].start),
      end: bookingNormaliseTime_(periods[i].end)
    });
  }
  return output;
}

function isBackTimed_(date, startPeriod, now) {
  var periods = getPeriodRecords_();
  var period = null;

  for (var i = 0; i < periods.length; i++) {
    if (periods[i].code === String(startPeriod)) {
      period = periods[i];
      break;
    }
  }

  if (!period) {
    return false;
  }

  var bookingStart = new Date(date + 'T' + period.start + ':00+08:00');
  return bookingStart.getTime() < now.getTime();
}

function getBookingNotificationEmails_(name, fallbackGspsEmail) {
  var emails = getBookingEmailsByTtbName_(name);
  var fallback = normaliseText_(fallbackGspsEmail).toLowerCase();
  if (fallback && /@gsps\.edu\.sg$/i.test(fallback)) {
    var exists = false;
    for (var i = 0; i < emails.length; i++) {
      if (normaliseText_(emails[i]).toLowerCase() === fallback) {
        exists = true;
        break;
      }
    }
    if (!exists) emails.push(fallback);
  }
  return emails;
}

function getGspsEmailForTtbName_(name) {
  var emails = getBookingEmailsByTtbName_(name);
  for (var i = 0; i < emails.length; i++) {
    if (/@gsps\.edu\.sg$/i.test(emails[i])) return emails[i].toLowerCase();
  }
  return '';
}

function getBookingEmailsByTtbName_(name) {
  var ctx = executionContext_();
  if (!ctx.bookingContactRows) {
    var spreadsheet = getTransactionSpreadsheet_();
    var sheet = getRequiredSheet_(spreadsheet, BOOKING_CONFIG.CONTACTS_SHEET);
    var lastRow = sheet.getLastRow();
    ctx.bookingContactRows = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, 8).getDisplayValues();
  }
  var rows = ctx.bookingContactRows;
  var key = String(name).trim().toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === key) {
      // Booking notifications are sent only to the GSPS email in Column D.
      // Column C (@schools.gov.sg) remains available for other uses but is
      // intentionally excluded from LORD booking email recipients.
      var candidates = [String(rows[i][3] || '').trim()];
      var seen = {};
      var output = [];
      for (var j = 0; j < candidates.length; j++) {
        var email = candidates[j].toLowerCase();
        if (email && !seen[email] && /@gsps\.edu\.sg$/i.test(email)) {
          seen[email] = true;
          output.push(email);
        }
      }
      return output;
    }
  }
  return [];
}
function mergeUniqueBookingEmails_(firstList, secondList) {
  var combined = [];
  var seen = {};
  var lists = [firstList || [], secondList || []];

  for (var i = 0; i < lists.length; i++) {
    for (var j = 0; j < lists[i].length; j++) {
      var email = String(lists[i][j] || '').trim().toLowerCase();
      if (email && !seen[email]) {
        seen[email] = true;
        combined.push(email);
      }
    }
  }

  return combined;
}

function clearBookingDayCache_(date) {
  if (!date) return;
  try { CacheService.getScriptCache().remove('lord_booking_day_' + String(date).slice(0,10)); }
  catch (error) { noteMaintenanceFailure_('booking_cache', error); }
}
function sendBookingEmail_(booking) {
  var subject = 'LORD booking confirmed: ' + booking.resource +
    ' on ' + booking.date;
  var accessories = [];

  if (booking.headphones) {
    accessories.push('Headphones required');
  }
  if (booking.styluses) {
    accessories.push('Separate stylus set required');
  }

  var bookingContext = booking.onBehalf ?
    'This booking was created on behalf of ' + booking.teacher +
      ' by ' + booking.createdBy + '.\n\n' : '';

  var body =
    'Dear ' + booking.teacher + ',\n\n' +
    bookingContext +
    'Your device booking has been recorded.' +
    (booking.backTimed ? ' This was recorded as a back-timed booking.' : '') +
    '\n\n' +
    'Booking ID: ' + booking.bookingId + '\n' +
    'Cancellation code: ' + booking.editCode + '\n\n' +
    'Resource: ' + booking.resource + '\n' +
    'Device type: ' + booking.deviceType + '\n' +
    'Requested quantity: ' + booking.requestedQuantity + '\n' +
    'Date: ' + booking.date + '\n' +
    'Periods: P' + booking.startPeriod + ' to P' + booking.endPeriod + '\n' +
    'Class or student group: ' + booking.classOrActivity + '\n' +
    'Subject: ' + booking.subject + '\n' +
    'Accessories: ' + (accessories.length ? accessories.join(', ') : 'None') + '\n' +
    'Other remarks: ' + (booking.remarks || 'Nil') + '\n\n' +
    'View or cancel this booking:\n' + booking.editUrl + '\n\n' +
    'Bookings cannot be edited. If any detail is wrong, cancel this booking and make a new booking.\n\n' +
    'LORD\n' +
    'Loan Out & Return of Devices\n' +
    'Gongshang Primary School\n\n' +
    'This sending mailbox is not monitored. For assistance, contact helpdesk@gsps.edu.sg.';

  MailApp.sendEmail({
    to: booking.email,
    subject: subject,
    body: body,
    name: 'LORD Device Booking',
    replyTo: 'helpdesk@gsps.edu.sg'
  });
}

function buildBookingEditUrl_(baseUrl, bookingId, editToken) {
  var root = String(baseUrl || 'https://lord.gsps.edu.sg/');

  if (root.charAt(root.length - 1) !== '/') {
    root += '/';
  }

  return root + '?mode=edit&bookingId=' + encodeURIComponent(bookingId) +
    '&token=' + encodeURIComponent(editToken);
}

function findBookingRow_(bookingId) {
  var spreadsheet = getTransactionSpreadsheet_();
  var sheet = getRequiredSheet_(spreadsheet, BOOKING_CONFIG.SHEET);
  if (sheet.getLastRow() < 2) return null;

  var match = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(bookingId || ''))
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();

  if (!match) return null;
  var rowNumber = match.getRow();
  return {
    sheet: sheet,
    rowNumber: rowNumber,
    values: sheet.getRange(rowNumber, 1, 1, BOOKING_HEADERS.length).getValues()[0]
  };
}

function validateBookingCredential_(values, token, code) {
  var tokenValid = false;
  var codeValid = false;

  if (token) {
    tokenValid = hashBookingValue_(
      token,
      bookingTokenPepper_()
    ) === values[15];
  }

  if (code) {
    codeValid = hashBookingValue_(
      code,
      bookingCodePepper_()
    ) === values[16];
  }

  return tokenValid || codeValid;
}

function bookingPublic_(row) {
  return {
    bookingId: row[0],
    status: row[1],
    teacher: row[2],
    classOrActivity: row[4],
    subject: row[5],
    date: Utilities.formatDate(
      new Date(row[6]),
      BOOKING_CONFIG.TIME_ZONE,
      'yyyy-MM-dd'
    ),
    resource: row[7],
    deviceType: row[8],
    requestedQuantity: Number(row[9]),
    startPeriod: String(row[10]),
    endPeriod: String(row[11]),
    headphones: Boolean(row[12]),
    styluses: Boolean(row[13]),
    remarks: row[14] || '',
    collectedSessionId: row[20] || '',
    backTimed: Boolean(row[21]),
    bufferOverrideUsed: Boolean(row[22]),
    overrideReason: row[23] || '',
    ownerGoogleSub: row[24] || '',
    ownerVerifiedEmail: row[25] || '',
    ownerTtbName: row[26] || row[2] || ''
  };
}

function createBookingId_() {
  var timestamp = Utilities.formatDate(
    new Date(),
    BOOKING_CONFIG.TIME_ZONE,
    'yyyyMMdd-HHmmss'
  );
  var suffix = Utilities.getUuid()
    .replace(/-/g, '')
    .slice(0, 4)
    .toUpperCase();
  return 'BOOK-' + timestamp + '-' + suffix;
}

function createBookingToken_() {
  return Utilities.getUuid().replace(/-/g, '') +
    Utilities.getUuid().replace(/-/g, '');
}

function hashBookingValue_(value, pepper) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value) + pepper
  );
  var output = '';

  for (var i = 0; i < bytes.length; i++) {
    var unsigned = (bytes[i] + 256) % 256;
    var hex = unsigned.toString(16);
    if (hex.length < 2) {
      hex = '0' + hex;
    }
    output += hex;
  }

  return output;
}

function maskBookingEmail_(email) {
  var parts = String(email).split('@');
  if (parts.length !== 2) {
    return email;
  }

  var local = parts[0];
  var stars = '';
  var count = Math.max(3, local.length - 1);

  for (var i = 0; i < count; i++) {
    stars += '*';
  }

  return local.slice(0, 1) + stars + '@' + parts[1];
}

function bookingNormaliseTime_(value) {
  var text = String(value || '').trim();
  var match = text.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return text;
  }

  var hour = Number(match[1]);
  return (hour < 10 ? '0' + hour : String(hour)) + ':' + match[2];
}


/* LORD Suite v1 — complete OVERLORD backend */
/* =========================
 * OVERLORD OPERATIONS SERVICE
 * ========================= */

// Repeated booking dates share one timezone conversion within this execution.
// The doGet/doPost entry points reset this memo; no feed is cached across reads.
function readDayKey_(value) {
  var date = new Date(value);
  var ctx = executionContext_();
  var keys = ctx.readDayKeys || (ctx.readDayKeys = Object.create(null));
  var key = String(date.getTime());
  return keys[key] || (keys[key] = Utilities.formatDate(date, LORD_CONFIG.TIME_ZONE, 'yyyy-MM-dd'));
}

function getOverlordDashboardData_(request) {
  var date = normaliseText_(request.date);
  if (!date) {
    date = Utilities.formatDate(
      new Date(),
      LORD_CONFIG.TIME_ZONE,
      'yyyy-MM-dd'
    );
  }

  var spreadsheet = getTransactionSpreadsheet_();
  var periods = getOverlordPeriods_();
  var resources = getOverlordResources_();
  var bookings = getOverlordBookings_(spreadsheet, date, periods);
  var movements = getOverlordMovements_(spreadsheet, date, periods, bookings);
  var now = new Date();
  var openLoans = [];
  var overdueLoans = [];
  var trolleyCount = 0;
  var deviceCount = 0;
  var returnedToday = 0;
  var returnedWithIssues = 0;

  for (var i = 0; i < movements.length; i++) {
    var movement = movements[i];

    if (movement.isOpen) {
      openLoans.push(movement);
      trolleyCount += movement.trolleyCount;
      deviceCount += movement.deviceTotal;

      if (movement.expectedEndMs &&
          now.getTime() > movement.expectedEndMs +
          OVERLORD_CONFIG.GRACE_MINUTES * 60000) {
        overdueLoans.push(movement);
      }
    } else {
      returnedToday++;
      if (movement.hasReturnIssue) {
        returnedWithIssues++;
      }
    }
  }

  return {
    generatedAt: formatDate_(now),
    date: date,
    graceMinutes: OVERLORD_CONFIG.GRACE_MINUTES,
    defaultViewport: {
      startTime: '07:00',
      endTime: '13:30'
    },
    periods: periods,
    resources: resources,
    bookings: bookings,
    movements: movements,
    maintenanceWarning: getLORDMaintenanceWarning_(),
    metrics: {
      openLoans: openLoans.length,
      overdueLoans: overdueLoans.length,
      trolleysOut: trolleyCount,
      devicesOut: deviceCount,
      returnedToday: returnedToday,
      returnedWithIssues: returnedWithIssues
    },
    telegram: {
      enabled: telegramConfigured_(),
      checkEveryMinutes: OVERLORD_CONFIG.TELEGRAM_CHECK_MINUTES,
      triggerInstalled: hasOverlordTrigger_()
    }
  };
}

function getOverlordPeriods_() {
  var periods = getReferenceData_().periods || [];
  var output = [];
  for (var i = 0; i < periods.length; i++) {
    output.push({
      code: String(periods[i].code),
      start: normaliseOverlordTime_(periods[i].start),
      end: normaliseOverlordTime_(periods[i].end),
      index: i
    });
  }
  return output;
}

function getOverlordResources_() {
  var resources = getReferenceData_().bookingResources || [];
  var output = [];
  for (var i = 0; i < resources.length; i++) {
    output.push({
      resource: resources[i].resource,
      deviceType: resources[i].deviceType,
      capacity: Number(resources[i].capacity) || 0
    });
  }
  return output;
}

function getOverlordBookings_(spreadsheet, date, periods) {
  var sheet = getRequiredSheet_(spreadsheet, BOOKING_CONFIG.SHEET);

  if (sheet.getLastRow() < 2) {
    return [];
  }

  var rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, BOOKING_HEADERS.length)
    .getValues();
  var output = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var bookingDate = readDayKey_(row[6]);

    if (row[1] === 'CANCELLED' || bookingDate !== date) {
      continue;
    }

    var startPeriod = findOverlordPeriod_(periods, String(row[10]));
    var endPeriod = findOverlordPeriod_(periods, String(row[11]));

    output.push({
      bookingId: row[0],
      status: row[1],
      teacher: row[2],
      bookedFor: row[26] || row[2] || '',
      createdBy: row[29] || row[2] || '',
      createdByEmail: row[28] || '',
      classOrActivity: row[4],
      subject: row[5],
      resource: row[7],
      deviceType: row[8],
      requestedQuantity: Number(row[9]) || 0,
      startPeriod: String(row[10]),
      endPeriod: String(row[11]),
      startTime: startPeriod ? startPeriod.start : '',
      endTime: endPeriod ? endPeriod.end : '',
      startIndex: startPeriod ? startPeriod.index : 0,
      endIndex: endPeriod ? endPeriod.index : 0,
      headphones: Boolean(row[12]),
      styluses: Boolean(row[13]),
      remarks: row[14] || '',
      collectedSessionId: row[20] || '',
      backTimed: Boolean(row[21]),
      bufferOverrideUsed: Boolean(row[22]),
      overrideReason: row[23] || ''
    });
  }

  return output;
}

function getOverlordMovements_(spreadsheet, date, periods, bookings) {
  assertSessionSchema_(spreadsheet);
  var sessionSheet = getRequiredSheet_(
    spreadsheet,
    LORD_CONFIG.SHEETS.SESSIONS
  );
  if (sessionSheet.getLastRow() < 2) {
    return [];
  }

  var rows = sessionSheet
    .getRange(2, 1, sessionSheet.getLastRow() - 1, SESSION_HEADERS.length)
    .getValues()
    .filter(function(row) {
      return readDayKey_(row[7]) === date || (row[8] && readDayKey_(row[8]) === date);
    });
  if (!rows.length) return [];
  var sessionIds = new Set(rows.map(function(row) { return String(row[0]); }));
  var trolleySheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.TROLLEYS);
  var contacts = getOverlordContacts_(spreadsheet);
  var trolleyMap = getOverlordTrolleyMap_(trolleySheet, sessionIds);
  var output = [];
  var bookingBySession = {};
  for (var bm = 0; bm < bookings.length; bm++) {
    if (bookings[bm].collectedSessionId) {
      bookingBySession[String(bookings[bm].collectedSessionId)] = bookings[bm];
    }
  }

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var booking = bookingBySession[String(row[0])] || null;

    var contactKey = String(row[2] || '').trim().toLowerCase();
    var contact = contacts[contactKey] || {};
    var trolleyDetails = trolleyMap[String(row[0])] || [];
    var trolleyNames = [];
    var trolleyReturnNotes = [];
    var trolleyDeclarationIssues = [];
    var trolleyHasReturnIssue = false;

    for (var td = 0; td < trolleyDetails.length; td++) {
      trolleyNames.push(trolleyDetails[td].name);

      if (trolleyDetails[td].returnIssue) {
        trolleyHasReturnIssue = true;
      }

      if (trolleyDetails[td].returnNotes) {
        trolleyReturnNotes.push(trolleyDetails[td].returnNotes);
      }

      if (trolleyDetails[td].correctTrolleyDeclaration === false) {
        trolleyDeclarationIssues.push('Correct-trolley declaration not confirmed');
      }
      if (trolleyDetails[td].sameOrientationDeclaration === false) {
        trolleyDeclarationIssues.push('Same-orientation declaration not confirmed');
      }
    }

    var stylusesBooked = row[26] === true || String(row[26]).toLowerCase() === 'true';
    var headphonesBooked = row[27] === true || String(row[27]).toLowerCase() === 'true';
    var accessoryEvidence = {
      styluses: {
        booked: stylusesBooked,
        loanQuantity: Number(row[28]) || 0,
        loanPhotoFileId: String(row[29] || ''),
        loanPhotoUrl: String(row[30] || ''),
        returnQuantity: Number(row[34]) || 0,
        returnPhotoFileId: String(row[35] || ''),
        returnPhotoUrl: String(row[36] || ''),
        bagReturned: normaliseOverlordDeclaration_(row[37])
      },
      headphones: {
        booked: headphonesBooked,
        loanQuantity: Number(row[31]) || 0,
        loanPhotoFileId: String(row[32] || ''),
        loanPhotoUrl: String(row[33] || ''),
        returnQuantity: Number(row[38]) || 0,
        returnPhotoFileId: String(row[39] || ''),
        returnPhotoUrl: String(row[40] || ''),
        bagReturned: normaliseOverlordDeclaration_(row[41])
      }
    };
    if (row[8] && stylusesBooked) {
      if (accessoryEvidence.styluses.bagReturned === false) trolleyDeclarationIssues.push('Stylus bag return not confirmed');
      if (accessoryEvidence.styluses.returnQuantity !== accessoryEvidence.styluses.loanQuantity) trolleyDeclarationIssues.push('Stylus return quantity differs from collection');
    }
    if (row[8] && headphonesBooked) {
      if (accessoryEvidence.headphones.bagReturned === false) trolleyDeclarationIssues.push('Headphone bag return not confirmed');
      if (accessoryEvidence.headphones.returnQuantity !== accessoryEvidence.headphones.loanQuantity) trolleyDeclarationIssues.push('Headphone return quantity differs from collection');
    }

    var loanComments = String(row[12] || '').trim();
    var returnComments = String(row[13] || '').trim();
    var statusText = String(row[1] || '').trim();
    var statusSignalsIssue =
      statusText === 'RETURNED WITH ISSUE' ||
      statusText === 'RETURNED WITH ISSUES';
    var hasReturnIssue = statusSignalsIssue || trolleyHasReturnIssue;
    // Keep operational comments separate from issue details. Earlier builds mixed
    // Return Comments into this field, which duplicated the same text in UI.
    var returnIssueDetails = joinUniqueOverlordText_(trolleyReturnNotes);
    var returnDeclarationIssues = joinUniqueOverlordText_(
      trolleyDeclarationIssues
    );
    var expectedEndMs = 0;

    if (booking && booking.endTime) {
      expectedEndMs = new Date(
        date + 'T' + booking.endTime + ':00+08:00'
      ).getTime();
    }

    output.push({
      sessionId: row[0],
      status: statusText,
      collector: row[2],
      collectorIdentityType: row[22] || 'GSPS',
      collectorMobile: row[23] || '',
      returnTeacher: row[3],
      returnerIdentityType: row[24] || '',
      returnerMobile: row[25] || '',
      classOrActivity: row[4],
      subject: row[5],
      resource: row[6],
      loanTimestamp: formatDate_(row[7]),
      returnTimestamp: row[8] ? formatDate_(row[8]) : '',
      loanMs: new Date(row[7]).getTime(),
      returnMs: row[8] ? new Date(row[8]).getTime() : 0,
      isOpen: row[1] === 'OPEN' || row[1] === 'PENDING_COLLECTION',
      trolleyCount: Number(row[9]) || trolleyNames.length,
      deviceTotal: Number(row[10]) || 0,
      returnDeviceTotal: Number(row[11]) || 0,
      loanComments: loanComments,
      returnComments: returnComments,
      returnIssue: hasReturnIssue,
      hasReturnIssue: hasReturnIssue,
      returnIssueDetails: returnIssueDetails,
      returnDeclarationIssues: returnDeclarationIssues,
      trolleyNames: trolleyNames,
      trolleyPhotos: trolleyDetails,
      accessoryEvidence: accessoryEvidence,
      stylusesBooked: stylusesBooked,
      headphonesBooked: headphonesBooked,
      booking: booking,
      expectedEndMs: expectedEndMs,
      whatsappLink: contact.whatsappLink || '',
      movementState: determineOverlordMovementState_(
        statusText,
        expectedEndMs,
        row[8]
      )
    });
  }

  return output;
}

function determineOverlordMovementState_(status, expectedEndMs, returnValue) {
  if (status === 'PENDING_COLLECTION') return 'PENDING_COLLECTION';
  if (status !== 'OPEN') {
    return status === 'RETURNED WITH ISSUE' ||
      status === 'RETURNED WITH ISSUES' ?
      'RETURNED_WITH_ISSUE' : 'RETURNED';
  }

  if (!expectedEndMs) {
    return 'ACTIVE';
  }

  var now = new Date().getTime();
  if (now <= expectedEndMs) {
    return 'ACTIVE';
  }

  if (now <= expectedEndMs + OVERLORD_CONFIG.GRACE_MINUTES * 60000) {
    return 'GRACE';
  }

  return 'OVERDUE';
}

function getOverlordTrolleyMap_(sheet, sessionIds) {
  var map = {};

  if (sheet.getLastRow() < 2) {
    return map;
  }

  var rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, TROLLEY_HEADERS.length)
    .getValues();

  for (var i = 0; i < rows.length; i++) {
    var sessionId = String(rows[i][1]);
    if (sessionIds && !sessionIds.has(sessionId)) continue;

    if (!map[sessionId]) {
      map[sessionId] = [];
    }

    map[sessionId].push({
      name: String(rows[i][3] || ''),
      loanQuantity: Number(rows[i][4]) || 0,
      loanPhotoFileId: String(rows[i][5] || ''),
      loanPhotoUrl: String(rows[i][6] || ''),
      returnQuantity: Number(rows[i][7]) || 0,
      returnPhotoFileId: String(rows[i][8] || ''),
      returnPhotoUrl: String(rows[i][9] || ''),
      stylusDeclaration: normaliseOverlordDeclaration_(rows[i][10]),
      correctTrolleyDeclaration: normaliseOverlordDeclaration_(rows[i][11]),
      sameOrientationDeclaration: normaliseOverlordDeclaration_(rows[i][12]),
      returnIssue: normaliseOverlordBoolean_(rows[i][13]),
      returnNotes: String(rows[i][14] || '').trim()
    });
  }

  return map;
}


function normaliseOverlordDeclaration_(value) {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  var text = String(value === null || value === undefined ? '' : value)
    .trim()
    .toLowerCase();
  if (!text) {
    return null;
  }
  if (text === 'true' || text === 'yes' || text === 'y' ||
      text === '1' || text === 'checked' || text === 'confirmed') {
    return true;
  }
  if (text === 'false' || text === 'no' || text === 'n' ||
      text === '0' || text === 'unchecked' || text === 'not confirmed') {
    return false;
  }
  return null;
}

function normaliseOverlordBoolean_(value) {
  if (value === true) {
    return true;
  }

  if (value === false || value === null || value === undefined) {
    return false;
  }

  var text = String(value).trim().toLowerCase();

  return text === 'true' ||
    text === 'yes' ||
    text === 'y' ||
    text === '1' ||
    text === 'checked' ||
    text === 'issue' ||
    text === 'returned with issue' ||
    text === 'returned with issues';
}

function joinUniqueOverlordText_(values) {
  var output = [];
  var seen = {};

  for (var i = 0; i < values.length; i++) {
    var text = String(values[i] || '').trim();
    var key = text.toLowerCase();

    if (!text || seen[key]) {
      continue;
    }

    seen[key] = true;
    output.push(text);
  }

  return output.join('\n');
}

function getOverlordContacts_(spreadsheet) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'lord_v3_overlord_contacts';
  var cached = executionContext_().forceRefresh ? null : cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (ignore) {}
  }

  var sheet = getRequiredSheet_(spreadsheet, 'contacts');
  var map = {};
  if (sheet.getLastRow() < 2) {
    cache.put(cacheKey, '{}', OVERLORD_CONFIG.CONTACT_CACHE_SECONDS);
    return map;
  }

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    var key = String(rows[i][0] || '').trim().toLowerCase();
    var mobile = String(rows[i][5] || '').replace(/\D/g, '');
    var whatsapp = String(rows[i][7] || '').trim();
    if (!whatsapp && mobile) whatsapp = 'https://wa.me/65' + mobile;
    if (key) map[key] = { whatsappLink: whatsapp };
  }
  cache.put(cacheKey, JSON.stringify(map), OVERLORD_CONFIG.CONTACT_CACHE_SECONDS);
  return map;
}

function findOverlordPeriod_(periods, code) {
  for (var i = 0; i < periods.length; i++) {
    if (periods[i].code === code) {
      return periods[i];
    }
  }
  return null;
}

function normaliseOverlordTime_(value) {
  var text = String(value || '').trim();
  var match = text.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return text;
  }

  var hour = Number(match[1]);
  return (hour < 10 ? '0' + hour : String(hour)) + ':' + match[2];
}

function installOverdueTelegramTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkAndSendOverdueTelegramAlerts') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('checkAndSendOverdueTelegramAlerts')
    .timeBased()
    .everyMinutes(OVERLORD_CONFIG.TELEGRAM_CHECK_MINUTES)
    .create();
  CacheService.getScriptCache().remove(OVERLORD_CONFIG.TRIGGER_STATUS_CACHE_KEY);
}

function hasOverlordTrigger_() {
  var cache = CacheService.getScriptCache();
  var key = OVERLORD_CONFIG.TRIGGER_STATUS_CACHE_KEY;
  var cached = executionContext_().forceRefresh ? null : cache.get(key);
  if (cached === '1') return true;
  if (cached === '0') return false;

  var triggers = ScriptApp.getProjectTriggers();
  var installed = false;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkAndSendOverdueTelegramAlerts') {
      installed = true;
      break;
    }
  }
  cache.put(key, installed ? '1' : '0', OVERLORD_CONFIG.TRIGGER_STATUS_CACHE_SECONDS);
  return installed;
}

function diagnoseOverlordMonitor() {
  var triggers = ScriptApp.getProjectTriggers();
  var mine = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkAndSendOverdueTelegramAlerts') mine++;
  }
  var scan = getOverlordOverdueScan_();
  var result = {
    currentUserTriggerCount: mine,
    sharedFiveMinuteBucket: PropertiesService.getScriptProperties()
      .getProperty(OVERLORD_CONFIG.MONITOR_BUCKET_PROPERTY) || '',
    openSessions: scan.open.length,
    referenceCacheSeconds: LORD_REFERENCE_CONFIG.CACHE_SECONDS,
    contactCacheSeconds: OVERLORD_CONFIG.CONTACT_CACHE_SECONDS
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testOverlordOverdueScan() {
  var result = getOverlordOverdueScan_();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function checkAndSendOverdueTelegramAlerts() {
  resetExecutionContext_();
  if (!claimOverlordMonitorBucket_()) return;
  var alertEvents = [];
  try {
    // The 18:00 safety sweep runs regardless of Telegram configuration.
    runSixPmForceReturnSweep_();
    if (!telegramConfigured_()) return;

    var scan = getOverlordOverdueScan_();
    var now = new Date().getTime();
    var properties = PropertiesService.getScriptProperties();
    var saved = properties.getProperty(OVERLORD_CONFIG.TELEGRAM_NOTIFIED_PROPERTY);
    var notified = saved ? JSON.parse(saved) : {};
    var openIds = {};
    var changed = false;
    var i;

    for (i = 0; i < scan.open.length; i++) openIds[scan.open[i].sessionId] = true;
    var existingIds = Object.keys(notified);
    for (i = 0; i < existingIds.length; i++) {
      if (!openIds[existingIds[i]]) { delete notified[existingIds[i]]; changed = true; }
    }

    for (i = 0; i < scan.open.length; i++) {
      var movement = scan.open[i];
      var overdue = movement.expectedEndMs &&
        now > movement.expectedEndMs + OVERLORD_CONFIG.GRACE_MINUTES * 60000;
      if (!overdue || notified[movement.sessionId]) continue;

      try {
        sendOverlordTelegram_(buildOverlordAlert_(movement));
      } catch (error) {
        Logger.log('Overdue Telegram send warning: ' + getErrorMessage_(error));
        continue;
      }

      notified[movement.sessionId] = new Date().toISOString();
      alertEvents.push({
        sessionId: movement.sessionId,
        eventType: 'BOOKING_END_OVERDUE_ALERT_SENT',
        teacher: movement.collector,
        payload: {
          bookingId: movement.booking ? movement.booking.bookingId : '',
          resource: movement.resource,
          expectedEnd: movement.booking ? movement.booking.endTime : ''
        }
      });
      // Checkpoint before attempting the next delivery. A failed checkpoint
      // stops more sends, while finally still flushes known sent events and
      // runs maintenance. A send and its checkpoint cannot be atomic.
      properties.setProperty(OVERLORD_CONFIG.TELEGRAM_NOTIFIED_PROPERTY, JSON.stringify(notified));
      changed = false;
    }

    if (changed) {
      properties.setProperty(OVERLORD_CONFIG.TELEGRAM_NOTIFIED_PROPERTY, JSON.stringify(notified));
    }
  } finally {
    // Both maintenance paths are attempted even when scanning, checkpointing,
    // the sweep or audit writing fails. The minute queue trigger is retained.
    try {
      appendOverlordEventsBatch_(alertEvents);
    } finally {
      processSecondaryQueue_(12);
    }
  }
}

function claimOverlordMonitorBucket_() {
  var now = new Date();
  var local = Utilities.formatDate(now, LORD_CONFIG.TIME_ZONE, 'yyyyMMdd-HH-mm');
  var parts = local.split('-');
  var minute = Number(parts[2]) || 0;
  var bucket = parts[0] + '-' + parts[1] + '-' + String(Math.floor(minute / 5));
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) return false;
  try {
    var properties = PropertiesService.getScriptProperties();
    if (properties.getProperty(OVERLORD_CONFIG.MONITOR_BUCKET_PROPERTY) === bucket) {
      return false;
    }
    properties.setProperty(OVERLORD_CONFIG.MONITOR_BUCKET_PROPERTY, bucket);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function getOverlordOverdueScan_() {
  var spreadsheet = getTransactionSpreadsheet_();
  var sessionSheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.SESSIONS);
  var bookingSheet = getRequiredSheet_(spreadsheet, BOOKING_CONFIG.SHEET);
  var periods = getOverlordPeriods_();
  var periodMap = {};
  for (var p = 0; p < periods.length; p++) periodMap[String(periods[p].code)] = periods[p];

  var bookingRows = bookingSheet.getLastRow() < 2 ? [] : bookingSheet
    .getRange(2, 1, bookingSheet.getLastRow() - 1, BOOKING_HEADERS.length)
    .getValues();
  var bookingBySession = {};
  for (var b = 0; b < bookingRows.length; b++) {
    var br = bookingRows[b];
    var linkedSessionId = String(br[20] || '').trim();
    if (!linkedSessionId || String(br[1] || '').toUpperCase() === 'CANCELLED') continue;
    var endPeriod = periodMap[String(br[11] || '')] || null;
    var startPeriod = periodMap[String(br[10] || '')] || null;
    var bookingDate = br[6] ? Utilities.formatDate(new Date(br[6]), LORD_CONFIG.TIME_ZONE, 'yyyy-MM-dd') : '';
    bookingBySession[linkedSessionId] = {
      bookingId: br[0] || '',
      teacher: br[2] || '',
      bookedFor: br[26] || br[2] || '',
      startPeriod: String(br[10] || ''),
      endPeriod: String(br[11] || ''),
      startTime: startPeriod ? startPeriod.start : '',
      endTime: endPeriod ? endPeriod.end : '',
      bookingDate: bookingDate
    };
  }

  if (sessionSheet.getLastRow() < 2) return { open: [] };
  var rows = sessionSheet
    .getRange(2, 1, sessionSheet.getLastRow() - 1, SESSION_HEADERS.length)
    .getValues();
  var contacts = getOverlordContacts_(spreadsheet);
  var open = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (String(row[1] || '').toUpperCase() !== 'OPEN') continue;
    var sessionId = String(row[0] || '');
    var booking = bookingBySession[sessionId] || null;
    var expectedEndMs = 0;
    if (booking && booking.bookingDate && booking.endTime) {
      expectedEndMs = new Date(booking.bookingDate + 'T' + booking.endTime + ':00+08:00').getTime();
    }
    var contactKey = String(row[2] || '').trim().toLowerCase();
    var contact = contacts[contactKey] || {};
    open.push({
      sessionId: sessionId,
      isOpen: true,
      collector: row[2] || '',
      classOrActivity: row[4] || '',
      subject: row[5] || '',
      resource: row[6] || '',
      loanTimestamp: formatDate_(row[7]),
      deviceTotal: Number(row[10]) || 0,
      expectedEndMs: expectedEndMs,
      whatsappLink: contact.whatsappLink || '',
      booking: booking
    });
  }
  return { open: open };
}

function appendOverlordEventsBatch_(events) {
  var properties = PropertiesService.getScriptProperties();
  var pendingRaw = properties.getProperty(OVERLORD_CONFIG.PENDING_ALERT_EVENTS_PROPERTY);
  var combined = [];
  if (pendingRaw) {
    try { combined = JSON.parse(pendingRaw) || []; } catch (ignore) {}
  }
  if (events && events.length) combined = combined.concat(events);
  if (!combined.length) return;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    // Alert delivery is more important than audit batching. Preserve both old
    // and new pending events for the next monitor invocation.
    properties.setProperty(
      OVERLORD_CONFIG.PENDING_ALERT_EVENTS_PROPERTY,
      JSON.stringify(combined)
    );
    return;
  }
  try {
    try {
      var spreadsheet = getTransactionSpreadsheet_();
      var sheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.EVENTS);
      var rows = [];
      for (var i = 0; i < combined.length; i++) {
        rows.push([
          Utilities.getUuid(),
          combined[i].sessionId,
          combined[i].eventType,
          new Date(),
          combined[i].teacher,
          JSON.stringify(combined[i].payload || {})
        ]);
      }
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, EVENT_HEADERS.length).setValues(rows);
    } catch (error) {
      // Keep existing and newly delivered alert events for the next scan.
      // Ambiguous append outcomes can still replay audit rows; this patch
      // deliberately does not change Event Log schema or event identifiers.
      try {
        properties.setProperty(OVERLORD_CONFIG.PENDING_ALERT_EVENTS_PROPERTY, JSON.stringify(combined));
      } catch (storageError) {
        Logger.log('Pending alert events could not be saved: ' + getErrorMessage_(storageError));
      }
      throw error;
    }
    properties.deleteProperty(OVERLORD_CONFIG.PENDING_ALERT_EVENTS_PROPERTY);
  } finally {
    lock.releaseLock();
  }
}


/**
 * v1 daily safety sweep.
 *
 * Apps Script time triggers are not guaranteed to fire at an exact minute,
 * therefore LORD reuses OVERLORD's existing five-minute trigger and gates the
 * sweep by Singapore local time. In normal operation the sweep occurs between
 * 18:00 and 18:04.
 *
 * A force return is an administrative session close, NOT evidence that the
 * devices were physically returned. Return quantities/photos/declarations are
 * deliberately left blank. The session status and Event Log preserve that
 * distinction while releasing the cart for later bookings/collections.
 */
function runSixPmForceReturnSweep_() {
  var properties = PropertiesService.getScriptProperties();

  // Telegram retry is network I/O and must never hold the transaction lock.
  retryPendingForceReturnAlert_(properties);

  var now = new Date();
  var localDate = Utilities.formatDate(now, LORD_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  var localHour = Number(Utilities.formatDate(now, LORD_CONFIG.TIME_ZONE, 'H'));
  if (localHour < OVERLORD_CONFIG.FORCE_RETURN_HOUR) {
    return { ran: false, reason: 'BEFORE_18_00', date: localDate };
  }
  if (properties.getProperty(OVERLORD_CONFIG.FORCE_RETURN_SWEEP_DATE_PROPERTY) === localDate) {
    return { ran: false, reason: 'ALREADY_SWEPT', date: localDate };
  }

  // Do not make a teacher wait for the safety sweep. If a foreground write is
  // active, skip this invocation and let the next five-minute monitor retry.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    return { ran: false, reason: 'WRITE_LOCK_BUSY_RETRY_LATER', date: localDate };
  }

  var result;
  try {
    // Re-check after obtaining the lock in case another trigger completed it.
    if (properties.getProperty(OVERLORD_CONFIG.FORCE_RETURN_SWEEP_DATE_PROPERTY) === localDate) {
      return { ran: false, reason: 'ALREADY_SWEPT', date: localDate };
    }
    result = forceReturnAllOpenSessions_(now);
    if (result.alertText) {
      properties.setProperty(
        OVERLORD_CONFIG.FORCE_RETURN_PENDING_ALERT_PROPERTY,
        JSON.stringify({ date: localDate, text: result.alertText })
      );
    }
    properties.setProperty(OVERLORD_CONFIG.FORCE_RETURN_SWEEP_DATE_PROPERTY, localDate);
  } finally {
    lock.releaseLock();
  }

  // Telegram happens only after releasing the shared transaction lock.
  retryPendingForceReturnAlert_(properties);
  return result;
}

function forceReturnAllOpenSessions_(now) {
  var spreadsheet = getTransactionSpreadsheet_();
  assertSessionSchema_(spreadsheet);
  var sessionSheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.SESSIONS);
  var bookingSheet = getRequiredSheet_(spreadsheet, BOOKING_CONFIG.SHEET);
  var eventSheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.EVENTS);

  if (sessionSheet.getLastRow() < 2) {
    return { ran: true, count: 0, sessions: [], alertText: '' };
  }

  var sessionRows = sessionSheet
    .getRange(2, 1, sessionSheet.getLastRow() - 1, SESSION_HEADERS.length)
    .getValues();
  var bookingRows = bookingSheet.getLastRow() < 2 ? [] : bookingSheet
    .getRange(2, 1, bookingSheet.getLastRow() - 1, BOOKING_HEADERS.length)
    .getValues();
  var bookingBySession = {};
  for (var b = 0; b < bookingRows.length; b++) {
    var sid = String(bookingRows[b][20] || '');
    if (!sid) continue;
    bookingBySession[sid] = {
      rowIndex: b,
      bookingId: normaliseText_(bookingRows[b][0]),
      teacher: normaliseText_(bookingRows[b][2]),
      bookedFor: normaliseText_(bookingRows[b][26]) || normaliseText_(bookingRows[b][2]),
      startPeriod: normaliseText_(bookingRows[b][10]),
      endPeriod: normaliseText_(bookingRows[b][11]),
      dateKey: bookingRows[b][6] ? Utilities.formatDate(new Date(bookingRows[b][6]), BOOKING_CONFIG.TIME_ZONE, 'yyyy-MM-dd') : ''
    };
  }

  var forced = [];
  var eventRows = [];
  var sweepRequests = [];

  for (var i = 0; i < sessionRows.length; i++) {
    var row = sessionRows[i];
    if (normaliseText_(row[1]).toUpperCase() !== 'OPEN') continue;

    var sessionId = normaliseText_(row[0]);
    var booking = bookingBySession[sessionId] || null;
    var collectorName = normaliseText_(row[2]) || 'Unknown';
    var collectorEmail = normaliseText_(row[17]);
    var collectorMobile = normaliseText_(row[23]);
    var returnComment = 'Automatically force-closed by LORD daily 18:00 sweep. No physical return declaration was recorded.';

    var beforeForced = row.slice();
    row[1] = 'FORCED RETURN';
    row[3] = 'SYSTEM · 18:00 SWEEP';
    row[8] = now;
    row[11] = '';
    row[13] = returnComment;
    row[15] = now;
    row[19] = '';
    row[20] = '';
    row[21] = 'SYSTEM · 18:00 SWEEP';
    row[24] = 'SYSTEM';
    row[25] = '';
    queueChangedRow_(sweepRequests, sessionSheet, i + 2, beforeForced, row);

    if (booking) {
      var beforeBooking = bookingRows[booking.rowIndex].slice();
      bookingRows[booking.rowIndex][1] = 'COMPLETED';
      bookingRows[booking.rowIndex][18] = now;
      queueChangedRow_(sweepRequests, bookingSheet, booking.rowIndex + 2, beforeBooking, bookingRows[booking.rowIndex]);
    }

    var payload = {
      resource: normaliseText_(row[6]),
      classOrActivity: normaliseText_(row[4]),
      subject: normaliseText_(row[5]),
      loanTimestamp: formatDate_(row[7]),
      forcedReturnTimestamp: formatDate_(now),
      collectorEmail: collectorEmail,
      collectorMobile: collectorMobile,
      bookingId: booking ? booking.bookingId : '',
      bookingTeacher: booking ? booking.teacher : '',
      bookedFor: booking ? booking.bookedFor : '',
      reason: 'Open session remained unreturned at daily 18:00 sweep.'
    };
    eventRows.push([
      Utilities.getUuid(), sessionId, 'FORCED_RETURN_18_00', now,
      collectorName, JSON.stringify(payload)
    ]);

    forced.push({
      sessionId: sessionId,
      resource: normaliseText_(row[6]),
      collector: collectorName,
      collectorEmail: collectorEmail,
      collectorMobile: collectorMobile,
      classOrActivity: normaliseText_(row[4]),
      subject: normaliseText_(row[5]),
      loanTimestamp: formatDate_(row[7]),
      deviceTotal: Number(row[10]) || 0,
      booking: booking ? {
        bookingId: booking.bookingId,
        teacher: booking.teacher,
        bookedFor: booking.bookedFor,
        startPeriod: booking.startPeriod,
        endPeriod: booking.endPeriod
      } : null
    });
  }

  // v1.3 closes only changed Session/Booking cells in one atomic commit.
  // Closed sessions, unrelated bookings, formulas and extra columns are untouched.
  commitSurgicalUpdates_(sweepRequests);
  var clearedDates = {};
  forced.forEach(function(item) {
    var dateKey = item.booking && bookingBySession[item.sessionId] ? bookingBySession[item.sessionId].dateKey : '';
    if (dateKey && !clearedDates[dateKey]) { clearBookingDayCache_(dateKey); clearedDates[dateKey] = true; }
  });
  if (eventRows.length) {
    try {
      eventSheet.getRange(eventSheet.getLastRow() + 1, 1, eventRows.length, EVENT_HEADERS.length).setValues(eventRows);
    } catch (eventError) {
      Logger.log('Force-return audit queue warning: ' + getErrorMessage_(eventError));
      for (var er = 0; er < eventRows.length; er++) {
        queueSecondaryTask_('event', {
          sessionId: eventRows[er][1], eventType: eventRows[er][2], teacher: eventRows[er][4],
          payload: JSON.parse(eventRows[er][5] || '{}')
        });
      }
    }
  }

  return {
    ran: true,
    count: forced.length,
    sessions: forced,
    alertText: forced.length ? buildForceReturnSweepAlert_(forced, now) : ''
  };
}

function getOverlordBookingBySession_(spreadsheet, sessionId) {
  var sheet = getRequiredSheet_(spreadsheet, BOOKING_CONFIG.SHEET);
  if (sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, BOOKING_HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][20] || '') !== String(sessionId)) continue;
    return {
      bookingId: normaliseText_(rows[i][0]),
      teacher: normaliseText_(rows[i][2]),
      bookedFor: normaliseText_(rows[i][26]) || normaliseText_(rows[i][2]),
      startPeriod: normaliseText_(rows[i][10]),
      endPeriod: normaliseText_(rows[i][11])
    };
  }
  return null;
}

function buildForceReturnSweepAlert_(sessions, now) {
  var lines = [
    'OVERLORD: 18:00 automatic force return',
    '',
    sessions.length + ' open cart session' + (sessions.length === 1 ? '' : 's') +
      ' had not been returned in LORD and ' +
      (sessions.length === 1 ? 'was' : 'were') + ' force-closed.',
    'Sweep time: ' + formatDate_(now),
    '',
    'These are administrative closes only; no physical return declaration or return photos were recorded.'
  ];

  for (var i = 0; i < sessions.length; i++) {
    var item = sessions[i];
    var booking = item.booking || {};
    lines.push('');
    lines.push((i + 1) + '. ' + (item.resource || 'Unknown cart'));
    lines.push('Collected by: ' + (item.collector || 'Unknown'));
    if (item.collectorEmail) lines.push('Email: ' + item.collectorEmail);
    if (item.collectorMobile) lines.push('Mobile: ' + item.collectorMobile);
    if (booking.bookedFor && booking.bookedFor !== item.collector) {
      lines.push('Booked for: ' + booking.bookedFor);
    }
    lines.push('Class/group: ' + (item.classOrActivity || 'Not recorded'));
    lines.push('Subject: ' + (item.subject || 'Not recorded'));
    lines.push('Collected: ' + (item.loanTimestamp || 'Not recorded'));
    lines.push('Devices out: ' + item.deviceTotal);
    if (booking.startPeriod || booking.endPeriod) {
      lines.push('Booking: P' + (booking.startPeriod || '?') + ' to P' + (booking.endPeriod || '?'));
    }
    if (booking.bookingId) lines.push('Booking ID: ' + booking.bookingId);
    lines.push('Session: ' + item.sessionId);
  }

  return lines.join('\n');
}

function retryPendingForceReturnAlert_(properties) {
  var raw = properties.getProperty(
    OVERLORD_CONFIG.FORCE_RETURN_PENDING_ALERT_PROPERTY
  );
  if (!raw) return false;

  var pending;
  try {
    pending = JSON.parse(raw);
  } catch (error) {
    pending = { text: raw };
  }
  if (!pending || !pending.text) {
    properties.deleteProperty(OVERLORD_CONFIG.FORCE_RETURN_PENDING_ALERT_PROPERTY);
    return false;
  }

  try {
    sendOverlordTelegram_(pending.text);
    properties.deleteProperty(OVERLORD_CONFIG.FORCE_RETURN_PENDING_ALERT_PROPERTY);
    return true;
  } catch (error) {
    // Keep the payload for the next five-minute trigger. The session has
    // already been closed, so Telegram availability cannot re-block carts.
    console.error('v1 force-return Telegram retry failed: ' + getErrorMessage_(error));
    return false;
  }
}

/** Manual administrator helper for immediate cleanup/testing. */
function forceReturnOpenSessionsNow() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var result = forceReturnAllOpenSessions_(new Date());
    if (result.alertText) {
      var properties = PropertiesService.getScriptProperties();
      properties.setProperty(
        OVERLORD_CONFIG.FORCE_RETURN_PENDING_ALERT_PROPERTY,
        JSON.stringify({
          date: Utilities.formatDate(new Date(), LORD_CONFIG.TIME_ZONE, 'yyyy-MM-dd'),
          text: result.alertText
        })
      );
      retryPendingForceReturnAlert_(properties);
    }
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    lock.releaseLock();
  }
}

/** Read-only diagnostic: lists all sessions that would be closed by the sweep. */
function previewForceReturnOpenSessions() {
  var spreadsheet = getTransactionSpreadsheet_();
  assertSessionSchema_(spreadsheet);
  var sheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.SESSIONS);
  if (sheet.getLastRow() < 2) return [];
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, SESSION_HEADERS.length).getValues();
  var output = [];
  for (var i = 0; i < rows.length; i++) {
    if (normaliseText_(rows[i][1]).toUpperCase() !== 'OPEN') continue;
    output.push({
      sessionId: rows[i][0],
      collector: rows[i][2],
      resource: rows[i][6],
      loanTimestamp: formatDate_(rows[i][7]),
      deviceTotal: Number(rows[i][10]) || 0
    });
  }
  Logger.log(JSON.stringify(output, null, 2));
  return output;
}

function buildOverlordAlert_(movement) {
  var overdueMinutes = Math.max(
    0,
    Math.floor(
      (new Date().getTime() - movement.expectedEndMs) / 60000
    )
  );
  var booking = movement.booking || {};
  var lines = [
    'OVERLORD: Cart overdue beyond booking',
    '',
    'Cart: ' + (movement.resource || 'Not recorded'),
    'Booked by: ' + (booking.teacher || 'Not recorded'),
    'Collected by: ' + (movement.collector || 'Not recorded'),
    'Class or student group: ' +
      (movement.classOrActivity || 'Not recorded'),
    'Subject: ' + (movement.subject || 'Not recorded'),
    'Booking: P' + (booking.startPeriod || '?') +
      ' to P' + (booking.endPeriod || '?') +
      ' (' + (booking.startTime || '?') + ' to ' +
      (booking.endTime || '?') + ')',
    'Actual collection: ' + movement.loanTimestamp,
    'Devices out: ' + movement.deviceTotal,
    'Overdue: ' + overdueMinutes + ' minutes',
    'Booking ID: ' + (booking.bookingId || 'Not linked'),
    'LORD Session: ' + movement.sessionId,
    '',
    movement.whatsappLink ?
      'Contact collector: ' + movement.whatsappLink :
      'Collector WhatsApp contact not found.'
  ];

  return lines.join('\n');
}

function sendOverlordTelegram_(text) {
  var url = 'https://api.telegram.org/bot' +
    telegramBotToken_() + '/sendMessage';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: telegramChatId_(),
      text: text,
      disable_web_page_preview: true
    }),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() >= 300) {
    throw new Error(
      'Telegram error ' + response.getResponseCode() + ': ' +
      response.getContentText()
    );
  }
}

function testTelegramAlert() {
  sendOverlordTelegram_(
    'OVERLORD v1 test successful. Booking-end alert channel is connected.'
  );
}

function testOverlordDashboard() {
  Logger.log(JSON.stringify(getOverlordDashboardData_({}), null, 2));
}

/* ===== v1 REIGN — Close Logging Period =====
 * Reporting, Export, Integrity reset & Generation of New logging period.
 * Generates immutable human-readable and machine-readable archives before
 * clearing transactional rows. Reference/configuration sheets and photos are
 * never touched.
 */
function previewReignClose_(request) {
  requireReignAdmin_(request);
  var snapshot = buildReignSnapshot_();
  return reignPreviewFromSnapshot_(snapshot);
}

function closeReignPeriod_(request) {
  requireReignAdmin_(request);
  assertReignCloseSafe_();

  var snapshot = buildReignSnapshot_();
  if (!snapshot.totalDataRows) throw new Error('There are no transactional rows to archive.');

  var preview = reignPreviewFromSnapshot_(snapshot);
  var supplied = normaliseText_(request.confirmation);
  if (supplied !== preview.confirmationText) {
    throw new Error('Confirmation text does not match the current logging period. Refresh the REIGN preview and try again.');
  }

  var generatedAt = new Date();
  var archive = createReignArchiveFiles_(snapshot, generatedAt, request);
  verifyReignArchiveFiles_(archive);
  clearReignTransactionalRows_(snapshot.spreadsheet, snapshot);

  appendEvent_({
    spreadsheet: snapshot.spreadsheet,
    sessionId: '',
    eventType: 'REIGN_PERIOD_CLOSED',
    teacher: normaliseText_(request.authTtbName || request.authEmail || 'Administrator'),
    payload: {
      periodStart: preview.periodStart,
      periodEnd: preview.periodEnd,
      archivedAt: generatedAt.toISOString(),
      archivedByEmail: normaliseText_(request.authEmail),
      archivedBySub: normaliseText_(request.authSub),
      rowCounts: preview.rowCounts,
      preservedRowCounts: preview.preservedRowCounts,
      cutoffDate: preview.cutoffDate,
      archiveFiles: archive.files.map(function(x){ return { name: x.name, id: x.id, url: x.url }; })
    }
  });

  return {
    ok: true,
    periodStart: preview.periodStart,
    periodEnd: preview.periodEnd,
    rowCounts: preview.rowCounts,
    preservedRowCounts: preview.preservedRowCounts,
    cutoffDate: preview.cutoffDate,
    files: archive.files,
    closedBy: normaliseText_(request.authTtbName || request.authEmail),
    closedAt: generatedAt.toISOString()
  };
}

function assertReignCloseSafe_() {
  var now = new Date();
  var hour = Number(Utilities.formatDate(now, LORD_CONFIG.TIME_ZONE, 'H'));
  if (hour < LORD_CONFIG.REIGN_CLOSE_HOUR) {
    throw new Error(
      'REIGN cannot close the current logging period before ' +
      padNumber_(LORD_CONFIG.REIGN_CLOSE_HOUR, 2) +
      ':00. This prevents same-day bookings from being archived while operations are still active.'
    );
  }

  var spreadsheet = getTransactionSpreadsheet_();
  assertSessionSchema_(spreadsheet);
  var sheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.SESSIONS);
  if (sheet.getLastRow() < 2) return true;

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  var blockers = [];
  for (var i = 0; i < rows.length; i++) {
    var status = normaliseText_(rows[i][1]).toUpperCase();
    if (status === 'OPEN' || status === 'PENDING_COLLECTION' || status === 'PENDING_RETURN') {
      blockers.push(normaliseText_(rows[i][0]) + ' / ' + normaliseText_(rows[i][6]) + ' / ' + status);
    }
  }
  if (blockers.length) {
    throw new Error(
      'REIGN cannot close while physical custody remains unresolved. Resolve: ' +
      blockers.slice(0, 10).join('; ') +
      (blockers.length > 10 ? ' …' : '')
    );
  }
  return true;
}

function requireReignAdmin_(request) {
  if (!request || !normaliseText_(request.authEmail) || !normaliseText_(request.authSub)) {
    throw new Error('Verified administrator identity is required.');
  }
  if (!isAuthenticatedAdmin_(request)) {
    throw new Error('REIGN is restricted to active OVERLORD administrators.');
  }
  return true;
}

function buildReignSnapshot_() {
  var spreadsheet = getTransactionSpreadsheet_();
  var todayKey = Utilities.formatDate(new Date(), LORD_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  var raw = {};
  for (var i = 0; i < REIGN_CONFIG.TRANSACTION_SHEETS.length; i++) {
    var name = REIGN_CONFIG.TRANSACTION_SHEETS[i];
    var sheet = getRequiredSheet_(spreadsheet, name);
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var values = lastRow > 0 && lastCol > 0 ? sheet.getRange(1, 1, lastRow, lastCol).getValues() : [];
    raw[name] = {
      sheet: sheet,
      headers: values.length ? values[0].map(function(v){ return String(v || ''); }) : [],
      rows: values.length > 1 ? values.slice(1) : [],
      originalDataRowCount: Math.max(0, lastRow - 1),
      lastCol: Math.max(1, lastCol)
    };
  }

  var snapshot = {
    spreadsheet: spreadsheet,
    spreadsheetId: LORD_CONFIG.SPREADSHEET_ID,
    spreadsheetName: spreadsheet.getName(),
    generatedAt: new Date(),
    cutoffDate: todayKey,
    sheets: {},
    totalDataRows: 0,
    totalPreservedRows: 0,
    earliestMs: null,
    latestMs: null
  };
  partitionReignSnapshot_(raw, snapshot);
  return snapshot;
}

function reignHeaderIndex_(headers, name) {
  for (var i = 0; i < headers.length; i++) if (headers[i] === name) return i;
  return -1;
}
function reignRowKey_(value) {
  return reignDateKey_(value);
}
function reignIsFuture_(value, cutoff) {
  var key = reignRowKey_(value);
  return key ? key > cutoff : null;
}
function partitionReignSnapshot_(raw, snapshot) {
  var cutoff = snapshot.cutoffDate;
  var preservedBookingIds = {}, archivedBookingIds = {}, preservedSessionIds = {}, knownSessionIds = {};
  var b = raw['Bookings'];
  var bi = reignHeaderIndex_(b.headers, 'Booking ID');
  var bd = reignHeaderIndex_(b.headers, 'Booking Date');
  var bsession = reignHeaderIndex_(b.headers, 'Collected Session ID');
  var archiveBookings = [], preserveBookings = [];
  b.rows.forEach(function(row) {
    var id = bi >= 0 ? String(row[bi] || '') : '';
    var future = bd >= 0 ? reignIsFuture_(row[bd], cutoff) : null;
    if (future === false) { archiveBookings.push(row); if (id) archivedBookingIds[id] = true; }
    else {
      preserveBookings.push(row); if (id) preservedBookingIds[id] = true;
      if (bsession >= 0 && row[bsession]) preservedSessionIds[String(row[bsession])] = true;
    }
  });

  var s = raw['Sessions'];
  var si = reignHeaderIndex_(s.headers, 'Session ID');
  var sl = reignHeaderIndex_(s.headers, 'Loan Timestamp');
  s.rows.forEach(function(row) { if (si >= 0 && row[si]) knownSessionIds[String(row[si])] = true; });
  var archiveSessions = [], preserveSessions = [];
  s.rows.forEach(function(row) {
    var id = si >= 0 ? String(row[si] || '') : '';
    var future = sl >= 0 ? reignIsFuture_(row[sl], cutoff) : null;
    if (preservedSessionIds[id] || future !== false) {
      preserveSessions.push(row); if (id) preservedSessionIds[id] = true;
    } else archiveSessions.push(row);
  });

  var tr = raw['Session Trolleys'];
  var tsi = reignHeaderIndex_(tr.headers, 'Session ID');
  var archiveTrolleys = [], preserveTrolleys = [];
  tr.rows.forEach(function(row) {
    var sid = tsi >= 0 ? String(row[tsi] || '') : '';
    if (!sid || preservedSessionIds[sid] || !knownSessionIds[sid]) preserveTrolleys.push(row);
    else archiveTrolleys.push(row);
  });

  var e = raw['Event Log'];
  var esi = reignHeaderIndex_(e.headers, 'Session ID');
  var eti = reignHeaderIndex_(e.headers, 'Timestamp');
  var archiveEvents = [], preserveEvents = [];
  e.rows.forEach(function(row) {
    var ref = esi >= 0 ? String(row[esi] || '') : '';
    var future = eti >= 0 ? reignIsFuture_(row[eti], cutoff) : null;
    if ((ref && (preservedBookingIds[ref] || preservedSessionIds[ref])) || future !== false) preserveEvents.push(row);
    else archiveEvents.push(row);
  });

  var partitions = {
    'Bookings': [archiveBookings, preserveBookings],
    'Sessions': [archiveSessions, preserveSessions],
    'Session Trolleys': [archiveTrolleys, preserveTrolleys],
    'Event Log': [archiveEvents, preserveEvents]
  };
  Object.keys(partitions).forEach(function(name) {
    var src = raw[name], archived = partitions[name][0], preserved = partitions[name][1];
    snapshot.sheets[name] = {
      headers: src.headers,
      rows: archived,
      rowCount: archived.length,
      preservedRows: preserved,
      preservedCount: preserved.length,
      originalDataRowCount: src.originalDataRowCount,
      lastCol: src.lastCol
    };
    snapshot.totalDataRows += archived.length;
    snapshot.totalPreservedRows += preserved.length;
    scanReignDateBounds_(src.headers, archived, snapshot);
  });
}

function scanReignDateBounds_(headers, rows, snapshot) {
  var dateHeaderPattern = /(timestamp|created at|updated at|cancelled at|booking date)/i;
  var indexes = [];
  for (var h = 0; h < headers.length; h++) if (dateHeaderPattern.test(headers[h])) indexes.push(h);
  for (var r = 0; r < rows.length; r++) {
    for (var i = 0; i < indexes.length; i++) {
      var value = rows[r][indexes[i]];
      if (!value) continue;
      var d = value instanceof Date ? value : new Date(value);
      var ms = d.getTime();
      if (!isFinite(ms)) continue;
      if (snapshot.earliestMs === null || ms < snapshot.earliestMs) snapshot.earliestMs = ms;
      if (snapshot.latestMs === null || ms > snapshot.latestMs) snapshot.latestMs = ms;
    }
  }
}

function reignPreviewFromSnapshot_(snapshot) {
  var start = snapshot.earliestMs === null ? '' : Utilities.formatDate(new Date(snapshot.earliestMs), LORD_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  var end = snapshot.latestMs === null ? snapshot.cutoffDate : Utilities.formatDate(new Date(snapshot.latestMs), LORD_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  if (end > snapshot.cutoffDate) end = snapshot.cutoffDate;
  var rowCounts = {}, preservedRowCounts = {};
  for (var name in snapshot.sheets) {
    rowCounts[name] = snapshot.sheets[name].rowCount;
    preservedRowCounts[name] = snapshot.sheets[name].preservedCount || 0;
  }
  var stats = computeReignStatistics_(snapshot);
  return {
    periodStart: start,
    periodEnd: end,
    cutoffDate: snapshot.cutoffDate,
    rowCounts: rowCounts,
    preservedRowCounts: preservedRowCounts,
    totalRows: snapshot.totalDataRows,
    totalPreservedRows: snapshot.totalPreservedRows,
    confirmationText: 'CLOSE ' + start + ' TO ' + end,
    statistics: stats
  };
}

function computeReignStatistics_(snapshot) {
  var bookings = reignRowsAsObjects_(snapshot.sheets[BOOKING_CONFIG.SHEET]);
  var sessions = reignRowsAsObjects_(snapshot.sheets[LORD_CONFIG.SHEETS.SESSIONS]);
  var trolleys = reignRowsAsObjects_(snapshot.sheets[LORD_CONFIG.SHEETS.TROLLEYS]);
  var events = reignRowsAsObjects_(snapshot.sheets[LORD_CONFIG.SHEETS.EVENTS]);

  var borrowerCounts = {}, resourceCounts = {}, trolleyCounts = {}, dayCounts = {}, periodCounts = {}, classCounts = {}, deviceTypeCounts = {};
  var totalRequested = 0, headphonesBooked = 0, stylusesBooked = 0;
  bookings.forEach(function (b) {
    reignCount_(borrowerCounts, b['Teacher TTB Name']);
    reignCount_(resourceCounts, b['Resource']);
    reignCount_(classCounts, b['Class or Student Group']);
    reignCount_(deviceTypeCounts, b['Device Type']);
    reignCount_(periodCounts, b['Start Period'] ? 'P' + b['Start Period'] : '');
    var date = reignDateKey_(b['Booking Date']); if (date) reignCount_(dayCounts, date);
    totalRequested += Number(b['Requested Quantity'] || 0);
    if (reignTruthy_(b['Headphones'])) headphonesBooked += Number(b['Requested Quantity'] || 0);
    if (reignTruthy_(b['Styluses'])) stylusesBooked += Number(b['Requested Quantity'] || 0);
  });
  trolleys.forEach(function (t) { reignCount_(trolleyCounts, t['Trolley Name']); });

  var totalLoanDevices = 0, totalReturnedDevices = 0, issueReturns = 0, forceReturns = 0, completed = 0, loanDurations = [];
  var uniqueCollectors = {};
  sessions.forEach(function (s) {
    totalLoanDevices += Number(s['Loan Device Total'] || 0);
    totalReturnedDevices += Number(s['Return Device Total'] || 0);
    if (normaliseText_(s['Collector TTB Name'] || s['Loan Teacher'])) uniqueCollectors[normaliseText_(s['Collector TTB Name'] || s['Loan Teacher'])] = true;
    var status = normaliseText_(s['Status']).toUpperCase();
    if (status.indexOf('ISSUE') >= 0) issueReturns++;
    if (status.indexOf('FORCED') >= 0) forceReturns++;
    if (s['Return Timestamp']) completed++;
    var loan = reignDateMs_(s['Loan Timestamp']), ret = reignDateMs_(s['Return Timestamp']);
    if (loan && ret && ret >= loan) loanDurations.push(ret - loan);
  });
  var avgDevices = sessions.length ? totalLoanDevices / sessions.length : 0;
  var longest = loanDurations.length ? Math.max.apply(null, loanDurations) : 0;
  var fastest = loanDurations.length ? Math.min.apply(null, loanDurations) : 0;
  return {
    bookings: bookings.length,
    movementSessions: sessions.length,
    trolleyRecords: trolleys.length,
    events: events.length,
    uniqueCollectors: Object.keys(uniqueCollectors).length,
    totalRequestedDevices: totalRequested,
    totalDevicesCollected: totalLoanDevices,
    totalDevicesReturned: totalReturnedDevices,
    averageDevicesPerCollection: Math.round(avgDevices * 10) / 10,
    completedSessions: completed,
    returnsWithIssues: issueReturns,
    forcedReturns: forceReturns,
    headphonesBooked: headphonesBooked,
    stylusesBooked: stylusesBooked,
    topBorrower: reignTop_(borrowerCounts),
    mostHardworkingCart: reignTop_(resourceCounts),
    mostHardworkingTrolley: reignTop_(trolleyCounts),
    busiestDay: reignTop_(dayCounts),
    busiestStartPeriod: reignTop_(periodCounts),
    mostPopularClassOrActivity: reignTop_(classCounts),
    mostRequestedDeviceType: reignTop_(deviceTypeCounts),
    longestLoanMinutes: Math.round(longest / 60000),
    fastestReturnMinutes: Math.round(fastest / 60000)
  };
}

function reignRowsAsObjects_(sheetData) {
  if (!sheetData) return [];
  return sheetData.rows.map(function (row) {
    var obj = {};
    for (var i = 0; i < sheetData.headers.length; i++) obj[sheetData.headers[i]] = row[i];
    return obj;
  });
}
function reignCount_(map, key) { key = normaliseText_(key); if (key) map[key] = (map[key] || 0) + 1; }
function reignTop_(map) { var best = { name: '', count: 0 }; for (var k in map) if (map[k] > best.count) best = { name: k, count: map[k] }; return best; }
function reignTruthy_(v) { return v === true || /^(true|yes|y|1)$/i.test(String(v || '').trim()); }
function reignDateMs_(v) { if (!v) return 0; var d = v instanceof Date ? v : new Date(v); var ms = d.getTime(); return isFinite(ms) ? ms : 0; }
function reignDateKey_(v) { var ms = reignDateMs_(v); return ms ? Utilities.formatDate(new Date(ms), LORD_CONFIG.TIME_ZONE, 'yyyy-MM-dd') : ''; }

function createReignArchiveFiles_(snapshot, generatedAt, request) {
  var preview = reignPreviewFromSnapshot_(snapshot);
  var suffix = preview.periodStart + '_to_' + preview.periodEnd;
  var folder = getReignArchiveFolder_();
  var provenance = {
    sourceSpreadsheetId: snapshot.spreadsheetId,
    sourceSpreadsheetName: snapshot.spreadsheetName,
    periodStart: preview.periodStart,
    periodEnd: preview.periodEnd,
    archivedAt: generatedAt.toISOString(),
    archivedBy: normaliseText_(request.authTtbName || request.authEmail),
    archivedByEmail: normaliseText_(request.authEmail),
    rowCounts: preview.rowCounts,
    preservedRowCounts: preview.preservedRowCounts,
    cutoffDate: preview.cutoffDate,
    statistics: preview.statistics
  };
  var rawPayload = { provenance: provenance, sheets: {} };
  for (var name in snapshot.sheets) rawPayload.sheets[name] = { headers: snapshot.sheets[name].headers, rows: snapshot.sheets[name].rows.map(reignJsonSafeRow_) };

  var mdName = REIGN_CONFIG.ARCHIVE_PREFIX + '_Statistics_' + suffix + '.md';
  var htmlName = REIGN_CONFIG.ARCHIVE_PREFIX + '_Wrapped_' + suffix + '.html';
  var jsonName = REIGN_CONFIG.ARCHIVE_PREFIX + '_Archive_' + suffix + '.json';
  var md = folder.createFile(mdName, buildReignMarkdown_(provenance), MimeType.PLAIN_TEXT);
  var html = folder.createFile(htmlName, buildReignWrappedHtml_(provenance), 'text/html');
  var json = folder.createFile(jsonName, JSON.stringify(rawPayload, null, 2), MimeType.PLAIN_TEXT);
  return { files: [reignFileInfo_(md), reignFileInfo_(html), reignFileInfo_(json)] };
}
function reignJsonSafeRow_(row) { return row.map(function (v) { return v instanceof Date ? v.toISOString() : v; }); }
function reignFileInfo_(file) { return { id: file.getId(), name: file.getName(), url: file.getUrl(), size: file.getSize() }; }
function verifyReignArchiveFiles_(archive) {
  if (!archive || !archive.files || archive.files.length < 3) throw new Error('REIGN archive generation was incomplete; no data was cleared.');
  for (var i = 0; i < archive.files.length; i++) {
    if (!archive.files[i].id || Number(archive.files[i].size || 0) <= 0) throw new Error('REIGN could not verify ' + (archive.files[i].name || 'an archive file') + '; no data was cleared.');
  }
}

function buildReignMarkdown_(p) {
  var s = p.statistics, lines = [];
  lines.push('# LORD Statistics — ' + p.periodStart + ' to ' + p.periodEnd, '');
  lines.push('Generated: ' + p.archivedAt, 'Source spreadsheet: `' + p.sourceSpreadsheetId + '`', 'Archived by: ' + p.archivedBy, '');
  lines.push('## Volume', '');
  lines.push('- Bookings: ' + s.bookings);
  lines.push('- Movement sessions: ' + s.movementSessions);
  lines.push('- Trolley records: ' + s.trolleyRecords);
  lines.push('- Event log entries: ' + s.events);
  lines.push('- Unique collectors: ' + s.uniqueCollectors);
  lines.push('- Devices requested: ' + s.totalRequestedDevices);
  lines.push('- Devices collected: ' + s.totalDevicesCollected);
  lines.push('- Devices returned: ' + s.totalDevicesReturned);
  lines.push('- Average devices per collection: ' + s.averageDevicesPerCollection, '');
  lines.push('## Operational highlights', '');
  lines.push('- Most frequent borrower: ' + reignStatLabel_(s.topBorrower));
  lines.push('- Most hardworking cart: ' + reignStatLabel_(s.mostHardworkingCart));
  lines.push('- Most hardworking trolley: ' + reignStatLabel_(s.mostHardworkingTrolley));
  lines.push('- Busiest day: ' + reignStatLabel_(s.busiestDay));
  lines.push('- Busiest start period: ' + reignStatLabel_(s.busiestStartPeriod));
  lines.push('- Most popular class/activity: ' + reignStatLabel_(s.mostPopularClassOrActivity));
  lines.push('- Most requested device type: ' + reignStatLabel_(s.mostRequestedDeviceType));
  lines.push('- Returns with issues: ' + s.returnsWithIssues);
  lines.push('- Forced returns: ' + s.forcedReturns);
  lines.push('- Longest recorded loan: ' + s.longestLoanMinutes + ' minutes');
  lines.push('- Fastest recorded return: ' + s.fastestReturnMinutes + ' minutes');
  lines.push('- Styluses booked: ' + s.stylusesBooked);
  lines.push('- Headphones booked: ' + s.headphonesBooked, '');
  lines.push('## Rows archived', '');
  for (var k in p.rowCounts) lines.push('- ' + k + ': ' + p.rowCounts[k]);
  lines.push('', 'This report contains only REIGN-eligible records through the cutoff date. Future and unclassifiable records were preserved live. Sheet structures and the Photos folder were not removed.');
  return lines.join('\n');
}
function reignStatLabel_(x) { return x && x.name ? x.name + ' (' + x.count + ')' : 'No data'; }

function buildReignWrappedHtml_(p) {
  var s = p.statistics;
  var cards = [
    ['Your LORD period', p.periodStart + '<br>→ ' + p.periodEnd, 'A snapshot of how devices moved through the school.'],
    ['Devices on the move', s.totalDevicesCollected.toLocaleString(), 'devices were collected across ' + s.movementSessions.toLocaleString() + ' movement sessions.'],
    ['Most frequent borrower', reignHtmlEscape_(s.topBorrower.name || 'No data'), s.topBorrower.count ? s.topBorrower.count + ' bookings during this period.' : 'No bookings recorded.'],
    ['The workhorse', reignHtmlEscape_(s.mostHardworkingCart.name || 'No data'), s.mostHardworkingCart.count ? 'Our most hardworking cart, booked ' + s.mostHardworkingCart.count + ' times.' : 'No cart activity recorded.'],
    ['Trolley mileage', reignHtmlEscape_(s.mostHardworkingTrolley.name || 'No data'), s.mostHardworkingTrolley.count ? s.mostHardworkingTrolley.count + ' recorded movements.' : 'No trolley activity recorded.'],
    ['Peak day', reignHtmlEscape_(s.busiestDay.name || 'No data'), s.busiestDay.count ? s.busiestDay.count + ' bookings made this the busiest day.' : 'No booking dates recorded.'],
    ['Average collection', String(s.averageDevicesPerCollection), 'devices per collection.'],
    ['Accessories', s.stylusesBooked.toLocaleString() + ' styluses', s.headphonesBooked.toLocaleString() + ' headphones were booked too.'],
    ['Exceptions matter', String(s.returnsWithIssues), 'returns with issues · ' + s.forcedReturns + ' forced returns.'],
    ['That’s a wrap', s.bookings.toLocaleString() + ' bookings', s.uniqueCollectors + ' unique collectors served this logging period.']
  ];
  var sections = cards.map(function (c, i) { return '<section class="slide s' + (i % 5) + '"><div class="eyebrow">' + c[0] + '</div><div class="big">' + c[1] + '</div><p>' + c[2] + '</p><div class="counter">' + (i + 1) + ' / ' + cards.length + '</div></section>'; }).join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LORD Wrapped ' + p.periodStart + ' to ' + p.periodEnd + '</title><style>' +
    '*{box-sizing:border-box}html{scroll-snap-type:y mandatory;scroll-behavior:smooth}body{margin:0;font-family:Inter,Arial,sans-serif;background:#0d1830;color:#fff}.slide{min-height:100vh;scroll-snap-align:start;display:flex;flex-direction:column;justify-content:center;padding:9vw;position:relative;overflow:hidden}.slide:after{content:"";position:absolute;width:55vw;height:55vw;border-radius:50%;filter:blur(1px);opacity:.22;right:-15vw;bottom:-20vw;background:#fff}.s0{background:linear-gradient(135deg,#173b79,#091b3b)}.s1{background:linear-gradient(135deg,#7a3946,#28101a)}.s2{background:linear-gradient(135deg,#c07b33,#613714)}.s3{background:linear-gradient(135deg,#173b79,#7a3946)}.s4{background:linear-gradient(135deg,#7a3946,#c07b33)}.eyebrow{font-size:clamp(16px,2vw,28px);font-weight:700;text-transform:uppercase;letter-spacing:.14em;opacity:.78}.big{font-size:clamp(54px,11vw,156px);font-weight:900;line-height:.9;letter-spacing:-.055em;margin:28px 0;max-width:1000px}.slide p{font-size:clamp(20px,3vw,42px);line-height:1.2;max-width:850px;margin:0;opacity:.9}.counter{position:absolute;right:3vw;bottom:3vw;font-weight:700;opacity:.65}@media print{html{scroll-snap-type:none}.slide{page-break-after:always;min-height:100vh}}' +
    '</style></head><body>' + sections + '<script>document.addEventListener("keydown",function(e){var h=innerHeight;if(e.key==="ArrowDown"||e.key==="PageDown"||e.key===" ")scrollBy({top:h,behavior:"smooth"});if(e.key==="ArrowUp"||e.key==="PageUp")scrollBy({top:-h,behavior:"smooth"})});</script></body></html>';
}
function reignHtmlEscape_(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function clearReignTransactionalRows_(spreadsheet, snapshot) {
  // v1 never deletes Sheet rows. Each fixed data range is rewritten once:
  // preserved future/unclassifiable records are compacted to the top, and the
  // remainder is blanked. Formatting, validation, frozen rows and dimensions
  // therefore survive the close unchanged.
  for (var i = 0; i < REIGN_CONFIG.TRANSACTION_SHEETS.length; i++) {
    var name = REIGN_CONFIG.TRANSACTION_SHEETS[i];
    var data = snapshot.sheets[name];
    var sheet = getRequiredSheet_(spreadsheet, name);
    var count = Number(data.originalDataRowCount || 0);
    if (!count) continue;
    var width = Math.max(1, Number(data.lastCol || data.headers.length || 1));
    var output = [];
    for (var r = 0; r < count; r++) {
      var src = r < data.preservedRows.length ? data.preservedRows[r] : [];
      var row = [];
      for (var c = 0; c < width; c++) row.push(c < src.length ? src[c] : '');
      output.push(row);
    }
    sheet.getRange(2, 1, count, width).setValues(output);
  }
}


/* LORD Suite v1 — complete STARLORD board backend module
 *
 * Replace the complete existing STARLORD backend source file with this file.
 * The transaction doGet router must return getStarlordBoardData_(request)
 * for action=starlordBoard. Compatibility aliases are included below.
 */

/* =========================
 * STARLORD STUDENT BOARD SERVICE
 * ========================= */

function getStarlordBoardData_(request) {
  request = request || {};
  var date = normaliseText_(request.date);
  if (!date) {
    date = Utilities.formatDate(new Date(), LORD_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  }

  var transaction = getTransactionSpreadsheet_();
  var periods = getStarlordPeriods_();
  var bookingSheet = getRequiredSheet_(transaction, BOOKING_CONFIG.SHEET);

  if (bookingSheet.getLastRow() < 2) {
    return { ok: true, date: date, bookings: [] };
  }

  var rows = bookingSheet
    .getRange(2, 1, bookingSheet.getLastRow() - 1, 21)
    .getValues()
    .filter(function(row) {
      return String(row[1] || '').toUpperCase() !== 'CANCELLED' && readDayKey_(row[6]) === date;
    });
  var sessionIds = new Set(rows.map(function(row) { return normaliseText_(row[20]); }).filter(Boolean));
  var sessions = rows.length ? getStarlordSessionMap_(transaction, sessionIds) : {};
  var statutoryNames = rows.length ? getStarlordStatutoryNameMap_(transaction) : {};
  var bookings = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var start = periods[String(row[10])] || null;
    var end = periods[String(row[11])] || null;
    var ttbName = normaliseText_(row[2]);
    var sessionId = normaliseText_(row[20]);
    var session = sessionId ? sessions[sessionId] : null;
    var status = normaliseText_(row[1]).toUpperCase();
    var accessories = [];
    var requestedQuantity = Number(row[9]) || 0;
    if (Boolean(row[12])) accessories.push('Headphones × ' + requestedQuantity);
    if (Boolean(row[13])) accessories.push('Styluses × ' + requestedQuantity);

    bookings.push({
      bookingId: normaliseText_(row[0]),
      bookingStatus: status,
      teacherStatutoryName: statutoryNames[ttbName.toLowerCase()] || ttbName,
      teacherTtbName: ttbName,
      classOrActivity: normaliseText_(row[4]),
      subject: normaliseText_(row[5]),
      resource: normaliseText_(row[7]),
      deviceType: normaliseText_(row[8]),
      requestedQuantity: requestedQuantity,
      startPeriod: normaliseText_(row[10]),
      endPeriod: normaliseText_(row[11]),
      startTime: start ? start.displayStart : '',
      endTime: end ? end.displayEnd : '',
      epochStart: start ? starlordEpoch_(date, start.isoStart) : 0,
      epochEnd: end ? starlordEpoch_(date, end.isoEnd) : 0,
      accessories: accessories.join(', ') || 'None',
      collectedSessionId: sessionId,
      sessionId: sessionId,
      sessionStatus: session ? session.status : status,
      movementState: session ? session.movementState : status,
      isOpen: session ? session.isOpen : false,
      loanTimestamp: session ? session.loanTimestamp : '',
      returnTimestamp: session ? session.returnTimestamp : ''
    });
  }

  bookings.sort(function (a, b) {
    return a.epochStart - b.epochStart ||
      a.teacherStatutoryName.localeCompare(b.teacherStatutoryName);
  });

  return {
    ok: true,
    date: date,
    graceMinutes: 30,
    bookings: bookings
  };
}

/* Compatibility aliases for common existing router names. */
function getStarlordBoard_(request) {
  return getStarlordBoardData_(request);
}

function buildStarlordBoard_(request) {
  return getStarlordBoardData_(request);
}

function getStarlordPeriods_() {
  var periods = getReferenceData_().periods || [];
  var map = {};
  for (var i = 0; i < periods.length; i++) {
    var code = normaliseText_(periods[i].code);
    if (!code) continue;
    var start = starlordTimeParts_(periods[i].start);
    var end = starlordTimeParts_(periods[i].end);
    map[code] = {
      isoStart: start.iso,
      isoEnd: end.iso,
      displayStart: start.display,
      displayEnd: end.display
    };
  }
  return map;
}

function getStarlordSessionMap_(spreadsheet, sessionIds) {
  assertSessionSchema_(spreadsheet);
  var sheet = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.SESSIONS);
  var map = {};
  if (sessionIds && !sessionIds.size) return map;
  if (sheet.getLastRow() < 2) return map;

  // STARLORD only needs Session ID, status and loan/return timestamps.
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  for (var i = 0; i < rows.length; i++) {
    var id = normaliseText_(rows[i][0]);
    if (!id || (sessionIds && !sessionIds.has(id))) continue;
    var status = normaliseText_(rows[i][1]).toUpperCase();
    var returned = Boolean(rows[i][8]) ||
      (status !== 'OPEN' && status !== 'PENDING_COLLECTION');
    map[id] = {
      status: status,
      isOpen: status === 'OPEN' || status === 'PENDING_COLLECTION',
      movementState: status === 'PENDING_COLLECTION' ? 'PENDING_COLLECTION' : (returned ? 'RETURNED' : 'OPEN'),
      loanTimestamp: rows[i][7] ? formatDate_(rows[i][7]) : '',
      returnTimestamp: rows[i][8] ? formatDate_(rows[i][8]) : ''
    };
  }
  return map;
}

function getStarlordStatutoryNameMap_(spreadsheet) {
  var sheet = getRequiredSheet_(spreadsheet, 'contacts');
  var map = {};
  if (sheet.getLastRow() < 2) return map;

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    var ttb = normaliseText_(rows[i][0]);
    if (!ttb) continue;
    map[ttb.toLowerCase()] = normaliseText_(rows[i][4]) || ttb;
  }
  return map;
}

function starlordTimeParts_(value) {
  var dateValue = value instanceof Date ? value : null;
  var iso;
  if (dateValue) {
    iso = Utilities.formatDate(dateValue, LORD_CONFIG.TIME_ZONE, 'HH:mm');
  } else {
    var text = normaliseText_(value);
    var match = text.match(/^(\d{1,2}):(\d{2})$/);
    iso = match ? ('0' + match[1]).slice(-2) + ':' + match[2] : text;
  }

  var pieces = iso.split(':');
  var hour = Number(pieces[0]) || 0;
  var minute = Number(pieces[1]) || 0;
  var suffix = hour >= 12 ? 'PM' : 'AM';
  var hour12 = hour % 12 || 12;
  return {
    iso: ('0' + hour).slice(-2) + ':' + ('0' + minute).slice(-2),
    display: hour12 + ':' + ('0' + minute).slice(-2) + ' ' + suffix
  };
}

function starlordEpoch_(date, time) {
  if (!date || !time) return 0;
  return new Date(date + 'T' + time + ':00+08:00').getTime();
}

function testStarlordBoard() {
  Logger.log(JSON.stringify(getStarlordBoardData_({}), null, 2));
}


/* =========================
 * AUTHORIZATION + IDENTITY SERVICE
 * ========================= */

var LORD_AUTH_CONFIG = Object.freeze({
  CONTACTS_SHEET: 'contacts',
  ADMINS_SHEET: 'admins'
});

var ADMIN_HEADERS = [
  'GSPS Email',
  'TTB Name',
  'Active',
  'Role',
  'Remarks',
  'Google Sub'
];

function setupLORDV1Workbook() {
  var spreadsheet = getTransactionSpreadsheet_();
  ensureHeaderRow_(spreadsheet, LORD_CONFIG.SHEETS.SESSIONS, SESSION_HEADERS);
  ensureHeaderRow_(spreadsheet, LORD_CONFIG.SHEETS.TROLLEYS, TROLLEY_HEADERS);
  ensureHeaderRow_(spreadsheet, LORD_CONFIG.SHEETS.EVENTS, EVENT_HEADERS);
  ensureHeaderRow_(spreadsheet, BOOKING_CONFIG.SHEET, BOOKING_HEADERS);
  ensureHeaderRow_(spreadsheet, LORD_AUTH_CONFIG.ADMINS_SHEET, ADMIN_HEADERS);

  var admins = spreadsheet.getSheetByName(LORD_AUTH_CONFIG.ADMINS_SHEET);
  admins.setFrozenRows(1);
  admins.autoResizeColumns(1, ADMIN_HEADERS.length);
  assertSessionSchema_(spreadsheet);
  Logger.log('LORD v1 workbook schema verified. Existing data rows were preserved.');
  return true;
}

function ensureHeaderRow_(spreadsheet, sheetName, headers) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function identityLookup_(email, googleSub) {
  var normalizedEmail = normaliseText_(email).toLowerCase();
  if (!normalizedEmail || !/@gsps\.edu\.sg$/i.test(normalizedEmail)) {
    return { found: false, ttbName: '', email: normalizedEmail, isAdmin: false };
  }

  var spreadsheet = getTransactionSpreadsheet_();
  var contacts = getRequiredSheet_(spreadsheet, LORD_AUTH_CONFIG.CONTACTS_SHEET);
  var ttbName = '';

  if (contacts.getLastRow() >= 2) {
    var contactRows = contacts.getRange(2, 1, contacts.getLastRow() - 1, 8).getDisplayValues();
    for (var i = 0; i < contactRows.length; i++) {
      if (normaliseText_(contactRows[i][3]).toLowerCase() === normalizedEmail) {
        ttbName = normaliseText_(contactRows[i][0]);
        break;
      }
    }
  }

  var adminRecord = findAdminByEmail_(normalizedEmail);

  if (!ttbName) {
    ttbName = adminRecord && adminRecord.ttbName ?
      adminRecord.ttbName : displayNameFromGspsEmail_(normalizedEmail);
  }
  if (adminRecord && googleSub && !adminRecord.googleSub) {
    adminRecord.sheet.getRange(adminRecord.rowNumber, 6).setValue(googleSub);
    adminRecord.googleSub = googleSub;
  }

  return {
    found: true,
    ttbName: ttbName,
    email: normalizedEmail,
    isAdmin: Boolean(adminRecord && adminRecord.active),
    role: adminRecord && adminRecord.active ? adminRecord.role : '',
    googleSub: googleSub || (adminRecord ? adminRecord.googleSub : '')
  };
}


function displayNameFromGspsEmail_(email) {
  var localPart = normaliseText_(email).toLowerCase().split('@')[0];
  if (!localPart) return 'GSPS User';
  var words = localPart.split('.');
  var output = [];
  for (var i = 0; i < words.length; i++) {
    var word = normaliseText_(words[i]);
    if (!word) continue;
    output.push(word.charAt(0).toUpperCase() + word.slice(1));
  }
  return output.length ? output.join(' ') : 'GSPS User';
}

function findAdminByEmail_(email) {
  var ctx = executionContext_();
  var memo = ctx.adminsByEmail || (ctx.adminsByEmail = Object.create(null));
  var key = normaliseText_(email).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(memo, key)) return memo[key];
  var spreadsheet = getTransactionSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(LORD_AUTH_CONFIG.ADMINS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) { memo[key] = null; return null; }
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, ADMIN_HEADERS.length).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    if (normaliseText_(rows[i][0]).toLowerCase() === key) {
      var activeText = normaliseText_(rows[i][2]).toLowerCase();
      memo[key] = {
        sheet: sheet,
        rowNumber: i + 2,
        email: key,
        ttbName: normaliseText_(rows[i][1]),
        active: activeText === 'yes' || activeText === 'true' || activeText === 'active' || activeText === '1',
        role: normaliseText_(rows[i][3]) || 'Admin',
        googleSub: normaliseText_(rows[i][5])
      };
      return memo[key];
    }
  }
  memo[key] = null;
  return null;
}

function isAuthenticatedAdmin_(request) {
  if (!request || !(request.authIsAdmin === true || request.authIsAdmin === 'true')) return false;
  var email = normaliseText_(request.authEmail).toLowerCase();
  var admin = findAdminByEmail_(email);
  if (!admin || !admin.active) return false;
  var sub = normaliseText_(request.authSub);
  if (admin.googleSub && sub && admin.googleSub !== sub) return false;
  return true;
}

function isBookingOwner_(rowValues, request) {
  if (!request) return false;
  var authSub = normaliseText_(request.authSub);
  var authEmail = normaliseText_(request.authEmail).toLowerCase();
  var ownerSub = normaliseText_(rowValues[24]);
  var ownerEmail = normaliseText_(rowValues[25]).toLowerCase();
  if (ownerSub && authSub) return ownerSub === authSub;
  if (ownerEmail && authEmail) return ownerEmail === authEmail;
  var legacyEmails = normaliseText_(rowValues[3]).toLowerCase().split(',');
  for (var i = 0; i < legacyEmails.length; i++) {
    if (normaliseText_(legacyEmails[i]).toLowerCase() === authEmail) return true;
  }
  return false;
}

function getBookingForEditAuthenticated_(parameters) {
  var bookingId = requiredText_(parameters.bookingId, 'Booking ID');
  var row = findBookingRow_(bookingId);
  if (!row) throw new Error('Booking not found.');

  var requestIdentity = {
    authSub: normaliseText_(parameters.authSub),
    authEmail: normaliseText_(parameters.authEmail),
    authIsAdmin: normaliseText_(parameters.authIsAdmin)
  };

  if (isAuthenticatedAdmin_(requestIdentity) || isBookingOwner_(row.values, requestIdentity)) {
    return bookingPublic_(row.values);
  }

  return getBookingForEdit_(
    bookingId,
    normaliseText_(parameters.token),
    normaliseText_(parameters.code),
    ''
  );
}

function listMyBookings_(parameters) {
  var authSub = normaliseText_(parameters.authSub);
  var authEmail = normaliseText_(parameters.authEmail).toLowerCase();
  if (!authSub && !authEmail) throw new Error('Authenticated identity is required.');

  var spreadsheet = getTransactionSpreadsheet_();
  var sheet = getRequiredSheet_(spreadsheet, BOOKING_CONFIG.SHEET);
  if (sheet.getLastRow() < 2) return [];
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, BOOKING_HEADERS.length).getValues();
  var output = [];
  var requestIdentity = { authSub: authSub, authEmail: authEmail };
  for (var i = 0; i < rows.length; i++) {
    if (isBookingOwner_(rows[i], requestIdentity)) output.push(bookingPublic_(rows[i]));
  }
  output.sort(function(a, b) {
    if (a.date === b.date) return Number(a.startPeriod) - Number(b.startPeriod);
    return a.date < b.date ? 1 : -1;
  });
  return output;
}

function requireProxySecret_(candidate) {
  if (String(candidate || '') !== String(LORD_CONFIG.PROXY_SECRET)) {
    throw new Error('Unauthorised proxy request.');
  }
}


/* =========================
 * CANONICAL REFERENCE DATA SERVICE
 * ========================= */

function getReferenceData_() {
  var ctx = executionContext_();
  if (ctx.referenceData) return ctx.referenceData;
  var cache = CacheService.getScriptCache();
  var cached = ctx.forceRefresh ? null : cache.get(LORD_REFERENCE_CONFIG.CACHE_KEY);

  if (cached) {
    if (ctx.requestMetrics) ctx.requestMetrics.referenceCache = 'hit';
    ctx.referenceData = JSON.parse(cached);
    return ctx.referenceData;
  }

  if (ctx.requestMetrics) ctx.requestMetrics.referenceCache = ctx.forceRefresh ? 'forced' : 'miss';
  var spreadsheet = getReferenceSpreadsheet_();

  var trolleys = readReferenceTrolleys_(
    spreadsheet,
    LORD_REFERENCE_CONFIG.SHEETS.trolleys
  );

  var data = {
    teachers: readReferenceSingleColumn_(
      spreadsheet,
      LORD_REFERENCE_CONFIG.SHEETS.teachers
    ),
    classes: readReferenceSingleColumn_(
      spreadsheet,
      LORD_REFERENCE_CONFIG.SHEETS.classes
    ),
    subjects: readReferenceSingleColumn_(
      spreadsheet,
      LORD_REFERENCE_CONFIG.SHEETS.subjects
    ),
    trolleys: trolleys,
    bookingResources: buildBookingResources_(trolleys),
    periods: readReferenceTimetable_(
      spreadsheet,
      LORD_REFERENCE_CONFIG.SHEETS.timetable
    ),
    defaultViewport: {
      startTime: '07:00',
      endTime: '13:30'
    }
  };

  validateReferenceData_(data);
  ctx.referenceData = data;

  cache.put(
    LORD_REFERENCE_CONFIG.CACHE_KEY,
    JSON.stringify(data),
    LORD_REFERENCE_CONFIG.CACHE_SECONDS
  );

  return data;
}

function readReferenceSingleColumn_(spreadsheet, sheetName) {
  var sheet = getReferenceRequiredSheet_(spreadsheet, sheetName);
  var lastRow = sheet.getLastRow();

  if (lastRow < 1) {
    return [];
  }

  var values = sheet.getRange(1, 1, lastRow, 1).getDisplayValues();
  var output = [];

  for (var i = 0; i < values.length; i++) {
    var value = String(values[i][0] || '').trim();
    if (value) {
      output.push(value);
    }
  }

  return output;
}

/*
 * trolleys sheet
 * Row 1: headers
 * A: Trolley
 * B: Qty Per Trolley
 * C: Cart
 * D: Type
 * E: Stylus Option
 * F: Headphone Option
 */
function readReferenceTrolleys_(spreadsheet, sheetName) {
  var sheet = getReferenceRequiredSheet_(spreadsheet, sheetName);
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  var rows = sheet.getRange(2, 1, lastRow - 1, 6).getDisplayValues();
  var output = [];

  for (var i = 0; i < rows.length; i++) {
    var sheetRow = i + 2;
    var trolleyName = String(rows[i][0] || '').trim();

    if (!trolleyName) {
      continue;
    }

    var quantity = Number(String(rows[i][1] || '').trim());
    var cart = String(rows[i][2] || '').trim();
    var deviceType = String(rows[i][3] || '').trim();

    if (!isFinite(quantity) || Math.floor(quantity) !== quantity ||
        quantity < 1 || quantity > 200) {
      throw new Error(
        'Invalid trolley quantity in ' + sheetName + '!B' + sheetRow +
        ': "' + rows[i][1] + '". Enter a whole number from 1 to 200.'
      );
    }

    if (!cart) {
      throw new Error('Missing Cart in ' + sheetName + '!C' + sheetRow + '.');
    }

    if (!deviceType) {
      throw new Error('Missing Type in ' + sheetName + '!D' + sheetRow + '.');
    }

    output.push({
      name: trolleyName,
      defaultQuantity: quantity,
      group: cart,
      deviceType: deviceType,
      stylusOption: referenceToBoolean_(rows[i][4]),
      headphoneOption: referenceToBoolean_(rows[i][5]),
      sourceRow: sheetRow
    });
  }

  return output;
}

function buildBookingResources_(trolleys) {
  var groups = {};
  var order = [];

  for (var i = 0; i < trolleys.length; i++) {
    var trolley = trolleys[i];
    var key = trolley.group;

    if (!groups[key]) {
      groups[key] = {
        resource: trolley.group,
        deviceType: trolley.deviceType,
        capacity: 0,
        stylusOption: false,
        headphoneOption: false,
        sortOrder: i + 1,
        active: true
      };
      order.push(key);
    }

    var group = groups[key];

    if (group.deviceType !== trolley.deviceType) {
      throw new Error(
        'Cart ' + trolley.group + ' has inconsistent device types.'
      );
    }

    group.capacity += trolley.defaultQuantity;
    group.stylusOption = group.stylusOption || trolley.stylusOption;
    group.headphoneOption = group.headphoneOption || trolley.headphoneOption;
  }

  var output = [];
  for (var j = 0; j < order.length; j++) {
    output.push(groups[order[j]]);
  }

  return output;
}

/*
 * timetable sheet
 * Row 1: headers
 * A: Period #
 * B: Start Time
 * C: End Time
 */
function readReferenceTimetable_(spreadsheet, sheetName) {
  var sheet = getReferenceRequiredSheet_(spreadsheet, sheetName);
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  var rows = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
  var output = [];

  for (var i = 0; i < rows.length; i++) {
    var code = String(rows[i][0] || '').trim();
    var startTime = referenceNormaliseTime_(rows[i][1]);
    var endTime = referenceNormaliseTime_(rows[i][2]);

    if (!code && !startTime && !endTime) {
      continue;
    }

    if (!code || !startTime || !endTime) {
      throw new Error(
        'Incomplete timetable row at ' + sheetName + ' row ' + (i + 2) + '.'
      );
    }

    output.push({
      code: code,
      start: startTime,
      end: endTime,
      sortOrder: output.length,
      active: true
    });
  }

  return output;
}

function validateReferenceData_(data) {
  if (!data.teachers.length) {
    throw new Error('Reference list is empty: teachers');
  }
  if (!data.classes.length) {
    throw new Error('Reference list is empty: classes');
  }
  if (!data.subjects.length) {
    throw new Error('Reference list is empty: subjects');
  }
  if (!data.trolleys.length) {
    throw new Error('Reference list is empty: trolleys');
  }
  if (!data.bookingResources.length) {
    throw new Error('No booking resources could be derived from trolleys.');
  }
  if (!data.periods.length) {
    throw new Error('Reference list is empty: timetable');
  }

  referenceCheckDuplicates_(data.teachers, 'teacher');
  referenceCheckDuplicates_(data.classes, 'classes');
  referenceCheckDuplicates_(data.subjects, 'subjects');

  var trolleyNames = [];
  for (var i = 0; i < data.trolleys.length; i++) {
    trolleyNames.push(data.trolleys[i].name);
  }
  referenceCheckDuplicates_(trolleyNames, 'trolleys');

  var periodCodes = [];
  for (var j = 0; j < data.periods.length; j++) {
    periodCodes.push(data.periods[j].code);
  }
  referenceCheckDuplicates_(periodCodes, 'timetable period numbers');
}

function referenceCheckDuplicates_(values, label) {
  var seen = {};
  var duplicates = [];

  for (var i = 0; i < values.length; i++) {
    var key = String(values[i]).trim().toLowerCase();
    if (seen[key] && duplicates.indexOf(values[i]) === -1) {
      duplicates.push(values[i]);
    }
    seen[key] = true;
  }

  if (duplicates.length) {
    throw new Error(
      'Duplicate values found in ' + label + ': ' + duplicates.join(', ')
    );
  }
}

function referenceToBoolean_(value) {
  if (value === true) {
    return true;
  }

  var text = String(value || '').trim().toLowerCase();
  return text === 'true' || text === 'yes' || text === 'y' || text === '1';
}

function referenceNormaliseTime_(value) {
  var text = String(value || '').trim();
  var match = text.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return text;
  }

  var hour = Number(match[1]);
  var minute = match[2];
  var hourText = hour < 10 ? '0' + hour : String(hour);
  return hourText + ':' + minute;
}

function getReferenceRequiredSheet_(spreadsheet, sheetName) {
  return getRequiredSheet_(spreadsheet, sheetName);
}

function clearReferenceCache() {
  delete executionContext_().referenceData;
  CacheService.getScriptCache().remove(LORD_REFERENCE_CONFIG.CACHE_KEY);
}

function selfTestLORDV13() { return selfTestLORDV12(); }

function testReferenceData() {
  Logger.log(JSON.stringify(getReferenceData_(), null, 2));
}

function referenceErrorMessage_(error) {
  if (error && error.message) {
    return error.message;
  }
  return String(error);
}

function referenceJsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}



/* =========================
 * V1 SETUP / DIAGNOSTICS
 * ========================= */

function telegramConfigured_() {
  return Boolean(
    normaliseText_(OVERLORD_CONFIG.TELEGRAM_BOT_TOKEN) &&
    normaliseText_(OVERLORD_CONFIG.TELEGRAM_CHAT_ID)
  );
}

function installLORDV1Triggers() {
  var handlers = {
    checkAndSendOverdueTelegramAlerts: { minutes: OVERLORD_CONFIG.TELEGRAM_CHECK_MINUTES },
    processSecondaryQueueTrigger: { minutes: 1 }
  };
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    var handler = existing[i].getHandlerFunction();
    if (handlers[handler]) ScriptApp.deleteTrigger(existing[i]);
  }

  ScriptApp.newTrigger('checkAndSendOverdueTelegramAlerts')
    .timeBased()
    .everyMinutes(OVERLORD_CONFIG.TELEGRAM_CHECK_MINUTES)
    .create();

  ScriptApp.newTrigger('processSecondaryQueueTrigger')
    .timeBased()
    .everyMinutes(1)
    .create();

  CacheService.getScriptCache().remove(OVERLORD_CONFIG.TRIGGER_STATUS_CACHE_KEY);
  return inspectLORDV1Configuration();
}

function processSecondaryQueueTrigger() {
  resetExecutionContext_();
  processSecondaryQueue_(20);
}

var LORD_PROPERTY_POLICY = Object.freeze({
  CURRENT_EXACT: Object.freeze([
    OVERLORD_CONFIG.TELEGRAM_NOTIFIED_PROPERTY,
    OVERLORD_CONFIG.FORCE_RETURN_SWEEP_DATE_PROPERTY,
    OVERLORD_CONFIG.FORCE_RETURN_PENDING_ALERT_PROPERTY,
    OVERLORD_CONFIG.MONITOR_BUCKET_PROPERTY,
    OVERLORD_CONFIG.PENDING_ALERT_EVENTS_PROPERTY,
    'LORD_V14_MAINTENANCE_WARNING'
  ]),
  CURRENT_PREFIXES: Object.freeze([
    LORD_IDEMPOTENCY.PREFIX,
    LORD_SECONDARY.PREFIX
  ]),
  LEGACY_EXACT: Object.freeze([
    'LORD_PROXY_SECRET',
    'BOOKING_TOKEN_PEPPER',
    'BOOKING_CODE_PEPPER',
    'LORD_IDEMPOTENCY_RC25',
    'OVERLORD_BOOKING_END_ALERTED_V01',
    'OVERLORD_FORCE_RETURN_SWEEP_DATE_V26',
    'OVERLORD_FORCE_RETURN_PENDING_ALERT_V26',
    'OVERLORD_MONITOR_BUCKET_RC28',
    'OVERLORD_PENDING_ALERT_EVENTS_RC28',
    'OVERLORD_TELEGRAM_NOTIFIED_V2',
    'STARLORD_REFERENCE_SPREADSHEET_ID',
    'STARLORD_SHARED_SECRET'
  ]),
  LEGACY_PREFIXES: Object.freeze([
    'LORD_IDEMPOTENCY_RC29_',
    'LORD_SECONDARY_RC29_'
  ])
});

function isCurrentLORDRuntimeProperty_(key) {
  if (LORD_PROPERTY_POLICY.CURRENT_EXACT.indexOf(key) >= 0) return true;
  for (var i = 0; i < LORD_PROPERTY_POLICY.CURRENT_PREFIXES.length; i++) {
    if (key.indexOf(LORD_PROPERTY_POLICY.CURRENT_PREFIXES[i]) === 0) return true;
  }
  return false;
}

function isLegacyLORDProperty_(key) {
  if (LORD_PROPERTY_POLICY.LEGACY_EXACT.indexOf(key) >= 0) return true;
  for (var i = 0; i < LORD_PROPERTY_POLICY.LEGACY_PREFIXES.length; i++) {
    if (key.indexOf(LORD_PROPERTY_POLICY.LEGACY_PREFIXES[i]) === 0) return true;
  }
  return false;
}

/**
 * One-time v1 cutover cleanup.
 *
 * Run ONLY after LORD, OVERLORD and STARLORD have all been moved to the v1
 * backend/Workers. It deletes only specifically-known RC2.x/stale LORD keys;
 * it preserves every current LORD runtime property and any unrecognised property.
 * Values are never logged.
 */
function cleanLegacyScriptPropertiesV1() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var deleted = [];
  var preservedRuntime = [];
  var unknown = [];

  Object.keys(all).sort().forEach(function(key) {
    if (isCurrentLORDRuntimeProperty_(key)) {
      preservedRuntime.push(key);
      return;
    }
    if (isLegacyLORDProperty_(key)) {
      props.deleteProperty(key);
      deleted.push(key);
      return;
    }
    unknown.push(key);
  });

  var result = {
    deletedLegacyKeys: deleted,
    preservedCurrentRuntimeKeys: preservedRuntime,
    unrecognisedKeysLeftUntouched: unknown
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/** Diagnostic that reports PROPERTY NAMES ONLY; it never exposes values. */
function inspectLORDV1ScriptProperties() {
  var keys = Object.keys(PropertiesService.getScriptProperties().getProperties()).sort();
  var current = [];
  var legacy = [];
  var unknown = [];
  keys.forEach(function(key) {
    if (isCurrentLORDRuntimeProperty_(key)) current.push(key);
    else if (isLegacyLORDProperty_(key)) legacy.push(key);
    else unknown.push(key);
  });
  var result = {
    configurationPropertiesRequired: false,
    currentRuntimeKeys: current,
    legacyKeysSafeToDeleteAfterCutover: legacy,
    unrecognisedKeys: unknown
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function inspectLORDV1Configuration() {
  resetExecutionContext_();
  var triggerHandlers = ScriptApp.getProjectTriggers().map(function(t) {
    return t.getHandlerFunction();
  });

  var result = {
    version: LORD_CONFIG.VERSION,
    architecture: 'one Code.gs / one Apps Script web app / two Google Sheets',
    transactionSpreadsheet: getTransactionSpreadsheet_().getName(),
    referenceSpreadsheet: getReferenceSpreadsheet_().getName(),
    sessionSchemaOk: assertSessionSchema_(getTransactionSpreadsheet_()),
    staticConfiguration: {
      embeddedInCodeGs: true,
      scriptPropertiesRequired: false,
      proxySecretEmbedded: Boolean(normaliseText_(LORD_CONFIG.PROXY_SECRET)),
      bookingPeppersEmbedded: Boolean(normaliseText_(LORD_CONFIG.BOOKING_TOKEN_PEPPER)) && Boolean(normaliseText_(LORD_CONFIG.BOOKING_CODE_PEPPER)),
      telegramEmbedded: telegramConfigured_()
    },
    scriptProperties: inspectLORDV1ScriptProperties(),
    triggers: {
      overdueMonitor: triggerHandlers.indexOf('checkAndSendOverdueTelegramAlerts') >= 0,
      secondaryQueue: triggerHandlers.indexOf('processSecondaryQueueTrigger') >= 0
    }
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function selfTestLORDV1() {
  var results = [];
  function test(name, fn) {
    try {
      var value = fn();
      results.push({ name: name, ok: true, detail: value === undefined ? '' : value });
    } catch (error) {
      results.push({ name: name, ok: false, error: getErrorMessage_(error) });
    }
  }

  resetExecutionContext_();
  test('Sheets API v4 available for atomic cell updates', function(){
    requireSurgicalSheets_();
    var meta = Sheets.Spreadsheets.get(LORD_CONFIG.SPREADSHEET_ID, { fields: 'spreadsheetId,properties(timeZone)' });
    if (meta.properties.timeZone !== LORD_CONFIG.TIME_ZONE) throw new Error('Transaction workbook timezone must be ' + LORD_CONFIG.TIME_ZONE);
    return 'Sheets API read access verified; no data changed';
  });
  test('transaction spreadsheet accessible', function(){ return getTransactionSpreadsheet_().getName(); });
  test('reference spreadsheet accessible', function(){ return getReferenceSpreadsheet_().getName(); });
  test('static proxy secret embedded', function(){ if (!normaliseText_(LORD_CONFIG.PROXY_SECRET)) throw new Error('Missing embedded proxy secret'); return 'embedded'; });
  test('legacy booking peppers embedded', function(){ if (!normaliseText_(LORD_CONFIG.BOOKING_TOKEN_PEPPER) || !normaliseText_(LORD_CONFIG.BOOKING_CODE_PEPPER)) throw new Error('Missing embedded booking peppers'); return 'embedded'; });
  test('Telegram configuration embedded', function(){ if (!telegramConfigured_()) throw new Error('Missing embedded Telegram configuration'); return 'embedded'; });
  test('session schema exact', function(){ return assertSessionSchema_(getTransactionSpreadsheet_()); });
  test('reference data valid', function(){
    var data = getReferenceData_();
    return { teachers: data.teachers.length, resources: data.bookingResources.length, periods: data.periods.length };
  });
  test('required Sheet tabs present', function(){
    var ss = getTransactionSpreadsheet_();
    var names = [LORD_CONFIG.SHEETS.BOOKINGS, LORD_CONFIG.SHEETS.SESSIONS, LORD_CONFIG.SHEETS.TROLLEYS, LORD_CONFIG.SHEETS.EVENTS, LORD_CONFIG.SHEETS.CONTACTS, LORD_CONFIG.SHEETS.ADMINS];
    for (var i = 0; i < names.length; i++) getRequiredSheet_(ss, names[i]);
    return names;
  });
  test('configuration inspection', function(){ return inspectLORDV1Configuration(); });

  var failed = results.filter(function(r){ return !r.ok; }).length;
  var output = { version: LORD_CONFIG.VERSION, passed: results.length - failed, failed: failed, total: results.length, tests: results };
  Logger.log(JSON.stringify(output, null, 2));
  return output;
}


/* =========================
 * PRE-v1 ADMIN NAME COMPATIBILITY
 * =========================
 * These wrappers keep any old maintainer notes/bookmarks working while the
 * formal public/admin names are v1. They do not create a second code path.
 */
function migrateLORDWorkbookV3() { return migrateLORDWorkbookV1(); }
function setupLORDV3Workbook() { return setupLORDV1Workbook(); }
function installLORDV3Triggers() { return installLORDV1Triggers(); }
function cleanLegacyScriptPropertiesV3() { return cleanLegacyScriptPropertiesV1(); }
function inspectLORDV3ScriptProperties() { return inspectLORDV1ScriptProperties(); }
function inspectLORDV3Configuration() { return inspectLORDV1Configuration(); }
function selfTestLORDV3() { return selfTestLORDV1(); }

// LTS entry points; older v1/v3 maintenance names remain compatible.
function selfTestLORDV12() { return selfTestLORDV1(); }
function inspectLORDV12Configuration() { return inspectLORDV1Configuration(); }

function selfTestLORDV14() { return selfTestLORDV1(); }

// v1.5 release entry points. Existing maintenance names remain supported.
function selfTestLORDV15() { return selfTestLORDV1(); }
function inspectLORDV15Configuration() { return inspectLORDV1Configuration(); }

// v1.6 entry points; existing saved maintenance selections remain valid.
function selfTestLORDV16() { return selfTestLORDV1(); }
function inspectLORDV16Configuration() { return inspectLORDV1Configuration(); }
