import { reconcileProviderReceipts, deliveryAggregate } from "./receipts.mjs";
export {
  recordProviderReceipt,
  reconcileProviderReceipts,
} from "./receipts.mjs";
import { beginStaged } from "./projection.mjs";
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
import {
  admit,
  resolveAdmission,
  serviceCall,
  inspectDecision,
} from "../../runtime/security.mjs";
import { VenuesDomain as Domain } from "./domain.mjs";
const fail = (code, message, status = 400) => {
  throw new ApiError(code, status, message);
};
const need = (v, c, m, s = 400) => {
  if (!v) fail(c, m, s);
};
const isAdmin = (p) =>
  p?.capabilities?.some((c) =>
    ["admin", "core.admin", "global.admin", "venues.admin"].includes(c),
  );
const iso = (d) =>
  typeof d === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  new Date(d + "T00:00:00Z").toISOString().slice(0, 10) === d;
const id = (x) => {
  need(
    typeof x === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(x),
    "INVALID_ID",
    "A stable identifier is required.",
  );
  return x;
};
const parse = (r) => JSON.parse(r.data_json);
const held = (o) => o.status === "confirmed" || o.status === "pending";
const absolute = (date, minute) =>
  Date.parse(`${date}T00:00:00+08:00`) + minute * 60000;
