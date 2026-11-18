import defaults from "./defaults.mjs";
import { googleConfigured } from "../../runtime/google-drive-credential.mjs";
import { tableWorkbook, previewTableImport, applyTableImport } from "./table-import.mjs";
import {
  acquireSourcePin,
  releaseSourcePin,
  queueSourceChange,
  requestSourceCancellations,
  sourceChangeGuard,
  sourceChangeDone,
} from "../../runtime/admission.mjs";
import { ApiError } from "../../runtime/errors.mjs";
import {
  query,
  one,
  canonical,
  digest,
  prepareOperation,
  commitOperation,
  operationStatus,
} from "../../runtime/store.mjs";
import { admit, resolveAdmission } from "../../runtime/security.mjs";

const MAX_EVENTS = 5000,
  MAX_METADATA = 2000;
const READS = new Set([
  "bootstrap",
  "publication",
  "calendarChangesAuthorize",
  "calendarChangesDelta",
  "calendarPreflight",
  "healthCheck",
  "calendarReconciliationPreview",
  "runSelfTests",
  "calendarWipePreview",
  "archiveYearsPreview",
  "eventMutationStatus",
  "calendarSyncStatus",
  "syncYearBatch",
  "calendarWipeBatch",
  "mutationReceipts",
  "tableWorkbook",
  "tableImportPreview",
]);
const WRITES = new Set([
  "saveEvent",
  "deleteEvent",
  "saveParentSide",
  "relocateEvent",
  "saveTag",
  "deleteTag",
  "saveLane",
  "saveColourRule",
  "deleteColourRule",
  "reorderColourRules",
  "saveUser",
  "saveYear",
  "publishVersion",
  "savePublicHolidays",
  "generateYearStructure",
  "saveUrls",
  "clearStaleOperation",
  "startCalendarWipe",
  "archiveYearsCommit",
  "startSyncYear",
  "savePdf",
  "saveDayNote",
  "pullBirthdays",
  "tableImportApply",
]);
const EVENT_FIELDS = [
  "Year",
  "Status",
  "LaneID",
  "ShiftSpan",
  "OwnerTag",
  "StaffTitle",
  "StaffDescription",
  "Location",
  "EventType",
  "StartDate",
  "EndDate",
  "StartTime",
  "EndTime",
  "ParentEnabled",
  "ParentTitle",
  "ParentDescription",
  "VenueID",
  "Recurrence",
];
const PARENT_FIELDS = ["ParentEnabled", "ParentTitle", "ParentDescription"];
const META = {
  saveTag: ["tags", "Tag"],
  deleteTag: ["tags", "Tag"],
  saveLane: ["lanes", "LaneID"],
  saveColourRule: ["colourRules", "RuleID"],
  deleteColourRule: ["colourRules", "RuleID"],
  saveDayNote: ["dayNotes", "Date"],
};
const fail = (code, message, status = 400) => {
  throw new ApiError(code, status, message, {
    retryable: status === 409 || status === 503,
  });
};
const need = (yes, code, message, status = 400) => {
  if (!yes) fail(code, message, status);
};
const yes = (x) => x === true || String(x).toLowerCase() === "yes";
const parse = (row) =>
  row ? { ...JSON.parse(row.data_json), _revision: row.revision } : null;
const isAdmin = (p) =>
  p?.capabilities?.some((x) =>
    ["admin", "core.admin", "global.admin", "calendar.admin"].includes(x),
  );
const isParent = (p) =>
  isAdmin(p) || p?.capabilities?.includes("calendar.parent.edit");
const isoDate = (x) =>
  typeof x === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  Number.isFinite(Date.parse(x + "T00:00:00Z")) &&
  new Date(x + "T00:00:00Z").toISOString().slice(0, 10) === x;
