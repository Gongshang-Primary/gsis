import assert from "node:assert/strict";
import VenuesDomain from "../v1/services/venues/domain.mjs";
import { prepareRegisterImport } from "../v1/services/venues/register.mjs";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import { prepareOperation, canonical, one } from "../v1/runtime/store.mjs";
import {
  handle,
  sourceBegin,
  sourceComplete,
} from "../v1/services/venues/service.mjs";

const schoolId = "synthetic-school";

// Part 1: Pure domain & register contract tests for classSlotCapacity, slotMode, per-segment check, and retained-conflict activation.
{
  const imported = prepareRegisterImport(
    {
      venues: [
        {
          id: "ish-1",
          unit: "ISH-1",
          name: "Indoor Sports Hall 1",
          capacity: 80,
          capacityBasis: "Pupil seats",
          classSlotCapacity: 2,
          bookable: true,
          aliases: ["ISH-1A", "ISH-1B"],
        },
        {
          id: "unknown-cap-room",
          unit: "U-01",
          name: "Unconfigured Room",
          capacity: 40,
          classSlotCapacity: null,
          bookable: true,
        },
      ],
    },
    [],
    schoolId,
  );
  assert.equal(imported[0].capacity, 80);
  assert.equal(imported[0].classSlotCapacity, 2);
  assert.equal(imported[1].capacity, 40);
  assert.equal(imported[1].classSlotCapacity, null);

  const actor = { id: "staff-a", name: "Teacher A" };
  const nowIso = "2026-11-20T01:00:00.000Z";
  const ctx = {
    now: nowIso,
    today: "2026-11-20",
    uuid: () => crypto.randomUUID(),
  };
  let state = VenuesDomain.initialState();
  state.people = [
    { id: "staff-a", name: "Teacher A", active: true },
    { id: "staff-b", name: "Teacher B", active: true },
  ];
  state.venues = [
    {
      id: "ish-1",
      name: "Indoor Sports Hall 1",
      capacity: 80,
      classSlotCapacity: 2,
      bookable: true,
      special: false,
      approvalMode: "immediate",
      open: "07:00",
      close: "18:00",
      bufferMinutes: 0,
      overlapGroup: "",
      aliases: ["ISH-1A", "ISH-1B"],
      revision: 1,
    },
    {
      id: "unknown-room",
      name: "Unknown Capacity Room",
      capacity: 40,
      classSlotCapacity: null,
      bookable: true,
      special: false,
      approvalMode: "immediate",
      open: "07:00",
      close: "18:00",
      bufferMinutes: 0,
      overlapGroup: "",
      aliases: [],
      revision: 1,
    },
  ];
  state.source = {
    status: "ready",
    checkedAt: nowIso,
    generation: "gen-1",
    revision: 1,
    keys: { roster: "r1" },
    periods: [
      { id: "P1", label: "P1", start: 480, end: 510 },
      { id: "P2", label: "P2", start: 510, end: 540 },
    ],
    days: [{ date: "2026-11-23", covered: true, patternId: "pat1" }],
    patterns: {
      pat1: [
        // 1 lesson in P1 (ISH-1A), 2 concurrent lessons in P2 (ISH-1A + ISH-1B)
        { venueId: "ish-1", start: 480, end: 510, sourceId: "tt-p1-a", kind: "timetable", label: "ISH-1A" },
        { venueId: "ish-1", start: 510, end: 540, sourceId: "tt-p2-a", kind: "timetable", label: "ISH-1A" },
        { venueId: "ish-1", start: 510, end: 540, sourceId: "tt-p2-b", kind: "timetable", label: "ISH-1B" },
      ],
    },
  };

  // Unknown classSlotCapacity: null must NEVER be treated as free.
  assert.throws(
    () =>
      VenuesDomain.execute(
        state,
        actor,
        {
          operation: "book",
          requestId: crypto.randomUUID(),
          expectedRevision: state.revision,
          venueId: "unknown-room",
          dates: ["2026-11-23"],
          periodIds: ["P1"],
          slotMode: "slot",
        },
        ctx,
      ),
    (e) => e.code === "UNKNOWN_SLOT_CAPACITY",
  );

  // Default whole-venue booking on ISH-1 P1 conflicts with the 1 existing lesson (1 + 2 > 2).
  assert.throws(
    () =>
      VenuesDomain.execute(
        state,
        actor,
        {
          operation: "book",
          requestId: crypto.randomUUID(),
          expectedRevision: state.revision,
          venueId: "ish-1",
          dates: ["2026-11-23"],
          periodIds: ["P1"],
        },
        ctx,
      ),
    (e) => e.code === "CONFLICT",
  );

  // Multi-period one-slot booking across [P1, P2] conflicts because P2 already has 2/2 slots used.
  assert.throws(
    () =>
      VenuesDomain.execute(
        state,
        actor,
        {
          operation: "book",
          requestId: crypto.randomUUID(),
          expectedRevision: state.revision,
          venueId: "ish-1",
          dates: ["2026-11-23"],
          periodIds: ["P1", "P2"],
          slotMode: "slot",
        },
        ctx,
      ),
    (e) => e.code === "CONFLICT",
  );

  // One-slot booking on P1 succeeds (1 existing lesson + 1 one-slot booking = 2 <= 2)!
  const booked = VenuesDomain.execute(
    state,
    actor,
    {
      operation: "book",
      requestId: crypto.randomUUID(),
      expectedRevision: state.revision,
      venueId: "ish-1",
      dates: ["2026-11-23"],
      periodIds: ["P1"],
      slotMode: "slot",
      note: "PE half-hall",
    },
    ctx,
  );
  state = booked.state;
  const bookingId = booked.result.occurrences[0].id;
  assert.equal(booked.result.occurrences[0].slotMode, "slot");
  assert.equal(booked.result.occurrences[0].status, "confirmed");

  // Second one-slot booking on P1 fails because 1 lesson + 1 booking = 2/2 full!
  assert.throws(
    () =>
      VenuesDomain.execute(
        state,
        actor,
        {
          operation: "book",
          requestId: crypto.randomUUID(),
          expectedRevision: state.revision,
          venueId: "ish-1",
          dates: ["2026-11-23"],
          periodIds: ["P1"],
          slotMode: "slot",
        },
        ctx,
      ),
    (e) => e.code === "CONFLICT",
  );

  // Owner Decision #6: New timetable source adds a 2nd concurrent lesson on P1.
  // Activation MUST retain the confirmed booking and flag explicit unresolved sourceConflict (NEVER displace!).
  const projection2 = {
    ...state.source,
    generation: "gen-2",
    keys: { roster: "r2" },
    patterns: {
      pat1: [
        ...state.source.patterns.pat1,
        { venueId: "ish-1", start: 480, end: 510, sourceId: "tt-p1-b", kind: "timetable", label: "ISH-1B" },
      ],
    },
  };
  const activated = VenuesDomain.activate(
    state,
    projection2,
    { revision: state.source.revision },
    ctx,
  );
  state = activated.state;
  const retained = state.occurrences.find((o) => o.id === bookingId);
  assert.equal(retained.status, "confirmed", "Booking must remain confirmed, never displaced");
  assert.equal(retained.sourceConflict?.status, "unresolved");
  assert.equal(retained.sourceConflict?.reason, "timetable");
  assert.equal(retained.note, "PE half-hall");

  // resolveConflict must reject while the clash still exists!
  assert.throws(
    () =>
      VenuesDomain.execute(
        state,
        actor,
        {
          operation: "resolveConflict",
          requestId: crypto.randomUUID(),
          expectedRevision: state.revision,
          id: bookingId,
          revision: retained.revision,
        },
        ctx,
      ),
    (e) => e.code === "CONFLICT",
  );

  // If the timetable later drops the extra lesson, resolveConflict succeeds and clears sourceConflict!
  const projection3 = {
    ...state.source,
    generation: "gen-3",
    keys: { roster: "r3" },
    patterns: {
      pat1: [
        { venueId: "ish-1", start: 480, end: 510, sourceId: "tt-p1-a", kind: "timetable", label: "ISH-1A" },
      ],
    },
  };
  const activated3 = VenuesDomain.activate(
    state,
    projection3,
    { revision: state.source.revision },
    ctx,
  );
  state = activated3.state;
  const afterClear = state.occurrences.find((o) => o.id === bookingId);
  assert.equal(afterClear.status, "confirmed");
  assert.equal(afterClear.sourceConflict, undefined);
}

