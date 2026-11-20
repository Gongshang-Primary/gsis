/* v1-owned absence-clash confirmation helper. Preserves drafts on cancel and binds explicit confirmation to the live conflict token. */
(function (global) {
  "use strict";
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[ch]);
  }
  function isClashError(error) {
    const code = error?.code || error?.body?.error?.code;
    return (
      code === "ABSENCE_CLASH_CONFIRM_REQUIRED" ||
      code === "ABSENCE_CLASH_CHANGED"
    );
  }
  function extractClashDetails(error) {
    const details = error?.details || error?.body?.error?.details || {};
    if (!details.conflictToken || !Array.isArray(details.conflicts)) return null;
    return {
      code: error?.code || error?.body?.error?.code || "ABSENCE_CLASH_CONFIRM_REQUIRED",
      changed: details.conflictChanged === true,
      conflictToken: details.conflictToken,
      conflicts: details.conflicts,
    };
  }
  function promptReplacement(clash) {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "gsis-v1-absence-clash-dialog";
      dialog.setAttribute("aria-label", "Confirm replacing overlapping absence");
      const rows = clash.conflicts
        .map((row) => {
          const scope =
            row.coverage?.kind === "fullDay"
              ? "Full day"
              : Array.isArray(row.periods) && row.periods.length
                ? "Periods " + row.periods.join(", ")
                : "Overlapping time";
          return (
            "<li><strong>" +
            esc(row.name || row.staffId) +
            "</strong> · " +
            esc(row.date) +
            " · " +
            esc(row.typeLabel || row.typeId) +
            " (" +
            esc(scope) +
            ")</li>"
          );
        })
        .join("");
      dialog.innerHTML =
        "<h2>" +
        (clash.changed
          ? "Conflicting absences changed — confirm replacement again"
          : "Replace overlapping absence?") +
        "</h2>" +
        "<p>Only the conflicting absence record(s) listed below will be superseded and retained in history. Completed duties, unrelated absences and your draft remain protected.</p>" +
        "<ul>" +
        rows +
        "</ul>" +
        '<div class="gsis-v1-dialog-actions">' +
        '<button type="button" data-clash-confirm>Replace conflicting absence</button> ' +
        '<button type="button" data-clash-cancel>Cancel and keep draft</button>' +
        "</div>";
      function finish(confirmed) {
        try {
          dialog.close();
        } catch {}
        dialog.remove();
        resolve(
          confirmed
            ? { confirmed: true, conflictToken: clash.conflictToken }
            : { confirmed: false },
        );
      }
      dialog
        .querySelector("[data-clash-confirm]")
        .addEventListener("click", () => finish(true));
      dialog
        .querySelector("[data-clash-cancel]")
        .addEventListener("click", () => finish(false));
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        finish(false);
      });
      document.body.appendChild(dialog);
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    });
  }
  global.GSISV1RosterAbsenceClash = Object.freeze({
    isClashError,
    extractClashDetails,
    promptReplacement,
    buildConfirmedPayload(payload, conflictToken) {
      return {
        ...payload,
        confirmReplace: true,
        conflictToken,
        operationId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
      };
    },
  });
})(window);