const text = (x, max = 2000) => {
  need(
    typeof x === "string" && x.length <= max && !/[\u0000]/.test(x),
    "INVALID_TEXT",
    "Use bounded plain text.",
  );
  return x;
};
const id = (x) => {
  need(
    typeof x === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(x),
    "INVALID_ID",
    "A stable identifier is required.",
  );
  return x;
};
const year = (x) => {
  x = Number(x);
  need(
    Number.isInteger(x) && x >= 2000 && x <= 2200,
    "INVALID_YEAR",
    "Choose a supported school year.",
  );
  return x;
};
function unpack(ctx) {
  return ctx.body?.action
    ? {
        action: ctx.body.action,
        p: {
          ...(ctx.body.payload || {}),
          operationId: ctx.body.operationId || ctx.body.payload?.operationId,
        },
      }
    : { action: ctx.path.replace(/^\//, ""), p: ctx.body || {} };
}
export function policy(method, path, body = {}) {
  let action = body.action || path.replace(/^\//, "");
  if (path === "/archive-download")
    return { action: "calendar.admin", write: false, resourceId: "archives" };
  if (path === "/accounts")
    return { action: "calendar.admin", write: false, resourceId: "accounts" };
  if (path === "/dates" || path === "/rosterDates" || path === "/export")
    return { action: "calendar.read", write: false, resourceId: "dates" };
  if (action === "bootstrap")
    return {
      action: "calendar.read",
      write: false,
      resourceId: String(body.year || "calendar"),
    };
  if (action === "saveParentSide")
    return {
      action: "calendar.parent.edit",
      write: true,
      resourceId: String(body.payload?.eventId || body.eventId || "calendar"),
    };
  if (READS.has(action))
    return {
      action: ["calendarChangesAuthorize", "calendarChangesDelta"].includes(
        action,
      )
        ? "calendar.read"
        : "calendar.admin",
      write: false,
      resourceId: "calendar",
    };
  if (WRITES.has(action))
    return {
      action: "calendar.admin",
      write: true,
      resourceId: String(
        body.payload?.event?.EventID ||
          body.payload?.eventId ||
          body.eventId ||
          "calendar",
      ),
    };
  fail("NOT_FOUND", "Unknown Calendar operation.", 404);
}
function auth(ctx, action) {
  need(
    ctx.principal?.schoolId && ctx.principal?.actorId,
    "SESSION_INVALID",
    "Sign in to Calendar.",
    401,
  );
  if (WRITES.has(action)) {
    need(
      !ctx.principal.impersonating,
      "IMPERSONATION_DENIED",
      "Preview is read-only.",
      403,
    );
    need(
      action === "saveParentSide"
        ? isParent(ctx.principal)
        : isAdmin(ctx.principal),
      "CAPABILITY_DENIED",
      "Calendar permission required.",
      403,
    );
  } else {
    if (
      READS.has(action) &&
      ![
        "bootstrap",
        "calendarChangesAuthorize",
        "calendarChangesDelta",
      ].includes(action)
    )
      need(
        isAdmin(ctx.principal),
        "CAPABILITY_DENIED",
        "Calendar administrator required.",
        403,
      );
    need(
      isAdmin(ctx.principal) ||
        isParent(ctx.principal) ||
        ctx.principal.capabilities?.includes("calendar.read"),
      "CAPABILITY_DENIED",
      "Calendar access required.",
      403,
    );
  }
}
function guardRow(table, key, values, rev) {
  return {
    sql: `SELECT ${rev === 0 ? "NOT " : ""}EXISTS(SELECT 1 FROM ${table} WHERE ${key}${rev === 0 ? "" : " AND revision=?"}) AS ok`,
    args: rev === 0 ? values : [...values, rev],
  };
}
function eventWrite(s, e, revision) {
  return {
    sql: `INSERT INTO calendar_events(school_id,event_id,year,revision,status,start_date,end_date,deleted_at,data_json) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(school_id,event_id) DO UPDATE SET year=excluded.year,revision=excluded.revision,status=excluded.status,start_date=excluded.start_date,end_date=excluded.end_date,deleted_at=excluded.deleted_at,data_json=excluded.data_json`,
    args: [
      s,
      e.EventID,
      e.Year,
      revision,
      e.Status,
      e.StartDate,
      e.EndDate,
      e.DeletedAt || null,
      canonical(e),
    ],
  };
}
async function metaToken(row) {
  return row ? digest(JSON.parse(row.data_json)) : "missing";
}
async function checkRevision(p, row) {
  if (p.expectedMetadataRevision !== undefined)
    need(
      p.expectedMetadataRevision === (await metaToken(row)),
      "METADATA_CONFLICT",
      "This record changed. Your draft is retained.",
      409,
    );
  else
    need(
      Number(p.revision ?? p.expectedRevision ?? 0) === (row?.revision || 0),
      "REVISION_CONFLICT",
      "This record changed. Reload before saving.",
      409,
    );
}
async function start(ctx, action, p) {
  id(p.operationId);
  return prepareOperation(ctx.env.DB, {
    schoolId: ctx.principal.schoolId,
    actorId: ctx.principal.actorId,
    operationId: p.operationId,
    action: `calendar.${action}`,
    intent: {
      action,
      payload: Object.fromEntries(
        Object.entries(p).filter(([k]) => !["requestId"].includes(k)),
      ),
    },
    now: ctx.now,
    validUntil: ctx.principal.validUntil,
    authorization: ctx.principal,
  });
}
async function finish(ctx, op, guards, writes, result, outbox = [], includeReceipt = false) {
  await protectCalendarChanges(ctx.env, op, guards, writes, ctx.now);
  const admission = await admit(
    ctx.env,
    ctx.env.DB,
    op,
    ctx.principal,
    [],
    ctx.now,
  );
  const receipt = await commitOperation(ctx.env.DB, op, {
    now: ctx.now,
    validUntil: ctx.principal.validUntil,
    guards,
    writes,
    result,
    audit: { decisionId: ctx.principal.decisionId, action: op.action },
    outbox,
    admission,
  });
  await resolveAdmission(ctx.env, ctx.env.DB, op, admission, receipt, ctx.now);
  return includeReceipt ? { ...receipt.result, receipt } : receipt.result ?? result;
}
function validateEvent(input, old, now, actor) {
  const e = { ...old };
  for (const k of EVENT_FIELDS)
    if (Object.hasOwn(input, k)) e[k] = structuredClone(input[k]);
  e.Year = year(e.Year);
  for (const k of [
    "StaffTitle",
    "StaffDescription",
    "Location",
    "ParentTitle",
    "ParentDescription",
    "OwnerTag",
    "LaneID",
    "ShiftSpan",
    "VenueID",
  ])
    e[k] = text(e[k] || "", k.endsWith("Description") ? 10000 : 1000);
  need(e.StaffTitle.trim(), "TITLE_REQUIRED", "An event title is required.");
  need(
    isoDate(e.StartDate) &&
      isoDate(e.EndDate) &&
      e.EndDate >= e.StartDate &&
      Number(e.StartDate.slice(0, 4)) === e.Year &&
      Number(e.EndDate.slice(0, 4)) === e.Year,
    "INVALID_DATE",
    "Use an ordered date range in the selected year.",
  );
  e.Status = String(e.Status || "HIDDEN").toUpperCase();
  need(
    ["HIDDEN", "PUBLISHED", "DRAFT"].includes(e.Status),
    "INVALID_STATE",
    "Choose draft or published state.",
  );
  e.EventType = String(e.EventType || "ALL_DAY").toUpperCase();
  need(
    ["ALL_DAY", "TIMED", "MULTI_DAY"].includes(e.EventType),
    "INVALID_EVENT_TYPE",
    "Choose all-day, multi-day or timed.",
  );
  if (e.EventType === "TIMED") {
    need(
      /^([01]\d|2[0-3]):[0-5]\d$/.test(e.StartTime) &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(e.EndTime),
      "INVALID_TIME",
      "Set valid event times.",
    );
    need(
      e.EndDate > e.StartDate || e.EndTime > e.StartTime,
      "INVALID_TIME",
      "Event end must follow its start.",
    );
  } else {
    e.StartTime = "";
    e.EndTime = "";
  }
  e.ParentEnabled = yes(e.ParentEnabled) ? "Yes" : "No";
  if (e.Recurrence !== undefined && e.Recurrence !== null) {
    need(
      Array.isArray(e.Recurrence) &&
        e.Recurrence.length <= 10 &&
        e.Recurrence.every(
          (r) =>
            typeof r === "string" &&
            r.length <= 512 &&
            /^RRULE:(FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY);?)/.test(r) &&
            !/[\r\n]/.test(r),
        ),
      "INVALID_RECURRENCE",
      "Use bounded recurrence rules.",
    );
  }
  e.UpdatedAt = new Date(now).toISOString();
  e.UpdatedBy = actor;
  return e;
}
async function eventMutation(ctx, op, action, p) {
  const s = ctx.principal.schoolId,
    db = ctx.env.DB;
  let eid = p.eventId || p.event?.EventID;
  const copy = action === "relocateEvent" && p.mode === "copy";
  const row = eid
    ? await one(
        db,
        "SELECT * FROM calendar_events WHERE school_id=? AND event_id=?",
        [s, id(eid)],
      )
    : null;
  need(!eid || row, "NOT_FOUND", "Event not found.", 404);
  const old = parse(row);
  if (row)
    need(
      Number(p.expectedRevision ?? p.revision) == row.revision,
      "REVISION_CONFLICT",
      "A colleague changed this event. Your draft is retained.",
      409,
    );
  let e;
  if (action === "deleteEvent") {
    need(old && !old.DeletedAt, "NOT_FOUND", "Event already removed.", 404);
    e = {
      ...old,
      DeletedAt: new Date(ctx.now).toISOString(),
      UpdatedAt: new Date(ctx.now).toISOString(),
    };
  } else if (action === "saveParentSide") {
    need(old && !old.DeletedAt, "NOT_FOUND", "Event not found.", 404);
    need(
      Object.keys(p).every(
        (k) =>
          PARENT_FIELDS.includes(k) ||
          [
            "eventId",
            "operationId",
            "expectedRevision",
            "revision",
            "requestId",
          ].includes(k),
      ),
      "FIELD_DENIED",
      "Parent Publisher can edit parent fields only.",
      403,
    );
    e = {
      ...old,
      ...Object.fromEntries(
        PARENT_FIELDS.filter((k) => Object.hasOwn(p, k)).map((k) => [
          k,
          k === "ParentEnabled"
            ? yes(p[k])
              ? "Yes"
              : "No"
            : text(p[k], 10000),
        ]),
      ),
      UpdatedAt: new Date(ctx.now).toISOString(),
    };
  } else if (action === "relocateEvent") {
    need(old && !old.DeletedAt, "NOT_FOUND", "Event not found.", 404);
    need(
      isoDate(p.targetDate) && isoDate(p.anchorDate || old.StartDate),
      "INVALID_DATE",
      "Choose a valid destination.",
    );
    const delta =
      Date.parse(p.targetDate) - Date.parse(p.anchorDate || old.StartDate);
    e = validateEvent(
      {
        ...old,
        Year: p.year || old.Year,
        StartDate: new Date(Date.parse(old.StartDate) + delta)
          .toISOString()
          .slice(0, 10),
        EndDate: new Date(Date.parse(old.EndDate) + delta)
          .toISOString()
          .slice(0, 10),
        ...(copy ? { Status: "HIDDEN", ParentEnabled: "No" } : {}),
      },
      old,
      ctx.now,
      ctx.principal.actorId,
    );
  } else e = validateEvent(p.event || p, old, ctx.now, ctx.principal.actorId);
  if (!row || copy) {
    e.EventID = crypto.randomUUID();
    e.CreatedAt = new Date(ctx.now).toISOString();
    e.CreatedBy = ctx.principal.actorId;
    e.DeletedAt = "";
  }
  delete e._revision;
  if (e.VenueID) {
    const { serviceCall } = await import("../../runtime/security.mjs");
    const catalogue = await serviceCall(
      ctx.env,
      "venues",
      "/internal/catalogue",
      {
        schoolId: s,
        decisionId: ctx.principal.decisionId,
        purpose: "calendar",
      },
    );
    need(
      catalogue.venues?.some((v) => v.id === e.VenueID),
      "INVALID_VENUE",
      "Select a current venue from the room directory.",
      409,
    );
  }
  const y = await one(
    db,
    "SELECT * FROM calendar_years WHERE school_id=? AND year=?",
    [s, e.Year],
  );
  need(
    y && y.status !== "ARCHIVED",
    "YEAR_UNAVAILABLE",
    "Create an active school year first.",
    409,
  );
  const guards = [
    {
      sql: "SELECT EXISTS(SELECT 1 FROM calendar_years WHERE school_id=? AND year=? AND status<>'ARCHIVED') AS ok",
      args: [s, e.Year],
    },
    guardRow(
      "calendar_events",
      "school_id=? AND event_id=?",
      [s, e.EventID],
      copy ? 0 : row?.revision || 0,
    ),
  ];
  if (copy)
    guards.push(
      guardRow(
        "calendar_events",
        "school_id=? AND event_id=?",
        [s, old.EventID],
        row.revision,
      ),
    );
  const revision = copy ? 1 : (row?.revision || 0) + 1;
  const writes = [
    eventWrite(s, e, revision),
    {
      sql: "UPDATE calendar_years SET revision=revision+1 WHERE school_id=? AND year=?",
      args: [s, e.Year],
    },
  ];
  const outbox = await syncIntents(ctx, e, revision, writes);
  return finish(
    ctx,
    op,
    guards,
    writes,
    {
      ...e,
      _revision: revision,
      event: { ...e, _revision: revision },
      eventId: e.EventID,
      revision,
    },
    outbox,
  );
}
async function syncIntents(
  ctx,
  e,
  revision,
  writes,
  targets = ["staff", "parent"],
) {
  const s = ctx.principal.schoolId,
    out = [];
  for (const target of targets) {
    const linked = await one(
      ctx.env.DB,
      "SELECT * FROM calendar_sync WHERE school_id=? AND target=? AND event_id=?",
      [s, target, e.EventID],
    );
    const lane = await one(
      ctx.env.DB,
      "SELECT data_json,revision FROM calendar_metadata WHERE school_id=? AND kind='lanes' AND record_id=?",
      [s, e.LaneID],
    );
    const staffLaneEnabled =
      lane &&
      yes(JSON.parse(lane.data_json).Active) &&
      yes(JSON.parse(lane.data_json).SyncToStaffCalendar);
    const tombstone =
      !!e.DeletedAt ||
      e.Status !== "PUBLISHED" ||
      (target === "parent" && !yes(e.ParentEnabled)) ||
      (target === "staff" && !staffLaneEnabled);
    if (tombstone && !linked) continue;
    if (
      linked?.desired_revision === revision &&
      linked.tombstone === Number(tombstone) &&
      ["accepted", "delivered"].includes(linked.state)
    )
      continue;
    const remoteId =
      linked?.remote_id ||
      "g" + (await digest({ s, target, eventId: e.EventID })).slice(0, 48);
    const intentId = `calendar:${e.EventID}:${target}:${revision}`;
    writes.push({
      sql: "INSERT INTO calendar_sync(school_id,target,event_id,desired_revision,state,remote_id,intent_id,tombstone,next_at,data_json) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(school_id,target,event_id) DO UPDATE SET desired_revision=excluded.desired_revision,state=excluded.state,intent_id=excluded.intent_id,tombstone=excluded.tombstone,next_at=excluded.next_at,data_json=excluded.data_json",
      args: [
        s,
        target,
        e.EventID,
        revision,
        "queued",
        remoteId,
        intentId,
        Number(tombstone),
        ctx.now,
        canonical({
          ...(linked ? JSON.parse(linked.data_json) : {}),
          revision,
          eventId: e.EventID,
          target,
        }),
      ],
    });
    out.push({
      id: intentId,
      type: "calendar.sync",
      payload: {
        schoolId: s,
        decisionId: ctx.principal.decisionId,
        actorId: ctx.principal.actorId,
        target,
        eventId: e.EventID,
        revision,
        remoteId,
        tombstone,
      },
      dueAt: ctx.now,
    });
  }
  return out;
}
async function metadataPlan(ctx, op, action, p, observed = {}) {
  const s = ctx.principal.schoolId,
    db = ctx.env.DB;
  let [kind, key] = META[action],
    recordId = String(p[key] || p.record?.[key] || "");
  if (action === "saveDayNote") {
    recordId = `${year(p.year)}:${p.date}`;
    need(isoDate(p.date), "INVALID_DATE", "Use a valid note date.");
  }
  if (!recordId && action === "saveColourRule") recordId = crypto.randomUUID();
  if (kind === "tags") {
    recordId = recordId.replace(/^\[|\]$/g, "").toLowerCase();
  }
  id(recordId);
  const row = Object.hasOwn(observed, 'row') ? observed.row : await one(
    db,
    "SELECT * FROM calendar_metadata WHERE school_id=? AND kind=? AND record_id=?",
    [s, kind, recordId],
  );
  await checkRevision(p, row);
  const guard = guardRow(
    "calendar_metadata",
    "school_id=? AND kind=? AND record_id=?",
    [s, kind, recordId],
    row?.revision || 0,
  );
  let value = {
    ...(row ? JSON.parse(row.data_json) : {}),
    ...Object.fromEntries(
      Object.entries(p).filter(
        ([k]) =>
          ![
            "operationId",
            "expectedMetadataRevision",
            "revision",
            "expectedRevision",
            "requestId",
          ].includes(k),
      ),
    ),
    [key]: p[key] || recordId,
  };
  if (kind === "dayNotes")
    Object.assign(value, {
      Year: year(p.year || p.Year),
      Date: p.date || p.Date,
      Text: text(p.text ?? p.Text ?? "", 2000),
    });
  need(
    canonical(value).length <= 32768,
    "PAYLOAD_TOO_LARGE",
    "Metadata record exceeds its limit.",
    413,
  );
  if (kind === "lanes")
    need(
      /^[a-z][a-z0-9_]{0,80}$/.test(recordId),
      "INVALID_LANE",
      "Use a stable lower-case column identifier.",
    );
  if (kind === "colourRules") {
    for (const k of ["FillColour", "TextColour", "BorderColour"])
      if (value[k])
        need(
          /^#[0-9a-f]{6}$/i.test(value[k]),
          "INVALID_COLOUR",
          "Use a six-digit colour.",
        );
  }
  const revision = (row?.revision || 0) + 1;
  const deleted = action.startsWith("delete");
  const write = deleted
    ? {
        sql: "DELETE FROM calendar_metadata WHERE school_id=? AND kind=? AND record_id=?",
        args: [s, kind, recordId],
      }
    : {
        sql: "INSERT INTO calendar_metadata(school_id,kind,record_id,year,revision,data_json) VALUES(?,?,?,?,?,?) ON CONFLICT(school_id,kind,record_id) DO UPDATE SET year=excluded.year,revision=excluded.revision,data_json=excluded.data_json",
        args: [
          s,
          kind,
          recordId,
          Number(p.year || p.Year || 0),
          revision,
          canonical(value),
        ],
      };
  const guards = [guard],
    outbox = [];
  if (kind === "lanes") {
    guards.push({
      sql: "SELECT NOT EXISTS(SELECT 1 FROM calendar_dispatch_locks l JOIN calendar_events e ON e.school_id=l.school_id AND e.event_id=l.event_id WHERE l.school_id=? AND json_extract(e.data_json,'$.LaneID')=?) AS ok",
      args: [s, recordId],
    });
    const years = observed.years || await query(
      db,
      "SELECT year FROM calendar_years WHERE school_id=? AND released=1 AND status<>'ARCHIVED' LIMIT 202",
      [s],
    );
    // The sync jobs and metadata write must cover the same complete released
    // year set. A release/archive between planning and commit invalidates both.
    guards.push({
      sql: "SELECT json_group_array(year)=? AS ok FROM (SELECT year FROM calendar_years WHERE school_id=? AND released=1 AND status<>'ARCHIVED' ORDER BY year)",
      args: [canonical(years.map(row => row.year).sort((a,b) => a-b)), s],
    });
    for (const y of years)
      outbox.push({
        id: `calendar-lane:${op.operationId}:${y.year}`,
        type: "calendar.sync-year",
        dueAt: ctx.now,
        payload: {
          schoolId: s,
          year: y.year,
          target: "staff",
          decisionId: ctx.principal.decisionId,
        },
      });
  }
  return {
    guards, writes: [write],
    result: {
      ...value, _revision: revision, deleted,
      metadataRevision: deleted ? "missing" : await digest(value),
      _metadataRevision: deleted ? "missing" : await digest(value),
    }, outbox,
  };
}
async function metadataMutation(ctx, op, action, p) {
  const plan = await metadataPlan(ctx, op, action, p);
  return finish(ctx, op, plan.guards, plan.writes, plan.result, plan.outbox);
}

async function bootstrap(ctx, p) {
  const db = ctx.env.DB,
    s = ctx.principal.schoolId;
  const allYears = await query(
    db,
    "SELECT * FROM calendar_years WHERE school_id=? ORDER BY year DESC LIMIT 202",
    [s],
  );
  need(
    allYears.length <= 201,
    "BOUNDS_EXCEEDED",
    "Too many configured years.",
    413,
  );
  const years = allYears.filter(
    (r) => isParent(ctx.principal) || (r.released && r.status !== "ARCHIVED"),
  );
  const y = Number(p.year || years[0]?.year || 0);
  need(
    !y || years.some((r) => r.year === y),
    "YEAR_UNAVAILABLE",
    "That year is not available to your account.",
    403,
  );
  const rows = y
    ? await query(
        db,
        "SELECT * FROM calendar_events WHERE school_id=? AND year=? ORDER BY start_date,event_id LIMIT ?",
        [s, y, MAX_EVENTS + 1],
      )
    : [];
  need(
    rows.length <= MAX_EVENTS,
    "BOUNDS_EXCEEDED",
    "Use a narrower Calendar range.",
    413,
  );
  const metadata = await query(
    db,
    "SELECT * FROM calendar_metadata WHERE school_id=? AND (year=0 OR year=?) ORDER BY kind,record_id LIMIT ?",
    [s, y, MAX_METADATA + 1],
  );
  need(
    metadata.length <= MAX_METADATA,
    "BOUNDS_EXCEEDED",
    "Calendar metadata exceeds its supported bound.",
    413,
  );
  const group = (k) => metadata.filter((r) => r.kind === k).map(parse),
    events = rows
      .filter(
        (r) =>
          !r.deleted_at &&
          (isParent(ctx.principal) || r.status === "PUBLISHED"),
      )
      .map(parse);
  const tokens = {
    years: {},
    tags: {},
    lanes: {},
    colourRules: {},
    users: {},
    dayNotes: {},
  };
  for (const r of years) tokens.years[String(r.year)] = await metaToken(r);
  for (const r of metadata)
    if (tokens[r.kind]) tokens[r.kind][r.record_id] = await metaToken(r);
  let venues = [],
    venueSource = {
      status: "unavailable",
      message: "Venue directory could not be verified.",
    };
  if (ctx.env.VENUES) {
    try {
      const { serviceCall } = await import("../../runtime/security.mjs");
      const catalogue = await serviceCall(
        ctx.env,
        "venues",
        "/internal/catalogue",
        {
          schoolId: s,
          decisionId: ctx.principal.decisionId,
          purpose: "calendar",
        },
      );
      venues = catalogue.venues;
      venueSource = { status: "ready", checkedAt: catalogue.asOf };
    } catch {}
  }
  let people = [];
  if (isAdmin(ctx.principal) && ctx.env.CORE) {
    try {
      const { serviceCall } = await import("../../runtime/security.mjs");
      const accounts = await serviceCall(
        ctx.env,
        "core",
        "/internal/accounts",
        {
          schoolId: s,
          decisionId: ctx.principal.decisionId,
          module: "calendar",
        },
      );
      people = (accounts.rows || []).map((a) => ({
        userAlias: a.accountId,
        accountId: a.accountId,
        staffId: a.staffId,
        displayName: a.displayName || a.email,
        revision: a.revision,
        isAdmin: a.capabilities?.includes("calendar.admin") || false,
        isParentPublisher:
          a.capabilities?.includes("calendar.parent.edit") || false,
        active: a.capabilities?.some((c) => c.startsWith("calendar.")) || false,
      }));
    } catch {}
  }
  const yr = years.find((r) => r.year === y);
  tokens.structure = await structureToken(yr, group("yearStructure"),
    parse(metadata.find((r) => r.kind === "yearStructureGenerator" && r.record_id === String(y))), rows);
  tokens.holidays = await digest({
    year: yr ? JSON.parse(yr.data_json) : null,
    holidays: events.filter((e) => e.OwnerTag === "hol"),
  });
  tokens.rules = tokens.colourRules;
  tokens.notes = Object.fromEntries(
    Object.entries(tokens.dayNotes).map(([k, v]) => [k.split(":").at(-1), v]),
  );
  const settings = group("settings")[0] || {};
  tokens.urls = await digest(settings);
  tokens.ruleOrder = tokens.colourRuleOrder = await digest(
    group("colourRules")
      .map((r) => ({ RuleID: r.RuleID, Priority: r.Priority || 0 }))
      .sort((a, b) => a.RuleID.localeCompare(b.RuleID)),
  );
  return {
    version: "1.0",
    schemaVersion: 1,
    actor: {
      userAlias: ctx.principal.actorId,
      displayName: ctx.principal.displayName || ctx.principal.actorId,
      isAdmin: isAdmin(ctx.principal),
      isParentPublisher: isParent(ctx.principal),
    },
    years: years.map(parse),
    selectedYear: y,
    events,
    yearStructure: group("yearStructure"),
    dayNotes: group("dayNotes"),
    lanes: group("lanes").filter((r) => yes(r.Active)),
    tags: group("tags").filter((r) => yes(r.Active)),
    colourRules: group("colourRules"),
    people,
    ...(isAdmin(ctx.principal)
      ? {
          editableTags: group("tags"),
          editableLanes: group("lanes"),
          metadataRevisions: tokens,
          pendingBirthdays: await query(
            db,
            "SELECT event_id AS eventId,contacts_revision AS contactsRevision,deleted,data_json AS proposal FROM calendar_birthday_pending WHERE school_id=? AND year=? ORDER BY event_id LIMIT 513",
            [s, y],
          ),
        }
      : {}),
    pendingRemovals: isAdmin(ctx.principal)
      ? rows
          .filter((r) => r.deleted_at)
          .map((r) => ({ eventId: r.event_id, staff: true, parent: true }))
      : [],
    mutationFailures: [],
    sources: {
      moeCalendar: settings.MOE_CALENDAR_URL || "",
      muisCalendar: settings.MUIS_CALENDAR_URL || "",
    },
    urls: {
      staffCalendar: settings.staffCalendarUrl || "",
      parentCalendar: settings.parentCalendarUrl || "",
      staffCalendarId:
        settings.staffCalendarId || ctx.env.GOOGLE_STAFF_CALENDAR_ID || "",
      parentCalendarId:
        settings.parentCalendarId || ctx.env.GOOGLE_PARENT_CALENDAR_ID || "",
    },
    venueSource,
    venues,
    performance: {},
    revision: Math.max(
      0,
      ...years.map((r) => r.revision),
      ...rows.map((r) => r.revision),
    ),
  };
}
async function saveYear(ctx, op, p) {
  const s = ctx.principal.schoolId,
    y = year(p.Year),
    row = await one(
      ctx.env.DB,
      "SELECT * FROM calendar_years WHERE school_id=? AND year=?",
      [s, y],
    );
  await checkRevision(p, row);
  const value = {
    ...(row ? JSON.parse(row.data_json) : {}),
    Year: y,
    Status: String(p.Status || "PLANNING").toUpperCase(),
    ReleasedToTeachers: yes(p.ReleasedToTeachers) ? "Yes" : "No",
    RamadanStart: p.RamadanStart || "",
    RamadanEnd: p.RamadanEnd || "",
    UpdatedAt: new Date(ctx.now).toISOString(),
    UpdatedBy: ctx.principal.actorId,
  };
  need(
    ["PLANNING", "ACTIVE"].includes(value.Status),
    "INVALID_STATE",
    "Use the archive preview to archive a year.",
  );
  for (const k of ["RamadanStart", "RamadanEnd"])
    need(
      !value[k] || isoDate(value[k]),
      "INVALID_DATE",
      "Use valid Ramadan dates.",
    );
  need(
    !value.RamadanStart ||
      !value.RamadanEnd ||
      value.RamadanEnd >= value.RamadanStart,
    "INVALID_DATE",
    "Ramadan dates are reversed.",
  );
  const revision = (row?.revision || 0) + 1;
  const defaultsWrites = row ? [] : defaultWrites(s);
  return finish(
    ctx,
    op,
    [
      guardRow(
        "calendar_years",
        "school_id=? AND year=?",
        [s, y],
        row?.revision || 0,
      ),
    ],
    [
      {
        sql: "INSERT INTO calendar_years(school_id,year,revision,released,status,data_json) VALUES(?,?,?,?,?,?) ON CONFLICT(school_id,year) DO UPDATE SET revision=excluded.revision,released=excluded.released,status=excluded.status,data_json=excluded.data_json",
        args: [
          s,
          y,
          revision,
          Number(yes(value.ReleasedToTeachers)),
          value.Status,
          canonical(value),
        ],
      },
      ...defaultsWrites,
    ],
    { ...value, _revision: revision, metadataRevision: await digest(value) },
  );
}
async function publishYear(ctx, op, p) {
  const s = ctx.principal.schoolId,
    y = year(p.year || p.Year),
    row = await one(
      ctx.env.DB,
      "SELECT * FROM calendar_years WHERE school_id=? AND year=?",
      [s, y],
    );
  need(
    row && row.status !== "ARCHIVED",
    "YEAR_UNAVAILABLE",
    "School year unavailable.",
    409,
  );
  if (p.revision !== undefined) await checkRevision(p, row);
  const events = await query(
    ctx.env.DB,
    "SELECT * FROM calendar_events WHERE school_id=? AND year=? ORDER BY event_id LIMIT ?",
    [s, y, MAX_EVENTS + 1],
  );
  need(
    events.length <= MAX_EVENTS,
    "BOUNDS_EXCEEDED",
    "Publication exceeds the bounded event limit.",
    413,
  );
  const publicationId = crypto.randomUUID(),
    revision = row.revision + 1,
    value = {
      ...JSON.parse(row.data_json),
      ReleasedToTeachers: "Yes",
      UpdatedAt: new Date(ctx.now).toISOString(),
    },
    guards = [
      guardRow(
        "calendar_years",
        "school_id=? AND year=?",
        [s, y],
        row.revision,
      ),
    ],
    writes = [],
    outbox = [];
  writes.push({
    sql: "UPDATE calendar_events SET status='PUBLISHED',revision=revision+1,data_json=json_set(data_json,'$.Status','PUBLISHED') WHERE school_id=? AND year=? AND deleted_at IS NULL AND status<>'PUBLISHED'",
    args: [s, y],
  });
  const snapshot = {
    schemaVersion: 1,
    schoolId: s,
    year: y,
    publicationId,
    revision,
    events: events.map((r) => ({
      ...JSON.parse(r.data_json),
      ...(!r.deleted_at ? { Status: "PUBLISHED" } : {}),
    })),
    publishedAt: ctx.now,
  };
  const snapshotDigest = await digest(snapshot);
  let publicationRecord = snapshot;
  if (new TextEncoder().encode(canonical(snapshot)).byteLength > 1048576) {
    const content = canonical(snapshot);
    need(
      new TextEncoder().encode(content).byteLength <= 16 * 1024 * 1024,
      "PUBLICATION_BOUNDS",
      "Calendar publication exceeds 16 MiB.",
      413,
    );
    need(
      ctx.env.ARTIFACTS,
      "STORAGE_UNAVAILABLE",
      "Private publication storage unavailable.",
      503,
    );
    const artifactKey = `${s}/calendar/publications/${snapshotDigest}.json`;
    await ctx.env.ARTIFACTS.put(artifactKey, content, {
      httpMetadata: { contentType: "application/json" },
    });
    const stored = await ctx.env.ARTIFACTS.get(artifactKey);
    need(
      stored &&
        (await digest(JSON.parse(await stored.text()))) === snapshotDigest,
      "PUBLICATION_UNCONFIRMED",
      "Immutable publication storage could not be verified.",
      503,
    );
    publicationRecord = {
      schemaVersion: 1,
      schoolId: s,
      year: y,
      publicationId,
      revision,
      publishedAt: ctx.now,
      artifactKey,
      eventCount: snapshot.events.length,
    };
  }
  writes.push(
    {
      sql: "UPDATE calendar_years SET revision=?,released=1,data_json=? WHERE school_id=? AND year=?",
      args: [revision, canonical(value), s, y],
    },
    {
      sql: "INSERT INTO calendar_publications(school_id,publication_id,year,revision,created_at,digest,data_json) VALUES(?,?,?,?,?,?,?)",
      args: [
        s,
        publicationId,
        y,
        revision,
        ctx.now,
        snapshotDigest,
        canonical(publicationRecord),
      ],
    },
  );
  outbox.push({
    id: `calendar-publication:${publicationId}`,
    type: "calendar.sync-year",
    payload: {
      schoolId: s,
      year: y,
      publicationId,
      decisionId: ctx.principal.decisionId,
      actorId: ctx.principal.actorId,
    },
    dueAt: ctx.now,
  });
  return finish(
    ctx,
    op,
    guards,
    writes,
    {
      year: y,
      publicationId,
      published: events.filter((r) => !r.deleted_at).length,
      ReleasedToTeachers: "Yes",
      revision,
      sync: { state: "queued" },
    },
    outbox,
  );
}
async function dates(ctx, p) {
  const u = new URL(ctx.request.url),
    from = p.from || u.searchParams.get("from"),
    to = p.to || u.searchParams.get("to");
  need(
    isoDate(from) &&
      isoDate(to) &&
      to >= from &&
      (Date.parse(to) - Date.parse(from)) / 86400000 < 366,
    "INVALID_RANGE",
    "Use an ordered date range of at most 366 days.",
  );
  const s = ctx.principal.schoolId,
    years = await query(
      ctx.env.DB,
      "SELECT * FROM calendar_years WHERE school_id=? AND year BETWEEN ? AND ?",
      [s, Number(from.slice(0, 4)), Number(to.slice(0, 4))],
    );
  const meta = await query(
    ctx.env.DB,
    "SELECT * FROM calendar_metadata WHERE school_id=? AND kind='yearStructure' AND year BETWEEN ? AND ? LIMIT 1000",
    [s, Number(from.slice(0, 4)), Number(to.slice(0, 4))],
  );
  const holidays = await query(
    ctx.env.DB,
    "SELECT * FROM calendar_events WHERE school_id=? AND start_date<=? AND end_date>=? AND status='PUBLISHED' AND deleted_at IS NULL LIMIT ?",
    [s, to, from, MAX_EVENTS + 1],
  );
  need(
    holidays.length <= MAX_EVENTS,
    "BOUNDS_EXCEEDED",
    "Calendar date query exceeds its bound.",
    413,
  );
  const rows = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10),
      yr = years.find((r) => r.year === Number(d.slice(0, 4))),
      structures = meta.map(parse),
      term = structures.find(
        (r) => r.Kind === "TERM_WEEK" && r.StartDate <= d && r.EndDate >= d,
      ),
      holiday = holidays
        .map(parse)
        .some(
          (e) => e.OwnerTag === "hol" && e.StartDate <= d && e.EndDate >= d,
        ),
      weekday = new Date(t).getUTCDay(),
      available = !!yr?.released && yr.status !== "ARCHIVED";
    rows.push({
      date: d,
      available,
      schoolDay:
        available && !!term && weekday !== 0 && weekday !== 6 && !holiday,
      parity: term && Number(term.Week) > 0 ? (Number(term.Week) % 2 ? "odd" : "even") : null,
      term: term ? Number(term.Term) : null,
      week: term ? Number(term.Week) : null,
      revision: yr?.revision || 0,
    });
  }
  return {
    schemaVersion: 1,
    schoolId: s,
    rows,
    revision: await digest(rows),
    dependencies: Array.from(
      { length: Number(to.slice(0, 4)) - Number(from.slice(0, 4)) + 1 },
      (_, n) => Number(from.slice(0, 4)) + n,
    ).map((y) => ({
      owner: "calendar",
      scope: `year:${y}`,
      revision: String(years.find((r) => r.year === y)?.revision || 0),
    })),
    asOf: ctx.now,
  };
}
async function structureToken(row, structures, generation, events) {
  const ids = new Set((Array.isArray(generation?.entries) ? generation.entries : [])
    .map((entry) => entry?.eventId));
  return digest({
    year: row ? JSON.parse(row.data_json) : null,
    revision: row?.revision || 0,
    structure: structures,
    generation: generation || null,
    events: events.filter((event) => ids.has(event.event_id))
      .sort((a, b) => a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0).map((event) => ({
      id: event.event_id, revision: event.revision, data: event.data_json,
    })),
  });
}
function structurePlan(y, p) {
  const day = 86400000, key = (time) => new Date(time).toISOString().slice(0, 10);
  const monday = (time) => time + ((8 - new Date(time).getUTCDay()) % 7) * day;
  const vacations = [];
  for (let n = 1; n <= 4; n++) {
    const from = p[`Vacation${n}Start`], to = p[`Vacation${n}End`];
    need(isoDate(from) && isoDate(to) && from <= to && from.startsWith(String(y)) &&
      to.startsWith(String(y)) && (!vacations.length || from > vacations.at(-1).to),
    "INVALID_VACATIONS", "Set four ordered non-overlapping vacations.");
    vacations.push({ from, to });
  }
  const records = [], first = Date.parse(`${y}-01-01`), opening = monday(first);
  const week = (term, number, start, end) => ({
    StructureID: `${y}-T${term}-W${number}`, Year: y, Kind: "TERM_WEEK",
    Term: term, Week: number, Label: `T${term}W${number}`,
    StartDate: key(start), EndDate: key(end),
  });
  if (first < opening) records.push(week(1, 0, first, opening - day));
  for (let n = 1; n <= 4; n++) {
    const start = n === 1 ? opening : monday(Date.parse(vacations[n - 2].to) + day);
    for (let w = 1; w <= 10; w++) {
      const from = start + (w - 1) * 7 * day, to = from + 6 * day;
      need(from < Date.parse(vacations[n - 1].from) && key(to).startsWith(String(y)),
        "INVALID_VACATIONS", `Vacation after Term ${n} begins before its ten full weeks can be generated in this year.`);
      records.push(week(n, w, from, to));
    }
    records.push({ StructureID: `${y}-V${n}`, Year: y, Kind: "VACATION", Term: n,
      Week: 0, Label: `VAC_T${n}`, StartDate: vacations[n - 1].from, EndDate: vacations[n - 1].to });
  }
  return records;
}
function boundedGenerationJson(value) {
  const encoded = canonical(value);
  need(new TextEncoder().encode(encoded).length <= 1536 * 1024,
    "BOUNDS_EXCEEDED", "Year generation evidence exceeds its supported bound.", 413);
  return encoded;
}
async function structure(ctx, op, p) {
  const y = year(p.Year), s = ctx.principal.schoolId, db = ctx.env.DB;
  const row = await one(db, "SELECT * FROM calendar_years WHERE school_id=? AND year=?", [s, y]);
  need(row && row.status !== "ARCHIVED", "YEAR_UNAVAILABLE", "Create an active or planning year first.", 409);
  const previous = await query(db, "SELECT * FROM calendar_metadata WHERE school_id=? AND kind IN ('yearStructure','yearStructureGenerator') AND year=? ORDER BY kind,record_id LIMIT ?", [s, y, MAX_METADATA + 1]);
  const events = await query(db, "SELECT * FROM calendar_events WHERE school_id=? AND year=? ORDER BY event_id LIMIT ?", [s, y, MAX_EVENTS + 1]);
  need(previous.length <= MAX_METADATA && events.length <= MAX_EVENTS, "BOUNDS_EXCEEDED", "Year generation exceeds its supported bound.", 413);
  const provenance = previous.find((r) => r.kind === "yearStructureGenerator" && r.record_id === String(y));
  const generation = provenance ? JSON.parse(provenance.data_json) : null;
  need(p.expectedMetadataRevision === await structureToken(row,
    previous.filter((r) => r.kind === "yearStructure").map(parse), parse(provenance), events),
  "METADATA_CONFLICT", "Year structure or generated events changed. Reload the form.", 409);
  if (generation) {
    need(generation.schemaVersion === 1 && generation.year === y &&
      Array.isArray(generation.structureIds) && generation.structureIds.length <= 45 &&
      Array.isArray(generation.entries) && generation.entries.length === 44,
    "GENERATION_PROVENANCE_UNVERIFIED", "Existing generation ownership could not be verified.", 409);
    const original = await operationStatus(db, s, generation.operationId);
    need(original?.state === "committed" && original.action === "calendar.generateYearStructure" &&
      canonical(original.receipt?.result?.generation) === canonical(generation),
    "GENERATION_PROVENANCE_UNVERIFIED", "Existing generation ownership could not be verified.", 409);
  }
  const records = structurePlan(y, p), ownedStructures = new Set(generation?.structureIds || []);
  const desiredIds = new Set(records.map((record) => record.StructureID));
  const oldStructures = new Map(previous.filter((r) => r.kind === "yearStructure").map((r) => [r.record_id, r]));
  need([...ownedStructures].every((key) => oldStructures.has(key)) &&
    [...oldStructures].every(([key, value]) => ownedStructures.has(key) ||
      (!desiredIds.has(key) && !["TERM_WEEK", "VACATION"].includes(String(JSON.parse(value.data_json).Kind).toUpperCase()))),
  "GENERATION_CONTENT_CONFLICT", "Existing imported or manually maintained term/vacation structure is retained. Review it before generating this year.", 409);
  const ownedEvents = new Map((generation?.entries || []).map((entry) => [entry.structureId, entry]));
  const ownedEventIds = new Set([...ownedEvents.values()].map((entry) => entry.eventId));
  need(ownedEventIds.size === ownedEvents.size && (!generation || ownedEvents.size === 44),
    "GENERATION_PROVENANCE_UNVERIFIED", "Generation identities are ambiguous.", 409);
  need(events.every((event) => ownedEventIds.has(event.event_id) || event.deleted_at ||
    !String(JSON.parse(event.data_json).StaffDescription || "").includes("[[GSPS_YEAR_STRUCTURE:")),
  "GENERATION_CONTENT_CONFLICT", "Imported or manually maintained generated-event markers are retained. Review their ownership before generation.", 409);
  const eventRows = new Map(events.map((event) => [event.event_id, event]));
  const metadata = [], eventWrites = [], entries = [];
  for (const planned of records) {
    const oldRow = oldStructures.get(planned.StructureID), old = oldRow && JSON.parse(oldRow.data_json);
    const value = { ...old, ...planned, Label: old?.Label ?? planned.Label };
    metadata.push({ id: planned.StructureID, kind: "yearStructure", revision: oldRow ? oldRow.revision + Number(canonical(old) !== canonical(value)) : 1, data: canonical(value) });
    if (planned.Kind === "TERM_WEEK" && planned.Week === 0) continue;
    const entry = ownedEvents.get(planned.StructureID), oldEventRow = entry && eventRows.get(entry.eventId);
    need(!entry || (oldEventRow && !oldEventRow.deleted_at), "GENERATION_CONTENT_CONFLICT", "A generated event was removed. Its history is retained; review before regeneration.", 409);
    const oldEvent = oldEventRow && JSON.parse(oldEventRow.data_json);
    need(!oldEvent || (oldEvent.StartDate === entry.start && oldEvent.EndDate === entry.end),
      "GENERATION_CONTENT_CONFLICT", "A generated event's dates were edited independently. The edit is retained; review before regeneration.", 409);
    const marker = `[[GSPS_YEAR_STRUCTURE:${planned.Kind}:${planned.Label}]]`;
    const title = planned.Kind === "VACATION" ? ["Mar Hols", "Jun Hols", "Sep Hols", "Dec Hols"][planned.Term - 1] : planned.Label;
    const eventId = oldEventRow?.event_id || crypto.randomUUID();
    const changed = !oldEvent || oldEvent.StartDate !== planned.StartDate || oldEvent.EndDate !== planned.EndDate;
    const e = changed ? validateEvent({ ...(oldEvent || {
      Year: y, Status: row.status === "ACTIVE" ? "PUBLISHED" : "HIDDEN", LaneID: "day", ShiftSpan: "NONE",
      OwnerTag: planned.Kind === "VACATION" ? "hol" : "term", StaffTitle: title,
      StaffDescription: marker + "\nGenerated from Year Setup.", Location: "", VenueID: "",
      EventType: "MULTI_DAY", ParentEnabled: "No", ParentTitle: title, ParentDescription: "",
    }), StartDate: planned.StartDate, EndDate: planned.EndDate }, oldEvent, ctx.now, ctx.principal.actorId) : oldEvent;
    if (!oldEvent) Object.assign(e, { EventID: eventId, CreatedAt: new Date(ctx.now).toISOString(), CreatedBy: ctx.principal.actorId, DeletedAt: "" });
    if (changed) eventWrites.push({ id: eventId, revision: (oldEventRow?.revision || 0) + 1, data: canonical(e) });
    entries.push({ structureId: planned.StructureID, eventId, start: planned.StartDate, end: planned.EndDate });
  }
  const next = { schemaVersion: 1, year: y, operationId: op.operationId, structureIds: records.map((record) => record.StructureID), entries };
  metadata.push({ id: String(y), kind: "yearStructureGenerator", revision: (provenance?.revision || 0) + 1, data: canonical(next) });
  const addedEvents = eventWrites.filter((event) => !eventRows.has(event.id)).length;
  const existingMetadata = new Set(previous.map((record) => `${record.kind}:${record.record_id}`));
  const addedMetadata = metadata.filter((record) => !existingMetadata.has(`${record.kind}:${record.id}`)).length;
  const metadataCount = await one(db,
    "SELECT COUNT(*) AS n FROM calendar_metadata WHERE school_id=? AND (year=0 OR year=?)", [s, y]);
  need(events.length + addedEvents <= MAX_EVENTS && metadataCount.n + addedMetadata <= MAX_METADATA,
    "BOUNDS_EXCEEDED", "Generated records would exceed the Calendar view's supported bound.", 413);
  const expectedMetadata = boundedGenerationJson(previous.map((r) => ({ id: r.record_id, kind: r.kind, revision: r.revision, data: r.data_json })));
  const ids = boundedGenerationJson(entries.map((entry) => entry.eventId));
  const expectedEvents = boundedGenerationJson(events.filter((r) => ownedEventIds.has(r.event_id)).map((r) => ({ id: r.event_id, revision: r.revision, data: r.data_json })));
  const guards = [
    guardRow("calendar_years", "school_id=? AND year=?", [s, y], row.revision),
    { sql: "SELECT (SELECT COUNT(*) FROM calendar_events WHERE school_id=? AND year=?)+?<=? AND (SELECT COUNT(*) FROM calendar_metadata WHERE school_id=? AND (year=0 OR year=?))+?<=? AS ok", args: [s, y, addedEvents, MAX_EVENTS, s, y, addedMetadata, MAX_METADATA] },
    { sql: `WITH observed AS (SELECT * FROM calendar_metadata WHERE school_id=? AND year=? AND kind IN ('yearStructure','yearStructureGenerator')), expected AS (SELECT value FROM json_each(?)) SELECT (SELECT COUNT(*) FROM observed)=(SELECT COUNT(*) FROM expected) AND NOT EXISTS(SELECT 1 FROM observed r WHERE NOT EXISTS(SELECT 1 FROM expected e WHERE json_extract(e.value,'$.id')=r.record_id AND json_extract(e.value,'$.kind')=r.kind AND json_extract(e.value,'$.revision')=r.revision AND json_extract(e.value,'$.data')=r.data_json)) AS ok`, args: [s, y, expectedMetadata] },
    { sql: `WITH observed AS (SELECT * FROM calendar_events WHERE school_id=? AND year=? AND event_id IN(SELECT value FROM json_each(?))), expected AS (SELECT value FROM json_each(?)) SELECT (SELECT COUNT(*) FROM observed)=(SELECT COUNT(*) FROM expected) AND NOT EXISTS(SELECT 1 FROM observed r WHERE NOT EXISTS(SELECT 1 FROM expected e WHERE json_extract(e.value,'$.id')=r.event_id AND json_extract(e.value,'$.revision')=r.revision AND json_extract(e.value,'$.data')=r.data_json)) AS ok`, args: [s, y, ids, expectedEvents] },
    { sql: "SELECT NOT EXISTS(SELECT 1 FROM calendar_events WHERE school_id=? AND year=? AND deleted_at IS NULL AND instr(COALESCE(json_extract(data_json,'$.StaffDescription'),''),'[[GSPS_YEAR_STRUCTURE:')>0 AND event_id NOT IN(SELECT value FROM json_each(?))) AND NOT EXISTS(SELECT 1 FROM calendar_dispatch_locks WHERE school_id=? AND event_id IN(SELECT value FROM json_each(?))) AS ok", args: [s, y, ids, s, ids] },
  ];
  const writes = [
    { sql: "INSERT INTO calendar_metadata(school_id,kind,record_id,year,revision,data_json) SELECT ?,json_extract(value,'$.kind'),json_extract(value,'$.id'),?,json_extract(value,'$.revision'),json_extract(value,'$.data') FROM json_each(?) WHERE true ON CONFLICT(school_id,kind,record_id) DO UPDATE SET revision=excluded.revision,data_json=excluded.data_json", args: [s, y, boundedGenerationJson(metadata)] },
    { sql: "INSERT INTO calendar_events(school_id,event_id,year,revision,status,start_date,end_date,deleted_at,data_json) SELECT ?,json_extract(value,'$.id'),?,json_extract(value,'$.revision'),json_extract(value,'$.data.Status'),json_extract(value,'$.data.StartDate'),json_extract(value,'$.data.EndDate'),NULL,json_extract(value,'$.data') FROM json_each(?) WHERE true ON CONFLICT(school_id,event_id) DO UPDATE SET revision=excluded.revision,status=excluded.status,start_date=excluded.start_date,end_date=excluded.end_date,data_json=excluded.data_json", args: [s, y, boundedGenerationJson(eventWrites.map((event) => ({ ...event, data: JSON.parse(event.data) })))] },
    { sql: "UPDATE calendar_years SET revision=revision+1 WHERE school_id=? AND year=?", args: [s, y] },
  ];
  return finish(ctx, op, guards, writes, {
    year: y, structures: metadata.filter((r) => r.kind === "yearStructure").map((r) => JSON.parse(r.data)),
    created: records.length, revision: row.revision + 1,
    termWeeksGenerated: records.filter((r) => r.Kind === "TERM_WEEK").length,
    vacationsGenerated: 4, multiDayEventsCreatedOrUpdated: eventWrites.length,
    multiDayEventsRetained: 44 - eventWrites.length, materialisedEventCount: 44,
    generation: next, externalSyncQueued: false,
  }, [], true);
}
async function preview(ctx, kind, p) {
  const s = ctx.principal.schoolId,
    years = [
      ...new Set(
        (p.selections?.map((x) => x.year) || p.years || [p.year || p.Year]).map(
          year,
        ),
      ),
    ];
  need(
    years.length > 0 && years.length <= 20,
    "BOUNDS_EXCEEDED",
    "Select at most 20 years.",
  );
  const rows = await query(
    ctx.env.DB,
    "SELECT * FROM calendar_years WHERE school_id=? AND year IN (" +
      years.map(() => "?").join(",") +
      ") ORDER BY year",
    [s, ...years],
  );
  if (p.selections)
    need(
      p.selections.every((x) =>
        rows.some((r) => r.year === Number(x.year) && r.status === x.status),
      ),
      "PREVIEW_CHANGED",
      "Selected year status changed.",
      409,
    );
  const events = await query(
    ctx.env.DB,
    "SELECT event_id,year,revision FROM calendar_events WHERE school_id=? AND year IN (" +
      years.map(() => "?").join(",") +
      ") ORDER BY event_id LIMIT ?",
    [s, ...years, MAX_EVENTS + 1],
  );
  need(
    events.length <= MAX_EVENTS,
    "BOUNDS_EXCEEDED",
    "Split the archive into smaller year ranges.",
    413,
  );
  const payload = {
    kind,
    schoolId: s,
    actorId: ctx.principal.actorId,
    years: rows.map((r) => ({ year: r.year, revision: r.revision })),
    events,
  };
  return {
    preview: payload,
    digest: await digest(payload),
    counts: {
      years: rows.length,
      events: events.length,
      Events: events.length,
    },
    selections: rows.map((r) => ({ year: r.year, status: r.status })),
    fileName: `GSiS Calendar archive ${years.join("-")}.json`,
    confirmationPhrase: `ARCHIVE ${years.join(", ")}`,
    requiresConfirmation: true,
  };
}
async function archive(ctx, op, action, p) {
  const expected = await preview(ctx, "archive", p);
  need(
    p.previewDigest === expected.digest &&
      p.confirm === true &&
      (!p.confirmationPhrase ||
        p.confirmationPhrase === expected.confirmationPhrase),
    "PREVIEW_CHANGED",
    "Refresh and confirm the exact archive preview.",
    409,
  );
  const s = ctx.principal.schoolId,
    years = expected.preview.years.map((x) => x.year),
    guards = expected.preview.years.map((y) =>
      guardRow(
        "calendar_years",
        "school_id=? AND year=?",
        [s, y.year],
        y.revision,
      ),
    ),
    writes = [],
    outbox = [];
  const events = await query(
    ctx.env.DB,
    "SELECT * FROM calendar_events WHERE school_id=? AND year IN(" +
      years.map(() => "?").join(",") +
      ") ORDER BY event_id",
    [s, ...years],
  );
  const metadata = await query(
    ctx.env.DB,
    "SELECT * FROM calendar_metadata WHERE school_id=? AND (year=0 OR year IN(" +
      years.map(() => "?").join(",") +
      ")) ORDER BY kind,record_id",
    [s, ...years],
  );
  const archive = {
    schemaVersion: 1,
    owner: "calendar",
    schoolId: s,
    createdAt: ctx.now,
    years: await query(
      ctx.env.DB,
      "SELECT * FROM calendar_years WHERE school_id=? AND year IN(" +
        years.map(() => "?").join(",") +
        ")",
      [s, ...years],
    ),
    events,
    metadata,
    sourceRevision: expected.digest,
  };
  const content = canonical(archive),
    hash = await digest(archive),
    key = `${s}/calendar/archive/${hash}.json`;
  need(
    new TextEncoder().encode(content).byteLength <= 4 * 1024 * 1024,
    "ARCHIVE_BOUNDS",
    "Select fewer years for one archive.",
    413,
  );
  need(
    ctx.env.ARTIFACTS,
    "STORAGE_UNAVAILABLE",
    "Private archive storage unavailable.",
    503,
  );
  await ctx.env.ARTIFACTS.put(key, content, {
    httpMetadata: { contentType: "application/json" },
  });
  const stored = await ctx.env.ARTIFACTS.get(key);
  need(
    stored && (await digest(JSON.parse(await stored.text()))) === hash,
    "ARCHIVE_UNCONFIRMED",
    "Archive durability could not be verified.",
    503,
  );
  for (const y of years)
    writes.push({
      sql: "UPDATE calendar_years SET revision=revision+1,status='ARCHIVED',released=0,data_json=json_set(data_json,'$.Status','ARCHIVED','$.ReleasedToTeachers','No','$.ArchiveKey',?,'$.ArchiveFileName',?) WHERE school_id=? AND year=?",
      args: [key, expected.fileName, s, y],
    });
  outbox.push({
    id: `calendar-archive:${op.operationId}`,
    type: "drive.export",
    dueAt: ctx.now,
    payload: {
      key,
      decisionId: ctx.principal.decisionId,
      contentType: "application/json",
      title: expected.fileName,
    },
  });
  return finish(
    ctx,
    op,
    guards,
    writes,
    {
      state: "committed",
      archived: true,
      fileName: expected.fileName,
      artifactKey: key,
      downloadUrl: `/api/calendar/archive-download?key=${encodeURIComponent(key)}`,
      counts: expected.counts,
      historyRetained: true,
      driveExport: "queued",
    },
    outbox,
  );
}
async function ancillary(ctx, op, action, p) {
  const s = ctx.principal.schoolId,
    db = ctx.env.DB;
  if (action === "saveUrls") {
    const row = await one(
      db,
      "SELECT * FROM calendar_metadata WHERE school_id=? AND kind='settings' AND record_id='urls'",
      [s],
    );
    const value = {
      staffCalendarUrl: p.staffCalendarUrl || "",
      parentCalendarUrl: p.parentCalendarUrl || "",
      staffCalendarId: text(
        p.staffCalendarId ??
          (row ? JSON.parse(row.data_json).staffCalendarId : "") ??
          "",
        400,
      ),
      parentCalendarId: text(
        p.parentCalendarId ??
          (row ? JSON.parse(row.data_json).parentCalendarId : "") ??
          "",
        400,
      ),
    };
    for (const v of [value.staffCalendarUrl, value.parentCalendarUrl])
      if (v) {
        const u = new URL(v);
        need(
          u.protocol === "https:",
          "INVALID_URL",
          "Use HTTPS calendar links.",
        );
      }
    need(
      p.expectedMetadataRevision ===
        (await digest(row ? JSON.parse(row.data_json) : {})),
      "METADATA_CONFLICT",
      "URL configuration changed.",
      409,
    );
    for (const target of ["staff", "parent"]) {
      const key = target + "CalendarId",
        priorId = row
          ? JSON.parse(row.data_json)[key]
          : ctx.env[
              target === "staff"
                ? "GOOGLE_STAFF_CALENDAR_ID"
                : "GOOGLE_PARENT_CALENDAR_ID"
            ];
      if (value[key] && value[key] !== priorId)
        need(
          !(await one(
            db,
            "SELECT 1 AS found FROM calendar_sync WHERE school_id=? AND target=? LIMIT 1",
            [s, target],
          )),
          "CALENDAR_MIGRATION_REQUIRED",
          "Existing external links must be reconciled before changing Calendar IDs.",
          409,
        );
    }
    return finish(
      ctx,
      op,
      [
        guardRow(
          "calendar_metadata",
          "school_id=? AND kind=? AND record_id=?",
          [s, "settings", "urls"],
          row?.revision || 0,
        ),
      ],
      [
        {
          sql: "INSERT INTO calendar_metadata VALUES(?,'settings','urls',0,?,?) ON CONFLICT(school_id,kind,record_id) DO UPDATE SET revision=excluded.revision,data_json=excluded.data_json",
          args: [s, (row?.revision || 0) + 1, canonical(value)],
        },
      ],
      value,
    );
  }
  if (action === "reorderColourRules") {
    const rows = await query(
      db,
      "SELECT * FROM calendar_metadata WHERE school_id=? AND kind='colourRules' ORDER BY record_id LIMIT 201",
      [s],
    );
    need(rows.length <= 200, "BOUNDS_EXCEEDED", "Too many colour rules.", 413);
    const ids = p.RuleIDs || p.ids || p.ruleIds || p.order;
    need(
      Array.isArray(ids) &&
        ids.length === rows.length &&
        new Set(ids).size === ids.length &&
        ids.every((x) => rows.some((r) => r.record_id === x)),
      "INVALID_ORDER",
      "Include each colour rule exactly once.",
    );
    const token = await digest(
      rows
        .map(parse)
        .map((r) => ({ RuleID: r.RuleID, Priority: r.Priority || 0 })),
    );
    need(
      p.expectedMetadataRevision === token,
      "METADATA_CONFLICT",
      "Colour rule order changed.",
      409,
    );
    const writes = ids.map((key, n) => {
      const r = rows.find((r) => r.record_id === key);
      return {
        sql: "UPDATE calendar_metadata SET revision=revision+1,data_json=? WHERE school_id=? AND kind=? AND record_id=?",
        args: [
          canonical({ ...JSON.parse(r.data_json), Priority: n + 1 }),
          s,
          "colourRules",
          key,
        ],
      };
    });
    return finish(
      ctx,
      op,
      rows.map((r) =>
        guardRow(
          "calendar_metadata",
          "school_id=? AND kind=? AND record_id=?",
          [s, r.kind, r.record_id],
          r.revision,
        ),
      ),
      writes,
      await Promise.all(
        ids.map(async (key, n) => {
          const value = {
            ...JSON.parse(rows.find((r) => r.record_id === key).data_json),
            Priority: n + 1,
          };
          return {
            ...value,
            _metadataRevision: await digest(value),
            _orderRevision: await digest(
              ids
                .map((id, i) => ({ RuleID: id, Priority: i + 1 }))
                .sort((a, b) => a.RuleID.localeCompare(b.RuleID)),
            ),
          };
        }),
      ),
    );
  }
  if (action === "startSyncYear") {
    const y = year(p.year || p.Year),
      target = p.target || "staff";
    need(
      ["staff", "parent", "both"].includes(target),
      "INVALID_TARGET",
      "Choose staff, parent, or both.",
    );
    const yr = await one(
      db,
      "SELECT * FROM calendar_years WHERE school_id=? AND year=?",
      [s, y],
    );
    need(
      yr && yr.released,
      "YEAR_UNAVAILABLE",
      "Publish the year before external sync.",
      409,
    );
    return finish(
      ctx,
      op,
      [
        guardRow(
          "calendar_years",
          "school_id=? AND year=?",
          [s, y],
          yr.revision,
        ),
      ],
      [
        {
          sql: "INSERT INTO calendar_sync_runs VALUES(?,?,?,?,?,?)",
          args: [s, p.operationId, ctx.principal.actorId, y, target, ctx.now],
        },
      ],
      {
        state: "queued",
        syncRunId: p.operationId,
        year: y,
        target,
        done: false,
        completed: false,
        inProgress: true,
        fullySynced: false,
        initialPending: 1,
        processedTotal: 0,
        remaining: 1,
        blockedCount: 0,
        writes: 0,
        counts: {
          staffCreates: 0,
          staffUpdates: 0,
          staffDeletes: 0,
          parentCreates: 0,
          parentUpdates: 0,
          parentDeletes: 0,
          errorCount: 0,
        },
      },
      [
        {
          id: `calendar-sync:${p.operationId}`,
          type: "calendar.sync-year",
          payload: {
            schoolId: s,
            runId: p.operationId,
            year: y,
            target,
            decisionId: ctx.principal.decisionId,
            actorId: ctx.principal.actorId,
          },
          dueAt: ctx.now,
        },
      ],
    );
  }
  if (action === "savePdf") {
    need(
      typeof p.base64 === "string" && p.base64.length <= 4 * 1024 * 1024,
      "INVALID_PDF",
      "Provide a PDF within the upload limit.",
    );
    const binary = Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0));
    need(
      new TextDecoder().decode(binary.slice(0, 5)) === "%PDF-",
      "INVALID_PDF",
      "A PDF file is required.",
    );
    need(
      ctx.env.ARTIFACTS,
      "STORAGE_UNAVAILABLE",
      "Private artifact storage is not configured.",
      503,
    );
    const hash = await digest(p.base64),
      key = `${s}/calendar/pdf/${hash}.pdf`;
    await ctx.env.ARTIFACTS.put(key, binary, {
      httpMetadata: { contentType: "application/pdf" },
    });
    need(
      (await ctx.env.ARTIFACTS.head(key))?.size === binary.length,
      "ARTIFACT_UNCONFIRMED",
      "PDF durability could not be verified.",
      503,
    );
    return finish(ctx, op, [], [], { saved: true, key, digest: hash }, [
      {
        id: `calendar-pdf:${p.operationId}`,
        type: "drive.export",
        payload: {
          key,
          decisionId: ctx.principal.decisionId,
          contentType: "application/pdf",
          title: text(p.name || "Calendar.pdf", 200),
        },
        dueAt: ctx.now,
      },
    ]);
  }
  if (action === "saveUser") {
    id(p.targetAccountId);
    need(
      ctx.env.CORE,
      "AUTHORITY_UNAVAILABLE",
      "Core account service unavailable.",
      503,
    );
    const response = await ctx.env.CORE.fetch(
      new Request("https://core.internal/internal/grants", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gsis-secret": ctx.env.GSIS_SECRET,
        },
        body: JSON.stringify({
          schoolId: s,
          decisionId: ctx.principal.decisionId,
          targetAccountId: p.targetAccountId,
          capabilities: [
            ...(yes(p.IsAdmin) ? ["calendar.admin"] : []),
            ...(yes(p.IsParentPublisher) ? ["calendar.parent.edit"] : []),
            ...(yes(p.Active) ? ["calendar.read"] : []),
          ],
          revision: p.revision,
          operationId: p.operationId,
        }),
      }),
    );
    const value = await response.json();
    need(
      response.ok && value.ok !== false,
      "GRANT_UNCONFIRMED",
      "Calendar permissions were not confirmed; verify the original operation.",
      503,
    );
    return finish(ctx, op, [], [], value.data || value);
  }
  if (action === "savePublicHolidays") {
    const y = year(p.Year),
      yr = await one(
        db,
        "SELECT * FROM calendar_years WHERE school_id=? AND year=?",
        [s, y],
      );
    need(yr, "YEAR_UNAVAILABLE", "Create the school year first.", 409);
    need(
      Array.isArray(p.holidays) && p.holidays.length <= 100,
      "INVALID_HOLIDAYS",
      "Provide at most 100 holiday records.",
    );
    const old = await query(
      db,
      "SELECT * FROM calendar_events WHERE school_id=? AND year=? AND json_extract(data_json,'$.OwnerTag')='hol' ORDER BY event_id",
      [s, y],
    );
    const preview = await bootstrap(ctx, { year: y });
    need(
      p.expectedMetadataRevision === preview.metadataRevisions.holidays,
      "METADATA_CONFLICT",
      "Holidays changed; refresh the preview.",
      409,
    );
    const guards = [
        guardRow(
          "calendar_years",
          "school_id=? AND year=?",
          [s, y],
          yr.revision,
        ),
        ...old.map((r) =>
          guardRow(
            "calendar_events",
            "school_id=? AND event_id=?",
            [s, r.event_id],
            r.revision,
          ),
        ),
      ],
      writes = old.map((r) =>
        eventWrite(
          s,
          {
            ...JSON.parse(r.data_json),
            DeletedAt: new Date(ctx.now).toISOString(),
          },
          r.revision + 1,
        ),
      );
    for (const h of p.holidays) {
      const e = validateEvent(
        {
          Year: y,
          StaffTitle: h.name || h.Name,
          StartDate: h.date || h.Date,
          EndDate: h.date || h.Date,
          EventType: "ALL_DAY",
          LaneID: "day",
          OwnerTag: "hol",
          Status: "PUBLISHED",
        },
        null,
        ctx.now,
        ctx.principal.actorId,
      );
      e.EventID = crypto.randomUUID();
      writes.push(eventWrite(s, e, 1));
    }
    writes.push({
      sql: "UPDATE calendar_years SET revision=revision+1 WHERE school_id=? AND year=?",
      args: [s, y],
    });
    return finish(ctx, op, guards, writes, {
      created: p.holidays.length,
      replaced: old.length,
    });
  }
  if (action === "pullBirthdays")
    return reconcileBirthdays(
      ctx.env,
      { school_id: s, payload: { year: year(p.year) }, job_id: p.operationId },
      { ...ctx, operation: op },
    );
  if (action === "clearStaleOperation") {
    const prior = await operationStatus(db, s, id(p.targetOperationId));
    need(
      prior && prior.state !== "prepared",
      "OPERATION_UNRESOLVED",
      "Resolve the durable prepared operation before clearing it.",
      409,
    );
    return finish(ctx, op, [], [], {
      operationId: prior.operationId,
      state: prior.state,
      historyRetained: true,
    });
  }
  fail("NOT_FOUND", "Unknown Calendar operation.", 404);
}
export async function handle(ctx) {
  const { action, p } = unpack(ctx);
  const u = new URL(ctx.request.url);
  for (const [k, v] of u.searchParams) if (p[k] === undefined) p[k] = v;
  auth(ctx, action);
  if (action === "publication") {
    const row = await one(
      ctx.env.DB,
      "SELECT * FROM calendar_publications WHERE school_id=? AND publication_id=?",
      [ctx.principal.schoolId, id(p.publicationId)],
    );
    need(row, "NOT_FOUND", "Publication not found.", 404);
    const saved = JSON.parse(row.data_json);
    if (!saved.artifactKey) return saved;
    const artifact = await ctx.env.ARTIFACTS?.get(saved.artifactKey);
    need(
      artifact && artifact.size <= 16 * 1024 * 1024,
      "PUBLICATION_UNAVAILABLE",
      "Publication artifact unavailable.",
      503,
    );
    const snapshot = JSON.parse(await artifact.text());
    need(
      (await digest(snapshot)) === row.digest,
      "PUBLICATION_CHANGED",
      "Publication integrity verification failed.",
      503,
    );
    return snapshot;
  }
  if (ctx.path === "/archive-download") {
    need(
      isAdmin(ctx.principal),
      "CAPABILITY_DENIED",
      "Calendar administrator required.",
      403,
    );
    const key = p.key;
    need(
      typeof key === "string" &&
        key.startsWith(`${ctx.principal.schoolId}/calendar/archive/`) &&
        /\/[a-f0-9]{64}\.json$/.test(key),
      "ARTIFACT_DENIED",
      "Invalid archive reference.",
      403,
    );
    const object = await ctx.env.ARTIFACTS?.get(key);
    need(object, "NOT_FOUND", "Archive unavailable.", 404);
    return new Response(object.body, {
      headers: {
        "content-type": "application/json",
        "content-disposition": 'attachment; filename="calendar-archive.json"',
      },
    });
  }
  if (ctx.path === "/accounts") {
    need(
      isAdmin(ctx.principal),
      "CAPABILITY_DENIED",
      "Calendar administrator required.",
      403,
    );
    const { serviceCall } = await import("../../runtime/security.mjs");
    return serviceCall(ctx.env, "core", "/internal/accounts", {
      schoolId: ctx.principal.schoolId,
      decisionId: ctx.principal.decisionId,
      module: "calendar",
    });
  }
  if (ctx.path === "/dates" || ctx.path === "/rosterDates")
    return dates(ctx, p);
  if (ctx.path === "/export") {
    const data = await bootstrap(ctx, p);
    const quote = (x) => '"' + String(x ?? "").replaceAll('"', '""') + '"';
    const csv = [
      ["Event ID", "Start date", "End date", "Title", "Location"],
      ...data.events.map((e) => [
        e.EventID,
        e.StartDate,
        e.EndDate,
        e.StaffTitle,
        e.Location,
      ]),
    ]
      .map((r) => r.map(quote).join(","))
      .join("\r\n");
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="calendar.csv"',
      },
    });
  }
  if (action === "bootstrap") return bootstrap(ctx, p);
  if (
    action === "calendarChangesAuthorize" ||
    action === "calendarChangesDelta"
  ) {
    const data = await bootstrap(ctx, p);
    return {
      revision: data.revision,
      changed: p.revision !== data.revision,
      bootstrap: data,
    };
  }
  if (action === "eventMutationStatus") {
    const result = await operationStatus(
      ctx.env.DB,
      ctx.principal.schoolId,
      id(p.payload?.operationId || p.operationId),
    );
    need(
      !result ||
        result.actorId === ctx.principal.actorId ||
        isAdmin(ctx.principal),
      "CAPABILITY_DENIED",
      "That operation belongs to another actor.",
      403,
    );
    return result?.state === "committed"
      ? {
          state: "SAVED",
          result: result.receipt.result,
          operationId: result.operationId,
        }
      : result?.state === "aborted"
        ? { state: "NOT_SAVED", operationId: result.operationId }
        : {
            state: "UNKNOWN",
            operationId: p.payload?.operationId || p.operationId,
          };
  }
  if (action === "mutationReceipts")
    return {
      receipts: await query(
        ctx.env.DB,
        "SELECT operation_id,state,created_at,updated_at FROM product_operations WHERE school_id=? AND action LIKE ? ORDER BY created_at DESC LIMIT 200",
        [ctx.principal.schoolId, "calendar.%"],
      ),
    };
  if (action === "calendarSyncStatus" || action === "syncYearBatch")
    return syncRunStatus(ctx, p);
  if (action === "calendarReconciliationPreview")
    return externalReconciliation(ctx, p);
  if (
    [
      "calendarPreflight",
      "healthCheck",
      "calendarReconciliationPreview",
      "runSelfTests",
    ].includes(action)
  ) {
    const rows = await query(
      ctx.env.DB,
      "SELECT state,COUNT(*) AS count FROM calendar_sync WHERE school_id=? GROUP BY state",
      [ctx.principal.schoolId],
    );
    const providers = {
      googleCalendar: googleConfigured(ctx.env),
      drive: !!(
        ctx.env.GOOGLE_DRIVE_FOLDER_ID &&
        googleConfigured(ctx.env)
      ),
    };
    const issues = [];
    if (!providers.googleCalendar)
      issues.push({
        severity: "ERROR",
        code: "GOOGLE_NOT_CONFIGURED",
        message: "Google provider credentials are not configured.",
      });
    if (!providers.drive)
      issues.push({
        severity: "WARNING",
        code: "DRIVE_NOT_CONFIGURED",
        message: "Drive continuity export is not configured.",
      });
    if (rows.some((r) => r.state === "uncertain" && r.count))
      issues.push({
        severity: "ERROR",
        code: "PROVIDER_OUTCOME_UNKNOWN",
        message:
          "Some provider outcomes require reconciliation; do not blindly retry them.",
      });
    const counts = await one(
      ctx.env.DB,
      "SELECT COUNT(*) AS eventsChecked FROM calendar_events WHERE school_id=?",
      [ctx.principal.schoolId],
    );
    const tests = [
      { name: "Calendar owner tables readable", ok: true },
      {
        name: "No unresolved provider outcomes",
        ok: !rows.some((r) => r.state === "uncertain" && r.count),
      },
    ];
    return {
      schemaVersion: 1,
      owner: "calendar",
      status: issues.some((x) => x.severity === "ERROR")
        ? "attention-required"
        : "available",
      ok: issues.every((x) => x.severity !== "ERROR"),
      issues,
      summary: {
        errors: issues.filter((x) => x.severity === "ERROR").length,
        warnings: issues.filter((x) => x.severity === "WARNING").length,
      },
      counts,
      sync: rows,
      providers,
      tests,
      passed: tests.filter((t) => t.ok).length,
      failed: tests.filter((t) => !t.ok).length,
      liveVerification: "Not tested",
    };
  }
  if (action === "tableWorkbook") return tableWorkbook(ctx, p);
  if (action === "tableImportPreview") return previewTableImport(ctx, p);
  if (action === "calendarWipePreview") return externalWipePreview(ctx, p);
  if (action === "calendarWipeBatch") return externalWipeStatus(ctx, p);
  if (action === "archiveYearsPreview") return preview(ctx, "archive", p);
  need(WRITES.has(action), "NOT_FOUND", "Unknown Calendar operation.", 404);
  const op = await start(ctx, action, p);
  if (op.state === "committed") return action === "generateYearStructure"
    ? { ...op.receipt.result, receipt: op.receipt } : op.receipt.result;
  need(
    op.state === "prepared",
    "OPERATION_ABORTED",
    "This operation was fenced; start a new reviewed operation.",
    409,
  );
  if (
    ["saveEvent", "deleteEvent", "saveParentSide", "relocateEvent"].includes(
      action,
    )
  )
    return eventMutation(ctx, op, action, p);
  if (action === "tableImportApply") return applyTableImport(ctx, op, p, { metadataPlan, finish });
  if (META[action]) return metadataMutation(ctx, op, action, p);
  if (action === "saveYear") return saveYear(ctx, op, p);
  if (action === "publishVersion") return publishYear(ctx, op, p);
  if (action === "generateYearStructure") return structure(ctx, op, p);
  if (action === "archiveYearsCommit") return archive(ctx, op, action, p);
  if (action === "startCalendarWipe") return startExternalWipe(ctx, op, p);
  return ancillary(ctx, op, action, p);
}
/** Provider delivery is separate from Calendar commit. Stale jobs never resurrect tombstones. */
export async function executeSyncJob(env, job, now = Date.now()) {
  const { dispatchProvider } = await import("../../runtime/providers.mjs");
  const p = job.payload || job,
    s = job.schoolId || p.schoolId;
  let row = await one(
    env.DB,
    "SELECT * FROM calendar_sync WHERE school_id=? AND target=? AND event_id=?",
    [s, p.target, p.eventId],
  );
  if (!row || row.desired_revision !== p.revision)
    return { state: "cancelled", code: "SUPERSEDED" };
  const e = await one(
    env.DB,
    "SELECT * FROM calendar_events WHERE school_id=? AND event_id=?",
    [s, p.eventId],
  );
  need(e, "SOURCE_UNAVAILABLE", "Calendar source is unavailable.", 503);
  const ownerYear = await one(
    env.DB,
    "SELECT released,status,revision FROM calendar_years WHERE school_id=? AND year=?",
    [s, e.year],
  );
  if (!ownerYear?.released || ownerYear.status === "ARCHIVED")
    return { state: "cancelled", code: "YEAR_NOT_RELEASED" };
  const lane = await one(
    env.DB,
    "SELECT data_json,revision FROM calendar_metadata WHERE school_id=? AND kind='lanes' AND record_id=?",
    [s, JSON.parse(e.data_json).LaneID],
  );
  const staffLaneEnabled =
    lane &&
    yes(JSON.parse(lane.data_json).Active) &&
    yes(JSON.parse(lane.data_json).SyncToStaffCalendar);
  const value = JSON.parse(e.data_json),
    parent = p.target === "parent",
    tombstone =
      !!e.deleted_at ||
      e.status !== "PUBLISHED" ||
      (parent && !yes(value.ParentEnabled)) ||
      (!parent && !staffLaneEnabled);
  if (
    row.tombstone !== Number(tombstone) ||
    row.desired_revision !== e.revision
  )
    return { state: "cancelled", code: "SUPERSEDED" };
  const { calendarTarget } = await import("./external.mjs");
  const calendarId = await calendarTarget(env, p.target);
  need(
    calendarId,
    "PROVIDER_NOT_CONFIGURED",
    "Configure the target Google Calendar.",
    503,
  );
  const event = {
    id: row.remote_id,
    summary: parent ? value.ParentTitle || value.StaffTitle : value.StaffTitle,
    description: parent ? value.ParentDescription : value.StaffDescription,
    location: value.Location || "",
    start:
      value.EventType === "ALL_DAY"
        ? { date: value.StartDate }
        : {
            dateTime: `${value.StartDate}T${value.StartTime}:00+08:00`,
            timeZone: "Asia/Singapore",
          },
    end:
      value.EventType === "ALL_DAY"
        ? {
            date: new Date(Date.parse(value.EndDate) + 86400000)
              .toISOString()
              .slice(0, 10),
          }
        : {
            dateTime: `${value.EndDate}T${value.EndTime}:00+08:00`,
            timeZone: "Asia/Singapore",
          },
    ...(value.Recurrence ? { recurrence: value.Recurrence } : {}),
  };
  const acquired = await env.DB.prepare(
    "INSERT OR IGNORE INTO calendar_dispatch_locks(school_id,target,event_id,intent_id,state,created_at,updated_at) SELECT ?,?,?,?,'sending',?,? WHERE EXISTS(SELECT 1 FROM calendar_years WHERE school_id=? AND year=? AND revision=? AND released=1) AND COALESCE((SELECT revision FROM calendar_metadata WHERE school_id=? AND kind='lanes' AND record_id=?),0)=?",
  )
    .bind(
      s,
      p.target,
      p.eventId,
      row.intent_id,
      now,
      now,
      s,
      e.year,
      ownerYear.revision,
      s,
      value.LaneID,
      lane?.revision || 0,
    )
    .run();
  if (acquired.meta.changes !== 1)
    return {
      state: "failed",
      code: "PRIOR_PROVIDER_OUTCOME_UNRESOLVED",
      retryable: true,
    };
  const current = await one(
    env.DB,
    "SELECT desired_revision,intent_id FROM calendar_sync WHERE school_id=? AND target=? AND event_id=?",
    [s, p.target, p.eventId],
  );
  if (
    current?.desired_revision !== row.desired_revision ||
    current?.intent_id !== row.intent_id
  ) {
    await env.DB.prepare(
      "DELETE FROM calendar_dispatch_locks WHERE school_id=? AND target=? AND event_id=? AND intent_id=?",
    )
      .bind(s, p.target, p.eventId, row.intent_id)
      .run();
    return { state: "cancelled", code: "SUPERSEDED" };
  }
  const result = await dispatchProvider(env, {
    provider: "google-calendar",
    operation: tombstone ? "delete" : "upsert",
    calendarId,
    eventId: row.remote_id,
    event,
    etag: JSON.parse(row.data_json).etag || undefined,
  });
  await env.DB.prepare(
    "UPDATE calendar_sync SET state=?,attempt=attempt+1,last_error=?,next_at=? WHERE school_id=? AND target=? AND event_id=? AND desired_revision=? AND intent_id=?",
  )
    .bind(
      result.state,
      result.code || null,
      now,
      s,
      p.target,
      p.eventId,
      p.revision,
      row.intent_id,
    )
    .run();
  if (result.state === "delivered" || result.state === "accepted") {
    await env.DB.prepare(
      tombstone
        ? "UPDATE calendar_sync SET data_json=json_remove(data_json,'$.etag') WHERE school_id=? AND target=? AND event_id=? AND remote_id=?"
        : "UPDATE calendar_sync SET data_json=json_set(data_json,'$.etag',?) WHERE school_id=? AND target=? AND event_id=? AND remote_id=?",
    )
      .bind(
        ...(tombstone
          ? [s, p.target, p.eventId, row.remote_id]
          : [result.etag || null, s, p.target, p.eventId, row.remote_id]),
      )
      .run();
  }
  if (result.state === "uncertain")
    await env.DB.prepare(
      "UPDATE calendar_dispatch_locks SET state='uncertain',updated_at=? WHERE school_id=? AND target=? AND event_id=? AND intent_id=?",
    )
      .bind(now, s, p.target, p.eventId, row.intent_id)
      .run();
  else
    await env.DB.prepare(
      "DELETE FROM calendar_dispatch_locks WHERE school_id=? AND target=? AND event_id=? AND intent_id=?",
    )
      .bind(s, p.target, p.eventId, row.intent_id)
      .run();
  return result;
}
export async function internal(ctx) {
  const { inspectDecision } = await import("../../runtime/security.mjs");
  if (ctx.path === "/internal/pins/acquire") {
    need(
      /^year:\d{4}$/.test(ctx.body.scope),
      "SOURCE_SCOPE_DENIED",
      "Unknown Calendar source scope.",
      403,
    );
    const y = year(ctx.body.scope.slice(5));
    return acquireSourcePin(
      ctx.env,
      ctx.body,
      {
        sql: "SELECT COALESCE((SELECT revision FROM calendar_years WHERE school_id=? AND year=?),0)=? AS ok",
        args: [ctx.env.SCHOOL_ID, y, Number(ctx.body.revision)],
      },
      ctx.now,
    );
  }
  if (ctx.path === "/internal/pins/release")
    return releaseSourcePin(ctx.env, ctx.body, ctx.now);
  if (ctx.path === "/internal/dates") {
    need(
      ctx.body.schoolId === ctx.env.SCHOOL_ID,
      "SCHOOL_MISMATCH",
      "Wrong school.",
      403,
    );
    const { principal } = await inspectDecision(ctx.env, ctx.body.decisionId, {
      schoolId: ctx.body.schoolId,
      actions: [
        "roster.read",
        "roster.own",
        "roster.write",
        "roster.publish",
        "roster.allocate",
        "roster.admin",
        "venues.read",
        "venues.book",
        "calendar.read",
        "calendar.admin",
      ],
    });
    return dates({ ...ctx, principal }, ctx.body);
  }
  if (ctx.path === "/internal/source-status") {
    const op = await operationStatus(
      ctx.env.DB,
      ctx.body.schoolId,
      ctx.body.operationId,
    );
    need(
      ctx.body.schoolId === ctx.env.SCHOOL_ID,
      "SCHOOL_MISMATCH",
      "Wrong school.",
      403,
    );
    return op || { state: "unknown" };
  }
  fail("NOT_FOUND", "Unknown Calendar internal route.", 404);
}

