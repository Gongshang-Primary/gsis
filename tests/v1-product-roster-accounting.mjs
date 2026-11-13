import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { handle } from "../v1/services/roster/service.mjs";
import { canonical, one, query } from "../v1/runtime/store.mjs";
import { writeArtifact, loadState } from "../v1/services/roster/repository.mjs";
import { context as rosterContext } from "../v1/services/roster/context.mjs";
import Stapler from "../shared/roster-stapler.js";
// Owner storage tests inject synthetic Core/Contacts/Deploy evidence; actual authorization is tested by the suite.
let completed = 0;
async function scenario(
  name,
  {
    priorCharge = null,
    advanceAdmission = false,
    replaceBaseline = false,
    weeklyRace = false,
    resume = null,
    capScenario = null,
  } = {},
) {
  const h = await createDatabase("roster"),
    schoolId = "synthetic-school";
  let stamp = Date.now() + 14 * 86400000;
  while (new Date(stamp).getUTCDay() !== 4) stamp += 86400000;
  const date = new Date(stamp).toISOString().slice(0, 10),
    priorDate = new Date(Date.parse(date) - 86400000)
      .toISOString()
      .slice(0, 10),
    now = Date.parse(date + "T06:00:00+08:00"),
    validUntil = now + 8 * 3600000;
  let clock = now,
    requestNow = now,
    mutateAdmission = false,
    artifact,
    arrivals = 0,
    releaseAdmissions;
  const admissionBarrier = new Promise((resolve) => {
    releaseAdmissions = resolve;
  });
  const people = [
      {
        staffId: "absent",
        id: "absent",
        name: "Absent Teacher",
        active: true,
        eo: true,
        employment: "Full-time",
        role: "Teacher",
      },
      {
        staffId: "candidate",
        id: "candidate",
        name: "Candidate Teacher",
        active: true,
        eo: true,
        employment:
          capScenario === "ut-missing"
            ? {
                catalogueId: "employment-arrangement",
                revision: "1",
                code: "Full-time",
              }
            : "Full-time",
        employmentTags:
          capScenario === "ut-missing"
            ? [{ catalogueId: "employment-tags", revision: "1", code: "UT" }]
            : [],
        role: "Teacher",
      },
    ],
    reply = (data) => Response.json({ ok: true, data });
  const env = {
    DB: h.db,
    ARTIFACTS: h.bucket,
    SERVICE_NAME: "roster",
    SCHOOL_ID: schoolId,
    GSIS_SECRET: "synthetic-test-only",
    CONTACTS: {
      async fetch() {
        return reply({
          schoolId,
          revision: "contacts",
          asOf: now,
          people,
          dependencies: [],
          smcIds: ["absent"],
        });
      },
    },
    CALENDAR: {
      async fetch(req) {
        const b = await req.json(),
          rows = [];
        for (let t = Date.parse(b.from); t <= Date.parse(b.to); t += 86400000)
          rows.push({
            date: new Date(t).toISOString().slice(0, 10),
            available: !(
              capScenario === "missing" && new Date(t).getUTCDay() === 1
            ),
            schoolDay: ![0, 6].includes(new Date(t).getUTCDay()),
            parity: "single",
          });
        return reply({ rows });
      },
    },
    DEPLOY: {
      async fetch() {
        return reply({
          schoolId,
          publicationId: "verified-plan",
          publicationSequence: 1,
          calculationVersion: "wi/1",
          envelope: {
            schoolId,
            publicationId: "verified-plan",
            publicationSequence: 1,
            calculationVersion: "wi/1",
            rows: people.map((person) => ({
              staffId: person.staffId,
              quality: "verified",
              weeklyBudget: 84,
              Wi: 30,
              factor: 5 / 7,
              cap:
                capScenario === "ut-missing" ||
                (priorCharge === null && !capScenario)
                  ? null
                  : 12,
              actualCapCountedWorkload: 10,
              capBasis: "total",
              capNonTeachingPeriods: {},
            })),
          },
          rows: people.map((p) => ({
            staffId: p.staffId,
            quality: "verified",
            budget: 84,
            weightedWi: 30,
            factor: 5 / 7,
            periodCap:
              capScenario === "ut-missing" ||
              (priorCharge === null && !capScenario)
                ? null
                : 12,
            actualWorkload: 10,
            capBasis: "total",
            capNonTeachingPeriods: {},
          })),
          dependencies: [],
        });
      },
    },
    CORE: {
      async fetch(req) {
        const body = await req.json(),
          path = new URL(req.url).pathname;
        if (path.endsWith("/acquire")) {
          if (weeklyRace && body.operationId.startsWith("allocate")) {
            if (++arrivals === 2) releaseAdmissions();
            await admissionBarrier;
          }
          if (mutateAdmission) {
            mutateAdmission = false;
            if (advanceAdmission)
              clock = Date.parse(date + "T08:00:00+08:00") + 1;
            if (replaceBaseline) {
              await h.db
                .prepare(
                  "INSERT INTO roster_baselines(school_id,baseline_id,revision,name,from_date,to_date,priority,model_key,digest,mapping_json,pruned) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                )
                .bind(
                  schoolId,
                  "new-winner",
                  1,
                  "New winner",
                  priorDate,
                  date,
                  999,
                  artifact.key,
                  artifact.digest,
                  canonical({
                    "Absent Teacher": "absent",
                    "Candidate Teacher": "candidate",
                  }),
                )
                .run();
              await h.db
                .prepare(
                  "INSERT INTO roster_scopes(school_id,scope,revision) VALUES(?,'baselines',1) ON CONFLICT(school_id,scope) DO UPDATE SET revision=revision+1",
                )
                .bind(schoolId)
                .run();
            }
          }
          return reply({
            pinId: body.pinId,
            owner: "core",
            scope: body.scope,
            revision: body.revision,
            validUntil,
          });
        }
        if (path.endsWith("/release")) return reply({ state: "released" });
        return reply({ recorded: true });
      },
    },
  };
  const p = {
    schoolId,
    actorId: "synthetic-admin",
    staffId: "absent",
    email: "admin@example.test",
    sessionId: "synthetic-session",
    decisionId: "synthetic-decision",
    validUntil,
    capabilities: [
      "admin",
      "roster.own",
      "roster.read",
      "roster.write",
      "roster.publish",
      "roster.allocate",
      "roster.admin",
    ],
    dependencies: [
      { owner: "core", scope: "account:synthetic-admin", revision: 1 },
    ],
    action: "roster.allocate",
    requestDigest: "a".repeat(64),
  };
  const call = (body) =>
    handle({
      env,
      principal: p,
      now: requestNow,
      clock: () => clock,
      path: "/operations",
      method: "POST",
      body,
      request: new Request("https://example.test/operations"),
    });
  try {
    const cells = Array.from({ length: 85 }, () => ["", "", "", ""]);
    const candidateCells = Array.from({ length: 85 }, () => ["", "", "", ""]);
    for (let d = 0; d < 5; d++)
      for (const p of [4, 5]) candidateCells[d * 17 + p] = ["EL", "4B", "", ""];
    cells[3 * 17 + 2] = ["EL", "4A", "", ""];
    cells[4 * 17 + 2] = ["EL", "4A", "", ""];
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
          cells: p.id === "absent" ? cells : candidateCells,
        })),
        perDay: 17,
        maxPeriod: 16,
      },
      maxPeriod: 16,
      recesses: [],
    };
    artifact = await writeArtifact(h.bucket, schoolId, "baselines", model);
    await h.db
      .prepare(
        "INSERT INTO roster_baselines(school_id,baseline_id,revision,name,from_date,to_date,priority,model_key,digest,mapping_json,pruned) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
      )
      .bind(
        schoolId,
        "original",
        1,
        "Original",
        new Date(Date.parse(date) - 7 * 86400000).toISOString().slice(0, 10),
        new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10),
        1,
        artifact.key,
        artifact.digest,
        canonical({
          "Absent Teacher": "absent",
          "Candidate Teacher": "candidate",
        }),
      )
      .run();
    if (capScenario === "stapler") {
      const monday = new Date(Date.parse(date) - 3 * 86400000)
        .toISOString()
        .slice(0, 10);
      const changed = structuredClone(candidateCells.slice(0, 17));
      for (const p of [6, 7, 8]) changed[p] = ["EL", "4B", "", ""];
      const day = {
        id: "original",
        date: monday,
        verified: true,
        schoolDay: true,
        parity: "single",
        endOfDayMinutes: 960,
        recesses: [],
        periods: Array.from({ length: 17 }, (_, period) => ({
          period,
          startMinutes: 420 + period * 30,
          endMinutes: 450 + period * 30,
        })),
        teachers: people.map((person) => ({
          staffId: person.staffId,
          name: person.name,
          cells: person.staffId === "candidate" ? changed : cells.slice(0, 17),
        })),
      };
      const plan = Stapler.create(day);
      const record = {
        id: plan.id,
        date: monday,
        revision: 1,
        confirmedPlan: plan,
        confirmedRevision: 1,
        confirmedAt: new Date(now - 86400000).toISOString(),
        confirmedBy: "synthetic-admin",
      };
      await h.db
        .prepare(
          "INSERT INTO roster_records(school_id,collection,record_id,service_date,revision,payload_json) VALUES(?,'staplerPlans',?,?,1,?)",
        )
        .bind(
          schoolId,
          record.id,
          monday,
          canonical({ kind: "array", data: record }),
        )
        .run();
    }
    await call({
      operation: "saveAbsence",
      operationId: "absence",
      date,
      revision: 0,
      staffId: "absent",
      typeId: "mc",
      periods: [2],
    });
    if (priorCharge !== null)
      for (let i = 0; i < 2; i++)
        await h.db
          .prepare(
            "INSERT INTO roster_ledger(school_id,duty_id,correction_revision,staff_id,service_date,period,period_count,charge,completion_basis,assignment_json,actor_id,reason,operation_id,recorded_at) VALUES(?,?,0,?,?,?,1,?,?,?,?,?,?,?)",
          )
          .bind(
            schoolId,
            "prior-" + i,
            "candidate",
            priorDate,
            i,
            priorCharge,
            "assumed-after-end",
            canonical({
              dutyId: "prior-" + i,
              staffId: "candidate",
              date: priorDate,
              period: i,
              additionalOccupied: 1,
              charge: priorCharge,
            }),
            "synthetic-admin",
            "Synthetic prior weekday evidence",
            "prior-" + i,
            now - 86400000,
          )
          .run();

    if (priorCharge === 0 || capScenario === "ut-missing") {
      const absence = await one(
        h.db,
        "SELECT record_id FROM roster_records WHERE collection='absences' AND service_date=?",
        [date],
      );
      const manual = await call({
        operation: "candidates",
        date,
        demandIds: [absence.record_id + ":2"],
      });
      const candidate = manual.candidates.find(
        (person) => person.staffId === "candidate",
      );
      assert.equal(
        candidate.capViolation,
        true,
        "Manual candidate view counts prior zero-charge physical occupancy.",
      );
      assert.equal(candidate.autoEligible, false);
      assert.ok(
        candidate.warnings.includes(
          capScenario === "ut-missing"
            ? "Weekly employment cap cannot be verified."
            : "Weekly employment cap would be exceeded.",
        ),
        "The retained explicit SMC override policy must still display the cap warning.",
      );
      const peer = await call({
        operation: "candidates",
        date,
        demandIds: [absence.record_id + ":2"],
        purpose: "mutual",
      });
      assert.equal(
        peer.candidates.find((person) => person.staffId === "candidate")
          .available,
        false,
        "Peer candidates cannot bypass the same weekly employment cap.",
      );
      if (priorCharge === 0) {
        const historical = {
          id: "aggregate-history",
          staffId: "candidate",
          date: priorDate,
          period: null,
          status: "completed",
          origin: "imported",
          rCost: 5,
        };
        await h.db
          .prepare(
            "INSERT INTO roster_records(school_id,collection,record_id,service_date,revision,payload_json) VALUES(?,'importedRelief','aggregate-history',?,1,?)",
          )
          .bind(
            schoolId,
            priorDate,
            canonical({ kind: "array", data: historical }),
          )
          .run();
        const range = { from: date, to: date, dates: [date] },
          loaded = await loadState(h.db, schoolId, range),
          c = await rosterContext(
            { env, principal: p, now, body: { operation: "candidates" } },
            loaded,
            range,
            {
              needsQuota: true,
            },
          );
        const accounting = c.days[date].teachers.find(
          (person) => person.staffId === "candidate",
        ).capAccounting;
        assert.equal(
          accounting.derivedPhysicalDelta,
          2,
          "Aggregate imported R has no physical slot and cannot cancel two proven zero-charge occupied periods.",
        );
        assert.equal(
          accounting.charged,
          5,
          "Historical R spending remains distinct from the physical cap adjustment.",
        );
        const afterHistory = await call({
          operation: "candidates",
          date,
          demandIds: [absence.record_id + ":2"],
        });
        assert.equal(
          afterHistory.candidates.find(
            (person) => person.staffId === "candidate",
          ).capViolation,
          true,
        );
        await h.db
          .prepare(
            "DELETE FROM roster_records WHERE school_id=? AND collection='importedRelief' AND record_id='aggregate-history'",
          )
          .bind(schoolId)
          .run();
      }
    }

    if (weeklyRace) {
      const friday = new Date(Date.parse(date) + 86400000)
          .toISOString()
          .slice(0, 10),
        week = new Date(Date.parse(date) - 3 * 86400000)
          .toISOString()
          .slice(0, 10);
      await call({
        operation: "saveAbsence",
        operationId: "absence-friday",
        date: friday,
        revision: 0,
        staffId: "absent",
        typeId: "mc",
        periods: [2],
      });
      for (const person of people)
        await h.db
          .prepare(
            "INSERT INTO roster_weekly(school_id,staff_id,week,publication_id,publication_sequence,calculation_version,quota,captured_at,evidence_json) VALUES(?,?,?,?,?,?,1,?,?)",
          )
          .bind(
            schoolId,
            person.staffId,
            week,
            "verified-plan",
            1,
            "wi/1",
            now,
            "{}",
          )
          .run();
      const outcomes = await Promise.allSettled([
        call({
          operation: "autoAllocate",
          operationId: "allocate-thursday",
          date,
          revision: 1,
          mode: "auto",
        }),
        call({
          operation: "autoAllocate",
          operationId: "allocate-friday",
          date: friday,
          revision: 1,
          mode: "auto",
        }),
      ]);
      assert.equal(
        outcomes.filter((r) => r.status === "fulfilled").length,
        1,
        "Only one weekday may spend the last weekly slot",
      );
      assert.equal(
        outcomes.filter(
          (r) => r.status === "rejected" && r.reason.status === 409,
        ).length,
        1,
      );
      assert.equal(
        (
          await query(
            h.db,
            "SELECT * FROM roster_records WHERE collection='assignments'",
          )
        ).length,
        1,
      );
      completed++;
      console.log("PASS " + name);
      return;
    }

    if (resume) {
      const body = {
        operation: "autoAllocate",
        operationId: "allocate",
        date,
        revision: 1,
        mode: "auto",
      };
      let loseOnce = true;
      env.DB = {
        prepare(sql) {
          const native = h.db.prepare(sql);
          if (sql.startsWith("INSERT OR IGNORE INTO roster_runs") && loseOnce)
            return {
              bind(...args) {
                const bound = native.bind(...args);
                return {
                  async run() {
                    await bound.run();
                    loseOnce = false;
                    throw new Error(
                      "Synthetic lost response after durable run snapshot",
                    );
                  },
                };
              },
            };
          return native;
        },
        batch: h.db.batch.bind(h.db),
      };
      await assert.rejects(call(body), /Synthetic lost response/);
      env.DB = h.db;
      const saved = await one(
          h.db,
          "SELECT snapshot_json FROM roster_runs WHERE run_id='allocate'",
        ),
        original = JSON.parse(saved.snapshot_json);
      assert.equal(
        (
          await one(
            h.db,
            "SELECT state FROM product_operations WHERE operation_id='allocate'",
          )
        ).state,
        "prepared",
      );
      clock = now + 1000;
      requestNow = clock;
      if (resume === "changed") people[1].active = false;
      if (resume === "changed") {
        await assert.rejects(
          call(body),
          (e) => e.code === "ALLOCATION_INPUT_CHANGED",
        );
        assert.equal(
          (
            await query(
              h.db,
              "SELECT * FROM roster_records WHERE collection='assignments'",
            )
          ).length,
          0,
        );
      } else {
        const result = await call(body);
        assert.equal(result.assigned, 1);
        const record = await one(
          h.db,
          "SELECT snapshot_json,proposal_json FROM roster_runs WHERE run_id='allocate'",
        );
        assert.equal(
          JSON.parse(record.snapshot_json).observedAt,
          original.observedAt,
        );
        assert.equal(
          JSON.parse(record.proposal_json).inputDigest,
          original.inputDigest,
        );
      }
      completed++;
      console.log("PASS " + name);
      return;
    }
    mutateAdmission = advanceAdmission || replaceBaseline;
    const promise = call({
      operation: "autoAllocate",
      operationId: "allocate",
      date,
      revision: 1,
      mode: "auto",
    });
    if (advanceAdmission || replaceBaseline) {
      await assert.rejects(promise, (e) => e.status === 409);
      assert.equal(
        (
          await query(
            h.db,
            "SELECT * FROM roster_records WHERE collection='assignments'",
          )
        ).length,
        0,
        "No stale proposal commits",
      );
      assert.equal(
        (
          await one(
            h.db,
            "SELECT state FROM product_operations WHERE operation_id='allocate'",
          )
        ).state,
        "aborted",
      );
    } else {
      const result = await promise;
      assert.equal(
        result.assigned,
        0,
        "Prior weekday occupancy exhausts employment cap despite positive R",
      );
      assert.equal(result.unresolved.length, 1);
      const run = await one(
          h.db,
          "SELECT snapshot_json FROM roster_runs WHERE run_id='allocate'",
        ),
        snapshot = JSON.parse(run.snapshot_json),
        candidate = snapshot.staff.find((s) => s.staffId === "candidate");
      assert.equal(
        candidate.actualWeeklyOccupied,
        capScenario === "stapler"
          ? 13
          : ["missing", "ut-missing"].includes(capScenario)
            ? null
            : 12,
      );
      if (capScenario === "ut-missing") {
        assert.equal(candidate.employmentCapRequired, true);
        assert.ok(
          candidate.weekly.remaining > 0,
          "Positive verified R cannot substitute for missing employment-cap evidence.",
        );
      }
    }
    completed++;
    console.log("PASS " + name);
  } finally {
    await h.close();
  }
}
await scenario(
  "prior-weekday completed duties consume actual weekly employment headroom",
  { priorCharge: 1 },
);
await scenario(
  "zero-charge completed cover still consumes actual occupied periods",
  { priorCharge: 0 },
);
await scenario(
  "period starting during authority admission rejects proposal at the final D1 guard",
  { advanceAdmission: true },
);
await scenario(
  "new overlapping baseline winner invalidates an already computed proposal",
  { replaceBaseline: true },
);
await scenario(
  "concurrent weekdays cannot both spend the final frozen weekly slot",
  { weeklyRace: true },
);
await scenario(
  "prepared run resumes after lost snapshot response with unchanged facts and original observation identity",
  { resume: "unchanged" },
);
await scenario(
  "prepared run rejects changed staff facts instead of replacing its durable snapshot",
  { resume: "changed" },
);
await scenario(
  "confirmed weekday Stapler replaces immutable Deploy workload when checking the live employment cap",
  { capScenario: "stapler" },
);
await scenario(
  "missing weekday Calendar evidence makes the weekly cap unverified and prevents automatic allocation",
  { capScenario: "missing" },
);
await scenario(
  "canonical UT employment tag requires cap evidence despite an ordinary employment-arrangement reference and positive R",
  { capScenario: "ut-missing" },
);
console.log(`${completed} Roster accounting and source-race groups passed`);
