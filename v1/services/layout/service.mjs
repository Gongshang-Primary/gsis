import layoutData from "../../../shared/layout-data.js";
import { publishedSnapshot } from "./publication.mjs";
import { ApiError } from "../../runtime/errors.mjs";
import {
  canonical,
  digest,
  query,
  one,
  prepareOperation,
  commitOperation,
  abortOperation,
  operationStatus,
} from "../../runtime/store.mjs";
import {
  admit,
  resolveAdmission,
  serviceCall,
} from "../../runtime/security.mjs";
const TABLES = ["venues", "classes", "groups", "allocations", "pupilBreakdown"];
const EDITABLE = {
  venues: ["active"],
  classes: ["active"],
  groups: [
    "teacherLabels",
    "pupilCount",
    "pupilCountText",
    "programmes",
    "active",
    "notes",
  ],
  allocations: ["active"],
};
export const WORKBOOK_COLUMNS = {
  venues: [
    "Venue ID",
    "Unit",
    "Geometry unit",
    "Venue",
    "Abbreviation",
    "Block",
    "Floor",
    "Capacity",
    "Active",
    "Source locator",
  ],
  classes: ["Class ID", "Class", "Level", "Name", "Short name", "Active"],
  groups: [
    "TG ID",
    "TG",
    "Level",
    "Subject",
    "Teacher labels",
    "Pupils",
    "Pupil text",
    "Programme notes",
    "Source venue text",
    "Active",
    "Source locator",
    "Review notes",
  ],
  allocations: [
    "Allocation ID",
    "Kind",
    "Target ID",
    "Class or TG",
    "Unit",
    "Active",
    "Source",
    "Source locator",
    "Notes",
  ],
  pupilBreakdown: [
    "Breakdown ID",
    "TG ID",
    "TG",
    "Form class",
    "Pupils",
    "Source locator",
  ],
};
const COLUMN_FIELDS = {
  venues: [
    "id",
    "unitNumber",
    "geometryUnit",
    "name",
    "shortName",
    "block",
    "floor",
    "capacity",
    "active",
    "sourceLocator",
  ],
  classes: ["id", "code", "level", "name", "shortName", "active"],
  groups: [
    "id",
    "code",
    "level",
    "subject",
    "teacherLabels",
    "pupilCount",
    "pupilCountText",
    "programmes",
    "sourceVenueText",
    "active",
    "sourceLocator",
    "notes",
  ],
  allocations: [
    "id",
    "kind",
    "targetId",
    "targetLabel",
    "unitNumber",
    "active",
    "sourceId",
    "sourceLocator",
    "notes",
  ],
  pupilBreakdown: [
    "id",
    "groupId",
    "groupCode",
    "formClass",
    "pupils",
    "sourceLocator",
  ],
};
function fail(code, message, status = 400) {
  throw new ApiError(code, status, message, {
    retryable: status === 409 || status === 503,
  });
}
function id(v) {
  if (typeof v !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/.test(v))
    fail("INVALID_INPUT", "Invalid identifier.");
  return v;
}
function integer(v, min, max, label) {
  if (!Number.isSafeInteger(v) || v < min || v > max)
    fail("INVALID_INPUT", "Invalid " + label + ".");
  return v;
}
function year(v) {
  return integer(Number(v), 2000, 2099, "Layout year");
}
function has(p, c) {
  return (
    Array.isArray(p?.capabilities) &&
    (p.capabilities.includes("admin") || p.capabilities.includes(c))
  );
}
function check(ctx, write = false) {
  if (
    !ctx.principal?.schoolId ||
    !ctx.principal.actorId ||
    !has(ctx.principal, write ? "layout.edit" : "layout.read")
  )
    fail("CAPABILITY_DENIED", "Layout access is not permitted.", 403);
  if (write && ctx.principal.impersonating)
    fail("IMPERSONATION_DENIED", "Preview is read-only.", 403);
}
function params(ctx) {
  return {
    ...Object.fromEntries(
      new URL(ctx.request?.url || "https://internal" + ctx.path).searchParams,
    ),
    ...(ctx.body || {}),
  };
}
const sql = (sql, args = []) => ({ sql, args });
export function policy(method, path, body = {}) {
  const p = path.split("?")[0];
  if (method === "GET" && ["/public/campus", "/public-campus"].includes(p))
    return {
      action: "layout.public",
      write: false,
      public: true,
      resourceId: "campus",
    };
  if (
    (method === "GET" &&
      [
        "/snapshot",
        "/owned-data",
        "/export",
        "/history",
        "/profile",
        "/receipt",
      ].includes(p)) ||
    (method === "POST" && p === "/profile")
  )
    return {
      action: "layout.read",
      write: false,
      resourceId: body.year ? String(body.year) : "campus",
    };
  if (
    method === "POST" &&
    [
      "/owned-data",
      "/import-preview",
      "/import-apply",
      "/adopt",
      "/snapshot/import",
    ].includes(p)
  )
    return {
      action: "layout.edit",
      write: p !== "/import-preview",
      resourceId: body.year ? String(body.year) : "campus",
    };
  fail("NOT_FOUND", "Unknown Layout operation.", 404);
}
function validate(snapshot, y) {
  snapshot.pupilBreakdown ??= [];
  if (snapshot.year !== y)
    fail("WRONG_YEAR", "Snapshot belongs to another Layout year.", 409);
  try {
    layoutData.validate(snapshot);
  } catch {
    fail(
      "INVALID_SNAPSHOT",
      "Layout snapshot has invalid identities, units or references.",
    );
  }
  for (const name of TABLES) {
    if (
      !Array.isArray(snapshot[name] || []) ||
      (snapshot[name] || []).length > 2000
    )
      fail("RESULT_BOUNDS", "Layout table exceeds 2,000 records.", 422);
  }
  if (canonical(snapshot).length > 2 * 1024 * 1024)
    fail("RESULT_BOUNDS", "Layout snapshot exceeds 2 MiB.", 422);
  return snapshot;
}
async function current(ctx, y, { empty = false, revision } = {}) {
  const school = ctx.principal.schoolId,
    head = await one(
      ctx.env.DB,
      "SELECT * FROM layout_heads WHERE school_id=? AND year=?",
      [school, y],
    );
  if (!head) {
    if (empty) return { head: null, snapshot: layoutData.empty(y) };
    fail(
      "SNAPSHOT_UNAVAILABLE",
      "No verified Layout snapshot exists for this year.",
      503,
    );
  }
  let row = await one(
    ctx.env.DB,
    "SELECT * FROM layout_snapshots WHERE school_id=? AND " +
      (revision === undefined ? "snapshot_id=?" : "year=? AND revision=?"),
    revision === undefined
      ? [school, head.snapshot_id]
      : [
          school,
          y,
          integer(Number(revision), 1, Number.MAX_SAFE_INTEGER, "revision"),
        ],
  );
  if (!row) fail("NOT_FOUND", "Historical Layout snapshot not found.", 404);
  const obj = await ctx.env.ARTIFACTS?.get(row.object_key);
  if (!obj || obj.size !== row.bytes)
    fail("SNAPSHOT_UNAVAILABLE", "Snapshot storage is unavailable.", 503);
  const data = await obj.text();
  if ((await digest(data)) !== row.sha256)
    fail("INTEGRITY_FAILED", "Stored Layout snapshot integrity differs.", 503);
  let snapshot;
  try {
    snapshot = JSON.parse(data);
  } catch {
    fail("INTEGRITY_FAILED", "Stored Layout snapshot is invalid.", 503);
  }
  validate(snapshot, y);
  return { head, snapshot, stored: row };
}
async function storeSnapshot(ctx, snapshot, op, revision, now) {
  const school = ctx.principal.schoolId;
  validate(snapshot, snapshot.year);
  if (!ctx.env.ARTIFACTS)
    fail(
      "STORAGE_UNAVAILABLE",
      "Layout private snapshot storage is not configured.",
      503,
    );
  const raw = canonical(snapshot),
    sha = await digest(raw),
    key = `${school}/layout/${snapshot.year}/${sha}.json`;
  await ctx.env.ARTIFACTS.put(key, raw, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { sha256: sha },
  });
  const verified = await ctx.env.ARTIFACTS.get(key);
  if (!verified || (await digest(await verified.text())) !== sha)
    fail(
      "STORAGE_UNAVAILABLE",
      "Snapshot write could not be verified. The previous head is preserved.",
      503,
    );
  const snapshotId = `layout-${op.operationId}`;
  return {
    snapshotId,
    sha,
    key,
    bytes: new TextEncoder().encode(raw).length,
    write: sql(
      "INSERT INTO layout_snapshots(school_id,snapshot_id,year,revision,object_key,sha256,bytes,source_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        school,
        snapshotId,
        snapshot.year,
        revision,
        key,
        sha,
        new TextEncoder().encode(raw).length,
        canonical(snapshot.sourceDeployVersion || null),
        now,
      ],
    ),
  };
}
async function mutation(ctx, action, fn) {
  check(ctx, true);
  const p = ctx.principal,
    now = ctx.now ?? Date.now(),
    body = { ...ctx.body };
  delete body.requestId;
  const op = await prepareOperation(ctx.env.DB, {
    schoolId: p.schoolId,
    actorId: p.actorId,
    operationId: id(body.operationId),
    action: "layout." + action,
    intent: body,
    now,
    validUntil: p.validUntil,
    authorization: p,
  });
  if (op.state === "committed")
    return { ...op.receipt.result, receipt: op.receipt };
  if (op.state !== "prepared")
    fail(
      "OPERATION_TERMINAL",
      "This operation was fenced. Review before starting a new request.",
      409,
    );
  let admission;
  try {
    const plan = await fn({ op, now });
    admission = await admit(
      ctx.env,
      ctx.env.DB,
      op,
      p,
      plan.dependencies || [],
      now,
    );
    const receipt = await commitOperation(ctx.env.DB, op, {
      ...plan,
      now,
      validUntil: p.validUntil,
      admission,
      audit: {
        domain: "layout",
        action,
        year: body.year,
        actorId: p.actorId,
        ...plan.audit,
      },
    });
    await resolveAdmission(ctx.env, ctx.env.DB, op, admission, receipt, now);
    return { ...receipt.result, receipt };
  } catch (error) {
    let result;
    try {
      result = await abortOperation(
        ctx.env.DB,
        op,
        error.code || "COMMIT_FAILED",
        now,
      );
    } catch {}
    if (admission && result)
      await resolveAdmission(
        ctx.env,
        ctx.env.DB,
        op,
        admission,
        result,
        now,
      ).catch(() => {});
    throw error;
  }
}
function headGuard(school, y, revision) {
  return sql(
    "SELECT COALESCE((SELECT revision FROM layout_heads WHERE school_id=? AND year=?),0)=? AS ok",
    [school, y, revision],
  );
}
function headWrite(school, y, revision, stored, snapshot, now) {
  return sql(
    "INSERT INTO layout_heads(school_id,year,revision,snapshot_id,source_publication_id,source_sequence,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(school_id,year) DO UPDATE SET revision=excluded.revision,snapshot_id=excluded.snapshot_id,source_publication_id=excluded.source_publication_id,source_sequence=excluded.source_sequence,updated_at=excluded.updated_at",
    [
      school,
      y,
      revision,
      stored.snapshotId,
      snapshot.sourceDeployVersion?.commit || null,
      snapshot.sourceDeployVersion?.sequence || null,
      now,
    ],
  );
}
function rowsWrites(school, y, snapshot, revision) {
  const writes = [];
  for (const table of TABLES) {
    const rows = snapshot[table] || [];
    for (const row of rows) id(row.id);
    writes.push(
      sql(
        "DELETE FROM layout_rows WHERE school_id=? AND year=? AND table_name=?",
        [school, y, table],
      ),
    );
    writes.push(
      sql(
        "INSERT INTO layout_rows(school_id,year,table_name,row_id,revision,value_json) SELECT ?,?,?,json_extract(value,'$.id'),?,value FROM json_each(?)",
        [school, y, table, revision, canonical(rows)],
      ),
    );
  }
  return writes;
}
function editedRow(row, table, changes) {
  if (
    !changes ||
    typeof changes !== "object" ||
    Array.isArray(changes) ||
    !Object.keys(changes).length ||
    Object.keys(changes).some((k) => !EDITABLE[table]?.includes(k))
  )
    fail(
      "FIELD_OWNERSHIP",
      "Only Layout-owned fields may be edited. Venue geometry and published assignments belong to their owners.",
      403,
    );
  const next = { ...row, ...changes };
  if ("active" in changes && !["Y", "N"].includes(changes.active))
    fail("INVALID_INPUT", "Active must be Y or N.");
  if ("pupilCount" in changes && changes.pupilCount !== null)
    integer(changes.pupilCount, 0, 10000, "pupil count");
  for (const key of ["teacherLabels", "pupilCountText", "programmes", "notes"])
    if (
      key in changes &&
      (typeof changes[key] !== "string" || changes[key].length > 4000)
    )
      fail("INVALID_INPUT", "Invalid " + key + ".");
  return next;
}
async function saveOwned(ctx, input) {
  return mutation(ctx, "owned-data", async ({ op, now }) => {
    const y = year(input.year),
      revision = integer(
        input.revision,
        1,
        Number.MAX_SAFE_INTEGER,
        "revision",
      ),
      { head, snapshot } = await current(ctx, y);
    if (head.revision !== revision)
      fail("REVISION_CONFLICT", "Layout changed. Review your draft.", 409);
    const table = input.table,
      row = snapshot[table]?.find((r) => r.id === input.id);
    if (!row || !EDITABLE[table])
      fail("NOT_FOUND", "Layout record not found.", 404);
    const next = structuredClone(snapshot),
      index = next[table].findIndex((r) => r.id === input.id);
    next[table][index] = editedRow(row, table, input.changes);
    next.previousRevision = snapshot.revision;
    next.revision = `${y}-local-${op.operationId}`;
    const stored = await storeSnapshot(ctx, next, op, revision + 1, now),
      school = ctx.principal.schoolId,
      old = await one(
        ctx.env.DB,
        "SELECT value_json FROM layout_annotations WHERE school_id=? AND year=? AND table_name=? AND row_id=?",
        [school, y, table, row.id],
      ),
      annotation = {
        ...(old ? JSON.parse(old.value_json) : {}),
        ...input.changes,
      };
    return {
      guards: [headGuard(school, y, revision)],
      writes: [
        stored.write,
        sql(
          "UPDATE layout_rows SET revision=?,value_json=? WHERE school_id=? AND year=? AND table_name=? AND row_id=?",
          [
            revision + 1,
            canonical(next[table][index]),
            school,
            y,
            table,
            row.id,
          ],
        ),
        sql(
          "INSERT INTO layout_annotations(school_id,year,table_name,row_id,revision,value_json) VALUES(?,?,?,?,?,?) ON CONFLICT(school_id,year,table_name,row_id) DO UPDATE SET revision=excluded.revision,value_json=excluded.value_json",
          [school, y, table, row.id, revision + 1, canonical(annotation)],
        ),
        headWrite(school, y, revision + 1, stored, next, now),
      ],
      result: {
        year: y,
        revision: revision + 1,
        layoutRevision: next.revision,
        snapshotId: stored.snapshotId,
      },
      audit: {
        table,
        rowId: row.id,
        before: Object.fromEntries(
          Object.keys(input.changes).map((k) => [k, row[k] ?? null]),
        ),
        after: input.changes,
      },
    };
  });
}
export function workbook(snapshot, schoolId, revision) {
  const sheets = {};
  for (const table of TABLES) {
    sheets[table] = {
      columns: WORKBOOK_COLUMNS[table],
      rows: (snapshot[table] || []).map((r) =>
        COLUMN_FIELDS[table].map((field) => r[field] ?? null),
      ),
    };
  }
  return { schemaVersion: 1, schoolId, year: snapshot.year, revision, sheets };
}
function parseWorkbook(input, snapshot, school, revision) {
  if (
    !input ||
    input.schemaVersion !== 1 ||
    input.schoolId !== school ||
    input.year !== snapshot.year ||
    input.revision !== revision
  )
    fail(
      "WORKBOOK_SCOPE",
      "Workbook metadata differs from this school, year or revision.",
      409,
    );
  if (
    !input.sheets ||
    Object.keys(input.sheets).sort().join("|") !==
      TABLES.slice().sort().join("|")
  )
    fail(
      "WORKBOOK_SCHEMA",
      "The workbook must include all five canonical Layout tables.",
    );
  const next = structuredClone(snapshot),
    diff = [];
  for (const table of TABLES) {
    const sheet = input.sheets[table];
    if (
      !sheet ||
      canonical(sheet.columns) !== canonical(WORKBOOK_COLUMNS[table]) ||
      !Array.isArray(sheet.rows) ||
      sheet.rows.length !== snapshot[table].length
    )
      fail(
        "WORKBOOK_SCHEMA",
        "Layout " +
          table +
          " headers or row identities differ. Mark Active N instead of deleting records.",
      );
    const seen = new Set();
    for (const values of sheet.rows) {
      if (
        !Array.isArray(values) ||
        values.length !== COLUMN_FIELDS[table].length
      )
        fail("WORKBOOK_SCHEMA", "Invalid Layout row width.");
      const rowId = values[0],
        prior = snapshot[table].find((r) => r.id === rowId);
      if (!prior || seen.has(rowId))
        fail("WORKBOOK_SCHEMA", "Unknown or duplicate Layout identity.");
      seen.add(rowId);
      const changes = {};
      for (let i = 1; i < values.length; i++) {
        const field = COLUMN_FIELDS[table][i],
          old = prior[field] ?? null,
          value = values[i] ?? null;
        if (canonical(value) === canonical(old)) continue;
        if (!EDITABLE[table]?.includes(field))
          fail(
            "FIELD_OWNERSHIP",
            "Published/source columns are read-only.",
            403,
          );
        changes[field] = value;
      }
      if (Object.keys(changes).length) {
        const index = next[table].findIndex((r) => r.id === rowId);
        next[table][index] = editedRow(prior, table, changes);
        diff.push({ table, id: rowId, changes });
      }
    }
  }
  validate(next, snapshot.year);
  return { next, diff };
}
async function previewImport(ctx, input) {
  check(ctx, true);
  const y = year(input.year),
    { head, snapshot } = await current(ctx, y),
    revision = integer(input.revision, 1, Number.MAX_SAFE_INTEGER, "revision");
  if (head.revision !== revision)
    fail("REVISION_CONFLICT", "Layout changed before preview.", 409);
  const parsed = parseWorkbook(
      input.workbook,
      snapshot,
      ctx.principal.schoolId,
      revision,
    ),
    hash = await digest(input.workbook),
    previewId = "preview-" + crypto.randomUUID(),
    expiresAt = (ctx.now ?? Date.now()) + 900000;
  // This stores only a staging token, never accepted Layout facts or a new head.
  await ctx.env.DB.prepare(
    "INSERT INTO layout_previews(school_id,preview_id,actor_id,year,base_revision,input_digest,payload_json,expires_at) VALUES(?,?,?,?,?,?,?,?)",
  )
    .bind(
      ctx.principal.schoolId,
      previewId,
      ctx.principal.actorId,
      y,
      revision,
      hash,
      canonical(input.workbook),
      expiresAt,
    )
    .run();
  return {
    previewId,
    year: y,
    revision,
    inputDigest: hash,
    expiresAt,
    diff: parsed.diff,
    unchangedCount:
      TABLES.reduce((n, t) => n + snapshot[t].length, 0) - parsed.diff.length,
    requiresConfirmation: true,
  };
}
async function applyImport(ctx, input) {
  return mutation(ctx, "import-apply", async ({ op, now }) => {
    const y = year(input.year),
      revision = integer(
        input.revision,
        1,
        Number.MAX_SAFE_INTEGER,
        "revision",
      ),
      preview = await one(
        ctx.env.DB,
        "SELECT * FROM layout_previews WHERE school_id=? AND preview_id=?",
        [ctx.principal.schoolId, id(input.previewId)],
      );
    if (
      !preview ||
      preview.actor_id !== ctx.principal.actorId ||
      preview.year !== y ||
      preview.base_revision !== revision ||
      preview.expires_at <= now
    )
      fail(
        "PREVIEW_INVALID",
        "Import preview expired or belongs to another context.",
        409,
      );
    const { head, snapshot } = await current(ctx, y);
    if (head.revision !== revision)
      fail("REVISION_CONFLICT", "Layout changed after the preview.", 409);
    const data = JSON.parse(preview.payload_json);
    if ((await digest(data)) !== preview.input_digest)
      fail("INTEGRITY_FAILED", "Import preview integrity differs.", 503);
    const { next, diff } = parseWorkbook(
      data,
      snapshot,
      ctx.principal.schoolId,
      revision,
    );
    next.previousRevision = snapshot.revision;
    next.revision = `${y}-import-${op.operationId}`;
    const stored = await storeSnapshot(ctx, next, op, revision + 1, now),
      school = ctx.principal.schoolId,
      writes = [stored.write, ...rowsWrites(school, y, next, revision + 1)];
    for (const change of diff) {
      const old = await one(
        ctx.env.DB,
        "SELECT value_json FROM layout_annotations WHERE school_id=? AND year=? AND table_name=? AND row_id=?",
        [school, y, change.table, change.id],
      );
      writes.push(
        sql(
          "INSERT INTO layout_annotations(school_id,year,table_name,row_id,revision,value_json) VALUES(?,?,?,?,?,?) ON CONFLICT(school_id,year,table_name,row_id) DO UPDATE SET revision=excluded.revision,value_json=excluded.value_json",
          [
            school,
            y,
            change.table,
            change.id,
            revision + 1,
            canonical({
              ...(old ? JSON.parse(old.value_json) : {}),
              ...change.changes,
            }),
          ],
        ),
      );
    }
    writes.push(headWrite(school, y, revision + 1, stored, next, now));
    return {
      guards: [
        headGuard(school, y, revision),
        sql(
          "SELECT actor_id=? AND base_revision=? AND expires_at>? AS ok FROM layout_previews WHERE school_id=? AND preview_id=?",
          [ctx.principal.actorId, revision, now, school, preview.preview_id],
        ),
      ],
      writes,
      result: {
        year: y,
        revision: revision + 1,
        layoutRevision: next.revision,
        changed: diff.length,
      },
      audit: {
        previewId: preview.preview_id,
        inputDigest: preview.input_digest,
        changed: diff.map((d) => ({ table: d.table, id: d.id })),
      },
    };
  });
}
async function initialImport(ctx, input) {
  return mutation(ctx, "initial-import", async ({ op, now }) => {
    const y = year(input.year),
      revision = integer(input.revision, 0, 0, "initial revision"),
      { head } = await current(ctx, y, { empty: true });
    if (head)
      fail(
        "REVISION_CONFLICT",
        "Initial source import cannot replace an existing Layout year.",
        409,
      );
    const snapshot = validate(structuredClone(input.snapshot), y);
    snapshot.revision = `${y}-initial-${op.operationId}`;
    snapshot.sourceDeployVersion = null;
    snapshot.state = "source-import";
    const stored = await storeSnapshot(ctx, snapshot, op, 1, now),
      school = ctx.principal.schoolId;
    return {
      guards: [headGuard(school, y, revision)],
      writes: [
        stored.write,
        ...rowsWrites(school, y, snapshot, 1),
        headWrite(school, y, 1, stored, snapshot, now),
      ],
      result: {
        year: y,
        revision: 1,
        layoutRevision: snapshot.revision,
        snapshotId: stored.snapshotId,
      },
      audit: {
        sourceDigest: stored.sha,
        counts: Object.fromEntries(
          TABLES.map((t) => [t, snapshot[t]?.length || 0]),
        ),
      },
    };
  });
}
async function adopt(ctx, input) {
  return mutation(ctx, "adopt", async ({ op, now }) => {
    const y = year(input.year),
      { head, snapshot } = await current(ctx, y, { empty: true }),
      revision = integer(
        input.revision,
        0,
        Number.MAX_SAFE_INTEGER,
        "revision",
      );
    if ((head?.revision || 0) !== revision)
      fail("REVISION_CONFLICT", "Layout changed before source adoption.", 409);
    const source = await serviceCall(
      ctx.env,
      "deploy",
      "/internal/publication",
      {
        publicationId: id(input.publicationId),
        decisionId: ctx.principal.decisionId,
        schoolId: ctx.principal.schoolId,
        purpose: "layout",
      },
    );
    if (
      source.schoolId !== ctx.principal.schoolId ||
      source.year !== y ||
      source.publicationId !== input.publicationId ||
      !source.document ||
      !Number.isSafeInteger(source.sequence) ||
      typeof source.digest !== "string"
    )
      fail(
        "SOURCE_INVALID",
        "Published source scope or evidence differs.",
        409,
      );
    if (head?.source_sequence && source.sequence < head.source_sequence)
      fail(
        "STALE_SOURCE",
        "A delayed publication cannot replace a newer Layout source.",
        409,
      );
    let next;
    try {
      next = publishedSnapshot(snapshot, source);
    } catch {
      fail(
        "SOURCE_INVALID",
        "Published Layout source has incompatible year, identities or references.",
        409,
      );
    }
    const annotations = await query(
      ctx.env.DB,
      "SELECT table_name,row_id,value_json FROM layout_annotations WHERE school_id=? AND year=?",
      [ctx.principal.schoolId, y],
    );
    for (const a of annotations) {
      const index = next[a.table_name]?.findIndex((r) => r.id === a.row_id);
      if (index >= 0)
        next[a.table_name][index] = editedRow(
          next[a.table_name][index],
          a.table_name,
          JSON.parse(a.value_json),
        );
    }
    next.previousRevision = snapshot.revision;
    next.revision = `${y}-adopt-${op.operationId}`;
    next.sourceDeployVersion = {
      ...next.sourceDeployVersion,
      sequence: source.sequence,
      digest: source.digest,
    };
    const stored = await storeSnapshot(ctx, next, op, revision + 1, now),
      school = ctx.principal.schoolId;
    return {
      guards: [headGuard(school, y, revision)],
      writes: [
        stored.write,
        ...rowsWrites(school, y, next, revision + 1),
        headWrite(school, y, revision + 1, stored, next, now),
      ],
      result: {
        year: y,
        revision: revision + 1,
        layoutRevision: next.revision,
        publicationId: source.publicationId,
        localAnnotationsPreserved: annotations.length,
      },
      audit: { publicationId: source.publicationId, digest: source.digest },
    };
  });
}
export async function handle(ctx) {
  const input = params(ctx),
    path = ctx.path.split("?")[0],
    desc = policy(ctx.method, ctx.path, input);
  if (desc.public) {
    if (!ctx.env.SCHOOL_ID)
      fail("CONFIGURATION_REQUIRED", "School scope is not configured.", 503);
    ctx = {
      ...ctx,
      principal: {
        schoolId: ctx.env.SCHOOL_ID,
        actorId: "public-layout",
        capabilities: ["layout.read"],
      },
    };
  }
  check(ctx, desc.write || path === "/import-preview");
  if (ctx.method === "POST") {
    if (path === "/owned-data") return saveOwned(ctx, input);
    if (path === "/import-preview") return previewImport(ctx, input);
    if (path === "/import-apply") return applyImport(ctx, input);
    if (path === "/snapshot/import") return initialImport(ctx, input);
    if (path === "/adopt") return adopt(ctx, input);
  }
  if (path === "/profile")
    return {
      user: {
        email: ctx.principal.email || "",
        staffId: ctx.principal.staffId,
        roles: ctx.principal.capabilities,
      },
    };
  if (path === "/receipt") {
    const row = await operationStatus(
      ctx.env.DB,
      ctx.principal.schoolId,
      id(input.operationId),
    );
    if (
      row &&
      row.actorId !== ctx.principal.actorId &&
      !has(ctx.principal, "admin")
    )
      fail("CAPABILITY_DENIED", "Receipt is outside your scope.", 403);
    return row;
  }
  const y = year(
    input.year ||
      new Date((ctx.now ?? Date.now()) + 8 * 3600000).getUTCFullYear(),
  );
  if (path === "/history")
    return {
      year: y,
      snapshots: await query(
        ctx.env.DB,
        "SELECT snapshot_id,revision,sha256,source_json,created_at FROM layout_snapshots WHERE school_id=? AND year=? ORDER BY revision DESC LIMIT 200",
        [ctx.principal.schoolId, y],
      ),
    };
  const { head, snapshot, stored } = await current(ctx, y, {
    revision: input.revision,
  });
  if (path === "/public/campus" || path === "/public-campus") {
    if (input.since === snapshot.revision)
      return {
        unchanged: true,
        layoutYear: y,
        layoutRevision: snapshot.revision,
      };
    return layoutData.publicView(snapshot);
  }
  if (path === "/snapshot")
    return {
      year: y,
      revision: stored.revision,
      snapshot,
      source: JSON.parse(stored.source_json),
    };
  if (path === "/owned-data")
    return {
      year: y,
      revision: head.revision,
      layoutRevision: snapshot.revision,
      rows: Object.fromEntries(TABLES.map((t) => [t, snapshot[t] || []])),
      editableFields: EDITABLE,
      source: snapshot.sourceDeployVersion,
    };
  if (path === "/export")
    return workbook(snapshot, ctx.principal.schoolId, stored.revision);
  fail("NOT_FOUND", "Unknown Layout operation.", 404);
}

