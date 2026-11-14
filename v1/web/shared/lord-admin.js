/* LORD's source UI consumes explicit owner records. Capture viewed revisions before writes. */
(function () {
  "use strict";
  const api = window.GSISV1;
  if (!api || api.module !== "overlord") return;
  const transport = api.fetch.bind(api),
    incidents = new Map();
  let reign = null;
  api.fetch = async function (input, options = {}) {
    const url = new URL(
      typeof input === "string" ? input : input.url,
      location.href,
    );
    let body =
      typeof options.body === "string" ? JSON.parse(options.body) : null;
    if (body && url.pathname.endsWith("/transaction")) {
      const action = String(body.action || "").toLowerCase();
      if (action === "incidentresolve") {
        let viewed = incidents.get(body.incidentId);
        if (!viewed) {
          viewed = await api.request(
            "lord",
            "/incidents/get?incidentId=" + encodeURIComponent(body.incidentId),
          );
          if (
            !confirm(
              "Review incident " +
                viewed.incidentId +
                " (" +
                viewed.status +
                ").\n" +
                JSON.stringify(viewed.details) +
                "\n\nRecord this review note?",
            )
          )
            throw Error("Review cancelled.");
          incidents.set(viewed.incidentId, viewed);
        }
        body = { ...body, revision: viewed.revision };
      }
      if (action === "reignclose") {
        if (!reign)
          throw Error("Open and review the current logging period first.");
        body = {
          ...body,
          periodId: reign.periodId,
          revision: reign.revision,
          sourceVersion: reign.sourceVersion,
        };
      }
      options = { ...options, body: JSON.stringify(body) };
    }
    const result = await transport(input, options);
    if (
      result.ok &&
      result.headers.get("content-type")?.includes("application/json")
    ) {
      const value = await result.clone().json(),
        data = value.data ?? value,
        action = url.searchParams.get("action")?.toLowerCase();
      if (action === "complianceincidents")
        for (const incident of data.incidents || [])
          incidents.set(incident.incidentId, incident);
      if (action === "reignpreview") reign = structuredClone(data);
    }
    return result;
  };
  function invalidInput(error) {
    return (
      [400, 413, 422].includes(error?.status) &&
      [
        "INVALID_INPUT",
        "INVALID_PHOTO",
        "RESULT_BOUNDS",
        "PAYLOAD_TOO_LARGE",
      ].includes(error?.code)
    );
  }
  function committed(result) {
    if (result?.state !== "committed" && result?.receipt?.state !== "committed")
      throw Error(
        "Save outcome is not confirmed. Retry this same operation or inspect its receipt.",
      );
    return result;
  }

  const retryOperations = new Map();
  function installIncidentLinks(panel) {
    const form = document.createElement("form");
    form.dataset.incidentLink = "";
    form.innerHTML =
      '<h2>Incident response links</h2><p>Only the staff member named in the incident can use a link after signing in. Creating a link does not send a notification.</p><label>Incident<select name="incidentId" required><option value="">Choose an incident</option></select></label><label>Expires in hours<input name="hours" type="number" min="1" max="720" value="24" required></label><button>Create response link</button><button type="button" data-refresh-incidents>Reload incidents</button><button type="button" data-more-incidents hidden>Load more incidents</button><p role="status" data-link-status></p><a data-response-link hidden></a>';
    panel.append(form);
    const state = form.querySelector("[data-link-status]"),
      link = form.querySelector("[data-response-link]");
    let pending = null,
      viewed = [],
      nextCursor = null;
    async function load(more = false) {
      try {
        const data = await api.request(
          "lord",
          "/incidents/list" +
            (more && nextCursor
              ? "?after=" + encodeURIComponent(nextCursor)
              : ""),
        );
        viewed = [...(more ? viewed : []), ...(data.incidents || [])];
        nextCursor = data.nextCursor;
        form.querySelector("[data-more-incidents]").hidden = !nextCursor;
        form.elements.incidentId.replaceChildren(
          new Option("Choose an incident", ""),
          ...viewed.map(
            (row) =>
              new Option(
                (row.teacher || row.staffId || "Staff member") +
                  " · " +
                  row.incidentId +
                  " · " +
                  row.status,
                row.incidentId,
              ),
          ),
        );
        state.textContent = viewed.length
          ? "Choose the incident to share with its staff member."
          : "No unresolved incidents are recorded.";
      } catch (error) {
        state.textContent = error.message;
      }
    }
    form.querySelector("[data-refresh-incidents]").onclick = () => {
      if (pending) {
        state.textContent =
          "Resolve the pending link operation before choosing a new incident.";
        return;
      }
      load();
    };
    form.querySelector("[data-more-incidents]").onclick = () => {
      if (!pending) load(true);
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      try {
        if (!pending) {
          const incidentId = form.elements.incidentId.value,
            record = viewed.find((row) => row.incidentId === incidentId);
          if (!record || !Number.isSafeInteger(record.revision))
            throw Error(
              "Reload and choose an incident before creating its link.",
            );
          pending = {
            operationId: crypto.randomUUID(),
            purpose: "incident-response",
            incidentId,
            incidentRevision: record.revision,
            expiresAt: Date.now() + Number(form.elements.hours.value) * 3600000,
          };
        }
        const result = committed(
          await api.request("lord", "/links", {
            method: "POST",
            body: pending,
          }),
        );
        const value = result.result || result;
        const href = new URL("/lord/", location.origin);
        href.searchParams.set("incidentId", pending.incidentId);
        href.hash = "incidentToken=" + encodeURIComponent(value.token);
        link.href = href.href;
        link.textContent = "Open or copy this scoped response link";
        link.hidden = false;
        pending = null;
        state.textContent =
          "Response link created. Share it with the staff member named in the incident.";
      } catch (error) {
        if (invalidInput(error)) pending = null;
        state.textContent = error.message;
      }
    };
    api
      .getSession()
      .then((session) => {
        if (
          session?.capabilities.some((c) => ["admin", "lord.admin"].includes(c))
        )
          return load();
      })
      .catch((error) => {
        state.textContent = error.message;
      });
  }
  async function openBackground() {
    if (document.getElementById("gsisLordBackground")) return;
    const modal = document.createElement("dialog");
    modal.id = "gsisLordBackground";
    modal.className = "gsis-panel";
    modal.innerHTML =
      '<h2>Background work</h2><p>Confirmed failures can be retried with the original job identity. Unknown provider outcomes remain pending reconciliation and are never resent automatically.</p><button data-close>Close</button><button data-reload>Reload</button><p role="status" data-state></p><div data-jobs></div>';
    document.body.append(modal);
    modal.showModal();
    modal.querySelector("[data-close]").onclick = () => modal.close();
    modal.onclose = () => modal.remove();
    const state = modal.querySelector("[data-state]");
    async function load() {
      try {
        const data = await api.request("lord", "/background"),
          list = modal.querySelector("[data-jobs]");
        list.replaceChildren();
        for (const job of data.jobs || []) {
          const row = document.createElement("article"),
            label = document.createElement("p");
          label.textContent =
            job.job_id +
            " · " +
            job.type +
            " · " +
            job.state +
            " · attempts " +
            job.attempts +
            (job.last_code ? " · " + job.last_code : "");
          row.append(label);
          if (job.state === "failed") {
            const retry = document.createElement("button");
            retry.textContent = "Retry confirmed failure";
            retry.onclick = async () => {
              retry.disabled = true;
              try {
                if (!retryOperations.has(job.job_id))
                  retryOperations.set(job.job_id, {
                    operationId: crypto.randomUUID(),
                    jobId: job.job_id,
                  });
                committed(
                  await api.request("lord", "/background/retry", {
                    method: "POST",
                    body: retryOperations.get(job.job_id),
                  }),
                );
                retryOperations.delete(job.job_id);
                await load();
                state.textContent =
                  "The original job is queued for a checked retry.";
              } catch (error) {
                state.textContent = error.message;
                retry.disabled = false;
              }
            };
            row.append(retry);
          }
          if (job.state === "uncertain") {
            const note = document.createElement("p");
            note.textContent =
              "Provider outcome unknown. Reconcile its durable provider receipt before any retry.";
            row.append(note);
          }
          list.append(row);
        }
        state.textContent = data.jobs?.length
          ? "Showing " + data.jobs.length + " bounded job records."
          : "No background jobs are recorded.";
      } catch (error) {
        state.textContent = error.message;
      }
    }
    modal.querySelector("[data-reload]").onclick = load;
    await load();
  }
  window.GSISV1LordBackground = { open: openBackground };
  const settingsStyle = document.createElement("style");
  settingsStyle.textContent =
    "#systemSettingsModal .settings-card{width:min(1320px,100%)} #systemSettingsModal input[type=checkbox]{width:18px;height:18px;min-height:18px;padding:0} #systemSettingsModal .gsis-core-tools select{width:auto;min-height:30px} #systemSettingsModal .gsis-core-tools{align-items:center;gap:8px}.gsis-lord-import{border:1px solid #b8c8d4;border-radius:12px;padding:22px;color:#17324a;font:14px system-ui}.gsis-lord-import table{border-collapse:collapse;width:100%;margin:16px 0}.gsis-lord-import th,.gsis-lord-import td{padding:9px 8px;text-align:left;border-bottom:1px solid #d7e0e8}.gsis-lord-import th{background:#edf3f7}.gsis-lord-import button{font:inherit;margin-right:8px;padding:7px 12px;border:1px solid #b8c8d4;border-radius:5px}";
  document.head.append(settingsStyle);
  const panel = document.createElement("section");
  panel.className = "gsis-panel";
  panel.dataset.gsisPanelKind = "lord-setup";
  panel.innerHTML =
    '<h2>LORD settings</h2><p><a href="/admin/">Manage application access</a></p><p>Telegram uses the existing bot and backend-managed token. Credentials never appear in these tables or downloads. Saving reference data does not enable messaging.</p><button data-background type="button">Background work and notification status</button><button data-refresh type="button">Refresh Contacts staff references</button><p role="status" data-status></p><div data-reference-tables></div>';
  panel.querySelector("[data-background]").onclick = openBackground;
  const state = panel.querySelector("[data-status]");
  let refreshPending = null,
    tables = null;
  panel.querySelector("[data-refresh]").onclick = async () => {
    try {
      refreshPending ??= { operationId: crypto.randomUUID() };
      committed(
        await api.request("lord", "/reference/refresh", {
          method: "POST",
          body: refreshPending,
        }),
      );
      refreshPending = null;
      await tables?.load();
      state.textContent = "Contacts references refreshed.";
    } catch (error) {
      state.textContent = error.message;
    }
  };
  installIncidentLinks(panel);
  const templates = document.createElement("form");
  templates.innerHTML =
    '<h3>Approved WhatsApp templates</h3><p>Template names, language and approved parameters only. Provider tokens stay in backend secret storage.</p><label>Template definitions<textarea name="definitions" rows="5" required></textarea></label><button>Save approved templates</button><p role="status"></p>';
  panel.append(templates);
  let templatesRevision = 0,
    templatesPending = null;
  async function loadTemplates() {
    const data = await api.request("lord", "/settings"),
      record = data.settings.find(
        (s) => s.setting_key === "notificationTemplates",
      );
    templatesRevision = record?.revision || 0;
    templates.elements.definitions.value = record
      ? JSON.stringify(JSON.parse(record.value_json), null, 2)
      : "{}";
  }
  templates.onsubmit = async (event) => {
    event.preventDefault();
    try {
      templatesPending ??= {
        operationId: crypto.randomUUID(),
        key: "notificationTemplates",
        revision: templatesRevision,
        value: JSON.parse(templates.elements.definitions.value),
      };
      committed(
        await api.request("lord", "/settings", {
          method: "POST",
          body: templatesPending,
        }),
      );
      templatesPending = null;
      await loadTemplates();
      templates.querySelector("[role=status]").textContent =
        "Approved templates saved. Sending remains governed by backend configuration.";
    } catch (error) {
      if (invalidInput(error)) templatesPending = null;
      templates.querySelector("[role=status]").textContent = error.message;
    }
  };
  panel.hidden = true;
  document.body.append(panel);
  window.GSISV1LordSettings = {
    async open() {
      try {
        const session = await api.getSession();
        if (
          !session?.capabilities.some((c) =>
            ["admin", "lord.admin"].includes(c),
          )
        )
          throw Error("LORD administrator access is required.");
        let modal = document.getElementById("systemSettingsModal");
        if (modal) {
          modal.showModal?.();
          return;
        }
        modal = document.createElement("dialog");
        modal.id = "systemSettingsModal";
        modal.className = "modal-backdrop";
        modal.innerHTML =
          '<section class="editor-card settings-card"><div class="editor-heading"><h2>System settings</h2><button type="button" data-close aria-label="Close settings">×</button></div><div id="settingsBody" data-gsis-panel-host="lord-settings"></div></section>';
        modal.querySelector("[data-close]").onclick = () => modal.close();
        modal.onclose = () => {
          panel.hidden = true;
          document.body.append(panel);
          modal.remove();
        };
        document.body.append(modal);
        panel.hidden = false;
        modal.querySelector("#settingsBody").append(panel);
        modal.showModal();
        tables ??= window.GSISV1LordReferenceTables.install(
          panel.querySelector("[data-reference-tables]"),
          api,
        );
        await loadTemplates();
        window.GSISCoreTables?.refresh();
      } catch (error) {
        alert(error.message);
      }
    },
  };
})();
