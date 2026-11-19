import { ApiError } from "../../runtime/errors.mjs";

export const REGISTER_COLUMNS = [
  "id", "unit", "name", "shortName", "capacity", "capacityBasis", "notes", "revision",
  "bookable", "special", "approvalMode", "open", "close", "bufferMinutes", "overlapGroup", "features", "aliases",
];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const check = (ok, message, code = "INVALID_REGISTER", status = 400) => {
  if (!ok) throw new ApiError(code, status, message);
};
const text = (value, field, max = 300, required = false) => {
  check(typeof value === "string" && value.length <= max && (!required || value.trim()), `${field} must be ${required ? "nonempty " : ""}text, at most ${max} characters.`);
  return value;
};
const defaults = {shortName: "", capacity: null, capacityBasis: "", notes: "", bookable: false, special: false, approvalMode: "immediate", open: "07:00", close: "18:00", bufferMinutes: 0, overlapGroup: "", features: [], aliases: []};

function workbookRows(workbook, schoolId) {
  check(workbook?.schemaVersion === 1 && workbook.metadata?.schemaVersion === 1 && workbook.metadata?.module === "venues-register" && workbook.metadata?.mode === "editable", "Use the physical room register workbook exported by Venues.");
  check(workbook.metadata.schoolId === schoolId, "This register workbook belongs to another school.", "SCHOOL_MISMATCH", 403);
  check(Object.keys(workbook.sheets || {}).join() === "Rooms", "The register workbook must contain exactly the Rooms worksheet.");
  const sheet = workbook.sheets.Rooms;
  check(Array.isArray(sheet.columns) && JSON.stringify(sheet.columns) === JSON.stringify(REGISTER_COLUMNS) && Array.isArray(sheet.rows), "Keep the exported Rooms columns and their order.");
  check(sheet.rows.length <= 1000 && sheet.rows.every(row => Array.isArray(row) && row.length === REGISTER_COLUMNS.length), "A room row has the wrong number of cells or the workbook has more than 1000 rows.");
  return sheet.rows.filter(row => row.some(value => value !== null && value !== "")).map(row => {
    check(row.length === REGISTER_COLUMNS.length, "A room row has the wrong number of cells.");
    const result = Object.fromEntries(REGISTER_COLUMNS.map((key, i) => [key, row[i]]));
    for (const key of ["shortName", "capacityBasis", "notes", "overlapGroup"]) result[key] ??= "";
    for (const key of ["features", "aliases"]) {
      check(result[key] === null || typeof result[key] === "string", `${key} must contain one value per line.`);
      result[key] = String(result[key] || "").split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    }
    return result;
  });
}

/** Merge only explicit allowed fields; neither omission nor an absent row deletes data. */
export function prepareRegisterImport(input, current, schoolId) {
  check(!(input.workbook && input.venues), "Choose one register input.");
  const rows = input.workbook ? workbookRows(input.workbook, schoolId) : input.venues;
  check(Array.isArray(rows) && rows.length > 0 && rows.length <= 1000, "Provide between 1 and 1000 physical rooms.");
  const existing = new Map(current.map(row => [row.id, row])), seen = new Set();
  const next = rows.map(row => {
    check(row && typeof row === "object" && !Array.isArray(row), "Every room must be a record.");
    check(Object.keys(row).every(key => REGISTER_COLUMNS.includes(key)), "Only physical room metadata and explicit booking policy fields may be imported.", "FIELD_DENIED", 403);
    check(typeof row.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(row.id) && !seen.has(row.id), "Every room needs a distinct permanent ID.");
    seen.add(row.id);
    const old = existing.get(row.id), revision = row.revision ?? 0;
    check(Number.isSafeInteger(revision) && revision >= 0 && revision === (old?.revision || 0), "A room changed since the preview. Reload the register and review again.", "REVISION_CONFLICT", 409);
    const value = {...defaults, ...(old || {}), ...row, revision};
    value.unit = own(row, "unit") ? row.unit : old?.unit || row.id;
    text(value.unit, "Unit", 128, true);
    check(!old || value.unit === old.unit, "An existing room's unit and permanent ID cannot change.", "IDENTITY_IMMUTABLE", 409);
    text(value.name, "Room name", 300, true);
    for (const key of ["shortName", "capacityBasis"]) text(value[key], key);
    text(value.overlapGroup, "overlapGroup", 100);
    text(value.notes, "Notes", 2000);
    check(value.capacity === null || Number.isSafeInteger(value.capacity) && value.capacity >= 0 && value.capacity <= 100000, "Capacity must be blank or a whole number from 0 to 100000.", "INVALID_CAPACITY");
    check(typeof value.bookable === "boolean" && typeof value.special === "boolean", "Bookable and special must be true or false.");
    check(["immediate", "approval"].includes(value.approvalMode), "Approval mode must be immediate or approval.");
    check([value.open, value.close].every(t => typeof t === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)) && value.open < value.close, "Opening and closing times must be ordered HH:MM values.");
    check(Number.isSafeInteger(value.bufferMinutes) && value.bufferMinutes >= 0 && value.bufferMinutes <= 120, "Buffer minutes must be a whole number from 0 to 120.");
    for (const key of ["features", "aliases"]) {
      check(Array.isArray(value[key]) && value[key].length <= (key === "features" ? 30 : 100), `${key} has too many entries.`);
      for (const item of value[key]) text(item, key, key === "features" ? 100 : 150, true);
      check(new Set(value[key]).size === value[key].length, `${key} must not contain duplicates.`);
    }
    return value;
  });
  const combined = new Map(existing);
  for (const value of next) combined.set(value.id, value);
  check(combined.size <= 1000, "The physical register supports at most 1000 rooms.", "BOUNDS_EXCEEDED", 413);
  const units = new Set(), aliases = new Map();
  for (const row of combined.values()) {
    check(!units.has(row.unit), "A unit already belongs to another permanent room ID. Review the identity instead of creating a duplicate.", "DUPLICATE_UNIT", 409);
    units.add(row.unit);
    for (const alias of row.aliases || []) {
      const key = alias.toLowerCase();
      check(!aliases.has(key) || aliases.get(key) === row.id, "A timetable alias already belongs to another physical room.", "AMBIGUOUS_ALIAS", 409);
      aliases.set(key, row.id);
    }
  }
  // Owner IDs, grants and other existing fields stay server-owned. Return a
  // bounded editable projection for preview, never send them back for acceptance.
  return next;
}

export function registerProjection(rooms, schoolId) {
  return {schemaVersion: 1, schoolId, columns: REGISTER_COLUMNS, venues: rooms.map(row => Object.fromEntries(REGISTER_COLUMNS.map(key => [key, own(row, key) ? row[key] : own(defaults, key) ? defaults[key] : ""]))) };
}
