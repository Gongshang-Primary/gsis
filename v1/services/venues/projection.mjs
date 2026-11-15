import { ApiError } from "../../runtime/errors.mjs";
import {
  one,
  query,
  canonical,
  digest,
  prepareOperation,
  commitOperation,
} from "../../runtime/store.mjs";
import { serviceCall } from "../../runtime/security.mjs";
const need = (x, code, message, status = 409) => {
  if (!x) throw new ApiError(code, status, message);
};
const atom = (x) =>
  typeof x === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(x);
const date = (x) =>
  typeof x === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  new Date(x + "T00:00:00Z").toISOString().slice(0, 10) === x;
const epoch = (d) => Date.parse(d + "T00:00:00+08:00");
async function operation(ctx, suffix, intent, actorId, validUntil) {
  const x = ctx.body;
  return prepareOperation(ctx.env.DB, {
    schoolId: x.schoolId,
    actorId,
    operationId: `venue-${suffix}:${(await digest([x.sourceDomain, x.sourceOperationId, intent])).slice(0, 48)}`,
    action: `internal.venues.${suffix}`,
    intent,
    now: ctx.now,
    validUntil,
  });
}
export async function projectionManifest(proof) {
  const p = proof.projection;
  need(
    p && p.staged,
    "PROJECTION_MANIFEST_REQUIRED",
    "A staged immutable source projection is required.",
    503,
  );
  const st = p.staged,
    c = p.coverage;
  need(
    st.schemaVersion === 1 &&
      Array.isArray(st.chunks) &&
      st.chunks.length <= 2000 &&
      Number.isInteger(st.totalCount) &&
      st.totalCount >= 0 &&
      st.totalCount <= 512000,
    "PROJECTION_BOUNDS",
    "Projection manifest exceeds its bounds.",
    413,
  );
  need(
    c &&
      date(c.from) &&
      date(c.to) &&
      c.to >= c.from &&
      (epoch(c.to) - epoch(c.from)) / 86400000 < 366 &&
      Array.isArray(c.venueIds) &&
      c.venueIds.length <= 1000 &&
      new Set(c.venueIds).size === c.venueIds.length &&
      c.venueIds.every(atom),
    "INVALID_COVERAGE",
    "Provide bounded canonical venue/date coverage.",
    503,
  );
  need(
    Array.isArray(c.periods) &&
      c.periods.length <= 64 &&
      c.periods.every(
        (q) =>
          atom(q.id) &&
          Number.isInteger(q.start) &&
          Number.isInteger(q.end) &&
          q.start >= 0 &&
          q.end <= 1440 &&
          q.start < q.end,
      ),
    "INVALID_COVERAGE",
    "Provide valid period timings.",
    503,
  );
  let total = 0;
  for (let i = 0; i < st.chunks.length; i++) {
    const chunk = st.chunks[i];
    need(
      chunk.index === i &&
        Number.isInteger(chunk.count) &&
        chunk.count > 0 &&
        chunk.count <= 256 &&
        /^[a-f0-9]{64}$/.test(chunk.digest),
      "INVALID_MANIFEST",
      "Projection chunk identity is invalid.",
      503,
    );
    total += chunk.count;
  }
  need(
    total === st.totalCount,
    "INVALID_MANIFEST",
    "Projection count does not match its chunks.",
    503,
  );
  const manifest = {
    schemaVersion: 1,
    sourceKind: p.sourceKind || "day",
    coverage: c,
    chunks: st.chunks,
    totalCount: st.totalCount,
  };
  need(
    (await digest(manifest)) === st.manifestDigest,
    "MANIFEST_DIGEST_MISMATCH",
    "Source manifest integrity failed.",
    503,
  );
  return { manifest, manifestDigest: st.manifestDigest };
}
export async function beginStaged(ctx, proof, principal) {
  const x = ctx.body,
    { manifest, manifestDigest } = await projectionManifest(proof);
  let row = await one(
    ctx.env.DB,
    "SELECT * FROM venues_projection_manifests WHERE school_id=? AND source_domain=? AND source_operation_id=?",
    [x.schoolId, x.sourceDomain, x.sourceOperationId],
  );
  if (!row) {
    need(
      ["prepared", "pending"].includes(proof.state),
      "SOURCE_FENCE_MISSING",
      "Committed source cannot retrospectively acquire a fence.",
    );
    const roomRows = await query(
      ctx.env.DB,
      "SELECT record_id,revision FROM venues_records WHERE school_id=? AND kind='venues' AND record_id IN (SELECT value FROM json_each(?))",
      [x.schoolId, canonical(manifest.coverage.venueIds)],
    );
    need(
      roomRows.length === manifest.coverage.venueIds.length,
      "INVALID_VENUE",
      "Source coverage contains an unknown venue.",
    );
    const guards = roomRows.map((r) => ({
      sql: "SELECT EXISTS(SELECT 1 FROM venues_records WHERE school_id=? AND kind='venues' AND record_id=? AND revision=?) AS ok",
      args: [x.schoolId, r.record_id, r.revision],
    }));
    const writes = [
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
      {
        sql: "INSERT INTO venues_projection_manifests(school_id,source_domain,source_operation_id,manifest_digest,manifest_json,chunk_count) VALUES(?,?,?,?,?,?)",
        args: [
          x.schoolId,
          x.sourceDomain,
          x.sourceOperationId,
          manifestDigest,
          canonical(manifest),
          manifest.chunks.length,
        ],
      },
      {
        sql: "INSERT INTO venues_fence_scopes SELECT ?,?,?,value,?,? FROM json_each(?)",
        args: [
          x.schoolId,
          x.sourceDomain,
          x.sourceOperationId,
          epoch(manifest.coverage.from),
          epoch(manifest.coverage.to) + 86400000,
          canonical(manifest.coverage.venueIds),
        ],
      },
    ];
    const op = await operation(
      ctx,
      "stage-begin",
      {
        manifestDigest,
        sourceDigest: x.sourceDigest,
        sourceFence: x.sourceFence,
      },
      principal.actorId,
      principal.validUntil,
    );
    await commitOperation(ctx.env.DB, op, {
      now: ctx.now,
      guards,
      writes,
      result: { state: "pending", sealed: false },
      admission: {
        kind: "system",
        reason:
          "Validated prepared source identity; coarse fence blocks admission during staged validation",
      },
    });
    row = await one(
      ctx.env.DB,
      "SELECT * FROM venues_projection_manifests WHERE school_id=? AND source_domain=? AND source_operation_id=?",
      [x.schoolId, x.sourceDomain, x.sourceOperationId],
    );
  }
  need(
    row.manifest_digest === manifestDigest,
    "SOURCE_FENCE_CONFLICT",
    "Prepared manifest changed.",
  );
  const fence = await one(
    ctx.env.DB,
    "SELECT * FROM venues_source_fences WHERE school_id=? AND source_domain=? AND source_operation_id=?",
    [x.schoolId, x.sourceDomain, x.sourceOperationId],
  );
  need(
    fence?.source_digest === x.sourceDigest &&
      fence.source_fence === x.sourceFence &&
      fence.state === "pending",
    "SOURCE_FENCE_CONFLICT",
    "Source fence is no longer pending.",
  );
  if (row.sealed)
    return {
      state: "pending",
      sealed: true,
      manifestDigest,
      validatedChunks: row.validated_count,
      totalChunks: row.chunk_count,
    };
  // Four bounded chunks per invocation; a retry resumes durable progress without restarting the scan.
  for (
    let cursor = row.validated_count;
    cursor < Math.min(row.chunk_count, row.validated_count + 4);
    cursor++
  )
    await validateChunk(
      ctx,
      proof,
      principal,
      manifest,
      manifestDigest,
      cursor,
    );
  row = await one(
    ctx.env.DB,
    "SELECT * FROM venues_projection_manifests WHERE school_id=? AND source_domain=? AND source_operation_id=?",
    [x.schoolId, x.sourceDomain, x.sourceOperationId],
  );
  if (row.validated_count === row.chunk_count && !row.sealed) {
    const op = await operation(
      ctx,
      "stage-seal",
      { manifestDigest },
      principal.actorId,
      principal.validUntil,
    );
    await commitOperation(ctx.env.DB, op, {
      now: ctx.now,
      guards: [
        {
          sql: "SELECT EXISTS(SELECT 1 FROM venues_projection_manifests WHERE school_id=? AND source_domain=? AND source_operation_id=? AND manifest_digest=? AND validated_count=chunk_count) AS ok",
          args: [
            x.schoolId,
            x.sourceDomain,
            x.sourceOperationId,
            manifestDigest,
          ],
        },
        {
          sql: "SELECT EXISTS(SELECT 1 FROM venues_source_fences WHERE school_id=? AND source_domain=? AND source_operation_id=? AND state='pending') AS ok",
          args: [x.schoolId, x.sourceDomain, x.sourceOperationId],
        },
      ],
      writes: [
        {
          sql: "UPDATE venues_projection_manifests SET sealed=1 WHERE school_id=? AND source_domain=? AND source_operation_id=?",
          args: [x.schoolId, x.sourceDomain, x.sourceOperationId],
        },
      ],
      result: { sealed: true, manifestDigest },
      admission: {
        kind: "system",
        reason:
          "Every immutable projection chunk checked while the coarse booking fence was held",
      },
    });
    row.sealed = 1;
  }
  return {
    state: "pending",
    sealed: row.sealed === 1,
    sourceOperationId: x.sourceOperationId,
    sourceDigest: x.sourceDigest,
    sourceFence: x.sourceFence,
    manifestDigest,
    validatedChunks: row.validated_count,
    totalChunks: row.chunk_count,
  };
}
async function validateChunk(
  ctx,
  proof,
  principal,
  manifest,
  manifestDigest,
  index,
) {
  const x = ctx.body,
    meta = manifest.chunks[index];
  const part = await serviceCall(
    ctx.env,
    x.sourceDomain,
    "/internal/source-projection-chunk",
    {
      schoolId: x.schoolId,
      operationId: x.sourceOperationId,
      index,
      decisionId: x.decisionId,
    },
  );
  need(
    part.schoolId === x.schoolId &&
      part.operationId === x.sourceOperationId &&
      part.digest === x.sourceDigest &&
      part.fence === x.sourceFence &&
      part.index === index &&
      part.chunkDigest === meta.digest &&
      Array.isArray(part.rows) &&
      part.rows.length === meta.count &&
      (await digest(part.rows)) === meta.digest,
    "SOURCE_CHUNK_INVALID",
    "An immutable source chunk could not be verified.",
    503,
  );
  const rows = part.rows.map((r, n) => {
    need(
      atom(r.venueId) &&
        manifest.coverage.venueIds.includes(r.venueId) &&
        Number.isSafeInteger(r.start) &&
        Number.isSafeInteger(r.end) &&
        r.start < r.end &&
        r.start >= epoch(manifest.coverage.from) &&
        r.end <= epoch(manifest.coverage.to) + 86400000 &&
        r.end - r.start <= 86400000,
      "SOURCE_CHUNK_INVALID",
      "Occupancy is outside its frozen scope.",
      503,
    );
    return {
      key: `${index}:${n}`,
      venueId: r.venueId,
      start: r.start,
      end: r.end,
      sourceId: String(r.sourceId || `${index}:${n}`).slice(0, 128),
    };
  });
  const encoded = canonical(rows);
  need(
    encoded.length <= 131072,
    "SOURCE_CHUNK_BOUNDS",
    "A projection chunk exceeds 128 KiB.",
    413,
  );
  const op = await operation(
    ctx,
    "stage-chunk",
    { manifestDigest, index, chunkDigest: meta.digest },
    principal.actorId,
    principal.validUntil,
  );
  const guards = [
    {
      sql: "SELECT EXISTS(SELECT 1 FROM venues_projection_manifests WHERE school_id=? AND source_domain=? AND source_operation_id=? AND manifest_digest=? AND validated_count=?) AS ok",
      args: [
        x.schoolId,
        x.sourceDomain,
        x.sourceOperationId,
        manifestDigest,
        index,
      ],
    },
    {
      sql: "SELECT EXISTS(SELECT 1 FROM venues_source_fences WHERE school_id=? AND source_domain=? AND source_operation_id=? AND state='pending') AS ok",
      args: [x.schoolId, x.sourceDomain, x.sourceOperationId],
    },
    {
      sql: `SELECT NOT EXISTS(SELECT 1 FROM json_each(?) p JOIN venues_records v ON v.school_id=? AND v.kind='venues' AND v.record_id=json_extract(p.value,'$.venueId') JOIN venues_intervals i ON i.school_id=v.school_id AND i.kind IN ('booking','closure') AND i.status IN ('confirmed','pending','active') AND (i.venue_id=v.record_id OR (COALESCE(json_extract(v.data_json,'$.overlapGroup'),'')<>'' AND i.overlap_group=json_extract(v.data_json,'$.overlapGroup'))) WHERE i.start_at-i.buffer_ms<json_extract(p.value,'$.end')+COALESCE(json_extract(v.data_json,'$.bufferMinutes'),0)*60000 AND i.end_at+i.buffer_ms>json_extract(p.value,'$.start')-COALESCE(json_extract(v.data_json,'$.bufferMinutes'),0)*60000) AS ok`,
      args: [encoded, x.schoolId],
    },
  ];
  const writes = [
    {
      sql: `INSERT INTO venues_projection_rows SELECT ?,?,?,json_extract(p.value,'$.key'),json_extract(p.value,'$.sourceId'),v.record_id,COALESCE(json_extract(v.data_json,'$.overlapGroup'),''),json_extract(p.value,'$.start'),json_extract(p.value,'$.end'),COALESCE(json_extract(v.data_json,'$.bufferMinutes'),0)*60000 FROM json_each(?) p JOIN venues_records v ON v.school_id=? AND v.kind='venues' AND v.record_id=json_extract(p.value,'$.venueId')`,
      args: [
        x.schoolId,
        x.sourceDomain,
        x.sourceOperationId,
        encoded,
        x.schoolId,
      ],
    },
    {
      sql: "INSERT INTO venues_projection_parts VALUES(?,?,?,?,?,?)",
      args: [
        x.schoolId,
        x.sourceDomain,
        x.sourceOperationId,
        index,
        meta.digest,
        meta.count,
      ],
    },
    {
      sql: "UPDATE venues_projection_manifests SET validated_count=validated_count+1 WHERE school_id=? AND source_domain=? AND source_operation_id=?",
      args: [x.schoolId, x.sourceDomain, x.sourceOperationId],
    },
  ];
  await commitOperation(ctx.env.DB, op, {
    now: ctx.now,
    guards,
    writes,
    result: { validated: index + 1 },
    admission: {
      kind: "system",
      reason:
        "Verified prepared-source immutable chunk and owner-side existing reservation conflicts",
    },
  });
}