function defaultWrites(s) {
  const headers = {
    lanes: [
      "LaneID",
      "Header",
      "SortOrder",
      "Active",
      "SupportsShift",
      "ShiftALabel",
      "ShiftBLabel",
      "DefaultWeekday",
      "DefaultEventType",
      "DefaultStartTime",
      "DefaultEndTime",
      "ShiftADefaultStartTime",
      "ShiftADefaultEndTime",
      "ShiftBDefaultStartTime",
      "ShiftBDefaultEndTime",
      "SyncToStaffCalendar",
      "Notes",
    ],
    colourRules: [
      "RuleID",
      "Priority",
      "RuleType",
      "Field",
      "Operator",
      "Value",
      "FillColour",
      "TextColour",
      "BorderColour",
      "Active",
      "Locked",
      "Notes",
    ],
  };
  const rows = [
    ...defaults.DEFAULT_LANES.map((a) => [
      "lanes",
      a[0],
      Object.fromEntries(headers.lanes.map((k, i) => [k, a[i]])),
    ]),
    ...defaults.DEFAULT_COLOUR_RULES.map((a) => [
      "colourRules",
      a[0],
      Object.fromEntries(headers.colourRules.map((k, i) => [k, a[i]])),
    ]),
    ...defaults.DEFAULT_TAGS.map((a, i) => [
      "tags",
      a[0].toLowerCase(),
      { Tag: a[0], Meaning: a[1], Active: "Yes", SortOrder: i + 1 },
    ]),
  ];
  return rows.map(([kind, id, value]) => ({
    sql: "INSERT OR IGNORE INTO calendar_metadata(school_id,kind,record_id,year,revision,data_json) VALUES(?,?,?,0,1,?)",
    args: [s, kind, id, canonical(value)],
  }));
}
async function expandSyncYear(env, job) {
  const p = job.payload,
    s = job.school_id,
    now = Date.now();
  const decision = { principal: await currentJobPrincipal(env, job) };
  const years = p.years || [p.year];
  need(years.length === 1, "BATCH_REQUIRED", "Sync one year at a time.", 409);
  const y = year(years[0]);
  const rows = await query(
    env.DB,
    "SELECT * FROM calendar_events WHERE school_id=? AND year=? AND event_id>? ORDER BY event_id LIMIT 51",
    [s, y, p.after || ""],
  );
  const batch = rows.slice(0, 50),
    guards = [
      {
        sql: "SELECT EXISTS(SELECT 1 FROM product_outbox WHERE school_id=? AND job_id=? AND state='leased' AND fence=?) AS ok",
        args: [s, job.job_id, job.fence],
      },
    ],
    writes = [],
    outbox = [];
  for (const row of batch) {
    guards.push(
      guardRow(
        "calendar_events",
        "school_id=? AND event_id=?",
        [s, row.event_id],
        row.revision,
      ),
    );
    const jobs = await syncIntents(
      { env, principal: decision.principal, now },
      JSON.parse(row.data_json),
      row.revision,
      writes,
      p.target && p.target !== "both" ? [p.target] : ["staff", "parent"],
    );
    for (const next of jobs) {
      // Children still belong to the original committed request. Core renews
      // its authority when they run; a renewed descriptor is not that receipt.
      next.payload.decisionId = p.decisionId;
      if (p.runId)
        writes.push({
          sql: "INSERT OR IGNORE INTO calendar_sync_run_items VALUES(?,?,?,?,?,?)",
          args: [
            s,
            p.runId,
            next.id,
            next.payload.target,
            next.payload.eventId,
            Number(next.payload.tombstone),
          ],
        });
      writes.push({
        sql: "INSERT OR IGNORE INTO product_outbox(school_id,job_id,operation_id,type,payload_json,due_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        args: [
          s,
          next.id,
          job.operation_id,
          next.type,
          canonical(next.payload),
          next.dueAt,
          now,
        ],
      });
    }
  }
  if (rows.length > 50)
    writes.push({
      sql: "INSERT OR IGNORE INTO product_outbox(school_id,job_id,operation_id,type,payload_json,due_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      args: [
        s,
        `calendar-next:${(await digest([job.job_id, batch.at(-1).event_id])).slice(0, 48)}`,
        job.operation_id,
        "calendar.sync-year",
        canonical({ ...p, after: batch.at(-1).event_id }),
        now,
        now,
      ],
    });
  const op = await prepareOperation(env.DB, {
    schoolId: s,
    actorId: decision.principal.actorId,
    operationId: `expand:${(await digest(job.job_id)).slice(0, 48)}`,
    action: "internal.calendar.expand-sync",
    intent: { jobId: job.job_id, year: y, after: p.after || "" },
    now,
    validUntil: now + 60000,
  });
  await commitOperation(env.DB, op, {
    now,
    guards,
    writes,
    outbox,
    result: { expanded: batch.length, continued: rows.length > 50 },
    admission: {
      kind: "system",
      reason: "Current Calendar authority and leased immutable owner job",
    },
  });
  return { state: "delivered", providerId: op.operationId };
}
export async function scheduled({ env, now = Date.now() }) {
  if (env.SCHEDULER_OWNER !== "v1") return { state: "inactive" };
  const { drainOutbox } = await import("../../runtime/jobs.mjs");
  const { inspectDecision } = await import("../../runtime/security.mjs");
  return drainOutbox(env.DB, env, {
    schoolId: env.SCHOOL_ID,
    now,
    limit: 10,
    handlers: {
      "calendar.sync-year": (job, dispatchEnv) =>
        expandSyncYear(dispatchEnv, job),
      "calendar.sync": async (job, dispatchEnv) => {
        await currentJobPrincipal(env, job);
        return executeSyncJob(
          dispatchEnv,
          { ...job, schoolId: job.school_id },
          Date.now(),
        );
      },
      "calendar.birthdays": (job, dispatchEnv) =>
        reconcileBirthdays(dispatchEnv, job),
      "drive.export": (job, dispatchEnv) => exportPdf(dispatchEnv, job),
      "calendar.wipe": (job, dispatchEnv) => executeWipeJob(dispatchEnv, job),
      "calendar.wipe-expand": (job, dispatchEnv) =>
        expandWipeJob(dispatchEnv, job),
    },
  });
}
async function exportPdf(env, job) {
  const { googleDriveFileId, dispatchProvider } = await import(
    "../../runtime/providers.mjs"
  );
  const p = job.payload,
    s = job.school_id;
  await currentJobPrincipal(env, job);
  need(
    env.GOOGLE_DRIVE_FOLDER_ID,
    "DRIVE_DESTINATION_REQUIRED",
    "Configure the readable-output Drive folder.",
    503,
  );
  const object = await env.ARTIFACTS?.get(p.key);
  need(
    object && object.size <= 4 * 1024 * 1024,
    "ARTIFACT_UNAVAILABLE",
    "PDF artifact is unavailable.",
    503,
  );
  const bytes = new Uint8Array(await object.arrayBuffer());
  need(
    p.contentType === "application/json"
      ? (() => {
          try {
            return (
              JSON.parse(new TextDecoder().decode(bytes)).owner === "calendar"
            );
          } catch {
            return false;
          }
        })()
      : new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-",
    "ARTIFACT_INVALID",
    "PDF artifact is invalid.",
    503,
  );
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  let row = await one(
    env.DB,
    "SELECT * FROM calendar_exports WHERE school_id=? AND export_id=?",
    [s, job.job_id],
  );
  if (!row) {
    const generated = await googleDriveFileId(env);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO calendar_exports VALUES(?,?,?,?,?,'prepared',?)",
    )
      .bind(s, job.job_id, p.key, hash, generated, Date.now())
      .run();
    row = await one(
      env.DB,
      "SELECT * FROM calendar_exports WHERE school_id=? AND export_id=?",
      [s, job.job_id],
    );
  }
  need(
    row.digest === hash && row.artifact_key === p.key,
    "ARTIFACT_CHANGED",
    "Export identity changed.",
    409,
  );
  if (row.state === "delivered")
    return { state: "delivered", providerId: row.provider_id };
  const result = await dispatchProvider(env, {
    provider: "google-drive",
    generatedFileId: row.provider_id,
    folderId: env.GOOGLE_DRIVE_FOLDER_ID,
    name: p.title || "Calendar.pdf",
    mimeType: p.contentType || "application/pdf",
    content: bytes,
  });
  await env.DB.prepare(
    "UPDATE calendar_exports SET state=?,updated_at=? WHERE school_id=? AND export_id=? AND provider_id=?",
  )
    .bind(result.state, Date.now(), s, job.job_id, row.provider_id)
    .run();
  return result;
}