const clock = (ctx) => ({
  now: new Date(ctx.now).toISOString(),
  today: new Date(ctx.now + 28800000).toISOString().slice(0, 10),
  uuid: () => crypto.randomUUID(),
});
export function policy(method, path, body = {}) {
  if (
    path === "/read" ||
    path === "/bootstrap" ||
    path === "/venues" ||
    path === "/receipt" ||
    path === "/export"
  )
    return {
      action: "venues.read",
      write: false,
      resourceId: String(body.venueId || "venues"),
    };
  if (path === "/command") {
    need(
      Domain.COMMANDS.includes(body.operation) ||
        body.operation === "importVenues",
      "INVALID_OPERATION",
      "Unknown Venues operation.",
    );
    return {
      action: [
        "saveGrant",
        "saveRoomOwners",
        "saveRoomMetadata",
        "importVenues",
        "sync",
      ].includes(body.operation)
        ? "venues.admin"
        : "venues.book",
      write: true,
      resourceId: String(body.venueId || body.id || "venues"),
    };
  }
  fail("NOT_FOUND", "Unknown Venues route.", 404);
}
function authorize(ctx, write) {
  need(
    ctx.principal?.schoolId && ctx.principal?.actorId,
    "SESSION_INVALID",
    "Sign in to Venues.",
    401,
  );
  if (write)
    need(
      !ctx.principal.impersonating,
      "IMPERSONATION_DENIED",
      "Preview is read-only.",
      403,
    );
  need(
    isAdmin(ctx.principal) ||
      ctx.principal.capabilities?.some((c) =>
        ["venues.read", "venues.book", "venues.manage"].includes(c),
      ),
    "CAPABILITY_DENIED",
    "Venues access required.",
    403,
  );
}
async function load(ctx, input = {}) {
  const s = ctx.principal.schoolId,
    db = ctx.env.DB,
    state = Domain.initialState();
  const records = await query(
    db,
    "SELECT r.*,COALESCE((SELECT e.revision FROM venues_epochs e WHERE e.school_id=r.school_id AND e.venue_id=CASE WHEN r.kind='venues' THEN r.record_id ELSE r.venue_id END),0) AS scope_revision FROM venues_records r WHERE school_id=? ORDER BY kind,record_id LIMIT 10001",
    [s],
  );
  need(
    records.length <= 10000,
    "BOUNDS_EXCEEDED",
    "Narrow the Venues date range.",
    413,
  );
  const persistent = new Map();
  for (const r of records) {
    persistent.set(`${r.kind}:${r.record_id}`, r);
    if (Domain.TABLES.includes(r.kind)) state[r.kind].push(parse(r));
  }
  state.revision = records.reduce((n, r) => Math.max(n, r.revision), 0);
  state.policyRevision = state.venues.reduce(
    (n, r) => Math.max(n, r.revision),
    0,
  );
  const principal = ctx.principal;
  const actor = {
    id: principal.staffId || principal.actorId,
    name: principal.displayName || principal.staffId || principal.actorId,
  };
  if (isAdmin(principal))
    state.grants.push({
      id: "core-authority",
      kind: "admin",
      staffId: actor.id,
      active: true,
      revision: 0,
    });
  if (!state.people.some((p) => p.id === actor.id))
    state.people.push({ id: actor.id, name: actor.name, active: true });
  const heads = await query(
    db,
    "SELECT * FROM venues_source_heads WHERE school_id=? ORDER BY source_domain",
    [s],
  );
  const fences = await query(
    db,
    "SELECT * FROM venues_source_fences WHERE school_id=? AND state='pending'",
    [s],
  );
  const today = new Date(ctx.now + 28800000).toISOString().slice(0, 10);
  const requestedDates = Array.isArray(input.dates)
    ? input.dates.filter(iso).sort()
    : [];
  const existingBooking = state.occurrences.find(
    (r) => r.id === (input.id || input.bookingId),
  );
  const windowFrom =
    requestedDates[0] ||
    (iso(input.date) ? input.date : existingBooking?.date) ||
    (iso(input.from) && !["bookings", "admin"].includes(input.operation)
      ? input.from
      : today);
  const windowTo =
    requestedDates.at(-1) ||
    (iso(input.date) ? input.date : existingBooking?.date) ||
    (iso(input.to) && !["bookings", "admin"].includes(input.operation)
      ? input.to
      : new Date(Date.parse(windowFrom) + 27 * 86400000)
          .toISOString()
          .slice(0, 10));
  need(
    windowTo >= windowFrom &&
      (Date.parse(windowTo) - Date.parse(windowFrom)) / 86400000 <
        (input.operation &&
        !["bootstrap", "manifest", "piece", "bookings", "admin"].includes(
          input.operation,
        )
          ? 366
          : 31),
    "BOUNDS_EXCEEDED",
    "Choose an occupancy window of at most 31 days.",
    413,
  );
  const intervals = await query(
    db,
    "SELECT * FROM venues_occupancy WHERE school_id=? AND kind='source' AND start_at<? AND end_at>? ORDER BY start_at LIMIT 50001",
    [s, absolute(windowTo, 1440), absolute(windowFrom, 0)],
  );
  need(
    intervals.length <= 50000,
    "BOUNDS_EXCEEDED",
    "Choose a smaller occupancy window.",
    413,
  );
  const coverages = heads
    .map((h) => ({ head: h, coverage: JSON.parse(h.metadata_json).coverage }))
    .filter((x) => x.coverage);
  for (const { coverage: c } of coverages) validateCoverage(c);
  const dates = coverages
    .flatMap((x) => [x.coverage.from, x.coverage.to])
    .sort();
  const coverage =
    dates.length && dates[0] <= windowTo && dates.at(-1) >= windowFrom
      ? {
          from: [dates[0], windowFrom].sort().at(-1),
          to: [dates.at(-1), windowTo].sort()[0],
        }
      : null;
  state.source.status = coverage ? "ready" : "unavailable";
  state.source.checkedAt = heads.length
    ? new Date(Math.min(...heads.map((h) => h.checked_at))).toISOString()
    : "";
  state.source.revision = Math.max(0, ...heads.map((h) => h.sequence));
  state.source.generation = await digest([
    windowFrom,
    windowTo,
    heads.map((h) => [h.source_domain, h.revision]),
  ]);
  state.source.keys = Object.fromEntries(
    heads.map((h) => [h.source_domain, h.revision]),
  );
  const periodMap = new Map();
  if (coverage) {
    need(
      (Date.parse(coverage.to) - Date.parse(coverage.from)) / 86400000 < 366,
      "BOUNDS_EXCEEDED",
      "Occupancy coverage must fit one year.",
      413,
    );
    for (
      let t = Date.parse(coverage.from);
      t <= Date.parse(coverage.to);
      t += 86400000
    ) {
      const d = new Date(t).toISOString().slice(0, 10),
        eligible = coverages.filter(
          (x) => x.coverage.from <= d && x.coverage.to >= d,
        ),
        chosen =
          eligible.find((x) => x.head.source_domain === `roster:${d}`) ||
          eligible.find((x) => x.head.source_domain.startsWith("roster")) ||
          eligible.find((x) => x.head.source_domain === "deploy");
      if (!chosen) {
        state.source.days.push({ date: d, covered: false });
        continue;
      }
      const periodIds = [];
      for (const p of chosen.coverage.periods) {
        const old = periodMap.get(p.id),
          pid =
            old && (old.start !== p.start || old.end !== p.end)
              ? `${p.id}@${p.start}`
              : p.id;
        periodMap.set(pid, { ...p, id: pid });
        periodIds.push(pid);
      }
      state.source.days.push({
        date: d,
        covered: true,
        venueIds: chosen.coverage.venueIds,
        periodIds,
        patternId: d,
        publicationKey: chosen.head.revision,
      });
      state.source.patterns[d] = intervals
        .filter(
          (r) =>
            (r.source_domain === chosen.head.source_domain ||
              r.source_domain === "calendar") &&
            new Date(r.start_at + 28800000).toISOString().slice(0, 10) === d,
        )
        .map((r) => ({
          venueId: r.venue_id,
          start: (r.start_at - absolute(d, 0)) / 60000,
          end: (r.end_at - absolute(d, 0)) / 60000,
          sourceId: r.record_id,
          kind: "timetable",
          label: r.source_domain?.startsWith("roster")
            ? "Confirmed timetable"
            : "Timetable",
          staffNames: [],
        }));
    }
  }
  state.source.periods = [...periodMap.values()];
  // Scoped fences are enforced by SQL at booking commit; display their uncertainty without globally blocking unrelated rooms.
  state.source.fences = {};
  state.source.pendingScopes = await query(
    db,
    "SELECT q.source_domain AS source,q.venue_id AS venueId,q.start_at AS start,q.end_at AS end,f.created_at AS beganAt FROM venues_fence_scopes q JOIN venues_source_fences f ON f.school_id=q.school_id AND f.source_domain=q.source_domain AND f.source_operation_id=q.source_operation_id WHERE q.school_id=? AND f.state='pending' AND q.start_at<? AND q.end_at>? LIMIT 1001",
    [s, absolute(windowTo, 1440), absolute(windowFrom, 0)],
  );
  state.source.manifest = {
    schema: 1,
    generation: state.source.generation,
    updatedAt: state.source.checkedAt,
    from: coverage?.from || "",
    to: coverage?.to || "",
    days: state.source.days,
    periods: state.source.periods,
    pieces: [],
    status: state.source.status,
    checkedAt: state.source.checkedAt,
  };
  if (
    coverage &&
    ["bootstrap", "manifest", "piece"].includes(input.operation)
  ) {
    const piece = await makePiece(state.source);
    state.source.pieceFiles[piece.key] = piece;
    state.source.manifest.pieces = [
      {
        key: piece.key,
        sha256: piece.sha256,
        encoding: piece.encoding,
        bytes: piece.bytes,
      },
    ];
  }
  if (
    ctx.env.CONTACTS &&
    ["bootstrap", "admin", "saveRoomOwners", "saveGrant"].includes(
      input.operation,
    )
  ) {
    const projected = await serviceCall(
      ctx.env,
      "contacts",
      "/internal/projection",
      { schoolId: s, decisionId: ctx.principal.decisionId, purpose: "venues" },
    );
    state.people = (
      projected.staff ||
      projected.people ||
      projected.records ||
      []
    ).map((p) => ({
      id: p.staffId || p.id,
      name: p.name || p.ttbName,
      active: p.active === true,
    }));
    if (!state.people.some((p) => p.id === actor.id))
      state.people.push({ id: actor.id, name: actor.name, active: true });
  }
  return { state, actor, persistent, heads, fences, windowFrom, windowTo };
}
async function refreshProof(ctx, loaded) {
  const { heads, state } = loaded;
  need(
    heads.length > 0,
    "SOURCE_NOT_READY",
    "Import and verify the current timetable source before booking.",
    503,
  );
  for (const head of heads) {
    if (
      head.source_domain === "roster" ||
      head.source_domain.startsWith("roster:")
    ) {
      const metadata = JSON.parse(head.metadata_json),
        coverage = metadata.coverage;
      if (
        !coverage ||
        coverage.to < loaded.windowFrom ||
        coverage.from > loaded.windowTo
      )
        continue;
      if (
        head.source_domain === "roster:baseline" &&
        state.source.days.every(
          (d) => !d.covered || d.publicationKey !== head.revision,
        )
      )
        continue;
      const proof = await serviceCall(
        ctx.env,
        "roster",
        "/internal/source-current",
        {
          schoolId: ctx.principal.schoolId,
          decisionId: ctx.principal.decisionId,
          sourceOperationId: metadata.sourceOperationId,
          sourceKind: metadata.sourceKind,
          from: loaded.windowFrom,
          to: loaded.windowTo,
        },
      );
      need(
        proof?.current === true,
        "SOURCE_CHANGED",
        "Roster occupancy changed. Refresh the source.",
        409,
      );
    } else if (head.source_domain === "deploy") {
      const proof = await serviceCall(
        ctx.env,
        "deploy",
        "/internal/current-publication",
        {
          schoolId: ctx.principal.schoolId,
          decisionId: ctx.principal.decisionId,
        },
      );
      need(
        proof && String(proof.revision ?? proof.sequence) === head.revision,
        "SOURCE_CHANGED",
        "Deploy publication changed. Refresh the source.",
        409,
      );
    }
  }
  state.source.checkedAt = new Date(ctx.now).toISOString();
}
function rowGuard(s, kind, recordId, old) {
  return {
    sql: old
      ? "SELECT EXISTS(SELECT 1 FROM venues_records WHERE school_id=? AND kind=? AND record_id=? AND revision=?) AS ok"
      : "SELECT NOT EXISTS(SELECT 1 FROM venues_records WHERE school_id=? AND kind=? AND record_id=?) AS ok",
    args: old ? [s, kind, recordId, old.revision] : [s, kind, recordId],
  };
}
function recordWrite(s, kind, r) {
  return {
    sql: "INSERT INTO venues_records(school_id,kind,record_id,revision,service_date,venue_id,status,data_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(school_id,kind,record_id) DO UPDATE SET revision=excluded.revision,service_date=excluded.service_date,venue_id=excluded.venue_id,status=excluded.status,data_json=excluded.data_json",
    args: [
      s,
      kind,
      r.id,
      r.revision || 1,
      r.date || r.from || null,
      r.venueId || null,
      r.status || null,
      canonical(r),
    ],
  };
}
function overlapGuard(
  s,
  venue,
  start,
  end,
  ignoreId = "",
  waivedSource = false,
) {
  const buffer = (venue.bufferMinutes || 0) * 60000;
  return {
    sql: `SELECT NOT EXISTS(SELECT 1 FROM venues_occupancy WHERE school_id=? AND (venue_id=? OR (?<>'' AND overlap_group=?)) AND record_id<>? AND (?=0 OR kind<>'source') AND status IN ('confirmed','pending','active') AND start_at-buffer_ms<? AND end_at+buffer_ms>?) AS ok`,
    args: [
      s,
      venue.id,
      venue.overlapGroup || "",
      venue.overlapGroup || "",
      ignoreId,
      Number(waivedSource),
      end + buffer,
      start - buffer,
    ],
  };
}
function fenceGuard(s, venue, start, end) {
  return {
    sql: `SELECT NOT EXISTS(SELECT 1 FROM venues_fence_scopes q JOIN venues_source_fences f ON f.school_id=q.school_id AND f.source_domain=q.source_domain AND f.source_operation_id=q.source_operation_id WHERE q.school_id=? AND f.state='pending' AND (q.venue_id=? OR EXISTS(SELECT 1 FROM venues_records v WHERE v.school_id=q.school_id AND v.kind='venues' AND v.record_id=q.venue_id AND ?<>'' AND json_extract(v.data_json,'$.overlapGroup')=?)) AND q.start_at<? AND q.end_at>?) AS ok`,
    args: [
      s,
      venue.id,
      venue.overlapGroup || "",
      venue.overlapGroup || "",
      end + (venue.bufferMinutes || 0) * 60000,
      start - (venue.bufferMinutes || 0) * 60000,
    ],
  };
}
async function command(ctx, input) {
  const s = ctx.principal.schoolId;
  const operationId = id(input.operationId || input.requestId);
  const op = await prepareOperation(ctx.env.DB, {
    schoolId: s,
    actorId: ctx.principal.actorId,
    operationId,
    action: `venues.${input.operation}`,
    intent: Object.fromEntries(
      Object.entries(input).filter(([k]) => k !== "attemptRequestId"),
    ),
    now: ctx.now,
    validUntil: ctx.principal.validUntil,
    authorization: ctx.principal,
  });
  if (op.state === "committed") return op.receipt.result;
  need(
    op.state === "prepared",
    "OPERATION_ABORTED",
    "Operation was fenced; review before starting another.",
    409,
  );
  const loaded = await load(ctx, input),
    { state, actor, persistent } = loaded;
  let after, result;
  const c = clock(ctx);
  if (
    ["book", "decide", "requestTransfer", "decideTransfer"].includes(
      input.operation,
    ) ||
    (input.operation === "amend" && (input.date || input.periodIds))
  )
    await refreshProof(ctx, loaded);
  if (input.operation === "importVenues") {
    need(
      isAdmin(ctx.principal),
      "CAPABILITY_DENIED",
      "Venues administrator required.",
      403,
    );
    need(
      Array.isArray(input.venues) && input.venues.length <= 1000,
      "INVALID_IMPORT",
      "Provide a bounded venue table.",
    );
    after = structuredClone(state);
    const seen = new Set();
    for (const v of input.venues) {
      id(v.id);
      need(
        !seen.has(v.id) &&
          typeof v.name === "string" &&
          v.name.trim() &&
          v.name.length <= 300 &&
          Number.isSafeInteger(v.capacity) &&
          v.capacity >= 0 &&
          v.capacity <= 100000,
        "INVALID_VENUE",
        "Provide stable IDs, names and valid capacities.",
      );
      seen.add(v.id);
      const old = state.venues.find((r) => r.id === v.id);
      need(
        Number(v.revision || 0) === (old?.revision || 0),
        "REVISION_CONFLICT",
        "A venue changed since the preview.",
        409,
      );
      const safe = {
        id: v.id,
        unit: v.unit || v.id,
        name: v.name,
        capacity: v.capacity,
        bookable: v.bookable === true,
        special: v.special === true,
        approvalMode: v.approvalMode === "approval" ? "approval" : "immediate",
        open: v.open || "07:00",
        close: v.close || "18:00",
        bufferMinutes: v.bufferMinutes || 0,
        overlapGroup: v.overlapGroup || "",
        features: v.features || [],
        aliases: v.aliases || [],
        revision: (old?.revision || 0) + 1,
      };
      if (old)
        after.venues[after.venues.findIndex((r) => r.id === v.id)] = safe;
      else after.venues.push(safe);
    }
    result = { venues: after.venues, imported: input.venues.length };
  } else if (input.operation === "saveRoomMetadata") {
    need(
      isAdmin(ctx.principal),
      "CAPABILITY_DENIED",
      "Venues administrator required.",
      403,
    );
    after = structuredClone(state);
    const v = after.venues.find(
      (v) => v.id === (input.venueId || input.unitNumber),
    );
    need(v, "NOT_FOUND", "Venue not found.", 404);
    need(
      v.revision === input.revision,
      "REVISION_CONFLICT",
      "Room metadata changed.",
      409,
    );
    const fields = input.fields || {};
    need(
      Object.keys(fields).length &&
        Object.keys(fields).every((k) =>
          ["name", "shortName", "capacity", "capacityBasis", "notes"].includes(
            k,
          ),
        ),
      "FIELD_DENIED",
      "Only physical room metadata can be changed here.",
      403,
    );
    for (const [k, value] of Object.entries(fields)) {
      if (k === "capacity")
        need(
          value === null ||
            (Number.isSafeInteger(value) && value >= 0 && value <= 100000),
          "INVALID_CAPACITY",
          "Capacity must be a non-negative integer or blank.",
        );
      else
        need(
          typeof value === "string" &&
            value.length <= 2000 &&
            !(k === "name" && !value.trim()),
          "INVALID_TEXT",
          "Use a bounded room label.",
        );
      v[k] = value;
    }
    v.revision++;
    result = { venues: [v], message: "Room metadata saved." };
  } else {
    try {
      ({ state: after, result } = Domain.execute(
        state,
        actor,
        {
          ...input,
          requestId: operationId,
          expectedRevision:
            input.expectedRevision ?? input.revision ?? state.revision,
        },
        c,
      ));
    } catch (e) {
      throw new ApiError(
        e.code || "INVALID_OPERATION",
        e.status || 409,
        e.message,
        { conflicts: e.conflicts },
      );
    }
  }
  const guards = [],
    writes = [],
    outbox = [],
    changedVenues = new Set();
  if (input.operation === "notificationDecision") {
    const updated = after.outbox.find((n) => n.id === input.id),
      old = persistent.get(`outbox:${input.id}`);
    need(updated && old, "NOT_FOUND", "Notification not found.", 404);
    guards.push(rowGuard(s, "outbox", input.id, old));
    guards.push({
      sql: "SELECT NOT EXISTS(SELECT 1 FROM product_outbox WHERE school_id=? AND job_id=? AND state='leased' AND lease_until>?) AS ok",
      args: [s, input.id, ctx.now],
    });
    writes.push(
      recordWrite(s, "outbox", updated),
      {
        sql: "UPDATE venues_deliveries SET state=?,reason_code='OWNER_RECONCILED',updated_at=?,dispatch_fence=dispatch_fence+1 WHERE school_id=? AND notification_id=? AND state NOT IN ('accepted','delivered')",
        args: [
          input.decision === "confirmSent" ? "delivered" : "queued",
          ctx.now,
          s,
          input.id,
        ],
      },
      {
        sql: "UPDATE product_outbox SET state=?,last_code='OWNER_RECONCILED',due_at=?,updated_at=?,fence=fence+1,lease_until=NULL WHERE school_id=? AND job_id=?",
        args: [
          input.decision === "confirmSent" ? "delivered" : "queued",
          ctx.now,
          ctx.now,
          s,
          input.id,
        ],
      },
    );
  }
  if (!isAdmin(ctx.principal))
    for (const grant of state.grants.filter(
      (g) => g.staffId === actor.id && g.id !== "core-authority",
    ))
      guards.push(
        rowGuard(s, "grants", grant.id, persistent.get(`grants:${grant.id}`)),
      );
  for (const kind of Domain.TABLES.filter(
    (k) => !["receipts", "nonces", "audit", "outbox", "people"].includes(k),
  )) {
    for (const r of after[kind]) {
      if (r.id === "core-authority") continue;
      const prior = persistent.get(`${kind}:${r.id}`);
      if (prior && canonical(parse(prior)) === canonical(r)) continue;
      guards.push(rowGuard(s, kind, r.id, prior));
      writes.push(recordWrite(s, kind, r));
      if (["venues", "occurrences", "closures"].includes(kind))
        changedVenues.add(kind === "venues" ? r.id : r.venueId);
      if (kind === "venues") {
        guards.push({
          sql: "SELECT NOT EXISTS(SELECT 1 FROM venues_fence_scopes q JOIN venues_source_fences f ON f.school_id=q.school_id AND f.source_domain=q.source_domain AND f.source_operation_id=q.source_operation_id WHERE q.school_id=? AND f.state='pending' AND (q.venue_id=? OR q.venue_id IN(SELECT record_id FROM venues_records WHERE school_id=? AND kind='venues' AND json_extract(data_json,'$.overlapGroup')<>'' AND json_extract(data_json,'$.overlapGroup') IN (?,?)))) AS ok",
          args: [
            s,
            r.id,
            s,
            r.overlapGroup || "",
            prior ? parse(prior).overlapGroup || "" : "",
          ],
        });
        writes.push({
          sql: "UPDATE venues_intervals SET overlap_group=?,buffer_ms=? WHERE school_id=? AND venue_id=?",
          args: [r.overlapGroup || "", (r.bufferMinutes || 0) * 60000, s, r.id],
        });
      }
      if (kind === "occurrences") {
        const venue = after.venues.find((v) => v.id === r.venueId);
        if (held(r)) {
          need(venue, "INVALID_VENUE", "Booking venue is missing.", 409);
          for (const interval of r.intervals) {
            const start = absolute(r.date, interval.start),
              end = absolute(r.date, interval.end);
            guards.push(fenceGuard(s, venue, start, end));
            const waiver = after.waivers.find(
              (w) => w.bookingId === r.id && w.active,
            );
            guards.push(overlapGuard(s, venue, start, end, r.id, !!waiver));
          }
        }
        writes.push({
          sql: "DELETE FROM venues_intervals WHERE school_id=? AND kind='booking' AND record_id=?",
          args: [s, r.id],
        });
        for (const interval of r.intervals)
          writes.push({
            sql: "INSERT INTO venues_intervals VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            args: [
              s,
              r.id,
              "booking",
              r.venueId,
              venue?.overlapGroup || "",
              absolute(r.date, interval.start),
              absolute(r.date, interval.end),
              (venue?.bufferMinutes || 0) * 60000,
              r.status,
              null,
              null,
            ],
          });
      }
      if (kind === "closures") {
        const venue = after.venues.find((v) => v.id === r.venueId);
        if (r.active && venue)
          guards.push(
            fenceGuard(
              s,
              venue,
              absolute(r.from, r.start),
              absolute(r.to, r.end),
            ),
          );
        const epoch =
          persistent.get(`venues:${r.venueId}`)?.scope_revision || 0;
        guards.push({
          sql: "SELECT COALESCE((SELECT revision FROM venues_epochs WHERE school_id=? AND venue_id=?),0)=? AS ok",
          args: [s, r.venueId, epoch],
        });
        writes.push({
          sql: "DELETE FROM venues_intervals WHERE school_id=? AND kind='closure' AND record_id=?",
          args: [s, r.id],
        });
        if (r.active)
          for (
            let t = Date.parse(r.from), n = 0;
            t <= Date.parse(r.to) && n < 366;
            t += 86400000, n++
          ) {
            const d = new Date(t).toISOString().slice(0, 10),
              venue = after.venues.find((v) => v.id === r.venueId);
            writes.push({
              sql: "INSERT INTO venues_intervals VALUES(?,?,?,?,?,?,?,?,?,?,?)",
              args: [
                s,
                r.id,
                "closure",
                r.venueId,
                venue?.overlapGroup || "",
                absolute(d, r.start),
                absolute(d, r.end),
                0,
                "active",
                null,
                null,
              ],
            });
          }
      }
    }
  }
  for (const v of state.venues) {
    if (
      after.occurrences.some(
        (o) =>
          o.venueId === v.id &&
          (!persistent.has(`occurrences:${o.id}`) ||
            canonical(o) !== persistent.get(`occurrences:${o.id}`).data_json),
      )
    )
      guards.push(
        rowGuard(s, "venues", v.id, persistent.get(`venues:${v.id}`)),
      );
  }
  for (const venueId of changedVenues)
    writes.push({
      sql: "INSERT INTO venues_epochs(school_id,venue_id,revision) VALUES(?,?,1) ON CONFLICT(school_id,venue_id) DO UPDATE SET revision=revision+1",
      args: [s, venueId],
    });
  for (const head of loaded.heads)
    guards.push({
      sql: "SELECT EXISTS(SELECT 1 FROM venues_source_heads WHERE school_id=? AND source_domain=? AND revision=?) AS ok",
      args: [s, head.source_domain, head.revision],
    });
  for (const n of after.outbox.filter(
    (n) => !state.outbox.some((old) => old.id === n.id),
  )) {
    writes.push(recordWrite(s, "outbox", n));
    outbox.push({
      id: n.id,
      type: "venues.notify",
      payload: {
        recordId: n.recordId,
        notificationId: n.id,
        venueId: n.venueId,
        decisionId: ctx.principal.decisionId,
      },
      dueAt: ctx.now,
    });
  }
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
    audit: {
      decisionId: ctx.principal.decisionId,
      changes: after.audit.slice(state.audit.length),
    },
    outbox,
    admission,
  });
  await resolveAdmission(ctx.env, ctx.env.DB, op, admission, receipt, ctx.now);
  return receipt.result;
}
function scopeRows(projection, { preserveDemands = false } = {}) {
  const rows = projection?.occupancies || projection?.occupancy;
  need(
    Array.isArray(rows) && rows.length <= 10000,
    "SOURCE_PROJECTION_REQUIRED",
    "An immutable source projection is required.",
    503,
  );
  const mapped = rows
    .map((r) => {
      id(r.venueId);
      const start = typeof r.start === "number" ? r.start : Date.parse(r.start),
        end = typeof r.end === "number" ? r.end : Date.parse(r.end);
      need(
        Number.isSafeInteger(start) &&
          Number.isSafeInteger(end) &&
          start < end &&
          end - start <= 86400000,
        "INVALID_PROJECTION",
        "Occupancy interval is invalid.",
        503,
      );
      return {
        venueId: r.venueId,
        start,
        end,
        sourceId: String(r.sourceId || `${r.venueId}:${start}`),
      };
    })
    .sort(
      (a, b) =>
        a.venueId.localeCompare(b.venueId) ||
        a.start - b.start ||
        a.end - b.end ||
        (preserveDemands ? a.sourceId.localeCompare(b.sourceId) : 0),
    );
  return mapped.filter(
    (r, i) =>
      !i ||
      r.venueId !== mapped[i - 1].venueId ||
      r.start !== mapped[i - 1].start ||
      r.end !== mapped[i - 1].end ||
      (preserveDemands && r.sourceId !== mapped[i - 1].sourceId),
  );
}
function physicalScopes(rows) {
  // Fences reserve physical intervals; adoption retains each lesson demand.
  return [...new Map(rows.map(({ venueId, start, end }) =>
    [canonical([venueId, start, end]), { venueId, start, end }])).values()]
    .sort((a, b) => a.venueId.localeCompare(b.venueId) || a.start - b.start || a.end - b.end);
}
async function sourceProof(ctx, input) {
  const s = input.schoolId;
  need(s === ctx.env.SCHOOL_ID, "SCHOOL_MISMATCH", "Wrong school.", 403);
  need(
    ["deploy", "roster", "calendar"].includes(input.sourceDomain),
    "SOURCE_DENIED",
    "Unknown occupancy owner.",
    403,
  );
  const expected = {
    schoolId: s,
    actions:
      input.sourceDomain === "deploy"
        ? ["deploy.publish"]
        : input.sourceDomain === "roster"
          ? [
              "roster.publish",
              "roster.write",
              "roster.allocate",
              "roster.admin",
            ]
          : ["calendar.admin"],
    operationId: input.sourceOperationId,
    service: input.sourceDomain,
  };
  const { principal, descriptor } = await inspectDecision(
    ctx.env,
    input.decisionId,
    expected,
  );
  need(
    !principal.impersonating,
    "IMPERSONATION_DENIED",
    "Preview cannot publish occupancy.",
    403,
  );
  const path =
    input.sourceDomain === "deploy"
      ? "/internal/publication-status"
      : "/internal/source-status";
  const proof = await serviceCall(ctx.env, input.sourceDomain, path, {
    schoolId: s,
    operationId: input.sourceOperationId,
    decisionId: input.decisionId,
  });
  need(
    proof &&
      proof.schoolId === s &&
      (proof.operationId || proof.sourceOperationId) ===
        input.sourceOperationId &&
      (proof.actorId === undefined || proof.actorId === principal.actorId) &&
      proof.digest === input.sourceDigest &&
      proof.fence === input.sourceFence,
    "SOURCE_PROOF_MISMATCH",
    "The owning operation does not match this fence.",
    409,
  );
  need(
    typeof principal.requestDigest === "string" &&
      proof.requestDigest === principal.requestDigest &&
      proof.authorityAction === descriptor.action,
    "SOURCE_PROOF_MISMATCH",
    "Source operation does not carry the decision request binding.",
    409,
  );
  return { proof, principal, descriptor };
}
export async function sourceBegin(ctx) {
  const x = ctx.body,
    { proof, principal } = await sourceProof(ctx, x);
  if (proof.projection?.staged) return beginStaged(ctx, proof, principal);
  need(
    ["prepared", "pending", "committed"].includes(proof.state),
    "SOURCE_ABORTED",
    "Source operation can no longer publish.",
    409,
  );
  const scopes = scopeRows(proof.projection);
  if (x.scopes !== undefined)
    need(
      canonical(
        scopes.map(({ venueId, start, end }) => ({ venueId, start, end })),
      ) ===
        canonical(
          x.scopes
            .map(({ venueId, start, end }) => ({ venueId, start, end }))
            .sort(
              (a, b) =>
                a.venueId.localeCompare(b.venueId) ||
                a.start - b.start ||
                a.end - b.end,
            ),
        ),
      "SOURCE_SCOPE_MISMATCH",
      "Fence scope must match the durable source projection.",
      409,
    );
  const old = await one(
    ctx.env.DB,
    "SELECT * FROM venues_source_fences WHERE school_id=? AND source_domain=? AND source_operation_id=?",
    [x.schoolId, x.sourceDomain, x.sourceOperationId],
  );
  if (old) {
    need(
      old.source_digest === x.sourceDigest &&
        old.source_fence === x.sourceFence,
      "SOURCE_FENCE_CONFLICT",
      "Source identity changed.",
      409,
    );
    return {
      state: old.state,
      sealed: true,
      sourceOperationId: x.sourceOperationId,
      sourceDigest: x.sourceDigest,
      sourceFence: x.sourceFence,
    };
  }
  need(
    proof.state !== "committed",
    "SOURCE_FENCE_MISSING",
    "A committed source cannot retrospectively acquire its publication fence.",
    409,
  );
  const op = await prepareOperation(ctx.env.DB, {
    schoolId: x.schoolId,
    actorId: principal.actorId,
    operationId: `fence:${(await digest([x.sourceDomain, x.sourceOperationId])).slice(0, 40)}`,
    action: "internal.venues.source-begin",
    intent: {
      sourceDomain: x.sourceDomain,
      sourceOperationId: x.sourceOperationId,
      digest: x.sourceDigest,
      fence: x.sourceFence,
      scopes,
    },
    now: ctx.now,
    validUntil: principal.validUntil,
  });
  if (op.state === "committed") return op.receipt.result;
  const guards = [],
    writes = [
      {
        sql: "INSERT INTO venues_source_fences VALUES(?,?,?,?,?,?,'pending',?,NULL,NULL)",
        args: [
          x.schoolId,
          x.sourceDomain,
          x.sourceOperationId,
          x.sourceDigest,
          x.sourceFence,
          x.decisionId,
          ctx.now,
        ],
      },
    ];
  const references = proof.projection?.referenceVenues || [];
  need(
    Array.isArray(references) && references.length <= 1000,
    "INVALID_REFERENCE",
    "Provide bounded canonical room references.",
    413,
  );
  const referenceIds = references.map((ref) => id(ref?.venueId));
  const roomIds = [
    ...new Set([...referenceIds, ...scopes.map((s) => s.venueId)]),
  ];
  // Count repeated SQL bindings, not only distinct JSON documents. Leave space
  // below the existing 1 MiB transport bound for the operation receipt/audit.
  let sqlBytes = 0;
  const sqlJson = (value, copies = 1) => {
    const json = JSON.stringify(value);
    sqlBytes += new TextEncoder().encode(json).byteLength * copies;
    need(
      sqlBytes < 1040000,
      "BOUNDS_EXCEEDED",
      "Source fence data exceeds the bounded owner transaction.",
      413,
    );
    return json;
  };
  const roomIdsJson = sqlJson(roomIds);
  const snapshot = await query(
    ctx.env.DB,
    "SELECT record_id,revision,data_json FROM venues_records WHERE school_id=? AND kind='venues' AND record_id IN (SELECT value FROM json_each(?))",
    [x.schoolId, roomIdsJson],
  );
  const rooms = new Map(snapshot.map((room) => [room.record_id, room]));
  // Validate every original reference before deduplication: conflicting repeated
  // revisions and numeric-looking strings must not pass SQLite coercion.
  for (const ref of references) {
    const room = rooms.get(ref.venueId);
    need(
      room && room.revision === ref.revision,
      "VENUE_REFERENCE_CHANGED",
      "Refresh canonical venue references before publication.",
      409,
    );
  }
  const occupied = scopes.map((scope) => {
    const venue = rooms.get(scope.venueId);
    need(
      venue,
      "INVALID_VENUE",
      "Source projection references an unknown venue.",
      409,
    );
    const v = parse(venue),
      group = v.overlapGroup || "",
      buffer = (v.bufferMinutes || 0) * 60000,
      bufferedEnd = scope.end + buffer,
      bufferedStart = scope.start - buffer;
    // Preserve the old scalar SQL bindings and JavaScript buffer arithmetic.
    // Malformed metadata must not turn into JSON text or SQL NULL and bypass a
    // conflict that the former per-room binding would have rejected.
    need(
      (typeof group === "string" ||
        (typeof group === "number" && Number.isFinite(group))) &&
        Number.isFinite(bufferedEnd) &&
        Number.isFinite(bufferedStart),
      "INVALID_VENUE",
      "Source venue conflict metadata is invalid.",
      409,
    );
    return [
      scope.venueId,
      scope.start,
      scope.end,
      group,
      bufferedEnd,
      bufferedStart,
    ];
  });
  const revisionsJson = sqlJson(
    roomIds.map((roomId) => [roomId, rooms.get(roomId).revision]),
  );
  const referencesJson = sqlJson([...new Set(referenceIds)]);
  const occupiedJson = sqlJson(occupied, scopes.length ? 3 : 0);
  guards.push({
    sql: `SELECT NOT EXISTS(
      SELECT 1 FROM json_each(?) AS expected
      LEFT JOIN venues_records AS current
        ON current.school_id=? AND current.kind='venues'
        AND current.record_id=json_extract(expected.value,'$[0]')
      WHERE current.record_id IS NULL
        OR current.revision<>json_extract(expected.value,'$[1]')
    ) AS ok`,
    args: [revisionsJson, x.schoolId],
  });
  if (scopes.length) {
    // Separate indexed lookups retain the original direct-or-linked rule without
    // a room-by-interval Cartesian scan. Revision guards above bind this captured
    // metadata to the same owner transaction as both conflict checks and writes.
    guards.push(
      {
        sql: `SELECT NOT EXISTS(
          SELECT 1 FROM json_each(?) AS scope
          CROSS JOIN venues_intervals AS occupied INDEXED BY venues_intervals_overlap
          WHERE occupied.school_id=?
            AND occupied.venue_id=json_extract(scope.value,'$[0]')
            AND occupied.kind IN ('booking','closure')
            AND occupied.status IN ('confirmed','pending','active')
            AND occupied.start_at-occupied.buffer_ms<json_extract(scope.value,'$[4]')
            AND occupied.end_at+occupied.buffer_ms>json_extract(scope.value,'$[5]')
        ) AS ok`,
        args: [occupiedJson, x.schoolId],
      },
      {
        sql: `SELECT NOT EXISTS(
          SELECT 1 FROM json_each(?) AS scope
          CROSS JOIN venues_intervals AS occupied INDEXED BY venues_intervals_linked
          WHERE occupied.school_id=?
            AND json_extract(scope.value,'$[3]')<>''
            AND occupied.overlap_group=json_extract(scope.value,'$[3]')
            AND occupied.kind IN ('booking','closure')
            AND occupied.status IN ('confirmed','pending','active')
            AND occupied.start_at-occupied.buffer_ms<json_extract(scope.value,'$[4]')
            AND occupied.end_at+occupied.buffer_ms>json_extract(scope.value,'$[5]')
        ) AS ok`,
        args: [occupiedJson, x.schoolId],
      },
    );
  }
  // Reference markers precede occupancies exactly as before. Explicit array
  // order preserves INSERT OR IGNORE's winner for equal room/start identities.
  writes.push({
    sql: "INSERT OR IGNORE INTO venues_fence_scopes SELECT ?,?,?,value,0,0 FROM json_each(?) ORDER BY CAST(key AS INTEGER)",
    args: [x.schoolId, x.sourceDomain, x.sourceOperationId, referencesJson],
  });
  if (scopes.length)
    writes.push({
      sql: "INSERT OR IGNORE INTO venues_fence_scopes SELECT ?,?,?,json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]') FROM json_each(?) ORDER BY CAST(key AS INTEGER)",
      args: [x.schoolId, x.sourceDomain, x.sourceOperationId, occupiedJson],
    });
  const result = {
    state: "pending",
    sourceOperationId: x.sourceOperationId,
    sourceDigest: x.sourceDigest,
    sourceFence: x.sourceFence,
    scopeCount: scopes.length,
    sealed: true,
  };
  const receipt = await commitOperation(ctx.env.DB, op, {
    now: ctx.now,
    validUntil: principal.validUntil,
    guards,
    writes,
    result,
    audit: {
      decisionId: x.decisionId,
      sourceDomain: x.sourceDomain,
      sourceOperationId: x.sourceOperationId,
    },
    admission: {
      kind: "system",
      reason:
        "Validated original source decision and durable prepared projection",
    },
  });
  return receipt.result;
}
export async function sourceComplete(ctx) {
  const x = ctx.body;
  need(
    x.schoolId === ctx.env.SCHOOL_ID,
    "SCHOOL_MISMATCH",
    "Wrong school.",
    403,
  );
  const old = await one(
    ctx.env.DB,
    "SELECT * FROM venues_source_fences WHERE school_id=? AND source_domain=? AND source_operation_id=?",
    [x.schoolId, x.sourceDomain, x.sourceOperationId],
  );
  if (!old) {
    const absentProof = await serviceCall(
      ctx.env,
      x.sourceDomain,
      x.sourceDomain === "deploy"
        ? "/internal/publication-status"
        : "/internal/source-status",
      {
        schoolId: x.schoolId,
        operationId: x.sourceOperationId,
        decisionId: x.decisionId,
      },
    );
    if (
      absentProof?.schoolId === x.schoolId &&
      absentProof.digest === x.sourceDigest &&
      absentProof.fence > x.sourceFence &&
      ["aborted", "terminal-not-committed"].includes(absentProof.state)
    )
      return {
        state: "aborted",
        fence: "not-created",
        sourceOperationId: x.sourceOperationId,
      };
  }
  need(
    old &&
      old.source_digest === x.sourceDigest &&
      old.source_fence === x.sourceFence,
    "SOURCE_FENCE_CONFLICT",
    "Source fence is missing or changed.",
    409,
  );
  if (old.state !== "pending") return JSON.parse(old.receipt_json);
  const path =
    x.sourceDomain === "deploy"
      ? "/internal/publication-status"
      : "/internal/source-status";
  const proof = await serviceCall(ctx.env, x.sourceDomain, path, {
    schoolId: x.schoolId,
    operationId: x.sourceOperationId,
    decisionId: old.decision_id,
  });
  need(
    proof &&
      proof.schoolId === x.schoolId &&
      proof.digest === old.source_digest &&
      (proof.state === "committed"
        ? proof.fence === old.source_fence
        : proof.fence > old.source_fence) &&
      ["committed", "aborted", "terminal-not-committed"].includes(proof.state),
    "SOURCE_UNRESOLVED",
    "Original source outcome is uncertain; fence remains held.",
    409,
  );
  if (proof.state === "committed")
    need(
      proof.fence === old.source_fence,
      "SOURCE_PROOF_MISMATCH",
      "Committed source fence differs.",
      409,
    );
  const stagedRow = await one(
    ctx.env.DB,
    "SELECT * FROM venues_projection_manifests WHERE school_id=? AND source_domain=? AND source_operation_id=?",
    [x.schoolId, x.sourceDomain, x.sourceOperationId],
  );
  const sourceCommitted = proof.state === "committed",
    scopes = sourceCommitted && !stagedRow
      ? scopeRows(proof.projection, { preserveDemands: true }) : [],
    stored = await query(
      ctx.env.DB,
      "SELECT venue_id AS venueId,start_at AS start,end_at AS end FROM venues_fence_scopes WHERE school_id=? AND source_domain=? AND source_operation_id=? AND end_at>start_at ORDER BY venue_id,start_at,end_at",
      [x.schoolId, x.sourceDomain, x.sourceOperationId],
    );
  if (sourceCommitted) {
    need(
      Boolean(stagedRow) === Boolean(proof.projection?.staged),
      "SOURCE_SCOPE_MISMATCH",
      "Committed source changed its projection representation.",
      409,
    );
    if (stagedRow)
      need(
        stagedRow.sealed === 1 &&
          stagedRow.manifest_digest ===
            proof.projection?.staged?.manifestDigest,
        "SOURCE_NOT_SEALED",
        "Source committed before all immutable chunks were validated.",
        409,
      );
    else
      need(
        canonical(physicalScopes(scopes)) === canonical(stored),
        "SOURCE_SCOPE_MISMATCH",
        "Committed projection differs from fenced scope.",
        409,
      );
  }
  const op = await prepareOperation(ctx.env.DB, {
    schoolId: x.schoolId,
    actorId: "system:venues-recovery",
    operationId: `fence-complete:${(await digest([x.sourceDomain, x.sourceOperationId])).slice(0, 40)}`,
    action: "internal.venues.source-complete",
    intent: {
      sourceOperationId: x.sourceOperationId,
      sourceDomain: x.sourceDomain,
      digest: x.sourceDigest,
      sourceState: proof.state,
    },
    now: ctx.now,
    validUntil: ctx.now + 60000,
  });
  if (op.state === "committed") return op.receipt.result;
  const guards = [
      {
        sql: "SELECT EXISTS(SELECT 1 FROM venues_source_fences WHERE school_id=? AND source_domain=? AND source_operation_id=? AND state='pending' AND source_digest=? AND source_fence=?) AS ok",
        args: [
          x.schoolId,
          x.sourceDomain,
          x.sourceOperationId,
          x.sourceDigest,
          x.sourceFence,
        ],
      },
    ],
    writes = [];
  const coverage = proof.projection?.coverage || null;
  const sourceKey =
    x.sourceDomain === "roster"
      ? proof.projection?.sourceKind === "baseline"
        ? "roster:baseline"
        : `roster:${coverage?.from}`
      : x.sourceDomain;
  const head = await one(
    ctx.env.DB,
    "SELECT * FROM venues_source_heads WHERE school_id=? AND source_domain=?",
    [x.schoolId, sourceKey],
  );
  const sequence = Number(
    proof.sequence ?? proof.revision ?? proof.projection?.revision,
  );
  if (sourceCommitted) {
    guards.push(
      head
        ? {
            sql: "SELECT EXISTS(SELECT 1 FROM venues_source_heads WHERE school_id=? AND source_domain=? AND sequence=?) AS ok",
            args: [x.schoolId, sourceKey, head.sequence],
          }
        : {
            sql: "SELECT NOT EXISTS(SELECT 1 FROM venues_source_heads WHERE school_id=? AND source_domain=?) AS ok",
            args: [x.schoolId, sourceKey],
          },
    );
    need(
      Number.isSafeInteger(sequence) && sequence >= (head?.sequence || 0),
      "STALE_PROJECTION",
      "A lower source revision cannot replace newer occupancy.",
      409,
    );
    writes.push({
      sql: "DELETE FROM venues_intervals WHERE school_id=? AND kind='source' AND source_domain=?",
      args: [x.schoolId, sourceKey],
    });
    for (const r of scopes) {
      const venue = await one(
        ctx.env.DB,
        "SELECT data_json FROM venues_records WHERE school_id=? AND kind='venues' AND record_id=?",
        [x.schoolId, r.venueId],
      );
      const v = parse(venue);
      writes.push({
        sql: "INSERT INTO venues_intervals VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        args: [
          x.schoolId,
          `${x.sourceDomain}:${r.sourceId}`,
          "source",
          r.venueId,
          v.overlapGroup || "",
          r.start,
          r.end,
          (v.bufferMinutes || 0) * 60000,
          "active",
          sourceKey,
          String(sequence),
        ],
      });
    }
    writes.push({
      sql: "INSERT INTO venues_source_heads VALUES(?,?,?,?,?,?,?) ON CONFLICT(school_id,source_domain) DO UPDATE SET revision=excluded.revision,sequence=excluded.sequence,checked_at=excluded.checked_at,digest=excluded.digest,metadata_json=excluded.metadata_json",
      args: [
        x.schoolId,
        sourceKey,
        String(sequence),
        sequence,
        ctx.now,
        x.sourceDigest,
        canonical({
          sourceDomain: x.sourceDomain,
          sourceOperationId: x.sourceOperationId,
          sourceKind: proof.projection?.sourceKind || "day",
          publicationId: proof.publicationId || null,
          coverage,
        }),
      ],
    });
  }
  const result = {
    state: sourceCommitted ? "adopted" : "aborted",
    sourceOperationId: x.sourceOperationId,
    revision: sourceCommitted ? String(sequence) : head?.revision || null,
  };
  writes.push({
    sql: "UPDATE venues_source_fences SET state=?,resolved_at=?,receipt_json=? WHERE school_id=? AND source_domain=? AND source_operation_id=?",
    args: [
      sourceCommitted ? "adopted" : "aborted",
      ctx.now,
      canonical(result),
      x.schoolId,
      x.sourceDomain,
      x.sourceOperationId,
    ],
  });
  const receipt = await commitOperation(ctx.env.DB, op, {
    now: ctx.now,
    guards,
    writes,
    result,
    admission: {
      kind: "system",
      reason:
        "Original source immutable receipt proves commitment or fenced abort",
    },
  });
  return receipt.result;
}
export async function internal(ctx) {
  if (ctx.path === "/internal/catalogue") {
    need(
      ctx.body.schoolId === ctx.env.SCHOOL_ID,
      "SCHOOL_MISMATCH",
      "Wrong school.",
      403,
    );
    await inspectDecision(ctx.env, ctx.body.decisionId, {
      schoolId: ctx.body.schoolId,
      actions: [
        "roster.read",
        "roster.admin",
        "roster.write",
        "roster.publish",
        "roster.allocate",
        "calendar.read",
        "calendar.admin",
        "deploy.read",
        "deploy.edit",
        "deploy.publish",
        "layout.read",
        "layout.edit",
        "venues.read",
        "venues.admin",
      ],
    });
    const rows = await query(
      ctx.env.DB,
      "SELECT data_json,revision FROM venues_records WHERE school_id=? AND kind='venues' ORDER BY record_id LIMIT 1001",
      [ctx.body.schoolId],
    );
    need(
      rows.length <= 1000,
      "BOUNDS_EXCEEDED",
      "Venue catalogue exceeds its bound.",
      413,
    );
    return {
      schemaVersion: 1,
      schoolId: ctx.body.schoolId,
      venues: rows.map((r) => {
        const v = parse(r);
        return {
          id: v.id,
          venueId: v.id,
          name: v.name,
          unit: v.unit,
          shortName: v.shortName || "",
          revision: r.revision,
        };
      }),
      revision: await digest(rows.map((r) => [parse(r).id, r.revision])),
      asOf: ctx.now,
    };
  }
  if (ctx.path === "/internal/notification-recipient")
    return notificationRecipient(ctx.env, ctx.body);
  if (ctx.path === "/internal/source-begin") return sourceBegin(ctx);
  if (ctx.path === "/internal/source-complete") return sourceComplete(ctx);
  if (ctx.path === "/internal/source-status") {
    need(
      ctx.body.schoolId === ctx.env.SCHOOL_ID,
      "SCHOOL_MISMATCH",
      "Wrong school.",
      403,
    );
    const r = await one(
      ctx.env.DB,
      "SELECT state,source_digest,source_fence,receipt_json FROM venues_source_fences WHERE school_id=? AND source_domain=? AND source_operation_id=?",
      [ctx.body.schoolId, ctx.body.sourceDomain, ctx.body.sourceOperationId],
    );
    return r
      ? {
          state: r.state,
          digest: r.source_digest,
          fence: r.source_fence,
          result: r.receipt_json ? JSON.parse(r.receipt_json) : null,
        }
      : { state: "unknown" };
  }
  fail("NOT_FOUND", "Unknown Venues internal route.", 404);
}
export async function handle(ctx) {
  if (ctx.internal) return internal(ctx);
  authorize(ctx, ctx.path === "/command");
  if (ctx.path === "/command") return command(ctx, ctx.body);
  if (ctx.path === "/receipt") {
    const op = await operationStatus(
      ctx.env.DB,
      ctx.principal.schoolId,
      id(
        ctx.body.operationId ||
          new URL(ctx.request.url).searchParams.get("operationId"),
      ),
    );
    need(
      !op || op.actorId === ctx.principal.actorId || isAdmin(ctx.principal),
      "CAPABILITY_DENIED",
      "That operation belongs to another actor.",
      403,
    );
    return op || { state: "unknown" };
  }
  const input =
    ctx.path === "/bootstrap" || ctx.path === "/venues"
      ? { operation: "bootstrap" }
      : ctx.body || {};
  const { state, actor } = await load(ctx, input);
  if (input.operation === "piece") {
    need(
      state.source.pieceFiles[input.key],
      "SOURCE_CHANGED",
      "Refresh the occupancy manifest.",
      409,
    );
    return state.source.pieceFiles[input.key];
  }
  if (ctx.path === "/export") {
    const rows = state.occurrences.filter(
      (r) =>
        isAdmin(ctx.principal) ||
        r.ownerId === actor.id ||
        r.requesterId === actor.id,
    );
    const quote = (x) => '"' + String(x ?? "").replaceAll('"', '""') + '"';
    return new Response(
      [
        ["Booking ID", "Venue", "Date", "Status"],
        ...rows.map((r) => [r.id, r.venueId, r.date, r.status]),
      ]
        .map((r) => r.map(quote).join(","))
        .join("\r\n"),
      { headers: { "content-type": "text/csv; charset=utf-8" } },
    );
  }
  try {
    const result = Domain.read(state, actor, input, clock(ctx));
    if (result.source) result.source.pendingScopes = state.source.pendingScopes;
    return result;
  } catch (e) {
    throw new ApiError(e.code || "INVALID_REQUEST", e.status || 400, e.message);
  }
}

