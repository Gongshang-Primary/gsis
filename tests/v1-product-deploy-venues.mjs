import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { startProduct } from "../scripts/v1/dev.mjs";
import { productSuite, origin } from "./v1-product/suite.mjs";

// Synthetic imported-shape records reproduce missing metadata. They do not
// establish how the owner's reported live version acquired that shape.
const suite = await productSuite({ bindings: { SCHEDULER_OWNER: "v1" } });
let restarted = null;
let originalDisposed = false;
const failures = [];
const school = "synthetic-school";
let count = 0;
async function test(name, run) {
  try {
    await run();
    count++;
    console.log("PASS " + name);
  } catch (error) {
    failures.push({ name, error });
    console.error("FAIL " + name + ": " + error.message);
  }
}
try {
  const admin = await suite.seedAccount("venue-publication-admin");
  const db = await suite.db("deploy");
  const venues = await suite.db("venues");
  await venues
    .prepare(
      "INSERT INTO venues_records(school_id,kind,record_id,revision,data_json) VALUES(?,'venues',?,7,?)",
    )
    .bind(
      school,
      "room-a",
      JSON.stringify({
        id: "room-a",
        name: "Canonical room A",
        unit: "A-01",
        shortName: "A",
      }),
    )
    .run();
  let serial = 0;
  async function plan({
    revision,
    mapping = "class",
    missing = false,
    roomFields = {},
  } = {}) {
    const label = "venue-plan-" + ++serial;
    const { versionId } = await suite.call(
      admin,
      "deploy",
      "/versions/create",
      {
        operationId: label,
        name: "Synthetic venue plan",
        year: 2026,
      },
    );
    const room = {
      id: "room-a",
      name: "Previous room name",
      unit: "A-01",
      shortName: "Old",
      ...(revision !== undefined ? { revision } : {}),
      ...(mapping === "form" ? { form: "1A", forms: ["1A", "2B"] } : {}),
      ...roomFields,
    };
    const rows = [
      [
        "classes",
        "class-a",
        {
          ref: "class-a",
          level: "1",
          name: "A",
          shortName: "A",
          ...(mapping === "class" ? { venueId: "room-a" } : {}),
        },
      ],
      [
        "classes",
        "class-b",
        { ref: "class-b", level: "2", name: "B", shortName: "B" },
      ],
      ...(!missing ? [["venues", "room-a", room]] : []),
      ...(mapping === "group"
        ? [
            [
              "groups",
              "tg-a",
              {
                id: "tg-a",
                name: "Synthetic TG",
                subject: "Music",
                level: "1",
                levels: ["1"],
                classRefs: ["class-a"],
                venue: "room-a",
                weeklyPeriods: 1,
              },
            ],
          ]
        : []),
    ];
    await db.batch(
      rows.map(([scope, rowId, value]) =>
        db
          .prepare(
            "INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,?,?,1,?)",
          )
          .bind(school, versionId, scope, rowId, JSON.stringify(value)),
      ),
    );
    return versionId;
  }
  const snapshot = async (versionId) =>
    (await suite.call(admin, "deploy", "/bootstrap", { versionId })).current;
  const lease = async (versionId, suffix) =>
    suite.call(admin, "deploy", "/lease", {
      operationId: suffix + ".lease",
      versionId,
      scope: "meta",
      clientId: "venue-test",
    });
  async function refreshInput(versionId, revision, operationId) {
    const l = await lease(versionId, operationId);
    return {
      operationId,
      operation: "refreshVenueRegistry",
      versionId,
      revision,
      scope: "meta",
      clientId: "venue-test",
      leaseFence: l.fence,
    };
  }
  async function refresh(versionId, revision, operationId) {
    return suite.request(admin, "deploy", "/change", {
      method: "POST",
      body: await refreshInput(versionId, revision, operationId),
    });
  }
  const usesCases = [
    { name: "absent", fields: {}, removable: true },
    { name: "null", fields: { uses: null }, removable: true },
    { name: "empty-array", fields: { uses: [] }, removable: true },
    {
      name: "ordered-labels",
      fields: {
        uses: [
          "Music programme",
          "Assembly",
          "Music programme",
          "Long activity label",
        ],
      },
    },
    { name: "false", fields: { uses: false } },
    { name: "zero", fields: { uses: 0 } },
    { name: "empty-string", fields: { uses: "" } },
    { name: "string", fields: { uses: "unclassified legacy value" } },
    {
      name: "object",
      fields: {
        uses: { legacy: [null, false, 0, ""], nested: { label: "Unknown" } },
      },
    },
  ];
  const aliasRoom = {
    id: "room-alias",
    name: "Previous room name",
    unit: "B-02",
    shortName: "Alias",
  };
  async function addAlias() {
    await venues
      .prepare(
        "INSERT INTO venues_records(school_id,kind,record_id,revision,data_json) VALUES(?,'venues',?,1,?)",
      )
      .bind(school, aliasRoom.id, JSON.stringify(aliasRoom))
      .run();
  }
  async function removeAlias() {
    await venues
      .prepare("DELETE FROM venues_records WHERE school_id=? AND record_id=?")
      .bind(school, aliasRoom.id)
      .run();
  }

  await test("publication review rejects missing venue revision before starting publication", async () => {
    for (const input of [
      {},
      { revision: null },
      { revision: 0 },
      { revision: "7" },
      { mapping: "group" },
      { mapping: "form" },
      { missing: true },
    ]) {
      const versionId = await plan(input);
      const response = await suite.request(admin, "deploy", "/publishReview", {
        method: "POST",
        body: { versionId },
      });
      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.equal(response.body.error.code, "VENUE_REFERENCE_STALE");
      assert.equal(
        (
          await db
            .prepare(
              "SELECT COUNT(*) AS n FROM deploy_prepared_publications WHERE school_id=?",
            )
            .bind(school)
            .first()
        ).n,
        0,
      );
    }
  });
  await test("venue refresh preserves Deploy form assignments while obtaining canonical revisions", async () => {
    const uses = ["Music programme", "Assembly", "Music programme"];
    const versionId = await plan({ mapping: "form", roomFields: { uses } });
    const before = await snapshot(versionId);
    const response = await refresh(versionId, 0, "refresh-forms");
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const after = await snapshot(versionId);
    assert.equal(after.venues[0].form, "1A");
    assert.deepEqual(after.venues[0].forms, ["1A", "2B"]);
    assert.deepEqual(after.venues[0].uses, uses);
    assert.equal(after.venues[0].revision, 7);
    assert.equal(after.venues[0].name, "Canonical room A");
    assert.deepEqual(after.classes, before.classes);
    assert.deepEqual(after.groups, before.groups);
    assert.deepEqual(after.assignments, before.assignments);
    assert.equal(after.revision, 1);
    assert.equal(response.body.data.workingRevision, 1);
  });
  let retainedVersionId;
  await test("same-ID refresh retains each own uses value without transferring metadata by display name", async () => {
    const versionId = await plan({ mapping: "none" });
    const originalInputs = structuredClone(usesCases);
    await addAlias();
    try {
      await venues.batch(
        usesCases.map((value) =>
          venues
            .prepare(
              "INSERT INTO venues_records(school_id,kind,record_id,revision,data_json) VALUES(?,'venues',?,7,?)",
            )
            .bind(
              school,
              "retained-" + value.name,
              JSON.stringify({
                id: "retained-" + value.name,
                name: "Canonical " + value.name,
                unit: "A-01",
                shortName: "A",
              }),
            ),
        ),
      );
      await db.batch(
        usesCases.map((value) =>
          db
            .prepare(
              "INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,'venues',?,1,?)",
            )
            .bind(
              school,
              versionId,
              "retained-" + value.name,
              JSON.stringify({
                id: "retained-" + value.name,
                name: aliasRoom.name,
                unit: "Old unit",
                shortName: "Old",
                revision: 1,
                legacyOnly: "Do not copy the whole row",
                ...value.fields,
              }),
            ),
        ),
      );
      const before = await snapshot(versionId);
      const response = await refresh(versionId, 0, "uses-retain-all");
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const after = await snapshot(versionId);
      for (const value of usesCases) {
        const room = after.venues.find(
          (v) => v.id === "retained-" + value.name,
        );
        assert.equal(
          Object.hasOwn(room, "uses"),
          Object.hasOwn(value.fields, "uses"),
          value.name,
        );
        assert.deepEqual(room.uses, value.fields.uses, value.name);
        assert.equal(room.name, "Canonical " + value.name);
        assert.equal(room.unit, "A-01");
        assert.equal(room.shortName, "A");
        assert.equal(room.revision, 7);
        assert.equal(Object.hasOwn(room, "legacyOnly"), false);
      }
      assert.deepEqual(usesCases, originalInputs);
      const added = after.venues.find((v) => v.id === aliasRoom.id);
      assert.equal(added.name, before.venues[0].name);
      assert.equal(Object.hasOwn(added, "uses"), false);
      assert.deepEqual(after.classes, before.classes);
      assert.deepEqual(after.groups, before.groups);
      assert.deepEqual(after.assignments, before.assignments);
      retainedVersionId = versionId;
    } finally {
      await venues.batch(
        usesCases.map((value) =>
          venues
            .prepare(
              "DELETE FROM venues_records WHERE school_id=? AND record_id=?",
            )
            .bind(school, "retained-" + value.name),
        ),
      );
      await removeAlias();
    }
  });
  await test("missing canonical IDs only discard absent or explicitly empty uses and reject other values atomically", async () => {
    await addAlias();
    await venues
      .prepare(
        "UPDATE venues_records SET kind='temporarily-removed' WHERE school_id=? AND record_id='room-a'",
      )
      .bind(school)
      .run();
    try {
      for (const value of usesCases) {
        const versionId = await plan({
          mapping: "none",
          roomFields: value.fields,
        });
        const before = await snapshot(versionId);
        const rows = await db
          .prepare(
            "SELECT scope,row_id,revision,value FROM deploy_rows WHERE school_id=? AND version_id=? ORDER BY scope,row_id",
          )
          .bind(school, versionId)
          .all();
        const operationId = "uses-remove-" + value.name;
        const response = await refresh(versionId, 0, operationId);
        const after = await snapshot(versionId);
        if (value.removable) {
          assert.equal(
            response.status,
            200,
            value.name + ": " + JSON.stringify(response.body),
          );
          assert.equal(
            after.venues.some((v) => v.id === "room-a"),
            false,
          );
          assert.equal(after.revision, 1);
          assert.equal(
            Object.hasOwn(
              after.venues.find((v) => v.id === aliasRoom.id),
              "uses",
            ),
            false,
          );
        } else {
          assert.equal(
            response.status,
            409,
            value.name + ": " + JSON.stringify(response.body),
          );
          assert.equal(response.body.error.code, "VENUE_REFERENCE_CHANGED");
          assert.match(response.body.error.message, /room-use metadata/i);
          assert.deepEqual(after, before, value.name);
          const unchanged = await db
            .prepare(
              "SELECT scope,row_id,revision,value FROM deploy_rows WHERE school_id=? AND version_id=? ORDER BY scope,row_id",
            )
            .bind(school, versionId)
            .all();
          assert.deepEqual(unchanged.results, rows.results, value.name);
          assert.equal(
            (
              await db
                .prepare(
                  "SELECT COUNT(*) AS n FROM product_audit WHERE school_id=? AND operation_id=?",
                )
                .bind(school, operationId)
                .first()
            ).n,
            0,
          );
        }
      }
    } finally {
      await venues
        .prepare(
          "UPDATE venues_records SET kind='venues' WHERE school_id=? AND record_id='room-a'",
        )
        .bind(school)
        .run();
      await removeAlias();
    }
  });
  let refreshReplay;
  await test("lost refresh response replays original uses and revision after catalogue changes but rejects changed intent", async () => {
    const uses = { legacy: ["Music", "Music"], unknown: false };
    const versionId = await plan({ mapping: "none", roomFields: { uses } });
    const input = await refreshInput(
      versionId,
      0,
      "uses-refresh-response-lost",
    );
    // Discard the HTTP result; only the durable receipt establishes its outcome.
    await suite.request(admin, "deploy", "/change", {
      method: "POST",
      body: input,
    });
    const receipt = await suite.call(admin, "deploy", "/receipt", {
      operationId: input.operationId,
    });
    assert.equal(receipt.receipt?.state, "committed", JSON.stringify(receipt));
    const saved = await snapshot(versionId);
    assert.deepEqual(saved.venues[0].uses, uses);
    assert.equal(saved.revision, 1);
    const canonical = await venues
      .prepare(
        "SELECT revision,data_json FROM venues_records WHERE school_id=? AND kind='venues' AND record_id='room-a'",
      )
      .bind(school)
      .first();
    await venues
      .prepare(
        "UPDATE venues_records SET revision=8,data_json=? WHERE school_id=? AND kind='venues' AND record_id='room-a'",
      )
      .bind(
        JSON.stringify({
          ...JSON.parse(canonical.data_json),
          name: "Later canonical room",
        }),
        school,
      )
      .run();
    try {
      const repeated = await suite.call(admin, "deploy", "/change", input);
      assert.deepEqual(repeated, receipt.receipt.result);
      assert.deepEqual(await snapshot(versionId), saved);
      const changed = await suite.request(admin, "deploy", "/change", {
        method: "POST",
        body: { ...input, revision: 1 },
      });
      assert.equal(changed.status, 409, JSON.stringify(changed.body));
      assert.equal(changed.body.error.code, "OPERATION_INTENT_CONFLICT");
      assert.deepEqual(await snapshot(versionId), saved);
      assert.deepEqual(
        (
          await suite.call(admin, "deploy", "/receipt", {
            operationId: input.operationId,
          })
        ).receipt,
        receipt.receipt,
      );
      refreshReplay = { input, receipt: receipt.receipt, saved };
    } finally {
      await venues
        .prepare(
          "UPDATE venues_records SET revision=?,data_json=? WHERE school_id=? AND kind='venues' AND record_id='room-a'",
        )
        .bind(canonical.revision, canonical.data_json, school)
        .run();
    }
  });
  await test("direct publication rejects missing metadata before persisting a prepared payload", async () => {
    const versionId = await plan();
    const l = await lease(versionId, "missing-publish");
    const input = {
      operationId: "missing-publish",
      versionId,
      revision: 0,
      expectedPointerSequence: 0,
      scope: "meta",
      clientId: "venue-test",
      leaseFence: l.fence,
    };
    const response = await suite.request(admin, "deploy", "/publish", {
      method: "POST",
      body: input,
    });
    assert.equal(response.status, 409, JSON.stringify(response.body));
    assert.equal(response.body.error.code, "VENUE_REFERENCE_STALE");
    const receipt = await suite.call(admin, "deploy", "/receipt", {
      operationId: input.operationId,
    });
    assert.equal(receipt.receipt.state, "terminal-not-committed");
    assert.equal(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM deploy_prepared_publications WHERE operation_id=?",
          )
          .bind(input.operationId)
          .first()
      ).n,
      0,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT COUNT(*) AS n FROM deploy_publications")
          .first()
      ).n,
      0,
    );
    assert.equal(
      (await db.prepare("SELECT COUNT(*) AS n FROM deploy_pointer").first()).n,
      0,
    );
    const retry = await suite.request(admin, "deploy", "/publish", {
      method: "POST",
      body: input,
    });
    assert.equal(retry.body.error.code, "OPERATION_ABORTED");
  });
  await test("a deleted form-only room cannot disappear during refresh", async () => {
    await venues
      .prepare(
        "UPDATE venues_records SET kind='temporarily-removed' WHERE school_id=? AND record_id='room-a'",
      )
      .bind(school)
      .run();
    try {
      for (const mapping of ["form", "class", "group"]) {
        const versionId = await plan({ mapping });
        const before = await snapshot(versionId);
        const response = await refresh(
          versionId,
          0,
          "refresh-missing-" + mapping + "-room",
        );
        assert.equal(response.status, 409, JSON.stringify(response.body));
        assert.equal(response.body.error.code, "VENUE_REFERENCE_CHANGED");
        const after = await snapshot(versionId);
        assert.deepEqual(after.venues, before.venues);
        assert.deepEqual(after.classes, before.classes);
        assert.deepEqual(after.groups, before.groups);
        assert.equal(after.revision, before.revision);
      }
    } finally {
      await venues
        .prepare(
          "UPDATE venues_records SET kind='venues' WHERE school_id=? AND record_id='room-a'",
        )
        .bind(school)
        .run();
    }
  });
  await test("stale refresh revision is rejected without changing the draft", async () => {
    const versionId = await plan();
    const before = await snapshot(versionId);
    const response = await refresh(versionId, 99, "refresh-stale-revision");
    assert.equal(response.status, 409, JSON.stringify(response.body));
    assert.equal(response.body.error.code, "REVISION_CONFLICT");
    assert.deepEqual((await snapshot(versionId)).venues, before.venues);
    assert.equal((await snapshot(versionId)).revision, 0);
  });
  let published, publishInput;
  await test("refreshed venue evidence publishes through actual owner fencing and survives a lost response", async () => {
    const versionId = await plan({ mapping: "group" });
    const refreshResult = await refresh(versionId, 0, "refresh-before-publish");
    assert.equal(refreshResult.status, 200, JSON.stringify(refreshResult.body));
    // Compatibility metadata alone is not a current allocation or dependency.
    // This synthetic room intentionally has no canonical revision; class/TG
    // references to that shape still fail the existing preflight above.
    await db
      .prepare(
        "INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,'venues','uses-only-room',1,?)",
      )
      .bind(
        school,
        versionId,
        JSON.stringify({
          id: "uses-only-room",
          name: "Uses only",
          uses: ["Legacy activity"],
        }),
      )
      .run();
    const review = await suite.call(admin, "deploy", "/publishReview", {
      versionId,
    });
    assert.equal(review.workingRevision, 1);
    const l = await lease(versionId, "valid-publish");
    publishInput = {
      operationId: "valid-publish",
      versionId,
      revision: 1,
      expectedPointerSequence: 0,
      scope: "meta",
      clientId: "venue-test",
      leaseFence: l.fence,
    };
    // Discard the first successful HTTP result as though the browser lost it.
    await suite.request(admin, "deploy", "/publish", {
      method: "POST",
      body: publishInput,
    });
    const receipt = await suite.call(admin, "deploy", "/receipt", {
      operationId: publishInput.operationId,
    });
    assert.equal(receipt.receipt?.state, "committed", JSON.stringify(receipt));
    published = receipt.receipt.result;
    assert.equal(published.sequence, 1);
    assert.equal(
      (
        await venues
          .prepare(
            "SELECT COUNT(*) AS n FROM venues_fence_scopes WHERE source_operation_id=? AND venue_id='room-a'",
          )
          .bind(publishInput.operationId)
          .first()
      ).n,
      1,
    );
    assert.deepEqual(
      (
        await venues
          .prepare(
            "SELECT venue_id FROM venues_fence_scopes WHERE school_id=? AND source_operation_id=? ORDER BY venue_id",
          )
          .bind(school, publishInput.operationId)
          .all()
      ).results,
      [{ venue_id: "room-a" }],
    );
    const repeated = await suite.call(
      admin,
      "deploy",
      "/publish",
      publishInput,
    );
    assert.equal(repeated.publicationId, published.publicationId);
    assert.equal(
      (
        await db
          .prepare("SELECT COUNT(*) AS n FROM deploy_publications")
          .first()
      ).n,
      1,
    );
    const immutable = await suite.call(admin, "deploy", "/publications", {
      publicationId: published.publicationId,
    });
    assert.equal(immutable.document.venues[0].revision, 7);
    assert.equal(immutable.document.groups[0].venue, "room-a");
    assert.deepEqual(
      immutable.document.venues.find((v) => v.id === "uses-only-room").uses,
      ["Legacy activity"],
    );
    await suite.trigger("deploy");
    assert.equal(
      (
        await venues
          .prepare(
            "SELECT state FROM venues_source_fences WHERE source_operation_id=?",
          )
          .bind(publishInput.operationId)
          .first()
      ).state,
      "adopted",
    );
  });
  await test("a later canonical revision still rejects publication without refreshing frozen evidence", async () => {
    const versionId = await plan({ revision: 7 });
    await venues
      .prepare(
        "UPDATE venues_records SET revision=8 WHERE school_id=? AND record_id='room-a'",
      )
      .bind(school)
      .run();
    const l = await lease(versionId, "changed-room-publish");
    const input = {
      operationId: "changed-room-publish",
      versionId,
      revision: 0,
      expectedPointerSequence: 1,
      scope: "meta",
      clientId: "venue-test",
      leaseFence: l.fence,
    };
    const response = await suite.request(admin, "deploy", "/publish", {
      method: "POST",
      body: input,
    });
    assert.equal(response.status, 409, JSON.stringify(response.body));
    assert.equal(response.body.error.code, "VENUE_REFERENCE_CHANGED");
    assert.equal((await snapshot(versionId)).venues[0].revision, 7);
    assert.equal(
      (
        await db
          .prepare("SELECT sequence FROM deploy_pointer WHERE school_id=?")
          .bind(school)
          .first()
      ).sequence,
      1,
    );
    const prepared = await db
      .prepare(
        "SELECT document FROM deploy_prepared_publications WHERE operation_id='changed-room-publish'",
      )
      .first();
    assert.equal(JSON.parse(prepared.document).venues[0].revision, 7);
    const receipt = await suite.call(admin, "deploy", "/receipt", {
      operationId: "changed-room-publish",
    });
    assert.equal(receipt.receipt.state, "terminal-not-committed");
    const original = await suite.call(admin, "deploy", "/publications", {
      publicationId: published.publicationId,
    });
    assert.equal(original.document.venues[0].revision, 7);
    const refreshed = await refresh(versionId, 0, "refresh-after-abort");
    assert.equal(refreshed.status, 200, JSON.stringify(refreshed.body));
    assert.equal((await snapshot(versionId)).venues[0].revision, 8);
    const retry = await suite.request(admin, "deploy", "/publish", {
      method: "POST",
      body: input,
    });
    assert.equal(retry.body.error.code, "OPERATION_ABORTED");
    assert.equal(
      (
        await db
          .prepare(
            "SELECT document FROM deploy_prepared_publications WHERE operation_id='changed-room-publish'",
          )
          .first()
      ).document,
      prepared.document,
    );
  });
  await test("durable publication and aborted receipts remain authoritative after Worker restart", async () => {
    await suite.mf.dispose();
    originalDisposed = true;
    restarted = await startProduct({
      persistPath: join(suite.path, "state"),
      output: join(suite.path, "product"),
      migrateSchemas: false,
    });
    async function readReceipt(operationId) {
      const response = await restarted.mf.dispatchFetch(
        origin + "/api/deploy/receipt?operationId=" + operationId,
        {
          headers: { origin, cookie: "__Host-gsis_session=" + admin.token },
        },
      );
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      return result.data;
    }
    const committed = await readReceipt("valid-publish");
    assert.equal(committed.receipt.state, "committed");
    assert.equal(
      committed.receipt.result.publicationId,
      published.publicationId,
    );
    const aborted = await readReceipt("missing-publish");
    assert.equal(aborted.receipt.state, "terminal-not-committed");
    const unknown = await readReceipt("never-started");
    assert.equal(unknown.state, "unknown");
    assert.equal(unknown.saved, false);
    assert(refreshReplay, "the successful refresh fixture must be available");
    assert.deepEqual(
      await readReceipt(refreshReplay.input.operationId).then(
        (value) => value.receipt,
      ),
      refreshReplay.receipt,
    );
    for (const versionId of [
      refreshReplay.input.versionId,
      retainedVersionId,
    ]) {
      const response = await restarted.mf.dispatchFetch(
        origin + "/api/deploy/bootstrap?versionId=" + versionId,
        { headers: { origin, cookie: "__Host-gsis_session=" + admin.token } },
      );
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      const document = result.data.current;
      assert.equal(document.revision, 1);
      if (versionId === refreshReplay.input.versionId) {
        assert.deepEqual(document.venues, refreshReplay.saved.venues);
      } else {
        for (const value of usesCases) {
          const room = document.venues.find(
            (v) => v.id === "retained-" + value.name,
          );
          assert.equal(
            Object.hasOwn(room, "uses"),
            Object.hasOwn(value.fields, "uses"),
            value.name,
          );
          assert.deepEqual(room.uses, value.fields.uses, value.name);
        }
      }
    }
  });
} finally {
  if (restarted) await restarted.close();
  if (originalDisposed) await rm(suite.path, { recursive: true, force: true });
  else await suite.close();
}
assert.equal(failures.length, 0, failures.map((f) => f.name).join("; "));
console.log(
  `PASS ${count} Deploy venue publication Worker integration groups.`,
);
