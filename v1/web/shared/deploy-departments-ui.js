import {
  departmentReferences,
  proposedDepartmentMoves,
  applyDepartmentMoves,
  retainedDepartmentConflicts,
} from "./deploy-departments.mjs";
import { planningEligible } from "./deploy-eligibility.mjs";

// Dept moves use the existing draft queue, owner command and recovery flow.
(function () {
  let epoch = 0;
  const dialogs = new Set();
  addEventListener("gsis:clear-protected-state", () => {
    epoch++;
    for (const dialog of dialogs) dialog.remove();
    dialogs.clear();
  });
  function install() {
    if (!window.GSISV1 || typeof window.groupStage !== "function") return;
    const originalStage = window.groupStage;
    const originalPage = window.groupPage;
    const originalWire = window.saveWireEdits;
    const clone = value => structuredClone(value);
    const departments = () => v()?.organisations?.dept || [];
    const name = staffId => v()?.teachers?.find(t => t.id === staffId)?.name || staffId;

    function checkMove(before, value, moves) {
      // Keep within-Dept uniqueness without re-rejecting unchanged historical
      // exclusions. The native owner separately checks every new binding.
      for (const group of value) {
        const used = new Set();
        for (const ref of departmentReferences([group])) {
          if (used.has(ref.staffId)) throw Error("A teacher may appear only once within a group.");
          used.add(ref.staffId);
        }
      }
      const previous = departmentReferences(before);
      for (const move of moves) {
        const target = departmentReferences(value).find(ref => ref.staffId === move.staffId && ref.departmentId === move.targetDepartmentId);
        const retained = previous.some(ref => ref.staffId === target.staffId && ref.departmentId === target.departmentId &&
          ref.field === target.field && ref.index === target.index);
        if (retained) continue;
        if (!planningEligible(v(), v().teachers.find(t => t.id === move.staffId)))
          throw Error("Choose an active eligible teacher for a new department assignment.");
        if (target.position === "TL" && !window.GSISPlanning.tlEligible(v(), move.staffId))
          throw Error("Department TLs must be active eligible ST, LT or MTT teachers.");
      }
    }

    function confirmMove(before, proposed, moves) {
      const version = v().id, started = epoch, baseline = JSON.stringify(before);
      const value = applyDepartmentMoves(proposed, moves);
      checkMove(before, value, moves);
      const dialog = document.createElement("dialog");
      dialog.dataset.departmentMove = "";
      dialog.setAttribute("aria-label", "Move to this department");
      const title = document.createElement("h2");
      title.textContent = "Move to this department";
      dialog.append(title);
      for (const move of moves) {
        const p = document.createElement("p");
        const sources = [...new Set(move.previous.filter(ref => ref.departmentId !== move.targetDepartmentId)
          .map(ref => ref.departmentName + " (" + ref.position + ")"))];
        const target = move.target[0];
        p.textContent = name(move.staffId) + ": remove " + sources.join(", ") +
          "; assign to " + target.departmentName + " (" + target.position + ").";
        dialog.append(p);
      }
      const note = document.createElement("p");
      note.textContent = "This changes your draft. Use Save to online when ready.";
      const status = document.createElement("p");
      status.setAttribute("role", "alert");
      const footer = document.createElement("footer");
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.onclick = () => dialog.close();
      const apply = document.createElement("button");
      apply.type = "button";
      apply.className = "primary";
      apply.textContent = "Move to this department";
      apply.onclick = () => {
        try {
          if (epoch !== started || v()?.id !== version || JSON.stringify(departments()) !== baseline)
            throw Error("Department assignments changed. Close this prompt and review the current assignments before confirming again.");
          if (!window.GSISV1.capable("deploy.edit")) throw Error("Current Deploy edit access is required.");
          checkMove(before, value, moves);
          window.queueCell({ operation: "setOrganisation", kind: "dept", value,
            expected: clone(before), departmentMove: true });
          dialog.close();
          window.render();
        } catch (error) { status.textContent = error.message; }
      };
      footer.append(cancel, apply);
      dialog.append(note, status, footer);
      dialog.addEventListener("close", () => { dialogs.delete(dialog); dialog.remove(); }, { once: true });
      dialogs.add(dialog);
      document.body.append(dialog);
      dialog.showModal();
    }

    window.groupStage = (kind, value) => {
      if (kind !== "dept") return originalStage(kind, value);
      try {
        const before = clone(departments());
        const moves = proposedDepartmentMoves(before, value);
        if (!moves.length) return originalStage(kind, value);
        confirmMove(before, value, moves);
        return false;
      } catch (error) { alert(error.message); return false; }
    };

    window.saveWireEdits = edits => {
      const wire = originalWire(edits);
      const move = edits.find(edit => edit.operation === "setOrganisation" && edit.kind === "dept" && edit.departmentMove);
      if (!move) return wire;
      // A confirmed move reads all prior Dept positions. Keep the full expected
      // graph so a concurrent membership cannot escape a field-only patch.
      return wire.map(edit => edit.operation === "patchPlanning" && edit.source === "setOrganisation" && edit.kind === "dept"
        ? { operation: "setOrganisation", kind: "dept", expected: clone(move.expected), value: clone(move.value) }
        : edit);
    };

    window.groupPage = (root, kind, settings) => {
      originalPage(root, kind, settings);
      if (kind !== "dept") return;
      if (!settings) {
        const hint = root.querySelector("p.hint");
        if (hint) hint.textContent = "Each teacher belongs to one department. Choosing another department offers a confirmed move. Blank leadership positions are allowed. Existing multiple-department records are retained for review.";
      }
      const before = clone(departments());
      const conflicts = retainedDepartmentConflicts(before);
      if (!conflicts.length) return;
      const review = document.createElement("section");
      review.dataset.departmentReview = "";
      const title = document.createElement("p");
      title.className = "warning-text";
      title.setAttribute("role", "status");
      title.textContent = "Some teachers are recorded in several departments. Existing assignments remain until you explicitly move or remove them.";
      review.append(title);
      const references = departmentReferences(before);
      for (const conflict of conflicts) {
        const row = document.createElement("p");
        row.append(document.createTextNode(name(conflict.staffId) + ": "));
        for (const targetDepartmentId of conflict.departmentIds) {
          const target = references.filter(ref => ref.staffId === conflict.staffId && ref.departmentId === targetDepartmentId);
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Move to " + target[0].departmentName;
          button.disabled = !window.GSISV1.capable("deploy.edit") || target.length !== 1;
          button.onclick = () => {
            try { confirmMove(before, before, [{ staffId: conflict.staffId, targetDepartmentId,
              previous: references.filter(ref => ref.staffId === conflict.staffId), target }]); }
            catch (error) { alert(error.message); }
          };
          row.append(button);
        }
        review.append(row);
      }
      root.prepend(review);
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
