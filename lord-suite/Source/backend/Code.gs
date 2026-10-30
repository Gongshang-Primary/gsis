/**
 * LORD component patch v0.9.8d. One Code.gs, one Apps Script web app,
 * two workbooks and two Drive folders. Existing schema and API actions retained.
 *
 * EXISTING INSTALLATION: back up Code.gs, preserve every ID/secret/pepper in
 * Apps Script > Project Settings > Script Properties,
 * enable Advanced Drive v3 alongside Sheets v4, replace code, run
 * selfTestLORDV17() and inspectLORDPhotoUploadReadiness(), then publish the EXISTING
 * deployment. Keep its /exec URL and the current triggers. See UPGRADE.md.
 * Do not run setup, schema migration, REIGN or property cleanup for an upgrade.
 *
 * FIRST INSTALLATION: use the clean First_Time_Setup instructions.
 * Create two workbooks and two folders, set Script Properties, then run
 * createLORDV17Schema(). It creates empty tabs and headers, never sample records.
 * Populate reference lists, contacts and admins before selfTestLORDV17().
 * Install triggers once using installLORDV1Triggers(). See FIRST_TIME_SETUP.md.
 *
 * CONFIGURATION: IDs, proxy credentials, booking peppers and Telegram settings
 * are Script Properties. This source never embeds their values. Preserve runtime
 * receipts, deferred jobs and stable LORD_V3_* and LORD_V14_* keys across upgrades.
 * Copy existing booking peppers exactly; do not rotate or regenerate them.
 *
 * CONCURRENCY: one ScriptLock serializes authoritative shared Sheet writes.
 * Drive evidence uploads happen outside that lock; state is rechecked inside it.
 * A Sheets batch is atomic within its target workbook. Drive uploads, Properties
 * receipts and email delivery are separate operations with recovery limits.
 * Do not automatically repeat a write with a new clientRequestId after a timeout.
 *
 * SAFETY: runtime schema checks never repair headers. Setup refuses mismatches.
 * REIGN archives before compaction and blocks unresolved physical custody.
 * The 18:00 administrative close does not prove equipment was physically returned.
 * GSiS Suite v0.9.7 unifies release labels; device and provider acceptance remain operational checks.
 */
var LORD_CONFIG = Object.freeze({
  VERSION: '0.9.9',
  RELEASE_CHANNEL: 'GSiS Suite',

  // ---- Deployment identity / storage from Script Properties ----
  // Transaction workbook (this Apps Script project may be bound here, but
  // runtime code still opens it explicitly by ID for deterministic triggers).
  get SPREADSHEET_ID() { return lordSetting_('LORD_SPREADSHEET_ID'); },
  // Inventory / Reference workbook.
  get REFERENCE_SPREADSHEET_ID() { return lordSetting_('LORD_REFERENCE_SPREADSHEET_ID'); },
  // Evidence and archival storage.
  get PHOTO_FOLDER_ID() { return lordSetting_('LORD_PHOTO_FOLDER_ID'); },
  get REIGN_ARCHIVE_FOLDER_ID() { return lordSetting_('LORD_REIGN_ARCHIVE_FOLDER_ID'); },

  // ---- Backend credentials from Script Properties ----
  // Must match GSIS_SECRET, or the existing LORD_PROXY_SECRET, in all three Pages projects.
  get PROXY_SECRET() { return lordGSiSSecret_('LORD_PROXY_SECRET'); },
  // Legacy-compatible booking peppers retained verbatim so historical booking
  // edit token/code hashes remain valid across the formal v1 cutover.
  get BOOKING_TOKEN_PEPPER() { return lordSetting_('LORD_BOOKING_TOKEN_PEPPER'); },
  get BOOKING_CODE_PEPPER() { return lordSetting_('LORD_BOOKING_CODE_PEPPER'); },

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
  get REFERENCE_SPREADSHEET_ID() { return LORD_CONFIG.REFERENCE_SPREADSHEET_ID; },
  TIME_ZONE: LORD_CONFIG.TIME_ZONE
});

var OVERLORD_CONFIG = Object.freeze({
  GRACE_MINUTES: 30,
  TELEGRAM_CHECK_MINUTES: 5,
  get TELEGRAM_BOT_TOKEN() { return lordSetting_('LORD_TELEGRAM_BOT_TOKEN', true); },
  get TELEGRAM_CHAT_ID() { return lordSetting_('LORD_TELEGRAM_CHAT_ID', true); },
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
  get SPREADSHEET_ID() { return LORD_CONFIG.REFERENCE_SPREADSHEET_ID; },
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
  get ARCHIVE_FOLDER_ID() { return LORD_CONFIG.REIGN_ARCHIVE_FOLDER_ID; },
  ARCHIVE_PREFIX: 'LORD',
  TRANSACTION_SHEETS: Object.freeze([
    'Bookings',
    'Sessions',
    'Session Trolleys',
    'Event Log'
  ])
});

var LORD_CONFIGURATION_PROPERTIES = Object.freeze([
  'LORD_SPREADSHEET_ID', 'LORD_REFERENCE_SPREADSHEET_ID', 'LORD_PHOTO_FOLDER_ID',
  'LORD_REIGN_ARCHIVE_FOLDER_ID', 'LORD_PROXY_SECRET', 'LORD_BOOKING_TOKEN_PEPPER',
  'LORD_BOOKING_CODE_PEPPER', 'LORD_TELEGRAM_BOT_TOKEN', 'LORD_TELEGRAM_CHAT_ID'
]);

// Only requested settings are read, once per execution. Preserve secret bytes
// exactly: trimming a legacy pepper would invalidate existing booking hashes.
function lordSetting_(key, optional) {
  var ctx = executionContext_();
  if (!ctx.configuration) ctx.configuration = {};
  if (!Object.prototype.hasOwnProperty.call(ctx.configuration, key)) {
    try { ctx.configuration[key] = PropertiesService.getScriptProperties().getProperty(key) || ''; }
    catch (error) { throw new Error('Could not read LORD Script Properties. Check project access and settings.'); }
  }
  var value = String(ctx.configuration[key]);
  if (!value.trim() || /^REPLACE_/.test(value.trim())) {
    if (optional) return '';
    throw new Error('Set ' + key + ' in LORD Apps Script > Project Settings > Script Properties.');
  }
  return value;
}

// One shared first-party API key, read lazily once per execution. A configured
// malformed key must not silently fall back to an older service credential.
function lordGSiSSecret_(legacyKey, optional) {
  var ctx = executionContext_();
  if (!Object.prototype.hasOwnProperty.call(ctx, 'gsisSecret')) {
    try { ctx.gsisSecret = PropertiesService.getScriptProperties().getProperty('GSIS_SECRET'); }
    catch (error) { throw new Error('Could not read LORD Script Properties. Check project access and settings.'); }
  }
  var shared = ctx.gsisSecret;
  if (shared !== null && shared !== undefined) {
    if (typeof shared !== 'string' || !/^[\x21-\x7e]{32,8000}$/.test(shared)) {
      var invalid = new Error('GSIS_SECRET must contain 32 to 8000 printable ASCII characters without spaces.');
      invalid.code = 'GSIS_SECRET_INVALID'; invalid.status = 503; throw invalid;
    }
    return shared;
  }
  return lordSetting_(legacyKey, optional);
}

function lordConfigurationStatus_() {
  var missing = LORD_CONFIGURATION_PROPERTIES.filter(function(key) { return !(key === 'LORD_PROXY_SECRET' ? lordGSiSSecret_(key, true) : lordSetting_(key, true)); });
  var required = missing.filter(function(key) { return key.indexOf('LORD_TELEGRAM_') !== 0; });
  return { source: 'Script Properties', ready: required.length === 0,
    missingRequired: required, missingOptional: missing.filter(function(key) { return key.indexOf('LORD_TELEGRAM_') === 0; }) };
}

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
    lockWaitMs: 0, lockHeldMs: 0, commitMs: 0, referenceCache: 'unused',
    referenceMs: 0, scheduleReadMs: 0, bookingReadMs: 0, queueMs: 0
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
      commitMs: metrics.commitMs, referenceCache: metrics.referenceCache,
      referenceMs: metrics.referenceMs, scheduleReadMs: metrics.scheduleReadMs,
      bookingReadMs: metrics.bookingReadMs, queueMs: metrics.queueMs
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
    throw new Error('LORD setup: add Google Sheets API v4 (identifier Sheets) under Apps Script Services, then run selfTestLORDV13().');
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
  prepareRequestReceipt_();
  measureBackendPhase_('commitMs', function() {
    executionContext_().commitAttempted = true;
    // Finish any preceding built-in append before mixing service paths.
    SpreadsheetApp.flush();
    Sheets.Spreadsheets.batchUpdate({ requests: compacted, includeSpreadsheetInResponse: false }, LORD_CONFIG.SPREADSHEET_ID);
    delete executionContext_().v18EventRows;
    delete executionContext_().teacherConsents;
    try { CacheService.getScriptCache().remove('LORD_V18_COMPLIANCE_SUMMARY'); } catch (ignore) {}
  });
  return { requests: compacted.length, cells: cells };
}

function writeChangedRow_(sheet, rowNumber, before, after) {
  var requests = [];
  queueChangedRow_(requests, sheet, rowNumber, before, after);
  return commitSurgicalUpdates_(requests);
}


// Reuse the same Lock object so nested property helpers can test ownership.
function scriptWriteLock_() {
  var ctx = executionContext_();
  return ctx.scriptLock || (ctx.scriptLock = LockService.getScriptLock());
}

function withRuntimePropertyLock_(fn) {
  var lock = scriptWriteLock_();
  if (lock.hasLock()) return fn(false);
  lock.waitLock(3000);
  try { return fn(true); }
  finally { lock.releaseLock(); }
}

