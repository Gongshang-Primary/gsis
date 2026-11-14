import { ApiError } from "../../runtime/errors.mjs";
import { canonical } from "../../runtime/store.mjs";
import { record, records, sectionCode } from "./store.mjs";
import { fieldWrite } from "./catalogues.mjs";
const w = (sql, args) => ({ sql, args });
/** A future replacement retains the preceding interval in the immutable current snapshot.
 * Scheduling changes the source once. Evaluating the same content at another time does not. */
export function replaceField(old, field, value, context, from, until) {
  const { schoolId, staffId, actorId, operationId, now } = context;
  let revision = old?.revision ?? 0;
  const timeline = [],
    history = [];
  if (from > now)
    for (const prior of records(old)) {
      if (
        prior.state !== "accepted" ||
        prior.validFrom >= from ||
        (prior.validUntil !== null && prior.validUntil <= now)
      )
        continue;
      let next = prior;
      if (prior.validUntil === null || prior.validUntil > from) {
        next = {
          ...prior,
          revision: `${field}-${++revision}`,
          validUntil: from,
        };
        history.push(next);
      }
      timeline.push(next);
    }
  const row = {
    school_id: schoolId,
    staff_id: staffId,
    field,
    revision: ++revision,
    state: "accepted",
    value_json: canonical(value),
    valid_from: from,
    valid_until: until,
    revoked: 0,
    proposer: actorId,
    accepter: actorId,
    accepted_at: now,
    operation_id: operationId,
  };
  const latest = record(row);
  timeline.push(latest);
  if (timeline.length > 8)
    throw new ApiError(
      "INTERVAL_BOUNDS",
      409,
      "Review the existing effective intervals before scheduling another change.",
    );
  history.push(latest);
  row.timeline_json = canonical(timeline);
  const writes = [
    fieldWrite(row),
    w(
      "UPDATE contacts_fields SET timeline_json=? WHERE school_id=? AND staff_id=? AND field=?",
      [row.timeline_json, schoolId, staffId, field],
    ),
    ...history.map((r) =>
      w(
        "INSERT INTO contacts_history(school_id,staff_id,field,revision,record_json) VALUES(?,?,?,?,?)",
        [
          schoolId,
          staffId,
          field,
          Number(r.revision.slice(field.length + 1)),
          canonical(r),
        ],
      ),
    ),
  ];
  return { row, writes };
}
export function validateMkeIntervals(fields) {
  for (const smc of records(fields.smc))
    for (const section of records(fields.schoolSection))
      if (
        smc.state === "accepted" &&
        smc.value === true &&
        !smc.revoked &&
        section.state === "accepted" &&
        !section.revoked &&
        ["MK", "MKE"].includes(sectionCode(section.value)) &&
        smc.validFrom < (section.validUntil ?? Infinity) &&
        section.validFrom < (smc.validUntil ?? Infinity)
      )
        throw new ApiError(
          "MKE_SMC_CONFLICT",
          409,
          "MKE staff cannot hold SMC during an overlapping effective interval.",
        );
}
