import Operations from "../../../shared/roster-operations.js";
import {
  canonical,
  digest,
  one,
  statement,
  prepareOperation,
  commitOperation,
} from "../../runtime/store.mjs";
import { requireValue } from "../../runtime/errors.mjs";
import {
  loadState,
  recordChanges,
  accountingChanges,
  weekOf,
  scopeRevision,
  scopeChange,
} from "./repository.mjs";
const encoded = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const decoded = (value) =>
  Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
async function key(env) {
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(env.GSIS_SECRET),
    ),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
async function protect(env, token) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    bytes = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await key(env),
      new TextEncoder().encode(token),
    );
  return canonical({ iv: encoded(iv), cipher: encoded(new Uint8Array(bytes)) });
}
async function reveal(env, value) {
  const p = JSON.parse(value);
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decoded(p.iv) },
      await key(env),
      decoded(p.cipher),
    ),
  );
}
async function version(state, cap) {
  if (cap.purpose === "mutual") {
    const request = state.requests.find(
      (r) =>
        r.id === cap.requestId &&
        r.recipientId === cap.staffId &&
        r.date === cap.date,
    );
    requireValue(request, "EXTERNAL_SCOPE_UNAVAILABLE", 409);
    return digest(request);
  }
  return digest({
    publication: state.dailyPublicationStates?.[cap.date] || null,
    snapshots: [...Operations.latestPublications(state).values()].filter(
      (v) => v.staffId === cap.staffId && v.date === cap.date,
    ),
  });
}
export async function issueLink(env, job, state, now) {
  const old = await one(
    env.DB,
    "SELECT * FROM roster_external_links WHERE school_id=? AND job_id=?",
    [job.school_id, job.job_id],
  );
  if (old)
    return {
      token: await reveal(env, old.token_cipher),
      expiresAt: old.expires_at,
    };
  const p = job.payload,
    purpose = p.kind === "mutual_request" ? "mutual" : "duties",
    request =
      purpose === "mutual"
        ? state.requests.find(
            (r) => r.id === (p.data?.peerRequestId || p.requestId),
          )
        : null;
  if (purpose === "mutual")
    requireValue(
      request?.recipientId === p.recipientId && request.status === "pending",
      "EXTERNAL_SCOPE_UNAVAILABLE",
      409,
    );
  const expiresAt = Math.min(
      now + 7 * 86400000,
      request?.expiresAt ?? Infinity,
    ),
    cap = {
      purpose,
      staffId: p.recipientId,
      date: p.date,
      expiresAt,
      ...(request ? { requestId: request.id } : {}),
    };
  cap.sourceRevision = await version(state, cap);
  const token = encoded(crypto.getRandomValues(new Uint8Array(32))),
    hash = await digest(token),
    cipher = await protect(env, token),
    op = await prepareOperation(env.DB, {
      schoolId: job.school_id,
      actorId: "roster-links",
      operationId: "link:" + job.job_id,
      action: "internal.roster.link",
      intent: {
        jobId: job.job_id,
        staffId: cap.staffId,
        date: cap.date,
        purpose,
      },
      now,
      validUntil: now + 60000,
    });
  await commitOperation(env.DB, op, {
    now,
    admission: {
      kind: "system",
      reason:
        "A committed recipient notification issues only its narrow expiring capability; current recipient and source are verified again on use.",
    },
    guards: [
      {
        sql: "SELECT NOT EXISTS(SELECT 1 FROM roster_external_links WHERE school_id=? AND job_id=?) AS ok",
        args: [job.school_id, job.job_id],
      },
    ],
    writes: [
      {
        sql: "INSERT INTO roster_external_links(school_id,token_hash,job_id,staff_id,purpose,service_date,source_revision,expires_at,capability_json,token_cipher,owner_operation_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        args: [
          job.school_id,
          hash,
          job.job_id,
          cap.staffId,
          purpose,
          cap.date,
          cap.sourceRevision,
          expiresAt,
          canonical(cap),
          cipher,
          job.operation_id,
        ],
      },
    ],
    result: { jobId: job.job_id, expiresAt },
    audit: {
      staffId: cap.staffId,
      purpose,
      date: cap.date,
      sourceRevision: cap.sourceRevision,
    },
  });
  const saved = await one(
    env.DB,
    "SELECT * FROM roster_external_links WHERE school_id=? AND job_id=?",
    [job.school_id, job.job_id],
  );
  return {
    token: await reveal(env, saved.token_cipher),
    expiresAt: saved.expires_at,
  };
}
export async function externalProof(ctx) {
  const { env, body, now } = ctx,
    row = await one(
      env.DB,
      "SELECT * FROM roster_external_links WHERE school_id=? AND token_hash=?",
      [env.SCHOOL_ID, body.tokenDigest],
    ),
    command = await one(
      env.DB,
      "SELECT * FROM roster_external_commands WHERE school_id=? AND operation_id=?",
      [env.SCHOOL_ID, body.operationId],
    );
  requireValue(
    row &&
      row.expires_at > now &&
      command &&
      command.token_hash === row.token_hash &&
      command.command_digest === body.commandDigest,
    "EXTERNAL_CAPABILITY_INVALID",
    403,
  );
  const source = await one(
    env.DB,
    "SELECT state FROM product_operations WHERE school_id=? AND operation_id=?",
    [env.SCHOOL_ID, row.owner_operation_id],
  );
  requireValue(
    source?.state === "committed",
    "EXTERNAL_SOURCE_UNCOMMITTED",
    403,
  );
  const activated = await one(
    env.DB,
    "SELECT 1 AS active FROM roster_records WHERE school_id=? AND collection='adhoc' AND staff_id=? AND service_date=? AND json_extract(payload_json,'$.data.deletedAt') IS NULL LIMIT 1",
    [env.SCHOOL_ID, row.staff_id, row.service_date],
  );
  return {
    dateActive: !!activated,
    schemaVersion: 1,
    schoolId: env.SCHOOL_ID,
    verified: true,
    staffId: row.staff_id,
    intendedStaffId: row.staff_id,
    purpose: row.purpose,
    date: row.service_date,
    sourceRevision: row.source_revision,
    resourceId: row.token_hash,
    expiresAt: row.expires_at,
    operationId: body.operationId,
    bodyDigest: command.command_digest,
    commandDigest: command.command_digest,
    action: "roster.own",
    write: JSON.parse(command.command_json).write,
    ownerOperationId: row.owner_operation_id,
  };
}
export async function external(
  ctx,
  { context, prepared, commit, captureObservedQuotas },
) {
  const { env, body, now } = ctx;
  requireValue(
    typeof body.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(body.token),
    "EXTERNAL_CAPABILITY_INVALID",
    403,
  );
  const tokenDigest = await digest(body.token),
    row = await one(
      env.DB,
      "SELECT * FROM roster_external_links WHERE school_id=? AND token_hash=?",
      [env.SCHOOL_ID, tokenDigest],
    );
  requireValue(row && row.expires_at > now, "EXTERNAL_CAPABILITY_INVALID", 403);
  const cap = JSON.parse(row.capability_json),
    write = ctx.method !== "GET",
    operationId = write
      ? body.operationId
      : "external-read:" +
        tokenDigest.slice(0, 32) +
        ":" +
        Math.floor(now / 30000);
  requireValue(
    typeof operationId === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9:_.\/-]{0,127}$/.test(operationId),
    "OPERATION_ID_REQUIRED",
  );
  const command = {
      operationId,
      tokenDigest,
      write,
      ...(write
        ? cap.purpose === "mutual"
          ? { decision: body.decision, reason: body.reason || "" }
          : {
              snapshotIds: body.snapshotIds || [],
              timetableNoticeId: body.timetableNoticeId ?? null,
            }
        : {}),
    },
    commandDigest = await digest(command),
    previous = await one(
      env.DB,
      "SELECT command_digest FROM roster_external_commands WHERE school_id=? AND operation_id=?",
      [env.SCHOOL_ID, operationId],
    );
  requireValue(
    !previous || previous.command_digest === commandDigest,
    "OPERATION_INTENT_CONFLICT",
    409,
  );
  await statement(
    env.DB,
    "INSERT OR IGNORE INTO roster_external_commands(school_id,operation_id,token_hash,command_digest,command_json) VALUES(?,?,?,?,?)",
    [
      env.SCHOOL_ID,
      operationId,
      tokenDigest,
      commandDigest,
      canonical(command),
    ],
  ).run();
  requireValue(
    env.CORE_EXTERNAL?.authorizeCapability,
    "EXTERNAL_AUTHORITY_NOT_CONFIGURED",
    503,
  );
  const principal = await env.CORE_EXTERNAL.authorizeCapability({
    schoolId: env.SCHOOL_ID,
    tokenDigest,
    operationId,
    commandDigest,
    bodyDigest: commandDigest,
    now,
  });
  requireValue(
    principal.staffId === cap.staffId && principal.schoolId === env.SCHOOL_ID,
    "EXTERNAL_RECIPIENT_CHANGED",
    403,
  );
  const local = { ...ctx, principal, body: command },
    op = write ? await prepared(local, "roster.external", command) : null;
  if (op?.receipt) return { ...op.receipt.result, receipt: op.receipt };
  requireValue(
    !row.consumed_operation_id || row.consumed_operation_id === operationId,
    "EXTERNAL_CAPABILITY_CONSUMED",
    409,
  );
  const range = { from: cap.date, to: cap.date, dates: [cap.date] },
    revision = await scopeRevision(env.DB, env.SCHOOL_ID, "day:" + cap.date),
    loaded = await loadState(env.DB, env.SCHOOL_ID, range);
  requireValue(
    (await version(loaded.state, cap)) === row.source_revision,
    "EXTERNAL_SOURCE_CHANGED",
    409,
  );
  const c =
    cap.purpose === "mutual"
      ? await context(local, loaded, range, { needsQuota: write })
      : {
          user: {
            staffId: cap.staffId,
            email: principal.actorId,
            smc: false,
            admin: false,
          },
          now,
          iso: new Date(now).toISOString(),
          today: new Date(now + 28800000).toISOString().slice(0, 10),
          uuid: () => crypto.randomUUID(),
          dependencies: [],
          localGuards: [],
        };
  if (!write) {
    if (cap.purpose === "mutual") {
      const r = loaded.state.requests.find((r) => r.id === cap.requestId);
      return {
        purpose: cap.purpose,
        date: cap.date,
        expiresAt: row.expires_at,
        sourceRevision: row.source_revision,
        request: {
          id: r.id,
          date: r.date,
          status: r.status,
          lessons: r.lessons,
          combination: r.combination,
          requesterName:
            c.people.find((p) => p.id === r.requesterId)?.name || "",
        },
      };
    }
    return {
      purpose: cap.purpose,
      date: cap.date,
      expiresAt: row.expires_at,
      sourceRevision: row.source_revision,
      projection: Operations.resolveDutiesCapability(loaded.state, cap, now)
        .projection,
    };
  }
  const next = structuredClone(loaded.state);
  let result;
  if (cap.purpose === "mutual")
    result = Operations.apply(next, c, {
      operation: "respondMutual",
      id: cap.requestId,
      date: cap.date,
      decision: command.decision,
      reason: command.reason,
    });
  else
    result = Operations.acknowledgeDutiesCapability(next, c, cap, {
      snapshotIds: command.snapshotIds,
      ...(command.timetableNoticeId
        ? { timetableNoticeId: command.timetableNoticeId }
        : {}),
    });
  const quotaPlan = await captureObservedQuotas(local, loaded, next, c),
    change = await recordChanges(
      env.SCHOOL_ID,
      loaded.before,
      next,
      loaded.records,
    ),
    sc = scopeChange(env.SCHOOL_ID, "day:" + cap.date, revision);
  accountingChanges(env.SCHOOL_ID, loaded, change, {
    forceWeeks: quotaPlan.writes.length ? [weekOf(cap.date)] : [],
  });
  change.guards.push(...quotaPlan.guards);
  change.writes.push(...quotaPlan.writes);
  change.guards.push(sc.guard, {
    sql: "SELECT source_revision=? AND expires_at>? AND consumed_operation_id IS NULL AS ok FROM roster_external_links WHERE school_id=? AND token_hash=?",
    args: [row.source_revision, now, env.SCHOOL_ID, tokenDigest],
  });
  change.writes.push(sc.write, {
    sql: "UPDATE roster_external_links SET consumed_operation_id=? WHERE school_id=? AND token_hash=?",
    args: [operationId, env.SCHOOL_ID, tokenDigest],
  });
  const old = new Set(loaded.state.outbox.map((j) => j.id)),
    outbox = next.outbox
      .filter((j) => !old.has(j.id))
      .map((j) => ({
        id: j.id,
        type: "roster-notification",
        payload: JSON.parse(JSON.stringify(j)),
        dueAt: j.dueAt || now,
      }));
  return commit(local, op, {
    dependencies: c.dependencies,
    guards: [...change.guards, ...c.localGuards],
    writes: change.writes,
    result: {
      ...result,
      recorded: true,
      purpose: cap.purpose,
      date: cap.date,
      revision: revision + 1,
    },
    audit: {
      staffId: cap.staffId,
      purpose: cap.purpose,
      sourceRevision: row.source_revision,
    },
    outbox,
  });
}
