/** Pure v1 period policy shared by the owner Worker, editor and Excel adapter. */
export const STANDARD_SUBJECTS = Object.freeze([
  "Assembly", "FTGP", "FTT", "EL", "Math", "Science", "PHE", "Art", "Music", "PAL",
  "LSP", "FEL", "LSM", "FMA", "CCE", "MTSP", "FSC", "CL", "ML", "TL", "HCL", "HML", "HTL", "FCL", "FML", "FTL",
]);
const references = new Set(["FT", "FORM", "PD", "TTT"]);
const components = new Set(["ASSEMBLY", "FTGP", "FTT", "DUTY", "DUTIES"]);
const code = value => String(value).trim().toUpperCase();
export const isReferenceSubject = value => references.has(code(value));
export function validSubject(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 60 &&
    !/[\x00-\x1f\x7f]/.test(value) && !["__proto__", "prototype", "constructor"].includes(value);
}
export function parseLoad(value) {
  if (value === null) return null;
  if (typeof value === "string") {
    value = value.trim();
    if (!value || /^(?:n\/a|\(n\/a\))$/i.test(value)) return null;
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw Error("Enter n/a or 0–100 in half-period increments.");
    value = Number(value);
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100 || !Number.isInteger(value * 2))
    throw Error("Enter n/a or 0–100 in half-period increments.");
  return value;
}
// Unknown historical input stays visible for correction; it is never zeroed.
export function storedLoad(value) {
  try { return parseLoad(value); } catch { return value; }
}
export function knownLoadSubject(doc, subject) {
  return validSubject(subject) && !isReferenceSubject(subject) &&
    (STANDARD_SUBJECTS.includes(subject) || Object.values(doc.loads || {}).some(row => Object.hasOwn(row, subject)));
}
export function readLoad(doc, level, subject) {
  const row = doc.loads?.[String(level)];
  return row && Object.hasOwn(row, subject) ? storedLoad(row[subject]) : null;
}
export function legacyFormUsed(doc) {
  return [...(doc.assignments || []), ...(doc.groups || [])].some(row => code(row.subject || "") === "FORM");
}
/** A derived view only: saves continue to compare and update raw owning rows. */
export function planningView(doc) {
  const used = legacyFormUsed(doc), observed = new Set(Object.values(doc.loads || {}).flatMap(Object.keys));
  const alternate = { Science: "Sci", Sci: "Science", PHE: "PE", PE: "PHE" };
  const union = new Set(STANDARD_SUBJECTS.filter(subject => !alternate[subject] || !observed.has(alternate[subject]) || observed.has(subject)));
  for (const row of Object.values(doc.loads || {})) for (const subject of Object.keys(row))
    if (code(subject) !== "FT" && (code(subject) !== "FORM" || used)) union.add(subject);
  const loads = Object.fromEntries(Object.entries(doc.loads || {}).map(([level, row]) => [level,
    // Do not create a second explicit spelling beside an existing aSc alias.
    // Conflicting aliases already stored remain visible for reconciliation.
    Object.fromEntries([...union].filter(subject => !alternate[subject] || Object.hasOwn(row, subject) || !Object.hasOwn(row, alternate[subject]))
      .map(subject => [subject, Object.hasOwn(row, subject) ? storedLoad(row[subject]) : null])),
  ]));
  return { ...doc, loads };
}
export function loadRows(doc) {
  return Object.entries(planningView(doc).loads).flatMap(([level, row]) => Object.entries(row)
    .filter(([subject]) => !isReferenceSubject(subject)).map(([subject, value]) => [level, subject, value]));
}
export function parseSplit(value, field) {
  if (field === "enabled") {
    if (typeof value !== "boolean") throw Error("Enabled must be an Excel boolean.");
    return value;
  }
  if (field === "remarks") {
    if (value === null || value === undefined) return "";
    if (typeof value !== "string" || value.length > 4000) throw Error("Remarks must be text up to 4000 characters.");
    return value;
  }
  if (!["wt", "wd", "ws", "ft", "fd", "fs"].includes(field)) throw Error("Invalid split field.");
  if (value === null || value === undefined || typeof value === "string" && !value.trim()) return "";
  if (typeof value === "string" && /^\d+$/.test(value.trim())) value = Number(value.trim());
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 200)
    throw Error("Split blocks must be whole numbers from 0 to 200.");
  return value;
}
export function storedSplit(value, field) {
  try { return parseSplit(value, field); } catch { return value; }
}
/** Mirrors the teaching rows of the existing editor, including TG-only codes. */
export function fortnightRows(doc, workload) {
  const view = planningView(doc);
  return loadRows(view).filter(([level, subject, total]) => !components.has(code(subject)) &&
    workload.category(view, subject) === "Teaching" && typeof total === "number" && Number.isFinite(total))
    .map(([level, subject, total]) => ({ level, subject, total, key: JSON.stringify([level, subject]) }));
}
export const SUBJECT_LOAD_ALIASES = Object.freeze({
  Science: "Sci",
  Sci: "Science",
  PHE: "PE",
  PE: "PHE",
});
// Canonical load keys expected by shared/workload.js aliases() (Science -> Sci, PE -> PHE).
const CANONICAL_LOAD_PAIRS = Object.freeze([
  ["Sci", "Science"],
  ["PHE", "PE"],
]);
/**
 * Derived workload calculation view that aligns subject load alias keys
 * (Science -> Sci, PE -> PHE) with shared/workload.js aliases() without
 * mutating saved Deploy rows or double-counting planned demand.
 * - Exact canonical key wins when only it is present.
 * - Alternate spelling (e.g. Science) promotes to canonical key (Sci) when canonical is absent.
 * - Conflicting aliases on the same level are nulled so Workload flags them incomplete rather than guessing.
 */
export function workloadAliasView(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const rawLoads = doc.loads || {};
  const loads = {};
  for (const [level, rawRow] of Object.entries(rawLoads)) {
    const row = { ...(rawRow || {}) };
    for (const [canonicalKey, altKey] of CANONICAL_LOAD_PAIRS) {
      const hasCanonical = Object.hasOwn(row, canonicalKey);
      const hasAlt = Object.hasOwn(row, altKey);
      if (hasCanonical && hasAlt) {
        const vc = storedLoad(row[canonicalKey]);
        const va = storedLoad(row[altKey]);
        row[canonicalKey] = vc === va ? vc : null;
        delete row[altKey];
      } else if (!hasCanonical && hasAlt) {
        row[canonicalKey] = storedLoad(row[altKey]);
        delete row[altKey];
      }
    }
    loads[level] = row;
  }
  let workload = doc.workload;
  if (workload?.categories && typeof workload.categories === "object") {
    const categories = { ...workload.categories };
    for (const [canonicalKey, altKey] of CANONICAL_LOAD_PAIRS) {
      if (!Object.hasOwn(categories, canonicalKey) && Object.hasOwn(categories, altKey)) {
        categories[canonicalKey] = categories[altKey];
      }
    }
    workload = { ...workload, categories };
  }
  // shared/workload.js compares level-wide group subjects by exact spelling when
  // it decides whether class cells are already covered by the group. Give groups
  // the same canonical spelling as the loads, or form demand is counted twice.
  const canonicalOf = new Map(CANONICAL_LOAD_PAIRS.map(([canonicalKey, altKey]) => [altKey, canonicalKey]));
  const groups = Array.isArray(doc.groups)
    ? doc.groups.map((g) => (g && canonicalOf.has(g.subject) ? { ...g, subject: canonicalOf.get(g.subject) } : g))
    : doc.groups;
  return { ...doc, loads, workload, groups };
}
