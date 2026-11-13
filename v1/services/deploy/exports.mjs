import {
  googleDriveFileId,
  dispatchProvider,
  googleAccessToken,
} from "../../runtime/providers.mjs";
import { one, statement, digest } from "../../runtime/store.mjs";
import { check } from "./validation.mjs";
const quote = (value) => {
  const safe =
    typeof value === "string" && /^[=+@\-\t\r\n]/.test(value)
      ? "'" + value
      : String(value ?? "");
  return '"' + safe.replaceAll('"', '""') + '"';
};
export function readablePublication(document, envelope) {
  const teachers = new Map(document.teachers.map((t) => [t.id, t]));
  const rows = [
    [
      "GSiS Deploy publication",
      envelope.publicationId,
      "School",
      envelope.schoolId,
      "Published at",
      new Date(envelope.publishedAt).toISOString(),
    ],
    ["Version", document.id, "Saved revision", envelope.workingRevision],
    [],
    [
      "Assignment ID",
      "Class or TG",
      "Subject",
      "Staff ID",
      "Teacher",
      "Level",
      "Venue",
    ],
  ];
  for (const a of document.assignments)
    rows.push([
      a.id,
      a.target,
      a.subject,
      a.teacher,
      teachers.get(a.teacher)?.ttbName ||
        teachers.get(a.teacher)?.name ||
        a.teacher,
      a.level,
      a.venue || "",
    ]);
  rows.push(
    [],
    [
      "Staff ID",
      "Teacher",
      "Raw occupancy",
      "Weighted workload Wi",
      "Actual cap-counted work",
      "Weekly budget",
      "Quality",
      "Reason",
    ],
  );
  for (const r of envelope.rows)
    rows.push([
      r.staffId,
      teachers.get(r.staffId)?.ttbName ||
        teachers.get(r.staffId)?.name ||
        r.staffId,
      r.rawTimetabledOccupancy,
      r.Wi,
      r.actualCapCountedWorkload,
      r.weeklyBudget,
      r.quality,
      r.reasons.join("; "),
    ]);
  return rows.map((row) => row.map(quote).join(",")).join("\r\n");
}
/** Provider create uses a durable generated file ID; uncertain outcomes require explicit readback. */
export async function exportDrive(env, job, publication, now) {
  if (env.SEND_OWNER !== "v1")
    return { state: "failed", code: "SENDER_NOT_ACTIVE", retryable: false };
  if (!env.DEPLOY_DRIVE_FOLDER_ID)
    return {
      state: "failed",
      code: "DRIVE_DESTINATION_REQUIRED",
      retryable: false,
    };
  const content = readablePublication(
      publication.document,
      publication.envelope,
    ),
    hash = await digest(content);
  let row = await one(
    env.DB,
    "SELECT * FROM deploy_exports WHERE school_id=? AND publication_id=?",
    [env.SCHOOL_ID, publication.publicationId],
  );
  if (!row) {
    const fileId = await googleDriveFileId(env);
    await statement(
      env.DB,
      "INSERT OR IGNORE INTO deploy_exports(school_id,publication_id,file_id,content_digest,state,updated_at) SELECT ?,?,?,?,'prepared',? WHERE EXISTS(SELECT 1 FROM product_outbox WHERE school_id=? AND job_id=? AND state='leased' AND fence=? AND lease_until>?)",
      [
        env.SCHOOL_ID,
        publication.publicationId,
        fileId,
        hash,
        now,
        env.SCHOOL_ID,
        job.job_id,
        job.fence,
        Date.now(),
      ],
    ).run();
    row = await one(
      env.DB,
      "SELECT * FROM deploy_exports WHERE school_id=? AND publication_id=?",
      [env.SCHOOL_ID, publication.publicationId],
    );
  }
  check(
    row && row.content_digest === hash,
    "Export preparation was not confirmed.",
    "EXPORT_UNCONFIRMED",
    503,
  );
  if (row.state === "delivered")
    return { state: "delivered", providerId: row.file_id };
  if (row.state === "uncertain")
    return {
      state: "uncertain",
      code: "EXPORT_RECONCILIATION_REQUIRED",
      providerId: row.file_id,
    };
  const active = await one(
    env.DB,
    "SELECT 1 AS ok FROM product_outbox WHERE school_id=? AND job_id=? AND state='leased' AND fence=? AND lease_until>?",
    [env.SCHOOL_ID, job.job_id, job.fence, Date.now()],
  );
  check(active, "Export lease expired.", "LEASE_EXPIRED", 409);
  const result = await dispatchProvider(env, {
    provider: "google-drive",
    operation: "upsert",
    generatedFileId: row.file_id,
    folderId: env.DEPLOY_DRIVE_FOLDER_ID,
    name: `GSiS-Deploy-${publication.publicationId}.csv`,
    mimeType: "text/csv",
    content,
  });
  await statement(
    env.DB,
    "UPDATE deploy_exports SET state=?,updated_at=?,last_error=? WHERE school_id=? AND publication_id=?",
    [
      result.state,
      Date.now(),
      result.code || null,
      env.SCHOOL_ID,
      publication.publicationId,
    ],
  ).run();
  return result;
}
export async function reconcileDrive(env, publicationId) {
  const row = await one(
    env.DB,
    "SELECT * FROM deploy_exports WHERE school_id=? AND publication_id=?",
    [env.SCHOOL_ID, publicationId],
  );
  check(row, "Export record was not found.", "NOT_FOUND", 404);
  const token = await googleAccessToken(env, [
    "https://www.googleapis.com/auth/drive.file",
  ]);
  let response;
  try {
    response = await (env.PROVIDER_FETCH ?? fetch)(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(row.file_id)}?alt=media`,
      {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch {
    return { state: "uncertain", code: "EXPORT_READBACK_UNCONFIRMED" };
  }
  if (response.status === 404)
    return {
      state: "uncertain",
      code: "EXPORT_NOT_VISIBLE",
      fileId: row.file_id,
    };
  if (!response.ok)
    return {
      state: "uncertain",
      code: "EXPORT_READBACK_UNCONFIRMED",
      fileId: row.file_id,
    };
  const length = Number(response.headers.get("content-length"));
  check(
    !length || length <= 8 * 1024 * 1024,
    "Export readback exceeds bounds.",
    "PAYLOAD_TOO_LARGE",
    413,
  );
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8 * 1024 * 1024) {
      await reader.cancel();
      check(false, "Export readback exceeds bounds.", "PAYLOAD_TOO_LARGE", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  check(
    (await digest(new TextDecoder().decode(bytes))) === row.content_digest,
    "Drive export differs from the immutable publication.",
    "EXPORT_INTEGRITY",
    409,
  );
  return {
    state: "delivered",
    fileId: row.file_id,
    contentDigest: row.content_digest,
  };
}