async function currentJobPrincipal(env, job) {
  const { serviceCall } = await import("../../runtime/security.mjs");
  const result = await serviceCall(env, "core", "/internal/job-authority", {
    schoolId: job.school_id,
    decisionId: job.payload.decisionId,
    operationId: job.operation_id,
    destination: "calendar",
    purpose: job.type,
  });
  need(
    result.allowed && result.principal,
    "AUTHORITY_CHANGED",
    "Delayed job authority is no longer current.",
    403,
  );
  return result.principal;
}
async function reconcileBirthdays(env, job, manual = null) {
  const principal = manual?.principal || (await currentJobPrincipal(env, job)),
    { serviceCall } = await import("../../runtime/security.mjs"),
    s = job.school_id,
    y = year(job.payload.year),
    now = Date.now();
  const projection = await serviceCall(
    env,
    "contacts",
    "/internal/projection",
    {
      schoolId: s,
      decisionId: principal.decisionId,
      purpose: "calendarBirthdays",
    },
  );
  need(
    projection.complete === true &&
      Array.isArray(projection.staff) &&
      projection.staff.length <= 512,
    "PROJECTION_INVALID",
    "Birthday source exceeds its bound.",
    503,
  );
  const yr = await one(
    env.DB,
    "SELECT * FROM calendar_years WHERE school_id=? AND year=?",
    [s, y],
  );
  need(
    yr && yr.status !== "ARCHIVED",
    "YEAR_UNAVAILABLE",
    "School year unavailable.",
    409,
  );
  const rows = await query(
    env.DB,
    "SELECT * FROM calendar_events WHERE school_id=? AND year=? AND json_extract(data_json,'$.OwnerTag')='birthday' ORDER BY event_id LIMIT 513",
    [s, y],
  );
  need(
    rows.length <= 512,
    "BOUNDS_EXCEEDED",
    "Birthday event count exceeds its bound.",
    413,
  );
  const expected = new Map();
  for (const staff of projection.staff) {
    if (staff.active !== true || !staff.birthday) continue;
    need(
      /^\d{2}-\d{2}$/.test(staff.birthday),
      "PROJECTION_INVALID",
      "Birthday source is malformed.",
      503,
    );
    const date = `${y}-${staff.birthday}`;
    if (!isoDate(date)) continue;
    const eid = `birthday-${y}-${staff.staffId}`;
    id(eid);
    expected.set(
      eid,
      validateEvent(
        {
          EventID: eid,
          Year: y,
          StaffTitle: `${staff.name}'s birthday`,
          StartDate: date,
          EndDate: date,
          EventType: "ALL_DAY",
          LaneID: "day",
          OwnerTag: "birthday",
          Status: yr.released ? "PUBLISHED" : "HIDDEN",
          ParentEnabled: "No",
        },
        null,
        now,
        principal.actorId,
      ),
    );
  }
  const guards = [
      guardRow("calendar_years", "school_id=? AND year=?", [s, y], yr.revision),
      {
        sql: "SELECT EXISTS(SELECT 1 FROM product_outbox WHERE school_id=? AND job_id=? AND state='leased' AND fence=?) AS ok",
        args: [s, job.job_id, job.fence],
      },
    ].filter((_, index) => !manual || index === 0),
    writes = [];
  for (const row of rows) {
    guards.push(
      guardRow(
        "calendar_events",
        "school_id=? AND event_id=?",
        [s, row.event_id],
        row.revision,
      ),
    );
    if (!expected.has(row.event_id)) {
      writes.push(
        eventWrite(
          s,
          {
            ...JSON.parse(row.data_json),
            DeletedAt: new Date(now).toISOString(),
          },
          row.revision + 1,
        ),
      );
    }
  }
  for (const [eid, e] of expected) {
    const old = rows.find((r) => r.event_id === eid);
    e.EventID = eid;
    e.SourceStaffId = eid.slice(`birthday-${y}-`.length);
    e.ContactsRevision = projection.revision;
    e.DeletedAt = "";
    if (!old)
      guards.push(
        guardRow("calendar_events", "school_id=? AND event_id=?", [s, eid], 0),
      );
    writes.push(eventWrite(s, e, (old?.revision || 0) + 1));
  }
  writes.push({
    sql: "DELETE FROM calendar_birthday_pending WHERE school_id=? AND year=?",
    args: [s, y],
  });
  writes.push({
    sql: "UPDATE calendar_years SET revision=revision+1 WHERE school_id=? AND year=?",
    args: [s, y],
  });
  const counts = {
    year: y,
    created: [...expected.keys()].filter(
      (id) => !rows.some((r) => r.event_id === id),
    ).length,
    updated: [...expected.keys()].filter((id) =>
      rows.some((r) => r.event_id === id),
    ).length,
    removed: rows.filter((r) => !expected.has(r.event_id) && !r.deleted_at)
      .length,
    skipped: projection.staff.length - expected.size,
    unchanged: 0,
    contactsRevision: projection.revision,
    externalSync: "manual",
  };
  if (manual) return finish(manual, manual.operation, guards, writes, counts);
  const op = await prepareOperation(env.DB, {
    schoolId: s,
    actorId: principal.actorId,
    operationId: `birthdays:${(await digest(job.job_id)).slice(0, 48)}`,
    action: "internal.calendar.birthdays",
    intent: { jobId: job.job_id, year: y },
    now,
    validUntil: principal.validUntil,
  });
  await protectCalendarChanges(env, op, guards, writes, now);
  await commitOperation(env.DB, op, {
    now,
    guards,
    writes,
    result: {
      year: y,
      createdOrUpdated: expected.size,
      contactsRevision: projection.revision,
      externalSync: "manual",
    },
    admission: {
      kind: "system",
      reason:
        "Current Calendar authority, purpose-limited Contacts projection, leased birthday job",
    },
  });
  return { state: "delivered", providerId: op.operationId };
}

