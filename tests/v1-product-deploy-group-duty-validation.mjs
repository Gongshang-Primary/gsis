// Real built Worker/D1 regression test for Deploy within-group duplicates,
// Dept TL (ST/LT/MTT) eligibility, and same-weekday Duty interval overlap validation.
import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";
import { loadVersion } from "../v1/services/deploy/service.mjs";
import { canonical } from "../v1/runtime/store.mjs";

const suite = await productSuite();
const school = "synthetic-school";
const clientId = "synthetic-group-duty-client";
let serial = 0;
const op = (label) => `synthetic-group-duty-${label}-${++serial}`;

try {
  const admin = await suite.seedAccount("synthetic-group-duty-admin");
  const additions = [
    { id: "row-ordinary", values: { "Basic Name": "Synthetic Ordinary", "Statutory Name": "Synthetic Ordinary", Role: "Teacher", "EO Appt Level": "EO", "School Section": "Primary", Active: "Y" } },
    { id: "row-sh", values: { "Basic Name": "Synthetic SH", "Statutory Name": "Synthetic SH", Role: "SH", "EO Appt Level": "SH", "School Section": "Primary", Active: "Y" } },
    { id: "row-st", values: { "Basic Name": "Synthetic ST", "Statutory Name": "Synthetic ST", Role: "Teacher", "EO Appt Level": "ST", "School Section": "Primary", Active: "Y" } },
    { id: "row-lt", values: { "Basic Name": "Synthetic LT", "Statutory Name": "Synthetic LT", Role: "Teacher", "EO Appt Level": "LT", "School Section": "Primary", Active: "Y" } },
    { id: "row-mtt", values: { "Basic Name": "Synthetic MTT", "Statutory Name": "Synthetic MTT", Role: "Teacher", "EO Appt Level": "MTT", "School Section": "Primary", Active: "Y" } },
    { id: "row-peer", values: { "Basic Name": "Synthetic Peer", "Statutory Name": "Synthetic Peer", Role: "Teacher", "EO Appt Level": "EO", "School Section": "Primary", Active: "Y" } },
  ];
  const created = await suite.call(admin, "contacts", "/save-data", {
    operationId: op("contacts"),
    changes: [],
    additions,
  });
  const ids = {
    ordinary: created.mapping["row-ordinary"],
    sh: created.mapping["row-sh"],
    st: created.mapping["row-st"],
    lt: created.mapping["row-lt"],
    mtt: created.mapping["row-mtt"],
    peer: created.mapping["row-peer"],
  };

  const { versionId } = await suite.call(admin, "deploy", "/versions/create", {
    operationId: op("create"),
    name: "Synthetic group duty validation",
    year: 2026,
  });
  const db = await suite.db("deploy");
  const stored = async () => (await loadVersion(db, school, versionId)).doc;
  const fixtureRow = async (scope, id, value) =>
    db
      .prepare(
        "INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,?,?,1,?) ON CONFLICT(school_id,version_id,scope,row_id) DO UPDATE SET value=excluded.value",
      )
      .bind(school, versionId, scope, id, canonical(value))
      .run();
  const lease = async () => {
    const grant = await suite.call(admin, "deploy", "/lease", {
      operationId: op("lease"),
      versionId,
      scope: "meta",
      clientId,
    });
    return { versionId, scope: "meta", clientId, leaseFence: grant.fence };
  };
  const save = async (edits) =>
    suite.call(admin, "deploy", "/change", {
      ...(await lease()),
      operationId: op("save"),
      edits,
    });
  const reject = async (edits, expectedCode) => {
    const res = await suite.request(admin, "deploy", "/change", {
      method: "POST",
      body: { ...(await lease()), operationId: op("reject"), edits },
    });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body?.error?.code, expectedCode, JSON.stringify(res.body));
    return res;
  };

  // 1. Within-group duplicate teacher checks across slots, additionalDeputies, tls, legacyLeadership.
  await reject(
    [
      {
        operation: "setOrganisation",
        kind: "dept",
        expected: (await stored()).organisations.dept,
        value: [
          {
            id: "dept-dup-slots",
            name: "Synthetic Dup Slots",
            slots: [ids.ordinary, ids.ordinary],
          },
        ],
      },
    ],
    "DUPLICATE_GROUP_MEMBER",
  );
  await reject(
    [
      {
        operation: "setOrganisation",
        kind: "dept",
        expected: (await stored()).organisations.dept,
        value: [
          {
            id: "dept-dup-deputy",
            name: "Synthetic Dup Deputy",
            slots: [ids.ordinary, ""],
            additionalDeputies: [ids.ordinary],
          },
        ],
      },
    ],
    "DUPLICATE_GROUP_MEMBER",
  );
  await reject(
    [
      {
        operation: "setOrganisation",
        kind: "dept",
        expected: (await stored()).organisations.dept,
        value: [
          {
            id: "dept-dup-tl",
            name: "Synthetic Dup TL",
            slots: [ids.st, ""],
            tls: [ids.st],
          },
        ],
      },
    ],
    "DUPLICATE_GROUP_MEMBER",
  );
  await reject(
    [
      {
        operation: "setOrganisation",
        kind: "comm",
        expected: (await stored()).organisations.comm,
        value: [
          {
            id: "comm-dup-legacy",
            name: "Synthetic Dup Legacy",
            slots: [ids.ordinary, "", "", ""],
            leadershipSchema: 1,
            legacyLeadership: [{ role: "Head", teacher: ids.ordinary }],
          },
        ],
      },
    ],
    "DUPLICATE_GROUP_MEMBER",
  );

  // Grandfathered pre-existing within-group duplicate remains repairable without blocking unrelated edits.
  const grandfatheredDup = [
    {
      id: "comm-retained-dup",
      name: "Synthetic Retained Dup",
      slots: [ids.ordinary, ids.ordinary, "", ""],
    },
  ];
  await fixtureRow("organisations", "comm", grandfatheredDup);
  await save([
    {
      operation: "setOrganisation",
      kind: "comm",
      expected: (await stored()).organisations.comm,
      value: [{ ...grandfatheredDup[0], name: "Synthetic Retained Dup Renamed" }],
    },
  ]);
  await save([
    {
      operation: "setOrganisation",
      kind: "comm",
      expected: (await stored()).organisations.comm,
      value: [{ ...grandfatheredDup[0], slots: [ids.ordinary, "", "", ""] }],
    },
  ]);

  // 2. Dept TL appointment-level eligibility (ST, LT, MTT allowed; EO/SH rejected; grandfathered retained TL preserved).
  await reject(
    [
      {
        operation: "setOrganisation",
        kind: "dept",
        expected: (await stored()).organisations.dept,
        value: [
          {
            id: "dept-tl-ordinary",
            name: "Synthetic TL Ordinary",
            slots: [ids.peer, ""],
            tls: [ids.ordinary],
          },
        ],
      },
    ],
    "TL_ELIGIBILITY_REQUIRED",
  );
  await reject(
    [
      {
        operation: "setOrganisation",
        kind: "dept",
        expected: (await stored()).organisations.dept,
        value: [
          {
            id: "dept-tl-sh",
            name: "Synthetic TL SH",
            slots: [ids.peer, ""],
            tls: [ids.sh],
          },
        ],
      },
    ],
    "TL_ELIGIBILITY_REQUIRED",
  );
  await save([
    {
      operation: "setOrganisation",
      kind: "dept",
      expected: (await stored()).organisations.dept,
      value: [
        {
          id: "dept-tl-valid",
          name: "Synthetic TL Valid",
          slots: [ids.peer, ""],
          tls: [ids.st, ids.lt, ids.mtt],
        },
      ],
    },
  ]);
  assert.deepEqual(
    (await stored()).organisations.dept[0].tls,
    [ids.st, ids.lt, ids.mtt],
    "ST, LT, and MTT teachers are accepted as Department TLs",
  );

  // Grandfathered non-ST/LT/MTT retained TL stays editable/removable, but cannot be re-added after removal.
  const grandfatheredTl = [
    {
      id: "dept-retained-tl",
      name: "Synthetic Retained TL",
      slots: [ids.peer, ""],
      tls: [ids.ordinary],
    },
  ];
  await fixtureRow("organisations", "dept", grandfatheredTl);
  await save([
    {
      operation: "setOrganisation",
      kind: "dept",
      expected: (await stored()).organisations.dept,
      value: [{ ...grandfatheredTl[0], name: "Synthetic Retained TL Renamed" }],
    },
  ]);
  await save([
    {
      operation: "setOrganisation",
      kind: "dept",
      expected: (await stored()).organisations.dept,
      value: [{ ...grandfatheredTl[0], tls: [] }],
    },
  ]);
  await reject(
    [
      {
        operation: "setOrganisation",
        kind: "dept",
        expected: (await stored()).organisations.dept,
        value: grandfatheredTl,
      },
    ],
    "TL_ELIGIBILITY_REQUIRED",
  );

  // 3. Same-weekday Duty interval overlap validation (adjacent intervals and blanks allowed).
  const dutyA = {
    id: "duty-a",
    name: "Gate A",
    category: "Before School",
    start: "07:00",
    end: "07:30",
    days: [0, 1],
    teachers: { 0: ids.ordinary, 1: "" },
    description: "Morning gate A",
  };
  const dutyAdjacent = {
    id: "duty-adj",
    name: "Gate B",
    category: "Before School",
    start: "07:30",
    end: "08:00",
    days: [0, 1],
    teachers: { 0: ids.ordinary, 1: "" },
    description: "Adjacent morning gate B",
  };
  const dutyOverlap = {
    id: "duty-overlap",
    name: "Canteen",
    category: "Before School",
    start: "07:15",
    end: "07:45",
    days: [0],
    teachers: { 0: ids.ordinary },
    description: "Overlapping canteen duty",
  };
  const dutyDifferentDay = {
    id: "duty-diff-day",
    name: "Canteen Tue",
    category: "Before School",
    start: "07:15",
    end: "07:45",
    days: [1],
    teachers: { 1: ids.ordinary },
    description: "Same time on Tuesday",
  };

  // Adjacent intervals + blank slots + different weekday same time all succeed.
  await save([
    {
      operation: "setDuties",
      expected: (await stored()).duties,
      value: [dutyA, dutyAdjacent, dutyDifferentDay],
    },
  ]);
  assert.equal((await stored()).duties.length, 3);

  // Overlapping same-weekday interval for same teacher is rejected with 409 DUTY_OVERLAP_CONFLICT.
  await reject(
    [
      {
        operation: "setDuties",
        expected: (await stored()).duties,
        value: [dutyA, dutyAdjacent, dutyDifferentDay, dutyOverlap],
      },
    ],
    "DUTY_OVERLAP_CONFLICT",
  );

  // Overlapping interval for a DIFFERENT teacher on the same weekday is allowed.
  await save([
    {
      operation: "setDuties",
      expected: (await stored()).duties,
      value: [
        dutyA,
        dutyAdjacent,
        dutyDifferentDay,
        { ...dutyOverlap, teachers: { 0: ids.peer } },
      ],
    },
  ]);
  assert.equal((await stored()).duties.length, 4);

  // Blank duty slots remain publishable (save & publish succeed with empty teacher strings).
  const blankDuty = {
    id: "duty-blank",
    name: "Unassigned Recess",
    category: "Recess",
    start: "09:30",
    end: "10:00",
    days: [0, 1],
    teachers: { 0: "", 1: "" },
    description: "Blank publishable duty",
  };
  await save([
    {
      operation: "setDuties",
      expected: (await stored()).duties,
      value: [dutyA, blankDuty],
    },
  ]);

  // Grandfathered pre-existing duty overlap stays repairable until resolved.
  await fixtureRow("duties", dutyOverlap.id, dutyOverlap);
  await save([
    {
      operation: "setDuties",
      expected: (await stored()).duties,
      value: (await stored()).duties.map((d) =>
        d.id === dutyOverlap.id ? { ...d, name: "Canteen Renamed" } : d,
      ),
    },
  ]);
  await save([
    {
      operation: "setDuties",
      expected: (await stored()).duties,
      value: (await stored()).duties.map((d) =>
        d.id === dutyOverlap.id ? { ...d, teachers: { 0: "" } } : d,
      ),
    },
  ]);

  console.log(
    "PASS v1 Deploy group & duty validation: within-group duplicates, Dept ST/LT/MTT TL eligibility, same-weekday duty interval overlaps, adjacent intervals, blank duties, and grandfathered historical repairability.",
  );
} finally {
  await suite.close();
}
