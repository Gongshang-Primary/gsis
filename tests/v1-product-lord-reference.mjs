import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { handle } from "../v1/services/lord/service.mjs";
import { one } from "../v1/runtime/store.mjs";
const h = await createDatabase("lord"),
  now = Date.now() + 60000,
  school = "reference-school";
let seq = 0;
const p = {
  schoolId: school,
  actorId: "admin",
  staffId: "staff",
  sessionId: "session",
  decisionId: "decision",
  validUntil: now + 86400000,
  capabilities: ["lord.admin", "lord.read"],
  dependencies: [{ owner: "core", scope: "account:admin", revision: 1 }],
  action: "lord.admin",
  requestDigest: "synthetic",
};
const env = {
  DB: h.db,
  ARTIFACTS: h.bucket,
  SCHOOL_ID: school,
  SERVICE_NAME: "lord",
  GSIS_SECRET: "synthetic",
  CORE: {
    fetch: async (r) => {
      const b = await r.json();
      return Response.json({
        ok: true,
        data: new URL(r.url).pathname.endsWith("/release")
          ? { state: "released" }
          : {
              pinId: b.pinId,
              owner: "core",
              scope: b.scope,
              revision: b.revision,
              validUntil: p.validUntil,
            },
      });
    },
  },
};
function call(path, body = {}, method = "POST", principal = p) {
  return handle({
    env,
    path,
    method,
    body: method === "POST" ? { operationId: "ref-" + ++seq, ...body } : body,
    principal,
    now,
    request: new Request("https://synthetic.test" + path),
  });
}
try {
  await call("/settings", {
    key: "referenceLists",
    revision: 0,
    value: { classes: ["1A", "2B"], subjects: ["English", "Art"] },
  });
  await assert.rejects(
    call("/settings", {
      key: "referenceLists",
      revision: 1,
      value: { classes: ["1A", "1a"], subjects: ["Art"] },
    }),
    (e) => e.code === "INVALID_INPUT",
  );
  await assert.rejects(
    call("/settings", {
      key: "referenceLists",
      revision: 1,
      value: { classes: [" "], subjects: ["Art"] },
    }),
    (e) => e.code === "INVALID_INPUT",
  );
  await call("/settings", {
    key: "periodTimings",
    revision: 0,
    value: {
      periods: [
        { code: "1", start: "07:30", end: "08:00" },
        { code: "2", start: "08:00", end: "08:30" },
      ],
    },
  });
  await assert.rejects(
    call("/settings", {
      key: "periodTimings",
      revision: 1,
      value: {
        periods: [
          { code: "1", start: "07:30", end: "08:00" },
          { code: "2", start: "07:45", end: "08:30" },
        ],
      },
    }),
    (e) => e.code === "INVALID_INPUT",
  );
  const resource = {
    resourceId: "cart-one",
    name: "Trolley one",
    type: "tablet",
    capacity: 20,
    metadata: {
      cart: "North wing",
      stylusOption: true,
      headphoneOption: false,
    },
  };
  await call("/resources", { ...resource, revision: 0 });
  await assert.rejects(
    call("/resources", {
      ...resource,
      resourceId: "cart-two",
      type: "laptop",
      revision: 0,
    }),
    (e) => e.code === "INVALID_INPUT",
  );
  await call("/resources", {
    ...resource,
    resourceId: "cart-two",
    revision: 0,
  });
  const ref = await call("/resources?includeInactive=1", {}, "GET");
  assert.equal(
    ref.resources.find((r) => r.id === "cart-one").cart,
    "North wing",
  );
  assert.equal(
    ref.trolleys.find((r) => r.id === "cart-one").group,
    "North wing",
  );
  await h.db
    .prepare(
      "INSERT INTO lord_bookings VALUES(?,?,?,?,?,?,?,'BOOKED',1,'{}',?,?,'initial')",
    )
    .bind(school, "reserved", "staff", "admin", "2099-01-01", 1, 2, now, now)
    .run();
  await h.db
    .prepare(
      "INSERT INTO lord_booking_items(school_id,booking_id,resource_id,quantity) VALUES(?,?,?,?)",
    )
    .bind(school, "reserved", "cart-one", 10)
    .run();
  await assert.rejects(
    call("/resources", { ...resource, capacity: 9, revision: 1 }),
    (e) => e.code === "REVISION_CONFLICT",
  );
  await assert.rejects(
    call("/resources", {
      ...resource,
      metadata: { cart: "Different cart" },
      revision: 1,
    }),
    (e) => e.code === "REVISION_CONFLICT",
  );
  await assert.rejects(
    call("/settings", {
      key: "periodTimings",
      revision: 1,
      value: { periods: [{ code: "1", start: "07:45", end: "08:00" }] },
    }),
    (e) => e.code === "REVISION_CONFLICT",
  );
  const before = await one(
    h.db,
    "SELECT name,revision FROM lord_resources WHERE resource_id=?",
    ["cart-two"],
  );
  // Increasing preparation gaps would reinterpret existing adjacent bookings.
  await h.db
    .prepare(
      "INSERT INTO lord_bookings VALUES(?,?,?,?,?,?,?,'BOOKED',1,'{}',?,?,'initial')",
    )
    .bind(school, "adjacent", "staff", "admin", "2099-01-01", 3, 4, now, now)
    .run();
  await h.db
    .prepare(
      "INSERT INTO lord_booking_items(school_id,booking_id,resource_id,quantity) VALUES(?,?,?,?)",
    )
    .bind(school, "adjacent", "cart-one", 10)
    .run();
  await assert.rejects(
    call("/resources", { ...resource, bufferPeriods: 2, revision: 1 }),
    (e) => e.code === "REVISION_CONFLICT",
  );
  await assert.rejects(
    call("/resources/batch", {
      resources: [
        {
          ...resource,
          resourceId: "cart-two",
          name: "Buffer rollback",
          revision: 1,
        },
        { ...resource, bufferPeriods: 2, revision: 1 },
      ],
    }),
    (e) => e.code === "REVISION_CONFLICT",
  );
  assert.deepEqual(
    await one(
      h.db,
      "SELECT name,revision FROM lord_resources WHERE resource_id=?",
      ["cart-two"],
    ),
    before,
  );
  await assert.rejects(
    call("/resources/batch", {
      resources: [
        {
          ...resource,
          resourceId: "cart-two",
          name: "Should roll back",
          revision: 1,
        },
        { ...resource, capacity: 9, revision: 1 },
      ],
    }),
    (e) => e.code === "REVISION_CONFLICT",
  );
  assert.deepEqual(
    await one(
      h.db,
      "SELECT name,revision FROM lord_resources WHERE resource_id=?",
      ["cart-two"],
    ),
    before,
  );
  const batch = await call("/resources/batch", {
    resources: [
      {
        ...resource,
        resourceId: "cart-two",
        name: "Second trolley",
        revision: 1,
      },
      { ...resource, name: "First trolley", revision: 1 },
    ],
  });
  assert.equal(batch.atomic, true);
  assert.equal(batch.resources.length, 2);
  await assert.rejects(
    call("/resources/batch", {
      resources: [
        { ...resource, resourceId: "cart-two", revision: 1 },
        { ...resource, name: "Must not save", revision: 2 },
      ],
    }),
    (e) => e.code === "REVISION_CONFLICT",
  );
  assert.equal(
    (
      await one(h.db, "SELECT name FROM lord_resources WHERE resource_id=?", [
        "cart-one",
      ])
    ).name,
    "First trolley",
  );
  await assert.rejects(
    call("/resources", { ...resource, revision: 1 }, "POST", {
      ...p,
      impersonating: true,
    }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    call(
      "/settings",
      {
        key: "referenceLists",
        revision: 1,
        value: { classes: [], subjects: [] },
      },
      "POST",
      { ...p, capabilities: ["lord.read"] },
    ),
    (e) => e.status === 403,
  );
  assert.equal(
    (
      await one(
        h.db,
        "SELECT capacity FROM lord_resources WHERE school_id=? AND resource_id=?",
        [school, "cart-one"],
      )
    ).capacity,
    20,
  );
  await h.db
    .prepare("DELETE FROM lord_settings WHERE setting_key='periodTimings'")
    .run();
  await assert.rejects(
    call("/settings", {
      key: "periodTimings",
      revision: 0,
      value: { periods: [{ code: "1", start: "07:45", end: "08:00" }] },
    }),
    (e) => e.code === "REVISION_CONFLICT",
  );
  console.log(
    "LORD reference tables: cart type, labels, periods, reservation guards, permissions and isolation passed",
  );
} finally {
  await h.close();
}
