// Ported from helper-gsps/gsis venues-backend/Domain.gs at 27fa498657965169b9d971a9caabc33c8b19bc69.
// Existing pure domain rules retained; isolated D1 persistence is implemented in service.mjs.
/* Venues v0.9.2 domain. No network, persistence, browser identity or provider calls. */
export const VenuesDomain = (() => {
  const TABLES = [
    "venues",
    "grants",
    "series",
    "occurrences",
    "transfers",
    "closures",
    "decisions",
    "waivers",
    "audit",
    "outbox",
    "receipts",
    "nonces",
    "people",
  ];
  const READS = ["bootstrap", "manifest", "piece", "bookings", "admin"];
  const COMMANDS = [
    "book",
    "amend",
    "cancel",
    "decide",
    "requestTransfer",
    "decideTransfer",
    "respond",
    "saveVenue",
    "saveRoomOwners",
    "saveRoomMetadata",
    "saveGrant",
    "saveClosure",
    "sync",
    "notificationDecision",
  ];
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const fail = (code, message, status = 409, conflicts) => {
    const e = new Error(message);
    Object.assign(e, { code, status });
    if (conflicts) e.conflicts = conflicts;
    throw e;
  };
  const assert = (yes, code, message, status) => {
    if (!yes) fail(code, message, status);
  };
  function stable(x) {
    if (Array.isArray(x)) return "[" + x.map(stable).join(",") + "]";
    if (x && typeof x === "object")
      return (
        "{" +
        Object.keys(x)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + stable(x[k]))
          .join(",") +
        "}"
      );
    return JSON.stringify(x);
  }
  function initialState() {
    const s = {
      revision: 0,
      policyRevision: 0,
      contacts: { key: "", checkedAt: "" },
      source: {
        revision: 0,
        status: "unavailable",
        generation: "",
        checkedAt: "",
        keys: {},
        fences: {},
        periods: [],
        days: [],
        patterns: {},
        manifest: null,
        pieceFiles: {},
      },
    };
    TABLES.forEach((t) => (s[t] = []));
    return s;
  }
  function date(s) {
    assert(
      typeof s === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(s) &&
        Number.isFinite(Date.parse(s + "T00:00:00Z")) &&
        new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s,
      "INVALID_DATE",
      "Use a valid ISO date.",
      400,
    );
    return s;
  }
  function range(from, to) {
    date(from);
    date(to);
    assert(
      to >= from && (Date.parse(to) - Date.parse(from)) / 86400000 < 366,
      "INVALID_RANGE",
      "Choose a date range of at most 366 days.",
      400,
    );
  }
  function text(s, max = 2000) {
    assert(
      typeof s === "string" && s.length <= max,
      "INVALID_TEXT",
      "Text must be at most " + max + " characters.",
      400,
    );
    return s;
  }
  function time(s) {
    assert(
      typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s),
      "INVALID_TIME",
      "Use a valid opening or closing time.",
      400,
    );
    return Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  }
  function active(g, today) {
    return (
      g.active === true &&
      (!g.from || g.from <= today) &&
      (!g.to || g.to >= today)
    );
  }
  function permissions(s, a, today) {
    return {
      admin: s.grants.some(
        (g) => g.kind === "admin" && g.staffId === a.id && active(g, today),
      ),
      ownedVenueIds: [
        ...new Set(
          s.grants
            .filter(
              (g) =>
                g.kind === "owner" && g.staffId === a.id && active(g, today),
            )
            .map((g) => g.venueId),
        ),
      ],
    };
  }
  function manage(s, a, id, c) {
    const p = permissions(s, a, c.today);
    return p.admin || p.ownedVenueIds.includes(id);
  }
  function requireManage(s, a, id, c) {
    assert(
      manage(s, a, id, c),
      "FORBIDDEN",
      "You cannot manage this room.",
      403,
    );
  }
  function requireAdmin(s, a, c) {
    assert(
      permissions(s, a, c.today).admin,
      "FORBIDDEN",
      "Venues administrator access is required.",
      403,
    );
  }
  function row(rows, id) {
    const r = rows.find((x) => x.id === id);
    assert(r, "NOT_FOUND", "The requested record no longer exists.", 404);
    return r;
  }
  function revision(r, n) {
    assert(
      Number.isInteger(n) && r.revision === n,
      "REVISION_CONFLICT",
      "The record changed. Reload it before trying again.",
    );
  }
  function intervals(s, ids) {
    assert(
      Array.isArray(ids) &&
        ids.length > 0 &&
        ids.length <= 100 &&
        new Set(ids).size === ids.length,
      "INVALID_PERIODS",
      "Choose one or more distinct periods.",
      400,
    );
    const ps = ids
      .map((id) => row(s.source.periods, id))
      .sort((a, b) => a.start - b.start);
    const result = [];
    for (const p of ps) {
      assert(
        Number.isInteger(p.start) && Number.isInteger(p.end) && p.start < p.end,
        "INVALID_PERIODS",
        "Period timings are unavailable.",
        503,
      );
      const last = result[result.length - 1];
      if (last && last.end === p.start) last.end = p.end;
      else {
        assert(
          !last || last.end <= p.start,
          "INVALID_PERIODS",
          "Selected periods overlap.",
          400,
        );
        result.push({ start: p.start, end: p.end });
      }
    }
    return result;
  }
  function ready(s, c) {
    assert(
      s.source.status === "ready" &&
        !Object.values(s.source.fences || {}).some((f) => f.pendingToken) &&
        s.source.checkedAt &&
        Date.parse(c.now) >= Date.parse(s.source.checkedAt) &&
        Date.parse(c.now) - Date.parse(s.source.checkedAt) <= 60000,
      "SOURCE_NOT_READY",
      "Timetable source is not ready. Refresh and try again.",
      503,
    );
  }
  function validateSlot(s, v, d, ints, c) {
    date(d);
    assert(d >= c.today, "PAST_DATE", "Choose today or a future date.", 400);
    const day = s.source.days.find((x) => x.date === d);
    assert(
      day?.covered === true,
      "UNCOVERED_DATE",
      "This date does not have authoritative Deploy, Calendar and timetable coverage.",
      409,
    );
    assert(
      !day.venueIds || day.venueIds.includes(v.id),
      "UNCOVERED_VENUE",
      "This room is not published for the selected date.",
      409,
    );
    if (day.periodIds) {
      const periods = day.periodIds.map((id) => row(s.source.periods, id)),
        allowed = day.periodIds.length ? intervals(s, day.periodIds) : [];
      assert(
        ints.every(
          (i) =>
            periods.some((p) => p.start === i.start) &&
            periods.some((p) => p.end === i.end) &&
            allowed.some((p) => i.start >= p.start && i.end <= p.end),
        ),
        "UNCOVERED_PERIODS",
        "Selected periods do not match this date’s timetable.",
        409,
      );
    }
    assert(
      v.bookable === true,
      "NOT_BOOKABLE",
      "This room is not bookable.",
      409,
    );
    assert(
      ints.every((i) => i.start >= time(v.open) && i.end <= time(v.close)),
      "CLOSED_HOURS",
      "Selected periods are outside operating hours.",
      409,
    );
  }
  const held = (o) => o.status === "confirmed" || o.status === "pending";
  function intersects(a, b, bufferA = 0, bufferB = 0) {
    return (
      a.start - bufferA < b.end + bufferB && b.start - bufferB < a.end + bufferA
    );
  }
  function related(s, a, b) {
    if (a === b) return true;
    const x = s.venues.find((v) => v.id === a),
      y = s.venues.find((v) => v.id === b);
    return !!(x && y && x.overlapGroup && x.overlapGroup === y.overlapGroup);
  }
  function occupancy(s, d) {
    const day = s.source.days.find((x) => x.date === d);
    return day && day.covered ? s.source.patterns[day.patternId] || [] : [];
  }
  function timetableConflicts(s, v, d, ints, waiver) {
    const buffer = v.bufferMinutes || 0;
    return occupancy(s, d).filter((t) => {
      if (!related(s, v.id, t.venueId)) return false;
      const otherBuffer =
        (s.venues.find((x) => x.id === t.venueId) || {}).bufferMinutes || 0;
      return ints.some((i) => {
        if (!intersects(i, t, buffer, otherBuffer)) return false;
        // A waiver authorises the precise overlap, never the rest of a lesson.
        const start = Math.max(i.start - buffer, t.start - otherBuffer),
          end = Math.min(i.end + buffer, t.end + otherBuffer);
        return !(
          waiver &&
          waiver.generation === s.source.generation &&
          waiver.venueId === v.id &&
          waiver.date === d &&
          waiver.intervals.some((w) => w.start <= start && w.end >= end)
        );
      });
    });
  }
  function conflicts(s, v, d, ints, ignore, waiver) {
    const hits = timetableConflicts(s, v, d, ints, waiver).map((t) => ({
      kind: "timetable",
      sourceId: t.sourceId,
    }));
    for (const o of s.occurrences)
      if (
        o.id !== ignore &&
        held(o) &&
        o.date === d &&
        related(s, v.id, o.venueId) &&
        ints.some((i) =>
          o.intervals.some((j) =>
            intersects(
              i,
              j,
              v.bufferMinutes || 0,
              (s.venues.find((x) => x.id === o.venueId) || {}).bufferMinutes ||
                0,
            ),
          ),
        )
      )
        hits.push({ kind: "booking", id: o.id, status: o.status });
    for (const q of s.closures)
      if (
        q.active &&
        q.from <= d &&
        q.to >= d &&
        related(s, v.id, q.venueId) &&
        ints.some((i) => intersects(i, q, v.bufferMinutes || 0, 0))
      )
        hits.push({ kind: "closure", id: q.id });
    return hits;
  }
  function available(s, v, d, ints, c, ignore, waiver) {
    validateSlot(s, v, d, ints, c);
    const hits = conflicts(s, v, d, ints, ignore, waiver);
    if (hits.length)
      fail("CONFLICT", "The requested room is occupied or closed.", 409, hits);
  }
  function audit(s, c, a, kind, recordId, extra = {}) {
    s.audit.push({
      id: c.uuid(),
      kind,
      recordId,
      actorId: a.id,
      actorName: a.name,
      at: c.now,
      policyRevision: s.policyRevision,
      ...extra,
    });
  }
  function notify(s, c, kind, r, participants) {
    const ids = [
      ...new Set(
        (
          participants || [
            r.requesterId,
            r.ownerId,
            ...(r.status === "pending" && ["booked", "amended"].includes(kind)
              ? managers(s, r.venueId, c)
              : []),
          ]
        ).filter(Boolean),
      ),
    ];
    if (!ids.length) return;
    s.outbox.push({
      id: c.uuid(),
      eventId: c.uuid(),
      kind,
      recordId: r.id,
      venueId: r.venueId,
      participantIds: ids,
      status: "queued",
      revision: 1,
      createdAt: c.now,
      payload: { date: r.date, periodIds: r.periodIds || [], status: r.status },
    });
  }
  function managers(s, id, c) {
    const owners = s.grants
      .filter(
        (g) =>
          g.kind === "owner" &&
          g.venueId === id &&
          active(g, c.today) &&
          s.people.some((p) => p.id === g.staffId && p.active),
      )
      .map((g) => g.staffId);
    return owners.length
      ? owners
      : s.grants
          .filter(
            (g) =>
              g.kind === "admin" &&
              active(g, c.today) &&
              s.people.some((p) => p.id === g.staffId && p.active),
          )
          .map((g) => g.staffId);
  }
  function mutate(r, c) {
    r.revision++;
    r.updatedAt = c.now;
  }
  function occurrence(s, c, a, v, d, ids, ints, status, note, seriesId) {
    return {
      id: c.uuid(),
      seriesId: seriesId || "",
      venueId: v.id,
      date: d,
      periodIds: ids.slice(),
      intervals: copy(ints),
      requesterId: a.id,
      ownerId: a.id,
      requesterName: a.name,
      ownerName: a.name,
      note,
      status,
      revision: 1,
      sourceGeneration: s.source.generation,
      createdAt: c.now,
      updatedAt: c.now,
      ownerResponses: [],
    };
  }
  function own(s, a, o, c) {
    assert(
      o.ownerId === a.id || manage(s, a, o.venueId, c),
      "FORBIDDEN",
      "Only the current booking owner or a room manager can change this booking.",
      403,
    );
  }
  function displace(s, c, a, reason, transferChanges = []) {
    const changed = [];
    for (const o of s.occurrences) {
      if (!held(o)) continue;
      const v = s.venues.find((v) => v.id === o.venueId);
      const waiver = s.waivers.find((w) => w.bookingId === o.id && w.active);
      const hits = v
        ? conflicts(s, v, o.date, o.intervals, o.id, waiver).filter(
            (x) => x.kind !== "booking",
          )
        : [{ kind: "venue" }];
      if (hits.length) {
        o.status = "displaced";
        o.displacement = {
          reason,
          generation: s.source.generation,
          at: c.now,
          conflicts: hits,
        };
        mutate(o, c);
        changed.push(o);
        audit(s, c, a, "displaced", o.id, {
          reason,
          sourceGeneration: s.source.generation,
        });
        notify(s, c, "displaced", o);
        for (const t of s.transfers)
          if (t.bookingId === o.id && t.status === "pending") {
            t.status = "cancelled";
            mutate(t, c);
            transferChanges.push(t);
            audit(s, c, a, "transferCancelled", t.id, { reason });
            notify(s, c, "transferCancelled", t, [
              t.requesterId,
              t.originalOwnerId,
            ]);
          }
        for (const w of s.waivers) if (w.bookingId === o.id) w.active = false;
      }
    }
    return changed;
  }
  function execute(original, a, input, c) {
    assert(
      a && a.id && a.name,
      "UNAUTHENTICATED",
      "An active staff identity is required.",
      401,
    );
    assert(
      input && COMMANDS.includes(input.operation),
      "INVALID_OPERATION",
      "Unknown command.",
      400,
    );
    assert(
      typeof input.requestId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          input.requestId,
        ),
      "INVALID_REQUEST_ID",
      "Use a UUID request ID.",
      400,
    );
    assert(
      Number.isInteger(input.expectedRevision) && input.expectedRevision >= 0,
      "INVALID_REVISION",
      "A current revision is required.",
      400,
    );
    const fingerprint = stable(input),
      receipt = original.receipts.find((x) => x.id === input.requestId);
    if (receipt) {
      assert(
        receipt.actorId === a.id && receipt.fingerprint === fingerprint,
        "IDEMPOTENCY_MISMATCH",
        "This request ID was already used for a different command.",
      );
      return { state: original, result: copy(receipt.result) };
    }
    const s = copy(original),
      x = input,
      changed = [],
      transfers = [],
      venueChanges = [],
      closureChanges = [],
      op = x.operation;
    if (
      ["book", "decide", "requestTransfer", "decideTransfer"].includes(op) ||
      (op === "amend" && (x.date !== undefined || x.periodIds !== undefined))
    )
      ready(s, c);
    if (op === "book") {
      const v = row(s.venues, x.venueId),
        ints = intervals(s, x.periodIds);
      text(x.note === undefined ? "" : x.note);
      assert(
        Array.isArray(x.dates) &&
          x.dates.length > 0 &&
          x.dates.length <= 366 &&
          new Set(x.dates).size === x.dates.length,
        "INVALID_DATES",
        "Select distinct dates, at most 366.",
        400,
      );
      const dates = x.dates.slice().sort();
      dates.forEach((d) => validateSlot(s, v, d, ints, c));
      const skip = [],
        admit = [];
      for (const d of dates) {
        const hits = conflicts(s, v, d, ints);
        if (hits.length) {
          if (x.availableOnly === true) skip.push({ date: d, conflicts: hits });
          else
            fail(
              "CONFLICT",
              "Some selected dates are occupied or closed.",
              409,
              [{ date: d, conflicts: hits }],
            );
        } else admit.push(d);
      }
      assert(
        admit.length,
        "CONFLICT",
        "None of the selected dates are available.",
      );
      const seriesId = dates.length > 1 ? c.uuid() : "";
      if (seriesId)
        s.series.push({
          id: seriesId,
          venueId: v.id,
          requesterId: a.id,
          from: dates[0],
          to: dates[dates.length - 1],
          dates: admit,
          periodIds: x.periodIds.slice(),
          note: x.note || "",
          createdAt: c.now,
          revision: 1,
        });
      admit.forEach((d, i) => {
        const status =
          v.approvalMode === "approval" ||
          (dates.length > 1 && (v.special || i > 0))
            ? "pending"
            : "confirmed";
        const o = occurrence(
          s,
          c,
          a,
          v,
          d,
          x.periodIds,
          ints,
          status,
          x.note || "",
          seriesId,
        );
        s.occurrences.push(o);
        changed.push(o);
        audit(s, c, a, "book", o.id, { status });
        notify(s, c, "booked", o);
      });
      s._skipped = skip;
    } else if (op === "amend" && x.ids !== undefined) {
      assert(
        Array.isArray(x.ids) &&
          x.ids.length > 0 &&
          x.ids.length <= 366 &&
          new Set(x.ids.map((y) => y.id)).size === x.ids.length &&
          x.id === undefined &&
          x.date === undefined &&
          x.periodIds === undefined,
        "INVALID_SELECTION",
        "Bulk amendments change only the note of explicit, distinct occurrences.",
        400,
      );
      text(x.note);
      for (const selection of x.ids) {
        const o = row(s.occurrences, selection.id);
        revision(o, selection.revision);
        own(s, a, o, c);
        assert(
          held(o),
          "INVALID_STATE",
          "Only a current booking can be amended.",
        );
        const previousNote = o.note;
        o.note = x.note;
        mutate(o, c);
        changed.push(o);
        audit(s, c, a, "amend", o.id, { previousNote });
        notify(s, c, "amended", o);
      }
    } else if (op === "amend") {
      const o = row(s.occurrences, x.id);
      revision(o, x.revision);
      own(s, a, o, c);
      assert(
        held(o),
        "INVALID_STATE",
        "Only a current booking can be amended.",
      );
      const old = copy(o);
      if (x.note !== undefined) o.note = text(x.note);
      if (x.date !== undefined || x.periodIds !== undefined) {
        const v = row(s.venues, o.venueId),
          d = x.date === undefined ? o.date : x.date,
          ids = x.periodIds === undefined ? o.periodIds : x.periodIds,
          ints = intervals(s, ids);
        available(s, v, d, ints, c, o.id);
        o.date = d;
        o.periodIds = ids.slice();
        o.intervals = ints;
        o.sourceGeneration = s.source.generation;
        if (
          v.approvalMode === "approval" ||
          (o.seriesId &&
            (v.special ||
              s.series.find((z) => z.id === o.seriesId)?.dates[0] !== d))
        )
          o.status = "pending";
        for (const w of s.waivers) if (w.bookingId === o.id) w.active = false;
      }
      mutate(o, c);
      changed.push(o);
      audit(s, c, a, "amend", o.id, { before: old });
      notify(s, c, "amended", o);
    } else if (op === "cancel" || op === "decide") {
      assert(
        Array.isArray(x.ids) &&
          x.ids.length > 0 &&
          x.ids.length <= 366 &&
          new Set(x.ids.map((y) => y.id)).size === x.ids.length,
        "INVALID_SELECTION",
        "Choose distinct bookings.",
        400,
      );
      if (op === "decide")
        assert(
          ["approve", "reject"].includes(x.decision),
          "INVALID_DECISION",
          "Choose approve or reject.",
          400,
        );
      for (const selection of x.ids) {
        const o = row(s.occurrences, selection.id);
        revision(o, selection.revision);
        if (op === "cancel") own(s, a, o, c);
        else requireManage(s, a, o.venueId, c);
        assert(
          op === "cancel" ? held(o) : o.status === "pending",
          "INVALID_STATE",
          "This booking is no longer awaiting this action.",
        );
        if (op === "decide" && x.decision === "approve")
          available(
            s,
            row(s.venues, o.venueId),
            o.date,
            o.intervals,
            c,
            o.id,
            s.waivers.find((w) => w.bookingId === o.id && w.active),
          );
        o.status =
          op === "cancel"
            ? "cancelled"
            : x.decision === "approve"
              ? "confirmed"
              : "rejected";
        mutate(o, c);
        changed.push(o);
        audit(s, c, a, op, o.id, {
          reason: text(x.reason || ""),
          decision: x.decision || "",
          selfApproval: op === "decide" && o.requesterId === a.id,
        });
        if (op === "decide")
          s.decisions.push({
            id: c.uuid(),
            bookingId: o.id,
            actorId: a.id,
            decision: x.decision,
            at: c.now,
            reason: x.reason || "",
            revision: 1,
          });
        if (!held(o))
          for (const w of s.waivers) if (w.bookingId === o.id) w.active = false;
        notify(s, c, o.status, o);
        for (const t of s.transfers)
          if (t.bookingId === o.id && t.status === "pending" && !held(o)) {
            t.status = "cancelled";
            mutate(t, c);
            transfers.push(t);
          }
      }
    } else if (op === "respond") {
      const o = row(s.occurrences, x.id);
      revision(o, x.revision);
      requireManage(s, a, o.venueId, c);
      assert(text(x.text).trim(), "INVALID_TEXT", "Write a response.", 400);
      o.ownerResponses.push({
        actorId: a.id,
        actorName: a.name,
        at: c.now,
        text: x.text,
      });
      mutate(o, c);
      changed.push(o);
      audit(s, c, a, "respond", o.id);
      notify(s, c, "response", o);
    } else if (op === "requestTransfer") {
      assert(
        ["booking", "timetable"].includes(x.kind),
        "INVALID_TRANSFER",
        "Choose a booking or timetable transfer.",
        400,
      );
      let o, v, d, ids, ints;
      if (x.kind === "booking") {
        o = row(s.occurrences, x.bookingId);
        revision(o, x.bookingRevision);
        assert(
          held(o) && o.ownerId !== a.id,
          "INVALID_TRANSFER",
          "This booking cannot be transferred to you.",
        );
        v = row(s.venues, o.venueId);
        d = o.date;
        ids = o.periodIds;
        ints = o.intervals;
      } else {
        v = row(s.venues, x.venueId);
        d = x.date;
        ids = x.periodIds;
        ints = intervals(s, ids);
        validateSlot(s, v, d, ints, c);
        assert(
          timetableConflicts(s, v, d, ints).length,
          "INVALID_TRANSFER",
          "There is no timetable reservation in these periods.",
        );
        assert(
          conflicts(s, v, d, ints).every((h) => h.kind === "timetable"),
          "CONFLICT",
          "Another booking or closure prevents this transfer.",
        );
      }
      assert(
        !s.transfers.some(
          (t) =>
            t.status === "pending" &&
            t.requesterId === a.id &&
            (o
              ? t.bookingId === o.id
              : t.kind === "timetable" &&
                t.venueId === v.id &&
                t.date === d &&
                stable(t.periodIds) === stable(ids)),
        ),
        "DUPLICATE_TRANSFER",
        "You already have a pending transfer request.",
      );
      const t = {
        id: c.uuid(),
        kind: x.kind,
        venueId: v.id,
        date: d,
        periodIds: ids.slice(),
        intervals: copy(ints),
        sourceGeneration: s.source.generation,
        requesterId: a.id,
        requesterName: a.name,
        note: text(x.note || ""),
        status: "pending",
        revision: 1,
        createdAt: c.now,
        updatedAt: c.now,
      };
      if (o)
        Object.assign(t, {
          bookingId: o.id,
          bookingRevision: o.revision,
          originalOwnerId: o.ownerId,
        });
      s.transfers.push(t);
      transfers.push(t);
      audit(s, c, a, "requestTransfer", t.id);
      notify(s, c, "transferRequested", t, [
        a.id,
        ...(o ? [o.ownerId] : managers(s, v.id, c)),
      ]);
    } else if (op === "decideTransfer") {
      const t = row(s.transfers, x.id);
      revision(t, x.revision);
      assert(
        t.status === "pending",
        "INVALID_STATE",
        "This transfer is no longer pending.",
      );
      assert(
        ["accept", "reject"].includes(x.decision),
        "INVALID_DECISION",
        "Choose accept or reject.",
        400,
      );
      let o;
      if (t.kind === "booking") {
        o = row(s.occurrences, t.bookingId);
        assert(
          o.ownerId === a.id,
          "FORBIDDEN",
          "Only the current booking owner can decide this transfer.",
          403,
        );
        revision(o, t.bookingRevision);
        assert(held(o), "INVALID_STATE", "This booking is no longer current.");
      } else requireManage(s, a, t.venueId, c);
      if (x.decision === "accept") {
        const v = row(s.venues, t.venueId);
        if (o) {
          available(
            s,
            v,
            o.date,
            o.intervals,
            c,
            o.id,
            s.waivers.find((w) => w.bookingId === o.id && w.active),
          );
          o.ownerId = t.requesterId;
          o.ownerName = t.requesterName;
          mutate(o, c);
          changed.push(o);
        } else {
          assert(
            t.sourceGeneration === s.source.generation,
            "SOURCE_CHANGED",
            "Timetable changed. Submit a new transfer request.",
          );
          const ints = intervals(s, t.periodIds);
          const hits = timetableConflicts(s, v, t.date, ints);
          assert(
            hits.length,
            "SOURCE_CHANGED",
            "This timetable reservation no longer exists.",
          );
          const waiver = {
            id: c.uuid(),
            venueId: v.id,
            date: t.date,
            intervals: copy(ints),
            generation: s.source.generation,
            active: true,
            revision: 1,
            transferId: t.id,
          };
          available(s, v, t.date, ints, c, null, waiver);
          o = occurrence(
            s,
            c,
            { id: t.requesterId, name: t.requesterName },
            v,
            t.date,
            t.periodIds,
            ints,
            "confirmed",
            t.note,
            "",
          );
          waiver.bookingId = o.id;
          s.waivers.push(waiver);
          s.occurrences.push(o);
          changed.push(o);
          t.beneficiaryBookingId = o.id;
        }
        t.status = "accepted";
      } else t.status = "rejected";
      mutate(t, c);
      transfers.push(t);
      audit(s, c, a, "decideTransfer", t.id, {
        decision: x.decision,
        reason: text(x.reason || ""),
      });
      notify(
        s,
        c,
        "transfer" + (x.decision === "accept" ? "Accepted" : "Rejected"),
        t,
        [
          t.requesterId,
          ...(t.originalOwnerId
            ? [t.originalOwnerId]
            : managers(s, t.venueId, c)),
        ],
      );
    } else if (op === "saveVenue") {
      assert(
        x.venue && typeof x.venue === "object",
        "INVALID_VENUE",
        "Choose a venue.",
        400,
      );
      const v = row(s.venues, x.venue.id);
      revision(v, x.revision);
      requireManage(s, a, v.id, c);
      const p = x.venue;
      for (const k of ["bookable", "special"])
        if (p[k] !== undefined) {
          assert(
            typeof p[k] === "boolean",
            "INVALID_VENUE",
            "Invalid room setting.",
            400,
          );
          v[k] = p[k];
        }
      if (p.approvalMode !== undefined) {
        assert(
          ["immediate", "approval"].includes(p.approvalMode),
          "INVALID_VENUE",
          "Choose a valid approval mode.",
          400,
        );
        v.approvalMode = p.approvalMode;
      }
      for (const k of ["open", "close"])
        if (p[k] !== undefined) {
          time(p[k]);
          v[k] = p[k];
        }
      assert(
        time(v.open) < time(v.close),
        "INVALID_VENUE",
        "Closing time must be after opening.",
        400,
      );
      assert(
        p.capacity === undefined || p.capacity === v.capacity,
        "REGISTER_EDIT_REQUIRED",
        "Change capacity in the shared physical room register.",
        400,
      );
      for (const k of ["bufferMinutes"])
        if (p[k] !== undefined) {
          assert(
            Number.isInteger(p[k]) &&
              p[k] >= 0 &&
              p[k] <= (k === "capacity" ? 100000 : 120),
            "INVALID_VENUE",
            "Invalid room capacity or buffer.",
            400,
          );
          v[k] = p[k];
        }
      if (p.features !== undefined) {
        assert(
          Array.isArray(p.features) && p.features.length <= 30,
          "INVALID_VENUE",
          "Invalid room features.",
          400,
        );
        v.features = p.features.map((y) => text(y, 100));
      }
      if (p.overlapGroup !== undefined)
        v.overlapGroup = text(p.overlapGroup, 100);
      if (
        p.aliases !== undefined &&
        stable(p.aliases) !== stable(v.aliases || [])
      ) {
        requireAdmin(s, a, c);
        assert(
          Array.isArray(p.aliases) && p.aliases.length <= 100,
          "INVALID_VENUE",
          "Invalid room aliases.",
          400,
        );
        const aliases = [
          ...new Set(p.aliases.map((y) => text(y, 150).trim()).filter(Boolean)),
        ];
        assert(
          !s.venues.some(
            (other) =>
              other.id !== v.id &&
              (other.aliases || []).some((a) =>
                aliases.some((b) => a.toLowerCase() === b.toLowerCase()),
              ),
          ),
          "AMBIGUOUS_ALIAS",
          "A timetable alias already belongs to another room.",
        );
        v.aliases = aliases;
        s.source.status = "stale";
        s.source.revision++;
      }
      mutate(v, c);
      venueChanges.push(v);
      s.policyRevision++;
      audit(s, c, a, "saveVenue", v.id); // Policy changes never silently approve or cancel existing records.
    } else if (op === "saveRoomOwners") {
      requireAdmin(s, a, c);
      const v = row(s.venues, x.venueId);
      revision(v, x.revision);
      assert(
        Array.isArray(x.staffIds) &&
          x.staffIds.length <= 1000 &&
          new Set(x.staffIds).size === x.staffIds.length &&
          x.staffIds.every(
            (id) =>
              typeof id === "string" &&
              s.people.some((p) => p.id === id && p.active),
          ),
        "INVALID_GRANT",
        "Choose distinct active staff members.",
        400,
      );
      const before = s.grants
        .filter(
          (g) => g.kind === "owner" && g.venueId === v.id && active(g, c.today),
        )
        .map((g) => g.staffId);
      for (const g of s.grants.filter(
        (g) => g.kind === "owner" && g.venueId === v.id && active(g, c.today),
      ))
        if (!x.staffIds.includes(g.staffId)) {
          g.active = false;
          g.revision++;
        }
      for (const id of x.staffIds)
        if (
          !s.grants.some(
            (g) =>
              g.kind === "owner" &&
              g.venueId === v.id &&
              g.staffId === id &&
              active(g, c.today),
          )
        )
          s.grants.push({
            id: c.uuid(),
            kind: "owner",
            staffId: id,
            venueId: v.id,
            active: true,
            from: c.today,
            to: "",
            revision: 1,
          });
      mutate(v, c);
      v.ownerIds = x.staffIds.slice();
      venueChanges.push(publicVenue(s, v, c));
      s.policyRevision++;
      audit(s, c, a, "saveRoomOwners", v.id, {
        before,
        after: x.staffIds.slice(),
      });
    } else if (op === "saveRoomMetadata") {
      fail(
        "INVALID_OPERATION",
        "Physical register updates must use the authorized persistence transaction.",
        400,
      );
    } else if (op === "saveGrant") {
      requireAdmin(s, a, c);
      const g = copy(x.grant || {});
      assert(
        ["admin", "owner"].includes(g.kind) &&
          typeof g.staffId === "string" &&
          (s.people.some((p) => p.id === g.staffId && p.active) ||
            (g.active === false &&
              s.grants.some(
                (prior) => prior.id === g.id && prior.staffId === g.staffId,
              ))),
        "INVALID_GRANT",
        "Choose an active staff member and grant type.",
        400,
      );
      assert(
        typeof g.active === "boolean",
        "INVALID_GRANT",
        "Set the grant active state.",
        400,
      );
      if (g.kind === "owner") row(s.venues, g.venueId);
      if (g.from) date(g.from);
      if (g.to) date(g.to);
      assert(
        !g.from || !g.to || g.from <= g.to,
        "INVALID_GRANT",
        "Grant dates are reversed.",
        400,
      );
      let old;
      if (g.id) {
        old = row(s.grants, g.id);
        revision(old, x.revision);
      }
      const safe = {
        id: old ? old.id : c.uuid(),
        kind: g.kind,
        staffId: g.staffId,
        active: g.active,
        from: g.from || "",
        to: g.to || "",
        revision: old ? old.revision + 1 : 1,
      };
      if (g.kind === "owner") safe.venueId = g.venueId;
      if (old) s.grants[s.grants.indexOf(old)] = safe;
      else s.grants.push(safe);
      assert(
        s.grants.some(
          (y) =>
            y.kind === "admin" &&
            active(y, c.today) &&
            s.people.some((p) => p.id === y.staffId && p.active),
        ),
        "LAST_ADMIN",
        "At least one currently active Venues administrator must remain.",
      );
      for (const id of new Set(
        [
          old && old.kind === "owner" ? old.venueId : null,
          safe.kind === "owner" ? safe.venueId : null,
        ].filter(Boolean),
      )) {
        const v = row(s.venues, id);
        mutate(v, c);
        venueChanges.push(publicVenue(s, v, c));
      }
      s.policyRevision++;
      audit(s, c, a, "saveGrant", safe.id, { before: old || null });
    } else if (op === "saveClosure") {
      const q = x.closure || {};
      row(s.venues, q.venueId);
      requireManage(s, a, q.venueId, c);
      range(q.from, q.to);
      assert(
        Number.isInteger(q.start) &&
          Number.isInteger(q.end) &&
          q.start >= 0 &&
          q.end <= 1440 &&
          q.start < q.end &&
          typeof q.active === "boolean",
        "INVALID_CLOSURE",
        "Use a valid closure time and active state.",
        400,
      );
      let old;
      if (q.id) {
        old = row(s.closures, q.id);
        requireManage(s, a, old.venueId, c);
        revision(old, x.revision);
      }
      const safe = {
        id: old ? old.id : c.uuid(),
        venueId: q.venueId,
        from: q.from,
        to: q.to,
        start: q.start,
        end: q.end,
        note: text(q.note || ""),
        active: q.active,
        revision: old ? old.revision + 1 : 1,
      };
      if (old) s.closures[s.closures.indexOf(old)] = safe;
      else s.closures.push(safe);
      closureChanges.push(safe);
      audit(s, c, a, "saveClosure", safe.id);
      changed.push(...displace(s, c, a, "closure", transfers));
    } else if (op === "notificationDecision") {
      const n = row(s.outbox, x.id);
      requireManage(s, a, n.venueId, c);
      revision(n, x.revision);
      assert(
        ["failed", "uncertain", "setup-required"].includes(n.status),
        "INVALID_STATE",
        "This delivery does not need a manual decision.",
      );
      assert(
        ["confirmSent", "retry"].includes(x.decision),
        "INVALID_DECISION",
        "Choose confirm sent or retry.",
        400,
      );
      assert(
        !(n.deliveries || []).some((d) => d.status === "sending"),
        "INVALID_STATE",
        "Wait for the active delivery attempt to finish before reviewing it.",
      );
      text(x.reason || "");
      assert(
        (x.reason || "").trim(),
        "REASON_REQUIRED",
        "Record the delivery review reason.",
        400,
      );
      for (const d of n.deliveries || []) {
        if (d.status === "sent" || d.status === "sending") continue;
        d.status = x.decision === "confirmSent" ? "sent" : "queued";
        if (x.decision === "confirmSent") d.manuallyConfirmed = true;
        d.nextAttemptAt = "";
      }
      n.status = x.decision === "confirmSent" ? "sent" : "queued";
      n.nextAttemptAt = c.now;
      n.reviewedBy = a.id;
      n.reviewReason = x.reason;
      mutate(n, c);
      audit(s, c, a, "notificationDecision", n.id, {
        decision: x.decision,
        reason: x.reason,
      });
    } else if (op === "sync") {
      requireAdmin(s, a, c);
      audit(s, c, a, "sync", "source");
    }
    s.revision++;
    const result = {
      revision: s.revision,
      occurrences: copy(changed),
      transfers: copy(transfers),
      permissions: permissions(s, a, c.today),
      message: "Saved.",
      delivery: {
        queued: s.outbox.filter((n) => n.status === "queued").length,
        failed: s.outbox.filter((n) =>
          ["failed", "setup-required"].includes(n.status),
        ).length,
        uncertain: s.outbox.filter((n) => n.status === "uncertain").length,
      },
    };
    if (venueChanges.length) result.venues = copy(venueChanges);
    if (closureChanges.length) result.closures = copy(closureChanges);
    if (s._skipped?.length) result.skipped = s._skipped;
    delete s._skipped;
    s.receipts.push({
      id: x.requestId,
      actorId: a.id,
      fingerprint,
      result: copy(result),
      createdAt: c.now,
    });
    return { state: s, result };
  }
  function publicVenue(s, v, c) {
    const out = {};
    for (const key of [
      "id",
      "unit",
      "name",
      "descriptors",
      "aliases",
      "bookable",
      "special",
      "approvalMode",
      "open",
      "close",
      "capacity",
      "features",
      "bufferMinutes",
      "overlapGroup",
      "revision",
    ])
      if (v[key] !== undefined) out[key] = copy(v[key]);
    out.ownerIds = [
      ...new Set(
        s.grants
          .filter(
            (g) =>
              g.kind === "owner" && g.venueId === v.id && active(g, c.today),
          )
          .map((g) => g.staffId),
      ),
    ];
    return out;
  }
  function sourceStatus(s) {
    return {
      status: s.source.status,
      checkedAt: s.source.checkedAt,
      error: s.source.error || undefined,
      errorCode: s.source.errorCode || undefined,
      errorAt: s.source.errorAt || undefined,
    };
  }
  function read(s, a, x, c) {
    assert(
      a && a.id,
      "UNAUTHENTICATED",
      "Active staff identity required.",
      401,
    );
    assert(
      READS.includes(x.operation),
      "INVALID_OPERATION",
      "Unknown read.",
      400,
    );
    const p = permissions(s, a, c.today),
      source = sourceStatus(s);
    const manifest = s.source.manifest
      ? {
          ...s.source.manifest,
          status: s.source.status,
          checkedAt: s.source.checkedAt,
        }
      : null;
    if (x.operation === "bootstrap") {
      const out = {
        version: "0.9.9",
        actor: { id: a.id, name: a.name, email: a.email },
        permissions: p,
        venues: s.venues.map((v) => publicVenue(s, v, c)),
        periods: copy(s.source.periods),
        manifest,
        revision: s.revision,
        policyRevision: s.policyRevision,
        source,
      };
      if (p.admin || p.ownedVenueIds.length)
        out.staff = s.people
          .filter((z) => z.active)
          .map((z) => ({ id: z.id, name: z.name, active: true }));
      return out;
    }
    if (x.operation === "manifest") return { manifest, source };
    if (x.operation === "piece") return { key: x.key };
    if (
      x.operation === "bookings" &&
      (x.id !== undefined || x.transferId !== undefined)
    ) {
      assert(
        (x.id === undefined) !== (x.transferId === undefined),
        "INVALID_SELECTION",
        "Select one booking or transfer record.",
        400,
      );
      const id = x.id === undefined ? x.transferId : x.id;
      assert(
        typeof id === "string" && id.length > 0 && id.length <= 200,
        "INVALID_SELECTION",
        "Select a valid record.",
        400,
      );
      const canTransfer = (t) =>
        t.requesterId === a.id ||
        t.originalOwnerId === a.id ||
        manage(s, a, t.venueId, c) ||
        s.occurrences.some((o) => o.id === t.bookingId && o.ownerId === a.id);
      let occurrences = [],
        transfers = [],
        target;
      if (x.id !== undefined) {
        target = row(s.occurrences, id);
        assert(
          target.requesterId === a.id ||
            target.ownerId === a.id ||
            manage(s, a, target.venueId, c),
          "FORBIDDEN",
          "This booking is not available to your account.",
          403,
        );
        occurrences = [target];
        transfers = s.transfers.filter(
          (t) =>
            (t.bookingId === id || t.beneficiaryBookingId === id) &&
            canTransfer(t),
        );
      } else {
        target = row(s.transfers, id);
        assert(
          canTransfer(target),
          "FORBIDDEN",
          "This transfer is not available to your account.",
          403,
        );
        transfers = [target];
        occurrences = s.occurrences.filter(
          (o) =>
            o.id === target.bookingId || o.id === target.beneficiaryBookingId,
        );
      }
      return {
        revision: s.revision,
        occurrences: copy(occurrences),
        transfers: copy(transfers),
        closures: copy(
          s.closures.filter(
            (q) =>
              q.venueId === target.venueId &&
              q.from <= target.date &&
              q.to >= target.date,
          ),
        ),
        permissions: p,
        policyRevision: s.policyRevision,
        source,
      };
    }
    if (x.operation === "bookings") {
      range(x.from, x.to);
      assert(
        x.venueIds === undefined ||
          (Array.isArray(x.venueIds) && x.venueIds.length <= 1000),
        "INVALID_VENUES",
        "Invalid room selection.",
        400,
      );
      const selected = (id) => !x.venueIds?.length || x.venueIds.includes(id);
      return {
        revision: s.revision,
        occurrences: copy(
          s.occurrences.filter(
            (o) =>
              o.date >= x.from &&
              o.date <= x.to &&
              selected(o.venueId) &&
              (!x.mine || o.ownerId === a.id || o.requesterId === a.id),
          ),
        ),
        transfers: copy(
          s.transfers.filter(
            (t) =>
              t.date >= x.from &&
              t.date <= x.to &&
              selected(t.venueId) &&
              (t.requesterId === a.id ||
                t.originalOwnerId === a.id ||
                manage(s, a, t.venueId, c)),
          ),
        ),
        closures: copy(
          s.closures.filter(
            (q) => q.from <= x.to && q.to >= x.from && selected(q.venueId),
          ),
        ),
        permissions: p,
        policyRevision: s.policyRevision,
        source,
      };
    }
    assert(
      p.admin || p.ownedVenueIds.length,
      "FORBIDDEN",
      "Room management access is required.",
      403,
    );
    const scoped = (id) => p.admin || p.ownedVenueIds.includes(id);
    const coverage = {
      from: c.today,
      to:
        s.source.manifest?.to ||
        s.source.days
          .map((d) => d.date)
          .sort()
          .slice(-1)[0] ||
        c.today,
    };
    const utilisation = s.venues
      .filter((v) => scoped(v.id))
      .map((v) => {
        const rows = s.occurrences.filter(
          (o) =>
            o.venueId === v.id &&
            held(o) &&
            o.date >= coverage.from &&
            o.date <= coverage.to,
        );
        return {
          venueId: v.id,
          minutes: rows.reduce(
            (n, o) => n + o.intervals.reduce((m, i) => m + i.end - i.start, 0),
            0,
          ),
          bookingCount: rows.length,
        };
      });
    return {
      permissions: p,
      coverage,
      utilisation,
      closures: copy(s.closures.filter((q) => scoped(q.venueId))),
      grants: copy(
        s.grants.filter(
          (g) => p.admin || (g.kind === "owner" && scoped(g.venueId)),
        ),
      ),
      venues: s.venues
        .filter((v) => scoped(v.id))
        .map((v) => publicVenue(s, v, c)),
      approvals: copy(
        s.occurrences.filter(
          (o) => o.status === "pending" && scoped(o.venueId),
        ),
      ),
      transfers: copy(
        s.transfers.filter((t) => t.status === "pending" && scoped(t.venueId)),
      ),
      displaced: copy(
        s.occurrences.filter(
          (o) => o.status === "displaced" && scoped(o.venueId),
        ),
      ),
      deliveryFailures: s.outbox
        .filter(
          (n) =>
            ["failed", "uncertain", "setup-required"].includes(n.status) &&
            scoped(n.venueId),
        )
        .map((n) => ({
          id: n.id,
          recordId: n.recordId,
          venueId: n.venueId,
          kind: n.kind,
          status: n.status,
          revision: n.revision,
          error: n.publicError || "Delivery needs review.",
          createdAt: n.createdAt,
        })),
      audit: copy(
        s.audit
          .filter(
            (e) =>
              p.admin ||
              s.occurrences.some(
                (o) => o.id === e.recordId && scoped(o.venueId),
              ) ||
              scoped(e.recordId),
          )
          .slice(-500),
      ),
      source: {
        ...source,
        mappingIssues: copy(s.source.mappingIssues || []),
        unresolvedAliases: copy(s.source.unresolvedAliases || []),
      },
      revision: s.revision,
    };
  }
  function sourceEvent(original, x, c) {
    assert(
      ["roster", "contacts", "deploy", "calendar"].includes(x.source),
      "INVALID_SOURCE",
      "Unknown source.",
      400,
    );
    const s = copy(original),
      f =
        s.source.fences[x.source] ||
        (s.source.fences[x.source] = {
          revision: "",
          pendingToken: "",
          lastToken: "",
        });
    if (x.operation === "sourceStatus")
      return {
        state: original,
        result: {
          revision: f.revision,
          pendingToken: f.pendingToken,
          status: s.source.status,
        },
      };
    assert(
      typeof x.token === "string" &&
        x.token.length >= 1 &&
        x.token.length <= 200,
      "INVALID_TOKEN",
      "A source token is required.",
      400,
    );
    if (x.operation === "sourceBegin") {
      if (f.pendingToken === x.token) {
        assert(
          f.expectedRevision === x.expectedRevision,
          "SOURCE_FENCE_CONFLICT",
          "This token has another expected revision.",
        );
        return {
          state: original,
          result: {
            revision: f.revision,
            pendingToken: f.pendingToken,
            status: "pending",
          },
        };
      }
      assert(
        !f.pendingToken &&
          f.revision === x.expectedRevision &&
          f.lastToken !== x.token,
        "SOURCE_FENCE_CONFLICT",
        "The source changed or another writer is pending.",
      );
      f.pendingToken = x.token;
      f.expectedRevision = x.expectedRevision;
      f.beganAt = c.now;
      s.source.status = "pending";
    } else if (x.operation === "sourceComplete") {
      if (
        !f.pendingToken &&
        f.lastToken === x.token &&
        f.revision === x.revision
      )
        return {
          state: original,
          result: {
            revision: f.revision,
            pendingToken: "",
            status: s.source.status,
          },
        };
      assert(
        f.pendingToken === x.token &&
          typeof x.revision === "string" &&
          x.revision.length > 0,
        "SOURCE_FENCE_CONFLICT",
        "A newer source operation is pending.",
      );
      f.revision = x.revision;
      f.lastToken = x.token;
      f.pendingToken = "";
      delete f.expectedRevision;
      s.source.status = Object.values(s.source.fences).some(
        (y) => y.pendingToken,
      )
        ? "pending"
        : "stale";
    } else fail("INVALID_OPERATION", "Unknown source operation.", 400);
    s.source.revision++;
    return {
      state: s,
      result: {
        revision: f.revision,
        pendingToken: f.pendingToken,
        status: s.source.status,
      },
    };
  }
  function activate(original, projection, capture, c) {
    if (projection.venues)
      assert(
        capture.policyRevision === original.policyRevision,
        "SOURCE_FENCE_CONFLICT",
        "Room policies changed during source preparation.",
      );
    assert(
      capture &&
        capture.revision === original.source.revision &&
        !Object.values(original.source.fences || {}).some(
          (f) => f.pendingToken,
        ),
      "SOURCE_FENCE_CONFLICT",
      "Source changed while its projection was being prepared.",
    );
    for (const [name, f] of Object.entries(original.source.fences || {}))
      if (f.revision)
        assert(
          projection.keys?.[name] === f.revision,
          "SOURCE_FENCE_CONFLICT",
          "The projection does not match the committed source revision.",
        );
    assert(
      projection &&
        projection.generation &&
        Array.isArray(projection.days) &&
        Array.isArray(projection.periods) &&
        projection.patterns,
      "INVALID_PROJECTION",
      "A complete occupancy projection is required.",
      503,
    );
    const checked = Date.parse(projection.checkedAt),
      age = Date.parse(c.now) - checked;
    assert(
      Number.isFinite(checked) && age >= 0 && age <= 60000,
      "SOURCE_NOT_READY",
      "Source verification expired while preparing its projection.",
      503,
    );
    const s = copy(original),
      changedGeneration = s.source.generation !== projection.generation;
    const old = s.source;
    s.source = {
      ...old,
      ...copy(projection),
      fences: old.fences,
      revision: old.revision + 1,
      status: "ready",
      checkedAt: projection.checkedAt,
      error: "",
      errorCode: "",
      errorAt: "",
    };
    if (projection.people) s.people = copy(projection.people);
    if (projection.venues) s.venues = copy(projection.venues);
    delete s.source.people;
    delete s.source.venues;
    const system = { id: "system", name: "Timetable source" };
    let changed = [],
      changedTransfers = [];
    if (changedGeneration) {
      const unchangedDate = (d, venueId) => {
        const before = old.days.find((x) => x.date === d),
          after = s.source.days.find((x) => x.date === d);
        if (
          !before?.covered ||
          !after?.covered ||
          (before.publicationKey &&
            after.publicationKey &&
            before.publicationKey !== after.publicationKey) ||
          (after.venueIds && !after.venueIds.includes(venueId))
        )
          return false;
        const periods = (source, day) =>
          source.periods.filter(
            (p) => !day.periodIds || day.periodIds.includes(p.id),
          );
        return (
          stable(periods(old, before)) === stable(periods(s.source, after)) &&
          stable(old.patterns[before.patternId]) ===
            stable(s.source.patterns[after.patternId])
        );
      };
      for (const w of s.waivers)
        if (w.active && w.generation !== s.source.generation) {
          if (
            w.generation === old.generation &&
            unchangedDate(w.date, w.venueId)
          )
            w.generation = s.source.generation;
          else w.active = false;
        }
      for (const t of s.transfers)
        if (
          t.kind === "timetable" &&
          t.status === "pending" &&
          t.sourceGeneration === old.generation &&
          unchangedDate(t.date, t.venueId)
        )
          t.sourceGeneration = s.source.generation;
      changed = displace(s, c, system, "timetable", changedTransfers);
      audit(s, c, system, "sourceActivated", s.source.generation);
      if (changed.length) s.revision++;
    }
    return {
      state: s,
      result: {
        revision: s.revision,
        generation: s.source.generation,
        occurrences: changed,
        transfers: changedTransfers,
      },
    };
  }
  return {
    initialState,
    execute,
    read,
    activate,
    sourceEvent,
    permissions,
    intervals,
    conflicts,
    stable,
    READS,
    COMMANDS,
    TABLES,
  };
})();
export default VenuesDomain;
