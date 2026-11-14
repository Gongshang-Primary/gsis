import { encodeWorkbook, decodeWorkbook, download } from "./workbooks.mjs";
const api = window.GSISV1;
const scopes = [
  "IP",
  "TG",
  "Dept",
  "Teachers",
  "Exclusions",
  "Membership",
  "Offload",
  "HR Terms",
  "Span of Control",
];
const panel = document.createElement("details");
panel.className = "gsis-panel";
panel.innerHTML =
  '<summary>Canonical Excel and publication receipts</summary><p>Save changes a draft. Publish makes the selected saved revision active. Contacts proposals and recipient deliveries have independent outcomes.</p><div class="gsis-formrow"><label>Table scope<select data-scope></select></label><button data-export>Export All · importable</button><label>Import Export All workbook<input type="file" data-import accept=".xlsx"></label></div><p data-status role="status"></p><div data-preview></div><form data-receipt class="gsis-formrow"><label>Publication operation ID<input data-operation required></label><button>Check original receipt</button></form><div data-result></div>';
for (const scope of scopes) {
  const option = document.createElement("option");
  option.value = option.textContent = scope;
  panel.querySelector("[data-scope]").append(option);
}
document.body.append(panel);
const status = panel.querySelector("[data-status]"),
  previewHost = panel.querySelector("[data-preview]");
let pendingPreview = null,
  workbook = null,
  matchStaff = [],
  applyOperation = null,
  applyRequest = null,
  applyLease = null;
