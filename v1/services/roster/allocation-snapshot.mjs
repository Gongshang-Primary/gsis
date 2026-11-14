import Allocation from "../../../shared/roster-allocation.js";
import Operations from "../../../shared/roster-operations.js";
import { defaultPolicy } from "../../allocator/index.mjs";
import { requireValue } from "../../runtime/errors.mjs";
import { query, one, canonical, digest } from "../../runtime/store.mjs";

function monday(date) {
  const d = new Date(date + "T12:00:00Z"),
    offset = (d.getUTCDay() + 6) % 7;
  return new Date(Date.parse(date) - offset * 86400000)
    .toISOString()
    .slice(0, 10);
}
function lessonIdentity(d, day) {
  const teacher = day.teachers?.find(
      (t) => t.staffId === (d.absentId || d.staffId),
    ),
    cell = teacher?.cells[d.period];
  let start = d.period;
  if (cell)
    while (
      start > 0 &&
      JSON.stringify(teacher.cells[start - 1]) === JSON.stringify(cell)
    )
      start--;
  return [
    day.id,
    d.absentId || d.staffId || d.absenceId,
    d.className || "",
    d.groupName || "",
    d.subject,
    start,
  ].join(":");
}
export async function allocationSnapshot(ctx, loaded, c, date, revision, runId) {
  const schoolId = ctx.principal.schoolId,
    day = c.days[date];
  requireValue(
    day?.verified && day.schoolDay && day.id,
    "TIMETABLE_UNVERIFIED",
    409,
  );
  requireValue(
    c.publication?.publicationId &&
      Number.isSafeInteger(c.publication.publicationSequence),
    "WORKLOAD_UNVERIFIED",
    503,
  );
  const week = monday(date),
    rows = c.publication.rows || [],
    byStaff = new Map(rows.map((r) => [r.staffId, r])),
    captured = await query(
      ctx.env.DB,
      "SELECT * FROM roster_weekly WHERE school_id=? AND week=?",
      [schoolId, week],
    ),
    capturedMap = new Map(captured.map((r) => [r.staff_id, r]));
  const used = new Map(),
    usedOccupied = new Map(),
    physicalSlots = new Map(),
    unknownPhysical = new Set();
  for (const a of Allocation.accounted(loaded.state, c)) {
    if (monday(a.date) !== week || a.date === date) continue;
    used.set(a.staffId, (used.get(a.staffId) || 0) + Allocation.cost(a));
    if (!Number.isInteger(a.period)) {
      unknownPhysical.add(a.staffId);
      continue;
    }
    const key = a.staffId + "|" + a.date + "|" + a.period,
      occupied =
        a.occupiedPeriods ??
        a.additionalOccupied ??
        (a.combination || a.repurposedDuty ? 0 : 1),
      previous = physicalSlots.get(key) || 0;
    physicalSlots.set(key, Math.max(previous, occupied));
    usedOccupied.set(
      a.staffId,
      (usedOccupied.get(a.staffId) || 0) + Math.max(0, occupied - previous),
    );
  }
  const weeklyWrites = [],
    weeklyGuards = [];
  const staff = c.people.map((p) => {
    const teaching = day.teachers.find((t) => t.staffId === p.id),
      adHoc = loaded.state.adhoc.find(
        (a) => a.staffId === p.id && a.date === date && !a.deletedAt,
      ),
      row = byStaff.get(p.id),
      previous = capturedMap.get(p.id),
      quality = row?.quality === "verified" ? "verified" : "unavailable";
    const q =
        quality === "verified" &&
        Number.isFinite(row.budget) &&
        Number.isFinite(row.weightedWi ?? row.Wi) &&
        Number.isFinite(row.factor)
          ? Math.max(
              0,
              Math.floor(
                row.factor * (row.budget - (row.weightedWi ?? row.Wi)),
              ),
            )
          : null,
      quota = previous ? (previous.excluded ? 0 : previous.quota) : q;
    if (!previous && q !== null && teaching && p.active && p.eo) {
      weeklyGuards.push({
        sql: "SELECT NOT EXISTS(SELECT 1 FROM roster_weekly WHERE school_id=? AND staff_id=? AND week=?) AS ok",
        args: [schoolId, p.id, week],
      });
      weeklyWrites.push({
        sql: "INSERT INTO roster_weekly(school_id,staff_id,week,publication_id,publication_sequence,calculation_version,quota,captured_at,evidence_json) VALUES(?,?,?,?,?,?,?,?,?)",
        args: [
          schoolId,
          p.id,
          week,
          c.publication.publicationId,
          c.publication.publicationSequence,
          c.publication.calculationVersion,
          q,
          ctx.now,
          canonical({
            source: "initial-verified-capture",
            row,
            contactsRevision: c.publication.contactsRevision || null,
          }),
        ],
      });
    }
    return {
      staffId: p.id,
      active: p.longTermActive ?? p.active,
      dateActive: !!adHoc && p.adhocEligible === true,
      eo: p.eo,
      employment: p.employment,
      employmentTags: p.employmentTags,
      employmentCapRequired:
        p.employment.split(",").includes("UT") || row?.periodCap != null,
      appointments: p.appointments || [p.role].filter(Boolean),
      dailyAdhoc: !!adHoc,
      adhocEligible: p.adhocEligible,
      hasBaseline: !!teaching,
      available: adHoc?.periods || day.periods.map((p) => p.period),
      occupied: (teaching?.cells || []).flatMap((cell, period) =>
        cell.some((x) => String(x).trim())
          ? [{ period, subject: cell[0], occupied: true }]
          : [],
      ),
      weekly: {
        quality:
          quality === "verified" && quota !== null ? "verified" : "unavailable",
        remaining:
          quota === null ? null : Math.max(0, quota - (used.get(p.id) || 0)),
        publicationId: previous?.publication_id || c.publication.publicationId,
      },
      subjects: p.subjects || [],
      levels: p.levels || [],
      actualWeeklyCap: row?.periodCap ?? null,
      actualWeeklyOccupied:
        row?.periodCap == null
          ? null
          : !unknownPhysical.has(p.id) &&
              c.effectiveCaps?.[p.id + "|" + week]?.capVerified === true
            ? c.effectiveCaps[p.id + "|" + week].capWorkload +
              (usedOccupied.get(p.id) || 0)
            : null,
      rotation: 0,
    };
  });
  const demands = Operations.demand(c, loaded.state, date).map((d) => ({
    ...d,
    lessonId: lessonIdentity(d, day),
    classId: d.classId || d.className || null,
    groupId: d.groupId || d.groupName || null,
    venueId: d.venueId || d.venue || null,
  }));
  const policyRow = await one(
      ctx.env.DB,
      "SELECT payload_json,revision FROM roster_records WHERE school_id=? AND collection='layerPolicy' AND record_id='scalar'",
      [schoolId],
    ),
    policyValue = policyRow
      ? { ...defaultPolicy(), ...JSON.parse(policyRow.payload_json).data }
      : defaultPolicy(),
    policyRevision = policyRow?.revision || 0;
  policyValue.noReliefSubjects =
    loaded.state.systemConfig.noReliefSubjects || policyValue.noReliefSubjects;
  policyValue.consecutiveBreakSubjects =
    loaded.state.systemConfig.consecutiveCountExclusions;
  policyValue.employmentRestrictedPeriods = Object.fromEntries(
    (loaded.state.systemConfig.employmentPeriodRestrictions || []).map((x) => [
      x.employment,
      x.periods,
    ]),
  );
  const snapshot = {
    schemaVersion: 1,
    schoolId,
    runId: runId,
    date,
    timeZone: "Asia/Singapore",
    observedAt: ctx.now,
    revisions: {
      day: revision,
      config: policyRevision,
      publication: c.publication.publicationSequence,
      accounting: loaded.accountingRevisions,
    },
    employmentCapEvidence: c.effectiveCaps,
    sourceDependencies: c.dependencies.map((d) => ({
      owner: d.owner,
      scope: d.scope,
      revision: d.revision,
    })),
    staff,
    demands,
    assignments: Allocation.effectiveAssignments(loaded.state)
      .filter((a) => a.date === date && !a.noRelief && !a.remove)
      .map((a) => ({
        ...a,
        lessonId:
          demands.find((d) => d.id === a.demandId)?.lessonId ||
          a.lessonId ||
          a.demandId,
        charge: a.rCost ?? 1,
        blockLength:
          policyValue.layers.find((l) => l.id === a.layer)?.continuity[
            String(a.subject).toUpperCase()
          ] || 1,
      })),
    absences: loaded.state.absences
      .filter((a) => a.date === date && !a.deletedAt)
      .map((a) => ({
        staffId: a.staffId,
        periods: Allocation.absencePeriods(a, day),
      })),
    peerReservations: loaded.state.requests
      .filter((r) => r.date === date && r.status === "pending")
      .map((r) => ({
        staffId: r.recipientId,
        periods: r.periods || [],
        status: "pending",
      })),
    manualNoCover: loaded.state.assignments
      .filter((a) => a.date === date && a.noRelief)
      .map((a) => a.demandId),
    startedPeriods: day.periods
      .filter(
        (p) =>
          Date.parse(date + "T00:00:00+08:00") + p.startMinutes * 60000 <=
          ctx.now,
      )
      .map((p) => p.period),
    inputDigest: "pending",
  };
  snapshot.inputDigest = await digest({ ...snapshot, inputDigest: null });
  return { snapshot, policyValue, policyRevision, weeklyWrites, weeklyGuards, day, demands, week };
}
