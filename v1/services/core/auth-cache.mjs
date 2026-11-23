// Bounded validUntil-scoped in-isolate cache for Core -> Contacts derived authority reads (D01/D02).
// Never caches error/unavailable outcomes and never extends past validUntil or session expiry.

export const AUTH_CACHE_TTL_MS = 15000;
export const AUTH_CACHE_MAX_ENTRIES = 500;

const cachesByDb = new WeakMap();
const fallbackCache = new Map();

function storeFor(db) {
  if (!db || (typeof db !== "object" && typeof db !== "function")) {
    return fallbackCache;
  }
  let map = cachesByDb.get(db);
  if (!map) {
    map = new Map();
    cachesByDb.set(db, map);
  }
  return map;
}

function cacheKey(schoolId, staffId, sessionId) {
  return `${schoolId}\0${staffId}\0${sessionId}`;
}

export function computeAuthorityCacheExpiry(
  observation,
  read,
  sessionExpiresAt,
  now,
  ttlMs = AUTH_CACHE_TTL_MS,
) {
  let bound = Number.isFinite(sessionExpiresAt) ? sessionExpiresAt : 0;
  const activeUntil = observation?.eligibility?.employmentActive?.validUntil;
  if (typeof activeUntil === "number" && Number.isFinite(activeUntil)) {
    bound = Math.min(bound, activeUntil);
  }
  if (read?.fields && typeof read.fields === "object") {
    for (const f of Object.values(read.fields)) {
      const rec = f?.record;
      if (!rec) continue;
      if (typeof rec.validUntil === "number" && Number.isFinite(rec.validUntil)) {
        bound = Math.min(bound, rec.validUntil);
      }
      if (
        typeof rec.validFrom === "number" &&
        Number.isFinite(rec.validFrom) &&
        rec.validFrom > now
      ) {
        bound = Math.min(bound, rec.validFrom);
      }
    }
  }
  return Math.min(now + ttlMs, bound);
}

export function getCachedAuthority(db, { schoolId, staffId, sessionId }, now) {
  if (!schoolId || !staffId || !sessionId) return null;
  const map = storeFor(db);
  const key = cacheKey(schoolId, staffId, sessionId);
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    map.delete(key);
    return null;
  }
  // Refresh LRU order on hit.
  map.delete(key);
  map.set(key, entry);
  return {
    read: entry.read,
    observation: entry.observation,
    expiresAt: entry.expiresAt,
  };
}

export function setCachedAuthority(
  db,
  { schoolId, staffId, sessionId },
  { read, observation, expiresAt },
  now,
) {
  if (
    !schoolId ||
    !staffId ||
    !sessionId ||
    !read ||
    !observation ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now
  ) {
    return false;
  }
  const map = storeFor(db);
  const key = cacheKey(schoolId, staffId, sessionId);
  if (map.has(key)) map.delete(key);
  while (map.size >= AUTH_CACHE_MAX_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
  map.set(key, {
    schoolId,
    staffId,
    sessionId,
    read,
    observation,
    expiresAt,
  });
  return true;
}

export function invalidateAuthorityCache(
  db,
  { schoolId, staffId, sessionId } = {},
) {
  const map = storeFor(db);
  let invalidated = 0;
  for (const [key, entry] of map.entries()) {
    if (schoolId && entry.schoolId !== schoolId) continue;
    if (staffId && entry.staffId !== staffId) continue;
    if (sessionId && entry.sessionId !== sessionId) continue;
    map.delete(key);
    invalidated++;
  }
  return { invalidated };
}
