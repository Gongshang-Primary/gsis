import {
  query,
  one,
  statement,
  canonical,
  digest,
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
import {
  queueSourceChange,
  requestSourceCancellations,
  sourceChangeGuard,
  sourceChangeDone,
  acquireSourcePin,
  releaseSourcePin,
  requireMembership,
  inspectDecision,
} from "../../runtime/admission.mjs";
import { ApiError } from "../../runtime/errors.mjs";
import { drainOutbox } from "../../runtime/jobs.mjs";
import { exportDrive, reconcileDrive } from "./exports.mjs";
import { check, id, text, finite, plain } from "./validation.mjs";
import {
  defaults,
  applyEdits,
  validateDocument,
  mergeContacts,
  calculate,
  can,
} from "./model.mjs";
import { exportWorkbook, validateWorkbook, PROPOSABLE } from "./workbooks.mjs";
const READ = new Set([
  "/bootstrap",
  "/sync",
  "/delta",
  "/versions",
  "/tables",
  "/export",
  "/imports/preview",
  "/publishReview",
  "/receipt",
  "/publication-status",
  "/publications",
  "/publications/history",
  "/current-publication",
  "/internal/publication",
  "/internal/publication/current",
  "/internal/publication-status",
  "/versionNote",
  "/auditPage",
  "/health",
  "/access",
]);
const WRITE = new Set([
  "/change",
  "/lease",
  "/imports/apply",
  "/versions/create",
  "/publish",
  "/acknowledgeNotices",
  "/staff/register",
  "/exports/reconcile",
]);
export function policy(method, path, body = {}) {
  check(
    ["GET", "POST"].includes(method),
    "Unsupported method.",
    "METHOD_NOT_ALLOWED",
    405,
  );
  if (path.startsWith("/internal/pins/"))
    return {
      action: "deploy.internal",
      write: false,
      resourceId: "publication",
      internal: true,
    };
  check(
    READ.has(path) || WRITE.has(path),
    "Unknown Deploy route.",
    "NOT_FOUND",
    404,
  );
  const write = WRITE.has(path),
    publishing =
      path === "/publish" ||
      (path === "/change" &&
        ["publish", "retryContactsSync"].includes(body.operation));
  return {
    action: publishing
      ? "deploy.publish"
      : write || path === "/imports/preview"
        ? "deploy.edit"
        : "deploy.read",
    write,
    resourceId: body.versionId || body.publicationId || "versions",
  };
}
const rootRows = new Set([
  "classes",
  "groups",
  "assignments",
  "teachers",
  "venues",
  "duties",
  "classNameSets",
  "levelExclusions",
]);
function flatten(doc) {
  const out = new Map();
  for (const [scope, value] of Object.entries(doc)) {
    if (
      [
        "id",
        "name",
        "revision",
        "createdAt",
        "status",
        "publication",
        "publishedRevision",
        "reliefResults",
        "reliefAdmin",
        "conflictNotices",
      ].includes(scope)
    )
      continue;
    if (rootRows.has(scope) && Array.isArray(value)) {
      value.forEach((row, i) =>
        out.set(
          `${scope}\0${row.id || row.ref || row.teacher || String(i)}`,
          canonical(row),
        ),
      );
      out.set(
        `_orders\0${scope}`,
        canonical(
          value.map((row, i) => row.id || row.ref || row.teacher || String(i)),
        ),
      );
    } else if (
      [
        "teacherNotes",
        "teacherDrafts",
        "loads",
        "fortnight",
        "organisations",
      ].includes(scope) &&
      value &&
      typeof value === "object"
    ) {
      for (const [k, v] of Object.entries(value))
        out.set(`${scope}\0${k}`, canonical(v));
    } else out.set(`_settings\0${scope}`, canonical(value));
  }
  return out;
}
export function inflate(rows) {
  const d = defaults(),
    orders = {};
  for (const scope of rootRows) d[scope] = [];
  for (const r of rows) {
    const v = JSON.parse(r.value);
    if (r.scope === "_settings") d[r.row_id] = v;
    else if (r.scope === "_orders") orders[r.row_id] = v;
    else if (rootRows.has(r.scope)) {
      if (!Array.isArray(d[r.scope])) d[r.scope] = [];
      d[r.scope].push(v);
    } else {
      d[r.scope] ??= {};
      d[r.scope][r.row_id] = v;
    }
  }
  for (const scope of rootRows) {
    if (orders[scope]) {
      const ix = new Map(orders[scope].map((id, i) => [id, i]));
      d[scope].sort(
        (a, b) =>
          (ix.get(a.id || a.ref || a.teacher) ?? 0) -
          (ix.get(b.id || b.ref || b.teacher) ?? 0),
      );
    }
  }
  return d;
}
export async function loadVersion(db, schoolId, versionId) {
  id(versionId, "version");
  const out = await db.batch([
    statement(
      db,
      "SELECT * FROM deploy_versions WHERE school_id=? AND id=? AND deleted=0",
      [schoolId, versionId],
    ),
    statement(
      db,
      "SELECT * FROM deploy_rows WHERE school_id=? AND version_id=?",
      [schoolId, versionId],
    ),
  ]);
  const version = out[0].results[0];
  check(version, "Planning version not found.", "NOT_FOUND", 404);
  const doc = {
    ...inflate(out[1].results),
    ...JSON.parse(version.metadata),
    id: version.id,
    name: version.name,
    revision: version.revision,
    createdAt: version.created_at,
  };
  return { version, doc, rows: out[1].results };
}
function cleanIntent(body) {
  const b = structuredClone(body);
  for (const k of [
    "requestId",
    "operationId",
    "protocol",
    "authority",
    "auditPaged",
    "reliefResults",
    "returnDelta",
    "since",
    "knownCatalogueHash",
  ])
    delete b[k];
  return b;
}
async function prepare(
  ctx,
  action = policy(ctx.method, ctx.path, ctx.body).action,
) {
  const p = ctx.principal,
    b = ctx.body;
  check(
    p && !p.impersonating && can(p, action),
    "Mutation is not permitted.",
    "CAPABILITY_DENIED",
    403,
  );
  const op = await prepareOperation(ctx.env.DB, {
    schoolId: p.schoolId,
    actorId: p.actorId,
    operationId: id(b.operationId || b.requestId, "operation"),
    action,
    intent: cleanIntent(b),
    now: ctx.now,
    validUntil: p.validUntil,
    authorization: p,
  });
  check(
    op.state !== "aborted",
    "This operation was conclusively aborted. Refresh before starting a new operation.",
    "OPERATION_ABORTED",
    409,
  );
  return op;
}
async function finish(
  ctx,
  op,
  writes,
  guards,
  result,
  { dependencies = [], outbox = [], audit = {} } = {},
) {
  const admission = await admit(
    ctx.env,
    ctx.env.DB,
    op,
    ctx.principal,
    dependencies,
    ctx.now,
  );
  try {
    const receipt = await commitOperation(ctx.env.DB, op, {
      now: ctx.now,
      validUntil: Math.min(
        op.validUntil,
        admission.validUntil || op.validUntil,
      ),
      writes,
      guards,
      result,
      audit,
      outbox,
      admission,
    });
    await resolveAdmission(
      ctx.env,
      ctx.env.DB,
      op,
      admission,
      receipt,
      ctx.now,
    );
    return receipt.result;
  } catch (error) {
    if (error.status === 409) {
      const outcome = await abortOperation(ctx.env.DB, op, error.code, ctx.now);
      await statement(
        ctx.env.DB,
        "UPDATE source_changes SET state='aborted' WHERE school_id=? AND operation_id=? AND state='pending' AND EXISTS(SELECT 1 FROM product_operations WHERE school_id=? AND operation_id=? AND state='aborted')",
        [op.schoolId, op.operationId, op.schoolId, op.operationId],
      ).run();
      await resolveAdmission(
        ctx.env,
        ctx.env.DB,
        op,
        admission,
        outcome,
        ctx.now,
      );
    }
    throw error;
  }
}
const scopeGuard = (school, version, revision) => ({
  sql: "SELECT EXISTS(SELECT 1 FROM deploy_versions WHERE school_id=? AND id=? AND revision=? AND deleted=0) AS ok",
  args: [school, version, revision],
});
export function changesFor(school, version, beforeRows, next) {
  const old = new Map(
      beforeRows.map((row) => [`${row.scope}\0${row.row_id}`, row]),
    ),
    fresh = flatten(next),
    delta = [];
  for (const key of new Set([...old.keys(), ...fresh.keys()])) {
    const prior = old.get(key),
      value = fresh.get(key);
    if (prior?.value === value) continue;
    const [scope, row] = key.split("\0");
    delta.push({
      scope,
      row,
      expected: prior ? prior.revision : null,
      revision: (prior?.revision || 0) + 1,
      deleted: value === undefined,
      body: value ?? null,
    });
  }
  if (!delta.length) return { writes: [], guards: [], changedRows: 0 };
  const payload = JSON.stringify(delta);
  check(
    delta.length <= 8192 &&
      new TextEncoder().encode(payload).byteLength <= 1024 * 1024,
    "The atomic planning change exceeds the supported 8192 rows or 1 MiB delta. Reduce the change; no planning rows were saved.",
    "EDIT_BOUNDS",
    413,
  );
  // Compare every changed row against the exact loaded revision (or absence).
  // Unrelated rows do not participate; the caller separately retains its version and lease guards.
  const guards = [
      {
        sql: `SELECT NOT EXISTS(
      SELECT 1 FROM json_each(?) delta
      LEFT JOIN deploy_rows current ON current.school_id=? AND current.version_id=?
        AND current.scope=json_extract(delta.value,'$.scope') AND current.row_id=json_extract(delta.value,'$.row')
      WHERE (json_extract(delta.value,'$.expected') IS NULL AND current.row_id IS NOT NULL)
        OR (json_extract(delta.value,'$.expected') IS NOT NULL AND (current.row_id IS NULL OR current.revision<>json_extract(delta.value,'$.expected')))
    ) AS ok`,
        args: [payload, school, version],
      },
    ],
    writes = [];
  if (delta.some((row) => row.deleted))
    writes.push({
      sql: `DELETE FROM deploy_rows WHERE school_id=? AND version_id=? AND EXISTS(
      SELECT 1 FROM json_each(?) delta WHERE json_extract(delta.value,'$.deleted')=1
        AND deploy_rows.scope=json_extract(delta.value,'$.scope') AND deploy_rows.row_id=json_extract(delta.value,'$.row')
    )`,
      args: [school, version, payload],
    });
  if (delta.some((row) => !row.deleted))
    writes.push({
      sql: `INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value)
      SELECT ?,?,json_extract(delta.value,'$.scope'),json_extract(delta.value,'$.row'),json_extract(delta.value,'$.revision'),json_extract(delta.value,'$.body')
      FROM json_each(?) delta WHERE json_extract(delta.value,'$.deleted')=0
      ON CONFLICT(school_id,version_id,scope,row_id) DO UPDATE SET revision=excluded.revision,value=excluded.value`,
      args: [school, version, payload],
    });
  return { writes, guards, changedRows: delta.length };
}

async function contacts(ctx) {
  return serviceCall(ctx.env, "contacts", "/internal/projection", {
    purpose: "deploy",
    schoolId: ctx.principal.schoolId,
    decisionId: ctx.principal.decisionId,
  });
}
async function bootstrap(ctx) {
  const school = ctx.principal.schoolId;
  const versions = await query(
    ctx.env.DB,
    "SELECT id,name,revision,created_at,metadata FROM deploy_versions WHERE school_id=? AND deleted=0 ORDER BY created_at DESC LIMIT 200",
    [school],
  );
  const pointer = await one(
    ctx.env.DB,
    "SELECT * FROM deploy_pointer WHERE school_id=?",
    [school],
  );
  const requested = ctx.body.versionId || versions[0]?.id;
  let doc = requested
    ? (await loadVersion(ctx.env.DB, school, requested)).doc
    : null;
  let projection = null,
    referenceError = null;
  try {
    projection = await contacts(ctx);
    if (doc) doc = mergeContacts(doc, projection);
  } catch (e) {
    referenceError = {
      code: e.code || "CONTACTS_UNAVAILABLE",
      message:
        "Contacts reference could not be verified; saved planning data is still available.",
    };
  }
  if (doc)
    doc.conflictNotices = (
      await query(
        ctx.env.DB,
        "SELECT id,body FROM deploy_notices WHERE school_id=? AND version_id=? AND acknowledged_at IS NULL AND (actor_id IS NULL OR actor_id=?) ORDER BY id LIMIT 100",
        [school, doc.id, ctx.principal.actorId],
      )
    ).map((r) => ({ ...JSON.parse(r.body), requestId: r.id }));
  if (doc && projection) {
    const calculated = calculate(doc, projection);
    doc.reliefResults = calculated.ui;
    if (can(ctx.principal, "admin")) doc.reliefAdmin = calculated.admin;
  }
  const activePublication = pointer
    ? await one(
        ctx.env.DB,
        "SELECT version_id,working_revision FROM deploy_publications WHERE school_id=? AND id=?",
        [school, pointer.publication_id],
      )
    : null;
  const list = versions.map((v) => ({
    id: v.id,
    name: v.name,
    revision: v.revision,
    status: "draft",
    publication:
      activePublication?.version_id === v.id
        ? activePublication.working_revision === v.revision
          ? "Published"
          : "Saved draft; previous publication in force"
        : "Saved draft",
    publishedRevision:
      activePublication?.version_id === v.id
        ? activePublication.working_revision
        : null,
  }));
  if (doc) {
    const status = list.find((v) => v.id === doc.id);
    Object.assign(doc, {
      status: "draft",
      publication: status?.publication || "Saved draft",
      publishedRevision: status?.publishedRevision ?? null,
    });
  }
  const caps = ctx.principal.capabilities;
  return {
    user: {
      capabilities: ctx.principal.capabilities,
      email: ctx.principal.email || ctx.principal.actorId,
      roles: caps.includes("admin")
        ? ["Admin", "KP"]
        : caps.includes("deploy.edit")
          ? ["KP"]
          : ["SMC"],
      palEditor: caps.includes("admin") || caps.includes("deploy.pal"),
    },
    versions: list,
    current: doc,
    currentId: requested || null,
    revision: list.reduce((n, v) => n + v.revision, 0),
    cacheKey: doc
      ? `${doc.id}:${doc.revision}:${projection?.revision || "unavailable"}`
      : null,
    leases: requested
      ? await query(
          ctx.env.DB,
          "SELECT scope AS key,holder AS actor,fence AS token,expires_at AS until FROM deploy_leases WHERE school_id=? AND version_id=? AND expires_at>?",
          [school, requested, ctx.now],
        )
      : [],
    sysFields: doc?.hrTerms || projection?.hrTerms || {},
    roleCatalogue:
      projection?.roleCatalogue ||
      (doc?.membership || []).map((r) => ({
        role: r[0],
        level: r[12],
        groups: [
          "SL",
          "SC",
          "SMC",
          "KP",
          "TL",
          "SDT",
          "CMT",
          "SAT",
          "Support",
          "MK",
        ].filter((k, i) => r[i + 2] === "1"),
      })),
    staffCatalog: doc?.teachers || [],
    currentPublication: pointer
      ? { publicationId: pointer.publication_id, sequence: pointer.sequence }
      : null,
    referenceError,
  };
}
async function create(ctx) {
  const op = await prepare(ctx, "deploy.edit");
  if (op.receipt) return op.receipt.result;
  const school = ctx.principal.schoolId,
    b = ctx.body;
  const versionId =
    "version-" +
    (await digest({ school, operationId: op.operationId }).then((s) =>
      s.slice(0, 24),
    ));
  let doc = defaults();
  if (b.copyFrom || b.sourceId || (b.duplicate && b.sourceVersionId))
    doc = (
      await loadVersion(
        ctx.env.DB,
        school,
        b.copyFrom || b.sourceId || b.sourceVersionId,
      )
    ).doc;
  let p = await contacts(ctx);
  doc = mergeContacts(
    {
      ...doc,
      id: versionId,
      year: Number(
        b.year ??
          doc.year ??
          new Intl.DateTimeFormat("en", {
            timeZone: "Asia/Singapore",
            year: "numeric",
          }).format(ctx.now),
      ),
      name: text(b.name || "New planning version", 120),
      from: b.from || "",
      to: b.to || "",
      revision: 0,
    },
    p,
  );
  validateDocument(doc);
  const metadata = canonical({
    from: doc.from || "",
    to: doc.to || "",
    notes: doc.notes || "",
  });
  let delta;
  try {
    delta = changesFor(school, versionId, [], doc);
  } catch (error) {
    if (error.code !== "EDIT_BOUNDS") throw error;
    const outcome = await abortOperation(ctx.env.DB, op, error.code, ctx.now);
    if (outcome?.state === "committed") return outcome.result;
    throw error;
  }
  const writes = [
    {
      sql: "INSERT INTO deploy_versions(school_id,id,name,revision,metadata,created_at) VALUES(?,?,?,0,?,?)",
      args: [school, versionId, doc.name, metadata, ctx.now],
    },
    ...delta.writes,
  ];
  return finish(
    ctx,
    op,
    writes,
    [
      {
        sql: "SELECT COUNT(*)<200 AS ok FROM deploy_versions WHERE school_id=? AND deleted=0",
        args: [school],
      },
    ],
    {
      saved: true,
      versionId,
      requestId: b.requestId || op.operationId,
      revision: 0,
    },
    { dependencies: p.dependencies || [], audit: { versionId, created: true } },
  );
}
async function lease(ctx) {
  const op = await prepare(ctx);
  if (op.receipt) return op.receipt.result;
  const b = ctx.body,
    school = ctx.principal.schoolId,
    version = id(b.versionId),
    scope = text(b.scope || b.key || "meta", 160),
    client = id(b.clientId || ctx.principal.sessionId);
  await loadVersion(ctx.env.DB, school, version);
  const old = await one(
    ctx.env.DB,
    "SELECT * FROM deploy_leases WHERE school_id=? AND version_id=? AND scope=?",
    [school, version, scope],
  );
  if (b.release) {
    check(
      old &&
        old.holder === ctx.principal.actorId &&
        old.client_id === client &&
        Number(b.fence ?? b.token) === old.fence,
      "Lease changed.",
      "LEASE_CONFLICT",
      409,
    );
    return finish(
      ctx,
      op,
      [
        {
          sql: "UPDATE deploy_leases SET expires_at=?,fence=fence+1 WHERE school_id=? AND version_id=? AND scope=?",
          args: [ctx.now, school, version, scope],
        },
      ],
      [
        {
          sql: "SELECT EXISTS(SELECT 1 FROM deploy_leases WHERE school_id=? AND version_id=? AND scope=? AND fence=? AND holder=?) AS ok",
          args: [school, version, scope, old.fence, ctx.principal.actorId],
        },
      ],
      { released: true },
    );
  }
  check(
    !old ||
      old.expires_at <= ctx.now ||
      (old.holder === ctx.principal.actorId && old.client_id === client),
    "Another editor holds this scope.",
    "LEASE_CONFLICT",
    409,
  );
  const renewed =
    old &&
    old.expires_at > ctx.now &&
    old.holder === ctx.principal.actorId &&
    old.client_id === client;
  if (b.fence !== undefined)
    check(
      old?.fence === b.fence,
      "Lease fence is stale.",
      "LEASE_CONFLICT",
      409,
    );
  const fence = renewed ? old.fence : (old?.fence || 0) + 1,
    until = ctx.now + 60000;
  const guards = old
    ? [
        {
          sql: "SELECT EXISTS(SELECT 1 FROM deploy_leases WHERE school_id=? AND version_id=? AND scope=? AND fence=? AND expires_at=?) AS ok",
          args: [school, version, scope, old.fence, old.expires_at],
        },
      ]
    : [
        {
          sql: "SELECT NOT EXISTS(SELECT 1 FROM deploy_leases WHERE school_id=? AND version_id=? AND scope=?) AS ok",
          args: [school, version, scope],
        },
      ];
  guards.push({
    sql: "SELECT NOT EXISTS(SELECT 1 FROM deploy_leases WHERE school_id=? AND version_id=? AND expires_at>? AND NOT(holder=? AND client_id=?) AND (scope='meta' OR ?='meta' OR scope=?)) AS ok",
    args: [
      school,
      version,
      ctx.now,
      ctx.principal.actorId,
      client,
      scope,
      scope,
    ],
  });
  return finish(
    ctx,
    op,
    [
      {
        sql: "INSERT INTO deploy_leases(school_id,version_id,scope,holder,client_id,fence,expires_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(school_id,version_id,scope) DO UPDATE SET holder=excluded.holder,client_id=excluded.client_id,fence=excluded.fence,expires_at=excluded.expires_at",
        args: [
          school,
          version,
          scope,
          ctx.principal.actorId,
          client,
          fence,
          until,
        ],
      },
    ],
    guards,
    {
      fence,
      token: fence,
      until,
      scope,
      key: scope,
      revision: (await loadVersion(ctx.env.DB, school, version)).version
        .revision,
    },
  );
}
function leaseGuard(ctx, scope) {
  const b = ctx.body;
  const fence = Number(b.leaseFence ?? b.fence ?? b.token);
  check(
    Number.isSafeInteger(fence) && fence > 0,
    "Acquire a current editing lease first.",
    "LEASE_REQUIRED",
    409,
  );
  return {
    sql: "SELECT EXISTS(SELECT 1 FROM deploy_leases WHERE school_id=? AND version_id=? AND scope=? AND holder=? AND client_id=? AND fence=? AND expires_at>?) AS ok",
    args: [
      ctx.principal.schoolId,
      b.versionId,
      scope,
      ctx.principal.actorId,
      b.clientId || ctx.principal.sessionId,
      fence,
      ctx.now,
    ],
  };
}
function expiredLeaseWrite(ctx, scope) {
  return {
    sql: "UPDATE deploy_leases SET expires_at=?,fence=fence+1 WHERE school_id=? AND version_id=? AND scope=?",
    args: [ctx.now, ctx.principal.schoolId, ctx.body.versionId, scope],
  };
}
async function save(
  ctx,
  { document = null, preview = null, dependencies = [] } = {},
) {
  const op = await prepare(ctx, "deploy.edit");
  if (op.receipt) return op.receipt.result;
  const b = ctx.body,
    school = ctx.principal.schoolId,
    loaded = await loadVersion(ctx.env.DB, school, b.versionId),
    scope = b.scope || b.key || "meta";
  let next = document;
  let extraDependencies = dependencies;
  if (
    !next &&
    (b.edits || [b]).some((e) =>
      ["initReporting", "setReportingOfficer"].includes(e.operation),
    )
  ) {
    const ref = await contacts(ctx);
    loaded.doc = mergeContacts(loaded.doc, ref);
    extraDependencies = ref.dependencies || [];
  }
  if (
    !next &&
    (b.edits || [b]).some(
      (e) =>
        e.operation === "upsertTeacherProfile" &&
        !loaded.doc.teachers.some((t) => t.id === e.teacher),
    )
  ) {
    const ref = await contacts(ctx);
    loaded.doc = mergeContacts(loaded.doc, ref);
    extraDependencies = ref.dependencies || [];
  }
  if (!next) {
    if (b.operation === "saveVersionNote") {
      check(
        typeof b.notes === "string" && b.notes.length <= 4000,
        "Invalid note.",
      );
      check(
        b.expected === undefined || b.expected === (loaded.doc.notes || ""),
        "Note changed.",
        "REVISION_CONFLICT",
        409,
      );
      next = { ...loaded.doc, notes: b.notes };
    } else
      next = applyEdits(
        loaded.doc,
        b.edits || [{ ...b, operation: b.operation }],
      );
  }
  validateDocument(next);
  let delta;
  try {
    delta = changesFor(school, b.versionId, loaded.rows, next);
  } catch (error) {
    if (error.code !== "EDIT_BOUNDS") throw error;
    const outcome = await abortOperation(ctx.env.DB, op, error.code, ctx.now);
    if (outcome?.state === "committed") return outcome.result;
    throw error;
  }
  const guards = [...delta.guards, leaseGuard(ctx, scope)];
  const expected = b.revision ?? b.expectedRevision;
  if (expected !== undefined)
    guards.push(scopeGuard(school, b.versionId, expected));
  if (preview)
    guards.push(scopeGuard(school, b.versionId, preview.base_revision));
  // Scope-row CAS permits independent edits; imports/publications additionally bind the entire saved revision.
  const metadataChanged = ["name", "from", "to", "notes"].some(
    (k) => next[k] !== loaded.doc[k],
  );
  if (metadataChanged)
    guards.push(scopeGuard(school, b.versionId, loaded.version.revision));
  const versionWrite = metadataChanged
    ? {
        sql: "UPDATE deploy_versions SET name=?,metadata=?,revision=revision+1 WHERE school_id=? AND id=?",
        args: [
          next.name,
          canonical({
            from: next.from || "",
            to: next.to || "",
            notes: next.notes || "",
          }),
          school,
          b.versionId,
        ],
      }
    : {
        sql: "UPDATE deploy_versions SET revision=revision+1 WHERE school_id=? AND id=?",
        args: [school, b.versionId],
      };
  const writes = [...delta.writes, versionWrite, expiredLeaseWrite(ctx, scope)];
  return finish(
    ctx,
    op,
    writes,
    guards,
    {
      saved: true,
      versionId: b.versionId,
      requestId: b.requestId || op.operationId,
      changedRows: delta.changedRows,
    },
    {
      dependencies: extraDependencies,
      audit: {
        versionId: b.versionId,
        scope,
        changedRows: delta.changedRows,
        previewId: preview?.id || null,
      },
    },
  );
}
async function previewImport(ctx) {
  const b = ctx.body,
    loaded = await loadVersion(ctx.env.DB, ctx.principal.schoolId, b.versionId),
    ref = await contacts(ctx);
  loaded.doc = mergeContacts(loaded.doc, ref);
  const dependencyDigest = await digest(ref.dependencies || []);
  const validated = validateWorkbook(
    b.workbook,
    loaded.doc,
    ctx.principal.schoolId,
    loaded.version.revision,
    { matches: b.matches || {} },
  );
  const before = flatten(loaded.doc),
    after = flatten(validated.document),
    diff = { added: 0, removed: 0, changed: 0 };
  for (const k of new Set([...before.keys(), ...after.keys()]))
    if (before.get(k) !== after.get(k)) {
      if (!before.has(k)) diff.added++;
      else if (!after.has(k)) diff.removed++;
      else diff.changed++;
    }
  const previewId = crypto.randomUUID(),
    hash = await digest({ workbook: b.workbook, matches: b.matches || {} }),
    expiresAt = ctx.now + 900000;
  // Preview is an expiring, actor-bound preparation artifact; it makes no business change.
  await statement(
    ctx.env.DB,
    "INSERT INTO deploy_previews(school_id,id,actor_id,version_id,base_revision,scope,digest,workbook,expires_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [
      ctx.principal.schoolId,
      previewId,
      ctx.principal.actorId,
      b.versionId,
      loaded.version.revision,
      validated.scope,
      hash,
      canonical({
        workbook: b.workbook,
        matches: b.matches || {},
        dependencyDigest,
      }),
      expiresAt,
    ],
  ).run();
  return {
    previewId,
    digest: hash,
    scope: validated.scope,
    baseRevision: loaded.version.revision,
    diff,
    errors: [],
    expiresAt,
    workbook: b.workbook,
  };
}
async function applyImport(ctx) {
  const b = ctx.body,
    p = await one(
      ctx.env.DB,
      "SELECT * FROM deploy_previews WHERE school_id=? AND id=?",
      [ctx.principal.schoolId, id(b.previewId)],
    );
  check(
    p &&
      p.actor_id === ctx.principal.actorId &&
      p.version_id === b.versionId &&
      p.digest === b.digest &&
      p.expires_at > ctx.now,
    "Import preview is stale or belongs to another operation.",
    "PREVIEW_CONFLICT",
    409,
  );
  const loaded = await loadVersion(
      ctx.env.DB,
      ctx.principal.schoolId,
      b.versionId,
    ),
    input = JSON.parse(p.workbook),
    ref = await contacts(ctx);
  check(
    (await digest(ref.dependencies || [])) === input.dependencyDigest,
    "Contacts references changed after preview.",
    "PREVIEW_CONFLICT",
    409,
  );
  loaded.doc = mergeContacts(loaded.doc, ref);
  const validated = validateWorkbook(
    input.workbook,
    loaded.doc,
    ctx.principal.schoolId,
    loaded.version.revision,
    { matches: input.matches },
  );
  return save(ctx, {
    document: validated.document,
    preview: p,
    dependencies: ref.dependencies || [],
  });
}
function referenceVenues(document) {
  const used = new Set([
    ...document.classes.map((c) => c.venueId).filter(Boolean),
    ...document.groups.map((g) => g.venue).filter(Boolean),
    ...document.venues
      .filter((v) => v.form || v.forms?.length)
      .map((v) => v.id),
  ]);
  return [...used].sort().map((venueId) => {
    const venue = document.venues.find((v) => v.id === venueId);
    check(
      venue && venue.revision !== undefined && venue.revision !== null,
      "Refresh current venue metadata before publication.",
      "VENUE_REFERENCE_STALE",
      409,
    );
    return { venueId, revision: venue.revision };
  });
}
async function publicationById(ctx, publicationId) {
  const row = await one(
    ctx.env.DB,
    "SELECT * FROM deploy_publications WHERE school_id=? AND id=?",
    [ctx.principal.schoolId, id(publicationId)],
  );
  check(row, "Publication not found.", "NOT_FOUND", 404);
  check(
    ctx.env.ARTIFACTS,
    "Publication storage is not configured.",
    "CONFIGURATION_REQUIRED",
    503,
  );
  const object = await ctx.env.ARTIFACTS.get(row.payload_key);
  check(
    object,
    "Publication payload is unavailable.",
    "PAYLOAD_UNAVAILABLE",
    503,
  );
  check(
    object.size <= 8 * 1024 * 1024,
    "Publication payload exceeds bounds.",
    "PAYLOAD_TOO_LARGE",
    503,
  );
  const raw = await object.text();
  check(
    (await digest(raw)) === row.payload_digest,
    "Publication payload integrity failed.",
    "PAYLOAD_INTEGRITY",
    503,
  );
  const payload = JSON.parse(raw);
  return {
    schoolId: row.school_id,
    publicationId: row.id,
    sequence: row.sequence,
    workingRevision: row.working_revision,
    digest: row.payload_digest,
    publishedAt: row.published_at,
    year:
      payload.document.year ||
      Number((payload.document.from || "").slice(0, 4)) ||
      null,
    document: payload.document,
    envelope: { ...payload.envelope, payloadDigest: row.payload_digest },
  };
}
async function publish(ctx) {
  const op = await prepare(ctx, "deploy.publish");
  if (op.receipt)
    return {
      ...op.receipt.result,
      currentPointer: await one(
        ctx.env.DB,
        "SELECT sequence,publication_id AS publicationId FROM deploy_pointer WHERE school_id=?",
        [op.schoolId],
      ),
    };
  const b = ctx.body,
    school = op.schoolId,
    loaded = await loadVersion(ctx.env.DB, school, b.versionId),
    pointer = await one(
      ctx.env.DB,
      "SELECT * FROM deploy_pointer WHERE school_id=?",
      [school],
    );
  const expected = b.revision ?? b.expectedRevision;
  check(
    Number.isSafeInteger(expected) && expected === loaded.version.revision,
    "Saved working revision changed.",
    "REVISION_CONFLICT",
    409,
  );
  check(
    Number.isSafeInteger(b.expectedPointerSequence) &&
      b.expectedPointerSequence === (pointer?.sequence || 0),
    "Current publication changed.",
    "PUBLICATION_CONFLICT",
    409,
  );
  const lg = leaseGuard(ctx, b.scope || b.key || "meta");
  let prepared = await one(
    ctx.env.DB,
    "SELECT * FROM deploy_prepared_publications WHERE school_id=? AND operation_id=?",
    [school, op.operationId],
  );
  if (!prepared) {
    const ref = await contacts(ctx),
      document = mergeContacts(loaded.doc, ref),
      calculated = calculate(document, ref);
    validateDocument(document);
    check(
      Number.isInteger(document.year) &&
        document.year >= 2000 &&
        document.year <= 2099,
      "Set the planning year before publishing.",
      "PLANNING_YEAR_REQUIRED",
      409,
    );
    const publicationId =
        "pub-" +
        (await digest({ school, operationId: op.operationId }).then((s) =>
          s.slice(0, 24),
        )),
      sequence = (pointer?.sequence || 0) + 1;
    const envelope = {
      schemaVersion: 1,
      calculationVersion: calculated.calculationVersion,
      schoolId: school,
      publicationId,
      publicationSequence: sequence,
      workingRevision: expected,
      publishedAt: ctx.now,
      contacts: {
        revision: ref.revision,
        asOf: ref.asOf,
        observation: ref.observation || null,
      },
      settingsRevision: document.settingsRevision || 1,
      settingsDigest: await digest({
        offload: document.offload,
        relief: document.relief,
        loads: document.loads,
        workload: document.workload,
      }),
      subjectCategories: calculated.subjectCategories,
      sharedInputs: calculated.sharedInputs,
      rows: calculated.rows,
    };
    const payload = canonical({ schemaVersion: 1, document, envelope }),
      payloadDigest = await digest(payload),
      payloadKey = `deploy/${school}/${publicationId}/${payloadDigest}.json`;
    check(
      ctx.env.ARTIFACTS,
      "Private publication storage is not configured.",
      "CONFIGURATION_REQUIRED",
      503,
    );
    await ctx.env.ARTIFACTS.put(payloadKey, payload, {
      customMetadata: { sha256: payloadDigest, schoolId: school },
    });
    const verify = await ctx.env.ARTIFACTS.get(payloadKey);
    check(
      verify && (await digest(await verify.text())) === payloadDigest,
      "Publication payload could not be verified.",
      "PAYLOAD_INTEGRITY",
      503,
    );
    envelope.payloadDigest = payloadDigest;
    await statement(
      ctx.env.DB,
      "INSERT OR IGNORE INTO deploy_prepared_publications(school_id,operation_id,fence,payload_digest,payload_key,envelope,document,dependencies,contacts_evidence,publication_id,sequence,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        school,
        op.operationId,
        op.fence,
        payloadDigest,
        payloadKey,
        canonical(envelope),
        canonical(document),
        canonical(
          (ref.dependencies || []).map((d) => ({
            ...d,
            validUntil:
              Math.min(d.validUntil ?? Infinity, ref.validUntil ?? Infinity) ===
              Infinity
                ? null
                : Math.min(
                    d.validUntil ?? Infinity,
                    ref.validUntil ?? Infinity,
                  ),
          })),
        ),
        canonical({
          revision: ref.revision,
          asOf: ref.asOf,
          observation: ref.observation || null,
        }),
        publicationId,
        sequence,
        ctx.now,
      ],
    ).run();
    prepared = await one(
      ctx.env.DB,
      "SELECT * FROM deploy_prepared_publications WHERE school_id=? AND operation_id=?",
      [school, op.operationId],
    );
  }
  check(
    prepared.fence === op.fence &&
      prepared.sequence === (pointer?.sequence || 0) + 1,
    "Prepared publication is superseded.",
    "PUBLICATION_CONFLICT",
    409,
  );
  const doc = JSON.parse(prepared.document),
    envelope = JSON.parse(prepared.envelope),
    dependencies = JSON.parse(prepared.dependencies);
  let venueFence;
  check(
    ctx.env.VENUES,
    "Venues publication fence is not configured.",
    "CONFIGURATION_REQUIRED",
    503,
  );
  venueFence = await serviceCall(ctx.env, "venues", "/internal/source-begin", {
    operationId: `${op.operationId}.venues.begin`,
    schoolId: school,
    decisionId: ctx.principal.decisionId,
    sourceDomain: "deploy",
    sourceOperationId: op.operationId,
    sourceDigest: op.digest,
    sourceFence: op.fence,
    scopes: doc.occupancies || [],
    expectedOccupancyRevision: b.expectedOccupancyRevision ?? 0,
  });
  check(
    venueFence &&
      (venueFence.state === "committed" ||
        venueFence.fenceId ||
        venueFence.sourceFence ||
        venueFence.saved),
    "Venue publication fence was not confirmed.",
    "VENUE_FENCE_PENDING",
    503,
  );
  const guards = [
    scopeGuard(school, b.versionId, expected),
    lg,
    pointer
      ? {
          sql: "SELECT EXISTS(SELECT 1 FROM deploy_pointer WHERE school_id=? AND sequence=? AND publication_id=?) AS ok",
          args: [school, pointer.sequence, pointer.publication_id],
        }
      : {
          sql: "SELECT NOT EXISTS(SELECT 1 FROM deploy_pointer WHERE school_id=?) AS ok",
          args: [school],
        },
  ];
  // Admission-owner pin guards are added through the shared source-change helper below.
  let held = await queueSourceChange(
    ctx.env.DB,
    school,
    "publication",
    op.operationId,
    ctx.now,
    "deploy",
  );
  if (held.length) {
    await requestSourceCancellations(ctx.env, held);
    held = await queueSourceChange(
      ctx.env.DB,
      school,
      "publication",
      op.operationId,
      ctx.now,
      "deploy",
    );
  }
  check(
    !held.length,
    "A protected operation is using the current publication; resolve its receipt before this publication can commit.",
    "SOURCE_CHANGE_PENDING",
    409,
  );
  guards.push(
    sourceChangeGuard(school, "publication", op.operationId, "deploy"),
  );
  const result = {
    saved: true,
    state: "committed",
    versionId: b.versionId,
    requestId: b.requestId || op.operationId,
    publicationId: prepared.publication_id,
    sequence: prepared.sequence,
    workingRevision: expected,
    contactsSync: {
      status: "pending",
      publicationCommit: prepared.publication_id,
    },
    deliveries: {
      contacts: "pending",
      roster: "pending",
      venues: "pending",
      layout: "pending",
    },
  };
  const writes = [
    sourceChangeDone(school, "publication", op.operationId),
    {
      sql: "INSERT INTO deploy_publications(school_id,id,sequence,version_id,working_revision,operation_id,payload_digest,payload_key,envelope,published_at,decision_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        school,
        prepared.publication_id,
        prepared.sequence,
        b.versionId,
        expected,
        op.operationId,
        prepared.payload_digest,
        prepared.payload_key,
        prepared.envelope,
        ctx.now,
        ctx.principal.decisionId,
      ],
    },
    {
      sql: "INSERT INTO deploy_pointer(school_id,sequence,publication_id,revision) VALUES(?,?,?,?) ON CONFLICT(school_id) DO UPDATE SET sequence=excluded.sequence,publication_id=excluded.publication_id,revision=excluded.revision",
      args: [
        school,
        prepared.sequence,
        prepared.publication_id,
        String(prepared.sequence),
      ],
    },
    expiredLeaseWrite(ctx, b.scope || b.key || "meta"),
  ];
  const outbox = [];
  const contributionCount = contributions(
    doc,
    prepared.publication_id,
    op.operationId,
    op.actorId,
  ).length;
  for (const recipient of ["contacts", "roster", "venues", "layout"]) {
    writes.push({
      sql: "INSERT INTO deploy_deliveries(school_id,publication_id,recipient,state) VALUES(?,?,?,'pending')",
      args: [school, prepared.publication_id, recipient],
    });
    for (
      let chunk = 0;
      chunk <
      (recipient === "contacts"
        ? Math.max(1, Math.ceil(contributionCount / 64))
        : 1);
      chunk++
    )
      outbox.push({
        id:
          `${prepared.publication_id}.${recipient}` +
          (recipient === "contacts" ? `.${chunk}` : ""),
        type: `deploy.${recipient}`,
        payload: {
          schoolId: school,
          publicationId: prepared.publication_id,
          operationId: op.operationId,
          decisionId: ctx.principal.decisionId,
          sourceDigest: op.digest,
          sourceFence: op.fence,
          recipient,
          sequence: prepared.sequence,
          ...(recipient === "contacts"
            ? { offset: chunk * 64, limit: 64 }
            : {}),
        },
        dueAt: ctx.now,
      });
  }
  outbox.push({
    id: `${prepared.publication_id}.drive-export`,
    type: "deploy.drive-export",
    payload: { schoolId: school, publicationId: prepared.publication_id },
    dueAt: ctx.now,
  });
  return finish(ctx, op, writes, guards, result, {
    dependencies,
    outbox,
    audit: {
      versionId: b.versionId,
      publicationId: prepared.publication_id,
      sequence: prepared.sequence,
      payloadDigest: prepared.payload_digest,
    },
  });
}
export async function handle(ctx) {
  ctx.body = plain(ctx.body || {});
  const p = ctx.path,
    b = ctx.body,
    school = ctx.principal.schoolId;
  check(
    ctx.principal && school,
    "Authentication is required.",
    "SESSION_INVALID",
    401,
  );
  if (p.startsWith("/internal/pins/")) {
    await requireMembership(ctx.env, ctx.request);
    if (p.endsWith("/acquire")) {
      check(b.scope === "publication", "Unknown publication pin scope.");
      return acquireSourcePin(
        ctx.env,
        b,
        {
          sql: "EXISTS(SELECT 1 FROM deploy_pointer WHERE school_id=? AND revision=?)",
          args: [school, String(b.revision)],
        },
        ctx.now,
      );
    }
    if (p.endsWith("/release")) return releaseSourcePin(ctx.env, b, ctx.now);
    check(false, "Unknown pin operation.", "NOT_FOUND", 404);
  }
  if (["/bootstrap", "/sync", "/versions", "/tables", "/access"].includes(p))
    return bootstrap(ctx);
  if (p === "/delta")
    return {
      resync: true,
      reason: "Load the current revision and reference evidence.",
    };
  if (p === "/exports/reconcile") {
    check(
      can(ctx.principal, "admin") && !ctx.principal.impersonating,
      "Administrator access is required.",
      "CAPABILITY_DENIED",
      403,
    );
    const op = await prepare(ctx, "deploy.edit");
    if (op.receipt) return op.receipt.result;
    const result = await reconcileDrive(ctx.env, id(b.publicationId));
    if (result.state !== "delivered") return result;
    return finish(
      ctx,
      op,
      [
        {
          sql: "UPDATE deploy_exports SET state='delivered',last_error=NULL,updated_at=? WHERE school_id=? AND publication_id=?",
          args: [ctx.now, school, b.publicationId],
        },
        {
          sql: "UPDATE product_outbox SET state='delivered',provider_id=?,last_code=NULL,updated_at=? WHERE school_id=? AND job_id=? AND state IN('uncertain','failed','queued')",
          args: [
            result.fileId,
            ctx.now,
            school,
            `${b.publicationId}.drive-export`,
          ],
        },
      ],
      [
        {
          sql: "SELECT EXISTS(SELECT 1 FROM deploy_exports WHERE school_id=? AND publication_id=? AND file_id=? AND content_digest=?) AS ok",
          args: [school, b.publicationId, result.fileId, result.contentDigest],
        },
      ],
      result,
      { audit: { publicationId: b.publicationId, exportReconciled: true } },
    );
  }
  if (p === "/health") {
    check(
      can(ctx.principal, "admin"),
      "Health is administrator scoped.",
      "CAPABILITY_DENIED",
      403,
    );
    return {
      service: "deploy",
      schemaVersion: 1,
      pending: (
        await one(
          ctx.env.DB,
          "SELECT COUNT(*) AS n FROM product_operations WHERE school_id=? AND state='prepared'",
          [school],
        )
      ).n,
      uncertainDeliveries: (
        await one(
          ctx.env.DB,
          "SELECT COUNT(*) AS n FROM deploy_deliveries WHERE school_id=? AND state<>'applied'",
          [school],
        )
      ).n,
    };
  }
  if (p === "/acknowledgeNotices") {
    const op = await prepare(ctx);
    if (op.receipt) return op.receipt.result;
    const ids = b.eventIds;
    check(Array.isArray(ids) && ids.length <= 100, "Invalid notice list.");
    const writes = ids.map((value) => ({
      sql: "UPDATE deploy_notices SET acknowledged_at=? WHERE school_id=? AND version_id=? AND id=? AND (actor_id IS NULL OR actor_id=?)",
      args: [
        ctx.now,
        school,
        id(b.versionId),
        id(value),
        ctx.principal.actorId,
      ],
    }));
    return finish(
      ctx,
      op,
      writes,
      [],
      { acknowledged: true, eventIds: ids },
      { audit: { versionId: b.versionId, noticeIds: ids } },
    );
  }
  if (p === "/staff/register") {
    check(
      !ctx.principal.impersonating && can(ctx.principal, "deploy.edit"),
      "Registration is not permitted.",
      "CAPABILITY_DENIED",
      403,
    );
    return serviceCall(ctx.env, "contacts", "/internal/register-provisional", {
      schoolId: school,
      decisionId: ctx.principal.decisionId,
      operationId: id(b.operationId || b.requestId),
      basicName: text(b.basicName),
      ...(b.nameSuffix !== undefined
        ? { nameSuffix: text(b.nameSuffix, 80, true) }
        : {}),
      ...(b.tags !== undefined ? { tags: b.tags } : {}),
      ...(b.existingStaffId ? { existingStaffId: id(b.existingStaffId) } : {}),
    });
  }
  if (
    p === "/versions/create" ||
    (p === "/change" &&
      ["create", "createVersion", "clone"].includes(b.operation))
  )
    return create(ctx);
  if (p === "/lease") return lease(ctx);
  if (p === "/imports/preview") return previewImport(ctx);
  if (p === "/imports/apply") return applyImport(ctx);
  if (p === "/export") {
    const { doc, version } = await loadVersion(ctx.env.DB, school, b.versionId);
    return exportWorkbook(
      mergeContacts(doc, await contacts(ctx)),
      b.scope,
      school,
      version.revision,
      { visible: !!b.visible, staffIds: b.staffIds || null },
    );
  }
  if (p === "/publishReview") {
    const { doc, version } = await loadVersion(ctx.env.DB, school, b.versionId);
    const ref = await contacts(ctx),
      calculation = calculate(doc, ref);
    const pointer = await one(
      ctx.env.DB,
      "SELECT * FROM deploy_pointer WHERE school_id=?",
      [school],
    );
    return {
      versionId: b.versionId,
      workingRevision: version.revision,
      expectedPointerSequence: pointer?.sequence || 0,
      changes: Object.entries(doc.teacherDrafts || {}).flatMap(
        ([staffId, fields]) =>
          Object.entries(fields).map(([field, value]) => ({
            staffId,
            field,
            value,
            status: "pending proposal",
          })),
      ),
      fields: PROPOSABLE,
      quality: calculation.rows.map((r) => ({
        staffId: r.staffId,
        quality: r.quality,
        reasons: r.reasons,
      })),
      message:
        "Publish the saved revision. Contacts contributions and downstream deliveries have independent outcomes.",
    };
  }
  if (p === "/publish" || (p === "/change" && b.operation === "publish"))
    return publish(ctx);
  if (p === "/versionNote") {
    const { doc } = await loadVersion(ctx.env.DB, school, b.versionId);
    return { versionId: doc.id, notes: doc.notes || "" };
  }
  if (p === "/current-publication" || p === "/internal/publication/current") {
    const pointer = await one(
      ctx.env.DB,
      "SELECT * FROM deploy_pointer WHERE school_id=?",
      [school],
    );
    check(
      pointer,
      "No publication is in force.",
      "PUBLICATION_UNAVAILABLE",
      503,
    );
    const publication = await publicationById(ctx, pointer.publication_id),
      operation = await one(
        ctx.env.DB,
        "SELECT operation_id FROM deploy_publications WHERE school_id=? AND id=?",
        [school, pointer.publication_id],
      ),
      op = await operationStatus(ctx.env.DB, school, operation.operation_id);
    return {
      ...publication,
      ...publication.envelope,
      rows: publication.envelope.rows.map((r) => ({
        ...r,
        weightedWi: r.Wi,
        budget: r.weeklyBudget,
        periodCap: r.cap,
        actualWorkload: r.actualCapCountedWorkload,
      })),
      sourceDomain: "deploy",
      revision: pointer.revision,
      operationId: operation.operation_id,
      digest: op.digest,
      payloadDigest: publication.digest,
      projection: {
        kind: "planning-reference",
        referenceVenues: referenceVenues(publication.document),
        occupancies: publication.document.occupancies || [],
        coverage: publication.document.occupancyCoverage || null,
      },
      dependencies: [
        {
          owner: "deploy",
          scope: "publication",
          revision: pointer.revision,
          validUntil: ctx.principal.validUntil,
        },
      ],
      current: true,
    };
  }
  if (p === "/publications/history") {
    const before =
      b.cursor === undefined
        ? Number.MAX_SAFE_INTEGER
        : finite(Number(b.cursor), 1, Number.MAX_SAFE_INTEGER);
    const rows = await query(
      ctx.env.DB,
      "SELECT id AS publicationId,version_id AS versionId,working_revision AS workingRevision,sequence,published_at AS publishedAt FROM deploy_publications WHERE school_id=? AND sequence<? ORDER BY sequence DESC LIMIT 40",
      [school, before],
    );
    const current = await one(
      ctx.env.DB,
      "SELECT publication_id AS publicationId,sequence FROM deploy_pointer WHERE school_id=?",
      [school],
    );
    return {
      publications: rows,
      current,
      cursor: rows.length === 40 ? rows.at(-1).sequence : null,
    };
  }
  if (p === "/internal/publication" || p === "/publications") {
    if (b.publicationId) return publicationById(ctx, b.publicationId);
    const pointer = await one(
      ctx.env.DB,
      "SELECT * FROM deploy_pointer WHERE school_id=?",
      [school],
    );
    check(
      pointer,
      "No publication is in force.",
      "PUBLICATION_UNAVAILABLE",
      503,
    );
    return publicationById(ctx, pointer.publication_id);
  }
  if (
    p === "/receipt" ||
    p === "/publication-status" ||
    p === "/internal/publication-status"
  ) {
    const operationId = id(b.operationId || b.requestId);
    const op = await operationStatus(ctx.env.DB, school, operationId);
    if (!op)
      return {
        state: "unknown",
        saved: false,
        operationId,
        reason:
          "No durable result found; absence does not prove a writer cannot commit.",
      };
    check(
      op.actorId === ctx.principal.actorId || can(ctx.principal, "admin"),
      "Receipt belongs to another actor.",
      "CAPABILITY_DENIED",
      403,
    );
    const current = await one(
      ctx.env.DB,
      "SELECT sequence,publication_id AS publicationId FROM deploy_pointer WHERE school_id=?",
      [school],
    );
    if (p === "/publication-status" || p === "/internal/publication-status") {
      const pub = await one(
        ctx.env.DB,
        "SELECT * FROM deploy_publications WHERE school_id=? AND operation_id=?",
        [school, operationId],
      );
      const prepared = pub
        ? null
        : await one(
            ctx.env.DB,
            "SELECT * FROM deploy_prepared_publications WHERE school_id=? AND operation_id=?",
            [school, operationId],
          );
      const payload = pub
        ? await publicationById(ctx, pub.id)
        : prepared
          ? { document: JSON.parse(prepared.document) }
          : null;
      return {
        state: op.state,
        schoolId: school,
        actorId: op.actorId,
        operationId,
        fence: op.fence,
        digest: op.digest,
        requestDigest: op.requestDigest,
        authorityAction: op.authorityAction,
        decisionId: op.decisionId,
        publicationId: pub?.id || prepared?.publication_id || null,
        sequence: pub?.sequence || prepared?.sequence || null,
        contributions: payload
          ? contributions(
              payload.document,
              pub?.id || prepared?.publication_id,
              operationId,
              op.actorId,
            )
          : [],
        projection: payload
          ? {
              source: "deploy",
              kind: "planning-reference",
              publicationId: pub?.id || prepared?.publication_id,
              revision: pub?.sequence || prepared?.sequence,
              referenceVenues: referenceVenues(payload.document),
              occupancies: payload.document.occupancies || [],
              coverage: payload.document.occupancyCoverage || null,
            }
          : null,
        currentPointer: current,
      };
    }
    return {
      state: op.state,
      ...op.receipt?.result,
      saved: op.state === "committed",
      receipt: op.receipt,
      operationId,
      currentPointer: current,
    };
  }
  if (p === "/auditPage") {
    check(
      can(ctx.principal, "admin"),
      "Audit is administrator scoped.",
      "CAPABILITY_DENIED",
      403,
    );
    const archive = await one(
      ctx.env.DB,
      "SELECT hidden_before FROM deploy_audit_display WHERE school_id=? AND actor_id=?",
      [school, ctx.principal.actorId],
    );
    let at = Number.MAX_SAFE_INTEGER,
      event = "";
    if (b.cursor) {
      const parts = String(b.cursor).split("|");
      at = finite(Number(parts[0]), 0, Number.MAX_SAFE_INTEGER);
      event = parts.slice(1).join("|");
    }
    const rows = await query(
      ctx.env.DB,
      "SELECT event_id AS id,actor_id AS actor,action,recorded_at AS at,details_json AS details FROM product_audit WHERE school_id=? AND (recorded_at<? OR (recorded_at=? AND event_id<?)) AND recorded_at>=? ORDER BY recorded_at DESC,event_id DESC LIMIT 40",
      [
        school,
        at,
        at,
        event,
        b.includeArchived ? 0 : archive?.hidden_before || 0,
      ],
    );
    return {
      events: rows.map((r) => ({ ...r, details: JSON.parse(r.details) })),
      cursor: rows.length === 40 ? rows.at(-1).at + "|" + rows.at(-1).id : null,
    };
  }

  if (p === "/change") {
    if (b.operation === "purge") {
      check(
        can(ctx.principal, "admin"),
        "Audit display is administrator scoped.",
        "CAPABILITY_DENIED",
        403,
      );
      const op = await prepare(ctx);
      if (op.receipt) return op.receipt.result;
      return finish(
        ctx,
        op,
        [
          {
            sql: "INSERT INTO deploy_audit_display(school_id,actor_id,hidden_before) VALUES(?,?,?) ON CONFLICT(school_id,actor_id) DO UPDATE SET hidden_before=excluded.hidden_before",
            args: [school, ctx.principal.actorId, ctx.now],
          },
        ],
        [],
        {
          saved: true,
          archived: true,
          evidenceRetained: true,
          requestId: b.requestId || op.operationId,
        },
        { audit: { displayArchivedBefore: ctx.now, evidenceRetained: true } },
      );
    }
    if (b.operation === "retryContactsSync") {
      const op = await prepare(ctx, "deploy.publish");
      if (op.receipt) return op.receipt.result;
      const publicationId = id(b.publicationCommit),
        pub = await one(
          ctx.env.DB,
          "SELECT * FROM deploy_publications WHERE school_id=? AND id=? AND version_id=?",
          [school, publicationId, id(b.versionId)],
        );
      check(pub, "Original publication was not found.", "NOT_FOUND", 404);
      const delivery = await one(
        ctx.env.DB,
        "SELECT * FROM deploy_deliveries WHERE school_id=? AND publication_id=? AND recipient=?",
        [school, publicationId, "contacts"],
      );
      const applied = delivery?.state === "applied";
      return finish(
        ctx,
        op,
        applied
          ? []
          : [
              {
                sql: "UPDATE product_outbox SET state='queued',due_at=?,attempts=0,last_code=NULL WHERE school_id=? AND job_id LIKE ? AND state IN('failed','uncertain','queued')",
                args: [ctx.now, school, publicationId + ".contacts.%"],
              },
            ],
        [],
        {
          saved: true,
          versionId: pub.version_id,
          publicationId,
          contactsSync: {
            status: applied ? "updated" : "pending",
            publicationCommit: publicationId,
            reason: applied
              ? "Contributions received; acceptance remains Contacts-owned."
              : "Retry queued against the original immutable publication.",
          },
        },
        { audit: { publicationId, deliveryRetry: "contacts" } },
      );
    }
    if (b.operation === "refreshVenueRegistry") {
      const ref = await serviceCall(ctx.env, "venues", "/internal/catalogue", {
        schoolId: school,
        decisionId: ctx.principal.decisionId,
        purpose: "deploy",
      });
      check(
        Array.isArray(ref.venues),
        "Venue catalogue unavailable.",
        "SOURCE_UNAVAILABLE",
        503,
      );
      const loaded = await loadVersion(ctx.env.DB, school, b.versionId),
        next = {
          ...loaded.doc,
          venues: ref.venues.map((v) => ({
            id: id(v.id || v.venueId),
            name: text(v.name),
            unit: v.unit || "",
            shortName: v.shortName || "",
            revision: v.revision,
          })),
          venueCatalogue: { revision: ref.revision || null, asOf: ref.asOf },
        };
      validateDocument(next);
      return save(ctx, { document: next });
    }
    if (b.operation === "acceptContacts") {
      const op = await prepare(ctx);
      if (op.receipt) return op.receipt.result;
      const loaded = await loadVersion(ctx.env.DB, school, b.versionId),
        ref = await contacts(ctx),
        next = mergeContacts(loaded.doc, ref);
      let delta;
      try {
        delta = changesFor(school, b.versionId, loaded.rows, next);
      } catch (error) {
        if (error.code !== "EDIT_BOUNDS") throw error;
        const outcome = await abortOperation(
          ctx.env.DB,
          op,
          error.code,
          ctx.now,
        );
        if (outcome?.state === "committed") return outcome.result;
        throw error;
      }
      return finish(
        ctx,
        op,
        [
          ...delta.writes,
          {
            sql: "UPDATE deploy_versions SET revision=revision+1 WHERE school_id=? AND id=?",
            args: [school, b.versionId],
          },
          expiredLeaseWrite(ctx, b.scope || b.key || "meta"),
        ],
        [...delta.guards, leaseGuard(ctx, b.scope || b.key || "meta")],
        {
          saved: true,
          versionId: b.versionId,
          requestId: b.requestId || op.operationId,
        },
        {
          dependencies: ref.dependencies || [],
          audit: { versionId: b.versionId, contactsRevision: ref.revision },
        },
      );
    }
    if (b.operation === "delete") {
      const op = await prepare(ctx);
      if (op.receipt) return op.receipt.result;
      const loaded = await loadVersion(ctx.env.DB, school, b.versionId);
      return finish(
        ctx,
        op,
        [
          {
            sql: "UPDATE deploy_versions SET deleted=1,revision=revision+1 WHERE school_id=? AND id=?",
            args: [school, b.versionId],
          },
        ],
        [
          scopeGuard(
            school,
            b.versionId,
            b.revision ?? b.expectedRevision ?? loaded.version.revision,
          ),
          {
            sql: "SELECT NOT EXISTS(SELECT 1 FROM deploy_publications WHERE school_id=? AND version_id=?) AS ok",
            args: [school, b.versionId],
          },
          leaseGuard(ctx, b.scope || b.key || "meta"),
        ],
        {
          saved: true,
          versionId: b.versionId,
          requestId: b.requestId || op.operationId,
        },
        { audit: { versionId: b.versionId, deleted: true } },
      );
    }
    return save(ctx);
  }
  check(false, "Unsupported Deploy operation.", "NOT_FOUND", 404);
}

