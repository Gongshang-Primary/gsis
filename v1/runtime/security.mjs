import { ApiError } from "./errors.mjs";
import { digest } from "./store.mjs";
import { serviceCall } from "./admission.mjs";
export {
  admit,
  resolveAdmission,
  serviceCall,
  inspectDecision,
  requireMembership,
} from "./admission.mjs";
export async function authorize(env, request, descriptor, now = Date.now()) {
  if (descriptor.public === true) return null;
  const service = descriptor.service ?? env.SERVICE_NAME;
  if (!service || !descriptor.action)
    throw new ApiError(
      "CAPABILITY_DENIED",
      403,
      "No permission policy exists for this operation.",
    );
  const cookie = request.headers.get("cookie") ?? "";
  const token =
    cookie
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("__Host-gsis_session="))
      ?.slice(20) ??
    request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token)
    throw new ApiError("SESSION_INVALID", 401, "Sign in to continue.");
  const input = {
    schoolId: env.SCHOOL_ID,
    sessionToken: token,
    csrfToken: request.headers.get("x-csrf-token"),
    origin: request.headers.get("origin"),
    previewAccountId: request.headers.get("x-gsis-preview-account") ?? null,
    descriptor: { ...descriptor, service },
    now,
  };
  if (service === "core") {
    const { authorizeCore } = await import("../services/core/service.mjs");
    return authorizeCore(env, input, now);
  }
  return serviceCall(env, "core", "/internal/authorize", input);
}
