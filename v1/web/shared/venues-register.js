import { encodeWorkbook, decodeWorkbook, download } from "./workbooks.mjs";

const api = window.GSISV1;
const node = (tag, text) => {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  return value;
};
let context, epoch = 0, dialog, pending, storageKey, busy = false;
const status = (message) => {
  const target = (dialog?.open && dialog.querySelector("[data-register-status]")) || document.querySelector("[data-register-message]");
  if (target) target.textContent = message;
};
window.addEventListener("gsis:clear-protected-state", () => {
  delete window.GSISV1VenueRegisterContext;
  epoch++; context = null; pending = null; storageKey = null; busy = false;
  dialog?.remove(); dialog = null;
  document.querySelector("#v1VenueRegister")?.replaceChildren();
});
function button(label, handler) {
  const value = node("button", label);
  value.type = "button";
  value.onclick = () => Promise.resolve().then(handler).catch(error => status(error.message));
  return value;
}
function projectionWorkbook() {
  return {schemaVersion: 1, metadata: {schemaVersion: 1, module: "venues-register", schoolId: context.register.schoolId, mode: "editable"}, sheets: {Rooms: {columns: context.register.columns, rows: context.register.venues.map(room => context.register.columns.map(key => ["aliases", "features"].includes(key) ? room[key].join("\n") : room[key]))}}};
}
async function exportRegister() {
  const captured = epoch, workbook = projectionWorkbook(), bytes = await encodeWorkbook(workbook);
  if (captured !== epoch) throw Error("Account changed. Export cancelled.");
  download(bytes, "GSiS-Physical-Room-Register.xlsx");
  status("Register exported. Keep Metadata and permanent IDs. Blank capacity means unknown. Rows omitted from an import are retained.");
}
function openDialog(title) {
  if (busy || pending) { status("Check the original register save before starting another."); return null; }
  dialog?.remove();
  dialog = node("dialog"); dialog.className = "gsis-import-preview"; dialog.setAttribute("aria-label", title);
  dialog.append(node("h2", title));
  const message = node("p"); message.dataset.registerStatus = ""; message.setAttribute("role", "status"); dialog.append(message);
  const close = button("Close", () => dialog.close()); close.dataset.registerClose = ""; dialog.append(close);
  document.body.append(dialog); dialog.showModal();
  return dialog;
}
function lock(value) {
  busy = value;
  if (dialog) for (const control of dialog.querySelectorAll("input,textarea,select,button")) control.disabled = value || (!!pending && !control.hasAttribute("data-register-recover") && !control.hasAttribute("data-register-close"));
}
async function confirmPreview(input, host) {
  const captured = epoch;
  lock(true); status("Validating the current register…");
  try {
    const preview = await window.VenuesAPI.read({operation: "registerPreview", ...input});
    if (captured !== epoch || !host.isConnected) return;
    host.querySelector("[data-register-preview]")?.remove();
    const result = node("div"); result.dataset.registerPreview = "";
    result.append(node("p", `${preview.created} new rooms; ${preview.updated} existing rooms. Nothing is saved yet. Existing booking policy and omitted rooms remain intact.`));
    const table = node("table"), header = node("tr");
    for (const label of ["Permanent ID", "Unit", "Name", "Seating capacity", "Class-slot capacity", "Revision"]) header.append(node("th", label));
    const head = node("thead"); head.append(header); table.append(head);
    const body = node("tbody");
    for (const room of preview.venues) { const row = node("tr"); for (const value of [room.id, room.unit, room.name, room.capacity ?? "Unknown", room.classSlotCapacity ?? "Unknown", room.revision]) row.append(node("td", value)); body.append(row); }
    table.append(body); result.append(table);
    result.append(button("Confirm register changes", () => save({operation: "importVenues", operationId: crypto.randomUUID(), venues: preview.venues})));
    host.append(result); status("Preview ready. Review every room before confirming.");
  } finally { if (captured === epoch) lock(false); }
}
function editRoom(room) {
  const host = openDialog(room ? "Edit physical room" : "Add physical room");
  if (!host) return;
  const form = node("form"); form.className = "gsis-formrow";
  const record = room ? structuredClone(room) : {id: crypto.randomUUID(), revision: 0, capacity: null, classSlotCapacity: 1};
  form.append(node("p", `Permanent ID: ${record.id}. ${room ? "Unit identity stays fixed." : "A new room starts unavailable for booking; set its policy in room settings."}`));
  for (const [key, label] of [["unit", "Unit"], ["name", "Room name"], ["shortName", "Short name"], ["capacity", "Seating capacity (blank means unknown)"], ["capacityBasis", "Capacity basis"], ["classSlotCapacity", "Class-slot capacity (blank means unknown)"], ["notes", "Notes"]]) {
    const wrapper = node("label", label), field = node(key === "notes" ? "textarea" : "input");
    field.name = key; field.value = record[key] ?? ""; field.maxLength = key === "notes" ? 2000 : 300;
    if (["unit", "name"].includes(key)) field.required = true;
    if (key === "unit" && room) field.readOnly = true;
    if (key === "capacity") {field.type = "number"; field.min = "0"; field.max = "100000"; field.step = "1";}
    if (key === "classSlotCapacity") {field.type = "number"; field.min = "1"; field.max = "20"; field.step = "1";}
    wrapper.append(field); form.append(wrapper);
  }
  const preview = node("button", "Preview room changes"); preview.type = "submit"; form.append(preview);
  form.addEventListener("input", () => host.querySelector("[data-register-preview]")?.remove());
  form.onsubmit = event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    values.capacity = values.capacity === "" ? null : Number(values.capacity);
    values.classSlotCapacity = values.classSlotCapacity === "" ? null : Number(values.classSlotCapacity);
    confirmPreview({venues: [{...record, ...values}]}, host).catch(error => status(error.message));
  };
  host.append(form);
}
function importRegister() {
  const host = openDialog("Import physical room register");
  if (!host) return;
  host.append(node("p", "Use Export All from this register. Keep permanent IDs and the Metadata sheet. Blank capacity stays unknown. A missing row never deletes a room. Create new permanent IDs through Add physical room, then export them for bulk editing."));
  const label = node("label", "Register workbook"), file = node("input"); file.type = "file"; file.accept = ".xlsx"; file.dataset.registerFile = ""; label.append(file); host.append(label);
  let selection = 0;
  file.onchange = async () => {
    const captured = epoch, selected = ++selection;
    try {
      host.querySelector("[data-register-preview]")?.remove();
      if (!file.files[0]) return;
      if (file.files[0].size > 8 * 1024 * 1024) throw Error("Choose a workbook no larger than 8 MiB.");
      const workbook = await decodeWorkbook(await file.files[0].arrayBuffer());
      if (captured === epoch && selected === selection && host.isConnected) await confirmPreview({workbook}, host);
    } catch (error) { if (captured === epoch && selected === selection) status(error.message); }
  };
}
async function save(body) {
  const captured = epoch;
  if (busy || pending) return;
  pending = body;
  // Persist intent before sending, so reload cannot turn an uncertain save into a new operation.
  try { sessionStorage.setItem(storageKey, JSON.stringify(pending)); }
  catch { pending = null; throw Error("Recovery storage is unavailable. Allow session storage before saving."); }
  lock(true); status("Saving the physical room register…");
  try { await api.request("venues", "/command", {method: "POST", body: {...body, operation: "importVenues"}}); }
  catch (error) { if (captured === epoch) status(error.message + " Checking the original receipt…"); }
  finally { if (captured === epoch) {lock(false); await recover(false);} }
}
async function recover(retry = true) {
  if (!pending || busy) return;
  const captured = epoch, operation = pending;
  lock(true);
  try {
    let result = await api.request("venues", "/receipt", {method: "POST", body: {operationId: operation.operationId}});
    if (captured !== epoch) return;
    if (retry && ["unknown", "prepared"].includes(result.state)) {
      await api.request("venues", "/command", {method: "POST", body: {...operation, operation: "importVenues"}});
      if (captured !== epoch) return;
      result = await api.request("venues", "/receipt", {method: "POST", body: {operationId: operation.operationId}});
    }
    if (captured !== epoch) return;
    if (result.state === "committed" && result.operationId === operation.operationId) {
      pending = null; sessionStorage.removeItem(storageKey); dialog?.close();
      await context.refresh();
      if (captured === epoch) status("Physical room register saved. Other modules see these rooms on their next reference refresh.");
    } else if (result.state === "aborted") {
      pending = null; sessionStorage.removeItem(storageKey); dialog?.querySelector("[data-register-preview]")?.remove(); status("Confirmed not saved. Reload the register and preview your changes again.");
    } else status("Save outcome is not confirmed. Check or retry this original save before editing again.");
  } catch (error) { if (captured === epoch) status(error.message + " Original save retained; check it again."); }
  finally { if (captured === epoch) {lock(false); recoveryControl();} }
}
function recoveryControl() {
  const host = dialog?.open ? dialog : document.querySelector("#v1VenueRegister");
  host?.querySelector("[data-register-recover]")?.remove();
  if (pending && host) {const value = button("Check / retry original register save", () => recover()); value.dataset.registerRecover = ""; host.append(value);}
}
async function mount(next) {
  context = next;
  const captured = epoch, host = document.querySelector("#v1VenueRegister");
  if (!host || !next.register) return;
  host.replaceChildren(node("h3", "Shared physical room register"));
  host.append(node("p", "Create rooms here before refreshing room references in Deploy or mapping a Roster import. Room metadata does not supply timetable occupancy. Seating capacity is separate from future class-slot capacity."));
  const message = node("p"); message.dataset.registerMessage = ""; message.setAttribute("role", "status"); host.append(message);
  const session = await api.getSession();
  if (captured !== epoch || !host.isConnected) return;
  storageKey = `gsis-venues-register:${session.schoolId}:${session.user.accountId}`;
  try { const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null"); if (saved?.operation === "importVenues" && saved.operationId && Array.isArray(saved.venues)) pending = saved; } catch {status("Stored register recovery data could not be read.");}
  const previewOnly = !!session.impersonation || !!session.impersonating;
  const add = button("Add physical room", () => editRoom()); add.disabled = previewOnly; host.append(add);
  const table = node("table"); table.id = "v1PhysicalRooms";
  const head = node("thead"), header = node("tr");
  for (const label of ["Unit", "Room name", "Seating capacity", "Class-slot capacity", "Permanent ID", "Edit"]) header.append(node("th", label)); head.append(header); table.append(head);
  const body = node("tbody");
  for (const room of next.register.venues) {
    const row = node("tr");
    for (const value of [room.unit, room.name, room.capacity ?? "Unknown", room.classSlotCapacity ?? "Unknown", room.id]) row.append(node("td", value));
    const action = node("td"), edit = button("Edit " + room.unit, () => editRoom(room)); edit.disabled = previewOnly; action.append(edit); row.append(action); body.append(row);
  }
  table.append(body); const scroll = node("div"); scroll.className = "gsis-scroll"; scroll.append(table); host.append(scroll);
  if (!next.register.venues.length) host.append(node("p", "No physical rooms yet. Add a room or import a register workbook with explicit permanent IDs."));
  const register = () => window.GSISCoreTables?.register("#v1PhysicalRooms", {exportAll: exportRegister, ...(!previewOnly ? {importAll: importRegister} : {})});
  register(); window.addEventListener("gsis:tables-ready", register, {once: true});
  recoveryControl();
}
window.GSISV1VenueRegisterMount = next => mount(next).catch(error => status(error.message));
if (window.GSISV1VenueRegisterContext) window.GSISV1VenueRegisterMount(window.GSISV1VenueRegisterContext);
