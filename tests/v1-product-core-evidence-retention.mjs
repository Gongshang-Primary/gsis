// Core decision evidence and admission retention/compaction (F5 Stage 4).
// Verifies dryRun preview, RETENTION_DELETE_ENABLED guard (default false -> 409),
// bounded deletion of expired/terminal rows only, preservation of active/recent/held rows,
// idempotent operationId replay, audit trail, and Global Admin enforcement.
import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";

const DAY = 86400000;
const SCHOOL = "synthetic-school";

async function seedRetentionFixture(core, now) {
  const oldTs = now - 120 * DAY;
  const recentTs = now - 10 * DAY;

  const insertEvidence = (id, createdAt, validUntil) =>
    core
      .prepare(
        "INSERT INTO core_evidence(school_id,decision_id,event_json,evidence_json,principal_json,descriptor_json,intent_digest,created_at,valid_until) VALUES(?,?, '{}','{}','{}','{}',NULL,?,?)",
      )
      .bind(SCHOOL, id, createdAt, validUntil)
      .run();

  const insertAdmission = (opId, decisionId, state, validUntil) =>
    core
      .prepare(
        "INSERT INTO product_admissions(school_id,operation_id,fence,digest,decision_id,valid_until,pins_json,state) VALUES(?,?,1,'dig-1',?,?,'[]',?)",
      )
      .bind(SCHOOL, opId, decisionId, validUntil, state)
      .run();

  await insertEvidence("ev-old-terminal", oldTs, oldTs);
  await insertEvidence("ev-old-held-admission", oldTs, oldTs);
  await insertEvidence("ev-old-held-pin", oldTs, oldTs);
  await insertEvidence("ev-recent", recentTs, recentTs);

  await core
    .prepare(
      "INSERT INTO core_destination_receipts(school_id,decision_id,destination,operation_id,digest,receipt_json,recorded_at) VALUES(?,'ev-old-terminal','contacts','op-old-resolved','dig-1','{}',?)",
    )
    .bind(SCHOOL, oldTs)
    .run();

  await insertAdmission("op-old-resolved", "ev-old-terminal", "resolved", oldTs);
  await insertAdmission("op-old-aborted", "ev-old-terminal", "aborted", oldTs);
  await insertAdmission("op-old-ready", "ev-old-held-admission", "ready", oldTs);
  await insertAdmission("op-recent-resolved", "ev-recent", "resolved", recentTs);

  await core
    .prepare(
      "INSERT INTO source_pins(school_id,scope,pin_id,destination,operation_id,digest,fence,revision,valid_until,decision_id,state,created_at) VALUES(?,'scope-1','pin-held-1','contacts','op-pin-1','dig-1',1,'1',?,'ev-old-held-pin','held',?)",
    )
    .bind(SCHOOL, oldTs, oldTs)
    .run();
}

// 1. Default-disabled suite (RETENTION_DELETE_ENABLED = "false").
{
  const suite = await productSuite({
    bindings: { RETENTION_DELETE_ENABLED: "false" },
  });
  try {
    const admin = await suite.seedAccount("ret-admin-disabled");
    const staff = await suite.seedAccount("ret-staff-disabled", {
      capabilities: [],
    });
    const core = await suite.db("core");
    await seedRetentionFixture(core, Date.now());

    const health = await suite.request(admin, "core", "/admin/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.data.retentionDeletionEnabled, false);

    // Non-admin denied.
    const denied = await suite.request(staff, "core", "/admin/evidence/retention", {
      method: "POST",
      body: { operationId: "ret-deny-1", dryRun: true, retentionDays: 90 },
    });
    assert.equal(denied.status, 403);

    // Invalid retentionDays (< 30) rejected.
    const badDays = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: { operationId: "ret-bad-days", dryRun: true, retentionDays: 7 },
    });
    assert.equal(badDays.status, 400);

    // Dry run works even when deletion is disabled, and deletes nothing.
    const preview = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: { operationId: "ret-preview-1", dryRun: true, retentionDays: 90 },
    });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.data.dryRun, true);
    assert.equal(preview.body.data.retentionDeletionEnabled, false);
    assert.equal(preview.body.data.eligible.evidence, 1);
    assert.equal(preview.body.data.eligible.admissions, 2);
    assert.equal(preview.body.data.deleted.evidence, 0);
    assert.equal(preview.body.data.deleted.admissions, 0);

    // Destructive run refused with 409 RETENTION_DISABLED.
    const refused = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: { operationId: "ret-refused-1", dryRun: false, retentionDays: 90 },
    });
    assert.equal(refused.status, 409, JSON.stringify(refused.body));
    assert.equal(refused.body.error?.code, "RETENTION_DISABLED");

    const evCount = (
      await core
        .prepare("SELECT count(*) AS n FROM core_evidence WHERE decision_id='ev-old-terminal'")
        .first()
    ).n;
    assert.equal(evCount, 1, "disabled retention must not delete any rows");
  } finally {
    await suite.close();
  }
}

