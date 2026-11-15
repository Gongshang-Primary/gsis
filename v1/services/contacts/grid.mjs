import { validateMkeIntervals } from "./intervals.mjs";
import { deriveDisplay, validateAssignments } from "./catalogues.mjs";
import { birthdayIntents } from "./jobs.mjs";
import { ApiError } from "../../runtime/errors.mjs";
import {
  canonical,
  digest,
  one,
  query,
  statement,
  prepareOperation,
  commitOperation,
  operationStatus,
} from "../../runtime/store.mjs";
import {
  admit,
  resolveAdmission,
  queueSourceChange,
  requestSourceCancellations,
  sourceChangeGuard,
  sourceChangeDone,
} from "../../runtime/admission.mjs";
import {
  record,
  staffRecord,
  publicStaff,
  effectiveField,
  validateValue,
  makeSnapshots,
  sectionCode,
} from "./store.mjs";
const w = (sql, args) => ({ sql, args });
const fail = (
  ok,
  code = "INVALID_INPUT",
  status = 400,
  message = "Check the edited fields.",
) => {
  if (!ok) throw new ApiError(code, status, message);
};
export const FIELD_MAP = {
  "TTb Name": "ttbName",
  "Basic Name": "basicName",
  "Statutory Name": "statutoryName",
  "iCON Alias (@moe.edu.sg)": "iconEmail",
  "CES Alias (@schools.gov.sg)": "cesEmail",
  "GSPS Alias (@gsps.edu.sg)": "email",
  "Mobile No": "mobile",
  EXT: "ext",
  "Day of Birth": "birthday",
  "Month of birth": "birthday",
  Role: "role",
  "EO Appt Level": "eoAppointmentLevel",
  "Appointment Status": "appointmentStatus",
  "Employment Modifier": "employmentTags",
  "Subject Modifier": "subjectTags",
  Active: "employmentActive",
  "MK Modifier": "mkTags",
};
export const GRID_FIELDS = Object.keys(FIELD_MAP);
const aliases = {
  "iCON Alias (@moe.edu.sg)": "moe.edu.sg",
  "CES Alias (@schools.gov.sg)": "schools.gov.sg",
  "GSPS Alias (@gsps.edu.sg)": "gsps.edu.sg",
};
function displayed(field, row, now) {
  const value = effectiveField(row, now);
  if (value === null) return "";
  if (field === "Active") return value ? "Y" : "N";
  if (field === "Day of Birth") return String(Number(String(value).slice(-2)));
  if (field === "Month of birth")
    return String(Number(String(value).slice(-5, -3)));
  if (aliases[field])
    return String(value).endsWith("@" + aliases[field])
      ? String(value).split("@")[0]
      : String(value);
  if (Array.isArray(value)) return value.map((v) => v.code ?? v).join(", ");
  if (typeof value === "object") return value.code;
  return String(value);
}
async function convert(env, field, value, current, changes) {
  fail(typeof value === "string" && value.length <= 4096);
  value = value.trim();
  const target = FIELD_MAP[field];
  fail(target, "FIELD_DENIED", 403);
  if (target === "birthday") {
    const old = effectiveField(current.birthday, Date.now());
    let day = String(old ?? "").slice(-2),
      month = String(old ?? "").slice(-5, -3);
    for (const c of changes)
      if (c.field === "Day of Birth") day = c.value;
      else if (c.field === "Month of birth") month = c.value;
    if (!day && !month) return null;
    fail(day && month);
    return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (!value) {
    fail(
      !["basicName", "ttbName"].includes(target),
      "INVALID_NAME",
      400,
      "A name cannot be blank.",
    );
    return null;
  }
  if (target === "employmentActive") {
    fail(["Y", "N"].includes(value));
    return value === "Y";
  }
  if (aliases[field])
    return value.includes("@")
      ? value
      : `${value}@${field.startsWith("GSPS") ? env.HOSTED_DOMAIN : aliases[field]}`;
  if (target === "mobile") return value.replace(/\s/g, "");
  if (
    [
      "role",
      "eoAppointmentLevel",
      "appointmentStatus",
      "employmentTags",
      "subjectTags",
      "mkTags",
    ].includes(target)
  ) {
    const catalogues = (
      await query(
        env.DB,
        "SELECT c.body FROM contacts_catalogues c JOIN (SELECT catalogue_id,MAX(revision) revision FROM contacts_catalogues WHERE school_id=? GROUP BY catalogue_id) h ON h.catalogue_id=c.catalogue_id AND h.revision=c.revision WHERE c.school_id=?",
        [env.SCHOOL_ID, env.SCHOOL_ID],
      )
    ).map((r) => JSON.parse(r.body));
    const many = target.endsWith("Tags"),
      codes = many ? value.split(/,\s*/) : [value];
    const refs = [];
    for (const code of codes) {
      const matches = [];
      for (const c of catalogues)
        for (const e of c.entries)
          if (
            e.active &&
            (e.code === code || e.label === code) &&
            (target === "role"
              ? c.kind === "membership-role"
              : e.category === target)
          )
            matches.push({
              catalogueId: c.catalogueId,
              revision: c.revision,
              code: e.code,
            });
      fail(
        matches.length === 1,
        "CATALOGUE_SELECTION_REQUIRED",
        409,
        "Select a current unambiguous catalogue value.",
      );
      refs.push(matches[0]);
    }
    return many ? refs : refs[0];
  }
  return value;
}
export async function saveGrid(ctx) {
  const { env, principal, body, now, path } = ctx,
    self = path === "/save-diy";
  fail(
    Array.isArray(body.changes) &&
      (body.additions === undefined || Array.isArray(body.additions)),
  );
  fail(
    body.changes.length + (body.additions?.length ?? 0) <= 64,
    "EDIT_BOUNDS",
    413,
    "Save at most 64 edited cells or additions together.",
  );
  const additions = body.additions ?? [];
  if (self)
    fail(
      additions.length === 0 &&
        body.changes.every(
          (c) =>
            c.id === principal.staffId &&
            ["Statutory Name", "Mobile No"].includes(c.field),
        ),
      "CAPABILITY_DENIED",
      403,
      "DIY updates only your own statutory name and mobile.",
    );
  else
    fail(
      principal.capabilities.includes("contacts.manage") ||
        principal.capabilities.includes("admin"),
      "CAPABILITY_DENIED",
      403,
    );
  const operationId = body.operationId ?? body.requestId,
    action = self ? "contacts.self" : "contacts.manage";
  const op = await prepareOperation(env.DB, {
    schoolId: env.SCHOOL_ID,
    actorId: principal.actorId,
    operationId,
    action,
    intent: { changes: body.changes, additions },
    now,
    validUntil: principal.validUntil,
    authorization: principal,
  });
  if (op.receipt)
    return {
      saved: op.receipt.state === "committed",
      state: op.state,
      receipt: op.receipt,
      mapping: op.receipt.result?.mapping,
    };
  const byStaff = new Map();
  for (const change of body.changes) {
    fail(
      change &&
        typeof change.id === "string" &&
        FIELD_MAP[change.field] &&
        typeof change.expected === "string" &&
        typeof change.value === "string",
    );
    if (!byStaff.has(change.id)) byStaff.set(change.id, []);
    byStaff.get(change.id).push(change);
  }
  const mapping = {};
  for (const add of additions) {
    fail(
      add &&
        typeof add.id === "string" &&
        add.values &&
        typeof add.values === "object",
    );
    const id = `staff-${await digest([env.SCHOOL_ID, operationId, add.id])}`;
    mapping[add.id] = id;
    fail(!byStaff.has(id));
    byStaff.set(
      id,
      Object.entries(add.values)
        .filter(([, v]) => v !== "")
        .map(([field, value]) => ({ id, field, value, expected: "" })),
    );
  }
  fail(
    byStaff.size <= 16,
    "EDIT_BOUNDS",
    413,
    "Save at most 16 staff records together.",
  );
  const prepared = [];
  let writes = [],
    guards = [];
  for (const [staffId, changes] of byStaff) {
    const added = Object.values(mapping).includes(staffId),
      old = added
        ? {
            staff: {
              staff_id: staffId,
              revision: 0,
              authority_revision: 0,
              basic_name: "",
              ttb_name: "",
              profile_state: "provisional",
            },
            fields: {},
          }
        : await staffRecord(env.DB, env.SCHOOL_ID, staffId);
    for (const c of changes)
      fail(
        displayed(c.field, old.fields[FIELD_MAP[c.field]], now) === c.expected,
        "REVISION_CONFLICT",
        409,
        "An edited value changed. Review your draft.",
      );
    if (added) {
      const name = changes.find((c) => c.field === "Basic Name")?.value;
      fail(name && name.trim(), "INVALID_NAME", 400);
      fail(
        !(await one(
          env.DB,
          "SELECT 1 AS found FROM contacts_staff WHERE school_id=? AND lower(basic_name)=lower(?)",
          [env.SCHOOL_ID, name],
        )),
        "IDENTITY_SELECTION_REQUIRED",
        409,
        "Select the existing person or use an explicit distinguishing name.",
      );
    }
    const next = { ...old.fields },
      done = new Set();
    for (const c of changes) {
      const field = FIELD_MAP[c.field];
      if (done.has(field)) continue;
      done.add(field);
      const value = await convert(env, c.field, c.value, old.fields, changes);
      if (value !== null) validateValue(field, value);
      const prior = old.fields[field],
        row = {
          school_id: env.SCHOOL_ID,
          staff_id: staffId,
          field,
          revision: (prior?.revision ?? 0) + 1,
          state: value === null ? "superseded" : "accepted",
          value_json: value === null ? null : canonical(value),
          valid_from: now,
          valid_until: null,
          revoked: 0,
          proposer: principal.actorId,
          accepter: principal.actorId,
          accepted_at: now,
          operation_id: operationId,
        };
      next[field] = row;
      writes.push(
        w(
          "INSERT INTO contacts_fields(school_id,staff_id,field,revision,state,value_json,valid_from,valid_until,revoked,proposer,accepter,accepted_at,operation_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(school_id,staff_id,field) DO UPDATE SET revision=excluded.revision,state=excluded.state,value_json=excluded.value_json,valid_from=excluded.valid_from,valid_until=NULL,revoked=0,proposer=excluded.proposer,accepter=excluded.accepter,accepted_at=excluded.accepted_at,operation_id=excluded.operation_id,timeline_json=NULL",
          Object.values(row),
        ),
        w(
          "INSERT INTO contacts_history(school_id,staff_id,field,revision,record_json) VALUES(?,?,?,?,?)",
          [env.SCHOOL_ID, staffId, field, row.revision, canonical(record(row))],
        ),
      );
    }
    await validateAssignments(env.DB, env.SCHOOL_ID, next, old.fields);
    writes.push(
      ...(await deriveDisplay(env.DB, env.SCHOOL_ID, next, {
        schoolId: env.SCHOOL_ID,
        staffId,
        actorId: principal.actorId,
        operationId,
        now,
      })),
    );
    const basic = effectiveField(next.basicName, now) ?? old.staff.basic_name,
      ttb = effectiveField(next.ttbName, now) ?? basic;
    const revision = old.staff.revision + 1,
      active = effectiveField(next.employmentActive, now),
      section = sectionCode(effectiveField(next.schoolSection, now));
    validateMkeIntervals(next);
    guards.push(
      added
        ? w(
            "SELECT NOT EXISTS(SELECT 1 FROM contacts_staff WHERE school_id=? AND staff_id=?) AS ok",
            [env.SCHOOL_ID, staffId],
          )
        : w(
            "SELECT EXISTS(SELECT 1 FROM contacts_staff WHERE school_id=? AND staff_id=? AND revision=?) AS ok",
            [env.SCHOOL_ID, staffId, old.staff.revision],
          ),
      sourceChangeGuard(
        env.SCHOOL_ID,
        `staff:${staffId}`,
        operationId,
        env.SERVICE_NAME,
      ),
    );
    if (added)
      writes.unshift(
        w(
          "INSERT INTO contacts_staff(school_id,staff_id,basic_name,ttb_name,active,section,revision,created_at) VALUES(?,?,?,?,?,?,?,?)",
          [
            env.SCHOOL_ID,
            staffId,
            basic,
            ttb,
            active === null ? null : active ? 1 : 0,
            section ?? null,
            revision,
            now,
          ],
        ),
      );
    else
      writes.push(
        w(
          "UPDATE contacts_staff SET basic_name=?,ttb_name=?,active=?,section=?,revision=? WHERE school_id=? AND staff_id=?",
          [
            basic,
            ttb,
            active === null ? null : active ? 1 : 0,
            section ?? null,
            revision,
            env.SCHOOL_ID,
            staffId,
          ],
        ),
      );
    writes.push(
      ...(await makeSnapshots(env.DB, env.SCHOOL_ID, staffId, revision, next)),
      sourceChangeDone(env.SCHOOL_ID, `staff:${staffId}`, operationId),
    );
    prepared.push({ staffId, revision });
  }
  for (const { staffId } of prepared) {
    let held = await queueSourceChange(
      env.DB,
      env.SCHOOL_ID,
      `staff:${staffId}`,
      operationId,
      now,
      env.SERVICE_NAME,
    );
    if (held.length) {
      await requestSourceCancellations(env, held);
      held = await queueSourceChange(
        env.DB,
        env.SCHOOL_ID,
        `staff:${staffId}`,
        operationId,
        now,
        env.SERVICE_NAME,
      );
    }
    if (held.length)
      return {
        saved: false,
        state: "pending",
        operationId,
        reason: "SOURCE_PIN_HELD",
      };
  }
  const admission = await admit(env, env.DB, op, principal, [], now);
  writes.push(
    w(
      "INSERT INTO contacts_epoch(school_id,revision) VALUES(?,1) ON CONFLICT(school_id) DO UPDATE SET revision=revision+1",
      [env.SCHOOL_ID],
    ),
  );
  const receipt = await commitOperation(env.DB, op, {
    now,
    admission,
    guards,
    writes,
    result: { mapping, staff: prepared },
    outbox: birthdayIntents(
      env.SCHOOL_ID,
      operationId,
      [
        ...new Set(
          [
            ...body.changes,
            ...additions.flatMap((a) =>
              Object.keys(a.values).map((field) => ({ field })),
            ),
          ].map((c) => FIELD_MAP[c.field]),
        ),
      ],
      now,
    ),
    audit: {
      kind: self ? "self-profile-grid" : "staff-grid",
      staffIds: prepared.map((x) => x.staffId),
      fields: [...new Set(body.changes.map((c) => FIELD_MAP[c.field]))],
    },
  });
  await resolveAdmission(env, env.DB, op, admission, receipt, now);
  return { saved: true, receipt, mapping };
}
export async function gridReceipt(ctx) {
  const { env, body, principal } = ctx;
  const result = await operationStatus(
    env.DB,
    env.SCHOOL_ID,
    body.operationId ?? body.requestId,
  );
  if (!result) return { saved: false, state: "unknown" };
  fail(
    result.actorId === principal.actorId ||
      principal.capabilities.includes("contacts.manage") ||
      principal.capabilities.includes("admin"),
    "CAPABILITY_DENIED",
    403,
  );
  if (body.digest !== undefined)
    fail(body.digest === result.digest, "OPERATION_INTENT_CONFLICT", 409);
  return {
    saved:
      result.state === "committed" && result.receipt?.state === "committed",
    writing: result.state === "prepared",
    state: result.state,
    receipt: result.receipt,
    mapping: result.receipt?.result?.mapping,
  };
}
