/**
 * GSiS Calendar — Apps Script backend
 *
 * Bind this Apps Script project to the NEW Google Sheet.
 *
 * FIRST RUN
 * 1. Enable Advanced Google service Calendar API v3 (Calendar). Sheets v4 is not required.
 * 2. NEW workbook: setupCalendarV2Workbook(). EXISTING workbook: upgradeCalendarToRC19().
 * 3. In Project Settings > Script Properties set your chosen GSIS_SECRET (or retain CALENDAR_PROXY_SECRET until switching).
 * 4. Deploy as Web App:
 *      Execute as: Me
 *      Who has access: Anyone
 *    The Cloudflare Worker is the security boundary; this backend rejects
 *    requests without the matching server transport secret.
 *
 * This setup is intentionally non-destructive: rerunning it ensures sheets,
 * headers, seed data and formatting exist without deleting operational rows.
 */

const CALV2 = Object.freeze({
  VERSION: 'v2 RC1.9', // Retained workbook schema marker; no migration.
  RELEASE_VERSION: '0.9.9',
  TZ: 'Asia/Singapore',
  CACHE_SECONDS: 120,
  DOMAIN: 'gsps.edu.sg',

  SHEETS: {
    SETTINGS: 'Settings',
    YEARS: 'Years',
    LANES: 'Lanes',
    LANE_SCHEDULE: 'LaneSchedule',
    TAGS: 'Tags',
    USERS: 'Users',
    EVENTS: 'Events',
    MUTATIONS: 'MutationLog',
    YEAR_STRUCTURE: 'YearStructure',
    COLOUR_RULES: 'ColourRules',
    MIGRATION: 'MigrationReview',
    AUDIT: 'AuditLog',
    SYNC_LOG: 'SyncLog',
    PDF_LOG: 'PDFLog',
    DAY_NOTES: 'DayNotes'
  },

  HEADERS: {
    Settings: ['Key', 'Value', 'Description'],
    Years: [
      'Year', 'Status', 'ReleasedToTeachers',
      'RamadanStart', 'RamadanEnd',
      'MOEPressReleaseURL', 'MOECalendarURL', 'MUISCalendarURL',
      'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy',
      'ArchivedAt', 'ArchiveSpreadsheetFileId', 'ArchivePdfFileId', 'ArchiveStatsFileId'
    ],
    Lanes: [
      'LaneID', 'Header', 'SortOrder', 'Active',
      'SupportsShift', 'ShiftALabel', 'ShiftBLabel',
      'DefaultWeekday', 'DefaultEventType',
      'DefaultStartTime', 'DefaultEndTime',
      'ShiftADefaultStartTime', 'ShiftADefaultEndTime',
      'ShiftBDefaultStartTime', 'ShiftBDefaultEndTime',
      'SyncToStaffCalendar', 'Notes'
    ],
    LaneSchedule: [
      'LaneID', 'Weekday', 'Enabled',
      'DefaultStartTime', 'DefaultEndTime',
      'ShiftADefaultStartTime', 'ShiftADefaultEndTime',
      'ShiftBDefaultStartTime', 'ShiftBDefaultEndTime'
    ],
    Tags: [
      'Tag', 'Meaning', 'Active', 'SortOrder',
      'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy'
    ],
    Users: [
      'UserAlias', 'DisplayName', 'IsAdmin', 'IsParentPublisher',
      'Active', 'AddedAt', 'AddedBy', 'Notes'
    ],
    Events: [
      'EventID', 'Year', 'Status', 'LaneID', 'ShiftSpan', 'OwnerTag',
      'StaffTitle', 'StaffDescription', 'Location',
      'EventType', 'StartDate', 'EndDate', 'StartTime', 'EndTime',
      'ParentEnabled', 'ParentTitle', 'ParentDescription',
      'StaffCalendarEventId', 'StaffSyncHash', 'StaffSyncState',
      'ParentCalendarEventId', 'ParentSyncHash', 'ParentSyncState',
      'LastSyncedAt',
      'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy', 'DeletedAt', 'LastMutationID', 'VenueID'
    ],
    MutationLog: ['OperationID','UserAlias','Action','PayloadHash','State','EventID','ResultJSON','ErrorJSON','CreatedAt','UpdatedAt'],
    YearStructure: [
      'StructureID', 'Year', 'Kind', 'Label', 'Term', 'Week',
      'StartDate', 'EndDate', 'SyncToStaffCalendar', 'SourceURL', 'Notes',
      'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy', 'DeletedAt'
    ],
    ColourRules: [
      'RuleID', 'Priority', 'RuleType', 'Field', 'Operator', 'Value',
      'FillColour', 'TextColour', 'BorderColour',
      'Active', 'Locked', 'Notes'
    ],
    MigrationReview: [
      'MigrationID', 'SourceYear', 'SourceRow', 'SourceDate', 'SourceColumn', 'RawText',
      'SuggestedTitle', 'SuggestedLaneID', 'SuggestedShiftSpan', 'SuggestedOwnerTag', 'Confidence',
      'Status', 'ResolvedEventID', 'Notes',
      'CreatedAt', 'ResolvedAt', 'ResolvedBy'
    ],
    AuditLog: [
      'AuditID', 'Timestamp', 'UserAlias', 'Action',
      'EntityType', 'EntityID', 'BeforeJSON', 'AfterJSON', 'RequestID'
    ],
    SyncLog: [
      'SyncRunID', 'Timestamp', 'Year', 'UserAlias',
      'StaffCreates', 'StaffUpdates', 'StaffDeletes',
      'ParentCreates', 'ParentUpdates', 'ParentDeletes',
      'Errors', 'DurationMs', 'PdfFileId', 'PdfDownloadURL', 'DetailsJSON'
    ],
    PDFLog: [
      'PDFID', 'Year', 'GeneratedAt', 'GeneratedBy',
      'FileName', 'FileId', 'DirectDownloadURL',
      'DomainShared', 'SyncRunID', 'Notes'
    ],
    DayNotes: [
      'NoteID', 'Year', 'Date', 'Text',
      'CreatedAt', 'CreatedBy', 'UpdatedAt', 'UpdatedBy'
    ]
  },

  DEFAULT_SETTINGS: [
    ['APP_VERSION', 'v2 RC1.9', 'Schema/application version.'],
    ['TIME_ZONE', 'Asia/Singapore', 'Application and calendar time zone.'],
    ['SHARED_DRIVE_FOLDER_ID', '0ABPUxVwrJ6VwUk9PVA', 'Working Google Shared Drive folder.'],
    ['STAFF_CALENDAR_ID', 'c_534c4877626f602ec2729da076e8e86eb50ae681e7fbe689d7ec3a748dd039e1@group.calendar.google.com', 'Staff-wide Google Calendar.'],
    ['PARENT_CALENDAR_ID', 'c_bd7f71bd3604db7999a022fd0d544a6528d43322463bfc05fd80e59dd9f7badf@group.calendar.google.com', 'Parent-only Google Calendar.'],
    ['STAFF_CALENDAR_URL', 'https://calendar.google.com/calendar/u/0?cid=Y181MzRjNDg3NzYyNmY2MDJlYzI3MjlkYTA3NmU4ZTg2ZWI1MGFlNjgxZTdmYmU2ODlkN2VjM2E3NDhkZDAzOWUxQGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20', 'Open/subscription URL for the staff-wide calendar.'],
    ['PARENT_CALENDAR_URL', 'https://calendar.google.com/calendar/u/0?cid=Y19iZDdmNzFiZDM2MDRkYjc5OTlhMDIyZmQwZDU0NGE2NTI4ZDQzMzIyNDYzYmZjMDVmZDgwZTU5ZGQ5ZjdiYWRmQGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20', 'Open/subscription URL for the parent-only calendar.'],
    ['SYNC_DELAY_MS', '500', 'Minimum gap between writes to one Calendar (500 ms floor; conservative GSiS default, not a provider quota guarantee).'],
    ['SYNC_RETRY_COUNT', '3', 'Retries for transient Calendar writes.'],
    ['SYNC_BATCH_SIZE', '5', 'Requested Calendar sync batch size. Calendar caps each browser-to-Apps-Script batch at 5 records for transport safety.'],
    ['WIPE_BATCH_SIZE', '5', 'Requested Calendar wipe batch size. Calendar caps each browser-to-Apps-Script wipe batch at 5 events for transport safety.'],
    ['OPERATION_STALE_HOURS', '6', 'Age after which an abandoned sync/wipe session is stale. Calendar auto-clears stale Sync/Wipe markers before a new Calendar operation; Admin may also clear them from Stable Release Health.'],
    ['SAFETY_SNAPSHOT_RETENTION', '5', 'Number of automatic pre-destructive backend snapshots to retain when cleanup permission allows.'],
    ['MOE_CALENDAR_URL', 'https://www.moe.gov.sg/calendar', 'Authoritative MOE calendar source.'],
    ['MUIS_CALENDAR_URL', 'https://www.muis.gov.sg/resources/islamic-calendar/', 'Authoritative MUIS Islamic calendar source.'],
    ['LEGACY_COE_2026_URL', 'https://docs.google.com/spreadsheets/d/1j-ieRY9Ev8mvBAJKby6BMxvZ7v5nXasOP-YOMxl-S40/edit', 'Legacy GSPS CoE 2026 source used for migration.'],
    ['LEGACY_COE_SHEET_NAME', 'CoE', 'Legacy source tab name.']
  ],

  DEFAULT_LANES: [
    ['planning_notes', 'Planning Notes', 10, 'No', 'No', '', '', 'ANY', 'ALL_DAY', '', '', '', '', '', '', 'No', 'Retired. Planning Notes are stored in DayNotes.'],
    ['day', 'Day', 20, 'Yes', 'No', '', '', 'ANY', 'ALL_DAY', '', '', '', '', '', '', 'Yes', 'Whole-day notices, holidays and structural events.'],
    ['assembly', 'Assembly', 30, 'Yes', 'No', '', '', 'MON', 'TIMED', '07:30', '08:30', '', '', '', '', 'Yes', 'Default Monday morning assembly.'],
    ['ftt', 'FTT', 40, 'Yes', 'No', '', '', 'WED', 'TIMED', '07:30', '08:00', '', '', '', '', 'Yes', 'Default Wednesday morning FTT.'],
    ['cce_ftgp', 'CCE / FTGP', 50, 'Yes', 'No', '', '', 'FRI', 'TIMED', '07:30', '08:30', '', '', '', '', 'Yes', 'Default Friday morning CCE / FTGP.'],
    ['in_curriculum', 'In-Curriculum', 60, 'Yes', 'No', '', '', 'ANY', 'TIMED', '07:30', '13:30', '', '', '', '', 'Yes', 'Default curriculum-day timing.'],
    ['after_school', 'After School', 70, 'Yes', 'Yes', 'PM(i)', 'PM(ii)', 'ANY', 'TIMED', '', '', '14:00', '15:30', '15:30', '17:00', 'Yes', 'One logical lane; shift defaults are configurable.'],
    ['evening', 'Evening', 80, 'Yes', 'No', '', '', 'ANY', 'TIMED', '18:00', '20:00', '', '', '', '', 'Yes', 'Default evening timing.'],
    ['assessments', 'Assessments', 90, 'Yes', 'No', '', '', 'ANY', 'ALL_DAY', '', '', '', '', '', '', 'Yes', 'Assessment events default to all-day; Admin may override.']
  ],

  DEFAULT_TAGS: [
    ['ACM', 'Asian Civilisation Museum'],
    ['CCA', 'Co-Curricular Activities'],
    ['CCE', 'Character and Citizenship Education'],
    ['celeb', 'Celebration in School. Lessons disrupted.'],
    ['CL', 'Chinese Language (c/o MTL)'],
    ['CNY', 'Chinese New Year'],
    ['DSA', 'Direct School Admission (for secondary schools)'],
    ['ECG', 'Education and Career Guidance'],
    ['EL', 'English Language'],
    ['Exam', 'Assessment (Committee)'],
    ['FMA', 'Foundation Mathematics'],
    ['FTGP', 'Form Teacher Guidance Period'],
    ['FTT', 'Form Teacher Time'],
    ['HBL', 'Home-Based Learning'],
    ['hol', 'Holiday (both School and Public)'],
    ['ICT', 'InfoComm Technology'],
    ['IFD', 'International Friendship Day'],
    ['IHC', 'Indian Heritage Centre'],
    ['IP', 'Acad Departments'],
    ['MA', '(Standard) Mathematics'],
    ['MK', 'MOE Kindergarten'],
    ['Mtg', 'Staff Contact Time / Meeting'],
    ['MTL', 'Mother Tongue Language'],
    ['NAPFA', 'National Physical Fitness Award'],
    ['PEA', 'Post-Exam Activities'],
    ['PHE', 'Physical and Health Education'],
    ['P&E', 'Partnerships and Engagement'],
    ['Prelim', 'P6 Preliminary Examination'],
    ['PSG', 'Parent Support Group'],
    ['PSL', 'Peer Support Leaders'],
    ['PSLE', 'Primary School Leaving Examination'],
    ['PSR', 'Peer Support and Relations'],
    ['pvt', 'Protected Vacation Time'],
    ['RHD', 'Racial Harmony Day'],
    ['SAT', 'School Admin Team'],
    ['SC', 'Steering Committee'],
    ['Sci', 'Science'],
    ['SL', 'School Leaders'],
    ['SM', 'Student Management'],
    ['SMC', 'School Management Committee'],
    ['NE/SS', 'National Education and/or Social Studies'],
    ['STM', "Subject Teachers' Meeting"],
    ['SWB', 'Student Well-Being'],
    ['SWC', 'Staff Welfare Comm'],
    ['tbc', '(to be confirmed)'],
    ['term', 'Generated school term / week structure'],
    ['TP', 'Time Practice'],
    ['YH', 'Year Head / Assist Year Head'],
    ['LLP', 'Learn for Life Programme'],
    ['MRL', 'Media Resource Library (Committee)'],
    ['PD', 'Professional Development/ Learning'],
    ['WA', 'Weighted Assessment']
  ],

  DEFAULT_COLOUR_RULES: [
    // Higher priority wins when two matching rules set the same visual property.
    // Today is deliberately a BORDER, so it does not destroy semantic fill colours.
    ['SYS_TODAY', 1000, 'SYSTEM', 'Date', 'EQUALS_TODAY', '', '', '', '#F28C28', 'Yes', 'Yes', 'Today: orange border on screen only; omitted from PDF.'],
    ['SYS_RAMADAN', 900, 'SYSTEM', 'Date', 'IN_RAMADAN_RANGE', '', '#E9DDF5', '#5B347D', '', 'Yes', 'Yes', 'Ramadan: derived from year Ramadan start/end verified against MUIS.'],
    ['SYS_PSLE', 800, 'SYSTEM', 'OwnerTag', 'EQUALS', 'PSLE', '#D9EAD3', '#245B35', '', 'Yes', 'Yes', 'PSLE events: green treatment.'],
    ['SYS_WEEKEND', 100, 'SYSTEM', 'Date', 'IS_WEEKEND', '', '#DEDEDE', '', '', 'Yes', 'Yes', 'Weekend: grey day fill.']
  ]
});


/* =========================
 * SETUP
 * ========================= */

function setupCalendarV2Workbook() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      'setupCalendarV2Workbook() must run from the Apps Script project ' +
      'bound to the target Google Sheet.'
    );
  }

  ss.setSpreadsheetTimeZone(CALV2.TZ);

  try {
    ss.setSpreadsheetLocale('en_SG');
  } catch (err) {}

  // 1. Create/remap each current datastore sheet. This is non-destructive:
  // known older headers are remapped by ensureSheet_; unrelated sheets are
  // left untouched; operational rows are not cleared.
  Object.keys(CALV2.HEADERS)
    .forEach(name => {
      ensureSheet_(
        ss,
        name,
        CALV2.HEADERS[name]
      );
    });

  // 2. Seed application metadata/defaults. seed* helpers only add missing
  // rows; they do not clear user configuration when setup is rerun.
  seedKeyValueRows_(
    ss.getSheetByName(CALV2.SHEETS.SETTINGS),
    CALV2.DEFAULT_SETTINGS
  );

  // APP_VERSION is safe to normalize explicitly because setup is being run
  // against the current source package.
  setSetting_(
    'APP_VERSION',
    CALV2.VERSION,
    'Schema/application version.'
  );

  seedLanes_(
    ss.getSheetByName(CALV2.SHEETS.LANES)
  );

  seedLaneDefaults_(
    ss.getSheetByName(CALV2.SHEETS.LANES)
  );

  // LaneSchedule is the authoritative lane/day availability model.
  // For a blank workbook this produces exactly seven schedule rows per lane.
  seedLaneScheduleFromLegacy_(ss);

  seedTags_(
    ss.getSheetByName(CALV2.SHEETS.TAGS)
  );

  seedColourRules_(
    ss.getSheetByName(CALV2.SHEETS.COLOUR_RULES)
  );

  seedInstallerAsAdmin_(
    ss.getSheetByName(CALV2.SHEETS.USERS)
  );

  // Keep the retired compatibility lane disabled even if setup is rerun on a
  // partially initialized workbook.
  deactivatePlanningNotesLane_();

  // Cosmetic normalization only; does not alter event/business data.
  sortGlossaryAlphabetically_();
  formatWorkbook_(ss);

  invalidateCalendarCaches_();
  SpreadsheetApp.flush();

  // 3. Fail loudly if the resulting workbook cannot serve this application.
  const validation =
    validateRC1_5WorkbookSetup_();

  Logger.log(
    'GSPS Calendar ' +
    CALV2.VERSION +
    ' setup complete. ' +
    JSON.stringify(validation)
  );

  return validation;
}

function validateRC1_5WorkbookSetup_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const errors = [];
  const details = {
    version: '',
    sheetCount: 0,
    laneCount: 0,
    laneScheduleRows: 0,
    tagCount: 0,
    colourRuleCount: 0,
    adminCount: 0,
    years: 0,
    events: 0
  };

  // A. Every current table exists with the exact expected header sequence.
  Object.keys(CALV2.HEADERS)
    .forEach(name => {
      const expected =
        CALV2.HEADERS[name];

      const sheet =
        ss.getSheetByName(name);

      if (!sheet) {
        errors.push(
          'Missing sheet: ' + name
        );
        return;
      }

      details.sheetCount++;

      const actual =
        sheet
          .getRange(
            1,
            1,
            1,
            expected.length
          )
          .getDisplayValues()[0]
          .map(v =>
            String(v || '').trim()
          );

      const exact =
        expected.every(
          (header, index) =>
            actual[index] === header
        );

      if (!exact) {
        errors.push(
          'Header mismatch in sheet: ' +
          name
        );
      }
    });

  // B. Every required Settings key is present.
  const settingsSheet =
    ss.getSheetByName(
      CALV2.SHEETS.SETTINGS
    );

  const settings =
    tableObjects_(settingsSheet);

  const settingsMap = {};

  settings.forEach(row => {
    const key =
      String(row.Key || '').trim();

    if (key) {
      settingsMap[key] =
        String(
          row.Value === undefined
            ? ''
            : row.Value
        );
    }
  });

  CALV2.DEFAULT_SETTINGS
    .forEach(row => {
      const key =
        String(row[0] || '');

      if (
        !Object.prototype
          .hasOwnProperty
          .call(settingsMap, key)
      ) {
        errors.push(
          'Missing Settings key: ' + key
        );
      }
    });

  details.version =
    settingsMap.APP_VERSION || '';

  if (
    details.version !==
    'v2 RC1.9'
  ) {
    errors.push(
      'APP_VERSION must be v2 RC1.9; found "' +
      details.version +
      '".'
    );
  }

  // C. Lanes and LaneSchedule must form a complete normalized weekly model.
  const laneSheet =
    ss.getSheetByName(
      CALV2.SHEETS.LANES
    );

  const scheduleSheet =
    ss.getSheetByName(
      CALV2.SHEETS.LANE_SCHEDULE
    );

  const lanes =
    tableObjects_(laneSheet);

  const schedules =
    tableObjects_(scheduleSheet);

  details.laneCount =
    lanes.length;

  details.laneScheduleRows =
    schedules.length;

  const seenScheduleKeys =
    {};

  schedules.forEach(row => {
    const laneId =
      String(row.LaneID || '').trim();

    const weekday =
      String(row.Weekday || '')
        .trim()
        .toUpperCase();

    const key =
      laneId + '|' + weekday;

    if (seenScheduleKeys[key]) {
      errors.push(
        'Duplicate LaneSchedule row: ' +
        key
      );
    }

    seenScheduleKeys[key] = true;

    if (
      LANE_WEEKDAY_CODES_
        .indexOf(weekday) < 0
    ) {
      errors.push(
        'Invalid LaneSchedule weekday: ' +
        key
      );
    }
  });

  lanes.forEach(lane => {
    const laneId =
      String(lane.LaneID || '').trim();

    LANE_WEEKDAY_CODES_
      .forEach(weekday => {
        const key =
          laneId + '|' + weekday;

        if (!seenScheduleKeys[key]) {
          errors.push(
            'Missing LaneSchedule row: ' +
            key
          );
        }
      });
  });

  // D. Seeded reference data must exist.
  details.tagCount =
    tableObjects_(
      ss.getSheetByName(
        CALV2.SHEETS.TAGS
      )
    ).length;

  if (!details.tagCount) {
    errors.push(
      'Glossary/Tags is empty.'
    );
  }

  details.colourRuleCount =
    tableObjects_(
      ss.getSheetByName(
        CALV2.SHEETS.COLOUR_RULES
      )
    ).length;

  if (!details.colourRuleCount) {
    errors.push(
      'ColourRules is empty.'
    );
  }

  // E. At least one active Admin is required for a usable fresh install.
  const users =
    tableObjects_(
      ss.getSheetByName(
        CALV2.SHEETS.USERS
      )
    );

  details.adminCount =
    users.filter(user =>
      yes_(user.Active) &&
      yes_(user.IsAdmin)
    ).length;

  if (!details.adminCount) {
    errors.push(
      'No active Admin exists in Users. Run setup manually as a ' +
      '@' + CALV2.DOMAIN +
      ' account or add an Admin row before deploying.'
    );
  }

  // F. "Blank slate" operational tables intentionally stay blank.
  details.years =
    tableObjects_(
      ss.getSheetByName(
        CALV2.SHEETS.YEARS
      )
    ).length;

  details.events =
    tableObjects_(
      ss.getSheetByName(
        CALV2.SHEETS.EVENTS
      )
    ).length;

  if (errors.length) {
    throw new Error(
      'Calendar workbook setup validation failed:\n- ' +
      errors.join('\n- ')
    );
  }

  return {
    ok: true,
    version: details.version,
    sheetsReady: details.sheetCount,
    lanesReady: details.laneCount,
    laneScheduleRows: details.laneScheduleRows,
    tagsReady: details.tagCount,
    colourRulesReady: details.colourRuleCount,
    adminsReady: details.adminCount,
    years: details.years,
    events: details.events,
    nextStep:
      details.years
        ? 'Calendar workbook is ready.'
        : 'Create the first Planning Year in Admin > Year Setup.'
  };
}


function ensureSheet_(ss, sheetName, headers) {
  let sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);

  const lastRow = Math.max(sh.getLastRow(), 1);
  const lastCol = Math.max(sh.getLastColumn(), 1);

  // Blank/new sheet.
  const existingHeaders = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0]
    .map(v => String(v || '').trim());
  const isBlank = existingHeaders.every(v => !v);

  if (isBlank) {
    if (sh.getMaxColumns() < headers.length) {
      sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    }
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const populatedExisting = existingHeaders.filter(Boolean);

    // Reject duplicate legacy headers because remapping would be ambiguous.
    const seen = new Set();
    populatedExisting.forEach(h => {
      if (seen.has(h)) throw new Error('Duplicate header "' + h + '" in sheet "' + sheetName + '".');
      seen.add(h);
    });

    // Reject unknown columns rather than silently dropping data.
    const unknown = populatedExisting.filter(h => headers.indexOf(h) < 0);
    if (unknown.length) {
      throw new Error(
        'Schema migration blocked in sheet "' + sheetName +
        '". Unknown existing header(s): ' + unknown.join(', ')
      );
    }

    const exact =
      populatedExisting.length === headers.length &&
      headers.every((h, i) => existingHeaders[i] === h);

    if (!exact) {
      // Read existing rows, remap values by header name, then rewrite the table
      // under the new schema. Backend sheets contain records, not formulas.
      const oldValues = lastRow > 1
        ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues()
        : [];

      const oldIndex = {};
      existingHeaders.forEach((h, i) => {
        if (h) oldIndex[h] = i;
      });

      const remapped = oldValues.map(row =>
        headers.map(h => Object.prototype.hasOwnProperty.call(oldIndex, h) ? row[oldIndex[h]] : '')
      );

      if (sh.getMaxColumns() < headers.length) {
        sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
      }

      sh.clearContents();
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);

      if (remapped.length) {
        sh.getRange(2, 1, remapped.length, headers.length).setValues(remapped);
      }
    }
  }

  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#E9EEF4')
    .setWrap(true);
}

function seedKeyValueRows_(sheet, rows) {
  const data = tableObjects_(sheet);
  const existing = new Set(data.map(r => String(r.Key || '').trim()));
  const missing = rows.filter(r => !existing.has(r[0]));
  if (missing.length) sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, 3).setValues(missing);
}

function seedLanes_(sheet) {
  const data = tableObjects_(sheet);
  const existing = new Set(data.map(r => String(r.LaneID || '').trim()));
  const missing = CALV2.DEFAULT_LANES.filter(r => !existing.has(r[0]));
  if (missing.length) sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, CALV2.HEADERS.Lanes.length).setValues(missing);
}

function seedTags_(sheet) {
  const data = tableObjects_(sheet);
  const existing = new Set(data.map(r => String(r.Tag || '').trim().toLowerCase()));
  const now = isoNow_();
  const installer = installerAlias_();
  const rows = [];
  CALV2.DEFAULT_TAGS.forEach((pair, idx) => {
    if (!existing.has(pair[0].toLowerCase())) {
      rows.push([pair[0], pair[1], 'Yes', (idx + 1) * 10, now, installer, now, installer]);
    }
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, CALV2.HEADERS.Tags.length).setValues(rows);
}

function seedColourRules_(sheet) {
  const data = tableObjects_(sheet);
  const existing = new Set(data.map(r => String(r.RuleID || '').trim()));
  const missing = CALV2.DEFAULT_COLOUR_RULES.filter(r => !existing.has(r[0]));
  if (missing.length) sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, CALV2.HEADERS.ColourRules.length).setValues(missing);
}

function seedInstallerAsAdmin_(sheet) {
  const alias = installerAlias_();

  if (!alias) {
    Logger.log(
      'Initial Admin could not be seeded because neither ActiveUser nor ' +
      'EffectiveUser resolved to @' + CALV2.DOMAIN + '.'
    );
    return;
  }

  const rows = tableObjects_(sheet);

  if (
    rows.some(r =>
      normAlias_(r.UserAlias) === alias
    )
  ) {
    return;
  }

  const activeEmail =
    String(Session.getActiveUser().getEmail() || '').trim();

  const effectiveEmail =
    String(Session.getEffectiveUser().getEmail() || '').trim();

  const email =
    activeEmail || effectiveEmail;

  const display =
    aliasToDisplayName_(alias);

  const now =
    isoNow_();

  sheet.appendRow([
    alias,
    display,
    'Yes',
    'No',
    'Yes',
    now,
    alias,
    'Seeded by setupCalendarV2Workbook() from ' + email
  ]);
}


function deactivatePlanningNotesLane_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.LANES);
  const hit = findRowByKey_(sheet, 'LaneID', 'planning_notes');
  if (hit) {
    updateRowPatch_(sheet, hit.row, {
      Active: 'No',
      SyncToStaffCalendar: 'No',
      Notes: 'Retired in RC0.85. Planning Notes are stored in DayNotes, not Events.'
    });
  }
}


function sortGlossaryAlphabetically_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CALV2.SHEETS.TAGS);
  if (!sheet || sheet.getLastRow() < 2) return;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const tagCol = headers.indexOf('Tag') + 1;
  const activeCol = headers.indexOf('Active') + 1;
  const sortOrderCol = headers.indexOf('SortOrder') + 1;

  if (!tagCol || !activeCol || !sortOrderCol) {
    throw new Error('Glossary sort requires Tag, Active and SortOrder columns.');
  }

  const rowCount = sheet.getLastRow() - 1;
  const colCount = sheet.getLastColumn();

  // Native Sheets sort is safer and faster than clearing/rebuilding the table.
  // "Yes" sorts ahead of "No" when Active is descending.
  sheet.getRange(2, 1, rowCount, colCount).sort([
    { column: activeCol, ascending: false },
    { column: tagCol, ascending: true }
  ]);

  // SortOrder is retained only as a derived compatibility field.
  const sortOrders = Array.from({ length: rowCount }, (_, i) => [(i + 1) * 10]);
  sheet.getRange(2, sortOrderCol, rowCount, 1).setValues(sortOrders);
}

function formatWorkbook_(ss) {
  Object.values(CALV2.SHEETS).forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    sh.getDataRange().setVerticalAlignment('top');
    sh.autoResizeColumns(1, Math.min(sh.getLastColumn(), 10));
  });

  const events = ss.getSheetByName(CALV2.SHEETS.EVENTS);
  if (events) {
    events.setColumnWidths(1, events.getLastColumn(), 130);
    events.setColumnWidth(7, 260);
    events.setColumnWidth(8, 300);
    events.setColumnWidth(16, 260);
    events.setColumnWidth(17, 300);
  }

  const audit = ss.getSheetByName(CALV2.SHEETS.AUDIT);
  if (audit) {
    audit.setColumnWidth(7, 350);
    audit.setColumnWidth(8, 350);
  }
}


/* =========================
 * WEB APP API
 * ========================= */

function doGet(e) {
  return jsonOutput_({
    ok: true,
    service: 'GSPS Shared Calendar v2',
    version: CALV2.RELEASE_VERSION,
    schemaVersion: CALV2.VERSION,
    time: isoNow_()
  });
}

function doPost(e) {
  const requestStarted = Date.now();
  let action = 'unknown';
  let requestId = '';

  try {
    let sourceEnvelope;try{sourceEnvelope=JSON.parse(e?.postData?.contents||'null');}catch(_){}
    if(typeof sourceEnvelope?.payload==='string'){let hint;try{hint=JSON.parse(sourceEnvelope.payload);}catch(_){}if(hint?.action==='venuesSource')return jsonOutput_({ok:true,data:venuesCalendarSource_(sourceEnvelope)});}
    const request = parseRequest_(e);
    verifyProxySecret_(request.proxySecret);
    // Roster may read one date or a bounded batch through the same proxy secret.
    // It cannot impersonate a Google user or mutate Calendar data.
    if (request.service !== undefined) {
      if(request.service==='gsis-calendar-command-v1')return jsonOutput_({ok:true,result:calendarCommandService_(request)});
      if (request.service === 'gsis-calendar-sync-worker-v1' && request.action === 'calendarSyncContinue') {
        const secret = gsisApiSecret_('CALENDAR_SERVICE_SECRET');
        if (!secret || request.calendarServiceSecret !== secret) throw mutationError_('SERVICE_AUTH_REQUIRED', 'Calendar background service is not authorised.', 403, true);
        return jsonOutput_({ok: true, result: apiContinueCalendarSync_()});
      }
      if (request.service !== 'gsis-roster-notifier-v1' || !['rosterDate','rosterDates','rosterWindow','rosterStatisticsCalendar'].includes(request.action)) {
        throw new Error('Calendar service action is not allowed.');
      }
      return jsonOutput_({ ok: true, result: request.action==='rosterStatisticsCalendar'?apiRosterStatisticsCalendar_(request.payload || {}):request.action==='rosterWindow'?apiRosterWindow_(request.payload || {}):request.action==='rosterDates'?apiRosterDates_(request.payload || {}):apiRosterDate_(request.payload || {}) });
    }
    const actor = normaliseActor_(request.actor);
    action = String(request.action || '').trim();
    const payload = request.payload || {};
    requestId = String(request.requestId || Utilities.getUuid());

    const result = dispatch_(action, actor, payload, requestId);
    console.log(JSON.stringify({
      type: 'CALV2_REQUEST_TIMING',
      action: action,
      requestId: requestId,
      durationMs: Date.now() - requestStarted
    }));
    return jsonOutput_({ ok: true, result: result });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    console.log(JSON.stringify({
      type: 'CALV2_REQUEST_TIMING',
      action: action,
      requestId: requestId,
      durationMs: Date.now() - requestStarted,
      failed: true
    }));
    return jsonOutput_({
      ok: false,
      error: String(err && err.message ? err.message : err),
      code: err.code || 'BACKEND_ERROR',
      status: Number(err.status) || 400,
      definite: err.definite === true,
      current: err.current || null,
      ...(err.retryAfterMs?{retryAfterMs:err.retryAfterMs}:{})
    });
  }
}

function dispatchCore_(action, actor, payload, requestId) {
  if(action==='rosterDate')return apiRosterDate_(payload);
  if(action==='rosterDates')return apiRosterDates_(payload);
  if(action==='rosterWindow')return apiRosterWindow_(payload);
  if(action==='rosterStatisticsCalendar')return apiRosterStatisticsCalendar_(payload);
  const roles = rolesFor_(actor.userAlias);

  switch (action) {
    case 'bootstrap':
      return apiBootstrap_(actor, roles, payload);

    case 'calendarChangesAuthorize':
      return calendarChangesAuthorize_(actor,payload);

    case 'calendarChangesDelta':
      return apiCalendarChangesDelta_(actor,payload);

    case 'pullBirthdays':
      requireAdmin_(roles);
      return apiPullBirthdays_(actor,payload,requestId);

    case 'saveEvent':
      requireAdmin_(roles);
      if(payload.event&&payload.event.VenueID)rc18IO_().venueCatalogue=calendarVenueCatalogue_(actor);
      return runEventMutation_(actor, 'saveEvent', payload, requestId);

    case 'deleteEvent':
      requireAdmin_(roles);
      return runEventMutation_(actor, 'deleteEvent', payload, requestId);

    case 'saveParentSide':
      requireParentEditor_(roles);
      return runEventMutation_(actor, 'saveParentSide', payload, requestId);

    case 'relocateEvent':
      requireAdmin_(roles);
      rc18IO_().venueCatalogue=calendarVenueCatalogue_(actor);
      return runEventMutation_(actor, action, payload, requestId);

    case 'mutationReceipts':
      requireAdmin_(roles);
      return apiMutationReceipts_(actor,payload);

    case 'eventMutationStatus':
      if (payload.action === 'saveParentSide') requireParentEditor_(roles); else requireAdmin_(roles);
      return apiEventMutationStatus_(actor, payload);

    case 'saveTag':
      requireAdmin_(roles);
      return withCalendarMetadataLock_('saveTag',payload,() => apiSaveTag_(actor,payload,requestId));

    case 'deleteTag':
      requireAdmin_(roles);
      return withCalendarMetadataLock_('deleteTag',payload,() => apiDeleteTag_(actor,payload,requestId));

    case 'saveLane':
      requireAdmin_(roles);
      return withCalendarMetadataLock_('saveLane',payload,() => rc18Atomic_(() => apiSaveLane_(actor, payload, requestId)));

    case 'saveColourRule':
      requireAdmin_(roles);
      return withCalendarMetadataLock_('saveColourRule',payload,() => rc18Atomic_(() => apiSaveColourRule_(actor,payload,requestId)));

    case 'deleteColourRule':
      requireAdmin_(roles);
      return withCalendarMetadataLock_('deleteColourRule',payload,() => rc18Atomic_(() => apiDeleteColourRule_(actor,payload,requestId)));

    case 'reorderColourRules':
      requireAdmin_(roles);
      return withCalendarMetadataLock_('reorderColourRules',payload,() => apiReorderColourRules_(actor,payload,requestId));

    case 'saveUser':
      requireAdmin_(roles);
      return withCalendarMetadataLock_('saveUser',payload,() => rc18Atomic_(() => apiSaveUser_(actor,payload,requestId)));

    case 'saveYear':
      requireAdmin_(roles);
      return withCalendarMetadataLock_('saveYear',payload,() => apiSaveYear_(actor, payload, requestId));

    case 'publishVersion':
      requireAdmin_(roles);
      return withRC17WriteLock_(() => apiPublishVersion_(actor, payload, requestId),true);

    case 'savePublicHolidays':
      requireAdmin_(roles);
      return withCalendarMetadataLock_('savePublicHolidays',payload,() => apiSavePublicHolidays_(actor, payload, requestId));

    case 'generateYearStructure':
      requireAdmin_(roles);
      return withCalendarMetadataLock_('generateYearStructure',payload,() => apiGenerateYearStructure_(actor, payload, requestId));

    case 'saveUrls':
      requireAdmin_(roles);
      return withCalendarMetadataLock_('saveUrls',payload,() => rc18Atomic_(() => apiSaveUrls_(actor,payload,requestId)));

    case 'calendarPreflight':
      requireAdmin_(roles);
      return apiCalendarPreflight_(actor, payload, requestId);

    case 'healthCheck':
      requireAdmin_(roles);
      return apiHealthCheck_(actor, payload, requestId);

    case 'calendarReconciliationPreview':
      requireAdmin_(roles);
      return apiCalendarReconciliationPreview_(actor, payload, requestId);

    case 'clearStaleOperation':
      requireAdmin_(roles);
      return apiClearStaleOperation_(actor, payload, requestId);

    case 'runSelfTests':
      requireAdmin_(roles);
      return apiRunSelfTests_(actor, payload, requestId);

    case 'calendarWipePreview':
      requireAdmin_(roles);
      return apiCalendarWipePreview_(actor, payload, requestId);

    case 'startCalendarWipe':
      requireAdmin_(roles);
      return apiStartCalendarWipe_(actor, payload, requestId);

    case 'calendarWipeBatch':
      requireAdmin_(roles);
      return apiCalendarWipeBatch_(actor, payload, requestId);

    case 'archiveYearsPreview':
      requireAdmin_(roles);
      return apiArchiveYearsPreview_(actor, payload, requestId);

    case 'archiveYearsCommit':
      requireAdmin_(roles);
      return apiArchiveYearsCommit_(actor, payload, requestId);

    case 'startSyncYear':
      requireAdmin_(roles);
      return apiStartSyncYear_(actor, payload, requestId);

    case 'syncYearBatch':
      requireAdmin_(roles);
      return apiSyncYearBatch_(actor, payload, requestId);

    case 'calendarSyncStatus':
      requireAdmin_(roles);
      return apiCalendarSyncStatus_(actor, payload);

    case 'syncYear':
      requireAdmin_(roles);
      throw new Error(
        'The resumable sync client is required. Hard refresh the Calendar web app.'
      );

    case 'savePdf':
      requireAdmin_(roles);
      return apiSavePdf_(actor, payload, requestId);

    case 'saveDayNote':
      requireAdmin_(roles);
      return withCalendarMetadataLock_('saveDayNote',payload,() => rc18Atomic_(() => apiSaveDayNote_(actor,payload,requestId)));

    default:
      throw new Error('Unknown API action: ' + action);
  }
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error('Missing JSON body.');
  let obj;
  try { obj = JSON.parse(e.postData.contents); }
  catch (err) { throw new Error('Invalid JSON body.'); }
  return obj || {};
}

function verifyProxySecret_(candidate) {
  const expected = gsisApiSecret_('CALENDAR_PROXY_SECRET');
  if (!expected) throw new Error('Backend is not configured: CALENDAR_PROXY_SECRET missing.');
  if (!candidate || !constantTimeEqual_(String(candidate), String(expected))) throw new Error('Unauthorised proxy.');
}

function normaliseActor_(actor) {
  actor = actor || {};
  const email = String(actor.email || '').trim().toLowerCase();
  const sub = String(actor.sub || '').trim();
  const alias = normAlias_(actor.userAlias || email.split('@')[0]);

  if (!email.endsWith('@' + CALV2.DOMAIN)) throw new Error('GSPS account required.');
  if (!sub) throw new Error('Verified Google subject missing.');
  if (!alias) throw new Error('User alias missing.');

  return { email: email, sub: sub, userAlias: alias };
}


/* =========================
 * BOOTSTRAP / ROLES
 * ========================= */

function apiBootstrap_(actor, roles, payload) {
  const started = Date.now();
  const timings = {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let t = Date.now();
  const settings = settingsMapCached_();
  timings.settingsMs = Date.now() - t;

  t = Date.now();
  const years = tableObjects_(ss.getSheetByName(CALV2.SHEETS.YEARS));
  timings.yearsMs = Date.now() - t;

  let visibleYears = years;
  if (!roles.isAdmin && !roles.isParentPublisher) {
    visibleYears = years.filter(r =>
      yes_(r.ReleasedToTeachers) &&
      String(r.Status || '').toUpperCase() !== 'ARCHIVED'
    );
  }

  const requestedYear = Number(payload.year || 0);
  const fallbackYear = visibleYears.length
    ? Math.max.apply(null, visibleYears.map(r => Number(r.Year)).filter(Boolean))
    : 0;
  const year = requestedYear || fallbackYear;
  if (requestedYear && !visibleYears.some(y => Number(y.Year) === requestedYear)) {
    throw mutationError_('YEAR_UNAVAILABLE','That year is not available to your account.',403,true);
  }

  t = Date.now();
  const config = configCached_();
  timings.configMs = Date.now() - t;

  t = Date.now();
  const people = publicRoleDirectory_(roles.isAdmin);
  timings.peopleMs = Date.now() - t;

  let events = [];
  let pendingRemovals = [];
  let structure = [];
  let dayNotes = [];

  if (year) {
    t = Date.now();
    const yearData=rc18YearData_(year);
    const yearEvents=yearData[CALV2.SHEETS.EVENTS];
    events = yearEvents.filter(r => !r.DeletedAt);
    // Deleted rows are not calendar tiles, but linked removals must still keep
    // the Admin's Sync controls available. Do not expose deleted titles to viewers.
    if (roles.isAdmin) pendingRemovals = yearEvents.filter(r => r.DeletedAt).map(r => ({
      eventId:String(r.EventID),staff:calendarApiSourceLinked_('staff',r),
      parent:calendarApiSourceLinked_('parent',r)
    })).filter(r => r.staff || r.parent);
    timings.eventsMs = Date.now() - t;

    t = Date.now();
    structure=yearData[CALV2.SHEETS.YEAR_STRUCTURE].filter(r=>!r.DeletedAt);
    timings.yearStructureMs = Date.now() - t;

    t = Date.now();
    dayNotes=yearData[CALV2.SHEETS.DAY_NOTES];
    timings.dayNotesMs = Date.now() - t;

    if (!roles.isAdmin && !roles.isParentPublisher) {
      const yr = years.find(r => Number(r.Year) === year);
      if (!yr || !yes_(yr.ReleasedToTeachers)) {
        events = [];
        structure = [];
        dayNotes = [];
      } else {
        events = events.filter(r => String(r.Status || '').toUpperCase() === 'PUBLISHED');
      }
    }
  }

  timings.totalMs = Date.now() - started;
  console.log(JSON.stringify({
    type: 'CALV2_BOOTSTRAP_TIMING',
    year: year,
    timings: timings
  }));

  return serialise_({
    version: CALV2.RELEASE_VERSION,
    schemaVersion: CALV2.VERSION,
    actor: {
      userAlias: actor.userAlias,
      displayName: aliasToDisplayName_(actor.userAlias),
      isAdmin: roles.isAdmin,
      isParentPublisher: roles.isParentPublisher
    },
    ...(roles.isAdmin?{editableTags:config.allTags,editableLanes:config.allLanes,metadataRevisions:calendarMetadataTokens_(config,visibleYears,events,structure,dayNotes,settings,year)}:{}),
    years: visibleYears,
    selectedYear: year,
    lanes: config.lanes,
    tags: config.tags,
    people: people,
    events: events.map(eventForClient_),
    mutationFailures: calendarFailedMutations_(actor,roles,year,events),
    ...calendarVenueCatalogue_(actor),
    pendingRemovals: pendingRemovals,
    yearStructure: structure,
    colourRules: config.colourRules,
    dayNotes: dayNotes,
    sources: {
      moeCalendar: settings.MOE_CALENDAR_URL || '',
      muisCalendar: settings.MUIS_CALENDAR_URL || ''
    },
    urls: {
      staffCalendar: settings.STAFF_CALENDAR_URL || '',
      parentCalendar: settings.PARENT_CALENDAR_URL || ''
    },

    // Migration tooling was retired after the one-off 2026 import.
    // MigrationReview remains in the backend as historical provenance only.

    // PDFLog is deliberately not read during bootstrap in RC0.85.
    performance: timings
  });
}

// Opaque optimistic revisions bind metadata forms to what their user loaded.
// They are computed from returned source values, never a separate revision read.
function calendarMetadataRevision_(value){
 if(value==null)return 'missing';
 const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).filter(k=>!k.startsWith('_')).sort().map(k=>[k,canonical(x[k])])):x;
 return sha256_(JSON.stringify(canonical(serialise_(value))));
}
function calendarMetadataOrder_(rows){return rows.map(r=>({RuleID:String(r.RuleID),Priority:Number(r.Priority||0)})).sort((a,b)=>a.RuleID.localeCompare(b.RuleID));}
function calendarMetadataYear_(action,yearRow,events,structure){
 const active=events.filter(r=>!r.DeletedAt&&(action!=='savePublicHolidays'||String(r.LaneID)==='day'&&String(r.OwnerTag).trim().toLowerCase()==='hol'));
 return {year:yearRow||null,events:active.map(r=>Object.fromEntries(['EventID',...RC17_CORE.EDIT_FIELDS].map(k=>[k,rc18Value_(k,r[k])]))).sort((a,b)=>String(a.EventID).localeCompare(String(b.EventID))),...(action==='generateYearStructure'?{structure:structure.filter(r=>!r.DeletedAt).slice().sort((a,b)=>String(a.StructureID).localeCompare(String(b.StructureID)))}:{})};
}
function calendarMetadataTokens_(config,years,events,structure,notes,settings,year){
 const map=(rows,key)=>Object.fromEntries(rows.map(r=>[key(r),calendarMetadataRevision_(r)]));
 return {tags:map(config.allTags,r=>String(r.Tag).toLowerCase()),lanes:map(config.allLanes,r=>String(r.LaneID)),rules:map(config.colourRules,r=>String(r.RuleID)),ruleOrder:calendarMetadataRevision_(calendarMetadataOrder_(config.colourRules)),users:map(tableObjects_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.USERS)),r=>normAlias_(r.UserAlias)),years:map(years,r=>String(r.Year)),notes:map(notes,r=>dateText_(r.Date)),urls:calendarMetadataRevision_({staffCalendarUrl:settings.STAFF_CALENDAR_URL||'',parentCalendarUrl:settings.PARENT_CALENDAR_URL||''}),holidays:calendarMetadataRevision_(calendarMetadataYear_('savePublicHolidays',years.find(r=>Number(r.Year)===year),events,structure)),structure:calendarMetadataRevision_(calendarMetadataYear_('generateYearStructure',years.find(r=>Number(r.Year)===year),events,structure))};
}
function calendarMetadataCurrent_(action,p){
 const ss=SpreadsheetApp.getActiveSpreadsheet(),sheet=name=>ss.getSheetByName(name),find=(name,key,id,fold)=>{const hit=fold?findRowByKeyCaseInsensitive_(sheet(name),key,id):findRowByKey_(sheet(name),key,id);return hit?hit.object:null;};
 if(['saveTag','deleteTag'].includes(action))return find(CALV2.SHEETS.TAGS,'Tag',normaliseTagInput_(p.Tag),true);
 if(['saveColourRule','deleteColourRule'].includes(action))return p.RuleID?find(CALV2.SHEETS.COLOUR_RULES,'RuleID',String(p.RuleID).trim()):null;
 if(action==='reorderColourRules')return calendarMetadataOrder_(tableObjects_(sheet(CALV2.SHEETS.COLOUR_RULES)));
 if(action==='saveUser')return find(CALV2.SHEETS.USERS,'UserAlias',normAlias_(p.UserAlias),true);
 if(action==='saveYear')return find(CALV2.SHEETS.YEARS,'Year',Number(p.Year));
 if(action==='saveLane'){
  const row=find(CALV2.SHEETS.LANES,'LaneID',String(p.LaneID||'').trim());if(!row)return null;
  const schedule=laneScheduleRowsForLane_(row.LaneID);return {...row,Schedule:schedule.length?schedule:legacyLaneScheduleRows_(row)};
 }
 if(action==='saveUrls'){
  const rows=tableObjects_(sheet(CALV2.SHEETS.SETTINGS)),value=k=>String(rows.find(r=>r.Key===k)?.Value||'');
  return {staffCalendarUrl:value('STAFF_CALENDAR_URL'),parentCalendarUrl:value('PARENT_CALENDAR_URL')};
 }
 if(action==='saveDayNote'){
  const matches=rc18Projection_(sheet(CALV2.SHEETS.DAY_NOTES),['Year','Date']).filter(x=>Number(x.object.Year)===Number(p.year)&&dateText_(x.object.Date)===dateText_(p.date));
  if(matches.length>1)throw mutationError_('METADATA_CONFLICT','Duplicate planning notes require administrator review. Your draft is retained.',409,true);
  return matches.length?rc18Rows_(sheet(CALV2.SHEETS.DAY_NOTES),[matches[0].row])[0].object:null;
 }
 if(['savePublicHolidays','generateYearStructure'].includes(action)){
  const year=Number(p.Year),data=rc18YearData_(year);
  return calendarMetadataYear_(action,find(CALV2.SHEETS.YEARS,'Year',year),data[CALV2.SHEETS.EVENTS],data[CALV2.SHEETS.YEAR_STRUCTURE]);
 }
 throw new Error('Unknown metadata action.');
}
function withCalendarMetadataLock_(action,payload,work){
 return withRC17WriteLock_(()=>{
  if(typeof payload.expectedMetadataRevision!=='string'||! /^(?:missing|[a-f0-9]{64})$/.test(payload.expectedMetadataRevision))throw mutationError_('METADATA_REFRESH_REQUIRED','This form needs the current Calendar version. Your draft is retained. Copy your changes, refresh, then reopen the form.',409,true);
  if(payload.expectedMetadataRevision!==calendarMetadataRevision_(calendarMetadataCurrent_(action,payload)))throw mutationError_('METADATA_CONFLICT','A colleague changed this record. Nothing was saved and your draft is retained. Copy your changes, refresh, then review the latest record before saving.',409,true);
  return work();
 });
}

function rolesFor_(alias, fresh) {
  // Shared cached directory rows are display data, never permission evidence.
  if(fresh)rc18InvalidateIO_(CALV2.SHEETS.USERS);
  const rows = tableObjects_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.USERS));
  const hit = rows.find(r => normAlias_(r.UserAlias) === normAlias_(alias) && yes_(r.Active));
  return {
    isAdmin: !!hit && yes_(hit.IsAdmin),
    isParentPublisher: !!hit && yes_(hit.IsParentPublisher)
  };
}

function publicRoleDirectory_(fresh) {
  // Editable role values and their revisions must use the same fresh snapshot.
  const rows=fresh?tableObjects_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.USERS)):userRowsCached_();
  return rows
    .filter(r => fresh || yes_(r.Active) && (yes_(r.IsAdmin) || yes_(r.IsParentPublisher)))
    .map(r => ({
      userAlias: normAlias_(r.UserAlias),
      displayName: String(r.DisplayName || aliasToDisplayName_(r.UserAlias)),
      isAdmin: yes_(r.IsAdmin),
      isParentPublisher: yes_(r.IsParentPublisher),
      ...(fresh?{active:yes_(r.Active)}:{})
    }))
    .sort((a, b) => a.userAlias.localeCompare(b.userAlias));
}

function requireAdmin_(roles) {
  if (!roles.isAdmin) throw mutationError_('FORBIDDEN','Administrator permission required.',403,true);
}

function requireParentEditor_(roles) {
  if (!roles.isAdmin && !roles.isParentPublisher) throw mutationError_('FORBIDDEN','Parent Publisher permission required.',403,true);
}


/* =========================
 * EVENT CRUD
 * ========================= */

function staffDesiredNowForEvent_(event) {
  const yearRow =
    yearsCached_()
      .find(row =>
        Number(row.Year) ===
        Number(event.Year)
      );

  if (!yearRow) {
    return false;
  }

  const laneMap = {};

  (configCached_().lanes || [])
    .forEach(lane => {
      laneMap[
        String(lane.LaneID || '')
      ] = lane;
    });

  return desiredSyncState_(
    'staff',
    event,
    yearRow,
    laneMap
  );
}

function normaliseNoOpStaffSyncStates_() {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.EVENTS),years={},lanes={},requests=[];
  yearsCached_().forEach(y=>years[Number(y.Year)]=y);
  configCached_().lanes.forEach(l=>lanes[String(l.LaneID)]=l);
  let count=0;
  rc18Projection_(sheet,['EventID','Year','Status','LaneID','DeletedAt','StaffCalendarEventId','StaffSyncState']).forEach(x=>{
    const e=x.object,state=canonicalSyncState_(e.StaffSyncState);
    if(calendarApiSourceLinked_('staff',e) || !['PENDING_SYNC','PENDING_REMOVAL'].includes(state))return;
    const y=years[Number(e.Year)];
    if(!y || !desiredSyncState_('staff',e,y,lanes)){
      requests.push.apply(requests,rc18PatchRequests_(sheet,x.row,{StaffSyncState:'SYNCED'}));count++;
    }
  });rc18MaintenanceWrites_(requests);return count;
}

function apiSaveEvent_(actor, payload, requestId) {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      CALV2.SHEETS.EVENTS
    );

  const headers =
    CALV2.HEADERS.Events;

  const raw =
    Object.assign(
      {},
      payload.event || payload
    );

  const requestedId =
    String(
      raw && raw.EventID || ''
    ).trim();

  if(!payload.__operationId)rc18AssertNoPendingEvent_(requestedId,'',raw.Year);

  const existing =
    requestedId
      ? findRowByKey_(
          sheet,
          'EventID',
          requestedId
        )
      : null;

  const before =
    existing
      ? existing.object
      : null;

  if (
    !existing &&
    !String(
      raw.Status || ''
    ).trim()
  ) {
    raw.Status =
      defaultEventVisibilityForYear_(
        raw.Year
      );
  }

  const event =
    validateEvent_(raw, before);

  const now =
    isoNow_();

  if (!event.EventID) {
    event.EventID =
      'EVT-' + Utilities.getUuid();
  }

  event.CreatedAt =
    before ? before.CreatedAt : now;

  event.CreatedBy =
    before
      ? before.CreatedBy
      : actor.userAlias;

  event.UpdatedAt = now;
  event.UpdatedBy = actor.userAlias;
  event.DeletedAt = '';
  event.LastMutationID = payload.__operationId || (before && before.LastMutationID) || '';

  // Any staff-side edit potentially changes both representations.
  event.StaffCalendarEventId =
    before ? before.StaffCalendarEventId : '';

  event.StaffSyncHash =
    before ? before.StaffSyncHash : '';

  event.StaffSyncState =
    (
      calendarApiSourceLinked_('staff',event) ||
      staffDesiredNowForEvent_(event)
    )
      ? 'PENDING_SYNC'
      : 'SYNCED';

  event.ParentCalendarEventId =
    before ? before.ParentCalendarEventId : '';

  event.ParentSyncHash =
    before ? before.ParentSyncHash : '';

  event.ParentSyncState =
    (
      yes_(event.ParentEnabled) ||
      calendarApiSourceLinked_('parent',event)
    )
      ? 'PENDING_SYNC'
      : 'SYNCED';

  event.LastSyncedAt =
    before ? before.LastSyncedAt : '';

  // Preserve parent-facing copy unless Admin supplied explicit parent fields.
  if (before) {
    if (
      payload.event &&
      !Object.prototype.hasOwnProperty.call(
        payload.event,
        'ParentEnabled'
      )
    ) {
      event.ParentEnabled =
        before.ParentEnabled;
    }

    if (
      payload.event &&
      !Object.prototype.hasOwnProperty.call(
        payload.event,
        'ParentTitle'
      )
    ) {
      event.ParentTitle =
        before.ParentTitle;
    }

    if (
      payload.event &&
      !Object.prototype.hasOwnProperty.call(
        payload.event,
        'ParentDescription'
      )
    ) {
      event.ParentDescription =
        before.ParentDescription;
    }
  }

  rc18Atomic_(function(){
  rc18SaveObject_(sheet,headers,existing,event);

  appendAudit_(
    actor,
    before
      ? 'UPDATE_EVENT'
      : 'CREATE_EVENT',
    'Event',
    event.EventID,
    before,
    event,
    requestId
  );

  });
  return serialise_(event);
}

function apiSaveParentSide_(actor, payload, requestId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CALV2.SHEETS.EVENTS);
  const id = String(payload.eventId || payload.EventID || '').trim();
  if (!id) throw new Error('eventId is required.');

  const existing = findRowByKey_(sheet, 'EventID', id);
  if (!existing || existing.object.DeletedAt) throw new Error('Event not found.');

  const before = existing.object;
  const enabled = yes_(payload.ParentEnabled);
  const hasExistingParentCalendarEvent = calendarApiSourceLinked_('parent',before);

  const after = Object.assign({}, before, {
    LastMutationID: payload.__operationId || before.LastMutationID || '',
    ParentEnabled: enabled ? 'Yes' : 'No',
    ParentTitle: String(payload.ParentTitle || '').trim(),
    ParentDescription: String(payload.ParentDescription || '').trim(),
    ParentSyncState: enabled
      ? 'PENDING_SYNC'
      : (hasExistingParentCalendarEvent ? 'PENDING_REMOVAL' : 'SYNCED'),
    UpdatedAt: isoNow_(),
    UpdatedBy: actor.userAlias
  });

  upsertObject_(sheet, CALV2.HEADERS.Events, 'EventID', id, after);
  appendAudit_(actor, 'UPDATE_PARENT_SIDE', 'Event', id, before, after, requestId);
  return serialise_(after);
}

function apiDeleteEvent_(actor, payload, requestId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CALV2.SHEETS.EVENTS);
  const id = String(payload.eventId || '').trim();
  if (!id) throw new Error('eventId is required.');

  const existing = findRowByKey_(sheet, 'EventID', id);
  if (!existing) throw new Error('Event not found.');

  const before = existing.object;
  const after = Object.assign({}, before, {
    LastMutationID: payload.__operationId || before.LastMutationID || '',
    DeletedAt: isoNow_(),
    UpdatedAt: isoNow_(),
    UpdatedBy: actor.userAlias,
    StaffSyncState: 'PENDING_REMOVAL',
    ParentSyncState: 'PENDING_REMOVAL'
  });

  upsertObject_(sheet, CALV2.HEADERS.Events, 'EventID', id, after);
  appendAudit_(actor, 'DELETE_EVENT', 'Event', id, before, after, requestId);
  return { eventId: id, deleted: true };
}

function validateEvent_(raw, existingBefore) {
  const e = Object.assign({}, raw || {});
  e.EventID = String(e.EventID || '').trim();
  e.Year = Number(e.Year);
  e.Status = String(e.Status || 'HIDDEN').trim().toUpperCase();
  e.LaneID = String(e.LaneID || '').trim();
  e.ShiftSpan = String(e.ShiftSpan || 'NONE').trim().toUpperCase();
  e.OwnerTag = String(e.OwnerTag || '').trim();
  e.StaffTitle = String(e.StaffTitle || '').trim();
  e.StaffDescription = String(e.StaffDescription || '').trim();
  e.Location = String(e.Location || '').trim();
  e.VenueID = calendarValidateVenue_(e,existingBefore);
  e.EventType = String(e.EventType || 'ALL_DAY').trim().toUpperCase();
  e.StartDate = dateText_(e.StartDate);
  e.EndDate = dateText_(e.EndDate || e.StartDate);
  e.StartTime = timeText_(e.StartTime);
  e.EndTime = timeText_(e.EndTime);
  e.ParentEnabled = yes_(e.ParentEnabled) ? 'Yes' : 'No';
  e.ParentTitle = String(e.ParentTitle || '').trim();
  e.ParentDescription = String(e.ParentDescription || '').trim();

  if (!Number.isInteger(e.Year) || e.Year < 2000 || e.Year > 2100) throw new Error('Valid Year is required.');
  if (!['HIDDEN', 'PUBLISHED'].includes(e.Status)) throw new Error('Status must be Hidden or Published.');
  if (!e.LaneID) throw new Error('Display lane is required.');
  if (!e.OwnerTag) throw new Error('One compulsory glossary tag is required.');
  if (!e.StaffTitle) throw new Error('Staff title is required.');
  if (!['ALL_DAY', 'TIMED', 'MULTI_DAY'].includes(e.EventType)) throw new Error('Invalid event type.');
  if (!Number.isFinite(RC17_CORE.dateNumber(e.StartDate)) || !Number.isFinite(RC17_CORE.dateNumber(e.EndDate))) throw new Error('Valid start/end dates are required.');
  if (Number(e.StartDate.slice(0,4)) !== e.Year || Number(e.EndDate.slice(0,4)) !== e.Year) throw new Error('The complete event must remain within its selected year.');
  if (e.StartTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.StartTime)) throw new Error('Invalid start time.');
  if (e.EndTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.EndTime)) throw new Error('Invalid end time.');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const year = yearsCached_().find(r => Number(r.Year) === e.Year);
  if (!year || String(year.Status || '').toUpperCase() === 'ARCHIVED') throw new Error('Year does not exist or is archived.');

  const config = configCached_();
  const lane = config.lanes.find(r => String(r.LaneID) === e.LaneID && yes_(r.Active));
  if (!lane) throw new Error('Selected lane is not active.');

  const laneSchedule =
    laneScheduleForDate_(lane, e.StartDate);

  const placementUnchanged =
    !!existingBefore &&
    String(existingBefore.LaneID || '') === e.LaneID &&
    dateText_(existingBefore.StartDate) === e.StartDate;

  if (
    laneSchedule &&
    !yes_(laneSchedule.Enabled) &&
    !placementUnchanged
  ) {
    const dayCode =
      weekdayCodeForDate_(e.StartDate);

    throw new Error(
      String(lane.Header || e.LaneID) +
      ' is not available on ' +
      dayCode +
      '. Enable that weekday under Columns first.'
    );
  }

  const tag = config.tags.find(r => String(r.Tag).toLowerCase() === e.OwnerTag.toLowerCase() && yes_(r.Active));
  if (!tag) throw new Error('Selected glossary tag is not active.');
  e.OwnerTag = String(tag.Tag);

  if (yes_(lane.SupportsShift)) {
    if (!['PM_I', 'PM_II', 'BOTH'].includes(e.ShiftSpan)) e.ShiftSpan = 'PM_I';
  } else {
    e.ShiftSpan = 'NONE';
  }

  if (e.EventType === 'ALL_DAY') {
    e.EndDate = e.StartDate;
    e.StartTime = '';
    e.EndTime = '';
  } else if (e.EventType === 'MULTI_DAY') {
    e.StartTime = '';
    e.EndTime = '';
    if (!e.EndDate) throw new Error('End date is required for multi-day events.');
    if (new Date(e.EndDate + 'T00:00:00') < new Date(e.StartDate + 'T00:00:00')) throw new Error('End date cannot precede start date.');
  } else {
    if (!e.EndDate || e.EndDate < e.StartDate) throw new Error('End date cannot precede start date.');
    if (!e.StartTime || !e.EndTime) throw new Error('Start and end time are required for timed events.');
    if (e.EndDate === e.StartDate && e.EndTime <= e.StartTime) throw new Error('End time must be later than start time.');

    if (yes_(lane.SupportsShift)) {
      const split = timeText_(
        (laneSchedule && laneSchedule.ShiftBDefaultStartTime) ||
        lane.ShiftBDefaultStartTime ||
        '15:30'
      ) || '15:30';

      if (e.StartTime < split && e.EndTime > split) e.ShiftSpan = 'BOTH';
      else if (e.StartTime >= split) e.ShiftSpan = 'PM_II';
      else e.ShiftSpan = 'PM_I';
    }
  }

  return e;
}


/* =========================
 * ADMIN CONFIG CRUD
 * ========================= */


function defaultEventVisibilityFromYearStatus_(status) {
  return (
    String(status || '')
      .trim()
      .toUpperCase() === 'ACTIVE'
  )
    ? 'PUBLISHED'
    : 'HIDDEN';
}

function defaultEventVisibilityForYear_(year) {
  const targetYear =
    Number(year);

  const row =
    yearsCached_()
      .find(item =>
        Number(item.Year) === targetYear
      );

  if (
    !row ||
    String(row.Status || '')
      .toUpperCase() === 'ARCHIVED'
  ) {
    throw new Error(
      'Year does not exist or is archived.'
    );
  }

  return defaultEventVisibilityFromYearStatus_(
    row.Status
  );
}

function isYearReleaseTransition_(before, after) {
  return (
    yes_(
      after &&
      after.ReleasedToTeachers
    ) &&
    (
      !before ||
      !yes_(before.ReleasedToTeachers)
    )
  );
}

function publishHiddenEventsForYearOnRelease_(actor,year,requestId,writeRequests) {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.EVENTS),requests=[],eventIds=[];
  const now=isoNow_();
  rc18Projection_(sheet,['EventID','Year','DeletedAt','Status','ParentEnabled','ParentCalendarEventId']).forEach(x=>{
    const e=x.object;
    if(Number(e.Year)!==Number(year)||String(e.DeletedAt||'').trim()||String(e.Status).toUpperCase()!=='HIDDEN')return;
    const parentPending=yes_(e.ParentEnabled)||calendarApiSourceLinked_('parent',e);
    requests.push.apply(requests,rc18PatchRequests_(sheet,x.row,{Status:'PUBLISHED',UpdatedAt:now,
      UpdatedBy:actor.userAlias,StaffSyncState:'PENDING_SYNC',ParentSyncState:parentPending?'PENDING_SYNC':'SYNCED'}));
    eventIds.push(String(e.EventID));
  });
  (writeRequests || rc18MaintenanceWrites_)(requests);
  appendAudit_(actor,'PUBLISH_HIDDEN_EVENTS_ON_RELEASE','Year',String(year),null,
    {published:eventIds.length,eventIds:eventIds.slice(0,250),truncated:eventIds.length>250,writeMode:'NATIVE_FIELD_BATCH'},requestId);
  return {published:eventIds.length,eventIds:eventIds};
}

/** Publish the selected version and queue Staff sync. Calendar writes remain
 * in the existing resumable sync action. The receipt commits only after all
 * native writes finish. An incomplete publication remains fenced and uncertain;
 * exact replay cannot publish later edits. */
function apiPublishVersion_(actor, payload, requestId) {
  const year = Number(payload.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw mutationError_('INVALID_YEAR','Choose a valid year.',400,true);
  }
  const log = mutationSheet_();
  const identity = mutationIdentity_(actor,'publishVersion',{year:year,operationId:payload.operationId});
  const previous = mutationLookup_(log,identity.operationId);
  if (previous) {
    mutationCheckIdentity_(previous.object,actor,'publishVersion',identity.hash);
    return unwrapMutationOutcome_(resolveMutationRecord_(log,previous.object,actor));
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const years = ss.getSheetByName(CALV2.SHEETS.YEARS);
  const hit = findRowByKey_(years,'Year',year);
  if (!hit || String(hit.object.Status || '').toUpperCase() === 'ARCHIVED') {
    throw mutationError_('YEAR_UNAVAILABLE','Year is missing or archived.',409,true);
  }
  // A timed-out earlier write may still reach Sheets after its ScriptLock
  // expires. Bulk publication must not overtake any unresolved event write.
  rc18AssertNoPendingEvent_('',identity.operationId,year,true);
  try { assertOperationalHealthFor_('Publish version '+year,year); }
  catch (err) { err.definite = true; throw err; }
  const now = isoNow_();
  const after = Object.assign({},hit.object,{ReleasedToTeachers:'Yes',UpdatedAt:now,UpdatedBy:actor.userAlias});
  const record = {OperationID:identity.operationId,UserAlias:actor.userAlias,Action:'publishVersion',
    PayloadHash:identity.hash,State:'DISPATCHED',EventID:'YEAR:'+year,CreatedAt:now,UpdatedAt:now,ResultJSON:JSON.stringify({dispatchRequestId:requestId,beforeYear:hit.object,afterYear:after})};
  try {
    mutationWrite_(log,record);
    const result = rc18Atomic_(function() {
      rc18SaveObject_(years,CALV2.HEADERS.Years,hit,after);
      const promotion = publishHiddenEventsForYearOnRelease_(actor,year,requestId,rc18Queue_);
      const queued = markYearStaffDirty_(year,rc18Queue_);
      const value = {year:year,published:promotion.published,staffQueued:queued,ReleasedToTeachers:'Yes'};
      appendAudit_(actor,'PUBLISH_VERSION','Year',String(year),hit.object,Object.assign({operationId:identity.operationId},value),requestId);
      record.State = 'COMMITTED';
      record.ResultJSON = JSON.stringify(value);
      mutationWrite_(log,record);
      return value;
    });
    return result;
  } catch (err) {
    // This guard is checked before the first native write. An oversized
    // publication is therefore safe to record as definitely not saved.
    if (err.code === 'WRITE_BATCH_TOO_LARGE') {
      let rejected = false;
      try { rejectMutation_(log,record,err); rejected = true; } catch (ignored) {}
      if (rejected) throw err;
    }
    rc18InvalidateIO_();
    try {
      const receipt = mutationLookup_(log,identity.operationId);
      if (receipt && receipt.object.State === 'COMMITTED') return JSON.parse(receipt.object.ResultJSON);
    } catch (ignored) {}
    throw mutationError_('UNKNOWN','Publication status is not confirmed. Retry Publish version to check the same operation.',503,false);
  } finally {
    invalidateCalendarCaches_();
  }
}

function apiSaveYear_(actor, payload, requestId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.YEARS);
  const year = Number(payload.Year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Valid Year required.');
  rc18AssertNoPendingEvent_('','',year);

  const hit = findRowByKey_(sheet, 'Year', year);
  const before = hit ? hit.object : null;
  const now = isoNow_();

  const obj = Object.assign({}, before || {}, {
    Year: year,
    Status: String(payload.Status || (before && before.Status) || 'PLANNING').toUpperCase(),
    ReleasedToTeachers: yes_(payload.ReleasedToTeachers) ? 'Yes' : 'No',
    RamadanStart: dateText_(payload.RamadanStart || ''),
    RamadanEnd: dateText_(payload.RamadanEnd || ''),
    MOECalendarURL: String(payload.MOECalendarURL || (before && before.MOECalendarURL) || setting_('MOE_CALENDAR_URL')),
    MUISCalendarURL: String(payload.MUISCalendarURL || (before && before.MUISCalendarURL) || setting_('MUIS_CALENDAR_URL')),
    CreatedAt: before ? before.CreatedAt : now,
    CreatedBy: before ? before.CreatedBy : actor.userAlias,
    UpdatedAt: now,
    UpdatedBy: actor.userAlias
  });

  if (!['PLANNING', 'ACTIVE', 'ARCHIVED'].includes(obj.Status)) throw new Error('Year status must be PLANNING, ACTIVE or ARCHIVED.');
  if (obj.Status === 'ARCHIVED') throw new Error('Use the archive workflow to archive a year; direct ARCHIVED status is blocked.');
  if (obj.RamadanStart && obj.RamadanEnd && obj.RamadanEnd < obj.RamadanStart) throw new Error('Ramadan end cannot precede Ramadan start.');

  const releasingNow =
    isYearReleaseTransition_(
      before,
      obj
    );

  if (releasingNow) {
    assertOperationalHealthFor_(
      'Release Year ' + year,
      year
    );
  }

  upsertObject_(
    sheet,
    CALV2.HEADERS.Years,
    'Year',
    year,
    obj
  );

  let releasePromotion = {
    published:
      0,
    eventIds:
      []
  };

  if (releasingNow) {
    releasePromotion =
      publishHiddenEventsForYearOnRelease_(
        actor,
        year,
        requestId
      );
  }

  appendAudit_(
    actor,
    before
      ? 'UPDATE_YEAR'
      : 'CREATE_YEAR',
    'Year',
    String(year),
    before,
    Object.assign(
      {},
      obj,
      {
        PublishedHiddenEvents:
          releasePromotion.published
      }
    ),
    requestId
  );

  if (
    before &&
    yes_(before.ReleasedToTeachers) !==
      yes_(obj.ReleasedToTeachers)
  ) {
    markYearStaffDirty_(year);
  }

  invalidateCalendarCaches_();

  return serialise_(
    Object.assign(
      {},
      obj,
      {
        PublishedHiddenEvents:
          releasePromotion.published
      }
    )
  );
}

const SINGAPORE_PUBLIC_HOLIDAY_NAMES_ = Object.freeze([
  "New Year's Day",
  'Chinese New Year – first day',
  'Chinese New Year – second day',
  'Hari Raya Puasa',
  'Hari Raya Haji',
  'Good Friday',
  'Labour Day',
  'Vesak Day',
  'Youth Day',
  'National Day',
  'Day after National Day',
  "Teachers' Day",
  "Children's Day",
  'Deepavali',
  'Christmas Day'
]);

function normaliseHolidayTitle_(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findHolidayEvent_(eventsSheet, year, title) {
  const wanted =
    normaliseHolidayTitle_(title)
      .toLowerCase();

  return tableObjectsWithRows_(eventsSheet)
    .find(hit => {
      const ev = hit.object;

      return (
        Number(ev.Year) === Number(year) &&
        !String(ev.DeletedAt || '').trim() &&
        String(ev.LaneID || '') === 'day' &&
        String(ev.OwnerTag || '').trim().toLowerCase() === 'hol' &&
        normaliseHolidayTitle_(ev.StaffTitle)
          .toLowerCase() === wanted
      );
    }) || null;
}

function saveHolidayEvent_(actor, eventsSheet, year, title, dateKey, requestId) {
  const existing =
    findHolidayEvent_(
      eventsSheet,
      year,
      title
    );

  const payload = {
    EventID:
      existing
        ? existing.object.EventID
        : '',

    Year:
      year,

    Status:
      existing
        ? existing.object.Status ||
          defaultEventVisibilityForYear_(year)
        : defaultEventVisibilityForYear_(year),

    LaneID:
      'day',

    ShiftSpan:
      'NONE',

    OwnerTag:
      'hol',

    StaffTitle:
      title,

    StaffDescription:
      existing
        ? existing.object.StaffDescription || ''
        : '',

    Location:
      existing
        ? existing.object.Location || ''
        : '',

    EventType:
      'ALL_DAY',

    StartDate:
      dateKey,

    EndDate:
      dateKey,

    StartTime:
      '',

    EndTime:
      '',

    ParentEnabled:
      existing
        ? existing.object.ParentEnabled || 'No'
        : 'No',

    ParentTitle:
      existing
        ? existing.object.ParentTitle || title
        : title,

    ParentDescription:
      existing
        ? existing.object.ParentDescription || ''
        : ''
  };

  // Reuse the normal Event write path so Calendar sync state, audit, owner tag
  // validation and all Event invariants stay consistent.
  return apiSaveEvent_(
    actor,
    { event: payload },
    requestId
  );
}

function apiSavePublicHolidays_(actor, payload, requestId) {
  const year =
    Number(payload && payload.Year);

  if (!Number.isInteger(year)) {
    throw new Error('Year required.');
  }

  const yearRow =
    tableObjects_(
      SpreadsheetApp
        .getActiveSpreadsheet()
        .getSheetByName(CALV2.SHEETS.YEARS)
    )
      .find(row =>
        Number(row.Year) === year &&
        String(row.Status || '').toUpperCase() !== 'ARCHIVED'
      );

  if (!yearRow) {
    throw new Error(
      'Create or select a non-archived Year before saving public holidays.'
    );
  }

  const rows =
    Array.isArray(payload.holidays)
      ? payload.holidays
      : [];

  const byName = {};

  rows.forEach(row => {
    const name =
      normaliseHolidayTitle_(row && row.name);

    if (!name) return;

    byName[name] = {
      date:
        dateText_(row.date),
      observed:
        yes_(row.observed),
      observedDate:
        dateText_(row.observedDate)
    };
  });

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const eventsSheet =
    ss.getSheetByName(CALV2.SHEETS.EVENTS);

  const result = {
    year: year,
    createdOrUpdated: [],
    observedCreatedOrUpdated: [],
    skipped: []
  };

  SINGAPORE_PUBLIC_HOLIDAY_NAMES_
    .forEach(name => {
      const row =
        byName[name];

      if (!row || !row.date) {
        result.skipped.push({
          name: name,
          reason: 'No date supplied'
        });
        return;
      }

      if (
        Number(row.date.slice(0, 4)) !==
        year
      ) {
        throw new Error(
          name +
          ': date must fall within ' +
          year +
          '.'
        );
      }

      saveHolidayEvent_(
        actor,
        eventsSheet,
        year,
        name,
        row.date,
        requestId
      );

      result.createdOrUpdated.push({
        name: name,
        date: row.date
      });

      const observedTitle =
        name + ' (observed)';

      const existingObserved =
        findHolidayEvent_(
          eventsSheet,
          year,
          observedTitle
        );

      if (row.observed) {
        if (!row.observedDate) {
          throw new Error(
            name +
            ': enter an observed date or untick Create observed event.'
          );
        }

        if (
          Number(
            row.observedDate.slice(0, 4)
          ) !== year
        ) {
          throw new Error(
            name +
            ' (observed): date must fall within ' +
            year +
            '.'
          );
        }

        saveHolidayEvent_(
          actor,
          eventsSheet,
          year,
          observedTitle,
          row.observedDate,
          requestId
        );

        result.observedCreatedOrUpdated.push({
          name: observedTitle,
          date: row.observedDate
        });

      } else if (existingObserved) {
        apiDeleteEvent_(
          actor,
          {
            eventId:
              existingObserved.object.EventID
          },
          requestId
        );

        result.observedCreatedOrUpdated.push({
          name: observedTitle,
          removed: true
        });
      }
    });

  appendAudit_(
    actor,
    'SAVE_PUBLIC_HOLIDAYS',
    'Year',
    String(year),
    null,
    result,
    requestId
  );

  return serialise_(result);
}



function apiGenerateYearStructure_(actor, payload, requestId) {
  const generatorStarted = Date.now();

  try {
    const year = Number(payload.Year);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new Error('Valid Year required.');
    }

    const vacations = [
      ['VAC_T1', 'Mar Hols', payload.Vacation1Start, payload.Vacation1End],
      ['VAC_T2', 'Jun Hols', payload.Vacation2Start, payload.Vacation2End],
      ['VAC_T3', 'Sep Hols', payload.Vacation3Start, payload.Vacation3End],
      ['VAC_T4', 'Dec Hols', payload.Vacation4Start, payload.Vacation4End]
    ].map(v => ({
      code: v[0],
      label: v[1],
      start: dateText_(v[2]),
      end: dateText_(v[3])
    }));

    vacations.forEach((v, i) => {
      if (!v.start || !v.end) {
        throw new Error(
          'Vacation ' + (i + 1) + ' requires start and end dates.'
        );
      }

      if (v.end < v.start) {
        throw new Error(
          'Vacation ' + (i + 1) + ' end cannot precede start.'
        );
      }

      if (i && v.start <= vacations[i - 1].end) {
        throw new Error(
          'Vacation periods must be chronological and non-overlapping.'
        );
      }
    });

    const jan1 = sgDate_(year + '-01-01');
    const firstMonday = mondayOnOrAfter_(jan1);

    const termStarts = [
      firstMonday,
      mondayOnOrAfter_(
        addDays_(sgDate_(vacations[0].end), 1)
      ),
      mondayOnOrAfter_(
        addDays_(sgDate_(vacations[1].end), 1)
      ),
      mondayOnOrAfter_(
        addDays_(sgDate_(vacations[2].end), 1)
      )
    ];

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CALV2.SHEETS.YEAR_STRUCTURE);
    const existing = tableObjects_(sheet);

    const preserved = existing.filter(r => {
      if (Number(r.Year) !== year || r.DeletedAt) return true;

      const kind = String(r.Kind || '').toUpperCase();
      return kind !== 'TERM_WEEK' && kind !== 'VACATION';
    });

    const generated = [];
    const now = isoNow_();

    // Opening spillover remains structural metadata only.
    if (jan1 < firstMonday) {
      generated.push({
        StructureID: 'STR-' + Utilities.getUuid(),
        Year: year,
        Kind: 'TERM_WEEK',
        Label: 'T1W0',
        Term: '1',
        Week: 'T1W0',
        StartDate: formatDateKey_(jan1),
        EndDate: formatDateKey_(addDays_(firstMonday, -1)),
        SyncToStaffCalendar: 'No',
        SourceURL: '',
        Notes: 'Generated by Year Setup opening spillover. Structure-only.',
        CreatedAt: now,
        CreatedBy: actor.userAlias,
        UpdatedAt: now,
        UpdatedBy: actor.userAlias,
        DeletedAt: ''
      });
    }

    for (let t = 0; t < 4; t++) {
      const term = t + 1;
      const termStart = termStarts[t];
      const vacationStart = sgDate_(vacations[t].start);

      if (termStart >= vacationStart) {
        throw new Error(
          'Term ' + term +
          ' start must precede its following vacation.'
        );
      }

      for (let w = 1; w <= 10; w++) {
        const startDate =
          addDays_(termStart, (w - 1) * 7);

        const endDate =
          addDays_(startDate, 6);

        if (startDate >= vacationStart) {
          throw new Error(
            'Vacation after Term ' + term +
            ' begins before T' +
            term + 'W' + w +
            ' can start.'
          );
        }

        // The full Monday–Sunday week is retained even when a vacation starts
        // on the Saturday/Sunday at the tail of W10. This deliberately allows
        // the term-week and vacation multi-day bars to overlap on those
        // weekend days, matching the school-calendar convention.
        generated.push({
          StructureID: 'STR-' + Utilities.getUuid(),
          Year: year,
          Kind: 'TERM_WEEK',
          Label: 'T' + term + 'W' + w,
          Term: String(term),
          Week: String(w),
          StartDate: formatDateKey_(startDate),
          EndDate: formatDateKey_(endDate),
          SyncToStaffCalendar: 'Yes',
          SourceURL: '',
          Notes:
            'Generated Monday–Sunday term week. Materialised as a MULTI_DAY Event.',
          CreatedAt: now,
          CreatedBy: actor.userAlias,
          UpdatedAt: now,
          UpdatedBy: actor.userAlias,
          DeletedAt: ''
        });
      }

      const v = vacations[t];

      generated.push({
        StructureID: 'STR-' + Utilities.getUuid(),
        Year: year,
        Kind: 'VACATION',
        Label: v.code,
        Term: String(term),
        Week: '',
        StartDate: v.start,
        EndDate: v.end,
        SyncToStaffCalendar: 'Yes',
        SourceURL: '',
        Notes:
          'Generated vacation block. Materialised as a MULTI_DAY Event: ' +
          v.label + '.',
        CreatedAt: now,
        CreatedBy: actor.userAlias,
        UpdatedAt: now,
        UpdatedBy: actor.userAlias,
        DeletedAt: ''
      });
    }

    rewriteTableData_(
      sheet,
      CALV2.HEADERS.YearStructure,
      preserved.concat(generated)
    );

    const materialised =
      materialiseYearStructureEvents_(
        actor,
        year,
        generated,
        vacations,
        requestId
      );

    SpreadsheetApp.flush();

    const termWeeksGenerated =
      generated.filter(r =>
        r.Kind === 'TERM_WEEK'
      ).length;

    const vacationRows =
      generated.filter(r =>
        r.Kind === 'VACATION'
      );

    const result = {
      year: year,
      termWeeksGenerated: termWeeksGenerated,
      vacationsGenerated: vacationRows.length,
      multiDayEventsCreatedOrUpdated: materialised.saved,
      staleGeneratedEventsRemoved: materialised.removed,
      vacations: vacations.map(v => ({
        code: v.code,
        label: v.label,
        start: v.start,
        end: v.end,
        days: inclusiveDays_(v.start, v.end)
      }))
    };

    appendAudit_(
      actor,
      'GENERATE_YEAR_STRUCTURE',
      'YearStructure',
      String(year),
      null,
      result,
      requestId
    );

    return serialise_(result);

  } catch (err) {
    const failure = {
      year: Number(payload && payload.Year || 0),
      Vacation1Start: dateText_(payload && payload.Vacation1Start),
      Vacation1End: dateText_(payload && payload.Vacation1End),
      Vacation2Start: dateText_(payload && payload.Vacation2Start),
      Vacation2End: dateText_(payload && payload.Vacation2End),
      Vacation3Start: dateText_(payload && payload.Vacation3Start),
      Vacation3End: dateText_(payload && payload.Vacation3End),
      Vacation4Start: dateText_(payload && payload.Vacation4Start),
      Vacation4End: dateText_(payload && payload.Vacation4End),
      durationMs: Date.now() - generatorStarted,
      error: String(err && err.message ? err.message : err)
    };

    try {
      appendAudit_(
        actor,
        'GENERATE_YEAR_STRUCTURE_FAILED',
        'YearStructure',
        String(failure.year || ''),
        null,
        failure,
        requestId
      );
    } catch (auditErr) {}

    throw err;
  }
}

function generatedStructureMarker_(kind, label) {
  return (
    '[[GSPS_YEAR_STRUCTURE:' +
    String(kind || '').toUpperCase() +
    ':' +
    String(label || '') +
    ']]'
  );
}

function generatedVacationTitle_(code, vacations) {
  const row =
    (vacations || [])
      .find(v =>
        String(v.code || '') ===
        String(code || '')
      );

  return row
    ? row.label
    : String(code || '');
}

function materialiseYearStructureEvents_(
  actor,
  year,
  generated,
  vacations,
  requestId
) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const eventsSheet =
    ss.getSheetByName(CALV2.SHEETS.EVENTS);

  const live =
    tableObjectsWithRows_(eventsSheet)
      .filter(hit =>
        Number(hit.object.Year) === Number(year) &&
        !String(hit.object.DeletedAt || '').trim()
      );

  const generatedHits =
    live.filter(hit =>
      String(hit.object.StaffDescription || '')
        .indexOf('[[GSPS_YEAR_STRUCTURE:') >= 0
    );

  const desiredMarkers = {};
  let saved = 0;

  generated.forEach(structure => {
    const kind =
      String(structure.Kind || '').toUpperCase();

    const label =
      String(structure.Label || '');

    if (
      kind === 'TERM_WEEK' &&
      !/^T[1-4]W(?:[1-9]|10)$/.test(label)
    ) {
      return;
    }

    if (
      kind !== 'TERM_WEEK' &&
      kind !== 'VACATION'
    ) {
      return;
    }

    const marker =
      generatedStructureMarker_(kind, label);

    desiredMarkers[marker] = true;

    const existing =
      generatedHits.find(hit =>
        String(hit.object.StaffDescription || '')
          .indexOf(marker) >= 0
      );

    const ownerTag =
      kind === 'VACATION'
        ? 'hol'
        : 'term';

    const title =
      kind === 'VACATION'
        ? generatedVacationTitle_(label, vacations)
        : label;

    const event = {
      EventID:
        existing
          ? existing.object.EventID
          : '',
      Year: year,
      Status:
        existing
          ? existing.object.Status ||
            defaultEventVisibilityForYear_(year)
          : defaultEventVisibilityForYear_(year),
      LaneID: 'day',
      ShiftSpan: 'NONE',
      OwnerTag: ownerTag,
      StaffTitle: title,
      StaffDescription:
        marker +
        '\nGenerated automatically from Year Setup. ' +
        'Rerun the term/vacation generator to update this event.',
      Location: '',
      EventType: 'MULTI_DAY',
      StartDate: dateText_(structure.StartDate),
      EndDate: dateText_(structure.EndDate),
      StartTime: '',
      EndTime: '',
      ParentEnabled:
        existing
          ? existing.object.ParentEnabled || 'No'
          : 'No',
      ParentTitle:
        existing
          ? existing.object.ParentTitle || title
          : title,
      ParentDescription:
        existing
          ? existing.object.ParentDescription || ''
          : ''
    };

    apiSaveEvent_(
      actor,
      { event: event },
      requestId
    );

    saved++;
  });

  let removed = 0;

  generatedHits.forEach(hit => {
    const description =
      String(hit.object.StaffDescription || '');

    const markerMatch =
      description.match(
        /\[\[GSPS_YEAR_STRUCTURE:[^\]]+\]\]/
      );

    const marker =
      markerMatch
        ? markerMatch[0]
        : '';

    if (
      marker &&
      !desiredMarkers[marker]
    ) {
      apiDeleteEvent_(
        actor,
        { eventId: hit.object.EventID },
        requestId
      );

      removed++;
    }
  });

  return {
    saved: saved,
    removed: removed
  };
}


function inclusiveDays_(startKey, endKey) {
  const start = sgDate_(startKey);
  const end = sgDate_(endKey);
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}


function mondayOnOrAfter_(date) {
  const d = new Date(date.getTime());
  const day = d.getDay();
  return addDays_(d, day === 0 ? 1 : (day === 1 ? 0 : 8 - day));
}

function apiSaveTag_(actor, payload, requestId) {
  let tag = normaliseTagInput_(payload.Tag);
  if (!tag || tag.length > 20 || /[\n\r]/.test(tag)) {
    throw new Error('Tag must be 1–20 characters.');
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.TAGS);
  const hit = findRowByKeyCaseInsensitive_(sheet, 'Tag', tag);
  const before = hit ? hit.object : null;
  const now = isoNow_();

  let sortOrder = Number(payload.SortOrder || 0);
  if (!sortOrder) {
    const existingOrders = tableObjects_(sheet)
      .map(r => Number(r.SortOrder || 0))
      .filter(Number.isFinite);
    sortOrder = (existingOrders.length ? Math.max.apply(null, existingOrders) : 0) + 10;
  }

  const obj = Object.assign({}, before || {}, {
    Tag: before ? before.Tag : tag,
    Meaning: String(payload.Meaning || '').trim(),
    Active: yes_(payload.Active === undefined ? 'Yes' : payload.Active) ? 'Yes' : 'No',
    SortOrder: sortOrder,
    CreatedAt: before ? before.CreatedAt : now,
    CreatedBy: before ? before.CreatedBy : actor.userAlias,
    UpdatedAt: now,
    UpdatedBy: actor.userAlias
  });

  if (!obj.Meaning) throw new Error('Tag meaning is required.');

  rc18Atomic_(() => {
    upsertObject_(sheet, CALV2.HEADERS.Tags, 'Tag', obj.Tag, obj);
    appendAudit_(actor, before ? 'UPDATE_TAG' : 'CREATE_TAG', 'Tag', obj.Tag, before, obj, requestId);
    invalidateCalendarCaches_();
  });

  // Both returned catalogues sort by Tag. Rewriting every physical SortOrder
  // here would invalidate unrelated records and the just-returned revision.
  invalidateCalendarCaches_();
  return Object.assign(serialise_(obj),{_metadataRevision:calendarMetadataRevision_(obj)});
}


function apiDeleteTag_(actor, payload, requestId) {
  const tag = normaliseTagInput_(payload.Tag);
  if (!tag) throw new Error('Tag required.');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tagSheet = ss.getSheetByName(CALV2.SHEETS.TAGS);
  const eventSheet = ss.getSheetByName(CALV2.SHEETS.EVENTS);
  const hit = findRowByKeyCaseInsensitive_(tagSheet, 'Tag', tag);
  if (!hit) throw new Error('Glossary tag not found.');

  const references = rc18Projection_(eventSheet,['OwnerTag','DeletedAt']).map(x=>x.object).filter(e =>
    !e.DeletedAt &&
    String(e.OwnerTag || '').trim().toLowerCase() === tag.toLowerCase()
  );

  if (references.length) {
    throw new Error(
      '[' + hit.object.Tag + '] is used by ' + references.length +
      ' live event' + (references.length === 1 ? '' : 's') +
      '. Retag those events before deleting.'
    );
  }

  const before = hit.object;
  rc18Atomic_(() => {
    rc18DeleteRow_(tagSheet,hit.row);
    appendAudit_(actor, 'DELETE_TAG', 'Tag', before.Tag, before, null, requestId);
    invalidateCalendarCaches_();
  });
  invalidateCalendarCaches_();
  return { Tag: before.Tag, deleted: true, _metadataRevision:'missing' };
}

function normaliseTagInput_(value) {
  let tag = String(value || '').trim();

  // Users naturally type [SDT] because tags are displayed bracketed throughout
  // the calendar. Accept that form but store the canonical raw token only.
  const bracketed = tag.match(/^\[([^\[\]]+)\]$/);
  if (bracketed) tag = bracketed[1].trim();

  // Also forgive a single accidental leading/trailing bracket.
  tag = tag.replace(/^\[/, '').replace(/\]$/, '').trim();
  return tag;
}


function apiSaveColourRule_(actor, payload, requestId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.COLOUR_RULES);
  const requestedId = String(payload.RuleID || '').trim();
  const hit = requestedId ? findRowByKey_(sheet, 'RuleID', requestedId) : null;
  const before = hit ? hit.object : null;

  if (before && yes_(before.Locked)) {
    throw new Error('System formatting rules are locked.');
  }

  const ruleType = String(payload.RuleType || '').trim().toUpperCase();
  if (!['TAG', 'LANE', 'TITLE_CONTAINS', 'DATE_RANGE'].includes(ruleType)) {
    throw new Error('Unsupported conditional formatting rule type.');
  }

  let field = '';
  let operator = '';
  let value = '';

  if (ruleType === 'TAG') {
    field = 'OwnerTag';
    operator = 'EQUALS';
    value = normaliseTagInput_(payload.Value);
    const validTag = tableObjects_(
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.TAGS)
    ).some(r => yes_(r.Active) && String(r.Tag || '').toLowerCase() === value.toLowerCase());
    if (!value || !validTag) throw new Error('Choose an active glossary tag.');
  } else if (ruleType === 'LANE') {
    field = 'LaneID';
    operator = 'EQUALS';
    value = String(payload.Value || '').trim();
    const validLane = tableObjects_(
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.LANES)
    ).some(r => yes_(r.Active) && String(r.LaneID || '') === value);
    if (!value || !validLane) throw new Error('Choose an active display lane.');
  } else if (ruleType === 'TITLE_CONTAINS') {
    field = 'StaffTitle';
    operator = 'CONTAINS';
    value = String(payload.Value || '').trim();
    if (!value) throw new Error('Title match text is required.');
  } else if (ruleType === 'DATE_RANGE') {
    field = 'Date';
    operator = 'BETWEEN';
    const start = dateText_(payload.StartDate);
    const end = dateText_(payload.EndDate);
    if (!start || !end || start > end) throw new Error('Enter a valid date range.');
    value = start + '|' + end;
  }

  const fill = validateOptionalHexColour_(payload.FillColour, 'Fill colour');
  const text = validateOptionalHexColour_(payload.TextColour, 'Text colour');
  const border = validateOptionalHexColour_(payload.BorderColour, 'Border colour');

  if (!fill && !text && !border) {
    throw new Error('Choose at least one formatting property: fill, text or border.');
  }

  const existingRules = tableObjects_(sheet);
  let priority = before ? Number(before.Priority || 0) : 0;
  if (!priority) {
    const priorities = existingRules.map(r => Number(r.Priority || 0)).filter(Number.isFinite);
    priority = priorities.length ? Math.min.apply(null, priorities) - 10 : 100;
  }

  const obj = {
    RuleID: before ? before.RuleID : requestedId || 'RULE-' + Utilities.getUuid(),
    Priority: priority,
    RuleType: ruleType,
    Field: field,
    Operator: operator,
    Value: value,
    FillColour: fill,
    TextColour: text,
    BorderColour: border,
    Active: yes_(payload.Active === undefined ? 'Yes' : payload.Active) ? 'Yes' : 'No',
    Locked: 'No',
    Notes: String(payload.Notes || '').trim()
  };

  if (hit) {
    updateRowPatch_(sheet, hit.row, obj);
  } else {
    rc18Append_(sheet,CALV2.HEADERS.ColourRules.map(h => obj[h] === undefined ? '' : obj[h]));
  }

  appendAudit_(
    actor,
    before ? 'UPDATE_COLOUR_RULE' : 'CREATE_COLOUR_RULE',
    'ColourRule',
    obj.RuleID,
    before,
    obj,
    requestId
  );
  invalidateCalendarCaches_();
  return serialise_(obj);
}


function apiReorderColourRules_(actor,payload,requestId) {
  const ids=Array.isArray(payload.RuleIDs)?payload.RuleIDs.map(String):[];
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.COLOUR_RULES);
  const hits=tableObjectsWithRows_(sheet),byId={};hits.forEach(x=>byId[String(x.object.RuleID)]=x);
  if(!ids.length || ids.length!==hits.length || new Set(ids).size!==hits.length || ids.some(id=>!byId[id]))throw new Error('Formatting-rule order does not match the current backend rules.');
  const before=hits.map(x=>({RuleID:x.object.RuleID,Priority:x.object.Priority}));
  const ordered=[];
  rc18Atomic_(function(){
    ids.forEach((id,i)=>{const hit=byId[id],priority=(ids.length-i)*10;
      if(Number(hit.object.Priority)!==priority)rc18Patch_(sheet,hit.row,{Priority:priority});
      ordered.push(Object.assign({},hit.object,{Priority:priority}));});
    appendAudit_(actor,'REORDER_COLOUR_RULES','ColourRules','ALL',before,
      ordered.map(r=>({RuleID:r.RuleID,Priority:r.Priority})),requestId);
  });invalidateCalendarCaches_();const revision=calendarMetadataRevision_(calendarMetadataOrder_(ordered));return serialise_(ordered.map(r=>({...r,_orderRevision:revision,_metadataRevision:calendarMetadataRevision_(r)})));
}

function apiDeleteColourRule_(actor, payload, requestId) {
  const ruleId = String(payload.RuleID || '').trim();
  if (!ruleId) throw new Error('RuleID required.');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.COLOUR_RULES);
  const hit = findRowByKey_(sheet, 'RuleID', ruleId);
  if (!hit) throw new Error('Conditional formatting rule not found.');
  if (yes_(hit.object.Locked)) throw new Error('System formatting rules cannot be deleted.');

  const before = hit.object;
  rc18DeleteRow_(sheet,hit.row);
  appendAudit_(actor, 'DELETE_COLOUR_RULE', 'ColourRule', ruleId, before, null, requestId);
  invalidateCalendarCaches_();
  return { RuleID: ruleId, deleted: true };
}

function validateOptionalHexColour_(value, label) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return '';
  if (!/^#[0-9A-F]{6}$/.test(text)) {
    throw new Error((label || 'Colour') + ' must be a 6-digit hex colour such as #D9EAD3.');
  }
  return text;
}

function apiSaveLane_(actor, payload, requestId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet =
    ss.getSheetByName(CALV2.SHEETS.LANES);

  const id =
    String(payload.LaneID || '').trim();

  if (!id || !/^[a-z0-9_]+$/.test(id)) {
    throw new Error(
      'LaneID must use lower-case letters, numbers or underscore.'
    );
  }

  const hit =
    findRowByKey_(sheet, 'LaneID', id);

  const before =
    hit ? hit.object : null;

  const beforeSchedule =
    before
      ? laneScheduleRowsForLane_(id)
      : [];

  const supportsShift =
    yes_(payload.SupportsShift);

  const defaultEventType =
    normaliseLaneEventType_(
      payload.DefaultEventType
    );

  const legacyFallback =
    Object.assign(
      {},
      before || {},
      {
        LaneID: id,
        DefaultWeekday:
          payload.DefaultWeekday ||
          (before && before.DefaultWeekday) ||
          'ANY',
        DefaultStartTime:
          payload.DefaultStartTime ||
          (before && before.DefaultStartTime) ||
          '',
        DefaultEndTime:
          payload.DefaultEndTime ||
          (before && before.DefaultEndTime) ||
          '',
        ShiftADefaultStartTime:
          payload.ShiftADefaultStartTime ||
          (before && before.ShiftADefaultStartTime) ||
          '',
        ShiftADefaultEndTime:
          payload.ShiftADefaultEndTime ||
          (before && before.ShiftADefaultEndTime) ||
          '',
        ShiftBDefaultStartTime:
          payload.ShiftBDefaultStartTime ||
          (before && before.ShiftBDefaultStartTime) ||
          '',
        ShiftBDefaultEndTime:
          payload.ShiftBDefaultEndTime ||
          (before && before.ShiftBDefaultEndTime) ||
          ''
      }
    );

  const schedule =
    normaliseLaneSchedulePayload_(
      id,
      payload.Schedule,
      legacyFallback
    );

  validateLaneScheduleTimings_(
    schedule,
    supportsShift,
    defaultEventType
  );

  const enabled =
    schedule.filter(r => yes_(r.Enabled));

  const compatibilityRow =
    enabled[0] ||
    schedule[0] ||
    {};

  // These legacy fields remain for backwards compatibility only.
  // RC1.1 runtime behaviour uses LaneSchedule.
  const compatibilityWeekday =
    enabled.length === 1
      ? enabled[0].Weekday
      : 'ANY';

  const obj =
    Object.assign(
      {},
      before || {},
      {
        LaneID: id,
        Header:
          String(payload.Header || '').trim(),
        SortOrder:
          Number(payload.SortOrder || 999),
        Active:
          yes_(
            payload.Active === undefined
              ? 'Yes'
              : payload.Active
          )
            ? 'Yes'
            : 'No',
        SupportsShift:
          supportsShift ? 'Yes' : 'No',
        ShiftALabel:
          String(payload.ShiftALabel || ''),
        ShiftBLabel:
          String(payload.ShiftBLabel || ''),
        DefaultWeekday:
          compatibilityWeekday,
        DefaultEventType:
          defaultEventType,
        DefaultStartTime:
          timeText_(
            compatibilityRow.DefaultStartTime
          ),
        DefaultEndTime:
          timeText_(
            compatibilityRow.DefaultEndTime
          ),
        ShiftADefaultStartTime:
          timeText_(
            compatibilityRow.ShiftADefaultStartTime
          ),
        ShiftADefaultEndTime:
          timeText_(
            compatibilityRow.ShiftADefaultEndTime
          ),
        ShiftBDefaultStartTime:
          timeText_(
            compatibilityRow.ShiftBDefaultStartTime
          ),
        ShiftBDefaultEndTime:
          timeText_(
            compatibilityRow.ShiftBDefaultEndTime
          ),
        SyncToStaffCalendar:
          yes_(payload.SyncToStaffCalendar)
            ? 'Yes'
            : 'No',
        Notes:
          String(payload.Notes || '')
      }
    );

  if (!obj.Header) {
    throw new Error(
      'Lane header is required.'
    );
  }

  upsertObject_(
    sheet,
    CALV2.HEADERS.Lanes,
    'LaneID',
    id,
    obj
  );

  replaceLaneSchedule_(id, schedule);

  appendAudit_(
    actor,
    before ? 'UPDATE_LANE' : 'CREATE_LANE',
    'Lane',
    id,
    before
      ? Object.assign({}, before, {
          Schedule: beforeSchedule
        })
      : null,
    Object.assign({}, obj, {
      Schedule: schedule
    }),
    requestId
  );

  invalidateCalendarCaches_();

  return serialise_(
    Object.assign({}, obj, {
      Schedule: schedule
    })
  );
}


function normaliseLaneWeekday_(value) {
  const v = String(value || 'ANY').trim().toUpperCase();
  return ['ANY','MON','TUE','WED','THU','FRI','SAT','SUN'].includes(v) ? v : 'ANY';
}

function normaliseLaneEventType_(value) {
  const v = String(value || 'ALL_DAY').trim().toUpperCase();
  return ['ALL_DAY','TIMED','MULTI_DAY'].includes(v) ? v : 'ALL_DAY';
}

const LANE_WEEKDAY_CODES_ = Object.freeze([
  'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'
]);

function weekdayCodeForDate_(dateValue) {
  const text = dateText_(dateValue);
  if (!text) return '';

  const d = sgDate_(text);
  return ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()];
}

function legacyLaneScheduleRows_(lane) {
  const legacyDay =
    normaliseLaneWeekday_(lane && lane.DefaultWeekday);

  return LANE_WEEKDAY_CODES_.map(code => ({
    LaneID: String(lane && lane.LaneID || ''),
    Weekday: code,
    Enabled:
      legacyDay === 'ANY' || legacyDay === code
        ? 'Yes'
        : 'No',
    DefaultStartTime:
      timeText_(lane && lane.DefaultStartTime),
    DefaultEndTime:
      timeText_(lane && lane.DefaultEndTime),
    ShiftADefaultStartTime:
      timeText_(lane && lane.ShiftADefaultStartTime),
    ShiftADefaultEndTime:
      timeText_(lane && lane.ShiftADefaultEndTime),
    ShiftBDefaultStartTime:
      timeText_(lane && lane.ShiftBDefaultStartTime),
    ShiftBDefaultEndTime:
      timeText_(lane && lane.ShiftBDefaultEndTime)
  }));
}

function laneScheduleRowsForLane_(laneId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet =
    ss.getSheetByName(CALV2.SHEETS.LANE_SCHEDULE);

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  return tableObjects_(sheet)
    .filter(r =>
      String(r.LaneID || '') === String(laneId || '')
    )
    .sort((a, b) =>
      LANE_WEEKDAY_CODES_.indexOf(String(a.Weekday || '')) -
      LANE_WEEKDAY_CODES_.indexOf(String(b.Weekday || ''))
    );
}

function seedLaneScheduleFromLegacy_(ss) {
  const laneSheet =
    ss.getSheetByName(CALV2.SHEETS.LANES);

  const scheduleSheet =
    ss.getSheetByName(CALV2.SHEETS.LANE_SCHEDULE);

  if (!laneSheet || !scheduleSheet) return;

  const existing = new Set(
    tableObjects_(scheduleSheet).map(r =>
      String(r.LaneID || '') + '|' +
      String(r.Weekday || '').toUpperCase()
    )
  );

  const rows = [];

  tableObjects_(laneSheet).forEach(lane => {
    legacyLaneScheduleRows_(lane).forEach(row => {
      const key =
        String(row.LaneID) + '|' + String(row.Weekday);

      if (!existing.has(key)) {
        rows.push(
          CALV2.HEADERS.LaneSchedule.map(h =>
            row[h] === undefined ? '' : row[h]
          )
        );
      }
    });
  });

  if (rows.length) {
    scheduleSheet
      .getRange(
        scheduleSheet.getLastRow() + 1,
        1,
        rows.length,
        CALV2.HEADERS.LaneSchedule.length
      )
      .setValues(rows);
  }
}

function normaliseLaneSchedulePayload_(laneId, rawSchedule, legacyLane) {
  const supplied =
    Array.isArray(rawSchedule) ? rawSchedule : [];

  const fallback =
    legacyLaneScheduleRows_(
      Object.assign({}, legacyLane || {}, {
        LaneID: laneId
      })
    );

  return LANE_WEEKDAY_CODES_.map(code => {
    const input =
      supplied.find(r =>
        String(r && r.Weekday || '').toUpperCase() === code
      ) ||
      fallback.find(r => r.Weekday === code) ||
      {};

    return {
      LaneID: laneId,
      Weekday: code,
      Enabled: yes_(input.Enabled) ? 'Yes' : 'No',
      DefaultStartTime:
        timeText_(input.DefaultStartTime),
      DefaultEndTime:
        timeText_(input.DefaultEndTime),
      ShiftADefaultStartTime:
        timeText_(input.ShiftADefaultStartTime),
      ShiftADefaultEndTime:
        timeText_(input.ShiftADefaultEndTime),
      ShiftBDefaultStartTime:
        timeText_(input.ShiftBDefaultStartTime),
      ShiftBDefaultEndTime:
        timeText_(input.ShiftBDefaultEndTime)
    };
  });
}

function validateLaneScheduleTimings_(schedule, supportsShift, eventType) {
  if (String(eventType || '').toUpperCase() !== 'TIMED') {
    return;
  }

  schedule
    .filter(r => yes_(r.Enabled))
    .forEach(row => {
      if (supportsShift) {
        [
          ['PM(i)', row.ShiftADefaultStartTime, row.ShiftADefaultEndTime],
          ['PM(ii)', row.ShiftBDefaultStartTime, row.ShiftBDefaultEndTime]
        ].forEach(pair => {
          const start = timeText_(pair[1]);
          const end = timeText_(pair[2]);

          if (start && end && end <= start) {
            throw new Error(
              row.Weekday + ' ' + pair[0] +
              ': default end time must be later than start time.'
            );
          }
        });

      } else {
        const start = timeText_(row.DefaultStartTime);
        const end = timeText_(row.DefaultEndTime);

        if (start && end && end <= start) {
          throw new Error(
            row.Weekday +
            ': default end time must be later than start time.'
          );
        }
      }
    });
}

function replaceLaneSchedule_(laneId,schedule) {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.LANE_SCHEDULE);
  const existing=tableObjectsWithRows_(sheet).filter(x=>String(x.object.LaneID)===String(laneId));
  const used=new Set();
  rc18Atomic_(function(){
    schedule.forEach(obj=>{
      const hits=existing.filter(x=>String(x.object.Weekday)===String(obj.Weekday));
      if(hits.length>1)throw new Error('Duplicate lane/weekday schedule; no schedule changes saved.');
      const hit=hits[0]||null;if(hit)used.add(hit.row);
      rc18SaveObject_(sheet,CALV2.HEADERS.LaneSchedule,hit,obj);
    });
    // Obsolete rows (if any) are removed last, bottom-to-top, so patch coordinates stay valid.
    existing.filter(x=>!used.has(x.row)).sort((a,b)=>b.row-a.row).forEach(x=>rc18DeleteRow_(sheet,x.row));
  });
}

function laneScheduleForDate_(lane, dateValue) {
  if (!lane) return null;

  const code = weekdayCodeForDate_(dateValue);
  if (!code) return null;

  const rows =
    Array.isArray(lane.Schedule) && lane.Schedule.length
      ? lane.Schedule
      : legacyLaneScheduleRows_(lane);

  return rows.find(r =>
    String(r.Weekday || '').toUpperCase() === code
  ) || null;
}

function laneAvailableOnDate_(lane, dateValue) {
  const row = laneScheduleForDate_(lane, dateValue);
  return row ? yes_(row.Enabled) : true;
}


function seedLaneDefaults_(sheet) {
  const defaults = {};
  CALV2.DEFAULT_LANES.forEach(row => {
    const obj = {};
    CALV2.HEADERS.Lanes.forEach((h, i) => obj[h] = row[i] === undefined ? '' : row[i]);
    defaults[String(obj.LaneID)] = obj;
  });

  tableObjectsWithRows_(sheet).forEach(hit => {
    const d = defaults[String(hit.object.LaneID)];
    if (!d) return;
    const patch = {};
    [
      'DefaultWeekday','DefaultEventType','DefaultStartTime','DefaultEndTime',
      'ShiftADefaultStartTime','ShiftADefaultEndTime',
      'ShiftBDefaultStartTime','ShiftBDefaultEndTime'
    ].forEach(h => {
      if (!String(hit.object[h] || '').trim()) patch[h] = d[h] || '';
    });
    if (Object.keys(patch).length) updateRowPatch_(sheet, hit.row, patch);
  });
}

function apiSaveUser_(actor, payload, requestId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.USERS);
  const alias = normAlias_(payload.UserAlias);
  if (!alias || !/^[a-z0-9._-]+$/.test(alias)) throw new Error('Valid GSPS user alias required.');

  const hit = findRowByKeyCaseInsensitive_(sheet, 'UserAlias', alias);
  const before = hit ? hit.object : null;
  const now = isoNow_();
  const obj = Object.assign({}, before || {}, {
    UserAlias: alias,
    DisplayName: String(payload.DisplayName || aliasToDisplayName_(alias)),
    IsAdmin: yes_(payload.IsAdmin) ? 'Yes' : 'No',
    IsParentPublisher: yes_(payload.IsParentPublisher) ? 'Yes' : 'No',
    Active: yes_(payload.Active === undefined ? 'Yes' : payload.Active) ? 'Yes' : 'No',
    AddedAt: before ? before.AddedAt : now,
    AddedBy: before ? before.AddedBy : actor.userAlias,
    Notes: String(payload.Notes || '')
  });

  upsertObject_(sheet, CALV2.HEADERS.Users, 'UserAlias', before ? before.UserAlias : alias, obj);
  appendAudit_(actor, before ? 'UPDATE_USER_ROLE' : 'ADD_USER_ROLE', 'User', alias, before, obj, requestId);
  invalidateCalendarCaches_();
  return serialise_(obj);
}



function apiSaveUrls_(actor, payload, requestId) {
  const before = {
    staffCalendarUrl: setting_('STAFF_CALENDAR_URL'),
    parentCalendarUrl: setting_('PARENT_CALENDAR_URL'),
    staffCalendarId: setting_('STAFF_CALENDAR_ID'),
    parentCalendarId: setting_('PARENT_CALENDAR_ID')
  };

  const staffUrl = String(payload.staffCalendarUrl || '').trim();
  const parentUrl = String(payload.parentCalendarUrl || '').trim();
  if (!staffUrl || !parentUrl) throw new Error('Both Calendar URLs are required.');

  const staffId = calendarIdFromUrl_(staffUrl);
  const parentId = calendarIdFromUrl_(parentUrl);

  setSetting_('STAFF_CALENDAR_URL', staffUrl, 'Open/subscription URL for the staff-wide calendar.');
  setSetting_('PARENT_CALENDAR_URL', parentUrl, 'Open/subscription URL for the parent-only calendar.');
  setSetting_('STAFF_CALENDAR_ID', staffId, 'Staff-wide Google Calendar.');
  setSetting_('PARENT_CALENDAR_ID', parentId, 'Parent-only Google Calendar.');

  const after = {
    staffCalendarUrl: staffUrl,
    parentCalendarUrl: parentUrl,
    staffCalendarId: staffId,
    parentCalendarId: parentId
  };
  appendAudit_(actor, 'UPDATE_CALENDAR_URLS', 'Settings', 'CalendarURLs', before, after, requestId);
  return after;
}

function calendarIdFromUrl_(urlText) {
  const m = String(urlText).match(/[?&]cid=([^&#]+)/i);
  if (!m) throw new Error('Calendar URL must contain a cid= parameter.');
  const cid = decodeURIComponent(m[1]);
  let bytes;
  try { bytes = Utilities.base64DecodeWebSafe(cid); }
  catch (err) {
    try { bytes = Utilities.base64Decode(cid); }
    catch (err2) { throw new Error('Could not decode Calendar cid parameter.'); }
  }
  const calendarId = Utilities.newBlob(bytes).getDataAsString('UTF-8').trim();
  if (!calendarId || calendarId.indexOf('@') < 0) throw new Error('Decoded Calendar ID is invalid.');
  return calendarId;
}


function canonicalSyncState_(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'DIRTY') return 'PENDING_SYNC';
  if (v === 'DELETE_PENDING') return 'PENDING_REMOVAL';
  if (v === 'PENDING_SYNC' || v === 'PENDING_REMOVAL' ||
      v === 'SYNCED' || v === 'ERROR') return v;
  return v;
}

function syncStateNeedsWork_(value) {
  const v = canonicalSyncState_(value);
  return v === 'PENDING_SYNC' || v === 'PENDING_REMOVAL' || v === 'ERROR';
}

function migrateSyncStateVocabulary_() {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.EVENTS),requests=[];
  rc18Projection_(sheet,['StaffSyncState','ParentSyncState']).forEach(x=>{
    const patch={};['StaffSyncState','ParentSyncState'].forEach(k=>{const next=canonicalSyncState_(x.object[k]);if(next!==x.object[k])patch[k]=next;});
    requests.push.apply(requests,rc18PatchRequests_(sheet,x.row,patch));
  });rc18MaintenanceWrites_(requests);
}

/* =========================
 * DIFFERENTIAL GOOGLE CALENDAR SYNC
 * ========================= */


function calendarApiMessage_(err) {
  if(err && /^CALENDAR_/.test(String(err.code||'')))return err.message;
  const f=calendarApiFailure_(err),messages={DAILY_QUOTA:'Google Calendar daily quota reached. Review quota usage before resuming.',CALENDAR_USAGE_LIMIT:'Google Calendar usage limit reached. Review Calendar limits before resuming.',APPS_SCRIPT_QUOTA:'Apps Script Calendar quota reached. Review execution quotas before resuming.',API_DISABLED:'Enable the Google Calendar API in the linked Cloud project.',AUTH_REQUIRED:'Authorise the deployment account for Google Calendar access.',ACCESS_DENIED:'The deployment account does not have permission for this Calendar.',NOT_FOUND:'The Calendar ID is wrong or this account cannot see that Calendar.',RATE_LIMIT:'Google Calendar rate limit reached. Wait, then retry.',SERVICE_UNAVAILABLE:'Google Calendar is temporarily unavailable. Retry the same operation.',CONFLICT:'The Calendar event changed during sync. Retry to read its latest version.'};
  return messages[f.reason] || String(err && err.message || 'Calendar operation failed.');
}
function apiCalendarPreflight_(actor, payload, requestId) {
  const testWrite=yes_(payload && payload.testWrite),results={};
  ['staff','parent'].forEach(target=>{
    const calendarId=calendarIdForTarget_(target),result={target:target,label:calendarLabelForTarget_(target),calendarId:calendarId||'',configured:!!calendarId,accessible:false,name:'',timeZone:'',accessRole:'',writeTestRequested:testWrite,writable:null,error:'',api:'Calendar v3'};
    try {
      const calendar=calendarApiAccess_(calendarId,target,false);
      Object.assign(result,{accessible:true,name:calendar.summary,timeZone:calendar.timeZone,accessRole:calendar.accessRole,writable:calendar.writable});
      if(testWrite) {
        const ev={EventID:'ACCESS-PROBE-'+sha256_(requestId+'|'+target),OwnerTag:'test',StaffTitle:'Calendar access test',StaffDescription:'Temporary access probe. Automatically removed.',ParentTitle:'Calendar access test',ParentDescription:'Temporary access probe. Automatically removed.',EventType:'ALL_DAY',StartDate:'2099-12-31',EndDate:'2099-12-31'};
        try {syncTarget_(calendar,target,ev,true);result.writable=true;}
        finally {
          try {syncTarget_(calendar,target,ev,false);}
          catch(cleanupError){result.error='Access probe removal could not be confirmed. '+calendarApiMessage_(cleanupError);}
        }
      }
    } catch(err) {
      result.error=calendarApiMessage_(err)+(result.error?' '+result.error:'');
      result.reason=err.code || calendarApiFailure_(err).reason;
      result.status=calendarApiFailure_(err).status;
      if(testWrite)result.writable=false;
    }
    results[target]=result;
  });
  appendAudit_(actor,'CALENDAR_PREFLIGHT','Settings','CalendarAccess',null,results,requestId);
  return serialise_({testedAt:isoNow_(),effectiveUser:String(Session.getEffectiveUser().getEmail()||''),testWrite:testWrite,staff:results.staff,parent:results.parent});
}

function operationSessionEpoch_(session) {
  if (!session) return 0;

  const direct =
    Number(
      session.lastActivityEpochMs ||
      session.startedEpochMs ||
      0
    );

  if (direct) return direct;

  const text =
    String(
      session.lastActivityAt ||
      session.resumedAt ||
      session.lastBatchAt ||
      session.startedAt ||
      ''
    );

  const parsed =
    text ? new Date(text).getTime() : 0;

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function operationStatus_() {
  const staleHours =
    Math.max(
      1,
      Number(
        setting_('OPERATION_STALE_HOURS') ||
        6
      )
    );

  const thresholdMs =
    staleHours * 60 * 60 * 1000;

  const describe = function(kind, session) {
    if (!session) return null;

    const activityEpoch =
      operationSessionEpoch_(session);

    const ageMs =
      activityEpoch
        ? Math.max(
            0,
            Date.now() - activityEpoch
          )
        : 0;

    return {
      kind: kind,
      id:
        String(
          kind === 'sync'
            ? session.syncRunId || ''
            : session.wipeId || ''
        ),
      target:
        String(session.target || ''),
      year:
        Number(session.year || 0),
      startedAt:
        String(session.startedAt || ''),
      lastActivityAt:
        String(
          session.lastActivityAt ||
          session.lastBatchAt ||
          session.resumedAt ||
          session.startedAt ||
          ''
        ),
      ageMinutes:
        Math.round(ageMs / 60000),
      stale:
        !!activityEpoch && !session.paused && !session.nextAttemptEpochMs &&
        ageMs >= thresholdMs,
      staleAfterHours:
        staleHours,
      startedBy:
        String(session.startedBy || '')
    };
  };

  return {
    staleAfterHours:
      staleHours,
    sync:
      describe(
        'sync',
        readCalendarSyncSession_()
      ),
    wipe:
      describe(
        'wipe',
        readCalendarWipeSession_()
      )
  };
}

function addHealthIssue_(ctx, severity, code, message, entityId) {
  const level =
    String(severity || 'WARNING')
      .toUpperCase();

  if (level === 'ERROR') {
    ctx.errorCount++;
  } else {
    ctx.warningCount++;
  }

  if (ctx.issues.length < 250) {
    ctx.issues.push({
      severity:
        level,
      code:
        String(code || ''),
      message:
        String(message || ''),
      entityId:
        String(entityId || '')
    });
  } else {
    ctx.truncated = true;
  }
}

function runConsistencyAuditCore_(options) {
  const opts =
    options || {};

  const includeCalendar =
    !!opts.includeCalendar;

  const requestedYears = {};

  if (Array.isArray(opts.years)) {
    opts.years.forEach(y => {
      const n = Number(y);
      if (Number.isInteger(n)) {
        requestedYears[n] = true;
      }
    });
  }

  const singleYear =
    Number(opts.year || 0);

  if (Number.isInteger(singleYear) && singleYear) {
    requestedYears[singleYear] = true;
  }

  const hasYearFilter =
    Object.keys(requestedYears).length > 0;

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const ctx = {
    issues: [],
    errorCount: 0,
    warningCount: 0,
    truncated: false
  };

  // Schema/header integrity.
  Object.keys(CALV2.HEADERS)
    .forEach(sheetName => {
      const sheet =
        ss.getSheetByName(sheetName);

      if (!sheet) {
        addHealthIssue_(
          ctx,
          'ERROR',
          'MISSING_SHEET',
          'Missing required sheet: ' +
          sheetName,
          sheetName
        );
        return;
      }

      const expected =
        CALV2.HEADERS[sheetName];

      const actual =
        sheet
          .getRange(
            1,
            1,
            1,
            expected.length
          )
          .getDisplayValues()[0]
          .map(v =>
            String(v || '').trim()
          );

      const exact =
        expected.every(
          (header, index) =>
            actual[index] === header
        );

      if (!exact) {
        addHealthIssue_(
          ctx,
          'ERROR',
          'HEADER_MISMATCH',
          'Header mismatch in ' +
          sheetName +
          '. Run upgradeCalendarToRC19() before making writes.',
          sheetName
        );
      }
    });

  const settings =
    settingsMapCached_();

  if (
    String(
      settings.APP_VERSION || ''
    ) !== CALV2.VERSION
  ) {
    addHealthIssue_(
      ctx,
      'ERROR',
      'VERSION_MISMATCH',
      'Settings APP_VERSION is "' +
      String(settings.APP_VERSION || '') +
      '" but backend code is "' +
      CALV2.VERSION +
      '".',
      'APP_VERSION'
    );
  }

  // Active Admin invariant.
  const users =
    tableObjects_(
      ss.getSheetByName(
        CALV2.SHEETS.USERS
      )
    );

  const adminCount =
    users.filter(user =>
      yes_(user.Active) &&
      yes_(user.IsAdmin)
    ).length;

  if (!adminCount) {
    addHealthIssue_(
      ctx,
      'ERROR',
      'NO_ACTIVE_ADMIN',
      'No active Admin exists in Users.',
      'Users'
    );
  }

  const lanes =
    tableObjects_(
      ss.getSheetByName(
        CALV2.SHEETS.LANES
      )
    );

  const laneById = {};

  lanes.forEach(lane => {
    const id =
      String(lane.LaneID || '').trim();

    if (id) {
      laneById[id] = lane;
    }
  });

  const scheduleRows =
    tableObjects_(
      ss.getSheetByName(
        CALV2.SHEETS.LANE_SCHEDULE
      )
    );

  lanes.forEach(lane => {
    const laneId =
      String(lane.LaneID || '').trim();

    LANE_WEEKDAY_CODES_
      .forEach(day => {
        const matches =
          scheduleRows.filter(row =>
            String(row.LaneID || '') ===
              laneId &&
            String(row.Weekday || '')
              .toUpperCase() === day
          );

        if (!matches.length) {
          addHealthIssue_(
            ctx,
            'ERROR',
            'MISSING_LANE_SCHEDULE',
            'Lane ' +
            laneId +
            ' is missing ' +
            day +
            ' schedule row.',
            laneId
          );

        } else if (matches.length > 1) {
          addHealthIssue_(
            ctx,
            'ERROR',
            'DUPLICATE_LANE_SCHEDULE',
            'Lane ' +
            laneId +
            ' has duplicate ' +
            day +
            ' schedule rows.',
            laneId
          );
        }
      });
  });

  const tags =
    tableObjects_(
      ss.getSheetByName(
        CALV2.SHEETS.TAGS
      )
    );

  const activeTags = {};

  tags.forEach(tag => {
    if (yes_(tag.Active)) {
      activeTags[
        String(tag.Tag || '')
          .trim()
          .toLowerCase()
      ] = true;
    }
  });

  const years =
    tableObjects_(
      ss.getSheetByName(
        CALV2.SHEETS.YEARS
      )
    );

  years.forEach(row => {
    if (
      String(row.Status || '')
        .toUpperCase() ===
        'ARCHIVED' &&
      !String(
        row.ArchiveSpreadsheetFileId || ''
      ).trim()
    ) {
      addHealthIssue_(
        ctx,
        'WARNING',
        'ARCHIVE_POINTER_MISSING',
        'Archived year ' +
        row.Year +
        ' has no ArchiveSpreadsheetFileId.',
        String(row.Year || '')
      );
    }
  });

  const events =
    tableObjects_(
      ss.getSheetByName(
        CALV2.SHEETS.EVENTS
      )
    )
      .filter(ev =>
        !hasYearFilter ||
        !!requestedYears[
          Number(ev.Year)
        ]
      );

  const eventIds = {};
  const staffIds = {};
  const parentIds = {};
  const markers = {};
  const validSyncStates = {
    PENDING_SYNC: true,
    PENDING_REMOVAL: true,
    SYNCED: true,
    ERROR: true,
    DIRTY: true,
    DELETE_PENDING: true
  };

  const activeConfig =
    configCached_();

  const activeLaneById = {};

  (activeConfig.lanes || [])
    .forEach(lane => {
      activeLaneById[
        String(lane.LaneID || '')
      ] = lane;
    });

  events.forEach(ev => {
    const eventId =
      String(ev.EventID || '').trim();

    if (!eventId) {
      addHealthIssue_(
        ctx,
        'ERROR',
        'MISSING_EVENT_ID',
        'Event row has no EventID.',
        ''
      );
    } else {
      eventIds[eventId] =
        Number(eventIds[eventId] || 0) + 1;

      if (eventIds[eventId] > 1) {
        addHealthIssue_(
          ctx,
          'ERROR',
          'DUPLICATE_EVENT_ID',
          'Duplicate EventID: ' +
          eventId,
          eventId
        );
      }
    }

    const year =
      Number(ev.Year);

    if (!Number.isInteger(year)) {
      addHealthIssue_(
        ctx,
        'ERROR',
        'INVALID_EVENT_YEAR',
        'Event has invalid Year.',
        eventId
      );
    }

    const laneId =
      String(ev.LaneID || '').trim();

    if (!laneById[laneId]) {
      addHealthIssue_(
        ctx,
        'ERROR',
        'UNKNOWN_LANE',
        'Event references unknown lane "' +
        laneId +
        '".',
        eventId
      );

    } else if (!yes_(laneById[laneId].Active)) {
      addHealthIssue_(
        ctx,
        'WARNING',
        'INACTIVE_LANE',
        'Event references inactive lane "' +
        laneId +
        '".',
        eventId
      );
    }

    const tag =
      String(ev.OwnerTag || '')
        .trim()
        .toLowerCase();

    if (!tag || !activeTags[tag]) {
      addHealthIssue_(
        ctx,
        'ERROR',
        'INVALID_OWNER_TAG',
        'Event references missing/inactive OwnerTag "' +
        String(ev.OwnerTag || '') +
        '".',
        eventId
      );
    }

    const type =
      String(ev.EventType || '')
        .toUpperCase();

    if (
      type !== 'ALL_DAY' &&
      type !== 'TIMED' &&
      type !== 'MULTI_DAY'
    ) {
      addHealthIssue_(
        ctx,
        'ERROR',
        'INVALID_EVENT_TYPE',
        'Unsupported EventType "' +
        type +
        '".',
        eventId
      );
    }

    const start =
      dateText_(ev.StartDate);

    const end =
      dateText_(
        ev.EndDate ||
        ev.StartDate
      );

    if (!start) {
      addHealthIssue_(
        ctx,
        'ERROR',
        'MISSING_START_DATE',
        'Event is missing StartDate.',
        eventId
      );
    }

    if (
      type === 'MULTI_DAY' &&
      (!end || end < start)
    ) {
      addHealthIssue_(
        ctx,
        'ERROR',
        'INVALID_MULTI_DAY_RANGE',
        'MULTI_DAY Event has invalid StartDate/EndDate.',
        eventId
      );
    }

    if (type === 'TIMED') {
      const startTime =
        timeText_(ev.StartTime);

      const endTime =
        timeText_(ev.EndTime);

      if (
        !startTime ||
        !endTime ||
        (end === start && endTime <= startTime)
      ) {
        addHealthIssue_(
          ctx,
          'ERROR',
          'INVALID_TIMED_RANGE',
          'TIMED Event has invalid start/end time.',
          eventId
        );
      }
    }

    const activeLane =
      activeLaneById[laneId];

    if (
      activeLane &&
      start &&
      !laneAvailableOnDate_(
        activeLane,
        start
      )
    ) {
      addHealthIssue_(
        ctx,
        'WARNING',
        'OFF_PATTERN_EVENT',
        'Event falls on a weekday disabled for lane "' +
        laneId +
        '". Existing legacy placement is preserved.',
        eventId
      );
    }

    [
      ['StaffSyncState', ev.StaffSyncState],
      ['ParentSyncState', ev.ParentSyncState]
    ].forEach(pair => {
      const value =
        String(pair[1] || '')
          .trim()
          .toUpperCase();

      if (
        value &&
        !validSyncStates[value]
      ) {
        addHealthIssue_(
          ctx,
          'ERROR',
          'INVALID_SYNC_STATE',
          pair[0] +
          ' contains unsupported value "' +
          value +
          '".',
          eventId
        );

      } else if (
        canonicalSyncState_(value) ===
        'ERROR'
      ) {
        addHealthIssue_(
          ctx,
          'WARNING',
          'SYNC_STATE_ERROR',
          pair[0] +
          ' is in ERROR state and should be reviewed/retried.',
          eventId
        );
      }
    });

    const staffId =
      String(
        ev.StaffCalendarEventId || ''
      ).trim();

    if (staffId) {
      staffIds[staffId] =
        Number(staffIds[staffId] || 0) + 1;

      if (staffIds[staffId] > 1) {
        addHealthIssue_(
          ctx,
          'ERROR',
          'DUPLICATE_STAFF_CALENDAR_ID',
          'More than one Event references the same Staff Calendar event ID.',
          staffId
        );
      }
    }

    const parentId =
      String(
        ev.ParentCalendarEventId || ''
      ).trim();

    if (parentId) {
      parentIds[parentId] =
        Number(parentIds[parentId] || 0) + 1;

      if (parentIds[parentId] > 1) {
        addHealthIssue_(
          ctx,
          'ERROR',
          'DUPLICATE_PARENT_CALENDAR_ID',
          'More than one Event references the same Parent Calendar event ID.',
          parentId
        );
      }
    }

    const description =
      String(ev.StaffDescription || '');

    const marker =
      description.match(
        /\[\[GSPS_YEAR_STRUCTURE:[^\]]+\]\]/
      );

    if (marker) {
      const key =
        String(year) +
        '|' +
        marker[0];

      markers[key] =
        Number(markers[key] || 0) + 1;

      if (markers[key] > 1) {
        addHealthIssue_(
          ctx,
          'ERROR',
          'DUPLICATE_STRUCTURE_MARKER',
          'Duplicate generated structure marker: ' +
          marker[0],
          eventId
        );
      }
    }
  });

  const operations =
    operationStatus_();

  ['sync', 'wipe']
    .forEach(kind => {
      const op =
        operations[kind];

      if (op && op.stale) {
        addHealthIssue_(
          ctx,
          'WARNING',
          'STALE_' +
          kind.toUpperCase() +
          '_SESSION',
          'A ' +
          kind +
          ' session has had no activity for ' +
          op.ageMinutes +
          ' minutes and may be explicitly cleared.',
          op.id
        );
      }
    });

  const calendars = {};

  if (includeCalendar) {
    ['staff', 'parent']
      .forEach(target => {
        const label =
          calendarLabelForTarget_(
            target
          );

        const calendarId =
          calendarIdForTarget_(
            target
          );

        const result = {
          configured:
            !!calendarId,
          accessible:
            false,
          name:
            '',
          error:
            ''
        };

        if (!calendarId) {
          result.error =
            label +
            ' Calendar ID is not configured.';

          addHealthIssue_(
            ctx,
            'WARNING',
            'CALENDAR_NOT_CONFIGURED',
            result.error,
            target
          );

        } else {
          try {
            const calendar =
              CalendarApp.getCalendarById(
                calendarId
              );

            if (calendar) {
              result.accessible = true;

              try {
                result.name =
                  calendar.getName();
              } catch (err) {}

            } else {
              result.error =
                label +
                ' Calendar is not visible to the execution account.';

              addHealthIssue_(
                ctx,
                'WARNING',
                'CALENDAR_NOT_ACCESSIBLE',
                result.error,
                target
              );
            }

          } catch (err) {
            result.error =
              String(
                err && err.message
                  ? err.message
                  : err
              );

            addHealthIssue_(
              ctx,
              'WARNING',
              'CALENDAR_ACCESS_ERROR',
              label +
              ' Calendar access check failed: ' +
              result.error,
              target
            );
          }
        }

        calendars[target] =
          result;
      });
  }

  return {
    checkedAt:
      isoNow_(),
    version:
      CALV2.VERSION,
    yearFilter:
      Object.keys(requestedYears)
        .map(Number)
        .sort((a, b) => a - b),
    summary: {
      errors:
        ctx.errorCount,
      warnings:
        ctx.warningCount,
      status:
        ctx.errorCount
          ? 'ERROR'
          : ctx.warningCount
            ? 'WARNING'
            : 'OK'
    },
    issues:
      ctx.issues,
    truncated:
      ctx.truncated,
    operations:
      operations,
    calendars:
      calendars,
    counts: {
      eventsChecked:
        events.length,
      lanes:
        lanes.length,
      laneScheduleRows:
        scheduleRows.length,
      activeTags:
        Object.keys(activeTags).length,
      activeAdmins:
        adminCount
    }
  };
}

function assertOperationalHealthFor_(operation, years) {
  const list =
    Array.isArray(years)
      ? years
      : [years];

  const audit =
    runConsistencyAuditCore_({
      years:
        list,
      includeCalendar:
        false
    });

  if (
    audit.summary &&
    Number(audit.summary.errors || 0) > 0
  ) {
    const first =
      (audit.issues || [])
        .filter(issue =>
          issue.severity === 'ERROR'
        )
        .slice(0, 5)
        .map(issue =>
          issue.code +
          ': ' +
          issue.message
        )
        .join(' | ');

    throw new Error(
      String(operation || 'Operation') +
      ' blocked by Calendar integrity check. ' +
      first +
      ' Run URL Setup → Stable Release Health for the full report.'
    );
  }

  return audit;
}

function apiHealthCheck_(actor, payload, requestId) {
  const year =
    Number(payload && payload.year || 0);

  const audit =
    runConsistencyAuditCore_({
      year:
        Number.isInteger(year)
          ? year
          : 0,
      includeCalendar:
        yes_(
          payload &&
          payload.includeCalendar
        )
    });

  appendAudit_(
    actor,
    'RUN_HEALTH_CHECK',
    'System',
    year ? String(year) : 'ALL',
    null,
    {
      summary:
        audit.summary,
      yearFilter:
        audit.yearFilter
    },
    requestId
  );

  audit.venueDirectory=calendarVenueDirectoryStatus_(actor);
  return serialise_(audit);
}

function createSafetySnapshot_(actor, reason, details) {
  const folderId =
    setting_(
      'SHARED_DRIVE_FOLDER_ID'
    );

  if (!folderId) {
    throw new Error(
      'Cannot create safety snapshot: SHARED_DRIVE_FOLDER_ID is not configured.'
    );
  }

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const folder =
    DriveApp.getFolderById(
      folderId
    );

  const stamp =
    Utilities.formatDate(
      new Date(),
      CALV2.TZ,
      'yyyyMMdd-HHmmss'
    );

  const safeReason =
    String(reason || 'operation')
      .replace(
        /[^A-Za-z0-9_-]+/g,
        '-'
      )
      .replace(
        /-+/g,
        '-'
      )
      .replace(
        /^-|-$/g,
        ''
      )
      .slice(0, 60);

  const name =
    'GSPS-Calendar-SafetySnapshot_RC1.9_' +
    safeReason +
    '_' +
    stamp;

  const file =
    DriveApp
      .getFileById(ss.getId())
      .makeCopy(
        name,
        folder
      );

  const result = {
    fileId:
      file.getId(),
    fileName:
      name,
    createdAt:
      isoNow_(),
    reason:
      String(reason || ''),
    details:
      details || {}
  };

  try {
    pruneSafetySnapshots_(
      folder,
      Number(
        setting_(
          'SAFETY_SNAPSHOT_RETENTION'
        ) || 5
      )
    );
  } catch (err) {
    result.retentionWarning =
      String(
        err && err.message
          ? err.message
          : err
      );
  }

  try {
    appendAudit_(
      actor,
      'CREATE_SAFETY_SNAPSHOT',
      'System',
      result.fileId,
      null,
      result,
      'SNAPSHOT-' +
      Utilities.getUuid()
    );
  } catch (err) {}

  return result;
}

function pruneSafetySnapshots_(folder, retention) {
  const keep =
    Math.max(
      1,
      Math.min(
        20,
        Number(retention || 5)
      )
    );

  const files =
    folder.getFiles();

  const snapshots = [];

  while (files.hasNext()) {
    const file =
      files.next();

    if (
      String(file.getName() || '')
        .indexOf(
          'GSPS-Calendar-SafetySnapshot_RC1.9_'
        ) === 0
    ) {
      snapshots.push(file);
    }
  }

  snapshots.sort(
    (a, b) =>
      b.getDateCreated().getTime() -
      a.getDateCreated().getTime()
  );

  snapshots
    .slice(keep)
    .forEach(file => {
      try {
        file.setTrashed(true);
      } catch (err) {
        // Cleanup is best effort. Snapshot creation itself must not fail.
      }
    });
}

function apiClearStaleOperation_(actor, payload, requestId) {
  const kind =
    String(
      payload &&
      payload.kind ||
      ''
    )
      .trim()
      .toLowerCase();

  if (
    kind !== 'sync' &&
    kind !== 'wipe'
  ) {
    throw new Error(
      'Operation kind must be sync or wipe.'
    );
  }

  const status =
    operationStatus_();

  const op =
    status[kind];

  if (!op) {
    return serialise_({
      ok: true,
      cleared: false,
      reason: 'No active ' + kind + ' session.'
    });
  }

  if (!op.stale) {
    throw new Error(
      'Active ' +
      kind +
      ' session is only ' +
      op.ageMinutes +
      ' minutes old. It may be cleared only after ' +
      status.staleAfterHours +
      ' hours without activity.'
    );
  }

  if (kind === 'sync') {
    clearCalendarSyncSession_();
  } else {
    clearCalendarWipeSession_();
  }

  appendAudit_(
    actor,
    'CLEAR_STALE_OPERATION',
    'System',
    op.id,
    op,
    {
      cleared:
        true,
      kind:
        kind
    },
    requestId
  );

  return serialise_({
    ok: true,
    cleared: true,
    operation: op
  });
}

function calendarEventFingerprint_(event) {
  let startText = '';
  let endText = '';

  try {
    const start =
      event.getStartTime();

    startText =
      Utilities.formatDate(
        start,
        CALV2.TZ,
        event.isAllDayEvent()
          ? 'yyyy-MM-dd'
          : 'yyyy-MM-dd HH:mm'
      );
  } catch (err) {}

  try {
    const end =
      event.getEndTime();

    if (event.isAllDayEvent()) {
      endText =
        Utilities.formatDate(
          addDays_(end, -1),
          CALV2.TZ,
          'yyyy-MM-dd'
        );
    } else {
      endText =
        Utilities.formatDate(
          end,
          CALV2.TZ,
          'yyyy-MM-dd HH:mm'
        );
    }
  } catch (err) {}

  let title = '';

  try {
    title =
      String(
        event.getTitle() || ''
      );
  } catch (err) {}

  return (
    title +
    '|' +
    startText +
    '|' +
    endText
  );
}

function apiCalendarReconciliationPreview_(actor, payload, requestId) {
  const year=Number(payload && payload.year),target=normaliseCalendarTarget_(payload && payload.target || 'staff');
  if(!Number.isInteger(year))throw new Error('Year required.');
  const context=syncYearContext_(year,target),rows=tableObjects_(context.eventsSheet).filter(ev=>Number(ev.Year)===year),window=calendarWipeWindowForYear_(year);
  const events=calendarApiList_(context.calendarId,{timeMin:window.startDate+'T00:00:00+08:00',timeMax:Utilities.formatDate(addDays_(sgDate_(window.endDate),1),CALV2.TZ,'yyyy-MM-dd')+'T00:00:00+08:00',showDeleted:false,maxResults:250},target,'');
  const byId={},byLegacy={},fingerprints={},linkedIds=new Set(),samples={linkedMissing:[],desiredUnlinked:[],linkedButUndesired:[],hashDrift:[],remoteDrift:[],unlinkedCalendar:[],duplicateLooking:[],ownershipRecovery:[]};
  events.forEach(remote=>{
    byId[remote.id]=remote;
    if(remote.iCalUID)(byLegacy[remote.iCalUID]||(byLegacy[remote.iCalUID]=[])).push(remote);
    const fp=sha256_(JSON.stringify({title:remote.summary||'',start:remote.start,end:remote.end}));
    (fingerprints[fp]||(fingerprints[fp]=[])).push(remote.id);
  });
  let linkedPresent=0,linkedMissing=0,desiredUnlinked=0,linkedButUndesired=0,hashDrift=0,remoteDrift=0;
  const prefix=target==='staff'?'Staff':'Parent',idField=prefix+'CalendarEventId',hashField=prefix+'SyncHash';
  rows.forEach(ev=>{
    const legacy=String(ev[idField]||''),link=calendarApiLink_(target,context.calendarId,ev),hasLink=!!(legacy || (link && link.state!=='removed'));
    let remote=link && link.state!=='removed'?byId[link.apiId]:null;
    let matches=legacy?byLegacy[legacy]||[]:[];
    // A linked event moved outside the year window is content drift, not absence.
    // This exact iCalUID lookup is read-only and does not migrate the legacy link.
    if(!remote && !link && legacy && !matches.length)matches=calendarApiList_(context.calendarId,{iCalUID:legacy,showDeleted:false,maxResults:250},target,ev.EventID);
    if(!remote && !link && matches.length===1 && matches[0].iCalUID===legacy && !matches[0].recurringEventId && !(matches[0].recurrence||[]).length)remote=matches[0];
    if(!remote && link && link.state!=='removed')remote=calendarApiGet_(context.calendarId,link.apiId,target,ev);
    const desired=desiredSyncState_(target,ev,context.yearRow,context.laneMap),sample={eventId:ev.EventID,title:ev.StaffTitle,calendarEventId:legacy,apiEventId:remote?remote.id:link?link.apiId:''};
    if(hasLink) {
      if(remote){linkedPresent++;linkedIds.add(remote.id);}
      else{linkedMissing++;if(samples.linkedMissing.length<30)samples.linkedMissing.push(sample);}
    } else if(desired) {
      desiredUnlinked++;if(samples.desiredUnlinked.length<30)samples.desiredUnlinked.push(sample);
      const owned=events.filter(x=>calendarApiOwned_(x,target,ev));
      if(owned.length===1 && samples.ownershipRecovery.length<30)samples.ownershipRecovery.push(Object.assign({},sample,{apiEventId:owned[0].id}));
    }
    if(!desired && hasLink){linkedButUndesired++;if(samples.linkedButUndesired.length<30)samples.linkedButUndesired.push(sample);}
    if(desired) {
      const spec=target==='staff'?staffCalendarSpec_(ev):parentCalendarSpec_(ev);
      const remoteChanged=remote && !calendarApiSameFields_(remote,spec);
      if(remoteChanged || (canonicalSyncState_(ev[prefix+'SyncState'])==='SYNCED' && sha256_(JSON.stringify(spec))!==String(ev[hashField]||''))){
        hashDrift++;if(samples.hashDrift.length<30)samples.hashDrift.push(sample);
      }
      if(remoteChanged){
        remoteDrift++;if(samples.remoteDrift.length<30)samples.remoteDrift.push(sample);
      }
    }
  });
  const unlinked=events.filter(e=>!linkedIds.has(e.id)),duplicates=Object.keys(fingerprints).filter(k=>fingerprints[k].length>1);
  unlinked.slice(0,30).forEach(e=>samples.unlinkedCalendar.push({calendarEventId:e.iCalUID||'',apiEventId:e.id,title:e.summary||''}));
  duplicates.slice(0,30).forEach(fp=>samples.duplicateLooking.push({fingerprint:fp,count:fingerprints[fp].length,ids:fingerprints[fp].slice(0,8)}));
  const result={checkedAt:isoNow_(),target:target,year:year,calendarId:context.calendarId,calendarName:context.calendar.summary,window:window,backendEvents:rows.length,calendarEvents:events.length,
    linkedPresent:linkedPresent,linkedMissing:linkedMissing,desiredUnlinked:desiredUnlinked,linkedButUndesired:linkedButUndesired,hashDrift:hashDrift,remoteDrift:remoteDrift,unlinkedCalendarEvents:unlinked.length,duplicateLookingGroups:duplicates.length,samples:samples,
    note:'Read-only Calendar preview. Remote changes are compared with the source fields. Unrelated and duplicate-looking events are never adopted or deleted by this preview.'};
  appendAudit_(actor,'CALENDAR_RECONCILIATION_PREVIEW','Year',String(year),null,{target:target,linkedMissing:linkedMissing,desiredUnlinked:desiredUnlinked,remoteDrift:remoteDrift,unlinkedCalendarEvents:unlinked.length,duplicateLookingGroups:duplicates.length},requestId);
  return serialise_(result);
}

/** Read-only diagnostics used by Stable Release Health and the Apps Script editor. */
function runCalendarSelfTests() {
  const tests=[];
  const test=(name,check)=>{
    try {
      if(check()!==true)throw new Error('Assertion failed.');
      tests.push({name:name,ok:true,error:''});
    } catch(error) { tests.push({name:name,ok:false,error:String(error.message||error)}); }
  };
  test('inclusiveDays_ counts inclusive range',()=>inclusiveDays_('2027-01-04','2027-01-10')===7);
  test('mondayOnOrAfter_ returns Monday',()=>Utilities.formatDate(mondayOnOrAfter_(sgDate_('2027-01-01')),CALV2.TZ,'yyyy-MM-dd')==='2027-01-04');
  test('canonical sync-state compatibility',()=>canonicalSyncState_('DIRTY')==='PENDING_SYNC'&&canonicalSyncState_('DELETE_PENDING')==='PENDING_REMOVAL');
  test('generated Staff title suppresses tag',()=>staffCalendarSpec_({OwnerTag:'term',StaffTitle:'T1W1',StaffDescription:'[[GSPS_YEAR_STRUCTURE:TERM_WEEK:T1W1]]',EventType:'MULTI_DAY',StartDate:'2027-01-04',EndDate:'2027-01-10'}).title==='T1W1');
  test('normal Staff title retains tag',()=>staffCalendarSpec_({OwnerTag:'Mtg',StaffTitle:'Staff',StaffDescription:'',EventType:'ALL_DAY',StartDate:'2027-01-04',EndDate:'2027-01-04'}).title==='[Mtg] Staff');
  test('Parent MULTI_DAY stays MULTI_DAY',()=>parentCalendarSpec_({ParentTitle:'Camp',StaffTitle:'Camp',ParentDescription:'',EventType:'MULTI_DAY',StartDate:'2027-01-04',EndDate:'2027-01-06'}).eventType==='MULTI_DAY');
  test('archive selection normalization',()=>{
    const rows=normaliseArchiveSelections_({selections:[{year:2026,status:'ACTIVE'}]});
    return rows.length===1&&rows[0].year===2026&&rows[0].status==='ACTIVE';
  });
  test('LaneSchedule weekday availability',()=>{
    const lane={LaneID:'assembly',Schedule:['MON','TUE','WED','THU','FRI','SAT','SUN'].map(day=>({Weekday:day,Enabled:day==='MON'?'Yes':'No'}))};
    return laneAvailableOnDate_(lane,'2027-01-04')&&!laneAvailableOnDate_(lane,'2027-01-05');
  });
  test('Year status controls new Event default visibility',()=>defaultEventVisibilityFromYearStatus_('ACTIVE')==='PUBLISHED'&&defaultEventVisibilityFromYearStatus_('PLANNING')==='HIDDEN');
  test('Teacher release transition is detected once',()=>isYearReleaseTransition_({ReleasedToTeachers:'No'},{ReleasedToTeachers:'Yes'})&&!isYearReleaseTransition_({ReleasedToTeachers:'Yes'},{ReleasedToTeachers:'Yes'}));
  test('Calendar operation batch caps are transport-safe',()=>effectiveSyncBatchSize_()<=5&&effectiveWipeBatchSize_()<=5);
  test('Stale threshold is positive',()=>Number(operationStatus_().staleAfterHours)>=1);

  const core=RC17_CORE;
  const source={EventID:'TEST',Year:2026,Status:'PUBLISHED',LaneID:'after_school',ShiftSpan:'PM_I',EventType:'TIMED',StartDate:'2026-09-14',EndDate:'2026-09-14',StartTime:'14:15',EndTime:'15:15',ParentEnabled:'Yes'};
  const lane={LaneID:'after_school',SupportsShift:'Yes',DefaultEventType:'TIMED'};
  const options={year:2026,anchorDate:'2026-09-14',targetDate:'2026-09-15',lane:lane,shift:'PM_I',defaultStart:'14:00',defaultEnd:'15:30'};
  test('day/month search',()=>core.parseDateSearch('17/09',2026).kind==='day');
  test('zero day rejected',()=>core.parseDateSearch('00/09',2026).status==='invalid');
  test('invalid leap day rejected',()=>core.parseDateSearch('29/02/2026',2026).status==='invalid');
  test('other-year month is explicit',()=>core.parseDateSearch('09/2027',2026).external===true);
  test('same lane preserves custom times',()=>core.relocate(source,options).StartTime==='14:15');
  test('changed shift adopts defaults',()=>core.relocate(source,Object.assign({},options,{shift:'PM_II',defaultStart:'15:30',defaultEnd:'17:00'})).StartTime==='15:30');
  test('middle segment preserves full span',()=>{const out=core.relocate(Object.assign({},source,{EndDate:'2026-09-16'}),Object.assign({},options,{anchorDate:'2026-09-15',targetDate:'2026-09-18'}));return out.StartDate==='2026-09-17'&&out.EndDate==='2026-09-19';});
  test('copy requires parent publication decision',()=>{const out=core.relocate(source,Object.assign({},options,{copy:true}));return out.ParentEnabled==='No'&&out.Status==='HIDDEN'&&!out.EventID;});
  test('year boundary is blocked',()=>{try{core.relocate(Object.assign({},source,{EndDate:'2026-09-16'}),Object.assign({},options,{targetDate:'2026-12-31'}));return false;}catch(e){return /complete event/.test(e.message);}});

  test('A1 columns beyond Z',()=>rc18Column_(30)==='AD'&&rc18Column_(703)==='AAA');
  test('quoted sheet names',()=>rc18QuoteSheet_("School's Events")==="'School''s Events'");
  test('exact row spans',()=>JSON.stringify(rc18Groups_([2,3,7,7,9]))==='[[2,3],[7,7],[9,9]]');
  test('blank is an explicit clear',()=>JSON.stringify(rc18TypedCell_(''))==='{}');
  test('formula-like titles stay literal',()=>rc18TypedCell_('=1+1').userEnteredValue.stringValue==='=1+1');
  test('boolean preserved',()=>rc18TypedCell_(false).userEnteredValue.boolValue===false);
  test('nonfinite rejected',()=>{try{rc18TypedCell_(NaN);return false;}catch(e){return true;}});
  test('numeric midnight not lost',()=>rc18Value_('StartTime',0)==='00:00');
  test('numeric date is locale-independent',()=>rc18Value_('StartDate',46295)==='2026-09-30');
  test('only transient reads are retried',()=>rc18TransientReadError_(new Error('429 quota exceeded'))&&!rc18TransientReadError_(new Error('403 permission denied')));
  const failed=tests.filter(t=>!t.ok).length;
  const result={version:CALV2.VERSION,runAt:isoNow_(),passed:tests.length-failed,failed:failed,total:tests.length,ok:failed===0,tests:tests};
  Logger.log('CALENDAR SELF TESTS '+JSON.stringify(result));
  return result;
}

function apiRunSelfTests_(actor, payload, requestId) {
  const result =
    runCalendarSelfTests();

  appendAudit_(
    actor,
    'RUN_SELF_TESTS',
    'System',
    CALV2.VERSION,
    null,
    {
      passed:
        result.passed,
      failed:
        result.failed,
      total:
        result.total
    },
    requestId
  );

  return serialise_(result);
}





function normaliseArchiveSelections_(payload) {
  const raw = Array.isArray(payload && payload.selections)
    ? payload.selections
    : [];

  const out = [];
  const seen = {};

  raw.forEach(item => {
    const year = Number(item && item.year);
    const status = String(item && item.status || '')
      .trim()
      .toUpperCase();

    if (!Number.isInteger(year)) return;
    if (status !== 'ACTIVE' && status !== 'PLANNING') return;

    const key = String(year) + '|' + status;
    if (seen[key]) return;

    seen[key] = true;
    out.push({ year: year, status: status });
  });

  if (!out.length) {
    throw new Error(
      'Select at least one Year + Status combination to archive.'
    );
  }

  return out;
}

function archiveSelectionMatch_(row, selections) {
  const year = Number(row && row.Year);
  const status = String(row && row.Status || '')
    .trim()
    .toUpperCase();

  return selections.some(sel =>
    Number(sel.year) === year &&
    String(sel.status) === status
  );
}

function archiveSelectedYears_(selections) {
  const seen = {};
  const years = [];

  selections.forEach(sel => {
    const year = Number(sel.year);
    if (!seen[year]) {
      seen[year] = true;
      years.push(year);
    }
  });

  return years.sort((a, b) => a - b);
}

function archivePreviewData_(selections) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const yearsSheet =
    ss.getSheetByName(CALV2.SHEETS.YEARS);

  const allYearRows =
    tableObjects_(yearsSheet);

  const selectedYearRows =
    allYearRows.filter(row =>
      archiveSelectionMatch_(row, selections)
    );

  const missing =
    selections.filter(sel =>
      !selectedYearRows.some(row =>
        Number(row.Year) === Number(sel.year) &&
        String(row.Status || '').trim().toUpperCase() ===
          String(sel.status)
      )
    );

  if (missing.length) {
    throw new Error(
      'Selected Year/Status not found: ' +
      missing
        .map(x => x.year + ' ' + x.status)
        .join(', ')
    );
  }

  const years =
    archiveSelectedYears_(selections);

  const counts = {};
  const rowsBySheet = {};

  Object.keys(CALV2.HEADERS)
    .forEach(sheetName => {
      const sheet =
        ss.getSheetByName(sheetName);

      if (!sheet) return;

      const allRows =
        tableObjects_(sheet);

      let rows = [];

      if (sheetName === CALV2.SHEETS.YEARS) {
        rows =
          allRows.filter(row =>
            archiveSelectionMatch_(row, selections)
          );

      } else if (
        sheetName === CALV2.SHEETS.EVENTS ||
        sheetName === CALV2.SHEETS.YEAR_STRUCTURE ||
        sheetName === CALV2.SHEETS.DAY_NOTES
      ) {
        rows =
          allRows.filter(row =>
            years.indexOf(Number(row.Year)) >= 0
          );

      } else {
        // Copy configuration/reference/log tables in full so the archive is a
        // self-contained RC1.1 snapshot that a future maintainer/LLM can read.
        rows = allRows;
      }

      rowsBySheet[sheetName] = rows;
      counts[sheetName] = rows.length;
    });

  return {
    selections: selections,
    years: years,
    yearRows: selectedYearRows,
    counts: counts,
    rowsBySheet: rowsBySheet
  };
}

function archiveFileName_(preview) {
  const parts =
    preview.selections
      .slice()
      .sort((a, b) =>
        a.year - b.year ||
        a.status.localeCompare(b.status)
      )
      .map(x =>
        x.year + '-' + x.status
      );

  return (
    'GSPS-Calendar-Archive_' +
    parts.join('_') +
    '_' +
    Utilities.formatDate(
      new Date(),
      CALV2.TZ,
      'yyyyMMdd-HHmmss'
    )
  );
}

function archiveConfirmationPhrase_(preview) {
  return (
    'ARCHIVE ' +
    preview.selections
      .slice()
      .sort((a, b) =>
        a.year - b.year ||
        a.status.localeCompare(b.status)
      )
      .map(x =>
        x.year + ' ' + x.status
      )
      .join(' + ')
  );
}

function apiArchiveYearsPreview_(actor, payload, requestId) {
  const selections =
    normaliseArchiveSelections_(payload);

  const preview =
    archivePreviewData_(selections);

  return serialise_({
    selections: preview.selections,
    years: preview.years,
    counts: preview.counts,
    fileName: archiveFileName_(preview),
    confirmationPhrase:
      archiveConfirmationPhrase_(preview),
    sharedDriveFolderId:
      setting_('SHARED_DRIVE_FOLDER_ID')
  });
}

function copyArchiveSheet_(destSS, sheetName, rows) {
  const headers =
    CALV2.HEADERS[sheetName];

  if (!headers) return;

  let dest =
    destSS.getSheetByName(sheetName);

  if (!dest) {
    dest = destSS.insertSheet(sheetName);
  }

  dest.clear();

  if (dest.getMaxColumns() < headers.length) {
    dest.insertColumnsAfter(
      dest.getMaxColumns(),
      headers.length - dest.getMaxColumns()
    );
  }

  dest
    .getRange(1, 1, 1, headers.length)
    .setValues([headers]);

  const values =
    (rows || []).map(row =>
      headers.map(header =>
        row[header] === undefined
          ? ''
          : row[header]
      )
    );

  if (values.length) {
    if (dest.getMaxRows() < values.length + 1) {
      dest.insertRowsAfter(
        dest.getMaxRows(),
        values.length + 1 - dest.getMaxRows()
      );
    }

    dest
      .getRange(
        2,
        1,
        values.length,
        headers.length
      )
      .setValues(values);
  }

  dest.setFrozenRows(1);

  dest
    .getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#E9EEF4')
    .setWrap(true);
}

function verifyArchiveWorkbook_(archiveSS, preview) {
  const errors = [];

  Object.keys(CALV2.HEADERS)
    .forEach(sheetName => {
      const sheet =
        archiveSS.getSheetByName(sheetName);

      if (!sheet) {
        errors.push(
          'Missing archive sheet: ' + sheetName
        );
        return;
      }

      const headers =
        CALV2.HEADERS[sheetName];

      const actual =
        sheet
          .getRange(1, 1, 1, headers.length)
          .getDisplayValues()[0]
          .map(v => String(v || '').trim());

      const headerOK =
        headers.every(
          (header, index) =>
            actual[index] === header
        );

      if (!headerOK) {
        errors.push(
          'Archive header mismatch: ' + sheetName
        );
        return;
      }

      const expectedRows =
        Number(preview.counts[sheetName] || 0);

      const actualRows =
        Math.max(0, sheet.getLastRow() - 1);

      if (actualRows !== expectedRows) {
        errors.push(
          'Archive row-count mismatch in ' +
          sheetName +
          ': expected ' +
          expectedRows +
          ', got ' +
          actualRows
        );
      }
    });

  if (errors.length) {
    throw new Error(
      'Archive workbook verification failed:\n- ' +
      errors.join('\n- ')
    );
  }

  return true;
}

function deleteRowsForYears_(sheet, yearSet) {
  if (!sheet || sheet.getLastRow() < 2) {
    return 0;
  }

  const rowNumbers =
    tableObjectsWithRows_(sheet)
      .filter(hit =>
        yearSet.has(
          Number(hit.object.Year)
        )
      )
      .map(hit => hit.row)
      .sort((a, b) => b - a);

  rowNumbers.forEach(row =>
    sheet.deleteRow(row)
  );

  return rowNumbers.length;
}

function apiArchiveYearsCommit_(actor, payload, requestId) {
  const selections =
    normaliseArchiveSelections_(payload);

  const preview =
    archivePreviewData_(selections);

  const expectedPhrase =
    archiveConfirmationPhrase_(preview);

  const suppliedPhrase =
    String(
      payload.confirmationPhrase || ''
    ).trim();

  if (suppliedPhrase !== expectedPhrase) {
    throw new Error(
      'Typed confirmation does not match: ' +
      expectedPhrase
    );
  }

  if (!yes_(payload.confirmed)) {
    throw new Error(
      'Archive acknowledgement is required.'
    );
  }

  if (readCalendarWipeSession_()) {
    throw new Error(
      'A Calendar wipe is active. Complete it before archiving Years.'
    );
  }

  if (readCalendarSyncSession_()) {
    throw new Error(
      'A Calendar sync is active. Complete it before archiving Years.'
    );
  }

  assertOperationalHealthFor_(
    'Archive Years',
    preview.years
  );

  const lock =
    calendarWriteLock_();

  if (!lock.tryLock(10000)) {
    throw new Error(
      'Another Calendar operation is already running.'
    );
  }

  try {
    // An unresolved publication may still be applying native row patches.
    rc18AssertNoPendingEvent_('','','','publication');
    const ss =
      SpreadsheetApp.getActiveSpreadsheet();

    const folderId =
      setting_('SHARED_DRIVE_FOLDER_ID');

    if (!folderId) {
      throw new Error(
        'SHARED_DRIVE_FOLDER_ID is not configured.'
      );
    }

    const safetySnapshot =
      createSafetySnapshot_(
        actor,
        'archive-years-' +
        preview.years.join('-'),
        {
          selections:
            preview.selections
        }
      );

    const fileName =
      archiveFileName_(preview);

    const folder =
      DriveApp.getFolderById(folderId);

    // Make the archive directly inside the configured folder. This avoids
    // creating a temporary My Drive spreadsheet and then trying to move it
    // across Drive boundaries. It also preserves useful sheet formatting.
    const archiveFile =
      DriveApp
        .getFileById(ss.getId())
        .makeCopy(fileName, folder);

    const archiveSS =
      SpreadsheetApp.openById(
        archiveFile.getId()
      );

    // Remove any non-RC1.1 sheets from the copied workbook so the archive is a
    // clean schema-compatible snapshot rather than an arbitrary clone.
    archiveSS.getSheets()
      .slice()
      .forEach(sheet => {
        if (
          !Object.prototype.hasOwnProperty.call(
            CALV2.HEADERS,
            sheet.getName()
          ) &&
          archiveSS.getSheets().length > 1
        ) {
          archiveSS.deleteSheet(sheet);
        }
      });

    Object.keys(CALV2.HEADERS)
      .forEach(sheetName => {
        copyArchiveSheet_(
          archiveSS,
          sheetName,
          preview.rowsBySheet[sheetName] || []
        );
      });

    archiveSS.setSpreadsheetTimeZone(CALV2.TZ);

    try {
      archiveSS.setSpreadsheetLocale('en_SG');
    } catch (err) {}

    SpreadsheetApp.flush();

    verifyArchiveWorkbook_(
      archiveSS,
      preview
    );

    const archiveId =
      archiveSS.getId();

    const archiveUrl =
      archiveSS.getUrl();

    const now =
      isoNow_();

    const yearSet =
      new Set(preview.years);

    const deleted = {
      Events:
        deleteRowsForYears_(
          ss.getSheetByName(
            CALV2.SHEETS.EVENTS
          ),
          yearSet
        ),

      YearStructure:
        deleteRowsForYears_(
          ss.getSheetByName(
            CALV2.SHEETS.YEAR_STRUCTURE
          ),
          yearSet
        ),

      DayNotes:
        deleteRowsForYears_(
          ss.getSheetByName(
            CALV2.SHEETS.DAY_NOTES
          ),
          yearSet
        )
    };

    const yearsSheet =
      ss.getSheetByName(
        CALV2.SHEETS.YEARS
      );

    preview.yearRows.forEach(yearRow => {
      const hit =
        tableObjectsWithRows_(yearsSheet)
          .find(x =>
            Number(x.object.Year) ===
              Number(yearRow.Year) &&
            String(
              x.object.Status || ''
            ).trim().toUpperCase() ===
              String(
                yearRow.Status || ''
              ).trim().toUpperCase()
          );

      if (!hit) return;

      updateRowPatch_(
        yearsSheet,
        hit.row,
        {
          Status: 'ARCHIVED',
          ReleasedToTeachers: 'No',
          ArchivedAt: now,
          ArchiveSpreadsheetFileId:
            archiveId,
          UpdatedAt: now,
          UpdatedBy: actor.userAlias
        }
      );
    });

    appendAudit_(
      actor,
      'ARCHIVE_YEARS',
      'Year',
      preview.selections
        .map(x =>
          x.year + ' ' + x.status
        )
        .join(', '),
      null,
      {
        archiveSpreadsheetFileId:
          archiveId,
        archiveSpreadsheetUrl:
          archiveUrl,
        selections:
          preview.selections,
        counts:
          preview.counts,
        deletedFromLive:
          deleted,
        safetySnapshotFileId:
          safetySnapshot.fileId
      },
      requestId
    );

    invalidateCalendarCaches_();
    SpreadsheetApp.flush();

    return serialise_({
      ok: true,
      archiveSpreadsheetFileId:
        archiveId,
      archiveSpreadsheetUrl:
        archiveUrl,
      fileName:
        fileName,
      selections:
        preview.selections,
      counts:
        preview.counts,
      deletedFromLive:
        deleted,
      safetySnapshot:
        safetySnapshot
    });

  } finally {
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}

const CALENDAR_WIPE_SESSION_PROPERTY_ = 'CALV2_ACTIVE_CALENDAR_WIPE';
const CALENDAR_SYNC_SESSION_PROPERTY_ = 'CALV2_ACTIVE_CALENDAR_SYNC';

function normaliseCalendarTarget_(value) {
  const target = String(value || '').trim().toLowerCase();
  if (!['staff', 'parent'].includes(target)) {
    throw new Error('Calendar target must be staff or parent.');
  }
  return target;
}

function calendarLabelForTarget_(target) {
  return target === 'staff' ? 'Staff' : 'Parent';
}

function calendarIdForTarget_(target) {
  return setting_(target === 'staff'
    ? 'STAFF_CALENDAR_ID'
    : 'PARENT_CALENDAR_ID');
}

function calendarForTargetOrThrow_(target) {
  const label = calendarLabelForTarget_(target);
  const calendarId = calendarIdForTarget_(target);
  if (!calendarId) throw new Error(label + ' Calendar ID is not configured.');

  const calendar = calendarApiCall_('calendar.get', target, '', () => CalendarApp.getCalendarById(calendarId));
  if (!calendar) {
    throw new Error(
      label + ' Calendar is not visible to the Apps Script execution account. ' +
      'Confirm the execution account has Calendar permission and is subscribed to this Calendar.'
    );
  }
  return { calendar: calendar, calendarId: calendarId };
}

function calendarWipeWindowForYear_(year) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(CALV2.SHEETS.EVENTS);

  const rows = tableObjects_(sheet)
    .filter(r => Number(r.Year) === Number(year));

  // Always cover Jan 1 through Dec 31. Extend for logical-year Events outside
  // that range, such as late-Dec preparation days assigned to the next year.
  let startDate = String(year) + '-01-01';
  let endDate = String(year) + '-12-31';

  rows.forEach(ev => {
    const start = dateText_(ev.StartDate);
    const end = dateText_(ev.EndDate || ev.StartDate);
    if (start && start < startDate) startDate = start;
    if (end && end > endDate) endDate = end;
  });

  return {
    startDate: startDate,
    endDate: endDate
  };
}

function calendarEventsInWipeWindow_(calendar, window) {
  return calendarApiCall_('list', '', '', () => calendar.getEvents(
    sgDate_(window.startDate), addDays_(sgDate_(window.endDate), 1)
  ));
}

function readCalendarWipeSession_() {
  const text = PropertiesService.getScriptProperties()
    .getProperty(CALENDAR_WIPE_SESSION_PROPERTY_);
  if (!text) return null;
  try { return JSON.parse(text); } catch (err) { return null; }
}

function writeCalendarWipeSession_(session) {
  session.lastActivityAt =
    isoNow_();

  session.lastActivityEpochMs =
    Date.now();

  PropertiesService
    .getScriptProperties()
    .setProperty(
      CALENDAR_WIPE_SESSION_PROPERTY_,
      JSON.stringify(session)
    );
}

function clearCalendarWipeSession_() {
  PropertiesService.getScriptProperties()
    .deleteProperty(CALENDAR_WIPE_SESSION_PROPERTY_);
}

function calendarWipeConfirmationPhrase_(target, year) {
  return 'WIPE ' + calendarLabelForTarget_(target).toUpperCase() +
    ' ' + String(year);
}

function apiCalendarWipePreview_(actor, payload, requestId) {
  const year =
    Number(payload.year);

  if (!Number.isInteger(year)) {
    throw new Error('Year required.');
  }

  const target =
    normaliseCalendarTarget_(
      payload.target
    );

  clearStaleCalendarOperationIfNeeded_(
    actor,
    'sync',
    requestId
  );

  clearStaleCalendarOperationIfNeeded_(
    actor,
    'wipe',
    requestId
  );

  const activeSync =
    readCalendarSyncSession_();

  if (activeSync) {
    throw new Error(
      calendarLabelForTarget_(
        activeSync.target
      ) +
      ' Calendar sync is in progress for ' +
      activeSync.year +
      '. Complete that sync before starting a wipe.'
    );
  }

  const existing =
    readCalendarWipeSession_();

  if (
    existing &&
    (
      Number(existing.year) !== year ||
      String(existing.target) !== target
    )
  ) {
    throw new Error(
      'Another Calendar wipe is already in progress: ' +
      calendarLabelForTarget_(
        existing.target
      ) +
      ' ' +
      existing.year +
      '. Complete that wipe before starting another.'
    );
  }

  if (existing && calendarProviderProgress_(existing).paused) return serialise_(Object.assign({}, existing,
    calendarProviderProgress_(existing), {label: calendarLabelForTarget_(target), inProgress: true,
      eventCount: Math.max(0, Number(existing.remaining === undefined ? existing.initialCount - existing.deletedTotal : existing.remaining)),
      sample: [], confirmationPhrase: calendarWipeConfirmationPhrase_(target, year)}));

  const resolved =
    calendarForTargetOrThrow_(
      target
    );

  const window =
    calendarWipeWindowForYear_(
      year
    );

  const events =
    calendarEventsInWipeWindow_(
      resolved.calendar,
      window
    );

  const sample =
    events
      .slice(0, 8)
      .map(event => ({
        id:
          String(
            event.getId() || ''
          ),
        title:
          String(
            event.getTitle() || ''
          ),
        start:
          Utilities.formatDate(
            event.getStartTime(),
            CALV2.TZ,
            'yyyy-MM-dd HH:mm'
          )
      }));

  return serialise_({
    target:
      target,
    label:
      calendarLabelForTarget_(
        target
      ),
    year:
      year,
    calendarId:
      resolved.calendarId,
    calendarName:
      resolved.calendar.getName(),
    effectiveUser:
      String(
        Session
          .getEffectiveUser()
          .getEmail() || ''
      ),
    startDate:
      window.startDate,
    endDate:
      window.endDate,
    eventCount:
      events.length,
    sample:
      sample,
    confirmationPhrase:
      calendarWipeConfirmationPhrase_(
        target,
        year
      ),
    inProgress:
      !!existing,
    wipeId:
      existing
        ? existing.wipeId
        : '',
    deletedTotal:
      existing
        ? Number(
            existing.deletedTotal || 0
          )
        : 0,
    initialCount:
      existing
        ? Number(
            existing.initialCount ||
            events.length
          )
        : events.length
  });
}

function apiStartCalendarWipe_(actor, payload, requestId) {
  const year = Number(payload.year);
  if (!Number.isInteger(year)) throw new Error('Year required.');
  const target = normaliseCalendarTarget_(payload.target);
  const expectedPhrase = calendarWipeConfirmationPhrase_(target, year);
  const suppliedPhrase = String(payload.confirmationPhrase || '').trim();

  if (suppliedPhrase !== expectedPhrase) {
    throw new Error('Typed confirmation does not match: ' + expectedPhrase);
  }
  if (!yes_(payload.confirmed)) {
    throw new Error('Calendar wipe acknowledgement is required.');
  }

  calendarProviderResumeReviewed_();
  const prior = readCalendarWipeSession_();
  if (prior && Number(prior.year) === year && prior.target === target && calendarProviderProgress_(prior).paused &&
      (calendarProviderProgress_().paused || Number(prior.nextAttemptEpochMs || 0) > Date.now())) return calendarWipeProgress_(prior);
  const resolved = calendarForTargetOrThrow_(target);
  const window = calendarWipeWindowForYear_(year);
  const events = calendarEventsInWipeWindow_(resolved.calendar, window);

  const lock = calendarWriteLock_();
  if (!lock.tryLock(5000)) {
    throw new Error('Another Calendar operation is already running.');
  }

  try {
    // An unresolved publication may still be applying native row patches.
    rc18AssertNoPendingEvent_('','','','publication');
    clearStaleCalendarOperationIfNeeded_(
      actor,
      'sync',
      requestId
    );

    clearStaleCalendarOperationIfNeeded_(
      actor,
      'wipe',
      requestId
    );

    const activeSync = readCalendarSyncSession_();
    if (activeSync) {
      throw new Error(
        calendarLabelForTarget_(activeSync.target) + ' Calendar sync is in progress for ' +
        activeSync.year + '. Complete that sync before starting a wipe.'
      );
    }

    const existing = readCalendarWipeSession_();
    if (existing) {
      if (Number(existing.year) === year && String(existing.target) === target) {
        delete existing.paused;
        writeCalendarWipeSession_(existing);
        return calendarWipeProgress_(existing);
      }
      throw new Error(
        'Another Calendar wipe is already in progress: ' +
        calendarLabelForTarget_(existing.target) + ' ' + existing.year + '.'
      );
    }

    assertOperationalHealthFor_(
      'Calendar wipe ' +
      calendarLabelForTarget_(target) +
      ' ' +
      year,
      year
    );

    if (resolved.calendarId !== calendarIdForTarget_(target)) throw new Error('Calendar destination changed. Preview the wipe again.');
    const expectedCount = Number(payload.expectedCount);

    if (!Number.isFinite(expectedCount) || expectedCount !== events.length) {
      throw new Error(
        'Calendar contents changed after preview. Preview the wipe again before continuing.'
      );
    }

    const safetySnapshot =
      createSafetySnapshot_(
        actor,
        'calendar-wipe-' +
        target +
        '-' +
        year,
        {
          target:
            target,
          year:
            year,
          calendarEventCount:
            events.length
        }
      );

    const session = {
      wipeId: 'WIPE-' + Utilities.getUuid(),
      target: target,
      year: year,
      calendarId: resolved.calendarId,
      calendarName: resolved.calendar.getName(),
      startDate: window.startDate,
      endDate: window.endDate,
      initialCount: events.length,
      deletedTotal: 0,
      safetySnapshotFileId:
        safetySnapshot.fileId,
      safetySnapshotFileName:
        safetySnapshot.fileName,
      startedAt: isoNow_(),
      startedEpochMs: Date.now(),
      startedBy: actor.userAlias
    };
    writeCalendarWipeSession_(session);

    appendAudit_(
      actor, 'START_CALENDAR_WIPE', 'Year', String(year), null,
      {
        wipeId: session.wipeId,
        target: target,
        calendarId: resolved.calendarId,
        calendarName: session.calendarName,
        startDate: session.startDate,
        endDate: session.endDate,
        eventCount: session.initialCount,
        safetySnapshotFileId:
          session.safetySnapshotFileId
      },
      requestId
    );

    if (session.initialCount === 0) {
      const resetCount = resetTargetSyncAfterCalendarWipe_(target, year);
      clearCalendarWipeSession_();
      appendAudit_(
        actor, 'COMPLETE_CALENDAR_WIPE', 'Year', String(year), null,
        {
          wipeId: session.wipeId,
          target: target,
          deletedEvents: 0,
          resetBackendRows: resetCount,
          startDate: session.startDate,
          endDate: session.endDate
        },
        requestId
      );
      session.completed = true;
      session.resetBackendRows = resetCount;
    }

    return serialise_(session);
  } finally {
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}

function calendarWipeProgress_(session, extra) {
  return serialise_(Object.assign({wipeId: session.wipeId, target: session.target, year: session.year,
    initialCount: session.initialCount, deletedTotal: session.deletedTotal,
    remaining: session.remaining === undefined ? Math.max(0, session.initialCount - session.deletedTotal) : session.remaining,
    completed: false, errors: []}, calendarProviderProgress_(session), extra || {}));
}
function calendarWipeList_(session) {
  return calendarApiList_(session.calendarId, {timeMin: session.startDate + 'T00:00:00+08:00',
    timeMax: Utilities.formatDate(addDays_(sgDate_(session.endDate), 1), CALV2.TZ, 'yyyy-MM-dd') + 'T00:00:00+08:00',
    singleEvents: true, showDeleted: false, maxResults: 250}, session.target, '');
}
function calendarWipeEventInWindow_(event, session) {
  const instant = part => Date.parse(part && (part.dateTime || (part.date && part.date + 'T00:00:00+08:00')) || '');
  const start = instant(event.start), end = instant(event.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error('Calendar event dates could not be verified. Wipe stopped.');
  return end > sgDate_(session.startDate).getTime() && start < addDays_(sgDate_(session.endDate), 1).getTime();
}
function apiCalendarWipeBatch_(actor, payload, requestId) {
  const wipeId = String(payload.wipeId || '').trim();
  if (!wipeId) throw new Error('Wipe session ID required.');
  let session, claim;
  const ready = withRC17WriteLock_(() => {
    session = readCalendarWipeSession_();
    if (!session || session.wipeId !== wipeId) throw new Error('Calendar wipe session is no longer active. Run Preview wipe to check current state.');
    if (session.claim && Number(session.claim.expiresAt) > Date.now()) return calendarWipeProgress_(session, {inProgress: true, retryAfterMs: 1200});
    if (calendarProviderProgress_(session).paused) return calendarWipeProgress_(session);
    if (String(calendarIdForTarget_(session.target)) !== session.calendarId) throw new Error('Calendar destination changed during the wipe. The wipe has been paused.');
    claim = {id: Utilities.getUuid(), expiresAt: Date.now() + CALENDAR_SYNC_CLAIM_MS_};
    session.claim = claim;
    session.lastBatchStartedAt = isoNow_(); session.lastBatchRequestId = requestId;
    writeCalendarWipeSession_(session);
    return null;
  });
  if (ready) return ready;
  const settle = work => withRC17WriteLock_(() => {
    const current = readCalendarWipeSession_();
    if (!current || current.wipeId !== wipeId || !current.claim || current.claim.id !== claim.id || claim.expiresAt <= Date.now()) throw new Error('Calendar wipe claim changed. Resume from the saved checkpoint.');
    return work(current);
  });
  const previousBatch = calendarProviderBatch_;
  const providerBatch = {attempts: 0, lastThrottleAt: calendarProviderState_().lastThrottleAt};
  calendarProviderBatch_ = providerBatch;
  let fatal, deleted = 0;
  try {
    calendarApiAccess_(session.calendarId, session.target, true);
    if (!session.pendingWipeIds || !session.pendingWipeIds.length) {
      const events = calendarWipeList_(session);
      session = settle(current => {
        current.remaining = events.length;
        current.pendingWipeIds = events.slice(0, effectiveWipeBatchSize_()).map(event => event.id);
        writeCalendarWipeSession_(current); return current;
      });
    }
    for (const id of session.pendingWipeIds.slice()) {
      settle(() => true);
      const event = calendarApiGet_(session.calendarId, id, session.target, {EventID: ''});
      const inWindow = !event || calendarWipeEventInWindow_(event, session);
      if (event && inWindow) {
        if (!event.etag) throw new Error('Calendar event has no ETag. Wipe stopped.');
        calendarApiCall_('remove', session.target, '', () => Calendar.Events.remove(session.calendarId, id, {}, {'If-Match': event.etag}), false, 1, session.calendarId);
      }
      // IDs are saved before deletion. A lost delete response is read back on
      // resume; an already removed ID is acknowledged once without a new write.
      session = settle(current => {
        current.pendingWipeIds = current.pendingWipeIds.filter(value => value !== id);
        current.deletedTotal = Number(current.deletedTotal || 0) + (inWindow ? 1 : 0);
        current.remaining = Math.max(0, Number(current.remaining || 0) - 1);
        writeCalendarWipeSession_(current); return current;
      });
      if (inWindow) deleted++;
    }
    session.remaining = calendarWipeList_(session).length;
  } catch (error) { fatal = error; }
  finally { calendarProviderBatch_ = previousBatch; }
  return settle(current => {
    if (!fatal) current.remaining = session.remaining;
    delete current.claim;
    current.lastBatchAt = isoNow_();
    calendarProviderSettleBatch_(current, fatal, providerBatch);
    writeCalendarWipeSession_(current);
    if (!fatal && !current.remaining) {
      const resetCount = resetTargetSyncAfterCalendarWipe_(current.target, current.year);
      appendAudit_(actor, 'COMPLETE_CALENDAR_WIPE', 'Year', String(current.year), null,
        {wipeId: current.wipeId, target: current.target, calendarId: current.calendarId,
          deletedEvents: current.deletedTotal, initialCount: current.initialCount,
          resetBackendRows: resetCount, startDate: current.startDate, endDate: current.endDate}, requestId);
      clearCalendarWipeSession_();
      return calendarWipeProgress_(current, {completed: true, paused: false, remaining: 0, batchDeleted: deleted, resetBackendRows: resetCount});
    }
    return calendarWipeProgress_(current, {batchDeleted: deleted});
  });
}

function resetTargetSyncAfterCalendarWipe_(target,year) {
  if(!['staff','parent'].includes(target))throw new Error('Invalid Calendar target.');
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.EVENTS);
  const prefix=target==='staff'?'Staff':'Parent',id=prefix+'CalendarEventId',hash=prefix+'SyncHash',state=prefix+'SyncState';
  const rows=rc18Projection_(sheet,['Year','Status','ParentEnabled','DeletedAt',id,hash,state]);
  let count=0;const requests=[];
  rows.filter(x=>Number(x.object.Year)===Number(year)).forEach(x=>{
    const ev=x.object,next=target==='staff'?'PENDING_SYNC':
      (!String(ev.DeletedAt||'').trim()&&String(ev.Status).toUpperCase()==='PUBLISHED'&&yes_(ev.ParentEnabled)?'PENDING_SYNC':'SYNCED');
    const patch={};if(ev[id]!=='')patch[id]='';if(ev[hash]!=='')patch[hash]='';if(ev[state]!==next)patch[state]=next;
    requests.push.apply(requests,rc18PatchRequests_(sheet,x.row,patch));count++;
  });
  rc18MaintenanceWrites_(requests);invalidateCalendarCaches_();return count;
}

function readCalendarSyncSession_() {
  const properties=PropertiesService.getScriptProperties(),text=properties.getProperty(CALENDAR_SYNC_SESSION_PROPERTY_);
  if (!text) return null;
  try {
    const head=JSON.parse(text);
    if(!Object.prototype.hasOwnProperty.call(head,'checkpointSchema'))return calendarSyncValidateSession_(head);
    if(head.checkpointSchema!==1)throw Error();
    if(!/^[a-f0-9-]{36}$/.test(head.generation||'')||!Number.isInteger(head.parts)||head.parts<1||head.parts>20||
       !Number.isInteger(head.encodedBytes)||head.encodedBytes<1||head.encodedBytes>160000||
       !Number.isInteger(head.rawBytes)||head.rawBytes<1||head.rawBytes>1000000||!/^[a-f0-9]{64}$/.test(head.sha256||'')||!/^[a-f0-9]{64}$/.test(head.encodedSha256||''))throw Error();
    let encoded='';for(let i=0;i<head.parts;i++){const part=properties.getProperty(calendarSyncCheckpointKey_(head.generation,i));if(typeof part!=='string'||!part.length||part.length>8000||!/^[A-Za-z0-9+/=]+$/.test(part))throw Error();encoded+=part;}
    if(encoded.length!==head.encodedBytes||sha256_(encoded)!==head.encodedSha256)throw Error();
    const raw=Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(encoded))).getDataAsString('UTF-8');
    if(calendarSyncUtf8Bytes_(raw)!==head.rawBytes||sha256_(raw)!==head.sha256)throw Error();
    const session=calendarSyncValidateSession_(JSON.parse(raw));if(session.syncRunId!==head.syncRunId)throw Error();return session;
  } catch(error) {
    throw mutationError_('SYNC_CHECKPOINT_UNREADABLE','Calendar sync recovery data is incomplete or unreadable. Keep the saved checkpoint and ask an administrator to review it before starting another run.',503,true);
  }
}

const CALENDAR_SYNC_CHECKPOINT_PREFIX_='CALV2_SYNC_CHECKPOINT_';
function calendarSyncValidateSession_(session){
  if(!session||typeof session!=='object'||typeof session.syncRunId!=='string'||!session.syncRunId||!['staff','parent'].includes(session.target)||!Number.isInteger(session.year)||
     !session.counts||typeof session.counts!=='object'||!Array.isArray(session.counts.errors)||!Array.isArray(session.failedIds)||
     !session.failedIds.every(id=>typeof id==='string')||!session.counts.errors.every(error=>error&&typeof error.eventId==='string'&&typeof error.error==='string')||
     !['staffCreates','staffUpdates','staffDeletes','parentCreates','parentUpdates','parentDeletes'].every(key=>Number.isSafeInteger(session.counts[key])&&session.counts[key]>=0)||
     (session.blockedEvents!==undefined&&!Array.isArray(session.blockedEvents)))throw Error('Invalid sync checkpoint');
  return session;
}
function calendarSyncCheckpointKey_(generation,index){return CALENDAR_SYNC_CHECKPOINT_PREFIX_+generation+'_'+index;}
function calendarSyncUtf8Bytes_(text){return unescape(encodeURIComponent(String(text))).length;}
function calendarSyncCheckpointCapacityError_(){return mutationError_('SYNC_CHECKPOINT_CAPACITY','Calendar sync paused before the next batch because its recovery storage is near capacity. Ask an administrator to inspect the active sync and Script Properties; do not clear its history or repeat the run.',503,true);}
function calendarSyncCheckpointEncode_(session){
  const raw=JSON.stringify(session),rawBytes=calendarSyncUtf8Bytes_(raw);
  if(rawBytes>1000000)throw calendarSyncCheckpointCapacityError_();
  if(rawBytes<=8000)return {head:raw,chunks:[]};
  const encoded=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(raw,'application/json')).getBytes());
  if(encoded.length>160000)throw calendarSyncCheckpointCapacityError_();
  const generation=Utilities.getUuid(),chunks=[];
  for(let i=0;i<encoded.length;i+=8000)chunks.push({key:calendarSyncCheckpointKey_(generation,chunks.length),value:encoded.slice(i,i+8000)});
  return {head:JSON.stringify({checkpointSchema:1,syncRunId:session.syncRunId,generation,parts:chunks.length,encodedBytes:encoded.length,rawBytes,sha256:sha256_(raw),encodedSha256:sha256_(encoded)}),chunks};
}
function calendarSyncCheckpointCapacity_(encoded,properties,reserveBytes){
  const values=properties.getProperties();let bytes=0;
  Object.keys(values).forEach(key=>{bytes+=calendarSyncUtf8Bytes_(key)+calendarSyncUtf8Bytes_(values[key]);});
  // Keep the current checkpoint until the new head is read back. Leave100KB
  // below Google's500KB property-store limit for unrelated application work.
  bytes+=calendarSyncUtf8Bytes_(encoded.head)+encoded.chunks.reduce((n,part)=>n+calendarSyncUtf8Bytes_(part.key)+part.value.length,0)+Number(reserveBytes||0);
  if(encoded.chunks.reduce((n,part)=>n+part.value.length,0)+Number(reserveBytes||0)>160000)throw calendarSyncCheckpointCapacityError_();
  if(bytes>400000)throw calendarSyncCheckpointCapacityError_();
}
function calendarSyncCheckpointPrune_(properties){
  // Call only under the existing writer lock. Never remove a chunk reachable
  // from the durable head, including after an ambiguous head-write response.
  const raw=properties.getProperty(CALENDAR_SYNC_SESSION_PROPERTY_);let keep='';
  if(raw){const head=JSON.parse(raw);if(head.checkpointSchema===1){if(!/^[a-f0-9-]{36}$/.test(head.generation||''))return;keep=CALENDAR_SYNC_CHECKPOINT_PREFIX_+head.generation+'_';}}
  Object.keys(properties.getProperties()).forEach(key=>{if(/^CALV2_SYNC_CHECKPOINT_[a-f0-9-]{36}_\d{1,2}$/.test(key)&&(!keep||!key.startsWith(keep)))properties.deleteProperty(key);});
}
function calendarSyncCheckpointReserve_(session,items){
  // Refuse capacity before provider dispatch, allowing the next bounded batch
  // to add its longest retained errors and IDs without losing evidence later.
  const candidate=JSON.parse(JSON.stringify(session));
  (items||[]).forEach(item=>{const id=String(item.object.EventID);candidate.counts.errors.push({eventId:id,target:session.target,error:'\u0800'.repeat(240)});if(!candidate.failedIds.includes(id))candidate.failedIds.push(id);});
  candidate.checkpointReserve='x'.repeat(20000);
  const properties=PropertiesService.getScriptProperties();
  calendarSyncCheckpointPrune_(properties);
  // Reserve uncompressed space too: different error text may compress less
  // than the conservative Unicode placeholder used for the raw-size check.
  calendarSyncCheckpointCapacity_(calendarSyncCheckpointEncode_(candidate),properties,12000);
}
function writeCalendarSyncSession_(session) {
  session.lastActivityAt=isoNow_();session.lastActivityEpochMs=Date.now();
  const properties=PropertiesService.getScriptProperties(),encoded=calendarSyncCheckpointEncode_(session);
  calendarSyncCheckpointPrune_(properties);
  calendarSyncCheckpointCapacity_(encoded,properties);
  encoded.chunks.forEach(part=>properties.setProperty(part.key,part.value));
  encoded.chunks.forEach(part=>{if(properties.getProperty(part.key)!==part.value)throw mutationError_('SYNC_CHECKPOINT_UNREADABLE','Calendar sync checkpoint verification failed. The previous checkpoint is retained.',503,true);});
  try{properties.setProperty(CALENDAR_SYNC_SESSION_PROPERTY_,encoded.head);}
  catch(error){if(properties.getProperty(CALENDAR_SYNC_SESSION_PROPERTY_)!==encoded.head)throw error;}
  if(properties.getProperty(CALENDAR_SYNC_SESSION_PROPERTY_)!==encoded.head)throw mutationError_('SYNC_CHECKPOINT_UNREADABLE','Calendar sync checkpoint acknowledgement could not be verified. Resume from its saved state.',503,true);
  try{calendarSyncCheckpointPrune_(properties);}catch(error){console.log('Calendar checkpoint cleanup deferred; committed recovery data is retained.');}
}

function clearCalendarSyncSession_() {
  const properties=PropertiesService.getScriptProperties();
  try{properties.deleteProperty(CALENDAR_SYNC_SESSION_PROPERTY_);}catch(error){if(properties.getProperty(CALENDAR_SYNC_SESSION_PROPERTY_))throw error;}
  if(!properties.getProperty(CALENDAR_SYNC_SESSION_PROPERTY_))try{calendarSyncCheckpointPrune_(properties);}catch(error){console.log('Calendar checkpoint cleanup deferred.');}
}

/**
 * Calendar emergency recovery helper.
 *
 * Run manually from the Apps Script editor when a previously-abandoned sync
 * session must be removed immediately. This clears only the resumable sync
 * marker in Script Properties. It does not delete or alter Calendar events,
 * Event rows, hashes, or sync states.
 */
function forceClearCalendarSyncSession() {
  return withRC17WriteLock_(() => {
    const before = readCalendarSyncSession_();
    if (before && before.claim && Number(before.claim.expiresAt) > Date.now()) {
      throw new Error('A Calendar sync batch may still be running. Wait until its seven-minute recovery window ends before clearing it.');
    }
    clearCalendarSyncSession_();
    const result = {ok: true, cleared: !!before, previous: before || null, clearedAt: isoNow_()};
    console.log('CALENDAR FORCE CLEAR SYNC SESSION ' + JSON.stringify(result));
    return result;
  });
}

/**
 * Read-only helper for troubleshooting the current resumable sync marker.
 */
function inspectCalendarSyncSession() {
  const session =
    readCalendarSyncSession_();

  const status =
    operationStatus_();

  const result = {
    session:
      session || null,
    status:
      status.sync || null
  };

  console.log(
    'CALENDAR SYNC SESSION ' +
    JSON.stringify(result)
  );

  return result;
}

function emptySyncCounts_() {
  return {
    staffCreates: 0,
    staffUpdates: 0,
    staffDeletes: 0,
    parentCreates: 0,
    parentUpdates: 0,
    parentDeletes: 0,
    errors: []
  };
}

function syncWriteCount_(counts, target) {
  if (target === 'staff') {
    return Number(counts.staffCreates || 0) +
      Number(counts.staffUpdates || 0) +
      Number(counts.staffDeletes || 0);
  }
  return Number(counts.parentCreates || 0) +
    Number(counts.parentUpdates || 0) +
    Number(counts.parentDeletes || 0);
}

function eligibleSyncRows_(
  eventsSheet,
  year,
  target,
  failedIds,
  yearRow,
  laneMap
) {
  const failed =
    new Set(
      (failedIds || [])
        .map(String)
    );

  // Read only the columns used for the requested Calendar target.
  const fields = target === 'staff'
    ? ['EventID','Year','Status','LaneID','DeletedAt','StaffCalendarEventId','StaffSyncState']
    : ['EventID','Year','ParentEnabled','ParentCalendarEventId','ParentSyncState'];
  let rows =
    rc18Projection_(eventsSheet,fields)
      .filter(x =>
        Number(x.object.Year) ===
        Number(year)
      );

  if (target === 'staff') {
    rows =
      rows.filter(x => {
        const ev =
          x.object;

        const linked = calendarApiSourceLinked_('staff',ev);

        const pending = syncStateNeedsWork_(ev.StaffSyncState);
        if (linked) return pending || !String(ev.StaffCalendarEventId||'').trim();

        if (
          yearRow &&
          laneMap
        ) {
          return desiredSyncState_(
            'staff',
            ev,
            yearRow,
            laneMap
          );
        }

        return pending;
      });

  } else {
    rows =
      rows.filter(x => {
        const ev =
          x.object;

        const linked = calendarApiSourceLinked_('parent',ev);
        const pending = syncStateNeedsWork_(ev.ParentSyncState) || (linked && !String(ev.ParentCalendarEventId||'').trim());

        const actionable =
          yes_(ev.ParentEnabled) ||
          linked;

        return (
          pending &&
          actionable
        );
      });
  }

  return rows.filter(x =>
    !failed.has(
      String(
        x.object.EventID || ''
      )
    )
  );
}

function syncYearContext_(year, target, sourceOnly) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const eventsSheet = ss.getSheetByName(CALV2.SHEETS.EVENTS);

  const years = tableObjects_(
    ss.getSheetByName(CALV2.SHEETS.YEARS)
  );

  const yearRow = years.find(r =>
    Number(r.Year) === Number(year)
  );

  if (!yearRow ||
      String(yearRow.Status || '').toUpperCase() === 'ARCHIVED') {
    throw new Error('Year is missing or archived.');
  }

  const lanes = tableObjects_(
    ss.getSheetByName(CALV2.SHEETS.LANES)
  );

  const laneMap = {};
  lanes.forEach(r => laneMap[String(r.LaneID)] = r);

  const calendarId=calendarIdForTarget_(target);
  const resolved={calendar:sourceOnly ? null : calendarApiAccess_(calendarId,target,true),calendarId:calendarId};

  return {
    eventsSheet: eventsSheet,
    yearRow: yearRow,
    laneMap: laneMap,
    calendar: resolved.calendar,
    calendarId: resolved.calendarId
  };
}

function desiredSyncState_(target, ev, yearRow, laneMap) {
  const lane = laneMap[String(ev.LaneID)] || {};
  const published =
    String(ev.Status || '').toUpperCase() === 'PUBLISHED';
  const alive = !ev.DeletedAt;

  return target === 'staff'
    ? alive &&
      published &&
      yes_(lane.SyncToStaffCalendar)
    : alive &&
      published &&
      yes_(ev.ParentEnabled);
}

function finaliseCalendarSyncSession_(actor, session, requestId) {
  if(!Number.isFinite(session.finalDurationMs)){
    session.finalDurationMs=Date.now()-Number(session.startedEpochMs||Date.now());
    session.finalisedBy=actor.userAlias;
    writeCalendarSyncSession_(session);
  }
  const duration=session.finalDurationMs;
  const historyActor=Object.assign({},actor,{userAlias:session.finalisedBy||session.startedBy||actor.userAlias});

  const counts = session.counts || emptySyncCounts_();
  const blockedEvents = session.blockedEvents || [], blockedCount = blockedEvents.length;
  const history=calendarSyncHistory_(historyActor,session,requestId);

  appendSyncLog_(
    session.syncRunId,
    session.year,
    historyActor.userAlias,
    counts,
    duration,
    history
  );

  calendarSyncAuditOnce_(
    'AUD-SYNC-'+sha256_(session.syncRunId),
    historyActor,
    session.target === 'staff'
      ? 'SYNC_STAFF_YEAR'
      : 'SYNC_PARENT_YEAR',
    'Year',
    String(session.year),
    null,
    {
      target: session.target,
      calendarId: session.calendarId,
      syncRunId: session.syncRunId,
      initialPending: session.initialPending,
      processedTotal: session.processedTotal,
      counts: history?Object.assign({},counts,{errors:[],errorCount:counts.errors.length,history:history}):counts,
      blockedEvents: history?[]:blockedEvents,
      ...(history?{history:history}:{}),
      blockedCount: blockedCount,
      fullySynced: !blockedCount && !counts.errors.length,
      durationMs: duration,
      batched: true
    },
    requestId
  );

  clearCalendarSyncSession_();

  return serialise_({
    syncRunId: session.syncRunId,
    target: session.target,
    year: session.year,
    initialPending: session.initialPending,
    processedTotal: session.processedTotal,
    remaining: blockedCount,
    blockedEvents: blockedEvents,
    blockedCount: blockedCount,
    actionableRemaining: 0,
    fullySynced: !blockedCount && !counts.errors.length,
    completionState: blockedCount ? 'blocked' : counts.errors.length ? 'errors' : 'complete',
    counts: counts,
    writes: syncWriteCount_(counts, session.target),
    durationMs: duration,
    completed: true
  });
}


function effectiveSyncBatchSize_() {
  const configured =
    Math.max(
      1,
      Number(
        setting_(
          'SYNC_BATCH_SIZE'
        ) || 5
      )
    );

  // Calendar updates can require several CalendarApp mutations per Event.
  // Keeping each Apps Script web request small prevents long upstream requests
  // from being dropped by the Worker/browser transport. A whole-year sync is
  // already resumable, so more small batches are safer than fewer large ones.
  return Math.min(
    configured,
    5
  );
}

function effectiveWipeBatchSize_() {
  const configured =
    Math.max(
      1,
      Number(
        setting_(
          'WIPE_BATCH_SIZE'
        ) || 5
      )
    );

  return Math.min(
    configured,
    5
  );
}

function clearStaleCalendarOperationIfNeeded_(
  actor,
  kind,
  requestId
) {
  const normalized =
    String(kind || '')
      .trim()
      .toLowerCase();

  if (
    normalized !== 'sync' &&
    normalized !== 'wipe'
  ) {
    throw new Error(
      'Calendar operation kind must be sync or wipe.'
    );
  }

  const status =
    operationStatus_();

  const op =
    status[normalized];

  if (
    !op ||
    !op.stale
  ) {
    return {
      cleared:
        false,
      operation:
        op || null
    };
  }

  if (normalized === 'sync') {
    clearCalendarSyncSession_();
  } else {
    clearCalendarWipeSession_();
  }

  appendAudit_(
    actor,
    normalized === 'sync'
      ? 'AUTO_CLEAR_STALE_SYNC'
      : 'AUTO_CLEAR_STALE_WIPE',
    'System',
    String(op.id || ''),
    op,
    {
      cleared:
        true,
      reason:
        'Stale Calendar operation marker cleared before starting/resuming another Calendar operation.'
    },
    requestId
  );

  return {
    cleared:
      true,
    operation:
      op
  };
}

function forceClearCalendarWipeSession() {
  return withRC17WriteLock_(() => {
    const before = readCalendarWipeSession_();
    if (before && before.claim && Number(before.claim.expiresAt) > Date.now()) throw new Error('A Calendar wipe batch may still be running. Wait until its seven-minute recovery window ends before clearing it.');
    clearCalendarWipeSession_();
    return {ok: true, cleared: !!before, previous: before || null, clearedAt: isoNow_()};
  });
}

function inspectCalendarOperationSessions() {
  const result = {
    sync:
      readCalendarSyncSession_(),
    wipe:
      readCalendarWipeSession_(),
    status:
      operationStatus_()
  };

  console.log(
    'CALENDAR OPERATION SESSIONS ' +
    JSON.stringify(result)
  );

  return result;
}

function apiStartSyncYear_(actor, payload, requestId) {
  const year =
    Number(payload.year);

  if (!Number.isInteger(year)) {
    throw new Error('Year required.');
  }

  const target =
    normaliseCalendarTarget_(
      payload.target || 'staff'
    );

  const sourceWaiting=readCalendarSyncSession_();
  if(sourceWaiting&&Number(sourceWaiting.year)===year&&sourceWaiting.target===target&&sourceWaiting.pauseReason==='SOURCE_READ_RATE_LIMIT'&&Number(sourceWaiting.nextAttemptEpochMs)>Date.now())return calendarSyncProgress_(sourceWaiting,{resumed:true});
  // Respect a saved source cooldown before reading even the schema. A missing
  // header is one setup failure, not a provider error repeated for each event.
  mutationSheet_();
  calendarProviderResumeReviewed_();
  const resumable = readCalendarSyncSession_();
  if (resumable && Number(resumable.year) === year && resumable.target === target && calendarProviderProgress_(resumable).paused) {
    // Permission pauses can be retried explicitly; provider deadlines cannot.
    if (calendarProviderProgress_().paused || Number(resumable.nextAttemptEpochMs || 0) > Date.now()) return calendarSyncProgress_(resumable, {resumed: true});
  }
  // Access checks do not hold the shared Calendar writer lock.
  rc18AssertNoPendingEvent_('','','','publication');
  const calendar = calendarApiAccess_(calendarIdForTarget_(target), target, true);
  const lock =
    calendarWriteLock_();

  if (!lock.tryLock(5000)) {
    throw new Error(
      'Another Calendar sync or wipe request is running.'
    );
  }

  try {
    if (calendar.id !== calendarIdForTarget_(target)) throw new Error('Calendar destination changed during access check. Try Sync again.');
    // An unresolved publication may still be applying native row patches.
    rc18AssertNoPendingEvent_('','','','publication');
    // Clear abandoned markers before they can block or be revived by a new
    // operation. Non-stale operations retain normal resume/block semantics.
    clearStaleCalendarOperationIfNeeded_(
      actor,
      'wipe',
      requestId
    );

    clearStaleCalendarOperationIfNeeded_(
      actor,
      'sync',
      requestId
    );

    const activeWipe =
      readCalendarWipeSession_();

    if (activeWipe) {
      throw new Error(
        calendarLabelForTarget_(
          activeWipe.target
        ) +
        ' Calendar wipe is in progress for ' +
        activeWipe.year +
        '. Complete the wipe in URL Setup before running Sync.'
      );
    }

    const existing =
      readCalendarSyncSession_();

    if (existing) {
      if (
        Number(existing.year) === year &&
        String(existing.target) === target
      ) {
        if(Number.isFinite(existing.finalDurationMs))return finaliseCalendarSyncSession_(actor,existing,requestId);
        const context =
          syncYearContext_(
            year,
            target, true
          );

        const remaining =
          eligibleSyncRows_(
            context.eventsSheet,
            year,
            target,
            existing.failedIds || [],
            context.yearRow,
            context.laneMap
          ).length;

        existing.remaining =
          remaining;

        existing.resumedAt =
          isoNow_();
        delete existing.paused;

        writeCalendarSyncSession_(
          existing
        );

        return serialise_(
          Object.assign(
            {},
            existing,
            {
              completed:
                false,
              resumed:
                true,
              writes:
                syncWriteCount_(
                  existing.counts ||
                    emptySyncCounts_(),
                  target
                )
            }
          )
        );
      }

      throw new Error(
        calendarLabelForTarget_(
          existing.target
        ) +
        ' Calendar sync is already in progress for ' +
        existing.year +
        '. Complete that sync before starting another.'
      );
    }

    assertOperationalHealthFor_(
      'Calendar sync ' +
      calendarLabelForTarget_(target) +
      ' ' +
      year,
      year
    );

    const context =
      syncYearContext_(
        year,
        target, true
      );

    const rows =
      eligibleSyncRows_(
        context.eventsSheet,
        year,
        target,
        [],
        context.yearRow,
        context.laneMap
      );

    const session = {
      syncRunId:
        'SYNC-' + Utilities.getUuid(),
      target:
        target,
      year:
        year,
      calendarId:
        context.calendarId,
      calendarName:
        calendar.summary,
      effectiveUser:
        String(
          Session
            .getEffectiveUser()
            .getEmail() || ''
        ),
      initialPending:
        rows.length,
      processedTotal:
        0,
      remaining:
        rows.length,
      counts:
        emptySyncCounts_(),
      failedIds:
        [],
      startedAt:
        isoNow_(),
      startedEpochMs:
        Date.now(),
      startedBy:
        actor.userAlias
    };

    appendAudit_(
      actor,
      target === 'staff'
        ? 'START_SYNC_STAFF_YEAR'
        : 'START_SYNC_PARENT_YEAR',
      'Year',
      String(year),
      null,
      {
        syncRunId:
          session.syncRunId,
        target:
          target,
        calendarId:
          session.calendarId,
        calendarName:
          session.calendarName,
        effectiveUser:
          session.effectiveUser,
        initialPending:
          session.initialPending,
        batchSize:
          effectiveSyncBatchSize_(),
        delayMs:
          Math.max(
            500,
            Number(
              setting_('SYNC_DELAY_MS') ||
              500
            )
          )
      },
      requestId
    );

    if (!rows.length) {
      return finaliseCalendarSyncSession_(
        actor,
        session,
        requestId
      );
    }

    writeCalendarSyncSession_(
      session
    );

    return serialise_(
      Object.assign(
        {},
        session,
        {
          completed:
            false,
          resumed:
            false,
          writes:
            0
        }
      )
    );

  } finally {
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}

// A claim is longer than the Apps Script execution limit. A stopped request can
// be resumed after expiry, using the existing durable Calendar event identity.
const CALENDAR_SYNC_CLAIM_MS_ = 7 * 60 * 1000;
var calendarSyncClaim_ = null;

// Called only through the separately authenticated service envelope. It cannot
// start work, select a year, or choose an identity supplied by the caller.
function apiContinueCalendarSync_() {
  rc18ResetIO_();
  const sync = readCalendarSyncSession_(), session = sync || readCalendarWipeSession_();
  if (!session) return {idle: true, state: 'idle'};
  if (calendarProviderProgress_(session).paused) return (sync ? calendarSyncProgress_ : calendarWipeProgress_)(session, {state: 'paused'});
  const alias = String(session.startedBy || '').trim().toLowerCase();
  if (!alias) throw new Error('Calendar sync owner is missing. Resume Sync as an Admin.');
  const actor = {sub: 'calendar-background', email: alias + '@' + CALV2.DOMAIN, userAlias: alias};
  const result = dispatch_(sync ? 'syncYearBatch' : 'calendarWipeBatch', actor, sync ? {syncRunId: session.syncRunId} : {wipeId: session.wipeId}, 'calendar-background-' + Utilities.getUuid());
  return Object.assign({}, result, {state: result.completed ? 'completed' : result.paused ? 'paused' : 'inProgress'});
}

function calendarSyncProgress_(session, extra) {
  return serialise_(Object.assign({
    syncRunId: session.syncRunId, target: session.target, year: session.year,
    initialPending: session.initialPending, processedTotal: session.processedTotal,
    remaining: session.remaining, counts: session.counts,
    blockedEvents: session.blockedEvents || [],
    blockedCount: (session.blockedEvents || []).length,
    actionableRemaining: session.actionableRemaining === undefined ? session.remaining : session.actionableRemaining,
    writes: syncWriteCount_(session.counts || emptySyncCounts_(), session.target),
    completed: false
  }, calendarProviderProgress_(session), extra || {}));
}

function calendarSyncStatusError_(code) {
  const messages={
    SYNC_STATUS_MISSING:'The exact Calendar sync outcome is not available. Keep its run reference for administrator review; no new sync was started.',
    SYNC_STATUS_MISMATCH:'The Calendar sync reference does not match the requested year or target. Keep the original run reference; no new sync was started.',
    SYNC_STATUS_UNREADABLE:'The saved Calendar sync outcome cannot be verified. Keep its recovery data for administrator review; no new sync was started.'
  };
  return mutationError_(code,messages[code],code==='SYNC_STATUS_UNREADABLE'?503:409,true);
}
function calendarSyncStatusCounts_(counts, history) {
  if(!counts||typeof counts!=='object'||!Array.isArray(counts.errors))throw calendarSyncStatusError_('SYNC_STATUS_UNREADABLE');
  if(history&&(!Number.isSafeInteger(counts.errorCount)||!counts.history||
      !['schema','sheet','action','syncRunId','parts','sha256'].every(key=>counts.history[key]===history[key]))||
     !history&&counts.history)throw calendarSyncStatusError_('SYNC_STATUS_UNREADABLE');
  const compact={};
  for(const key of ['staffCreates','staffUpdates','staffDeletes','parentCreates','parentUpdates','parentDeletes']){
    if(!Number.isSafeInteger(counts[key])||counts[key]<0)throw calendarSyncStatusError_('SYNC_STATUS_UNREADABLE');
    compact[key]=counts[key];
  }
  const errorCount=counts.errorCount===undefined?counts.errors.length:counts.errorCount;
  if(!Number.isSafeInteger(errorCount)||errorCount<0||(!history&&errorCount!==counts.errors.length)||
     (history&&counts.errors.length!==0)||!counts.errors.every(row=>row&&typeof row.eventId==='string'&&typeof row.error==='string'))throw calendarSyncStatusError_('SYNC_STATUS_UNREADABLE');
  return Object.assign(compact,{errors:[],errorCount:errorCount});
}
/** Observe only the requested run. This route never settles a claim, clears a
 * checkpoint, retries a failed event, or starts a new run. Its short lock gives
 * the same fresh Admin check and a consistent view of completion + checkpoint. */
function apiCalendarSyncStatus_(actor,payload) {
  const syncRunId=String(payload.syncRunId||''),year=Number(payload.year),target=payload.target;
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(syncRunId)||!Number.isInteger(year)||!['staff','parent'].includes(target))throw calendarSyncStatusError_('SYNC_STATUS_MISMATCH');
  return withCalendarCoordinationLock_(()=>{
    const session=readCalendarSyncSession_();
    if(session&&session.syncRunId===syncRunId){
      if(session.year!==year||session.target!==target)throw calendarSyncStatusError_('SYNC_STATUS_MISMATCH');
      if(!['initialPending','processedTotal','remaining'].every(key=>Number.isSafeInteger(session[key])&&session[key]>=0)||
         (session.claim&&(!session.claim.id||!Number.isFinite(session.claim.expiresAt)))||
         (session.finalDurationMs!==undefined&&(!Number.isFinite(session.finalDurationMs)||session.finalDurationMs<0))||
         (session.pendingSettlement&&(!session.claim||session.pendingSettlement.claimId!==session.claim.id||!Array.isArray(session.pendingSettlement.outcomes)||session.pendingSettlement.outcomes.length>5||!session.pendingSettlement.providerBatch)))throw calendarSyncStatusError_('SYNC_STATUS_UNREADABLE');
      let progress;try{progress=calendarSyncProgress_(session);}catch(error){throw calendarSyncStatusError_('SYNC_STATUS_UNREADABLE');}
      // Saved settlement/finalisation is resumed by syncYearBatch before its
      // claim check. It must not wait seven minutes or replay provider work.
      const inProgress=!!(session.claim&&session.claim.expiresAt>Date.now()&&!session.pendingSettlement&&!Number.isFinite(session.finalDurationMs));
      return Object.assign(progress,{counts:calendarSyncStatusCounts_(session.counts),blockedEvents:[],readOnly:true,
        inProgress:inProgress,readyToResume:!inProgress&&!progress.paused,
        retryAfterMs:Math.max(Number(progress.retryAfterMs||0),inProgress?1200:0)});
    }
    // P writes this deterministic summary before clearing its active marker.
    // Never substitute another run's latest SyncLog or audit row.
    let hit;
    try{hit=findRowByKey_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.AUDIT),'AuditID','AUD-SYNC-'+sha256_(syncRunId));}
    catch(error){throw calendarSyncStatusError_('SYNC_STATUS_UNREADABLE');}
    if(!hit)throw calendarSyncStatusError_(session?'SYNC_STATUS_MISMATCH':'SYNC_STATUS_MISSING');
    const row=hit.object;let saved;
    try{saved=JSON.parse(row.AfterJSON);}catch(error){throw calendarSyncStatusError_('SYNC_STATUS_UNREADABLE');}
    if(!saved||typeof saved!=='object')throw calendarSyncStatusError_('SYNC_STATUS_UNREADABLE');
    if(row.Action!==(target==='staff'?'SYNC_STAFF_YEAR':'SYNC_PARENT_YEAR')||row.EntityType!=='Year'||String(row.EntityID)!==String(year)||saved.syncRunId!==syncRunId||saved.target!==target)throw calendarSyncStatusError_('SYNC_STATUS_MISMATCH');
    const history=saved.history;
    if(history&&(history.schema!==1||history.sheet!=='AuditLog'||history.action!=='SYNC_DETAIL'||history.syncRunId!==syncRunId||!Number.isSafeInteger(history.parts)||history.parts<1||!/^[a-f0-9]{64}$/.test(history.sha256||'')))throw calendarSyncStatusError_('SYNC_STATUS_UNREADABLE');
    const counts=calendarSyncStatusCounts_(saved.counts,history);
    if(!['initialPending','processedTotal','blockedCount'].every(key=>Number.isSafeInteger(saved[key])&&saved[key]>=0)||
       !Number.isFinite(saved.durationMs)||saved.durationMs<0||!Array.isArray(saved.blockedEvents)||
       (!history&&saved.blockedCount!==saved.blockedEvents.length)||
       saved.fullySynced!==(saved.blockedCount===0&&counts.errorCount===0))throw calendarSyncStatusError_('SYNC_STATUS_UNREADABLE');
    return {readOnly:true,syncRunId:syncRunId,year:year,target:target,completed:true,inProgress:false,readyToResume:false,
      initialPending:saved.initialPending,processedTotal:saved.processedTotal,counts:counts,writes:syncWriteCount_(counts,target),
      blockedEvents:[],blockedCount:saved.blockedCount,remaining:saved.blockedCount,actionableRemaining:0,
      fullySynced:saved.fullySynced,completionState:saved.blockedCount?'blocked':counts.errorCount?'errors':'complete',durationMs:saved.durationMs};
  });
}

function calendarSyncSelection_(context, session) {
  const rows=eligibleSyncRows_(context.eventsSheet,session.year,session.target,
    session.failedIds || [],context.yearRow,context.laneMap);
  const pending=new Set(rc18PendingEventWrites_().map(row=>row.eventId));
  const blocked=rows.filter(row=>pending.has(String(row.object.EventID))).map(row=>({eventId:String(row.object.EventID),code:'PENDING_EVENT_WRITE'}));
  return {rows:rows,ready:rows.filter(row=>!pending.has(String(row.object.EventID))),blocked:blocked};
}
function calendarSyncSetSelection_(session, selection) {
  session.remaining=selection.rows.length;
  session.actionableRemaining=selection.ready.length;
  session.blockedEvents=selection.blocked;
}

function calendarSyncSourceHash_(target, ev, context) {
  const content = RC17_CORE.EDIT_FIELDS.map(k => [k, rc18Value_(k, ev[k])]);
  content.push(['DeletedAt', rc18Value_('DeletedAt', ev.DeletedAt)],
    ['LastMutationID', String(ev.LastMutationID || '')],
    ['desired', desiredSyncState_(target, ev, context.yearRow, context.laneMap)],
    ['yearStatus', String(context.yearRow.Status || '')], ['calendarId', context.calendarId]);
  return sha256_(JSON.stringify(content));
}

function calendarSyncAssertClaim_() {
  if (!calendarSyncClaim_) return;
  const session = readCalendarSyncSession_(), claim = session && session.claim;
  if (!claim || session.syncRunId !== calendarSyncClaim_.syncRunId ||
      claim.id !== calendarSyncClaim_.id || Number(claim.expiresAt) <= Date.now()) {
    throw mutationError_('SYNC_CLAIM_EXPIRED', 'Calendar sync claim changed. Resume Sync from its current state.', 409, true);
  }
}

function apiSyncYearBatch_(actor, payload, requestId) {
  const syncRunId = String(payload.syncRunId || '').trim();
  if (!syncRunId) throw new Error('Sync run ID required.');
  let session, context, batch, claim;
  const ready = withRC17WriteLock_(() => {
    const wipe = readCalendarWipeSession_();
    if (wipe) throw new Error('Calendar wipe is in progress for ' + wipe.year + '.');
    session = readCalendarSyncSession_();
    if (!session || session.syncRunId !== syncRunId) {
      throw new Error('Calendar sync session is no longer active. Start the same Sync again to check current pending rows.');
    }
    if(Number.isFinite(session.finalDurationMs))return finaliseCalendarSyncSession_(actor,session,requestId);
    if(session.pendingSettlement){
      if(session.pauseReason==='SOURCE_READ_RATE_LIMIT'&&Number(session.nextAttemptEpochMs)>Date.now())return calendarSyncProgress_(session);
      return calendarSyncResumeSettlement_(actor,session,requestId);
    }
    if (calendarProviderProgress_(session).paused) return calendarSyncProgress_(session);
    if (session.claim && Number(session.claim.expiresAt) > Date.now()) {
      return calendarSyncProgress_(session, {inProgress: true, retryAfterMs: 1200});
    }
    mutationSheet_();
    rc18AssertNoPendingEvent_('','','','publication');
    // This context reads only source data. Provider access is checked after release.
    context = syncYearContext_(session.year, session.target, true);
    if (context.calendarId !== String(session.calendarId)) {
      throw new Error('Calendar destination changed during Sync. Start a new run after checking URL Setup.');
    }
    const selection=calendarSyncSelection_(context,session),rows=selection.rows;
    calendarSyncSetSelection_(session,selection);
    if (!selection.ready.length) return finaliseCalendarSyncSession_(actor, session, requestId);
    if (new Set(rows.map(x => String(x.object.EventID))).size !== rows.length) throw new Error('Duplicate EventID prevents safe Calendar sync.');
    batch = rc18Rows_(context.eventsSheet, selection.ready.slice(0, effectiveSyncBatchSize_()).map(x => x.row));
    calendarSyncCheckpointReserve_(session,batch);
    claim = {id: Utilities.getUuid(), expiresAt: Date.now() + CALENDAR_SYNC_CLAIM_MS_,
      items: batch.map(x => ({eventId: String(x.object.EventID), sourceHash: calendarSyncSourceHash_(session.target, x.object, context)}))};
    session.claim = claim;
    session.remaining = rows.length;
    session.lastBatchStartedAt = isoNow_();
    session.lastBatchRequestId = requestId;
    session.currentBatchSize = batch.length;
    delete session.paused;
    writeCalendarSyncSession_(session);
    return null;
  }, true);
  if (ready) return ready;

  const previousClaim = calendarSyncClaim_, previousBatch = calendarProviderBatch_;
  const providerBatch = {attempts: 0, lastThrottleAt: calendarProviderState_().lastThrottleAt};
  calendarProviderBatch_ = providerBatch;
  calendarSyncClaim_ = {syncRunId: syncRunId, id: claim.id};
  const outcomes = [];
  let fatal;
  try {
    const calendar = calendarApiAccess_(context.calendarId, session.target, true);
    for (const item of batch) {
      calendarSyncAssertClaim_();
      try {
        // Another source request may become uncertain after the batch claim.
        // Keep that event pending without dispatching its stale proposal or
        // blocking unrelated claimed items. Year-wide fences still stop all.
        const blocked=withCalendarCoordinationLock_(()=>{
          rc18AssertNoPendingEvent_('','','','publication');
          return rc18PendingEventWrites_().some(row=>row.eventId===String(item.object.EventID));
        });
        if(blocked){outcomes.push({eventId:String(item.object.EventID),blocked:true});continue;}
        const result = syncTarget_(calendar, session.target, item.object,
          desiredSyncState_(session.target, item.object, context.yearRow, context.laneMap));
        outcomes.push({eventId: String(item.object.EventID), result: result});
      } catch (error) {
        if(error.calendarSourceReadTemporary){fatal=error;break;}
        if(error.calendarEventWriteBlocked){outcomes.push({eventId:String(item.object.EventID),blocked:true});continue;}
        const failure = calendarApiFailure_(error);
        const pause = !!error.calendarDeferred || failure.manualReview || [401, 403, 429].includes(failure.status) || failure.reason === 'API_DISABLED' || ['SYNC_CLAIM_EXPIRED','PENDING_EVENT_WRITE','BUSY'].includes(error.code);
        if (pause) { fatal = error; break; }
        outcomes.push({eventId: String(item.object.EventID), error: calendarApiMessage_(error), pause: pause});
      }
    }
  } catch (error) { fatal = error; }
  finally { calendarSyncClaim_ = previousClaim; calendarProviderBatch_ = previousBatch; }
  // A source read failure after a provider write cannot become an event
  // validation error. Retain the claim and durable provider identity so the
  // ordinary source cooldown can resume safely after its recovery window.
  if(fatal&&fatal.calendarSourceReadTemporary)throw fatal;

  return calendarSyncSettleBatch_(actor,syncRunId,claim,requestId,outcomes,fatal,providerBatch);
}

function calendarSyncResumeSettlement_(actor,session,requestId){
  const saved=session.pendingSettlement;
  if(!session.claim||saved.claimId!==session.claim.id||!Array.isArray(saved.outcomes)||saved.outcomes.length>5||!saved.providerBatch)throw mutationError_('SYNC_CHECKPOINT_UNREADABLE','Calendar sync settlement checkpoint is incomplete. Keep it for administrator review.',503,true);
  let fatal=null;if(saved.fatal){fatal=Object.assign(new Error(saved.fatal.message),saved.fatal);}
  return calendarSyncSettleBatch_(actor,session.syncRunId,session.claim,requestId,saved.outcomes,fatal,saved.providerBatch);
}

function calendarSyncSettleBatch_(actor,syncRunId,claim,requestId,outcomes,fatal,providerBatch){
  // Rows can move or change while Google is running. Locate by EventID again,
  // and acknowledge only the exact source content claimed above.
  const result = withRC17WriteLock_(() => {
    const session = readCalendarSyncSession_();
    if (!session || session.syncRunId !== syncRunId || !session.claim || session.claim.id !== claim.id) {
      throw mutationError_('SYNC_CLAIM_CHANGED', 'Calendar sync was stopped or replaced. Its provider result was not applied to source rows.', 409, true);
    }
    // Nested settlement recovery already holds the writer lock. Reassert the
    // year fence explicitly because the nested lock helper does not re-enter it.
    rc18AssertNoPendingEvent_('','','','publication');
    if(!session.pendingSettlement){
      // Save the bounded provider outcomes before source rows are changed.
      // If source or final checkpoint writes are interrupted, the same claim
      // settles these outcomes again without replaying provider operations.
      session.pendingSettlement={claimId:claim.id,outcomes:outcomes.map(outcome=>outcome.error?Object.assign({},outcome,{error:String(outcome.error).slice(0,240)}):outcome),
        providerBatch:{attempts:providerBatch.attempts,lastThrottleAt:providerBatch.lastThrottleAt},
        fatal:fatal?{message:calendarApiMessage_(fatal).slice(0,240),code:fatal.code,calendarDeferred:!!fatal.calendarDeferred,calendarFailure:calendarApiFailure_(fatal)}:null};
      writeCalendarSyncSession_(session);
    }
    const current = syncYearContext_(session.year, session.target, true);
    const wanted = new Set(claim.items.map(x => x.eventId));
    const selected = rc18Projection_(current.eventsSheet, ['EventID']).filter(x => wanted.has(String(x.object.EventID)));
    if (new Set(selected.map(x => String(x.object.EventID))).size !== selected.length) throw new Error('Duplicate EventID prevents safe Calendar sync settlement.');
    const latest = new Map(rc18Rows_(current.eventsSheet, selected.map(x => x.row)).map(x => [String(x.object.EventID), x]));
    const sources = new Map(claim.items.map(x => [x.eventId, x.sourceHash]));
    const pending=new Set(rc18PendingEventWrites_().map(row=>row.eventId));
    let deferred = 0;
    rc18Atomic_(() => {
      outcomes.forEach(outcome => {
        if(outcome.blocked){deferred++;return;}
        const hit = latest.get(outcome.eventId);
        if (outcome.result && ['create','update','delete'].includes(outcome.result.action)) {
          const suffix = {create: 'Creates', update: 'Updates', delete: 'Deletes'}[outcome.result.action];
          session.counts[session.target + suffix]++;
        }
        session.processedTotal++;
        if (!hit || sources.get(outcome.eventId) !== calendarSyncSourceHash_(session.target, hit.object, current)) {
          deferred++;
          return;
        }
        // An unresolved concurrent source write must keep this source pending.
        if(pending.has(outcome.eventId)){deferred++;return;}
        if (outcome.error) {
          session.counts.errors.push({eventId: outcome.eventId, target: session.target, error: outcome.error.slice(0, 240)});
          if (!outcome.pause && !session.failedIds.includes(outcome.eventId)) session.failedIds.push(outcome.eventId);
          updateRowPatch_(current.eventsSheet, hit.row, {[session.target === 'staff' ? 'StaffSyncState' : 'ParentSyncState']: 'ERROR'});
        } else {
          updateRowPatch_(current.eventsSheet, hit.row, Object.assign({}, outcome.result.patch, {LastSyncedAt: isoNow_()}));
        }
      });
    });
    // Always re-read eligibility: another user can add pending work in this batch.
    const selection=calendarSyncSelection_(current,session);
    calendarSyncSetSelection_(session,selection);
    session.lastBatchAt = isoNow_();
    delete session.sourceReadThrottleCount;
    session.deferredTotal = Number(session.deferredTotal || 0) + deferred;
    delete session.claim;
    delete session.pendingSettlement;
    calendarProviderSettleBatch_(session, fatal, providerBatch);
    writeCalendarSyncSession_(session);
    if (!session.actionableRemaining && !fatal) return finaliseCalendarSyncSession_(actor, session, requestId);
    return calendarSyncProgress_(session, {batchProcessed: outcomes.length, deferred: deferred});
  });
  return result;
}

/* Q222: Calendar v3 transport. Durable API IDs are separate from the legacy
 * iCalUID columns. calendarLink rows in MutationLog are permanent link records,
 * not expiring request receipts. Archive does not remove this table. */
function calendarApiRequire_() {
  if (typeof Calendar === 'undefined' || !Calendar.Events || !Calendar.Calendars) {
    throw mutationError_('CALENDAR_SERVICE_DISABLED','Enable Calendar API v3 in Apps Script Services, then authorise the deployment account.',503,true);
  }
}
// One bounded property coordinates the deployment account across Staff/Parent,
// browser requests and the Worker. Provider calls and pacing waits run unlocked.
const CALENDAR_PROVIDER_STATE_PROPERTY_ = 'CALENDAR_PROVIDER_PACING_V1';
var calendarProviderBatch_ = null;
function calendarProviderState_() {
  const raw = PropertiesService.getScriptProperties().getProperty(CALENDAR_PROVIDER_STATE_PROPERTY_);
  if (!raw) return {calendars: {}, throttleCount: 0};
  try { return JSON.parse(raw); }
  catch (error) { throw new Error('Calendar provider recovery state is unreadable. Ask an Admin to review it before syncing.'); }
}
function calendarProviderSave_(state) {
  PropertiesService.getScriptProperties().setProperty(CALENDAR_PROVIDER_STATE_PROPERTY_, JSON.stringify(state));
}
function calendarProviderProgress_(session) {
  const state = calendarProviderState_();
  const next = Math.max(Number(state.nextAttemptEpochMs || 0), Number(session && session.nextAttemptEpochMs || 0));
  const providerPaused = state.manualReview || Number(state.nextAttemptEpochMs || 0) > Date.now();
  const manual = !!(state.manualReview || (session && session.paused));
  return {paused: manual || next > Date.now(), manualReview: manual,
    pauseReason: providerPaused ? state.pauseReason : String(session && session.pauseReason || ''),
    providerReason: String(state.providerReason || ''), providerStatus: Number(state.providerStatus || 0),
    nextAttemptEpochMs: next, nextRetryAt: next ? new Date(next).toISOString() : '',
    retryAfterMs: Math.max(0, next - Date.now())};
}
function calendarProviderDeferred_(progress) {
  const error = mutationError_('CALENDAR_DEFERRED', progress.manualReview ?
    'Calendar sync needs manual review before retrying.' : 'Paused by Google Calendar. Resume after the saved retry time.', 429, true);
  error.calendarDeferred = true;
  error.calendarFailure = {status: Number(progress.providerStatus || 0), reason: progress.pauseReason || 'BATCH_YIELD', transient: !progress.manualReview};
  return error;
}
function calendarProviderAssertReady_() {
  const progress = calendarProviderProgress_();
  if (progress.paused) throw calendarProviderDeferred_(progress);
}
function calendarProviderBeginWrite_(target, calendarId) {
  if (calendarProviderBatch_ && calendarProviderBatch_.attempts >= 20) {
    throw calendarProviderDeferred_({pauseReason: 'BATCH_YIELD'});
  }
  const reservation = withCalendarCoordinationLock_(() => {
    calendarProviderAssertReady_();
    const state = calendarProviderState_(), now = Date.now();
    const key = sha256_(String(calendarId || calendarIdForTarget_(target)));
    const slots = state.calendars || {}, slot = slots[key] || {};
    if (slot.lease && Number(slot.lease.expiresAt) > now) {
      throw calendarProviderDeferred_({pauseReason: 'PROVIDER_BUSY'});
    }
    const gap = Math.min(5000, Math.max(500, Number(setting_('SYNC_DELAY_MS')) || 500));
    const wait = Math.max(0, Number(slot.nextWriteEpochMs || 0) - now);
    if (wait > 5000) throw calendarProviderDeferred_({pauseReason: 'PROVIDER_BUSY'});
    const lease = {id: Utilities.getUuid(), expiresAt: now + CALENDAR_SYNC_CLAIM_MS_};
    slots[key] = {nextWriteEpochMs: now + wait + gap, lease: lease};
    // Destination changes cannot grow Script Properties without bound.
    state.calendars = Object.fromEntries(Object.keys(slots).sort((a,b) => slots[b].nextWriteEpochMs - slots[a].nextWriteEpochMs).slice(0,8).map(k => [k, slots[k]]));
    calendarProviderSave_(state);
    return {key: key, id: lease.id, wait: wait, gap: gap};
  });
  try {
    if (reservation.wait) Utilities.sleep(reservation.wait);
    calendarProviderAssertReady_();
    calendarSyncAssertClaim_();
    if (calendarProviderBatch_) calendarProviderBatch_.attempts++;
    return reservation;
  } catch (error) { calendarProviderEndWrite_(reservation); throw error; }
}
function calendarProviderEndWrite_(reservation) {
  withCalendarCoordinationLock_(() => {
    const state = calendarProviderState_(), slot = (state.calendars || {})[reservation.key];
    if (slot && slot.lease && slot.lease.id === reservation.id) {
      delete slot.lease;
      slot.nextWriteEpochMs = Math.max(Number(slot.nextWriteEpochMs || 0), Date.now() + reservation.gap);
      calendarProviderSave_(state);
    }
  });
}
function calendarProviderPause_(failure, operation, error) {
  return withCalendarCoordinationLock_(() => {
    const state = calendarProviderState_();
    state.throttleCount = Number(state.throttleCount || 0) + 1;
    const seconds = failure.reason === 'RATE_LIMIT' ? Math.min(900, 60 * Math.pow(2, state.throttleCount - 1)) : 86400;
    state.nextAttemptEpochMs = Math.max(Number(state.nextAttemptEpochMs || 0), Date.now() + Math.max(seconds * 1000 + Math.floor(Math.random() * 15001), failure.retryAfterMs || 0));
    state.manualReview = failure.reason !== 'RATE_LIMIT' || state.throttleCount >= 8;
    state.pauseReason = failure.reason;
    state.providerReason = failure.providerReason;
    state.providerStatus = failure.status;
    state.operation = operation;
    state.lastThrottleAt = Utilities.getUuid();
    calendarProviderSave_(state);
    error.calendarDeferred = true;
    return state;
  });
}
function calendarProviderResumeReviewed_() {
  // An explicit Admin start may resume a reviewed long-term/persistent limit,
  // but even that cannot bypass its not-before time.
  withCalendarCoordinationLock_(() => {
    const state = calendarProviderState_();
    if (state.manualReview && Number(state.nextAttemptEpochMs) <= Date.now()) {
      state.manualReview = false; state.throttleCount = 0;
      calendarProviderSave_(state);
    }
  });
}
function calendarProviderSettleBatch_(session, fatal, batch) {
  const state = calendarProviderState_();
  delete session.paused;
  if (fatal) {
    const failure = calendarApiFailure_(fatal);
    session.pauseReason = failure.reason;
    if (fatal.calendarDeferred) {
      session.nextAttemptEpochMs = Number(state.nextAttemptEpochMs) > Date.now() ? Number(state.nextAttemptEpochMs) : Date.now() + 60000;
    } else {
      session.paused = {at: isoNow_(), message: calendarApiMessage_(fatal).slice(0, 240)};
      session.nextAttemptEpochMs = 0;
    }
  } else {
    if (state.lastThrottleAt === batch.lastThrottleAt && !state.manualReview) {
      state.throttleCount = 0; state.nextAttemptEpochMs = 0;
      delete state.pauseReason; delete state.providerReason; delete state.providerStatus;
      calendarProviderSave_(state);
    }
    // This is a transport yield, not a Google quota response. The shared
    // per-calendar reservation still spaces every provider write by >=500ms.
    session.pauseReason = 'BATCH_YIELD';
    session.nextAttemptEpochMs = Date.now() + (session.wipeId?60000:1000);
  }
  session.lastBatchWriteAttempts = batch.attempts;
}
function calendarApiFailure_(err) {
  if (err && err.calendarFailure) return err.calendarFailure;
  const detail = err && err.details || {}, nested = detail.error || detail;
  const first = (nested.errors || (Array.isArray(detail) ? detail : []))[0] || {};
  const message = String(err && err.message || err || '');
  const reason = String(nested.reason || first.reason || '');
  const domain = String(first.domain || nested.domain || '');
  const code = Number(err && (err.status || err.code) || nested.code) ||
    Number((message.match(/(?:code|status|returned)\s*[:=]?\s*(\d{3})/i)||[])[1]) ||
    (/not found/i.test(message)?404:/gone|has been deleted/i.test(message)?410:/precondition/i.test(message)?412:/already exists|duplicate/i.test(message)?409:/rate limit|too many requests/i.test(message)?429:/forbidden|permission|insufficient/i.test(message)?403:/unauthori[sz]ed|authentication/i.test(message)?401:0);
  const evidence = reason + ' ' + message;
  const shortApps = /too many times in a short time/i.test(message);
  const appsQuota = !shortApps && /Service invoked too many times|Service using too much|Limit exceeded:|too much computer time/i.test(message);
  const daily = /dailyLimitExceeded|daily quota|per day|for one day/i.test(evidence);
  const usage = /quotaExceeded|Calendar usage limits exceeded/i.test(evidence);
  const rate = code === 429 || shortApps || ((code === 403 || !code) && (/rateLimitExceeded|userRateLimitExceeded|rate limit exceeded/i.test(evidence) || (domain === 'usageLimits' && !/forbidden|permission|insufficient/i.test(evidence))));
  let category = appsQuota ? 'APPS_SCRIPT_QUOTA' : daily ? 'DAILY_QUOTA' : usage ? 'CALENDAR_USAGE_LIMIT' : rate ? 'RATE_LIMIT' : code===401?'AUTH_REQUIRED':code===403?'ACCESS_DENIED':code===404?'NOT_FOUND':code===410?'REMOVED':code===409?'DUPLICATE_ID':code===412?'CONFLICT':code>=500?'SERVICE_UNAVAILABLE':'CALENDAR_ERROR';
  if (/not been used|disabled|accessNotConfigured|SERVICE_DISABLED/i.test(evidence)) category = 'API_DISABLED';
  const headers = err && (err.headers || err.responseHeaders) || {};
  const retryAfter = headers['Retry-After'] || headers['retry-after'] || err && err.retryAfter || '';
  const retryMs = /^\d+(?:\.\d+)?$/.test(String(retryAfter)) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0;
  const transient = category === 'RATE_LIMIT' || category === 'SERVICE_UNAVAILABLE' || (!code && !appsQuota && /timeout|timed out|network|temporarily|internal error|service unavailable/i.test(message));
  return {status: code, reason: category, providerReason: /^[a-zA-Z0-9_.:-]{1,80}$/.test(reason) ? reason : category,
    transient: transient, manualReview: ['DAILY_QUOTA','CALENDAR_USAGE_LIMIT','APPS_SCRIPT_QUOTA'].includes(category), retryAfterMs: retryMs};
}
function calendarApiCall_(operation,target,eventId,work,retry,outerAttempt,calendarId) {
  calendarApiRequire_();
  calendarSyncAssertClaim_();
  const count = retry === false ? 1 : 3;
  for (let attempt=1; attempt<=count; attempt++) {
    calendarProviderAssertReady_();
    const reservation = ['insert','update','remove','legacy.write'].includes(operation) ? calendarProviderBeginWrite_(target, calendarId) : null;
    const started = Date.now();
    let failure, caught;
    try {
      // Lookup and provider pacing can outlast the earlier item check. Recheck
      // the source fence immediately before mutation, without holding a writer
      // lock during the remote request. Wipe calls have no event source claim.
      if(reservation && calendarSyncClaim_ && eventId)withCalendarCoordinationLock_(()=>{
        rc18AssertNoPendingEvent_('','','','publication');
        try {rc18AssertNoPendingEvent_(eventId,'');}
        catch(error){if(error.code==='PENDING_EVENT_WRITE')error.calendarEventWriteBlocked=true;throw error;}
      });
      const result = work();
      console.log(JSON.stringify({type:'CALENDAR_API',operation:operation,target:target,eventId:eventId||'',attempt:outerAttempt||attempt,elapsedMs:Date.now()-started,outcome:'ok'}));
      return result;
    } catch (error) {
      if(error.calendarSourceReadTemporary || error.calendarEventWriteBlocked || ['PENDING_EVENT_WRITE','BUSY'].includes(error.code))throw error;
      caught = error; failure = calendarApiFailure_(error); error.calendarFailure = failure;
      let pause;
      if (failure.reason === 'RATE_LIMIT' || failure.manualReview) pause = calendarProviderPause_(failure, operation, error);
      console.log(JSON.stringify(Object.assign({type:'CALENDAR_API',operation:operation,target:target,eventId:eventId||'',attempt:outerAttempt||attempt,elapsedMs:Date.now()-started,outcome:'error',nextAttemptEpochMs:pause ? pause.nextAttemptEpochMs : 0},failure)));
    } finally { if (reservation) calendarProviderEndWrite_(reservation); }
    if (caught.calendarDeferred || attempt === count || !failure.transient) throw caught;
    Utilities.sleep(Math.pow(2,attempt-1)*500+Math.floor(Math.random()*201));
  }
}
function calendarApiList_(calendarId,options,target,eventId) {
  let pageToken='',items=[];
  do {
    const page=calendarApiCall_('list',target,eventId,()=>Calendar.Events.list(calendarId,Object.assign({},options,pageToken?{pageToken:pageToken}:{})));
    if(!page || (page.items!==undefined && !Array.isArray(page.items)))throw new Error('Calendar returned an incomplete event list. No events were changed.');
    items=items.concat(page.items||[]);pageToken=String(page.nextPageToken||'');
  } while(pageToken);
  return items;
}
function calendarApiAccess_(calendarId,target,requireWrite) {
  calendarApiRequire_();
  if(!calendarId)throw mutationError_('CALENDAR_CONFIG','The '+calendarLabelForTarget_(target)+' Calendar ID is not configured.',503,true);
  const metadata=calendarApiCall_('calendar.get',target,'',()=>Calendar.Calendars.get(calendarId));
  const probe=calendarApiCall_('access',target,'',()=>Calendar.Events.list(calendarId,{maxResults:1,fields:'accessRole,summary,timeZone,items(id)'}));
  if(!metadata || !metadata.id || !probe || !probe.accessRole)throw new Error('Calendar access response was incomplete. No events were changed.');
  const writable=['writer','owner'].includes(probe.accessRole);
  if(requireWrite && !writable)throw mutationError_('CALENDAR_ACCESS_DENIED','The deployment account can read but cannot write the '+calendarLabelForTarget_(target)+' Calendar.',403,true);
  return {id:calendarId,summary:String(metadata.summary||probe.summary||''),timeZone:String(metadata.timeZone||probe.timeZone||''),accessRole:probe.accessRole,writable:writable};
}
function calendarApiOwnership_(target,ev) {
  const source=sha256_(SpreadsheetApp.getActiveSpreadsheet().getId());
  return {gsisSource:source,gsisTarget:target,gsisEvent:String(ev.EventID),gsisKey:sha256_(source+'|'+target+'|'+ev.EventID)};
}
function calendarApiOwned_(remote,target,ev) {
  const expected=calendarApiOwnership_(target,ev),actual=remote.extendedProperties && remote.extendedProperties.private || {};
  return Object.keys(expected).every(k=>actual[k]===expected[k]);
}
function calendarApiLinkKey_(target,calendarId,ev) {
  return 'calendar-link-'+sha256_(SpreadsheetApp.getActiveSpreadsheet().getId()+'|'+target+'|'+calendarId+'|'+ev.EventID);
}
/** The provider may commit before the ordinary Events link can be saved.
 * All pending-work decisions share this durable link truth, including hide,
 * delete and Parent disable. It reads typed link rows once per request. */
function calendarApiSourceLinked_(target,ev) {
  const prefix=target==='staff'?'Staff':'Parent';
  if(String(ev[prefix+'CalendarEventId']||'').trim())return true;
  if(!ev.EventID)return false;
  const io=rc18IO_();
  if(!io.calendarSourceLinks) {
    const log=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.MUTATIONS),found={staff:new Set(),parent:new Set()};
    if(log) {
      const col=rc18Headers_(log).indexOf('Action')+1;
      if(!col)throw new Error('MutationLog Action header is missing.');
      const selected=calendarNativeRead_(()=>log.getRange(rc18Column_(col)+'2:'+rc18Column_(col)).createTextFinder('calendarLink').matchEntireCell(true).useRegularExpression(false).matchCase(true).findAll().map(c=>c.getRow()));
      const ids={staff:calendarIdForTarget_('staff'),parent:calendarIdForTarget_('parent')};
      rc18Rows_(log,selected).forEach(row=>{
        const link=JSON.parse(row.object.ResultJSON||'null');
        if(!link || link.format!=='google-calendar-v3')throw new Error('Calendar link record format is invalid.');
        if(found[link.target] && link.calendarId===ids[link.target] && link.apiId && link.state!=='removed')found[link.target].add(String(link.sourceEventId));
      });
    }
    io.calendarSourceLinks=found;
  }
  return io.calendarSourceLinks[target].has(String(ev.EventID));
}
function calendarApiLink_(target,calendarId,ev) {
  const hit=mutationLookup_(mutationSheet_(),calendarApiLinkKey_(target,calendarId,ev));
  if(!hit)return null;
  const value=JSON.parse(hit.object.ResultJSON||'null');
  if(hit.object.Action!=='calendarLink' || !value || value.format!=='google-calendar-v3' || value.calendarId!==calendarId || value.target!==target || value.sourceEventId!==String(ev.EventID))throw new Error('Calendar link record is inconsistent. No event was changed.');
  return value;
}
function calendarApiSaveLink_(target,calendarId,ev,link) {
  return withRC17WriteLock_(() => {
    calendarSyncAssertClaim_();
    const key=calendarApiLinkKey_(target,calendarId,ev),log=mutationSheet_(),hit=mutationLookup_(log,key);
    mutationWrite_(log,{OperationID:key,UserAlias:'calendar-sync',Action:'calendarLink',PayloadHash:key,
      State:'CALENDAR_LINK',EventID:String(ev.EventID),ResultJSON:JSON.stringify(link),ErrorJSON:'',CreatedAt:hit?hit.object.CreatedAt:isoNow_(),UpdatedAt:isoNow_()});
    rc18IO_().calendarSourceLinks=null;
    return link;
  });
}
function calendarApiNewLink_(target,calendarId,ev,patch) {
  return Object.assign({format:'google-calendar-v3',calendarId:calendarId,target:target,sourceEventId:String(ev.EventID),apiId:'',legacyICalUID:'',iCalUID:'',generation:0,state:'reserved',verifiedLegacy:false},patch||{});
}
function calendarApiGet_(calendarId,id,target,ev,presence) {
  try {
    const value=calendarApiCall_('get',target,ev.EventID,()=>Calendar.Events.get(calendarId,id));
    if(!value || value.id!==id)throw new Error('Calendar returned an unexpected event identity. No event was changed.');
    if(value.status==='cancelled') {if(presence)presence.removed=true;return null;}
    return value;
  } catch(err) {
    const code=calendarApiFailure_(err).status;
    if(code===404 || code===410){if(presence && code===410)presence.removed=true;return null;}
    throw err;
  }
}
function calendarApiAssertLink_(remote,link,target,ev) {
  if(remote.recurringEventId || (remote.recurrence && remote.recurrence.length))throw new Error('Recurring Calendar links require review. No event was changed.');
  if(remote.eventType && remote.eventType!=='default')throw new Error('Special Calendar event types require review. No event was changed.');
  if(!calendarApiOwned_(remote,target,ev) && !(link.verifiedLegacy && remote.id===link.apiId && remote.iCalUID===link.legacyICalUID))throw new Error('Calendar event ownership does not match this source. No event was changed.');
}
function calendarApiResolve_(calendarId,target,ev,legacyId) {
  let link=calendarApiLink_(target,calendarId,ev),remote=null;
  if(link) {
    const presence={};
    remote=link.apiId?calendarApiGet_(calendarId,link.apiId,target,ev,presence):null;
    if(remote)calendarApiAssertLink_(remote,link,target,ev);
    else if(link.state==='linked' || presence.removed) {
      calendarApiAccess_(calendarId,target,true);
      link=calendarApiSaveLink_(target,calendarId,ev,Object.assign({},link,{state:'removed'}));
    }
    return {link:link,remote:remote};
  }
  const ownership=calendarApiOwnership_(target,ev);
  const options=legacyId?{iCalUID:legacyId,showDeleted:true,maxResults:250}:
    {privateExtendedProperty:['gsisKey='+ownership.gsisKey],showDeleted:false,maxResults:250};
  const matches=calendarApiList_(calendarId,options,target,ev.EventID);
  // Recurrence shares iCalUID across instances. Never adopt an arbitrary match.
  if(matches.length>1 || matches.some(x=>x.recurringEventId || (x.recurrence && x.recurrence.length)))throw new Error('Calendar link matches multiple or recurring events. Review the link before syncing.');
  const found=matches[0];
  if(found && found.status!=='cancelled') {
    if(!found.id || (legacyId && found.iCalUID!==legacyId) || (!legacyId && !calendarApiOwned_(found,target,ev)))throw new Error('Calendar link lookup returned an unexpected identity.');
    remote=calendarApiGet_(calendarId,found.id,target,ev);
    if(!remote)throw new Error('Calendar event changed during link verification. Retry Sync.');
    link=calendarApiNewLink_(target,calendarId,ev,{apiId:remote.id,legacyICalUID:legacyId||'',iCalUID:remote.iCalUID||'',state:'linked',verifiedLegacy:!!legacyId});
    calendarApiAssertLink_(remote,link,target,ev);
    calendarApiSaveLink_(target,calendarId,ev,link);
  } else if(legacyId) {
    // A successful exact iCalUID query plus write access establishes absence.
    // We never send an iCalUID to Events.get or guess an API ID from its suffix.
    calendarApiAccess_(calendarId,target,true);
    link=calendarApiNewLink_(target,calendarId,ev,{legacyICalUID:legacyId,state:'removed'});
    calendarApiSaveLink_(target,calendarId,ev,link);
  }
  return {link:link,remote:remote};
}
function calendarApiReserve_(calendarId,target,ev,prior) {
  const generation=prior?Number(prior.generation||0)+1:0;
  const link=calendarApiNewLink_(target,calendarId,ev,Object.assign({},prior||{}, {generation:generation,state:'reserved',verifiedLegacy:false,iCalUID:'',
    apiId:'gsis'+sha256_(calendarApiLinkKey_(target,calendarId,ev)+'|'+generation)}));
  return calendarApiSaveLink_(target,calendarId,ev,link);
}
function calendarApiFields_(spec) {
  const fields={summary:spec.title,description:spec.description||'',location:spec.location||''};
  if(spec.eventType==='TIMED') {
    fields.start={dateTime:spec.startDate+'T'+spec.startTime+':00+08:00',timeZone:CALV2.TZ};
    fields.end={dateTime:(spec.endDate||spec.startDate)+'T'+spec.endTime+':00+08:00',timeZone:CALV2.TZ};
  } else {
    fields.start={date:spec.startDate};
    fields.end={date:Utilities.formatDate(addDays_(sgDate_(spec.endDate||spec.startDate),1),CALV2.TZ,'yyyy-MM-dd')};
  }
  return fields;
}
function calendarApiSameFields_(remote,spec) {
  const want=calendarApiFields_(spec);
  if(['summary','description','location'].some(k=>String(remote[k]||'')!==String(want[k]||'')))return false;
  return ['start','end'].every(k=>want[k].date?remote[k] && remote[k].date===want[k].date:
    remote[k] && remote[k].dateTime && Date.parse(remote[k].dateTime)===Date.parse(want[k].dateTime));
}
function calendarApiBody_(remote,spec,target,ev) {
  // Copy writable unrelated fields only; Calendar server-owned fields are not update input.
  const body={},keys=['attendees','reminders','recurrence','colorId','transparency','visibility','anyoneCanAddSelf','guestsCanInviteOthers','guestsCanModify','guestsCanSeeOtherGuests','attachments','conferenceData','source','status','extendedProperties','eventLabelId','sequence'];
  keys.forEach(k=>{if(remote && remote[k]!==undefined)body[k]=JSON.parse(JSON.stringify(remote[k]));});
  Object.assign(body,calendarApiFields_(spec));
  body.extendedProperties=body.extendedProperties||{};
  body.extendedProperties.private=Object.assign({},body.extendedProperties.private||{},calendarApiOwnership_(target,ev));
  return body;
}
function calendarApiInsert_(calendarId,target,ev,spec,link) {
  const body=Object.assign({id:link.apiId},calendarApiBody_(null,spec,target,ev));
  for(let attempt=1;attempt<=3;attempt++) {
    try {
      const remote=calendarApiCall_('insert',target,ev.EventID,()=>Calendar.Events.insert(body,calendarId),false,attempt,calendarId);
      if(!remote || remote.id!==link.apiId)throw new Error('Calendar create response was incomplete.');
      calendarApiAssertLink_(remote,link,target,ev);return remote;
    } catch(err) {
      const failure=calendarApiFailure_(err);
      if (err.calendarDeferred || err.calendarEventWriteBlocked || ['PENDING_EVENT_WRITE','BUSY'].includes(err.code)) throw err;
      // A timeout or duplicate ID may mean the create already committed.
      if(failure.status!==409 && !failure.transient && failure.status)throw err;
      const found=calendarApiGet_(calendarId,link.apiId,target,ev);
      if(found){calendarApiAssertLink_(found,link,target,ev);return found;}
      if(attempt===3 || failure.status===409)throw err;
      Utilities.sleep(Math.pow(2,attempt-1)*500+Math.floor(Math.random()*201));
    }
  }
}
function calendarApiUpdate_(calendarId,target,ev,spec,link,remote) {
  for(let attempt=1;attempt<=3;attempt++) {
    calendarApiAssertLink_(remote,link,target,ev);
    if(calendarApiSameFields_(remote,spec) && calendarApiOwned_(remote,target,ev))return {remote:remote,changed:false};
    if(!remote.etag)throw new Error('Calendar event has no ETag. Update stopped.');
    try {
      const options={conferenceDataVersion:1,supportsAttachments:true};
      if(remote.eventLabelId!==undefined)options.eventLabelVersion=1;
      const updated=calendarApiCall_('update',target,ev.EventID,()=>Calendar.Events.update(calendarApiBody_(remote,spec,target,ev),calendarId,remote.id,options,{'If-Match':remote.etag}),false,attempt,calendarId);
      if(!updated || updated.id!==remote.id || !calendarApiSameFields_(updated,spec))throw new Error('Calendar update was not confirmed. Retry Sync.');
      calendarApiAssertLink_(updated,link,target,ev);return {remote:updated,changed:true};
    } catch(err) {
      const failure=calendarApiFailure_(err);
      if (err.calendarDeferred) throw err;
      if(attempt===3 || (failure.status!==412 && !failure.transient && failure.status))throw err;
      remote=calendarApiGet_(calendarId,link.apiId,target,ev);
      if(!remote)throw new Error('Calendar event was removed during update. Retry Sync to confirm its state.');
    }
  }
}
function calendarApiRemove_(calendarId,target,ev,link,remote) {
  for(let attempt=1;attempt<=3;attempt++) {
    if(!remote)return;
    calendarApiAssertLink_(remote,link,target,ev);
    if(!remote.etag)throw new Error('Calendar event has no ETag. Removal stopped.');
    try {calendarApiCall_('remove',target,ev.EventID,()=>Calendar.Events.remove(calendarId,remote.id,{}, {'If-Match':remote.etag}),false,attempt,calendarId);return;}
    catch(err) {
      const failure=calendarApiFailure_(err);
      if (err.calendarDeferred) throw err;
      if(failure.status!==412 && failure.status!==404 && failure.status!==410 && !failure.transient)throw err;
      remote=calendarApiGet_(calendarId,link.apiId,target,ev);
      if(!remote){calendarApiAccess_(calendarId,target,true);return;}
      if(attempt===3)throw err;
    }
  }
}

function syncTarget_(calendar, target, ev, desired) {
  const calendarId=String(calendar.id||''),prefix=target==='staff'?'Staff':'Parent';
  calendarApiRequire_();
  if(!calendarId)throw new Error('Calendar API destination is missing.');
  const idField=prefix+'CalendarEventId',hashField=prefix+'SyncHash',stateField=prefix+'SyncState';
  const resolved=calendarApiResolve_(calendarId,target,ev,String(ev[idField]||'').trim());
  let link=resolved.link,remote=resolved.remote,action='none';
  if(!desired) {
    if(remote){calendarApiRemove_(calendarId,target,ev,link,remote);action='delete';}
    else if(link && link.state==='reserved')throw new Error('An earlier Calendar creation is not yet confirmed. Retry Sync to resolve it before removing its pending link.');
    if(link && link.state!=='removed')calendarApiSaveLink_(target,calendarId,ev,Object.assign({},link,{state:'removed'}));
    return {action:action,patch:{[idField]:'',[hashField]:'',[stateField]:'SYNCED'}};
  }
  const spec=target==='staff'?staffCalendarSpec_(ev):parentCalendarSpec_(ev);
  if(!remote) {
    calendarApiAccess_(calendarId,target,true);
    if(!link || link.state==='removed')link=calendarApiReserve_(calendarId,target,ev,link);
    remote=calendarApiInsert_(calendarId,target,ev,spec,link);action='create';
    // A recovered insert may already have been edited elsewhere. Confirm the
    // requested fields before the Sheet is allowed to say SYNCED.
    remote=calendarApiUpdate_(calendarId,target,ev,spec,link,remote).remote;
  } else {
    const updated=calendarApiUpdate_(calendarId,target,ev,spec,link,remote);
    remote=updated.remote;if(updated.changed)action='update';
  }
  if(!remote.iCalUID)throw new Error('Calendar did not return a verified iCalUID. Retry Sync.');
  if(link.state!=='linked' || link.iCalUID!==remote.iCalUID)calendarApiSaveLink_(target,calendarId,ev,Object.assign({},link,{state:'linked',iCalUID:remote.iCalUID}));
  return {action:action,patch:{[idField]:remote.iCalUID,[hashField]:sha256_(JSON.stringify(spec)),[stateField]:'SYNCED'}};
}

function staffCalendarSpec_(ev) {
  const description =
    String(ev.StaffDescription || '');

  const generatedStructure =
    description.indexOf(
      '[[GSPS_YEAR_STRUCTURE:'
    ) >= 0;

  return {
    // Generated term/vacation structure is intentionally shown without
    // [term]/[hol] in Google Calendar. The internal OwnerTag remains stored
    // on the Event for filtering, formatting and provenance.
    title:
      generatedStructure
        ? String(ev.StaffTitle || '')
        : '[' + ev.OwnerTag + '] ' + ev.StaffTitle,

    description:
      description,

    location:
      String(ev.Location || ''),

    eventType:
      String(ev.EventType || 'ALL_DAY'),

    startDate:
      dateText_(ev.StartDate),

    endDate:
      dateText_(
        ev.EndDate ||
        ev.StartDate
      ),

    startTime:
      timeText_(ev.StartTime),

    endTime:
      timeText_(ev.EndTime)
  };
}

function parentCalendarSpec_(ev) {
  // Parent representation is always all-day by design.
  return {
    title: String(ev.ParentTitle || ev.StaffTitle || ''),
    description: String(ev.ParentDescription || ''),
    location: '',
    eventType: dateText_(ev.EndDate || ev.StartDate) > dateText_(ev.StartDate) ? 'MULTI_DAY' : 'ALL_DAY',
    startDate: dateText_(ev.StartDate),
    endDate: dateText_(ev.EndDate || ev.StartDate),
    startTime: '',
    endTime: ''
  };
}

function createCalendarEvent_(calendar, spec) {
  const options = {};
  if (spec.description) options.description = spec.description;
  if (spec.location) options.location = spec.location;

  if (spec.eventType === 'TIMED') {
    return calendar.createEvent(
      spec.title,
      sgDateTime_(spec.startDate, spec.startTime),
      sgDateTime_(spec.endDate || spec.startDate, spec.endTime),
      options
    );
  }

  if (spec.eventType === 'MULTI_DAY') {
    return calendar.createAllDayEvent(
      spec.title,
      sgDate_(spec.startDate),
      addDays_(sgDate_(spec.endDate), 1),
      options
    );
  }

  return calendar.createAllDayEvent(spec.title, sgDate_(spec.startDate), options);
}

function updateCalendarEvent_(calEvent, spec) {
  let changed = false;

  let currentTitle = '';
  let currentDescription = '';
  let currentLocation = '';

  try {
    currentTitle =
      String(
        calEvent.getTitle() || ''
      );
  } catch (err) {}

  try {
    currentDescription =
      String(
        calEvent.getDescription() || ''
      );
  } catch (err) {}

  try {
    currentLocation =
      String(
        calEvent.getLocation() || ''
      );
  } catch (err) {}

  if (
    currentTitle !==
    String(spec.title || '')
  ) {
    runCalendarWriteWithRetry_(
      () =>
        calEvent.setTitle(
          spec.title
        )
    );
    changed = true;
  }

  if (
    currentDescription !==
    String(spec.description || '')
  ) {
    runCalendarWriteWithRetry_(
      () =>
        calEvent.setDescription(
          spec.description || ''
        )
    );
    changed = true;
  }

  if (
    currentLocation !==
    String(spec.location || '')
  ) {
    try {
      runCalendarWriteWithRetry_(
        () =>
          calEvent.setLocation(
            spec.location || ''
          )
      );
      changed = true;
    } catch (err) {
      // Preserve prior best-effort location semantics.
    }
  }

  const allDay =
    !!calEvent.isAllDayEvent();

  const currentStart =
    Utilities.formatDate(
      calEvent.getStartTime(),
      CALV2.TZ,
      allDay
        ? 'yyyy-MM-dd'
        : 'yyyy-MM-dd HH:mm'
    );

  const currentEnd =
    Utilities.formatDate(
      calEvent.getEndTime(),
      CALV2.TZ,
      allDay
        ? 'yyyy-MM-dd'
        : 'yyyy-MM-dd HH:mm'
    );

  if (spec.eventType === 'TIMED') {
    const wantedStart =
      String(spec.startDate) +
      ' ' +
      String(spec.startTime);

    const wantedEnd =
      String(spec.endDate || spec.startDate) +
      ' ' +
      String(spec.endTime);

    if (
      allDay ||
      currentStart !== wantedStart ||
      currentEnd !== wantedEnd
    ) {
      runCalendarWriteWithRetry_(
        () =>
          calEvent.setTime(
            sgDateTime_(
              spec.startDate,
              spec.startTime
            ),
            sgDateTime_(
              spec.endDate || spec.startDate,
              spec.endTime
            )
          )
      );
      changed = true;
    }

  } else if (spec.eventType === 'MULTI_DAY') {
    const wantedStart =
      String(spec.startDate);

    const wantedEndExclusive =
      Utilities.formatDate(
        addDays_(
          sgDate_(spec.endDate),
          1
        ),
        CALV2.TZ,
        'yyyy-MM-dd'
      );

    if (
      !allDay ||
      currentStart !== wantedStart ||
      currentEnd !== wantedEndExclusive
    ) {
      runCalendarWriteWithRetry_(
        () =>
          calEvent.setAllDayDates(
            sgDate_(spec.startDate),
            addDays_(
              sgDate_(spec.endDate),
              1
            )
          )
      );
      changed = true;
    }

  } else {
    const wantedStart =
      String(spec.startDate);

    const wantedEndExclusive =
      Utilities.formatDate(
        addDays_(
          sgDate_(spec.startDate),
          1
        ),
        CALV2.TZ,
        'yyyy-MM-dd'
      );

    if (
      !allDay ||
      currentStart !== wantedStart ||
      currentEnd !== wantedEndExclusive
    ) {
      runCalendarWriteWithRetry_(
        () =>
          calEvent.setAllDayDate(
            sgDate_(spec.startDate)
          )
      );
      changed = true;
    }
  }

  return {
    event:
      calEvent,
    changed:
      changed
  };
}

function runCalendarWriteWithRetry_(fn, target, calendarId) {
  return calendarApiCall_('legacy.write', target || 'staff', '', fn, false, 1, calendarId);
}

function markYearStaffDirty_(year,writeRequests) {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.EVENTS),requests=[];
  let count=0;rc18Projection_(sheet,['Year','StaffSyncState']).forEach(x=>{
    if(Number(x.object.Year)===Number(year)&&String(x.object.StaffSyncState)!=='PENDING_SYNC'){
      requests.push.apply(requests,rc18PatchRequests_(sheet,x.row,{StaffSyncState:'PENDING_SYNC'}));count++;
    }
  });(writeRequests || rc18MaintenanceWrites_)(requests);return count;
}

function calendarSyncAuditOnce_(id,actor,action,entityType,entityId,before,after,requestId){
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.AUDIT),beforeText=safeJson_(before),afterText=safeJson_(after);
  const existing=findRowByKey_(sheet,'AuditID',id);
  if(existing){const row=existing.object;if(row.UserAlias!==actor.userAlias||row.Action!==action||row.EntityType!==entityType||row.EntityID!==entityId||String(row.BeforeJSON||'')!==beforeText||String(row.AfterJSON||'')!==afterText)throw mutationError_('SYNC_HISTORY_CONFLICT','Calendar sync history differs from its saved checkpoint. Keep the checkpoint for administrator review.',409,true);return;}
  rc18Append_(sheet,[id,isoNow_(),actor.userAlias,action,entityType,entityId,beforeText,afterText,requestId||'']);
}
function calendarSyncHistory_(actor,session,requestId){
  const payload=JSON.stringify({errors:(session.counts||emptySyncCounts_()).errors,blockedEvents:session.blockedEvents||[]});
  if(payload.length<=20000)return null;
  const digest=sha256_(payload),parts=Math.ceil(payload.length/20000);
  for(let part=0;part<parts;part++){
    const data={syncRunId:session.syncRunId,part,parts,sha256:digest,data:payload.slice(part*20000,(part+1)*20000)};
    calendarSyncAuditOnce_('AUD-SYNCDETAIL-'+sha256_(session.syncRunId+'|'+digest+'|'+part),actor,'SYNC_DETAIL','SyncRun',session.syncRunId,null,data,requestId);
  }
  return {schema:1,sheet:'AuditLog',action:'SYNC_DETAIL',syncRunId:session.syncRunId,parts,sha256:digest};
}
function appendSyncLog_(runId, year, alias, counts, duration, history) {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.SYNC_LOG),details=JSON.stringify(history?{errorCount:counts.errors.length,history}:counts.errors);
  const existing=findRowByKey_(sheet,'SyncRunID',runId);
  if(existing){const row=existing.object,values={Year:year,UserAlias:alias,StaffCreates:counts.staffCreates,StaffUpdates:counts.staffUpdates,StaffDeletes:counts.staffDeletes,ParentCreates:counts.parentCreates,ParentUpdates:counts.parentUpdates,ParentDeletes:counts.parentDeletes,Errors:counts.errors.length,DetailsJSON:details};
    if(Object.keys(values).some(key=>String(row[key])!==String(values[key])))throw mutationError_('SYNC_HISTORY_CONFLICT','Calendar sync totals differ from the saved completion record. Keep the checkpoint for administrator review.',409,true);
    return;
  }
  rc18Append_(sheet,[
    runId, isoNow_(), year, alias,
    counts.staffCreates, counts.staffUpdates, counts.staffDeletes,
    counts.parentCreates, counts.parentUpdates, counts.parentDeletes,
    counts.errors.length, duration,
    '', '',
    details
  ]);
}






/* =========================
 * DAY NOTES
 * ========================= */

function apiSaveDayNote_(actor, payload, requestId) {
  const year = Number(payload.year);
  const date = dateText_(payload.date);
  const text = String(payload.text || '').trim();

  if (!Number.isInteger(year)) throw new Error('Year required.');
  if (!date) throw new Error('Date required.');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const years = tableObjects_(ss.getSheetByName(CALV2.SHEETS.YEARS));
  const yearRow = years.find(r => Number(r.Year) === year);
  if (!yearRow || String(yearRow.Status || '').toUpperCase() === 'ARCHIVED') {
    throw new Error('Year is missing or archived.');
  }

  const sheet = ss.getSheetByName(CALV2.SHEETS.DAY_NOTES);
  const matches=rc18Projection_(sheet,['Year','Date']).filter(x=>Number(x.object.Year)===year&&dateText_(x.object.Date)===date);
  if(matches.length>1)throw new Error('Duplicate planning notes for this date; no note was changed.');
  const hit=matches.length?rc18Rows_(sheet,[matches[0].row])[0]:null;
  const before = hit ? hit.object : null;

  if (!text) {
    if (hit) {
      rc18DeleteRow_(sheet,hit.row);
      appendAudit_(actor, 'DELETE_DAY_NOTE', 'DayNote', before.NoteID, before, null, requestId);
    }
    return { year: year, date: date, deleted: true, metadataRevision:'missing' };
  }

  const now = isoNow_();
  const obj = {
    NoteID: before ? before.NoteID : 'NOTE-' + Utilities.getUuid(),
    Year: year,
    Date: date,
    Text: text,
    CreatedAt: before ? before.CreatedAt : now,
    CreatedBy: before ? before.CreatedBy : actor.userAlias,
    UpdatedAt: now,
    UpdatedBy: actor.userAlias
  };

  upsertObject_(sheet, CALV2.HEADERS.DayNotes, 'NoteID', obj.NoteID, obj);
  appendAudit_(actor, before ? 'UPDATE_DAY_NOTE' : 'CREATE_DAY_NOTE', 'DayNote', obj.NoteID, before, obj, requestId);
  return {...serialise_(obj),metadataRevision:calendarMetadataRevision_(obj)};
}

function upsertMigratedDayNote_(year, date, text, alias, sourceRow) {
  const clean = String(text || '').trim();
  if (!clean) return;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.DAY_NOTES);
  const rows = tableObjectsWithRows_(sheet);
  const hit = rows.find(x => Number(x.object.Year) === Number(year) && dateText_(x.object.Date) === dateText_(date));
  const now = isoNow_();

  const importedText = clean;
  const obj = {
    NoteID: hit ? hit.object.NoteID : 'NOTE-' + Utilities.getUuid(),
    Year: year,
    Date: dateText_(date),
    Text: importedText,
    CreatedAt: hit ? hit.object.CreatedAt : now,
    CreatedBy: hit ? hit.object.CreatedBy : alias,
    UpdatedAt: now,
    UpdatedBy: alias
  };

  upsertObject_(sheet, CALV2.HEADERS.DayNotes, 'NoteID', obj.NoteID, obj);
}

/* =========================
 * LEGACY CoE MIGRATION
 * ========================= */

function apiLoadMigration_(actor, payload, requestId) {
  const started = Date.now();
  const year = Number(payload.year);
  if (!Number.isInteger(year)) throw new Error('Year required.');

  const rows = tableObjects_(
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.MIGRATION)
  )
    .filter(r => Number(r.SourceYear) === year)
    .sort((a, b) =>
      Number(a.SourceRow || 0) - Number(b.SourceRow || 0) ||
      String(a.SourceColumn || '').localeCompare(String(b.SourceColumn || ''))
    );

  return {
    year: year,
    migration: serialise_(rows),
    performance: { totalMs: Date.now() - started }
  };
}

function apiScanLegacyCoe_(actor, payload, requestId) {
  const lock = calendarWriteLock_();
  if (!lock.tryLock(10000)) {
    throw new Error('Another migration scan is already running. Please wait and try again.');
  }

  const scanStarted = Date.now();

  try {
    const year = Number(payload.year);
    if (!Number.isInteger(year)) throw new Error('Year required.');

    const sourceUrl = String(payload.spreadsheetUrl || setting_('LEGACY_COE_' + year + '_URL') || '').trim();
    const sheetName = String(payload.sheetName || setting_('LEGACY_COE_SHEET_NAME') || 'CoE').trim();
    if (!sourceUrl) throw new Error('Legacy spreadsheet URL is required.');

    const sourceSs = SpreadsheetApp.openByUrl(sourceUrl);
    const sourceSheet = sourceSs.getSheetByName(sheetName);
    if (!sourceSheet) throw new Error('Legacy sheet tab "' + sheetName + '" was not found.');

    const sourceMaxRows = sourceSheet.getMaxRows();
    const sourceMaxCols = sourceSheet.getMaxColumns();
    const readRows = Math.min(sourceMaxRows, 500);
    const readCols = Math.min(sourceMaxCols, 14);

    if (readRows < 2 || readCols < 14) {
      throw new Error(
        'Legacy CoE does not expose the expected A:N calendar grid. ' +
        'Grid=' + sourceMaxRows + 'x' + sourceMaxCols
      );
    }

    const values = sourceSheet.getRange(1, 1, readRows, readCols).getValues();
    validateLegacyCoeHeaders_(values[0]);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const migrationSheet = ss.getSheetByName(CALV2.SHEETS.MIGRATION);
    const dayNotesSheet = ss.getSheetByName(CALV2.SHEETS.DAY_NOTES);
    const structureSheet = ss.getSheetByName(CALV2.SHEETS.YEAR_STRUCTURE);

    const migrationHeaders = CALV2.HEADERS.MigrationReview;
    const dayNoteHeaders = CALV2.HEADERS.DayNotes;
    const structureHeaders = CALV2.HEADERS.YearStructure;

    const existingMigration = tableObjects_(migrationSheet);
    const committedRows = existingMigration.filter(r =>
      Number(r.SourceYear) === year && !!r.ResolvedEventID
    );
    const preservedMigrationRows = existingMigration.filter(r =>
      Number(r.SourceYear) !== year || !!r.ResolvedEventID
    );

    const committedKeys = new Set(
      committedRows.map(r => legacyMigrationKey_(r.SourceRow, r.SourceColumn, r.RawText))
    );

    const activeTags = tableObjects_(ss.getSheetByName(CALV2.SHEETS.TAGS))
      .filter(r => yes_(r.Active));
    const tagMap = {};
    activeTags.forEach(r => tagMap[String(r.Tag).toLowerCase()] = String(r.Tag));

    const laneByColumn = {
      F: { lane: 'day', shift: 'NONE' },
      G: { lane: 'assembly', shift: 'NONE' },
      H: { lane: 'ftt', shift: 'NONE' },
      I: { lane: 'cce_ftgp', shift: 'NONE' },
      J: { lane: 'in_curriculum', shift: 'NONE' },
      K: { lane: 'after_school', shift: 'PM_I' },
      L: { lane: 'after_school', shift: 'PM_II' },
      M: { lane: 'evening', shift: 'NONE' },
      N: { lane: 'assessments', shift: 'NONE' }
    };

    const candidates = [];
    const structureBuckets = {};
    const planningNotesByDate = {};

    const importStartKey = Utilities.formatDate(
      mondayOnOrBefore_(new Date(year, 0, 1, 12, 0, 0)),
      CALV2.TZ,
      'yyyy-MM-dd'
    );
    const importEndKey = Utilities.formatDate(
      sundayOnOrAfter_(new Date(year, 11, 31, 12, 0, 0)),
      CALV2.TZ,
      'yyyy-MM-dd'
    );

    for (let r = 1; r < values.length; r++) {
      const rowNumber = r + 1;
      const row = values[r];
      const date = row[0];
      if (!(date instanceof Date) || isNaN(date)) continue;

      const dateKey = Utilities.formatDate(date, CALV2.TZ, 'yyyy-MM-dd');
      if (dateKey < importStartKey || dateKey > importEndKey) continue;

      const term = String(row[1] == null ? '' : row[1]).trim();
      const week = String(row[2] == null ? '' : row[2]).trim();
      if (term && week !== '') {
        const label = 'T' + term + 'W' + week;
        if (!structureBuckets[label]) {
          structureBuckets[label] = { term: term, week: week, dates: [] };
        }
        structureBuckets[label].dates.push(dateKey);
      }

      const planningNote = String(row[4] == null ? '' : row[4])
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim();

      if (planningNote) {
        planningNotesByDate[dateKey] = planningNote;
      }

      for (let c = 5; c <= 13; c++) {
        const column = columnLetter_(c + 1);
        const mapping = laneByColumn[column];
        if (!mapping) continue;

        const cell = String(row[c] == null ? '' : row[c])
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .trim();

        if (!cell) continue;

        const parsed = splitLegacyCellIntoEvents_(cell);
        parsed.forEach(item => {
          const key = legacyMigrationKey_(rowNumber, column, item.rawText);
          if (committedKeys.has(key)) return;

          const tags = item.leadingTags;
          let suggestedTag = '';
          let confidence = 'LOW';
          let status = 'REVIEW';
          let notes = '';

          if (tags.length === 1 && tagMap[tags[0].toLowerCase()]) {
            suggestedTag = tagMap[tags[0].toLowerCase()];
            confidence = 'HIGH';
            status = 'READY';
          } else if (tags.length === 0) {
            notes = 'No leading glossary tag found.';
          } else if (tags.length > 1) {
            notes = 'Multiple leading tags found; choose one compulsory owner tag.';
          } else {
            notes = 'Leading tag is not active in the v2 glossary.';
          }

          candidates.push({
            sourceRow: rowNumber,
            date: dateKey,
            column: column,
            rawText: item.rawText,
            title: item.title,
            lane: mapping.lane,
            shift: mapping.shift,
            ownerTag: suggestedTag,
            confidence: confidence,
            status: status,
            notes: notes
          });
        });
      }
    }

    const merged = mergeLegacyAfterSchoolBoth_(candidates);
    const now = isoNow_();

    const newMigrationObjects = merged.map(c => ({
      MigrationID: 'MIG-' + Utilities.getUuid(),
      SourceYear: year,
      SourceRow: c.sourceRow,
      SourceDate: c.date,
      SourceColumn: c.column,
      RawText: c.rawText,
      SuggestedTitle: c.title,
      SuggestedLaneID: c.lane,
      SuggestedShiftSpan: c.shift,
      SuggestedOwnerTag: c.ownerTag,
      Confidence: c.confidence,
      Status: c.status,
      ResolvedEventID: '',
      Notes: c.notes,
      CreatedAt: now,
      ResolvedAt: '',
      ResolvedBy: ''
    }));

    // Rebuild MigrationReview in ONE batch. Previous versions deleted hundreds
    // of rows one-by-one and could time out halfway through, leaving a partial table.
    rewriteTableData_(
      migrationSheet,
      migrationHeaders,
      preservedMigrationRows.concat(newMigrationObjects)
    );

    // Update DayNotes in memory and rewrite once.
    const existingDayNotes = tableObjects_(dayNotesSheet);
    const dayNoteByKey = {};
    existingDayNotes.forEach(r => {
      dayNoteByKey[Number(r.Year) + '|' + dateText_(r.Date)] = r;
    });

    Object.keys(planningNotesByDate).forEach(dateKey => {
      const key = year + '|' + dateKey;
      const before = dayNoteByKey[key];
      dayNoteByKey[key] = {
        NoteID: before ? before.NoteID : 'NOTE-' + Utilities.getUuid(),
        Year: year,
        Date: dateKey,
        Text: planningNotesByDate[dateKey],
        CreatedAt: before ? before.CreatedAt : now,
        CreatedBy: before ? before.CreatedBy : actor.userAlias,
        UpdatedAt: now,
        UpdatedBy: actor.userAlias
      };
    });

    rewriteTableData_(
      dayNotesSheet,
      dayNoteHeaders,
      Object.keys(dayNoteByKey).map(k => dayNoteByKey[k])
    );

    // Replace only this year's TERM_WEEK structures, again in one batch.
    const existingStructures = tableObjects_(structureSheet);
    const preservedStructures = existingStructures.filter(r =>
      !(Number(r.Year) === year &&
        String(r.Kind || '').toUpperCase() === 'TERM_WEEK' &&
        !r.DeletedAt)
    );

    const newStructures = Object.keys(structureBuckets)
      .sort()
      .map(label => {
        const b = structureBuckets[label];
        const dates = b.dates.slice().sort();
        return {
          StructureID: 'STR-' + Utilities.getUuid(),
          Year: year,
          Kind: 'TERM_WEEK',
          Label: label,
          Term: b.term,
          Week: b.week,
          StartDate: dates[0],
          EndDate: dates[dates.length - 1],
          IsVacation: 'No',
          SourceURL: sourceUrl,
          Notes: 'Imported from legacy CoE term/week columns.',
          CreatedAt: now,
          CreatedBy: actor.userAlias,
          UpdatedAt: now,
          UpdatedBy: actor.userAlias,
          DeletedAt: ''
        };
      });

    rewriteTableData_(
      structureSheet,
      structureHeaders,
      preservedStructures.concat(newStructures)
    );

    setSetting_('LEGACY_COE_' + year + '_URL', sourceUrl, 'Legacy CoE source used for migration.');
    setSetting_('LEGACY_COE_SHEET_NAME', sheetName, 'Legacy source tab name.');

    const summary = migrationSummary_(year);
    summary.sourceRead = {
      rowsRead: values.length,
      sourceMaxRows: sourceMaxRows,
      sourceReportedLastRow: sourceSheet.getLastRow(),
      eventCandidatesBuilt: merged.length,
      planningNotesImported: Object.keys(planningNotesByDate).length,
      termWeekBuckets: Object.keys(structureBuckets).length,
      scanDurationMs: Date.now() - scanStarted
    };

    appendAudit_(actor, 'SCAN_LEGACY_COE', 'Migration', String(year), null, summary, requestId);
    SpreadsheetApp.flush();
    return summary;
  } finally {
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}

function rewriteTableData_(sheet,headers,objects) {
  // Compatibility name only: reconcile by stable key, never clear/rebuild a table.
  // An administrative caller supplies the complete desired table. Unchanged
  // records keep their cells, formatting, extra columns and physical positions.
  const key=headers[0],existing=tableObjectsWithRows_(sheet),byId={},desired=new Set();
  existing.forEach(hit=>{const id=String(hit.object[key]||'');
    if(!id || byId[id])throw new Error('Missing/duplicate '+key+'; reconciliation stopped.');byId[id]=hit;});
  (objects||[]).forEach(obj=>{const id=String(obj[key]||'');
    if(!id || desired.has(id))throw new Error('Missing/duplicate desired '+key+'; reconciliation stopped.');desired.add(id);});
  rc18Atomic_(function(){
    (objects||[]).forEach(obj=>rc18SaveObject_(sheet,headers,byId[String(obj[key]) ]||null,obj));
    existing.filter(x=>!desired.has(String(x.object[key]))).sort((a,b)=>b.row-a.row)
      .forEach(x=>rc18DeleteRow_(sheet,x.row));
  });
}

function apiSaveMigrationReview_(actor, payload, requestId) {
  const id = String(payload.migrationId || '').trim();
  if (!id) throw new Error('migrationId is required.');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.MIGRATION);
  const hit = findRowByKey_(sheet, 'MigrationID', id);
  if (!hit) throw new Error('Migration row not found.');
  if (hit.object.ResolvedEventID) throw new Error('This migration row is already committed.');

  const before = hit.object;
  const title = String(payload.SuggestedTitle || '').trim();
  const lane = String(payload.SuggestedLaneID || '').trim();
  const shift = String(payload.SuggestedShiftSpan || 'NONE').trim().toUpperCase();
  const tag = String(payload.SuggestedOwnerTag || '').trim();
  if (!title || !lane || !tag) throw new Error('Title, lane and owner tag are required.');

  validateMigrationSelection_(lane, shift, tag);

  const patch = {
    SuggestedTitle: title,
    SuggestedLaneID: lane,
    SuggestedShiftSpan: shift,
    SuggestedOwnerTag: tag,
    Confidence: 'HUMAN',
    Status: 'READY',
    Notes: String(payload.Notes || before.Notes || ''),
    ResolvedAt: isoNow_(),
    ResolvedBy: actor.userAlias
  };
  updateRowPatch_(sheet, hit.row, patch);
  appendAudit_(actor, 'RESOLVE_MIGRATION_ROW', 'Migration', id, before, Object.assign({}, before, patch), requestId);
  return Object.assign({}, before, patch);
}

function apiCommitMigration_(actor, payload, requestId) {
  const year = Number(payload.year);
  if (!Number.isInteger(year)) throw new Error('Year required.');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CALV2.SHEETS.MIGRATION);
  const rows = tableObjectsWithRows_(sheet).filter(x =>
    Number(x.object.SourceYear) === year &&
    String(x.object.Status || '').toUpperCase() === 'READY' &&
    !x.object.ResolvedEventID
  );

  let committed = 0;
  const errors = [];

  rows.forEach(x => {
    try {
      const m = x.object;
      validateMigrationSelection_(m.SuggestedLaneID, m.SuggestedShiftSpan, m.SuggestedOwnerTag);
      const event = validateEvent_({
        Year: year,
        Status: 'HIDDEN',
        LaneID: m.SuggestedLaneID,
        ShiftSpan: m.SuggestedShiftSpan,
        OwnerTag: m.SuggestedOwnerTag,
        StaffTitle: m.SuggestedTitle,
        StaffDescription: 'Migrated from legacy CoE row ' + m.SourceRow + ', column ' + m.SourceColumn + '.',
        Location: '',
        EventType: 'ALL_DAY',
        StartDate: dateText_(m.SourceDate),
        EndDate: dateText_(m.SourceDate),
        StartTime: '', EndTime: '',
        ParentEnabled: 'No', ParentTitle: '', ParentDescription: ''
      });

      const created = apiSaveEvent_(actor, { event: event }, requestId);
      updateRowPatch_(sheet, x.row, {
        Status: 'COMMITTED',
        ResolvedEventID: created.EventID,
        ResolvedAt: isoNow_(),
        ResolvedBy: actor.userAlias
      });
      committed++;
    } catch (err) {
      errors.push({ migrationId: x.object.MigrationID, error: String(err && err.message ? err.message : err) });
    }
  });

  const summary = migrationSummary_(year);
  summary.committedThisRun = committed;
  summary.errors = errors;
  appendAudit_(actor, 'COMMIT_MIGRATION', 'Migration', String(year), null, summary, requestId);
  return summary;
}

function validateLegacyCoeHeaders_(header) {
  const expected = {
    0: 'Date', 1: 'Term', 2: 'Week', 3: 'Day', 4: 'Planning Notes'
  };
  Object.keys(expected).forEach(i => {
    const actual = String(header[Number(i)] || '').trim();
    if (actual !== expected[i]) throw new Error('Legacy CoE header mismatch at column ' + columnLetter_(Number(i)+1) + ': expected "' + expected[i] + '", found "' + actual + '".');
  });
}

function splitLegacyCellIntoEvents_(cell) {
  const lines = String(cell).split('\n').map(s => s.trim()).filter(Boolean);
  const groups = [];
  let current = null;

  lines.forEach(line => {
    const leading = extractLeadingTags_(line);
    const startsTagged = leading.tags.length > 0;

    if (!current) {
      current = { lines: [line] };
    } else if (startsTagged) {
      groups.push(current);
      current = { lines: [line] };
    } else {
      // Untagged line is treated as continuation to avoid splitting wrapped titles.
      current.lines.push(line);
    }
  });
  if (current) groups.push(current);

  return groups.map(g => {
    const rawText = g.lines.join('\n').trim();
    const first = extractLeadingTags_(g.lines[0]);
    let firstTitle = first.rest;
    const title = [firstTitle].concat(g.lines.slice(1)).join(' ').replace(/\s+/g, ' ').trim();
    return { rawText: rawText, leadingTags: first.tags, title: title || rawText.replace(/\s+/g, ' ').trim() };
  });
}

function extractLeadingTags_(text) {
  let s = String(text || '').trim();
  const tags = [];
  while (true) {
    const m = s.match(/^\[([^\]]+)\]\s*/);
    if (!m) break;
    tags.push(String(m[1]).trim());
    s = s.slice(m[0].length).trim();
  }
  return { tags: tags, rest: s };
}

function mergeLegacyAfterSchoolBoth_(items) {
  const out = [];
  const used = new Set();
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const a = items[i];
    if (a.lane === 'after_school' && (a.shift === 'PM_I' || a.shift === 'PM_II')) {
      const opposite = a.shift === 'PM_I' ? 'PM_II' : 'PM_I';
      const j = items.findIndex((b, idx) => idx > i && !used.has(idx) &&
        b.sourceRow === a.sourceRow && b.date === a.date && b.lane === a.lane && b.shift === opposite &&
        normaliseLegacyText_(b.rawText) === normaliseLegacyText_(a.rawText));
      if (j >= 0) {
        const merged = Object.assign({}, a, { shift: 'BOTH', column: 'K+L' });
        out.push(merged);
        used.add(i); used.add(j);
        continue;
      }
    }
    out.push(a); used.add(i);
  }
  return out;
}

function upsertLegacyYearStructure_(year, buckets, alias) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.YEAR_STRUCTURE);
  const existing = tableObjectsWithRows_(sheet).filter(x => Number(x.object.Year) === year && String(x.object.Kind || '').toUpperCase() === 'TERM_WEEK' && !x.object.DeletedAt);
  existing.sort((a,b) => b.row-a.row).forEach(x => sheet.deleteRow(x.row));

  Object.keys(buckets).sort().forEach(label => {
    const b = buckets[label];
    const dates = b.dates.slice().sort();
    sheet.appendRow([
      'STR-' + Utilities.getUuid(), year, 'TERM_WEEK', label, b.term, b.week,
      dates[0], dates[dates.length-1], 'No', setting_('LEGACY_COE_' + year + '_URL'),
      'Imported from legacy CoE term/week columns.', isoNow_(), alias, isoNow_(), alias, ''
    ]);
  });
}

function validateMigrationSelection_(laneId, shiftSpan, tag) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lane = tableObjects_(ss.getSheetByName(CALV2.SHEETS.LANES)).find(r => String(r.LaneID) === String(laneId) && yes_(r.Active));
  if (!lane) throw new Error('Selected lane is not active.');
  const tagRow = tableObjects_(ss.getSheetByName(CALV2.SHEETS.TAGS)).find(r => String(r.Tag).toLowerCase() === String(tag).toLowerCase() && yes_(r.Active));
  if (!tagRow) throw new Error('Selected glossary tag is not active.');
  if (yes_(lane.SupportsShift) && !['PM_I','PM_II','BOTH'].includes(String(shiftSpan || '').toUpperCase())) throw new Error('After School requires a valid shift.');
}

function migrationSummary_(year) {
  const rows = tableObjects_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.MIGRATION)).filter(r => Number(r.SourceYear) === year);
  return {
    year: year,
    total: rows.length,
    ready: rows.filter(r => String(r.Status || '').toUpperCase() === 'READY' && !r.ResolvedEventID).length,
    review: rows.filter(r => String(r.Status || '').toUpperCase() === 'REVIEW' && !r.ResolvedEventID).length,
    committed: rows.filter(r => !!r.ResolvedEventID).length
  };
}

function legacyMigrationKey_(sourceRow, sourceColumn, rawText) {
  return String(sourceRow) + '|' + String(sourceColumn) + '|' + normaliseLegacyText_(rawText);
}
function normaliseLegacyText_(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}
function columnLetter_(columnNumber) {
  let n = Number(columnNumber), s = '';
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

function apiSavePdf_(actor, payload, requestId) {
  const year = Number(payload.year);
  if (!Number.isInteger(year)) throw new Error('Year required.');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const yearRow = tableObjects_(ss.getSheetByName(CALV2.SHEETS.YEARS))
    .find(r => Number(r.Year) === year);

  if (!yearRow || String(yearRow.Status || '').toUpperCase() === 'ARCHIVED') {
    throw new Error('Year is missing or archived.');
  }

  const pdfRunId = 'PDFRUN-' + Utilities.getUuid();
  const result = generateYearPdf_(year, actor.userAlias, pdfRunId, yearRow);

  if (yes_(yearRow.ReleasedToTeachers)) {
    shareYearPdfsWithDomain_(year);
  }

  appendAudit_(actor, 'SAVE_YEAR_PDF', 'Year', String(year), null, result, requestId);
  return result;
}

/* =========================
 * PDF EXPORT
 * ========================= */

function generateYearPdf_(year, userAlias, syncRunId, yearRow) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const events = tableObjects_(ss.getSheetByName(CALV2.SHEETS.EVENTS))
    .filter(r => Number(r.Year) === Number(year) && !r.DeletedAt);
  const lanes = tableObjects_(ss.getSheetByName(CALV2.SHEETS.LANES)).filter(r => yes_(r.Active));
  const structures = tableObjects_(ss.getSheetByName(CALV2.SHEETS.YEAR_STRUCTURE))
    .filter(r => Number(r.Year) === Number(year) && !r.DeletedAt);
  const laneMap = {};
  lanes.forEach(l => laneMap[String(l.LaneID)] = l);

  const start = mondayOnOrBefore_(new Date(year, 0, 1, 12, 0, 0));
  const end = sundayOnOrAfter_(new Date(year, 11, 31, 12, 0, 0));

  let html = '<!doctype html><html><head><meta charset="UTF-8"><style>' +
    '@page{size:A4 landscape;margin:8mm}' +
    'body{font-family:Arial,sans-serif;font-size:8pt;color:#111}' +
    'h1{font-size:16pt;margin:0 0 5mm}' +
    'table{border-collapse:collapse;width:100%;table-layout:fixed}' +
    'th,td{border:1px solid #777;vertical-align:top;padding:2.5mm}' +
    'th{background:#eee;font-size:8pt}.wk{width:10mm;background:#ddd;font-weight:bold;text-align:center}' +
    '.day{min-height:22mm}.weekend{background:#e5e5e5}.ramadan{background:#eadff5}' +
    '.date{font-weight:bold;margin-bottom:2mm}.ev{margin:0 0 1.2mm;line-height:1.2}' +
    '.psle{background:#d9ead3;color:#245b35}.hidden{opacity:.55}' +
    '</style></head><body><h1>GSPS Calendar ' + htmlEscape_(year) + '</h1>' +
    '<table><thead><tr><th class="wk"></th>' +
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => '<th>' + d + '</th>').join('') +
    '</tr></thead><tbody>';

  for (let weekStart = new Date(start); weekStart <= end; weekStart = addDays_(weekStart, 7)) {
    const weekLabel = structureLabelForDate_(structures, formatDateKey_(weekStart));
    html += '<tr><td class="wk">' + htmlEscape_(weekLabel) + '</td>';
    for (let offset = 0; offset < 7; offset++) {
      const d = addDays_(weekStart, offset);
      const key = formatDateKey_(d);
      const classes = [];
      if (offset >= 5) classes.push('weekend');
      if (dateKeyInRange_(key, yearRow.RamadanStart, yearRow.RamadanEnd)) classes.push('ramadan');

      const dayEvents = events.filter(ev => eventCoversDate_(ev, key));
      html += '<td class="day ' + classes.join(' ') + '"><div class="date">' +
        Utilities.formatDate(d, CALV2.TZ, 'd MMM') + '</div>';

      dayEvents.forEach(ev => {
        const lane = laneMap[String(ev.LaneID)] || {};
        let laneText = String(lane.Header || ev.LaneID || '');
        const shift = String(ev.ShiftSpan || '').toUpperCase();
        if (yes_(lane.SupportsShift)) {
          if (shift === 'PM_I') laneText += ' ' + (lane.ShiftALabel || 'PM(i)');
          else if (shift === 'PM_II') laneText += ' ' + (lane.ShiftBLabel || 'PM(ii)');
          else if (shift === 'BOTH') laneText += ' ' + (lane.ShiftALabel || 'PM(i)') + '+' + (lane.ShiftBLabel || 'PM(ii)');
        }
        const cls = ['ev',
          String(ev.OwnerTag || '').toUpperCase() === 'PSLE' ? 'psle' : '',
          String(ev.Status || '').toUpperCase() === 'HIDDEN' ? 'hidden' : ''
        ].filter(Boolean).join(' ');
        html += '<div class="' + cls + '">' + htmlEscape_(laneText) + ': [' +
          htmlEscape_(ev.OwnerTag) + '] ' + htmlEscape_(ev.StaffTitle) + '</div>';
      });
      html += '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table></body></html>';

  const stamp = Utilities.formatDate(new Date(), CALV2.TZ, "yyyy MMM dd HHmm");
  const fileName = year + ' GSPS Calendar (' + stamp + ').pdf';
  const pdfBlob = Utilities.newBlob(html, 'text/html', 'calendar.html').getAs(MimeType.PDF).setName(fileName);
  const folder = DriveApp.getFolderById(setting_('SHARED_DRIVE_FOLDER_ID'));
  const file = folder.createFile(pdfBlob);

  let domainShared = false;
  let note = 'Private while year is unreleased.';
  if (yes_(yearRow.ReleasedToTeachers)) {
    const result = tryShareDomain_(file);
    domainShared = result.ok;
    note = result.note;
  }

  const directUrl = 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(file.getId());
  const pdfId = 'PDF-' + Utilities.getUuid();
  rc18Append_(ss.getSheetByName(CALV2.SHEETS.PDF_LOG),[
    pdfId, year, isoNow_(), userAlias, fileName, file.getId(), directUrl,
    domainShared ? 'Yes' : 'No', syncRunId, note
  ]);

  return {
    pdfId: pdfId,
    fileId: file.getId(),
    fileName: fileName,
    directDownloadUrl: directUrl,
    domainShared: domainShared,
    note: note
  };
}

function shareYearPdfsWithDomain_(year) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.PDF_LOG);
  const rows = tableObjectsWithRows_(sheet).filter(x => Number(x.object.Year) === Number(year));
  rows.forEach(x => {
    const fileId = String(x.object.FileId || '').trim();
    if (!fileId) return;
    try {
      const result = tryShareDomain_(DriveApp.getFileById(fileId));
      updateRowPatch_(sheet, x.row, { DomainShared: result.ok ? 'Yes' : 'No', Notes: result.note });
    } catch (err) {
      updateRowPatch_(sheet, x.row, {
        DomainShared: 'No',
        Notes: 'Sharing failed: ' + String(err && err.message ? err.message : err)
      });
    }
  });
}

function tryShareDomain_(file) {
  try {
    file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    return { ok: true, note: 'Accessible to signed-in gsps.edu.sg users with link.' };
  } catch (err) {
    return { ok: false, note: 'Domain sharing could not be applied automatically: ' +
      String(err && err.message ? err.message : err) };
  }
}

function mondayOnOrBefore_(date) {
  const d = new Date(date.getTime());
  const day = d.getDay();
  return addDays_(d, day === 0 ? -6 : 1 - day);
}
function sundayOnOrAfter_(date) {
  const d = new Date(date.getTime());
  const day = d.getDay();
  return addDays_(d, day === 0 ? 0 : 7 - day);
}
function formatDateKey_(date) {
  return Utilities.formatDate(date, CALV2.TZ, 'yyyy-MM-dd');
}
function eventCoversDate_(ev, key) {
  const start = dateText_(ev.StartDate);
  const end = dateText_(ev.EndDate || ev.StartDate);
  return !!start && key >= start && key <= (end || start);
}
function structureLabelForDate_(structures, key) {
  const hit = structures.find(s =>
    String(s.Kind || '').toUpperCase() === 'TERM_WEEK' && dateKeyInRange_(key, s.StartDate, s.EndDate)
  );
  return hit ? String(hit.Label || (hit.Term && hit.Week ? hit.Term + hit.Week : hit.Week || '')) : '';
}
function dateKeyInRange_(key, start, end) {
  const s = dateText_(start), e = dateText_(end);
  return !!s && !!e && key >= s && key <= e;
}
function htmlEscape_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* =========================
 * AUDIT
 * ========================= */

function appendAudit_(actor, action, entityType, entityId, before, after, requestId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.AUDIT);
  rc18Append_(sheet,[
    'AUD-' + Utilities.getUuid(),
    isoNow_(),
    actor.userAlias,
    action,
    entityType,
    entityId,
    safeJson_(before),
    safeJson_(after),
    requestId || ''
  ]);
}


/* =========================
 * TABLE HELPERS
 * ========================= */

function tableObjects_(sheet) {
  return tableObjectsWithRows_(sheet).map(x => x.object);
}

function tableObjectsWithRows_(sheet) { return rc18ReadTable_(sheet); }

function findRowByKey_(sheet,key,value) { return rc18Find_(sheet,key,value,false); }

function findRowByKeyCaseInsensitive_(sheet,key,value) { return rc18Find_(sheet,key,value,true); }

function upsertObject_(sheet,headers,keyHeader,keyValue,obj) {
  const hit=findRowByKey_(sheet,keyHeader,keyValue);
  rc18SaveObject_(sheet,headers,hit,obj);
}

function updateRowPatch_(sheet,rowNumber,patch) {
  // A true field patch: no read/modify/rewrite of unrelated row contents.
  rc18Patch_(sheet,rowNumber,patch);
}

function yearsCached_() {
  const cache = rc17SafeCache_();
  const key = 'calv2:years:rc19';
  const cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (err) {}
  }

  const rows = serialise_(tableObjects_(
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.YEARS)
  ));

  try { cache.put(key, JSON.stringify(rows), CALV2.CACHE_SECONDS); } catch (err) {}
  return rows;
}

function settingsMapCached_() {
  const cache = rc17SafeCache_();
  const key = 'calv2:settings:rc19';
  const cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (err) {}
  }

  const rows = tableObjects_(
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.SETTINGS)
  );
  const map = {};
  rows.forEach(r => {
    const k = String(r.Key || '').trim();
    if (k) map[k] = String(r.Value == null ? '' : r.Value);
  });

  try { cache.put(key, JSON.stringify(map), CALV2.CACHE_SECONDS); } catch (err) {}
  return map;
}

function configCached_() {
  const cache = rc17SafeCache_();

  const key =
    'calv2:config:rc708';

  const cached =
    cache.get(key);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (err) {}
  }

  rc18PrefetchTables_([CALV2.SHEETS.LANES,CALV2.SHEETS.LANE_SCHEDULE,CALV2.SHEETS.TAGS,CALV2.SHEETS.COLOUR_RULES]);

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const scheduleSheet =
    ss.getSheetByName(
      CALV2.SHEETS.LANE_SCHEDULE
    );

  const scheduleRows =
    scheduleSheet
      ? tableObjects_(scheduleSheet)
      : [];

  const byLane = {};

  scheduleRows.forEach(row => {
    const id =
      String(row.LaneID || '');

    if (!id) return;

    if (!byLane[id]) {
      byLane[id] = [];
    }
    byLane[id].push(row);
  });

  Object.keys(byLane).forEach(id => {
    byLane[id].sort(
      (a, b) =>
        LANE_WEEKDAY_CODES_.indexOf(
          String(a.Weekday || '')
        ) -
        LANE_WEEKDAY_CODES_.indexOf(
          String(b.Weekday || '')
        )
    );
  });

  const allLanes =
    tableObjects_(
      ss.getSheetByName(
        CALV2.SHEETS.LANES
      )
    )
      .sort(
        (a, b) =>
          Number(a.SortOrder || 0) -
          Number(b.SortOrder || 0)
      )
      .map(lane =>
        Object.assign(
          {},
          lane,
          {
            Schedule:
              byLane[String(lane.LaneID)] ||
              legacyLaneScheduleRows_(lane)
          }
        )
      );

  const allTags=tableObjects_(ss.getSheetByName(CALV2.SHEETS.TAGS)).sort((a,b)=>String(a.Tag||'').localeCompare(String(b.Tag||''),'en',{sensitivity:'base'}));
  const obj =
    serialise_({
      lanes: allLanes.filter(r=>yes_(r.Active)),

      tags:allTags.filter(r=>yes_(r.Active)),
      allTags:allTags,
      allLanes:allLanes,

      colourRules:
        tableObjects_(
          ss.getSheetByName(
            CALV2.SHEETS.COLOUR_RULES
          )
        )
          .sort(
            (a, b) =>
              Number(b.Priority || 0) -
                Number(a.Priority || 0) ||
              String(a.RuleID || '')
                .localeCompare(
                  String(b.RuleID || '')
                )
          )
    });

  try {
    cache.put(
      key,
      JSON.stringify(obj),
      CALV2.CACHE_SECONDS
    );
  } catch (err) {}

  return obj;
}

function userRowsCached_() {
  const cache = rc17SafeCache_();
  const key = 'calv2:users:rc19';
  const cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (err) {}
  }

  const rows = serialise_(tableObjects_(
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.USERS)
  ));

  try { cache.put(key, JSON.stringify(rows), CALV2.CACHE_SECONDS); } catch (err) {}
  return rows;
}

function invalidateCalendarCaches_() {
  const io=rc18IO_();
  if(io.queue){io.invalidateCaches=true;return;}
  if(io.writeCache)io.writeCache={};
  try {
    CacheService.getScriptCache().removeAll([
      'calv2:settings:rc19',
      'calv2:config:v2',
      'calv2:config:rc19',
      'calv2:config:rc708',
      'calv2:users:rc19',
      'calv2:years:rc19'
    ]);
  } catch (err) {}
}

function setting_(key) {
  const map = settingsMapCached_();
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : '';
}

function setSetting_(key, value, description) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.SETTINGS);
  const hit = findRowByKey_(sheet, 'Key', key);
  if (hit) {
    updateRowPatch_(sheet, hit.row, {
      Value: value,
      Description: description || hit.object.Description || ''
    });
  } else {
    rc18Append_(sheet,[key, value, description || '']);
  }
  invalidateCalendarCaches_();
}


/* =========================
 * DATE / IDENTITY / JSON HELPERS
 * ========================= */

function installerAlias_() {
  // Manual setup normally exposes ActiveUser, but some Apps Script execution
  // contexts return it blank. For setup/upgrade purposes the effective user is
  // a safe fallback because that is the account actually executing the script.
  const activeEmail =
    String(Session.getActiveUser().getEmail() || '')
      .trim()
      .toLowerCase();

  const effectiveEmail =
    String(Session.getEffectiveUser().getEmail() || '')
      .trim()
      .toLowerCase();

  const email =
    activeEmail || effectiveEmail;

  return email.endsWith('@' + CALV2.DOMAIN)
    ? normAlias_(email.split('@')[0])
    : '';
}

function normAlias_(value) {
  return String(value || '').trim().toLowerCase().replace(/@gsps\.edu\.sg$/i, '');
}

function aliasToDisplayName_(alias) {
  return normAlias_(alias)
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function yes_(value) {
  return ['yes', 'y', 'true', '1'].includes(String(value || '').trim().toLowerCase());
}

function dateText_(value) {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value)) return Utilities.formatDate(value, CALV2.TZ, 'yyyy-MM-dd');
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d)) return '';
  return Utilities.formatDate(d, CALV2.TZ, 'yyyy-MM-dd');
}

function timeText_(value) {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value)) return Utilities.formatDate(value, CALV2.TZ, 'HH:mm');
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return String(m[1]).padStart(2, '0') + ':' + m[2];
}

function sgDate_(dateText) {
  const p = String(dateText).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0);
}

function sgDateTime_(dateText, timeText) {
  const d = String(dateText).split('-').map(Number);
  const t = String(timeText).split(':').map(Number);
  return new Date(d[0], d[1] - 1, d[2], t[0], t[1], 0, 0);
}

function addDays_(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function isoNow_() {
  return Utilities.formatDate(new Date(), CALV2.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function safeJson_(value) {
  try { return value == null ? '' : JSON.stringify(serialise_(value)); }
  catch (err) { return JSON.stringify({ error: 'Could not serialise audit payload.' }); }
}

function serialise_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, CALV2.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  if (Array.isArray(value)) return value.map(serialise_);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(k => out[k] = serialise_(value[k]));
    return out;
  }
  return value;
}

function sha256_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

function constantTimeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/* Shared by the browser and Apps Script. Keep these copies byte-identical.
 * No network, storage, timezone-sensitive parsing, or UI dependencies. */
function gspsCalendarCoreFactory() {
  'use strict';
  const EDIT_FIELDS = Object.freeze([
    'EventID','Year','Status','LaneID','ShiftSpan','OwnerTag','StaffTitle',
    'StaffDescription','Location','VenueID','EventType','StartDate','EndDate','StartTime',
    'EndTime','ParentEnabled','ParentTitle','ParentDescription'
  ]);
  const date = value => String(value || '').slice(0, 10);
  function dateNumber(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return NaN;
    const [y,m,d] = key.split('-').map(Number);
    const n = Date.UTC(y, m - 1, d);
    return new Date(n).toISOString().slice(0,10) === key ? n / 86400000 : NaN;
  }
  function shifted(key, days) {
    const n = dateNumber(key);
    if (!Number.isFinite(n)) throw new Error('A valid calendar date is required.');
    return new Date((n + days) * 86400000).toISOString().slice(0,10);
  }
  function parseDateSearch(raw, selectedYear) {
    const text = String(raw || '').trim();
    if (!text) return {status:'valid', kind:'all', year:Number(selectedYear)};
    const parts = text.split('/');
    let d, m, y = Number(selectedYear), kind;
    if (parts.length === 2 && /^\d{1,2}$/.test(parts[0]) && /^\d{4}$/.test(parts[1])) {
      m = Number(parts[0]); y = Number(parts[1]); kind = 'month';
    } else if (parts.length === 2 && parts.every(p => /^\d{1,2}$/.test(p))) {
      d = Number(parts[0]); m = Number(parts[1]); kind = 'day';
    } else if (parts.length === 3 && /^\d{1,2}$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1]) && /^\d{4}$/.test(parts[2])) {
      d = Number(parts[0]); m = Number(parts[1]); y = Number(parts[2]); kind = 'day';
    } else {
      return {status:'invalid', message:'Use DD/MM, MM/YYYY or DD/MM/YYYY. The last valid view is retained.'};
    }
    const key = `${y}-${String(m).padStart(2,'0')}-${String(d || 1).padStart(2,'0')}`;
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || (kind === 'day' && (d < 1 || d > 31)) || !Number.isFinite(dateNumber(key))) {
      return {status:'invalid', message:'Enter a real calendar date. The last valid view is retained.'};
    }
    return {status:'valid', kind, day:d, month:m, year:y, external:y !== Number(selectedYear)};
  }
  function dateMatches(key, filter) {
    if (!filter || filter.kind === 'all') return true;
    return Number(key.slice(0,4)) === filter.year && Number(key.slice(5,7)) === filter.month &&
      (filter.kind === 'month' || Number(key.slice(8,10)) === filter.day);
  }
  function editableCopy(source) {
    const out = {};
    EDIT_FIELDS.forEach(k => { out[k] = source[k] == null ? '' : source[k]; });
    return out;
  }
  function relocate(source, options) {
    const start = date(source.StartDate), end = date(source.EndDate || start);
    const anchor = date(options.anchorDate || start), target = date(options.targetDate);
    const year = Number(options.year), lane = options.lane;
    if (!source.EventID || !lane || !lane.LaneID) throw new Error('Source event or destination lane is missing.');
    if (Number(source.Year) !== year) throw new Error('Move / Copy must stay within the selected year.');
    const nums = [start,end,anchor,target].map(dateNumber);
    if (nums.some(n => !Number.isFinite(n)) || nums[1] < nums[0] || nums[2] < nums[0] || nums[2] > nums[1]) {
      throw new Error('The source date range or grabbed day is invalid. Refresh before trying again.');
    }
    const delta = nums[3] - nums[2];
    const newStart = shifted(start, delta), newEnd = shifted(end, delta);
    if ([newStart,newEnd].some(k => Number(k.slice(0,4)) !== year)) {
      throw new Error(`The complete event must remain within ${year}. Its date span will not be shortened.`);
    }
    const out = editableCopy(source);
    out.StartDate = newStart; out.EndDate = newEnd; out.LaneID = String(lane.LaneID);
    const supportsShift = /^(yes|true|1)$/i.test(String(lane.SupportsShift || ''));
    const shift = supportsShift ? String(options.shift || 'PM_I').toUpperCase() : 'NONE';
    if (supportsShift && !['PM_I','PM_II','BOTH'].includes(shift)) throw new Error('Choose a valid destination shift.');
    const sameLane = String(source.LaneID) === out.LaneID && String(source.ShiftSpan || 'NONE') === shift;
    out.ShiftSpan = shift;
    // The date span and the time mode are independent: TIMED may span days.
    // MULTI_DAY remains the existing representation for multi-day ALL-DAY events.
    const timedDestination = String(lane.DefaultEventType || 'ALL_DAY').toUpperCase() === 'TIMED';
    const preserveTimes = sameLane && String(source.EventType) === 'TIMED';
    if (preserveTimes || timedDestination) {
      out.EventType = 'TIMED';
      out.StartTime = preserveTimes ? String(source.StartTime || '') : String(options.defaultStart || '');
      out.EndTime = preserveTimes ? String(source.EndTime || '') : String(options.defaultEnd || '');
      if (![out.StartTime,out.EndTime].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || ((newStart === newEnd || !preserveTimes) && out.EndTime <= out.StartTime)) {
        throw new Error('The destination lane needs valid default start/end times under Columns.');
      }
    } else {
      out.EventType = newStart === newEnd ? 'ALL_DAY' : 'MULTI_DAY';
      out.StartTime = ''; out.EndTime = '';
    }
    if (options.copy) {
      out.EventID = '';
      out.Status = 'HIDDEN'; // Preserve RC1.5 staff-side copy/release semantics.
      out.ParentEnabled = 'No';
    }
    return out;
  }
  return Object.freeze({EDIT_FIELDS, dateNumber, shifted, parseDateSearch, dateMatches, editableCopy, relocate});
}

const RC17_CORE = gspsCalendarCoreFactory();
const RC17_MUTATION_HEADERS = [
  'OperationID','UserAlias','Action','PayloadHash','State','EventID',
  'ResultJSON','ErrorJSON','CreatedAt','UpdatedAt'
];

// A request can wait behind a role change. Recheck within every existing write
// lock, including maintenance locks, before any mutation or receipt replay.
var calendarRequestAuthority_=null;
function calendarWriteLock_(){
 const lock=LockService.getScriptLock(),io=rc18IO_();
 let acquiredAt=0;
 const release=()=>{
  if(acquiredAt)io.metrics.lockHoldMs=Number(io.metrics.lockHoldMs||0)+Date.now()-acquiredAt;
  acquiredAt=0;io.writeCache=null;lock.releaseLock();
 };
 return {
  tryLock(ms){
   const started=Date.now(),granted=lock.tryLock(ms);
   io.metrics.lockWaitMs=Number(io.metrics.lockWaitMs||0)+Date.now()-started;
   if(!granted)return false;
   acquiredAt=Date.now();
   // A delayed reader can refill shared caches after a writer invalidates them.
   // Revalidate from a fresh request-local snapshot while this lock is held.
   io.writeCache={};io.tables={};io.lookups={};io.nativeRanges={};io.calendarSourceLinks=null;
   try{
    if(calendarRequestAuthority_){
     const roles=rolesFor_(calendarRequestAuthority_.alias,true);
     if(calendarRequestAuthority_.parent)requireParentEditor_(roles);else requireAdmin_(roles);
    }
    return true;
   }catch(error){release();throw error;}
  },
  releaseLock(){release();}
 };
}

function withRC17WriteLock_(work, allowPendingPublication, sheetReadOnly) {
  const io=rc18IO_();
  if(io.lockDepth)return work();
  const lock=calendarWriteLock_();
  if(!lock.tryLock(8000))throw mutationError_('BUSY','Another calendar write is running. Nothing was submitted; try again.',409,true);
  io.lockDepth++;
  try{
    if(!allowPendingPublication)rc18AssertNoPendingEvent_('','','','publication');
    return work();
  }
  finally {io.lockDepth--;try{if(!sheetReadOnly)SpreadsheetApp.flush();}finally{lock.releaseLock();}}
}

// Only audited Sheet-read/Properties-only scopes use this helper: sync status,
// source fences, and provider lease/pause coordination. They retain every lock,
// fresh role check and cache reset. Source settlement, durable Calendar links,
// claim paths that can finalise, and normal mutations keep the default flush.
function withCalendarCoordinationLock_(work) {
  return withRC17WriteLock_(work,true,true);
}

function mutationError_(code, message, status, definite, current) {
  const err = new Error(message);
  err.code = code; err.status = status || 400; err.definite = definite === true;
  if (current) err.current = eventForClient_(current);
  return err;
}

function eventForClient_(event) {
  if (!event) return null;
  const e = serialise_(event);
  ['staff','parent'].forEach(target=>{
    const prefix=target==='staff'?'Staff':'Parent',linked=calendarApiSourceLinked_(target,event);
    e['_'+target+'CalendarLinked']=linked;
    if(linked && !String(event[prefix+'CalendarEventId']||'').trim())e[prefix+'SyncState']='PENDING_SYNC';
  });
  ['StartDate','EndDate'].forEach(k => { e[k] = dateText_(event[k]); });
  ['StartTime','EndTime'].forEach(k => { e[k] = timeText_(event[k]); });
  const content = RC17_CORE.EDIT_FIELDS.map(k => [k,e[k] == null ? '' : e[k]]);
  content.push(['DeletedAt',String(e.DeletedAt || '')],['LastMutationID',String(e.LastMutationID || '')]);
  e._revision = sha256_(JSON.stringify(content));
  // Delta revision also covers provider states/links; edit concurrency keeps
  // its existing content-only revision contract.
  delete e._changeRevision;
  e._changeRevision = sha256_(JSON.stringify(Object.keys(e).sort().map(key=>[key,e[key]])));
  return e;
}

function mutationSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = ss.getSheetByName('MutationLog');
  const events = ss.getSheetByName(CALV2.SHEETS.EVENTS);
  if (!log || !events || !rc18Headers_(events).includes('LastMutationID') || !rc18Headers_(events).includes('VenueID')) {
    throw mutationError_('UPGRADE_REQUIRED','Run upgradeCalendarToRC19() once in Apps Script before using Calendar writes.',409,true);
  }
  return log;
}

function mutationLookup_(sheet,operationId) { return rc18Find_(sheet,'OperationID',String(operationId),false); }

function mutationWrite_(sheet,record) {
  const hit=mutationLookup_(sheet,String(record.OperationID));
  record.UpdatedAt=isoNow_();
  rc18SaveObject_(sheet,RC17_MUTATION_HEADERS,hit,record);
}

function mutationIdentity_(actor, action, payload) {
  const operationId = String(payload.operationId || '');
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(operationId)) {
    throw mutationError_('OPERATION_ID_REQUIRED','A valid write operation ID is required. Reload the Calendar app.',400,true);
  }
  const business = Object.assign({},payload);
  delete business.operationId;
  return {operationId:operationId, hash:sha256_(JSON.stringify({action:action,payload:business}))};
}

function mutationCheckIdentity_(record, actor, action, hash) {
  if (String(record.UserAlias) !== actor.userAlias || String(record.Action) !== action || String(record.PayloadHash) !== hash) {
    throw mutationError_('OPERATION_MISMATCH','Write operation identity does not match this request.',409,true);
  }
}

function mutationOutcome_(record) {
  if (record.State === 'COMMITTED') {
    if(record.Action==='publishVersion')return {state:'SAVED',result:JSON.parse(record.ResultJSON||'{}')};
    if (record.Action === 'deleteEvent') return {state:'SAVED',result:{eventId:record.EventID,deleted:true}};
    const hit = findRowByKey_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.EVENTS),'EventID',record.EventID);
    if (!hit) return {state:'UNKNOWN',message:'A committed event is no longer present. Check the archive or contact an Admin.'};
    return {state:'SAVED',result:eventForClient_(hit.object)};
  }
  if (record.State === 'REJECTED' || record.State === 'FAILED') return {state:'REJECTED',error:JSON.parse(record.ErrorJSON || '{}')};
  if (record.State === 'CANCELLED') return {state:'NOT_SAVED'};
  return {state:'UNKNOWN'};
}

/** Reconstruct a receipt when the event row committed but the response/log write was lost.
 * Must run under the same lock, before any later mutation replaces its marker. */
function repairMutationReceipt_(sheet, event) {
  if (!event || !event.LastMutationID) return;
  const hit = mutationLookup_(sheet,String(event.LastMutationID));
  if (hit && ['PREPARED','DISPATCHED'].includes(hit.object.State) && String(hit.object.EventID)===String(event.EventID) && ['saveEvent','relocateEvent','deleteEvent','saveParentSide'].includes(hit.object.Action)) {
    mutationWrite_(sheet,Object.assign({},hit.object,{State:'COMMITTED'}));
    SpreadsheetApp.flush();
  }
}

function rejectMutation_(sheet, record, err) {
  record.State = 'REJECTED';
  record.ErrorJSON = JSON.stringify({code:err.code || 'VALIDATION', message:err.message, status:err.status || 400, current:err.current || null});
  mutationWrite_(sheet,record);
}

function unwrapMutationOutcome_(outcome) {
  if (outcome.state === 'SAVED') return outcome.result;
  if (outcome.state === 'REJECTED') {
    const e = outcome.error || {};
    throw mutationError_(e.code || 'REJECTED',e.message || 'Write rejected.',e.status || 400,true,e.current);
  }
  if (outcome.state === 'NOT_SAVED') throw mutationError_('NOT_SAVED','This request was confirmed not saved. Retry with a new operation ID.',409,true);
  throw mutationError_('UNKNOWN','Save status unknown. Check the operation status before retrying.',503,false);
}

function runEventMutation_(actor, action, payload, requestId) {
  return withRC17WriteLock_(function () {
    const log = mutationSheet_();
    const identity = mutationIdentity_(actor,action,payload);
    const prior = mutationLookup_(log,identity.operationId);
    if (prior) {
      mutationCheckIdentity_(prior.object,actor,action,identity.hash);
      return unwrapMutationOutcome_(resolveMutationRecord_(log,prior.object));
    }
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.EVENTS);
    const inputId = String(action === 'saveEvent' ? (payload.event || {}).EventID || '' : payload.eventId || '');
    const isNew = action === 'saveEvent' && !inputId;
    const isCopy = action === 'relocateEvent' && payload.mode === 'copy';
    const resultId = isNew || isCopy ? 'EVT-' + Utilities.getUuid() : inputId;
    const record = {OperationID:identity.operationId,UserAlias:actor.userAlias,Action:action,
      PayloadHash:identity.hash,State:'PREPARED',EventID:resultId,CreatedAt:isoNow_(),UpdatedAt:isoNow_()};
    // Validate under the lock before making a durable dispatch intent.
    let prepared;
    try {
      const hit = inputId ? findRowByKey_(sheet,'EventID',inputId) : null;
      const before = hit ? hit.object : null;
      repairMutationReceipt_(log,before);
      rc18AssertNoPendingEvent_(inputId,identity.operationId,before ? before.Year : (payload.event || {}).Year);
      if (!isNew) {
        if (!before || before.DeletedAt) throw mutationError_('EVENT_GONE','This event was deleted or no longer exists.',409,true,before);
        if (!payload.expectedRevision || String(payload.expectedRevision) !== eventForClient_(before)._revision) {
          throw mutationError_('CONFLICT','A colleague changed this event. Your proposal has been retained; review the latest version before saving again.',409,true,before);
        }
        const yr = yearsCached_().find(y => Number(y.Year) === Number(before.Year));
        if (!yr || String(yr.Status).toUpperCase() === 'ARCHIVED') throw mutationError_('ARCHIVED','This year is archived and cannot be edited.',409,true);
      }
      const internal = Object.assign({},payload,{__operationId:identity.operationId});
      if (action === 'saveEvent') {
        internal.event = Object.assign({},payload.event,{EventID:resultId});
        // New and existing events use the unchanged RC1.5 visibility rules.
        if (isNew && !internal.event.Status) internal.event.Status = defaultEventVisibilityForYear_(internal.event.Year);
        validateEvent_(internal.event,before);
        prepared = () => apiSaveEvent_(actor,internal,requestId);
      } else if (action === 'relocateEvent') {
        if (!['move','copy'].includes(payload.mode)) throw new Error('Choose Move or Copy.');
        const lane = configCached_().lanes.find(l => String(l.LaneID) === String(payload.targetLaneId));
        if (!lane) throw new Error('Destination lane is not active.');
        const anchor = dateText_(payload.anchorDate || before.StartDate);
        const target = dateText_(payload.targetDate);
        const source = eventForClient_(before);
        const tentativeStart = RC17_CORE.shifted(source.StartDate,RC17_CORE.dateNumber(target)-RC17_CORE.dateNumber(anchor));
        const schedule = laneScheduleForDate_(lane,tentativeStart);
        const dropSchedule = laneScheduleForDate_(lane,target);
        if ((schedule && !yes_(schedule.Enabled)) || (dropSchedule && !yes_(dropSchedule.Enabled))) throw new Error('The destination lane is not available on the new start/grabbed date.');
        const shift = String(payload.targetShift || 'NONE');
        const timed = rc17DefaultTimes_(lane,schedule,shift);
        const relocated = RC17_CORE.relocate(source,{year:Number(payload.year),anchorDate:anchor,targetDate:target,
          lane:lane,shift:shift,copy:isCopy,defaultStart:timed.start,defaultEnd:timed.end});
        relocated.EventID = resultId;
        internal.event = relocated;
        validateEvent_(relocated,isCopy ? null : before);
        prepared = () => apiSaveEvent_(actor,internal,requestId);
      } else if (action === 'saveParentSide') {
        prepared = () => apiSaveParentSide_(actor,internal,requestId);
      } else if (action === 'deleteEvent') {
        prepared = () => apiDeleteEvent_(actor,internal,requestId);
      } else throw new Error('Unsupported event mutation.');
    } catch (err) {
      err.definite = true;
      rejectMutation_(log,record,err);
      throw err;
    }
    try {
      // Once DISPATCHED is durable, an absent event is NOT proof of failure:
      // Sheets may still be processing a request whose response was lost.
      record.State='DISPATCHED';
      mutationWrite_(log,record);
      const result=rc18Atomic_(function(){
        const value=prepared();
        record.State='COMMITTED';
        mutationWrite_(log,record);
        return value;
      });
      return action==='deleteEvent' ? result : eventForClient_(result);
    } catch(err) {
      rc18InvalidateIO_();
      try {
        const receipt=mutationLookup_(log,identity.operationId);
        if(receipt && receipt.object.State==='COMMITTED')return unwrapMutationOutcome_(mutationOutcome_(receipt.object));
      } catch(ignored) {console.error('Mutation outcome unresolved: '+identity.operationId);}
      throw mutationError_('UNKNOWN','Save status unknown. Checking is required before any retry.',503,false);
    }
  });
}

function rc17DefaultTimes_(lane, schedule, shift) {
  const row = schedule || lane;
  if (yes_(lane.SupportsShift)) return {
    start:timeText_(shift === 'PM_II' ? row.ShiftBDefaultStartTime : row.ShiftADefaultStartTime),
    end:timeText_(shift === 'PM_II' || shift === 'BOTH' ? row.ShiftBDefaultEndTime : row.ShiftADefaultEndTime)
  };
  return {start:timeText_(row.DefaultStartTime),end:timeText_(row.DefaultEndTime)};
}

const CALENDAR_STALE_DISPATCH_MS = 60*60*1000;
function staleMutationAge_(record){const created=Date.parse(record.CreatedAt);return Number.isFinite(created)?Math.max(0,Date.now()-created):null;}
function failStaleMutation_(log,record,current,actor){
  if(!rc18IO_().lockDepth)throw mutationError_('LOCK_REQUIRED','Receipt resolution requires the Calendar writer lock.',409,true);
  const label=current?.StaffTitle||record.EventID,when=String(record.CreatedAt||'');
  const error={code:'STALE_DISPATCH',message:'Your save on '+when+' to '+label+' did not apply. Please redo it.',status:409,current:current?eventForClient_(current):null};
  const next=Object.assign({},record,{State:'FAILED',ErrorJSON:JSON.stringify(error)});
  const audited=calendarBirthdayRows_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.AUDIT),'RequestID',record.OperationID).some(r=>r.object.Action==='STALE_DISPATCH'&&r.object.EntityID===record.OperationID);
  rc18Atomic_(()=>{if(!audited)appendAudit_(actor||{userAlias:record.UserAlias},'STALE_DISPATCH','Mutation',record.OperationID,{state:record.State,eventId:record.EventID,originalUser:record.UserAlias},{state:'FAILED',ageMs:staleMutationAge_(record)},record.OperationID);mutationWrite_(log,next);});
  return mutationOutcome_(next);
}
function resolvePublicationReceipt_(log,record,actor){
  const ss=SpreadsheetApp.getActiveSpreadsheet(),year=Number(String(record.EventID).slice(5)),hit=findRowByKey_(ss.getSheetByName(CALV2.SHEETS.YEARS),'Year',year);
  let evidence={};try{evidence=JSON.parse(record.ResultJSON||'{}');}catch(ignored){}
  if(evidence.dispatchRequestId){
    const audits=calendarBirthdayRows_(ss.getSheetByName(CALV2.SHEETS.AUDIT),'RequestID',evidence.dispatchRequestId).map(x=>x.object).filter(x=>x.Action==='PUBLISH_VERSION'&&String(x.EntityID)===String(year)&&x.UserAlias===record.UserAlias);
    const matches=audits.flatMap(row=>{let value;try{value=JSON.parse(row.AfterJSON);}catch(ignored){return [];}return value&&value.operationId===record.OperationID&&Number(value.year)===year&&Number.isFinite(value.published)&&yes_(value.ReleasedToTeachers)?[value]:[];});
    if(matches.length===1){const result=matches[0],next=Object.assign({},record,{State:'COMMITTED',ResultJSON:JSON.stringify(result)});mutationWrite_(log,next);return mutationOutcome_(next);}
  }
  const age=staleMutationAge_(record);if(age===null||age<CALENDAR_STALE_DISPATCH_MS)return mutationOutcome_(record);
  // An already-released year with a contemporaneous/later write is ambiguous.
  // A retained before-image proves non-application only when it still matches.
  const canonical=value=>calendarMetadataRevision_(value);
  const unchanged=evidence.beforeYear&&evidence.afterYear&&hit&&canonical(evidence.beforeYear)!==canonical(evidence.afterYear)&&canonical(hit.object)===canonical(evidence.beforeYear);
  const updated=hit?Date.parse(hit.object.UpdatedAt):NaN,created=Date.parse(record.CreatedAt);
  if(!hit||unchanged||!yes_(hit.object.ReleasedToTeachers)||Number.isFinite(updated)&&updated<created)return failStaleMutation_(log,record,null,actor);
  return mutationOutcome_(record);
}
function resolveMutationRecord_(log, record, actor) {
  if (!['PREPARED','DISPATCHED'].includes(record.State)) return mutationOutcome_(record);
  if(!rc18IO_().lockDepth)throw mutationError_('LOCK_REQUIRED','Receipt resolution requires the Calendar writer lock.',409,true);
  record=Object.assign({},record);
  if(String(record.EventID).startsWith('YEAR:'))return record.Action==='publishVersion'?resolvePublicationReceipt_(log,record,actor):mutationOutcome_(record);
  const hit = findRowByKey_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.EVENTS),'EventID',record.EventID);
  if (hit && String(hit.object.LastMutationID) === String(record.OperationID)) record.State = 'COMMITTED';
  else if (record.State === 'PREPARED') record.State = 'CANCELLED';
  else {const age=staleMutationAge_(record);if(age!==null&&age>=CALENDAR_STALE_DISPATCH_MS)return failStaleMutation_(log,record,hit?.object||null,actor);return mutationOutcome_(record);}
  mutationWrite_(log,record);SpreadsheetApp.flush();return mutationOutcome_(record);
}
function calendarFailedMutations_(actor,roles,year,events){
  if(!roles.isAdmin&&!roles.isParentPublisher)return [];
  const log=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.MUTATIONS);if(!log)return [];
  return calendarBirthdayRows_(log,'UserAlias',actor.userAlias).map(r=>r.object).filter(r=>r.State==='FAILED').flatMap(r=>{
    let error;try{error=JSON.parse(r.ErrorJSON||'{}');}catch(ignored){return [];}
    if(error.code!=='STALE_DISPATCH')return [];
    const current=events.find(e=>e.EventID===r.EventID),publication=r.EventID==='YEAR:'+year;
    if(!current&&!publication&&(String(r.EventID).startsWith('YEAR:')||error.current&&Number(error.current.Year)!==Number(year)))return [];
    return [{operationId:r.OperationID,message:error.message,event:r.EventID,createdAt:r.CreatedAt,current:current?eventForClient_(current):null}];
  }).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,20);
}
function apiMutationReceipts_(actor,payload){
  return withRC17WriteLock_(()=>{
    const log=mutationSheet_(),rows=tableObjects_(log).filter(r=>['PREPARED','DISPATCHED'].includes(r.State)),checked=[];
    if(payload.check===true){const id=String(payload.operationId||'');if(!id||!rows.some(r=>r.OperationID===id))throw mutationError_('RECEIPT_CHANGED','This receipt is no longer unresolved. Reload the list.',409,true);const outcome=resolveMutationRecord_(log,rows.find(r=>r.OperationID===id),actor);checked.push({operationId:id,...outcome});}
    const settled=new Set(checked.filter(r=>r.state!=='UNKNOWN').map(r=>r.operationId));
    return {checkedAt:isoNow_(),checked,receipts:rows.filter(r=>!settled.has(r.OperationID)).map(r=>({operationId:r.OperationID,state:r.State,ageMs:staleMutationAge_(r),event:r.EventID,user:r.UserAlias,createdAt:r.CreatedAt,action:r.Action}))};
  },true,payload.check!==true);
}

function apiEventMutationStatus_(actor, payload) {
  return withRC17WriteLock_(function () {
    const log = mutationSheet_();
    const action = String(payload.action || '');
    if (!['saveEvent','relocateEvent','deleteEvent','saveParentSide'].includes(action)) throw new Error('Unsupported status check.');
    const original = payload.payload || {};
    const identity = mutationIdentity_(actor,action,original);
    const hit = mutationLookup_(log,identity.operationId);
    if (hit) {
      mutationCheckIdentity_(hit.object,actor,action,identity.hash);
      return resolveMutationRecord_(log,hit.object);
    }
    // Fence a delayed request that has not reached Apps Script yet. It can no longer execute.
    // This is what makes NOT_SAVED authoritative rather than guessing from an absent receipt.
    const record = {OperationID:identity.operationId,UserAlias:actor.userAlias,Action:action,
      PayloadHash:identity.hash,State:'CANCELLED',EventID:'',CreatedAt:isoNow_(),UpdatedAt:isoNow_()};
    mutationWrite_(log,record); SpreadsheetApp.flush();
    return {state:'NOT_SAVED'};
  },true);
}

function rc17SafeCache_() {
  let cache; try { cache=CacheService.getScriptCache(); } catch (e) {}
  return {
    get:function(k){
      const local=rc18IO_().writeCache;
      if(local)return Object.prototype.hasOwnProperty.call(local,k)?local[k]:null;
      try{return cache ? cache.get(k) : null;}catch(e){return null;}
    },
    put:function(k,v,t){
      const local=rc18IO_().writeCache;
      if(local){local[k]=v;return;}
      try{if(cache)cache.put(k,v,t);}catch(e){}
    },
    removeAll:function(ks){
      const local=rc18IO_().writeCache;
      if(local)ks.forEach(k=>delete local[k]);
      try{if(cache)cache.removeAll(ks);}catch(e){}
    }
  };
}

/* =========================
 * SURGICAL SHEETS I/O
 * Native SpreadsheetApp transport for reads and writes.
 * Existing typed field plans are validated before their first native write.
 * Related patches to one event row share one range write with its mutation marker.
 * Cross-sheet batches are coordinated by the ScriptLock and receipt journal,
 * not a database transaction. An uncertain write is fenced and never replayed blindly.
 * No persistent row-number cache or alternate-transport mutation retries.
 * ========================= */
let RC18_IO_ = null;
var calendarNativeSourceReads_ = false;
var calendarNativeCommandReads_ = false;

function rc18ResetIO_() {
  RC18_IO_ = {headers:{}, lookups:{}, tables:{}, nativeRanges:{}, queue:null, lockDepth:0,
    metrics:{readRequests:0,writeRequests:0,readCells:0,writeCells:0,readRetries:0,
      nativeHeaderReads:0,nativeSourceReads:0,keySearches:0}};
  return RC18_IO_;
}
function rc18IO_() { return RC18_IO_ || rc18ResetIO_(); }
function rc18QuoteSheet_(name) { return "'" + String(name).replace(/'/g,"''") + "'"; }
function rc18Column_(n) {
  if (!Number.isInteger(n) || n < 1) throw new Error('Invalid column number.');
  let s=''; while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);} return s;
}
function rc18Headers_(sheet) {
  if (!sheet) throw new Error('Required backend sheet is missing.');
  const io=rc18IO_(),name=sheet.getName();
  if (!io.headers[name]) {
    const width=calendarNativeRead_(()=>sheet.getLastColumn());
    if (!width) throw new Error(name+' has no headers.');
    io.metrics.nativeHeaderReads++;
    const headers=calendarNativeRead_(()=>sheet.getRange(1,1,1,width).getDisplayValues()[0].map(String));
    const nonblank=headers.filter(Boolean);
    if (new Set(nonblank).size !== nonblank.length) throw new Error(name+' has duplicate headers.');
    io.headers[name]=headers;
  }
  return io.headers[name];
}
function rc18InvalidateIO_(name) {
  const io=rc18IO_();
  if (!name) {io.lookups={};io.tables={};io.nativeRanges={};return;}
  delete io.tables[name];
  Object.keys(io.nativeRanges).forEach(k=>{if(k.indexOf(rc18QuoteSheet_(name)+'!')===0)delete io.nativeRanges[k];});
  Object.keys(io.lookups).forEach(k=>{if(k.indexOf(name+'\n')===0)delete io.lookups[k];});
}
function rc18TransientReadError_(err) {
  return /\b(429|500|502|503|504)\b|rate.?limit|quota.*minute|temporar|backend.?error|service unavailable|timed? ?out/i.test(String(err && err.message || err));
}
function calendarNativeRead_(read){
  try{return read();}
  catch(error){if(calendarNativeSourceReads_&&(rc18TransientReadError_(error)||/too many times in a short time/i.test(String(error.message||error))))error.calendarSourceReadTemporary=true;throw error;}
}
function calendarNativeRanges_(ranges){
  const io=rc18IO_(),ss=SpreadsheetApp.getActiveSpreadsheet();
  return ranges.map(a1=>{
    if(Object.prototype.hasOwnProperty.call(io.nativeRanges,a1))return io.nativeRanges[a1];
    const match=/^'((?:[^']|'')+)'!([A-Z]+)(\d+):([A-Z]+)(\d*)$/.exec(a1);
    if(!match)throw new Error('Unsupported Calendar source range.');
    const sheet=ss.getSheetByName(match[1].replace(/''/g,"'"));if(!sheet)throw new Error('Required backend sheet is missing.');
    // Explicit rows come from a fresh TextFinder/claim. Read that exact range;
    // open-ended projections use current native last-row metadata.
    const column=text=>Array.from(text).reduce((n,c)=>n*26+c.charCodeAt(0)-64,0),start=Number(match[3]),end=Number(match[5])||calendarNativeRead_(()=>sheet.getLastRow()),left=column(match[2]),width=column(match[4])-left+1;
    let rows=[];
    if(end>=start){
      io.metrics.nativeSourceReads++;rows=calendarNativeRead_(()=>sheet.getRange(start,left,end-start+1,width).getValues());
    }
    io.metrics.readCells+=rows.reduce((n,row)=>n+row.length,0);
    io.nativeRanges[a1]=rows;return rows;
  });
}
function calendarSourceReadDeferred_(action,actor,payload,error){
  const deferred=mutationError_('SOURCE_READ_DEFERRED','Calendar source reads are temporarily limited. Retry after the saved delay.',429,true);
  deferred.retryAfterMs=60000;
  const lock=LockService.getScriptLock();
  if(lock.tryLock(500)){
    try{
      // A failed Users read is not proof of Admin authority. Recheck under
      // this lock before reading or changing any privileged session state.
      try{requireAdmin_(rolesFor_(actor.userAlias,true));}
      catch(authorityError){if(authorityError.calendarSourceReadTemporary)throw deferred;throw authorityError;}
      const session=readCalendarSyncSession_();
      const matches=session&&(action==='syncYearBatch'?session.syncRunId===String(payload.syncRunId||''):Number(session.year)===Number(payload.year)&&session.target===normaliseCalendarTarget_(payload.target||'staff'));
      if(matches){
        session.sourceReadThrottleCount=Math.min(8,Number(session.sourceReadThrottleCount||0)+1);
        session.pauseReason='SOURCE_READ_RATE_LIMIT';
        session.nextAttemptEpochMs=Math.max(Number(session.nextAttemptEpochMs||0),Number(session.claim&&session.claim.expiresAt||0),Date.now()+Math.min(900000,60000*Math.pow(2,session.sourceReadThrottleCount-1))+Math.floor(Math.random()*15001));
        writeCalendarSyncSession_(session);return calendarSyncProgress_(session);
      }
    }finally{lock.releaseLock();}
  }
  throw deferred;
}
function rc18ReadRanges_(ranges) {
  return ranges.length ? calendarNativeRanges_(ranges) : [];
}
function rc18Value_(header,value) {
  if(value===undefined || value===null) return '';
  const isDate=/^(StartDate|EndDate|Date|SourceDate|RamadanStart|RamadanEnd)$/.test(header);
  const isTime=/Time$/.test(header);
  const isStamp=/At$/.test(header) || header==='Timestamp';
  if(value instanceof Date) {
    if(isDate)return dateText_(value);
    if(isTime)return timeText_(value);
    return serialise_(value);
  }
  if(typeof value==='number' && Number.isFinite(value)) {
    // Sheets serials encode spreadsheet-local civil time, NOT a UTC instant.
    if(isDate || isStamp) {
      const d=new Date(Date.UTC(1899,11,30)+Math.round(value*86400000));
      if(isDate)return d.toISOString().slice(0,10);
      return d.toISOString().slice(0,19)+'+08:00';
    }
    if(isTime) {
      const minutes=((Math.round((value-Math.floor(value))*1440)%1440)+1440)%1440;
      return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
    }
  }
  return value;
}
function rc18Object_(headers,values) {
  const obj={};headers.forEach((h,c)=>{if(h)obj[h]=rc18Value_(h,values[c]);});return obj;
}
function rc18Groups_(numbers) {
  const sorted=Array.from(new Set(numbers)).sort((a,b)=>a-b),groups=[];
  sorted.forEach(n=>{
    if(!Number.isInteger(n)||n<2)throw new Error('Invalid data row.');
    const last=groups[groups.length-1];
    if(last && n===last[1]+1 && n-last[0]<1000) last[1]=n; else groups.push([n,n]);
  });return groups;
}
function rc18Rows_(sheet,numbers) {
  if(!numbers.length)return [];
  const headers=rc18Headers_(sheet),groups=rc18Groups_(numbers),name=rc18QuoteSheet_(sheet.getName());
  const ranges=groups.map(g=>name+'!A'+g[0]+':'+rc18Column_(headers.length)+g[1]);
  const blocks=rc18ReadRanges_(ranges),out=[];
  groups.forEach((g,i)=>{for(let row=g[0];row<=g[1];row++)out.push({row:row,object:rc18Object_(headers,blocks[i][row-g[0]]||[])});});
  return out;
}
function rc18Find_(sheet,key,value,insensitive) {
  if(!sheet)return null;
  const io=rc18IO_(),headers=rc18Headers_(sheet),col=headers.indexOf(key)+1;
  if(!col)throw new Error(sheet.getName()+' column missing: '+key);
  const wanted=insensitive?String(value||'').trim().toLowerCase():String(value);
  const cacheKey=sheet.getName()+'\n'+key+'\n'+(insensitive?'i:':'s:')+wanted;
  // Request-local memo is only used inside a coordinated write. Never a persistent locator.
  if(io.lockDepth && Object.prototype.hasOwnProperty.call(io.lookups,cacheKey))return io.lookups[cacheKey];
  let found=null;
  for(let attempt=0;attempt<2;attempt++) {
    io.metrics.keySearches++;
    const escaped=String(value||'').trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    // Find keys directly; no persisted row-number locator survives an edit.
    const cells=calendarNativeRead_(()=>sheet.getRange(rc18Column_(col)+'2:'+rc18Column_(col))
      .createTextFinder(insensitive?'^\\s*'+escaped+'\\s*$':String(value))
      .matchEntireCell(true).useRegularExpression(!!insensitive).matchCase(!insensitive).findAll());
    if(cells.length>1)throw new Error('Duplicate '+key+' in '+sheet.getName()+'. No row was chosen.');
    if(!cells.length)break;
    const hit=rc18Rows_(sheet,[cells[0].getRow()])[0];
    const actual=insensitive?String(hit.object[key]||'').trim().toLowerCase():String(hit.object[key]);
    if(actual===wanted){found=hit;break;}
    if(attempt===1)throw new Error('Backend row moved during lookup. Refresh and try again.');
  }
  if(io.lockDepth)io.lookups[cacheKey]=found;
  return found;
}
/** A timed-out source write can remain uncertain after the ScriptLock.
 * Search unresolved journal states, not every past edit of this event. When
 * none exist, avoid loading completed receipt history for this check. */
function rc18PendingEventWrites_() {
  const log=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.MUTATIONS);
  if(!log)return [];
  const headers=rc18Headers_(log),ec=headers.indexOf('EventID')+1,sc=headers.indexOf('State')+1,oc=headers.indexOf('OperationID')+1;
  if(!ec || !sc || !oc)throw new Error('MutationLog headers are incomplete. No event was changed.');
  rc18IO_().metrics.keySearches++;
  const pending=calendarNativeRead_(()=>log.getRange(rc18Column_(sc)+'2:'+rc18Column_(sc)).createTextFinder('DISPATCHED')
    .matchEntireCell(true).useRegularExpression(false).matchCase(true).findAll().map(c=>c.getRow()));
  if(!pending.length)return [];
  const groups=rc18Groups_(pending),name=rc18QuoteSheet_(log.getName()),ranges=[];
  groups.forEach(g=>{
    ranges.push(name+'!'+rc18Column_(ec)+g[0]+':'+rc18Column_(ec)+g[1]);
    ranges.push(name+'!'+rc18Column_(oc)+g[0]+':'+rc18Column_(oc)+g[1]);
  });
  const values=rc18ReadRanges_(ranges);
  const rows=[];
  groups.forEach((g,i)=>{for(let n=g[0];n<=g[1];n++){
    const offset=n-g[0];
    rows.push({eventId:String((values[i*2][offset]||[])[0]||''),operationId:String((values[i*2+1][offset]||[])[0]||'')});
  }});
  return rows;
}
function rc18AssertNoPendingEvent_(eventId, exceptOperationId, year, anyEvent) {
  const wanted=String(eventId),except=String(exceptOperationId||'');
  rc18PendingEventWrites_().forEach(row=>{
    const pendingId=row.eventId;
    const anyMatch=anyEvent==='publication' ? pendingId.indexOf('YEAR:')===0 : !!anyEvent;
    if((anyMatch || (wanted && pendingId===wanted) || (year && pendingId==='YEAR:'+Number(year))) &&
       row.operationId!==except) {
      if(rc18IO_().lockDepth){const log=mutationSheet_(),hit=mutationLookup_(log,row.operationId);if(hit&&resolveMutationRecord_(log,hit.object).state!=='UNKNOWN')return;}
      throw mutationError_('PENDING_EVENT_WRITE','An earlier save or publication still has an unknown outcome. Check the original operation before making another change. This proposal has not been applied.',409,true);
    }
  });
}

function rc18ReadTable_(sheet) {
  if(!sheet)return [];
  const io=rc18IO_(),name=sheet.getName();
  if(io.tables[name])return io.tables[name];
  const headers=rc18Headers_(sheet);
  // Keep columns bounded to this table's schema and rows to current data.
  const data=rc18ReadRanges_([rc18QuoteSheet_(name)+'!A2:'+rc18Column_(headers.length)])[0];
  return io.tables[name]=data.map((r,i)=>({row:i+2,object:rc18Object_(headers,r)}))
    .filter(x=>Object.values(x.object).some(v=>String(v).trim()!==''));
}
function rc18PrefetchTables_(names) {
  const io=rc18IO_(),ss=SpreadsheetApp.getActiveSpreadsheet(),jobs=[],ranges=[];
  names.forEach(name=>{
    if(io.tables[name])return;
    const sheet=ss.getSheetByName(name);
    if(!sheet){io.tables[name]=[];return;}
    const headers=rc18Headers_(sheet);
    jobs.push({name:name,headers:headers});
    ranges.push(rc18QuoteSheet_(name)+'!A2:'+rc18Column_(headers.length));
  });
  const data=rc18ReadRanges_(ranges);
  jobs.forEach((j,i)=>{io.tables[j.name]=data[i].map((r,n)=>({row:n+2,object:rc18Object_(j.headers,r)}))
    .filter(x=>Object.values(x.object).some(v=>String(v).trim()!==''));});
}
function rc18YearData_(year,names) {
  const ss=SpreadsheetApp.getActiveSpreadsheet();names=names||[CALV2.SHEETS.EVENTS,CALV2.SHEETS.YEAR_STRUCTURE,CALV2.SHEETS.DAY_NOTES];
  const jobs=names.map(name=>{const sheet=ss.getSheetByName(name),headers=rc18Headers_(sheet);
    return {name:name,sheet:sheet,headers:headers,col:headers.indexOf('Year')+1};});
  if(jobs.some(j=>!j.col))throw new Error('Year column missing in a calendar data sheet.');
  const active=jobs,out={};names.forEach(n=>out[n]=[]);
  const indices=rc18ReadRanges_(active.map(j=>rc18QuoteSheet_(j.name)+'!'+rc18Column_(j.col)+'2:'+rc18Column_(j.col)));
  const details=[],ranges=[];
  active.forEach((j,i)=>{
    const rows=[];indices[i].forEach((r,n)=>{if(Number(r[0])===Number(year))rows.push(n+2);});
    rc18Groups_(rows).forEach(g=>{
      details.push({job:j,start:g[0],end:g[1]});
      ranges.push(rc18QuoteSheet_(j.name)+'!A'+g[0]+':'+rc18Column_(j.headers.length)+g[1]);
    });
  });
  const values=rc18ReadRanges_(ranges);
  details.forEach((d,i)=>{for(let n=d.start;n<=d.end;n++){
    const obj=rc18Object_(d.job.headers,values[i][n-d.start]||[]);
    if(Number(obj.Year)!==Number(year))throw new Error('Calendar rows changed during loading. Refresh again; no empty calendar was substituted.');
    out[d.job.name].push(obj);
  }});
  return out;
}
function rc18Projection_(sheet,fields) {
  if(!sheet)return [];
  const headers=rc18Headers_(sheet),name=rc18QuoteSheet_(sheet.getName());
  const cols=fields.map(f=>{const c=headers.indexOf(f)+1;if(!c)throw new Error('Column missing: '+f);return c;});
  // Native reads incur a service call per range. Combine adjacent requested
  // columns only; never widen a projection across unrelated/private fields.
  const groups=[];
  Array.from(new Set(cols)).sort((a,b)=>a-b).forEach(column=>{
    const last=groups[groups.length-1];
    if(last&&column===last[1]+1)last[1]=column;else groups.push([column,column]);
  });
  const data=rc18ReadRanges_(groups.map(g=>name+'!'+rc18Column_(g[0])+'2:'+rc18Column_(g[1])));
  const count=data.reduce((n,rows)=>Math.max(n,rows.length),0);
  const out=Array.from({length:count},(_,i)=>({row:i+2,object:{}}));
  fields.forEach((f,i)=>{const group=groups.findIndex(g=>cols[i]>=g[0]&&cols[i]<=g[1]),offset=cols[i]-groups[group][0];
    out.forEach((r,n)=>{r.object[f]=rc18Value_(f,(data[group][n]||[])[offset]);});});
  return out;
}
function rc18TypedCell_(value) {
  if(value===null || value===undefined || value==='')return {};
  if(typeof value==='boolean')return {userEnteredValue:{boolValue:value}};
  if(typeof value==='number') {
    if(!Number.isFinite(value))throw new Error('Non-finite sheet value rejected.');
    return {userEnteredValue:{numberValue:value}};
  }
  if(typeof value!=='string')throw new Error('Only scalar sheet values are supported.');
  // Explicit stringValue, never formulaValue: titles beginning with '=' stay literal.
  return {userEnteredValue:{stringValue:value}};
}
function rc18PatchRequests_(sheet,row,patch) {
  if(!Number.isInteger(row)||row<2)throw new Error('Data patch may not touch header rows.');
  const headers=rc18Headers_(sheet),items=Object.keys(patch).map(k=>{
    const col=headers.indexOf(k);
    if(col<0)throw new Error('Unknown field '+k+' in '+sheet.getName()+'. No cells were written.');
    return {col:col,value:rc18TypedCell_(rc18Value_(k,patch[k]))};
  }).sort((a,b)=>a.col-b.col);
  const groups=[];items.forEach(item=>{const last=groups[groups.length-1];
    if(last && item.col===last.start+last.values.length)last.values.push(item.value);
    else groups.push({start:item.col,values:[item.value]});});
  return groups.map(g=>({updateCells:{start:{sheetId:sheet.getSheetId(),rowIndex:row-1,columnIndex:g.start},
    rows:[{values:g.values}],fields:'userEnteredValue'}}));
}
function calendarNativeCellValue_(cell) {
  if (!cell || !Object.keys(cell).length) return '';
  const value=cell.userEnteredValue;
  if (!value || Object.keys(cell).length!==1 || Object.keys(value).length!==1) throw new Error('Unsupported native sheet cell.');
  if (Object.prototype.hasOwnProperty.call(value,'stringValue') && typeof value.stringValue==='string') {
    // Native setValues treats a leading '=' as a formula. Apostrophe escaping
    // preserves literal event text, including text that already starts with one.
    return /^[=']/.test(value.stringValue) ? "'"+value.stringValue : value.stringValue;
  }
  if (Object.prototype.hasOwnProperty.call(value,'numberValue') && Number.isFinite(value.numberValue)) return value.numberValue;
  if (Object.prototype.hasOwnProperty.call(value,'boolValue') && typeof value.boolValue==='boolean') return value.boolValue;
  throw new Error('Unsupported native sheet value.');
}
function calendarNativeWritePlan_(requests,ss) {
  const sheets=new Map(ss.getSheets().map(sheet=>[sheet.getSheetId(),sheet])),plans=[];
  requests.forEach(request=>{
    if (!request || Object.keys(request).length!==1) throw new Error('Unsupported native sheet request.');
    if (request.updateCells) {
      const body=request.updateCells,start=body.start||{},sheet=sheets.get(start.sheetId);
      if (!sheet || body.fields!=='userEnteredValue' || !Number.isInteger(start.rowIndex) || start.rowIndex<1 || !Number.isInteger(start.columnIndex) || start.columnIndex<0 || !Array.isArray(body.rows) || body.rows.length!==1 || !Array.isArray(body.rows[0].values) || !body.rows[0].values.length) throw new Error('Invalid native data patch.');
      let plan=plans[plans.length-1];
      if (!plan || plan.kind!=='patch' || plan.sheet!==sheet || plan.row!==start.rowIndex+1) {plan={kind:'patch',sheet:sheet,row:start.rowIndex+1,cells:new Map()};plans.push(plan);}
      body.rows[0].values.forEach((cell,index)=>plan.cells.set(start.columnIndex+index+1,calendarNativeCellValue_(cell)));
    } else if (request.appendCells) {
      const body=request.appendCells,sheet=sheets.get(body.sheetId);
      if (!sheet || body.fields!=='userEnteredValue' || !Array.isArray(body.rows) || !body.rows.length) throw new Error('Invalid native append.');
      const values=body.rows.map(row=>{if(!row || !Array.isArray(row.values) || !row.values.length)throw new Error('Invalid native append row.');return row.values.map(calendarNativeCellValue_);});
      if(values.some(row=>row.length!==values[0].length))throw new Error('Native append rows have different widths.');
      plans.push({kind:'append',sheet:sheet,values:values});
    } else if (request.deleteDimension) {
      const range=request.deleteDimension.range||{},sheet=sheets.get(range.sheetId);
      if (!sheet || range.dimension!=='ROWS' || !Number.isInteger(range.startIndex) || range.startIndex<1 || !Number.isInteger(range.endIndex) || range.endIndex<=range.startIndex) throw new Error('Invalid native row deletion.');
      plans.push({kind:'delete',sheet:sheet,row:range.startIndex+1,count:range.endIndex-range.startIndex});
    } else throw new Error('Unsupported native sheet request.');
  });
  // Resolve every patch and validate every request before changing any sheet.
  plans.forEach(plan=>{
    if(plan.kind!=='patch')return;
    const columns=Array.from(plan.cells.keys()),first=Math.min.apply(null,columns),last=Math.max.apply(null,columns),width=last-first+1;
    let values=Array(width).fill('');
    if(plan.cells.size!==width){
      const range=plan.sheet.getRange(plan.row,first,1,width);
      values=calendarNativeRead_(()=>range.getValues()[0]);
      const formulas=calendarNativeRead_(()=>range.getFormulas()[0]);
      values=values.map((value,index)=>formulas[index] || (typeof value==='string'&&/^[=']/.test(value)?"'"+value:value));
    }
    plan.cells.forEach((value,column)=>{values[column-first]=value;});
    plan.col=first;plan.values=[values];delete plan.cells;
  });
  plans.forEach(plan=>{
    if(plan.kind==='delete'){
      if(plan.row+plan.count-1>plan.sheet.getMaxRows())throw new Error('Native row deletion exceeds sheet dimensions.');
    }else if((plan.col||1)+plan.values[0].length-1>plan.sheet.getMaxColumns())throw new Error('Native write exceeds sheet columns.');
    if(plan.kind!=='delete'&&plan.sheet.getName()===CALV2.SHEETS.MUTATIONS){
      const state=rc18Headers_(plan.sheet).indexOf('State')+1;
      plan.committedReceipt=state>0&&plan.values.some(row=>row[state-(plan.col||1)]==='COMMITTED');
    }
  });
  return plans;
}
function rc18WriteRequests_(requests) {
  if(!requests.length)return;
  // Validate the whole coordinated batch before its first native write.
  if(JSON.stringify({requests:requests}).length>1500000)throw mutationError_('WRITE_BATCH_TOO_LARGE','Write batch exceeds safety limit. Reduce this operation before retrying.',400,true);
  const ss=SpreadsheetApp.getActiveSpreadsheet(),plans=calendarNativeWritePlan_(requests,ss),io=rc18IO_();
  const calendarTicket=typeof rosterCalendarWritesAffect_==='function'&&rosterCalendarWritesAffect_(requests,ss)?rosterCalendarBeginWrite_():null;
  try {
    for(const plan of plans){
      // A receipt may confirm only writes that passed the native flush barrier.
      if(plan.committedReceipt)SpreadsheetApp.flush();
      io.metrics.nativeWriteRequests=Number(io.metrics.nativeWriteRequests||0)+1;
      if(plan.kind==='delete'){plan.sheet.deleteRows(plan.row,plan.count);continue;}
      const row=plan.kind==='append'?plan.sheet.getLastRow()+1:plan.row,last=row+plan.values.length-1;
      if(last>plan.sheet.getMaxRows())plan.sheet.insertRowsAfter(plan.sheet.getMaxRows(),last-plan.sheet.getMaxRows());
      plan.sheet.getRange(row,plan.col||1,plan.values.length,plan.values[0].length).setValues(plan.values);
      io.metrics.writeCells+=plan.values.reduce((count,values)=>count+values.length,0);
    }
    SpreadsheetApp.flush();
    if(calendarTicket)rosterCalendarEndWrite_(calendarTicket);
  } finally {
    // Native writes can commit before a response is lost. Clear memo even when
    // the coordinated batch is incomplete. Receipt/status decides any retry.
    new Set(plans.map(plan=>plan.sheet.getName())).forEach(name=>rc18InvalidateIO_(name));
  }
}
function rc18Queue_(requests) {
  if(!requests.length)return;
  const io=rc18IO_();
  if(io.queue)io.queue.push.apply(io.queue,requests);else rc18WriteRequests_(requests);
}
function rc18Atomic_(work) {
  const io=rc18IO_();if(io.queue)return work();
  io.queue=[];
  try {const result=work(),requests=io.queue;io.queue=null;rc18WriteRequests_(requests);return result;}
  finally {
    io.queue=null;
    // A reader can repopulate old metadata while the batch is pending.
    // Invalidate after the attempt, including a committed write with a lost reply.
    if(io.invalidateCaches){io.invalidateCaches=false;invalidateCalendarCaches_();}
  }
}
function rc18Append_(sheet,values) {
  const expected=CALV2.HEADERS[sheet.getName()];
  if(expected){const headers=rc18Headers_(sheet);
    if(sheet.getName()===CALV2.SHEETS.EVENTS?!calendarEventHeadersCompatible_(headers):expected.some((h,i)=>headers[i]!==h))throw new Error('Unexpected '+sheet.getName()+' header order; append blocked.');}
  rc18Queue_([{appendCells:{sheetId:sheet.getSheetId(),rows:[{values:values.map(rc18TypedCell_)}],fields:'userEnteredValue'}}]);
}
function rc18Patch_(sheet,row,patch) { rc18Queue_(rc18PatchRequests_(sheet,row,patch)); }
function rc18SaveObject_(sheet,headers,hit,obj) {
  if(hit) {
    const patch={};headers.forEach(h=>{const next=rc18Value_(h,obj[h]),prev=rc18Value_(h,hit.object[h]);
      if(next!==prev)patch[h]=next;});
    rc18Patch_(sheet,hit.row,patch);
  } else {
    const actual=rc18Headers_(sheet);
    if(sheet.getName()===CALV2.SHEETS.EVENTS){
      if(!calendarEventHeadersCompatible_(actual))throw new Error('Unexpected Events header order; append blocked.');
      rc18Append_(sheet,actual.map(h=>headers.includes(h)?rc18Value_(h,obj[h]):''));return;
    }
    if(headers.some((h,i)=>actual[i]!==h))throw new Error('Unexpected '+sheet.getName()+' header order; append blocked.');
    rc18Append_(sheet,headers.map(h=>rc18Value_(h,obj[h])));
  }
}
function rc18DeleteRow_(sheet,row) {
  if(!Number.isInteger(row)||row<2)throw new Error('Cannot delete a header row.');
  rc18Queue_([{deleteDimension:{range:{sheetId:sheet.getSheetId(),dimension:'ROWS',startIndex:row-1,endIndex:row}}}]);
}
function calendarEventHeadersCompatible_(headers){
  const fixed=CALV2.HEADERS.Events.filter(h=>h!=='VenueID');
  return fixed.every((h,i)=>headers[i]===h)&&headers.indexOf('VenueID')>=fixed.length;
}
function dispatch_(action,actor,payload,requestId) {
  const priorNative=calendarNativeSourceReads_;
  calendarNativeSourceReads_=true;
  rc18ResetIO_();
  const priorAuthority=calendarRequestAuthority_;
  calendarRequestAuthority_=actor?{alias:actor.userAlias,parent:action==='saveParentSide'||action==='eventMutationStatus'&&payload.action==='saveParentSide'}:null;
  try {
    if(action==='bootstrap') {
      // Batch metadata cache misses with fresh years and authority; event bodies stay year-scoped.
      const cache=rc17SafeCache_(),names=[CALV2.SHEETS.YEARS,CALV2.SHEETS.USERS];
      const groups=[
        ['calv2:settings:rc19',[CALV2.SHEETS.SETTINGS]],
        ['calv2:config:rc708',[CALV2.SHEETS.LANES,CALV2.SHEETS.LANE_SCHEDULE,CALV2.SHEETS.TAGS,CALV2.SHEETS.COLOUR_RULES]]
      ];
      groups.forEach(([key,tables])=>{
        let cached;try{cached=JSON.parse(cache.get(key)||'null');}catch(ignored){}
        if(!cached)names.push.apply(names,tables);
      });
      rc18PrefetchTables_(names);
    }
    // apiSyncYearBatch_ checks a saved deadline under its authority-checked
    // lock before reading any event bodies or dispatching provider work.
    return dispatchCore_(action,actor,payload,requestId);
  } catch(error) {
    if(['startSyncYear','syncYearBatch'].includes(action)&&error.calendarSourceReadTemporary)return calendarSourceReadDeferred_(action,actor,payload,error);
    throw error;
  }
  finally {calendarNativeSourceReads_=priorNative;calendarRequestAuthority_=priorAuthority;console.log(JSON.stringify({type:'CALV2_SHEETS_IO',version:CALV2.VERSION,action:action,
    requestId:requestId,metrics:rc18IO_().metrics}));}
}

/** Read-only service check. Does not create a test event or change data. */
function checkRC18SheetsApi() {
  // Keep the legacy function name for existing setup shortcuts. The check is
  // read-only and no longer requires the Advanced Sheets service.
  rc18ResetIO_();
  const ss=SpreadsheetApp.getActiveSpreadsheet(),timeZone=ss.getSpreadsheetTimeZone();
  if(timeZone!==CALV2.TZ)throw new Error('Workbook timezone must be '+CALV2.TZ+'. Check it before upgrading.');
  return {ok:true,version:CALV2.VERSION,spreadsheetId:ss.getId(),timeZone:timeZone,
    sheetCount:ss.getSheets().length,storage:'Native SpreadsheetApp',readOnly:true};
}
/** RC1.5 and RC1.7 -> RC1.9. No operational row resets; repeatable. */
function upgradeCalendarToRC19() {
  checkRC18SheetsApi();
  return withRC17WriteLock_(function(){
    const ss=SpreadsheetApp.getActiveSpreadsheet(),events=ss.getSheetByName(CALV2.SHEETS.EVENTS);
    if(!events)throw new Error('Events sheet missing. setupCalendarV2Workbook is for a NEW workbook only.');
    const got=rc18Headers_(events),wanted=CALV2.HEADERS.Events,legacy=wanted.filter(h=>!['LastMutationID','VenueID'].includes(h));
    if(legacy.some((h,i)=>got[i]!==h))throw new Error('Events headers differ from RC1.5/RC1.7. No migration applied.');
    const existingLog=ss.getSheetByName('MutationLog');
    if(existingLog && RC17_MUTATION_HEADERS.some((h,i)=>rc18Headers_(existingLog)[i]!==h))throw new Error('MutationLog headers differ; upgrade stopped.');
    if(got.length===legacy.length){
      if(events.getMaxColumns()<got.length+1)events.insertColumnsAfter(events.getMaxColumns(),1);
      events.getRange(1,got.length+1).setValue('LastMutationID');got.push('LastMutationID');
    }else if(got[legacy.length]!=='LastMutationID')throw new Error('LastMutationID header is missing or displaced.');
    let venueColumn=got.indexOf('VenueID')+1;
    if(!venueColumn){
      venueColumn=got.length+1;
      if(events.getMaxColumns()<venueColumn)events.insertColumnsAfter(events.getMaxColumns(),venueColumn-events.getMaxColumns());
      events.getRange(1,venueColumn).setValue('VenueID');
    }else if(venueColumn<=legacy.length+1)throw new Error('VenueID header is displaced. No event data was changed.');
    if(!existingLog)ensureSheet_(ss,'MutationLog',RC17_MUTATION_HEADERS);
    SpreadsheetApp.flush();
    rc18IO_().headers={};rc18InvalidateIO_();
    setSetting_('APP_VERSION',CALV2.VERSION,'Schema/application version.');
    invalidateCalendarCaches_();
    return {ok:true,version:CALV2.VERSION,eventRowsPreserved:Math.max(0,events.getLastRow()-1),
      mutationJournal:'MutationLog',storage:'Native SpreadsheetApp reads and writes',newRC18Columns:0,venueIdentityColumn:venueColumn};
  });
}
/** Chunked maintenance only; never used for a single event mutation.
 * Prior chunks may commit if a later one fails. These field assignments are
 * deterministic and operators may rerun the maintenance action after review. */
function rc18MaintenanceWrites_(requests) {
  for(let i=0;i<requests.length;i+=200)rc18WriteRequests_(requests.slice(i,i+200));
}

/* GSIS_CALENDAR_DATE_BEGIN */
/* Read-only school date context. Existing Calendar proxy authentication applies. */
function rosterCalendarStamp_(){try{const value=JSON.parse(PropertiesService.getScriptProperties().getProperty('ROSTER_CALENDAR_REVISION')||'null');return value?.schema===1&&typeof value.ready==='boolean'&&/^[a-f0-9]{64}$/.test(value.key||'')?value:null;}catch(_){return null;}}
function rosterCalendarBeginWrite_(){
 const value={schema:1,key:sha256_(Utilities.getUuid()),updatedAt:isoNow_(),ready:false};
 PropertiesService.getScriptProperties().setProperty('ROSTER_CALENDAR_REVISION',JSON.stringify(value));return value;
}
function rosterCalendarEndWrite_(ticket){if(ticket&&rosterCalendarStamp_()?.key===ticket.key)PropertiesService.getScriptProperties().setProperty('ROSTER_CALENDAR_REVISION',JSON.stringify({...ticket,ready:true}));}
function rosterCalendarFields_(name){return {Years:['Year','ReleasedToTeachers','Status'],YearStructure:['Year','Kind','Term','Week','StartDate','EndDate','DeletedAt','Label'],Events:['Year','OwnerTag','EventType','StartDate','EndDate','Status','DeletedAt','StaffTitle']}[name]||[];}
function rosterCalendarWritesAffect_(requests,ss){
 const sheets=new Map(ss.getSheets().map(s=>[s.getSheetId(),s]));
 return requests.some(request=>{const body=request.updateCells||request.appendCells||request.deleteDimension;if(!body)return false;const sheet=sheets.get(body.sheetId??body.start?.sheetId??body.range?.sheetId),wanted=sheet&&rosterCalendarFields_(sheet.getName());if(!wanted?.length)return false;if(!request.updateCells)return true;if(body.fields&&!body.fields.includes('userEnteredValue')&&!body.fields.includes('*'))return false;
  const headers=rc18Headers_(sheet),start=body.start?.columnIndex??body.range?.startColumnIndex??0,end=body.range?(body.range.endColumnIndex??headers.length):start+Math.max(0,...(body.rows||[]).map(row=>(row.values||[]).length));
  return (body.start?.rowIndex??body.range?.startRowIndex??0)===0||headers.slice(start,end).some(field=>wanted.includes(field));
 });
}
// Manual sheet edits do not have the application's commit acknowledgement.
// Mark them dirty immediately; fresh reads remain available without certification.
function onEdit(e){
 const range=e?.range;if(!range)return;const sheet=range.getSheet(),wanted=rosterCalendarFields_(sheet.getName());if(!wanted.length)return;
 if(range.getRow()===1||rc18Headers_(sheet).slice(range.getColumn()-1,range.getColumn()-1+range.getNumColumns()).some(field=>wanted.includes(field)))rosterCalendarBeginWrite_();
}
function rosterDateKeys_(keys){
 if(!Array.isArray(keys)||!keys.length||keys.length>62||new Set(keys).size!==keys.length||keys.some(key=>typeof key!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(key)||!Number.isFinite(Date.parse(key+'T12:00:00Z'))||new Date(key+'T12:00:00Z').toISOString().slice(0,10)!==key))throw mutationError_('INVALID_DATE','Choose up to 62 unique valid dates.',400,true);
 return keys;
}
function apiRosterWindow_(payload){
 const keys=rosterDateKeys_(payload.dates);
 if(keys.some((key,i)=>i&&Date.parse(key)-Date.parse(keys[i-1])!==86400000))throw mutationError_('INVALID_DATE','Choose a consecutive Calendar window.',400,true);
 const before=rosterCalendarStamp_(),now=Date.now(),header={schema:1,from:keys[0],to:keys[keys.length-1],checkedAt:isoNow_()},cacheKey='roster-calendar-window-v1:'+CALV2.RELEASE_VERSION+':'+sha256_(JSON.stringify(keys));let cache=null,proof=null;
 try{cache=CacheService.getScriptCache();proof=JSON.parse(cache.get(cacheKey)||'null');}catch(_){}
 // Even direct Sheets/API edits without an edit trigger are observed within
 // five minutes. Conditional checks never extend the original source-read age.
 if(before?.ready!==false&&proof?.schema===1&&proof.markerKey===(before?.key||null)&&proof.sourceRevision===payload.knownRevision&&/^[a-f0-9]{64}$/.test(proof.sourceRevision)&&Number.isFinite(proof.readAt)&&now>=proof.readAt&&now-proof.readAt<300000)return {...header,sourceRevision:proof.sourceRevision,sourceCheckedAt:new Date(proof.readAt).toISOString(),updatedAt:before?.updatedAt||null,cacheable:true,unchanged:true};
 const dates=apiRosterDates_({dates:keys}).dates,after=rosterCalendarStamp_();
 if(before?.key!==after?.key||before?.ready!==after?.ready)throw mutationError_('CALENDAR_SOURCE_CHANGED','Calendar changed during this read. Retry the current view.',503,true);
 const sourceRevision=sha256_(JSON.stringify(dates.map(({checkedAt,...day})=>day))),cacheable=after?.ready!==false;
 if(cache&&cacheable)try{cache.put(cacheKey,JSON.stringify({schema:1,markerKey:after?.key||null,sourceRevision,readAt:now}),300);}catch(_){}
 return {...header,sourceRevision,sourceCheckedAt:new Date(now).toISOString(),updatedAt:after?.updatedAt||null,cacheable,dates:dates.map(day=>({...day,sourceRevision}))};
}
function apiRosterDate_(payload){
 const value=apiRosterDates_({dates:[String(payload.date||'')]}).dates[0];
 if(value.code==='YEAR_UNAVAILABLE')throw mutationError_('YEAR_UNAVAILABLE','Calendar year is not released to staff.',403,true);
 return value;
}
function apiRosterDates_(payload){
 const keys=rosterDateKeys_(payload.dates);
 const ss=SpreadsheetApp.getActiveSpreadsheet(),years=tableObjects_(ss.getSheetByName(CALV2.SHEETS.YEARS)),byYear=new Map();
 // One fresh release check and one bounded year read per year, regardless of date count.
 return {dates:keys.map(key=>{
  const year=Number(key.slice(0,4));
  if(!byYear.has(year)){
   const matches=years.filter(r=>Number(r.Year)===year),released=matches.length===1&&yes_(matches[0].ReleasedToTeachers)&&String(matches[0].Status).toUpperCase()!=='ARCHIVED';
   byYear.set(year,released?rc18YearData_(year,[CALV2.SHEETS.EVENTS,CALV2.SHEETS.YEAR_STRUCTURE]):null);
  }
  const data=byYear.get(year);return data?rosterDateContext_(key,data):{date:key,code:'YEAR_UNAVAILABLE'};
 })};
}
function rosterDateContext_(key,data){
 const n=Date.parse(key+'T12:00:00Z'),structures=data[CALV2.SHEETS.YEAR_STRUCTURE].filter(r=>!r.DeletedAt&&dateKeyInRange_(key,r.StartDate,r.EndDate));
 const weeks=structures.filter(r=>String(r.Kind).toUpperCase()==='TERM_WEEK');
 const week=weeks.length===1?weeks[0]:null,match=week&&String(week.Week||'').match(/^(?:T\d+W)?(\d+)$/i),schoolWeek=match?Number(match[1]):null;
 const parity=schoolWeek>0?(schoolWeek%2?'odd':'even'):null;
 const holidays=data[CALV2.SHEETS.EVENTS].filter(r=>!r.DeletedAt&&String(r.Status).toUpperCase()==='PUBLISHED'&&String(r.OwnerTag).toLowerCase()==='hol'&&['ALL_DAY','MULTI_DAY'].includes(String(r.EventType).toUpperCase())&&eventCoversDate_(r,key));
 const vacation=structures.filter(r=>String(r.Kind).toUpperCase()==='VACATION'),weekend=[0,6].includes(new Date(n).getUTCDay());
 const reasons=[...holidays.map(r=>String(r.StaffTitle||'Holiday')),...vacation.map(r=>String(r.Label||'School vacation')),...(weekend?['Weekend']:[])];
 return {version:CALV2.RELEASE_VERSION,date:key,term:week?String(week.Term||''):null,schoolWeek,parity,schoolDay:reasons.length?false:parity?true:null,reason:[...new Set(reasons)].join('; '),warning:weeks.length>1?'Conflicting term weeks.':!parity?'School week is not defined for this date.':'',checkedAt:isoNow_()};
}

// Compact academic boundaries for Roster Statistics. Dates come from saved term
// weeks, not assumed month boundaries; school semester grouping is configurable.
function apiRosterStatisticsCalendar_(payload){
 const current=Number(payload.year),actual=Number(Utilities.formatDate(new Date(),'Asia/Singapore','yyyy'));
 if(!Number.isInteger(current)||current<actual-20||current>actual+2)throw mutationError_('INVALID_YEAR','Choose a supported statistics year.',400,true);
 const ss=SpreadsheetApp.getActiveSpreadsheet(),years=tableObjects_(ss.getSheetByName(CALV2.SHEETS.YEARS)),terms=[];
 for(const year of [current-1,current]){
  const rows=years.filter(r=>Number(r.Year)===year);if(rows.length!==1||!yes_(rows[0].ReleasedToTeachers)||String(rows[0].Status).toUpperCase()==='ARCHIVED')continue;
  const structure=rc18YearData_(year,[CALV2.SHEETS.YEAR_STRUCTURE])[CALV2.SHEETS.YEAR_STRUCTURE],groups=new Map();
  for(const row of structure){if(row.DeletedAt||String(row.Kind).toUpperCase()!=='TERM_WEEK')continue;const term=Number(String(row.Term).replace(/^T(?:erm)?\s*/i,'')),from=dateText_(row.StartDate),to=dateText_(row.EndDate);if(!Number.isInteger(term)||term<1||term>12||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||to<from)continue;const prior=groups.get(term);groups.set(term,{year,term,from:prior&&prior.from<from?prior.from:from,to:prior&&prior.to>to?prior.to:to});}
  terms.push(...groups.values());
 }
 let mapping=[[1,2],[3,4]],semesterBasis='Terms 1–2 and Terms 3–4';
 const configured=PropertiesService.getScriptProperties().getProperty('ROSTER_STATS_SEMESTER_TERMS');
 if(configured){try{mapping=JSON.parse(configured);}catch(_){mapping=[];}semesterBasis='Configured term groups';}
 if(!Array.isArray(mapping)||mapping.length>4||mapping.some(g=>!Array.isArray(g)||!g.length||g.some(n=>!Number.isInteger(n)||n<1||n>12))||new Set(mapping.flat()).size!==mapping.flat().length)mapping=[];
 const semesters=[];for(const year of [current-1,current])mapping.forEach((group,index)=>{const members=group.map(term=>terms.find(t=>t.year===year&&t.term===term));if(members.every(Boolean))semesters.push({year,semester:index+1,terms:group,from:members.map(t=>t.from).sort()[0],to:members.map(t=>t.to).sort().at(-1)});});
 return {terms:terms.sort((a,b)=>a.from.localeCompare(b.from)),semesters,semesterBasis,checkedAt:isoNow_()};
}

/* GSIS_CALENDAR_DATE_END */

/* GSIS_CALENDAR_BIRTHDAYS_BEGIN */
/** Contacts-owned birthday reconciliation. Network reads occur before the
 * Calendar write lock. Source ownership is stored in protected CreatedBy plus
 * a deterministic EventID; no workbook schema or manual event is repurposed. */
function calendarBirthdaySource_(actor) {
  const props=PropertiesService.getScriptProperties();
  const url=String(props.getProperty('CONTACTS_APPS_SCRIPT_URL')||'').trim();
  const secret=String(gsisApiSecret_('CONTACTS_BRIDGE_SECRET')||'');
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)||secret.length<32) {
    throw mutationError_('CONTACTS_NOT_CONFIGURED','Set CONTACTS_APPS_SCRIPT_URL and CONTACTS_BRIDGE_SECRET in Calendar Script Properties. No birthday was changed.',503,true);
  }
  const payload=JSON.stringify({action:'calendarBirthdays',identity:{email:actor.email,subject:actor.sub},input:{},timestamp:Date.now(),nonce:Utilities.getUuid()});
  const signature=Utilities.computeHmacSha256Signature(payload,secret).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
  let response,body;
  try {
    response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:JSON.stringify({payload:payload,signature:signature}),muteHttpExceptions:true,followRedirects:true});
    const text=response.getContentText();
    if(response.getResponseCode()!==200||text.length>1000000)throw Error('Unexpected source response');
    body=JSON.parse(text);
  } catch(ignored) {
    throw mutationError_('CONTACTS_UNAVAILABLE','Contacts could not be read. No birthday was changed. Try Update birthdays from Contacts again.',503,true);
  }
  if(!body||body.ok!==true||!body.data)throw mutationError_('CONTACTS_UNAVAILABLE','Contacts did not provide a complete birthday source. Check your Contacts access and retry. No birthday was changed.',503,true);
  return calendarBirthdayValidateSource_(body.data);
}

function calendarBirthdayValidateSource_(source) {
  if(!source||source.schema!==1||source.complete!==true||source.authoritative!==true||!Array.isArray(source.people)||source.count!==source.people.length||source.people.length>5000||typeof source.revision!=='string'||!source.revision||!Number.isFinite(source.observedAt)||source.observedAt<Date.now()-120000||source.observedAt>Date.now()+300000) {
    throw mutationError_('INCOMPLETE_BIRTHDAY_SOURCE','Contacts birthday source is incomplete or stale. No birthday was changed.',409,true);
  }
  const seen=new Set();
  for(const p of source.people) {
    if(!p||typeof p.id!=='string'||!p.id.trim()||p.id.length>256||seen.has(p.id)||['name','active','mk','day','month'].some(k=>typeof p[k]!=='string'))throw mutationError_('INVALID_BIRTHDAY_IDENTITY','Contacts birthday identity is missing or duplicated. No birthday was changed.',409,true);
    seen.add(p.id);
  }
  return source;
}
function calendarBirthdayId_(staffId,year) {return 'BDAY-'+year+'-'+sha256_('gsis-contacts-birthday-v1\n'+staffId).slice(0,40);}
function calendarBirthdayMarker_(staffId) {return 'CONTACTS-BIRTHDAY-V1|'+encodeURIComponent(staffId);}
function calendarBirthdayOwner_(event) {
  const marker=String(event.CreatedBy||'');
  if(!marker.startsWith('CONTACTS-BIRTHDAY-V1|'))return '';
  let id;try{id=decodeURIComponent(marker.slice(21));}catch(ignored){return '';}
  return id&&event.EventID===calendarBirthdayId_(id,Number(event.Year))?id:'';
}
function calendarBirthdayEligibility_(person,year) {
  const name=person.name.trim(),active=person.active.trim().toUpperCase(),mk=person.mk.trim();
  if(!['Y','N'].includes(active))return {kind:'skip',reason:'invalid active status'};
  if(active==='N'||mk&&!/^(?:N|NO|FALSE)$/i.test(mk))return {kind:'remove',reason:'not eligible'};
  const day=person.day.trim(),month=person.month.trim();
  // Only two explicitly empty fields represent an intentional birthday clear.
  if(!day&&!month)return {kind:'remove',reason:'birthday cleared'};
  if(!name||!/^\d{1,2}$/.test(day)||!/^\d{1,2}$/.test(month))return {kind:'skip',reason:'incomplete birthday'};
  const d=Number(day),m=Number(month),max=new Date(Date.UTC(year,m,0)).getUTCDate();
  if(m<1||m>12||d<1||d>max)return {kind:'skip',reason:'invalid birthday for year'};
  return {kind:'event',name:name,date:String(year)+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0')};
}

function calendarBirthdayPlan_(source,events,year,config,visibility) {
  calendarBirthdayValidateSource_(source);
  const lanes=(config.lanes||[]).filter(l=>yes_(l.Active)&&String(l.LaneID)==='day');
  const tags=(config.tags||[]).filter(t=>yes_(t.Active)&&String(t.Tag).toUpperCase()==='SWC');
  if(lanes.length!==1||tags.length!==1)throw mutationError_('BIRTHDAY_CATEGORY_MISSING','The existing Day column and SWC tag must be active. No new category was created.',409,true);
  const byId=new Map(),owned=new Map(),people=new Set(source.people.map(p=>p.id));
  for(const e of events) {
    if(Number(e.Year)!==year)continue;
    if(byId.has(e.EventID))throw mutationError_('BIRTHDAY_EVENT_DUPLICATE','Calendar event identity is duplicated. Ask an Admin to review it.',409,true);
    byId.set(e.EventID,e);const owner=calendarBirthdayOwner_(e);if(owner)owned.set(owner,e);
  }
  const plan={created:0,updated:0,removed:0,skipped:0,unchanged:0,changes:[]};
  for(const p of source.people) {
    const decision=calendarBirthdayEligibility_(p,year),id=calendarBirthdayId_(p.id,year),before=owned.get(p.id);
    if(decision.kind==='skip'){plan.skipped++;continue;}
    if(byId.has(id)&&!before)throw mutationError_('BIRTHDAY_OWNERSHIP_CONFLICT','A birthday identity belongs to a manual or unverified event. No event was replaced.',409,true);
    if(decision.kind==='remove') {
      if(before&&!before.DeletedAt){plan.removed++;plan.changes.push({kind:'remove',before:before});}else plan.skipped++;
      continue;
    }
    const fields={EventID:id,Year:year,Status:before?before.Status:visibility,LaneID:String(lanes[0].LaneID),OwnerTag:String(tags[0].Tag),ShiftSpan:'NONE',StaffTitle:'Happy Bday '+decision.name,EventType:'ALL_DAY',StartDate:decision.date,EndDate:decision.date,StartTime:'',EndTime:'',DeletedAt:''};
    if(before&&!before.DeletedAt&&Object.keys(fields).every(k=>String(before[k]??'')===String(fields[k]))) {plan.unchanged++;continue;}
    const event=Object.assign({StaffDescription:'',Location:'',ParentEnabled:'No',ParentTitle:'',ParentDescription:''},before||{},fields);
    event.CreatedBy=calendarBirthdayMarker_(p.id);
    plan.changes.push({kind:before?'update':'create',before:before||null,event:event});
    if(before)plan.updated++;else plan.created++;
  }
  // Missing people are not proof of an intentional clear. Keep their owned
  // events for review rather than treating an incomplete identity as deletion.
  for(const [id,event]of owned)if(!people.has(id)&&!event.DeletedAt)plan.skipped++;
  return plan;
}

function calendarBirthdayReceipt_(log,actor,identity) {
  const hit=mutationLookup_(log,identity.operationId);
  if(!hit)return null;
  mutationCheckIdentity_(hit.object,actor,'pullBirthdays',identity.hash);
  if(hit.object.State==='COMMITTED')return JSON.parse(hit.object.ResultJSON);
  if(hit.object.State==='REJECTED')return unwrapMutationOutcome_(mutationOutcome_(hit.object));
  throw mutationError_('UNKNOWN','Birthday update status is not confirmed. Retry the same update to check its receipt. Do not start another update.',503,false);
}
function calendarBirthdayRows_(sheet,field,value) {
  const column=rc18Headers_(sheet).indexOf(field)+1;
  if(!column)throw new Error('Calendar source column is missing: '+field);
  rc18IO_().metrics.keySearches++;
  const rows=sheet.getRange(rc18Column_(column)+'2:'+rc18Column_(column)).createTextFinder(String(value)).matchEntireCell(true).useRegularExpression(false).matchCase(true).findAll().map(cell=>cell.getRow());
  const hits=rc18Rows_(sheet,rows);
  if(hits.some(hit=>String(hit.object[field])!==String(value)))throw mutationError_('BIRTHDAY_READ_CHANGED','Calendar rows changed during the birthday read. Retry without discarding your work.',409,true);
  return hits;
}
function apiPullBirthdays_(actor,payload,requestId) {
  const year=Number(payload.year);
  if(!Number.isInteger(year)||year<2000||year>2100)throw mutationError_('INVALID_YEAR','Choose a valid Calendar year.',400,true);
  const identity=mutationIdentity_(actor,'pullBirthdays',{year:year,operationId:payload.operationId});
  const log=mutationSheet_(),prior=calendarBirthdayReceipt_(log,actor,identity);
  if(prior)return prior;
  // The source call is deliberately outside the Calendar writer lock.
  const source=calendarBirthdayValidateSource_(calendarBirthdaySource_(actor));
  return withRC17WriteLock_(()=>{
    const previous=calendarBirthdayReceipt_(log,actor,identity);if(previous)return previous;
    const yearRow=yearsCached_().find(y=>Number(y.Year)===year);
    if(!yearRow||String(yearRow.Status).toUpperCase()==='ARCHIVED')throw mutationError_('YEAR_UNAVAILABLE','This Calendar year is missing or archived.',409,true);
    rc18AssertNoPendingEvent_('',identity.operationId,year,true);
    const receipts=calendarBirthdayRows_(log,'Action','pullBirthdays').filter(h=>h.object.State==='COMMITTED');
    for(const hit of receipts){let value;try{value=JSON.parse(hit.object.ResultJSON);}catch(ignored){continue;}if(Number(value.year)===year&&(Number(value.sourceObservedAt)>source.observedAt||Number(value.sourceObservedAt)===source.observedAt&&value.sourceRevision!==source.revision))throw mutationError_('STALE_BIRTHDAY_SOURCE','A newer Contacts birthday snapshot was already applied. Retry with the current source.',409,true);}
    const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.EVENTS);
    const hits=calendarBirthdayRows_(sheet,'Year',year),hitById=new Map(hits.map(h=>[h.object.EventID,h]));
    const plan=calendarBirthdayPlan_(source,hits.map(h=>h.object),year,configCached_(),defaultEventVisibilityFromYearStatus_(yearRow.Status));
    const now=isoNow_(),changes=plan.changes.map(change=>{
      const before=change.before;
      if(change.kind==='remove')return {kind:change.kind,before:before,event:Object.assign({},before,{DeletedAt:now,UpdatedAt:now,UpdatedBy:actor.userAlias,LastMutationID:identity.operationId,StaffSyncState:'PENDING_REMOVAL',ParentSyncState:'PENDING_REMOVAL'})};
      const event=validateEvent_(change.event,before);
      Object.assign(event,{CreatedAt:before?before.CreatedAt:now,CreatedBy:change.event.CreatedBy,UpdatedAt:now,UpdatedBy:actor.userAlias,LastMutationID:identity.operationId,DeletedAt:'',StaffCalendarEventId:before?before.StaffCalendarEventId:'',StaffSyncHash:before?before.StaffSyncHash:'',ParentCalendarEventId:before?before.ParentCalendarEventId:'',ParentSyncHash:before?before.ParentSyncHash:'',LastSyncedAt:before?before.LastSyncedAt:''});
      event.StaffSyncState=calendarApiSourceLinked_('staff',event)||staffDesiredNowForEvent_(event)?'PENDING_SYNC':'SYNCED';
      event.ParentSyncState=yes_(event.ParentEnabled)||calendarApiSourceLinked_('parent',event)?'PENDING_SYNC':'SYNCED';
      return {kind:change.kind,before:before,event:event};
    });
    const result={year:year,created:plan.created,updated:plan.updated,removed:plan.removed,skipped:plan.skipped,unchanged:plan.unchanged,sourceRevision:source.revision,sourceObservedAt:source.observedAt,operationId:identity.operationId};
    const record={OperationID:identity.operationId,UserAlias:actor.userAlias,Action:'pullBirthdays',PayloadHash:identity.hash,State:'DISPATCHED',EventID:'YEAR:'+year,CreatedAt:now,UpdatedAt:now};
    try {
      mutationWrite_(log,record);
      return rc18Atomic_(()=>{
        for(const change of changes)rc18SaveObject_(sheet,CALV2.HEADERS.Events,hitById.get(change.event.EventID)||null,change.event);
        // Sheets limits one cell to 50,000 characters. Keep a bounded sample
        // plus a digest of every changed identity; exact counts and per-event
        // LastMutationID remain on each native event row. The success receipt
        // is flushed only after every event and the audit write completes.
        const eventIds=changes.map(c=>c.event.EventID).sort();
        appendAudit_(actor,'PULL_CONTACTS_BIRTHDAYS','Year',String(year),null,{...result,eventIdsTotal:eventIds.length,eventIds:eventIds.slice(0,50),eventIdsTruncated:eventIds.length>50,eventIdsSha256:sha256_(JSON.stringify(eventIds))},requestId);
        record.State='COMMITTED';record.ResultJSON=JSON.stringify(result);mutationWrite_(log,record);
        return result;
      });
    } catch(err) {
      if(err.code==='WRITE_BATCH_TOO_LARGE'){rejectMutation_(log,record,err);throw err;}
      rc18InvalidateIO_();
      try{const receipt=calendarBirthdayReceipt_(log,actor,identity);if(receipt)return receipt;}catch(ignored){}
      throw mutationError_('UNKNOWN','Birthday update status is not confirmed. Retry the same update to check its receipt.',503,false);
    } finally {invalidateCalendarCaches_();}
  },true);
}

/* GSIS_CALENDAR_BIRTHDAYS_END */

/* GSIS_VENUES_SOURCE_BRIDGE_BEGIN */
// A separate read-only service credential; never delegates a school-user role.
function venuesSourceError_(status,code,message){throw Object.assign(Error(message),{status,code});}
function venuesSourceHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value)).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function venuesSourceAuthenticate_(envelope,source){
 const deny=()=>venuesSourceError_(401,'VENUES_SOURCE_AUTH','Invalid Venues source request.');
 if(!envelope||typeof envelope.payload!=='string'||envelope.payload.length>120000||typeof envelope.signature!=='string'||!/^[a-f0-9]{64}$/.test(envelope.signature)||Object.keys(envelope).some(k=>!['payload','signature'].includes(k)))deny();
 const secret=gsisApiSecret_('VENUES_BRIDGE_SECRET');if(!secret||secret.length<32)venuesSourceError_(503,'VENUES_SOURCE_SETUP','Configure VENUES_BRIDGE_SECRET for the Venues source service.');
 const signature=Utilities.computeHmacSha256Signature(envelope.payload,secret).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');let diff=0;for(let i=0;i<64;i++)diff|=signature.charCodeAt(i)^envelope.signature.charCodeAt(i);if(diff)deny();
 let request;try{request=JSON.parse(envelope.payload);}catch(_){deny();}
 if(!request||request.action!=='venuesSource'||request.service!=='gsis-venues-v1'||request.source!==source||Object.keys(request).some(k=>!['action','service','source','timestamp','nonce','input'].includes(k))||!Number.isFinite(request.timestamp)||Math.abs(Date.now()-request.timestamp)>60000||!/^[-\w]{36}$/.test(request.nonce||''))deny();
 const input=request.input;if(!input||typeof input!=='object'||Array.isArray(input))venuesSourceError_(400,'VENUES_SOURCE_INPUT','Choose a valid source read.');return input;
}
function venuesSourceReadInput_(input,extra=[]){
 if(!['manifest','snapshot'].includes(input.operation)||Object.keys(input).some(k=>!['operation','knownKey','expectedKey',...extra].includes(k))||['knownKey','expectedKey'].some(k=>input[k]!==undefined&&(typeof input[k]!=='string'||input[k].length>200)))venuesSourceError_(400,'VENUES_SOURCE_INPUT','Choose a supported source read.');return input;
}
function venuesSourceResult_(source,key,input,value,updatedAt){
 if(input.expectedKey!==undefined&&input.expectedKey!==key)venuesSourceError_(409,'VENUES_SOURCE_CHANGED','The source changed. Refresh before trying again.');
 const result={schema:1,source,key,authoritative:true,observedAt:new Date().toISOString(),...(updatedAt?{updatedAt}:{})};
 return input.operation==='manifest'&&input.knownKey===key?{...result,unchanged:true}:{...result,...value};
}

/* GSIS_VENUES_SOURCE_BRIDGE_END */

/* GSIS_VENUES_CALENDAR_SOURCE_BEGIN */
function venuesCalendarSource_(envelope){
 const input=venuesSourceAuthenticate_(envelope,'calendar');
 if(input.operation==='manifest'){
  venuesSourceReadInput_(input,['year']);const year=Number(input.year);if(!Number.isInteger(year)||year<2000||year>2099)venuesSourceError_(400,'VENUES_SOURCE_INPUT','Choose a valid Calendar year.');
  const view=venuesCalendarView_(year);return venuesSourceResult_('calendar',view.key,input,{});
 }
 const dates=input.dates;
 if(input.operation!=='dates'||Object.keys(input).some(k=>!['operation','dates'].includes(k))||!Array.isArray(dates)||!dates.length||dates.length>62||new Set(dates).size!==dates.length||dates.some(d=>typeof d!=='string'||!/^20\d\d-\d\d-\d\d$/.test(d)||!Number.isFinite(Date.parse(d+'T12:00:00Z'))||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d))venuesSourceError_(400,'VENUES_SOURCE_INPUT','Choose up to 62 unique valid dates.');
 const years=[...new Set(dates.map(d=>Number(d.slice(0,4))))];if(years.length!==1)venuesSourceError_(400,'VENUES_SOURCE_INPUT','Read one Calendar year per source batch.');
 const view=venuesCalendarView_(years[0]),result=dates.map(date=>view.released?rosterDateContext_(date,view.data):{date,code:'YEAR_UNAVAILABLE'});
 if(view.key!==venuesCalendarView_(years[0]).key)venuesSourceError_(409,'VENUES_SOURCE_CHANGED','Calendar changed during the dates read.');
 return {schema:1,source:'calendar',key:view.key,observedAt:isoNow_(),authoritative:true,dates:result};
}
function venuesCalendarView_(year){
 const ss=SpreadsheetApp.getActiveSpreadsheet(),rows=tableObjects_(ss.getSheetByName(CALV2.SHEETS.YEARS)).filter(r=>Number(r.Year)===year),data=rc18YearData_(year,[CALV2.SHEETS.EVENTS,CALV2.SHEETS.YEAR_STRUCTURE]);
 return {key:venuesSourceHash_([year,rows,data]),released:rows.length===1&&yes_(rows[0].ReleasedToTeachers)&&String(rows[0].Status).toUpperCase()!=='ARCHIVED',data};
}

/* GSIS_VENUES_CALENDAR_SOURCE_END */

/* GSIS_API_SECRET_BEGIN */
// Server-to-server transport only. Session keys, private links and provider credentials stay separate.
function gsisApiSecret_(legacyName){
 const properties=PropertiesService.getScriptProperties(),value=properties.getProperty('GSIS_SECRET');
 if(value!==null&&value!==undefined){
  if(typeof value!=='string'||! /^[!-~]{32,8000}$/.test(value))throw Object.assign(Error('GSIS_SECRET must contain 32 to 8000 printable ASCII characters without spaces.'),{status:503,code:'GSIS_SECRET_INVALID'});
  return value;
 }
 return properties.getProperty(legacyName)||'';
}

/* GSIS_API_SECRET_END */

/* GSIS_CALENDAR_COMMANDS_BEGIN */
/* Optional durable Worker commands reuse the ordinary event journal. The
 * trusted gateway verifies Access; the service cannot choose another action,
 * ignore a revision, or substitute its own service identity for the actor. */
function calendarCommandService_(request){
  const priorCommand=calendarNativeCommandReads_,priorNative=calendarNativeSourceReads_;
  calendarNativeCommandReads_=true;calendarNativeSourceReads_=true;
  try{return calendarCommandServiceCore_(request);}
  finally{calendarNativeCommandReads_=priorCommand;calendarNativeSourceReads_=priorNative;}
}
function calendarCommandServiceCore_(request){
  const allowed=['proxySecret','service','purpose','action','mode','actor','commandId','operation','requestId'];
  const deny=()=>{throw mutationError_('COMMAND_SERVICE_INVALID','Invalid Calendar command service request.',400,true);};
  if(request.service!=='gsis-calendar-command-v1'||request.purpose!=='calendar-mutation-job-v1'||request.action!=='calendarCommand'||!['authorize','execute','status'].includes(request.mode)||Object.keys(request).some(k=>!allowed.includes(k))||JSON.stringify(request).length>200000)deny();
  const operation=request.operation,actor=normaliseActor_(request.actor);
  if(!operation||typeof operation!=='object'||Array.isArray(operation)||Object.keys(operation).some(k=>!['action','payload'].includes(k))||!['saveEvent','deleteEvent','saveParentSide','relocateEvent'].includes(operation.action)||!operation.payload||typeof operation.payload!=='object'||Array.isArray(operation.payload))deny();
  // Actor aliases are derived from the verified account, never a role selector.
  if(actor.userAlias!==normAlias_(actor.email.split('@')[0]))throw mutationError_('COMMAND_ACTOR_INVALID','Calendar command actor does not match the verified account.',403,true);
  if(typeof request.commandId!=='string'||request.commandId!==operation.payload.operationId)deny();
  // Server-derived receipt binding. A caller-supplied field is overwritten;
  // another Google subject cannot replay a former account's accepted command.
  const payload=Object.assign({},operation.payload,{__calendarActorIdentity:sha256_(JSON.stringify([actor.email,actor.sub]))});
  mutationIdentity_(actor,operation.action,payload);
  const requestId=String(request.requestId||request.commandId);
  if(request.mode==='status')return dispatch_('eventMutationStatus',actor,{action:operation.action,payload:payload},requestId);
  if(request.mode==='execute')return dispatch_(operation.action,actor,payload,requestId);
  return calendarCommandAuthorize_(actor,operation.action,payload,requestId);
}
function calendarCommandAuthorize_(actor,action,payload,requestId){
  rc18ResetIO_();
  if(action==='saveEvent'&&payload.event&&payload.event.VenueID||action==='relocateEvent')rc18IO_().venueCatalogue=calendarVenueCatalogue_(actor);
  const prior=calendarRequestAuthority_;calendarRequestAuthority_={alias:actor.userAlias,parent:action==='saveParentSide'};
  try{return withRC17WriteLock_(()=>{
    const identity=mutationIdentity_(actor,action,payload),log=mutationSheet_(),receipt=mutationLookup_(log,identity.operationId);
    if(receipt){mutationCheckIdentity_(receipt.object,actor,action,identity.hash);return {authorized:true,actor:actor,commandId:identity.operationId,action:action};}
    const id=String(action==='saveEvent'?(payload.event||{}).EventID||'':payload.eventId||'');
    const before=id?findRowByKey_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.EVENTS),'EventID',id):null;
    const isNew=action==='saveEvent'&&!id;
    rc18AssertNoPendingEvent_(id,identity.operationId,before?before.object.Year:(payload.event||{}).Year);
    if(!isNew){
      if(!before||before.object.DeletedAt)throw mutationError_('EVENT_GONE','This event was deleted or no longer exists.',409,true);
      if(!payload.expectedRevision||String(payload.expectedRevision)!==eventForClient_(before.object)._revision)throw mutationError_('CONFLICT','A colleague changed this event. Review the latest version before queuing it.',409,true,before.object);
      const year=yearsCached_().find(y=>Number(y.Year)===Number(before.object.Year));
      if(!year||String(year.Status).toUpperCase()==='ARCHIVED')throw mutationError_('ARCHIVED','This year is archived and cannot be edited.',409,true);
    }
    if(action==='saveEvent')validateEvent_(payload.event,before&&before.object);
    if(action==='relocateEvent'&&!['move','copy'].includes(payload.mode))throw mutationError_('VALIDATION','Choose Move or Copy.',400,true);
    return {authorized:true,actor:actor,commandId:identity.operationId,action:action};
  });}finally{calendarRequestAuthority_=prior;}
}

/* GSIS_CALENDAR_COMMANDS_END */

/* GSIS_CALENDAR_VENUE_DIRECTORY_BEGIN */
/* Read-only, identity-scoped catalogue. Location remains valid free text; a
 * catalogue match never creates a booking or claims that a room is available. */
function calendarVenueCatalogue_(actor){
  const io=rc18IO_();if(io.venueCatalogue)return io.venueCatalogue;
  const unavailable={venues:[],venueSource:{status:'unavailable',message:'Venue directory is unavailable. Custom location text remains usable.'}};
  let stage='configuration',httpStatus;
  const fail=code=>{throw Object.assign(new Error('Venue directory check failed.'),{venueCode:code});};
  try{
    const props=PropertiesService.getScriptProperties(),url=props.getProperty('VENUES_APPS_SCRIPT_URL');
    if(!url)fail('VENUES_URL_MISSING');
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url))fail('VENUES_URL_INVALID');
    const secret=gsisApiSecret_('VENUES_BRIDGE_SECRET');if(!secret)fail('VENUES_SECRET_MISSING');
    const payload=JSON.stringify({action:'calendarCatalogue',service:'gsis-calendar-catalogue-v1',purpose:'calendar-venue-catalogue-v1',timestamp:Date.now(),nonce:Utilities.getUuid(),identity:{email:actor.email,subject:actor.sub},input:{operation:'calendarLookup'}});
    const signature=Utilities.computeHmacSha256Signature(payload,secret).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
    stage='transport';
    const response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:JSON.stringify({payload:payload,signature:signature}),followRedirects:true,muteHttpExceptions:true}),raw=response.getContentText();
    httpStatus=response.getResponseCode();if(httpStatus!==200)fail('VENUES_HTTP_ERROR');
    stage='response';if(raw.length>2000000)fail('VENUES_RESPONSE_TOO_LARGE');
    let envelope;try{envelope=JSON.parse(raw);}catch(_){fail('VENUES_RESPONSE_INVALID');}
    if(envelope&&envelope.ok===false){
      stage='source';
      const safeCodes=['SETUP_REQUIRED','INVALID_SIGNATURE','EXPIRED_REQUEST','GSIS_SECRET_INVALID','FORBIDDEN','IDENTITY_CHANGED','REGISTER_SETUP_REQUIRED','REGISTER_INVALID','CATALOGUE_UNVERIFIED','COMMIT_UNCERTAIN'];
      fail(safeCodes.includes(envelope.code)?envelope.code:'VENUES_SOURCE_UNAVAILABLE');
    }
    const value=envelope&&envelope.ok===true&&envelope.data;
    stage='catalogue';if(!value||!Array.isArray(value.venues)||value.venues.length>10000)fail('VENUES_CATALOGUE_INVALID');
    const ids=new Set(),venues=value.venues.map(v=>{
      if(!v||typeof v.id!=='string'||!v.id||v.id.length>200||ids.has(v.id)||typeof v.unit!=='string'||!v.unit||v.unit.length>200||typeof v.name!=='string'||!v.name||v.name.length>300||v.active!==true||!Array.isArray(v.aliases)||v.aliases.length>100||v.aliases.some(a=>typeof a!=='string'||a.length>300))fail('VENUES_CATALOGUE_INVALID');
      ids.add(v.id);return {id:v.id,unit:v.unit,name:v.name,aliases:v.aliases,active:true};
    });
    io.venueDiagnostic={status:'ready',code:'READY',stage:'catalogue',venueCount:venues.length,message:'School venue lookup is available. Selecting a venue does not reserve it.'};
    return io.venueCatalogue={venues:venues,venueSource:{status:'ready'}};
  }catch(error){
    const code=error.venueCode||(error.code==='GSIS_SECRET_INVALID'?'GSIS_SECRET_INVALID':stage==='transport'?'VENUES_TRANSPORT_FAILED':'VENUES_SOURCE_UNAVAILABLE');
    io.venueDiagnostic={status:'unavailable',code:code,stage:stage,message:calendarVenueDiagnosticMessage_(code),...(Number.isInteger(httpStatus)?{httpStatus:httpStatus}:{})};
    return io.venueCatalogue=unavailable;
  }
}
function calendarVenueDiagnosticMessage_(code){
  const messages={
    VENUES_URL_MISSING:'Set VENUES_APPS_SCRIPT_URL in Calendar Script Properties to the existing Venues deployment /exec URL.',
    VENUES_URL_INVALID:'Check VENUES_APPS_SCRIPT_URL: use the existing script.google.com/macros/s/.../exec deployment URL.',
    VENUES_SECRET_MISSING:'Configure the shared GSIS_SECRET on Calendar and Venues. Do not paste the key into a diagnostic.',
    GSIS_SECRET_INVALID:'Check GSIS_SECRET on Calendar and Venues: 32 to 8000 printable ASCII characters, without spaces.',
    INVALID_SIGNATURE:'Calendar and Venues could not verify the shared signing key. Check their GSIS_SECRET values privately.',
    REGISTER_SETUP_REQUIRED:'Check the Venues workbook and its shared Venues tab.',
    REGISTER_INVALID:'Review the Venues register headings, room units and required values.',
    CATALOGUE_UNVERIFIED:'Refresh Venues sources to reconcile the room register with its saved venue identities.',
    IDENTITY_CHANGED:'Staff identity changed during this lookup. Check status again.',
    FORBIDDEN:'Check current staff access in Contacts and Venues.',
    COMMIT_UNCERTAIN:'Review the unresolved Venues save before retrying the lookup.',
    EXPIRED_REQUEST:'Check the signed request timing and retry the lookup.',
    SETUP_REQUIRED:'Check the existing Venues backend configuration and shared signing key.',
    VENUES_HTTP_ERROR:'Check the Venues deployment URL and web-app access settings.',
    VENUES_RESPONSE_INVALID:'The venue endpoint did not return the expected JSON. Check its deployment and web-app access settings.',
    VENUES_RESPONSE_TOO_LARGE:'The venue catalogue response exceeded its size limit.',
    VENUES_CATALOGUE_INVALID:'Redeploy the matching Calendar and Venues backends, then check the current room register.',
    VENUES_TRANSPORT_FAILED:'Calendar could not reach the venue endpoint. Check the deployment and try again.'
  };
  return messages[code]||'The venue source could not be verified. Check Venues system status; custom location text remains usable.';
}
// Called only from the existing administrator health-check response. Never
// return endpoint URLs, credentials, staff records or raw provider errors.
function calendarVenueDirectoryStatus_(actor){
  calendarVenueCatalogue_(actor);
  return rc18IO_().venueDiagnostic||{status:'unavailable',code:'VENUES_SOURCE_UNAVAILABLE',message:calendarVenueDiagnosticMessage_('VENUES_SOURCE_UNAVAILABLE')};
}
function calendarValidateVenue_(event,before){
  const supplied=Object.prototype.hasOwnProperty.call(event,'VenueID');
  const id=String(supplied?event.VenueID||'':before&&String(before.Location||'').trim()===event.Location?before.VenueID||'':'').trim();
  if(!id)return '';
  const ids=id.split(',').map(value=>value.trim());
  if(ids.length>6||ids.some(value=>!value)||new Set(ids).size!==ids.length)throw mutationError_('VENUE_NOT_VALIDATED','Choose up to six different venues.',409,true);
  const unchanged=before&&String(before.VenueID||'')===id&&String(before.Location||'').trim()===event.Location;
  const directory=rc18IO_().venueCatalogue;
  // Preserve historical selections during an outage, but validate every id
  // whenever the current catalogue is available, including unchanged edits.
  if(unchanged&&(!directory||directory.venueSource.status!=='ready'))return ids.join(',');
  const venues=ids.map(value=>directory&&directory.venueSource.status==='ready'&&directory.venues.find(v=>v.id===value));
  if(venues.every(Boolean)){
    if(unchanged)return ids.join(',');
    const escape=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const labels=venues.map(v=>'(?:'+[v.unit+' '+v.name,v.name+' ('+v.unit+')',v.name,v.unit].concat(v.aliases||[]).map(escape).join('|')+')');
    // Location stores chip labels, with at most one free-text chip anywhere.
    for(let custom=-1;custom<=labels.length;custom++){
      if(custom>=0&&ids.length>=6)continue;
      const parts=labels.slice();if(custom>=0)parts.splice(custom,0,'.+');
      if(new RegExp('^'+parts.join(', ')+'$').test(event.Location))return ids.join(',');
    }
  }
  if(ids.length===1&&before&&String(before.VenueID||'')===id&&venues.every(Boolean))return ''; // legacy edit into custom text
  throw mutationError_('VENUE_NOT_VALIDATED','Choose current venue directory results, or keep this as custom location text.',409,true);
}

/* GSIS_CALENDAR_VENUE_DIRECTORY_END */

/* GSIS_CALENDAR_CHANGE_AWARENESS_BEGIN */
/* Read-only change subscriptions and bounded source delta. Cloudflare journals
 * are hints; Google-backed roles and current source rows decide every read. */
function calendarChangesAuthorize_(actor,payload){
 const year=Number(payload.year);
 if(!Number.isInteger(year)||year<2000||year>2099)throw mutationError_('CHANGE_INPUT','Choose a valid Calendar year.',400,true);
 const roles=rolesFor_(actor.userAlias,true);
 rc18InvalidateIO_(CALV2.SHEETS.YEARS);
 const years=tableObjects_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.YEARS));
 const selected=years.find(row=>Number(row.Year)===year);
 if(!selected||!roles.isAdmin&&!roles.isParentPublisher&&(!yes_(selected.ReleasedToTeachers)||String(selected.Status||'').toUpperCase()==='ARCHIVED'))throw mutationError_('YEAR_UNAVAILABLE','That year is not available to your account.',403,true);
 return {authorized:true,year:year,roles:roles};
}
function apiCalendarChangesDelta_(actor,payload){
 if(!payload||Object.keys(payload).some(key=>!['year','known'].includes(key))||!Array.isArray(payload.known)||payload.known.length>2000)throw mutationError_('CHANGE_INPUT','A bounded Calendar source revision list is required.',400,true);
 const known={};
 payload.known.forEach(row=>{
  if(!row||Object.keys(row).some(key=>!['id','revision'].includes(key))||typeof row.id!=='string'||!row.id||row.id.length>150||typeof row.revision!=='string'||row.revision.length>128||Object.prototype.hasOwnProperty.call(known,row.id))throw mutationError_('CHANGE_INPUT','Calendar row revision input is invalid.',400,true);
  Object.defineProperty(known,row.id,{value:row.revision,enumerable:true});
 });
 const priorNative=calendarNativeSourceReads_;calendarNativeSourceReads_=true;
 try{
  // Reset request-local snapshots before reading permissions and content. This
  // endpoint deliberately compares the current source; it never trusts a hint.
  rc18InvalidateIO_();
  const access=calendarChangesAuthorize_(actor,payload);
  const snapshot=apiBootstrap_(actor,access.roles,{year:access.year});
  const all=snapshot.events;
  if(all.length>2000)throw mutationError_('CHANGE_CAPACITY','This year exceeds the 2,000-event live-update limit. Use manual Refresh to load it.',413,true);
  const visible=new Set(all.map(row=>String(row.EventID)));
  const events=all.filter(row=>known[String(row.EventID)]!==(row._changeRevision||row._revision));
  const removed=Object.keys(known).filter(id=>!visible.has(id));
  delete snapshot.events;
  return {year:access.year,sourceRevision:sha256_(JSON.stringify({events:all.map(row=>[row.EventID,row._changeRevision||row._revision]),snapshot:snapshot})),events:events,removed:removed,snapshot:snapshot};
 }finally{calendarNativeSourceReads_=priorNative;}
}

/* GSIS_CALENDAR_CHANGE_AWARENESS_END */
