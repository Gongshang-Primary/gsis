/* Authoritative v1 Roster absence-clash confirmation and durable intake resolution (F06). */
import Operations from "../../../shared/roster-operations.js";
import Allocation from "../../../shared/roster-allocation.js";
import { ApiError, requireValue } from "../../runtime/errors.mjs";
import { canonical, digest, one } from "../../runtime/store.mjs";
import {
  accountingChanges,
  dateOnly,
  loadState,
  localDate,
  recordChanges,
  requestedDates,
  scopeChange,
  scopeRevision,
  weekOf,
} from "./repository.mjs";

const ALL_DAY_INTERVAL = [{ startMinutes: 0, endMinutes: 1440 }];

function normalizeCoverage(body) {
  if (body.fullDay === true) return { kind: "fullDay" };
  if (body.coverage && typeof body.coverage === "object") {
    return structuredClone(body.coverage);
  }
  return null;
}

function targetStaffIds(c, body) {
  if (Array.isArray(body.staffIds) && body.staffIds.length) {
    return [...new Set(body.staffIds.map((id) => String(id || "").trim()).filter(Boolean))];
  }
  return [String(body.staffId || c.user?.staffId || "").trim()].filter(Boolean);
}

function targetDates(c, body) {
  if (Array.isArray(body.dates) && body.dates.length) {
    return [...new Set(body.dates.map(dateOnly))].sort();
  }
  if (body.from || body.to) {
    const from = dateOnly(body.from || body.date || c.today);
    const to = dateOnly(body.to || from);
    const out = [];
    for (let t = Date.parse(from); t <= Date.parse(to); t += 86400000) {
      out.push(new Date(t).toISOString().slice(0, 10));
    }
    return out;
  }
  return [dateOnly(body.date || c.today)];
}

function intervalsForRecord(rec, dayModel) {
  const timing = Array.isArray(dayModel?.periods) ? dayModel.periods : [];
  const cov = rec.coverage;
  if (cov?.kind === "fullDay") return ALL_DAY_INTERVAL;
  if (cov?.kind === "timeRange" && Number.isFinite(cov.startMinutes) && Number.isFinite(cov.endMinutes)) {
    return [{ startMinutes: Number(cov.startMinutes), endMinutes: Number(cov.endMinutes) }];
  }
  if (cov?.kind === "timeRanges" && Array.isArray(cov.ranges) && cov.ranges.length) {
    return cov.ranges
      .filter((r) => Number.isFinite(r?.startMinutes) && Number.isFinite(r?.endMinutes))
      .map((r) => ({ startMinutes: Number(r.startMinutes), endMinutes: Number(r.endMinutes) }));
  }
  const periods = Array.isArray(rec.periods) ? rec.periods : [];
  if (timing.length && periods.length) {
    const out = [];
    for (const p of periods) {
      const slot = timing.find((t) => t.period === p);
      if (slot && Number.isFinite(slot.startMinutes) && Number.isFinite(slot.endMinutes)) {
        out.push({ startMinutes: slot.startMinutes, endMinutes: slot.endMinutes });
      }
    }
    if (out.length) return out;
  }
  return [];
}

function periodsForRecord(rec, dayModel) {
  const cov = rec.coverage;
  if (cov && dayModel) {
    try {
      const derived = Allocation.absencePeriods({ coverage: cov }, dayModel);
      if (Array.isArray(derived) && derived.length) return derived;
    } catch {}
  }
  return Array.isArray(rec.periods)
    ? [...new Set(rec.periods.filter((n) => Number.isInteger(n)))].sort((a, b) => a - b)
    : [];
}

function intervalsOverlap(aList, bList) {
  for (const a of aList) {
    for (const b of bList) {
      if (a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes) {
        return true;
      }
    }
  }
  return false;
}

