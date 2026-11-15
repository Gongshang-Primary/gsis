import assert from "node:assert/strict";
import {
  DIRECT_FIELD_DEFINITIONS,
  normalizeDirectValue,
  encodeDirectValue,
  decodeStoredValue,
  resolveLegacyValue,
  directPresentation,
  previewTTb,
} from "../v1/contacts/direct-fields.mjs";
import {
  validateValue,
  record,
  storageValue,
} from "../v1/services/contacts/store.mjs";
import { digest } from "../v1/runtime/store.mjs";
let passed = 0;
async function test(name, fn) {
  await fn();
  console.log("PASS " + name);
  passed++;
}
await test("ordinary labels, empty lists and clear requests need no registry", () => {
  assert.equal(normalizeDirectValue("role", " P "), "P");
  assert.equal(
    normalizeDirectValue("role", "New Community Role"),
    "New Community Role",
  );
  assert.equal(normalizeDirectValue("eoAppointmentLevel", ""), null);
  assert.deepEqual(
    normalizeDirectValue("subjectTags", ["Science", " Art ", "Science"]),
    ["Science", "Art"],
  );
  assert.deepEqual(
    decodeStoredValue("memberships", encodeDirectValue("memberships", [])),
    { value: [], valueSchema: 2 },
  );
  assert.throws(() => encodeDirectValue("role", null));
  for (const field of ["smc", "eo", "schoolLeader"])
    assert.throws(() => encodeDirectValue(field, true));
});
await test("direct field bounds reject objects, delimiter injection and hidden state", () => {
  for (const value of [
    { catalogueId: "roles", revision: "1", code: "P" },
    { schemaVersion: 2, value: "P" },
    "Bad\u0000Role",
    "Guest,UT",
    "Guest;UT",
    "x".repeat(161),
  ])
    assert.throws(() => normalizeDirectValue("role", value));
  assert.throws(() =>
    normalizeDirectValue("employmentTags", Array(33).fill("BT")),
  );
  assert.throws(() => normalizeDirectValue("memberships", "SMC"));
  assert.throws(() =>
    normalizeDirectValue("schoolSection", "MOE Kindergarten"),
  );
  assert.equal(normalizeDirectValue("schoolSection", "MK"), "MK");
  const clientPattern = new RegExp(DIRECT_FIELD_DEFINITIONS.role.pattern);
  assert.equal(clientPattern.test("New Community Role"), true);
  assert.equal(clientPattern.test("Guest,UT"), false);
  assert.equal(clientPattern.test("x".repeat(161)), false);
  assert.throws(() =>
    decodeStoredValue("role", { schemaVersion: 3, value: "P" }),
  );
  assert.throws(() =>
    decodeStoredValue("role", { schemaVersion: 2, value: "P", grant: "admin" }),
  );
  assert.throws(() =>
    decodeStoredValue("eo", { schemaVersion: 2, value: true }),
  );
});
await test("retired pinned codes keep labels and display order without changing semantics", async () => {
  const catalogue = {
    catalogueId: "employment",
    revision: "7",
    kind: "operational-tag",
    entries: [
      {
        code: "UT",
        label: "Untrained Teacher",
        active: false,
        definitionRevision: "def-2",
        category: "employmentTags",
        ttbVisible: true,
        order: 9,
      },
      {
        code: "BT",
        label: "Beginning Teacher",
        active: true,
        definitionRevision: "def-1",
        category: "employmentTags",
        ttbVisible: true,
        order: 1,
      },
    ],
  };
  const definitions = [{ catalogue, digest: await digest(catalogue) }],
    refs = ["UT", "BT"].map((code) => ({
      catalogueId: "employment",
      revision: "7",
      code,
    }));
  const resolved = resolveLegacyValue("employmentTags", refs, {
    sourceFieldRevision: "employmentTags-4",
    sourceRecordDigest: "a".repeat(64),
    definitions,
  });
  assert.deepEqual(resolved.value, ["UT", "BT"]);
  const decoded = {
    state: "accepted",
    ...decodeStoredValue(
      "employmentTags",
      encodeDirectValue("employmentTags", resolved.value, resolved.legacy),
    ),
  };
  const presentation = directPresentation("employmentTags", decoded);
  assert.equal(
    previewTTb(
      { basicName: "Synthetic", employmentTags: decoded.value },
      { employmentTags: presentation },
    ).name,
    "Synthetic (Beginning Teacher) (Untrained Teacher)",
  );
  assert.equal(decoded.legacy.items[0].active, false);
  for (const wrong of [
    [],
    [{ ...definitions[0], catalogue: { ...catalogue, revision: "8" } }],
    [definitions[0], definitions[0]],
  ])
    assert.throws(() =>
      resolveLegacyValue("employmentTags", refs, {
        sourceFieldRevision: "employmentTags-4",
        sourceRecordDigest: "a".repeat(64),
        definitions: wrong,
      }),
    );
  const appended = encodeDirectValue(
    "employmentTags",
    [...resolved.value, "New tag"],
    resolved.legacy,
  );
  assert.equal(
    decodeStoredValue("employmentTags", appended).legacy.items.length,
    2,
  );
  assert.throws(
    () => encodeDirectValue("employmentTags", ["BT", "UT"], resolved.legacy),
    "Reordering requires explicit provenance reindexing",
  );
});
await test("preview and storage keep optional facts separate from explicit authority", () => {
  assert.equal(
    previewTTb({ basicName: "N", employmentTags: ["x".repeat(156)] }).name
      .length,
    160,
  );
  assert.deepEqual(
    previewTTb({ basicName: "N", employmentTags: ["x".repeat(157)] }),
    { available: false, reason: "TTB_NAME_TOO_LONG" },
  );
  assert.equal(
    previewTTb({ basicName: "Fixture", role: "Music", subjectTags: {} })
      .available,
    false,
  );
  assert.deepEqual(
    previewTTb({
      basicName: "Synthetic",
      role: "PE",
      employmentTags: ["BT", "BT"],
      subjectTags: [],
      mkTags: [],
      nameSuffix: "BT",
    }),
    {
      available: true,
      name: "Synthetic (BT) (PE)",
      requiredSubjectTags: ["PE"],
    },
  );
  assert.equal(
    previewTTb({
      basicName: "Synthetic",
      employmentTags: ["Full-time"],
      subjectTags: ["Specialist"],
    }).name,
    "Synthetic",
  );
  assert.equal(
    previewTTb({ basicName: "Synthetic", employmentTags: [{ code: "BT" }] })
      .available,
    false,
  );
  assert.equal(
    previewTTb(
      { basicName: "Synthetic", employmentTags: ["BT"] },
      { employmentTags: { available: false, items: [] } },
    ).available,
    false,
  );
  const row = {
    field: "role",
    revision: 1,
    state: "accepted",
    value_json: JSON.stringify(storageValue("role", "P")),
    valid_from: 0,
    valid_until: null,
    revoked: 0,
  };
  assert.equal(record(row).value, "P");
  assert.equal(record(row).valueSchema, 2);
  for (const field of ["smc", "eo", "schoolLeader"])
    assert.deepEqual(record({ ...row, field, value_json: "false" }), {
      state: "accepted",
      revision: field + "-1",
      value: false,
      validFrom: 0,
      validUntil: null,
      revoked: false,
    });
  for (const value of ["2025-02-29", "02-30", "04-31"])
    assert.throws(() => validateValue("birthday", value));
  for (const value of ["02-29", "2024-02-29", "12-31"])
    validateValue("birthday", value);
  assert.throws(() =>
    validateValue("role", { catalogueId: "role", revision: "1", code: "P" }),
  );
});
console.log(`${passed}/${passed} direct-field groups passed`);
