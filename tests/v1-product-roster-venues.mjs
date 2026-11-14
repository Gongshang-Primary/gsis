import assert from "node:assert/strict";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import {
  handle as roster,
  dispatchRosterJob,
} from "../v1/services/roster/service.mjs";
import {
  handle as venues,
  internal as venuesInternal,
} from "../v1/services/venues/service.mjs";
import {
  canonical,
  prepareOperation,
  query,
  one,
} from "../v1/runtime/store.mjs";
const r = await createDatabase("roster"),
  v = await createDatabase("venues"),
  schoolId = "school";
let stamp = Date.now() + 7 * 86400000;
while (new Date(stamp).getUTCDay() !== 1) stamp += 86400000;
const from = new Date(stamp).toISOString().slice(0, 10),
  to = new Date(stamp + 4 * 86400000).toISOString().slice(0, 10),
  now = Date.parse(from + "T06:00:00+08:00"),
  principal = {
    schoolId,
    actorId: "admin",
    staffId: "staff0",
    decisionId: "decision",
    action: "roster.admin",
    requestDigest: "a".repeat(64),
    validUntil: now + 3600000,
    capabilities: ["admin", "roster.admin"],
  },
  reply = (data) => Response.json({ ok: true, data });
const people = Array.from({ length: 20 }, (_, i) => ({
    staffId: "staff" + i,
    id: "staff" + i,
    name: "Teacher " + i,
    active: true,
    eo: true,
  })),
  env = {
    DB: r.db,
    ARTIFACTS: r.bucket,
    SCHOOL_ID: schoolId,
    GSIS_SECRET: "local-cross-owner-fixture",
    SERVICE_NAME: "roster",
  },
  venv = {
    DB: v.db,
    SCHOOL_ID: schoolId,
    GSIS_SECRET: env.GSIS_SECRET,
    SERVICE_NAME: "venues",
  };
const context = (environment, request, body) => ({
  env: environment,
  request,
  body,
  path: new URL(request.url).pathname,
  method: request.method,
  now,
  clock: () => now,
  principal: null,
});
const core = {
  async fetch(request) {
    const b = await request.json();
    if (new URL(request.url).pathname === "/internal/decision")
      return reply({
        principal,
        descriptor: {
          action: "roster.admin",
          service: "roster",
          operationId: b.operationId,
        },
      });
    return reply({ state: "resolved" });
  },
};
env.CORE = core;
venv.CORE = core;
env.CONTACTS = {
  async fetch() {
    return reply({
      schoolId,
      people,
      revision: "contacts1",
      asOf: now,
      dependencies: [],
    });
  },
};
env.CALENDAR = {
  async fetch(request) {
    const b = await request.json(),
      rows = [];
    for (let t = Date.parse(b.from); t <= Date.parse(b.to); t += 86400000)
      rows.push({
        date: new Date(t).toISOString().slice(0, 10),
        available: true,
        schoolDay: ![0, 6].includes(new Date(t).getUTCDay()),
        parity: "single",
      });
    return reply({ rows, dependencies: [] });
  },
};
env.VENUES = {
  async fetch(request) {
    try {
      return reply(
        await (
          new URL(request.url).pathname.startsWith("/internal/")
            ? venuesInternal
            : venues
        )(context(venv, request, await request.json())),
      );
    } catch (e) {
      return Response.json(
        { ok: false, error: { code: e.code, message: e.message } },
        { status: e.status || 500 },
      );
    }
  },
};
venv.ROSTER = {
  async fetch(request) {
    try {
      return reply(await roster(context(env, request, await request.json())));
    } catch (e) {
      return Response.json(
        { ok: false, error: { code: e.code, message: e.message } },
        { status: e.status || 500 },
      );
    }
  },
};
try {
  for (let i = 0; i < 20; i++)
    await v.db
      .prepare(
        "INSERT INTO venues_records(school_id,kind,record_id,revision,data_json) VALUES(?,'venues',?,1,?)",
      )
      .bind(
        schoolId,
        "room" + i,
        canonical({
          id: "room" + i,
          name: "Room " + i,
          capacity: 30,
          bookable: true,
          revision: 1,
        }),
      )
      .run();
  const model = {
      layoutMode: "single-week",
      maxPeriod: 16,
      timing: {
        startMinutes: 420,
        periodMinutes: 30,
        endOfDayMinutes: 960,
        normalLastPeriod: 16,
      },
      recesses: [],
      single: {
        days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        perDay: 17,
        maxPeriod: 16,
        blocks: people.map((p, i) => ({
          name: p.name,
          cells: Array.from({ length: 85 }, () => [
            "EL",
            "Class " + i,
            "Room " + i,
            "",
          ]),
        })),
      },
    },
    body = {
      operationId: "full-school",
      revision: 0,
      name: "Full-school staged source",
      from,
      to,
      model,
      staffMapping: Object.fromEntries(people.map((p) => [p.name, p.staffId])),
      venueMapping: Object.fromEntries(
        people.map((_, i) => ["Room " + i, "room" + i]),
      ),
    },
    op = await prepareOperation(r.db, {
      schoolId,
      actorId: principal.actorId,
      operationId: body.operationId,
      action: "roster.baseline",
      intent: body,
      now,
      validUntil: principal.validUntil,
      authorization: principal,
    });
  await syntheticAdmission(r.db, op);
  const call = () =>
    roster({
      env,
      request: new Request("https://school.test/upload"),
      body,
      path: "/upload",
      method: "POST",
      now,
      clock: () => now,
      principal,
    });
  let result = await call();
  assert.equal(result.state, "pending");
  assert.equal(
    (await query(r.db, "SELECT * FROM roster_baselines", [])).length,
    0,
  );
  assert.equal(result.totalChunks, 7);
  assert.equal(result.validatedChunks, 4);
  await Promise.all([r.restart(), v.restart()]);
  env.DB = r.db;
  env.ARTIFACTS = r.bucket;
  venv.DB = v.db;
  result = await call();
  assert.equal(result.receipt.state, "committed");
  assert.equal(
    (
      await one(
        v.db,
        "SELECT sealed FROM venues_projection_manifests WHERE source_operation_id=?",
        [body.operationId],
      )
    ).sealed,
    1,
  );
  const complete = await dispatchRosterJob(
    {
      type: "roster-venues-complete",
      school_id: schoolId,
      payload: {
        schoolId,
        decisionId: principal.decisionId,
        sourceDomain: "roster",
        sourceOperationId: body.operationId,
        sourceDigest: op.digest,
        sourceFence: op.fence,
      },
    },
    env,
    now,
  );
  assert.equal(complete.state, "delivered");
  assert.equal(
    (
      await one(
        v.db,
        "SELECT COUNT(*) AS n FROM venues_projection_rows WHERE source_operation_id=?",
        [body.operationId],
      )
    ).n,
    1700,
  );
  assert.equal(
    (
      await one(
        v.db,
        "SELECT state FROM venues_source_fences WHERE source_operation_id=?",
        [body.operationId],
      )
    ).state,
    "adopted",
  );
  assert.equal((await call()).receipt.digest, result.receipt.digest);
  console.log(
    "PASS real Roster/Venues D1-R2 staging validates 1,700 intervals in bounded batches, survives restart, seals before owner commit and adopts once",
  );
} finally {
  await Promise.all([r.close(), v.close()]);
}
