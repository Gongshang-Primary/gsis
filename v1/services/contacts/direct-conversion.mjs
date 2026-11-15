/** Explicit owner-invoked conversion. Never called by reads, startup or ordinary saves. */
import { ApiError } from "../../runtime/errors.mjs";
import {
  canonical,
  digest,
  one,
  query,
  prepareOperation,
  commitOperation,
  operationStatus,
  abortOperation,
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
  DIRECT_FIELDS,
  resolveLegacyValue,
  decodeStoredValue,
} from "../../contacts/direct-fields.mjs";
import {
  validateFields,
  fieldNames,
  bounded,
} from "../../contacts/contracts.mjs";
import { validateCatalogues } from "../../contacts/catalogues.mjs";
import {
  records,
  staffRecord,
  storageValue,
  makeSnapshots,
  effectiveField,
  sectionCode,
} from "./store.mjs";
import { deriveDisplay, fieldWrite } from "./catalogues.mjs";
import { validateMkeIntervals } from "./intervals.mjs";
import { birthdayIntents } from "./jobs.mjs";
const w = (sql, args = []) => ({ sql, args });
const fail = (
  ok,
  code = "CONVERSION_INVALID",
  status = 400,
  message = "Review the bounded Contacts conversion plan.",
) => {
  if (!ok) throw new ApiError(code, status, message);
};
function selectedFields(fields) {
  const selected = fields === undefined ? [...DIRECT_FIELDS] : fields;
  fail(
    Array.isArray(selected) &&
      selected.length > 0 &&
      selected.length <= DIRECT_FIELDS.length &&
      selected.every((field) => DIRECT_FIELDS.includes(field)) &&
      new Set(selected).size === selected.length,
  );
  return [...selected].sort();
}
function references(value) {
  return Array.isArray(value) ? value : [value];
}
async function loadDefinitions(db, schoolId, refValues) {
  const definitions = new Map();
  async function load(ref) {
    fail(
      ref &&
        typeof ref === "object" &&
        typeof ref.catalogueId === "string" &&
        typeof ref.revision === "string",
      "REFERENCE_MISMATCH",
    );
    const key = JSON.stringify([ref.catalogueId, ref.revision]);
    if (definitions.has(key)) return;
    fail(definitions.size < 128, "CONVERSION_BOUNDS", 413);
    const row = await one(
      db,
      "SELECT body FROM contacts_catalogues WHERE school_id=? AND catalogue_id=? AND CAST(revision AS TEXT)=?",
      [schoolId, ref.catalogueId, ref.revision],
    );
    fail(
      row,
      "REFERENCE_MISMATCH",
      400,
      "The exact pinned definition is unavailable.",
    );
    const catalogue = bounded(JSON.parse(row.body));
    fail(
      catalogue.catalogueId === ref.catalogueId &&
        catalogue.revision === ref.revision,
      "REFERENCE_MISMATCH",
    );
    definitions.set(key, { catalogue, digest: await digest(catalogue) });
    if (catalogue.kind === "membership-role")
      for (const entry of catalogue.entries ?? [])
        if (entry.eoAppointment) await load(entry.eoAppointment);
  }
  for (const ref of refValues) await load(ref);
  return [...definitions.values()];
}
// Count only this owner invocation. Preflight is read-only and stops before the
// platform limit; admission/commit reserve is checked before an operation exists.
function readBudget(db) {
  let count = 0;
  const wrap = (statement) => ({
    bind(...args) {
      return wrap(statement.bind(...args));
    },
    first(...args) {
      charge();
      return statement.first(...args);
    },
    all(...args) {
      charge();
      return statement.all(...args);
    },
  });
  function charge() {
    fail(
      ++count <= 50,
      "CONVERSION_BOUNDS",
      413,
      "Select a smaller conversion field set before proceeding.",
    );
  }
  return {
    db: {
      prepare(sql) {
        return wrap(db.prepare(sql));
      },
    },
    get count() {
      return count;
    },
  };
}
export async function previewDirectConversion(input) {
  const budget = readBudget(input.db),
    db = budget.db;
  return previewForCurrent(
    { ...input, db },
    await staffRecord(db, input.schoolId, input.staffId),
  );
}
async function previewForCurrent(
  { db, schoolId, staffId, fields, now = Date.now() },
  current,
) {
  const selected = selectedFields(fields);
  fail(
    typeof schoolId === "string" &&
      typeof staffId === "string" &&
      Number.isSafeInteger(now) &&
      now >= 0,
  );
  const expectedFields = [],
    proposed = [],
    repairs = [],
    definitions = new Map(),
    boundaries = [];
  for (const field of selected) {
    const row = current.fields[field];
    expectedFields.push({
      field,
      present: !!row,
      revision: row?.revision ?? 0,
      digest: await digest(row ?? null),
    });
    if (!row) continue;
    try {
      const timeline = records(row);
      validateFields(
        Object.fromEntries(
          fieldNames("staff").map((name) => [
            name,
            name === field ? timeline : [{ state: "missing" }],
          ]),
        ),
        "staff",
        { schemaVersion: 2 },
      );
      const legacy = timeline.filter(
        (record) => record.state === "accepted" && record.valueSchema !== 2,
      );
      if (!legacy.length) continue;
      const loaded = await loadDefinitions(
        db,
        schoolId,
        legacy.flatMap((record) => references(record.value)),
      );
      validateCatalogues(
        loaded.map((item) => item.catalogue),
        { [field]: legacy },
        loaded.map(({ catalogue }) => ({
          catalogueId: catalogue.catalogueId,
          revision: catalogue.revision,
        })),
      );
      for (const definition of loaded)
        definitions.set(
          JSON.stringify([
            definition.catalogue.catalogueId,
            definition.catalogue.revision,
          ]),
          definition,
        );
      const converted = [];
      for (const record of timeline) {
        if (record.state !== "accepted" || record.valueSchema === 2) {
          converted.push({ record, converted: false });
          continue;
        }
        const resolved = resolveLegacyValue(field, record.value, {
          sourceFieldRevision: record.revision,
          sourceRecordDigest: await digest(record),
          definitions: loaded,
        });
        converted.push({
          record: {
            ...record,
            ...decodeStoredValue(
              field,
              storageValue(field, resolved.value, resolved.legacy),
            ),
          },
          converted: true,
        });
        for (const instant of [record.validFrom, record.validUntil])
          if (instant !== null && instant > now) boundaries.push(instant);
      }
      proposed.push({ field, records: converted });
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status >= 500 || error.code === "CONVERSION_BOUNDS")
      )
        throw error;
      repairs.push({
        field,
        code: error.code ?? "INVALID_EVIDENCE",
        message:
          "The stored field or its exact pinned definition cannot be converted safely.",
      });
    }
  }
  const plan = {
    schemaVersion: 1,
    state: repairs.length ? "repair-required" : "ready",
    schoolId,
    staffId,
    fields: selected,
    expectedStaffRevision: current.staff.revision,
    expectedFields,
    sourceDefinitions: [...definitions.values()]
      .map(({ catalogue, digest }) => ({
        catalogueId: catalogue.catalogueId,
        revision: catalogue.revision,
        digest,
      }))
      .sort((a, b) => canonical(a).localeCompare(canonical(b))),
    proposed,
    repairs,
    validUntil: boundaries.length ? Math.min(...boundaries) : null,
  };
  bounded(plan);
  return { ...plan, planDigest: await digest(plan) };
}
export async function applyDirectConversion({
  env,
  principal,
  body,
  now = Date.now(),
}) {
  fail(
    env.SERVICE_NAME === "contacts" &&
      principal?.schoolId === env.SCHOOL_ID &&
      !principal.impersonating &&
      (principal.capabilities?.includes("admin") ||
        principal.capabilities?.includes("contacts.manage")),
    "CAPABILITY_DENIED",
    403,
  );
  fail(
    body &&
      body.schemaVersion === 1 &&
      typeof body.operationId === "string" &&
      typeof body.staffId === "string" &&
      Object.keys(body).every((key) =>
        [
          "schemaVersion",
          "operationId",
          "requestId",
          "staffId",
          "fields",
          "expectedStaffRevision",
          "expectedFields",
          "sourceDefinitions",
          "planDigest",
        ].includes(key),
      ) &&
      Number.isSafeInteger(body.expectedStaffRevision) &&
      body.expectedStaffRevision >= 0 &&
      Array.isArray(body.expectedFields) &&
      Array.isArray(body.sourceDefinitions) &&
      /^[a-f0-9]{64}$/.test(body.planDigest ?? ""),
  );
  try {
    bounded(body);
  } catch {
    fail(false, "CONVERSION_BOUNDS", 413);
  }
  const intent = { ...body };
  delete intent.requestId;
  const expectedDigest = await digest({
    schoolId: env.SCHOOL_ID,
    actorId: principal.actorId,
    action: "contacts.manage",
    intent,
  });
  const budget = readBudget(env.DB),
    readDb = budget.db;
  const previous = await operationStatus(
    readDb,
    env.SCHOOL_ID,
    body.operationId,
  );
  if (previous) {
    fail(
      previous.actorId === principal.actorId &&
        previous.action === "contacts.manage" &&
        previous.digest === expectedDigest,
      "OPERATION_INTENT_CONFLICT",
      409,
    );
    if (previous.receipt) return previous.receipt;
  }
  const current = await staffRecord(readDb, env.SCHOOL_ID, body.staffId);
  const plan = await previewForCurrent(
    {
      db: readDb,
      schoolId: env.SCHOOL_ID,
      staffId: body.staffId,
      fields: body.fields,
      now,
    },
    current,
  );
  fail(
    plan.state === "ready",
    "CONVERSION_REPAIR_REQUIRED",
    400,
    "Resolve the reported historical evidence before converting.",
  );
  fail(
    plan.planDigest === body.planDigest &&
      plan.expectedStaffRevision === body.expectedStaffRevision &&
      canonical(plan.expectedFields) === canonical(body.expectedFields) &&
      canonical(plan.sourceDefinitions) === canonical(body.sourceDefinitions),
    "REVISION_CONFLICT",
    409,
    "The conversion source changed. Preview it again.",
  );
  fail(
    plan.validUntil === null || now < plan.validUntil,
    "CONVERSION_EXPIRED",
    409,
  );
  const next = { ...current.fields },
    writes = [],
    history = [];
  fail(
    current.staff.revision === plan.expectedStaffRevision,
    "REVISION_CONFLICT",
    409,
  );
  fail(
    Number.isSafeInteger(current.staff.revision) &&
      current.staff.revision < Math.floor(Number.MAX_SAFE_INTEGER / 1000) - 1,
    "CONVERSION_BOUNDS",
    413,
  );
  for (const change of plan.proposed) {
    const old = current.fields[change.field];
    let revision = old.revision;
    const timeline = change.records.map((item) => {
      if (!item.converted) return item.record;
      fail(
        Number.isSafeInteger(revision) && revision < Number.MAX_SAFE_INTEGER,
        "CONVERSION_BOUNDS",
        413,
      );
      const record = {
        ...item.record,
        revision: `${change.field}-${++revision}`,
      };
      history.push({ field: change.field, revision, record });
      return record;
    });
    const latest = timeline
      .filter((record) => record.state === "accepted")
      .sort((a, b) => a.validFrom - b.validFrom)
      .at(-1);
    fail(latest, "CONVERSION_INVALID");
    next[change.field] = {
      ...old,
      revision,
      state: "accepted",
      value_json: canonical(
        latest.valueSchema === 2
          ? storageValue(change.field, latest.value, latest.legacy)
          : latest.value,
      ),
      valid_from: latest.validFrom,
      valid_until: latest.validUntil,
      revoked: latest.revoked ? 1 : 0,
      operation_id: body.operationId,
      timeline_json: canonical(timeline),
    };
    writes.push(
      fieldWrite(next[change.field]),
      w(
        "UPDATE contacts_fields SET timeline_json=? WHERE school_id=? AND staff_id=? AND field=?",
        [canonical(timeline), env.SCHOOL_ID, body.staffId, change.field],
      ),
    );
  }
  const revision = current.staff.revision + (plan.proposed.length ? 1 : 0);
  if (plan.proposed.length) {
    writes.push(
      w(
        "INSERT INTO contacts_history(school_id,staff_id,field,revision,record_json) SELECT ?,?,json_extract(value,'$.field'),json_extract(value,'$.revision'),json_extract(value,'$.record') FROM json_each(?)",
        [env.SCHOOL_ID, body.staffId, canonical(history)],
      ),
    );
    writes.push(
      ...(await deriveDisplay(readDb, env.SCHOOL_ID, next, {
        schoolId: env.SCHOOL_ID,
        staffId: body.staffId,
        actorId: principal.actorId,
        operationId: body.operationId,
        now,
      })),
    );
    validateMkeIntervals(next);
    writes.push(
      w(
        "UPDATE contacts_staff SET revision=?,ttb_name=?,section=? WHERE school_id=? AND staff_id=?",
        [
          revision,
          effectiveField(next.ttbName, now) ?? current.staff.ttb_name,
          sectionCode(effectiveField(next.schoolSection, now)),
          env.SCHOOL_ID,
          body.staffId,
        ],
      ),
    );
    writes.push(
      ...(await makeSnapshots(
        readDb,
        env.SCHOOL_ID,
        body.staffId,
        revision,
        next,
      )),
    );
    writes.push(
      w(
        "INSERT INTO contacts_epoch(school_id,revision) VALUES(?,1) ON CONFLICT(school_id) DO UPDATE SET revision=revision+1",
        [env.SCHOOL_ID],
      ),
    );
  }
  const guards = [
    w(
      "SELECT EXISTS(SELECT 1 FROM contacts_staff WHERE school_id=? AND staff_id=? AND revision=?) AS ok",
      [env.SCHOOL_ID, body.staffId, current.staff.revision],
    ),
  ];
  for (const field of plan.expectedFields) {
    const row = current.fields[field.field];
    if (!row)
      guards.push(
        w(
          "SELECT NOT EXISTS(SELECT 1 FROM contacts_fields WHERE school_id=? AND staff_id=? AND field=?) AS ok",
          [env.SCHOOL_ID, body.staffId, field.field],
        ),
      );
    else
      guards.push(
        w(
          "SELECT EXISTS(SELECT 1 FROM contacts_fields WHERE school_id=? AND staff_id=? AND field=? AND revision=? AND state=? AND value_json IS ? AND timeline_json IS ?) AS ok",
          [
            env.SCHOOL_ID,
            body.staffId,
            field.field,
            row.revision,
            row.state,
            row.value_json,
            row.timeline_json,
          ],
        ),
      );
  }
  const sourceRows = plan.sourceDefinitions.length
    ? await query(
        readDb,
        "SELECT c.catalogue_id,c.revision,c.body FROM contacts_catalogues c JOIN json_each(?) r ON c.catalogue_id=json_extract(r.value,'$.catalogueId') AND CAST(c.revision AS TEXT)=json_extract(r.value,'$.revision') WHERE c.school_id=?",
        [canonical(plan.sourceDefinitions), env.SCHOOL_ID],
      )
    : [];
  for (const source of plan.sourceDefinitions) {
    const row = sourceRows.find(
      (row) =>
        row.catalogue_id === source.catalogueId &&
        String(row.revision) === source.revision,
    );
    fail(
      row && (await digest(JSON.parse(row.body))) === source.digest,
      "REVISION_CONFLICT",
      409,
    );
    guards.push(
      w(
        "SELECT EXISTS(SELECT 1 FROM contacts_catalogues WHERE school_id=? AND catalogue_id=? AND CAST(revision AS TEXT)=? AND body=?) AS ok",
        [env.SCHOOL_ID, source.catalogueId, source.revision, row.body],
      ),
    );
  }
  const outbox = plan.proposed.length
    ? birthdayIntents(
        env.SCHOOL_ID,
        body.operationId,
        plan.proposed.map((item) => item.field).concat("ttbName"),
        now,
      )
    : [];
  fail(
    new TextEncoder().encode(canonical({ writes, guards, history })).length <=
      524288,
    "CONVERSION_BOUNDS",
    413,
    "Select a smaller conversion field set before proceeding.",
  );
  const scope = `staff:${body.staffId}`;
  guards.push(
    sourceChangeGuard(env.SCHOOL_ID, scope, body.operationId, env.SERVICE_NAME),
  );
  // Keep every predicate in the same owner transaction without paying for a
  // separate assertion insert/delete for each field and pinned definition.
  const combinedGuard = w(
    "SELECT " +
      guards
        .map((guard) => `COALESCE((SELECT ok FROM (${guard.sql}) LIMIT 1),0)`)
        .join(" AND ") +
      " AS ok",
    guards.flatMap((guard) => guard.args ?? []),
  );
  fail(
    combinedGuard.args.length < 99,
    "CONVERSION_BOUNDS",
    413,
    "Select a smaller conversion field set before proceeding.",
  );
  const dependencies = new Set(
    (principal.dependencies ?? []).map((d) => `${d.owner}:${d.scope}`),
  );
  // Success: prepare(2), at most two queue reads/writes(4), admit(3+3N),
  // commit status/assertions/audit/receipt/source completion(10), resolve(3).
  // Reserve four more for a failed commit lookup plus abort receipt, so an
  // ordinary CAS/admission rejection also stays within the owner query limit.
  fail(
    budget.count + writes.length + outbox.length + 26 + 3 * dependencies.size <=
      50,
    "CONVERSION_BOUNDS",
    413,
    "Select a smaller conversion field set before proceeding.",
  );
  const op = await prepareOperation(env.DB, {
    schoolId: env.SCHOOL_ID,
    actorId: principal.actorId,
    operationId: body.operationId,
    action: "contacts.manage",
    intent: body,
    now,
    validUntil: Math.min(principal.validUntil, plan.validUntil ?? Infinity),
    authorization: principal,
  });
  if (op.receipt) return op.receipt;
  let held = await queueSourceChange(
    env.DB,
    env.SCHOOL_ID,
    scope,
    op.operationId,
    now,
    env.SERVICE_NAME,
  );
  if (held.length) {
    await requestSourceCancellations(env, held);
    held = await queueSourceChange(
      env.DB,
      env.SCHOOL_ID,
      scope,
      op.operationId,
      now,
      env.SERVICE_NAME,
    );
  }
  if (held.length)
    return {
      state: "pending",
      operationId: op.operationId,
      reason: "SOURCE_PIN_HELD",
    };
  writes.push(sourceChangeDone(env.SCHOOL_ID, scope, op.operationId));
  let admission;
  try {
    admission = await admit(env, env.DB, op, principal, [], now);
    const receipt = await commitOperation(env.DB, op, {
      now,
      validUntil: Math.min(principal.validUntil, plan.validUntil ?? Infinity),
      admission,
      guards: [combinedGuard],
      writes,
      outbox,
      result: {
        staffId: body.staffId,
        revision,
        convertedFields: plan.proposed.map((item) => item.field),
        planDigest: plan.planDigest,
      },
      audit: {
        kind: "contacts-direct-conversion",
        staffId: body.staffId,
        sourceStaffRevision: current.staff.revision,
        targetStaffRevision: revision,
        planDigest: plan.planDigest,
        sourceFields: plan.expectedFields,
        sourceDefinitions: plan.sourceDefinitions,
      },
    });
    await resolveAdmission(env, env.DB, op, admission, receipt, now);
    return receipt;
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      await abortOperation(env.DB, op, error.code, now);
      await resolveAdmission(env, env.DB, op, admission, null, now);
    }
    throw error;
  }
}