function recordsOverlap(existing, proposed, dayModel) {
  if (existing.coverage?.kind === "fullDay" || proposed.coverage?.kind === "fullDay") {
    return true;
  }
  const existingPeriods = new Set(periodsForRecord(existing, dayModel));
  const proposedPeriods = periodsForRecord(proposed, dayModel);
  for (const p of proposedPeriods) {
    if (existingPeriods.has(p)) return true;
  }
  const existingIntervals = intervalsForRecord(existing, dayModel);
  const proposedIntervals = intervalsForRecord(proposed, dayModel);
  if (existingIntervals.length && proposedIntervals.length) {
    return intervalsOverlap(existingIntervals, proposedIntervals);
  }
  return false;
}

function samePerson(c, aId, bId) {
  if (!aId || !bId) return false;
  if (aId === bId) return true;
  const a = c.people?.find((p) => p.id === aId);
  const b = c.people?.find((p) => p.id === bId);
  return !!(a && b && a.id === b.id);
}

export function findConflictingAbsences(state, c, body) {
  const staffIds = targetStaffIds(c, body);
  const days = targetDates(c, body);
  const coverage = normalizeCoverage(body);
  const rawPeriods = Array.isArray(body.periods) ? body.periods : [];
  const proposed = { coverage, periods: rawPeriods };

  const active = (state.absences || []).filter(
    (a) => !a.deletedAt && a.id !== body.id,
  );
  const conflicts = [];
  const seen = new Set();
  for (const dayKey of days) {
    const dayModel = c.days?.[dayKey] || { periods: [] };
    for (const staffId of staffIds) {
      for (const existing of active) {
        if (existing.date !== dayKey) continue;
        if (!samePerson(c, existing.staffId, staffId)) continue;
        if (recordsOverlap(existing, proposed, dayModel) && !seen.has(existing.id)) {
          seen.add(existing.id);
          conflicts.push(existing);
        }
      }
    }
  }
  conflicts.sort((a, b) =>
    `${a.date}|${a.staffId}|${a.id}`.localeCompare(`${b.date}|${b.staffId}|${b.id}`),
  );
  return conflicts;
}

export async function buildConflictTokenAndSummary(
  schoolId,
  actorId,
  conflicts,
  records = [],
) {
  const revMap = new Map();
  for (const r of records) {
    if (r.collection === "absences") revMap.set(r.record_id, r.revision);
  }
  const summary = conflicts.map((a) => ({
    id: a.id,
    staffId: a.staffId,
    name: a.name || "",
    date: a.date,
    typeId: a.typeId,
    typeLabel: a.typeLabel || a.typeId,
    periods: Array.isArray(a.periods) ? [...a.periods].sort((x, y) => x - y) : [],
    coverage: a.coverage ? structuredClone(a.coverage) : null,
    reliefRequired: a.reliefRequired !== false,
    reasonDetail: a.reasonDetail || "",
    updatedAt: a.updatedAt || a.reportedAt || "",
    recordRevision: revMap.get(a.id) ?? 0,
  }));
  const conflictToken = await digest({
    schema: 1,
    schoolId,
    actorId,
    conflicts: summary,
  });
  return { conflictToken, conflicts: summary };
}

function assertAuthorizedToReplace(c, conflicts) {
  const privileged = c.user?.smc === true || c.user?.admin === true;
  if (privileged) return;
  for (const a of conflicts) {
    if (a.staffId !== c.user?.staffId) {
      throw new ApiError(
        "CAPABILITY_DENIED",
        403,
        "You are not authorized to replace another teacher's absence.",
      );
    }
  }
}

