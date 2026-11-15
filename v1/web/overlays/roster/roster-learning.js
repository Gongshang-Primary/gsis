/* Read-only guidance reflects the same versioned policy consumed by the v1 engine. */
window.RosterLearningUI = (() => {
  let generation = 0;
  const text = (tag, value) => {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  };
  const labels = {
    dailyCapacity:
      "Daily capacity: fewer occupied periods, then more usable relief capacity",
    alternatives: "Fewer alternative relief periods",
    weeklyRemaining: "More verified weekly R remaining",
    rotation: "Rotation order",
    subjectMatch: "Same teaching subject",
    levelMatch: "Same teaching level",
  };
  async function render(context) {
    const ticket = ++generation,
      host = context.container;
    host.replaceChildren(text("h2", "Learn about Auto Allocation"));
    const calculations = document.createElement("section");
    host.append(calculations);
    void window.RosterCalculationsUI?.render({
      ...context,
      container: calculations,
    });
    const rules = document.createElement("section");
    rules.className = "allocation-learning";
    host.append(rules);
    rules.append(text("p", "Loading the saved allocation policy…"));
    try {
      const saved = await window.GSISV1.request("roster", "/layers");
      if (ticket !== generation || !host.isConnected) return;
      const policy = saved.policy;
      if (!policy || !Array.isArray(policy.layers))
        throw Error("The current policy could not be verified.");
      rules.replaceChildren(
        text("h3", "Current business rules"),
        text("p", "Revision " + saved.revision + " · " + policy.version),
        text(
          "p",
          "The engine works through layers in order. Manual commitments, accepted peer arrangements and started duties stay protected. Auto Fill Blank retains every assignment. Auto Allocate may reorganise movable automatic assignments.",
        ),
      );
      for (const [index, layer] of policy.layers.entries()) {
        const card = document.createElement("section");
        card.className = "settings-panel";
        card.append(
          text("h3", "Layer " + (index + 1) + " · " + layer.groups.join(", ")),
          text(
            "p",
            layer.spiral
              ? "Spiral rounds give eligible people at a lower current relief count their next opportunity first."
              : "The saved preference order is recomputed after each assignment.",
          ),
        );
        const constraints = document.createElement("ul");
        for (const [field, name] of [
          ["maxTotal", "Occupied periods"],
          ["maxRelief", "Relief periods"],
          ["maxConsecutive", "Consecutive periods"],
        ])
          constraints.append(
            text(
              "li",
              name +
                ": " +
                (layer[field] === null ? "limit disabled" : layer[field]),
            ),
          );
        for (const [subject, length] of Object.entries(layer.continuity))
          constraints.append(
            text(
              "li",
              subject +
                ": keep a complete " +
                length +
                "-period lesson block with one eligible teacher",
            ),
          );
        card.append(constraints, text("h4", "Preference order"));
        const order = document.createElement("ol");
        for (const key of layer.preferences)
          order.append(text("li", labels[key] || key));
        card.append(order);
        rules.append(card);
      }
      rules.append(
        text(
          "p",
          "A consecutive-count break still occupies its period and cannot receive relief. Missing or unverified workload does not become zero quota. Bounded backfill may move automatic assignments to cover a gap while preserving higher-layer usage and all enabled constraints. An unresolved gap is shown explicitly.",
        ),
      );
      const prompt = text(
        "textarea",
        "Explain this recorded GSiS relief allocation using only the supplied run evidence and the saved policy below. Distinguish manual decisions, peer arrangements, exclusions, rule comparisons, bounded search and unresolved lessons. Do not invent a reason unsupported by evidence.\n\n" +
          JSON.stringify(policy, null, 2),
      );
      prompt.readOnly = true;
      prompt.rows = 12;
      prompt.setAttribute(
        "aria-label",
        "Explanation prompt with current rules",
      );
      const copy = text("button", "Copy explanation prompt");
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(prompt.value);
          copy.textContent = "Copied";
        } catch {
          prompt.focus();
          prompt.select();
          copy.textContent = "Select and copy the prompt";
        }
      };
      rules.append(
        text("h3", "Understand an allocation log"),
        text(
          "p",
          "Use the authorised run log for the date and operation you are reviewing. This prompt includes the current saved policy; a historical run must use its frozen policy instead.",
        ),
        prompt,
        copy,
      );
    } catch (error) {
      if (ticket !== generation) return;
      rules.replaceChildren(text("p", error.message));
      const retry = text("button", "Retry current rules");
      retry.onclick = () => render(context);
      rules.append(retry);
    }
  }
  return {
    render,
    unmount() {
      generation++;
      window.RosterCalculationsUI?.unmount();
    },
  };
})();
