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
panel.dataset.panelId = "deploy-publication";
panel.innerHTML =
  '<summary>Canonical Excel and publication receipts</summary><p>Save changes a draft. Publish makes the selected saved revision active. Contacts proposals and recipient deliveries have independent outcomes.</p><div class="gsis-formrow"><label>Table scope<select data-scope></select></label><button data-export>Export All · importable</button><label>Import Export All workbook<input type="file" data-import accept=".xlsx"></label></div><p data-status role="status"></p><div data-preview></div><form data-receipt class="gsis-formrow"><label>Operation ID<input data-operation required></label><button>Check original receipt</button></form><div data-result></div>';
for (const scope of scopes) {
  const option = document.createElement("option");
  option.value = option.textContent = scope;
  panel.querySelector("[data-scope]").append(option);
}
document.body.append(panel);
const status = panel.querySelector("[data-status]"),
  previewHost = panel.querySelector("[data-preview]");
let importDialog = null,
  importStatus = null,
  importReadEpoch = 0,
  validationEpoch = 0,
  protectedEpoch = 0;
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
  if (importStatus) importStatus.textContent = text;
  status.classList.toggle("gsis-error", error);
}
function showReceipt(
  result,
  host = panel.querySelector("[data-result]"),
  label = result.receipt?.result?.publicationId || result.publicationId
    ? "Publication"
    : "Operation",
) {
  host.replaceChildren();
  const receipt = result.receipt || result;
  const text = document.createElement("p");
  text.textContent =
    receipt.state === "committed"
      ? label + " committed."
      : ["terminal-not-committed", "aborted"].includes(receipt.state)
        ? label + " did not commit."
        : ["pending", "prepared"].includes(receipt.state)
          ? label + " is pending."
          : "The " + label.toLowerCase() + " outcome is not yet confirmed.";
  host.append(text);
  const info = document.createElement("pre");
  info.className = "gsis-code";
  info.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere";
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
  const epoch = protectedEpoch;
  try {
    message("Preparing canonical workbook…");
    const data = await api.request("deploy", "/export", {
      method: "POST",
      body: {
        versionId: version(),
        scope: panel.querySelector("[data-scope]").value,
      },
    });
    const bytes = await encodeWorkbook(data);
    if (epoch !== protectedEpoch)
      throw Error("Session changed. Export cancelled.");
    download(
      bytes,
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
    return { error };
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
  const epoch = ++validationEpoch;
  try {
    message("Validating current scope, references and base revision…");
    const result = await api.request("deploy", "/imports/preview", {
      method: "POST",
      body: { versionId: version(), workbook },
    });
    if (epoch !== validationEpoch) return;
    pendingPreview = result;
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
    if (epoch !== validationEpoch) return;
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
function showImportDialog() {
  if (!importDialog) {
    importDialog = document.createElement("dialog");
    importDialog.className = "gsis-import-preview";
    importDialog.setAttribute("aria-label", "Import Deploy workbook");
    const title = document.createElement("h2");
    title.textContent = "Import Deploy workbook";
    importStatus = document.createElement("p");
    importStatus.setAttribute("role", "status");
    const reimport = document.createElement("button");
    reimport.textContent = "Reimport workbook";
    reimport.onclick = () => panel.querySelector("[data-import]").click();
    const close = document.createElement("button");
    close.textContent = "Close";
    close.onclick = () => importDialog.close();
    importDialog.append(title, importStatus, reimport, close, previewHost);
    document.body.append(importDialog);
  }
  if (!importDialog.open) importDialog.showModal();
}
panel.querySelector("[data-import]").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (applyRequest) {
    message("Resolve the original import before replacing its workbook.", true);
    return;
  }
  showImportDialog();
  const epoch = ++importReadEpoch;
  ++validationEpoch;
  pendingPreview = null;
  workbook = null;
  previewHost.replaceChildren();
  try {
    message("Reading workbook…");
    const candidate = await decodeWorkbook(await file.arrayBuffer());
    if (epoch !== importReadEpoch) return;
    if (["Membership", "HR Terms"].includes(candidate.metadata["Table Scope"]))
      throw Error(
        "This catalogue is reference-only in Deploy. Manage it in Contacts.",
      );
    const snapshot = await api.request("deploy", "/bootstrap", {
      method: "POST",
      body: { versionId: version() },
    });
    if (epoch !== importReadEpoch) return;
    workbook = candidate;
    matchStaff = snapshot.staffCatalog || snapshot.current?.teachers || [];
    pendingPreview = null;
    renderWorkbook();
    await validateWorkbook();
  } catch (error) {
    if (epoch === importReadEpoch) message(error.message, true);
  }
};
// Keep unresolved identities when the dialog is closed and reopened in this tab.
// A missing receipt is not permission to create another operation.
const publicationAttempts = new Map();
function publicationHasDraft() {
  return !!(
    window.queuedEdits?.().length ||
    (typeof unsavedDraft !== "undefined" && unsavedDraft) ||
    (typeof editing !== "undefined" && editing) ||
    (typeof acquiring !== "undefined" && acquiring) ||
    (typeof busy !== "undefined" && busy) ||
    (typeof exclusionEdits !== "undefined" && exclusionEdits.size) ||
    window.notesUnresolved?.() ||
    (typeof versionCreateAttempt !== "undefined" && versionCreateAttempt) ||
    document.querySelector(".inline-editor")?.open
  );
}
function operationState(result) {
  return result?.receipt?.state || result?.state;
}
function terminalReceipt(result) {
  return ["committed", "aborted", "terminal-not-committed"].includes(
    operationState(result),
  );
}
window.GSISV1Publication = {
  async open({ versionId, revision, name, onCommitted }) {
    let state = publicationAttempts.get(versionId);
    if (!state) {
      state = { revision, review: null, attempt: null, stale: false };
      publicationAttempts.set(versionId, state);
    }
    const epoch = protectedEpoch;
    const dialog = document.createElement("dialog");
    dialog.className = "gsis-panel";
    dialog.dataset.publicationDialog = "";
    dialog.style.cssText =
      "max-width:min(42rem,calc(100vw - 2rem));box-sizing:border-box;max-height:calc(100dvh - 2rem);overflow:auto";
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
    const refresh = document.createElement("button");
    refresh.textContent = "Refresh venues and review";
    const recheck = document.createElement("button");
    recheck.textContent = "Review saved revision";
    const check = document.createElement("button");
    const cancel = document.createElement("button");
    cancel.textContent = "Close";
    cancel.onclick = () => dialog.close();
    actions.append(confirm, refresh, recheck, check, cancel);
    dialog.append(heading, intro, progress, resultHost, actions);
    document.body.append(dialog);
    dialog.showModal();
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.addEventListener("cancel", (event) => {
      if (state.busy) event.preventDefault();
    });
    function live() {
      if (epoch !== protectedEpoch)
        throw Error("Session changed. Reopen publication after signing in.");
    }
    function clean() {
      live();
      if (version() !== versionId)
        throw Error(
          "The selected version changed. Return to this version before continuing.",
        );
      if (publicationHasDraft())
        throw Error(
          "Save or discard all drafts, including version notes, before continuing. Your edits have been retained.",
        );
    }
    function unresolved() {
      return state.attempt?.sent && !terminalReceipt(state.attempt.result);
    }
    function controls() {
      const pending = unresolved();
      confirm.textContent =
        pending && state.attempt.kind === "publish"
          ? "Retry same publication"
          : "Publish saved revision";
      confirm.disabled =
        state.busy ||
        (pending ? state.attempt.kind !== "publish" : !state.review);
      refresh.hidden = !state.stale && state.attempt?.kind !== "refresh";
      refresh.textContent =
        pending && state.attempt.kind === "refresh"
          ? "Retry same venue refresh"
          : "Refresh venues and review";
      refresh.disabled =
        state.busy ||
        (pending && state.attempt.kind !== "refresh") ||
        !api.capable("deploy.edit");
      recheck.hidden =
        !!state.review || pending || (!!state.attempt && !state.attempt.sent);
      recheck.disabled = state.busy;
      check.hidden = !state.attempt?.leaseSent;
      check.textContent = !state.attempt?.sent
        ? "Check preparation receipt"
        : state.attempt.kind === "refresh"
          ? "Check venue refresh receipt"
          : "Check original receipt";
      check.disabled = state.busy;
      cancel.disabled = state.busy;
      progress.textContent = state.message || "Reviewing saved revision…";
      if (state.attempt)
        panel.querySelector("[data-operation]").value = state.attempt.sent
          ? state.attempt.operationId
          : state.attempt.leaseRequest.operationId;
      if (state.receiptDisplay)
        showReceipt(
          state.receiptDisplay.result,
          resultHost,
          state.receiptDisplay.label,
        );
    }
    state.render = controls;
    dialog.addEventListener("close", () => {
      if (state.render === controls) state.render = null;
    });
    async function run(work) {
      if (state.busy) return;
      state.busy = true;
      controls();
      try {
        await work();
      } catch (error) {
        if (epoch !== protectedEpoch) return;
        if (
          ["VENUE_REFERENCE_STALE", "VENUE_REFERENCE_CHANGED"].includes(
            error.code,
          )
        )
          state.stale = true;
        if (!state.attempt || state.attempt.sent) state.review = null;
        const pendingId = state.attempt?.sent
          ? state.attempt.operationId
          : state.attempt?.leaseSent
            ? state.attempt.leaseRequest.operationId
            : null;
        state.message =
          error.message +
          (pendingId
            ? " Check the original receipt before starting another operation. Operation ID: " +
              pendingId
            : "");
      } finally {
        state.busy = false;
        if (epoch === protectedEpoch) state.render?.();
      }
    }
    async function reviewSaved(expectedRevision, reload = false) {
      clean();
      state.review = null;
      if (reload) {
        const snapshot = await api.request("deploy", "/bootstrap", {
          method: "POST",
          body: { versionId },
        });
        clean();
        if (
          snapshot.current?.id !== versionId ||
          !Number.isSafeInteger(snapshot.current.revision) ||
          (expectedRevision !== undefined &&
            snapshot.current.revision !== expectedRevision)
        )
          throw Error(
            "The saved revision changed after venue refresh. Close, refresh the version and review it again.",
          );
        expectedRevision = snapshot.current.revision;
        state.revision = expectedRevision;
      }
      const reviewed = await api.request("deploy", "/publishReview", {
        method: "POST",
        body: { versionId },
      });
      clean();
      if (
        reviewed.versionId !== versionId ||
        reviewed.workingRevision !== expectedRevision
      )
        throw Error(
          "The saved revision changed. Close, refresh the version and review it again.",
        );
      state.revision = expectedRevision;
      state.review = reviewed;
      state.stale = false;
      state.attempt = null;
      state.message =
        "Review complete for saved revision " +
        expectedRevision +
        ". Publication has not started.";
    }
    async function receive(result, attempt) {
      live();
      if (state.attempt !== attempt) return;
      attempt.result = result;
      state.receiptDisplay = {
        result,
        label: attempt.kind === "refresh" ? "Venue refresh" : "Publication",
      };
      const receiptState = operationState(result);
      if (receiptState === "committed") {
        if (attempt.kind === "refresh") {
          const saved = result.receipt?.result || result;
          if (
            saved.versionId !== versionId ||
            !Number.isSafeInteger(saved.workingRevision)
          )
            throw Error(
              "Venue refresh committed, but its exact saved revision is unavailable. Keep this receipt and reload the version before reviewing.",
            );
          state.stale = false;
          state.message =
            "Venue refresh committed. Checking saved revision " +
            saved.workingRevision +
            "…";
          await reviewSaved(saved.workingRevision, true);
        } else {
          state.review = null;
          state.message =
            "Publication committed. Delivery status is independent.";
          // Receipt recovery must not replace drafts made since submission.
          if (version() === versionId && !publicationHasDraft())
            await onCommitted?.();
        }
      } else if (terminalReceipt(result)) {
        state.review = null;
        state.message =
          "This operation did not commit. You may explicitly refresh venues or review the saved version again.";
      } else {
        state.review = null;
        state.message =
          "The original operation outcome is not confirmed. Check its receipt; a new publication or venue refresh is blocked.";
      }
    }
    async function send(kind) {
      clean();
      if (!api.capable(kind === "refresh" ? "deploy.edit" : "deploy.publish"))
        throw Error("You do not have permission for this action.");
      if (
        state.attempt &&
        !terminalReceipt(state.attempt.result) &&
        kind !== state.attempt.kind
      )
        throw Error("Resolve the original operation receipt first.");
      if (!state.attempt || terminalReceipt(state.attempt.result)) {
        if (kind === "publish" && !state.review)
          throw Error("Review the saved revision before publishing.");
        if (kind === "refresh") {
          const snapshot = await api.request("deploy", "/bootstrap", {
            method: "POST",
            body: { versionId },
          });
          clean();
          if (
            snapshot.current?.id !== versionId ||
            !Number.isSafeInteger(snapshot.current.revision)
          )
            throw Error(
              "The saved version is unavailable. Reload before refreshing venues.",
            );
          state.revision = snapshot.current.revision;
        }
        state.attempt = {
          kind,
          operationId: crypto.randomUUID(),
          leaseRequest: {
            operationId: crypto.randomUUID(),
            versionId,
            revision: state.revision,
            scope: "meta",
            clientId: "v1-publish",
          },
        };
      }
      const attempt = state.attempt;
      if (!attempt.request) {
        attempt.leaseSent = true;
        attempt.lease ||= await api.request("deploy", "/lease", {
          method: "POST",
          body: attempt.leaseRequest,
        });
        clean();
        attempt.request = Object.freeze({
          operationId: attempt.operationId,
          versionId,
          revision: state.revision,
          leaseFence: attempt.lease.fence,
          scope: "meta",
          clientId: "v1-publish",
          ...(kind === "refresh"
            ? { operation: "refreshVenueRegistry" }
            : {
                expectedPointerSequence: state.review.expectedPointerSequence,
              }),
        });
      }
      attempt.sent = true;
      state.message =
        kind === "refresh" ? "Refreshing venue references…" : "Publishing…";
      state.render?.();
      let result = await api.request(
        "deploy",
        kind === "refresh" ? "/change" : "/publish",
        { method: "POST", body: attempt.request },
      );
      live();
      // /change acknowledges a saved mutation; its durable receipt supplies the
      // committed state and exact revision used for the next review.
      if (
        kind === "refresh" &&
        result.saved === true &&
        !operationState(result)
      )
        result = await api.request("deploy", "/receipt", {
          method: "POST",
          body: { operationId: attempt.operationId, versionId },
        });
      await receive(result, attempt);
    }
    confirm.onclick = () => run(() => send("publish"));
    refresh.onclick = () => run(() => send("refresh"));
    recheck.onclick = () => run(() => reviewSaved(undefined, true));
    check.onclick = () =>
      run(async () => {
        const attempt = state.attempt;
        const result = await api.request("deploy", "/receipt", {
          method: "POST",
          body: {
            operationId: attempt.sent
              ? attempt.operationId
              : attempt.leaseRequest.operationId,
            versionId,
          },
        });
        live();
        if (attempt.sent) return receive(result, attempt);
        state.receiptDisplay = { result, label: "Preparation" };
        if (operationState(result) === "committed") {
          const lease = result.receipt?.result || result;
          if (!Number.isSafeInteger(lease.fence))
            throw Error(
              "Preparation committed, but its lease fence is unavailable. Keep this receipt.",
            );
          attempt.lease = lease;
          state.message =
            "Preparation confirmed. Retry the original action to continue; publication has not started.";
        } else if (terminalReceipt(result)) {
          state.attempt = null;
          state.message =
            "Preparation did not commit. You may retry with a new lease or review the saved version again.";
        } else
          state.message =
            "Preparation outcome is not confirmed. Check this receipt or retry the same original action.";
      });
    controls();
    if (!state.busy && !state.attempt) await run(() => reviewSaved(revision));
  },
};

// The shared toolbar delegates canonical operations to this existing owner flow.
const scopeForTable = () =>
  ({
    "IP Deploy": "IP",
    "Classes & TGs": "TG",
    Classes: "IP",
    "Dept Settings": "Dept",
    Dept: "Dept",
    Teachers: "Teachers",
    "Level Exclusions": "Exclusions",
    Membership: "Membership",
    Offload: "Offload",
    "HR Terms": "HR Terms",
    "Span of Control": "Span of Control",
  })[document.getElementById("content")?.dataset.view];
function openCanonical(kind) {
  const scope = scopeForTable();
  if (!scope)
    throw Error("This view does not have a canonical workbook contract.");
  panel.querySelector("[data-scope]").value = scope;
  panel.open = true;
  if (kind === "export")
    return panel
      .querySelector("[data-export]")
      .onclick()
      .then((result) => {
        if (result?.error) throw result.error;
      });
  panel.querySelector("[data-import]").click();
}
function registerTables() {
  window.GSISCoreTables?.register(
    '#content[data-view="IP Deploy"] table,#content[data-view="Classes & TGs"] table,#content[data-view="Classes"] table,#content[data-view="Dept Settings"] table,#content[data-view="Dept"] table,#content[data-view="Teachers"] table,#content[data-view="Level Exclusions"] table,#content[data-view="Membership"] table,#content[data-view="Offload"] table,#content[data-view="HR Terms"] table,#content[data-view="Span of Control"] table',
    {
      exportAll: () => openCanonical("export"),
      importAll: () => openCanonical("import"),
    },
  );
  window.GSISCoreTables?.register(
    '#content[data-view="Membership"] table,#content[data-view="HR Terms"] table',
    { exportAll: () => openCanonical("export") },
  );
}
registerTables();
window.addEventListener("load", registerTables);

window.addEventListener("gsis:clear-protected-state", () => {
  ++importReadEpoch;
  ++validationEpoch;
  ++protectedEpoch;
  publicationAttempts.clear();
  document
    .querySelectorAll("dialog[data-publication-dialog]")
    .forEach((dialog) => {
      dialog.close();
      dialog.remove();
    });
  workbook = null;
  pendingPreview = null;
  matchStaff = [];
  applyOperation = null;
  applyRequest = null;
  applyLease = null;
  previewHost.replaceChildren();
  panel.append(previewHost);
  importDialog?.remove();
  importDialog = null;
  importStatus = null;
});
