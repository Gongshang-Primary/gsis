/** Self-contained so the build adapter can embed this exact owner display rule. */
export function previewTTb(profile, presentation = {}, { retainBasicNameTags = false } = {}) {
  if (
    !profile ||
    typeof profile.basicName !== "string" ||
    !profile.basicName.trim()
  )
    return { available: false, reason: "BASIC_NAME_MISSING" };
  if (profile.subjectTags != null && !Array.isArray(profile.subjectTags))
    return { available: false, reason: "FIELD_EVIDENCE_UNAVAILABLE" };
  const requiredSubjectTags =
    ["MTL", "PE", "Art", "Music"].includes(profile.role) &&
    !(profile.subjectTags ?? []).includes(profile.role)
      ? [profile.role]
      : [];
  const tags = [],
    seen = new Set();
  for (const field of ["employmentTags", "subjectTags", "mkTags"]) {
    const supplied = profile[field] ?? [];
    if (
      !Array.isArray(supplied) ||
      supplied.some((value) => typeof value !== "string")
    )
      return { available: false, reason: "FIELD_EVIDENCE_UNAVAILABLE" };
    const retained = presentation[field];
    if (
      retained &&
      (retained.available === false || !Array.isArray(retained.items))
    )
      return { available: false, reason: "FIELD_EVIDENCE_UNAVAILABLE" };
    const values =
      field === "subjectTags"
        ? [...supplied, ...requiredSubjectTags]
        : supplied;
    const items = values.map((value, index) => {
      const old = retained?.items.find((item) => item.value === value);
      return {
        value,
        label: old?.label ?? value,
        visible:
          old?.visible ??
          !["primary", "eo", "full-time", "full time", "specialist"].includes(
            value.toLowerCase(),
          ),
        order: old?.order ?? index,
        index,
      };
    });
    if (retained?.legacy)
      items.sort((a, b) => a.order - b.order || a.index - b.index);
    for (const item of items) {
      if (!item.visible || seen.has(item.value) || seen.has(item.label))
        continue;
      tags.push(item.label);
      seen.add(item.value);
      seen.add(item.label);
    }
  }
  const suffix = profile.nameSuffix;
  if (suffix !== undefined && suffix !== null && typeof suffix !== "string")
    return { available: false, reason: "FIELD_EVIDENCE_UNAVAILABLE" };
  if (suffix && !seen.has(suffix)) tags.push(suffix);
  const basicName = profile.basicName.trim();
  const suffixes = tags.map((value) => ` (${value})`);
  // Deploy can have a legacy Basic Name with a tag already in the text.
  // Preserve that input and avoid displaying the same suffix a second time.
  if (retainBasicNameTags) {
    let remainder = basicName;
    while (true) {
      const index = suffixes.findIndex((tag) => remainder.endsWith(tag));
      if (index < 0) break;
      remainder = remainder.slice(0, -suffixes[index].length);
      suffixes.splice(index, 1);
    }
  }
  const name = basicName + suffixes.join("");
  if (name.length > 160)
    return { available: false, reason: "TTB_NAME_TOO_LONG" };
  return { available: true, name, requiredSubjectTags };
}
