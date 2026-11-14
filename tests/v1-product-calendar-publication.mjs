import assert from "node:assert/strict";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import {
  prepareOperation,
  canonical,
  one,
  digest,
} from "../v1/runtime/store.mjs";
import { handle } from "../v1/services/calendar/service.mjs";
const runtime = await createDatabase("calendar"),
  school = "school",
  now = Date.now(),
  principal = {
    schoolId: school,
    actorId: "admin",
    staffId: "person",
    capabilities: ["calendar.admin"],
    decisionId: "decision",
    validUntil: now + 3600000,
  };
const env = () => ({
    DB: runtime.db,
    ARTIFACTS: runtime.bucket,
    SCHOOL_ID: school,
    SERVICE_NAME: "calendar",
  }),
  context = (action, payload) => ({
    env: env(),
    principal,
    now: Date.now(),
    method: "POST",
    path: "/action",
    body: { action, payload },
    request: new Request("https://test/calendar"),
  });
try {
  await runtime.db
    .prepare("INSERT INTO calendar_years VALUES(?,?,?,?,?,?)")
    .bind(
      school,
      2027,
      1,
      0,
      "ACTIVE",
      canonical({ Year: 2027, Status: "ACTIVE", ReleasedToTeachers: "No" }),
    )
    .run();
  const description = "Synthetic school event. ".repeat(300);
  await runtime.db.batch(
    Array.from({ length: 300 }, (_, i) =>
      runtime.db
        .prepare("INSERT INTO calendar_events VALUES(?,?,?,?,?,?,?,?,?)")
        .bind(
          school,
          "event-" + i,
          2027,
          1,
          "HIDDEN",
          "2027-01-05",
          "2027-01-05",
          null,
          canonical({
            EventID: "event-" + i,
            Year: 2027,
            StaffTitle: "Event " + i,
            StaffDescription: description,
            Status: "HIDDEN",
            StartDate: "2027-01-05",
            EndDate: "2027-01-05",
            EventType: "ALL_DAY",
            LaneID: "day",
          }),
        ),
    ),
  );
  const payload = { year: 2027, operationId: "publish-large" },
    ctx = context("publishVersion", payload),
    op = await prepareOperation(runtime.db, {
      schoolId: school,
      actorId: principal.actorId,
      operationId: payload.operationId,
      action: "calendar.publishVersion",
      intent: { action: "publishVersion", payload },
      now: ctx.now,
      validUntil: principal.validUntil,
      authorization: principal,
    });
  await syntheticAdmission(runtime.db, op, {
    decisionId: principal.decisionId,
  });
  const result = await handle(ctx),
    row = await one(
      runtime.db,
      "SELECT * FROM calendar_publications WHERE publication_id=?",
      [result.publicationId],
    ),
    metadata = JSON.parse(row.data_json);
  assert.ok(metadata.artifactKey);
  assert.equal(metadata.eventCount, 300);
  assert.ok(row.data_json.length < 2000);
  await runtime.restart();
  const snapshot = await handle(
    context("publication", { publicationId: result.publicationId }),
  );
  assert.equal(snapshot.events.length, 300);
  assert.equal(snapshot.events[0].StaffDescription, description);
  assert.equal(await digest(snapshot), row.digest);
  await runtime.bucket.put(
    metadata.artifactKey,
    canonical({ ...snapshot, events: [] }),
  );
  await assert.rejects(
    handle(context("publication", { publicationId: result.publicationId })),
    (e) => e.code === "PUBLICATION_CHANGED",
  );
  console.log(
    "PASS Calendar large publication: 300 long-description events use verified immutable R2 artifact, compact D1 manifest, restart recovery, tamper rejection",
  );
} finally {
  await runtime.close();
}
