/** Explicit REIGN recovery export and two-phase cleanup. No cross-D1/R2/Drive atomicity. */
import { canonical, digest, query, one } from "../../runtime/store.mjs";
import {
  allocateDriveFileId,
  putVerifiedDriveFile,
  verifyDriveFile,
  verifyDriveFolder,
  driveBackupConfig,
  sha256Bytes,
  dailyFileName,
} from "../../runtime/drive-backup.mjs";
import { encodeBackupWorkbook } from "../../runtime/drive-backup-data.mjs";
import { fail, id, requireCapability, sgDay } from "./model.mjs";
const tables = [
  "lord_bookings",
  "lord_booking_items",
  "lord_accessories",
  "lord_item_events",
  "lord_photos",
  "lord_incidents",
];
const bound = 8 * 1024 * 1024;
const statement = (sql, args = []) => ({ sql, args });
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function wrappedReport(
  { periodId, bookings, items, events, incidents },
  names = {},
) {
  const totals = new Map(),
    carts = new Map();
  for (const b of bookings)
    totals.set(b.staff_id, (totals.get(b.staff_id) || 0) + 1);
  for (const i of items)
    carts.set(i.resource_id, (carts.get(i.resource_id) || 0) + i.quantity);
  const top = (map) =>
    [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const teacher = top(totals),
    cart = top(carts);
  const cards = [
    ["Bookings", bookings.length],
    ["Movement events", events.length],
    ["Devices reserved", items.reduce((n, i) => n + i.quantity, 0)],
    ["People borrowing", totals.size],
    [
      "Most frequent borrower",
      teacher
        ? `${names[teacher[0]] || teacher[0]} · ${teacher[1]} bookings`
        : "No bookings",
    ],
    [
      "Most hardworking trolley",
      cart
        ? `${names[cart[0]] || cart[0]} · ${cart[1]} devices reserved`
        : "No bookings",
    ],
  ];
  return (
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LORD Wrapped</title><style>body{margin:0;background:#101934;color:#fff;font:18px system-ui}main{max-width:1000px;margin:auto;padding:5vw}header{border-bottom:2px solid #b9f789;padding-bottom:2em}h1{font-size:clamp(3rem,9vw,6rem);margin:0;color:#b9f789}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin:2em 0}article{border:1px solid #647091;border-radius:24px;padding:24px;background:#202e52}article:nth-child(3n){background:#583048}strong{display:block;font-size:clamp(1.6rem,3vw,2.7rem);margin-top:12px}article:nth-child(n+5) strong{font-size:clamp(1.4rem,2.5vw,2rem);line-height:1.35}small,p{line-height:1.6}footer{border-top:1px solid #647091;padding-top:1em}@media print{body{background:white;color:#17233e}article{break-inside:avoid;background:white!important}h1{color:#17233e}}</style><main><header><p>LORD · YOUR LOGGING PERIOD</p><h1>That’s a wrap.</h1><p>' +
    escape(periodId) +
    '</p></header><section class="cards">' +
    cards
      .map(
        ([label, value]) =>
          "<article>" +
          escape(label) +
          "<strong>" +
          escape(value) +
          "</strong></article>",
      )
      .join("") +
    "</section><footer><p>Incidents recorded: " +
    incidents.length +
    ". This recap counts recorded bookings and events; it does not certify physical device return. Unresolved obligations remain live.</p><small>Private school report · recovered from LORD records · no external fonts, scripts or trackers.</small></footer></main></html>"
  );
}
async function snapshot(ctx, periodId) {
  const school = ctx.principal.schoolId,
    db = ctx.env.DB;
  const period = await one(
    db,
    "SELECT * FROM lord_periods WHERE school_id=? AND period_id=? AND status='closed'",
    [school, id(periodId)],
  );
  if (!period)
    fail(
      "PERIOD_NOT_CLOSED",
      "Close the logging period before preparing its recovery archive.",
      409,
    );
  const rows = {};
  for (const table of tables) {
    rows[table] = await query(
      db,
      table === "lord_bookings"
        ? "SELECT * FROM lord_bookings WHERE school_id=? AND period_id=? ORDER BY booking_id LIMIT 2001"
        : `SELECT t.* FROM ${table} t JOIN lord_bookings b USING(school_id,booking_id) WHERE b.school_id=? AND b.period_id=? ORDER BY t.rowid LIMIT 12001`,
      [school, periodId],
    );
    if (rows[table].length > (table === "lord_bookings" ? 2000 : 12000))
      fail(
        "ARCHIVE_BOUNDS",
        "The period is too large for one recovery package; no data was removed.",
        422,
      );
  }
  return { period, rows, sourceDigest: await digest(rows) };
}
async function state(ctx, archiveId) {
  const row = await one(
    ctx.env.DB,
    "SELECT * FROM lord_reign_archives WHERE school_id=? AND archive_id=?",
    [ctx.principal.schoolId, id(archiveId)],
  );
  if (!row) fail("NOT_FOUND", "Recovery archive not found.", 404);
  return {
    ...row,
    manifest: JSON.parse(row.manifest_json),
    cleanup: row.cleanup_json ? JSON.parse(row.cleanup_json) : null,
  };
}
function sourceGuard(school, snap) {
  const b = snap.rows.lord_bookings,
    i = snap.rows.lord_incidents;
  return statement(
    `SELECT (SELECT COUNT(*) FROM lord_bookings WHERE school_id=? AND period_id=?)=? AND (SELECT COALESCE(SUM(revision),0) FROM lord_bookings WHERE school_id=? AND period_id=?)=? AND (SELECT COUNT(*) FROM lord_photos t JOIN lord_bookings b USING(school_id,booking_id) WHERE b.school_id=? AND b.period_id=?)=? AND (SELECT COUNT(*) FROM lord_item_events t JOIN lord_bookings b USING(school_id,booking_id) WHERE b.school_id=? AND b.period_id=?)=? AND (SELECT COUNT(*) FROM lord_incidents t JOIN lord_bookings b USING(school_id,booking_id) WHERE b.school_id=? AND b.period_id=?)=? AND (SELECT COALESCE(SUM(t.revision),0) FROM lord_incidents t JOIN lord_bookings b USING(school_id,booking_id) WHERE b.school_id=? AND b.period_id=?)=? AS ok`,
    [
      school,
      snap.period.period_id,
      b.length,
      school,
      snap.period.period_id,
      b.reduce((n, r) => n + r.revision, 0),
      school,
      snap.period.period_id,
      snap.rows.lord_photos.length,
      school,
      snap.period.period_id,
      snap.rows.lord_item_events.length,
      school,
      snap.period.period_id,
      i.length,
      school,
      snap.period.period_id,
      i.reduce((n, r) => n + r.revision, 0),
    ],
  );
}
function config(ctx) {
  const c = driveBackupConfig(ctx.env);
  if (!c.enabled || !c.configured || !c.folderId)
    fail(
      "DRIVE_BACKUP_NOT_CONFIGURED",
      "Configure and enable the LORD Google backup folder before archiving or clearing records.",
      409,
    );
  return c;
}
async function bytesOf(object) {
  return new Uint8Array(await object.arrayBuffer());
}
function base64(bytes) {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
export async function prepareReignArchive(ctx, input, mutate) {
  return mutate(ctx, "reign-archive-prepare", async ({ now }) => {
    const c = config(ctx);
    await verifyDriveFolder(ctx.env, {
      folderId: c.folderId,
      parentId: c.rootId,
    });
    const snap = await snapshot(ctx, input.periodId),
      school = ctx.principal.schoolId,
      archiveId =
        "reign-" +
        (await digest({
          periodId: input.periodId,
          sourceDigest: snap.sourceDigest,
        }));
    const existing = await one(
      ctx.env.DB,
      "SELECT archive_id,state FROM lord_reign_archives WHERE school_id=? AND archive_id=?",
      [school, archiveId],
    );
    if (existing) return { result: { archiveId, state: existing.state } };
    const resources = await query(
        ctx.env.DB,
        "SELECT * FROM lord_resources WHERE school_id=? ORDER BY resource_id",
        [school],
      ),
      settings = await query(
        ctx.env.DB,
        "SELECT * FROM lord_settings WHERE school_id=? ORDER BY setting_key",
        [school],
      ),
      references = await query(
        ctx.env.DB,
        "SELECT * FROM lord_references WHERE school_id=? ORDER BY staff_id",
        [school],
      );
    if (snap.rows.lord_photos.length > 32)
      fail(
        "ARCHIVE_BOUNDS",
        "This bounded recovery supports at most 32 photographs; retain records for a partitioned archive.",
        422,
      );
    const photos = [];
    let total = 0;
    for (const row of snap.rows.lord_photos) {
      if (!row.object_key.startsWith(school + "/lord/"))
        fail("ARCHIVE_SCOPE", "Photo is outside the owner namespace.", 409);
      const object = await ctx.env.ARTIFACTS.get(row.object_key);
      if (!object)
        fail(
          "ARCHIVE_INCOMPLETE",
          "A photograph is missing; cleanup is blocked.",
          409,
        );
      const bytes = await bytesOf(object);
      total += bytes.length;
      if (total > bound / 2)
        fail(
          "ARCHIVE_BOUNDS",
          "Photo recovery exceeds the bounded package. Preserve records for a partitioned archive.",
          422,
        );
      if (
        bytes.length !== row.bytes ||
        (await sha256Bytes(bytes)) !== row.sha256
      )
        fail(
          "ARCHIVE_INCOMPLETE",
          "A photograph failed its integrity check.",
          409,
        );
      photos.push({
        objectKey: row.object_key,
        sha256: row.sha256,
        mime: row.mime,
        bytesBase64: base64(bytes),
      });
    }
    const recovery = {
      schemaVersion: 1,
      kind: "lord-reign-recovery",
      schoolId: school,
      periodId: input.periodId,
      sourceDigest: snap.sourceDigest,
      period: snap.period,
      tables: snap.rows,
      resources,
      settings,
      references,
      photos,
      recordedAt: now,
    };
    const names = Object.fromEntries([
      ...resources.map((r) => [r.resource_id, r.name]),
      ...references.map((r) => [r.staff_id, r.name]),
    ]);
    const report = {
      periodId: input.periodId,
      bookings: snap.rows.lord_bookings,
      items: snap.rows.lord_booking_items,
      events: snap.rows.lord_item_events,
      incidents: snap.rows.lord_incidents,
    };
    const sheets = {};
    for (const [table, rows] of Object.entries({
      ...snap.rows,
      resources,
      settings,
      references,
    })) {
      const columns = rows.length ? Object.keys(rows[0]) : ["No records"];
      sheets[table.replace("lord_", "")] = {
        columns,
        rows: rows.map((r) => columns.map((k) => r[k] ?? null)),
      };
    }
    const parts = [
      [
        "Recovery",
        "json",
        "application/json",
        new TextEncoder().encode(canonical(recovery)),
      ],
      [
        "Records",
        "xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        await encodeBackupWorkbook({
          metadata: {
            schemaVersion: 1,
            owner: "lord",
            schoolId: school,
            periodId: input.periodId,
            sourceDigest: snap.sourceDigest,
            mode: "recovery-archive",
          },
          sheets,
        }),
      ],
      [
        "Wrapped",
        "html",
        "text/html",
        new TextEncoder().encode(wrappedReport(report, names)),
      ],
    ];
    const files = [];
    for (const [kind, ext, mime, bytes] of parts) {
      if (bytes.length > bound)
        fail(
          "ARCHIVE_BOUNDS",
          "Recovery file exceeds 8 MiB; no records were removed.",
          422,
        );
      const sha256 = await sha256Bytes(bytes),
        objectKey = `${school}/lord/archives/${archiveId}/${sha256}.${ext}`;
      await ctx.env.ARTIFACTS.put(objectKey, bytes);
      const stored = await ctx.env.ARTIFACTS.get(objectKey);
      if (!stored || (await sha256Bytes(await bytesOf(stored))) !== sha256)
        fail("ARCHIVE_UNCONFIRMED", "Recovery file verification failed.", 503);
      files.push({
        kind,
        name: dailyFileName(
          sgDay(now),
          "lord",
          `REIGN ${input.periodId.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 55)} ${snap.sourceDigest.slice(0, 8)} ${kind}`,
          ext,
        ),
        mime,
        objectKey,
        sha256,
        size: bytes.length,
        fileId: await allocateDriveFileId(ctx.env),
        folderId: c.folderId,
      });
    }
    const manifest = {
      schemaVersion: 1,
      schoolId: school,
      periodId: input.periodId,
      sourceDigest: snap.sourceDigest,
      files,
      createdBy: ctx.principal.actorId,
      createdAt: now,
    };
    return {
      guards: [sourceGuard(school, snap)],
      writes: [
        statement(
          "INSERT INTO lord_reign_archives(school_id,archive_id,period_id,source_digest,state,revision,manifest_json,created_at,updated_at) VALUES(?,?,?,?,'prepared',1,?,?,?)",
          [
            school,
            archiveId,
            input.periodId,
            snap.sourceDigest,
            canonical(manifest),
            now,
            now,
          ],
        ),
      ],
      result: {
        archiveId,
        state: "prepared",
        files: files.map(({ kind, name }) => ({ kind, name })),
        recordsRetained: true,
      },
    };
  });
}
export async function exportReignArchive(ctx, input, mutate) {
  return mutate(ctx, "reign-archive-export", async ({ now }) => {
    const row = await state(ctx, input.archiveId),
      c = config(ctx);
    if (["cleanup-pending", "complete"].includes(row.state))
      fail("CLEANUP_STARTED", "The archive is already in cleanup.", 409);
    if (row.manifest.files.some((f) => f.folderId !== c.folderId))
      fail(
        "ARCHIVE_SCOPE",
        "The configured folder changed; retain the existing archive.",
        409,
      );
    await verifyDriveFolder(ctx.env, {
      folderId: c.folderId,
      parentId: c.rootId,
    });
    const files = [];
    for (const file of row.manifest.files) {
      const object = await ctx.env.ARTIFACTS.get(file.objectKey);
      if (!object) fail("ARCHIVE_INCOMPLETE", "Recovery file is missing.", 409);
      const bytes = await bytesOf(object);
      if (
        bytes.length !== file.size ||
        (await sha256Bytes(bytes)) !== file.sha256
      )
        fail("ARCHIVE_INCOMPLETE", "Recovery file changed.", 409);
      const verification = await putVerifiedDriveFile(ctx.env, {
        ...file,
        mimeType: file.mime,
        bytes,
      });
      files.push({ ...file, verification });
    }
    return {
      guards: [
        statement(
          "SELECT revision=? AS ok FROM lord_reign_archives WHERE school_id=? AND archive_id=?",
          [row.revision, row.school_id, row.archive_id],
        ),
      ],
      writes: [
        statement(
          "UPDATE lord_reign_archives SET state='verified',revision=revision+1,manifest_json=?,updated_at=? WHERE school_id=? AND archive_id=?",
          [
            canonical({ ...row.manifest, files }),
            now,
            row.school_id,
            row.archive_id,
          ],
        ),
      ],
      result: {
        archiveId: row.archive_id,
        state: "verified",
        files: files.map((f) => ({
          name: f.name,
          url:
            "https://drive.google.com/file/d/" +
            encodeURIComponent(f.fileId) +
            "/view",
        })),
        recordsRetained: true,
      },
    };
  });
}
async function verifyArchive(ctx, row) {
  config(ctx);
  for (const file of row.manifest.files)
    await verifyDriveFile(ctx.env, {
      fileId: file.fileId,
      folderId: file.folderId,
      sha256: file.sha256,
      size: file.size,
    });
}
async function preview(ctx, row) {
  if (row.state !== "verified")
    fail(
      "ARCHIVE_NOT_VERIFIED",
      "Complete Google archive verification before cleanup.",
      409,
    );
  const snap = await snapshot(ctx, row.period_id);
  if (snap.sourceDigest !== row.source_digest)
    fail(
      "ARCHIVE_STALE",
      "Period records changed. Prepare and verify a new recovery archive.",
      409,
    );
  const now = ctx.now ?? Date.now(),
    rows = snap.rows,
    links = await query(
      ctx.env.DB,
      "SELECT booking_id,incident_id FROM lord_links WHERE school_id=? AND revoked=0 AND expires_at>?",
      [row.school_id, now],
    );
  const eligible = rows.lord_bookings
    .filter(
      (b) =>
        ["RETURNED", "CANCELLED"].includes(b.status) &&
        b.service_date <= sgDay(now) &&
        !rows.lord_booking_items.some(
          (i) =>
            i.booking_id === b.booking_id &&
            i.collected_quantity > i.returned_quantity,
        ) &&
        !rows.lord_accessories.some(
          (i) =>
            i.booking_id === b.booking_id &&
            i.collected_quantity > i.returned_quantity,
        ) &&
        !rows.lord_incidents.some(
          (i) => i.booking_id === b.booking_id && i.status !== "resolved",
        ) &&
        !links.some(
          (l) =>
            l.booking_id === b.booking_id ||
            rows.lord_incidents.some(
              (i) =>
                i.booking_id === b.booking_id &&
                i.incident_id === l.incident_id,
            ),
        ),
    )
    .map((b) => b.booking_id)
    .sort();
  const jobs = await one(
    ctx.env.DB,
    "SELECT COUNT(*) AS n FROM product_outbox WHERE school_id=? AND state NOT IN ('delivered','cancelled')",
    [row.school_id],
  );
  const photos = rows.lord_photos
    .filter((p) => eligible.includes(p.booking_id))
    .map((p) => ({
      photoId: p.photo_id,
      objectKey: p.object_key,
      sha256: p.sha256,
      bytes: p.bytes,
      bookingId: p.booking_id,
    }));
  const value = {
    archiveId: row.archive_id,
    periodId: row.period_id,
    sourceDigest: row.source_digest,
    eligibleBookingIds: eligible,
    preservedBookings: rows.lord_bookings.length - eligible.length,
    photos,
    blockers: jobs.n
      ? [{ code: "BACKGROUND_WORK_RETAINED", count: jobs.n }]
      : [],
    confirmationText:
      "CLEAR " + row.period_id + " " + eligible.length + " BOOKINGS",
  };
  return { ...value, previewDigest: await digest(value), snap };
}
export async function previewReignCleanup(ctx, input) {
  requireCapability(ctx.principal, "lord.admin");
  const row = await state(ctx, input.archiveId);
  await verifyArchive(ctx, row);
  const { snap, ...result } = await preview(ctx, row);
  return result;
}
export async function commitReignCleanup(ctx, input, mutate) {
  return mutate(ctx, "reign-cleanup", async ({ now }) => {
    const row = await state(ctx, input.archiveId);
    await verifyArchive(ctx, row);
    const p = await preview(ctx, row);
    if (p.blockers.length)
      fail(
        "CLEANUP_BLOCKED",
        "Background work still references retained period records.",
        409,
      );
    if (
      input.previewDigest !== p.previewDigest ||
      input.confirmation !== p.confirmationText
    )
      fail(
        "CONFIRMATION_REQUIRED",
        "Review and type the exact current cleanup confirmation.",
        409,
      );
    const ids = canonical(p.eligibleBookingIds),
      writes = [
        "lord_booking_items",
        "lord_accessories",
        "lord_item_events",
        "lord_incidents",
        "lord_bookings",
      ].map((table) =>
        statement(
          `DELETE FROM ${table} WHERE school_id=? AND booking_id IN (SELECT value FROM json_each(?))`,
          [row.school_id, ids],
        ),
      );
    const { snap, ...receipt } = p;
    writes.push(
      statement(
        "UPDATE lord_reign_archives SET state='cleanup-pending',revision=revision+1,cleanup_json=?,updated_at=? WHERE school_id=? AND archive_id=?",
        [
          canonical({
            ...receipt,
            confirmedBy: ctx.principal.actorId,
            confirmedAt: now,
          }),
          now,
          row.school_id,
          row.archive_id,
        ],
      ),
    );
    return {
      guards: [
        sourceGuard(row.school_id, snap),
        statement(
          "SELECT revision=? AND state='verified' AS ok FROM lord_reign_archives WHERE school_id=? AND archive_id=?",
          [row.revision, row.school_id, row.archive_id],
        ),
        statement(
          "SELECT NOT EXISTS(SELECT 1 FROM product_outbox WHERE school_id=? AND state NOT IN ('delivered','cancelled')) AS ok",
          [row.school_id],
        ),
        statement(
          "SELECT NOT EXISTS(SELECT 1 FROM lord_links WHERE school_id=? AND revoked=0 AND expires_at>? AND (booking_id IN (SELECT value FROM json_each(?)) OR incident_id IN (SELECT incident_id FROM lord_incidents WHERE school_id=? AND booking_id IN (SELECT value FROM json_each(?))))) AS ok",
          [row.school_id, now, ids, row.school_id, ids],
        ),
      ],
      writes,
      result: {
        archiveId: row.archive_id,
        state: "cleanup-pending",
        bookingsCleared: p.eligibleBookingIds.length,
        photosPending: p.photos.length,
        recordsPreserved: p.preservedBookings,
      },
    };
  });
}
export async function finishReignCleanup(ctx, input, mutate) {
  return mutate(ctx, "reign-cleanup-finish", async ({ now }) => {
    const row = await state(ctx, input.archiveId);
    if (row.state === "complete")
      return { result: { archiveId: row.archive_id, state: "complete" } };
    if (row.state !== "cleanup-pending")
      fail(
        "CLEANUP_NOT_CONFIRMED",
        "Explicit cleanup confirmation is required.",
        409,
      );
    await verifyArchive(ctx, row);
    const live = await one(
      ctx.env.DB,
      "SELECT COUNT(*) AS n FROM lord_photos p JOIN lord_bookings b USING(school_id,booking_id) WHERE p.school_id=? AND p.object_key IN (SELECT value FROM json_each(?))",
      [row.school_id, canonical(row.cleanup.photos.map((p) => p.objectKey))],
    );
    if (live.n)
      fail(
        "OBJECT_STILL_REFERENCED",
        "A photograph is still referenced by retained records.",
        409,
      );
    for (const photo of row.cleanup.photos) {
      if (!photo.objectKey.startsWith(row.school_id + "/lord/"))
        fail("ARCHIVE_SCOPE", "Object is outside LORD scope.", 409);
      await ctx.env.ARTIFACTS.delete(photo.objectKey);
      if (await ctx.env.ARTIFACTS.get(photo.objectKey))
        fail(
          "CLEANUP_UNCONFIRMED",
          "Object deletion is not confirmed. Resume this cleanup.",
          503,
        );
    }
    const writes = [
      statement(
        "DELETE FROM lord_photos WHERE school_id=? AND photo_id IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM lord_bookings b WHERE b.school_id=? AND b.booking_id=lord_photos.booking_id)",
        [
          row.school_id,
          canonical(row.cleanup.photos.map((p) => p.photoId)),
          row.school_id,
        ],
      ),
    ];
    writes.push(
      statement(
        "UPDATE lord_reign_archives SET state='complete',revision=revision+1,updated_at=? WHERE school_id=? AND archive_id=?",
        [now, row.school_id, row.archive_id],
      ),
    );
    return {
      guards: [
        statement(
          "SELECT revision=? AND state='cleanup-pending' AS ok FROM lord_reign_archives WHERE school_id=? AND archive_id=?",
          [row.revision, row.school_id, row.archive_id],
        ),
      ],
      writes,
      result: {
        archiveId: row.archive_id,
        state: "complete",
        bookingsCleared: row.cleanup.eligibleBookingIds.length,
        photosCleared: row.cleanup.photos.length,
        archiveRetained: true,
      },
    };
  });
}
export async function reignArchiveList(ctx) {
  requireCapability(ctx.principal, "lord.admin");
  return {
    archives: await query(
      ctx.env.DB,
      "SELECT archive_id,period_id,state,created_at,updated_at FROM lord_reign_archives WHERE school_id=? ORDER BY created_at DESC LIMIT 100",
      [ctx.principal.schoolId],
    ),
    closedPeriods: await query(
      ctx.env.DB,
      "SELECT period_id,closed_at FROM lord_periods WHERE school_id=? AND status='closed' ORDER BY closed_at DESC LIMIT 100",
      [ctx.principal.schoolId],
    ),
  };
}
