/** Convert a verified Deploy publication using permanent source IDs, retaining Layout-local facts. */
export function publishedSnapshot(previous, source) {
  const d = source.document,
    y = source.year;
  if (previous.year !== y || Number(d.year ?? d.layoutYear ?? y) !== y)
    throw Error("Wrong year");
  const out = structuredClone(previous),
    provenance = {
      id: d.id,
      revision: source.workingRevision,
      commit: source.publicationId,
      sequence: source.sequence,
      year: y,
      name: d.name || "",
      digest: source.digest,
    };
  const classCode = (c) => {
    const level = String(c.level),
      short = String(c.shortName || c.name?.[0] || "");
    return (
      c.code ||
      level + (short.startsWith(level) ? short.slice(level.length) : short)
    );
  };
  const forms = (v) =>
    Array.isArray(v.forms)
      ? v.forms
      : Array.isArray(v.form)
        ? v.form
        : String(v.form || "")
            .split(/[,\n]/)
            .map((s) => s.trim())
            .filter(Boolean);
  const active = (r) => r.active !== false && r.active !== "N",
    id = (kind, value) =>
      `${kind}-${String(value)
        .replace(/[^A-Za-z0-9_.:-]/g, "_")
        .slice(0, 110)}`;
  function merge(table, values, kind) {
    const retained = out[table].map((r) => ({
      ...r,
      active: r.sourceId?.startsWith("mtl_allocation_") ? r.active : "N",
    }));
    for (const incoming of values) {
      if (!incoming.deployId) throw Error("Missing permanent source ID");
      const old = retained.find(
        (r) => r.deployId === incoming.deployId || r.id === incoming.deployId,
      );
      if (old)
        Object.assign(old, incoming, { active: "Y", publication: provenance });
      else
        retained.push({
          id: id(kind, incoming.deployId),
          ...incoming,
          active: "Y",
          publication: provenance,
        });
    }
    return retained;
  }
  const sourceVenues = (d.venueRegistry?.venues || d.venues || []).filter(
    active,
  );
  out.venues = merge(
    "venues",
    sourceVenues.map((v) => ({
      deployId: v.id,
      unitNumber: v.unitNumber || v.id,
      geometryUnit:
        d.unitGeometry?.[v.unitNumber || v.id] ||
        v.geometryUnit ||
        v.unitNumber ||
        v.id,
      name: v.name || v.id,
      shortName: v.shortName || "",
      block: v.block || String(v.unitNumber || v.id)[0],
      floor: Number(
        v.floor ??
          v.level ??
          String(v.unitNumber || v.id).match(/^[A-Z](\d+)/)?.[1],
      ),
      capacity: v.capacity ?? null,
    })),
    "venue",
  );
  out.classes = merge(
    "classes",
    (d.classes || []).filter(active).map((c) => ({
      deployId: c.id || c.ref,
      code: classCode(c),
      name: c.name || c.code,
      shortName: c.shortName || "",
      level: Number(c.level),
    })),
    "class",
  );
  const teachers = new Map(
    (d.teachers || []).map((t) => [
      t.id || t.staffId,
      t.name || t.ttbName || "",
    ]),
  );
  out.groups = merge(
    "groups",
    (d.groups || []).filter(active).map((g) => {
      const prior = out.groups.find(
        (r) => r.deployId === g.id || r.id === g.id,
      );
      return {
        deployId: g.id,
        code: g.code || g.name,
        level: Number(g.level ?? g.levels?.[0]),
        levels: g.levels || [Number(g.level)],
        subject: g.subject || g.subjectCode,
        weeklyPeriods: g.weeklyPeriods ?? null,
        teacherLabels:
          prior?.teacherLabels ??
          (d.assignments || [])
            .filter((a) => a.target === g.id || a.groupId === g.id)
            .map((a) => teachers.get(a.teacher || a.staffId))
            .filter(Boolean)
            .join(", "),
        pupilCount: prior?.pupilCount ?? null,
        pupilCountText: prior?.pupilCountText || "",
        programmes: prior?.programmes || "",
        notes: prior?.notes || "",
        sourceId: prior?.sourceId || "deploy:" + source.publicationId,
      };
    }),
    "tg",
  );
  const allocations = [];
  for (const c of (d.classes || []).filter(active)) {
    const target = out.classes.find((r) => r.deployId === (c.id || c.ref));
    const venue = c.venueId
      ? sourceVenues.find((v) => v.id === c.venueId)
      : sourceVenues.find((v) => forms(v).includes(classCode(c)));
    if (venue && target)
      allocations.push({
        deployId: `class:${target.deployId}`,
        kind: "homeroom",
        targetId: target.id,
        targetLabel: target.code,
        unitNumber: venue.unitNumber || venue.id,
        sourceId: "deploy:" + source.publicationId,
      });
  }
  for (const g of (d.groups || []).filter(active)) {
    const target = out.groups.find((r) => r.deployId === g.id);
    let venue = sourceVenues.find(
      (v) =>
        v.id === (g.venueId || g.venue) ||
        v.unitNumber === (g.venueId || g.venue),
    );
    if (
      !venue &&
      !g.venueId &&
      !g.venue &&
      !g.levelWide &&
      g.associationSchema !== 1
    ) {
      const anchor = (d.classes || []).find((c) =>
        g.anchorRef ? c.ref === g.anchorRef : classCode(c) === g.form,
      );
      if (anchor) {
        const rooms = sourceVenues.filter((v) =>
          forms(v).includes(classCode(anchor)),
        );
        if (rooms.length > 1) throw Error("Ambiguous group anchor venue");
        venue = rooms[0];
      }
    }
    if ((g.venueId || g.venue) && !venue) throw Error("Unknown group venue");
    if (venue && target)
      allocations.push({
        deployId: `group:${g.id}`,
        kind: "teaching_group",
        targetId: target.id,
        targetLabel: target.code,
        unitNumber: venue.unitNumber || venue.id,
        sourceId: "deploy:" + source.publicationId,
      });
  }
  out.allocations = merge("allocations", allocations, "allocation");
  out.sourceDeployVersion = provenance;
  out.state = "published";
  out.sources = [
    ...(out.sources || []),
    { id: "deploy:" + source.publicationId, publication: provenance },
  ];
  out.otherTGStatus = "Published source " + source.publicationId;
  return out;
}
