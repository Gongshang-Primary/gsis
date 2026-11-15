/** Read-only, owner-local projections. These files never restore or accept records. */
import JSZip from "jszip";
import { encodeWorkbook } from "../web/shared/workbooks.mjs";
import { requireValue } from "./errors.mjs";
import { canonical, digest, query, statement } from "./store.mjs";
import { inflate } from "../services/deploy/service.mjs";
import { exportWorkbook, SCHEMAS } from "../services/deploy/workbooks.mjs";
import { workbook as layoutWorkbook } from "../services/layout/service.mjs";
import { publicStaff } from "../services/contacts/store.mjs";
import {
  CONTACT_GRID_FIELDS,
  CONTACT_GRID_SCHEMA,
  gridValues,
} from "../services/contacts/grid-projection.mjs";
import { readArtifact } from "../services/roster/repository.mjs";
import { metadataWorkbook } from "../services/calendar/table-import.mjs";

// Explicit list: session credentials, bearer links, provider jobs and security evidence
// are not general-purpose import files. Full owner backups remain a separate facility.
const TABLES = Object.freeze({
  contacts: [
    "contacts_staff",
    "contacts_fields",
    "contacts_catalogues",
    "contacts_settings",
  ],
  calendar: ["calendar_years", "calendar_events", "calendar_metadata"],
  roster: [
    "roster_records",
    "roster_baselines",
    "roster_weekly",
    "roster_ledger",
    "roster_openings",
    "roster_publications",
  ],
  lord: [
    "lord_resources",
    "lord_bookings",
    "lord_booking_items",
    "lord_item_events",
    "lord_incidents",
    "lord_preferences",
    "lord_references",
    "lord_reference_state",
    "lord_periods",
    "lord_settings",
    "lord_accessories",
  ],
  venues: ["venues_records", "venues_intervals"],
});
const MAX_ROWS = 2000;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
// The assertion runs before row materialization in the same owner-local D1 batch.
// It only touches the backup assertion table, never authoritative source rows.
async function boundedSource(env, specs) {
  const info = await env.DB.batch(
    specs.map((spec) =>
      statement(env.DB, `PRAGMA table_info("${spec.table}")`),
    ),
  );
  requireValue(
    info.every((r) => r.success && r.results.length),
    "DRIVE_BACKUP_SCHEMA",
    503,
  );
  const columns = info.map((r) => r.results.map((c) => c.name));
  requireValue(
    columns.flat().every((name) => /^[a-z_][a-z0-9_]*$/.test(name)),
    "DRIVE_BACKUP_SCHEMA",
    503,
  );
  const reads = specs.map(
    (spec) =>
      `SELECT * FROM "${spec.table}" WHERE ${spec.where} ${spec.order ? `ORDER BY ${spec.order}` : ""} LIMIT ${spec.limit + 1}`,
  );
  const measures = reads.map(
    (sql, index) =>
      `SELECT COUNT(*)>${specs[index].limit} AS overflow,COALESCE(SUM(length(CAST(json_object(${columns[index].flatMap((name) => ["'" + name + "'", '"' + name + '"']).join(",")}) AS BLOB))),0) AS bytes FROM (${sql})`,
  );
  const assertion = crypto.randomUUID();
  let result;
  try {
    result = await env.DB.batch([
      statement(
        env.DB,
        `INSERT INTO drive_backup_assertions(id,ok) SELECT ?,CASE WHEN (${measures.map((_, i) => `m${i}.bytes`).join("+")})<=? AND ${measures.map((_, i) => `m${i}.overflow=0`).join(" AND ")} THEN 1 ELSE 0 END FROM ${measures.map((sql, i) => `(${sql}) AS m${i}`).join(" CROSS JOIN ")}`,
        [assertion, MAX_SOURCE_BYTES, ...specs.flatMap((spec) => spec.args)],
      ),
      ...reads.map((sql, index) => statement(env.DB, sql, specs[index].args)),
      statement(env.DB, "DELETE FROM drive_backup_assertions WHERE id=?", [
        assertion,
      ]),
    ]);
  } catch (error) {
    if (String(error.message).includes("CHECK constraint failed"))
      requireValue(false, "DRIVE_BACKUP_SOURCE_BOUNDS", 413);
    throw error;
  }
  requireValue(
    result.every((r) => r.success),
    "STORAGE_UNAVAILABLE",
    503,
  );
  return specs.map((_, index) => ({
    schema: info[index].results,
    results: result[index + 1].results,
    success: true,
  }));
}

