import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { startProduct } from "../scripts/v1/dev.mjs";
import { handle, policy } from "../v1/services/lord/service.mjs";
import { authorize } from "../v1/runtime/security.mjs";
import { digest } from "../v1/runtime/store.mjs";
import { productSuite } from "./v1-product/suite.mjs";

// Local Workers/D1 only. Synthetic reference rows deliberately isolate this
// reservation repair from Contacts reference refresh and live migration data.
const suite = await productSuite();
const school = "synthetic-school";
const groups = ["T", "U", "V", "W", "X", "Y", "Z", "E", "A", "B"];
const failures = [];
let passed = 0,
  restarted = null,
  originalDisposed = false;
async function test(name, run) {
  try {
    await run();
    passed++;
    console.log("PASS " + name);
  } catch (error) {
    failures.push({ name, error });
    console.error("FAIL " + name + ": " + error.stack);
  }
}
try {
  const admin = await suite.seedAccount("cart-admin");
  const borrower = await suite.seedAccount("cart-borrower", {
    capabilities: ["lord.read", "lord.borrow"],
  });
  const db = await suite.db("lord");
  const now = Date.now();
  const date = (offset) =>
    new Date(now + (offset + 1) * 86400000).toISOString().slice(0, 10);
  const label = (key) =>
    ["A", "B"].includes(key) ? "Laptops " + key : "Cart " + key;
  const inventory = groups.flatMap((key) =>
    [1, 2, 3].map((index) => ({
      resourceId: `trolley-${key.toLowerCase()}-${index}`,
      name: `Synthetic ${key} trolley ${index}`,
      type: ["A", "B"].includes(key)
        ? "Laptop"
        : key === "E"
          ? "iPad"
          : "Android tablet",
      capacity: 14,
      active: true,
      exclusive: true,
      bufferPeriods: 1,
      revision: 1,
      metadata: {
        cart: label(key),
        stylusOption: key === "E",
        headphoneOption: true,
      },
    })),
  );
  await db.batch([
    ...[admin, borrower].map((user) =>
      db
        .prepare("INSERT INTO lord_references VALUES(?,?,?,?,?,?,?)")
        .bind(
          school,
          user.staffId,
          "Synthetic " + user.id,
          user.id + "@example.invalid",
          null,
          "synthetic-reference-1",
          now,
        ),
    ),
    db
      .prepare(
        "INSERT INTO lord_reference_state VALUES(?,1,?,'synthetic-reference-1',NULL,?)",
      )
      .bind(school, now, now + 86400000),
    db.prepare("INSERT INTO lord_settings VALUES(?,'periodTimings',1,?)").bind(
      school,
      JSON.stringify({
        periods: Array.from({ length: 22 }, (_, i) => ({
          code: String(i),
          start: `${String(7 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
          end: `${String(7 + Math.floor((i + 1) / 2)).padStart(2, "0")}:${i % 2 ? "00" : "30"}`,
        })),
      }),
    ),
    ...inventory.map((r) =>
      db
        .prepare("INSERT INTO lord_resources VALUES(?,?,?,?,?,?,?,?,?,?)")
        .bind(
          school,
          r.resourceId,
          r.name,
          r.type,
          r.capacity,
          1,
          1,
          1,
          1,
          JSON.stringify(r.metadata),
        ),
    ),
  ]);
  const legacy = [];
  for (let i = 0; i < 29; i++) {
    const key = groups[i % 10],
      bookingId = "imported-booking-" + i,
      status = i < 5 ? "CANCELLED" : "BOOKED";
    legacy.push(
      db
        .prepare("INSERT INTO lord_bookings VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(
          school,
          bookingId,
          borrower.staffId,
          admin.id,
          date(10 + Math.floor(i / 10)),
          2,
          4,
          status,
          1,
          JSON.stringify({
            classOrActivity: "Synthetic class",
            subject: "Math",
            deviceType: inventory.find((r) => r.metadata.cart === label(key))
              .type,
          }),
          now,
          now,
          "initial",
        ),
    );
    for (const resource of inventory.filter(
      (r) => r.metadata.cart === label(key),
    ))
      legacy.push(
        db
          .prepare(
            "INSERT INTO lord_booking_items(school_id,booking_id,resource_id,quantity) VALUES(?,?,?,14)",
          )
          .bind(school, bookingId, resource.resourceId),
      );
  }
  await db.batch(legacy);
  const get = async (user, path) => {
    const result = await suite.request(user, "lord", path);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body.data;
  };
  const reference = () => get(admin, "/reference");
  const post = (user, path, body, headers = {}) =>
    suite.request(user, "lord", path, { method: "POST", body, headers });
  const book = (group, operationId, extra = {}) => ({
    operationId,
    date: date(0),
    startPeriod: 2,
    endPeriod: 3,
    classOrActivity: "Synthetic class",
    subject: "Math",
    bookingGroup: group.bookingGroup,
    requestedQuantity: 20,
    ...extra,
  });
  await test("thirty physical trolleys project ten complete capacity-42 carts", async () => {
    const ref = await reference();
    assert.equal(ref.trolleys.length, 30);
    assert.equal(ref.resources.length, 30);
    assert.equal(ref.bookingResources.length, 10);
    assert.deepEqual(
      ref.bookingResources.map((r) => r.resource),
      groups.map(label),
    );
    for (const row of ref.bookingResources) {
      assert.equal(row.capacity, 42);
      assert.equal(row.bookingGroup.members.length, 3);
      assert.match(row.bookingGroup.revision, /^[a-f0-9]{64}$/);
    }
  });
  let createdBooking, originalBookingBody;
  await test("cart selection creates one booking with every physical member", async () => {
    const ref = await reference();
    const group = ref.bookingResources.find((r) => r.resource === "Cart T") || {
      bookingGroup: {
        cart: "Cart T",
        revision: "a".repeat(64),
        members: inventory
          .filter((r) => r.metadata.cart === "Cart T")
          .map((r) => ({
            resourceId: r.resourceId,
            revision: r.revision,
            capacity: r.capacity,
          })),
      },
    };
    originalBookingBody = book(group, "cart-create", { headphones: true });
    const result = await post(borrower, "/bookings", originalBookingBody);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    createdBooking = result.body.data;
    const view = await get(
      borrower,
      "/bookings/get?bookingId=" + result.body.data.bookingId,
    );
    assert.equal(view.booking.resource, "Cart T");
    assert.equal(view.booking.requestedQuantity, 20);
    assert.equal(view.booking.reservedCapacity, 42);
    assert.equal(view.booking.items.length, 3);
  });
  const rows = async (sql, args = []) =>
    (
      await db
        .prepare(sql)
        .bind(...args)
        .all()
    ).results;
  const count = async (table) =>
    (await db.prepare("SELECT COUNT(*) AS n FROM " + table).first()).n;
  const group = async (cart) =>
    (await reference()).bookingResources.find((row) => row.resource === cart);
  const bodyFor = async (cart, operationId, extra = {}) =>
    book(await group(cart), operationId, extra);
  const view = async (bookingId) =>
    (await get(borrower, "/bookings/get?bookingId=" + bookingId)).booking;
  await test("ledger-shaped historical bookings stay byte-for-byte intact during grouped reads", async () => {
    const before = {
      bookings: await rows(
        "SELECT * FROM lord_bookings WHERE booking_id LIKE 'imported-%' ORDER BY booking_id",
      ),
      items: await rows(
        "SELECT * FROM lord_booking_items WHERE booking_id LIKE 'imported-%' ORDER BY booking_id,resource_id",
      ),
      events: await rows("SELECT * FROM lord_item_events"),
      outbox: await count("product_outbox"),
    };
    assert.equal(before.bookings.length, 29);
    assert.equal(
      before.bookings.filter((b) => b.status === "CANCELLED").length,
      5,
    );
    assert.equal(before.items.length, 87);
    const historical = await view("imported-booking-10");
    assert.equal(historical.resource, "Cart T");
    assert.equal(historical.groupState, "verified");
    assert.equal(historical.requestedQuantity, null);
    assert.equal(historical.reservedCapacity, 42);
    const day = await get(admin, "/bookings/day?date=" + date(11));
    assert.equal(day.bookings.length, 10);
    const dashboard = await get(admin, "/dashboard?date=" + date(11));
    assert.equal(dashboard.resources.length, 10);
    const board = await get(admin, "/signage?date=" + date(11));
    assert.equal(board.bookings.length, 10);
    assert.equal(new Set(board.bookings.map((b) => b.bookingId)).size, 10);
    assert.deepEqual(
      {
        bookings: await rows(
          "SELECT * FROM lord_bookings WHERE booking_id LIKE 'imported-%' ORDER BY booking_id",
        ),
        items: await rows(
          "SELECT * FROM lord_booking_items WHERE booking_id LIKE 'imported-%' ORDER BY booking_id,resource_id",
        ),
        events: await rows("SELECT * FROM lord_item_events"),
        outbox: await count("product_outbox"),
      },
      before,
    );
  });
  await test("availability, batch and edit share the full cart reservation", async () => {
    const selected = await group("Cart T"),
      params = new URLSearchParams({
        date: date(0),
        startPeriod: "2",
        endPeriod: "3",
        bookingGroup: JSON.stringify(selected.bookingGroup),
        requestedQuantity: "20",
        classOrActivity: "Synthetic class",
        subject: "Math",
      });
    const availability = await get(
      borrower,
      "/bookings/availability?" + params,
    );
    assert.equal(availability.available, false);
    const batch = await suite.call(borrower, "lord", "/bookings/batch", {
      operationId: "cart-batch",
      bookings: [
        await bodyFor("Cart U", "unused-u", { date: date(1) }),
        await bodyFor("Cart V", "unused-v", { date: date(1) }),
      ],
    });
    assert.equal(batch.bookings.length, 2);
    for (const b of batch.bookings)
      assert.equal((await view(b.bookingId)).items.length, 3);
    const target = await view(batch.bookings[0].bookingId);
    const changed = await suite.call(borrower, "lord", "/bookings/update", {
      ...(await bodyFor("Cart U", "cart-update", {
        date: date(1),
        startPeriod: 6,
        endPeriod: 7,
        requestedQuantity: 7,
      })),
      bookingId: target.bookingId,
      revision: target.revision,
    });
    const after = await view(target.bookingId);
    assert.equal(after.requestedQuantity, 7);
    assert.equal(after.reservedCapacity, 42);
    assert.equal(after.items.length, 3);
    assert.equal(changed.revision, target.revision + 1);
    const conflict = await post(
      borrower,
      "/bookings",
      await bodyFor("Cart U", "cart-overlap", {
        date: date(1),
        startPeriod: 6,
        endPeriod: 7,
        requestedQuantity: 1,
      }),
    );
    assert.equal(conflict.status, 409);
  });
  await test("direct APIs reject incomplete, forged and conflicting group selections atomically", async () => {
    const selected = await group("Cart W"),
      base = book(selected, "invalid-placeholder", { date: date(2) });
    const invalid = [
      [
        "physical-only",
        {
          ...base,
          bookingGroup: undefined,
          items: [
            {
              resourceId: selected.bookingGroup.members[0].resourceId,
              quantity: 14,
            },
          ],
        },
        409,
        "GROUP_SELECTION_REQUIRED",
      ],
      [
        "group-and-items",
        {
          ...base,
          items: selected.bookingGroup.members.map((m) => ({
            resourceId: m.resourceId,
            quantity: m.capacity,
          })),
        },
        400,
        "INVALID_INPUT",
      ],
      [
        "stale",
        {
          ...base,
          bookingGroup: { ...base.bookingGroup, revision: "0".repeat(64) },
        },
        409,
        "GROUP_REVISION_CONFLICT",
      ],
      [
        "incomplete",
        {
          ...base,
          bookingGroup: {
            ...base.bookingGroup,
            members: base.bookingGroup.members.slice(1),
          },
        },
        409,
        "GROUP_REVISION_CONFLICT",
      ],
      [
        "forged",
        {
          ...base,
          bookingGroup: {
            ...base.bookingGroup,
            members: base.bookingGroup.members.map((m, i) =>
              i ? m : { ...m, capacity: m.capacity + 1 },
            ),
          },
        },
        409,
        "GROUP_REVISION_CONFLICT",
      ],
      [
        "duplicate",
        {
          ...base,
          bookingGroup: {
            ...base.bookingGroup,
            members: [
              base.bookingGroup.members[0],
              base.bookingGroup.members[0],
            ],
          },
        },
        400,
        "INVALID_INPUT",
      ],
      [
        "unknown",
        {
          ...base,
          bookingGroup: { ...base.bookingGroup, cart: "Unknown cart" },
        },
        409,
        "GROUP_REVISION_CONFLICT",
      ],
      [
        "above-capacity",
        { ...base, requestedQuantity: 43 },
        409,
        "RESOURCE_CAPACITY",
      ],
      [
        "malformed",
        {
          ...base,
          bookingGroup: { cart: "Cart W", revision: 42, members: [] },
        },
        400,
        "INVALID_INPUT",
      ],
    ];
    const before = await count("lord_bookings");
    for (const [name, body, status, code] of invalid) {
      const result = await post(borrower, "/bookings", {
        ...body,
        operationId: "invalid-" + name,
      });
      assert.equal(result.status, status, name + JSON.stringify(result.body));
      assert.equal(result.body.error.code, code, name);
    }
    assert.equal(await count("lord_bookings"), before);
    const batch = await post(borrower, "/bookings/batch", {
      operationId: "cart-invalid-batch",
      bookings: [
        base,
        {
          ...base,
          bookingGroup: { ...base.bookingGroup, cart: "Unknown cart" },
        },
      ],
    });
    assert.equal(batch.status, 409);
    assert.equal(await count("lord_bookings"), before);
  });
  async function seedResources(resources) {
    await db.batch(
      resources.map((r) =>
        db
          .prepare("INSERT INTO lord_resources VALUES(?,?,?,?,?,?,?,?,?,?)")
          .bind(
            school,
            r.resourceId,
            r.name,
            r.type || "Tablet",
            r.capacity ?? 14,
            r.active === false ? 0 : 1,
            1,
            1,
            1,
            JSON.stringify(r.metadata || {}),
          ),
      ),
    );
  }
  await test("standalone resources and nonstandard group capacities remain supported", async () => {
    await seedResources([
      {
        resourceId: "standalone",
        name: "Standalone camera",
        type: "Camera",
        capacity: 5,
      },
      ...[6, 9].map((capacity, i) => ({
        resourceId: "small-cart-" + i,
        name: "Small trolley " + i,
        capacity,
        metadata: { cart: "Small cart" },
      })),
    ]);
    const standalone = await suite.call(borrower, "lord", "/bookings", {
      operationId: "standalone-create",
      date: date(3),
      startPeriod: 2,
      endPeriod: 3,
      classOrActivity: "Synthetic class",
      subject: "Art",
      resourceId: "standalone",
      quantity: 2,
    });
    assert.equal((await view(standalone.bookingId)).groupState, "standalone");
    const small = await suite.call(
      borrower,
      "lord",
      "/bookings",
      await bodyFor("Small cart", "small-cart-create", {
        date: date(3),
        requestedQuantity: 7,
      }),
    );
    const stored = await view(small.bookingId);
    assert.equal(stored.items.length, 2);
    assert.equal(stored.reservedCapacity, 15);
    assert.equal(stored.requestedQuantity, 7);
    await seedResources(
      Array.from({ length: 6 }, (_, i) => ({
        resourceId: "large-cart-" + i,
        name: "Large trolley " + i,
        capacity: 50,
        metadata: { cart: "Large cart" },
      })),
    );
    const largeGroup = await group("Large cart");
    assert.equal(largeGroup.capacity, 300);
    assert.equal(largeGroup.active, true);
    const large = await suite.call(
      borrower,
      "lord",
      "/bookings",
      book(largeGroup, "large-cart-create", {
        date: date(3),
        requestedQuantity: 20,
      }),
    );
    const largeView = await view(large.bookingId);
    assert.equal(largeView.items.length, 6);
    assert.equal(largeView.reservedCapacity, 300);
    assert.equal(largeView.requestedQuantity, 20);
  });
  await test("cancelled booking retains its captured cart identity after inventory moves", async () => {
    const physical = [0, 1].map((i) => ({
      resourceId: "history-cart-" + i,
      name: "Historical trolley " + i,
      type: "Tablet",
      capacity: 14,
      metadata: { cart: "Original historical cart" },
    }));
    await seedResources(physical);
    const created = await suite.call(
      borrower,
      "lord",
      "/bookings",
      await bodyFor("Original historical cart", "historical-cart-create", {
        date: date(9),
        requestedQuantity: 7,
      }),
    );
    await suite.call(borrower, "lord", "/bookings/cancel", {
      operationId: "historical-cart-cancel",
      bookingId: created.bookingId,
      revision: created.revision,
    });
    const before = await rows(
        "SELECT * FROM lord_bookings WHERE booking_id=?",
        [created.bookingId],
      ),
      items = await rows(
        "SELECT * FROM lord_booking_items WHERE booking_id=? ORDER BY resource_id",
        [created.bookingId],
      );
    await suite.call(admin, "lord", "/resources/batch", {
      operationId: "historical-cart-move",
      resources: physical.map((r) => ({
        ...r,
        revision: 1,
        metadata: { cart: "New inventory cart" },
      })),
    });
    const historical = await view(created.bookingId);
    assert.equal(historical.resource, "Original historical cart");
    assert.equal(historical.groupState, "unresolved");
    assert.equal(historical.bookingGroup, null);
    assert.equal(historical.requestedQuantity, 7);
    assert.equal(historical.reservedCapacity, 28);
    assert.deepEqual(
      await rows("SELECT * FROM lord_bookings WHERE booking_id=?", [
        created.bookingId,
      ]),
      before,
    );
    assert.deepEqual(
      await rows(
        "SELECT * FROM lord_booking_items WHERE booking_id=? ORDER BY resource_id",
        [created.bookingId],
      ),
      items,
    );
  });
  await test("custody, partial returns and photo scope retain physical trolley identities", async () => {
    assert(createdBooking, "cart-create fixture must have committed");
    const bookingId = createdBooking.bookingId,
      original = await view(bookingId),
      members = original.items.map((i) => i.resourceId);
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6xUAAAAASUVORK5CYII=";
    const photo = async (operationId, phase) =>
      suite.call(borrower, "lord", "/photos", {
        operationId,
        bookingId,
        mime: "image/png",
        base64: png,
        phase,
      });
    const photos = await Promise.all(
      [0, 1, 2].map((i) => photo("cart-photo-" + i, "collection")),
    );
    const collect = {
      operationId: "cart-collect",
      bookingId,
      revision: 1,
      items: [
        { resourceId: members[0], quantity: 10 },
        { resourceId: members[1], quantity: 6 },
      ],
      photoIds: photos.slice(0, 2).map((p) => p.photoId),
      accessories: {
        headphones: { quantity: 4, photoIds: [photos[2].photoId] },
      },
    };
    const unknown = await post(borrower, "/collect", {
      ...collect,
      operationId: "unknown-trolley",
      items: [{ resourceId: "not-booked", quantity: 1 }],
    });
    assert.equal(unknown.status, 400);
    await suite.call(borrower, "lord", "/collect", collect);
    const collected = await view(bookingId);
    assert.deepEqual(
      collected.items.map((i) => i.resourceId),
      members,
    );
    assert.deepEqual(
      collected.items.map((i) => i.collectedQuantity),
      [10, 6, 0],
    );
    assert.equal(collected.requestedQuantity, 20);
    const token = await suite.call(admin, "lord", "/links", {
      operationId: "cart-scoped-signage",
      purpose: "signage",
      deviceId: "one-trolley",
      resourceIds: [members[0]],
      photos: true,
      expiresAt: Date.now() + 3600000,
    });
    const scoped = await suite.request(null, "lord", "/board?date=" + date(0), {
      headers: { "x-gsis-device-token": token.token },
    });
    assert.equal(scoped.status, 200, JSON.stringify(scoped.body));
    assert.equal(scoped.body.data.bookings.length, 1);
    assert.deepEqual(scoped.body.data.bookings[0].photoIds, []);
    assert.deepEqual(scoped.body.data.bookings[0].resourceIds, [members[0]]);
    assert.equal(scoped.body.data.bookings[0].reservedCapacity, 14);
    assert.equal(scoped.body.data.bookings[0].requestedQuantity, null);
    const forbidden = await suite.request(
      null,
      "lord",
      "/board?photoId=" + photos[1].photoId,
      { headers: { "x-gsis-device-token": token.token } },
    );
    assert.equal(forbidden.status, 403);
    const returnedPhoto = await photo("cart-return-photo", "return");
    const partial = {
      operationId: "cart-partial-return",
      bookingId,
      revision: 2,
      items: [
        {
          resourceId: members[0],
          quantity: 3,
          issueQuantity: 1,
          issueDescription: "Synthetic issue",
          photoIds: [returnedPhoto.photoId],
        },
      ],
      accessories: {
        headphones: { quantity: 2, photoIds: [returnedPhoto.photoId] },
      },
    };
    const wrongPhase = await post(borrower, "/return", {
      ...partial,
      operationId: "cart-wrong-photo",
      items: [{ ...partial.items[0], photoIds: [photos[0].photoId] }],
    });
    assert.equal(wrongPhase.status, 409);
    await suite.call(borrower, "lord", "/return", partial);
    const after = await view(bookingId);
    assert.equal(after.status, "COLLECTED");
    assert.deepEqual(
      after.items.map((i) => [
        i.resourceId,
        i.returnedQuantity,
        i.issueQuantity,
      ]),
      [
        [members[0], 3, 1],
        [members[1], 0, 0],
        [members[2], 0, 0],
      ],
    );
    assert.equal(
      (
        await rows("SELECT * FROM lord_incidents WHERE booking_id=?", [
          bookingId,
        ])
      ).length,
      1,
    );
  });
  await test("ownership, school, preview and revoked capabilities fail closed", async () => {
    const outsider = await suite.seedAccount("cart-outsider", {
      capabilities: ["lord.read", "lord.borrow"],
    });
    assert.equal(
      (
        await suite.request(
          outsider,
          "lord",
          "/bookings/get?bookingId=" + createdBooking.bookingId,
        )
      ).status,
      403,
    );
    const base = await bodyFor("Cart X", "security-base", { date: date(4) });
    const foreign = await post(borrower, "/bookings", {
      ...base,
      operationId: "foreign-school",
      schoolId: "other-school",
    });
    assert.equal(foreign.status, 403);
    const behalf = await post(borrower, "/bookings", {
      ...base,
      operationId: "unauthorised-behalf",
      staffId: admin.staffId,
    });
    assert.equal(behalf.status, 403);
    const preview = await post(
      admin,
      "/bookings",
      { ...base, operationId: "cart-preview" },
      { "x-gsis-preview-account": borrower.id },
    );
    assert.equal(preview.status, 403);
    const core = await suite.db("core");
    await core
      .prepare("DELETE FROM core_grants WHERE account_id=?")
      .bind(outsider.id)
      .run();
    const revoked = await post(outsider, "/bookings", {
      ...base,
      operationId: "cart-revoked",
    });
    assert.equal(revoked.status, 403);
    const adminBooked = await suite.call(admin, "lord", "/bookings", {
      ...base,
      operationId: "admin-behalf",
      staffId: borrower.staffId,
    });
    assert.equal((await view(adminBooked.bookingId)).staffId, borrower.staffId);
  });
  // Real Core authorization and real D1 commits; wrappers control scheduling,
  // never authorization, resource results or transaction outcomes.
  const coreWorker = await suite.mf.getWorker("gsis-core");
  const coreBinding = {
    fetch: async (request) =>
      coreWorker.fetch(request.url, {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        body: await request.text(),
      }),
  };
  const bucket = await suite.mf.getR2Bucket("ARTIFACTS", "gsis-lord");
  function barrier() {
    let arrived, release;
    const ready = new Promise((resolve) => {
      arrived = resolve;
    });
    const held = new Promise((resolve) => {
      release = resolve;
    });
    return {
      ready,
      release,
      async stop() {
        arrived();
        await held;
      },
    };
  }
  async function waitForGate(gate, operation) {
    let timer;
    try {
      await Promise.race([
        gate.ready,
        operation.then((r) => {
          throw (
            r.error || Error("Operation completed before its commit barrier")
          );
        }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error("Commit barrier not reached")),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function direct(user, path, body, database = db) {
    const env = {
      SCHOOL_ID: school,
      SERVICE_NAME: "lord",
      GSIS_SECRET: suite.secret,
      DB: database,
      ARTIFACTS: bucket,
      CORE: coreBinding,
    };
    const now = Date.now(),
      request = new Request("https://gsis.example.invalid" + path, {
        method: "POST",
        headers: {
          origin: "https://gsis.example.invalid",
          cookie: "__Host-gsis_session=" + user.token,
          "x-csrf-token": user.csrf,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const bound = { ...body };
    delete bound.requestId;
    const principal = await authorize(
      env,
      request,
      {
        ...policy("POST", path, body),
        service: "lord",
        operationId: body.operationId,
        bodyDigest: await digest(bound),
      },
      now,
    );
    return handle({
      env,
      path,
      body,
      request,
      method: "POST",
      principal,
      now,
      requestId: crypto.randomUUID(),
    });
  }
  function pausedDb(operationId, gate) {
    return {
      prepare: (sql) => db.prepare(sql),
      batch: async (statements) => {
        if (
          statements.some(
            (s) =>
              s.sql.includes("INSERT INTO product_audit") &&
              s.args.includes(operationId),
          )
        )
          await gate.stop();
        return db.batch(statements);
      },
    };
  }
  let raceSerial = 0;
  async function raceFixture(kind) {
    const serial = ++raceSerial,
      cart = "Race cart " + serial,
      prefix = "race-" + serial;
    const members = [1, 2, 3].map((i) => ({
      resourceId: prefix + "-" + i,
      name: "Synthetic race trolley " + serial + "/" + i,
      type: "Tablet",
      capacity: 14,
      metadata: { cart },
    }));
    const extra = {
      resourceId: prefix + "-extra",
      name: "Synthetic extra " + serial,
      type: "Tablet",
      capacity: 14,
      active: kind !== "activation",
      metadata: { cart: kind === "activation" ? cart : "Other " + serial },
    };
    await seedResources([
      ...members,
      ...(["activation", "move"].includes(kind) ? [extra] : []),
    ]);
    const selected = await group(cart),
      operationId = prefix + "-inventory";
    let path = "/resources",
      resource;
    if (kind === "addition")
      resource = { ...extra, revision: 0, metadata: { cart } };
    if (kind === "activation")
      resource = { ...extra, revision: 1, active: true };
    if (kind === "move")
      resource = { ...extra, revision: 1, metadata: { cart } };
    if (kind === "deactivation")
      resource = { ...members[0], revision: 1, active: false };
    let body = { operationId, revision: resource?.revision, resource };
    if (kind === "batch") {
      path = "/resources/batch";
      body = {
        operationId,
        resources: [
          { ...members[0], revision: 1, metadata: { cart: "Other " + serial } },
          { ...extra, revision: 0, metadata: { cart } },
        ],
      };
    }
    return {
      cart,
      prefix,
      selected,
      inventory: { path, body },
      booking: book(selected, prefix + "-booking", { date: date(30 + serial) }),
    };
  }
  await test("cart membership races protect additions, activation, moves, deactivation and batches in both orders", async () => {
    for (const kind of [
      "addition",
      "activation",
      "move",
      "deactivation",
      "batch",
    ]) {
      for (const winner of ["inventory", "booking"]) {
        const fixture = await raceFixture(kind),
          gate = barrier();
        const first =
          winner === "inventory"
            ? { user: borrower, path: "/bookings", body: fixture.booking }
            : { user: admin, ...fixture.inventory };
        const before = await rows(
          "SELECT * FROM lord_resources WHERE resource_id LIKE ? ORDER BY resource_id",
          [fixture.prefix + "-%"],
        );
        const pending = direct(
          first.user,
          first.path,
          first.body,
          pausedDb(first.body.operationId, gate),
        ).then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
        try {
          await waitForGate(gate, pending);
          const other =
            winner === "inventory"
              ? await post(
                  admin,
                  fixture.inventory.path,
                  fixture.inventory.body,
                )
              : await post(borrower, "/bookings", fixture.booking);
          assert.equal(
            other.status,
            200,
            kind + " " + winner + " " + JSON.stringify(other.body),
          );
        } finally {
          gate.release();
        }
        const outcome = await pending;
        assert.equal(
          outcome.error?.status,
          409,
          kind + " " + winner + " " + JSON.stringify(outcome.value),
        );
        const bookings = await rows(
          "SELECT b.booking_id FROM lord_bookings b JOIN lord_booking_items i USING(school_id,booking_id) WHERE i.resource_id LIKE ?",
          [fixture.prefix + "-%"],
        );
        if (winner === "inventory") assert.equal(bookings.length, 0, kind);
        else {
          assert.equal(bookings.length, 3, kind);
          assert.deepEqual(
            await rows(
              "SELECT * FROM lord_resources WHERE resource_id LIKE ? ORDER BY resource_id",
              [fixture.prefix + "-%"],
            ),
            before,
            kind + " no partial inventory write",
          );
        }
      }
    }
  });
  await test("invalid group bounds and mixed historical membership are explicit, never partial", async () => {
    await seedResources([
      ...Array.from({ length: 21 }, (_, i) => ({
        resourceId: "oversize-" + i,
        name: "Oversize " + i,
        capacity: 1,
        metadata: { cart: "Oversize cart" },
      })),
      {
        resourceId: "mixed-type-a",
        name: "Mixed A",
        type: "Tablet",
        metadata: { cart: "Mixed cart" },
      },
      {
        resourceId: "mixed-type-b",
        name: "Mixed B",
        type: "Laptop",
        metadata: { cart: "Mixed cart" },
      },
    ]);
    const ref = await reference(),
      before = await count("lord_bookings");
    for (const cart of ["Oversize cart", "Mixed cart"]) {
      const selected = ref.bookingResources.find((g) => g.resource === cart);
      assert.equal(selected.active, false, cart);
      assert.equal(selected.groupState, "unresolved");
      assert(selected.unavailableReason);
      const denied = await post(
        borrower,
        "/bookings",
        book(selected, "invalid-cart-" + cart.split(" ")[0], {
          date: date(7),
          requestedQuantity: 1,
        }),
      );
      assert([400, 409].includes(denied.status), JSON.stringify(denied.body));
    }
    assert.equal(await count("lord_bookings"), before);
    await db.batch([
      db
        .prepare("INSERT INTO lord_bookings VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(
          school,
          "mixed-history",
          borrower.staffId,
          admin.id,
          date(8),
          2,
          4,
          "BOOKED",
          1,
          JSON.stringify({
            classOrActivity: "Synthetic class",
            subject: "Math",
          }),
          now,
          now,
          "initial",
        ),
      ...["trolley-t-1", "trolley-u-1"].map((id) =>
        db
          .prepare(
            "INSERT INTO lord_booking_items(school_id,booking_id,resource_id,quantity) VALUES(?,?,?,14)",
          )
          .bind(school, "mixed-history", id),
      ),
    ]);
    const historical = await view("mixed-history");
    assert.equal(historical.groupState, "unresolved");
    assert.equal(historical.bookingGroup, null);
    assert.notEqual(historical.resource, "trolley-t-1");
    assert.equal(historical.requestedQuantity, null);
  });
  await test("overlapping whole-cart bookings have one durable winner", async () => {
    const selected = await group("Cart Y"),
      inputs = ["a", "b"].map((x) =>
        book(selected, "concurrent-cart-" + x, { date: date(5) }),
      );
    const results = await Promise.all(
      inputs.map((body) => post(borrower, "/bookings", body)),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const won = results.find((r) => r.status === 200).body.data;
    assert.equal((await view(won.bookingId)).items.length, 3);
  });
  await test("committed replay, altered intent and process restart preserve the original group snapshot", async () => {
    const lostBody = await bodyFor("Cart Z", "cart-lost-response", {
      date: date(6),
    });
    const lostResponse = await suite.mf.dispatchFetch(
      "https://gsis.example.invalid/api/lord/bookings",
      {
        method: "POST",
        headers: {
          origin: "https://gsis.example.invalid",
          cookie: "__Host-gsis_session=" + borrower.token,
          "x-csrf-token": borrower.csrf,
          "content-type": "application/json",
        },
        body: JSON.stringify(lostBody),
      },
    );
    assert.equal(lostResponse.status, 200);
    await lostResponse.body.cancel(); // Discard the acknowledgement body before receipt recovery.
    const before = await count("lord_bookings");
    const replay = await suite.call(
      borrower,
      "lord",
      "/bookings",
      originalBookingBody,
    );
    assert.equal(replay.bookingId, createdBooking.bookingId);
    assert.equal(await count("lord_bookings"), before);
    const changed = await post(borrower, "/bookings", {
      ...originalBookingBody,
      requestedQuantity: 21,
    });
    assert.equal(changed.status, 409);
    assert.equal(changed.body.error.code, "OPERATION_INTENT_CONFLICT");
    await suite.mf.dispose();
    originalDisposed = true;
    restarted = await startProduct({
      persistPath: join(suite.path, "state"),
      output: join(suite.path, "restarted"),
      migrateSchemas: false,
    });
    async function afterRestart(path, body) {
      const result = await restarted.mf.dispatchFetch(
        "https://gsis.example.invalid/api/lord" + path,
        {
          method: body ? "POST" : "GET",
          headers: {
            origin: "https://gsis.example.invalid",
            cookie: "__Host-gsis_session=" + borrower.token,
            "x-csrf-token": borrower.csrf,
            ...(body ? { "content-type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      const data = await result.json();
      assert.equal(result.status, 200, JSON.stringify(data));
      return data.data;
    }
    const recoveredLost = await afterRestart(
      "/receipt?operationId=" + lostBody.operationId,
    );
    assert.equal(
      recoveredLost.receipt?.state || recoveredLost.state,
      "committed",
    );
    const lostReplay = await afterRestart("/bookings", lostBody);
    const lostView = (
      await afterRestart("/bookings/get?bookingId=" + lostReplay.bookingId)
    ).booking;
    assert.deepEqual(lostView.bookingGroup, lostBody.bookingGroup);
    assert.equal(lostView.requestedQuantity, 20);
    const recovered = await afterRestart(
      "/receipt?operationId=" + originalBookingBody.operationId,
    );
    assert.equal(recovered.receipt?.state || recovered.state, "committed");
    const retried = await afterRestart("/bookings", originalBookingBody);
    assert.equal(retried.bookingId, createdBooking.bookingId);
    const recoveredView = (
      await afterRestart("/bookings/get?bookingId=" + createdBooking.bookingId)
    ).booking;
    assert.deepEqual(
      recoveredView.bookingGroup,
      originalBookingBody.bookingGroup,
    );
    assert.equal(recoveredView.requestedQuantity, 20);
    const afterDb = await restarted.db("lord");
    assert.equal(
      (await afterDb.prepare("SELECT COUNT(*) AS n FROM lord_bookings").first())
        .n,
      before,
    );
  });
} finally {
  if (restarted) await restarted.close();
  if (originalDisposed) await rm(suite.path, { recursive: true, force: true });
  else await suite.close();
}
console.log(`${passed} LORD cart groups passed; ${failures.length} failed.`);
if (failures.length) process.exitCode = 1;
