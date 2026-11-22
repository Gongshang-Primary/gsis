import { ApiError } from "../../runtime/errors.mjs";
import {
  RELIEF_ALLOWED_ACTIONS,
  normalizeReliefInput,
  issueReliefSession,
  clearReliefCookie,
  verifyReliefCookie,
  authorizeReliefRequest,
} from "./relief-auth.mjs";
export { authorizeReliefRequest as authorizeFallback };
import {
  wrappedReport,
  prepareReignArchive,
  exportReignArchive,
  previewReignCleanup,
  commitReignCleanup,
  finishReignCleanup,
  reignArchiveList,
} from "./reign.mjs";
import {
  canonical,
  digest,
  query,
  one,
  prepareOperation,
  commitOperation,
  abortOperation,
  operationStatus,
} from "../../runtime/store.mjs";
import {
  admit,
  resolveAdmission,
  serviceCall,
} from "../../runtime/security.mjs";
import {
  MAX_BATCH,
  MAX_PHOTO_BYTES,
  REFERENCE_MAX_AGE,
  fail,
  id,
  text,
  integer,
  day,
  has,
  requireCapability,
  requireOwner,
  resourceInput,
  bookingGroupInput,
  bookingInput,
  publicBooking,
  csv,
  sgDay,
  nextReferenceRefresh,
  capacityGuard,
  notificationJobs,
  reminderPhase,
  reminderEligibility,
} from "./model.mjs";

const adminActions = new Set([
  "resource-save",
  "resources-save",
  "resource-delete",
  "reignclose",
  "reign-archive-prepare",
  "reign-archive-export",
  "reign-cleanup",
  "reign-cleanup-finish",
  "reference-refresh",
  "settings-save",
  "incident-resolve",
  "link-create",
  "background-retry",
  "link-revoke",
]);
const readActions = new Set([
  "reference",
  "resources",
  "mybookings",
  "opensessions",
  "session",
  "bookingget",
  "bookingeligible",
  "bookingavailability",
  "bookingdayschedule",
  "notificationpreferences",
  "receipt",
  "photos",
  "export",
  "profile",
  "bookingactioncontext",
  "incident-response-context",
]);
const borrowActions = new Set([
  "bookingcreate",
  "bookingcreatebatch",
  "bookingupdate",
  "bookingcancel",
  "loan",
  "return",
  "preferences-save",
  "bookingrespond",
  "incidentrespond",
  "photo-upload",
]);
const adminReads = new Set([
  "dashboard",
  "reignpreview",
  "reign-archives",
  "reign-cleanup-preview",
  "complianceincidents",
  "backgroundwork",
  "adminsettings",
  "archive-download",
  "incident-get",
  "incident-list",
]);
function actionOf(method, path, body) {
  const p = path.split("?")[0].replace(/\/$/, "") || "/";
  if (p === "/transaction")
    return String(
      body?.action ||
        new URL("https://internal" + path).searchParams.get("action") ||
        "",
    ).toLowerCase();
  const get = {
    "/reference": "reference",
    "/resources": "resources",
    "/bookings": "mybookings",
    "/bookings/availability": "bookingavailability",
    "/bookings/day": "bookingdayschedule",
    "/bookings/eligible": "bookingeligible",
    "/bookings/get": "bookingget",
    "/dashboard": "dashboard",
    "/board": "starlordboard",
    "/signage": "starlordboard",
    "/preferences": "notificationpreferences",
    "/incidents": "complianceincidents",
    "/incidents/get": "incident-get",
    "/incidents/list": "incident-list",
    "/incidents/respond-context": "incident-response-context",
    "/reign/preview": "reignpreview",
    "/reign/archive": "archive-download",
    "/reign/archives": "reign-archives",
    "/reign/cleanup/preview": "reign-cleanup-preview",
    "/background": "backgroundwork",
    "/settings": "adminsettings",
    "/export": "export",
    "/receipt": "receipt",
    "/profile": "profile",
  };
  const post = {
    "/resources": "resource-save",
    "/resources/batch": "resources-save",
    "/resources/delete": "resource-delete",
    "/bookings": "bookingcreate",
    "/bookings/batch": "bookingcreatebatch",
    "/bookings/update": "bookingupdate",
    "/bookings/cancel": "bookingcancel",
    "/collect": "loan",
    "/return": "return",
    "/photos": "photo-upload",
    "/preferences": "preferences-save",
    "/incidents/resolve": "incident-resolve",
    "/incidents/respond": "incidentrespond",
    "/bookings/respond": "bookingrespond",
    "/links": "link-create",
    "/links/revoke": "link-revoke",
    "/reign/close": "reignclose",
    "/reign/archive/prepare": "reign-archive-prepare",
    "/reign/archive/export": "reign-archive-export",
    "/reign/cleanup": "reign-cleanup",
    "/reign/cleanup/finish": "reign-cleanup-finish",
    "/reference/refresh": "reference-refresh",
    "/settings": "settings-save",
    "/background/retry": "background-retry",
  };
  if (p === "/auth/relief") return "auth-relief";
  if (method === "GET" && p.startsWith("/photos/")) return "photos";
  if (method === "GET" && p === "/receipt") return "receipt";
  return (method === "GET" ? get : post)[p] || "";
}
export function policy(method, path, body = {}) {
  let action = actionOf(method, path, body);
  if (action === "auth-relief") {
    if (!["GET", "POST"].includes(method))
      fail("METHOD_NOT_ALLOWED", "Unsupported method.", 405);
    return {
      action: "lord.relief.auth",
      write: false,
      resourceId: "relief-auth",
      public: true,
    };
  }
  if (action === "notificationpreferences" && method !== "GET")
    action = "preferences-save";
  if (action === "incidentresolve") action = "incident-resolve";
  if (action === "suiterefresh") action = "reference-refresh";
  if (action === "adminsettings" && method !== "GET") action = "settings-save";
  const write = method !== "GET";
  if (action === "starlordboard" && !write)
    return {
      action: "lord.signage",
      write: false,
      resourceId: "signage",
      ...(path.split("?")[0] === "/board" ? { public: true } : {}),
    };
  if ((write && adminActions.has(action)) || (!write && adminReads.has(action)))
    return {
      action: "lord.admin",
      write,
      resourceId: body.bookingId || body.resourceId || action,
    };
  if (
    (write && borrowActions.has(action)) ||
    (!write && readActions.has(action))
  )
    return {
      action: write ? "lord.borrow" : "lord.read",
      write,
      resourceId: body.bookingId || action,
      allowRelief: RELIEF_ALLOWED_ACTIONS.has(action),
    };
  fail("NOT_FOUND", "Unknown LORD operation.", 404);
}
function parameters(ctx) {
  const input = {
    ...Object.fromEntries(
      new URL(ctx.request?.url || "https://internal" + ctx.path).searchParams,
    ),
    ...(ctx.body || {}),
  };
  if (typeof input.bookingGroup === "string") {
    try {
      input.bookingGroup = JSON.parse(input.bookingGroup);
    } catch {
      fail("INVALID_INPUT", "Invalid cart selection.");
    }
  }
  return input;
}
function requireRevision(value) {
  return integer(value, 0, Number.MAX_SAFE_INTEGER, "revision");
}
const guard = (sql, args = []) => ({ sql, args });
const write = (sql, args = []) => ({ sql, args });
const generatedId = async (prefix, ...parts) =>
  prefix + "-" + (await digest(parts));
function changed(row, revision) {
  if (!row) fail("NOT_FOUND", "Record not found.", 404);
  if (row.revision !== requireRevision(revision))
    fail(
      "REVISION_CONFLICT",
      "This record changed. Reload before saving.",
      409,
    );
}
async function booking(db, school, bookingId) {
  const b = await one(
    db,
    "SELECT * FROM lord_bookings WHERE school_id=? AND booking_id=?",
    [school, id(bookingId, "booking")],
  );
  if (!b) fail("NOT_FOUND", "Booking not found.", 404);
  return b;
}
const cartOf = (row) =>
  text(JSON.parse(row.metadata_json).cart || "", "cart", 160);
