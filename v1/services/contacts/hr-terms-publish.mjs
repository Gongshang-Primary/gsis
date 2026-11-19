/* Contacts receiver and reader for Deploy-published HR Terms catalogues (DEP-17-001).
 * Preserves existing out-of-catalogue staff values (15 Nov retain-and-flag rule)
 * and never grants SMC/EO/School Leader authority from catalogue definitions. */
import { ApiError } from "../../runtime/errors.mjs";
import {
  canonical,
  commitOperation,
  digest,
  one,
  prepareOperation,
  query,
} from "../../runtime/store.mjs";
import { serviceCall } from "../../runtime/security.mjs";

const FIXED_FIELDS = new Set(["Day of Birth", "Month of birth", "Active"]);
const FIELD_META = Object.freeze({
  Role: { catalogueId: "hr-terms:role", contactsField: "role", limit: 300 },
  "EO Appt Level": {
    catalogueId: "hr-terms:eo-appt-level",
    contactsField: "eoAppointment",
    limit: 150,
  },
  "Appointment Status": {
    catalogueId: "hr-terms:appointment-status",
    contactsField: "appointmentStatus",
    limit: 150,
  },
  "Employment Modifier": {
    catalogueId: "hr-terms:employment-modifier",
    contactsField: "employmentTags",
    limit: 150,
  },
  "Subject Modifier": {
    catalogueId: "hr-terms:subject-modifier",
    contactsField: "subjectTags",
    limit: 150,
  },
  "MK Modifier": {
    catalogueId: "hr-terms:mk-modifier",
    contactsField: "mkTags",
    limit: 150,
  },
});

function fail(code, message, status = 400) {
  throw new ApiError(code, status, message);
}