/** Immutable source delivery: fetch the committed publication from its owning service. */
export async function internal(ctx) {
  if (ctx.path !== "/internal/adopt-publication")
    fail("NOT_FOUND", "Unknown Layout integration operation.", 404);
  const school = ctx.env.SCHOOL_ID,
    input = ctx.body,
    yInput = input.year;
  if (input.schoolId !== school)
    fail("SCHOOL_MISMATCH", "Foreign school source.", 403);
  const proof = await serviceCall(
    ctx.env,
    "deploy",
    "/internal/publication/verify",
    {
      publicationId: id(input.publicationId),
      schoolId: school,
      sourceOperationId: id(input.sourceOperationId),
      sourceDigest: input.sourceDigest,
      sourceFence: input.sourceFence,
    },
  );
  const source = {
    ...proof,
    document: proof.layout,
    year: proof.layout?.year,
    digest: proof.payloadDigest,
  };
  if (proof.state !== "committed")
    fail("SOURCE_INVALID", "Source operation is not committed.", 409);
  if (
    source.schoolId !== school ||
    source.publicationId !== input.publicationId ||
    !source.document ||
    !Number.isSafeInteger(source.sequence) ||
    typeof source.digest !== "string"
  )
    fail("SOURCE_INVALID", "Source publication evidence differs.", 409);
  const y = year(source.year);
  if (yInput !== undefined && Number(yInput) !== y)
    fail("WRONG_YEAR", "Source year differs.", 409);
  const local = {
      ...ctx,
      principal: {
        schoolId: school,
        actorId: "system-layout",
        capabilities: ["layout.read", "layout.edit"],
      },
    },
    old = await current(local, y, { empty: true });
  if (old.head?.source_sequence >= source.sequence)
    return {
      state:
        old.head.source_publication_id === source.publicationId
          ? "adopted"
          : "ignored",
      publicationId: source.publicationId,
      revision: old.head.revision,
    };
  const operationId =
      "source-" + (await digest([school, source.publicationId])).slice(0, 48),
    now = ctx.now ?? Date.now(),
    op = await prepareOperation(ctx.env.DB, {
      schoolId: school,
      actorId: "system-layout",
      operationId,
      action: "internal.layout.adopt",
      intent: { publicationId: source.publicationId, digest: source.digest },
      now,
      validUntil: now + 30000,
    });
  if (op.state === "committed") return op.receipt.result;
  let next;
  try {
    next = publishedSnapshot(old.snapshot, source);
  } catch {
    fail("SOURCE_INVALID", "Published source is incompatible.", 409);
  }
  const annotations = await query(
    ctx.env.DB,
    "SELECT table_name,row_id,value_json FROM layout_annotations WHERE school_id=? AND year=?",
    [school, y],
  );
  for (const a of annotations) {
    const index = next[a.table_name]?.findIndex((r) => r.id === a.row_id);
    if (index >= 0)
      next[a.table_name][index] = editedRow(
        next[a.table_name][index],
        a.table_name,
        JSON.parse(a.value_json),
      );
  }
  next.previousRevision = old.snapshot.revision;
  next.revision = `${y}-source-${source.publicationId}`;
  const revision = (old.head?.revision || 0) + 1,
    stored = await storeSnapshot(local, next, op, revision, now);
  const receipt = await commitOperation(ctx.env.DB, op, {
    now,
    guards: [headGuard(school, y, revision - 1)],
    writes: [
      stored.write,
      ...rowsWrites(school, y, next, revision),
      headWrite(school, y, revision, stored, next, now),
    ],
    result: {
      state: "adopted",
      year: y,
      revision,
      publicationId: source.publicationId,
      layoutRevision: next.revision,
    },
    audit: {
      sourceOperationId: input.sourceOperationId,
      sourcePublicationId: source.publicationId,
      digest: source.digest,
    },
    admission: {
      kind: "system",
      reason: "Verified committed Deploy publication projection",
    },
  });
  return receipt.result;
}
