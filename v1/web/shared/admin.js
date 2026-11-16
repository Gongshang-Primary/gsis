import { completeGoogleConnection, renderGoogleConnection } from "./drive-connection.js";
const api = window.GSISV1,
  $ = (id) => document.getElementById(id);
let accounts = [],
  editing = null,
  operationId = null,
  accountRequest = null;
function status(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("gsis-error", error);
}
function cell(row, text) {
  const td = document.createElement("td");
  td.textContent = text;
  row.append(td);
  return td;
}
async function loadAccounts() {
  const result = await api.request("core", "/admin/accounts");
  accounts = result.rows || result.accounts || [];
  $("accountRows").replaceChildren();
  for (const account of accounts) {
    const row = document.createElement("tr");
    cell(row, account.email || account.accountId);
    cell(row, account.staffId || "Not linked");
    cell(row, (account.capabilities || account.grants || []).join(", "));
    cell(
      row,
      account.suspensionPending
        ? "Suspension pending"
        : account.suspended
          ? "Suspended"
          : "Active",
    );
    const button = document.createElement("button");
    button.textContent = "Edit";
    button.onclick = () => {
      editing = account;
      $("suspended").disabled = false;
      $("accountHeading").textContent = "Edit account";
      $("newIdentity").hidden = true;
      $("newEmail").required = $("newSubject").required = false;
      $("explicitCapabilities").hidden = false;
      $("accountStatus").textContent = "";
      operationId = crypto.randomUUID();
      accountRequest = null;
      $("accountId").textContent = account.accountId;
      $("staffId").value = account.staffId || "";
      $("capabilities").value = (
        account.capabilities ||
        account.grants ||
        []
      ).join("\n");
      $("suspended").value = String(!!account.suspended);
      $("reason").value = "";
      $("accountForm").hidden = false;
      $("staffId").focus();
    };
    const actions = cell(row, "");
    actions.append(button);
    const preview = document.createElement("button");
    preview.textContent = "Preview Deploy";
    preview.disabled = !!account.suspended;
    preview.onclick = () => api.preview(account.accountId);
    actions.append(preview);
    $("accountRows").append(row);
  }
}
$("addAccount").onclick = () => {
  editing = { accountId: crypto.randomUUID(), creating: true };
  operationId = crypto.randomUUID();
  accountRequest = null;
  $("accountHeading").textContent = "Add account";
  $("accountId").textContent = editing.accountId;
  $("newIdentity").hidden = false;
  $("newEmail").required = $("newSubject").required = true;
  $("newEmail").value = $("newSubject").value = "";
  $("newAdmin").checked = false;
  $("explicitCapabilities").hidden = true;
  $("staffId").value = $("capabilities").value = $("reason").value = "";
  $("suspended").value = "false";
  $("suspended").disabled = true;
  $("accountStatus").textContent = "";
  $("accountForm").hidden = false;
  $("newEmail").focus();
};
$("refreshAccounts").onclick = () =>
  loadAccounts().catch((e) => status(e.message, true));
