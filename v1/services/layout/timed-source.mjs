/* Separate immutable timed-source (aSc timetable) adoption stream for Layout.
 * Preserves Deploy planning allocations, Layout geometry and local annotations independently. */
import { ApiError } from "../../runtime/errors.mjs";
import {
  canonical,
  commitOperation,
  digest,
  one,
  prepareOperation,
} from "../../runtime/store.mjs";
import { serviceCall } from "../../runtime/security.mjs";

const MAX_TIMED_BYTES = 2 * 1024 * 1024;
const MAX_OCCUPANCIES = 10000;

function fail(code, message, status = 400) {
  throw new ApiError(code, status, message);
}

function validId(value, label = "identifier") {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(value)
  ) {
    fail("INVALID_ID", `Invalid ${label}.`, 400);
  }
  return value;
}

function validYear(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2000 || n > 2099) {
    fail("INVALID_YEAR", "Choose a valid four-digit school year.", 400);
  }
  return n;
}

function validDate(value) {
  if (
    typeof value !== "string" ||
    !/^20\d\d-\d\d-\d\d$/.test(value) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  ) {
    fail("INVALID_DATE", "Choose a valid YYYY-MM-DD date.", 400);
  }
  return value;
}

function sgtDateOf(ms) {
  return new Date(Number(ms) + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function sanitizePublicLesson(raw) {
  // Never leak private staff phone/email/contact fields in Layout venue projections.
  const start =
    typeof raw.start === "number" ? raw.start : Date.parse(String(raw.start));
  const end =
    typeof raw.end === "number" ? raw.end : Date.parse(String(raw.end));
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start >= end ||
    end - start > 86400000
  ) {
    fail("INVALID_TIMED_SOURCE", "Timed occupancy interval is invalid.", 409);
  }
  return {
    venueId: validId(raw.venueId, "venueId"),
    sourceId: String(raw.sourceId || `${raw.venueId}:${start}`).slice(0, 200),
    date: raw.date && /^20\d\d-\d\d-\d\d$/.test(raw.date) ? raw.date : sgtDateOf(start),
    start,
    end,
    sourceLabel: String(raw.sourceLabel || raw.label || "").slice(0, 150),
    subject: String(raw.subject || "").slice(0, 120),
    className: String(raw.className || "").slice(0, 120),
    groupName: String(raw.groupName || "").slice(0, 120),
    slotDemand:
      Number.isInteger(raw.slotDemand) && raw.slotDemand >= 1
        ? raw.slotDemand
        : 1,
  };
}

function groupByPhysicalVenue(lessons) {
  const byVenue = new Map();
  for (const lesson of lessons) {
    let entry = byVenue.get(lesson.venueId);
    if (!entry) {
      entry = {
        venueId: lesson.venueId,
        sourceLabels: new Set(),
        lessons: [],
      };
      byVenue.set(lesson.venueId, entry);
    }
    if (lesson.sourceLabel) entry.sourceLabels.add(lesson.sourceLabel);
    entry.lessons.push(lesson);
  }
  return [...byVenue.values()]
    .sort((a, b) => a.venueId.localeCompare(b.venueId))
    .map((entry) => ({
      venueId: entry.venueId,
      sourceLabels: [...entry.sourceLabels].sort(),
      lessons: entry.lessons.sort(
        (a, b) =>
          a.start - b.start ||
          a.end - b.end ||
          a.sourceId.localeCompare(b.sourceId),
      ),
    }));
}

export async function adoptTimedSource(ctx) {
  const school = ctx.env.SCHOOL_ID;
  const input = ctx.body || {};
  if (input.schoolId !== school) {
    fail("SCHOOL_MISMATCH", "Foreign school timed source.", 403);
  }
  const sourceDomain = String(input.sourceDomain || "roster");
  if (sourceDomain !== "roster") {
    fail("SOURCE_DENIED", "Only Roster baseline imports supply timed sources.", 403);
  }
  const sourceOperationId = validId(input.sourceOperationId, "sourceOperationId");
  const proof = await serviceCall(ctx.env, "roster", "/internal/source-status", {
    schoolId: school,
    operationId: sourceOperationId,
    decisionId: input.decisionId || null,
  });
  if (
    !proof ||
    proof.state !== "committed" ||
    proof.schoolId !== school ||
    proof.operationId !== sourceOperationId ||
    !proof.projection
  ) {
    fail("SOURCE_INVALID", "Timed source operation is not committed.", 409);
  }
  if (input.sourceDigest && proof.digest !== input.sourceDigest) {
    fail("SOURCE_INVALID", "Timed source digest mismatch.", 409);
  }
  const projection = proof.projection;
  const coverage = projection.coverage || {};
  const fromDate = validDate(coverage.from || input.from);
  const toDate = validDate(coverage.to || fromDate);
  const y = validYear(input.year || Number(fromDate.slice(0, 4)));
  const sequence = Number(
    projection.revision ?? projection.sequence ?? input.sequence ?? 1,
  );
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    fail("SOURCE_INVALID", "Timed source sequence is invalid.", 409);
  }

  let rawRows = Array.isArray(projection.occupancies)
    ? projection.occupancies
    : Array.isArray(projection.occupancy)
      ? projection.occupancy
      : [];
  if (!rawRows.length && Array.isArray(projection.staged?.chunks) && projection.staged.chunks.length) {
    const assembled = [];
    for (let i = 0; i < projection.staged.chunks.length; i++) {
      const chunkMeta = projection.staged.chunks[i];
      const chunk = await serviceCall(
        ctx.env,
        "roster",
        "/internal/source-projection-chunk",
        {
          schoolId: school,
          operationId: sourceOperationId,
          index: chunkMeta.index ?? i,
        },
      );
      if (
        !chunk ||
        !Array.isArray(chunk.rows) ||
        (chunkMeta.digest && chunk.chunkDigest !== chunkMeta.digest)
      ) {
        fail("SOURCE_INVALID", "Timed source chunk integrity verification failed.", 409);
      }
      assembled.push(...chunk.rows);
      if (assembled.length > MAX_OCCUPANCIES) {
        fail("RESULT_BOUNDS", "Timed source exceeds occupancy bounds.", 422);
      }
    }
    rawRows = assembled;
  }
  if (rawRows.length > MAX_OCCUPANCIES) {
    fail("RESULT_BOUNDS", "Timed source exceeds occupancy bounds.", 422);
  }

  const headRow = await one(
    ctx.env.DB,
    "SELECT revision, value_json FROM layout_rows WHERE school_id=? AND year=? AND table_name='timed_source' AND row_id='head'",
    [school, y],
  );
  const currentHead = headRow ? JSON.parse(headRow.value_json) : null;
  if (currentHead) {
    if (currentHead.sourceOperationId === sourceOperationId) {
      return {
        state: "adopted",
        year: y,
        revision: headRow.revision,
        sourceOperationId,
        sequence: currentHead.sequence,
        digest: currentHead.digest,
      };
    }
    if (currentHead.sequence > sequence) {
      return {
        state: "ignored",
        year: y,
        revision: headRow.revision,
        sourceOperationId,
        activeSourceOperationId: currentHead.sourceOperationId,
        activeSequence: currentHead.sequence,
      };
    }
  }

  const operationId =
    "timed-" + (await digest([school, y, sourceOperationId])).slice(0, 48);
  const now = ctx.now ?? Date.now();
  const op = await prepareOperation(ctx.env.DB, {
    schoolId: school,
    actorId: "system-layout-timed",
    operationId,
    action: "internal.layout.adoptTimedSource",
    intent: {
      year: y,
      sourceDomain,
      sourceOperationId,
      digest: proof.digest,
      sequence,
    },
    now,
    validUntil: now + 30000,
  });
  if (op.state === "committed") return op.receipt.result;

  const lessons = rawRows.map(sanitizePublicLesson);
  const edition = {
    schemaVersion: 1,
    schoolId: school,
    year: y,
    sourceDomain,
    sourceKind: projection.sourceKind || "baseline",
    sourceOperationId,
    sourceDigest: proof.digest,
    sequence,
    coverage: {
      from: fromDate,
      to: toDate,
      periods: Array.isArray(coverage.periods) ? coverage.periods : [],
      venueIds: Array.isArray(coverage.venueIds) ? coverage.venueIds : [],
    },
    lessons,
    adoptedAt: now,
  };
  const encoded = canonical(edition);
  const bytes = new TextEncoder().encode(encoded).length;
  if (bytes > MAX_TIMED_BYTES) {
    fail("RESULT_BOUNDS", "Timed source edition exceeds 2 MiB.", 422);
  }
  const editionDigest = await digest(encoded);
  const objectKey = `layout/${school}/timed-sources/${y}/${editionDigest.slice(0, 24)}-${operationId}.json`;
  if (!ctx.env.ARTIFACTS?.put || !ctx.env.ARTIFACTS?.get) {
    fail("STORAGE_UNAVAILABLE", "Layout artifact storage is unavailable.", 503);
  }
  await ctx.env.ARTIFACTS.put(objectKey, encoded, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { schoolId: school, sha256: editionDigest },
  });
  const verifyObj = await ctx.env.ARTIFACTS.get(objectKey);
  if (!verifyObj || (await digest(await verifyObj.text())) !== editionDigest) {
    fail("STORAGE_INTEGRITY_FAILED", "Timed source artifact verification failed.", 503);
  }

  const nextRevision = (headRow?.revision || 0) + 1;
  const headPayload = {
    schemaVersion: 1,
    year: y,
    sourceDomain,
    sourceKind: edition.sourceKind,
    sourceOperationId,
    sourceDigest: proof.digest,
    sequence,
    digest: editionDigest,
    objectKey,
    coverage: { from: fromDate, to: toDate },
    lessonCount: lessons.length,
    adoptedAt: now,
  };

  const guard = headRow
    ? {
        sql: "SELECT revision=? AS ok FROM layout_rows WHERE school_id=? AND year=? AND table_name='timed_source' AND row_id='head'",
        args: [headRow.revision, school, y],
      }
    : {
        sql: "SELECT NOT EXISTS(SELECT 1 FROM layout_rows WHERE school_id=? AND year=? AND table_name='timed_source' AND row_id='head') AS ok",
        args: [school, y],
      };

  const result = {
    state: "adopted",
    year: y,
    revision: nextRevision,
    sourceOperationId,
    sequence,
    digest: editionDigest,
    lessonCount: lessons.length,
  };

  const receipt = await commitOperation(ctx.env.DB, op, {
    now,
    guards: [guard],
    writes: [
      {
        sql: "INSERT INTO layout_rows(school_id,year,table_name,row_id,revision,value_json) VALUES(?,?,'timed_source','head',?,?) ON CONFLICT(school_id,year,table_name,row_id) DO UPDATE SET revision=excluded.revision,value_json=excluded.value_json",
        args: [school, y, nextRevision, canonical(headPayload)],
      },
      {
        sql: "INSERT OR IGNORE INTO layout_rows(school_id,year,table_name,row_id,revision,value_json) VALUES(?,?,'timed_source_editions',?,?,?)",
        args: [school, y, sourceOperationId, nextRevision, canonical(headPayload)],
      },
    ],
    result,
    audit: {
      sourceDomain,
      sourceOperationId,
      sequence,
      digest: editionDigest,
    },
    admission: {
      kind: "system",
      reason: "Verified committed Roster timed-source timetable projection",
    },
  });
  return receipt.result;
}

