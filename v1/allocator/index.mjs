/** Pure, versioned relief allocator. Inputs and time are explicit; no storage or credentials. */
export const ENGINE_VERSION = "gsis-layered/1";
export const PREFERENCES = Object.freeze([
  "dailyCapacity",
  "alternatives",
  "weeklyRemaining",
  "rotation",
  "subjectMatch",
  "levelMatch",
]);
const clone = (x) => structuredClone(x);
const fail = (message) => {
  throw Object.assign(new Error(message), {
    code: "ALLOCATION_INPUT_INVALID",
    status: 400,
  });
};
const integer = (x, min = 0, max = 1000000) =>
  Number.isSafeInteger(x) && x >= min && x <= max;
const identity = (x) =>
  typeof x === "string" && /^[A-Za-z0-9][A-Za-z0-9:_.\/-]{0,127}$/.test(x);
const normal = (x) =>
  String(x ?? "")
    .normalize("NFKC")
    .trim()
    .toUpperCase();
export function matches(subject, patterns = []) {
  const name = normal(subject);
  return patterns.some((p) => {
    const value = normal(typeof p === "string" ? p : p.value);
    const wildcard =
      (typeof p === "string" || p.type === "wildcard") && value.includes("*");
    return wildcard
      ? new RegExp(
          "^" +
            value
              .split("*")
              .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
              .join(".*") +
            "$",
        ).test(name)
      : name === value;
  });
}
export function defaultPolicy() {
  const layer = (id, groups, spiral) => ({
    id,
    groups,
    spiral,
    maxTotal: 8,
    maxRelief: 3,
    maxConsecutive: 5,
    continuity: { PAL: 3, FORM: 2 },
    preferences: [...PREFERENCES],
  });
  return {
    schemaVersion: 1,
    version: "initial/1",
    layers: [
      layer(1, ["dailyAdhoc"], true),
      layer(2, ["FAJT", "SRE"], true),
      layer(3, ["EO"], false),
    ],
    noReliefSubjects: ["PD", "BLK", "BLOCK", "IMP"],
    consecutiveBreakSubjects: ["BLK"],
    sharedCoverSubjects: ["FORM"],
    employmentRestrictedPeriods: {
      FAJT: [0, 13, 14, 15, 16],
      SRE: [0, 13, 14, 15, 16],
    },
    maxComparisons: 50000,
  };
}
export function validatePolicy(value) {
  const p = clone(value ?? defaultPolicy());
  if (
    p.schemaVersion !== 1 ||
    !identity(p.version) ||
    !Array.isArray(p.layers) ||
    p.layers.length < 1 ||
    p.layers.length > 9
  )
    fail("Supply one to nine versioned layers.");
  const ids = new Set(),
    groups = new Set();
  for (const l of p.layers) {
    if (
      !integer(l.id, 1, 9) ||
      ids.has(l.id) ||
      !Array.isArray(l.groups) ||
      typeof l.spiral !== "boolean"
    )
      fail("Each layer must have a unique identity and groups.");
    ids.add(l.id);
    for (const g of l.groups) {
      if (!identity(g) || groups.has(g))
        fail("A group may belong to only one layer.");
      groups.add(g);
    }
    for (const key of ["maxTotal", "maxRelief", "maxConsecutive"])
      if (l[key] !== null && !integer(l[key], 1, 40))
        fail("Limits must be enabled positive period counts or null.");
    if (
      !l.continuity ||
      typeof l.continuity !== "object" ||
      Object.entries(l.continuity).some(([s, n]) => !s || !integer(n, 1, 40))
    )
      fail("Invalid continuity rules.");
    if (
      !Array.isArray(l.preferences) ||
      new Set(l.preferences).size !== l.preferences.length ||
      l.preferences.some((x) => !PREFERENCES.includes(x))
    )
      fail("Invalid preference order.");
  }
  for (const k of [
    "noReliefSubjects",
    "consecutiveBreakSubjects",
    "sharedCoverSubjects",
  ])
    if (
      !Array.isArray(p[k]) ||
      p[k].length > 100 ||
      p[k].some(
        (x) => typeof x !== "string" && (!x || typeof x.value !== "string"),
      )
    )
      fail("Invalid subject rules.");
  if (
    !p.employmentRestrictedPeriods ||
    Object.values(p.employmentRestrictedPeriods).some(
      (ps) => !Array.isArray(ps) || ps.some((x) => !integer(x, 0, 39)),
    )
  )
    fail("Invalid employment restrictions.");
  if (!integer(p.maxComparisons, 1, 1000000)) fail("Invalid search budget.");
  return p;
}
export function resolveLayer(person, policy) {
  if (person.dailyAdhoc === true && person.hasBaseline === false)
    return (
      policy.layers.find((l) => l.groups.includes("dailyAdhoc"))?.id ?? null
    );
  const employment = policy.layers.filter((l) =>
    l.groups.some((group) =>
      [person.employment, ...(person.employmentTags || [])].includes(group),
    ),
  );
  if (employment.length) return employment[0].id;
  const appointments = policy.layers.filter((l) =>
    (person.appointments || []).some((a) => l.groups.includes(a)),
  );
  if (appointments.length > 1)
    fail("A person resolves to conflicting appointment layers.");
  if (appointments.length) return appointments[0].id;
  return person.eo === true
    ? (policy.layers.find((l) => l.groups.includes("EO"))?.id ?? null)
    : null;
}
function validateSnapshot(s) {
  if (
    !s ||
    s.schemaVersion !== 1 ||
    !identity(s.schoolId) ||
    !identity(s.runId) ||
    typeof s.inputDigest !== "string" ||
    !s.inputDigest ||
    !/^20\d\d-\d\d-\d\d$/.test(s.date) ||
    !integer(s.observedAt, 0, Number.MAX_SAFE_INTEGER)
  )
    fail("Invalid allocation snapshot identity.");
  if (
    !Array.isArray(s.staff) ||
    s.staff.length > 512 ||
    !Array.isArray(s.demands) ||
    s.demands.length > 2000 ||
    !Array.isArray(s.assignments) ||
    s.assignments.length > 4000
  )
    fail("Allocation snapshot bounds exceeded.");
  const staff = new Set(),
    demands = new Set();
  for (const p of s.staff) {
    if (
      !identity(p.staffId) ||
      staff.has(p.staffId) ||
      typeof p.active !== "boolean" ||
      typeof p.eo !== "boolean" ||
      !Array.isArray(p.occupied) ||
      !Array.isArray(p.available) ||
      p.available.some((n) => !integer(n, 0, 39)) ||
      p.occupied.some((x) => !integer(x.period, 0, 39))
    )
      fail("Invalid or duplicate staff evidence.");
    staff.add(p.staffId);
  }
  for (const d of s.demands) {
    if (
      !identity(d.id) ||
      demands.has(d.id) ||
      !integer(d.period, 0, 39) ||
      typeof d.subject !== "string" ||
      !d.lessonId
    )
      fail("Invalid or duplicate demand.");
    demands.add(d.id);
  }
  for (const a of s.assignments)
    if (
      !identity(a.id) ||
      !staff.has(a.staffId) ||
      !integer(a.period, 0, 39) ||
      !identity(a.demandId)
    )
      fail("Invalid assignment.");
  return clone(s);
}
export function deriveDemands(lessons, absences, policy = defaultPolicy()) {
  if (
    !Array.isArray(lessons) ||
    lessons.length > 20000 ||
    !Array.isArray(absences)
  )
    fail("Invalid demand sources.");
  const absent = (id, p) =>
    absences.some(
      (a) => a.staffId === id && a.periods.includes(p) && !a.deletedAt,
    );
  const groups = new Map(),
    out = [];
  for (const l of lessons) {
    if (
      !identity(l.id) ||
      !integer(l.period, 0, 39) ||
      !Array.isArray(l.staffIds)
    )
      fail("Invalid effective lesson.");
    if (
      !l.staffIds.some((id) => absent(id, l.period)) ||
      matches(l.subject, policy.noReliefSubjects)
    )
      continue;
    if (matches(l.subject, policy.sharedCoverSubjects) && l.venueId) {
      const key = JSON.stringify([
        l.period,
        l.venueId,
        normal(l.subject),
        l.sharedGroupId || l.classId || l.groupId || l.id,
      ]);
      const g = groups.get(key) || { lessons: [], staff: new Set() };
      g.lessons.push(l);
      l.staffIds.forEach((id) => g.staff.add(id));
      groups.set(key, g);
    } else
      for (const id of l.staffIds.filter((id) => absent(id, l.period)))
        out.push({
          ...clone(l),
          id: l.id + ":" + id,
          lessonId: l.lessonId || l.id,
          absentStaffIds: [id],
        });
  }
  for (const [key, g] of groups) {
    if ([...g.staff].some((id) => !absent(id, g.lessons[0].period))) continue;
    const l = g.lessons[0];
    out.push({
      ...clone(l),
      id: l.id + ":shared",
      lessonId: l.lessonId || l.id,
      sharedKey: key,
      absentStaffIds: [...g.staff].sort(),
    });
  }
  return out;
}
function fixed(a, s, mode) {
  return (
    mode === "fill-only" ||
    a.protected === true ||
    ["manual", "smc", "peer", "mutual"].includes(a.origin) ||
    ["published", "completed"].includes(a.status) ||
    s.startedPeriods?.includes(a.period) ||
    a.endAt <= s.observedAt
  );
}
function blockKey(d) {
  return JSON.stringify([
    d.lessonId,
    d.classId || null,
    d.groupId || null,
    normal(d.subject),
    d.sharedKey || null,
  ]);
}
function consecutive(occupied, breaks) {
  let max = 0,
    run = 0,
    last = -2;
  for (const p of [...occupied].sort((a, b) => a - b)) {
    if (breaks.has(p)) {
      run = 0;
      last = p;
      continue;
    }
    run = p === last + 1 ? run + 1 : 1;
    max = Math.max(run, max);
    last = p;
  }
  return max;
}
function stateFor(p, assignments, policy) {
  const rel = assignments.filter((a) => a.staffId === p.staffId),
    occupied = new Set(
      p.occupied.filter((x) => x.occupied !== false).map((x) => x.period),
    );
  rel.forEach((a) => occupied.add(a.period));
  const breaks = new Set(
    p.occupied
      .filter((x) => matches(x.subject, policy.consecutiveBreakSubjects))
      .map((x) => x.period),
  );
  return { rel, occupied, breaks };
}
function quotaRemaining(p, state) {
  return p.dailyAdhoc === true && p.hasBaseline === false
    ? 40
    : p.weekly?.quality === "verified" && Number.isFinite(p.weekly.remaining)
      ? Math.max(
          0,
          p.weekly.remaining -
            state.rel.reduce((n, a) => n + (a.charge ?? 1), 0),
        )
      : null;
}
function eligibility(p, unit, assignments, s, policy, layer) {
  const reasons = [];
  const state = stateFor(p, assignments, policy),
    periods = unit.map((d) => d.period),
    remaining = quotaRemaining(p, state);
  if (
    p.active !== true &&
    !(
      p.dateActive === true &&
      p.dailyAdhoc === true &&
      p.adhocEligible === true
    )
  )
    reasons.push("inactive");
  if (
    p.eo !== true &&
    !(
      p.dailyAdhoc === true &&
      p.hasBaseline === false &&
      p.adhocEligible === true
    )
  )
    reasons.push("not-eligible-EO");
  if (!p.dailyAdhoc && p.hasBaseline === false) reasons.push("no-timetable");
  if (remaining === null) reasons.push("quota-unverified");
  else if (remaining < periods.length) reasons.push("quota-exhausted");
  if (periods.some((n) => !p.available.includes(n) || state.occupied.has(n)))
    reasons.push("unavailable");
  if (
    periods.some((n) =>
      s.absences?.some((a) => a.staffId === p.staffId && a.periods.includes(n)),
    )
  )
    reasons.push("absent");
  if (
    periods.some((n) =>
      s.peerReservations?.some(
        (a) =>
          a.staffId === p.staffId &&
          a.periods.includes(n) &&
          a.status === "pending",
      ),
    )
  )
    reasons.push("peer-reserved");
  if (
    periods.some((n) =>
      [p.employment, ...(p.employmentTags || [])].some((tag) =>
        (policy.employmentRestrictedPeriods[tag] || []).includes(n),
      ),
    )
  )
    reasons.push("employment-period");
  if (periods.some((n) => s.startedPeriods?.includes(n)))
    reasons.push("started");
  if (p.exempt === true) reasons.push("exempt");
  const final = new Set([...state.occupied, ...periods]);
  if (layer.maxTotal !== null && final.size > layer.maxTotal)
    reasons.push("daily-total");
  if (
    layer.maxRelief !== null &&
    state.rel.length + periods.length > layer.maxRelief
  )
    reasons.push("daily-relief");
  if (
    layer.maxConsecutive !== null &&
    consecutive(final, state.breaks) > layer.maxConsecutive
  )
    reasons.push("consecutive");
  if (p.employmentCapRequired === true && !Number.isFinite(p.actualWeeklyCap))
    reasons.push("employment-cap-unverified");
  if (
    p.actualWeeklyCap !== null &&
    p.actualWeeklyCap !== undefined &&
    (!Number.isFinite(p.actualWeeklyOccupied) ||
      p.actualWeeklyOccupied +
        new Set(
          state.rel
            .filter(
              (a) =>
                !p.occupied.some(
                  (o) => o.period === a.period && o.occupied !== false,
                ),
            )
            .map((a) => a.period),
        ).size +
        periods.length >
        p.actualWeeklyCap)
  )
    reasons.push("employment-cap");
  return { reasons, state, remaining };
}
function unitsFor(demands, layer, assignments) {
  const units = [],
    seen = new Set();
  for (const d of demands) {
    if (seen.has(d.id)) continue;
    const length = layer.continuity[normal(d.subject)] || 1;
    const key = blockKey(d);
    let unit = [d];
    if (length > 1) {
      const peers = demands
        .filter((x) => blockKey(x) === key)
        .sort((a, b) => a.period - b.period);
      let index = peers.indexOf(d),
        lo = index,
        hi = index;
      while (lo > 0 && peers[lo].period === peers[lo - 1].period + 1) lo--;
      while (
        hi < peers.length - 1 &&
        peers[hi + 1].period === peers[hi].period + 1
      )
        hi++;
      unit = peers.slice(lo, hi + 1);
    }
    unit.forEach((x) => seen.add(x.id));
    const anchors = assignments.filter(
      (a) =>
        a.blockKey === key ||
        (a.lessonId === d.lessonId &&
          (a.classId || null) === (d.classId || null) &&
          (a.groupId || null) === (d.groupId || null)),
    );
    units.push({ demands: unit, key, anchors, length });
  }
  return units;
}
/** Result includes all bounded comparisons and honest unresolved/search status. */
export function allocate(input, rawPolicy = defaultPolicy(), options = {}) {
  const s = validateSnapshot(input),
    policy = validatePolicy(rawPolicy),
    mode = options.mode || "auto";
  if (!["auto", "fill-only"].includes(mode)) fail("Unknown allocation mode.");
  const retained = s.assignments.filter((a) => fixed(a, s, mode)),
    assigned = clone(retained),
    retainedIds = new Set(retained.map((a) => a.demandId)),
    excluded = [],
    audit = [],
    backfill = [],
    layerRows = [];
  let comparisons = 0,
    exhausted = false,
    capacityCache = new Map();
  const maxComparisons = Math.min(
    policy.maxComparisons,
    options.maxComparisons ?? policy.maxComparisons,
  );
  const excludedDemands = s.demands.filter(
    (d) =>
      matches(d.subject, policy.noReliefSubjects) ||
      s.manualNoCover?.includes(d.id),
  );
  const remaining = new Map(
    s.demands
      .filter(
        (d) =>
          !retainedIds.has(d.id) && !excludedDemands.some((x) => x.id === d.id),
      )
      .map((d) => [d.id, d]),
  );
  const staff = s.staff.map((p) => ({ ...p, layer: resolveLayer(p, policy) }));
  const assignedDuty = (p, d, layer, round, key) => ({
    id: `auto:${s.runId}:${d.id}`,
    demandId: d.id,
    staffId: p.staffId,
    period: d.period,
    subject: d.subject,
    lessonId: d.lessonId,
    classId: d.classId || null,
    groupId: d.groupId || null,
    venueId: d.venueId || null,
    blockKey: key,
    origin: "automatic",
    status: "draft",
    protected: false,
    charge: 1,
    layer: layer.id,
    round,
  });
  function candidates(unit, layer, list = assigned) {
    const candidates = [];
    let anchorIds = new Set(unit.anchors.map((a) => a.staffId));
    if (anchorIds.size > 1) {
      excluded.push({
        demandIds: unit.demands.map((d) => d.id),
        reason: "incompatible-block-anchors",
      });
      return candidates;
    }
    const requiredLength = Math.max(
      unit.length,
      ...unit.anchors.map((a) => a.blockLength || 1),
    );
    if (
      unit.anchors.some(
        (a) => a.blockLength > 1 && unit.length !== a.blockLength,
      )
    ) {
      excluded.push({
        demandIds: unit.demands.map((d) => d.id),
        reason: "incompatible-layer-block-rule",
      });
      return candidates;
    }
    for (const p of staff.filter((x) => x.layer === layer.id)) {
      if (++comparisons > maxComparisons) {
        exhausted = true;
        break;
      }
      const check = eligibility(p, unit.demands, list, s, policy, layer);
      if (anchorIds.size && !anchorIds.has(p.staffId))
        check.reasons.push("block-anchor");
      let eligiblePeriodSet =
        list === assigned ? capacityCache.get(p.staffId) : null;
      if (!eligiblePeriodSet) {
        eligiblePeriodSet = new Set();
        const periods = new Map(
          [...remaining.values()].map((d) => [d.period, d]),
        );
        for (const d of periods.values()) {
          if (++comparisons > maxComparisons) {
            exhausted = true;
            break;
          }
          if (!eligibility(p, [d], list, s, policy, layer).reasons.length)
            eligiblePeriodSet.add(d.period);
        }
        if (list === assigned) capacityCache.set(p.staffId, eligiblePeriodSet);
      }
      if (exhausted) break;
      const terms = [eligiblePeriodSet.size, check.remaining ?? 0];
      if (layer.maxTotal !== null)
        terms.push(layer.maxTotal - check.state.occupied.size);
      if (layer.maxRelief !== null)
        terms.push(layer.maxRelief - check.state.rel.length);
      const values = {
        dailyCapacity: [
          check.state.occupied.size,
          -Math.max(0, Math.min(...terms)),
        ],
        alternatives: [eligiblePeriodSet.size],
        weeklyRemaining: [-(check.remaining ?? 0)],
        rotation: [Number.isFinite(p.rotation) ? p.rotation : 0],
        subjectMatch: [
          unit.demands.every((d) =>
            (p.subjects || []).map(normal).includes(normal(d.subject)),
          )
            ? -1
            : 0,
        ],
        levelMatch: [
          unit.demands.every((d) => (p.levels || []).includes(d.level))
            ? -1
            : 0,
        ],
      };
      audit.push({
        layer: layer.id,
        demandIds: unit.demands.map((d) => d.id),
        staffId: p.staffId,
        reasons: check.reasons,
        values,
        reliefCount: check.state.rel.length,
      });
      if (!check.reasons.length)
        candidates.push({
          p,
          values,
          round: check.state.rel.length,
          requiredLength,
        });
    }
    candidates.sort((a, b) => {
      if (layer.spiral && a.round !== b.round) return a.round - b.round;
      for (const key of layer.preferences) {
        for (let i = 0; i < a.values[key].length; i++) {
          const diff = a.values[key][i] - b.values[key][i];
          if (diff) return diff;
        }
      }
      return a.p.staffId.localeCompare(b.p.staffId);
    });
    return candidates;
  }
  for (const layer of policy.layers) {
    layerRows.push({
      layer: layer.id,
      staffIds: staff.filter((p) => p.layer === layer.id).map((p) => p.staffId),
    });
    while (remaining.size && !exhausted) {
      let choices = [];
      for (const unit of unitsFor([...remaining.values()], layer, assigned)) {
        const list = candidates(unit, layer);
        if (list.length) choices.push({ unit, candidate: list[0] });
        if (exhausted) break;
      }
      if (!choices.length || exhausted) break;
      // Spiral opportunity level applies across demands, not just candidates for one lesson.
      choices.sort((a, b) =>
        layer.spiral && a.candidate.round !== b.candidate.round
          ? a.candidate.round - b.candidate.round
          : a.unit.demands[0].period - b.unit.demands[0].period ||
            a.unit.demands[0].id.localeCompare(b.unit.demands[0].id),
      );
      const { unit, candidate: c } = choices[0];
      for (const d of unit.demands) {
        assigned.push({
          ...assignedDuty(c.p, d, layer, c.round, unit.key),
          blockLength: c.requiredLength,
        });
        remaining.delete(d.id);
      }
      capacityCache = new Map();
      audit.push({
        selected: c.p.staffId,
        layer: layer.id,
        round: c.round,
        demandIds: unit.demands.map((d) => d.id),
        blockJump: unit.demands.length,
      });
    }
  }
  // Bounded conservative one-move backfill. Fixed commitments are never candidates.
  if (!exhausted && options.backfill !== false) {
    for (const gap of [...remaining.values()]) {
      if (exhausted) break;
      for (const old of assigned.filter(
        (a) =>
          a.origin === "automatic" &&
          !retainedIds.has(a.demandId) &&
          a.blockLength === 1,
      )) {
        const p = staff.find((p) => p.staffId === old.staffId),
          layer = policy.layers.find((l) => l.id === old.layer),
          oldDemand = s.demands.find((d) => d.id === old.demandId);
        if (
          !p ||
          !layer ||
          !oldDemand ||
          (layer.continuity[normal(gap.subject)] || 1) > 1
        )
          continue;
        const rest = assigned.filter((a) => a.id !== old.id);
        if (++comparisons > maxComparisons) {
          exhausted = true;
          break;
        }
        if (eligibility(p, [gap], rest, s, policy, layer).reasons.length)
          continue;
        const moved = assignedDuty(
          p,
          gap,
          layer,
          stateFor(p, rest, policy).rel.length,
          blockKey(gap),
        );
        let replacement = null;
        for (const lower of policy.layers.filter(
          (l) => policy.layers.indexOf(l) >= policy.layers.indexOf(layer),
        )) {
          if ((lower.continuity[normal(oldDemand.subject)] || 1) > 1) continue;
          const cs = candidates(
            {
              demands: [oldDemand],
              key: blockKey(oldDemand),
              anchors: [],
              length: 1,
            },
            lower,
            [...rest, moved],
          );
          const c = cs.find((c) => c.p.staffId !== p.staffId);
          if (c) {
            replacement = {
              ...assignedDuty(
                c.p,
                oldDemand,
                lower,
                c.round,
                blockKey(oldDemand),
              ),
              blockLength: 1,
            };
            break;
          }
        }
        if (replacement) {
          assigned.splice(
            assigned.findIndex((a) => a.id === old.id),
            1,
            moved,
            replacement,
          );
          remaining.delete(gap.id);
          backfill.push({
            fromDemandId: old.demandId,
            toDemandId: gap.id,
            movedStaffId: p.staffId,
            replacementStaffId: replacement.staffId,
            reason: "preserve-higher-layer-use",
          });
          break;
        }
      }
    }
  }
  return {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    schoolId: s.schoolId,
    date: s.date,
    runId: s.runId,
    inputDigest: s.inputDigest,
    revisions: clone(s.revisions || {}),
    policyVersion: policy.version,
    assignments: assigned.filter((a) => !retainedIds.has(a.demandId)),
    retained: clone(retained),
    unresolved: [...remaining.values()].map((d) => ({
      demandId: d.id,
      reason: exhausted ? "search-budget" : "no-valid-assignment-found",
    })),
    noRelief: excludedDemands.map((d) => d.id),
    layers: layerRows,
    comparisons: audit,
    exclusions: excluded,
    backfill,
    search: {
      status: exhausted ? "bounded" : "complete-greedy-with-bounded-backfill",
      comparisons: Math.min(comparisons, maxComparisons),
      budget: maxComparisons,
      optimalityProven: false,
    },
  };
}
/** Validate any engine adapter's output independently before it can reach storage. */
export function validateProposal(snapshot, rawPolicy, proposal, options = {}) {
  const s = validateSnapshot(snapshot),
    p = validatePolicy(rawPolicy);
  if (
    !proposal ||
    proposal.schemaVersion !== 1 ||
    proposal.date !== s.date ||
    proposal.policyVersion !== p.version ||
    proposal.schoolId !== s.schoolId ||
    proposal.runId !== s.runId ||
    proposal.inputDigest !== s.inputDigest ||
    JSON.stringify(proposal.revisions) !== JSON.stringify(s.revisions || {}) ||
    !Array.isArray(proposal.assignments) ||
    !Array.isArray(proposal.retained)
  )
    fail("Engine response is not bound to its snapshot.");
  const expected = s.assignments.filter((a) =>
    fixed(a, s, options.mode || "auto"),
  );
  if (JSON.stringify(proposal.retained) !== JSON.stringify(expected))
    fail("Engine changed a protected commitment.");
  const excluded = new Set(
      s.demands
        .filter(
          (d) =>
            matches(d.subject, p.noReliefSubjects) ||
            s.manualNoCover?.includes(d.id),
        )
        .map((d) => d.id),
    ),
    used = new Set(expected.map((a) => a.demandId)),
    list = clone(expected);
  for (const a of proposal.assignments) {
    const d = s.demands.find((d) => d.id === a.demandId),
      person = s.staff.find((p) => p.staffId === a.staffId),
      layer = p.layers.find((l) => l.id === resolveLayer(person || {}, p));
    if (
      !d ||
      !person ||
      !layer ||
      used.has(d.id) ||
      excluded.has(d.id) ||
      a.subject !== d.subject ||
      a.lessonId !== d.lessonId ||
      a.period !== d.period ||
      a.charge !== 1 ||
      a.origin !== "automatic" ||
      a.status !== "draft" ||
      a.protected !== false ||
      (a.classId || null) !== (d.classId || null) ||
      (a.groupId || null) !== (d.groupId || null) ||
      (a.venueId || null) !== (d.venueId || null) ||
      !integer(a.round, 0, 4000) ||
      a.layer !== layer.id ||
      a.blockKey !== blockKey(d) ||
      (a.blockLength ?? 1) !== (layer.continuity[normal(d.subject)] || 1)
    )
      fail("Engine response contains invalid or duplicate cover.");
    if (eligibility(person, [d], list, s, p, layer).reasons.length)
      fail("Engine response violates an allocation limit.");
    used.add(d.id);
    list.push(a);
  }
  for (const layer of p.layers)
    for (const unit of unitsFor(s.demands, layer, list)) {
      if (unit.length <= 1) continue;
      const rows = list.filter((a) =>
        unit.demands.some((d) => d.id === a.demandId),
      );
      if (
        rows.some(
          (a) =>
            !expected.some((e) => e.id === a.id) &&
            resolveLayer(
              s.staff.find((p) => p.staffId === a.staffId),
              p,
            ) === layer.id,
        ) &&
        (rows.length !== unit.demands.length ||
          new Set([...rows, ...unit.anchors].map((a) => a.staffId)).size > 1)
      )
        fail("Engine response split a continuous block.");
    }
  const missing = s.demands
    .filter((d) => !used.has(d.id) && !excluded.has(d.id))
    .map((d) => d.id)
    .sort();
  if (
    !Array.isArray(proposal.unresolved) ||
    JSON.stringify(proposal.unresolved.map((x) => x.demandId).sort()) !==
      JSON.stringify(missing)
  )
    fail("Engine response omitted an unresolved demand.");
  return clone(proposal);
}
export function runEngine(snapshot, policy, options = {}, engine = allocate) {
  return validateProposal(
    snapshot,
    policy,
    engine(clone(snapshot), clone(policy), clone(options)),
    options,
  );
}
