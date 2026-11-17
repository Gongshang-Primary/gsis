// Ordinary version-owned Dept membership. This module never grants access.
export function departmentReferences(groups) {
  return (groups || []).flatMap(group => {
    const references = [];
    for (const field of ["slots", "additionalDeputies", "tls"])
      for (const [index, staffId] of (group[field] || []).entries()) {
        if (typeof staffId !== "string" || !staffId) continue;
        const position = field === "tls" ? "TL" : field === "additionalDeputies" ? "Deputy"
          : index === 0 ? "Head" : index === 1 ? "Deputy" : "Member";
        references.push({ staffId, departmentId: group.id, departmentName: group.name,
          field, index, position });
      }
    return references;
  });
}

export function departmentMemberships(groups) {
  const result = new Map();
  for (const { staffId, departmentId } of departmentReferences(groups)) {
    if (!result.has(staffId)) result.set(staffId, new Set());
    result.get(staffId).add(departmentId);
  }
  return result;
}

export function departmentChangeConflicts(beforeGroups, afterGroups) {
  const before = departmentMemberships(beforeGroups), after = departmentMemberships(afterGroups);
  return [...after].flatMap(([staffId, ids]) => {
    const prior = before.get(staffId) || new Set();
    return ids.size > 1 && [...ids].some(id => !prior.has(id))
      ? [{ staffId, priorDepartmentIds: [...prior], departmentIds: [...ids] }] : [];
  });
}

export function retainedDepartmentConflicts(groups) {
  return [...departmentMemberships(groups)].flatMap(([staffId, ids]) =>
    ids.size > 1 ? [{ staffId, departmentIds: [...ids] }] : []);
}

/** A native picker adds a person to one target; imports must not guess one. */
export function proposedDepartmentMoves(beforeGroups, afterGroups) {
  const before = departmentMemberships(beforeGroups), after = departmentMemberships(afterGroups);
  const oldReferences = departmentReferences(beforeGroups);
  return [...after].flatMap(([staffId, ids]) => {
    const prior = before.get(staffId) || new Set();
    const added = [...ids].filter(id => !prior.has(id));
    if (!prior.size || !added.length || ids.size < 2) return [];
    if (added.length !== 1)
      throw Error("Choose one destination department before moving this teacher.");
    return [{ staffId, targetDepartmentId: added[0],
      previous: oldReferences.filter(row => row.staffId === staffId),
      target: departmentReferences(afterGroups).filter(row =>
        row.staffId === staffId && row.departmentId === added[0]) }];
  });
}

/** Remove only this person's other Dept references; keep other roles in place. */
export function applyDepartmentMoves(groups, moves) {
  let result = structuredClone(groups);
  for (const { staffId, targetDepartmentId } of moves) {
    const target = departmentReferences(result).filter(row =>
      row.staffId === staffId && row.departmentId === targetDepartmentId);
    if (target.length !== 1)
      throw Error("Choose one position in the destination department.");
    result = result.map(group => {
      if (group.id === targetDepartmentId) return group;
      const old = departmentReferences([group]);
      if (!old.some(row => row.staffId === staffId)) return group;
      const next = { ...group, slots: group.slots.slice(0, 2)
        .map(id => id === staffId ? "" : id)
        .concat(group.slots.slice(2).filter(id => id && id !== staffId)) };
      for (const field of ["additionalDeputies", "tls"])
        if (Object.hasOwn(group, field)) next[field] = group[field].filter(id => id !== staffId);
      return next;
    });
  }
  return result;
}