export async function internal(ctx) {
  await requireMembership(ctx.env, ctx.request);
  const b = ctx.body,
    school = ctx.env.SCHOOL_ID;
  check(b.schoolId === school, "Foreign school.", "SCHOOL_MISMATCH", 403);
  if (ctx.path === "/internal/pins/acquire") {
    check(b.scope === "publication", "Invalid publication pin scope.");
    return acquireSourcePin(
      ctx.env,
      b,
      {
        sql: "EXISTS(SELECT 1 FROM deploy_pointer WHERE school_id=? AND revision=?)",
        args: [school, String(b.revision)],
      },
      ctx.now,
    );
  }
  if (ctx.path === "/internal/pins/release")
    return releaseSourcePin(ctx.env, b, ctx.now);
  if (ctx.path === "/internal/publication/verify") return verifyDelivery(ctx);
  check(
    [
      "/internal/publication",
      "/internal/publication/current",
      "/internal/publication-status",
    ].includes(ctx.path),
    "Unknown internal Deploy operation.",
    "NOT_FOUND",
    404,
  );
  const historical =
    ctx.path === "/internal/publication-status" ||
    b.purpose === "layout.delivery";
  const decision = await inspectDecision(ctx.env, b.decisionId, {
    schoolId: school,
    allowHistorical: historical,
  });
  const allowed =
    (decision.descriptor.service === "deploy" &&
      decision.descriptor.action === "deploy.publish") ||
    (["roster", "layout", "venues"].includes(decision.descriptor.service) &&
      decision.descriptor.action.startsWith(decision.descriptor.service + "."));
  check(
    allowed,
    "This decision cannot consume a Deploy publication.",
    "SERVICE_DENIED",
    403,
  );
  const value = await handle({ ...ctx, principal: decision.principal });
  if (
    (decision.descriptor.service === "layout" ||
      b.purpose === "layout.delivery") &&
    value.document
  ) {
    value.document = {
      id: value.document.id,
      name: value.document.name,
      year: value.document.year,
      from: value.document.from,
      to: value.document.to,
      classes: value.document.classes,
      groups: value.document.groups,
      assignments: value.document.assignments,
      venues: value.document.venues,
      teachers: value.document.teachers.map((t) => ({
        id: t.id,
        name: t.ttbName || t.name,
      })),
      layout: value.document.layout,
      unitGeometry: value.document.unitGeometry || {},
    };
    delete value.envelope;
  }
  return value;
}

