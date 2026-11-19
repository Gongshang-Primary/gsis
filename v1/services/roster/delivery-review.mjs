/* Authoritative v1 Roster delivery-review operations and private WhatsApp report/media routes. */
import { ApiError, requireValue } from "../../runtime/errors.mjs";
import { digest, one, query } from "../../runtime/store.mjs";
import { localDate } from "./repository.mjs";

const NOTIFICATION_FILTER =
  "(type IN ('roster-notification','roster-inbox-reply') OR json_extract(payload_json,'$.channel')='whatsapp' OR json_extract(payload_json,'$.provider')='whatsapp')";

const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_AUDIO_MIMES = new Set([
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/amr",
  "audio/opus",
  "audio/webm",
]);
const INBOX_IMAGE_LIMIT = 5 * 1024 * 1024;
const INBOX_AUDIO_LIMIT = 16 * 1024 * 1024;
const MAX_BATCH_ITEMS = 2000;

function sanitizeText(value, limit = 100) {
  return String(value ?? "")
    .replace(/https?:\/\/\S+|[A-Za-z0-9_-]{32,}/gi, "[redacted]")
    .replace(/[\r\n\t\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, limit);
}

function validCalendarDate(value) {
  if (!/^20\d\d-\d\d-\d\d$/.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function parseJsonSafe(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function rowServiceDate(row, payload) {
  if (validCalendarDate(payload.date)) return payload.date;
  const ts = Number(row.updated_at || row.due_at || 0);
  if (Number.isFinite(ts) && ts > 0) return localDate(ts);
  return "";
}

function rowMetaCode(row) {
  const match = /^META_(\d{1,9})$/.exec(String(row.last_code || ""));
  return match ? Number(match[1]) : null;
}

async function sha256BytesHex(bytes) {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function rowFingerprint(row) {
  return digest([
    row.job_id,
    row.state,
    row.last_code || "",
    Number(row.attempts) || 0,
    Number(row.fence) || 0,
    row.provider_id || "",
    Number(row.updated_at) || 0,
  ]);
}

async function issueToken(issue) {
  const { at: _at, token: _token, reportStatus: _rs, ...material } = issue;
  return digest(material);
}

async function pendingToken(row, fp) {
  return digest([
    "pending",
    fp,
    row.job_id,
    row.state,
    Number(row.fence) || 0,
    Number(row.updated_at) || 0,
  ]);
}

function describeIssue(row, code) {
  if (row.state === "uncertain") {
    return {
      cause: "The provider outcome could not be confirmed.",
      action:
        "Check delivery before resending to avoid duplicate messages; contact the teacher directly if urgent.",
    };
  }
  return {
    cause: code
      ? `Meta reported error ${code}.`
      : "The notification could not be delivered.",
    action:
      code === 132000
        ? "Check the approved template parameter count, then retry the affected notification."
        : "Check the affected recipient and delivery result; contact the teacher directly if urgent.",
  };
}

function formatSgtClock(value) {
  const stamp =
    typeof value === "number" ? value : Date.parse(String(value || ""));
  if (!Number.isFinite(stamp)) return sanitizeText(value, 40);
  return (
    new Date(stamp + 8 * 3600 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19) + " SGT"
  );
}

function renderReportText(issues, observedAt, date) {
  const lines = [
    `WhatsApp delivery review — ${date}`,
    `Captured: ${formatSgtClock(observedAt)}`,
    "Scheduled report: 08:00 Asia/Singapore.",
    `Delivery issues: ${issues.length}; configuration issues: 0; monitoring issues: 0.`,
    "",
  ];
  if (issues.length) {
    lines.push("Delivery");
    for (const issue of issues) {
      lines.push(
        `- ${[issue.name, issue.date, issue.kind, `record ${issue.record}`].filter(Boolean).join(" | ")} — ${issue.status}`,
      );
      lines.push(`  ${issue.cause}`);
      if (issue.at) lines.push(`  Last recorded: ${formatSgtClock(issue.at)}`);
      lines.push(`  Next action: ${issue.action}`);
    }
    lines.push("");
  }
  lines.push(
    "These diagnostics do not include private timetable links or access tokens. An unchecked route is not evidence of failure or success.",
  );
  if (!issues.length) {
    lines.push("No new delivery issues were present at capture.");
  }
  lines.push(
    "Archiving these issues does not establish successful WhatsApp delivery. New or changed issues after capture are retained for the next report.",
  );
  return lines.join("\n") + "\n";
}

function isAdminPrincipal(principal) {
  const caps = Array.isArray(principal?.capabilities)
    ? principal.capabilities
    : [];
  return caps.includes("admin") || caps.includes("roster.admin");
}

async function loadReviewData(db, schoolId) {
  const [outboxRows, receiptRows, reportRows, scopeRow] = await Promise.all([
    query(
      db,
      `SELECT job_id, operation_id, type, payload_json, state, due_at, attempts, fence, lease_until, provider_id, last_code, updated_at
       FROM product_outbox
       WHERE school_id=? AND ${NOTIFICATION_FILTER}
       ORDER BY updated_at DESC, job_id ASC
       LIMIT 2000`,
      [schoolId],
    ),
    query(
      db,
      "SELECT record_id, revision, payload_json FROM roster_records WHERE school_id=? AND collection='deliveryReviewReceipts'",
      [schoolId],
    ),
    query(
      db,
      "SELECT record_id, revision, payload_json FROM roster_records WHERE school_id=? AND collection='deliveryReviewReports' ORDER BY record_id DESC LIMIT 90",
      [schoolId],
    ),
    one(
      db,
      "SELECT revision FROM roster_scopes WHERE school_id=? AND scope='deliveryReview'",
      [schoolId],
    ),
  ]);
  const receipts = new Map();
  for (const row of receiptRows) {
    receipts.set(row.record_id, {
      revision: row.revision,
      data: parseJsonSafe(row.payload_json),
    });
  }
  const archivedReports = new Map();
  for (const row of reportRows) {
    const data = parseJsonSafe(row.payload_json);
    if (validCalendarDate(row.record_id) && data.status === "done") {
      archivedReports.set(row.record_id, data);
    }
  }
  return {
    outboxRows,
    receipts,
    archivedReports,
    revision: Number(scopeRow?.revision) || 0,
  };
}

async function buildIssueEntry(row, payload, fp) {
  const code = rowMetaCode(row);
  const { cause, action } = describeIssue(row, code);
  const id = `notification:${row.job_id}`;
  const recordHash = (await digest(row.job_id)).slice(0, 12);
  const kind = sanitizeText(
    payload.kind ||
      payload.template ||
      (row.type === "roster-inbox-reply" ? "inbox_reply" : "notification"),
  );
  const name =
    sanitizeText(
      payload.name || payload.teacherName || payload.staffName || payload.staffId,
    ) || "Teacher";
  const date = rowServiceDate(row, payload);
  const at = Number(row.updated_at)
    ? new Date(Number(row.updated_at)).toISOString()
    : "";
  const base = {
    id,
    group: "delivery",
    deliveryFingerprint: fp,
    status: row.state,
    code,
    kind,
    date,
    name,
    record: recordHash,
    at,
    cause,
    action,
    reportStatus: "Waiting for 08:00 report",
  };
  const token = await issueToken(base);
  return { ...base, token };
}

export async function buildDeliveryReviewView(ctx) {
  const schoolId = ctx.principal.schoolId;
  const admin = isAdminPrincipal(ctx.principal);
  const { outboxRows, receipts, archivedReports, revision } =
    await loadReviewData(ctx.env.DB, schoolId);

  const issues = [];
  const pending = [];
  const rowByJobId = new Map();
  const fpByJobId = new Map();
  const dateIssueCounts = new Map();
  let inFlight = 0;
  let uncertain = 0;
  let unresolvedUncertain = 0;
  let reviewedUncertain = 0;

  for (const row of outboxRows) {
    const payload = parseJsonSafe(row.payload_json);
    const fp = await rowFingerprint(row);
    rowByJobId.set(row.job_id, row);
    fpByJobId.set(row.job_id, fp);

    if (row.state === "leased") inFlight++;

    const receipt = receipts.get(`notification:${row.job_id}`)?.data;
    const isReviewed =
      receipt?.schema === 1 && receipt.fingerprint === fp;

    if (row.state === "uncertain") {
      uncertain++;
      if (isReviewed) reviewedUncertain++;
      else unresolvedUncertain++;
    }

    if (row.state === "failed" || row.state === "uncertain") {
      const date = rowServiceDate(row, payload);
      if (date) dateIssueCounts.set(date, (dateIssueCounts.get(date) || 0) + 1);
      if (!isReviewed) {
        issues.push(await buildIssueEntry(row, payload, fp));
      }
    }

    if (admin && row.state === "queued") {
      pending.push({
        id: row.job_id,
        token: await pendingToken(row, fp),
        name:
          sanitizeText(
            payload.name ||
              payload.teacherName ||
              payload.staffName ||
              payload.staffId,
          ) || "Teacher",
        date: rowServiceDate(row, payload),
        kind: sanitizeText(
          payload.kind ||
            payload.template ||
            (row.type === "roster-inbox-reply" ? "inbox_reply" : "notification"),
        ),
        status: row.state,
      });
    }
  }

  issues.sort((a, b) => a.id.localeCompare(b.id));
  pending.sort((a, b) => a.id.localeCompare(b.id));

  const reportDates = new Map();
  for (const [date, meta] of archivedReports.entries()) {
    reportDates.set(date, Number(meta.count) || 0);
  }
  for (const [date, count] of dateIssueCounts.entries()) {
    if (!reportDates.has(date)) reportDates.set(date, count);
  }
  const reports = [...reportDates.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 90)
    .map(([date, count]) => ({
      date,
      count,
      url: `/api/whatsapp/reports/${date}`,
    }));

  return {
    view: {
      checkedAt: new Date(ctx.now).toISOString(),
      revision,
      issues,
      pending,
      canCancel: admin,
      inFlight,
      uncertain,
      unresolvedUncertain,
      reviewedUncertain,
      queuedReportEmails: 0,
      inFlightReportEmails: 0,
      messagesSent: 0,
      reports,
    },
    rowByJobId,
    fpByJobId,
    receipts,
  };
}

function validateSelectionItems(items) {
  requireValue(
    Array.isArray(items) && items.length > 0 && items.length <= MAX_BATCH_ITEMS,
    "DELIVERY_REVIEW_ITEMS_INVALID",
    400,
    "Refresh the preview before continuing.",
  );
  const seen = new Set();
  for (const item of items) {
    requireValue(
      item &&
        typeof item.id === "string" &&
        item.id.length > 0 &&
        item.id.length <= 300 &&
        typeof item.token === "string" &&
        /^[a-f0-9]{64}$/.test(item.token),
      "DELIVERY_REVIEW_ITEMS_INVALID",
      400,
      "Refresh the preview before continuing.",
    );
    requireValue(
      !seen.has(item.id),
      "DELIVERY_REVIEW_DUPLICATE_ITEM",
      400,
      "A preview item was repeated.",
    );
    seen.add(item.id);
  }
}

export async function handleDeliveryReviewOperation(
  ctx,
  opName,
  { prepared, commit },
) {
  if (opName === "deliveryReview") {
    const { view } = await buildDeliveryReviewView(ctx);
    return view;
  }

  validateSelectionItems(ctx.body.items);

  if (opName === "cancelPendingNotifications") {
    requireValue(
      isAdminPrincipal(ctx.principal),
      "CAPABILITY_DENIED",
      403,
      "Only Admin can cancel pending notifications.",
    );
  }

  const intent = {
    operation: opName,
    items: ctx.body.items.map((item) => ({ id: item.id, token: item.token })),
  };
  const op = await prepared(ctx, `roster.${opName}`, intent);
  if (op.receipt) {
    const latest = await buildDeliveryReviewView(ctx);
    return {
      ...latest.view,
      ...op.receipt.result,
      receipt: op.receipt,
    };
  }

  const schoolId = ctx.principal.schoolId;
  const current = await buildDeliveryReviewView(ctx);
  const candidates = new Map(
    (opName === "dismissDeliveryIssues"
      ? current.view.issues
      : current.view.pending
    ).map((row) => [row.id, row]),
  );

  for (const item of ctx.body.items) {
    const matched = candidates.get(item.id);
    requireValue(
      matched && matched.token === item.token,
      "DELIVERY_REVIEW_CONFLICT",
      409,
      "Delivery records changed. Refresh and review the current items before continuing.",
    );
  }

  const guards = [];
  const writes = [];
  const iso = new Date(ctx.now).toISOString();

  if (opName === "dismissDeliveryIssues") {
    for (const item of ctx.body.items) {
      const selected = candidates.get(item.id);
      const jobId = item.id.startsWith("notification:")
        ? item.id.slice("notification:".length)
        : item.id;
      const row = current.rowByJobId.get(jobId);
      requireValue(
        row && current.fpByJobId.get(jobId) === selected.deliveryFingerprint,
        "DELIVERY_REVIEW_CONFLICT",
        409,
        "This notification has a newer attempt. Refresh before clearing its alert.",
      );
      guards.push({
        sql: "SELECT (state=? AND attempts=? AND fence=? AND updated_at=? AND COALESCE(last_code,'')=? AND COALESCE(provider_id,'')=?) AS ok FROM product_outbox WHERE school_id=? AND job_id=?",
        args: [
          row.state,
          Number(row.attempts) || 0,
          Number(row.fence) || 0,
          Number(row.updated_at) || 0,
          row.last_code || "",
          row.provider_id || "",
          schoolId,
          jobId,
        ],
      });
      const receiptPayload = JSON.stringify({
        schema: 1,
        fingerprint: selected.deliveryFingerprint,
        reviewedAt: iso,
        reviewedBy: ctx.principal.actorId,
        reason:
          "Manually reviewed in Daily Notify; not evidence of delivery",
      });
      writes.push({
        sql: "INSERT INTO roster_records(school_id,collection,record_id,service_date,staff_id,year,revision,payload_json) VALUES(?,'deliveryReviewReceipts',?,?,NULL,?,1,?) ON CONFLICT(school_id,collection,record_id) DO UPDATE SET revision=revision+1,service_date=excluded.service_date,year=excluded.year,payload_json=excluded.payload_json",
        args: [
          schoolId,
          item.id,
          selected.date || null,
          selected.date ? selected.date.slice(0, 4) : null,
          receiptPayload,
        ],
      });
    }
  } else {
    for (const item of ctx.body.items) {
      const row = current.rowByJobId.get(item.id);
      requireValue(
        row && row.state === "queued",
        "DELIVERY_REVIEW_CONFLICT",
        409,
        "Only queued, unsubmitted notifications can be cancelled. Refresh the preview.",
      );
      guards.push({
        sql: "SELECT (state='queued' AND fence=? AND updated_at=?) AS ok FROM product_outbox WHERE school_id=? AND job_id=?",
        args: [
          Number(row.fence) || 0,
          Number(row.updated_at) || 0,
          schoolId,
          row.job_id,
        ],
      });
      writes.push({
        sql: "UPDATE product_outbox SET state='cancelled', last_code='CANCELLED_BY_SMC', updated_at=? WHERE school_id=? AND job_id=? AND state='queued' AND fence=?",
        args: [ctx.now, schoolId, row.job_id, Number(row.fence) || 0],
      });
    }
  }

  writes.push({
    sql: "INSERT INTO roster_scopes(school_id,scope,revision) VALUES(?,'deliveryReview',1) ON CONFLICT(school_id,scope) DO UPDATE SET revision=revision+1",
    args: [schoolId],
  });

  const summary = {
    changed: ctx.body.items.length,
    cancelledReportEmails: 0,
    action: opName,
    messagesSent: 0,
  };
  const committed = await commit(ctx, op, {
    guards,
    writes,
    result: summary,
    audit: {
      action: opName,
      itemIds: ctx.body.items.map((item) => item.id),
      count: ctx.body.items.length,
    },
  });
  const after = await buildDeliveryReviewView(ctx);
  return {
    ...after.view,
    ...summary,
    receipt: committed.receipt,
  };
}

function assertSameOriginRead(ctx) {
  if (ctx.method !== "GET" && ctx.method !== "HEAD") {
    throw new ApiError("METHOD_NOT_ALLOWED", 405, "GET or HEAD required.");
  }
  const secFetchSite = ctx.request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    throw new ApiError("ORIGIN_DENIED", 403, "Same-origin access required.");
  }
}

export async function handleWhatsappReportRoute(ctx) {
  assertSameOriginRead(ctx);
  const date = ctx.path.slice("/whatsapp/reports/".length);
  requireValue(
    validCalendarDate(date),
    "INVALID_REPORT_DATE",
    400,
    "Invalid report date.",
  );

  const schoolId = ctx.principal.schoolId;
  const archivedRow = await one(
    ctx.env.DB,
    "SELECT payload_json FROM roster_records WHERE school_id=? AND collection='deliveryReviewReports' AND record_id=?",
    [schoolId, date],
  );
  let text = null;
  if (archivedRow) {
    const meta = parseJsonSafe(archivedRow.payload_json);
    requireValue(
      meta.status === "done" &&
        typeof meta.objectKey === "string" &&
        meta.objectKey.startsWith(`schools/${schoolId}/`) &&
        !meta.objectKey.includes(".."),
      "REPORT_UNAVAILABLE",
      404,
      "This report is unavailable.",
    );
    const object = await ctx.env.ARTIFACTS?.get(meta.objectKey);
    if (!object) {
      throw new ApiError(
        "REPORT_UNAVAILABLE",
        503,
        "The archived report is unavailable.",
      );
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    const actualDigest = await sha256BytesHex(bytes);
    if (meta.contentDigest && actualDigest !== meta.contentDigest) {
      throw new ApiError(
        "REPORT_INTEGRITY_FAILED",
        503,
        "Report integrity verification failed.",
      );
    }
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } else {
    const rows = await query(
      ctx.env.DB,
      `SELECT job_id, operation_id, type, payload_json, state, due_at, attempts, fence, lease_until, provider_id, last_code, updated_at
       FROM product_outbox
       WHERE school_id=? AND state IN ('failed','uncertain') AND ${NOTIFICATION_FILTER}
       ORDER BY updated_at DESC, job_id ASC
       LIMIT 2000`,
      [schoolId],
    );
    const matchingIssues = [];
    for (const row of rows) {
      const payload = parseJsonSafe(row.payload_json);
      if (rowServiceDate(row, payload) !== date) continue;
      const fp = await rowFingerprint(row);
      matchingIssues.push(await buildIssueEntry(row, payload, fp));
    }
    requireValue(
      matchingIssues.length > 0,
      "REPORT_NOT_FOUND",
      404,
      "This report is unavailable.",
    );
    matchingIssues.sort((a, b) => a.id.localeCompare(b.id));
    text = renderReportText(matchingIssues, ctx.now, date);
  }

  return new Response(ctx.method === "HEAD" ? null : text, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="gsis-delivery-review-${date}.txt"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function normalizeAllowedMime(rawMime, kind) {
  const clean = String(rawMime || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (kind === "image") {
    return ALLOWED_IMAGE_MIMES.has(clean) ? clean : null;
  }
  return ALLOWED_AUDIO_MIMES.has(clean) ? clean : null;
}

function validSchoolMediaKey(schoolId, key) {
  if (typeof key !== "string" || !key || key.length > 300) return false;
  if (key.includes("..") || key.includes("\\")) return false;
  const prefix = `schools/${schoolId}/inbox-media/`;
  if (!key.startsWith(prefix)) return false;
  const rest = key.slice(prefix.length);
  return /^[A-Za-z0-9._/-]{1,200}$/.test(rest) && !rest.startsWith("/");
}

function parseByteRange(rangeHeader, totalSize) {
  if (!rangeHeader) return { partial: false, offset: 0, length: totalSize };
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) return { invalid: true };
  let offset;
  let length;
  if (match[1]) {
    offset = Number(match[1]);
    const end = match[2]
      ? Math.min(Number(match[2]), totalSize - 1)
      : totalSize - 1;
    length = end - offset + 1;
  } else {
    length = Math.min(Number(match[2]), totalSize);
    offset = totalSize - length;
  }
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    offset >= totalSize ||
    length <= 0
  ) {
    return { invalid: true };
  }
  return { partial: true, offset, length };
}

export async function handleWhatsappMediaRoute(ctx) {
  assertSameOriginRead(ctx);
  const rawMessageId = ctx.path.slice("/whatsapp/media/".length);
  let messageId;
  try {
    messageId = decodeURIComponent(rawMessageId);
  } catch {
    throw new ApiError("INVALID_MEDIA_REQUEST", 400, "Invalid message.");
  }
  const url = new URL(ctx.request.url);
  const waId = url.searchParams.get("waId") || url.searchParams.get("threadId");
  requireValue(
    messageId &&
      messageId.length <= 300 &&
      !/[\u0000-\u001f\u007f]/.test(messageId) &&
      !messageId.includes("..") &&
      (!waId || /^\d{8,15}$/.test(waId)),
    "INVALID_MEDIA_REQUEST",
    400,
    "Invalid message.",
  );

  const schoolId = ctx.principal.schoolId;
  const row = await one(
    ctx.env.DB,
    "SELECT message_id, payload_json FROM roster_inbox WHERE school_id=? AND message_id=?",
    [schoolId, messageId],
  );
  requireValue(
    row,
    "MEDIA_NOT_FOUND",
    404,
    "Attachment is currently unavailable.",
  );

  const payload = parseJsonSafe(row.payload_json);
  const storedWaId = String(payload.waId || payload.from || "").replace(
    /\D/g,
    "",
  );
  if (waId && storedWaId && storedWaId !== waId) {
    throw new ApiError(
      "MEDIA_NOT_FOUND",
      404,
      "Attachment is currently unavailable.",
    );
  }

  const descriptor =
    payload.image && typeof payload.image === "object"
      ? { ...payload.image, _kind: "image" }
      : payload.audio && typeof payload.audio === "object"
        ? { ...payload.audio, _kind: "audio" }
        : payload.media && typeof payload.media === "object"
          ? {
              ...payload.media,
              _kind:
                payload.type === "image" ||
                String(payload.media.mimeType || "").startsWith("image/")
                  ? "image"
                  : "audio",
            }
          : null;
  requireValue(
    descriptor && validSchoolMediaKey(schoolId, descriptor.objectKey),
    "MEDIA_NOT_FOUND",
    404,
    "Attachment is currently unavailable. Its message record is retained.",
  );

  const kind = descriptor._kind;
  const mime = normalizeAllowedMime(descriptor.mimeType, kind);
  requireValue(
    mime,
    "MEDIA_TYPE_INVALID",
    415,
    "Unsupported attachment media type.",
  );
  if (!ctx.env.ARTIFACTS?.head || !ctx.env.ARTIFACTS?.get) {
    throw new ApiError(
      "MEDIA_STORAGE_UNAVAILABLE",
      503,
      "Attachment storage is not configured. The message record is retained.",
    );
  }

  const head = await ctx.env.ARTIFACTS.head(descriptor.objectKey);
  requireValue(
    head,
    "MEDIA_NOT_FOUND",
    404,
    "Attachment is currently unavailable.",
  );
  const maxBytes = kind === "image" ? INBOX_IMAGE_LIMIT : INBOX_AUDIO_LIMIT;
  requireValue(
    head.size >= 1 && head.size <= maxBytes,
    "MEDIA_SIZE_INVALID",
    503,
    "Invalid stored attachment.",
  );

  const range = parseByteRange(ctx.request.headers.get("range"), head.size);
  if (range.invalid) {
    return new Response(null, {
      status: 416,
      headers: {
        "content-range": `bytes */${head.size}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  const headers = {
    "content-type": mime,
    "content-length": String(range.length),
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "same-origin",
    "content-security-policy": "sandbox",
    "content-disposition": "inline",
  };
  if (range.partial) {
    headers["content-range"] =
      `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`;
  }
  if (ctx.method === "HEAD") {
    return new Response(null, {
      status: range.partial ? 206 : 200,
      headers,
    });
  }

  const object = await ctx.env.ARTIFACTS.get(
    descriptor.objectKey,
    range.partial ? { range: { offset: range.offset, length: range.length } } : undefined,
  );
  requireValue(
    object,
    "MEDIA_NOT_FOUND",
    404,
    "Attachment is currently unavailable.",
  );

  if (!range.partial && typeof descriptor.sha256 === "string" && /^[a-f0-9]{64}$/i.test(descriptor.sha256)) {
    const bytes = new Uint8Array(await object.arrayBuffer());
    const actual = await sha256BytesHex(bytes);
    if (actual !== descriptor.sha256.toLowerCase()) {
      throw new ApiError(
        "MEDIA_INTEGRITY_FAILED",
        503,
        "Attachment integrity verification failed.",
      );
    }
    return new Response(bytes, { status: 200, headers });
  }

  return new Response(object.body, {
    status: range.partial ? 206 : 200,
    headers,
  });
}
