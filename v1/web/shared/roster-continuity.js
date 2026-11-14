const api = window.GSISV1;
const el = (tag, text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};
const panel = el("details");
panel.className = "gsis-panel";
panel.append(el("summary", "Continuity exports and offline return"));
const status = el("p");
status.setAttribute("role", "status");
const files = el("div"),
  refresh = el("button", "Refresh export status"),
  form = el("form"),
  file = el("input"),
  previewButton = el("button", "Preview offline return"),
  previewView = el("div"),
  confirm = el("button", "Confirm reviewed draft");
file.type = "file";
file.accept = "application/json,.json";
file.required = true;
file.setAttribute("aria-label", "Offline Stapler commands JSON");
previewButton.type = "submit";
confirm.type = "button";
confirm.disabled = true;
form.append(
  el("h3", "Return offline changes"),
  el(
    "p",
    "Upload a gsis-stapler-commands/1 JSON file with basePublicationId and commands. Preview checks the published source and current draft. Confirm saves a draft under a current planning lease; publication is a separate action.",
  ),
  file,
  previewButton,
);
panel.append(
  el(
    "p",
    "BURROWS application source is not present in this repository. Readiness downloads contain verified timetable and staff CSV files plus source identifiers; they do not claim that an offline application was tested.",
  ),
  refresh,
  status,
  files,
  form,
  previewView,
  confirm,
);
document.body.append(panel);
let draft = null,
  view = null,
  pending = null,
  pendingLease = null;
const say = (message, error = false) => {
  status.textContent = message;
  status.classList.toggle("gsis-error", error);
};
async function download(id) {
  const response = await api.fetch(
    "/api/roster/exports/download?" + new URLSearchParams({ id }),
  );
  if (!response.ok)
    throw Error("The export could not be verified. Refresh its status.");
  const data = await response.blob(),
    url = URL.createObjectURL(data),
    link = el("a");
  link.href = url;
  link.download = "BURROWS-readiness.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function load() {
  const result = await api.request("roster", "/exports");
  files.replaceChildren();
  const list = el("ul");
  for (const row of result.burrows || []) {
    const item = el(
        "li",
        row.publicationId + " · digest " + row.digest.slice(0, 12) + " ",
      ),
      button = el("button", "Download readiness package");
    button.type = "button";
    button.onclick = () => download(row.id).catch((e) => say(e.message, true));
    item.append(button);
    list.append(item);
  }
  files.append(el("h3", "Verified readiness artifacts"), list);
  const table = el("table"),
    head = el("tr");
  [
    "Publication",
    "Drive state",
    "Last success",
    "Last error",
    "Recovery",
  ].forEach((s) => head.append(el("th", s)));
  table.append(head);
  for (const row of result.drive || []) {
    const tr = el("tr");
    [
      row.publicationId,
      row.state,
      row.lastSuccessAt
        ? new Date(row.lastSuccessAt).toLocaleString()
        : "Not confirmed",
      row.lastError || "",
    ].forEach((s) => tr.append(el("td", s)));
    const cell = el("td");
    if (api.capable("roster.admin")) {
      const reconcile = el("button", "Verify original Drive file");
      let operationId = null;
      reconcile.onclick = async () => {
        reconcile.disabled = true;
        try {
          operationId ??= crypto.randomUUID();
          const result = await api.request("roster", "/exports/reconcile", {
            method: "POST",
            body: { publicationId: row.publicationId, operationId },
          });
          say(
            result.state === "delivered"
              ? "Original Drive content verified."
              : "Readback remains " +
                  result.state +
                  ". The original file identity is retained.",
          );
          await load();
        } catch (e) {
          say(e.message + " Operation: " + operationId, true);
        } finally {
          reconcile.disabled = false;
        }
      };
      cell.append(reconcile);
    }
    tr.append(cell);
    table.append(tr);
  }
  files.append(el("h3", "Google Drive continuity"), table);
}
refresh.onclick = () => load().catch((e) => say(e.message, true));
file.onchange = () => {
  draft = null;
  view = null;
  pending = null;
  pendingLease = null;
  confirm.disabled = true;
  previewView.replaceChildren();
};
form.onsubmit = async (event) => {
  event.preventDefault();
  previewButton.disabled = true;
  try {
    const selected = file.files[0];
    if (!selected || selected.size > 1024 * 1024)
      throw Error("Choose a JSON file up to 1 MiB.");
    draft = JSON.parse(await selected.text());
    if (
      draft.format !== "gsis-stapler-commands/1" ||
      !draft.basePublicationId ||
      !Array.isArray(draft.commands)
    )
      throw Error(
        "The file must declare gsis-stapler-commands/1, basePublicationId and commands.",
      );
    view = await api.request("roster", "/offline/preview", {
      method: "POST",
      body: {
        basePublicationId: draft.basePublicationId,
        commands: draft.commands,
      },
    });
    pending = null;
    pendingLease = null;
    previewView.replaceChildren(
      el("h3", "Review " + view.date + " · revision " + view.revision),
      el("p", "Source publication: " + view.basePublicationId),
    );
    const changes = el("pre");
    changes.style.whiteSpace = "pre-wrap";
    changes.textContent = JSON.stringify(view.changes, null, 2);
    previewView.append(changes);
    confirm.disabled = (view.conflicts || []).length > 0;
    say(
      confirm.disabled
        ? "Conflicts must be resolved before saving."
        : "Review the complete changes before confirming the draft.",
    );
  } catch (e) {
    confirm.disabled = true;
    say(e.message, true);
  } finally {
    previewButton.disabled = false;
  }
};
confirm.onclick = async () => {
  if (!view || !draft) return;
  confirm.disabled = true;
  try {
    if (!pending) {
      pendingLease ??= {
        operationId: crypto.randomUUID(),
        date: view.date,
        action: "acquire",
      };
      const receipt = await api.request("roster", "/lease", {
          method: "POST",
          body: pendingLease,
        }),
        lease = receipt.result ?? receipt;
      if (
        !Number.isSafeInteger(lease.fence) ||
        (receipt.receipt?.state !== "committed" &&
          receipt.state !== "committed")
      )
        throw Error(
          "Lease outcome is unconfirmed. Retry original lease " +
            pendingLease.operationId,
        );
      pending = {
        operationId: crypto.randomUUID(),
        basePublicationId: draft.basePublicationId,
        commands: draft.commands,
        previewId: view.previewId,
        revision: view.revision,
        confirm: true,
        fence: lease.fence,
      };
    }
    const result = await api.request("roster", "/offline/confirm", {
      method: "POST",
      body: pending,
    });
    if (result.receipt?.state !== "committed" && result.state !== "committed")
      throw Error(
        "The draft save is not yet confirmed. Retry with the retained operation.",
      );
    say(
      "Draft saved. Review it in Stapler before publication. Operation: " +
        pending.operationId,
    );
    pending = null;
    view = null;
    await load();
  } catch (e) {
    say(
      e.message +
        (pending ? " Original operation: " + pending.operationId : ""),
      true,
    );
    confirm.disabled = false;
  }
};
try {
  const session = await api.getSession();
  if (!session || !api.capable("roster.read")) panel.hidden = true;
  else await load();
} catch (e) {
  say(e.message, true);
}