async function makePiece(source) {
  const raw = new TextEncoder().encode(
    JSON.stringify({
      schema: 1,
      periods: source.periods,
      days: source.days,
      patterns: source.patterns,
    }),
  );
  need(
    raw.byteLength <= 2097152,
    "BOUNDS_EXCEEDED",
    "Use a smaller occupancy window.",
    413,
  );
  const compressed = new Uint8Array(
    await new Response(
      new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );
  const sha256 = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", compressed)),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  let binary = "";
  for (let i = 0; i < compressed.length; i += 8192)
    binary += String.fromCharCode(...compressed.subarray(i, i + 8192));
  return {
    key: source.generation + ".1",
    sha256,
    encoding: "gzip-base64-v1",
    bytes: raw.byteLength,
    data: btoa(binary),
  };
}

function validateCoverage(c) {
  need(
    c &&
      iso(c.from) &&
      iso(c.to) &&
      c.to >= c.from &&
      (Date.parse(c.to) - Date.parse(c.from)) / 86400000 < 366 &&
      Array.isArray(c.venueIds) &&
      c.venueIds.length <= 1000 &&
      new Set(c.venueIds).size === c.venueIds.length &&
      Array.isArray(c.periods) &&
      c.periods.length > 0 &&
      c.periods.length <= 64,
    "INVALID_COVERAGE",
    "Source coverage is incomplete.",
    503,
  );
  const ids = new Set();
  for (const p of c.periods) {
    id(p.id);
    need(
      !ids.has(p.id) &&
        Number.isSafeInteger(p.start) &&
        Number.isSafeInteger(p.end) &&
        p.start >= 0 &&
        p.end <= 1440 &&
        p.start < p.end,
      "INVALID_COVERAGE",
      "Period timing is invalid.",
      503,
    );
    ids.add(p.id);
  }
  for (const v of c.venueIds) id(v);
}

export async function notificationRecipient(env, input) {
  need(
    input.schoolId === env.SCHOOL_ID,
    "SCHOOL_MISMATCH",
    "Wrong school.",
    403,
  );
  const job = await one(
    env.DB,
    "SELECT * FROM product_outbox WHERE school_id=? AND job_id=? AND type='venues.notify'",
    [input.schoolId, input.jobId],
  );
  need(job, "NOT_FOUND", "Notification job not found.", 404);
  const payload = JSON.parse(job.payload_json),
    nrow = await one(
      env.DB,
      "SELECT * FROM venues_records WHERE school_id=? AND kind='outbox' AND record_id=?",
      [input.schoolId, payload.notificationId],
    );
  need(nrow, "NOT_FOUND", "Notification record unavailable.", 404);
  const n = parse(nrow);
  const record = await one(
    env.DB,
    "SELECT * FROM venues_records WHERE school_id=? AND kind IN ('occurrences','transfers') AND record_id=?",
    [input.schoolId, n.recordId],
  );
  if (!record || !n.participantIds?.includes(input.staffId))
    return { allowed: false };
  const current = parse(record);
  const obsolete =
    (["booked", "amended", "response"].includes(n.kind) &&
      (!held(current) || current.status !== n.payload.status)) ||
    (n.kind === "transferRequested" && current.status !== "pending");
  return {
    allowed: !obsolete,
    schoolId: input.schoolId,
    staffId: input.staffId,
    jobId: job.job_id,
    operationId: job.operation_id,
    decisionId: payload.decisionId,
    recordId: n.recordId,
    recordRevision: record.revision,
    kind: n.kind,
  };
}
export async function scheduled({ env, now = Date.now() }) {
  if (env.SCHEDULER_OWNER !== "v1") return { state: "inactive" };
  const { drainOutbox } = await import("../../runtime/jobs.mjs");
  await reconcileProviderReceipts(env, now);
  const result = await drainOutbox(env.DB, env, {
    schoolId: env.SCHOOL_ID,
    now,
    limit: 5,
    handlers: {
      "venues.notify": (job, dispatchEnv) =>
        dispatchNotification(dispatchEnv, job),
    },
  });
  await reconcileProviderReceipts(env, Date.now());
  return result;
}
export async function dispatchNotification(env, job) {
  const s = job.school_id,
    p = job.payload;
  const authority = await serviceCall(env, "core", "/internal/job-authority", {
    schoolId: s,
    decisionId: p.decisionId,
    operationId: job.operation_id,
    destination: "venues",
    purpose: "venues.notification",
  });
  if (!authority.allowed)
    return { state: "cancelled", code: "AUTHORITY_REVOKED" };
  const row = await one(
    env.DB,
    "SELECT * FROM venues_records WHERE school_id=? AND kind='outbox' AND record_id=?",
    [s, p.notificationId],
  );
  need(row, "NOT_FOUND", "Notification record unavailable.", 404);
  const n = parse(row),
    results = [];
  const progress = await env.DB.prepare(
    "INSERT INTO venues_notification_progress(school_id,notification_id,job_fence,complete) SELECT ?,?,?,0 WHERE EXISTS(SELECT 1 FROM product_outbox WHERE school_id=? AND job_id=? AND state='leased' AND fence=? AND lease_until>?) ON CONFLICT(school_id,notification_id) DO UPDATE SET job_fence=excluded.job_fence,complete=0",
  )
    .bind(s, n.id, job.fence, s, job.job_id, job.fence, Date.now())
    .run();
  if (progress.meta.changes !== 1)
    return { state: "uncertain", code: "JOB_LEASE_EXPIRED", retryable: false };
  for (const staffId of n.participantIds) {
    const current = await notificationRecipient(env, {
      schoolId: s,
      jobId: job.job_id,
      staffId,
    });
    if (!current.allowed) continue;
    const dispatch = await serviceCall(
      env,
      "core",
      "/internal/dispatch-check",
      {
        schoolId: s,
        decisionId: p.decisionId,
        purpose: "venues.notification",
        staffId,
        jobId: job.job_id,
      },
    );
    if (!dispatch.allowed) continue;
    const projection = await serviceCall(
      env,
      "contacts",
      "/internal/projection",
      {
        schoolId: s,
        decisionId: dispatch.decisionId,
        purpose: "venues.notification",
        staffIds: [staffId],
      },
    );
    const person = projection.staff?.find((x) => x.staffId === staffId);
    if (!person?.active) continue;
    const venueRow = await one(
      env.DB,
      "SELECT data_json FROM venues_records WHERE school_id=? AND kind='venues' AND record_id=?",
      [s, n.venueId],
    );
    const venue = venueRow ? parse(venueRow) : {};
    need(
      typeof env.PUBLIC_ORIGIN === "string" &&
        new URL(env.PUBLIC_ORIGIN).protocol === "https:",
      "PUBLIC_ORIGIN_REQUIRED",
      "Configure the authenticated public origin.",
      503,
    );
    const link =
      env.PUBLIC_ORIGIN.replace(/\/$/, "") +
      "/venues/" +
      (n.kind.toLowerCase().includes("transfer") ? "r/" : "b/") +
      encodeURIComponent(n.recordId);
    const event = n.kind.replace(/([a-z])([A-Z])/g, "$1 $2"),
      values = [
        person.name || "Staff member",
        event,
        venue.unit || venue.name || n.venueId,
        n.payload.date || "",
        n.payload.status || "",
        link,
      ];
    const message = {
      subject: "GSiS Venues: " + event,
      text: `Hi ${values[0]},\n\nVenue: ${values[2]}\nUpdate: ${values[1]}\nDate: ${values[3]}\nStatus: ${values[4]}\n\nManage this request: ${link}\n\nSign in with your school account to view or act on this record.`,
    };
    const emails = [
      ...new Set(
        [person.email, person.cesEmail].filter(
          (v) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        ),
      ),
    ];
    const channels = [
      ...emails.map((to, i) => ({
        channel: "email" + i,
        to,
        provider: "email",
      })),
      { channel: "whatsapp", to: person.mobile, provider: "whatsapp" },
    ];
    for (const channel of channels) {
      const prior = await one(
        env.DB,
        "SELECT * FROM venues_deliveries WHERE school_id=? AND notification_id=? AND staff_id=? AND channel=?",
        [s, n.id, staffId, channel.channel],
      );
      if (prior && ["accepted", "delivered"].includes(prior.state)) {
        results.push(prior.state);
        continue;
      }
      if (prior && ["sending", "uncertain"].includes(prior.state)) {
        results.push("uncertain");
        continue;
      }
      if (!channel.to) {
        await env.DB.prepare(
          "INSERT INTO venues_deliveries(school_id,notification_id,staff_id,channel,state,reason_code,updated_at,dispatch_fence) SELECT ?,?,?,?,'failed','RECIPIENT_UNAVAILABLE',?,? WHERE EXISTS(SELECT 1 FROM product_outbox WHERE school_id=? AND job_id=? AND state='leased' AND fence=? AND lease_until>?) ON CONFLICT(school_id,notification_id,staff_id,channel) DO NOTHING",
        )
          .bind(
            s,
            n.id,
            staffId,
            channel.channel,
            Date.now(),
            job.fence,
            s,
            job.job_id,
            job.fence,
            Date.now(),
          )
          .run();
        results.push("failed");
        continue;
      }
      const latest = await notificationRecipient(env, {
        schoolId: s,
        jobId: job.job_id,
        staffId,
      });
      if (!latest.allowed || latest.recordRevision !== current.recordRevision)
        continue;
      let request = {
        provider: "email",
        to: channel.to,
        ...message,
        idempotencyKey: `${n.id}:${staffId}:${channel.channel}`,
      };
      if (channel.provider === "whatsapp") {
        let template;
        try {
          template = JSON.parse(env.VENUES_WHATSAPP_TEMPLATE || "{}");
        } catch {
          template = {};
        }
        const fields = [
          "recipient_name",
          "event",
          "venue",
          "date",
          "status",
          "manage_url",
        ];
        need(
          template.name &&
            template.language &&
            canonical(template.fields || []) === canonical(fields),
          "TEMPLATE_NOT_CONFIGURED",
          "Configure the approved six-field Venues WhatsApp template.",
          503,
        );
        let mobile = String(channel.to).replace(/[\s()+-]/g, "");
        if (/^[89]\d{7}$/.test(mobile)) mobile = "65" + mobile;
        request = {
          provider: "whatsapp",
          to: mobile,
          template: {
            name: template.name,
            language: { code: template.language },
            components: [
              {
                type: "body",
                parameters: values.map((text) => ({ type: "text", text })),
              },
            ],
          },
        };
      }
      const acquired = await env.DB.prepare(
        "INSERT INTO venues_deliveries(school_id,notification_id,staff_id,channel,state,provider_id,reason_code,updated_at,dispatch_fence) SELECT ?,?,?,?,'sending',NULL,NULL,?,? WHERE EXISTS(SELECT 1 FROM product_outbox WHERE school_id=? AND job_id=? AND state='leased' AND fence=? AND lease_until>?) ON CONFLICT(school_id,notification_id,staff_id,channel) DO UPDATE SET state='sending',provider_id=NULL,reason_code=NULL,provider_status=NULL,provider_occurred_at=NULL,provider_event_id=NULL,updated_at=excluded.updated_at,dispatch_fence=excluded.dispatch_fence WHERE venues_deliveries.state IN ('failed','queued')",
      )
        .bind(
          s,
          n.id,
          staffId,
          channel.channel,
          Date.now(),
          job.fence,
          s,
          job.job_id,
          job.fence,
          Date.now() + 1000,
        )
        .run();
      if (acquired.meta.changes !== 1) {
        results.push("uncertain");
        continue;
      }
      const { dispatchProvider } = await import("../../runtime/providers.mjs");
      const result = await dispatchProvider(env, request);
      await env.DB.prepare(
        "UPDATE venues_deliveries SET state=?,provider_id=?,reason_code=?,updated_at=? WHERE school_id=? AND notification_id=? AND staff_id=? AND channel=? AND state='sending' AND dispatch_fence=?",
      )
        .bind(
          result.state,
          result.providerId || null,
          result.code || null,
          Date.now(),
          s,
          n.id,
          staffId,
          channel.channel,
          job.fence,
        )
        .run();
      if (channel.channel === "whatsapp" && result.providerId)
        await reconcileProviderReceipts(env, Date.now(), result.providerId);
      results.push(result.state);
    }
  }
  await env.DB.prepare(
    "UPDATE venues_notification_progress SET complete=1 WHERE school_id=? AND notification_id=? AND job_fence=? AND EXISTS(SELECT 1 FROM product_outbox WHERE school_id=? AND job_id=? AND state='leased' AND fence=? AND lease_until>?)",
  )
    .bind(s, n.id, job.fence, s, job.job_id, job.fence, Date.now())
    .run();
  const durableDeliveries = await query(
    env.DB,
    "SELECT state FROM venues_deliveries WHERE school_id=? AND notification_id=?",
    [s, n.id],
  );
  const state = deliveryAggregate(durableDeliveries);
  const updated = { ...n, status: state, revision: n.revision + 1 };
  await env.DB.prepare(
    "UPDATE venues_records SET revision=?,status=?,data_json=? WHERE school_id=? AND kind='outbox' AND record_id=? AND revision=?",
  )
    .bind(updated.revision, state, canonical(updated), s, n.id, row.revision)
    .run();
  return {
    state,
    code: results.length ? undefined : "RECIPIENTS_SUPPRESSED",
    retryable: false,
  };
}