/** Named ContactsBirthdays entrypoint only. No public route or user-grant bypass. */
export async function reconcileContactsBirthdays(env, input, now = Date.now()) {
  need(
    input?.schoolId === env.SCHOOL_ID,
    "SCHOOL_MISMATCH",
    "Wrong school.",
    403,
  );
  const { serviceCall } = await import("../../runtime/security.mjs");
  const verified = await serviceCall(
    env,
    "contacts",
    "/internal/birthday-event",
    {
      schoolId: input.schoolId,
      sourceOperationId: id(input.sourceOperationId),
      eventId: id(input.eventId),
    },
  );
  need(
    verified?.verified === true &&
      verified.state === "committed" &&
      verified.schoolId === input.schoolId &&
      verified.sourceOperationId === input.sourceOperationId &&
      verified.eventId === input.eventId,
    "SOURCE_UNCONFIRMED",
    "Birthday signal does not match a committed Contacts event.",
    409,
  );
  const operationId = `contacts-birthdays:${(await digest(input.eventId)).slice(0, 48)}`;
  const prior = await operationStatus(env.DB, input.schoolId, operationId);
  if (prior?.state === "committed")
    return { state: "committed", operationId, result: prior.receipt.result };
  need(
    env.CONTACTS_CALENDAR?.readBirthdays,
    "CONTACTS_BINDING_REQUIRED",
    "Birthday projection binding unavailable.",
    503,
  );
  const projection = await env.CONTACTS_CALENDAR.readBirthdays();
  need(
    projection?.schoolId === input.schoolId &&
      projection.source === "contacts" &&
      projection.complete === true &&
      Array.isArray(projection.staff) &&
      projection.staff.length <= 512 &&
      /^contacts-\d+$/.test(projection.revision),
    "SOURCE_INCOMPLETE",
    "Incomplete Contacts evidence cannot remove existing birthdays.",
    503,
  );
  const sourceSequence = Number(projection.revision.slice(9));
  const years = await query(
    env.DB,
    "SELECT * FROM calendar_years WHERE school_id=? AND status<>'ARCHIVED' ORDER BY year LIMIT 9",
    [input.schoolId],
  );
  need(
    years.length <= 8,
    "YEAR_BOUNDS",
    "Birthday reconciliation supports at most eight open years.",
    413,
  );
  const guards = [],
    writes = [];
  let staged = 0,
    updated = 0;
  for (const yr of years) {
    const s = input.schoolId,
      y = yr.year,
      head = await one(
        env.DB,
        "SELECT * FROM calendar_birthday_heads WHERE school_id=? AND year=?",
        [s, y],
      );
    if (head && head.source_sequence > sourceSequence) continue;
    guards.push(
      guardRow("calendar_years", "school_id=? AND year=?", [s, y], yr.revision),
    );
    guards.push({
      sql: head
        ? "SELECT EXISTS(SELECT 1 FROM calendar_birthday_heads WHERE school_id=? AND year=? AND source_sequence=?) AS ok"
        : "SELECT NOT EXISTS(SELECT 1 FROM calendar_birthday_heads WHERE school_id=? AND year=?) AS ok",
      args: head ? [s, y, head.source_sequence] : [s, y],
    });
    const oldRows = await query(
      env.DB,
      "SELECT * FROM calendar_events WHERE school_id=? AND year=? AND json_extract(data_json,'$.OwnerTag')='birthday' LIMIT 513",
      [s, y],
    );
    need(
      oldRows.length <= 512,
      "BOUNDS_EXCEEDED",
      "Birthday event count exceeds its bound.",
      413,
    );
    const expected = [];
    for (const staff of projection.staff) {
      need(
        staff.active === true &&
          typeof staff.staffId === "string" &&
          typeof staff.name === "string",
        "PROJECTION_INVALID",
        "Invalid birthday projection.",
        503,
      );
      if (!staff.birthday) continue;
      need(
        /^\d{2}-\d{2}$/.test(staff.birthday),
        "PROJECTION_INVALID",
        "Birthday must be month and day only.",
        503,
      );
      const date = `${y}-${staff.birthday}`;
      if (!isoDate(date)) continue;
      const eid = `birthday-${y}-${staff.staffId}`,
        old = oldRows.find((r) => r.event_id === eid);
      const event = validateEvent(
        {
          EventID: eid,
          Year: y,
          StaffTitle: `${staff.name}'s birthday`,
          StartDate: date,
          EndDate: date,
          EventType: "ALL_DAY",
          LaneID: "day",
          OwnerTag: "birthday",
          Status: "HIDDEN",
          ParentEnabled: "No",
        },
        null,
        now,
        "system:contacts-birthdays",
      );
      Object.assign(event, {
        SourceStaffId: staff.staffId,
        ContactsRevision: projection.revision,
        DeletedAt: "",
      });
      expected.push({
        eventId: eid,
        revision: (old?.revision || 0) + 1,
        event,
      });
    }
    if (yr.released) {
      const candidates = [
        ...expected.map((r) => ({
          eventId: r.eventId,
          data: r.event,
          deleted: 0,
        })),
        ...oldRows
          .filter(
            (r) =>
              !expected.some((e) => e.eventId === r.event_id) && !r.deleted_at,
          )
          .map((r) => ({ eventId: r.event_id, data: null, deleted: 1 })),
      ];
      writes.push(
        {
          sql: "DELETE FROM calendar_birthday_pending WHERE school_id=? AND year=?",
          args: [s, y],
        },
        {
          sql: "INSERT INTO calendar_birthday_pending SELECT ?,?,json_extract(value,'$.eventId'),?,json_extract(value,'$.data'),json_extract(value,'$.deleted'),? FROM json_each(?)",
          args: [s, y, projection.revision, now, canonical(candidates)],
        },
      );
      staged += candidates.length;
    } else {
      writes.push({
        sql: "UPDATE calendar_events SET revision=revision+1,deleted_at=?,data_json=json_set(data_json,'$.DeletedAt',?) WHERE school_id=? AND year=? AND json_extract(data_json,'$.OwnerTag')='birthday' AND deleted_at IS NULL AND event_id NOT IN(SELECT json_extract(value,'$.eventId') FROM json_each(?))",
        args: [
          new Date(now).toISOString(),
          new Date(now).toISOString(),
          s,
          y,
          canonical(expected),
        ],
      });
      writes.push({
        sql: "INSERT INTO calendar_events(school_id,event_id,year,revision,status,start_date,end_date,deleted_at,data_json) SELECT ?,json_extract(value,'$.eventId'),?,json_extract(value,'$.revision'),'HIDDEN',json_extract(value,'$.event.StartDate'),json_extract(value,'$.event.EndDate'),NULL,json_extract(value,'$.event') FROM json_each(?) WHERE 1 ON CONFLICT(school_id,event_id) DO UPDATE SET revision=excluded.revision,status=excluded.status,start_date=excluded.start_date,end_date=excluded.end_date,deleted_at=NULL,data_json=excluded.data_json",
        args: [s, y, canonical(expected)],
      });
      updated += expected.length;
    }
    writes.push(
      {
        sql: "UPDATE calendar_years SET revision=revision+1 WHERE school_id=? AND year=?",
        args: [s, y],
      },
      {
        sql: "INSERT INTO calendar_birthday_heads VALUES(?,?,?,?,?) ON CONFLICT(school_id,year) DO UPDATE SET source_sequence=excluded.source_sequence,contacts_revision=excluded.contacts_revision,event_id=excluded.event_id",
        args: [s, y, sourceSequence, projection.revision, input.eventId],
      },
    );
  }
  const op = await prepareOperation(env.DB, {
    schoolId: input.schoolId,
    actorId: "system:contacts-birthdays",
    operationId,
    action: "internal.calendar.contacts-birthdays",
    intent: {
      eventId: input.eventId,
      sourceOperationId: input.sourceOperationId,
    },
    now,
    validUntil: now + 60000,
  });
  await protectCalendarChanges(env, op, guards, writes, now);
  const receipt = await commitOperation(env.DB, op, {
    now,
    guards,
    writes,
    result: {
      contactsRevision: projection.revision,
      updated,
      staged,
      externalSync: "none",
      releaseChanged: false,
    },
    audit: {
      sourceOperationId: input.sourceOperationId,
      eventId: input.eventId,
    },
    admission: {
      kind: "system",
      reason:
        "Named Contacts binding, durable committed birthday event, complete purpose-limited projection; released snapshots preserved",
    },
  });
  return { state: "committed", operationId, result: receipt.result };
}

