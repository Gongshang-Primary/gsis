import assert from "node:assert/strict";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import {
  prepareOperation,
  one,
  query,
  canonical,
} from "../v1/runtime/store.mjs";
import { handle, scheduled } from "../v1/services/calendar/service.mjs";
const runtime = await createDatabase("calendar"),
  s = "school",
  now = Date.now(),
  principal = {
    schoolId: s,
    actorId: "admin",
    staffId: "person",
    capabilities: ["calendar.admin"],
    decisionId: "decision",
    validUntil: now + 3600000,
  };
let calls = 0;
const external = [
  {
    id: "abcde",
    etag: '"e1"',
    summary: "External event",
    start: { date: "2026-01-02" },
  },
];
const env = () => ({
  DB: runtime.db,
  ARTIFACTS: runtime.bucket,
  SCHOOL_ID: s,
  SERVICE_NAME: "calendar",
  GSIS_SECRET: "synthetic",
  SCHEDULER_OWNER: "v1",
  SEND_OWNER: "v1",
  GOOGLE_ACCESS_TOKEN: "synthetic",
  GOOGLE_STAFF_CALENDAR_ID: "test-calendar",
  CONTACTS: {
    async fetch() {
      return Response.json({
        ok: true,
        data: {
          complete: true,
          revision: "contacts-1",
          staff: [
            {
              staffId: "teacher",
              name: "Teacher",
              active: true,
              birthday: "02-10",
            },
          ],
        },
      });
    },
  },
  CORE: {
    async fetch() {
      return Response.json({ ok: true, data: { allowed: true, principal } });
    },
  },
  PROVIDER_FETCH: async (url, init) => {
    calls++;
    if (init.method === "DELETE") {
      assert.equal(init.headers["if-match"], '"e1"');
      external.splice(0);
      return new Response(null, { status: 204 });
    }
    return Response.json({ items: external });
  },
});
function ctx(action, p) {
  return {
    env: env(),
    principal,
    now: Date.now(),
    path: "/action",
    method: "POST",
    request: new Request("https://test/api"),
    body: { action, payload: p },
  };
}
async function mutate(action, p) {
  p = { ...p, operationId: p.operationId || crypto.randomUUID() };
  const c = ctx(action, p),
    op = await prepareOperation(runtime.db, {
      schoolId: s,
      actorId: principal.actorId,
      operationId: p.operationId,
      action: `calendar.${action}`,
      intent: { action, payload: p },
      now: c.now,
      validUntil: principal.validUntil,
      authorization: principal,
    });
  await syntheticAdmission(runtime.db, op, {
    decisionId: principal.decisionId,
  });
  return handle(c);
}
try {
  await runtime.db.batch([
    runtime.db
      .prepare("INSERT INTO calendar_years VALUES(?,?,?,?,?,?)")
      .bind(
        s,
        2026,
        1,
        1,
        "ACTIVE",
        canonical({ Year: 2026, ReleasedToTeachers: "Yes" }),
      ),
    runtime.db
      .prepare("INSERT INTO calendar_events VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(
        s,
        "local-event",
        2026,
        1,
        "PUBLISHED",
        "2026-01-02",
        "2026-01-02",
        null,
        canonical({
          EventID: "local-event",
          Year: 2026,
          StaffTitle: "Local event",
          StartDate: "2026-01-02",
          EndDate: "2026-01-02",
          EventType: "ALL_DAY",
          Status: "PUBLISHED",
          ParentEnabled: "No",
        }),
      ),
  ]);
  const preview = await handle(
    ctx("calendarWipePreview", { year: 2026, target: "staff" }),
  );
  assert.equal(preview.eventCount, 1);
  await assert.rejects(
    mutate("startCalendarWipe", {
      year: 2026,
      target: "staff",
      previewDigest: "wrong",
      confirm: true,
      confirmationPhrase: preview.confirmationPhrase,
    }),
    (e) => e.code === "PREVIEW_CHANGED",
  );
  const result = await mutate("startCalendarWipe", {
    year: 2026,
    target: "staff",
    previewDigest: preview.digest,
    confirm: true,
    confirmationPhrase: preview.confirmationPhrase,
  });
  assert.equal(result.completed, false);
  assert.equal(
    (await one(runtime.db, "SELECT COUNT(*) AS n FROM calendar_events")).n,
    1,
  );
  await scheduled({ env: env() });
  const status = await handle(
    ctx("calendarWipeBatch", { wipeId: result.wipeId }),
  );
  assert.equal(status.completed, true);
  assert.equal(status.deletedTotal, 1);
  assert.equal(external.length, 0);
  assert.equal(
    (await one(runtime.db, "SELECT deleted_at FROM calendar_events"))
      .deleted_at,
    null,
    "external wipe preserves local records",
  );
  const run = await mutate("startSyncYear", { year: 2026, target: "staff" });
  assert.equal(run.completed, false);
  assert.equal(run.inProgress, true);
  const before = (await query(runtime.db, "SELECT * FROM product_outbox"))
    .length;
  const pending = await handle(
    ctx("syncYearBatch", { syncRunId: run.syncRunId }),
  );
  assert.equal(pending.inProgress, true);
  assert.equal(
    (await query(runtime.db, "SELECT * FROM product_outbox")).length,
    before,
    "status polling does not enqueue another sync",
  );
  await assert.rejects(
    handle({
      ...ctx("calendarWipePreview", { year: 2026 }),
      principal: { ...principal, capabilities: ["calendar.read"] },
    }),
    (e) => e.code === "CAPABILITY_DENIED",
  );
  const jobCount = (await query(runtime.db, "SELECT * FROM product_outbox"))
    .length;
  const birthdays = await mutate("pullBirthdays", { year: 2026 });
  assert.equal(birthdays.created, 1);
  assert.equal(
    (await query(runtime.db, "SELECT * FROM product_outbox")).length,
    jobCount,
    "manual internal birthday reconciliation does not sync Google",
  );
  const archive = await handle(
    ctx("archiveYearsPreview", {
      selections: [{ year: 2026, status: "ACTIVE" }],
    }),
  );
  const archived = await mutate("archiveYearsCommit", {
    selections: archive.selections,
    previewDigest: archive.digest,
    confirm: true,
    confirmationPhrase: archive.confirmationPhrase,
  });
  assert.equal(
    (await one(runtime.db, "SELECT status FROM calendar_years")).status,
    "ARCHIVED",
  );
  assert.equal(
    (await one(runtime.db, "SELECT COUNT(*) AS n FROM calendar_events")).n,
    2,
    "historical records retained",
  );
  assert.ok(
    await runtime.bucket.get(archived.artifactKey),
    "archive verified in private R2",
  );
  console.log(
    "PASS Calendar external: observed exact preview, changed-preview denial, conditional external deletion, local data preserved, durable sync polling without duplicate jobs, non-admin denial, explicit manual birthday review, verified R2 archive",
  );
} finally {
  await runtime.close();
}