function contributions(doc, publicationId, operationId, actorId) {
  const fields = {
    "Basic Name": "basicName",
    Role: "role",
    "Appointment Status": "appointmentStatus",
    "Employment Modifier": "employmentTags",
    "Subject Modifier": "subjectTags",
    Active: "employmentActive",
  };
  return Object.entries(doc.teacherDrafts || {}).flatMap(([staffId, values]) =>
    Object.entries(values)
      .filter(([field]) => Object.hasOwn(fields, field))
      .map(([field, value]) => ({
        staffId,
        field: fields[field],
        proposedValue:
          field === "Active" ? value === true || value === "Y" : value,
        acceptedBaseFieldRevision:
          doc.teachers.find((t) => t.id === staffId)?.fieldRevisions?.[
            fields[field]
          ] ?? 0,
        validFrom: doc.from ? Date.parse(doc.from + "T00:00:00+08:00") : null,
        sourcePublicationId: publicationId,
        sourceOperationId: operationId,
        originalActorId: actorId,
      })),
  );
}
async function verifyDelivery(ctx) {
  const b = ctx.body,
    school = ctx.env.SCHOOL_ID,
    op = await operationStatus(
      ctx.env.DB,
      school,
      id(b.sourceOperationId || b.operationId),
    );
  check(
    op?.state === "committed" &&
      op.action === "deploy.publish" &&
      op.digest === b.sourceDigest &&
      op.fence === b.sourceFence,
    "Immutable publication receipt does not match the delivery.",
    "SOURCE_RECEIPT_INVALID",
    409,
  );
  const pub = await one(
    ctx.env.DB,
    "SELECT * FROM deploy_publications WHERE school_id=? AND operation_id=?",
    [school, op.operationId],
  );
  check(
    pub && pub.id === b.publicationId,
    "Publication identity does not match.",
    "SOURCE_RECEIPT_INVALID",
    409,
  );
  const view = await publicationById(
      { ...ctx, principal: { schoolId: school } },
      pub.id,
    ),
    pointer = await one(
      ctx.env.DB,
      "SELECT * FROM deploy_pointer WHERE school_id=?",
      [school],
    );
  return {
    schoolId: school,
    publicationId: pub.id,
    sourceOperationId: op.operationId,
    sourceDigest: op.digest,
    sourceFence: op.fence,
    decisionId: pub.decision_id,
    state: "committed",
    sequence: pub.sequence,
    ...view.envelope,
    payloadDigest: view.digest,
    currentPublicationId: pointer?.publication_id || null,
    currentSequence: pointer?.sequence || 0,
    current: pub.id === pointer?.publication_id,
    rows: view.envelope.rows.map((r) => ({
      ...r,
      weightedWi: r.Wi,
      budget: r.weeklyBudget,
      periodCap: r.cap,
      actualWorkload: r.actualCapCountedWorkload,
    })),
    contributions: contributions(
      view.document,
      pub.id,
      op.operationId,
      op.actorId,
    ),
    projection: {
      source: "deploy",
      kind: "planning-reference",
      publicationId: pub.id,
      revision: pub.sequence,
      referenceVenues: referenceVenues(view.document),
      occupancies: view.document.occupancies || [],
      coverage: view.document.occupancyCoverage || null,
    },
    layout: {
      id: view.document.id,
      name: view.document.name,
      from: view.document.from,
      to: view.document.to,
      year: view.year,
      classes: view.document.classes,
      groups: view.document.groups,
      assignments: view.document.assignments,
      venues: view.document.venues,
      teachers: view.document.teachers.map((t) => ({
        id: t.id,
        name: t.ttbName || t.name,
      })),
      layout: view.document.layout,
      unitGeometry: view.document.unitGeometry || {},
    },
  };
}
export async function recoverOperations(env, now = Date.now()) {
  const expired = await query(
    env.DB,
    "SELECT operation_id FROM product_operations WHERE school_id=? AND state='prepared' AND valid_until<=? ORDER BY valid_until LIMIT 32",
    [env.SCHOOL_ID, now],
  );
  for (const row of expired) {
    const op = await operationStatus(env.DB, env.SCHOOL_ID, row.operation_id);
    if (op?.state === "prepared")
      await abortOperation(env.DB, op, "AUTHORITY_EXPIRED", now);
  }
  const pending = await query(
    env.DB,
    "SELECT a.operation_id FROM product_admissions a JOIN product_operations o USING(school_id,operation_id) WHERE a.school_id=? AND a.state<>'resolved' AND o.state IN('committed','aborted') LIMIT 32",
    [env.SCHOOL_ID],
  );
  for (const row of pending) {
    const op = await operationStatus(env.DB, env.SCHOOL_ID, row.operation_id);
    await resolveAdmission(env, env.DB, op, null, op.receipt, now);
  }
  const fences = await query(
    env.DB,
    "SELECT p.operation_id,p.fence FROM deploy_prepared_publications p JOIN product_operations o USING(school_id,operation_id) WHERE p.school_id=? AND o.state='aborted' AND NOT EXISTS(SELECT 1 FROM deploy_venue_recovery r WHERE r.school_id=p.school_id AND r.operation_id=p.operation_id) LIMIT 16",
    [env.SCHOOL_ID],
  );
  for (const row of fences) {
    const op = await operationStatus(env.DB, env.SCHOOL_ID, row.operation_id);
    try {
      const result = await serviceCall(
        env,
        "venues",
        "/internal/source-complete",
        {
          schoolId: env.SCHOOL_ID,
          decisionId: op.decisionId,
          operationId: row.operation_id + ".venues.complete",
          sourceDomain: "deploy",
          sourceOperationId: row.operation_id,
          sourceDigest: op.digest,
          sourceFence: row.fence,
        },
      );
      if (result?.state === "aborted")
        await statement(
          env.DB,
          "INSERT OR IGNORE INTO deploy_venue_recovery(school_id,operation_id,resolved_at) VALUES(?,?,?)",
          [env.SCHOOL_ID, row.operation_id, now],
        ).run();
    } catch {
      /* An unavailable owner leaves a visible pending recovery; expiry alone is never success. */
    }
  }
  return {
    expired: expired.length,
    resolving: pending.length,
    venueRecovery: fences.length,
  };
}
export async function scheduled({ env, now = Date.now() }) {
  await recoverOperations(env, now);

  const handlers = Object.fromEntries(
    ["contacts", "roster", "venues", "layout"].map((recipient) => [
      `deploy.${recipient}`,
      async (job) => {
        const p = job.payload,
          pub = await one(
            env.DB,
            "SELECT * FROM deploy_publications WHERE school_id=? AND id=?",
            [env.SCHOOL_ID, p.publicationId],
          );
        if (!pub)
          return {
            state: "failed",
            code: "PUBLICATION_MISSING",
            retryable: false,
          };
        const op = await operationStatus(
          env.DB,
          env.SCHOOL_ID,
          pub.operation_id,
        );
        if (op?.state !== "committed")
          return {
            state: "failed",
            code: "RECEIPT_UNCONFIRMED",
            retryable: true,
          };
        const proof = {
          schoolId: env.SCHOOL_ID,
          publicationId: pub.id,
          sourceOperationId: op.operationId,
          sourceDigest: op.digest,
          sourceFence: op.fence,
          decisionId: pub.decision_id,
          operationId: job.job_id,
        };
        let input = { ...proof };
        let path = "/internal/adopt-publication";
        if (recipient === "contacts") {
          path = "/internal/contributions";
          const verified = await verifyDelivery({ env, body: proof, now });
          input.offset = p.offset ?? 0;
          input.limit = p.limit ?? 64;
          input.contributions = verified.contributions.slice(
            input.offset,
            input.offset + input.limit,
          );
        }
        if (recipient === "venues") {
          path = "/internal/source-complete";
          input = {
            ...proof,
            operationId: `${op.operationId}.venues.complete`,
            sourceDomain: "deploy",
          };
        }
        try {
          const result = await serviceCall(env, recipient, path, input);
          check(
            (result &&
              [
                "adopted",
                "ignored",
                "committed",
                "pending",
                "applied",
                "aborted",
              ].includes(result.state)) ||
              result?.saved === true ||
              Array.isArray(result?.contributions),
            "Recipient acknowledgement is missing.",
            "DELIVERY_UNCONFIRMED",
            503,
          );
          await statement(
            env.DB,
            "UPDATE deploy_deliveries SET state=?,attempts=attempts+1,last_error=NULL,acknowledgement=? WHERE school_id=? AND publication_id=? AND recipient=?",
            [
              recipient === "contacts" ? "pending" : "applied",
              canonical(result),
              env.SCHOOL_ID,
              pub.id,
              recipient,
            ],
          ).run();
          return { state: "delivered", providerId: pub.id };
        } catch (error) {
          await statement(
            env.DB,
            "UPDATE deploy_deliveries SET state='pending',attempts=attempts+1,last_error=? WHERE school_id=? AND publication_id=? AND recipient=?",
            [
              error.code || "DELIVERY_UNCONFIRMED",
              env.SCHOOL_ID,
              pub.id,
              recipient,
            ],
          ).run();
          return {
            state: "failed",
            code: error.code || "DELIVERY_UNCONFIRMED",
            retryable: true,
          };
        }
      },
    ]),
  );
  // Internal deliveries are idempotent by immutable publication; uncertain attempts may be reconciled by the original recipient identity.
  await statement(
    env.DB,
    "UPDATE product_outbox SET state='queued',due_at=? WHERE school_id=? AND type IN('deploy.contacts','deploy.roster','deploy.venues','deploy.layout') AND state='uncertain' AND attempts<8",
    [now, env.SCHOOL_ID],
  ).run();
  handlers["deploy.drive-export"] = async (job, dispatchEnv) => {
    const publication = await publicationById(
      { env, principal: { schoolId: env.SCHOOL_ID } },
      job.payload.publicationId,
    );
    return exportDrive(dispatchEnv ?? env, job, publication, Date.now());
  };
  const results = await drainOutbox(env.DB, env, {
    schoolId: env.SCHOOL_ID,
    handlers,
    now,
    limit: 8,
  });
  await statement(
    env.DB,
    "UPDATE deploy_deliveries SET state='applied',last_error=NULL WHERE school_id=? AND recipient='contacts' AND EXISTS(SELECT 1 FROM product_outbox j WHERE j.school_id=deploy_deliveries.school_id AND j.job_id LIKE deploy_deliveries.publication_id||'.contacts.%') AND NOT EXISTS(SELECT 1 FROM product_outbox j WHERE j.school_id=deploy_deliveries.school_id AND j.job_id LIKE deploy_deliveries.publication_id||'.contacts.%' AND j.state<>'delivered')",
    [env.SCHOOL_ID],
  ).run();
  await statement(
    env.DB,
    "UPDATE source_changes SET state='aborted' WHERE school_id=? AND state='pending' AND EXISTS(SELECT 1 FROM product_operations o WHERE o.school_id=source_changes.school_id AND o.operation_id=source_changes.operation_id AND o.state='aborted')",
    [env.SCHOOL_ID],
  ).run();
  return results;
}

