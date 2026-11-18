import { ApiError } from "../../runtime/errors.mjs";
export const MAX_BATCH = 20,
  MAX_PHOTO_BYTES = 2 * 1024 * 1024,
  REFERENCE_MAX_AGE = 26 * 60 * 60 * 1000;

/** Teacher reminders use the source's fixed five-minute window, not follow-ups. */
export function reminderPhase(payload, type) {
  if (payload?.kind === "collection-reminder") return "collection";
  if (type === "lord.return-reminder" || payload?.reminderPhase === "return" ||
      ["reminder", "overdue"].includes(payload?.kind)) return "return";
  return null;
}
export function remindersEnabled(settings = {}) {
  // Missing configuration preserves the existing scheduler default. Explicit
  // false/legacy zero disables; an invalid enabled value never enables sends.
  return settings.enabled === undefined || settings.enabled === true || settings.enabled === 1;
}
export function reminderEligibility(booking, phase, periods, settings, now, remaining = 0) {
  if (!["collection", "return"].includes(phase) || !Number.isFinite(now))
    return { state: "blocked", reason: "REMINDER_CONTEXT_INVALID" };
  if (!remindersEnabled(settings)) return { state: "suppressed", reason: "REMINDERS_DISABLED" };
  if (booking.status !== (phase === "collection" ? "BOOKED" : "COLLECTED"))
    return { state: "suppressed", reason: "BOOKING_STATE_CHANGED" };
  if (phase === "return" && !(remaining > 0))
    return { state: "suppressed", reason: "NO_REMAINING_CUSTODY" };
  const p = periods?.find(p => Number(p.code) ===
    (phase === "collection" ? booking.start_period : booking.end_period - 1));
  const at = p && Date.parse(booking.service_date + "T" +
    (phase === "collection" ? p.start : p.end) + ":00+08:00");
  if (!Number.isFinite(at)) return { state: "blocked", reason: "PERIOD_TIMINGS_REQUIRED" };
  const window = { from: at - 5 * 60000, to: at,
    key: booking.service_date + ":" + phase + ":" + at };
  if (now < window.from) return { state: "suppressed", reason: "REMINDER_NOT_DUE", window };
  if (now >= window.to) return { state: "suppressed", reason: "REMINDER_WINDOW_EXPIRED", window };
  return { state: "ready", window };
}
export function fail(code, message, status = 400) {
  throw new ApiError(code, status, message, {
    retryable: status === 409 || status === 503,
  });
}
export function id(value, label = "identifier") {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/.test(value)
  )
    fail("INVALID_INPUT", `Invalid ${label}.`);
  return value;
}
export function text(value, label, max = 2000, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail("INVALID_INPUT", `Invalid ${label}.`);
  return value.trim();
}
export function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail("INVALID_INPUT", `Invalid ${label}.`);
  return value;
}
export function day(value) {
  if (
    typeof value !== "string" ||
    !/^20\d{2}-\d{2}-\d{2}$/.test(value) ||
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value
  )
    fail("INVALID_INPUT", "Invalid service date.");
  return value;
}
export function period(value) {
  const n =
    typeof value === "string" ? Number(value.replace(/^P/i, "")) : value;
  return integer(n, 0, 40, "period");
}
export function has(p, capability) {
  return (
    Array.isArray(p?.capabilities) &&
    (p.capabilities.includes("admin") || p.capabilities.includes(capability))
  );
}
export function requireCapability(p, capability, write = false) {
  if (!p || !p.schoolId || !p.actorId || !has(p, capability))
    fail("CAPABILITY_DENIED", "This action is not permitted.", 403);
  if (write && p.impersonating)
    fail("IMPERSONATION_DENIED", "Preview is read-only.", 403);
}
export function requireOwner(p, row) {
  if (
    row.school_id !== p.schoolId ||
    (!has(p, "lord.admin") && row.staff_id !== p.staffId)
  )
    fail(
      "CAPABILITY_DENIED",
      "This booking is outside your permitted scope.",
      403,
    );
}
export function resourceInput(input) {
  return {
    resourceId: id(input.resourceId || input.id, "resource"),
    name: text(input.name, "resource name", 160, true),
    type: text(input.type, "resource type", 80, true),
    capacity: integer(input.capacity ?? 1, 1, 200, "capacity"),
    active: input.active !== false,
    exclusive: input.exclusive !== false,
    bufferPeriods: integer(input.bufferPeriods ?? 1, 0, 4, "buffer"),
    metadata: {
      cart: text(input.metadata?.cart || "", "cart/group", 160),
      stylusOption: input.metadata?.stylusOption === true,
      headphoneOption: input.metadata?.headphoneOption === true,
    },
  };
}
export function bookingGroupInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("INVALID_INPUT", "Invalid cart selection.");
  const cart = text(value.cart, "cart", 160, true);
  if (
    typeof value.revision !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.revision)
  )
    fail("INVALID_INPUT", "Invalid cart revision.");
  if (
    !Array.isArray(value.members) ||
    !value.members.length ||
    value.members.length > 20
  )
    fail(
      "INVALID_INPUT",
      "A cart must contain one to twenty physical resources.",
    );
  const seen = new Set();
  const members = value.members.map((member) => {
    const resourceId = id(member?.resourceId, "cart member");
    if (seen.has(resourceId)) fail("INVALID_INPUT", "Duplicate cart member.");
    seen.add(resourceId);
    return {
      resourceId,
      revision: integer(
        member.revision,
        1,
        Number.MAX_SAFE_INTEGER,
        "member revision",
      ),
      capacity: integer(member.capacity, 1, 200, "member capacity"),
    };
  });
  return { cart, revision: value.revision, members };
}
export function bookingInput(input, p) {
  const staffId = id(
    input.staffId || input.teacherStaffId || p.staffId,
    "staff",
  );
  if (staffId !== p.staffId && !has(p, "lord.admin"))
    fail(
      "CAPABILITY_DENIED",
      "Booking for another staff member requires LORD administrator access.",
      403,
    );
  const start = period(input.startPeriod),
    end = period(input.endPeriod) + 1;
  if (end <= start) fail("INVALID_INPUT", "End period precedes the start.");
  const bookingGroup =
    input.bookingGroup === undefined
      ? null
      : bookingGroupInput(input.bookingGroup);
  if (
    bookingGroup &&
    (input.items !== undefined ||
      input.resourceId !== undefined ||
      (input.resource !== undefined && input.resource !== bookingGroup.cart))
  )
    fail("INVALID_INPUT", "Choose a cart or physical resources, not both.");
  const items = bookingGroup
    ? []
    : input.items || [
        {
          resourceId: input.resourceId || input.resource,
          quantity: input.quantity ?? input.requestedQuantity ?? 1,
        },
      ];
  if (
    !Array.isArray(items) ||
    (!bookingGroup && items.length < 1) ||
    items.length > 20
  )
    fail("INVALID_INPUT", "Choose between one and twenty resources.");
  const seen = new Set();
  const lines = items.map((item) => {
    const resourceId = id(item.resourceId, "resource");
    if (seen.has(resourceId)) fail("INVALID_INPUT", "Duplicate resource.");
    seen.add(resourceId);
    return {
      resourceId,
      quantity: integer(
        typeof item.quantity === "string" && /^\d+$/.test(item.quantity)
          ? Number(item.quantity)
          : item.quantity,
        1,
        200,
        "quantity",
      ),
    };
  });
  const details = {
    classOrActivity: text(
      input.classOrActivity || "",
      "class/activity",
      200,
      true,
    ),
    subject: text(input.subject || "", "subject", 100, true),
    remarks: text(input.remarks || "", "remarks"),
    deviceType: text(input.deviceType || "", "device type", 80),
    headphones: input.headphones === true,
    styluses: input.styluses === true,
    bufferOverrideReason: text(
      input.bufferOverrideReason || input.overrideReason || "",
      "override reason",
      500,
    ),
  };
  if (bookingGroup) {
    const quantity = input.requestedQuantity ?? input.quantity;
    details.requestedQuantity = integer(
      typeof quantity === "string" && /^\d+$/.test(quantity)
        ? Number(quantity)
        : quantity,
      1,
      200,
      "requested quantity",
    );
  }
  if (details.bufferOverrideReason && !has(p, "lord.admin"))
    fail(
      "CAPABILITY_DENIED",
      "Only a LORD administrator may override preparation time.",
      403,
    );
  return {
    staffId,
    date: day(input.date),
    start,
    end,
    items: lines,
    details,
    ...(bookingGroup ? { bookingGroup } : {}),
  };
}
export function publicBooking(row, items = []) {
  const details = JSON.parse(row.details_json);
  return {
    bookingId: row.booking_id,
    staffId: row.staff_id,
    date: row.service_date,
    startPeriod: String(row.start_period),
    endPeriod: String(row.end_period - 1),
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...details,
    items: items.map((i) => ({
      resourceId: i.resource_id,
      quantity: i.quantity,
      collectedQuantity: i.collected_quantity,
      returnedQuantity: i.returned_quantity,
      issueQuantity: i.issue_quantity,
    })),
  };
}
export function csv(rows) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let s = String(value ?? "");
          if (/^[=+@-]/.test(s)) s = "'" + s;
          return '"' + s.replace(/"/g, '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
}
export function sgDay(now) {
  return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}
