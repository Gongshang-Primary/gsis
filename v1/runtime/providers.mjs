import { ApiError, requireValue, readJson } from "./errors.mjs";
const encoder = new TextEncoder();
export async function secretEquals(expected, provided) {
  if (typeof expected !== "string" || !expected || typeof provided !== "string")
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(expected),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const other = await crypto.subtle.importKey(
    "raw",
    encoder.encode(provided || "\0"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = encoder.encode("gsis-secret-verification/1");
  return crypto.subtle.verify(
    "HMAC",
    key,
    await crypto.subtle.sign("HMAC", other, data),
    data,
  );
}
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
async function fetchProvider(env, url, init = {}) {
  const host = new URL(url).hostname;
  requireValue(
    [
      "oauth2.googleapis.com",
      "www.googleapis.com",
      "graph.facebook.com",
      "api.telegram.org",
      "api.resend.com",
    ].includes(host),
    "PROVIDER_HOST_DENIED",
    500,
  );
  const remaining =
    env.DISPATCH_DEADLINE === undefined
      ? 8000
      : Math.min(8000, env.DISPATCH_DEADLINE - Date.now());
  requireValue(remaining >= 1000, "JOB_LEASE_EXPIRED", 409);
  const controller = new AbortController();
  let rejectTimeout;
  const timeout = new Promise((_, reject) => {
    rejectTimeout = reject;
  });
  const timer = setTimeout(() => {
    controller.abort();
    rejectTimeout(new Error("Provider deadline exceeded"));
  }, remaining);
  let reader;
  try {
    const response = await Promise.race([
      (env.PROVIDER_FETCH ?? fetch)(url, {
        ...init,
        signal: controller.signal,
      }),
      timeout,
    ]);
    if (!response.ok || !response.body) {
      response.body?.cancel().catch(() => {});
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const item = await Promise.race([reader.read(), timeout]);
      if (item.done) break;
      length += item.value.byteLength;
      requireValue(length <= 1048576, "PROVIDER_RESPONSE_TOO_LARGE", 502);
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Response(bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } finally {
    clearTimeout(timer);
    reader?.cancel().catch(() => {});
  }
}
async function jsonResponse(response, maxBytes = 1048576) {
  const data = await readJson(
    new Request("https://bounded.invalid", {
      method: "POST",
      body: response.body,
      duplex: "half",
    }),
    maxBytes,
  );
  return data;
}
export async function googleAccessToken(env, scopes) {
  if (env.GOOGLE_ACCESS_TOKEN) return env.GOOGLE_ACCESS_TOKEN;
  requireValue(env.GOOGLE_SERVICE_ACCOUNT, "GOOGLE_NOT_CONFIGURED", 503);
  let account;
  try {
    account = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
  } catch {
    throw new ApiError("GOOGLE_NOT_CONFIGURED", 503);
  }
  requireValue(
    typeof account.client_email === "string" &&
      typeof account.private_key === "string",
    "GOOGLE_NOT_CONFIGURED",
    503,
  );
  const seconds = Math.floor(Date.now() / 1000),
    header = b64url(
      encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    );
  const body = b64url(
    encoder.encode(
      JSON.stringify({
        iss: account.client_email,
        scope: scopes.join(" "),
        aud: "https://oauth2.googleapis.com/token",
        iat: seconds,
        exp: seconds + 300,
      }),
    ),
  );
  const der = Uint8Array.from(
    atob(account.private_key.replace(/-----[^-]+-----|\s/g, "")),
    (c) => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const unsigned = header + "." + body,
    assertion =
      unsigned +
      "." +
      b64url(
        await crypto.subtle.sign(
          "RSASSA-PKCS1-v1_5",
          key,
          encoder.encode(unsigned),
        ),
      );
  const response = await fetchProvider(
    env,
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    },
  );
  if (!response.ok) throw new ApiError("GOOGLE_AUTH_UNAVAILABLE", 503);
  const result = await jsonResponse(response);
  requireValue(
    typeof result.access_token === "string",
    "GOOGLE_AUTH_UNAVAILABLE",
    503,
  );
  return result.access_token;
}
function configured(value, code) {
  requireValue(typeof value === "string" && value.length > 0, code, 503);
  return value;
}
/** No production tokens are generated or rotated here. Provider callers supply final audience checks. */
export async function dispatchProvider(env, job) {
  if (env.SEND_OWNER !== "v1")
    return { state: "failed", code: "SENDER_NOT_ACTIVE", retryable: false };
  let url,
    init,
    provider = job.provider,
    dispatched = false;
  try {
    if (provider === "whatsapp") {
      configured(env.WHATSAPP_ACCESS_TOKEN, "WHATSAPP_NOT_CONFIGURED");
      configured(env.WHATSAPP_PHONE_NUMBER_ID, "WHATSAPP_NOT_CONFIGURED");
      requireValue(
        /^\d{6,20}$/.test(env.WHATSAPP_PHONE_NUMBER_ID),
        "WHATSAPP_NOT_CONFIGURED",
        503,
      );
      requireValue(
        typeof job.to === "string" && /^\+?\d{8,15}$/.test(job.to),
        "RECIPIENT_INVALID",
      );
      const freeform =
        typeof job.text === "string" &&
        job.text.length > 0 &&
        job.text.length <= 4096 &&
        Number.isSafeInteger(job.recentInboundAt) &&
        job.recentInboundAt <= Date.now() &&
        Date.now() - job.recentInboundAt < 86400000;
      requireValue(
        freeform || (job.template && typeof job.template.name === "string"),
        "TEMPLATE_REQUIRED",
      );
      url = `https://graph.facebook.com/v23.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      init = {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: job.to,
          ...(freeform
            ? { type: "text", text: { body: job.text } }
            : { type: "template", template: job.template }),
        }),
      };
    } else if (provider === "telegram") {
      configured(env.TELEGRAM_BOT_TOKEN, "TELEGRAM_NOT_CONFIGURED");
      requireValue(
        /^[0-9]+:[A-Za-z0-9_-]+$/.test(env.TELEGRAM_BOT_TOKEN),
        "TELEGRAM_NOT_CONFIGURED",
        503,
      );
      requireValue(
        typeof job.chatId === "string" &&
          /^-?[0-9]+$/.test(job.chatId) &&
          typeof job.text === "string" &&
          job.text.length <= 4096,
        "RECIPIENT_INVALID",
      );
      url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
      init = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: job.chatId, text: job.text }),
      };
    } else if (provider === "google-calendar") {
      const token = await googleAccessToken(env, [
        "https://www.googleapis.com/auth/calendar.events",
      ]);
      configured(job.calendarId, "CALENDAR_NOT_CONFIGURED");
      requireValue(
        (job.operation === "delete"
          ? /^[A-Za-z0-9_-]{5,1024}$/
          : /^[a-v0-9]{5,1024}$/
        ).test(job.eventId ?? ""),
        "EVENT_ID_INVALID",
      );
      url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(job.calendarId)}/events/${encodeURIComponent(job.eventId)}`;
      const headers = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      };
      if (job.etag) headers["if-match"] = job.etag;
      if (job.operation === "delete") init = { method: "DELETE", headers };
      else {
        requireValue(
          job.operation === "upsert" &&
            job.event &&
            typeof job.event === "object",
          "INVALID_INPUT",
        );
        init = {
          method: "PUT",
          headers,
          body: JSON.stringify({ ...job.event, id: job.eventId }),
        };
      }
    } else if (provider === "google-drive") {
      const token = await googleAccessToken(env, [
        "https://www.googleapis.com/auth/drive.file",
      ]);
      const content =
        typeof job.content === "string"
          ? encoder.encode(job.content)
          : job.content instanceof ArrayBuffer
            ? new Uint8Array(job.content)
            : job.content;
      requireValue(
        content instanceof Uint8Array && content.length <= 8 * 1024 * 1024,
        "PAYLOAD_TOO_LARGE",
        413,
      );
      requireValue(
        !job.mimeType || /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(job.mimeType),
        "MIME_TYPE_INVALID",
      );
      if (job.fileId) {
        requireValue(/^[A-Za-z0-9_-]+$/.test(job.fileId), "FILE_ID_INVALID");
        url = `https://www.googleapis.com/upload/drive/v3/files/${job.fileId}?uploadType=media`;
        init = {
          method: "PATCH",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": job.mimeType ?? "text/csv",
          },
          body: content,
        };
      } else {
        // Stable generated provider IDs must be saved on the durable job before create, by the owner.
        requireValue(
          /^[A-Za-z0-9_-]+$/.test(job.generatedFileId ?? ""),
          "PROVIDER_ID_REQUIRED",
          409,
        );
        const boundary = "gsis-" + crypto.randomUUID();
        const metadata = {
          id: job.generatedFileId,
          name: job.name ?? "GSiS export",
          parents: job.folderId ? [job.folderId] : undefined,
        };
        const first = encoder.encode(
            `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${job.mimeType ?? "text/csv"}\r\n\r\n`,
          ),
          last = encoder.encode(`\r\n--${boundary}--`),
          multipart = new Uint8Array(
            first.length + content.length + last.length,
          );
        multipart.set(first);
        multipart.set(content, first.length);
        multipart.set(last, first.length + content.length);
        url =
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
        init = {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": `multipart/related; boundary=${boundary}`,
          },
          body: multipart,
        };
      }
    } else if (provider === "email") {
      requireValue(
        env.EMAIL_PROVIDER === "resend",
        "EMAIL_NOT_CONFIGURED",
        503,
      );
      configured(env.EMAIL_API_TOKEN, "EMAIL_NOT_CONFIGURED");
      configured(env.EMAIL_FROM, "EMAIL_NOT_CONFIGURED");
      requireValue(
        typeof job.to === "string" &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.to) &&
          typeof job.subject === "string" &&
          typeof job.text === "string",
        "RECIPIENT_INVALID",
      );
      configured(job.idempotencyKey, "OPERATION_ID_REQUIRED");
      url = "https://api.resend.com/emails";
      init = {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.EMAIL_API_TOKEN}`,
          "content-type": "application/json",
          "idempotency-key": job.idempotencyKey,
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [job.to],
          subject: job.subject,
          text: job.text,
        }),
      };
    } else throw new ApiError("PROVIDER_UNSUPPORTED", 400);
    if (
      env.DISPATCH_DEADLINE !== undefined &&
      env.DISPATCH_DEADLINE - Date.now() < 1000
    )
      return { state: "failed", code: "JOB_LEASE_EXPIRED", retryable: true };
    dispatched = true;
    let response = await fetchProvider(env, url, init);
    if (
      provider === "google-calendar" &&
      job.operation === "upsert" &&
      !job.etag &&
      response.status === 404
    ) {
      response = await fetchProvider(env, url.slice(0, url.lastIndexOf("/")), {
        ...init,
        method: "POST",
      });
      // An ID conflict is not silently accepted; the owner must retrieve and compare durable intent.
    }
    if (
      provider === "google-calendar" &&
      job.operation === "delete" &&
      [404, 410].includes(response.status)
    )
      return { state: "delivered", providerId: job.eventId };
    if (!response.ok)
      return {
        state: response.status >= 500 ? "uncertain" : "failed",
        code: `PROVIDER_HTTP_${response.status}`,
        retryable: response.status === 429,
      };
    if (response.status === 204)
      return { state: "delivered", providerId: job.eventId ?? job.fileId };
    const data = await jsonResponse(response);
    if (provider === "whatsapp") {
      const id = data.messages?.[0]?.id;
      return typeof id === "string"
        ? { state: "accepted", providerId: id }
        : { state: "uncertain", code: "PROVIDER_RECEIPT_MISSING" };
    }
    if (provider === "telegram")
      return data.ok === true && data.result?.message_id
        ? { state: "accepted", providerId: String(data.result.message_id) }
        : { state: "uncertain", code: "PROVIDER_RECEIPT_MISSING" };
    const id = data.id;
    return typeof id === "string"
      ? {
          state: provider === "email" ? "accepted" : "delivered",
          providerId: id,
          etag: data.etag ?? null,
        }
      : { state: "uncertain", code: "PROVIDER_RECEIPT_MISSING" };
  } catch (error) {
    if (error instanceof ApiError && !dispatched)
      return { state: "failed", code: error.code, retryable: error.retryable };
    // A timeout or parse failure after dispatch can mean the provider accepted the operation.
    return {
      state: "uncertain",
      code: "PROVIDER_OUTCOME_UNKNOWN",
      retryable: false,
    };
  }
}
export async function verifyWebhook(env, provider, request, rawBody) {
  requireValue(env.WEBHOOK_OWNER === "v1", "WEBHOOK_NOT_ACTIVE", 409);
  if (provider === "whatsapp") {
    configured(env.WHATSAPP_APP_SECRET, "WEBHOOK_NOT_CONFIGURED");
    const signature = request.headers.get("x-hub-signature-256") ?? "";
    requireValue(
      /^sha256=[a-f0-9]{64}$/.test(signature),
      "WEBHOOK_INVALID",
      401,
    );
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.WHATSAPP_APP_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const bytes = Uint8Array.from(signature.slice(7).match(/../g), (x) =>
      parseInt(x, 16),
    );
    requireValue(
      await crypto.subtle.verify(
        "HMAC",
        key,
        bytes,
        typeof rawBody === "string" ? encoder.encode(rawBody) : rawBody,
      ),
      "WEBHOOK_INVALID",
      401,
    );
  } else if (provider === "telegram")
    requireValue(
      await secretEquals(
        env.TELEGRAM_WEBHOOK_SECRET,
        request.headers.get("x-telegram-bot-api-secret-token"),
      ),
      "WEBHOOK_INVALID",
      401,
    );
  else throw new ApiError("PROVIDER_UNSUPPORTED", 404);
}

export async function googleDriveFileId(env) {
  requireValue(env.SEND_OWNER === "v1", "SENDER_NOT_ACTIVE", 409);
  const token = await googleAccessToken(env, [
    "https://www.googleapis.com/auth/drive.file",
  ]);
  const r = await fetchProvider(
    env,
    "https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files",
    { headers: { authorization: `Bearer ${token}` } },
  );
  requireValue(r.ok, "DRIVE_ID_UNAVAILABLE", 503);
  const data = await jsonResponse(r);
  requireValue(
    Array.isArray(data.ids) &&
      data.ids.length === 1 &&
      /^[A-Za-z0-9_-]+$/.test(data.ids[0]),
    "DRIVE_ID_UNAVAILABLE",
    503,
  );
  return data.ids[0];
}
