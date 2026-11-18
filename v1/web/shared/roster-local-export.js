(() => {
  const legend = "Grey: unpublished allocation or explicit No Relief Needed. Light red: UNASSIGNED. White: published allocation. Blank: no vacancy.";

  function savedPlan(source, day, date, periods) {
    const plan = source?.teacherSummary?.plan;
    if (source?.date !== date || plan?.date !== date || plan.parity !== day.parity ||
        JSON.stringify(plan.periods) !== JSON.stringify(periods)) return null;
    const matched = day.staplerRevision
      ? GSISRosterStapler.planId(plan) === day.id && source.timetableSource?.revision === day.staplerRevision
      : plan.baselineId === day.id;
    if (!matched || !Array.isArray(plan.teachers)) return null;
    const teachers = new Set(plan.teachers.map(t => t.staffId));
    if (!day.teachers.every(t => teachers.has(t.staffId))) return null;
    try {
      GSISRosterStapler.validate(plan);
      return plan;
    } catch {
      return null;
    }
  }

  function planFromTimetable(day, model, date, periods) {
    const byId = new Map((model.teachers || []).map(teacher => [teacher.id, teacher.t]));
    const teachers = day.teachers.map(teacher => {
      const cells = teacher.cells || byId.get(teacher.staffId)?.cells;
      for (const { period } of periods) {
        const cell = cells?.[period];
        if (!Array.isArray(cell) || cell.length !== 4 || cell.some(value => typeof value !== "string")) {
          throw Error(`The local timetable for ${date} is missing P${period} for ${teacher.name || teacher.staffId}.`);
        }
      }
      return { ...teacher, cells };
    });
    return GSISRosterStapler.create({
      ...day, date, periods, teachers, recesses: [],
      formClasses: day.formClasses || model.formClasses || [],
    });
  }

  function cachedStaplerSource(row) {
    const plan = row?.confirmedPlan || (row?.viewMode === "confirmed" ? row.plan : null);
    if (!plan) return null;
    return {
      date: row.date,
      timetableSource: { revision: row.confirmedRevision || row.revision },
      teacherSummary: { plan, staplerStatus: row.timetableDay?.source === "published" ? "published" : "confirmed" },
    };
  }

  function staplerRows(plan, periods, status, nameFor) {
    const rows = new Map();
    for (const { staffId, period, after } of GSISRosterStapler.changes(plan)) {
      if (!rows.has(staffId)) {
        rows.set(staffId, {
          id: "stapler:" + staffId, name: nameFor(staffId) + " · Stapler",
          cells: periods.map(() => ({ text: "", status: "blank" })),
        });
      }
      const index = periods.findIndex(p => p.period === period);
      rows.get(staffId).cells[index] = {
        text: after.filter(Boolean).join("\n") || "Suspended / available",
        status: status === "published" ? "published" : "draft",
      };
    }
    return [...rows.values()];
  }

  function context(date, view, nameFor, readCachedPlan) {
    const day = view?.timetable, model = view?.allocationModel;
    if (!day?.id || view.date !== date || (day.date && day.date !== date) ||
        day.schoolDay === false || day.verified === false) {
      throw Error(`The local school-day timetable for ${date} is unavailable.`);
    }
    if (!model || (model.date && model.date !== date) || !Array.isArray(model.assignments)) {
      throw Error(`Local allocation decisions for ${date} are missing.`);
    }
    if (!Array.isArray(view.demands) || view.demands.some(group =>
      (group.date && group.date !== date) || group.members?.some(member => member.date && member.date !== date))) {
      throw Error(`Local relief requirements for ${date} are missing or belong to another date.`);
    }
    if (!Array.isArray(view.absences)) throw Error(`Local absences for ${date} are missing.`);
    const periods = [day.periods, view.periods, model.periods].find(value => value?.length);
    if (!periods || periods.some(p => !Number.isInteger(p.period) || !Number.isFinite(p.startMinutes) || !Number.isFinite(p.endMinutes))) {
      throw Error(`The local timetable for ${date} is missing period timings.`);
    }
    const periodIds = new Set(periods.map(p => p.period));
    if (view.demands.some(group => (group.members || [group]).some(demand => !periodIds.has(demand.period)))) {
      throw Error(`The local timetable for ${date} is missing a period with a relief requirement.`);
    }
    if (!Array.isArray(day.teachers) || !day.teachers.length || day.teachers.some(t => !t.staffId || !t.name)) {
      throw Error(`The local timetable for ${date} is missing its teacher list.`);
    }
    let source = view.exportContext;
    let matched = savedPlan(source, day, date, periods);
    if (!matched && day.staplerRevision) {
      source = cachedStaplerSource(readCachedPlan());
      matched = savedPlan(source, day, date, periods);
      // Teacher cells alone omit class recesses and baseline-to-plan changes.
      if (!matched) throw Error(`The confirmed local Stapler plan for ${date} (revision ${day.staplerRevision}) is missing.`);
    }
    const plan = matched || planFromTimetable(day, model, date, periods);
    const staplerStatus = matched ? source.teacherSummary.staplerStatus : "baseline";
    const absences = view.absences.filter(a => a.date === date && !a.deletedAt).map(a => ({
      staffId: a.staffId, name: a.name || nameFor(a.staffId), periods: a.periods || [],
      ...(a.coverage ? { coverage: a.coverage } : {}), reason: a.typeLabel || "Unspecified",
    }));
    const plannedIds = new Set(plan.teachers.map(t => t.staffId));
    const addedIds = new Set([...absences, ...(view.adhoc || []).filter(a => a.date === date && !a.deletedAt)]
      .map(a => a.staffId).filter(id => id && !plannedIds.has(id)));
    const rows = [
      ...(day.staplerRevision ? staplerRows(plan, periods, staplerStatus, nameFor) : []),
      ...absences.map(a => ({ id: a.staffId, name: a.name, cells: periods.map(() => ({ text: "", status: "blank" })) })),
    ];
    const workloadEvidence = view.workloadEvidence || (matched ? source.workloadEvidence : null);
    return structuredClone({
      date, revision: view.revision, allocationRevision: view.allocationRevision || 0,
      periods, rows, workloadEvidence,
      timetableSource: view.timetableSource || (matched ? source.timetableSource : undefined),
      legend,
      teacherSummary: {
        plan, absences, demands: view.demands,
        addedTeachers: [...addedIds].map(staffId => {
          const name = nameFor(staffId);
          return { staffId, name, timetableName: name };
        }),
        staplerStatus,
      },
    });
  }

  window.GSISRosterLocalExport = { context };
})();
