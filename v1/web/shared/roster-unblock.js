/* Version-owned presentation adapters; the copied v0.9 screens remain intact. */
const label = "Estimated workload — saved Deploy planning data. Automatic publication is blocked.";
let evidence = null;
let baselines = [];
const banner = document.createElement("p");
const mappingBanner = document.createElement("p");
mappingBanner.dataset.rosterMappingWarning = "";
mappingBanner.setAttribute("role", "status");
banner.dataset.rosterWorkload = "";
banner.setAttribute("role", "status");
function draw() {
  const host = document.getElementById("content");
  const mappingHost = host?.querySelector("#savedTimetables");
  const missing = baselines.filter(row => row.unmappedVenueLabels?.length);
  if (mappingHost && missing.length) {
    const text = "Venue occupancy is incomplete for: " + missing.map(row => row.name + " (" + row.unmappedVenueLabels.join(", ") + ")").join("; ") + ". Original room labels are retained. Review venue mapping before publication.";
    if (mappingBanner.textContent !== text) mappingBanner.textContent = text;
    if (mappingBanner.parentElement !== mappingHost) mappingHost.prepend(mappingBanner);
  } else mappingBanner.remove();
  if (!host || evidence?.quality !== "estimated") { banner.remove(); return; }
  const text = label + (evidence.sourceName ? " " + evidence.sourceName + " · revision " + evidence.sourceRevision : " " + (evidence.reason || ""));
  if (banner.textContent !== text) banner.textContent = text;
  if (banner.parentElement !== host) host.prepend(banner);
}
window.addEventListener("gsis:roster-baselines", event => { baselines = event.detail; draw(); });
window.addEventListener("gsis:roster-workload", event => {
  const detail = event.detail;
  if (["availability", "candidates", "allocation", "health", "autoAllocate", "optimise"].includes(detail.operation) ||
      detail.operation === "read" && ["allocation", "availability", "health"].includes(detail.view)) {
    evidence = detail.evidence; draw();
  }
});
document.addEventListener("click", event => {
  if (event.target.closest("[data-page]")) { evidence = null; draw(); }
}, true);
window.addEventListener("gsis:denied", () => { evidence = null; draw(); });
const host = document.getElementById("content");
if (host) new MutationObserver(draw).observe(host, { childList: true });

function labelled(data) {
  if (data?.workloadEvidence?.quality !== "estimated") return data;
  return { ...data, snapshotLabel: "Estimated workload. " + (data.snapshotLabel || ""),
    legend: "Estimated workload. " + (data.legend || "") };
}
// Existing exporters already print these labels into their workbook headers.
// Preserve their workbook layout and style rather than rewriting the ZIP.
for (const [target, names] of [[window.RosterExport, ["dailyRelief"]],
  [window.RosterStaplerExport, ["makeReliefWorkbook", "makeClassWorkbook"]]]) {
  if (!target) continue;
  for (const name of names) if (typeof target[name] === "function") {
    const original = target[name];
    target[name] = function (data, ...rest) { return original.call(this, labelled(data), ...rest); };
  }
}
