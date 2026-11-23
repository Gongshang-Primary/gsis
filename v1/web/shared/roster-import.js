/* Labels remain labels; only unique exact matches suggest permanent identities. */
import "./roster-unblock.js";
const api = window.GSISV1;
const element = (tag, text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};
const exact = value => String(value || "").normalize("NFKC").trim();
const cache = new Map();
let generation = 0;
const dismissals = new Set();
window.addEventListener("gsis:clear-protected-state", () => {
  generation++; cache.clear();
  for (const dismiss of [...dismissals]) dismiss();
});
window.GSISV1RosterMapping = async function (model) {
  const epoch = generation;
  const [reference, session] = await Promise.all([api.request("roster", "/reference"), api.getSession()]);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(model)));
  if (epoch !== generation) throw Error("Account access changed. Reopen the import.");
  const key = "gsis-roster-mapping:" + session.schoolId + ":" + session.user.accountId + ":" +
    [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
  let retained = cache.get(key);
  try { retained ||= JSON.parse(sessionStorage.getItem(key) || "null"); } catch { /* No suggestion from invalid storage. */ }
  const weeks = ["single", "odd", "even"].filter(k => model[k]);
  const names = [...new Set(weeks.flatMap(k => model[k].blocks.map(b => b.name)))];
  const venues = [...new Set(weeks.flatMap(k => model[k].blocks.flatMap(b => b.cells.map(c => c[2]).filter(Boolean))))];
  const staff = reference.staff || [], rooms = reference.venues || [], bridges = reference.nameBridges || [];
  const result = { staffMapping: {}, venueMapping: {} }, unresolved = [];
  for (const name of names) {
    const candidates = new Set([
      ...staff.filter(p => exact(p.name) === exact(name)).map(p => p.staffId),
      ...bridges.filter(b => exact(b.timetableName) === exact(name)).map(b => b.staffId),
    ].filter(id => staff.some(p => p.staffId === id && p.active === true)));
    const previous = retained?.staffMapping?.[name];
    if (previous && staff.some(p => p.staffId === previous)) result.staffMapping[name] = previous;
    else if (candidates.size === 1) result.staffMapping[name] = [...candidates][0];
    else unresolved.push(name);
  }
  // A collision is never silently resolved by ordering two equally named rows.
  for (const name of names) if (result.staffMapping[name] && names.some(other =>
    other !== name && result.staffMapping[other] === result.staffMapping[name])) unresolved.push(name);
  for (const label of venues) {
    const previous = retained?.venueMapping?.[label];
    const ids = Array.isArray(previous) ? previous : typeof previous === "string" ? [previous] : null;
    result.venueMapping[label] = ids && ids.every(id => rooms.some(r => (r.venueId || r.id) === id)) ? ids :
      rooms.filter(r => exact(r.name) === exact(label)).map(r => r.venueId || r.id);
  }
  const remember = () => {
    cache.set(key, structuredClone(result));
    while (cache.size > 8) cache.delete(cache.keys().next().value);
    try {
      const keys = Object.keys(sessionStorage).filter(k => k.startsWith("gsis-roster-mapping:"));
      for (const old of keys.filter(k => k !== key).slice(0, Math.max(0, keys.length - 7))) sessionStorage.removeItem(old);
      sessionStorage.setItem(key, JSON.stringify(result));
      return true;
    } catch { return false; }
  };
  return new Promise((resolve, reject) => {
    const dialog = element("dialog"), form = element("form"), status = element("p");
    const remove = () => { dismissals.delete(dismiss); dialog.close(); dialog.remove(); };
    const dismiss = () => { remove(); reject(Error("Account access changed. Reopen the import.")); };
    dismissals.add(dismiss);
    dialog.className = "v1-panel";
    form.append(element("h2", "Confirm timetable identities"), element("p",
      `${names.length - new Set(unresolved).size} teacher labels matched exactly. Choose only unresolved identities. Room labels can map to several venues or remain flagged as unmapped.`));
    for (const name of [...new Set(unresolved)]) {
      const label = element("label", name), select = element("select");
      select.required = true;
      select.setAttribute("aria-label", "Teachers: " + name);
      select.append(new Option("Choose the exact record…", ""));
      for (const row of staff) select.append(new Option((row.name || row.staffId) + " · " + row.staffId +
        (row.active === false ? " (inactive)" : ""), row.staffId));
      select.value = result.staffMapping[name] || "";
      select.onchange = () => { result.staffMapping[name] = select.value; remember(); };
      label.append(select); form.append(label);
    }
    if (venues.length && !rooms.length) {
      const notice = element("div");
      notice.className = "v1-notice";
      notice.dataset.venuesEmptyGuidance = "true";
      notice.setAttribute("role", "status");
      const msg = element(
        "p",
        "No rooms are registered in the Venues physical register yet. Add or import rooms in Venues Administration before mapping timetable room labels, or keep labels unmapped for now.",
      );
      const link = element("a", "Open Venues Administration");
      link.href = "/venues/";
      notice.append(msg, link);
      form.append(notice);
    }
    for (const name of venues) {
      const label = element("label", name), select = element("select"), keep = element("input"), keepLabel = element("label", "Keep label unmapped");
      select.multiple = true; select.size = Math.min(5, Math.max(2, rooms.length));
      select.setAttribute("aria-label", "Venues: " + name);
      for (const row of rooms) select.append(new Option(row.name || row.venueId || row.id, row.venueId || row.id));
      for (const option of select.options) option.selected = result.venueMapping[name].includes(option.value);
      keep.type = "checkbox"; keep.checked = !result.venueMapping[name].length;
      keep.setAttribute("aria-label", "Keep unmapped: " + name);
      select.onchange = () => { result.venueMapping[name] = [...select.selectedOptions].map(o => o.value);
        keep.checked = !result.venueMapping[name].length; remember(); };
      keep.onchange = () => { if (keep.checked) { for (const option of select.options) option.selected = false;
        result.venueMapping[name] = []; remember(); } };
      keepLabel.prepend(keep); label.append(select); form.append(label, keepLabel);
    }
    const cancel = element("button", "Cancel"), confirm = element("button", "Confirm identity mapping");
    cancel.type = "button"; confirm.type = "submit";
    cancel.onclick = () => { remember(); remove(); reject(Error("Import cancelled before any write.")); };
    form.append(status, cancel, confirm); dialog.append(form); document.body.append(dialog);
    form.onsubmit = event => {
      event.preventDefault();
      const ids = names.map(name => result.staffMapping[name]);
      if (ids.some(id => !id) || new Set(ids).size !== ids.length) {
        status.textContent = "Each source teacher must map to a different permanent Staff ID."; return;
      }
      remember(); remove(); resolve(structuredClone(result));
    };
    dialog.addEventListener("cancel", event => { event.preventDefault(); cancel.click(); });
    dialog.showModal();
  });
};