function version() {
  const value = document.getElementById("version")?.value;
  if (!value) throw Error("Select a saved planning version first.");
  return value;
}
function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle("gsis-error", error);
}
function showReceipt(result, host = panel.querySelector("[data-result]")) {
  host.replaceChildren();
  const receipt = result.receipt || result;
  const text = document.createElement("p");
  text.textContent =
    receipt.state === "committed"
      ? "Publication committed."
      : receipt.state === "terminal-not-committed"
        ? "Publication did not commit."
        : receipt.state === "pending"
          ? "Publication is pending."
          : "The publication outcome is not yet confirmed.";
  host.append(text);
  const info = document.createElement("pre");
  info.className = "gsis-code";
  info.textContent = JSON.stringify(
    {
      operationId: receipt.operationId,
      publicationId: receipt.publicationId || receipt.result?.publicationId,
      sequence: receipt.publicationSequence || receipt.result?.sequence,
      reason: receipt.reason,
      currentPointer: result.currentPointer,
      deliveries: result.deliveries,
    },
    null,
    2,
  );
  host.append(info);
}
panel.querySelector("[data-export]").onclick = async () => {
  try {
    message("Preparing canonical workbook…");
    const data = await api.request("deploy", "/export", {
      method: "POST",
      body: {
        versionId: version(),
        scope: panel.querySelector("[data-scope]").value,
      },
    });
    download(
      await encodeWorkbook(data),
      "GSiS-" +
        data.metadata["Table Scope"] +
        "-" +
        data.metadata["Version ID"] +
        ".xlsx",
    );
    message(
      "Export All is ready. Keep its Metadata and stable IDs when editing.",
    );
  } catch (error) {
    message(error.message, true);
  }
};
panel.querySelector("[data-receipt]").onsubmit = async (event) => {
  event.preventDefault();
  try {
    const result = await api.request("deploy", "/receipt", {
      method: "POST",
      body: {
        operationId: panel.querySelector("[data-operation]").value.trim(),
        versionId: version(),
      },
    });
    showReceipt(result);
  } catch (error) {
    message(error.message, true);
  }
};
function resolvePicker(cell, sheet, row, index) {
  document.querySelector("[data-staff-picker]")?.remove();
  const picker = document.createElement("div");
  picker.dataset.staffPicker = "";
  picker.style.cssText =
    "position:fixed;z-index:9999;width:300px;max-height:300px;overflow:auto;background:white;border:1px solid #789;padding:8px;box-shadow:0 3px 15px #0002";
  const bounds = cell.getBoundingClientRect();
  picker.style.left = Math.min(bounds.left, innerWidth - 310) + "px";
  picker.style.top = Math.min(bounds.bottom, innerHeight - 310) + "px";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Search part of a staff name";
  input.setAttribute("aria-label", "Resolve staff identity");
  const list = document.createElement("div"),
    close = document.createElement("button");
  close.textContent = "Cancel";
  close.onclick = () => picker.remove();
  picker.append(input, list, close);
  function filter() {
    list.replaceChildren();
    const term = input.value.trim().toLowerCase();
    for (const staff of matchStaff
      .filter((s) =>
        [s.name, s.ttbName, s.id].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(term),
        ),
      )
      .slice(0, 30)) {
      const button = document.createElement("button");
      button.style.display = "block";
      button.textContent = (staff.ttbName || staff.name) + " · " + staff.id;
      button.onclick = () => {
        row[index] = staff.id;
        const nameIndex = sheet.columns.indexOf("TTb Name");
        if (nameIndex >= 0) row[nameIndex] = staff.ttbName || staff.name;
        picker.remove();
        pendingPreview = null;
        renderWorkbook();
      };
      list.append(button);
    }
    if (!list.childNodes.length)
      list.textContent =
        "No matching staff. Create or select an existing permanent identity in Contacts.";
  }
  input.oninput = filter;
  document.body.append(picker);
  filter();
  input.focus();
}
function renderWorkbook() {
  previewHost.replaceChildren();
  if (!workbook) return;
  const metadata = document.createElement("p");
  metadata.textContent =
    "School " +
    workbook.metadata["School ID"] +
    " · version " +
    workbook.metadata["Version ID"] +
    " · base " +
    workbook.metadata["Base Working Revision"] +
    " · " +
    workbook.metadata["Table Scope"];
  previewHost.append(metadata);
  for (const [name, sheet] of Object.entries(workbook.sheets)) {
    const heading = document.createElement("h3");
    heading.textContent = name;
    previewHost.append(heading);
    const scroll = document.createElement("div");
    scroll.className = "gsis-scroll";
    const table = document.createElement("table"),
      thead = document.createElement("thead"),
      hr = document.createElement("tr");
    for (const column of sheet.columns) {
      const th = document.createElement("th");
      th.textContent = column;
      hr.append(th);
    }
    thead.append(hr);
    table.append(thead);
    const tbody = document.createElement("tbody");
    for (const row of sheet.rows) {
      const tr = document.createElement("tr");
      sheet.columns.forEach((name, index) => {
        const td = document.createElement("td");
        td.textContent = row[index] === null ? "" : String(row[index] ?? "");
        if (name === "Staff ID" && !row[index]) {
          td.className = "gsis-error";
          const button = document.createElement("button");
          button.textContent = "Resolve Staff ID";
          button.onclick = () => resolvePicker(td, sheet, row, index);
          td.append(button);
        }
        tr.append(td);
      });
      tbody.append(tr);
    }
    table.append(tbody);
    scroll.append(table);
    previewHost.append(scroll);
  }
  const validate = document.createElement("button");
  validate.textContent = "Validate and compare replacement";
  validate.disabled = !!applyRequest;
  validate.onclick = validateWorkbook;
  previewHost.append(validate);
  if (pendingPreview) {
    const diff = document.createElement("pre");
    diff.className = "gsis-code";
    diff.textContent = JSON.stringify(pendingPreview.diff, null, 2);
    previewHost.append(diff);
    const errors = pendingPreview.errors || [];
    for (const error of errors) {
      const p = document.createElement("p");
      p.className = "gsis-error";
      p.textContent = typeof error === "string" ? error : JSON.stringify(error);
      previewHost.append(p);
    }
    const apply = document.createElement("button");
    apply.className = "primary";
    apply.textContent = "Confirm atomic replacement";
    apply.disabled = !!errors.length || !api.capable("deploy.edit");
    apply.onclick = applyWorkbook;
    previewHost.append(apply);
  }
}
async function validateWorkbook() {
  try {
    message("Validating current scope, references and base revision…");
    pendingPreview = await api.request("deploy", "/imports/preview", {
      method: "POST",
      body: { versionId: version(), workbook },
    });
    applyOperation = crypto.randomUUID();
    applyRequest = null;
    applyLease = null;
    renderWorkbook();
    message(
      pendingPreview.errors?.length
        ? "Resolve the displayed errors before confirmation."
        : "Review the replacement diff. No draft data has changed.",
    );
  } catch (error) {
    pendingPreview = null;
    message(error.message, true);
  }
}
async function applyWorkbook() {
  if (!pendingPreview) return;
  const input = panel.querySelector("[data-import]");
  input.disabled = true;
  try {
    const versionId = version(),
      revision = pendingPreview.baseRevision,
      scope = pendingPreview.scope,
      clientId = "v1-import";
    message("Rechecking current authority, revision and edit lease…");
    if (!applyRequest) {
      applyLease ??= {
        operationId: crypto.randomUUID(),
        versionId,
        revision,
        scope: "meta",
        clientId,
      };
      const lease = await api.request("deploy", "/lease", {
        method: "POST",
        body: applyLease,
      });
      if (!Number.isSafeInteger(lease.fence))
        throw Error(
          "The original lease grant is not confirmed. Retry this preview.",
        );
      applyRequest = {
        operationId: applyOperation,
        versionId,
        revision,
        previewId: pendingPreview.previewId,
        digest: pendingPreview.digest,
        leaseFence: lease.fence,
        scope: "meta",
        clientId,
      };
    }
    const result = await api.request("deploy", "/imports/apply", {
      method: "POST",
      body: applyRequest,
    });
    if (
      result.saved !== true &&
      result.receipt?.state !== "committed" &&
      result.state !== "committed"
    )
      throw Error(
        "Import outcome is not confirmed. Keep this preview and verify the original operation.",
      );
    message(
      "Draft replacement committed. Refresh the planning table. This did not publish.",
    );
    pendingPreview = null;
    applyRequest = null;
    applyLease = null;
    document.getElementById("refresh")?.click();
    renderWorkbook();
  } catch (error) {
    message(
      error.message + " Your workbook and original operation are retained.",
      true,
    );
  } finally {
    input.disabled = !!applyRequest;
  }
}
panel.querySelector("[data-import]").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    message("Reading workbook…");
    workbook = await decodeWorkbook(await file.arrayBuffer());
    if (["Membership", "HR Terms"].includes(workbook.metadata["Table Scope"]))
      throw Error(
        "This catalogue is reference-only in Deploy. Manage it in Contacts.",
      );
    const snapshot = await api.request("deploy", "/bootstrap", {
      method: "POST",
      body: { versionId: version() },
    });
    matchStaff = snapshot.staffCatalog || snapshot.current?.teachers || [];
    pendingPreview = null;
    renderWorkbook();
    await validateWorkbook();
  } catch (error) {
    message(error.message, true);
  }
};
window.GSISV1Publication = {
  async open({ versionId, revision, name, onCommitted }) {
    const dialog = document.createElement("dialog");
    dialog.className = "gsis-panel";
    const heading = document.createElement("h2");
    heading.textContent = "Publish " + (name || versionId);
    const intro = document.createElement("p");
    intro.textContent =
      "Publish this saved revision as the active version. Staff contributions stay pending until accepted in Contacts. Recipient delivery can retry independently.";
    const progress = document.createElement("p");
    progress.setAttribute("role", "status");
    const resultHost = document.createElement("div"),
      actions = document.createElement("div");
    actions.className = "gsis-actions";
    const confirm = document.createElement("button");
    confirm.textContent = "Publish saved revision";
    confirm.className = "primary";
    const check = document.createElement("button");
    check.textContent = "Check original receipt";
    check.hidden = true;
    const cancel = document.createElement("button");
    cancel.textContent = "Close";
    cancel.onclick = () => dialog.close();
    actions.append(confirm, check, cancel);
    dialog.append(heading, intro, progress, resultHost, actions);
    document.body.append(dialog);
    dialog.showModal();
    const operationId = crypto.randomUUID();
    panel.querySelector("[data-operation]").value = operationId;
    let request = null,
      review = null,
      leaseRequest = null;
    try {
      review = await api.request("deploy", "/publishReview", {
        method: "POST",
        body: { versionId },
      });
      if (
        Number.isSafeInteger(review.workingRevision) &&
        review.workingRevision !== revision
      )
        throw Error(
          "The saved revision changed. Refresh and review it before publishing.",
        );
      progress.textContent = "Review complete. Publication has not started.";
    } catch (error) {
      progress.textContent = error.message;
      confirm.disabled = true;
    }
    async function receive(result) {
      showReceipt(result, resultHost);
      const receipt = result.receipt || result;
      if (receipt.state === "committed" || result.saved === true) {
        progress.textContent =
          "Publication committed. Delivery status is independent.";
        confirm.disabled = true;
        onCommitted?.();
      } else if (receipt.state === "terminal-not-committed") {
        progress.textContent =
          "This operation did not commit. Close and refresh before creating another.";
        confirm.disabled = true;
      } else
        progress.textContent =
          "Publication remains pending. Check this original receipt.";
    }
    check.onclick = async () => {
      try {
        await receive(
          await api.request("deploy", "/receipt", {
            method: "POST",
            body: { operationId, versionId },
          }),
        );
      } catch (error) {
        progress.textContent = error.message;
      }
    };
    confirm.onclick = async () => {
      confirm.disabled = true;
      check.hidden = false;
      try {
        if (!request) {
          leaseRequest ??= {
            operationId: crypto.randomUUID(),
            versionId,
            revision,
            scope: "meta",
            clientId: "v1-publish",
          };
          const lease = await api.request("deploy", "/lease", {
            method: "POST",
            body: leaseRequest,
          });
          request = {
            operationId,
            versionId,
            revision,
            expectedPointerSequence: review.expectedPointerSequence,
            leaseFence: lease.fence,
            scope: "meta",
            clientId: "v1-publish",
          };
        }
        progress.textContent = "Publishing…";
        await receive(
          await api.request("deploy", "/publish", {
            method: "POST",
            body: request,
          }),
        );
      } catch (error) {
        progress.textContent =
          error.message +
          " The original operation ID is " +
          operationId +
          ". Check its receipt before retrying.";
        confirm.textContent = "Retry same publication";
        confirm.disabled =
          !!error.status && error.status < 500 && error.status !== 408;
      } finally {
        check.hidden = false;
      }
    };
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
  },
};
