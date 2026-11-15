import { ApiError, readJson } from "../../runtime/errors.mjs";
import { one } from "../../runtime/store.mjs";
import { googleAccessToken } from "../../runtime/providers.mjs";
const need = (x, code, message, status = 409) => {
  if (!x) throw new ApiError(code, status, message);
};
export async function calendarTarget(env, target) {
  need(
    ["staff", "parent"].includes(target),
    "INVALID_TARGET",
    "Choose staff or parent calendar.",
    400,
  );
  const row = env.DB
    ? await one(
        env.DB,
        "SELECT data_json FROM calendar_metadata WHERE school_id=? AND kind='settings' AND record_id='urls'",
        [env.SCHOOL_ID],
      )
    : null;
  const value = row ? JSON.parse(row.data_json) : {};
  const id =
    value[target + "CalendarId"] ||
    (target === "parent"
      ? env.GOOGLE_PARENT_CALENDAR_ID
      : env.GOOGLE_STAFF_CALENDAR_ID);
  need(
    typeof id === "string" && id.length > 0,
    "PROVIDER_NOT_CONFIGURED",
    "Configure the selected Google Calendar.",
    503,
  );
  return id;
}
async function get(env, path, maxBytes = 2097152) {
  const token = await googleAccessToken(env, [
      "https://www.googleapis.com/auth/calendar.events",
    ]),
    controller = new AbortController();
  let timeout;
  try {
    return await Promise.race([
      (async () => {
        const response = await (env.PROVIDER_FETCH || fetch)(
          "https://www.googleapis.com/calendar/v3/" + path,
          {
            headers: { authorization: `Bearer ${token}` },
            signal: controller.signal,
          },
        );
        const data = response.ok
          ? await readJson(
              new Request("https://bounded.invalid", {
                method: "POST",
                body: response.body,
                duplex: "half",
              }),
              maxBytes,
            )
          : null;
        if (!response.ok) await response.body?.cancel();
        return { ok: response.ok, status: response.status, data };
      })(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("Provider read deadline"));
        }, 8000);
      }),
    ]);
  } catch {
    throw new ApiError(
      "PROVIDER_READ_UNAVAILABLE",
      503,
      "Google Calendar observation could not be confirmed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
export async function readCalendarEvent(env, calendarId, eventId) {
  const response = await get(
    env,
    `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
  );
  if ([404, 410].includes(response.status)) return { state: "absent" };
  need(
    response.ok,
    "PROVIDER_READ_UNAVAILABLE",
    "Google Calendar observation could not be confirmed.",
    503,
  );
  return {
    state: "present",
    event: response.data,
  };
}
export async function listCalendarYear(env, target, year) {
  const calendarId = await calendarTarget(env, target),
    events = [],
    started = Date.now();
  let token;
  do {
    need(
      Date.now() - started < 25000,
      "PROVIDER_READ_INCOMPLETE",
      "Calendar preview exceeded its time bound; narrow the year.",
      503,
    );
    const query = new URLSearchParams({
      timeMin: `${year}-01-01T00:00:00+08:00`,
      timeMax: `${year + 1}-01-01T00:00:00+08:00`,
      maxResults: "250",
      showDeleted: "false",
      singleEvents: "false",
      fields: "items(id,etag,summary,start),nextPageToken",
    });
    if (token) query.set("pageToken", token);
    const response = await get(
      env,
      `calendars/${encodeURIComponent(calendarId)}/events?${query}`,
    );
    need(
      response.ok,
      "PROVIDER_READ_UNAVAILABLE",
      "Google Calendar preview could not be verified.",
      503,
    );
    const body = response.data;
    need(
      Array.isArray(body.items),
      "PROVIDER_READ_INVALID",
      "Calendar response is malformed.",
      503,
    );
    for (const e of body.items) {
      need(
        typeof e.id === "string" && typeof e.etag === "string",
        "PROVIDER_READ_INVALID",
        "Calendar event identity is missing.",
        503,
      );
      events.push({
        id: e.id,
        etag: e.etag,
        summary: String(e.summary || "").slice(0, 300),
        start: e.start?.date || e.start?.dateTime || "",
      });
    }
    need(
      events.length <= 5000,
      "BOUNDS_EXCEEDED",
      "External Calendar preview exceeds 5,000 records.",
      413,
    );
    token = body.nextPageToken;
  } while (token);
  return {
    calendarId,
    events: events.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