export async function encodeBackupWorkbook(workbook) {
  const bytes = await encodeWorkbook(workbook, { Zip: JSZip });
  requireValue(bytes.length <= 8 * 1024 * 1024, "DRIVE_BACKUP_BOUNDS", 413);
  return bytes;
}
export async function listBackupDatasets(env) {
  const owner = env.SERVICE_NAME,
    school = env.SCHOOL_ID;
  if (owner === "calendar")
    return [
      ...["lanes", "tags"].map((kind) => ({
        id: kind,
        name: kind,
        kind,
        importable: true,
      })),
      { id: "records", name: "Recovery records", importable: false },
    ];
  if (owner === "contacts")
    return [
      { id: "staff", name: "Staff", importable: true },
      { id: "records", name: "Recovery records", importable: false },
    ];
  if (owner === "lord")
    return [
      ...["resources", "classes", "subjects", "periods"].map((kind) => ({
        id: kind,
        name: kind,
        importable: true,
      })),
      { id: "records", name: "Recovery records", importable: false },
    ];
  if (owner === "roster") {
    const out = await env.DB.batch([
      statement(
        env.DB,
        "SELECT baseline_id id FROM roster_baselines WHERE school_id=? AND pruned=0 ORDER BY baseline_id LIMIT 101",
        [school],
      ),
      statement(
        env.DB,
        "SELECT publication_id id FROM roster_publications WHERE school_id=? ORDER BY publication_id LIMIT 1001",
        [school],
      ),
    ]);
    requireValue(
      out.every(
        (r, index) => r.success && r.results.length <= (index ? 1000 : 100),
      ),
      "DRIVE_BACKUP_DATASET_BOUNDS",
      413,
    );
    return [
      { id: "records", name: "Records", importable: false },
      ...out.flatMap((r, i) =>
        r.results.map((v) => ({
          id: `${i ? "publication" : "baseline"}:${v.id}`,
          name: `${i ? "Publication" : "Baseline"} ${v.id}`,
          kind: i ? "publication" : "baseline",
          sourceId: v.id,
          extension: "json",
          mimeType: "application/json",
          importable: false,
        })),
      ),
    ];
  }
  if (TABLES[owner])
    return [{ id: "records", name: "Records", importable: false }];
  if (owner === "deploy") {
    const rows = await query(
      env.DB,
      "SELECT id FROM deploy_versions WHERE school_id=? AND deleted=0 ORDER BY id LIMIT 101",
      [school],
    );
    requireValue(rows.length <= 100, "DRIVE_BACKUP_DATASET_BOUNDS", 413);
    return rows.flatMap((r) => [
      ...Object.keys(SCHEMAS).map((scope) => ({
        id: `version:${r.id}:${scope}`,
        name: `Version ${r.id} ${scope}`,
        versionId: r.id,
        scope,
        importable: !["Membership", "HR Terms"].includes(scope),
      })),
      {
        id: `version:${r.id}:recovery`,
        name: `Version ${r.id} Recovery`,
        versionId: r.id,
        kind: "version-recovery",
        extension: "json",
        mimeType: "application/json",
        importable: false,
      },
    ]);
  }
  if (owner === "layout") {
    const rows = await query(
      env.DB,
      "SELECT year FROM layout_heads WHERE school_id=? ORDER BY year LIMIT 101",
      [school],
    );
    requireValue(rows.length <= 100, "DRIVE_BACKUP_DATASET_BOUNDS", 413);
    return rows.map((r) => ({
      id: `year:${r.year}`,
      name: `Year ${r.year}`,
      year: r.year,
      importable: true,
    }));
  }
  return [];
}
function readableSheet(columns, rows) {
  const additions = new Set();
  for (const row of rows)
    for (const col of columns) {
      if (
        !/(?:_json|^body|^metadata)$/.test(col) ||
        typeof row[col] !== "string"
      )
        continue;
      let parsed;
      try {
        parsed = JSON.parse(row[col]);
      } catch {
        continue;
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        for (const [k, v] of Object.entries(parsed))
          if (v === null || ["string", "number", "boolean"].includes(typeof v))
            additions.add(`${col}.${k}`);
    }
  const extra = [...additions].sort(),
    all = [...columns, ...extra];
  return {
    columns: all,
    rows: rows.map((row) =>
      all.map((col) => {
        let value = row[col];
        if (extra.includes(col)) {
          const dot = col.indexOf(".");
          value = JSON.parse(row[col.slice(0, dot)] || "null")?.[
            col.slice(dot + 1)
          ];
        }
        value = value ?? null;
        requireValue(
          typeof value !== "string" || value.length <= 32767,
          "DRIVE_BACKUP_CELL_BOUNDS",
          413,
        );
        return value;
      }),
    ),
  };
}
export async function buildBackupDataset(env, dataset, now = Date.now()) {
  const owner = env.SERVICE_NAME,
    school = env.SCHOOL_ID;
  if (owner === "calendar" && ["lanes", "tags"].includes(dataset.id)) {
    const rows = (
      await boundedSource(env, [
        {
          table: "calendar_metadata",
          where: "school_id=? AND kind=?",
          args: [school, dataset.id],
          order: "record_id",
          limit: 128,
        },
      ])
    )[0].results;
    const book = await metadataWorkbook(rows, school, dataset.id);
    return { sourceDigest: await digest(book), book, importable: true };
  }
  if (owner === "contacts" && dataset.id === "staff")
    return contactsWorkbook(env, now);
  if (owner === "lord" && dataset.id !== "records")
    return lordWorkbook(env, dataset.id);
  if (owner === "roster" && dataset.kind) {
    const table =
        dataset.kind === "baseline"
          ? "roster_baselines"
          : "roster_publications",
      column = dataset.kind === "baseline" ? "baseline_id" : "publication_id";
    const rows = await query(
      env.DB,
      `SELECT * FROM ${table} WHERE school_id=? AND ${column}=?`,
      [school, dataset.sourceId],
    );
    requireValue(rows.length === 1, "DRIVE_BACKUP_SOURCE_MISSING", 409);
    const row = rows[0];
    const key = dataset.kind === "baseline" ? row.model_key : row.payload_key,
      hash = dataset.kind === "baseline" ? row.digest : row.source_digest;
    requireValue(
      key.startsWith(school + "/"),
      "DRIVE_BACKUP_SOURCE_SCOPE",
      409,
    );
    const value = await readArtifact(env.ARTIFACTS, key, hash),
      source = {
        schemaVersion: 1,
        schoolId: school,
        owner: "roster",
        kind: dataset.kind,
        record: row,
        artifact: value,
      };
    const bytes = new TextEncoder().encode(canonical(source));
    requireValue(bytes.length <= 8 * 1024 * 1024, "DRIVE_BACKUP_BOUNDS", 413);
    return { sourceDigest: await digest(source), bytes, importable: false };
  }
  if (owner === "deploy") {
    const data = await boundedSource(env, [
      {
        table: "deploy_versions",
        where: "school_id=? AND id=? AND deleted=0",
        args: [school, dataset.versionId],
        limit: 1,
      },
      {
        table: "deploy_rows",
        where: "school_id=? AND version_id=?",
        args: [school, dataset.versionId],
        order: "scope,row_id",
        limit: MAX_ROWS,
      },
    ]);
    requireValue(
      data.every((r) => r.success) &&
        data[0].results.length === 1 &&
        data[1].results.length <= MAX_ROWS,
      "DRIVE_BACKUP_SOURCE_BOUNDS",
      413,
    );
    const version = data[0].results[0],
      doc = {
        ...inflate(data[1].results),
        ...JSON.parse(version.metadata),
        id: version.id,
        name: version.name,
        revision: version.revision,
        createdAt: version.created_at,
      };
    if (dataset.kind === "version-recovery") {
      const value = {
        schemaVersion: 1,
        owner: "deploy",
        schoolId: school,
        version,
        document: doc,
        rows: data[1].results,
        importable: false,
      };
      const bytes = new TextEncoder().encode(canonical(value));
      requireValue(bytes.length <= 8 * 1024 * 1024, "DRIVE_BACKUP_BOUNDS", 413);
      return { sourceDigest: await digest(value), bytes, importable: false };
    }
    const book = exportWorkbook(doc, dataset.scope, school, version.revision);
    const importable = !["Membership", "HR Terms"].includes(dataset.scope);
    if (!importable) book.metadata.mode = "reporting-only";
    return { sourceDigest: await digest(book), book, importable };
  }
  if (owner === "layout") {
    const data = await query(
      env.DB,
      "SELECT s.* FROM layout_heads h JOIN layout_snapshots s ON s.school_id=h.school_id AND s.snapshot_id=h.snapshot_id WHERE h.school_id=? AND h.year=?",
      [school, dataset.year],
    );
    requireValue(data.length === 1, "DRIVE_BACKUP_SOURCE_MISSING", 409);
    const stored = data[0];
    requireValue(
      stored.object_key.startsWith(school + "/layout/") &&
        stored.bytes <= 8 * 1024 * 1024,
      "DRIVE_BACKUP_SOURCE_SCOPE",
      409,
    );
    const snapshot = await readArtifact(
      env.ARTIFACTS,
      stored.object_key,
      stored.sha256,
    );
    requireValue(
      snapshot.year === dataset.year,
      "DRIVE_BACKUP_SOURCE_SCOPE",
      409,
    );
    for (const name of [
      "venues",
      "classes",
      "groups",
      "allocations",
      "pupilBreakdown",
    ])
      requireValue(
        Array.isArray(snapshot[name]) && snapshot[name].length <= MAX_ROWS,
        "DRIVE_BACKUP_SOURCE_BOUNDS",
        413,
      );
    const book = layoutWorkbook(snapshot, school, stored.revision);
    return {
      sourceDigest: await digest({ book, sha256: stored.sha256 }),
      book,
      importable: true,
    };
  }
  const tables = TABLES[owner];
  requireValue(tables, "DRIVE_BACKUP_OWNER", 400);
  // One owner database batch supplies a consistent snapshot. Different owners have
  // independent observations; no cross-D1 atomicity is claimed.
  const checked = await boundedSource(
    env,
    tables.map((table) => ({
      table,
      where: "school_id=?",
      args: [school],
      limit: MAX_ROWS,
    })),
  );
  const results = checked.flatMap((r) => [
      { results: r.schema, success: true },
      r,
    ]),
    sheets = {},
    source = {};
  requireValue(
    results.every((r) => r.success),
    "STORAGE_UNAVAILABLE",
    503,
  );
  tables.forEach((table, i) => {
    const columns = results[i * 2].results.map((r) => r.name),
      rows = results[i * 2 + 1].results;
    requireValue(
      columns.length > 0 && rows.length <= MAX_ROWS,
      "DRIVE_BACKUP_SOURCE_BOUNDS",
      413,
    );
    rows.sort((a, b) => canonical(a).localeCompare(canonical(b)));
    // Cached-reference observations are not new business facts. The status record
    // separately tracks this run's observation and remote verification times.
    source[table] = rows.map((row) =>
      table === "lord_references" || table === "lord_reference_state"
        ? Object.fromEntries(
            Object.entries(row).filter(
              ([key]) =>
                ![
                  "observed_at",
                  "next_refresh_at",
                  ...(table === "lord_reference_state" ? ["revision"] : []),
                ].includes(key),
            ),
          )
        : row,
    );
    sheets[table.replace(owner + "_", "").slice(0, 31)] = readableSheet(
      columns,
      rows,
    );
  });
  const sourceDigest = await digest(source);
  const book = {
    metadata: {
      schemaVersion: 1,
      schoolId: school,
      owner,
      dataset: dataset.id,
      sourceDigest,
      importable: false,
      restorePolicy:
        "Recovery export. Use owner import validation; authority acceptance is never restored by this file.",
    },
    sheets,
  };
  return { sourceDigest, book, importable: false };
}

async function contactsWorkbook(env, now) {
  const results = await boundedSource(env, [
    {
      table: "contacts_staff",
      where: "school_id=?",
      args: [env.SCHOOL_ID],
      order: "staff_id",
      limit: 2000,
    },
    {
      table: "contacts_fields",
      where: "school_id=?",
      args: [env.SCHOOL_ID],
      order: "staff_id,field",
      limit: 20000,
    },
  ]);
  requireValue(
    results.every((r) => r.success) &&
      results[0].results.length <= 2000 &&
      results[1].results.length <= 20000,
    "DRIVE_BACKUP_SOURCE_BOUNDS",
    413,
  );
  const byStaff = new Map();
  for (const f of results[1].results) {
    if (!byStaff.has(f.staff_id)) byStaff.set(f.staff_id, {});
    byStaff.get(f.staff_id)[f.field] = f;
  }
  const rows = results[0].results.map((staff) => {
    const r = publicStaff(
      { staff, fields: byStaff.get(staff.staff_id) || {} },
      now,
      { privateFields: true },
    );
    return [r.staffId, ...gridValues(r, { schoolDomain: env.HOSTED_DOMAIN })];
  });
  const columns = ["Staff ID", ...CONTACT_GRID_FIELDS],
    sourceDigest = await digest({
      rows,
      source: results.map((r) => r.results),
    });
  return {
    sourceDigest,
    importable: true,
    book: {
      metadata: {
        Schema: CONTACT_GRID_SCHEMA.workbookSchema,
        "School ID": env.SCHOOL_ID,
        Revision: sourceDigest,
        "Import semantics":
          "Update existing editable cells only; maximum64 edited cells and16 staff per atomic import. Authority acceptance is excluded.",
      },
      sheets: { Contacts: { columns, rows }, Baseline: { columns, rows } },
    },
  };
}
const LORD_COLUMNS = {
  resources: [
    "Resource ID",
    "Trolley name",
    "Quantity",
    "Cart / group",
    "Device type",
    "Styluses",
    "Headphones",
    "Active",
    "Exclusive",
    "Preparation periods",
  ],
  classes: ["Class / group"],
  subjects: ["Subject / activity"],
  periods: ["Code", "Start", "End"],
};
async function lordWorkbook(env, kind) {
  let rows, revision;
  if (kind === "resources") {
    const data = (
      await boundedSource(env, [
        {
          table: "lord_resources",
          where: "school_id=?",
          args: [env.SCHOOL_ID],
          order: "resource_id",
          limit: 2000,
        },
      ])
    )[0].results;
    requireValue(data.length <= 2000, "DRIVE_BACKUP_SOURCE_BOUNDS", 413);
    rows = data.map((r) => {
      const m = JSON.parse(r.metadata_json);
      return [
        r.resource_id,
        r.name,
        r.capacity,
        m.cart || "",
        r.type,
        m.stylusOption === true,
        m.headphoneOption === true,
        !!r.active,
        !!r.exclusive,
        r.buffer_periods,
      ];
    });
    revision = JSON.stringify(data.map((r) => [r.resource_id, r.revision]));
  } else {
    const key = kind === "periods" ? "periodTimings" : "referenceLists";
    const data = await query(
        env.DB,
        "SELECT revision,value_json FROM lord_settings WHERE school_id=? AND setting_key=?",
        [env.SCHOOL_ID, key],
      ),
      value = data[0] ? JSON.parse(data[0].value_json) : {};
    revision = String(data[0]?.revision || 0);
    rows =
      kind === "periods"
        ? (value.periods || []).map((p) => [String(p.code), p.start, p.end])
        : (value[kind] || []).map((v) => [v]);
  }
  const book = {
    metadata: {
      schemaVersion: 1,
      owner: "lord",
      schoolId: env.SCHOOL_ID,
      table: kind,
      sourceRevision: revision,
      mode: "import",
    },
    sheets: { Reference: { columns: LORD_COLUMNS[kind], rows } },
  };
  return { sourceDigest: await digest(book), book, importable: true };
}
