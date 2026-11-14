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
  const panel = document.createElement("details");
  panel.className = "gsis-panel";
  panel.innerHTML =
    '<summary>LORD setup and inventory</summary><p role="status" data-status></p><button data-refresh>Refresh Contacts references</button><form data-resource><h2>Resource inventory</h2><label>Resource<select name="existing"><option value="">New resource</option></select></label><label>Permanent resource ID<input name="resourceId" required pattern="[A-Za-z0-9][A-Za-z0-9._-]*"></label><label>Name<input name="name" required maxlength="160"></label><label>Device type<input name="type" required maxlength="80"></label><label>Capacity<input name="capacity" type="number" min="1" max="200" value="1" required></label><label>Preparation periods<input name="bufferPeriods" type="number" min="0" max="4" value="1" required></label><label><input name="exclusive" type="checkbox" checked> Reserve the whole resource</label><label><input name="active" type="checkbox" checked> Active</label><label><input name="stylusOption" type="checkbox"> Styluses available</label><label><input name="headphoneOption" type="checkbox"> Headphones available</label><button>Save resource</button></form><form data-periods><h2>Period timings</h2><p>Use an ordered JSON array such as [{"code":"1","start":"07:30","end":"08:00"}].</p><textarea name="periods" rows="5" required></textarea><button>Save period timings</button></form>';

  for (const [key, title, hint] of [
    [
      "referenceLists",
      "Class and subject reference lists",
      "JSON object with classes and subjects arrays.",
    ],
    [
      "notificationTemplates",
      "Approved WhatsApp templates",
      "JSON object keyed by created, changed, cancelled, collection-reminder, overdue, administrative-close or reminder. Each entry has name, language and optional parameters (teacher, resource, quantity, date, startPeriod, endPeriod, classOrActivity, subject, bookingId). No credentials.",
    ],
  ]) {
    const extra = document.createElement("form");
    extra.dataset.setting = key;
    const heading = document.createElement("h2");
    heading.textContent = title;
    const note = document.createElement("p");
    note.textContent = hint;
    const area = document.createElement("textarea");
    area.name = "value";
    area.rows = 6;
    area.required = true;
    const button = document.createElement("button");
    button.textContent = "Save " + title.toLowerCase();
    extra.append(heading, note, area, button);
    panel.append(extra);
  }
  installIncidentLinks(panel);
  document.body.append(panel);
  window.GSISV1LordSettings = {
    open() {
      panel.open = true;
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  };
  const status = panel.querySelector("[data-status]"),
    form = panel.querySelector("[data-resource]"),
    timings = panel.querySelector("[data-periods]");
  let resources = [],
    periodRevision = 0,
    resourcePending = null,
    periodPending = null,
    refreshPending = null;
  const extraRevisions = new Map(),
    extraPending = new Map();
  async function load() {
    const [ref, settings] = await Promise.all([
      api.request("lord", "/resources?includeInactive=1"),
      api.request("lord", "/settings"),
    ]);
    resources = ref.resources || [];
    form.elements.existing.replaceChildren(
      new Option("New resource", ""),
      ...resources.map((r) => new Option(r.name, r.id)),
    );
    const period = settings.settings.find(
      (s) => s.setting_key === "periodTimings",
    );
    for (const form of panel.querySelectorAll("form[data-setting]")) {
      const record = settings.settings.find(
        (s) => s.setting_key === form.dataset.setting,
      );
      extraRevisions.set(form.dataset.setting, record?.revision || 0);
      form.elements.value.value = JSON.stringify(
        record
          ? JSON.parse(record.value_json)
          : form.dataset.setting === "referenceLists"
            ? { classes: [], subjects: [] }
            : {},
        null,
        2,
      );
    }
    periodRevision = period?.revision || 0;
    timings.elements.periods.value = JSON.stringify(
      period ? JSON.parse(period.value_json).periods : [],
      null,
      2,
    );
    status.textContent = ref.setupRequired?.length
      ? "Setup required: " + ref.setupRequired.join(", ")
      : "References and inventory are ready.";
  }
  form.elements.existing.onchange = () => {
    resourcePending = null;
    const r = resources.find((r) => r.id === form.elements.existing.value);
    for (const key of [
      "resourceId",
      "name",
      "type",
      "capacity",
      "bufferPeriods",
    ])
      form.elements[key].value = r
        ? key === "resourceId"
          ? r.id
          : r[key]
        : ({ capacity: 1, bufferPeriods: 1 }[key] ?? "");
    form.elements.resourceId.readOnly = !!r;
    for (const key of [
      "exclusive",
      "active",
      "stylusOption",
      "headphoneOption",
    ])
      form.elements[key].checked = r
        ? key === "active" || key === "exclusive"
          ? r[key] !== false
          : r[key] === true
        : key === "active" || key === "exclusive";
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    try {
      const values = new FormData(form),
        old = resources.find((r) => r.id === values.get("existing"));
      resourcePending ??= {
        operationId: crypto.randomUUID(),
        revision: old?.revision || 0,
        resourceId: values.get("resourceId"),
        name: values.get("name"),
        type: values.get("type"),
        capacity: Number(values.get("capacity")),
        bufferPeriods: Number(values.get("bufferPeriods")),
        exclusive: values.has("exclusive"),
        active: values.has("active"),
        metadata: {
          stylusOption: values.has("stylusOption"),
          headphoneOption: values.has("headphoneOption"),
        },
      };
      committed(
        await api.request("lord", "/resources", {
          method: "POST",
          body: resourcePending,
        }),
      );
      resourcePending = null;
      await load();
      status.textContent = "Resource saved.";
    } catch (error) {
      if (invalidInput(error)) resourcePending = null;
      status.textContent = error.message;
    }
  };
  timings.onsubmit = async (event) => {
    event.preventDefault();
    try {
      periodPending ??= {
        operationId: crypto.randomUUID(),
        key: "periodTimings",
        revision: periodRevision,
        value: { periods: JSON.parse(timings.elements.periods.value) },
      };
      committed(
        await api.request("lord", "/settings", {
          method: "POST",
          body: periodPending,
        }),
      );
      periodPending = null;
      await load();
      status.textContent = "Period timings saved.";
    } catch (error) {
      if (invalidInput(error)) periodPending = null;
      status.textContent = error.message;
    }
  };
  for (const form of panel.querySelectorAll("form[data-setting]"))
    form.onsubmit = async (event) => {
      event.preventDefault();
      const key = form.dataset.setting;
      try {
        if (!extraPending.has(key))
          extraPending.set(key, {
            operationId: crypto.randomUUID(),
            key,
            revision: extraRevisions.get(key) || 0,
            value: JSON.parse(form.elements.value.value),
          });
        committed(
          await api.request("lord", "/settings", {
            method: "POST",
            body: extraPending.get(key),
          }),
        );
        extraPending.delete(key);
        await load();
        status.textContent = "Settings saved.";
      } catch (error) {
        if (invalidInput(error)) extraPending.delete(key);
        status.textContent = error.message;
      }
    };
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
      await load();
    } catch (error) {
      status.textContent = error.message;
    }
  };
  api
    .getSession()
    .then((session) => {
      if (
        !session?.capabilities.some((c) => ["admin", "lord.admin"].includes(c))
      ) {
        panel.remove();
        return;
      }
      return load();
    })
    .catch((error) => {
      status.textContent = error.message;
    });
})();
