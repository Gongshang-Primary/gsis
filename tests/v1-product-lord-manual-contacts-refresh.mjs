import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";
import { handle } from "../v1/services/lord/service.mjs";

const suite = await productSuite("v1-lord-manual-contacts-refresh");

try {
  const admin = await suite.seedAccount("synthetic-lord-refresh-admin", {
    capabilities: ["admin", "lord.admin", "contacts.manage"],
  });
  const schoolId = "synthetic-school";

  // 1. Seed mixed Contacts records: known active, known inactive, and provisional (active: null).
  const created = await suite.call(admin, "contacts", "/save-data", {
    operationId: "lord-refresh-seed-contacts-1",
    changes: [],
    additions: [
      {
        id: "seed-active",
        values: {
          "Basic Name": "Tan Active",
          "Statutory Name": "Tan Active",
          Active: "Y",
        },
      },
      {
        id: "seed-inactive",
        values: {
          "Basic Name": "Lim Inactive",
          "Statutory Name": "Lim Inactive",
          Active: "N",
        },
      },
      {
        id: "seed-provisional",
        values: {
          "Basic Name": "Ong Provisional",
          "Statutory Name": "Ong Provisional",
        },
      },
    ],
  });
  const activeId = created.mapping["seed-active"];
  const inactiveId = created.mapping["seed-inactive"];
  const provisionalId = created.mapping["seed-provisional"];
  assert.ok(activeId && inactiveId && provisionalId, "all three Contacts records created");

  // Verify Contacts projection actually contains mixed active: true, false, and null.
  const proj = await suite.call(admin, "contacts", "/projection", {
    schemaVersion: 1,
    purpose: "lord",
    schoolId,
  });
  const byId = new Map((proj.staff || []).map((s) => [s.staffId, s]));
  assert.equal(byId.get(activeId)?.active, true, "active record has active:true");
  assert.equal(byId.get(inactiveId)?.active, false, "inactive record has active:false");
  assert.equal(byId.get(provisionalId)?.active, null, "provisional record has active:null");

  // 2. Manual LORD Contacts refresh succeeds with mixed active + inactive + provisional records.
  const refresh = await suite.call(admin, "lord", "/reference/refresh", {
    operationId: "lord-manual-refresh-mixed-1",
  });
  assert.ok(refresh, "manual reference refresh succeeded");

  const lordDb = await suite.db("lord");
  const refs = (
    await lordDb
      .prepare("SELECT staff_id, name FROM lord_references WHERE school_id=? ORDER BY staff_id")
      .bind(schoolId)
      .all()
  ).results || [];
  const refIds = new Set(refs.map((r) => r.staff_id));
  assert.equal(refIds.has(activeId), true, "known active staff imported into lord_references");
  assert.equal(refIds.has(inactiveId), false, "known inactive staff excluded from lord_references");
  assert.equal(
    refIds.has(provisionalId),
    false,
    "provisional (active:null) staff excluded from lord_references (unknown activity preserved)",
  );

  // 3. Direct malformed activity evidence (string instead of boolean/null) is still rejected with 503.
  const fakeContacts = {
    async fetch() {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            schoolId,
            revision: "bad-rev-1",
            asOf: Date.now() - 1000,
            staff: [
              { staffId: activeId, name: "Tan Active", active: "Y" },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  };
  await assert.rejects(
    () =>
      handle({
        env: { DB: lordDb, CONTACTS: fakeContacts, SCHOOL_ID: schoolId },
        principal: {
          schoolId,
          actorId: admin.id,
          decisionId: "dec-malformed-1",
          validUntil: Date.now() + 60_000,
          capabilities: ["admin", "lord.admin"],
        },
        request: new Request("https://lord.internal/reference/refresh", { method: "POST" }),
        method: "POST",
        path: "/reference/refresh",
        body: { operationId: "lord-malformed-active-1" },
        now: Date.now(),
      }),
    (err) => err?.status === 503 && err?.code === "REFERENCE_UNAVAILABLE",
    "malformed non-boolean/non-null active must still be rejected with 503 REFERENCE_UNAVAILABLE",
  );

  console.log(
    "PASS LORD manual Contacts refresh: accepts mixed active/inactive/provisional (active:null) projection, imports only known active staff, preserves unknown activity, and rejects malformed active evidence with 503.",
  );
} finally {
  await suite.close();
}
