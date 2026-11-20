import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";
import { digest } from "../v1/runtime/store.mjs";

const suite = await productSuite();
try {
  const admin = await suite.seedAccount("ba-admin");
  const teacher = await suite.seedAccount("ba-teacher", {
    capabilities: ["roster.own"],
  });
  const db = await suite.db("roster");
  const bucket = await suite.mf.getR2Bucket("ARTIFACTS", "gsis-roster");
  const now = Date.now();
  const schoolId = "synthetic-school";

  // Seed Roster export artifact + ledger + weekly + opening balance records.
  const exportBody = JSON.stringify({ hello: "roster-export", date: "2026-11-15" });
  const exportDigest = await digest(exportBody);
  const exportKey = `${schoolId}/exports/exp-1.json`;
  await bucket.put(exportKey, exportBody);

  await db.batch([
    db
      .prepare(
        "INSERT INTO roster_exports(school_id,export_id,publication_id,digest,artifact_key,created_at,provider_file_id,last_success_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        schoolId,
        "exp-1",
        "pub-1",
        exportDigest,
        exportKey,
        now - 10000,
        "drive-file-1",
        now - 9000,
      ),
    db
      .prepare(
        "INSERT INTO roster_drive_exports(school_id,publication_id,file_id,content_digest,folder_id,state,last_error,last_success_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        schoolId,
        "pub-2",
        "drive-file-2",
        exportDigest,
        "folder-1",
        "verified",
        null,
        now - 5000,
        now - 5000,
      ),
    db
      .prepare(
        "INSERT INTO roster_ledger(school_id,duty_id,correction_revision,staff_id,service_date,period,period_count,charge,completion_basis,assignment_json,actor_id,reason,operation_id,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        schoolId,
        "duty-1",
        0,
        admin.staffId,
        "2026-11-10",
        2,
        1,
        1,
        "end-time",
        JSON.stringify({
          className: "5A",
          subject: "Math",
          venue: "Room 5A",
          absentName: "Teacher A",
          instructions: "Worksheet p.12",
        }),
        admin.id,
        "published",
        "op-duty-1",
        now - 50000,
      ),
    db
      .prepare(
        "INSERT INTO roster_weekly(school_id,staff_id,week,publication_id,publication_sequence,calculation_version,quota,excluded,exclusion_reason,captured_at,evidence_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        schoolId,
        admin.staffId,
        "2026-11-09",
        "pub-1",
        1,
        "v1",
        5,
        0,
        "",
        now - 40000,
        "{}",
      ),
    db
      .prepare(
        "INSERT INTO roster_openings(school_id,staff_id,year,revision,cutoff,period_count,charge,source_digest,operation_id) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        schoolId,
        admin.staffId,
        "2026",
        1,
        "2026-06-30",
        3,
        3,
        exportDigest,
        "op-open-1",
      ),
  ]);

  // 1. /backup-ledger: non-admin denied.
  const deniedLedger = await suite.request(teacher, "roster", "/backup-ledger", {
    method: "POST",
    body: { operation: "read" },
  });
  assert.ok([403, 503].includes(deniedLedger.status));

  // 2. /backup-ledger read returns config, status, rows, requests matching backup-ledger.js contract.
  const ledger = await suite.call(admin, "roster", "/backup-ledger", {
    operation: "read",
  });
  assert.equal(typeof ledger.config.enabled, "boolean");
  assert.ok(ledger.status.lastVerifiedAt > 0);
  assert.equal(ledger.rows.length, 2);
  assert.ok(ledger.rows.some((r) => r.drive_file_id === "drive-file-1"));
  assert.ok(ledger.rows.some((r) => r.drive_file_id === "drive-file-2"));

  // 3. /backup-ledger verify verifies R2 artifact digest and supports idempotent replay.
  const verifyOpId = crypto.randomUUID();
  const verified = await suite.call(admin, "roster", "/backup-ledger", {
    operation: "verify",
    operationId: verifyOpId,
    manifestFileId: "drive-file-1",
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.code, "VERIFIED_R2_DIGEST");
  assert.equal(verified.request.kind, "verify");
  assert.equal(verified.request.status, "verified");

  const verifiedReplay = await suite.call(admin, "roster", "/backup-ledger", {
    operation: "verify",
    operationId: verifyOpId,
    manifestFileId: "drive-file-1",
  });
  assert.equal(verifiedReplay.receipt.operationId, verifyOpId);
  assert.equal(verifiedReplay.verified, true);

  // Tampered R2 artifact fails verification honestly without claiming verified.
  await bucket.put(exportKey, "tampered-bytes");
  const tamperedVerify = await suite.call(admin, "roster", "/backup-ledger", {
    operation: "verify",
    operationId: crypto.randomUUID(),
    manifestFileId: "drive-file-1",
  });
  assert.equal(tamperedVerify.verified, false);
  assert.equal(tamperedVerify.code, "BACKUP_DIGEST_MISMATCH");
  assert.equal(tamperedVerify.request.status, "failed");

  // Unknown manifest returns 404.
  const missingManifest = await suite.request(admin, "roster", "/backup-ledger", {
    method: "POST",
    body: {
      operation: "verify",
      operationId: crypto.randomUUID(),
      manifestFileId: "nonexistent-file",
    },
  });
  assert.equal(missingManifest.status, 404);

  // 4. /backup-ledger restore explicitly refuses live HTTP restore (409 RESTORE_ISOLATED_ONLY).
  const restoreBlocked = await suite.request(admin, "roster", "/backup-ledger", {
    method: "POST",
    body: {
      operation: "restore",
      operationId: crypto.randomUUID(),
      manifestFileId: "drive-file-2",
    },
  });
  assert.equal(restoreBlocked.status, 409);
  assert.equal(restoreBlocked.body.error.code, "RESTORE_ISOLATED_ONLY");

  // 5. archiveColdOutput: creates verified immutable R2 archive, preserves all authoritative D1 rows, supports replay.
  const archiveOpId = crypto.randomUUID();
  const archived = await suite.call(admin, "roster", "/operations", {
    operation: "archiveColdOutput",
    operationId: archiveOpId,
    throughDate: "2026-11-18",
  });
  assert.ok(Number.isSafeInteger(archived.revision));
  assert.equal(archived.deletionEnabled, false);
  assert.equal(archived.retained, true);
  assert.ok(Array.isArray(archived.archive.months));
  assert.equal(archived.archive.months.length, 1);
  assert.equal(archived.archive.months[0].month, "2026-11");
  assert.equal(archived.archive.lastRun.throughDate, "2026-11-18");
  assert.equal(archived.archive.lastRun.deletionEnabled, false);

  const archivedReplay = await suite.call(admin, "roster", "/operations", {
    operation: "archiveColdOutput",
    operationId: archiveOpId,
    throughDate: "2026-11-18",
  });
  assert.equal(archivedReplay.receipt.operationId, archiveOpId);

  // Authoritative D1 rows untouched after archiveColdOutput!
  const remainingLedger = await db
    .prepare("SELECT COUNT(*) AS c FROM roster_ledger WHERE school_id=?")
    .bind(schoolId)
    .first();
  assert.equal(remainingLedger.c, 1);

  // Non-admin denied archiveColdOutput.
  const deniedArchiveWrite = await suite.request(teacher, "roster", "/operations", {
    method: "POST",
    body: { operation: "archiveColdOutput", operationId: crypto.randomUUID() },
  });
  assert.ok([403, 503].includes(deniedArchiveWrite.status));

  // 6. /edge/archive: verify all 4 read-only views (history, calculations, statistics, openingBalances).
  const hist = await suite.call(admin, "roster", "/edge/archive", {
    view: "history",
    offset: 0,
    limit: 30,
  });
  assert.equal(hist.archive.readOnly, true);
  assert.equal(hist.archive.throughDate, "2026-11-18");
  assert.equal(hist.history.length, 1);
  assert.equal(hist.history[0].assignment.className, "5A");
  assert.equal(hist.nextOffset, null);

  const calc = await suite.call(admin, "roster", "/edge/archive", {
    view: "calculations",
  });
  assert.equal(calc.archive.readOnly, true);
  assert.equal(calc.completion.completed, 4); // 3 opening + 1 ledger
  assert.equal(calc.completion.entitlement, 5);
  assert.equal(calc.completion.percentage, 80);
  assert.equal(calc.completion.historyVerified, true);

  const stats = await suite.call(admin, "roster", "/edge/archive", {
    view: "statistics",
    from: "2026-11-01",
    to: "2026-11-18",
  });
  assert.equal(stats.archive.readOnly, true);
  assert.equal(stats.schema, 1);
  assert.ok(Array.isArray(stats.absenceRows));
  assert.ok(Array.isArray(stats.activityRows));
  assert.ok(Array.isArray(stats.coverage));

  const openings = await suite.call(admin, "roster", "/edge/archive", {
    view: "openingBalances",
    asOfDate: "2026-11-18",
  });
  assert.equal(openings.archive.readOnly, true);
  assert.equal(openings.rows.length, 1);
  assert.equal(openings.rows[0].openingCharge, 3);
  assert.equal(openings.rows[0].recordedCharge, 1);

  // Teacher with roster.own denied openingBalances and statistics; bad view rejected 400.
  const teacherOpenings = await suite.request(teacher, "roster", "/edge/archive", {
    method: "POST",
    body: { view: "openingBalances" },
  });
  assert.ok([403, 503].includes(teacherOpenings.status));

  const badView = await suite.request(admin, "roster", "/edge/archive", {
    method: "POST",
    body: { view: "nonexistent" },
  });
  assert.equal(badView.status, 400);

  console.log(
    "PASS v1 Roster /backup-ledger (F09), /edge/archive and archiveColdOutput (F10)",
  );
} finally {
  await suite.close();
}