async function syncRunStatus(ctx, p) {
  const s = ctx.principal.schoolId,
    runId = id(p.syncRunId);
  const run = await one(
    ctx.env.DB,
    "SELECT * FROM calendar_sync_runs WHERE school_id=? AND run_id=?",
    [s, runId],
  );
  need(run, "SYNC_NOT_FOUND", "The original sync run was not found.", 404);
  const rows = await query(
    ctx.env.DB,
    "SELECT i.target,i.tombstone,j.state,j.last_code FROM calendar_sync_run_items i JOIN product_outbox j ON j.school_id=i.school_id AND j.job_id=i.job_id WHERE i.school_id=? AND i.run_id=? LIMIT 10001",
    [s, runId],
  );
  need(
    rows.length <= 10000,
    "BOUNDS_EXCEEDED",
    "Sync contains too many entries.",
    413,
  );
  const expand = await query(
    ctx.env.DB,
    "SELECT state FROM product_outbox WHERE school_id=? AND operation_id=? AND type='calendar.sync-year'",
    [s, runId],
  );
  const unfinished =
    rows.filter((r) => ["queued", "leased"].includes(r.state)).length +
    expand.filter((r) => ["queued", "leased"].includes(r.state)).length;
  const failures = [...rows, ...expand].filter((r) =>
    ["failed", "uncertain"].includes(r.state),
  );
  const counts = {
    staffCreates: 0,
    staffUpdates: 0,
    staffDeletes: 0,
    parentCreates: 0,
    parentUpdates: 0,
    parentDeletes: 0,
    errorCount: failures.length,
    errors: failures
      .slice(0, 30)
      .map((r) => ({ code: r.last_code || r.state })),
  };
  for (const r of rows)
    if (["accepted", "delivered"].includes(r.state))
      counts[r.target + (r.tombstone ? "Deletes" : "Updates")]++;
  const processed = rows.filter(
      (r) => !["queued", "leased"].includes(r.state),
    ).length,
    writes =
      counts.staffUpdates +
      counts.staffDeletes +
      counts.parentUpdates +
      counts.parentDeletes,
    completed = unfinished === 0;
  return {
    syncRunId: runId,
    year: run.year,
    target: run.target,
    completed,
    fullySynced: completed && failures.length === 0,
    inProgress: unfinished > 0,
    manualReview: failures.length > 0,
    paused: failures.length > 0,
    initialPending:
      rows.length +
      expand.filter((r) => ["queued", "leased"].includes(r.state)).length,
    processedTotal: processed,
    remaining: unfinished,
    blockedCount: failures.length,
    writes,
    counts,
    retryAfterMs: 5000,
    receiptStatus: completed
      ? failures.length
        ? "requires-review"
        : "confirmed"
      : "pending",
  };
}

