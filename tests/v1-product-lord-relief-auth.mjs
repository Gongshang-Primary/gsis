/** Verify LORD /api/lord/auth/relief restricted relief-teacher sessions (F15):
 * validation, HMAC cookie integrity, cross-domain isolation, restricted loan/return/photo
 * operations, CSRF enforcement, idempotent retry, and forbidden-action denials.
 */
import assert from "node:assert/strict";
import { productSuite, origin } from "./v1-product/suite.mjs";
import { RELIEF_COOKIE_NAME } from "../v1/services/lord/relief-auth.mjs";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6xUAAAAASUVORK5CYII=";

const suite = await productSuite();
try {
  const admin = await suite.seedAccount("lord-relief-admin");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
  }).format(new Date());
  const lordDb = await suite.db("lord");
  await lordDb
    .prepare(
      "INSERT INTO lord_references(school_id,staff_id,name,email,mobile,source_revision,observed_at) VALUES(?,?,?,?,?,?,?)",
    )
    .bind(
      "synthetic-school",
      admin.staffId,
      "Synthetic Teacher",
      "lord-relief-admin@example.invalid",
      null,
      "contacts-1",
      Date.now(),
    )
    .run();

  // Seed one LORD resource and one BOOKED booking for today.
  await suite.call(admin, "lord", "/resources", {
    operationId: crypto.randomUUID(),
    resourceId: "cart-alpha",
    name: "Synthetic Cart Alpha",
    type: "iPad Cart",
    capacity: 20,
    active: true,
    exclusive: false,
    bufferPeriods: 0,
    revision: 0,
  });
  const booked = await suite.call(admin, "lord", "/bookings", {
    operationId: crypto.randomUUID(),
    date: today,
    startPeriod: 3,
    endPeriod: 5,
    resourceId: "cart-alpha",
    quantity: 10,
    classOrActivity: "4A",
    subject: "Science",
  });
  const bookingId = booked.bookingId;
  assert.ok(bookingId, "Seeded booking created");

  // 1. Validation negatives: empty name, invalid mobile.
  const badName = await suite.mf.dispatchFetch(`${origin}/api/lord/auth/relief`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ name: "   ", mobile: "91234567" }),
  });
  assert.equal(badName.status, 400);

  const badMobile = await suite.mf.dispatchFetch(`${origin}/api/lord/auth/relief`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ name: "Synthetic Relief", mobile: "12345678" }),
  });
  assert.equal(badMobile.status, 400);

  // 2. Valid Singapore mobile with optional 65 prefix issues signed HttpOnly relief cookie.
  const login = await suite.mf.dispatchFetch(`${origin}/api/lord/auth/relief`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ name: "Synthetic Relief", mobile: "+65 9123 4567" }),
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie") || "";
  assert.ok(setCookie.startsWith(`${RELIEF_COOKIE_NAME}=`), "Relief cookie issued");
  assert.ok(setCookie.includes("HttpOnly") && setCookie.includes("Secure"));
  const cookiePair = setCookie.split(";")[0];
  const loginBody = await login.json();
  assert.equal(loginBody.ok, true);
  assert.equal(loginBody.session.identityType, "RELIEF");
  assert.equal(loginBody.session.mobile, "91234567");
  assert.equal(loginBody.session.sub, "relief:91234567");
  assert.equal(loginBody.session.isAdmin, false);
  const csrf = loginBody.data.csrfToken;
  assert.ok(typeof csrf === "string" && csrf.length >= 16);

  // 3. GET /api/lord/auth/relief verifies cookie; tampered cookie fails closed.
  const check = await suite.mf.dispatchFetch(`${origin}/api/lord/auth/relief`, {
    headers: { cookie: cookiePair },
  });
  assert.equal(check.status, 200);
  const checkBody = await check.json();
  assert.equal(checkBody.data.authenticated, true);
  assert.equal(checkBody.data.session.sub, "relief:91234567");

  const tampered = cookiePair.slice(0, -2) + (cookiePair.endsWith("aa") ? "bb" : "aa");
  const badRef = await suite.mf.dispatchFetch(`${origin}/api/lord/reference`, {
    headers: { cookie: tampered },
  });
  assert.equal(badRef.status, 401);

  // 4. Cross-domain isolation: relief cookie is NEVER accepted by Core or any other domain.
  for (const forbidden of [
    "/api/core/session",
    "/api/contacts/staff",
    "/api/deploy/bootstrap",
    "/api/roster/profile",
    "/api/venues/read",
  ]) {
    const r = await suite.mf.dispatchFetch(`${origin}${forbidden}`, {
      headers: { cookie: cookiePair },
    });
    assert.equal(r.status, 401, `Relief cookie must be 401 on ${forbidden}`);
  }

  // 5. Forbidden LORD actions return 403 CAPABILITY_DENIED (not 200).
  for (const [method, path, body] of [
    ["GET", "/api/lord/bookings", null],
    ["GET", "/api/lord/settings", null],
    [
      "POST",
      "/api/lord/bookings",
      {
        operationId: crypto.randomUUID(),
        date: today,
        startPeriod: 6,
        endPeriod: 7,
        resourceId: "cart-alpha",
        quantity: 1,
        classOrActivity: "4B",
        subject: "Math",
      },
    ],
  ]) {
    const r = await suite.mf.dispatchFetch(`${origin}${path}`, {
      method,
      headers: {
        origin,
        cookie: cookiePair,
        ...(body ? { "content-type": "application/json", "x-csrf-token": csrf } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal(r.status, 403, `Relief must be denied 403 on ${method} ${path}`);
    const err = await r.json();
    assert.equal(err.error.code, "CAPABILITY_DENIED");
  }

  // 6. Permitted reads: reference, bookingeligible, session.
  const refRes = await suite.mf.dispatchFetch(`${origin}/api/lord/reference`, {
    headers: { cookie: cookiePair },
  });
  assert.equal(refRes.status, 200);

  const eligibleRes = await suite.mf.dispatchFetch(
    `${origin}/api/lord/transaction?action=bookingeligible&date=${today}`,
    { headers: { cookie: cookiePair } },
  );
  assert.equal(eligibleRes.status, 200);
  const eligible = await eligibleRes.json();
  assert.ok(eligible.data.bookings.some((b) => b.bookingId === bookingId));

  // 7. Relief photo upload + missing CSRF denial on loan write.
  const photoRes = await suite.mf.dispatchFetch(`${origin}/api/lord/photos`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      cookie: cookiePair,
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({
      operationId: crypto.randomUUID(),
      bookingId,
      mime: "image/png",
      base64: PNG_1PX,
    }),
  });
  assert.equal(photoRes.status, 200);
  const photoId = (await photoRes.json()).data.photoId;
  assert.ok(photoId, "Relief collection photo uploaded");

  const loanOp = crypto.randomUUID();
  const loanPayload = {
    action: "loan",
    operationId: loanOp,
    bookingId,
    revision: 1,
    items: [{ resourceId: "cart-alpha", quantity: 10 }],
    photoIds: [photoId],
  };
  const noCsrf = await suite.mf.dispatchFetch(`${origin}/api/lord/transaction`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: cookiePair },
    body: JSON.stringify(loanPayload),
  });
  assert.equal(noCsrf.status, 403);
  assert.equal((await noCsrf.json()).error.code, "CSRF_INVALID");

  // 8. Valid relief loan + exact idempotent retry + opensessions + return.
  const collectRes = await suite.mf.dispatchFetch(`${origin}/api/lord/transaction`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      cookie: cookiePair,
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(loanPayload),
  });
  assert.equal(collectRes.status, 200);
  const collected = await collectRes.json();
  assert.equal(collected.data.status, "COLLECTED");

  // Exact replay returns the same committed receipt.
  const replay = await suite.mf.dispatchFetch(`${origin}/api/lord/transaction`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      cookie: cookiePair,
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(loanPayload),
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).data.receipt.operationId, loanOp);

  const openRes = await suite.mf.dispatchFetch(
    `${origin}/api/lord/transaction?action=opensessions&date=${today}`,
    { headers: { cookie: cookiePair } },
  );
  assert.equal(openRes.status, 200);
  assert.ok((await openRes.json()).data.sessions.some((s) => s.bookingId === bookingId));

  const retPhotoRes = await suite.mf.dispatchFetch(`${origin}/api/lord/photos`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      cookie: cookiePair,
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({
      operationId: crypto.randomUUID(),
      bookingId,
      mime: "image/png",
      base64: PNG_1PX,
    }),
  });
  assert.equal(retPhotoRes.status, 200);
  const retPhotoId = (await retPhotoRes.json()).data.photoId;

  const returnOp = crypto.randomUUID();
  const returnRes = await suite.mf.dispatchFetch(`${origin}/api/lord/transaction`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      cookie: cookiePair,
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({
      action: "return",
      operationId: returnOp,
      bookingId,
      revision: collected.data.revision,
      items: [{ resourceId: "cart-alpha", quantity: 10, photoIds: [retPhotoId] }],
    }),
  });
  assert.equal(returnRes.status, 200);
  assert.equal((await returnRes.json()).data.status, "RETURNED");

  // Confirm audit records relief actor attribution.
  const db = await suite.db("lord");
  const auditRow = await db
    .prepare("SELECT actor_id, details_json FROM product_audit WHERE operation_id=?")
    .bind(loanOp)
    .first();
  assert.equal(auditRow?.actor_id, "relief:91234567");
  assert.equal(JSON.parse(auditRow.details_json).reliefMobile, "91234567");

  // 9. Logout clears the relief cookie.
  const logoutRes = await suite.mf.dispatchFetch(`${origin}/api/lord/auth/relief`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie: cookiePair },
    body: JSON.stringify({ logout: true }),
  });
  assert.equal(logoutRes.status, 200);
  assert.ok((logoutRes.headers.get("set-cookie") || "").includes("Max-Age=0"));

  console.log("v1-product-lord-relief-auth: PASS");
} finally {
  await suite.close();
}
