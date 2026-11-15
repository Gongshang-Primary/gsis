import Operations from "../../../shared/roster-operations.js";
import Allocation from "../../../shared/roster-allocation.js";
import { effectiveWeeklyCaps } from "./capacity.mjs";
import Roster from "../../../shared/roster.js";
import { query } from "../../runtime/store.mjs";
import { serviceCall } from "../../runtime/security.mjs";
import { requireValue } from "../../runtime/errors.mjs";
import { localDate, readArtifact, scopeRevision } from "./repository.mjs";
export const workloadOperations = new Set([
  "capacityForecast",
  "assign",
  "combine",
  "undo",
  "unassign",
  "returnAutomatic",
  "reliefBatch",
  "candidates",
  "availability",
  "requestMutual",
  "respondMutual",
  "allocation",
  "health",
  "accounting",
  "optimise",
  "autoAllocate",
  "saveRecess",
  "deleteRecess",
  "exportDaily",
  "publish",
]);
export async function baselines(env, schoolId) {
  return (
    await query(
      env.DB,
      "SELECT * FROM roster_baselines WHERE school_id=? ORDER BY from_date DESC,priority DESC LIMIT 501",
      [schoolId],
    )
  ).map((r) => ({
    id: r.baseline_id,
    name: r.name,
    from: r.from_date,
    to: r.to_date,
    priority: r.priority,
    revision: r.revision,
    pruned: !!r.pruned,
    modelKey: r.model_key,
    digest: r.digest,
    mapping: JSON.parse(r.mapping_json),
    venueMapping: JSON.parse(r.venue_mapping_json || "{}"),
  }));
}
export async function context(ctx, loaded, range, { needsQuota = false } = {}) {
  const { env, principal, now } = ctx,
    schoolId = principal.schoolId,
    today = localDate(now),
    minute =
      new Date(now + 28800000).getUTCHours() * 60 +
      new Date(now + 28800000).getUTCMinutes();
  const projection = await serviceCall(
    env,
    "contacts",
    "/internal/projection",
    {
      schoolId,
      decisionId: principal.decisionId,
      purpose: "roster",
      date: range.from,
    },
  );
  requireValue(
    Array.isArray(projection.people || projection.staff) &&
      projection.revision &&
      Number.isSafeInteger(projection.asOf),
    "CONTACTS_UNAVAILABLE",
    503,
  );
  const code = (value) =>
    typeof value === "string"
      ? value
      : typeof value?.code === "string"
        ? value.code
        : "";
  const codes = (values) =>
    Array.isArray(values) ? values.map(code).filter(Boolean) : [];
  const people = (projection.people || projection.staff).map((p) => ({
    ...p,
    id: p.staffId || p.id,
    name: p.name || p.basicName || p.staffId,
    longTermActive: p.active === true,
    // Dated relief availability stays in Roster's activation records. It must
    // not promote Contacts employment status, including during saveAdhoc.
    active: p.active === true,
    eo: p.eo === true,
    mobile: p.mobile || "",
    email: p.email || "",
    emails: p.emails || [],
    employment: codes(p.employmentTags).join(",") || code(p.employment),
    employmentTags: codes(p.employmentTags),
    mk: (p.schoolSection || p.profile?.section) === "MK" ? "MKE" : "",
    role: code(p.role),
    appointments: codes(p.appointments).length
      ? codes(p.appointments)
      : [code(p.role)].filter(Boolean),
    appointmentLevel: code(p.eoAppointmentLevel || p.appointmentLevel),
    subjects: codes(p.subjectTags).length
      ? codes(p.subjectTags)
      : p.subjects || [],
    adhocEligible: p.adhocEligible === true || p.eo === true,
    groups: p.groups || [],
  }));
  const baselineRevision = await scopeRevision(env.DB, schoolId, "baselines"),
    configRevision =
      loaded.sourceConfigRevision ??
      (await scopeRevision(env.DB, schoolId, "config")),
    entries = await baselines(env, schoolId);
  requireValue(entries.length <= 500, "BASELINE_BOUNDS", 413);
  const calendar = await serviceCall(env, "calendar", "/internal/dates", {
    schoolId,
    decisionId: principal.decisionId,
    from: range.from,
    to: range.to,
  });
  requireValue(Array.isArray(calendar.rows), "CALENDAR_UNAVAILABLE", 503);
  const calendarByDate = Object.fromEntries(
    calendar.rows.map((r) => [r.date, r]),
  );
  let publication = null,
    dependencies = [
      ...(projection.dependencies || []),
      ...(calendar.dependencies || []),
    ];
  if (needsQuota) {
    publication = await serviceCall(
      env,
      "deploy",
      "/internal/roster-workload",
      { schoolId, decisionId: principal.decisionId, date: range.from },
    );
    requireValue(
      publication && publication.schoolId === schoolId,
      "WORKLOAD_UNVERIFIED",
      503,
    );
    dependencies.push(...(publication.dependencies || []));
  }
  // Service aliases are projections of the verified frozen envelope. Preserve
  // TV05 native fields too; an envelope wrapper must not hide its row evidence.
  const payload = publication
    ? {
        ...(publication.envelope || publication),
        rows: (
          publication.rows ||
          publication.envelope?.rows ||
          publication.workload?.rows ||
          []
        ).map((r) => ({
          ...r,
          budget: r.budget ?? r.weeklyBudget ?? null,
          weightedWi: r.weightedWi ?? r.Wi ?? null,
          periodCap: r.periodCap ?? r.cap ?? null,
          actualWorkload:
            r.actualWorkload ?? r.actualCapCountedWorkload ?? null,
        })),
      }
    : null;
  const quotas = new Map(
    (payload?.rows || payload?.workload?.rows || []).map((r) => [r.staffId, r]),
  );
  const estimated = payload?.workloadEvidence?.quality === "estimated";
  const captured = await query(
      env.DB,
      "SELECT * FROM roster_weekly WHERE school_id=? AND week BETWEEN ? AND ?",
      [
        schoolId,
        new Date(Date.parse(range.from) - 6 * 86400000)
          .toISOString()
          .slice(0, 10),
        range.to,
      ],
    ),
    frozen = new Map(captured.map((r) => [r.staff_id + "|" + r.week, r]));
  const days = {},
    models = new Map();
  for (const date of range.dates) {
    const entry = Roster.active(entries, date),
      cal = calendarByDate[date];
    if (!entry) {
      days[date] = {
        id: null,
        parity: null,
        verified: cal?.available === true,
        schoolDay: cal?.schoolDay === true,
        periods: [],
        teachers: [],
        warning: "No baseline timetable is active on this date.",
      };
      continue;
    }
    let model = models.get(entry.id);
    if (!model) {
      model = await readArtifact(env.ARTIFACTS, entry.modelKey, entry.digest);
      models.set(entry.id, model);
    }
    const parity = model.layoutMode === "single-week" ? "single" : cal?.parity,
      week = model[parity],
      weekday = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
    const periods = Array.from({ length: model.maxPeriod + 1 }, (_, period) => {
      const startMinutes =
          model.timing.startMinutes + period * model.timing.periodMinutes,
        endMinutes = startMinutes + model.timing.periodMinutes,
        fmt = (m) =>
          String(Math.floor(m / 60)).padStart(2, "0") +
          ":" +
          String(m % 60).padStart(2, "0");
      return {
        period,
        startMinutes,
        endMinutes,
        start: fmt(startMinutes),
        end: fmt(endMinutes),
      };
    });
    const teachers = [];
    for (const block of week?.blocks || []) {
      const staffId = entry.mapping[block.name],
        person = people.find((p) => p.id === staffId);
      if (!person) continue;
      const row = quotas.get(staffId),
        verified = row?.quality === "verified",
        usable = verified || (estimated && row?.quality === "estimated"),
        wi = row?.weightedWi ?? row?.Wi,
        budget = row?.budget,
        factor = row?.factor,
        weekStart = new Date(
          Date.parse(date) -
            ((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7) * 86400000,
        )
          .toISOString()
          .slice(0, 10),
        savedQuota = frozen.get(staffId + "|" + weekStart),
        R =
          savedQuota && usable
            ? savedQuota.excluded
              ? 0
              : savedQuota.quota
            : usable &&
                Number.isFinite(wi) &&
                Number.isFinite(budget) &&
                Number.isFinite(factor)
              ? Math.max(0, Math.floor(factor * (budget - wi)))
              : null;
      teachers.push({
        staffId,
        name: person.name,
        timetableName: block.name,
        cells:
          weekday < 5
            ? block.cells.slice(
                weekday * week.perDay,
                (weekday + 1) * week.perDay,
              )
            : [],
        R,
        rawR: R,
        workloadEvidence: payload?.workloadEvidence || null,
        quotaSource: payload
          ? {
              publicationId:
                savedQuota?.publication_id || payload.publicationId || null,
              publicationSequence:
                savedQuota?.publication_sequence || payload.publicationSequence || null,
              calculationVersion:
                savedQuota?.calculation_version || payload.calculationVersion,
              currentPublicationId: payload.publicationId || null,
              ...(savedQuota &&
              savedQuota.publication_id !== payload.publicationId
                ? {
                    pendingPublicationId: payload.publicationId || null,
                    appliesFrom: new Date(Date.parse(weekStart) + 7 * 86400000)
                      .toISOString()
                      .slice(0, 10),
                  }
                : {}),
            }
          : null,
        periodCap: row?.periodCap ?? null,
        capConfigured: row?.periodCap != null,
        capVerified: verified,
        capBasis: "total",
        capWorkload: row?.actualWorkload ?? null,
        capHeadroom:
          row?.periodCap != null && Number.isFinite(row?.actualWorkload)
            ? Math.max(0, row.periodCap - row.actualWorkload)
            : null,
        weeklyCells: block.cells,
      });
    }
    days[date] = {
      id: entry.id,
      modelId: entry.id,
      modelReference: entry,
      parity,
      verified: cal?.available === true,
      schoolDay:
        cal?.available === true &&
        cal.schoolDay === true &&
        weekday < 5 &&
        !!week,
      periods,
      teachers,
      teacherIdentities: teachers.map((t) => ({
        staffId: t.staffId,
        name: t.name,
        timetableName: t.timetableName,
      })),
      endOfDayMinutes: model.timing.endOfDayMinutes ?? 810,
      recesses: model.recesses || [],
      quotaSource: payload
        ? {
            publicationId: payload.publicationId || null,
            publicationSequence: payload.publicationSequence || null,
          }
        : null,
      formClasses: payload?.formClasses || [],
      teachingGroups: payload?.teachingGroups || [],
      subjectCategories: payload?.subjectCategories || {},
      warning: cal?.available !== true ? "Calendar date is unavailable." : "",
    };
  }
  const user = {
    staffId: principal.staffId,
    email: principal.email || principal.actorId,
    smc: principal.capabilities.includes("roster.write"),
    admin:
      principal.capabilities.includes("admin") ||
      principal.capabilities.includes("roster.admin"),
    accessVerified: true,
  };
  const base = {
    user,
    people,
    days,
    baselineDays: days,
    timetableEntries: entries,
    today,
    minute,
    now,
    iso: new Date(now).toISOString(),
    uuid: () => crypto.randomUUID(),
    quotaRequested: needsQuota,
    smcIds: projection.smcIds || [],
    dutySources: Object.fromEntries(
      range.dates.map((date) => [
        date,
        {
          available: true,
          staffIds: projection.smcIds || [],
          source: { kind: "Contacts", revision: projection.revision },
        },
      ]),
    ),
    venues: Object.fromEntries(
      range.dates.map((d) => [d, payload?.venues || []]),
    ),
    notificationsConfigured: env.WHATSAPP_ENABLED === "true",
    lseNoticeEnabled: true,
    adminRecipients: [],
    calendarDatesVerified: calendar.rows
      .filter((r) => r.available)
      .map((r) => r.date),
    resubmission: true,
    intakeDeduplicate: true,
    attendanceOnly: ctx.body.operation === "saveAbsence",
    subjects: [
      ...new Set(
        [...models.values()].flatMap((m) =>
          ["single", "odd", "even"]
            .filter((k) => m[k])
            .flatMap((k) =>
              m[k].blocks.flatMap((b) =>
                b.cells.map((c) => c[0]).filter(Boolean),
              ),
            ),
        ),
      ),
    ],
    teachingGroups: payload?.teachingGroups || [],
    availablePeriods: Array.from({ length: 17 }, (_, i) => i),
    schedulerAvailable: true,
  };
  const domain = Operations.composeStaplerContext(loaded.state, base);
  const capEvidence = needsQuota
    ? await effectiveWeeklyCaps(ctx, loaded, range, {
        entries,
        models,
        publication: payload,
      })
    : { byKey: {}, dependencies: [], sourceDays: [] };
  dependencies.push(...capEvidence.dependencies);
  for (const [date, day] of Object.entries(domain.days))
    for (const teacher of day.teachers || []) {
      const current =
        capEvidence.byKey[teacher.staffId + "|" + Allocation.monday(date)];
      if (current) {
        Object.assign(teacher, current);
        day.subjectCategories = {
          ...(day.subjectCategories || {}),
          ...current.subjectCategories,
        };
        if (domain.baselineDays?.[date])
          domain.baselineDays[date].subjectCategories = {
            ...(domain.baselineDays[date].subjectCategories || {}),
            ...current.subjectCategories,
          };
      }
    }
  // The retained operation model subtracts charged R from cap headroom. Adapt
  // only its cap projection so zero-charge physical duties still consume the
  // employment cap; do not change immutable Deploy workload or weekly R.
  const weeklyCapacity = new Map();
  for (const a of Allocation.accounted(loaded.state, domain)) {
    const key = a.staffId + "|" + Allocation.monday(a.date),
      value = weeklyCapacity.get(key) || { charge: 0, slots: new Map() };
    value.charge += Allocation.cost(a);
    if (Number.isInteger(a.period)) {
      const slot = a.date + "|" + a.period,
        occupied =
          a.occupiedPeriods ??
          a.additionalOccupied ??
          (a.combination || a.repurposedDuty ? 0 : 1),
        prior = value.slots.get(slot) || { occupied: 0, charged: 0 };
      value.slots.set(slot, {
        occupied: Math.max(prior.occupied, occupied),
        charged: prior.charged + Allocation.cost(a),
      });
    }
    weeklyCapacity.set(key, value);
  }
  const adjusted = new Set();
  for (const [date, day] of Object.entries(domain.days))
    for (const teacher of day.teachers || []) {
      if (adjusted.has(teacher) || !Number.isFinite(teacher.capHeadroom))
        continue;
      adjusted.add(teacher);
      const value = weeklyCapacity.get(
        teacher.staffId + "|" + Allocation.monday(date),
      );
      if (!value) continue;
      const occupied = [...value.slots.values()].reduce(
        (n, v) => n + v.occupied,
        0,
      );
      // Aggregate historical R imports have no physical slot; their charge
      // cannot erase a different, evidenced zero-charge occupied period.
      const delta = [...value.slots.values()].reduce(
        (n, v) => n + Math.max(0, v.occupied - v.charged),
        0,
      );
      teacher.capHeadroom -= delta;
      // Compatibility-only reservation: the retained pure model recomputes
      // capWorkload from five days, then subtracts charged R. Carry the proven
      // physical-minus-charge delta through that computation. The frozen
      // publication and effectiveCaps evidence keep their original reservation
      // map; this projection is neither a Contacts fact nor a new R charge.
      if (delta && teacher.capVerified && teacher.capNonTeachingPeriods) {
        const key = "@roster/physical-duty-delta/v1";
        if (Object.hasOwn(teacher.capNonTeachingPeriods, key)) {
          teacher.capVerified = false;
          teacher.capHeadroom = null;
          teacher.capVerificationReason =
            "The source reservation map uses a reserved internal evidence key.";
        } else
          teacher.capNonTeachingPeriods = {
            ...teacher.capNonTeachingPeriods,
            [key]: delta,
          };
      }
      teacher.capAccounting = {
        charged: value.charge,
        occupied,
        derivedPhysicalDelta: delta,
        source: "owner-week-accounting",
      };
    }
  const localGuards = range.dates
    .filter(
      (d) =>
        !loaded.state.staplerPlans.some(
          (p) => p.date === d && Operations.readyStaplerPlan(p),
        ),
    )
    .map((d) => Roster.active(entries, d))
    .filter(Boolean)
    .map((e) => ({
      sql: "SELECT revision=? AND pruned=0 AS ok FROM roster_baselines WHERE school_id=? AND baseline_id=?",
      args: [e.revision, schoolId, e.id],
    }));
  if (
    localGuards.length ||
    capEvidence.sourceDays.some((d) => d.kind === "baseline")
  )
    localGuards.push({
      sql: "SELECT COALESCE((SELECT revision FROM roster_scopes WHERE school_id=? AND scope='baselines'),0)=? AS ok",
      args: [schoolId, baselineRevision],
    });
  if (needsQuota)
    for (const [week, revision] of Object.entries(
      loaded.accountingRevisions || {},
    ))
      localGuards.push({
        sql: "SELECT COALESCE((SELECT revision FROM roster_scopes WHERE school_id=? AND scope=?),0)=? AS ok",
        args: [schoolId, "week:" + week, revision],
      });
  localGuards.push({
    sql: "SELECT COALESCE((SELECT revision FROM roster_scopes WHERE school_id=? AND scope='config'),0)=? AS ok",
    args: [schoolId, configRevision],
  });
  return {
    ...domain,
    calendarByDate,
    projection,
    publication: payload,
    workloadEvidence: !needsQuota ? null : payload?.workloadEvidence || { quality: "verified",
      sourceKind: "publication", sourceId: payload?.publicationId || null,
      sourceRevision: payload?.publicationSequence || null },
    effectiveCaps: capEvidence.byKey,
    dependencies,
    entries,
    models,
    raw: base,
    localGuards,
  };
}
