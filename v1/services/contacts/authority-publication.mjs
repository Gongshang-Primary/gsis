import { ApiError } from "../../runtime/errors.mjs";
import { one, query } from "../../runtime/store.mjs";

const fail = (value, code = "AUTHORITY_PUBLICATION_INVALID", status = 403) => {
  if (!value) throw new ApiError(code, status, "The authority publication cannot be applied.");
};
export const isAuthorityPublication = value =>
  value?.field === "authority" && value.authorityPublicationVersion === 1;

/** EO is deliberately optional: a legacy appointment grade does not establish
 * employment authority. An omitted EO leaves its existing accepted record alone. */
export function authorityTuple(value) {
  fail(value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every(key => ["memberships", "smc", "schoolLeader", "eo"].includes(key)) &&
    Array.isArray(value.memberships) && typeof value.smc === "boolean" &&
    typeof value.schoolLeader === "boolean" &&
    (!Object.hasOwn(value, "eo") || typeof value.eo === "boolean"));
  return value;
}

export function assertAuthorityPublicationPrincipal(principal, body) {
  fail(principal.capabilities.includes("contacts.authorityPublication") &&
    principal.capabilities.includes("contacts.contribute") &&
    principal.publicationProof?.publicationId === body.sourcePublicationId &&
    principal.publicationProof?.proposerId === body.publicationProposerId &&
    principal.publicationProof?.sequence === body.membershipPublicationSequence &&
    principal.fieldScope?.staffId === body.staffId && body.membershipPublicationVersion === 1 &&
    body.authorityPublicationVersion === 1 && typeof body.publicationProposerId === "string");
  authorityTuple(body.changes);
}

export function authorityFrontierWrite(env, staffId, field, frontier, operationId, revision, publication = false) {
  return {
    sql: "INSERT INTO contacts_authority_publication_frontiers(school_id,staff_id,field,publication_sequence,publication_id,source_kind,operation_id,field_revision) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(school_id,staff_id,field) DO UPDATE SET publication_sequence=excluded.publication_sequence,publication_id=excluded.publication_id,source_kind=excluded.source_kind,operation_id=excluded.operation_id,field_revision=excluded.field_revision",
    args: [env.SCHOOL_ID, staffId, field, frontier.sequence, frontier.publicationId,
      publication ? "publication" : "direct", operationId, revision],
  };
}
export function authorityFrontierGuard(env, staffId, field, sequence, publication = true) {
  return { sql: "SELECT COALESCE((SELECT publication_sequence FROM contacts_authority_publication_frontiers WHERE school_id=? AND staff_id=? AND field=?),-1)" + (publication ? "<" : "<=") + "? AS ok",
    args: [env.SCHOOL_ID, staffId, field, sequence] };
}
export function assertAuthorityPublicationCurrent(body, frontier) {
  fail(Number.isSafeInteger(body.membershipPublicationSequence) && body.membershipPublicationSequence > 0 &&
    body.membershipPublicationSequence === frontier.sequence && body.sourcePublicationId === frontier.publicationId,
    "MEMBERSHIP_PUBLICATION_SUPERSEDED", 409);
}
/** Select the mutable write set, never rewrite the immutable acknowledged intent.
 * A later custom group edit cannot cancel an unrelated SMC revocation. */
export async function authorityPublicationFields(env, body, frontier) {
  const prior = await query(env.DB,
    "SELECT field,publication_sequence FROM contacts_authority_publication_frontiers WHERE school_id=? AND staff_id=?",
    [env.SCHOOL_ID, body.staffId]);
  const membership = await one(env.DB,
    "SELECT publication_sequence FROM contacts_membership_frontiers WHERE school_id=? AND staff_id=?",
    [env.SCHOOL_ID, body.staffId]);
  const sequence = Object.fromEntries(prior.map(row => [row.field, row.publication_sequence]));
  sequence.memberships = membership?.publication_sequence ?? -1;
  const fields = Object.keys(body.changes), appliedFields = fields.filter(field => (sequence[field] ?? -1) < frontier.sequence);
  fail(appliedFields.length, "MEMBERSHIP_PUBLICATION_SUPERSEDED", 409);
  return { appliedFields, supersededFields: fields.filter(field => !appliedFields.includes(field)) };
}
