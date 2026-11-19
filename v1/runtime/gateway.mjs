import { ApiError, errorResponse } from "./errors.mjs";
const domains = new Set([
  "core",
  "contacts",
  "deploy",
  "roster",
  "calendar",
  "lord",
  "venues",
  "layout",
]);
const pages = new Set([
  "admin",
  "contacts",
  "deploy",
  "roster",
  "calendar",
  "layout",
  "venues",
  "lord",
  "overlord",
  "starlord",
]);
export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    try {
      const url = new URL(request.url),
        match = url.pathname.match(/^\/api\/([a-z]+)(\/.*)?$/);
      if (/^\/webhooks\/(whatsapp|telegram)$/.test(url.pathname)) {
        if (!env.GSIS_SECRET || !env.ROSTER?.fetch)
          throw new ApiError("SERVICE_NOT_CONFIGURED", 503);
        const headers = new Headers({ "x-gsis-secret": env.GSIS_SECRET });
        for (const key of [
          "content-type",
          "content-length",
          "x-hub-signature-256",
          "x-telegram-bot-api-secret-token",
        ]) {
          const v = request.headers.get(key);
          if (v) headers.set(key, v);
        }
        return env.ROSTER.fetch(
          new Request("https://gsis.internal" + url.pathname + url.search, {
            method: request.method,
            headers,
            body: ["GET", "HEAD"].includes(request.method)
              ? undefined
              : request.body,
            duplex: "half",
          }),
        );
      }
      if (match) {
        const rawService = match[1],
          rawPath = match[2] ?? "/";
        const whatsappAlias =
          rawService === "whatsapp" &&
          /^\/(?:media|reports)\/[^/]+$/.test(rawPath);
        const service = whatsappAlias ? "roster" : rawService,
          path = whatsappAlias ? "/whatsapp" + rawPath : rawPath;
        if (
          !domains.has(service) ||
          path.startsWith("/internal") ||
          /%2f|%5c|\.\./i.test(url.pathname)
        )
          throw new ApiError("NOT_FOUND", 404);
        if (!env.GSIS_SECRET || !env[service.toUpperCase()]?.fetch)
          throw new ApiError("SERVICE_NOT_CONFIGURED", 503);
        if (!["GET", "HEAD"].includes(request.method)) {
          if (whatsappAlias) throw new ApiError("METHOD_NOT_ALLOWED", 405);
          const origin = request.headers.get("origin");
          if (origin !== url.origin)
            throw new ApiError(
              "ORIGIN_DENIED",
              403,
              "Open this action from the GSiS page.",
            );
          const type = request.headers.get("content-type") ?? "";
          if (
            !type.startsWith("application/json") &&
            !path.startsWith("/photos")
          )
            throw new ApiError("CONTENT_TYPE_INVALID", 415);
        }
        const headers = new Headers();
        for (const key of [
          "cookie",
          "content-type",
          "content-length",
          "x-csrf-token",
          "if-none-match",
          "if-match",
          "range",
          "origin",
          "sec-fetch-site",
          "x-gsis-device-token",
          "x-gsis-external-token",
          "x-gsis-incident-token",
        ]) {
          const value = request.headers.get(key);
          if (value) headers.set(key, value);
        }
        // Preview selection is a request, never authority; Core verifies the real Admin session.
        const preview = request.headers.get("x-gsis-preview-account");
        if (preview) headers.set("x-gsis-preview-account", preview);
        headers.set("x-gsis-secret", env.GSIS_SECRET);
        return env[service.toUpperCase()].fetch(
          new Request("https://gsis.internal" + path + url.search, {
            method: request.method,
            headers,
            body: ["GET", "HEAD"].includes(request.method)
              ? undefined
              : request.body,
            redirect: "manual",
            duplex: "half",
          }),
        );
      }
      if (url.pathname.startsWith("/internal"))
        throw new ApiError("NOT_FOUND", 404);
      if (url.pathname === "/roster/external") {
        url.pathname += "/";
        return Response.redirect(url.toString(), 308);
      }
      const part = url.pathname.slice(1);
      if (pages.has(part)) {
        url.pathname += "/";
        return Response.redirect(url.toString(), 308);
      }
      if (!env.ASSETS?.fetch) throw new ApiError("ASSETS_NOT_CONFIGURED", 503);
      let response = await env.ASSETS.fetch(request);
      if (
        response.status === 404 &&
        !url.pathname.split("/").pop().includes(".")
      ) {
        const module = url.pathname.split("/")[1];
        url.pathname = pages.has(module)
          ? `/${module}/index.html`
          : "/index.html";
        response = await env.ASSETS.fetch(new Request(url, request));
      }
      const headers = new Headers(response.headers);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "same-origin");
      headers.set(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
      );
      headers.set("X-Frame-Options", "SAMEORIGIN");
      // Existing module renderers use inline scripts/styles. Restrict egress rather than silently breaking them.
      headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.googleusercontent.com; connect-src 'self' https://accounts.google.com; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'",
      );
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      return errorResponse(error, requestId);
    }
  },
};
