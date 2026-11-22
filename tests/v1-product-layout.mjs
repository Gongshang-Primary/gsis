import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { handle, internal } from "../v1/services/layout/service.mjs";
import { one, query } from "../v1/runtime/store.mjs";
const h = await createDatabase("layout"),
  school = "synthetic-school",
  now = Date.now(),
  validUntil = now + 3600000;
const core = {
  async fetch(request) {
    const input = await request.json();
    return Response.json({
      ok: true,
      data: new URL(request.url).pathname.endsWith("/release")
        ? { state: "released" }
        : {
            pinId: input.pinId,
            owner: "core",
            scope: input.scope,
            revision: input.revision,
            validUntil,
          },
    });
  },
};
const principal = {
  schoolId: school,
  actorId: "actor-1",
  staffId: "staff-1",
  sessionId: "session-1",
  decisionId: "decision-1",
  validUntil,
  impersonating: false,
  capabilities: ["layout.read", "layout.edit"],
  dependencies: [{ owner: "core", scope: "account:actor-1", revision: 1 }],
  action: "layout.edit",
  requestDigest: "synthetic",
};
let count = 0;
function ctx(path, body = {}, method = "POST", p = principal, extras = {}) {
  return {
    env: {
      DB: h.db,
      ARTIFACTS: h.bucket,
      CORE: core,
      SERVICE_NAME: "layout",
      GSIS_SECRET: "synthetic-test-only",
      SCHOOL_ID: school,
      ...extras,
    },
    path,
    method,
    body,
    principal: p,
    now: Date.now(),
    request: new Request("https://example.test" + path, {
      method,
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    }),
  };
}
function call(path, body = {}, method = "POST", p = principal, extras = {}) {
  return handle(
    ctx(
      path,
      method === "POST"
        ? { operationId: "layout-op-" + ++count, ...body }
        : body,
      method,
      p,
      extras,
    ),
  );
}
const source = {
  schemaVersion: 1,
  repository: "layout-current",
  year: 2026,
  revision: "source-1",
  state: "source-import",
  sourceDeployVersion: null,
  sources: [],
  issues: [],
  venues: [
    {
      id: "room-a",
      unitNumber: "A1-01",
      geometryUnit: "A1-01",
      name: "Classroom",
      shortName: "1A",
      block: "A",
      floor: 1,
      capacity: 40,
      active: "Y",
    },
  ],
  classes: [
    {
      id: "class-a",
      code: "1A",
      name: "1A",
      shortName: "A",
      level: 1,
      active: "Y",
    },
  ],
  groups: [
    {
      id: "tg-a",
      code: "MTL1",
      level: 1,
      levels: [1],
      subject: "MTL",
      teacherLabels: "Synthetic Teacher",
      pupilCount: 12,
      pupilCountText: "",
      programmes: "Initial",
      notes: "",
      active: "Y",
    },
  ],
  allocations: [
    {
      id: "alloc-a",
      kind: "teaching_group",
      targetId: "tg-a",
      targetLabel: "MTL1",
      unitNumber: "A1-01",
      active: "Y",
    },
  ],
  pupilBreakdown: [],
};
try {
  const init = await call("/snapshot/import", {
    year: 2026,
    revision: 0,
    snapshot: source,
  });
  assert.equal(init.revision, 1);
  const publicView = await call("/public/campus?year=2026", {}, "GET", null);
  assert.equal(publicView.repository, "layout-current");
  assert.equal(publicView.schemaVersion, 2);
  assert.equal(publicView.venues[0].allocations.length, 1);
  assert.equal(publicView.groups[0].pupilCount, 12);
  const wrongYear = await call("/snapshot/import", {
    year: 2027,
    revision: 0,
    snapshot: source,
  }).catch((e) => e);
  assert.equal(wrongYear.code, "WRONG_YEAR");
  const forbidden = await call("/owned-data", {
    year: 2026,
    revision: 1,
    table: "venues",
    id: "room-a",
    changes: { capacity: 100 },
  }).catch((e) => e);
  assert.equal(forbidden.code, "FIELD_OWNERSHIP");
  const race = await Promise.allSettled([
    call("/owned-data", {
      year: 2026,
      revision: 1,
      table: "groups",
      id: "tg-a",
      changes: { programmes: "Local programme A" },
    }),
    call("/owned-data", {
      year: 2026,
      revision: 1,
      table: "groups",
      id: "tg-a",
      changes: { programmes: "Local programme B" },
    }),
  ]);
  assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    (await one(h.db, "SELECT COUNT(*) AS n FROM layout_snapshots")).n,
    2,
    "losing CAS cannot create published snapshot metadata",
  );
  const edited = await call("/owned-data?year=2026", {}, "GET");
  assert.equal(edited.revision, 2);
  const local = edited.rows.groups[0].programmes;
  const book = await call("/export?year=2026", {}, "GET");
  book.sheets.groups.rows[0][5] = 15;
  const preview = await call("/import-preview", {
    year: 2026,
    revision: 2,
    workbook: book,
  });
  assert.equal(preview.diff.length, 1);
  const applied = await call("/import-apply", {
    year: 2026,
    revision: 2,
    previewId: preview.previewId,
  });
  assert.equal(applied.revision, 3);
  const tampered = structuredClone(book);
  tampered.revision = 3;
  tampered.sheets.venues.rows[0][7] = 999;
  await assert.rejects(
    call("/import-preview", { year: 2026, revision: 3, workbook: tampered }),
    (e) => e.code === "FIELD_OWNERSHIP",
  );
  const wrongSchool = structuredClone(book);
  wrongSchool.schoolId = "foreign";
  wrongSchool.revision = 3;
  await assert.rejects(
    call("/import-preview", { year: 2026, revision: 3, workbook: wrongSchool }),
    (e) => e.code === "WORKBOOK_SCOPE",
  );
  await assert.rejects(
    call(
      "/owned-data",
      {
        year: 2026,
        revision: 3,
        table: "groups",
        id: "tg-a",
        changes: { notes: "hidden" },
      },
      "POST",
      { ...principal, impersonating: true },
    ),
    (e) => e.code === "IMPERSONATION_DENIED",
  );
  const failedBucket = {
    put: async () => {
      throw new Error("synthetic write failure");
    },
    get: h.bucket.get.bind(h.bucket),
  };
  await assert.rejects(
    call(
      "/owned-data",
      {
        year: 2026,
        revision: 3,
        table: "groups",
        id: "tg-a",
        changes: { notes: "must not publish" },
      },
      "POST",
      principal,
      { ARTIFACTS: failedBucket },
    ),
  );
  assert.equal(
    (await one(h.db, "SELECT revision FROM layout_heads")).revision,
    3,
  );
  await h.restart();
  const restored = await call("/snapshot?year=2026", {}, "GET");
  assert.equal(restored.snapshot.groups[0].programmes, local);
  assert.equal(restored.snapshot.groups[0].pupilCount, 15);
  const publication = {
    schoolId: school,
    publicationId: "publication-1",
    sequence: 1,
    workingRevision: 5,
    state: "committed",
    payloadDigest: "a".repeat(64),
    layout: {
      id: "deploy-one",
      name: "2026 planning",
      year: 2026,
      classes: [
        {
          id: "class-a",
          code: "1A",
          level: 1,
          name: "1A",
          shortName: "A",
          venueId: "room-a",
        },
      ],
      venues: [
        {
          id: "room-a",
          unitNumber: "A1-01",
          name: "Classroom",
          block: "A",
          floor: 1,
          capacity: 40,
        },
      ],
      groups: [
        {
          id: "tg-a",
          name: "MTL renamed",
          level: 1,
          levels: [1],
          subject: "MTL",
          venueId: "room-a",
        },
      ],
      teachers: [],
      assignments: [],
    },
  };
  const deploy = {
    async fetch(request) {
      assert.equal(
        new URL(request.url).pathname,
        "/internal/publication/verify",
      );
      const proof = await request.json();
      assert.equal(proof.sourceOperationId, "publish-op");
      return Response.json({ ok: true, data: publication });
    },
  };
  const delivered = await internal({
    ...ctx(
      "/internal/adopt-publication",
      {
        schoolId: school,
        publicationId: "publication-1",
        operationId: "delivery-op",
        sourceOperationId: "publish-op",
        sourceDigest: "b".repeat(64),
        sourceFence: 1,
      },
      "POST",
      principal,
      { DEPLOY: deploy },
    ),
    internal: true,
  });
  assert.equal(delivered.state, "adopted");
  const afterAdopt = await call("/snapshot?year=2026", {}, "GET");
  assert.equal(
    afterAdopt.snapshot.groups.find((g) => g.id === "tg-a").programmes,
    local,
  );
  assert.equal(
    afterAdopt.snapshot.groups.find((g) => g.id === "tg-a").pupilCount,
    15,
  );
  assert.equal(
    afterAdopt.snapshot.groups.find((g) => g.id === "tg-a").code,
    "MTL renamed",
    "permanent identity survives display rename",
  );
  const duplicate = await internal({
    ...ctx(
      "/internal/adopt-publication",
      {
        schoolId: school,
        publicationId: "publication-1",
        operationId: "delivery-op",
        sourceOperationId: "publish-op",
        sourceDigest: "b".repeat(64),
        sourceFence: 1,
      },
      "POST",
      principal,
      { DEPLOY: deploy },
    ),
    internal: true,
  });
  assert.equal(duplicate.revision, delivered.revision);
  const original = await call("/snapshot?year=2026&revision=1", {}, "GET");
  assert.equal(original.snapshot.groups[0].pupilCount, 12);
  assert.equal(original.snapshot.groups[0].programmes, "Initial");
  const foreign = { ...principal, schoolId: "foreign" };
  await assert.rejects(
    call("/snapshot?year=2026", {}, "GET", foreign),
    (e) => e.code === "SNAPSHOT_NOT_INITIALIZED",
  );
  console.log(
    "PASS Layout actual D1/R2: authenticated owned edits, public narrow projection, wrong-year/field/school rejection, conflicting writes, workbook preview/atomic apply, storage failure preserves head, immutable history and restart.",
  );
} finally {
  await h.close();
}