function withWriteLock_(fn, timeoutMs) {
  var lock = scriptWriteLock_();
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
        service: 'LORD Suite Backend v0.9.9',
        version: LORD_CONFIG.VERSION,
        releaseChannel: LORD_CONFIG.RELEASE_CHANNEL,
        timestamp: new Date().toISOString()
      });
    }

    requireProxySecret_(parameters.proxySecret);

    if (action === 'bookingactioncontext') return jsonResponse_({ ok: true, data: bookingActionContext_(parameters) });
    if (action === 'notificationpreferences') return jsonResponse_({ ok: true, data: notificationPreferences_(parameters) });
    if (action === 'complianceincidents') { requireLiveAdmin_(parameters); return jsonResponse_({ ok: true, data: parameters.summary === '1' ? complianceSummary_() : complianceIncidents_() }); }
    if (action === 'backgroundwork') return jsonResponse_({ok:true,data:listBackgroundWork_(parameters)});
    if (action === 'adminsettings') return jsonResponse_({ ok: true, data: getAdminSettings_(parameters) });

    // A forced read skips data caches only. Authentication, idempotency and
    // transaction records are never cleared by a viewport reload.
    var reloading = parameters.forceRefresh === '1' &&
      ['reference', 'dashboard', 'starlordboard'].indexOf(action) !== -1;
    if (reloading) requireLiveAdmin_(parameters);
    executionContext_().forceRefresh = reloading;

    if (action === 'reference') {
      var referenceResult = {
        ok: true,
        generatedAt: new Date().toISOString(),
        cacheReloaded: reloading,
        data: measureBackendPhase_('referenceMs', getReferenceData_)
      };
      // The authenticated LORD Worker supplies this only for a staff booking
      // screen. Read the selected day's schedule in the same execution.
      var bookingDate = String(parameters.bookingDate || (reloading && parameters.reloadDate) || '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
        referenceResult.date = bookingDate;
        referenceResult.daySchedule = measureBackendPhase_('scheduleReadMs', function() { return bookingDaySchedule_({ date: bookingDate }); });
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
    if (action === 'bookingdayschedule') return jsonResponse_({ ok: true, bookings: measureBackendPhase_('scheduleReadMs', function() { return bookingDaySchedule_(parameters); }) });
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

    if (action === 'backgroundpreview' || action === 'backgroundapply') return jsonResponse_({ok:true,result:backgroundCommand_(request,action === 'backgroundapply')});
    if (action === 'backgroundack') return jsonResponse_({ok:true,result:acknowledgeBackgroundWarning_(request)});

    // Privileged commands authenticate before any receipt lookup, and again under lock.
    if (action === 'admingrant' || action === 'suiterefresh') {
      requireLiveAdmin_(request);
      if (action === 'suiterefresh' && gsisEnabled_()) {
        syncLORDGSiSReferences_();
        requireLiveAdmin_(request);
        executionContext_().forceRefresh = true;
        return jsonResponse_({ok:true,result:{reference:getReferenceData_(),refreshedAt:new Date().toISOString(),propagationSeconds:120}});
      }
      return jsonResponse_({ ok: true, result: withWriteLock_(function() {
        requireLiveAdmin_(request);
        return action === 'admingrant' ? grantAdmin_(request) : refreshSuiteData_(request);
      }) });
    }

    if (['bookingrespond','notificationpreferences','incidentresolve'].indexOf(action) !== -1) {
      requireSurgicalSheets_();
      prepareHistoricalAction_(action, request);
      return jsonResponse_({ ok: true, result: withWriteLock_(function() {
        delete executionContext_().v18EventRows;
        delete executionContext_().teacherConsents;
        if (executionContext_().preparedPeriodId && currentCompliancePeriod_().id !== executionContext_().preparedPeriodId) throw new Error('The REIGN period changed while preparing this response. Retry to refresh the archived records.');
        executionContext_().historicalCommit = true;
        if (action === 'bookingrespond') return respondToBooking_(request);
        if (action === 'incidentresolve') return resolveComplianceIncident_(request);
        return saveNotificationPreferences_(request);
      }) });
    }

    var requestId = normaliseText_(request.clientRequestId);
    if (action === 'loan' || action === 'return') prepareEvidenceRequest_(request, requestId);
    executionContext_().receiptRequestId = requestId;
    executionContext_().receiptNeedsIntent = ['bookingupdate', 'bookingcancel', 'reignclose'].indexOf(action) !== -1;
    var prior = requestId ? getIdempotentResult_(requestId) : null;
    if (prior) {
      if (action === 'loan' || action === 'return') requireCommittedEvidence_(prior.sessionId);
      return jsonResponse_({ ok: true, result: prior, replayed: true });
    }

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
    var retrySame = Boolean(executionContext_().commitAttempted || executionContext_().evidenceManifest);
    return jsonResponse_({ ok: false, error: getErrorMessage_(error), code: retrySame ? 'UNKNOWN_OUTCOME' : error.code || 'SUBMISSION_REJECTED', retryable: retrySame });
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
  return setupLORDV1Workbook();
}

var LORD_IDEMPOTENCY = Object.freeze({
  PREFIX: 'LORD_V3_IDEMPOTENCY_',
  MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  // Receipt retention is time/byte based; live receipts are never count-evicted.
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

function validCompletedReceipt_(item) {
  return Boolean(item && typeof item === 'object' && !Array.isArray(item) && !item.pending && typeof item.timestamp === 'number' && isFinite(item.timestamp) && Number(item.timestamp) > 0 && item.result && typeof item.result === 'object');
}

function getIdempotentResult_(requestId) {
  try {
    var props = PropertiesService.getScriptProperties();
    var key = idempotencyPropertyKey_(requestId);
    var raw = props.getProperty(key);
    if (raw !== null && raw !== undefined) {
      var item = JSON.parse(raw);
      if (item && item.pending) {
        var uncertain = new Error('This request needs administrator reconciliation before it can be retried. Its earlier outcome is uncertain.');
        uncertain.code = 'RECONCILIATION_REQUIRED';
        throw uncertain;
      }
      if (!validCompletedReceipt_(item)) throw new Error('Invalid request receipt.');
      if (Date.now() - Number(item.timestamp) > LORD_IDEMPOTENCY.MAX_AGE_MS) {
        return null; // Expiry cleanup belongs to the locked writer/pruner.
      }
      var binding = executionContext_().evidenceRequest;
      if (item.evidenceBinding && (!binding || item.evidenceBinding.key !== binding.key || item.evidenceBinding.actor !== binding.actor || item.evidenceBinding.command !== binding.command)) throw new Error('Photo receipt belongs to a different submission.');
      var result = Object.prototype.hasOwnProperty.call(item, 'result') ? item.result : null;
      var metrics = executionContext_().requestMetrics;
      if (result && metrics) metrics.replayed = true;
      return result;
    }

    return null;
  } catch (error) {
    if (error.code === 'RECONCILIATION_REQUIRED') throw error;
    var unreadable = new Error('The earlier request receipt could not be read. Ask an administrator to reconcile it before retrying.');
    unreadable.code = 'RECONCILIATION_REQUIRED';
    throw unreadable;
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

var LORD_RUNTIME_STORAGE = Object.freeze({
  VALUE_BYTES: 8000,
  NEW_TASK_BYTES: 7000, // Reserve 1 KB in each record for claims/checkpoints.
  WARNING_BYTES: 350000,
  ADMISSION_BYTES: 400000,
  RECOVERY_BYTES: 480000,
  PRUNE_BATCH: 50,
  SCAN_BATCH: 2048
});

function runtimePropertyBytes_(all) {
  return Object.keys(all).reduce(function(total, key) { return total + utf8Bytes_(key) + utf8Bytes_(all[key]); }, 0);
}

function pruneRuntimeProperties_(props, all, now) {
  // The caller owns the ScriptLock. One bounded scan/deletion batch per execution.
  var ctx = executionContext_();
  if (ctx.propertyPruning) return ctx.propertyPruning;
  var result = ctx.propertyPruning = { scanned: 0, deleted: 0, failed: 0 };
  var keys = Object.keys(all), limit = Math.min(keys.length, LORD_RUNTIME_STORAGE.SCAN_BATCH);
  // Rotate large stores across minute runs without creating another property.
  var start = keys.length > limit ? (Math.floor(now / 60000) * limit) % keys.length : 0;
  for (var i = 0; i < limit && result.deleted < LORD_RUNTIME_STORAGE.PRUNE_BATCH; i++) {
    var key = keys[(start + i) % keys.length], raw = all[key], item, expired = false;
    result.scanned++;
    try { item = JSON.parse(raw); } catch (ignore) { continue; }
    if (!item || typeof item !== 'object') continue;
    if (key.indexOf(LORD_IDEMPOTENCY.PREFIX) === 0) {
      expired = validCompletedReceipt_(item) && now - Number(item.timestamp) > LORD_IDEMPOTENCY.MAX_AGE_MS;
    } else if (key.indexOf(LORD_SECONDARY.PREFIX) === 0) {
      expired = validSecondaryTask_(item) && !(item.management || []).some(function(c) { return !c.audited; }) && !item.uncertain && !(item.payload && item.payload.deliveryPending) && !(Number(item.leaseUntil) > now) && Number(item.completedAt) > 0 && now - Number(item.completedAt) > LORD_SECONDARY.MAX_AGE_MS;
    } else if (key === 'LORD_GSIS_SYNC_LEASE') {
      expired = Number(item.expiresAt) > 0 && Number(item.expiresAt) < now;
    }
    if (!expired) continue;
    try {
      props.deleteProperty(key);
      delete all[key]; result.deleted++;
    } catch (ignoreDelete) { result.failed++; break; }
  }
  return result;
}

function assertRuntimePropertyCapacity_(props, key, value, recovery) {
  return withRuntimePropertyLock_(function() {
    var all = props.getProperties();
    pruneRuntimeProperties_(props, all, Date.now());
    return checkedRuntimePropertyBytes_(all, key, String(value), recovery);
  });
}

function checkedRuntimePropertyBytes_(all, key, value, recovery) {
  var valueLimit = key.indexOf(LORD_SECONDARY.PREFIX) === 0 && !Object.prototype.hasOwnProperty.call(all,key) ? LORD_RUNTIME_STORAGE.NEW_TASK_BYTES : LORD_RUNTIME_STORAGE.VALUE_BYTES;
  if (utf8Bytes_(value) > valueLimit) throw new Error('Background record exceeds its storage limit.');
  var before = runtimePropertyBytes_(all);
  var bytes = before - (Object.prototype.hasOwnProperty.call(all, key) ? utf8Bytes_(key) + utf8Bytes_(all[key]) : 0) + utf8Bytes_(key) + utf8Bytes_(value);
  var settling = recovery || (key.indexOf(LORD_SECONDARY.PREFIX) === 0 && Object.prototype.hasOwnProperty.call(all, key));
  var limit = settling ? LORD_RUNTIME_STORAGE.RECOVERY_BYTES : LORD_RUNTIME_STORAGE.ADMISSION_BYTES;
  if (!settling && executionContext_().receiptPrepared) limit -= LORD_RUNTIME_STORAGE.VALUE_BYTES;
  if (bytes > limit && !(settling && bytes <= before)) throw new Error('Background storage is near capacity. Administrator attention is required.');
  return bytes;
}

function setBoundedRuntimeProperty_(props, key, value, snapshot, recovery) {
  value = String(value);
  if (utf8Bytes_(value) > LORD_RUNTIME_STORAGE.VALUE_BYTES) throw new Error('Background record exceeds its storage limit.');
  return withRuntimePropertyLock_(function(acquired) {
    // A snapshot obtained before acquiring the lock must never drive deletion.
    var all = !acquired && snapshot ? snapshot : props.getProperties();
    pruneRuntimeProperties_(props, all, Date.now());
    // New background work cannot spend the current mutation's receipt allowance.
    var bytes = checkedRuntimePropertyBytes_(all, key, value, recovery);
    props.setProperty(key, value); all[key] = value;
    if (bytes >= LORD_RUNTIME_STORAGE.WARNING_BYTES && key !== 'LORD_V14_MAINTENANCE_WARNING' && !executionContext_().propertyPressureWarned) {
      executionContext_().propertyPressureWarned = true;
      try {
        noteMaintenanceFailure_('storage_pressure', new Error('Background storage is near capacity.'), all);
      } catch (ignoreWarning) {}
      Logger.log(JSON.stringify({check:'LORD_PROPERTY_CAPACITY',estimatedPropertyBytes:bytes,admissionLimit:LORD_RUNTIME_STORAGE.ADMISSION_BYTES}));
    }
  });
}

function prepareRequestReceipt_() {
  var ctx = executionContext_();
  if (!ctx.receiptRequestId || ctx.receiptPrepared) return;
  var props = PropertiesService.getScriptProperties(), all = props.getProperties();
  pruneRuntimeProperties_(props, all, Date.now());
  var key = idempotencyPropertyKey_(ctx.receiptRequestId);
  if (runtimePropertyBytes_(all) + utf8Bytes_(key) + LORD_RUNTIME_STORAGE.VALUE_BYTES > LORD_RUNTIME_STORAGE.ADMISSION_BYTES) {
    throw new Error('Background storage is near capacity. No new changes were saved. Ask an administrator to review background work.');
  }
  // Nonrecoverable edits must never be repeated after a lost success receipt.
  // An interrupted commit retains this intent until administrator reconciliation.
  if (ctx.receiptNeedsIntent) setBoundedRuntimeProperty_(props, key, JSON.stringify({timestamp:Date.now(),pending:true}), all);
  ctx.receiptPrepared = true;
}

function noteMaintenanceFailure_(kind, error, snapshot, task) {
  var ctx = executionContext_();
  var warnings = ctx.maintenanceWarnings || (ctx.maintenanceWarnings = []);
  var message = 'The main record was saved, but a background task needs administrator attention.';
  if (warnings.indexOf(message) === -1) warnings.push(message);
  try { Logger.log('LORD_MAINTENANCE_FAILURE ' + String(kind) + ': ' + getErrorMessage_(error)); } catch (ignoreLog) {}
  // Best effort only: the execution warning remains visible if Properties is full.
  try {
    var record = {at:new Date().toISOString(),kind:String(kind),taskKey:task && task._key || '',taskKind:task && task.kind || '',reason:maintenanceFailureReason_(error)};
    var prior = ctx.maintenanceFailure;
    if (record.taskKey && prior && prior.taskKey === record.taskKey && prior.kind === record.kind && record.reason.code === 'UNCLASSIFIED_FAILURE') record.reason = prior.reason;
    ctx.maintenanceFailure = record;
    withRuntimePropertyLock_(function(acquired) {
      var props = PropertiesService.getScriptProperties(), all = !acquired && snapshot ? snapshot : props.getProperties(), previous;
      try { previous = JSON.parse(all.LORD_V14_MAINTENANCE_WARNING || 'null'); } catch (ignoreParse) { previous = {kind:'other'}; }
      var unresolved = maintenanceUnresolved_(previous);
      retainMaintenanceFailure_(unresolved, record);
      var saved = Object.assign({}, record, {unresolved:unresolved});
      try { setBoundedRuntimeProperty_(props, 'LORD_V14_MAINTENANCE_WARNING', JSON.stringify(saved), all, true); }
      finally { saveSecondaryFailure_(props, task, record); }
    });
  } catch (ignore) {}
  return record;
}

function getLORDMaintenanceWarning_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('LORD_V14_MAINTENANCE_WARNING');
    return raw ? JSON.parse(raw) : null;
  } catch (ignore) { return null; }
}

// A fixed set of buckets cannot grow with queue volume or erase older categories.
var LORD_MAINTENANCE_CATEGORIES = ['queue_booking_email','queue_booking_link','queue_booking_complete','queue_event','whatsapp_queue','whatsapp_expired','teacher_whatsapp','whatsapp_recovery','idempotency','force_return_alert','force_return_checkpoint','booking_cache','diagnostic_checkpoint','legacy_retry','other'];
function retainMaintenanceFailure_(items, record) {
  if (!record || /^(storage_pressure|queue_reconciliation|whatsapp_uncertain)$/.test(record.kind)) return;
  var retry = /^(email_retry|whatsapp_retry|queue_retry|email_checkpoint|whatsapp_checkpoint)$/.test(record.kind);
  if (retry && record.taskKey) return; // The existing task carries its own diagnostic.
  var category = retry ? 'legacy_retry' : LORD_MAINTENANCE_CATEGORIES.indexOf(record.kind) >= 0 ? record.kind : 'other';
  var prior = items[category];
  items[category] = {kind:category,at:record.at || '',firstAt:prior && prior.firstAt || record.at || '',reason:record.reason || {code:'UNCLASSIFIED_FAILURE'},count:Math.min(999999,(prior && Number(prior.count) || 0) + 1)};
}
function maintenanceUnresolved_(record) {
  var items = {};
  if (record && record.kind === 'acknowledged') return items;
  if (record && record.unresolved && typeof record.unresolved === 'object') {
    LORD_MAINTENANCE_CATEGORIES.forEach(function(kind) { if (record.unresolved[kind]) items[kind] = record.unresolved[kind]; });
  } else retainMaintenanceFailure_(items, record);
  return items;
}
function saveSecondaryFailure_(props, task, failure) {
  if (!task || !task._key || !failure) return;
  try {
    var raw = props.getProperty(task._key), current = raw ? JSON.parse(raw) : null;
    if (!current || current.completedAt || task.leaseToken && current.leaseToken && current.leaseToken !== task.leaseToken) return;
    current.lastFailure = {kind:failure.kind,at:failure.at,reason:failure.reason};
    setBoundedRuntimeProperty_(props, task._key, JSON.stringify(current));
  } catch (error) { noteMaintenanceFailure_('diagnostic_checkpoint', error); }
}

// Only fixed categories and numeric provider codes may cross into the dashboard.
function maintenanceFailureReason_(error) {
  var message = getErrorMessage_(error), match = /^WhatsApp request failed \(HTTP (\d{3}), code (\d+)\)\.$/.exec(message);
  if (match) return {code:'WHATSAPP_PROVIDER',http:Number(match[1]),providerCode:Number(match[2])};
  if (/quota|too many times for one day/i.test(message)) return {code:'DAILY_QUOTA'};
  if (/permission|authorization|not authorized/i.test(message)) return {code:'PERMISSION'};
  if (/storage|record exceeds|queue is full/i.test(message)) return {code:'STORAGE'};
  if (/disabled or setup is incomplete/i.test(message)) return {code:'SETUP'};
  return {code:'UNCLASSIFIED_FAILURE'};
}

function getLORDMaintenanceStatus_() {
  var checkedAt = new Date().toISOString(), all;
  try { all = PropertiesService.getScriptProperties().getProperties(); }
  catch (ignore) { return {state:'unavailable',checkedAt:checkedAt,summary:'Background status could not be checked.',action:'Refresh once. If this persists, ask the Apps Script maintainer to check the execution logs.'}; }
  var recorded = null, malformedWarning = false;
  try {
    recorded = all.LORD_V14_MAINTENANCE_WARNING ? JSON.parse(all.LORD_V14_MAINTENANCE_WARNING) : null;
    if (recorded && (typeof recorded !== 'object' || !recorded.kind)) { recorded = null; malformedWarning = true; }
  } catch (ignoreWarning) { malformedWarning = true; }
  var counts = {pendingTasks:0,activeTasks:0,failedTasks:0,manualFailures:0,uncertainTasks:0,uncertainRequests:0,unreadableRecords:0,stalePendingTasks:0,estimatedPropertyBytes:runtimePropertyBytes_(all)};
  var failedTasks = [], unresolved = maintenanceUnresolved_(recorded), now = Date.now();
  Object.keys(all).forEach(function(key) {
    var queued = key.indexOf(LORD_SECONDARY.PREFIX) === 0, receipt = key.indexOf(LORD_IDEMPOTENCY.PREFIX) === 0;
    if (!queued && !receipt) return;
    var item;
    try { item = JSON.parse(all[key]); } catch (ignore) { counts.unreadableRecords++; return; }
    if (receipt) {
      if (item && item.pending && typeof item.timestamp === 'number' && isFinite(item.timestamp) && item.timestamp > 0 && item.timestamp <= now + 6 * 60000) {
        // A fresh durable edit intent can still be inside its execution window.
        if (now - Number(item.timestamp) > 6 * 60000 || recorded && recorded.kind === 'idempotency') counts.uncertainRequests++;
      } else if (!validCompletedReceipt_(item)) counts.unreadableRecords++;
      return;
    }
    if (!validSecondaryTask_(item)) { counts.unreadableRecords++; return; }
    if (item.completedAt) {
      if (secondaryTaskNeedsReconciliation_(item) || item.uncertain || item.payload && item.payload.deliveryPending || Number(item.leaseUntil) > now) counts.uncertainTasks++;
      return;
    }
    counts.pendingTasks++;
    if (item.lastFailure) { counts.failedTasks++; failedTasks.push(Object.assign({},item.lastFailure,{taskKind:item.kind})); }
    if (Number(item.leaseUntil) > now) counts.activeTasks++;
    if (secondaryTaskNeedsReconciliation_(item) || backgroundTaskState_(item) === 'expired') counts.uncertainTasks++;
    if (now - Number(item.createdAt) > LORD_SECONDARY.MAX_AGE_MS) counts.stalePendingTasks++;
  });
  var reconciliation = counts.uncertainTasks + counts.uncertainRequests + counts.unreadableRecords + counts.stalePendingTasks;
  var pressure = counts.estimatedPropertyBytes >= LORD_RUNTIME_STORAGE.WARNING_BYTES;
  var manual = Object.keys(unresolved).map(function(key) { counts.manualFailures += Math.max(1,Number(unresolved[key].count) || 1); return unresolved[key]; });
  var needsReview = manual.some(function(item) { return item.kind !== 'legacy_retry'; });
  // Compatibility with a task-linked warning written before task-local diagnostics.
  if (recorded && recorded.taskKey && all[recorded.taskKey]) {
    try { var oldTask = JSON.parse(all[recorded.taskKey]); if (validSecondaryTask_(oldTask) && !oldTask.completedAt && !oldTask.lastFailure) { counts.failedTasks++; failedTasks.push(recorded); } } catch (ignoreLegacyTask) {}
  }
  if (!reconciliation && !pressure && !manual.length && !counts.failedTasks && !malformedWarning) return null;
  var state = reconciliation || pressure || needsReview || malformedWarning ? 'attention' : counts.failedTasks ? 'retrying' : 'history';
  var result = {state:state,checkedAt:checkedAt,counts:counts,
    summary:reconciliation ? 'Background work has an uncertain or unreadable outcome.' : pressure ? 'Background storage is near its limit.' : state === 'retrying' ? 'Background delivery is waiting for a retry.' : state === 'history' ? 'Earlier background failure recorded; no current fault was confirmed.' : 'A recorded background failure needs review.',
    action:reconciliation ? 'Ask the Apps Script maintainer to run diagnoseLORDBackgroundWork and reconcile the affected work before retrying. This prevents duplicate notifications or edits.' : pressure ? 'Ask the Apps Script maintainer to run maintainLORDRuntimeProperties and review pending work. Active work and settings must be retained.' : state === 'retrying' ? 'The queue will retry automatically. If this persists, check notification setup and the execution log at the recorded time.' : state === 'history' ? 'Confirm the earlier outcome once with the Apps Script maintainer. The historical notice can then be acknowledged with acknowledgeLORDMaintenanceWarning.' : 'Ask the Apps Script maintainer to check the execution log at the recorded time and confirm that the required work was queued or completed before acknowledging this notice.'};
  var failures = manual.concat(failedTasks).map(maintenanceFailurePublic_);
  result.failures = failures.slice(0,6);
  result.moreFailures = Math.max(0,failures.length - result.failures.length);
  if (result.failures.length) result.lastFailure = result.failures[0];

  return result;
}

function maintenanceFailurePublic_(recorded) {
  var kind = String(recorded.kind || ''), taskKind = String(recorded.taskKind || kind);
  var taskName = /whatsapp/.test(taskKind) ? 'WhatsApp notification' : /email/.test(taskKind) ? 'Email notification' : kind === 'idempotency' ? 'Saved-request receipt' : kind === 'storage_pressure' ? 'Background storage' : kind === 'booking_cache' ? 'Booking schedule cache' : /booking_link|booking_complete/.test(taskKind) ? 'Booking status update' : /event/.test(taskKind) ? 'Audit event' : 'Background maintenance';
  var reason = recorded.reason || {}, details = {
    DAILY_QUOTA:'A Google service quota was reached.', PERMISSION:'The execution account needs permission for this operation.',
    STORAGE:'Background work could not fit in its storage allowance.', SETUP:'Notification delivery is disabled or its setup is incomplete.',
    UNCLASSIFIED_FAILURE:'The operation failed. Its execution log contains the full diagnostic.'
  };
  // Reconstruct display text; never return arbitrary stored error strings.
  if (reason.code === 'WHATSAPP_PROVIDER' && /^\d{3}$/.test(String(reason.http)) && /^\d+$/.test(String(reason.providerCode))) {
    details.WHATSAPP_PROVIDER = 'WhatsApp rejected the request (HTTP ' + Number(reason.http) + ', code ' + Number(reason.providerCode) + ').';
  }
  var reasonCode = Object.prototype.hasOwnProperty.call(details, reason.code) ? reason.code : 'UNCLASSIFIED_FAILURE';
  return {task:taskName,at:isFinite(Date.parse(recorded.at)) ? new Date(recorded.at).toISOString() : '',reason:reasonCode,detail:details[reasonCode]};
}

function validSecondaryTask_(task) {
  return Boolean(task && ['booking_email','whatsapp_alert','booking_link','booking_complete','event'].indexOf(task.kind) !== -1 &&
    typeof task.createdAt === 'number' && isFinite(task.createdAt) && task.createdAt > 0 &&
    (!Object.prototype.hasOwnProperty.call(task,'completedAt') || typeof task.completedAt === 'number' && isFinite(task.completedAt) && task.completedAt > 0));
}

// One classification governs administrator actions and network queue admission.
// Acceptance is provider evidence, never proof of delivery.
function backgroundTaskState_(task, recipient) {
  if (!validSecondaryTask_(task)) return 'unreadable';
  if (task.management && task.management.some(function(c) { return !c.audited; })) return 'audit_pending';
  if (task.completedAt) return (task.evidence || []).some(function(e) { return !recipient || e.email === recipient; }) ? 'accepted' : task.reviews && task.reviews.length ? 'reviewed' : 'completed';
  if (Number(task.leaseUntil) > Date.now()) return 'active';
  if (task.kind !== 'booking_email' && task.kind !== 'whatsapp_alert') return 'repair';
  var p = task.payload || {}, pending = p.deliveryPending;
  if (p.pendingAudit && (!recipient || p.pendingAudit.email === recipient)) return 'accepted';
  if (recipient && (task.evidence || []).some(function(e) { return e.email === recipient; })) return 'accepted';
  if (task.uncertain || task.sendIntent && (!recipient || !task.sendIntent.email || task.sendIntent.email === recipient) || task.kind === 'booking_email' && task.leaseToken && !task.notificationCheckpointed && !task.sendIntent || pending && (!recipient || pending.email === recipient)) return 'unknown';
  if (task.kind === 'whatsapp_alert' && Date.now() - task.createdAt > 86400000) return 'expired';
  return task.lastFailure ? 'failed' : 'waiting';
}
function backgroundActions_(state) {
  return state === 'waiting' || state === 'failed' ? ['retry','cancel'] : state === 'unknown' || state === 'expired' ? ['retire'] : [];
}
function backgroundRecipients_(task) {
  var p = task.payload || {}, recipients = task.kind === 'booking_email' ? String(p.email || '').split(/[,;]/).map(function(s) { return s.trim(); }).filter(Boolean) : (p.remaining || []).slice();
  // MailApp accepts a group in one call. Split new attempts into individually
  // checkpointed recipients, while old ambiguous claims apply to the whole group.
  if (p.pendingAudit && recipients.indexOf(p.pendingAudit.email) < 0) recipients.push(p.pendingAudit.email);
  (task.evidence || []).forEach(function(e) { if (recipients.indexOf(e.email) < 0) recipients.push(e.email); });
  (task.reviews || []).forEach(function(r) { if (recipients.indexOf(r.recipient) < 0) recipients.push(r.recipient); });
  return recipients.length ? recipients : [''];
}
function backgroundHash_(raw) { return hashBookingValue_(String(raw), ''); }
function backgroundPublicItem_(id, raw, task, recipient) {
  var review = (task.reviews || []).filter(function(r) { return r.recipient === recipient; })[0];
  var classified = backgroundTaskState_(task, recipient), state = classified === 'audit_pending' ? classified : review ? 'reviewed' : classified, p = task.payload || {};
  var actions = backgroundActions_(state);
  if (state !== 'unknown' && backgroundTaskState_(task) === 'unknown') actions = actions.filter(function(action) { return action !== 'retry'; });
  var safeRecipient = /^[^\s<>@]+@[^\s<>@]+$/.test(recipient) ? recipient : '';
  return {taskId:id,recipient:safeRecipient,kind:task.kind,bookingId:/^[A-Za-z0-9_-]{1,100}$/.test(p.bookingId || '') ? p.bookingId : '',
    createdAt:new Date(task.createdAt).toISOString(),state:state,expectedHash:backgroundHash_(raw),actions:safeRecipient || !recipient ? actions : [],
    evidence:review ? (['unknown','expired','waiting','failed'].indexOf(review.evidence) >= 0 ? review.evidence : 'Reviewed; delivery unverified') : state === 'accepted' ? 'Provider accepted; delivery unverified' : state === 'unknown' ? 'Send outcome unknown' : 'No acceptance recorded',
    error:task.lastFailure ? maintenanceFailurePublic_(Object.assign({},task.lastFailure,{taskKind:task.kind})).detail : '',
    reviewedAt:review ? new Date(review.at).toISOString() : '',reviewAction:review && ['cancel','retire'].indexOf(review.operation) >= 0 ? review.operation : ''};
}
function listBackgroundWork_(request) {
  requireLiveAdmin_(request);
  var all = PropertiesService.getScriptProperties().getProperties(), items = [], unreadable = 0;
  Object.keys(all).sort().forEach(function(key) {
    if (key.indexOf(LORD_SECONDARY.PREFIX) !== 0) return;
    var task; try { task = JSON.parse(all[key]); } catch (ignore) { unreadable++; return; }
    if (!validSecondaryTask_(task)) { unreadable++; return; }
    backgroundRecipients_(task).forEach(function(recipient) {
      var item = backgroundPublicItem_(key.slice(LORD_SECONDARY.PREFIX.length), all[key], task, recipient);
      if (request.view === 'all' || ['failed','unknown','expired','audit_pending'].indexOf(item.state) >= 0) items.push(item);
    });
  });
  var warning = null, rawWarning = all.LORD_V14_MAINTENANCE_WARNING;
  if (rawWarning) { var record; try { record = JSON.parse(rawWarning); } catch (ignoreWarning) { record = {}; }
    if (record.kind !== 'acknowledged') warning = {expectedHash:backgroundHash_(rawWarning),detail:maintenanceFailurePublic_(record)};
  }
  return {items:items,unreadable:unreadable,warning:warning,maxSelection:20};
}
function backgroundCommand_(request, apply) {
  requireLiveAdmin_(request);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(request.commandId || '') || ['retry','cancel','retire'].indexOf(request.operation) < 0 || !Array.isArray(request.items) || !request.items.length || request.items.length > 20) throw new Error('Choose between 1 and 20 recipients and a valid command.');
  var seen = Object.create(null), groups = Object.create(null);
  request.items.forEach(function(item) {
    if (!item || !/^[A-Za-z0-9_-]{1,160}$/.test(item.taskId || '') || typeof item.recipient !== 'string' || item.recipient.length > 254 || !/^[a-f0-9]{64}$/.test(item.expectedHash || '')) throw new Error('Invalid background selection.');
    var pair = item.taskId + ':' + item.recipient;
    if (seen[pair]) throw new Error('Choose each recipient once.'); seen[pair] = true;
    (groups[item.taskId] || (groups[item.taskId] = [])).push(item);
  });
  var fingerprint = backgroundHash_(JSON.stringify({operation:request.operation,items:request.items,actor:request.authSub}));
  return withWriteLock_(function() {
    var actor = requireLiveAdmin_(request), props = PropertiesService.getScriptProperties(), results = [];
    // Same-key task receipts also bind a command across a selected batch.
    // Reusing its identity for a different selection must not edit another task.
    var snapshot = props.getProperties(), reused = Object.keys(snapshot).some(function(key) {
      if (key.indexOf(LORD_SECONDARY.PREFIX) !== 0) return false;
      try { var other = JSON.parse(snapshot[key]); return (other.management || []).some(function(c) { return c.id === request.commandId && c.fingerprint !== fingerprint; }); } catch (ignore) { return false; }
    });
    if (reused) return {items:request.items.map(function(s) { return {taskId:s.taskId,recipient:s.recipient,status:'conflict'}; })};
    Object.keys(groups).forEach(function(id) {
      var selections = groups[id], key = LORD_SECONDARY.PREFIX + id, raw = props.getProperty(key), task;
      try { task = JSON.parse(raw); } catch (ignore) {}
      var prior = task && (task.management || []).filter(function(c) { return c.id === request.commandId; })[0];
      if (prior && prior.fingerprint === fingerprint) {
        if (apply) { try { flushBackgroundCommandAudit_(props,key,task,prior); } catch (ignoreAudit) { results.push({taskId:id,status:'audit_pending'}); return; } }
        selections.forEach(function(s) { results.push({taskId:id,recipient:s.recipient,status:prior.items.some(function(item) { return item.recipient === s.recipient; }) ? 'replayed' : 'blocked'}); }); return;
      }
      if (prior || !validSecondaryTask_(task) || selections.some(function(s) { return s.expectedHash !== backgroundHash_(raw); })) {
        selections.forEach(function(s) { results.push({taskId:id,recipient:s.recipient,status:'conflict'}); }); return;
      }
      var recipients = backgroundRecipients_(task), valid = [], groupResults = [];
      selections.forEach(function(s) {
        var item = backgroundPublicItem_(id,raw,task,s.recipient);
        if (recipients.indexOf(s.recipient) < 0 || item.actions.indexOf(request.operation) < 0 || (task.management || []).length >= 20) { groupResults.push({taskId:id,recipient:s.recipient,status:'blocked'}); return; }
        valid.push(s); groupResults.push({taskId:id,recipient:s.recipient,status:apply?'applied':'ready',state:item.state,operation:request.operation});
      });
      if (valid.length) {
        var before = task.payload || {}, pending = before.deliveryPending;
        var clearsEmailIntent = task.sendIntent && task.sendIntent.email && valid.some(function(s) { return s.recipient === task.sendIntent.email; }) && request.operation === 'retire';
        var oldEmailUnknown = task.kind === 'booking_email' && (task.sendIntent && !task.sendIntent.email || task.leaseToken && !task.notificationCheckpointed && !task.sendIntent);
        var clearsPending = pending && valid.some(function(s) { return s.recipient === pending.email; }) && request.operation === 'retire';
        var remaining = recipients.filter(function(r) { return !valid.some(function(s) { return s.recipient === r; }) && !(task.reviews || []).some(function(v) { return v.recipient === r; }) && !(before.pendingAudit && before.pendingAudit.email === r) && !(task.evidence || []).some(function(e) { return e.email === r; }); });
        var resumes = !task.uncertain && !oldEmailUnknown && (!task.sendIntent || clearsEmailIntent) && (!pending || clearsPending) && !(task.kind === 'whatsapp_alert' && Date.now()-task.createdAt>86400000) ? remaining.length : 0;
        groupResults.forEach(function(r) { if (r.status === 'ready' || r.status === 'applied') r.remainingResume = resumes; });
        if (apply) {
          task.management = task.management || []; task.reviews = task.reviews || [];
          var command = {id:request.commandId,fingerprint:fingerprint,at:Date.now(),actor:actor.email,operation:request.operation,items:groupResults.filter(function(r) { return r.status === 'applied'; }).map(function(r) { return {recipient:r.recipient,evidence:r.state}; })};
          task.management.push(command);
          if (request.operation === 'retry') { delete task.nextAttemptAt; delete task.lastFailure; }
          else {
            command.items.forEach(function(r) { task.reviews.push({recipient:r.recipient,evidence:r.evidence,operation:request.operation,at:command.at}); });
            if (task.kind === 'booking_email') { before.email = remaining.join(','); if (clearsEmailIntent) { delete task.sendIntent; delete task.leaseToken; delete task.leaseUntil; } }
            else before.remaining = remaining;
            if (clearsPending) { delete before.deliveryPending; delete task.leaseToken; delete task.leaseUntil; }
            if (!remaining.length && !before.pendingAudit) {
              task = {kind:task.kind,createdAt:task.createdAt,completedAt:Date.now(),reviews:task.reviews,management:task.management,evidence:task.evidence || []};
            }
          }
          try {
            setBoundedRuntimeProperty_(props,key,JSON.stringify(task),null,true);
            flushBackgroundCommandAudit_(props,key,task,command);
          } catch (ignoreWrite) { groupResults.forEach(function(r) { if (r.status === 'applied') r.status = 'unknown_outcome'; }); }
        }
      }
      results = results.concat(groupResults);
    });
    return {items:results,operation:request.operation,commandId:request.commandId,notice:'Retirement stops future attempts. It cannot recall submitted messages and does not confirm delivery.'};
  });
}
function flushBackgroundCommandAudit_(props, key, task, command) {
  if (command.audited) return;
  appendEvent_({spreadsheet:getTransactionSpreadsheet_(),eventId:'BG-'+backgroundHash_(key+command.id),eventType:'BACKGROUND_WORK_REVIEWED',teacher:command.actor,
    payload:{operation:command.operation,task:backgroundHash_(key),items:command.items,reviewedAt:new Date(command.at).toISOString()}});
  SpreadsheetApp.flush();
  command.audited = true;
  setBoundedRuntimeProperty_(props,key,JSON.stringify(task),null,true);
}
// Saved review intent is sufficient to recover its audit after a browser or
// administrator change. Only audit checkpointing occurs here; classification
// still decides whether any remaining notification may run.
function reconcileBackgroundCommandAudits_(props, key, task) {
  (task.management || []).forEach(function(command) {
    if (!command.audited) flushBackgroundCommandAudit_(props,key,task,command);
  });
}
function reconcileBackgroundAuditBatch_(props) {
  var all = props.getProperties(), repaired = 0;
  Object.keys(all).sort().forEach(function(key) {
    if (repaired >= 10 || key.indexOf(LORD_SECONDARY.PREFIX) !== 0) return;
    var task; try { task = JSON.parse(all[key]); } catch (ignore) { return; }
    if (!validSecondaryTask_(task) || !(task.management || []).some(function(c) { return !c.audited; })) return;
    repaired++;
    try { reconcileBackgroundCommandAudits_(props,key,task); }
    catch (error) { noteMaintenanceFailure_('diagnostic_checkpoint',error); }
  });
  // Reuse the uninterrupted locked snapshot when no recovery wrote anything.
  return repaired ? props.getProperties() : all;
}
function acknowledgeBackgroundWarning_(request) {
  requireLiveAdmin_(request);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(request.commandId || '')) throw new Error('Invalid acknowledgement command.');
  return withWriteLock_(function() {
    var actor = requireLiveAdmin_(request), props = PropertiesService.getScriptProperties(), key = 'LORD_V14_MAINTENANCE_WARNING', raw = props.getProperty(key), record;
    try { record = JSON.parse(raw); } catch (ignore) {}
    if (record && record.kind === 'acknowledged' && record.commandId === request.commandId && record.expectedHash === request.expectedHash && record.actor === actor.email) return {status:'replayed'};
    if (!raw || backgroundHash_(raw) !== request.expectedHash) return {status:'conflict'};
    appendEvent_({spreadsheet:getTransactionSpreadsheet_(),eventId:'BG-WARNING-'+backgroundHash_(request.commandId+request.expectedHash),eventType:'BACKGROUND_WARNING_ACKNOWLEDGED',teacher:actor.email,payload:{warningHash:request.expectedHash}});
    SpreadsheetApp.flush();
    setBoundedRuntimeProperty_(props,key,JSON.stringify({kind:'acknowledged',at:new Date().toISOString(),commandId:request.commandId,expectedHash:request.expectedHash,actor:actor.email}),null,true);
    return {status:'applied'};
  });
}

function secondaryTaskNeedsReconciliation_(task) {
  return backgroundTaskState_(task) === 'unknown' || backgroundTaskState_(task) === 'audit_pending';
}

function lordPropertyDiagnostics_(all) {
  var result = {estimatedPropertyBytes:runtimePropertyBytes_(all),propertyCount:Object.keys(all).length,queueTasks:0,receipts:0,
    pendingTasks:0,completedTasks:0,activeLeases:0,uncertainTasks:0,stalePendingTasks:0,uncertainRequests:0,unreadableRecords:0,
    admissionLimitBytes:LORD_RUNTIME_STORAGE.ADMISSION_BYTES,recoveryLimitBytes:LORD_RUNTIME_STORAGE.RECOVERY_BYTES,
    pruning:executionContext_().propertyPruning || {scanned:0,deleted:0,failed:0},lastWarning:getLORDMaintenanceWarning_()};
  Object.keys(all).forEach(function(key) {
    var queued = key.indexOf(LORD_SECONDARY.PREFIX) === 0, receipt = key.indexOf(LORD_IDEMPOTENCY.PREFIX) === 0;
    if (!queued && !receipt) return;
    if (queued) result.queueTasks++; else result.receipts++;
    var item;
    try { item = JSON.parse(all[key]); if (!item || typeof item !== 'object') throw new Error('invalid'); }
    catch (ignore) { result.unreadableRecords++; return; }
    if (receipt) { if (item.pending) result.uncertainRequests++; else if (!validCompletedReceipt_(item)) result.unreadableRecords++; return; }
    if (!validSecondaryTask_(item)) { result.unreadableRecords++; return; }
    if (item.completedAt) result.completedTasks++;
    else {
      result.pendingTasks++;
      if (Number(item.leaseUntil) > Date.now()) result.activeLeases++;
      if (secondaryTaskNeedsReconciliation_(item) || (item.leaseToken && Number(item.leaseUntil) <= Date.now())) result.uncertainTasks++;
      if (Number(item.createdAt) > 0 && Date.now() - Number(item.createdAt) > LORD_SECONDARY.MAX_AGE_MS) result.stalePendingTasks++;
    }
  });
  result.needsAttention = result.estimatedPropertyBytes >= LORD_RUNTIME_STORAGE.WARNING_BYTES || Boolean(result.uncertainRequests || result.unreadableRecords || result.stalePendingTasks || result.uncertainTasks || result.pruning.failed);
  return result;
}

function diagnoseLORDBackgroundWork() {
  var result = lordPropertyDiagnostics_(PropertiesService.getScriptProperties().getProperties());
  Logger.log(JSON.stringify(result));
  return result;
}

function maintainLORDRuntimeProperties() {
  resetExecutionContext_();
  return withRuntimePropertyLock_(function() {
    var props = PropertiesService.getScriptProperties(), all = props.getProperties();
    pruneRuntimeProperties_(props, all, Date.now());
    var result = lordPropertyDiagnostics_(all);
    Logger.log(JSON.stringify(result));
    return result;
  });
}

function acknowledgeLORDMaintenanceWarning() {
  // Maintainer-only editor function. It clears the notice after reconciliation,
  // never queue tasks, receipts, custody records or user data.
  withRuntimePropertyLock_(function() { PropertiesService.getScriptProperties().deleteProperty('LORD_V14_MAINTENANCE_WARNING'); });
}

function storeIdempotentResult_(requestId, result) {
  try {
    var props = PropertiesService.getScriptProperties();
    var receipt = {timestamp:Date.now(),result:result};
    if (executionContext_().evidenceRequest) receipt.evidenceBinding = executionContext_().evidenceRequest;
    setBoundedRuntimeProperty_(props, idempotencyPropertyKey_(requestId), JSON.stringify(receipt), null, true);
    delete executionContext_().receiptPrepared;
  } catch (error) {
    // The authoritative record is saved. Deterministic record recovery or the
    // retained pending intent prevents a lost receipt from repeating an edit.
    noteMaintenanceFailure_('idempotency', error);
  }
}

function pruneIdempotency_(props, now, snapshot) {
  return withRuntimePropertyLock_(function(acquired) {
    return pruneRuntimeProperties_(props, !acquired && snapshot ? snapshot : props.getProperties(), now);
  });
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
  return queueSecondaryTasks_([{ kind: kind, payload: payload }])[0];
}

function queueSecondaryTasks_(entries) {
  try {
    return measureBackendPhase_('queueMs', function() {
      return withRuntimePropertyLock_(function() {
        var props = PropertiesService.getScriptProperties(), all = null, pending = 0;
        // This snapshot lives only inside this uninterrupted lock ownership.
        // Each bounded write updates it; a failed write invalidates it because
        // the storage service may have committed before losing its response.
        return entries.map(function(entry) {
          try {
            if (!all) { all = props.getProperties(); pending = pruneSecondaryTasks_(props, all).length; }
            if (pending >= LORD_SECONDARY.MAX_ITEMS) throw new Error('The background queue is full; existing tasks were retained.');
            var payload = entry.payload;
            if (entry.kind === 'event') payload = { sessionId: payload.sessionId, eventType: payload.eventType, teacher: payload.teacher, payload: payload.payload || {} };
            var task = { kind: String(entry.kind || ''), payload: payload || {}, createdAt: Date.now() };
            setBoundedRuntimeProperty_(props, LORD_SECONDARY.PREFIX + Utilities.getUuid(), JSON.stringify(task), all);
            pending++;
            return true;
          } catch (error) {
            all = null;
            noteMaintenanceFailure_('queue_' + String(entry.kind), error);
            return false;
          }
        });
      });
    });
  } catch (error) {
    return entries.map(function(entry) { noteMaintenanceFailure_('queue_' + String(entry.kind), error); return false; });
  }
}

function pruneSecondaryTasks_(props, snapshot) {
  return withRuntimePropertyLock_(function(acquired) {
    var all = !acquired && snapshot ? snapshot : props.getProperties();
    pruneRuntimeProperties_(props, all, Date.now());
    var items = [], needsReconciliation = false;
    Object.keys(all).forEach(function(key) {
      if (key.indexOf(LORD_SECONDARY.PREFIX) !== 0) return;
      try {
        var task = JSON.parse(all[key]);
        if (!validSecondaryTask_(task)) throw new Error('invalid');
        if (!task.completedAt) {
          if (secondaryTaskNeedsReconciliation_(task) || Date.now() - Number(task.createdAt) > LORD_SECONDARY.MAX_AGE_MS) needsReconciliation = true;
          task._key = key; items.push(task);
        }
      } catch (ignore) { needsReconciliation = true; items.push({_key:key,invalid:true,createdAt:Date.now()}); } // Preserve unreadable work for reconciliation.
    });
    if (needsReconciliation && !executionContext_().propertyReconciliationWarned) {
      executionContext_().propertyReconciliationWarned = true;
      noteMaintenanceFailure_('queue_reconciliation', new Error('Retained background work needs administrator reconciliation.'), all);
    }
    items.sort(function(a, b) { return Number(a.createdAt) - Number(b.createdAt); });
    return items;
  });
}

function processSecondaryQueue_(limit) {
  var props = PropertiesService.getScriptProperties();
  var recoverWhatsApp = whatsAppConfig_().ready;
  // Pruning deletes records: refresh its snapshot while holding the same lock
  // used for task claims, so an old snapshot cannot erase a fresh email lease.
  var lock = scriptWriteLock_();
  if (!lock.tryLock(3000)) return;
  var tasks;
  try {
    if (recoverWhatsApp) {
      try { scheduleTeacherWhatsApp_(); } catch (error) { noteMaintenanceFailure_('teacher_whatsapp', error); }
      try { recoverWhatsAppForceClose_(); } catch (error) { noteMaintenanceFailure_('whatsapp_recovery', error); }
    }
    var queueSnapshot = reconcileBackgroundAuditBatch_(props);
    tasks = pruneSecondaryTasks_(props,queueSnapshot).filter(function(task) { return !task.invalid && !secondaryTaskNeedsReconciliation_(task) && backgroundTaskState_(task) !== 'expired' && !(Number(task.leaseUntil) > Date.now()) && !(Number(task.nextAttemptAt) > Date.now()); });
    // Operational Sheet repairs must not sit behind notification retries.
    tasks.sort(function(a, b) { return Number(a.kind === 'whatsapp_alert') - Number(b.kind === 'whatsapp_alert') || a.createdAt - b.createdAt; });
    tasks = tasks.slice(0, Math.max(1, Number(limit) || 10));
  }
  finally { lock.releaseLock(); }
  var queueStarted = Date.now();
  for (var i = 0; i < tasks.length && Date.now() - queueStarted < 90000; i++) processSecondaryTaskWithClaim_(props, tasks[i]._key);
}

function processSecondaryTaskWithClaim_(props, key) {
  var lock = scriptWriteLock_();
  var acquired = false;
  var task = null;
  var emailClaim = '';
  try {
    acquired = lock.tryLock(3000);
    if (!acquired) return;
    var raw = props.getProperty(key);
    if (!raw) return; // Another runner completed it after our snapshot.
    task = JSON.parse(raw);
    reconcileBackgroundCommandAudits_(props,key,task);
    task._key = key; // Stable identity also covers tasks queued before v1.7.
    if (task.completedAt || Number(task.nextAttemptAt) > Date.now() || Number(task.leaseUntil) > Date.now()) return;
    if (backgroundTaskState_(task) === 'expired') { noteMaintenanceFailure_('whatsapp_expired',new Error('An operational WhatsApp alert expired after 24 hours.'),null,task); return; }
    if (secondaryTaskNeedsReconciliation_(task)) {
      noteMaintenanceFailure_('whatsapp_uncertain', new Error('A delivery outcome needs administrator reconciliation before retrying.'));
      return;
    }
    if (task.kind !== 'booking_email' && task.kind !== 'whatsapp_alert') {
      executeSecondaryTask_(task);
      SpreadsheetApp.flush(); // Finish Sheet work before acknowledging the queue item.
      props.deleteProperty(key);
      return;
    }
    // Claim network work, then release the Sheet lock before email or WhatsApp.
    emailClaim = Utilities.getUuid();
    task.leaseToken = emailClaim;
    task.leaseUntil = Date.now() + 6 * 60 * 1000;
    if (task.kind === 'booking_email') task.sendIntent = {startedAt:Date.now(),email:String(task.payload.email || '').split(/[,;]/)[0].trim()};
    setBoundedRuntimeProperty_(props, key, JSON.stringify(task));
  } catch (error) {
    noteMaintenanceFailure_('queue_retry', error, null, task);
    emailClaim = '';
  } finally {
    if (acquired) lock.releaseLock();
  }
  if (!emailClaim) return;
  var sent = false, definitiveFailure = false;
  try { executeSecondaryTask_(task); sent = true; }
  catch (error) { definitiveFailure = Boolean(error.definitiveNonacceptance) || task.kind === 'booking_email' && /^(Service invoked too many times for one day: email|Limit exceeded: Email)/i.test(getErrorMessage_(error)); noteMaintenanceFailure_(task.kind === 'whatsapp_alert' ? 'whatsapp_retry' : 'email_retry', error, null, task); }
  var finishLock = scriptWriteLock_();
  if (!finishLock.tryLock(3000)) return; // Lease expires if receipt cannot be saved.
  try {
    var currentRaw = props.getProperty(key);
    var current = currentRaw ? JSON.parse(currentRaw) : null;
    if (!current || current.leaseToken !== emailClaim) return;
    if (sent && task.kind === 'whatsapp_alert' && (current.payload.remaining || []).length && Date.now() - current.createdAt > 86400000) {
      delete current.leaseToken; delete current.leaseUntil;
      setBoundedRuntimeProperty_(props,key,JSON.stringify(current));
      return; // Acceptance audit recovery must retain other expired recipients for review.
    }
    if (sent && task.kind === 'booking_email' && !(current.management || []).length && !(current.reviews || []).length) props.deleteProperty(key);
    else if (sent) {
      // Retain only a small receipt; never retain phone numbers or message bodies.
      setBoundedRuntimeProperty_(props, key, JSON.stringify({ kind: task.kind, createdAt: task.createdAt, completedAt: Date.now(), reviews:current.reviews || [], management:current.management || [], evidence:current.evidence || [] }));
    } else {
      delete current.leaseToken; delete current.leaseUntil;
      if (task.kind === 'booking_email' && definitiveFailure) { delete current.sendIntent; delete current.payload.deliveryPending; }
      if (task.kind === 'whatsapp_alert') current.nextAttemptAt = Date.now() + 60000;
      setBoundedRuntimeProperty_(props, key, JSON.stringify(current));
    }
  } catch (error) { noteMaintenanceFailure_(task.kind === 'whatsapp_alert' ? 'whatsapp_checkpoint' : 'email_checkpoint', error, null, task); }
  finally { finishLock.releaseLock(); }
}

function deliverBookingEmail_(task) {
  var recipients = String(task.payload.email || '').split(/[,;]/).map(function(email) { return email.trim(); }).filter(Boolean);
  for (var i = 0; i < recipients.length; i++) {
    var email = recipients[i];
    checkpointWhatsAppSend_(task,email);
    sendBookingEmail_(Object.assign({},task.payload,{email:email}));
    withRuntimePropertyLock_(function() {
      var props = PropertiesService.getScriptProperties(), current = JSON.parse(props.getProperty(task._key));
      if (!current || current.leaseToken !== task.leaseToken) throw new Error('Email delivery claim changed.');
      current.payload.email = recipients.slice(i+1).join(',');
      delete current.payload.deliveryPending; delete current.sendIntent;
      current.notificationCheckpointed = true;
      current.evidence = current.evidence || []; current.evidence.push({email:email,acceptedAt:Date.now()});
      setBoundedRuntimeProperty_(props,task._key,JSON.stringify(current));
    });
  }
}

function executeSecondaryTask_(task) {
  if (task.kind === 'whatsapp_alert') return deliverWhatsAppAlert_(task);
  if (task.kind === 'booking_email') return deliverBookingEmail_(task);
  if (task.kind === 'booking_link') return linkBookingCollection_(task.payload);
  if (task.kind === 'booking_complete') return completeBookingBySession_(task.payload);
  if (task.kind === 'event') {
    var details = task.payload || {};
    details.spreadsheet = getTransactionSpreadsheet_();
    details.eventId = task._key ? 'QUEUE-' + task._key : '';
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
      requireCommittedEvidence_(previouslyCollected.sessionId);
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
  var evidencePhotos = trolleys.map(function(t, index) { return { sessionId: sessionId, phase: 'loan', sequence: index + 1, trolleyName: t.name, photoData: t.photoData }; });
  if (stylusesBooked && stylusLoanQuantity > 0) evidencePhotos.push({ sessionId: sessionId, phase: 'loan_accessory', sequence: 1, trolleyName: 'Styluses', photoData: requestAccessories.styluses.photoData });
  if (headphonesBooked && headphoneLoanQuantity > 0) evidencePhotos.push({ sessionId: sessionId, phase: 'loan_accessory', sequence: 2, trolleyName: 'Headphones', photoData: requestAccessories.headphones.photoData });
  prepareEvidenceUploads_(request, sessionId, evidencePhotos);
  var stylusLoanPhoto = { fileId: '', url: '' };
  var headphoneLoanPhoto = { fileId: '', url: '' };
  if (stylusesBooked && stylusLoanQuantity > 0) {
    stylusLoanPhoto = savePhoto_({
      sessionId: sessionId, phase: 'loan_accessory',
      sequence: 1, trolleyName: 'Styluses',
      photoData: requestAccessories.styluses && requestAccessories.styluses.photoData
    });
  }
  if (headphonesBooked && headphoneLoanQuantity > 0) {
    headphoneLoanPhoto = savePhoto_({
      sessionId: sessionId, phase: 'loan_accessory',
      sequence: 2, trolleyName: 'Headphones',
      photoData: requestAccessories.headphones && requestAccessories.headphones.photoData
    });
  }

  var stagedTrolleys = [];
  for (i = 0; i < trolleys.length; i++) {
    var photo = savePhoto_({
      sessionId: sessionId, phase: 'loan',
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
    if (prior) { requireCommittedEvidence_(prior.sessionId); return prior; }

    var freshBooking = getBookingInternalById_(bookingId);
    if (!freshBooking) throw new Error('Booking disappeared before collection could be committed.');

    if (freshBooking.status === 'COLLECTED' && freshBooking.collectedSessionId &&
        String(freshBooking.collectedSessionId) !== sessionId) {
      throw new Error('Booking was collected by another transaction before this collection completed.');
    }
    if (freshBooking.status !== 'BOOKED' &&
        !(freshBooking.status === 'COLLECTED' && String(freshBooking.collectedSessionId) === sessionId)) {
      throw new Error('Booking cannot be collected. Status: ' + freshBooking.status);
    }
    if (String(freshBooking.resource) !== cartGroup) {
      throw new Error('Booking resource changed before collection could be committed.');
    }

    // Photo staging releases the lock. A concurrent edit must not commit
    // evidence collected against different booking or accessory requirements.
    if (['teacher', 'classOrActivity', 'subject', 'date', 'resource', 'startPeriod',
         'endPeriod', 'requestedQuantity', 'styluses', 'headphones'].some(function(key) {
      return String(freshBooking[key]) !== String(booking[key]);
    })) throw new Error('Booking changed while collection evidence was being prepared. Reload the booking and review its requirements before trying again.');

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
        requireCommittedEvidence_(sessionId);
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
    queueEvidenceCommit_(collectionRequests);
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
      requireCommittedEvidence_(sessionId);
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
  var evidencePhotos = validated.map(function(t) { return { sessionId: sessionId, phase: 'return', sequence: t.saved.sequence, trolleyName: t.saved.name, photoData: t.photoData }; });
  if (stylusesBooked && returnStylusQuantity > 0) evidencePhotos.push({ sessionId: sessionId, phase: 'return_accessory', sequence: 1, trolleyName: 'Styluses', photoData: returnAccessories.styluses.photoData });
  if (headphonesBooked && returnHeadphoneQuantity > 0) evidencePhotos.push({ sessionId: sessionId, phase: 'return_accessory', sequence: 2, trolleyName: 'Headphones', photoData: returnAccessories.headphones.photoData });
  prepareEvidenceUploads_(request, sessionId, evidencePhotos);
  var stylusReturnPhoto = { fileId: '', url: '' };
  var headphoneReturnPhoto = { fileId: '', url: '' };
  if (stylusesBooked && returnStylusQuantity > 0) {
    stylusReturnPhoto = savePhoto_({
      sessionId: sessionId, phase: 'return_accessory',
      sequence: 1, trolleyName: 'Styluses', photoData: returnAccessories.styluses && returnAccessories.styluses.photoData
    });
  }
  if (headphonesBooked && returnHeadphoneQuantity > 0) {
    headphoneReturnPhoto = savePhoto_({
      sessionId: sessionId, phase: 'return_accessory',
      sequence: 2, trolleyName: 'Headphones', photoData: returnAccessories.headphones && returnAccessories.headphones.photoData
    });
  }

  for (i = 0; i < validated.length; i++) {
    var stagedPhoto = savePhoto_({
      sessionId: sessionId, phase: 'return',
      sequence: validated[i].saved.sequence, trolleyName: validated[i].saved.name,
      photoData: validated[i].photoData
    });
    validated[i].photoFileId = stagedPhoto.fileId;
    validated[i].photoUrl = stagedPhoto.url;
  }

  // Phase 2: short authoritative commit with state revalidation.
  return withWriteLock_(function() {
    var prior = requestId ? getIdempotentResult_(requestId) : null;
    if (prior) { requireCommittedEvidence_(prior.sessionId); return prior; }

    var currentSessionRow = findRowByValue_(sessionSheet, 1, sessionId);
    if (!currentSessionRow) throw new Error('Session disappeared before return could be committed.');
    var currentRow = sessionSheet.getRange(currentSessionRow, 1, 1, SESSION_HEADERS.length).getValues()[0];
    var currentStatus = normaliseText_(currentRow[1]).toUpperCase();

    if (currentStatus !== 'OPEN') {
      if (currentStatus === 'RETURNED' || currentStatus === 'RETURNED WITH ISSUE' || currentStatus === 'FORCE RETURNED' || currentStatus === 'FORCED RETURN' || currentStatus === 'DECLARED RETURNED') {
        requireCommittedEvidence_(sessionId);
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
    queueEvidenceCommit_(returnRequests);
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
    .getRange(2, 1, sheet.getLastRow() - 1, 32)
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

function evidenceDigest_(value, algorithm) {
  return Utilities.computeDigest(algorithm || Utilities.DigestAlgorithm.SHA_256, value).map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function evidenceCommand_(value) {
  if (Array.isArray(value)) return value.map(evidenceCommand_);
  if (!value || typeof value !== 'object') return value;
  var output = {};
  Object.keys(value).sort().forEach(function(key) {
    if (!/^auth/.test(key) && ['proxySecret','clientRequestId','teacher'].indexOf(key) === -1) output[key] = evidenceCommand_(value[key]);
  });
  return output;
}

function validEvidenceManifest_(manifest) {
  if (!manifest || manifest.schema !== 1 || !/^[a-f0-9]{64}$/.test(manifest.key) || !/^[a-f0-9]{64}$/.test(manifest.actor) || !/^[a-f0-9]{64}$/.test(manifest.command) || !manifest.sessionId || !manifest.folderId || !(manifest.createdAt > 0) || ['PENDING','COMMITTED','ABANDONED'].indexOf(manifest.status) < 0 || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 12) return false;
  var ids = {}, slots = {};
  return manifest.files.every(function(file) {
    if (!file || !file.id || ids[file.id] || !/^(loan|return)(?:_accessory)?:[1-9][0-9]*$/.test(file.slot) || slots[file.slot] || !file.name || !file.trolley || !/^image\/(jpeg|png|webp)$/.test(file.mime) || !(file.size > 0 && file.size <= 5*1024*1024) || !/^[a-f0-9]{64}$/.test(file.sha256) || !/^[a-f0-9]{32}$/.test(file.md5)) return false;
    ids[file.id] = true; slots[file.slot] = true; return true;
  });
}

function readEvidenceManifest_(key) {
  var sheet = getRequiredSheet_(getTransactionSpreadsheet_(), LORD_CONFIG.SHEETS.EVENTS);
  var matches = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder('UPLOAD-' + key).matchEntireCell(true).matchCase(true).findAll();
  if (!matches.length) return null;
  if (matches.length !== 1) throw new Error('The photo upload receipt is duplicated. Ask an administrator to reconcile it.');
  var rowNumber = matches[0].getRow(), row = sheet.getRange(rowNumber, 1, 1, EVENT_HEADERS.length).getValues()[0], manifest;
  try { manifest = JSON.parse(row[5]); } catch (ignore) {}
  if (!validEvidenceManifest_(manifest) || manifest.key !== key || row[2] !== 'EVIDENCE_UPLOAD_' + manifest.status || row[1] !== manifest.sessionId) throw new Error('The photo upload receipt is unreadable. Ask an administrator to reconcile it.');
  return { sheet: sheet, rowNumber: rowNumber, row: row, manifest: manifest };
}

function assertEvidenceBinding_(manifest, binding) {
  if (manifest.actor !== binding.actor || manifest.command !== binding.command) throw new Error('This photo request was already used by a different actor or for changed details. Start a new submission.');
  if (manifest.status === 'ABANDONED') throw new Error('This old photo request was retired. Start a new submission.');
}

function prepareEvidenceRequest_(request, requestId) {
  if (!requestId || requestId.length > 200) throw new Error('A stable request ID is required for photo uploads. Reload LORD before submitting.');
  var subject = requiredText_(request.authSub, 'Authenticated photo submitter');
  var actor = evidenceDigest_(JSON.stringify([request.authIdentityType || 'GSPS', subject, normaliseText_(request.authEmail).toLowerCase()]));
  var binding = { key: evidenceDigest_(requestId), actor: actor, command: evidenceDigest_(JSON.stringify(evidenceCommand_(request))) };
  var ctx = executionContext_(), found = readEvidenceManifest_(binding.key);
  ctx.evidenceRequest = binding;
  if (found) { assertEvidenceBinding_(found.manifest, binding); ctx.evidenceManifest = found.manifest; }
}

function evidencePhotoSpec_(details) {
  var data = requiredText_(details.photoData, 'Photo');
  var match = data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error('Photo format is invalid.');
  var contentType = match[1], bytes = Utilities.base64Decode(match[2]);
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('Each compressed photo must be no larger than 5 MB.');
  var extension = contentType === 'image/png' ? 'png' : (contentType === 'image/webp' ? 'webp' : 'jpg');
  return { slot: details.phase + ':' + details.sequence, trolley: String(details.trolleyName), mime: contentType,
    size: bytes.length, sha256: evidenceDigest_(bytes), md5: evidenceDigest_(bytes, Utilities.DigestAlgorithm.MD5), extension: extension, bytes: bytes };
}

function prepareEvidenceUploads_(request, sessionId, photos) {
  var ctx = executionContext_();
  if (!ctx.evidenceRequest) prepareEvidenceRequest_(request, normaliseText_(request.clientRequestId));
  if (typeof Drive === 'undefined' || !Drive.Files || typeof Drive.Files.generateIds !== 'function' || typeof Drive.Files.get !== 'function' || typeof Drive.Files.create !== 'function') throw new Error('Enable Advanced Drive API v3 in LORD Apps Script Services before uploading photos.');
  if (!photos.length || photos.length > 12) throw new Error('Submit between 1 and 12 evidence photos.');
  var specs = photos.map(evidencePhotoSpec_), binding = ctx.evidenceRequest, seen = {};
  specs.forEach(function(spec) { if (seen[spec.slot]) throw new Error('A photo slot was repeated.'); seen[spec.slot] = true; });
  var found = readEvidenceManifest_(binding.key), candidate = found && found.manifest;
  if (!candidate) {
    var folder = getSessionPhotoFolder_(sessionId), ids = Drive.Files.generateIds({ count: specs.length, space: 'drive', type: 'files' }).ids;
    if (!ids || ids.length !== specs.length) throw new Error('Drive could not reserve the photo IDs. Retry this submission.');
    candidate = { schema: 1, key: binding.key, actor: binding.actor, command: binding.command, sessionId: sessionId, status: 'PENDING', createdAt: Date.now(), folderId: folder.getId(), files: specs.map(function(spec, index) {
      return { slot: spec.slot, trolley: spec.trolley, mime: spec.mime, size: spec.size, sha256: spec.sha256, md5: spec.md5, id: ids[index],
        name: [sessionId,spec.slot.replace(':','_'),sanitiseFileName_(spec.trolley),Utilities.formatDate(new Date(),LORD_CONFIG.TIME_ZONE,'yyyyMMdd-HHmmss')].join('_')+'.'+spec.extension };
    }) };
  }
  ctx.evidenceManifest = withWriteLock_(function() {
    var current = readEvidenceManifest_(binding.key);
    if (current) { assertEvidenceBinding_(current.manifest, binding); return current.manifest; }
    var sheet = getRequiredSheet_(getTransactionSpreadsheet_(), LORD_CONFIG.SHEETS.EVENTS);
    var pending = sheet.getLastRow() < 2 ? [] : sheet.getRange(2,3,sheet.getLastRow()-1,1).createTextFinder('EVIDENCE_UPLOAD_PENDING').matchEntireCell(true).findAll();
    if (pending.length >= 2000) throw new Error('Photo upload receipts need administrator maintenance before another submission.');
    var writes = [];
    queueNewRows_(writes,sheet,sheet.getLastRow()+1,[['UPLOAD-'+binding.key,sessionId,'EVIDENCE_UPLOAD_PENDING',new Date(),'SYSTEM',JSON.stringify(candidate)]]);
    commitSurgicalUpdates_(writes);
    return candidate;
  });
  var manifest = ctx.evidenceManifest;
  if (manifest.sessionId !== sessionId || manifest.files.length !== specs.length) throw new Error('The photo request details changed. Start a new submission.');
  ctx.evidenceVerified = Object.create(null);
  specs.forEach(function(spec) {
    var entry = manifest.files.filter(function(file) { return file.slot === spec.slot; });
    if (entry.length !== 1 || ['trolley','mime','size','sha256','md5'].some(function(key) { return entry[0][key] !== spec[key]; })) throw new Error('The photo content does not match its saved request.');
  });
}

function verifyEvidenceFile_(metadata, entry, manifest) {
  if (!metadata || metadata.id !== entry.id || metadata.trashed || metadata.name !== entry.name || metadata.mimeType !== entry.mime || Number(metadata.size) !== entry.size || metadata.md5Checksum !== entry.md5 || !Array.isArray(metadata.parents) || metadata.parents.length !== 1 || metadata.parents[0] !== manifest.folderId || !metadata.appProperties || metadata.appProperties.lordUpload !== manifest.key || metadata.appProperties.lordSha256 !== entry.sha256) throw new Error('The saved photo could not be verified against its upload receipt.');
  var sha256 = metadata.sha256Checksum || evidenceDigest_(DriveApp.getFileById(entry.id).getBlob().getBytes());
  if (sha256 !== entry.sha256) throw new Error('The saved photo content does not match its upload receipt.');
  return { fileId: entry.id, url: metadata.webViewLink || 'https://drive.google.com/file/d/' + encodeURIComponent(entry.id) + '/view' };
}

function savePhoto_(details) {
  var spec = evidencePhotoSpec_(details), ctx = executionContext_(), manifest = ctx.evidenceManifest;
  var matches = manifest && manifest.files.filter(function(file) { return file.slot === spec.slot; }), entry = matches && matches.length === 1 && matches[0];
  if (!entry || manifest.sessionId !== details.sessionId || ['trolley','mime','size','sha256','md5'].some(function(key) { return entry[key] !== spec[key]; })) throw new Error('The photo does not match its prepared upload request.');
  var metrics = executionContext_().requestMetrics;
  if (metrics) metrics.photoCount++;
  return measureBackendPhase_('photoMs', function() {
    var fields = 'id,name,mimeType,size,md5Checksum,sha256Checksum,parents,appProperties,trashed,webViewLink', metadata;
    try { metadata = Drive.Files.get(entry.id,{fields:fields,supportsAllDrives:true}); }
    catch (error) {
      if (!(Number(error.code) === 404 || /File not found|notFound/.test(String(error.message)))) throw new Error('The photo upload is unconfirmed. Retry the same submission.');
    }
    if (!metadata) {
      try { metadata = Drive.Files.create({id:entry.id,name:entry.name,mimeType:entry.mime,parents:[manifest.folderId],appProperties:{lordUpload:manifest.key,lordSha256:entry.sha256}},Utilities.newBlob(spec.bytes,entry.mime,entry.name),{fields:fields,supportsAllDrives:true}); }
      catch (error) {
        // A timeout or 409 is not success. Adopt only a matching stored file.
        try { metadata = Drive.Files.get(entry.id,{fields:fields,supportsAllDrives:true}); }
        catch (ignore) { throw new Error('The photo upload is unconfirmed. Retry the same submission.'); }
      }
    }
    var result = verifyEvidenceFile_(metadata,entry,manifest);
    ctx.evidenceVerified[spec.slot] = true;
    return result;
  });
}

function requireCommittedEvidence_(sessionId) {
  var binding = executionContext_().evidenceRequest, found = binding && readEvidenceManifest_(binding.key);
  if (!found || found.manifest.status !== 'COMMITTED' || found.manifest.sessionId !== sessionId) throw new Error('This collection or return was already recorded by another submission. Check its saved record; these photos were not attached.');
  assertEvidenceBinding_(found.manifest,binding);
}

function queueEvidenceCommit_(writes) {
  var ctx = executionContext_(), manifest = ctx.evidenceManifest;
  if (!manifest || manifest.files.some(function(file) { return !ctx.evidenceVerified[file.slot]; })) throw new Error('All photo evidence must be verified before saving this declaration.');
  var found = readEvidenceManifest_(manifest.key);
  if (!found) throw new Error('The photo receipt changed before saving. Retry this submission.');
  assertEvidenceBinding_(found.manifest,ctx.evidenceRequest);
  if (found.manifest.sessionId !== manifest.sessionId || found.manifest.folderId !== manifest.folderId || JSON.stringify(found.manifest.files) !== JSON.stringify(manifest.files)) throw new Error('The photo receipt changed before saving.');
  var after = found.row.slice();
  after[2] = 'EVIDENCE_UPLOAD_COMMITTED';
  after[5] = JSON.stringify(Object.assign({},found.manifest,{status:'COMMITTED',completedAt:Date.now()}));
  queueChangedRow_(writes,found.sheet,found.rowNumber,found.row,after);
}

function inspectLORDPhotoUploadReadiness() {
  if (typeof Drive === 'undefined' || !Drive.Files || typeof Drive.Files.generateIds !== 'function' || typeof Drive.Files.get !== 'function' || typeof Drive.Files.create !== 'function') throw new Error('Enable Advanced Drive API v3 in LORD Apps Script Services.');
  var folder = Drive.Files.get(LORD_CONFIG.PHOTO_FOLDER_ID,{fields:'id,mimeType,trashed,capabilities(canAddChildren)',supportsAllDrives:true});
  if (!folder || folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder' || !folder.capabilities || !folder.capabilities.canAddChildren) throw new Error('LORD_PHOTO_FOLDER_ID must identify an active Drive folder where the execution account can add files.');
  var result = {check:'lord-photo-uploads',readOnly:true,status:'READY',advancedDriveVersion:'v3',newScriptProperties:0,newSheets:0};
  console.log(JSON.stringify(result));
  return result;
}

function maintainLORDPhotoUploads() {
  return withWriteLock_(function() {
    // Retire only old pending manifests. No Drive files are deleted. A racing
    // final commit re-reads this status and cannot attach retired evidence.
    var sheet=getRequiredSheet_(getTransactionSpreadsheet_(),LORD_CONFIG.SHEETS.EVENTS),writes=[],retired=0,now=Date.now();
    var matches=sheet.getLastRow()<2?[]:sheet.getRange(2,3,sheet.getLastRow()-1,1).createTextFinder('EVIDENCE_UPLOAD_PENDING').matchEntireCell(true).findAll();
    for(var i=0;i<matches.length && retired<20;i++) {
      var rowNumber=matches[i].getRow(),row=sheet.getRange(rowNumber,1,1,EVENT_HEADERS.length).getValues()[0],data;
      try { data=JSON.parse(row[5]); } catch(ignore) { continue; }
      if(!validEvidenceManifest_(data) || data.status!=='PENDING' || row[0]!=='UPLOAD-'+data.key || row[1]!==data.sessionId || now-data.createdAt<8*86400000)continue;
      var after=row.slice();after[2]='EVIDENCE_UPLOAD_ABANDONED';after[5]=JSON.stringify(Object.assign({},data,{status:'ABANDONED',closedAt:now}));
      queueChangedRow_(writes,sheet,rowNumber,row,after);retired++;
    }
    commitSurgicalUpdates_(writes);
    return {retired:retired,pendingBefore:matches.length,filesDeleted:0};
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

  if (details.eventId && findRowByValue_(sheet, 1, details.eventId)) return;
  sheet.appendRow([
    details.eventId || Utilities.getUuid(),
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
    throw new Error('Sessions schema is incomplete. Reconcile the schema from a backup before using the live system.');
  }
  var existing = sheet.getRange(1, 1, 1, SESSION_HEADERS.length).getDisplayValues()[0];
  for (var i = 0; i < SESSION_HEADERS.length; i++) {
    if (String(existing[i] || '') !== SESSION_HEADERS[i]) {
      throw new Error(
        'Sessions schema mismatch at column ' + (i + 1) + ': expected "' +
        SESSION_HEADERS[i] + '", found "' + String(existing[i] || '') +
        '". Reconcile from a backup; setup and runtime reads will not relabel existing data.'
      );
    }
  }
  verified[workbookId] = true;
  return true;
}

function createOrResetHeader_(spreadsheet, sheetName, headers) {
  // Compatibility name; no existing header or data is reset.
  return ensureHeaderRow_(spreadsheet, sheetName, headers);
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
  payload = gsisBuildLabelPayload_(payload);
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
  return withWriteLock_(function() {
    ensureHeaderRow_(getTransactionSpreadsheet_(), BOOKING_CONFIG.SHEET, BOOKING_HEADERS);
    return true;
  });
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

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 15).getValues();
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row[1] !== 'BOOKED' && row[1] !== 'COLLECTED') {
      continue;
    }
    var rowDate = readDayKey_(row[6]);
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
  if (normaliseText_(request.clientRequestId)) {
    var batch = createBookingBatch_(Object.assign({}, request, { bookings: [{}] }));
    return Object.assign({}, batch.bookings[0], { alreadyRecorded: Boolean(batch.alreadyRecorded) });
  }
  var prepared = prepareBooking_(request);
  var sheet = getRequiredSheet_(getTransactionSpreadsheet_(), BOOKING_CONFIG.SHEET);
  var writes = [];
  queueNewRows_(writes, sheet, sheet.getLastRow() + 1, [prepared.row]);
  queueBookingNotificationIntents_(writes, [prepared]);
  commitSurgicalUpdates_(writes);
  finishPreparedBooking_(prepared);
  return prepared.result;
}

function finishPreparedBooking_(prepared) {
  finishPreparedBookings_([prepared]);
}

function finishPreparedBookings_(prepared) {
  // The Sheet commit is authoritative. Maintenance failures must not tell a
  // teacher to submit a booking that was already recorded.
  var entries = [], dates = Object.create(null);
  prepared.forEach(function(entry) {
    var date = entry.result.date;
    if (!dates[date]) {
      dates[date] = true;
      try { clearBookingDayCache_(date); }
      catch (error) { noteMaintenanceFailure_('booking_cache', error); }
    }
    entries.push({ kind: 'booking_email', payload: entry.emailTask }, { kind: 'event', payload: entry.eventTask });
  });
  queueSecondaryTasks_(entries);
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
  var rows = measureBackendPhase_('bookingReadMs', function() {
    var lastRow = sheet.getLastRow();
    return lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, BOOKING_HEADERS.length).getValues();
  });
  var batchHash = hashBookingValue_(requestId + '|' + normaliseText_(request.authEmail).toLowerCase() + '|' + normaliseText_(request.authSub), bookingTokenPepper_()).slice(0, 20).toUpperCase();
  var ids = items.map(function(item, index) { return 'BOOK-B' + batchHash + '-' + (index + 1); });
  var existing = rows.filter(function(row) { return ids.indexOf(String(row[0])) !== -1; });
  if (existing.length && existing.length !== items.length) throw new Error('An earlier batch is incomplete. Ask the administrator to check it before retrying.');
  if (existing.length && gsisEnabled_()) return gsisRecoverBookingBatch_(request,items,ids,existing);
  var periodOrder = getPeriodOrder_();
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
  queueBookingNotificationIntents_(updates, prepared);
  // One atomic request commits every new row or none. doPost holds the shared
  // write lock during the read, conflict checks and this commit.
  commitSurgicalUpdates_(updates);
  finishPreparedBookings_(prepared);
  return { bookings: prepared.map(function(entry) { return entry.result; }), count: prepared.length };
}

function prepareBooking_(request, options) {
  request = gsisPrepareReferenceRequest_(request);
  options = options || {};
  var authenticatedAdmin = isAuthenticatedAdmin_(request);
  var requestedBookFor = normaliseText_(request.bookingForTtbName);
  var teacher = requiredText_(authenticatedAdmin && requestedBookFor ? requestedBookFor : (request.authTtbName || request.teacher), 'Teacher');
  var ownerGspsEmail = getGspsEmailForTtbName_(teacher);
  var isOnBehalfBooking = authenticatedAdmin && requestedBookFor &&
    teacher !== normaliseText_(request.authTtbName);

  if (isOnBehalfBooking && !ownerGspsEmail) throw new Error('The booked-for teacher needs a valid GSPS address in Contacts column D.');

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
  return { row: row, result: result, emailTask: bookingEmailTask, eventTask: bookingEventTask, gsisBinding:gsisEnabled_() ? request.gsisBinding : null };
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
  request = gsisPrepareReferenceRequest_(request,row.values);

  var originalDate = Utilities.formatDate(new Date(row.values[6]), BOOKING_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  var newTeacher = requiredText_(request.teacher || row.values[2], 'Teacher');
  var fallbackEmail = isBookingOwner_(row.values, request) ? normaliseText_(request.authEmail) : normaliseText_(row.values[25]);
  var newEmails = gsisEnabled_() && !request.teacherStaffId ? gsisBookingOwnerEmails_(row.values) : getBookingNotificationEmails_(newTeacher, fallbackEmail);
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
  if (newTeacher !== row.values[2] || gsisEnabled_() && request.teacherStaffId) {
    values[24] = '';
    values[25] = getGspsEmailForTtbName_(newTeacher);
    values[26] = newTeacher;
  }

  if (gsisEnabled_()) {
    var updates = [], events = getRequiredSheet_(getTransactionSpreadsheet_(), LORD_CONFIG.SHEETS.EVENTS);
    queueChangedRow_(updates,row.sheet,row.rowNumber,row.values,values);
    queueNewRows_(updates,events,events.getLastRow()+1,[[Utilities.getUuid(),values[0],'GSIS_REFERENCE_BOUND',now,normaliseText_(request.authEmail),JSON.stringify(request.gsisBinding)]]);
    commitSurgicalUpdates_(updates);
  } else writeChangedRow_(row.sheet, row.rowNumber, row.values, values);
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
  var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
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

    var rowDate = readDayKey_(row[6]);

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
    ctx.bookingContactRows = gsisContactRows_();
    if (!ctx.bookingContactRows) {
      var spreadsheet = getTransactionSpreadsheet_();
      var sheet = getRequiredSheet_(spreadsheet, BOOKING_CONFIG.CONTACTS_SHEET);
      var lastRow = sheet.getLastRow();
      ctx.bookingContactRows = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, 8).getDisplayValues();
    }
  }
  var rows = ctx.bookingContactRows;
  var key = String(name).trim().toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === key) {
      // Notification addresses never authorize sign-in or booking ownership.
      var candidates = [String(rows[i][3] || '').trim(), String(rows[i][2] || '').trim()];
      var seen = {};
      var output = [];
      for (var j = 0; j < candidates.length; j++) {
        var email = candidates[j].toLowerCase();
        if (email && !seen[email] && (j === 0 ? /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gsps\.edu\.sg$/i : /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@schools\.gov\.sg$/i).test(email)) {
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
    maintenanceWarning: getLORDMaintenanceStatus_(),
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
    var contact = gsisEnabled_() ? gsisContactLinkByEmail_(row[17]) : contacts[contactKey] || {};
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
  var gsis = gsisSnapshot_();
  var cacheKey = 'lord_v3_overlord_contacts' + suiteCacheSuffix_() + (gsis ? '_' + gsis.key : '');
  var cached = executionContext_().forceRefresh ? null : cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (ignore) {}
  }

  var sheet = gsis ? null : getRequiredSheet_(spreadsheet, 'contacts');
  var map = {};
  if (sheet && sheet.getLastRow() < 2) {
    cache.put(cacheKey, '{}', OVERLORD_CONFIG.CONTACT_CACHE_SECONDS);
    return map;
  }

  var rows = gsisContactRows_() || sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getDisplayValues();
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
    var telegramReady = telegramConfigured_();
    if (!telegramReady && !whatsAppConfig_().ready) return;

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
      if (!overdue) continue;
      try { queueWhatsAppOverdue_(movement); }
      catch (whatsappError) { noteMaintenanceFailure_('whatsapp_queue', whatsappError); }
      if (!telegramReady || notified[movement.sessionId]) continue;

      try {
        var proposedReceipt = Object.assign({}, notified);
        proposedReceipt[movement.sessionId] = new Date().toISOString();
        assertRuntimePropertyCapacity_(properties, OVERLORD_CONFIG.TELEGRAM_NOTIFIED_PROPERTY, JSON.stringify(proposedReceipt), true);
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
      setBoundedRuntimeProperty_(properties, OVERLORD_CONFIG.TELEGRAM_NOTIFIED_PROPERTY, JSON.stringify(notified), null, true);
      changed = false;
    }

    if (changed) {
      setBoundedRuntimeProperty_(properties, OVERLORD_CONFIG.TELEGRAM_NOTIFIED_PROPERTY, JSON.stringify(notified), null, true);
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
  var lock = scriptWriteLock_();
  if (!lock.tryLock(1500)) return false;
  try {
    var properties = PropertiesService.getScriptProperties();
    if (properties.getProperty(OVERLORD_CONFIG.MONITOR_BUCKET_PROPERTY) === bucket) {
      return false;
    }
    setBoundedRuntimeProperty_(properties, OVERLORD_CONFIG.MONITOR_BUCKET_PROPERTY, bucket, null, true);
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
    var contact = gsisEnabled_() ? gsisContactLinkByEmail_(row[17]) : contacts[contactKey] || {};
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

  var lock = scriptWriteLock_();
  if (!lock.tryLock(3000)) {
    // Alert delivery is more important than audit batching. Preserve both old
    // and new pending events for the next monitor invocation.
    setBoundedRuntimeProperty_(properties, OVERLORD_CONFIG.PENDING_ALERT_EVENTS_PROPERTY, JSON.stringify(combined), null, true);
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
        setBoundedRuntimeProperty_(properties, OVERLORD_CONFIG.PENDING_ALERT_EVENTS_PROPERTY, JSON.stringify(combined), null, true);
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
  var lock = scriptWriteLock_();
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
    queueWhatsAppForceClose_(result, now);
    if (result.alertText) {
      try { setBoundedRuntimeProperty_(properties, OVERLORD_CONFIG.FORCE_RETURN_PENDING_ALERT_PROPERTY, JSON.stringify({date:localDate,text:result.alertText}), null, true); }
      catch (error) { noteMaintenanceFailure_('force_return_alert', error); }
    }
    try { setBoundedRuntimeProperty_(properties, OVERLORD_CONFIG.FORCE_RETURN_SWEEP_DATE_PROPERTY, localDate, null, true); }
    catch (error) { noteMaintenanceFailure_('force_return_checkpoint', error); }
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

  // Custody changes, audit and durable notification intent commit together.
  // Background delivery can recover this intent even when Properties is full.
  if (forced.length) {
    eventRows.push([Utilities.getUuid(), '', 'WHATSAPP_FORCE_CLOSE_PENDING', now, 'SYSTEM',
      JSON.stringify(whatsAppForceCloseIntent_({ sessions: forced, count: forced.length }, now))]);
  }
  queueNewRows_(sweepRequests, eventSheet, eventSheet.getLastRow() + 1, eventRows);
  commitSurgicalUpdates_(sweepRequests);
  var clearedDates = {};
  forced.forEach(function(item) {
    var dateKey = item.booking && bookingBySession[item.sessionId] ? bookingBySession[item.sessionId].dateKey : '';
    if (dateKey && !clearedDates[dateKey]) { clearBookingDayCache_(dateKey); clearedDates[dateKey] = true; }
  });

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
  var result;
  var lock = scriptWriteLock_();
  lock.waitLock(30000);
  try {
    result = forceReturnAllOpenSessions_(new Date());
    if (result.alertText) {
      var properties = PropertiesService.getScriptProperties();
      try { setBoundedRuntimeProperty_(properties, OVERLORD_CONFIG.FORCE_RETURN_PENDING_ALERT_PROPERTY, JSON.stringify({date:Utilities.formatDate(new Date(), LORD_CONFIG.TIME_ZONE, 'yyyy-MM-dd'),text:result.alertText}), null, true); }
      catch (error) { noteMaintenanceFailure_('force_return_alert', error); }
      queueWhatsAppForceClose_(result, new Date());
    }
    Logger.log(JSON.stringify(result, null, 2));
  } finally {
    lock.releaseLock();
  }
  retryPendingForceReturnAlert_(PropertiesService.getScriptProperties());
  return result;
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
  var token = lordSetting_('LORD_TELEGRAM_BOT_TOKEN');
  var chat = lordSetting_('LORD_TELEGRAM_CHAT_ID');
  var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  var response;
  try { response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: chat,
      text: text,
      disable_web_page_preview: true
    }),
    muteHttpExceptions: true
  }); } catch (error) {
    // UrlFetch exceptions can contain the bot-token-bearing URL.
    throw new Error('Telegram request failed. Check its Script Properties and connection.');
  }

  if (response.getResponseCode() >= 300) {
    throw new Error('Telegram request failed with HTTP ' + response.getResponseCode() + '.');
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
  var nextPeriodId = 'REIGN-' + Utilities.getUuid();
  var marker = [nextPeriodId, '', 'REIGN_PERIOD_CLOSED', generatedAt,
    normaliseText_(request.authTtbName || request.authEmail || 'Administrator'), JSON.stringify({
      periodId: nextPeriodId, closedPeriodId: currentCompliancePeriod_().id,
      periodStart: preview.periodStart, periodEnd: preview.periodEnd,
      archivedAt: generatedAt.toISOString(), archivedByEmail: normaliseText_(request.authEmail),
      archivedBySub: normaliseText_(request.authSub), rowCounts: preview.rowCounts,
      preservedRowCounts: preview.preservedRowCounts, cutoffDate: preview.cutoffDate,
      compliance: complianceTotals_(complianceIncidents_()),
      archiveFiles: archive.files.map(function(x) { return { name: x.name, id: x.id, url: x.url }; })
    })];
  clearReignTransactionalRows_(snapshot.spreadsheet, snapshot, marker);
  delete executionContext_().complianceEvents;

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
  var eventTypeIndex = reignHeaderIndex_(e.headers, 'Event Type');
  var archiveEvents = [], preserveEvents = [];
  e.rows.forEach(function(row) {
    var ref = esi >= 0 ? String(row[esi] || '') : '';
    var future = eti >= 0 ? reignIsFuture_(row[eti], cutoff) : null;
    var recentNotification = eventTypeIndex >= 0 && row[eventTypeIndex] === 'WHATSAPP_FORCE_CLOSE_PENDING' && eti >= 0 &&
      new Date(row[eti]).getTime() > Date.now() - 24 * 60 * 60 * 1000;
    var type = eventTypeIndex >= 0 ? row[eventTypeIndex] : '';
    if (/^EVIDENCE_UPLOAD_/.test(type)) {
      var upload;try { upload=JSON.parse(row[5]); }catch(ignore) {}
      if (type==='EVIDENCE_UPLOAD_PENDING' || !validEvidenceManifest_(upload) || type!=='EVIDENCE_UPLOAD_'+upload.status || Date.now()-Number(upload.completedAt || upload.closedAt || upload.createdAt)<8*86400000) { preserveEvents.push(row);return; }
    }
    if (type === 'COMPLIANCE_INCIDENT' || type === 'COMPLIANCE_RESOLVED') { archiveEvents.push(row); return; }
    if (type === 'REIGN_PERIOD_CLOSED' || type === 'WHATSAPP_TEACHER_CONSENT' || (type === 'WHATSAPP_BOOKING_PENDING' && new Date(row[eti]).getTime() > Date.now() - 86400000) || recentNotification || (ref && (preservedBookingIds[ref] || preservedSessionIds[ref])) || future !== false) preserveEvents.push(row);
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
    compliance: complianceFromEvents_(snapshot.sheets[LORD_CONFIG.SHEETS.EVENTS].rows, currentCompliancePeriod_()),
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
  if (s.compliance) {
    lines.push('## Logging incidents', '', 'Period ID: ' + s.compliance.period.id,
      'Collection omissions: ' + s.compliance.collection + '; return omissions: ' + s.compliance.return + '; total: ' + s.compliance.total + '; affected bookings: ' + s.compliance.affectedBookings, '');
    s.compliance.incidents.forEach(function(item) { lines.push('- ' + item.incidentId + ' | ' + item.teacher + ' | ' + item.resource + ' | ' + item.date + ' ' + item.start + ' to ' + item.end + ' | ' + item.phase + ' | ' + item.recordedAt + ' | ' + item.status); });
    lines.push('');
  }
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
  if (s.compliance) cards.splice(cards.length - 1, 0, ['Logging incidents', String(s.compliance.total), s.compliance.collection + ' collection omissions · ' + s.compliance.return + ' return omissions across ' + s.compliance.affectedBookings + ' bookings. Reviewed incidents remain counted. Details are retained in the Markdown and JSON archives.']);
  var sections = cards.map(function (c, i) { return '<section class="slide s' + (i % 5) + '"><div class="eyebrow">' + c[0] + '</div><div class="big">' + c[1] + '</div><p>' + c[2] + '</p><div class="counter">' + (i + 1) + ' / ' + cards.length + '</div></section>'; }).join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LORD Wrapped ' + p.periodStart + ' to ' + p.periodEnd + '</title><style>' +
    '*{box-sizing:border-box}html{scroll-snap-type:y mandatory;scroll-behavior:smooth}body{margin:0;font-family:Inter,Arial,sans-serif;background:#0d1830;color:#fff}.slide{min-height:100vh;scroll-snap-align:start;display:flex;flex-direction:column;justify-content:center;padding:9vw;position:relative;overflow:hidden}.slide:after{content:"";position:absolute;width:55vw;height:55vw;border-radius:50%;filter:blur(1px);opacity:.22;right:-15vw;bottom:-20vw;background:#fff}.s0{background:linear-gradient(135deg,#173b79,#091b3b)}.s1{background:linear-gradient(135deg,#7a3946,#28101a)}.s2{background:linear-gradient(135deg,#c07b33,#613714)}.s3{background:linear-gradient(135deg,#173b79,#7a3946)}.s4{background:linear-gradient(135deg,#7a3946,#c07b33)}.eyebrow{font-size:clamp(16px,2vw,28px);font-weight:700;text-transform:uppercase;letter-spacing:.14em;opacity:.78}.big{font-size:clamp(54px,11vw,156px);font-weight:900;line-height:.9;letter-spacing:-.055em;margin:28px 0;max-width:1000px}.slide p{font-size:clamp(20px,3vw,42px);line-height:1.2;max-width:850px;margin:0;opacity:.9}.counter{position:absolute;right:3vw;bottom:3vw;font-weight:700;opacity:.65}@media print{html{scroll-snap-type:none}.slide{page-break-after:always;min-height:100vh}}' +
    '</style></head><body>' + sections + '<script>document.addEventListener("keydown",function(e){var h=innerHeight;if(e.key==="ArrowDown"||e.key==="PageDown"||e.key===" ")scrollBy({top:h,behavior:"smooth"});if(e.key==="ArrowUp"||e.key==="PageUp")scrollBy({top:-h,behavior:"smooth"})});</script></body></html>';
}
function reignHtmlEscape_(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function clearReignTransactionalRows_(spreadsheet, snapshot, marker) {
  var requests = [];
  REIGN_CONFIG.TRANSACTION_SHEETS.forEach(function(name) {
    var data = snapshot.sheets[name], sheet = getRequiredSheet_(spreadsheet, name);
    var output = data.preservedRows.slice();
    if (name === LORD_CONFIG.SHEETS.EVENTS && marker) output.push(marker);
    var count = Math.max(Number(data.originalDataRowCount || 0), output.length);
    var width = Math.max(1, Number(data.lastCol || data.headers.length || 1));
    if (!count) return;
    var readable = Math.min(count, sheet.getMaxRows() - 1);
    var before = readable ? sheet.getRange(2, 1, readable, width).getValues() : [];
    for (var r = 0; r < count; r++) {
      var after = Array(width).fill('');
      if (output[r]) output[r].forEach(function(value, col) { if (col < width) after[col] = value; });
      if (r + 2 > sheet.getMaxRows()) queueNewRows_(requests, sheet, r + 2, [after]);
      else queueChangedRow_(requests, sheet, r + 2, before[r], after);
    }
  });
  commitSurgicalUpdates_(requests);
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
    .getRange(2, 1, bookingSheet.getLastRow() - 1, gsisEnabled_() ? BOOKING_HEADERS.length : 21)
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
    var currentPerson = gsisEnabled_() ? gsisBookingPerson_(row) : null;
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
      teacherStatutoryName: gsisEnabled_() ? currentPerson && currentPerson.statutoryName || ttbName : statutoryNames[ttbName.toLowerCase()] || ttbName,
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
  var gsisRows = gsisContactRows_(), sheet = gsisRows ? null : getRequiredSheet_(spreadsheet, 'contacts');
  var map = {};
  if (sheet && sheet.getLastRow() < 2) return map;

  var rows = gsisRows || sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues();
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
  resetExecutionContext_();
  return withWriteLock_(function() {
    var spreadsheet = getTransactionSpreadsheet_();
    var specs = transactionSchemaV17_();
    // Validate the entire set before any missing sheet is created.
    specs.forEach(function(spec) { assertSetupHeaderV17_(spreadsheet, spec[0], spec[1]); });
    specs.forEach(function(spec) { ensureHeaderRow_(spreadsheet, spec[0], spec[1]); });
    assertSessionSchema_(spreadsheet);
    Logger.log('LORD schema verified. Existing headers and data were preserved.');
    return true;
  });
}

function ensureHeaderRow_(spreadsheet, sheetName, headers) {
  assertSetupHeaderV17_(spreadsheet, sheetName, headers);
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
  if (sheet.getLastRow() > 0) return sheet;
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

function identityLookup_(email, googleSub) {
  var normalizedEmail = normaliseText_(email).toLowerCase();
  if (!normalizedEmail || !/@gsps\.edu\.sg$/i.test(normalizedEmail)) {
    return { found: false, ttbName: '', email: normalizedEmail, isAdmin: false };
  }

  var spreadsheet = getTransactionSpreadsheet_();
  var gsisRows = gsisContactRows_(), contacts = gsisRows ? null : getRequiredSheet_(spreadsheet, LORD_AUTH_CONFIG.CONTACTS_SHEET);
  var ttbName = '';

  if (gsisRows || contacts.getLastRow() >= 2) {
    var contactRows = gsisRows || contacts.getRange(2, 1, contacts.getLastRow() - 1, 8).getDisplayValues();
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
    adminRecord = withWriteLock_(function() {
      delete executionContext_().adminsByEmail[normalizedEmail];
      var current = findAdminByEmail_(normalizedEmail);
      if (current && current.active && !current.googleSub) {
        current.sheet.getRange(current.rowNumber, 6).setValue(googleSub);
        SpreadsheetApp.flush();
        current.googleSub = googleSub;
      }
      return current;
    });
  }

  return {
    found: true,
    ttbName: ttbName,
    email: normalizedEmail,
    isAdmin: Boolean(adminRecord && adminRecord.active && (!adminRecord.googleSub || adminRecord.googleSub === googleSub)),
    role: adminRecord && adminRecord.active && (!adminRecord.googleSub || adminRecord.googleSub === googleSub) ? adminRecord.role : '',
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

/* v1.7 administration: the existing admins/contacts columns remain unchanged. */
var LORD_WA_OPT_IN = '[LORD-WA:agreed]';

function requireLiveAdmin_(request) {
  executionContext_().adminsByEmail = Object.create(null);
  var admin = findAdminByEmail_(normaliseText_(request.authEmail).toLowerCase());
  if (!isAuthenticatedAdmin_(request) || !request.authSub || !admin.googleSub || admin.googleSub !== request.authSub) {
    throw new Error('An active administrator must sign in again to manage settings.');
  }
  return admin;
}

function adminContacts_() {
  var ctx = executionContext_();
  if (ctx.adminContacts) return ctx.adminContacts;
  var rows = gsisContactRows_();
  if (!rows) {
    var sheet = getRequiredSheet_(getTransactionSpreadsheet_(), LORD_AUTH_CONFIG.CONTACTS_SHEET);
    rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getDisplayValues();
  }
  var contacts = Object.create(null);
  rows.forEach(function(row) {
    var email = normaliseText_(row[3]).toLowerCase();
    if (!/^[^\s@]+@gsps\.edu\.sg$/.test(email)) return;
    // Ambiguous identity rows must be corrected in Contacts, never guessed.
    if (Object.prototype.hasOwnProperty.call(contacts, email)) { contacts[email] = null; return; }
    contacts[email] = { email: email, name: normaliseText_(row[0]) || normaliseText_(row[4]), mobile: whatsAppPhone_(row[5]) };
  });
  ctx.adminContacts = contacts;
  return contacts;
}

function whatsAppPhone_(value) {
  var raw = String(value || '').trim();
  if (!/^[+\d ()-]+$/.test(raw)) return '';
  var digits = raw.replace(/\D/g, '');
  if (/^[89]\d{7}$/.test(digits)) digits = '65' + digits;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : '';
}

function adminDirectory_() {
  var sheet = getRequiredSheet_(getTransactionSpreadsheet_(), LORD_AUTH_CONFIG.ADMINS_SHEET);
  var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, ADMIN_HEADERS.length).getDisplayValues();
  var contacts = adminContacts_();
  return rows.map(function(row) {
    var email = normaliseText_(row[0]).toLowerCase();
    var contact = contacts[email];
    return { email: email, name: normaliseText_(row[1]), active: /^(yes|true|active|1)$/i.test(normaliseText_(row[2])),
      role: normaliseText_(row[3]) || 'Admin', mobile: contact ? contact.mobile : '',
      whatsappOptIn: String(row[4]).indexOf(LORD_WA_OPT_IN) !== -1 };
  });
}

function getAdminSettings_(request) {
  requireLiveAdmin_(request);
  var contacts = adminContacts_();
  var config = whatsAppConfig_();
  return { admins: adminDirectory_(), contacts: Object.keys(contacts).filter(function(email) { return contacts[email] && contacts[email].name; }).map(function(email) { return contacts[email]; }),
    whatsapp: { enabled: config.enabled, ready: config.ready, status: config.ready ? 'Ready for approved templates' : 'Disabled or setup incomplete' } };
}

function grantAdmin_(request) {
  var actor = requireLiveAdmin_(request);
  var email = requiredText_(request.targetEmail, 'Staff email').toLowerCase();
  var contact = adminContacts_()[email];
  if (!contact || !contact.name) throw new Error('Choose a unique staff member from Contacts.');
  // Administrator authorization is independent of messaging consent or mobile readiness.
  var sheet = getRequiredSheet_(getTransactionSpreadsheet_(), LORD_AUTH_CONFIG.ADMINS_SHEET);
  if (adminDirectory_().filter(function(item) { return item.email === email; }).length > 1) throw new Error('Duplicate administrator rows must be corrected in the admins sheet.');
  var existing = findAdminByEmail_(email);
  var before = existing ? sheet.getRange(existing.rowNumber, 1, 1, ADMIN_HEADERS.length).getValues()[0] : ['', '', '', '', '', ''];
  var after = before.slice();
  after[0] = email; after[1] = contact.name; after[2] = 'Yes'; after[3] = after[3] || 'Admin';
  // Preserve historical notification preferences without fabricating personal consent.
  // Never accept a subject from the browser for another user. Preserve any
  // previous binding; a new user is bound by the verified Google sign-in flow.
  var requests = [];
  if (existing) queueChangedRow_(requests, sheet, existing.rowNumber, before, after);
  else queueNewRows_(requests, sheet, sheet.getLastRow() + 1, [after]);
  if (requests.length) {
    var events = getRequiredSheet_(getTransactionSpreadsheet_(), LORD_CONFIG.SHEETS.EVENTS);
    queueNewRows_(requests, events, events.getLastRow() + 1, [[Utilities.getUuid(), '', 'ADMIN_ACCESS_GRANTED', new Date(), actor.email,
      JSON.stringify({ targetEmail: email, schoolManagedNotifications: schoolWhatsAppAgreement_() })]]);
    commitSurgicalUpdates_(requests);
  }
  executionContext_().adminsByEmail = Object.create(null);
  return { email: email, active: true, schoolManagedNotifications: schoolWhatsAppAgreement_(), changed: requests.length > 0 };
}

function suiteCacheSuffix_() {
  var ctx = executionContext_();
  if (ctx.suiteCacheSuffix === undefined) {
    var revision = PropertiesService.getScriptProperties().getProperty('LORD_SUITE_DATA_REVISION');
    ctx.suiteCacheSuffix = revision ? '_' + revision : '';
  }
  return ctx.suiteCacheSuffix;
}

function refreshSuiteData_(request) {
  requireLiveAdmin_(request);
  var ctx = executionContext_();
  var revision = Utilities.getUuid();
  // Populate the new generation first. A failed read leaves the previous
  // generation authoritative. No authentication or write receipts are removed.
  ctx.suiteCacheSuffix = '_' + revision;
  ctx.forceRefresh = true;
  delete ctx.referenceData;
  var reference = getReferenceData_();
  getOverlordContacts_(getTransactionSpreadsheet_());
  setBoundedRuntimeProperty_(PropertiesService.getScriptProperties(), 'LORD_SUITE_DATA_REVISION', revision, null, true);
  return { reference: reference, refreshedAt: new Date().toISOString(), propagationSeconds: 120 };
}

function whatsAppConfig_() {
  var p = PropertiesService.getScriptProperties();
  var config = { enabled: p.getProperty('LORD_WA_ENABLED') === 'true', token: p.getProperty('LORD_WA_ACCESS_TOKEN') || '',
    phoneId: p.getProperty('LORD_WA_PHONE_NUMBER_ID') || '', version: p.getProperty('LORD_WA_API_VERSION') || '',
    language: p.getProperty('LORD_WA_LANGUAGE') || 'en', overdue: p.getProperty('LORD_WA_OVERDUE_TEMPLATE') || 'lord_cart_overdue_v18',
    forceClose: p.getProperty('LORD_WA_FORCE_CLOSE_TEMPLATE') || 'lord_force_close_v18' };
  ['bookingSuccess','collectReminder','returnReminder','collectionFollowup','returnFollowup'].forEach(function(kind) {
    config[kind] = p.getProperty('LORD_WA_' + kind.toUpperCase() + '_TEMPLATE') || 'lord_' + kind.replace(/([A-Z])/g, '_$1').toLowerCase() + '_v18';
  });
  config.teacherEnabled = p.getProperty('LORD_WA_TEACHER_ENABLED') === 'true';
  config.followupsEnabled = p.getProperty('LORD_WA_FOLLOWUPS_APPROVED') === 'true';
  config.lordBaseUrl = p.getProperty('LORD_WA_LORD_BASE_URL') || '';
  config.ready = Boolean(config.overdue !== 'lord_cart_overdue_v17' && config.forceClose !== 'lord_force_close_v17' && config.enabled && config.token && /^\d+$/.test(config.phoneId) && /^v\d+\.\d+$/.test(config.version));
  return config;
}

function whatsAppText_(value, limit) {
  return (normaliseText_(value).replace(/\s+/g, ' ') || 'Not recorded').slice(0, limit || 80);
}

function queueWhatsAppOverdue_(movement) {
  if (!whatsAppConfig_().ready) return;
  var b = movement.booking || {};
  // One event per session, independent of the Telegram delivery receipt.
  return withWriteLock_(function() {
    return queueWhatsAppAlert_('overdue:' + movement.sessionId, 'overdue', [movement.resource, b.teacher || b.bookedFor, movement.collector,
      movement.classOrActivity, movement.subject, (b.startTime || '?') + ' to ' + (b.endTime || '?'), movement.loanTimestamp,
      String(movement.deviceTotal), teacherContactLink_(b.bookingId)], movement.sessionId);
  }, 3000);
}

function whatsAppForceCloseIntent_(result, now) {
  var ids = result.sessions.map(function(item) { return item.sessionId; }).sort();
  var summary = result.sessions.map(function(item) { return item.resource + ' / ' + item.collector; }).join('; ');
  return { eventKey: 'force:' + ids.join(','), createdAt: now.getTime(), values: [String(result.count), formatDate_(now), summary.slice(0, 300)] };
}

function queueWhatsAppForceClose_(result, now) {
  try {
    if (!result.count || !whatsAppConfig_().ready) return;
    var intent = whatsAppForceCloseIntent_(result, now);
    return queueWhatsAppAlert_(intent.eventKey, 'forceClose', intent.values, '', intent.createdAt);
  } catch (error) { noteMaintenanceFailure_('whatsapp_queue', error); }
}

function recoverWhatsAppForceClose_() {
  // Only matched intent rows cross the Sheets boundary, newest first. Stop at
  // the 24-hour delivery cutoff; REIGN row compaction cannot invalidate an ID.
  var sheet = getRequiredSheet_(getTransactionSpreadsheet_(), LORD_CONFIG.SHEETS.EVENTS);
  if (sheet.getLastRow() < 2) return;
  var matches = sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).createTextFinder('WHATSAPP_FORCE_CLOSE_PENDING').matchEntireCell(true).findAll();
  matches.sort(function(a, b) { return b.getRow() - a.getRow(); });
  for (var i = 0; i < matches.length; i++) {
    var row = sheet.getRange(matches[i].getRow(), 1, 1, EVENT_HEADERS.length).getValues()[0];
    var intent = JSON.parse(row[5]);
    if (Date.now() - intent.createdAt > 24 * 60 * 60 * 1000) break;
    queueWhatsAppAlert_(intent.eventKey, 'forceClose', intent.values, '', intent.createdAt);
  }
}

function queueWhatsAppAlert_(eventKey, templateKind, values, sessionId, createdAt) {
  try {
    var props = PropertiesService.getScriptProperties();
    var key = LORD_SECONDARY.PREFIX + 'WA_' + hashBookingValue_(eventKey, '');
    if (props.getProperty(key)) return true;
    var recipientSet = Object.create(null);
    adminDirectory_().forEach(function(admin) { if (admin.active && contactHasConsent_(admin, admin.whatsappOptIn)) recipientSet[admin.email] = true; });
    var recipients = Object.keys(recipientSet);
    if (!recipients.length) return false;
    var all = props.getProperties();
    if (pruneSecondaryTasks_(props, all).length >= LORD_SECONDARY.MAX_ITEMS) throw new Error('WhatsApp background queue is full.');
    var task = { kind: 'whatsapp_alert', createdAt: createdAt || Date.now(), payload: { templateKind: templateKind, sessionId: sessionId,
      values: values.map(function(value) { return whatsAppText_(value, templateKind === 'forceClose' ? 300 : 60); }), remaining: recipients } };
    setBoundedRuntimeProperty_(props, key, JSON.stringify(task), all);
    return true;
  } catch (error) { noteMaintenanceFailure_('whatsapp_queue', error); return false; }
}

function checkpointWhatsAppSend_(task, email, clear) {
  return withRuntimePropertyLock_(function() {
    var props = PropertiesService.getScriptProperties(), raw = props.getProperty(task._key);
    var current = raw ? JSON.parse(raw) : null;
    if (!current || current.leaseToken !== task.leaseToken) throw new Error('WhatsApp delivery claim changed.');
    if (clear) delete current.payload.deliveryPending;
    else {
      if (current.payload.deliveryPending) throw new Error('A WhatsApp delivery outcome is uncertain. Administrator reconciliation is required before retrying.');
      current.payload.deliveryPending = {email:email,startedAt:Date.now()};
    }
    setBoundedRuntimeProperty_(props, task._key, JSON.stringify(current));
  });
}

function deliverWhatsAppAlert_(task) {
  if (task.payload.audience === 'teacher') return deliverTeacherWhatsApp_(task);
  var props = PropertiesService.getScriptProperties();
  if (task.payload.pendingAudit) withWriteLock_(function() { flushWhatsAppAudit_(task, props); }, 3000);
  if (!task.payload.remaining.length) return;
  var config = whatsAppConfig_();
  if (!config.ready) throw new Error('WhatsApp delivery is disabled or setup is incomplete.');
  // Operational notifications expire after a day; never send a week-old alert
  // when credentials are repaired. Completed receipts still prevent duplicates.
  if (Date.now() - task.createdAt > 24 * 60 * 60 * 1000) {
    noteMaintenanceFailure_('whatsapp_expired', new Error('An operational WhatsApp alert expired after 24 hours. Check notification setup.'));
    return;
  }
  if (task.payload.sessionId && getSession_(task.payload.sessionId).status !== 'OPEN') return;
  var start = Date.now();
  var attempts = task.payload.remaining.length;
  while (attempts-- > 0) {
    if (Date.now() - start > 45000) throw new Error('WhatsApp delivery will continue on the next queue run.');
    // Revalidate recipients before every send. Revocation/consent removal or a
    // changed Contacts number is respected on the next unsent delivery.
    delete executionContext_().adminContacts;
    var email = task.payload.remaining[0];
    var admin = adminDirectory_().filter(function(item) { return item.email === email; })[0];
    var messageId = '', failed = false;
    delete executionContext_().teacherConsents;
    delete executionContext_().v18EventRows;
    var eligible = admin && admin.active && contactHasConsent_(admin, admin.whatsappOptIn);
    if (eligible) checkpointWhatsAppSend_(task, email);
    try {
      if (eligible) messageId = sendWhatsAppTemplate_(config, admin.mobile, task.payload.templateKind, task.payload.values);
    } catch (sendError) {
      noteMaintenanceFailure_('whatsapp_retry', sendError, null, task);
      if (!sendError.definitiveNonacceptance) throw sendError;
      failed = true;
    }
    var lock = scriptWriteLock_();
    lock.waitLock(3000);
    try {
      var raw = props.getProperty(task._key);
      var current = raw ? JSON.parse(raw) : null;
      if (!current || current.leaseToken !== task.leaseToken) throw new Error('WhatsApp delivery claim changed.');
      task.payload.remaining.shift();
      if (failed) task.payload.remaining.push(email);
      current.payload.remaining = task.payload.remaining;
      delete current.payload.deliveryPending;
      if (messageId) current.payload.pendingAudit = { email: email, messageId: messageId };
      setBoundedRuntimeProperty_(props, task._key, JSON.stringify(current));
      flushWhatsAppAudit_(current, props);
    } finally { lock.releaseLock(); }
  }
  if (task.payload.remaining.length) throw new Error('Some WhatsApp recipients will be retried independently.');
}

function flushWhatsAppAudit_(task, props) {
  var accepted = task.payload.pendingAudit;
  if (!accepted) return;
  appendEvent_({ spreadsheet: getTransactionSpreadsheet_(), eventId: 'WA-' + hashBookingValue_(task._key + accepted.email, ''),
    sessionId: task.payload.sessionId, eventType: 'WHATSAPP_ALERT_ACCEPTED', teacher: accepted.email,
    payload: { template: task.payload.templateKind, messageId: accepted.messageId } });
  SpreadsheetApp.flush();
  task.evidence = task.evidence || [];
  if (!task.evidence.some(function(e) { return e.email === accepted.email && e.messageId === accepted.messageId; })) task.evidence.push({email:accepted.email,messageId:accepted.messageId,acceptedAt:Date.now()});
  delete task.payload.pendingAudit;
  setBoundedRuntimeProperty_(props, task._key, JSON.stringify(task));
}

function sendWhatsAppTemplate_(config, phone, kind, values, buttonSuffix) {
  gsisRequireFreshContacts_();
  var components = [{ type: 'body', parameters: values.map(function(value) { return { type: 'text', text: value }; }) }];
  if (buttonSuffix) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: buttonSuffix }] });
  var response = UrlFetchApp.fetch('https://graph.facebook.com/' + config.version + '/' + config.phoneId + '/messages', {
    method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + config.token }, muteHttpExceptions: true,
    payload: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: phone, type: 'template',
      template: { name: config[kind], language: { code: config.language }, components: components } })
  });
  var payload;
  try { payload = JSON.parse(response.getContentText()); } catch (ignore) { payload = {}; }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !payload.messages || !payload.messages[0] || !payload.messages[0].id) {
    // No response body, access token or recipient number enters logs/errors.
    var rejection = new Error('WhatsApp request failed (HTTP ' + response.getResponseCode() + ', code ' + Number(payload.error && payload.error.code || 0) + ').');
    rejection.definitiveNonacceptance = response.getResponseCode() >= 400 && response.getResponseCode() < 500 && response.getResponseCode() !== 408 && Boolean(payload.error);
    throw rejection;
  }
  return payload.messages[0].id; // Acceptance is not a delivered/read receipt.
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
  if (ctx.referenceData) return gsisPublicReference_(ctx.referenceData);
  var cache = CacheService.getScriptCache();
  var gsis = gsisSnapshot_();
  var referenceKey = LORD_REFERENCE_CONFIG.CACHE_KEY + suiteCacheSuffix_() + (gsis ? '_' + gsis.key : '');
  var cached = ctx.forceRefresh ? null : cache.get(referenceKey);

  if (cached) {
    if (ctx.requestMetrics) ctx.requestMetrics.referenceCache = 'hit';
    ctx.referenceData = JSON.parse(cached);
    return gsisPublicReference_(ctx.referenceData);
  }

  if (ctx.requestMetrics) ctx.requestMetrics.referenceCache = ctx.forceRefresh ? 'forced' : 'miss';
  var spreadsheet = getReferenceSpreadsheet_();

  var trolleys = readReferenceTrolleys_(
    spreadsheet,
    LORD_REFERENCE_CONFIG.SHEETS.trolleys
  );

  var data = {
    teachers: gsis ? gsis.contacts.people.filter(function(p) { return p.active; }).map(function(p) { return p.name; }) : readReferenceSingleColumn_(
      spreadsheet,
      LORD_REFERENCE_CONFIG.SHEETS.teachers
    ),
    classes: gsis ? gsis.deploy.classes.concat(gsis.deploy.teachingGroups, gsis.activities).map(function(p) { return p.name; }).filter(function(v,i,a) { return a.indexOf(v) === i; }) : readReferenceSingleColumn_(
      spreadsheet,
      LORD_REFERENCE_CONFIG.SHEETS.classes
    ),
    subjects: gsis ? gsis.deploy.subjects.map(function(p) { return p.name; }) : readReferenceSingleColumn_(
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
    referenceKey,
    JSON.stringify(data),
    LORD_REFERENCE_CONFIG.CACHE_SECONDS
  );

  return gsisPublicReference_(data);
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
  CacheService.getScriptCache().remove(LORD_REFERENCE_CONFIG.CACHE_KEY + suiteCacheSuffix_());
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
  if (key === 'GSIS_SECRET') return true;
  if (LORD_CONFIGURATION_PROPERTIES.indexOf(key) >= 0) return true;
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
    configurationPropertiesRequired: true,
    configurationKeys: keys.filter(function(key) { return key === 'GSIS_SECRET' || LORD_CONFIGURATION_PROPERTIES.indexOf(key) >= 0; }),
    currentRuntimeKeys: current,
    legacyKeysSafeToDeleteAfterCutover: legacy,
    unrecognisedKeys: unknown
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function inspectLORDV1Configuration() {
  resetExecutionContext_();
  var configuration = lordConfigurationStatus_();
  if (!configuration.ready) {
    var incomplete = { version: LORD_CONFIG.VERSION, ready: false, configuration: configuration };
    Logger.log(JSON.stringify(incomplete, null, 2));
    return incomplete;
  }
  var triggerHandlers = ScriptApp.getProjectTriggers().map(function(t) {
    return t.getHandlerFunction();
  });

  var result = {
    version: LORD_CONFIG.VERSION,
    ready: true,
    configuration: configuration,
    architecture: 'one Code.gs / one Apps Script web app / two Google Sheets',
    transactionSpreadsheet: getTransactionSpreadsheet_().getName(),
    referenceSpreadsheet: getReferenceSpreadsheet_().getName(),
    sessionSchemaOk: assertSessionSchema_(getTransactionSpreadsheet_()),
    staticConfiguration: {
      embeddedInCodeGs: false,
      scriptPropertiesRequired: true,
      proxySecretEmbedded: false,
      bookingPeppersEmbedded: false,
      telegramEmbedded: false,
      telegramConfigured: telegramConfigured_()
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
  test('proxy secret Script Property configured', function(){ lordGSiSSecret_('LORD_PROXY_SECRET'); return 'configured'; });
  test('existing booking pepper Script Properties configured', function(){ lordSetting_('LORD_BOOKING_TOKEN_PEPPER'); lordSetting_('LORD_BOOKING_CODE_PEPPER'); return 'configured; retain existing values'; });
  test('optional Telegram configuration', function(){ return telegramConfigured_() ? 'configured' : 'not configured; Telegram alerts disabled'; });
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

// v1.7 entry points; existing saved maintenance selections remain valid.
function selfTestLORDV16() { return selfTestLORDV1(); }
function inspectLORDV16Configuration() { return inspectLORDV1Configuration(); }

/* v1.7 maintainer entry points. Never called by an HTTP route. */
function transactionSchemaV17_() {
  return [
    [LORD_CONFIG.SHEETS.SESSIONS, SESSION_HEADERS],
    [LORD_CONFIG.SHEETS.TROLLEYS, TROLLEY_HEADERS],
    [LORD_CONFIG.SHEETS.EVENTS, EVENT_HEADERS],
    [BOOKING_CONFIG.SHEET, BOOKING_HEADERS],
    [LORD_AUTH_CONFIG.ADMINS_SHEET, ADMIN_HEADERS]
  ];
}

function assertSetupHeaderV17_(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet || sheet.getLastRow() === 0) return;
  if (sheet.getMaxColumns() < headers.length) throw new Error('Setup stopped: ' + name + ' has too few columns. Restore or reconcile its schema from a backup.');
  var actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(actual[i]) !== headers[i]) throw new Error('Setup stopped: ' + name + ' header mismatch at column ' + (i + 1) + '. Existing data was not relabelled. Reconcile from a backup before retrying.');
  }
}

function createLORDV17Schema() {
  resetExecutionContext_();
  return withWriteLock_(function() {
    var transaction = getTransactionSpreadsheet_();
    var reference = getReferenceSpreadsheet_();
    if (transaction.getId() === reference.getId()) throw new Error('Use separate transaction and reference workbooks.');
    var specs = transactionSchemaV17_();
    specs.forEach(function(spec) { assertSetupHeaderV17_(transaction, spec[0], spec[1]); });
    // Runtime readers use positions on reference/contacts tabs. Existing labels
    // may differ; preserve all existing content and seed only empty tabs.
    var seeds = [
      [transaction, LORD_CONFIG.SHEETS.CONTACTS, ['TTB Name', 'Reserved B', 'Schools Email', 'GSPS Email', 'Display Name', 'Mobile', 'Reserved G', 'WhatsApp Link']],
      [reference, LORD_REFERENCE_CONFIG.SHEETS.trolleys, ['Trolley', 'Qty Per Trolley', 'Cart', 'Type', 'Stylus Option', 'Headphone Option']],
      [reference, LORD_REFERENCE_CONFIG.SHEETS.timetable, ['Period #', 'Start Time', 'End Time']]
    ];
    // Verify both workbooks and folders before creating any schema.
    getPhotoRootFolder_().getName();
    getReignArchiveFolder_().getName();
    if (transaction.getSpreadsheetTimeZone() !== LORD_CONFIG.TIME_ZONE || reference.getSpreadsheetTimeZone() !== LORD_CONFIG.TIME_ZONE) throw new Error('Set both workbook time zones to ' + LORD_CONFIG.TIME_ZONE + ' before setup.');
    specs.forEach(function(spec) { ensureHeaderRow_(transaction, spec[0], spec[1]); });
    seeds.forEach(function(spec) {
      var sheet = spec[0].getSheetByName(spec[1]);
      if (!sheet || sheet.getLastRow() === 0) ensureHeaderRow_(spec[0], spec[1], spec[2]);
    });
    ['teachers', 'classes', 'subjects'].forEach(function(key) {
      var name = LORD_REFERENCE_CONFIG.SHEETS[key];
      if (!reference.getSheetByName(name)) reference.insertSheet(name);
    });
    SpreadsheetApp.flush();
    return { ok: true, next: 'Populate the reference lists, contacts and admins using FIRST_TIME_SETUP.md, then run selfTestLORDV17(). No sample users, bookings or triggers were created.' };
  });
}

function inspectLORDV17Configuration() { return inspectLORDV1Configuration(); }
function selfTestLORDV17() {
  var output = selfTestLORDV16();
  var checks = [
    ['All transaction headers exact', function() {
      var ss = getTransactionSpreadsheet_();
      transactionSchemaV17_().forEach(function(spec) {
        if (getRequiredSheet_(ss, spec[0]).getLastRow() === 0) throw new Error('Missing header row: ' + spec[0]);
        assertSetupHeaderV17_(ss, spec[0], spec[1]);
      });
    }],
    ['Photo and archive folders readable', function() { getPhotoRootFolder_().getName(); getReignArchiveFolder_().getName(); }]
  ];
  checks.forEach(function(check) {
    try { check[1](); output.tests.push({ name: check[0], ok: true }); }
    catch (error) { output.tests.push({ name: check[0], ok: false, error: getErrorMessage_(error) }); }
  });
  output.total = output.tests.length;
  output.failed = output.tests.filter(function(test) { return !test.ok; }).length;
  output.passed = output.total - output.failed;
  Logger.log(JSON.stringify(output, null, 2));
  return output;
}

/* v1.8.1 UAT: booking responses, consent and period-scoped incident records.
 * All authoritative mutations below run under the existing ScriptLock.
 * Event Log headers remain unchanged; payloads carry the additional domain data.
 */
function eventRowsOfType_(type) {
  var ctx = executionContext_();
  if (!ctx.v18EventRows) ctx.v18EventRows = {};
  if (!ctx.v18EventRows[type]) {
    var sheet = getRequiredSheet_(getTransactionSpreadsheet_(), LORD_CONFIG.SHEETS.EVENTS), rows = [];
    var matches = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 3, sheet.getLastRow() - 1, 1)
      .createTextFinder(type).matchEntireCell(true).findAll().map(function(match) { return match.getRow(); }).sort(function(a,b) { return a-b; });
    for (var i = 0; i < matches.length;) {
      var first = matches[i], last = first; i++;
      while (i < matches.length && matches[i] === last + 1) last = matches[i++];
      rows = rows.concat(sheet.getRange(first, 1, last - first + 1, EVENT_HEADERS.length).getValues());
    }
    ctx.v18EventRows[type] = rows;
  }
  return ctx.v18EventRows[type];
}
function complianceTotals_(data) {
  return { period: data.period, collection: data.collection, return: data.return, total: data.total, affectedBookings: data.affectedBookings };
}
function complianceSummary_() {
  var cache = CacheService.getScriptCache(), key = 'LORD_V18_COMPLIANCE_SUMMARY', saved = cache.get(key);
  if (saved) { try { return JSON.parse(saved); } catch (ignore) {} }
  var totals = complianceTotals_(complianceIncidents_());
  try { cache.put(key, JSON.stringify(totals), 30); } catch (ignore) {}
  return totals;
}

function eventPayload_(row) {
  try { return JSON.parse(row[5]); } catch (error) { throw new Error('An audit record cannot be read. Ask the administrator to reconcile it.'); }
}
function eventRowById_(id) {
  var sheet = getRequiredSheet_(getTransactionSpreadsheet_(), LORD_CONFIG.SHEETS.EVENTS);
  var row = findRowByValue_(sheet, 1, id);
  return row ? sheet.getRange(row, 1, 1, EVENT_HEADERS.length).getValues()[0] : null;
}
function queueEventRow_(requests, row) {
  var sheet = getRequiredSheet_(getTransactionSpreadsheet_(), LORD_CONFIG.SHEETS.EVENTS);
  queueNewRows_(requests, sheet, sheet.getLastRow() + 1, [row]);
}
function currentCompliancePeriod_() {
  var markers = eventRowsOfType_('REIGN_PERIOD_CLOSED');
  if (!markers.length) return { id: 'INITIAL', startedAt: '', label: 'Since initial setup' };
  var row = markers[markers.length - 1], p = eventPayload_(row);
  return { id: p.periodId || String(row[0]), startedAt: p.archivedAt || new Date(row[3]).toISOString(), label: 'Since last REIGN close' };
}
function complianceFromEvents_(rows, period) {
  var incidents = {}, resolutions = {};
  rows.forEach(function(row) {
    if (row[2] === 'COMPLIANCE_RESOLVED') { var p = eventPayload_(row); resolutions[p.incidentId] = p; }
    if (row[2] === 'COMPLIANCE_INCIDENT') {
      var p = eventPayload_(row);
      if (p.periodId === period.id) incidents[row[0]] = Object.assign({}, p, { incidentId: row[0], recordedAt: new Date(row[3]).toISOString() });
    }
  });
  var items = Object.keys(incidents).map(function(id) {
    var item = incidents[id]; item.resolution = resolutions[id] || null; item.status = item.resolution ? 'Reviewed' : 'Recorded'; return item;
  }).sort(function(a,b) { return b.recordedAt.localeCompare(a.recordedAt); });
  var bookings = {};
  items.forEach(function(item) { bookings[item.bookingId] = true; });
  return { period: period, collection: items.filter(function(x) { return x.phase === 'collection'; }).length,
    return: items.filter(function(x) { return x.phase === 'return'; }).length, total: items.length,
    affectedBookings: Object.keys(bookings).length, incidents: items, historicalReviews: Object.keys(resolutions).filter(function(id) { return !incidents[id] && resolutions[id].periodId === period.id; }).map(function(id) { return resolutions[id]; }) };
}
function complianceIncidents_() {
  return complianceFromEvents_(eventRowsOfType_('COMPLIANCE_INCIDENT').concat(eventRowsOfType_('COMPLIANCE_RESOLVED')), currentCompliancePeriod_());
}
function resolveComplianceIncident_(request) {
  var actor = requireLiveAdmin_(request), id = requiredText_(request.incidentId, 'Incident');
  var row = eventRowById_(id), archived = null;
  if (!row) { archived = findArchivedRecord_(id, LORD_CONFIG.SHEETS.EVENTS); row = archived && archived.values; }
  if (!row || row[2] !== 'COMPLIANCE_INCIDENT') throw new Error('Incident was not found in the current log or a retained REIGN archive.');
  var note = requiredText_(request.note, 'Review note').slice(0, 500);
  var receipt = 'REVIEW-' + hashBookingValue_(id + '|' + actor.email + '|' + note, '');
  if (!eventRowById_(receipt)) {
    var writes = [];
    queueEventRow_(writes, [receipt, row[1], 'COMPLIANCE_RESOLVED', new Date(), actor.email,
      JSON.stringify({ incidentId: id, note: note, reviewedBy: actor.email, reviewedAt: new Date().toISOString(), periodId: currentCompliancePeriod_().id, archivePeriod: archived ? archived.archivePeriod : '' })]);
    commitSurgicalUpdates_(writes);
  }
  return { incidentId: id, status: 'Reviewed', retained: true };
}
function requireStaffContact_(request) {
  var email = normaliseText_(request.authEmail).toLowerCase();
  if (!request.authSub || request.authIdentityType === 'RELIEF' || !/^[^\s@]+@gsps\.edu\.sg$/.test(email)) throw new Error('Sign in with your verified GSPS account.');
  var contact = adminContacts_()[email];
  if (!contact) throw new Error('A unique Contacts record is required.');
  return contact;
}
function teacherConsent_(email) {
  var ctx = executionContext_();
  if (!ctx.teacherConsents) {
    ctx.teacherConsents = {};
    eventRowsOfType_('WHATSAPP_TEACHER_CONSENT').forEach(function(row) { var p = eventPayload_(row); ctx.teacherConsents[p.email] = p; });
  }
  return ctx.teacherConsents[email] || null;
}

function schoolWhatsAppAgreement_() {
  var agreement = null;
  try {
    agreement = JSON.parse(PropertiesService.getScriptProperties().getProperty('LORD_WA_SCHOOL_AGREEMENT') || 'null');
  } catch (ignore) {}
  return Boolean(agreement && agreement.enabled === true && agreement.scope === 'school_operations' && normaliseText_(agreement.reference));
}
function contactHasConsent_(contact, existingAdminAgreement) {
  if (!contact || !contact.mobile) return false;
  if (schoolWhatsAppAgreement_()) return true;
  var consent = teacherConsent_(contact.email);
  if (consent && consent.enabled === false) return false;
  if (existingAdminAgreement === true) return true;
  return Boolean(consent && consent.enabled === true && consent.phoneHash === hashBookingValue_(contact.mobile, ''));
}

/** Editor-only setup: records the owner's existing school-wide agreement. */
function enableLORDSchoolWhatsAppAgreement() {
  var agreement = {
    enabled: true,
    scope: 'school_operations',
    reference: 'School-wide staff WhatsApp agreement for all operations; confirmed by LORD owner on 18 October 2026.',
    recordedAt: new Date().toISOString()
  };
  setBoundedRuntimeProperty_(PropertiesService.getScriptProperties(), 'LORD_WA_SCHOOL_AGREEMENT', JSON.stringify(agreement));
  Logger.log('School agreement recorded. Operational notifications are school-managed; individual approval and opt-out do not apply.');
}
function notificationPreferences_(request) {
  var contact = requireStaffContact_(request), config = whatsAppConfig_();
  return { enabled: contactHasConsent_(contact), schoolManaged: schoolWhatsAppAgreement_(), mobileAvailable: Boolean(contact.mobile),
    maskedMobile: contact.mobile ? '•••• ' + contact.mobile.slice(-4) : '',
    serviceEnabled: Boolean(config.ready && config.teacherEnabled), teacher: contact.name };
}
function saveNotificationPreferences_(request) {
  var contact = requireStaffContact_(request);
  if (schoolWhatsAppAgreement_()) throw new Error('LORD operational WhatsApp notifications are managed under the school agreement.');
  if (typeof request.enabled !== 'boolean') throw new Error('Choose whether to receive WhatsApp notifications.');
  if (request.enabled && (!contact.mobile || request.consentConfirmed !== true)) throw new Error('Confirm your agreement and ask an administrator to add your mobile in Contacts column F.');
  var current = teacherConsent_(contact.email), phoneHash = hashBookingValue_(contact.mobile, '');
  if (!current || current.enabled !== request.enabled || current.phoneHash !== phoneHash) {
    var writes = [];
    queueEventRow_(writes, [Utilities.getUuid(), '', 'WHATSAPP_TEACHER_CONSENT', new Date(), contact.email,
      JSON.stringify({ email: contact.email, enabled: request.enabled, phoneHash: phoneHash, authSub: request.authSub })]);
    commitSurgicalUpdates_(writes);
  }
  return notificationPreferences_(request);
}
function ownedBookingRow_(request) {
  requireStaffContact_(request);
  var bookingId = requiredText_(request.bookingId, 'Booking');
  var row = findBookingRow_(bookingId) || findArchivedRecord_(bookingId, LORD_CONFIG.SHEETS.BOOKINGS);
  // Owner only. Administrator status and possession of an email link do not
  // authorize a declaration on a teacher's behalf.
  if (!row || !isBookingOwner_(row.values, request)) throw new Error('This booking is unavailable for your account. Sign in as the booked-for teacher.');
  return row;
}
function bookingWindow_(b) {
  var periods = getPeriodRecords_();
  var start = periods.filter(function(p) { return p.code === b.startPeriod; })[0];
  var end = periods.filter(function(p) { return p.code === b.endPeriod; })[0];
  if (!start || !end) throw new Error('Booking periods need administrator attention.');
  return { start: new Date(b.date + 'T' + start.start + ':00+08:00').getTime(),
    end: new Date(b.date + 'T' + end.end + ':00+08:00').getTime(), startTime: start.start, endTime: end.end };
}
function bookingActionContext_(request) {
  var row = ownedBookingRow_(request), b = bookingPublic_(row.values), w = bookingWindow_(b);
  if (row.archived) return { booking: b, window: w, archived: true, archivePeriod: row.archivePeriod, canCollect: false, canReturn: false, canDeclareCollection: false, canDeclareReturn: false };
  var session = b.collectedSessionId ? getSession_(b.collectedSessionId) : null;
  var now = Date.now();
  return { booking: b, window: w, session: session, canCollect: b.status === 'BOOKED' && b.date === Utilities.formatDate(new Date(), LORD_CONFIG.TIME_ZONE, 'yyyy-MM-dd'),
    canDeclareCollection: b.status === 'BOOKED' && now >= w.start + 1800000,
    canCollectLater: b.status === 'BOOKED' && now >= w.start + 1800000 && now < w.end,
    canDeclareReturn: Boolean(session && session.status === 'OPEN' && now >= w.end + 1800000),
    canReturn: Boolean(session && session.status === 'OPEN') };
}
function respondToBooking_(request) {
  var found = ownedBookingRow_(request), before = found.values, b = bookingPublic_(before), w = bookingWindow_(b);
  if (found.archived) return recordHistoricalIncident_(found, request);
  var choice = requiredText_(request.response, 'Response'), now = new Date();
  if (request.confirmed !== true) throw new Error('Explicit confirmation is required.');
  if (['cancel','later','collected','returned'].indexOf(choice) === -1) throw new Error('Unknown booking response.');
  var phase = choice === 'returned' ? 'return' : 'collection';
  var incidentId = 'INC-' + hashBookingValue_(b.bookingId + ':' + phase, '');
  if (choice === 'collected' || choice === 'returned') {
    var prior = eventRowById_(incidentId);
    if (prior) {
      var recorded = eventPayload_(prior);
      if (choice === 'returned' && request.sessionId !== recorded.sessionId) throw new Error('The linked loan changed. Refresh the booking.');
      return { bookingId: b.bookingId, sessionId: recorded.sessionId, incidentId: incidentId, status: b.status, alreadyRecorded: true };
    }
  }
  var writes = [], after = before.slice(), sessionId = b.collectedSessionId, actualTrolleys = [], actualQty = 0;
  if (choice === 'cancel' || choice === 'later') {
    if (b.status === 'CANCELLED' && choice === 'cancel' && eventRowById_('RESPONSE-' + hashBookingValue_(b.bookingId + ':cancel', ''))) return { bookingId: b.bookingId, status: 'CANCELLED', response: choice, alreadyRecorded: true };
    if (b.status !== 'BOOKED' || sessionId) throw new Error('This booking is no longer uncollected. Refresh its status.');
    if (choice === 'later' && (now.getTime() < w.start + 1800000 || now.getTime() >= w.end)) throw new Error('Collecting later is available only within this booking window.');
    if (choice === 'cancel') { after[1] = 'CANCELLED'; after[19] = now; after[18] = now; queueChangedRow_(writes, found.sheet, found.rowNumber, before, after); }
    var responseId = 'RESPONSE-' + hashBookingValue_(b.bookingId + ':' + choice, '');
    if (!eventRowById_(responseId)) queueEventRow_(writes, [responseId, b.bookingId, 'BOOKING_TEACHER_RESPONSE', now, request.authEmail,
      JSON.stringify({ bookingId: b.bookingId, response: choice, nonCompliant: false })]);
    commitSurgicalUpdates_(writes); clearBookingDayCache_(b.date);
    return { bookingId: b.bookingId, status: after[1], response: choice };
  }
  var spreadsheet = getTransactionSpreadsheet_();
  assertSessionSchema_(spreadsheet);
  var sessions = getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.SESSIONS);
  if (choice === 'collected') {
    if (b.status !== 'BOOKED' || sessionId || now.getTime() < w.start + 1800000) throw new Error('Collection declaration is not available for this booking.');
    ensureNoOpenLoanForCart_(b.resource, '');
    var refs = getReferenceData_().trolleys.filter(function(t) { return t.group === b.resource; });
    if (!Array.isArray(request.trolleys) || !request.trolleys.length || request.trolleys.length > refs.length) throw new Error('Enter the trolleys actually collected.');
    var names = {};
    sessionId = 'DECL-' + hashBookingValue_(b.bookingId, '').slice(0,20);
    actualTrolleys = request.trolleys.map(function(t, index) {
      var ref = refs.filter(function(r) { return r.name === t.name; })[0];
      if (!ref || names[t.name]) throw new Error('Select each valid trolley once.');
      names[t.name] = true;
      var quantity = requiredInteger_(t.quantity, 'Actual trolley quantity', 0, 200);
      actualQty += quantity;
      return { trolleyRecordId: sessionId + '-' + (index + 1), sequence: index + 1, name: t.name, quantity: quantity, photoFileId: '', photoUrl: '' };
    });
    if (actualQty < 1 || actualQty > 200) throw new Error('Enter between 1 and 200 devices actually collected.');
    var styluses = b.styluses ? requiredInteger_(request.stylusQuantity, 'Actual styluses', 0, 200) : 0;
    var headphones = b.headphones ? requiredInteger_(request.headphoneQuantity, 'Actual headphones', 0, 200) : 0;
    if (styluses > actualQty || headphones > actualQty) throw new Error('Accessory quantities cannot exceed devices actually collected.');
    var row = Array(SESSION_HEADERS.length).fill('');
    row[0] = sessionId; row[1] = 'OPEN'; row[2] = request.authTtbName; row[4] = b.classOrActivity; row[5] = b.subject;
    row[6] = b.resource; row[7] = now; row[9] = actualTrolleys.length; row[10] = actualQty;
    row[12] = 'Collection declared after use; collection photos missing. Timestamp is declaration acceptance.';
    row[14] = now; row[15] = now; row[16] = request.authSub; row[17] = request.authEmail; row[18] = request.authTtbName;
    row[22] = 'GSPS'; row[26] = b.styluses; row[27] = b.headphones; row[28] = styluses; row[31] = headphones;
    queueNewRows_(writes, sessions, sessions.getLastRow() + 1, [row]);
    writePendingCollectionTrolleys_(getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.TROLLEYS), sessionId, actualTrolleys, now, writes);
    after[1] = 'COLLECTED'; after[20] = sessionId;
  } else {
    if (!sessionId || request.sessionId !== sessionId) throw new Error('The linked loan changed. Refresh the booking.');
    var sessionRow = findRowByValue_(sessions, 1, sessionId);
    if (!sessionRow) throw new Error('The linked loan is unavailable.');
    var session = sessions.getRange(sessionRow, 1, 1, SESSION_HEADERS.length).getValues()[0];
    if (session[1] !== 'OPEN' || b.status !== 'COLLECTED' || now.getTime() < w.end + 1800000) throw new Error('Return declaration is not available. The loan may already be closed.');
    var closed = session.slice();
    closed[1] = 'DECLARED RETURNED'; closed[3] = request.authTtbName; closed[8] = now; closed[15] = now;
    closed[13] = 'Teacher declares all devices returned; return photos missing. Quantities and physical arrival are unverified.';
    closed[19] = request.authSub; closed[20] = request.authEmail; closed[21] = request.authTtbName; closed[24] = 'GSPS';
    queueChangedRow_(writes, sessions, sessionRow, session, closed);
    actualQty = Number(session[10]) || 0;
    actualTrolleys = getTrolleyRowsForSession_(getRequiredSheet_(spreadsheet, LORD_CONFIG.SHEETS.TROLLEYS), sessionId)
      .map(function(t) { return { name: t.name, quantity: t.loanQuantity }; });
    after[1] = 'COMPLETED';
  }
  after[18] = now;
  queueChangedRow_(writes, found.sheet, found.rowNumber, before, after);
  var incident = { bookingId: b.bookingId, sessionId: sessionId, phase: phase, periodId: currentCompliancePeriod_().id,
    teacher: b.teacher, teacherEmail: before[25], actor: request.authTtbName, actorEmail: request.authEmail,
    collector: choice === 'returned' ? normaliseText_(session[2]) : request.authTtbName,
    resource: b.resource, date: b.date, start: w.startTime, end: w.endTime, classOrActivity: b.classOrActivity, subject: b.subject,
    requestedQuantity: b.requestedQuantity, collectedQuantity: actualQty, trolleys: actualTrolleys.map(function(t) { return { name: t.name, quantity: t.quantity }; }),
    evidence: 'photos_missing', declaration: choice === 'returned' ? 'All devices already returned; loan closed immediately' : 'Devices already collected and in use',
    acceptedAt: now.toISOString(), status: 'Recorded' };
  queueEventRow_(writes, [incidentId, sessionId, 'COMPLIANCE_INCIDENT', now, request.authEmail, JSON.stringify(incident)]);
  commitSurgicalUpdates_(writes);
  // Cache failure after commit cannot turn a successful declaration into a rejection.
  try { clearBookingDayCache_(b.date); } catch (error) { noteMaintenanceFailure_('booking_cache', error); }
  return { bookingId: b.bookingId, sessionId: sessionId, incidentId: incidentId, status: after[1], resourceReleased: choice === 'returned' };
}
function queueBookingNotificationIntents_(requests, prepared) {
  var sheet = getRequiredSheet_(getTransactionSpreadsheet_(), LORD_CONFIG.SHEETS.EVENTS);
  var rows=[];
  prepared.forEach(function(entry) {
    rows.push(['WA-BOOK-' + entry.row[0], entry.row[0], 'WHATSAPP_BOOKING_PENDING', entry.row[17], entry.row[2],JSON.stringify({ bookingId: entry.row[0], createdAt: entry.row[17].getTime() })]);
    if (entry.gsisBinding) rows.push(['GSIS-BOOK-'+entry.row[0],entry.row[0],'GSIS_REFERENCE_BOUND',entry.row[17],entry.row[25],JSON.stringify(entry.gsisBinding)]);
  });
  queueNewRows_(requests, sheet, sheet.getLastRow() + 1, rows);
}
function bookingTeacherContact_(row) {
  if (gsisEnabled_()) {
    var person = gsisBookingPerson_(row);
    return person ? {email:person.email,name:person.name,mobile:whatsAppPhone_(person.mobile)} : null;
  }
  var email = normaliseText_(row[25]).toLowerCase(), contact = adminContacts_()[email];
  // Do not fall back to the booking creator or a name-only match.
  return contact && contact.name === normaliseText_(row[2]) ? contact : null;
}
function teacherContactLink_(bookingId) {
  var row = bookingId ? findBookingRow_(bookingId) : null;
  var contact = row && bookingTeacherContact_(row.values);
  return contact && contact.mobile ? 'https://wa.me/' + contact.mobile : 'mobile number unavailable; check OVERLORD';
}
function teacherMessageEligible_(kind, row, createdAt) {
  var b = bookingPublic_(row), w = bookingWindow_(b), now = Date.now();
  if (kind === 'bookingSuccess') return ['BOOKED','COLLECTED'].indexOf(b.status) !== -1 && now - createdAt < 86400000 && now < w.end;
  if (kind === 'collectReminder') return b.status === 'BOOKED' && now >= w.start - 300000 && now < w.start;
  if (kind === 'collectionFollowup') return b.status === 'BOOKED' && now >= w.start + 1800000 && now < w.end;
  if (!b.collectedSessionId || b.status !== 'COLLECTED' || getSession_(b.collectedSessionId).status !== 'OPEN') return false;
  if (kind === 'returnReminder') return now >= w.end - 300000 && now < w.end;
  if (kind === 'returnFollowup') return now >= w.end + 1800000 && now < w.end + 86400000;
  return false;
}
function teacherMessageValues_(kind, row) {
  var b = bookingPublic_(row), w = bookingWindow_(b);
  if (kind === 'bookingSuccess') return [b.teacher, b.resource, b.requestedQuantity, b.date, w.startTime, w.endTime, b.classOrActivity];
  var values = [b.teacher, b.resource, b.requestedQuantity, b.classOrActivity, b.subject];
  if (kind === 'collectReminder') values.push(w.startTime);
  return values;
}
function teacherMessageRevision_(row) {
  return hashBookingValue_(JSON.stringify([readDayKey_(row[6]),row[7],row[9],row[10],row[11],row[20]||'',row[25],row[2]]), '').slice(0,24);
}
function queueTeacherMessage_(kind, row, createdAt) {
  var contact = bookingTeacherContact_(row);
  if (!contactHasConsent_(contact)) return false;
  var props = PropertiesService.getScriptProperties(), key = LORD_SECONDARY.PREFIX + 'WA_' + hashBookingValue_('teacher:' + kind + ':' + row[0] + ':' + (kind === 'bookingSuccess' ? 'created' : teacherMessageRevision_(row)), '');
  if (props.getProperty(key)) return true;
  var all = props.getProperties();
  if (pruneSecondaryTasks_(props, all).length >= LORD_SECONDARY.MAX_ITEMS) return false;
  setBoundedRuntimeProperty_(props, key, JSON.stringify({ kind: 'whatsapp_alert', createdAt: createdAt || Date.now(),
    payload: { audience: 'teacher', templateKind: kind, revision: teacherMessageRevision_(row), bookingId: row[0], ownerEmail: contact.email, sessionId: row[20] || '', remaining: [contact.email] } }), all);
  return true;
}
function scheduleTeacherWhatsApp_() {
  var config = whatsAppConfig_();
  if (!config.ready || !config.teacherEnabled || !/^https:\/\/[^/?#]+\/?$/.test(config.lordBaseUrl)) return;
  var sheet = getRequiredSheet_(getTransactionSpreadsheet_(), BOOKING_CONFIG.SHEET);
  var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, BOOKING_HEADERS.length).getValues();
  var pending = {};
  eventRowsOfType_('WHATSAPP_BOOKING_PENDING').forEach(function(row) { var p = eventPayload_(row); if (Date.now() - p.createdAt < 86400000) pending[p.bookingId] = p.createdAt; });
  rows.forEach(function(row) {
    if (['BOOKED','COLLECTED'].indexOf(row[1]) === -1) return;
    var kinds = ['collectReminder','returnReminder'];
    if (pending[row[0]]) kinds.unshift('bookingSuccess');
    if (config.followupsEnabled) kinds = kinds.concat(['collectionFollowup','returnFollowup']);
    kinds.forEach(function(kind) {
      var created = kind === 'bookingSuccess' ? pending[row[0]] : Date.now();
      if (teacherMessageEligible_(kind, row, created)) queueTeacherMessage_(kind, row, created);
    });
  });
}
function deliverTeacherWhatsApp_(task) {
  var props = PropertiesService.getScriptProperties();
  if (task.payload.pendingAudit) withWriteLock_(function() { flushWhatsAppAudit_(task, props); }, 3000);
  if (!task.payload.remaining.length) return;
  var config = whatsAppConfig_(), kind = task.payload.templateKind;
  if (!config.ready || !config.teacherEnabled) throw new Error('Teacher WhatsApp delivery is disabled.');
  if (/Followup$/.test(kind) && !config.followupsEnabled) throw new Error('Follow-up wording is awaiting approval.');
  var found = findBookingRow_(task.payload.bookingId);
  if (!found || !teacherMessageEligible_(kind, found.values, task.createdAt)) return;
  if (kind !== 'bookingSuccess' && task.payload.revision !== teacherMessageRevision_(found.values)) return;
  delete executionContext_().adminContacts;
  delete executionContext_().v18EventRows;
  delete executionContext_().teacherConsents;
  var contact = bookingTeacherContact_(found.values);
  if (!contact || contact.email !== task.payload.ownerEmail || !contactHasConsent_(contact)) return;
  if (task.payload.sessionId && found.values[20] !== task.payload.sessionId) return;
  var flow = { bookingSuccess: 'view', collectReminder: 'collect', returnReminder: 'return', collectionFollowup: 'collection-response', returnFollowup: 'return-response' }[kind];
  var suffix = 'bookingId=' + encodeURIComponent(task.payload.bookingId) + '&flow=' + flow;
  checkpointWhatsAppSend_(task, contact.email);
  var messageId;
  try { messageId = sendWhatsAppTemplate_(config, contact.mobile, kind, teacherMessageValues_(kind, found.values).map(function(v) { return whatsAppText_(v, 160); }), suffix); }
  catch (error) { if (error.definitiveNonacceptance) checkpointWhatsAppSend_(task, contact.email, true); throw error; }
  withWriteLock_(function() {
    var raw = props.getProperty(task._key), current = raw ? JSON.parse(raw) : null;
    if (!current || current.leaseToken !== task.leaseToken) throw new Error('WhatsApp delivery claim changed.');
    current.payload.remaining = []; task.payload.remaining = [];
    delete current.payload.deliveryPending;
    current.payload.pendingAudit = { email: contact.email, messageId: messageId };
    setBoundedRuntimeProperty_(props, task._key, JSON.stringify(current));
    flushWhatsAppAudit_(current, props);
  }, 3000);
}

// Archive lookups are explicit historical actions, never dashboard/monitor work.
// Retained, small REIGN markers are the trusted index; browser-supplied Drive IDs
// cannot select a file. The immutable archive remains the source of old records.
function findArchivedRecord_(id, sheetName) {
  var ctx = executionContext_();
  if (!ctx.archiveLookups) ctx.archiveLookups = {};
  if (!ctx.archiveFiles) ctx.archiveFiles = {};
  var key = sheetName + ':' + id;
  if (Object.prototype.hasOwnProperty.call(ctx.archiveLookups, key)) return ctx.archiveLookups[key];
  if (ctx.historicalCommit) throw new Error('Records changed while this response was being prepared. Retry to load the new archive safely.');
  var markers = eventRowsOfType_('REIGN_PERIOD_CLOSED').slice().reverse();
  for (var i = 0; i < markers.length; i++) {
    var marker = eventPayload_(markers[i]), files = marker.archiveFiles || [];
    var file = files.filter(function(f) { return /_Archive_.*\.json$/.test(f.name); })[0];
    if (!file) continue;
    var payload = ctx.archiveFiles[file.id];
    if (!payload) payload = ctx.archiveFiles[file.id] = JSON.parse(DriveApp.getFileById(file.id).getBlob().getDataAsString());
    if (!payload.provenance || payload.provenance.sourceSpreadsheetId !== LORD_CONFIG.SPREADSHEET_ID) throw new Error('Archive identity does not match this installation.');
    var data = payload.sheets && payload.sheets[sheetName];
    if (!data || !Array.isArray(data.rows)) throw new Error('Archive structure needs administrator attention.');
    var values = data.rows.filter(function(row) { return row[0] === id; })[0];
    if (values) return ctx.archiveLookups[key] = { values: values, archived: true, archivePeriod: marker.closedPeriodId || markers[i][0], archiveFileId: file.id, archiveData: payload };
  }
  ctx.archiveLookups[key] = null;
  return null;
}
function recordHistoricalIncident_(found, request) {
  var phase = request.response === 'historical_collection' ? 'collection' : request.response === 'historical_return' ? 'return' : '';
  if (!phase || request.confirmed !== true) throw new Error('This booking is archived. Use its explicit historical missing-photo action.');
  var b = bookingPublic_(found.values), id = 'INC-' + hashBookingValue_(b.bookingId + ':' + phase, '');
  var oldEvents = found.archiveData.sheets[LORD_CONFIG.SHEETS.EVENTS].rows;
  var prior = eventRowById_(id) || oldEvents.filter(function(row) { return row[0] === id; })[0] || (findArchivedRecord_(id, LORD_CONFIG.SHEETS.EVENTS) || {}).values;
  if (prior) return { bookingId: b.bookingId, incidentId: id, status: b.status, alreadyRecorded: true, historical: true };
  if (phase === 'return' && !b.collectedSessionId) throw new Error('No recorded loan exists for this booking. Record the historical collection omission first or ask the administrator to reconcile custody.');
  var w = bookingWindow_(b), now = new Date(), writes = [];
  var payload = { bookingId: b.bookingId, sessionId: b.collectedSessionId, phase: phase, periodId: currentCompliancePeriod_().id,
    teacher: b.teacher, teacherEmail: found.values[25], actor: request.authTtbName, actorEmail: request.authEmail,
    resource: b.resource, date: b.date, start: w.startTime, end: w.endTime, classOrActivity: b.classOrActivity, subject: b.subject,
    requestedQuantity: b.requestedQuantity, collectedQuantity: null, trolleys: [], evidence: 'photos_missing',
    declaration: 'Historical ' + phase + ' photo omission declared after REIGN; archived custody was not reopened or modified',
    acceptedAt: now.toISOString(), historical: true, archivePeriod: found.archivePeriod, archiveFileId: found.archiveFileId };
  queueEventRow_(writes, [id, b.collectedSessionId || b.bookingId, 'COMPLIANCE_INCIDENT', now, request.authEmail, JSON.stringify(payload)]);
  commitSurgicalUpdates_(writes);
  return { bookingId: b.bookingId, incidentId: id, status: b.status, historical: true };
}

function prepareHistoricalAction_(action, request) {
  if (action === 'bookingrespond' || action === 'incidentresolve') executionContext_().preparedPeriodId = currentCompliancePeriod_().id;
  if (action === 'bookingrespond') {
    var found = ownedBookingRow_(request);
    if (found.archived) {
      ['collection','return'].forEach(function(phase) { findArchivedRecord_('INC-' + hashBookingValue_(request.bookingId + ':' + phase, ''), LORD_CONFIG.SHEETS.EVENTS); });
    }
  } else if (action === 'incidentresolve') {
    requireLiveAdmin_(request);
    if (!eventRowById_(request.incidentId)) findArchivedRecord_(request.incidentId, LORD_CONFIG.SHEETS.EVENTS);
  }
}

/* GSiS reference bridge. Snapshot data is private, immutable and owned by LORD.
 * Only a short pointer and check status live in Script Properties. Data fetches
 * and Drive creation happen outside the transaction lock; publication is fenced.
 */
function gsisError_(code, message) { var error = new Error(message); error.code = code; return error; }
function gsisEnabled_() {
  var ctx=executionContext_();
  if (ctx.gsisEnabled===undefined) ctx.gsisEnabled=PropertiesService.getScriptProperties().getProperty('LORD_GSIS_ENABLED')==='true';
  return ctx.gsisEnabled;
}
function gsisJSON_(raw, fallback) { try { return raw ? JSON.parse(raw) : fallback; } catch (ignore) { throw gsisError_('GSIS_SYNC_UNAVAILABLE', 'GSiS reference metadata needs administrator attention.'); } }
function gsisSnapshot_() {
  var ctx = executionContext_();
  if (Object.prototype.hasOwnProperty.call(ctx, 'gsisSnapshot')) return ctx.gsisSnapshot;
  if (!gsisEnabled_()) return ctx.gsisSnapshot = null;
  var pointer = gsisJSON_(PropertiesService.getScriptProperties().getProperty('LORD_GSIS_SNAPSHOT'), null);
  if (!pointer || !pointer.fileId || !pointer.key) throw gsisError_('GSIS_SYNC_UNAVAILABLE', 'The GSiS reference copy is not ready. Ask an administrator to sync it.');
  return ctx.gsisSnapshot = gsisReadSnapshot_(pointer);
}
function gsisReadSnapshot_(pointer) {
  var cache = CacheService.getScriptCache(), cacheKey = 'lord_gsis_snapshot_' + pointer.key;
  var raw = null, snapshot;
  try { raw=cache.get(cacheKey); } catch (ignore) {}
  function validate(text) {
    raw=text;
    if (!pointer.digest || hashBookingValue_(raw,'') !== pointer.digest) throw new Error('Snapshot content changed');
    snapshot = JSON.parse(raw);
    if (snapshot.schema !== 1 || snapshot.key !== pointer.key || snapshot.installation !== LORD_CONFIG.SPREADSHEET_ID) throw new Error('Invalid snapshot');
    gsisValidateSource_(snapshot.contacts, 'contacts'); gsisValidateSource_(snapshot.deploy, 'deploy');
    if (!Array.isArray(snapshot.activities)) throw new Error('Invalid activities');
    if (gsisSnapshotKey_(snapshot.contacts,snapshot.deploy,snapshot.activities) !== pointer.key) throw new Error('Snapshot generations changed');
    return snapshot;
  }
  if (raw) { try { return validate(raw); } catch (ignore) { try { cache.remove(cacheKey); } catch (ignored) {} } }
  try { validate(DriveApp.getFileById(pointer.fileId).getBlob().getDataAsString()); }
  catch (ignore) { throw gsisError_('GSIS_SYNC_UNAVAILABLE', 'The saved GSiS reference copy could not be read. Ask an administrator to sync it.'); }
  if (raw.length < 90000) { try { cache.put(cacheKey, raw, 21600); } catch (ignore) {} }
  return snapshot;
}
function gsisSourceStatus_(snapshot) {
  var check = gsisJSON_(PropertiesService.getScriptProperties().getProperty('LORD_GSIS_CHECK'), {});
  var at=Date.parse(check.contactsCheckedAt || ''),healthy = check.key === snapshot.key && check.ok === true && isFinite(at) && at<=Date.now() && Date.now()-at<=300000;
  var p=snapshot.deploy.publication,today=Utilities.formatDate(new Date(),LORD_CONFIG.TIME_ZONE,'yyyy-MM-dd');
  return { enabled:true, key:snapshot.key, status:check.ok === false ? 'error' : healthy ? 'healthy' : 'stale',
    lastCheckedAt:check.checkedAt || '', updatedAt:snapshot.deploy.updatedAt || '', syncedAt:snapshot.createdAt,
    publication:{id:p.id,name:p.name || '',revision:p.revision,from:p.from || '',to:p.to || '',updatedAt:p.updatedAt || ''},
    outsidePublishedPeriod:Boolean(p.from && today<p.from || p.to && today>p.to) };
}
function gsisPublicReference_(data) {
  var snapshot = gsisSnapshot_();
  if (!snapshot) return data;
  var publicData = Object.assign({}, data), item = function(p) { return {id:p.id,name:p.name}; };
  publicData.referenceCatalog = {
    teachers:snapshot.contacts.people.filter(function(p) { return p.active; }).map(item).sort(function(a,b) { return a.name.localeCompare(b.name); }),
    classes:snapshot.deploy.classes.map(item), teachingGroups:snapshot.deploy.teachingGroups.map(item),
    subjects:snapshot.deploy.subjects.map(item), activities:snapshot.activities.map(item),
    venues:(snapshot.deploy.venues || []).map(function(v) { return Object.assign({},v); })
  };
  publicData.referenceSource = gsisSourceStatus_(snapshot);
  return publicData;
}
function gsisValidateSource_(data, source) {
  if (!data || data.schema !== 1 || data.source !== source || data.authoritative !== true || typeof data.key !== 'string' || !data.key || data.key.length > 256) throw new Error('Invalid GSiS source manifest.');
  if (!/^[a-f0-9]{64}$/.test(data.key)) throw new Error('Invalid GSiS source key.');
  var lists = source === 'contacts' ? ['people'] : ['classes','subjects','teachingGroups'];
  if (source === 'deploy' && (data.venues !== undefined || data.venueRevision !== undefined)) {
    if (typeof data.venueRevision !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(data.venueRevision)) throw new Error('GSiS venue revision is invalid.');
    lists.push('venues');
  }
  lists.forEach(function(key) {
    if (!Array.isArray(data[key]) || data[key].length > 10000 || (key !== 'teachingGroups' && !data[key].length)) throw new Error('GSiS reference collection is missing or too large.');
    var seen = Object.create(null);
    data[key].forEach(function(p) { if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 256 || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 300 || seen[p.id]) throw new Error('GSiS reference IDs or labels are invalid.'); seen[p.id] = true; });
  });
  if (source === 'contacts') {
    var emails = Object.create(null), names = Object.create(null);
    data.people.forEach(function(p) {
      if (typeof p.active !== 'boolean' || typeof p.email !== 'string' || typeof p.cesEmail !== 'string' || typeof p.statutoryName !== 'string' || typeof p.mobile !== 'string') throw new Error('GSiS Contacts fields are invalid.');
      if (!p.active) return;
      var email = p.email.toLowerCase(), name = p.name.toLowerCase();
      if (email && (!/^[^\s@]+@gsps\.edu\.sg$/.test(email) || emails[email])) throw new Error('GSiS Contacts has ambiguous school identities.');
      if (names[name]) throw new Error('GSiS Contacts has duplicate active timetable names.');
      if (email) emails[email] = true; names[name] = true;
    });
  } else if (!data.publication || !data.publication.id || !data.publication.commit) throw new Error('GSiS has no published deployment.');
  if (source === 'deploy' && data.venues) {
    data.venues.forEach(function(v) {
      if (v.id !== v.unitNumber || !/^[A-Z][0-9]+-[A-Z0-9]+$/.test(v.unitNumber) || typeof v.shortName !== 'string' || typeof v.block !== 'string' || !Number.isInteger(v.level) || v.capacity !== null && (!Number.isSafeInteger(v.capacity) || v.capacity < 0)) throw new Error('GSiS venue metadata is invalid.');
    });
  }
  var digest = source === 'contacts' ? ['lord-contacts-v1',data.people] : data.venueRevision ? ['lord-deploy-v2',data.publication.id,data.publication.revision,data.publication.commit,data.venueRevision] : ['lord-deploy-v1',data.publication.id,data.publication.revision,data.publication.commit];
  if (hashBookingValue_(JSON.stringify(digest),'') !== data.key) throw new Error('The GSiS source generation does not match its data.');
  return data;
}
function gsisFetchSource_(source, previous) {
  var props = PropertiesService.getScriptProperties(), secret = lordGSiSSecret_('LORD_BRIDGE_SECRET', true);
  var url = props.getProperty(source === 'contacts' ? 'LORD_CONTACTS_APPS_SCRIPT_URL' : 'LORD_DEPLOY_APPS_SCRIPT_URL');
  if (!secret || secret.length < 32 || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url || '')) throw new Error('Configure the GSiS bridge URLs and GSIS_SECRET, or the existing LORD_BRIDGE_SECRET, in Script Properties.');
  var input = {operation:'manifest'}; if (previous) input.knownKey=previous.key;
  var payload = JSON.stringify({action:'lordService',service:'gsis-lord-v1',source:source,timestamp:Date.now(),nonce:Utilities.getUuid(),input:input});
  var signature = Utilities.computeHmacSha256Signature(payload,secret).map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  var response = UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify({payload:payload,signature:signature})});
  if (response.getResponseCode() !== 200) throw new Error('The GSiS '+source+' service could not be reached.');
  var parsed; try { parsed = JSON.parse(response.getContentText()); } catch (ignore) { throw new Error('The GSiS '+source+' service returned an invalid response.'); }
  var data = parsed && parsed.ok && parsed.data;
  if (!data || data.source !== source || data.schema !== 1 || data.authoritative !== true || !data.key) throw new Error('The GSiS '+source+' service did not supply an authoritative reference.');
  if (data.unchanged === true) { if (!previous || previous.key !== data.key) throw new Error('The GSiS '+source+' generation does not match the saved copy.'); return previous; }
  return gsisValidateSource_(data,source);
}
function gsisInitialActivities_(deploy) {
  var known = Object.create(null);
  deploy.classes.forEach(function(p) { known[p.name.toLowerCase()]=true; if (p.fullName && p.level) { known[(p.level+' '+p.fullName).toLowerCase()]=true; known[(p.level+p.fullName).toLowerCase()]=true; } });
  deploy.teachingGroups.forEach(function(p) { known[p.name.toLowerCase()] = true; });
  var values = readReferenceSingleColumn_(getReferenceSpreadsheet_(),LORD_REFERENCE_CONFIG.SHEETS.classes).filter(function(name) { return !known[name.toLowerCase()]; });
  // A leftover form-shaped label may belong to an older published year. Require
  // a maintainer's explicit retained-activity list before treating it as local.
  var review = PropertiesService.getScriptProperties().getProperty('LORD_GSIS_LOCAL_ACTIVITIES');
  if (review) { values = gsisJSON_(review,null); if (!Array.isArray(values) || values.some(function(v) { return typeof v !== 'string' || !v.trim() || v.length > 300; })) throw new Error('The reviewed local activity list is invalid.'); }
  else if (values.some(function(v) { return /^[1-6](?:\s+\S|[A-Za-z]{1,3}$)/.test(v); })) throw new Error('Review unmatched form labels before first sync; set LORD_GSIS_LOCAL_ACTIVITIES to the approved JSON activity list.');
  var seen = Object.create(null);
  return values.filter(function(name) { var key=name.toLowerCase(); if (seen[key]) return false; seen[key]=true; return true; }).map(function(name) { return {id:'local-'+hashBookingValue_(name.toLowerCase(),'').slice(0,24),name:name}; });
}
function syncLORDGSiSReferences_(options) {
  options = options || {};
  if (!gsisEnabled_() && !options.allowDisabled) return {enabled:false};
  var referenceLock=function(fn) {
    if (!options.scheduled) return withWriteLock_(fn);
    var lock=scriptWriteLock_();
    if (!lock.tryLock(250)) throw gsisError_('GSIS_SYNC_DEFERRED','Reference sync deferred while another save completes.');
    try { return measureBackendPhase_('lockHeldMs',fn); } finally { lock.releaseLock(); }
  };
  var props=PropertiesService.getScriptProperties(),base='',oldPointer=null,previous=null,attempt=Utilities.getUuid();
  referenceLock(function() {
    var lease=gsisJSON_(props.getProperty('LORD_GSIS_SYNC_LEASE'),null);
    if (lease && Number(lease.expiresAt)>Date.now()) throw gsisError_('GSIS_SYNC_BUSY','A GSiS reference sync is already running. Retry shortly.');
    base=props.getProperty('LORD_GSIS_SNAPSHOT') || '';
    setBoundedRuntimeProperty_(props,'LORD_GSIS_SYNC_LEASE',JSON.stringify({id:attempt,startedAt:Date.now(),expiresAt:Date.now()+120000}),null,true);
  });
  var checkedAt, contacts, deploy, candidate, pointer;
  try {
    oldPointer=gsisJSON_(base,null); previous=oldPointer ? gsisReadSnapshot_(oldPointer) : null;
    var contactsCheckedAt=new Date().toISOString();
    contacts=gsisFetchSource_('contacts',previous && previous.contacts);
    var deployCheckedAt=new Date().toISOString();
    deploy=gsisFetchSource_('deploy',previous && previous.deploy);
    checkedAt=new Date().toISOString();
    var changed=!previous || previous.contacts.key!==contacts.key || previous.deploy.key!==deploy.key;
    if (changed) {
      var activities=previous ? previous.activities : gsisInitialActivities_(deploy);
      var key=gsisSnapshotKey_(contacts,deploy,activities);
      candidate={schema:1,key:key,installation:LORD_CONFIG.SPREADSHEET_ID,createdAt:checkedAt,contacts:contacts,deploy:deploy,activities:activities};
      var folderId=props.getProperty('LORD_GSIS_SNAPSHOT_FOLDER_ID');
      if (!folderId) throw new Error('Configure a private LORD GSiS snapshot folder.');
      var serialized=JSON.stringify(candidate),file=DriveApp.getFolderById(folderId).createFile('LORD_GSiS_'+key+'.json',serialized,'application/json');
      pointer={schema:1,key:key,fileId:file.getId(),digest:hashBookingValue_(serialized,''),createdAt:checkedAt};
    } else pointer=oldPointer;
    referenceLock(function() {
      var lease=gsisJSON_(props.getProperty('LORD_GSIS_SYNC_LEASE'),{});
      if ((props.getProperty('LORD_GSIS_SNAPSHOT') || '') !== base || lease.id!==attempt || Number(lease.expiresAt)<=Date.now()) throw gsisError_('GSIS_SYNC_CHANGED','The GSiS local copy or sync attempt changed. Retry.');
      if (changed) setBoundedRuntimeProperty_(props,'LORD_GSIS_SNAPSHOT',JSON.stringify(pointer),null,true);
      setBoundedRuntimeProperty_(props,'LORD_GSIS_CHECK',JSON.stringify({key:pointer.key,ok:true,checkedAt:checkedAt,contactsCheckedAt:contactsCheckedAt,deployCheckedAt:deployCheckedAt}),null,true);
    });
    delete executionContext_().gsisSnapshot; delete executionContext_().referenceData;
    delete executionContext_().adminContacts; delete executionContext_().bookingContactRows; delete executionContext_().gsisPeopleIndex;
    return {enabled:gsisEnabled_(),changed:changed,key:pointer.key,checkedAt:checkedAt};
  } catch (error) {
    if (error.code !== 'GSIS_SYNC_CHANGED' && error.code !== 'GSIS_SYNC_DEFERRED') {
      try { referenceLock(function() { if ((props.getProperty('LORD_GSIS_SNAPSHOT') || '') === base && gsisJSON_(props.getProperty('LORD_GSIS_SYNC_LEASE'),{}).id===attempt) setBoundedRuntimeProperty_(props,'LORD_GSIS_CHECK',JSON.stringify({key:oldPointer && oldPointer.key || '',ok:false,checkedAt:new Date().toISOString(),code:'SOURCE_CHECK_FAILED'}),null,true); }); } catch (ignore) {}
    }
    throw error;
  } finally {
    try { referenceLock(function() { if (gsisJSON_(props.getProperty('LORD_GSIS_SYNC_LEASE'),{}).id===attempt) props.deleteProperty('LORD_GSIS_SYNC_LEASE'); }); } catch (ignore) {}
  }
}
function gsisSnapshotKey_(contacts,deploy,activities) { return 'gsis-v1-'+hashBookingValue_(JSON.stringify([contacts.key,deploy.key,activities]),'').slice(0,48); }
function syncLORDGSiSReferences() {
  resetExecutionContext_();
  try { return syncLORDGSiSReferences_({scheduled:true}); }
  catch (error) {
    if (['GSIS_SYNC_DEFERRED','GSIS_SYNC_BUSY','GSIS_SYNC_CHANGED'].indexOf(error.code)<0) throw error;
    // Retain last successful freshness time. The existing minute trigger retries.
    var result={enabled:gsisEnabled_(),deferred:true,code:error.code};
    console.log(JSON.stringify({event:'lord-reference-sync-deferred',code:error.code}));
    return result;
  }
}
function enableLORDGSiSBridge() {
  resetExecutionContext_(); var result=syncLORDGSiSReferences_({allowDisabled:true});
  var triggers=ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction()==='syncLORDGSiSReferences'; });
  if (!triggers.length) ScriptApp.newTrigger('syncLORDGSiSReferences').timeBased().everyMinutes(1).create();
  setBoundedRuntimeProperty_(PropertiesService.getScriptProperties(),'LORD_GSIS_ENABLED','true',null,true);
  executionContext_().gsisEnabled=true; delete executionContext_().gsisSnapshot;
  return {enabled:true,key:result.key,changed:result.changed};
}
function gsisContactRows_() {
  var s=gsisSnapshot_(); if (!s) return null;
  return s.contacts.people.filter(function(p) { return p.active; }).map(function(p) { var phone=whatsAppPhone_(p.mobile); return [p.name,'',p.cesEmail,p.email,p.statutoryName,phone,'',phone ? 'https://wa.me/'+phone : '']; });
}
function gsisPerson_(email,id) {
  var index=gsisPeopleIndex_(); if (!index) return null;
  var person=id ? index.byId[id] : index.byEmail[String(email||'').toLowerCase()];
  if (!person) throw gsisError_('GSIS_CONTACT_UNAVAILABLE','Choose an active staff member with a unique school email in GSiS Contacts.');
  return person;
}
function gsisRequireFreshContacts_() {
  // Re-read the publication pointer and check status for every provider send,
  // including mode changes after a recipient was resolved by a long queue run.
  var ctx=executionContext_(),props=PropertiesService.getScriptProperties(),enabled=props.getProperty('LORD_GSIS_ENABLED')==='true';
  if (ctx.gsisEnabled!==undefined && ctx.gsisEnabled!==enabled) throw gsisError_('GSIS_CONTACT_UNAVAILABLE','The Contacts source changed during delivery. Retry with the current source.');
  if (!enabled) return;
  var pointer=gsisJSON_(props.getProperty('LORD_GSIS_SNAPSHOT'),{}),check=gsisJSON_(props.getProperty('LORD_GSIS_CHECK'),{});
  var at=Date.parse(check.contactsCheckedAt || '');
  if (!check.ok || check.key!==pointer.key || !isFinite(at) || at>Date.now() || Date.now()-at>300000) throw gsisError_('GSIS_CONTACT_UNAVAILABLE','GSiS Contacts needs a successful recent sync before WhatsApp delivery.');
  var pinned=executionContext_().gsisSnapshot;
  if (pinned && pinned.key!==pointer.key) throw gsisError_('GSIS_CONTACT_UNAVAILABLE','GSiS Contacts changed during delivery. Retry with the current local copy.');
}
function gsisPrepareReferenceRequest_(request,existing) {
  var snapshot=gsisSnapshot_(); if (!snapshot) return request;
  var p=Object.assign({},request),isNew=!existing,teacherChanged=existing && (p.teacherStaffId || p.teacher && p.teacher!==String(existing[2]));
  var classChanged=isNew || p.classRef || p.classOrActivity!==String(existing[4]), subjectChanged=isNew || p.subjectId || p.subjectRef || p.subject!==String(existing[5]);
  if ((isNew || teacherChanged || classChanged || subjectChanged) && p.referenceKey!==snapshot.key) throw gsisError_('GSIS_REFERENCE_CHANGED','The shared school lists changed. Reload the lists and review the selected class, group and subject.');
  var binding={referenceKey:snapshot.key};
  if (isNew) binding.commandDigest=gsisBookingCommandDigest_(request);
  if (classChanged) {
    var ref=p.classRef;
    if (ref && ref.kind==='customActivity') {
      p.classOrActivity=gsisCustomLabel_(ref.name,160);
      binding.classRef={kind:'customActivity',name:p.classOrActivity};
    } else {
      var rows=ref && (ref.kind==='class'?snapshot.deploy.classes:ref.kind==='teachingGroup'?snapshot.deploy.teachingGroups:ref.kind==='activity'?snapshot.activities:null);
      var selected=rows && rows.filter(function(r) { return r.id===ref.id; });
      if (!selected || selected.length!==1) throw gsisError_('GSIS_REFERENCE_INVALID','Choose a current class, teaching group or local activity.');
      p.classOrActivity=selected[0].name; binding.classRef={kind:ref.kind,id:ref.id};
    }
  }
  if (subjectChanged) {
    if (p.subjectRef && p.subjectRef.kind==='customPurpose' && !p.subjectId) {
      p.subject=gsisCustomLabel_(p.subjectRef.name,120);
      binding.subjectRef={kind:'customPurpose',name:p.subject};
    } else {
      var subjects=snapshot.deploy.subjects.filter(function(r) { return r.id===p.subjectId; });
      if (p.subjectRef || subjects.length!==1) throw gsisError_('GSIS_REFERENCE_INVALID','Choose a current subject or enter an explicit other purpose.');
      p.subject=subjects[0].name; binding.subjectId=subjects[0].id;
    }
  }
  if (isNew || teacherChanged) {
    if (p.teacherStaffId && !isAuthenticatedAdmin_(p)) throw gsisError_('GSIS_CONTACT_UNAVAILABLE','Only an administrator may book for another staff member.');
    if (teacherChanged && !p.teacherStaffId) throw gsisError_('GSIS_CONTACT_UNAVAILABLE','Select the new booking owner from the current staff list.');
    var person=gsisPerson_(p.authEmail,p.teacherStaffId),self=gsisPerson_(p.authEmail);
    p.authTtbName=self.name; p.teacher=person.name;
    p.bookingForTtbName=p.teacherStaffId ? person.name : '';
    binding.staffId=person.id;
  }
  p.gsisBinding=binding; return p;
}
function gsisBookingPerson_(row) {
  var index=gsisPeopleIndex_(); if (!index) return null;
  var bindings=gsisBookingBindingIndex_(),staffId=bindings[String(row[0])] || '';
  var email=normaliseText_(row[25]).toLowerCase();
  if (!staffId && !email) return null;
  return (staffId ? index.byId[staffId] : index.byEmail[email]) || null;
}
function gsisBookingOwnerEmails_(row) {
  var person=gsisBookingPerson_(row);
  if (!person) return [];
  return [person.email,person.cesEmail].filter(function(email,index,list) { return email && list.indexOf(email)===index; });
}
function gsisContactLinkByEmail_(email) {
  var index=gsisPeopleIndex_(),person=index && index.byEmail[String(email||'').toLowerCase()];
  var phone=person ? whatsAppPhone_(person.mobile) : '';
  return phone ? {whatsappLink:'https://wa.me/'+phone} : {};
}
function gsisPeopleIndex_() {
  var ctx=executionContext_(),snapshot=gsisSnapshot_(); if (!snapshot) return null;
  if (ctx.gsisPeopleIndex && ctx.gsisPeopleIndex.snapshot===snapshot) return ctx.gsisPeopleIndex;
  var index={snapshot:snapshot,byId:Object.create(null),byEmail:Object.create(null)};
  snapshot.contacts.people.forEach(function(person) {
    if (!person.active) return;
    var email=String(person.email||'').toLowerCase();
    index.byId[person.id]=Object.prototype.hasOwnProperty.call(index.byId,person.id) ? null : person;
    if (email) index.byEmail[email]=Object.prototype.hasOwnProperty.call(index.byEmail,email) ? null : person;
  });
  return ctx.gsisPeopleIndex=index;
}
function gsisBookingBindingIndex_() {
  var ctx=executionContext_(),rows=eventRowsOfType_('GSIS_REFERENCE_BOUND');
  if (!ctx.gsisBookingBindings || ctx.gsisBookingBindings.rows!==rows) {
    var byBooking=Object.create(null);
    rows.forEach(function(row) { var payload=eventPayload_(row); if (payload.staffId) byBooking[String(row[1])]=payload.staffId; });
    // Surgical commits already invalidate v18EventRows. A new array therefore
    // also invalidates this derived index, including partial binding edits.
    ctx.gsisBookingBindings={rows:rows,byBooking:byBooking};
  }
  return ctx.gsisBookingBindings.byBooking;
}
function gsisBookingCommandDigest_(p) {
  // Bind command intent and verified actor, never mutable cookie display/admin
  // enrichment. Current Contacts labels cannot change the identity of a retry.
  var text=function(v) { return normaliseText_(v); };
  return hashBookingValue_(JSON.stringify(['lord-booking-command-v1',text(p.authEmail).toLowerCase(),text(p.authSub),text(p.clientRequestId),
    Array.isArray(p.bookings) ? p.bookings.length : 1,text(p.referenceKey),p.classRef ? [text(p.classRef.kind),text(p.classRef.id),text(p.classRef.name)] : null,text(p.subjectId),p.subjectRef ? [text(p.subjectRef.kind),text(p.subjectRef.name)] : null,text(p.teacherStaffId),
    text(p.date),text(p.resource),text(p.deviceType),Number(p.requestedQuantity),text(p.startPeriod),text(p.endPeriod),
    p.headphones===true || p.headphones==='true',p.styluses===true || p.styluses==='true',text(p.remarks),text(p.overrideReason),text(p.editBaseUrl)]),'');
}
function gsisRecoverBookingBatch_(request,items,ids,existing) {
  var events=eventRowsOfType_('GSIS_REFERENCE_BOUND');
  var bookings=items.map(function(item,index) {
    if (!item || typeof item!=='object' || Array.isArray(item)) throw new Error('Each booking must be an object.');
    var p=Object.assign({},request,item);
    ['authEmail','authSub','authTtbName','authIsAdmin','authIdentityType','authMobile'].forEach(function(key) { p[key]=request[key]; });
    var original=events.filter(function(row) { return row[0]==='GSIS-BOOK-'+ids[index] && row[1]===ids[index]; });
    if (original.length!==1 || eventPayload_(original[0]).commandDigest!==gsisBookingCommandDigest_(p)) throw gsisError_('GSIS_REQUEST_REUSED','This request ID was already used for different booking details. Review the saved booking before submitting again.');
    var row=existing.filter(function(r) { return r[0]===ids[index]; })[0],b=bookingPublic_(row);
    return {bookingId:b.bookingId,status:b.status,resource:b.resource,date:b.date,periodRange:'P'+b.startPeriod+' to P'+b.endPeriod,requestedQuantity:b.requestedQuantity,
      maskedEmail:String(row[3] || '').split(',').filter(Boolean).map(maskBookingEmail_).join(' and '),backTimed:row[21]===true};
  });
  return {bookings:bookings,count:bookings.length,alreadyRecorded:true};
}
function gsisCustomLabel_(value,max) {
  if (typeof value!=='string' || !value.trim() || value.trim().length>max || /[\x00-\x1f]/.test(value)) throw gsisError_('GSIS_REFERENCE_INVALID','Enter a short activity or purpose name.');
  var name=value.trim();
  return name;
}
