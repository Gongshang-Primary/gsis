import {
  googleDriveFileId,
  googleAccessToken,
  dispatchProvider,
} from "../../runtime/providers.mjs";
import {
  one,
  query,
  statement,
  digest,
  canonical,
} from "../../runtime/store.mjs";
import { requireValue } from "../../runtime/errors.mjs";
import { readArtifact, writeArtifact } from "./repository.mjs";
const csvValue = (value) =>
  '"' +
  String(
    typeof value === "string" && /^[=+@\-\t\r\n]/.test(value)
      ? "'" + value
      : (value ?? ""),
  ).replaceAll('"', '""') +
  '"';
export function readableDay(schoolId, value) {
  const rows = [
    [
      "GSiS Roster",
      schoolId,
      "Date",
      value.date,
      "Publication",
      value.publicationId,
    ],
    [
      "Staff ID",
      "Teacher",
      "Period",
      "Start",
      "End",
      "Subject",
      "Class",
      "Venue",
      "Group",
    ],
  ];
  for (const t of value.day.teachers)
    for (const p of value.day.periods) {
      const cell = t.cells[p.period] || ["", "", "", ""];
      rows.push([
        t.staffId,
        t.name,
        p.period,
        p.start || p.startMinutes,
        p.end || p.endMinutes,
        ...cell,
      ]);
    }
  rows.push(
    [],
    [
      "Service Duty ID",
      "Staff ID",
      "Date",
      "Period",
      "Subject",
      "Class",
      "Group",
      "R Charge",
      "Completion",
    ],
  );
  for (const d of value.duties)
    rows.push([
      d.dutyId,
      d.staffId,
      d.date,
      d.period,
      d.subject,
      d.className,
      d.groupName,
      d.charge,
      "Assumed only after frozen end time",
    ]);
  return rows.map((r) => r.map(csvValue).join(",")).join("\r\n");
}
export async function daySource(env, schoolId, publicationId) {
  const row = await one(
    env.DB,
    "SELECT * FROM roster_publications WHERE school_id=? AND publication_id=?",
    [schoolId, publicationId],
  );
  requireValue(row, "PUBLICATION_NOT_FOUND", 404);
  return {
    row,
    value: await readArtifact(
      env.ARTIFACTS,
      row.payload_key,
      row.source_digest,
    ),
  };
}
export async function exportDrive(env, job, now) {
  const { row: source, value } = await daySource(
      env,
      job.school_id,
      job.payload.publicationId,
    ),
    content = readableDay(job.school_id, value),
    hash = await digest(content);
  let row = await one(
    env.DB,
    "SELECT * FROM roster_drive_exports WHERE school_id=? AND publication_id=?",
    [job.school_id, value.publicationId],
  );
  if (!row) {
    const fileId = await googleDriveFileId(env);
    await statement(
      env.DB,
      "INSERT OR IGNORE INTO roster_drive_exports(school_id,publication_id,file_id,content_digest,folder_id,state,updated_at) SELECT ?,?,?,?,?,'prepared',? WHERE EXISTS(SELECT 1 FROM product_outbox WHERE school_id=? AND job_id=? AND state='leased' AND fence=? AND lease_until>?)",
      [
        job.school_id,
        value.publicationId,
        fileId,
        hash,
        job.payload.folderId,
        now,
        job.school_id,
        job.job_id,
        job.fence,
        Date.now(),
      ],
    ).run();
    row = await one(
      env.DB,
      "SELECT * FROM roster_drive_exports WHERE school_id=? AND publication_id=?",
      [job.school_id, value.publicationId],
    );
  }
  requireValue(
    row &&
      row.content_digest === hash &&
      row.folder_id === job.payload.folderId,
    "EXPORT_INTENT_CONFLICT",
    409,
  );
  if (row.state === "delivered")
    return { state: "delivered", providerId: row.file_id };
  if (row.state === "uncertain")
    return {
      state: "uncertain",
      providerId: row.file_id,
      code: "EXPORT_RECONCILIATION_REQUIRED",
    };
  requireValue(
    await one(
      env.DB,
      "SELECT 1 AS ok FROM product_outbox WHERE school_id=? AND job_id=? AND state='leased' AND fence=? AND lease_until>?",
      [job.school_id, job.job_id, job.fence, Date.now()],
    ),
    "LEASE_EXPIRED",
    409,
  );
  const result = await dispatchProvider(env, {
    provider: "google-drive",
    generatedFileId: row.file_id,
    folderId: row.folder_id,
    name:
      "GSiS-Roster-" +
      value.date +
      "-" +
      value.publicationId.replaceAll(":", "-") +
      ".csv",
    mimeType: "text/csv",
    content,
  });
  await statement(
    env.DB,
    "UPDATE roster_drive_exports SET state=?,last_error=?,updated_at=?,last_success_at=CASE WHEN ?='delivered' THEN ? ELSE last_success_at END WHERE school_id=? AND publication_id=?",
    [
      result.state,
      result.code || null,
      now,
      result.state,
      now,
      job.school_id,
      value.publicationId,
    ],
  ).run();
  return result;
}
export async function reconcileDrive(env, schoolId, publicationId) {
  const row = await one(
    env.DB,
    "SELECT * FROM roster_drive_exports WHERE school_id=? AND publication_id=?",
    [schoolId, publicationId],
  );
  requireValue(row, "EXPORT_NOT_FOUND", 404);
  const token = await googleAccessToken(env, [
    "https://www.googleapis.com/auth/drive.file",
  ]);
  let response;
  try {
    response = await (env.PROVIDER_FETCH ?? fetch)(
      "https://www.googleapis.com/drive/v3/files/" +
        encodeURIComponent(row.file_id) +
        "?alt=media",
      {
        headers: { authorization: "Bearer " + token },
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch {
    return { state: "uncertain", code: "EXPORT_READBACK_UNCONFIRMED" };
  }
  if (!response.ok)
    return {
      state: "uncertain",
      code:
        response.status === 404
          ? "EXPORT_NOT_VISIBLE"
          : "EXPORT_READBACK_UNCONFIRMED",
    };
  const reader = response.body.getReader(),
    parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8388608) {
      await reader.cancel();
      requireValue(false, "PAYLOAD_TOO_LARGE", 413);
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  requireValue(
    (await digest(new TextDecoder().decode(bytes))) === row.content_digest,
    "EXPORT_INTEGRITY",
    409,
  );
  return {
    state: "delivered",
    fileId: row.file_id,
    contentDigest: row.content_digest,
  };
}
export async function burrowsPackage(env, job, now) {
  const { row, value } = await daySource(
      env,
      job.school_id,
      job.payload.publicationId,
    ),
    packageValue = {
      schemaVersion: 1,
      format: "gsis-burrows-readiness/1",
      schoolId: job.school_id,
      publicationId: value.publicationId,
      sourceDigest: row.source_digest,
      date: value.date,
      generatedAt: row.created_at,
      periods: value.day.periods,
      teachers: value.day.teachers.map((t) => ({
        staffId: t.staffId,
        name: t.name,
        cells: t.cells,
      })),
      duties: value.duties,
      timetableCSV: readableDay(job.school_id, value),
      staffCSV: [
        ["Staff ID", "Name"],
        ...value.day.teachers.map((t) => [t.staffId, t.name]),
      ]
        .map((r) => r.map(csvValue).join(","))
        .join("\r\n"),
      offlineToolAvailable: false,
      offlineToolStatus:
        "BURROWS application source is not present in this repository; this verified export is the readiness artifact.",
      offlineEditContract: {
        format: "gsis-stapler-commands/1",
        requiresPreview: true,
        basePublicationId: value.publicationId,
        previewPath: "/api/roster/offline/preview",
        confirmPath: "/api/roster/offline/confirm",
      },
    },
    artifact = await writeArtifact(
      env.ARTIFACTS,
      job.school_id,
      "burrows",
      packageValue,
    );
  await statement(
    env.DB,
    "INSERT OR IGNORE INTO roster_exports(school_id,export_id,publication_id,digest,artifact_key,created_at) VALUES(?,?,?,?,?,?)",
    [
      job.school_id,
      job.job_id,
      value.publicationId,
      artifact.digest,
      artifact.key,
      now,
    ],
  ).run();
  return { state: "delivered", providerId: artifact.key };
}
export async function exportsView(env, schoolId) {
  return {
    drive: await query(
      env.DB,
      "SELECT publication_id AS publicationId,file_id AS fileId,content_digest AS contentDigest,state,last_error AS lastError,last_success_at AS lastSuccessAt,updated_at AS updatedAt FROM roster_drive_exports WHERE school_id=? ORDER BY updated_at DESC LIMIT 100",
      [schoolId],
    ),
    burrows: await query(
      env.DB,
      "SELECT export_id AS id,publication_id AS publicationId,digest,created_at AS createdAt FROM roster_exports WHERE school_id=? ORDER BY created_at DESC LIMIT 100",
      [schoolId],
    ),
  };
}
