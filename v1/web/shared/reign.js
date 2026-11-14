/* Owner-reviewed close, archive, preview and explicit cleanup remain separate actions. */
(function () {
  "use strict";
  const api = window.GSISV1;
  if (!api || api.module !== "overlord") return;
  const operations = new Map();
  async function write(path, body) {
    const key = path + "|" + JSON.stringify(body);
    let pending = operations.get(key);
    if (!pending) {
      pending = { operationId: crypto.randomUUID(), ...body };
      operations.set(key, pending);
    }
    try {
      const r = await api.request("lord", path, {
        method: "POST",
        body: pending,
      });
      if (r.receipt?.state !== "committed" && r.state !== "committed")
        throw Error(
          "The operation is not confirmed. Retry to recover its receipt.",
        );
      operations.delete(key);
      return r;
    } catch (error) {
      try {
        const receipt = await api.request(
          "lord",
          "/receipt?operationId=" + encodeURIComponent(pending.operationId),
        );
        if (receipt?.state === "aborted") operations.delete(key);
      } catch {}
      throw error;
    }
  }
  window.GSISV1Reign = { open };
  async function open() {
    if (document.getElementById("reignModal")) return;
    const modal = document.createElement("dialog");
    modal.id = "reignModal";
    modal.className = "modal-backdrop";
    modal.innerHTML =
      '<section class="editor-card reign-card"><div class="editor-heading"><div><span class="reign-kicker">REIGN</span><h2>Close, celebrate and archive</h2></div><button type="button" data-close aria-label="Close REIGN">×</button></div><p>Close the logging period, keep its Wrapped recap and a complete recovery package in Google Drive, then review optional cleanup. Active, future and unresolved records stay live. Nothing is cleared by closing or exporting.</p><p role="status" data-status></p><div data-current></div><h3>Closed periods and recovery</h3><div data-archives></div></section>';
    document.body.append(modal);
    modal.showModal();
    modal.querySelector("[data-close]").onclick = () => {
      if (!modal.dataset.busy) modal.close();
    };
    modal.onclose = () => modal.remove();
    const status = modal.querySelector("[data-status]"),
      current = modal.querySelector("[data-current]"),
      archiveHost = modal.querySelector("[data-archives]");
    function button(label, fn) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.onclick = () => run(fn);
      return b;
    }
    async function run(fn) {
      if (modal.dataset.busy) return;
      modal.dataset.busy = "true";
      const controls = [...modal.querySelectorAll("button")];
      controls.forEach((b) => (b.disabled = true));
      status.textContent = "Working…";
      try {
        await fn();
      } catch (error) {
        status.textContent =
          error.message + " No unconfirmed step is reported as complete.";
      } finally {
        delete modal.dataset.busy;
        controls
          .filter((b) => b.isConnected)
          .forEach((b) => (b.disabled = false));
      }
    }
    function confirmation(host, label, expected, fn) {
      const line = document.createElement("label"),
        input = document.createElement("input");
      line.textContent = "Type " + expected + " to confirm";
      input.autocomplete = "off";
      line.append(input);
      const go = button(label, async () => {
        if (input.value !== expected)
          throw Error("Type the exact confirmation shown.");
        await fn(input.value);
      });
      host.append(line, go);
    }
    async function load() {
      const [preview, history] = await Promise.all([
        api.request("lord", "/reign/preview"),
        api.request("lord", "/reign/archives"),
      ]);
      current.replaceChildren();
      const summary = document.createElement("p");
      summary.textContent =
        "Current period: " +
        preview.periodId +
        " · " +
        (preview.statistics?.bookings || 0) +
        " bookings · " +
        preview.preservedFutureBookings +
        " future bookings preserved.";
      current.append(summary);
      if (preview.blockers?.length) {
        const blocked = document.createElement("p");
        blocked.textContent =
          "Closing waits for: " +
          preview.blockers.map((b) => b.code).join(", ");
        current.append(blocked);
      } else
        confirmation(
          current,
          "Close period and create private recap",
          preview.confirmationText,
          async (text) => {
            await write("/reign/close", {
              periodId: preview.periodId,
              revision: preview.revision,
              sourceVersion: preview.sourceVersion,
              confirmation: text,
            });
            await load();
            status.textContent =
              "Period closed. All records are retained. Choose its Google archive action below.";
          },
        );
      archiveHost.replaceChildren();
      for (const period of history.closedPeriods || []) {
        const section = document.createElement("section"),
          title = document.createElement("h4");
        title.textContent = period.period_id;
        section.append(title);
        section.append(
          button("Prepare and verify Google recovery archive", async () => {
            const prepared = await write("/reign/archive/prepare", {
              periodId: period.period_id,
            });
            if (["cleanup-pending", "complete"].includes(prepared.state)) {
              await load();
              status.textContent = "This archive already has a cleanup record.";
              return;
            }
            const result = await write("/reign/archive/export", {
              archiveId: prepared.archiveId,
            });
            await load();
            status.textContent =
              "Google recovery files verified. Records are retained until separate cleanup confirmation.";
            const links = document.createElement("p");
            for (const file of result.files || []) {
              const a = document.createElement("a");
              a.href = file.url;
              a.target = "_blank";
              a.rel = "noopener";
              a.textContent = file.name;
              links.append(a, document.createElement("br"));
            }
            archiveHost.prepend(links);
          }),
        );
        for (const archive of (history.archives || []).filter(
          (a) => a.period_id === period.period_id,
        )) {
          const row = document.createElement("p");
          row.textContent = "Recovery: " + archive.state;
          section.append(row);
          if (archive.state === "verified")
            section.append(
              button("Review exact cleanup", async () => {
                const p = await api.request(
                  "lord",
                  "/reign/cleanup/preview?archiveId=" +
                    encodeURIComponent(archive.archive_id),
                );
                const view = document.createElement("section"),
                  explanation = document.createElement("p");
                explanation.textContent =
                  p.eligibleBookingIds.length +
                  " completed/cancelled bookings and " +
                  p.photos.length +
                  " photographs eligible. " +
                  p.preservedBookings +
                  " bookings stay live. Inventory, settings, staff references, archives and operation/audit receipts are retained.";
                view.append(explanation);
                const list = document.createElement("details"),
                  listSummary = document.createElement("summary"),
                  ids = document.createElement("pre");
                listSummary.textContent = "Exact booking IDs";
                ids.textContent = p.eligibleBookingIds.join("\n") || "None";
                list.append(listSummary, ids);
                view.append(list);
                if (p.blockers.length) {
                  const note = document.createElement("p");
                  note.textContent =
                    "Cleanup blocked: " +
                    p.blockers
                      .map((b) => b.code + " (" + b.count + ")")
                      .join(", ");
                  view.append(note);
                } else
                  confirmation(
                    view,
                    "Clear these eligible records",
                    p.confirmationText,
                    async (text) => {
                      const result = await write("/reign/cleanup", {
                        archiveId: archive.archive_id,
                        previewDigest: p.previewDigest,
                        confirmation: text,
                      });
                      status.textContent =
                        "Eligible database records cleared; checking photograph cleanup…";
                      await write("/reign/cleanup/finish", {
                        archiveId: result.archiveId,
                      });
                      await load();
                      status.textContent =
                        "Confirmed cleanup completed. Google recovery files and minimal receipts are retained.";
                    },
                  );
                section.querySelector("[data-cleanup-preview]")?.remove();
                view.dataset.cleanupPreview = "";
                section.append(view);
                status.textContent =
                  "Google files reverified. Review the exact cleanup before confirming.";
              }),
            );
          if (archive.state === "cleanup-pending")
            section.append(
              button("Resume verified photograph cleanup", async () => {
                await write("/reign/cleanup/finish", {
                  archiveId: archive.archive_id,
                });
                await load();
                status.textContent =
                  "Remaining photograph cleanup is confirmed complete.";
              }),
            );
        }
        archiveHost.append(section);
      }
      if (!(history.closedPeriods || []).length)
        archiveHost.textContent = "No closed logging periods yet.";
    }
    await run(load);
  }
})();
