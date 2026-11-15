/** Google archive transport. Callers persist generated identities before any write. */
import { ApiError, requireValue } from "./errors.mjs";
import { googleAccessToken } from "./providers.mjs";
const MAX_BYTES = 8 * 1024 * 1024;
export async function sha256Bytes(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function request(env, path, init = {}) {
  const token = await googleAccessToken(env, [
    "https://www.googleapis.com/auth/drive.file",
  ]);
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ApiError("DRIVE_BACKUP_TIMEOUT", 503));
    }, 15000);
  });
  try {
    return await Promise.race([
      deadline,
      (async () => {
        const r = await (env.PROVIDER_FETCH || fetch)(
          "https://www.googleapis.com" + path,
          {
            ...init,
            signal: controller.signal,
            headers: { authorization: `Bearer ${token}`, ...init.headers },
          },
        );
        if (!r.ok) {
          await r.body?.cancel();
          return {
            status: r.status,
            headers: r.headers,
            bytes: new Uint8Array(),
          };
        }
        const reader = r.body?.getReader(),
          parts = [];
        let size = 0;
        try {
          if (reader)
            while (true) {
              const v = await reader.read();
              if (v.done) break;
              size += v.value.length;
              requireValue(size <= MAX_BYTES, "DRIVE_BACKUP_BOUNDS", 413);
              parts.push(v.value);
            }
        } finally {
          await reader?.cancel();
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const p of parts) {
          bytes.set(p, offset);
          offset += p.length;
        }
        return { status: r.status, headers: r.headers, bytes };
      })(),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const parse = (r) => JSON.parse(new TextDecoder().decode(r.bytes));
const id = (x) => {
  requireValue(
    typeof x === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(x),
    "DRIVE_BACKUP_ID",
    400,
  );
  return encodeURIComponent(x);
};
export async function allocateDriveFileId(env) {
  const r = await request(
    env,
    "/drive/v3/files/generateIds?count=1&space=drive&type=files",
  );
  requireValue(r.status === 200, "DRIVE_ID_UNAVAILABLE", 503);
  const value = parse(r).ids?.[0];
  id(value);
  return value;
}
export async function verifyDriveFolder(env, { folderId, parentId }) {
  const r = await request(
    env,
    `/drive/v3/files/${id(folderId)}?supportsAllDrives=true&fields=id,mimeType,parents,trashed`,
  );
  requireValue(r.status === 200, "DRIVE_FOLDER_UNAVAILABLE", 503);
  const data = parse(r);
  requireValue(
    !data.trashed &&
      data.mimeType === "application/vnd.google-apps.folder" &&
      data.parents?.includes(parentId),
    "DRIVE_FOLDER_SCOPE",
    409,
  );
}
export async function verifyDriveFile(env, { fileId, folderId, sha256, size }) {
  requireValue(
    Number.isSafeInteger(size) &&
      size >= 0 &&
      size <= MAX_BYTES &&
      /^[a-f0-9]{64}$/.test(sha256),
    "DRIVE_BACKUP_BOUNDS",
    413,
  );
  const meta = await request(
    env,
    `/drive/v3/files/${id(fileId)}?supportsAllDrives=true&fields=id,name,size,parents,trashed`,
  );
  if (meta.status === 404) throw new ApiError("DRIVE_BACKUP_MISSING", 404);
  requireValue(meta.status === 200, "DRIVE_BACKUP_UNAVAILABLE", 503);
  const data = parse(meta);
  requireValue(
    !data.trashed && data.id === fileId && data.parents?.includes(folderId),
    "DRIVE_BACKUP_SCOPE",
    409,
  );
  requireValue(Number(data.size) === size, "DRIVE_BACKUP_INTEGRITY", 409);
  const content = await request(
    env,
    `/drive/v3/files/${id(fileId)}?alt=media&supportsAllDrives=true`,
  );
  requireValue(
    content.status === 200 &&
      content.bytes.length === size &&
      (await sha256Bytes(content.bytes)) === sha256,
    "DRIVE_BACKUP_INTEGRITY",
    409,
  );
  return {
    fileId,
    folderId,
    sha256,
    size,
    verifiedAt: Date.now(),
    etag: meta.headers.get("etag"),
  };
}
/** Immutable by default. Daily replacement requires the exact previously verified hash. */
export async function putVerifiedDriveFile(
  env,
  {
    fileId,
    folderId,
    name,
    mimeType,
    bytes,
    replaceSha256 = null,
    replaceSize = null,
  },
) {
  requireValue(
    bytes instanceof Uint8Array && bytes.length <= MAX_BYTES,
    "DRIVE_BACKUP_BOUNDS",
    413,
  );
  requireValue(
    typeof name === "string" && name.length <= 240,
    "DRIVE_BACKUP_NAME",
    400,
  );
  const hash = await sha256Bytes(bytes);
  let exists = false,
    etag = null;
  try {
    return await verifyDriveFile(env, {
      fileId,
      folderId,
      sha256: hash,
      size: bytes.length,
    });
  } catch (error) {
    if (error.code === "DRIVE_BACKUP_INTEGRITY" && replaceSha256) {
      const previous = await verifyDriveFile(env, {
        fileId,
        folderId,
        sha256: replaceSha256,
        size: replaceSize,
      });
      exists = true;
      etag = previous.etag;
      requireValue(etag, "DRIVE_BACKUP_ETAG_REQUIRED", 409);
    } else if (error.code !== "DRIVE_BACKUP_MISSING") throw error;
  }
  const boundary = "gsis_" + crypto.randomUUID().replaceAll("-", "");
  const metadata = exists
    ? { name, mimeType }
    : { id: fileId, name, mimeType, parents: [folderId] };
  const head = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  const payload = new Uint8Array(head.length + bytes.length + tail.length);
  payload.set(head);
  payload.set(bytes, head.length);
  payload.set(tail, head.length + bytes.length);
  const path = exists
    ? `/upload/drive/v3/files/${id(fileId)}?uploadType=multipart&supportsAllDrives=true`
    : "/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true";
  const r = await request(env, path, {
    method: exists ? "PATCH" : "POST",
    headers: {
      "content-type": `multipart/related; boundary=${boundary}`,
      ...(etag ? { "if-match": etag } : {}),
    },
    body: payload,
  });
  requireValue(
    [200, 201, 409].includes(r.status),
    "DRIVE_BACKUP_WRITE_UNCERTAIN",
    503,
  );
  return verifyDriveFile(env, {
    fileId,
    folderId,
    sha256: hash,
    size: bytes.length,
  });
}
export const DRIVE_VIEWPORTS = {
  contacts: "Contacts",
  deploy: "Deploy",
  roster: "Roster",
  calendar: "Calendar",
  lord: "LORD",
  layout: "Layout and Venues",
  venues: "Layout and Venues",
};
export function singaporeDay(now) {
  return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}
export function dailyFileName(day, owner, dataset, extension = "xlsx") {
  requireValue(
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
      DRIVE_VIEWPORTS[owner] &&
      typeof dataset === "string" &&
      dataset.length > 0 &&
      dataset.length <= 180 &&
      !/[\x00-\x1f\x7f]/.test(dataset),
    "DRIVE_BACKUP_NAME",
    400,
  );
  const [y, m, d] = day.split("-"),
    months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
  return `${y} ${m}${months[Number(m) - 1]} ${d} — ${owner} — ${dataset}.${extension}`;
}
export function freshnessStatus({
  sourceDigest,
  verifiedDigest,
  remoteVerified,
  pending = false,
  error = null,
}) {
  if (error) return error === "DRIVE_BACKUP_MISSING" ? "missing" : "failed";
  if (!verifiedDigest) return "never-backed-up";
  if (pending) return "pending";
  return sourceDigest === verifiedDigest && remoteVerified
    ? "current"
    : "stale";
}

export const DEFAULT_DRIVE_ROOT = "1HJDMM-_88cuKwL7-HyQO08pgeAdEtb3k";
export function driveBackupConfig(env) {
  const enabled = env.DRIVE_BACKUP_ENABLED === "true";
  let folders = {};
  try {
    folders = JSON.parse(env.DRIVE_BACKUP_FOLDERS_JSON || "{}");
  } catch {
    return {
      enabled,
      configured: false,
      reason: "INVALID_FOLDER_CONFIGURATION",
    };
  }
  if (!folders || typeof folders !== "object" || Array.isArray(folders))
    return {
      enabled,
      configured: false,
      reason: "INVALID_FOLDER_CONFIGURATION",
    };
  const rootId = env.DRIVE_BACKUP_ROOT_ID || DEFAULT_DRIVE_ROOT;
  const folderId =
    folders[env.SERVICE_NAME] ||
    (["layout", "venues"].includes(env.SERVICE_NAME)
      ? folders.layoutAndVenues
      : null);
  const valid = (x) =>
    typeof x === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(x);
  const reason = !DRIVE_VIEWPORTS[env.SERVICE_NAME]
    ? "NO_VIEWPORT"
    : !valid(rootId) || !valid(folderId)
      ? "FOLDER_NOT_CONFIGURED"
      : !(env.GOOGLE_SERVICE_ACCOUNT || env.GOOGLE_ACCESS_TOKEN)
        ? "PROVIDER_NOT_CONFIGURED"
        : null;
  return {
    enabled,
    configured: !reason,
    reason,
    rootId,
    folderId,
    folderName: DRIVE_VIEWPORTS[env.SERVICE_NAME],
  };
}