// 2. Explicitly enabled suite (RETENTION_DELETE_ENABLED = "true").
{
  const suite = await productSuite({
    bindings: { RETENTION_DELETE_ENABLED: "true" },
  });
  try {
    const admin = await suite.seedAccount("ret-admin-enabled");
    const core = await suite.db("core");
    await seedRetentionFixture(core, Date.now());

    const health = await suite.request(admin, "core", "/admin/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.data.retentionDeletionEnabled, true);

    const run1 = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: {
        operationId: "ret-exec-1",
        dryRun: false,
        retentionDays: 90,
        limit: 500,
      },
    });
    assert.equal(run1.status, 200, JSON.stringify(run1.body));
    assert.equal(run1.body.data.state, "committed");
    assert.equal(run1.body.data.result.dryRun, false);
    assert.equal(run1.body.data.result.deleted.evidence, 1);
    assert.equal(run1.body.data.result.deleted.admissions, 2);

    // Idempotent replay returns original receipt without re-deleting.
    const replay = await suite.request(admin, "core", "/admin/evidence/retention", {
      method: "POST",
      body: {
        operationId: "ret-exec-1",
        dryRun: false,
        retentionDays: 90,
        limit: 500,
      },
    });
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.data.state, "committed");
    assert.equal(replay.body.data.result.deleted.evidence, 1);
    assert.equal(replay.body.data.result.deleted.admissions, 2);

    // Verify exact deletions and preservations in D1.
    const remainingEv = new Set(
      (
        await core
          .prepare(
            "SELECT decision_id FROM core_evidence WHERE school_id=? AND decision_id LIKE 'ev-%'",
          )
          .bind(SCHOOL)
          .all()
      ).results.map((r) => r.decision_id),
    );
    assert(!remainingEv.has("ev-old-terminal"), "expired terminal evidence deleted");
    assert(
      remainingEv.has("ev-old-held-admission"),
      "evidence referenced by active admission preserved",
    );
    assert(
      remainingEv.has("ev-old-held-pin"),
      "evidence referenced by held source pin preserved",
    );
    assert(remainingEv.has("ev-recent"), "recent evidence preserved");

    const remainingReceipts = (
      await core
        .prepare(
          "SELECT count(*) AS n FROM core_destination_receipts WHERE school_id=? AND decision_id='ev-old-terminal'",
        )
        .bind(SCHOOL)
        .first()
    ).n;
    assert.equal(remainingReceipts, 0, "destination receipts for compacted evidence deleted");

    const remainingAdm = new Set(
      (
        await core
          .prepare(
            "SELECT operation_id FROM product_admissions WHERE school_id=? AND operation_id LIKE 'op-%'",
          )
          .bind(SCHOOL)
          .all()
      ).results.map((r) => r.operation_id),
    );
    assert(!remainingAdm.has("op-old-resolved"), "old resolved admission deleted");
    assert(!remainingAdm.has("op-old-aborted"), "old aborted admission deleted");
    assert(remainingAdm.has("op-old-ready"), "active unrecovered admission preserved");
    assert(remainingAdm.has("op-recent-resolved"), "recent resolved admission preserved");

    // Durable audit entry recorded.
    const auditRow = await core
      .prepare(
        "SELECT details_json FROM product_audit WHERE school_id=? AND operation_id='ret-exec-1'",
      )
      .bind(SCHOOL)
      .first();
    assert(auditRow, "audit entry recorded for retention run");
    const details = JSON.parse(auditRow.details_json);
    assert.equal(details.kind, "evidence-retention");
    assert.equal(details.deletedEvidence, 1);
    assert.equal(details.deletedAdmissions, 2);
  } finally {
    await suite.close();
  }
}

console.log(
  "PASS Core decision evidence & admission retention (dryRun, RETENTION_DELETE_ENABLED guard, bounded terminal deletion, active/held preservation, idempotency, audit)",
);
