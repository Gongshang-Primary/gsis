import {
  CONTACT_FIELD_MAP,
  CONTACT_GRID_FIELDS,
  CONTACT_GRID_SCHEMA,
  gridValues,
} from "./grid-projection.mjs";
import { validateMkeIntervals } from "./intervals.mjs";
import {
  deriveDisplay,
  validateAssignments,
  writeOrdinaryField,
  pinnedDefinitions,
} from "./catalogues.mjs";
import { birthdayIntents } from "./jobs.mjs";
import { readMembershipFrontier, membershipDependency, membershipFrontierWrite } from "./membership-publication.mjs";
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
  requestSourceCancellations,
  sourceChangeDone,
} from "../../runtime/admission.mjs";
import {
  publicStaff,
  effectiveField,
  validateValue,
  makeSnapshots,
  sectionCode,
} from "./store.mjs";
import {
  isDirectField,
  normalizeDirectValue,
} from "../../contacts/direct-fields.mjs";
const w = (sql, args) => ({ sql, args });
const fail = (
  ok,
  code = "INVALID_INPUT",
  status = 400,
  message = "Check the edited fields.",
) => {
  if (!ok) throw new ApiError(code, status, message);
};
export const FIELD_MAP = CONTACT_FIELD_MAP;
export const GRID_FIELDS = CONTACT_GRID_FIELDS;
const aliases = {
  "iCON Alias (@moe.edu.sg)": "moe.edu.sg",
  "CES Alias (@schools.gov.sg)": "schools.gov.sg",
  "GSPS Alias (@gsps.edu.sg)": "gsps.edu.sg",
};
export function validateOrdinaryValue(env, field, value) {
  if (
    typeof value === "string" &&
    !value.trim() &&
    !["basicName", "ttbName", "profileState"].includes(field)
  )
    value = null;
  validateValue(field, value);
  const domain = {
    email: env.HOSTED_DOMAIN,
    iconEmail: "moe.edu.sg",
    cesEmail: "schools.gov.sg",
  }[field];
  if (value !== null && ["email", "iconEmail", "cesEmail"].includes(field)) {
    fail(
      typeof domain === "string" && domain.length > 0,
      "CONTACT_DOMAIN_UNAVAILABLE",
      503,
    );
    fail(
      value.slice(value.lastIndexOf("@") + 1).toLowerCase() ===
        domain.toLowerCase(),
      "INVALID_EMAIL_DOMAIN",
      400,
      "Use the email domain for this dedicated alias column.",
    );
  }
  return isDirectField(field) ? normalizeDirectValue(field, value) : value;
}
async function convert(env, field, value, current, changes, now) {
  fail(typeof value === "string" && value.length <= 8192);
  value = value.trim();
  const target = FIELD_MAP[field];
  fail(
    target &&
      CONTACT_GRID_SCHEMA.fields.find((x) => x.label === field)?.editable,
    "FIELD_DENIED",
    403,
  );
  if (target === "birthday") {
    const old = effectiveField(current.birthday, now);
    let day = String(old ?? "").slice(-2),
      month = String(old ?? "").slice(-5, -3);
    for (const c of changes)
      if (c.field === "Day of Birth") day = c.value;
      else if (c.field === "Month of birth") month = c.value;
    if (!day && !month) return null;
    fail(day && month);
    const year = /^\d{4}-/.test(String(old ?? "")) ? old.slice(0, 5) : "";
    return `${year}${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (isDirectField(target)) {
    const raw =
      CONTACT_GRID_SCHEMA.fields.find((x) => x.key === target).type ===
      "string[]"
        ? value
          ? value
              .split(/\r?\n/)
              .map((x) => x.trim())
              .filter(Boolean)
          : []
        : value || null;
    validateValue(target, raw);
    return normalizeDirectValue(target, raw);
  }
  if (target === "aliases")
    return value
      ? [
          ...new Set(
            value
              .split(/\r?\n/)
              .map((x) => x.trim())
              .filter(Boolean),
          ),
        ]
      : [];
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
  return value;
}
/** Pack only this owner's known row writes; histories and final values stay in the same transaction. */
function compactGridWrites(writes) {
  const fields = new Map(),
    history = [],
    snapshots = [],
    creates = [],
    updates = [],
    rest = [];
  for (const write of writes) {
    const { sql, args } = write;
    if (sql.startsWith("INSERT INTO contacts_fields(")) {
      fields.set(canonical(args.slice(0, 3)), [...args, null]);
    } else if (sql.startsWith("UPDATE contacts_fields SET timeline_json=?")) {
      const target = fields.get(canonical([args[1], args[2], args[3]]));
      fail(target, "GRID_PLAN_INVALID", 500);
      target[13] = args[0];
    } else if (sql.startsWith("INSERT INTO contacts_history("))
      history.push(args);
    else if (sql.startsWith("INSERT INTO contacts_snapshots("))
      snapshots.push(args);
    else if (sql.startsWith("INSERT INTO contacts_staff(")) creates.push(args);
    else if (sql.startsWith("UPDATE contacts_staff SET basic_name="))
      updates.push(args);
    else if (sql.startsWith("UPDATE source_changes SET state='committed'"))
      continue;
    else rest.push(write);
  }
  const packed = [];
  const insert = (table, columns, rows, tail = "") => {
    if (!rows.length) return;
    packed.push(
      w(
        `INSERT INTO ${table}(${columns.join(",")}) SELECT ${columns.map((_, i) => `json_extract(value,'$[${i}]')`).join(",")} FROM json_each(?) WHERE 1 ${tail}`,
        [canonical(rows)],
      ),
    );
  };
  insert(
    "contacts_staff",
    [
      "school_id",
      "staff_id",
      "basic_name",
      "ttb_name",
      "active",
      "section",
      "revision",
      "created_at",
      "profile_state",
    ],
    creates,
  );
  if (updates.length)
    packed.push(
      w(
        "UPDATE contacts_staff SET (basic_name,ttb_name,active,section,revision,profile_state)=(SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]'),json_extract(value,'$[4]'),json_extract(value,'$[5]') FROM json_each(?) WHERE json_extract(value,'$[6]')=contacts_staff.school_id AND json_extract(value,'$[7]')=contacts_staff.staff_id) WHERE EXISTS(SELECT 1 FROM json_each(?) WHERE json_extract(value,'$[6]')=contacts_staff.school_id AND json_extract(value,'$[7]')=contacts_staff.staff_id)",
        [canonical(updates), canonical(updates)],
      ),
    );
  const columns = [
    "school_id",
    "staff_id",
    "field",
    "revision",
    "state",
    "value_json",
    "valid_from",
    "valid_until",
    "revoked",
    "proposer",
    "accepter",
    "accepted_at",
    "operation_id",
    "timeline_json",
  ];
  insert(
    "contacts_fields",
    columns,
    [...fields.values()],
    `ON CONFLICT(school_id,staff_id,field) DO UPDATE SET ${columns
      .slice(3)
      .map((k) => `${k}=excluded.${k}`)
      .join(",")}`,
  );
  insert(
    "contacts_history",
    ["school_id", "staff_id", "field", "revision", "record_json"],
    history,
  );
  insert(
    "contacts_snapshots",
    [
      "school_id",
      "staff_id",
      "profile",
      "snapshot_id",
      "revision",
      "sequence",
      "staff_revision",
      "valid_from",
      "valid_until",
      "digest",
      "body",
    ],
    snapshots,
  );
  return [...packed, ...rest];
}
export async function saveGrid(ctx) {
  const { env, principal, body, now, path } = ctx,
    self = path === "/save-diy";
  fail(
    Array.isArray(body.changes) &&
      (body.additions === undefined || Array.isArray(body.additions)),
  );
  const additions = body.additions ?? [];
  if (self)
    fail(
      additions.length === 0 &&
        body.changes.every(
          (c) =>
            c?.id === principal.staffId &&
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
  fail(
    typeof operationId === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(operationId),
  );
  const prepare = () =>
    prepareOperation(env.DB, {
      schoolId: env.SCHOOL_ID,
      actorId: principal.actorId,
      operationId,
      action,
      intent: { changes: body.changes, additions },
      now,
      validUntil: principal.validUntil,
      authorization: principal,
    });
  let op;
  // Existing operations retain their original intent and receipt across input-schema upgrades.
  if (await operationStatus(env.DB, env.SCHOOL_ID, operationId)) {
    op = await prepare();
    if (op.receipt)
      return {
        saved: op.receipt.state === "committed",
        state: op.state,
        receipt: op.receipt,
        mapping: op.receipt.result?.mapping,
      };
  }
  fail(
    body.changes.length + (body.additions?.length ?? 0) <= 64,
    "EDIT_BOUNDS",
    413,
    "Save at most 64 edited cells or additions together.",
  );
  const keys = new Set(),
    additionIds = new Set();
  for (const c of body.changes) {
    fail(
      c &&
        typeof c.id === "string" &&
        typeof c.field === "string" &&
        typeof c.expected === "string" &&
        typeof c.value === "string",
    );
    const key = canonical([c.id, c.field]);
    fail(!keys.has(key));
    keys.add(key);
  }
  for (const add of additions) {
    fail(
      add &&
        typeof add.id === "string" &&
        add.values &&
        typeof add.values === "object" &&
        !Array.isArray(add.values),
    );
    fail(!additionIds.has(add.id));
    additionIds.add(add.id);
  }
  fail(
    new Set(body.changes.map((c) => c.id)).size + additions.length <= 16,
    "EDIT_BOUNDS",
    413,
    "Save at most 16 staff records together.",
  );

  for (const c of [
    ...body.changes,
    ...additions.flatMap((add) =>
      Object.entries(add.values ?? {})
        .filter(([, value]) => value !== "")
        .map(([field, value]) => ({ field, value })),
    ),
  ]) {
    const descriptor = CONTACT_GRID_SCHEMA.fields.find(
      (f) => f.label === c.field,
    );
    fail(descriptor?.editable, "FIELD_DENIED", 403);
    fail(typeof c.value === "string" && c.value.length <= 8192);
    if (descriptor.key !== "birthday")
      validateOrdinaryValue(
        env,
        descriptor.key,
        await convert(env, c.field, c.value, {}, [], now),
      );
  }

  op ??= await prepare();
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
  const prepared = [],
    ids = [...byStaff.keys()],
    addedIds = new Set(Object.values(mapping));
  const currentRows = await query(
    env.DB,
    "SELECT p.*,COALESCE(json_group_array(CASE WHEN f.field IS NOT NULL THEN json_object('field',f.field,'revision',f.revision,'state',f.state,'value_json',f.value_json,'timeline_json',f.timeline_json,'valid_from',f.valid_from,'valid_until',f.valid_until,'revoked',f.revoked,'proposer',f.proposer,'accepter',f.accepter,'accepted_at',f.accepted_at,'operation_id',f.operation_id) END),'[]') AS fields_json FROM contacts_staff p LEFT JOIN contacts_fields f ON f.school_id=p.school_id AND f.staff_id=p.staff_id WHERE p.school_id=? AND p.staff_id IN(SELECT value FROM json_each(?)) GROUP BY p.staff_id",
    [env.SCHOOL_ID, canonical(ids.filter((id) => !addedIds.has(id)))],
  );
  const current = new Map(
    currentRows.map((staff) => [
      staff.staff_id,
      {
        staff,
        fields: Object.fromEntries(
          JSON.parse(staff.fields_json)
            .filter(Boolean)
            .map((f) => [f.field, f]),
        ),
      },
    ]),
  );
  const definitions = await pinnedDefinitions(
    env.DB,
    env.SCHOOL_ID,
    [...current.values()].map((r) => r.fields),
  );
  const expected = [],
    changedNames = [];
  const membershipFrontier = [...byStaff.values()].some((changes) =>
    changes.some((c) => FIELD_MAP[c.field] === "memberships")) ? await readMembershipFrontier(env) : null;
  let writes = [];
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
        : current.get(staffId);
    fail(old, "NOT_FOUND", 404, "Staff record was not found.");
    expected.push([staffId, added ? null : old.staff.revision]);
    const baseline = added
      ? CONTACT_GRID_FIELDS.map(() => "")
      : gridValues(publicStaff(old, now, { privateFields: true }), {
          schoolDomain: env.HOSTED_DOMAIN,
        });
    for (const c of changes)
      fail(
        baseline[CONTACT_GRID_FIELDS.indexOf(c.field)] === c.expected,
        "REVISION_CONFLICT",
        409,
        "An edited value changed. Review your draft.",
      );
    if (added) {
      const name = changes.find((c) => c.field === "Basic Name")?.value;
      fail(name && name.trim(), "INVALID_NAME", 400);
    }
    const next = { ...old.fields },
      done = new Set();
    for (const c of changes) {
      const field = FIELD_MAP[c.field];
      if (done.has(field)) continue;
      done.add(field);
      const value = await convert(
        env,
        c.field,
        c.value,
        old.fields,
        changes,
        now,
      );
      validateOrdinaryValue(env, field, value);
      const change = writeOrdinaryField(old.fields[field], field, value, {
        schoolId: env.SCHOOL_ID,
        staffId,
        actorId: principal.actorId,
        operationId,
        now,
      });
      next[field] = change.row;
      writes.push(...change.writes);
      if (field === "memberships")
        writes.push(membershipFrontierWrite(env, staffId, membershipFrontier, operationId, change.row.revision));
    }
    await validateAssignments(
      env.DB,
      env.SCHOOL_ID,
      next,
      old.fields,
      definitions,
    );
    writes.push(
      ...(await deriveDisplay(
        env.DB,
        env.SCHOOL_ID,
        next,
        {
          schoolId: env.SCHOOL_ID,
          staffId,
          actorId: principal.actorId,
          operationId,
          now,
        },
        definitions,
      )),
    );
    const basic = effectiveField(next.basicName, now) ?? old.staff.basic_name,
      ttb = effectiveField(next.ttbName, now) ?? basic;
    const revision = old.staff.revision + 1,
      active = effectiveField(next.employmentActive, now),
      section = sectionCode(effectiveField(next.schoolSection, now));
    validateMkeIntervals(next);
    if (added || ttb !== old.staff.ttb_name) changedNames.push([staffId, ttb]);
    if (added)
      writes.unshift(
        w(
          "INSERT INTO contacts_staff(school_id,staff_id,basic_name,ttb_name,active,section,revision,created_at,profile_state) VALUES(?,?,?,?,?,?,?,?,?)",
          [
            env.SCHOOL_ID,
            staffId,
            basic,
            ttb,
            active === null ? null : active ? 1 : 0,
            section ?? null,
            revision,
            now,
            effectiveField(next.profileState, now) ?? "provisional",
          ],
        ),
      );
    else
      writes.push(
        w(
          "UPDATE contacts_staff SET basic_name=?,ttb_name=?,active=?,section=?,revision=?,profile_state=? WHERE school_id=? AND staff_id=?",
          [
            basic,
            ttb,
            active === null ? null : active ? 1 : 0,
            section ?? null,
            revision,
            effectiveField(next.profileState, now) ?? old.staff.profile_state,
            env.SCHOOL_ID,
            staffId,
          ],
        ),
      );
    writes.push(
      ...(await makeSnapshots(
        env.DB,
        env.SCHOOL_ID,
        staffId,
        revision,
        next,
        definitions.map((d) => d.catalogue),
      )),
      sourceChangeDone(env.SCHOOL_ID, `staff:${staffId}`, operationId),
    );
    prepared.push({ staffId, revision, ttb });
  }
  for (const [staffId, name] of changedNames)
    fail(
      !prepared.some(
        (p) =>
          p.staffId !== staffId && p.ttb.toLowerCase() === name.toLowerCase(),
      ),
      "IDENTITY_SELECTION_REQUIRED",
      409,
    );
  if (changedNames.length)
    fail(
      !(await one(
        env.DB,
        "SELECT 1 found FROM contacts_staff s JOIN json_each(?) n ON s.staff_id<>json_extract(n.value,'$[0]') AND lower(s.ttb_name)=lower(json_extract(n.value,'$[1]')) WHERE s.school_id=? LIMIT 1",
        [canonical(changedNames), env.SCHOOL_ID],
      )),
      "IDENTITY_SELECTION_REQUIRED",
      409,
      "Select the existing person or provide a distinct name suffix or modifier.",
    );
  const guards = [
    ...(membershipFrontier ? [w(
      "SELECT NOT EXISTS(SELECT 1 FROM contacts_membership_frontiers WHERE school_id=? AND staff_id IN(SELECT value FROM json_each(?)) AND publication_sequence>?) AS ok",
      [env.SCHOOL_ID, canonical([...byStaff].filter(([, changes]) => changes.some(c => FIELD_MAP[c.field] === 'memberships')).map(([id]) => id)), membershipFrontier.sequence],
    )] : []),
    w(
      "SELECT NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN contacts_staff s ON s.school_id=? AND s.staff_id=json_extract(j.value,'$[0]') WHERE (json_type(j.value,'$[1]')='null' AND s.staff_id IS NOT NULL) OR (json_type(j.value,'$[1]')<>'null' AND (s.staff_id IS NULL OR s.revision<>json_extract(j.value,'$[1]')))) AS ok",
      [canonical(expected), env.SCHOOL_ID],
    ),
    w(
      "SELECT NOT EXISTS(SELECT 1 FROM source_pins WHERE school_id=? AND scope IN(SELECT 'staff:'||value FROM json_each(?)) AND state='held' AND NOT(operation_id=? AND destination=?)) AS ok",
      [env.SCHOOL_ID, canonical(ids), operationId, env.SERVICE_NAME],
    ),
    w(
      "SELECT NOT EXISTS(SELECT 1 FROM contacts_staff s JOIN json_each(?) n ON s.staff_id<>json_extract(n.value,'$[0]') AND lower(s.ttb_name)=lower(json_extract(n.value,'$[1]')) WHERE s.school_id=?) AS ok",
      [canonical(changedNames), env.SCHOOL_ID],
    ),
  ];
  writes = compactGridWrites(writes);
  writes.push(
    w(
      "UPDATE source_changes SET state='committed' WHERE school_id=? AND operation_id=? AND scope IN(SELECT 'staff:'||value FROM json_each(?))",
      [env.SCHOOL_ID, operationId, canonical(ids)],
    ),
  );
  const bytes = [...guards, ...writes].reduce(
    (sum, entry) =>
      sum +
      entry.args.reduce(
        (n, value) =>
          n +
          (typeof value === "string"
            ? new TextEncoder().encode(value).length
            : 8),
        0,
      ),
    0,
  );
  fail(
    bytes <= 1024 * 1024 - 16384,
    "EDIT_BOUNDS",
    413,
    "This atomic edit exceeds the supported data size. Save a smaller explicit selection.",
  );
  await statement(
    env.DB,
    "INSERT OR IGNORE INTO source_changes(school_id,scope,operation_id,created_at,state) SELECT ?,'staff:'||value,?,?,'pending' FROM json_each(?) WHERE EXISTS(SELECT 1 FROM product_operations WHERE school_id=? AND operation_id=? AND fence=? AND digest=? AND state='prepared')",
    [
      env.SCHOOL_ID,
      operationId,
      now,
      canonical(ids),
      env.SCHOOL_ID,
      operationId,
      op.fence,
      op.digest,
    ],
  ).run();
  const heldPins = () =>
    query(
      env.DB,
      "SELECT * FROM source_pins WHERE school_id=? AND scope IN(SELECT 'staff:'||value FROM json_each(?)) AND state='held' AND NOT(operation_id=? AND destination=?) LIMIT 17",
      [env.SCHOOL_ID, canonical(ids), operationId, env.SERVICE_NAME],
    );
  let held = await heldPins();
  if (held.length) {
    await requestSourceCancellations(env, held);
    held = await heldPins();
  }
  if (held.length)
    return {
      saved: false,
      state: "pending",
      operationId,
      reason: "SOURCE_PIN_HELD",
    };
  const admission = await admit(env, env.DB, op, principal,
    membershipFrontier ? [membershipDependency(membershipFrontier, principal.validUntil)] : [], now);
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
    result: {
      mapping,
      staff: prepared.map(({ staffId, revision }) => ({ staffId, revision })),
    },
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