export function nextReferenceRefresh(now) {
  const d = new Date(now + 8 * 3600000);
  const next =
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 2, 3) -
    8 * 3600000;
  return next > now ? next : next + 86400000;
}
/** Buffer is one free timetable period by default; half-open end excludes the final boundary. */
export function capacityGuard(
  schoolId,
  date,
  resource,
  proposed,
  excludeIds = [],
) {
  const overridden = proposed.every((p) => p.override);
  const buffer = overridden ? 0 : resource.buffer_periods;
  const sql = `WITH intervals AS (
 SELECT b.start_period AS start_at,b.end_period+? AS end_at,CASE WHEN r.exclusive=1 THEN r.capacity ELSE i.quantity END AS units
 FROM lord_bookings b JOIN lord_booking_items i USING(school_id,booking_id) JOIN lord_resources r USING(school_id,resource_id)
 WHERE b.school_id=? AND b.service_date=? AND i.resource_id=? AND b.status IN ('BOOKED','COLLECTED')
 AND b.booking_id NOT IN (SELECT value FROM json_each(?))
 UNION ALL SELECT json_extract(value,'$.start'),json_extract(value,'$.end')+?,CASE WHEN ?=1 THEN ? ELSE json_extract(value,'$.quantity') END FROM json_each(?)
 ), events AS (SELECT start_at AS at,units AS amount FROM intervals UNION ALL SELECT end_at,-units FROM intervals), totals AS (
 SELECT at,SUM(amount) AS amount FROM events GROUP BY at), running AS (SELECT SUM(amount) OVER(ORDER BY at) AS occupied FROM totals)
 SELECT COALESCE(MAX(occupied),0)<=? AS ok FROM running`;
  return {
    sql,
    args: [
      buffer,
      schoolId,
      date,
      resource.resource_id,
      JSON.stringify(excludeIds),
      buffer,
      resource.exclusive,
      resource.capacity,
      JSON.stringify(proposed),
      resource.capacity,
    ],
  };
}

/** Each channel has its own durable receipt and retry state. */
export function notificationJobs(jobs = []) {
  return jobs.flatMap((job) =>
    ["lord.booking-notification", "lord.return-reminder"].includes(job.type) &&
    !job.payload?.channel
      ? ["email", "whatsapp"].map((channel) => ({
          ...job,
          id: job.id + ":" + channel,
          payload: { ...job.payload, channel },
        }))
      : [job],
  );
}
