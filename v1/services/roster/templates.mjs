import { requireValue } from "../../runtime/errors.mjs";

export function templateFor(env, key, data) {
  const configured = JSON.parse(env.WHATSAPP_TEMPLATES_JSON || "{}"),
    t = Array.isArray(configured)
      ? configured.find((t) => t.key === key)
      : configured[key];
  requireValue(t && typeof t.name === "string", "TEMPLATE_NOT_CONFIGURED", 503);
  const parameters = (t.parameters || []).map((field) => ({
    type: "text",
    text: String(data[field] ?? "").slice(0, 1000),
  }));
  // Approved v1 button templates (owner 21 Nov 2026) end their URL with the
  // private token. A static URL button needs no parameter. A template that
  // needs a token is never sent without one: that would give a dead button.
  const components = parameters.length ? [{ type: "body", parameters }] : [];
  if (t.button !== undefined) {
    requireValue(t.button === "token" || t.button === "static", "TEMPLATE_BUTTON_INVALID", 503);
    if (t.button === "token") {
      requireValue(
        typeof data.linkToken === "string" && /^[A-Za-z0-9._~-]{1,256}$/.test(data.linkToken),
        "TEMPLATE_LINK_UNAVAILABLE",
        503,
      );
      components.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: data.linkToken }],
      });
    }
  }
  return {
    name: t.name,
    language: { code: t.language || "en" },
    ...(components.length ? { components } : {}),
  };
}