async function cartProjection(school, cart, rows) {
  const members = rows
    .map((r) => ({
      resourceId: r.resource_id,
      revision: r.revision,
      capacity: r.capacity,
    }))
    .sort((a, b) =>
      a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0,
    );
  const capacity = members.reduce((n, m) => n + m.capacity, 0);
  const invalid =
    !members.length ||
    members.length > 20 ||
    rows.some(
      (r) =>
        r.type !== rows[0].type ||
        !Number.isSafeInteger(r.capacity) ||
        r.capacity < 1 ||
        r.capacity > 200,
    );
  return {
    resource: cart,
    name: cart,
    deviceType: rows[0]?.type || "",
    capacity,
    active: !invalid,
    groupState: invalid ? "unresolved" : "verified",
    ...(invalid
      ? {
          unavailableReason:
            "Cart membership must have one device type and one to twenty members, each with capacity from 1 to 200.",
        }
      : {}),
    stylusOption: rows.some(
      (r) => JSON.parse(r.metadata_json).stylusOption === true,
    ),
    headphoneOption: rows.some(
      (r) => JSON.parse(r.metadata_json).headphoneOption === true,
    ),
    bookingGroup: {
      cart,
      revision: await digest({ schoolId: school, cart, members }),
      members,
    },
  };
}
async function bookingResources(school, rows) {
  const carts = new Map(),
    result = [];
  for (const r of rows.filter((r) => r.active === 1)) {
    const cart = cartOf(r),
      metadata = JSON.parse(r.metadata_json);
    if (cart) {
      if (!carts.has(cart)) carts.set(cart, []);
      carts.get(cart).push(r);
    } else
      result.push({
        resource: r.resource_id,
        name: r.name,
        deviceType: r.type,
        capacity: r.capacity,
        active: true,
        groupState: "standalone",
        bookingGroup: null,
        stylusOption: metadata.stylusOption === true,
        headphoneOption: metadata.headphoneOption === true,
      });
  }
  result.push(
    ...(await Promise.all(
      [...carts].map(([cart, members]) =>
        cartProjection(school, cart, members),
      ),
    )),
  );
  const rank = (r) =>
    /ipad/i.test(r.deviceType)
      ? 1
      : /laptop|windows|notebook|chromebook|macbook/i.test(r.deviceType)
        ? 2
        : 0;
  return result
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.resource.localeCompare(b.resource, "en", {
          numeric: true,
          sensitivity: "base",
        }),
    )
    .map((r, sortOrder) => ({ ...r, sortOrder }));
}
function cartMembershipGuard(school, selection) {
  const members = canonical(selection.members);
  return guard(
    `SELECT
    (SELECT COUNT(*) FROM lord_resources WHERE school_id=? AND active=1 AND json_extract(metadata_json,'$.cart')=?)=json_array_length(?)
    AND NOT EXISTS(SELECT 1 FROM json_each(?) x LEFT JOIN lord_resources r
      ON r.school_id=? AND r.resource_id=json_extract(x.value,'$.resourceId')
      WHERE r.resource_id IS NULL OR r.active<>1 OR r.revision<>json_extract(x.value,'$.revision')
        OR r.capacity<>json_extract(x.value,'$.capacity') OR COALESCE(json_extract(r.metadata_json,'$.cart'),'')<>?) AS ok`,
    [school, selection.cart, members, members, school, selection.cart],
  );
}
async function resolveBookingGroup(db, school, planned) {
  if (!planned.bookingGroup) return planned;
  const selection = planned.bookingGroup;
  const rows = await query(
    db,
    "SELECT * FROM lord_resources WHERE school_id=? AND active=1 AND json_extract(metadata_json,'$.cart')=? ORDER BY resource_id LIMIT 21",
    [school, selection.cart],
  );
  const group = await cartProjection(school, selection.cart, rows);
  if (!group.active || canonical(group.bookingGroup) !== canonical(selection))
    fail(
      "GROUP_REVISION_CONFLICT",
      "Cart membership changed or cannot be verified. Reload the cart before booking.",
      409,
    );
  if (planned.details.requestedQuantity > group.capacity)
    fail("RESOURCE_CAPACITY", "Requested quantity exceeds cart capacity.", 409);
  return {
    ...planned,
    items: group.bookingGroup.members.map((m) => ({
      resourceId: m.resourceId,
      quantity: m.capacity,
    })),
    details: {
      ...planned.details,
      deviceType: group.deviceType,
      bookingGroup: group.bookingGroup,
    },
  };
}
function inventoryCartGuards(school, rows, existing) {
  const affected = new Set();
  for (const row of rows) {
    const old = existing.find((r) => r.resource_id === row.resourceId),
      oldCart = old ? cartOf(old) : "";
    if (
      !old ||
      oldCart !== row.metadata.cart ||
      Boolean(old.active) !== row.active ||
      old.capacity !== row.capacity ||
      old.type !== row.type ||
      Boolean(old.exclusive) !== row.exclusive ||
      old.buffer_periods !== row.bufferPeriods
    ) {
      if (oldCart && old?.active) affected.add(oldCart);
      if (row.metadata.cart && row.active) affected.add(row.metadata.cart);
    }
  }
  return [...affected].map((cart) =>
    guard(
      "SELECT NOT EXISTS(SELECT 1 FROM lord_bookings b JOIN lord_booking_items i USING(school_id,booking_id) JOIN lord_resources r USING(school_id,resource_id) WHERE b.school_id=? AND b.status IN('BOOKED','COLLECTED') AND json_extract(r.metadata_json,'$.cart')=?) AS ok",
      [school, cart],
    ),
  );
}
function recordedRequestedQuantity(details) {
  return Number.isSafeInteger(details.requestedQuantity) &&
    details.requestedQuantity >= 1 &&
    details.requestedQuantity <= 200
    ? details.requestedQuantity
    : null;
}
function capturedBookingGroup(details, items) {
  if (!details.bookingGroup) return null;
  try {
    const saved = bookingGroupInput(details.bookingGroup);
    return saved.members.length === items.length &&
      saved.members.every((m) =>
        items.some(
          (i) => i.resource_id === m.resourceId && i.quantity === m.capacity,
        ),
      )
      ? saved
      : null;
  } catch {
    return null;
  }
}
async function bookingGroupView(db, row, items) {
  const details = JSON.parse(row.details_json),
    reservedCapacity = items.reduce((n, i) => n + i.quantity, 0);
  const requestedQuantity = recordedRequestedQuantity(details),
    carts = new Set(items.map(cartOf));
  const captured = capturedBookingGroup(details, items);
  // A captured cart is historical evidence. Current inventory only determines
  // whether its complete membership can still be selected for an edit.
  const cart = details.bookingGroup
    ? captured?.cart
    : carts.size === 1 && !carts.has("")
      ? [...carts][0]
      : null;
  if (cart) {
    const current = await query(
      db,
      "SELECT * FROM lord_resources WHERE school_id=? AND active=1 AND json_extract(metadata_json,'$.cart')=? ORDER BY resource_id LIMIT 21",
      [row.school_id, cart],
    );
    const group = await cartProjection(row.school_id, cart, current);
    if (
      group.active &&
      group.bookingGroup.members.length === items.length &&
      group.bookingGroup.members.every((m) =>
        items.some(
          (i) => i.resource_id === m.resourceId && i.quantity === m.capacity,
        ),
      )
    )
      return {
        resource: cart,
        groupState: "verified",
        bookingGroup: group.bookingGroup,
        reservedCapacity,
        requestedQuantity,
      };
    if (captured)
      return {
        resource: captured.cart,
        groupState: "unresolved",
        bookingGroup: null,
        reservedCapacity,
        requestedQuantity,
      };
  }
  const standalone = !details.bookingGroup && carts.size === 1 && carts.has("");
  return {
    resource: standalone
      ? items.map((i) => i.resource_id).join(", ")
      : "Unresolved resource group",
    groupState: standalone ? "standalone" : "unresolved",
    bookingGroup: null,
    reservedCapacity,
    requestedQuantity: standalone ? reservedCapacity : requestedQuantity,
  };
}
async function bookingView(db, row) {
  const items = await query(
      db,
      "SELECT i.*,r.name,r.type,r.metadata_json FROM lord_booking_items i JOIN lord_resources r USING(school_id,resource_id) WHERE i.school_id=? AND i.booking_id=? ORDER BY resource_id",
      [row.school_id, row.booking_id],
    ),
    accessories = await query(
      db,
      "SELECT * FROM lord_accessories WHERE school_id=? AND booking_id=?",
      [row.school_id, row.booking_id],
    ),
    ref = await one(
      db,
      "SELECT name FROM lord_references WHERE school_id=? AND staff_id=?",
      [row.school_id, row.staff_id],
    );
  const result = publicBooking(row, items),
    styluses = accessories.find((a) => a.kind === "styluses"),
    headphones = accessories.find((a) => a.kind === "headphones");
  return {
    ...result,
    teacher: ref?.name || "",
    teacherTtbName: ref?.name || "",
    ...(await bookingGroupView(db, row, items)),
    sessionId: row.booking_id,
    isOpen: row.status === "COLLECTED",
    trolleys: items.map((i) => ({
      id: i.resource_id,
      trolleyRecordId: i.resource_id,
      resourceId: i.resource_id,
      name: i.name,
      deviceType: i.type,
      quantity: i.collected_quantity,
      returnedQuantity: i.returned_quantity,
      remainingQuantity: i.collected_quantity - i.returned_quantity,
    })),
    stylusesBooked: result.styluses,
    headphonesBooked: result.headphones,
    stylusQuantity: styluses?.collected_quantity || 0,
    stylusReturnedQuantity: styluses?.returned_quantity || 0,
    headphoneQuantity: headphones?.collected_quantity || 0,
    headphoneReturnedQuantity: headphones?.returned_quantity || 0,
  };
}
function bookingGuard(row) {
  return guard(
    "SELECT revision=? AND status=? AS ok FROM lord_bookings WHERE school_id=? AND booking_id=?",
    [row.revision, row.status, row.school_id, row.booking_id],
  );
}
function unarchivedGuard(row) {
  return guard(
    "SELECT NOT EXISTS(SELECT 1 FROM lord_periods WHERE school_id=? AND period_id=? AND status='closed') AS ok",
    [row.school_id, row.period_id],
  );
}
async function mutate(ctx, action, fn) {
  const reliefAction = RELIEF_ALLOWED_ACTIONS.has(action);
  requireCapability(
    ctx.principal,
    adminActions.has(action) ? "lord.admin" : "lord.borrow",
    true,
    { allowRelief: reliefAction },
  );
  const p = ctx.principal,
    body = ctx.body || {},
    now = ctx.now ?? Date.now();
  const isRelief = p.identityType === "RELIEF";
  if (isRelief && !reliefAction)
    fail(
      "CAPABILITY_DENIED",
      "Relief teacher access is limited to loan and return functions.",
      403,
    );
  const intent = { ...body };
  delete intent.requestId;
  const op = await prepareOperation(ctx.env.DB, {
    schoolId: p.schoolId,
    actorId: p.actorId,
    operationId: id(body.operationId || body.clientRequestId, "operation"),
    action: "lord." + action,
    intent,
    now,
    validUntil: p.validUntil,
    authorization: p,
  });
  if (op.state === "committed")
    return { ...op.receipt.result, receipt: op.receipt };
  if (op.state !== "prepared" && op.state !== "pending")
    fail(
      "OPERATION_TERMINAL",
      "This operation cannot commit. Start a reviewed new request.",
      409,
    );
  let admission;
  try {
    const plan = await fn({ ...ctx, op, now });
    if (isRelief) {
      if (p.validUntil <= now)
        fail("AUTHORITY_CHANGED", "Relief session expired. Sign in again.", 401);
      await ctx.env.DB.prepare(
        "INSERT OR REPLACE INTO product_admissions(school_id,operation_id,fence,digest,decision_id,valid_until,pins_json,state) VALUES(?,?,?,?,?,?,?,?)",
      )
        .bind(
          op.schoolId,
          op.operationId,
          op.fence,
          op.digest,
          p.decisionId,
          p.validUntil,
          "[]",
          "ready",
        )
        .run();
      admission = {
        kind: "relief",
        decisionId: p.decisionId,
        validUntil: p.validUntil,
        pins: [],
      };
    } else {
      admission = await admit(
        ctx.env,
        ctx.env.DB,
        op,
        p,
        plan.dependencies || [],
        now,
      );
    }
    const receipt = await commitOperation(ctx.env.DB, op, {
      ...plan,
      outbox: notificationJobs(plan.outbox),
      now,
      validUntil: p.validUntil,
      admission,
      audit: {
        domain: "lord",
        action,
        actorId: p.actorId,
        staffId: p.staffId || null,
        ...(isRelief ? { reliefName: p.name, reliefMobile: p.mobile } : {}),
        operationId: op.operationId,
        ...plan.audit,
      },
    });
    if (!isRelief)
      await resolveAdmission(ctx.env, ctx.env.DB, op, admission, receipt, now);
    return { ...receipt.result, receipt };
  } catch (error) {
    let outcome;
    try {
      outcome = await abortOperation(
        ctx.env.DB,
        op,
        error.code || error.reasonCode || "COMMIT_FAILED",
        now,
      );
    } catch {}
    if (!isRelief && admission && outcome)
      await resolveAdmission(
        ctx.env,
        ctx.env.DB,
        op,
        admission,
        outcome,
        now,
      ).catch(() => {});
    throw error;
  }
}
async function listBookings(ctx, input, mode = "mine") {
  const p = ctx.principal,
    isRelief = p.identityType === "RELIEF" && has(p, "lord.relief"),
    where = ["school_id=?"],
    args = [p.schoolId];
  if (
    !isRelief &&
    (mode === "mine" || (mode !== "day" && !has(p, "lord.admin")))
  ) {
    where.push("staff_id=?");
    args.push(p.staffId);
  }
  if (isRelief && !input.date && !input.from && !input.to) {
    where.push("service_date=?");
    args.push(sgDay(ctx.now ?? Date.now()));
  }
  if (input.date) {
    where.push("service_date=?");
    args.push(day(input.date));
  }
  if (input.from) {
    where.push("service_date>=?");
    args.push(day(input.from));
  }
  if (input.to) {
    where.push("service_date<=?");
    args.push(day(input.to));
  }
  if (mode === "open") where.push("status='COLLECTED'");
  const rows = await query(
    ctx.env.DB,
    `SELECT * FROM lord_bookings WHERE ${where.join(" AND ")} ORDER BY service_date DESC,start_period,booking_id LIMIT 501`,
    args,
  );
  if (rows.length > 500)
    fail("RESULT_BOUNDS", "Choose a shorter date range.", 422);
  const result = await Promise.all(
    rows.map((row) => bookingView(ctx.env.DB, row)),
  );
  if (mode === "day")
    return result.map((b) => ({
      bookingId: b.bookingId,
      date: b.date,
      startPeriod: b.startPeriod,
      endPeriod: b.endPeriod,
      status: b.status,
      revision: b.revision,
      resource: b.resource,
      teacher: b.teacher,
      classOrActivity: b.classOrActivity,
      subject: b.subject,
      requestedQuantity: b.requestedQuantity,
    }));
  return result;
}
async function reference(ctx) {
  const school = ctx.principal.schoolId,
    resources = await query(
      ctx.env.DB,
      "SELECT * FROM lord_resources WHERE school_id=? " +
        (has(ctx.principal, "lord.admin") &&
        parameters(ctx).includeInactive === "1"
          ? ""
          : "AND active=1 ") +
        "ORDER BY name LIMIT 2001",
      [school],
    );
  if (resources.length > 2000)
    fail(
      "RESULT_BOUNDS",
      "Inventory exceeds the supported reference bound.",
      422,
    );
  const state = await one(
    ctx.env.DB,
    "SELECT * FROM lord_reference_state WHERE school_id=?",
    [school],
  );
  const now = ctx.now ?? Date.now(),
    fresh =
      !!state &&
      state.observed_at <= now &&
      now - state.observed_at <= REFERENCE_MAX_AGE;
  const staff = fresh
    ? await query(
        ctx.env.DB,
        "SELECT staff_id,name FROM lord_references WHERE school_id=? ORDER BY name LIMIT 513",
        [school],
      )
    : [];
  if (staff.length > 512)
    fail(
      "RESULT_BOUNDS",
      "Reference dataset exceeds the configured staff bound.",
      422,
    );
  const settings = await query(
    ctx.env.DB,
    "SELECT setting_key,value_json FROM lord_settings WHERE school_id=? AND setting_key IN ('periodTimings','referenceLists')",
    [school],
  );
  const config = Object.fromEntries(
      settings.map((r) => [r.setting_key, JSON.parse(r.value_json)]),
    ),
    periods = config.periodTimings?.periods || [],
    lists = config.referenceLists || {};
  const trolleys = resources.map((r) => ({
    id: r.resource_id,
    name: r.name,
    group: JSON.parse(r.metadata_json).cart || r.resource_id,
    deviceType: r.type,
    defaultQuantity: r.capacity,
    stylusOption: JSON.parse(r.metadata_json).stylusOption === true,
    headphoneOption: JSON.parse(r.metadata_json).headphoneOption === true,
  }));
  return {
    resources: resources.map((r) => ({
      id: r.resource_id,
      name: r.name,
      type: r.type,
      quantity: r.capacity,
      capacity: r.capacity,
      active: r.active === 1,
      exclusive: r.exclusive === 1,
      bufferPeriods: r.buffer_periods,
      revision: r.revision,
      ...JSON.parse(r.metadata_json),
    })),
    bookingResources: await bookingResources(school, resources),
    trolleys,
    teachers: staff.map((r) => r.name),
    staff: staff.map((r) => ({
      staffId: r.staff_id,
      name: r.name,
      ttbName: r.name,
    })),
    classes: lists.classes || [],
    subjects: lists.subjects || [],
    periods,
    defaultViewport: { startTime: "07:00", endTime: "13:30" },
    reference: {
      state: fresh ? "verified" : "unavailable",
      observedAt: state?.observed_at ?? null,
      revision: state?.contacts_revision ?? null,
      maxAgeMs: REFERENCE_MAX_AGE,
    },
    setupRequired: [
      ...(!fresh ? ["Contacts reference refresh"] : []),
      ...(!periods.length ? ["Period timings"] : []),
      ...(!resources.length ? ["Resource inventory"] : []),
    ],
    generatedAt: new Date(now).toISOString(),
  };
}
async function resourceSave(ctx, input) {
  return mutate(ctx, "resource-save", async () => {
    const row = resourceInput(input.resource || input),
      school = ctx.principal.schoolId,
      old = await one(
        ctx.env.DB,
        "SELECT * FROM lord_resources WHERE school_id=? AND resource_id=?",
        [school, row.resourceId],
      );
    const revision = requireRevision(input.revision);
    if (old) changed(old, revision);
    else if (revision !== 0)
      fail("REVISION_CONFLICT", "Resource no longer exists.", 409);
    const guards = [
      ...inventoryCartGuards(school, [row], old ? [old] : []),
      old
        ? guard(
            "SELECT revision=? AS ok FROM lord_resources WHERE school_id=? AND resource_id=?",
            [revision, school, row.resourceId],
          )
        : guard(
            "SELECT NOT EXISTS(SELECT 1 FROM lord_resources WHERE school_id=? AND resource_id=?) AS ok",
            [school, row.resourceId],
          ),
    ];
    if (row.metadata.cart) {
      const siblings = await query(
        ctx.env.DB,
        "SELECT type FROM lord_resources WHERE school_id=? AND resource_id<>? AND json_extract(metadata_json,'$.cart')=?",
        [school, row.resourceId, row.metadata.cart],
      );
      if (siblings.some((r) => r.type !== row.type))
        fail(
          "INVALID_INPUT",
          "All trolleys in a cart/group must use the same device type.",
        );
      guards.push(
        guard(
          "SELECT NOT EXISTS(SELECT 1 FROM lord_resources WHERE school_id=? AND resource_id<>? AND json_extract(metadata_json,'$.cart')=? AND type<>?) AS ok",
          [school, row.resourceId, row.metadata.cart, row.type],
        ),
      );
    }
    // Inventory reductions/deactivation wait until all reserved resources are returned/cancelled.
    if (
      old &&
      (row.capacity < old.capacity ||
        row.bufferPeriods > old.buffer_periods ||
        !row.active ||
        row.type !== old.type ||
        row.metadata.cart !== (JSON.parse(old.metadata_json).cart || "") ||
        row.exclusive !== Boolean(old.exclusive))
    )
      guards.push(
        guard(
          "SELECT NOT EXISTS(SELECT 1 FROM lord_bookings b JOIN lord_booking_items i USING(school_id,booking_id) WHERE b.school_id=? AND i.resource_id=? AND b.status IN ('BOOKED','COLLECTED')) AS ok",
          [school, row.resourceId],
        ),
      );
    return {
      guards,
      writes: [
        write(
          "INSERT INTO lord_resources(school_id,resource_id,name,type,capacity,active,exclusive,buffer_periods,revision,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(school_id,resource_id) DO UPDATE SET name=excluded.name,type=excluded.type,capacity=excluded.capacity,active=excluded.active,exclusive=excluded.exclusive,buffer_periods=excluded.buffer_periods,revision=excluded.revision,metadata_json=excluded.metadata_json",
          [
            school,
            row.resourceId,
            row.name,
            row.type,
            row.capacity,
            row.active ? 1 : 0,
            row.exclusive ? 1 : 0,
            row.bufferPeriods,
            revision + 1,
            canonical(row.metadata),
          ],
        ),
      ],
      result: { resourceId: row.resourceId, revision: revision + 1 },
    };
  });
}
async function resourcesSave(ctx, input) {
  return mutate(ctx, "resources-save", async () => {
    if (
      !Array.isArray(input.resources) ||
      input.resources.length < 1 ||
      input.resources.length > 200
    )
      fail("INVALID_INPUT", "Save between one and 200 resource rows together.");
    const school = ctx.principal.schoolId;
    const rows = input.resources.map((value) => ({
      ...resourceInput(value),
      revision: requireRevision(value.revision),
    }));
    if (new Set(rows.map((r) => r.resourceId)).size !== rows.length)
      fail("INVALID_INPUT", "Resource IDs must be unique.");
    const existing = await query(
      ctx.env.DB,
      "SELECT * FROM lord_resources WHERE school_id=? LIMIT 2001",
      [school],
    );
    if (existing.length > 2000)
      fail("RESULT_BOUNDS", "Inventory exceeds the supported edit bound.", 422);
    for (const row of rows) {
      const old = existing.find((r) => r.resource_id === row.resourceId);
      if ((old?.revision || 0) !== row.revision)
        fail(
          "REVISION_CONFLICT",
          "Inventory changed. Reload before saving.",
          409,
        );
    }
    const merged = [
      ...existing
        .filter((r) => !rows.some((v) => v.resourceId === r.resource_id))
        .map((r) => ({
          type: r.type,
          cart: JSON.parse(r.metadata_json).cart || "",
        })),
      ...rows.map((r) => ({ type: r.type, cart: r.metadata.cart })),
    ];
    const groups = new Map();
    for (const row of merged)
      if (row.cart) {
        if (groups.has(row.cart) && groups.get(row.cart) !== row.type)
          fail(
            "INVALID_INPUT",
            "All trolleys in a cart/group must use the same device type.",
          );
        groups.set(row.cart, row.type);
      }
    const payload = canonical(
      rows.map((r) => ({
        ...r,
        active: r.active ? 1 : 0,
        exclusive: r.exclusive ? 1 : 0,
      })),
    );
    return {
      guards: [
        ...inventoryCartGuards(school, rows, existing),
        guard(
          "SELECT NOT EXISTS(SELECT 1 FROM json_each(?) x LEFT JOIN lord_resources r ON r.school_id=? AND r.resource_id=json_extract(x.value,'$.resourceId') WHERE COALESCE(r.revision,0)<>json_extract(x.value,'$.revision')) AS ok",
          [payload, school],
        ),
        guard(
          "SELECT NOT EXISTS(SELECT 1 FROM json_each(?) x JOIN lord_resources r ON r.school_id=? AND r.resource_id=json_extract(x.value,'$.resourceId') JOIN lord_booking_items i ON i.school_id=r.school_id AND i.resource_id=r.resource_id JOIN lord_bookings b USING(school_id,booking_id) WHERE b.status IN ('BOOKED','COLLECTED') AND (json_extract(x.value,'$.capacity')<r.capacity OR json_extract(x.value,'$.bufferPeriods')>r.buffer_periods OR json_extract(x.value,'$.active')=0 OR json_extract(x.value,'$.exclusive')<>r.exclusive OR json_extract(x.value,'$.type')<>r.type OR json_extract(x.value,'$.metadata.cart')<>COALESCE(json_extract(r.metadata_json,'$.cart'),''))) AS ok",
          [payload, school],
        ),
        guard(
          "WITH merged AS (SELECT type,COALESCE(json_extract(metadata_json,'$.cart'),'') AS cart FROM lord_resources WHERE school_id=? AND resource_id NOT IN (SELECT json_extract(value,'$.resourceId') FROM json_each(?)) UNION ALL SELECT json_extract(value,'$.type'),json_extract(value,'$.metadata.cart') FROM json_each(?)) SELECT NOT EXISTS(SELECT cart FROM merged WHERE cart<>'' GROUP BY cart HAVING COUNT(DISTINCT type)>1) AS ok",
          [school, payload, payload],
        ),
      ],
      writes: [
        write(
          "INSERT INTO lord_resources(school_id,resource_id,name,type,capacity,active,exclusive,buffer_periods,revision,metadata_json) SELECT ?,json_extract(value,'$.resourceId'),json_extract(value,'$.name'),json_extract(value,'$.type'),json_extract(value,'$.capacity'),json_extract(value,'$.active'),json_extract(value,'$.exclusive'),json_extract(value,'$.bufferPeriods'),json_extract(value,'$.revision')+1,json_extract(value,'$.metadata') FROM json_each(?) WHERE 1 ON CONFLICT(school_id,resource_id) DO UPDATE SET name=excluded.name,type=excluded.type,capacity=excluded.capacity,active=excluded.active,exclusive=excluded.exclusive,buffer_periods=excluded.buffer_periods,revision=excluded.revision,metadata_json=excluded.metadata_json",
          [school, payload],
        ),
      ],
      result: {
        resources: rows.map((r) => ({
          resourceId: r.resourceId,
          revision: r.revision + 1,
        })),
        atomic: true,
      },
    };
  });
}
async function saveBookings(ctx, input, update = false) {
  return mutate(
    ctx,
    update
      ? "bookingupdate"
      : Array.isArray(input.bookings)
        ? "bookingcreatebatch"
        : "bookingcreate",
    async ({ op, now }) => {
      const p = ctx.principal,
        db = ctx.env.DB,
        raw = Array.isArray(input.bookings) ? input.bookings : [input];
      if (raw.length < 1 || raw.length > MAX_BATCH)
        fail("INVALID_INPUT", "Submit one to twenty bookings.");
      let prior = null;
      if (update) {
        prior = await booking(db, p.schoolId, input.bookingId);
        requireOwner(p, prior);
        changed(prior, input.revision);
        if (prior.status !== "BOOKED")
          fail(
            "BOOKING_STATE",
            "Only an uncollected booking may be edited.",
            409,
          );
      }
      const planned = await Promise.all(
        raw.map(async (value, i) => ({
          ...(await resolveBookingGroup(
            db,
            p.schoolId,
            bookingInput({ ...input, ...value }, p),
          )),
          bookingId:
            prior?.booking_id || (await generatedId("b", op.operationId, i)),
        })),
      );
      const guards = prior ? [bookingGuard(prior), unarchivedGuard(prior)] : [],
        writes = [],
        outbox = [],
        resources = new Map();
      const timings = await one(
        db,
        "SELECT revision FROM lord_settings WHERE school_id=? AND setting_key='periodTimings'",
        [p.schoolId],
      );
      guards.push(
        guard(
          "SELECT COALESCE((SELECT revision FROM lord_settings WHERE school_id=? AND setting_key='periodTimings'),0)=? AS ok",
          [p.schoolId, timings?.revision || 0],
        ),
      );
      for (const b of planned) {
        if (b.bookingGroup)
          guards.push(cartMembershipGuard(p.schoolId, b.bookingGroup));
        const ref = await one(
          db,
          "SELECT * FROM lord_references WHERE school_id=? AND staff_id=?",
          [p.schoolId, b.staffId],
        );
        if (
          !ref ||
          !ref.email ||
          ref.observed_at > now ||
          now - ref.observed_at > REFERENCE_MAX_AGE
        )
          fail(
            "REFERENCE_UNAVAILABLE",
            "Refresh verified Contacts references before booking.",
            503,
          );
        guards.push(
          guard(
            "SELECT observed_at=? AND source_revision=? AND ?>=observed_at AND ?-observed_at<=? AS ok FROM lord_references WHERE school_id=? AND staff_id=?",
            [
              ref.observed_at,
              ref.source_revision,
              now,
              now,
              REFERENCE_MAX_AGE,
              p.schoolId,
              b.staffId,
            ],
          ),
        );
        for (const line of b.items) {
          const r =
            resources.get(line.resourceId) ||
            (await one(
              db,
              "SELECT * FROM lord_resources WHERE school_id=? AND resource_id=?",
              [p.schoolId, line.resourceId],
            ));
          if (!r || !r.active)
            fail(
              "RESOURCE_UNAVAILABLE",
              "A selected resource is unavailable.",
              409,
            );
          if (!b.bookingGroup && cartOf(r))
            fail(
              "GROUP_SELECTION_REQUIRED",
              "Select the whole cart from its current reference before booking.",
              409,
            );
          if (line.quantity > r.capacity)
            fail(
              "RESOURCE_CAPACITY",
              "Requested quantity exceeds inventory.",
              409,
            );
          resources.set(line.resourceId, r);
        }
      }
      for (const [resourceId, r] of resources) {
        guards.push(
          guard(
            "SELECT revision=? AND active=1 AS ok FROM lord_resources WHERE school_id=? AND resource_id=?",
            [r.revision, p.schoolId, resourceId],
          ),
        );
        for (const date of new Set(planned.map((b) => b.date))) {
          const candidates = planned
            .filter(
              (b) =>
                b.date === date &&
                b.items.some((i) => i.resourceId === resourceId),
            )
            .map((b) => ({
              start: b.start,
              end: b.end,
              quantity: b.items.find((i) => i.resourceId === resourceId)
                .quantity,
              override: !!b.details.bufferOverrideReason,
            }));
          if (candidates.length)
            guards.push(
              capacityGuard(
                p.schoolId,
                date,
                r,
                candidates,
                prior ? [prior.booking_id] : [],
              ),
            );
        }
      }
      for (const b of planned) {
        const revision = (prior?.revision || 0) + 1,
          details = {
            ...b.details,
            createdByStaffId: prior
              ? JSON.parse(prior.details_json).createdByStaffId
              : p.staffId || null,
          };
        if (prior) {
          writes.push(
            write(
              "UPDATE lord_bookings SET staff_id=?,service_date=?,start_period=?,end_period=?,revision=?,details_json=?,updated_at=? WHERE school_id=? AND booking_id=?",
              [
                b.staffId,
                b.date,
                b.start,
                b.end,
                revision,
                canonical(details),
                now,
                p.schoolId,
                b.bookingId,
              ],
            ),
            write(
              "DELETE FROM lord_booking_items WHERE school_id=? AND booking_id=?",
              [p.schoolId, b.bookingId],
            ),
          );
        } else
          writes.push(
            write(
              "INSERT INTO lord_bookings(school_id,booking_id,staff_id,created_by,service_date,start_period,end_period,status,revision,details_json,created_at,updated_at,period_id) VALUES(?,?,?,?,?,?,?,'BOOKED',?,?,?,?,COALESCE((SELECT period_id FROM lord_periods WHERE school_id=? AND status='active'),'initial'))",
              [
                p.schoolId,
                b.bookingId,
                b.staffId,
                p.actorId,
                b.date,
                b.start,
                b.end,
                revision,
                canonical(details),
                now,
                now,
                p.schoolId,
              ],
            ),
          );
        for (const line of b.items)
          writes.push(
            write(
              "INSERT INTO lord_booking_items(school_id,booking_id,resource_id,quantity) VALUES(?,?,?,?)",
              [p.schoolId, b.bookingId, line.resourceId, line.quantity],
            ),
          );
        outbox.push({
          id: `lord:${b.bookingId}:booking:${revision}`,
          type: "lord.booking-notification",
          dueAt: now,
          payload: {
            schoolId: p.schoolId,
            bookingId: b.bookingId,
            revision,
            staffId: b.staffId,
            kind: prior ? "changed" : "created",
          },
        });
      }
      return {
        guards,
        writes,
        outbox,
        result: {
          bookings: planned.map((b) => ({
            bookingId: b.bookingId,
            staffId: b.staffId,
            date: b.date,
            startPeriod: b.start,
            endPeriod: b.end - 1,
            status: "BOOKED",
            revision: (prior?.revision || 0) + 1,
            items: b.items,
            ...(b.bookingGroup
              ? {
                  resource: b.bookingGroup.cart,
                  bookingGroup: b.bookingGroup,
                  requestedQuantity: b.details.requestedQuantity,
                  reservedCapacity: b.items.reduce((n, i) => n + i.quantity, 0),
                }
              : {}),
          })),
          ...(planned.length === 1
            ? {
                bookingId: planned[0].bookingId,
                status: "BOOKED",
                revision: (prior?.revision || 0) + 1,
              }
            : {}),
        },
      };
    },
  );
}
async function cancelBooking(ctx, input) {
  return mutate(ctx, "bookingcancel", async ({ now }) => {
    const b = await booking(
      ctx.env.DB,
      ctx.principal.schoolId,
      input.bookingId,
    );
    requireOwner(ctx.principal, b);
    changed(b, input.revision);
    if (b.status !== "BOOKED")
      fail(
        "BOOKING_STATE",
        "Only an uncollected booking can be cancelled.",
        409,
      );
    return {
      guards: [bookingGuard(b), unarchivedGuard(b)],
      writes: [
        write(
          "UPDATE lord_bookings SET status='CANCELLED',revision=revision+1,updated_at=? WHERE school_id=? AND booking_id=?",
          [now, b.school_id, b.booking_id],
        ),
      ],
      result: {
        bookingId: b.booking_id,
        status: "CANCELLED",
        revision: b.revision + 1,
      },
      outbox: [
        {
          id: `lord:${b.booking_id}:cancel:${b.revision + 1}`,
          type: "lord.booking-notification",
          dueAt: now,
          payload: {
            schoolId: b.school_id,
            bookingId: b.booking_id,
            staffId: b.staff_id,
            revision: b.revision + 1,
            kind: "cancelled",
          },
        },
      ],
    };
  });
}
async function collect(ctx, input) {
  return mutate(ctx, "loan", async ({ now, op }) => {
    const b = await booking(
      ctx.env.DB,
      ctx.principal.schoolId,
      input.bookingId,
    );
    requireOwner(ctx.principal, b, { allowRelief: true });
    changed(b, input.revision);
    if (b.status !== "BOOKED")
      fail(
        "BOOKING_STATE",
        "Booking cannot be collected in its current state.",
        409,
      );
    const reserved = await query(
        ctx.env.DB,
        "SELECT * FROM lord_booking_items WHERE school_id=? AND booking_id=?",
        [b.school_id, b.booking_id],
      ),
      photoIds = input.photoIds || [];
    if (
      !Array.isArray(input.items) ||
      !input.items.length ||
      input.items.length > 20
    )
      fail(
        "COLLECTION_DETAILS_REQUIRED",
        "Confirm each collected resource and actual quantity.",
      );
    const seen = new Set(),
      items = input.items.map((item) => {
        const resourceId = id(item.resourceId),
          r = reserved.find((x) => x.resource_id === resourceId);
        if (!r || seen.has(resourceId))
          fail("INVALID_INPUT", "Unknown or duplicate collected resource.");
        seen.add(resourceId);
        return {
          ...r,
          collected_quantity: integer(
            item.quantity,
            1,
            r.quantity,
            "collected quantity",
          ),
        };
      });
    if (
      !Array.isArray(photoIds) ||
      photoIds.length > 20 ||
      new Set(photoIds).size !== photoIds.length
    )
      fail("INVALID_INPUT", "Invalid photo evidence.");
    if (photoIds.length < items.length)
      fail(
        "PHOTO_REQUIRED",
        "Upload the collection photos before confirming collection.",
      );
    const guards = [bookingGuard(b), unarchivedGuard(b)];
    for (const photo of photoIds)
      guards.push(
        guard(
          "SELECT EXISTS(SELECT 1 FROM lord_photos WHERE school_id=? AND booking_id=? AND photo_id=? AND phase='collection' AND booking_revision=?) AS ok",
          [b.school_id, b.booking_id, id(photo), b.revision],
        ),
      );
    const writes = [
      write(
        "UPDATE lord_bookings SET status='COLLECTED',revision=revision+1,updated_at=? WHERE school_id=? AND booking_id=?",
        [now, b.school_id, b.booking_id],
      ),
    ];
    for (const item of items) {
      writes.push(
        write(
          "UPDATE lord_booking_items SET collected_quantity=? WHERE school_id=? AND booking_id=? AND resource_id=?",
          [
            item.collected_quantity,
            b.school_id,
            b.booking_id,
            item.resource_id,
          ],
        ),
      );
      writes.push(
        write(
          "INSERT INTO lord_item_events(school_id,event_id,booking_id,resource_id,kind,quantity,operation_id,actor_id,recorded_at,details_json) VALUES(?,?,?,?,'collect',?,?,?,?,?)",
          [
            b.school_id,
            `${op.operationId}:${item.resource_id}`,
            b.booking_id,
            item.resource_id,
            item.collected_quantity,
            op.operationId,
            ctx.principal.actorId,
            now,
            canonical({ photoIds }),
          ],
        ),
      );
    }
    const bookingDetails = JSON.parse(b.details_json);
    for (const kind of ["styluses", "headphones"]) {
      const isBooked =
          kind === "styluses"
            ? bookingDetails.styluses
            : bookingDetails.headphones,
        item = input.accessories?.[kind];
      if (isBooked && !item)
        fail(
          "COLLECTION_DETAILS_REQUIRED",
          "Confirm the collected " + kind + " quantity.",
        );
      const quantity = integer(
        item?.quantity ?? 0,
        0,
        200,
        "accessory quantity",
      );
      if (!isBooked && quantity)
        fail("BOOKING_SCOPE", "Accessory was not reserved.", 409);
      if (quantity) {
        if (!Array.isArray(item.photoIds) || !item.photoIds.length)
          fail("PHOTO_REQUIRED", "Upload the " + kind + " collection photo.");
        for (const photo of item.photoIds)
          guards.push(
            guard(
              "SELECT EXISTS(SELECT 1 FROM lord_photos WHERE school_id=? AND booking_id=? AND photo_id=? AND phase='collection' AND booking_revision=?) AS ok",
              [b.school_id, b.booking_id, id(photo), b.revision],
            ),
          );
      }
      writes.push(
        write(
          "INSERT INTO lord_accessories(school_id,booking_id,kind,collected_quantity) VALUES(?,?,?,?)",
          [b.school_id, b.booking_id, kind, quantity],
        ),
      );
    }
    return {
      guards,
      writes,
      result: {
        bookingId: b.booking_id,
        sessionId: b.booking_id,
        status: "COLLECTED",
        revision: b.revision + 1,
      },
      // The owner scheduler creates return reminders only in the actual
      // five-minute booking window. Historical fixed-time jobs stay intact.
      outbox: [],
    };
  });
}
async function returnItems(ctx, input) {
  return mutate(ctx, "return", async ({ op, now }) => {
    const b = await booking(
      ctx.env.DB,
      ctx.principal.schoolId,
      input.bookingId || input.sessionId,
    );
    requireOwner(ctx.principal, b, { allowRelief: true });
    changed(b, input.revision);
    if (!["COLLECTED", "CLOSED"].includes(b.status))
      fail(
        "BOOKING_STATE",
        "Only a collected or administratively closed booking can be physically returned.",
        409,
      );
    const all = await query(
      ctx.env.DB,
      "SELECT * FROM lord_booking_items WHERE school_id=? AND booking_id=?",
      [b.school_id, b.booking_id],
    );
    if (
      !Array.isArray(input.items) ||
      input.items.length > 20 ||
      (!input.items.length && !input.accessories)
    )
      fail("INVALID_INPUT", "Specify the returned resources or accessories.");
    const seen = new Set(),
      writes = [],
      guards = [bookingGuard(b), unarchivedGuard(b)];
    let returned = all.reduce((a, i) => a + i.returned_quantity, 0);
    const total = all.reduce((a, i) => a + i.collected_quantity, 0);
    for (const r of input.items) {
      const resourceId = id(r.resourceId);
      if (seen.has(resourceId))
        fail("INVALID_INPUT", "Duplicate return resource.");
      seen.add(resourceId);
      const item = all.find((i) => i.resource_id === resourceId);
      if (!item) fail("INVALID_INPUT", "Resource was not collected.");
      const quantity = integer(
          r.quantity,
          1,
          item.collected_quantity - item.returned_quantity,
          "returned quantity",
        ),
        issue = integer(r.issueQuantity ?? 0, 0, quantity, "issue quantity");
      if (issue && !String(r.issueDescription || "").trim())
        fail("INVALID_INPUT", "Describe the issue.");
      returned += quantity;
      const photoIds = r.photoIds || [];
      if (!Array.isArray(photoIds) || !photoIds.length || photoIds.length > 20)
        fail(
          "PHOTO_REQUIRED",
          "Upload a return photo for each returned resource.",
        );
      for (const photo of photoIds)
        guards.push(
          guard(
            "SELECT EXISTS(SELECT 1 FROM lord_photos WHERE school_id=? AND booking_id=? AND photo_id=? AND phase='return' AND booking_revision=?) AS ok",
            [b.school_id, b.booking_id, id(photo), b.revision],
          ),
        );
      writes.push(
        write(
          "UPDATE lord_booking_items SET returned_quantity=returned_quantity+?,issue_quantity=issue_quantity+? WHERE school_id=? AND booking_id=? AND resource_id=?",
          [quantity, issue, b.school_id, b.booking_id, resourceId],
        ),
        write(
          "INSERT INTO lord_item_events(school_id,event_id,booking_id,resource_id,kind,quantity,operation_id,actor_id,recorded_at,details_json) VALUES(?,?,?,?,'return',?,?,?,?,?)",
          [
            b.school_id,
            `${op.operationId}:${resourceId}`,
            b.booking_id,
            resourceId,
            quantity,
            op.operationId,
            ctx.principal.actorId,
            now,
            canonical({
              issueQuantity: issue,
              description: text(r.issueDescription || "", "issue description"),
              photoIds,
            }),
          ],
        ),
      );
      if (issue)
        writes.push(
          write(
            "INSERT INTO lord_incidents(school_id,incident_id,booking_id,staff_id,status,revision,details_json,created_at) VALUES(?,?,?,?,'open',1,?,?)",
            [
              b.school_id,
              await generatedId("i", op.operationId, resourceId),
              b.booking_id,
              b.staff_id,
              canonical({
                resourceId,
                quantity: issue,
                description: r.issueDescription,
                photoIds,
              }),
              now,
            ],
          ),
        );
    }
    const accessories = await query(
      ctx.env.DB,
      "SELECT * FROM lord_accessories WHERE school_id=? AND booking_id=?",
      [b.school_id, b.booking_id],
    );
    let accessoriesPending = 0;
    for (const a of accessories) {
      const item = input.accessories?.[a.kind],
        quantity = item
          ? integer(
              item.quantity,
              0,
              a.collected_quantity - a.returned_quantity,
              "accessory return quantity",
            )
          : 0;
      if (quantity) {
        if (!Array.isArray(item.photoIds) || !item.photoIds.length)
          fail("PHOTO_REQUIRED", "Upload the " + a.kind + " return photo.");
        for (const photo of item.photoIds)
          guards.push(
            guard(
              "SELECT EXISTS(SELECT 1 FROM lord_photos WHERE school_id=? AND booking_id=? AND photo_id=? AND phase='return' AND booking_revision=?) AS ok",
              [b.school_id, b.booking_id, id(photo), b.revision],
            ),
          );
        writes.push(
          write(
            "UPDATE lord_accessories SET returned_quantity=returned_quantity+? WHERE school_id=? AND booking_id=? AND kind=?",
            [quantity, b.school_id, b.booking_id, a.kind],
          ),
        );
      }
      accessoriesPending +=
        a.collected_quantity - a.returned_quantity - quantity;
    }
    const status =
      returned === total && accessoriesPending === 0
        ? "RETURNED"
        : b.status === "CLOSED"
          ? "CLOSED"
          : "COLLECTED";
    writes.push(
      write(
        "UPDATE lord_bookings SET status=?,revision=revision+1,updated_at=? WHERE school_id=? AND booking_id=?",
        [status, now, b.school_id, b.booking_id],
      ),
    );
    return {
      guards,
      writes,
      result: {
        bookingId: b.booking_id,
        sessionId: b.booking_id,
        status,
        revision: b.revision + 1,
        returnedQuantity: returned,
        remainingQuantity: total - returned,
        remainingAccessories: accessoriesPending,
      },
    };
  });
}
async function savePhoto(ctx, input) {
  return mutate(ctx, "photo-upload", async ({ op, now }) => {
    const b = await booking(
      ctx.env.DB,
      ctx.principal.schoolId,
      input.bookingId,
    );
    requireOwner(ctx.principal, b, { allowRelief: true });
    if (!["BOOKED", "COLLECTED", "CLOSED"].includes(b.status))
      fail(
        "BOOKING_STATE",
        "Photo evidence cannot be added to this booking.",
        409,
      );
    const phase = b.status === "BOOKED" ? "collection" : "return";
    if (input.phase && input.phase !== phase)
      fail("PHOTO_PHASE", "Photo belongs to a different booking stage.", 409);
    if (!ctx.env.ARTIFACTS)
      fail(
        "STORAGE_UNAVAILABLE",
        "Private photo storage is not configured.",
        503,
      );
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(input.mime) ||
      typeof input.base64 !== "string" ||
      input.base64.length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 4
    )
      fail("INVALID_PHOTO", "Use a JPEG, PNG or WebP photo within 2 MiB.");
    let raw;
    try {
      raw = Uint8Array.from(atob(input.base64), (c) => c.charCodeAt(0));
    } catch {
      fail("INVALID_PHOTO", "The photo encoding is invalid.");
    }
    if (!raw.length || raw.length > MAX_PHOTO_BYTES)
      fail("INVALID_PHOTO", "Photo exceeds the size limit.");
    const signature =
      input.mime === "image/jpeg"
        ? raw[0] === 255 && raw[1] === 216
        : input.mime === "image/png"
          ? raw[0] === 137 && raw[1] === 80 && raw[2] === 78 && raw[3] === 71
          : String.fromCharCode(...raw.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...raw.slice(8, 12)) === "WEBP";
    if (!signature)
      fail("INVALID_PHOTO", "Photo content does not match its media type.");
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", raw)),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
    if (input.sha256 && input.sha256 !== hash)
      fail("INTEGRITY_FAILED", "Photo checksum differs.");
    const photoId = await generatedId("photo", op.operationId),
      key = `${b.school_id}/lord/photos/${b.booking_id}/${hash}`;
    await ctx.env.ARTIFACTS.put(key, raw, {
      httpMetadata: { contentType: input.mime },
      customMetadata: { sha256: hash },
    });
    const saved = await ctx.env.ARTIFACTS.get(key);
    if (
      !saved ||
      saved.size !== raw.length ||
      saved.customMetadata?.sha256 !== hash
    )
      fail("STORAGE_UNAVAILABLE", "Photo was not durably confirmed.", 503);
    const readback = await saved.arrayBuffer();
    const observed = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", readback)),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
    if (observed !== hash)
      fail("INTEGRITY_FAILED", "Photo readback checksum differs.", 503);
    return {
      guards: [bookingGuard(b), unarchivedGuard(b)],
      writes: [
        write(
          "INSERT INTO lord_photos(school_id,photo_id,booking_id,object_key,sha256,mime,bytes,actor_id,recorded_at,booking_revision,phase) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          [
            b.school_id,
            photoId,
            b.booking_id,
            key,
            hash,
            input.mime,
            raw.length,
            ctx.principal.actorId,
            now,
            b.revision,
            phase,
          ],
        ),
      ],
      result: {
        photoId,
        bookingId: b.booking_id,
        sha256: hash,
        bytes: raw.length,
      },
    };
  });
}
async function readPhoto(ctx, photoId) {
  const row = await one(
    ctx.env.DB,
    "SELECT * FROM lord_photos WHERE school_id=? AND photo_id=?",
    [ctx.principal.schoolId, id(photoId)],
  );
  if (!row) fail("NOT_FOUND", "Photo not found.", 404);
  const b = await booking(ctx.env.DB, row.school_id, row.booking_id);
  requireOwner(ctx.principal, b);
  const stored = await ctx.env.ARTIFACTS?.get(row.object_key);
  if (!stored || stored.customMetadata?.sha256 !== row.sha256)
    fail("STORAGE_UNAVAILABLE", "Photo integrity could not be verified.", 503);
  const bytes = await stored.arrayBuffer(),
    hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
  if (hash !== row.sha256)
    fail("INTEGRITY_FAILED", "Photo content digest differs.", 503);
  return new Response(bytes, {
    headers: {
      "content-type": row.mime,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
async function signagePhoto(ctx, photoId) {
  const scope = ctx.principal.deviceScope;
  if (!scope?.photos)
    fail("CAPABILITY_DENIED", "This device cannot view photos.", 403);
  const row = await one(
    ctx.env.DB,
    "SELECT p.* FROM lord_photos p JOIN lord_bookings b USING(school_id,booking_id) WHERE p.school_id=? AND p.photo_id=? AND p.phase='collection' AND b.status='COLLECTED'",
    [ctx.principal.schoolId, id(photoId)],
  );
  if (!row) fail("NOT_FOUND", "Active collection photo not found.", 404);
  const resources = await query(
    ctx.env.DB,
    "SELECT resource_id FROM lord_booking_items WHERE school_id=? AND booking_id=?",
    [row.school_id, row.booking_id],
  );
  if (
    scope.resourceIds.length &&
    !resources.every((r) => scope.resourceIds.includes(r.resource_id))
  )
    fail("CAPABILITY_DENIED", "Photo is outside this device scope.", 403);
  const stored = await ctx.env.ARTIFACTS?.get(row.object_key);
  if (!stored) fail("STORAGE_UNAVAILABLE", "Photo unavailable.", 503);
  const bytes = await stored.arrayBuffer(),
    hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
  if (hash !== row.sha256)
    fail("INTEGRITY_FAILED", "Photo integrity could not be verified.", 503);
  return new Response(bytes, {
    headers: {
      "content-type": row.mime,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
async function savePreferences(ctx, input) {
  return mutate(ctx, "preferences-save", async () => {
    if (ctx.env.LORD_SCHOOL_WHATSAPP_AGREEMENT === "true")
      fail(
        "SCHOOL_MANAGED_NOTIFICATIONS",
        "Operational WhatsApp notifications are managed under the existing school agreement.",
        409,
      );
    const p = ctx.principal,
      staffId = id(input.staffId || p.staffId);
    if (staffId !== p.staffId && !has(p, "lord.admin"))
      fail("CAPABILITY_DENIED", "Preferences are outside your scope.", 403);
    const old = await one(
        ctx.env.DB,
        "SELECT * FROM lord_preferences WHERE school_id=? AND staff_id=?",
        [p.schoolId, staffId],
      ),
      revision = requireRevision(input.revision);
    if (old) changed(old, revision);
    else if (revision !== 0)
      fail("REVISION_CONFLICT", "Preferences changed.", 409);
    for (const key of ["email", "whatsapp", "telegram"])
      if (typeof input[key] !== "boolean")
        fail("INVALID_INPUT", "Set each notification preference explicitly.");
    return {
      guards: [
        old
          ? guard(
              "SELECT revision=? AS ok FROM lord_preferences WHERE school_id=? AND staff_id=?",
              [revision, p.schoolId, staffId],
            )
          : guard(
              "SELECT NOT EXISTS(SELECT 1 FROM lord_preferences WHERE school_id=? AND staff_id=?) AS ok",
              [p.schoolId, staffId],
            ),
      ],
      writes: [
        write(
          "INSERT INTO lord_preferences(school_id,staff_id,revision,email,whatsapp,telegram) VALUES(?,?,?,?,?,?) ON CONFLICT(school_id,staff_id) DO UPDATE SET revision=excluded.revision,email=excluded.email,whatsapp=excluded.whatsapp,telegram=excluded.telegram",
          [
            p.schoolId,
            staffId,
            revision + 1,
            input.email ? 1 : 0,
            input.whatsapp ? 1 : 0,
            input.telegram ? 1 : 0,
          ],
        ),
      ],
      result: {
        staffId,
        revision: revision + 1,
        email: input.email,
        whatsapp: input.whatsapp,
        telegram: input.telegram,
      },
    };
  });
}
async function refreshReferences(ctx, input) {
  return mutate(ctx, "reference-refresh", async ({ now }) => {
    if (!ctx.env.CONTACTS)
      fail("REFERENCE_UNAVAILABLE", "Contacts binding is not configured.", 503);
    const response = await ctx.env.CONTACTS.fetch(
      new Request("https://contacts.internal/internal/projection", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gsis-secret": ctx.env.GSIS_SECRET || "",
          cookie: ctx.request?.headers.get("cookie") || "",
        },
        body: JSON.stringify({
          schemaVersion: 1,
          purpose: "lord",
          schoolId: ctx.principal.schoolId,
          decisionId: ctx.principal.decisionId,
        }),
      }),
    );
    if (!response.ok)
      fail(
        "REFERENCE_UNAVAILABLE",
        "Verified Contacts reference refresh failed.",
        503,
      );
    const json = await response.json(),
      data = json.data || json;
    if (
      data.schoolId !== ctx.principal.schoolId ||
      !Array.isArray(data.staff) ||
      data.staff.length > 512 ||
      typeof data.revision !== "string" ||
      !Number.isSafeInteger(data.asOf) ||
      data.asOf > Date.now()
    )
      fail(
        "REFERENCE_UNAVAILABLE",
        "Contacts reference response is invalid.",
        503,
      );
    const p = ctx.principal,
      old = await one(
        ctx.env.DB,
        "SELECT * FROM lord_reference_state WHERE school_id=?",
        [p.schoolId],
      ),
      revision = old?.revision || 0;
    const writes = [
        write("DELETE FROM lord_references WHERE school_id=?", [p.schoolId]),
      ],
      seen = new Set();
    for (const r of data.staff) {
      if (r.active !== null && typeof r.active !== "boolean")
        fail(
          "REFERENCE_UNAVAILABLE",
          "Contacts returned unverified activity evidence.",
          503,
        );
      if (r.active !== true) continue;
      const staffId = id(r.staffId);
      if (seen.has(staffId))
        fail(
          "REFERENCE_UNAVAILABLE",
          "Contacts returned duplicate identities.",
          503,
        );
      seen.add(staffId);
      writes.push(
        write(
          "INSERT INTO lord_references(school_id,staff_id,name,email,mobile,source_revision,observed_at) VALUES(?,?,?,?,?,?,?)",
          [
            p.schoolId,
            staffId,
            text(r.name, "name", 160, true),
            r.email === null || r.email === undefined
              ? null
              : text(r.email, "email", 320),
            r.mobile === null || r.mobile === undefined
              ? null
              : text(r.mobile, "mobile", 30),
            data.revision,
            data.asOf,
          ],
        ),
      );
    }
    writes.push(
      write(
        "INSERT INTO lord_reference_state(school_id,revision,observed_at,contacts_revision,deploy_revision,next_refresh_at) VALUES(?,?,?,?,?,?) ON CONFLICT(school_id) DO UPDATE SET revision=excluded.revision,observed_at=excluded.observed_at,contacts_revision=excluded.contacts_revision,deploy_revision=excluded.deploy_revision,next_refresh_at=excluded.next_refresh_at",
        [
          p.schoolId,
          revision + 1,
          data.asOf,
          data.revision,
          data.deployRevision || null,
          nextReferenceRefresh(now),
        ],
      ),
    );
    return {
      guards: [
        old
          ? guard(
              "SELECT revision=? AS ok FROM lord_reference_state WHERE school_id=?",
              [revision, p.schoolId],
            )
          : guard(
              "SELECT NOT EXISTS(SELECT 1 FROM lord_reference_state WHERE school_id=?) AS ok",
              [p.schoolId],
            ),
      ],
      writes,
      result: {
        revision: revision + 1,
        observedAt: data.asOf,
        staffCount: data.staff.length,
        nextRefreshAt: nextReferenceRefresh(now),
      },
      outbox: [
        {
          id: `lord:reference-refresh:${revision + 1}`,
          type: "lord.reference-refresh",
          dueAt: nextReferenceRefresh(now),
          payload: {
            schoolId: p.schoolId,
            originalDecisionId: p.decisionId,
            referenceRevision: revision + 1,
          },
        },
      ],
    };
  });
}
async function incident(ctx, input, resolve) {
  return mutate(
    ctx,
    resolve ? "incident-resolve" : "incidentrespond",
    async ({ now }) => {
      const row = await one(
        ctx.env.DB,
        "SELECT * FROM lord_incidents WHERE school_id=? AND incident_id=?",
        [ctx.principal.schoolId, id(input.incidentId)],
      );
      if (!row) fail("NOT_FOUND", "Incident not found.", 404);
      if (!resolve && row.staff_id !== ctx.principal.staffId)
        fail("CAPABILITY_DENIED", "Incident is outside your scope.", 403);
      changed(row, input.revision);
      if (row.status === "resolved")
        fail("INCIDENT_STATE", "Incident already resolved.", 409);
      const guards = [
        guard(
          "SELECT revision=? AND status<>'resolved' AS ok FROM lord_incidents WHERE school_id=? AND incident_id=?",
          [row.revision, row.school_id, row.incident_id],
        ),
      ];
      if (input.token) {
        const hash = await digest(input.token),
          link = await one(
            ctx.env.DB,
            "SELECT * FROM lord_links WHERE school_id=? AND token_hash=? AND purpose='incident-response'",
            [row.school_id, hash],
          );
        if (
          !link ||
          link.incident_id !== row.incident_id ||
          link.staff_id !== row.staff_id ||
          link.revoked ||
          link.expires_at <= now
        )
          fail(
            "LINK_INVALID",
            "Incident response link is invalid or expired.",
            403,
          );
        guards.push(
          guard(
            "SELECT revoked=0 AND expires_at>? AS ok FROM lord_links WHERE school_id=? AND token_hash=?",
            [now, row.school_id, hash],
          ),
        );
      }
      const response = {
        text: text(
          input.response || input.reason || input.note,
          "response",
          4000,
          true,
        ),
        actorId: ctx.principal.actorId,
        at: now,
      };
      return {
        guards,
        writes: [
          write(
            "UPDATE lord_incidents SET status=?,revision=revision+1,response_json=? WHERE school_id=? AND incident_id=?",
            [
              resolve ? "resolved" : "responded",
              canonical(response),
              row.school_id,
              row.incident_id,
            ],
          ),
        ],
        result: {
          incidentId: row.incident_id,
          status: resolve ? "resolved" : "responded",
          revision: row.revision + 1,
        },
      };
    },
  );
}
async function incidentResponseContext(ctx, input) {
  const row = await one(
    ctx.env.DB,
    "SELECT * FROM lord_incidents WHERE school_id=? AND incident_id=?",
    [ctx.principal.schoolId, id(input.incidentId)],
  );
  if (!row) fail("NOT_FOUND", "Incident not found.", 404);
  if (row.staff_id !== ctx.principal.staffId)
    fail("CAPABILITY_DENIED", "Incident is outside your scope.", 403);
  const token = ctx.request.headers.get("x-gsis-incident-token");
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    fail("LINK_INVALID", "A valid incident response link is required.", 403);
  const link = await one(
    ctx.env.DB,
    "SELECT * FROM lord_links WHERE school_id=? AND token_hash=? AND purpose='incident-response'",
    [row.school_id, await digest(token)],
  );
  if (
    !link ||
    link.incident_id !== row.incident_id ||
    link.booking_id !== row.booking_id ||
    link.staff_id !== row.staff_id ||
    link.revoked ||
    link.expires_at <= (ctx.now ?? Date.now())
  )
    fail("LINK_INVALID", "Incident response link is invalid or expired.", 403);
  return {
    incidentId: row.incident_id,
    bookingId: row.booking_id,
    staffId: row.staff_id,
    revision: row.revision,
    status: row.status,
    details: JSON.parse(row.details_json),
    response: row.response_json ? JSON.parse(row.response_json) : null,
  };
}
async function compliance(ctx) {
  const school = ctx.principal.schoolId,
    period = await one(
      ctx.env.DB,
      "SELECT * FROM lord_periods WHERE school_id=? AND status='active'",
      [school],
    ),
    periodId = period?.period_id || "initial";
  const rows = await query(
    ctx.env.DB,
    "SELECT i.*,b.period_id,b.service_date,b.start_period,b.end_period,b.details_json AS booking_details,ref.name AS teacher FROM lord_incidents i JOIN lord_bookings b USING(school_id,booking_id) LEFT JOIN lord_references ref ON ref.school_id=i.school_id AND ref.staff_id=i.staff_id WHERE i.school_id=? ORDER BY i.created_at DESC LIMIT 501",
    [school],
  );
  if (rows.length > 500)
    fail(
      "RESULT_BOUNDS",
      "Incident history exceeds the view bound; use an archive export.",
      422,
    );
  const incidents = [],
    historicalReviews = [];
  for (const row of rows) {
    const details = JSON.parse(row.details_json),
      bookingDetails = JSON.parse(row.booking_details),
      response = row.response_json ? JSON.parse(row.response_json) : null;
    if (row.period_id !== periodId) {
      if (response)
        historicalReviews.push({
          incidentId: row.incident_id,
          note: response.text,
          archivePeriod: row.period_id,
        });
      continue;
    }
    if (!["photos-missing", "historical-photo-omission"].includes(details.kind))
      continue;
    const resources = await query(
      ctx.env.DB,
      "SELECT r.name,i.collected_quantity FROM lord_booking_items i JOIN lord_resources r USING(school_id,resource_id) WHERE i.school_id=? AND i.booking_id=?",
      [school, row.booking_id],
    );
    incidents.push({
      incidentId: row.incident_id,
      bookingId: row.booking_id,
      revision: row.revision,
      teacher: row.teacher || row.staff_id,
      resource: resources.map((r) => r.name).join(", "),
      date: row.service_date,
      start: "P" + row.start_period,
      end: "P" + (row.end_period - 1),
      classOrActivity: bookingDetails.classOrActivity,
      subject: bookingDetails.subject,
      phase: details.phase?.includes("return") ? "return" : "collection",
      status: row.status,
      recordedAt: row.created_at,
      actor: details.declaration?.actorId || "",
      collector: details.declaration?.actorId || "",
      collectedQuantity: resources.reduce(
        (n, r) => n + r.collected_quantity,
        0,
      ),
      resolution: response
        ? { note: response.text, actor: response.actorId, at: response.at }
        : null,
    });
  }
  return {
    collection: incidents.filter((i) => i.phase === "collection").length,
    return: incidents.filter((i) => i.phase === "return").length,
    total: incidents.length,
    affectedBookings: new Set(incidents.map((i) => i.bookingId)).size,
    period: {
      id: periodId,
      label: periodId,
      startedAt: period?.starts_at || null,
    },
    incidents,
    historicalReviews,
  };
}
async function dashboard(ctx, input) {
  const date = day(input.date || sgDay(ctx.now ?? Date.now())),
    ref = await reference(ctx),
    bookings = await listBookings(ctx, { ...input, date }, "all"),
    movements = [];
  for (const b of bookings) {
    b.startIndex = ref.periods.findIndex(
      (p) => Number(p.code) === Number(b.startPeriod),
    );
    b.endIndex = ref.periods.findIndex(
      (p) => Number(p.code) === Number(b.endPeriod),
    );
    b.startTime = ref.periods[b.startIndex]?.start || "";
    b.endTime = ref.periods[b.endIndex]?.end || "";
    b.bookedFor = b.teacher;
    b.createdBy =
      b.createdByStaffId === b.staffId ? b.teacher : b.createdByStaffId;
    if (
      !["COLLECTED", "RETURNED", "CLOSED", "DECLARED_RETURNED"].includes(
        b.status,
      )
    )
      continue;
    const events = await query(
        ctx.env.DB,
        "SELECT * FROM lord_item_events WHERE school_id=? AND booking_id=? ORDER BY recorded_at,event_id",
        [ctx.principal.schoolId, b.bookingId],
      ),
      collected = events.find((e) => e.kind === "collect"),
      returned = events.filter((e) => e.kind === "return").at(-1),
      details = b.lastDeclaration;
    const photo = (event) => {
      const ids = event ? JSON.parse(event.details_json).photoIds || [] : [];
      return ids.length ? "/api/lord/photos/" + encodeURIComponent(ids[0]) : "";
    };
    const trolleyPhotos = b.trolleys.map((t) => {
      const loan = events.find(
          (e) => e.resource_id === t.resourceId && e.kind === "collect",
        ),
        ret = events
          .filter((e) => e.resource_id === t.resourceId && e.kind === "return")
          .at(-1),
        issue =
          b.items.find((i) => i.resourceId === t.resourceId)?.issueQuantity ||
          0;
      return {
        name: t.name,
        loanQuantity: t.quantity,
        returnQuantity: t.returnedQuantity,
        loanPhotoUrl: photo(loan),
        returnPhotoUrl: photo(ret),
        loanPhotoTimestamp: loan?.recorded_at || null,
        returnPhotoTimestamp: ret?.recorded_at || null,
        returnIssue: issue > 0,
        issueQuantity: issue,
        returnNotes: ret ? JSON.parse(ret.details_json).description || "" : "",
      };
    });
    const loanMs =
        collected?.recorded_at ||
        (details?.response === "collected" ? details.at : 0),
      returnMs = returned?.recorded_at || 0;
    movements.push({
      booking: b,
      bookingId: b.bookingId,
      sessionId: b.bookingId,
      revision: b.revision,
      resource: b.resource,
      status: b.status,
      isOpen: b.status === "COLLECTED",
      collector: collected?.actor_id || details?.actorId || "",
      loanMs,
      loanTimestamp: loanMs ? new Date(loanMs).toISOString() : "",
      returnMs,
      returnTimestamp: returnMs ? new Date(returnMs).toISOString() : "",
      returnTeacher: returned?.actor_id || "",
      expectedEndMs: b.endTime
        ? Date.parse(date + "T" + b.endTime + ":00+08:00")
        : 0,
      deviceTotal: b.items.reduce((n, i) => n + i.collectedQuantity, 0),
      returnDeviceTotal: b.items.reduce((n, i) => n + i.returnedQuantity, 0),
      returnIssue: b.items.some((i) => i.issueQuantity > 0),
      trolleyNames: b.trolleys.map((t) => t.name),
      trolleyPhotos,
      physicalReturnConfirmed: b.status === "RETURNED",
    });
  }
  const open = movements.filter((m) => m.isOpen),
    now = ctx.now ?? Date.now();
  return {
    date,
    bookings,
    movements,
    resources: ref.bookingResources,
    periods: ref.periods,
    reference: ref,
    graceMinutes: 30,
    metrics: {
      openLoans: open.length,
      overdueLoans: open.filter(
        (m) => m.expectedEndMs && now > m.expectedEndMs + 1800000,
      ).length,
      trolleysOut: open.reduce((n, m) => n + m.trolleyNames.length, 0),
      devicesOut: open.reduce(
        (n, m) => n + m.deviceTotal - m.returnDeviceTotal,
        0,
      ),
      returnedToday: movements.filter((m) => m.status === "RETURNED").length,
    },
    telegram: {
      triggerInstalled:
        ctx.env.SCHEDULER_OWNER === "v1" &&
        !!ctx.env.LORD_MONITOR_TELEGRAM_CHAT_ID,
      checkEveryMinutes: 60,
    },
    generatedAt: new Date(now).toISOString(),
  };
}
async function archiveDownload(ctx, input) {
  const row = await one(
    ctx.env.DB,
    "SELECT manifest_json FROM lord_periods WHERE school_id=? AND period_id=? AND status='closed'",
    [ctx.principal.schoolId, id(input.periodId)],
  );
  if (!row) fail("NOT_FOUND", "Archive not found.", 404);
  const manifest = JSON.parse(row.manifest_json),
    file = manifest.files?.find((f) => f.format === input.format);
  if (!file) fail("NOT_FOUND", "Archive format not found.", 404);
  const object = await ctx.env.ARTIFACTS?.get(file.objectKey);
  if (!object) fail("STORAGE_UNAVAILABLE", "Archive unavailable.", 503);
  const text = await object.text();
  if ((await digest(text)) !== file.sha256)
    fail("INTEGRITY_FAILED", "Archive digest mismatch.", 503);
  return new Response(text, {
    headers: {
      "content-type": file.mime,
      "content-disposition": `attachment; filename="${file.name}"`,
      "cache-control": "private, no-store",
    },
  });
}

async function reignPreview(ctx) {
  requireCapability(ctx.principal, "lord.admin");
  const school = ctx.principal.schoolId,
    period = await one(
      ctx.env.DB,
      "SELECT * FROM lord_periods WHERE school_id=? AND status='active'",
      [school],
    ),
    periodId = period?.period_id || "initial",
    cutoffDate = sgDay(ctx.now ?? Date.now());
  const counts = await query(
    ctx.env.DB,
    "SELECT status,COUNT(*) AS total FROM lord_bookings WHERE school_id=? AND period_id=? AND service_date<=? GROUP BY status",
    [school, periodId, cutoffDate],
  );
  const open = await one(
    ctx.env.DB,
    "SELECT COUNT(*) AS total FROM lord_bookings WHERE school_id=? AND period_id=? AND status='COLLECTED'",
    [school, periodId],
  );
  const future = await one(
    ctx.env.DB,
    "SELECT COUNT(*) AS total FROM lord_bookings WHERE school_id=? AND period_id=? AND service_date>?",
    [school, periodId, cutoffDate],
  );
  const version = await one(
    ctx.env.DB,
    "SELECT COUNT(*) AS count,COALESCE(SUM(revision),0) AS revisions FROM lord_bookings WHERE school_id=? AND period_id=?",
    [school, periodId],
  );
  const range = await one(
    ctx.env.DB,
    "SELECT MIN(service_date) AS first,MAX(service_date) AS last FROM lord_bookings WHERE school_id=? AND period_id=? AND service_date<=?",
    [school, periodId, cutoffDate],
  );
  return {
    periodId,
    revision: period?.revision || 0,
    confirmationText: "CLOSE " + periodId + " THROUGH " + cutoffDate,
    periodStart: range.first || null,
    periodEnd: range.last || null,
    rowCounts: Object.fromEntries(counts.map((r) => [r.status, r.total])),
    totalPreservedRows: future.total,
    statistics: {
      bookings: counts.reduce((n, r) => n + r.total, 0),
      movementSessions: counts
        .filter((r) => !["BOOKED", "CANCELLED"].includes(r.status))
        .reduce((n, r) => n + r.total, 0),
    },
    cutoffDate,
    counts,
    preservedFutureBookings: future.total,
    sourceVersion: version,
    blockers: open.total
      ? [{ status: "OPEN_PHYSICAL_CUSTODY", total: open.total }]
      : [],
    warnings: counts
      .filter((r) => ["CLOSED", "DECLARED_RETURNED"].includes(r.status))
      .map((r) => ({ ...r, physicalQuantityConfirmed: false })),
    closesAfter: "18:00 Asia/Singapore",
    destructive: false,
    recordsRetained: true,
  };
}
async function reignClose(ctx, input) {
  return mutate(ctx, "reignclose", async ({ now, op }) => {
    const preview = await reignPreview(ctx);
    if (new Date(now + 8 * 3600000).getUTCHours() < 18)
      fail(
        "ARCHIVE_WINDOW",
        "REIGN closes only after 18:00 Singapore time.",
        409,
      );
    if (
      preview.periodId !== input.periodId ||
      preview.revision !== input.revision
    )
      fail("REVISION_CONFLICT", "REIGN period changed.", 409);
    if (preview.blockers.length)
      fail(
        "OPEN_OBLIGATIONS",
        "Resolve open physical custody before closing this period.",
        409,
      );
    if (
      !input.sourceVersion ||
      canonical(input.sourceVersion) !== canonical(preview.sourceVersion)
    )
      fail(
        "REVISION_CONFLICT",
        "Review the current logging period again before closing.",
        409,
      );
    if (input.confirmation !== preview.confirmationText)
      fail("CONFIRMATION_REQUIRED", "Type the exact period confirmation.");
    if (!ctx.env.ARTIFACTS)
      fail("STORAGE_UNAVAILABLE", "Private archive storage is required.", 503);
    const school = ctx.principal.schoolId,
      bookings = await query(
        ctx.env.DB,
        "SELECT * FROM lord_bookings WHERE school_id=? AND period_id=? AND service_date<=? ORDER BY booking_id LIMIT 2001",
        [school, preview.periodId, preview.cutoffDate],
      );
    if (bookings.length > 2000)
      fail(
        "ARCHIVE_BOUNDS",
        "Archive exceeds the current 2,000-booking bound. Keep the period open for administrator recovery.",
        422,
      );
    const items = await query(
      ctx.env.DB,
      "SELECT i.* FROM lord_booking_items i JOIN lord_bookings b USING(school_id,booking_id) WHERE b.school_id=? AND b.period_id=? AND b.service_date<=? ORDER BY booking_id,resource_id",
      [school, preview.periodId, preview.cutoffDate],
    );
    const events = await query(
      ctx.env.DB,
      "SELECT e.* FROM lord_item_events e JOIN lord_bookings b USING(school_id,booking_id) WHERE b.school_id=? AND b.period_id=? AND b.service_date<=? ORDER BY recorded_at,event_id",
      [school, preview.periodId, preview.cutoffDate],
    );
    const accessories = await query(
        ctx.env.DB,
        "SELECT a.* FROM lord_accessories a JOIN lord_bookings b USING(school_id,booking_id) WHERE b.school_id=? AND b.period_id=? AND b.service_date<=?",
        [school, preview.periodId, preview.cutoffDate],
      ),
      photos = await query(
        ctx.env.DB,
        "SELECT p.* FROM lord_photos p JOIN lord_bookings b USING(school_id,booking_id) WHERE b.school_id=? AND b.period_id=? AND b.service_date<=?",
        [school, preview.periodId, preview.cutoffDate],
      );
    const incidents = await query(
      ctx.env.DB,
      "SELECT i.* FROM lord_incidents i JOIN lord_bookings b USING(school_id,booking_id) WHERE b.school_id=? AND b.period_id=? AND b.service_date<=?",
      [school, preview.periodId, preview.cutoffDate],
    );
    const artifactGuard = guard(
      "SELECT (SELECT COUNT(*) FROM lord_photos p JOIN lord_bookings b USING(school_id,booking_id) WHERE b.school_id=? AND b.period_id=? AND b.service_date<=?)=? AND (SELECT COUNT(*) FROM lord_incidents i JOIN lord_bookings b USING(school_id,booking_id) WHERE b.school_id=? AND b.period_id=? AND b.service_date<=?)=? AND (SELECT COALESCE(SUM(i.revision),0) FROM lord_incidents i JOIN lord_bookings b USING(school_id,booking_id) WHERE b.school_id=? AND b.period_id=? AND b.service_date<=?)=? AS ok",
      [
        school,
        preview.periodId,
        preview.cutoffDate,
        photos.length,
        school,
        preview.periodId,
        preview.cutoffDate,
        incidents.length,
        school,
        preview.periodId,
        preview.cutoffDate,
        incidents.reduce((n, i) => n + i.revision, 0),
      ],
    );
    const archive = {
        schemaVersion: 1,
        schoolId: school,
        periodId: preview.periodId,
        bookings,
        items,
        accessories,
        photos,
        events,
        incidents,
        recordedAt: now,
      },
      raw = canonical(archive);
    if (new TextEncoder().encode(raw).length > 8 * 1024 * 1024)
      fail(
        "ARCHIVE_BOUNDS",
        "Archive exceeds 8 MiB. No records were removed.",
        422,
      );
    const sha = await digest(raw),
      key = `${school}/lord/archives/${preview.periodId}/${sha}.json`;
    await ctx.env.ARTIFACTS.put(key, raw, { customMetadata: { sha256: sha } });
    const verified = await ctx.env.ARTIFACTS.get(key);
    if (!verified || (await digest(await verified.text())) !== sha)
      fail(
        "ARCHIVE_UNCONFIRMED",
        "Archive integrity was not confirmed. The period remains open.",
        503,
      );
    const files = [
      {
        format: "json",
        name: "LORD_Archive_" + preview.periodId + ".json",
        objectKey: key,
        sha256: sha,
        mime: "application/json",
      },
    ];
    const markdown =
      "# LORD logging period " +
      preview.periodId +
      "\n\nBookings: " +
      bookings.length +
      "\nMovement events: " +
      events.length +
      "\nIncidents: " +
      incidents.length +
      "\n\nUnconfirmed physical custody warnings: " +
      canonical(preview.warnings) +
      "\n\nFuture bookings preserved: " +
      preview.preservedFutureBookings +
      "\n";
    const escape = (s) =>
      s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    for (const [format, mime, content] of [
      ["md", "text/markdown", markdown],
      ["html", "text/html", wrappedReport(archive)],
    ]) {
      const fileSha = await digest(content),
        fileKey = `${school}/lord/archives/${preview.periodId}/${fileSha}.${format}`;
      await ctx.env.ARTIFACTS.put(fileKey, content);
      const stored = await ctx.env.ARTIFACTS.get(fileKey);
      if (!stored || (await digest(await stored.text())) !== fileSha)
        fail(
          "ARCHIVE_UNCONFIRMED",
          "Report integrity could not be confirmed.",
          503,
        );
      files.push({
        format,
        name:
          "LORD_" +
          (format === "md" ? "Statistics" : "Wrapped") +
          "_" +
          preview.periodId +
          "." +
          format,
        objectKey: fileKey,
        sha256: fileSha,
        mime,
      });
    }
    for (const file of files)
      file.url =
        "/api/lord/reign/archive?periodId=" +
        encodeURIComponent(preview.periodId) +
        "&format=" +
        file.format;
    const manifest = {
        ...preview,
        files,
        closedAt: now,
        closedBy: ctx.principal.actorId,
        objectKey: key,
        sha256: sha,
        bytes: new TextEncoder().encode(raw).length,
      },
      next = id(
        input.nextPeriodId || (await generatedId("period", op.operationId)),
      );
    return {
      guards: [
        artifactGuard,
        guard(
          "SELECT NOT EXISTS(SELECT 1 FROM lord_bookings WHERE school_id=? AND period_id=? AND status='COLLECTED') AS ok",
          [school, preview.periodId],
        ),
        guard(
          "SELECT COALESCE((SELECT revision FROM lord_periods WHERE school_id=? AND status='active'),0)=? AS ok",
          [school, preview.revision],
        ),
        guard(
          "SELECT COUNT(*)=? AND COALESCE(SUM(revision),0)=? AS ok FROM lord_bookings WHERE school_id=? AND period_id=?",
          [
            preview.sourceVersion.count,
            preview.sourceVersion.revisions,
            school,
            preview.periodId,
          ],
        ),
      ],
      writes: [
        write(
          "INSERT INTO lord_periods(school_id,period_id,status,revision,starts_at,closed_at,manifest_json) VALUES(?,?,'closed',?,0,?,?) ON CONFLICT(school_id,period_id) DO UPDATE SET status='closed',revision=excluded.revision,closed_at=excluded.closed_at,manifest_json=excluded.manifest_json",
          [
            school,
            preview.periodId,
            preview.revision + 1,
            now,
            canonical(manifest),
          ],
        ),
        write(
          "INSERT INTO lord_periods(school_id,period_id,status,revision,starts_at) VALUES(?,?,'active',1,?)",
          [school, next, now],
        ),
        write(
          "UPDATE lord_bookings SET period_id=?,updated_at=? WHERE school_id=? AND period_id=? AND service_date>?",
          [next, now, school, preview.periodId, preview.cutoffDate],
        ),
      ],
      result: {
        closedPeriod: preview.periodId,
        nextPeriodId: next,
        manifest,
        files: files.map(({ name, url }) => ({ name, url })),
        periodStart: preview.periodStart,
        periodEnd: preview.periodEnd,
        recordsRetained: true,
      },
    };
  });
}

async function settingsSave(ctx, input) {
  return mutate(ctx, "settings-save", async () => {
    const key = text(input.key, "setting key", 80, true);
    if (
      ![
        "periodTimings",
        "reminders",
        "autoClose",
        "notificationTemplates",
        "referenceLists",
      ].includes(key)
    )
      fail("INVALID_INPUT", "Unknown LORD setting.");
    const old = await one(
        ctx.env.DB,
        "SELECT * FROM lord_settings WHERE school_id=? AND setting_key=?",
        [ctx.principal.schoolId, key],
      ),
      revision = requireRevision(input.revision);
    if ((old?.revision || 0) !== revision)
      fail("REVISION_CONFLICT", "Settings changed.", 409);
    if (
      !input.value ||
      typeof input.value !== "object" ||
      Array.isArray(input.value)
    )
      fail("INVALID_INPUT", "Invalid settings value.");
    validateSettings(key, input.value);
    const timetableGuards =
      key === "periodTimings" &&
      (!old || canonical(JSON.parse(old.value_json)) !== canonical(input.value))
        ? [
            guard(
              "SELECT NOT EXISTS(SELECT 1 FROM lord_bookings WHERE school_id=? AND status IN ('BOOKED','COLLECTED')) AS ok",
              [ctx.principal.schoolId],
            ),
          ]
        : [];
    return {
      guards: [
        ...timetableGuards,
        guard(
          "SELECT COALESCE((SELECT revision FROM lord_settings WHERE school_id=? AND setting_key=?),0)=? AS ok",
          [ctx.principal.schoolId, key, revision],
        ),
      ],
      writes: [
        write(
          "INSERT INTO lord_settings(school_id,setting_key,revision,value_json) VALUES(?,?,?,?) ON CONFLICT(school_id,setting_key) DO UPDATE SET revision=excluded.revision,value_json=excluded.value_json",
          [ctx.principal.schoolId, key, revision + 1, canonical(input.value)],
        ),
      ],
      result: { key, revision: revision + 1 },
    };
  });
}
async function makeLink(ctx, input) {
  return mutate(ctx, "link-create", async ({ now, op }) => {
    if (
      !["booking-response", "incident-response", "signage"].includes(
        input.purpose,
      )
    )
      fail("INVALID_INPUT", "Unknown link purpose.");
    const expiresAt = integer(
      input.expiresAt,
      now + 1000,
      now + 30 * 86400000,
      "link expiry",
    );
    let b = null,
      incidentRow = null;
    if (input.bookingId) {
      b = await booking(ctx.env.DB, ctx.principal.schoolId, input.bookingId);
    }
    if (input.purpose === "booking-response" && !b)
      fail("INVALID_INPUT", "A booking response link requires its booking.");
    if (input.purpose === "incident-response") {
      incidentRow = await one(
        ctx.env.DB,
        "SELECT * FROM lord_incidents WHERE school_id=? AND incident_id=?",
        [ctx.principal.schoolId, id(input.incidentId)],
      );
      if (!incidentRow) fail("NOT_FOUND", "Incident not found.", 404);
      if (input.incidentRevision !== undefined)
        changed(incidentRow, input.incidentRevision);
      if (b && b.booking_id !== incidentRow.booking_id)
        fail("LINK_SCOPE", "Incident does not belong to this booking.", 409);
      b = await booking(
        ctx.env.DB,
        ctx.principal.schoolId,
        incidentRow.booking_id,
      );
    }
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
        x.toString(16).padStart(2, "0"),
      ).join(""),
      hash = await digest(token);
    const scope = {
      bookingId: b?.booking_id || null,
      incidentId: input.incidentId || null,
      deviceId: input.purpose === "signage" ? id(input.deviceId) : null,
      resourceIds:
        input.purpose === "signage" && Array.isArray(input.resourceIds)
          ? input.resourceIds.map((r) => id(r))
          : [],
      photos: input.purpose === "signage" && input.photos === true,
    };
    return {
      guards: [
        ...(b ? [bookingGuard(b)] : []),
        ...(incidentRow
          ? [
              guard(
                "SELECT revision=? AS ok FROM lord_incidents WHERE school_id=? AND incident_id=?",
                [
                  incidentRow.revision,
                  incidentRow.school_id,
                  incidentRow.incident_id,
                ],
              ),
            ]
          : []),
      ],
      writes: [
        write(
          "INSERT INTO lord_links(school_id,token_hash,booking_id,incident_id,purpose,staff_id,expires_at,scope_json) VALUES(?,?,?,?,?,?,?,?)",
          [
            ctx.principal.schoolId,
            hash,
            b?.booking_id || null,
            input.incidentId || null,
            input.purpose,
            b?.staff_id || null,
            expiresAt,
            canonical(scope),
          ],
        ),
      ],
      result: {
        linkId: op.operationId,
        token,
        tokenHash: hash,
        purpose: input.purpose,
        expiresAt,
      },
    };
  });
}
async function board(ctx, input) {
  requireCapability(ctx.principal, "lord.signage");
  if (input.photoId) return signagePhoto(ctx, input.photoId);
  const date = day(input.date || sgDay(ctx.now ?? Date.now())),
    rows = await query(
      ctx.env.DB,
      "SELECT b.booking_id,b.staff_id,b.service_date,b.start_period,b.end_period,b.status,b.revision,b.details_json,b.updated_at,i.resource_id,i.quantity,i.collected_quantity,i.returned_quantity,r.name,r.type,r.metadata_json,r.revision AS resource_revision,ref.name AS teacher_name FROM lord_bookings b JOIN lord_booking_items i USING(school_id,booking_id) JOIN lord_resources r USING(school_id,resource_id) LEFT JOIN lord_references ref ON ref.school_id=b.school_id AND ref.staff_id=b.staff_id WHERE b.school_id=? AND b.service_date=? AND b.status<>'CANCELLED' ORDER BY b.start_period,r.name LIMIT 501",
      [ctx.principal.schoolId, date],
    );
  if (rows.length > 500)
    fail("RESULT_BOUNDS", "Signage exceeds the configured bound.", 422);
  const allowed = ctx.principal.deviceScope?.resourceIds || [],
    filtered = allowed.length
      ? rows.filter((r) => allowed.includes(r.resource_id))
      : rows,
    revision = await digest(
      filtered.map((r) => [
        r.booking_id,
        r.status,
        r.revision,
        r.start_period,
        r.end_period,
        r.resource_id,
        r.resource_revision,
      ]),
    );
  const deviceExpiry = ctx.principal.deviceScope
    ? { validUntil: ctx.principal.validUntil }
    : {};
  if (input.since === revision)
    return { date, revision, unchanged: true, ...deviceExpiry };
  const timing = await one(
      ctx.env.DB,
      "SELECT value_json FROM lord_settings WHERE school_id=? AND setting_key='periodTimings'",
      [ctx.principal.schoolId],
    ),
    periods = timing ? JSON.parse(timing.value_json).periods : [];
  // Scope filtering precedes grouping. A cart never broadens a device's
  // physical-resource authority, including access to booking-wide photographs.
  const grouped = new Map();
  for (const row of filtered) {
    if (!grouped.has(row.booking_id)) grouped.set(row.booking_id, []);
    grouped.get(row.booking_id).push(row);
  }
  const complete = new Set(
    [...grouped]
      .filter(
        ([bookingId, visible]) =>
          visible.length ===
          rows.filter((r) => r.booking_id === bookingId).length,
      )
      .map(([bookingId]) => bookingId),
  );
  const bookings = [...grouped.values()].map((members) => {
    const r = members[0],
      carts = new Set(members.map(cartOf)),
      savedDetails = JSON.parse(r.details_json);
    const allItems = rows.filter((item) => item.booking_id === r.booking_id);
    const captured = capturedBookingGroup(savedDetails, allItems);
    const cart = savedDetails.bookingGroup
      ? captured?.cart
      : carts.size === 1 && !carts.has("")
        ? [...carts][0]
        : null;
    const standalone =
      !savedDetails.bookingGroup && carts.size === 1 && carts.has("");
    const reservedCapacity = members.reduce((n, m) => n + m.quantity, 0);
    const collected = members.reduce((n, m) => n + m.collected_quantity, 0);
    const returned = members.reduce((n, m) => n + m.returned_quantity, 0);
    const details = JSON.parse(r.details_json),
      start = periods.find((p) => Number(p.code) === r.start_period),
      end = periods.find((p) => Number(p.code) === r.end_period - 1);
    return {
      bookingId: r.booking_id,
      resource:
        cart ||
        (standalone
          ? members.map((m) => m.name).join(", ")
          : "Unresolved resource group"),
      resourceId: members.length === 1 ? r.resource_id : null,
      resourceIds: members.map((m) => m.resource_id),
      reservedCapacity,
      startPeriod: String(r.start_period),
      endPeriod: String(r.end_period - 1),
      startTime: start?.start || "",
      endTime: end?.end || "",
      epochStart: start
        ? Date.parse(date + "T" + start.start + ":00+08:00")
        : 0,
      epochEnd: end ? Date.parse(date + "T" + end.end + ":00+08:00") : 0,
      bookingStatus: r.status,
      sessionStatus: r.status,
      movementState: r.status,
      isOpen: r.status === "COLLECTED",
      classOrActivity: details.classOrActivity,
      subject: details.subject,
      teacherTtbName: r.teacher_name || "",
      teacherStatutoryName: r.teacher_name || "",
      requestedQuantity: !complete.has(r.booking_id)
        ? null
        : (recordedRequestedQuantity(details) ??
          (standalone ? reservedCapacity : null)),
      deviceType: details.deviceType || "",
      accessories:
        [
          details.headphones ? "Headphones" : "",
          details.styluses ? "Styluses" : "",
        ]
          .filter(Boolean)
          .join(", ") || "None",
      physicalReturnConfirmed:
        complete.has(r.booking_id) && collected > 0 && returned === collected,
    };
  });
  if (ctx.principal.deviceScope?.photos) {
    for (const booking of bookings) {
      booking.photoIds =
        booking.isOpen && complete.has(booking.bookingId)
          ? (
              await query(
                ctx.env.DB,
                "SELECT photo_id FROM lord_photos WHERE school_id=? AND booking_id=? AND phase='collection' ORDER BY recorded_at DESC LIMIT 20",
                [ctx.principal.schoolId, booking.bookingId],
              )
            ).map((p) => p.photo_id)
          : [];
    }
  }
  return {
    date,
    revision,
    ...deviceExpiry,
    generatedAt: new Date(ctx.now ?? Date.now()).toISOString(),
    bookings,
  };
}
/** Verify the current source immediately before dispatch. Returns a purpose-limited provider intent. */
export async function notificationIntent(env, payload, now = Date.now()) {
  const b = await one(
    env.DB,
    "SELECT * FROM lord_bookings WHERE school_id=? AND booking_id=?",
    [payload.schoolId, payload.bookingId],
  );
  if (
    !b ||
    (!["cancelled", "administrative-close"].includes(payload.kind) &&
      ["CANCELLED", "RETURNED", "CLOSED", "DECLARED_RETURNED"].includes(
        b.status,
      )) ||
    (payload.kind === "cancelled" && b.status !== "CANCELLED") ||
    (payload.kind === "administrative-close" && b.status !== "CLOSED")
  )
    return { state: "suppressed", reason: "BOOKING_STATE_CHANGED" };
  if (payload.revision && payload.revision !== b.revision)
    return { state: "suppressed", reason: "BOOKING_REVISION_CHANGED" };
  const phase = reminderPhase(payload);
  if (phase) {
    const [timings, settings, custody] = await Promise.all([
      one(env.DB, "SELECT value_json FROM lord_settings WHERE school_id=? AND setting_key='periodTimings'", [payload.schoolId]),
      one(env.DB, "SELECT value_json FROM lord_settings WHERE school_id=? AND setting_key='reminders'", [payload.schoolId]),
      phase === "return" ? one(env.DB,
        "SELECT COALESCE((SELECT SUM(collected_quantity-returned_quantity) FROM lord_booking_items WHERE school_id=? AND booking_id=?),0)+COALESCE((SELECT SUM(collected_quantity-returned_quantity) FROM lord_accessories WHERE school_id=? AND booking_id=?),0) AS remaining",
        [payload.schoolId, b.booking_id, payload.schoolId, b.booking_id]) : null,
    ]);
    const eligibility = reminderEligibility(b, phase,
      timings ? JSON.parse(timings.value_json).periods : [],
      settings ? JSON.parse(settings.value_json) : {}, now, custody?.remaining);
    if (eligibility.state !== "ready") return eligibility;
    if (payload.reminderWindow && payload.reminderWindow !== eligibility.window.key)
      return { state: "suppressed", reason: "REMINDER_WINDOW_CHANGED" };
  }
  const ref = await one(
    env.DB,
    "SELECT * FROM lord_references WHERE school_id=? AND staff_id=?",
    [payload.schoolId, b.staff_id],
  );
  if (
    !ref ||
    ref.observed_at > now ||
    now - ref.observed_at > REFERENCE_MAX_AGE
  )
    return { state: "blocked", reason: "REFERENCE_REFRESH_REQUIRED" };
  const prefs = await one(
    env.DB,
    "SELECT * FROM lord_preferences WHERE school_id=? AND staff_id=?",
    [payload.schoolId, b.staff_id],
  );
  // Absence of an explicit channel preference does not fabricate consent.
  const schoolAgreement = env.LORD_SCHOOL_WHATSAPP_AGREEMENT === "true";
  if (!prefs && !schoolAgreement)
    return { state: "suppressed", reason: "PREFERENCE_NOT_ACCEPTED" };
  return {
    state: "ready",
    schoolId: payload.schoolId,
    bookingId: b.booking_id,
    revision: b.revision,
    staffId: b.staff_id,
    recipient: {
      email: prefs?.email !== 0 ? ref.email : null,
      mobile: schoolAgreement || prefs?.whatsapp ? ref.mobile : null,
    },
    kind: payload.kind || "reminder",
    sourceRevision: ref.source_revision,
    observedAt: ref.observed_at,
  };
}
async function devicePrincipal(ctx) {
  const token = ctx.request.headers.get("x-gsis-device-token");
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    fail(
      "DEVICE_SESSION_REQUIRED",
      "A configured signage device session is required.",
      401,
    );
  const row = await one(
    ctx.env.DB,
    "SELECT * FROM lord_links WHERE school_id=? AND token_hash=? AND purpose='signage' AND revoked=0 AND expires_at>?",
    [ctx.env.SCHOOL_ID, await digest(token), ctx.now ?? Date.now()],
  );
  if (!row)
    fail(
      "DEVICE_SESSION_INVALID",
      "Signage session expired or was revoked.",
      401,
    );
  const scope = JSON.parse(row.scope_json);
  return {
    schoolId: ctx.env.SCHOOL_ID,
    actorId: "device:" + scope.deviceId,
    staffId: null,
    capabilities: ["lord.signage"],
    deviceScope: scope,
    validUntil: row.expires_at,
  };
}
async function revokeLink(ctx, input) {
  return mutate(ctx, "link-revoke", async () => {
    const hash = text(input.tokenHash, "link hash", 64, true);
    if (!/^[a-f0-9]{64}$/.test(hash))
      fail("INVALID_INPUT", "Invalid link identity.");
    const row = await one(
      ctx.env.DB,
      "SELECT * FROM lord_links WHERE school_id=? AND token_hash=?",
      [ctx.principal.schoolId, hash],
    );
    if (!row) fail("NOT_FOUND", "Link not found.", 404);
    return {
      guards: [
        guard(
          "SELECT revoked=0 AS ok FROM lord_links WHERE school_id=? AND token_hash=?",
          [ctx.principal.schoolId, hash],
        ),
      ],
      writes: [
        write(
          "UPDATE lord_links SET revoked=1 WHERE school_id=? AND token_hash=?",
          [ctx.principal.schoolId, hash],
        ),
      ],
      result: { tokenHash: hash, revoked: true },
    };
  });
}
async function bookingContext(ctx, input) {
  const b = await booking(ctx.env.DB, ctx.principal.schoolId, input.bookingId);
  if (b.staff_id !== ctx.principal.staffId)
    fail(
      "CAPABILITY_DENIED",
      "Only the booked-for teacher may make a booking declaration.",
      403,
    );
  const record = await one(
    ctx.env.DB,
    "SELECT value_json FROM lord_settings WHERE school_id=? AND setting_key='periodTimings'",
    [b.school_id],
  );
  const periods = record ? JSON.parse(record.value_json).periods : [],
    start = periods.find((p) => Number(p.code) === b.start_period),
    end = periods.find((p) => Number(p.code) === b.end_period - 1);
  if (!start || !end)
    fail(
      "PERIOD_TIMINGS_REQUIRED",
      "Configure the booked period timings before accepting a declaration.",
      503,
    );
  const window = {
    start: Date.parse(b.service_date + "T" + start.start + ":00+08:00"),
    end: Date.parse(b.service_date + "T" + end.end + ":00+08:00"),
    startTime: start.start,
    endTime: end.end,
  };
  const period = await one(
      ctx.env.DB,
      "SELECT status FROM lord_periods WHERE school_id=? AND period_id=?",
      [b.school_id, b.period_id],
    ),
    archived = period?.status === "closed",
    now = ctx.now ?? Date.now(),
    view = await bookingView(ctx.env.DB, b);
  return {
    row: b,
    booking: {
      ...view,
      collectedSessionId: [
        "COLLECTED",
        "RETURNED",
        "CLOSED",
        "DECLARED_RETURNED",
      ].includes(b.status)
        ? b.booking_id
        : "",
    },
    window,
    archived,
    archivePeriod: archived ? b.period_id : null,
    canCollect:
      !archived && b.status === "BOOKED" && b.service_date === sgDay(now),
    canReturn: !archived && b.status === "COLLECTED",
    canDeclareCollection:
      !archived && b.status === "BOOKED" && now >= window.start + 1800000,
    canCollectLater:
      !archived &&
      b.status === "BOOKED" &&
      now >= window.start + 1800000 &&
      now < window.end,
    canDeclareReturn:
      !archived && b.status === "COLLECTED" && now >= window.end + 1800000,
  };
}
async function bookingRespond(ctx, input) {
  return mutate(ctx, "bookingrespond", async ({ now, op }) => {
    const context = await bookingContext(ctx, input),
      b = context.row;
    changed(b, input.revision);
    if (input.confirmed !== true)
      fail("CONFIRMATION_REQUIRED", "Confirm this declaration explicitly.");
    const choice = input.response,
      guards = [bookingGuard(b)],
      writes = [],
      details = JSON.parse(b.details_json);
    let status = b.status;
    if (context.archived) {
      if (!["historical_collection", "historical_return"].includes(choice))
        fail(
          "BOOKING_ARCHIVED",
          "This booking is archived. Only a historical incident can be recorded.",
          409,
        );
      if (choice === "historical_return" && !context.booking.collectedSessionId)
        fail(
          "BOOKING_STATE",
          "No recorded loan exists for this historical return.",
          409,
        );
      writes.push(
        write(
          "INSERT INTO lord_incidents(school_id,incident_id,booking_id,staff_id,status,revision,details_json,created_at) VALUES(?,?,?,?,'open',1,?,?)",
          [
            b.school_id,
            await generatedId("incident", op.operationId),
            b.booking_id,
            b.staff_id,
            canonical({
              kind: "historical-photo-omission",
              phase: choice,
              archivePeriod: b.period_id,
              archiveUnchanged: true,
            }),
            now,
          ],
        ),
      );
      return {
        guards,
        writes,
        result: {
          bookingId: b.booking_id,
          historical: true,
          status: b.status,
          incidentId: await generatedId("incident", op.operationId),
        },
      };
    }
    guards.push(unarchivedGuard(b));
    if (!["cancel", "later", "collected", "returned"].includes(choice))
      fail("INVALID_INPUT", "Unknown booking response.");
    if (input.token) {
      const hash = await digest(input.token),
        link = await one(
          ctx.env.DB,
          "SELECT * FROM lord_links WHERE school_id=? AND token_hash=? AND purpose='booking-response'",
          [b.school_id, hash],
        );
      if (
        !link ||
        link.booking_id !== b.booking_id ||
        link.staff_id !== b.staff_id ||
        link.revoked ||
        link.expires_at <= now
      )
        fail(
          "LINK_INVALID",
          "Booking response link expired or belongs to another booking.",
          403,
        );
      guards.push(
        guard(
          "SELECT revoked=0 AND expires_at>? AS ok FROM lord_links WHERE school_id=? AND token_hash=?",
          [now, b.school_id, hash],
        ),
      );
    }
    if (choice === "cancel" || choice === "later") {
      if (
        b.status !== "BOOKED" ||
        (choice === "later" && !context.canCollectLater)
      )
        fail("BOOKING_STATE", "This response is no longer available.", 409);
      status = choice === "cancel" ? "CANCELLED" : "BOOKED";
      if (choice === "cancel")
        writes.push(
          write(
            "UPDATE lord_bookings SET status='CANCELLED',revision=revision+1,updated_at=? WHERE school_id=? AND booking_id=?",
            [now, b.school_id, b.booking_id],
          ),
        );
      return {
        guards,
        writes,
        result: {
          bookingId: b.booking_id,
          status,
          revision: b.revision + (choice === "cancel" ? 1 : 0),
          response: choice,
        },
      };
    }
    const items = await query(
      ctx.env.DB,
      "SELECT i.*,r.name FROM lord_booking_items i JOIN lord_resources r USING(school_id,resource_id) WHERE i.school_id=? AND i.booking_id=?",
      [b.school_id, b.booking_id],
    );
    if (choice === "collected") {
      if (!context.canDeclareCollection)
        fail(
          "DECLARATION_WINDOW",
          "Collection declaration is available thirty minutes after the booked start.",
          409,
        );
      const selected = input.items || input.trolleys;
      if (!Array.isArray(selected) || !selected.length || selected.length > 20)
        fail(
          "COLLECTION_DETAILS_REQUIRED",
          "Enter the resources actually collected.",
        );
      const seen = new Set();
      let total = 0;
      for (const value of selected) {
        const matches = items.filter((i) =>
          value.resourceId
            ? i.resource_id === value.resourceId
            : i.name === value.name,
        );
        if (matches.length !== 1 || seen.has(matches[0].resource_id))
          fail(
            "INVALID_INPUT",
            "Unknown, ambiguous or duplicate collected resource.",
          );
        const item = matches[0],
          quantity = integer(
            value.quantity,
            1,
            item.quantity,
            "actual quantity",
          );
        seen.add(item.resource_id);
        total += quantity;
        writes.push(
          write(
            "UPDATE lord_booking_items SET collected_quantity=? WHERE school_id=? AND booking_id=? AND resource_id=?",
            [quantity, b.school_id, b.booking_id, item.resource_id],
          ),
        );
        writes.push(
          write(
            "INSERT INTO lord_item_events(school_id,event_id,booking_id,resource_id,kind,quantity,operation_id,actor_id,recorded_at,details_json) VALUES(?,?,?,?,'collect',?,?,?,?,?)",
            [
              b.school_id,
              op.operationId + ":" + item.resource_id,
              b.booking_id,
              item.resource_id,
              quantity,
              op.operationId,
              ctx.principal.actorId,
              now,
              canonical({
                declared: true,
                photosMissing: true,
                physicalQuantityConfirmed: false,
              }),
            ],
          ),
        );
      }
      for (const kind of ["styluses", "headphones"]) {
        const booked =
            kind === "styluses" ? details.styluses : details.headphones,
          quantity = integer(
            booked
              ? (input.accessories?.[kind]?.quantity ??
                  input[
                    kind === "styluses" ? "stylusQuantity" : "headphoneQuantity"
                  ])
              : 0,
            0,
            total,
            "accessory quantity",
          );
        writes.push(
          write(
            "INSERT INTO lord_accessories(school_id,booking_id,kind,collected_quantity) VALUES(?,?,?,?)",
            [b.school_id, b.booking_id, kind, quantity],
          ),
        );
      }
      status = "COLLECTED";
    } else {
      if (!context.canDeclareReturn || input.sessionId !== b.booking_id)
        fail(
          "DECLARATION_WINDOW",
          "Return declaration is available thirty minutes after the booked end for this loan.",
          409,
        );
      status = "DECLARED_RETURNED"; // Do not manufacture physical quantities or photographs.
    }
    details.lastDeclaration = {
      response: choice,
      actorId: ctx.principal.actorId,
      at: now,
      physicalQuantityConfirmed: false,
      photosMissing: true,
    };
    writes.push(
      write(
        "UPDATE lord_bookings SET status=?,revision=revision+1,details_json=?,updated_at=? WHERE school_id=? AND booking_id=?",
        [status, canonical(details), now, b.school_id, b.booking_id],
      ),
      write(
        "INSERT INTO lord_incidents(school_id,incident_id,booking_id,staff_id,status,revision,details_json,created_at) VALUES(?,?,?,?,'open',1,?,?)",
        [
          b.school_id,
          await generatedId("incident", op.operationId),
          b.booking_id,
          b.staff_id,
          canonical({
            kind: "photos-missing",
            phase: choice === "returned" ? "return" : "collection",
            declaration: details.lastDeclaration,
            quantitiesVerified: false,
          }),
          now,
        ],
      ),
    );
    return {
      guards,
      writes,
      result: {
        bookingId: b.booking_id,
        sessionId: b.booking_id,
        status,
        revision: b.revision + 1,
        incidentId: await generatedId("incident", op.operationId),
        physicalQuantityConfirmed: false,
        photosMissing: true,
      },
    };
  });
}

async function retryBackground(ctx, input) {
  return mutate(ctx, "background-retry", async ({ now }) => {
    const job = await one(
      ctx.env.DB,
      "SELECT * FROM product_outbox WHERE school_id=? AND job_id=?",
      [ctx.principal.schoolId, id(input.jobId)],
    );
    if (!job) fail("NOT_FOUND", "Background job not found.", 404);
    if (job.state === "uncertain")
      fail(
        "OUTCOME_UNKNOWN",
        "Reconcile the original provider outcome before any retry.",
        409,
      );
    if (job.state !== "failed")
      fail("JOB_STATE", "Only a confirmed failed job can be retried.", 409);
    return {
      guards: [
        guard(
          "SELECT state='failed' AND fence=? AS ok FROM product_outbox WHERE school_id=? AND job_id=?",
          [job.fence, job.school_id, job.job_id],
        ),
      ],
      writes: [
        write(
          "UPDATE product_outbox SET state='queued',due_at=?,updated_at=?,last_code=NULL WHERE school_id=? AND job_id=?",
          [now, now, job.school_id, job.job_id],
        ),
      ],
      result: {
        jobId: job.job_id,
        state: "queued",
        originalOperationId: job.operation_id,
      },
    };
  });
}
function validateSettings(key, value) {
  if (key === "periodTimings") {
    if (
      !Array.isArray(value.periods) ||
      !value.periods.length ||
      value.periods.length > 41
    )
      fail("INVALID_INPUT", "Provide the ordered timetable periods.");
    const seen = new Set();
    let previousEnd = "";
    for (const p of value.periods) {
      const code = String(p.code);
      if (
        !/^\d{1,2}$/.test(code) ||
        seen.has(code) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.end) ||
        p.end <= p.start ||
        p.start < previousEnd
      )
        fail(
          "INVALID_INPUT",
          "Period identities or times are invalid or overlapping.",
        );
      seen.add(code);
      previousEnd = p.end;
    }
  }
  if (key === "referenceLists") {
    for (const k of ["classes", "subjects"])
      if (
        !Array.isArray(value[k]) ||
        value[k].length > 2000 ||
        value[k].some(
          (s) =>
            typeof s !== "string" ||
            !s.trim() ||
            s !== s.trim() ||
            s.length > 200,
        ) ||
        new Set(value[k].map((s) => String(s).toLocaleLowerCase())).size !==
          value[k].length
      )
        fail("INVALID_INPUT", "Invalid reference lists.");
  }

  if (key === "notificationTemplates") {
    const kinds = [
        "created",
        "changed",
        "cancelled",
        "collection-reminder",
        "overdue",
        "administrative-close",
        "reminder",
      ],
      fields = [
        "teacher",
        "resource",
        "quantity",
        "date",
        "startPeriod",
        "endPeriod",
        "classOrActivity",
        "subject",
        "bookingId",
      ];
    for (const [kind, t] of Object.entries(value)) {
      if (
        !kinds.includes(kind) ||
        !t ||
        typeof t.name !== "string" ||
        !/^[a-z0-9_]{1,100}$/.test(t.name) ||
        !t.language ||
        typeof t.language.code !== "string" ||
        !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(t.language.code) ||
        (t.parameters !== undefined &&
          (!Array.isArray(t.parameters) ||
            t.parameters.length > 20 ||
            t.parameters.some((p) => !fields.includes(p))))
      )
        fail(
          "INVALID_INPUT",
          "Use an approved template name, language and supported parameter fields.",
        );
    }
  }
  if (
    key === "reminders" &&
    Object.values(value).some(
      (v) => typeof v !== "boolean" && !Number.isSafeInteger(v),
    )
  )
    fail(
      "INVALID_INPUT",
      "Reminder settings must use explicit booleans or integer minutes.",
    );
  if (
    key === "autoClose" &&
    (value.hour !== 18 || value.physicalReturnConfirmed !== false)
  )
    fail(
      "POLICY_FIXED",
      "The approved daily administrative closure is 18:00 and never proves physical return.",
      409,
    );
  if (canonical(value).length > 65536)
    fail("RESULT_BOUNDS", "Settings exceed 64 KiB.", 422);
}

export async function handle(ctx) {
  const input = parameters(ctx),
    action = actionOf(ctx.method, ctx.path, input),
    descriptor = policy(ctx.method, ctx.path, input);
  if (action === "auth-relief") {
    if (ctx.method === "GET") {
      const verified = await verifyReliefCookie(ctx.env, ctx.request, ctx.now);
      if (!verified) return { authenticated: false };
      return {
        authenticated: true,
        csrfToken: verified.csrf,
        session: {
          identityType: "RELIEF",
          sub: verified.sub,
          email: "",
          ttbName: verified.name,
          mobile: verified.mobile,
          isAdmin: false,
        },
      };
    }
    if (ctx.body?.logout === true) {
      return Response.json(
        { ok: true, data: { signedOut: true } },
        {
          headers: {
            "Set-Cookie": clearReliefCookie(),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
    const { name, mobile } = normalizeReliefInput(ctx.body);
    const issued = await issueReliefSession(ctx.env, {
      name,
      mobile,
      now: ctx.now,
    });
    return Response.json(
      {
        ok: true,
        data: { session: issued.session, csrfToken: issued.csrfToken },
        session: issued.session,
      },
      {
        headers: {
          "Set-Cookie": issued.cookie,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
  if (descriptor.public)
    ctx = { ...ctx, principal: await devicePrincipal(ctx) };
  requireCapability(ctx.principal, descriptor.action, descriptor.write, {
    allowRelief: descriptor.allowRelief === true,
  });
  switch (action) {
    case "resources":
    case "reference":
      return reference(ctx);
    case "bookingactioncontext": {
      const data = await bookingContext(ctx, input);
      delete data.row;
      return data;
    }
    case "profile":
      return {
        user: {
          staffId: ctx.principal.staffId,
          roles: ctx.principal.capabilities,
          email: ctx.principal.email || "",
          isAdmin: has(ctx.principal, "lord.admin"),
        },
      };
    case "mybookings":
      return { bookings: await listBookings(ctx, input) };
    case "bookingdayschedule":
      return { bookings: await listBookings(ctx, input, "day") };
    case "bookingeligible":
      return {
        bookings: (await listBookings(ctx, input)).filter(
          (b) => b.status === "BOOKED",
        ),
      };
    case "opensessions":
      return { sessions: await listBookings(ctx, input, "open") };
    case "bookingget":
    case "session": {
      const row = await booking(
        ctx.env.DB,
        ctx.principal.schoolId,
        input.bookingId || input.sessionId,
      );
      requireOwner(ctx.principal, row, { allowRelief: action === "session" });
      return {
        [action === "session" ? "session" : "booking"]: await bookingView(
          ctx.env.DB,
          row,
        ),
      };
    }
    case "bookingavailability": {
      const b = await resolveBookingGroup(
          ctx.env.DB,
          ctx.principal.schoolId,
          bookingInput(input, ctx.principal),
        ),
        checks = [];
      for (const item of b.items) {
        const r = await one(
          ctx.env.DB,
          "SELECT * FROM lord_resources WHERE school_id=? AND resource_id=?",
          [ctx.principal.schoolId, item.resourceId],
        );
        if (!r || !r.active) checks.push(false);
        else {
          if (!b.bookingGroup && cartOf(r))
            fail(
              "GROUP_SELECTION_REQUIRED",
              "Select the whole cart from its current reference before booking.",
              409,
            );
          const g = capacityGuard(
            ctx.principal.schoolId,
            b.date,
            r,
            [
              {
                start: b.start,
                end: b.end,
                quantity: item.quantity,
                override: false,
              },
            ],
            [],
          );
          checks.push(!!(await one(ctx.env.DB, g.sql, g.args))?.ok);
        }
      }
      return {
        available: checks.every(Boolean),
        advisory: true,
        recheckedAtCommit: true,
      };
    }
    case "dashboard":
      return dashboard(ctx, input);
    case "starlordboard":
      return board(ctx, input);
    case "resource-save":
      return resourceSave(ctx, input);
    case "resources-save":
      return resourcesSave(ctx, input);
    case "resource-delete":
      return resourceSave(ctx, {
        ...input,
        resource: { ...(input.resource || input), active: false },
      });
    case "bookingcreate":
    case "bookingcreatebatch":
      return saveBookings(ctx, input);
    case "bookingupdate":
      return saveBookings(ctx, input, true);
    case "bookingcancel":
      return cancelBooking(ctx, input);
    case "loan":
      return collect(ctx, input);
    case "return":
      return returnItems(ctx, input);
    case "photo-upload":
      return savePhoto(ctx, input);
    case "photos":
      return readPhoto(ctx, ctx.path.split("?")[0].split("/").pop());
    case "notificationpreferences":
      if (ctx.method !== "GET") return savePreferences(ctx, input);
      return preferencesView(ctx);
    case "preferences-save":
      return savePreferences(ctx, input);
    case "reference-refresh":
    case "suiterefresh":
      return refreshReferences(ctx, input);
    case "incident-resolve":
    case "incidentresolve":
      return incident(ctx, input, true);
    case "incidentrespond":
      return incident(ctx, input, false);
    case "complianceincidents":
      return compliance(ctx);
    case "incident-response-context":
      return incidentResponseContext(ctx, input);
    case "incident-list": {
      const after = input.after ? id(input.after) : "";
      const rows = await query(
        ctx.env.DB,
        "SELECT incident_id,booking_id,staff_id,revision,status,created_at,details_json FROM lord_incidents WHERE school_id=? AND incident_id>? AND status<>'resolved' ORDER BY incident_id LIMIT 101",
        [ctx.principal.schoolId, after],
      );
      const incidents = rows.slice(0, 100).map((row) => ({
        incidentId: row.incident_id,
        bookingId: row.booking_id,
        staffId: row.staff_id,
        revision: row.revision,
        status: row.status,
        recordedAt: row.created_at,
        details: JSON.parse(row.details_json),
      }));
      return {
        incidents,
        nextCursor: rows.length > 100 ? incidents.at(-1).incidentId : null,
      };
    }
    case "incident-get": {
      const row = await one(
        ctx.env.DB,
        "SELECT * FROM lord_incidents WHERE school_id=? AND incident_id=?",
        [ctx.principal.schoolId, id(input.incidentId)],
      );
      if (!row) fail("NOT_FOUND", "Incident not found.", 404);
      return {
        incidentId: row.incident_id,
        revision: row.revision,
        status: row.status,
        details: JSON.parse(row.details_json),
      };
    }
    case "archive-download":
      return archiveDownload(ctx, input);
    case "reignpreview":
      return reignPreview(ctx);
    case "reign-archives":
      return reignArchiveList(ctx);
    case "reign-archive-prepare":
      return prepareReignArchive(ctx, input, mutate);
    case "reign-archive-export":
      return exportReignArchive(ctx, input, mutate);
    case "reign-cleanup-preview":
      return previewReignCleanup(ctx, input);
    case "reign-cleanup":
      return commitReignCleanup(ctx, input, mutate);
    case "reign-cleanup-finish":
      return finishReignCleanup(ctx, input, mutate);
    case "reignclose":
      return reignClose(ctx, input);
    case "settings-save":
      return settingsSave(ctx, input);
    case "adminsettings":
      if (ctx.method !== "GET") return settingsSave(ctx, input);
      return {
        settings: await query(
          ctx.env.DB,
          "SELECT setting_key,revision,value_json FROM lord_settings WHERE school_id=?",
          [ctx.principal.schoolId],
        ),
      };
    case "link-create":
      return makeLink(ctx, input);
    case "link-revoke":
      return revokeLink(ctx, input);
    case "bookingrespond":
      return bookingRespond(ctx, input);
    case "background-retry":
      return retryBackground(ctx, input);
    case "receipt": {
      const r = await operationStatus(
        ctx.env.DB,
        ctx.principal.schoolId,
        id(input.operationId),
      );
      if (
        r?.actorId &&
        r.actorId !== ctx.principal.actorId &&
        !has(ctx.principal, "lord.admin")
      )
        fail("CAPABILITY_DENIED", "Receipt is outside your scope.", 403);
      return r;
    }
    case "backgroundwork":
      return {
        jobs: await query(
          ctx.env.DB,
          "SELECT job_id,type,state,attempts,due_at,last_code FROM product_outbox WHERE school_id=? ORDER BY due_at LIMIT 200",
          [ctx.principal.schoolId],
        ),
      };
    case "export": {
      const rows = await listBookings(
        ctx,
        input,
        has(ctx.principal, "lord.admin") ? "all" : "mine",
      );
      return new Response(
        csv([
          [
            "Booking ID",
            "Staff ID",
            "Date",
            "Start period",
            "End period",
            "Status",
            "Class or activity",
          ],
          ...rows.map((b) => [
            b.bookingId,
            b.staffId,
            b.date,
            b.startPeriod,
            b.endPeriod,
            b.status,
            b.classOrActivity,
          ]),
        ]),
        {
          headers: {
            "content-type": "text/csv;charset=utf-8",
            "content-disposition": 'attachment; filename="lord-bookings.csv"',
            "cache-control": "no-store",
          },
        },
      );
    }
    default:
      fail("NOT_FOUND", "Unknown LORD operation.", 404);
  }
}

export { scheduled } from "./jobs.mjs";

async function preferencesView(ctx) {
  const p = ctx.principal,
    prefs = await one(
      ctx.env.DB,
      "SELECT * FROM lord_preferences WHERE school_id=? AND staff_id=?",
      [p.schoolId, p.staffId],
    ),
    ref = await one(
      ctx.env.DB,
      "SELECT name,mobile FROM lord_references WHERE school_id=? AND staff_id=?",
      [p.schoolId, p.staffId],
    ),
    schoolManaged = ctx.env.LORD_SCHOOL_WHATSAPP_AGREEMENT === "true";
  return {
    staffId: p.staffId,
    revision: prefs?.revision || 0,
    email: prefs?.email === 1,
    whatsapp: prefs?.whatsapp === 1,
    telegram: prefs?.telegram === 1,
    enabled: schoolManaged || prefs?.whatsapp === 1,
    schoolManaged,
    mobileAvailable: !!ref?.mobile,
    maskedMobile: ref?.mobile ? "•••• " + ref.mobile.slice(-4) : "",
    teacher: ref?.name || "",
    serviceEnabled:
      ctx.env.SEND_OWNER === "v1" && !!ctx.env.WHATSAPP_ACCESS_TOKEN,
  };
}
