/* Own-booking edits and scoped incident replies use the shared authenticated transport. */
(function () {
  "use strict";
  const api = window.GSISV1;
  if (!api || api.module !== "lord") return;

  let session,
    storageKey,
    panel,
    active = true;
  const pending = { booking: null, incident: null },
    submitting = { booking: false, incident: false },
    forms = {},
    dialogs = new Set();
  const query = new URL(location.href).searchParams,
    fragment = new URLSearchParams(location.hash.slice(1));
  const incidentId = fragment.get("incidentId") || query.get("incidentId");
  const token =
    fragment.get("incidentToken") ||
    fragment.get("token") ||
    query.get("token");
  if (incidentId && query.has("token")) {
    const clean = new URL(location.href);
    clean.searchParams.delete("incidentId");
    clean.searchParams.delete("token");
    fragment.set("incidentId", incidentId);
    fragment.delete("token");
    fragment.set("incidentToken", token);
    clean.hash = fragment.toString();
    history.replaceState(
      history.state,
      "",
      clean.pathname + clean.search + clean.hash,
    );
  }
  const invalidInput = (error) =>
    [400, 413, 422].includes(error?.status) &&
    ["INVALID_INPUT", "PAYLOAD_TOO_LARGE"].includes(error?.code);
  const committed = (result) =>
    result?.state === "committed" || result?.receipt?.state === "committed";
  const permitted = (value) =>
    value &&
    !value.impersonating &&
    value.user?.staffId &&
    value.capabilities?.some((capability) =>
      ["admin", "lord.borrow"].includes(capability),
    );

  function element(tag, text, attributes = {}) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    for (const [key, value] of Object.entries(attributes))
      node.setAttribute(key, value);
    return node;
  }
  function button(text, selector, action) {
    const node = element("button", text, { type: "button", [selector]: "" });
    node.onclick = action;
    return node;
  }
  function message(node, text, error = false) {
    node.textContent = text;
    node.classList.toggle("gsis-error", error);
  }
  function persist(kind, value) {
    const next = { ...pending, [kind]: value };
    // Store before sending, so a reload keeps the original identity and exact body.
    sessionStorage.setItem(storageKey, JSON.stringify(next));
    pending[kind] = value;
  }
  async function currentSession() {
    const current = await api.getSession(true);
    if (
      !active ||
      !permitted(current) ||
      current.schoolId !== session.schoolId ||
      current.user.accountId !== session.user.accountId ||
      current.user.staffId !== session.user.staffId
    )
      throw Error(
        "Your sign-in or permission changed. Reopen LORD with your own staff account.",
      );
    return current;
  }
  function modal(id, title) {
    const existing = document.getElementById(id);
    if (existing) {
      existing.focus();
      return null;
    }
    const dialog = element("dialog", undefined, {
      id,
      class: "gsis-panel",
      "aria-labelledby": id + "Title",
    });
    Object.assign(dialog.style, {
      width: "min(680px, calc(100vw - 32px))",
      maxHeight: "85vh",
      overflow: "auto",
      margin: "auto",
    });
    const heading = element("h2", title, { id: id + "Title" });
    const close = button("Close", "data-lord-close", () => dialog.close());
    const status = element("p", "", {
      role: "status",
      "aria-live": "polite",
      "data-lord-status": "",
    });
    const content = element("div", undefined, { "data-lord-content": "" });
    dialog.append(heading, close, status, content);
    dialogs.add(dialog);
    dialog.addEventListener("close", () => {
      dialogs.delete(dialog);
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
    return { dialog, status, content };
  }
  function field(form, name, label, value, attributes = {}, tag = "input") {
    const wrapper = element("label", label);
    wrapper.style.margin = "12px 0";
    const input = element(tag, undefined, { name, ...attributes });
    input.value = value ?? "";
    wrapper.append(input);
    form.append(wrapper);
    return input;
  }
  function summary(booking) {
    return (
      booking.date +
      " · P" +
      booking.startPeriod +
      "–P" +
      booking.endPeriod +
      " · " +
      (booking.classOrActivity || booking.bookingId)
    );
  }
  function incidentDetails(value) {
    if (!value || typeof value !== "object")
      return element("p", String(value ?? ""));
    const list = element("dl");
    for (const [key, detail] of Object.entries(value)) {
      const title = key
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_-]/g, " ");
      list.append(
        element("dt", title.charAt(0).toUpperCase() + title.slice(1)),
      );
      const description = element("dd");
      description.style.overflowWrap = "anywhere";
      if (Array.isArray(detail))
        description.textContent = detail
          .map((item) =>
            typeof item === "object" ? JSON.stringify(item) : String(item),
          )
          .join(", ");
      else if (detail && typeof detail === "object")
        description.append(incidentDetails(detail));
      else
        description.textContent =
          typeof detail === "boolean"
            ? detail
              ? "Yes"
              : "No"
            : String(detail ?? "");
      list.append(description);
    }
    return list;
  }
  function requireOwnBooking(booking) {
    if (
      !booking ||
      booking.staffId !== session.user.staffId ||
      booking.status !== "BOOKED" ||
      !Number.isSafeInteger(booking.revision) ||
      !Array.isArray(booking.items) ||
      !booking.items.length
    )
      throw Error("Only your own uncollected bookings can be edited.");
  }

  function groupedBooking(booking) {
    if (booking.groupState === "unresolved")
      throw Error(
        "This booking does not prove one complete current cart. Ask a LORD administrator to review its physical reservations before editing.",
      );
    if (booking.groupState !== "verified") return null;
    const group = booking.bookingGroup;
    if (
      !group ||
      typeof group.cart !== "string" ||
      !Array.isArray(group.members) ||
      !group.members.length ||
      group.members.length > 20 ||
      !group.revision
    )
      throw Error(
        "The cart membership could not be verified. Reload the booking before editing.",
      );
    return group;
  }

  async function openBookings() {
    if (!active) return;
    const view = modal("gsisLordBookingEditor", "Edit my bookings");
    if (!view) return;
    if (pending.booking) {
      renderBooking(view, pending.booking.viewed);
      return;
    }
    message(view.status, "Loading your bookings…");
    try {
      await currentSession();
      const result = await api.request("lord", "/bookings");
      if (!active || !view.dialog.isConnected) return;
      const bookings = (result.bookings || []).filter(
        (booking) =>
          booking.staffId === session.user.staffId &&
          booking.status === "BOOKED",
      );
      message(
        view.status,
        bookings.length
          ? "Choose an uncollected booking to review and edit."
          : "You have no uncollected bookings to edit.",
      );
      for (const booking of bookings) {
        const row = element("article");
        row.append(element("p", summary(booking)));
        const edit = button(
          "Review and edit",
          "data-lord-edit-booking",
          async () => {
            edit.disabled = true;
            message(view.status, "Loading the current booking…");
            try {
              const result = await api.request(
                "lord",
                "/bookings/get?bookingId=" +
                  encodeURIComponent(booking.bookingId),
              );
              if (!active || !view.dialog.isConnected) return;
              requireOwnBooking(result.booking);
              renderBooking(view, result.booking);
            } catch (error) {
              message(view.status, error.message, true);
              edit.disabled = false;
            }
          },
        );
        edit.dataset.bookingId = booking.bookingId;
        row.append(edit);
        view.content.append(row);
      }
    } catch (error) {
      message(view.status, error.message, true);
    }
  }

  function renderBooking(view, booking) {
    try {
      requireOwnBooking(booking);
      groupedBooking(booking);
    } catch (error) {
      message(view.status, error.message, true);
      return;
    }
    view.content.replaceChildren();
    const form = element("form", undefined, { "data-lord-booking-form": "" });
    const fields = element("fieldset");
    fields.style.border = "0";
    fields.style.padding = "0";
    fields.append(element("legend", "Booking " + booking.bookingId));
    fields.style.minInlineSize = "0";
    fields.querySelector("legend").style.overflowWrap = "anywhere";
    const body = pending.booking?.body || booking;
    field(fields, "date", "Date", body.date, {
      type: "date",
      min: "2000-01-01",
      max: "2099-12-31",
      required: "",
    });
    field(fields, "startPeriod", "First period", body.startPeriod, {
      type: "number",
      min: "0",
      max: "40",
      step: "1",
      required: "",
    });
    field(fields, "endPeriod", "Last period (included)", body.endPeriod, {
      type: "number",
      min: "0",
      max: "40",
      step: "1",
      required: "",
    });
    field(
      fields,
      "classOrActivity",
      "Class or activity",
      body.classOrActivity,
      { maxlength: "200", required: "" },
    );
    field(fields, "subject", "Subject", body.subject, {
      maxlength: "100",
      required: "",
    });
    field(
      fields,
      "remarks",
      "Remarks",
      body.remarks,
      { maxlength: "2000", rows: "3" },
      "textarea",
    );
    const group = groupedBooking(booking);
    fields.append(
      element("h3", group ? "Reserved cart" : "Reserved resources"),
    );
    if (group) {
      const capacity = group.members.reduce(
        (sum, member) => sum + member.capacity,
        0,
      );
      fields.append(
        element(
          "p",
          group.cart +
            " · " +
            capacity +
            " devices reserved across " +
            group.members.length +
            " physical trolleys.",
        ),
      );
      if (booking.requestedQuantity == null)
        fields.append(
          element(
            "p",
            "The original requested quantity was not recorded. Enter the quantity you need; the full cart stays reserved.",
          ),
        );
      field(
        fields,
        "requestedQuantity",
        "Devices requested",
        body.requestedQuantity,
        {
          type: "number",
          min: "1",
          max: String(Math.min(capacity, 200)),
          step: "1",
          required: "",
          "data-lord-cart-quantity": "",
        },
      );
      fields.append(
        element(
          "p",
          "Physical collection and return quantities are recorded separately.",
        ),
      );
    }
    for (const [index, item] of (group ? [] : body.items).entries()) {
      const name =
        booking.trolleys?.find(
          (resource) => resource.resourceId === item.resourceId,
        )?.name || item.resourceId;
      const quantity = field(
        fields,
        "quantity" + index,
        name + " — quantity",
        item.quantity,
        {
          type: "number",
          min: "1",
          max: "200",
          step: "1",
          required: "",
          "data-resource-id": item.resourceId,
        },
      );
      quantity.setAttribute("aria-label", name + " quantity");
    }
    const accessories = [
      booking.headphones && "headphones",
      booking.styluses && "styluses",
    ].filter(Boolean);
    if (accessories.length)
      fields.append(
        element("p", "Reserved accessories: " + accessories.join(", ") + "."),
      );
    form.append(fields);
    view.content.append(form);
    installSubmission(
      view,
      form,
      fields,
      "booking",
      "/bookings/update",
      booking,
      () => {
        const values = new FormData(form),
          start = Number(values.get("startPeriod")),
          end = Number(values.get("endPeriod"));
        if (end < start)
          throw Error("The last period must be at or after the first period.");
        if (
          !String(values.get("classOrActivity")).trim() ||
          !String(values.get("subject")).trim()
        )
          throw Error("Enter a class or activity and a subject.");
        return {
          operationId: crypto.randomUUID(),
          bookingId: booking.bookingId,
          revision: booking.revision,
          date: values.get("date"),
          startPeriod: start,
          endPeriod: end,
          classOrActivity: values.get("classOrActivity"),
          subject: values.get("subject"),
          remarks: values.get("remarks"),
          ...(group
            ? {
                bookingGroup: structuredClone(group),
                requestedQuantity: Number(values.get("requestedQuantity")),
              }
            : {
                items: booking.items.map((item, index) => ({
                  resourceId: item.resourceId,
                  quantity: Number(values.get("quantity" + index)),
                })),
              }),
          headphones: booking.headphones === true,
          styluses: booking.styluses === true,
          deviceType: booking.deviceType || "",
          bufferOverrideReason: booking.bufferOverrideReason || "",
        };
      },
      "Save booking changes",
      "Your booking changes are confirmed saved.",
    );
  }

  async function openIncident() {
    if (!active) return;
    const view = modal("gsisLordIncidentResponse", "Respond to an incident");
    if (!view) return;
    if (pending.incident) {
      renderIncident(view, pending.incident.viewed);
      return;
    }
    if (!incidentId || !token) {
      message(
        view.status,
        "Open the complete incident response link provided to you.",
        true,
      );
      return;
    }
    message(view.status, "Verifying your incident response link…");
    try {
      await currentSession();
      const context = await api.request(
        "lord",
        "/incidents/respond-context?incidentId=" +
          encodeURIComponent(incidentId),
        { headers: { "X-GSiS-Incident-Token": token } },
      );
      if (!active || !view.dialog.isConnected) return;
      if (
        context.incidentId !== incidentId ||
        context.staffId !== session.user.staffId ||
        !Number.isSafeInteger(context.revision)
      )
        throw Error(
          "This incident response is not available to your staff account.",
        );
      renderIncident(view, context);
    } catch (error) {
      message(view.status, error.message, true);
    }
  }
  function renderIncident(view, context) {
    if (
      context.staffId !== session.user.staffId ||
      !Number.isSafeInteger(context.revision)
    ) {
      message(
        view.status,
        "This incident response is not available to your staff account.",
        true,
      );
      return;
    }
    view.content.replaceChildren();
    view.content.append(
      element("p", "Incident " + context.incidentId + " · " + context.status),
    );
    if (context.bookingId)
      view.content.append(element("p", "Booking " + context.bookingId));
    view.content.append(incidentDetails(context.details));
    if (context.response?.text)
      view.content.append(
        element("p", "Previous response: " + context.response.text),
      );
    if (context.status === "resolved" && !pending.incident) {
      message(view.status, "This incident is already resolved.");
      return;
    }
    const form = element("form", undefined, { "data-lord-incident-form": "" }),
      fields = element("fieldset");
    fields.style.border = "0";
    fields.style.padding = "0";
    field(
      fields,
      "response",
      "Your response",
      pending.incident?.body.response || "",
      { rows: "5", maxlength: "4000", required: "" },
      "textarea",
    );
    form.append(fields);
    view.content.append(form);
    installSubmission(
      view,
      form,
      fields,
      "incident",
      "/incidents/respond",
      context,
      () => {
        const response = String(new FormData(form).get("response"));
        if (!response.trim())
          throw Error("Enter your response before sending it.");
        return {
          operationId: crypto.randomUUID(),
          incidentId: context.incidentId,
          revision: context.revision,
          token,
          response,
        };
      },
      "Send response",
      "Your incident response is confirmed recorded.",
    );
  }

  function installSubmission(
    view,
    form,
    fields,
    kind,
    path,
    viewed,
    makeBody,
    label,
    success,
  ) {
    const submit = element("button", label, {
      type: "submit",
      class: "primary",
      "data-lord-submit": "",
    });
    const check = button(
      "Check original receipt",
      "data-lord-check-receipt",
      () => send(true),
    );
    const actions = element("div", undefined, { class: "gsis-actions" });
    actions.append(submit, check);
    form.append(actions);
    function update() {
      fields.disabled = submitting[kind] || !!pending[kind];
      submit.disabled = submitting[kind];
      submit.textContent = pending[kind]?.cleanupPrepared
        ? "Retry local cleanup"
        : pending[kind]
          ? "Retry the same request"
          : label;
      check.hidden = !pending[kind] || !!pending[kind].cleanupPrepared;
      check.disabled = submitting[kind];
    }
    function uncertain(error) {
      if (pending[kind]?.cleanupPrepared) {
        message(
          forms[kind].status,
          (error ? error.message + " " : "") +
            "This new request was not sent. Restore browser storage, then retry local cleanup before editing. Reference: " +
            pending[kind].body.operationId,
          true,
        );
        return;
      }
      message(
        forms[kind].status,
        (error ? error.message + " " : "") +
          "The outcome is not confirmed. Your original request is retained. Check its receipt or retry the same request. Reference: " +
          pending[kind].body.operationId,
        true,
      );
    }
    async function send(checkOnly = false) {
      if (submitting[kind] || !active || (checkOnly && !pending[kind])) return;
      if (!pending[kind] && !form.reportValidity()) return;
      submitting[kind] = true;
      let prepared = null,
        createdAttempt = null;
      const ownsView = () =>
        active &&
        view.dialog.isConnected &&
        view.dialog.open &&
        forms[kind]?.form === form;
      try {
        // FormData omits disabled controls. Capture the new draft before the
        // submitting guard disables the fieldset, then retain it across awaits.
        const candidate = pending[kind] ? null : makeBody();
        update();
        await currentSession();
        if (!ownsView()) return;
        if (pending[kind]?.cleanupPrepared) {
          const local = pending[kind];
          if (!local.cleanupDone) {
            if (!api.releasePrepared(local.cleanupPrepared))
              throw Error(
                "The original local preparation cannot be cleared in this context.",
              );
            local.cleanupDone = true;
          }
          persist(kind, null);
          message(
            forms[kind].status,
            "The unsent preparation was cleared. Review the form before submitting.",
          );
          return;
        }
        if (!pending[kind]) {
          const body = candidate;
          if (kind === "booking")
            prepared = await api.prepareLordBookingRequest(
              "/api/lord" + path,
              body,
              { fresh: true },
            );
          if (!ownsView()) {
            if (prepared) api.releasePrepared(prepared);
            return;
          }
          createdAttempt = {
            viewed: structuredClone(viewed),
            body: prepared ? structuredClone(prepared.body) : body,
          };
          persist(kind, createdAttempt);
        }
        update();
        const attempt = pending[kind];
        message(
          forms[kind].status,
          checkOnly
            ? "Checking the original receipt…"
            : "Waiting for confirmation…",
        );
        const checked =
          checkOnly && kind === "booking"
            ? await api.checkLordBookingReceipt(attempt.body, {
                path: "/api/lord" + path,
              })
            : null;
        const result = checked
          ? checked.result
          : checkOnly
            ? await api.request(
                "lord",
                "/receipt?operationId=" +
                  encodeURIComponent(attempt.body.operationId),
              )
            : await api.request("lord", path, {
                method: "POST",
                body: structuredClone(attempt.body),
                prepared,
                retainedAttempt: kind === "booking" && !prepared,
              });
        if (
          !active ||
          pending[kind] !== attempt ||
          forms[kind]?.targetId !==
            (attempt.viewed.bookingId || attempt.viewed.incidentId)
        )
          return;
        const receipt = result?.receipt || result;
        if (
          kind === "booking" &&
          (checked
            ? !checked.verified
            : attempt.body.bookingGroup &&
              !api.verifyLordBookingReceipt(attempt.body.operationId, receipt))
        ) {
          uncertain(
            Error("The receipt does not match the original booking request."),
          );
          return;
        }
        if (
          kind === "booking" &&
          ["terminal-not-committed", "aborted"].includes(
            result?.state || result?.receipt?.state,
          )
        ) {
          persist(kind, null);
          forms[kind].form.remove();
          message(
            forms[kind].status,
            "The original booking change was not saved. Reload the current booking before making a new request.",
          );
          const currentView = forms[kind].view;
          const reload = button(
            "Reload current booking",
            "data-lord-reload-booking",
            async () => {
              reload.disabled = true;
              try {
                await currentSession();
                const fresh = await api.request(
                  "lord",
                  "/bookings/get?bookingId=" +
                    encodeURIComponent(viewed.bookingId),
                );
                if (!active || !currentView.dialog.isConnected) return;
                renderBooking(currentView, fresh.booking);
              } catch (error) {
                message(currentView.status, error.message, true);
                reload.disabled = false;
              }
            },
          );
          currentView.content.append(reload);
          return;
        }
        if (!committed(result)) {
          uncertain();
          return;
        }
        persist(kind, null);
        forms[kind].form.remove();
        message(forms[kind].status, success);
      } catch (error) {
        if (!active) return;
        let released = false;
        prepared ||= error.prepared || null;
        if (prepared) {
          try {
            released = api.releasePrepared(prepared);
          } catch (cleanup) {
            error = cleanup;
            const retained = createdAttempt || {
              viewed: structuredClone(viewed),
              body: structuredClone(prepared.body),
            };
            // The opaque handle proves only this live, undispatched preparation.
            // Never serialize that proof or promote a restored draft to unsent.
            Object.defineProperty(retained, "cleanupPrepared", {
              value: prepared,
              configurable: true,
            });
            pending[kind] = retained;
          }
        }
        if (released && pending[kind] === createdAttempt) {
          try {
            persist(kind, null);
          } catch (storage) {
            error = storage;
          }
        }
        if (!ownsView()) return;
        if (
          kind !== "booking" &&
          pending[kind] &&
          !checkOnly &&
          invalidInput(error)
        ) {
          persist(kind, null);
          message(
            forms[kind].status,
            error.message + " Review the form before submitting again.",
            true,
          );
        } else if (pending[kind]) uncertain(error);
        else message(forms[kind].status, error.message, true);
      } finally {
        submitting[kind] = false;
        if (active) forms[kind].update();
      }
    }
    form.onsubmit = (event) => {
      event.preventDefault();
      send();
    };
    forms[kind] = {
      form,
      status: view.status,
      update,
      view,
      targetId: viewed.bookingId || viewed.incidentId,
    };
    update();
    if (pending[kind]) uncertain();
    else
      message(
        view.status,
        kind === "booking"
          ? "Review the current booking, then save your changes."
          : "Your response is recorded against the incident shown here.",
      );
  }

  window.addEventListener("gsis:clear-protected-state", () => {
    active = false;
    pending.booking = pending.incident = null;
    if (storageKey) {
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
    }
    for (const dialog of dialogs) {
      dialog.close();
      dialog.remove();
    }
    dialogs.clear();
    panel?.remove();
  });
  async function start() {
    session = await api.getSession();
    if (!active || !permitted(session)) return;
    storageKey =
      "gsis-lord-user:" + session.schoolId + ":" + session.user.accountId;
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      const saved = JSON.parse(stored);
      for (const kind of ["booking", "incident"]) {
        const value = saved[kind];
        if (
          value?.body?.operationId &&
          value.viewed?.staffId === session.user.staffId
        )
          pending[kind] = value;
      }
    }
    panel = element("section", undefined, {
      id: "gsisLordUser",
      class: "gsis-panel",
      "aria-label": "Your LORD records",
    });
    panel.append(
      button("Edit my bookings", "data-lord-edit-bookings", openBookings),
    );
    if (incidentId || pending.incident)
      panel.append(
        button("Respond to incident", "data-lord-open-incident", openIncident),
      );
    const bar = document.querySelector(".gsis-suitebar");
    if (bar) bar.after(panel);
    else document.body.prepend(panel);
    if (incidentId || pending.incident) await openIncident();
  }
  start().catch((error) => {
    if (!active) return;
    const notice = element(
      "p",
      "LORD editing is unavailable: " + error.message,
      { class: "gsis-panel gsis-error", role: "status" },
    );
    document.body.prepend(notice);
  });
})();
