/** Deliberately small public error vocabulary; never serialize exception/provider payloads. */
export class ApiError extends Error {
  constructor(code, status = 400, message = code, details = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryable = details.retryable ?? [409, 429, 503].includes(status);
    this.details = details;
  }
}
export function requireValue(
  condition,
  code = "INVALID_INPUT",
  status = 400,
  message = code,
) {
  if (!condition) throw new ApiError(code, status, message);
}
export function errorResponse(error, requestId) {
  const known = error instanceof ApiError;
  const status = known ? error.status : 503;
  return Response.json(
    {
      ok: false,
      error: {
        code: known ? error.code : "SERVICE_UNAVAILABLE",
        message: known
          ? error.message
          : "The operation could not be confirmed. Check its original operation reference.",
        retryable: known ? error.retryable : true,
        requestId,
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
export function identifier(value, field = "id") {
  requireValue(
    typeof value === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(value),
    "INVALID_INPUT",
    400,
    `Invalid ${field}.`,
  );
  return value;
}
export function finite(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  requireValue(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max,
  );
  return value;
}
export async function readBytes(request, maxBytes = 1048576) {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maxBytes)
    throw new ApiError("PAYLOAD_TOO_LARGE", 413);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError("PAYLOAD_TOO_LARGE", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size === 0) return new Uint8Array();
  const data = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    data.set(c, offset);
    offset += c.length;
  }
  return data;
}
export async function readJson(request, maxBytes = 1048576) {
  const data = await readBytes(request, maxBytes);
  if (data.length === 0) return {};
  try {
    const value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(data),
    );
    requireValue(value && typeof value === "object" && !Array.isArray(value));
    return value;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("INVALID_JSON", 400);
  }
}
