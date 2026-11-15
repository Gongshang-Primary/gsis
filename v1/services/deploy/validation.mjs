import { ApiError } from "../../runtime/errors.mjs";
export const fail = (code, message, status = 400) => {
  throw new ApiError(code, status, message, {
    retryable: status === 409 || status === 503,
  });
};
export const check = (
  condition,
  message,
  code = "DEPLOY_INVALID",
  status = 400,
) => {
  if (!condition) fail(code, message, status);
};
export const isRecord = (x) =>
  !!x && typeof x === "object" && !Array.isArray(x);
export const id = (x, label = "ID") => {
  check(
    typeof x === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/.test(x),
    `Invalid ${label}.`,
  );
  return x;
};
export const text = (x, max = 160, empty = false) => {
  check(
    typeof x === "string" && x.length <= max && (empty || x.trim()),
    "Invalid text.",
  );
  return x.trim();
};
export const finite = (x, min = 0, max = 100000) => {
  check(
    typeof x === "number" && Number.isFinite(x) && x >= min && x <= max,
    "Invalid finite number.",
  );
  return x;
};
export const nullable = (x) =>
  x === "" || x === undefined || x === null ? null : finite(x);
export const bool = (x) => {
  check(
    x === true || x === false || x === "TRUE" || x === "FALSE",
    "Use TRUE or FALSE.",
  );
  return x === true || x === "TRUE";
};
export const date = (x) => {
  check(
    typeof x === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(x) &&
      new Date(x + "T00:00:00Z").toISOString().slice(0, 10) === x,
    "Invalid date.",
  );
  return x;
};
export const unique = (rows, key, label) => {
  const seen = new Set();
  for (const row of rows) {
    const value = key(row);
    check(!seen.has(value), `Duplicate ${label}.`);
    seen.add(value);
  }
  return seen;
};
export function plain(value, depth = 0) {
  check(depth < 20, "Payload nesting limit exceeded.");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number")
    return finite(value, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  if (typeof value === "string") {
    check(value.length <= 100000, "Text too large.");
    return value;
  }
  if (Array.isArray(value)) {
    check(value.length <= 5000, "Row limit exceeded.");
    return value.map((v) => plain(v, depth + 1));
  }
  check(isRecord(value), "Invalid payload.");
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    check(
      !["__proto__", "constructor", "prototype"].includes(key) &&
        key.length <= 160,
      "Invalid field.",
    );
    out[key] = plain(v, depth + 1);
  }
  return out;
}