export async function readTimedTimetable(ctx, input, { current }) {
  const school = ctx.principal.schoolId;
  const requestedDate = input.date ? validDate(input.date) : null;
  const y = validYear(
    input.year ||
      (requestedDate ? Number(requestedDate.slice(0, 4)) : new Date(ctx.now + 28800000).getUTCFullYear()),
  );

  // Planning copy is optional; aSc timed timetable must work with zero Deploy publication!
  const planning = await current(ctx, y, { empty: true });
  const headRow = await one(
    ctx.env.DB,
    "SELECT revision, value_json FROM layout_rows WHERE school_id=? AND year=? AND table_name='timed_source' AND row_id='head'",
    [school, y],
  );
  if (!headRow) {
    return {
      year: y,
      date: requestedDate,
      covered: false,
      planningSource: planning.head
        ? {
            publicationId: planning.head.source_publication_id,
            sequence: planning.head.source_sequence,
            revision: planning.head.revision,
          }
        : null,
      timedSource: null,
      venues: [],
      disagreements: [],
    };
  }

  const head = JSON.parse(headRow.value_json);
  const obj = await ctx.env.ARTIFACTS?.get(head.objectKey);
  if (!obj) {
    fail("TIMED_SOURCE_UNAVAILABLE", "Adopted timed-source artifact is unavailable.", 503);
  }
  const text = await obj.text();
  if ((await digest(text)) !== head.digest) {
    fail("TIMED_SOURCE_CORRUPT", "Adopted timed-source integrity check failed.", 503);
  }
  const edition = JSON.parse(text);

  const covered = requestedDate
    ? requestedDate >= edition.coverage.from && requestedDate <= edition.coverage.to
    : true;
  const matchingLessons = !covered
    ? []
    : requestedDate
      ? edition.lessons.filter((l) => l.date === requestedDate)
      : edition.lessons;

  const grouped = groupByPhysicalVenue(matchingLessons);

  // Compare against Layout's planning rooms/classes if present, flagging disagreements without refusing sources.
  const planningRooms = new Map(
    (planning.snapshot?.venues || planning.snapshot?.rooms || []).map((v) => [
      v.id || v.unit,
      v,
    ]),
  );
  const disagreements = [];
  const venues = grouped.map((g) => {
    const planned = planningRooms.get(g.venueId);
    if (planning.head && !planned) {
      disagreements.push({
        kind: "venue-absent-in-planning",
        venueId: g.venueId,
        sourceLabels: g.sourceLabels,
      });
    }
    return {
      venueId: g.venueId,
      name: planned?.name || g.venueId,
      sourceLabels: g.sourceLabels,
      lessons: g.lessons,
    };
  });

  return {
    year: y,
    date: requestedDate,
    covered,
    planningSource: planning.head
      ? {
          publicationId: planning.head.source_publication_id,
          sequence: planning.head.source_sequence,
          revision: planning.head.revision,
        }
      : null,
    timedSource: {
      sourceDomain: head.sourceDomain,
      sourceKind: head.sourceKind,
      sourceOperationId: head.sourceOperationId,
      sourceDigest: head.sourceDigest,
      sequence: head.sequence,
      revision: headRow.revision,
      coverage: edition.coverage,
      adoptedAt: head.adoptedAt,
    },
    venues,
    disagreements,
  };
}