// Part 2: Real D1 + Venues service integration test for ISH-1 2-slot booking, whole-venue exclusion,
// unknown-capacity rejection, and retained-conflict baseline timetable adoption (sourceBegin + sourceComplete).
const runtime = await createDatabase("venues");
try {
  const now = Date.now();
  const date = new Date(now + 28800000 + 3 * 86400000)
    .toISOString()
    .slice(0, 10);
  const p1Start = Date.parse(`${date}T08:00:00+08:00`);
  const p1End = p1Start + 30 * 60000;
  const principal = {
    schoolId,
    actorId: "slot-admin",
    staffId: "staff-admin",
    displayName: "Synthetic Admin",
    capabilities: ["admin"],
    decisionId: "decision-slot",
    requestDigest: "slot-request-digest",
    validUntil: now + 3600000,
  };
  const proofs = new Map();
  const env = {
    DB: runtime.db,
    SCHOOL_ID: schoolId,
    SERVICE_NAME: "venues",
    GSIS_SECRET: "local-test-only",
    CORE: {
      async fetch(r) {
        return Response.json({
          ok: true,
          data: {
            principal,
            descriptor: {
              action: "roster.admin",
              service: "roster",
              operationId: (await r.json()).operationId,
            },
          },
        });
      },
    },
    ROSTER: {
      async fetch(r) {
        const body = await r.json();
        const url = new URL(r.url);
        if (url.pathname === "/internal/source-current") {
          return Response.json({ ok: true, data: { current: true, revision: 1 } });
        }
        return Response.json({ ok: true, data: proofs.get(body.operationId) });
      },
    },
    DEPLOY: {
      async fetch(r) {
        const body = await r.json();
        if (new URL(r.url).pathname === "/internal/current-publication") {
          return Response.json({ ok: true, data: { revision: 1 } });
        }
        return Response.json({ ok: true, data: proofs.get(body.operationId) });
      },
    },
  };
  const ctxFor = (path, body) => ({
    env,
    principal,
    path,
    method: "POST",
    body,
    now: Date.now(),
    request: new Request(`https://gsis.test/api/venues${path}`),
    requestId: crypto.randomUUID(),
  });
  async function exec(body) {
    body = { ...body, operationId: body.operationId || crypto.randomUUID() };
    const c = ctxFor("/command", body);
    const op = await prepareOperation(runtime.db, {
      schoolId,
      actorId: principal.actorId,
      operationId: body.operationId,
      action: `venues.${body.operation}`,
      intent: body,
      now: c.now,
      validUntil: principal.validUntil,
      authorization: principal,
    });
    await syntheticAdmission(runtime.db, op, { decisionId: principal.decisionId });
    return handle(c);
  }

  await runtime.db.batch([
    runtime.db
      .prepare("INSERT INTO venues_records VALUES(?,'venues',?,1,NULL,?,'active',?)")
      .bind(
        schoolId,
        "ish-1",
        "ish-1",
        JSON.stringify({
          id: "ish-1",
          unit: "ISH-1",
          name: "Indoor Sports Hall 1",
          capacity: 80,
          classSlotCapacity: 2,
          bookable: true,
          special: false,
          approvalMode: "immediate",
          open: "07:00",
          close: "18:00",
          bufferMinutes: 0,
          overlapGroup: "",
          aliases: ["ISH-1A", "ISH-1B"],
          revision: 1,
        }),
      ),
    runtime.db
      .prepare("INSERT INTO venues_records VALUES(?,'venues',?,1,NULL,?,'active',?)")
      .bind(
        schoolId,
        "room-unknown",
        "room-unknown",
        JSON.stringify({
          id: "room-unknown",
          unit: "UNK-1",
          name: "Room With Unknown Slot Capacity",
          capacity: 40,
          classSlotCapacity: null,
          bookable: true,
          special: false,
          approvalMode: "immediate",
          open: "07:00",
          close: "18:00",
          bufferMinutes: 0,
          overlapGroup: "",
          aliases: [],
          revision: 1,
        }),
      ),
    runtime.db
      .prepare("INSERT INTO venues_source_heads VALUES(?,?,?,?,?,?,?)")
      .bind(
        schoolId,
        "deploy",
        "1",
        1,
        Date.now(),
        "digest-1",
        canonical({
          coverage: {
            from: date,
            to: date,
            venueIds: ["ish-1", "room-unknown"],
            periods: [
              { id: "P1", label: "P1", start: 480, end: 510 },
              { id: "P2", label: "P2", start: 510, end: 540 },
            ],
          },
        }),
      ),
  ]);

  // Two one-slot bookings on ISH-1 P1 both succeed!
  const b1 = await exec({
    operation: "book",
    requestId: crypto.randomUUID(),
    expectedRevision: 0,
    venueId: "ish-1",
    dates: [date],
    periodIds: ["P1"],
    slotMode: "slot",
    note: "Class 4A PE",
  });
  assert.equal(b1.occurrences[0].slotMode, "slot");

  const b2 = await exec({
    operation: "book",
    requestId: crypto.randomUUID(),
    expectedRevision: b1.revision,
    venueId: "ish-1",
    dates: [date],
    periodIds: ["P1"],
    slotMode: "slot",
    note: "Class 4B PE",
  });
  assert.equal(b2.occurrences[0].slotMode, "slot");

  // Third one-slot booking on ISH-1 P1 fails with 409 CONFLICT!
  await assert.rejects(
    () =>
      exec({
        operation: "book",
        requestId: crypto.randomUUID(),
        expectedRevision: b2.revision,
        venueId: "ish-1",
        dates: [date],
        periodIds: ["P1"],
        slotMode: "slot",
        note: "Class 4C PE",
      }),
    (e) => e.status === 409 && e.code === "CONFLICT",
  );

  // Whole-venue booking on ISH-1 P2 succeeds (default slotMode='whole'), then blocks a one-slot booking on P2!
  const wholeP2 = await exec({
    operation: "book",
    requestId: crypto.randomUUID(),
    expectedRevision: b2.revision,
    venueId: "ish-1",
    dates: [date],
    periodIds: ["P2"],
    note: "Whole-hall assembly",
  });
  assert.equal(wholeP2.occurrences[0].slotMode, "whole");

  await assert.rejects(
    () =>
      exec({
        operation: "book",
        requestId: crypto.randomUUID(),
        expectedRevision: wholeP2.revision,
        venueId: "ish-1",
        dates: [date],
        periodIds: ["P2"],
        slotMode: "slot",
      }),
    (e) => e.status === 409 && e.code === "CONFLICT",
  );

  // Unknown slot capacity room rejects booking with 409 UNKNOWN_SLOT_CAPACITY.
  await assert.rejects(
    () =>
      exec({
        operation: "book",
        requestId: crypto.randomUUID(),
        expectedRevision: wholeP2.revision,
        venueId: "room-unknown",
        dates: [date],
        periodIds: ["P1"],
        slotMode: "slot",
      }),
    (e) => e.status === 409 && e.code === "UNKNOWN_SLOT_CAPACITY",
  );

  // Baseline timetable adoption (sourceKind: "baseline") with 2 lessons on ISH-1 P1 succeeds
  // and retains both confirmed bookings with explicit unresolved sourceConflict!
  const baseOpId = "baseline-clash-op-1";
  const baseProof = {
    schoolId,
    state: "prepared",
    operationId: baseOpId,
    fence: 1,
    digest: "baseline-digest-1",
    requestDigest: principal.requestDigest,
    authorityAction: "roster.admin",
    sequence: 2,
    projection: {
      sourceKind: "baseline",
      occupancies: [
        { venueId: "ish-1", start: p1Start, end: p1End, sourceId: "tt-ish-1a" },
        { venueId: "ish-1", start: p1Start, end: p1End, sourceId: "tt-ish-1b" },
      ],
      coverage: {
        from: date,
        to: date,
        venueIds: ["ish-1", "room-unknown"],
        periods: [
          { id: "P1", label: "P1", start: 480, end: 510 },
          { id: "P2", label: "P2", start: 510, end: 540 },
        ],
      },
    },
  };
  proofs.set(baseOpId, baseProof);
  const srcBody = {
    schoolId,
    sourceDomain: "roster",
    sourceOperationId: baseOpId,
    sourceDigest: baseProof.digest,
    sourceFence: 1,
    decisionId: principal.decisionId,
    scopes: [{ venueId: "ish-1", start: p1Start, end: p1End }],
    references: [{ venueId: "ish-1", revision: 1 }],
  };
  const begun = await sourceBegin(ctxFor("/internal/source-begin", srcBody));
  assert.equal(begun.state, "pending");

  proofs.set(baseOpId, { ...baseProof, state: "committed" });
  const completed = await sourceComplete(
    ctxFor("/internal/source-complete", srcBody),
  );
  assert.equal(completed.state, "adopted");
  assert.equal(completed.conflictedBookingIds.length, 2);

  for (const bookingId of [b1.occurrences[0].id, b2.occurrences[0].id]) {
    const stored = await one(
      runtime.db,
      "SELECT status, data_json FROM venues_records WHERE school_id=? AND kind='occurrences' AND record_id=?",
      [schoolId, bookingId],
    );
    assert.equal(stored.status, "confirmed", "Held booking must NOT be displaced");
    const parsed = JSON.parse(stored.data_json);
    assert.equal(parsed.sourceConflict?.status, "unresolved");
    assert.equal(parsed.sourceConflict?.reason, "timetable");
  }

  console.log(
    "PASS v1 Venues classSlotCapacity, slotMode (slot vs whole), per-segment checks, unknown-capacity fail-closed and retained-conflict timetable adoption",
  );
} finally {
  await runtime.close();
}