async function externalWipePreview(ctx, p) {
  const { listCalendarYear } = await import("./external.mjs"),
    y = year(p.year || p.Year),
    target = p.target || "staff",
    source = await listCalendarYear(ctx.env, target, y);
  const binding = {
    schoolId: ctx.principal.schoolId,
    actorId: ctx.principal.actorId,
    year: y,
    target,
    calendarId: source.calendarId,
    events: source.events.map((e) => ({ id: e.id, etag: e.etag })),
  };
  return {
    year: y,
    target,
    label: target === "parent" ? "Parent" : "Staff",
    calendarId: source.calendarId,
    calendarName: source.calendarId,
    effectiveUser: ctx.principal.displayName || ctx.principal.actorId,
    startDate: `${y}-01-01`,
    endDate: `${y}-12-31`,
    eventCount: source.events.length,
    sample: source.events.slice(0, 20),
    confirmationPhrase: `WIPE ${target.toUpperCase()} ${y}`,
    digest: await digest(binding),
    counts: { events: source.events.length },
    preview: binding,
  };
}
async function startExternalWipe(ctx, op, p) {
  const preview = await externalWipePreview(ctx, p);
  need(
    p.confirm === true &&
      p.previewDigest === preview.digest &&
      p.confirmationPhrase === preview.confirmationPhrase,
    "PREVIEW_CHANGED",
    "Confirm the exact current external Calendar preview before wiping.",
    409,
  );
  need(
    ctx.env.ARTIFACTS,
    "STORAGE_UNAVAILABLE",
    "Private wipe manifest storage unavailable.",
    503,
  );
  const key = `${ctx.principal.schoolId}/calendar/wipe/${preview.digest}.json`;
  await ctx.env.ARTIFACTS.put(key, canonical(preview.preview));
  const saved = await ctx.env.ARTIFACTS.get(key);
  need(
    saved && (await digest(JSON.parse(await saved.text()))) === preview.digest,
    "MANIFEST_UNCONFIRMED",
    "Wipe manifest could not be verified.",
    503,
  );
  const outbox = preview.eventCount
    ? [
        {
          id: `calendar-wipe-expand:${p.operationId}`,
          type: "calendar.wipe-expand",
          dueAt: ctx.now,
          payload: {
            key,
            digest: preview.digest,
            cursor: 0,
            decisionId: ctx.principal.decisionId,
          },
        },
      ]
    : [];
  return finish(
    ctx,
    op,
    [],
    [],
    {
      wipeId: p.operationId,
      wipeRunId: p.operationId,
      operationId: p.operationId,
      year: preview.year,
      target: preview.target,
      label: preview.label,
      initialCount: preview.eventCount,
      remaining: preview.eventCount,
      deleted: 0,
      completed: outbox.length === 0,
      inProgress: outbox.length > 0,
      localEventsPreserved: true,
    },
    outbox,
  );
}
async function externalWipeStatus(ctx, p) {
  const runId = id(p.wipeId || p.wipeRunId || p.operationId || p.sessionId),
    op = await operationStatus(ctx.env.DB, ctx.principal.schoolId, runId);
  need(
    op?.state === "committed" && op.action === "calendar.startCalendarWipe",
    "WIPE_NOT_FOUND",
    "Original external wipe operation not found.",
    404,
  );
  const rows = await query(
    ctx.env.DB,
    "SELECT state,last_code,type FROM product_outbox WHERE school_id=? AND operation_id=? AND type IN('calendar.wipe','calendar.wipe-expand') LIMIT 5200",
    [ctx.principal.schoolId, runId],
  );
  const remaining = rows.filter((r) =>
      ["queued", "leased"].includes(r.state),
    ).length,
    deleted = rows.filter(
      (r) => r.state === "delivered" && r.type === "calendar.wipe",
    ).length,
    failed = rows.filter((r) => ["failed", "uncertain"].includes(r.state));
  return {
    ...op.receipt.result,
    remaining,
    deleted,
    deletedTotal: deleted,
    errors: failed.map((r) => ({ error: r.last_code || r.state })),
    completed: remaining === 0 && failed.length === 0,
    inProgress: remaining > 0,
    manualReview: failed.length > 0,
    paused: failed.length > 0,
    pauseReason: failed[0]?.last_code || null,
    retryAfterMs: 5000,
  };
}
export async function executeWipeJob(env, job) {
  await currentJobPrincipal(env, job);
  const { dispatchProvider } = await import("../../runtime/providers.mjs"),
    p = job.payload,
    s = job.school_id;
  const local = await one(
    env.DB,
    "SELECT * FROM calendar_sync WHERE school_id=? AND target=? AND remote_id=?",
    [s, p.target, p.eventId],
  );
  const lockId = local?.event_id || `external:${p.eventId}`,
    intent = job.job_id,
    now = Date.now();
  const lock = await env.DB.prepare(
    "INSERT OR IGNORE INTO calendar_dispatch_locks VALUES(?,?,?,?,'sending',?,?)",
  )
    .bind(s, p.target, lockId, intent, now, now)
    .run();
  if (lock.meta.changes !== 1)
    return {
      state: "failed",
      code: "PRIOR_PROVIDER_OUTCOME_UNRESOLVED",
      retryable: true,
    };
  const result = await dispatchProvider(env, {
    provider: "google-calendar",
    operation: "delete",
    calendarId: p.calendarId,
    eventId: p.eventId,
    etag: p.etag,
  });
  if (result.state === "uncertain")
    await env.DB.prepare(
      "UPDATE calendar_dispatch_locks SET state='uncertain' WHERE school_id=? AND target=? AND event_id=? AND intent_id=?",
    )
      .bind(s, p.target, lockId, intent)
      .run();
  else {
    if (result.state === "delivered" && local)
      await env.DB.prepare(
        "UPDATE calendar_sync SET state='delivered',tombstone=1 WHERE school_id=? AND target=? AND event_id=? AND intent_id=?",
      )
        .bind(s, p.target, local.event_id, local.intent_id)
        .run();
    await env.DB.prepare(
      "DELETE FROM calendar_dispatch_locks WHERE school_id=? AND target=? AND event_id=? AND intent_id=?",
    )
      .bind(s, p.target, lockId, intent)
      .run();
  }
  return result;
}

