import { ApiError, errorResponse, readJson, readBytes } from "./errors.mjs";
import {
  authorize,
  requireMembership,
  resolveAdmission,
  serviceCall,
} from "./security.mjs";
import { digest, operationStatus, abortOperation, one } from "./store.mjs";
import { secretEquals, verifyWebhook } from "./providers.mjs";
import { systemPolicy, systemHandle } from "./operations.mjs";
import { outboxHealth } from "./jobs.mjs";
import { runDriveBackups } from "./drive-backup-jobs.mjs";
const DOMAINS = [
  "core",
  "contacts",
  "deploy",
  "roster",
  "calendar",
  "lord",
  "venues",
  "layout",
];
const AUTH_PATHS = new Set(["/config", "/login/start", "/login"]);
/** Only Service Bindings reach owners; public gateway never forwards /internal. */
export function domainWorker(service, module) {
  if (!DOMAINS.includes(service)) throw Error("Invalid service");
  return {
    async fetch(request, bindings, execution) {
      const requestId = crypto.randomUUID(),
        now = Date.now();
      let activeContext = null;
      try {
        const env = { ...bindings, SERVICE_NAME: service };
        await requireMembership(env, request);
        const url = new URL(request.url);
        const path = url.pathname;
        if (!env.SCHOOL_ID) throw new ApiError("SCHOOL_NOT_CONFIGURED", 503);
        const method = request.method;
        if (
          service === "roster" &&
          /^\/webhooks\/(whatsapp|telegram)$/.test(path)
        ) {
          const provider = path.split("/").pop();
          if (method === "GET" && provider === "whatsapp") {
            if (
              env.WEBHOOK_OWNER !== "v1" ||
              url.searchParams.get("hub.mode") !== "subscribe" ||
              !(await secretEquals(
                env.WHATSAPP_VERIFY_TOKEN ?? env.GSIS_SECRET,
                url.searchParams.get("hub.verify_token"),
              ))
            )
              throw new ApiError("WEBHOOK_INVALID", 403);
            const challenge = url.searchParams.get("hub.challenge") ?? "";
            if (!/^[A-Za-z0-9_-]{1,256}$/.test(challenge))
              throw new ApiError("WEBHOOK_INVALID", 400);
            return new Response(challenge, {
              headers: { "cache-control": "no-store" },
            });
          }
          if (method !== "POST") throw new ApiError("METHOD_NOT_ALLOWED", 405);
          const raw = await readBytes(request);
          await verifyWebhook(env, provider, request, raw);
          let body;
          try {
            body = JSON.parse(
              new TextDecoder("utf-8", { fatal: true }).decode(raw),
            );
          } catch {
            throw new ApiError("INVALID_JSON", 400);
          }
          if (!module.webhook)
            throw new ApiError("WEBHOOK_NOT_CONFIGURED", 503);
          const value = await module.webhook({
            env,
            request,
            path,
            method,
            body,
            provider,
            now,
            requestId,
            execution,
          });
          return Response.json(
            { ok: true, data: value },
            { headers: { "cache-control": "no-store" } },
          );
        }
        const body = ["GET", "HEAD"].includes(method)
          ? Object.fromEntries(url.searchParams)
          : await readJson(
              request,
              service === "lord" && path === "/photos"
                ? 3 * 1024 * 1024
                : 1048576,
            );
        if (body.schoolId !== undefined && body.schoolId !== env.SCHOOL_ID)
          throw new ApiError("SCHOOL_MISMATCH", 403);
        const ctx = {
          env,
          request,
          path,
          method,
          body,
          now,
          requestId,
          execution,
        };
        activeContext = ctx;
        let value;
        if (path.startsWith("/internal/")) {
          ctx.internal = true;
          ctx.principal = null;
          if (path === "/internal/operation-status")
            value = (await operationStatus(
              env.DB,
              env.SCHOOL_ID,
              body.operationId,
            )) ?? { state: "unknown", operationId: body.operationId };
          else if (path === "/internal/pins/cancellation") {
            const pin = await one(
              env.DB,
              "SELECT * FROM source_pins WHERE school_id=? AND pin_id=? AND state='held'",
              [env.SCHOOL_ID, body.pinId],
            );
            if (!pin) throw new ApiError("PIN_NOT_FOUND", 404);
            const pending = await one(
              env.DB,
              "SELECT operation_id FROM source_changes WHERE school_id=? AND scope=? AND state='pending' AND (operation_id<>? OR ?<>?)",
              [
                env.SCHOOL_ID,
                pin.scope,
                pin.operation_id,
                pin.destination,
                service,
              ],
            );
            if (!pending) throw new ApiError("CANCELLATION_NOT_REQUESTED", 409);
            value = {
              owner: service,
              pinId: pin.pin_id,
              schoolId: pin.school_id,
              destination: pin.destination,
              operationId: pin.operation_id,
              digest: pin.digest,
              fence: pin.fence,
              sourceOperationId: pending.operation_id,
            };
          } else if (path === "/internal/operation-abort") {
            if (
              !["core", "contacts", "deploy", "calendar"].includes(body.owner)
            )
              throw new ApiError("SERVICE_DENIED", 403);
            const proof = await serviceCall(
              env,
              body.owner,
              "/internal/pins/cancellation",
              { schoolId: env.SCHOOL_ID, pinId: body.pinId },
            );
            const op = await operationStatus(
              env.DB,
              env.SCHOOL_ID,
              body.operationId,
            );
            if (
              !op ||
              proof.destination !== service ||
              proof.operationId !== op.operationId ||
              proof.digest !== op.digest ||
              proof.fence !== (op.state === "aborted" ? op.fence - 1 : op.fence)
            )
              throw new ApiError("CANCELLATION_PROOF_INVALID", 403);
            value = ["committed", "aborted"].includes(op.state)
              ? op.receipt
              : await abortOperation(
                  env.DB,
                  op,
                  "SOURCE_CHANGE_CANCELLED",
                  Date.now(),
                );
            await resolveAdmission(env, env.DB, op, null, value, Date.now());
          } else value = await (module.internal ?? module.handle)(ctx);
        } else {
          const system = path.startsWith("/system/");
          const descriptor = system
            ? systemPolicy(method, path)
            : module.policy(method, path, body);
          if (
            descriptor.public === true &&
            !(
              (service === "core" && AUTH_PATHS.has(path)) ||
              (service === "layout" &&
                method === "GET" &&
                ["/public/campus", "/public-campus"].includes(path)) ||
              (service === "lord" && method === "GET" && path === "/board") ||
              (service === "lord" &&
                ["GET", "POST"].includes(method) &&
                path === "/auth/relief") ||
              (service === "roster" &&
                ["GET", "POST"].includes(method) &&
                path === "/external")
            )
          )
            throw new ApiError("CAPABILITY_DENIED", 403);
          const intent = { ...body };
          delete intent.requestId;
          Object.assign(descriptor, {
            service,
            operationId:
              body.operationId ??
              body.clientRequestId ??
              body.payload?.operationId ??
              body.requestId,
            bodyDigest: await digest(intent),
          });
          const rawCookie = request.headers.get("cookie") ?? "";
          const hasCoreSession =
            rawCookie
              .split(";")
              .some((s) => s.trim().startsWith("__Host-gsis_session=")) ||
            Boolean(request.headers.get("authorization"));
          const fallback =
            !system &&
            !descriptor.public &&
            !hasCoreSession &&
            typeof module.authorizeFallback === "function"
              ? await module.authorizeFallback(ctx, descriptor)
              : null;
          ctx.principal =
            fallback ?? (await authorize(env, request, descriptor, now));
          if (
            ctx.principal?.schoolId &&
            ctx.principal.schoolId !== env.SCHOOL_ID
          )
            throw new ApiError("SCHOOL_MISMATCH", 403);
          if (descriptor.write && ctx.principal?.impersonating)
            throw new ApiError("IMPERSONATION_DENIED", 403);
          value = await (system ? systemHandle : module.handle)(ctx);
        }
        if (value instanceof Response) return value;
        return Response.json(
          { ok: true, data: value },
          {
            headers: {
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
              "X-Request-Id": requestId,
            },
          },
        );
      } catch (error) {
        // A known rejected command must not leave a prepared writer pinning authority forever.
        // Unknown storage outcomes remain recoverable; an abort is itself an atomic fence.
        const c = activeContext,
          id =
            c?.body?.operationId ??
            c?.body?.clientRequestId ??
            c?.body?.payload?.operationId;
        if (
          c?.principal &&
          id &&
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        ) {
          try {
            const op = await operationStatus(
              c.env.DB,
              c.principal.schoolId,
              id,
            );
            if (
              error.code !== "OPERATION_INTENT_CONFLICT" &&
              op?.actorId === c.principal.actorId &&
              op.requestDigest === c.principal.requestDigest &&
              op.authorityAction === c.principal.action
            ) {
              if (op.state === "committed")
                return Response.json(
                  { ok: true, data: op.receipt },
                  { headers: { "cache-control": "no-store" } },
                );
              if (op.state === "prepared") {
                const outcome = await abortOperation(
                  c.env.DB,
                  op,
                  error.code,
                  Date.now(),
                );
                await resolveAdmission(
                  c.env,
                  c.env.DB,
                  op,
                  null,
                  outcome,
                  Date.now(),
                );
              }
            }
          } catch {
            return errorResponse(
              new ApiError(
                "RECOVERY_PENDING",
                503,
                "The operation needs confirmation using its original reference.",
              ),
              requestId,
            );
          }
        }
        return errorResponse(error, requestId);
      }
    },
    async scheduled(event, bindings, execution) {
      // Backups have their own explicit cutover switch, separate from messaging.
      // Catch-up rotates bounded owner datasets; daily verification is due at
      // 23:50 SGT and is completed by these resumable runs.
      const backupEnv = { ...bindings, SERVICE_NAME: service };
      if (bindings.DRIVE_BACKUP_ENABLED === "true") {
        const task = runDriveBackups(backupEnv, Date.now()).catch(() => undefined);
        if (execution?.waitUntil) execution.waitUntil(task); else await task;
      }
      if (bindings.SCHEDULER_OWNER !== "v1") return;
      if (module.scheduled)
        await module.scheduled({
          env: { ...bindings, SERVICE_NAME: service },
          now: Date.now(),
          event,
          execution,
        });
    },
  };
}
