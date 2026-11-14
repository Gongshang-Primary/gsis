import Operations from "../../../shared/roster-operations.js";
import Allocation from "../../../shared/roster-allocation.js";
import Stapler from "../../../shared/roster-stapler.js";
import Roster from "../../../shared/roster.js";
import { query } from "../../runtime/store.mjs";
import { serviceCall } from "../../runtime/security.mjs";
import { requireValue } from "../../runtime/errors.mjs";
import { readArtifact } from "./repository.mjs";

/** Current effective numbered-period cap evidence; immutable Deploy R is separate. */
export async function effectiveWeeklyCaps(
  ctx,
  loaded,
  range,
  { entries, models, publication },
) {
  const rows = (publication?.rows || []).filter((r) => r.periodCap != null);
  if (!rows.length) return { byKey: {}, dependencies: [], sourceDays: [] };
  const from = Allocation.monday(range.from),
    to = Allocation.addDays(Allocation.monday(range.to), 4),
    calendarRows = [],
    dependencies = [];
  // A year-long read may straddle the calendar endpoint's bounded year window.
  for (let first = from; first <= to; ) {
    const last = [to, Allocation.addDays(first, 365)].sort()[0];
    const result = await serviceCall(ctx.env, "calendar", "/internal/dates", {
      schoolId: ctx.principal.schoolId,
      decisionId: ctx.principal.decisionId,
      from: first,
      to: last,
    });
    requireValue(Array.isArray(result.rows), "CALENDAR_UNAVAILABLE", 503);
    calendarRows.push(...result.rows);
    dependencies.push(...(result.dependencies || []));
    first = Allocation.addDays(last, 1);
  }
  const calendar = new Map(calendarRows.map((r) => [r.date, r])),
    stored = await query(
      ctx.env.DB,
      "SELECT * FROM roster_records WHERE school_id=? AND collection IN ('staplerPlans','absences','audit') AND service_date BETWEEN ? AND ? ORDER BY collection,record_id LIMIT 10001",
      [ctx.principal.schoolId, from, to],
    );
  requireValue(
    stored.length <= 10000 &&
      stored.reduce((n, r) => n + r.payload_json.length, 0) <= 8388608,
    "CAPACITY_EVIDENCE_BOUNDS",
    413,
  );
  const state = { staplerPlans: [], absences: [], audit: [] };
  for (const r of stored)
    state[r.collection].push(JSON.parse(r.payload_json).data);
  const days = new Map(),
    sourceDays = [];
  for (let date = from; date <= to; date = Allocation.addDays(date, 1)) {
    const weekday = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
    if (weekday >= 5) continue;
    const cal = calendar.get(date),
      record = state.staplerPlans.find((r) => r.date === date),
      plan = Operations.readyStaplerPlan(record, state.audit);
    if (!cal || cal.available !== true) {
      days.set(date, { issue: "Calendar evidence is unavailable." });
      continue;
    }
    if (cal.schoolDay !== true) {
      days.set(date, {
        date,
        holiday: true,
        periods: [],
        teachers: [],
        categories: {},
        revision: cal.revision,
      });
      continue;
    }
    if (plan) {
      requireValue(
        Stapler.hasDaySnapshot(plan),
        "CAPACITY_STAPLER_SNAPSHOT_MISSING",
        409,
      );
      const day = Stapler.effectiveDay(plan);
      for (const tile of plan.tiles || [])
        if (
          tile.location === "grid" &&
          tile.kind === "lesson" &&
          tile.source?.teacherId &&
          tile.source.teacherId !== tile.teacherId
        ) {
          const teacher = day.teachers.find(
            (t) => t.staffId === tile.teacherId,
          );
          if (teacher) teacher.cells[tile.period] = ["", "", "", ""];
        }
      days.set(date, {
        ...day,
        date,
        categories: plan.subjectCategories || {},
        sourceKind: "stapler",
        sourceId: plan.id,
        revision: record.revision,
      });
      sourceDays.push({
        date,
        kind: "stapler",
        revision: record.revision,
        id: plan.id,
      });
      continue;
    }
    if (record?.confirmed || record?.published) {
      days.set(date, { issue: "The confirmed day snapshot is unavailable." });
      continue;
    }
    const entry = Roster.active(entries, date);
    if (!entry) {
      days.set(date, { issue: "No baseline is active on " + date + "." });
      continue;
    }
    let model = models.get(entry.id);
    if (!model) {
      model = await readArtifact(
        ctx.env.ARTIFACTS,
        entry.modelKey,
        entry.digest,
      );
      models.set(entry.id, model);
    }
    const parity = model.layoutMode === "single-week" ? "single" : cal.parity,
      week = model[parity];
    if (!week) {
      days.set(date, { issue: "The selected week parity is unavailable." });
      continue;
    }
    const periods = Array.from({ length: week.perDay }, (_, period) => ({
      period,
      startMinutes:
        model.timing.startMinutes + period * model.timing.periodMinutes,
      endMinutes:
        model.timing.startMinutes + (period + 1) * model.timing.periodMinutes,
    }));
    days.set(date, {
      date,
      periods,
      categories: model.subjectCategories || {},
      teachers: week.blocks.map((b) => ({
        staffId: entry.mapping[b.name],
        cells: b.cells.slice(
          weekday * week.perDay,
          (weekday + 1) * week.perDay,
        ),
      })),
      sourceKind: "baseline",
      sourceId: entry.id,
      revision: entry.revision,
    });
    sourceDays.push({
      date,
      kind: "baseline",
      id: entry.id,
      revision: entry.revision,
    });
  }
  const byKey = {};
  for (let week = from; week <= to; week = Allocation.addDays(week, 7))
    for (const row of rows) {
      const evidence = [],
        cells = [],
        categories = {
          ...(publication.subjectCategories || {}),
          ...(row.subjectCategories || {}),
        };
      let issue =
        row.quality !== "verified"
          ? "Published employment cap evidence is unverified."
          : null;
      for (let n = 0; n < 5; n++) {
        const date = Allocation.addDays(week, n),
          day = days.get(date),
          matches = (day?.teachers || []).filter(
            (t) => t.staffId === row.staffId,
          );
        if (!day || day.issue || (!day.holiday && matches.length !== 1)) {
          issue ||=
            day?.issue ||
            "A unique permanent Staff ID is missing from an effective weekday.";
          continue;
        }
        const current = day.holiday ? [] : structuredClone(matches[0].cells);
        for (const absence of state.absences.filter(
          (a) => a.date === date && a.staffId === row.staffId && !a.deletedAt,
        ))
          for (const p of Allocation.absencePeriods(absence, day))
            current[p] = ["", "", "", ""];
        Object.assign(categories, day.categories || {});
        evidence.push({
          date,
          baselineId: day.sourceId || null,
          sourceKind: day.sourceKind || "non-school-day",
          revision: day.revision || 0,
          periods: day.periods,
          cells: current,
        });
        cells.push(...current);
      }
      const diagnostics = {},
        basis = row.capBasis ?? null,
        reservations = row.capNonTeachingPeriods;
      const workload = issue
        ? null
        : Stapler.capWorkload(
            cells,
            categories,
            basis,
            reservations,
            diagnostics,
          );
      if (!Number.isFinite(workload))
        issue ||=
          diagnostics.reason ||
          "Current effective weekly occupancy is unverified.";
      byKey[row.staffId + "|" + week] = {
        staffId: row.staffId,
        week,
        periodCap: row.periodCap,
        capBasis: basis,
        capNonTeachingPeriods: reservations ?? null,
        capWeekDays: evidence,
        capWorkload: workload,
        capVerified: !issue,
        capHeadroom: issue ? null : row.periodCap - workload,
        capVerificationReason: issue,
        subjectCategories: categories,
      };
    }
  return { byKey, dependencies, sourceDays };
}