function normalizeChoiceList(field, raw, limit) {
  if (!Array.isArray(raw) || raw.length > limit) {
    fail(
      "INVALID_HR_TERMS",
      `HR Terms list for ${field} must contain at most ${limit} items.`,
      400,
    );
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (
      typeof item !== "string" ||
      item.length > 160 ||
      !item.trim() ||
      /[\x00-\x1f\x7f]/.test(item)
    ) {
      fail("INVALID_HR_TERMS", `Invalid choice value for ${field}.`, 400);
    }
    const clean = item.trim();
    if (seen.has(clean)) {
      fail("INVALID_HR_TERMS", `Duplicate choice value for ${field}.`, 400);
    }
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

function extractStaffValues(valueJson) {
  if (!valueJson) return [];
  let parsed;
  try {
    parsed = JSON.parse(valueJson);
  } catch {
    return [];
  }
  const extract = (v) => {
    if (v === null || v === undefined) return [];
    if (typeof v === "string") return v.trim() ? [v.trim()] : [];
    if (Array.isArray(v)) return v.flatMap(extract);
    if (typeof v === "object") {
      if (typeof v.code === "string" && v.code.trim()) return [v.code.trim()];
      if (typeof v.label === "string" && v.label.trim()) return [v.label.trim()];
      if (typeof v.value === "string" && v.value.trim()) return [v.value.trim()];
      if (v.value !== undefined) return extract(v.value);
    }
    return [];
  };
  return extract(parsed);
}

export async function publishHrTermsFromDeploy(ctx) {
  const { env, body = {}, now = Date.now() } = ctx;
  const schoolId = env.SCHOOL_ID;
  if (body.schoolId !== schoolId) {
    fail("SCHOOL_MISMATCH", "Foreign school HR Terms publication.", 403);
  }
  const publicationId = String(body.publicationId || "").trim();
  const sourceOperationId = String(body.sourceOperationId || "").trim();
  if (!publicationId || !sourceOperationId) {
    fail("INVALID_INPUT", "publicationId and sourceOperationId are required.", 400);
  }

  const proof = await serviceCall(env, "deploy", "/internal/publication/verify", {
    schoolId,
    publicationId,
    sourceOperationId,
    sourceDigest: body.sourceDigest,
    sourceFence: body.sourceFence,
  });
  if (
    !proof ||
    proof.state !== "committed" ||
    proof.schoolId !== schoolId ||
    proof.publicationId !== publicationId ||
    proof.hrTermsPublication?.schemaVersion !== 1 ||
    !proof.hrTermsPublication?.lists ||
    typeof proof.hrTermsPublication.lists !== "object"
  ) {
    fail(
      "HR_TERMS_PUBLICATION_UNSUPPORTED",
      "Immutable publication does not carry a verified HR Terms catalogue contract.",
      409,
    );
  }

  const original = await serviceCall(env, "core", "/internal/decision", {
    decisionId: proof.decisionId,
    schoolId,
    service: "deploy",
    actions: ["deploy.publish"],
    operationId: sourceOperationId,
    allowHistorical: true,
  });
  if (!original?.principal?.actorId) {
    fail("AUTHORITY_UNVERIFIED", "Deploy publish decision could not be verified.", 403);
  }

  const incomingLists = proof.hrTermsPublication.lists;
  for (const field of Object.keys(incomingLists)) {
    if (FIXED_FIELDS.has(field)) {
      fail(
        "FIXED_CATALOGUE_DENIED",
        `${field} is a fixed HR Terms list and cannot be overwritten.`,
        403,
      );
    }
    if (!Object.prototype.hasOwnProperty.call(FIELD_META, field)) {
      fail("INVALID_HR_TERMS", `Unsupported HR Terms field ${field}.`, 400);
    }
  }

  const validatedLists = {};
  for (const [field, rawList] of Object.entries(incomingLists)) {
    validatedLists[field] = normalizeChoiceList(
      field,
      rawList,
      FIELD_META[field].limit,
    );
  }

  const operationId =
    "hr-terms-" +
    (await digest([schoolId, publicationId, sourceOperationId])).slice(0, 48);
  const op = await prepareOperation(env.DB, {
    schoolId,
    actorId: original.principal.actorId,
    operationId,
    action: "internal.contacts.hrTermsPublication",
    intent: {
      publicationId,
      sourceOperationId,
      sequence: proof.sequence,
      listsDigest: await digest(validatedLists),
    },
    now,
    validUntil: now + 60000,
  });
  if (op.receipt) return { ...op.receipt.result, receipt: op.receipt };

  const updatedFields = [];
  const supersededFields = [];
  const skippedAbsentFields = Object.keys(FIELD_META)
    .filter((f) => !Object.prototype.hasOwnProperty.call(validatedLists, f))
    .sort();
  const flaggedStaffValues = [];
  const guards = [];
  const writes = [];
  const revisions = {};

  for (const [field, choices] of Object.entries(validatedLists)) {
    const meta = FIELD_META[field];
    const head = await one(
      env.DB,
      "SELECT revision, body FROM contacts_catalogues WHERE school_id=? AND catalogue_id=? ORDER BY revision DESC LIMIT 1",
      [schoolId, meta.catalogueId],
    );
    const prevRev = head?.revision || 0;
    const prevBody = head ? JSON.parse(head.body) : null;
    const prevSequence = Number(prevBody?.sourceSequence || 0);

    // Monotonic sequence protection: delayed older publication never overwrites newer catalogue.
    if (prevBody && prevSequence > proof.sequence) {
      supersededFields.push({
        field,
        activeSequence: prevSequence,
        activePublicationId: prevBody.publicationId || null,
      });
      revisions[field] = prevRev;
      continue;
    }

    const nextRev = prevRev + 1;
    const catalogueBody = {
      schemaVersion: 1,
      kind: "hr-terms",
      catalogueId: meta.catalogueId,
      field,
      revision: nextRev,
      choices,
      explicitlyEmpty: choices.length === 0,
      sourceDomain: "deploy",
      publicationId,
      sourceOperationId,
      sourceSequence: proof.sequence,
      publishedAt: proof.publishedAt || now,
      entries: choices.map((code) => ({ code, label: code, category: field })),
    };

    guards.push({
      sql: "SELECT COALESCE(MAX(revision),0)=? AS ok FROM contacts_catalogues WHERE school_id=? AND catalogue_id=?",
      args: [prevRev, schoolId, meta.catalogueId],
    });
    writes.push({
      sql: "INSERT INTO contacts_catalogues(school_id,catalogue_id,revision,body) VALUES(?,?,?,?)",
      args: [schoolId, meta.catalogueId, nextRev, canonical(catalogueBody)],
    });
    updatedFields.push(field);
    revisions[field] = nextRev;

    // 15 Nov retain-and-flag rule: scan existing staff values, retain untouched, and flag out-of-catalogue values.
    const allowedSet = new Set(choices);
    const staffRows = await query(
      env.DB,
      "SELECT staff_id, value_json FROM contacts_fields WHERE school_id=? AND field=? AND state='accepted' AND revoked=0",
      [schoolId, meta.contactsField],
    );
    for (const sRow of staffRows) {
      const vals = extractStaffValues(sRow.value_json);
      for (const val of vals) {
        if (!allowedSet.has(val)) {
          flaggedStaffValues.push({
            staffId: sRow.staff_id,
            field,
            contactsField: meta.contactsField,
            value: val,
            retained: true,
            reason: "OUT_OF_PUBLISHED_CATALOGUE",
          });
        }
      }
    }
  }

  updatedFields.sort();
  flaggedStaffValues.sort((a, b) =>
    `${a.staffId}|${a.field}|${a.value}`.localeCompare(
      `${b.staffId}|${b.field}|${b.value}`,
    ),
  );

  const state =
    supersededFields.length === 0
      ? "applied"
      : updatedFields.length > 0
        ? "partial"
        : "superseded";
  const result = {
    state,
    publicationId,
    sourceOperationId,
    sequence: proof.sequence,
    updatedFields,
    supersededFields,
    skippedAbsentFields,
    revisions,
    flaggedStaffValues,
    staffValuesMutated: false,
  };

  const receipt = await commitOperation(env.DB, op, {
    now,
    guards,
    writes,
    result,
    audit: {
      kind: "hr-terms-publication",
      publicationId,
      sourceOperationId,
      sequence: proof.sequence,
      updatedFields,
      flaggedCount: flaggedStaffValues.length,
    },
    admission: {
      kind: "system",
      reason: "Verified committed Deploy HR Terms catalogue publication",
    },
  });
  return { ...receipt.result, receipt };
}

export async function readPublishedHrTerms(ctx) {
  const { env } = ctx;
  const schoolId = env.SCHOOL_ID;
  const lists = {};
  const revisions = {};
  const provenance = {};

  for (const [field, meta] of Object.entries(FIELD_META)) {
    const head = await one(
      env.DB,
      "SELECT revision, body FROM contacts_catalogues WHERE school_id=? AND catalogue_id=? ORDER BY revision DESC LIMIT 1",
      [schoolId, meta.catalogueId],
    );
    if (!head) continue;
    const parsed = JSON.parse(head.body);
    lists[field] = Array.isArray(parsed.choices) ? parsed.choices : [];
    revisions[field] = head.revision;
    provenance[field] = {
      publicationId: parsed.publicationId || null,
      sourceSequence: parsed.sourceSequence || 0,
      explicitlyEmpty: parsed.explicitlyEmpty === true,
      publishedAt: parsed.publishedAt || null,
    };
  }

  return {
    schemaVersion: 1,
    lists,
    revisions,
    provenance,
  };
}