async function externalReconciliation(ctx, p) {
  const { listCalendarYear } = await import("./external.mjs"),
    y = year(p.year),
    target = p.target || "staff",
    observed = await listCalendarYear(ctx.env, target, y),
    s = ctx.principal.schoolId;
  const local = await query(
    ctx.env.DB,
    "SELECT q.*,e.status,e.deleted_at,e.data_json AS event_json FROM calendar_sync q JOIN calendar_events e ON e.school_id=q.school_id AND e.event_id=q.event_id WHERE q.school_id=? AND q.target=? AND e.year=?",
    [s, target, y],
  );
  const remote = new Set(observed.events.map((e) => e.id)),
    linked = new Set(local.map((e) => e.remote_id));
  const desired = await query(
    ctx.env.DB,
    "SELECT event_id,data_json FROM calendar_events WHERE school_id=? AND year=? AND status='PUBLISHED' AND deleted_at IS NULL",
    [s, y],
  );
  return {
    year: y,
    target,
    calendarName: observed.calendarId,
    linkedPresent: local.filter((e) => remote.has(e.remote_id)).length,
    linkedMissing: local.filter((e) => !remote.has(e.remote_id)).length,
    desiredUnlinked: desired.filter(
      (e) =>
        (target === "staff" || yes(JSON.parse(e.data_json).ParentEnabled)) &&
        !local.some((q) => q.event_id === e.event_id),
    ).length,
    linkedButUndesired: local.filter(
      (e) =>
        e.deleted_at ||
        e.status !== "PUBLISHED" ||
        (target === "parent" && !yes(JSON.parse(e.event_json).ParentEnabled)),
    ).length,
    unlinkedCalendarEvents: observed.events.filter((e) => !linked.has(e.id))
      .length,
    hashDrift: local.filter((e) => {
      const remote = observed.events.find((r) => r.id === e.remote_id);
      if (!remote) return false;
      const value = JSON.parse(e.event_json),
        title =
          target === "parent"
            ? value.ParentTitle || value.StaffTitle
            : value.StaffTitle;
      return (
        remote.summary !== title || !remote.start.startsWith(value.StartDate)
      );
    }).length,
    comparedFields: ["summary", "start date"],
    duplicateLookingGroups: [
      ...observed.events
        .reduce(
          (m, e) =>
            m.set(
              canonical([e.summary, e.start]),
              (m.get(canonical([e.summary, e.start])) || 0) + 1,
            ),
          new Map(),
        )
        .values(),
    ].filter((n) => n > 1).length,
    duplicateAnalysis:
      "Same summary and start observation only; provider IDs remain authoritative",
    observedAt: ctx.now,
    readOnly: true,
  };
}

async function protectCalendarChanges(env, op, guards, writes, now) {
  const years = new Set();
  for (const write of writes) {
    if (/^INSERT INTO calendar_years\b/i.test(write.sql))
      years.add(Number(write.args[1]));
    else if (/^UPDATE calendar_years\b/i.test(write.sql))
      years.add(Number(write.args.at(-1)));
  }
  for (const y of [...years].sort((a, b) => a - b)) {
    const scope = `year:${year(y)}`;
    let held = await queueSourceChange(
      env.DB,
      op.schoolId,
      scope,
      op.operationId,
      now,
      "calendar",
    );
    if (held.length) {
      await requestSourceCancellations(
        { ...env, SERVICE_NAME: "calendar" },
        held,
      );
      held = await queueSourceChange(
        env.DB,
        op.schoolId,
        scope,
        op.operationId,
        now,
        "calendar",
      );
    }
    need(
      !held.length,
      "SOURCE_CHANGE_PENDING",
      "A dependent operation must resolve before this Calendar revision can change.",
      409,
    );
    guards.push(
      sourceChangeGuard(op.schoolId, scope, op.operationId, "calendar"),
    );
    writes.push(sourceChangeDone(op.schoolId, scope, op.operationId));
  }
}

async function expandWipeJob(env, job) {
  const principal = await currentJobPrincipal(env, job),
    p = job.payload,
    now = Date.now(),
    source = await env.ARTIFACTS.get(p.key);
  need(
    source && source.size <= 2 * 1024 * 1024,
    "MANIFEST_UNAVAILABLE",
    "Wipe manifest unavailable.",
    503,
  );
  const manifest = JSON.parse(await source.text());
  need(
    (await digest(manifest)) === p.digest,
    "MANIFEST_CHANGED",
    "Wipe manifest changed.",
    409,
  );
  const batch = manifest.events.slice(p.cursor, p.cursor + 50),
    writes = [];
  for (const e of batch)
    writes.push({
      sql: "INSERT OR IGNORE INTO product_outbox(school_id,job_id,operation_id,type,payload_json,due_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      args: [
        job.school_id,
        `calendar-wipe:${(await digest([job.operation_id, e.id])).slice(0, 48)}`,
        job.operation_id,
        "calendar.wipe",
        canonical({
          schoolId: job.school_id,
          decisionId: p.decisionId,
          target: manifest.target,
          calendarId: manifest.calendarId,
          eventId: e.id,
          etag: e.etag,
          year: manifest.year,
        }),
        now,
        now,
      ],
    });
  if (p.cursor + 50 < manifest.events.length)
    writes.push({
      sql: "INSERT OR IGNORE INTO product_outbox(school_id,job_id,operation_id,type,payload_json,due_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      args: [
        job.school_id,
        `calendar-wipe-next:${(await digest([job.operation_id, p.cursor + 50])).slice(0, 48)}`,
        job.operation_id,
        "calendar.wipe-expand",
        canonical({ ...p, cursor: p.cursor + 50 }),
        now,
        now,
      ],
    });
  const op = await prepareOperation(env.DB, {
    schoolId: job.school_id,
    actorId: principal.actorId,
    operationId: `expand-wipe:${(await digest(job.job_id)).slice(0, 48)}`,
    action: "internal.calendar.expand-wipe",
    intent: { jobId: job.job_id, manifest: p.digest, cursor: p.cursor },
    now,
    validUntil: now + 60000,
  });
  await commitOperation(env.DB, op, {
    now,
    guards: [
      {
        sql: "SELECT EXISTS(SELECT 1 FROM product_outbox WHERE school_id=? AND job_id=? AND state='leased' AND fence=? AND lease_until>?) AS ok",
        args: [job.school_id, job.job_id, job.fence, now],
      },
    ],
    writes,
    result: { expanded: batch.length },
    admission: {
      kind: "system",
      reason:
        "Original committed Calendar wipe, current authority, immutable exact provider preview and leased bounded expansion",
    },
  });
  return { state: "delivered", providerId: op.operationId };
}