function cancelAffectedFutureAssignments(state, c, supersededIds) {
  const supersededSet = new Set(supersededIds);
  const cancelledIds = [];
  for (const assignment of state.assignments || []) {
    const tiedIds = [assignment.absenceId, ...(assignment.absenceIds || [])].filter(
      Boolean,
    );
    if (!tiedIds.some((id) => supersededSet.has(id))) continue;
    // Never cancel already completed duties or already cancelled assignments.
    if (
      assignment.status === "cancelled" ||
      assignment.status === "completed" ||
      assignment.completedAt
    ) {
      continue;
    }
    // Preserve relief whose period has already started.
    if (Allocation.periodStarted(c, assignment.date, assignment.period, assignment)) {
      continue;
    }
    // If assignment also covers a surviving unrelated absence, keep it intact.
    const hasSurvivingAbsence = tiedIds.some((id) => {
      if (supersededSet.has(id)) return false;
      const abs = (state.absences || []).find((x) => x.id === id);
      return abs && !abs.deletedAt;
    });
    if (hasSurvivingAbsence) continue;

    assignment.status = "cancelled";
    assignment.cancelledAt = c.iso;
    assignment.cancelledBy = c.user.email;
    assignment.cancellationReason =
      "Superseded by confirmed replacement absence.";
    cancelledIds.push(assignment.id);
  }
  return cancelledIds;
}

export function applyConfirmedReplacementToState(
  next,
  c,
  body,
  conflicts,
  opId,
  conflictToken,
  safeLegacyError,
) {
  const supersededIds = conflicts.map((a) => a.id);
  const supersededSet = new Set(supersededIds);
  for (const a of next.absences || []) {
    if (!supersededSet.has(a.id)) continue;
    a.deletedAt = c.iso;
    a.deletedBy = c.user.email;
    a.supersededByOperationId = opId;
    a.supersededReason = "Confirmed replacement absence";
  }
  const cancelledAssignmentIds = cancelAffectedFutureAssignments(
    next,
    c,
    supersededIds,
  );
  const applyContext = {
    ...c,
    resubmission: false,
    intakeDeduplicate: false,
  };
  const applyInput = {
    ...body,
    operation: "saveAbsence",
    requestId: opId,
  };
  let result;
  try {
    result = Operations.apply(next, applyContext, applyInput);
  } catch (error) {
    throw safeLegacyError(error);
  }
  next.audit = next.audit || [];
  next.audit.push({
    id: c.uuid(),
    at: c.iso,
    actor: c.user.email,
    operation: "saveAbsenceConfirmedReplacement",
    date: body.date || body.from || c.today,
    supersededIds,
    savedIds: result.savedIds || [],
    cancelledAssignmentIds,
    conflictToken,
  });
  return {
    ...result,
    replacedIds: supersededIds,
    cancelledAssignmentIds,
    confirmedReplacement: true,
    conflictToken,
  };
}

function sanitizeIntakeCommand(body) {
  const allowed = [
    "date",
    "from",
    "to",
    "dates",
    "staffId",
    "staffIds",
    "typeId",
    "periods",
    "coverage",
    "fullDay",
    "selectAll",
    "reasonDetail",
    "remarks",
    "reliefRequired",
    "instructionsByDate",
    "instructionsByStaffDate",
    "instructionsNA",
    "expectedInstructionScopes",
    "ownArrangementsByStaffDate",
  ];
  const command = { operation: "saveAbsence" };
  for (const key of allowed) {
    if (body[key] !== undefined) command[key] = structuredClone(body[key]);
  }
  return command;
}

