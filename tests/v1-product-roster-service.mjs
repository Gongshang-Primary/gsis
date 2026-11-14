import assert from "node:assert/strict";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import {
  handle,
  policy,
  scheduled,
  dispatchRosterJob,
  webhook,
} from "../v1/services/roster/service.mjs";
import {
  canonical,
  digest,
  prepareOperation,
  query,
  one,
} from "../v1/runtime/store.mjs";
import { issueLink } from "../v1/services/roster/external.mjs";
import { loadState } from "../v1/services/roster/repository.mjs";
import { writeArtifact } from "../v1/services/roster/repository.mjs";
const h = await createDatabase("roster"),
  schoolId = "school";
let dayStamp = Date.now() + 7 * 86400000;
while ([0, 6].includes(new Date(dayStamp).getUTCDay())) dayStamp += 86400000;
const date = new Date(dayStamp).toISOString().slice(0, 10),
  now = Date.parse(date + "T06:00:00+08:00");
const people = [
  {
    staffId: "alice",
    id: "alice",
    name: "Alice",
    active: true,
    eo: true,
    employment: "Full-time",
    role: "Teacher",
    mobile: "6591234567",
    groups: [],
  },
  {
    staffId: "bob",
    id: "bob",
    name: "Bob",
    active: true,
    eo: true,
    employment: "Full-time",
    role: "Teacher",
    mobile: "6592345678",
    groups: [],
  },
];
let venueSealed = true;
const reply = (data) => Response.json({ ok: true, data });
const env = {
  SERVICE_NAME: "roster",
  SCHOOL_ID: schoolId,
  GSIS_SECRET: "synthetic-suite-secret",
  DB: h.db,
  ARTIFACTS: h.bucket,
  CONTACTS: {
    async fetch(r) {
      const b = await r.json();
      return reply({
        schoolId,
        revision: "contacts1",
        asOf: now,
        people: people.filter(
          (p) => !b.staffIds || b.staffIds.includes(p.staffId),
        ),
        dependencies: [],
        smcIds: ["alice"],
      });
    },
  },
  CALENDAR: {
    async fetch(r) {
      const b = await r.json();
      const rows = [];
      for (let t = Date.parse(b.from); t <= Date.parse(b.to); t += 86400000)
        rows.push({
          date: new Date(t).toISOString().slice(0, 10),
          available: true,
          schoolDay: ![0, 6].includes(new Date(t).getUTCDay()),
          parity: "single",
          revision: "cal1",
        });
      return reply({ rows, revision: "cal1", asOf: now });
    },
  },
  VENUES: {
    async fetch(r) {
      if (new URL(r.url).pathname === "/internal/catalogue")
        return reply({ venues: [{ venueId: "room1", name: "Room 1" }] });
      return reply({
        state: "pending",
        sealed: venueSealed,
        validatedChunks: venueSealed ? 1 : 0,
        totalChunks: 1,
        fenceId: "synthetic-venues-fence",
      });
    },
  },
  CORE: {
    async fetch() {
      return reply({ state: "resolved" });
    },
  },
  DEPLOY: {
    async fetch(r) {
      const b = await r.json();
      return reply({
        schoolId,
        publicationId: b.publicationId || "pub",
        publicationSequence: b.publicationId === "old" ? 1 : 2,
        calculationVersion: "wi/1",
        rows: people.map((p) => ({
          staffId: p.staffId,
          quality: "verified",
          budget: 84,
          weightedWi: 30,
          factor: 5 / 7,
          periodCap: null,
        })),
        dependencies: [],
      });
    },
  },
};
const principal = {
  schoolId,
  actorId: "alice-account",
  staffId: "alice",
  email: "alice@example.test",
  sessionId: "session",
  decisionId: "decision",
  validUntil: now + 600000,
  impersonating: false,
  capabilities: [
    "admin",
    "roster.own",
    "roster.read",
    "roster.write",
    "roster.publish",
    "roster.allocate",
    "roster.admin",
  ],
  requestDigest: "a".repeat(64),
  action: "roster.own",
};
const ctx = (path, body = {}, who = principal) => ({
  env,
  principal: who,
  now,
  clock: () => now,
  body,
  path,
  method: path === "/layers" ? "GET" : "POST",
  request: new Request("https://product.test" + path),
});
let count = 0;
async function test(name, f) {
  await f();
  count++;
  console.log("PASS " + name);
}
async function prepare(body, action) {
  const op = await prepareOperation(env.DB, {
    schoolId,
    actorId: principal.actorId,
    operationId: body.operationId,
    action,
    intent: body,
    now,
    validUntil: principal.validUntil,
    authorization: principal,
  });
  await syntheticAdmission(env.DB, op);
}
try {
  await test("authenticated baseline read and profile preserve frontend contract without Apps Script", async () => {
    const cells = Array.from({ length: 85 }, () => ["", "", "", ""]);
    cells[((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7) * 17 + 2] = [
      "EL",
      "4A",
      "room1",
      "",
    ];
    const model = {
        layoutMode: "single-week",
        timing: {
          startMinutes: 420,
          periodMinutes: 30,
          endOfDayMinutes: 960,
          normalLastPeriod: 16,
        },
        single: {
          days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          blocks: people.map((p) => ({
            name: p.name,
            cells:
              p.id === "alice"
                ? cells
                : Array.from({ length: 85 }, () => ["", "", "", ""]),
          })),
          perDay: 17,
          maxPeriod: 16,
        },
        maxPeriod: 16,
        recesses: [],
      },
      artifact = await writeArtifact(
        env.ARTIFACTS,
        schoolId,
        "baselines",
        model,
      );
    await env.DB.prepare(
      "INSERT INTO roster_baselines(school_id,baseline_id,revision,name,from_date,to_date,priority,model_key,digest,mapping_json,pruned) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        schoolId,
        "baseline",
        1,
        "Baseline",
        new Date(dayStamp - 86400000 * 30).toISOString().slice(0, 10),
        new Date(dayStamp + 86400000 * 30).toISOString().slice(0, 10),
        1,
        artifact.key,
        artifact.digest,
        canonical({ Alice: "alice", Bob: "bob" }),
        0,
      )
      .run();
    const profile = await handle(ctx("/profile", { date: date }));
    assert.equal(profile.user.accessVerified, true);
    assert.equal(profile.active.id, "baseline");
    const read = await handle(ctx("/read", { date: date }));
    assert.equal(read.model.single.blocks.length, 2);
    const cached = await handle(
      ctx("/read", { date: date, knownModelIds: ["baseline"] }),
    );
    assert.equal(cached.modelUnchanged, true);
  });
  await test("service absence command commits once and same-id retry recovers original receipt", async () => {
    const body = {
      operation: "saveAbsence",
      operationId: "absence",
      requestId: "absence",
      date: date,
      revision: 0,
      staffId: "alice",
      typeId: "mc",
      periods: [2],
    };
    await prepare(body, "roster.saveAbsence");
    const a = await handle(ctx("/operations", body)),
      b = await handle(ctx("/operations", body));
    assert.equal(a.receipt.state, "committed");
    assert.equal(b.receipt.digest, a.receipt.digest);
    assert.equal(
      (
        await query(
          env.DB,
          "SELECT * FROM roster_records WHERE collection='absences'",
          [],
        )
      ).length,
      1,
    );
  });
  await test("service denies foreign schools, impersonation and wrong action before any mutation", async () => {
    const body = {
      operation: "saveAbsence",
      operationId: "bad",
      date: date,
      revision: 1,
      staffId: "alice",
      typeId: "mc",
      periods: [2],
    };
    await assert.rejects(
      handle(ctx("/operations", body, { ...principal, schoolId: "foreign" })),
      (e) => e.code === "SCHOOL_MISMATCH",
    );
    await assert.rejects(
      handle(ctx("/operations", body, { ...principal, impersonating: true })),
      (e) => e.code === "IMPERSONATION_DENIED",
    );
    await assert.rejects(
      handle(ctx("/operations", body, { ...principal, capabilities: [] })),
      (e) => e.code === "CAPABILITY_DENIED",
    );
    assert.throws(
      () => policy("POST", "/operations", { operation: "invented" }),
      (e) => e.code === "UNKNOWN_OPERATION",
    );
  });
  await test("layer preview resolves real stored identities and one authoritative set of global rules", async () => {
    const result = await handle(ctx("/layers", { date: date }));
    assert.equal(result.globalsReadOnly, true);
    assert.equal(result.resolvedTeachers.length, 2);
    assert.equal(result.resolvedTeachers[0].layerId, 3);
    assert.deepEqual(result.policy.consecutiveBreakSubjects, [
      { type: "exact", value: "BLK" },
    ]);
  });
  await test("new allocator is integrated through existing autoAllocate command with durable run and weekly provenance", async () => {
    const body = {
      operation: "autoAllocate",
      operationId: "allocate",
      requestId: "allocate",
      date: date,
      revision: 1,
      mode: "auto",
    };
    await prepare(body, "roster.autoAllocate");
    const result = await handle(ctx("/operations", body));
    assert.equal(result.assigned, 1);
    assert.equal(result.engineVersion, "gsis-layered/1");
    const run = await one(env.DB, "SELECT * FROM roster_runs WHERE run_id=?", [
      "allocate",
    ]);
    assert.equal(run.state, "committed");
    const duties = await query(
      env.DB,
      "SELECT payload_json FROM roster_records WHERE collection='assignments'",
      [],
    );
    assert.equal(JSON.parse(duties[0].payload_json).data.staffId, "bob");
    assert.equal(
      (await query(env.DB, "SELECT * FROM roster_weekly", [])).length,
      2,
    );
  });
  await test("published duties persist service identity and private duties capability is source-bound and single-use", async () => {
    const current = await loadState(env.DB, schoolId, { from: date, to: date });
    const body = {
      operation: "publish",
      operationId: "publish",
      date,
      revision: 2,
      allocationRevision: current.state.dayRevisions[date],
    };
    await prepare(body, "roster.publish");
    const result = await handle(ctx("/operations", body));
    assert.equal(result.receipt.state, "committed");
    const duties = await query(env.DB, "SELECT * FROM roster_duties", []);
    assert.equal(duties.length, 1);
    assert.match(duties[0].duty_id, /^duty:/);
    const loaded = await loadState(env.DB, schoolId, { from: date, to: date }),
      job = {
        school_id: schoolId,
        job_id: "external-duty",
        operation_id: "publish",
        payload: {
          kind: "relief_publication",
          recipientId: "bob",
          date,
          data: {
            snapshotIds: loaded.state.publicationSnapshots
              .filter((x) => x.staffId === "bob")
              .map((x) => x.id),
          },
        },
      },
      link = await issueLink(env, job, loaded.state, now);
    assert.equal(link.token.length, 43);
    assert.equal(
      (await issueLink(env, job, loaded.state, now)).token,
      link.token,
    );
    let recipientActive = true;
    env.CORE_EXTERNAL = {
      async authorizeCapability(input) {
        if (!recipientActive)
          throw Object.assign(new Error("Inactive"), {
            code: "RECIPIENT_UNAVAILABLE",
            status: 403,
          });
        const proof = await handle({
            ...ctx("/internal/external-proof", {
              schoolId,
              tokenDigest: input.tokenDigest,
              operationId: input.operationId,
              commandDigest: input.bodyDigest,
            }),
            principal: null,
            request: new Request("https://internal/proof", {
              headers: { "x-gsis-secret": env.GSIS_SECRET },
            }),
          }),
          who = {
            ...principal,
            actorId: "service-roster-external",
            staffId: "bob",
            capabilities: ["roster.own"],
            action: "roster.own",
            requestDigest: input.bodyDigest,
            decisionId: "external-decision",
          };
        assert.equal(proof.staffId, "bob");
        if (proof.write) {
          const row = await one(
              env.DB,
              "SELECT command_json FROM roster_external_commands WHERE operation_id=?",
              [input.operationId],
            ),
            intent = JSON.parse(row.command_json),
            op = await prepareOperation(env.DB, {
              schoolId,
              actorId: who.actorId,
              operationId: input.operationId,
              action: "roster.external",
              intent,
              now,
              validUntil: who.validUntil,
              authorization: who,
            });
          await syntheticAdmission(env.DB, op);
        }
        return who;
      },
    };
    const read = await handle({
      ...ctx("/external"),
      method: "GET",
      request: new Request("https://product.test/external", {
        headers: { "x-gsis-external-token": link.token },
      }),
    });
    assert.equal(read.purpose, "duties");
    const notice = read.projection.timetableNotice;
    assert(notice);
    const command = {
      token: link.token,
      operationId: "external-ack",
      timetableNoticeId: notice.id,
      snapshotIds: notice.snapshotIds || [],
    };
    recipientActive = false;
    await assert.rejects(
      handle(ctx("/external", command)),
      (e) => e.code === "RECIPIENT_UNAVAILABLE",
    );
    recipientActive = true;
    const ack = await handle(ctx("/external", command));
    assert.equal(ack.recorded, true);
    assert.equal(
      (await handle(ctx("/external", command))).receipt.digest,
      ack.receipt.digest,
    );
    await assert.rejects(
      handle(
        ctx("/external", { ...command, operationId: "external-ack-other" }),
      ),
      (e) => e.code === "EXTERNAL_CAPABILITY_CONSUMED",
    );
    await assert.rejects(
      handle(
        ctx("/external", { ...command, token: link.token.slice(0, -1) + "x" }),
      ),
      (e) => e.code === "EXTERNAL_CAPABILITY_INVALID",
    );
  });
  await test("BURROWS artifact is verified and returning offline edits require preview, source revision and lease", async () => {
    const publication = await one(
      env.DB,
      "SELECT * FROM roster_publications WHERE service_date=? ORDER BY sequence DESC LIMIT 1",
      [date],
    );
    const job = {
      school_id: schoolId,
      job_id: "burrows:test",
      type: "roster-burrows",
      payload: { publicationId: publication.publication_id, date },
    };
    assert.equal((await dispatchRosterJob(job, env, now)).state, "delivered");
    const list = await handle(ctx("/exports")),
      row = list.burrows.find((x) => x.id === job.job_id);
    assert(row);
    const response = await handle(ctx("/exports/download", { id: row.id })),
      value = await response.json();
    assert.equal(value.offlineToolAvailable, false);
    assert.match(value.timetableCSV, /Staff ID/);
    assert.equal(
      value.offlineEditContract.basePublicationId,
      publication.publication_id,
    );
    const request = {
        basePublicationId: publication.publication_id,
        commands: [
          {
            type: "addClass",
            class: { id: "offline-group", name: "Offline group", level: 4 },
          },
        ],
      },
      preview = await handle(ctx("/offline/preview", request));
    assert.equal(preview.conflicts.length, 0);
    assert(preview.plan.classes.some((c) => c.id === "offline-group"));
    await assert.rejects(
      handle(
        ctx("/offline/confirm", {
          ...request,
          operationId: "offline-stale",
          previewId: "wrong",
          revision: preview.revision,
          confirm: true,
          fence: 1,
        }),
      ),
      (e) => e.code === "OFFLINE_PREVIEW_STALE",
    );
    const leaseBody = { operationId: "offline-lease", date, action: "acquire" };
    await prepare(leaseBody, "roster.lease");
    const lease = await handle(ctx("/lease", leaseBody)),
      confirm = {
        ...request,
        operationId: "offline-confirm",
        previewId: preview.previewId,
        revision: preview.revision,
        confirm: true,
        fence: lease.fence,
      };
    await prepare(
      {
        operation: "saveStapler",
        operationId: confirm.operationId,
        requestId: confirm.operationId,
        date,
        revision: preview.revision,
        staplerRevision: preview.staplerRevision,
        plan: preview.plan,
        fence: lease.fence,
      },
      "roster.saveStapler",
    );
    assert.equal(
      (await handle(ctx("/offline/confirm", confirm))).receipt.state,
      "committed",
    );
    assert.equal(
      (
        await loadState(env.DB, schoolId, { from: date, to: date })
      ).state.staplerPlans[0].draft.classes.some(
        (c) => c.id === "offline-group",
      ),
      true,
    );
    await assert.rejects(
      handle(ctx("/offline/preview", request)),
      (e) => e.code === "OFFLINE_DRAFT_CHANGED",
    );
  });
  await test("Deploy adoption persists monotonic projection and stale delivery cannot replace newer source", async () => {
    const invoke = async (pub, op) =>
      handle({
        ...ctx("/internal/adopt-publication", {
          schoolId,
          publicationId: pub,
          sourceOperationId: "source-" + pub,
          sourceDigest: "digest-" + pub,
          sourceFence: 1,
          operationId: op,
        }),
        principal: null,
        request: new Request("https://internal/adopt", {
          headers: { "x-gsis-secret": env.GSIS_SECRET },
        }),
      });
    assert.equal((await invoke("new", "adopt-new")).state, "committed");
    assert.equal(
      (await invoke("old", "adopt-old")).result.state,
      "ignored-stale",
    );
    await h.restart();
    env.DB = h.db;
    env.ARTIFACTS = h.bucket;
    assert.equal(
      (
        await one(
          env.DB,
          "SELECT * FROM roster_deploy_adoption WHERE school_id=?",
          [schoolId],
        )
      ).publication_id,
      "new",
    );
  });
  await test("scheduled disabled state is truthful; no fabricated user or provider send", async () => {
    const out = await scheduled({ env, now, clock: () => now });
    assert.equal(out.allocation.state, "disabled");
    assert.equal(out.scheduler.activeSender, false);
  });
  await test("baseline mapping preview and staged venue validation preserve original operation through restart", async () => {
    const refs = await handle(ctx("/reference"));
    assert.equal(refs.venues[0].venueId, "room1");
    const body = {
      operationId: "baseline-map",
      id: "baseline",
      revision: 0,
      name: "Verified baseline",
      from: date,
      to: new Date(Date.parse(date) + 7 * 86400000).toISOString().slice(0, 10),
      staffMapping: { Alice: "alice", Bob: "bob" },
      venueMapping: { room1: "room1" },
    };
    await prepare(body, "roster.baseline");
    venueSealed = false;
    const pending = await handle(ctx("/update", body));
    assert.equal(pending.state, "pending");
    assert.equal(
      (
        await one(
          env.DB,
          "SELECT revision FROM roster_baselines WHERE baseline_id=?",
          ["baseline"],
        )
      ).revision,
      1,
    );
    const chunk = await handle({
      ...ctx("/internal/source-projection-chunk", {
        schoolId,
        operationId: body.operationId,
        index: 0,
      }),
      principal: null,
      request: new Request("https://internal/chunk", {
        headers: { "x-gsis-secret": env.GSIS_SECRET },
      }),
    });
    assert.equal(chunk.rows.length, 1);
    assert.equal(await digest(canonical(chunk.rows)), chunk.chunkDigest);
    await h.restart();
    env.DB = h.db;
    env.ARTIFACTS = h.bucket;
    venueSealed = true;
    const done = await handle(ctx("/update", body));
    assert.equal(done.receipt.state, "committed");
    assert.equal(done.revision, 1);
    assert.equal(
      (
        await one(
          env.DB,
          "SELECT revision FROM roster_baselines WHERE baseline_id=?",
          ["baseline"],
        )
      ).revision,
      2,
    );
  });
  await test("verified webhook event replay is idempotent and delivery status cannot become failed after delivered", async () => {
    const event = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "configured-phone" },
                  messages: [
                    {
                      id: "inbound1",
                      timestamp: String(Math.floor(now / 1000)),
                      from: "6591234567",
                      text: { body: "Help" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      hookEnv = {
        ...env,
        WEBHOOK_OWNER: "v1",
        WHATSAPP_PHONE_NUMBER_ID: "configured-phone",
      };
    const wrongPhone = structuredClone(event);
    wrongPhone.entry[0].changes[0].value.metadata.phone_number_id =
      "other-phone";
    await assert.rejects(
      webhook({ env: hookEnv, body: wrongPhone, provider: "whatsapp", now }),
      (e) => e.code === "WEBHOOK_PHONE_MISMATCH",
    );
    assert.equal(
      (await query(env.DB, "SELECT * FROM roster_provider_events")).length,
      0,
    );
    assert.equal(
      (await webhook({ env: hookEnv, body: event, provider: "whatsapp", now }))
        .accepted,
      1,
    );
    assert.equal(
      (await webhook({ env: hookEnv, body: event, provider: "whatsapp", now }))
        .accepted,
      0,
    );
    const inbox = await one(
      env.DB,
      "SELECT * FROM roster_inbox WHERE message_id=?",
      ["whatsapp:inbound1"],
    );
    assert.equal(inbox.staff_id, null);
    assert.equal(JSON.parse(inbox.payload_json).identityVerified, false);
    await env.DB.prepare(
      "INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,due_at,state,provider_id,updated_at) VALUES(?,?,?,?,?,?,'accepted',?,?)",
    )
      .bind(
        schoolId,
        "status-job",
        "status-op",
        "roster-notification",
        "{}",
        now,
        "provider-msg",
        now,
      )
      .run();
    for (const status of ["delivered", "failed"])
      await webhook({
        env: hookEnv,
        body: {
          entry: [
            {
              changes: [
                {
                  value: {
                    metadata: { phone_number_id: "configured-phone" },
                    statuses: [
                      {
                        id: "provider-msg",
                        timestamp: String(Math.floor(now / 1000)),
                        status,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
        provider: "whatsapp",
        now,
      });
    assert.equal(
      (
        await one(env.DB, "SELECT state FROM product_outbox WHERE job_id=?", [
          "status-job",
        ])
      ).state,
      "delivered",
    );
  });
  await test("verified status fanout retries the original durable event after restart without sending messages", async () => {
    const jobs = await query(
      env.DB,
      "SELECT * FROM product_outbox WHERE type='roster-provider-receipt' ORDER BY job_id",
    );
    assert.equal(jobs.length, 4);
    const job = jobs.find((j) => JSON.parse(j.payload_json).owner === "lord");
    const received = new Map();
    let fail = true,
      calls = 0;
    env.LORD_RECEIPTS = {
      async record(event) {
        calls++;
        assert.equal(event.schoolId, schoolId);
        assert.equal(event.providerId, "provider-msg");
        assert.equal(event.provider, "whatsapp");
        received.set(event.eventId, event);
        if (fail) {
          fail = false;
          throw new Error("lost reply after owner receipt");
        }
        return { recorded: true };
      },
    };
    await env.DB.prepare(
      "UPDATE product_outbox SET state='leased',fence=1,lease_until=? WHERE job_id=?",
    )
      .bind(now + 60000, job.job_id)
      .run();
    const invoke = () =>
      dispatchRosterJob(
        { ...job, fence: 1, payload: JSON.parse(job.payload_json) },
        env,
        now,
      );
    const uncertainReply = await invoke();
    assert.equal(uncertainReply.state, "failed");
    assert.equal(uncertainReply.retryable, true);
    await h.restart();
    env.DB = h.db;
    env.ARTIFACTS = h.bucket;
    assert.equal((await invoke()).state, "delivered");
    assert.equal(calls, 2);
    assert.equal(received.size, 1);
    await env.DB.prepare(
      "UPDATE product_outbox SET state='cancelled' WHERE job_id=?",
    )
      .bind(job.job_id)
      .run();
    await assert.rejects(invoke(), (e) => e.code === "JOB_LEASE_LOST");
    assert.equal(calls, 2);
  });
  await test("dated activation enables an accepted inactive EO only on the selected day without changing Contacts", async () => {
    const bob = people.find((p) => p.id === "bob");
    bob.active = false;
    const revision = (
      await one(
        env.DB,
        "SELECT revision FROM roster_scopes WHERE school_id=? AND scope=?",
        [schoolId, "day:" + date],
      )
    ).revision;
    const body = {
      operation: "saveAdhoc",
      operationId: "dated-inactive-activation",
      requestId: "dated-inactive-activation",
      date,
      revision,
      staffId: "bob",
      periods: [3, 4],
    };
    await prepare(body, "roster.saveAdhoc");
    assert.equal(
      (await handle(ctx("/operations", body))).receipt.state,
      "committed",
    );
    assert.equal(
      bob.active,
      false,
      "Roster activation never changes the accepted Contacts active fact.",
    );
    const same = await handle(
      ctx("/operations", { operation: "directory", date }),
    );
    assert.equal(same.people.find((p) => p.id === "bob").active, true);
    const tomorrow = new Date(Date.parse(date) + 86400000)
      .toISOString()
      .slice(0, 10);
    const later = await handle(
      ctx("/operations", { operation: "directory", date: tomorrow }),
    );
    assert.equal(later.people.find((p) => p.id === "bob").active, false);
    bob.active = true;
  });
  console.log(`${count} Roster service acceptance groups passed`);
} finally {
  await h.close();
}