/** Named binding granted only to Contacts; caller performs current Contacts-reader authorization. */
export async function readContactsDeployment(env, input, now = Date.now()) {
  check(
    input?.schoolId === env.SCHOOL_ID,
    "Foreign school.",
    "SCHOOL_MISMATCH",
    403,
  );
  const pointer = await one(
    env.DB,
    "SELECT * FROM deploy_pointer WHERE school_id=?",
    [env.SCHOOL_ID],
  );
  if (!pointer)
    return {
      available: false,
      reason: "PUBLICATION_UNAVAILABLE",
      schoolId: env.SCHOOL_ID,
    };
  const publication = await publicationById(
    { env, principal: { schoolId: env.SCHOOL_ID } },
    pointer.publication_id,
  );
  const doc = publication.document;
  const groups = new Map(doc.groups.map((g) => [g.id, g.name]));
  const classes = new Map(doc.classes.map((c) => [c.ref || c.id, c.name]));
  return {
    available: true,
    schoolId: env.SCHOOL_ID,
    publicationId: publication.publicationId,
    revision: pointer.revision,
    asOf: now,
    assignments: doc.assignments.map((a) => ({
      staffId: a.teacher,
      subject: a.subject,
      level: a.level,
      groupName: groups.get(a.target) || classes.get(a.targetRef) || a.target,
    })),
    workloads: publication.envelope.rows.map((r) => ({
      staffId: r.staffId,
      total: r.rawTimetabledOccupancy,
      weightedWi: r.Wi,
      quality: r.quality,
    })),
    subjectHeaders: [
      ...new Set(
        Object.values(doc.loads).flatMap((level) => Object.keys(level)),
      ),
    ],
    organisations: doc.organisations,
  };
}