function clashConflictResponse(code, message, { conflictChanged = false, conflictToken, conflicts }) {
  return Response.json(
    {
      ok: false,
      error: {
        code,
        message,
        retryable: false,
        details: {
          confirmationRequired: true,
          ...(conflictChanged ? { conflictChanged: true } : {}),
          conflictToken,
          conflicts,
        },
      },
    },
    {
      status: 409,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function prepareSaveAbsenceClashCheck(
  ctx,
  loaded,
  c,
  body,
  safeLegacyError,
) {
  if (body.id) {
    return { mode: "direct", conflicts: [] };
  }
  const conflicts = findConflictingAbsences(loaded.state, c, body);
  if (!conflicts.length) {
    return { mode: "direct", conflicts: [] };
  }

  const schoolId = ctx.principal.schoolId;
  const actorId = ctx.principal.actorId;

  // Enforce authorization before exposing conflict details or persisting intake.
  assertAuthorizedToReplace(c, conflicts);

  // Validate the proposed new absence against a clone where only conflicting rows are removed.
  // Invalid replacements must fail cleanly without prompting or modifying stored records.
  const probeState = structuredClone(loaded.state);
  const conflictIdSet = new Set(conflicts.map((a) => a.id));
  for (const a of probeState.absences || []) {
    if (conflictIdSet.has(a.id)) a.deletedAt = c.iso;
  }
  try {
    Operations.apply(
      probeState,
      { ...c, resubmission: false, intakeDeduplicate: false },
      { ...body, operation: "saveAbsence", requestId: `validate:${crypto.randomUUID()}` },
    );
  } catch (error) {
    throw safeLegacyError(error);
  }

  const { conflictToken, conflicts: summary } =
    await buildConflictTokenAndSummary(
      schoolId,
      actorId,
      conflicts,
      loaded.records,
    );

  if (body.confirmReplace === true) {
    if (
      typeof body.conflictToken !== "string" ||
      body.conflictToken !== conflictToken
    ) {
      return clashConflictResponse(
        "ABSENCE_CLASH_CHANGED",
        "Conflicting absence records changed. Review the current conflicts and confirm again.",
        { conflictChanged: true, conflictToken, conflicts: summary },
      );
    }
    return { mode: "replace", conflicts, conflictToken, summary };
  }

  if (body.intake === true) {
    return { mode: "queueIntake", conflicts, conflictToken, summary };
  }

  return clashConflictResponse(
    "ABSENCE_CLASH_CONFIRM_REQUIRED",
    "This absence overlaps an existing entry. Confirm replacement to continue.",
    { conflictToken, conflicts: summary },
  );
}

export async function queueAbsenceIntakeClash(
  ctx,
  loaded,
  c,
  range,
  scope,
  revision,
  op,
  clash,
  { commit },
) {
  const schoolId = ctx.principal.schoolId;
  const intakeId = String(
    ctx.body.intakeRequestId || op.operationId,
  );
  const iso = new Date(ctx.now).toISOString();
  const record = {
    id: intakeId,
    requestId: intakeId,
    schoolId,
    actorId: ctx.principal.actorId,
    actorEmail: c.user.email,
    staffId: targetStaffIds(c, ctx.body)[0] || c.user.staffId,
    date: range.from,
    dates: range.dates,
    command: sanitizeIntakeCommand(ctx.body),
    intakeState: "needsReview",
    absenceApplied: false,
    conflictToken: clash.conflictToken,
    conflicts: clash.summary,
    createdAt: iso,
    updatedAt: iso,
  };
  const sc = scopeChange(schoolId, scope, revision);
  const output = {
    intakeReceipt: true,
    requestId: intakeId,
    intakeState: "needsReview",
    absenceApplied: false,
    confirmationRequired: true,
    conflictToken: clash.conflictToken,
    conflicts: clash.summary,
    revision: revision + 1,
    notificationsQueued: 0,
  };
  return commit(ctx, op, {
    dependencies: c.dependencies,
    guards: [sc.guard],
    writes: [
      sc.write,
      {
        sql: "INSERT INTO roster_records(school_id,collection,record_id,service_date,staff_id,year,revision,payload_json) VALUES(?,'absenceIntake',?,?,?,?,1,?) ON CONFLICT(school_id,collection,record_id) DO UPDATE SET revision=revision+1,payload_json=excluded.payload_json",
        args: [
          schoolId,
          intakeId,
          range.from,
          record.staffId || null,
          range.from.slice(0, 4),
          JSON.stringify({ kind: "map", data: record }),
        ],
      },
    ],
    result: output,
    audit: {
      operation: "queueAbsenceIntake",
      intakeId,
      date: range.from,
      conflictCount: clash.summary.length,
    },
  });
}

function parseIntakeRecord(row) {
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.payload_json);
    return parsed?.data || parsed;
  } catch {
    return null;
  }
}

export async function handleAbsenceIntakeOperation(
  ctx,
  opName,
  { context, prepared, commit, captureObservedQuotas, safeLegacyError },
) {
  const schoolId = ctx.principal.schoolId;
  const body = ctx.body;
  const intakeId = String(
    body.intakeRequestId || body.targetRequestId || body.id || body.requestId || "",
  ).trim();
  requireValue(
    intakeId && intakeId.length <= 200,
    "INTAKE_REQUEST_REQUIRED",
    400,
    "Specify the received absence report to update.",
  );

  const op = await prepared(ctx, `roster.${opName}`, {
    operation: opName,
    intakeRequestId: intakeId,
    resolution: body.resolution || null,
    conflictToken: body.conflictToken || null,
    confirmReplace: body.confirmReplace === true,
    reason: body.reason || "",
  });
  if (op.receipt) return { ...op.receipt.result, receipt: op.receipt };

  const existingRow = await one(
    ctx.env.DB,
    "SELECT record_id, revision, payload_json FROM roster_records WHERE school_id=? AND collection='absenceIntake' AND record_id=?",
    [schoolId, intakeId],
  );
  requireValue(
    existingRow,
    "INTAKE_NOT_FOUND",
    404,
    "Received absence report not found.",
  );
  const stored = parseIntakeRecord(existingRow);
  requireValue(stored && stored.command, "INTAKE_CORRUPT", 503);

  const isPrivileged =
    ctx.principal.capabilities.includes("admin") ||
    ctx.principal.capabilities.includes("roster.write") ||
    ctx.principal.capabilities.includes("roster.read");
  const isOwner = stored.actorId === ctx.principal.actorId;

  if (opName === "resolveAbsenceIntake") {
    const resolution = String(body.resolution || "").trim();
    requireValue(
      ["merge", "replace", "keep", "withdraw"].includes(resolution),
      "INVALID_INTAKE_RESOLUTION",
      400,
      "Choose a valid report resolution.",
    );
    if (!isPrivileged && !(isOwner && ["replace", "withdraw"].includes(resolution))) {
      throw new ApiError(
        "CAPABILITY_DENIED",
        403,
        "Only SMC or Admin can resolve another teacher's received report.",
      );
    }
    if (stored.intakeState === "applied" || stored.intakeState === "withdrawn") {
      throw new ApiError(
        "INTAKE_ALREADY_RESOLVED",
        409,
        "This received report has already been resolved.",
      );
    }

    const iso = new Date(ctx.now).toISOString();
    if (resolution === "withdraw" || resolution === "keep") {
      const reason = String(body.reason || "").trim().slice(0, 1000);
      if (resolution === "withdraw") {
        requireValue(
          reason.length > 0,
          "WITHDRAW_REASON_REQUIRED",
          400,
          "Enter a reason for withdrawing this report.",
        );
      }
      const updated = {
        ...stored,
        intakeState: "withdrawn",
        absenceApplied: false,
        resolution,
        reason,
        resolvedBy: ctx.principal.actorId,
        resolvedAt: iso,
        updatedAt: iso,
      };
      const output = {
        intakeReceipt: true,
        requestId: intakeId,
        intakeState: "withdrawn",
        absenceApplied: false,
        resolution,
        reason,
        resolvedAt: iso,
        notificationsQueued: 0,
      };
      return commit(ctx, op, {
        guards: [
          {
            sql: "SELECT revision=? AS ok FROM roster_records WHERE school_id=? AND collection='absenceIntake' AND record_id=?",
            args: [existingRow.revision, schoolId, intakeId],
          },
        ],
        writes: [
          {
            sql: "UPDATE roster_records SET revision=revision+1,payload_json=? WHERE school_id=? AND collection='absenceIntake' AND record_id=?",
            args: [
              JSON.stringify({ kind: "map", data: updated }),
              schoolId,
              intakeId,
            ],
          },
        ],
        result: output,
        audit: {
          operation: "resolveAbsenceIntake",
          intakeId,
          resolution,
          reason,
        },
      });
    }

    // resolution === "merge" || resolution === "replace"
    return applyQueuedIntakeAbsence(
      ctx,
      op,
      existingRow,
      stored,
      { resolution, requireConfirmationToken: true },
      { context, commit, captureObservedQuotas, safeLegacyError },
    );
  }

  // opName === "retryAbsenceIntake"
  if (!isPrivileged && !isOwner) {
    throw new ApiError(
      "CAPABILITY_DENIED",
      403,
      "You are not authorized to retry this absence report.",
    );
  }
  if (stored.intakeState === "applied") {
    return {
      intakeReceipt: true,
      requestId: intakeId,
      intakeState: "applied",
      absenceApplied: true,
      resolution: stored.resolution || "applied",
      savedIds: stored.savedIds || [],
      replacedIds: stored.replacedIds || [],
      alreadyApplied: true,
      notificationsQueued: 0,
    };
  }
  if (stored.intakeState === "withdrawn") {
    throw new ApiError(
      "INTAKE_ALREADY_WITHDRAWN",
      409,
      "This received report was already withdrawn.",
    );
  }

  return applyQueuedIntakeAbsence(
    ctx,
    op,
    existingRow,
    stored,
    {
      resolution: body.confirmReplace === true ? "replace" : "retry",
      requireConfirmationToken: body.confirmReplace === true,
      allowRequeueOnConflict: body.confirmReplace !== true,
    },
    { context, commit, captureObservedQuotas, safeLegacyError },
  );
}

async function applyQueuedIntakeAbsence(
  ctx,
  op,
  existingRow,
  stored,
  { resolution, requireConfirmationToken, allowRequeueOnConflict = false },
  { context, commit, captureObservedQuotas, safeLegacyError },
) {
  const schoolId = ctx.principal.schoolId;
  const cmd = stored.command;
  const range = requestedDates(cmd, ctx.now);
  const scope = "day:" + range.from;
  const revision = await scopeRevision(ctx.env.DB, schoolId, scope);
  const configRevision = await scopeRevision(ctx.env.DB, schoolId, "config");
  const loaded = await loadState(ctx.env.DB, schoolId, range, {});
  loaded.state.revision = revision;
  const c = await context({ ...ctx, body: cmd }, loaded, range);

  const conflicts = findConflictingAbsences(loaded.state, c, cmd);
  const { conflictToken, conflicts: summary } =
    await buildConflictTokenAndSummary(
      schoolId,
      ctx.principal.actorId,
      conflicts,
      loaded.records,
    );

  if (conflicts.length > 0) {
    assertAuthorizedToReplace(c, conflicts);
    const tokenMatches =
      typeof ctx.body.conflictToken === "string" &&
      ctx.body.conflictToken === conflictToken;

    if (allowRequeueOnConflict && !tokenMatches) {
      const iso = new Date(ctx.now).toISOString();
      const conflictChanged = conflictToken !== stored.conflictToken;
      const updated = {
        ...stored,
        conflictToken,
        conflicts: summary,
        updatedAt: iso,
      };
      const output = {
        intakeReceipt: true,
        requestId: stored.id,
        intakeState: "needsReview",
        absenceApplied: false,
        confirmationRequired: true,
        conflictChanged,
        conflictToken,
        conflicts: summary,
        revision,
        notificationsQueued: 0,
      };
      return commit(ctx, op, {
        dependencies: c.dependencies,
        guards: [
          {
            sql: "SELECT revision=? AS ok FROM roster_records WHERE school_id=? AND collection='absenceIntake' AND record_id=?",
            args: [existingRow.revision, schoolId, stored.id],
          },
        ],
        writes: [
          {
            sql: "UPDATE roster_records SET revision=revision+1,payload_json=? WHERE school_id=? AND collection='absenceIntake' AND record_id=?",
            args: [
              JSON.stringify({ kind: "map", data: updated }),
              schoolId,
              stored.id,
            ],
          },
        ],
        result: output,
        audit: {
          operation: "retryAbsenceIntakeNeedsReview",
          intakeId: stored.id,
          conflictChanged,
        },
      });
    }

    if (requireConfirmationToken && !tokenMatches) {
      return clashConflictResponse(
        "ABSENCE_CLASH_CHANGED",
        "Conflicting absence records changed. Review the current conflicts and confirm again.",
        { conflictChanged: true, conflictToken, conflicts: summary },
      );
    }
  }

  const beforeOutbox = new Set(loaded.state.outbox.map((j) => j.id));
  const next = structuredClone(loaded.state);
  let applyResult;
  if (conflicts.length > 0) {
    applyResult = applyConfirmedReplacementToState(
      next,
      c,
      cmd,
      conflicts,
      op.operationId,
      conflictToken,
      safeLegacyError,
    );
  } else {
    try {
      applyResult = Operations.apply(
        next,
        { ...c, resubmission: false, intakeDeduplicate: false },
        { ...cmd, operation: "saveAbsence", requestId: op.operationId },
      );
    } catch (error) {
      throw safeLegacyError(error);
    }
  }

  const iso = new Date(ctx.now).toISOString();
  const updatedIntake = {
    ...stored,
    intakeState: "applied",
    absenceApplied: true,
    resolution,
    savedIds: applyResult.savedIds || [],
    replacedIds: applyResult.replacedIds || [],
    resolvedBy: ctx.principal.actorId,
    resolvedAt: iso,
    updatedAt: iso,
  };
  next.absenceIntake = next.absenceIntake || {};
  next.absenceIntake[stored.id] = updatedIntake;

  const quotaPlan = await captureObservedQuotas(ctx, loaded, next, c);
  const change = await recordChanges(
    schoolId,
    loaded.before,
    next,
    loaded.records,
  );
  const sc = scopeChange(schoolId, scope, revision);
  accountingChanges(schoolId, loaded, change, {
    forceWeeks: quotaPlan.writes.length ? [weekOf(range.from)] : [],
  });
  change.guards.push(
    scopeChange(schoolId, "config", configRevision).guard,
    ...quotaPlan.guards,
    sc.guard,
    {
      sql: "SELECT revision=? AS ok FROM roster_records WHERE school_id=? AND collection='absenceIntake' AND record_id=?",
      args: [existingRow.revision, schoolId, stored.id],
    },
  );
  change.writes.push(...quotaPlan.writes, sc.write);

  const outbox = next.outbox
    .filter((j) => !beforeOutbox.has(j.id))
    .map((j) => ({
      id: j.id,
      type: "roster-notification",
      payload: { ...j, decisionId: ctx.principal.decisionId },
      dueAt: j.dueAt || ctx.now,
    }));

  const output = {
    intakeReceipt: true,
    requestId: stored.id,
    intakeState: "applied",
    absenceApplied: true,
    resolution,
    savedIds: applyResult.savedIds || [],
    savedId: applyResult.savedId || null,
    replacedIds: applyResult.replacedIds || [],
    revision: revision + 1,
    acceptedRevision: revision + 1,
    notificationsQueued: outbox.length,
  };
  return commit(ctx, op, {
    dependencies: c.dependencies,
    guards: [...change.guards, ...(c.localGuards || [])],
    writes: change.writes,
    result: output,
    audit: {
      operation: `absenceIntake.${resolution}`,
      intakeId: stored.id,
      date: range.from,
      savedIds: output.savedIds,
      replacedIds: output.replacedIds,
    },
    outbox,
  });
}