$("cancelAccount").onclick = () => {
  $("accountForm").hidden = true;
  editing = null;
};
$("accountForm").onsubmit = async (event) => {
  event.preventDefault();
  if (!editing) return;
  const button = event.submitter;
  button.disabled = true;
  try {
    const result = await api.request("core", "/admin/accounts", {
      method: "POST",
      body: (accountRequest ??= {
        operationId,
        ...(editing.creating
          ? { subject: $("newSubject").value.trim(), email: $("newEmail").value.trim() }
          : { revision: editing.revision }),
        accountId: editing.accountId,
        staffId: $("staffId").value.trim() || null,
        capabilities: editing.creating
          ? ($("newAdmin").checked ? ["admin"] : [])
          : $("capabilities")
          .value.split(/\n/)
          .map((x) => x.trim())
          .filter(Boolean),
        suspended: $("suspended").value === "true",
        reason: $("reason").value.trim(),
      }),
    });
    if (result.state === "pending")
      $("accountStatus").textContent =
        "Change is pending resolution of protected operations. Retry retains the original request.";
    else if (
      result.state === "committed" ||
      result.receipt?.state === "committed"
    ) {
      accountRequest = null;
      $("accountStatus").textContent = "Account change confirmed.";
      await loadAccounts();
      editing = null;
      $("accountForm").hidden = true;
      status("Account change confirmed.");
    } else throw Error("The account change outcome is not confirmed.");
  } catch (error) {
    $("accountStatus").textContent =
      error.message + " The original operation is retained for retry.";
  } finally {
    button.disabled = false;
  }
};
let storedBackups = {};
try {
  storedBackups = JSON.parse(
    sessionStorage.getItem("gsis-backup-pending") || "{}",
  );
} catch {
  sessionStorage.removeItem("gsis-backup-pending");
}
const backupRequests = new Map(
  Object.entries(
    storedBackups &&
      typeof storedBackups === "object" &&
      !Array.isArray(storedBackups)
      ? storedBackups
      : {},
  ).filter(([domain, id]) => /^[a-z]+$/.test(domain) && typeof id === "string"),
);
function saveBackupRequests() {
  sessionStorage.setItem(
    "gsis-backup-pending",
    JSON.stringify(Object.fromEntries(backupRequests)),
  );
}
async function downloadBackup(domain, backupId, key) {
  const path = key
    ? "/system/backup/part?" + new URLSearchParams({ backupId, key })
    : "/system/backup/manifest?" + new URLSearchParams({ backupId });
  const response = await api.fetch("/api/" + domain + path);
  if (!response.ok) {
    const value = await response.json();
    throw Error(
      value.error?.message ||
        value.error ||
        "Backup download could not be verified.",
    );
  }
  const href = URL.createObjectURL(await response.blob()),
    link = document.createElement("a");
  link.href = href;
  link.download = key
    ? domain + "-" + key.split("/").at(-1)
    : domain + "-" + backupId + "-manifest.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}
async function health() {
  const domains = [
    "core",
    "contacts",
    "deploy",
    "roster",
    "calendar",
    "lord",
    "venues",
    "layout",
  ];
  $("healthRows").replaceChildren();
  await renderGoogleConnection($("healthRows"));
  await Promise.all(
    domains.map(async (domain) => {
      const section = document.createElement("section");
      section.className = "gsis-panel";
      const title = document.createElement("h3");
      title.textContent = domain;
      const content = document.createElement("pre");
      content.className = "gsis-code";
      content.textContent = "Checking…";
      section.append(title, content);
      $("healthRows").append(section);
      try {
        const result = await api.request(domain, "/system/health");
        content.textContent = JSON.stringify(result, null, 2);
        const drive = document.createElement("p");
        drive.textContent = "Google Drive backups: " + (result.driveBackup?.state || "unavailable") +
          ". Daily freshness checks begin at 23:50 Singapore time; unchanged older files remain current. " +
          "Drive history is deleted manually. Automatic Cloudflare pruning is off.";
        section.append(drive);
        const note = document.createElement("p");
        note.textContent =
          "A verified backup covers this owner’s database and artifacts. Backups across different owners are not an atomic school-wide snapshot.";
        const backup = document.createElement("button");
        backup.textContent = backupRequests.has(domain)
          ? "Retry original backup"
          : "Create verified owner backup";
        const message = document.createElement("p");
        message.setAttribute("role", "status");
        backup.onclick = async () => {
          backup.disabled = true;
          try {
            if (!backupRequests.has(domain)) {
              backupRequests.set(domain, crypto.randomUUID());
              saveBackupRequests();
            }
            const operationId = backupRequests.get(domain),
              saved = await api.request(domain, "/system/backup", {
                method: "POST",
                body: { operationId },
              });
            if (
              saved.state !== "committed" &&
              saved.receipt?.state !== "committed"
            )
              throw Error(
                "Backup is not yet confirmed. Retry the original operation.",
              );
            backupRequests.delete(domain);
            saveBackupRequests();
            message.textContent =
              "Verified owner backup committed: " + operationId;
            await health();
          } catch (error) {
            message.textContent =
              error.message +
              " Original operation: " +
              backupRequests.get(domain);
            backup.textContent = "Retry original backup";
          } finally {
            backup.disabled = false;
          }
        };
        section.append(note, backup, message);
        for (const saved of result.backups || []) {
          const row = document.createElement("div");
          row.className = "gsis-actions";
          const manifest = document.createElement("button");
          manifest.textContent = "Download manifest " + saved.backupId;
          manifest.onclick = () =>
            downloadBackup(domain, saved.backupId).catch(
              (e) => (message.textContent = e.message),
            );
          const parts = document.createElement("button");
          parts.textContent = "Show backup parts";
          parts.onclick = async () => {
            try {
              const response = await api.fetch(
                "/api/" +
                  domain +
                  "/system/backup/manifest?" +
                  new URLSearchParams({ backupId: saved.backupId }),
              );
              const data = await response.json();
              if (!response.ok) throw Error(data.error?.message || data.error);
              const listing = document.createElement("div");
              for (const entry of [
                { name: "Database snapshot", ...data.data },
                ...(data.objects || []),
              ]) {
                const key = entry.backupKey || entry.key;
                const button = document.createElement("button");
                button.textContent = entry.name || entry.table || key;
                button.onclick = () =>
                  downloadBackup(domain, saved.backupId, key).catch(
                    (e) => (message.textContent = e.message),
                  );
                listing.append(button);
              }
              row.append(listing);
              parts.remove();
            } catch (error) {
              message.textContent = error.message;
            }
          };
          row.append(manifest, parts);
          section.append(row);
        }
      } catch (error) {
        content.className += " gsis-error";
        content.textContent = error.message;
      }
    }),
  );
}
$("refreshHealth").onclick = health;
function openSection(id) {
  const ids = ["accounts", "health", "evidence", "services", "storage"];
  if (!ids.includes(id)) id = "accounts";
  for (const section of ids) $(section).hidden = section !== id;
  for (const button of document.querySelectorAll("[data-section]"))
    button.setAttribute("aria-current",button.dataset.section === id ? "page" : "false");
  history.replaceState(null,"","#"+id);
  window.dispatchEvent(new Event("gsis:navigation"));
  if (id === "health") void health().catch(e=>status(e.message,true));
  if (id === "services") void services().catch(e=>status(e.message,true));
}
document.querySelectorAll("[data-section]").forEach(button=>button.onclick=()=>openSection(button.dataset.section));
$("evidenceForm").onsubmit = async (event) => {
  event.preventDefault();
  $("evidenceResult").textContent = "Recovering…";
  try {
    const value = await api.request(
      "core",
      "/evidence/" + encodeURIComponent($("decisionId").value.trim()),
    );
    $("evidenceResult").textContent = JSON.stringify(value, null, 2);
  } catch (error) {
    $("evidenceResult").textContent = error.message;
  }
};
try {
  const session = await api.getSession();
  if (!session) {
    location.replace("/?next=/admin/");
  } else if (session.impersonating || !session.capabilities.includes("core.admin"))
    status("Global Admin Toolbox requires current Global Admin access.", true);
  else {
    $("adminContent").hidden = false;
    status("Current Core permissions govern every action.");
    await loadAccounts();
    await completeGoogleConnection();
    openSection(location.hash.slice(1));
    window.addEventListener("hashchange",()=>openSection(location.hash.slice(1)));
  }
} catch (error) {
  status(error.message, true);
}

async function services() {
  const result = await api.request("core", "/admin/service-grants");
  const rows = result.rows || [],
    host = $("serviceRows");
  host.replaceChildren();
  for (const capability of [
    "roster.allocate",
    "roster.publish",
    "roster.notify",
    "roster.export",
  ]) {
    const row = rows.find(
      (r) => r.service === "roster" && r.capability === capability,
    ) || { revision: 0, enabled: false };
    const form = document.createElement("form");
    form.className = "gsis-formrow";
    const label = document.createElement("label");
    label.textContent = capability;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = row.enabled;
    label.append(input);
    const save = document.createElement("button");
    save.textContent = "Save grant";
    const note = document.createElement("span");
    note.setAttribute("role", "status");
    let request = null;
    form.onsubmit = async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        request ??= {
          operationId: crypto.randomUUID(),
          service: "roster",
          capability,
          enabled: input.checked,
          revision: row.revision,
        };
        const saved = await api.request("core", "/admin/service-grants", {
          method: "POST",
          body: request,
        });
        if (
          saved.receipt?.state !== "committed" &&
          saved.state !== "committed" &&
          saved.saved !== true
        )
          throw Error("The grant outcome has not been confirmed.");
        await services();
        status("Explicit service grant saved.");
      } catch (error) {
        note.textContent = error.message;
        save.textContent = "Retry same grant";
      } finally {
        save.disabled = false;
      }
    };
    form.append(label, save, note);
    host.append(form);
  }
}
$("refreshServices").onclick = () =>
  services().catch((e) => status(e.message, true));
